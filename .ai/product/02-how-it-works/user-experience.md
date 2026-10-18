---
last-verified: 2026-09-19
verified-against: thinking-canvas-frontend src/ (app routes, components, hooks) · FE SESSION-FLOWS.md · FE CANVAS-RENDERING.md · BE FRONTEND-CONTRACT.md · canvas.html interaction study
stale-after-days: 30
audience: support, marketing, design, product, onboarding — anyone who needs to describe what a user actually sees and does
---

# The User Experience, End to End

> Each step is labelled: ✅ **live** · 🟠 **built but not reachable in the live app** · 🔴 **designed, not built**.
> The labels matter. The product *design* includes more than users can do today.

---

## 1. First visit: no sign-up wall ✅

- The user arrives and is **signed in anonymously and silently** (Supabase anonymous auth). There is no form or friction, and they can think straight away.
- Their data belongs to a real user id from the first second. If they sign up later, the **same id** is kept, so nothing is lost.

## 2. The dashboard (`/`) ✅

- A list of the user's canvases showing title, north-star excerpt, and recent activity.
- **New canvas** button. Canvas options (such as rename).
- An avatar/initial linking to **Account** (`/account`).
- Canvases are permanent. There is **no canvas delete** in the MVP.

## 3. Creating a canvas: capturing the north star (`/canvas/new`) ✅

A single full-screen prompt comes before any canvas appears:

> **"What are you trying to figure out?"**
> *(e.g. "Why is our user retention dropping after week 2?")*
> Optional: "Name this canvas".

- The answer becomes the canvas's **north star** (`original_intent`). **It can never be edited, anywhere, ever.** It stays visible, read-only, in the **North Star header** at the top of the canvas.
- Why it's immutable: drift detection needs a fixed anchor. A changed goal means a new canvas, and that is deliberate.
- The canvas *title* can be renamed later (double-click the title in the footer). The north star can't.

## 4. The canvas (`/canvas/[id]`)

### What's on screen ✅
- **North Star header** (top): the immutable goal.
- **The canvas surface** (React Flow): pan, zoom, and a choice of backdrop (**Paper / Grid / Blackboard**, plus tints Sage / Sky / Blush / Slate / Charcoal). Amber is reserved for *AI presence* and never used as decoration.
- **Pen rack** (bottom left): pick a pen *before* you drag, and the line draws live in that style.
  - **Logical**: "this follows from that". A plain line. Silent; no AI fires.
  - **Question**: "there's a connection I can't name yet". A line with a Q badge. **Immediately invites the Outer Subconscious.**
  - **Relate**: "help me articulate how these two relate". A dashed line with a ◇. Drawn between two existing nodes, it **immediately invites the Articulator.**
- **Footer**: canvas title, **+ New node**, **Show/Hide set aside (N)**, and **"I'm done"** (Session Complete). "I'm done" stays disabled until something has changed this session: *"Nothing to close out yet: add or edit a node, or connect an edge, and this unlocks."*
- **Phase toggle**: **Diverging ⇄ Converging**. The user can always see which mode the AI is in, and the manual choice always wins.
- **Open Threads rail**: collapsed by default to a thin icon and a neutral count. Expands into a flat list: unresolved items (click to pan to the node) and **Past sessions**.

### Thinking on the canvas ✅
- **Create a node** (+ New node, or drag an edge out into empty space) and type the thought. Content saves when you leave the field, not on every keystroke.
- **Connect nodes** with the active pen. Edges have bend handles and a delete button.
- **Select several**: Cmd/Ctrl + drag draws a marquee, and selected nodes move together. Backspace/Delete removes *human* nodes, with one shared confirmation for a group.
- **Positions and sizes persist.** Reopening a canvas restores the exact layout.
- Empty nodes are allowed and meaningful: they represent an unarticulated thought.

### How the AI shows up

**✅ Live today: two explicit invitations**

| User gesture | What appears | Timing |
|---|---|---|
| Draw a **Question** edge | An **Outer Subconscious** ghost pair: a cross-domain leap (pattern / reference / reframe) plus a question | Immediate (seconds) |
| Draw a **Relate** edge between two existing nodes | An **Articulator** ghost offering **2–3 readings** of how the two relate. The relate line stays visible until the articulation has content. | Immediate |

**🟠 Built but not reachable: ambient, well-timed help**

In the full design, pausing after writing makes the AI consider whether anything is worth saying. If it is, a small **"noticed something"** timer appears near your node (default 10s) with **pause** and **now** buttons. When the timer lapses, or you press *now*, one role (normally the **Expander** while diverging or the **Stress-Tester** while converging) generates, and the result arrives as a **glow** on the node. If the node is off-screen, it arrives as a quiet **sidebar card**. Hover to reveal the ghost pair.

**Reality:** the backend pipeline for this exists, but its entry route isn't mounted and the frontend doesn't call it. **Writing nodes on their own produces no AI response today.** The timer UI exists in the frontend only as a demo scenario. See `03-status/known-gaps.md` #1.

**The pulsing "AI is reading" indicator** may suggest a response is coming. Today that response only comes from Question and Relate edges.

### Ghosts: how AI contributions look and behave ✅

| Property | Your node | Ghost (pending AI) |
|---|---|---|
| Opacity | 100% | 40–50% |
| Border | Solid | Dashed |
| Edge to parent | Solid | Dotted |
| Interaction | Edit, connect, delete | **Accept / Reject only** |
| Marker | none | a role icon and its context type (reframe, mirror, …) |

- Ghosts **stream in word by word**. An empty frame appears first (about 1.5s of entrance animation), then the text flows in. The contribution feels alive rather than dropped in.
- **Accept/reject is per node.** You can keep the reframe and drop the question, or the reverse. Controls are always visible.
- **Accept**: the ghost animates into a solid node. It's now yours (`owner: ai`) but keeps an **"AI" pill** permanently, so human and AI contributions are always distinguishable.
- **Reject**: pick a reason: **Too abstract** (never go that abstract again), **Too technical** (keep the essence, simplify), **Skip for now** (pause this theme for about 3 turns). The AI learns from it.
- **Ignore**: nothing happens. Ghosts wait patiently, **with no auto-fade or timeout**.
- **One ghost pair per node** at most, so the canvas never floods.
- **Appreciation** ghosts mark a breakthrough and may come without a question.

### Managing accepted AI nodes ✅
- **Set aside**: hides an accepted AI node and **removes it from everything the AI considers**, as if it weren't on the canvas. Nothing is destroyed. **Show set aside (N)** reveals them, muted, and **Restore** brings one back fully.
- **Delete**: permanently removes an AI node (offered alongside Set aside).
- Edges can't cross the set-aside boundary (set-aside ↔ active); set-aside ↔ set-aside is allowed.
- A **Relate** articulation hangs from two edges. Setting it aside or cutting one leg takes both legs with it.

## 5. Ending a session: "I'm done" → Session Complete ✅

Always **deliberate**: it never happens automatically or on tab close. A three-screen modal follows:

1. **Observer Suggestions.** The Observer reads the **whole canvas** (every session) in the background: *"the Observer is reading your canvas…"*. Its observations then appear as cards, with contradictions labelled as such. This is the Observer's invited voice: it held back all session and speaks now because it was asked.
   - 🔴 The richer design (the Observer highlights anchor nodes; hovering reveals a small observation structure; accept/reject **per connection**) is not built. Today observations are flat cards.
2. **Unresolved Threads.** Computed from the canvas: question edges never answered, empty nodes, contradictions accepted but never followed up. For each one: **Carry forward** or **Discard**.
3. **Session Closed.** Confirmation. The north star is preserved. Carry-forwards are saved. For an anonymous user closing their **first** session, the **sign-up prompt** appears here: *create an account to save and continue.*

## 6. Signing up and returning ✅ *(auth work on feature branches as of 2026-09-19, pending merge)*

- **Sign up**: Google OAuth, or email. Email is two steps: confirm your email first, then set a password from `/account`. The anonymous account is **converted in place** (same id), so every canvas stays.
- **Session 2+ requires an account.** An anonymous user trying to open a second session is sent to `/login`.
- **Account page**: guest / verification-pending / verified states, resend confirmation, set or change password, sign out. Only permanent accounts can sign out, because signing out a guest would orphan their canvases.

## 7. Reopening a canvas ✅

- If a session is still **active**, you go straight back to the live canvas.
- If the canvas has **closed history and nothing active**, you land on **SessionLanding** first: **"Continue thinking"** starts Session N+1, or you can pick a past session to browse.
- On **Continue**, carried-forward threads appear as **pre-loaded items** marked as carried from last session.
- **Time travel (history view)**: browsing a past session shows that session at full presence, earlier sessions dimmed, and **later ones absent** (they didn't exist yet). A calm **history bar** says you're viewing the past, and there are no live controls. It's clearly not a second editable canvas.
- The AI's memory is **per canvas**, so agents in a new session remember everything from earlier sessions.

## 8. Plans and upgrading 🔴

- The design: Free (Expander + Articulator) and Pro (everything). When the best help is Pro-only, the user sees an **upgrade card** anchored to the right spot, rather than weaker help.
- **Today:** there is no checkout, no upgrade prompt, and the settings page is a placeholder. Everyone is effectively on the free plan, but **no live AI path checks the plan**, so everyone gets every role that works (including the Pro-designated Outer Subconscious and Observer). See `accounts-and-plans.md`.

---

## A worked example (the canonical demo scenario)

> North star: *"Why is our user retention dropping after week 2?"*

1. The user writes: **"New users drop off before they see value."**
2. They drag out a Logical edge and write: **"Cut the setup wizard to one screen."**
3. *(Intervention flow, when wired)*: the AI notices something. A 10s timer runs, the Expander generates, and a halo lights the node. Hovering reveals:
   - **Ghost · reframe**: *"Not fewer steps. You're moving the first 'it works' moment earlier."*
   - **Ghost · question**: *"What's the one action where a new user first feels it click?"*
4. The user accepts the reframe, rejects the question as *Skip for now*, and writes their own answer as a new node. **That's the product working:** the AI reframed, and the human did the thinking.
5. Later they draw a **Question** edge from "week-2 usage is solo" to "referral users", sensing something. The **Outer Subconscious** brings in a leap from another domain (for example, how network effects create retention in multiplayer games) and asks a question.
6. They draw a **Relate** edge between two old nodes. The **Articulator** offers three readings of the link, and they pick one.
7. **I'm done.** The Observer notes that the last third of the canvas drifted from *retention* into *activation*, and asks whether that's evolution or drift. Two unanswered question edges are carried forward to next session.
