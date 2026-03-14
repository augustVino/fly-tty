/**
 * Tests for configuration module
 *
 * Covers:
 * - Zod schema validation (valid & invalid configs)
 * - Default values
 * - Config loader (file not found, normal load, parse errors)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFile, unlink, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ProjectConfigSchema } from '@ide-tui-bridge/engine/config/schema.js'
import { defaultConfig } from '@ide-tui-bridge/engine/config/defaults.js'
import { loadConfig } from '@ide-tui-bridge/engine/config/loader.js'
import type { ProjectConfig } from '@ide-tui-bridge/engine/types/config.js'

const testDir = '/tmp/ide-tui-bridge-test'
const configPath = join(testDir, '.contextsync.yml')

beforeEach(async () => {
  try {
    await mkdir(testDir, { recursive: true })
  } catch {
    // Already exists
  }
})

afterEach(async () => {
  try {
    await unlink(configPath)
  } catch {
    // Ignore
  }
})

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
            { id: 'top', command: 'command' },
            {
              direction: 'vertical',
              panes: [
                { id: 'bottom-left', command: 'npm run dev' },
                { id: 'bottom-right', command: '' },
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
            { id: 'top', command: 'command' },
            { id: 'bottom', command: 'npm run dev' },
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
            { id: 'left', command: 'npm run dev' },
            { id: 'right', command: '' },
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
          panes: [{ id: 'main', command: 'npm run dev' }],
        },
      }

      const result = ProjectConfigSchema.parse(input)
      expect(result).toBeDefined()
    })

    it('should validate a single pane without direction (treated as leaf)', () => {
      const input = {
        layout: {
          id: 'main',
          command: 'npm run dev',
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
      const layout = result.layout as unknown as { panes: Array<{ auto_focus?: boolean; command?: string }> }
      if ('panes' in result.layout) {
        const pane = layout.panes[0]
        expect(pane.auto_focus).toBe(false)
        expect(pane.command).toBe('')
      }
    })

    it('should accept panes with explicit optional fields', () => {
      const input = {
        layout: {
          direction: 'vertical',
          panes: [
            { id: 'a', auto_focus: true, command: 'vim', cwd: '/tmp' },
            { id: 'b' },
          ],
        },
      }

      const result = ProjectConfigSchema.parse(input)
      expect(result).toBeDefined()
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

    it('should default command to empty string', () => {
      const input = {
        layout: {
          id: 'main',
        },
      }
      const result = ProjectConfigSchema.parse(input) as unknown as { layout: { command?: string } }
      expect(result.layout.command).toBe('')
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

// ---------------------------------------------------------------------------
// Loader tests
// ---------------------------------------------------------------------------
describe('config/loader', () => {
  it('should return default config when file does not exist', async () => {
    const result = await loadConfig(testDir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.version).toBe(defaultConfig.version)
      expect(result.value.terminal).toBe(defaultConfig.terminal)
    }
  })

  it('should load and parse a valid config file', async () => {
    // Note: version must be quoted in YAML to be parsed as string, not number
    const configContent = `version: "1.0"
terminal: ghostty
layout:
  direction: horizontal
  panes:
    - id: pane_top
      command: 'command'
    - id: pane_bottom
      command: 'npm run dev'`

    await writeFile(configPath, configContent, 'utf-8')

    const result = await loadConfig(testDir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.version).toBe('1.0')
      expect(result.value.terminal).toBe('ghostty')
    }
  })

  it('should support custom config file name', async () => {
    const customConfigPath = join(testDir, '.custom.yml')
    const configContent = `version: "1.0"
terminal: ghostty
layout:
  direction: none
  panes:
    - id: main
      command: 'npm run dev'`

    await writeFile(customConfigPath, configContent, 'utf-8')

    const result = await loadConfig(testDir, { configFileName: '.custom.yml' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.terminal).toBe('ghostty')
    }

    await unlink(customConfigPath)
  })

  it('should throw error for invalid YAML', async () => {
    const invalidYaml = `version: 1.0
terminal: ghostty
layout:
  direction: horizontal
  panes:
    - id: pane_top
      command: 'command'
    invalid: [unclosed`

    await writeFile(configPath, invalidYaml, 'utf-8')
    await expect(loadConfig(testDir)).rejects.toThrow('Failed to parse YAML')
  })

  it('should throw error for invalid schema', async () => {
    const invalidSchema = `version: 1.0
terminal: ghostty
layout:
  direction: horizontal
  panes:
    - id: pane_top`

    await writeFile(configPath, invalidSchema, 'utf-8')
    await expect(loadConfig(testDir)).rejects.toThrow('Invalid configuration')
  })
})
