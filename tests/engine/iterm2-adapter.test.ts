/**
 * Tests for iTerm2 terminal adapter
 *
 * Covers:
 * - ensureRunning: iTerm2 not running -> starts it; already running -> no-op
 * - findTabByProject: matches [WorkspaceSync] prefix; no match -> null
 * - splitPane: direction mapping (down -> horizontally, right -> vertically)
 * - sendCommand: single writeText call (iTerm2 auto-appends newline)
 * - sendText: uses writeTextNoNewline
 * - navigateToPane: uses session id focus
 * - createTab: with/without workingDirectory, with/without title
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock execa before importing the adapter
// ---------------------------------------------------------------------------
vi.mock('execa', () => ({
  execa: vi.fn(),
}))

vi.mock('@fly-tty/engine/adapters/terminal/iterm2-applescript.js', () => ({
  activateIterm2: vi.fn().mockResolvedValue(''),
  createWindow: vi.fn().mockResolvedValue(''),
  createTab: vi.fn().mockResolvedValue(''),
  splitPane: vi.fn().mockResolvedValue(''),
  writeText: vi.fn().mockResolvedValue(''),
  writeTextNoNewline: vi.fn().mockResolvedValue(''),
  selectTab: vi.fn().mockResolvedValue(''),
  selectTabInWindow: vi.fn().mockResolvedValue(''),
  selectWindow: vi.fn().mockResolvedValue(''),
  getTabInfo: vi.fn().mockResolvedValue([]),
  findSessionByProject: vi.fn().mockResolvedValue(null),
  getSessionIds: vi.fn().mockResolvedValue([]),
  focusSessionById: vi.fn().mockResolvedValue(''),
  getSessionName: vi.fn().mockResolvedValue(''),
  setSessionName: vi.fn().mockResolvedValue(''),
  getTabWorkingDirectories: vi.fn().mockResolvedValue([]),
  setSessionVar: vi.fn().mockResolvedValue(''),
  getTabProjectPaths: vi.fn().mockResolvedValue([]),
}))

import { execa } from 'execa'
import { ITerm2Adapter } from '@fly-tty/engine/adapters/terminal/iterm2-adapter.js'
import * as iterm2Script from '@fly-tty/engine/adapters/terminal/iterm2-applescript.js'

const mockExeca = vi.mocked(execa)

function createAdapter(): ITerm2Adapter {
  return new ITerm2Adapter()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

// ---------------------------------------------------------------------------
// Adapter name
// ---------------------------------------------------------------------------
describe('ITerm2Adapter: name', () => {
  it('should return "iterm2"', () => {
    const adapter = createAdapter()
    expect(adapter.name).toBe('iterm2')
  })
})

// ---------------------------------------------------------------------------
// ensureRunning
// ---------------------------------------------------------------------------
describe('ITerm2Adapter: ensureRunning', () => {
  it('should not start iTerm2 if already running but still check for windows', async () => {
    // pgrep: running
    mockExeca.mockResolvedValueOnce({
      stdout: '12345',
      stderr: '',
      exitCode: 0,
    } as Awaited<ReturnType<typeof execa>>)
    // hasWindow: 1 window
    mockExeca.mockResolvedValueOnce({
      stdout: '1',
      stderr: '',
      exitCode: 0,
    } as Awaited<ReturnType<typeof execa>>)

    const adapter = createAdapter()
    await adapter.ensureRunning()

    expect(mockExeca).toHaveBeenCalledWith('pgrep', ['-x', 'iTerm2'])
    expect(mockExeca).not.toHaveBeenCalledWith('open', expect.anything())
  })

  it('should use custom terminalPath when provided', async () => {
    // pgrep fails -> not running
    mockExeca.mockRejectedValueOnce(new Error('not found'))
    // open -a with custom path
    mockExeca.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
    } as Awaited<ReturnType<typeof execa>>)
    // hasWindow: 1 window
    mockExeca.mockResolvedValueOnce({
      stdout: '1',
      stderr: '',
      exitCode: 0,
    } as Awaited<ReturnType<typeof execa>>)

    const adapter = createAdapter()
    await adapter.ensureRunning({ terminalPath: '/Applications/CustomApp.app' })

    expect(mockExeca).toHaveBeenCalledWith('open', ['-a', '/Applications/CustomApp.app'])
  })

  it('should start iTerm2 and ensure window exists if not running', async () => {
    // pgrep fails -> not running
    mockExeca.mockRejectedValueOnce(new Error('not found'))
    // open -a iTerm
    mockExeca.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
    } as Awaited<ReturnType<typeof execa>>)
    // hasWindow: 1 window
    mockExeca.mockResolvedValueOnce({
      stdout: '1',
      stderr: '',
      exitCode: 0,
    } as Awaited<ReturnType<typeof execa>>)

    const adapter = createAdapter()
    await adapter.ensureRunning()

    expect(mockExeca).toHaveBeenCalledWith('pgrep', ['-x', 'iTerm2'])
    expect(mockExeca).toHaveBeenCalledWith('open', ['-a', 'iTerm'])
    expect(mockExeca).toHaveBeenCalledWith(
      'osascript',
      expect.arrayContaining([
        '-e',
        expect.stringContaining('count of windows'),
      ]),
    )
  })

  it('should poll for window after starting iTerm2', async () => {
    // pgrep fails -> not running
    mockExeca.mockRejectedValueOnce(new Error('not found'))
    // open -a iTerm
    mockExeca.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
    } as Awaited<ReturnType<typeof execa>>)
    // First poll: 0 windows
    mockExeca.mockResolvedValueOnce({
      stdout: '0',
      stderr: '',
      exitCode: 0,
    } as Awaited<ReturnType<typeof execa>>)
    // Second poll: 1 window
    mockExeca.mockResolvedValueOnce({
      stdout: '1',
      stderr: '',
      exitCode: 0,
    } as Awaited<ReturnType<typeof execa>>)

    const adapter = createAdapter()
    const promise = adapter.ensureRunning()

    // Advance past the 500ms wait between polls
    await vi.advanceTimersByTimeAsync(500)

    await promise
  })

  it('should create window when process is running but has no windows', async () => {
    // pgrep: running
    mockExeca.mockResolvedValueOnce({
      stdout: '12345',
      stderr: '',
      exitCode: 0,
    } as Awaited<ReturnType<typeof execa>>)

    // All 20 hasWindow polls return 0
    for (let i = 0; i < 20; i++) {
      mockExeca.mockResolvedValueOnce({
        stdout: '0',
        stderr: '',
        exitCode: 0,
      } as Awaited<ReturnType<typeof execa>>)
    }

    // createWindow via iterm2Script
    vi.mocked(iterm2Script.createWindow).mockResolvedValueOnce('')

    const adapter = createAdapter()
    const promise = adapter.ensureRunning()

    // Advance all timers (20 polls * 500ms = 10000ms)
    await vi.advanceTimersByTimeAsync(10_000)

    await promise

    expect(mockExeca).toHaveBeenCalledWith('pgrep', ['-x', 'iTerm2'])
    expect(mockExeca).not.toHaveBeenCalledWith('open', expect.anything())
    expect(iterm2Script.createWindow).toHaveBeenCalledOnce()
  })

  it('should create window when newly started iTerm2 has no windows after timeout', async () => {
    // pgrep fails -> not running
    mockExeca.mockRejectedValueOnce(new Error('not found'))
    // open -a iTerm
    mockExeca.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
    } as Awaited<ReturnType<typeof execa>>)

    // All 20 hasWindow polls return 0
    for (let i = 0; i < 20; i++) {
      mockExeca.mockResolvedValueOnce({
        stdout: '0',
        stderr: '',
        exitCode: 0,
      } as Awaited<ReturnType<typeof execa>>)
    }

    // createWindow via iterm2Script
    vi.mocked(iterm2Script.createWindow).mockResolvedValueOnce('')

    const adapter = createAdapter()
    const promise = adapter.ensureRunning()

    await vi.advanceTimersByTimeAsync(10_000)

    await promise

    expect(mockExeca).toHaveBeenCalledWith('open', ['-a', 'iTerm'])
    expect(iterm2Script.createWindow).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// activateWindow
// ---------------------------------------------------------------------------
describe('ITerm2Adapter: activateWindow', () => {
  it('should call activateIterm2', async () => {
    const adapter = createAdapter()
    await adapter.activateWindow()

    expect(iterm2Script.activateIterm2).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// listTabs
// ---------------------------------------------------------------------------
describe('ITerm2Adapter: listTabs', () => {
  it('should return empty array when no tabs exist', async () => {
    vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([])

    const adapter = createAdapter()
    const tabs = await adapter.listTabs()
    expect(tabs).toEqual([])
  })

  it('should map tab info to TerminalTab objects with windowId from windowIndex', async () => {
    vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
      { id: 1, title: '[WorkspaceSync] my-project', windowIndex: 1 },
      { id: 2, title: 'Untitled', windowIndex: 1 },
      { id: 1, title: '[WorkspaceSync] other-project', windowIndex: 2 },
    ])

    const adapter = createAdapter()
    const tabs = await adapter.listTabs()

    expect(tabs).toHaveLength(3)
    expect(tabs[0]).toEqual({
      id: '1',
      title: '[WorkspaceSync] my-project',
      windowId: '1',
    })
    expect(tabs[1]).toEqual({
      id: '2',
      title: 'Untitled',
      windowId: '1',
    })
    expect(tabs[2]).toEqual({
      id: '1',
      title: '[WorkspaceSync] other-project',
      windowId: '2',
    })
  })
})

// ---------------------------------------------------------------------------
// findTabByProject
// ---------------------------------------------------------------------------
describe('ITerm2Adapter: findTabByProject', () => {
  it('should find tab via cross-window user variable search (primary)', async () => {
    vi.mocked(iterm2Script.findSessionByProject).mockResolvedValueOnce({
      windowIndex: 2,
      tabIndex: 3,
    })

    const adapter = createAdapter()
    const tab = await adapter.findTabByProject('/Users/dev/my-project')

    expect(tab).not.toBeNull()
    expect(tab?.id).toBe('3')
    expect(tab?.title).toBe('[WorkspaceSync] my-project')
    expect(tab?.windowId).toBe('2')
    expect(iterm2Script.findSessionByProject).toHaveBeenCalledWith(
      '/Users/dev/my-project',
    )
  })

  it('should fall back to title match when user variable not found', async () => {
    vi.mocked(iterm2Script.findSessionByProject).mockResolvedValueOnce(null)
    vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
      { id: 1, title: 'Default', windowIndex: 1 },
      { id: 2, title: '[WorkspaceSync] my-project', windowIndex: 1 },
      { id: 3, title: 'Another', windowIndex: 1 },
    ])

    const adapter = createAdapter()
    const tab = await adapter.findTabByProject('/Users/dev/my-project')

    expect(tab).not.toBeNull()
    expect(tab?.title).toBe('[WorkspaceSync] my-project')
    expect(tab?.id).toBe('2')
  })

  it('should return null when no matching tab exists across any method', async () => {
    vi.mocked(iterm2Script.findSessionByProject).mockResolvedValueOnce(null)
    vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
      { id: 1, title: 'Default', windowIndex: 1 },
      { id: 2, title: 'Another', windowIndex: 1 },
    ])

    const adapter = createAdapter()
    const tab = await adapter.findTabByProject('/Users/dev/my-project')

    expect(tab).toBeNull()
  })

  it('should handle trailing slash in project path', async () => {
    vi.mocked(iterm2Script.findSessionByProject).mockResolvedValueOnce({
      windowIndex: 1,
      tabIndex: 1,
    })

    const adapter = createAdapter()
    const tab = await adapter.findTabByProject('/Users/dev/my-project/')

    expect(tab).not.toBeNull()
    expect(tab?.title).toBe('[WorkspaceSync] my-project')
  })

  it('should not match partial directory names', async () => {
    vi.mocked(iterm2Script.findSessionByProject).mockResolvedValueOnce(null)
    vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
      { id: 1, title: '[WorkspaceSync] project', windowIndex: 1 },
      { id: 2, title: '[WorkspaceSync] project-backup', windowIndex: 1 },
    ])

    const adapter = createAdapter()
    const tab = await adapter.findTabByProject('/Users/dev/project')

    expect(tab).not.toBeNull()
    expect(tab?.id).toBe('1')
  })

  it('should fall back to working directory match when title is overwritten', async () => {
    vi.mocked(iterm2Script.findSessionByProject).mockResolvedValueOnce(null)
    // Session name was overwritten by shell prompt
    vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
      { id: 1, title: 'dev@host:~', windowIndex: 1 },
      { id: 2, title: '[WorkspaceSync] other-project', windowIndex: 1 },
    ])
    vi.mocked(iterm2Script.getTabWorkingDirectories).mockResolvedValueOnce([
      { id: 1, cwd: '/Users/dev/my-project', windowIndex: 1 },
      { id: 2, cwd: '/Users/dev/other-project', windowIndex: 1 },
    ])

    const adapter = createAdapter()
    const tab = await adapter.findTabByProject('/Users/dev/my-project')

    expect(tab).not.toBeNull()
    expect(tab?.id).toBe('1')
    expect(tab?.title).toBe('dev@host:~')
  })

  it('should return null when no title or cwd match exists', async () => {
    vi.mocked(iterm2Script.findSessionByProject).mockResolvedValueOnce(null)
    vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
      { id: 1, title: 'dev@host:~', windowIndex: 1 },
      { id: 2, title: 'bash', windowIndex: 1 },
    ])
    vi.mocked(iterm2Script.getTabWorkingDirectories).mockResolvedValueOnce([
      { id: 1, cwd: '/Users/dev/other-project', windowIndex: 1 },
      { id: 2, cwd: '/tmp', windowIndex: 1 },
    ])

    const adapter = createAdapter()
    const tab = await adapter.findTabByProject('/Users/dev/my-project')

    expect(tab).toBeNull()
  })

  it('should match by directory name in title as tertiary fallback', async () => {
    vi.mocked(iterm2Script.findSessionByProject).mockResolvedValueOnce(null)
    // Title was overwritten but still contains directory name
    vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
      { id: 1, title: 'dev@host:~/my-project', windowIndex: 1 },
      { id: 2, title: 'dev@host:~/other-project', windowIndex: 1 },
    ])

    const adapter = createAdapter()
    const tab = await adapter.findTabByProject('/Users/dev/my-project')

    expect(tab).not.toBeNull()
    expect(tab?.id).toBe('1')
  })

  it('should not use directory name fallback when multiple tabs match', async () => {
    vi.mocked(iterm2Script.findSessionByProject).mockResolvedValueOnce(null)
    // Two tabs contain "project" - ambiguous, skip to next fallback
    vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
      { id: 1, title: 'dev@host:~/project', windowIndex: 1 },
      { id: 2, title: 'dev@host:~/project-backup', windowIndex: 1 },
    ])
    vi.mocked(iterm2Script.getTabWorkingDirectories).mockResolvedValueOnce([
      { id: 1, cwd: '/Users/dev/project', windowIndex: 1 },
      { id: 2, cwd: '/Users/dev/project-backup', windowIndex: 1 },
    ])

    const adapter = createAdapter()
    const tab = await adapter.findTabByProject('/Users/dev/project')

    // Should find via cwd fallback (last resort), not ambiguous dir match
    expect(tab).not.toBeNull()
    expect(tab?.id).toBe('1')
  })

  it('should match cwd across different windows correctly', async () => {
    vi.mocked(iterm2Script.findSessionByProject).mockResolvedValueOnce(null)
    vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
      { id: 1, title: 'dev@host:~', windowIndex: 1 },
      { id: 2, title: 'bash', windowIndex: 2 },
    ])
    vi.mocked(iterm2Script.getTabWorkingDirectories).mockResolvedValueOnce([
      { id: 1, cwd: '/Users/dev/other-project', windowIndex: 1 },
      { id: 2, cwd: '/Users/dev/my-project', windowIndex: 2 },
    ])

    const adapter = createAdapter()
    const tab = await adapter.findTabByProject('/Users/dev/my-project')

    expect(tab).not.toBeNull()
    expect(tab?.id).toBe('2')
    expect(tab?.windowId).toBe('2')
  })
})

// ---------------------------------------------------------------------------
// createTab
// ---------------------------------------------------------------------------
describe('ITerm2Adapter: createTab', () => {
  it('should create a new tab and return the last one', async () => {
    vi.mocked(iterm2Script.createTab).mockResolvedValueOnce('')
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1', 'sid-2'])
    vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
      { id: 1, title: 'First tab', windowIndex: 1 },
      { id: 2, title: 'New tab', windowIndex: 1 },
    ])

    const adapter = createAdapter()
    const tab = await adapter.createTab()

    // Advance past SETTLE_DELAY_MS (500ms)
    await vi.advanceTimersByTimeAsync(500)

    expect(tab).toEqual({ id: '2', title: 'New tab', windowId: '1' })
    expect(iterm2Script.createTab).toHaveBeenCalledOnce()
    expect(iterm2Script.getSessionIds).toHaveBeenCalledOnce()
  })

  it('should create tab with custom title', async () => {
    vi.mocked(iterm2Script.createTab).mockResolvedValueOnce('')
    vi.mocked(iterm2Script.setSessionName).mockResolvedValueOnce('')
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1'])
    vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
      { id: 1, title: 'First tab', windowIndex: 1 },
      { id: 2, title: 'New tab', windowIndex: 1 },
    ])

    const adapter = createAdapter()
    const tab = await adapter.createTab({
      title: '[WorkspaceSync] my-project',
    })

    await vi.advanceTimersByTimeAsync(500)

    expect(tab).toEqual({
      id: '2',
      title: '[WorkspaceSync] my-project',
      windowId: '1',
    })
    expect(iterm2Script.setSessionName).toHaveBeenCalledWith('[WorkspaceSync] my-project')
  })

  it('should create tab with working directory using cd command', async () => {
    vi.mocked(iterm2Script.createTab).mockResolvedValueOnce('')
    vi.mocked(iterm2Script.writeText).mockResolvedValueOnce('')
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1'])
    vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
      { id: 1, title: 'First tab', windowIndex: 1 },
      { id: 2, title: 'New tab', windowIndex: 1 },
    ])

    const adapter = createAdapter()
    await adapter.createTab({
      title: '[WorkspaceSync] test-project',
      workingDirectory: '/Users/dev/test-project',
    })

    // Advance past two SETTLE_DELAY_MS calls (create + cd)
    await vi.advanceTimersByTimeAsync(1000)

    expect(iterm2Script.createTab).toHaveBeenCalledOnce()
    expect(iterm2Script.writeText).toHaveBeenCalledWith('cd "/Users/dev/test-project"')
    expect(iterm2Script.setSessionName).toHaveBeenCalledWith('[WorkspaceSync] test-project')
  })

  it('should not send cd when no working directory', async () => {
    vi.mocked(iterm2Script.createTab).mockResolvedValueOnce('')
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1'])
    vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
      { id: 1, title: 'New tab', windowIndex: 1 },
    ])

    const adapter = createAdapter()
    await adapter.createTab()

    await vi.advanceTimersByTimeAsync(500)

    expect(iterm2Script.writeText).not.toHaveBeenCalled()
  })

  it('should throw error when no tabs after creation', async () => {
    vi.mocked(iterm2Script.createTab).mockResolvedValueOnce('')
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1'])
    vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([])

    const adapter = createAdapter()
    await expect(adapter.createTab()).rejects.toThrow('Failed to create tab')
  })

  it('should set user variable for working directory when creating tab', async () => {
    vi.mocked(iterm2Script.createTab).mockResolvedValueOnce('')
    vi.mocked(iterm2Script.writeText).mockResolvedValueOnce('')
    vi.mocked(iterm2Script.setSessionVar).mockResolvedValueOnce('')
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1'])
    vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
      { id: 1, title: 'First tab', windowIndex: 1 },
      { id: 2, title: 'New tab', windowIndex: 1 },
    ])

    const adapter = createAdapter()
    await adapter.createTab({
      title: '[WorkspaceSync] test-project',
      workingDirectory: '/Users/dev/test-project',
    })

    await vi.advanceTimersByTimeAsync(1000)

    expect(iterm2Script.setSessionVar).toHaveBeenCalledWith(
      'workspaceProjectPath',
      '/Users/dev/test-project',
    )
  })

  it('should not set user variable when no working directory', async () => {
    vi.mocked(iterm2Script.createTab).mockResolvedValueOnce('')
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1'])
    vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
      { id: 1, title: 'New tab', windowIndex: 1 },
    ])

    const adapter = createAdapter()
    await adapter.createTab()

    await vi.advanceTimersByTimeAsync(500)

    expect(iterm2Script.setSessionVar).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// focusTab
// ---------------------------------------------------------------------------
describe('ITerm2Adapter: focusTab', () => {
  it('should select tab in front window and refresh session IDs', async () => {
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1', 'sid-2'])

    const adapter = createAdapter()
    await adapter.focusTab({ id: '2', title: 'Test', windowId: '1' })

    await vi.advanceTimersByTimeAsync(500)

    expect(iterm2Script.selectTabInWindow).toHaveBeenCalledWith(2, 1)
    expect(iterm2Script.getSessionIds).toHaveBeenCalledOnce()
  })

  it('should select tab in non-front window via selectTabInWindow', async () => {
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1'])

    const adapter = createAdapter()
    await adapter.focusTab({ id: '3', title: 'Test', windowId: '2' })

    await vi.advanceTimersByTimeAsync(500)

    expect(iterm2Script.selectTabInWindow).toHaveBeenCalledWith(3, 2)
    expect(iterm2Script.selectTab).not.toHaveBeenCalled()
  })

  it('should default to window 1 when windowId is not set', async () => {
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1'])

    const adapter = createAdapter()
    await adapter.focusTab({ id: '1', title: 'Test' })

    await vi.advanceTimersByTimeAsync(500)

    expect(iterm2Script.selectTabInWindow).toHaveBeenCalledWith(1, 1)
  })

  it('should throw error for non-numeric tab id', async () => {
    const adapter = createAdapter()
    await expect(
      adapter.focusTab({ id: 'invalid', title: 'Test' }),
    ).rejects.toThrow('Invalid tab id')
  })

  it('should throw error for zero tab index', async () => {
    const adapter = createAdapter()
    await expect(
      adapter.focusTab({ id: '0', title: 'Test' }),
    ).rejects.toThrow('Invalid tab id')
  })
})

// ---------------------------------------------------------------------------
// splitPane
// ---------------------------------------------------------------------------
describe('ITerm2Adapter: splitPane', () => {
  it('should map "down" direction to "horizontally" and refresh session IDs', async () => {
    // getSessionIds before split
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1'])
    // getSessionIds after split
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce([
      'sid-1',
      'sid-2',
    ])

    const adapter = createAdapter()
    await adapter.splitPane('down')

    await vi.advanceTimersByTimeAsync(500)

    expect(iterm2Script.splitPane).toHaveBeenCalledWith('horizontally')
    expect(iterm2Script.getSessionIds).toHaveBeenCalledTimes(2)
  })

  it('should map "right" direction to "vertically" and refresh session IDs', async () => {
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1'])
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce([
      'sid-1',
      'sid-2',
    ])

    const adapter = createAdapter()
    await adapter.splitPane('right')

    await vi.advanceTimersByTimeAsync(500)

    expect(iterm2Script.splitPane).toHaveBeenCalledWith('vertically')
    expect(iterm2Script.getSessionIds).toHaveBeenCalledTimes(2)
  })

  it('should send cd command for workingDirectory after split with explicit focus', async () => {
    // getSessionIds before split
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1'])
    // getSessionIds after split (new session added)
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce([
      'sid-1',
      'sid-new',
    ])
    vi.mocked(iterm2Script.focusSessionById).mockResolvedValue('')
    vi.mocked(iterm2Script.writeText).mockResolvedValue('')

    const adapter = createAdapter()
    await adapter.splitPane('right', { workingDirectory: '/Users/dev/subdir' })

    await vi.advanceTimersByTimeAsync(1200)

    expect(iterm2Script.splitPane).toHaveBeenCalledWith('vertically')
    expect(iterm2Script.getSessionIds).toHaveBeenCalledTimes(2)
    // Explicitly focus the new session before sending cd
    expect(iterm2Script.focusSessionById).toHaveBeenCalledWith('sid-new')
    expect(iterm2Script.writeText).toHaveBeenCalledWith('cd "/Users/dev/subdir"')
  })

  it('should not send cd when no new session is found after split', async () => {
    // getSessionIds before split
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1'])
    // getSessionIds after split (no new session detected)
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1'])

    const adapter = createAdapter()
    await adapter.splitPane('right', { workingDirectory: '/Users/dev/subdir' })

    await vi.advanceTimersByTimeAsync(500)

    expect(iterm2Script.focusSessionById).not.toHaveBeenCalled()
    expect(iterm2Script.writeText).not.toHaveBeenCalled()
  })

  it('should set user variable on new session when currentProjectPath is set', async () => {
    // Set up adapter with a prior createTab that saved currentProjectPath
    vi.mocked(iterm2Script.createTab).mockResolvedValue('')
    vi.mocked(iterm2Script.writeText).mockResolvedValue('')
    vi.mocked(iterm2Script.setSessionVar).mockResolvedValue('')
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1'])
    vi.mocked(iterm2Script.getTabInfo).mockResolvedValueOnce([
      { id: 1, title: 'New tab', windowIndex: 1 },
    ])

    const adapter = createAdapter()
    await adapter.createTab({
      title: '[WorkspaceSync] test-project',
      workingDirectory: '/Users/dev/test-project',
    })
    await vi.advanceTimersByTimeAsync(1000)
    vi.clearAllMocks()

    // Now split — new session should get the user variable
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1'])
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce([
      'sid-1',
      'sid-new',
    ])
    vi.mocked(iterm2Script.focusSessionById).mockResolvedValue('')
    vi.mocked(iterm2Script.setSessionVar).mockResolvedValue('')

    await adapter.splitPane('right')
    await vi.advanceTimersByTimeAsync(700)

    expect(iterm2Script.focusSessionById).toHaveBeenCalledWith('sid-new')
    expect(iterm2Script.setSessionVar).toHaveBeenCalledWith(
      'workspaceProjectPath',
      '/Users/dev/test-project',
    )
  })

  it('should not set user variable when currentProjectPath is null', async () => {
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce(['sid-1'])
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce([
      'sid-1',
      'sid-new',
    ])
    vi.mocked(iterm2Script.focusSessionById).mockResolvedValue('')

    const adapter = createAdapter()
    await adapter.splitPane('right')
    await vi.advanceTimersByTimeAsync(700)

    expect(iterm2Script.setSessionVar).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// sendText
// ---------------------------------------------------------------------------
describe('ITerm2Adapter: sendText', () => {
  it('should send text using writeTextNoNewline', async () => {
    const adapter = createAdapter()
    await adapter.sendText('echo hello')

    expect(iterm2Script.writeTextNoNewline).toHaveBeenCalledWith('echo hello')
    expect(iterm2Script.writeText).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// sendCommand
// ---------------------------------------------------------------------------
describe('ITerm2Adapter: sendCommand', () => {
  it('should send text using writeText (single call, iTerm2 auto-appends newline)', async () => {
    const adapter = createAdapter()
    await adapter.sendCommand('npm run dev')

    expect(iterm2Script.writeText).toHaveBeenCalledWith('npm run dev')
    expect(iterm2Script.writeTextNoNewline).not.toHaveBeenCalled()
  })

  it('should handle empty command', async () => {
    const adapter = createAdapter()
    await adapter.sendCommand('')

    expect(iterm2Script.writeText).toHaveBeenCalledWith('')
  })
})

// ---------------------------------------------------------------------------
// navigateToPane (uses session id focus)
// ---------------------------------------------------------------------------
describe('ITerm2Adapter: navigateToPane', () => {
  it('should focus session by cached id at index 1', async () => {
    const adapter = createAdapter()
    ;(adapter as unknown as { cachedSessionIds: readonly string[] }).cachedSessionIds = [
      'sid-first',
      'sid-second',
    ]

    await adapter.navigateToPane(1)

    expect(iterm2Script.focusSessionById).toHaveBeenCalledWith('sid-first')
  })

  it('should focus session by cached id at index 2', async () => {
    const adapter = createAdapter()
    ;(adapter as unknown as { cachedSessionIds: readonly string[] }).cachedSessionIds = [
      'sid-first',
      'sid-second',
    ]

    await adapter.navigateToPane(2)

    expect(iterm2Script.focusSessionById).toHaveBeenCalledWith('sid-second')
  })

  it('should refresh cached session IDs when cache is empty', async () => {
    vi.mocked(iterm2Script.getSessionIds).mockResolvedValueOnce([
      'sid-1',
      'sid-2',
      'sid-3',
    ])

    const adapter = createAdapter()

    await adapter.navigateToPane(2)

    expect(iterm2Script.getSessionIds).toHaveBeenCalledOnce()
    expect(iterm2Script.focusSessionById).toHaveBeenCalledWith('sid-2')
  })

  it('should throw error for zero index', async () => {
    const adapter = createAdapter()
    await expect(adapter.navigateToPane(0)).rejects.toThrow(
      'Pane index must be a positive integer',
    )
  })

  it('should throw error for negative index', async () => {
    const adapter = createAdapter()
    await expect(adapter.navigateToPane(-1)).rejects.toThrow(
      'Pane index must be a positive integer',
    )
  })

  it('should throw error when index exceeds available panes', async () => {
    const adapter = createAdapter()
    ;(adapter as unknown as { cachedSessionIds: readonly string[] }).cachedSessionIds = [
      'sid-1',
    ]

    await expect(adapter.navigateToPane(5)).rejects.toThrow(
      'Pane index 5 out of range',
    )
  })
})
