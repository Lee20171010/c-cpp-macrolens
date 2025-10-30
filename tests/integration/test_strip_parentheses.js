// Test stripParentheses function with nested support

function stripParentheses(text) {
    let trimmed = text.trim();
    let hasVariables = /[a-zA-Z_]/.test(trimmed);
    let outerStrippedOnce = false;
    
    // Strip outer parentheses layer by layer
    while (trimmed.startsWith('(') && trimmed.endsWith(')')) {
        let depth = 0;
        let canStrip = true;
        
        for (let i = 0; i < trimmed.length; i++) {
            if (trimmed[i] === '(') {
                depth++;
            } else if (trimmed[i] === ')') {
                depth--;
                if (depth === 0 && i < trimmed.length - 1) {
                    canStrip = false;
                    break;
                }
            }
        }
        
        if (canStrip && depth === 0) {
            const inner = trimmed.slice(1, -1).trim();
            const hasOperators = /[+\-*\/%<>=&|^!]/.test(inner);
            
            // If has operators and variables, keep one layer when stripping from outside
            if (hasOperators && hasVariables && !outerStrippedOnce) {
                outerStrippedOnce = true;
                trimmed = inner;
                continue;
            }
            
            trimmed = inner;
        } else {
            break;
        }
    }
    
    // Recursively strip nested
    trimmed = stripNestedParentheses(trimmed);
    
    // If result has operators and variables, ensure at least one layer of parens
    const finalHasOperators = /[+\-*\/%<>=&|^!]/.test(trimmed);
    if (finalHasOperators && hasVariables && !trimmed.startsWith('(')) {
        return '(' + trimmed + ')';
    }
    
    return trimmed;
}

function stripNestedParentheses(text) {
    let result = '';
    let i = 0;
    
    while (i < text.length) {
        if (text[i] === '(') {
            let depth = 0;
            let start = i;
            
            for (let j = i; j < text.length; j++) {
                if (text[j] === '(') {
                    depth++;
                } else if (text[j] === ')') {
                    depth--;
                    if (depth === 0) {
                        let inner = text.substring(start + 1, j);
                        let stripped = stripParentheses(inner);
                        
                        if (areParenthesesNecessary(result, stripped, text.substring(j + 1))) {
                            result += '(' + stripped + ')';
                        } else {
                            result += stripped;
                        }
                        
                        i = j + 1;
                        break;
                    }
                }
            }
        } else {
            result += text[i];
            i++;
        }
    }
    
    return result;
}

function areParenthesesNecessary(before, content, after) {
    // Check if before ends with identifier - this is a function call
    const beforeTrimmed = before.trim();
    if (/[a-zA-Z0-9_]$/.test(beforeTrimmed)) {
        // This is a function call: func(args) - MUST keep parentheses
        return true;
    }
    
    // Check if this is array subscript
    if (beforeTrimmed.endsWith('[')) {
        return true;
    }
    
    // Check if content has operators that might need grouping
    const hasOperators = /[+\-*\/%<>=&|^!]/.test(content);
    
    if (!hasOperators) {
        // Simple value or variable - parentheses not needed
        return false;
    }
    
    // Content has operators - keep parentheses to preserve grouping
    // Example: ((x) * (y)) should become (x * y), not x * y
    // This ensures correct operator precedence in all contexts
    return true;
}

// Test cases
const tests = [
    { input: '((100))', expected: '100', description: 'Multiple nested parens - numeric' },
    { input: '(100)', expected: '100', description: 'Single outer parens - numeric' },
    { input: '100', expected: '100', description: 'No parens - numeric' },
    { input: '(100 + 200)', expected: '100 + 200', description: 'Expression with parens - numeric can strip outer' },
    { input: '((100 + 200))', expected: '100 + 200', description: 'Nested expression - numeric can strip all outer' },
    { input: '(100) + (200)', expected: '100 + 200', description: 'Multiple groups - numeric strips all inner parens' },
    { input: '((100) + (200))', expected: '100 + 200', description: 'Outer parens with inner groups - numeric strips all' },
    { input: '(((100)))', expected: '100', description: 'Triple nested - numeric strips all' },
    { input: '((x) * (y))', expected: '(x * y)', description: 'Variables with operator - keeps one layer for grouping' },
    { input: '(((((a))) + ((b))))', expected: '(a + b)', description: 'Deeply nested variables - keeps one layer' },
    { input: '((a)) + ((b))', expected: '(a + b)', description: 'Separate nested groups with operator - adds outer parens' },
    { input: '(((a)))', expected: 'a', description: 'Triple nested single variable - strips all' },
];

console.log('Testing stripParentheses function with nested support:\n');
let passed = 0;
let failed = 0;

tests.forEach(test => {
    const result = stripParentheses(test.input);
    const success = result === test.expected;
    
    if (success) {
        console.log(`✓ PASS: ${test.description}`);
        console.log(`  Input:    "${test.input}"`);
        console.log(`  Output:   "${result}"`);
        passed++;
    } else {
        console.log(`✗ FAIL: ${test.description}`);
        console.log(`  Input:    "${test.input}"`);
        console.log(`  Expected: "${test.expected}"`);
        console.log(`  Got:      "${result}"`);
        failed++;
    }
    console.log();
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);

