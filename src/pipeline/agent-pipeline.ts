import { inngest } from '../lib/inngest.js'
import { logger } from '../lib/logger.js'
import { canAgentFire, isStillLatest } from '../lib/guards.js'
import { getAvailableAgents } from '../lib/tier.js'
import { buildSpawnDescriptor, publishSpawn } from '../streaming/spawn.js'
import { streamAgentOutput, publishDone } from '../streaming/tokens.js'
import { publishWaiting, publishOffer, publishWithdraw } from '../streaming/offer.js'
import { decideDirectness, authorHeadline, upgradeHeadline, checkImpact, IMPACT_WARNING, timerMsFor } from '../lib/intervention.js'
import { runAttunement } from '../agents/attunement.js'
import { runJudge } from '../agents/orchestrator.js'
import { streamExpander } from '../agents/expander.js'
import { streamStressTester } from '../agents/stress-tester.js'
import { serialize, serializeJudgeContext } from '../serializer/index.js'
import { getRecentNodes, getNode } from '../db/nodes.js'
import { getCanvas } from '../db/canvases.js'
import { getSession, maybeAdvancePhase, getReceptivity, applyReceptivityResponse } from '../db/sessions.js'
import { getTierByUser } from '../db/subscriptions.js'
import { getOrCreateThread, appendMessage, getById } from '../db/threads.js'
import { getActiveByCanvas, decrementTurnsRemaining } from '../db/rejection-insights.js'
import {
  createOffer,
  updateOfferStatus,
  allocateSeq,
  markSuperseded,
  getInFlightForSession,
} from '../db/intervention-offers.js'
import type { AgentRole, AttunementState, ContextNodeType, GhostPair } from '../../types/index.js'

// Agents the pipeline can route to. Articulator / Outer-Sub proactive paths land
// in task-04; their explicit-edge pipelines still run independently. The Observer
// is not a ghost-pair agent (content agent only) so it never appears here.
type StreamableRole = Extract<AgentRole, 'expander' | 'stress_tester'>

// Default context node type per agent — pre-assigned before the agent runs so the
// SpawnDescriptor can carry a type from the start. The agent's [NODE_TYPE:…] output
// drives the final type rendered on the frontend.
const DEFAULT_CONTEXT_TYPE: Record<StreamableRole, ContextNodeType> = {
  expander: 'reframe',
  stress_tester: 'contradiction',
}

function isStreamable(role: AgentRole): role is StreamableRole {
  return role === 'expander' || role === 'stress_tester'
}

function formatRecentNodesForAttunement(
  nodes: { summary: string | null; content: string | null; direction_marker: string | null }[]
): string {
  return [...nodes]
    .reverse()
    .map((n, i) => `${i + 1}. [${n.direction_marker ?? '?'}] ${n.summary ?? n.content ?? ''}`)
    .join('\n')
}

async function runJudgeStep(params: {
  canvas_id: string
  session_id: string
  node_id: string
  attunement: Pick<AttunementState, 'cognitive_mode' | 'question_style' | 'phase_shift_suggested' | 'confidence'>
}) {
  const canvas = await getCanvas(params.canvas_id)
  const session = await getSession(params.session_id)
  const tier = await getTierByUser(canvas.user_id)
  const available = getAvailableAgents(tier)
  const phase = await maybeAdvancePhase(session, {
    phase_shift_suggested: params.attunement.phase_shift_suggested,
    confidence: params.attunement.confidence,
  })
  const judgeContext = await serializeJudgeContext(canvas, params.node_id)
  const decision = await runJudge({
    canvas_id: params.canvas_id,
    session_id: params.session_id,
    trigger_node_id: params.node_id,
    phase,
    attunement: params.attunement,
    serialized_context: judgeContext,
    available_agents: available,
  })
  return { decision, canvas }
}

// ─────────────────────────────────────────────────────────────────────────
// INTERVENTION PIPELINE — triggered by canvas/intervention.trigger, which the
// frontend fires when its trigger ruleset passes (attention/action gate; DESIGN
// §4a). No debounce here — the frontend owns the deferral timer.
//
// Flow (DESIGN §2, §4d, §4f):
//   1. Attunement — infers cognitive_mode/question_style from the last 5 nodes.
//   2. Guard — drops silently if a pending ghost is still in review.
//   3. Judge — Attunement + full canvas-map → { mature, route }. Not mature →
//      silent "no pipeline". Tier-locked best → upgrade offer, no substitution.
//   4. Create offer (status='waiting') + publish 'waiting' over SSE — this is
//      what starts the frontend's processing timer.
//   5. waitForEvent('canvas/intervention.process', timeout 10m) — the frontend
//      POSTs this when the timer lapses or the user hits "process now". On hard
//      timeout (abandoned tab) → expire + withdraw.
//   6. Re-judge if the canvas fingerprint (canvas_version) moved during the wait
//      (user added/edited nodes). Unchanged → reuse cached route; changed →
//      re-run Attunement + judge, or abort+withdraw if no longer mature.
//   7. Generate — build SpawnDescriptor + publish spawn, sleep for animation,
//      serialize thread, stream agent output token-by-token to Redis.
//   8. Show (stub, task-07) — set directness='direct' + publish 'offer' SSE;
//      publish DONE; persist ghost pair on thread.
// ─────────────────────────────────────────────────────────────────────────

export const agentPipeline = inngest.createFunction(
  {
    id: 'intervention-pipeline',
    triggers: [{ event: 'canvas/intervention.trigger' }],
    // Supersession: a NEW mature offer fires canvas/intervention.superseded
    // with the OLD offer_id — Inngest matches on data.offer_id against THIS
    // run's trigger event (whose data.offer_id was set at trigger time) and
    // cancels the parked run. Belt-and-suspenders alongside the publish-
    // boundary version guard in isStillLatest (§4e).
    cancelOn: [{ event: 'canvas/intervention.superseded', match: 'data.offer_id' }],
  },
  async ({ event, step }) => {
    const { canvas_id, session_id, node_id, offer_id } = event.data as {
      canvas_id: string
      session_id: string
      node_id: string
      offer_id: string
    }
    const startedAt = Date.now()
    logger.info('[pipeline:agent] start', { canvas_id, session_id, node_id, offer_id })

    // ── Step 1: Attunement ─────────────────────────────────────────────────
    const attunement = await step.run('attunement', async () => {
      const recentNodes = await getRecentNodes(canvas_id, 5)
      return runAttunement({
        canvas_id,
        session_id,
        recent_nodes: formatRecentNodesForAttunement(recentNodes),
      })
    })
    logger.info('[pipeline:agent] step:attunement complete', {
      canvas_id,
      session_id,
      cognitive_mode: attunement.cognitive_mode,
      question_style: attunement.question_style,
      phase_shift_suggested: attunement.phase_shift_suggested,
    })

    // ── Step 2: Guard ──────────────────────────────────────────────────────
    const canFire = await step.run('guard-check', async () =>
      canAgentFire(canvas_id, 'expander', node_id)
    )
    if (!canFire) {
      logger.info('[pipeline:agent] dropped — pending ghost', { canvas_id, node_id })
      return
    }

    // ── Step 3: Judge ──────────────────────────────────────────────────────
    // Phase advances here via the task-02 latch; a confident Attunement shift
    // is what unlocks the Stress-Tester. Tier is server-side only.
    const { decision, canvas: canvasAtJudge } = await step.run('judge', async () =>
      runJudgeStep({ canvas_id, session_id, node_id, attunement })
    )
    logger.info('[pipeline:agent] step:judge ruled', {
      canvas_id,
      session_id,
      node_id,
      mature: decision.mature,
      route: decision.route,
      tier_locked: decision.tier_locked,
      confidence: decision.confidence,
    })

    if (!decision.mature || decision.route === null) return

    // Tier-locked best: never substitute a weaker agent (§4b) — surface an
    // upgrade offer on the sidebar card instead. No wait/generate; the offer
    // goes straight to 'shown' since there is nothing to time out on.
    if (decision.tier_locked) {
      await step.run('upgrade-offer', async () => {
        const seq = await allocateSeq(session_id)
        const created = await createOffer({
          id: offer_id,
          canvas_id,
          session_id,
          agent_role: decision.route as AgentRole,
          trigger_node_id: node_id,
          anchor_node_ids: decision.locus_node_ids,
          seq,
          context_fingerprint: canvasAtJudge.canvas_version.toString(),
        })
        const directness = decideDirectness('thinking')
        const headline = upgradeHeadline()
        await updateOfferStatus(created.id, 'shown', { directness, headline })
        await publishOffer(session_id, { ...created, status: 'shown', directness, headline })
      })
      logger.info('[pipeline:agent] tier-locked — upgrade offer surfaced', {
        canvas_id,
        node_id,
        offer_id,
        route: decision.route,
      })
      return
    }

    // Articulator/Outer-Sub proactive paths are for task-04+ (explicit-edge
    // pipelines already handle them). Only Expander/Stress-Tester stream here.
    if (!isStreamable(decision.route)) {
      logger.info('[pipeline:agent] non-streamable route', { canvas_id, node_id, route: decision.route })
      return
    }
    const initialRoute = decision.route

    // ── Step 4a: Supersede any in-flight offer for this session ────────────
    // Single-flight per session (§4e). Common case — a new mature judgement
    // pre-empts a parked one: mark superseded + publishWithdraw + fire the
    // cancel event. Inngest's cancelOn on the parked run matches on
    // data.offer_id and cancels; the publish-boundary guard is the fallback.
    await step.run('supersede-prior', async () => {
      const inFlight = await getInFlightForSession(session_id)
      for (const prior of inFlight) {
        // Skip our own offer_id in the extreme case of a retry — the offer
        // hasn't been created yet, but defensive.
        if (prior.id === offer_id) continue
        await markSuperseded(prior.id)
        await publishWithdraw(session_id, prior.id)
        await inngest.send({
          name: 'canvas/intervention.superseded',
          data: { offer_id: prior.id },
        })
        logger.info('[pipeline:agent] superseded prior offer', {
          prior_offer_id: prior.id,
          new_offer_id: offer_id,
          session_id,
        })
      }
    })

    // ── Step 4b: Create offer + publish 'waiting' ──────────────────────────
    // offer_id was pre-generated by the route so waitForEvent can match on it.
    // allocateSeq is an atomic RPC (bump + RETURNING) — never read-modify-write.
    const offer = await step.run('create-offer', async () => {
      const seq = await allocateSeq(session_id)
      return createOffer({
        id: offer_id,
        canvas_id,
        session_id,
        agent_role: initialRoute,
        trigger_node_id: node_id,
        anchor_node_ids: decision.locus_node_ids,
        seq,
        context_fingerprint: canvasAtJudge.canvas_version.toString(),
      })
    })

    const timerMs = await step.run('publish-waiting', async () => {
      // Receptivity-tuned timer length (§4d/§8): 10s default, 5s on high readiness.
      const { receptivity } = await getReceptivity(session_id)
      const timer_ms = timerMsFor(receptivity)
      await publishWaiting(session_id, offer, timer_ms)
      return timer_ms
    })
    logger.info('[pipeline:agent] step:waiting published', {
      session_id,
      offer_id: offer.id,
      seq: offer.seq,
      timer_ms: timerMs,
    })

    // ── Step 5: Wait for go ────────────────────────────────────────────────
    // match: 'data.offer_id' compares the trigger event's offer_id to the
    // incoming canvas/intervention.process event's offer_id — guaranteed unique.
    const go = await step.waitForEvent('go', {
      event: 'canvas/intervention.process',
      timeout: '10m',
      match: 'data.offer_id',
    })

    // Attention state for the show ruleset (§5): 'manual' means the user hit
    // "process now" or explicitly resumed a paused timer — they were watching.
    // A natural 'lapse' means the timer ran out on its own — subtle by default.
    const attentionState = go?.data?.reason === 'manual' ? 'waiting' : 'thinking'

    if (!go) {
      // Hard timeout — tab was abandoned. Expire + withdraw, and fold the
      // "ignored" TIMING signal into receptivity — never rejection_insights (§8).
      await step.run('expire', async () => {
        await updateOfferStatus(offer.id, 'expired')
        await publishWithdraw(session_id, offer.id)
        await applyReceptivityResponse(session_id, 'ignored')
      })
      logger.info('[pipeline:agent] offer expired (timeout)', { offer_id: offer.id, session_id })
      return
    }

    if (go.data?.reason === 'manual') {
      await step.run('receptivity-manual', async () => {
        await applyReceptivityResponse(session_id, 'manual')
      })
    }

    // ── Step 6: Re-judge if canvas fingerprint changed during the wait ─────
    // canvas_version is bumped by a DB trigger on every node/edge mutation (§6).
    // Unchanged → reuse cached route; changed → fresh Attunement + judge.
    const finalRoute = await step.run('rejudge-if-changed', async (): Promise<StreamableRole | null> => {
      const currentCanvas = await getCanvas(canvas_id)
      if (currentCanvas.canvas_version.toString() === offer.context_fingerprint) {
        // Fingerprint unchanged — cached route is still honest.
        return initialRoute
      }

      logger.info('[pipeline:agent] fingerprint changed — re-judging', {
        canvas_id,
        offer_id: offer.id,
        old: offer.context_fingerprint,
        new: currentCanvas.canvas_version.toString(),
      })

      const recentNodes = await getRecentNodes(canvas_id, 5)
      const freshAttunement = await runAttunement({
        canvas_id,
        session_id,
        recent_nodes: formatRecentNodesForAttunement(recentNodes),
      })
      const { decision: freshDecision } = await runJudgeStep({
        canvas_id,
        session_id,
        node_id,
        attunement: freshAttunement,
      })

      if (
        !freshDecision.mature ||
        freshDecision.route === null ||
        freshDecision.tier_locked ||
        !isStreamable(freshDecision.route)
      ) {
        await updateOfferStatus(offer.id, 'expired')
        await publishWithdraw(session_id, offer.id)
        return null
      }

      return freshDecision.route
    })

    if (finalRoute === null) {
      logger.info('[pipeline:agent] re-judge: no longer mature — withdrawn', { offer_id: offer.id })
      return
    }

    // ── Step 7: Generate ───────────────────────────────────────────────────
    // Version guard #1 — before spawn. A stale run that raced past cancelOn
    // aborts silently here: no spawn, no offer status change, no signal to
    // the frontend beyond the withdraw the newer run already sent.
    const stillLatestBeforeSpawn = await step.run('guard-before-spawn', async () =>
      isStillLatest(offer)
    )
    if (!stillLatestBeforeSpawn) {
      logger.info('[pipeline:agent] aborting at spawn boundary — stale', { offer_id: offer.id })
      return
    }

    const descriptor = await step.run('publish-spawn', async () => {
      const d = buildSpawnDescriptor({
        trigger_node_id: node_id,
        session_id,
        agent_role: finalRoute,
        context_node_type: DEFAULT_CONTEXT_TYPE[finalRoute],
        has_question_node: true,
      })
      await publishSpawn(session_id, d)
      return d
    })
    logger.info('[pipeline:agent] step:spawn published', {
      canvas_id,
      session_id,
      agent_role: finalRoute,
      context_ghost_id: descriptor.context_node.ghost_id,
      question_ghost_id: descriptor.question_node?.ghost_id ?? null,
    })

    await step.sleep('ghost-animation', '1500ms')

    // Record this node as a canvas_event turn — the "user" half of the
    // (canvas_event → ghost_pair) pair the tiered serializer expects (see
    // SERIALIZATION.md → Node-Anchored Format). serializeTiered/formatTier1
    // only ever render `canvas_event` turns, so without this the agent gets
    // no active-node block at all. Own step — appendMessage is a
    // non-idempotent DB write and must never replay.
    await step.run('record-canvas-event', async () => {
      const node = await getNode(node_id)
      const thread = await getOrCreateThread(canvas_id, finalRoute)
      await appendMessage(thread.id, {
        role: 'user',
        turn_type: 'canvas_event',
        node_id,
        content: node.content ?? node.summary ?? '',
        timestamp: new Date().toISOString(),
      })
    })

    const context = await step.run('serialize', async () => {
      const thread = await getOrCreateThread(canvas_id, finalRoute)
      const canvas = await getCanvas(canvas_id)
      return serialize(thread, finalRoute, canvas)
    })
    logger.info('[pipeline:agent] step:serialize complete', {
      canvas_id,
      session_id,
      agent_role: finalRoute,
      context_chars: context.length,
    })

    // Version guard #2 — before streaming. A supersede that lands during
    // serialize (which does its own DB reads) still aborts us here, before
    // we spend a single content-agent token.
    const stillLatestBeforeStream = await step.run('guard-before-stream', async () =>
      isStillLatest(offer)
    )
    if (!stillLatestBeforeStream) {
      logger.info('[pipeline:agent] aborting at stream boundary — stale', { offer_id: offer.id })
      return
    }

    const responseText = await step.run('stream-context', async () => {
      const stream =
        finalRoute === 'expander'
          ? await streamExpander({ canvas_id, trigger_node_id: node_id, serialized_context: context })
          : await streamStressTester({ canvas_id, trigger_node_id: node_id, serialized_context: context })
      return streamAgentOutput(
        stream.textStream,
        {
          contextGhostId: descriptor.context_node.ghost_id,
          questionGhostId: descriptor.question_node?.ghost_id ?? null,
        },
        session_id
      )
    })
    logger.info('[pipeline:agent] step:stream complete', {
      canvas_id,
      session_id,
      agent_role: finalRoute,
      response_chars: responseText.length,
    })

    // ── Step 8: Show + finalize ────────────────────────────────────────────
    // Show ruleset (§5, §8): directness = f(attention state, show-rule,
    // receptivity) — the standard generate-at-show path, re-read fresh since
    // the wait may have just folded a 'manual' response into it. Headline is
    // backend-authored from the agent's own [NODE_TYPE:...] tag — only the
    // backend knows what landed.
    //
    // ORDERING IS LOAD-BEARING (task-01 + task-05): every side effect the FE
    // needs — the offer's show signal AND the persisted ghost_pair turn — must
    // land BEFORE `publishDone`, which is published LAST. `done` carries the
    // turn attribution (thread_id/turn_index/ghost ids) and, for any FE that
    // finalizes on it, marks the end of the generation. Publishing the offer or
    // persisting the turn after `done` would drop/race them.
    //
    // This is its own step (not folded into the publish step below) because
    // `appendMessage` is a non-idempotent DB write. Inngest only checkpoints a
    // step.run callback once it *completes*; a throw anywhere inside a step
    // reruns the whole callback from the top on retry. Keeping the append as
    // the last fallible call in a dedicated step means a retry of a later
    // Redis publish can never replay it into a duplicate thread turn.
    const { thread_id, turn_index, shownOffer } = await step.run('persist-turn', async () => {
      const { receptivity } = await getReceptivity(session_id)
      const directness = decideDirectness(attentionState, 'standard', receptivity)
      const headline = authorHeadline(responseText, DEFAULT_CONTEXT_TYPE[finalRoute])

      await updateOfferStatus(offer.id, 'shown', { directness, headline })
      const shownOffer = { ...offer, status: 'shown' as const, directness, headline }

      const thread = await getOrCreateThread(canvas_id, finalRoute)
      const ghost_pair: GhostPair = {
        triggered_by_node_id: node_id,
        context_ghost_id: descriptor.context_node.ghost_id,
        question_ghost_id: descriptor.question_node?.ghost_id ?? null,
        pair_status: 'pending',
      }
      await appendMessage(thread.id, {
        role: 'assistant',
        turn_type: 'ghost_pair',
        content: responseText,
        ghost_pair,
        timestamp: new Date().toISOString(),
      })

      // Derive turn_index by matching the globally-unique context_ghost_id.
      // Append-only writes never shift an existing element's index, so a
      // concurrent append to the same thread can't move ours (race-safe).
      const persisted = await getById(thread.id)
      const turn_index = (persisted?.messages ?? []).findIndex(
        (m) =>
          m.turn_type === 'ghost_pair' &&
          m.ghost_pair.context_ghost_id === descriptor.context_node.ghost_id
      )
      if (turn_index === -1) {
        throw new Error(
          `[pipeline:agent] persist-turn: appended ghost_pair turn not found on thread ${thread.id}`
        )
      }

      return { thread_id: thread.id, turn_index, shownOffer }
    })

    // Isolated from persist-turn above for the same reason: decrementing is a
    // non-idempotent counter mutation, so it gets its own checkpoint.
    await step.run('decrement-deferrals', async () => {
      const active = await getActiveByCanvas(canvas_id)
      let decremented = 0
      for (const insight of active) {
        if (insight.severity === 'temporal_deferral' && insight.turns_remaining !== null) {
          await decrementTurnsRemaining(insight.id)
          decremented++
        }
      }
      if (decremented > 0) {
        logger.info('[pipeline:agent] step:decrement-deferrals decremented', { canvas_id, decremented })
      }
    })

    // Publish the offer's show signal (directness/headline — the Show
    // ruleset's output), THEN `done` LAST. Both run after the turn is
    // durably persisted (previous step), never before.
    await step.run('publish-results', async () => {
      await publishOffer(session_id, shownOffer)
      await publishDone(session_id, {
        thread_id,
        turn_index,
        trigger_node_id: node_id,
        context_ghost_id: descriptor.context_node.ghost_id,
        question_ghost_id: descriptor.question_node?.ghost_id ?? null,
      })
    })

    logger.info('[pipeline:agent] done', {
      canvas_id,
      session_id,
      node_id,
      offer_id: offer.id,
      route: finalRoute,
      duration_ms: Date.now() - startedAt,
    })
  }
)

// ─────────────────────────────────────────────────────────────────────────
// IMPACT PIPELINE — triggered by canvas/intervention.impact, which
// canvas-event.ts fires on node.deleted / edge.deleted (DESIGN §6; matrix
// rows 7-8: trigger=no, show=yes — a delete never spawns a new offer on its
// own, it only checks whether an offer already in flight for this session is
// now stale). Runs the Impact Check (fingerprint compare) and, on a material
// change, warns the offer in place rather than withdrawing it outright.
// ─────────────────────────────────────────────────────────────────────────
export const interventionImpactPipeline = inngest.createFunction(
  { id: 'intervention-impact', triggers: [{ event: 'canvas/intervention.impact' }] },
  async ({ event, step }) => {
    const { canvas_id, session_id, deleted_node_id } = event.data as {
      canvas_id: string
      session_id: string
      deleted_node_id?: string
      deleted_edge_id?: string
    }

    await step.run('warn-affected-offers', async () => {
      const canvas = await getCanvas(canvas_id)
      const inFlight = await getInFlightForSession(session_id)

      for (const offer of inFlight) {
        // Node deletes scope to offers actually anchored to the vanished node.
        // Edge deletes can't be scoped this way (the row — and its endpoints —
        // is already gone by the time this event fires), so they fall back to
        // the coarse fingerprint check across every in-flight offer for the
        // session. Over-warning is safe; under-warning is the risk (§6).
        const anchored = deleted_node_id
          ? offer.trigger_node_id === deleted_node_id || offer.anchor_node_ids.includes(deleted_node_id)
          : true
        if (!anchored) continue

        const verdict = checkImpact(offer.context_fingerprint, canvas.canvas_version.toString())
        if (verdict !== 'material') continue

        const headline = offer.headline ? `${offer.headline} ${IMPACT_WARNING}` : IMPACT_WARNING
        await updateOfferStatus(offer.id, offer.status, { headline })
        await publishOffer(session_id, { ...offer, headline })
        logger.info('[pipeline:impact] offer warned', { offer_id: offer.id, canvas_id, session_id })
      }
    })
  }
)
