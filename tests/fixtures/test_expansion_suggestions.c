// Test file for expansion undefined macro suggestions

#define FOO 123
#define BAR UNDEFINED_MACRO
#define BAZ FOX + BAR

// Test 1: Direct undefined macro - should suggest FOO
int x = FOX;

// Test 2: Macro expands to undefined - should suggest FOO for FOX
int y = BAR;

// Test 3: Macro expands to multiple undefined - should suggest for both FOX and UNDEFINED_MACRO
int z = BAZ;

// Test 4: Function-like macro with undefined in expansion
#define CALC(x) ((x) + UNDEFIND_CONSTANT)
int result = CALC(5);  // Should suggest for UNDEFIND_CONSTANT (typo of UNDEFINED)

// Test 5: Nested expansion with undefined
#define LEVEL1 LEVEL2
#define LEVEL2 LEVLE3  // Typo
int nested = LEVEL1;  // Should suggest LEVEL3 for LEVLE3
