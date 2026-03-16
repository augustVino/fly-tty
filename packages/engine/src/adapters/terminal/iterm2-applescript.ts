/**
 * Low-level AppleScript execution layer for iTerm2 terminal.
 *
 * Each function wraps a specific iTerm2 AppleScript command using execa.
 * Uses iTerm2's AppleScript dictionary for window/tab/session management.
 *
 * Key patterns:
 * - Object model: App -> Window -> Tab -> Session
 * - `write text "..."` automatically appends a newline
 * - `write text "..." newline NO` sends text without newline
 * - `split horizontally/vertically with default profile` creates new panes
 * - Session `name` property serves as tab/pane title
 */

import { execa } from 'execa'

/** Split direction as understood by iTerm2 */
export type ITerm2SplitDirection = 'horizontally' | 'vertically'

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

/** Activate (bring to front) the iTerm2 application */
export async function activateIterm2(): Promise<string> {
  return runAppleScript('tell application "iTerm" to activate')
}

/** Create a new iTerm2 window with default profile */
export async function createWindow(): Promise<string> {
  return runAppleScript(
    'tell application "iTerm" to create window with default profile'
  )
}

/** Create a new tab in the front iTerm2 window */
export async function createTab(): Promise<string> {
  return runAppleScript(
    'tell application "iTerm" to tell current window to create tab with default profile'
  )
}

/**
 * Split the current session in the given direction.
 * After split, the new session is automatically focused.
 */
export async function splitPane(
  direction: ITerm2SplitDirection,
): Promise<string> {
  return runAppleScript(
    `tell application "iTerm" to tell current session of current tab of current window to split ${direction} with default profile`
  )
}

/**
 * Send text to the current session with automatic newline.
 * iTerm2's `write text` appends a carriage return automatically.
 */
export async function writeText(text: string): Promise<string> {
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return runAppleScript(
    `tell application "iTerm" to tell current session of current tab of current window to write text "${escaped}"`
  )
}

/**
 * Send text to the current session without appending a newline.
 */
export async function writeTextNoNewline(text: string): Promise<string> {
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return runAppleScript(
    `tell application "iTerm" to tell current session of current tab of current window to write text "${escaped}" newline NO`
  )
}

/**
 * Select a specific tab by 1-based index.
 */
export async function selectTab(tabIndex: number): Promise<string> {
  return runAppleScript(
    `tell application "iTerm" to tell tab ${tabIndex} of current window to select`
  )
}

/**
 * Get tab info for all tabs in the front window.
 * Returns an array of { id, title } objects.
 *
 * Checks session name first, then falls back to the
 * `user.workspaceProjectPath` variable (immune to shell escape sequences).
 *
 * Uses newline + tab delimited output since session name
 * is unlikely to contain these characters.
 */
export async function getTabInfo(): Promise<readonly { readonly id: number; readonly title: string }[]> {
  const raw = await runAppleScript(
    'tell application "iTerm"\n' +
    '  set output to ""\n' +
    '  set tabCount to count of tabs of front window\n' +
    '  repeat with i from 1 to tabCount\n' +
    '    set foundName to ""\n' +
    '    repeat with s in sessions of tab i of front window\n' +
    '      if name of s starts with "[WorkspaceSync]" then\n' +
    '        set foundName to name of s\n' +
    '        exit repeat\n' +
    '      end if\n' +
    '      if foundName is "" then\n' +
    '        try\n' +
    '          tell s\n' +
    '            variable "user.workspaceProjectPath"\n' +
    '          end tell\n' +
    '          set foundName to name of s\n' +
    '          exit repeat\n' +
    '        on error\n' +
    '        end try\n' +
    '      end if\n' +
    '    end repeat\n' +
    '    set output to output & i & "\\t" & foundName & "\\n"\n' +
    '  end repeat\n' +
    '  return output\n' +
    'end tell'
  )

  return raw
    .trim()
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [idStr, ...titleParts] = line.split('\t')
      return {
        id: parseInt(idStr, 10),
        title: titleParts.join('\t'),
      }
    })
}

/**
 * Set a user variable on the current session.
 *
 * iTerm2 user variables persist for the lifetime of the session
 * and are NOT affected by shell escape sequences, making them
 * reliable for storing workspace metadata.
 *
 * Note: iTerm2 requires user-defined variable names to start with "user."
 * This function auto-prepends the prefix if not already present.
 * Setting syntax: `set variable named "user.name" to "value"`
 */
export async function setSessionVar(
  varName: string,
  value: string,
): Promise<string> {
  const prefixedName = varName.startsWith('user.') ? varName : `user.${varName}`
  const escapedName = prefixedName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const escapedValue = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return runAppleScript(
    `tell application "iTerm"\n` +
    `  tell current session of current tab of current window\n` +
    `    set variable named "${escapedName}" to "${escapedValue}"\n` +
    `  end tell\n` +
    `end tell`
  )
}

/**
 * Get project paths stored as user variables for each tab.
 *
 * Returns an array of { id, projectPath } where id is the 1-based tab index.
 * Tabs without the variable are omitted from the result.
 */
export async function getTabProjectPaths(): Promise<
  readonly { readonly id: number; readonly projectPath: string }[]
> {
  const raw = await runAppleScript(
    'tell application "iTerm"\n' +
    '  set output to ""\n' +
    '  set tabCount to count of tabs of front window\n' +
    '  repeat with i from 1 to tabCount\n' +
    '    set foundPath to ""\n' +
    '    repeat with s in sessions of tab i of front window\n' +
    '      try\n' +
    '        tell s\n' +
    '          set foundPath to variable "user.workspaceProjectPath"\n' +
    '        end tell\n' +
    '        exit repeat\n' +
    '      on error\n' +
    '      end try\n' +
    '    end repeat\n' +
    '    if foundPath is not "" then\n' +
    '      set output to output & i & "\\t" & foundPath & "\\n"\n' +
    '    end if\n' +
    '  end repeat\n' +
    '  return output\n' +
    'end tell'
  )

  return raw
    .trim()
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [idStr, ...pathParts] = line.split('\t')
      return {
        id: parseInt(idStr, 10),
        projectPath: pathParts.join('\t'),
      }
    })
}

/**
 * Get all session unique ids in the current tab.
 */
export async function getSessionIds(): Promise<string[]> {
  const raw = await runAppleScript(
    'tell application "iTerm" to id of every session of current tab of current window'
  )

  return raw
    .replace(/^\{/, '')
    .replace(/\}$/, '')
    .split(', ')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Focus a specific session by its unique id.
 */
export async function focusSessionById(sessionId: string): Promise<string> {
  return runAppleScript(
    `tell application "iTerm"\n` +
    `  tell current tab of current window\n` +
    `    select session id "${sessionId}"\n` +
    `  end tell\n` +
    `end tell`
  )
}

/**
 * Get the name of the current session.
 */
export async function getSessionName(): Promise<string> {
  return runAppleScript(
    'tell application "iTerm" to name of current session of current tab of current window'
  )
}

/**
 * Set the name of the current session.
 */
export async function setSessionName(name: string): Promise<string> {
  const escaped = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return runAppleScript(
    `tell application "iTerm" to tell current session of current tab of current window to set name to "${escaped}"`
  )
}

/**
 * Get working directories for each tab in the front window.
 * Returns an array of { id, cwd } where id is the 1-based tab index
 * and cwd is the current directory of the first session in that tab.
 *
 * iTerm2 sessions have no "current directory" AppleScript property.
 * Strategy: get each session's tty device path, then use lsof to find
 * the shell process PID and its working directory.
 */
export async function getTabWorkingDirectories(): Promise<
  readonly { readonly id: number; readonly cwd: string }[]
> {
  // Step 1: Collect tty device paths for each tab's first session
  const ttyRaw = await runAppleScript(
    'tell application "iTerm"\n' +
    '  set output to ""\n' +
    '  set tabCount to count of tabs of front window\n' +
    '  repeat with i from 1 to tabCount\n' +
    '    set firstSession to item 1 of sessions of tab i of front window\n' +
    '    set theTty to ""\n' +
    '    try\n' +
    '      tell firstSession\n' +
    '        set theTty to tty\n' +
    '      end tell\n' +
    '    end try\n' +
    '    set output to output & i & "\\t" & theTty & "\\n"\n' +
    '  end repeat\n' +
    '  return output\n' +
    'end tell'
  )

  // Step 2: Resolve each tty to a working directory via lsof
  const ttyEntries = ttyRaw
    .trim()
    .split('\n')
    .filter((line) => line.trim().length > 0)

  const results: { readonly id: number; readonly cwd: string }[] = []

  for (const entry of ttyEntries) {
    const [idStr, ...ttyParts] = entry.split('\t')
    const tty = ttyParts.join('\t').trim()
    const id = parseInt(idStr, 10)

    if (!tty || tty === '/dev/null') continue

    try {
      const { stdout } = await execa(
        'sh',
        [
          '-c',
          `pid=$(lsof -t '${tty}' 2>/dev/null | head -1) && lsof -F n -d cwd -p "$pid" 2>/dev/null | tail -1 | cut -c2-`,
        ],
        { timeout: 5000 },
      )
      const cwd = stdout.trim()
      if (cwd) {
        results.push({ id, cwd })
      }
    } catch {
      // Silently skip tabs where lsof fails (e.g. session not yet initialized)
    }
  }

  return results
}
