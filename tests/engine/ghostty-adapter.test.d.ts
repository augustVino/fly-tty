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
export {};
//# sourceMappingURL=ghostty-adapter.test.d.ts.map