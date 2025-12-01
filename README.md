# C/C++ MacroLens

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.104.0+-blue.svg)](https://code.visualstudio.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18.0.0+-green.svg)](https://nodejs.org/)

A powerful Visual Studio Code extension for analyzing and expanding C/C++ preprocessor macros with intelligent diagnostics, interactive visualization, and real-time validation.

## ✨ Features

### 🔍 Intelligent Hover Information
Hover over any macro to see:
- **Complete expansion chain** with step-by-step transformation
- **Final expanded result** with redundant parentheses stripped
- **Multiple definition warnings** with quick navigation
- **Undefined macro warnings** in expansion results
- **Concatenated macro jump links** for every token produced via `##` during expansion
- Native VS Code "Go to Definition" support (F12)

### 🌳 Interactive Tree View
- **Visual expansion hierarchy** showing macro transformation steps
- **Two expansion modes**:
  - `single-macro`: Expand one macro at a time (innermost-first)
  - `single-layer`: Expand all macros at same depth simultaneously
- **Real-time updates** as you edit code
- **Collapsible branches** for complex nested macros
- **Toggle visibility** via settings

### 🔴 Smart Diagnostics
- **Undefined macro detection** with intelligent suggestions using VS Code's native symbol provider
- **Argument count validation** for function-like macros (including variadic `__VA_ARGS__`)
- **Multiple definition warnings** with quick picker to navigate
- **Type declaration recognition** (typedef, struct, enum, union) to prevent false positives
- **Expansion result validation** - warns if expanded code contains undefined macros
- **Source attribution** - all diagnostics clearly marked with "MacroLens"
- **Focus Mode** - Optional setting (`macrolens.diagnosticsFocusOnly`) to limit diagnostics to the active editor only, reducing noise in large projects.

### 💾 Smart Storage
- **Global storage** - no project directory pollution
- **Per-workspace isolation** - each project gets its own database
- **Clean Rebuild** - "Full Rescan" physically recreates the database to ensure zero fragmentation
- **Automatic fallback** - uses in-memory storage if SQLite unavailable
- **Efficient caching** - minimizes redundant parsing

### ⚡ Performance Optimized
- **Event-Driven Architecture** - decoupled updates for maximum responsiveness
- **LSP Safety** - 2s timeout on symbol searches prevents UI freezes
- **Incremental scanning** - only processes changed files
- **Intelligent debouncing** - responsive updates without excessive CPU usage
  - 500ms default delay (configurable 100-2000ms)
  - 8s maximum delay (configurable 2-30s) prevents indefinite postponement
- **Background processing** - non-blocking database updates
- **Lazy initialization** - activates only when C/C++ files detected
- **Smart file watching** - tracks create/modify/delete events

## 📦 Installation

### From VS Code Marketplace
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "C/C++ MacroLens"
4. Click Install

### From VSIX File
\`\`\`bash
code --install-extension c-cpp-macrolens-0.0.1.vsix
\`\`\`

### Requirements
- **VS Code**: 1.104.0 or higher
- **Node.js**: 18.0.0 or higher (for development)
- **C/C++ files**: Extension activates automatically when detected

## 🚀 Quick Start

1. **Open a C/C++ project** in VS Code
2. **Hover over a macro** to see expansion details
3. **Check the MacroLens panel** (Explorer sidebar) for tree view
4. **View diagnostics** in the Problems panel for undefined macros

### Example

\`\`\`c
#define PI 3.14159
#define SQUARE(x) ((x) * (x))
#define CIRCLE_AREA(r) (PI * SQUARE(r))

float area = CIRCLE_AREA(5.0);  // Hover here!
\`\`\`

**Hover shows:**
- **Definition**: \`#define CIRCLE_AREA(r) (PI * SQUARE(r))\`
- **Expansion**: 
  1. \`CIRCLE_AREA(5.0)\` → \`(PI * SQUARE(5.0))\`
  2. \`PI\` → \`3.14159\`
  3. \`SQUARE(5.0)\` → \`((5.0) * (5.0))\`
- **Final**: \`(3.14159 * ((5.0) * (5.0)))\`

## ⚙️ Configuration

Access via VS Code Settings (Ctrl+, / Cmd+,) and search for "MacroLens":

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| \`macrolens.stripExtraParentheses\` | boolean | \`true\` | Remove redundant parentheses in display |
| \`macrolens.enableTreeView\` | boolean | \`true\` | Show/hide macro expansion tree view |
| \`macrolens.enableHoverProvider\` | boolean | \`true\` | Enable/disable hover tooltips |
| \`macrolens.enableDiagnostics\` | boolean | \`true\` | Enable/disable diagnostics |
| \`macrolens.hoverShowDefinition\` | boolean | \`true\` | Show the \`#define\` snippet in MacroLens hover tooltips |
| \`macrolens.expansionMode\` | string | \`"single-layer"\` | Expansion strategy (\`single-macro\` or \`single-layer\`) |
| \`macrolens.debounceDelay\` | number | \`500\` | Debounce delay for file changes (100-2000ms) |
| \`macrolens.maxUpdateDelay\` | number | \`8000\` | Maximum delay before forced update (2-30s) |
| \`macrolens.detectTypeDeclarations\` | boolean | \`true\` | Recognize typedef/struct/enum/union to prevent false warnings |
| \`macrolens.maxExpansionDepth\` | number | \`30\` | Maximum recursion depth for macro expansion (5-100) |

### Expansion Modes

**single-layer** (default): Expands all macros at the same nesting depth simultaneously
\`\`\`
MATCH_IMPL(foo)
└── ML99_match(v(foo), v(MATCH_))           // v(foo) and v(MATCH_) expand together
    └── ML99_match((0v, foo), (0v, MATCH_)) // Result
\`\`\`

**single-macro**: Expands one macro at a time, innermost-first
\`\`\`
MATCH_IMPL(foo)
└── ML99_match(v(foo), v(MATCH_))           // First v(foo)
    └── ML99_match((0v, foo), v(MATCH_))    // Then v(MATCH_)
        └── ML99_match((0v, foo), (0v, MATCH_)) // Result
\`\`\`

## 🎮 Commands

Access via Command Palette (Ctrl+Shift+P / Cmd+Shift+P):

| Command | Description |
|---------|-------------|
| \`MacroLens: Rescan Project\` | Full project scan or open files only |
| \`MacroLens: Flush Pending Scans\` | Force immediate processing of queued file changes |
| \`MacroLens: Choose Macro Redefinition\` | Pick from multiple macro definitions |
| \`MacroLens: Show Performance Statistics\` | View detailed performance metrics |

## 🔧 Advanced Features

### Multiple Definition Handling
When a macro has multiple definitions:
- **Hover shows warning** with definition count
- **"Choose Definition" button** opens quick picker
- **Navigate to any definition** with one click
- **Diagnostics indicate** which definition is active

### Type Declaration Recognition
Automatically recognizes:
- \`typedef int INT32;\`
- \`struct Point { int x, y; };\`
- \`enum Status { OK, ERROR };\`
- \`union Value { int i; float f; };\`

These won't be flagged as undefined macros.

### Circular Reference Detection
Detects and prevents infinite expansion loops:
\`\`\`c
#define A B
#define B A
\`\`\`
Shows clear error message with expansion chain.

### Argument Count Validation
Validates function-like macro calls:
\`\`\`c
#define ADD(a, b) ((a) + (b))
int x = ADD(1);      // ❌ Error: Expected 2 arguments, got 1
int y = ADD(1, 2);   // ✅ Correct
\`\`\`

Supports variadic macros:
\`\`\`c
#define LOG(fmt, ...) printf(fmt, __VA_ARGS__)
LOG("value: %d", x);           // ✅ Correct
LOG("values: %d %d", x, y);    // ✅ Correct
\`\`\`

## 💡 Tips & Tricks

### Performance Tuning
For large projects (>1000 files):
- Increase \`debounceDelay\` to 1000-1500ms
- Increase \`maxUpdateDelay\` to 15000-20000ms
- Use "Open Files Only" rescan for quick updates

### Quick Navigation
- Press **F12** on any macro to jump to definition
- Use **"Choose Definition"** button in hover for multiple definitions
- Click diagnostic messages to jump to problem location

### Workspace Efficiency
- Enable only features you need (disable hover/diagnostics/tree if not used)
- Use \`.vscodeignore\` patterns to exclude vendor code from scanning
- Run "Flush Pending Scans" after bulk file changes

## 📁 Storage Location

MacroLens uses VS Code's global storage (no project pollution):

- **Windows**: \`%APPDATA%/Code/User/globalStorage/ytlee.c-cpp-macrolens/\`
- **macOS**: \`~/Library/Application Support/Code/User/globalStorage/ytlee.c-cpp-macrolens/\`
- **Linux**: \`~/.config/Code/User/globalStorage/ytlee.c-cpp-macrolens/\`

Each workspace gets its own database file (hashed from workspace path).

## 🐛 Troubleshooting

### Extension not activating
- Ensure C/C++ files exist in workspace
- Check VS Code version (requires 1.104.0+)
- Look for errors in Output panel (View → Output → MacroLens)

### Hover not showing
- Verify file is recognized as C/C++ (check status bar language)
- Run "MacroLens: Rescan Project" command
- Check if \`enableHoverProvider\` is enabled in settings

### Tree view not visible
- Check \`enableTreeView\` setting
- Expand "MacroLens" section in Explorer sidebar
- Ensure MacroLens panel container is not minimized

### Diagnostics not appearing
- Check \`enableDiagnostics\` setting
- Verify file is not too large (>5MB skipped)
- Run "MacroLens: Rescan Project" to rebuild database

### Performance issues
- Increase \`debounceDelay\` (try 1000-1500ms)
- Disable unused features (hover/diagnostics/tree)
- Exclude large vendor directories from workspace
- Check "Show Performance Statistics" command for bottlenecks

## 🏗️ Technical Architecture

\`\`\`
MacroLens Extension
├── Core Components
│   ├── MacroDatabase (SQLite with in-memory fallback)
│   │   ├── Per-workspace isolation
│   │   ├── Incremental scanning
│   │   └── Intelligent debouncing
│   ├── MacroExpander (Recursive expansion engine)
│   │   ├── Circular reference detection
│   │   ├── Parameter substitution
│   │   └── Token concatenation (##)
│   └── MacroParser (C/C++ preprocessing)
│       ├── Multi-line macro support
│       ├── Comment removal
│       └── Type declaration detection
├── Features
│   ├── HoverProvider (Interactive tooltips)
│   ├── DiagnosticsProvider (Error detection)
│   │   ├── Native Symbol Suggestions
│   │   ├── Argument count validation
│   │   └── Expansion result validation
│   └── TreeProvider (Visual hierarchy)
└── Utilities
    ├── Configuration (Settings management)
    └── MacroUtils (Shared parsing logic)
\`\`\`

### Key Technologies
- **TypeScript** - Type-safe development
- **Node.js SQLite** - Built-in database (Node 22+)
- **esbuild** - Fast bundling and minification
- **VS Code Extension API** - Native integration

## ⚠️ Known Limitations

### Macro Naming Convention
- **Uppercase assumption**: The extension assumes macros follow the conventional uppercase naming (e.g., `FOO`, `MAX_VALUE`)
- Lowercase or mixed-case macros may not be detected by diagnostics
- This is a common C/C++ convention, but not enforced by the C preprocessor

### Simplified Expansion Model
- **No build system integration**: The extension does not perform actual preprocessing or compilation
- **Simple text substitution**: Macros are expanded using a custom parser, not the C preprocessor
- **No include tracking**: All macros in the database are considered available, regardless of `#include` directives
- **No conditional compilation**: `#ifdef`, `#ifndef`, and `#if` directives are not evaluated
- The expansion shows what *would* happen if the macro were available, not what *will* happen during actual compilation

### Performance Considerations
- Large files (>5MB) may be skipped automatically
- Very large workspaces (>10,000 files) may experience slower initial scanning
- Real-time updates depend on file save events; unsaved changes are not reflected

## 📚 Documentation

- **[DEVELOPER.md](DEVELOPER.md)** - Development setup, architecture, and build instructions
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - How to contribute
- **[CHANGELOG.md](CHANGELOG.md)** - Version history

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Quick Development Setup
\`\`\`bash
# Clone repository
git clone https://github.com/Lee20171010/c-cpp-macrolens.git
cd c-cpp-macrolens

# Install dependencies
npm install

# Compile
npm run compile

# Run tests
npm test

# Package extension
npm run package
\`\`\`

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built with:
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Node.js SQLite](https://nodejs.org/api/sqlite.html)
- [esbuild](https://esbuild.github.io/)

## 📮 Support

- **Issues**: [GitHub Issues](https://github.com/Lee20171010/c-cpp-macrolens/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Lee20171010/c-cpp-macrolens/discussions)
- **Email**: [ytlee](https://github.com/Lee20171010)

---

**Enjoy intelligent C/C++ macro analysis with MacroLens!** 🔍✨
