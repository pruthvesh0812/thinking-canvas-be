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

export type EdgeType = 'logical' | 'doubt' | 'question' | 'associative'

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
  content: string | null
  summary: string | null            // gemini-2.5-flash directional summary
  direction_marker: DirectionMarker | null
  embedding: number[] | null        // VECTOR(3072) — gemini-embedding-2
  created_at: string
}

// The Observer's canvas map only ever reads these fields off a node (never
// .content — see CORE-CONCEPTS.md) — narrows getAllByCanvas's select() to
// match, instead of over-fetching every column for every node on the canvas.
export type CanvasMapNode = Pick<Node, 'id' | 'session_id' | 'summary' | 'direction_marker'>

export type Edge = {
  id: string
  canvas_id: string
  session_id: string
  from_node_id: string
  to_node_id: string
  edge_type: EdgeType
  both_existing: boolean
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

export type RedisMessage =
  | { type: 'spawn'; descriptor: SpawnDescriptor }
  | { type: 'chunk'; target: string; data: string }  // target = ghost_id
  | { type: 'done' }

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
export const canvasEventSchema = z.object({
  canvas_id: z.string().uuid(),
  session_id: z.string().uuid(),
  node_id: z.string().uuid(),
  edge_type: z.enum(['logical', 'doubt', 'question', 'associative']).optional(),
  both_existing: z.boolean().optional(),
  event_type: z.enum(['node.created', 'edge.created']),
})

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

// POST /api/session/complete
export const sessionCompleteSchema = z.object({
  session_id: z.string().uuid(),
  canvas_id: z.string().uuid(),
  carry_forward_ids: z.array(z.string().uuid()),  // unresolved thread IDs to carry forward
})

export type SessionCompletePayload = z.infer<typeof sessionCompleteSchema>
