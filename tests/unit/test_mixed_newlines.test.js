const assert = require('assert');
const { MacroParser } = require('../../../out/core/macroParser');

describe('MacroParser - Mixed Line Endings', () => {
    it('should handle \\n line endings', () => {
        const content = '#define FOO(X) (X + 1)\nFOO(123)\n';
        const result = MacroParser.lowercaseDefineParameters(content);
        
        // Parameter X should be lowercased to x
        assert.ok(result.includes('#define FOO(x) (x + 1)'), 'Parameter should be lowercased');
        // Should preserve \n
        assert.ok(result.includes('\n'), 'Should preserve \\n');
        assert.ok(!result.includes('\r\n'), 'Should not have \\r\\n');
    });

    it('should handle \\r\\n line endings', () => {
        const content = '#define BAR(Y) (Y * 2)\r\nBAR(456)\r\n';
        const result = MacroParser.lowercaseDefineParameters(content);
        
        // Parameter Y should be lowercased to y
        assert.ok(result.includes('#define BAR(y) (y * 2)'), 'Parameter should be lowercased');
        // Should preserve \r\n
        assert.ok(result.includes('\r\n'), 'Should preserve \\r\\n');
    });

    it('should handle mixed \\n and \\r\\n line endings', () => {
        // Mix of \n and \r\n in the same file
        const content = '#define FOO(X) (X + 1)\n#define BAR(Y) (Y * 2)\r\nFOO(X)\nBAR(Y)\r\n';
        const result = MacroParser.lowercaseDefineParameters(content);
        
        // Both parameters should be lowercased
        assert.ok(result.includes('#define FOO(x) (x + 1)'), 'FOO parameter should be lowercased');
        assert.ok(result.includes('#define BAR(y) (y * 2)'), 'BAR parameter should be lowercased');
        
        // Should preserve both types of line endings in their original positions
        const lines = result.split(/(\r\n|\r|\n)/);
        assert.ok(lines.some(l => l === '\n'), 'Should preserve \\n');
        assert.ok(lines.some(l => l === '\r\n'), 'Should preserve \\r\\n');
        
        // Verify exact structure
        assert.strictEqual(result.split('\n').length, content.split('\n').length, 'Line count should match');
    });

    it('should handle multiline macros with mixed endings', () => {
        // Multiline macro with different continuations
        const content = '#define MULTI(A, B) \\\n    (A + B) \\\r\n    * 2\n';
        const result = MacroParser.lowercaseDefineParameters(content);
        
        // Parameters should be lowercased
        assert.ok(result.includes('MULTI(a, b)'), 'Parameters should be lowercased');
        assert.ok(result.includes('(a + b)'), 'Parameter usage should be lowercased');
        
        // Original separators should be preserved
        assert.ok(result.includes('\\\n'), 'Should preserve \\\\\\n continuation');
        assert.ok(result.includes('\\\r\n'), 'Should preserve \\\\\\r\\n continuation');
    });

    it('should preserve exact character positions', () => {
        const content = '#define TEST(X) X\nTEST(123)';
        const result = MacroParser.lowercaseDefineParameters(content);
        
        // Only 'X' in parameter list and body should change, everything else stays same
        const expectedLength = content.length; // Same length since X->x is 1 char
        assert.strictEqual(result.length, expectedLength, 'Content length should be preserved');
        
        // Position of 'TEST(123)' should be unchanged
        const callPosition = content.indexOf('TEST(123)');
        assert.strictEqual(result.indexOf('TEST(123)'), callPosition, 'Call position should be unchanged');
    });

    it('should handle edge case: only \\r line endings', () => {
        // Old Mac OS style line endings (rare but possible)
        const content = '#define MAC(Z) (Z)\rMAC(789)\r';
        const result = MacroParser.lowercaseDefineParameters(content);
        
        // Parameter should be lowercased
        assert.ok(result.includes('#define MAC(z) (z)'), 'Parameter should be lowercased');
        // Should preserve \r
        assert.ok(result.includes('\r'), 'Should preserve \\r');
        assert.strictEqual(result.split('\r').length, content.split('\r').length, 'Line count should match');
    });
});
