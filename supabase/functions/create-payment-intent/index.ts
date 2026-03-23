// Supabase Edge Function: create a Stripe PaymentIntent for a booking.
// POST body: { amount_cents: number, currency?: string, metadata?: Record<string, string> }
// Returns: { client_secret: string, payment_intent_id: string }
// Set STRIPE_SECRET_KEY in Supabase Dashboard → Edge Functions → Secrets.

import Stripe from "https://esm.sh/stripe@14?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

interface CreatePaymentIntentBody {
  amount_cents: number;
  currency?: string;
  metadata?: Record<string, string>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { ...corsHeaders } });
  }

  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) {
    return new Response(
      JSON.stringify({ error: "STRIPE_SECRET_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  try {
    const body = (await req.json()) as CreatePaymentIntentBody;
    const { amount_cents, currency = "usd", metadata = {} } = body;

    if (!amount_cents || amount_cents < 50) {
      return new Response(
        JSON.stringify({ error: "amount_cents required (min 50)" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const stripe = new Stripe(secretKey);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount_cents),
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: { ...metadata },
    });

    return new Response(
      JSON.stringify({
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
