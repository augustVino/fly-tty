# IDE-TUI Bridge 审查报告

## 概述

本文档是对 PRD 和实施计划的质疑者（Devil's Advocate）审查，旨在识别潜在风险、边界情况和设计缺陷，帮助项目团队提高产品可靠性和用户体验。

---

## CRITICAL 级别问题

### C1. AppleScript API 版本依赖风险

**问题描述：**
实施计划假设 Ghostty 提供 v1.3.0+ 的 AppleScript API，但未明确验证该 API 的具体能力和稳定性。根据官方文档，Ghostty 1.3.0 确实引入了 AppleScript 支持，但实施计划中的某些操作（如 `split pane`）的实际 API 细节需要进一步验证。

**具体风险：**
- API 命名可能与计划不一致（如文档中使用 `split` 而非独立的 split 命令）
- 某些操作可能不支持或表现与预期不同
- 未考虑 API 未来变更的兼容性

**建议解决方案：**
1. 在实施前编写验证脚本，测试所有计划使用的 API 操作
2. 在项目中维护 Ghostty API 兼容性测试
3. 在配置文件中添加 `minimumGhosttyVersion` 字段，启动时验证版本

**验证脚本示例：**
```bash
#!/bin/bash
# 验证 Ghostty AppleScript API
VERSION=$(osascript -e 'tell application "Ghostty" to get version' 2>/dev/null)
if [ $? -ne 0 ]; then
  echo "ERROR: Ghostty AppleScript support not available"
  exit 1
fi

# 测试关键 API 操作
osascript -e 'tell application "Ghostty" to get windows' 2>/dev/null
if [ $? -ne 0 ]; then
  echo "ERROR: Cannot query windows via AppleScript"
  exit 1
fi
```

---

### C2. Tab 命名冲突与误识别风险

**问题描述：**
PRD 计划通过标题格式 `[WorkspaceSync] <project-dirname>` 来标识项目 Tab，但这存在严重风险：
1. 用户可能手动创建同名 Tab
2. 不同项目可能有相同的目录名
3. 项目目录包含特殊字符时可能造成匹配错误

**具体风险场景：**
- 用户在两个不同位置有 `my-project` 目录，系统可能误操作错误的 Tab
- 用户手动创建名为 `[WorkspaceSync] my-project` 的 Tab，系统误以为是管理的 Tab
- 项目路径包含特殊字符（如 `#`, `[`, `]`）时，标题匹配逻辑可能失败

**建议解决方案：**
1. 使用 Ghostty 的 `working directory` 属性进行精确匹配，而非依赖标题
2. 在 Tab 标题中包含唯一标识符（如项目路径的哈希或完整路径）
3. 维护内部状态表（如临时文件或内存映射）来跟踪管理的 Tab

**改进后的标识策略：**
```typescript
// 使用 working directory + 标题前缀双重验证
interface TabIdentifier {
  projectPath: string
  managedPrefix: '[WorkspaceSync]'
}

// 验证 Tab 是否为项目管理的 Tab
function isManagedTab(tab: TerminalTab, projectPath: string): boolean {
  return tab.title.startsWith('[WorkspaceSync]') &&
         normalizePath(tab.workingDirectory) === normalizePath(projectPath)
}
```

---

## HIGH 级别问题

### H1. Ghostty 未安装或禁用 AppleScript 的情况

**问题描述：**
实施计划中 `ensureRunning()` 只检查 Ghostty 是否运行，未处理：
1. Ghostty 完全未安装
2. Ghostty 安装但禁用了 AppleScript 支持（`macos-applescript = false`）
3. AppleScript 权限未授予（TCC 权限问题）

**建议解决方案：**
1. 在 `ensureRunning()` 中添加健康检查
2. 提供清晰的错误消息和解决方案指引
3. 在 Extension 设置中添加诊断功能

```typescript
async function ensureGhosttyReady(): Promise<Result<void>> {
  // 检查是否安装
  const installed = await checkGhosttyInstalled()
  if (!installed) {
    return {
      success: false,
      error: 'GHOSTTY_NOT_INSTALLED',
      message: 'Ghostty is not installed. Please install from https://ghostty.org/'
    }
  }

  // 检查 AppleScript 支持
  const asAvailable = await checkAppleScriptSupport()
  if (!asAvailable) {
    return {
      success: false,
      error: 'APPLESCRIPT_DISABLED',
      message: 'Ghostty AppleScript support is disabled. Please set macos-applescript = true in Ghostty config.'
    }
  }

  // 启动/激活
  await launchOrActivateGhostty()
}
```

---

### H2. AppleScript 权限（TCC）问题

**问题描述：**
macOS 会阻止应用间的自动化，需要用户授权。实施计划中未处理权限授予流程：
1. 首次运行会被系统阻止
2. 用户可能在系统提示时意外拒绝权限
3. 权限可能被撤销

**建议解决方案：**
1. 在首次运行前检测权限状态
2. 提供清晰的权限授予指引
3. 在扩展设置中添加"检查权限"按钮

```typescript
async function checkAutomationPermissions(): Promise<PermissionStatus> {
  try {
    await execa('osascript', ['-e', 'tell application "Ghostty" to get version'])
    return 'granted'
  } catch (error) {
    if (error.stderr?.includes('not authorized')) {
      return 'denied'
    }
    return 'unknown'
  }
}

// 在 UI 中显示权限状态和操作指引
function showPermissionHelp() {
  const help = `
  Workspace Sync 需要 Ghostty 的自动化权限：

  1. 打开"系统设置" → "隐私与安全性" → "自动化"
  2. 找到 "Cursor"（或你的 IDE）
  3. 启用 "Ghostty" 的访问权限
  `
  vscode.window.showInformationMessage(
    '需要授权自动化权限',
    '打开设置',
    '查看详情'
  )
}
```

---

### H3. 进程启动后状态未就绪的竞态条件

**问题描述：**
实施计划中启动 Ghostty 后立即执行操作，但进程启动和 AppleScript API 就绪之间存在延迟：
1. Ghostty 启动但 API 尚未响应
2. 新建 Tab 后立即分屏可能失败（Tab 尚未完全初始化）
3. Shell 进程未准备好时发送命令可能丢失

**建议解决方案：**
1. 在关键操作后添加重试机制和延迟
2. 使用 Ghostty 的 `wait after command` 功能（如果可用）
3. 实现健康检查循环，等待状态就绪

```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 200
): Promise<T> {
  let lastError: Error
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (i < maxAttempts - 1) {
        await sleep(delayMs * (i + 1))
      }
    }
  }
  throw lastError
}

// 使用示例
await withRetry(
  () => ghosttyAdapter.splitPane('down'),
  3,
  300
)
```

---

### H4. 多 Ghostty 实例/窗口的处理

**问题描述：**
实施计划假设只有一个 Ghostty 窗口，但用户可能：
1. 有多个 Ghostty 窗口在不同屏幕
2. 使用多个 Ghostty 实例
3. 在全屏模式下使用 Ghostty

**建议解决方案：**
1. 支持配置目标窗口的选择策略
2. 添加 `windowSelector` 配置项
3. 考虑多窗口场景下的 Tab 查找逻辑

```json
// VS Code/Cursor settings.json
{
  "ideTuiBridge.window": {
    "strategy": "create-or-focus-frontmost",
    "name": "Dev Terminal",
    "screen": 1
  }
}
```

---

### H5. 配置语法错误的处理

**问题描述：**
实施计划提到 Zod 校验，但未考虑：
1. VS Code settings 中 layout JSON 格式错误
2. 配置未设置时的默认行为
3. 配置格式变更的向后兼容性

**建议解决方案：**
1. 添加详细的错误报告
2. 提供配置验证功能
3. 维护配置版本和迁移逻辑

```typescript
interface ConfigLoadResult {
  success: boolean
  config?: WorkspaceSyncConfig
  error?: {
    type: 'syntax' | 'validation' | 'not-found'
    line?: number
    message: string
    suggestion?: string
  }
}

// 详细的错误报告
function formatConfigError(error: ConfigError): string {
  if (error.type === 'syntax') {
    return `配置文件语法错误（行 ${error.line}）：${error.message}\n` +
           `建议：检查缩进是否使用空格（2个空格为一级）`
  }
  // ... 其他错误类型
}
```

---

## MEDIUM 级别问题

### M1. 项目路径包含空格和特殊字符

**问题描述：**
项目路径可能包含空格、引号、美元符号等特殊字符，这些在 AppleScript 和 Shell 命令中需要特殊处理。

**测试用例：**
- `/Users/dev/My Project`（空格）
- `/Users/dev/project's files`（单引号）
- `/Users/dev/$project`（美元符号）
- `/Users/dev/[test]`（方括号）

**建议解决方案：**
1. 在所有路径传递前进行转义
2. 使用 Ghostty 的 `POSIX path` 转换
3. 编写专门的路径处理工具函数

```typescript
function escapeAppleScriptPath(path: string): string {
  // AppleScript 字符串转义
  return path
    .replace(/\\/g, '\\\\')  // 反斜杠
    .replace(/"/g, '\\"')   // 双引号
    .replace(/\n/g, '\\n')   // 换行
}

// Ghostty 推荐方式
const posixPath = `POSIX path of "${path}"`
```

---

### M2. 命令执行的安全风险

**问题描述：**
配置文件中的命令直接执行可能带来安全风险：
1. 恶意配置文件可能执行危险命令
2. 命令注入风险（路径中的特殊字符）
3. 没有命令白名单机制

**建议解决方案：**
1. 实现命令沙箱或白名单
2. 在执行前显示命令并请求确认
3. 提供安全配置选项

```typescript
interface CommandSafetyOptions {
  whitelist?: string[]  // 允许的命令前缀
  requireConfirmation?: boolean
  blockedPatterns?: RegExp[]
}

async function executeSafely(
  command: string,
  options: CommandSafetyOptions
): Promise<void> {
  // 检查白名单
  if (options.whitelist) {
    const allowed = options.whitelist.some(prefix => command.startsWith(prefix))
    if (!allowed) {
      throw new Error(`Command not in whitelist: ${command}`)
    }
  }

  // 检查危险模式
  if (options.blockedPatterns) {
    for (const pattern of options.blockedPatterns) {
      if (pattern.test(command)) {
        throw new Error(`Command matches blocked pattern: ${pattern}`)
      }
    }
  }

  // 请求确认
  if (options.requireConfirmation) {
    const confirmed = await vscode.window.showWarningMessage(
      `即将执行命令：${command}`,
      { modal: true },
      '确认执行',
      '取消'
    )
    if (confirmed !== '确认执行') {
      return
    }
  }

  // 执行命令
  await ghosttyAdapter.sendCommand(command)
}
```

---

### M3. 并发调用的安全性

**问题描述：**
如果用户快速多次触发同步，可能导致：
1. 多个操作同时进行，相互干扰
2. Tab 被重复创建
3. 分屏状态错乱

**建议解决方案：**
1. 实现操作队列和锁机制
2. 添加操作状态追踪
3. 支持取消进行中的操作

```typescript
class SyncEngine {
  private currentOperation: Promise<void> | null = null

  async sync(projectPath: string): Promise<void> {
    // 如果已有操作在进行，等待完成
    if (this.currentOperation) {
      vscode.window.showInformationMessage('同步操作进行中，请稍候...')
      return this.currentOperation
    }

    this.currentOperation = this.performSync(projectPath)
    try {
      await this.currentOperation
    } finally {
      this.currentOperation = null
    }
  }

  private async performSync(projectPath: string): Promise<void> {
    // 实际同步逻辑
  }
}
```

---

### M4. 布局状态的持久化

**问题描述：**
PRD 提到"防退化机制"（保留用户手动调整的面板比例），但未说明如何：
1. 检测 Tab 是否由系统管理
2. 保存用户的调整
3. 在复用 Tab 时恢复正确状态

**建议解决方案：**
1. 在 Tab 元数据中存储布局指纹
2. 记录用户的手动调整
3. 提供"重置布局"命令

```typescript
interface TabMetadata {
  managed: boolean
  projectPath: string
  layoutFingerprint: string  // 用于检测布局是否被修改
  lastSync: Date
}

// 检测布局是否被用户修改
async function detectLayoutChanges(
  tab: TerminalTab,
  originalLayout: LayoutTree
): Promise<boolean> {
  const currentStructure = await ghosttyAdapter.getLayoutStructure(tab)
  const originalFingerprint = generateLayoutFingerprint(originalLayout)
  const currentFingerprint = generateLayoutFingerprint(currentStructure)

  return originalFingerprint !== currentFingerprint
}
```

---

### M5. 错误反馈的用户体验

**问题描述：**
实施计划未详细说明错误处理策略：
1. AppleScript 调用失败时的错误信息可能晦涩
2. 部分操作失败时的恢复策略
3. 用户如何诊断问题

**建议解决方案：**
1. 提供用户友好的错误消息
2. 添加详细的日志记录
3. 实现"诊断报告"功能

```typescript
interface UserFriendlyError {
  title: string
  message: string
  action?: {
    label: string
    handler: () => void
  }
  details?: string  // 可展开的详细信息
}

function mapToUserError(error: Error): UserFriendlyError {
  if (error.message.includes('not authorized')) {
    return {
      title: '权限被拒绝',
      message: 'Workspace Sync 需要自动化权限才能控制 Ghostty',
      action: {
        label: '打开系统设置',
        handler: () => openSystemPreferences()
      },
      details: error.stack
    }
  }
  // ... 其他错误映射
}
```

---

## LOW 级别问题

### L1. 首次使用配置体验

**问题描述：**
首次使用时用户需要：
1. 在 VS Code/Cursor settings 中配置 `ideTuiBridge.layout`
2. 理解配置格式
3. 授予系统权限

**建议解决方案：**
1. 在扩展设置中提供配置示例和说明
2. 内置常用配置模板
3. 添加"快速开始"文档链接

---

### L2. 性能监控与优化

**问题描述：**
实施计划未考虑：
1. AppleScript 调用的性能开销
2. 大型项目的处理时间
3. 用户体验的响应性

**建议解决方案：**
1. 添加性能指标收集
2. 在状态栏显示操作进度
3. 提供性能报告

---

## 可扩展性分析

### E1. 未来终端支持难度

**问题描述：**
实施计划设计适配器模式，但需要评估：
1. 支持 iTerm2/WezTerm 的难度
2. 不同终端 API 差异的抽象程度
3. 配置格式的通用性

**分析：**

| 终端 | API 方式 | 实现难度 | 关键差异 |
|------|----------|-----------|----------|
| Ghostty | AppleScript | 低 | 已有完善文档 |
| iTerm2 | AppleScript + Python API | 中 | API 更复杂，需要额外安装 |
| WezTerm | CLI (wezterm cli) | 中 | 需要启动 IPC 服务器 |
| Warp | 协议处理器 | 高 | API 文档有限 |

**建议：**
1. TerminalAdapter 接口设计需考虑 API 能力的最小公倍数
2. 提供能力查询接口（支持的功能列表）
3. 文档中明确各终端的功能差异

---

### E2. 配置格式向后兼容性

**问题描述：**
配置格式可能需要演进，需要考虑：
1. 版本管理策略
2. 迁移工具
3. 弃用字段的兼容性

**建议：**
1. 使用严格的语义化版本
2. 提供配置验证和升级工具
3. 维护迁移指南

```typescript
interface ConfigVersion {
  version: string
  migrate: (config: any) => any
}

const migrations: ConfigVersion[] = [
  {
    version: '1.0',
    migrate: (config) => config
  },
  {
    version: '1.1',
    migrate: (config) => {
      // 添加新字段的默认值
      if (!config.options) {
        config.options = { ...defaultOptions }
      }
      return config
    }
  }
]

function migrateConfig(config: any, targetVersion: string): any {
  // 按版本顺序执行迁移
}
```

---

## 测试覆盖补充

### 实施计划遗漏的测试场景

1. **边界情况测试**
   - Ghostty 未安装
   - AppleScript 权限被拒绝
   - 项目路径不存在
   - 配置文件格式错误
   - 网络盘/远程路径处理

2. **并发测试**
   - 快速连续触发同步
   - 多个项目同时同步
   - 操作取消场景

3. **多窗口/多屏幕测试**
   - 多个 Ghostty 窗口
   - 全屏模式
   - 不同屏幕的窗口

4. **性能测试**
   - 大型项目（深度嵌套目录）
   - 大量 Tab 场景
   - 复杂布局构建

5. **回归测试**
   - Ghostty 版本升级兼容性
   - 配置格式变更
   - macOS 系统更新影响

---

## 架构风险评估

### A1. 适配器模式的盲点

**潜在问题：**
1. TerminalAdapter 接口可能过于理想化，未考虑某些终端的能力限制
2. 缺少"能力查询"机制，无法动态获取支持的功能
3. 错误处理策略不够统一

**建议改进：**
```typescript
interface TerminalAdapterCapabilities {
  supportsSplit?: boolean
  supportsTabs?: boolean
  supportsWorkingDirectory?: boolean
  maxTabs?: number
  maxSplits?: number
}

interface TerminalAdapter {
  readonly name: string
  readonly capabilities: TerminalAdapterCapabilities
  // ... 其他方法
}
```

---

### A2. 过度设计风险

**潜在问题：**
1. 树形布局配置可能过于复杂
2. 多层抽象可能增加维护成本
3. 对于简单用例可能不必要

**建议：**
1. 保持默认配置简单
2. 提供预设布局模板
3. 渐进式复杂化（从简单开始，逐步添加功能）

---

## 总结与优先级建议

### 立即处理（CRITICAL + HIGH）
1. C1: 验证 Ghostty AppleScript API 的实际能力
2. C2: 改进 Tab 识别策略（使用 working directory）
3. H1: 处理 Ghostty 未安装/禁用的情况
4. H2: 添加 AppleScript 权限处理
5. H3: 解决进程启动竞态条件

### 第一阶段处理（MEDIUM）
1. M1: 特殊字符路径处理
2. M3: 并发调用安全性
3. M5: 错误反馈用户体验

### 第二阶段处理（LOW + 可扩展性）
1. L1: 首次使用体验
2. E1: 评估未来终端支持难度
3. 补充测试覆盖

---

## 结论

PRD 和实施计划总体设计合理，采用适配器模式具有良好的可扩展性。但在以下几个关键领域需要改进：

1. **边界情况处理不足**：特别是权限问题、错误恢复和并发场景
2. **Tab 识别策略有风险**：仅依赖标题容易产生误判
3. **用户体验考虑不够**：错误反馈和首次使用体验需要加强
4. **测试覆盖有缺口**：需要补充边界、并发和性能测试

建议在正式实施前，先通过验证脚本确认 Ghostty API 的实际能力，并针对上述 CRITICAL 和 HIGH 问题制定详细的解决方案。

---

## 附录：关键 API 验证清单

在正式实施前，请使用以下清单验证 Ghostty AppleScript API：

- [ ] 启动/激活 Ghostty
- [ ] 获取窗口列表
- [ ] 创建新窗口
- [ ] 创建新 Tab
- [ ] 获取 Tab 标题
- [ ] 获取/设置 Tab 的 working directory
- [ ] 聚焦到指定 Tab
- [ ] 分屏（split right / down）
- [ ] 导航到指定 pane
- [ ] 发送文本到 pane
- [ ] 执行命令到 pane
- [ ] 获取所有 Tab 和 terminal 信息

如果上述任何操作验证失败，需要在实施计划中记录并考虑替代方案。
