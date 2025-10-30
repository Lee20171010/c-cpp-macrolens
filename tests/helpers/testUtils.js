"use strict";
/**
 * Test utilities and fixtures for unit and integration tests
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestFixtures = void 0;
class TestFixtures {
    /**
     * Create sample macro definitions for testing
     */
    static createTestMacros() {
        return [
            {
                name: 'PI',
                body: '3.14159',
                file: 'test.h',
                line: 1,
                isDefine: true
            },
            {
                name: 'SQUARE',
                params: ['x'],
                body: '((x) * (x))',
                file: 'test.h',
                line: 2,
                isDefine: true
            },
            {
                name: 'MAX',
                params: ['a', 'b'],
                body: '((a) > (b) ? (a) : (b))',
                file: 'test.h',
                line: 3,
                isDefine: true
            },
            {
                name: 'VARIADIC',
                params: ['first', '...'],
                body: 'printf(first, __VA_ARGS__)',
                file: 'test.h',
                line: 4,
                isDefine: true
            },
            {
                name: 'uint32_t',
                body: 'unsigned int',
                file: 'test.h',
                line: 5,
                isDefine: false // typedef
            }
        ];
    }
    /**
     * Create a mock VSCode URI
     */
    static createMockUri(fsPath) {
        return {
            fsPath,
            scheme: 'file',
            authority: '',
            path: fsPath,
            query: '',
            fragment: '',
            with: function () { return this; },
            toString: function () { return this.fsPath; },
            toJSON: function () { return { fsPath: this.fsPath }; }
        };
    }
    /**
     * Create a mock text document
     */
    static createMockDocument(content, languageId = 'c') {
        const lines = content.split('\n');
        return {
            uri: TestFixtures.createMockUri('/test/file.c'),
            fileName: '/test/file.c',
            languageId,
            version: 1,
            lineCount: lines.length,
            getText: () => content,
            lineAt: (line) => ({
                text: lines[line] || '',
                lineNumber: line,
                range: {
                    start: { line, character: 0 },
                    end: { line, character: lines[line]?.length || 0 }
                }
            }),
            positionAt: (offset) => {
                let line = 0;
                let char = 0;
                let currentOffset = 0;
                for (let i = 0; i < lines.length; i++) {
                    if (currentOffset + lines[i].length >= offset) {
                        line = i;
                        char = offset - currentOffset;
                        break;
                    }
                    currentOffset += lines[i].length + 1;
                }
                return { line, character: char };
            },
            getWordRangeAtPosition: (position) => {
                const line = lines[position.line];
                if (!line)
                    return undefined;
                const char = position.character;
                let start = char;
                let end = char;
                while (start > 0 && /[A-Za-z0-9_]/.test(line[start - 1])) {
                    start--;
                }
                while (end < line.length && /[A-Za-z0-9_]/.test(line[end])) {
                    end++;
                }
                if (start === end)
                    return undefined;
                return {
                    start: { line: position.line, character: start },
                    end: { line: position.line, character: end }
                };
            }
        };
    }
    /**
     * Wait for a condition with timeout
     */
    static async waitFor(condition, timeout = 5000, interval = 100) {
        const startTime = Date.now();
        while (!condition()) {
            if (Date.now() - startTime > timeout) {
                throw new Error('Timeout waiting for condition');
            }
            await new Promise(resolve => setTimeout(resolve, interval));
        }
    }
}
exports.TestFixtures = TestFixtures;
//# sourceMappingURL=testUtils.js.map