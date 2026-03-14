/**
 * Terminal adapter interface and related types
 */

/** Terminal tab identifier */
export interface TerminalTab {
  id: string
  title: string
  windowId?: string
}

/** Options for creating a new tab */
export interface CreateTabOptions {
  readonly title?: string
  readonly workingDirectory?: string
}

/** Options for splitting a pane */
export interface SplitPaneOptions {
  readonly workingDirectory?: string
}

/** Terminal adapter interface */
export interface TerminalAdapter {
  readonly name: string

  /** Ensure the terminal application is running */
  ensureRunning(): Promise<void>

  /** Activate the terminal window */
  activateWindow(): Promise<void>

  /** List all tabs in the terminal */
  listTabs(): Promise<TerminalTab[]>

  /** Find a tab by project path */
  findTabByProject(projectPath: string): Promise<TerminalTab | null>

  /** Create a new tab */
  createTab(options?: CreateTabOptions): Promise<TerminalTab>

  /** Focus on a specific tab */
  focusTab(tab: TerminalTab): Promise<void>

  /** Split the current pane */
  splitPane(direction: 'right' | 'down', options?: SplitPaneOptions): Promise<void>

  /** Send text to the terminal */
  sendText(text: string): Promise<void>

  /** Send a command (text + newline) */
  sendCommand(command: string): Promise<void>

  /** Navigate to a specific pane by index */
  navigateToPane(index: number): Promise<void>
}
