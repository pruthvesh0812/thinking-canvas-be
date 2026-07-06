import { Mastra } from '@mastra/core'
import { Observability } from '@mastra/observability'
import { LangfuseExporter } from '@mastra/langfuse'
import { expanderAgent } from './agents/expander.js'
import { stressTesterAgent } from './agents/stress-tester.js'
import { articulatorAgent } from './agents/articulator.js'
import { outerSubconsciousAgent } from './agents/outer-subconscious.js'
import { attunementAgent } from './agents/attunement.js'
import { observerAgent } from './agents/observer.js'
import { judgeAgent } from './agents/orchestrator.js'

// Registering agents here (rather than calling them as bare Agent instances)
// is what makes Mastra's auto-instrumentation trace their .stream()/.generate()
// calls. LangfuseExporter reads LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY/
// LANGFUSE_BASE_URL itself — pass nothing to keep it pointed at whatever
// instance those env vars describe (self-hosted, in our case).
export const mastra = new Mastra({
  agents: {
    expander: expanderAgent,
    stressTester: stressTesterAgent,
    articulator: articulatorAgent,
    outerSubconscious: outerSubconsciousAgent,
    attunement: attunementAgent,
    observer: observerAgent,
    judge: judgeAgent,
  },
  observability: new Observability({
    configs: {
      langfuse: {
        serviceName: 'thinking-canvas-api',
        exporters: [new LangfuseExporter()],
      },
    },
  }),
})
