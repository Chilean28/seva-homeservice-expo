// Release authorized payment when a booking is cancelled (cancel PaymentIntent so customer is not charged).
// POST body: { booking_id: string }
// Auth: Bearer <JWT>. Caller should be customer or worker for that booking (optional; service role can be used from backend).
// Set STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secretKey || !supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  try {
    const body = (await req.json()) as { booking_id?: string };
    const booking_id = body?.booking_id;
    if (!booking_id || typeof booking_id !== "string") {
      return new Response(
        JSON.stringify({ error: "booking_id required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: booking, error: bookErr } = await supabase
      .from("bookings")
      .select("payment_status, stripe_payment_intent_id")
      .eq("id", booking_id)
      .maybeSingle();

    if (bookErr || !booking) {
      return new Response(
        JSON.stringify({ error: "Booking not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const row = booking as { payment_status?: string; stripe_payment_intent_id?: string | null };
    if (row.payment_status !== "pending" || !row.stripe_payment_intent_id) {
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const stripe = new Stripe(secretKey);
    const pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id);
    if (pi.status === "requires_capture") {
      await stripe.paymentIntents.cancel(pi.id);
    }

    return new Response(
      JSON.stringify({ success: true }),
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
