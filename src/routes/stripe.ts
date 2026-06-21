import { Hono } from 'hono'
import Stripe from 'stripe'
import { logger } from '../lib/logger.js'
import { upsertSubscription } from '../db/subscriptions.js'
import type { SubscriptionTier, Subscription } from '../../types/index.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '')

// Maps a Stripe price id onto a subscription tier. Price ids are configured per
// environment; anything unrecognised falls back to the free tier.
function tierForPrice(priceId: string | undefined): SubscriptionTier {
  if (priceId && priceId === process.env.STRIPE_PRICE_POWER) return 'power'
  if (priceId && priceId === process.env.STRIPE_PRICE_PRO) return 'pro'
  return 'free'
}

function mapStatus(status: Stripe.Subscription.Status): Subscription['status'] {
  if (status === 'active' || status === 'trialing') return 'active'
  if (status === 'past_due') return 'past_due'
  return 'canceled'
}

function customerId(customer: Stripe.Subscription['customer']): string {
  return typeof customer === 'string' ? customer : customer.id
}

export const stripeRoute = new Hono()

// POST /api/stripe/webhook — keeps the subscriptions table in sync with Stripe.
// Signature is verified against the RAW request body before anything is trusted.
stripeRoute.post('/stripe/webhook', async (c) => {
  const sig = c.req.header('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!sig || !secret) {
    logger.error('[route:stripe] missing signature header or webhook secret')
    return c.json({ error: 'missing signature' }, 400)
  }

  // Raw body — Stripe signature verification fails against a re-serialized JSON.
  const rawBody = await c.req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, secret)
  } catch (err) {
    logger.error('[route:stripe] signature verification failed', { error: (err as Error).message })
    return c.json({ error: 'invalid signature' }, 400)
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object
        const userId = sub.metadata?.user_id
        if (!userId) {
          logger.warn('[route:stripe] subscription without user_id metadata', { subscription_id: sub.id })
          break
        }
        await upsertSubscription({
          user_id: userId,
          stripe_customer_id: customerId(sub.customer),
          stripe_subscription_id: sub.id,
          tier: tierForPrice(sub.items.data[0]?.price.id),
          status: mapStatus(sub.status),
        })
        logger.info('[route:stripe] subscription synced', { subscription_id: sub.id, user_id: userId })
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object
        const userId = sub.metadata?.user_id
        if (!userId) {
          logger.warn('[route:stripe] deleted subscription without user_id metadata', { subscription_id: sub.id })
          break
        }
        await upsertSubscription({
          user_id: userId,
          stripe_customer_id: customerId(sub.customer),
          stripe_subscription_id: sub.id,
          tier: 'free',
          status: 'canceled',
        })
        logger.info('[route:stripe] subscription canceled', { subscription_id: sub.id, user_id: userId })
        break
      }
      default:
        logger.info('[route:stripe] unhandled event', { type: event.type })
    }

    return c.json({ received: true })
  } catch (err) {
    logger.error('[route:stripe] handler failed', { type: event.type, error: (err as Error).message })
    return c.json({ error: 'internal error' }, 500)
  }
})
