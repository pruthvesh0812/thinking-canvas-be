#!/usr/bin/env bash
# PreToolUse hook — guardrail_check.sh
# Runs before every Bash tool call.
# Applies deny patterns not expressible in settings.json and enforces session cost limits.
# Exit 0  → allow (or after printing ask/deny JSON to stdout)
# The hook communicates via JSON on stdout: {"permissionDecision": "allow|deny|ask", "message": "..."}

set -euo pipefail

# Read the full hook input from stdin
INPUT=$(cat)

# Extract session_id and command using python3 (always available in the Claude Code runtime)
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_id','unknown'))" 2>/dev/null || echo "unknown")
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null || echo "")

# ── DENY PATTERNS ────────────────────────────────────────────────────────────
# Patterns not expressible in settings.json deny list (regex-based checks)

deny_match() {
  local pattern="$1"
  local reason="$2"
  if echo "$COMMAND" | grep -qE "$pattern"; then
    echo "{\"permissionDecision\": \"deny\", \"message\": \"[guardrail] Blocked: $reason\"}"
    exit 0
  fi
}

# Credential and secret exposure
deny_match 'echo\s+\$[A-Z_]*(KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL|API_KEY)[A-Z_]*' \
  "echoing secret environment variables is not allowed"

deny_match '(grep|rg)\s+.*(KEY|TOKEN|SECRET|PASSWORD)\s+.*\.env' \
  "grepping credential files is not allowed"

deny_match 'curl\s+[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' \
  "direct IP curl (potential exfiltration) is not allowed"

deny_match '\bhistory\b' \
  "reading shell history is not allowed"

deny_match ':\(\)\{.*\|.*&\}' \
  "fork bomb pattern detected"

deny_match 'find\s+.*-delete' \
  "find -delete is not allowed; use rm on specific paths instead"

deny_match 'env\s*\|\s*grep' \
  "env|grep (credential enumeration) is not allowed"

deny_match '(cat|less|more|head|tail)\s+.*\.env' \
  "reading .env files is not allowed"

deny_match 'cat\s+~/(\.aws|\.ssh|\.gnupg)/' \
  "reading credential directories is not allowed"

# Gradle-specific dangerous operations
deny_match './gradlew\s+.*--refresh-dependencies.*--write-locks' \
  "refreshing and writing dependency locks simultaneously is not allowed"

deny_match 'liquibase\s+drop' \
  "liquibase drop commands are not allowed"

# ── ASK PATTERNS ─────────────────────────────────────────────────────────────

ask_match() {
  local pattern="$1"
  local reason="$2"
  if echo "$COMMAND" | grep -qE "$pattern"; then
    echo "{\"permissionDecision\": \"ask\", \"message\": \"[guardrail] Confirm required: $reason\"}"
    exit 0
  fi
}

ask_match 'git\s+reset\s+--hard' \
  "git reset --hard will discard uncommitted changes"

ask_match 'git\s+push\s+.*--force' \
  "force push detected — confirm target branch is not main/master"

ask_match 'docker\s+rm\s+-f' \
  "force-removing Docker containers"

ask_match 'docker\s+rmi' \
  "removing Docker images"

ask_match 'kubectl\s+delete' \
  "deleting Kubernetes resources"

ask_match './gradlew\s+clean\b' \
  "clean build will delete all compiled outputs"

# ── SESSION COST ENFORCEMENT ──────────────────────────────────────────────────

COST_FILE="${HOME}/.claude/sessions/${SESSION_ID}.json"
HARD_STOP_USD=5.00
WARN_USD=3.00

if [ -f "$COST_FILE" ]; then
  CURRENT_COST=$(python3 -c "
import json, sys
try:
    with open('$COST_FILE') as f:
        d = json.load(f)
    print(d.get('cost_usd', 0))
except Exception:
    print(0)
" 2>/dev/null || echo "0")

  OVER_HARD=$(python3 -c "print('yes' if float('$CURRENT_COST') >= $HARD_STOP_USD else 'no')" 2>/dev/null || echo "no")
  OVER_WARN=$(python3 -c "print('yes' if float('$CURRENT_COST') >= $WARN_USD else 'no')" 2>/dev/null || echo "no")

  if [ "$OVER_HARD" = "yes" ]; then
    echo "{\"permissionDecision\": \"deny\", \"message\": \"[guardrail] Session cost \$${CURRENT_COST} has reached the hard limit of \$${HARD_STOP_USD}. Start a new session to continue.\"}"
    exit 0
  fi

  if [ "$OVER_WARN" = "yes" ]; then
    echo "{\"permissionDecision\": \"ask\", \"message\": \"[guardrail] Session cost \$${CURRENT_COST} has exceeded \$${WARN_USD}. Confirm to continue.\"}"
    exit 0
  fi
fi

# ── ALLOW ─────────────────────────────────────────────────────────────────────
echo '{"permissionDecision": "allow"}'
exit 0
