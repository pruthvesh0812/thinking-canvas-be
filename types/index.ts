import { z } from 'zod'

// ─────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────

export type AgentRole =
  | 'expander'
  | 'stress_tester'
  | 'observer'
  | 'general'

export type ContextNodeType =
  | 'reframe'
  | 'mirror'
  | 'pattern'
  | 'reference'
  | 'contradiction'
  | 'appreciation'

// Which side of a node the edge attaches to. Frontend-owned (React Flow
// handle id); backend never reads it. Enforced by CHECK constraint on the
// edges table.
export type EdgeHandle = 'TOP' | 'RIGHT' | 'LEFT' | 'BOTTOM'

export type DirectionMarker = 'establishes' | 'questions' | 'contradicts' | 'explores'

export type GhostStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'context_accepted'
  | 'question_accepted'
  | 'ignored'

export type RejectionReason = 'too_abstract' | 'too_technical' | 'skip_for_now'

export type InsightSeverity = 'hard_block' | 'approach_pivot' | 'temporal_deferral'

// Why a single Observer edge (anchor→observation or observation→observation) was rejected.
// Distinct from RejectionReason — that's about content quality, this is about connection quality.
export type ConnectionRejectionReason =
  | 'not_related'      // the two nodes don't actually connect this way
  | 'wrong_direction'  // the connection is real but reversed
  | 'too_indirect'     // the jump is real but needs an intermediate bridge node
  | 'already_obvious'  // the user already sees this connection — not a genuine insight

export type GhostEdgeStatus = 'pending' | 'accepted' | 'rejected'

export type CognitiveMode = 'exploratory' | 'transitional' | 'declarative'

export type QuestionStyle = 'opening' | 'bridging' | 'closing'

export type SessionPhase = 'diverging' | 'converging'

export type SubscriptionTier = 'free' | 'pro' | 'power'

// ─────────────────────────────────────────────
// Core domain types
// ─────────────────────────────────────────────

export type Canvas = {
  id: string
  user_id: string
  title: string
  original_intent: string   // immutable after creation
  next_node_seq: number     // monotonic counter behind nodes.seq — never decremented, so numbers are never reused
  created_at: string
}

export type Session = {
  id: string
  canvas_id: string
  status: 'active' | 'closed'
  current_phase: SessionPhase
  node_sequence: string[]   // ordered node IDs created in THIS session only
  start_time: string
  end_time: string | null
}

export type Node = {
  id: string
  canvas_id: string
  session_id: string
  owner: 'human' | 'ai'
  // The stable number the user sees on the node (n1, n2, …). DB-assigned by a
  // BEFORE INSERT trigger — the frontend never writes it. Unique per canvas, in
  // creation order, never reused or renumbered (even after the node is deleted).
  // Not the serializer's `seq:N`, which is a prompt-text label.
  seq: number
  content: string | null
  summary: string | null            // gemini-2.5-flash directional summary
  direction_marker: DirectionMarker | null
  embedding: number[] | null        // VECTOR(3072) — gemini-embedding-2
  // Frontend-owned layout — restored on refetch so the canvas comes back
  // exactly as the user left it. Backend never reads or writes these; agent
  // serialization is content-oriented, not spatial. Nullable to keep
  // pre-migration rows valid; new rows carry all four.
  x: number | null
  y: number | null
  width: number | null
  height: number | null
  created_at: string
  // Soft-archive — NULL = active (default), non-NULL = set aside at that
  // instant. A set-aside node is preserved, never destroyed, but every
  // reasoning read filters it (and any edge touching it) out live — see
  // CORE-CONCEPTS.md → set aside. Only owner='ai' nodes are ever set aside;
  // frontend-written directly (same class as content/position edits).
  set_aside_at: string | null
}

// The Observer's canvas map only ever reads these fields off a node (never
// .content — see CORE-CONCEPTS.md) — narrows getAllByCanvas's select() to
// match, instead of over-fetching every column for every node on the canvas.
export type CanvasMapNode = Pick<Node, 'id' | 'session_id' | 'summary' | 'direction_marker'>

// A node with its COMPLETE content, for readers that need the wording summaries
// lose. Still excludes the embedding column, which no map ever renders.
export type ContentMapNode = CanvasMapNode & Pick<Node, 'content'>

export type Edge = {
  id: string
  canvas_id: string
  session_id: string
  from_node_id: string
  to_node_id: string
  both_existing: boolean
  // Frontend-owned handle attachments — restored on refetch so an edge
  // reattaches to the exact same sides it left. Backend never reads or
  // writes these; agent pipelines route off both_existing only.
  // Nullable to keep pre-migration edges valid.
  from_handle: EdgeHandle | null
  to_handle: EdgeHandle | null
  // Short label the user typed on the edge itself (≤80 chars). That is the
  // edge, not a note. Frontend-written; NULL = unlabelled.
  label: string | null
  created_at: string
}

// ─────────────────────────────────────────────
// Context capture — notes the user attaches to a node, an edge, or the canvas
// ─────────────────────────────────────────────
// Frontend-written (supabase-js + RLS), backend-read: agents see entries live at
// serialize time. One shape for typed, spoken and (later) attached context.
// An entry is visible only through an ACTIVE link and while deleted_at is NULL.
// Schema rev 3: thinking-canvas-frontend .ai/features/text-context-capture/schema.md

export type ContextSource = 'typed' | 'spoken' | 'attachment'

// 'canvas' = background ("Canvas context", target_id NULL). 'group' is reserved for v2.
export type ContextTargetType = 'canvas' | 'node' | 'edge'

// OWNED = written on that component directly; MOVED = the user moved it there.
// (Says THAT it moved, not from where.)
export type ContextOriginStatus = 'OWNED' | 'MOVED'

// 'deleted' = the user removed the link, or its node/edge row was deleted (DB
// trigger). Deleting a NOTE does not touch its links — it sets deleted_at.
export type ContextLinkState = 'active' | 'deleted'

export type ContextEntry = {
  id: string                       // client-generated
  canvas_id: string
  session_id: string | null
  // Plain text, never rewritten by the system. NULL only for an attachment with
  // no caption. Limit: system_config 'context.note_max_chars' (DB ceiling 3000).
  content: string | null
  source: ContextSource
  author_id: string | null         // v1 = the canvas owner
  created_at: string
  updated_at: string               // bumped by DB trigger on every UPDATE
  deleted_at: string | null        // the USER deleted the note — undo clears it; agents never see a row with this set
}

export type ContextLink = {
  id: string                       // client-generated
  entry_id: string
  canvas_id: string                // always equals the entry's canvas_id (composite FK)
  target_type: ContextTargetType
  target_id: string | null         // NULL ⇔ target_type === 'canvas'; no FK (polymorphic)
  origin_status: ContextOriginStatus
  state: ContextLinkState
  created_at: string
  updated_at: string               // bumps on a move and on any state change
}

// The file behind an 'attachment' entry — v1: one per entry. Table only: there is
// no storage bucket or safety scan yet, so scan_status stays 'pending' and
// nothing may read the file. Clients insert as 'pending' and cannot update.
export type AttachmentScanStatus = 'pending' | 'clean' | 'rejected'

export type ContextAttachment = {
  id: string
  entry_id: string
  canvas_id: string
  storage_path: string             // object path in a PRIVATE bucket — never a public URL
  file_name: string
  mime_type: string
  size_bytes: number
  width: number | null             // images only
  height: number | null
  scan_status: AttachmentScanStatus
  alt_text: string | null
  uploaded_by: string | null
  created_at: string
}

// "Why remove this?" answer, stored against the DELETED component's type + id —
// never on a surviving component. No FK: the component no longer exists.
export type ComponentRemoval = {
  id: string
  canvas_id: string
  session_id: string | null
  component_type: 'node' | 'edge'
  component_id: string
  component_label: string          // snapshot, e.g. "n4 · Pricing", so the record stays readable
  reason: string
  created_by: string | null
  created_at: string
}

// Global tunables, read by the frontend on canvas load (select-only for clients).
// Keys: context.composer_max_lines, context.canvas_bar_max_lines,
// context.hash_autocomplete_rows, context.note_max_chars,
// context.panel_note_collapsed_lines, context.removal_prompt_visible_ms,
// edge.clarification_delay_ms, edge.needs_you_max_visible.
export type SystemConfigRow = {
  key: string
  value: unknown                   // JSON — numbers for every key above
  description: string | null
  updated_at: string
}

// Arguments of the Postgres function create_context_entry (supabase.rpc) — the one
// atomic write for a note: entry + its links (+ the file row). Idempotent on the
// client-generated ids, so a retry completes a half-finished write. Needs ≥1 link.
export type CreateContextEntryArgs = {
  p_entry: {
    id?: string
    canvas_id: string
    session_id?: string | null
    source: ContextSource
    content?: string | null
  }
  p_links: Array<{
    id?: string
    target_type: ContextTargetType
    target_id?: string | null
    origin_status?: ContextOriginStatus   // default 'OWNED'
  }>
  p_attachment?: {
    id?: string
    storage_path: string
    file_name: string
    mime_type: string
    size_bytes: number
    width?: number | null
    height?: number | null
    alt_text?: string | null
  } | null
}

// ─────────────────────────────────────────────
// Agent thread types
// ─────────────────────────────────────────────

export type GhostPair = {
  triggered_by_node_id: string
  context_ghost_id: string
  question_ghost_id: string | null
  pair_status: GhostStatus
}

export type ThreadMessage =
  | {
      role: 'user'
      turn_type: 'canvas_event' | 'session_boundary'
      content: string
      node_id?: string
      timestamp: string
    }
  | {
      role: 'assistant'
      turn_type: 'ghost_pair'
      content: string
      ghost_pair: GhostPair
      timestamp: string
    }
  | {
      // A finished ghost structure from one agent run. The nodes/edges are stored so
      // the thread knows what was proposed; the user's accept/reject is recorded on it.
      role: 'assistant'
      turn_type: 'ghost_structure'
      content: string          // short text of the proposal, for prose context only
      ghost_structure: {
        run_id: string
        focus_node_ids: string[]
        structure: GhostStructure
        // ghost_id -> status. Missing (turns saved before this existed) = every node pending.
        node_status?: Record<string, GhostNodeStatus>
        // Whole-turn status, worked out from node_status (see src/context/ghost-decisions.ts).
        // 'pending' while any first-level node waits for the user: this is what blocks canAgentFire.
        status: 'pending' | 'accepted' | 'rejected'
      }
      timestamp: string
    }
  | {
      // The Observer never writes a ghost pair — this turn just points at the
      // structure it produced. Per-edge outcomes are read live from
      // observer_structures/observer_edges at serialize time, never cached
      // here, so a structure's status can't go stale in the thread log.
      role: 'assistant'
      turn_type: 'observer_structure'
      content: string          // short summary, for prose context only
      structure_id: string
      timestamp: string
    }

export type AgentThread = {
  id: string
  canvas_id: string
  agent_role: AgentRole
  messages: ThreadMessage[]
  active_rejection_insight_ids: string[]
  updated_at: string
}

// ─────────────────────────────────────────────
// Observer structures
// ─────────────────────────────────────────────
// The Observer never writes a ghost pair directly into the thread. It highlights
// one or more existing canvas nodes (anchors) and proposes a hierarchical DAG of
// observation nodes reachable from them. The user hovers an anchor to reveal the
// structure and accepts/rejects each EDGE independently — never the structure as
// a unit. A node is the genuine synthesis of EVERY edge into it, so it only
// crosses into the canvas once ALL of its incoming edges are accepted; any
// rejected edge batches into a re-think of the whole observation instead of a
// local delete (see CORE-CONCEPTS.md → The Observer Structure).

export type ObservationNode = {
  ghost_id: string
  level: number              // 0 = bridges directly from the anchor nodes
  node_type: ContextNodeType
  content: string
}

export type ObserverEdge = {
  id: string
  structure_id: string
  from_id: string             // an anchor node id, or another observation node's ghost_id
  to_id: string                // an observation node's ghost_id
  status: GhostEdgeStatus
  created_at: string
}

export type ObserverStructure = {
  id: string
  canvas_id: string
  session_id: string | null
  thread_id: string | null
  anchor_node_ids: string[]
  nodes: ObservationNode[]
  created_at: string
}

// The Observer agent's direct output, before persistence — labels have already
// been remapped to backend-assigned ghost IDs, but no structure_id/created_at
// exist yet (assigned when the structure row is inserted).
export type ObserverObservation = {
  anchor_node_ids: string[]
  nodes: ObservationNode[]
  edges: Array<{ from_id: string; to_id: string }>
}

// ─────────────────────────────────────────────
// Attunement
// ─────────────────────────────────────────────

export type AttunementState = {
  id: string
  canvas_id: string
  session_id: string
  node_id: string | null
  cognitive_mode: CognitiveMode
  question_style: QuestionStyle
  phase_shift_suggested: boolean
  confidence: number | null   // 0.000 – 1.000
  created_at: string
}

// ─────────────────────────────────────────────
// Rejection Insights
// ─────────────────────────────────────────────

export type InsightPoint = {
  label: string           // e.g. "Avoid high-level analogies"
  sequence_number: number // which agent turn this came from
}

// Two categories of insight, distinguished by which fields are populated:
// - Content category (Expander/Stress-Tester/Observer ghost rejections): rejection_reason set, target_edge_id null
// - Connection category (Observer edge rejections): connection_feedback + target_edge_id set, rejection_reason null
export type RejectionInsight = {
  id: string
  canvas_id: string
  session_id: string | null
  thread_id: string | null
  rejection_reason: RejectionReason | null
  severity: InsightSeverity
  insight_points: InsightPoint[]
  turns_remaining: number | null  // null for non-temporal; counts down for temporal_deferral
  active: boolean
  target_edge_id: string | null              // set for connection-category rows — the rejected ObserverEdge
  connection_feedback: ConnectionRejectionReason | null
  created_at: string
}

// ─────────────────────────────────────────────
// Agent runs + ghost structures (context-engineering Slice 2)
// ─────────────────────────────────────────────
// A run = one agent invocation. Agents never write nodes/edges: they return a
// "ghost structure" (new nodes + edges). Nothing lands on the canvas until the
// user accepts it.

export type AgentRunStatus = 'queued' | 'running' | 'done' | 'failed'

// Which row holds the text that invoked the agent (e.g. "@expander dig into this").
export type AgentRunSourceType = 'context_entry' | 'node'

export type ContextScope = 'S1' | 'S2' | 'S3'

export type AgentRun = {
  id: string
  canvas_id: string
  session_id: string | null
  agent: AgentRole
  focus_node_ids: string[]
  source_type: AgentRunSourceType
  source_id: string
  status: AgentRunStatus
  scope: ContextScope | null
  error: string | null
  thread_id: string | null
  created_at: string
  finished_at: string | null
}

// ── What retrieval hands to prompt assembly ──

// One note the user attached to a node, an edge, or the canvas.
export type ContextNote = { id: string; content: string; created_at: string }

// full  = text + all visible notes.   title = short summary + how many notes it has.
export type LoadedNodeTier = 'full' | 'title'

// Why a node is in the prompt (the agent is told, so it knows how to treat it).
export type LoadedNodeReason = 'focus' | 'hop1' | 'ancestor'

export type LoadedNode = {
  id: string
  seq: number                  // the n{seq} the model will see
  tier: LoadedNodeTier
  reason: LoadedNodeReason
  content: string | null       // node text (always set for full tier)
  summary: string | null
  notes: ContextNote[]         // full tier only, oldest first
  note_count: number           // all tiers, so a title node can say "(2 notes)"
}

export type LoadedEdge = {
  id: string
  from_node_id: string         // parent
  to_node_id: string           // child
  label: string | null
  notes: ContextNote[]
}

export type RetrievalResult = {
  scope: ContextScope
  focus_node_ids: string[]
  nodes: LoadedNode[]          // focus first, then 1-hop, then ancestors
  edges: LoadedEdge[]          // only edges whose both ends are in `nodes`
  canvas_notes: ContextNote[]  // notes about the canvas as a whole
}

// What the frontend gets. All ids are real: node UUIDs, or ghost ids minted by the backend.
// (The model never sees these. It writes n5 / t1 / f1, see src/context/ghost-output.ts.)

// A frame is a box drawn around several ghost nodes. Its text explains how the nodes
// inside relate, or gives context about them. It has no edges of its own: the edges go
// from the existing node to the ghost nodes inside.
export type GhostFrame = { ghost_id: string; content: string }

// frame_id = the frame this node sits in (null = free standing).
// depth = steps from the existing canvas node it hangs off (1 = first level). The frontend
// shows depth 1 first and reveals depth N+1 when the user clicks a depth N node.
// Computed by the backend, never written by the model.
export type GhostNode = { ghost_id: string; content: string; frame_id: string | null; depth: number }

// from / to are node UUIDs or ghost node ids.
export type GhostEdge = { from: string; to: string; label: string | null }

// Where one ghost node stands. Stored on the thread turn (never sent in chunks).
//   pending   waiting for the user
//   accepted  the user accepted it (the frontend wrote it to the canvas as a real node)
//   rejected  the user rejected it
//   saved_off its parent was rejected and the user chose to KEEP the subtree: it hangs, unconnected,
//             and can still be accepted on its own later
//   deleted   removed together with a rejected parent (subtree delete)
export type GhostNodeStatus = 'pending' | 'accepted' | 'rejected' | 'saved_off' | 'deleted'

// A whole proposal. Streamed in pieces, saved whole on the thread when the run ends.
export type GhostStructure = {
  frames: GhostFrame[]
  nodes: GhostNode[]
  edges: GhostEdge[]
}

// ─────────────────────────────────────────────
// Streaming types
// ─────────────────────────────────────────────

export type SpawnDescriptor = {
  trigger_node_id: string
  session_id: string

  // Set for edge-triggered spawns (Articulator via a `relate` edge); undefined
  // for node-triggered spawns (Expander / Stress-Tester / Outer Subconscious).
  trigger_edge_id?: string

  // The canvas nodes the ghost pair visually anchors to — the frontend drives
  // its halos off this single field. ALWAYS populated: [trigger_node_id] for a
  // node-triggered spawn, [from_node_id, to_node_id] (source first) for a
  // relate-triggered Articulator run.
  anchor_node_ids: string[]

  context_node: {
    ghost_id: string
    node_type: ContextNodeType
    agent_role: AgentRole
  }
  context_edge: {
    from: string  // trigger_node_id
    to: string    // context ghost_id
  }

  question_node?: {
    ghost_id: string
    node_type: 'question'
  }
  question_edge?: {
    from: string  // context ghost_id
    to: string    // question ghost_id
  }
}

export type RedisMessage =
  // ── New ghost-structure stream (agents built on src/context/*) ──
  | { type: 'structure_start'; run_id: string; agent: AgentRole; focus_node_ids: string[] }
  | { type: 'ghost_chunk'; run_id: string; frames: GhostFrame[]; nodes: GhostNode[]; edges: GhostEdge[] }
  | { type: 'structure_done'; run_id: string; thread_id: string; turn_index: number }
  | { type: 'structure_error'; run_id: string; reason: string }
  // ── Old ghost-pair stream (Observer only, until Slice 3) ──
  | { type: 'spawn'; descriptor: SpawnDescriptor }
  | { type: 'chunk'; target: string; data: string }  // target = ghost_id
  // Server-side marker split: the token layer strips the agent's [NODE_TYPE: x]
  // marker and emits this instead of streaming it as ghost text. target = the
  // context ghost id; the FE restyles that ghost to node_type.
  | { type: 'node_type'; target: string; node_type: ContextNodeType }
  // Attribution-carrying done. The ghost_pair turn is persisted BEFORE this is
  // published, so thread_id/turn_index resolve the turn for POST /api/ghost-status
  // without polling. Published LAST in a generation (it tears down the SSE
  // connection — see src/routes/stream.ts is now hold-open, but ordering still
  // matters for any FE that finalizes on done).
  | {
      type: 'done'
      thread_id: string
      turn_index: number
      trigger_node_id: string
      context_ghost_id: string
      question_ghost_id: string | null
    }

// ─────────────────────────────────────────────
// Audit types
// ─────────────────────────────────────────────

export type AiContribution = {
  id: string
  canvas_id: string
  session_id: string | null
  agent_role: AgentRole
  ghost_id: string | null
  status: GhostStatus
  created_at: string
}

export type SessionLearning = {
  id: string
  canvas_id: string
  session_id: string
  content: string
  type: 'question' | 'contradiction' | 'empty_node'
  created_at: string
}

export type Subscription = {
  id: string
  user_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  tier: SubscriptionTier
  status: 'active' | 'canceled' | 'past_due'
  updated_at: string
}

// ─────────────────────────────────────────────
// Zod schemas — API route validation
// ─────────────────────────────────────────────

// POST /api/canvas-event
// ORDERING CONTRACT: the frontend writes the row to Supabase first, then POSTs
// here with the id. The backend always reads post-mutation state. Only
// node.created / node.updated / edge.created / ghost.accepted cause work; the
// delete / set-aside events are acknowledged and otherwise ignored.
export const canvasEventSchema = z
  .object({
    canvas_id: z.string().uuid(),
    session_id: z.string().uuid(),
    node_id: z.string().uuid().optional(),
    edge_id: z.string().uuid().optional(),
    // ghost.accepted carries the accepted ghost node id(s) — a pair accept is
    // 1–2 nodes (context, optional question) — plus the agent_role the FE
    // already knows from the spawn descriptor (used for the audit row; never
    // re-derived on the backend).
    node_ids: z.array(z.string().uuid()).min(1).optional(),
    agent_role: z
      .enum(['expander', 'stress_tester', 'observer', 'general'])
      .optional(),
    event_type: z.enum([
      'node.created',
      'node.updated',
      'node.deleted',
      'edge.created',
      'edge.deleted',
      'ghost.accepted',
      // Set-aside (soft-archive) — frontend writes set_aside_at directly to
      // Supabase, then notifies via one of these two, IDs only. See
      // CORE-CONCEPTS.md → set aside.
      'node.set_aside',
      'node.restored',
    ]),
  })
  .refine(
    (d) => {
      // ghost.accepted enriches accepted AI nodes: requires the node ids +
      // agent_role for the audit; no single node_id/edge_id.
      if (d.event_type === 'ghost.accepted') {
        return !!d.node_ids && d.node_ids.length > 0 && !!d.agent_role
      }
      const isNodeEvent =
        d.event_type === 'node.created' ||
        d.event_type === 'node.updated' ||
        d.event_type === 'node.deleted' ||
        d.event_type === 'node.set_aside' ||
        d.event_type === 'node.restored'
      return isNodeEvent ? !!d.node_id : !!d.edge_id
    },
    {
      message:
        'node events require node_id; edge events require edge_id; ghost.accepted requires node_ids + agent_role',
    }
  )

export type CanvasEvent = z.infer<typeof canvasEventSchema>

// POST /api/agent/run
// The frontend detected "@expander ..." (etc.) in a node's text or a context entry
// and asks the backend to run that agent. `source` is the row that holds the text;
// the backend reads it live (never trusts text from the request body).
export const agentRunRequestSchema = z.object({
  canvas_id: z.string().uuid(),
  session_id: z.string().uuid(),
  agent: z.enum(['expander', 'stress_tester', 'general']),
  focus_node_ids: z.array(z.string().uuid()),
  source: z.object({
    type: z.enum(['context_entry', 'node']),
    id: z.string().uuid(),
  }),
})

export type AgentRunRequest = z.infer<typeof agentRunRequestSchema>

// POST /api/ghost-status: the user decided about ONE ghost node of a ghost structure.
// Accept is per node. Reject may need a second answer: if rejecting would leave other ghost nodes
// hanging, `subtree_action` says what to do with them (the response lists them when it is missing).
export const ghostStatusSchema = z.object({
  thread_id: z.string().uuid(),
  turn_index: z.number().int().nonnegative(),
  canvas_id: z.string().uuid(),
  session_id: z.string().uuid(),
  ghost_id: z.string().uuid(),
  status: z.enum(['accepted', 'rejected']),
  // only for a reject that has a subtree: delete it, or keep it saved off
  subtree_action: z.enum(['delete', 'save_off']).optional(),
  // Free text the user typed, or null/missing. No reason = the outcome is recorded but teaches nothing.
  rejection_reason: z.string().trim().max(500).nullable().optional(),
  interacted_at: z.number().int(),  // unix ms timestamp
})

export type GhostStatusPayload = z.infer<typeof ghostStatusSchema>

// POST /api/observer-edge-status
export const observerEdgeStatusSchema = z.object({
  edge_id: z.string().uuid(),
  structure_id: z.string().uuid(),
  canvas_id: z.string().uuid(),
  session_id: z.string().uuid(),
  status: z.enum(['accepted', 'rejected']),
  connection_feedback: z.enum(['not_related', 'wrong_direction', 'too_indirect', 'already_obvious']).optional(),
  interacted_at: z.number().int(),  // unix ms timestamp
})

export type ObserverEdgeStatusPayload = z.infer<typeof observerEdgeStatusSchema>

// POST /api/session/start
export const sessionStartSchema = z.object({
  canvas_id: z.string().uuid(),
})

export type SessionStartPayload = z.infer<typeof sessionStartSchema>

// Response of POST /api/session/start. session_number is 1-indexed —
// priorSessions.length + 1 — so the frontend can render "Session N" without
// deriving it client-side from a full sessions fetch.
export type SessionStartResponse = {
  session_id: string
  session_number: number
}

// POST /api/session/complete
export const sessionCompleteSchema = z.object({
  session_id: z.string().uuid(),
  canvas_id: z.string().uuid(),
  carry_forward_ids: z.array(z.string().uuid()),  // unresolved thread IDs to carry forward
})

export type SessionCompletePayload = z.infer<typeof sessionCompleteSchema>
