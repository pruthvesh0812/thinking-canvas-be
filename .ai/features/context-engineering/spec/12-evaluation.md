# 12 — Evaluation

Retrieval quality is measured **offline**, before shipping changes to users. Jev calls are cheap,
so running every variant over the eval set costs very little.

## 12.1 The eval set [DECIDED — build before traversal ships]

30–50 real `(canvas snapshot, focus node, agent, task)` cases, each labeled with the set of
**needed nodes**: the nodes a good answer must take into account.

Labeling:
1. Give a strong LLM the **entire** canvas (no budget limit) + focus + task, and ask which nodes
   the task genuinely needs, with a one-line reason each.
2. A human (product owner) reviews and corrects the list. The human pass matters most for
   "needed but dissimilar" nodes: ancestors, counterpoints, siblings.

Include a mix: small/medium/large canvases; S1/S2/S3 tasks; every agent; canvases with sparse
and dense edges; cases where the needed node is only reachable 3+ hops away; cases where it is
unlinked (only semantic can find it).

Store as fixtures (canvas JSON + labels) in the repo so the harness is reproducible.

## 12.2 Metrics

| Metric | Definition | Target direction |
|---|---|---|
| **Recall@full** | needed nodes loaded at `full` / needed nodes | up |
| **Recall@any** | needed nodes loaded at `full` or `title` / needed nodes | up (primary) |
| **Visible** | needed nodes loaded at any tier incl. stub/skeleton | should be ~100% |
| Context tokens | tokens in the prompt | down, given recall |
| Latency | routing + retrieval wall time (incl. Jev hops) | down |
| `expand_context` rate | runs that needed to fetch more | down |
| Output quality | pairwise judgment of agent output vs whole-canvas baseline | ≥ baseline |
| Keep rate (online) | share of agent nodes the user keeps/accepts | up |

The **whole-canvas run with no budget limit** is the quality baseline for every case.

## 12.3 Experiments to run [DECIDED list]

1. **Upfront scope `Choice` vs iterative sufficiency loop** ("is focus enough? → add 1-hop →
   is it enough? …"). Compare recall, tokens, latency. Expected: scope wins on recall for
   tasks needing unseen context; confirm.
2. **Whole canvas vs skeleton vs traversal** on medium and large canvases. Does traversal lose
   anything the skeleton keeps? Where exactly do the budget thresholds belong?
3. **Fixed 2-hop vs Jev-guided depth** beyond hop 2.
4. **Recall-bias thresholds** in `effectiveLevel` (file 06 §6.6): sweep and plot recall vs tokens.
5. **Agent policies**: default buckets vs alternatives per agent.
6. **Semantic seeds on/off** for S2 and S3, and the similarity floor.
7. **Scope thresholds**: Jev confidence cutoff for deepening.
8. *(Later)* Jev verification cascade on summaries and synthesizer output (file 10 §10.8).

Ship one variant per decision; do not run A/B variants on users for retrieval internals.

## 12.4 Online signals (from production logs)

- `agent_runs.outcome`: kept / edited / deleted nodes; accepted / rejected suggested edges.
- `expand_context_calls` frequency by preset, scope, strategy, agent.
- Routing distribution: how often each scope/category/strategy fires.
- Jev latency per use, and fallback frequency.

Review weekly at first. Misses tell you exactly which edge types, directions, or thresholds to
loosen (file 11 §11.4).
