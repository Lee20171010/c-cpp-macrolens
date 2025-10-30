import { REGEX_PATTERNS } from './constants';

/**
 * Shared utility functions for macro expansion and parameter handling
 */
export class MacroUtils {
    /**
     * Find macro call at specific position in text
     * Returns macro name and arguments if found
     * 
     * FIXED: Now properly handles nested parentheses in arguments
     * Example: A(1, (0), (1)) is correctly parsed as 3 arguments
     */
    static findMacroAtPosition(lineText: string, character: number): { macroName: string; args?: string[] } | null {
        // Use a simpler regex to find macro names followed by optional '('
        // Pattern: word characters followed by optional whitespace and '('
        let match;
        REGEX_PATTERNS.MACRO_WITH_CALL.lastIndex = 0;
        
        while ((match = REGEX_PATTERNS.MACRO_WITH_CALL.exec(lineText)) !== null) {
            const macroName = match[1];
            const hasParen = match[2] === '(';
            const startPos = match.index;
            
            if (!hasParen) {
                // Object-like macro or macro name without call
                const endPos = match.index + macroName.length;
                if (character >= startPos && character <= endPos) {
                    return { macroName };
                }
                continue;
            }
            
            // Function-like macro call - use extractArguments for proper parsing
            const parenIndex = lineText.indexOf('(', match.index);
            const argsResult = this.extractArguments(lineText, parenIndex);
            
            if (!argsResult) {
                // Failed to parse arguments (unmatched parens, etc.)
                continue;
            }
            
            const { args, endIndex } = argsResult;
            
            // Check if cursor is within this macro call range
            if (character >= startPos && character <= endIndex) {
                return { macroName, args };
            }
        }
        
        return null;
    }
    /**
     * Extract function arguments from macro invocation text
     * Handles nested parentheses and commas properly
     */
    static extractArguments(text: string, parenIndex: number): {args: string[], endIndex: number} | null {
        if (parenIndex >= text.length || text[parenIndex] !== '(') {
            return null;
        }

        const args: string[] = [];
        let current = '';
        let depth = 0;
        let i = parenIndex + 1; // Start after opening parenthesis
        let inString = false;
        let stringChar = '';

        while (i < text.length) {
            const char = text[i];
            
            // Handle string literals
            if (!inString && (char === '"' || char === "'")) {
                inString = true;
                stringChar = char;
                current += char;
            } else if (inString && char === stringChar && text[i - 1] !== '\\') {
                inString = false;
                current += char;
            } else if (inString) {
                current += char;
            } else if (char === '(') {
                depth++;
                current += char;
            } else if (char === ')') {
                if (depth === 0) {
                    // End of argument list
                    if (current.trim()) {
                        args.push(current.trim());
                    }
                    return { args, endIndex: i + 1 };
                }
                depth--;
                current += char;
            } else if (char === ',' && depth === 0) {
                // Argument separator at top level
                args.push(current.trim());
                current = '';
            } else {
                current += char;
            }
            
            i++;
        }

        // If we reach here, we didn't find closing parenthesis
        return null;
    }

    /**
     * Analyze macro definition to find which parameters are adjacent to ## or #
     * Returns sets of parameter names that should NOT be expanded
     */
    private static analyzeParameterUsage(definition: string, params: string[]): {
        noExpand: Set<string>;    // Parameters adjacent to ## (don't expand)
        stringify: Set<string>;    // Parameters after # (stringify, don't expand)
    } {
        const noExpand = new Set<string>();
        const stringify = new Set<string>();
        
        // Find parameters adjacent to ## operator
        for (const param of params) {
            if (param === '...' || param.includes('...')) {
                continue;
            }
            
            const escapedParam = MacroUtils.escapeRegex(param);
            
            // Check if parameter appears adjacent to ##
            // Pattern: param ## something or something ## param
            const concatenationPattern = new RegExp(
                `(\\b${escapedParam}\\b\\s*##|##\\s*\\b${escapedParam}\\b)`
            );
            
            if (concatenationPattern.test(definition)) {
                noExpand.add(param);
            }
            
            // Check if parameter appears after # (but NOT ##)
            // Pattern: #param but not ##param
            // Use negative lookbehind to exclude ##
            const stringifyPattern = new RegExp(`(?<!#)#(?!#)\\s*\\b${escapedParam}\\b`);
            
            if (stringifyPattern.test(definition)) {
                stringify.add(param);
            }
        }
        
        return { noExpand, stringify };
    }

    /**
     * Stringify a token (implement # operator)
     * Converts the token to a string literal
     */
    private static stringifyToken(token: string): string {
        // Escape backslashes and quotes
        let escaped = token.replace(REGEX_PATTERNS.BACKSLASH, '\\\\').replace(REGEX_PATTERNS.DOUBLE_QUOTE, '\\"');
        
        // Trim leading/trailing whitespace
        escaped = escaped.trim();
        
        // Wrap in quotes
        return `"${escaped}"`;
    }

    /**
     * Remove comments from macro argument
     * Per C/C++ standard, comments are replaced with a single space during preprocessing
     * 
     * Example: slash-star comment star-slash TST1 becomes TST1 (after trim)
     *          TST1 slash-star comment star-slash TST2 becomes TST1   TST2 then normalized
     */
    private static removeCommentsFromArg(arg: string): string {
        // Replace block comments with single space
        let result = arg.replace(REGEX_PATTERNS.BLOCK_COMMENT, ' ');
        
        // Replace line comments with single space (though unlikely in arguments)
        result = result.replace(REGEX_PATTERNS.LINE_COMMENT, ' ');
        
        // Normalize multiple spaces to single space
        result = result.replace(REGEX_PATTERNS.MULTIPLE_WHITESPACE, ' ');
        
        return result;
    }

    /**
     * Substitute macro parameters with actual arguments in the macro body
     * 
     * Implements standard C/C++ preprocessor rules:
     * 1. Parameters adjacent to ## are NOT expanded (use raw tokens)
     * 2. Parameters after # are NOT expanded (stringified)
     * 3. Other parameters are fully expanded before substitution
     * 4. After substitution, ## is processed
     * 5. Result is rescanned for more macros
     * 
     * IMPORTANT: Comments in parameters are replaced with a single space per C standard
     * Example: #define TST(slash-star comment star-slash A) (A##B)
     *          Parameter A becomes just A (comment removed, whitespace normalized)
     * 
     * @param definition Macro body
     * @param params Parameter names
     * @param args Argument values
     * @param expandArg Function to expand an argument (if needed)
     */
    static substituteParameters(
        definition: string, 
        params: string[], 
        args: string[],
        expandArg?: (arg: string) => string
    ): string {
        // Analyze which parameters should not be expanded
        const usage = this.analyzeParameterUsage(definition, params);
        
        let result = definition;
        
        // Step 1: Handle # stringification operator
        for (let i = 0; i < params.length && i < args.length; i++) {
            const param = params[i].trim();
            let arg = args[i];
            
            // Remove comments from argument (per C standard, comments become single space)
            arg = this.removeCommentsFromArg(arg);
            // Normalize whitespace
            arg = arg.trim();
            
            if (param === '...' || param.includes('...')) {
                continue;
            }
            
            if (usage.stringify.has(param)) {
                // Apply stringification: #param → "arg"
                // Use negative lookbehind/lookahead to avoid matching ##
                const stringified = this.stringifyToken(arg);
                const pattern = new RegExp(`(?<!#)#(?!#)\\s*\\b${MacroUtils.escapeRegex(param)}\\b`, 'g');
                result = result.replace(pattern, stringified);
            }
        }
        
        // Step 2: Substitute parameters
        for (let i = 0; i < params.length && i < args.length; i++) {
            const param = params[i].trim();
            let arg = args[i];
            
            // Remove comments from argument (per C standard, comments become single space)
            arg = this.removeCommentsFromArg(arg);
            // Normalize whitespace
            arg = arg.trim();
            
            // Skip variadic marker
            if (param === '...' || param.includes('...')) {
                continue;
            }
            
            // Step 2a: Expand argument if needed
            // Arguments adjacent to ## are NOT expanded (use raw tokens)
            // Arguments in stringify position are already handled
            if (!usage.noExpand.has(param) && !usage.stringify.has(param) && expandArg) {
                arg = expandArg(arg);
            }
            
            // Step 2b: Replace parameter with argument
            // Use word boundary to ensure complete parameter names
            const paramPattern = new RegExp(`\\b${MacroUtils.escapeRegex(param)}\\b`, 'g');
            result = result.replace(paramPattern, arg);
        }
        
        // Step 3: Handle __VA_ARGS__
        if (definition.includes(REGEX_PATTERNS.VA_ARGS.source)) {
            let varArgs = '';
            
            // Check if params contains "..." (variadic marker)
            const nonVariadicParams = params.filter(p => p !== '...' && !p.includes('...'));
            
            if (nonVariadicParams.length === 0) {
                // Pure variadic macro - all arguments go to __VA_ARGS__
                varArgs = args.join(', ');
            } else {
                // Mixed macro - arguments after regular params go to __VA_ARGS__
                const remainingArgs = args.slice(nonVariadicParams.length);
                varArgs = remainingArgs.join(', ');
            }
            
            result = result.replace(REGEX_PATTERNS.VA_ARGS, varArgs);
        }
        
        // Step 4: Process token concatenation (##)
        result = this.processTokenConcatenation(result);
        
        return result;
    }

    /**
     * Process token concatenation operator (##) in macro definitions
     * Removes ## and concatenates adjacent tokens
     * 
     * Handles:
     * - token1 ## token2 → token1token2
     * - ## token → token (left side empty)
    /**
     * Process token concatenation operator (##) in macro definitions
     * Removes ## and concatenates adjacent tokens
     * 
     * Handles:
     * - token1 ## token2 → token1token2
     * - ## token → token (left side empty)
     * - token ## → token (right side empty)
     * - ## → (both sides empty, placemarker)
     */
    static processTokenConcatenation(text: string): string {
        let result = text;
        
        // Match ## with optional whitespace and tokens on both sides
        // Token can be: word, number, operator, etc.
        // Pattern: (token)? ## (token)?
        const concatenationRegex = new RegExp(
            `([a-zA-Z_]\\w*|\\d+|[+\\-*\\/<>=!&|^%~]+)?\s*##\s*([a-zA-Z_]\\w*|\\d+|[+\\-*\\/<>=!&|^%~]+)?`, 
            'g'
        );
        
        result = result.replace(concatenationRegex, (match, left, right) => {
            // If both sides exist, concatenate
            if (left && right) {
                return left + right;
            }
            // If only left exists
            if (left) {
                return left;
            }
            // If only right exists
            if (right) {
                return right;
            }
            // Both sides empty (placemarker)
            return '';
        });
        
        return result;
    }

    /**
     * Find all macro invocations in text with their positions and arguments
     * Supports both function-like and object-like macros with proper nesting depth calculation
     */
    static findAllMacros(text: string, options: {
        calculateDepth?: boolean,
        validateWithDb?: (macroName: string) => boolean
    } = {}): Array<{
        name: string, 
        args?: string[], 
        start: number, 
        end: number,
        depth?: number
    }> {
        const macros: Array<{name: string, args?: string[], start: number, end: number, depth?: number}> = [];
        
        // Find macro names with arguments first
        let match;
        REGEX_PATTERNS.MACRO_CALL_WITH_ARGS.lastIndex = 0;
        
        while ((match = REGEX_PATTERNS.MACRO_CALL_WITH_ARGS.exec(text)) !== null) {
            const macroName = match[1];
            const startIndex = match.index;
            const parenIndex = match.index + match[0].length - 1; // Position of opening '('
            
            // Validate with database if provided
            if (options.validateWithDb && !options.validateWithDb(macroName)) {
                continue;
            }
            
            // Parse arguments with proper parentheses matching
            const argsResult = MacroUtils.extractArguments(text, parenIndex);
            if (!argsResult) {
                continue;
            }
            
            const { args, endIndex } = argsResult;
            let depth: number | undefined;
            
            if (options.calculateDepth) {
                const beforeText = text.substring(0, startIndex);
                depth = MacroUtils.calculateNestingDepth(beforeText);
            }
            
            macros.push({
                name: macroName,
                args,
                start: startIndex,
                end: endIndex,
                depth
            });
        }
        
        // Find macros without arguments
        const noArgsPattern = /\b([A-Za-z_]\w*)\b(?!\s*\()/g;
        while ((match = noArgsPattern.exec(text)) !== null) {
            const macroName = match[1];
            const startIndex = match.index;
            const endIndex = match.index + match[0].length;
            
            // Validate with database if provided
            if (options.validateWithDb && !options.validateWithDb(macroName)) {
                continue;
            }
            
            let depth: number | undefined;
            
            if (options.calculateDepth) {
                const beforeText = text.substring(0, startIndex);
                depth = MacroUtils.calculateNestingDepth(beforeText);
            }
            
            macros.push({
                name: macroName,
                args: undefined,
                start: startIndex,
                end: endIndex,
                depth
            });
        }
        
        return macros;
    }

    /**
     * Calculate nesting depth based on parentheses count
     */
    static calculateNestingDepth(text: string): number {
        let depth = 0;
        let inString = false;
        let stringChar = '';
        
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const prevChar = i > 0 ? text[i - 1] : '';
            
            if (!inString) {
                if (char === '"' || char === "'") {
                    inString = true;
                    stringChar = char;
                } else if (char === '(') {
                    depth++;
                } else if (char === ')') {
                    depth--;
                }
            } else {
                if (char === stringChar && prevChar !== '\\') {
                    inString = false;
                }
            }
        }
        
        return Math.max(0, depth);
    }

    /**
     * Escape special regex characters in string
     */
    static escapeRegex(text: string): string {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Strip unnecessary outer parentheses from expression
     * Smart strategy: preserves semantically important parentheses (casting, precedence, etc.)
     */
    static stripParentheses(text: string): string {
        let trimmed = text.trim();
        const hasVariables = /[a-zA-Z_]/.test(trimmed);
        let outerStrippedOnce = false;
        
        // Check for type casting patterns - preserve these
        if (this.isCastExpression(trimmed)) {
            return this.stripCastingParentheses(trimmed);
        }
        
        // Strip outer parentheses layer by layer
        while (trimmed.startsWith('(') && trimmed.endsWith(')')) {
            let depth = 0;
            let canStrip = true;
            
            for (let i = 0; i < trimmed.length; i++) {
                if (trimmed[i] === '(') {
                    depth++;
                } else if (trimmed[i] === ')') {
                    depth--;
                    if (depth === 0 && i < trimmed.length - 1) {
                        canStrip = false;
                        break;
                    }
                }
            }
            
            if (canStrip && depth === 0) {
                const inner = trimmed.slice(1, -1).trim();
                
                // Don't strip if it's a cast expression inside
                if (this.isCastExpression(inner)) {
                    break;
                }
                
                const hasOperators = /[+\-*\/%<>=&|^!?:]/.test(inner);
                
                // If has operators and variables, keep one layer when stripping from outside
                if (hasOperators && hasVariables && !outerStrippedOnce) {
                    outerStrippedOnce = true;
                    trimmed = inner;
                    continue;
                }
                
                trimmed = inner;
            } else {
                break;
            }
        }
        
        // Recursively strip nested parentheses within sub-expressions
        trimmed = this.stripNestedParentheses(trimmed);
        
        // If result has operators and variables, ensure at least one layer of parens
        const finalHasOperators = /[+\-*\/%<>=&|^!?:]/.test(trimmed);
        if (finalHasOperators && hasVariables && !trimmed.startsWith('(')) {
            return '(' + trimmed + ')';
        }
        
        return trimmed;
    }

    /**
     * Check if expression is a type cast: (type)expr
     * Recognizes both standard C types and typedef types
     */
    private static isCastExpression(text: string): boolean {
        const trimmed = text.trim();
        
        // Pattern 1: Standard C types with modifiers
        // Matches: (int), (unsigned int), (const char*), etc.
        const standardCastPattern = /^\s*\(\s*(const\s+|volatile\s+|unsigned\s+|signed\s+)*(char|short|int|long|float|double|void|size_t|ptrdiff_t|int\d+_t|uint\d+_t|struct\s+\w+|enum\s+\w+|union\s+\w+)(\s+\*+|\s*\*+|\s+const|\s+volatile)*\s*\)\s*\S/;
        
        // Pattern 2: Typedef types (common naming conventions)
        // Matches: (TST), (MYTYPE), (MyType), (mytype_t), (const TST*), etc.
        // Format: (modifiers? TypeName pointers?) where TypeName is:
        //   - All uppercase (TST, UINT, MYTYPE)
        //   - CamelCase (MyType, UInt32)
        //   - Ends with _t (mytype_t, my_type_t)
        //   - Ends with _T (MYTYPE_T)
        const typedefCastPattern = /^\s*\(\s*(const\s+|volatile\s+)*([A-Z][A-Z0-9_]*|[A-Z][a-zA-Z0-9]*|\w+_[tT])(\s*\*+|\s+\*+|\s+const|\s+volatile)*\s*\)\s*\S/;
        
        // Pattern 3: Function pointer casts
        // Matches: (returntype (*)(params))
        const funcPtrCastPattern = /^\s*\(\s*\w+\s*\(\s*\*+\s*\)\s*\([^)]*\)\s*\)\s*\S/;
        
        // Check if it's a cast pattern OR if the content inside outer parens is a cast
        if (standardCastPattern.test(trimmed) || 
            typedefCastPattern.test(trimmed) || 
            funcPtrCastPattern.test(trimmed)) {
            return true;
        }
        
        // Check for nested case: ((type)expr)
        // Strip outer parentheses and check again
        if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
            const inner = trimmed.slice(1, -1).trim();
            if (standardCastPattern.test(inner) || 
                typedefCastPattern.test(inner) || 
                funcPtrCastPattern.test(inner)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Strip parentheses from casting expressions intelligently
     * E.g., ((int)((x))) -> (int)x, ((TST)(value)) -> (TST)value
     */
    private static stripCastingParentheses(text: string): string {
        const trimmed = text.trim();
        
        // Pattern 1: Standard C types - (type)expr
        const standardMatch = trimmed.match(/^(\(\s*(?:const\s+|volatile\s+|unsigned\s+|signed\s+)*(?:char|short|int|long|float|double|void|size_t|ptrdiff_t|int\d+_t|uint\d+_t|struct\s+\w+|enum\s+\w+|union\s+\w+)(?:\s+\*+|\s*\*+|\s+const|\s+volatile)*\s*\))\s*(.+)$/);
        
        if (standardMatch) {
            const castPart = standardMatch[1];  // (type)
            const exprPart = standardMatch[2];  // expr
            
            // Recursively strip the expression part
            const strippedExpr = this.stripParentheses(exprPart);
            
            return castPart + strippedExpr;
        }
        
        // Pattern 2: Typedef types - (modifiers? TypeName pointers?)expr
        // Matches: (TST), (MYTYPE), (MyType), (mytype_t), (const TST*), etc.
        const typedefMatch = trimmed.match(/^(\(\s*(?:const\s+|volatile\s+)*(?:[A-Z][A-Z0-9_]*|[A-Z][a-zA-Z0-9]*|\w+_[tT])(?:\s*\*+|\s+\*+|\s+const|\s+volatile)*\s*\))\s*(.+)$/);
        
        if (typedefMatch) {
            const castPart = typedefMatch[1];  // (TypeName)
            const exprPart = typedefMatch[2];  // expr
            
            // Recursively strip the expression part
            const strippedExpr = this.stripParentheses(exprPart);
            
            return castPart + strippedExpr;
        }
        
        return trimmed;
    }

    /**
     * Recursively strip nested parentheses within sub-expressions
     * Preserves structure but removes unnecessary nesting
     * Example: ((a)) + ((b)) -> a + b
     */
    private static stripNestedParentheses(text: string): string {
        let result = '';
        let i = 0;
        
        while (i < text.length) {
            if (text[i] === '(') {
                // Find the matching closing parenthesis
                let depth = 0;
                let start = i;
                let found = false;
                
                for (let j = i; j < text.length; j++) {
                    if (text[j] === '(') {
                        depth++;
                    } else if (text[j] === ')') {
                        depth--;
                        if (depth === 0) {
                            // Found matching closing parenthesis
                            found = true;
                            
                            // Extract the content inside parentheses
                            const inner = text.substring(start + 1, j);
                            
                            // Check if this is a cast expression
                            const fullExpr = text.substring(start, j + 1);
                            if (this.isCastExpression(fullExpr)) {
                                // Preserve casting but strip its inner content
                                result += this.stripCastingParentheses(fullExpr);
                            } else {
                                // Recursively strip the inner content
                                const stripped = this.stripParentheses(inner);
                                
                                // Check if we need to keep the parentheses
                                if (this.needsParentheses(stripped, result, text.substring(j + 1))) {
                                    result += '(' + stripped + ')';
                                } else {
                                    result += stripped;
                                }
                            }
                            
                            i = j + 1;
                            break;
                        }
                    }
                }
                
                // If no matching closing parenthesis found, keep the opening parenthesis as-is
                // and move to next character to avoid infinite loop
                if (!found) {
                    result += text[i];
                    i++;
                }
            } else {
                result += text[i];
                i++;
            }
        }
        
        return result;
    }

    /**
     * Check if parentheses are necessary based on context
     * Returns true if removing them would be confusing or change semantics
     */
    private static needsParentheses(content: string, before: string, after: string): boolean {
        // Check if this is a function call: identifier(args)
        // Look at what comes before the opening parenthesis
        const beforeTrimmed = before.trim();
        
        // If before ends with an identifier (letter, digit, underscore), this is likely a function call
        if (/[a-zA-Z0-9_]$/.test(beforeTrimmed)) {
            // This is a function call: func(args)
            // MUST keep parentheses!
            return true;
        }
        
        // Check if this is an array/pointer subscript: arr[index] becomes arr[(index)]
        if (beforeTrimmed.endsWith('[')) {
            return true;
        }
        
        // Always keep parentheses for pointer dereference
        if (content.trim().startsWith('*') && content.trim().length > 1) {
            return true;
        }
        
        // Always keep for address-of
        if (content.trim().startsWith('&') && content.trim().length > 1) {
            return true;
        }
        
        // Check if content has comma (likely function arguments or comma operator)
        if (content.includes(',')) {
            // Keep if before suggests this is a function call
            if (/[a-zA-Z0-9_]$/.test(beforeTrimmed)) {
                return true;
            }
            // Also keep for comma operator in general (to be safe)
            return true;
        }
        
        // Check if content has operators that might need grouping
        const hasOperators = /[+\-*\/%<>=&|^!?:]/.test(content);
        
        if (!hasOperators) {
            // Simple value or variable - parentheses not needed
            return false;
        }
        
        // Content has operators - keep parentheses to preserve grouping
        // Example: ((x) * (y)) should become (x * y), not x * y
        // This ensures correct operator precedence in all contexts
        return true;
    }
}