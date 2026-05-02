# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Fly TTY

本地工作流自动化引擎 — IDE 一键触发终端分屏布局与启动命令注入。

## 命令

```bash
npm run build           # 构建所有 workspaces (tsc)
npm run test            # Vitest verbose 模式运行 tests/
npm run test:coverage   # 测试 + 覆盖率报告
npm run typecheck       # tsc --build（项目引用增量检查）

npx vitest run tests/engine/xxx.test.ts  # 单文件测试
npx vitest                               # watch 模式

cd packages/extension && npm run build    # esbuild 打包扩展
cd packages/extension && npm run package  # vsce 生成 .vsix
```

## 平台约束

- **仅 macOS**：通过 AppleScript 自动化 Ghostty / iTerm2
- **Ghostty** v1.3.0+ 或 **iTerm2**
- **VS Code** 1.96+ / Cursor

## TypeScript 规则

- **模块系统**: NodeNext (ESM)，内部导入**必须带 `.js` 扩展名**
- **目标**: ES2022, Node.js >= 20
- **项目引用**: `composite: true` 增量构建，根 `tsconfig.json` 引用 `packages/engine` 和 `packages/extension`
- **Vitest 路径别名**: `@fly-tty/engine` → `packages/engine/src`

## Monorepo 结构

```
packages/
├── engine/          # @fly-tty/engine — 核心库（纯逻辑，可独立测试）
│   └── src/
│       ├── config/      # Zod schema 校验 + 默认配置
│       ├── core/        # 同步引擎、布局构建、Tab/Window 管理、命令注入
│       ├── adapters/    # TerminalAdapter 接口 + Ghostty/iTerm2 AppleScript 实现
│       └── types/       # LayoutNode、Result monad、TerminalAdapter 接口
└── extension/       # VS Code/Cursor 扩展（esbuild 打包）
tests/               # Vitest 测试（根目录，非各 package 内）
```

## 核心同步管道 (`sync-engine.ts`)

```
sync({ projectPath, layout?, terminal? })
  ├─ resolveConfig()        // Zod 校验 layout，合并默认值
  ├─ createTerminalAdapter() // 工厂方法：ghostty | iterm2
  ├─ ensureWindow()         // 启动/激活终端窗口
  ├─ resolveTab()           // 幂等查找或创建 Tab（标题 [WorkspaceSync] <dirname>）
  │   └─ 仅新 Tab 继续以下步骤：
  ├─ buildSplitSequence()   // DFS 遍历布局树 → 有序 split 动作序列
  └─ injectCommands()       // 按 DFS 顺序遍历叶子面板，逐个注入 commands（500ms 间隔）
```

## 关键设计模式

| 模式 | 实现位置 |
|------|----------|
| **Adapter** | `TerminalAdapter` 接口 → `GhosttyAdapter` / `ITerm2Adapter`，新增终端只需实现接口 |
| **树形布局** | `LayoutNode = PaneLeaf \| LayoutContainer`，`buildSplitSequence()` DFS → split 动作序列 |
| **Result Monad** | `Result<T, E> = Success<T> \| Failure<E>`，所有核心函数返回 Result |
| **不可变性** | 返回数组用 `Object.freeze()`，参数用 `readonly` |

## Tab 复用策略

同一项目多次同步时复用已有 Tab（不销毁进程）。查找优先级：

- **Ghostty**: 精确标题匹配 → 目录名匹配 → 终端 name 匹配 → working directory 匹配
- **iTerm2**: user variable (`workspaceProjectPath`) → 标题匹配 → 目录名 → Tab CWD lookup

## 终端适配器差异

| 特性 | Ghostty | iTerm2 |
|------|---------|--------|
| 标题设置 | 创建时 `initial input` surface config | `setSessionName` + user variable |
| 分屏标识 | Terminal UUID | Session ID |
| 工作目录 | surface config 原子设置 | `cd` 命令（非原子） |
| settle 延迟 | 300ms | 500ms |
| 文本输入 | `sendText` | `write text`（自动追加换行） |

## 配置格式

用户在 VS Code settings 中配置 `flyTty.layout`（递归树结构）。详见 [.claude/config-format.md](.claude/config-format.md)。

完整架构文档见 [.claude/architecture.md](.claude/architecture.md)。
