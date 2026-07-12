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

// directness = f(attention state, show-rule) — DESIGN §5. waiting → direct
// (they asked); thinking → subtle (protect the flow); a show-rule can force
// direct regardless of state.
export function decideDirectness(
  state: AttentionState,
  showRule: ShowRule = 'standard'
): InterventionDirectness {
  if (showRule === 'always_direct') return 'direct'
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
