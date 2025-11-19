import * as vscode from 'vscode';
import { MacroDatabase } from '../core/macroDb';
import { MacroExpander } from '../core/macroExpander';
import { MacroUtils } from '../utils/macroUtils';
import { MacroParser } from '../core/macroParser';
import { Configuration } from '../configuration';
import { SUGGESTION_CONSTANTS } from '../utils/constants';

export class MacroHoverProvider implements vscode.HoverProvider {
    private expander: MacroExpander;
    private db: MacroDatabase;
    private config: Configuration;
    // Cache for all macro names to avoid repeated getAllDefinitions() calls
    private allMacrosCache: string[] | null = null;
    private allMacrosCacheVersion: number = 0;
    // Cache for Levenshtein distance calculations
    private distanceCache: Map<string, number> = new Map();

    constructor() {
        this.db = MacroDatabase.getInstance();
        this.expander = new MacroExpander();
        this.config = Configuration.getInstance();
    }



    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.Hover | undefined> {
        const line = document.lineAt(position);
        
        // First get the current word as fallback
        const wordRange = document.getWordRangeAtPosition(position);
        const currentWord = wordRange ? document.getText(wordRange) : '';
        
        // Read multi-line text to handle macro calls spanning multiple lines
        // Read from current line start, extending downward to capture complete macro call
        const startOffset = document.offsetAt(new vscode.Position(position.line, 0));
        const cursorOffset = document.offsetAt(position);
        
        // Read sufficient text: up to 50 lines or 5000 chars to capture macro arguments
        const endLine = Math.min(position.line + 50, document.lineCount - 1);
        const endOffset = document.offsetAt(new vscode.Position(endLine, document.lineAt(endLine).text.length));
        const maxOffset = Math.min(endOffset, startOffset + 5000);
        
        const textFromLineStart = document.getText(new vscode.Range(
            document.positionAt(startOffset),
            document.positionAt(maxOffset)
        ));
        
        // Remove comments to avoid interference with macro parsing
        const cleanText = MacroParser.removeCommentsWithPlaceholders(textFromLineStart);
        
        // Calculate character position relative to line start
        const characterInText = cursorOffset - startOffset;
        
        // Try to find complete macro call (including multi-line parameters)
        const macroMatch = this.findMacroAtPosition(cleanText, characterInText, currentWord);
        
        const macroName = macroMatch.macroName;
        const args = macroMatch.args;
        
        // No macro name found at cursor position
        if (!macroName) {
            return undefined;
        }
        
        const defs = this.db.getDefinitions(macroName);
        
        if (defs.length === 0) {
            // Show suggestions for undefined macros
            return this.provideUndefinedMacroHover(macroName, wordRange);
        }

        // Skip if this is not a #define macro (typedef, struct, enum, union, etc.)
        if (defs[0].isDefine === false) {
            return undefined;
        }

        const def = defs[0];
        
        // Check for unbalanced parentheses
        const showDefinitionSnippet = this.config.getConfig().hoverShowDefinition;

        if (def.body.startsWith('/*UNBALANCED*/')) {
            const content = new vscode.MarkdownString();
            content.appendMarkdown('⚠️ **Unbalanced parentheses in macro definition**\n\n');
            if (showDefinitionSnippet) {
                content.appendCodeblock(
                    `#define ${macroName}${def.params ? `(${def.params.join(', ')})` : ''} ${def.body.replace('/*UNBALANCED*/ ', '')}`,
                    'cpp'
                );
            }
            content.appendMarkdown('\nThis macro has mismatched parentheses and cannot be expanded.');
            content.isTrusted = true;
            return new vscode.Hover(content, wordRange);
        }
        
        const result = this.expander.expand(macroName, args);
        const content = new vscode.MarkdownString();

        // Show definition
        const defDisplay = args && args.length > 0 ? 
            `${macroName}(${args.join(', ')})` : 
            macroName;
        
        if (showDefinitionSnippet) {
            content.appendCodeblock(
                `#define ${macroName}${def.params ? `(${def.params.join(', ')})` : ''} ${def.body}`,
                'cpp'
            );
        }

        // Check if expansion encountered errors (e.g., unbalanced parentheses in nested macros)
        if (result.hasErrors && result.errorMessage) {
            content.appendMarkdown(`\n❌ **Expansion Error:**\n`);
            content.appendMarkdown(`${result.errorMessage}\n`);
            content.isTrusted = true;
            return new vscode.Hover(content, wordRange);
        }

        // Show warning if multiple definitions exist
        if (defs.length > 1) {
            content.appendMarkdown(`\n⚠️ **${defs.length} definitions found** | `);
            const pickCommand = vscode.Uri.parse(
                `command:macrolens.pickRedefinition?${encodeURIComponent(JSON.stringify({ macro: macroName }))}`
            );
            content.appendMarkdown(`[Choose Definition](${pickCommand})\n`);
        }



        // Show final result
        content.appendMarkdown('\n**Final Result:**\n');
        content.appendCodeblock(result.finalText, 'cpp');

        if (result.concatenatedMacros && result.concatenatedMacros.length > 0) {
            content.appendMarkdown('\n**Macros created via concatenation:**\n');
            const linkLines = result.concatenatedMacros
                .map(name => `- ${this.buildMacroCommandLink(name)}`)
                .join('\n');
            content.appendMarkdown(linkLines + '\n');
        }

        // Provide suggestions for undefined macros in the expansion result
        if (result.undefinedMacros && result.undefinedMacros.size > 0) {
            this.refreshMacroCache();
            const undefinedWithSuggestions: string[] = [];
            for (const undefinedMacro of result.undefinedMacros) {
                if (!this.shouldSuggestForName(undefinedMacro)) {
                    continue;
                }
                const suggestions = this.findSimilarMacros(undefinedMacro, this.allMacrosCache!);
                if (suggestions.length > 0) {
                    undefinedWithSuggestions.push(`  - \`${undefinedMacro}\`: Did you mean ${suggestions.map(s => `\`${s}\``).join(', ')}?`);
                }
            }
            
            if (undefinedWithSuggestions.length > 0) {
                content.appendMarkdown('\n**Suggestions for undefined macros:**\n');
                content.appendMarkdown(undefinedWithSuggestions.join('\n') + '\n');
            }
        }

        content.isTrusted = true;
        
        // Create range covering the entire macro call
        const macroStartChar = line.text.indexOf(macroName);
        const macroEndChar = macroStartChar + (args ? `${macroName}(${args.join(', ')})`.length : macroName.length);
        const startPos = new vscode.Position(position.line, macroStartChar);
        const endPos = new vscode.Position(position.line, macroEndChar);
        const hoverRange = new vscode.Range(startPos, endPos);

        return new vscode.Hover(content, hoverRange);
    }

    private findMacroAtPosition(lineText: string, character: number, currentWord: string): { macroName: string; args?: string[] } {
        const result = MacroUtils.findMacroAtPosition(lineText, character);
        return result || { macroName: currentWord };
    }

    /**
     * Provide hover information for undefined macros with suggestions
     */
    private provideUndefinedMacroHover(macroName: string, wordRange: vscode.Range | undefined): vscode.Hover | undefined {
        if (!this.shouldSuggestForName(macroName)) {
            return undefined;
        }
        // Refresh macro cache if needed
        this.refreshMacroCache();
        
        // Get all defined macros for similarity search
        const suggestions = this.findSimilarMacros(macroName, this.allMacrosCache!);

        if (suggestions.length === 0) {
            return undefined; // No suggestions, don't show hover
        }

        const content = new vscode.MarkdownString();
        content.appendMarkdown(`**Did you mean:** ${suggestions.map(s => `\`${s}\``).join(', ')}?\n`);

        content.isTrusted = true;
        return new vscode.Hover(content, wordRange);
    }

    /**
     * Refresh macro cache if database has changed
     */
    private refreshMacroCache(): void {
        const currentVersion = this.getCurrentDbVersion();
        if (!this.allMacrosCache || this.allMacrosCacheVersion !== currentVersion) {
            this.allMacrosCache = Array.from(this.db.getAllDefinitions().keys());
            this.allMacrosCacheVersion = currentVersion;
        }
    }

    /**
     * Get database version based on macro count
     */
    private getCurrentDbVersion(): number {
        return this.db.getAllDefinitions().size;
    }

    private shouldSuggestForName(name: string): boolean {
        return /^[A-Z_][A-Z0-9_]*$/.test(name);
    }

    /**
     * Find similar macro names using Levenshtein distance
     */
    private findSimilarMacros(target: string, candidates: string[]): string[] {
        const MAX_CANDIDATES = 10000;

        // Early exit if no candidates
        if (candidates.length === 0) {
            return [];
        }

        // Performance optimization: Limit candidates to avoid excessive processing
        // For very large macro databases (>10,000 macros), only check relevant subset
        const limitedCandidates = candidates.length > MAX_CANDIDATES 
            ? this.selectRelevantCandidates(target, candidates, MAX_CANDIDATES)
            : candidates;

        // Clear cache periodically to prevent memory bloat
        if (this.distanceCache.size > SUGGESTION_CONSTANTS.MAX_CACHE_SIZE) {
            this.distanceCache.clear();
        }

        const results: Array<{ candidate: string; distance: number }> = [];

        for (const candidate of limitedCandidates) {
            // Skip exact matches
            if (candidate === target) {
                continue;
            }

            // Quick length check - if lengths differ by more than MAX_SUGGESTION_DISTANCE, skip
            const lengthDiff = Math.abs(target.length - candidate.length);
            if (lengthDiff > SUGGESTION_CONSTANTS.MAX_SUGGESTION_DISTANCE && 
                target.length <= SUGGESTION_CONSTANTS.MIN_SUBSTRING_LENGTH && 
                candidate.length <= SUGGESTION_CONSTANTS.MIN_SUBSTRING_LENGTH) {
                continue;
            }

            // Check substring match first (faster than Levenshtein)
            if (target.length > SUGGESTION_CONSTANTS.MIN_SUBSTRING_LENGTH && candidate.includes(target)) {
                results.push({ candidate, distance: 0 });
                continue;
            }
            if (candidate.length > SUGGESTION_CONSTANTS.MIN_SUBSTRING_LENGTH && target.includes(candidate)) {
                results.push({ candidate, distance: 0 });
                continue;
            }

            // Calculate Levenshtein distance with caching
            const cacheKey = `${target}:${candidate}`;
            let distance = this.distanceCache.get(cacheKey);

            if (distance === undefined) {
                distance = this.levenshteinDistance(target.toLowerCase(), candidate.toLowerCase());
                this.distanceCache.set(cacheKey, distance);
            }

            if (distance <= SUGGESTION_CONSTANTS.MAX_SUGGESTION_DISTANCE) {
                results.push({ candidate, distance });
            }
        }

        // Sort by distance and return top N suggestions
        return results
            .sort((a, b) => a.distance - b.distance)
            .slice(0, SUGGESTION_CONSTANTS.MAX_SUGGESTIONS)
            .map(r => r.candidate);
    }

    private buildMacroCommandLink(macroName: string): string {
        const commandArgs = { macro: macroName };
        const commandUri = vscode.Uri.parse(
            `command:macrolens.openMacroFromHover?${encodeURIComponent(JSON.stringify(commandArgs))}`
        );
        return `[${macroName}](${commandUri})`;
    }

    /**
     * Select relevant candidates from large candidate set for performance
     * Uses heuristics to reduce search space while maintaining accuracy
     */
    private selectRelevantCandidates(name: string, candidates: string[], maxCount: number): string[] {
        // Strategy 1: Prioritize candidates with same first character
        const firstChar = name[0].toUpperCase();
        const sameFirstChar = candidates.filter(c => c[0] === firstChar);
        
        if (sameFirstChar.length > 0 && sameFirstChar.length <= maxCount) {
            return sameFirstChar;
        }
        
        // Strategy 2: Filter by length similarity (±3 characters)
        const targetLen = name.length;
        const similarLength = candidates.filter(c => Math.abs(c.length - targetLen) <= 3);
        
        if (similarLength.length <= maxCount) {
            return similarLength;
        }
        
        // Strategy 3: Take first maxCount from similar length candidates
        return similarLength.slice(0, maxCount);
    }

    /**
     * Calculate Levenshtein distance between two strings
     * Optimized implementation using single array
     */
    private levenshteinDistance(a: string, b: string): number {
        // Optimization: if strings are identical, return 0
        if (a === b) {
            return 0;
        }

        // Optimization: ensure 'a' is the shorter string
        if (a.length > b.length) {
            [a, b] = [b, a];
        }

        // Optimization: use single array instead of 2D matrix
        const len1 = a.length;
        const len2 = b.length;

        // Early exit for empty strings
        if (len1 === 0) {
            return len2;
        }
        if (len2 === 0) {
            return len1;
        }

        // Use a single row for space optimization
        let prevRow = Array(len2 + 1).fill(0).map((_, i) => i);

        for (let i = 1; i <= len1; i++) {
            let currentRow = [i];

            for (let j = 1; j <= len2; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                currentRow[j] = Math.min(
                    prevRow[j] + 1,        // deletion
                    currentRow[j - 1] + 1, // insertion
                    prevRow[j - 1] + cost  // substitution
                );
            }

            prevRow = currentRow;
        }

        return prevRow[len2];
    }

    /**
     * Get memory usage statistics for hover provider caches
     */
    getMemoryUsage(): {
        distanceCacheSize: number;
        distanceCacheBytes: number;
        allMacrosCacheBytes: number;
    } {
        // Calculate distanceCache memory
        let distanceCacheBytes = 0;
        for (const [key, value] of this.distanceCache.entries()) {
            distanceCacheBytes += key.length * 2; // UTF-16 chars
            distanceCacheBytes += 8; // number value
            distanceCacheBytes += 40; // Map entry overhead
        }
        
        // Calculate allMacrosCache memory
        let allMacrosCacheBytes = 0;
        if (this.allMacrosCache) {
            for (const name of this.allMacrosCache) {
                allMacrosCacheBytes += name.length * 2; // UTF-16 chars
                allMacrosCacheBytes += 8; // Array element overhead
            }
            allMacrosCacheBytes += 40; // Array overhead
        }
        
        return {
            distanceCacheSize: this.distanceCache.size,
            distanceCacheBytes,
            allMacrosCacheBytes
        };
    }

    /**
     * Clean up resources when the provider is disposed
     */
    dispose(): void {
        this.distanceCache.clear();
        this.allMacrosCache = null;
    }
}