"use strict";
/**
 * Unit tests for Configuration
 * Priority: P1 - Configuration management
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
const configuration_1 = require("../../../src/configuration");
suite('Configuration Tests', () => {
    let config;
    setup(() => {
        config = configuration_1.Configuration.getInstance();
    });
    suite('Singleton Pattern', () => {
        test('should return the same instance', () => {
            const config1 = configuration_1.Configuration.getInstance();
            const config2 = configuration_1.Configuration.getInstance();
            assert.strictEqual(config1, config2, 'Should return same instance');
        });
    });
    suite('Configuration Reading', () => {
        test('should read all config values', () => {
            const cfg = config.getConfig();
            assert.ok(cfg !== undefined, 'Config should not be undefined');
            assert.strictEqual(typeof cfg.showFinalNumericExpansion, 'boolean', 'showFinalNumericExpansion should be boolean');
            assert.strictEqual(typeof cfg.stripExtraParentheses, 'boolean', 'stripExtraParentheses should be boolean');
            assert.strictEqual(typeof cfg.enableTreeView, 'boolean', 'enableTreeView should be boolean');
            assert.ok(['single-macro', 'single-layer'].includes(cfg.expansionMode), 'expansionMode should be valid');
            assert.strictEqual(typeof cfg.debounceDelay, 'number', 'debounceDelay should be number');
            assert.strictEqual(typeof cfg.maxUpdateDelay, 'number', 'maxUpdateDelay should be number');
            assert.strictEqual(typeof cfg.maxExpansionDepth, 'number', 'maxExpansionDepth should be number');
        });
        test('should have sensible default values', () => {
            const cfg = config.getConfig();
            // Check defaults match package.json
            assert.strictEqual(cfg.debounceDelay, 500, 'Default debounceDelay should be 500');
            assert.strictEqual(cfg.maxUpdateDelay, 8000, 'Default maxUpdateDelay should be 8000');
            assert.strictEqual(cfg.maxExpansionDepth, 30, 'Default maxExpansionDepth should be 30');
            assert.strictEqual(cfg.stripExtraParentheses, true, 'Default stripExtraParentheses should be true');
            assert.strictEqual(cfg.enableTreeView, true, 'Default enableTreeView should be true');
        });
    });
    suite('Configuration Validation', () => {
        test('debounceDelay should be within valid range', () => {
            const cfg = config.getConfig();
            assert.ok(cfg.debounceDelay >= 100, 'debounceDelay should be >= 100');
            assert.ok(cfg.debounceDelay <= 2000, 'debounceDelay should be <= 2000');
        });
        test('maxUpdateDelay should be within valid range', () => {
            const cfg = config.getConfig();
            assert.ok(cfg.maxUpdateDelay >= 2000, 'maxUpdateDelay should be >= 2000');
            assert.ok(cfg.maxUpdateDelay <= 30000, 'maxUpdateDelay should be <= 30000');
        });
        test('maxExpansionDepth should be within valid range', () => {
            const cfg = config.getConfig();
            assert.ok(cfg.maxExpansionDepth >= 5, 'maxExpansionDepth should be >= 5');
            assert.ok(cfg.maxExpansionDepth <= 100, 'maxExpansionDepth should be <= 100');
        });
    });
    suite('Configuration Access Performance', () => {
        test('should access config quickly', () => {
            const startTime = Date.now();
            for (let i = 0; i < 1000; i++) {
                config.getConfig();
            }
            const elapsed = Date.now() - startTime;
            assert.ok(elapsed < 100, `1000 config reads should complete in < 100ms (took ${elapsed}ms)`);
        });
    });
});
//# sourceMappingURL=configuration.test.js.map