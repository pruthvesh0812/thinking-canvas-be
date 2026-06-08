#!/usr/bin/env bash
# Stop hook — cost_tracker.sh
# Runs once per assistant turn (Stop event) to accumulate session cost.
# Writes cumulative + per-turn data to ~/.claude/sessions/<session_id>.json
# Writes current session_id to ~/.claude/sessions/.current for /cost lookups.
# Always exits 0 — must never block execution.

set -uo pipefail

INPUT=$(cat)

python3 - "$INPUT" <<'PYEOF'
import sys, json, os, time, tempfile

raw = sys.argv[1] if len(sys.argv) > 1 else ""

sessions_dir = os.path.expanduser("~/.claude/sessions")
os.makedirs(sessions_dir, exist_ok=True)

# ── Debug: log payload keys on first 5 turns (helps diagnose missing fields) ──
debug_log = "/tmp/claude_cost_debug.log"
try:
    data_for_debug = json.loads(raw) if raw else {}
    def extract_keys(d, prefix=""):
        keys = []
        if isinstance(d, dict):
            for k, v in d.items():
                keys.append(f"{prefix}{k}")
                keys.extend(extract_keys(v, f"{prefix}{k}."))
        return keys
    with open(debug_log, "a") as f:
        f.write(f"\n[{time.strftime('%Y-%m-%dT%H:%M:%SZ')}] keys={extract_keys(data_for_debug)}\n")
except Exception:
    pass

# ── Parse payload ──────────────────────────────────────────────────────────────
try:
    data = json.loads(raw)
except Exception:
    sys.exit(0)

session_id = data.get("session_id", "unknown")
if session_id == "unknown":
    sys.exit(0)

# ── Extract cost — try every known field path ──────────────────────────────────
cost_usd = None
estimated = False

# Path 1: Stop event — usage.cost_usd
cost_usd = cost_usd or (data.get("usage") or {}).get("cost_usd")

# Path 2: Stop event — message.usage.cost_usd (Claude Code ≥2.x)
if not cost_usd:
    cost_usd = ((data.get("message") or {}).get("usage") or {}).get("cost_usd")

# Path 3: top-level cost_usd
if not cost_usd:
    cost_usd = data.get("cost_usd")

# Path 4: estimate from token counts (Claude Sonnet 4.6 public pricing)
if not cost_usd:
    usage = (data.get("usage") or
             (data.get("message") or {}).get("usage") or {})
    input_tok  = int(usage.get("input_tokens", 0))
    output_tok = int(usage.get("output_tokens", 0))
    cache_write = int(usage.get("cache_creation_input_tokens", 0))
    cache_read  = int(usage.get("cache_read_input_tokens", 0))
    if input_tok or output_tok:
        cost_usd = round(
            (input_tok  * 3.00 +
             output_tok * 15.00 +
             cache_write * 3.75 +
             cache_read  * 0.30) / 1_000_000,
            6
        )
        estimated = True

if not cost_usd:
    sys.exit(0)

cost_usd = float(cost_usd)

# ── Read existing session record ───────────────────────────────────────────────
cost_file = os.path.join(sessions_dir, f"{session_id}.json")
existing = {}
if os.path.exists(cost_file):
    try:
        with open(cost_file, "r") as f:
            content = f.read().strip()
            if content:
                existing = json.loads(content)
                # Don't overwrite Claude-internal session metadata files (pid-named)
                if "pid" in existing or "procStart" in existing:
                    existing = {}
    except Exception:
        existing = {}

turns = existing.get("turns", [])
turn_num = len(turns) + 1
turns.append({
    "turn": turn_num,
    "cost_usd": round(cost_usd, 6),
    "estimated": estimated,
    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
})

record = {
    "session_id":   session_id,
    "started_at":   existing.get("started_at", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())),
    "cost_usd":     round(float(existing.get("cost_usd", 0)) + cost_usd, 6),
    "turn_count":   turn_num,
    "estimated":    estimated or existing.get("estimated", False),
    "last_updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "turns":        turns,
}

# ── Atomic write ───────────────────────────────────────────────────────────────
tmp_fd, tmp_path = tempfile.mkstemp(dir=sessions_dir)
try:
    with os.fdopen(tmp_fd, "w") as f:
        json.dump(record, f, indent=2)
    os.replace(tmp_path, cost_file)
except Exception:
    try:
        os.unlink(tmp_path)
    except Exception:
        pass
    sys.exit(0)

# ── Write .current pointer so /cost can find this session ─────────────────────
current_file = os.path.join(sessions_dir, ".current")
try:
    with open(current_file, "w") as f:
        f.write(session_id)
except Exception:
    pass

sys.exit(0)
PYEOF

exit 0
