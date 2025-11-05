import * as vscode from 'vscode';
import { MacroDatabase } from '../core/macroDb';
import { MacroParser } from '../core/macroParser';
import { MacroUtils } from '../utils/macroUtils';
import { MacroExpander } from '../core/macroExpander';
import { REGEX_PATTERNS, BUILTIN_IDENTIFIERS } from '../utils/constants';

export class MacroDiagnostics {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private db: MacroDatabase;
    private expander: MacroExpander;
    // Debounce timer to avoid frequent diagnostics
    private debounceTimer: NodeJS.Timeout | null = null;
    private readonly DEBOUNCE_DELAY = 500; // 500ms debounce

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('macrolens');
        this.db = MacroDatabase.getInstance();
        this.expander = new MacroExpander();
    }

    async analyze(document: vscode.TextDocument): Promise<void> {
        // Debounce diagnostics to avoid frequent updates
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        this.debounceTimer = setTimeout(async () => {
            await this.analyzeImmediate(document);
        }, this.DEBOUNCE_DELAY);
    }

    private async analyzeImmediate(document: vscode.TextDocument): Promise<void> {
        if (document.languageId !== 'c' && document.languageId !== 'cpp') {
            return;
        }

        // Process text with whitespace placeholders to preserve positions
        // Order is important: comments first, then preprocessor, then parameters
        const originalText = document.getText();
        const cleanText = MacroParser.lowercaseDefineParameters(
            MacroParser.removePreprocessorDirectivesWithPlaceholders(
                MacroParser.removeCommentsWithPlaceholders(originalText)
            )
        );

        const diagnostics: vscode.Diagnostic[] = [];

        // Step 1: Check for argument count mismatches in function-like macro calls
        this.checkArgumentCountMismatches(document, cleanText, diagnostics);

        // Step 2: Check for undefined macros and expansion results
        // This unified approach checks both:
        // - Whether macros themselves are defined
        // - Whether their expansion results contain undefined macros
        this.checkUndefinedMacrosInExpansions(document, cleanText, diagnostics);

        // Step 3: Check for multiple definitions
        this.checkMultipleDefinitions(document, cleanText, diagnostics);

        // Step 4: Check for unbalanced parentheses in macro definitions
        this.checkUnbalancedParentheses(document, cleanText, diagnostics);

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    /**
     * Check for undefined macros through expansion results
     * This unified approach checks:
     * 1. Whether macros themselves are defined
     * 2. Whether their expansion results contain undefined macros
     */
    private checkUndefinedMacrosInExpansions(
        document: vscode.TextDocument,
        cleanText: string,
        diagnostics: vscode.Diagnostic[]
    ): void {
        const checkedMacros = new Set<string>();
        
        // Part 1: Check function-like macro calls (only uppercase identifiers)
        let match;
        REGEX_PATTERNS.FUNCTION_LIKE_MACRO_CALL.lastIndex = 0;

        while ((match = REGEX_PATTERNS.FUNCTION_LIKE_MACRO_CALL.exec(cleanText))) {
            const macroName = match[1];
            const callStartIndex = match.index;
            const parenStartIndex = match.index + match[0].length - 1;

            // Skip built-in identifiers
            if (BUILTIN_IDENTIFIERS.has(macroName)) {
                continue;
            }

            // Mark as checked to avoid duplicate checks in object-like pass
            checkedMacros.add(macroName);

            // Get macro definition
            const defs = this.db.getDefinitions(macroName);
            
            // Check if macro itself is undefined
            if (defs.length === 0) {
                const pos = document.positionAt(callStartIndex);
                const range = new vscode.Range(
                    pos,
                    pos.translate(0, macroName.length)
                );

                // Simplified diagnostic - suggestions will be shown in hover
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Undefined macro '${macroName}'`,
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.source = 'MacroLens';
                diagnostic.code = 'undefined-macro';

                diagnostics.push(diagnostic);
                continue;
            }

            // Skip non-macro definitions (typedef, struct, enum, union)
            if (defs[0].isDefine === false) {
                continue;
            }

            // Extract arguments from the call
            const argsResult = MacroUtils.extractArguments(cleanText, parenStartIndex);
            if (!argsResult) {
                continue;
            }

            const { args } = argsResult;

            // Expand the macro and check for undefined macros in the result
            const expansionResult = this.expander.expand(macroName, args);

            if (expansionResult.undefinedMacros && expansionResult.undefinedMacros.size > 0) {
                const pos = document.positionAt(callStartIndex);
                const range = new vscode.Range(
                    pos,
                    pos.translate(0, macroName.length)
                );

                // Simplified diagnostic - suggestions will be shown in hover
                const undefinedList = Array.from(expansionResult.undefinedMacros).join(', ');

                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Macro '${macroName}' expands to undefined macro${expansionResult.undefinedMacros.size > 1 ? 's' : ''}: ${undefinedList}`,
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.source = 'MacroLens';
                diagnostic.code = 'macro-expansion-undefined';

                diagnostics.push(diagnostic);
            }
        }

        // Part 2: Check object-like macros (without parentheses)
        REGEX_PATTERNS.OBJECT_LIKE_MACRO.lastIndex = 0;

        while ((match = REGEX_PATTERNS.OBJECT_LIKE_MACRO.exec(cleanText))) {
            const macroName = match[1];
            const callStartIndex = match.index;

            // Skip built-in identifiers
            if (BUILTIN_IDENTIFIERS.has(macroName)) {
                continue;
            }

            // Skip if already checked as function-like macro
            if (checkedMacros.has(macroName)) {
                continue;
            }

            // Skip if this token is inside a #define body
            // Let expansion checking handle it instead (more accurate)
            if (MacroParser.isInsideDefineBody(cleanText, callStartIndex)) {
                continue;
            }

            // CRITICAL: Skip if inside function-like macro arguments
            // Example: FOO(BAR) - BAR will be checked via FOO's expansion
            if (this.isInsideFunctionLikeMacroArguments(cleanText, callStartIndex)) {
                continue;
            }

            // Get macro definition
            const defs = this.db.getDefinitions(macroName);
            
            // Check if macro itself is undefined
            if (defs.length === 0) {
                const pos = document.positionAt(callStartIndex);
                const range = new vscode.Range(
                    pos,
                    pos.translate(0, macroName.length)
                );

                // Simplified diagnostic - suggestions will be shown in hover
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Undefined macro '${macroName}'`,
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.source = 'MacroLens';
                diagnostic.code = 'undefined-macro';

                diagnostics.push(diagnostic);
                continue;
            }

            // Skip non-macro definitions (typedef, struct, enum, union)
            if (defs[0].isDefine === false) {
                continue;
            }

            // Skip function-like macros (they need parentheses)
            if (defs[0].params && defs[0].params.length > 0) {
                continue;
            }

            // Expand the macro and check for undefined macros in the result
            const expansionResult = this.expander.expand(macroName);

            if (expansionResult.undefinedMacros && expansionResult.undefinedMacros.size > 0) {
                const pos = document.positionAt(callStartIndex);
                const range = new vscode.Range(
                    pos,
                    pos.translate(0, macroName.length)
                );

                // Simplified diagnostic - suggestions will be shown in hover
                const undefinedList = Array.from(expansionResult.undefinedMacros).join(', ');

                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Macro '${macroName}' expands to undefined macro${expansionResult.undefinedMacros.size > 1 ? 's' : ''}: ${undefinedList}`,
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.source = 'MacroLens';
                diagnostic.code = 'macro-expansion-undefined';

                diagnostics.push(diagnostic);
            }
        }
    }

    /**
     * Check for argument count mismatches in function-like macro calls
     * Handles variadic macros (..., __VA_ARGS__) correctly
     */
    private checkArgumentCountMismatches(
        document: vscode.TextDocument,
        cleanText: string,
        diagnostics: vscode.Diagnostic[]
    ): void {
        // Find all function-like macro calls: MACRO_NAME(args)
        const macroCallPattern = /\b([A-Za-z_]\w*)\s*\(/g;
        let match;

        while ((match = macroCallPattern.exec(cleanText))) {
            const macroName = match[1];
            const callStartIndex = match.index;
            const parenStartIndex = match.index + match[0].length - 1;

            // Skip built-in identifiers
            if (BUILTIN_IDENTIFIERS.has(macroName)) {
                continue;
            }

            // Get macro definition
            const defs = this.db.getDefinitions(macroName);
            if (defs.length === 0) {
                continue; // Already handled by undefined macro check
            }

            // Skip non-macro definitions
            if (defs[0].isDefine === false) {
                continue;
            }

            // Only check function-like macros (those with parameters)
            const def = defs[0]; // Use first definition
            if (!def.params || def.params.length === 0) {
                continue;
            }

            // Extract arguments from the call
            const argsResult = MacroUtils.extractArguments(cleanText, parenStartIndex);
            if (!argsResult) {
                continue; // Malformed call, skip
            }

            const { args } = argsResult;
            
            // Skip argument count validation if any argument contains __VA_ARGS__
            // because __VA_ARGS__ will be expanded to an unknown number of arguments at preprocessing time
            const hasVaArgs = args.some(arg => /\b__VA_ARGS__\b/.test(arg));
            if (hasVaArgs) {
                continue; // Cannot validate argument count when __VA_ARGS__ is present
            }
            
            const callArgCount = args.length;

            // Determine if macro is variadic
            const isVariadic = def.params.some(p => p.trim() === '...' || p.includes('...'));
            
            let expectedMinArgs: number;
            let expectedMaxArgs: number | null; // null means unlimited
            let isPureVariadic = false;

            if (isVariadic) {
                // Variadic macro: count non-variadic parameters
                const nonVariadicParams = def.params.filter(p => p.trim() !== '...' && !p.includes('...'));
                
                // Pure variadic: #define FOO(...) or #define FOO(args...)
                // These can accept 0 or more arguments
                if (nonVariadicParams.length === 0) {
                    isPureVariadic = true;
                    expectedMinArgs = 0;
                    expectedMaxArgs = null;
                } else {
                    // Mixed variadic: #define FOO(fmt, ...) or #define FOO(a, b, ...)
                    // Standard C requires at least one variadic argument (to avoid trailing comma issue)
                    // However, GNU C and C++20 allow empty __VA_ARGS__
                    // We'll be lenient and only require fixed parameters
                    expectedMinArgs = nonVariadicParams.length;
                    expectedMaxArgs = null; // Unlimited arguments allowed
                }
            } else {
                // Non-variadic macro: exact parameter count required
                expectedMinArgs = def.params.length;
                expectedMaxArgs = def.params.length;
            }

            // Check argument count
            let hasError = false;
            let errorMessage = '';

            if (callArgCount < expectedMinArgs) {
                hasError = true;
                if (isPureVariadic) {
                    // This shouldn't happen since pure variadic has min 0
                    errorMessage = `Macro '${macroName}' is variadic and accepts any number of arguments`;
                } else if (isVariadic) {
                    errorMessage = `Macro '${macroName}' requires at least ${expectedMinArgs} argument${expectedMinArgs !== 1 ? 's' : ''}, but ${callArgCount} provided`;
                } else {
                    errorMessage = `Macro '${macroName}' requires exactly ${expectedMinArgs} argument${expectedMinArgs !== 1 ? 's' : ''}, but ${callArgCount} provided`;
                }
            } else if (expectedMaxArgs !== null && callArgCount > expectedMaxArgs) {
                hasError = true;
                errorMessage = `Macro '${macroName}' requires exactly ${expectedMaxArgs} argument${expectedMaxArgs !== 1 ? 's' : ''}, but ${callArgCount} provided`;
            }

            if (hasError) {
                // Position is now directly available since we use whitespace placeholders
                const pos = document.positionAt(callStartIndex);
                const range = new vscode.Range(
                    pos,
                    pos.translate(0, macroName.length)
                );

                const diagnostic = new vscode.Diagnostic(
                    range,
                    errorMessage,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.source = 'MacroLens';
                diagnostic.code = 'macro-argument-count';

                diagnostics.push(diagnostic);
            }
        }
    }

    /**
     * Escape special regex characters in a string
     */
    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Check if a position is inside function-like macro call arguments
     * This prevents false positives when object-like macros appear as arguments
     * Example: FOO(BAR) - BAR position will return true
     */
    private isInsideFunctionLikeMacroArguments(text: string, position: number): boolean {
        // Find all function-like macro calls
        REGEX_PATTERNS.FUNCTION_LIKE_MACRO_CALL.lastIndex = 0;
        let match;
        
        while ((match = REGEX_PATTERNS.FUNCTION_LIKE_MACRO_CALL.exec(text))) {
            const parenStartIndex = match.index + match[0].length - 1;
            
            // Extract arguments to find the range
            const argsResult = MacroUtils.extractArguments(text, parenStartIndex);
            if (!argsResult) {
                continue;
            }
            
            // Check if position is within this macro's argument range
            const argStart = parenStartIndex + 1; // After opening paren
            const argEnd = argsResult.endIndex - 1; // Before closing paren
            
            if (position >= argStart && position <= argEnd) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Check for multiple definitions of the same macro
     */
    private checkMultipleDefinitions(
        document: vscode.TextDocument,
        cleanText: string,
        diagnostics: vscode.Diagnostic[]
    ): void {
        const seenMacros = new Set<string>();
        
        // Find all macro usages (both function-like and object-like)
        let match;
        REGEX_PATTERNS.MACRO_NAME.lastIndex = 0;

        while ((match = REGEX_PATTERNS.MACRO_NAME.exec(cleanText))) {
            const macroName = match[0];
            const matchIndex = match.index;
            
            // Skip if we've already checked this macro
            if (seenMacros.has(macroName)) {
                continue;
            }
            seenMacros.add(macroName);
            
            // Skip built-in preprocessor identifiers
            if (BUILTIN_IDENTIFIERS.has(macroName)) {
                continue;
            }

            // Skip if this token is adjacent to ## (token concatenation)
            if (MacroParser.isAdjacentToTokenPaste(cleanText, matchIndex, macroName.length)) {
                continue;
            }

            // Skip if this token is inside a #define body
            if (MacroParser.isInsideDefineBody(cleanText, matchIndex)) {
                continue;
            }

            const defs = this.db.getDefinitions(macroName);

            // Skip if this is not a #define macro (typedef, struct, enum, union, etc.)
            if (defs.length > 0 && defs[0].isDefine === false) {
                continue;
            }
            
            // Check for multiple definitions
            if (defs.length > 1) {
                // Find all positions of this macro in cleanText (positions are now accurate)
                const positions: number[] = [];
                const macroRegex = new RegExp(`\\b${this.escapeRegex(macroName)}\\b`, 'g');
                let match;
                
                while ((match = macroRegex.exec(cleanText)) !== null) {
                    const position = match.index;
                    // Skip if inside #define body (checked by MacroParser)
                    if (!MacroParser.isInsideDefineBody(cleanText, position)) {
                        positions.push(position);
                    }
                }
                
                const locations = defs.map(def => `${def.file}:${def.line}`).join(', ');
                
                for (const position of positions) {
                    const pos = document.positionAt(position);
                    const range = new vscode.Range(
                        pos,
                        pos.translate(0, macroName.length)
                    );

                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Macro '${macroName}' has ${defs.length} definitions (${locations})`,
                        vscode.DiagnosticSeverity.Information
                    );
                    diagnostic.source = 'MacroLens';
                    diagnostic.code = 'macro-redefinition';

                    diagnostics.push(diagnostic);
                }
            }
        }
    }

    /**
     * Check for unbalanced parentheses in macro definitions
     * This helps catch potential syntax errors early
     */
    private checkUnbalancedParentheses(
        document: vscode.TextDocument,
        cleanText: string,
        diagnostics: vscode.Diagnostic[]
    ): void {
        // Find all #define lines
        const lines = cleanText.split(/\r?\n/);
        let currentLine = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            currentLine = i;

            // Match #define directives
            const defineMatch = line.match(/^\s*#\s*define\s+([A-Za-z_]\w*)(\s*\(([^)]*)\))?\s+(.*)$/);
            if (!defineMatch) {
                continue;
            }

            const macroName = defineMatch[1];
            let body = defineMatch[4] || '';

            // Handle multi-line macros with backslash continuation
            // Note: According to C standard, backslash followed by space and then newline
            // is technically a valid line continuation (GCC allows it with a warning)
            let j = i;
            while (j < lines.length) {
                const currentLineRaw = lines[j];
                // Check if line ends with backslash (with or without trailing whitespace)
                // This matches GCC's behavior which treats "\ \n" as line continuation
                const trimmedLine = currentLineRaw.trimEnd();
                if (!trimmedLine.endsWith('\\')) {
                    break;
                }
                
                // There's a continuation line
                if (j + 1 >= lines.length) {
                    break; // No more lines to continue
                }
                
                j++;
                const nextLine = lines[j].trim();
                
                // For the first line, use the body we extracted
                // For subsequent lines, append the next line
                if (j === i + 1) {
                    // First continuation: remove backslash from initial body
                    body = body.trimEnd();
                    if (body.endsWith('\\')) {
                        body = body.slice(0, -1).trimEnd();
                    }
                }
                
                body += ' ' + nextLine;
            }

            // Check if parentheses are balanced in the body
            if (!this.hasBalancedParentheses(body)) {
                // Find the position of the macro name in the original line
                const macroNameIndex = line.indexOf(macroName);
                if (macroNameIndex !== -1) {
                    const startPos = new vscode.Position(currentLine, macroNameIndex);
                    const endPos = new vscode.Position(currentLine, macroNameIndex + macroName.length);
                    const range = new vscode.Range(startPos, endPos);

                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Macro '${macroName}' has unbalanced parentheses in its definition`,
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostic.source = 'MacroLens';
                    diagnostic.code = 'unbalanced-parentheses';

                    diagnostics.push(diagnostic);
                }
            }

            // Skip the lines we already processed in multi-line macro
            i = j;
        }
    }

    /**
     * Check if a string has balanced parentheses
     * Ignores parentheses inside string literals and character literals
     */
    private hasBalancedParentheses(text: string): boolean {
        let depth = 0;
        let inString = false;
        let inChar = false;
        let stringChar = '';

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const prevChar = i > 0 ? text[i - 1] : '';

            // Handle string literals
            if (!inChar && (char === '"' || char === "'") && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
                continue;
            }

            // Skip if inside string
            if (inString) {
                continue;
            }

            // Count parentheses
            if (char === '(') {
                depth++;
            } else if (char === ')') {
                depth--;
                if (depth < 0) {
                    return false; // More closing than opening
                }
            }
        }

        return depth === 0; // Must end with balanced count
    }

    /**
     * Clear diagnostics for a specific document
     */
    clearDiagnostics(document: vscode.TextDocument): void {
        this.diagnosticCollection.delete(document.uri);
    }

    dispose() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        this.diagnosticCollection.dispose();
    }
}