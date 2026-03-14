/**
 * Ghostty terminal adapter implementation.
 *
 * Uses AppleScript to control Ghostty on macOS.
 * Pane identification strategy: tracks terminal UUIDs for reliable navigation.
 * Tab identification strategy: titles formatted as `[WorkspaceSync] <project-dirname>`.
 */

import { execa } from 'execa'
import * as ghosttyScript from './ghostty-applescript.js'
import type {
  TerminalAdapter,
  TerminalTab,
  CreateTabOptions,
  SplitPaneOptions,
} from '../../types/adapter.js'

/** Prefix used to identify workspace-synced tabs */
const TAB_PREFIX = '[WorkspaceSync]'

/** Default retry interval and max attempts for waiting on Ghostty */
const WAIT_INTERVAL_MS = 500
const MAX_WAIT_ATTEMPTS = 20

/** Delay after operations that need time to settle (e.g. tab creation, split) */
const SETTLE_DELAY_MS = 300

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
 * Tracks terminal UUIDs internally for reliable pane navigation.
 */
export class GhosttyAdapter implements TerminalAdapter {
  /**
   * Cached terminal UUIDs in the current tab, in DFS creation order.
   * Refreshed after createTab/splitPane operations.
   */
  private cachedPaneIds: readonly string[] = []

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

  async createTab(options?: CreateTabOptions): Promise<TerminalTab> {
    const { title, workingDirectory } = options ?? {}
    await ghosttyScript.newTab(workingDirectory)

    // Wait for the new tab to register and stabilize
    await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS))

    // Refresh cached pane IDs (new tab starts with a single terminal)
    this.cachedPaneIds = await ghosttyScript.getTerminalIds()

    const tabs = await this.listTabs()
    const lastTab = tabs[tabs.length - 1]

    if (!lastTab) {
      throw new Error('Failed to create tab: no tabs found after creation')
    }

    if (title) {
      return {
        ...lastTab,
        title,
      }
    }

    return { ...lastTab }
  }

  async focusTab(tab: TerminalTab): Promise<void> {
    const tabIndex = parseInt(tab.id, 10)
    if (Number.isNaN(tabIndex) || tabIndex < 1) {
      throw new Error(`Invalid tab id: "${tab.id}"`)
    }
    await ghosttyScript.selectTab(tabIndex)

    // Refresh cached pane IDs after switching tabs
    await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS))
    this.cachedPaneIds = await ghosttyScript.getTerminalIds()
  }

  async splitPane(
    direction: 'right' | 'down',
    options?: SplitPaneOptions,
  ): Promise<void> {
    const { workingDirectory } = options ?? {}
    await ghosttyScript.splitPane(direction, workingDirectory)

    // Wait for the split to complete and the new terminal to register
    await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS))

    // Refresh cached pane IDs after split
    this.cachedPaneIds = await ghosttyScript.getTerminalIds()
  }

  async sendText(text: string): Promise<void> {
    await ghosttyScript.inputText(text)
  }

  async sendCommand(command: string): Promise<void> {
    await ghosttyScript.inputText(`${command}\n`)
  }

  /**
   * Navigate to a specific pane by 1-based index.
   *
   * Uses terminal UUIDs for reliable navigation:
   * 1. Refresh the cached terminal IDs if needed
   * 2. Focus the terminal at position (index - 1) by its UUID
   */
  async navigateToPane(index: number): Promise<void> {
    if (index < 1) {
      throw new Error(`Pane index must be a positive integer, got: ${index}`)
    }

    // Refresh pane IDs if cache is empty or stale
    if (this.cachedPaneIds.length === 0) {
      this.cachedPaneIds = await ghosttyScript.getTerminalIds()
    }

    const paneId = this.cachedPaneIds[index - 1]
    if (!paneId) {
      throw new Error(
        `Pane index ${index} out of range (only ${this.cachedPaneIds.length} panes exist)`
      )
    }

    await ghosttyScript.focusTerminalById(paneId)
  }
}

/** Singleton instance for convenience */
export const ghosttyAdapter: TerminalAdapter = new GhosttyAdapter()
