// Serves an HTML page with Stripe.js Card Element. User enters card; on submit we create
// a PaymentMethod and redirect to success URL with ?payment_method_id=pm_xxx
// Query params: pk (Stripe publishable key), redirect (optional, default sevacustomer://add-card-success).
// Worker app uses redirect=sevaworker://add-card-success

function escapeJsString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

const HTML = (pk: string, successRedirect: string) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Add card</title>
  <script src="https://js.stripe.com/v3/"></script>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f8f9fa; }
    h1 { font-size: 20px; margin-bottom: 20px; }
    #card-element { background: #fff; padding: 14px; border-radius: 8px; border: 1px solid #e0e0e0; margin-bottom: 16px; }
    button { width: 100%; padding: 14px; font-size: 16px; font-weight: 600; background: #FFEB3B; color: #000; border: 1px solid #F9A825; border-radius: 12px; cursor: pointer; }
    button:disabled { opacity: 0.7; cursor: not-allowed; }
    .error { color: #d32f2f; font-size: 14px; margin-top: 12px; }
  </style>
</head>
<body>
  <script>var STRIPE_PK = "${escapeJsString(pk)}"; var SUCCESS_REDIRECT = "${escapeJsString(successRedirect)}";</script>
  <h1>Add card</h1>
  <form id="form">
    <div id="card-element"></div>
    <div id="card-errors" class="error" role="alert"></div>
    <button type="submit" id="submit">Save card</button>
  </form>
  <script>
    var pk = (typeof STRIPE_PK !== 'undefined' && STRIPE_PK) || decodeURIComponent((new URLSearchParams(window.location.search).get('pk') || '').replace(/\\+/g, ' '));
    if (!pk || pk.indexOf('pk_') !== 0) {
      document.body.innerHTML = '<p class="error">Missing publishable key.</p>';
    } else {
      var stripe = Stripe(pk);
      var elements = stripe.elements();
      var cardElement = elements.create('card', { style: { base: { fontSize: '16px' } } });
      cardElement.mount('#card-element');
      cardElement.on('change', function(e) {
        document.getElementById('card-errors').textContent = e.error ? e.error.message : '';
      });
      document.getElementById('form').addEventListener('submit', function(e) {
        e.preventDefault();
        var btn = document.getElementById('submit');
        btn.disabled = true;
        document.getElementById('card-errors').textContent = '';
        stripe.createPaymentMethod({ type: 'card', card: cardElement }).then(function(r) {
          if (r.error) {
            document.getElementById('card-errors').textContent = r.error.message || 'Failed';
            btn.disabled = false;
            return;
          }
          var base = (typeof SUCCESS_REDIRECT !== 'undefined' && SUCCESS_REDIRECT) ? SUCCESS_REDIRECT : 'sevacustomer://add-card-success';
          var sep = base.indexOf('?') >= 0 ? '&' : '?';
          window.location = base + sep + 'payment_method_id=' + encodeURIComponent(r.paymentMethod.id);
        }).catch(function() {
          document.getElementById('card-errors').textContent = 'Something went wrong.';
          btn.disabled = false;
        });
      });
    }
  </script>
</body>
</html>
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }
  const url = new URL(req.url);
  const pk = url.searchParams.get("pk") || "";
  const successRedirect =
    url.searchParams.get("redirect")?.trim() || "sevacustomer://add-card-success";
  const html = HTML(pk, successRedirect);
  return new Response(html, {
    status: 200,
    headers: new Headers([
      ["Content-Type", "text/html; charset=utf-8"],
      ["Cache-Control", "no-store"],
      ["X-Content-Type-Options", "nosniff"],
      ["Access-Control-Allow-Origin", "*"],
    ]),
  });
});
