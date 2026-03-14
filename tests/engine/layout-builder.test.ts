/**
 * Tests for layout builder module
 *
 * Covers:
 * - buildSplitSequence for single, dual, tri, quad, and deeply nested layouts
 * - collectLeaves verification of leaf node order
 * - Direction mapping correctness
 */

import { describe, it, expect } from 'vitest'
import {
  buildSplitSequence,
  collectLeaves,
} from '@ide-tui-bridge/engine/core/layout-builder.js'
import type { LayoutNode } from '@ide-tui-bridge/engine/types/layout.js'

// ---------------------------------------------------------------------------
// buildSplitSequence tests
// ---------------------------------------------------------------------------
describe('core/layout-builder: buildSplitSequence', () => {
  it('single pane (direction: none) should produce no split actions', () => {
    const layout: LayoutNode = {
      direction: 'none',
      panes: [{ id: 'main' }],
    }

    const actions = buildSplitSequence(layout)
    expect(actions).toEqual([])
  })

  it('two-pane left/right (vertical) should produce [{ direction: "right" }]', () => {
    const layout: LayoutNode = {
      direction: 'vertical',
      panes: [
        { id: 'left' },
        { id: 'right' },
      ],
    }

    const actions = buildSplitSequence(layout)
    expect(actions).toEqual([{ direction: 'right' }])
  })

  it('two-pane top/bottom (horizontal) should produce [{ direction: "down" }]', () => {
    const layout: LayoutNode = {
      direction: 'horizontal',
      panes: [
        { id: 'top' },
        { id: 'bottom' },
      ],
    }

    const actions = buildSplitSequence(layout)
    expect(actions).toEqual([{ direction: 'down' }])
  })

  it('three-pane layout (horizontal -> [top, vertical -> [left, right]])', () => {
    // horizontal = top/bottom stacking
    // First child is top pane (no split), second child is vertical container (split down)
    // Then inside vertical: left is first (no split), right is second (split right)
    const layout: LayoutNode = {
      direction: 'horizontal',
      panes: [
        { id: 'pane_top' },
        {
          direction: 'vertical',
          panes: [
            { id: 'pane_bottom_left' },
            { id: 'pane_bottom_right' },
          ],
        },
      ],
    }

    const actions = buildSplitSequence(layout)
    expect(actions).toEqual([
      { direction: 'down' },
      { direction: 'right' },
    ])
  })

  it('three-pane layout (vertical -> [left, horizontal -> [top, bottom]])', () => {
    // vertical = left/right stacking
    // First child is left pane (no split), second child is horizontal container (split right)
    // Then inside horizontal: top is first (no split), bottom is second (split down)
    const layout: LayoutNode = {
      direction: 'vertical',
      panes: [
        { id: 'pane_left' },
        {
          direction: 'horizontal',
          panes: [
            { id: 'pane_right_top' },
            { id: 'pane_right_bottom' },
          ],
        },
      ],
    }

    const actions = buildSplitSequence(layout)
    expect(actions).toEqual([
      { direction: 'right' },
      { direction: 'down' },
    ])
  })

  it('four-pane 2x2 layout (horizontal -> [top_half, vertical -> [left, right]] then split top)', () => {
    // Full 2x2: horizontal splits into top and bottom
    // Bottom is a vertical split into left and right
    // Top is split horizontally again into top-left and top-right
    //
    // DFS traversal:
    // 1. traverse(vertical[top_left, top_right]): no root split, then split right for top_right
    // 2. split down (root horizontal) for bottom_half
    // 3. traverse(vertical[bottom_left, bottom_right]): split right for bottom_right
    const layout: LayoutNode = {
      direction: 'horizontal',
      panes: [
        {
          direction: 'vertical',
          panes: [
            { id: 'top_left' },
            { id: 'top_right' },
          ],
        },
        {
          direction: 'vertical',
          panes: [
            { id: 'bottom_left' },
            { id: 'bottom_right' },
          ],
        },
      ],
    }

    const actions = buildSplitSequence(layout)
    expect(actions).toEqual([
      { direction: 'right' },
      { direction: 'down' },
      { direction: 'right' },
    ])
  })

  it('four-pane 2x2 alternative (vertical -> [left_half, horizontal -> [top, bottom]])', () => {
    const layout: LayoutNode = {
      direction: 'vertical',
      panes: [
        {
          direction: 'horizontal',
          panes: [
            { id: 'left_top' },
            { id: 'left_bottom' },
          ],
        },
        {
          direction: 'horizontal',
          panes: [
            { id: 'right_top' },
            { id: 'right_bottom' },
          ],
        },
      ],
    }

    const actions = buildSplitSequence(layout)
    expect(actions).toEqual([
      { direction: 'down' },
      { direction: 'right' },
      { direction: 'down' },
    ])
  })

  it('deeply nested layout should produce correct sequence', () => {
    // 5 panes:
    // horizontal -> [
    //   A,
    //   vertical -> [
    //     B,
    //     horizontal -> [
    //       C,
    //       vertical -> [D, E]
    //     ]
    //   ]
    // ]
    const layout: LayoutNode = {
      direction: 'horizontal',
      panes: [
        { id: 'A' },
        {
          direction: 'vertical',
          panes: [
            { id: 'B' },
            {
              direction: 'horizontal',
              panes: [
                { id: 'C' },
                {
                  direction: 'vertical',
                  panes: [{ id: 'D' }, { id: 'E' }],
                },
              ],
            },
          ],
        },
      ],
    }

    const actions = buildSplitSequence(layout)
    // horizontal -> split down (for B...)
    // vertical -> split right (for horizontal...)
    // horizontal -> split down (for vertical...)
    // vertical -> split right (for E)
    expect(actions).toEqual([
      { direction: 'down' },
      { direction: 'right' },
      { direction: 'down' },
      { direction: 'right' },
    ])
  })

  it('should return frozen (immutable) array', () => {
    const layout: LayoutNode = {
      direction: 'vertical',
      panes: [{ id: 'left' }, { id: 'right' }],
    }

    const actions = buildSplitSequence(layout)
    expect(Object.isFrozen(actions)).toBe(true)
  })

  it('single leaf node (no container) should produce no split actions', () => {
    const layout: LayoutNode = { id: 'standalone' }

    const actions = buildSplitSequence(layout)
    expect(actions).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// collectLeaves tests
// ---------------------------------------------------------------------------
describe('core/layout-builder: collectLeaves', () => {
  it('single pane should return that single leaf', () => {
    const layout: LayoutNode = {
      direction: 'none',
      panes: [{ id: 'main' }],
    }

    const leaves = collectLeaves(layout)
    expect(leaves).toHaveLength(1)
    expect(leaves[0]?.id).toBe('main')
  })

  it('two-pane vertical should return leaves in DFS order', () => {
    const layout: LayoutNode = {
      direction: 'vertical',
      panes: [
        { id: 'left' },
        { id: 'right' },
      ],
    }

    const leaves = collectLeaves(layout)
    expect(leaves).toHaveLength(2)
    expect(leaves.map((l) => l.id)).toEqual(['left', 'right'])
  })

  it('three-pane nested should return leaves in DFS order', () => {
    const layout: LayoutNode = {
      direction: 'horizontal',
      panes: [
        { id: 'top' },
        {
          direction: 'vertical',
          panes: [
            { id: 'bottom_left' },
            { id: 'bottom_right' },
          ],
        },
      ],
    }

    const leaves = collectLeaves(layout)
    expect(leaves).toHaveLength(3)
    expect(leaves.map((l) => l.id)).toEqual([
      'top',
      'bottom_left',
      'bottom_right',
    ])
  })

  it('four-pane 2x2 should return leaves in correct DFS order', () => {
    const layout: LayoutNode = {
      direction: 'horizontal',
      panes: [
        {
          direction: 'vertical',
          panes: [
            { id: 'top_left' },
            { id: 'top_right' },
          ],
        },
        {
          direction: 'vertical',
          panes: [
            { id: 'bottom_left' },
            { id: 'bottom_right' },
          ],
        },
      ],
    }

    const leaves = collectLeaves(layout)
    expect(leaves).toHaveLength(4)
    expect(leaves.map((l) => l.id)).toEqual([
      'top_left',
      'top_right',
      'bottom_left',
      'bottom_right',
    ])
  })

  it('deeply nested layout should return leaves in DFS order', () => {
    const layout: LayoutNode = {
      direction: 'horizontal',
      panes: [
        { id: 'A' },
        {
          direction: 'vertical',
          panes: [
            { id: 'B' },
            {
              direction: 'horizontal',
              panes: [
                { id: 'C' },
                {
                  direction: 'vertical',
                  panes: [{ id: 'D' }, { id: 'E' }],
                },
              ],
            },
          ],
        },
      ],
    }

    const leaves = collectLeaves(layout)
    expect(leaves).toHaveLength(5)
    expect(leaves.map((l) => l.id)).toEqual(['A', 'B', 'C', 'D', 'E'])
  })

  it('standalone leaf node should return itself', () => {
    const layout: LayoutNode = { id: 'standalone' }

    const leaves = collectLeaves(layout)
    expect(leaves).toHaveLength(1)
    expect(leaves[0]?.id).toBe('standalone')
  })

  it('should return frozen (immutable) array', () => {
    const layout: LayoutNode = {
      direction: 'none',
      panes: [{ id: 'main' }],
    }

    const leaves = collectLeaves(layout)
    expect(Object.isFrozen(leaves)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Integration: leaves order matches split sequence
// ---------------------------------------------------------------------------
describe('core/layout-builder: leaves order matches split creation order', () => {
  it('DFS leaf order should match the order panes are created by split sequence', () => {
    const layout: LayoutNode = {
      direction: 'horizontal',
      panes: [
        { id: 'top' },
        {
          direction: 'vertical',
          panes: [
            { id: 'bottom_left' },
            { id: 'bottom_right' },
          ],
        },
      ],
    }

    const leaves = collectLeaves(layout)
    const actions = buildSplitSequence(layout)

    // Number of splits should be (number of leaves - 1)
    expect(actions.length).toBe(leaves.length - 1)

    // First leaf is the initial pane (created without any split)
    // Each subsequent leaf is created by the corresponding split action
    expect(leaves[0]?.id).toBe('top')
    expect(leaves[1]?.id).toBe('bottom_left')
    expect(leaves[2]?.id).toBe('bottom_right')
  })
})
