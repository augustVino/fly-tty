"use strict";
/**
 * Vitest configuration for IDE-TUI Bridge
 */
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
const node_path_1 = require("node:path");
exports.default = (0, config_1.defineConfig)({
    resolve: {
        alias: {
            '@ide-tui-bridge/engine': (0, node_path_1.resolve)(__dirname, 'packages/engine/src'),
        },
    },
    test: {
        include: ['tests/**/*.test.ts'],
        globals: false,
        environment: 'node',
        coverage: {
            include: [
                'packages/engine/src/**/*.ts',
                '!packages/engine/src/**/index.ts',
                '!packages/engine/src/types/**/*.ts',
                '!packages/engine/src/adapters/ide/**/*.ts',
                '!packages/engine/src/adapters/terminal/ghostty-applescript.ts',
            ],
        },
    },
});
//# sourceMappingURL=vitest.config.js.map