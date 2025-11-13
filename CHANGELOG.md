# Changelog

All notable changes to the "C/C++ MacroLens" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### ✨ Features

- **Unbalanced Parentheses Detection**: Comprehensive detection of syntax errors in macro definitions
  - Detect unbalanced parentheses in function-like macro parameter lists (Error)
  - Detect unbalanced parentheses in macro body (Warning)
  - Show clear error messages distinguishing between parameter list errors and body warnings
  - Prevent expansion of macros with unbalanced parentheses
  - Display special hover messages for unbalanced macros with helpful error information

### 🐛 Bug Fixes

- **Parameter Substitution Order**: Fixed incorrect macro expansion due to sequential parameter replacement
  - Implemented two-phase replacement using placeholders to prevent parameter name conflicts
  - Phase 1: Replace all parameter names with unique placeholders (`__PARAM_N__`)
  - Phase 2: Replace placeholders with expanded argument values
  - Fixes issue where later parameters would incorrectly match text already substituted by earlier parameters
  - Example: `TST(a,b,c,d)` with `#define TST(a,b,c,d) MUL1(ADD(a,b), ADD(c,d))` now correctly expands to `((a+b)*(c+d))` instead of `((a+(c+d))*(c+d))`

- **Duplicate Diagnostics**: Fixed duplicate error reporting for unbalanced parentheses
  - Adjusted diagnostic execution order to check definitions before usage
  - Added `isDefineLine` check to skip reporting usage errors for macro definitions
  - Prevents double reporting when a macro definition itself has unbalanced parentheses
  - Only reports usage errors (`unbalanced-parentheses-usage`) for actual macro calls

- **Nested Macro Hover**: Fixed hover display to show the innermost macro at cursor position
  - Changed `findMacroAtPosition` to return the most specific (smallest range) macro when multiple macros overlap
  - Previously showed outermost macro when cursor was on nested macro calls like `NESTED(WRAPPER(5))`
  - Now correctly identifies and displays the macro directly under the cursor
  - Algorithm collects all matching macros and selects the one with smallest character range

### ⚡ Performance

- **Diagnostics Optimization**: Improved performance by using VS Code document API instead of manual text parsing
  - Replaced O(n) `isDefineLine` loop with O(1) `document.lineAt()` calls
  - Eliminated redundant text splitting in diagnostic checks
  - Faster response time for large files

- **Mixed Line Endings Support**: Enhanced `lowercaseDefineParameters` to handle mixed line endings
  - Supports files with mixed `\r\n` (Windows), `\n` (Unix), and `\r` (old Mac) line endings
  - Preserves original line separators when processing macro definitions
  - Handles edge cases like copy-pasting code from different platforms

## [0.1.3] - 2025-11-06

### 🐛 Bug Fixes

- **Multi-line Macro Call Support**: Fixed hover provider to correctly handle macro calls spanning multiple lines
  - Read up to 50 lines (or 5000 characters) from cursor position to capture complete macro calls
  - Support for backslash line continuations in macro arguments (e.g., `FOO(arg1, \ arg2)`)
  - Calculate character position relative to line start for accurate macro detection
  - Fixed `findMacroAtPosition` return type to always return non-null result

- **Argument Extraction Normalization**: Fixed extractArguments to handle multiline macro calls
  - Remove backslash line continuations (`\` followed by newlines) from extracted arguments
  - Normalize whitespace in arguments to prevent false diagnostics
  - Applied regex pattern `/\\\s*[\r\n]+\s*/g` to clean line continuation characters
  - Fixes false positive "undefined macro" diagnostics caused by malformed arguments

### 🚀 Performance

- **Comment Removal in Hover**: Added comment filtering before macro parsing
  - Remove comments using `MacroParser.removeCommentsWithPlaceholders` to avoid interference
  - Prevents comments containing parentheses or commas from breaking macro argument parsing
  - Maintains position accuracy using whitespace placeholders
  - Consistent with diagnostics processing approach

## [0.1.2] - 2025-11-06

### 🚀 Performance

- **Whitespace Placeholder Architecture**: Replaced position mapping with whitespace placeholders
  - Text processing now preserves exact character positions by replacing removed content with spaces
  - Eliminated complex `findOriginalPosition` and `buildPositionMap` methods
  - Simplified diagnostics processing with unified `cleanText` approach
  - Removed document cache - files are reprocessed on each change for accuracy

### 🧹 Code Quality

- **Method Unification**: Consolidated text processing implementations
  - Unified `removeComments`, `removePreprocessorDirectives` to use placeholder-based versions
  - Removed duplicate `removeCommentsInternal` method (45 lines)
  - Simplified method signatures by removing unnecessary `originalText` parameters
  - Consistent use of `cleanText` for all position-based operations

- **Removed Unused Code**: Cleaned up unused methods and tests
  - Removed `removePreprocessorDirectives` method (unused in production)
  - Removed corresponding test cases for unused functionality
  - Streamlined variable usage in `analyzeImmediate` method

### 🐛 Bug Fixes

- **Diagnostic Position Accuracy**: Fixed incorrect diagnostic positions
  - Fixed `lowercaseDefineParameters` to preserve exact character positions
  - Changed from string reconstruction to in-place replacement
  - Preserved original newline format (`\r\n` vs `\n`) to maintain position accuracy

## [0.1.1] - 2025-11-05

### 🚀 Performance

- **Lazy Evaluation for Suggestions**: Moved Levenshtein distance calculations from diagnostics phase to hover phase
  - Diagnostics now show simplified messages without suggestions (e.g., "Undefined macro 'FOO'")
  - Suggestions computed on-demand when user hovers over undefined macros (e.g., "Did you mean: `FOO`, `FOOBAR`?")
  - Significantly reduces CPU usage during file editing and saving
  - Removed file size limit in diagnostics - now handles files of any size

### 🐛 Bug Fixes

- **Position Mapping in Diagnostics**: Fixed incorrect diagnostic positions after macro parameter lowercasing
  - Fixed `DEFINE_FUNCTION_LIKE` regex from `/\s*\(/` to `/\(/` to prevent false positives on object-like macros
  - Enhanced `buildPositionMap` to use case-insensitive matching for accurate position tracking
  - Diagnostics now correctly highlight the actual macro usage locations in source code

## [0.1.0] - 2025-10-31

### 🎉 Initial Release

First public release of C/C++ MacroLens - a powerful VS Code extension for analyzing and expanding C/C++ preprocessor macros.

### ✨ Features

#### Core Functionality
- **Macro Database**: Persistent storage using Node.js SQLite with in-memory fallback
  - Per-workspace isolation via VS Code globalStorage API
  - Automatic database creation and migration
  - Incremental file scanning with intelligent debouncing
  - Support for both SQLite (Node 22+) and in-memory storage

- **Macro Parser**: Advanced C/C++ preprocessing
  - Multi-line macro support (backslash continuations)
  - Comment removal (single-line `//` and multi-line `/* */`)
  - Type declaration detection (`typedef`, `struct`, `enum`, `union`)
  - Function-like and object-like macro differentiation
  - Accurate location tracking (file:line:column)

- **Macro Expander**: Recursive expansion engine
  - Two expansion modes: `single-macro` (innermost-first) and `single-layer` (parallel)
  - Circular reference detection with expansion chain tracking
  - Parameter substitution with validation
  - Token concatenation operator (`##`)
  - Stringification operator (`#`)
  - Configurable maximum expansion depth (5-100, default 30)
  - Undefined macro detection in expansion results

#### VS Code Integration

- **Hover Provider**: Interactive tooltips
  - Complete expansion chain visualization
  - Final expanded result with optional parentheses stripping
  - Multiple definition warnings with quick picker navigation
  - Undefined macro warnings in results
  - Native "Go to Definition" support (F12)

- **Tree View Provider**: Visual expansion hierarchy
  - Real-time updates on file changes
  - Collapsible branches for nested macros
  - Two expansion mode support
  - Unique node identification
  - Toggle visibility via settings

- **Diagnostics Provider**: Smart error detection
  - Undefined macro detection with Levenshtein distance suggestions (max distance 2)
  - Argument count validation for function-like macros
  - Variadic macro support (`__VA_ARGS__`)
  - Multiple definition warnings
  - Expansion result validation
  - 500ms debounce delay with intelligent caching
  - Source attribution ("MacroLens")

#### Commands

- **Rescan Project**: Full workspace or open files only scan
- **Flush Pending Scans**: Force immediate processing of queued changes
- **Choose Macro Redefinition**: Navigate between multiple definitions
- **Show Performance Statistics**: View detailed performance metrics

#### Configuration Options

Nine configurable settings:
- `stripExtraParentheses` (boolean, default: true)
- `enableTreeView` (boolean, default: true)
- `enableHoverProvider` (boolean, default: true)
- `enableDiagnostics` (boolean, default: true)
- `expansionMode` (string, default: "single-layer")
- `debounceDelay` (number, default: 500ms, range: 100-2000ms)
- `maxUpdateDelay` (number, default: 8000ms, range: 2000-30000ms)
- `detectTypeDeclarations` (boolean, default: true)
- `maxExpansionDepth` (number, default: 30, range: 5-100)

### 🚀 Performance Optimizations

- **Smart Activation**: Extension activates only when C/C++ files detected
- **Lazy Initialization**: Components created on-demand
- **Incremental Scanning**: Only processes changed files
- **Intelligent Debouncing**: Two-level delay system (initial + maximum)
- **Database Transactions**: Batch inserts for 1000+ macros
- **Prepared Statements**: Reusable compiled queries
- **Caching**: Distance cache and macro name cache for diagnostics
- **Background Processing**: Non-blocking database updates
- **UI Update Batching**: Single refresh for multiple changes

### 🛠️ Technical Stack

- **Language**: TypeScript 5.x with strict mode
- **Build System**: esbuild for fast bundling (~150KB minified)
- **Code Quality**: ESLint v9 with TypeScript plugin
- **Database**: Node.js SQLite (Node 22+) with Map-based fallback
- **VS Code API**: 1.104.0+
- **Node.js**: 18.0.0+ (22.0.0+ recommended)

### 📦 Packaging

- **Bundle Size**: ~150KB minified (vs ~500KB unbundled)
- **Build Time**: ~100ms with esbuild (vs ~3s with tsc)
- **External Dependencies**: `vscode` API excluded from bundle
- **Platform**: Node.js with CommonJS format
- **Target**: Node 18 (ES2022 features)

### 📚 Documentation

- **README.md**: User guide with installation, features, configuration, troubleshooting
- **DEVELOPER.md**: Technical documentation for contributors
- **CONTRIBUTING.md**: Contribution guidelines and project structure
- **CHANGELOG.md**: Version history (this file)

### 🐛 Known Limitations

- **SQLite Availability**: Requires Node 22+ for built-in SQLite; falls back to in-memory storage
- **Comment Handling**: Minimal support for nested comments
- **Preprocessor Directives**: Limited support for complex `#ifdef`/`#ifndef` logic
- **Macro Expansion**: Does not execute C preprocessor; uses custom parser
- **Large Files**: Files >5MB may be skipped for performance
- **Real-time Parsing**: Depends on file save events; unsaved changes not reflected

### 🔮 Future Enhancements (Not in v0.0.1)

- Enhanced preprocessor directive handling
- Inline macro expansion with CodeLens
- Export expansion results to file
- Macro usage statistics and heat maps
- Integration with clangd/cpptools for cross-referencing
- Support for custom macro definition sources (compile_commands.json)
- Improved performance for very large codebases (>10,000 files)

### 🙏 Acknowledgments

Built with:
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Node.js SQLite](https://nodejs.org/api/sqlite.html)
- [esbuild](https://esbuild.github.io/)
- [TypeScript](https://www.typescriptlang.org/)
- [ESLint](https://eslint.org/)

### 📝 Migration Notes

This is the initial release. No migration required.

### 🔗 Links

- **GitHub Repository**: [Lee20171010/c-cpp-macrolens](https://github.com/Lee20171010/c-cpp-macrolens)
- **VS Code Marketplace**: [Coming Soon]
- **Documentation**: See [README.md](README.md)
- **Developer Guide**: See [DEVELOPER.md](DEVELOPER.md)
- **Contributing**: See [CONTRIBUTING.md](CONTRIBUTING.md)

---

## Version History Summary

- **v0.0.1** (2025-10-31): Initial release with core macro expansion, hover, tree view, and diagnostics features

---