/**
 * Core module index
 */

export { buildSplitSequence, collectLeaves } from './layout-builder.js'
export type { SplitAction } from './layout-builder.js'

export { ensureWindow } from './window-manager.js'

export { resolveTab } from './tab-manager.js'
export type { TabResolution } from './tab-manager.js'

export { injectCommands } from './command-injector.js'
export type { InjectionOptions } from './command-injector.js'

export { sync, createTerminalAdapter } from './sync-engine.js'
export type { SyncOptions, SyncResult } from './sync-engine.js'
