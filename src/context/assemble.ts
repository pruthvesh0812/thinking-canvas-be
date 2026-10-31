// Prompt assembly: turns retrieved context into the text the agent reads.
// Pure function, no database and no model calls, so it is easy to test.
//
// The agent's system prompt (rules, stance) is a separate constant. This builds the
// USER message. The layers and their order live in LAYER_ORDER below (reorder = edit one
// line; new layer = one renderer + one entry). Default order, top to bottom:
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
  // A layer that is empty or left out of the order counts 0.
  tokens: Record<LayerName | 'total', number>
}

export type AssembleOptions = {
  // Override the layer order for ONE call (dev experiments, see scripts/prompt-preview.ts).
  // Layers left out of the list are not rendered. Production never passes this.
  layerOrder?: readonly LayerName[]
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

// ─────────────────────────────────────────────
// Layers: the order is DATA. Change it here.
// ─────────────────────────────────────────────

// Top to bottom. The task stays last: it is closest to the answer, so the model weighs it most.
// To reorder: move a name. To add a layer: add a renderer in LAYER_RENDERERS + a name here.
export const LAYER_ORDER = ['intent', 'constraints', 'memory', 'focus', 'nodes', 'edges', 'task'] as const

export type LayerName = (typeof LAYER_ORDER)[number]

// Everything a layer renderer may need. Built once per call.
type LayerContext = {
  params: AssembleParams
  labelById: Map<string, string> // uuid -> "n5"
}

// One renderer per layer. Return '' when the layer has nothing to say (it is then skipped).
const LAYER_RENDERERS: Record<LayerName, (ctx: LayerContext) => string> = {
  // canvas intent: title, goal, notes about the canvas as a whole
  intent({ params }) {
    const { canvas, retrieval } = params
    return [
      '<canvas_intent>',
      `title: ${escapeData(canvas.title)}`,
      `goal: ${escapeData(canvas.original_intent)}`,
      ...(retrieval.canvas_notes.length > 0 ? ['notes about the whole canvas:', ...renderNotes(retrieval.canvas_notes)] : []),
      '</canvas_intent>',
    ].join('\n')
  },

  // negative constraints (already formatted by the rejection block builder)
  constraints({ params }) {
    if (!params.constraintsBlock) return ''
    return ['<negative_constraints>', escapeData(params.constraintsBlock), '</negative_constraints>'].join('\n')
  },

  // thread memory: what agents proposed recently and what the user did with it
  memory({ params }) {
    if (params.threadMemory.length === 0) return ''
    return ['<thread_memory>', ...params.threadMemory.map(line => `- ${escapeData(line)}`), '</thread_memory>'].join('\n')
  },

  // focus nodes: what the task is about
  focus({ params }) {
    const focusNodes = params.retrieval.nodes.filter(n => n.reason === 'focus')
    return ['<focus>', ...focusNodes.map(renderNode), '</focus>'].join('\n')
  },

  // everything else: neighbours + ancestors
  nodes({ params }) {
    const otherNodes = params.retrieval.nodes.filter(n => n.reason !== 'focus')
    if (otherNodes.length === 0) return ''
    return ['<nodes>', ...otherNodes.map(renderNode), '</nodes>'].join('\n')
  },

  // edges between loaded nodes, with labels and notes
  edges({ params, labelById }) {
    if (params.retrieval.edges.length === 0) return ''
    return ['<edges>', ...params.retrieval.edges.map(e => renderEdge(e, labelById)), '</edges>'].join('\n')
  },

  // the request itself
  task({ params, labelById }) {
    return renderTask(params, params.retrieval.scope, labelById)
  },
}

// Turn "intent,focus,task" into a checked layer list. Used by the preview tool's --layers flag.
// Throws a clear error for a name that is not a layer, so a typo is never silently ignored.
export function parseLayerOrder(input: string): LayerName[] {
  const names = input.split(',').map(name => name.trim()).filter(Boolean)
  if (names.length === 0) {
    throw new Error(`layer list is empty. Valid layers: ${LAYER_ORDER.join(', ')}`)
  }

  const unknown = names.filter(name => !(LAYER_ORDER as readonly string[]).includes(name))
  if (unknown.length > 0) {
    throw new Error(`unknown layer(s): ${unknown.join(', ')}. Valid layers: ${LAYER_ORDER.join(', ')}`)
  }
  return names as LayerName[]
}

export function assemblePrompt(params: AssembleParams, options: AssembleOptions = {}): AssembledPrompt {
  const { retrieval } = params
  const layerOrder = options.layerOrder ?? LAYER_ORDER

  // ── ids: uuid -> "n5", used by edges and the task ──
  const ctx: LayerContext = {
    params,
    labelById: new Map(retrieval.nodes.map(n => [n.id, nodeLabel(n.seq)])),
  }

  // ── render each layer in order; remember its text so we can count tokens ──
  const renderedByLayer = new Map<LayerName, string>()
  for (const layer of layerOrder) {
    renderedByLayer.set(layer, LAYER_RENDERERS[layer](ctx))
  }

  // ── join the layers, skipping empty ones ──
  const prompt = [...renderedByLayer.values()].filter(Boolean).join('\n\n')

  // ── per-layer token estimate for the run log (layers not rendered count 0) ──
  const tokens = { total: estimateTokens(prompt) } as AssembledPrompt['tokens']
  for (const layer of LAYER_ORDER) {
    tokens[layer] = estimateTokens(renderedByLayer.get(layer) ?? '')
  }

  return {
    prompt,
    shownNodes: retrieval.nodes.map(n => ({ id: n.id, seq: n.seq })),
    loadedNodes: retrieval.nodes.map(n => ({ id: n.id, seq: n.seq, tier: n.tier, reason: n.reason })),
    tokens,
  }
}
