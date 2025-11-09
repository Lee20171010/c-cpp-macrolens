// Test case 1: Backslash with trailing space (valid continuation in GCC)
// Should detect unbalanced parentheses across both lines
#define UNB_B \ 
(((a)) + (b)))

// Test case 2: Proper line continuation without trailing space
// Should detect unbalanced parentheses across both lines
#define UNB_C \
(((a)) + (b)))

// Test case 3: Balanced parentheses (valid)
#define UNB_D \
((a) + (b))

// Test case 4: Single line unbalanced
#define UNB_E (((x) * 2)

// Test case 5: Balanced single line
#define UNB_F ((x) * 2)

// Test case 6: Multi-line balanced
#define UNB_G (a + \
    b + \
    c)

// Test case 7: Parentheses in string (should be ignored)
#define UNB_H "text with ) paren"

// Test case 8: Complex case with string and unbalanced
#define UNB_I ((a) + ")" + (b)

// ========================================
// New test cases for parameter list unbalanced parentheses detection
// ========================================

// Test case 9: Function-like macro missing closing paren in parameter list
// Expected: Error - unbalanced parentheses in parameter list
#define UNB_MISSING_CLOSE(a, b (a+b)

// Test case 10: Function-like macro with extra closing paren after parameter list
// Expected: Error - unbalanced parentheses in parameter list
#define UNB_EXTRA_CLOSE(a, b)) (a+b)

// Test case 11: Valid function-like macro for comparison
// Expected: No error
#define UNB_VALID_FUNC(a, b) (a+b)

// Test case 12: Object-like macro with unbalanced body (valid in C)
// Expected: Warning - unbalanced parentheses in body
#define UNB_MAX_VALUE (100

// Test case 13: Nested macro usage - direct hover test
// Expected: UNB_MISSING_CLOSE shows error, UNB_WRAPPER expansion fails with error message
#define UNB_WRAPPER(x) UNB_MISSING_CLOSE(x, 2)

// Test case 14: Multiple levels of nesting
// Expected: Expansion error when trying to expand UNB_OUTER
#define UNB_MIDDLE(y) UNB_EXTRA_CLOSE(y, 3)
#define UNB_OUTER(z) UNB_MIDDLE(z) + 1

// Test case 15: Mixed valid and invalid in expression
// Expected: Only the invalid macro should show error
#define UNB_RESULT (UNB_VALID_FUNC(1, 2) + UNB_MISSING_CLOSE(3, 4))

// ========================================
// Test usage for hover and diagnostics
// ========================================
void test_hover_and_diagnostics() {
    // Hover on UNB_MISSING_CLOSE: should show "⚠️ Unbalanced parentheses in macro definition"
    int a = UNB_MISSING_CLOSE(1, 2);
    
    // Hover on UNB_EXTRA_CLOSE: should show "⚠️ Unbalanced parentheses in macro definition"
    int b = UNB_EXTRA_CLOSE(3, 4);
    
    // Hover on UNB_VALID_FUNC: should show normal expansion
    int c = UNB_VALID_FUNC(5, 6);
    
    // Hover on UNB_MAX_VALUE: should show warning about unbalanced body
    int d = UNB_MAX_VALUE + 50;
    
    // Hover on UNB_WRAPPER: should show "❌ Expansion Error: Macro 'UNB_MISSING_CLOSE' has unbalanced parentheses"
    int e = UNB_WRAPPER(7);
    
    // Hover on UNB_OUTER: should show expansion error
    int f = UNB_OUTER(8);
}
