"use strict";
/**
 * Unit tests for MacroParser
 * Priority: P0 - Core parsing logic
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const macroParser_1 = require("../../../src/core/macroParser");
suite('MacroParser Tests', () => {
    suite('Comment Removal', () => {
        test('should remove C-style block comments', () => {
            const input = 'code /* comment */ more';
            const result = macroParser_1.MacroParser.removeComments(input);
            assert.ok(!result.includes('comment'), 'Should remove block comment');
            assert.ok(result.includes('code'), 'Should keep code');
        });
        test('should remove C++ single-line comments', () => {
            const input = 'code // comment\nmore';
            const result = macroParser_1.MacroParser.removeComments(input);
            assert.ok(!result.includes('comment'), 'Should remove line comment');
            assert.ok(result.includes('code'), 'Should keep code before comment');
        });
        test('should preserve string literals with comment-like content', () => {
            const input = 'printf("/* not a comment */")';
            const result = macroParser_1.MacroParser.removeComments(input);
            assert.ok(result.includes('not a comment'), 'Should preserve string content');
        });
        test('should handle nested comments correctly', () => {
            const input = 'code /* outer /* inner */ still comment */ more';
            const result = macroParser_1.MacroParser.removeComments(input);
            assert.ok(result.includes('code'), 'Should keep code');
            assert.ok(result.includes('more'), 'Should keep code after comment');
        });
        test('should handle multiline comments', () => {
            const input = 'code\n/* line1\nline2\nline3 */\nmore';
            const result = macroParser_1.MacroParser.removeComments(input);
            assert.ok(result.includes('code'), 'Should keep code before comment');
            assert.ok(result.includes('more'), 'Should keep code after comment');
            assert.ok(!result.includes('line1'), 'Should remove comment content');
        });
    });
    suite('Preprocessor Directive Removal', () => {
        test('should remove #if, #ifdef, #ifndef directives', () => {
            const input = '#if DEBUG\n#define TEST 1\n#endif';
            const result = macroParser_1.MacroParser.removePreprocessorDirectives(input);
            assert.ok(!result.includes('#if'), 'Should remove #if');
            assert.ok(!result.includes('#endif'), 'Should remove #endif');
            assert.ok(result.includes('#define'), 'Should keep #define');
        });
        test('should keep #define directives', () => {
            const input = '#define MACRO 1\n#include <stdio.h>';
            const result = macroParser_1.MacroParser.removePreprocessorDirectives(input);
            assert.ok(result.includes('#define'), 'Should keep #define');
            assert.ok(!result.includes('#include'), 'Should remove #include');
        });
        test('should preserve line numbers', () => {
            const input = 'line1\n#if 0\nline3\n#endif\nline5';
            const result = macroParser_1.MacroParser.removePreprocessorDirectives(input);
            const lineCount = result.split('\n').length;
            assert.strictEqual(lineCount, input.split('\n').length, 'Should preserve line count');
        });
    });
    suite('Token Paste Detection', () => {
        test('should detect ## before token', () => {
            const text = 'PREFIX_##SUFFIX';
            const isAdjacent = macroParser_1.MacroParser.isAdjacentToTokenPaste(text, 9, 6);
            assert.strictEqual(isAdjacent, true, 'Should detect ## before token');
        });
        test('should detect ## after token', () => {
            const text = 'PREFIX##_SUFFIX';
            const isAdjacent = macroParser_1.MacroParser.isAdjacentToTokenPaste(text, 0, 6);
            assert.strictEqual(isAdjacent, true, 'Should detect ## after token');
        });
        test('should return false for non-adjacent ##', () => {
            const text = 'TOKEN1 TOKEN2';
            const isAdjacent = macroParser_1.MacroParser.isAdjacentToTokenPaste(text, 0, 6);
            assert.strictEqual(isAdjacent, false, 'Should return false when no ##');
        });
    });
    suite('Macro Parameter Detection', () => {
        test('should detect tokens inside parameter list', () => {
            const text = '#define FOO(BAR, BAZ) (BAR + BAZ)';
            const position = text.indexOf('BAR');
            const isInParams = macroParser_1.MacroParser.isInsideDefineParameters(text, position);
            assert.strictEqual(isInParams, true, 'Should detect parameter in list');
        });
        test('should return false for tokens in macro body', () => {
            const text = '#define FOO(X) (X + Y)';
            const position = text.indexOf('Y');
            const isInParams = macroParser_1.MacroParser.isInsideDefineParameters(text, position);
            assert.strictEqual(isInParams, false, 'Should return false for body tokens');
        });
        test('should handle macros without parameters', () => {
            const text = '#define FOO 42';
            const position = text.indexOf('FOO') + 3;
            const isInParams = macroParser_1.MacroParser.isInsideDefineParameters(text, position);
            assert.strictEqual(isInParams, false, 'Should return false for object-like macros');
        });
    });
    suite('Macro Body Detection', () => {
        test('should detect tokens in macro body', () => {
            const text = '#define FOO BAR';
            const position = text.indexOf('BAR');
            const isInBody = macroParser_1.MacroParser.isInsideDefineBody(text, position);
            assert.strictEqual(isInBody, true, 'Should detect token in body');
        });
        test('should return false for tokens before body', () => {
            const text = '#define FOO BAR';
            const position = text.indexOf('FOO');
            const isInBody = macroParser_1.MacroParser.isInsideDefineBody(text, position);
            assert.strictEqual(isInBody, false, 'Should return false for macro name');
        });
        test('should handle multiline macros', () => {
            const text = '#define FOO \\\n    BAR \\\n    BAZ';
            const position = text.indexOf('BAZ');
            const isInBody = macroParser_1.MacroParser.isInsideDefineBody(text, position);
            assert.strictEqual(isInBody, true, 'Should detect token in multiline body');
        });
    });
    suite('Parentheses Balance Checking', () => {
        test('should detect balanced parentheses', () => {
            const balanced = '((a + b) * (c + d))';
            const result = macroParser_1.MacroParser.checkParenthesesBalance(balanced);
            assert.strictEqual(result.balanced, true, 'Should detect balanced parentheses');
        });
        test('should detect missing closing parenthesis', () => {
            const unbalanced = '((a + b)';
            const result = macroParser_1.MacroParser.checkParenthesesBalance(unbalanced);
            assert.strictEqual(result.balanced, false, 'Should detect missing closing paren');
            assert.ok(result.message, 'Should provide error message');
        });
        test('should detect extra closing parenthesis', () => {
            const unbalanced = 'a + b))';
            const result = macroParser_1.MacroParser.checkParenthesesBalance(unbalanced);
            assert.strictEqual(result.balanced, false, 'Should detect extra closing paren');
            assert.ok(result.message, 'Should provide error message');
        });
    });
    suite('Edge Cases', () => {
        test('should handle empty input', () => {
            const result = macroParser_1.MacroParser.removeComments('');
            assert.strictEqual(result, '', 'Should handle empty string');
        });
        test('should handle input with only whitespace', () => {
            const result = macroParser_1.MacroParser.removeComments('   \n\t  ');
            assert.ok(result !== undefined, 'Should handle whitespace');
        });
        test('should handle very long lines', () => {
            const longLine = 'a'.repeat(10000);
            const result = macroParser_1.MacroParser.removeComments(longLine);
            assert.strictEqual(result.length, longLine.length, 'Should handle long lines');
        });
    });
});
//# sourceMappingURL=macroParser.test.js.map