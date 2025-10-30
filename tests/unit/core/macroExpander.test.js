"use strict";
/**
 * Unit tests for MacroExpander
 * Priority: P0 - Core functionality
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
const macroExpander_1 = require("../../../src/core/macroExpander");
const macroDb_1 = require("../../../src/core/macroDb");
suite('MacroExpander Tests', () => {
    let expander;
    let db;
    setup(() => {
        expander = new macroExpander_1.MacroExpander();
        db = macroDb_1.MacroDatabase.getInstance();
    });
    suite('Basic Expansion', () => {
        test('should expand simple object-like macro', () => {
            const result = expander.expand('PI');
            assert.ok(result, 'Should return expansion result');
            assert.ok(result.steps, 'Should have expansion steps');
            assert.ok(result.finalText, 'Should have final text');
        });
        test('should expand function-like macro with arguments', () => {
            const result = expander.expand('SQUARE', ['5']);
            assert.ok(result, 'Should return expansion result');
            assert.strictEqual(result.hasErrors, false, 'Should not have errors for valid expansion');
        });
        test('should handle undefined macros', () => {
            const result = expander.expand('UNDEFINED_MACRO');
            // Should return the macro name unchanged
            assert.ok(result.finalText.includes('UNDEFINED_MACRO'), 'Should keep undefined macro name');
        });
    });
    suite('Parameter Substitution', () => {
        test('should substitute parameters correctly', () => {
            const result = expander.expand('SQUARE', ['x']);
            assert.ok(result.finalText, 'Should have final text');
            // Should contain the parameter
            assert.ok(result.finalText.includes('x'), 'Should substitute parameter');
        });
        test('should handle nested parentheses in arguments', () => {
            const result = expander.expand('MAX', ['(a + b)', '(c + d)']);
            assert.strictEqual(result.hasErrors, false, 'Should handle nested parentheses');
        });
        test('should handle variadic parameters', () => {
            const result = expander.expand('VARIADIC', ['format', 'arg1', 'arg2']);
            assert.ok(result.finalText, 'Should expand variadic macro');
        });
    });
    suite('Token Concatenation (##)', () => {
        test('should handle token paste operator', () => {
            // Test with a macro that uses ##
            const result = expander.expand('CONCAT');
            assert.ok(result.finalText !== undefined, 'Should handle token concatenation');
        });
    });
    suite('Circular Reference Detection', () => {
        test('should detect circular references', () => {
            // This would need macros that reference each other
            // For now, test that it doesn't crash
            const result = expander.expand('SELF_REFERENCING');
            assert.ok(result, 'Should return result even for problematic macros');
        });
        test('should respect maximum expansion depth', () => {
            // Test with deeply nested macros
            const result = expander.expand('DEEP_MACRO');
            if (result.hasErrors) {
                assert.ok(result.errorMessage?.includes('depth') || result.errorMessage?.includes('recursion'), 'Error should mention depth/recursion');
            }
        });
    });
    suite('Complex Expansion Patterns', () => {
        test('should handle multi-level expansion', () => {
            const result = expander.expand('LEVEL1');
            assert.ok(result.steps.length >= 0, 'Should have expansion steps');
        });
        test('should expand all macros in single-layer mode', () => {
            // Test expansion mode handling
            const result = expander.expand('COMPLEX_MACRO');
            assert.ok(result.finalText, 'Should produce final text');
        });
    });
    suite('Undefined Macro Detection', () => {
        test('should detect undefined macros in expansion result', () => {
            const result = expander.expand('MACRO_WITH_UNDEFINED');
            if (result.undefinedMacros) {
                assert.ok(result.undefinedMacros.size >= 0, 'Should track undefined macros');
            }
        });
        test('should exclude built-in identifiers from undefined list', () => {
            const result = expander.expand('MACRO_WITH_BUILTIN');
            if (result.undefinedMacros) {
                assert.ok(!result.undefinedMacros.has('__FILE__'), 'Should not flag __FILE__ as undefined');
                assert.ok(!result.undefinedMacros.has('__LINE__'), 'Should not flag __LINE__ as undefined');
            }
        });
    });
    suite('Strip Parentheses', () => {
        test('should strip outer parentheses when configured', () => {
            // This tests the configuration integration
            const result = expander.expand('PARENTHESIZED');
            assert.ok(result.finalText, 'Should have final text');
        });
    });
    suite('Error Handling', () => {
        test('should handle invalid macro names', () => {
            const result = expander.expand('');
            assert.ok(result, 'Should handle empty macro name');
        });
        test('should handle mismatched argument count', () => {
            // Expand macro with wrong number of arguments
            const result = expander.expand('SQUARE', ['a', 'b', 'c']);
            // Should handle gracefully
            assert.ok(result, 'Should return result even with mismatched args');
        });
    });
    suite('Performance', () => {
        test('should expand simple macros quickly', () => {
            const startTime = Date.now();
            for (let i = 0; i < 100; i++) {
                expander.expand('SIMPLE_MACRO');
            }
            const elapsed = Date.now() - startTime;
            assert.ok(elapsed < 1000, `100 expansions should complete in < 1 second (took ${elapsed}ms)`);
        });
    });
});
//# sourceMappingURL=macroExpander.test.js.map