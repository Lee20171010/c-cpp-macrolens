import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MacroParser } from './macroParser';
import { DATABASE_CONSTANTS, FILE_PATTERNS, REGEX_PATTERNS } from '../utils/constants';

export interface MacroDef {
    name: string;
    params?: string[];
    body: string;
    file: string;
    line: number;
    isDefine?: boolean;  // true = #define macro, false/undefined = typedef/struct/enum/etc
}

interface DatabaseInterface {
    prepare(sql: string): any;
    exec(sql: string): any;
    close(): void;
}

class InMemoryDatabase implements DatabaseInterface {
    private macros: Map<string, MacroDef[]> = new Map();

    prepare(sql: string): any {
        // Return a prepared statement object that mimics SQLite API
        return {
            run: (...args: any[]) => this.executeQuery(sql, args, 'run'),
            get: (...args: any[]) => this.executeQuery(sql, args, 'get'),
            all: (...args: any[]) => this.executeQuery(sql, args, 'all')
        };
    }

    exec(sql: string): any {
        if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX')) {
            // Silently ignore DDL statements
            return;
        }
        if (sql.includes('BEGIN TRANSACTION') || sql.includes('COMMIT') || sql.includes('ROLLBACK')) {
            // Simulate transaction support
            return;
        }
        return this.executeQuery(sql, [], 'exec');
    }

    close(): void {
        this.macros.clear();
    }

    private executeQuery(sql: string, args: any[], type: string): any {
        try {
            // Normalize arguments - handle both array and object parameters
            const params = this.normalizeParams(args);
            
            if (sql.includes('INSERT INTO macros')) {
                return this.handleInsert(params);
            } else if (sql.includes('SELECT') && sql.includes('FROM macros')) {
                return this.handleSelect(params, type);
            } else if (sql.includes('DELETE FROM macros')) {
                return this.handleDelete(sql, params);
            }
            
            // Unknown query type - return safe defaults
            return type === 'get' ? undefined : type === 'all' ? [] : { changes: 0 };
        } catch (error) {
            console.warn('InMemoryDatabase query error:', error);
            return type === 'get' ? undefined : type === 'all' ? [] : { changes: 0 };
        }
    }

    /**
     * Normalize parameters from various formats to a consistent object
     */
    private normalizeParams(args: any[]): any {
        if (args.length === 0) {
            return {};
        }
        
        // If first argument is an object with named properties, use it directly
        if (args.length === 1 && typeof args[0] === 'object' && !Array.isArray(args[0])) {
            return args[0];
        }
        
        // Convert positional parameters to named parameters for INSERT
        // Expected order: name, params, body, file, line, isDefine
        if (args.length >= 4) {
            return {
                name: args[0],
                params: args[1],
                body: args[2],
                file: args[3],
                line: args[4] || 0,
                isDefine: args[5]
            };
        }
        
        // For SELECT/DELETE queries with single parameter
        // Could be a macro name or a file path - use generic 'file' key
        // The handleDelete method will check the SQL to determine usage
        if (args.length === 1) {
            return { 
                name: args[0],  // For SELECT queries by name
                file: args[0]   // For DELETE queries by file
            };
        }
        
        return {};
    }

    private handleInsert(params: any): any {
        const name = params.name;
        if (!name || typeof name !== 'string') {
            console.warn('InMemoryDatabase: Invalid macro name in INSERT');
            return { changes: 0 };
        }

        if (!this.macros.has(name)) {
            this.macros.set(name, []);
        }

        // Parse params field - could be comma-separated string or null
        let paramsList: string[] | undefined;
        if (params.params) {
            if (typeof params.params === 'string') {
                paramsList = params.params.split(',').map((p: string) => p.trim()).filter(Boolean);
            } else if (Array.isArray(params.params)) {
                paramsList = params.params;
            }
        }

        const def = {
            name: name,
            params: paramsList,
            body: String(params.body || ''),
            file: String(params.file || ''),  // Already converted to relative by caller
            line: Number(params.line) || 0,
            isDefine: params.isDefine !== undefined ? Boolean(params.isDefine) : undefined
        };
        
        this.macros.get(name)!.push(def);

        return { changes: 1 };
    }

    private handleSelect(params: any, type: string): any {
        const name = params.name;
        
        // SELECT all macros (no WHERE clause)
        if (!name) {
            const allResults: any[] = [];
            for (const [macroName, defs] of this.macros.entries()) {
                for (const def of defs) {
                    allResults.push({
                        name: def.name,
                        params: def.params?.join(',') || null,
                        body: def.body,
                        file: def.file,
                        line: def.line,
                        isDefine: def.isDefine
                    });
                }
            }
            return type === 'get' ? allResults[0] : allResults;
        }
        
        // SELECT specific macro by name
        if (this.macros.has(name)) {
            const results = this.macros.get(name)!.map(def => ({
                name: def.name,
                params: def.params?.join(',') || null,
                body: def.body,
                file: def.file,
                line: def.line,
                isDefine: def.isDefine
            }));
            return type === 'get' ? results[0] : results;
        }
        
        return type === 'get' ? undefined : [];
    }

    private handleDelete(sql: string, params: any): any {
        if (sql.includes('WHERE file')) {
            // DELETE FROM macros WHERE file = ?
            // Delete all macros from a specific file
            const fileToDelete = params.file || (Array.isArray(params) ? params[0] : params);
            let deletedCount = 0;
            
            if (fileToDelete) {
                // Iterate through all macros and remove those matching the file
                for (const [name, defs] of this.macros.entries()) {
                    const initialLength = defs.length;
                    const filtered = defs.filter(def => def.file !== fileToDelete);
                    
                    if (filtered.length === 0) {
                        // No definitions left for this macro, remove the entire entry
                        this.macros.delete(name);
                        deletedCount += initialLength;
                    } else if (filtered.length < initialLength) {
                        // Some definitions removed
                        this.macros.set(name, filtered);
                        deletedCount += (initialLength - filtered.length);
                    }
                }
            }
            
            return { changes: deletedCount };
        } else if (sql.includes('WHERE name')) {
            // DELETE FROM macros WHERE name = ?
            // Delete all definitions of a specific macro name
            const name = params.name || (Array.isArray(params) ? params[0] : params);
            if (name && this.macros.has(name)) {
                const count = this.macros.get(name)!.length;
                this.macros.delete(name);
                return { changes: count };
            }
            return { changes: 0 };
        } else if (sql.includes('WHERE')) {
            // Generic WHERE clause - for safety, don't delete anything
            console.warn('InMemoryDatabase: Unsupported WHERE clause in DELETE:', sql);
            return { changes: 0 };
        } else {
            // DELETE without WHERE - clear all
            const count = Array.from(this.macros.values()).reduce((sum, defs) => sum + defs.length, 0);
            this.macros.clear();
            return { changes: count };
        }
    }
}

export class MacroDatabase {
    private db: DatabaseInterface | null = null;
    private definitions: Map<string, MacroDef[]> = new Map();
    private static instance: MacroDatabase;
    private dbPath: string;
    private context: vscode.ExtensionContext | null = null;
    private initialized: boolean = false;
    private useInMemory: boolean = false;
    private pendingFiles = new Set<string>();
    private debounceTimer: NodeJS.Timeout | null = null;
    private forceUpdateTimer: NodeJS.Timeout | null = null;
    private lastScanTime = 0;
    private scanStats = {
        totalScans: 0,
        incrementalScans: 0,
        filesProcessed: 0,
        macrosFound: 0,
        averageScanTime: 0
    };
    private debounceDelay: number = DATABASE_CONSTANTS.DEFAULT_DEBOUNCE_DELAY;
    private maxDelay: number = DATABASE_CONSTANTS.DEFAULT_MAX_DELAY;
    private workspaceRoot: string | null = null;

    private constructor() {
        // Don't initialize database immediately
        this.dbPath = ':memory:';
    }

    static getInstance(): MacroDatabase {
        if (!MacroDatabase.instance) {
            MacroDatabase.instance = new MacroDatabase();
        }
        return MacroDatabase.instance;
    }
    
    /**
     * Convert absolute path to relative path (for storage)
     */
    private toRelativePath(absolutePath: string): string {
        if (!this.workspaceRoot) {
            return absolutePath; // Fallback to absolute if no workspace
        }
        
        // Normalize paths for comparison
        const normalized = path.normalize(absolutePath);
        const normalizedRoot = path.normalize(this.workspaceRoot);
        
        if (normalized.startsWith(normalizedRoot)) {
            return path.relative(normalizedRoot, normalized);
        }
        
        return absolutePath; // Outside workspace, keep absolute
    }
    
    /**
     * Convert relative path to absolute path (for usage)
     */
    private toAbsolutePath(relativePath: string): string {
        if (!this.workspaceRoot) {
            return relativePath; // Fallback if no workspace
        }
        
        // If already absolute, return as-is
        if (path.isAbsolute(relativePath)) {
            return relativePath;
        }
        
        return path.join(this.workspaceRoot, relativePath);
    }

    initialize(context: vscode.ExtensionContext): void {
        if (this.initialized) {
            return;
        }

        this.context = context;
        this.dbPath = this.getDbPath(context);
        
        // Get workspace root for relative path conversion
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        this.workspaceRoot = workspaceFolder?.uri.fsPath || null;
        console.log(`MacroLens: Workspace root: ${this.workspaceRoot}`);

        this.initializeDatabase();

        this.initDatabase();
        this.updateConfigurationSettings();
        this.initialized = true;
    }

    /**
     * Update debounce settings from configuration
     */
    updateConfigurationSettings(): void {
        try {
            const config = vscode.workspace.getConfiguration('macrolens');
            this.debounceDelay = config.get('debounceDelay', DATABASE_CONSTANTS.DEFAULT_DEBOUNCE_DELAY);
            this.maxDelay = config.get('maxUpdateDelay', DATABASE_CONSTANTS.DEFAULT_MAX_DELAY);
            
            // Validate ranges using constants
            this.debounceDelay = Math.max(
                DATABASE_CONSTANTS.MIN_DEBOUNCE_DELAY, 
                Math.min(DATABASE_CONSTANTS.MAX_DEBOUNCE_DELAY, this.debounceDelay)
            );
            this.maxDelay = Math.max(
                DATABASE_CONSTANTS.MIN_MAX_DELAY, 
                Math.min(DATABASE_CONSTANTS.MAX_MAX_DELAY, this.maxDelay)
            );
            
            console.log(`MacroLens: Updated debounce settings - delay: ${this.debounceDelay}ms, max: ${this.maxDelay}ms`);
        } catch (error) {
            console.warn('MacroLens: Failed to update configuration settings:', error);
        }
    }

    private getDbPath(context: vscode.ExtensionContext): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        // Use VS Code's global storage path (always available in extension context)
        const globalStoragePath = context.globalStorageUri.fsPath;
        
        // Ensure directory exists
        if (!fs.existsSync(globalStoragePath)) {
            fs.mkdirSync(globalStoragePath, { recursive: true });
        }
        
        if (workspaceFolder) {
            const workspaceHash = this.hashString(workspaceFolder.uri.fsPath);
            const dbFileName = `macros_${workspaceHash}.db`;
            return path.join(globalStoragePath, dbFileName);
        } else {
            return path.join(globalStoragePath, 'macros.db');
        }
    }

    private initializeDatabase(): void {
        try {
            // Try Node.js built-in SQLite (Node.js 22+)
            const { DatabaseSync } = require('node:sqlite');
            this.db = new DatabaseSync(this.dbPath);
            console.log(`MacroLens: Using Node.js built-in SQLite at: ${this.dbPath}`);
        } catch (error) {
            console.warn('MacroLens: Node.js built-in SQLite not available, using in-memory fallback');
            console.warn('MacroLens: Requires Node.js 22.5.0+ for persistent storage');
            this.useInMemory = true;
            this.db = new InMemoryDatabase();
            console.log('MacroLens: Using in-memory database fallback');
        }
    }

    private hashString(str: string): string {
        // Simple hash function to create unique workspace identifier
        let hash = 0;
        if (str.length === 0) {
            return hash.toString();
        }
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(16);
    }

    private initDatabase() {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS macros (
                name TEXT NOT NULL,
                params TEXT,
                body TEXT NOT NULL,
                file TEXT NOT NULL,
                line INTEGER NOT NULL,
                isDefine INTEGER
            )
        `);
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_macro_name ON macros(name)');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_file ON macros(file)');
    }

    async scanProject(): Promise<void> {
        if (!this.db || !this.initialized) {
            throw new Error('Database not initialized. Call initialize() first.');
        }

        const files = await vscode.workspace.findFiles(
            FILE_PATTERNS.C_CPP_GLOB,
            FILE_PATTERNS.EXCLUDE_PATTERNS
        );

        // Always show progress indicator to inform user about scanning activity
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "MacroLens Scanning project",
            cancellable: false
        }, async (progress) => {
            await this.scanProjectWithProgress(files, progress);
        });
    }

    private async scanProjectWithProgress(files: vscode.Uri[], progress: vscode.Progress<{message?: string; increment?: number}>): Promise<void> {
        this.db!.exec('BEGIN TRANSACTION');
        try {
            this.db!.exec('DELETE FROM macros');
            
            const stmt = this.db!.prepare(
                'INSERT INTO macros (name, params, body, file, line, isDefine) VALUES (?, ?, ?, ?, ?, ?)'
            );
            
            const increment = 100 / files.length;
            
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fileName = file.fsPath.split(/[/\\]/).pop() || file.fsPath;
                
                progress.report({ 
                    message: ` ${fileName} (${i + 1}/${files.length})`,
                    increment: increment
                });
                
                try {
                    const content = await vscode.workspace.fs.readFile(file);
                    const defs = MacroParser.parseMacros(content.toString(), file.fsPath);
                    
                    for (const def of defs) {
                        const relativePath = this.toRelativePath(def.file);
                        stmt.run(
                            def.name,
                            def.params?.join(',') || null,
                            def.body,
                            relativePath,  // Store relative path
                            def.line,
                            def.isDefine !== undefined ? (def.isDefine ? 1 : 0) : null
                        );
                    }
                } catch (error) {
                    console.warn(`Failed to parse file ${file.fsPath}:`, error);
                }
            }
            
            progress.report({ message: 'Finalizing...' });
            this.db!.exec('COMMIT');
            await this.loadDefinitions();
        } catch (error) {
            this.db!.exec('ROLLBACK');
            throw error;
        }
    }

    /**
     * Scan and update only specific files (incremental update)
     */
    async scanFiles(fileUris: vscode.Uri[]): Promise<void> {
        if (!this.db || !this.initialized) {
            throw new Error('Database not initialized. Call initialize() first.');
        }

        if (fileUris.length === 0) {
            return;
        }

        this.db.exec('BEGIN TRANSACTION');
        try {
            // Remove existing macros from these files
            // IMPORTANT: Use relative path for deletion to match how we store paths
            const deleteStmt = this.db.prepare('DELETE FROM macros WHERE file = ?');
            for (const fileUri of fileUris) {
                const relativePath = this.toRelativePath(fileUri.fsPath);
                deleteStmt.run(relativePath);
                
                // Remove from in-memory cache as well
                this.removeFromCache(relativePath);
            }
            
            // Insert new macros from these files
            const insertStmt = this.db.prepare(
                'INSERT INTO macros (name, params, body, file, line, isDefine) VALUES (?, ?, ?, ?, ?, ?)'
            );
            
            for (const fileUri of fileUris) {
                try {
                    const content = await vscode.workspace.fs.readFile(fileUri);
                    const defs = MacroParser.parseMacros(content.toString(), fileUri.fsPath);
                    
                    for (const def of defs) {
                        const relativePath = this.toRelativePath(def.file);
                        insertStmt.run(
                            def.name,
                            def.params?.join(',') || null,
                            def.body,
                            relativePath,  // Store relative path
                            def.line,
                            def.isDefine !== undefined ? (def.isDefine ? 1 : 0) : null
                        );
                        
                        // Add to in-memory cache
                        const defWithAbsPath = {
                            ...def,
                            file: fileUri.fsPath  // Use absolute path in memory
                        };
                        this.addToCache(defWithAbsPath);
                    }
                } catch (error) {
                    console.warn(`Failed to parse file ${fileUri.fsPath}:`, error);
                }
            }
            
            this.db.exec('COMMIT');
            // No need to call loadDefinitions() - we updated cache incrementally
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }

    /**
     * Remove macros from deleted files
     */
    async removeFile(fileUri: vscode.Uri): Promise<void> {
        if (!this.db || !this.initialized) {
            return;
        }

        try {
            // IMPORTANT: Use relative path for deletion to match how we store paths
            const relativePath = this.toRelativePath(fileUri.fsPath);
            const stmt = this.db.prepare('DELETE FROM macros WHERE file = ?');
            stmt.run(relativePath);
            
            // Remove from in-memory cache
            this.removeFromCache(relativePath);
        } catch (error) {
            console.warn(`Failed to remove file ${fileUri.fsPath}:`, error);
        }
    }

    /**
     * Remove macros from a specific file from the in-memory cache
     */
    private removeFromCache(relativePath: string): void {
        const absolutePath = this.toAbsolutePath(relativePath);
        
        // Iterate through all macro definitions and remove those from this file
        for (const [name, defs] of this.definitions.entries()) {
            const filtered = defs.filter(def => def.file !== absolutePath);
            
            if (filtered.length === 0) {
                // No definitions left, remove the entry
                this.definitions.delete(name);
            } else if (filtered.length !== defs.length) {
                // Some definitions removed, update the entry
                this.definitions.set(name, filtered);
            }
        }
    }

    /**
     * Add a macro definition to the in-memory cache
     */
    private addToCache(def: MacroDef): void {
        const defs = this.definitions.get(def.name) || [];
        defs.push(def);
        this.definitions.set(def.name, defs);
    }

    /**
     * Queue files for incremental scanning with intelligent debounce
     */
    queueFileForScan(fileUri: vscode.Uri): void {
        this.pendingFiles.add(fileUri.fsPath);
        const now = Date.now();
        
        // Clear existing debounce timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        // Calculate dynamic debounce based on pending files count
        const dynamicDelay = this.calculateDynamicDelay();
        
        // If it's been too long since last scan, set up a force update
        if (!this.forceUpdateTimer && (now - this.lastScanTime) > DATABASE_CONSTANTS.TYPING_THRESHOLD) {
            this.forceUpdateTimer = setTimeout(async () => {
                console.log('MacroLens: Force update triggered (max delay reached)');
                await this.executePendingScan('force');
            }, this.maxDelay);
        }
        
        // Set regular debounce timer with dynamic delay
        this.debounceTimer = setTimeout(async () => {
            await this.executePendingScan('debounce');
        }, dynamicDelay);
    }

    /**
     * Calculate dynamic debounce delay based on pending files count
     */
    private calculateDynamicDelay(): number {
        const pendingCount = this.pendingFiles.size;
        
        // Base delay from configuration
        let delay = this.debounceDelay;
        
        // Increase delay for multiple pending files to batch processing
        if (pendingCount > DATABASE_CONSTANTS.MULTIPLE_FILES_THRESHOLD) {
            delay = Math.min(
                delay * DATABASE_CONSTANTS.MULTIPLE_FILES_DELAY_MULTIPLIER, 
                this.debounceDelay * 2
            );
        }
        
        // Reduce delay for single file changes (quick response)
        if (pendingCount === 1) {
            delay = Math.max(
                delay * DATABASE_CONSTANTS.SINGLE_FILE_DELAY_MULTIPLIER, 
                DATABASE_CONSTANTS.MIN_DEBOUNCE_DELAY
            );
        }
        
        return Math.round(delay);
    }

    /**
     * Execute pending scan and clean up timers
     */
    private async executePendingScan(trigger: 'debounce' | 'force' | 'immediate'): Promise<void> {
        const startTime = Date.now();
        
        // Clear all timers
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        if (this.forceUpdateTimer) {
            clearTimeout(this.forceUpdateTimer);
            this.forceUpdateTimer = null;
        }

        const filesToScan = Array.from(this.pendingFiles)
            .map(path => vscode.Uri.file(path))
            .filter(uri => uri.fsPath.match(/\.(c|cpp|cc|h|hpp|hh)$/i));
        
        this.pendingFiles.clear();
        
        if (filesToScan.length > 0) {
            try {
                await this.scanFiles(filesToScan);
                
                // Update statistics
                const scanTime = Date.now() - startTime;
                this.updateScanStatistics(filesToScan.length, scanTime, trigger === 'debounce' || trigger === 'force');
                
                this.lastScanTime = Date.now();
                console.log(`MacroLens: Incrementally updated ${filesToScan.length} files in ${scanTime}ms (${trigger})`);
            } catch (error) {
                console.error('MacroLens: Failed to scan queued files:', error);
            }
        }
    }

    /**
     * Update scan statistics
     */
    private updateScanStatistics(filesCount: number, scanTime: number, isIncremental: boolean): void {
        this.scanStats.totalScans++;
        if (isIncremental) {
            this.scanStats.incrementalScans++;
        }
        this.scanStats.filesProcessed += filesCount;
        
        // Update average scan time (exponential moving average)
        if (this.scanStats.averageScanTime === 0) {
            this.scanStats.averageScanTime = scanTime;
        } else {
            this.scanStats.averageScanTime = (this.scanStats.averageScanTime * 0.8) + (scanTime * 0.2);
        }
    }

    /**
     * Force immediate scan of pending files (for critical situations)
     */
    async flushPendingScans(): Promise<void> {
        if (this.pendingFiles.size > 0) {
            await this.executePendingScan('immediate');
        }
    }

    /**
     * Get count of pending files waiting to be scanned
     */
    getPendingFilesCount(): number {
        return this.pendingFiles.size;
    }

    /**
     * Get performance statistics
     */
    getStatistics(): {
        totalScans: number;
        incrementalScans: number;
        filesProcessed: number;
        macrosFound: number;
        averageScanTime: number;
        databaseType: string;
        debounceSettings: { delay: number; maxDelay: number };
        memoryUsage: {
            definitionsMapSize: number;
            definitionsMapBytes: number;
            totalDefinitions: number;
        };
    } {
        // Calculate memory usage for definitions Map
        let totalDefinitions = 0;
        let estimatedBytes = 0;
        
        for (const [name, defs] of this.definitions.entries()) {
            totalDefinitions += defs.length;
            // Estimate memory: key string + array overhead + definition objects
            estimatedBytes += name.length * 2; // UTF-16 chars
            estimatedBytes += 40; // Map entry overhead
            
            for (const def of defs) {
                // Estimate each MacroDef object
                estimatedBytes += def.name.length * 2;
                estimatedBytes += def.body.length * 2;
                estimatedBytes += def.file.length * 2;
                if (def.params) {
                    estimatedBytes += def.params.reduce((sum, p) => sum + p.length * 2, 0);
                    estimatedBytes += def.params.length * 8; // Array overhead
                }
                estimatedBytes += 64; // Object overhead
            }
        }
        
        return {
            ...this.scanStats,
            databaseType: this.useInMemory ? 'In-Memory' : 'SQLite',
            debounceSettings: {
                delay: this.debounceDelay,
                maxDelay: this.maxDelay
            },
            memoryUsage: {
                definitionsMapSize: this.definitions.size,
                definitionsMapBytes: estimatedBytes,
                totalDefinitions
            }
        };
    }

    /**
     * Check if a file is a C/C++ file that we should scan
     */
    private isCppFile(fileUri: vscode.Uri): boolean {
        return REGEX_PATTERNS.CPP_FILE_EXTENSION.test(fileUri.fsPath);
    }

    private async loadDefinitions(): Promise<void> {
        if (!this.db) {
            return;
        }
        
        const startTime = Date.now();
        
        const rows = this.db.prepare('SELECT * FROM macros ORDER BY name, file, line').all() as Array<{
            name: string;
            params: string | null;
            body: string;
            file: string;
            line: number;
            isDefine: number | null;
        }>;
        this.definitions.clear();
        
        for (const row of rows) {
            const absolutePath = this.toAbsolutePath(row.file);  // Convert to absolute path
            const def: MacroDef = {
                name: row.name,
                params: row.params?.split(',').filter(Boolean),
                body: row.body,
                file: absolutePath,  // Use absolute path in memory
                line: row.line,
                isDefine: row.isDefine !== null ? Boolean(row.isDefine) : undefined
            };
            
            const defs = this.definitions.get(def.name) || [];
            defs.push(def);
            this.definitions.set(def.name, defs);
        }
        
        // Update statistics
        this.scanStats.macrosFound = rows.length;
    }

    getDefinitions(name: string): MacroDef[] {
        return this.definitions.get(name) || [];
    }

    getAllDefinitions(): Map<string, MacroDef[]> {
        return new Map(this.definitions);
    }

    dispose(): void {
        // Clean up timers
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        if (this.forceUpdateTimer) {
            clearTimeout(this.forceUpdateTimer);
            this.forceUpdateTimer = null;
        }
        
        // Clean up database
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }

    public isUsingInMemory(): boolean {
        return this.useInMemory;
    }
}