// What happens to a ghost structure when the user accepts or rejects ONE node.
// Pure: takes the structure + current statuses + the decision, gives back the new statuses.
// (The route loads/saves the thread turn; this file only decides.)
//
// Rules (decided with the product owner):
//   - accept is per node
//   - rejecting a node can orphan others: the ghost nodes that were only connected to the canvas THROUGH it.
//     That group is the node's "subtree". The user chooses: delete it, or save it off.
//   - saved off = no longer connected to anything, but each node can still be accepted on its own later
//   - hidden children of an accepted node simply stay pending
//   - a turn only counts as "pending" (and blocks the agent) while a FIRST-LEVEL node waits for the user.
//     Deeper nodes stay available in the UI but can not lock the agent forever.

import type { GhostNodeStatus, GhostStructure } from '../../types/index.js'

export type GhostDecision = {
  ghostId: string
  status: 'accepted' | 'rejected'
  // required only when a reject would orphan other nodes
  subtreeAction?: 'delete' | 'save_off'
}

export type DecisionResult =
  | {
      ok: true
      nodeStatus: Record<string, GhostNodeStatus>
      // nodes that were orphaned by this reject (empty for an accept, or a reject with no subtree)
      subtree: string[]
      turnStatus: 'pending' | 'accepted' | 'rejected'
    }
  | {
      ok: false
      code: 'unknown_ghost' | 'already_decided' | 'subtree_action_required'
      message: string
      // for subtree_action_required: who would be affected, so the UI can ask
      subtree?: string[]
    }

// Statuses for a fresh structure: everything waits for the user.
export function initialNodeStatus(structure: GhostStructure): Record<string, GhostNodeStatus> {
  return Object.fromEntries(structure.nodes.map(node => [node.ghost_id, 'pending' as const]))
}

// A saved turn may have no node_status (older rows): treat every node as pending.
function currentStatus(structure: GhostStructure, saved?: Record<string, GhostNodeStatus>): Record<string, GhostNodeStatus> {
  return { ...initialNodeStatus(structure), ...(saved ?? {}) }
}

// Whole-turn status from the node statuses.
//   pending  while any first-level (depth 1) node is still pending
//   accepted if the user accepted at least one node
//   rejected otherwise
export function turnStatusOf(
  structure: GhostStructure,
  nodeStatus: Record<string, GhostNodeStatus>,
): 'pending' | 'accepted' | 'rejected' {
  const firstLevelWaiting = structure.nodes.some(node => node.depth === 1 && nodeStatus[node.ghost_id] === 'pending')
  if (firstLevelWaiting) return 'pending'
  return Object.values(nodeStatus).includes('accepted') ? 'accepted' : 'rejected'
}

// Ghost nodes that would lose their link to the canvas if `removedId` went away.
//
// How a ghost node "hangs": the model links every new node to things written BEFORE it
// (existing canvas nodes or earlier ghost nodes). So for every edge, the endpoint that comes
// later in the structure is the dependent one, and the earlier endpoint is what it hangs from.
// (Real canvas nodes count as earliest.) A node stays connected while at least one of the things
// it hangs from is still connected: a real node, an accepted ghost, or a pending ghost that is
// itself connected. This is why a node with two parents survives losing one of them.
function findSubtree(
  structure: GhostStructure,
  nodeStatus: Record<string, GhostNodeStatus>,
  removedId: string,
): string[] {
  // creation order: position in the list (a real canvas node is not in it)
  const position = new Map(structure.nodes.map((node, index) => [node.ghost_id, index]))
  const isGhost = (id: string) => position.has(id)

  // for each ghost node: what it hangs from (the earlier endpoint of each of its edges)
  const hangsFrom = new Map<string, string[]>()
  for (const edge of structure.edges) {
    const fromIsGhost = isGhost(edge.from)
    const toIsGhost = isGhost(edge.to)
    // two real nodes: not our business
    if (!fromIsGhost && !toIsGhost) continue

    // which end is the dependent one? the later ghost. If one end is real, the ghost end depends on it.
    let dependent: string
    let support: string
    if (!fromIsGhost) { dependent = edge.to; support = edge.from }
    else if (!toIsGhost) { dependent = edge.from; support = edge.to }
    else if (position.get(edge.from)! > position.get(edge.to)!) { dependent = edge.from; support = edge.to }
    else { dependent = edge.to; support = edge.from }

    hangsFrom.set(dependent, [...(hangsFrom.get(dependent) ?? []), support])
  }

  // go through ghost nodes in creation order, so every support is decided before its dependents
  const connected = new Set<string>()
  const isConnected = (id: string) =>
    !isGhost(id) || // a real canvas node
    nodeStatus[id] === 'accepted' || // a ghost the user accepted: it is on the canvas now
    connected.has(id)

  const orphans: string[] = []
  for (const node of structure.nodes) {
    const id = node.ghost_id
    // only pending ghosts are on screen as ghosts. The removed node and decided nodes are out.
    if (id === removedId || nodeStatus[id] !== 'pending') continue

    const supports = (hangsFrom.get(id) ?? []).filter(support => support !== removedId)
    if (supports.some(isConnected)) connected.add(id)
    else orphans.push(id)
  }
  return orphans
}

export function applyDecision(
  structure: GhostStructure,
  savedStatus: Record<string, GhostNodeStatus> | undefined,
  decision: GhostDecision,
): DecisionResult {
  const { ghostId, status, subtreeAction } = decision
  const nodeStatus = currentStatus(structure, savedStatus)

  // ── 1. is it a node of this structure, and still open for a decision? ──
  const before = nodeStatus[ghostId]
  if (before === undefined) {
    return { ok: false, code: 'unknown_ghost', message: 'that ghost node is not part of this structure' }
  }
  // pending can be accepted or rejected. saved_off can still be accepted (or thrown away).
  if (before !== 'pending' && before !== 'saved_off') {
    return { ok: false, code: 'already_decided', message: `this ghost node is already ${before}` }
  }

  // ── 2. accept: just this node ──
  if (status === 'accepted') {
    nodeStatus[ghostId] = 'accepted'
    return { ok: true, nodeStatus, subtree: [], turnStatus: turnStatusOf(structure, nodeStatus) }
  }

  // ── 3. reject: first work out who would be left hanging ──
  // (a node that was already saved off is disconnected, so rejecting it affects nobody else)
  const subtree = before === 'pending' ? findSubtree(structure, nodeStatus, ghostId) : []
  if (subtree.length > 0 && !subtreeAction) {
    return {
      ok: false,
      code: 'subtree_action_required',
      message: 'rejecting this node leaves other ghost nodes hanging: choose delete or save_off',
      subtree,
    }
  }

  // ── 4. apply: the node is rejected, its subtree is deleted or saved off ──
  nodeStatus[ghostId] = 'rejected'
  for (const id of subtree) nodeStatus[id] = subtreeAction === 'delete' ? 'deleted' : 'saved_off'

  return { ok: true, nodeStatus, subtree, turnStatus: turnStatusOf(structure, nodeStatus) }
}
