# 架构指南

## Monorepo 结构

```
ide-tui-bridge/
├── packages/
│   ├── engine/          # @ide-tui-bridge/engine - 核心库
│   │   └── src/
│   │       ├── config/      # Schema 校验与默认值
│   │       ├── core/        # 同步引擎、布局构建、Tab管理
│   │       ├── adapters/    # 终端/IDE 适配器
│   │       └── types/       # 类型定义
│   └── extension/       # VS Code/Cursor 扩展
└── tests/               # Vitest 测试（根目录）
```

## 核心管道

`sync-engine.ts` 执行完整同步流程：

```
sync({ projectPath, layout? })
  ├─ 1. resolveConfig()        // 使用 VS Code settings 中的 layout（未配置则用默认值）
  ├─ 2. createTerminalAdapter()
  ├─ 3. ensureWindow()         // 启动/激活终端
  ├─ 4. resolveTab()           // 按标题前缀查找或创建 Tab
  ├─ 5. buildLayout()          // 新 Tab: DFS 遍历 → 分屏动作序列
  └─ 6. injectCommands()       // 每个面板按顺序执行 commands 数组（500ms 间隔）
```

## 关键模块

| 模块 | 职责 |
|------|------|
| `config/` | Zod schema 校验 layout 结构，提供默认配置 |
| `core/layout-builder.ts` | 树形遍历 → 有序分屏动作（`buildSplitSequence`） |
| `core/tab-manager.ts` | 幂等查找或创建，标题格式 `[WorkspaceSync] <dirname>` |
| `core/command-injector.ts` | 遍历面板，按顺序执行 `commands` 数组 |
| `adapters/terminal/` | `TerminalAdapter` 接口 + `GhosttyAdapter`（AppleScript） |
| `types/layout.ts` | 递归类型 `LayoutNode = PaneLeaf \| LayoutContainer` |

## 设计模式

### Adapter 模式
终端操作封装在 `TerminalAdapter` 接口后。添加新终端（iTerm2/WezTerm）只需实现此接口。

### 树形布局
- `LayoutContainer`：包含 `direction` 和嵌套的 `panes`
- `PaneLeaf`：实际面板，含 `id`、`commands`、`auto_focus`
- `buildSplitSequence`：DFS 遍历生成有序分屏动作

### Result Monad
```typescript
// 函数式错误处理（sync 返回 Result<SyncResult>）
const result = await sync({ projectPath, layout })
if (result.ok) {
  // result.value
} else {
  // result.error
}
```

### 不可变性
- 所有返回的数组使用 `Object.freeze()`
- 禁止输入参数变更
