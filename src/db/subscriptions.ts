import { db } from './client.js'
import type { SubscriptionTier, Subscription } from '../../types/index.js'

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

// Syncs a user's subscription row from a Stripe webhook. Upserts on user_id so
// repeated subscription events stay idempotent.
export async function upsertSubscription(input: {
  user_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  tier: SubscriptionTier
  status: Subscription['status']
}): Promise<void> {
  const { error } = await db
    .from('subscriptions')
    .upsert(input, { onConflict: 'user_id' })

  if (error) throw new Error(`upsertSubscription failed: ${error.message}`)
}
