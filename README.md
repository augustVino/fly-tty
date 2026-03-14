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

- **`packages/engine`** (`@ide-tui-bridge/engine`) — Core library. Loads `.contextsync.yml` config, orchestrates terminal control. No UI dependency.
- **`packages/extension`** — VS Code/Cursor extension. Registers the `ideTuiBridge.openProject` command, calls into the engine.
- **`tests/`** — Root-level Vitest test directory. Aliased so tests import `@ide-tui-bridge/engine` directly from source.

#### Core Engine Pipeline

`sync-engine.ts` runs the full pipeline: `loadConfig` → `createAdapter` → `ensureWindow` → `resolveTab` → `buildLayout` → `injectCommands`.

Key modules:
- **`config/`** — Zod schema validates the recursive layout tree from YAML. Loader returns a `Result<T, E>` monad for functional error handling with fallback to defaults.
- **`core/`** — `window-manager` (launch/activate terminal), `tab-manager` (idempotent find-or-create by title prefix), `layout-builder` (DFS traversal of layout tree → ordered split sequence), `command-injector` (cd + command per leaf pane).
- **`adapters/terminal/`** — `TerminalAdapter` interface with `GhosttyAdapter` implementation via AppleScript (`execa`). Factory `createTerminalAdapter(config)` selects by terminal type.
- **`adapters/ide/`** — `IdeAdapter` interface with `CursorAdapter` for IDE-specific context.

#### Key Patterns

- **Adapter pattern** — Terminal and IDE operations behind interfaces for extensibility (Ghostty today, iTerm2/WezTerm later).
- **Tree-based layouts** — `LayoutNode = PaneLeaf | LayoutContainer` recursive type. `buildSplitSequence` does DFS to produce ordered actions. `collectLeaves` gathers all terminal panes.
- **Result monad** — `ok<T>()` / `err<E>()` with `isSuccess`/`isFailure` guards. Used by config loader; engine falls back to defaults on failure.
- **Idempotent tab management** — Tabs matched by title `[WorkspaceSync] <dirname>`. Existing tabs are reused (no process destruction).
- **Immutability** — All returned arrays are `Object.freeze`d. No input mutation.

#### Configuration

Projects create `.contextsync.yml` in their root:

```yaml
version: "1.0"
terminal: ghostty
layout:
  direction: horizontal
  panes:
    - id: pane_top
      auto_focus: true
      command: 'command'
    - direction: vertical
      panes:
        - id: pane_bottom_left
          command: 'npm run dev'
        - id: pane_bottom_right
          command: ''
```

#### TypeScript Setup

- **Module**: NodeNext (ESM). All internal imports use `.js` extensions.
- **Target**: ES2022. Node.js >= 20.
- **Project references**: Root `tsconfig.json` references both packages. `composite: true` for incremental builds.
- **Tests**: Vitest with `@ide-tui-bridge/engine` aliased to `packages/engine/src` for source-level imports.

#### Platform

macOS only. Ghostty terminal v1.3.0+. AppleScript used for terminal automation.
