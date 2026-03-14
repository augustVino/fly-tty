/**
 * IDE-TUI Bridge VS Code / Cursor Extension
 *
 * Entry point for the extension. Registers the `ideTuiBridge.openProject` command
 * and manages the lifecycle of extension resources (OutputChannel, command disposables).
 */

import * as vscode from 'vscode'
import {
  createOutputChannel,
  handleOpenProject,
} from './command-handler.js'

const COMMAND_ID = 'ideTuiBridge.openProject'

/**
 * Extension activation lifecycle.
 *
 * Called when the extension is first activated (e.g., command invoked).
 * Registers the openProject command and creates the OutputChannel.
 */
export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = createOutputChannel()
  context.subscriptions.push(outputChannel)

  const commandDisposable = vscode.commands.registerCommand(
    COMMAND_ID,
    async () => {
      await handleOpenProject(context, outputChannel)
    },
  )

  context.subscriptions.push(commandDisposable)
}

/**
 * Extension deactivation lifecycle.
 *
 * Called when the extension is deactivated. All resources pushed to
 * context.subscriptions are automatically disposed by VS Code.
 */
export function deactivate(): void {
  // Disposal of OutputChannel and command registrations is handled
  // automatically via context.subscriptions.
}
