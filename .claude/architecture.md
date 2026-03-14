# 架构指南

## Monorepo 结构

```
ide-tui-bridge/
├── packages/
│   ├── engine/          # @ide-tui-bridge/engine - 核心库
│   │   └── src/
│   │       ├── config/      # 配置加载与校验
│   │       ├── core/        # 同步引擎、布局构建、Tab管理
│   │       ├── adapters/    # 终端/IDE 适配器
│   │       └── types/       # 类型定义
│   └── extension/       # VS Code/Cursor 扩展
└── tests/               # Vitest 测试（根目录）
```

## 核心管道

`sync-engine.ts` 执行完整同步流程：

```
sync(projectPath)
  ├─ 1. loadConfig()           // 加载 .contextsync.yml（失败回退默认值）
  ├─ 2. createTerminalAdapter()
  ├─ 3. ensureWindow()         // 启动/激活终端
  ├─ 4. resolveTab()           // 按标题前缀查找或创建 Tab
  ├─ 5. buildLayout()          // 新 Tab: DFS 遍历 → 分屏动作序列
  └─ 6. injectCommands()       // 每个面板执行 cd + 命令
```

## 关键模块

| 模块 | 职责 |
|------|------|
| `config/` | Zod schema 校验 YAML，`Result<T,E>` 函数式错误处理 |
| `core/layout-builder.ts` | 树形遍历 → 有序分屏动作（`buildSplitSequence`） |
| `core/tab-manager.ts` | 幂等查找或创建，标题格式 `[WorkspaceSync] <dirname>` |
| `core/command-injector.ts` | 遍历面板，发送 `cd` 和启动命令 |
| `adapters/terminal/` | `TerminalAdapter` 接口 + `GhosttyAdapter`（AppleScript） |
| `types/layout.ts` | 递归类型 `LayoutNode = PaneLeaf \| LayoutContainer` |

## 设计模式

### Adapter 模式
终端操作封装在 `TerminalAdapter` 接口后。添加新终端（iTerm2/WezTerm）只需实现此接口。

### 树形布局
- `LayoutContainer`：包含 `direction` 和嵌套的 `panes`
- `PaneLeaf`：实际面板，含 `id`、`command`、`auto_focus`
- `buildSplitSequence`：DFS 遍历生成有序分屏动作

### Result Monad
```typescript
// 函数式错误处理
const result = await loadConfig(path)
if (result.ok) {
  // result.value
} else {
  // result.error，回退默认值
}
```

### 不可变性
- 所有返回的数组使用 `Object.freeze()`
- 禁止输入参数变更
