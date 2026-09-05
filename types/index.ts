import { z } from 'zod'

// ─────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────

export type AgentRole =
  | 'expander'
  | 'stress_tester'
  | 'observer'
  | 'outer_subconscious'
  | 'articulator'

export type ContextNodeType =
  | 'reframe'
  | 'mirror'
  | 'pattern'
  | 'reference'
  | 'contradiction'
  | 'appreciation'

// 'relate' is the DELIBERATE "articulate this connection" gesture — the only
// edge type that triggers the Articulator immediately. 'logical' (and doubt /
// associative) are silent structural edges: drawing one just rearranges the
// canvas, absorbed into the next debounced pass, so the user isn't ambushed by
// a ghost every time they tidy up their thinking. 'question' still fires the
// Outer Subconscious.
export type EdgeType = 'logical' | 'doubt' | 'question' | 'associative' | 'relate'

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
  canvas_version: number    // context fingerprint — bumped by DB trigger on nodes/edges (§6)
  created_at: string
}

export type Session = {
  id: string
  canvas_id: string
  status: 'active' | 'closed'
  current_phase: SessionPhase
  node_sequence: string[]   // ordered node IDs created in THIS session only
  latest_seq: number        // monotonic version guard — latest intervention seq (§4e)
  receptivity: number             // decayed offer-response aggregate, [0,1] (§8) — timing signal, never content
  receptivity_updated_at: string  // last write, for the decay-toward-neutral calc
  start_time: string
  end_time: string | null
}

export type Node = {
  id: string
  canvas_id: string
  session_id: string
  owner: 'human' | 'ai'
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
}

// The Observer's canvas map only ever reads these fields off a node (never
// .content — see CORE-CONCEPTS.md) — narrows getAllByCanvas's select() to
// match, instead of over-fetching every column for every node on the canvas.
export type CanvasMapNode = Pick<Node, 'id' | 'session_id' | 'summary' | 'direction_marker'>

// The judge reads the canvas map with COMPLETE content — maturity preconditions
// live in the wording of nodes, which summaries lose (DESIGN §4b). Still excludes
// the embedding column, which no map ever renders.
export type JudgeMapNode = CanvasMapNode & Pick<Node, 'content'>

export type Edge = {
  id: string
  canvas_id: string
  session_id: string
  from_node_id: string
  to_node_id: string
  edge_type: EdgeType
  both_existing: boolean
  // Frontend-owned handle attachments — restored on refetch so an edge
  // reattaches to the exact same sides it left. Backend never reads or
  // writes these; agent pipelines route off edge_type / both_existing only.
  // Nullable to keep pre-migration edges valid.
  from_handle: EdgeHandle | null
  to_handle: EdgeHandle | null
  created_at: string
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
    edge_type: EdgeType
    from: string  // trigger_node_id
    to: string    // context ghost_id
  }

  question_node?: {
    ghost_id: string
    node_type: 'question'
  }
  question_edge?: {
    edge_type: EdgeType
    from: string  // context ghost_id
    to: string    // question ghost_id
  }
}

// ─────────────────────────────────────────────
// Intervention Spectrum — offer lifecycle (§4f)
// ─────────────────────────────────────────────
// The persisted handle for the decide → wait → generate handshake. The judge returns a
// decision; the pipeline builds + persists an offer from it. Ephemeral — durable through
// the active flow, then purged (session close + TTL). No retention guarantee.

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

export type RedisMessage =
  | { type: 'waiting'; offer: InterventionOffer; timer_ms: number }  // "mature + pipeline waiting" — starts the timer (§4d); timer_ms is receptivity-tuned (§8)
  | { type: 'offer'; offer: InterventionOffer }      // low-intensity show — glow / sidebar card (§5)
  | { type: 'withdraw'; offer_id: string }           // supersede / no-longer-mature (§4e)
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
// here with the id. The backend always reads post-mutation state — the
// fingerprint DB trigger has already fired and bumped canvas_version.
// This applies equally to creates, updates, deletes, and re-parents
// (edge.deleted + edge.created).
//
// Cross-repo dependency: the frontend must persist ALL mutations to Supabase —
// not just creates. A delete the FE never wrote is invisible to the fingerprint
// and to the judge's canvas-map read (DESIGN §4g).
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
      .enum(['expander', 'stress_tester', 'observer', 'outer_subconscious', 'articulator'])
      .optional(),
    event_type: z.enum([
      'node.created',
      'node.updated',
      'node.deleted',
      'edge.created',
      'edge.deleted',
      'ghost.accepted',
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
        d.event_type === 'node.deleted'
      return isNodeEvent ? !!d.node_id : !!d.edge_id
    },
    {
      message:
        'node events require node_id; edge events require edge_id; ghost.accepted requires node_ids + agent_role',
    }
  )

export type CanvasEvent = z.infer<typeof canvasEventSchema>

// POST /api/ghost-status
export const ghostStatusSchema = z.object({
  thread_id: z.string().uuid(),
  turn_index: z.number().int().nonnegative(),
  canvas_id: z.string().uuid(),
  session_id: z.string().uuid(),
  context_node_status: z.enum(['accepted', 'rejected']),
  question_node_status: z.enum(['accepted', 'rejected']).nullable(),
  rejection_reason: z.enum(['too_abstract', 'too_technical', 'skip_for_now']).optional(),
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
