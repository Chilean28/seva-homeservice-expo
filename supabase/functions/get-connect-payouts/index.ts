// Returns balance and payout history for the current worker's Stripe Connect account.
// POST body: { access_token?: string }
// Auth: Bearer <JWT> or access_token in body.
// Secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

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

  let body: { access_token?: string };
  try {
    body = (await req.json().catch(() => ({}))) as { access_token?: string };
  } catch {
    body = {};
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
      JSON.stringify({ error: "Missing Authorization header or access_token in body" }),
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

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error: profileErr } = await supabase
      .from("worker_profiles")
      .select("stripe_connect_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileErr || !profile) {
      return new Response(
        JSON.stringify({ error: "Worker profile not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const accountId = (profile as { stripe_connect_account_id?: string }).stripe_connect_account_id;
    if (!accountId) {
      return new Response(
        JSON.stringify({ error: "No Stripe account connected", available_cents: 0, pending_cents: 0, payouts: [] }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const stripe = new Stripe(stripeSecret);
    const opts = { stripeAccount: accountId };

    const [balance, payoutsList] = await Promise.all([
      stripe.balance.retrieve(opts),
      stripe.payouts.list({ limit: 20 }, opts),
    ]);

    const availableCents =
      (balance.available ?? []).reduce((sum: number, b: { amount: number }) => sum + b.amount, 0) ?? 0;
    const pendingCents =
      (balance.pending ?? []).reduce((sum: number, b: { amount: number }) => sum + b.amount, 0) ?? 0;

    const payouts = (payoutsList.data ?? []).map((p: { id: string; amount: number; status: string; arrival_date: number; created: number; currency: string }) => ({
      id: p.id,
      amount_cents: p.amount,
      status: p.status,
      arrival_date: p.arrival_date,
      created: p.created,
      currency: p.currency,
    }));

    return new Response(
      JSON.stringify({
        available_cents: availableCents,
        pending_cents: pendingCents,
        payouts,
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
