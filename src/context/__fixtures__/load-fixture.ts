// Turns a human-written fixture (scripts/fixtures/*.json) into the same shapes the real
// retrieval + assembly code uses. Dev tool only: no database, no model.
//
// Why human names: in a fixture you write "n2", not a UUID. Here the node id IS its
// label ("n2") and its seq is the number in it, so what you type is what you see in the prompt.

import { z } from 'zod'
import type { Edge, Node } from '../../../types/index.js'
import type { AssembleParams } from '../assemble.js'
import type { S1Source } from '../retrieve-s1.js'
import { makeEdge, makeInMemorySource, makeNode, makeNote, type FixtureNote } from './in-memory-source.js'

// ─────────────────────────────────────────────
// The file format
// ─────────────────────────────────────────────

const nodeId = z.string().regex(/^n\d+$/, 'node id must look like n12')

const fixtureSchema = z.object({
  canvas: z.object({ title: z.string(), goal: z.string() }).default({ title: 'Fixture canvas', goal: 'Test the prompt' }),
  agent: z.enum(['expander', 'stress_tester', 'general', 'observer']).default('expander'),
  focus: z.array(nodeId).min(1, 'focus needs at least one node'),
  task: z.object({
    // null/empty = the agent's default task
    text: z.string().nullable().default(null),
    sourceType: z.enum(['context_entry', 'node']).default('context_entry'),
    // for sourceType "node": which node's text is the request
    sourceNode: nodeId.optional(),
  }).default({ text: null, sourceType: 'context_entry' }),
  nodes: z.array(z.object({
    id: nodeId,
    text: z.string(),
    summary: z.string().nullable().optional(),
    setAside: z.boolean().optional(),
  })),
  edges: z.array(z.object({ from: nodeId, to: nodeId, label: z.string().nullable().optional() })).default([]),
  notes: z.array(z.object({
    // a node ("n2"), an edge ("edge:n4>n2") or the whole canvas ("canvas")
    on: z.string(),
    text: z.string(),
    // true = this note is the one that invoked the agent (it is then left out of its node)
    invoking: z.boolean().optional(),
    deleted: z.boolean().optional(),
  })).default([]),
  threadMemory: z.array(z.string()).default([]),
  constraints: z.string().default(''),
})

export type FixtureFile = z.infer<typeof fixtureSchema>

export type LoadedFixture = {
  source: S1Source
  focusNodeIds: string[]
  excludeEntryId?: string
  // everything assemblePrompt needs, except the retrieval (that is built by retrieveS1)
  assembleBase: Omit<AssembleParams, 'retrieval'>
}

// ─────────────────────────────────────────────
// Loader
// ─────────────────────────────────────────────

// Parse + validate the raw JSON. Throws one readable error listing every problem.
export function parseFixture(raw: unknown): FixtureFile {
  const parsed = fixtureSchema.safeParse(raw)
  if (!parsed.success) {
    const lines = parsed.error.issues.map(issue => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    throw new Error(`invalid fixture:\n${lines.join('\n')}`)
  }
  return parsed.data
}

export function loadFixture(raw: unknown): LoadedFixture {
  const fixture = parseFixture(raw)

  // ── 1. check that every reference points at a real node ──
  const nodeIds = new Set(fixture.nodes.map(n => n.id))
  const errors: string[] = []
  for (const id of fixture.focus) if (!nodeIds.has(id)) errors.push(`focus "${id}" is not in nodes`)
  for (const edge of fixture.edges) {
    if (!nodeIds.has(edge.from)) errors.push(`edge from "${edge.from}" is not in nodes`)
    if (!nodeIds.has(edge.to)) errors.push(`edge to "${edge.to}" is not in nodes`)
  }
  if (fixture.task.sourceType === 'node') {
    if (!fixture.task.sourceNode) errors.push('task.sourceType is "node" but task.sourceNode is missing')
    else if (!nodeIds.has(fixture.task.sourceNode)) errors.push(`task.sourceNode "${fixture.task.sourceNode}" is not in nodes`)
  }

  // ── 2. nodes: id is the label, seq is the number inside it, creation order = list order ──
  const nodes: Node[] = fixture.nodes.map((n, index) =>
    makeNode(n.id, Number(n.id.slice(1)), {
      content: n.text,
      summary: n.summary ?? null,
      set_aside_at: n.setAside ? '2026-01-02T00:00:00Z' : null,
      created_at: new Date(2026, 0, 1, 0, 0, index + 1).toISOString(),
    }),
  )

  // ── 3. edges: id is "from>to" ──
  const edges: Edge[] = fixture.edges.map(e => makeEdge(`${e.from}>${e.to}`, e.from, e.to, e.label ?? null))

  // ── 4. notes: work out what each one is attached to ──
  const edgeIds = new Set(edges.map(e => e.id))
  let invokingNoteId: string | undefined
  const notes: FixtureNote[] = fixture.notes.map((n, index) => {
    const id = `note-${index + 1}`
    // later notes are newer, so "oldest first" order follows the file order
    const note = makeNote(id, n.text, new Date(2026, 0, 1, 1, 0, index + 1).toISOString())
    if (n.invoking) invokingNoteId = id

    if (n.on === 'canvas') return { note, target: { type: 'canvas' as const }, deleted: n.deleted }

    if (n.on.startsWith('edge:')) {
      const edgeId = n.on.slice('edge:'.length)
      if (!edgeIds.has(edgeId)) errors.push(`note "${n.text.slice(0, 30)}..." is on edge "${edgeId}", which does not exist (format: edge:n4>n2)`)
      return { note, target: { type: 'edge' as const, id: edgeId }, deleted: n.deleted }
    }

    if (!nodeIds.has(n.on)) errors.push(`note "${n.text.slice(0, 30)}..." is on "${n.on}", which is not a node, "edge:a>b" or "canvas"`)
    return { note, target: { type: 'node' as const, id: n.on }, deleted: n.deleted }
  })

  if (errors.length > 0) throw new Error(`invalid fixture:\n${errors.map(e => `  - ${e}`).join('\n')}`)

  // ── 5. hand back the same inputs the real code takes ──
  return {
    source: makeInMemorySource(nodes, edges, notes),
    focusNodeIds: fixture.focus,
    excludeEntryId: invokingNoteId,
    assembleBase: {
      agent: fixture.agent,
      canvas: { title: fixture.canvas.title, original_intent: fixture.canvas.goal },
      constraintsBlock: fixture.constraints,
      threadMemory: fixture.threadMemory,
      task: {
        text: fixture.task.text,
        sourceType: fixture.task.sourceType,
        sourceNodeId: fixture.task.sourceNode,
      },
    },
  }
}
