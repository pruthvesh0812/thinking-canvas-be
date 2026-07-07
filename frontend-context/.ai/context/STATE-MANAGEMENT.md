---
last-verified: 2026-07-05
verified-against: backend canvasEventSchema (write-then-notify contract) + DB table list in backend ARCHITECTURE.md
stale-after-days: 60
---

# STATE-MANAGEMENT.md

> **Load this when:** Working on Zustand stores, the persistence hook, canvas
> hydration, or any question of "where does this state live / who writes it".

---

## The One Data-Flow Diagram

```
USER ACTION (create node / draw edge / edit / toggle phase)
  │
  ▼
Zustand store (optimistic — canvas updates instantly)
  │
  ▼
Supabase write (anon key, RLS)          ←— the durable truth
  │  on failure: revert store, surface error
  ▼
POST /api/canvas-event { ids only }     ←— tells the backend "go read the row"
  │
  ▼  (seconds later, maybe)
SSE spawn/chunk/done ──▶ ghost store ──▶ ghost layer renders

GHOST ACCEPT
  │
  ▼
Supabase write (owner:'ai' node + edges) + POST /api/ghost-status
  │
  ▼
canvas store adopts the new real nodes; ghost store drops the pair
```

Two rules fall out of this:
1. **The store is optimistic, Supabase is authoritative.** Never wait for the
   round-trip to paint; always reconcile on failure.
2. **Notify only after the write commits.** The backend immediately reads the
   row — notifying first is a race you will lose.

---

## Store Layout — one store per concern

| Store | Owns | Never contains |
|---|---|---|
| `canvas-store` | real nodes + edges (React Flow shapes), positions, selection | ghosts, session meta |
| `ghost-store` | pending pairs keyed by `trigger_node_id`, streamed text, `streamed` flag | anything persisted |
| `observer-store` | revealed structures, per-edge accept/reject state | ghost pairs |
| `session-store` | canvas meta (`original_intent`, title), active session id, `current_phase`, debounce-indicator state | node/edge data |

Cross-store reads happen in hooks/components — stores never import each other.

---

## Canvas Hydration (on canvas page mount)

```
1. Load canvas row        → session-store (north star, title)
2. Find active session    → none? POST /api/session/start first
3. Load ALL nodes + edges for the canvas (every session — nodes belong to
   the canvas, not the session)
4. Map rows → React Flow nodes/edges → canvas-store
5. Open the SSE stream (useGhostStream)
6. Load carried-forward session_learnings → render as pre-loaded unresolved
   nodes, visually distinct (see SESSION-FLOWS.md)
```

---

## Persistence Patterns

### Creating a node

```typescript
// use-canvas-persistence.ts — the ONLY place canvas writes happen.
// Persist on content commit (first blur with non-empty text), not per keystroke.
async function persistNode(node: CanvasNode) {
  // 1. Durable write — id is generated client-side so the store, Supabase,
  //    and the backend all agree on it with no read-back.
  const { error } = await supabase.from('nodes').insert({
    id: node.id, canvas_id, session_id,
    owner: 'human', content: node.content,
  })
  if (error) return rollback(node.id, error)

  // 2. Notify — IDs only; backend reads the authoritative row.
  await api.canvasEvent({ canvas_id, session_id, event_type: 'node.created', node_id: node.id })

  // 3. Debounce indicator on — the backend's window just opened.
  useSessionStore.getState().setDebounceActive(node.id)
}
```

### Creating an edge

Same shape, plus the two fields the backend routes on — set correctly at write
time, they are never recomputed server-side:
- `edge_type` — from the EdgeTypeSelector
- `both_existing` — true ⇔ drawn between two already-existing nodes

### Position changes

Node positions persist to Supabase (debounced, e.g. on drag end) but do **not**
fire `canvas-event` — position is not a thinking event.

### Edits / deletes

Persist to Supabase as normal. ⚠ The backend has no update/delete events yet
(API-CONTRACT Known Gap #3) — agents may act on stale content until the event
surface is extended. Do not invent unofficial events; flag the story instead.

### Phase toggle

`PhaseToggle` writes `sessions.current_phase` directly to Supabase via the
session-store action. No canvas-event — the backend reads phase when routing.

---

## Zustand Conventions

```typescript
// ✅ create with a typed interface; actions live inside the store
export const useCanvasStore = create<CanvasStore>()((set, get) => ({ ... }))

// ✅ select narrowly in components — never subscribe to the whole store
const nodes = useCanvasStore((s) => s.nodes)

// ✅ non-React access (hooks, event handlers) via getState()
useGhostStore.getState().appendChunk(target, data)

// ❌ No persist middleware for canvas data — Supabase is the persistence layer;
//    a localStorage copy WILL go stale and conflict
// ❌ No derived data stored — compute in selectors
// ❌ No cross-store imports inside store definitions
```

No react-query/SWR in MVP: canvas data is loaded once per mount and mutated
through the stores; there is no polling or background refetching to manage.
Introduce a fetching library only when a story genuinely needs caching.

---

## ID Strategy

All node/edge/canvas IDs are client-generated UUIDs (`crypto.randomUUID()`).
The frontend never waits for a DB round-trip to learn an id — which is what
makes optimistic rendering and the write-then-notify contract race-free.
Ghost IDs are the exception: pre-assigned by the **backend** in the
SpawnDescriptor, and reused as the real node id on acceptance so the thread's
record of the ghost matches the canvas row.
