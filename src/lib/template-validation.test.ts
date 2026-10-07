import { describe, it, expect } from 'vitest'
import {
  normalizeHierarchy,
  normalizeSequence,
  truncateWords,
  type RawHierarchy,
  type RawSequence,
} from './template-validation.js'

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i + 1}`).join(' ')

function child(over: Partial<RawHierarchy['root']['children'][number]> = {}) {
  return { id: null, label: 'a label', kind: 'idea', link: 'because', detail: 'a detail', ...over }
}

function hierarchy(children: RawHierarchy['root']['children'], root = {}): RawHierarchy {
  return { root: { id: 'root', label: 'core claim', detail: 'detail', children, ...root } }
}

function step(over: Partial<RawSequence['steps'][number]> = {}) {
  return { id: null, order: null, label: 'a step', detail: 'a detail', transition: 'then', ...over }
}

describe('truncateWords', () => {
  it('leaves text within the cap untouched', () => {
    expect(truncateWords(words(8), 8)).toBe(words(8))
  })
  it('keeps the first N words and appends an ellipsis', () => {
    expect(truncateWords(words(10), 8)).toBe(`${words(8)}…`)
  })
  it('collapses extra whitespace', () => {
    expect(truncateWords('  a   b \n c ', 8)).toBe('a b c')
  })
})

describe('normalizeHierarchy', () => {
  it('truncates label, detail and link to their caps', () => {
    const out = normalizeHierarchy(
      hierarchy([child({ label: words(12), detail: words(40), link: words(9) }), child()], {
        label: words(9),
        detail: words(31),
      })
    )
    expect(out.root.label).toBe(`${words(8)}…`)
    expect(out.root.detail).toBe(`${words(30)}…`)
    expect(out.root.children[0].label).toBe(`${words(8)}…`)
    expect(out.root.children[0].detail).toBe(`${words(30)}…`)
    expect(out.root.children[0].link).toBe(`${words(5)}…`)
  })

  it('keeps the first 4 children when given more', () => {
    const kids = Array.from({ length: 6 }, (_, i) => child({ label: `child ${i}` }))
    const out = normalizeHierarchy(hierarchy(kids))
    expect(out.root.children.map((c) => c.label)).toEqual(['child 0', 'child 1', 'child 2', 'child 3'])
  })

  it('returns what it has when under 2 children (retry is the caller\'s job)', () => {
    expect(normalizeHierarchy(hierarchy([child()])).root.children).toHaveLength(1)
  })

  it('defaults an unrecognised kind to idea and normalises casing', () => {
    const out = normalizeHierarchy(
      hierarchy([child({ kind: 'Question' }), child({ kind: 'metaphor' }), child({ kind: 'example' })])
    )
    expect(out.root.children.map((c) => c.kind)).toEqual(['question', 'idea', 'example'])
  })

  it('replaces missing and duplicate ids, root included, with unique ones', () => {
    const out = normalizeHierarchy(
      hierarchy([child({ id: 'dup' }), child({ id: 'dup' }), child({ id: 'root' }), child({ id: '  ' })])
    )
    const ids = [out.root.id, ...out.root.children.map((c) => c.id)]
    expect(new Set(ids).size).toBe(5)
    expect(out.root.id).toBe('root')
    expect(out.root.children[0].id).toBe('dup')
  })

  it('drops children with an empty label', () => {
    const out = normalizeHierarchy(hierarchy([child({ label: '  ' }), child(), child()]))
    expect(out.root.children).toHaveLength(2)
  })

  it('throws when the root label is empty', () => {
    expect(() => normalizeHierarchy(hierarchy([child(), child()], { label: ' ' }))).toThrow()
  })
})

describe('normalizeSequence', () => {
  const raw = (steps: RawSequence['steps']): RawSequence => ({ title: 'a flow', detail: 'ctx', steps })

  it('truncates fields and caps transition at 5 words', () => {
    const out = normalizeSequence({
      title: words(10),
      detail: words(35),
      steps: [step({ label: words(9), detail: words(31), transition: words(8) }), step(), step()],
    })
    expect(out.title).toBe(`${words(8)}…`)
    expect(out.detail).toBe(`${words(30)}…`)
    expect(out.steps[0].label).toBe(`${words(8)}…`)
    expect(out.steps[0].detail).toBe(`${words(30)}…`)
    expect(out.steps[0].transition).toBe(`${words(5)}…`)
  })

  it('keeps the first 6 steps and omits transition on the new last step', () => {
    const steps = Array.from({ length: 8 }, (_, i) => step({ label: `step ${i + 1}` }))
    const out = normalizeSequence(raw(steps))
    expect(out.steps.map((s) => s.label)).toEqual(
      ['step 1', 'step 2', 'step 3', 'step 4', 'step 5', 'step 6']
    )
    expect(out.steps[5]).not.toHaveProperty('transition')
    expect(out.steps[4].transition).toBe('then')
  })

  it('sorts by the model\'s order and renumbers 1..n', () => {
    const out = normalizeSequence(
      raw([step({ label: 'c', order: 7 }), step({ label: 'a', order: 2 }), step({ label: 'b', order: 5 })])
    )
    expect(out.steps.map((s) => [s.order, s.label])).toEqual([[1, 'a'], [2, 'b'], [3, 'c']])
  })

  it('falls back to array position when order is missing', () => {
    const out = normalizeSequence(raw([step({ label: 'a' }), step({ label: 'b' }), step({ label: 'c' })]))
    expect(out.steps.map((s) => s.label)).toEqual(['a', 'b', 'c'])
  })

  it('returns what it has when under 3 steps', () => {
    expect(normalizeSequence(raw([step(), step()])).steps).toHaveLength(2)
  })

  it('replaces missing and duplicate ids with unique ones', () => {
    const out = normalizeSequence(raw([step({ id: 'x' }), step({ id: 'x' }), step({ id: null })]))
    expect(new Set(out.steps.map((s) => s.id)).size).toBe(3)
  })

  it('throws when the title is empty', () => {
    expect(() => normalizeSequence({ title: '', detail: 'd', steps: [step(), step(), step()] })).toThrow()
  })
})
