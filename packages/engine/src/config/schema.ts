/**
 * Zod schemas for configuration validation
 *
 * Note: Zod's recursive schema types don't perfectly align with TypeScript
 * discriminated unions, so we use type assertions for the layout tree while
 * keeping runtime validation correct.
 */

import { z } from 'zod'
import type { LayoutNode, ProjectConfig } from '../types/index.js'

/** Schema for leaf pane nodes */
const PaneLeafSchema = z.object({
  id: z.string(),
  auto_focus: z.boolean().default(false),
  command: z.string().default(''),
  cwd: z.string().optional(),
})

/**
 * Recursive layout node schema.
 * Runtime validation is correct; type assertion bridges Zod's recursive
 * type inference with our LayoutNode union type.
 */
const LayoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.union([
    PaneLeafSchema as unknown as z.ZodType<LayoutNode>,
    z
      .object({
        direction: z.enum(['horizontal', 'vertical', 'none']),
        panes: z.array(LayoutNodeSchema).min(1),
      })
      .refine(
        (data) => (data.direction === 'none' ? data.panes.length >= 1 : data.panes.length >= 2),
        { message: 'Pane count must be >= 2 for horizontal/vertical, >= 1 for none' }
      ) as unknown as z.ZodType<LayoutNode>,
  ])
)

/** Schema for the full project configuration */
export const ProjectConfigSchema = z
  .object({
    version: z.string().default('1.0'),
    terminal: z.enum(['ghostty']).default('ghostty'),
    layout: LayoutNodeSchema,
  })
  .transform((val) => val as ProjectConfig)

export { PaneLeafSchema, LayoutNodeSchema }
