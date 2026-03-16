# Fly TTY

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

**Fly TTY does all of this in one click.**

Click the status bar button or run the **Fly TTY: Open Project** command, and it:
- Launches (or activates) Ghostty/iTerm2 terminal
- Creates or reuses a project tab
- Builds your configured multi-pane layout
- Injects startup commands into each pane

## Usage

### Quick Start

1. Install the extension
2. Open a project folder in VS Code / Cursor
3. Click **`$(terminal) Sync`** in the status bar (bottom-right)

### Configuration

Add a `.fly-tty.yml` file in your project root:

```yaml
version: "1.0"
terminal: ghostty
layout:
  direction: horizontal
  panes:
    - id: pane_top
      auto_focus: true
      commands:
        - git status
    - direction: vertical
      panes:
        - id: pane_bottom_left
          commands:
            - npm run dev
        - id: pane_bottom_right
          commands: []
```

### Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `flyTty.terminal` | `ghostty` | Terminal application (`ghostty` or `iterm2`) |
| `flyTty.terminalPath` | — | Custom path to terminal app |
| `flyTty.layout` | — | Inline layout config |

### Config Priority

1. VS Code setting `flyTty.layout` (highest)
2. Project `.fly-tty.yml`
3. Default single-pane layout (fallback)

## Layout Reference

Layouts are defined as a recursive tree of panes and containers:

```yaml
layout:
  direction: horizontal        # or "vertical"
  panes:
    - id: main                 # Leaf pane with commands
      commands:
        - npm run dev

    - id: git                  # Leaf pane
      commands:
        - lazygit

    - direction: vertical      # Nested container
      panes:
        - id: tests
          commands:
            - npm test
        - id: logs
          commands:
            - tail -f log/development.log
```

### Leaf Pane Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | string | required | Unique identifier within the layout |
| `commands` | string[] | `[]` | Shell commands to execute in order |
| `auto_focus` | boolean | `false` | Focus this pane after layout creation |

### Container Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `direction` | string | required | `"horizontal"` or `"vertical"` split direction |
| `panes` | array | required | Child panes or nested containers |

## Requirements

- **macOS** 12+
- **Ghostty** terminal v1.3.0+ or **iTerm2**
- **VS Code** 1.96+ / Cursor

## How It Works

The extension uses AppleScript to automate the terminal:
- Tabs are identified by title prefix `[WorkspaceSync] <project-name>`
- Existing tabs are reused (no process destruction)
- Layout is built via DFS traversal of the layout tree

## Commands

| Command | Description |
|---------|-------------|
| `Fly TTY: Open Project` | Sync workspace to terminal with configured layout |

## License

[MIT](./LICENSE)
