# Presentation demo script (fill during rehearsal)

Use this as a **numbered run-through** plus **backup lines** if something fails.

## 1. Before you go live

- [ ] Customer and worker apps build; Supabase project is up; test users exist.
- [ ] Stripe test mode if showing card flow; know which account is “customer” vs “worker.”

## 2. Demo flow (edit steps to match your build)

1. **Open customer app** — sign in (or stay signed in). *Backup:* “We’re using a pre-seeded demo account.”
2. **Home / search** — show discovery or map. *Backup:* “Map depends on location permission; here’s the list view.”
3. **Create or open a booking** — show status progression you actually have (pending → accepted, etc.).
4. **Worker app** — accept or show job list. *Backup:* “In production this is real-time via Supabase.”
5. **Optional: card / Stripe** — only if green in test mode. *Backup:* “We’re showing the booking flow; card capture is Stripe test mode in our environment.”

## 3. If X fails, say Y

| If… | Say… |
|-----|------|
| Map blank or slow | “We’re on simulator / network; the flow uses the same APIs as device.” |
| Push doesn’t fire | “Push needs device + tokens; for the demo the in-app booking state is the source of truth.” |
| Stripe errors | “We’re on test keys; production uses Connect and Dashboard webhooks as the next milestone.” |
| Auth / RLS error | “RLS is scoped per role; this account might need a refresh — design is least privilege.” |

## 4. One-liner for “what’s next?”

*“Marketplace and RLS are in; automated refunds and Stripe webhooks for payment state are the next milestone.”*
