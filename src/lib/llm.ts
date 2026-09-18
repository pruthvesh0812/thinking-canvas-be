import { google } from '@ai-sdk/google'
import { embed } from 'ai'
import type { GoogleLanguageModelOptions } from '@ai-sdk/google'
import "dotenv/config"
// ─────────────────────────────────────────────
// Model registry — swap provider/model here only.
// Never import @ai-sdk/google directly elsewhere.
// ─────────────────────────────────────────────

export const models = {
  // Orchestrator, Attunement Layer — fast, no thinking
  fast: () => google('gemini-3.1-flash-lite-preview'),

  // Expander, Stress-Tester, Articulator — cheap content generation
  content: () => google('gemini-3.1-flash-lite-preview'),

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

// gemini-embedding-001 — 3072 dims, matching nodes.embedding VECTOR(3072).
// The previous 'gemini-embedding-exp-03-07' was retired by Google and returns
// 404, which silently broke the entire node-enrichment pipeline (see
// enrichNode in src/routes/canvas-event.ts). Verify with a live embedContent
// call before ever changing this string.
const embeddingModel = google.textEmbeddingModel('gemini-embedding-001')

export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
  })
  return embedding
}
