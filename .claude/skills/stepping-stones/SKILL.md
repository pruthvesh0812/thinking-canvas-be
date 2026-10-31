---
name: stepping-stones
description: Walk a flow's real code one function at a time, at the human's pace, so they understand it fully before moving on. Use when the user asks to be walked through code step by step, says "stepping stones", wants to trace a flow to find where a bug really is, wants to look for something to optimize, or just wants to understand how something works at the lowest level. Works across repos (frontend and backend).
---

# Stepping-Stones Walkthrough

The flow is a river. Each function is a stone. Put down ONE stone (or a small
handful, see sizing), let the human read it and stand on it fully, then put
down the next. Never the whole crossing at once.

The output of this skill is understanding, built turn by turn in the
conversation. It is not a document. (The written doc is the `code-alignment`
skill's job.)

---

## Sizing: how many functions per stone

Judge by how much a function actually does, not by line count.

| Size | What it looks like | Shown at once |
|---|---|---|
| Big | The brain of a stage: several branches or steps, the thing that decides something | 1 |
| Medium | One clear job, maybe one branch | 2 |
| Small | A one-liner, getter, guard clause, thin wrapper | 3-4 |

When unsure, round down: treat it as bigger and show fewer.

---

## Before the first stone

1. Trace the flow in the order it really runs, not the order files sit in a
   folder. If a flow doc already exists (`.ai/features/*/alignment.md` or a
   file in `.ai/context/`), reuse its stage names so the two stay consistent
   in the human's head.
2. Debugging walk: pick a direction and say why. Either start where the
   symptom is first noticed and go forward through what should happen next,
   or start where it should land and go backward.
3. Check what is actually running before assuming. Quick facts like "is the
   backend up", "is the job runner up", "which branch is checked out" save
   whole stones of wrong guesses.
4. Give a short table of contents: stone names only, one line each, plus
   which repo each lives in. No explanations yet.
5. If the flow crosses into another repo (for example the backend), say so
   before crossing. If you cannot read that repo in this session, stop and
   ask the human for its path or access. Never reconstruct its code from
   memory.

---

## Each stone

1. Announce it: "Stone N of ~M: `functionName`, the thing that does X."
2. Show the REAL code. Read the file and quote the actual function with its
   `file:line`. Never paraphrase into pseudocode.
3. Explain in plain words: short sentences, everyday language, one idea at a
   time. Say what calls it, what it hands to the next stone, and what it does
   NOT do (the silent paths are where bugs hide).
4. Debugging walk: name the ONE concrete thing to check right here (a log
   line, a Network tab entry, a value). Check it together with real evidence
   (console, network, logs, the job runner's run history, curl) instead of
   guessing what "should" happen.
5. Stop. Wait for the human ("ok", "next", a question, or them spotting the
   bug). Never auto-advance in the same turn.
6. If a question comes up, settle it fully on this stone. Do not carry a loose
   thread forward.

---

## Landing on the far bank

When the last stone is placed: one short paragraph on what they now know, and
one concrete next action (the exact line to change or the exact thing to test
next), not just "now you understand."

---

## Checklist

1. Stones sized by what a function does, not its length.
2. Table of contents first; each stone's content one at a time.
3. Never advanced without the human's go-ahead.
4. Real code with real `file:line`, never pseudocode.
5. Repo crossings announced; access asked for if missing.
6. Plain language throughout.
7. Ends with a concrete next action.
