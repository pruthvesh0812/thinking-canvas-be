// The core of the prompt preview tool: retrieve with the REAL retrieveS1, then assemble with the
// REAL assemblePrompt. Used by scripts/prompt-preview.ts for both fixture and real-canvas mode,
// and by tests. Takes its data source as input, so it never decides where data comes from.
// Dev tool only: read-only, no model calls.

import { assemblePrompt, type AssembleOptions, type AssembleParams, type AssembledPrompt } from '../assemble.js'
import { retrieveS1, type S1Source } from '../retrieve-s1.js'

export type PreviewInput = {
  canvasId: string
  source: S1Source
  focusNodeIds: string[]
  // The note that invoked the agent, when it is a context entry (left out of its node's unit).
  excludeEntryId?: string
  assembleBase: Omit<AssembleParams, 'retrieval'>
  options?: AssembleOptions
}

export type PreviewResult = AssembledPrompt & {
  scope: string
  focusNodeIds: string[]
}

export async function buildPreview(input: PreviewInput): Promise<PreviewResult> {
  // 1. same retrieval the agent run uses (hub guard, ancestors, set-aside, note rules)
  const retrieval = await retrieveS1(input.source, {
    canvasId: input.canvasId,
    focusNodeIds: input.focusNodeIds,
    excludeEntryId: input.excludeEntryId,
  })

  // 2. same assembly the agent run uses
  const assembled = assemblePrompt({ ...input.assembleBase, retrieval }, input.options)

  return { ...assembled, scope: retrieval.scope, focusNodeIds: retrieval.focus_node_ids }
}
