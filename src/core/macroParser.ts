import * as vscode from 'vscode';
import { MacroDef } from './macroDb';
import { REGEX_PATTERNS } from '../utils/constants';
import { MacroUtils } from '../utils/macroUtils';

export class MacroParser {
    /**
     * Remove C/C++ comments from source code using regex
     * 
     * Note: While character-by-character parsing can be ~20% faster,
     * we choose regex for better readability, maintainability, and robustness.  
     * The performance difference is negligible for typical macro files.
     */
    static removeComments(content: string): string {
        return this.removeCommentsWithPlaceholders(content).replace(/[ \t]+\n/g, '\n');
    }

    /**
     * Remove comments using whitespace placeholders to preserve exact positions
     * This eliminates the need for position mapping since positions remain unchanged
     */
    static removeCommentsWithPlaceholders(content: string): string {
        // Fast path: if no comments exist, return as-is
        if (!content.includes('/*') && !content.includes('//')) {
            return content;
        }
        
        // Unified regex that handles string literals, block comments, and line comments
        const commentRegex = /((\"(?:[^\"\\]|\\.)*\")|('(?:[^'\\]|\\.)*'))|(\/\*[\s\S]*?\*\/)|(\/\/.*$)/gm;
        
        return content.replace(commentRegex, (match, _fullString, doubleQuoted, singleQuoted, blockComment, lineComment) => {
            // Preserve string literals (either single or double quoted)
            if (doubleQuoted || singleQuoted) {
                return match;
            }
            
            // Replace comments with equivalent whitespace to preserve positions
            if (blockComment || lineComment) {
                return match.replace(/[^\r\n]/g, ' ');
            }
            
            return match;
        });
    }

    /**
     * Remove preprocessor directives using whitespace placeholders
     * Preserves exact positions by replacing with spaces instead of deletion
     */
    static removePreprocessorDirectivesWithPlaceholders(content: string): string {
        // Pattern matches preprocessor directives at start of line, but NOT #define
        return content.replace(/^([ \t]*#(?!define\b).*$)/gm, (match) => {
            return match.replace(/[^\r\n]/g, ' ');
        });
    }



    /**
     * Lowercase function-like macro parameters in #define declarations ONLY
     * Converts both parameter declarations and their usages in the body to lowercase
     * Does NOT affect macro calls
     * 
     * Example:
     *   #define FOO(BAR) (BAR + 1)  ->  #define FOO(bar) (bar + 1)
     *   FOO(TST)                     ->  FOO(TST)  (unchanged)
     * 
     * This prevents parameters from being flagged as undefined macros in diagnostics
     */
    static lowercaseDefineParameters(content: string): string {
        // Detect the original newline format to preserve it
        const hasCarriageReturn = content.includes('\r\n');
        const newlineChar = hasCarriageReturn ? '\r\n' : '\n';
        const lines = content.split(/\r?\n/);
        const result: string[] = [];
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            
            // Check if this line is a function-like #define
            const defineMatch = line.match(REGEX_PATTERNS.DEFINE_FUNCTION_LIKE);
            if (!defineMatch) {
                result.push(line);
                continue;
            }
            
            // This is a function-like macro definition
            // Collect full definition (handle line continuations)
            let fullDefine = line;
            
            while (fullDefine.endsWith('\\') && i + 1 < lines.length) {
                i++;
                fullDefine += newlineChar + lines[i];
            }
            
            // Parse the macro
            const macroName = defineMatch[1];
            const afterName = fullDefine.substring(fullDefine.indexOf(macroName) + macroName.length);
            
            // Find parameter list
            const parenStart = afterName.indexOf('(');
            if (parenStart === -1) {
                result.push(fullDefine);
                continue;
            }
            
            // Find matching closing paren
            let depth = 0;
            let parenEnd = -1;
            for (let j = parenStart; j < afterName.length; j++) {
                if (afterName[j] === '(') {
                    depth++;
                } else if (afterName[j] === ')') {
                    depth--;
                    if (depth === 0) {
                        parenEnd = j;
                        break;
                    }
                }
            }
            
            if (parenEnd === -1) {
                result.push(fullDefine);
                continue;
            }
            
            // Extract parameters and body
            const paramString = afterName.substring(parenStart + 1, parenEnd);
            const params = paramString.split(',').map(p => p.trim()).filter(Boolean);
            const body = afterName.substring(parenEnd + 1);
            
            // Skip if no parameters or variadic only
            if (params.length === 0 || (params.length === 1 && params[0] === '...')) {
                result.push(fullDefine);
                continue;
            }
            
            // Build parameter mapping (original -> lowercase)
            const paramMap = new Map<string, string>();
            for (const param of params) {
                // Skip variadic parameter
                if (param === '...' || param.includes('...')) {
                    continue;
                }
                const lowercase = param.toLowerCase();
                if (param !== lowercase) {
                    paramMap.set(param, lowercase);
                }
            }
            
            // Replace parameters in-place to preserve exact positions
            if (paramMap.size > 0) {
                for (const [original, lowercase] of paramMap.entries()) {
                    // Use word boundary to match only complete identifiers
                    const regex = new RegExp(`\\b${MacroUtils.escapeRegex(original)}\\b`, 'g');
                    fullDefine = fullDefine.replace(regex, lowercase);
                }
            }
            
            result.push(fullDefine);
        }
        
        return result.join(newlineChar);
    }

    /**
     * Check if a token at given position is adjacent to ## (token concatenation operator)
     * Returns true if the token should be skipped from diagnostics
     */
    static isAdjacentToTokenPaste(text: string, matchIndex: number, tokenLength: number): boolean {
        // Get some context around the match
        const beforeStart = Math.max(0, matchIndex - 10);
        const afterEnd = Math.min(text.length, matchIndex + tokenLength + 10);
        const context = text.substring(beforeStart, afterEnd);
        const relativeIndex = matchIndex - beforeStart;
        
        // Check if ## appears before the token (within reasonable distance)
        const before = context.substring(0, relativeIndex);
        if (/##\s*$/.test(before)) {
            return true;
        }
        
        // Check if ## appears after the token (within reasonable distance)
        const after = context.substring(relativeIndex + tokenLength);
        if (/^\s*##/.test(after)) {
            return true;
        }
        
        return false;
    }

    /**
     * Check if a position is inside a #define macro body
     * Returns true if the position should be skipped from immediate diagnostics
     * (will be checked via expansion results instead)
     * 
     * Handles multiline macros with backslash continuation
     */
    static isInsideDefineBody(text: string, position: number): boolean {
        // Find the line containing this position
        let lineStart = text.lastIndexOf('\n', position - 1) + 1;
        let lineEnd = text.indexOf('\n', position);
        if (lineEnd === -1) {
            lineEnd = text.length;
        }
        
        const line = text.substring(lineStart, lineEnd);
        const relativePos = position - lineStart;
        
        // Check if this line is a #define
        const defineMatch = line.match(/^\s*#\s*define\s+([A-Za-z_]\w*)(\s*\([^)]*\))?\s+/);
        if (defineMatch) {
            const bodyStart = defineMatch[0].length;
            // Position is in body if it's after the macro name and parameters
            return relativePos >= bodyStart;
        }
        
        // Check if we're in a continuation line of a multiline #define
        // Look backwards from current line to find if there's a #define with continuation
        let currentLineStart = lineStart;
        
        while (currentLineStart > 0) {
            // Move to previous line
            let prevLineEnd = currentLineStart - 1; // the '\n' before current line
            let prevLineStart = text.lastIndexOf('\n', prevLineEnd - 1) + 1;
            
            const prevLine = text.substring(prevLineStart, prevLineEnd);
            
            // Check if previous line ends with backslash (continuation)
            const hasContinuation = REGEX_PATTERNS.LINE_CONTINUATION.test(prevLine);
            
            if (!hasContinuation) {
                // No continuation, check if this line is a #define
                const prevDefineMatch = prevLine.match(/^\s*#\s*define\s+([A-Za-z_]\w*)(\s*\([^)]*\))?\s+/);
                if (prevDefineMatch) {
                    // Found a #define without continuation, so current position is NOT in its body
                    return false;
                }
                // Not a #define and no continuation, stop searching
                break;
            }
            
            // Has continuation, check if this is the #define line
            // Use \s* instead of \s+ to allow #define lines ending with backslash immediately after macro name/params
            // Example: "#define TST()\\" should match
            const prevDefineMatch = prevLine.match(/^\s*#\s*define\s+([A-Za-z_]\w*)(\s*\([^)]*\))?\s*/);
            if (prevDefineMatch) {
                // Found the #define that continues to our position
                // We're in a continuation line of this #define
                return true;
            }
            
            // Continue searching backwards
            currentLineStart = prevLineStart;
        }
        
        return false;
    }



    /**
     * Parse C/C++ macro definitions and type declarations from source code
     * Includes: #define macros, typedef, struct, enum, union
     */
    static parseMacros(content: string, filePath: string): MacroDef[] {
        // Check if type declaration detection is enabled
        const config = vscode.workspace.getConfiguration('macrolens');
        const detectTypes = config.get('detectTypeDeclarations', true);
        
        // Step 1: Remove all comments first
        const cleanContent = this.removeComments(content);
        
        const defs: MacroDef[] = [];
        const lines = cleanContent.split(/\r?\n/);
        
        // Regex for #define directives
        // CRITICAL: We must preserve the space (or lack thereof) between macro name and (
        // - #define FOO(x) -> function-like (no space before paren)
        // - #define FOO (x) -> object-like (space before paren, body is (x))
        // So we capture everything after the macro name WITHOUT trimming/consuming spaces
        const defineRegex = REGEX_PATTERNS.DEFINE_DIRECTIVE;
        
        // Regex for type declarations (typedef, struct, enum, union)
        // These patterns detect type names to avoid false "undefined macro" warnings
        
        // Pattern for typedef with multiple names: typedef struct a A, *A_PTR;
        const typedefRegex = REGEX_PATTERNS.TYPEDEF_DIRECTIVE;
        
        // Pattern for struct/union/enum definitions with name and optional body
        const structRegex = REGEX_PATTERNS.STRUCT_DECLARATION;
        const unionRegex = REGEX_PATTERNS.UNION_DECLARATION;
        const enumRegex = REGEX_PATTERNS.ENUM_DECLARATION;
        const anonymousEnumRegex = REGEX_PATTERNS.ANONYMOUS_ENUM_DECLARATION;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            
            // Clean up extra whitespace but preserve structure
            line = line.replace(/[ \t]+/g, ' ').trim();
            
            // Try to match #define (highest priority)
            const defineMatch = line.match(defineRegex);
            if (defineMatch) {
                // Handle multi-line macros with line continuation
                let originalLineNumber = i + 1;
                while (line.endsWith('\\') && i + 1 < lines.length) {
                    line = line.slice(0, -1) + ' ' + lines[++i].replace(/[ \t]+/g, ' ').trim();
                }

                // Re-match the complete line after multi-line merging
                const completeMatch = line.match(defineRegex);
                if (!completeMatch) { continue; }

                const name = completeMatch[1];
                const restOfLine = completeMatch[2]; // Everything after macro name (may have leading space)
                
                let params: string[] | undefined;
                let body = '';
                
                // Check if this is a function-like macro
                // Per C/C++ standard: function-like macros have NO space between name and (
                // - #define FOO(x) -> function-like (no space before paren)
                // - #define FOO (x) -> object-like (space before paren, body is (x))
                const firstNonSpace = restOfLine.trimStart();
                const hasSpaceBeforeParen = restOfLine.length !== firstNonSpace.length;
                
                if (firstNonSpace.startsWith('(') && !hasSpaceBeforeParen) {
                    // Function-like macro: find matching closing paren for parameters
                    let depth = 0;
                    let paramEndIndex = -1;
                    
                    for (let j = 0; j < firstNonSpace.length; j++) {
                        if (firstNonSpace[j] === '(') {
                            depth++;
                        } else if (firstNonSpace[j] === ')') {
                            depth--;
                            if (depth === 0) {
                                paramEndIndex = j;
                                break;
                            }
                        }
                    }
                    
                    if (paramEndIndex !== -1) {
                        // Extract parameter list
                        const paramString = firstNonSpace.substring(1, paramEndIndex);
                        params = paramString.split(',').map(p => p.trim()).filter(Boolean);
                        
                        // Everything after the closing paren is the body
                        body = firstNonSpace.substring(paramEndIndex + 1).trim();
                    } else {
                        // No matching closing paren found - treat entire rest as body
                        body = firstNonSpace.trim();
                    }
                } else {
                    // Object-like macro - everything after name is body
                    body = firstNonSpace.trim();
                }
                
                // Normalize whitespace in body (comments already removed)
                body = body.replace(/\s+/g, ' ').trim();

                defs.push({
                    name,
                    params,
                    body,
                    file: filePath,
                    line: originalLineNumber,
                    isDefine: true  // This is a real #define macro
                });
                continue;
            }
            
            // Skip type declaration detection if disabled in settings
            if (!detectTypes) {
                continue;
            }
            
            // Handle typedef declarations (can have multiple names separated by commas)
            // Examples:
            //   typedef struct a A, *A_PTR;
            //   typedef unsigned int TEST, *TEST_PTR;
            //   typedef struct { int x; } MY_STRUCT;
            if (typedefRegex.test(line)) {
                // Collect multiline typedef if it spans multiple lines
                let fullLine = line;
                let lineNum = i + 1;
                
                // Track brace depth to handle typedef struct { ... } NAME;
                let braceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
                
                // Continue until we find semicolon at depth 0
                while (i + 1 < lines.length) {
                    // Check if we have semicolon at depth 0
                    if (braceDepth === 0 && fullLine.includes(';')) {
                        break;
                    }
                    
                    // Add next line
                    const nextLine = lines[++i].replace(/[ \t]+/g, ' ').trim();
                    fullLine += ' ' + nextLine;
                    
                    // Update brace depth
                    braceDepth += (nextLine.match(/\{/g) || []).length - (nextLine.match(/\}/g) || []).length;
                    
                    // If we have semicolon at depth 0, we're done
                    if (braceDepth === 0 && nextLine.includes(';')) {
                        break;
                    }
                }
                
                // Extract all uppercase identifiers after 'typedef'
                // This handles: typedef struct a A, *A_PTR, **A_PTR_PTR;
                const afterTypedef = fullLine.substring(fullLine.indexOf('typedef') + 7);
                
                // Find all uppercase identifiers (potential type names)
                const uppercasePattern = /\b([A-Z_][A-Z0-9_]*)\b/g;
                let match;
                const foundNames = new Set<string>();
                
                while ((match = uppercasePattern.exec(afterTypedef)) !== null) {
                    const name = match[1];
                    // Skip common keywords
                    if (name !== 'STRUCT' && name !== 'UNION' && name !== 'ENUM') {
                        foundNames.add(name);
                    }
                }
                
                // Add all found typedef names to database
                for (const name of foundNames) {
                    defs.push({
                        name,
                        params: undefined,
                        body: '/* typedef */',
                        file: filePath,
                        line: lineNum,
                        isDefine: false
                    });
                }
                
                continue;
            }
            
            // Handle struct declarations (can span multiple lines)
            // Examples:
            //   struct A { int x; };
            //   struct B
            //   {
            //       int x;
            //   };
            const structMatch = line.match(structRegex);
            if (structMatch) {
                const name = structMatch[1];
                defs.push({
                    name,
                    params: undefined,
                    body: '/* struct */',
                    file: filePath,
                    line: i + 1,
                    isDefine: false
                });
                continue;
            }
            
            // Handle union declarations
            const unionMatch = line.match(unionRegex);
            if (unionMatch) {
                const name = unionMatch[1];
                defs.push({
                    name,
                    params: undefined,
                    body: '/* union */',
                    file: filePath,
                    line: i + 1,
                    isDefine: false
                });
                continue;
            }
            
            // Handle enum declarations and extract enum constants
            // Example:
            //   enum E { TST1 = 0, TST2, TST3 };
            //   enum { CONST1, CONST2 };  (anonymous enum)
            const enumMatch = line.match(enumRegex);
            const isAnonymousEnum = anonymousEnumRegex.test(line);
            
            if (enumMatch || isAnonymousEnum) {
                let enumName: string | undefined;
                
                if (enumMatch) {
                    enumName = enumMatch[1];
                    
                    // Add the enum type itself
                    defs.push({
                        name: enumName,
                        params: undefined,
                        body: '/* enum */',
                        file: filePath,
                        line: i + 1,
                        isDefine: false
                    });
                }
                
                // Collect full enum definition (may span multiple lines)
                let fullEnum = line;
                let enumLineNum = i + 1;
                
                // Keep reading until we find the closing brace and semicolon
                while (!fullEnum.includes('}') && i + 1 < lines.length) {
                    fullEnum += ' ' + lines[++i].replace(/[ \t]+/g, ' ').trim();
                }
                
                // Extract enum constants between { and }
                const braceStart = fullEnum.indexOf('{');
                const braceEnd = fullEnum.indexOf('}');
                
                if (braceStart !== -1 && braceEnd !== -1) {
                    const enumBody = fullEnum.substring(braceStart + 1, braceEnd);
                    
                    // Split by comma and extract uppercase identifiers
                    const enumConstants = enumBody.split(',');
                    
                    for (const constant of enumConstants) {
                        // Extract the name (before = if present)
                        const eqIndex = constant.indexOf('=');
                        const namepart = eqIndex !== -1 ? constant.substring(0, eqIndex) : constant;
                        const trimmedName = namepart.trim();
                        
                        // Check if it's an uppercase identifier
                        if (/^[A-Z_][A-Z0-9_]*$/.test(trimmedName)) {
                            defs.push({
                                name: trimmedName,
                                params: undefined,
                                body: '/* enum constant */',
                                file: filePath,
                                line: enumLineNum,
                                isDefine: false
                            });
                        }
                    }
                }
                
                continue;
            }
        }

        return defs;
    }
}