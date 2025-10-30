# Contributing to C/C++ MacroLens

Thank you for your interest in contributing! This guide will help you get started with contributing to the C/C++ MacroLens extension.

## 📋 Table of Contents

- [How to Contribute](#-how-to-contribute)
- [Reporting Bugs](#-reporting-bugs)
- [Suggesting Features](#-suggesting-features)
- [Development Setup](#-development-setup)
- [Project Structure](#-project-structure)
- [Coding Standards](#-coding-standards)
- [Pull Request Process](#-pull-request-process)
- [Testing Guidelines](#-testing-guidelines)
- [Documentation](#-documentation)
- [Community Guidelines](#-community-guidelines)

## 🤝 How to Contribute

There are many ways to contribute:

- 🐛 **Report bugs** - Help identify and fix issues
- 💡 **Suggest features** - Share ideas for improvements
- 📝 **Improve documentation** - Help others understand the extension
- 🔧 **Submit code changes** - Fix bugs or implement features
- 🧪 **Write tests** - Improve code coverage and reliability
- 🌐 **Translate** - Make extension available in more languages (future)

## 🐛 Reporting Bugs

### Before Reporting

1. **Search existing issues** to avoid duplicates
2. **Use the latest version** of the extension
3. **Test with minimal configuration** to isolate the issue
4. **Check the Output panel** (View → Output → MacroLens)

### Bug Report Template

```markdown
**Description**
Clear description of the bug.

**To Reproduce**
1. Open file 'example.c'
2. Hover over macro 'FOO'
3. Observe incorrect expansion

**Expected Behavior**
What should happen.

**Actual Behavior**
What actually happens.

**Code Sample**
```c
#define FOO(x) ((x) * 2)
int y = FOO(5);  // Expected: ((5) * 2), Got: ???
```

**Environment**
- VS Code Version: 1.104.0
- OS: macOS 14.0 / Windows 11 / Ubuntu 22.04
- Extension Version: 0.0.1
- Node.js Version: 22.0.0

**Screenshots**
If applicable.

**Extension Output**
Paste relevant output from MacroLens output channel.

**Additional Context**
Any other information (large file, specific language features, etc.)
```

### Critical Bugs

For security issues or data loss bugs:
- **Do NOT open a public issue**
- Email directly: [Security contact]
- Include full details privately

## 💡 Suggesting Features

### Before Suggesting

1. **Check existing issues** and discussions
2. **Read the documentation** - feature may already exist
3. **Consider scope** - does it fit the extension's purpose?

### Feature Request Template

```markdown
**Feature Description**
Clear, concise description.

**Use Case**
Real-world scenario where this helps.

**Proposed Solution**
How you envision it working.

**Example**
```c
#define FEATURE(x) ...
// Show how it would work
```

**Alternatives Considered**
Other approaches you've thought of.

**Impact**
- User benefit: High/Medium/Low
- Implementation complexity: Easy/Medium/Hard
- Performance impact: None/Minimal/Significant

**Additional Context**
Mockups, references to similar features in other tools.
```

## 🏗️ Development Setup

### Prerequisites

- **Node.js**: 22.0.0+ (for SQLite support)
- **npm**: 8.0.0+
- **VS Code**: 1.104.0+
- **Git**: Latest version
- **Basic knowledge**: TypeScript, VS Code Extension API

### Initial Setup

```bash
# Fork the repository on GitHub first

# Clone your fork
git clone https://github.com/YOUR_USERNAME/c-cpp-macrolens.git
cd c-cpp-macrolens

# Add upstream remote
git remote add upstream https://github.com/Lee20171010/c-cpp-macrolens.git

# Install dependencies
npm install

# Verify build
npm run compile

# Run tests
npm test
```

### Development Workflow

```bash
# Create feature branch
git checkout -b feature/amazing-feature

# Make changes and test
npm run watch  # Auto-rebuild on changes

# Run extension (F5 in VS Code)
# This opens Extension Development Host

# Run tests
npm test

# Check types
npm run check-types

# Lint code
npm run lint

# Commit changes
git add .
git commit -m "Add amazing feature"

# Push to your fork
git push origin feature/amazing-feature

# Open Pull Request on GitHub
```

### Debugging

1. Open project in VS Code
2. Press **F5** to launch Extension Development Host
3. Open C/C++ file in new window
4. Set breakpoints in TypeScript source
5. Interact with extension to trigger breakpoints

See [DEVELOPER.md](DEVELOPER.md) for detailed debugging instructions.

## 📁 Project Structure

```
c-cpp-macrolens/
├── src/                          # Source code
│   ├── extension.ts              # Main entry point
│   ├── configuration.ts          # Settings management
│   ├── core/                     # Core logic
│   │   ├── macroDb.ts            # Database (SQLite + in-memory)
│   │   ├── macroExpander.ts      # Expansion engine
│   │   └── macroParser.ts        # C/C++ parser
│   ├── features/                 # VS Code features
│   │   ├── diagnostics.ts        # Error detection
│   │   ├── hoverProvider.ts      # Hover tooltips
│   │   └── treeProvider.ts       # Tree view
│   └── utils/                    # Utilities
│       ├── constants.ts          # Global constants
│       └── macroUtils.ts         # Shared helpers
├── tests/                        # Test suite
│   ├── unit/                     # Unit tests
│   │   └── core/                 # Core component tests
│   ├── integration/              # Integration tests
│   ├── fixtures/                 # Test data (C files)
│   └── helpers/                  # Test utilities
├── esbuild.js                    # Build configuration
├── eslint.config.mjs             # ESLint configuration
├── tsconfig.json                 # TypeScript configuration
├── package.json                  # Extension manifest
├── README.md                     # User documentation
├── DEVELOPER.md                  # Technical documentation
├── CONTRIBUTING.md               # This file
└── CHANGELOG.md                  # Version history
```

### Key Components

| Component | Purpose | Location |
|-----------|---------|----------|
| **MacroDatabase** | Persistent storage | `src/core/macroDb.ts` |
| **MacroParser** | Extract macro definitions | `src/core/macroParser.ts` |
| **MacroExpander** | Recursive expansion | `src/core/macroExpander.ts` |
| **HoverProvider** | Tooltip UI | `src/features/hoverProvider.ts` |
| **DiagnosticsProvider** | Error detection | `src/features/diagnostics.ts` |
| **TreeProvider** | Sidebar tree view | `src/features/treeProvider.ts` |
| **Configuration** | Settings management | `src/configuration.ts` |

## 📐 Coding Standards

### TypeScript Guidelines

```typescript
// ✅ Good: Type-safe, descriptive names
interface MacroDef {
  name: string;
  definition: string;
  params?: string[];
  location: string;
  isDefine: boolean;
}

async function parseMacros(content: string, filePath: string): Promise<MacroDef[]> {
  // Implementation
}

// ❌ Bad: Implicit any, unclear names
function parse(c, f) {
  // ...
}
```

### Naming Conventions

- **Variables/Functions**: camelCase (`macroName`, `expandMacro`)
- **Classes**: PascalCase (`MacroDatabase`, `MacroExpander`)
- **Interfaces**: PascalCase (`MacroDef`, `ConfigOptions`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_DEPTH`, `DEFAULT_DELAY`)
- **Private members**: Prefix with `_` (`_database`, `_cache`)

### Code Style

- **Indentation**: 2 spaces (no tabs)
- **Line length**: 120 characters max
- **Strings**: Single quotes `'...'` (except when escaping)
- **Semicolons**: Required
- **Trailing commas**: Preferred in multi-line structures
- **Async**: Use `async/await`, avoid callbacks

### Comments

```typescript
/**
 * Expands a macro recursively with circular reference detection.
 * 
 * @param macroName - The name of the macro to expand
 * @param args - Optional arguments for function-like macros
 * @param mode - Expansion strategy ('single-macro' or 'single-layer')
 * @returns Expansion result with final text and step chain
 * @throws Error if circular reference detected
 */
async function expandMacro(
  macroName: string,
  args?: string[],
  mode: ExpansionMode = 'single-layer'
): Promise<ExpansionResult> {
  // Implementation
}

// Inline comments for complex logic
const candidates = macroNames.filter(name => {
  // Filter by first letter and length (performance optimization)
  return name[0] === targetName[0] && Math.abs(name.length - targetName.length) <= 2;
});
```

### Error Handling

```typescript
// ✅ Good: Specific error handling with recovery
try {
  await database.saveMacros(filePath, macros);
} catch (error) {
  outputChannel.appendLine(`Failed to save macros: ${error}`);
  // Fallback to in-memory storage
  await inMemoryDb.saveMacros(filePath, macros);
}

// ❌ Bad: Silent failure
try {
  await database.saveMacros(filePath, macros);
} catch (error) {
  // Ignore
}
```

### Logging

```typescript
// ✅ Good: Use Output channel
import * as vscode from 'vscode';

const outputChannel = vscode.window.createOutputChannel('MacroLens');
outputChannel.appendLine('[DEBUG] Scanning file: ' + filePath);

// ❌ Bad: Console.log (not visible to users)
console.log('Scanning file:', filePath);
```

## 🔄 Pull Request Process

### Before Submitting

- [ ] Code follows project style guidelines
- [ ] All tests pass (`npm test`)
- [ ] No ESLint warnings (`npm run lint`)
- [ ] TypeScript type checks pass (`npm run check-types`)
- [ ] Documentation updated (README, DEVELOPER, CHANGELOG)
- [ ] Commits are clean and descriptive
- [ ] No unrelated changes included
- [ ] Branch is up-to-date with `main`

### PR Checklist

```markdown
## Description
Brief description of changes.

## Type of Change
- [ ] Bug fix (non-breaking change)
- [ ] New feature (non-breaking change)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests pass locally

## Screenshots (if applicable)
Attach screenshots of UI changes.

## Related Issues
Closes #123
Addresses #456
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add support for variadic macros
fix: resolve circular reference detection bug
docs: update README with new configuration options
test: add unit tests for MacroExpander
refactor: simplify database query logic
perf: optimize debouncing strategy
chore: update dependencies
```

### Review Process

1. **Automated checks** run (CI/CD)
2. **Maintainer review** (may request changes)
3. **Address feedback** and push updates
4. **Approval and merge** by maintainer

## 🧪 Testing Guidelines

### Test Structure

```javascript
// tests/unit/core/macroParser.test.js
import { MacroParser } from '../../../src/core/macroParser.js';

describe('MacroParser', () => {
  describe('parseMacros', () => {
    it('should parse simple object-like macro', () => {
      const code = '#define PI 3.14159';
      const macros = MacroParser.parseMacros(code, 'test.c');
      
      expect(macros).toHaveLength(1);
      expect(macros[0].name).toBe('PI');
      expect(macros[0].definition).toContain('3.14159');
      expect(macros[0].params).toBeUndefined();
      expect(macros[0].isDefine).toBe(true);
    });

    it('should parse function-like macro with parameters', () => {
      const code = '#define SQUARE(x) ((x) * (x))';
      const macros = MacroParser.parseMacros(code, 'test.c');
      
      expect(macros).toHaveLength(1);
      expect(macros[0].name).toBe('SQUARE');
      expect(macros[0].params).toEqual(['x']);
      expect(macros[0].definition).toContain('((x) * (x))');
    });

    it('should handle multi-line macros', () => {
      const code = `#define MULTI \\\n  line1 \\\n  line2`;
      const macros = MacroParser.parseMacros(code, 'test.c');
      
      expect(macros).toHaveLength(1);
      expect(macros[0].definition).toContain('line1');
      expect(macros[0].definition).toContain('line2');
    });
  });
});
```

### Test Coverage

Aim for:
- **Unit tests**: 80%+ coverage of core logic
- **Integration tests**: Key user workflows
- **Edge cases**: Unusual inputs, error conditions

### Running Tests

```bash
# All tests
npm test

# Specific test file
npm test -- tests/unit/core/macroParser.test.js

# Watch mode (rerun on changes)
npm run watch-tests

# Coverage report
npm run test:coverage
```

## 📚 Documentation

### What to Document

- **Public APIs**: JSDoc comments for all exported functions/classes
- **Complex logic**: Inline comments explaining "why", not "what"
- **Configuration**: Update README for new settings
- **Features**: Add examples to README and DEVELOPER.md
- **Breaking changes**: Note in CHANGELOG.md

### Documentation Style

```typescript
/**
 * Calculates Levenshtein distance between two strings.
 * 
 * Used for suggesting similar macro names when undefined macro detected.
 * 
 * @param str1 - First string to compare
 * @param str2 - Second string to compare
 * @returns Edit distance (0 = identical, higher = more different)
 * 
 * @example
 * ```typescript
 * levenshteinDistance('kitten', 'sitting');  // Returns: 3
 * levenshteinDistance('foo', 'foo');         // Returns: 0
 * ```
 */
function levenshteinDistance(str1: string, str2: string): number {
  // Implementation
}
```

### Updating Documentation

When adding features:
1. Update `README.md` (user-facing)
2. Update `DEVELOPER.md` (technical details)
3. Add entry to `CHANGELOG.md`
4. Update JSDoc comments in code
5. Add examples in tests

## 🌐 Community Guidelines

### Code of Conduct

- **Be respectful**: Treat everyone with respect
- **Be constructive**: Provide helpful feedback
- **Be inclusive**: Welcome newcomers
- **Be patient**: Not everyone has the same experience level
- **Be collaborative**: Work together towards common goals

### Communication

- **Issues**: For bug reports and feature requests
- **Discussions**: For questions, ideas, and general conversation
- **Pull Requests**: For code contributions
- **Email**: For security issues or private matters

### Getting Help

- Check [README.md](README.md) for user documentation
- Check [DEVELOPER.md](DEVELOPER.md) for technical details
- Search existing issues and discussions
- Ask in GitHub Discussions
- Be specific and provide context

## 🎯 Contribution Ideas

### Good First Issues

- Fix typos in documentation
- Add test cases for existing features
- Improve error messages
- Add examples to README
- Enhance code comments

### Intermediate Tasks

- Implement new diagnostic rules
- Optimize parser performance
- Add configuration validation
- Improve hover content formatting
- Extend tree view features

### Advanced Tasks

- Enhance preprocessor directive support
- Implement CodeLens integration
- Add macro usage analytics
- Optimize database queries
- Integrate with clangd/cpptools

## 📞 Contact

- **Issues**: [GitHub Issues](https://github.com/Lee20171010/c-cpp-macrolens/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Lee20171010/c-cpp-macrolens/discussions)
- **Maintainer**: [@Lee20171010](https://github.com/Lee20171010)

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to C/C++ MacroLens!** 🙏✨
