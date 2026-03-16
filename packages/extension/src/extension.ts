/**
 * Fly TTY VS Code / Cursor Extension
 *
 * Entry point for the extension. Registers the `flyTty.openProject` command,
 * creates a status bar button and OutputChannel, and manages lifecycle resources.
 */

import * as vscode from 'vscode'
import {
  createOutputChannel,
  handleOpenProject,
} from './command-handler.js'

const COMMAND_ID = 'flyTty.openProject'

/**
 * Extension activation lifecycle.
 *
 * Called when the extension is first activated (e.g., command invoked).
 * Registers the openProject command, creates a status bar button,
 * and creates the OutputChannel.
 */
export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = createOutputChannel()
  context.subscriptions.push(outputChannel)

  // Register command
  const commandDisposable = vscode.commands.registerCommand(
    COMMAND_ID,
    async () => {
      await handleOpenProject(context, outputChannel)
    },
  )

  // Create status bar button (right side of status bar)
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  )
  statusBarItem.command = COMMAND_ID
  statusBarItem.text = '$(terminal) Sync'
  statusBarItem.tooltip = 'Fly TTY: Open project in terminal'
  statusBarItem.show()

  context.subscriptions.push(commandDisposable, statusBarItem)
}

/**
 * Extension deactivation lifecycle.
 *
 * Called when the extension is deactivated. All resources pushed to
 * context.subscriptions are automatically disposed by VS Code.
 */
export function deactivate(): void {
  // Disposal of OutputChannel, command registrations, and status bar
  // is handled automatically via context.subscriptions.
}
