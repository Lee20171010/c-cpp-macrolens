// Test file for expansion undefined macro suggestions

#define EXPSUGG_FOO 123
#define EXPSUGG_BAR UNDEFINED_MACRO
#define EXPSUGG_BAZ FOX + EXPSUGG_BAR

// Test 1: Direct undefined macro - should suggest EXPSUGG_FOO
int x = FOX;

// Test 2: Macro expands to undefined - should suggest EXPSUGG_FOO for FOX
int y = EXPSUGG_BAR;

// Test 3: Macro expands to multiple undefined - should suggest for both FOX and UNDEFINED_MACRO
int z = EXPSUGG_BAZ;

// Test 4: Function-like macro with undefined in expansion
#define EXPSUGG_CALC(x) ((x) + UNDEFIND_CONSTANT)
int result = EXPSUGG_CALC(5);  // Should suggest for UNDEFIND_CONSTANT (typo of UNDEFINED)

// Test 5: Nested expansion with undefined
#define EXPSUGG_LEVEL1 EXPSUGG_LEVEL2
#define EXPSUGG_LEVEL2 LEVLE3  // Typo
int nested = EXPSUGG_LEVEL1;  // Should suggest LEVEL3 for LEVLE3
