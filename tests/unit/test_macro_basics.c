// Test: Basic Macro Functionality
// Purpose: Core macro definition and expansion features

// ============================================================================
// OBJECT-LIKE MACROS
// ============================================================================

#define BASIC_PI 3.14159
#define BASIC_VERSION 1
#define BASIC_STATUS "OK"

// Multi-line object-like macro
#define BASIC_LONG_DEFINITION \
    This is a very long macro definition \
    that spans multiple lines \
    using backslash continuation

// ============================================================================
// FUNCTION-LIKE MACROS
// ============================================================================

// Simple function-like macro
#define BASIC_SQUARE(x) ((x) * (x))
#define BASIC_MAX(a, b) ((a) > (b) ? (a) : (b))

// Multi-line function-like macro
#define BASIC_SWAP(a, b, type) do { \
    type temp = (a); \
    (a) = (b); \
    (b) = temp; \
} while(0)

// Multiple parameters
#define BASIC_ADD3(x, y, z) ((x) + (y) + (z))

// Nested macro calls
#define BASIC_DOUBLE(x) ((x) * 2)
#define BASIC_QUAD(x) BASIC_DOUBLE(BASIC_DOUBLE(x))

// ============================================================================
// PARAMETER HANDLING
// ============================================================================

// Parameters should NOT be diagnosed as undefined
#define BASIC_FUNC(PARAM1, PARAM2) ((PARAM1) + (PARAM2))

// Uppercase parameters (common in macros)
#define BASIC_CONCAT_IMPL(A, B) A##B

// Single character parameters
#define BASIC_ADD(a, b) ((a) + (b))

// Parameters with underscores
#define BASIC_CHECK(_X, _Y) ((_X) == (_Y))

// ============================================================================
// EDGE CASES
// ============================================================================

// Empty macro
#define BASIC_EMPTY

// Macro with just parentheses
#define BASIC_PARENS ()

// Recursive definition (will cause circular reference error)
#define BASIC_SELF BASIC_SELF

int main() {
    float circle = BASIC_PI;
    int max_val = BASIC_MAX(10, 20);
    int sum = BASIC_ADD3(1, 2, 3);
    return 0;
}
