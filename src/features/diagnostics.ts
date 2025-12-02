import * as vscode from 'vscode';
import { MacroDatabase } from '../core/macroDb';
import { MacroParser } from '../core/macroParser';
import { MacroUtils } from '../utils/macroUtils';
import { MacroExpander } from '../core/macroExpander';
import { REGEX_PATTERNS, BUILTIN_IDENTIFIERS } from '../utils/constants';
import { Configuration } from '../configuration';

export class MacroDiagnostics {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private db: MacroDatabase;
    private expander: MacroExpander;
    // Debounce timer to avoid frequent diagnostics
    private debounceTimer: NodeJS.Timeout | null = null;
    private maxWaitTimer: NodeJS.Timeout | null = null;
    private pendingDocs: Set<vscode.TextDocument> = new Set();

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('macrolens');
        this.db = MacroDatabase.getInstance();
        this.expander = new MacroExpander();
    }

    async analyze(document: vscode.TextDocument): Promise<void> {
        // Add to pending set
        this.pendingDocs.add(document);

        const config = Configuration.getInstance().getConfig();
        const debounceDelay = config.debounceDelay || 500;
        const maxUpdateDelay = config.maxUpdateDelay || 8000;

        // Debounce diagnostics to avoid frequent updates
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        // If no max wait timer is running, start one
        if (!this.maxWaitTimer) {
            this.maxWaitTimer = setTimeout(async () => {
                if (this.debounceTimer) {
                    clearTimeout(this.debounceTimer);
                    this.debounceTimer = null;
                }
                this.maxWaitTimer = null;
                await this.processPendingDocs();
            }, maxUpdateDelay);
        }

        this.debounceTimer = setTimeout(async () => {
            if (this.maxWaitTimer) {
                clearTimeout(this.maxWaitTimer);
                this.maxWaitTimer = null;
            }
            this.debounceTimer = null;
            await this.processPendingDocs();
        }, debounceDelay);
    }

    private async processPendingDocs(): Promise<void> {
        const docs = Array.from(this.pendingDocs);
        this.pendingDocs.clear();
        // Timers are cleared by the caller (analyze) before calling this

        const config = Configuration.getInstance().getConfig();
        const activeDoc = vscode.window.activeTextEditor?.document;

        for (const doc of docs) {
            if (doc.isClosed) { continue; }
            
            // If focus only mode is enabled, skip documents that are not active
            if (config.diagnosticsFocusOnly && doc !== activeDoc) {
                continue;
            }

            await this.analyzeImmediate(doc);
        }
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

        // Step 2: Check for unbalanced parentheses in macro definitions (must run before expansion checks)
        this.checkUnbalancedParentheses(document, cleanText, diagnostics);

        // Step 3: Check for undefined macros and expansion results
        // This unified approach checks both:
        // - Whether macros themselves are defined
        // - Whether their expansion results contain undefined macros
        this.checkUndefinedMacrosInExpansions(document, cleanText, diagnostics);

        // Step 4: Check for multiple definitions
        this.checkMultipleDefinitions(document, cleanText, diagnostics);

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
        const macroArgRanges: {start: number, end: number}[] = [];
        
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

            const { args, endIndex } = argsResult;
            
            // Store the argument range to skip object-like macro checks inside it
            // Range is from after '(' to before ')'
            macroArgRanges.push({
                start: parenStartIndex + 1,
                end: endIndex - 1
            });

            // Expand the macro and check for undefined macros in the result
            const expansionResult = this.expander.expand(macroName, args);

            // Check for unbalanced parentheses errors
            if (expansionResult.hasErrors && 
                expansionResult.errorMessage && 
                expansionResult.errorMessage.includes('unbalanced parentheses')) {
                
                // Skip if this is a #define statement (not a macro call)
                // We only want to report usage errors, not definition errors
                const pos = document.positionAt(callStartIndex);
                const line = document.lineAt(pos.line);
                const isDefineLine = /^\s*#\s*define\s+/.test(line.text);
                
                if (!isDefineLine) {
                    const range = new vscode.Range(
                        pos,
                        pos.translate(0, macroName.length)
                    );

                    // Extract the unbalanced macro name from error message
                    const unbalancedMatch = expansionResult.errorMessage.match(/Macro '(\w+)'/);
                    const unbalancedMacroName = unbalancedMatch ? unbalancedMatch[1] : 'unknown';

                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Macro '${macroName}' expands to '${unbalancedMacroName}' which has unbalanced parentheses`,
                        vscode.DiagnosticSeverity.Error
                    );
                    diagnostic.source = 'MacroLens';
                    diagnostic.code = 'unbalanced-parentheses-usage';

                    diagnostics.push(diagnostic);
                }
                continue; // Skip further checks for this macro
            }

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
            // Optimized: Use pre-calculated ranges instead of re-scanning
            let isInsideArg = false;
            for (const range of macroArgRanges) {
                if (callStartIndex >= range.start && callStartIndex <= range.end) {
                    isInsideArg = true;
                    break;
                }
            }
            if (isInsideArg) {
                continue;
            }

            // Skip struct/union member access (e.g. obj.MEMBER or ptr->MEMBER)
            if (this.isMemberAccess(cleanText, callStartIndex)) {
                continue;
            }

            // Skip if it looks like a variable declaration (e.g. int VAL;)
            if (this.isDeclaration(cleanText, callStartIndex)) {
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

            // Check for unbalanced parentheses errors
            if (expansionResult.hasErrors && 
                expansionResult.errorMessage && 
                expansionResult.errorMessage.includes('unbalanced parentheses')) {
                
                // Skip if this is a #define statement (not a macro call)
                // We only want to report usage errors, not definition errors
                const pos = document.positionAt(callStartIndex);
                const line = document.lineAt(pos.line);
                const isDefineLine = /^\s*#\s*define\s+/.test(line.text);
                
                if (!isDefineLine) {
                    const range = new vscode.Range(
                        pos,
                        pos.translate(0, macroName.length)
                    );

                    // Extract the unbalanced macro name from error message
                    const unbalancedMatch = expansionResult.errorMessage.match(/Macro '(\w+)'/);
                    const unbalancedMacroName = unbalancedMatch ? unbalancedMatch[1] : 'unknown';

                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Macro '${macroName}' expands to '${unbalancedMacroName}' which has unbalanced parentheses`,
                        vscode.DiagnosticSeverity.Error
                    );
                    diagnostic.source = 'MacroLens';
                    diagnostic.code = 'unbalanced-parentheses-usage';

                    diagnostics.push(diagnostic);
                }
                continue; // Skip further checks for this macro
            }

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
     * This checks the body content directly from source code
     * AND checks usages of macros that have unbalanced parentheses
     */
    private checkUnbalancedParentheses(
        document: vscode.TextDocument,
        cleanText: string,
        diagnostics: vscode.Diagnostic[]
    ): void {
        const lines = cleanText.split(/\r?\n/);
        let currentLine = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            currentLine = i;

            // Match #define directives
            // Use a more lenient regex that captures everything after the macro name
            // This allows us to detect unbalanced parentheses
            const defineMatch = line.match(/^\s*#\s*define\s+([A-Za-z_]\w*)(.*)/);
            if (!defineMatch) {
                continue;
            }

            const macroName = defineMatch[1];
            const restOfLine = defineMatch[2];
            let body = restOfLine.trim();

            // Handle multi-line macros with backslash continuation
            let j = i;
            while (j < lines.length) {
                const currentLineRaw = lines[j];
                const trimmedLine = currentLineRaw.trimEnd();
                if (!trimmedLine.endsWith('\\')) {
                    break;
                }
                
                if (j + 1 >= lines.length) {
                    break;
                }
                
                j++;
                const nextLine = lines[j].trim();
                
                if (j === i + 1) {
                    body = body.trimEnd();
                    if (body.endsWith('\\')) {
                        body = body.slice(0, -1).trimEnd();
                    }
                }
                
                body += ' ' + nextLine;
            }

            // Check 1: Parser detected unbalanced parentheses in parameter list (from database)
            // This is a syntax error - function-like macro with malformed parameter list
            const defs = this.db.getDefinitions(macroName);
            // Find the definition for this specific file and line (1-indexed)
            const currentFilePath = document.uri.fsPath;
            const currentLineNumber = currentLine + 1; // Convert to 1-indexed
            const currentDef = defs.find(d => 
                d.file === currentFilePath && d.line === currentLineNumber
            );
            const hasUnbalancedMarker = currentDef && currentDef.body.startsWith('/*UNBALANCED*/');
            
            // Check 2: Direct body content analysis (may be false positive for valid object-like macros)
            const isBodyUnbalanced = !this.hasBalancedParentheses(body);

            // Report appropriate severity based on error type
            if (hasUnbalancedMarker) {
                // Error: Parameter list has unbalanced parentheses (syntax error)
                const macroNameIndex = line.indexOf(macroName);
                if (macroNameIndex !== -1) {
                    const startPos = new vscode.Position(currentLine, macroNameIndex);
                    const endPos = new vscode.Position(currentLine, macroNameIndex + macroName.length);
                    const range = new vscode.Range(startPos, endPos);

                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Macro '${macroName}' has unbalanced parentheses in parameter list`,
                        vscode.DiagnosticSeverity.Error
                    );
                    diagnostic.source = 'MacroLens';
                    diagnostic.code = 'unbalanced-parentheses';

                    diagnostics.push(diagnostic);
                }
            } else if (isBodyUnbalanced) {
                // Warning: Body has unbalanced parentheses (may be intentional for object-like macros)
                const macroNameIndex = line.indexOf(macroName);
                if (macroNameIndex !== -1) {
                    const startPos = new vscode.Position(currentLine, macroNameIndex);
                    const endPos = new vscode.Position(currentLine, macroNameIndex + macroName.length);
                    const range = new vscode.Range(startPos, endPos);

                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Macro '${macroName}' has unbalanced parentheses in body`,
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostic.source = 'MacroLens';
                    diagnostic.code = 'unbalanced-parentheses-body';

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

    /**
     * Check if the token at the given index is a member access (preceded by . or ->)
     */
    private isMemberAccess(text: string, index: number): boolean {
        // Look backwards from index, skipping whitespace
        let i = index - 1;
        while (i >= 0 && /\s/.test(text[i])) {
            i--;
        }
        
        if (i < 0) {
            return false;
        }
        
        // Check for .
        if (text[i] === '.') {
            return true;
        }
        
        // Check for ->
        if (text[i] === '>' && i > 0 && text[i-1] === '-') {
            return true;
        }
        
        return false;
    }

    /**
     * Check if the token at the given index looks like a variable declaration
     * Checks if the preceding token is a type keyword or identifier
     */
    private isDeclaration(text: string, index: number): boolean {
        // Look backwards from index, skipping whitespace and pointers
        let i = index - 1;
        
        // Skip whitespace
        while (i >= 0 && /\s/.test(text[i])) {
            i--;
        }
        
        // Skip pointers (*), references (&), and whitespace around them
        while (i >= 0 && (text[i] === '*' || text[i] === '&' || /\s/.test(text[i]))) {
            i--;
        }
        
        if (i < 0) {
            return false;
        }
        
        // Now we should be at the end of the type name
        // Read backwards to get the word
        const end = i + 1;
        while (i >= 0 && /[a-zA-Z0-9_]/.test(text[i])) {
            i--;
        }
        
        if (i === end - 1) { return false; } // No word found
        
        const word = text.substring(i + 1, end);
        return this.isType(word);
    }

    private isType(word: string): boolean {
        // Common C/C++ types
        const types = new Set([
            'int', 'char', 'short', 'long', 'float', 'double', 'void',
            'unsigned', 'signed', 'bool', '_Bool', 'size_t', 'int8_t',
            'uint8_t', 'int16_t', 'uint16_t', 'int32_t', 'uint32_t',
            'int64_t', 'uint64_t', 'struct', 'union', 'enum', 'class',
            'auto', 'const', 'volatile', 'register', 'static', 'extern'
        ]);
        
        if (types.has(word)) {
            return true;
        }

        // Check database for known types (typedefs, structs, enums)
        // This handles project-specific types that don't follow naming conventions
        const defs = this.db.getDefinitions(word);
        if (defs.length > 0 && defs[0].isDefine === false) {
            return true;
        }
        
        // Also check if it looks like a type (e.g. MyType_t)
        // This is a heuristic: if it ends with _t or starts with uppercase (and we are not at start of line)
        if (word.endsWith('_t') || /^[A-Z]/.test(word)) {
            return true;
        }
        
        return false;
    }
}