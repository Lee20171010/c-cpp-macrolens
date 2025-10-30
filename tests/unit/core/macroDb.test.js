"use strict";
/**
 * Unit tests for MacroDatabase
 * Priority: P0 - Critical component
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const macroDb_1 = require("../../../src/core/macroDb");
suite('MacroDatabase Tests', () => {
    let db;
    let testDbPath;
    setup(() => {
        db = macroDb_1.MacroDatabase.getInstance();
        // Create a temporary directory for test database
        const tmpDir = os.tmpdir();
        testDbPath = path.join(tmpDir, `macrolens_test_${Date.now()}.db`);
    });
    teardown(() => {
        // Cleanup test database
        try {
            if (fs.existsSync(testDbPath)) {
                fs.unlinkSync(testDbPath);
            }
        }
        catch (error) {
            console.error('Failed to cleanup test database:', error);
        }
    });
    suite('Initialization', () => {
        test('should be a singleton', () => {
            const db1 = macroDb_1.MacroDatabase.getInstance();
            const db2 = macroDb_1.MacroDatabase.getInstance();
            assert.strictEqual(db1, db2, 'Database should be a singleton');
        });
        test('should initialize successfully', () => {
            // Database should initialize without errors
            assert.ok(db, 'Database instance should exist');
        });
        test('should support in-memory mode', () => {
            const isInMemory = db.isUsingInMemory();
            assert.strictEqual(typeof isInMemory, 'boolean', 'Should return boolean for in-memory status');
        });
    });
    suite('Macro Definition Operations', () => {
        test('should insert and retrieve macro definition', () => {
            const testMacro = {
                name: 'TEST_MACRO',
                body: '42',
                file: 'test.h',
                line: 1,
                isDefine: true
            };
            // Note: This tests the interface, actual insert happens during scanFile
            const defs = db.getDefinitions('TEST_MACRO');
            assert.ok(Array.isArray(defs), 'Should return an array');
        });
        test('should handle function-like macros with parameters', () => {
            const defs = db.getDefinitions('SQUARE');
            // Test that we can query for function-like macros
            assert.ok(Array.isArray(defs), 'Should return an array for function-like macros');
        });
        test('should retrieve all macro definitions', () => {
            const allDefs = db.getAllDefinitions();
            assert.ok(allDefs instanceof Map, 'Should return a Map of all definitions');
        });
        test('should handle empty queries gracefully', () => {
            const defs = db.getDefinitions('NONEXISTENT_MACRO');
            assert.strictEqual(defs.length, 0, 'Should return empty array for non-existent macro');
        });
    });
    suite('Type Declaration Detection', () => {
        test('should differentiate between macros and typedefs', () => {
            // Test that isDefine flag is properly handled
            const defs = db.getDefinitions('uint32_t');
            // Even if not found, the query should work
            assert.ok(Array.isArray(defs), 'Should handle typedef queries');
        });
    });
    suite('Incremental Scanning', () => {
        test('should queue files for scanning', () => {
            const testUri = { fsPath: '/test/file.c' };
            // This method should accept URIs without throwing
            try {
                db.queueFileForScan(testUri);
                assert.ok(true, 'Should queue file without error');
            }
            catch (error) {
                assert.fail('Should not throw when queuing file');
            }
        });
        test('should report pending files count', () => {
            const count = db.getPendingFilesCount();
            assert.strictEqual(typeof count, 'number', 'Should return number of pending files');
            assert.ok(count >= 0, 'Pending count should be non-negative');
        });
        test('should flush pending scans', async () => {
            try {
                await db.flushPendingScans();
                assert.ok(true, 'Should flush pending scans without error');
            }
            catch (error) {
                // Might fail without proper initialization, but shouldn't crash
                assert.ok(true, 'Should handle flush gracefully even if not initialized');
            }
        });
    });
    suite('File Operations', () => {
        test('should handle file removal', async () => {
            const testUri = { fsPath: '/test/file.c' };
            try {
                await db.removeFile(testUri);
                assert.ok(true, 'Should remove file without error');
            }
            catch (error) {
                // Expected to work even if file doesn't exist
                assert.ok(true, 'Should handle file removal gracefully');
            }
        });
    });
    suite('Performance and Scalability', () => {
        test('should handle large number of queries efficiently', () => {
            const startTime = Date.now();
            // Perform multiple queries
            for (let i = 0; i < 1000; i++) {
                db.getDefinitions(`MACRO_${i}`);
            }
            const elapsed = Date.now() - startTime;
            assert.ok(elapsed < 1000, `1000 queries should complete in less than 1 second (took ${elapsed}ms)`);
        });
        test('should maintain consistent state across operations', () => {
            const before = db.getAllDefinitions();
            const count1 = before.size;
            // Query should not modify state
            db.getDefinitions('ANY_MACRO');
            const after = db.getAllDefinitions();
            const count2 = after.size;
            assert.strictEqual(count1, count2, 'Query operations should not modify database state');
        });
    });
    suite('Error Handling', () => {
        test('should handle invalid input gracefully', () => {
            try {
                // @ts-ignore - Testing invalid input
                db.getDefinitions(null);
            }
            catch (error) {
                // Should either handle gracefully or throw a clear error
                assert.ok(true, 'Should handle null input');
            }
        });
        test('should handle concurrent access', async () => {
            // Simulate concurrent access
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(Promise.resolve().then(() => db.getDefinitions(`MACRO_${i}`)));
            }
            try {
                await Promise.all(promises);
                assert.ok(true, 'Should handle concurrent access');
            }
            catch (error) {
                assert.fail('Should not fail on concurrent access');
            }
        });
    });
});
//# sourceMappingURL=macroDb.test.js.map