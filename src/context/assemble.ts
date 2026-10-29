// Prompt assembly: turns retrieved context into the text the agent reads.
// Pure function, no database and no model calls, so it is easy to test.
//
// The agent's system prompt (rules, stance) is a separate constant. This builds the
// USER message. Layers, top to bottom:
//   1. canvas intent        title, goal, notes about the canvas as a whole
//   2. negative constraints what the user already rejected (non-negotiable #10)
//   3. thread memory        what agents proposed recently + what the user did
//   4. focus nodes          what the task is about
//   5. other nodes + edges  context around the focus
//   6. task                 what the user asked for (LAST, closest to the answer)
//
// Everything the user wrote (node text, notes, the task) is DATA, never instructions.
// It is wrapped in tags, and any "<" or ">" inside it is escaped, so a note can't
// close a tag and pretend to be part of the prompt.

import type {
  AgentRole,
  ContextNote,
  ContextScope,
  LoadedEdge,
  LoadedNode,
  RetrievalResult,
} from '../../types/index.js'
import { nodeLabel } from './ids.js'
import { estimateTokens } from './tokens.js'

// Used when the user's text adds nothing beyond "run this agent here".
// Constants, never built from user input.
const DEFAULT_TASK: Record<AgentRole, string> = {
  expander: 'Extend the focus node: open one or two new directions the user is already heading in.',
  stress_tester: 'Find weak points in the focus node: hidden assumptions, contradictions, missing evidence.',
  general: 'Help with the focus node, using the context below.',
  observer: 'Observe the canvas and point out connections the user has not drawn yet.',
}

// How much of a node's summary/text we show when it is only a title.
const MAX_TITLE_CHARS = 120

export type AssembleParams = {
  agent: AgentRole
  canvas: { title: string; original_intent: string }
  retrieval: RetrievalResult
  // Ready-made NEGATIVE CONSTRAINTS block ('' when there are none).
  constraintsBlock: string
  // Lines from buildThreadMemory().
  threadMemory: string[]
  task: {
    // Text of the row that invoked the agent. null/empty = use the default task.
    text: string | null
    sourceType: 'context_entry' | 'node'
    // Set when sourceType is 'node': the node whose own text is the request.
    sourceNodeId?: string
  }
}

export type AssembledPrompt = {
  prompt: string
  // Every node the agent can reference. Feed to createIdMap().
  shownNodes: { id: string; seq: number }[]
  // For agent_runs.loaded_nodes
  loadedNodes: { id: string; seq: number; tier: string; reason: string }[]
  // Estimated tokens per layer, for logging and budget checks.
  tokens: Record<'intent' | 'constraints' | 'memory' | 'focus' | 'nodes' | 'edges' | 'task' | 'total', number>
}

// Escape user text so it can't open or close a tag.
export function escapeData(text: string): string {
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function shorten(text: string, maxChars: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > maxChars ? `${flat.slice(0, maxChars)}...` : flat
}

function renderNotes(notes: ContextNote[]): string[] {
  return notes.map(note => `<note>${escapeData(note.content)}</note>`)
}

// One node as a "unit": its text + all its notes (full), or a short title + note count (title).
function renderNode(node: LoadedNode): string {
  const label = nodeLabel(node.seq)

  // title tier: short line, and tell the agent notes exist so it knows there is more
  if (node.tier === 'title') {
    const title = shorten(node.summary ?? node.content ?? '', MAX_TITLE_CHARS) || '(empty)'
    const notesHint = node.note_count > 0 ? ` notes="${node.note_count}"` : ''
    return `<node id="${label}" reason="${node.reason}" tier="title"${notesHint}>${escapeData(title)}</node>`
  }

  // full tier: the whole text, then every note, oldest first
  const text = (node.content ?? node.summary ?? '').trim() || '(empty)'
  const lines = [`<node id="${label}" reason="${node.reason}" tier="full">`, escapeData(text), ...renderNotes(node.notes), '</node>']
  return lines.join('\n')
}

// One edge as "n2 -> n5", plus its label and notes.
function renderEdge(edge: LoadedEdge, labelById: Map<string, string>): string {
  const from = labelById.get(edge.from_node_id) ?? '?'
  const to = labelById.get(edge.to_node_id) ?? '?'
  const labelPart = edge.label ? `"${escapeData(edge.label)}"` : ''
  const head = `${from} -${labelPart}-> ${to}`
  if (edge.notes.length === 0) return head
  return [`<edge>`, head, ...renderNotes(edge.notes), `</edge>`].join('\n')
}

// Build the task layer. If the request IS a node's text, point at it instead of
// repeating it (that text is already in the node unit above).
function renderTask(params: AssembleParams, scope: ContextScope, labelById: Map<string, string>): string {
  const { agent, task } = params
  const hasText = !!task.text?.trim()

  let body: string
  if (!hasText) {
    body = DEFAULT_TASK[agent]
  } else if (task.sourceType === 'node') {
    const nodeRef = task.sourceNodeId ? labelById.get(task.sourceNodeId) : undefined
    body = nodeRef ? `The request is the text of node ${nodeRef}.` : escapeData(task.text!.trim())
  } else {
    body = escapeData(task.text!.trim())
  }

  return `<task agent="${agent}" scope="${scope}">\n${body}\n</task>`
}

export function assemblePrompt(params: AssembleParams): AssembledPrompt {
  const { canvas, retrieval, constraintsBlock, threadMemory } = params

  // ── ids: uuid -> "n5", used by edges and the task ──
  const labelById = new Map(retrieval.nodes.map(n => [n.id, nodeLabel(n.seq)]))

  // ── 1. canvas intent ──
  const intentLines = [
    '<canvas_intent>',
    `title: ${escapeData(canvas.title)}`,
    `goal: ${escapeData(canvas.original_intent)}`,
    ...(retrieval.canvas_notes.length > 0 ? ['notes about the whole canvas:', ...renderNotes(retrieval.canvas_notes)] : []),
    '</canvas_intent>',
  ]

  // ── 2. negative constraints (already formatted by the rejection block builder) ──
  const constraintLines = constraintsBlock ? [`<negative_constraints>`, escapeData(constraintsBlock), `</negative_constraints>`] : []

  // ── 3. thread memory ──
  const memoryLines = threadMemory.length > 0
    ? ['<thread_memory>', ...threadMemory.map(line => `- ${escapeData(line)}`), '</thread_memory>']
    : []

  // ── 4. focus nodes ──
  const focusNodes = retrieval.nodes.filter(n => n.reason === 'focus')
  const focusLines = ['<focus>', ...focusNodes.map(renderNode), '</focus>']

  // ── 5. everything else: neighbours + ancestors, then the edges between loaded nodes ──
  const otherNodes = retrieval.nodes.filter(n => n.reason !== 'focus')
  const nodeLines = otherNodes.length > 0 ? ['<nodes>', ...otherNodes.map(renderNode), '</nodes>'] : []
  const edgeLines = retrieval.edges.length > 0
    ? ['<edges>', ...retrieval.edges.map(e => renderEdge(e, labelById)), '</edges>']
    : []

  // ── 6. task, last ──
  const taskBlock = renderTask(params, retrieval.scope, labelById)

  // ── join the layers, skipping empty ones ──
  const layers = {
    intent: intentLines.join('\n'),
    constraints: constraintLines.join('\n'),
    memory: memoryLines.join('\n'),
    focus: focusLines.join('\n'),
    nodes: nodeLines.join('\n'),
    edges: edgeLines.join('\n'),
    task: taskBlock,
  }
  const prompt = Object.values(layers).filter(Boolean).join('\n\n')

  // ── per-layer token estimate, for the run log ──
  const tokens = {
    intent: estimateTokens(layers.intent),
    constraints: estimateTokens(layers.constraints),
    memory: estimateTokens(layers.memory),
    focus: estimateTokens(layers.focus),
    nodes: estimateTokens(layers.nodes),
    edges: estimateTokens(layers.edges),
    task: estimateTokens(layers.task),
    total: estimateTokens(prompt),
  }

  return {
    prompt,
    shownNodes: retrieval.nodes.map(n => ({ id: n.id, seq: n.seq })),
    loadedNodes: retrieval.nodes.map(n => ({ id: n.id, seq: n.seq, tier: n.tier, reason: n.reason })),
    tokens,
  }
}
