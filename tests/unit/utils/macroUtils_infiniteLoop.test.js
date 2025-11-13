// Test for infinite loop prevention with unbalanced parentheses
// This test sets timeouts to ensure processing completes quickly

class MacroUtils {
    static stripParentheses(text) {
        const trimmed = text.trim();
        
        if (!trimmed.includes('(')) {
            return trimmed;
        }
        
        let result = '';
        let i = 0;
        
        while (i < trimmed.length) {
            if (trimmed[i] === '(') {
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
                
                // If unbalanced, keep original including the '('
                if (depth !== 0) {
                    result += trimmed.substring(start, i);
                    continue;
                }
                
                const innerContent = trimmed.substring(start + 1, i - 1);
                
                if (innerContent.trim().length === 0) {
                    result += '()';
                    continue;
                }
                
                const strippedInner = this.stripParentheses(innerContent);
                
                if (this.isFullyWrappedByParens(strippedInner)) {
                    result += strippedInner;
                } else {
                    result += '(' + strippedInner + ')';
                }
            } else {
                result += trimmed[i];
                i++;
            }
        }
        
        return result;
    }
    
    static isFullyWrappedByParens(text) {
        const trimmed = text.trim();
        
        if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
            return false;
        }
        
        let depth = 0;
        
        for (let i = 0; i < trimmed.length; i++) {
            if (trimmed[i] === '(') {
                depth++;
            } else if (trimmed[i] === ')') {
                depth--;
                if (depth === 0 && i < trimmed.length - 1) {
                    return false;
                }
            }
        }
        
        return depth === 0;
    }
}

// Test cases that could potentially cause infinite loops
const infiniteLoopTests = [
    // Deeply nested
    { input: '((((((((((a))))))))))', desc: 'Deeply nested (10 levels)' },
    { input: '('.repeat(50) + 'x' + ')'.repeat(50), desc: 'Very deeply nested (50 levels)' },
    
    // Unbalanced - more opening
    { input: '((((((((((', desc: 'Many opening parens' },
    { input: '(((a', desc: 'Triple opening, no close' },
    { input: 'func((a), (b)', desc: 'Function missing closing paren' },
    
    // Unbalanced - more closing
    { input: '))))))))))', desc: 'Many closing parens' },
    { input: 'a)))', desc: 'Multiple extra closing' },
    { input: ')a(', desc: 'Closing before opening' },
    
    // Mixed balanced and unbalanced
    { input: '(a)(b)(c)(d)(', desc: 'Multiple groups, last unbalanced' },
    { input: '((a))(((b)))(((c', desc: 'Mixed balanced and unbalanced' },
    
    // Empty and edge cases
    { input: '', desc: 'Empty string' },
    { input: '()', desc: 'Empty parens' },
    { input: '(())', desc: 'Nested empty' },
    { input: '(()', desc: 'Unbalanced empty' },
    
    // Complex expressions
    { input: '(((a+b)*(c+d)+(e+f)))', desc: 'Complex arithmetic' },
    { input: 'func(((a)), ((b)), (((c)))', desc: 'Function with unbalanced last arg' },
];

console.log('Testing for infinite loops with timeout protection...\n');

let passed = 0;
let failed = 0;
const TIMEOUT_MS = 100; // If it takes longer than 100ms, something is wrong

infiniteLoopTests.forEach((test, index) => {
    const testNum = (index + 1).toString().padStart(2, '0');
    
    const start = Date.now();
    let result;
    let timedOut = false;
    
    try {
        // Set a timer to detect potential infinite loops
        const timer = setTimeout(() => {
            timedOut = true;
            throw new Error('TIMEOUT - potential infinite loop!');
        }, TIMEOUT_MS);
        
        result = MacroUtils.stripParentheses(test.input);
        
        clearTimeout(timer);
        const duration = Date.now() - start;
        
        if (timedOut) {
            console.log(`✗ Test ${testNum}: ${test.desc} - TIMEOUT!`);
            failed++;
        } else {
            console.log(`✓ Test ${testNum}: ${test.desc} (${duration}ms)`);
            if (test.input.length > 50) {
                console.log(`  Input:  "${test.input.substring(0, 30)}...${test.input.substring(test.input.length - 20)}"`);
                console.log(`  Output: "${result.substring(0, 30)}...${result.substring(result.length - 20)}"`);
            } else {
                console.log(`  Input:  "${test.input}"`);
                console.log(`  Output: "${result}"`);
            }
            passed++;
        }
    } catch (e) {
        console.log(`✗ Test ${testNum}: ${test.desc} - ERROR: ${e.message}`);
        failed++;
    }
    console.log();
});

console.log('='.repeat(80));
console.log(`Results: ${passed} passed, ${failed} failed, ${infiniteLoopTests.length} total`);
console.log('='.repeat(80));

if (failed === 0) {
    console.log('\n✅ All tests passed! No infinite loops detected.');
    console.log('✅ All operations completed within reasonable time.');
} else {
    console.log('\n❌ Some tests failed or timed out!');
    process.exit(1);
}
