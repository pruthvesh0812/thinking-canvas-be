// The logic of POST /api/agent/run, apart from Hono, so it can be tested with fakes.
// Checks everything BEFORE any money is spent: the request is valid, the agent may run,
// the focus and the invoking text really exist on this canvas, and canAgentFire allows it.

import { agentRunRequestSchema } from '../../types/index.js'
import type { AgentRole, AgentRun, Canvas, Node, Session, SubscriptionTier } from '../../types/index.js'

// Agents that already work end to end. The request contract allows more; they get a clear 501 until built.
const BUILT_AGENTS: AgentRole[] = ['expander']

export type AgentRunDeps = {
  getCanvas(canvasId: string): Promise<Canvas>
  getSession(sessionId: string): Promise<Session>
  getTierByUser(userId: string): Promise<SubscriptionTier>
  getAvailableAgents(tier: SubscriptionTier): AgentRole[]
  getNodesByIds(ids: string[]): Promise<Node[]>
  getInvokingEntryText(canvasId: string, entryId: string): Promise<string | null>
  canAgentFire(canvasId: string, agent: AgentRole, focusNodeIds: string[]): Promise<boolean>
  createRun(input: Pick<AgentRun, 'canvas_id' | 'session_id' | 'agent' | 'focus_node_ids' | 'source_type' | 'source_id'> & { session_id: string }): Promise<AgentRun>
  sendRunRequested(data: { run_id: string; canvas_id: string; agent: AgentRole }): Promise<void>
}

export type HandlerResult = { status: 200 | 202 | 400 | 403 | 404 | 409 | 501; body: Record<string, unknown> }

export async function handleAgentRun(rawBody: unknown, deps: AgentRunDeps): Promise<HandlerResult> {
  // ── 1. is the request well formed? ──
  const parsed = agentRunRequestSchema.safeParse(rawBody)
  if (!parsed.success) return { status: 400, body: { error: 'invalid payload', issues: parsed.error.issues } }
  const { canvas_id, session_id, agent, focus_node_ids, source } = parsed.data

  // ── 2. does the canvas exist, and does the session belong to it? ──
  let canvas: Canvas
  let session: Session
  try {
    ;[canvas, session] = await Promise.all([deps.getCanvas(canvas_id), deps.getSession(session_id)])
  } catch {
    return { status: 404, body: { error: 'canvas or session not found' } }
  }
  if (session.canvas_id !== canvas.id) return { status: 400, body: { error: 'session does not belong to this canvas' } }

  // ── 3. tier check, server side (non-negotiable #2). Today every tier gets every agent ──
  const tier = await deps.getTierByUser(canvas.user_id)
  if (!deps.getAvailableAgents(tier).includes(agent)) {
    return { status: 403, body: { error: `agent ${agent} is not available on the ${tier} tier` } }
  }

  // ── 4. is the agent built yet? ──
  if (!BUILT_AGENTS.includes(agent)) return { status: 501, body: { error: `agent ${agent} is not available yet` } }

  // ── 5. focus: at least one node, all on THIS canvas and not set aside ──
  if (focus_node_ids.length === 0) return { status: 400, body: { error: 'focus_node_ids needs at least one node' } }
  const focusNodes = (await deps.getNodesByIds(focus_node_ids)).filter(node => node.canvas_id === canvas_id)
  if (focusNodes.length !== new Set(focus_node_ids).size) {
    return { status: 400, body: { error: 'a focus node does not exist on this canvas (or is set aside)' } }
  }

  // ── 6. the row holding the invoking text must exist on this canvas ──
  if (source.type === 'node') {
    const [node] = (await deps.getNodesByIds([source.id])).filter(n => n.canvas_id === canvas_id)
    if (!node) return { status: 400, body: { error: 'source node does not exist on this canvas' } }
  } else {
    const text = await deps.getInvokingEntryText(canvas_id, source.id)
    if (text === null) return { status: 400, body: { error: 'source note not found, deleted, or not linked' } }
  }

  // ── 7. non-negotiable #1: the guard, before every run ──
  if (!(await deps.canAgentFire(canvas_id, agent, focus_node_ids))) {
    return { status: 409, body: { error: 'this agent is already running on this focus, or its earlier ghosts are still waiting for you' } }
  }

  // ── 8. all good: record the run, hand it to the worker, answer right away ──
  const run = await deps.createRun({
    canvas_id, session_id, agent, focus_node_ids, source_type: source.type, source_id: source.id,
  })
  await deps.sendRunRequested({ run_id: run.id, canvas_id, agent })

  return { status: 202, body: { run_id: run.id } }
}
