// Prompt preview: see EXACTLY what an agent would read, plus what each layer costs in tokens.
// A developer tool for tweaking the prompt layout fast. Read-only: no model calls, no writes.
//
//   npm run prompt:preview -- pricing-canvas                    fixture in scripts/fixtures/
//   npm run prompt:preview -- pricing-canvas --layers focus,task   one-off layer order / subset
//   npm run prompt:preview -- pricing-canvas --json               machine-readable output
//   npm run prompt:preview -- pricing-canvas --no-color
//   npm run prompt:watch   -- pricing-canvas                    re-run when the fixture or src/context changes
//   npm run prompt:preview -- --canvas <id> --focus <node-uuid>[,<uuid>] [--agent expander] [--source-node | --entry <id>]
//                                                               a REAL canvas from Supabase (read-only, needs .env)
//
// How to use it, the fixture format and how to add a layer: .ai/features/context-engineering/PROMPT-PREVIEW.md
//
// This is a CLI, so it prints to stdout directly. (Project rule: production code uses `logger`.
// A script whose whole job is to print a report is the exception.)

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LAYER_ORDER, parseLayerOrder, type LayerName } from '../src/context/assemble.js'
import type { AgentRole } from '../types/index.js'
import { loadFixture } from '../src/context/__fixtures__/load-fixture.js'
import { buildPreview, type PreviewInput, type PreviewResult } from '../src/context/__fixtures__/run-preview.js'
import { createDefaultDeps, loadRealCanvas } from './lib/real-canvas.js'

// ─────────────────────────────────────────────
// Command line
// ─────────────────────────────────────────────

type Args = {
  fixture: string | null
  layers: LayerName[] | null
  json: boolean
  color: boolean
  verbose: boolean
  // real canvas mode
  canvas: string | null
  focus: string[]
  agent: AgentRole
  sourceNode: boolean
  entry: string | null
}

const AGENTS: AgentRole[] = ['expander', 'stress_tester', 'general', 'observer']

function parseArgs(argv: string[]): Args {
  const args: Args = {
    fixture: null, layers: null, json: false, color: true, verbose: false,
    canvas: null, focus: [], agent: 'expander', sourceNode: false, entry: null,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--json') args.json = true
    else if (arg === '--no-color') args.color = false
    else if (arg === '--verbose') args.verbose = true
    else if (arg === '--layers') args.layers = parseLayerOrder(argv[++i] ?? '')
    else if (arg === '--canvas') args.canvas = argv[++i] ?? ''
    else if (arg === '--focus') args.focus = (argv[++i] ?? '').split(',').map(id => id.trim()).filter(Boolean)
    else if (arg === '--source-node') args.sourceNode = true
    else if (arg === '--entry') args.entry = argv[++i] ?? ''
    else if (arg === '--agent') {
      const agent = argv[++i] as AgentRole
      if (!AGENTS.includes(agent)) throw new Error(`unknown agent "${agent}". Valid agents: ${AGENTS.join(', ')}`)
      args.agent = agent
    }
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`)
    else args.fixture = arg
  }

  // a fixture OR a real canvas, never both
  if (args.fixture && args.canvas !== null) throw new Error('give a fixture name OR --canvas, not both')
  if (args.canvas !== null && !args.canvas) throw new Error('--canvas needs a canvas id')
  if (args.canvas !== null && args.focus.length === 0) throw new Error('--canvas needs --focus <node-uuid>[,<uuid>]')

  // colours only make sense on a terminal, and never in JSON mode
  if (args.json || !process.stdout.isTTY || process.env.NO_COLOR) args.color = false
  return args
}

// ─────────────────────────────────────────────
// Small output helpers
// ─────────────────────────────────────────────

function makePaint(useColor: boolean) {
  const wrap = (code: number) => (text: string) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text)
  return { bold: wrap(1), dim: wrap(2), red: wrap(31), cyan: wrap(36) }
}

function section(title: string, paint: ReturnType<typeof makePaint>): string {
  return paint.cyan(`\n── ${title} ${'─'.repeat(Math.max(3, 70 - title.length))}`)
}

// ─────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────

function printReport(name: string, result: PreviewResult, layerOrder: readonly LayerName[], paint: ReturnType<typeof makePaint>) {
  console.log(paint.bold(`Prompt preview: ${name}  (scope ${result.scope}, focus ${result.focusNodeIds.length} node(s))`))

  // 1. the prompt, exactly as the model receives it
  console.log(section('PROMPT (exactly what the model reads)', paint))
  console.log(result.prompt)

  // 2. tokens per layer, in the order they were rendered; skipped layers listed after
  console.log(section('TOKENS (estimated, ~4 chars each)', paint))
  const leftOut = LAYER_ORDER.filter(layer => !layerOrder.includes(layer))
  for (const layer of layerOrder) {
    const tokens = result.tokens[layer]
    console.log(`  ${layer.padEnd(12)} ${String(tokens).padStart(6)}${tokens === 0 ? paint.dim('   (empty, skipped)') : ''}`)
  }
  for (const layer of leftOut) console.log(paint.dim(`  ${layer.padEnd(12)} ${'-'.padStart(6)}   (left out)`))
  console.log(paint.bold(`  ${'TOTAL'.padEnd(12)} ${String(result.tokens.total).padStart(6)}`))

  // 3. which nodes the agent can see, and why
  console.log(section('NODES SHOWN', paint))
  for (const node of result.loadedNodes) {
    console.log(`  n${String(node.seq).padEnd(4)} ${node.tier.padEnd(6)} ${node.reason}`)
  }
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const paint = makePaint(args.color)

  // 1. get the inputs: from a real canvas, or from a fixture file
  let inputs: Omit<PreviewInput, 'options'>
  let name: string

  if (args.canvas !== null) {
    // real canvas mode: read-only reads from Supabase
    name = `canvas ${args.canvas}`
    const real = await loadRealCanvas(
      { canvasId: args.canvas, focusNodeIds: args.focus, agent: args.agent, sourceNode: args.sourceNode, entryId: args.entry ?? undefined },
      await createDefaultDeps(),
    )
    inputs = { canvasId: args.canvas, ...real }
  } else {
    if (!args.fixture) {
      throw new Error('give a fixture name (e.g. `npm run prompt:preview -- pricing-canvas`, files in scripts/fixtures/) or --canvas <id> --focus <node-uuid>')
    }
    name = args.fixture

    // a bare name means scripts/fixtures/<name>.json
    // (npm runs scripts from the repo root, so the path is relative to it)
    const looksLikePath = args.fixture.includes('/') || args.fixture.endsWith('.json')
    const filePath = looksLikePath ? resolve(args.fixture) : resolve('scripts/fixtures', `${args.fixture}.json`)
    if (!existsSync(filePath)) {
      // help the user: list what exists
      const available = readdirSync(resolve('scripts/fixtures')).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))
      throw new Error(`fixture not found: ${filePath}\nAvailable fixtures: ${available.join(', ') || '(none)'}`)
    }
    const loaded = loadFixture(JSON.parse(readFileSync(filePath, 'utf8')))
    inputs = { canvasId: 'preview', source: loaded.source, focusNodeIds: loaded.focusNodeIds, excludeEntryId: loaded.excludeEntryId, assembleBase: loaded.assembleBase }
  }

  // 2. run the real retrieval + assembly. Their logger lines would drown the report
  //    (and break --json), so mute console.log while they run, unless --verbose.
  const originalLog = console.log
  if (!args.verbose) console.log = () => {}
  let result: PreviewResult
  try {
    result = await buildPreview({ ...inputs, options: args.layers ? { layerOrder: args.layers } : undefined })
  } finally {
    console.log = originalLog
  }

  // 3. print
  const layerOrder = args.layers ?? LAYER_ORDER
  if (args.json) {
    console.log(JSON.stringify({ source: name, layerOrder, ...result }, null, 2))
    return
  }
  printReport(name, result, layerOrder, paint)
}

// Piping into `head` closes stdout early. That is not an error worth a stack trace.
process.stdout.on('error', error => {
  if ((error as NodeJS.ErrnoException).code === 'EPIPE') process.exit(0)
  throw error
})

// Any error (bad fixture, no valid focus node, unknown layer...) is shown plainly. Non-zero exit.
main().catch(error => {
  const wantsJson = process.argv.includes('--json')
  const message = error instanceof Error ? error.message : String(error)
  if (wantsJson) console.log(JSON.stringify({ errors: [message] }, null, 2))
  else console.error(`\nERROR: ${message}`)
  process.exit(1)
})
