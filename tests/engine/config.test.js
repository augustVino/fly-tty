"use strict";
/**
 * Tests for configuration module
 *
 * Covers:
 * - Zod schema validation (valid & invalid configs)
 * - Default values
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const schema_js_1 = require("@ide-tui-bridge/engine/config/schema.js");
const defaults_js_1 = require("@ide-tui-bridge/engine/config/defaults.js");
// ---------------------------------------------------------------------------
// Schema validation tests
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('config/schema', () => {
    (0, vitest_1.describe)('valid configurations', () => {
        (0, vitest_1.it)('should validate a valid three-pane layout', () => {
            const input = {
                version: '1.0',
                terminal: 'ghostty',
                layout: {
                    direction: 'horizontal',
                    panes: [
                        { id: 'top', commands: ['command'] },
                        {
                            direction: 'vertical',
                            panes: [
                                { id: 'bottom-left', commands: ['npm run dev'] },
                                { id: 'bottom-right', commands: [] },
                            ],
                        },
                    ],
                },
            };
            const result = schema_js_1.ProjectConfigSchema.parse(input);
            (0, vitest_1.expect)(result.terminal).toBe('ghostty');
            (0, vitest_1.expect)(result.layout).toMatchObject({
                direction: 'horizontal',
            });
        });
        (0, vitest_1.it)('should validate a valid two-pane horizontal split config', () => {
            const input = {
                version: '1.0',
                terminal: 'ghostty',
                layout: {
                    direction: 'horizontal',
                    panes: [
                        { id: 'top', commands: ['command'] },
                        { id: 'bottom', commands: ['npm run dev'] },
                    ],
                },
            };
            const result = schema_js_1.ProjectConfigSchema.parse(input);
            (0, vitest_1.expect)(result.terminal).toBe('ghostty');
            (0, vitest_1.expect)(result.layout).toMatchObject({ direction: 'horizontal' });
        });
        (0, vitest_1.it)('should validate a valid two-pane vertical split config', () => {
            const input = {
                version: '1.0',
                terminal: 'ghostty',
                layout: {
                    direction: 'vertical',
                    panes: [
                        { id: 'left', commands: ['npm run dev'] },
                        { id: 'right', commands: [] },
                    ],
                },
            };
            const result = schema_js_1.ProjectConfigSchema.parse(input);
            (0, vitest_1.expect)(result.layout).toMatchObject({ direction: 'vertical' });
        });
        (0, vitest_1.it)('should validate a valid single-pane layout (direction: none)', () => {
            const input = {
                layout: {
                    direction: 'none',
                    panes: [{ id: 'main', commands: ['npm run dev'] }],
                },
            };
            const result = schema_js_1.ProjectConfigSchema.parse(input);
            (0, vitest_1.expect)(result).toBeDefined();
        });
        (0, vitest_1.it)('should validate a single pane without direction (treated as leaf)', () => {
            const input = {
                layout: {
                    id: 'main',
                    commands: ['npm run dev'],
                },
            };
            const result = schema_js_1.ProjectConfigSchema.parse(input);
            (0, vitest_1.expect)(result).toBeDefined();
        });
        (0, vitest_1.it)('should parse optional pane fields with defaults', () => {
            const input = {
                layout: {
                    direction: 'none',
                    panes: [{ id: 'test' }],
                },
            };
            const result = schema_js_1.ProjectConfigSchema.parse(input);
            if ('panes' in result.layout) {
                const pane = result.layout.panes[0];
                (0, vitest_1.expect)(pane.auto_focus).toBe(false);
                (0, vitest_1.expect)(pane.commands).toEqual([]);
            }
        });
        (0, vitest_1.it)('should accept panes with explicit optional fields', () => {
            const input = {
                layout: {
                    direction: 'vertical',
                    panes: [
                        { id: 'a', auto_focus: true, commands: ['vim'], cwd: '/tmp' },
                        { id: 'b' },
                    ],
                },
            };
            const result = schema_js_1.ProjectConfigSchema.parse(input);
            (0, vitest_1.expect)(result).toBeDefined();
        });
        (0, vitest_1.it)('should accept multiple commands in a pane', () => {
            const input = {
                layout: {
                    direction: 'none',
                    panes: [{
                            id: 'dev',
                            commands: ['cd /some/path', 'npm install', 'npm run dev'],
                        }],
                },
            };
            const result = schema_js_1.ProjectConfigSchema.parse(input);
            (0, vitest_1.expect)(result).toBeDefined();
            if ('panes' in result.layout) {
                const pane = result.layout.panes[0];
                (0, vitest_1.expect)(pane.commands).toHaveLength(3);
            }
        });
    });
    (0, vitest_1.describe)('invalid configurations', () => {
        (0, vitest_1.it)('should reject config without layout', () => {
            const input = { version: '1.0' };
            (0, vitest_1.expect)(() => schema_js_1.ProjectConfigSchema.parse(input)).toThrow();
        });
        (0, vitest_1.it)('should reject invalid direction', () => {
            const input = {
                layout: {
                    direction: 'diagonal',
                    panes: [{ id: 'a' }, { id: 'b' }],
                },
            };
            (0, vitest_1.expect)(() => schema_js_1.ProjectConfigSchema.parse(input)).toThrow();
        });
        (0, vitest_1.it)('should reject empty panes array', () => {
            const input = {
                layout: {
                    direction: 'vertical',
                    panes: [],
                },
            };
            (0, vitest_1.expect)(() => schema_js_1.ProjectConfigSchema.parse(input)).toThrow();
        });
        (0, vitest_1.it)('should reject horizontal split with only 1 pane', () => {
            const input = {
                layout: {
                    direction: 'horizontal',
                    panes: [{ id: 'only' }],
                },
            };
            (0, vitest_1.expect)(() => schema_js_1.ProjectConfigSchema.parse(input)).toThrow();
        });
        (0, vitest_1.it)('should reject vertical split with only 1 pane', () => {
            const input = {
                layout: {
                    direction: 'vertical',
                    panes: [{ id: 'only' }],
                },
            };
            (0, vitest_1.expect)(() => schema_js_1.ProjectConfigSchema.parse(input)).toThrow();
        });
        (0, vitest_1.it)('should reject invalid terminal type', () => {
            const input = {
                terminal: 'alacritty',
                layout: {
                    direction: 'none',
                    panes: [{ id: 'main' }],
                },
            };
            (0, vitest_1.expect)(() => schema_js_1.ProjectConfigSchema.parse(input)).toThrow();
        });
        (0, vitest_1.it)('should reject pane without id', () => {
            const input = {
                layout: {
                    direction: 'vertical',
                    panes: [{ name: 'no-id' }, { id: 'has-id' }],
                },
            };
            (0, vitest_1.expect)(() => schema_js_1.ProjectConfigSchema.parse(input)).toThrow();
        });
    });
    (0, vitest_1.describe)('default values', () => {
        (0, vitest_1.it)('should default version to "1.0"', () => {
            const input = {
                layout: {
                    direction: 'none',
                    panes: [{ id: 'main' }],
                },
            };
            const result = schema_js_1.ProjectConfigSchema.parse(input);
            (0, vitest_1.expect)(result.version).toBe('1.0');
        });
        (0, vitest_1.it)('should default terminal to "ghostty"', () => {
            const input = {
                layout: {
                    direction: 'none',
                    panes: [{ id: 'main' }],
                },
            };
            const result = schema_js_1.ProjectConfigSchema.parse(input);
            (0, vitest_1.expect)(result.terminal).toBe('ghostty');
        });
        (0, vitest_1.it)('should default auto_focus to false', () => {
            const input = {
                layout: {
                    id: 'main',
                },
            };
            const result = schema_js_1.ProjectConfigSchema.parse(input);
            (0, vitest_1.expect)(result.layout.auto_focus).toBe(false);
        });
        (0, vitest_1.it)('should default commands to empty array', () => {
            const input = {
                layout: {
                    id: 'main',
                },
            };
            const result = schema_js_1.ProjectConfigSchema.parse(input);
            (0, vitest_1.expect)(result.layout.commands).toEqual([]);
        });
    });
});
// ---------------------------------------------------------------------------
// Defaults tests
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('config/defaults', () => {
    (0, vitest_1.it)('should provide a valid default config', () => {
        (0, vitest_1.expect)(defaults_js_1.defaultConfig).toBeDefined();
        (0, vitest_1.expect)(defaults_js_1.defaultConfig.version).toBe('1.0');
        (0, vitest_1.expect)(defaults_js_1.defaultConfig.terminal).toBe('ghostty');
        (0, vitest_1.expect)(defaults_js_1.defaultConfig.layout).toBeDefined();
    });
    (0, vitest_1.it)('default layout should be a single pane', () => {
        const layout = defaults_js_1.defaultConfig.layout;
        (0, vitest_1.expect)(layout.direction).toBe('none');
        (0, vitest_1.expect)(layout.panes).toHaveLength(1);
    });
});
//# sourceMappingURL=config.test.js.map