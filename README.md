# README.md

This file provides guidance to **README.md** (README.ai/code) when working with code in this repository.

## IDE-TUI Bridge (Workspace Sync)

Local workflow automation engine that eliminates context-switching friction in dual-screen development. When triggered from an IDE (Cursor/VS Code), it launches (or activates) the configured terminal emulator, creates/reuses a project tab, builds a multi-pane layout, and injects startup commands into each pane.

### Commands

```bash
# Build all workspaces
npm run build

# Run all tests (verbose)
npm run test

# Run tests with coverage
npm run test:coverage

# Typecheck (project references mode)
npm run typecheck

# Run a single test file
npx vitest run tests/engine/config.test.ts

# Watch mode
npx vitest

# Extension: build/bundle
cd packages/extension && npm run build

# Extension: watch
cd packages/extension && npm run watch

# Extension: package .vsix
cd packages/extension && npm run package
```

### Architecture

#### Monorepo Layout

- **`packages/engine`** (`@ide-tui-bridge/engine`) — Core library. Validates layout config via Zod schema, orchestrates terminal control. No UI dependency.
- **`packages/extension`** — VS Code/Cursor extension. Registers the `ideTuiBridge.openProject` command, reads layout from VS Code settings, calls into the engine.
- **`tests/`** — Root-level Vitest test directory. Aliased so tests import `@ide-tui-bridge/engine` directly from source.

#### Core Engine Pipeline

`sync-engine.ts` runs the full pipeline: `resolveConfig` → `createAdapter` → `ensureWindow` → `resolveTab` → `buildLayout` → `injectCommands`.

Key modules:
- **`config/`** — Zod schema validates the recursive layout tree. Provides default config for when no layout is configured.
- **`core/`** — `window-manager` (launch/activate terminal), `tab-manager` (idempotent find-or-create by title prefix), `layout-builder` (DFS traversal of layout tree → ordered split sequence), `command-injector` (sequential execution of commands array with 500ms delay between each).
- **`adapters/terminal/`** — `TerminalAdapter` interface with `GhosttyAdapter` implementation via AppleScript (`execa`). Factory `createTerminalAdapter(config)` selects by terminal type.
- **`adapters/ide/`** — `IdeAdapter` interface with `CursorAdapter` for IDE-specific context.

#### Key Patterns

- **Adapter pattern** — Terminal and IDE operations behind interfaces for extensibility (Ghostty today, iTerm2/WezTerm later).
- **Tree-based layouts** — `LayoutNode = PaneLeaf | LayoutContainer` recursive type. `buildSplitSequence` does DFS to produce ordered actions. `collectLeaves` gathers all terminal panes.
- **Result monad** — `ok<T>()` / `err<E>()` with `isSuccess`/`isFailure` guards. Used by sync engine for error reporting.
- **Idempotent tab management** — Tabs matched by title `[WorkspaceSync] <dirname>`. Existing tabs are reused (no process destruction).
- **Sequential command injection** — Each pane supports a `commands` array. Commands execute in order with 500ms delay between each (Ghostty AppleScript cannot detect command completion).

#### Configuration

Layout is configured in VS Code/Cursor global settings (`settings.json`):

```json
{
  "ideTuiBridge.layout": {
    "direction": "horizontal",
    "panes": [
      { "id": "pane_top", "auto_focus": true, "commands": ["claude"] },
      {
        "direction": "vertical",
        "panes": [
          { "id": "pane_bottom_left", "commands": ["npm run dev"] },
          { "id": "pane_bottom_right", "commands": [] }
        ]
      }
    ]
  }
}
```

If no layout is configured, a single-pane default is used.

#### TypeScript Setup

- **Module**: NodeNext (ESM). All internal imports use `.js` extensions.
- **Target**: ES2022. Node.js >= 20.
- **Project references**: Root `tsconfig.json` references both packages. `composite: true` for incremental builds.
- **Tests**: Vitest with `@ide-tui-bridge/engine` aliased to `packages/engine/src` for source-level imports.

#### Platform

macOS only. Ghostty terminal v1.3.0+. AppleScript used for terminal automation.
