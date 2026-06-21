// One-time / re-runnable seed: pushes the local fallback constants into Langfuse
// Prompt Management as a "production"-labeled version, so getPrompt() (src/lib/prompts.ts)
// starts serving the live-editable version instead of isFallback. Re-run any time the
// local constants change and you want Langfuse to pick up the new baseline.
//
// Usage: npx tsx scripts/seed-prompts.ts
import { LangfuseClient } from '@langfuse/client'
import { ARTICULATOR_SYSTEM_PROMPT } from '../src/agents/articulator.js'
import { ATTUNEMENT_SYSTEM_PROMPT } from '../src/agents/attunement.js'
import { EXPANDER_SYSTEM_PROMPT } from '../src/agents/expander.js'
import { OBSERVER_SYSTEM_PROMPT } from '../src/agents/observer.js'
import { ORCHESTRATOR_SYSTEM_PROMPT } from '../src/agents/orchestrator.js'
import { OUTER_SUBCONSCIOUS_SYSTEM_PROMPT } from '../src/agents/outer-subconscious.js'
import { STRESS_TESTER_SYSTEM_PROMPT } from '../src/agents/stress-tester.js'

const PROMPTS: Array<{ name: string; prompt: string }> = [
  { name: 'expander-system-prompt', prompt: EXPANDER_SYSTEM_PROMPT },
  { name: 'stress-tester-system-prompt', prompt: STRESS_TESTER_SYSTEM_PROMPT },
  { name: 'articulator-system-prompt', prompt: ARTICULATOR_SYSTEM_PROMPT },
  { name: 'observer-system-prompt', prompt: OBSERVER_SYSTEM_PROMPT },
  { name: 'outer-subconscious-system-prompt', prompt: OUTER_SUBCONSCIOUS_SYSTEM_PROMPT },
  { name: 'attunement-system-prompt', prompt: ATTUNEMENT_SYSTEM_PROMPT },
  { name: 'orchestrator-system-prompt', prompt: ORCHESTRATOR_SYSTEM_PROMPT },
]

async function main() {
  const langfuse = new LangfuseClient()

  for (const { name, prompt } of PROMPTS) {
    await langfuse.prompt.create({
      name,
      type: 'text',
      prompt,
      labels: ['production'],
    })
    console.log(`seeded: ${name}`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
