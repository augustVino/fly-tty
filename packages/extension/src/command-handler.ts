/**
 * Command Handler for IDE-TUI Bridge Extension
 *
 * Handles the `ideTuiBridge.openProject` command:
 * 1. Validates workspace root
 * 2. Reads extension configuration
 * 3. Calls engine.sync()
 * 4. Displays results in OutputChannel
 */

import * as vscode from 'vscode'
import { sync } from '@ide-tui-bridge/engine'
import type { SyncOptions, SyncResult } from '@ide-tui-bridge/engine'

const OUTPUT_CHANNEL_NAME = 'IDE-TUI Bridge'

/**
 * Create and return the extension's OutputChannel.
 * The channel is created once and reused across invocations.
 */
export function createOutputChannel(): vscode.OutputChannel {
  return vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME)
}

/**
 * Retrieve the workspace root path from the current workspace.
 *
 * Returns null if no workspace folder is open.
 */
export function getWorkspaceRootPath(): string | null {
  const workspaceFolders = vscode.workspace.workspaceFolders
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null
  }
  return workspaceFolders[0].uri.fsPath
}

/**
 * Read extension configuration values.
 */
export function getExtensionConfig(): {
  readonly ghosttyPath: string
  readonly configFileName: string
} {
  const configuration = vscode.workspace.getConfiguration('ideTuiBridge')

  const ghosttyPath = configuration.get<string>('ghosttyPath', '/Applications/Ghostty.app')
  const configFileName = configuration.get<string>('configFileName', '.contextsync.yml')

  return Object.freeze({ ghosttyPath, configFileName })
}

/**
 * Format a SyncResult into a human-readable summary for the OutputChannel.
 */
function formatSyncResult(result: SyncResult): string {
  const { config, tabResolution, splitCount } = result
  const tabStatus = tabResolution.isNew ? 'Created new tab' : 'Reused existing tab'

  return [
    '=== Sync Complete ===',
    `Terminal:   ${config.terminal}`,
    `Tab:        ${tabStatus}`,
    `Splits:     ${splitCount}`,
    `Config:     ${config.version}`,
    '===================',
  ].join('\n')
}

/**
 * Show the OutputChannel with content and optionally reveal it.
 */
function showOutput(outputChannel: vscode.OutputChannel, content: string): void {
  outputChannel.appendLine(content)
  outputChannel.show()
}

/**
 * Handle the `ideTuiBridge.openProject` command.
 *
 * Orchestrates the full flow: validate workspace, read config, sync, display result.
 */
export async function handleOpenProject(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  // Step 1: Validate workspace
  const projectPath = getWorkspaceRootPath()
  if (!projectPath) {
    vscode.window.showErrorMessage(
      'IDE-TUI Bridge: No workspace folder is open. Please open a project folder first.',
    )
    return
  }

  // Step 2: Read configuration
  const extensionConfig = getExtensionConfig()
  const configFileName = extensionConfig.configFileName

  showOutput(outputChannel, `Starting sync for: ${projectPath}`)
  showOutput(outputChannel, `Config file: ${configFileName}`)
  showOutput(outputChannel, '')

  // Step 3: Execute sync
  const syncOptions: SyncOptions = {
    projectPath,
    configFileName,
  }

  try {
    const result = await sync(syncOptions)

    if (result.ok) {
      const summary = formatSyncResult(result.value)
      showOutput(outputChannel, summary)
      vscode.window.showInformationMessage(
        `IDE-TUI Bridge: Workspace sync completed successfully.`,
      )
    } else {
      const errorMessage =
        result.error instanceof Error ? result.error.message : String(result.error)
      showOutput(outputChannel, `Sync error: ${errorMessage}`)
      vscode.window.showErrorMessage(
        `IDE-TUI Bridge: ${errorMessage}`,
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    showOutput(outputChannel, `Sync failed: ${message}`)
    vscode.window.showErrorMessage(
      `IDE-TUI Bridge: Workspace sync failed — ${message}`,
    )
  }
}
