/**
 * Configuration loader - loads and validates .contextsync.yml
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'
import { ProjectConfigSchema } from './schema.js'
import { defaultConfig } from './defaults.js'
import { ok, type Result } from '../types/result.js'
import type { ProjectConfig, ConfigLoadOptions } from '../types/config.js'

/** Default config file name */
const DEFAULT_CONFIG_FILE = '.contextsync.yml'

/**
 * Load configuration from project directory
 * Returns default config if file doesn't exist
 */
export async function loadConfig(
  projectPath: string,
  options: ConfigLoadOptions = {}
): Promise<Result<ProjectConfig>> {
  const configFileName = options.configFileName ?? DEFAULT_CONFIG_FILE
  const configPath = join(projectPath, configFileName)

  try {
    const content = await readFile(configPath, 'utf-8')
    const parsed = parse(content)

    const config = ProjectConfigSchema.parse(parsed)
    return ok(config)
  } catch (error) {
    // File not found - return default config
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return ok(defaultConfig)
    }

    // Parse error - rethrow as meaningful error
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid configuration: ${error.message}`)
    }

    // YAML parse error
    if (error instanceof Error && error.name === 'YAMLParseError') {
      throw new Error(`Failed to parse YAML: ${error.message}`)
    }

    // Other errors
    throw error
  }
}
