/**
 * Sync Engine - main orchestration flow
 *
 * Coordinates the full lifecycle of a workspace sync operation:
 *   createTerminalAdapter -> ensureWindow ->
 *   resolveTab -> (if new tab: buildLayout + injectCommands)
 */

import { defaultConfig } from '../config/defaults.js'
import { ok, type Result } from '../types/result.js'
import type { ProjectConfig, TerminalAdapter, TerminalType, LayoutNode } from '../types/index.js'
import { ProjectConfigSchema } from '../config/schema.js'
import { ghosttyAdapter } from '../adapters/terminal/ghostty-adapter.js'
import { iterm2Adapter } from '../adapters/terminal/iterm2-adapter.js'
import { ensureWindow } from './window-manager.js'
import { resolveTab, type TabResolution } from './tab-manager.js'
import { buildSplitSequence } from './layout-builder.js'
import { injectCommands } from './command-injector.js'

export interface SyncOptions {
  readonly projectPath: string
  readonly layout?: LayoutNode
  readonly terminal?: TerminalType
  readonly terminalPath?: string
}

export interface SyncResult {
  readonly config: ProjectConfig
  readonly tabResolution: TabResolution
  readonly splitCount: number
}

/**
 * Create a terminal adapter based on the configured terminal type.
 *
 * Factory pattern -- supports Ghostty and iTerm2.
 */
export function createTerminalAdapter(config: ProjectConfig): TerminalAdapter {
  switch (config.terminal) {
    case 'ghostty':
      return ghosttyAdapter
    case 'iterm2':
      return iterm2Adapter
    default:
      throw new Error(`Unsupported terminal type: ${config.terminal as string}`)
  }
}

/**
 * Resolve the effective configuration.
 *
 * If a layout or terminal is provided (from VS Code settings), validate and merge
 * with default config values. Otherwise, use the default config.
 */
function resolveConfig(options: SyncOptions): ProjectConfig {
  const { layout, terminal } = options

  if (layout || terminal) {
    const validated = ProjectConfigSchema.parse({ layout, terminal }) as ProjectConfig
    return validated
  }

  return defaultConfig
}

/**
 * Execute the full workspace sync flow.
 *
 * 1. Resolve configuration from VS Code settings or defaults.
 * 2. Create the appropriate terminal adapter.
 * 3. Ensure the terminal window exists and is active.
 * 4. Resolve (or create) the project's tab.
 * 5. If the tab is new, build the layout and inject startup commands.
 */
export async function sync(options: SyncOptions): Promise<Result<SyncResult>> {
  const config = resolveConfig(options)

  try {
    // Step 1: Create terminal adapter
    const adapter = createTerminalAdapter(config)

    // Step 2: Ensure window is running and active
    await ensureWindow(adapter, options.terminalPath)

    // Step 3: Resolve or create project tab
    const tabResolution = await resolveTab(adapter, options.projectPath)

    // Step 4: Build layout if this is a new tab
    let splitCount = 0

    if (tabResolution.isNew) {
      // Step 4a: Build layout by replaying split actions
      const splitActions = buildSplitSequence(config.layout)
      splitCount = splitActions.length

      for (const action of splitActions) {
        await adapter.splitPane(action.direction, {
          workingDirectory: action.workingDirectory ?? options.projectPath,
        })
      }

      // Step 4b: Inject commands into all panes (only for new tabs)
      // Tab title was already set via initial input in createTab().
      await injectCommands({
        adapter,
        layout: config.layout,
      })
    }

    return ok({
      config,
      tabResolution,
      splitCount,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown sync error'
    throw new Error(`Workspace sync failed: ${message}`)
  }
}
