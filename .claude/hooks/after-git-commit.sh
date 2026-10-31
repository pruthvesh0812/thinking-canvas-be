#!/usr/bin/env bash
# PostToolUse hook (matcher: Bash). After a Bash call that ran `git commit`,
# remind Claude to run the `code-alignment` skill. Prints nothing for any
# other command, so it stays silent the rest of the time.
#
# PostToolUse only fires when the tool call succeeded, so a failed commit
# (hook rejection, nothing to commit) never reaches this script.

cmd=$(jq -r '.tool_input.command // ""')

# Matches `git commit` at the start of the command or after ; & | (so
# `git add . && git commit -m x` counts, `git log --grep commit` does not).
if printf '%s' "$cmd" | grep -Eq '(^|[;&|])[[:space:]]*git[[:space:]]+commit([[:space:]]|$)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: "A git commit just succeeded. Invoke the `code-alignment` skill now (Skill tool, skill: code-alignment). It will skip by itself if the commit only touched docs, config or alignment files."
    }
  }'
fi
exit 0
