/**
 * Low-level AppleScript execution layer for Ghostty terminal.
 *
 * Each function wraps a specific Ghostty AppleScript command using execa.
 * Uses Ghostty's actual AppleScript dictionary (sdef) commands.
 *
 * Key patterns:
 * - `new tab` requires `in front window` parameter
 * - `split` uses `perform action "new_split:<direction>"` on a terminal
 * - Pane navigation uses terminal UUID focus
 * - Text input uses `input text` with optional `to` terminal target
 */

import { execa } from 'execa'

/** Split direction as understood by Ghostty actions */
export type GhosttySplitDirection = 'down' | 'right'

/** Result of running an AppleScript command */
export interface AppleScriptResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

/**
 * Execute an AppleScript string via osascript.
 * Returns the raw stdout string on success, throws on failure.
 */
async function runAppleScript(script: string): Promise<string> {
  const result = await execa('osascript', ['-e', script], {
    timeout: 10_000,
    reject: true,
  })
  return result.stdout
}

/** Activate (bring to front) the Ghostty application */
export async function activateGhostty(): Promise<string> {
  return runAppleScript('tell application "Ghostty" to activate')
}

/**
 * Create a new Ghostty window.
 * @param workingDirectory - Optional working directory for the new window
 */
export async function newWindow(workingDirectory?: string): Promise<string> {
  if (workingDirectory) {
    return runAppleScript(
      `tell application "Ghostty" to new window with properties {working directory:"${workingDirectory}"}`
    )
  }
  return runAppleScript('tell application "Ghostty" to new window')
}

/**
 * Create a new tab in the front Ghostty window.
 *
 * When `workingDirectory` is provided, the new tab's terminal opens directly
 * in that directory — no `cd` command needed afterward.
 *
 * Ghostty's sdef defines `surface configuration` as a record-type (not a class),
 * so `with properties` is not valid. Must create it with `new surface configuration`
 * then set properties individually.
 */
export async function newTab(workingDirectory?: string): Promise<string> {
  if (workingDirectory) {
    const escaped = workingDirectory.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return runAppleScript(
      `tell application "Ghostty"\n  set cfg to new surface configuration\n  set initial working directory of cfg to "${escaped}"\n  new tab in front window with configuration cfg\nend tell`
    )
  }
  return runAppleScript('tell application "Ghostty" to make new tab in front window')
}

/**
 * Split the currently focused terminal in the given direction.
 *
 * When `workingDirectory` is provided, the new split pane opens directly
 * in that directory — no `cd` command needed afterward.
 *
 * Uses Ghostty's `split` command with `surface configuration` record.
 * After the split, the newly created terminal is automatically focused.
 */
export async function splitPane(
  direction: GhosttySplitDirection,
  workingDirectory?: string,
): Promise<string> {
  if (workingDirectory) {
    const escaped = workingDirectory.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return runAppleScript(
      `tell application "Ghostty"\n  set cfg to new surface configuration\n  set initial working directory of cfg to "${escaped}"\n  split (focused terminal of selected tab of front window) direction ${direction} with configuration cfg\nend tell`
    )
  }
  const action = `new_split:${direction}`
  return runAppleScript(
    `tell application "Ghostty" to perform action "${action}" on focused terminal of selected tab of front window`
  )
}

/**
 * Send text input to the focused terminal in the front window.
 *
 * Ghostty supports `input text` as a direct command with optional `to` parameter.
 * NOTE: `input text` injects text via the paste path (`printString`), not the
 * keyboard input path. Newlines (`\n`) only move the cursor — they do NOT send
 * a carriage return (`\r`) to the shell. Use `sendKey("enter")` to execute.
 */
export async function inputText(text: string): Promise<string> {
  // Escape double quotes and backslashes for AppleScript string literal
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return runAppleScript(`tell application "Ghostty" to input text "${escaped}" to focused terminal of selected tab of front window`)
}

/**
 * Send a keyboard key event to the focused terminal in the front window.
 *
 * Unlike `input text` (which goes through the paste/print path), `send key`
 * simulates actual keyboard events through `key_encode.zig`, which writes
 * proper control characters to the PTY (e.g. `\r` for Enter).
 *
 * Common key names: "enter", "space", "tab", "backspace",
 * "arrowUp", "arrowDown", "arrowLeft", "arrowRight", "a"-"z", "f1"-"f20"
 */
export async function sendKey(keyName: string): Promise<string> {
  return runAppleScript(
    `tell application "Ghostty" to send key "${keyName}" to focused terminal of selected tab of front window`
  )
}

/**
 * Select a specific tab by 1-based index.
 *
 * Uses `perform action "goto_tab:N"` since Ghostty's `select tab` command
 * is defined on the tab class but fails when called from the application level.
 */
export async function selectTab(tabIndex: number): Promise<string> {
  return runAppleScript(
    `tell application "Ghostty" to perform action "goto_tab:${tabIndex}" on focused terminal of selected tab of front window`
  )
}

/**
 * Get titles of all tabs in the front window.
 * Returns an array of tab title strings.
 */
export async function getTabTitles(): Promise<string[]> {
  const raw = await runAppleScript(
    'tell application "Ghostty" to name of every tab of front window'
  )
  // AppleScript returns comma-separated list; handle potential line breaks
  const titles = raw
    .replace(/^\{/, '')
    .replace(/\}$/, '')
    .split(', ')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
  return [...titles]
}

/**
 * Get all terminal UUIDs in the currently selected tab.
 *
 * Returns an array of terminal UUID strings in their creation/display order.
 * These UUIDs are stable and can be used with `focusTerminalById()`.
 */
export async function getTerminalIds(): Promise<string[]> {
  const raw = await runAppleScript(
    'tell application "Ghostty" to id of every terminal of selected tab of front window'
  )
  const ids = raw
    .replace(/^\{/, '')
    .replace(/\}$/, '')
    .split(', ')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
  return [...ids]
}

/**
 * Focus a specific terminal by its UUID.
 *
 * This is the reliable way to navigate to a specific pane,
 * as pane indices may shift but UUIDs are stable.
 */
export async function focusTerminalById(terminalId: string): Promise<string> {
  return runAppleScript(
    `tell application "Ghostty" to focus terminal id "${terminalId}"`
  )
}

/**
 * Navigate to the next split pane from the current one.
 *
 * Uses `perform action "goto_split:next"` which cycles through panes.
 */
export async function gotoNextSplit(): Promise<string> {
  return runAppleScript(
    'tell application "Ghostty" to perform action "goto_split:next" on focused terminal of selected tab of front window'
  )
}

/**
 * Navigate to the previous split pane from the current one.
 */
export async function gotoPreviousSplit(): Promise<string> {
  return runAppleScript(
    'tell application "Ghostty" to perform action "goto_split:previous" on focused terminal of selected tab of front window'
  )
}
