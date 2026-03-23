// Charge the customer when the worker marks the job complete.
// POST body: { booking_id: string }
// Auth: (1) Header x-internal-secret matching INTERNAL_CHARGE_SECRET (from DB trigger), or
//       (2) Bearer <JWT> / body access_token (from app). Caller must be the worker.
// Set STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, INTERNAL_CHARGE_SECRET.
//
// Amount charged matches bookings.total_amount (locked final total). For manual-capture Checkout PIs:
// - If final total <= authorization: partial or full capture for that amount only.
// - If final total > authorization: off-session charge for the difference first, then capture up to the auth.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-internal-secret",
};

const PLATFORM_FEE_PERCENT = 10;

interface BookingRow {
  id: string;
  customer_id: string;
  worker_id: string | null;
  price: number;
  total_amount: number | null;
  estimated_total: number | null;
  payment_method: string | null;
  payment_status: string | null;
  stripe_payment_intent_id: string | null;
  stripe_payment_method_id: string | null;
  cash_platform_fee_status?: string | null;
  cash_platform_fee_cents?: number | null;
}

/** Application fee in cents for Connect (10% of charge amount). */
function platformFeeCents(amountCents: number): number {
  return Math.round((amountCents * PLATFORM_FEE_PERCENT) / 100);
}

/** Job total in dollars for fee calculation (matches capture logic). */
function jobTotalDollars(row: BookingRow): number {
  if (row.total_amount != null) return Number(row.total_amount);
  if (row.estimated_total != null) return Number(row.estimated_total);
  return Number(row.price) * 2;
}

type CashFeeResult = {
  status: "charged" | "pending" | "failed" | "skipped";
  fee_cents?: number;
  pending_reason?: "no_connect" | "insufficient_balance";
};

/**
 * Cash jobs: collect 10% platform fee via Stripe Connect **Account Debits** — funds move from the
 * worker's Connect balance to the platform (same pipeline as payouts, no separate card).
 * Requires: Express/Custom Connect, Account Debits enabled, sufficient available balance.
 * @see https://docs.stripe.com/connect/account-debits
 */
async function chargeCashPlatformFee(
  stripe: Stripe,
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  row: BookingRow,
  booking_id: string,
): Promise<CashFeeResult> {
  if (row.payment_method !== "cash" || !row.worker_id) {
    return { status: "skipped" };
  }
  if (row.cash_platform_fee_status === "charged") {
    return { status: "charged" };
  }

  const jobTotal = jobTotalDollars(row);
  const feeCents = Math.max(50, Math.round(jobTotal * 100 * (PLATFORM_FEE_PERCENT / 100)));

  const { data: wp } = await supabase
    .from("worker_profiles")
    .select("user_id, stripe_connect_account_id")
    .eq("id", row.worker_id)
    .maybeSingle();
  const workerUserId = (wp as { user_id?: string; stripe_connect_account_id?: string | null } | null)?.user_id;
  const connectId = (wp as { stripe_connect_account_id?: string | null } | null)?.stripe_connect_account_id;

  const markPending = async (reason: "no_connect" | "insufficient_balance") => {
    await supabase
      .from("bookings")
      .update({
        cash_platform_fee_cents: feeCents,
        cash_platform_fee_status: "pending",
      } as never)
      .eq("id", booking_id);
    return { status: "pending" as const, fee_cents: feeCents, pending_reason: reason };
  };

  if (!workerUserId || !connectId) {
    return markPending("no_connect");
  }

  let usdAvailable = 0;
  try {
    const bal = await stripe.balance.retrieve({ stripeAccount: connectId });
    usdAvailable =
      (bal.available ?? []).find((b) => b.currency === "usd")?.amount ?? 0;
  } catch (e) {
    console.error("cash fee: balance.retrieve failed", e);
    return markPending("insufficient_balance");
  }

  if (usdAvailable < feeCents) {
    return markPending("insufficient_balance");
  }

  try {
    const charge = await stripe.charges.create({
      amount: feeCents,
      currency: "usd",
      source: connectId,
      description: `Platform fee (${PLATFORM_FEE_PERCENT}% cash job)`,
      metadata: { booking_id, type: "cash_platform_fee" },
    });

    await supabase
      .from("bookings")
      .update({
        cash_platform_fee_cents: feeCents,
        cash_platform_fee_status: "charged",
        cash_platform_fee_stripe_payment_intent_id: charge.id,
      } as never)
      .eq("id", booking_id);

    try {
      await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          user_id: workerUserId,
          title: "Platform fee collected",
          body: `Cash job fee ($${(feeCents / 100).toFixed(2)}) was debited from your Stripe Connect balance.`,
        }),
      });
    } catch (_) {}

    return { status: "charged", fee_cents: feeCents };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("cash platform fee account debit failed", message);
    await supabase
      .from("bookings")
      .update({
        cash_platform_fee_cents: feeCents,
        cash_platform_fee_status: "failed",
      } as never)
      .eq("id", booking_id);
    return { status: "failed", fee_cents: feeCents };
  }
}

async function notifyCustomerJobComplete(
  supabaseUrl: string,
  serviceRoleKey: string,
  customerId: string,
  bodyText: string,
) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        user_id: customerId,
        title: "Job complete",
        body: bodyText,
      }),
    });
  } catch (_) {}
}

/** Off-session charge (e.g. top-up when final total exceeds original authorization). */
async function chargeOffSession(
  stripe: Stripe,
  supabase: ReturnType<typeof createClient>,
  row: BookingRow,
  amountCents: number,
  paymentMethodId: string,
): Promise<Stripe.PaymentIntent> {
  if (amountCents < 50) {
    throw new Error("Top-up amount below Stripe minimum (50 cents)");
  }
  const { data: custRow } = await supabase
    .from("users")
    .select("stripe_customer_id")
    .eq("id", row.customer_id)
    .maybeSingle();
  const customerId = (custRow as { stripe_customer_id?: string } | null)?.stripe_customer_id;
  if (!customerId) {
    throw new Error("Customer has no Stripe customer id");
  }

  const { data: connectRow } = await supabase
    .from("worker_profiles")
    .select("stripe_connect_account_id")
    .eq("id", row.worker_id)
    .maybeSingle();
  const connectDestination = (connectRow as { stripe_connect_account_id?: string } | null)?.stripe_connect_account_id;

  const params: Stripe.PaymentIntentCreateParams = {
    amount: amountCents,
    currency: "usd",
    payment_method: paymentMethodId,
    customer: customerId,
    confirm: true,
    off_session: true,
    payment_method_types: ["card"],
  };
  if (connectDestination) {
    params.application_fee_amount = platformFeeCents(amountCents);
    params.transfer_data = { destination: connectDestination };
  }

  return await stripe.paymentIntents.create(params);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { ...corsHeaders } });
  }

  let body: { booking_id?: string; access_token?: string };
  try {
    body = (await req.json().catch(() => ({}))) as { booking_id?: string; access_token?: string };
  } catch {
    body = {};
  }

  const internalSecret = req.headers.get("x-internal-secret")?.trim() ?? null;
  const internalChargeSecret = Deno.env.get("INTERNAL_CHARGE_SECRET");
  const useInternalAuth = Boolean(
    internalChargeSecret && internalSecret && internalSecret === internalChargeSecret
  );

  let token: string | null = null;
  if (!useInternalAuth) {
    const authHeader = req.headers.get("Authorization");
    token = authHeader?.startsWith("Bearer ")
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
  }

  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secretKey || !supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
  if (!useInternalAuth && !anonKey) {
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  try {
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
      .select(
        "id, customer_id, worker_id, price, total_amount, estimated_total, payment_method, payment_status, stripe_payment_intent_id, stripe_payment_method_id, cash_platform_fee_status, cash_platform_fee_cents",
      )
      .eq("id", booking_id)
      .maybeSingle();

    if (bookErr || !booking) {
      return new Response(
        JSON.stringify({ error: "Booking not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const row = booking as unknown as BookingRow;
    const stripe = new Stripe(secretKey);

    // Cash jobs: debit platform fee from worker's Stripe Connect balance (Account Debits).
    if (row.payment_method === "cash" && row.worker_id) {
      const cashFee = await chargeCashPlatformFee(
        stripe,
        supabase,
        supabaseUrl,
        serviceRoleKey,
        row,
        booking_id,
      );
      await notifyCustomerJobComplete(
        supabaseUrl,
        serviceRoleKey,
        row.customer_id,
        "Your job has been marked complete.",
      );
      if (cashFee.status === "pending") {
        const { data: wp2 } = await supabase
          .from("worker_profiles")
          .select("user_id")
          .eq("id", row.worker_id)
          .maybeSingle();
        const wuid = (wp2 as { user_id?: string } | null)?.user_id;
        if (wuid) {
          const pendingBody =
            cashFee.pending_reason === "no_connect"
              ? "Connect Stripe in Profile so we can debit the cash-job platform fee from your Connect balance."
              : "Cash job fee is pending—not enough available balance in Stripe Connect yet. Card job payouts must settle first, then try again or contact support.";
          try {
            await fetch(`${supabaseUrl}/functions/v1/send-push`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify({
                user_id: wuid,
                title: "Cash job platform fee",
                body: pendingBody,
              }),
            });
          } catch (_) {}
        }
      }
      return new Response(
        JSON.stringify({ success: true, cash_platform_fee: cashFee.status, fee_cents: cashFee.fee_cents }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (row.payment_status !== "pending") {
      await notifyCustomerJobComplete(supabaseUrl, serviceRoleKey, row.customer_id, "Your job has been marked complete.");
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Card job: if there's no stripe payment information, don't attempt to charge.
    if (!row.stripe_payment_intent_id && !row.stripe_payment_method_id) {
      await notifyCustomerJobComplete(supabaseUrl, serviceRoleKey, row.customer_id, "Your job has been marked complete.");
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (!useInternalAuth && anonKey) {
      const supabaseAuth = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token!);
      if (userError || !user?.id) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      const { data: wp } = await supabase
        .from("worker_profiles")
        .select("user_id")
        .eq("id", row.worker_id)
        .maybeSingle();
      const workerUserId = (wp as { user_id?: string } | null)?.user_id;
      if (workerUserId !== user.id) {
        return new Response(
          JSON.stringify({ error: "Not authorized to complete this booking" }),
          { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    const chargeAmount = row.total_amount != null ? Number(row.total_amount) : Number(row.price);
    const amountCents = Math.round(chargeAmount * 100);
    if (amountCents < 50) {
      return new Response(
        JSON.stringify({ error: "Invalid booking amount" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (row.stripe_payment_intent_id) {
      const pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id);

      if (pi.status === "requires_capture") {
        const { data: connectRow } = await supabase
          .from("worker_profiles")
          .select("stripe_connect_account_id")
          .eq("id", row.worker_id)
          .maybeSingle();
        const connectDestination = (connectRow as { stripe_connect_account_id?: string } | null)?.stripe_connect_account_id;

        const authorizedCents = pi.amount_capturable ?? pi.amount;
        const pmFromPi =
          typeof pi.payment_method === "string"
            ? pi.payment_method
            : (pi.payment_method as Stripe.PaymentMethod | null)?.id ?? null;

        // Final total exceeds what Checkout authorized: charge the difference off-session first,
        // then capture up to the original authorization (partial capture when final is lower).
        if (amountCents > authorizedCents) {
          const extraCents = amountCents - authorizedCents;
          if (extraCents < 50) {
            return new Response(
              JSON.stringify({
                error:
                  "Final amount exceeds authorization by less than Stripe minimum ($0.50); adjust or contact support.",
              }),
              { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
            );
          }
          const pmId = pmFromPi ?? row.stripe_payment_method_id;
          if (!pmId) {
            return new Response(
              JSON.stringify({
                error: "Final amount exceeds original authorization; no saved payment method for the balance.",
              }),
              { status: 402, headers: { "Content-Type": "application/json", ...corsHeaders } }
            );
          }
          try {
            const topUp = await chargeOffSession(stripe, supabase, row, extraCents, pmId);
            if (topUp.status !== "succeeded") {
              return new Response(
                JSON.stringify({
                  error: "Could not charge amount above original authorization",
                  status: topUp.status,
                }),
                { status: 402, headers: { "Content-Type": "application/json", ...corsHeaders } }
              );
            }
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return new Response(
              JSON.stringify({ error: message }),
              { status: 402, headers: { "Content-Type": "application/json", ...corsHeaders } }
            );
          }
        }

        const captureCents = Math.min(amountCents, authorizedCents);
        if (captureCents < 50) {
          return new Response(
            JSON.stringify({ error: "Capture amount below Stripe minimum" }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }

        const captureParams: Stripe.PaymentIntentCaptureParams = {
          amount_to_capture: captureCents,
        };
        if (connectDestination) {
          captureParams.application_fee_amount = platformFeeCents(captureCents);
        }

        try {
          await stripe.paymentIntents.capture(pi.id, captureParams);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return new Response(
            JSON.stringify({ error: message }),
            { status: 402, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
      } else if (pi.status !== "succeeded") {
        return new Response(
          JSON.stringify({ error: "Payment intent cannot be captured", status: pi.status }),
          { status: 402, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    } else if (row.stripe_payment_method_id) {
      try {
        const paymentIntent = await chargeOffSession(
          stripe,
          supabase,
          row,
          amountCents,
          row.stripe_payment_method_id,
        );
        if (paymentIntent.status !== "succeeded") {
          return new Response(
            JSON.stringify({ error: "Payment did not succeed", status: paymentIntent.status }),
            { status: 402, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return new Response(
          JSON.stringify({ error: message }),
          { status: 402, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    } else {
      return new Response(
        JSON.stringify({ error: "No payment method to charge" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { error: updateErr } = await supabase
      .from("bookings")
      .update({ payment_status: "paid" } as never)
      .eq("id", booking_id);

    if (updateErr) {
      return new Response(
        JSON.stringify({ error: "Failed to update booking" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const chargedTotalStr = chargeAmount.toFixed(2);
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          user_id: row.customer_id,
          title: "Job complete",
          body: `Your job has been marked complete. You've been charged $${chargedTotalStr}.`,
        }),
      });
    } catch (_) {
      // non-fatal: payment succeeded, notification best-effort
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
