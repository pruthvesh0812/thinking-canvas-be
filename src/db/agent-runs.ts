import { db } from './client.js'
import type { AgentRole, AgentRun, AgentRunSourceType, ContextScope } from '../../types/index.js'

// One row per agent invocation (see migration 20261025000003_agent_runs.sql).
// Only the backend writes this table.

export async function createRun(input: {
  canvas_id: string
  session_id: string
  agent: AgentRole
  focus_node_ids: string[]
  source_type: AgentRunSourceType
  source_id: string
}): Promise<AgentRun> {
  const { data, error } = await db
    .from('agent_runs')
    .insert(input)
    .select()
    .single()

  if (error) throw new Error(`createRun failed: ${error.message}`)
  return data as AgentRun
}

export async function getRun(run_id: string): Promise<AgentRun | null> {
  const { data, error } = await db
    .from('agent_runs')
    .select('*')
    .eq('id', run_id)
    .maybeSingle()

  if (error) throw new Error(`getRun failed: ${error.message}`)
  return data as AgentRun | null
}

// Runs that have not finished yet for this agent on this canvas. Feeds canAgentFire.
export async function getActiveRuns(canvas_id: string, agent: AgentRole): Promise<AgentRun[]> {
  const { data, error } = await db
    .from('agent_runs')
    .select('*')
    .eq('canvas_id', canvas_id)
    .eq('agent', agent)
    .in('status', ['queued', 'running'])

  if (error) throw new Error(`getActiveRuns failed: ${error.message}`)
  return (data ?? []) as AgentRun[]
}

export async function markRunning(run_id: string): Promise<void> {
  const { error } = await db.from('agent_runs').update({ status: 'running' }).eq('id', run_id)
  if (error) throw new Error(`markRunning failed: ${error.message}`)
}

// Success: store what the agent saw and what it produced (this is the evaluation log).
export async function markDone(run_id: string, result: {
  scope: ContextScope
  loaded_nodes: unknown
  context_snapshot: string
  context_tokens: number
  output: unknown
  referenced_node_ids: string[]
  thread_id: string
}): Promise<void> {
  const { error } = await db
    .from('agent_runs')
    .update({ status: 'done', finished_at: new Date().toISOString(), ...result })
    .eq('id', run_id)

  if (error) throw new Error(`markDone failed: ${error.message}`)
}

export async function markFailed(run_id: string, message: string): Promise<void> {
  const { error } = await db
    .from('agent_runs')
    .update({ status: 'failed', error: message, finished_at: new Date().toISOString() })
    .eq('id', run_id)

  if (error) throw new Error(`markFailed failed: ${error.message}`)
}
