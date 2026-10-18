---
last-verified: 2026-09-19
verified-against: 02-how-it-works/* · 03-status/* (re-check those before answering capability questions)
stale-after-days: 30
audience: customer support agents (AI or human)
---

# Customer Support Playbook

> **Before answering any "can it…?" question, check `03-status/feature-status.md`.** The product's design is ahead of its code. Never promise a designed-but-unbuilt feature, a timeline, a price, or a privacy guarantee.

## Support principles (the product's philosophy applies to support too)

1. **Explain, don't just fix.** Many "bugs" are the product deliberately holding back. Help the user understand *why* it behaves this way, briefly.
2. **Never promise.** No dates, no "coming soon" commitments, no pricing, no privacy or compliance claims. Say "I'll pass that on" and escalate.
3. **Respect the user's thinking.** Canvases hold sensitive, unfinished thinking. Never ask users to paste canvas content unless it's essential, and treat anything they share as confidential.
4. **Voice:** calm, warm, precise, and brief. Use the product's words (see `01-foundation/glossary.md`). No hype.

---

## FAQ

### About the product
**What is ThinkingCanvas?**
A thinking environment. You map a problem you're working through as connected thoughts around a fixed goal, and an AI offers small, well-timed nudges (a reframe plus a question, or a few ways to name a connection) that you accept, reject, or ignore. It's built to make *your* thinking go further, not to think for you.

**How is it different from ChatGPT?**
Chat gives you answers in a thread. ThinkingCanvas keeps the *structure* of your thinking (what led to what) and the AI works from that structure. Every suggestion ends in a question for you, and nothing joins your canvas unless you click accept.

**Is it a mind-mapping tool?**
Not quite. A mind map shows where you ended up; ThinkingCanvas also records *how you got there*, in order, which is what lets the AI stay one or two steps ahead of you.

### Getting started
**Do I need an account?**
Not to start. You can think straight away. After your first session, you'll be asked to create an account (Google or email) to save your work and open further sessions. Your canvases carry over.

**How do I get the AI to help?** *(the most important answer right now)*
Use the **pens** at the bottom left. Pick one *before* you drag a line between nodes:
- **Question**: draw it between two thoughts when you sense a connection you can't name yet. The AI brings a perspective from another field, plus a question.
- **Relate**: draw it between two existing thoughts to have the AI suggest 2–3 ways to articulate how they're connected.
- **Logical**: an ordinary "this follows from that" link. It doesn't call the AI.
When you finish, click **I'm done**, and the Observer reviews your whole canvas and shares what it noticed.

**Why can't I edit my goal (north star)?**
It's locked on purpose. A fixed goal lets you, and the AI, notice when your thinking drifts away from what you set out to solve. If your question has genuinely changed, start a new canvas for the new question.

### The AI's behaviour
**I wrote a bunch of nodes and the AI didn't say anything. Is it broken?**
Currently the AI responds to the **Question** and **Relate** pens and to **I'm done**, not to writing nodes on their own. Point them to the pens. *(Internal: ambient help from the Expander is built but not connected; known gap #1. Don't promise a date.)*

**I drew a Question/Relate line and nothing appeared.**
1. Was the right pen selected *before* dragging? A Logical line doesn't call the AI.
2. Relate only works between two nodes that **already exist** (not when dragging out to create a new node).
3. Is there already a suggestion pending on that node? There's only one at a time per node. Accept, reject, or remove it first.
4. Were either of the nodes set aside? Set-aside nodes are invisible to the AI.
5. Give it a few seconds; the cross-domain role thinks hard before it answers.
6. Reload the page. If it still fails, escalate with the time and browser (not canvas content).

**The suggestion appeared but stays faint and dashed.**
That's a **ghost**: a pending suggestion. It becomes part of your canvas only if you click **✓ Accept**. You can accept the context part and the question part separately. Ignoring it is fine; it waits and never expires.

**What do the reject reasons do?**
They teach the AI on this canvas. **Too abstract**: it avoids high-level analogies from now on. **Too technical**: it keeps the idea but simplifies. **Skip for now**: it pauses that theme for a few turns.

**The AI seems to avoid certain kinds of ideas now.**
Likely because of earlier "Too abstract" rejections on this canvas, which are lasting. *(Internal: there's no UI to view or undo learned constraints; loophole A6. Escalate if the user is stuck.)*

**Why does the AI give me three options when I draw a Relate line?**
On purpose. One answer would close your thinking; a few options let you choose, or reject them all and name the connection yourself.

**Why does the AI ask me questions instead of answering?**
That's the core of the product: it makes one small move and hands the thinking back to you, so the conclusion is genuinely yours.

**Where did an AI node go?**
It may have been **set aside**. Click **Show set aside (N)** in the footer, then **Restore**. Set-aside nodes are kept, not deleted, but hidden and excluded from the AI's view. If it was **deleted**, it can't be recovered.

**What does "Diverging / Converging" do?**
It tells the system whether you're opening up possibilities or narrowing down. *(Internal: it's saved, but its effect on AI output depends on the unreachable Expander and Stress-Tester, so don't oversell it.)*

### Sessions
**What's a session? Why is "I'm done" greyed out?**
A session is one sitting of thinking on a canvas. "I'm done" unlocks once you've added, edited, or connected something this session.

**What happens when I click "I'm done"?**
Three steps: (1) the Observer reviews the whole canvas and shares what it noticed; (2) you see unresolved threads (unanswered question lines, empty nodes, open contradictions) and choose to carry each forward or discard it; (3) the session closes. Next time you open the canvas, click **Continue thinking** and your carried-forward threads will be waiting.

**The Observer step is taking a while or shows nothing.**
It reads the whole canvas in the background. That can take a bit, and sometimes it has nothing worth saying, which is intended. Nothing is lost if you continue.

**Can I look at an earlier session?**
Yes. From the canvas's landing screen, or **Past sessions** in the threads rail. You'll see the canvas as it was then, read-only.

### Account and billing
**How do I sign up / sign in?** Google, or email (confirm your email, then set a password on the Account page).
**I signed up with email but can't set a password.** You need to confirm your email first (check spam, or use **resend** on the Account page), then set the password.
**I lost my canvases.** If they were created as a **guest** (before signing up) and browser data was cleared or the device changed, they can't be recovered. *(Escalate anyway; be kind. Known risk C5/#6.)* If they were signed up, have them sign in with the same method they used before.
**Why can't I sign out?** Guests can't sign out because they couldn't sign back in and would lose their canvases. Create an account first.
**How much does it cost? How do I upgrade to Pro?** *(Internal: billing isn't live.)* Say: "Paid plans aren't available yet. I'll note your interest." **Never quote prices.**
**Can I delete a canvas?** Not currently. *(Canvases are permanent in the MVP.)*
**Can I export or share a canvas?** Not currently.
**Can my team collaborate on a canvas?** Not currently; it's built for individual thinking.
**Is there a mobile app?** No; it's designed for desktop browsers.

### Privacy and data *(always escalate beyond these lines)*
- "Your canvases are private to your account." *(True under RLS; the API hardening is on a pending merge. Don't elaborate.)*
- For questions about AI providers, training, retention, deletion, or compliance (GDPR, SOC 2, DPA): **don't answer. Escalate.** No approved statement exists yet.

---

## Troubleshooting trees

**"Nothing works / the canvas won't load"**
→ Reload → sign in again (if they have an account) → try another browser → escalate with the time, browser, and whether they're a guest or signed in.

**"Suggestions stopped arriving mid-session"**
→ Reload (the live stream reconnects) → check whether they're on the pens that invoke the AI → check for pending ghosts on those nodes → escalate.

**"I'm redirected to login when opening a canvas"**
→ Expected for guests opening a second session: sign up to continue, and their canvases carry over.

---

## Escalation

Escalate (don't improvise) for: data loss · privacy, security, or compliance questions · billing and pricing · anything suggesting someone else could see their canvas · repeated AI failures after the checks above · requests for features in the "don't claim" list · angry users who feel the AI "wrote their thinking" or feel manipulated (this is a philosophy issue and worth product attention).

Include: time, browser, guest or signed-in, what they did (gesture by gesture), what they expected. **Don't include canvas content** unless the user explicitly offers it and it's necessary.

## Feedback worth routing to product
- "I didn't know how to get the AI to respond" → evidence for killer K1 and loophole A2.
- "It's too much work" / "can it just tell me?" → K2 signal.
- "That suggestion was obvious / wrong / made up" → K3 signal (note the role and context type if visible).
- "I want to change my goal" → loophole A5.
- "I want to share this" → loophole C3.
