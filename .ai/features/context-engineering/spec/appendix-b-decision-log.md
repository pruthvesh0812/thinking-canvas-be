# Appendix B — Decision Log

What was considered, what was chosen, and why. Read this when a design choice looks odd: the
alternative was probably considered and rejected for the reason given here.

| # | Topic | Decision | Rejected alternative | Why |
|---|---|---|---|---|
| 1 | Model architecture | Use API LLMs + retrieval/structure engineering; log data for possible later fine-tuning | Train a custom canvas LLM / adopt JEPA or world models now | Cost and data requirements; JEPA/world models target physical/video space, not an abstract 2D idea canvas |
| 2 | Retrieval backbone | Graph structure (user edges) as backbone, embeddings as an extra net | Pure embedding similarity | Embeddings miss parents, counterpoints, framing questions (related but dissimilar) |
| 3 | GraphRAG style | Hybrid retrieval over the existing graph, in Postgres | Microsoft-style GraphRAG (LLM entity extraction, community summaries); graph database | The canvas already is a graph; extraction is the expensive part and unnecessary; Postgres suffices at canvas scale |
| 4 | Cluster summaries | **Not doing** | Per-cluster / community summaries | Product owner decision; cost and invalidation complexity |
| 5 | Spatial reasoning | **Not doing**; agents never output coordinates | Spatial-nearby retrieval, LLM placement | Product owner decision; LLMs are poor at coordinates; layout is code |
| 6 | Canvas summary | One rolling, structured, canvas-level summary | No summary at all | Needed for canvas-wide tasks on large canvases; reusable for re-entry |
| 7 | Edges | Users draw **typed** edges with a **labeled reason** | Untyped edges + inferred types | Real types make structural priors reliable; labels carry the user's reasoning |
| 8 | Edge direction | Every edge reads `src <type> dst`; child `—elaborates→` parent | Mixed conventions | One rule for UI, agents, traversal, and validation (an earlier chat draft used parent→child for hierarchy; this spec supersedes it) |
| 9 | Routing input | Classify **task scope** up front (one Jev Choice) | Iterative "is the context sufficient?" loop | A sufficiency check can't see what's missing; scope is answerable from the task alone in one call. Kept as an offline experiment |
| 10 | Minimum context | S1 = focus + 1-hop (never focus alone) | Focus-only tier | Nodes are fragments; tasks like "more examples other than mine" need the children |
| 11 | S2 region | Focus + 1-hop + hop-2 titles + strict semantic + recent titles | Fixed 2-hop full text | Hop 2 explodes; titles suffice to judge; strict semantic avoids cross-branch noise |
| 12 | Beyond hop 2 | Jev-guided, only while under budget | Fixed depth; unbounded expansion | Depth earned by relevance; stops when nothing relevant remains |
| 13 | Budget handling | Size check first; categories small / medium (skeleton) / large; hysteresis | Retrieve first, then check size | Avoids wasted retrieval; skeleton gives graceful degradation between "everything" and "traversal" |
| 14 | Small canvases | Whole canvas for S2/S3, annotated + ordered | Always retrieve | No retrieval beats good retrieval when everything fits |
| 15 | Scoring | `max(structural_prior, cosine × decay)` | `cosine × decay` only | Similarity-only scoring pruned exactly the dissimilar-but-essential nodes structure was meant to find |
| 16 | Budget pressure | Degrade full → title → stub before dropping | Drop low scorers | A title/stub keeps the node visible and fetchable |
| 17 | Safety net | Stubs for unexplored edges + `expand_context` tool | Rely on retrieval being perfect | Makes routing/traversal mistakes recoverable |
| 18 | Agent differences | Per-agent edge policies: follow / mention / skip | Strict per-agent filtering | Filters hide needed nodes (e.g. stress tester needs `supports`); users mislabel edges |
| 19 | Low Jev confidence | Move in the recall-safe direction (deeper scope, mention not skip) | Coarser/broader fallback (as in TypeSafe's SIC cookbook) | Here extra context is cheap and missing context is costly |
| 20 | Agent output | Nodes + typed edges via tool schema; temp ids; edges as sole structure; thread note | Free-text output; parent fields | Lands as canvas structure; one source of truth; validated |
| 21 | Agent edges into user nodes | Stored as `suggested` until accepted | Written as accepted | AI must not silently rewrite the user's structure |
| 22 | Caching | Prompt caching; optional per-edge decision cache; learning policies from logs; aggressive invalidation | Long-lived traversal caches | Recall priority; Jev is cheap, so cache for latency only |
| 23 | Implicit edges | Deferred | Build at write time now | Users draw typed edges; add only if evals show unlinked misses |
| 24 | Evaluation | Offline eval set with labeled needed nodes; whole-canvas baseline | Online A/B on retrieval internals | Cheap, reproducible, and protects users from bad variants |
| 25 | Who walks the graph | Code-side retrieval before the LLM call, plus one `expand_context` escape hatch | Giving the agent LLM a toolset (`get_neighbors`, `path_between`, `find_similar`, `expand_cluster`) to navigate itself | Deterministic, loggable, fewer LLM round trips and less latency. Revisit if `expand_context` logs show agents needing to navigate a lot |
| 26 | Multi-hop query | Hop-by-hop expansion in application code (one "edges touching set" query per hop) | One recursive CTE for 1–2 hops | Jev must decide between hops and the budget must be checked per hop. (An earlier chat walkthrough used a recursive CTE; this spec supersedes it) |
| 27 | Large-canvas overview | Canvas summary + skeleton mode | Zoomable hierarchy (nodes → clusters → regions, each with summaries) | Cluster summaries are a non-goal (#4); skeleton + one summary give the zoomed-out view more cheaply |
| 28 | Learned graph features | Deferred | GNN graph encoder (GraphSAGE / GAT) producing context-aware node vectors for retrieval and clustering | Needs ML infra and real canvases; revisit once logs accumulate (file 11 §11.4) |
| 29 | Native structural understanding | Deferred (long-term) | Injecting graph embeddings into an open LLM as soft tokens (LLaVA-style), fine-tuned on canvas operations | Requires fine-tuning an open model plus thousands of logged canvases; only worth it if structural understanding becomes the core moat |
| 30 | Ranking | Fixed formula (`structural_prior` vs `cosine × decay`) first | Jev relevance rerank from the start | Ship the simple version; Jev rerank stays optional (file 10 §10.9) and is decided by eval |
| 31 | Parallel exploration | Orchestration-level: fan out parallel agent calls, each writing its own branch (product idea, not part of this spec) | One model generating several subgraphs in parallel (diffusion-style) | The single-model version is research territory |
| 32 | Operation history | Never delete canvas operation history; it is future training data | Pruning `canvas_events` for performance | Logging every canvas operation from day one was an explicit goal (data moat, possible fine-tuning). See file 02 |
