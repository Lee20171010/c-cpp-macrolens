// Test case 1: Backslash with trailing space (valid continuation in GCC)
// Should detect unbalanced parentheses across both lines
#define B \ 
(((a)) + (b)))

// Test case 2: Proper line continuation without trailing space
// Should detect unbalanced parentheses across both lines
#define C \
(((a)) + (b)))

// Test case 3: Balanced parentheses (valid)
#define D \
((a) + (b))

// Test case 4: Single line unbalanced
#define E (((x) * 2)

// Test case 5: Balanced single line
#define F ((x) * 2)

// Test case 6: Multi-line balanced
#define G (a + \
    b + \
    c)

// Test case 7: Parentheses in string (should be ignored)
#define H "text with ) paren"

// Test case 8: Complex case with string and unbalanced
#define I ((a) + ")" + (b)
