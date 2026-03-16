# IDE-TUI Bridge

Eliminate context-switching friction in dual-screen development. One click to launch your terminal with the perfect split layout.

![macOS](https://img.shields.io/badge/platform-macOS-blue)
![Ghostty](https://img.shields.io/badge/terminal-Ghostty-green)
![VS Code](https://img.shields.io/badge/VS%20Code-1.96+-blue)

## What It Does

When you're working in an IDE with a terminal beside it, you typically:
1. Open a terminal window
2. Navigate to the project directory
3. Split into panes
4. Run startup commands in each pane

**IDE-TUI Bridge does all of this in one click.**

Click the status bar button or run the **Workspace Sync: Open Project** command, and it:
- Launches (or activates) Ghostty terminal
- Creates or reuses a project tab
- Builds your configured multi-pane layout
- Injects startup commands into each pane

## Usage

### Quick Start

1. Install the extension
2. Open a project folder in VS Code / Cursor
3. Click **`$(terminal) Sync`** in the status bar (bottom-right)

### Configuration

Add a `.contextsync.yml` file in your project root:

```yaml
version: "1.0"
terminal: ghostty
layout:
  direction: horizontal
  panes:
    - id: pane_top
      auto_focus: true
      command: 'git status'
    - direction: vertical
      panes:
        - id: pane_bottom_left
          command: 'npm run dev'
        - id: pane_bottom_right
          command: ''
```

### Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `ideTuiBridge.ghosttyPath` | `/Applications/Ghostty.app` | Path to Ghostty.app |
| `ideTuiBridge.layout` | — | Inline layout config (overrides `.contextsync.yml`) |

### Config Priority

1. VS Code setting `ideTuiBridge.layout` (highest)
2. Project `.contextsync.yml`
3. Default single-pane layout (fallback)

## Layout Reference

Layouts are defined as a recursive tree of panes and containers:

```yaml
layout:
  direction: horizontal        # or "vertical"
  panes:
    - id: main                 # Leaf pane with a command
      command: 'npm run dev'

    - id: git                  # Leaf pane
      command: 'lazygit'

    - direction: vertical      # Nested container
      panes:
        - id: tests
          command: 'npm test'
        - id: logs
          command: 'tail -f log/development.log'
```

### Leaf Pane Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | string | required | Unique identifier within the layout |
| `command` | string | `""` | Shell command to execute |
| `auto_focus` | boolean | `false` | Focus this pane after layout creation |

### Container Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `direction` | string | required | `"horizontal"` or `"vertical"` split direction |
| `panes` | array | required | Child panes or nested containers |

## Requirements

- **macOS** 12+
- **Ghostty** terminal v1.3.0+
- **VS Code** 1.96+ / Cursor

## How It Works

The extension uses AppleScript to automate Ghostty:
- Tabs are identified by title prefix `[WorkspaceSync] <project-name>`
- Existing tabs are reused (no process destruction)
- Layout is built via DFS traversal of the layout tree

## Commands

| Command | Description |
|---------|-------------|
| `Workspace Sync: Open Project` | Sync workspace to terminal with configured layout |

## License

[MIT](./LICENSE)
