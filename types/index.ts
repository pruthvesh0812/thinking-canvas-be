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

export type AgentThread = {
  id: string
  canvas_id: string
  agent_role: AgentRole
  messages: ThreadMessage[]
  active_rejection_insight_ids: string[]
  updated_at: string
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

export type RejectionInsight = {
  id: string
  canvas_id: string
  session_id: string | null
  thread_id: string | null
  rejection_reason: RejectionReason
  severity: InsightSeverity
  insight_points: InsightPoint[]
  turns_remaining: number | null  // null for non-temporal; counts down for temporal_deferral
  active: boolean
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
