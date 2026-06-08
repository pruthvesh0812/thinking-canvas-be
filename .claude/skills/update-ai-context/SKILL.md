---
name: update-ai-context
description: Updates AI context documentation files after significant architectural changes. Trigger when the user says "update ai context", or after adopting a new external service/library, replacing or removing an existing service, creating or materially changing a DB table, adding a new agent or changing an agent's role/model, changing architecture topology, modifying a streaming or sync mechanism, adding a new design pattern, adding or removing a non-negotiable rule, changing a product philosophy or design decision, adding a new environment variable that gates behaviour, or restructuring an Inngest pipeline. Do NOT trigger for new functions, variables, bug fixes, refactors, new tests, formatting changes, or comments.
---

# Update AI Context

Updates the AI context documentation files after significant architectural or design changes.

---

## When to Run

**Run after:**
- New external service or library adopted (Redis KV, new model provider, etc.)
- Existing service replaced or removed
- New DB table created, or existing table's purpose/structure materially changed
- New agent added, or agent's role/model fundamentally changed
- Architecture topology changed (new service in the data flow)
- Streaming or sync mechanism changed
- New design pattern adopted that other agents need to follow
- Non-negotiable rule added or removed
- Philosophy or product design decision changed
- New environment variable added (especially one that gates behaviour)
- Inngest pipeline restructured (not just a new step — a structural change)

**Do NOT run after:**
- New function or variable
- Bug fix (unless it reveals an architectural correction)
- Refactor that doesn't change what the system does
- New test, formatting change, or comment

---

## What to Write

Document **WHAT changed and WHY** — not how it was implemented. The agent reading the context file can look at the actual code to see how something works. The context file answers:
- What does this component/decision do in the system?
- Why was it introduced or changed?
- What does it replace or depend on?
- What should never be done as a result?

Reference the code file instead of reproducing code:
```markdown
<!-- Good -->
Agent threads are canvas-scoped (not session-scoped) so thinking accumulates
across sessions. See `src/db/threads.ts` for the query pattern.

<!-- Avoid -->
const thread = await supabase.from('agent_threads').select('*')...
```

---

## Update Existing File vs. Create New File

**Update an existing file** when the change adds to or corrects something already documented there. A new env var goes in ARCHITECTURE.md. A changed non-negotiable goes in CODING-STANDARDS.md.

**Create a new dedicated file** when the component is significant enough to be loaded independently for specific tasks, and adding it to an existing file would dominate that file. Examples:
- A new agent with its own pipeline, model, and constraints
- A new major flow (e.g., Session Complete, Multi-Canvas model)
- A new streaming/sync mechanism replacing an old one

When creating a new file:
1. Add it to the Context Load Table in CLAUDE.md
2. Add a one-line "See Also" reference from the most relevant existing file
3. Note `referenced-from` in the new file's frontmatter

---

## File Map

| What changed | Primary file | Also check |
|---|---|---|
| New/changed service or library | ARCHITECTURE.md | EXTERNAL-DOCS.md |
| DB table added or changed | ARCHITECTURE.md | CODING-STANDARDS.md |
| Agent changed | AGENT-PIPELINE.md | CORE-CONCEPTS.md |
| Streaming/sync changed | CANVAS-SYNC.md | AGENT-PIPELINE.md |
| New non-negotiable or prohibition | CODING-STANDARDS.md | CLAUDE.md |
| Philosophy/design decision | CORE-CONCEPTS.md | — |
| New env var | ARCHITECTURE.md | — |
| Architecture topology changed | ARCHITECTURE.md | CLAUDE.md |
| New dedicated component | New file | CLAUDE.md + nearest related file |

---

## Steps

1. **Identify affected files** using the map above.

2. **Write the update:**
   - One or two sentences on what and why
   - Reference the code file for implementation detail
   - Update or add a table row, a prohibition, or a topology entry
   - Keep it short — if it needs more than 10–15 lines, it probably warrants a dedicated file

3. **Update the frontmatter date:**
   ```markdown
   last-verified: YYYY-MM-DD
   verified-against: [brief description of what prompted this]
   ```

4. **If a new dedicated file was created:**
   - Add to Context Load Table in CLAUDE.md
   - Add "See Also" in the nearest related existing file

---

## Template for New Dedicated Files

```markdown
---
last-verified: YYYY-MM-DD
verified-against: [what prompted this]
stale-after-days: 30
referenced-from: AGENT-PIPELINE.md, ARCHITECTURE.md
---

# [COMPONENT-NAME].md

> **Load this when:** [one sentence on when to load this]

---

## What It Is and Why

[2–3 sentences: what does this component do in the system, why does it exist,
what problem does it solve or what did it replace]

---

## How It Fits In

[Where it sits in the architecture — what it reads from, what it writes to,
what triggers it, what it triggers. Reference code files rather than reproducing code.]

---

## Key Constraints

[The non-obvious rules that apply to this component — what must always happen,
what must never happen. These are the things an agent might get wrong without this file.]
```

---

## Checklist Before Finishing

- [ ] Content describes WHAT and WHY — not HOW (code does that)
- [ ] Code files referenced instead of code reproduced
- [ ] `last-verified` date updated on every touched file
- [ ] New file (if any) added to CLAUDE.md Context Load Table
- [ ] New file (if any) referenced with "See Also" from nearest related file
- [ ] No file is now bloated — split if it exceeded ~200 lines