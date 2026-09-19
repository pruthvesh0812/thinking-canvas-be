---
feature: "billing-and-tiers"
type: story
created: 2026-07-05
status: draft
git_branch: "[set at implementation: feature/billing-and-tiers-<timestamp>]"
---

## What
Tier-aware UI: read the user's subscription, show the UpgradePrompt where a
Pro-only agent would have fired, and the settings page with Stripe
checkout/portal links.

## Why
Free tier ships Expander + Articulator only; Pro unlocks the rest. The backend
enforces this in the Orchestrator — the frontend's job is to make the upgrade
moment visible instead of the product just feeling silently dumber.

## Context to Load
`ARCHITECTURE.md` + `API-CONTRACT.md`

## Depends On
auth

## Blast Radius
Settings page, UpgradePrompt (new), session store (tier).

## Files to Touch
```
CREATE:
  src/components/ui/UpgradePrompt.tsx
MODIFY:
  src/app/settings/page.tsx      (tier display, checkout link, Customer Portal link)
  src/stores/session-store.ts    (tier loaded with canvas meta)
```

## Contract Impact
- Supabase read: `subscriptions` (tier + status). Backend keeps it synced via
  the Stripe webhook — the frontend never talks to Stripe's API directly.
- ⚠ **Known Gap #4:** no backend checkout endpoint. v1 = Stripe Payment Link
  (env-configured URL); revisit when/if the backend adds a checkout route.
- Client tier checks are UI-only (non-negotiable #8) — never suppress a
  canvas-event or hide a ghost based on tier.

## Risks
- When should UpgradePrompt appear? The backend doesn't currently signal
  "agent skipped for tier" — v1 heuristic: free-tier user draws a question
  edge or toggles converging (actions that would fire Pro agents) → show the
  prompt once per session. Flag the missing signal as a candidate backend gap.

## Definition of Done
Free user: question edge → no ghost + UpgradePrompt appears once. Settings
shows current tier; Payment Link completes a test-mode subscription; after the
webhook syncs, tier shows Pro and all agents' ghosts arrive.

## Task Breakdown
NONE — implement directly from this story.
