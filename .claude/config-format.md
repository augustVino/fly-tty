# 配置格式

布局配置通过 VS Code/Cursor 的全局设置 `ideTuiBridge.layout` 定义。

在 `settings.json` 中配置：

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

## 布局方向

| direction    | 含义     | 视觉                    |
| ------------ | -------- | ----------------------- |
| `horizontal` | 上下分屏 | ┌───┐<br>├───┤<br>└───┘ |
| `vertical`   | 左右分屏 | ┌─┬─┐<br>│ │ │<br>└─┴─┘ |
| `none`       | 单面板   | ┌───┐<br>│ │<br>└───┘   |

## 面板属性

| 属性         | 类型       | 说明                                           |
| ------------ | ---------- | ---------------------------------------------- |
| `id`         | string     | 面板唯一标识                                   |
| `commands`   | string[]   | 启动命令数组，按顺序执行（可选，默认 `[]`）     |
| `auto_focus` | boolean?   | 是否自动聚焦（默认 `false`）                   |
| `cwd`        | string?    | 工作目录（默认项目根目录）                     |

## 多命令执行

每个面板支持定义多个命令，按数组顺序依次执行，每个命令之间间隔 500ms：

```json
{
  "ideTuiBridge.layout": {
    "direction": "none",
    "panes": [{
      "id": "dev",
      "commands": ["cd /some/path", "npm install", "npm run dev"]
    }]
  }
}
```

> **注意**：Ghostty AppleScript 无法检测命令是否执行完毕，因此使用固定 500ms 间隔。对于启动后持续运行的命令（如 `npm run dev`），建议放在 `commands` 数组的最后一位。

## 常见布局示例

### 双面板（左右）

```json
{
  "ideTuiBridge.layout": {
    "direction": "vertical",
    "panes": [
      { "id": "left", "commands": ["npm run dev"] },
      { "id": "right", "commands": ["claude"] }
    ]
  }
}
```

### 三面板（上 1 下 2）

```json
{
  "ideTuiBridge.layout": {
    "direction": "horizontal",
    "panes": [
      { "id": "top", "auto_focus": true, "commands": ["claude"] },
      {
        "direction": "vertical",
        "panes": [
          { "id": "bottom_left", "commands": ["npm run dev"] },
          { "id": "bottom_right", "commands": ["git status"] }
        ]
      }
    ]
  }
}
```
