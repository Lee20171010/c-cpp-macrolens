// Test: Type System and Diagnostics
// Purpose: Type declarations, undefined macros, error detection

// ============================================================================
// TYPE DECLARATIONS (Should NOT be treated as macros)
// ============================================================================

// Typedef declarations
typedef int INT32;
typedef unsigned long ULONG;
typedef struct Point POINT;

// Multi-line typedef
typedef struct {
    int x;
    int y;
} Point2D;

// Struct declarations
struct Node {
    int data;
    struct Node* next;
};

// Enum declarations
enum Color {
    RED,
    GREEN,
    BLUE
};

// Union declarations
union Value {
    int i;
    float f;
    char c;
};

// ============================================================================
// UNDEFINED MACRO DETECTION
// ============================================================================

// Direct undefined macro (should show warning)
#define USES_UNDEFINED FOO + BAR
// FOO and BAR should trigger warnings with suggestions

// Macro expanding to undefined
#define LEVEL_A LEVEL_B
#define LEVEL_B UNDEFINED_LEVEL_C
// Should warn about UNDEFINED_LEVEL_C with suggestions

// Multiple undefined in expansion
#define COMPLEX_UNDEFINED (FOX + BEAR + TIGER)
// All three should trigger warnings

// Function-like macro with undefined
#define CALC(x) ((x) + UNDEFINED_CONSTANT)
// UNDEFINED_CONSTANT should trigger warning

// ============================================================================
// CORRECT USAGE (No warnings expected)
// ============================================================================

#define VALID_A 100
#define VALID_B VALID_A
#define VALID_C (VALID_A + VALID_B)
// No warnings - all defined

// Parameters in function-like macros
#define GOOD_FUNC(PARAM) ((PARAM) * 2)
// PARAM should NOT trigger warning

// ============================================================================
// SIMILARITY SUGGESTIONS
// ============================================================================

// Similar names that should trigger suggestions
#define FOO 1
int x = FOX;  // Should suggest: FOO

#define BUFFER_SIZE 1024
int y = BUFER_SIZE;  // Typo - should suggest: BUFFER_SIZE

#define MAX_VALUE 999
int z = MAX_VALU;  // Should suggest: MAX_VALUE

// ============================================================================
// PREPROCESSOR DIRECTIVES (Should be filtered from diagnostics)
// ============================================================================

#ifdef SOME_FEATURE
    #define CONDITIONAL 1
#endif

#ifndef GUARD_H
    #define GUARD_H
#endif

#if defined(DEBUG)
    #define LOG_LEVEL 3
#endif

int main() {
    INT32 value = 42;
    enum Color c = RED;
    return 0;
}
