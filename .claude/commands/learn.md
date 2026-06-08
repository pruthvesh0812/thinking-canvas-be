---
name: learn
description: Developer-invoked documentation feedback loop. Run after an implementation session to surface gaps where the agent had to infer. Engineer decides what becomes a permanent learning.
---

# Skill: Learn (Documentation Feedback Loop)

**This is a developer utility — run it when you want to, not after every feature.**
**It is never triggered automatically. No learning is recorded without engineer confirmation.**

---

## When to Run

Run `/learn` when, during an implementation session, you noticed the agent had to make inferences,
work around missing guidance, or make judgment calls beyond what the docs described.

If the session went smoothly and the docs were sufficient, there may be nothing to learn — that is a valid outcome.

---

## Step 1 — Identify the Session Scope

Look at the current session's work:
- The most recently implemented story or task in `.ai/features/<feature-name>/`
- `decisions.md` for any judgment calls logged during implementation
- The diff of files actually written in this session (`git diff HEAD` or implementation report)

---

## Step 2 — Identify Documentation Gaps

For each place during implementation where you had to **infer, guess, or work around missing guidance**, ask:

> "Is this because the doc is silent, vague, incomplete, or contradictory — not because the engineer made a deliberate decision?"

**Skip entries in `decisions.md`.** Those are engineer judgment calls, not documentation gaps. Do not treat them as learnings.

Signs of a genuine doc gap:
- A coding pattern present in the codebase but not described in `CODING-STANDARDS.md`
- A business rule reverse-engineered from entity fields or existing logic
- A pipeline step not explained in `MESSAGING-STACK.md` or `HELP-CENTER-PLATFORM.md`
- An enum value used with semantics the agent had to guess
- A service method with non-obvious side effects not captured in any doc

**Do not manufacture gaps.** If the docs were sufficient, say so.

---

## Step 3 — Present Gaps to Engineer for Confirmation

Before writing anything, present each candidate gap to the engineer:

```
Documentation gaps found in this session: N

[1] Gap: [one sentence — what guidance was missing]
    Affected doc: .ai/context/<filename>.md — section: [section name]
    Proposed addition: [one sentence — what would be added or corrected]
    Severity: high | medium | low

[2] ...

Which of these should become permanent learnings?
Reply with the numbers to accept (e.g. "1, 3") or "none" or "all".
```

Wait for the engineer's response. Do not write to any file until confirmed.

---

## Step 4 — Apply Confirmed Learnings

For each gap the engineer confirmed:

1. Write the proposed addition directly into the relevant `.ai/context/*.md` file.
   - Be surgical: add to the right section, do not rewrite correct sections.
   - Keep additions concise — one short paragraph or a table row.

2. Update the `last-verified` frontmatter of any doc written to:
   ```
   last-verified: <YYYY-MM-DD>   ← today's date
   verified-against: <keep existing>, <add implementation file if newly referenced>
   ```
   A confirmed learning is evidence the doc was checked — refresh the clock.

3. Append an entry to `.ai/memory/learnings.json`:

```json
{
  "id": "YYYYMMDD-N",
  "feature": "<feature-name>",
  "date": "YYYY-MM-DD",
  "gap_type": "missing | vague | contradictory | undocumented_pattern",
  "gap": "One sentence: what guidance was absent or unclear",
  "doc": ".ai/context/<filename>.md",
  "section": "Section heading where the change was made",
  "proposed_change": "One sentence: what was added or corrected",
  "severity": "high | medium | low",
  "status": "proposed"
}
```

Use the next sequential number for the ID suffix (scan existing entries).

---

## Alternate mode: `/learn --verify <doc-name>`

Actively check whether a context doc is still accurate without needing a recent feature session.

1. Read the doc's `verified-against` file list from its frontmatter.
2. Read each of those files.
3. Compare current code against each rule, pattern, or example in the doc.
4. Report stale items with: what the doc says vs. what the code shows.
5. Edit the doc for each stale item the engineer confirms.
6. Update `last-verified` to today regardless of findings.
7. Do NOT append to `learnings.json` — verify runs are maintenance, not new learnings.

---

## Step 5 — Report

```
/learn complete.

Gaps presented: N
Confirmed by engineer: M
Skipped (engineer declined): N-M

Changes applied:
- .ai/context/<file>.md — [section] — [one-line description]
(repeat per confirmed gap)

learnings.json entries added: M (status: proposed)

[If no gaps were found:]
No documentation gaps identified. The docs were sufficient for this session.
```

**`status: proposed` means the changes are part of this PR and will be reviewed via /code_review's Documentation Changes checklist. The reviewer sets status to `applied` or `rejected` after review.**
