---
last-verified: 2026-07-05
stale-after-days: 60
---

# Skill: Create a Zustand Store

> Load STATE-MANAGEMENT.md + this file before adding any store.
> First question: does this state belong in an EXISTING store? Four stores
> (canvas / ghost / observer / session) cover almost everything — a new store
> needs a genuinely new concern.

---

## File location

```
src/stores/<concern>-store.ts     # kebab-case, exports useXStore
```

---

## Template

```typescript
// src/stores/example-store.ts
import { create } from 'zustand'
import { logger } from '@/lib/logger'

// One short header: what concern this store owns and — just as important —
// what it deliberately does NOT contain (see STATE-MANAGEMENT.md store table).
type ExampleStore = {
  // ── state ──
  items: Record<string, Item>

  // ── actions ── (all mutations live here; components never set state ad hoc)
  add(item: Item): void
  remove(id: string): void
}

export const useExampleStore = create<ExampleStore>()((set, get) => ({
  items: {},

  add(item) {
    // Keyed-by-id records make invariants structural — e.g. the ghost store
    // keys pairs by trigger_node_id so "one pair per node" can't be violated.
    set((s) => ({ items: { ...s.items, [item.id]: item } }))
  },

  remove(id) {
    set((s) => {
      const { [id]: _, ...rest } = s.items
      return { items: rest }
    })
  },
}))
```

---

## Checklist

1. **Typed interface** — state and actions in one type; no untyped `set` calls.
2. **Actions inside the store** — components call actions, never `setState`.
3. **No persistence middleware** for anything Supabase already stores.
4. **No cross-store imports** inside the store definition — compose in hooks.
5. **Narrow selectors at call sites** — `useExampleStore((s) => s.items[id])`.
6. **`getState()` for non-React contexts** (SSE dispatch, DOM event handlers).
7. **Log state transitions that matter** for debugging (spawn, resolve, rollback)
   — with the `[store:<name>]` prefix.
8. **Update STATE-MANAGEMENT.md's store table** if the store survives review —
   the table must list every store and its boundaries.
