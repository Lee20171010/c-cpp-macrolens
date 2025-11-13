// Test file with mixed line endings
// Line 2 has \n
#define FOO(X) (X + 1)
// Line 4 has \r\n
#define BAR(Y) (Y * 2)
// Line 6 has \n
FOO(123)
// Line 8 has \r\n
BAR(456)
