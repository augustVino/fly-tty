/**
 * Tests for Ghostty terminal adapter
 *
 * Covers:
 * - ensureRunning: Ghostty not running -> starts it; already running -> no-op
 * - findTabByProject: matches [WorkspaceSync] prefix; no match -> null
 * - splitPane: correct AppleScript call
 * - sendCommand: adds newline
 * - Other adapter methods: activateWindow, navigateToPane, etc.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock execa before importing the adapter
// ---------------------------------------------------------------------------
vi.mock('execa', () => ({
  execa: vi.fn(),
}))

vi.mock('@ide-tui-bridge/engine/adapters/terminal/ghostty-applescript.js', () => ({
  activateGhostty: vi.fn().mockResolvedValue(''),
  newWindow: vi.fn().mockResolvedValue(''),
  newTab: vi.fn().mockResolvedValue(''),
  splitPane: vi.fn().mockResolvedValue(''),
  inputText: vi.fn().mockResolvedValue(''),
  selectTab: vi.fn().mockResolvedValue(''),
  getTabTitles: vi.fn().mockResolvedValue([]),
  navigateToPane: vi.fn().mockResolvedValue(''),
}))

import { execa } from 'execa'
import { GhosttyAdapter } from '@ide-tui-bridge/engine/adapters/terminal/ghostty-adapter.js'
import * as ghosttyScript from '@ide-tui-bridge/engine/adapters/terminal/ghostty-applescript.js'

const mockExeca = vi.mocked(execa)

function createAdapter(): GhosttyAdapter {
  return new GhosttyAdapter()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

// ---------------------------------------------------------------------------
// Adapter name
// ---------------------------------------------------------------------------
describe('GhosttyAdapter: name', () => {
  it('should return "ghostty"', () => {
    const adapter = createAdapter()
    expect(adapter.name).toBe('ghostty')
  })
})

// ---------------------------------------------------------------------------
// ensureRunning
// ---------------------------------------------------------------------------
describe('GhosttyAdapter: ensureRunning', () => {
  it('should not start Ghostty if already running', async () => {
    mockExeca.mockResolvedValueOnce({
      stdout: '12345',
      stderr: '',
      exitCode: 0,
    } as Awaited<ReturnType<typeof execa>>)

    const adapter = createAdapter()
    await adapter.ensureRunning()

    expect(mockExeca).toHaveBeenCalledWith('pgrep', ['-x', 'Ghostty'])
    expect(mockExeca).not.toHaveBeenCalledWith('open', expect.anything())
  })

  it('should start Ghostty if not running', async () => {
    // pgrep fails -> not running
    mockExeca.mockRejectedValueOnce(new Error('not found'))
    // open -a Ghostty
    mockExeca.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
    } as Awaited<ReturnType<typeof execa>>)
    // waitForWindow: 1 window
    mockExeca.mockResolvedValueOnce({
      stdout: '1',
      stderr: '',
      exitCode: 0,
    } as Awaited<ReturnType<typeof execa>>)

    const adapter = createAdapter()
    await adapter.ensureRunning()

    expect(mockExeca).toHaveBeenCalledWith('pgrep', ['-x', 'Ghostty'])
    expect(mockExeca).toHaveBeenCalledWith('open', ['-a', 'Ghostty'])
    expect(mockExeca).toHaveBeenCalledWith(
      'osascript',
      expect.arrayContaining([
        '-e',
        expect.stringContaining('count windows of process "Ghostty"'),
      ]),
    )
  })

  it('should poll for window after starting Ghostty', async () => {
    // pgrep fails -> not running
    mockExeca.mockRejectedValueOnce(new Error('not found'))
    // open -a Ghostty
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
})

// ---------------------------------------------------------------------------
// activateWindow
// ---------------------------------------------------------------------------
describe('GhosttyAdapter: activateWindow', () => {
  it('should call activateGhostty', async () => {
    const adapter = createAdapter()
    await adapter.activateWindow()

    expect(ghosttyScript.activateGhostty).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// listTabs
// ---------------------------------------------------------------------------
describe('GhosttyAdapter: listTabs', () => {
  it('should return empty array when no tabs exist', async () => {
    vi.mocked(ghosttyScript.getTabTitles).mockResolvedValueOnce([])

    const adapter = createAdapter()
    const tabs = await adapter.listTabs()
    expect(tabs).toEqual([])
  })

  it('should map tab titles to TerminalTab objects', async () => {
    vi.mocked(ghosttyScript.getTabTitles).mockResolvedValueOnce([
      '[WorkspaceSync] my-project',
      'Untitled',
    ])

    const adapter = createAdapter()
    const tabs = await adapter.listTabs()

    expect(tabs).toHaveLength(2)
    expect(tabs[0]).toEqual({
      id: '1',
      title: '[WorkspaceSync] my-project',
      windowId: 'front',
    })
    expect(tabs[1]).toEqual({
      id: '2',
      title: 'Untitled',
      windowId: 'front',
    })
  })
})

// ---------------------------------------------------------------------------
// findTabByProject
// ---------------------------------------------------------------------------
describe('GhosttyAdapter: findTabByProject', () => {
  it('should find tab matching [WorkspaceSync] prefix with directory name', async () => {
    vi.mocked(ghosttyScript.getTabTitles).mockResolvedValueOnce([
      'Default',
      '[WorkspaceSync] my-project',
      'Another',
    ])

    const adapter = createAdapter()
    const tab = await adapter.findTabByProject('/Users/dev/my-project')

    expect(tab).not.toBeNull()
    expect(tab?.title).toBe('[WorkspaceSync] my-project')
    expect(tab?.id).toBe('2')
  })

  it('should return null when no matching tab exists', async () => {
    vi.mocked(ghosttyScript.getTabTitles).mockResolvedValueOnce([
      'Default',
      'Another',
    ])

    const adapter = createAdapter()
    const tab = await adapter.findTabByProject('/Users/dev/my-project')

    expect(tab).toBeNull()
  })

  it('should extract project directory name from path correctly', async () => {
    vi.mocked(ghosttyScript.getTabTitles).mockResolvedValueOnce([
      '[WorkspaceSync] nested-dir-project',
    ])

    const adapter = createAdapter()
    const tab = await adapter.findTabByProject('/Users/dev/nested-dir-project')

    expect(tab).not.toBeNull()
    expect(tab?.title).toBe('[WorkspaceSync] nested-dir-project')
  })

  it('should handle trailing slash in project path', async () => {
    vi.mocked(ghosttyScript.getTabTitles).mockResolvedValueOnce([
      '[WorkspaceSync] my-project',
    ])

    const adapter = createAdapter()
    const tab = await adapter.findTabByProject('/Users/dev/my-project/')

    expect(tab).not.toBeNull()
    expect(tab?.title).toBe('[WorkspaceSync] my-project')
  })

  it('should not match partial directory names', async () => {
    vi.mocked(ghosttyScript.getTabTitles).mockResolvedValueOnce([
      '[WorkspaceSync] project',
      '[WorkspaceSync] project-backup',
    ])

    const adapter = createAdapter()
    const tab = await adapter.findTabByProject('/Users/dev/project')

    expect(tab).not.toBeNull()
    expect(tab?.id).toBe('1')
  })
})

// ---------------------------------------------------------------------------
// createTab
// ---------------------------------------------------------------------------
describe('GhosttyAdapter: createTab', () => {
  it('should create a new tab and return the last one', async () => {
    vi.mocked(ghosttyScript.newTab).mockResolvedValueOnce('')
    vi.mocked(ghosttyScript.getTabTitles).mockResolvedValueOnce([
      'First tab',
      'New tab',
    ])

    const adapter = createAdapter()
    const tab = await adapter.createTab()

    expect(tab).toEqual({ id: '2', title: 'New tab', windowId: 'front' })
    expect(ghosttyScript.newTab).toHaveBeenCalledOnce()
  })

  it('should create tab with custom title', async () => {
    vi.mocked(ghosttyScript.newTab).mockResolvedValueOnce('')
    vi.mocked(ghosttyScript.getTabTitles).mockResolvedValueOnce([
      'First tab',
      'New tab',
    ])

    const adapter = createAdapter()
    const tab = await adapter.createTab('[WorkspaceSync] my-project')

    expect(tab).toEqual({
      id: '2',
      title: '[WorkspaceSync] my-project',
      windowId: 'front',
    })
  })

  it('should throw error when no tabs after creation', async () => {
    vi.mocked(ghosttyScript.newTab).mockResolvedValueOnce('')
    vi.mocked(ghosttyScript.getTabTitles).mockResolvedValueOnce([])

    const adapter = createAdapter()
    await expect(adapter.createTab()).rejects.toThrow('Failed to create tab')
  })
})

// ---------------------------------------------------------------------------
// focusTab
// ---------------------------------------------------------------------------
describe('GhosttyAdapter: focusTab', () => {
  it('should select tab by numeric index', async () => {
    const adapter = createAdapter()
    await adapter.focusTab({ id: '2', title: 'Test' })

    expect(ghosttyScript.selectTab).toHaveBeenCalledWith(2)
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
describe('GhosttyAdapter: splitPane', () => {
  it('should call ghosttyScript.splitPane with "right"', async () => {
    const adapter = createAdapter()
    await adapter.splitPane('right')

    expect(ghosttyScript.splitPane).toHaveBeenCalledWith('right')
  })

  it('should call ghosttyScript.splitPane with "down"', async () => {
    const adapter = createAdapter()
    await adapter.splitPane('down')

    expect(ghosttyScript.splitPane).toHaveBeenCalledWith('down')
  })
})

// ---------------------------------------------------------------------------
// sendText
// ---------------------------------------------------------------------------
describe('GhosttyAdapter: sendText', () => {
  it('should send text to terminal without newline', async () => {
    const adapter = createAdapter()
    await adapter.sendText('echo hello')

    expect(ghosttyScript.inputText).toHaveBeenCalledWith('echo hello')
  })
})

// ---------------------------------------------------------------------------
// sendCommand
// ---------------------------------------------------------------------------
describe('GhosttyAdapter: sendCommand', () => {
  it('should append newline to command', async () => {
    const adapter = createAdapter()
    await adapter.sendCommand('npm run dev')

    expect(ghosttyScript.inputText).toHaveBeenCalledWith('npm run dev\n')
  })

  it('should send empty command with newline', async () => {
    const adapter = createAdapter()
    await adapter.sendCommand('')

    expect(ghosttyScript.inputText).toHaveBeenCalledWith('\n')
  })
})

// ---------------------------------------------------------------------------
// navigateToPane
// ---------------------------------------------------------------------------
describe('GhosttyAdapter: navigateToPane', () => {
  it('should navigate to pane by index', async () => {
    const adapter = createAdapter()
    await adapter.navigateToPane(1)

    expect(ghosttyScript.navigateToPane).toHaveBeenCalledWith(1)
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
})
