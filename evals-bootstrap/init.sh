#!/usr/bin/env bash
# Bootstrap the thinking-canvas-evals repo.
#
# Usage:
#   ./init.sh <target-dir> [backend-git-url]
#
# Example:
#   ./init.sh ~/code/thinking-canvas-evals
#
# Creates the folder structure, package.json, tsconfig, .env.example, CLI stub,
# adds the backend as a git submodule, and copies CLAUDE.md / TASKS.md /
# GUIDELINES.md from this kit.

set -euo pipefail

TARGET="${1:?usage: ./init.sh <target-dir> [backend-git-url]}"
BACKEND_URL="${2:-https://github.com/pruthvesh0812/thinking-canvas-be.git}"
KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -e "$TARGET" ] && [ -n "$(ls -A "$TARGET" 2>/dev/null)" ]; then
  echo "error: $TARGET exists and is not empty" >&2
  exit 1
fi

mkdir -p "$TARGET"
cd "$TARGET"
git init -b main

# ── Folders ────────────────────────────────────────────────────────────────
mkdir -p src/{extract,replay,run,score,judge,compare,report,lib} \
         datasets golden reports candidates

# ── package.json ───────────────────────────────────────────────────────────
cat > package.json <<'EOF'
{
  "name": "thinking-canvas-evals",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "cli": "tsx --env-file-if-exists=.env src/cli.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "db:start": "cd vendor/thinking-canvas-be && npx supabase start",
    "db:stop": "cd vendor/thinking-canvas-be && npx supabase stop",
    "db:reset": "cd vendor/thinking-canvas-be && npx supabase db reset"
  },
  "dependencies": {
    "@ai-sdk/google": "latest",
    "@langfuse/client": "^5.5.3",
    "@supabase/supabase-js": "latest",
    "ai": "^6.0.201",
    "commander": "^12.1.0",
    "zod": "latest"
  },
  "devDependencies": {
    "@types/node": "^20",
    "supabase": "^2.105.0",
    "tsx": "latest",
    "typescript": "^5",
    "vitest": "latest"
  }
}
EOF

# ── tsconfig.json ──────────────────────────────────────────────────────────
cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@tc/*": ["vendor/thinking-canvas-be/src/*"],
      "@tc-types": ["vendor/thinking-canvas-be/types/index.ts"]
    }
  },
  "include": ["src"]
}
EOF

# ── .env.example ───────────────────────────────────────────────────────────
cat > .env.example <<'EOF'
# ── Production (extract only — read-only usage) ─────────────────────────
PROD_SUPABASE_URL=
PROD_SUPABASE_SERVICE_ROLE_KEY=

# ── Local replay stack (npm run db:start) ───────────────────────────────
# The vendor db client (src/db/client.ts) reads these names, so during
# replay the production serializer transparently reads the seeded local DB.
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=

# ── Models ──────────────────────────────────────────────────────────────
# @ai-sdk/google reads GOOGLE_GENERATIVE_AI_API_KEY by default; the backend
# repo's .env.example calls it GOOGLE_AI_API_KEY — set both to the same key.
GOOGLE_GENERATIVE_AI_API_KEY=
GOOGLE_AI_API_KEY=

# ── Langfuse (prompt versions, traces, experiment logging) ──────────────
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_BASE_URL=https://cloud.langfuse.com
EOF

# ── .gitignore ─────────────────────────────────────────────────────────────
cat > .gitignore <<'EOF'
node_modules/
dist/
.env
# Real user thinking — sensitive, never committed. Only golden/ ships.
datasets/
reports/
runs/
EOF

# ── CLI stub ───────────────────────────────────────────────────────────────
cat > src/cli.ts <<'EOF'
import { Command } from 'commander'

// Subcommands are stubs until their task lands — see TASKS.md for the order.
const program = new Command()
  .name('tc-eval')
  .description('ThinkingCanvas trail-replay eval harness')

const stub = (task: string) => () => {
  console.error(`not implemented yet — see TASKS.md ${task}`)
  process.exit(1)
}

program.command('extract')
  .description('Pull a canvas TrailSnapshot from production (read-only)')
  .requiredOption('--canvas <id>')
  .requiredOption('--out <dir>')
  .action(stub('Task 3'))

program.command('points')
  .description('Build ReplayPoints from a snapshot')
  .requiredOption('--dataset <dir>')
  .action(stub('Task 4'))

program.command('label')
  .description('Compute generativity labels over recorded data')
  .requiredOption('--dataset <dir>')
  .action(stub('Task 8'))

program.command('run')
  .description('Run a CandidateConfig over a dataset')
  .requiredOption('--dataset <dir>')
  .requiredOption('--candidate <file>')
  .option('--role <agentRole>')
  .option('--limit <n>')
  .action(stub('Task 6'))

program.command('judge-calibrate')
  .description('Correlate judge scores with generativity labels')
  .requiredOption('--dataset <dir>')
  .action(stub('Task 9'))

program.command('compare')
  .description('Paired A/B compare of two runs + report')
  .requiredOption('--a <runDir>')
  .requiredOption('--b <runDir>')
  .action(stub('Task 10'))

program.command('golden')
  .description('Curate the golden holdout set')
  .argument('<action>', 'add')
  .option('--dataset <dir>')
  .option('--point <id>')
  .action(stub('Task 12'))

program.parse()
EOF

# ── Docs from the kit ──────────────────────────────────────────────────────
cp "$KIT_DIR/CLAUDE.template.md" CLAUDE.md
cp "$KIT_DIR/TASKS.md" TASKS.md
cp "$KIT_DIR/GUIDELINES.md" GUIDELINES.md

# ── Backend submodule (pinned — the code under test) ───────────────────────
git submodule add "$BACKEND_URL" vendor/thinking-canvas-be

# ── First commit ───────────────────────────────────────────────────────────
git add -A
git commit -m "bootstrap thinking-canvas-evals: scaffold, docs, backend submodule"

cat <<DONE

✔ thinking-canvas-evals bootstrapped at: $TARGET

Next steps:
  cd $TARGET
  cp .env.example .env       # fill in keys
  npm install
  (cd vendor/thinking-canvas-be && npm install)
  npm run cli -- --help
  npm run db:start           # local Supabase with vendor migrations

Then open TASKS.md and start with Task 0 (which lives in thinking-canvas-be).
DONE
