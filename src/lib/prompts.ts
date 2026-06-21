import { LangfuseClient } from '@langfuse/client'
import { logger } from './logger.js'

// ─────────────────────────────────────────────
// Centralized Langfuse Prompt Management.
// Never instantiate LangfuseClient directly elsewhere.
// Agents fetch their system prompt here at call time;
// the local constant passed as `fallback` is returned
// (with isFallback: true) if Langfuse is unreachable
// or the prompt has no "production"-labeled version yet.
// ─────────────────────────────────────────────

const langfuse = new LangfuseClient()

export async function getPrompt(name: string, fallback: string): Promise<string> {
  const prompt = await langfuse.prompt.get(name, { type: 'text', fallback })
  if (prompt.isFallback) {
    logger.warn('[lib:prompts] fallback used', { name })
  }
  return prompt.prompt
}
