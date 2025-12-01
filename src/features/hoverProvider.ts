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
            const undefinedWithSuggestions: string[] = [];
            for (const undefinedMacro of result.undefinedMacros) {
                if (!this.shouldSuggestForName(undefinedMacro)) {
                    continue;
                }
                // Use VS Code API for suggestions
                const suggestions = await this.findSimilarSymbols(undefinedMacro);
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
    private async provideUndefinedMacroHover(macroName: string, wordRange: vscode.Range | undefined): Promise<vscode.Hover | undefined> {
        if (!this.shouldSuggestForName(macroName)) {
            return undefined;
        }
        
        // Use VS Code's symbol provider to find similar symbols
        // This delegates the fuzzy matching to the C/C++ extension or other providers
        const suggestions = await this.findSimilarSymbols(macroName);

        if (suggestions.length === 0) {
            return undefined; // No suggestions, don't show hover
        }

        const content = new vscode.MarkdownString();
        content.appendMarkdown(`**Did you mean:** ${suggestions.map(s => `\`${s}\``).join(', ')}?\n`);

        content.isTrusted = true;
        return new vscode.Hover(content, wordRange);
    }



    private shouldSuggestForName(name: string): boolean {
        return /^[A-Z_][A-Z0-9_]*$/.test(name);
    }

    private buildMacroCommandLink(macroName: string): string {
        const commandArgs = { macro: macroName };
        const commandUri = vscode.Uri.parse(
            `command:macrolens.openMacroFromHover?${encodeURIComponent(JSON.stringify(commandArgs))}`
        );
        return `[${macroName}](${commandUri})`;
    }

    /**
     * Find similar symbols using VS Code's workspace symbol provider
     */
    private async findSimilarSymbols(query: string): Promise<string[]> {
        try {
            // Execute workspace symbol search with timeout
            // This uses the installed C/C++ extension's index
            // We add a timeout to prevent hanging if the LSP is busy or unresponsive
            const timeoutMs = 2000; // 2 second timeout
            
            const searchPromise = vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                'vscode.executeWorkspaceSymbolProvider',
                query
            );
            
            const timeoutPromise = new Promise<vscode.SymbolInformation[]>((resolve) => {
                setTimeout(() => resolve([]), timeoutMs);
            });

            const symbols = await Promise.race([searchPromise, timeoutPromise]);

            if (!symbols || symbols.length === 0) {
                return [];
            }

            // Filter and process results
            const uniqueNames = new Set<string>();
            const results: string[] = [];

            for (const symbol of symbols) {
                // Only consider macros (usually Constant or String kind) or uppercase symbols
                // Note: C/C++ extension might classify macros differently, so we check name format too
                if (this.shouldSuggestForName(symbol.name)) {
                    // Avoid duplicates
                    if (!uniqueNames.has(symbol.name)) {
                        uniqueNames.add(symbol.name);
                        results.push(symbol.name);
                        
                        // Limit to top suggestions
                        if (results.length >= SUGGESTION_CONSTANTS.MAX_SUGGESTIONS) {
                            break;
                        }
                    }
                }
            }

            return results;
        } catch (error) {
            console.warn('MacroLens: Failed to execute workspace symbol provider:', error);
            return [];
        }
    }


}