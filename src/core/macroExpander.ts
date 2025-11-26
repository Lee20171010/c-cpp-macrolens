import { Configuration } from '../configuration';
import { MacroDatabase } from './macroDb';
import { MacroUtils, ConcatenationEvent } from '../utils/macroUtils';
import { BUILTIN_IDENTIFIERS, REGEX_PATTERNS } from '../utils/constants';

export interface ExpansionStep {
    from: string;
    to: string;
    macro: string;
    note?: string;
    level: number;
}

export interface ExpansionResult {
    steps: ExpansionStep[];
    finalText: string;
    isComplete: boolean;
    numericValue?: number;
    hasErrors: boolean;
    errorMessage?: string;
    undefinedMacros?: Set<string>;  // Macros found in final result but not defined
    concatenatedMacros?: string[];  // Macro-like tokens formed via ## during expansion
}

type ConcatenatedMacroTracker = Map<string, number>;

export class MacroExpander {
    private db: MacroDatabase;
    private static readonly MACRO_NAME_REGEX = /^[A-Z_][A-Z0-9_]*$/;

    constructor() {
        this.db = MacroDatabase.getInstance();
    }

    expand(macroName: string, args?: string[]): ExpansionResult {
        const config = Configuration.getInstance().getConfig();
        const steps: ExpansionStep[] = [];
        const concatenatedMacros: ConcatenatedMacroTracker = new Map();
        
        const defs = this.db.getDefinitions(macroName);
        
        // Skip if this is not a #define macro (typedef, struct, enum, union, etc.)
        if (defs.length > 0 && defs[0].isDefine === false) {
            return {
                finalText: macroName,
                steps: [],
                isComplete: true,
                hasErrors: false
            };
        }
        
        try {
            // Track expansion chain for circular reference detection
            const expansionChain = new Set<string>();
            const result = this.expandRecursive(
                macroName, args, steps, 
                0,  // Initial depth level
                config.maxExpansionDepth, 
                expansionChain,
                concatenatedMacros
            );
            
            let finalText = result;
            if (config.stripExtraParentheses) {
                finalText = MacroUtils.stripParentheses(finalText);
            }

            // Check for undefined macros in final result
            // Pass the macro's parameters to exclude them from undefined checks
            const params = defs.length > 0 ? defs[0].params : undefined;
            const undefinedMacros = this.findUndefinedMacrosInText(finalText, params);
            const concatenatedList = this.getActiveConcatenatedMacros(concatenatedMacros);

            // Return expansion result without numeric evaluation
            return {
                steps,
                finalText,
                isComplete: steps.length > 0,
                hasErrors: false,
                undefinedMacros: undefinedMacros.size > 0 ? undefinedMacros : undefined,
                concatenatedMacros: concatenatedList
            };
        } catch (error) {
            return {
                steps,
                finalText: macroName,
                isComplete: false,
                hasErrors: true,
                errorMessage: String(error)
            };
        }
    }

    /**
     * Find all uppercase identifiers in text that look like macros but are not defined
     * @param text The text to search
     * @param excludeParams Optional parameter names to exclude (e.g., macro parameters)
     */
    private findUndefinedMacrosInText(text: string, excludeParams?: string[]): Set<string> {
        const undefined = new Set<string>();
        
        // Precompute string literal ranges so we can ignore uppercase tokens inside quotes
        const stringLiteralRanges = MacroUtils.getStringLiteralRanges(text);

        // Match uppercase identifiers (potential macros)
        // Pattern: word starting with uppercase, containing at least one more uppercase or underscore
        let match;
        REGEX_PATTERNS.MACRO_NAME.lastIndex = 0;
        
        while ((match = REGEX_PATTERNS.MACRO_NAME.exec(text)) !== null) {
            const name = match[0];
            const matchIndex = match.index ?? text.indexOf(name);

            // Ignore names that occur inside string literals
            if (MacroUtils.isIndexWithinRanges(matchIndex, stringLiteralRanges)) {
                continue;
            }
            
            // Skip built-in preprocessor identifiers
            if (BUILTIN_IDENTIFIERS.has(name)) {
                continue;
            }
            
            // Skip if this is a parameter name
            if (excludeParams && excludeParams.includes(name)) {
                continue;
            }
            
            // Check if it's defined in database
            const defs = this.db.getDefinitions(name);
            if (defs.length === 0) {
                undefined.add(name);
            }
        }
        
        return undefined;
    }

    private expandRecursive(
        macroName: string, 
        args: string[] | undefined, 
        steps: ExpansionStep[], 
        level: number, 
        maxDepth: number,
        expansionChain: Set<string>,
        concatenatedMacros: ConcatenatedMacroTracker
    ): string {
        if (level >= maxDepth) {
            throw new Error('Maximum expansion depth reached - possible infinite recursion');
        }

        // Create unique identifier for this macro expansion
        const macroId = args ? `${macroName}(${args.join(',')})` : macroName;
        
        // Check for circular reference
        if (expansionChain.has(macroId)) {
            const chain = Array.from(expansionChain).concat(macroId).join(' → ');
            throw new Error(`Circular macro reference detected: ${chain}`);
        }

        const defs = this.db.getDefinitions(macroName);
        if (defs.length === 0) {
            return macroName;
        }

        const def = defs[0];
        
        // Check for unbalanced parentheses in macro definition
        if (def.body.startsWith('/*UNBALANCED*/')) {
            throw new Error(`Macro '${macroName}' has unbalanced parentheses in definition`);
        }
        
        // Skip if this is not a #define macro (typedef, struct, enum, union, etc.)
        if (def.isDefine === false) {
            return macroName;
        }
        
        let expanded = def.body;

        // Add current macro to expansion chain
        expansionChain.add(macroId);

        // Handle macros with parameters
        if (def.params && def.params.length > 0 && args) {
            // Create argument expander function
            // This will be called for arguments that need pre-expansion
            const expandArg = (arg: string): string => {
                // Expand macros in the argument
                return this.expandMacrosInText(
                    arg,
                    [],
                    level + 1,
                    maxDepth,
                    new Set(expansionChain),
                    concatenatedMacros
                );
            };
            
            // Substitute parameters with correct expansion rules
            // Arguments adjacent to ## or # are NOT expanded
            // Other arguments ARE expanded before substitution
            expanded = MacroUtils.substituteParameters(
                expanded,
                def.params,
                args,
                expandArg,
                event => this.recordConcatenatedMacro(event, concatenatedMacros)
            );
        } else {
            // Object-like macro: still need to process ## token concatenation
            // Example: #define Z (L##M) should expand to (LM)
            expanded = MacroUtils.processTokenConcatenation(
                expanded,
                event => this.recordConcatenatedMacro(event, concatenatedMacros)
            );
        }

        // Record this expansion step
        const inputText = args ? `${macroName}(${args.join(', ')})` : macroName;
        steps.push({
            from: inputText,
            to: expanded,
            macro: macroName,
            note: args ? 'Function-like macro expansion' : 'Object-like macro expansion',
            level
        });

        // Find macros that need further expansion, passing the chain
        // This is the "rescan" step in standard preprocessing
        const furtherExpanded = this.expandMacrosInText(
            expanded,
            steps,
            level + 1,
            maxDepth,
            expansionChain,
            concatenatedMacros
        );
        
        // Remove current macro from chain (backtrack for parallel expansions)
        expansionChain.delete(macroId);
        
        return furtherExpanded;
    }

    private expandMacrosInText(
        text: string, 
        steps: ExpansionStep[], 
        level: number, 
        maxDepth: number,
        expansionChain: Set<string>,
        concatenatedMacros: ConcatenatedMacroTracker
    ): string {
        if (level >= maxDepth) {
            return text;
        }

        const config = Configuration.getInstance().getConfig();
        let currentText = text;
        
        while (true) {
            const expandedText = config.expansionMode === 'single-layer' 
                ? this.expandSingleLayer(currentText, steps, level, maxDepth, expansionChain, concatenatedMacros)
                : this.expandSingleMacro(currentText, steps, level, maxDepth, expansionChain, concatenatedMacros);
            
            if (expandedText === currentText || level >= maxDepth) {
                break; // No more expansions possible or max depth reached
            }
            
            currentText = expandedText;
            level++;
        }
        
        return currentText;
    }

    /**
     * Expand all macros at the same nesting level simultaneously
     */
    private expandSingleLayer(
        text: string, 
        steps: ExpansionStep[], 
        level: number, 
        maxDepth: number,
        expansionChain: Set<string>,
        concatenatedMacros: ConcatenatedMacroTracker
    ): string {
        if (level >= maxDepth) {
            return text;
        }

        // Find all expandable macros at the deepest level
        const macros = this.findMacrosAtDeepestLevel(text);
        
        if (macros.length === 0) {
            return text; // No more macros to expand
        }

        // Sort by position (descending) to avoid index shifting issues
        macros.sort((a, b) => b.startIndex - a.startIndex);
        
        let expandedText = text;
        const expandedMacros: string[] = [];
        
        for (const macro of macros) {
            // Check for circular reference
            const macroId = macro.args ? `${macro.name}(${macro.args.join(',')})` : macro.name;
            if (expansionChain.has(macroId)) {
                console.warn(`MacroLens: Skipping circular reference: ${macroId}`);
                continue;
            }

            const defs = this.db.getDefinitions(macro.name);
            if (defs.length === 0) {
                continue;
            }
            
            const def = defs[0];
            
            // Check for unbalanced parentheses in macro definition
            if (def.body.startsWith('/*UNBALANCED*/')) {
                throw new Error(`Macro '${macro.name}' has unbalanced parentheses in definition`);
            }
            
            // Check parameter matching
            if (def.params) {
                // Function-like macro
                if (!macro.args) {
                    continue; // Invoked without arguments
                }

                if (def.params.length > 0) {
                    // Handle variadic macros (params ending with ...)
                    const isVariadic = def.params.some(p => p.includes('...'));
                    if (isVariadic) {
                        // For variadic macros, we need at least as many args as non-variadic params
                        const minParams = def.params.filter(p => !p.includes('...')).length;
                        if (macro.args.length < minParams) {
                            continue;
                        }
                    } else {
                        // Regular macro - exact parameter count match
                        if (macro.args.length !== def.params.length) {
                            continue;
                        }
                    }
                } else {
                    // Function-like macro with 0 parameters (e.g. #define AB() 10)
                    // Must be invoked with empty arguments list
                    if (macro.args.length !== 0) {
                        continue;
                    }
                }
            } else if (macro.args) {
                // Object-like macro invoked as function
                continue;
            }
            
            // Perform substitution
            let substituted = def.body;
            if (def.params && def.params.length > 0 && macro.args) {
                substituted = MacroUtils.substituteParameters(
                    substituted,
                    def.params,
                    macro.args,
                    undefined,
                    event => this.recordConcatenatedMacro(event, concatenatedMacros)
                );
            }
            
            // Replace in text
            expandedText = expandedText.substring(0, macro.startIndex) + 
                         substituted + 
                         expandedText.substring(macro.endIndex);
            
            expandedMacros.push(macro.args ? `${macro.name}(${macro.args.join(', ')})` : macro.name);
        }
        
        if (expandedMacros.length > 0) {
            steps.push({
                from: text,
                to: expandedText,
                macro: expandedMacros.join(', '),
                note: `Expand macros at same level: ${expandedMacros.join(', ')}`,
                level
            });
        }
        
        return expandedText;
    }

    /**
     * Expand one macro at a time, starting from innermost
     */
    private expandSingleMacro(
        text: string, 
        steps: ExpansionStep[], 
        level: number, 
        maxDepth: number,
        expansionChain: Set<string>,
        concatenatedMacros: ConcatenatedMacroTracker
    ): string {
        if (level >= maxDepth) {
            return text;
        }

        // Find the innermost expandable macro
        const macro = this.findInnermostMacro(text);
        
        if (!macro) {
            return text; // No more macros to expand
        }

        // Check for circular reference
        const macroId = macro.args ? `${macro.name}(${macro.args.join(',')})` : macro.name;
        if (expansionChain.has(macroId)) {
            console.warn(`MacroLens: Skipping circular reference: ${macroId}`);
            return text;
        }

        const defs = this.db.getDefinitions(macro.name);
        if (defs.length === 0) {
            return text;
        }

        const def = defs[0];
        
        // Check for unbalanced parentheses in macro definition
        if (def.body.startsWith('/*UNBALANCED*/')) {
            throw new Error(`Macro '${macro.name}' has unbalanced parentheses in definition`);
        }
        
        // Check parameter matching
        if (def.params) {
            // Function-like macro
            if (!macro.args) {
                return text; // Invoked without arguments
            }

            if (def.params.length > 0) {
                // Handle variadic macros (params ending with ...)
                const isVariadic = def.params.some(p => p.includes('...'));
                if (isVariadic) {
                    // For variadic macros, we need at least as many args as non-variadic params
                    const minParams = def.params.filter(p => !p.includes('...')).length;
                    if (macro.args.length < minParams) {
                        return text;
                    }
                } else {
                    // Regular macro - exact parameter count match
                    if (macro.args.length !== def.params.length) {
                        return text;
                    }
                }
            } else {
                // Function-like macro with 0 parameters (e.g. #define AB() 10)
                // Must be invoked with empty arguments list
                if (macro.args.length !== 0) {
                    return text;
                }
            }
        } else if (macro.args) {
            // Object-like macro invoked as function
            return text;
        }
        
        // Perform substitution
        let substituted = def.body;
        if (def.params && def.params.length > 0 && macro.args) {
            substituted = MacroUtils.substituteParameters(
                substituted,
                def.params,
                macro.args,
                undefined,
                event => this.recordConcatenatedMacro(event, concatenatedMacros)
            );
        }
        
        // Replace in text
        const expandedText = text.substring(0, macro.startIndex) + 
                           substituted + 
                           text.substring(macro.endIndex);
        
        const macroDisplay = macro.args ? `${macro.name}(${macro.args.join(', ')})` : macro.name;
        steps.push({
            from: text,
            to: expandedText,
            macro: macro.name,
            note: `Expand ${macroDisplay}`,
            level
        });
        
        return expandedText;
    }

    /**
     * Find all macros at the deepest nesting level
     */
    private findMacrosAtDeepestLevel(text: string): Array<{name: string, args?: string[], startIndex: number, endIndex: number, depth: number}> {
        const allMacros = this.findAllMacros(text);
        
        if (allMacros.length === 0) {
            return [];
        }
        
        // Find the maximum depth
        const maxDepth = Math.max(...allMacros.map(m => m.depth));
        
        // Return only macros at the maximum depth
        return allMacros.filter(m => m.depth === maxDepth);
    }

    /**
     * Find the innermost (deepest) expandable macro
     */
    private findInnermostMacro(text: string): {name: string, args?: string[], startIndex: number, endIndex: number, depth: number} | null {
        const allMacros = this.findAllMacros(text);
        
        if (allMacros.length === 0) {
            return null;
        }
        
        // Sort by depth (descending) then by position (ascending for same depth)
        allMacros.sort((a, b) => {
            if (a.depth !== b.depth) {
                return b.depth - a.depth; // Deeper first
            }
            return a.startIndex - b.startIndex; // Earlier position first for same depth
        });
        
        return allMacros[0];
    }

    private recordConcatenatedMacro(event: ConcatenationEvent, accumulator: ConcatenatedMacroTracker): void {
        if (!event) {
            return;
        }

        this.consumeConcatenatedToken(event.left, accumulator);
        this.consumeConcatenatedToken(event.right, accumulator);

        const token = event.combined;
        if (!token) {
            return;
        }
        if (!MacroExpander.MACRO_NAME_REGEX.test(token)) {
            return;
        }
        if (BUILTIN_IDENTIFIERS.has(token)) {
            return;
        }

        const current = accumulator.get(token) ?? 0;
        accumulator.set(token, current + 1);
    }

    private consumeConcatenatedToken(token: string | undefined, accumulator: ConcatenatedMacroTracker): void {
        if (!token) {
            return;
        }
        if (!accumulator.has(token)) {
            return;
        }
        const current = accumulator.get(token)!;
        if (current <= 1) {
            accumulator.delete(token);
        } else {
            accumulator.set(token, current - 1);
        }
    }

    private getActiveConcatenatedMacros(accumulator: ConcatenatedMacroTracker): string[] | undefined {
        if (accumulator.size === 0) {
            return undefined;
        }
        const tokens = Array.from(accumulator.keys());
        return tokens.length > 0 ? tokens : undefined;
    }

    /**
     * Find all macros in text with their nesting depth
     */
    private findAllMacros(text: string): Array<{name: string, args?: string[], startIndex: number, endIndex: number, depth: number}> {
        // Use unified macro finding with depth calculation and database validation
        const macros = MacroUtils.findAllMacros(text, {
            calculateDepth: true,
            validateWithDb: (macroName: string) => {
                const defs = this.db.getDefinitions(macroName);
                if (defs.length === 0) {
                    return false;
                }
                
                // For macros with parentheses, any macro is valid
                // For macros without parentheses, check parameter expectations
                return true;
            }
        });
        
        // Convert to expected format and filter based on parameter expectations
        return macros
            .filter(macro => {
                const defs = this.db.getDefinitions(macro.name);
                if (defs.length === 0) {
                    return false;
                }
                
                // Skip if this is not a #define macro (typedef, struct, enum, union, etc.)
                if (defs[0].isDefine === false) {
                    return false;
                }
                
                // If macro has no args but definition expects parameters, skip it
                if (!macro.args && defs[0].params && defs[0].params.length > 0) {
                    return false;
                }
                
                return true;
            })
            .map(macro => {
                return {
                    name: macro.name,
                    args: macro.args,
                    startIndex: macro.start,
                    endIndex: macro.end,
                    depth: macro.depth!
                };
            });
    }
}
