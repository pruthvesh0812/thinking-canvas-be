---
last-verified: 2026-07-05
stale-after-days: 60
---

# Skill: Create a React Flow Node or Edge Component

> Load CANVAS-RENDERING.md + this file before writing any node/edge component.
> Fetch https://reactflow.dev/llms.txt for the custom node API if unsure.

---

## What canvas components are

Custom React Flow node/edge types that render the ThinkingCanvas graph. They
are **presentation + local interaction only** — persistence goes through
`use-canvas-persistence`, ghost logic through the ghost store. A node component
never calls Supabase or the backend directly.

---

## File location

```
src/components/canvas/nodes/<Name>.tsx    # real canvas nodes
src/components/canvas/edges/<Name>.tsx    # edge types
src/components/ghost/<Name>.tsx           # ghost-layer nodes
```

PascalCase filename = component name. The React Flow type key is camelCase
(`humanNode`, `ghostContext`) and registered once in `Canvas.tsx`.

---

## Node template

```tsx
// src/components/canvas/nodes/ExampleNode.tsx
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { ExampleNodeData } from './types'

// One-liner on the component's PURPOSE if the name alone doesn't carry it —
// e.g. what product rule this node embodies (see CODING-STANDARDS.md → Comments).
export function ExampleNode({ id, data, selected }: NodeProps<ExampleNodeData>) {
  return (
    <div
      className={/* Tailwind — full visual spec is CANVAS-RENDERING.md's table.
                    Ghost nodes: opacity-40/50 + border-dashed + muted text.
                    Real nodes: opacity-100 + border-solid. */
        'rounded-md border bg-white p-3 text-sm'}
    >
      {data.content}
      {/* Handles only on nodes the USER may connect from/to — ghosts get none */}
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
```

---

## Checklist

1. **Data type** — define the node's `data` shape next to the component; reuse
   contract enums (`ContextNodeType`, `EdgeType`) from `types/index.ts`.
2. **Register the type** — add to the module-scope `nodeTypes`/`edgeTypes`
   constant in `Canvas.tsx`. Never build these objects inside a render.
3. **Respect the ghost/real visual contract** — the table in
   CANVAS-RENDERING.md is not a suggestion. Check opacity, border, edge style,
   interaction affordances.
4. **Handles** — real nodes: source + target. Ghost nodes: none (accept/reject
   only). Appreciation: no reject button.
5. **State access** — narrow Zustand selectors; mutations only via store
   actions or `use-canvas-persistence`.
6. **Logging** — interaction events worth debugging (accept, reject, edit
   commit) log via `logger` with the `[canvas]` or `[ghost]` prefix.
7. **Comment the contract seams** — e.g. why `both_existing` is computed where
   it is, why controls wait for `done`.

---

## Edge notes

Edge components get `BaseEdge` + `getBezierPath` (or smoothstep) from
`@xyflow/react`. The `questionEdge` pulse is a CSS animation on the path —
subtle, but unmistakable (it signals the Outer Subconscious may fire).
`ghostEdge` is dotted and never user-selectable as a type in `EdgeTypeSelector`.
