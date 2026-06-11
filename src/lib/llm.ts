import { google } from '@ai-sdk/google'
import { embed } from 'ai'
import type { GoogleLanguageModelOptions } from '@ai-sdk/google'

// ─────────────────────────────────────────────
// Model registry — swap provider/model here only.
// Never import @ai-sdk/google directly elsewhere.
// ─────────────────────────────────────────────

export const models = {
  // Orchestrator, Attunement Layer — fast, no thinking
  fast: () => google('gemini-2.5-flash'),

  // Expander, Stress-Tester, Articulator — cheap content generation
  content: () => google('gemini-2.5-flash-lite'),

  // Observer, Outer Subconscious — deep reasoning (thinking:high)
  // Rejection Insights Engine   — light reasoning (thinking:low)
  // Pass the returned config into generateText/streamText as:
  //   providerOptions: { google: thinkingOptions('high') }
  thinking: (budget: 'low' | 'high'): GoogleLanguageModelOptions => ({
    thinkingConfig: {
      thinkingBudget: budget === 'high' ? 8000 : 1024,
    },
  }),
}

// ─────────────────────────────────────────────
// Embedding — node save pipeline + semantic_promote
// ─────────────────────────────────────────────

const embeddingModel = google.textEmbeddingModel('gemini-embedding-exp-03-07')

export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
  })
  return embedding
}
