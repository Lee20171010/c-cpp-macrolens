import * as vscode from 'vscode';

export interface MacroLensConfig {
    stripExtraParentheses: boolean;
    enableTreeView: boolean;
    enableHoverProvider: boolean;
    enableDiagnostics: boolean;
    expansionMode: 'single-macro' | 'single-layer';
    debounceDelay: number;
    maxUpdateDelay: number;
    maxExpansionDepth: number;
}

export class Configuration {
    private static instance: Configuration;
    private constructor() {}

    static getInstance(): Configuration {
        if (!Configuration.instance) {
            Configuration.instance = new Configuration();
        }
        return Configuration.instance;
    }

    getConfig(): MacroLensConfig {
        const config = vscode.workspace.getConfiguration('macrolens');
        return {
            stripExtraParentheses: config.get('stripExtraParentheses', true),
            enableTreeView: config.get('enableTreeView', true),
            enableHoverProvider: config.get('enableHoverProvider', true),
            enableDiagnostics: config.get('enableDiagnostics', true),
            expansionMode: config.get('expansionMode', 'single-layer'),
            debounceDelay: config.get('debounceDelay', 500),
            maxUpdateDelay: config.get('maxUpdateDelay', 8000),
            maxExpansionDepth: config.get('maxExpansionDepth', 30)
        };
    }

    onConfigChange(callback: () => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('macrolens')) {
                callback();
            }
        });
    }
}