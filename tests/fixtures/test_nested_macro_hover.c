// Test cases for nested macro hover feature
// Feature: When cursor is on innermost macro in nested calls, hover should show that macro's expansion

// ========================================
// Test case 1: Basic nested macro call
// ========================================
#define NH_INNER(x) (x + 1)
#define NH_OUTER(y) (NH_INNER(y) * 2)

void test_basic_nested() {
    // Hover on NH_OUTER: should show NH_OUTER's expansion with NH_INNER call
    // Expected: (NH_INNER(5) * 2) → ((5 + 1) * 2) → (6 * 2) → 12
    int a = NH_OUTER(5);
    
    // Hover on NH_INNER (inside NH_OUTER call): should show NH_INNER's expansion, not NH_OUTER's
    // Position cursor on "NH_INNER" in the expansion view or in nested usage
    int b = NH_OUTER(NH_INNER(10));
}

// ========================================
// Test case 2: Multiple macros on same line
// ========================================
#define NH_ADD(a, b) ((a) + (b))
#define NH_MUL(a, b) ((a) * (b))

void test_same_line() {
    // Hover on first NH_ADD: should show NH_ADD's expansion
    // Hover on NH_MUL: should show NH_MUL's expansion
    // Hover on second NH_ADD: should show NH_ADD's expansion
    // This tests findMacroAtPosition selecting the correct macro by smallest range
    int result = NH_ADD(1, 2) + NH_MUL(3, 4) + NH_ADD(5, 6);
}

// ========================================
// Test case 3: Deeply nested macros
// ========================================
#define NH_LEVEL1(x) (x)
#define NH_LEVEL2(x) NH_LEVEL1(x + 1)
#define NH_LEVEL3(x) NH_LEVEL2(x + 2)
#define NH_LEVEL4(x) NH_LEVEL3(x + 3)

void test_deep_nesting() {
    // Hover on NH_LEVEL4: should show full expansion chain
    // Hover on NH_LEVEL3 (in definition of NH_LEVEL4): should show NH_LEVEL3's expansion
    // Hover on NH_LEVEL2 (in definition of NH_LEVEL3): should show NH_LEVEL2's expansion
    // Hover on NH_LEVEL1 (in definition of NH_LEVEL2): should show NH_LEVEL1's expansion
    int value = NH_LEVEL4(10);
}

// ========================================
// Test case 4: Nested with same macro name (recursive-like)
// ========================================
#define NH_WRAPPER(x) (x + 1)
#define NH_NESTED_WRAPPER(x) NH_WRAPPER(NH_WRAPPER(x))

void test_recursive_like() {
    // Hover on outer NH_WRAPPER in NH_NESTED_WRAPPER definition: should show NH_WRAPPER
    // Hover on inner NH_WRAPPER in NH_NESTED_WRAPPER definition: should show NH_WRAPPER
    // Both should be distinguishable by position
    int doubled = NH_NESTED_WRAPPER(5);
}

// ========================================
// Test case 5: Complex nested expression
// ========================================
#define NH_MAX(a, b) ((a) > (b) ? (a) : (b))
#define NH_MIN(a, b) ((a) < (b) ? (a) : (b))
#define NH_CLAMP(val, min, max) NH_MIN(NH_MAX(val, min), max)

void test_complex_nesting() {
    // Hover on NH_CLAMP: should show NH_CLAMP expansion with NH_MIN and NH_MAX
    // Hover on NH_MIN (in NH_CLAMP body): should show NH_MIN's expansion
    // Hover on NH_MAX (in NH_CLAMP body): should show NH_MAX's expansion
    int clamped = NH_CLAMP(value, 0, 100);
    
    // Test the actual nested call - hover on each macro shows correct expansion
    // Hover on outer NH_MAX shows NH_MAX(value, 0)
    // Hover on inner NH_MIN shows the complete NH_MIN call
    int result = NH_MIN(NH_MAX(value, 0), 100);
}

// ========================================
// Test case 6: Nested macro with arguments
// ========================================
#define NH_SQUARE(n) ((n) * (n))
#define NH_CUBE(n) (NH_SQUARE(n) * (n))
#define NH_QUAD(n) (NH_SQUARE(NH_SQUARE(n)))

void test_nested_with_args() {
    // Hover on NH_CUBE: shows NH_CUBE's expansion
    // Hover on NH_SQUARE in NH_CUBE definition: shows NH_SQUARE's expansion
    int cubed = NH_CUBE(x);
    
    // Hover on outer NH_SQUARE in NH_QUAD: shows NH_SQUARE
    // Hover on inner NH_SQUARE in NH_QUAD: shows NH_SQUARE
    // Both are the same macro but at different nesting levels
    int quad = NH_QUAD(y);
}

// ========================================
// Test case 7: User's original example - NH_NESTED_EX(NH_WRAPPER_EX(5))
// ========================================
#define NH_WRAPPER_EX(x) (x + 1)
#define NH_NESTED_EX(x) (x * 2)

void test_user_example() {
    // This is the exact case user reported:
    // When cursor is on NH_WRAPPER_EX, hover should show NH_WRAPPER_EX's expansion, not NH_NESTED_EX's
    // Expected behavior:
    //   - Hover on NH_NESTED_EX: shows (NH_WRAPPER_EX(5) * 2) → ((5 + 1) * 2)
    //   - Hover on NH_WRAPPER_EX: shows (5 + 1) → 6
    int value = NH_NESTED_EX(NH_WRAPPER_EX(5));
    
    // Even more complex case
    // Each macro should be independently hoverable
    int complex = NH_NESTED_EX(NH_WRAPPER_EX(NH_NESTED_EX(3)));
}

// ========================================
// Test case 8: Mixed function-like and object-like macros
// ========================================
#define NH_CONSTANT 42
#define NH_USE_CONSTANT(x) (x + NH_CONSTANT)
#define NH_DOUBLE_USE(x) NH_USE_CONSTANT(NH_USE_CONSTANT(x))

void test_mixed_types() {
    // Hover on NH_DOUBLE_USE: shows full expansion
    // Hover on outer NH_USE_CONSTANT: shows NH_USE_CONSTANT expansion
    // Hover on inner NH_USE_CONSTANT: shows NH_USE_CONSTANT expansion
    // Hover on NH_CONSTANT: shows value 42
    int result = NH_DOUBLE_USE(10);
}

// ========================================
// Test case 9: Nested in conditional expressions
// ========================================
#define NH_IS_POSITIVE(x) ((x) > 0)
#define NH_ABS(x) (NH_IS_POSITIVE(x) ? (x) : -(x))

void test_conditional_nesting() {
    // Hover on NH_ABS: shows full ternary expansion
    // Hover on NH_IS_POSITIVE (inside NH_ABS): shows NH_IS_POSITIVE expansion
    int absolute = NH_ABS(-5);
}

// ========================================
// Test case 10: Macro in macro arguments
// ========================================
#define NH_FUNC(a, b, c) ((a) + (b) + (c))
#define NH_VALUE 10

void test_macro_in_args() {
    // Hover on NH_FUNC: shows NH_FUNC expansion
    // Hover on NH_VALUE (first arg): shows NH_VALUE = 10
    // Hover on NH_ADD (second arg): shows NH_ADD expansion
    // Hover on NH_MUL (third arg): shows NH_MUL expansion
    int sum = NH_FUNC(NH_VALUE, NH_ADD(1, 2), NH_MUL(3, 4));
}
