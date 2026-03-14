/**
 * Layout Builder - converts layout tree into split action sequences
 *
 * Traverses the layout tree via DFS and produces an ordered list of
 * split-pane actions that a terminal adapter can replay to reconstruct
 * the desired pane layout.
 */

import type {
  LayoutNode,
  PaneLeaf,
  SplitDirection,
} from '../types/layout.js'
import { isLayoutContainer, isPaneLeaf } from '../types/layout.js'

/** A single split-pane action for the terminal adapter */
export interface SplitAction {
  readonly direction: 'right' | 'down'
}

/**
 * Map the layout-level split direction to the terminal adapter direction.
 *
 * Layout semantics:
 *   horizontal = top/bottom stacking  -> terminal "down" split
 *   vertical   = left/right stacking  -> terminal "right" split
 */
function mapDirection(direction: SplitDirection): 'right' | 'down' {
  const mapping: Record<SplitDirection, 'right' | 'down'> = {
    horizontal: 'down',
    vertical: 'right',
    none: 'right',
  }
  return mapping[direction]
}

/**
 * Build an ordered list of split actions from a layout tree.
 *
 * Algorithm (DFS):
 * 1. Visit a container node.
 * 2. The first child occupies the current pane -- no split needed.
 * 3. For each subsequent child, emit a split action using the container's
 *    direction, then recurse into that child.
 * 4. Leaf nodes produce no actions.
 *
 * Examples:
 *   Single pane                -> []
 *   Two panes vertical         -> [{ direction: 'right' }]
 *   Two panes horizontal       -> [{ direction: 'down' }]
 *   Three panes (horizontal -> [top, vertical -> [left, right]])
 *                              -> [{ direction: 'down' }, { direction: 'right' }]
 */
export function buildSplitSequence(node: LayoutNode): readonly SplitAction[] {
  const actions: SplitAction[] = []

  function traverse(current: LayoutNode): void {
    if (isPaneLeaf(current)) {
      return
    }

    if (!isLayoutContainer(current)) {
      return
    }

    const children = current.panes

    if (children.length === 0) {
      return
    }

    // First child reuses the current pane -- recurse without splitting
    traverse(children[0])

    // Remaining children each require a split in the container's direction
    for (let i = 1; i < children.length; i++) {
      actions.push({ direction: mapDirection(current.direction) })
      traverse(children[i])
    }
  }

  traverse(node)
  return Object.freeze(actions)
}

/**
 * Collect all leaf pane nodes from the layout tree in DFS order.
 *
 * The order matches the sequence in which panes are created by
 * `buildSplitSequence`, which is important for command injection.
 */
export function collectLeaves(node: LayoutNode): readonly PaneLeaf[] {
  const leaves: PaneLeaf[] = []

  function traverse(current: LayoutNode): void {
    if (isPaneLeaf(current)) {
      leaves.push(current)
      return
    }

    if (!isLayoutContainer(current)) {
      return
    }
    for (const child of current.panes) {
      traverse(child)
    }
  }

  traverse(node)
  return Object.freeze(leaves)
}
