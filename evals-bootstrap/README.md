# thinking-canvas-evals — Bootstrap Kit

This folder bootstraps a **separate repo** (`thinking-canvas-evals`): an offline
eval harness that replays real thinking trails against candidate versions of
ThinkingCanvas components (agent prompts, serializer, routing) and scores them
— the "Loop A" mechanism: trails from V(n) are the evidence that builds V(n+1).

## Why TypeScript

The single most important design rule of this harness is **never re-implement
production logic**. The backend's `serialize()` is the context builder under
test; a Java/Python re-implementation would drift from production and the evals
would measure the re-implementation, not the product. The backend is TypeScript,
so the eval repo is TypeScript and imports the backend's source directly via a
pinned git submodule. Bonus: same AI SDK (`ai` + `@ai-sdk/google`), same types
(`types/index.ts`), same Langfuse SDK for prompt versions.

## What's in this folder

| File | Purpose |
|---|---|
| `init.sh` | Scaffolds the new repo: package.json, tsconfig, folder structure, `.env.example`, CLI stub, git submodule of the backend |
| `CLAUDE.template.md` | Becomes the new repo's `CLAUDE.md` — agent context: architecture, core concepts, non-negotiables |
| `TASKS.md` | Ordered implementation tasks (0–12), each independently shippable |
| `GUIDELINES.md` | How to *use* the finished tool to improve ThinkingCanvas — workflows, metric discipline, dataset hygiene |

## Quickstart

```bash
# from anywhere
./evals-bootstrap/init.sh ~/code/thinking-canvas-evals
cd ~/code/thinking-canvas-evals
cp .env.example .env         # fill in keys
npm install
(cd vendor/thinking-canvas-be && npm install)
npm run cli -- --help
```

Then work through `TASKS.md` top to bottom. Task 0 lives in
**thinking-canvas-be**, not the eval repo — do it first so production data
carries full provenance from day one.

## The one rule that matters

Never optimize for ghost **acceptance rate** — an agent that learns to be
agreeable is cognitive atrophy, automated. The north-star metric is
**generativity**: did the contribution cause subsequent human thinking on the
trail? See `GUIDELINES.md` § The North-Star Rule.
