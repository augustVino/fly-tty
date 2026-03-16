"use strict";
/**
 * Tests for iTerm2 terminal adapter
 *
 * Covers:
 * - ensureRunning: iTerm2 not running -> starts it; already running -> no-op
 * - findTabByProject: matches [WorkspaceSync] prefix; no match -> null
 * - splitPane: direction mapping (down -> horizontally, right -> vertically)
 * - sendCommand: single writeText call (iTerm2 auto-appends newline)
 * - sendText: uses writeTextNoNewline
 * - navigateToPane: uses session id focus
 * - createTab: with/without workingDirectory, with/without title
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
vitest_1.vi.mock('@ide-tui-bridge/engine/adapters/terminal/iterm2-applescript.js', () => ({
    activateIterm2: vitest_1.vi.fn().mockResolvedValue(''),
    createWindow: vitest_1.vi.fn().mockResolvedValue(''),
    createTab: vitest_1.vi.fn().mockResolvedValue(''),
    splitPane: vitest_1.vi.fn().mockResolvedValue(''),
    writeText: vitest_1.vi.fn().mockResolvedValue(''),
    writeTextNoNewline: vitest_1.vi.fn().mockResolvedValue(''),
    selectTab: vitest_1.vi.fn().mockResolvedValue(''),
    selectTabInWindow: vitest_1.vi.fn().mockResolvedValue(''),
    selectWindow: vitest_1.vi.fn().mockResolvedValue(''),
    getTabInfo: vitest_1.vi.fn().mockResolvedValue([]),
    findSessionByProject: vitest_1.vi.fn().mockResolvedValue(null),
    getSessionIds: vitest_1.vi.fn().mockResolvedValue([]),
    focusSessionById: vitest_1.vi.fn().mockResolvedValue(''),
    getSessionName: vitest_1.vi.fn().mockResolvedValue(''),
    setSessionName: vitest_1.vi.fn().mockResolvedValue(''),
    getTabWorkingDirectories: vitest_1.vi.fn().mockResolvedValue([]),
    setSessionVar: vitest_1.vi.fn().mockResolvedValue(''),
    getTabProjectPaths: vitest_1.vi.fn().mockResolvedValue([]),
}));
const execa_1 = require("execa");
const iterm2_adapter_js_1 = require("@ide-tui-bridge/engine/adapters/terminal/iterm2-adapter.js");
const iterm2Script = __importStar(require("@ide-tui-bridge/engine/adapters/terminal/iterm2-applescript.js"));
const mockExeca = vitest_1.vi.mocked(execa_1.execa);
function createAdapter() {
    return new iterm2_adapter_js_1.ITerm2Adapter();
}
(0, vitest_1.beforeEach)(() => {
    vitest_1.vi.clearAllMocks();
    vitest_1.vi.useFakeTimers({ shouldAdvanceTime: true });
});
// ---------------------------------------------------------------------------
// Adapter name
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('ITerm2Adapter: name', () => {
    (0, vitest_1.it)('should return "iterm2"', () => {
        const adapter = createAdapter();
        (0, vitest_1.expect)(adapter.name).toBe('iterm2');
    });
});
// ---------------------------------------------------------------------------
// ensureRunning
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('ITerm2Adapter: ensureRunning', () => {
    (0, vitest_1.it)('should not start iTerm2 if already running but still check for windows', async () => {
        // pgrep: running
        mockExeca.mockResolvedValueOnce({
            stdout: '12345',
            stderr: '',
            exitCode: 0,
        });
        // hasWindow: 1 window
        mockExeca.mockResolvedValueOnce({
            stdout: '1',
            stderr: '',
            exitCode: 0,
        });
        const adapter = createAdapter();
        await adapter.ensureRunning();
        (0, vitest_1.expect)(mockExeca).toHaveBeenCalledWith('pgrep', ['-x', 'iTerm2']);
        (0, vitest_1.expect)(mockExeca).not.toHaveBeenCalledWith('open', vitest_1.expect.anything());
    });
    (0, vitest_1.it)('should use custom terminalPath when provided', async () => {
        // pgrep fails -> not running
        mockExeca.mockRejectedValueOnce(new Error('not found'));
        // open -a with custom path
        mockExeca.mockResolvedValueOnce({
            stdout: '',
            stderr: '',
            exitCode: 0,
        });
        // hasWindow: 1 window
        mockExeca.mockResolvedValueOnce({
            stdout: '1',
            stderr: '',
            exitCode: 0,
        });
        const adapter = createAdapter();
        await adapter.ensureRunning({ terminalPath: '/Applications/CustomApp.app' });
        (0, vitest_1.expect)(mockExeca).toHaveBeenCalledWith('open', ['-a', '/Applications/CustomApp.app']);
    });
    (0, vitest_1.it)('should start iTerm2 and ensure window exists if not running', async () => {
        // pgrep fails -> not running
        mockExeca.mockRejectedValueOnce(new Error('not found'));
        // open -a iTerm
        mockExeca.mockResolvedValueOnce({
            stdout: '',
            stderr: '',
            exitCode: 0,
        });
        // hasWindow: 1 window
        mockExeca.mockResolvedValueOnce({
            stdout: '1',
            stderr: '',
            exitCode: 0,
        });
        const adapter = createAdapter();
        await adapter.ensureRunning();
        (0, vitest_1.expect)(mockExeca).toHaveBeenCalledWith('pgrep', ['-x', 'iTerm2']);
        (0, vitest_1.expect)(mockExeca).toHaveBeenCalledWith('open', ['-a', 'iTerm']);
        (0, vitest_1.expect)(mockExeca).toHaveBeenCalledWith('osascript', vitest_1.expect.arrayContaining([
            '-e',
            vitest_1.expect.stringContaining('count of windows'),
        ]));
    });
    (0, vitest_1.it)('should poll for window after starting iTerm2', async () => {
        // pgrep fails -> not running
        mockExeca.mockRejectedValueOnce(new Error('not found'));
        // open -a iTerm
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
    (0, vitest_1.it)('should create window when process is running but has no windows', async () => {
        // pgrep: running
        mockExeca.mockResolvedValueOnce({
            stdout: '12345',
            stderr: '',
            exitCode: 0,
        });
        // All 20 hasWindow polls return 0
        for (let i = 0; i < 20; i++) {
            mockExeca.mockResolvedValueOnce({
                stdout: '0',
                stderr: '',
                exitCode: 0,
            });
        }
        // createWindow via iterm2Script
        vitest_1.vi.mocked(iterm2Script.createWindow).mockResolvedValueOnce('');
        const adapter = createAdapter();
        const promise = adapter.ensureRunning();
        // Advance all timers (20 polls * 500ms = 10000ms)
        await vitest_1.vi.advanceTimersByTimeAsync(10_000);
        await promise;
        (0, vitest_1.expect)(mockExeca).toHaveBeenCalledWith('pgrep', ['-x', 'iTerm2']);
        (0, vitest_1.expect)(mockExeca).not.toHaveBeenCalledWith('open', vitest_1.expect.anything());
        (0, vitest_1.expect)(iterm2Script.createWindow).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)('should create window when newly started iTerm2 has no windows after timeout', async () => {
        // pgrep fails -> not running
        mockExeca.mockRejectedValueOnce(new Error('not found'));
        // open -a iTerm
        mockExeca.mockResolvedValueOnce({
            stdout: '',
            stderr: '',
            exitCode: 0,
        });
        // All 20 hasWindow polls return 0
        for (let i = 0; i < 20; i++) {
            mockExeca.mockResolvedValueOnce({
                stdout: '0',
                stderr: '',
                exitCode: 0,
            });
        }
        // createWindow via iterm2Script
        vitest_1.vi.mocked(iterm2Script.createWindow).mockResolvedValueOnce('');
        const adapter = createAdapter();
        const promise = adapter.ensureRunning();
        await vitest_1.vi.advanceTimersByTimeAsync(10_000);
        await promise;
        (0, vitest_1.expect)(mockExeca).toHaveBeenCalledWith('open', ['-a', 'iTerm']);
        (0, vitest_1.expect)(iterm2Script.createWindow).toHaveBeenCalledOnce();
    });
});
// ---------------------------------------------------------------------------
// activateWindow
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('ITerm2Adapter: activateWindow', () => {
    (0, vitest_1.it)('should call activateIterm2', async () => {
        const adapter = createAdapter();
        await adapter.activateWindow();
        (0, vitest_1.expect)(iterm2Script.activateIterm2).toHaveBeenCalledOnce();
    });
});
// ---------------------------------------------------------------------------
// listTabs
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('ITerm2Adapter: listTabs', () => {
    (0, vitest_1.it)('should return empty array when no tabs exist', async () => {
        vitest_1.vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([]);
        const adapter = createAdapter();
        const tabs = await adapter.listTabs();
        (0, vitest_1.expect)(tabs).toEqual([]);
    });
    (0, vitest_1.it)('should map tab info to TerminalTab objects with windowId from windowIndex', async () => {
        vitest_1.vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
            { id: 1, title: '[WorkspaceSync] my-project', windowIndex: 1 },
            { id: 2, title: 'Untitled', windowIndex: 1 },
            { id: 1, title: '[WorkspaceSync] other-project', windowIndex: 2 },
        ]);
        const adapter = createAdapter();
        const tabs = await adapter.listTabs();
        (0, vitest_1.expect)(tabs).toHaveLength(3);
        (0, vitest_1.expect)(tabs[0]).toEqual({
            id: '1',
            title: '[WorkspaceSync] my-project',
            windowId: '1',
        });
        (0, vitest_1.expect)(tabs[1]).toEqual({
            id: '2',
            title: 'Untitled',
            windowId: '1',
        });
        (0, vitest_1.expect)(tabs[2]).toEqual({
            id: '1',
            title: '[WorkspaceSync] other-project',
            windowId: '2',
        });
    });
});
// ---------------------------------------------------------------------------
// findTabByProject
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('ITerm2Adapter: findTabByProject', () => {
    (0, vitest_1.it)('should find tab via cross-window user variable search (primary)', async () => {
        vitest_1.vi.mocked(iterm2Script.findSessionByProject).mockResolvedValueOnce({
            windowIndex: 2,
            tabIndex: 3,
        });
        const adapter = createAdapter();
        const tab = await adapter.findTabByProject('/Users/dev/my-project');
        (0, vitest_1.expect)(tab).not.toBeNull();
        (0, vitest_1.expect)(tab?.id).toBe('3');
        (0, vitest_1.expect)(tab?.title).toBe('[WorkspaceSync] my-project');
        (0, vitest_1.expect)(tab?.windowId).toBe('2');
        (0, vitest_1.expect)(iterm2Script.findSessionByProject).toHaveBeenCalledWith('/Users/dev/my-project');
    });
    (0, vitest_1.it)('should fall back to title match when user variable not found', async () => {
        vitest_1.vi.mocked(iterm2Script.findSessionByProject).mockResolvedValueOnce(null);
        vitest_1.vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
            { id: 1, title: 'Default', windowIndex: 1 },
            { id: 2, title: '[WorkspaceSync] my-project', windowIndex: 1 },
            { id: 3, title: 'Another', windowIndex: 1 },
        ]);
        const adapter = createAdapter();
        const tab = await adapter.findTabByProject('/Users/dev/my-project');
        (0, vitest_1.expect)(tab).not.toBeNull();
        (0, vitest_1.expect)(tab?.title).toBe('[WorkspaceSync] my-project');
        (0, vitest_1.expect)(tab?.id).toBe('2');
    });
    (0, vitest_1.it)('should return null when no matching tab exists across any method', async () => {
        vitest_1.vi.mocked(iterm2Script.findSessionByProject).mockResolvedValueOnce(null);
        vitest_1.vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
            { id: 1, title: 'Default', windowIndex: 1 },
            { id: 2, title: 'Another', windowIndex: 1 },
        ]);
        const adapter = createAdapter();
        const tab = await adapter.findTabByProject('/Users/dev/my-project');
        (0, vitest_1.expect)(tab).toBeNull();
    });
    (0, vitest_1.it)('should handle trailing slash in project path', async () => {
        vitest_1.vi.mocked(iterm2Script.findSessionByProject).mockResolvedValueOnce({
            windowIndex: 1,
            tabIndex: 1,
        });
        const adapter = createAdapter();
        const tab = await adapter.findTabByProject('/Users/dev/my-project/');
        (0, vitest_1.expect)(tab).not.toBeNull();
        (0, vitest_1.expect)(tab?.title).toBe('[WorkspaceSync] my-project');
    });
    (0, vitest_1.it)('should not match partial directory names', async () => {
        vitest_1.vi.mocked(iterm2Script.findSessionByProject).mockResolvedValueOnce(null);
        vitest_1.vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
            { id: 1, title: '[WorkspaceSync] project', windowIndex: 1 },
            { id: 2, title: '[WorkspaceSync] project-backup', windowIndex: 1 },
        ]);
        const adapter = createAdapter();
        const tab = await adapter.findTabByProject('/Users/dev/project');
        (0, vitest_1.expect)(tab).not.toBeNull();
        (0, vitest_1.expect)(tab?.id).toBe('1');
    });
    (0, vitest_1.it)('should fall back to working directory match when title is overwritten', async () => {
        vitest_1.vi.mocked(iterm2Script.findSessionByProject).mockResolvedValueOnce(null);
        // Session name was overwritten by shell prompt
        vitest_1.vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
            { id: 1, title: 'dev@host:~', windowIndex: 1 },
            { id: 2, title: '[WorkspaceSync] other-project', windowIndex: 1 },
        ]);
        vitest_1.vi.mocked(iterm2Script.getTabWorkingDirectories).mockResolvedValueOnce([
            { id: 1, cwd: '/Users/dev/my-project', windowIndex: 1 },
            { id: 2, cwd: '/Users/dev/other-project', windowIndex: 1 },
        ]);
        const adapter = createAdapter();
        const tab = await adapter.findTabByProject('/Users/dev/my-project');
        (0, vitest_1.expect)(tab).not.toBeNull();
        (0, vitest_1.expect)(tab?.id).toBe('1');
        (0, vitest_1.expect)(tab?.title).toBe('dev@host:~');
    });
    (0, vitest_1.it)('should return null when no title or cwd match exists', async () => {
        vitest_1.vi.mocked(iterm2Script.findSessionByProject).mockResolvedValueOnce(null);
        vitest_1.vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
            { id: 1, title: 'dev@host:~', windowIndex: 1 },
            { id: 2, title: 'bash', windowIndex: 1 },
        ]);
        vitest_1.vi.mocked(iterm2Script.getTabWorkingDirectories).mockResolvedValueOnce([
            { id: 1, cwd: '/Users/dev/other-project', windowIndex: 1 },
            { id: 2, cwd: '/tmp', windowIndex: 1 },
        ]);
        const adapter = createAdapter();
        const tab = await adapter.findTabByProject('/Users/dev/my-project');
        (0, vitest_1.expect)(tab).toBeNull();
    });
    (0, vitest_1.it)('should match by directory name in title as tertiary fallback', async () => {
        vitest_1.vi.mocked(iterm2Script.findSessionByProject).mockResolvedValueOnce(null);
        // Title was overwritten but still contains directory name
        vitest_1.vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
            { id: 1, title: 'dev@host:~/my-project', windowIndex: 1 },
            { id: 2, title: 'dev@host:~/other-project', windowIndex: 1 },
        ]);
        const adapter = createAdapter();
        const tab = await adapter.findTabByProject('/Users/dev/my-project');
        (0, vitest_1.expect)(tab).not.toBeNull();
        (0, vitest_1.expect)(tab?.id).toBe('1');
    });
    (0, vitest_1.it)('should not use directory name fallback when multiple tabs match', async () => {
        vitest_1.vi.mocked(iterm2Script.findSessionByProject).mockResolvedValueOnce(null);
        // Two tabs contain "project" - ambiguous, skip to next fallback
        vitest_1.vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
            { id: 1, title: 'dev@host:~/project', windowIndex: 1 },
            { id: 2, title: 'dev@host:~/project-backup', windowIndex: 1 },
        ]);
        vitest_1.vi.mocked(iterm2Script.getTabWorkingDirectories).mockResolvedValueOnce([
            { id: 1, cwd: '/Users/dev/project', windowIndex: 1 },
            { id: 2, cwd: '/Users/dev/project-backup', windowIndex: 1 },
        ]);
        const adapter = createAdapter();
        const tab = await adapter.findTabByProject('/Users/dev/project');
        // Should find via cwd fallback (last resort), not ambiguous dir match
        (0, vitest_1.expect)(tab).not.toBeNull();
        (0, vitest_1.expect)(tab?.id).toBe('1');
    });
    (0, vitest_1.it)('should match cwd across different windows correctly', async () => {
        vitest_1.vi.mocked(iterm2Script.findSessionByProject).mockResolvedValueOnce(null);
        vitest_1.vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
            { id: 1, title: 'dev@host:~', windowIndex: 1 },
            { id: 2, title: 'bash', windowIndex: 2 },
        ]);
        vitest_1.vi.mocked(iterm2Script.getTabWorkingDirectories).mockResolvedValueOnce([
            { id: 1, cwd: '/Users/dev/other-project', windowIndex: 1 },
            { id: 2, cwd: '/Users/dev/my-project', windowIndex: 2 },
        ]);
        const adapter = createAdapter();
        const tab = await adapter.findTabByProject('/Users/dev/my-project');
        (0, vitest_1.expect)(tab).not.toBeNull();
        (0, vitest_1.expect)(tab?.id).toBe('2');
        (0, vitest_1.expect)(tab?.windowId).toBe('2');
    });
});
// ---------------------------------------------------------------------------
// createTab
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('ITerm2Adapter: createTab', () => {
    (0, vitest_1.it)('should create a new tab and return the last one', async () => {
        vitest_1.vi.mocked(iterm2Script.createTab).mockResolvedValueOnce('');
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1', 'sid-2']);
        vitest_1.vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
            { id: 1, title: 'First tab', windowIndex: 1 },
            { id: 2, title: 'New tab', windowIndex: 1 },
        ]);
        const adapter = createAdapter();
        const tab = await adapter.createTab();
        // Advance past SETTLE_DELAY_MS (500ms)
        await vitest_1.vi.advanceTimersByTimeAsync(500);
        (0, vitest_1.expect)(tab).toEqual({ id: '2', title: 'New tab', windowId: '1' });
        (0, vitest_1.expect)(iterm2Script.createTab).toHaveBeenCalledOnce();
        (0, vitest_1.expect)(iterm2Script.getSessionIds).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)('should create tab with custom title', async () => {
        vitest_1.vi.mocked(iterm2Script.createTab).mockResolvedValueOnce('');
        vitest_1.vi.mocked(iterm2Script.setSessionName).mockResolvedValueOnce('');
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1']);
        vitest_1.vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
            { id: 1, title: 'First tab', windowIndex: 1 },
            { id: 2, title: 'New tab', windowIndex: 1 },
        ]);
        const adapter = createAdapter();
        const tab = await adapter.createTab({
            title: '[WorkspaceSync] my-project',
        });
        await vitest_1.vi.advanceTimersByTimeAsync(500);
        (0, vitest_1.expect)(tab).toEqual({
            id: '2',
            title: '[WorkspaceSync] my-project',
            windowId: '1',
        });
        (0, vitest_1.expect)(iterm2Script.setSessionName).toHaveBeenCalledWith('[WorkspaceSync] my-project');
    });
    (0, vitest_1.it)('should create tab with working directory using cd command', async () => {
        vitest_1.vi.mocked(iterm2Script.createTab).mockResolvedValueOnce('');
        vitest_1.vi.mocked(iterm2Script.writeText).mockResolvedValueOnce('');
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1']);
        vitest_1.vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
            { id: 1, title: 'First tab', windowIndex: 1 },
            { id: 2, title: 'New tab', windowIndex: 1 },
        ]);
        const adapter = createAdapter();
        await adapter.createTab({
            title: '[WorkspaceSync] test-project',
            workingDirectory: '/Users/dev/test-project',
        });
        // Advance past two SETTLE_DELAY_MS calls (create + cd)
        await vitest_1.vi.advanceTimersByTimeAsync(1000);
        (0, vitest_1.expect)(iterm2Script.createTab).toHaveBeenCalledOnce();
        (0, vitest_1.expect)(iterm2Script.writeText).toHaveBeenCalledWith('cd "/Users/dev/test-project"');
        (0, vitest_1.expect)(iterm2Script.setSessionName).toHaveBeenCalledWith('[WorkspaceSync] test-project');
    });
    (0, vitest_1.it)('should not send cd when no working directory', async () => {
        vitest_1.vi.mocked(iterm2Script.createTab).mockResolvedValueOnce('');
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1']);
        vitest_1.vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
            { id: 1, title: 'New tab', windowIndex: 1 },
        ]);
        const adapter = createAdapter();
        await adapter.createTab();
        await vitest_1.vi.advanceTimersByTimeAsync(500);
        (0, vitest_1.expect)(iterm2Script.writeText).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('should throw error when no tabs after creation', async () => {
        vitest_1.vi.mocked(iterm2Script.createTab).mockResolvedValueOnce('');
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1']);
        vitest_1.vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([]);
        const adapter = createAdapter();
        await (0, vitest_1.expect)(adapter.createTab()).rejects.toThrow('Failed to create tab');
    });
    (0, vitest_1.it)('should set user variable for working directory when creating tab', async () => {
        vitest_1.vi.mocked(iterm2Script.createTab).mockResolvedValueOnce('');
        vitest_1.vi.mocked(iterm2Script.writeText).mockResolvedValueOnce('');
        vitest_1.vi.mocked(iterm2Script.setSessionVar).mockResolvedValueOnce('');
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1']);
        vitest_1.vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
            { id: 1, title: 'First tab', windowIndex: 1 },
            { id: 2, title: 'New tab', windowIndex: 1 },
        ]);
        const adapter = createAdapter();
        await adapter.createTab({
            title: '[WorkspaceSync] test-project',
            workingDirectory: '/Users/dev/test-project',
        });
        await vitest_1.vi.advanceTimersByTimeAsync(1000);
        (0, vitest_1.expect)(iterm2Script.setSessionVar).toHaveBeenCalledWith('workspaceProjectPath', '/Users/dev/test-project');
    });
    (0, vitest_1.it)('should not set user variable when no working directory', async () => {
        vitest_1.vi.mocked(iterm2Script.createTab).mockResolvedValueOnce('');
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1']);
        vitest_1.vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
            { id: 1, title: 'New tab', windowIndex: 1 },
        ]);
        const adapter = createAdapter();
        await adapter.createTab();
        await vitest_1.vi.advanceTimersByTimeAsync(500);
        (0, vitest_1.expect)(iterm2Script.setSessionVar).not.toHaveBeenCalled();
    });
});
// ---------------------------------------------------------------------------
// focusTab
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('ITerm2Adapter: focusTab', () => {
    (0, vitest_1.it)('should select tab in front window and refresh session IDs', async () => {
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1', 'sid-2']);
        const adapter = createAdapter();
        await adapter.focusTab({ id: '2', title: 'Test', windowId: '1' });
        await vitest_1.vi.advanceTimersByTimeAsync(500);
        (0, vitest_1.expect)(iterm2Script.selectTabInWindow).toHaveBeenCalledWith(2, 1);
        (0, vitest_1.expect)(iterm2Script.getSessionIds).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)('should select tab in non-front window via selectTabInWindow', async () => {
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1']);
        const adapter = createAdapter();
        await adapter.focusTab({ id: '3', title: 'Test', windowId: '2' });
        await vitest_1.vi.advanceTimersByTimeAsync(500);
        (0, vitest_1.expect)(iterm2Script.selectTabInWindow).toHaveBeenCalledWith(3, 2);
        (0, vitest_1.expect)(iterm2Script.selectTab).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('should default to window 1 when windowId is not set', async () => {
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1']);
        const adapter = createAdapter();
        await adapter.focusTab({ id: '1', title: 'Test' });
        await vitest_1.vi.advanceTimersByTimeAsync(500);
        (0, vitest_1.expect)(iterm2Script.selectTabInWindow).toHaveBeenCalledWith(1, 1);
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
(0, vitest_1.describe)('ITerm2Adapter: splitPane', () => {
    (0, vitest_1.it)('should map "down" direction to "horizontally" and refresh session IDs', async () => {
        // getSessionIds before split
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1']);
        // getSessionIds after split
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce([
            'sid-1',
            'sid-2',
        ]);
        const adapter = createAdapter();
        await adapter.splitPane('down');
        await vitest_1.vi.advanceTimersByTimeAsync(500);
        (0, vitest_1.expect)(iterm2Script.splitPane).toHaveBeenCalledWith('horizontally');
        (0, vitest_1.expect)(iterm2Script.getSessionIds).toHaveBeenCalledTimes(2);
    });
    (0, vitest_1.it)('should map "right" direction to "vertically" and refresh session IDs', async () => {
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1']);
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce([
            'sid-1',
            'sid-2',
        ]);
        const adapter = createAdapter();
        await adapter.splitPane('right');
        await vitest_1.vi.advanceTimersByTimeAsync(500);
        (0, vitest_1.expect)(iterm2Script.splitPane).toHaveBeenCalledWith('vertically');
        (0, vitest_1.expect)(iterm2Script.getSessionIds).toHaveBeenCalledTimes(2);
    });
    (0, vitest_1.it)('should send cd command for workingDirectory after split with explicit focus', async () => {
        // getSessionIds before split
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1']);
        // getSessionIds after split (new session added)
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce([
            'sid-1',
            'sid-new',
        ]);
        vitest_1.vi.mocked(iterm2Script.focusSessionById).mockResolvedValue('');
        vitest_1.vi.mocked(iterm2Script.writeText).mockResolvedValue('');
        const adapter = createAdapter();
        await adapter.splitPane('right', { workingDirectory: '/Users/dev/subdir' });
        await vitest_1.vi.advanceTimersByTimeAsync(1200);
        (0, vitest_1.expect)(iterm2Script.splitPane).toHaveBeenCalledWith('vertically');
        (0, vitest_1.expect)(iterm2Script.getSessionIds).toHaveBeenCalledTimes(2);
        // Explicitly focus the new session before sending cd
        (0, vitest_1.expect)(iterm2Script.focusSessionById).toHaveBeenCalledWith('sid-new');
        (0, vitest_1.expect)(iterm2Script.writeText).toHaveBeenCalledWith('cd "/Users/dev/subdir"');
    });
    (0, vitest_1.it)('should not send cd when no new session is found after split', async () => {
        // getSessionIds before split
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1']);
        // getSessionIds after split (no new session detected)
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1']);
        const adapter = createAdapter();
        await adapter.splitPane('right', { workingDirectory: '/Users/dev/subdir' });
        await vitest_1.vi.advanceTimersByTimeAsync(500);
        (0, vitest_1.expect)(iterm2Script.focusSessionById).not.toHaveBeenCalled();
        (0, vitest_1.expect)(iterm2Script.writeText).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('should set user variable on new session when currentProjectPath is set', async () => {
        // Set up adapter with a prior createTab that saved currentProjectPath
        vitest_1.vi.mocked(iterm2Script.createTab).mockResolvedValue('');
        vitest_1.vi.mocked(iterm2Script.writeText).mockResolvedValue('');
        vitest_1.vi.mocked(iterm2Script.setSessionVar).mockResolvedValue('');
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1']);
        vitest_1.vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
            { id: 1, title: 'New tab', windowIndex: 1 },
        ]);
        const adapter = createAdapter();
        await adapter.createTab({
            title: '[WorkspaceSync] test-project',
            workingDirectory: '/Users/dev/test-project',
        });
        await vitest_1.vi.advanceTimersByTimeAsync(1000);
        vitest_1.vi.clearAllMocks();
        // Now split — new session should get the user variable
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1']);
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce([
            'sid-1',
            'sid-new',
        ]);
        vitest_1.vi.mocked(iterm2Script.focusSessionById).mockResolvedValue('');
        vitest_1.vi.mocked(iterm2Script.setSessionVar).mockResolvedValue('');
        await adapter.splitPane('right');
        await vitest_1.vi.advanceTimersByTimeAsync(700);
        (0, vitest_1.expect)(iterm2Script.focusSessionById).toHaveBeenCalledWith('sid-new');
        (0, vitest_1.expect)(iterm2Script.setSessionVar).toHaveBeenCalledWith('workspaceProjectPath', '/Users/dev/test-project');
    });
    (0, vitest_1.it)('should not set user variable when currentProjectPath is null', async () => {
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1']);
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce([
            'sid-1',
            'sid-new',
        ]);
        vitest_1.vi.mocked(iterm2Script.focusSessionById).mockResolvedValue('');
        const adapter = createAdapter();
        await adapter.splitPane('right');
        await vitest_1.vi.advanceTimersByTimeAsync(700);
        (0, vitest_1.expect)(iterm2Script.setSessionVar).not.toHaveBeenCalled();
    });
});
// ---------------------------------------------------------------------------
// sendText
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('ITerm2Adapter: sendText', () => {
    (0, vitest_1.it)('should send text using writeTextNoNewline', async () => {
        const adapter = createAdapter();
        await adapter.sendText('echo hello');
        (0, vitest_1.expect)(iterm2Script.writeTextNoNewline).toHaveBeenCalledWith('echo hello');
        (0, vitest_1.expect)(iterm2Script.writeText).not.toHaveBeenCalled();
    });
});
// ---------------------------------------------------------------------------
// sendCommand
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('ITerm2Adapter: sendCommand', () => {
    (0, vitest_1.it)('should send text using writeText (single call, iTerm2 auto-appends newline)', async () => {
        const adapter = createAdapter();
        await adapter.sendCommand('npm run dev');
        (0, vitest_1.expect)(iterm2Script.writeText).toHaveBeenCalledWith('npm run dev');
        (0, vitest_1.expect)(iterm2Script.writeTextNoNewline).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('should handle empty command', async () => {
        const adapter = createAdapter();
        await adapter.sendCommand('');
        (0, vitest_1.expect)(iterm2Script.writeText).toHaveBeenCalledWith('');
    });
});
// ---------------------------------------------------------------------------
// navigateToPane (uses session id focus)
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('ITerm2Adapter: navigateToPane', () => {
    (0, vitest_1.it)('should focus session by cached id at index 1', async () => {
        const adapter = createAdapter();
        adapter.cachedSessionIds = [
            'sid-first',
            'sid-second',
        ];
        await adapter.navigateToPane(1);
        (0, vitest_1.expect)(iterm2Script.focusSessionById).toHaveBeenCalledWith('sid-first');
    });
    (0, vitest_1.it)('should focus session by cached id at index 2', async () => {
        const adapter = createAdapter();
        adapter.cachedSessionIds = [
            'sid-first',
            'sid-second',
        ];
        await adapter.navigateToPane(2);
        (0, vitest_1.expect)(iterm2Script.focusSessionById).toHaveBeenCalledWith('sid-second');
    });
    (0, vitest_1.it)('should refresh cached session IDs when cache is empty', async () => {
        vitest_1.vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce([
            'sid-1',
            'sid-2',
            'sid-3',
        ]);
        const adapter = createAdapter();
        await adapter.navigateToPane(2);
        (0, vitest_1.expect)(iterm2Script.getSessionIds).toHaveBeenCalledOnce();
        (0, vitest_1.expect)(iterm2Script.focusSessionById).toHaveBeenCalledWith('sid-2');
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
        const adapter = createAdapter();
        adapter.cachedSessionIds = [
            'sid-1',
        ];
        await (0, vitest_1.expect)(adapter.navigateToPane(5)).rejects.toThrow('Pane index 5 out of range');
    });
});
//# sourceMappingURL=iterm2-adapter.test.js.map