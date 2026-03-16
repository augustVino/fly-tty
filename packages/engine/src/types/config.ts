/**
 * Configuration type definitions
 */

import type { LayoutNode } from './layout.js'

/** Terminal type */
export type TerminalType = 'ghostty' | 'iterm2'

/** Project configuration */
export interface ProjectConfig {
  version: string
  terminal: TerminalType
  layout: LayoutNode
}
