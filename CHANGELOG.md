# Changelog

All notable changes to the "C/C++ MacroLens" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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