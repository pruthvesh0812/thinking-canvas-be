---
name: gatekeeper
description: Planning gate for Feature-tier tasks. Produces an approved story plan before any code is written.
---

# Skill: Gatekeeper (Feature Planning)

**No code is written during this skill. Output is a plan only. Implementation starts after engineer approval.**

---

## Step 1 — Load Context

1. Read `CLAUDE.md` load map — identify which domain docs apply to this feature
2. Load relevant docs (max 2): pick from `CORE-CONCEPTS.md`, `MESSAGING-STACK.md`, `HELP-CENTER-PLATFORM.md`
3. Read `.ai/memory/learnings.json` — check for known issues in the affected area
4. Scan `src/main/resources/db/changelog/db.changelog-master.xml` for recent changeset IDs (to assign next ID)

---

## Step 1.5 — Check context doc freshness

Before planning, flag any stale docs so the engineer knows to verify them before implementation.

For each context doc likely relevant to this feature (use `CLAUDE.md` load map as a guide):
1. Read its frontmatter: `last-verified` and `stale-after-days`.
2. Calculate days elapsed since `last-verified`.
3. If `elapsed > stale-after-days`: add a `⚠ Stale Context Docs` section to the story with the doc name, days stale, and the `verified-against` files to spot-check.
4. If all docs are within threshold: skip this section entirely.

---

## Step 2 — Determine Story vs Story + Tasks

Apply structural breakdown rules. Create tasks when **any** of these are true:
- Feature touches ≥3 distinct service/component boundaries
- Requires a Liquibase migration AND new business logic (not migration alone)
- Hard sequential dependency exists between implementation steps (B cannot start until A is merged)
- Estimated change >200 lines across multiple unrelated classes

If none apply → implement directly from the story. State "No task breakdown — implement from story."

---

## Step 3 — Produce the Story Plan

Write to `.ai/features/<feature-name>/story.md` (create directory if needed).

Use this template exactly:

```markdown
---
feature: "<feature-name>"
type: story
created: YYYY-MM-DD
status: draft
jira_ticket: "[PLACEHOLDER — add ticket ID when Jira integration is available]"
git_branch: "[PLACEHOLDER — e.g. feature/HC-XXX-short-description]"
pr_url: "[PLACEHOLDER]"
---

## What
[One sentence: what this feature delivers]

## Why
[Business reason or context]

## Blast Radius
[All components, services, tables, queues affected]

## Files to Touch
[Specific file list — be exact]

## Liquibase Impact
Yes / No. If yes:
- Table: [table_name]
- Change: [column/index/constraint]
- Next changeset ID: [DDMMYY-N]

## New RabbitMQ Queues
Yes / No. If yes: [queue name, exchange binding]

## Risks
[Non-obvious risks or side effects]

## Open Questions
[Decisions the engineer must make before implementation can start]

## Test Plan
[What unit tests are required — list by class]

## Known Issues (from learnings.json)
[Any entries from learnings.json relevant to affected area — quote id + title]

## Implementation Context Docs
[Populated by gatekeeper — the exact docs /implement should load for this feature]
- `CODING-STANDARDS.md` — always
- `<doc>` — <reason>

## ⚠ Stale Context Docs
[Only present if staleness check found issues — omit section entirely if all docs are fresh]
- `<doc>` — last verified N days ago (threshold: X). Spot-check: `<verified-against files>`

## Task Breakdown
NONE — implement directly from this story.
OR
Tasks required (reason: [structural rule that triggered]):
- task-01: [scope]
- task-02: [scope]
See tasks/ directory.
```

---

## Step 4 — Produce Task Files (if breakdown required)

For each task, write `.ai/features/<feature-name>/tasks/task-NN.md`:

```markdown
---
feature: "<feature-name>"
type: task
task_id: task-NN
story: ../story.md
created: YYYY-MM-DD
status: draft
---

## Scope
[What this task covers — one specific deliverable]

## Files to Touch
[Specific to this task only]

## Depends On
[task-NN must be complete first — or "none"]

## Definition of Done
[Specific, testable completion criteria]

## Test Plan
[Unit tests for this task specifically]
```

---

## Step 5 — Stop and Report

Output:
```
Story plan written to: .ai/features/<feature-name>/story.md
[If tasks: Task plans written to: .ai/features/<feature-name>/tasks/]

[Only include if learnings.json has entries relevant to this feature — omit entirely if none:]
⚠️  Known issues from previous features:
  - [id] — [gap title]

[Only include if open questions exist — omit entirely if none:]
Open questions requiring engineer decision before approval:
  - [question 1]
  - [question 2]

Ready for engineer review.
Run /approve <feature-name> to approve and unblock implementation.
Run /approve <feature-name> --reject "reason" to send back for revision.
```

**Wait for /approve. Do not write any source code.**
