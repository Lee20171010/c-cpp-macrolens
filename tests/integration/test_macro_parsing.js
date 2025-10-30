const { MacroParser } = require('./dist/extension.js');

const testContent = `
#define v(...) (0v, __VA_ARGS__)
#define v(...) (1v, __VA_ARGS__)
`;

console.log('Testing macro parsing...');
try {
    const macros = MacroParser.parseMacros(testContent, 'test.c');
    console.log('Parsed macros:', JSON.stringify(macros, null, 2));
} catch (error) {
    console.error('Error:', error);
}
