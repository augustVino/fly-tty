# Fly TTY

Eliminate context-switching friction in dual-screen development. One click to launch your terminal with the perfect split layout.

![macOS](https://img.shields.io/badge/platform-macOS-blue)
![Ghostty](https://img.shields.io/badge/terminal-Ghostty-green)
![iTerm2](https://img.shields.io/badge/terminal-iTerm2-yellowgreen)
![VS Code](https://img.shields.io/badge/VS%20Code-1.96+-blue)

## What It Does

When you're working in an IDE with a terminal beside it, you typically:
1. Open a terminal window
2. Navigate to the project directory
3. Split into panes
4. Run startup commands in each pane

**Fly TTY does all of this in one click.**

Click the editor title bar icon or run the **Fly TTY: Open Project** command, and it:
- Launches (or activates) Ghostty/iTerm2 terminal
- Creates or reuses a project tab
- Builds your configured multi-pane layout
- Injects startup commands into each pane

## Usage

### Quick Start

1. Install the extension
2. Open a project folder in VS Code / Cursor
3. Click the **Fly TTY icon** in the editor title bar, or run the **Fly TTY: Open Project** command from the command palette

### Configuration

Configure via VS Code/Cursor settings (`flyTty.*`):

```json
{
  "flyTty.terminal": "ghostty",
  "flyTty.terminalPath": "/Applications/Ghostty.app",
  "flyTty.layout": {
    "direction": "horizontal",
    "panes": [
      {
        "id": "pane_top",
        "auto_focus": true,
        "commands": ["git status"]
      },
      {
        "direction": "vertical",
        "panes": [
          {
            "id": "pane_bottom_left",
            "commands": ["npm run dev"]
          },
          {
            "id": "pane_bottom_right",
            "commands": []
          }
        ]
      }
    ]
  }
}
```

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `flyTty.terminal` | `"ghostty"` | Terminal application: `"ghostty"` or `"iterm2"` |
| `flyTty.terminalPath` | `""` | Custom path to terminal app (e.g. `/Applications/Ghostty.app`). Leave empty for default. |
| `flyTty.layout` | — | Inline layout config (see Layout Reference below). When not set, defaults to a single pane. |

### Config Priority

1. VS Code setting `flyTty.layout` (highest)
2. Default single-pane layout (fallback)

## Layout Reference

Layouts are defined as a recursive tree. The root can be either a leaf pane (single pane, no splits) or a container (splits the pane into multiple children):

```json
{
  "direction": "vertical",
  "panes": [
    {
      "id": "main",
      "commands": ["npm run dev"]
    },
    {
      "id": "git",
      "commands": ["lazygit"]
    },
    {
      "direction": "horizontal",
      "panes": [
        {
          "id": "tests",
          "commands": ["npm test"]
        },
        {
          "id": "logs",
          "cwd": "/path/to/project",
          "commands": ["tail -f log/development.log"]
        }
      ]
    }
  ]
}
```

### Leaf Pane Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | string | required | Unique identifier within the layout |
| `commands` | string[] | `[]` | Shell commands to execute in order |
| `auto_focus` | boolean | `false` | Focus this pane after layout creation |
| `cwd` | string | — | Override working directory for this pane. If not set, inherits from the project path. |

### Container Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `direction` | string | required | `"horizontal"` (top/bottom split), `"vertical"` (left/right split), or `"none"` (single pane, no split) |
| `panes` | array | required | Child panes or nested containers. Must have >= 2 items for `horizontal`/`vertical`, >= 1 for `none`. |

### Direction Semantics

- `"horizontal"` — panes stack top-to-bottom (terminal `down` split)
- `"vertical"` — panes stack left-to-right (terminal `right` split)
- `"none"` — no split, single pane (allows panes >= 1)

## Requirements

- **macOS** — requires AppleScript automation support
- **Ghostty** terminal v1.3.0+ or **iTerm2**
- **VS Code** 1.96+ / Cursor

## How It Works

The extension uses AppleScript to automate the terminal:

- **Tab identification**: Titles are formatted as `[WorkspaceSync] <project-dirname>`. iTerm2 additionally uses a persistent `user.workspaceProjectPath` session variable that survives shell escape sequence overwrites, making tab reuse more reliable.
- **Tab title setting (Ghostty)**: Titles are set at creation time via `initial input` in Ghostty's `surface configuration`, ensuring the title appears before the shell prompt — no visible command text in terminal output.
- **Tab title setting (iTerm2)**: Titles are set via `setSessionName` and the `workspaceProjectPath` user variable, which survives shell escape sequence overwrites.
- **Pane navigation**: Ghostty uses terminal UUIDs; iTerm2 uses session IDs for reliable navigation across splits. Both track pane/session IDs internally via a cache that is refreshed after each split.
- **Existing tabs are reused**: No process destruction. If a matching tab exists, it is focused instead of creating a new one.
- **Layout is built via DFS traversal**: The layout tree is converted into an ordered sequence of split actions via `buildSplitSequence`. Each split carries the `cwd` of its first leaf descendant.
- **iTerm2 differences**: Uses `write text` (auto-appends newline), sets working directory via `cd` command after tab/split creation (not atomic like Ghostty's surface config), and uses a 500ms settle delay (vs 300ms for Ghostty).

## Commands

| Command | Description |
|---------|-------------|
| `Fly TTY: Open Project` | Sync workspace to terminal with configured layout |

The command is also available as an icon button in the editor title bar (shown when a workspace folder is open).

## Tab Reuse Strategy

When you sync the same project multiple times, Fly TTY reuses the existing tab instead of creating a new one. The fallback chain differs between terminals:

### Ghostty

1. **Exact title match** — tab title equals `[WorkspaceSync] <project>`
2. **Directory name in title** — unique match by project dirname (shell prompt may overwrite the prefix)
3. **Terminal-level title match** — exact match against terminal `name` from Ghostty's AppleScript dictionary
4. **Working directory match** — unique match by terminal `working directory`

### iTerm2

1. **User variable match** — session `user.workspaceProjectPath` equals the project path (most reliable, immune to shell title overwrites)
2. **Exact title match** — tab title equals `[WorkspaceSync] <project>`
3. **Directory name in title** — unique match by project dirname
4. **Tab CWD lookup** — match by first session's working directory (resolved via `tty` + `lsof`)

## Changelog

### v0.3.0

- **Improved tab title handling**: Tab titles are now set at creation time via Ghostty's `initial input` surface configuration instead of OSC escape sequences injected post-creation. This eliminates visible command text in the terminal output.
- **Removed `activationEvents`**: The extension now activates on VS Code startup for more responsive command availability.

## License

[MIT](./LICENSE)
