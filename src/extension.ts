// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';
import { MacroDatabase } from './core/macroDb';
import { MacroExpander } from './core/macroExpander';
import { MacroHoverProvider } from './features/hoverProvider';
import { MacroDiagnostics } from './features/diagnostics';
import { MacroTreeProvider } from './features/treeProvider';
import { Configuration } from './configuration';
import { FILE_PATTERNS } from './utils/constants';

let treeProvider: MacroTreeProvider;
let diagnostics: MacroDiagnostics;
let macroDb: MacroDatabase;
let expander: MacroExpander;
let config: Configuration;
let hoverProvider: MacroHoverProvider | null = null;
let hoverProviderDisposables: vscode.Disposable[] = [];

export async function activate(context: vscode.ExtensionContext) {
    console.log('MacroLens activating...');
    
    // Initialize core components
    config = Configuration.getInstance();
    macroDb = MacroDatabase.getInstance();
    expander = new MacroExpander();

    // Check if we have any C/C++ files before initializing
    const hasCppFiles = await checkForCppFiles();
    
    if (!hasCppFiles) {
        // Defer initialization until a C/C++ file is opened
        
        // Set up file watcher to initialize when C/C++ file is opened
        const disposable = vscode.workspace.onDidOpenTextDocument(async (doc) => {
            if (doc.languageId === 'c' || doc.languageId === 'cpp') {
                await initializeMacroLens(context);
                disposable.dispose(); // Remove this listener after initialization
            }
        });
        context.subscriptions.push(disposable);
        
        // Still register basic commands but don't scan project yet
        registerBasicCommands(context);
        return;
    }

    // Initialize immediately if C/C++ files are present
    await initializeMacroLens(context);
}

async function checkForCppFiles(): Promise<boolean> {
    try {
        const files = await vscode.workspace.findFiles(
            FILE_PATTERNS.C_CPP_GLOB,
            FILE_PATTERNS.EXCLUDE_PATTERNS,
            1 // Only check for existence, limit to 1 file
        );
        return files.length > 0;
    } catch {
        return false;
    }
}

function registerBasicCommands(context: vscode.ExtensionContext): void {
    // Register minimal commands that work without database
    context.subscriptions.push(
        vscode.commands.registerCommand('macrolens.rescan', async () => {
            if (!macroDb) {
                vscode.window.showErrorMessage(
                    'MacroLens: Database not initialized. Please ensure C/C++ files are present in your workspace.',
                    'Open Settings'
                ).then(selection => {
                    if (selection === 'Open Settings') {
                        vscode.commands.executeCommand('workbench.action.openSettings', 'macrolens');
                    }
                });
                return;
            }
            
            try {
                macroDb.initialize(context);
                await macroDb.scanProject();
                vscode.window.showInformationMessage('MacroLens: Project rescan completed successfully');
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(
                    `MacroLens: Failed to rescan project - ${errorMsg}`,
                    'View Logs',
                    'Retry'
                ).then(selection => {
                    if (selection === 'View Logs') {
                        vscode.commands.executeCommand('workbench.action.toggleDevTools');
                    } else if (selection === 'Retry') {
                        vscode.commands.executeCommand('macrolens.rescan');
                    }
                });
                console.error('MacroLens: Rescan error:', error);
            }
        })
    );
}

async function initializeMacroLens(context: vscode.ExtensionContext): Promise<void> {
    try {
        // Initialize database with extension context
        macroDb.initialize(context);

        // Always perform full project scan for proper macro analysis
        // Macro expansion requires global knowledge of all definitions
        await macroDb.scanProject();
        
        // Get scan results for user feedback
        const allMacros = macroDb.getAllDefinitions();
        const totalMacros = Array.from(allMacros.values()).reduce((sum, defs) => sum + defs.length, 0);
        
        vscode.window.showInformationMessage(
            `MacroLens: Initialization completed - Found ${totalMacros} macro definitions`
        );
        
        // Show database type info
        if (macroDb.isUsingInMemory()) {
            vscode.window.showInformationMessage('MacroLens: Using in-memory storage (native database unavailable)');
        }
    } catch (error) {
        console.error('MacroLens initialization error:', error);
        vscode.window.showErrorMessage(`MacroLens: Failed to initialize - ${error}. Extension will continue with limited functionality.`);
    }

    // Initialize tree provider
    treeProvider = new MacroTreeProvider(expander, config);

    // Register the tree view
    const treeView = vscode.window.createTreeView('macrolensTree', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);

    // Set initial tree view visibility context
    const isTreeViewEnabled = config.getConfig().enableTreeView;
    await vscode.commands.executeCommand(
        'setContext',
        'macrolens.treeViewVisible',
        isTreeViewEnabled
    );

    // Register hover providers if enabled
    if (config.getConfig().enableHoverProvider) {
        hoverProvider = new MacroHoverProvider();
        const cHoverDisposable = vscode.languages.registerHoverProvider(
            { scheme: 'file', language: 'c' },
            hoverProvider
        );
        const cppHoverDisposable = vscode.languages.registerHoverProvider(
            { scheme: 'file', language: 'cpp' },
            hoverProvider
        );
        hoverProviderDisposables.push(cHoverDisposable, cppHoverDisposable);
        context.subscriptions.push(cHoverDisposable, cppHoverDisposable);
    }

    // Initialize diagnostics if enabled
    if (config.getConfig().enableDiagnostics) {
        diagnostics = new MacroDiagnostics();
        context.subscriptions.push(diagnostics);
    }

    // Watch for file changes
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.{c,cpp,cc,h,hpp,hh}');
    context.subscriptions.push(
        watcher,
        watcher.onDidCreate(async (uri) => {
            // Incremental scan for new files
            macroDb.queueFileForScan(uri);
        }),
        watcher.onDidChange(async (uri) => {
            // Incremental scan for changed files
            macroDb.queueFileForScan(uri);
        }),
        watcher.onDidDelete(async (uri) => {
            // Remove deleted file from database
            await macroDb.removeFile(uri);
        })
    );

    // Register document event handlers
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(async doc => {
            if (diagnostics && doc.languageId === 'c' || doc.languageId === 'cpp') {
                await diagnostics.analyze(doc);
            }
        }),
        vscode.workspace.onDidChangeTextDocument(async e => {
            if (diagnostics && e.document.languageId === 'c' || e.document.languageId === 'cpp') {
                await diagnostics.analyze(e.document);
            }
        }),
        vscode.workspace.onDidSaveTextDocument(async doc => {
            if (doc.languageId === 'c' || doc.languageId === 'cpp') {
                // Use incremental scan instead of full project scan
                macroDb.queueFileForScan(doc.uri);
                if (diagnostics) {
                    await diagnostics.analyze(doc);
                }
            }
        }),
        vscode.workspace.onDidCloseTextDocument(doc => {
            if (diagnostics && doc.languageId === 'c' || doc.languageId === 'cpp') {
                // Clear diagnostics when file is closed
                diagnostics.clearDiagnostics(doc);
            }
        })
    );

    // Analyze all currently open C/C++ documents
    if (diagnostics) {
        const analyzePromises = vscode.workspace.textDocuments
            .filter(doc => doc.languageId === 'c' || doc.languageId === 'cpp')
            .map(doc => diagnostics.analyze(doc));
        await Promise.all(analyzePromises);
    }

    // Register all commands
    context.subscriptions.push(
        // Rescan project command (full scan)
        vscode.commands.registerCommand('macrolens.rescan', async () => {
            const choice = await vscode.window.showQuickPick([
                { label: 'Full Rescan', description: 'Scan all C/C++ files in the project' },
                { label: 'Open Files Only', description: 'Scan only currently open C/C++ files' }
            ], {
                placeHolder: 'Choose scan scope'
            });

            if (!choice) {
                return;
            }

            // Don't show "Rescanning..." message since progress indicator handles it
            try {
                let resultMessage: string;
                
                if (choice.label === 'Full Rescan') {
                    await macroDb.scanProject();
                    
                    // Get detailed results for full rescan
                    const allMacros = macroDb.getAllDefinitions();
                    const totalMacros = Array.from(allMacros.values()).reduce((sum, defs) => sum + defs.length, 0);
                    resultMessage = `MacroLens: Full rescan completed - ${totalMacros} macro definitions found`;
                } else {
                    // Scan only open files
                    const openFiles = vscode.workspace.textDocuments
                        .filter(doc => doc.languageId === 'c' || doc.languageId === 'cpp')
                        .map(doc => doc.uri);
                    
                    if (openFiles.length > 0) {
                        await macroDb.scanFiles(openFiles);
                        resultMessage = `MacroLens: Open files rescan completed - ${openFiles.length} files processed`;
                    } else {
                        resultMessage = 'MacroLens: No open C/C++ files to scan';
                    }
                }
                
                vscode.window.showInformationMessage(resultMessage);
            } catch (error) {
                vscode.window.showErrorMessage('MacroLens: Failed to rescan project');
                console.error(error);
            }
        }),

        // Flush pending scans command (immediate update)
        vscode.commands.registerCommand('macrolens.flushScans', async () => {
            const pendingCount = macroDb.getPendingFilesCount();
            if (pendingCount === 0) {
                vscode.window.showInformationMessage('MacroLens: No pending scans to flush');
                return;
            }
            
            try {
                await macroDb.flushPendingScans();
                vscode.window.showInformationMessage(
                    `MacroLens: Flushed ${pendingCount} pending file(s) - scans completed`
                );
            } catch (error) {
                vscode.window.showErrorMessage('MacroLens: Failed to flush pending scans');
                console.error(error);
            }
        }),

        // Pick redefinition command
        vscode.commands.registerCommand('macrolens.pickRedefinition', async (args) => {
            if (!args?.macro) {
                vscode.window.showWarningMessage('No macro specified');
                return;
            }
            
            const defs = macroDb.getDefinitions(args.macro);
            if (defs.length <= 1) {
                vscode.window.showInformationMessage('No multiple definitions found');
                return;
            }
            
            const items = defs.map((def, index) => ({
                label: `Definition ${index + 1}`,
                description: `${def.file.split('/').pop()}:${def.line}`,
                detail: def.body,
                def
            }));
            
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `Choose definition for ${args.macro}`,
                matchOnDescription: true,
                matchOnDetail: true
            });
            
            if (selected) {
                const document = await vscode.workspace.openTextDocument(selected.def.file);
                const editor = await vscode.window.showTextDocument(document);
                const position = new vscode.Position(selected.def.line - 1, 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(new vscode.Range(position, position));
            }
        }),

        // Show statistics command
        vscode.commands.registerCommand('macrolens.showStatistics', async () => {
            const stats = macroDb.getStatistics();
            
            // Helper to format bytes to human readable
            const formatBytes = (bytes: number): string => {
                if (bytes < 1024) {
                    return `${bytes} B`;
                }
                if (bytes < 1024 * 1024) {
                    return `${(bytes / 1024).toFixed(2)} KB`;
                }
                return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
            };
            
            const memoryLines = [
                '### Memory Usage',
                `**Definitions Map**: ${stats.memoryUsage.definitionsMapSize} unique macros, ${stats.memoryUsage.totalDefinitions} total definitions (${formatBytes(stats.memoryUsage.definitionsMapBytes)})`,
            ];
            
            // Add hover provider cache statistics if enabled
            if (hoverProvider) {
                const hoverMemory = hoverProvider.getMemoryUsage();
                memoryLines.push(
                    `**Distance Cache**: ${hoverMemory.distanceCacheSize} entries (${formatBytes(hoverMemory.distanceCacheBytes)})`,
                    `**Macro Names Cache**: ${formatBytes(hoverMemory.allMacrosCacheBytes)}`
                );
            }
            
            const message = [
                '## MacroLens Performance Statistics',
                '',
                `**Database Type**: ${stats.databaseType}`,
                `**Total Scans**: ${stats.totalScans}`,
                `**Incremental Scans**: ${stats.incrementalScans}`,
                `**Files Processed**: ${stats.filesProcessed}`,
                `**Macros Found**: ${stats.macrosFound}`,
                `**Average Scan Time**: ${stats.averageScanTime.toFixed(2)}ms`,
                '',
                ...memoryLines,
                '',
                '### Debounce Settings',
                `**Response Delay**: ${stats.debounceSettings.delay}ms`,
                `**Max Delay**: ${stats.debounceSettings.maxDelay}ms`,
                '',
                '*Configure these settings in VS Code preferences under "MacroLens"*'
            ].join('\n');

            // Show in new document for better readability
            const doc = await vscode.workspace.openTextDocument({
                content: message,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc);
        })
    );

    // Watch for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async e => {
            if (e.affectsConfiguration('macrolens.enableTreeView')) {
                const enabled = config.getConfig().enableTreeView;
                await vscode.commands.executeCommand('setContext', 'macrolens.treeViewVisible', enabled);
                
                if (enabled) {
                    vscode.window.showInformationMessage('MacroLens: Tree view enabled');
                } else {
                    vscode.window.showInformationMessage('MacroLens: Tree view disabled');
                }
            }
            
            // Handle hover provider enable/disable
            if (e.affectsConfiguration('macrolens.enableHoverProvider')) {
                const enabled = config.getConfig().enableHoverProvider;
                
                if (enabled) {
                    // Register hover providers
                    hoverProvider = new MacroHoverProvider();
                    const cHoverDisposable = vscode.languages.registerHoverProvider(
                        { scheme: 'file', language: 'c' },
                        hoverProvider
                    );
                    const cppHoverDisposable = vscode.languages.registerHoverProvider(
                        { scheme: 'file', language: 'cpp' },
                        hoverProvider
                    );
                    hoverProviderDisposables = [cHoverDisposable, cppHoverDisposable];
                    context.subscriptions.push(cHoverDisposable, cppHoverDisposable);
                    vscode.window.showInformationMessage('MacroLens: Hover provider enabled');
                } else {
                    // Dispose all hover providers
                    hoverProviderDisposables.forEach(disposable => disposable.dispose());
                    hoverProviderDisposables = [];
                    if (hoverProvider) {
                        hoverProvider.dispose();
                        hoverProvider = null;
                    }
                    vscode.window.showInformationMessage('MacroLens: Hover provider disabled');
                }
            }
            
            // Handle diagnostics enable/disable
            if (e.affectsConfiguration('macrolens.enableDiagnostics')) {
                const enabled = config.getConfig().enableDiagnostics;
                
                if (enabled) {
                    // Create and initialize diagnostics
                    diagnostics = new MacroDiagnostics();
                    context.subscriptions.push(diagnostics);
                    
                    // Analyze all currently open C/C++ documents
                    const analyzePromises = vscode.workspace.textDocuments
                        .filter(doc => doc.languageId === 'c' || doc.languageId === 'cpp')
                        .map(doc => diagnostics.analyze(doc));
                    await Promise.all(analyzePromises);
                    
                    vscode.window.showInformationMessage('MacroLens: Diagnostics enabled');
                } else {
                    // Dispose diagnostics
                    if (diagnostics) {
                        diagnostics.dispose();
                        diagnostics = null as any;
                    }
                    vscode.window.showInformationMessage('MacroLens: Diagnostics disabled');
                }
            }
            
            // Update debounce settings when configuration changes
            if (e.affectsConfiguration('macrolens.debounceDelay') || 
                e.affectsConfiguration('macrolens.maxUpdateDelay')) {
                macroDb.updateConfigurationSettings();
                vscode.window.showInformationMessage('MacroLens: Debounce settings updated');
            }
        })
    );
}

export function deactivate() {
    try {
        if (hoverProvider) {
            hoverProvider.dispose();
        }
        if (diagnostics) {
            diagnostics.dispose();
        }
        if (macroDb) {
            macroDb.dispose();
        }
        console.log('MacroLens deactivated');
    } catch (error) {
        console.error('Error during deactivation:', error);
    }
}