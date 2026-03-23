# Business Logic & Cashflow – Presentation Q&A

Use this for professor (business) questions: flaws in the current design and likely questions with short talking points.

---

## Implemented vs next (v1 snapshot)

**Recently tightened or clarified in product/infra**

- **No sales tax line** in estimates (totals are not inflated by a separate tax line; policy as in Revenue & pricing below).
- **Geo / pending pool** — workers in range can see pending requests; RLS and location rules evolve with the product.
- **`send-push` Edge Function** — authenticated (service role / internal callers only); not a public unauthenticated broadcast.
- **`users` RLS** — profile reads/writes scoped so customers and workers only see what policies allow.
- **Booking coordinates** — location data on bookings where the flow captures it (maps / address flow).

**Not in this v1 (honest “next milestone”)**

- **Stripe webhooks** end-to-end (`payment_intent.*`, `charge.refunded`, disputes) — refunds and payment state sync with Stripe are not fully automated.
- **Full refund product** — partial refunds, Connect transfer reversals, and `payment_status: refunded` driven by Stripe events are not complete.
- **Cash** — platform fee / reconciliation on cash jobs is not enforced in product (see Cash vs card below).

If asked: *“We prioritized marketplace flow, RLS, and payment authorization; refunds and webhooks are the next milestone.”*

---

## 1. Business / cashflow flaws (current state)

### Revenue & pricing

- **Platform fee is fixed at 10%**  
  No tiering, no negotiation, no regional variation. Hardcoded in `create-checkout-session` and `charge-saved-card` (`PLATFORM_FEE_PERCENT = 10`).

- **No sales tax line in estimates**  
  Estimates use hourly rate × minimum hours (and promo on the customer side). Platform operates below tax-registration threshold for now; totals are not inflated by a separate “tax” line.

- **Stored “price” vs amount charged**  
  `bookings.price` stores the **hourly rate** (e.g. $50/hr), while the customer is charged **estimate total** (e.g. rate × 2 hours − discount). Reporting and worker “earnings” are based on `price`, so totals don’t match actual revenue or payouts.

- **Worker “Earnings” shows gross, not net**  
  Worker app “Earnings” tab sums `bookings.price` for completed jobs and does not subtract the 10% platform fee. Workers see something that looks like “total earned” but actual payouts (Stripe Connect) are 90% of the charged amount. Risk of confusion and trust issues.

### Cash vs card

- **Cash — platform fee (v1)**  
  When the worker marks a cash job complete, the platform attempts to debit **10%** of the job total from the worker’s **Stripe Connect balance** (Account Debits—same pipeline as payouts, no separate worker card screen). If Connect isn’t set up or **available** balance is too low, status is `pending` or `failed`. The platform still does not see the customer’s physical cash.

### Refunds & cancellations

- **Cancellation does not trigger refunds**  
  When a customer cancels, only `status` is set to `cancelled`. There is no refund for card payments and no update to `payment_status` (e.g. to `refunded`). Paid bookings can be cancelled with no money returned.

- **Cancellation fees not enforced in-app**  
  Review-booking and booking-detail copy have been aligned so the app does not promise an automatic late fee; automated fee logic is not implemented.

- **`payment_status: 'refunded'` exists in schema but is unused**  
  No code path sets `refunded` or calls Stripe refunds.

### Payment flow & worker payouts

- **If worker has no Stripe Connect, money stays on platform**  
  When `worker_id` is present but the worker has no `stripe_connect_account_id`, checkout/charge still succeed but there is no `transfer_data` or `application_fee_amount`. 100% stays in the platform Stripe account. There is no in-app flow to “pay worker later” or to block card payment until Connect is set up. (With Connect: platform keeps 10%, 90% transfers to worker.)

- **Booking detail shows payment state, not a second checkout**  
  Payment is taken during booking confirmation (`review-booking` / payment-methods): `create-checkout-session` (Checkout redirect) or `charge-saved-card` (saved card). The booking detail screen shows `payment_method` / `payment_status` and explanatory copy; it is not a second “Pay now” checkout.

- **Primary card flows vs legacy helpers**  
  The main customer flow uses **`charge-saved-card`** and **`create-checkout-session`** with optional **Stripe Connect** (10% platform fee when `stripe_connect_account_id` is set). Older or auxiliary functions (e.g. `create-payment-intent`) may exist for tests or edge cases—see `docs/STRIPE.md` and Edge Function comments for what is deployed.

### Trust, disputes, and compliance

- **No dispute or chargeback handling**  
  No handling of Stripe disputes/chargebacks (e.g. reverse transfer, mark booking, notify worker). Disputes would have to be handled manually in Stripe and DB.

- **No explicit terms or receipt**  
  No in-app terms of service, payment terms, or itemized receipt (e.g. service line items, platform fee). Hard to justify charges to a customer or auditor.

- **Promo is hardcoded**  
  Single promo code and discount are hardcoded in the customer app. No admin or config; not scalable for marketing or A/B tests.

---

## 2. Questions a business professor might ask

### Revenue model

1. **How does the platform make money?**  
   “We take a 10% platform fee on card payments. Cash bookings are currently not monetized.”

2. **Why 10%? How do you justify it vs competitors?**  
   Be ready to compare with TaskRabbit/Thumbtack (often 15–30%) and to say a lower take rate can help attract workers and volume; you’d tune with data (take rate, retention, worker supply).

3. **Do you charge sales tax?**  
   “Not as a separate line; we’re below the registration threshold for now. Estimates are hourly rate × minimum hours (minus promo if any).”

### Cash flow

4. **When does the platform get its 10%?**  
   “When the customer’s card is charged (typically when the job completes and the charge/capture runs), Stripe keeps 10% as application fee and 90% goes to the worker’s Connect account.”

5. **When does the worker get paid?**  
   “Funds hit the worker’s Connect balance when the charge succeeds (often at job completion for card bookings). Payout to the worker’s bank follows Stripe’s payout schedule.”

6. **What if the job is cancelled after the customer has paid?**  
   “Right now we don’t automatically refund. That’s a gap; we’d need a refund flow and possibly a cancellation policy (e.g. full refund if cancelled in time, partial or none later).”

### Cash vs card

7. **How do you make money on cash bookings?**  
   “We don’t today. We’d need either a separate cash commission flow (worker reports and pays a fee) or incentives to use card.”

8. **Why offer cash at all?**  
   “To reduce friction and support users who prefer or only have cash; we accept we don’t monetize those jobs in the current version.”

### Pricing and product

9. **Who sets the price?**  
   “Services have a base price; workers can set a custom price per service. The customer sees the worker’s price (or base) and we charge that with a minimum hours rule (and promo on the customer side when applicable).”

10. **Why does the worker app show ‘total earnings’ that don’t match payouts?**  
    “We show the sum of booking prices (and the stored value is the hourly rate, not the job total). Actual payouts are 90% of the charged amount via Stripe Connect. We should either show net earnings or clearly label the current number as ‘gross before platform fee’ and add a payouts view.”

### Risk and policy

11. **What if a customer disputes the charge?**  
    “We don’t have in-app dispute handling yet. We’d handle it in Stripe and, if needed, manually adjust records. Longer term we’d want dispute handling and possibly a reserve or reversal of the worker transfer.”

12. **What’s your cancellation policy?**  
    “We don’t enforce late-cancellation fees in-app yet. Customers cancel from the booking when allowed; card authorization release depends on timing and Stripe. Full refund policy and fee rules would be a future milestone.”

13. **How do you prevent workers from taking jobs and then not showing?**  
    “We have statuses (pending → accepted → ongoing → completed) and a response deadline for pending, but we don’t yet have penalties, no-show fees, or automatic refunds. That’s a product and policy gap.”

### Strategy and scalability

14. **How would you scale revenue?**  
    “Increase take rate where possible, reduce cash share (or add cash commission), add premium or subscription for workers or customers, and possibly dynamic pricing or featured placement.”

15. **What’s the single biggest business logic risk in the app today?**  
    “Cancellations/refunds and dispute handling (paid bookings can be cancelled without a full automated refund policy). That creates trust and ops risk until tightened.”

---

## 3. One-line answers (cheat sheet)

| Topic | Short answer |
|--------|---------------|
| Platform revenue | 10% fee on card payments only. |
| Sales tax | No separate sales-tax line in estimates (below threshold for now). |
| Worker pay | 90% of card payment via Stripe Connect; payouts on Stripe’s schedule. |
| Cash | No platform fee; no tracking of collection. |
| Refunds | Not implemented; cancellation doesn’t refund. |
| Cancellation fee | Not enforced in-app; copy aligned to avoid promising fees. |
| Worker earnings UI | Shows gross (sum of prices), not net after 10%. |
| Price in DB | Stores hourly rate; charged amount = rate × hours − discount (promo). |
| Worker without Connect | Payment succeeds; 100% stays on platform; no automatic payout. |

Use this doc to prep answers and to acknowledge flaws clearly (“we know we don’t handle X yet; we’d do Y next”). That usually goes over well in presentations.
