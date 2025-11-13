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
        
        // Collect all macros that contain the cursor position
        const candidates: Array<{ macroName: string; args?: string[]; startPos: number; endPos: number }> = [];
        
        while ((match = REGEX_PATTERNS.MACRO_WITH_CALL.exec(lineText)) !== null) {
            const macroName = match[1];
            const hasParen = match[2] === '(';
            const startPos = match.index;
            
            if (!hasParen) {
                // Object-like macro or macro name without call
                const endPos = match.index + macroName.length;
                if (character >= startPos && character <= endPos) {
                    candidates.push({ macroName, startPos, endPos });
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
                candidates.push({ macroName, args, startPos, endPos: endIndex });
            }
        }
        
        // Return the smallest (most specific) macro that contains the cursor
        if (candidates.length === 0) {
            return null;
        }
        
        // Sort by range size (smallest first)
        candidates.sort((a, b) => (a.endPos - a.startPos) - (b.endPos - b.startPos));
        
        const best = candidates[0];
        return { macroName: best.macroName, args: best.args };
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
                    const trimmed = current.trim();
                    if (trimmed) {
                        // Normalize whitespace: remove line continuations and extra whitespace
                        const normalized = trimmed.replace(/\\\s*[\r\n]+\s*/g, ' ').replace(/\s+/g, ' ');
                        args.push(normalized);
                    }
                    return { args, endIndex: i + 1 };
                }
                depth--;
                current += char;
            } else if (char === ',' && depth === 0) {
                // Argument separator at top level
                const trimmed = current.trim();
                if (trimmed) {
                    // Normalize whitespace: remove line continuations and extra whitespace
                    const normalized = trimmed.replace(/\\\s*[\r\n]+\s*/g, ' ').replace(/\s+/g, ' ');
                    args.push(normalized);
                }
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
        
        // Step 2: Substitute parameters using two-phase replacement to avoid conflicts
        // Phase 1: Replace all parameters with unique placeholders
        // Phase 2: Replace placeholders with expanded arguments
        // This prevents sequential replacement issues where later parameters
        // might match text already substituted by earlier parameters
        
        const placeholders: Map<string, string> = new Map();
        const PLACEHOLDER_PREFIX = '\x00__PARAM_';
        const PLACEHOLDER_SUFFIX = '__\x00';
        
        // Phase 1: Replace parameters with placeholders
        for (let i = 0; i < params.length && i < args.length; i++) {
            const param = params[i].trim();
            
            // Skip variadic marker
            if (param === '...' || param.includes('...')) {
                continue;
            }
            
            const placeholder = `${PLACEHOLDER_PREFIX}${i}${PLACEHOLDER_SUFFIX}`;
            placeholders.set(placeholder, param);
            
            // Replace parameter with placeholder
            const paramPattern = new RegExp(`\\b${MacroUtils.escapeRegex(param)}\\b`, 'g');
            result = result.replace(paramPattern, placeholder);
        }
        
        // Phase 2: Replace placeholders with expanded arguments
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
            
            // Expand argument if needed
            // Arguments adjacent to ## are NOT expanded (use raw tokens)
            // Arguments in stringify position are already handled
            if (!usage.noExpand.has(param) && !usage.stringify.has(param) && expandArg) {
                arg = expandArg(arg);
            }
            
            // Replace placeholder with expanded argument
            const placeholder = `${PLACEHOLDER_PREFIX}${i}${PLACEHOLDER_SUFFIX}`;
            result = result.replaceAll(placeholder, arg);
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
     * Strip unnecessary duplicate parentheses - keep only one layer per group
     * 
     * For each (...) group, recursively strip its content, then add back one layer.
     * If a group is unbalanced (no matching closing paren), keep it unchanged.
     * 
     * Examples:
     * - (((a))) → (a) - triple nested becomes single
     * - ((a)) → (a) - double nested becomes single  
     * - (a) → (a) - already single, stays single
     * - func((a), (b)) → func((a), (b)) - each arg already has one layer
     * - func(((a)), (b)) → func((a), (b)) - first arg stripped from 2 to 1 layer
     * - (((a))) + ((b) → (a) + ((b) - first group balanced and stripped, second unbalanced kept
     */
    static stripParentheses(text: string): string {
        const trimmed = text.trim();
        
        // Base case: no parentheses
        if (!trimmed.includes('(')) {
            return trimmed;
        }
        
        // Scan and process each top-level parenthesized group
        let result = '';
        let i = 0;
        
        while (i < trimmed.length) {
            if (trimmed[i] === '(') {
                // Find matching closing parenthesis
                let depth = 1;
                let start = i;
                i++;
                
                while (i < trimmed.length && depth > 0) {
                    if (trimmed[i] === '(') {
                        depth++;
                    } else if (trimmed[i] === ')') {
                        depth--;
                    }
                    i++;
                }
                
                // If unbalanced (no matching ')'), keep original including the '('
                if (depth !== 0) {
                    result += trimmed.substring(start, i);
                    continue;
                }
                
                // Extract content between parentheses
                const innerContent = trimmed.substring(start + 1, i - 1);
                
                // If inner content is empty, result is ()
                if (innerContent.trim().length === 0) {
                    result += '()';
                    continue;
                }
                
                // Recursively strip the inner content
                const strippedInner = this.stripParentheses(innerContent);
                
                // If the stripped inner content is fully wrapped by parens,
                // don't add another layer (this IS the one layer we keep)
                if (this.isFullyWrappedByParens(strippedInner)) {
                    result += strippedInner;
                } else {
                    // Add one layer of parentheses
                    result += '(' + strippedInner + ')';
                }
            } else {
                result += trimmed[i];
                i++;
            }
        }
        
        return result;
    }
    
    /**
     * Check if text is fully wrapped by a single pair of parentheses
     * (a + b) → true (fully wrapped)
     * (a), (b) → false (two separate groups)
     * a + b → false (no parens)
     */
    private static isFullyWrappedByParens(text: string): boolean {
        const trimmed = text.trim();
        
        if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
            return false;
        }
        
        // Check if the opening paren at position 0 matches the closing paren at the end
        let depth = 0;
        
        for (let i = 0; i < trimmed.length; i++) {
            if (trimmed[i] === '(') {
                depth++;
            } else if (trimmed[i] === ')') {
                depth--;
                // If depth reaches 0 before the end, it's not fully wrapped
                if (depth === 0 && i < trimmed.length - 1) {
                    return false;
                }
            }
        }
        
        return depth === 0;
    }
}