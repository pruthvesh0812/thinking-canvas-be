import { getActiveByCanvas } from '../db/rejection-insights.js'
import type { RejectionInsight } from '../../types/index.js'

const DIVIDER = '─────────────────────────────────────────────'

const REASON_LABEL: Record<string, string> = {
  too_abstract: 'Too Abstract',
  too_technical: 'Too Technical',
  skip_for_now: 'Skip for now',
}

function severityLabel(insight: RejectionInsight): string {
  if (insight.severity === 'temporal_deferral' && insight.turns_remaining !== null) {
    const t = insight.turns_remaining
    return `[DEFERRAL — ${t} turn${t === 1 ? '' : 's'}]`
  }
  if (insight.severity === 'hard_block') return '[HARD BLOCK]'
  return '[APPROACH PIVOT]'
}

// Loads active rejection_insights for a canvas and formats the NEGATIVE CONSTRAINTS block.
// Returns empty string if no active insights — caller must skip the block in that case.
export async function buildRejectionBlock(canvas_id: string): Promise<string> {
  const insights = await getActiveByCanvas(canvas_id)
  if (insights.length === 0) return ''

  const lines: string[] = [
    'NEGATIVE CONSTRAINTS (active — do not violate):',
    DIVIDER,
  ]

  for (const insight of insights) {
    const label = severityLabel(insight).padEnd(22)
    const reason = REASON_LABEL[insight.rejection_reason] ?? insight.rejection_reason

    for (let i = 0; i < insight.insight_points.length; i++) {
      const point = insight.insight_points[i]
      if (i === 0) {
        lines.push(`${label} ${point.label}`)
        lines.push(`${' '.repeat(23)} Source: seq:${point.sequence_number}, reason: ${reason}`)
      } else {
        lines.push(`${' '.repeat(23)} ${point.label}`)
      }
    }
  }

  lines.push(DIVIDER)
  return lines.join('\n')
}
