/**
 * Terminal adapters index
 *
 * Unified exports for all terminal adapter implementations.
 */

export { GhosttyAdapter, ghosttyAdapter } from './ghostty-adapter.js'
export * as ghosttyScript from './ghostty-applescript.js'
export { ITerm2Adapter, iterm2Adapter } from './iterm2-adapter.js'
export * as iterm2Script from './iterm2-applescript.js'
