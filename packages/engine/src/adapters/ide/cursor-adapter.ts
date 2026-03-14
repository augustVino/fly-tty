/**
 * Cursor IDE Adapter
 *
 * Provides a standardized interface for interacting with Cursor IDE.
 * This adapter extracts project context from the IDE (e.g., project path,
 * workspace name) to feed into the sync engine.
 */

/** Information extracted from the IDE */
export interface IdeContext {
  readonly projectPath: string
  readonly workspaceName: string
}

/** IDE adapter interface for extracting context and triggering sync */
export interface IdeAdapter {
  readonly name: string

  /** Extract the current project context from the IDE */
  getContext(): Promise<IdeContext>

  /** Trigger a workspace sync for the current project */
  triggerSync(): Promise<void>
}

/**
 * CursorAdapter - Cursor IDE integration
 *
 * In the extension host context, this reads workspace state from
 * the VS Code / Cursor extension API. The actual extension entry
 * point wires this up.
 */
export class CursorAdapter implements IdeAdapter {
  readonly name = 'cursor'

  private readonly getContextFn: () => Promise<IdeContext>
  private readonly triggerSyncFn: () => Promise<void>

  constructor(
    contextFn: () => Promise<IdeContext>,
    triggerSyncFn: () => Promise<void>,
  ) {
    this.getContextFn = contextFn
    this.triggerSyncFn = triggerSyncFn
  }

  async getContext(): Promise<IdeContext> {
    return this.getContextFn()
  }

  async triggerSync(): Promise<void> {
    return this.triggerSyncFn()
  }
}
