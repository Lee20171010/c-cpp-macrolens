import * as vscode from 'vscode';
import { MacroDatabase } from '../core/macroDb';
import { MacroParser } from '../core/macroParser';
import { MacroUtils } from '../utils/macroUtils';
import { MacroExpander } from '../core/macroExpander';
import { DIAGNOSTICS_CONSTANTS, REGEX_PATTERNS, BUILTIN_IDENTIFIERS } from '../utils/constants';

export class MacroDiagnostics {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private db: MacroDatabase;
    private expander: MacroExpander;
    // Cache for Levenshtein distance calculations
    private distanceCache: Map<string, number> = new Map();
    // Cache for all macro names to avoid repeated getAllDefinitions() calls
    private allMacrosCache: string[] | null = null;
    private allMacrosCacheVersion: number = 0;
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

        // Skip very large files to prevent performance issues
        let text = document.getText();
        if (text.length > DIAGNOSTICS_CONSTANTS.MAX_FILE_SIZE) {
            console.log(`MacroLens: Skipping diagnostics for large file (${text.length} bytes): ${document.fileName}`);
            return;
        }

        // Lowercase function-like macro parameters in #define to avoid false undefined warnings
        // Example: #define FOO(BAR) (BAR + 1) -> #define FOO(bar) (bar + 1)
        // This prevents parameters from matching uppercase identifier checks
        // IMPORTANT: Must be done BEFORE removeComments to maintain position mapping
        text = MacroParser.lowercaseDefineParameters(text);

        // Remove comments and preprocessor directives before analyzing
        // This avoids false positives from comments and preprocessor directive arguments
        let cleanText = MacroParser.removeComments(text);
        cleanText = MacroParser.removePreprocessorDirectives(cleanText);

        // Refresh macro cache if needed
        this.refreshMacroCache();

        const diagnostics: vscode.Diagnostic[] = [];

        // Step 1: Check for argument count mismatches in function-like macro calls
        this.checkArgumentCountMismatches(document, cleanText, diagnostics);

        // Step 2: Check for undefined macros and expansion results
        // This unified approach checks both:
        // - Whether macros themselves are defined
        // - Whether their expansion results contain undefined macros
        this.checkUndefinedMacrosInExpansions(document, text, cleanText, diagnostics);

        // Step 3: Check for multiple definitions
        this.checkMultipleDefinitions(document, text, cleanText, diagnostics);

        // Step 4: Check for unbalanced parentheses in macro definitions
        this.checkUnbalancedParentheses(document, text, diagnostics);

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
        originalText: string,
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
                const originalPos = this.findOriginalPosition(originalText, cleanText, callStartIndex);
                if (originalPos !== -1) {
                    const pos = document.positionAt(originalPos);
                    const range = new vscode.Range(
                        pos,
                        pos.translate(0, macroName.length)
                    );

                    // Use cached macro names for similarity suggestions
                    const suggestions = this.findSimilarMacros(macroName, this.allMacrosCache!);
                    
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        suggestions.length > 0
                            ? `Undefined macro '${macroName}'. Did you mean: ${suggestions.join(', ')}?`
                            : `Undefined macro '${macroName}'`,
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostic.source = 'MacroLens';
                    diagnostic.code = 'undefined-macro';

                    diagnostics.push(diagnostic);
                }
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
                const originalPos = this.findOriginalPosition(originalText, cleanText, callStartIndex);
                if (originalPos !== -1) {
                    const pos = document.positionAt(originalPos);
                    const range = new vscode.Range(
                        pos,
                        pos.translate(0, macroName.length)
                    );

                    // Build detailed message with suggestions for each undefined macro
                    const undefinedWithSuggestions: string[] = [];
                    for (const undefinedMacro of expansionResult.undefinedMacros) {
                        const suggestions = this.findSimilarMacros(undefinedMacro, this.allMacrosCache!);
                        if (suggestions.length > 0) {
                            undefinedWithSuggestions.push(`${undefinedMacro} (did you mean: ${suggestions.join(', ')}?)`);
                        } else {
                            undefinedWithSuggestions.push(undefinedMacro);
                        }
                    }

                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Macro '${macroName}' expands to undefined macro${expansionResult.undefinedMacros.size > 1 ? 's' : ''}: ${undefinedWithSuggestions.join('; ')}`,
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostic.source = 'MacroLens';
                    diagnostic.code = 'macro-expansion-undefined';

                    diagnostics.push(diagnostic);
                }
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
                const originalPos = this.findOriginalPosition(originalText, cleanText, callStartIndex);
                if (originalPos !== -1) {
                    const pos = document.positionAt(originalPos);
                    const range = new vscode.Range(
                        pos,
                        pos.translate(0, macroName.length)
                    );

                    // Use cached macro names for similarity suggestions
                    const suggestions = this.findSimilarMacros(macroName, this.allMacrosCache!);
                    
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        suggestions.length > 0
                            ? `Undefined macro '${macroName}'. Did you mean: ${suggestions.join(', ')}?`
                            : `Undefined macro '${macroName}'`,
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostic.source = 'MacroLens';
                    diagnostic.code = 'undefined-macro';

                    diagnostics.push(diagnostic);
                }
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
                const originalPos = this.findOriginalPosition(originalText, cleanText, callStartIndex);
                if (originalPos !== -1) {
                    const pos = document.positionAt(originalPos);
                    const range = new vscode.Range(
                        pos,
                        pos.translate(0, macroName.length)
                    );

                    // Build detailed message with suggestions for each undefined macro
                    const undefinedWithSuggestions: string[] = [];
                    for (const undefinedMacro of expansionResult.undefinedMacros) {
                        const suggestions = this.findSimilarMacros(undefinedMacro, this.allMacrosCache!);
                        if (suggestions.length > 0) {
                            undefinedWithSuggestions.push(`${undefinedMacro} (did you mean: ${suggestions.join(', ')}?)`);
                        } else {
                            undefinedWithSuggestions.push(undefinedMacro);
                        }
                    }

                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Macro '${macroName}' expands to undefined macro${expansionResult.undefinedMacros.size > 1 ? 's' : ''}: ${undefinedWithSuggestions.join('; ')}`,
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostic.source = 'MacroLens';
                    diagnostic.code = 'macro-expansion-undefined';

                    diagnostics.push(diagnostic);
                }
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
                // Find the position in the original text
                const originalPos = this.findOriginalPosition(document.getText(), cleanText, callStartIndex);
                if (originalPos !== -1) {
                    const pos = document.positionAt(originalPos);
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
    }

    /**
     * Find the corresponding position in original text for a position in cleaned text
     */
    private findOriginalPosition(originalText: string, cleanText: string, cleanPos: number): number {
        // Build a reverse mapping: cleanedPos -> originalPos
        const cleanToOrigMap = new Map<number, number>();
        let originalIndex = 0;
        let cleanedIndex = 0;
        
        while (originalIndex < originalText.length && cleanedIndex < cleanText.length) {
            if (originalText[originalIndex] === cleanText[cleanedIndex]) {
                // Characters match - record the reverse mapping
                cleanToOrigMap.set(cleanedIndex, originalIndex);
                originalIndex++;
                cleanedIndex++;
            } else {
                // Character exists in original but not in cleaned (e.g., comment)
                originalIndex++;
            }
        }
        
        // Look up the original position for the given clean position
        return cleanToOrigMap.get(cleanPos) ?? -1;
    }

    /**
     * Find all positions of a macro in the original text (excluding occurrences in comments and #define bodies)
     * This is done by checking if each occurrence appears at the corresponding position in cleaned text
     * and is not inside a #define macro body
     */
    private findMacroPositionsInOriginalText(originalText: string, cleanText: string, macroName: string): number[] {
        const positions: number[] = [];
        const macroRegex = new RegExp(`\\b${this.escapeRegex(macroName)}\\b`, 'g');
        let match;
        
        // Build a position mapping from original to cleaned text
        const positionMap = this.buildPositionMap(originalText, cleanText);
        
        // Find all occurrences in original text
        while ((match = macroRegex.exec(originalText)) !== null) {
            const originalPos = match.index;
            const cleanedPos = positionMap.get(originalPos);
            
            // Only include if this position exists in cleaned text (not in a comment)
            if (cleanedPos !== undefined) {
                // Verify the macro name appears at this position in cleaned text
                if (cleanText.substring(cleanedPos, cleanedPos + macroName.length) === macroName) {
                    // Check if this position is inside a #define body
                    // Skip it if it is, as it should be checked via expansion instead
                    if (!MacroParser.isInsideDefineBody(originalText, originalPos)) {
                        positions.push(originalPos);
                    }
                }
            }
        }
        
        return positions;
    }
    
    /**
     * Build a mapping from original text positions to cleaned text positions
     * Positions inside comments will not have a mapping
     * 
     * Note: originalText may have lowercased parameters from lowercaseDefineParameters
     */
    private buildPositionMap(originalText: string, cleanText: string): Map<number, number> {
        const map = new Map<number, number>();
        let originalIndex = 0;
        let cleanedIndex = 0;
        
        while (originalIndex < originalText.length && cleanedIndex < cleanText.length) {
            const origChar = originalText[originalIndex];
            const cleanChar = cleanText[cleanedIndex];
            
            if (origChar === cleanChar || origChar.toLowerCase() === cleanChar.toLowerCase()) {
                // Characters match (exact or case-insensitive) - record the position mapping
                // This handles both normal characters and lowercased parameters
                map.set(originalIndex, cleanedIndex);
                originalIndex++;
                cleanedIndex++;
            } else {
                // Characters don't match - this position in original is removed (comment)
                // Just advance original index
                originalIndex++;
            }
        }
        
        return map;
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
        originalText: string,
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
                const positions = this.findMacroPositionsInOriginalText(originalText, cleanText, macroName);
                const locations = defs.map(def => `${def.file}:${def.line}`).join(', ');
                
                for (const originalIndex of positions) {
                    const pos = document.positionAt(originalIndex);
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

    private findSimilarMacros(name: string, candidates: string[]): string[] {
        // Early exit if no candidates
        if (candidates.length === 0) {
            return [];
        }

        // Performance optimization: Limit candidates to avoid excessive processing
        // For very large macro databases (>10,000 macros), only check relevant subset
        const MAX_CANDIDATES = 10000;
        const limitedCandidates = candidates.length > MAX_CANDIDATES 
            ? this.selectRelevantCandidates(name, candidates, MAX_CANDIDATES)
            : candidates;

        // Clear cache periodically to prevent memory bloat
        if (this.distanceCache.size > DIAGNOSTICS_CONSTANTS.MAX_CACHE_SIZE) {
            this.distanceCache.clear();
        }

        const results: Array<{candidate: string, distance: number}> = [];
        
        for (const candidate of limitedCandidates) {
            // Skip exact matches
            if (candidate === name) {
                continue;
            }

            // Quick length check - if lengths differ by more than MAX_SUGGESTION_DISTANCE, skip
            const lengthDiff = Math.abs(name.length - candidate.length);
            if (lengthDiff > DIAGNOSTICS_CONSTANTS.MAX_SUGGESTION_DISTANCE && 
                name.length <= DIAGNOSTICS_CONSTANTS.MIN_SUBSTRING_LENGTH && 
                candidate.length <= DIAGNOSTICS_CONSTANTS.MIN_SUBSTRING_LENGTH) {
                continue;
            }

            // Check substring match first (faster than Levenshtein)
            if (name.length > DIAGNOSTICS_CONSTANTS.MIN_SUBSTRING_LENGTH && candidate.includes(name)) {
                results.push({ candidate, distance: 0 });
                continue;
            }
            if (candidate.length > DIAGNOSTICS_CONSTANTS.MIN_SUBSTRING_LENGTH && name.includes(candidate)) {
                results.push({ candidate, distance: 0 });
                continue;
            }

            // Calculate Levenshtein distance with caching
            const cacheKey = `${name}:${candidate}`;
            let distance = this.distanceCache.get(cacheKey);
            
            if (distance === undefined) {
                distance = this.levenshteinDistance(name, candidate);
                this.distanceCache.set(cacheKey, distance);
            }

            if (distance <= DIAGNOSTICS_CONSTANTS.MAX_SUGGESTION_DISTANCE) {
                results.push({ candidate, distance });
            }
        }

        // Sort by distance and return top N suggestions
        return results
            .sort((a, b) => a.distance - b.distance)
            .slice(0, DIAGNOSTICS_CONSTANTS.MAX_SUGGESTIONS)
            .map(r => r.candidate);
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
     * Check for unbalanced parentheses in macro definitions
     * This helps catch potential syntax errors early
     */
    private checkUnbalancedParentheses(
        document: vscode.TextDocument,
        text: string,
        diagnostics: vscode.Diagnostic[]
    ): void {
        // Find all #define lines
        const lines = text.split(/\r?\n/);
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

    /**
     * Get memory usage statistics for diagnostic caches
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

    dispose() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        this.diagnosticCollection.dispose();
        this.distanceCache.clear();
        this.allMacrosCache = null;
    }
}