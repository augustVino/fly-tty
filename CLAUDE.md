# IDE-TUI Bridge

本地工作流自动化引擎，消除双屏开发的上下文切换摩擦。IDE 触发后自动管理终端窗口、Tab、分屏布局和启动命令。

## 命令

```bash
npm run build           # 构建所有工作区
npm run test            # 运行测试（verbose）
npm run test:coverage   # 测试 + 覆盖率
npm run typecheck       # 类型检查

npx vitest run tests/engine/xxx.test.ts  # 单文件测试
npx vitest                               # watch 模式

cd packages/extension && npm run build    # 扩展打包
cd packages/extension && npm run package  # 生成 .vsix
```

## 平台

仅支持 macOS。需要 Ghostty 终端 v1.3.0+，通过 AppleScript 自动化。

## TypeScript 配置

- **模块**: NodeNext (ESM)，内部导入必须用 `.js` 扩展名
- **目标**: ES2022，Node.js >= 20
- **项目引用**: `composite: true` 增量构建

## 详细指南

- [架构设计](.claude/architecture.md) - Monorepo 结构、核心管道、设计模式
- [配置格式](.claude/config-format.md) - `.contextsync.yml` 布局配置
