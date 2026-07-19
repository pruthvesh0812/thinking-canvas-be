import type { ContextNodeType, InterventionDirectness } from '../../types/index.js'

// Attention state at the moment the pipeline is about to show its result (§5).
// 'waiting'  — the user hit "process now" or was watching the timer lapse on
//              an offer they were already attending to.
// 'thinking' — the timer lapsed on its own; the user's attention is elsewhere.
export type AttentionState = 'waiting' | 'thinking'

// Per-action modulation of the show ruleset (DESIGN §3, §5). 'standard' is the
// generate-at-show path, where attention state alone decides. 'always_direct'
// is the hover-old-ghost case (24) — the hover itself is the reveal request,
// regardless of attention state.
export type ShowRule = 'standard' | 'always_direct'

// Receptivity — a small decayed aggregate of past offer-response TIMING
// signals (§8). Neutral = 0.5; below LOW never shows direct no matter how
// attentive the user looks right now (protects a recently-unreceptive user);
// at/above HIGH shortens the processing timer (§4d: 10s default, 5s on high
// readiness). This is a timing signal only — never write rejection_insights
// from it; that channel is for content quality, not timing (§8's stated trap).
const RECEPTIVITY_NEUTRAL = 0.5
const LOW_RECEPTIVITY_THRESHOLD = 0.25
const HIGH_RECEPTIVITY_THRESHOLD = 0.7

// directness = f(attention state, show-rule, receptivity) — DESIGN §5 + §8.
// waiting → direct (they asked); thinking → subtle (protect the flow); a
// show-rule can force direct regardless of state; low receptivity overrides
// everything back down to subtle.
export function decideDirectness(
  state: AttentionState,
  showRule: ShowRule = 'standard',
  receptivity: number = RECEPTIVITY_NEUTRAL
): InterventionDirectness {
  if (showRule === 'always_direct') return 'direct'
  if (receptivity < LOW_RECEPTIVITY_THRESHOLD) return 'subtle'
  return state === 'waiting' ? 'direct' : 'subtle'
}

// Backend-authored sidebar-card headline (§5) — one line, plain language, the
// only party that knows what the agent actually produced. Reads the agent's
// own [NODE_TYPE: ...] tag so the headline matches what landed; falls back to
// the pre-assigned SpawnDescriptor type if the tag is missing or malformed.
const NODE_TYPE_TAG_RE =
  /\[NODE_TYPE:\s*(reframe|mirror|pattern|reference|contradiction|appreciation)\]/i

const HEADLINE_BY_NODE_TYPE: Record<ContextNodeType, string> = {
  reframe: "Worth a look when you're free — I found a new angle on this.",
  mirror: "Worth a look when you're free — I noticed something worth reflecting back.",
  pattern: "Worth a look when you're free — I spotted a pattern here.",
  reference: "Worth a look when you're free — this connects to something earlier.",
  contradiction:
    "Worth a look when you're free — I found a tension between this node and an earlier one.",
  appreciation: "Worth a look when you're free — this is worth pausing on.",
}

export function authorHeadline(responseText: string, fallbackType: ContextNodeType): string {
  const tagged = responseText.match(NODE_TYPE_TAG_RE)?.[1] as ContextNodeType | undefined
  return HEADLINE_BY_NODE_TYPE[tagged ?? fallbackType]
}

// The upgrade-offer headline — a tier-locked pick surfaces here instead of
// content (§4b, §5). Never a substitute agent; this is a conversion surface.
export function upgradeHeadline(): string {
  return 'Your plan has room for a deeper move here — upgrade to unlock it.'
}

// The Impact Check (§6) — compares an offer's birth-time context fingerprint to
// the canvas's CURRENT fingerprint. A cheap change-detector, never content: the
// canvas_version counter is bumped by a DB trigger on any node/edge mutation.
export type ImpactVerdict = 'none' | 'material'

export function checkImpact(offerFingerprint: string, currentFingerprint: string): ImpactVerdict {
  return offerFingerprint === currentFingerprint ? 'none' : 'material'
}

export const IMPACT_WARNING = 'This may not capture your latest change — regenerate?'

// ─────────────────────────────────────────────────────────────────────────
// Receptivity model (§8) — pure math only; src/db/sessions.ts owns the read
// /write. Offer-response ≠ content-rejection: "process now" is engagement
// with the OFFER'S TIMING, dismiss/ignore is "not now," never "bad idea."
// Deliberately distinct from RejectionReason (types/index.ts) — nothing here
// ever feeds rejection_insights.
// ─────────────────────────────────────────────────────────────────────────
export type ReceptivityResponse = 'manual' | 'dismissed' | 'ignored'

// 6h half-life: decays a bad afternoon back toward neutral well before the
// next session, so the aggregate reflects recent pattern, not a permanent grudge.
const RECEPTIVITY_HALF_LIFE_HOURS = 6

const RECEPTIVITY_DELTA: Record<ReceptivityResponse, number> = {
  manual: 0.12,      // "process now" — actively pulled the offer forward
  dismissed: -0.15,  // explicit dismiss — the timing itself was unwelcome
  ignored: -0.1,     // hard-timeout (waitForEvent lapsed, tab abandoned) — no engagement at all
}

// Decays the stored score toward neutral based on elapsed time since the last
// write, then applies this response's delta. Clamped to [0, 1].
export function nextReceptivity(params: {
  current: number
  lastUpdatedAt: string
  response: ReceptivityResponse
  now?: Date
}): number {
  const elapsedHours =
    ((params.now ?? new Date()).getTime() - new Date(params.lastUpdatedAt).getTime()) / 3_600_000
  const decay = Math.pow(0.5, Math.max(0, elapsedHours) / RECEPTIVITY_HALF_LIFE_HOURS)
  const decayed = RECEPTIVITY_NEUTRAL + (params.current - RECEPTIVITY_NEUTRAL) * decay
  const next = decayed + RECEPTIVITY_DELTA[params.response]
  return Math.min(1, Math.max(0, next))
}

// Read side — tunes the processing timer length (§4d: 10s default, 5s on
// high readiness). The intensity side of "tunes intensity + timer length" is
// decideDirectness's receptivity parameter above.
export function timerMsFor(receptivity: number): number {
  return receptivity >= HIGH_RECEPTIVITY_THRESHOLD ? 5000 : 10000
}
