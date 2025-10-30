// Test: Basic Macro Functionality
// Purpose: Core macro definition and expansion features

// ============================================================================
// OBJECT-LIKE MACROS
// ============================================================================

#define PI 3.14159
#define VERSION 1
#define STATUS "OK"

// Multi-line object-like macro
#define LONG_DEFINITION \
    This is a very long macro definition \
    that spans multiple lines \
    using backslash continuation

// ============================================================================
// FUNCTION-LIKE MACROS
// ============================================================================

// Simple function-like macro
#define SQUARE(x) ((x) * (x))
#define MAX(a, b) ((a) > (b) ? (a) : (b))

// Multi-line function-like macro
#define SWAP(a, b, type) do { \
    type temp = (a); \
    (a) = (b); \
    (b) = temp; \
} while(0)

// Multiple parameters
#define ADD3(x, y, z) ((x) + (y) + (z))

// Nested macro calls
#define DOUBLE(x) ((x) * 2)
#define QUAD(x) DOUBLE(DOUBLE(x))

// ============================================================================
// PARAMETER HANDLING
// ============================================================================

// Parameters should NOT be diagnosed as undefined
#define FUNC(PARAM1, PARAM2) ((PARAM1) + (PARAM2))

// Uppercase parameters (common in macros)
#define CONCAT_IMPL(A, B) A##B

// Single character parameters
#define ADD(a, b) ((a) + (b))

// Parameters with underscores
#define CHECK(_X, _Y) ((_X) == (_Y))

// ============================================================================
// EDGE CASES
// ============================================================================

// Empty macro
#define EMPTY

// Macro with just parentheses
#define PARENS ()

// Recursive definition (will cause circular reference error)
#define SELF SELF

int main() {
    float circle = PI;
    int max_val = MAX(10, 20);
    int sum = ADD3(1, 2, 3);
    return 0;
}
