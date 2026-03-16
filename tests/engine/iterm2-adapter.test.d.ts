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
export {};
//# sourceMappingURL=iterm2-adapter.test.d.ts.map