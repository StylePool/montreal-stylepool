import Stripe from 'stripe';

const PLAN_CONFIG = {
  monthly: {
    name: 'StylePool MTL — Monthly Unlimited Pool Pass',
    description: 'Unlimited pooled clothing orders across Montreal brands.',
    unitAmountCents: 599,
    mode: 'subscription',
    interval: 'month',
  },
  annual: {
    name: 'StylePool MTL — Annual Pool Pass',
    description: 'Year-round pooled clothing orders across Montreal brands.',
    unitAmountCents: 4900,
    mode: 'subscription',
    interval: 'year',
  },
  single: {
    name: 'StylePool MTL — Single Order Trial Pass',
    description: 'One-time pooled clothing order pass with $0 shipping.',
    unitAmountCents: 249,
    mode: 'payment',
    interval: null,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || !secretKey.startsWith('sk_')) {
    return res.status(500).json({
      error: 'Missing or invalid STRIPE_SECRET_KEY (must start with sk_test_ or sk_live_).',
    });
  }

  const { planId = 'monthly', clientEmail, clientId } = req.body || {};
  const selectedPlan = PLAN_CONFIG[planId] || PLAN_CONFIG.monthly;

  try {
    const stripe = new Stripe(secretKey);

    // Ensure mobile apps (capacitor://localhost) use the public https:// link for Stripe redirects
    const rawOrigin = req.headers.origin || '';
    const isWebOrigin =
      rawOrigin.startsWith('https://') && !rawOrigin.includes('localhost');
    const baseUrl =
      process.env.PUBLIC_APP_URL ||
      (isWebOrigin ? rawOrigin : `https://${req.headers.host}`);

    const priceData = {
      currency: 'cad',
      product_data: {
        name: selectedPlan.name,
        description: selectedPlan.description,
      },
      unit_amount: selectedPlan.unitAmountCents,
    };

    if (selectedPlan.mode === 'subscription') {
      priceData.recurring = { interval: selectedPlan.interval };
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: selectedPlan.mode,
      customer_email: clientEmail || undefined,
      client_reference_id: clientId || undefined,
      line_items: [{ price_data: priceData, quantity: 1 }],
      metadata: {
        planId,
        clientId: clientId || '',
      },
      success_url: `${baseUrl}/?payment=success&plan=${planId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?payment=cancelled`,
    });

    return res.status(200).json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}