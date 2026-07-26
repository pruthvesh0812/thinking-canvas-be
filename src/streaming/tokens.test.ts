import { describe, it, expect } from 'vitest'
import { createMarkerRouter } from './tokens.js'

type Emit = ReturnType<ReturnType<typeof createMarkerRouter>['push']>[number]

// Drives the router over a token list (each string = one streamed token) and
// returns the full ordered emit list, flush included.
function run(
  tokens: string[],
  ghosts: { contextGhostId: string; questionGhostId: string | null }
): Emit[] {
  const router = createMarkerRouter(ghosts)
  const emits: Emit[] = []
  for (const t of tokens) emits.push(...router.push(t))
  emits.push(...router.flush())
  return emits
}

const CTX = 'ctx-ghost'
const Q = 'q-ghost'

// Reassemble the text delivered to a given ghost id from chunk emits.
function textFor(emits: Emit[], target: string): string {
  return emits
    .filter((e) => e.type === 'chunk' && e.target === target)
    .map((e) => (e as { data: string }).data)
    .join('')
}

describe('createMarkerRouter — NODE_TYPE marker', () => {
  it('strips [NODE_TYPE: x] and emits one node_type message on the context ghost', () => {
    const emits = run(['[NODE_TYPE: reframe]body'], { contextGhostId: CTX, questionGhostId: Q })
    const nodeTypes = emits.filter((e) => e.type === 'node_type')
    expect(nodeTypes).toEqual([{ type: 'node_type', target: CTX, node_type: 'reframe' }])
    expect(textFor(emits, CTX)).toBe('body')
  })

  it('handles a marker split across two tokens with zero leakage into chunks', () => {
    const emits = run(['[NODE_T', 'YPE: reframe]body'], { contextGhostId: CTX, questionGhostId: Q })
    expect(emits.filter((e) => e.type === 'node_type')).toHaveLength(1)
    expect(textFor(emits, CTX)).toBe('body')
    // The literal marker text must never reach a ghost chunk.
    expect(textFor(emits, CTX)).not.toContain('[NODE_T')
    expect(textFor(emits, CTX)).not.toContain('NODE_TYPE')
  })

  it('drops an unknown NODE_TYPE value rather than restyling', () => {
    const emits = run(['[NODE_TYPE: bogus]body'], { contextGhostId: CTX, questionGhostId: Q })
    expect(emits.filter((e) => e.type === 'node_type')).toHaveLength(0)
    // Unknown marker is still stripped (not streamed as text).
    expect(textFor(emits, CTX)).toBe('body')
  })
})

describe('createMarkerRouter — QUESTION split', () => {
  it('routes pre-[QUESTION] text to context and post-[QUESTION] text to the question ghost', () => {
    const emits = run(
      ['[NODE_TYPE: reframe]', 'Context here. ', '[QUESTION]', 'What if?'],
      { contextGhostId: CTX, questionGhostId: Q }
    )
    expect(textFor(emits, CTX)).toBe('Context here. ')
    expect(textFor(emits, Q)).toBe('What if?')
  })

  it('handles [QUESTION] straddling a chunk boundary', () => {
    const emits = run(['ctx[QUES', 'TION]q'], { contextGhostId: CTX, questionGhostId: Q })
    expect(textFor(emits, CTX)).toBe('ctx')
    expect(textFor(emits, Q)).toBe('q')
    expect(textFor(emits, CTX)).not.toContain('[QUES')
  })

  it('produces no question-ghost chunks for an appreciation response (no [QUESTION])', () => {
    const emits = run(['[NODE_TYPE: appreciation]Nice work.'], { contextGhostId: CTX, questionGhostId: Q })
    expect(textFor(emits, Q)).toBe('')
    expect(textFor(emits, CTX)).toBe('Nice work.')
  })
})

describe('createMarkerRouter — Articulator path', () => {
  it('strips NODE_TYPE, keeps [ARTICULATION n] in-band, and never routes to a question ghost', () => {
    const emits = run(
      ['[NODE_TYPE: reframe]\n[ARTICULATION 1] a [ARTICULATION 2] b'],
      { contextGhostId: CTX, questionGhostId: null }
    )
    expect(emits.filter((e) => e.type === 'node_type')).toEqual([
      { type: 'node_type', target: CTX, node_type: 'reframe' },
    ])
    // [ARTICULATION n] is sub-structure of the single context node — left in-band.
    expect(textFor(emits, CTX)).toBe('\n[ARTICULATION 1] a [ARTICULATION 2] b')
    // No question ghost exists — nothing should target one.
    expect(emits.some((e) => e.type === 'chunk' && (e as { target: string }).target !== CTX)).toBe(false)
  })
})

describe('createMarkerRouter — raw fidelity', () => {
  it('preserves a bracket that is not a control marker', () => {
    const emits = run(['a [x] b'], { contextGhostId: CTX, questionGhostId: null })
    expect(textFor(emits, CTX)).toBe('a [x] b')
  })

  it('token-by-token streaming reassembles to the same text as whole-string streaming', () => {
    const full = '[NODE_TYPE: pattern]The idea. [QUESTION]And then?'
    const perChar = run(full.split(''), { contextGhostId: CTX, questionGhostId: Q })
    expect(textFor(perChar, CTX)).toBe('The idea. ')
    expect(textFor(perChar, Q)).toBe('And then?')
    expect(perChar.filter((e) => e.type === 'node_type')).toEqual([
      { type: 'node_type', target: CTX, node_type: 'pattern' },
    ])
  })
})
