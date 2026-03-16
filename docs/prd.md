# 产品需求文档 (PRD)：终端智能上下文同步引擎 (Workspace Sync)

## 1. 产品概述 (Overview)

- 产品定位：一款高可拓展的本地工作流自动化引擎。它以 IDE 为触发主轴，自动管理和调度独立终端应用的窗口、标签页与分屏布局，实现跨屏幕、跨应用的代码上下文与 AI 辅助工具的无缝缝合。

- 核心价值：消除双屏开发时的“上下文切换摩擦”，提供开箱即用的标准终端面板布局（如：AI 对话 + 服务运行 + 日志监控），并将此标准化体验沉淀为可全团队复用的基础能力。

## 2. 核心功能规范 (Core Features)

### 2.1 智能窗口与标签页管理 (Smart Window & Tab Management)

- 全局单例与窗口唤醒：接收到 IDE 的触发指令后，引擎首先检测目标终端（如 Ghostty）是否运行。若未运行则启动应用；若已运行，则定位到目标工作窗口（或创建专用的工作区窗口），并将其激活到指定屏幕的前台。
- 基于项目路径的 Tab 路由 (Tab 幂等性)：

  - 引擎会在终端内维护一个“项目状态表”（通过读取原生 Tab 标题或自定义变量实现）。

  - 存在则复用：如果目标项目（如 Project_A）的标签页已存在，仅执行聚焦（Focus）操作，绝对不破坏该标签页内正在运行的进程或历史输出。

  - 缺失则新建：如果不存在，则在终端内新建一个专属的标签页。

### 2.2 黄金比例三面板布局 (Fixed Three-Pane Layout)

- 布局定义：当新建项目标签页时，引擎需要通过终端的原生分屏 API（如 Ghostty 的 Split 功能），自动构建固定的三面板布局：

  - Panel 1 (上方，全宽)：核心主控面板。

  - Panel 2 (左下，半宽)：辅助面板 A。

  - Panel 3 (右下，半宽)：辅助面板 B。

- 防退化机制：如果用户手动调整了面板比例，引擎在复用该 Tab 时应予以保留，不做强制重置。

### 2.3 上下文注入与命令预执行 (Contextual Auto-Execution)

- 工作目录对齐：不论是新建还是复用标签页，引擎必须确保 Panel 1、2、3 的 Shell 会话都在执行 cd <IDE_Project_Path>，确保上下文绝对一致。

- 按面板注入预定义命令：

  - 支持在配置文件中为每个面板定义启动命令（可选）。

  - 典型场景配置：

    - Panel 1 (上方全宽)：自动执行 claude 启动 AI 编程助手。

    - Panel 2 (左下)：自动执行 npm run dev 或 make run 启动本地服务。

    - Panel 3 (右下)：留空待命，或执行 git status / tail -f xxx.log。

## 3. 系统架构与强拓展性设计 (Architecture & Extensibility)

为了满足未来接入更多 IDE 和终端的需求，系统不能使用写死的硬编码 Shell 脚本，必须采用**基于插件/适配器模式 (Adapter Pattern) **的架构设计。建议使用 Node.js 或 Python 作为核心调度语言。

### 3.1 核心模块划分

1. Trigger Layer (触发层)：

   - 负责接收来自 IDE 的调用，提取并格式化 ${ProjectPath} 等环境变量。

2. Core Engine (调度引擎)：

   - 从 VS Code/Cursor 全局设置 `ideTuiBridge.layout` 读取布局配置（解析面板命令、布局需求）。

   - 编排窗口管理、分屏、发送命令的业务逻辑串联。

3. IDE Adapters (IDE 适配器)：

   - 标准化 IDE 侧的行为。当前实现：CursorAdapter。未来可横向拓展支持 VSCodeAdapter, JetBrainsAdapter, ZedAdapter。

4. Terminal Adapters (终端适配器)：

   - 封装各个终端的底层操控 API（如 AppleScript 字典查询、CLI 指令）。

   - 当前实现：GhosttyAdapter（调用 v1.3.0+ 的 AppleScript 接口进行 tab 遍历和分屏）。未来可横向拓展支持 iTerm2Adapter, WezTermAdapter。

## 3.2 配置示例 (VS Code Settings)

布局配置通过 VS Code/Cursor 全局设置 `ideTuiBridge.layout` 定义，支持灵活的树形布局和每面板多命令：

```json
{
  "ideTuiBridge.layout": {
    "direction": "horizontal",
    "panes": [
      {
        "id": "pane_top",
        "auto_focus": true,
        "commands": ["claude"]
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

> 每个面板的 `commands` 数组中的命令按顺序依次执行，间隔 500ms。
