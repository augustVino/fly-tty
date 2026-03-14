/**
 * Ghostty terminal adapter implementation.
 *
 * Uses AppleScript to control Ghostty on macOS.
 * Tab identification strategy: titles formatted as `[WorkspaceSync] <project-dirname>`.
 */

import { execa } from 'execa'
import * as ghosttyScript from './ghostty-applescript.js'
import type { TerminalAdapter, TerminalTab } from '../../types/adapter.js'

/** Prefix used to identify workspace-synced tabs */
const TAB_PREFIX = '[WorkspaceSync]'

/** Default retry interval and max attempts for waiting on Ghostty */
const WAIT_INTERVAL_MS = 500
const MAX_WAIT_ATTEMPTS = 20

/**
 * Extract the directory name from an absolute file path.
 * e.g. "/Users/dev/my-project" -> "my-project"
 */
function extractDirName(projectPath: string): string {
  const segments = projectPath.replace(/\/+$/, '').split('/')
  const last = segments[segments.length - 1]
  return last ?? 'unknown'
}

/**
 * Build the expected tab title for a project path.
 * Format: `[WorkspaceSync] <dirname>`
 */
function buildTabTitle(projectPath: string): string {
  return `${TAB_PREFIX} ${extractDirName(projectPath)}`
}

/**
 * Check if Ghostty is currently running via pgrep.
 */
async function isGhosttyRunning(): Promise<boolean> {
  try {
    const { stdout } = await execa('pgrep', ['-x', 'Ghostty'])
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

/**
 * Wait for Ghostty to have at least one window.
 * Polls using osascript to count windows.
 */
async function waitForWindow(): Promise<void> {
  for (let attempt = 0; attempt < MAX_WAIT_ATTEMPTS; attempt++) {
    try {
      const { stdout } = await execa('osascript', [
        '-e',
        'tell application "System Events" to count windows of process "Ghostty"',
      ])
      const count = parseInt(stdout.trim(), 10)
      if (count > 0) {
        return
      }
    } catch {
      // Ghostty windows may not be accessible yet via System Events
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS))
  }
  throw new Error('Ghostty did not start within the expected timeout')
}

/**
 * Ghostty terminal adapter.
 *
 * Implements TerminalAdapter using AppleScript commands on macOS.
 */
export class GhosttyAdapter implements TerminalAdapter {
  get name(): string {
    return 'ghostty'
  }

  async ensureRunning(): Promise<void> {
    const running = await isGhosttyRunning()
    if (!running) {
      await execa('open', ['-a', 'Ghostty'])
      await waitForWindow()
    }
  }

  async activateWindow(): Promise<void> {
    await ghosttyScript.activateGhostty()
  }

  async listTabs(): Promise<TerminalTab[]> {
    const titles = await ghosttyScript.getTabTitles()
    return titles.map((title, index) => ({
      id: String(index + 1),
      title,
      windowId: 'front',
    }))
  }

  async findTabByProject(projectPath: string): Promise<TerminalTab | null> {
    const tabs = await this.listTabs()
    const expectedTitle = buildTabTitle(projectPath)
    return tabs.find((tab) => tab.title === expectedTitle) ?? null
  }

  async createTab(title?: string): Promise<TerminalTab> {
    await ghosttyScript.newTab()

    // Brief delay to let the new tab register
    await new Promise((resolve) => setTimeout(resolve, 200))

    const tabs = await this.listTabs()
    // The new tab is the last one
    const newTab = tabs[tabs.length - 1]

    if (!newTab) {
      throw new Error('Failed to create tab: no tabs found after creation')
    }

    // If a title was provided and the tab doesn't have the desired title yet,
    // we derive the effective title. Note: Ghostty does not have a direct
    // "set tab title" AppleScript command, so the title parameter informs
    // the tab identifier but is set by shell prompt integration.
    if (title) {
      return {
        ...newTab,
        title,
      }
    }

    return { ...newTab }
  }

  async focusTab(tab: TerminalTab): Promise<void> {
    const tabIndex = parseInt(tab.id, 10)
    if (Number.isNaN(tabIndex) || tabIndex < 1) {
      throw new Error(`Invalid tab id: "${tab.id}"`)
    }
    await ghosttyScript.selectTab(tabIndex)
  }

  async splitPane(direction: 'right' | 'down'): Promise<void> {
    await ghosttyScript.splitPane(direction)
  }

  async sendText(text: string): Promise<void> {
    await ghosttyScript.inputText(text)
  }

  async sendCommand(command: string): Promise<void> {
    await ghosttyScript.inputText(`${command}\n`)
  }

  async navigateToPane(index: number): Promise<void> {
    if (index < 1) {
      throw new Error(`Pane index must be a positive integer, got: ${index}`)
    }
    await ghosttyScript.navigateToPane(index)
  }
}

/** Singleton instance for convenience */
export const ghosttyAdapter: TerminalAdapter = new GhosttyAdapter()
