import * as vscode from 'vscode';
import { MacroDatabase } from '../core/macroDb';
import { MacroExpander } from '../core/macroExpander';
import { MacroUtils } from '../utils/macroUtils';
import { Configuration } from '../configuration';

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
        const lineText = line.text;
        
        // First get the current word as fallback
        const wordRange = document.getWordRangeAtPosition(position);
        const currentWord = wordRange ? document.getText(wordRange) : '';
        
        // Try to find complete macro call (including parameters)
        const macroMatch = this.findMacroAtPosition(lineText, position.character, currentWord);
        
        let macroName: string;
        let args: string[] | undefined;
        
        if (macroMatch) {
            macroName = macroMatch.macroName;
            args = macroMatch.args;
        } else {
            if (!currentWord) {
                return undefined;
            }
            macroName = currentWord;
            args = undefined;
        }
        
        const defs = this.db.getDefinitions(macroName);
        
        if (defs.length === 0) {
            return undefined;
        }

        // Skip if this is not a #define macro (typedef, struct, enum, union, etc.)
        if (defs[0].isDefine === false) {
            return undefined;
        }

        const def = defs[0];
        const result = this.expander.expand(macroName, args);
        const content = new vscode.MarkdownString();

        // Show definition
        const defDisplay = args && args.length > 0 ? 
            `${macroName}(${args.join(', ')})` : 
            macroName;
        
        content.appendCodeblock(
            `#define ${macroName}${def.params ? `(${def.params.join(', ')})` : ''} ${def.body}`,
            'cpp'
        );



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

        // Show warning if there are undefined macros in the final result
        if (result.undefinedMacros && result.undefinedMacros.size > 0) {
            const undefinedList = Array.from(result.undefinedMacros).join(', ');
            content.appendMarkdown(`\n⚠️ **Warning**: Undefined macro${result.undefinedMacros.size > 1 ? 's' : ''} found in result: \`${undefinedList}\`\n`);
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

    private findMacroAtPosition(lineText: string, character: number, currentWord: string): { macroName: string; args?: string[] } | null {
        const result = MacroUtils.findMacroAtPosition(lineText, character);
        return result || { macroName: currentWord };
    }
}