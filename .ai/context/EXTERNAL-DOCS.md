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
- **All instantiation via `src/lib/llm.ts`** — never import `@ai-sdk/google` directly (see LLM-LAYER.md)
- **Models in use:**
  - `gemini-2.5-flash-lite` (`models.content()`) — Expander, Stress-Tester, Articulator
  - `gemini-2.5-flash` (`models.fast()`) — Attunement, Orchestrator, Observer, Outer Sub, Directional Summary, Rejection Insights
  - `gemini-embedding-2` — node content embeddings (3072 dimensions)
- **Thinking config:** `models.thinking('high')` = `{ thinkingConfig: { thinkingBudget: 8000 } }`, `models.thinking('low')` = `{ thinkingConfig: { thinkingBudget: 1024 } }`. Passed via `providerOptions: { google: ... }` at call-site (Observer, Outer Sub use `'high'`; Summary, Rejection Insights use `'low'`) — never baked into the model instance.
- **Embedding call:** `client.models.embedContent({ model: 'gemini-embedding-2', content: ... })`

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
- **llms.txt:** https://langfuse.com/llms.txt (sub-files: `llms-docs.txt`, `llms-integrations.txt`, `llms-self-hosting.txt`)
- **Integration:** `@mastra/observability` + `@mastra/langfuse` (`LangfuseExporter`), wired in `src/mastra.ts` — Mastra's auto-instrumentation traces every agent registered there
- **Self-hosted:** point `LANGFUSE_BASE_URL` at the self-hosted instance; `LangfuseExporter()` reads `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY`/`LANGFUSE_BASE_URL` from env with no args needed
- **Self-host stack is NOT in this repo** — Postgres+ClickHouse+Redis+MinIO+web+worker is a separate service deployed independently

---

## Model Quick Reference

| Need | llm.ts helper | Provider |
|---|---|---|
| Content generation (Expander, Articulator, Stress-Tester) | `models.content()` (gemini-2.5-flash-lite) | Google AI |
| Deep reasoning (Observer, Outer Sub) | `models.fast()` + `models.thinking('high')` | Google AI |
| Classification/routing (Attunement, Orchestrator) | `models.fast()` (thinking OFF) | Google AI |
| Structured output (Summary, Rejection Insights) | `models.fast()` + `models.thinking('low')` | Google AI |
| Embeddings | `gemini-embedding-2` | Google AI |

Single provider: one `GOOGLE_AI_API_KEY` for everything.
