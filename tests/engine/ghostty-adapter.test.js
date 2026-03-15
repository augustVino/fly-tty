"use strict";
/**
 * Tests for Ghostty terminal adapter
 *
 * Covers:
 * - ensureRunning: Ghostty not running -> starts it; already running -> no-op
 * - findTabByProject: matches [WorkspaceSync] prefix; no match -> null
 * - splitPane: correct AppleScript call via perform action
 * - navigateToPane: uses terminal UUID focus
 * - sendCommand: adds newline
 * - Other adapter methods: activateWindow, etc.
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
const vitest_1 = require("vitest");
// ---------------------------------------------------------------------------
// Mock execa before importing the adapter
// ---------------------------------------------------------------------------
vitest_1.vi.mock('execa', () => ({
    execa: vitest_1.vi.fn(),
}));
vitest_1.vi.mock('@ide-tui-bridge/engine/adapters/terminal/ghostty-applescript.js', () => ({
    activateGhostty: vitest_1.vi.fn().mockResolvedValue(''),
    newWindow: vitest_1.vi.fn().mockResolvedValue(''),
    newTab: vitest_1.vi.fn().mockResolvedValue(''),
    splitPane: vitest_1.vi.fn().mockResolvedValue(''),
    inputText: vitest_1.vi.fn().mockResolvedValue(''),
    sendKey: vitest_1.vi.fn().mockResolvedValue(''),
    selectTab: vitest_1.vi.fn().mockResolvedValue(''),
    getTabTitles: vitest_1.vi.fn().mockResolvedValue([]),
    getTerminalIds: vitest_1.vi.fn().mockResolvedValue([]),
    focusTerminalById: vitest_1.vi.fn().mockResolvedValue(''),
    gotoNextSplit: vitest_1.vi.fn().mockResolvedValue(''),
    gotoPreviousSplit: vitest_1.vi.fn().mockResolvedValue(''),
}));
const execa_1 = require("execa");
const ghostty_adapter_js_1 = require("@ide-tui-bridge/engine/adapters/terminal/ghostty-adapter.js");
const ghosttyScript = __importStar(require("@ide-tui-bridge/engine/adapters/terminal/ghostty-applescript.js"));
const mockExeca = vitest_1.vi.mocked(execa_1.execa);
function createAdapter() {
    return new ghostty_adapter_js_1.GhosttyAdapter();
}
(0, vitest_1.beforeEach)(() => {
    vitest_1.vi.clearAllMocks();
    vitest_1.vi.useFakeTimers({ shouldAdvanceTime: true });
});
// ---------------------------------------------------------------------------
// Adapter name
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('GhosttyAdapter: name', () => {
    (0, vitest_1.it)('should return "ghostty"', () => {
        const adapter = createAdapter();
        (0, vitest_1.expect)(adapter.name).toBe('ghostty');
    });
});
// ---------------------------------------------------------------------------
// ensureRunning
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('GhosttyAdapter: ensureRunning', () => {
    (0, vitest_1.it)('should not start Ghostty if already running', async () => {
        mockExeca.mockResolvedValueOnce({
            stdout: '12345',
            stderr: '',
            exitCode: 0,
        });
        const adapter = createAdapter();
        await adapter.ensureRunning();
        (0, vitest_1.expect)(mockExeca).toHaveBeenCalledWith('pgrep', ['-x', 'Ghostty']);
        (0, vitest_1.expect)(mockExeca).not.toHaveBeenCalledWith('open', vitest_1.expect.anything());
    });
    (0, vitest_1.it)('should start Ghostty if not running', async () => {
        // pgrep fails -> not running
        mockExeca.mockRejectedValueOnce(new Error('not found'));
        // open -a Ghostty
        mockExeca.mockResolvedValueOnce({
            stdout: '',
            stderr: '',
            exitCode: 0,
        });
        // waitForWindow: 1 window
        mockExeca.mockResolvedValueOnce({
            stdout: '1',
            stderr: '',
            exitCode: 0,
        });
        const adapter = createAdapter();
        await adapter.ensureRunning();
        (0, vitest_1.expect)(mockExeca).toHaveBeenCalledWith('pgrep', ['-x', 'Ghostty']);
        (0, vitest_1.expect)(mockExeca).toHaveBeenCalledWith('open', ['-a', 'Ghostty']);
        (0, vitest_1.expect)(mockExeca).toHaveBeenCalledWith('osascript', vitest_1.expect.arrayContaining([
            '-e',
            vitest_1.expect.stringContaining('count windows of process "Ghostty"'),
        ]));
    });
    (0, vitest_1.it)('should poll for window after starting Ghostty', async () => {
        // pgrep fails -> not running
        mockExeca.mockRejectedValueOnce(new Error('not found'));
        // open -a Ghostty
        mockExeca.mockResolvedValueOnce({
            stdout: '',
            stderr: '',
            exitCode: 0,
        });
        // First poll: 0 windows
        mockExeca.mockResolvedValueOnce({
            stdout: '0',
            stderr: '',
            exitCode: 0,
        });
        // Second poll: 1 window
        mockExeca.mockResolvedValueOnce({
            stdout: '1',
            stderr: '',
            exitCode: 0,
        });
        const adapter = createAdapter();
        const promise = adapter.ensureRunning();
        // Advance past the 500ms wait between polls
        await vitest_1.vi.advanceTimersByTimeAsync(500);
        await promise;
    });
});
// ---------------------------------------------------------------------------
// activateWindow
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('GhosttyAdapter: activateWindow', () => {
    (0, vitest_1.it)('should call activateGhostty', async () => {
        const adapter = createAdapter();
        await adapter.activateWindow();
        (0, vitest_1.expect)(ghosttyScript.activateGhostty).toHaveBeenCalledOnce();
    });
});
// ---------------------------------------------------------------------------
// listTabs
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('GhosttyAdapter: listTabs', () => {
    (0, vitest_1.it)('should return empty array when no tabs exist', async () => {
        vitest_1.vi.mocked(ghosttyScript.getTabTitles).mockResolvedValueOnce([]);
        const adapter = createAdapter();
        const tabs = await adapter.listTabs();
        (0, vitest_1.expect)(tabs).toEqual([]);
    });
    (0, vitest_1.it)('should map tab titles to TerminalTab objects', async () => {
        vitest_1.vi.mocked(ghosttyScript.getTabTitles).mockResolvedValueOnce([
            '[WorkspaceSync] my-project',
            'Untitled',
        ]);
        const adapter = createAdapter();
        const tabs = await adapter.listTabs();
        (0, vitest_1.expect)(tabs).toHaveLength(2);
        (0, vitest_1.expect)(tabs[0]).toEqual({
            id: '1',
            title: '[WorkspaceSync] my-project',
            windowId: 'front',
        });
        (0, vitest_1.expect)(tabs[1]).toEqual({
            id: '2',
            title: 'Untitled',
            windowId: 'front',
        });
    });
});
// ---------------------------------------------------------------------------
// findTabByProject
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('GhosttyAdapter: findTabByProject', () => {
    (0, vitest_1.it)('should find tab matching [WorkspaceSync] prefix with directory name', async () => {
        vitest_1.vi.mocked(ghosttyScript.getTabTitles).mockResolvedValueOnce([
            'Default',
            '[WorkspaceSync] my-project',
            'Another',
        ]);
        const adapter = createAdapter();
        const tab = await adapter.findTabByProject('/Users/dev/my-project');
        (0, vitest_1.expect)(tab).not.toBeNull();
        (0, vitest_1.expect)(tab?.title).toBe('[WorkspaceSync] my-project');
        (0, vitest_1.expect)(tab?.id).toBe('2');
    });
    (0, vitest_1.it)('should return null when no matching tab exists', async () => {
        vitest_1.vi.mocked(ghosttyScript.getTabTitles).mockResolvedValueOnce([
            'Default',
            'Another',
        ]);
        const adapter = createAdapter();
        const tab = await adapter.findTabByProject('/Users/dev/my-project');
        (0, vitest_1.expect)(tab).toBeNull();
    });
    (0, vitest_1.it)('should extract project directory name from path correctly', async () => {
        vitest_1.vi.mocked(ghosttyScript.getTabTitles).mockResolvedValueOnce([
            '[WorkspaceSync] nested-dir-project',
        ]);
        const adapter = createAdapter();
        const tab = await adapter.findTabByProject('/Users/dev/nested-dir-project');
        (0, vitest_1.expect)(tab).not.toBeNull();
        (0, vitest_1.expect)(tab?.title).toBe('[WorkspaceSync] nested-dir-project');
    });
    (0, vitest_1.it)('should handle trailing slash in project path', async () => {
        vitest_1.vi.mocked(ghosttyScript.getTabTitles).mockResolvedValueOnce([
            '[WorkspaceSync] my-project',
        ]);
        const adapter = createAdapter();
        const tab = await adapter.findTabByProject('/Users/dev/my-project/');
        (0, vitest_1.expect)(tab).not.toBeNull();
        (0, vitest_1.expect)(tab?.title).toBe('[WorkspaceSync] my-project');
    });
    (0, vitest_1.it)('should not match partial directory names', async () => {
        vitest_1.vi.mocked(ghosttyScript.getTabTitles).mockResolvedValueOnce([
            '[WorkspaceSync] project',
            '[WorkspaceSync] project-backup',
        ]);
        const adapter = createAdapter();
        const tab = await adapter.findTabByProject('/Users/dev/project');
        (0, vitest_1.expect)(tab).not.toBeNull();
        (0, vitest_1.expect)(tab?.id).toBe('1');
    });
});
// ---------------------------------------------------------------------------
// createTab
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('GhosttyAdapter: createTab', () => {
    (0, vitest_1.it)('should create a new tab and return the last one', async () => {
        vitest_1.vi.mocked(ghosttyScript.newTab).mockResolvedValueOnce('');
        vitest_1.vi.mocked(ghosttyScript.getTerminalIds).mockResolvedValueOnce([
            'uuid-1',
            'uuid-2',
        ]);
        vitest_1.vi.mocked(ghosttyScript.getTabTitles).mockResolvedValueOnce([
            'First tab',
            'New tab',
        ]);
        const adapter = createAdapter();
        const tab = await adapter.createTab();
        (0, vitest_1.expect)(tab).toEqual({ id: '2', title: 'New tab', windowId: 'front' });
        (0, vitest_1.expect)(ghosttyScript.newTab).toHaveBeenCalledOnce();
        (0, vitest_1.expect)(ghosttyScript.getTerminalIds).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)('should create tab with custom title', async () => {
        vitest_1.vi.mocked(ghosttyScript.newTab).mockResolvedValueOnce('');
        vitest_1.vi.mocked(ghosttyScript.getTerminalIds).mockResolvedValueOnce(['uuid-1']);
        vitest_1.vi.mocked(ghosttyScript.getTabTitles).mockResolvedValueOnce([
            'First tab',
            'New tab',
        ]);
        const adapter = createAdapter();
        const tab = await adapter.createTab({
            title: '[WorkspaceSync] my-project',
        });
        (0, vitest_1.expect)(tab).toEqual({
            id: '2',
            title: '[WorkspaceSync] my-project',
            windowId: 'front',
        });
    });
    (0, vitest_1.it)('should create tab with working directory', async () => {
        vitest_1.vi.mocked(ghosttyScript.newTab).mockResolvedValueOnce('');
        vitest_1.vi.mocked(ghosttyScript.getTerminalIds).mockResolvedValueOnce(['uuid-1']);
        vitest_1.vi.mocked(ghosttyScript.getTabTitles).mockResolvedValueOnce([
            'First tab',
            'New tab',
        ]);
        const adapter = createAdapter();
        await adapter.createTab({
            title: '[WorkspaceSync] test-project',
            workingDirectory: '/Users/dev/test-project',
        });
        (0, vitest_1.expect)(ghosttyScript.newTab).toHaveBeenCalledWith('/Users/dev/test-project');
    });
    (0, vitest_1.it)('should throw error when no tabs after creation', async () => {
        vitest_1.vi.mocked(ghosttyScript.newTab).mockResolvedValueOnce('');
        vitest_1.vi.mocked(ghosttyScript.getTerminalIds).mockResolvedValueOnce(['uuid-1']);
        vitest_1.vi.mocked(ghosttyScript.getTabTitles).mockResolvedValueOnce([]);
        const adapter = createAdapter();
        await (0, vitest_1.expect)(adapter.createTab()).rejects.toThrow('Failed to create tab');
    });
});
// ---------------------------------------------------------------------------
// focusTab
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('GhosttyAdapter: focusTab', () => {
    (0, vitest_1.it)('should select tab by numeric index and refresh pane IDs', async () => {
        vitest_1.vi.mocked(ghosttyScript.getTerminalIds).mockResolvedValueOnce([
            'uuid-1',
            'uuid-2',
        ]);
        const adapter = createAdapter();
        await adapter.focusTab({ id: '2', title: 'Test' });
        (0, vitest_1.expect)(ghosttyScript.selectTab).toHaveBeenCalledWith(2);
        (0, vitest_1.expect)(ghosttyScript.getTerminalIds).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)('should throw error for non-numeric tab id', async () => {
        const adapter = createAdapter();
        await (0, vitest_1.expect)(adapter.focusTab({ id: 'invalid', title: 'Test' })).rejects.toThrow('Invalid tab id');
    });
    (0, vitest_1.it)('should throw error for zero tab index', async () => {
        const adapter = createAdapter();
        await (0, vitest_1.expect)(adapter.focusTab({ id: '0', title: 'Test' })).rejects.toThrow('Invalid tab id');
    });
});
// ---------------------------------------------------------------------------
// splitPane
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('GhosttyAdapter: splitPane', () => {
    (0, vitest_1.it)('should call ghosttyScript.splitPane with "right" and refresh pane IDs', async () => {
        vitest_1.vi.mocked(ghosttyScript.getTerminalIds).mockResolvedValueOnce([
            'uuid-1',
            'uuid-2',
        ]);
        const adapter = createAdapter();
        await adapter.splitPane('right');
        (0, vitest_1.expect)(ghosttyScript.splitPane).toHaveBeenCalledWith('right', undefined);
        (0, vitest_1.expect)(ghosttyScript.getTerminalIds).toHaveBeenCalledTimes(1);
    });
    (0, vitest_1.it)('should call ghosttyScript.splitPane with "down" and refresh pane IDs', async () => {
        vitest_1.vi.mocked(ghosttyScript.getTerminalIds).mockResolvedValueOnce([
            'uuid-1',
            'uuid-2',
        ]);
        const adapter = createAdapter();
        await adapter.splitPane('down');
        (0, vitest_1.expect)(ghosttyScript.splitPane).toHaveBeenCalledWith('down', undefined);
        (0, vitest_1.expect)(ghosttyScript.getTerminalIds).toHaveBeenCalledTimes(1);
    });
    (0, vitest_1.it)('should pass workingDirectory to splitPane', async () => {
        vitest_1.vi.mocked(ghosttyScript.getTerminalIds).mockResolvedValueOnce([
            'uuid-1',
            'uuid-2',
        ]);
        const adapter = createAdapter();
        await adapter.splitPane('right', { workingDirectory: '/Users/dev/subdir' });
        (0, vitest_1.expect)(ghosttyScript.splitPane).toHaveBeenCalledWith('right', '/Users/dev/subdir');
        (0, vitest_1.expect)(ghosttyScript.getTerminalIds).toHaveBeenCalledTimes(1);
    });
});
// ---------------------------------------------------------------------------
// sendText
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('GhosttyAdapter: sendText', () => {
    (0, vitest_1.it)('should send text to terminal without newline', async () => {
        const adapter = createAdapter();
        await adapter.sendText('echo hello');
        (0, vitest_1.expect)(ghosttyScript.inputText).toHaveBeenCalledWith('echo hello');
    });
});
// ---------------------------------------------------------------------------
// sendCommand
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('GhosttyAdapter: sendCommand', () => {
    (0, vitest_1.it)('should input text then send enter key', async () => {
        const adapter = createAdapter();
        await adapter.sendCommand('npm run dev');
        (0, vitest_1.expect)(ghosttyScript.inputText).toHaveBeenCalledWith('npm run dev');
        (0, vitest_1.expect)(ghosttyScript.sendKey).toHaveBeenCalledWith('enter');
    });
    (0, vitest_1.it)('should send enter key even for empty command', async () => {
        const adapter = createAdapter();
        await adapter.sendCommand('');
        (0, vitest_1.expect)(ghosttyScript.inputText).toHaveBeenCalledWith('');
        (0, vitest_1.expect)(ghosttyScript.sendKey).toHaveBeenCalledWith('enter');
    });
});
// ---------------------------------------------------------------------------
// navigateToPane (uses terminal UUID focus)
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('GhosttyAdapter: navigateToPane', () => {
    (0, vitest_1.it)('should focus terminal by cached UUID at index 1', async () => {
        const adapter = createAdapter();
        // Simulate cached pane IDs (e.g. after createTab + splitPane)
        const adapterWithCache = adapter;
        adapterWithCache.cachedPaneIds = [
            'uuid-first',
            'uuid-second',
        ];
        await adapter.navigateToPane(1);
        (0, vitest_1.expect)(ghosttyScript.focusTerminalById).toHaveBeenCalledWith('uuid-first');
    });
    (0, vitest_1.it)('should focus terminal by cached UUID at index 2', async () => {
        const adapter = createAdapter();
        adapter.cachedPaneIds = [
            'uuid-first',
            'uuid-second',
        ];
        await adapter.navigateToPane(2);
        (0, vitest_1.expect)(ghosttyScript.focusTerminalById).toHaveBeenCalledWith('uuid-second');
    });
    (0, vitest_1.it)('should refresh cached pane IDs when cache is empty', async () => {
        vitest_1.vi.mocked(ghosttyScript.getTerminalIds).mockResolvedValueOnce([
            'uuid-1',
            'uuid-2',
            'uuid-3',
        ]);
        // A fresh adapter has empty cache
        const adapter = createAdapter();
        await adapter.navigateToPane(2);
        (0, vitest_1.expect)(ghosttyScript.getTerminalIds).toHaveBeenCalledOnce();
        (0, vitest_1.expect)(ghosttyScript.focusTerminalById).toHaveBeenCalledWith('uuid-2');
    });
    (0, vitest_1.it)('should throw error for zero index', async () => {
        const adapter = createAdapter();
        await (0, vitest_1.expect)(adapter.navigateToPane(0)).rejects.toThrow('Pane index must be a positive integer');
    });
    (0, vitest_1.it)('should throw error for negative index', async () => {
        const adapter = createAdapter();
        await (0, vitest_1.expect)(adapter.navigateToPane(-1)).rejects.toThrow('Pane index must be a positive integer');
    });
    (0, vitest_1.it)('should throw error when index exceeds available panes', async () => {
        vitest_1.vi.mocked(ghosttyScript.getTerminalIds).mockResolvedValueOnce(['uuid-1']);
        const adapter = createAdapter();
        adapter.cachedPaneIds = [
            'uuid-1',
        ];
        await (0, vitest_1.expect)(adapter.navigateToPane(5)).rejects.toThrow('Pane index 5 out of range');
    });
});
//# sourceMappingURL=ghostty-adapter.test.js.map