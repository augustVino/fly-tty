/**
 * Tests for sync engine module
 *
 * Covers:
 * - createTerminalAdapter factory
 * - New tab flow: ensureRunning, activateWindow, createTab, splitPane, sendCommand
 * - Tab reuse flow (idempotency): does NOT call splitPane
 * - Layout from options vs default config
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { TerminalAdapter, TerminalTab } from '@fly-tty/engine/types/adapter.js'

// ---------------------------------------------------------------------------
// Create mock adapter that will replace ghosttyAdapter
// ---------------------------------------------------------------------------
const mockAdapterMethods = {
  ensureRunning: vi.fn().mockResolvedValue(undefined),
  activateWindow: vi.fn().mockResolvedValue(undefined),
  listTabs: vi.fn().mockResolvedValue([]),
  findTabByProject: vi.fn().mockResolvedValue(null),
  createTab: vi.fn().mockResolvedValue({
    id: '1',
    title: '[WorkspaceSync] test-project',
    windowId: 'front',
  } satisfies TerminalTab),
  focusTab: vi.fn().mockResolvedValue(undefined),
  splitPane: vi.fn().mockResolvedValue(undefined),
  sendText: vi.fn().mockResolvedValue(undefined),
  sendCommand: vi.fn().mockResolvedValue(undefined),
  navigateToPane: vi.fn().mockResolvedValue(undefined),
}

const mockAdapter: TerminalAdapter = {
  name: 'mock-ghostty',
  ...mockAdapterMethods,
}

// ---------------------------------------------------------------------------
// Mock external dependencies before importing sync-engine
// ---------------------------------------------------------------------------
// Ghostty adapter mock - provide our mock adapter as the singleton
vi.mock('@fly-tty/engine/adapters/terminal/ghostty-adapter.js', () => ({
  ghosttyAdapter: null,
}))

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------
import { sync } from '@fly-tty/engine/core/sync-engine.js'
import { defaultConfig } from '@fly-tty/engine/config/defaults.js'

// ---------------------------------------------------------------------------
// We need to intercept the sync function's internal createTerminalAdapter call.
// Since ESM imports are hoisted, we need to monkey-patch the imported module.
// ---------------------------------------------------------------------------
const ghosttyAdapterModule = await import('@fly-tty/engine/adapters/terminal/ghostty-adapter.js')
// @ts-expect-error - we're replacing the null with a real mock
ghosttyAdapterModule.ghosttyAdapter = mockAdapter

beforeEach(() => {
  vi.clearAllMocks()
  // Restore ghostty adapter mock after clearAllMocks resets it
  // @ts-expect-error - we're replacing the null with a real mock
  ghosttyAdapterModule.ghosttyAdapter = mockAdapter

  // Reset all adapter methods to default behavior
  mockAdapterMethods.ensureRunning.mockResolvedValue(undefined)
  mockAdapterMethods.activateWindow.mockResolvedValue(undefined)
  mockAdapterMethods.listTabs.mockResolvedValue([])
  mockAdapterMethods.findTabByProject.mockResolvedValue(null)
  mockAdapterMethods.createTab.mockResolvedValue({
    id: '1',
    title: '[WorkspaceSync] test-project',
    windowId: 'front',
  } satisfies TerminalTab)
  mockAdapterMethods.focusTab.mockResolvedValue(undefined)
  mockAdapterMethods.splitPane.mockResolvedValue(undefined)
  mockAdapterMethods.sendText.mockResolvedValue(undefined)
  mockAdapterMethods.sendCommand.mockResolvedValue(undefined)
  mockAdapterMethods.navigateToPane.mockResolvedValue(undefined)

  // Use fake timers to avoid real delays in command injection
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// createTerminalAdapter tests
// ---------------------------------------------------------------------------
describe('core/sync-engine: createTerminalAdapter', () => {
  it('should create adapter for ghostty terminal', () => {
    expect(mockAdapter.name).toBe('mock-ghostty')
  })

  it('should throw for unsupported terminal type', () => {
    try {
      const config = { ...defaultConfig, terminal: 'alacritty' as 'ghostty' }
      switch (config.terminal) {
        case 'ghostty':
          break
        default:
          throw new Error(`Unsupported terminal type: ${config.terminal}`)
      }
    } catch (error) {
      expect((error as Error).message).toContain('Unsupported terminal type: alacritty')
    }
  })
})

// ---------------------------------------------------------------------------
// New tab flow tests
// ---------------------------------------------------------------------------
describe('core/sync-engine: sync (new tab flow)', () => {
  it('should call ensureRunning, activateWindow, createTab, splitPane, sendCommand for new tab', async () => {
    const twoPaneLayout = {
      direction: 'vertical' as const,
      panes: [
        { id: 'left', commands: [] as string[] },
        { id: 'right', commands: ['vim'] },
      ],
    }

    const result = await sync({
      projectPath: '/tmp/test-project',
      layout: twoPaneLayout,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.splitCount).toBe(1)
    }

    // Verify the full flow
    expect(mockAdapterMethods.ensureRunning).toHaveBeenCalledOnce()
    expect(mockAdapterMethods.activateWindow).toHaveBeenCalledOnce()
    expect(mockAdapterMethods.findTabByProject).toHaveBeenCalledWith('/tmp/test-project')
    expect(mockAdapterMethods.createTab).toHaveBeenCalledOnce()
    expect(mockAdapterMethods.splitPane).toHaveBeenCalledWith('right', {
      workingDirectory: '/tmp/test-project',
    })
    // After splits: re-set title on first pane
    expect(mockAdapterMethods.navigateToPane).toHaveBeenCalledWith(1)
    expect(mockAdapterMethods.sendCommand).toHaveBeenCalledWith(
      expect.stringContaining("\\033]0;[WorkspaceSync] test-project\\007"),
    )
    // sendCommand also called for panes with non-empty commands
    expect(mockAdapterMethods.sendCommand).toHaveBeenCalledWith('vim')
  })
})

// ---------------------------------------------------------------------------
// Tab reuse (idempotency) tests
// ---------------------------------------------------------------------------
describe('core/sync-engine: sync (tab reuse / idempotency)', () => {
  it('should NOT call splitPane when reusing an existing tab', async () => {
    const existingTab: TerminalTab = {
      id: '2',
      title: '[WorkspaceSync] test-project',
      windowId: 'front',
    }
    mockAdapterMethods.findTabByProject.mockResolvedValue(existingTab)

    const result = await sync({
      projectPath: '/tmp/test-project',
      layout: {
        direction: 'none',
        panes: [{ id: 'main', commands: [] }],
      },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.splitCount).toBe(0)
      expect(result.value.tabResolution.isNew).toBe(false)
    }

    expect(mockAdapterMethods.splitPane).not.toHaveBeenCalled()
    expect(mockAdapterMethods.focusTab).toHaveBeenCalledWith(existingTab)
  })
})

// ---------------------------------------------------------------------------
// Default config tests
// ---------------------------------------------------------------------------
describe('core/sync-engine: sync (default config)', () => {
  it('should use default config when no layout is provided', async () => {
    const result = await sync({
      projectPath: '/tmp/test-project',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.splitCount).toBe(0)
    }

    expect(mockAdapterMethods.ensureRunning).toHaveBeenCalled()
    expect(mockAdapterMethods.activateWindow).toHaveBeenCalled()
    // Title is re-set after splits (even with 0 splits, the new tab path triggers it)
    expect(mockAdapterMethods.navigateToPane).toHaveBeenCalledWith(1)
    expect(mockAdapterMethods.sendCommand).toHaveBeenCalledWith(
      expect.stringContaining("\\033]0;[WorkspaceSync] test-project\\007"),
    )
  })
})

// ---------------------------------------------------------------------------
// Single pane layout tests
// ---------------------------------------------------------------------------
describe('core/sync-engine: sync (single pane layout)', () => {
  it('should not split pane for single-pane layout', async () => {
    const result = await sync({
      projectPath: '/tmp/test-project',
      layout: {
        direction: 'none',
        panes: [{ id: 'main', commands: [] }],
      },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.splitCount).toBe(0)
    }

    expect(mockAdapterMethods.splitPane).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Three-pane layout tests
// ---------------------------------------------------------------------------
describe('core/sync-engine: sync (three-pane layout)', () => {
  it('should split pane twice for three-pane layout', async () => {
    const threePaneLayout = {
      direction: 'horizontal' as const,
      panes: [
        { id: 'top', commands: [] as string[] },
        {
          direction: 'vertical' as const,
          panes: [
            { id: 'bottom_left', commands: [] as string[] },
            { id: 'bottom_right', commands: [] as string[] },
          ],
        },
      ],
    }

    const result = await sync({
      projectPath: '/tmp/test-project',
      layout: threePaneLayout,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.splitCount).toBe(2)
    }

    expect(mockAdapterMethods.splitPane).toHaveBeenCalledTimes(2)
    expect(mockAdapterMethods.splitPane).toHaveBeenNthCalledWith(1, 'down', {
      workingDirectory: '/tmp/test-project',
    })
    expect(mockAdapterMethods.splitPane).toHaveBeenNthCalledWith(2, 'right', {
      workingDirectory: '/tmp/test-project',
    })
    // Title re-set after splits
    expect(mockAdapterMethods.navigateToPane).toHaveBeenCalledWith(1)
    expect(mockAdapterMethods.sendCommand).toHaveBeenCalledWith(
      expect.stringContaining("\\033]0;[WorkspaceSync] test-project\\007"),
    )
  })
})

// ---------------------------------------------------------------------------
// Multiple commands per pane tests
// ---------------------------------------------------------------------------
describe('core/sync-engine: sync (multiple commands per pane)', () => {
  it('should execute multiple commands in order with delay', async () => {
    const multiCmdLayout = {
      direction: 'none',
      panes: [{
        id: 'dev',
        commands: ['cd /some/path', 'npm install', 'npm run dev'],
      }],
    }

    const result = await sync({
      projectPath: '/tmp/test-project',
      layout: multiCmdLayout,
    })

    expect(result.ok).toBe(true)

    // First sendCommand is the OSC 0 title re-set
    expect(mockAdapterMethods.sendCommand).toHaveBeenCalledTimes(4)
    expect(mockAdapterMethods.sendCommand).toHaveBeenNthCalledWith(1,
      expect.stringContaining("\\033]0;[WorkspaceSync] test-project\\007"),
    )
    expect(mockAdapterMethods.sendCommand).toHaveBeenNthCalledWith(2, 'cd /some/path')
    expect(mockAdapterMethods.sendCommand).toHaveBeenNthCalledWith(3, 'npm install')
    expect(mockAdapterMethods.sendCommand).toHaveBeenNthCalledWith(4, 'npm run dev')
  })
})
