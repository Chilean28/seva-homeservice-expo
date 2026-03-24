import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

type RefundRow = {
  id: string;
  booking_id: string;
  worker_id: string;
  status: string;
  stripe_refund_id: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { ...corsHeaders } });
  }

  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!secretKey || !supabaseUrl || !serviceRoleKey || !anonKey) {
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { booking_id?: string; access_token?: string };
    const bookingId = body?.booking_id;
    if (!bookingId || typeof bookingId !== "string") {
      return new Response(
        JSON.stringify({ error: "booking_id required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.replace("Bearer ", "").trim()
      : body?.access_token?.trim() ?? null;
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header or access_token in body" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

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
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, worker_id, payment_method, payment_status, stripe_payment_intent_id, completed_at, updated_at")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError || !booking) {
      return new Response(
        JSON.stringify({ error: "Booking not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const workerProfileId = (booking as { worker_id?: string | null }).worker_id;
    if (!workerProfileId) {
      return new Response(
        JSON.stringify({ error: "Booking has no assigned worker" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const { data: workerRow } = await supabase
      .from("worker_profiles")
      .select("id, user_id")
      .eq("id", workerProfileId)
      .maybeSingle();
    const workerUserId = (workerRow as { user_id?: string } | null)?.user_id;
    if (!workerUserId || workerUserId !== user.id) {
      return new Response(
        JSON.stringify({ error: "Not authorized to confirm this refund" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const paymentMethod = (booking as { payment_method?: string | null }).payment_method;
    const paymentStatus = (booking as { payment_status?: string | null }).payment_status;
    const paymentIntentId = (booking as { stripe_payment_intent_id?: string | null }).stripe_payment_intent_id;
    if (paymentMethod !== "card" || paymentStatus !== "paid" || !paymentIntentId) {
      return new Response(
        JSON.stringify({ error: "Booking is not eligible for Stripe refund" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const completedAtRaw =
      (booking as { completed_at?: string | null }).completed_at ??
      (booking as { updated_at?: string | null }).updated_at;
    if (!completedAtRaw) {
      return new Response(
        JSON.stringify({ error: "Missing completion timestamp" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }
    const completedAt = new Date(completedAtRaw).getTime();
    if (!Number.isFinite(completedAt) || Date.now() - completedAt > 48 * 60 * 60 * 1000) {
      return new Response(
        JSON.stringify({ error: "Refund window has closed (48 hours)." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const { data: refundRequest, error: refundError } = await supabase
      .from("booking_refund_requests")
      .select("id, booking_id, worker_id, status, stripe_refund_id")
      .eq("booking_id", bookingId)
      .maybeSingle();
    if (refundError || !refundRequest) {
      return new Response(
        JSON.stringify({ error: "Refund request not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const row = refundRequest as RefundRow;
    if (row.worker_id !== workerProfileId) {
      return new Response(
        JSON.stringify({ error: "Refund request worker mismatch" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }
    if (row.status === "succeeded") {
      return new Response(
        JSON.stringify({ success: true, already_refunded: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }
    if (row.status !== "requested" && row.status !== "worker_confirmed" && row.status !== "failed") {
      return new Response(
        JSON.stringify({ error: `Refund is not actionable from status: ${row.status}` }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    await supabase
      .from("booking_refund_requests")
      .update({
        status: "processing",
        worker_confirmed_at: new Date().toISOString(),
        error_message: null,
      } as never)
      .eq("id", row.id);

    const stripe = new Stripe(secretKey);
    try {
      const refund = await stripe.refunds.create(
        { payment_intent: paymentIntentId, metadata: { booking_id: bookingId } },
        { idempotencyKey: `booking-refund-${bookingId}` },
      );

      await supabase
        .from("booking_refund_requests")
        .update({
          status: "succeeded",
          stripe_refund_id: refund.id,
          stripe_refund_status: refund.status ?? "succeeded",
          processed_at: new Date().toISOString(),
          error_message: null,
        } as never)
        .eq("id", row.id);

      await supabase
        .from("bookings")
        .update({ payment_status: "refunded" } as never)
        .eq("id", bookingId);

      return new Response(
        JSON.stringify({ success: true, refund_id: refund.id, refund_status: refund.status ?? "succeeded" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await supabase
        .from("booking_refund_requests")
        .update({
          status: "failed",
          stripe_refund_status: "failed",
          error_message: message,
          processed_at: new Date().toISOString(),
        } as never)
        .eq("id", row.id);

      return new Response(
        JSON.stringify({ error: message }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
});
