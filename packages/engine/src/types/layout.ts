/**
 * Layout type definitions for terminal pane management
 */

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
