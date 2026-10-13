/**
 * Stripe helpers (spec §2, §3.5): Checkout, Portal, Tax (IE VAT), webhook →
 * firm status. Thin wrappers; webhook signature verification + idempotency live
 * in the API route that owns the raw body.
 */
import Stripe from 'stripe';
import type { FirmStatus } from '@nsights/shared';

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
    // Pin to the SDK's bundled API version; override via env if Stripe dashboard differs.
    client = new Stripe(key);
  }
  return client;
}

/** Map a Stripe subscription status + invoice state to our firm_status. */
export function firmStatusFromStripe(
  subStatus: Stripe.Subscription.Status,
): FirmStatus {
  switch (subStatus) {
    case 'trialing':
      return 'trial';
    case 'active':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'cancelled';
    case 'incomplete':
    case 'paused':
      return 'paused';
    default:
      return 'past_due';
  }
}

export interface CheckoutParams {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession(p: CheckoutParams): Promise<Stripe.Checkout.Session> {
  return stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: p.customerId,
    line_items: [{ price: p.priceId, quantity: 1 }],
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    success_url: p.successUrl,
    cancel_url: p.cancelUrl,
  });
}

export async function createPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<Stripe.BillingPortal.Session> {
  return stripe().billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
}
