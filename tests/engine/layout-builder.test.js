"use strict";
/**
 * Tests for layout builder module
 *
 * Covers:
 * - buildSplitSequence for single, dual, tri, quad, and deeply nested layouts
 * - collectLeaves verification of leaf node order
 * - Direction mapping correctness
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const layout_builder_js_1 = require("@ide-tui-bridge/engine/core/layout-builder.js");
// ---------------------------------------------------------------------------
// buildSplitSequence tests
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('core/layout-builder: buildSplitSequence', () => {
    (0, vitest_1.it)('single pane (direction: none) should produce no split actions', () => {
        const layout = {
            direction: 'none',
            panes: [{ id: 'main' }],
        };
        const actions = (0, layout_builder_js_1.buildSplitSequence)(layout);
        (0, vitest_1.expect)(actions).toEqual([]);
    });
    (0, vitest_1.it)('two-pane left/right (vertical) should produce [{ direction: "right" }]', () => {
        const layout = {
            direction: 'vertical',
            panes: [
                { id: 'left' },
                { id: 'right' },
            ],
        };
        const actions = (0, layout_builder_js_1.buildSplitSequence)(layout);
        (0, vitest_1.expect)(actions).toEqual([{ direction: 'right' }]);
    });
    (0, vitest_1.it)('two-pane top/bottom (horizontal) should produce [{ direction: "down" }]', () => {
        const layout = {
            direction: 'horizontal',
            panes: [
                { id: 'top' },
                { id: 'bottom' },
            ],
        };
        const actions = (0, layout_builder_js_1.buildSplitSequence)(layout);
        (0, vitest_1.expect)(actions).toEqual([{ direction: 'down' }]);
    });
    (0, vitest_1.it)('three-pane layout (horizontal -> [top, vertical -> [left, right]])', () => {
        // horizontal = top/bottom stacking
        // First child is top pane (no split), second child is vertical container (split down)
        // Then inside vertical: left is first (no split), right is second (split right)
        const layout = {
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
        };
        const actions = (0, layout_builder_js_1.buildSplitSequence)(layout);
        (0, vitest_1.expect)(actions).toEqual([
            { direction: 'down' },
            { direction: 'right' },
        ]);
    });
    (0, vitest_1.it)('three-pane layout (vertical -> [left, horizontal -> [top, bottom]])', () => {
        // vertical = left/right stacking
        // First child is left pane (no split), second child is horizontal container (split right)
        // Then inside horizontal: top is first (no split), bottom is second (split down)
        const layout = {
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
        };
        const actions = (0, layout_builder_js_1.buildSplitSequence)(layout);
        (0, vitest_1.expect)(actions).toEqual([
            { direction: 'right' },
            { direction: 'down' },
        ]);
    });
    (0, vitest_1.it)('four-pane 2x2 layout (horizontal -> [top_half, vertical -> [left, right]] then split top)', () => {
        // Full 2x2: horizontal splits into top and bottom
        // Bottom is a vertical split into left and right
        // Top is split horizontally again into top-left and top-right
        //
        // DFS traversal:
        // 1. traverse(vertical[top_left, top_right]): no root split, then split right for top_right
        // 2. split down (root horizontal) for bottom_half
        // 3. traverse(vertical[bottom_left, bottom_right]): split right for bottom_right
        const layout = {
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
        };
        const actions = (0, layout_builder_js_1.buildSplitSequence)(layout);
        (0, vitest_1.expect)(actions).toEqual([
            { direction: 'right' },
            { direction: 'down' },
            { direction: 'right' },
        ]);
    });
    (0, vitest_1.it)('four-pane 2x2 alternative (vertical -> [left_half, horizontal -> [top, bottom]])', () => {
        const layout = {
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
        };
        const actions = (0, layout_builder_js_1.buildSplitSequence)(layout);
        (0, vitest_1.expect)(actions).toEqual([
            { direction: 'down' },
            { direction: 'right' },
            { direction: 'down' },
        ]);
    });
    (0, vitest_1.it)('deeply nested layout should produce correct sequence', () => {
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
        const layout = {
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
        };
        const actions = (0, layout_builder_js_1.buildSplitSequence)(layout);
        // horizontal -> split down (for B...)
        // vertical -> split right (for horizontal...)
        // horizontal -> split down (for vertical...)
        // vertical -> split right (for E)
        (0, vitest_1.expect)(actions).toEqual([
            { direction: 'down' },
            { direction: 'right' },
            { direction: 'down' },
            { direction: 'right' },
        ]);
    });
    (0, vitest_1.it)('should return frozen (immutable) array', () => {
        const layout = {
            direction: 'vertical',
            panes: [{ id: 'left' }, { id: 'right' }],
        };
        const actions = (0, layout_builder_js_1.buildSplitSequence)(layout);
        (0, vitest_1.expect)(Object.isFrozen(actions)).toBe(true);
    });
    (0, vitest_1.it)('single leaf node (no container) should produce no split actions', () => {
        const layout = { id: 'standalone' };
        const actions = (0, layout_builder_js_1.buildSplitSequence)(layout);
        (0, vitest_1.expect)(actions).toEqual([]);
    });
});
// ---------------------------------------------------------------------------
// collectLeaves tests
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('core/layout-builder: collectLeaves', () => {
    (0, vitest_1.it)('single pane should return that single leaf', () => {
        const layout = {
            direction: 'none',
            panes: [{ id: 'main' }],
        };
        const leaves = (0, layout_builder_js_1.collectLeaves)(layout);
        (0, vitest_1.expect)(leaves).toHaveLength(1);
        (0, vitest_1.expect)(leaves[0]?.id).toBe('main');
    });
    (0, vitest_1.it)('two-pane vertical should return leaves in DFS order', () => {
        const layout = {
            direction: 'vertical',
            panes: [
                { id: 'left' },
                { id: 'right' },
            ],
        };
        const leaves = (0, layout_builder_js_1.collectLeaves)(layout);
        (0, vitest_1.expect)(leaves).toHaveLength(2);
        (0, vitest_1.expect)(leaves.map((l) => l.id)).toEqual(['left', 'right']);
    });
    (0, vitest_1.it)('three-pane nested should return leaves in DFS order', () => {
        const layout = {
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
        };
        const leaves = (0, layout_builder_js_1.collectLeaves)(layout);
        (0, vitest_1.expect)(leaves).toHaveLength(3);
        (0, vitest_1.expect)(leaves.map((l) => l.id)).toEqual([
            'top',
            'bottom_left',
            'bottom_right',
        ]);
    });
    (0, vitest_1.it)('four-pane 2x2 should return leaves in correct DFS order', () => {
        const layout = {
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
        };
        const leaves = (0, layout_builder_js_1.collectLeaves)(layout);
        (0, vitest_1.expect)(leaves).toHaveLength(4);
        (0, vitest_1.expect)(leaves.map((l) => l.id)).toEqual([
            'top_left',
            'top_right',
            'bottom_left',
            'bottom_right',
        ]);
    });
    (0, vitest_1.it)('deeply nested layout should return leaves in DFS order', () => {
        const layout = {
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
        };
        const leaves = (0, layout_builder_js_1.collectLeaves)(layout);
        (0, vitest_1.expect)(leaves).toHaveLength(5);
        (0, vitest_1.expect)(leaves.map((l) => l.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
    });
    (0, vitest_1.it)('standalone leaf node should return itself', () => {
        const layout = { id: 'standalone' };
        const leaves = (0, layout_builder_js_1.collectLeaves)(layout);
        (0, vitest_1.expect)(leaves).toHaveLength(1);
        (0, vitest_1.expect)(leaves[0]?.id).toBe('standalone');
    });
    (0, vitest_1.it)('should return frozen (immutable) array', () => {
        const layout = {
            direction: 'none',
            panes: [{ id: 'main' }],
        };
        const leaves = (0, layout_builder_js_1.collectLeaves)(layout);
        (0, vitest_1.expect)(Object.isFrozen(leaves)).toBe(true);
    });
});
// ---------------------------------------------------------------------------
// Integration: leaves order matches split sequence
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('core/layout-builder: leaves order matches split creation order', () => {
    (0, vitest_1.it)('DFS leaf order should match the order panes are created by split sequence', () => {
        const layout = {
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
        };
        const leaves = (0, layout_builder_js_1.collectLeaves)(layout);
        const actions = (0, layout_builder_js_1.buildSplitSequence)(layout);
        // Number of splits should be (number of leaves - 1)
        (0, vitest_1.expect)(actions.length).toBe(leaves.length - 1);
        // First leaf is the initial pane (created without any split)
        // Each subsequent leaf is created by the corresponding split action
        (0, vitest_1.expect)(leaves[0]?.id).toBe('top');
        (0, vitest_1.expect)(leaves[1]?.id).toBe('bottom_left');
        (0, vitest_1.expect)(leaves[2]?.id).toBe('bottom_right');
    });
});
//# sourceMappingURL=layout-builder.test.js.map