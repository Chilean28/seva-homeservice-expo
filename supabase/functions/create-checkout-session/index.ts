// Supabase Edge Function: create a Stripe Checkout Session (authorize only in browser).
// Charge and transfer happen when the worker marks the job complete (capture of the PaymentIntent).
// POST body: { amount_cents: number, currency?: string, success_url?: string, cancel_url?: string, user_id?: string, worker_id?: string }
// If user_id is provided, looks up users.stripe_customer_id for saved cards. If worker_id is provided and worker has stripe_connect_account_id, splits payment (10% platform fee).
// Set STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in Supabase Dashboard → Edge Functions → Secrets.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const DEFAULT_SUCCESS = "sevacustomer://payment-success?session_id={CHECKOUT_SESSION_ID}";
const DEFAULT_CANCEL = "sevacustomer://payment-cancel";

const PLATFORM_FEE_PERCENT = 10;

interface Body {
  amount_cents: number;
  currency?: string;
  success_url?: string;
  cancel_url?: string;
  user_id?: string;
  worker_id?: string;
  payment_method?: 'card' | 'cash';
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
    const {
      amount_cents,
      currency = "usd",
      success_url = DEFAULT_SUCCESS,
      cancel_url = DEFAULT_CANCEL,
    } = body;

    if (!amount_cents || amount_cents < 50) {
      return new Response(
        JSON.stringify({ error: "amount_cents required (min 50)" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let customerId: string | undefined;
    let connectDestination: string | undefined;
    const userId = (body as Body).user_id;
    const workerId = (body as Body).worker_id;
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      if (userId && typeof userId === "string") {
        const { data: row } = await supabase
          .from("users")
          .select("stripe_customer_id")
          .eq("id", userId)
          .maybeSingle();
        customerId = (row as { stripe_customer_id?: string } | null)?.stripe_customer_id;
      }
      if (workerId && typeof workerId === "string") {
        const { data: wp } = await supabase
          .from("worker_profiles")
          .select("stripe_connect_account_id")
          .eq("id", workerId)
          .maybeSingle();
        connectDestination = (wp as { stripe_connect_account_id?: string } | null)?.stripe_connect_account_id;
      }
    }

    const stripe = new Stripe(secretKey);

    const sessionParams: Record<string, unknown> = {
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: Math.round(amount_cents),
            product_data: {
              name: "Booking payment",
              description: "Service booking",
            },
          },
        },
      ],
      success_url,
      cancel_url,
    };
    if (customerId) {
      sessionParams.customer = customerId;
    }
    if (connectDestination) {
      // Platform commission is always 10% on Stripe Connect transfers.
      // (Cash is handled via the same Connect split when Stripe is involved.)
      const platformFeePercent = PLATFORM_FEE_PERCENT;
      const feeAmount = Math.round((amount_cents * platformFeePercent) / 100);
      sessionParams.payment_intent_data = {
        capture_method: "manual",
        application_fee_amount: feeAmount,
        transfer_data: { destination: connectDestination },
      };
    } else {
      sessionParams.payment_intent_data = { capture_method: "manual" };
    }

    const session = await stripe.checkout.sessions.create(sessionParams as Stripe.Checkout.SessionCreateParams);

    return new Response(
      JSON.stringify({ url: session.url }),
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
