import { z } from 'zod'
import type { HierarchyChildKind, HierarchyPayload, SequencePayload } from '../../types/index.js'

// ─────────────────────────────────────────────
// Backstop for the content agents' output (canvas-templates spec → Validation).
// The raw schemas are deliberately lenient on everything the backstop repairs
// (word counts, ids, kind, step order, array length) so a model that drifts is
// normalised rather than rejected; only missing required fields fail the parse.
// ─────────────────────────────────────────────

export const MAX_LABEL_WORDS = 8
export const MAX_DETAIL_WORDS = 30
export const MAX_LINK_WORDS = 5
export const MAX_HIERARCHY_CHILDREN = 4
export const MIN_HIERARCHY_CHILDREN = 2
export const MAX_SEQUENCE_STEPS = 6
export const MIN_SEQUENCE_STEPS = 3

const CHILD_KINDS: readonly HierarchyChildKind[] = ['idea', 'example', 'question']

export const rawHierarchySchema = z.object({
  root: z.object({
    id: z.string().nullish(),
    label: z.string(),
    detail: z.string(),
    children: z.array(
      z.object({
        id: z.string().nullish(),
        label: z.string(),
        kind: z.string(),
        link: z.string(),
        detail: z.string(),
      })
    ),
  }),
})

export const rawSequenceSchema = z.object({
  title: z.string(),
  detail: z.string(),
  steps: z.array(
    z.object({
      id: z.string().nullish(),
      order: z.number().nullish(),
      label: z.string(),
      detail: z.string(),
      transition: z.string().nullish(),
    })
  ),
})

export type RawHierarchy = z.infer<typeof rawHierarchySchema>
export type RawSequence = z.infer<typeof rawSequenceSchema>

// Keeps the first maxWords words; appends "…" (no space) when anything was cut.
export function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return words.join(' ')
  return `${words.slice(0, maxWords).join(' ')}…`
}

function normalizeKind(kind: string): HierarchyChildKind {
  const k = kind.trim().toLowerCase()
  return CHILD_KINDS.find((c) => c === k) ?? 'idea'
}

// Returns a payload-wide-unique id generator: keeps the model's id when it is
// present and unused, otherwise mints a UUID.
function createIdAllocator(): (candidate: string | null | undefined) => string {
  const seen = new Set<string>()
  return (candidate) => {
    const id = candidate?.trim()
    const next = id && !seen.has(id) ? id : crypto.randomUUID()
    seen.add(next)
    return next
  }
}

// Throws when the root label is empty — a hierarchy with no claim is unusable.
// Children with an empty label are dropped as missing required fields.
export function normalizeHierarchy(raw: RawHierarchy): HierarchyPayload {
  const rootLabel = truncateWords(raw.root.label, MAX_LABEL_WORDS)
  if (!rootLabel) throw new Error('hierarchy root.label is empty')

  const allocId = createIdAllocator()
  const rootId = allocId(raw.root.id)

  const children = raw.root.children
    .filter((c) => c.label.trim().length > 0)
    .slice(0, MAX_HIERARCHY_CHILDREN)
    .map((c) => ({
      id: allocId(c.id),
      label: truncateWords(c.label, MAX_LABEL_WORDS),
      kind: normalizeKind(c.kind),
      link: truncateWords(c.link, MAX_LINK_WORDS),
      detail: truncateWords(c.detail, MAX_DETAIL_WORDS),
    }))

  return {
    shape: 'hierarchy',
    root: {
      id: rootId,
      label: rootLabel,
      detail: truncateWords(raw.root.detail, MAX_DETAIL_WORDS),
      children,
    },
  }
}

// Throws when the title is empty. Steps with an empty label are dropped; the
// rest are ordered by the model's `order` (array position breaks ties and
// stands in for a missing order), capped, then renumbered 1..n. The last step
// never carries a transition — including after a cap moves the "last" step.
export function normalizeSequence(raw: RawSequence): SequencePayload {
  const title = truncateWords(raw.title, MAX_LABEL_WORDS)
  if (!title) throw new Error('sequence title is empty')

  const allocId = createIdAllocator()

  const ordered = raw.steps
    .map((s, index) => ({ s, index }))
    .filter(({ s }) => s.label.trim().length > 0)
    .sort((a, b) => (a.s.order ?? a.index + 1) - (b.s.order ?? b.index + 1) || a.index - b.index)
    .slice(0, MAX_SEQUENCE_STEPS)

  const steps = ordered.map(({ s }, i) => {
    const transition = s.transition ? truncateWords(s.transition, MAX_LINK_WORDS) : ''
    const isLast = i === ordered.length - 1
    return {
      id: allocId(s.id),
      order: i + 1,
      label: truncateWords(s.label, MAX_LABEL_WORDS),
      detail: truncateWords(s.detail, MAX_DETAIL_WORDS),
      ...(!isLast && transition ? { transition } : {}),
    }
  })

  return {
    shape: 'sequence',
    title,
    detail: truncateWords(raw.detail, MAX_DETAIL_WORDS),
    steps,
  }
}
