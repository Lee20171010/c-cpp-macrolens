/**
 * Constants and magic numbers used throughout the extension
 * Centralizing these values improves maintainability and understanding
 */

/**
 * Diagnostics constants
 */
export const DIAGNOSTICS_CONSTANTS = {
    /** Maximum file size (in bytes) before skipping diagnostics */
    MAX_FILE_SIZE: 500000, // 500KB
    
    /** Maximum Levenshtein distance for macro name suggestions */
    MAX_SUGGESTION_DISTANCE: 2,
    
    /** Minimum macro name length for substring matching */
    MIN_SUBSTRING_LENGTH: 4,
    
    /** Maximum number of macro suggestions to show */
    MAX_SUGGESTIONS: 3,
    
    /** Maximum cache size before clearing */
    MAX_CACHE_SIZE: 1000,
} as const;

/**
 * Database constants
 */
export const DATABASE_CONSTANTS = {
    /** Default debounce delay in milliseconds */
    DEFAULT_DEBOUNCE_DELAY: 500,
    
    /** Default maximum update delay in milliseconds */
    DEFAULT_MAX_DELAY: 8000,
    
    /** Minimum debounce delay in milliseconds */
    MIN_DEBOUNCE_DELAY: 100,
    
    /** Maximum debounce delay in milliseconds */
    MAX_DEBOUNCE_DELAY: 2000,
    
    /** Minimum maximum delay in milliseconds */
    MIN_MAX_DELAY: 2000,
    
    /** Maximum maximum delay in milliseconds */
    MAX_MAX_DELAY: 30000,
    
    /** Typing threshold in milliseconds (1 second without activity = likely stopped typing) */
    TYPING_THRESHOLD: 1000,
    
    /** Multiplier for dynamic delay when multiple files pending */
    MULTIPLE_FILES_DELAY_MULTIPLIER: 1.5,
    
    /** Multiplier for dynamic delay when single file pending */
    SINGLE_FILE_DELAY_MULTIPLIER: 0.7,
    
    /** Threshold for "multiple files" pending */
    MULTIPLE_FILES_THRESHOLD: 3,
} as const;

/**
 * File patterns
 */
export const FILE_PATTERNS = {
    /** C/C++ file glob pattern */
    C_CPP_GLOB: '**/*.{c,cpp,cc,h,hpp,hh}',
    
    /** Exclude patterns for scanning */
    EXCLUDE_PATTERNS: '{**/node_modules/**,**/build/**,**/dist/**,**/.git/**}',
} as const;

/**
 * Precompiled regular expressions for better performance
 */
export const REGEX_PATTERNS = {
    /** Matches C/C++ macro names (uppercase with underscores) */
    MACRO_NAME: /\b[A-Z_][A-Z0-9_]*\b/g,
    
    /** Matches macro name with optional function call syntax */
    MACRO_WITH_CALL: /\b([A-Za-z_]\w*)\s*(\()?/g,
    
    /** Matches function-like macro call (uppercase identifiers only) */
    FUNCTION_LIKE_MACRO_CALL: /\b([A-Z_][A-Z0-9_]*)\s*\(/g,
    
    /** Matches object-like macro (no parentheses following) */
    OBJECT_LIKE_MACRO: /\b([A-Z_][A-Z0-9_]+)\b(?!\s*\()/g,
    
    /** Matches macro call with optional arguments */
    MACRO_CALL_WITH_ARGS: /\b([A-Za-z_]\w*)\s*\(/g,
    
    /** Matches #define directive */
    DEFINE_DIRECTIVE: /^\s*#\s*define\s+([A-Za-z_]\w*)(.*)$/,
    
    /** Matches function-like #define directive (with parentheses immediately after name, NO space) */
    DEFINE_FUNCTION_LIKE: /^\s*#\s*define\s+([A-Za-z_]\w*)\(/,
    
    /** Matches typedef declaration */
    TYPEDEF_DIRECTIVE: /^\s*typedef\s+/,
    
    /** Matches struct declaration with uppercase name */
    STRUCT_DECLARATION: /^\s*struct\s+([A-Z_][A-Z0-9_]*)/,
    
    /** Matches union declaration with uppercase name */
    UNION_DECLARATION: /^\s*union\s+([A-Z_][A-Z0-9_]*)/,
    
    /** Matches enum declaration with uppercase name */
    ENUM_DECLARATION: /^\s*enum\s+([A-Z_][A-Z0-9_]*)/,
    
    /** Matches anonymous enum declaration */
    ANONYMOUS_ENUM_DECLARATION: /^\s*enum\s*\{/,
    
    /** Matches line continuation (backslash at end of line) */
    LINE_CONTINUATION: /\\\s*$/,
    
    /** Matches C/C++ file extensions */
    CPP_FILE_EXTENSION: /\.(c|cpp|cc|h|hpp|hh)$/i,
    
    /** Matches file path separator (cross-platform) */
    PATH_SEPARATOR: /[/\\]/,
    
    /** Matches line breaks (cross-platform) */
    LINE_COMMENT: /\/\/.*$/gm,
    
    /** Matches block comment */
    BLOCK_COMMENT: /\/\*[\s\S]*?\*\//g,
    
    /** Matches multiple whitespace */
    MULTIPLE_WHITESPACE: /\s+/g,
    
    /** Matches backslash for escaping */
    BACKSLASH: /\\/g,
    
    /** Matches double quote for escaping */
    DOUBLE_QUOTE: /"/g,
    
    /** Matches __VA_ARGS__ */
    VA_ARGS: /__VA_ARGS__/g,
    
    /** Matches identifiers or variables */
    HAS_VARIABLES: /[a-zA-Z_]/,
    
    /** Matches operators */
    HAS_OPERATORS: /[+\-*\/%<>=&|^!?:]/,
    
    /** Matches safe numeric expression (for evaluation) */
    SAFE_NUMERIC_EXPRESSION: /^[0-9+\-*/().%\s]+$/,
    
    /** Matches standard C type cast */
    STANDARD_CAST: /^\s*\(\s*(const\s+|volatile\s+|unsigned\s+|signed\s+)*(char|short|int|long|float|double|void|size_t|ptrdiff_t|int\d+_t|uint\d+_t|struct\s+\w+|enum\s+\w+|union\s+\w+)(\s+\*+|\s*\*+|\s+const|\s+volatile)*\s*\)\s*\S/,
    
    /** Matches typedef type cast */
    TYPEDEF_CAST: /^\s*\(\s*(const\s+|volatile\s+)*([A-Z][A-Z0-9_]*|[A-Z][a-zA-Z0-9]*|\w+_[tT])(\s*\*+|\s+\*+|\s+const|\s+volatile)*\s*\)\s*\S/,
    
    /** Matches function pointer cast */
    FUNCTION_POINTER_CAST: /^\s*\(\s*\w+\s*\(\s*\*+\s*\)\s*\([^)]*\)\s*\)\s*\S/,
} as const;

/**
 * Built-in preprocessor identifiers that should not be flagged as undefined
 * These are defined by the C/C++ standard or common compilers
 */
export const BUILTIN_IDENTIFIERS = new Set([
    // Standard C/C++ predefined macros
    '__VA_ARGS__',      // Variadic macro arguments
    '__VA_OPT__',       // C++20 variadic macro optimization
    '__FILE__',         // Current file name
    '__LINE__',         // Current line number
    '__DATE__',         // Compilation date
    '__TIME__',         // Compilation time
    '__TIMESTAMP__',    // File modification timestamp
    '__STDC__',         // Standard C conformance
    '__STDC_VERSION__', // C standard version
    '__STDC_HOSTED__',  // Hosted implementation
    '__cplusplus',      // C++ version
    
    // Function name macros
    '__func__',         // C99 function name
    '__FUNCTION__',     // Function name (compiler extension)
    '__PRETTY_FUNCTION__', // Full function signature (GCC)
    
    // Common compiler-specific macros
    '__GNUC__',         // GCC version
    '__GNUC_MINOR__',   // GCC minor version
    '__GNUC_PATCHLEVEL__', // GCC patch level
    '__clang__',        // Clang compiler
    '__clang_major__',  // Clang major version
    '__clang_minor__',  // Clang minor version
    '__clang_patchlevel__', // Clang patch level
    '_MSC_VER',         // MSVC version
    '_MSC_FULL_VER',    // MSVC full version
    '__APPLE__',        // Apple platforms
    '__linux__',        // Linux platform
    '__unix__',         // Unix platform
    '__MINGW32__',      // MinGW 32-bit
    '__MINGW64__',      // MinGW 64-bit
    '_WIN32',           // Windows 32-bit
    '_WIN64',           // Windows 64-bit
    
    // Architecture macros
    '__x86_64__',       // x86-64 architecture
    '__i386__',         // x86 architecture
    '__arm__',          // ARM architecture
    '__aarch64__',      // ARM 64-bit
    
    // Common attribute macros
    '__attribute__',    // GCC attributes
    '__declspec',       // MSVC declspec
]);
