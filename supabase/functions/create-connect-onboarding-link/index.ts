// Returns a Stripe Connect onboarding URL for the current worker.
// POST body: { return_url?: string, refresh_url?: string, access_token?: string }
// Auth: Bearer <JWT> in Authorization header, or access_token in body (for clients where header is not sent, e.g. RN).
// Secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const APP_RETURN = "sevaworker://stripe-connect-return";

interface Body {
  return_url?: string;
  refresh_url?: string;
  access_token?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { ...corsHeaders } });
  }

  let body: Body;
  try {
    body = (await req.json().catch(() => ({}))) as Body;
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
      .select("id, stripe_connect_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileErr || !profile) {
      return new Response(
        JSON.stringify({ error: "Worker profile not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const stripe = new Stripe(stripeSecret);
    let accountId = (profile as { stripe_connect_account_id?: string }).stripe_connect_account_id;
    const testAccountIdEnv = Deno.env.get("STRIPE_TEST_CONNECT_ACCOUNT_ID")?.trim();

    if (!accountId) {
      if (testAccountIdEnv) {
        accountId = testAccountIdEnv;
        await supabase
          .from("worker_profiles")
          .update({ stripe_connect_account_id: accountId } as never)
          .eq("id", (profile as { id: string }).id);
        return new Response(
          JSON.stringify({ skip_onboarding: true }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      const account = await stripe.accounts.create({
        type: "express",
        email: user.email ?? undefined,
        country: "US",
        metadata: { supabase_user_id: user.id },
      });
      accountId = account.id;
      await supabase
        .from("worker_profiles")
        .update({ stripe_connect_account_id: accountId } as never)
        .eq("id", (profile as { id: string }).id);
    }

    if (testAccountIdEnv && accountId === testAccountIdEnv) {
      return new Response(
        JSON.stringify({ skip_onboarding: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const redirectPath = `${supabaseUrl}/functions/v1/redirect-to-app`;
    const encodedReturn = encodeURIComponent(APP_RETURN);
    const returnUrl = body.return_url ?? `${redirectPath}?url=${encodedReturn}`;
    const refreshUrl = body.refresh_url ?? `${redirectPath}?url=${encodedReturn}`;
    // Stripe requires https for return_url/refresh_url; we use a redirect-to-app function that 302s to sevaworker://
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    const rawUrl =
      typeof (accountLink as { url?: string }).url === "string"
        ? (accountLink as { url: string }).url
        : typeof (accountLink as { data?: { url?: string } }).data?.url === "string"
          ? (accountLink as { data: { url: string } }).data.url
          : "";
    const url = rawUrl.replace(/\s+/g, "").trim();
    if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
      return new Response(
        JSON.stringify({ error: "Invalid onboarding link from payment provider" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ url }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Stripe returns this when the platform has not completed Connect signup (dashboard.stripe.com/connect).
    const isConnectNotEnabled = /signed up for Connect|connect.*dashboard/i.test(message);
    if (isConnectNotEnabled) {
      return new Response(
        JSON.stringify({
          error: "Payment setup is not available yet. Please try again later or contact support.",
          code: "connect_not_enabled",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    // Already onboarded / no update needed (e.g. account_update not supported for this account type).
    const isAlreadyOnboarded = /already.*onboarded|fully onboarded|account_update/i.test(message);
    if (isAlreadyOnboarded) {
      return new Response(
        JSON.stringify({
          error: "Your Stripe account is already set up. No update needed right now.",
          code: "already_onboarded",
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
