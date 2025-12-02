# C/C++ MacroLens - Developer Guide

Comprehensive technical documentation for developing, building, and maintaining the MacroLens extension.

## 📋 Table of Contents

- [Development Setup](#-development-setup)
- [Project Structure](#-project-structure)
- [Architecture](#-architecture)
- [Core Components](#-core-components)
- [Build System](#-build-system)
- [Testing](#-testing)
- [Debugging](#-debugging)
- [Performance Considerations](#-performance-considerations)
- [Extension API Usage](#-extension-api-usage)
- [Contributing Guidelines](#-contributing-guidelines)

## 🏗️ Development Setup

### Prerequisites

- **Node.js**: 18.0.0+ (Node 22+ recommended for SQLite support)
- **npm**: 8.0.0+
- **VS Code**: 1.104.0+
- **Git**: For version control
- **TypeScript**: 5.x (installed via npm)

### Installation

```bash
# Clone repository
git clone https://github.com/Lee20171010/c-cpp-macrolens.git
cd c-cpp-macrolens

# Install dependencies
npm install

# Install VS Code Extension Manager (optional, for packaging)
npm install -g @vscode/vsce
```

### VS Code Setup

Recommended extensions:
- **ESLint**: For code quality
- **TypeScript and JavaScript Language Features**: Built-in
- **Test Explorer UI**: For test visualization

## 📁 Project Structure

```
c-cpp-macrolens/
├── src/                          # Source code
│   ├── extension.ts              # Entry point, extension activation
│   ├── configuration.ts          # Settings management
│   ├── core/                     # Core logic
│   │   ├── macroDb.ts            # SQLite + in-memory database
│   │   ├── macroExpander.ts      # Recursive expansion engine
│   │   └── macroParser.ts        # C/C++ preprocessing
│   ├── features/                 # VS Code features
│   │   ├── diagnostics.ts        # Error detection
│   │   ├── hoverProvider.ts      # Hover tooltips
│   │   └── treeProvider.ts       # Tree view sidebar
│   ├── utils/                    # Shared utilities
│   │   ├── constants.ts          # Global constants
│   │   └── macroUtils.ts         # Parsing helpers
│   └── test/                     # Legacy tests (TS)
│       ├── extension.test.ts
│       └── test.c
├── tests/                        # Modern test suite (JS)
│   ├── unit/                     # Unit tests
│   │   └── core/                 # Core component tests
│   │       ├── macroDb.test.js
│   │       ├── macroExpander.test.js
│   │       └── macroParser.test.js
│   ├── integration/              # Integration tests
│   │   ├── test_commands.js
│   │   └── test_macro_parsing.js
│   ├── fixtures/                 # Test data
│   └── helpers/                  # Test utilities
├── esbuild.js                    # Build configuration
├── eslint.config.mjs             # Linting configuration
├── tsconfig.json                 # TypeScript configuration
├── package.json                  # Extension manifest
├── CHANGELOG.md                  # Version history
├── CONTRIBUTING.md               # Contribution guidelines
└── README.md                     # User documentation
```

### Key Files

- **package.json**: Extension metadata, commands, configuration schema, activation events
- **extension.ts**: Extension lifecycle, smart activation, component initialization
- **esbuild.js**: Bundler configuration with minification and external modules
- **tsconfig.json**: TypeScript compiler options (ES2022, strict mode)
- **eslint.config.mjs**: ESLint v9 flat config with TypeScript support

## 🏛️ Architecture

### Overview

MacroLens follows a **modular singleton pattern** with clear separation of concerns:

```
Extension Activation
        ↓
    Configuration
        ↓
   MacroDatabase ← MacroParser (per-file)
        ↓
  MacroExpander
        ↓
   ┌────┴────┬──────────┐
   ↓         ↓          ↓
HoverProvider  Diagnostics  TreeProvider
```

### Design Principles

1. **Lazy Initialization**: Components only created when needed
2. **Smart Activation**: Extension activates only when C/C++ files detected
3. **Singleton Services**: Core services (database, expander) shared across features
4. **Configuration-Driven**: Features toggled via workspace settings
5. **Incremental Updates**: Only reprocess changed files
6. **Event-Driven Updates**: Database emits events to notify consumers (Diagnostics)
7. **Defensive Programming**: Fallback mechanisms (in-memory DB, error handling)

### Activation Flow

1. **VS Code starts** → Checks activation events (`onLanguage:c`, `onLanguage:cpp`)
2. **C/C++ file detected** → Calls `activate()` in `extension.ts`
3. **Configuration loaded** → `Configuration.initialize(context)`
4. **Database initialized** → `MacroDatabase.getInstance(context, config)`
   - Tries SQLite (Node 22+)
   - Falls back to InMemoryDatabase if unavailable
5. **File watcher registered** → Monitors create/modify/delete events
6. **Features activated** (if enabled):
   - HoverProvider
   - DiagnosticsProvider
   - TreeProvider
7. **Initial scan** → Opens files scanned, workspace scan deferred

### Data Flow

```
File Change Event
        ↓
    Debouncing (500ms-8s)
        ↓
   MacroParser.parse()
        ↓
   MacroDatabase Update
        ↓
   Event Emitter (onDidChange)
        ↓
   Diagnostics.analyze()
```

## 🧩 Core Components

### 1. MacroDatabase (`src/core/macroDb.ts`)

**Purpose**: Persistent storage for macro definitions with per-workspace isolation.

**Key Classes**:
- `MacroDatabase`: Singleton interface, auto-selects implementation
- `SQLiteDatabase`: Node.js SQLite (Node 22+) with prepared statements
- `InMemoryDatabase`: Fallback using Map for older Node versions

**Schema**:
```typescript
interface MacroDef {
  name: string;           // Macro name
  definition: string;     // Full #define line
  params?: string[];      // Function-like macro parameters
  location: string;       // file:line:column
  isDefine: boolean;      // true=#define, false=type declaration
}
```

**Key Methods**:
- `getMacro(name)`: Retrieve macro definitions
- `saveMacros(file, macros[])`: Batch insert with replace strategy
- `removeMacrosFromFile(file)`: Delete all macros from file
- `getAllMacros()`: Full scan (for tree view)
- `resetDatabase()`: Physically delete and recreate DB file (Clean Rebuild)
- `onDidChange`: Event fired when database content changes

**Storage Location**:
- Uses `context.globalStorageUri` from VS Code API
- Database filename: SHA256 hash of workspace path + `.db`
- Example: `~/.config/Code/User/globalStorage/ytlee.c-cpp-macrolens/abc123def456.db`

**Performance Notes**:
- SQLite transactions for batch inserts (~1000 macros/sec)
- In-memory fallback ~10x faster but loses data on close
- Prepared statements prevent SQL injection
- **Clean Rebuild**: "Full Rescan" deletes the .db file to ensure zero fragmentation

### 2. MacroParser (`src/core/macroParser.ts`)

**Purpose**: Parse C/C++ source files to extract macro definitions.

**Key Functions**:
- `parseMacros(content, filePath)`: Main parser entry point
- `parseDefine(line)`: Extract #define macros
- `parseTypeDeclaration(line)`: Detect typedef/struct/enum/union
- `handleMultilineDefine(lines)`: Combine backslash-continued lines
- `removeComments(content)`: Strip // and /* */ comments

**Features**:
- **Multi-line support**: Handles backslash continuations
- **Comment removal**: Prevents false macro detection in comments
- **Type recognition**: Marks typedef/struct/enum/union with `isDefine: false`
- **Parameter lowercasing**: Normalizes params for diagnostics (e.g., `X` → `x`)
- **Location tracking**: Records file:line:column for navigation

**Parsing Strategy**:
1. Remove comments first
2. Combine multi-line macros
3. Scan for `#define` or type keywords
4. Extract name, parameters (if any), and body
5. Return `MacroDef[]`

**Edge Cases Handled**:
- Nested comments (minimal support)
- String literals with quotes
- Preprocessor directives (`#ifdef`, `#undef`, etc.)
- Function-like vs object-like macros

### 3. MacroExpander (`src/core/macroExpander.ts`)

**Purpose**: Recursively expand macros with circular reference detection.

**Key Class**: `MacroExpander`

**Key Methods**:
- `expand(macro, args?, mode?)`: Main expansion entry
- `expandSingleMacro(text, mode)`: One-level expansion
- `expandSingleLayer(text)`: Expand all macros at same depth
- `substituteParams(body, params, args)`: Replace parameters with arguments
- `handleTokenPaste(text)`: Process `##` operator
- `handleStringify(text)`: Process `#` operator
- `detectCircularReference(chain)`: Prevent infinite loops

**Expansion Modes**:
- **single-macro**: Innermost-first, one at a time (for debugging)
- **single-layer**: All macros at same depth (default, more intuitive)

**Operators Supported**:
- `##` (token pasting): `A##B` → `AB`
- `#` (stringification): `#X` → `"X"`

**Validation**:
- **Circular references**: Tracks expansion chain, reports loop
- **Undefined macros**: Returns partial expansion with warning
- **Argument count**: Validates before substitution
- **Max depth**: Prevents excessive recursion (default 30)

**Example Expansion**:
```c
#define SQUARE(x) ((x) * (x))
#define DOUBLE(x) (2 * (x))
#define CALC(x) DOUBLE(SQUARE(x))

CALC(3) → DOUBLE(SQUARE(3))
        → DOUBLE(((3) * (3)))
        → (2 * (((3) * (3))))
```

### 4. Configuration (`src/configuration.ts`)

**Purpose**: Centralized settings management with VS Code integration.

**Key Class**: `Configuration`

**Settings**:
```typescript
{
  stripExtraParentheses: boolean,    // UI cleanup
  enableTreeView: boolean,            // Toggle sidebar
  enableHoverProvider: boolean,       // Toggle tooltips
  enableDiagnostics: boolean,         // Toggle error detection
  expansionMode: 'single-macro' | 'single-layer',
  debounceDelay: number,              // 100-2000ms
  maxUpdateDelay: number,             // 2000-30000ms
  detectTypeDeclarations: boolean,    // typedef/struct filtering
  maxExpansionDepth: number,          // 5-100
  diagnosticsFocusOnly: boolean       // Only analyze active editor
}
```

**Key Methods**:
- `get(key)`: Retrieve setting value
- `update(key, value)`: Change setting programmatically
- `onDidChange(callback)`: React to setting changes

**Change Handling**:
- Debouncing delays update when changed
- Features re-initialize on relevant setting changes
- Validation ensures values in acceptable ranges

## 🛠️ Build System

### esbuild Configuration (`esbuild.js`)

**Purpose**: Fast bundling and minification for production.

```javascript
const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

await esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],              // VS Code API not bundled
  format: 'cjs',                     // CommonJS for Node.js
  platform: 'node',
  target: 'node18',
  sourcemap: !production,
  minify: production,
  logLevel: 'info'
});
```

**Key Features**:
- **Bundle size**: ~150KB minified (vs ~500KB unbundled)
- **Build time**: ~100ms (vs ~3s with tsc)
- **External modules**: `vscode` API excluded
- **Watch mode**: `--watch` for live recompilation
- **Production mode**: `--production` enables minification

**Build Commands**:
```bash
npm run compile          # Production build (minified)
npm run watch            # Watch mode (with sourcemaps)
npm run check-types      # TypeScript type checking only
```

### TypeScript Configuration (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "module": "Node16",
    "target": "ES2022",
    "lib": ["ES2022"],
    "sourceMap": true,
    "strict": true,
    "noImplicitAny": true,
    "skipLibCheck": true,
    "moduleResolution": "Node16"
  }
}
```

**Key Settings**:
- **ES2022**: Modern JavaScript features (async/await, optional chaining)
- **Strict mode**: Maximum type safety
- **Node16 modules**: ESM + CJS interop
- **Skip lib check**: Faster compilation

### ESLint Configuration (`eslint.config.mjs`)

```javascript
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  }
);
```

**Key Rules**:
- **no-explicit-any**: Discourage `any` type
- **no-unused-vars**: Prevent dead code (allows `_` prefix for intentional)
- **TypeScript recommended**: Stricter checking

## 🧪 Testing

### Test Structure

```
tests/
├── unit/                    # Component tests
│   └── core/
│       ├── macroDb.test.js
│       ├── macroExpander.test.js
│       └── macroParser.test.js
├── integration/             # Feature tests
│   ├── test_commands.js
│   └── test_macro_parsing.js
├── fixtures/                # Test files (C code)
│   ├── test_issue.c
│   └── test_unbalanced_parentheses.c
└── helpers/
    └── testUtils.js         # Shared test utilities
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/unit/core/macroDb.test.js

# Watch mode
npm run watch-tests

# Coverage (if configured)
npm run test:coverage
```

### Test Utilities (`tests/helpers/testUtils.js`)

Provides helpers for:
- **Mock VS Code API**: Simulated context, configuration
- **Test fixtures**: Load C/C++ test files
- **Assertions**: Custom matchers for macro definitions

### Writing Tests

Example unit test:
```javascript
import { MacroParser } from '../../../src/core/macroParser.js';

describe('MacroParser', () => {
  it('should parse simple define', () => {
    const code = '#define PI 3.14159';
    const macros = MacroParser.parseMacros(code, 'test.c');
    
    expect(macros).toHaveLength(1);
    expect(macros[0].name).toBe('PI');
    expect(macros[0].definition).toContain('3.14159');
    expect(macros[0].isDefine).toBe(true);
  });
});
```

## 🐛 Debugging

### Launch Configuration (`.vscode/launch.json`)

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}"
      ],
      "outFiles": ["${workspaceFolder}/out/**/*.js"],
      "preLaunchTask": "npm: watch"
    },
    {
      "name": "Extension Tests",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--extensionTestsPath=${workspaceFolder}/out/test/index"
      ]
    }
  ]
}
```

### Debugging Steps

1. **Set breakpoints** in TypeScript source files
2. **Press F5** to launch Extension Development Host
3. **Open C/C++ file** in new window to trigger activation
4. **Interact with extension** (hover, run commands)
5. **Check Debug Console** for output

### Logging

Use VS Code Output panel:
```typescript
import * as vscode from 'vscode';

const outputChannel = vscode.window.createOutputChannel('MacroLens');
outputChannel.appendLine('Debug message');
outputChannel.show();
```

### Common Issues

**Extension not activating**:
- Check `activationEvents` in `package.json`
- Ensure C/C++ files present in workspace
- Look for errors in Debug Console

**Breakpoints not hitting**:
- Verify sourcemaps enabled (`"sourceMap": true` in tsconfig.json)
- Check `outFiles` path in launch.json
- Rebuild with `npm run compile`

**SQLite errors**:
- Confirm Node.js version (22+ for SQLite)
- Check globalStorage path permissions
- Fallback to InMemoryDatabase should happen automatically

## ⚡ Performance Considerations

### Database Performance

**SQLite Optimizations**:
- **Transactions**: Batch 1000+ inserts in single transaction
- **Prepared statements**: Reuse compiled queries
- **Indices**: Index on `name` column for fast lookups
- **REPLACE strategy**: Atomic update/insert (prevents duplicates)

**In-Memory Fallback**:
- 10x faster than SQLite for reads
- No disk I/O overhead
- Trade-off: Data lost on close

### Debouncing Strategy

**Problem**: Every keystroke triggers file save → database update → UI refresh

**Solution**: Two-level debouncing
```typescript
debounceDelay: 500ms      // Wait 500ms after last change
maxUpdateDelay: 8000ms    // Force update after 8s max
```

**Benefits**:
- Responsive during typing (waits for pause)
- Prevents indefinite postponement (max delay)
- Reduces CPU usage (~90% fewer updates)

### Parsing Optimization

**Comment Removal**: 
- Single-pass regex for // and /* */
- Avoids line-by-line processing

**Multi-line Handling**:
- Pre-process all backslash continuations
- Parse combined lines once

**Type Detection**:
- Early exit on `isDefine: false`
- Skips expensive expansion for non-macros

### UI Update Batching

**Problem**: 1000 macros → 1000 tree view updates

**Solution**: Batch updates
```typescript
treeProvider.refresh();  // Single UI refresh for all changes
```

**Benefits**:
- Reduces UI flicker
- Improves perceived performance
- Prevents VS Code UI thread blocking

### Diagnostics Optimization

**Problem**: Checking for undefined macros in a large file with many macro calls caused "Unresponsive extension host" due to O(N²) complexity (repeated regex scanning for every token).

**Solution**: O(N) Algorithm
1. **Pre-calculation**: Scan the file once to identify all macro argument ranges.
2. **Single Pass**: Iterate through tokens and check against pre-calculated ranges.
3. **Max Wait**: Implemented `maxUpdateDelay` to ensure diagnostics run eventually even during continuous typing.

## 🔌 Extension API Usage

### Activation Events

```json
{
  "activationEvents": [
    "onLanguage:c",
    "onLanguage:cpp"
  ]
}
```

**Smart Activation**:
```typescript
if (noC/C++FilesFound) {
  // Defer activation until C/C++ file opened
  workspace.onDidOpenTextDocument(activate);
  return;
}
```

### Commands

```json
{
  "commands": [
    {
      "command": "macrolens.rescan",
      "title": "MacroLens: Rescan Project"
    }
  ]
}
```

**Registration**:
```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('macrolens.rescan', async () => {
    // Implementation
  })
);
```

### Configuration Schema

```json
{
  "configuration": {
    "properties": {
      "macrolens.enableTreeView": {
        "type": "boolean",
        "default": true,
        "description": "Enable/disable tree view"
      }
    }
  }
}
```

**Accessing Settings**:
```typescript
const config = vscode.workspace.getConfiguration('macrolens');
const enabled = config.get<boolean>('enableTreeView');
```

### File System Watcher

```typescript
const watcher = vscode.workspace.createFileSystemWatcher('**/*.{c,cpp,h,hpp}');

watcher.onDidChange(uri => {
  // Handle file modification
});

watcher.onDidCreate(uri => {
  // Handle file creation
});

watcher.onDidDelete(uri => {
  // Handle file deletion
});

context.subscriptions.push(watcher);
```

### Tree View Provider

```typescript
class MacroTreeProvider implements vscode.TreeDataProvider<MacroTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MacroTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: MacroTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: MacroTreeItem): Thenable<MacroTreeItem[]> {
    // Return tree hierarchy
  }
}

vscode.window.registerTreeDataProvider('macrolensTreeView', provider);
```

### Hover Provider

```typescript
class MacroHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
    const range = document.getWordRangeAtPosition(position);
    const word = document.getText(range);
    
    // Lookup macro, expand, return Markdown content
    return new vscode.Hover(markdownContent, range);
  }
}

vscode.languages.registerHoverProvider(['c', 'cpp'], provider);
```

### Diagnostics Collection

```typescript
const diagnostics = vscode.languages.createDiagnosticCollection('macrolens');

diagnostics.set(document.uri, [
  new vscode.Diagnostic(
    range,
    'Undefined macro: FOO',
    vscode.DiagnosticSeverity.Warning
  )
]);

context.subscriptions.push(diagnostics);
```

## 🤝 Contributing Guidelines

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed contribution instructions.

### Quick Checklist

- [ ] Code follows TypeScript strict mode
- [ ] ESLint warnings resolved
- [ ] Unit tests added for new features
- [ ] Integration tests pass
- [ ] Documentation updated (README, CHANGELOG)
- [ ] No console.log statements (use OutputChannel)
- [ ] Error handling added (try/catch, fallbacks)
- [ ] Performance impact considered

### Code Style

- **Naming**: camelCase for variables/functions, PascalCase for classes
- **Formatting**: Prettier with 2-space indent (auto-format on save)
- **Comments**: JSDoc for public APIs, inline for complex logic
- **Async**: Use async/await, avoid callbacks
- **Error handling**: Always catch Promise rejections

### Pull Request Process

1. Fork repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request with description

### Release Process

1. Update `CHANGELOG.md` with new version
2. Bump version in `package.json`
3. Run tests: `npm test`
4. Build: `npm run compile`
5. Package: `vsce package`
6. Test VSIX: `code --install-extension c-cpp-macrolens-X.Y.Z.vsix`
7. Publish: `vsce publish`

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/Lee20171010/c-cpp-macrolens/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Lee20171010/c-cpp-macrolens/discussions)

---

**Happy developing!** 🚀
