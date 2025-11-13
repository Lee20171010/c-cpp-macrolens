// Test cases for stripParentheses
// Run with: node test_strip_parens.js

// Simple mock of the stripParentheses logic
class MacroUtils {
    static stripParentheses(text) {
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
    
    static isFullyWrappedByParens(text) {
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

// Test cases
const tests = [
    // Basic tests
    { input: '(((a + b + c)))', expected: '(a + b + c)', category: 'Basic' },
    { input: '(((a))) + ((((d))))', expected: '(a) + (d)', category: 'Basic' },
    { input: '((((a)) + ((b)) + ((c))))', expected: '((a) + (b) + (c))', category: 'Basic' },
    
    // Function calls
    { input: 'func(((a)))', expected: 'func(a)', category: 'Function Call' },
    { input: 'func1(((a)), ((b)))', expected: 'func1((a), (b))', category: 'Function Call' },
    { input: 'func1(((a + b)), func2(((c))))', expected: 'func1((a + b), func2(c))', category: 'Function Call' },
    { input: 'printf(((format)), (((arg1))), ((arg2)))', expected: 'printf((format), (arg1), (arg2))', category: 'Function Call' },
    
    // Operator precedence
    { input: '((a + b)) * ((c))', expected: '(a + b) * (c)', category: 'Operator Precedence' },
    { input: '(((a + b)) * ((c)))', expected: '((a + b) * (c))', category: 'Operator Precedence' },
    { input: '((a)) + ((b)) * ((c))', expected: '(a) + (b) * (c)', category: 'Operator Precedence' },
    { input: '(((a * b)) + ((c * d)))', expected: '((a * b) + (c * d))', category: 'Operator Precedence' },
    { input: '((a << 2)) | ((b))', expected: '(a << 2) | (b)', category: 'Operator Precedence' },
    
    // Function pointers
    { input: '((*func_ptr))(((arg)))', expected: '(*func_ptr)(arg)', category: 'Function Pointer' },
    { input: '(((*fp)))(((x)), ((y)))', expected: '(*fp)((x), (y))', category: 'Function Pointer' },
    
    // Comma operator
    { input: '(((a, b)))', expected: '(a, b)', category: 'Comma Operator' },
    { input: '(((a, b, c)))', expected: '(a, b, c)', category: 'Comma Operator' },
    { input: 'x = (((a, b)))', expected: 'x = (a, b)', category: 'Comma Operator' },
    
    // Ternary operator
    { input: '((a)) ? ((b)) : ((c))', expected: '(a) ? (b) : (c)', category: 'Ternary Operator' },
    { input: '(((a > 0))) ? (((b + 1))) : (((c - 1)))', expected: '(a > 0) ? (b + 1) : (c - 1)', category: 'Ternary Operator' },
    { input: '(((cond) ? ((val1)) : ((val2))))', expected: '((cond) ? (val1) : (val2))', category: 'Ternary Operator' },
    
    // Casting
    { input: '(int)((x))', expected: '(int)(x)', category: 'Casting' },
    { input: '(int)(((x)))', expected: '(int)(x)', category: 'Casting' },
    { input: '(unsigned int)(((a + b)))', expected: '(unsigned int)(a + b)', category: 'Casting' },
    { input: '(char*)(((ptr)))', expected: '(char*)(ptr)', category: 'Casting' },
    { input: '(const char*)(((str)))', expected: '(const char*)(str)', category: 'Casting' },
    { input: '((int)((x))) + ((int)((y)))', expected: '((int)(x)) + ((int)(y))', category: 'Casting' },
    { input: '(TST)(((value)))', expected: '(TST)(value)', category: 'Casting - Typedef' },
    { input: '(MYTYPE*)(((ptr)))', expected: '(MYTYPE*)(ptr)', category: 'Casting - Typedef' },
    
    // Complex mixed cases
    { input: 'func(((int)((x))), (((a + b))))', expected: 'func(((int)(x)), (a + b))', category: 'Complex' },
    { input: '(((a))) ? func(((b))) : (((c)))', expected: '(a) ? func(b) : (c)', category: 'Complex' },
    { input: '((a + b)) * func(((c)), ((d)))', expected: '(a + b) * func((c), (d))', category: 'Complex' },
    { input: '(int)(((a))) + (int)(((b)))', expected: '(int)(a) + (int)(b)', category: 'Complex' },
    
    // Unbalanced parentheses - process balanced parts, keep unbalanced parts
    { input: '(((a)) + (b)))', expected: '((a) + (b)))', category: 'Unbalanced' },  // Extra ) at end, but balanced part processed
    { input: '(((a)) + (b)', expected: '(((a)) + (b)', category: 'Unbalanced' },  // Missing ) at end, keeps original
    { input: '((a) + b))', expected: '((a) + b))', category: 'Unbalanced' },  // Extra ) at end
    { input: 'func((a), (b))', expected: 'func((a), (b))', category: 'Balanced' },  // Already one layer each
    { input: '((x) * 2', expected: '((x) * 2', category: 'Unbalanced' },  // Missing )
    { input: '(a+b))', expected: '(a+b))', category: 'Unbalanced' },  // Extra )
];

// Run tests
console.log('='.repeat(80));
console.log('Testing stripParentheses');
console.log('='.repeat(80));

let passed = 0;
let failed = 0;
let currentCategory = '';

tests.forEach((test, index) => {
    if (test.category !== currentCategory) {
        currentCategory = test.category;
        console.log(`\n${'─'.repeat(80)}`);
        console.log(`${currentCategory}`);
        console.log('─'.repeat(80));
    }
    
    const result = MacroUtils.stripParentheses(test.input);
    const success = result === test.expected;
    
    if (success) {
        passed++;
        console.log(`✓ Test ${index + 1}`);
        console.log(`  Input:    ${test.input}`);
        console.log(`  Expected: ${test.expected}`);
        console.log(`  Got:      ${result}`);
    } else {
        failed++;
        console.log(`✗ Test ${index + 1} FAILED`);
        console.log(`  Input:    ${test.input}`);
        console.log(`  Expected: ${test.expected}`);
        console.log(`  Got:      ${result}`);
    }
});

console.log('\n' + '='.repeat(80));
console.log(`Results: ${passed} passed, ${failed} failed, ${tests.length} total`);
console.log('='.repeat(80));

process.exit(failed > 0 ? 1 : 0);
