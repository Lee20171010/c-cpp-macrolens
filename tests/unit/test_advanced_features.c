// Test: Advanced Macro Features
// Purpose: Token paste, stringification, variadic macros, complex patterns

// ============================================================================
// TOKEN CONCATENATION (##)
// ============================================================================

// Basic token paste
#define CONCAT(a, b) a##b
// CONCAT(x, y) -> xy

// Token paste with prefixes
#define VAR(name) var_##name
// VAR(count) -> var_count

// Multi-token paste
#define TRIPLE(a, b, c) a##b##c
// TRIPLE(x, y, z) -> xyz

// Object-like macro with token paste
#define PREFIX_SUFFIX pre##_##suf
// Expands to: pre_suf

// ============================================================================
// STRINGIFICATION (#)
// ============================================================================

#define STRINGIFY(x) #x
// STRINGIFY(hello) -> "hello"

#define QUOTE(x) STRINGIFY(x)
// QUOTE(123) -> "123"

// ============================================================================
// VARIADIC MACROS
// ============================================================================

// Basic variadic
#define LOG(fmt, ...) printf(fmt, __VA_ARGS__)

// Variadic with __VA_ARGS__
#define DEBUG(msg, ...) fprintf(stderr, msg "\n", __VA_ARGS__)

// Variadic counting (advanced pattern)
#define COUNT_ARGS(...) COUNT_IMPL(__VA_ARGS__, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1)
#define COUNT_IMPL(_1, _2, _3, _4, _5, _6, _7, _8, _9, _10, N, ...) N

// Named variadic parameters (GCC extension)
#define EPRINTF(format, args...) fprintf(stderr, format, args)

// ============================================================================
// NESTED MACRO EXPANSION
// ============================================================================

// Multi-level expansion
#define LEVEL1 LEVEL2
#define LEVEL2 LEVEL3
#define LEVEL3 42

// Nested calls with arguments
#define OUTER(x) INNER(x)
#define INNER(x) ((x) * 2)

// Complex nesting
#define A(x) B(x)
#define B(x) C(x, x)
#define C(x, y) ((x) + (y))

// ============================================================================
// COMPLEX PATTERNS (ML99-style)
// ============================================================================

// Metalanguage pattern: v() wrapper
#define v(x) (0v, x)
#define ML99_match(x, matcher) matcher x

// Pattern matching simulation
#define MATCH_IMPL(x) ML99_match(v(x), v(MATCHER_))
#define MATCHER_ RESULT

// ============================================================================
// ARGUMENT EXTRACTION
// ============================================================================

// Nested parentheses in arguments
#define PROCESS(arg) (arg)
// PROCESS(foo(bar(baz))) should handle nested parens

// Multiple nested levels
#define DEEP(a, b) PROCESS(a(b(c(d))))

// ============================================================================
// EDGE CASES
// ============================================================================

// Empty variadic arguments
#define OPTIONAL(base, ...) base __VA_ARGS__

// Comments in expansion (should be removed)
#define WITH_COMMENT(x) /* comment */ x

// Whitespace handling
#define   SPACED_MACRO   (  value  )

int main() {
    // Test token paste
    int CONCAT(my, Var) = 10;
    
    // Test variadic
    LOG("Value: %d\n", 42);
    
    // Test nested expansion
    int result = OUTER(5);
    
    return 0;
}
