// Runs ONE agent run from start to finish. The Inngest function (run-agent.ts) just calls this.
// All outside things (database, model, Redis) come in through `ExecuteRunDeps`, so the flow and
// its failure handling can be tested with fakes.
//
// Flow:
//   1. load the run, mark it running, tell the frontend (structure_start)
//   2. read the invoking text live, retrieve context (S1), assemble the prompt
//   3. call the model and stream: every finished node/frame goes out as a ghost_chunk
//   4. nothing came out? retry ONCE with the errors added to the prompt. Still nothing: fail.
//   5. save the thread turn + the run log, tell the frontend (structure_done)
//   Any failure: mark the run failed, tell the frontend (structure_error). Nothing half-saved.

import { logger } from '../lib/logger.js'
import { assemblePrompt, escapeData } from '../context/assemble.js'
import { createIdMap } from '../context/ids.js'
import { retrieveS1, type S1Source } from '../context/retrieve-s1.js'
import { AGENT_SCOPE } from '../context/settings.js'
import { buildThreadMemory } from '../context/thread-memory.js'
import { consumeGhostStream, type PartialModelOutput } from '../context/stream-structure.js'
import type { GhostChunk } from '../context/ghost-output.js'
import type { AgentRole, AgentRun, AgentThread, Canvas, GhostStructure, ThreadMessage } from '../../types/index.js'

// The model gets one retry (with the errors shown to it). After that the run fails.
const MAX_ATTEMPTS = 2

// What the user sees when a run fails. Short and safe: the real error goes to the run log only.
const USER_FACING_FAILURE = 'The agent could not produce a usable answer. Please try again.'

export type ExecuteRunDeps = {
  // run records
  getRun(runId: string): Promise<AgentRun | null>
  markRunning(runId: string): Promise<void>
  markDone(runId: string, result: Parameters<typeof import('../db/agent-runs.js').markDone>[1]): Promise<void>
  markFailed(runId: string, message: string): Promise<void>
  // context
  getCanvas(canvasId: string): Promise<Canvas>
  getAllThreads(canvasId: string): Promise<AgentThread[]>
  getOrCreateThread(canvasId: string, agent: AgentRole): Promise<AgentThread>
  appendMessage(threadId: string, message: ThreadMessage): Promise<void>
  getConstraints(canvasId: string, agent: AgentRole): Promise<string>
  createSource(canvasId: string): S1Source
  // the text that invoked the agent, read live. null = the row is gone / not allowed
  getInvokingText(run: AgentRun): Promise<string | null>
  // the model
  streamAgent(params: { canvasId: string; prompt: string }): Promise<{
    partials: AsyncIterable<PartialModelOutput>
    getFinal: () => Promise<PartialModelOutput | undefined>
  }>
  // the frontend stream
  publisher: {
    start(sessionId: string, params: { run_id: string; agent: AgentRole; focus_node_ids: string[] }): Promise<void>
    chunk(sessionId: string, runId: string, chunk: GhostChunk): Promise<void>
    done(sessionId: string, params: { run_id: string; thread_id: string; turn_index: number }): Promise<void>
    error(sessionId: string, runId: string, reason: string): Promise<void>
  }
}

export type ExecuteRunOutcome = { status: 'done' | 'failed' | 'skipped'; reason?: string }

export async function executeAgentRun(runId: string, deps: ExecuteRunDeps): Promise<ExecuteRunOutcome> {
  const startedAt = Date.now()

  // ── 1. load the run. Only a fresh "queued" run may start (guards against a duplicate event) ──
  const run = await deps.getRun(runId)
  if (!run || run.status !== 'queued') {
    logger.warn('[pipeline:run-agent] run missing or not queued, skipping', { run_id: runId, status: run?.status })
    return { status: 'skipped', reason: run ? `status is ${run.status}` : 'run not found' }
  }
  const sessionId = run.session_id ?? ''

  try {
    await deps.markRunning(run.id)
    await deps.publisher.start(sessionId, { run_id: run.id, agent: run.agent, focus_node_ids: run.focus_node_ids })

    // ── 2a. scope: only S1 exists so far (stress tester and general come in later slices) ──
    const scope = AGENT_SCOPE[run.agent as keyof typeof AGENT_SCOPE]
    if (scope !== 'S1') throw new Error(`agent ${run.agent} has scope ${scope}, only S1 is built`)

    // ── 2b. the text that invoked the agent, read live (never trusted from the request) ──
    const invokingText = await deps.getInvokingText(run)
    if (invokingText === null) throw new Error('the invoking text is gone (deleted, or not on this canvas)')

    // ── 2c. everything the prompt needs ──
    const [canvas, allThreads, constraintsBlock, retrieval] = await Promise.all([
      deps.getCanvas(run.canvas_id),
      deps.getAllThreads(run.canvas_id),
      deps.getConstraints(run.canvas_id, run.agent), // non-negotiable #10: rejected things are always loaded
      retrieveS1(deps.createSource(run.canvas_id), {
        canvasId: run.canvas_id,
        focusNodeIds: run.focus_node_ids,
        // a note that invoked the agent is shown in the task layer, so leave it out of its node
        excludeEntryId: run.source_type === 'context_entry' ? run.source_id : undefined,
      }),
    ])

    const assembled = assemblePrompt({
      agent: run.agent,
      canvas: { title: canvas.title, original_intent: canvas.original_intent },
      retrieval,
      constraintsBlock,
      threadMemory: buildThreadMemory(allThreads),
      task: {
        text: invokingText,
        sourceType: run.source_type,
        sourceNodeId: run.source_type === 'node' ? run.source_id : undefined,
      },
    })
    // the model may only point at nodes that are in the prompt
    const idMap = createIdMap(assembled.shownNodes)

    // ── 3 + 4. call the model, stream the chunks; retry once if the user got nothing ──
    let structure: GhostStructure = { frames: [], nodes: [], edges: [] }
    let lastErrors: string[] = []
    let succeeded = false

    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !succeeded; attempt++) {
      // on the retry, show the model what went wrong
      const prompt = attempt === 1
        ? assembled.prompt
        : `${assembled.prompt}\n\n<previous_errors>\nYour last answer could not be used:\n${lastErrors.map(e => `- ${escapeData(e)}`).join('\n')}\nFix these and answer again.\n</previous_errors>`

      const stream = await deps.streamAgent({ canvasId: run.canvas_id, prompt })
      const result = await consumeGhostStream({
        partials: stream.partials,
        getFinal: stream.getFinal,
        idMap,
        onChunk: chunk => deps.publisher.chunk(sessionId, run.id, chunk),
      })

      lastErrors = result.errors
      if (result.errors.length > 0) {
        logger.warn('[pipeline:run-agent] validation errors', { run_id: run.id, attempt, errors: result.errors })
      }

      // anything that reached the user counts as success (we can NOT retry after chunks went out:
      // the user would see two answers on top of each other)
      if (result.chunkCount > 0) {
        structure = result.structure
        succeeded = true
      }
    }

    if (!succeeded) throw new Error(`validation failed after ${MAX_ATTEMPTS} attempts: ${lastErrors.join('; ')}`)

    // ── 5a. save the thread turn: the proposal, waiting for the user's accept/reject ──
    const thread = await deps.getOrCreateThread(run.canvas_id, run.agent)
    const turnIndex = thread.messages.length
    await deps.appendMessage(thread.id, {
      role: 'assistant',
      turn_type: 'ghost_structure',
      content: summarise(structure),
      ghost_structure: { run_id: run.id, focus_node_ids: retrieval.focus_node_ids, structure, status: 'pending' },
      timestamp: new Date().toISOString(),
    })

    // ── 5b. save the run log (what the agent saw, what it said) ──
    await deps.markDone(run.id, {
      scope: retrieval.scope,
      loaded_nodes: assembled.loadedNodes,
      context_snapshot: assembled.prompt,
      context_tokens: assembled.tokens.total,
      output: structure,
      referenced_node_ids: existingNodeIdsUsed(structure),
      thread_id: thread.id,
    })

    // ── 5c. last, tell the frontend (thread turn is saved, so thread_id + turn_index are valid) ──
    await deps.publisher.done(sessionId, { run_id: run.id, thread_id: thread.id, turn_index: turnIndex })

    logger.info('[pipeline:run-agent] done', {
      run_id: run.id,
      agent: run.agent,
      nodes: structure.nodes.length,
      frames: structure.frames.length,
      tokens: assembled.tokens.total,
      duration_ms: Date.now() - startedAt,
    })
    return { status: 'done' }
  } catch (error) {
    // ── failure: record the real reason, show the user a safe one ──
    const message = error instanceof Error ? error.message : String(error)
    logger.error('[pipeline:run-agent] failed', { run_id: run.id, agent: run.agent, error: message, duration_ms: Date.now() - startedAt })
    await deps.markFailed(run.id, message)
    await deps.publisher.error(sessionId, run.id, USER_FACING_FAILURE)
    return { status: 'failed', reason: message }
  }
}

// One line for the thread: the text of the proposed nodes. Used in thread memory later.
function summarise(structure: GhostStructure): string {
  const text = structure.nodes.map(node => node.content).join(' | ')
  return text.length > 300 ? `${text.slice(0, 300)}...` : text
}

// Real canvas nodes the answer points at: edge ends that are not ghost nodes of this answer.
function existingNodeIdsUsed(structure: GhostStructure): string[] {
  const ghostIds = new Set(structure.nodes.map(node => node.ghost_id))
  const used = new Set<string>()
  for (const edge of structure.edges) {
    if (!ghostIds.has(edge.from)) used.add(edge.from)
    if (!ghostIds.has(edge.to)) used.add(edge.to)
  }
  return [...used]
}
