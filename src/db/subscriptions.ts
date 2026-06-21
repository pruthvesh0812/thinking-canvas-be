import { db } from './client.js'
import type { SubscriptionTier } from '../../types/index.js'

// Resolves a user's subscription tier for server-side tier enforcement in the
// Orchestrator. Defaults to 'free' when no active subscription row exists.
export async function getTierByUser(user_id: string): Promise<SubscriptionTier> {
  const { data, error } = await db
    .from('subscriptions')
    .select('tier, status')
    .eq('user_id', user_id)
    .eq('status', 'active')
    .maybeSingle()

  if (error) throw new Error(`getTierByUser failed: ${error.message}`)
  return (data?.tier as SubscriptionTier | undefined) ?? 'free'
}
