// Short ids for the prompt.
//
// The model never sees UUIDs (waste of tokens, easy to garble). It sees the number
// the user sees on the canvas: n1, n2, n3... (that is nodes.seq).
// This file converts both ways: n5 <-> real node UUID.

export type NodeSeqRef = { id: string; seq: number }

export type IdMap = {
  // uuid -> "n5". null if this node was never shown to the model
  labelFor(uuid: string): string | null
  // "n5" -> uuid. null if the model made up a number, or it was not in the prompt
  uuidFor(label: string): string | null
}

// Only "n" + digits counts as a node label. "t1", "N5", "n05x" etc. are not.
const NODE_LABEL_RE = /^n(\d+)$/

export function nodeLabel(seq: number): string {
  return `n${seq}`
}

// Build the map from the nodes we actually put in the prompt.
// Anything not in this list can NOT be referenced by the model (that is the point:
// it stops the model pointing at nodes it never saw).
export function createIdMap(shownNodes: NodeSeqRef[]): IdMap {
  const uuidBySeq = new Map<number, string>()
  const seqByUuid = new Map<string, number>()

  for (const node of shownNodes) {
    uuidBySeq.set(node.seq, node.id)
    seqByUuid.set(node.id, node.seq)
  }

  return {
    labelFor(uuid) {
      const seq = seqByUuid.get(uuid)
      return seq === undefined ? null : nodeLabel(seq)
    },

    uuidFor(label) {
      const match = NODE_LABEL_RE.exec(label)
      if (!match) return null
      return uuidBySeq.get(Number(match[1])) ?? null
    },
  }
}
