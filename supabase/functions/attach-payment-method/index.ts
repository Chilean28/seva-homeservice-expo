// Attach a Stripe PaymentMethod to the current user's Stripe Customer.
// POST body: { payment_method_id: string, set_as_default?: boolean, access_token?: string }
// Auth: Bearer <JWT> in Authorization header, or access_token in body (for clients where header is not sent, e.g. RN).
// Secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

interface Body {
  payment_method_id: string;
  set_as_default?: boolean;
  access_token?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { ...corsHeaders } });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const authHeader = req.headers.get("Authorization");
  let token: string | null = authHeader?.startsWith("Bearer ")
    ? authHeader.replace("Bearer ", "").trim()
    : null;
  if (!token && body?.access_token && typeof body.access_token === "string") {
    token = body.access_token.trim();
  }

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid Authorization header or access_token in body" }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!stripeSecret || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  try {
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(token);
    if (userError || !user?.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { payment_method_id, set_as_default } = body;
    if (!payment_method_id || typeof payment_method_id !== "string") {
      return new Response(
        JSON.stringify({ error: "payment_method_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: userRow, error: fetchUserErr } = await supabase
      .from("users")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (fetchUserErr) {
      return new Response(
        JSON.stringify({ error: "Failed to load user" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const stripe = new Stripe(stripeSecret);
    let customerId = (userRow as { stripe_customer_id?: string } | null)?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabase.from("users").update({ stripe_customer_id: customerId } as never).eq("id", user.id);
    }

    await stripe.paymentMethods.attach(payment_method_id, { customer: customerId });

    if (set_as_default) {
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: payment_method_id },
      });
    }

    const pm = await stripe.paymentMethods.retrieve(payment_method_id);
    const card = pm.card;
    const last4 = card?.last4 ?? "****";
    const brand = card?.brand ?? "card";

    return new Response(
      JSON.stringify({ success: true, last4, brand }),
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
