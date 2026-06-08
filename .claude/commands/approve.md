---
name: approve
description: Engineer approval gate for a story or task plan produced by /gatekeeper. Sets status to approved or rejected.
---

# Skill: Approve (Plan Approval Gate)

**Only an engineer/developer runs this. It is the handoff point between planning and implementation.**

---

## Usage

```
/approve <feature-name>              → approve the story
/approve <feature-name> task-01      → approve a specific task
/approve <feature-name> --reject "reason"       → reject the story
/approve <feature-name> task-01 --reject "reason"  → reject a specific task
```

---

## Step 1 — Locate the Plan File

- Story: `.ai/features/<feature-name>/story.md`
- Task: `.ai/features/<feature-name>/tasks/<task-id>.md`

If the file does not exist, stop and tell the engineer.

---

## Step 2 — Read and Display the Plan

Print a concise summary of the plan for final confirmation:
- **What** (one sentence)
- **Blast Radius** (components affected)
- **Files to Touch** (exact list)
- **Liquibase Impact** (yes/no + changeset ID)
- **Open Questions** (if any remain unanswered, flag them — approval should not proceed if open questions are unresolved)

---

## Step 3 — Approval or Rejection

### Approving

Update the `status` field in the front matter:
```yaml
status: approved
```

Also record who approved and when by appending below the front matter (if not already present):
```markdown
<!-- approved: YYYY-MM-DD -->
```

Print:
```
✅ Approved: .ai/features/<feature-name>/[story.md | tasks/task-NN.md]

Next step: /implement <feature-name> [task-NN]
```

### Rejecting

Update the `status` field:
```yaml
status: rejected
```

Append the rejection reason:
```markdown
<!-- rejected: YYYY-MM-DD — <reason> -->
```

Print:
```
❌ Rejected: .ai/features/<feature-name>/[story.md | tasks/task-NN.md]
Reason: <reason>

Return to /gatekeeper <feature-name> to revise the plan.
```

---

## Step 4 — Safety Check

Do not approve if **any** of these are true:
- Open Questions section is non-empty (questions must be answered before approval)
- The story/task `status` is already `approved` or `rejected` (idempotency — alert the engineer)
- The file's Liquibase Impact says "Yes" but no changeset ID is assigned

If any safety check fails, state the reason and do not update the file.
