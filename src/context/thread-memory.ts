// Thread memory (decision D9): a short list of what agents proposed recently on this
// canvas and what the user did with it. It stops an agent repeating an idea the user
// already accepted or rejected.
//
// Source: the agent threads of the canvas (all agents, not only the one running).
// Only finished ghost structures count. Old ghost_pair turns (from before the redesign)
// are legacy rows and are skipped.

import type { AgentRole, AgentThread } from '../../types/index.js'
import { THREAD_MEMORY_TURNS } from './settings.js'

// A proposal can be long. Memory only needs enough to recognise the idea.
const MAX_SUMMARY_CHARS = 140

type MemoryTurn = { agent: AgentRole; content: string; status: string; timestamp: string }

export function buildThreadMemory(threads: AgentThread[], maxTurns: number = THREAD_MEMORY_TURNS): string[] {
  // 1. pick the ghost_structure turns out of every thread
  const turns: MemoryTurn[] = []
  for (const thread of threads) {
    for (const message of thread.messages) {
      if (message.role === 'assistant' && message.turn_type === 'ghost_structure') {
        turns.push({
          agent: thread.agent_role,
          content: message.content,
          status: message.ghost_structure.status,
          timestamp: message.timestamp,
        })
      }
    }
  }

  // 2. keep the newest N, then show them oldest first (reads like a story)
  const recent = turns
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, maxTurns)
    .reverse()

  // 3. one line per turn
  return recent.map(turn => {
    const text = turn.content.replace(/\s+/g, ' ').trim()
    const short = text.length > MAX_SUMMARY_CHARS ? `${text.slice(0, MAX_SUMMARY_CHARS)}...` : text
    const outcome = turn.status === 'pending' ? 'not decided yet' : turn.status
    return `${turn.agent} proposed "${short}" -> ${outcome}`
  })
}
