import { describe, expect, it } from 'vitest'
import type { GhostNodeStatus, GhostStructure } from '../../types/index.js'
import { applyDecision, initialNodeStatus, turnStatusOf } from './ghost-decisions.js'

// A structure hanging off the real node "anchor":
//
//   anchor ──▶ A (depth 1) ──▶ A1 (depth 2) ──▶ A2 (depth 3)
//   anchor ──▶ B (depth 1) ──▶ C (depth 2) ◀── A1        (C converges: parents A1 and B)
//
const node = (ghost_id: string, depth: number) => ({ ghost_id, content: ghost_id, frame_id: null, depth })
const edge = (from: string, to: string) => ({ from, to, label: null })
const structure: GhostStructure = {
  frames: [],
  nodes: [node('A', 1), node('A1', 2), node('A2', 3), node('B', 1), node('C', 2)],
  edges: [edge('anchor', 'A'), edge('A', 'A1'), edge('A1', 'A2'), edge('anchor', 'B'), edge('B', 'C'), edge('A1', 'C')],
}

const decide = (status: 'accepted' | 'rejected', ghostId: string, saved?: Record<string, GhostNodeStatus>, subtreeAction?: 'delete' | 'save_off') =>
  applyDecision(structure, saved, { ghostId, status, subtreeAction })

describe('accept', () => {
  it('accepts one node and leaves the rest pending', () => {
    const result = decide('accepted', 'A')
    expect(result.ok && result.nodeStatus).toMatchObject({ A: 'accepted', A1: 'pending', B: 'pending' })
  })

  it('hidden children of an accepted node stay pending', () => {
    const result = decide('accepted', 'A')
    expect(result.ok && result.nodeStatus.A1).toBe('pending')
    expect(result.ok && result.nodeStatus.A2).toBe('pending')
  })
})

describe('reject', () => {
  it('a leaf has no subtree: no question needed', () => {
    const result = decide('rejected', 'A2')
    expect(result.ok && result.subtree).toEqual([])
    expect(result.ok && result.nodeStatus.A2).toBe('rejected')
  })

  it('a node with a subtree needs the user to choose delete or save_off', () => {
    const result = decide('rejected', 'A')
    expect(result).toMatchObject({ ok: false, code: 'subtree_action_required' })
    // A1 and A2 hang only through A. C is still reachable through B, so it is NOT in the subtree.
    expect(!result.ok && result.subtree?.sort()).toEqual(['A1', 'A2'])
  })

  it('delete: the subtree is deleted with the node', () => {
    const result = decide('rejected', 'A', undefined, 'delete')
    expect(result.ok && result.nodeStatus).toMatchObject({ A: 'rejected', A1: 'deleted', A2: 'deleted', B: 'pending', C: 'pending' })
  })

  it('save_off: the subtree is kept, saved off', () => {
    const result = decide('rejected', 'A', undefined, 'save_off')
    expect(result.ok && result.nodeStatus).toMatchObject({ A: 'rejected', A1: 'saved_off', A2: 'saved_off' })
  })

  it('a converging node with another parent is not orphaned', () => {
    const result = decide('rejected', 'B')
    expect(result.ok && result.subtree).toEqual([]) // C still hangs from A1 -> A -> anchor
  })

  it('a converging node IS orphaned once both parents are gone', () => {
    const afterA = decide('rejected', 'A', undefined, 'delete')
    const saved = afterA.ok ? afterA.nodeStatus : undefined
    const result = decide('rejected', 'B', saved)
    expect(result).toMatchObject({ ok: false, code: 'subtree_action_required' })
    expect(!result.ok && result.subtree).toEqual(['C'])
  })

  it('an accepted node counts as part of the canvas: its children are not orphaned', () => {
    // A accepted (real now). Rejecting A1 must not orphan A2? A2 hangs only through A1, so it IS orphaned.
    const saved: Record<string, GhostNodeStatus> = { A: 'accepted' }
    const result = decide('rejected', 'A1', saved)
    expect(!result.ok && result.subtree).toEqual(['A2'])
    // ...but rejecting B orphans nobody, because C is still reachable through accepted A -> A1
    expect(decide('rejected', 'B', saved).ok && decide('rejected', 'B', saved)).toMatchObject({ ok: true, subtree: [] })
  })
})

describe('saved-off nodes', () => {
  const afterReject = decide('rejected', 'A', undefined, 'save_off')
  const saved = afterReject.ok ? afterReject.nodeStatus : undefined

  it('can be accepted on their own later', () => {
    const result = decide('accepted', 'A1', saved)
    expect(result.ok && result.nodeStatus.A1).toBe('accepted')
  })

  it('can be thrown away on their own, affecting nobody else', () => {
    const result = decide('rejected', 'A1', saved)
    expect(result.ok && result.subtree).toEqual([])
    expect(result.ok && result.nodeStatus).toMatchObject({ A1: 'rejected', A2: 'saved_off' })
  })
})

describe('errors', () => {
  it('unknown ghost id', () => {
    expect(decide('accepted', 'nope')).toMatchObject({ ok: false, code: 'unknown_ghost' })
  })

  it.each<[GhostNodeStatus]>([['accepted'], ['rejected'], ['deleted']])('a %s node can not be decided again', status => {
    expect(decide('accepted', 'A', { A: status })).toMatchObject({ ok: false, code: 'already_decided' })
  })
})

describe('turn status (this is what blocks the agent)', () => {
  it('pending while a first-level node waits', () => {
    expect(turnStatusOf(structure, initialNodeStatus(structure))).toBe('pending')
  })

  it('pending ghosts deeper down do NOT keep the turn pending', () => {
    const decided: Record<string, GhostNodeStatus> = { ...initialNodeStatus(structure), A: 'accepted', B: 'rejected' }
    // A1, A2, C are still pending but they are not first level
    expect(turnStatusOf(structure, decided)).toBe('accepted')
  })

  it('rejected when nothing was accepted', () => {
    const decided: Record<string, GhostNodeStatus> = { ...initialNodeStatus(structure), A: 'rejected', B: 'rejected' }
    expect(turnStatusOf(structure, decided)).toBe('rejected')
  })

  it('applyDecision returns the new turn status', () => {
    const afterA = decide('accepted', 'A')
    expect(afterA.ok && afterA.turnStatus).toBe('pending') // B still waits
    const afterB = decide('rejected', 'B', afterA.ok ? afterA.nodeStatus : undefined)
    expect(afterB.ok && afterB.turnStatus).toBe('accepted')
  })
})
