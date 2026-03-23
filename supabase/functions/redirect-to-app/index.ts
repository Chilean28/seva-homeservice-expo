// Redirects to an app deep link. Used so Stripe account link return_url/refresh_url can be HTTPS
// (Stripe rejects custom schemes). GET ?url=<encoded-app-url> -> 302 to decoded url (sevaworker:// only).

const ALLOWED_SCHEMES = ["sevaworker://", "sevacustomer://"];

Deno.serve(async (req) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  const url = new URL(req.url);
  const target = url.searchParams.get("url");
  if (!target || typeof target !== "string") {
    return new Response("Missing url parameter", { status: 400 });
  }
  const decoded = decodeURIComponent(target).trim();
  const allowed = ALLOWED_SCHEMES.some((s) => decoded.toLowerCase().startsWith(s));
  if (!allowed) {
    return new Response("Invalid redirect target", { status: 400 });
  }
  return new Response(null, {
    status: 302,
    headers: { Location: decoded },
  });
});
