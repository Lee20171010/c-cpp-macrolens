import * as vscode from 'vscode';
import { MacroExpander } from '../core/macroExpander';
import { Configuration } from '../configuration';
import { MacroUtils } from '../utils/macroUtils';

class MacroNode extends vscode.TreeItem {
    public children: MacroNode[] = [];
    public isExpanded: boolean = false;

    constructor(
        public readonly macroName: string,
        public readonly args: string[] | undefined,
        public readonly expandedText: string | undefined = undefined,
        public readonly isRedefinition: boolean = false,
        public readonly redefinitionIndex: number = 0,
        public readonly level: number = 0,
        public readonly definitionContext: Map<string, number> = new Map()
    ) {
        const displayName = args ? `${macroName}(${args.join(', ')})` : macroName;
        
        // Determine label based on node type
        let label: string;
        if (level > 0 && expandedText) {
            // For non-root nodes with expanded text
            if (isRedefinition) {
                // Show expanded text with definition info
                // If macroName is provided, it indicates which macro has multiple definitions
                if (macroName) {
                    label = `${expandedText} [${macroName} def ${redefinitionIndex + 1}]`;
                } else {
                    label = `${expandedText} (definition ${redefinitionIndex + 1})`;
                }
            } else {
                // Show just the expanded text
                label = expandedText;
            }
        } else if (isRedefinition) {
            // Root level redefinition (shouldn't happen but handle it)
            label = `${displayName} (redefinition ${redefinitionIndex + 1})`;
        } else {
            // Normal display name
            label = displayName;
        }
        
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        
        this.tooltip = expandedText ? `${displayName} → ${expandedText}` : displayName;
        this.description = level === 0 ? 'Click to expand' : undefined;
        
        // Generate unique context value
        this.contextValue = `macroNode_${level}_${isRedefinition ? redefinitionIndex : 0}`;
        
        // Set the collapsible state
        // Root nodes and nodes with expanded text are collapsible
        if (level === 0 || expandedText) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        } else {
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
        }
    }

    addChild(child: MacroNode) {
        this.children.push(child);
        this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }

    getId(): string {
        // For non-root nodes, use expandedText to ensure uniqueness
        // since different expansion paths can lead to same macroName but different content
        if (this.level > 0 && this.expandedText) {
            // Use a hash or the full expandedText for uniqueness
            // To keep it readable, include key parts
            return `${this.macroName || 'expanded'}_L${this.level}_R${this.redefinitionIndex}_${this.expandedText.substring(0, 50)}`;
        }
        
        // For root nodes, use macro name and args
        const argsStr = this.args ? `(${this.args.join(',')})` : '';
        return `${this.macroName}${argsStr}_${this.level}_${this.redefinitionIndex}`;
    }
}

export class MacroTreeProvider implements vscode.TreeDataProvider<MacroNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<MacroNode | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private rootMacro: string | undefined;
    private rootArgs: string[] | undefined;
    private expandedNodes = new Map<string, MacroNode[]>(); // Track expanded children for each node

    constructor(
        private expander: MacroExpander,
        private config: Configuration
    ) {
        // Listen for configuration changes
        this.config.onConfigChange(() => {
            if (this.rootMacro) {
                this.showExpansion(this.rootMacro, this.rootArgs);
            }
        });

        // Listen for cursor position changes
        vscode.window.onDidChangeTextEditorSelection(this.onCursorPositionChanged.bind(this));
        vscode.window.onDidChangeActiveTextEditor(this.onActiveEditorChanged.bind(this));
    }

    getTreeItem(element: MacroNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: MacroNode): Thenable<MacroNode[]> {
        if (!element) {
            // Root level
            if (!this.rootMacro) {
                return Promise.resolve([]);
            }
            
            const rootNode = new MacroNode(this.rootMacro, this.rootArgs, undefined, false, 0, 0);
            return Promise.resolve([rootNode]);
        }

        // Check if this node has been expanded yet
        const nodeId = element.getId();
        if (this.expandedNodes.has(nodeId)) {
            const children = this.expandedNodes.get(nodeId) || [];
            // Update collapsible state based on actual children
            if (children.length === 0) {
                element.collapsibleState = vscode.TreeItemCollapsibleState.None;
            }
            return Promise.resolve(children);
        }

        // Generate children for this node
        const children = this.generateChildren(element);
        this.expandedNodes.set(nodeId, children);
        
        // Update collapsible state based on actual children
        if (children.length === 0) {
            element.collapsibleState = vscode.TreeItemCollapsibleState.None;
        }
        
        return Promise.resolve(children);
    }

    private generateChildren(parentNode: MacroNode): MacroNode[] {
        if (parentNode.level === 0) {
            // Root node: start the expansion process
            return this.generateExpansionSteps(parentNode);
        } else {
            // Non-root node: continue expansion from this point
            if (!parentNode.expandedText) {
                return [];
            }
            return this.generateExpansionSteps(parentNode);
        }
    }

    private generateExpansionSteps(parentNode: MacroNode): MacroNode[] {
        const children: MacroNode[] = [];
        const db = this.expander['db'];
        
        // Get the starting text for expansion
        let currentText: string;
        
        if (parentNode.level === 0) {
            // Root: Use expander.expand() to get the initial expansion
            // This ensures consistency with hover provider
            const result = this.expander.expand(parentNode.macroName, parentNode.args);
            
            if (!result.isComplete || result.hasErrors) {
                // No expansion possible or error occurred
                return children;
            }
            
            // Get the first expansion step
            if (result.steps.length > 0) {
                currentText = result.steps[0].to;
            } else {
                // No expansion steps - use final text
                const leafNode = new MacroNode(
                    '', undefined, result.finalText, false, 0,
                    parentNode.level + 1, new Map(parentNode.definitionContext)
                );
                leafNode.collapsibleState = vscode.TreeItemCollapsibleState.None;
                children.push(leafNode);
                return children;
            }
        } else {
            // Continue expanding from parent's expanded text
            currentText = parentNode.expandedText!;
        }

        // Now check if we need to expand and potentially create branches
        // Find the next macro(s) to expand
        const nextMacroToExpand = this.findNextMacroToExpand(currentText);
        
        if (!nextMacroToExpand) {
            // No more macros to expand - this is a leaf node
            if (parentNode.level > 0) {
                // Already showing the expanded text, no children needed
                return children;
            } else {
                // Root node with no expandable macros - show the definition as-is
                const leafNode = new MacroNode(
                    '', undefined, currentText, false, 0,
                    parentNode.level + 1, new Map(parentNode.definitionContext)
                );
                // This is a leaf node (no more macros to expand) - mark as not expandable
                leafNode.collapsibleState = vscode.TreeItemCollapsibleState.None;
                children.push(leafNode);
            }
            return children;
        }

        // Check if the macro to expand has multiple definitions
        const definitions = db.getDefinitions(nextMacroToExpand.name);
        
        if (definitions.length === 0) {
            // Macro not found in database - no expansion possible
            return children;
        }

        // Skip if this is not a #define macro (typedef, struct, enum, union, etc.)
        if (definitions[0].isDefine === false) {
            return children;
        }

        // Filter definitions that can actually be applied (parameter count must match)
        const applicableDefs = definitions.filter(def => {
            if (def.params && def.params.length > 0) {
                const isVariadic = def.params.some(p => p.includes('...'));
                if (isVariadic) {
                    const minParams = def.params.filter(p => !p.includes('...')).length;
                    return nextMacroToExpand.args && nextMacroToExpand.args.length >= minParams;
                } else {
                    return nextMacroToExpand.args && nextMacroToExpand.args.length === def.params.length;
                }
            } else {
                return !nextMacroToExpand.args;
            }
        });

        if (applicableDefs.length === 0) {
            // No applicable definitions
            return children;
        }

        // Create a branch for each applicable definition
        for (let i = 0; i < applicableDefs.length; i++) {
            const def = applicableDefs[i];
            
            // Perform substitution for this definition
            // IMPORTANT: Use the same logic as expander to handle ## and other operators
            let substituted = def.body;
            if (def.params && def.params.length > 0 && nextMacroToExpand.args) {
                // Use substituteParameters which handles ##, #, and argument expansion
                substituted = MacroUtils.substituteParameters(substituted, def.params, nextMacroToExpand.args);
            } else {
                // Object-like macro: process ## token concatenation
                substituted = MacroUtils.processTokenConcatenation(substituted);
            }
            
            // Replace in text
            const expandedText = currentText.substring(0, nextMacroToExpand.startIndex) + 
                               substituted + 
                               currentText.substring(nextMacroToExpand.endIndex);
            
            // Create node for this branch
            const isMultipleDefs = applicableDefs.length > 1;
            const stepNode = new MacroNode(
                isMultipleDefs ? nextMacroToExpand.name : '', // Store macro name if multiple defs
                undefined,
                expandedText,
                isMultipleDefs, // Mark as redefinition if multiple definitions
                i, // Definition index
                parentNode.level + 1,
                new Map(parentNode.definitionContext) // Inherit parent's context
            );
            
            // Check if this child will have further expansions
            // This prevents showing expand arrow on leaf nodes
            const hasMoreMacros = this.findNextMacroToExpand(expandedText) !== null;
            if (!hasMoreMacros) {
                // This is a leaf node - mark as not expandable
                stepNode.collapsibleState = vscode.TreeItemCollapsibleState.None;
            }
            
            children.push(stepNode);
        }

        return children;
    }

    /**
     * Find the next macro to expand based on expansion mode
     * Returns null if no expandable macro found
     */
    private findNextMacroToExpand(text: string): {name: string, args?: string[], startIndex: number, endIndex: number} | null {
        const config = this.config.getConfig();
        
        if (config.expansionMode === 'single-layer') {
            // In single-layer mode, find any one macro at the deepest level
            const macros = this.findMacrosAtDeepestLevel(text);
            return macros.length > 0 ? macros[0] : null;
        } else {
            // In single-macro mode, find the innermost macro
            return this.findInnermostMacro(text);
        }
    }

    /**
     * Expand all macros at the same nesting level
     */
    private expandSingleLayer(text: string): string | null {
        const macros = this.findMacrosAtDeepestLevel(text);
        
        
        if (macros.length === 0) {
            return null;
        }

        // Sort by position (descending) to avoid index shifting
        macros.sort((a, b) => b.startIndex - a.startIndex);
        
        let expandedText = text;
        const expandedMacros: string[] = [];
        
        for (const macro of macros) {
            const db = this.expander['db'];
            const defs = db.getDefinitions(macro.name);
            if (defs.length === 0) {
                continue;
            }
            
            const def = defs[0];
            
            // Check parameter matching
            
            if (def.params && def.params.length > 0) {
                // Handle variadic macros (params ending with ...)
                const isVariadic = def.params.some(p => p.includes('...'));
                if (isVariadic) {
                    // For variadic macros, we need at least as many args as non-variadic params
                    const minParams = def.params.filter(p => !p.includes('...')).length;
                    if (!macro.args || macro.args.length < minParams) {
                        continue;
                    }
                } else {
                    // Regular macro - exact parameter count match
                    if (!macro.args || macro.args.length !== def.params.length) {
                        continue;
                    }
                }
            } else if (macro.args) {
                continue;
            }
            
            // Perform substitution
            let substituted = def.body;
            if (def.params && def.params.length > 0 && macro.args) {
                substituted = MacroUtils.substituteParameters(substituted, def.params, macro.args);
            }
            
            
            // Replace in text
            expandedText = expandedText.substring(0, macro.startIndex) + 
                         substituted + 
                         expandedText.substring(macro.endIndex);
            
            expandedMacros.push(macro.name);
        }
        
        return expandedText === text ? null : expandedText;
    }

    /**
     * Expand one macro at a time
     */
    private expandSingleMacro(text: string): string | null {
        const macro = this.findInnermostMacro(text);
        
        if (!macro) {
            return null;
        }

        const db = this.expander['db'];
        const defs = db.getDefinitions(macro.name);
        if (defs.length === 0) {
            return null;
        }

        const def = defs[0];
        
        // Check parameter matching
        if (def.params && def.params.length > 0) {
            if (!macro.args || macro.args.length !== def.params.length) {
                return null;
            }
        } else if (macro.args) {
            return null;
        }
        
        // Perform substitution
        let substituted = def.body;
        if (def.params && def.params.length > 0 && macro.args) {
            substituted = MacroUtils.substituteParameters(substituted, def.params, macro.args);
        }
        
        // Replace in text
        const expandedText = text.substring(0, macro.startIndex) + 
                           substituted + 
                           text.substring(macro.endIndex);
        
        return expandedText;
    }

    private findMacrosAtDeepestLevel(text: string): Array<{name: string, args?: string[], startIndex: number, endIndex: number, depth: number}> {
        const allMacros = this.findAllMacros(text);
        
        
        if (allMacros.length === 0) {
            return [];
        }
        
        const maxDepth = Math.max(...allMacros.map(m => m.depth));
        const deepestMacros = allMacros.filter(m => m.depth === maxDepth);
        
        
        return deepestMacros;
    }

    private findInnermostMacro(text: string): {name: string, args?: string[], startIndex: number, endIndex: number, depth: number} | null {
        const allMacros = this.findAllMacros(text);
        
        if (allMacros.length === 0) {
            return null;
        }
        
        allMacros.sort((a, b) => {
            if (a.depth !== b.depth) {
                return b.depth - a.depth;
            }
            return a.startIndex - b.startIndex;
        });
        
        return allMacros[0];
    }

    private findAllMacros(text: string): Array<{name: string, args?: string[], startIndex: number, endIndex: number, depth: number}> {
        // Use unified macro finding with depth calculation and database validation
        const db = this.expander['db'];
        const macros = MacroUtils.findAllMacros(text, {
            calculateDepth: true,
            validateWithDb: (macroName: string) => {
                const defs = db.getDefinitions(macroName);
                if (defs.length === 0) {
                    return false;
                }
                return true;
            }
        });
        
        // Convert to expected format and filter based on parameter expectations
        return macros
            .filter(macro => {
                const defs = db.getDefinitions(macro.name);
                if (defs.length === 0) {
                    return false;
                }
                
                // If macro has no args but definition expects parameters, skip it
                if (!macro.args && defs[0].params && defs[0].params.length > 0) {
                    return false;
                }
                
                return true;
            })
            .map(macro => ({
                name: macro.name,
                args: macro.args,
                startIndex: macro.start,
                endIndex: macro.end,
                depth: macro.depth!
            }));
    }





    showExpansion(macroName: string, args?: string[]) {
        this.rootMacro = macroName;
        this.rootArgs = args;
        this.expandedNodes.clear(); // Reset expanded state
        this._onDidChangeTreeData.fire(undefined);
    }

    private onCursorPositionChanged(event: vscode.TextEditorSelectionChangeEvent) {
        if (event.textEditor.document.languageId === 'c' || event.textEditor.document.languageId === 'cpp') {
            this.updateCurrentMacro(event.textEditor);
        }
    }

    private onActiveEditorChanged(editor: vscode.TextEditor | undefined) {
        if (editor && (editor.document.languageId === 'c' || editor.document.languageId === 'cpp')) {
            this.updateCurrentMacro(editor);
        } else {
            this.clear();
        }
    }

    private updateCurrentMacro(editor: vscode.TextEditor) {
        const position = editor.selection.active;
        const macroInfo = this.findMacroAtPosition(editor.document, position);
        
        if (macroInfo) {
            // Check if this is a real #define macro (not a type declaration)
            const db = this.expander['db'];
            const defs = db.getDefinitions(macroInfo.name);
            
            // Skip if not found or if it's a type declaration (isDefine === false)
            if (defs.length === 0 || defs[0].isDefine === false) {
                this.clear();
                return;
            }
            
            // Only update if it's a different macro
            if (macroInfo.name !== this.rootMacro || 
                JSON.stringify(macroInfo.args) !== JSON.stringify(this.rootArgs)) {
                this.showExpansion(macroInfo.name, macroInfo.args);
            }
        } else {
            this.clear();
        }
    }

    private findMacroAtPosition(document: vscode.TextDocument, position: vscode.Position): {name: string, args?: string[]} | null {
        const line = document.lineAt(position.line);
        const text = line.text;
        
        // Use unified macro position finding
        const result = MacroUtils.findMacroAtPosition(text, position.character);
        
        // Convert result format to match expected return type
        return result ? { name: result.macroName, args: result.args } : null;
    }



    clear() {
        this.rootMacro = undefined;
        this.rootArgs = undefined;
        this.expandedNodes.clear();
        this._onDidChangeTreeData.fire(undefined);
    }

    getCurrentMacro(): {name: string, args?: string[]} | null {
        if (this.rootMacro) {
            return { name: this.rootMacro, args: this.rootArgs };
        }
        return null;
    }

    /**
     * Expand all macros at the same nesting level with definition context
     */
    private expandSingleLayerWithContext(text: string, defContext: Map<string, number>): string | null {
        const macros = this.findMacrosAtDeepestLevel(text);
        
        if (macros.length === 0) {
            return null;
        }

        // Sort by position (descending) to avoid index shifting
        macros.sort((a, b) => b.startIndex - a.startIndex);
        
        let expandedText = text;
        const expandedMacros: string[] = [];
        
        for (const macro of macros) {
            const db = this.expander['db'];
            const defs = db.getDefinitions(macro.name);
            if (defs.length === 0) {
                continue;
            }
            
            // Use definition context to select the right definition
            let def;
            if (defContext.has(macro.name) && defContext.get(macro.name)! < defs.length) {
                def = defs[defContext.get(macro.name)!];
            } else {
                def = defs[0];
            }
            
            // Check parameter matching
            if (def.params && def.params.length > 0) {
                // Handle variadic macros (params ending with ...)
                const isVariadic = def.params.some(p => p.includes('...'));
                if (isVariadic) {
                    // For variadic macros, we need at least as many args as non-variadic params
                    const minParams = def.params.filter(p => !p.includes('...')).length;
                    if (!macro.args || macro.args.length < minParams) {
                        continue;
                    }
                } else {
                    // Regular macro - exact parameter count match
                    if (!macro.args || macro.args.length !== def.params.length) {
                        continue;
                    }
                }
            } else if (macro.args) {
                continue;
            }
            
            // Perform substitution
            let substituted = def.body;
            if (def.params && def.params.length > 0 && macro.args) {
                substituted = MacroUtils.substituteParameters(substituted, def.params, macro.args);
            }
            
            // Replace in text
            expandedText = expandedText.substring(0, macro.startIndex) + 
                         substituted + 
                         expandedText.substring(macro.endIndex);
            
            expandedMacros.push(macro.name);
        }
        
        return expandedText === text ? null : expandedText;
    }

    /**
     * Expand one macro at a time with definition context
     */
    private expandSingleMacroWithContext(text: string, defContext: Map<string, number>): string | null {
        const macro = this.findInnermostMacro(text);
        
        if (!macro) {
            return null;
        }

        const db = this.expander['db'];
        const defs = db.getDefinitions(macro.name);
        if (defs.length === 0) {
            return null;
        }

        // Use definition context to select the right definition
        let def;
        if (defContext.has(macro.name) && defContext.get(macro.name)! < defs.length) {
            def = defs[defContext.get(macro.name)!];
        } else {
            def = defs[0];
        }
        
        // Check parameter matching
        if (def.params && def.params.length > 0) {
            if (!macro.args || macro.args.length !== def.params.length) {
                return null;
            }
        } else if (macro.args) {
            return null;
        }
        
        // Perform substitution
        let substituted = def.body;
        if (def.params && def.params.length > 0 && macro.args) {
            substituted = MacroUtils.substituteParameters(substituted, def.params, macro.args);
        }
        
        // Replace in text
        const expandedText = text.substring(0, macro.startIndex) + 
                           substituted + 
                           text.substring(macro.endIndex);
        
        return expandedText;
    }
}