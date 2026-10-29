// The real S1Source, backed by Supabase. Kept apart from retrieve-s1.ts so the retrieval
// logic can run (tests, preview tool) without a database connection.

import { getNodesByIds } from '../db/nodes.js'
import { getEdgesTouching } from '../db/edges.js'
import { getVisibleNotes } from '../db/context-notes.js'
import type { S1Source } from './retrieve-s1.js'

export function createDbSource(canvasId: string): S1Source {
  return {
    // only nodes of THIS canvas: an id from another canvas must never be readable here
    getNodes: async ids => (await getNodesByIds(ids)).filter(node => node.canvas_id === canvasId),
    getEdgesTouching: ids => getEdgesTouching(canvasId, ids),
    getNotes: params => getVisibleNotes(canvasId, params),
  }
}
