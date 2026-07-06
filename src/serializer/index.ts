import { classifyTiers, type Tier } from './tiers.js'
import { SERIALIZATION_RULES, type TieredSerializationRule, type CanvasMapRule } from './rules.js'
import { buildRejectionBlock, buildFullRejectionBlock } from './rejection.js'
import { getNode, getAllByCanvas, getAllByCanvasWithContent, getRecentNodes } from '../db/nodes.js'
import { getEdgesByCanvas } from '../db/edges.js'
import { getStructuresByCanvas, getEdgesByStructures } from '../db/observer-structures.js'
import { logger } from '../lib/logger.js'
import type {
  AgentThread,
  AgentRole,
  Canvas,
  ThreadMessage,
  Node,
  CanvasMapNode,
  Edge,
  GhostStatus,
  ObserverStructure,
  ObserverEdge,
} from '../../types/index.js'

const DIVIDER = '────────────────────────────────────────────────'
const COMPRESS_DIVIDER = '════════════════════════════════════════════════'

// ─── Type helpers ────────────────────────────────────────────────────────────

type UserCanvasMsg = Extract<ThreadMessage, { role: 'user'; turn_type: 'canvas_event' | 'session_boundary' }>

// Tier formatters only ever render ghost_pair turns — canvas-map agents (Observer)
// skip the tiered path entirely (see serializeCanvasMap), so a non-ghost_pair
// assistant turn can never reach them. Narrowing through this guard, rather than
// typing assistantMsg as the full ThreadMessage assistant union, makes that a
// compile-time fact: a future turn_type added to ThreadMessage can't silently
// reach `.ghost_pair` here without TypeScript flagging every call site that needs
// its own handling.
type GhostPairMsg = Extract<ThreadMessage, { role: 'assistant'; turn_type: 'ghost_pair' }>

// Returns msg narrowed to GhostPairMsg, or null if it's missing, a user turn,
// or a non-ghost_pair assistant turn (e.g. a future observer_structure turn).
function asGhostPairMsg(msg: ThreadMessage | undefined): GhostPairMsg | null {
  return msg && msg.role === 'assistant' && msg.turn_type === 'ghost_pair' ? msg : null
}

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

// Builds INCOMING + OUTGOING edge lines from a node's own pre-filtered edge
// lists. nodeMap only needs to support .get() (ReadonlyMap) so callers can
// pass either a Map<string, Node> or a Map<string, CanvasMapNode>.
function formatEdgeLines(
  incoming: Edge[],
  outgoing: Edge[],
  nodeMap: ReadonlyMap<string, Pick<Node, 'direction_marker' | 'summary'>>,
  seqMap: ReadonlyMap<string, number>,
): string[] {
  const lines: string[] = []

  // Step 1 — Emit one INCOMING line per edge that points INTO this node.
  for (const e of incoming) {
    const src = nodeMap.get(e.from_node_id)
    const srcSeq = seqMap.get(e.from_node_id) ?? '?'
    const marker = src?.direction_marker ?? '?'
    const summary = src?.summary ?? ''
    lines.push(`INCOMING: [seq:${srcSeq} | ${marker}] ──${e.edge_type}──▶ "${summary}"`)
  }

  // Step 2 — Emit one OUTGOING line per edge that leaves this node.
  if (outgoing.length === 0) {
    lines.push('OUTGOING: none yet')
  } else {
    for (const e of outgoing) {
      const dstSeq = seqMap.get(e.to_node_id) ?? '?'
      lines.push(`OUTGOING: ──${e.edge_type}──▶ seq:${dstSeq}`)
    }
  }

  return lines
}

// Builds INCOMING + OUTGOING edge lines for a node by filtering the full
// canvas edge list — fine for the tier formatters below, since they're only
// ever called once per thread message. canvasMapBlock pre-indexes instead
// (see indexEdgesByNode) since it calls this once per node across the WHOLE
// canvas, where re-filtering the full edge list per node is O(n²).
function edgeLines(
  nodeId: string,
  edges: Edge[],
  nodeMap: ReadonlyMap<string, Pick<Node, 'direction_marker' | 'summary'>>,
  seqMap: ReadonlyMap<string, number>,
): string[] {
  return formatEdgeLines(
    edges.filter(e => e.to_node_id === nodeId),
    edges.filter(e => e.from_node_id === nodeId),
    nodeMap,
    seqMap,
  )
}

// Groups edges by endpoint once, so a caller that needs every node's
// incoming/outgoing lists (canvasMapBlock) can look each one up in O(1)
// instead of re-filtering the whole edge list per node.
function indexEdgesByNode(edges: Edge[]): { incoming: Map<string, Edge[]>; outgoing: Map<string, Edge[]> } {
  const incoming = new Map<string, Edge[]>()
  const outgoing = new Map<string, Edge[]>()
  for (const e of edges) {
    const incList = incoming.get(e.to_node_id)
    if (incList) incList.push(e)
    else incoming.set(e.to_node_id, [e])

    const outList = outgoing.get(e.from_node_id)
    if (outList) outList.push(e)
    else outgoing.set(e.from_node_id, [e])
  }
  return { incoming, outgoing }
}

// ─── Tier formatters ──────────────────────────────────────────────────────────

// Formats the active (most recent) node — Tier 1.
// Full content + edges + optional attunement + optional ghost pair history.
function formatTier1(
  msg: UserCanvasMsg,
  assistantMsg: GhostPairMsg | null,
  seq: number,
  node: Node | undefined,
  edges: Edge[],
  nodeMap: Map<string, Node>,
  seqMap: Map<string, number>,
  rule: TieredSerializationRule,
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
  assistantMsg: GhostPairMsg | null,
  seq: number,
  node: Node | undefined,
  edges: Edge[],
  nodeMap: Map<string, Node>,
  seqMap: Map<string, number>,
  rule: TieredSerializationRule,
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
  assistantMsg: GhostPairMsg | null,
  seq: number,
  node: Node | undefined,
  edges: Edge[],
  nodeMap: Map<string, Node>,
  seqMap: Map<string, number>,
  rule: TieredSerializationRule,
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
  assistantMsg: GhostPairMsg | null
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

// ─── Canvas-map formatters (Observer — bird's-eye, not recency-tiered) ───────

// Renders every node on the canvas, grouped by session, with full edge
// connections. Source of truth is the nodes/edges tables directly — independent
// of any thread's message log — so the Observer's view of the canvas can never
// miss a branch a thread happened not to record.
// contentMode: 'summary' is the Observer's rule; 'full' is the judge's — maturity
// preconditions live in the wording of nodes, which summaries lose (DESIGN §4b).
function canvasMapBlock(
  allNodes: Array<CanvasMapNode & Partial<Pick<Node, 'content'>>>,
  edges: Edge[],
  seqMap: Map<string, number>,
  contentMode: 'summary' | 'full' = 'summary',
): string {
  // Step 1 — Index nodes by ID (for formatEdgeLines' lookups), pre-index edges
  // by endpoint once for the whole canvas, and group nodes by session,
  // preserving each session's insertion order (allNodes is oldest-first).
  const nodeMap = new Map(allNodes.map(n => [n.id, n]))
  const { incoming, outgoing } = indexEdgesByNode(edges)
  const bySession = new Map<string, typeof allNodes>()
  for (const n of allNodes) {
    const list = bySession.get(n.session_id) ?? []
    list.push(n)
    bySession.set(n.session_id, list)
  }

  // Step 2 — One sub-header per session, then every node in that session at the
  // caller's content depth, plus its edges.
  const header = contentMode === 'full'
    ? 'CANVAS MAP (all sessions — full content)'
    : 'CANVAS MAP (all sessions — summary only)'
  const lines: string[] = [COMPRESS_DIVIDER, header]
  for (const [sessionId, nodes] of bySession) {
    lines.push(`─── session ${sessionId.slice(0, 8)} ───`)
    for (const n of nodes) {
      lines.push(`[seq:${seqMap.get(n.id)} | ${n.id} | ${n.direction_marker ?? '?'}]`)
      const text = contentMode === 'full'
        ? (n.content ?? n.summary ?? '(empty node)')
        : (n.summary ?? '(no summary yet)')
      lines.push(`  "${text}"`)
      for (const line of formatEdgeLines(incoming.get(n.id) ?? [], outgoing.get(n.id) ?? [], nodeMap, seqMap)) {
        lines.push(`  ${line}`)
      }
    }
  }
  lines.push(COMPRESS_DIVIDER)
  return lines.join('\n')
}

// Light recency signal on top of the full map above — where the user's
// attention is RIGHT NOW. Deliberately small: the map already carries the
// spatial picture, this just flags the active thread.
function currentFocusBlock(recentNodes: Node[], seqMap: Map<string, number>, triggerNodeId: string | undefined): string {
  // getRecentNodes returns newest-first; flip to oldest-first so this block
  // reads top-to-bottom in the same direction as CANVAS MAP above it.
  const chronological = [...recentNodes].reverse()
  const lines: string[] = [DIVIDER, 'CURRENT FOCUS (most recent activity)']
  for (const n of chronological) {
    // ★TRIGGER marks the node that caused this Observer run — the one new
    // thing since the canvas map was last "current" for this agent.
    const flag = n.id === triggerNodeId ? ' | ★TRIGGER' : ''
    lines.push(`[seq:${seqMap.get(n.id)} | ${n.id} | ${n.direction_marker ?? '?'}${flag}]`)
    lines.push(`  "${n.summary ?? '(no summary yet)'}"`)
  }
  lines.push(DIVIDER)
  return lines.join('\n')
}

// The Observer's own history — read live from observer_structures/observer_edges,
// never from a cached thread message, so an edge's status is always current.
function pastObservationsBlock(structures: ObserverStructure[], edgesByStructure: Map<string, ObserverEdge[]>): string {
  // Today this is always empty — no pipeline writes observer_structures/
  // observer_edges yet (features 8-10). The block renders correctly regardless,
  // so the read side is already in place for when those writes land.
  if (structures.length === 0) {
    return [DIVIDER, 'PAST OBSERVATIONS: none yet', DIVIDER].join('\n')
  }

  const lines: string[] = [DIVIDER, 'PAST OBSERVATIONS (this canvas)']
  for (const s of structures) {
    const structureEdges = edgesByStructure.get(s.id) ?? []
    lines.push(`[structure:${s.id.slice(0, 8)} | anchors: ${s.anchor_node_ids.map(id => id.slice(0, 8)).join(', ')}]`)
    for (const n of s.nodes) {
      // A node is a synthesis of every edge feeding it (see CORE-CONCEPTS.md →
      // The Observer Structure), so its overall outcome mirrors that rule:
      // 'accepted' only once ALL its edges are; any rejected edge marks the
      // whole node 'rejected' (it was torn down/re-thought); otherwise 'pending'.
      const statuses = structureEdges.filter(e => e.to_id === n.ghost_id).map(e => e.status)
      const overall = statuses.length === 0 ? 'no edges'
        : statuses.every(st => st === 'accepted') ? 'accepted'
        : statuses.some(st => st === 'rejected') ? 'rejected'
        : 'pending'
      lines.push(`  (level ${n.level}, ${n.node_type}) "${n.content}" — ${overall}`)
    }
  }
  lines.push(DIVIDER)
  return lines.join('\n')
}

// Builds the Observer's full context: north star → rejection block → canvas map
// → current focus → past observations. No recency tiers — see SERIALIZATION.md
// → Observer Context Model for why the bird's-eye role needs this shape instead.
async function serializeCanvasMap(
  canvas: Canvas,
  agentRole: AgentRole,
  rule: CanvasMapRule,
  triggerNodeId: string | undefined,
): Promise<string> {
  // Step 1 — Fetch everything this context needs in parallel, straight from
  // source tables (never from a thread's message log — see file header note).
  const [allNodes, edges, recentNodes, structures, rejectionBlock] = await Promise.all([
    getAllByCanvas(canvas.id),
    getEdgesByCanvas(canvas.id),
    getRecentNodes(canvas.id, 5),
    getStructuresByCanvas(canvas.id),
    rule.includeRejectionInsights ? buildRejectionBlock(canvas.id, agentRole) : Promise.resolve(''),
  ])

  // Step 2 — One batched round-trip for every structure's edges.
  const edgesByStructure = await getEdgesByStructures(structures.map(s => s.id))

  // Step 3 — seq numbers are this canvas's full node order (1-based), so the
  // CANVAS MAP and CURRENT FOCUS blocks below can cross-reference the same seq.
  const seqMap = new Map<string, number>()
  allNodes.forEach((n, i) => seqMap.set(n.id, i + 1))

  // Step 4 — Assemble in a fixed order: anchor → constraints → spatial map →
  // recency pointer → the Observer's own track record.
  const parts: string[] = [northStarBlock(canvas)]
  if (rejectionBlock) parts.push(rejectionBlock)
  parts.push(canvasMapBlock(allNodes, edges, seqMap))
  parts.push(currentFocusBlock(recentNodes, seqMap, triggerNodeId))
  parts.push(pastObservationsBlock(structures, edgesByStructure))

  return parts.join('\n\n')
}

// ─── Judge context (maturity + routing — not an AgentRole, no thread) ────────

// Builds the judge's full context: north star → the FULL active rejection-insight
// set (both categories — dedup, never re-offer a refusal) → the canvas map with
// COMPLETE node content → current focus. The judge has no thread and no recency
// tiers: its judgment is one call over the whole canvas (DESIGN §4b), and the
// preconditions it checks live in the exact wording of nodes.
export async function serializeJudgeContext(
  canvas: Canvas,
  triggerNodeId?: string,
): Promise<string> {
  logger.info('[serializer:index] judge context start', { canvas_id: canvas.id })

  // Step 1 — Fetch everything in parallel, straight from source tables.
  const [allNodes, edges, recentNodes, rejectionBlock] = await Promise.all([
    getAllByCanvasWithContent(canvas.id),
    getEdgesByCanvas(canvas.id),
    getRecentNodes(canvas.id, 5),
    buildFullRejectionBlock(canvas.id),
  ])

  // Step 2 — seq numbers are this canvas's full node order (1-based), shared by
  // the CANVAS MAP and CURRENT FOCUS blocks below.
  const seqMap = new Map<string, number>()
  allNodes.forEach((n, i) => seqMap.set(n.id, i + 1))

  // Step 3 — Assemble: anchor → refusals → full-content map → recency pointer.
  const parts: string[] = [northStarBlock(canvas)]
  if (rejectionBlock) parts.push(rejectionBlock)
  parts.push(canvasMapBlock(allNodes, edges, seqMap, 'full'))
  parts.push(currentFocusBlock(recentNodes, seqMap, triggerNodeId))

  logger.info('[serializer:index] judge context done', { canvas_id: canvas.id, node_count: allNodes.length })
  return parts.join('\n\n')
}

// ─── Thread-type strategies (stateless / canvas-stateful tiering) ───────────

// Looks up the seq number and Node row for a canvas_event message's node_id —
// shared by serializeStateless and serializeTiered so both derive it the same way.
function resolveMsgContext(
  msg: UserCanvasMsg,
  nodeMap: Map<string, Node>,
  seqMap: Map<string, number>,
): { seq: number; node: Node | undefined } {
  const nodeId = 'node_id' in msg ? msg.node_id : undefined
  const seq = nodeId ? (seqMap.get(nodeId) ?? 0) : 0
  const node = nodeId ? nodeMap.get(nodeId) : undefined
  return { seq, node }
}

// Stateless agents (Outer Sub) only ever see Tier 0 + the single active node —
// no thread history, no tier 2–4. Returns '' if the thread has no canvas_event
// message yet (nothing to show as "active").
function serializeStateless(
  thread: AgentThread,
  rule: TieredSerializationRule,
  nodeMap: Map<string, Node>,
  seqMap: Map<string, number>,
  edges: Edge[],
): string {
  for (let i = thread.messages.length - 1; i >= 0; i--) {
    const msg = thread.messages[i]
    if (msg.role !== 'user' || msg.turn_type !== 'canvas_event') continue

    const { seq, node } = resolveMsgContext(msg as UserCanvasMsg, nodeMap, seqMap)
    const assistantMsg = asGhostPairMsg(thread.messages[i + 1])

    return formatTier1(msg as UserCanvasMsg, assistantMsg, seq, node, edges, nodeMap, seqMap, rule, 0)
  }
  return ''
}

// Canvas-stateful agents: walk the thread once, bucket every canvas_event turn
// into its tier (session_boundary/assistant turns are skipped here — they're
// either rendered elsewhere or only ever read via the next-message lookahead),
// then format each bucket — Tier 4 grouped into blocks of 5. Returns the
// blocks in recency-first order (Tier 1 → Tier 4) for the caller to append.
function serializeTiered(
  thread: AgentThread,
  rule: TieredSerializationRule,
  nodeMap: Map<string, Node>,
  seqMap: Map<string, number>,
  edges: Edge[],
  tierMap: Map<string, Tier>,
): string[] {
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
    const assistantMsg = asGhostPairMsg(thread.messages[i + 1])

    const { seq, node } = resolveMsgContext(msg as UserCanvasMsg, nodeMap, seqMap)

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

  // Group Tier 4 items into compressed blocks of 5 (oldest first).
  const tier4Blocks: string[] = []
  for (let i = 0; i < tier4Items.length; i += 5) {
    tier4Blocks.push(formatTier4Group(tier4Items.slice(i, i + 5)))
  }

  // Recency-first order: Tier 1 (active) → Tier 2 (recent) → Tier 3 (mid) → Tier 4 (compressed oldest)
  return [...tier1Blocks, ...tier2Blocks, ...tier3Blocks, ...tier4Blocks]
}

// ─── Main serialize() ─────────────────────────────────────────────────────────

// Called by all pipeline functions before agent invocation.
// Converts the agent's canvas-scoped thread into structured text for the LLM context window.
// options.triggerNodeId is only used by canvas-map agents (Observer) — see serializeCanvasMap.
export async function serialize(
  thread: AgentThread,
  agentRole: AgentRole,
  canvas: Canvas,
  options?: { triggerNodeId?: string },
): Promise<string> {
  const rule = SERIALIZATION_RULES[agentRole]
  logger.info('[serializer:index] start', { canvas_id: canvas.id, agent_role: agentRole, message_count: thread.messages.length, thread_type: rule.threadType })

  // Canvas-map agents don't read this thread's recency tiers at all — their
  // context is the whole canvas plus their own structure history, both fetched
  // fresh from their source tables.
  if (rule.threadType === 'canvas-map') {
    return serializeCanvasMap(canvas, agentRole, rule, options?.triggerNodeId)
  }

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
    rule.includeRejectionInsights ? buildRejectionBlock(canvas.id, agentRole) : Promise.resolve(''),
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

  // ── Assembly ────────────────────────────────────────────────────────────────

  const parts: string[] = []

  // Step 4 — North Star (Tier 0) — always first, always present.
  parts.push(northStarBlock(canvas))

  // Step 5 — Most recent session boundary marker, if any.
  // Placed directly after the north star so the agent sees the current session context.
  const sessionBoundaries = thread.messages.filter(
    (m): m is Extract<ThreadMessage, { role: 'user'; turn_type: 'canvas_event' | 'session_boundary' }> =>
      m.role === 'user' && m.turn_type === 'session_boundary'
  )
  if (sessionBoundaries.length > 0) {
    parts.push(sessionBoundaries[sessionBoundaries.length - 1].content)
  }

  // Step 6 — NEGATIVE CONSTRAINTS block (Expander, Stress-Tester, Observer only).
  if (rejectionBlock) parts.push(rejectionBlock)

  // Step 7 — Stateless agents (Outer Sub) stop here — see serializeStateless.
  if (rule.threadType === 'stateless') {
    const activeBlock = serializeStateless(thread, rule, nodeMap, seqMap, edges)
    if (activeBlock) parts.push(activeBlock)
    return parts.join('\n\n')
  }

  // Step 8 — Canvas-stateful agents: classify into tiers and format every
  // bucket — see serializeTiered.
  const tierMap = classifyTiers(thread.messages)
  parts.push(...serializeTiered(thread, rule, nodeMap, seqMap, edges, tierMap))

  logger.info('[serializer:index] done', { canvas_id: canvas.id, agent_role: agentRole, parts: parts.length })
  return parts.join('\n\n')
}
