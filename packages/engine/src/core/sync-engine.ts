/**
 * Sync Engine - main orchestration flow
 *
 * Coordinates the full lifecycle of a workspace sync operation:
 *   loadConfig -> createTerminalAdapter -> ensureWindow ->
 *   resolveTab -> (if new tab: buildLayout) -> injectCommands
 */

import { loadConfig } from '../config/loader.js'
import { defaultConfig } from '../config/defaults.js'
import { ok, type Result } from '../types/result.js'
import type { ProjectConfig, TerminalAdapter } from '../types/index.js'
import { ghosttyAdapter } from '../adapters/terminal/ghostty-adapter.js'
import { ensureWindow } from './window-manager.js'
import { resolveTab, type TabResolution } from './tab-manager.js'
import { buildSplitSequence } from './layout-builder.js'
import { injectCommands } from './command-injector.js'

export interface SyncOptions {
  readonly projectPath: string
  readonly configFileName?: string
}

export interface SyncResult {
  readonly config: ProjectConfig
  readonly tabResolution: TabResolution
  readonly splitCount: number
}

/**
 * Create a terminal adapter based on the configured terminal type.
 *
 * Factory pattern -- currently only Ghostty is supported.
 * Future terminal types (iTerm2, WezTerm, etc.) can be added here.
 */
export function createTerminalAdapter(config: ProjectConfig): TerminalAdapter {
  switch (config.terminal) {
    case 'ghostty':
      return ghosttyAdapter
    default:
      throw new Error(`Unsupported terminal type: ${config.terminal as string}`)
  }
}

/**
 * Execute the full workspace sync flow.
 *
 * 1. Load and validate configuration from the project directory.
 * 2. Create the appropriate terminal adapter.
 * 3. Ensure the terminal window exists and is active.
 * 4. Resolve (or create) the project's tab.
 * 5. If the tab is new, build the layout by replaying split actions.
 * 6. Inject `cd` and startup commands into all panes.
 */
export async function sync(options: SyncOptions): Promise<Result<SyncResult>> {
  // Step 1: Load configuration
  const configResult = await loadConfig(options.projectPath, {
    configFileName: options.configFileName,
  })

  const config = configResult.ok
    ? configResult.value
    : defaultConfig

  try {
    // Step 2: Create terminal adapter
    const adapter = createTerminalAdapter(config)

    // Step 3: Ensure window is running and active
    await ensureWindow(adapter)

    // Step 4: Resolve or create project tab
    const tabResolution = await resolveTab(adapter, options.projectPath)

    // Step 5: Build layout if this is a new tab
    let splitCount = 0

    if (tabResolution.isNew) {
      const splitActions = buildSplitSequence(config.layout)
      splitCount = splitActions.length

      for (const action of splitActions) {
        await adapter.splitPane(action.direction, {
          workingDirectory: action.workingDirectory ?? options.projectPath,
        })
      }
    }

    // Step 6: Inject commands into all panes
    await injectCommands({
      adapter,
      layout: config.layout,
      projectPath: options.projectPath,
    })

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
