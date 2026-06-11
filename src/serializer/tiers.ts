import type { ThreadMessage } from '../../types/index.js'

export type Tier = 0 | 1 | 2 | 3 | 4

// Returns a Map<messageIndex(as string), Tier> for canvas_event and ghost_pair messages.
// session_boundary messages are excluded — serialize() handles them separately.
// Tier 0 (north star) is not in the map — always rendered first from canvas.original_intent.
//
// Tiers are relative to the END of the thread (active node = Tier 1):
//   Tier 1 — Active:     the most recent turn
//   Tier 2 — Recent:     previous 3 turns
//   Tier 3 — Mid:        turns 4–10 from end
//   Tier 4 — Compressed: turns 11+ from end
//
// A "turn" is a (user canvas_event) + optional (assistant ghost_pair) pair.
export function classifyTiers(messages: ThreadMessage[]): Map<string, Tier> {
  const result = new Map<string, Tier>()

  // Step 1 — Group messages into turns.
  // A turn = one (user canvas_event) + the immediately following (assistant ghost_pair).
  // session_boundary messages are skipped — they don't count as turns.
  type Turn = { indices: number[] }
  const turns: Turn[] = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.role === 'user' && msg.turn_type === 'canvas_event') {
      const turn: Turn = { indices: [i] }
      if (i + 1 < messages.length && messages[i + 1].role === 'assistant') {
        turn.indices.push(i + 1)
        i++ // skip the assistant message so the outer loop doesn't re-visit it
      }
      turns.push(turn)
    }
    // session_boundary messages are not added to any turn
  }

  // Step 2 — Assign a tier to every message index in every turn.
  // Tiers are relative to the END (the most recent turn is always Tier 1):
  //   posFromEnd === 0      → Tier 1 (Active)
  //   posFromEnd 1–3        → Tier 2 (Recent)
  //   posFromEnd 4–10       → Tier 3 (Mid)
  //   posFromEnd 11+        → Tier 4 (Compressed)
  const total = turns.length
  for (let t = 0; t < total; t++) {
    const posFromEnd = total - t - 1
    let tier: Tier

    if (posFromEnd === 0) tier = 1
    else if (posFromEnd <= 3) tier = 2
    else if (posFromEnd <= 10) tier = 3
    else tier = 4

    // Both the user message and its paired assistant message get the same tier
    for (const idx of turns[t].indices) {
      result.set(String(idx), tier)
    }
  }

  return result
}
