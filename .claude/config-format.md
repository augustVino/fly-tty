# 配置文件格式

项目根目录创建 `.contextsync.yml`：

```yaml
version: '1.0'
terminal: ghostty

layout:
  direction: horizontal # 第一刀：上下分
  panes:
    - id: pane_top # 叶子节点 = 实际面板
      auto_focus: true
      command: 'claude'
    - direction: vertical # 嵌套：左右分
      panes:
        - id: pane_bottom_left
          command: 'npm run dev'
        - id: pane_bottom_right
          command: ''
```

## 布局方向

| direction    | 含义     | 视觉                    |
| ------------ | -------- | ----------------------- |
| `horizontal` | 上下分屏 | ┌───┐<br>├───┤<br>└───┘ |
| `vertical`   | 左右分屏 | ┌─┬─┐<br>│ │ │<br>└─┴─┘ |
| `none`       | 单面板   | ┌───┐<br>│ │<br>└───┘   |

## 面板属性

| 属性         | 类型     | 说明                       |
| ------------ | -------- | -------------------------- |
| `id`         | string   | 面板唯一标识               |
| `command`    | string?  | 启动命令（可选）           |
| `auto_focus` | boolean? | 是否自动聚焦（默认 false） |
| `cwd`        | string?  | 工作目录（默认项目根目录） |

## 常见布局示例

### 双面板（左右）

```yaml
layout:
  direction: vertical
  panes:
    - id: left
      command: 'npm run dev'
    - id: right
      command: 'claude'
```

### 三面板（上 1 下 2）

```yaml
layout:
  direction: horizontal
  panes:
    - id: top
      auto_focus: true
      command: 'claude'
    - direction: vertical
      panes:
        - id: bottom_left
          command: 'npm run dev'
        - id: bottom_right
          command: 'git status'
```
