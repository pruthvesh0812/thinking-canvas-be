---
feature: "intervention-spectrum"
type: task
task_id: task-01
story: ../story.md
created: 2026-07-05
status: draft
---

## Scope
The data foundation: the `InterventionOffer` type, the extended `RedisMessage`
union, the `intervention_offers` table (+ RLS), `sessions.latest_seq` for the
version guard, and the **context-fingerprint DB trigger** (a per-canvas version
counter on `nodes` + `edges`). See DESIGN.md §4f, §6, §9.

## Files to Touch
```
CREATE:
  supabase/migrations/<ts>_intervention_offers.sql
MODIFY:
  types/index.ts            → InterventionOffer, InterventionStatus, InterventionDirectness, RedisMessage
  src/db/database.types.ts  → regenerate after migration (npm run gen:types:local)
```

## Types (types/index.ts)
```typescript
export type InterventionStatus =
  | 'waiting' | 'shown' | 'pulled' | 'dismissed' | 'superseded' | 'expired'
export type InterventionDirectness = 'direct' | 'subtle'

export type InterventionOffer = {
  id: string
  canvas_id: string
  session_id: string
  agent_role: AgentRole
  trigger_node_id: string
  anchor_node_ids: string[]
  seq: number                                 // per-session; vs sessions.latest_seq
  context_fingerprint: string                 // change-detector, NOT content (§6)
  directness: InterventionDirectness | null   // set at show
  headline: string | null                     // set at show (backend-authored)
  status: InterventionStatus
  created_at: string
  resolved_at: string | null
}

// extend RedisMessage — spawn/chunk/done stay as the top rung
| { type: 'waiting';  offer: InterventionOffer }
| { type: 'offer';    offer: InterventionOffer }
| { type: 'withdraw'; offer_id: string }
```

## Migration
- `intervention_offers` — columns per the type above; **RLS owner-scoped** like every
  table. Ephemeral (purged in task-08 — no retention guarantee).
- `sessions.latest_seq int not null default 0` (version guard, §4e).
- **Context fingerprint:** `canvases.canvas_version int not null default 0` + a
  trigger `AFTER INSERT/UPDATE/DELETE` on **BOTH `nodes` and `edges`** that bumps the
  owning canvas's `canvas_version`. Catches re-parenting (edge delete+create) a
  node-only composite would miss (§6).

## Depends On
`core-types` (AgentRole) — exists. None within this feature.

## Definition of Done
- [ ] `InterventionOffer` / `InterventionStatus` / `InterventionDirectness` in `types/index.ts`
- [ ] `RedisMessage` extended with `waiting` / `offer` / `withdraw`
- [ ] `intervention_offers` migration applies (`npm run migrate:local`) with RLS
- [ ] `sessions.latest_seq` added
- [ ] `canvases.canvas_version` + trigger on `nodes` AND `edges` bumps on insert/update/delete
- [ ] `npm run gen:types:local` run; `npm run build` compiles
