/**
 * Command Injector - sends working-directory and startup commands to panes
 *
 * After layout is built, this module walks the leaf panes in DFS order
 * (matching the order they were created by layout-builder) and injects
 * `cd <projectPath>` followed by each pane's optional startup command.
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
 * 1. Navigate to the pane by its 1-based index (terminal adapters use
 *    1-based pane indices).
 * 2. Send `cd <projectPath>` to align the working directory.
 * 3. If the pane defines a `command`, send it.
 */
export async function injectCommands(options: InjectionOptions): Promise<void> {
  const { adapter, layout, projectPath } = options
  const leaves = collectLeaves(layout)
  const cdCommand = `cd ${projectPath}`

  for (let i = 0; i < leaves.length; i++) {
    const pane = leaves[i]
    // Terminal adapter pane indices are 1-based
    const paneIndex = i + 1

    await adapter.navigateToPane(paneIndex)
    await adapter.sendCommand(cdCommand)

    if (pane.command && pane.command.trim().length > 0) {
      if (pane.cwd && pane.cwd !== projectPath) {
        await adapter.sendCommand(`cd ${pane.cwd}`)
      }
      await adapter.sendCommand(pane.command)
    }
  }
}
