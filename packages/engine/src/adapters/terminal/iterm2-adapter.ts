/**
 * iTerm2 terminal adapter implementation.
 *
 * Uses AppleScript to control iTerm2 on macOS.
 * Pane identification strategy: tracks session unique ids for reliable navigation.
 * Tab identification strategy: titles formatted as `[WorkspaceSync] <project-dirname>`.
 *
 * Key differences from Ghostty adapter:
 * - iTerm2 `write text` appends newline automatically (no separate sendKey needed)
 * - Working directory set via `cd` command after tab/split (not atomic surface config)
 * - Object model uses Session (not Terminal) as the primary unit
 * - Split direction naming: horizontally/vertically vs down/right
 */

import { execa } from 'execa'
import * as iterm2Script from './iterm2-applescript.js'
import type {
  TerminalAdapter,
  TerminalTab,
  CreateTabOptions,
  SplitPaneOptions,
} from '../../types/adapter.js'

/** Prefix used to identify workspace-synced tabs */
const TAB_PREFIX = '[WorkspaceSync]'

/** Default retry interval and max attempts for waiting on iTerm2 */
const WAIT_INTERVAL_MS = 500
const MAX_WAIT_ATTEMPTS = 20

/**
 * Delay after operations that need time to settle.
 * Longer than Ghostty because iTerm2 needs `cd` command for working directory.
 */
const SETTLE_DELAY_MS = 500

/** Map adapter direction to iTerm2 split direction */
const DIRECTION_MAP = {
  down: 'horizontally' as const,
  right: 'vertically' as const,
}

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
 * Check if iTerm2 is currently running via pgrep.
 */
async function isIterm2Running(): Promise<boolean> {
  try {
    const { stdout } = await execa('pgrep', ['-x', 'iTerm2'])
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

/**
 * Check if iTerm has at least one window via its own AppleScript.
 * Preferred over System Events — avoids accessibility permission issues.
 */
async function hasWindow(): Promise<boolean> {
  try {
    const result = await execa('osascript', [
      '-e',
      'tell application "iTerm" to count of windows',
    ])
    return parseInt(result.stdout.trim(), 10) > 0
  } catch {
    return false
  }
}

/**
 * Ensure iTerm has at least one window.
 * Polls via iTerm's AppleScript; creates a window if none exists after timeout.
 */
async function ensureWindowExists(): Promise<void> {
  for (let attempt = 0; attempt < MAX_WAIT_ATTEMPTS; attempt++) {
    if (await hasWindow()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS))
  }

  // No window appeared — create one explicitly
  await iterm2Script.createWindow()
}

/**
 * iTerm2 terminal adapter.
 *
 * Implements TerminalAdapter using AppleScript commands on macOS.
 * Tracks session IDs internally for reliable pane navigation.
 */
export class ITerm2Adapter implements TerminalAdapter {
  /**
   * Cached session IDs in the current tab.
   * Refreshed after createTab/splitPane operations.
   */
  private cachedSessionIds: readonly string[] = []

  /**
   * Current workspace project path, saved during createTab().
   * Used to propagate user variable to split panes.
   */
  private currentProjectPath: string | null = null

  get name(): string {
    return 'iterm2'
  }

  async ensureRunning(options?: { readonly terminalPath?: string }): Promise<void> {
    const appName = options?.terminalPath ?? 'iTerm'
    const running = await isIterm2Running()
    if (!running) {
      await execa('open', ['-a', appName])
    }

    // Always ensure at least one window exists
    // (process may be running but have no windows, e.g. fresh install)
    await ensureWindowExists()
  }

  async activateWindow(): Promise<void> {
    await iterm2Script.activateIterm2()
  }

  async listTabs(): Promise<TerminalTab[]> {
    const tabInfos = await iterm2Script.getTabInfo()
    return tabInfos.map((info) => ({
      id: String(info.id),
      title: info.title,
      windowId: String(info.windowIndex),
    }))
  }

  async findTabByProject(projectPath: string): Promise<TerminalTab | null> {
    // Primary: cross-window search by user variable (most reliable)
    const found = await iterm2Script.findSessionByProject(projectPath)
    if (found) {
      return {
        id: String(found.tabIndex),
        title: buildTabTitle(projectPath),
        windowId: String(found.windowIndex),
      }
    }

    // Fallback chain using cross-window search functions
    const tabs = await this.listTabs()
    const expectedTitle = buildTabTitle(projectPath)

    // Secondary: exact title match
    const titleMatch = tabs.find((tab) => tab.title === expectedTitle)
    if (titleMatch) return titleMatch

    // Tertiary: directory name in title (like Ghostty's fallback)
    const dirName = extractDirName(projectPath)
    const dirMatches = tabs.filter((tab) => tab.title.includes(dirName))
    if (dirMatches.length === 1) return dirMatches[0]

    // Last resort: match by first session's working directory
    const tabCwds = await iterm2Script.getTabWorkingDirectories()
    const cwdMatch = tabCwds.find((info) => info.cwd === projectPath)
    if (cwdMatch) {
      const windowId = String(cwdMatch.windowIndex)
      return (
        tabs.find(
          (tab) => tab.id === String(cwdMatch.id) && tab.windowId === windowId,
        ) ?? null
      )
    }

    return null
  }

  async createTab(options?: CreateTabOptions): Promise<TerminalTab> {
    const { title, workingDirectory } = options ?? {}

    // Save project path for splitPane user variable propagation
    this.currentProjectPath = workingDirectory ?? null

    await iterm2Script.createTab()

    // Wait for the new tab to register and stabilize
    await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS))

    // iTerm2 needs cd command for working directory (not atomic like Ghostty)
    if (workingDirectory) {
      await iterm2Script.writeText(`cd "${workingDirectory}"`)
      await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS))
    }

    if (title) {
      await iterm2Script.setSessionName(title)
    }

    // Store project path as user variable for reliable tab reuse.
    // User variables survive shell escape sequence title overwrites.
    if (workingDirectory) {
      await iterm2Script.setSessionVar('workspaceProjectPath', workingDirectory)
    }

    // Refresh cached session IDs
    this.cachedSessionIds = await iterm2Script.getSessionIds()

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
    const windowIndex = tab.windowId ? parseInt(tab.windowId, 10) : 1

    if (Number.isNaN(tabIndex) || tabIndex < 1) {
      throw new Error(`Invalid tab id: "${tab.id}"`)
    }

    // Select tab in the target window (brings non-front windows to front)
    await iterm2Script.selectTabInWindow(tabIndex, windowIndex)

    // Refresh cached session IDs after switching tabs
    await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS))
    this.cachedSessionIds = await iterm2Script.getSessionIds()
  }

  async splitPane(
    direction: 'right' | 'down',
    options?: SplitPaneOptions,
  ): Promise<void> {
    const { workingDirectory } = options ?? {}
    const iterm2Direction = DIRECTION_MAP[direction]

    // Record session IDs before split to identify the new session
    const idsBefore = await iterm2Script.getSessionIds()

    await iterm2Script.splitPane(iterm2Direction)

    // Wait for the split to complete
    await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS))

    const idsAfter = await iterm2Script.getSessionIds()
    const newSessionId = idsAfter.find((id) => !idsBefore.includes(id))

    // Focus new session if needed for any configuration
    if (newSessionId && (workingDirectory || this.currentProjectPath)) {
      await iterm2Script.focusSessionById(newSessionId)
      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    if (workingDirectory && newSessionId) {
      await iterm2Script.writeText(`cd "${workingDirectory}"`)
      await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS))
    }

    // Propagate user variable to new session for reliable tab reuse
    if (this.currentProjectPath && newSessionId) {
      await iterm2Script.setSessionVar(
        'workspaceProjectPath',
        this.currentProjectPath,
      )
    }

    // Refresh cached session IDs after split
    this.cachedSessionIds = idsAfter
  }

  async sendText(text: string): Promise<void> {
    await iterm2Script.writeTextNoNewline(text)
  }

  /**
   * Send a command to the terminal.
   * iTerm2 `write text` automatically appends a newline, so no separate step needed.
   */
  async sendCommand(command: string): Promise<void> {
    await iterm2Script.writeText(command)
  }

  /**
   * Navigate to a specific pane by 1-based index.
   *
   * Uses session IDs for reliable navigation:
   * 1. Refresh cached session IDs if needed
   * 2. Select the session at position (index - 1) by its id
   */
  async navigateToPane(index: number): Promise<void> {
    if (index < 1) {
      throw new Error(`Pane index must be a positive integer, got: ${index}`)
    }

    // Refresh session IDs if cache is empty or stale
    if (this.cachedSessionIds.length === 0) {
      this.cachedSessionIds = await iterm2Script.getSessionIds()
    }

    const sessionId = this.cachedSessionIds[index - 1]
    if (!sessionId) {
      throw new Error(
        `Pane index ${index} out of range (only ${this.cachedSessionIds.length} panes exist)`
      )
    }

    await iterm2Script.focusSessionById(sessionId)
  }
}

/** Singleton instance for convenience */
export const iterm2Adapter: TerminalAdapter = new ITerm2Adapter()
