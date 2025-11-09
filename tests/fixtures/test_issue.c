#define ISSUE_a 100
#define ISSUE_b 200  
#define ISSUE_A (((ISSUE_a)) + (ISSUE_b))

// Test the macro
int main() {
    int x = ISSUE_A;
    return 0;
}
