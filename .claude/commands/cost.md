---
name: cost
description: Show current session cost and per-feature cost snapshots.
---

# Skill: Cost Check

## Step 1 — Read Current Session Cost

Run:
```bash
CURRENT=$(cat ~/.claude/sessions/.current 2>/dev/null)
if [ -n "$CURRENT" ]; then
  cat ~/.claude/sessions/${CURRENT}.json
else
  echo "No session cost data yet. Cost is captured at end of each turn via the Stop hook."
fi
```

Parse the JSON and display:

```
Session: <session_id (first 8 chars)>...
Started: <started_at>
─────────────────────────────────
Total cost:  $X.XXXXXX  [estimated] if estimated=true
Turn count:  N
Last update: <last_updated>

Per-turn breakdown:
  Turn 1  $0.XXXX  HH:MM:SS  [estimated]
  Turn 2  $0.XXXX  HH:MM:SS
  ...
```

If `estimated: true` on the record, add a note:
> Cost shown is estimated from token counts (Sonnet 4.6 pricing: $3/M input, $15/M output, $3.75/M cache-write, $0.30/M cache-read). Actual cost may differ slightly. Check /tmp/claude_cost_debug.log to see raw Stop event fields — if `usage.cost_usd` appears there, update cost_tracker.sh accordingly.

## Step 2 — Show Feature Cost Snapshots (if any)

Run:
```bash
find .claude/features -name "cost.md" 2>/dev/null | sort
```

For each found file, display its contents.

## Step 3 — Report

Output the formatted cost summary. No files are written by this command.
