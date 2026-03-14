/**
 * Low-level AppleScript execution layer for Ghostty terminal.
 *
 * Each function wraps a specific Ghostty AppleScript command using execa.
 * All functions are pure -- they return new data and never mutate inputs.
 */

import { execa } from 'execa'

/** Split direction as understood by Ghostty AppleScript */
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

/** Create a new tab in the current Ghostty window */
export async function newTab(): Promise<string> {
  return runAppleScript('tell application "Ghostty" to new tab')
}

/**
 * Split the current pane.
 * @param direction - 'down' for horizontal split, 'right' for vertical split
 */
export async function splitPane(direction: GhosttySplitDirection): Promise<string> {
  return runAppleScript(`tell application "Ghostty" to split ${direction}`)
}

/**
 * Send text input to Ghostty.
 * Newlines in the text are passed as literal \n characters.
 * @param text - The text to send
 */
export async function inputText(text: string): Promise<string> {
  // Escape double quotes and backslashes in the text
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return runAppleScript(`tell application "Ghostty" to input text "${escaped}"`)
}

/**
 * Select a specific tab by index (1-based).
 * @param tabIndex - The tab index to select
 */
export async function selectTab(tabIndex: number): Promise<string> {
  return runAppleScript(`tell application "Ghostty" to select tab ${tabIndex}`)
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
 * Navigate to a specific pane by index (1-based).
 * @param paneIndex - The pane index to navigate to
 */
export async function navigateToPane(paneIndex: number): Promise<string> {
  return runAppleScript(`tell application "Ghostty" to goto pane ${paneIndex}`)
}
