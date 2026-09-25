<div align="center">

# VSP Sport

**Production operations platform for a custom jersey manufacturer.**

Order intake → 11-stage production pipeline → automated WhatsApp updates → customer tracking.

[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres_%2B_RLS-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-000000?logo=vercel&logoColor=white)](https://menarasport.vercel.app)

[**Live demo**](https://menarasport.vercel.app) · [Customer tracking](https://menarasport.vercel.app/track)

</div>

---

## The problem

VSP Sport produces custom full-printing jerseys. Every order passes through eleven production stages across different workstations — design, layout, colour proofing, printing, press transfer, cutting, sewing, finishing, QC, packing, shipping.

Before this platform, keeping customers informed meant someone pausing work to answer *"how far along is my order?"* on WhatsApp. Order status lived in the operator's head; the customer had no way to check it themselves.

Three problems followed from that:

- **No visibility.** Customers messaged repeatedly for updates that were already known internally.
- **No accountability.** Nothing recorded when an order actually moved between stages, so a stalled order was invisible until the customer complained.
- **No memory.** Deadlines were tracked verbally, and photo assets (design approvals, work orders) were scattered across shared chats.

This platform turns that flow into a tracked, self-reporting pipeline: the moment an operator advances a stage, the system records the history, recalculates progress, and notifies the customer automatically.

## What it does

| Module | What it does |
|---|---|
| **Orders dashboard** | Create, search, edit and advance jersey orders through the 11-stage pipeline. Deadline tracking, design & work-order photo uploads, per-order production reports. |
| **Maklon dashboard** | A separate 6-stage pipeline for toll-manufacturing (maklon) jobs, with its own numbering and stage set. |
| **Automated WhatsApp updates** | Each genuine stage change sends a templated update to the customer via the Fonnte gateway — deduplicated so a stage can never notify twice. |
| **Deadline reminders** | A scheduled job warns production staff about orders due in 3 / 2 / 1 days, configurable per installation. |
| **Customer tracking** | Customers check progress themselves with order number + phone, or through a signed link sent over WhatsApp. No login, no phone call. |
| **Reports** | Average production turnaround, derived from the recorded stage history rather than a manually maintained sheet. |
| **Settings** | Shop profile, WhatsApp gateway token, reminder schedule and monthly capacity — all editable from the dashboard. |

## Screenshots

**Home / entry point**

![Home](docs/screenshots/01-home.png)

**Orders dashboard**

![Orders dashboard](docs/screenshots/03-orders-dashboard.png)

<table>
<tr>
<td width="50%">

**Maklon (toll manufacturing) dashboard**

![Maklon dashboard](docs/screenshots/05-maklon-dashboard.png)

</td>
<td width="50%">

**Customer tracking page**

![Customer tracking](docs/screenshots/07-customer-tracking.png)

</td>
</tr>
<tr>
<td width="50%">

**Customer status timeline**

![Customer status](docs/screenshots/06-customer-status.png)

</td>
<td width="50%">

**Mobile dashboard**

![Mobile dashboard](docs/screenshots/04-orders-dashboard-mobile.png)

</td>
</tr>
</table>

<details>
<summary>Login screen</summary>

![Login](docs/screenshots/02-login.png)

</details>

## Architecture

A single Next.js App Router application. Server Components read data directly; mutations go through Route Handlers that own the authorisation check.

```
Browser
  dashboards · tracking pages · public entry page
        │
        ▼
Next.js 15 (App Router) on Vercel
  middleware.ts        session refresh, tags each request with its pathname
  Server Components    read through the service client
  Route Handlers       getAdminDb()   auth check FIRST, then service client
                       tracking       phone match / signed token, then read
                       cron           CRON_SECRET, then service client
        │
        ▼
Supabase (Postgres)
  all tables           RLS enabled, zero anon policies — service role only
  public read          only the shop identity + stage-name lists the status pages need
  RPCs                 atomic stage-claim for notifications
        │
        ├──▶ Fonnte (WhatsApp gateway)
        └──▶ Cloudinary (media)
```

### Data model

The schema is versioned as SQL migrations. Three baseline files describe a fresh database (`0001` schema, `0002` functions, `0003` seed); everything after that is incremental and idempotent, so an existing database applies only the files it hasn't seen. Eleven tables remain — everything that served the marketing site was dropped once the platform was scoped to operations. The core of it:

| Table | Holds |
|---|---|
| `orders` | Order number, customer, deadline, `current_status`, `current_stage`, photo assets, product line items |
| `order_status_history` | Append-only record of every stage transition, with notes, photos and timestamps |
| `maklon_orders` / `maklon_status_history` | The equivalent pair for toll-manufacturing jobs |
| `production_steps` / `maklon_steps` | Operator-editable stage names, so the pipeline isn't hardcoded |
| `notification_logs` | Deadline reminder attempts: recipient, status, provider error, days-to-deadline |
| `stage_notification_logs` | Anti-duplicate slot claims for stage updates — the unique `(order_id, stage)` that makes double-sends impossible |
| `app_settings` | Encrypted gateway token, reminder schedule, capacity |

## Engineering notes

A few parts that were genuinely interesting to get right.

**One source of truth for "what stage is this order at?".** `current_status` has 12 possible values but the pipeline only has 11 stages — `selesai` (completed) is a terminal order state, not a twelfth stage. The rule "completed = final stage = 100%" was originally re-implemented in four places, and each copy had its own missing guard. It now lives once in `lib/order-status.ts`, together with a normalisation map that transparently upgrades legacy slugs (`print`, `pres`, `potong`) from an earlier 9-stage pipeline. Old rows keep reading correctly without a data migration.

**Stage notifications that cannot double-send.** Advancing a stage triggers a WhatsApp message, and the naive implementation races: two operators tapping at once, or a client retry, sends the customer the same update twice. `lib/fonnte.ts` instead calls an RPC (`claim_stage_notification`) that wins or loses on a unique `(order_id, stage)` constraint *before* any message is sent. A lost claim means another request already sent it. `last_notified_stage` is only written after the provider confirms success, so a failed send is retried rather than silently dropped.

**A silent notification outage, found by calling the function.** That anti-duplicate log lived in a table which an unrelated later migration dropped and recreated for a different purpose. Nothing failed loudly: the table existed, the RPC existed, and the app reported nothing worse than a log line — but the claim now errored on a missing column, and the trigger returned early, so *no* jersey stage notification had been going out. Calling the RPC directly returned `column "stage" does not exist`, which is what a passing type-check and a green build can never tell you. The log moved to its own table (`stage_notification_logs`), the RPCs were rewritten against it, and a regression check against the RPC itself was added to the migration notes.

**Tracking links that don't leak.** A dashboard behind a shared password is fine for staff, but customers shouldn't need accounts. Jersey orders are verified by normalising both sides to digits before comparing the phone number. Messages sent over WhatsApp carry an HMAC-SHA256 signed token (30-day TTL) so the link works without re-typing an order number, while `/status`, `/track` and `/status/maklon` resolve independently and never expose one customer's data to another.

**Photos without a media server.** Design approvals and work orders are uploaded straight from the browser to Cloudinary via an unsigned upload preset; only the resulting URLs are stored. A server-side fallback route handles cases the browser preset can't.

**Order numbers that survive being read aloud.** `VSP` + `YYMMDD` + four characters drawn from a CSPRNG, with the ambiguous characters `B I O L 0 1` removed from the alphabet. Uniqueness is checked against the database with retry, because customers read these numbers over the phone. Numbers minted before the rename (`MENARA…`) still resolve on the tracking page, so links already sent to customers keep working.

## Security model

Worth calling out, because the first version of this app had a serious flaw that the rewrite fixed.

**What was wrong.** The operational tables shipped with row-level security enabled but policies written as `USING (true)` for the `public` role. Because `NEXT_PUBLIC_SUPABASE_ANON_KEY` is embedded in the browser bundle by design, anyone who opened DevTools could read *every* customer record — names, phone numbers, cities — insert fabricated orders, or rewrite any order's status and tracking number by calling the REST API directly. The application never came into it. Public signup was also enabled, and content tables granted writes to any authenticated user.

**What changed.**

- **Authorisation moved to the server.** All 38 call sites that touch operational tables now use a service-role client created in exactly one place (`createServiceClient()`), used only from server code. The public anon key no longer has any access to customer data.
- **A single guard, applied first.** `getAdminDb()` verifies the admin session and returns the service client only if it passes — so every handler begins with an explicit 401 path rather than trusting RLS to filter results.  It was added to 15 handler functions across 10 routes that previously had no authorisation check at all — including two that could rewrite an order's stage (and therefore message a customer) and one that could change the shop's WhatsApp number.
- **The RLS hole was closed.** The permissive policies were removed from the four operational tables and both stage lists, verified by attempting an unauthenticated write against the live database and confirming it is rejected with a row-level security error. The baseline schema simply never grants them: anon can read the shop identity and the stage-name lists, nothing else.
- **RPCs are service-role only.** The notification/settings functions are `SECURITY DEFINER`, so the grants matter more than the table policies. They are revoked from `public`, `anon` and `authenticated` and granted to `service_role` — otherwise the public anon key could overwrite the WhatsApp token or claim a stage on someone else's behalf and silence their notifications.
- **Public signup disabled**, neutralising the `authenticated`-role policies on content tables at once.
- **Secrets stay encrypted.** The WhatsApp gateway token is stored AES-256-GCM encrypted (key from the environment, never in code), so a database dump alone doesn't expose the account.
- **The remaining anon surface is only what has to be public:** the stage-name lists the customer status pages read, nothing else.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router), React 19 | Server Components keep DB credentials and secrets off the client while still allowing rich dashboards |
| Language | TypeScript, `strict` | The status/pipeline logic spans a dozen files; the compiler catches the drift |
| Styling | Tailwind CSS 3 + Radix UI primitives | Design tokens live in CSS variables so the brand palette is themeable in one place |
| Database | Supabase (Postgres) + RLS | Real relational constraints for order history, plus a first-party RPC path for atomic claims |
| Media | Cloudinary | Direct-from-browser uploads, no media server to run |
| Messaging | Fonnte (WhatsApp gateway) | Where the customers already are; no app install required |
| Hosting | Vercel | Cron for reminders, plus edge middleware for session refresh |

## Status

Shipped to production and in daily operational use. The platform deliberately covers operations only — no storefront, no catalogue — so the data model stays as small as the work it supports.

## Author

Built by **Your Name** <!-- TODO: ganti dengan nama kamu --> · [GitHub](https://github.com/ersetdigital-sudo) · [Live demo](https://menarasport.vercel.app)
