// Charge a saved card (Stripe PaymentIntent with existing payment method).
// POST body: { amount_cents: number, currency?: string, user_id: string, worker_id?: string, payment_method_id: string }
// No redirect: charges the card and returns success. Set STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const PLATFORM_FEE_PERCENT = 10;

interface Body {
  amount_cents: number;
  currency?: string;
  user_id: string;
  worker_id?: string;
  payment_method_id: string;
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
    const body = (await req.json()) as Body;
    const { amount_cents, currency = "usd", user_id, worker_id, payment_method_id } = body;

    if (!amount_cents || amount_cents < 50) {
      return new Response(
        JSON.stringify({ error: "amount_cents required (min 50)" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    if (!payment_method_id || typeof payment_method_id !== "string") {
      return new Response(
        JSON.stringify({ error: "payment_method_id required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    if (!user_id || typeof user_id !== "string") {
      return new Response(
        JSON.stringify({ error: "user_id required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let customerId: string | undefined;
    let connectDestination: string | undefined;
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const { data: row } = await supabase
        .from("users")
        .select("stripe_customer_id")
        .eq("id", user_id)
        .maybeSingle();
      customerId = (row as { stripe_customer_id?: string } | null)?.stripe_customer_id;

      if (worker_id && typeof worker_id === "string") {
        const { data: wp } = await supabase
          .from("worker_profiles")
          .select("stripe_connect_account_id")
          .eq("id", worker_id)
          .maybeSingle();
        connectDestination = (wp as { stripe_connect_account_id?: string } | null)?.stripe_connect_account_id;
      }
    }

    if (!customerId) {
      return new Response(
        JSON.stringify({ error: "Customer has no Stripe account" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const stripe = new Stripe(secretKey);

    const params: Stripe.PaymentIntentCreateParams = {
      amount: Math.round(amount_cents),
      currency: currency.toLowerCase(),
      payment_method: payment_method_id,
      customer: customerId,
      confirm: true,
      off_session: true,
      payment_method_types: ["card"],
    };

    if (connectDestination) {
      const feeAmount = Math.round((amount_cents * PLATFORM_FEE_PERCENT) / 100);
      params.application_fee_amount = feeAmount;
      params.transfer_data = { destination: connectDestination };
    }

    const paymentIntent = await stripe.paymentIntents.create(params);

    if (paymentIntent.status !== "succeeded") {
      return new Response(
        JSON.stringify({ error: "Payment did not succeed", status: paymentIntent.status }),
        { status: 402, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, payment_intent_id: paymentIntent.id }),
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
