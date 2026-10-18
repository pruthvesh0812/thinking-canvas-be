---
last-verified: 2026-09-19
verified-against: BE src/lib/tier.ts, src/routes/stripe.ts, src/lib/auth.ts, pipelines (no tier checks outside the unmounted intervention pipeline) · FE auth story (done), billing-and-tiers story (draft), src/app/settings/page.tsx (stub)
stale-after-days: 30
audience: support, marketing, sales, product, pricing work
---

# Accounts & Plans

## Accounts: anonymous first ✅ *(auth commits on feature branches, pending merge as of 2026-09-19)*

| Stage | What happens |
|---|---|
| **First visit** | Silent anonymous sign-in. Full canvas access and no sign-up form. Data is tied to a real user ID from the start. |
| **First Session Complete** | Screen 3 shows the **sign-up prompt**: *create an account to save and continue.* This appears only for anonymous users closing a canvas's first session. |
| **Converting** | **Google** (one click) or **email**. Email takes two steps: confirm the address, then set a password on `/account` (Supabase won't set a password on an unverified anonymous user). The anonymous account is **converted in place**, keeping the same user ID and every canvas. |
| **Session 2 and later** | Requires a permanent account. Anonymous users are redirected to `/login` (enforced by `src/proxy.ts` on `/canvas/*`). |
| **Account page** (`/account`) | Guest / verification-pending / verified state · resend confirmation · set or change password · sign out. |
| **Sign out** | Permanent accounts only. Signing out a guest would orphan their canvases because they couldn't sign back in. Sign-out is local to this browser. |

**Why anonymous first:** the value of ThinkingCanvas is only felt *inside* a thinking session. Asking for sign-up before the first "click" moment costs users before they've seen the point. The gate sits right after the user has experienced a whole session.

**Support implications**
- A guest who clears browser storage or switches device **loses access** to guest canvases. There is no recovery. Encourage sign-up early for anything valuable.
- Google OAuth needs provider configuration in the Supabase dashboard (client ID/secret, redirect `<origin>/auth/callback`). It's environment setup, not code.

---

## Plans (designed pricing)

| Plan | Price | AI roles | Extras |
|---|---|---|---|
| **Free** | $0 | **Expander + Articulator** | — |
| **Pro** | **$19/month** | All 5: Expander, Stress-Tester, Observer, Outer Subconscious, Articulator | **Rejection Insights** learning, **Session Complete** Observer learnings |
| **Power** | **$39/month** (v1.5) | All of Pro | **Cognitive profile** (learns *how* you think, after 3+ sessions). Not built. |

### The logic of the split
- **Free gets the "diverge" experience**: expanding ideas and articulating connections. That's enough to feel the product.
- **Pro gets depth**: stress-testing (converging), the Observer's bird's-eye view and drift detection, the cross-domain Outer Subconscious, and the learning loop.
- **Upgrade, never substitute:** when a free user's best next move is a Pro role, the design shows an **upgrade card at that spot**, not a weaker suggestion. The upgrade prompt appears at the exact moment of need.

### Enforcement design
- **Server-side only.** The frontend reads `subscriptions` just to decide which UI to show. A missing row or non-active status counts as **free**.
- Stripe → `POST /api/stripe/webhook` → `subscriptions` (price ID → tier via `STRIPE_PRICE_PRO` / `STRIPE_PRICE_POWER` env vars; `active`/`trialing` → active). The subscription needs `metadata.user_id`.

---

## ⚠️ Reality today (do not promise otherwise)

| Area | State |
|---|---|
| **Buying a plan** | 🔴 **Not possible.** No checkout endpoint, no payment link, and `/settings` is a placeholder ("wired in the billing story"). |
| **Upgrade prompt** | 🔴 Not built in the frontend. The backend's tier-locked upgrade offer is on the unmounted intervention path. |
| **Plan enforcement** | 🔴 **Effectively none.** The only tier check is inside the unreachable intervention pipeline. Every live path (Outer Subconscious via Question edge, Articulator via Relate edge, Observer at Session Complete, Rejection Insights) runs for **everyone**. |
| **Net effect** | Every user is "free" but gets several Pro-designated capabilities, while the free headliner (the Expander) doesn't fire. |

When billing ships, turning enforcement on will **take capabilities away** from existing users (Outer Subconscious, Observer, Rejection Insights). Plan grandfathering or communication before that change. See `05-risks/loopholes.md`.

---

## Pricing considerations (open questions for pricing work)

- **Cost structure:** content roles run on the cheapest Gemini model. The judge, Observer, and Outer Subconscious use Flash with high thinking, which is the expensive part. The intervention model's lazy generation (nothing generated until the timer resolves) is the main cost control. Each node save also costs one summary call and one embedding.
- **Value metric:** the value is *quality of thinking*, not output volume, so per-suggestion or credit pricing would contradict the product ("more suggestions" isn't more value). Flat subscriptions fit the philosophy.
- **Comparable price points:** $19 sits alongside individual AI tool subscriptions (typical $10–$25/month). The risk is that users compare it to a general chatbot subscription they already pay for (see `05-risks/killers.md`).
- **Teams / multiplayer** pricing doesn't exist; multiplayer is an open future dimension.
