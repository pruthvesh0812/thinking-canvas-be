---
last-verified: 2026-06-08
stale-after-days: 30
---

# EXTERNAL-DOCS.md

> **Load this when:** Working with any external library and needing API reference, patterns, or version-specific behaviour.

---

## Strategy

Most libraries have llms.txt files optimized for AI consumption. Fetch these before implementing library-specific code — they prevent hallucinated API signatures.

**How to use:** When working on a task involving an external library, fetch the relevant llms.txt first, then implement.

---

## Library References

### Mastra
- **Docs:** https://mastra.ai/docs
- **llms.txt:** https://mastra.ai/llms.txt
- **llms-full.txt:** https://mastra.ai/llms-full.txt
- **Version:** check `apps/api/package.json`
- **Key sections:** Agents, Tools, Workflows, OpenTelemetry
- **ThinkingCanvas usage:** Agent class, createTool, agent.stream() — bypass agent.memory entirely

### Google AI (Gemini)
- **Docs:** https://ai.google.dev/gemini-api/docs
- **Models in use:**
  - `gemini-3.1-flash-lite` — Expander, Stress-Tester, Articulator, Observer, Outer Sub
  - `gemini-2.5-flash` — Attunement, Orchestrator, Directional Summary, Rejection Insights
  - `gemini-embedding-2` — node content embeddings (3072 dimensions)
- **Thinking config:** `thinkingConfig: { thinkingBudget: -1 }` = high, `{ thinkingBudget: 0 }` = OFF
- **Embedding call:** `client.models.embedContent({ model: 'gemini-embedding-2', content: ... })`
- **Key:** Model string is `gemini-3.1-flash-lite` (not preview, not flash-lite-preview — that was deprecated May 2026)

### Upstash Redis (Pub/Sub)
- **Docs:** https://upstash.com/docs/redis
- **SDK:** @upstash/redis
- **ThinkingCanvas usage:** Pub/Sub ONLY for LLM streaming. NOT for queuing.
- **Channel naming:** `canvas:stream:${sessionId}`
- **Message types:** `{ type: 'spawn' | 'chunk' | 'done', data?: string, node_type?: string }`

### Inngest
- **Docs:** https://www.inngest.com/docs
- **llms.txt:** https://www.inngest.com/llms.txt
- **Key sections:** createFunction, debounce, step.run, inngest.sleep, event sending
- **ThinkingCanvas usage:** debounce by session_id, step.run for agent pipeline steps, inngest.sleep for ghost animation delay

### React Flow (xyflow)
- **Docs:** https://reactflow.dev/docs
- **llms.txt:** https://reactflow.dev/llms.txt
- **Version:** check `apps/web/package.json`
- **Key sections:** Custom nodes, Custom edges, NodeTypes, onConnect, useNodesState

### Supabase
- **Docs:** https://supabase.com/docs
- **llms.txt:** https://supabase.com/docs/llms.txt
- **Key sections:** JS client, Realtime (canvas state only), pgvector, Row Level Security, Auth

### Hono
- **Docs:** https://hono.dev/docs
- **llms.txt:** https://hono.dev/llms.txt
- **Key sections:** zValidator, streamSSE, middleware, app.onError

### Stripe
- **Docs:** https://stripe.com/docs
- **Key:** Billing subscriptions, webhooks (customer.subscription.*)
- **Test cards:** 4242 4242 4242 4242 (success)

### Langfuse
- **Docs:** https://langfuse.com/docs
- **Integration:** Via Mastra OpenTelemetry — `apps/api/mastra.config.ts`

---

## Model Quick Reference

| Need | Model string | Provider |
|---|---|---|
| Content generation (Expander, Articulator, Stress-Tester) | `gemini-3.1-flash-lite` | Google AI |
| Deep reasoning (Observer, Outer Sub) | `gemini-3.1-flash-lite` + thinking:high | Google AI |
| Classification/routing (Attunement, Orchestrator) | `gemini-2.5-flash` + thinking:OFF | Google AI |
| Structured output (Summary, Rejection Insights) | `gemini-2.5-flash` + thinking:low | Google AI |
| Embeddings | `gemini-embedding-2` | Google AI |

Single provider: one `GOOGLE_AI_API_KEY` for everything.
