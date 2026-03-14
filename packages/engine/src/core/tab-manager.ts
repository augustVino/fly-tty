/**
 * Tab Manager - resolves or creates a project tab in the terminal
 *
 * Implements the "tab idempotency" pattern:
 * - If a tab for the project already exists, reuse it (focus only).
 * - If no tab exists, create a new one.
 * - Either way, the returned tab is active and ready for pane operations.
 */

import type { TerminalAdapter, TerminalTab } from '../types/adapter.js'

const TAB_PREFIX = '[WorkspaceSync]'

function buildTabTitle(projectPath: string): string {
  const dirName = projectPath.replace(/\/+$/, '').split('/').pop() ?? 'unknown'
  return `${TAB_PREFIX} ${dirName}`
}

export interface TabResolution {
  readonly tab: TerminalTab
  readonly isNew: boolean
}

/**
 * Resolve a terminal tab for the given project path.
 *
 * 1. Search existing tabs for one matching the project path.
 * 2. If found, focus it and return `{ isNew: false }`.
 * 3. If not found, create a new tab and return `{ isNew: true }`.
 */
export async function resolveTab(
  adapter: TerminalAdapter,
  projectPath: string,
): Promise<TabResolution> {
  const existingTab = await adapter.findTabByProject(projectPath)

  if (existingTab !== null) {
    await adapter.focusTab(existingTab)
    return Object.freeze({ tab: existingTab, isNew: false })
  }

  const newTab = await adapter.createTab({
    title: buildTabTitle(projectPath),
    workingDirectory: projectPath,
  })
  return Object.freeze({ tab: newTab, isNew: true })
}
