/**
 * Command Injector - sends startup commands to panes
 *
 * After layout is built, this module walks the leaf panes in DFS order
 * (matching the order they were created by layout-builder) and injects
 * each pane's optional startup commands sequentially.
 *
 * Working directory is no longer managed here -- it is set natively via
 * Ghostty's `surface configuration` during tab/split creation.
 */

import type { TerminalAdapter } from '../types/adapter.js'
import type { LayoutNode } from '../types/layout.js'
import { collectLeaves } from './layout-builder.js'

const COMMAND_DELAY_MS = 500

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface InjectionOptions {
  readonly adapter: TerminalAdapter
  readonly layout: LayoutNode
}

/**
 * Inject commands into all leaf panes of the layout.
 *
 * For each pane (in DFS order):
 * 1. Navigate to the pane by its 1-based index.
 * 2. Execute each command in the `commands` array sequentially,
 *    waiting COMMAND_DELAY_MS between each command.
 */
export async function injectCommands(options: InjectionOptions): Promise<void> {
  const { adapter, layout } = options
  const leaves = collectLeaves(layout)

  for (let i = 0; i < leaves.length; i++) {
    const pane = leaves[i]
    const commands = pane.commands ?? []

    if (commands.length === 0) {
      continue
    }

    // Terminal adapter pane indices are 1-based
    const paneIndex = i + 1
    await adapter.navigateToPane(paneIndex)

    for (let j = 0; j < commands.length; j++) {
      const command = commands[j]
      if (command.trim().length === 0) {
        continue
      }
      await adapter.sendCommand(command)
      if (j < commands.length - 1) {
        await delay(COMMAND_DELAY_MS)
      }
    }
  }
}
