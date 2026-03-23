// Supabase Edge Function: get payment_intent_id from a Stripe Checkout Session.
// POST body: { session_id: string }
// Returns: { payment_intent_id: string }
// Set STRIPE_SECRET_KEY in Supabase Dashboard → Edge Functions → Secrets.

import Stripe from "https://esm.sh/stripe@14?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

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
    const body = (await req.json()) as { session_id?: string };
    const session_id = body?.session_id;
    if (!session_id || typeof session_id !== "string") {
      return new Response(
        JSON.stringify({ error: "session_id required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const stripe = new Stripe(secretKey);
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["payment_intent"],
    });

    const payment_intent_id =
      typeof session.payment_intent === "object" && session.payment_intent?.id
        ? session.payment_intent.id
        : typeof session.payment_intent === "string"
          ? session.payment_intent
          : null;

    if (!payment_intent_id) {
      return new Response(
        JSON.stringify({ error: "No payment intent on session" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ payment_intent_id }),
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
