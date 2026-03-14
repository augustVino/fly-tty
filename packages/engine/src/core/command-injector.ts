/**
 * Command Injector - sends startup commands to panes
 *
 * After layout is built, this module walks the leaf panes in DFS order
 * (matching the order they were created by layout-builder) and injects
 * each pane's optional startup command.
 *
 * Working directory is no longer managed here -- it is set natively via
 * Ghostty's `surface configuration` during tab/split creation.
 */

import type { TerminalAdapter } from '../types/adapter.js'
import type { LayoutNode } from '../types/layout.js'
import { collectLeaves } from './layout-builder.js'

export interface InjectionOptions {
  readonly adapter: TerminalAdapter
  readonly layout: LayoutNode
  readonly projectPath: string
}

/**
 * Inject commands into all leaf panes of the layout.
 *
 * For each pane (in DFS order):
 * 1. Navigate to the pane by its 1-based index.
 * 2. If the pane defines a `command`, send it.
 */
export async function injectCommands(options: InjectionOptions): Promise<void> {
  const { adapter, layout } = options
  const leaves = collectLeaves(layout)

  for (let i = 0; i < leaves.length; i++) {
    const pane = leaves[i]
    // Terminal adapter pane indices are 1-based
    const paneIndex = i + 1

    if (pane.command && pane.command.trim().length > 0) {
      await adapter.navigateToPane(paneIndex)
      await adapter.sendCommand(pane.command)
    }
  }
}
