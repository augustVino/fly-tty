/**
 * Window Manager - ensures the terminal application window exists and is active
 */

import type { TerminalAdapter } from '../types/adapter.js'

/**
 * Ensure the terminal application is running and its window is activated.
 *
 * This is a prerequisite before any tab or pane operations can succeed.
 */
export async function ensureWindow(adapter: TerminalAdapter, terminalPath?: string): Promise<void> {
  await adapter.ensureRunning({ terminalPath })
  await adapter.activateWindow()
}
