---
name: code-alignment
description: Keep the human's mental model in sync with code the AI just wrote. Runs after a successful `git commit` (a hook reminds you): update the feature's plain-language alignment doc, then run a short comprehension check with the human. Use right after any commit that changes logic. Skip commits that only touch docs, comments, formatting, config or lockfiles, and never run it for a commit that only touches alignment docs.
---

# Code Alignment: doc + short session, after every commit

Why: a diff shows what changed, not why it works or which decision to revisit
when a bug lands next month. After each commit, update a plain-language doc
of the feature and check the human actually has it in their head. Over time
the codebase and the human's understanding of it grow together.

---

## Step 0: decide if this commit needs it

Run `git show --stat HEAD` first.

- **Skip** (say one line: "Code-alignment skipped: <reason>") when the commit
  only touches: docs or markdown, comments, formatting, config, lockfiles,
  assets, or `alignment.md` files.
- **Run** when it adds or changes logic, state, API calls, data flow, or UI
  behaviour.

A commit that only updates an alignment doc must never start another
alignment. That would loop.

---

## Step 1: find or create the feature's doc

- One living doc per feature: `.ai/features/<feature-name>/alignment.md`.
- Feature name: match an existing `.ai/features/*` folder to the current
  branch (`git branch --show-current`, e.g. `feature/ghost-streaming-hook-...`
  maps to `ghost-streaming`). If none matches, create a folder named after the
  branch's short title.
- If the repo has no `.ai/features/` folder at all, ask the human once where
  alignment docs should live in this repo, then use that location from then on.
- Doc exists: update it (Step 2). Doc missing: create it with all seven
  sections below.
- Do NOT commit the doc yourself. Leave it as a working-tree change for the
  human to review and include in their next commit.

---

## Step 2: what the doc contains

Same shape every time, in this order. Update only the sections the commit
touched; add a line to the log at the bottom every time.

1. **What problem this solves.** One paragraph, no jargon. What can the human
   do now that they could not before?
2. **The cast.** Table: file, one-line job. Enough to know where to look.
3. **The flow, step by step.** Plain sentences in runtime order. Name every
   decision point and what happens on each branch, including the branches
   where nothing visible happens. Those are where "it's silent" bugs hide.
4. **One diagram.** ASCII is fine. Trace the same flow visually.
5. **Rules worth remembering.** Invariants a future change could break
   (one-per-X limits, ordering, what is optimistic vs confirmed).
6. **Debugging checklist.** "If X seems broken, check these in order." Real
   log lines, real endpoints.
7. **Comprehension check.** 3-6 questions about decisions, not recall:
   - Bad: "What SSE message starts the countdown?"
   - Good: "The user closes the tab mid-countdown. What does the backend do,
     and why does that matter later?"

Then a **Change log** at the very bottom, newest first:
`- <date> <short commit hash>: <one plain sentence on what changed and why>`

Language rule: every sentence should sound like something said out loud to a
teammate. Short sentences, everyday words, one idea at a time. If a sentence
needs a second read, shorten it. Comments you wrote in the commit's code
follow the same rule; fix any that do not.

---

## Step 3: the short session

1. Tell the human the doc is updated, link it, and say in one line what this
   commit changed.
2. Ask 1-2 comprehension questions (not the whole list) that probe THIS
   commit's decisions. One at a time. Wait for each answer in their own words.
3. Where the answer is off, correct it in plain language right there. That
   moment is the actual alignment, more than the doc.
4. Keep it to a few minutes. A tiny logic commit gets one question.

If the human says "skip" or is mid-flow on something else, note it in one
line and stop. Do not nag, and do not block further work.

---

## Checklist

1. Skipped trivial and doc-only commits, with a one-line reason.
2. Doc at `.ai/features/<name>/alignment.md`, all seven sections, one diagram.
3. Change log line added for this commit.
4. Doc left uncommitted for the human.
5. 1-2 decision-focused questions asked, answers corrected in plain words.
6. No sentence needs a second read.
