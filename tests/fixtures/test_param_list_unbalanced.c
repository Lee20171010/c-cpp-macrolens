// Test cases for unbalanced parentheses in macro parameter list

// Case 1: Missing closing paren in parameter list
#define PLU_MISSING_CLOSE(a, b (a+b)

// Case 2: Extra closing paren after parameter list  
#define PLU_EXTRA_CLOSE(a, b)) (a+b)

// Case 3: Valid function-like macro for comparison
#define PLU_VALID(a, b) (a+b)

// Case 4: Valid object-like macro
#define PLU_VALID_OBJ (100)

// Test usage
int main() {
    // These should trigger unbalanced errors
    int x = PLU_MISSING_CLOSE(1, 2);  // Error: unbalanced parentheses
    int y = PLU_EXTRA_CLOSE(3, 4);     // Error: unbalanced parentheses
    
    // This should work fine
    int z = PLU_VALID(5, 6);           // OK
    
    // Object-like macro
    int m = PLU_VALID_OBJ;             // OK
    
    return 0;
}
