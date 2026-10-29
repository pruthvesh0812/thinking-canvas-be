# Prompt preview (dev tool)

See **exactly** what an agent would read, plus what each prompt layer costs in tokens, and re-see it
within a second or two after an edit. Read-only: no model calls, no database writes. Not a product feature.

It runs the real `retrieveS1` and the real `assemblePrompt`, so hub guard, ancestors, set-aside nodes and
note visibility all behave exactly like a real run.

## Run it

```bash
npm run prompt:preview -- pricing-canvas                       # one run, fixture scripts/fixtures/pricing-canvas.json
npm run prompt:watch   -- pricing-canvas                       # re-runs when the fixture or anything in src/context/ changes
npm run prompt:preview -- pricing-canvas --layers task,focus   # one-off layer order / subset
npm run prompt:preview -- pricing-canvas --json                # machine-readable
npm run prompt:preview -- pricing-canvas --no-color            # plain text (also automatic when piped)
npm run prompt:preview -- pricing-canvas --verbose             # also show the retrieval logger lines (muted by default)
```

### A real canvas (read-only)

```bash
npm run prompt:preview -- --canvas <canvas_id> --focus <node_uuid>[,<uuid>] [--agent expander] [--source-node | --entry <note_id>]
```

Loads real data from Supabase through the same `createDbSource` the agent run will use, builds the thread memory from the
canvas's real agent threads and loads the real NEGATIVE CONSTRAINTS block (`buildRejectionBlock`).

- `--agent` (default `expander`) decides which constraints apply and which default task is used.
- `--source-node`: the (first) focus node's own text is the request. `--entry <id>`: the text of that context entry is the
  request (it must be on this canvas, not deleted, and linked). Neither flag = the agent's default task.
- Needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (the script loads `.env` itself, only in this mode; it never prints them).
- **Read-only:** it only runs selects. Nothing is written, no model is called.
- Not combinable with a fixture name. Fixture mode needs no `.env` at all.
- This replaces the old `scripts/inspect-context.ts` / `npm run inspect:context`, which was **removed** (it imported
  functions of the old serializer that no longer exist).

A bare name means `scripts/fixtures/<name>.json`; anything with a `/` or ending in `.json` is read as a path.

Output: the prompt exactly as the model receives it, a table of estimated tokens per layer and the total
(~4 characters per token, see `src/context/tokens.ts`), and the nodes shown with tier and reason.
Errors (bad fixture, no valid focus node, unknown layer) print as `ERROR: ...` and exit with code 1.

`--layers` and `--json` etc. only change this tool's output. Production never passes a layer override.

## Fixture format

Human names, not UUIDs: a node's id is its label (`n2`), and the number is its `seq`.

```jsonc
{
  "canvas": { "title": "...", "goal": "..." },
  "agent": "expander",                      // expander | stress_tester | general | observer
  "focus": ["n2"],                          // one or more nodes
  "task": {
    "text": "@expander what else?",         // null = the agent's default task
    "sourceType": "node",                   // "node" | "context_entry"
    "sourceNode": "n2"                      // required when sourceType is "node"
  },
  "nodes": [
    { "id": "n2", "text": "...", "summary": "...", "setAside": false }   // list order = creation order (newest last)
  ],
  "edges": [ { "from": "n1", "to": "n2", "label": "because" } ],          // from = parent, to = child
  "notes": [
    { "on": "n2", "text": "..." },                // a note on a node
    { "on": "edge:n4>n2", "text": "..." },        // a note on an edge (from>to)
    { "on": "canvas", "text": "..." },            // a note on the whole canvas
    { "on": "n2", "text": "...", "invoking": true },  // the note that invoked the agent (left out of its node)
    { "on": "n2", "text": "...", "deleted": true }    // deleted notes must never show up
  ],
  "threadMemory": ["expander proposed \"x\" (rejected)"],   // lines, as buildThreadMemory would produce
  "constraints": "NEGATIVE CONSTRAINTS ..."                  // a raw block, '' = none
}
```

Validation reports every mistake at once (unknown node in `focus`/`edges`/`notes`, bad id, missing `sourceNode`...).
The loader is `src/context/__fixtures__/load-fixture.ts`; it reuses the test builders in
`src/context/__fixtures__/in-memory-source.ts` (same builders and in-memory source the unit tests use).

## Change the layer order / add a layer

Everything lives in `src/context/assemble.ts`.

- **Reorder:** edit `LAYER_ORDER`. One line. (Empty layers are skipped automatically.)
- **Add a layer:** add a renderer to `LAYER_RENDERERS` (return `''` when it has nothing to say) and add its name to
  `LAYER_ORDER`. The token table and `--layers` pick it up on their own, because both read `LAYER_ORDER`.
- The default output is locked by `src/context/assemble-snapshot.test.ts`; if you change the default order or a
  renderer on purpose, update that snapshot (`npx vitest run -u src/context/assemble-snapshot.test.ts`) and check the diff.

## Files

| File | Role |
|---|---|
| `scripts/prompt-preview.ts` | The CLI (arguments, printing). Prints to stdout directly: a report-printing script is the exception to the `logger` rule. |
| `scripts/lib/real-canvas.ts` | Real-canvas mode: loads a canvas from Supabase (read-only) into the same inputs a fixture gives. DB access is injected, so it is unit-tested with fakes. |
| `scripts/fixtures/*.json` | Example canvases. |
| `src/context/__fixtures__/load-fixture.ts` | JSON fixture -> the shapes the real code uses. |
| `src/context/__fixtures__/run-preview.ts` | Real `retrieveS1` + real `assemblePrompt`, shared by the CLI and tests. |
| `src/context/__fixtures__/in-memory-source.ts` | Builders + in-memory data source (no vitest import, so the CLI can use it). |
| `src/context/db-source.ts` | The real Supabase-backed source (kept apart so retrieval runs without a DB). |
