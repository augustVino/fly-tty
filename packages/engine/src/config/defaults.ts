/**
 * Default configuration values
 */

import type { ProjectConfig } from '../types/config.js'
import type { LayoutNode } from '../types/layout.js'

/** Default single-pane layout */
const defaultLayout: LayoutNode = {
  direction: 'none',
  panes: [
    {
      id: 'main',
      commands: [],
    },
  ],
}

/** Default project configuration */
export const defaultConfig: ProjectConfig = {
  version: '1.0',
  terminal: 'ghostty',
  layout: defaultLayout,
}
