// Comprehensive test for unbalanced parentheses handling
// This tests that unbalanced parens are returned unchanged (not processed)

const { MacroUtils } = require('./out/utils/macroUtils');

console.log('Testing unbalanced parentheses handling...\n');

const unbalancedCases = [
    // More opening than closing
    { input: '(a', desc: 'Single opening paren' },
    { input: '((a', desc: 'Double opening paren' },
    { input: '(((a)) + (b)', desc: 'Missing one closing paren' },
    { input: 'func((a), (b)', desc: 'Function call missing closing paren' },
    { input: '((x) * 2', desc: 'Expression missing closing paren' },
    { input: '((((((', desc: 'Many opening parens' },
    { input: '()()(',  desc: 'Multiple groups, last unbalanced' },
    { input: '((a) + (b))(', desc: 'Balanced then unbalanced' },
    { input: '((a + b) * ((c)', desc: 'Nested unbalanced' },
    
    // More closing than opening
    { input: 'a)', desc: 'Single closing paren' },
    { input: 'a))', desc: 'Double closing paren' },
    { input: '(a))', desc: 'Balanced plus extra closing' },
    { input: '(((a)) + (b)))', desc: 'Extra closing paren at end' },
    { input: ')a(', desc: 'Closing before opening' },
    { input: '))))))', desc: 'Many closing parens' },
    { input: '()())', desc: 'Multiple groups, extra closing' },
    { input: ')((a) + (b))', desc: 'Extra closing at start' },
];

const balancedCases = [
    // These are balanced and should be processed
    { input: '(((a)))', expected: 'a', desc: 'Triple nested single var' },
    { input: '((a))', expected: 'a', desc: 'Double nested single var' },
    { input: 'func((a), (b))', expected: 'func(a, b)', desc: 'Function with double-wrapped args' },
    { input: '((a) + (b))', expected: '(a + b)', desc: 'Expression with outer wrap' },
    { input: 'func(((a)), (b))', expected: 'func(a, b)', desc: 'Function with one triple-wrapped arg' },
    { input: '(((a))) + ((b))', expected: 'a + b', desc: 'Two terms with different nesting' },
    { input: '((((a)) + ((b)) + ((c))))', expected: '((a) + (b) + (c))', desc: 'Complex nested expression' },
];

console.log('='.repeat(80));
console.log('UNBALANCED CASES (should return unchanged)');
console.log('='.repeat(80));

let unbalancedPass = 0;
let unbalancedFail = 0;

unbalancedCases.forEach((test, index) => {
    const testNum = (index + 1).toString().padStart(2, '0');
    const result = MacroUtils.stripParentheses(test.input);
    
    if (result === test.input) {
        console.log(`✓ Test ${testNum}: ${test.desc}`);
        console.log(`  Input:  "${test.input}"`);
        console.log(`  Output: "${result}" (unchanged)`);
        unbalancedPass++;
    } else {
        console.log(`✗ Test ${testNum}: ${test.desc} FAILED`);
        console.log(`  Input:    "${test.input}"`);
        console.log(`  Expected: "${test.input}" (unchanged)`);
        console.log(`  Got:      "${result}"`);
        unbalancedFail++;
    }
    console.log();
});

console.log('='.repeat(80));
console.log('BALANCED CASES (should be processed)');
console.log('='.repeat(80));

let balancedPass = 0;
let balancedFail = 0;

balancedCases.forEach((test, index) => {
    const testNum = (index + 1).toString().padStart(2, '0');
    const result = MacroUtils.stripParentheses(test.input);
    
    if (result === test.expected) {
        console.log(`✓ Test ${testNum}: ${test.desc}`);
        console.log(`  Input:    "${test.input}"`);
        console.log(`  Expected: "${test.expected}"`);
        console.log(`  Got:      "${result}"`);
        balancedPass++;
    } else {
        console.log(`✗ Test ${testNum}: ${test.desc} FAILED`);
        console.log(`  Input:    "${test.input}"`);
        console.log(`  Expected: "${test.expected}"`);
        console.log(`  Got:      "${result}"`);
        balancedFail++;
    }
    console.log();
});

console.log('='.repeat(80));
console.log('INFINITE LOOP DETECTION TEST');
console.log('='.repeat(80));

const timeoutTests = [
    '((((((((((',
    '))))))))))',
    '((((())))',
    '((((((((((a))))))))))',
];

timeoutTests.forEach(input => {
    const start = Date.now();
    try {
        const result = MacroUtils.stripParentheses(input);
        const duration = Date.now() - start;
        const displayInput = input.length > 30 ? input.substring(0, 30) + '...' : input;
        console.log(`✓ "${displayInput}" processed in ${duration}ms`);
    } catch (e) {
        console.log(`✗ "${input}" caused error: ${e.message}`);
    }
});

console.log();
console.log('='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log(`Unbalanced cases: ${unbalancedPass} passed, ${unbalancedFail} failed, ${unbalancedCases.length} total`);
console.log(`Balanced cases:   ${balancedPass} passed, ${balancedFail} failed, ${balancedCases.length} total`);
console.log(`Overall:          ${unbalancedPass + balancedPass} passed, ${unbalancedFail + balancedFail} failed, ${unbalancedCases.length + balancedCases.length} total`);
console.log('='.repeat(80));

const totalFail = unbalancedFail + balancedFail;
if (totalFail === 0) {
    console.log('\n✅ All tests passed! No infinite loops detected.');
}

process.exit(totalFail > 0 ? 1 : 0);
