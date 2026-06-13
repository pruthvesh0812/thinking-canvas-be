import { classifyTiers } from './tiers.js'
import { SERIALIZATION_RULES, type SerializationRule } from './rules.js'
import { buildRejectionBlock } from './rejection.js'
import { getNode } from '../db/nodes.js'
import { getEdgesByCanvas } from '../db/edges.js'
import { logger } from '../lib/logger.js'
import type {
  AgentThread,
  AgentRole,
  Canvas,
  ThreadMessage,
  Node,
  Edge,
  GhostStatus,
} from '../../types/index.js'

const DIVIDER = '────────────────────────────────────────────────'
const COMPRESS_DIVIDER = '════════════════════════════════════════════════'

// ─── Type helpers ────────────────────────────────────────────────────────────

type UserCanvasMsg = Extract<ThreadMessage, { role: 'user'; turn_type: 'canvas_event' | 'session_boundary' }>
type AssistantMsg = Extract<ThreadMessage, { role: 'assistant' }>

// ─── Small formatters ─────────────────────────────────────────────────────────

// Renders the immutable canvas north star as Tier 0 — always the first block in serialized output.
function northStarBlock(canvas: Canvas): string {
  return [
    `CANVAS NORTH STAR [${canvas.id.slice(0, 8)} | ANCHOR]`,
    `"${canvas.original_intent}"`,
  ].join('\n')
}

function ghostSymbol(status: GhostStatus): string {
  switch (status) {
    case 'accepted':          return '✓ ACCEPTED'
    case 'context_accepted':  return '✓ CONTEXT ACCEPTED'
    case 'question_accepted': return '✓ QUESTION ACCEPTED'
    case 'rejected':          return '✗ REJECTED'
    case 'pending':           return '⧗ PENDING'
    default:                  return status
  }
}

// Builds INCOMING + OUTGOING edge lines for a node using the pre-fetched canvas edge list.
function edgeLines(
  nodeId: string,
  edges: Edge[],
  nodeMap: Map<string, Node>,
  seqMap: Map<string, number>,
): string[] {
  const lines: string[] = []

  // Step 1 — Emit one INCOMING line per edge that points INTO this node.
  const inc = edges.filter(e => e.to_node_id === nodeId)
  for (const e of inc) {
    const src = nodeMap.get(e.from_node_id)
    const srcSeq = seqMap.get(e.from_node_id) ?? '?'
    const marker = src?.direction_marker ?? '?'
    const summary = src?.summary ?? ''
    lines.push(`INCOMING: [seq:${srcSeq} | ${marker}] ──${e.edge_type}──▶ "${summary}"`)
  }

  // Step 2 — Emit one OUTGOING line per edge that leaves this node.
  const out = edges.filter(e => e.from_node_id === nodeId)
  if (out.length === 0) {
    lines.push('OUTGOING: none yet')
  } else {
    for (const e of out) {
      const dstSeq = seqMap.get(e.to_node_id) ?? '?'
      lines.push(`OUTGOING: ──${e.edge_type}──▶ seq:${dstSeq}`)
    }
  }

  return lines
}

// ─── Tier formatters ──────────────────────────────────────────────────────────

// Formats the active (most recent) node — Tier 1.
// Full content + edges + optional attunement + optional ghost pair history.
function formatTier1(
  msg: UserCanvasMsg,
  assistantMsg: AssistantMsg | null,
  seq: number,
  node: Node | undefined,
  edges: Edge[],
  nodeMap: Map<string, Node>,
  seqMap: Map<string, number>,
  rule: SerializationRule,
  pendingNodeCount: number,
): string {
  const nodeId = 'node_id' in msg && msg.node_id ? msg.node_id : 'unknown'
  const marker = node?.direction_marker ?? ''
  const markerStr = marker ? ` | ${marker}` : ''

  // Step 1 — Header: seq number, node ID, direction marker, and ACTIVE flag.
  const lines: string[] = [
    DIVIDER,
    `[seq:${seq} | ${nodeId}${markerStr} | ★ACTIVE]`,
  ]

  // Step 2 — Content: full text, or summary if agent rule says summary-only (Observer).
  if (rule.activeNode === 'summary') {
    lines.push(`SUMMARY: "${node?.summary ?? msg.content}"`)
  } else {
    lines.push(`CONTENT: "${msg.content}"`)
  }

  // Step 3 — Edge connections: shows where this node connects in the graph.
  lines.push(...edgeLines(nodeId, edges, nodeMap, seqMap))

  // Step 4 — Attunement data (Expander only — cognitive mode + question style).
  if (rule.includeAttunement) {
    lines.push('ATTUNEMENT: (see attunement_states table)')
  }

  // Step 5 — Ghost history: the agent's last response for this trigger, with its current status.
  // Tracks how many new nodes were created while the ghost was still pending.
  if (assistantMsg && rule.includeGhostHistory !== 'none') {
    const gp = assistantMsg.ghost_pair
    const status = ghostSymbol(gp.pair_status)
    const pendingNote = gp.pair_status === 'pending' && pendingNodeCount > 0
      ? ` (${pendingNodeCount} node${pendingNodeCount > 1 ? 's' : ''} created while pending)`
      : ''
    lines.push(`MY LAST RESPONSE [triggered by seq:${seq}]:`)
    lines.push(`  ${assistantMsg.content.slice(0, 80)}... STATUS: ${status}${pendingNote}`)
  }

  lines.push(DIVIDER)
  return lines.join('\n')
}

// Formats a recent node — Tier 2 (last 3 turns before active).
// Full or summary content per agent rule, plus ghost response outcome.
function formatTier2(
  msg: UserCanvasMsg,
  assistantMsg: AssistantMsg | null,
  seq: number,
  node: Node | undefined,
  edges: Edge[],
  nodeMap: Map<string, Node>,
  seqMap: Map<string, number>,
  rule: SerializationRule,
): string {
  const nodeId = 'node_id' in msg && msg.node_id ? msg.node_id : 'unknown'
  const marker = node?.direction_marker ?? ''
  const markerStr = marker ? ` | ${marker}` : ''

  // Step 1 — Header: seq number, node ID, direction marker.
  const lines: string[] = [
    DIVIDER,
    `[seq:${seq} | ${nodeId}${markerStr}]`,
  ]

  // Step 2 — Content at depth dictated by agent rule.
  // full+contradictions (Stress-Tester) adds a warning flag on contradiction nodes.
  if (rule.tier2 === 'summary') {
    lines.push(`SUMMARY: "${node?.summary ?? msg.content}"`)
  } else {
    lines.push(`CONTENT: "${msg.content}"`)
    if (rule.tier2 === 'full+contradictions' && marker === 'contradicts') {
      lines.push('⚠ CONTRADICTION — flag for stress testing')
    }
  }

  // Step 3 — Edge connections.
  lines.push(...edgeLines(nodeId, edges, nodeMap, seqMap))

  // Step 4 — Ghost outcome: was the agent's response for this node accepted or rejected?
  if (assistantMsg && rule.includeGhostHistory !== 'none') {
    const gp = assistantMsg.ghost_pair
    lines.push(`MY RESPONSE: ${ghostSymbol(gp.pair_status)}`)
    if (gp.pair_status === 'rejected') {
      lines.push('REJECTION: reason injected in NEGATIVE CONSTRAINTS')
    }
  }

  lines.push(DIVIDER)
  return lines.join('\n')
}

// Formats a mid-range node — Tier 3 (turns 4–10 from end).
// Summary only + compact edge notation to save context tokens.
function formatTier3(
  msg: UserCanvasMsg,
  assistantMsg: AssistantMsg | null,
  seq: number,
  node: Node | undefined,
  edges: Edge[],
  nodeMap: Map<string, Node>,
  seqMap: Map<string, number>,
  rule: SerializationRule,
): string {
  const nodeId = 'node_id' in msg && msg.node_id ? msg.node_id : 'unknown'
  const marker = node?.direction_marker ?? ''
  const markerStr = marker ? ` | ${marker}` : ''

  // Step 1 — Header: seq number, node ID, direction marker.
  const lines: string[] = [
    DIVIDER,
    `[seq:${seq} | ${nodeId}${markerStr}]`,
  ]

  // Step 2 — Summary only (full content is not included at this depth).
  // Stress-Tester also flags contradiction nodes for extraction.
  lines.push(`SUMMARY: "${node?.summary ?? msg.content.slice(0, 60) + '...'}"`)
  if (rule.tier3 === 'summary+flag' && marker === 'contradicts') {
    lines.push('⚠ FLAG CONTRADICTION')
  }

  // Step 3 — Compact single-line edge notation (saves tokens vs. multi-line format).
  const inc = edges.filter(e => e.to_node_id === nodeId)
  const out = edges.filter(e => e.from_node_id === nodeId)
  const incStr = inc.map(e => `seq:${seqMap.get(e.from_node_id) ?? '?'} ──${e.edge_type}──▶`).join(' ')
  const outStr = out.map(e => `──▶ seq:${seqMap.get(e.to_node_id) ?? '?'}`).join(' ')
  if (inc.length || out.length) {
    lines.push(`INCOMING: ${incStr || 'none'} | OUTGOING: ${outStr || 'none'}`)
  }

  // Step 4 — Bare accepted/rejected marker for ghost history (no content detail).
  if (assistantMsg && rule.includeGhostHistory !== 'none') {
    const gp = assistantMsg.ghost_pair
    const accepted = ['accepted', 'context_accepted', 'question_accepted'].includes(gp.pair_status)
    lines.push(`RESPONSE: ${accepted ? '✓' : '✗'}`)
  }

  lines.push(DIVIDER)
  return lines.join('\n')
}

type Tier4Item = {
  msg: UserCanvasMsg
  assistantMsg: AssistantMsg | null
  seq: number
  node: Node | undefined
  edges: Edge[]
  seqMap: Map<string, number>
}

// Formats up to 5 old nodes as a single compressed block — Tier 4 (turns 11+ from end).
// Preserves trail direction and response pattern; drops all content and summaries.
function formatTier4Group(items: Tier4Item[]): string {
  const seqs = items.map(it => it.seq)
  const nodeIds = items.map(it => ('node_id' in it.msg && it.msg.node_id ? it.msg.node_id : 'unknown'))

  // Step 1 — Header: seq range and node IDs in this compressed block.
  const lines: string[] = [
    COMPRESS_DIVIDER,
    `[COMPRESSED | seq:${seqs[0]}-${seqs[seqs.length - 1]} | nodes: ${nodeIds.join(',')}]`,
    'TRAIL:',
  ]

  let accepted = 0
  let rejected = 0

  // Step 2 — One trail line per node: direction marker + first outgoing edge arrow.
  // Also tallies accepted/rejected ghost outcomes for the response pattern footer.
  for (const it of items) {
    const marker = it.node?.direction_marker ?? '?'
    const nodeId = 'node_id' in it.msg && it.msg.node_id ? it.msg.node_id : ''
    const out = it.edges.filter(e => e.from_node_id === nodeId)
    const arrow = out.length > 0 ? ` ──${out[0].edge_type}──▶ seq:${it.seqMap.get(out[0].to_node_id) ?? '?'}` : ''
    lines.push(`[seq:${it.seq} | ${marker}]${arrow}`)

    if (it.assistantMsg) {
      const status = it.assistantMsg.ghost_pair.pair_status
      if (['accepted', 'context_accepted', 'question_accepted'].includes(status)) accepted++
      else if (status === 'rejected') rejected++
    }
  }

  // Step 3 — Footer: direction summary and response pattern totals.
  lines.push(`DIRECTION: (${items.length} nodes compressed)`)
  lines.push(`RESPONSE PATTERN: accepted:${accepted} rejected:${rejected}`)
  lines.push(COMPRESS_DIVIDER)
  return lines.join('\n')
}

// ─── Main serialize() ─────────────────────────────────────────────────────────

// Called by all pipeline functions before agent invocation.
// Converts the agent's canvas-scoped thread into structured text for the LLM context window.
export async function serialize(
  thread: AgentThread,
  agentRole: AgentRole,
  canvas: Canvas,
): Promise<string> {
  const rule = SERIALIZATION_RULES[agentRole]
  logger.info('serialize:start', { canvas_id: canvas.id, agent_role: agentRole, message_count: thread.messages.length })

  // Step 1 — Collect all node IDs referenced across the thread so they can be batch-fetched.
  const nodeIds = thread.messages
    .filter((m): m is Extract<ThreadMessage, { role: 'user'; turn_type: 'canvas_event' | 'session_boundary' }> =>
      m.role === 'user' && m.turn_type === 'canvas_event'
    )
    .map(m => ('node_id' in m ? m.node_id : undefined))
    .filter((id): id is string => Boolean(id))

  // Step 2 — Fetch node metadata, canvas edges, and the rejection block in parallel.
  // Nodes are fetched individually (no batch endpoint) but all fired at once via Promise.all.
  const [nodeResults, edges, rejectionBlock] = await Promise.all([
    Promise.all(nodeIds.map(id => getNode(id).catch(() => null))),
    getEdgesByCanvas(canvas.id),
    rule.includeRejectionInsights ? buildRejectionBlock(canvas.id) : Promise.resolve(''),
  ])

  // Step 3 — Build lookup maps used by every formatter.
  // nodeMap: node_id → Node  |  seqMap: node_id → 1-based position in thread
  const nodeMap = new Map<string, Node>()
  for (const n of nodeResults) {
    if (n) nodeMap.set(n.id, n)
  }

  const seqMap = new Map<string, number>()
  let seqCounter = 0
  for (const msg of thread.messages) {
    if (msg.role === 'user' && msg.turn_type === 'canvas_event' && 'node_id' in msg && msg.node_id) {
      seqCounter++
      seqMap.set(msg.node_id, seqCounter)
    }
  }

  // Step 4 — Classify every message in the thread into a tier (1–4).
  const tierMap = classifyTiers(thread.messages)

  // ── Assembly ────────────────────────────────────────────────────────────────

  const parts: string[] = []

  // Step 5 — North Star (Tier 0) — always first, always present.
  parts.push(northStarBlock(canvas))

  // Step 6 — Most recent session boundary marker, if any.
  // Placed directly after the north star so the agent sees the current session context.
  const sessionBoundaries = thread.messages.filter(
    (m): m is Extract<ThreadMessage, { role: 'user'; turn_type: 'canvas_event' | 'session_boundary' }> =>
      m.role === 'user' && m.turn_type === 'session_boundary'
  )
  if (sessionBoundaries.length > 0) {
    parts.push(sessionBoundaries[sessionBoundaries.length - 1].content)
  }

  // Step 7 — NEGATIVE CONSTRAINTS block (Expander, Stress-Tester, Observer only).
  if (rejectionBlock) parts.push(rejectionBlock)

  // Step 8 — Stateless agents (Outer Sub): stop here — only Tier 0 + active node.
  // No thread history, no rejection injection, no tier 2–4.
  if (rule.threadType === 'stateless') {
    for (let i = thread.messages.length - 1; i >= 0; i--) {
      const msg = thread.messages[i]
      if (msg.role !== 'user' || msg.turn_type !== 'canvas_event') continue

      const nodeId = 'node_id' in msg ? msg.node_id : undefined
      const seq = nodeId ? (seqMap.get(nodeId) ?? 0) : 0
      const node = nodeId ? nodeMap.get(nodeId) : undefined
      const assistantMsg = (i + 1 < thread.messages.length && thread.messages[i + 1].role === 'assistant')
        ? (thread.messages[i + 1] as AssistantMsg)
        : null

      parts.push(formatTier1(msg as UserCanvasMsg, assistantMsg, seq, node, edges, nodeMap, seqMap, rule, 0))
      break
    }
    return parts.join('\n\n')
  }

  // Step 9 — Canvas-stateful agents: iterate the thread and sort messages into tier buckets.
  // Tier 4 items are collected separately for grouping; all others are formatted immediately.
  const tier1Blocks: string[] = []
  const tier2Blocks: string[] = []
  const tier3Blocks: string[] = []
  const tier4Items: Tier4Item[] = []

  for (let i = 0; i < thread.messages.length; i++) {
    const msg = thread.messages[i]

    // session_boundary and assistant messages are handled elsewhere — skip in this loop.
    if (msg.role === 'user' && msg.turn_type === 'session_boundary') continue
    if (msg.role === 'assistant') continue
    if (msg.role !== 'user' || msg.turn_type !== 'canvas_event') continue

    const tier = tierMap.get(String(i))
    if (tier === undefined) continue

    // Pair the user message with its immediately following assistant response (if any).
    const assistantMsg = (i + 1 < thread.messages.length && thread.messages[i + 1].role === 'assistant')
      ? (thread.messages[i + 1] as AssistantMsg)
      : null

    const nodeId = 'node_id' in msg ? msg.node_id : undefined
    const seq = nodeId ? (seqMap.get(nodeId) ?? 0) : 0
    const node = nodeId ? nodeMap.get(nodeId) : undefined

    switch (tier) {
      case 1: {
        // Count how many canvas_event nodes arrived after this turn while ghost is still pending.
        // This context tells the agent how stale its last response might be.
        let pendingCount = 0
        if (assistantMsg?.ghost_pair.pair_status === 'pending') {
          for (let j = i + 2; j < thread.messages.length; j++) {
            const later = thread.messages[j]
            if (later.role === 'user' && later.turn_type === 'canvas_event') pendingCount++
          }
        }
        tier1Blocks.push(formatTier1(msg as UserCanvasMsg, assistantMsg, seq, node, edges, nodeMap, seqMap, rule, pendingCount))
        break
      }
      case 2:
        tier2Blocks.push(formatTier2(msg as UserCanvasMsg, assistantMsg, seq, node, edges, nodeMap, seqMap, rule))
        break
      case 3:
        if (rule.tier3 !== 'na') {
          tier3Blocks.push(formatTier3(msg as UserCanvasMsg, assistantMsg, seq, node, edges, nodeMap, seqMap, rule))
        }
        break
      case 4:
        if (rule.tier4 !== 'na') {
          tier4Items.push({ msg: msg as UserCanvasMsg, assistantMsg, seq, node, edges, seqMap })
        }
        break
    }
  }

  // Step 10 — Group Tier 4 items into compressed blocks of 5 (oldest first).
  const tier4Blocks: string[] = []
  for (let i = 0; i < tier4Items.length; i += 5) {
    tier4Blocks.push(formatTier4Group(tier4Items.slice(i, i + 5)))
  }

  // Step 11 — Final assembly in recency-first order so the active node is near the top.
  // Order: Tier 1 (active) → Tier 2 (recent) → Tier 3 (mid) → Tier 4 (compressed oldest)
  parts.push(...tier1Blocks)
  parts.push(...tier2Blocks)
  parts.push(...tier3Blocks)
  parts.push(...tier4Blocks)

  logger.info('serialize:done', { canvas_id: canvas.id, agent_role: agentRole, parts: parts.length })
  return parts.join('\n\n')
}
