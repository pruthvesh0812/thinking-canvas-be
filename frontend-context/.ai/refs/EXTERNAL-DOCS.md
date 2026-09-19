---
last-verified: 2026-07-05
stale-after-days: 30
---

# EXTERNAL-DOCS.md

> **Load this when:** Working with any external library and needing API
> reference, patterns, or version-specific behaviour.

---

## Strategy

Most libraries publish llms.txt files optimized for AI consumption. Fetch the
relevant one **before** implementing library-specific code — they prevent
hallucinated API signatures.

---

## Library References

### React Flow (@xyflow/react)
- **Docs:** https://reactflow.dev/docs
- **llms.txt:** https://reactflow.dev/llms.txt
- **Key sections:** Custom nodes, Custom edges, `NodeTypes`/`EdgeTypes`, `onConnect`, `useReactFlow`, controlled flow (`onNodesChange`/`onEdgesChange`)
- **ThinkingCanvas usage:** controlled mode driven by Zustand — React Flow renders, the stores own state. Custom types: `humanNode`, `ghostContext`, `ghostQuestion` + 5 edge components. Register types in module-scope constants.

### Zustand
- **Docs:** https://zustand.docs.pmnd.rs
- **llms.txt:** https://zustand.docs.pmnd.rs/llms.txt
- **Key sections:** TypeScript usage, selectors, `getState`, slices
- **ThinkingCanvas usage:** four stores (canvas/ghost/observer/session). No persist middleware for canvas data. See `STATE-MANAGEMENT.md`.

### Next.js (App Router)
- **Docs:** https://nextjs.org/docs
- **llms.txt:** https://nextjs.org/docs/llms.txt
- **Key sections:** App Router, `middleware.ts`, client vs server components, env vars (`NEXT_PUBLIC_*`)
- **ThinkingCanvas usage:** canvas tree is fully client-side; middleware enforces the session-2+ auth gate.

### Supabase JS
- **Docs:** https://supabase.com/docs
- **llms.txt:** https://supabase.com/docs/llms.txt
- **Key sections:** JS client, Auth (anonymous sign-in, converting anonymous users, `@supabase/ssr`), Row Level Security
- **ThinkingCanvas usage:** direct reads/writes under RLS with the anon key. **Realtime is prohibited** — do not load or reference those docs sections.

### Tailwind CSS
- **Docs:** https://tailwindcss.com/docs
- **ThinkingCanvas usage:** utility classes only; the ghost visual spec (opacity/dash/muted text) is expressed in Tailwind, not custom CSS files.

### Server-Sent Events (EventSource)
- **Docs:** https://developer.mozilla.org/en-US/docs/Web/API/EventSource
- **Key facts:** auto-reconnects on drop; one `onmessage` per stream; messages here are JSON-encoded `RedisMessage` (see `API-CONTRACT.md`). Backend pings every 25s.

### Stripe (frontend surface only)
- **Docs:** https://stripe.com/docs/payments/checkout , https://stripe.com/docs/customer-management
- **ThinkingCanvas usage:** Payment Links / Checkout to start a subscription, Customer Portal link on `/settings`. The webhook and all secret-key work live in the backend repo.
- **Test card:** 4242 4242 4242 4242

---

## The Backend Repo IS a Reference

For any contract question, the backend repo (`thinking-canvas-api`) outranks
every doc above:

| Question | Backend location |
|---|---|
| Exact payload/response shapes | `types/index.ts` (Zod schemas at the bottom) |
| SSE message semantics | `src/streaming/spawn.ts`, `src/streaming/tokens.ts` |
| What each endpoint actually does | `src/routes/*.ts` |
| What fires which agent when | `src/routes/canvas-event.ts` + `src/pipeline/*` |
| DB schema / RLS | `supabase/migrations/*` + `.ai/context/DATABASE-SCHEMA.md` |
