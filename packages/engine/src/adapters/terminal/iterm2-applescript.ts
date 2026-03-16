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
 * Select a specific tab by 1-based index in the front window.
 */
export async function selectTab(tabIndex: number): Promise<string> {
  return runAppleScript(
    `tell application "iTerm" to tell tab ${tabIndex} of current window to select`
  )
}

/**
 * Bring a specific window to the front by selecting its first tab.
 */
export async function selectWindow(windowIndex: number): Promise<string> {
  return runAppleScript(
    `tell application "iTerm"\n` +
    `  activate\n` +
    `  tell tab 1 of window ${windowIndex} to select\n` +
    `end tell`
  )
}

/**
 * Select a specific tab by 1-based index within a specific window.
 * Brings the window to front and selects the tab in one step.
 */
export async function selectTabInWindow(
  tabIndex: number,
  windowIndex: number,
): Promise<string> {
  return runAppleScript(
    `tell application "iTerm"\n` +
    `  activate\n` +
    `  tell tab ${tabIndex} of window ${windowIndex} to select\n` +
    `end tell`
  )
}

/**
 * Get tab info for all tabs across all windows.
 * Returns an array of { id, title, windowIndex } objects.
 *
 * Primary: uses `user.workspaceProjectPath` variable to construct
 * `[WorkspaceSync] <dirname>` title (immune to shell escape sequences).
 * Secondary: checks if session name starts with `[WorkspaceSync]`.
 * Fallback: uses first session's name.
 *
 * Output format: `windowIndex:tabIndex\ttitle\n`
 */
export async function getTabInfo(): Promise<readonly { readonly id: number; readonly title: string; readonly windowIndex: number }[]> {
  const raw = await runAppleScript(
    'tell application "iTerm"\n' +
    '  set output to ""\n' +
    '  set windowCount to count of windows\n' +
    '  repeat with w from 1 to windowCount\n' +
    '    set tabCount to count of tabs of window w\n' +
    '    repeat with i from 1 to tabCount\n' +
    '      set foundName to ""\n' +
    '      set sessionCount to count of sessions of tab i of window w\n' +
    '      repeat with j from 1 to sessionCount\n' +
    '        try\n' +
    '          tell session j of tab i of window w\n' +
    '            set foundPath to variable named "user.workspaceProjectPath"\n' +
    '          end tell\n' +
    '          set oldDelimiters to AppleScript\'s text item delimiters\n' +
    '          set AppleScript\'s text item delimiters to "/"\n' +
    '          set dirName to last text item of foundPath\n' +
    '          set AppleScript\'s text item delimiters to oldDelimiters\n' +
    '          set foundName to "[WorkspaceSync] " & dirName\n' +
    '          exit repeat\n' +
    '        on error\n' +
    '        end try\n' +
    '        try\n' +
    '          set sName to name of session j of tab i of window w\n' +
    '          if sName starts with "[WorkspaceSync]" then\n' +
    '            set foundName to sName\n' +
    '            exit repeat\n' +
    '          end if\n' +
    '        on error\n' +
    '        end try\n' +
    '      end repeat\n' +
    '      if foundName is "" then\n' +
    '        try\n' +
    '          set foundName to name of item 1 of sessions of tab i of window w\n' +
    '        on error\n' +
    '          set foundName to "Unknown"\n' +
    '        end try\n' +
    '      end if\n' +
    '      set output to output & w & ":" & i & "\\t" & foundName & "\\n"\n' +
    '    end repeat\n' +
    '  end repeat\n' +
    '  return output\n' +
    'end tell'
  )

  return raw
    .trim()
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [windowAndTab, ...titleParts] = line.split('\t')
      const colonIdx = windowAndTab.indexOf(':')
      const windowIndex = parseInt(windowAndTab.substring(0, colonIdx), 10)
      const id = parseInt(windowAndTab.substring(colonIdx + 1), 10)
      return {
        id,
        title: titleParts.join('\t'),
        windowIndex,
      }
    })
}

/**
 * Find a session by project path across all windows.
 * Searches every window/tab/session for the `user.workspaceProjectPath` variable.
 * Returns `{ windowIndex, tabIndex }` or null if not found.
 */
export async function findSessionByProject(
  projectPath: string,
): Promise<{ readonly windowIndex: number; readonly tabIndex: number } | null> {
  const escapedPath = projectPath
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')

  const raw = await runAppleScript(
    `tell application "iTerm"\n` +
    `  set resultStr to ""\n` +
    `  repeat with w from 1 to count of windows\n` +
    `    set tabCount to count of tabs of window w\n` +
    `    repeat with i from 1 to tabCount\n` +
    `      set sessionCount to count of sessions of tab i of window w\n` +
    `      repeat with j from 1 to sessionCount\n` +
    `        set foundPath to ""\n` +
    `        try\n` +
    `          tell session j of tab i of window w\n` +
    `            set foundPath to variable named "user.workspaceProjectPath"\n` +
    `          end tell\n` +
    `          if foundPath is "${escapedPath}" then\n` +
    `            set resultStr to (w as text) & ":" & (i as text)\n` +
    `            exit repeat\n` +
    `          end if\n` +
    `        on error\n` +
    `        end try\n` +
    `      end repeat\n` +
    `      if resultStr is not "" then exit repeat\n` +
    `    end repeat\n` +
    `    if resultStr is not "" then exit repeat\n` +
    `  end repeat\n` +
    `  return resultStr\n` +
    `end tell`
  )

  const trimmed = raw.trim()
  if (!trimmed || !trimmed.includes(':')) {
    console.error(
      '[ide-tui-bridge] findSessionByProject: no match found.',
      '\n  projectPath:', projectPath,
      '\n  AppleScript returned:', JSON.stringify(trimmed),
    )
    return null
  }

  const colonIdx = trimmed.indexOf(':')
  const windowIndex = parseInt(trimmed.substring(0, colonIdx), 10)
  const tabIndex = parseInt(trimmed.substring(colonIdx + 1), 10)

  if (Number.isNaN(windowIndex) || Number.isNaN(tabIndex)) {
    console.error(
      '[ide-tui-bridge] findSessionByProject: unexpected AppleScript output.',
      '\n  projectPath:', projectPath,
      '\n  AppleScript returned:', JSON.stringify(trimmed),
    )
    return null
  }

  return { windowIndex, tabIndex }
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
 * Get project paths stored as user variables for each tab across all windows.
 *
 * Returns an array of { id, projectPath, windowIndex } where id is the
 * 1-based tab index. Tabs without the variable are omitted from the result.
 *
 * Output format: `windowIndex:tabIndex\tprojectPath\n`
 */
export async function getTabProjectPaths(): Promise<
  readonly { readonly id: number; readonly projectPath: string; readonly windowIndex: number }[]
> {
  const raw = await runAppleScript(
    'tell application "iTerm"\n' +
    '  set output to ""\n' +
    '  set windowCount to count of windows\n' +
    '  repeat with w from 1 to windowCount\n' +
    '    set tabCount to count of tabs of window w\n' +
    '    repeat with i from 1 to tabCount\n' +
    '      set foundPath to ""\n' +
    '      set sessionCount to count of sessions of tab i of window w\n' +
    '      repeat with j from 1 to sessionCount\n' +
    '        try\n' +
    '          tell session j of tab i of window w\n' +
    '            set foundPath to variable named "user.workspaceProjectPath"\n' +
    '          end tell\n' +
    '          exit repeat\n' +
    '        on error\n' +
    '        end try\n' +
    '      end repeat\n' +
    '      if foundPath is not "" then\n' +
    '        set output to output & w & ":" & i & "\\t" & foundPath & "\\n"\n' +
    '      end if\n' +
    '    end repeat\n' +
    '  end repeat\n' +
    '  return output\n' +
    'end tell'
  )

  return raw
    .trim()
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [windowAndTab, ...pathParts] = line.split('\t')
      const colonIdx = windowAndTab.indexOf(':')
      const windowIndex = parseInt(windowAndTab.substring(0, colonIdx), 10)
      const id = parseInt(windowAndTab.substring(colonIdx + 1), 10)
      return {
        id,
        projectPath: pathParts.join('\t'),
        windowIndex,
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
 * Get working directories for each tab across all windows.
 * Returns an array of { id, cwd, windowIndex } where id is the 1-based tab index
 * and cwd is the current directory of the first session in that tab.
 *
 * iTerm2 sessions have no "current directory" AppleScript property.
 * Strategy: get each session's tty device path, then use lsof to find
 * the shell process PID and its working directory.
 *
 * Output format: `windowIndex:tabIndex\ttty\n`
 */
export async function getTabWorkingDirectories(): Promise<
  readonly { readonly id: number; readonly cwd: string; readonly windowIndex: number }[]
> {
  // Step 1: Collect tty device paths for each tab's first session
  const ttyRaw = await runAppleScript(
    'tell application "iTerm"\n' +
    '  set output to ""\n' +
    '  set windowCount to count of windows\n' +
    '  repeat with w from 1 to windowCount\n' +
    '    set tabCount to count of tabs of window w\n' +
    '    repeat with i from 1 to tabCount\n' +
    '      set firstSession to item 1 of sessions of tab i of window w\n' +
    '      set theTty to ""\n' +
    '      try\n' +
    '        tell firstSession\n' +
    '          set theTty to tty\n' +
    '        end tell\n' +
    '      end try\n' +
    '      set output to output & w & ":" & i & "\\t" & theTty & "\\n"\n' +
    '    end repeat\n' +
    '  end repeat\n' +
    '  return output\n' +
    'end tell'
  )

  // Step 2: Resolve each tty to a working directory via lsof
  const ttyEntries = ttyRaw
    .trim()
    .split('\n')
    .filter((line) => line.trim().length > 0)

  const results: { readonly id: number; readonly cwd: string; readonly windowIndex: number }[] = []

  for (const entry of ttyEntries) {
    const [windowAndTab, ...ttyParts] = entry.split('\t')
    const tty = ttyParts.join('\t').trim()
    const colonIdx = windowAndTab.indexOf(':')
    const windowIndex = parseInt(windowAndTab.substring(0, colonIdx), 10)
    const id = parseInt(windowAndTab.substring(colonIdx + 1), 10)

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
        results.push({ id, cwd, windowIndex })
      }
    } catch {
      // Silently skip tabs where lsof fails (e.g. session not yet initialized)
    }
  }

  return results
}

/**
 * Diagnostic: list all sessions with their user variables and names.
 * Returns a human-readable string for debugging tab reuse issues.
 */
export async function diagnoseSessionVariables(): Promise<string> {
  const raw = await runAppleScript(
    'tell application "iTerm"\n' +
    '  set output to ""\n' +
    '  set windowCount to count of windows\n' +
    '  set output to output & "Windows: " & windowCount & "\\n"\n' +
    '  repeat with w from 1 to windowCount\n' +
    '    set tabCount to count of tabs of window w\n' +
    '    set output to output & "  Window " & w & ": " & tabCount & " tabs\\n"\n' +
    '    repeat with i from 1 to tabCount\n' +
    '      set sessionCount to count of sessions of tab i of window w\n' +
    '      repeat with j from 1 to sessionCount\n' +
    '        set varValue to "[not set]"\n' +
    '        set sName to "[error]"\n' +
    '        try\n' +
    '          tell session j of tab i of window w\n' +
    '            set varValue to variable named "user.workspaceProjectPath"\n' +
    '          end tell\n' +
    '        on error errMsg\n' +
    '          set varValue to "[error: " & errMsg & "]"\n' +
    '        end try\n' +
    '        try\n' +
    '          set sName to name of session j of tab i of window w\n' +
    '        on error\n' +
    '          set sName to "[error]"\n' +
    '        end try\n' +
    '        set output to output & "    W" & w & "T" & i & "S" & j & ": var=" & varValue & " name=" & sName & "\\n"\n' +
    '      end repeat\n' +
    '    end repeat\n' +
    '  end repeat\n' +
    '  return output\n' +
    'end tell'
  )

  return raw
}
