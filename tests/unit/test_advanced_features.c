// Test: Advanced Macro Features
// Purpose: Token paste, stringification, variadic macros, complex patterns

// ============================================================================
// TOKEN CONCATENATION (##)
// ============================================================================

// Basic token paste
#define ADV_CONCAT(a, b) a##b
// ADV_CONCAT(x, y) -> xy

// Token paste with prefixes
#define ADV_VAR(name) var_##name
// ADV_VAR(count) -> var_count

// Multi-token paste
#define ADV_TRIPLE(a, b, c) a##b##c
// ADV_TRIPLE(x, y, z) -> xyz

// Object-like macro with token paste
#define ADV_PREFIX_SUFFIX pre##_##suf
// Expands to: pre_suf

// ============================================================================
// STRINGIFICATION (#)
// ============================================================================

#define ADV_STRINGIFY(x) #x
// ADV_STRINGIFY(hello) -> "hello"

#define ADV_QUOTE(x) ADV_STRINGIFY(x)
// ADV_QUOTE(123) -> "123"

// ============================================================================
// VARIADIC MACROS
// ============================================================================

// Basic variadic
#define ADV_LOG(fmt, ...) printf(fmt, __VA_ARGS__)

// Variadic with __VA_ARGS__
#define ADV_DEBUG(msg, ...) fprintf(stderr, msg "\n", __VA_ARGS__)

// Variadic counting (advanced pattern)
#define ADV_COUNT_ARGS(...) ADV_COUNT_IMPL(__VA_ARGS__, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1)
#define ADV_COUNT_IMPL(_1, _2, _3, _4, _5, _6, _7, _8, _9, _10, N, ...) N

// Named variadic parameters (GCC extension)
#define ADV_EPRINTF(format, args...) fprintf(stderr, format, args)

// ============================================================================
// NESTED MACRO EXPANSION
// ============================================================================

// Multi-level expansion
#define ADV_LEVEL1 ADV_LEVEL2
#define ADV_LEVEL2 ADV_LEVEL3
#define ADV_LEVEL3 42

// Nested calls with arguments
#define ADV_OUTER(x) ADV_INNER(x)
#define ADV_INNER(x) ((x) * 2)

// Complex nesting
#define ADV_A(x) ADV_B(x)
#define ADV_B(x) ADV_C(x, x)
#define ADV_C(x, y) ((x) + (y))

// ============================================================================
// COMPLEX PATTERNS (ML99-style)
// ============================================================================

// Metalanguage pattern: v() wrapper
#define ADV_v(x) (0v, x)
#define ADV_ML99_match(x, matcher) matcher x

// Pattern matching simulation
#define ADV_MATCH_IMPL(x) ADV_ML99_match(ADV_v(x), ADV_v(ADV_MATCHER_))
#define ADV_MATCHER_ RESULT

// ============================================================================
// ARGUMENT EXTRACTION
// ============================================================================

// Nested parentheses in arguments
#define ADV_PROCESS(arg) (arg)
// ADV_PROCESS(foo(bar(baz))) should handle nested parens

// Multiple nested levels
#define ADV_DEEP(a, b) ADV_PROCESS(a(b(c(d))))

// ============================================================================
// EDGE CASES
// ============================================================================

// Empty variadic arguments
#define ADV_OPTIONAL(base, ...) base __VA_ARGS__

// Comments in expansion (should be removed)
#define ADV_WITH_COMMENT(x) /* comment */ x

// Whitespace handling
#define   ADV_SPACED_MACRO   (  value  )

int main() {
    // Test token paste
    int ADV_CONCAT(my, Var) = 10;
    
    // Test variadic
    ADV_LOG("Value: %d\n", 42);
    
    // Test nested expansion
    int result = OUTER(5);
    
    return 0;
}
