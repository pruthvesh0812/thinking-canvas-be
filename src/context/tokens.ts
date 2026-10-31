// Rough token count. No tokenizer call: this only needs to be "about right"
// (used for logging what each prompt layer costs, and for budget checks).
// Rule of thumb for English text: 1 token is about 4 characters.
const CHARS_PER_TOKEN = 4

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}
