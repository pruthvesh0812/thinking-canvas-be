---
name: implement
description: Execute an approved story or task plan. Run only after /approve has set status to approved.
---

# Skill: Implement Approved Plan

**Pre-condition: the story.md or task-NN.md must have `status: approved` (set by /approve). Do not proceed if status is draft or rejected.**

---

## Step 1 — Identify and Validate the Plan

1. Locate `.ai/features/<feature-name>/story.md` or `tasks/task-NN.md`
   - If a task ID is supplied (e.g. `/implement <feature-name> task-01`), load that task file only
   - Otherwise load `story.md` and check the Task Breakdown section
   - If tasks exist and none is specified, list pending tasks and ask the engineer which to start
2. Read the `status` field. If it is not `approved`, stop:
   ```
   Cannot implement — status is "<current status>".
   Run /approve <feature-name> [task-NN] first.
   ```
3. Confirm coding standards apply: every file written must follow `.ai/context/CODING-STANDARDS.md` regardless of how small the change is.

---

## Step 2 — Load Context

Based on the plan's **Blast Radius** and **Files to Touch**, load from the CLAUDE.md doc load map:
- Always load `CODING-STANDARDS.md`
- Load at most one flow doc: `MESSAGING-STACK.md` or `HELP-CENTER-PLATFORM.md`
- Load `CORE-CONCEPTS.md` only if entity/model changes are in scope

Do not load more than 3 context docs.

---

## Step 2.5 — Cost Tracking Opt-in (significant tasks only)

Assess the task scope from the plan:
- **Significant** if any of these are true: ≥5 files to touch, Liquibase migration included, multiple tasks in the breakdown, blast radius spans ≥3 service boundaries.
- **Not significant** (Quick-tier): ≤3 files, no migration, single boundary.

If **significant**, ask the engineer **once** before writing any code:

> "This task touches [N files / includes a Liquibase migration / spans X boundaries]. Would you like a session cost snapshot included in the implementation report? (yes / no)"

- If **yes**: at Step 6.5 (after updating plan status), read `~/.claude/sessions/.current` → `~/.claude/sessions/<id>.json`, append to `.ai/features/<feature>/cost.md`, and include `Session cost: $X.XX (N turns)` in the Step 7 report.
- If **no** (or task is not significant): skip cost tracking entirely. Do not ask again.

---

## Step 3 — Implement

Follow the plan exactly. Do not add scope not listed in **Files to Touch**.

Enforce every rule in `CODING-STANDARDS.md`:
- Controller → Service interface → ServiceImpl → Repository layering
- `[ClassName.methodName] description. key=[value]` log format
- Liquibase changeset for every schema change (use the Next changeset ID from the plan)
- `ContextUtil.setContext()` / `clearContext()` in finally blocks wherever thread-local context is set
- RabbitMQ queue declaration in RabbitMQConfig if a new queue is added

For each file written or modified, note it in a local list.

---

## Step 4 — Compile First, Then Test

Run in order:

```bash
./gradlew compileJava
```

If compilation fails, stop immediately. Report the error to the engineer — do not proceed to tests or fixes without confirmation:
```
Compilation failed. Errors:
[paste compiler output]

Do you want me to fix these compilation errors before continuing?
Awaiting your confirmation.
```

Once compilation passes:
```bash
./gradlew test --tests "com.turtlemint.helpcenter.*"
```

If tests fail:
```
Tests failed. Failures:
[paste failing test names and error summaries]

Before I make any fixes, here is what I would change:
[describe the proposed fix — class, method, what changes]

Do you approve these fixes? Confirm to proceed, or tell me what you'd like instead.
```

Only make code changes to address test failures after explicit engineer confirmation. Re-run tests after each approved fix.

---

## Step 5 — Log Decisions

If you deviated from the plan or made a judgment call not covered by the story/task, append to `.ai/features/<feature-name>/decisions.md`:

```markdown
## [YYYY-MM-DD] [ClassName or topic]
**Decision:** [what was decided]
**Reason:** [why — what constraint or gap forced this]
**Alternative considered:** [if any]
```

Create the file if it does not exist.

---

## Step 6 — Update Plan Status

In the implemented story.md or task-NN.md, update the front matter:
```yaml
status: implemented
```

---

## Step 7 — Report

```
Implementation complete for: <feature-name> [story | task-NN]

Files written/modified:
- [file list]

Compile: PASSED
Tests: PASSED | FAILED (see details above)

Decisions logged: [N entries in decisions.md | none]

Implementation is ready for engineer review.
To surface any documentation gaps from this session: /learn
To review before raising PR: /code_review
```

Both `/learn` and `/code_review` are optional — run them if you need them.
