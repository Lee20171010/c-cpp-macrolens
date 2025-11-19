import * as assert from 'assert';
import * as vscode from 'vscode';
import { MacroDatabase } from '../core/macroDb';
import { MacroExpander } from '../core/macroExpander';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('should report final chained concatenation token', () => {
		const db = MacroDatabase.getInstance();
		const expander = new MacroExpander();
		const originalDefinitions = (db as any).definitions;
		const customDefinitions = new Map();
		customDefinitions.set('CHAIN_ABC', [{
			name: 'CHAIN_ABC',
			body: 'A##B##C',
			file: 'test.h',
			line: 1,
			isDefine: true
		}]);

		try {
			(db as any).definitions = customDefinitions;
			const result = expander.expand('CHAIN_ABC');

			assert.strictEqual(result.finalText.trim(), 'ABC');
			assert.deepStrictEqual(result.concatenatedMacros, ['ABC']);
		} finally {
			(db as any).definitions = originalDefinitions;
		}
	});

	test('should not expand macros inside string literals', () => {
		const db = MacroDatabase.getInstance();
		const expander = new MacroExpander();
		const originalDefinitions = (db as any).definitions;
		const customDefinitions = new Map();
		customDefinitions.set('FOO', [{
			name: 'FOO',
			body: '123',
			file: 'test.h',
			line: 1,
			isDefine: true
		}]);
		customDefinitions.set('WRAPPED', [{
			name: 'WRAPPED',
			body: '"FOO"',
			file: 'test.h',
			line: 2,
			isDefine: true
		}]);

		try {
			(db as any).definitions = customDefinitions;
			const result = expander.expand('WRAPPED');
			assert.strictEqual(result.finalText.trim(), '"FOO"');
		} finally {
			(db as any).definitions = originalDefinitions;
		}
	});
});
