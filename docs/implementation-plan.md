# IDE-TUI Bridge (Workspace Sync) Implementation Plan

## Context

双屏开发时，IDE 与终端之间切换频繁，上下文不一致。本项目构建本地工作流自动化引擎，以 IDE 为触发主轴，自动管理终端的窗口、标签页与分屏布局。首次实现：Cursor IDE + Ghostty 终端（macOS AppleScript API）。

## Technology Stack

- **Core Engine**: TypeScript + Node.js
- **Trigger**: Cursor Extension (VS Code Extension API)
- **Config**: VS Code/Cursor settings (`ideTuiBridge.layout`) + Zod 校验
- **Terminal Control**: Ghostty AppleScript API (macOS)
- **Build**: esbuild (extension), tsc (engine)
- **Test**: Vitest

---

## Phase 1: Project Scaffolding

### Monorepo Structure

```
ide-tui-bridge/
├── .gitignore
├── package.json                    # Workspaces root
├── tsconfig.base.json
├── tsconfig.json
│
├── packages/
│   ├── engine/                     # Core engine library
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types/
│   │       │   ├── index.ts
│   │       │   ├── config.ts
│   │       │   ├── adapter.ts
│   │       │   ├── layout.ts       # 布局树类型定义
│   │       │   └── result.ts
│   │       ├── config/
│   │       │   ├── index.ts
│   │       │   ├── schema.ts       # Zod schemas
│   │       │   └── defaults.ts
│   │       ├── core/
│   │       │   ├── index.ts
│   │       │   ├── sync-engine.ts
│   │       │   ├── window-manager.ts
│   │       │   ├── tab-manager.ts
│   │       │   ├── layout-builder.ts    # 树形布局 → 分屏动作序列
│   │       │   └── command-injector.ts
│   │       └── adapters/
│   │           ├── index.ts
│   │           ├── terminal/
│   │           │   ├── index.ts
│   │           │   ├── ghostty-adapter.ts
│   │           │   └── ghostty-applescript.ts
│   │           └── ide/
│   │               ├── index.ts
│   │               └── cursor-adapter.ts
│   │
│   └── extension/
│       ├── package.json
│       ├── tsconfig.json
│       ├── esbuild.js
│       ├── src/
│       │   ├── extension.ts
│       │   └── command-handler.ts
│       └── media/
│
├── tests/
│   └── engine/
│       ├── config.test.ts
│       ├── layout-builder.test.ts
│       ├── sync-engine.test.ts
│       └── ghostty-adapter.test.ts
│
└── docs/
    ├── prd.md
    └── implementation-plan.md
```

### Key Dependencies

| 包 | 用途 | 位置 |
|----|------|------|
| `zod` | 配置校验 | engine |
| `execa` | 子进程管理 | engine |
| `vitest` | 测试框架 | root (dev) |
| `esbuild` | Extension 打包 | extension (dev) |
| `@vscode/vsce` | .vsix 打包 | extension (dev) |

---

## Phase 2: Flexible Layout Configuration

### 设计思路：树形布局定义

用嵌套的树结构描述分屏关系，`direction` 决定分割方向，叶子节点是实际 pane，中间节点是容器。

### 配置示例

```json
// VS Code/Cursor settings.json — 三面板（上 1 + 下 2）
{
  "ideTuiBridge.layout": {
    "direction": "horizontal",
    "panes": [
      {
        "id": "pane_top",
        "auto_focus": true,
        "commands": ["command"]
      },
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

```json
// VS Code/Cursor settings.json — 双面板（左右分）
{
  "ideTuiBridge.layout": {
    "direction": "vertical",
    "panes": [
      { "id": "pane_left", "auto_focus": true, "commands": ["npm run dev"] },
      { "id": "pane_right", "commands": [] }
    ]
  }
}
```

```json
// VS Code/Cursor settings.json — 双面板（上下分）
{
  "ideTuiBridge.layout": {
    "direction": "horizontal",
    "panes": [
      { "id": "pane_top", "commands": ["command"] },
      { "id": "pane_bottom", "commands": ["npm run dev"] }
    ]
  }
}
```

```json
// VS Code/Cursor settings.json — 单面板
{
  "ideTuiBridge.layout": {
    "direction": "none",
    "panes": [
      { "id": "main", "commands": ["npm run dev"] }
    ]
  }
}
```

### 类型定义 (`packages/engine/src/types/layout.ts`)

```typescript
// 方向：horizontal = 上下分屏, vertical = 左右分屏, none = 无分屏
export type SplitDirection = 'horizontal' | 'vertical' | 'none'

// 叶子节点 = 实际面板
export interface PaneLeaf {
  id: string
  auto_focus?: boolean
  commands?: string[]
  cwd?: string
}

// 中间节点 = 容器（含嵌套分屏）
export interface LayoutContainer {
  direction: SplitDirection
  panes: LayoutNode[]
}

// 联合类型
export type LayoutNode = PaneLeaf | LayoutContainer

// 类型守卫
export function isPaneLeaf(node: LayoutNode): node is PaneLeaf {
  return 'id' in node && !('direction' in node)
}

export function isLayoutContainer(node: LayoutNode): node is LayoutContainer {
  return 'direction' in node && 'panes' in node
}
```

### Zod Schema (`packages/engine/src/config/schema.ts`)

```typescript
const PaneLeafSchema = z.object({
  id: z.string(),
  auto_focus: z.boolean().default(false),
  commands: z.array(z.string()).default([]),
  cwd: z.string().optional(),
})

const LayoutNodeSchema: z.ZodType<LayoutNode> = z.discriminatedUnion('direction', [
  z.object({
    direction: z.literal('none'),
    panes: z.array(PaneLeafSchema).min(1),
  }),
  z.object({
    direction: z.enum(['horizontal', 'vertical']),
    panes: z.array(z.lazy(() => LayoutNodeSchema)).min(2),
  }),
])

// 实际上 discriminatedUnion 对嵌套不太好用，改用 z.union + refine
const LayoutContainerSchema = z.object({
  direction: z.enum(['horizontal', 'vertical', 'none']),
  panes: z.array(z.any()).min(1),
}).refine(
  (data) => {
    if (data.direction === 'none') return data.panes.length >= 1
    return data.panes.length >= 2
  },
  { message: 'Pane count mismatch for direction' }
)
```

### layout-builder.ts — 树形遍历 → 分屏动作序列

```typescript
// 将树形布局转换为有序的 Split 动作列表
function buildSplitSequence(node: LayoutNode, actions: SplitAction[] = []): SplitAction[] {
  if (isPaneLeaf(node)) {
    return actions
  }

  const container = node as LayoutContainer

  container.panes.forEach((child, index) => {
    if (index > 0) {
      // 从第 2 个子节点开始需要分屏
      actions.push({
        direction: container.direction, // horizontal → split down, vertical → split right
      })
    }
    buildSplitSequence(child, actions)
  })

  return actions
}

// direction 映射到 Ghostty split 命令
// horizontal (上下) → Ghostty "split down"
// vertical (左右)   → Ghostty "split right"
```

### 三面板示例的动作序列

```
输入: horizontal → [pane_top, vertical → [pane_bottom_left, pane_bottom_right]]

生成序列:
1. split down    → 上下分（pane_top vs 其余）
2. split right   → 下方左右分（pane_bottom_left vs pane_bottom_right）

可视化:
┌──────────────────┐
│   pane_top       │
├────────┬─────────┤
│ pane_  │ pane_   │
│ bottom │ bottom  │
│ _left  │ _right  │
└────────┴─────────┘
```

### 双面板示例的动作序列

```
输入: vertical → [pane_left, pane_right]

生成序列:
1. split right   → 左右分

可视化:
┌────────┬─────────┐
│        │         │
│ pane_  │ pane_   │
│ left   │ right   │
│        │         │
└────────┴─────────┘
```

### command-injector.ts — 按树序注入命令

遍历布局树的所有叶子节点（pane），按 DFS 顺序依次 `navigateToPane` + `sendCommand`。每个面板支持 `commands` 数组，按顺序执行，命令之间间隔 500ms。

---

## Phase 3: Type Definitions & Adapter Interfaces

### TerminalAdapter (`packages/engine/src/types/adapter.ts`)

```typescript
export interface TerminalAdapter {
  readonly name: string
  ensureRunning(): Promise<void>
  activateWindow(): Promise<void>
  listTabs(): Promise<TerminalTab[]>
  findTabByProject(projectPath: string): Promise<TerminalTab | null>
  createTab(title?: string): Promise<TerminalTab>
  focusTab(tab: TerminalTab): Promise<void>
  splitPane(direction: 'right' | 'down'): Promise<void>
  sendText(text: string): Promise<void>
  sendCommand(command: string): Promise<void>
  navigateToPane(index: number): Promise<void>
}
```

---

## Phase 4: Ghostty Adapter (AppleScript)

### AppleScript 调用方式

`execa('osascript', ['-e', script])` 执行 AppleScript。

### 命令映射

| 操作 | AppleScript |
|------|-------------|
| 启动/激活 | `tell application "Ghostty" to activate` |
| 新建窗口 | `new window with properties {working directory:"/path"}` |
| 新建标签页 | `new tab` |
| 上下分屏 | `split down` |
| 左右分屏 | `split right` |
| 发送文本 | `input text "cmd\n"` |
| 选择标签页 | `select tab N` |
| 获取标签标题 | `name of every tab of front window` |

### 文件分工

- `ghostty-applescript.ts`: 底层 osascript 封装
- `ghostty-adapter.ts`: TerminalAdapter 接口实现

### 关键实现

- **ensureRunning()**: `pgrep -x Ghostty` → 不存在则 `open -a Ghostty`
- **findTabByProject()**: 遍历标签标题匹配 `[WorkspaceSync] <dirname>`
- **splitPane()**: `horizontal` → `split down`, `vertical` → `split right`
- **Tab 标识策略**: 标题格式 `[WorkspaceSync] <project-dirname>`

---

## Phase 5: Core Engine

### sync-engine.ts 主流程

```
sync({ projectPath, layout? })
  │
  ├─ 1. resolveConfig(options)          // 使用 VS Code settings 中的 layout（无则默认单面板）
  ├─ 2. createTerminalAdapter(config)
  ├─ 3. windowManager.ensureWindow()    // 启动/激活 Ghostty
  ├─ 4. tabManager.resolveTab(path)     // 查找 → 复用 / 新建
  ├─ 5. IF 新建 Tab:
  │     └─ layoutBuilder.build(config.layout, config.panes)
  │        └─ 树形遍历 → 生成 Split 动作序列 → 顺序执行
  └─ 6. commandInjector.inject(panes)   // DFS 遍历叶子节点 → commands 数组顺序执行
```

---

## Phase 6: Cursor Extension

### 命令

- ID: `ideTuiBridge.openProject`
- 标题: "Workspace Sync: Open Project"
- 流程: workspace root → `engine.sync()` → OutputChannel

### 配置项

- `ideTuiBridge.ghosttyPath`: 默认 `/Applications/Ghostty.app`
- `ideTuiBridge.layout`: 终端布局配置（JSON object）

---

## Phase 7: Testing

| 测试文件 | 覆盖范围 |
|----------|----------|
| `config.test.ts` | Zod 校验、默认值、多命令支持 |
| `layout-builder.test.ts` | **重点**: 树形布局 → 分屏动作序列、各种布局变体 |
| `sync-engine.test.ts` | 主流程编排（mock adapter） |
| `ghostty-adapter.test.ts` | AppleScript 调用序列 mock |

layout-builder 测试用例:
- 单面板 → 无 split 动作
- 双面板左右 → 1 个 split right
- 双面板上下 → 1 个 split down
- 三面板上+下左下右 → split down + split right
- 四面板（2x2）→ split down + split right + split right
- 深层嵌套布局

---

## Phase 8: Build & Distribution

```bash
npm run build
npm run test:coverage
cd packages/extension && npm run package  # → .vsix
code --install-extension *.vsix
```

---

## Implementation Order

| 步骤 | 内容 | 文件数 |
|------|------|--------|
| 1 | 脚手架: package.json, tsconfig, .gitignore | 5 |
| 2 | 类型定义: types/ (adapter, config, result, layout) | 4 |
| 3 | 配置模块: config/ (schema, defaults) | 3 |
| 4 | Ghostty AppleScript 封装 | 2 |
| 5 | GhosttyAdapter 实现 | 2 |
| 6 | Core Engine (sync-engine, layout-builder, managers) | 6 |
| 7 | Cursor Extension | 4 |
| 8 | 单元测试 | 4 |
| **Total** | | **~29 files** |

---

## Verification Plan

```bash
# 1. 单元测试
npm run test
npm run test:coverage  # 目标 80%+

# 2. 类型检查
npm run typecheck

# 3. 集成测试（手动）
# - Ghostty: macos-applescript = true
# - 创建多个测试项目，分别使用不同布局配置:
#   a. 单面板配置
#   b. 双面板左右配置
#   c. 三面板（默认）配置
# - Cursor 中执行 Workspace Sync: Open Project
# - 验证: 窗口激活 → Tab 创建/复用 → 布局正确 → 命令执行
# - 二次执行验证幂等性
# - 手动调整面板后再次执行验证防退化
```
