import { getActiveByCanvas } from '../db/rejection-insights.js'
import { logger } from '../lib/logger.js'
import type { AgentRole, RejectionInsight } from '../../types/index.js'

const DIVIDER = '─────────────────────────────────────────────'

const REASON_LABEL: Record<string, string> = {
  too_abstract: 'Too Abstract',
  too_technical: 'Too Technical',
  skip_for_now: 'Skip for now',
}

const CONNECTION_REASON_LABEL: Record<string, string> = {
  not_related: 'Not Related',
  wrong_direction: 'Wrong Direction',
  too_indirect: 'Too Indirect',
  already_obvious: 'Already Obvious',
}

function severityLabel(insight: RejectionInsight): string {
  if (insight.severity === 'temporal_deferral' && insight.turns_remaining !== null) {
    const t = insight.turns_remaining
    return `[DEFERRAL — ${t} turn${t === 1 ? '' : 's'}]`
  }
  if (insight.severity === 'hard_block') return '[HARD BLOCK]'
  return '[APPROACH PIVOT]'
}

function renderBlock(
  title: string,
  insights: RejectionInsight[],
  reasonFor: (insight: RejectionInsight) => string,
): string {
  const lines: string[] = [title, DIVIDER]

  for (const insight of insights) {
    const label = severityLabel(insight).padEnd(22)
    const reason = reasonFor(insight)

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

// Loads active rejection_insights for a canvas and formats them into prompt blocks.
// Content-category insights (rejection_reason set) render as NEGATIVE CONSTRAINTS
// for every agent. Connection-category insights (target_edge_id set — Observer edge
// rejections) render as OBSERVER CONNECTION FEEDBACK, and only for the Observer.
// Returns empty string if nothing applies — caller must skip the block in that case.
export async function buildRejectionBlock(canvas_id: string, agentRole: AgentRole): Promise<string> {
  const insights = await getActiveByCanvas(canvas_id)
  if (insights.length === 0) return ''

  const contentInsights = insights.filter(i => i.target_edge_id === null)
  const connectionInsights = insights.filter(i => i.target_edge_id !== null)

  const blocks: string[] = []

  if (contentInsights.length > 0) {
    blocks.push(renderBlock(
      'NEGATIVE CONSTRAINTS (active — do not violate):',
      contentInsights,
      i => REASON_LABEL[i.rejection_reason ?? ''] ?? i.rejection_reason ?? '',
    ))
  }

  if (connectionInsights.length > 0) {
    if (agentRole === 'observer') {
      blocks.push(renderBlock(
        'OBSERVER CONNECTION FEEDBACK (active — do not repeat these connections):',
        connectionInsights,
        i => CONNECTION_REASON_LABEL[i.connection_feedback ?? ''] ?? i.connection_feedback ?? '',
      ))
    } else {
      logger.warn('[serializer:rejection] dropping connection insights for non-observer role', {
        canvas_id,
        agentRole,
        count: connectionInsights.length,
      })
    }
  }

  return blocks.join('\n\n')
}
