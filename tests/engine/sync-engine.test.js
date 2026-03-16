"use strict";
/**
 * Tests for sync engine module
 *
 * Covers:
 * - createTerminalAdapter factory
 * - New tab flow: ensureRunning, activateWindow, createTab, splitPane, sendCommand
 * - Tab reuse flow (idempotency): does NOT call splitPane
 * - Layout from options vs default config
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// ---------------------------------------------------------------------------
// Create mock adapter that will replace ghosttyAdapter
// ---------------------------------------------------------------------------
const mockAdapterMethods = {
    ensureRunning: vitest_1.vi.fn().mockResolvedValue(undefined),
    activateWindow: vitest_1.vi.fn().mockResolvedValue(undefined),
    listTabs: vitest_1.vi.fn().mockResolvedValue([]),
    findTabByProject: vitest_1.vi.fn().mockResolvedValue(null),
    createTab: vitest_1.vi.fn().mockResolvedValue({
        id: '1',
        title: '[WorkspaceSync] test-project',
        windowId: 'front',
    }),
    focusTab: vitest_1.vi.fn().mockResolvedValue(undefined),
    splitPane: vitest_1.vi.fn().mockResolvedValue(undefined),
    sendText: vitest_1.vi.fn().mockResolvedValue(undefined),
    sendCommand: vitest_1.vi.fn().mockResolvedValue(undefined),
    navigateToPane: vitest_1.vi.fn().mockResolvedValue(undefined),
};
const mockAdapter = {
    name: 'mock-ghostty',
    ...mockAdapterMethods,
};
// ---------------------------------------------------------------------------
// Mock external dependencies before importing sync-engine
// ---------------------------------------------------------------------------
// Ghostty adapter mock - provide our mock adapter as the singleton
vitest_1.vi.mock('@ide-tui-bridge/engine/adapters/terminal/ghostty-adapter.js', () => ({
    ghosttyAdapter: null,
}));
// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------
const sync_engine_js_1 = require("@ide-tui-bridge/engine/core/sync-engine.js");
const defaults_js_1 = require("@ide-tui-bridge/engine/config/defaults.js");
// ---------------------------------------------------------------------------
// We need to intercept the sync function's internal createTerminalAdapter call.
// Since ESM imports are hoisted, we need to monkey-patch the imported module.
// ---------------------------------------------------------------------------
const ghosttyAdapterModule = await import('@ide-tui-bridge/engine/adapters/terminal/ghostty-adapter.js');
// @ts-expect-error - we're replacing the null with a real mock
ghosttyAdapterModule.ghosttyAdapter = mockAdapter;
(0, vitest_1.beforeEach)(() => {
    vitest_1.vi.clearAllMocks();
    // Restore ghostty adapter mock after clearAllMocks resets it
    // @ts-expect-error - we're replacing the null with a real mock
    ghosttyAdapterModule.ghosttyAdapter = mockAdapter;
    // Reset all adapter methods to default behavior
    mockAdapterMethods.ensureRunning.mockResolvedValue(undefined);
    mockAdapterMethods.activateWindow.mockResolvedValue(undefined);
    mockAdapterMethods.listTabs.mockResolvedValue([]);
    mockAdapterMethods.findTabByProject.mockResolvedValue(null);
    mockAdapterMethods.createTab.mockResolvedValue({
        id: '1',
        title: '[WorkspaceSync] test-project',
        windowId: 'front',
    });
    mockAdapterMethods.focusTab.mockResolvedValue(undefined);
    mockAdapterMethods.splitPane.mockResolvedValue(undefined);
    mockAdapterMethods.sendText.mockResolvedValue(undefined);
    mockAdapterMethods.sendCommand.mockResolvedValue(undefined);
    mockAdapterMethods.navigateToPane.mockResolvedValue(undefined);
    // Use fake timers to avoid real delays in command injection
    vitest_1.vi.useFakeTimers({ shouldAdvanceTime: true });
});
(0, vitest_1.afterEach)(() => {
    vitest_1.vi.useRealTimers();
});
// ---------------------------------------------------------------------------
// createTerminalAdapter tests
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('core/sync-engine: createTerminalAdapter', () => {
    (0, vitest_1.it)('should create adapter for ghostty terminal', () => {
        (0, vitest_1.expect)(mockAdapter.name).toBe('mock-ghostty');
    });
    (0, vitest_1.it)('should throw for unsupported terminal type', () => {
        try {
            const config = { ...defaults_js_1.defaultConfig, terminal: 'alacritty' };
            switch (config.terminal) {
                case 'ghostty':
                    break;
                default:
                    throw new Error(`Unsupported terminal type: ${config.terminal}`);
            }
        }
        catch (error) {
            (0, vitest_1.expect)(error.message).toContain('Unsupported terminal type: alacritty');
        }
    });
});
// ---------------------------------------------------------------------------
// New tab flow tests
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('core/sync-engine: sync (new tab flow)', () => {
    (0, vitest_1.it)('should call ensureRunning, activateWindow, createTab, splitPane, sendCommand for new tab', async () => {
        const twoPaneLayout = {
            direction: 'vertical',
            panes: [
                { id: 'left', commands: [] },
                { id: 'right', commands: ['vim'] },
            ],
        };
        const result = await (0, sync_engine_js_1.sync)({
            projectPath: '/tmp/test-project',
            layout: twoPaneLayout,
        });
        (0, vitest_1.expect)(result.ok).toBe(true);
        if (result.ok) {
            (0, vitest_1.expect)(result.value.splitCount).toBe(1);
        }
        // Verify the full flow
        (0, vitest_1.expect)(mockAdapterMethods.ensureRunning).toHaveBeenCalledOnce();
        (0, vitest_1.expect)(mockAdapterMethods.activateWindow).toHaveBeenCalledOnce();
        (0, vitest_1.expect)(mockAdapterMethods.findTabByProject).toHaveBeenCalledWith('/tmp/test-project');
        (0, vitest_1.expect)(mockAdapterMethods.createTab).toHaveBeenCalledOnce();
        (0, vitest_1.expect)(mockAdapterMethods.splitPane).toHaveBeenCalledWith('right', {
            workingDirectory: '/tmp/test-project',
        });
        // After splits: re-set title on first pane
        (0, vitest_1.expect)(mockAdapterMethods.navigateToPane).toHaveBeenCalledWith(1);
        (0, vitest_1.expect)(mockAdapterMethods.sendCommand).toHaveBeenCalledWith(vitest_1.expect.stringContaining("\\033]0;[WorkspaceSync] test-project\\007"));
        // sendCommand also called for panes with non-empty commands
        (0, vitest_1.expect)(mockAdapterMethods.sendCommand).toHaveBeenCalledWith('vim');
    });
});
// ---------------------------------------------------------------------------
// Tab reuse (idempotency) tests
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('core/sync-engine: sync (tab reuse / idempotency)', () => {
    (0, vitest_1.it)('should NOT call splitPane when reusing an existing tab', async () => {
        const existingTab = {
            id: '2',
            title: '[WorkspaceSync] test-project',
            windowId: 'front',
        };
        mockAdapterMethods.findTabByProject.mockResolvedValue(existingTab);
        const result = await (0, sync_engine_js_1.sync)({
            projectPath: '/tmp/test-project',
            layout: {
                direction: 'none',
                panes: [{ id: 'main', commands: [] }],
            },
        });
        (0, vitest_1.expect)(result.ok).toBe(true);
        if (result.ok) {
            (0, vitest_1.expect)(result.value.splitCount).toBe(0);
            (0, vitest_1.expect)(result.value.tabResolution.isNew).toBe(false);
        }
        (0, vitest_1.expect)(mockAdapterMethods.splitPane).not.toHaveBeenCalled();
        (0, vitest_1.expect)(mockAdapterMethods.focusTab).toHaveBeenCalledWith(existingTab);
    });
});
// ---------------------------------------------------------------------------
// Default config tests
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('core/sync-engine: sync (default config)', () => {
    (0, vitest_1.it)('should use default config when no layout is provided', async () => {
        const result = await (0, sync_engine_js_1.sync)({
            projectPath: '/tmp/test-project',
        });
        (0, vitest_1.expect)(result.ok).toBe(true);
        if (result.ok) {
            (0, vitest_1.expect)(result.value.splitCount).toBe(0);
        }
        (0, vitest_1.expect)(mockAdapterMethods.ensureRunning).toHaveBeenCalled();
        (0, vitest_1.expect)(mockAdapterMethods.activateWindow).toHaveBeenCalled();
        // Title is re-set after splits (even with 0 splits, the new tab path triggers it)
        (0, vitest_1.expect)(mockAdapterMethods.navigateToPane).toHaveBeenCalledWith(1);
        (0, vitest_1.expect)(mockAdapterMethods.sendCommand).toHaveBeenCalledWith(vitest_1.expect.stringContaining("\\033]0;[WorkspaceSync] test-project\\007"));
    });
});
// ---------------------------------------------------------------------------
// Single pane layout tests
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('core/sync-engine: sync (single pane layout)', () => {
    (0, vitest_1.it)('should not split pane for single-pane layout', async () => {
        const result = await (0, sync_engine_js_1.sync)({
            projectPath: '/tmp/test-project',
            layout: {
                direction: 'none',
                panes: [{ id: 'main', commands: [] }],
            },
        });
        (0, vitest_1.expect)(result.ok).toBe(true);
        if (result.ok) {
            (0, vitest_1.expect)(result.value.splitCount).toBe(0);
        }
        (0, vitest_1.expect)(mockAdapterMethods.splitPane).not.toHaveBeenCalled();
    });
});
// ---------------------------------------------------------------------------
// Three-pane layout tests
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('core/sync-engine: sync (three-pane layout)', () => {
    (0, vitest_1.it)('should split pane twice for three-pane layout', async () => {
        const threePaneLayout = {
            direction: 'horizontal',
            panes: [
                { id: 'top', commands: [] },
                {
                    direction: 'vertical',
                    panes: [
                        { id: 'bottom_left', commands: [] },
                        { id: 'bottom_right', commands: [] },
                    ],
                },
            ],
        };
        const result = await (0, sync_engine_js_1.sync)({
            projectPath: '/tmp/test-project',
            layout: threePaneLayout,
        });
        (0, vitest_1.expect)(result.ok).toBe(true);
        if (result.ok) {
            (0, vitest_1.expect)(result.value.splitCount).toBe(2);
        }
        (0, vitest_1.expect)(mockAdapterMethods.splitPane).toHaveBeenCalledTimes(2);
        (0, vitest_1.expect)(mockAdapterMethods.splitPane).toHaveBeenNthCalledWith(1, 'down', {
            workingDirectory: '/tmp/test-project',
        });
        (0, vitest_1.expect)(mockAdapterMethods.splitPane).toHaveBeenNthCalledWith(2, 'right', {
            workingDirectory: '/tmp/test-project',
        });
        // Title re-set after splits
        (0, vitest_1.expect)(mockAdapterMethods.navigateToPane).toHaveBeenCalledWith(1);
        (0, vitest_1.expect)(mockAdapterMethods.sendCommand).toHaveBeenCalledWith(vitest_1.expect.stringContaining("\\033]0;[WorkspaceSync] test-project\\007"));
    });
});
// ---------------------------------------------------------------------------
// Multiple commands per pane tests
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('core/sync-engine: sync (multiple commands per pane)', () => {
    (0, vitest_1.it)('should execute multiple commands in order with delay', async () => {
        const multiCmdLayout = {
            direction: 'none',
            panes: [{
                    id: 'dev',
                    commands: ['cd /some/path', 'npm install', 'npm run dev'],
                }],
        };
        const result = await (0, sync_engine_js_1.sync)({
            projectPath: '/tmp/test-project',
            layout: multiCmdLayout,
        });
        (0, vitest_1.expect)(result.ok).toBe(true);
        // First sendCommand is the OSC 0 title re-set
        (0, vitest_1.expect)(mockAdapterMethods.sendCommand).toHaveBeenCalledTimes(4);
        (0, vitest_1.expect)(mockAdapterMethods.sendCommand).toHaveBeenNthCalledWith(1, vitest_1.expect.stringContaining("\\033]0;[WorkspaceSync] test-project\\007"));
        (0, vitest_1.expect)(mockAdapterMethods.sendCommand).toHaveBeenNthCalledWith(2, 'cd /some/path');
        (0, vitest_1.expect)(mockAdapterMethods.sendCommand).toHaveBeenNthCalledWith(3, 'npm install');
        (0, vitest_1.expect)(mockAdapterMethods.sendCommand).toHaveBeenNthCalledWith(4, 'npm run dev');
    });
});
//# sourceMappingURL=sync-engine.test.js.map