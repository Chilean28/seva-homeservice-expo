// Supabase Edge Function: send Expo push notification to a user.
// Auth:
//   - Authorization: Bearer SERVICE_ROLE_KEY with body { user_id, title, body, data? } (internal / other Edge Functions only)
//   - Authorization: Bearer <user JWT> with body { booking_id, title, body, data? } — recipient derived from booking (customer ↔ worker)
// Set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
  channelId?: string;
}

async function sendToUserId(
  supabase: ReturnType<typeof createClient>,
  user_id: string,
  title: string,
  messageBody: string,
  data?: Record<string, unknown>
): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
  };

  const { data: tokens, error: fetchError } = await supabase
    .from("push_tokens")
    .select("id, expo_push_token")
    .eq("user_id", user_id);

  if (fetchError || !tokens?.length) {
    return new Response(
      JSON.stringify({ sent: 0, message: "No push tokens for user" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const messages: ExpoMessage[] = tokens.map((t) => ({
    to: t.expo_push_token,
    title,
    body: messageBody,
    data: data ?? undefined,
    sound: "default",
  }));

  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });
  const result = (await res.json()) as
    | { data?: { status: string; id?: string; message?: string; details?: { error?: string } }[] }
    | { status?: string };
  const receipts = Array.isArray((result as { data?: unknown }).data)
    ? (result as { data: { status: string; message?: string; details?: { error?: string } }[] }).data
    : [];

  const invalidTokenIds: string[] = [];
  receipts.forEach((r, i) => {
    if (r.status === "error" && tokens[i]) {
      if (
        (r as { message?: string }).message?.includes("DeviceNotRegistered") ||
        (r as { details?: { error?: string } }).details?.error === "DeviceNotRegistered"
      ) {
        invalidTokenIds.push(tokens[i].id);
      }
    }
  });
  if (invalidTokenIds.length > 0) {
    await supabase.from("push_tokens").delete().in("id", invalidTokenIds);
  }

  const sent =
    receipts.length > 0
      ? receipts.filter((r) => r.status === "ok").length
      : res.ok
        ? messages.length
        : 0;
  return new Response(
    JSON.stringify({ sent, invalidRemoved: invalidTokenIds.length }),
    { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
  };

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const rawBody = (await req.json()) as Record<string, unknown>;
    const title = typeof rawBody.title === "string" ? rawBody.title : "";
    const messageBody = typeof rawBody.body === "string" ? rawBody.body : "";
    const data = rawBody.data as Record<string, unknown> | undefined;

    if (!title || !messageBody) {
      return new Response(
        JSON.stringify({ error: "title and body are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const authHeader = req.headers.get("Authorization")?.trim() ?? "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

    const isServiceRole = bearer === serviceRoleKey;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    if (isServiceRole) {
      const user_id = typeof rawBody.user_id === "string" ? rawBody.user_id : "";
      if (!user_id) {
        return new Response(
          JSON.stringify({ error: "user_id required for service role calls" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      return sendToUserId(supabaseAdmin, user_id, title, messageBody, data);
    }

    const booking_id = typeof rawBody.booking_id === "string" ? rawBody.booking_id : "";
    if (!booking_id) {
      return new Response(
        JSON.stringify({ error: "booking_id required (or call with service role and user_id)" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await supabaseAuth.auth.getUser();
    if (userErr || !user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: booking, error: bookErr } = await supabaseAdmin
      .from("bookings")
      .select("id, customer_id, worker_id")
      .eq("id", booking_id)
      .maybeSingle();

    if (bookErr || !booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const row = booking as { customer_id: string; worker_id: string | null };
    let recipientUserId: string | null = null;

    if (row.customer_id === user.id) {
      if (!row.worker_id) {
        return new Response(JSON.stringify({ error: "No worker on booking" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      const { data: wp } = await supabaseAdmin
        .from("worker_profiles")
        .select("user_id")
        .eq("id", row.worker_id)
        .maybeSingle();
      recipientUserId = (wp as { user_id?: string } | null)?.user_id ?? null;
    } else {
      const { data: wp } = await supabaseAdmin
        .from("worker_profiles")
        .select("id, user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const wid = (wp as { id?: string } | null)?.id;
      if (wid && row.worker_id === wid) {
        recipientUserId = row.customer_id;
      }
    }

    if (!recipientUserId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return sendToUserId(supabaseAdmin, recipientUserId, title, messageBody, data);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
