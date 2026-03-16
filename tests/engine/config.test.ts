/**
 * Tests for configuration module
 *
 * Covers:
 * - Zod schema validation (valid & invalid configs)
 * - Default values
 */

import { describe, it, expect } from 'vitest'
import { ProjectConfigSchema } from '@fly-tty/engine/config/schema.js'
import { defaultConfig } from '@fly-tty/engine/config/defaults.js'
import type { ProjectConfig } from '@fly-tty/engine/types/config.js'

// ---------------------------------------------------------------------------
// Schema validation tests
// ---------------------------------------------------------------------------
describe('config/schema', () => {
  describe('valid configurations', () => {
    it('should validate a valid three-pane layout', () => {
      const input = {
        version: '1.0',
        terminal: 'ghostty',
        layout: {
          direction: 'horizontal',
          panes: [
            { id: 'top', commands: ['command'] },
            {
              direction: 'vertical',
              panes: [
                { id: 'bottom-left', commands: ['npm run dev'] },
                { id: 'bottom-right', commands: [] },
              ],
            },
          ],
        },
      }

      const result = ProjectConfigSchema.parse(input) as ProjectConfig
      expect(result.terminal).toBe('ghostty')
      expect(result.layout).toMatchObject({
        direction: 'horizontal',
      })
    })

    it('should validate a valid two-pane horizontal split config', () => {
      const input = {
        version: '1.0',
        terminal: 'ghostty',
        layout: {
          direction: 'horizontal',
          panes: [
            { id: 'top', commands: ['command'] },
            { id: 'bottom', commands: ['npm run dev'] },
          ],
        },
      }

      const result = ProjectConfigSchema.parse(input) as ProjectConfig
      expect(result.terminal).toBe('ghostty')
      expect(result.layout).toMatchObject({ direction: 'horizontal' })
    })

    it('should validate a valid two-pane vertical split config', () => {
      const input = {
        version: '1.0',
        terminal: 'ghostty',
        layout: {
          direction: 'vertical',
          panes: [
            { id: 'left', commands: ['npm run dev'] },
            { id: 'right', commands: [] },
          ],
        },
      }

      const result = ProjectConfigSchema.parse(input) as ProjectConfig
      expect(result.layout).toMatchObject({ direction: 'vertical' })
    })

    it('should validate a valid single-pane layout (direction: none)', () => {
      const input = {
        layout: {
          direction: 'none',
          panes: [{ id: 'main', commands: ['npm run dev'] }],
        },
      }

      const result = ProjectConfigSchema.parse(input)
      expect(result).toBeDefined()
    })

    it('should validate a single pane without direction (treated as leaf)', () => {
      const input = {
        layout: {
          id: 'main',
          commands: ['npm run dev'],
        },
      }

      const result = ProjectConfigSchema.parse(input)
      expect(result).toBeDefined()
    })

    it('should parse optional pane fields with defaults', () => {
      const input = {
        layout: {
          direction: 'none',
          panes: [{ id: 'test' }],
        },
      }

      const result = ProjectConfigSchema.parse(input)
      if ('panes' in result.layout) {
        const pane = result.layout.panes[0] as { auto_focus?: boolean; commands?: string[] }
        expect(pane.auto_focus).toBe(false)
        expect(pane.commands).toEqual([])
      }
    })

    it('should accept panes with explicit optional fields', () => {
      const input = {
        layout: {
          direction: 'vertical',
          panes: [
            { id: 'a', auto_focus: true, commands: ['vim'], cwd: '/tmp' },
            { id: 'b' },
          ],
        },
      }

      const result = ProjectConfigSchema.parse(input)
      expect(result).toBeDefined()
    })

    it('should accept multiple commands in a pane', () => {
      const input = {
        layout: {
          direction: 'none',
          panes: [{
            id: 'dev',
            commands: ['cd /some/path', 'npm install', 'npm run dev'],
          }],
        },
      }

      const result = ProjectConfigSchema.parse(input)
      expect(result).toBeDefined()
      if ('panes' in result.layout) {
        const pane = result.layout.panes[0] as { commands?: string[] }
        expect(pane.commands).toHaveLength(3)
      }
    })
  })

  describe('invalid configurations', () => {
    it('should reject config without layout', () => {
      const input = { version: '1.0' }
      expect(() => ProjectConfigSchema.parse(input)).toThrow()
    })

    it('should reject invalid direction', () => {
      const input = {
        layout: {
          direction: 'diagonal',
          panes: [{ id: 'a' }, { id: 'b' }],
        },
      }
      expect(() => ProjectConfigSchema.parse(input)).toThrow()
    })

    it('should reject empty panes array', () => {
      const input = {
        layout: {
          direction: 'vertical',
          panes: [],
        },
      }
      expect(() => ProjectConfigSchema.parse(input)).toThrow()
    })

    it('should reject horizontal split with only 1 pane', () => {
      const input = {
        layout: {
          direction: 'horizontal',
          panes: [{ id: 'only' }],
        },
      }
      expect(() => ProjectConfigSchema.parse(input)).toThrow()
    })

    it('should reject vertical split with only 1 pane', () => {
      const input = {
        layout: {
          direction: 'vertical',
          panes: [{ id: 'only' }],
        },
      }
      expect(() => ProjectConfigSchema.parse(input)).toThrow()
    })

    it('should reject invalid terminal type', () => {
      const input = {
        terminal: 'alacritty',
        layout: {
          direction: 'none',
          panes: [{ id: 'main' }],
        },
      }
      expect(() => ProjectConfigSchema.parse(input)).toThrow()
    })

    it('should reject pane without id', () => {
      const input = {
        layout: {
          direction: 'vertical',
          panes: [{ name: 'no-id' }, { id: 'has-id' }],
        },
      }
      expect(() => ProjectConfigSchema.parse(input)).toThrow()
    })
  })

  describe('default values', () => {
    it('should default version to "1.0"', () => {
      const input = {
        layout: {
          direction: 'none',
          panes: [{ id: 'main' }],
        },
      }
      const result = ProjectConfigSchema.parse(input)
      expect(result.version).toBe('1.0')
    })

    it('should default terminal to "ghostty"', () => {
      const input = {
        layout: {
          direction: 'none',
          panes: [{ id: 'main' }],
        },
      }
      const result = ProjectConfigSchema.parse(input)
      expect(result.terminal).toBe('ghostty')
    })

    it('should default auto_focus to false', () => {
      const input = {
        layout: {
          id: 'main',
        },
      }
      const result = ProjectConfigSchema.parse(input) as unknown as { layout: { auto_focus?: boolean } }
      expect(result.layout.auto_focus).toBe(false)
    })

    it('should default commands to empty array', () => {
      const input = {
        layout: {
          id: 'main',
        },
      }
      const result = ProjectConfigSchema.parse(input) as unknown as { layout: { commands?: string[] } }
      expect(result.layout.commands).toEqual([])
    })
  })
})

// ---------------------------------------------------------------------------
// Defaults tests
// ---------------------------------------------------------------------------
describe('config/defaults', () => {
  it('should provide a valid default config', () => {
    expect(defaultConfig).toBeDefined()
    expect(defaultConfig.version).toBe('1.0')
    expect(defaultConfig.terminal).toBe('ghostty')
    expect(defaultConfig.layout).toBeDefined()
  })

  it('default layout should be a single pane', () => {
    const layout = defaultConfig.layout as unknown as { direction?: string; panes?: unknown[] }
    expect(layout.direction).toBe('none')
    expect(layout.panes).toHaveLength(1)
  })
})
