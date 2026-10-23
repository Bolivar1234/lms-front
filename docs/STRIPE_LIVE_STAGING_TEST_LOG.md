# Stripe live staging test log

Live tests against the staging stack (`api-staging.saythanks.org`, `e2e-school.circles.saythanks.org`, Stripe **test mode**, connected account `acct_1UTNDiLs9iObyLRq`). Scripts are in `scripts/live-stripe/`; they read Supabase keys from `.env.local` and need `STRIPE_RK` (a restricted test key) in the environment. Never commit keys. Each script creates its own users and cleans up through `/api/account/delete`.

Last run: 2026-10-23, main `d430120`.

## Results

| Area | Event / path | Result | Evidence |
|---|---|---|---|
| Checkout | create-payment-intent → confirm 4242 → `payment_intent.succeeded` | PASS | transaction `successful`, entitlement active |
| Checkout | declined card | PASS | transaction not successful, no entitlement |
| Checkout | redelivered event | PASS | idempotent |
| Refunds | partial `charge.refunded` | PASS | `refunded_amount` 2.50, status stays `successful`, entitlement active |
| Refunds | remaining refund | PASS | status `refunded`, `refunded_amount` 10, entitlement `revoked` |
| Refunds | redelivery to all 3 endpoints | PASS | no change |
| Connect | `account.updated` | PASS | tenant flags forced false, webhook restored all three from Stripe |
| Connect | `payout.paid` | PASS | `payouts` row `pending` → `paid`, `paid_at` set (row must exist before the event is delivered) |
| Connect | `payout.failed` | NOT RUN | Express account cannot take the `000999999991` test bank account (`oauth_not_supported`); needs a unit test with a signed mock event |
| Subscription | `invoice.payment_succeeded` (`subscription_create`) | PASS | transaction `successful`, subscription `active`, `provider_subscription_id` set |
| Subscription | `invoice.payment_succeeded` (`subscription_cycle`, test clock +32d) | PASS | `current_period_end` advanced one month |
| Subscription | `invoice.payment_failed` (failing card, clock +32d) | PASS | status `past_due` |
| Subscription | `customer.subscription.deleted` | PASS (by design) | see note below |

## Findings

- **`customer.subscription.deleted` does not expire a subscription whose paid period is still in the future.** `expire_subscription_if_due` (migration `20261011184827_subscription_cancellation_paid_access.sql`) returns false while `GREATEST(current_period_end, end_date) > now()`. An immediate Stripe cancel therefore leaves the row `active` until the period ends; with the period backdated, the same event expired the row. This matches the "paid access is never discarded" design, but it means **something must expire the row at the deadline**. `/api/cron/*` is not scheduled on staging, so that sweep has not been verified live. Also, the account-delete route returns 409 while such a row is active.
- Stripe delivers `payout.paid` within a second of creation, so a `payouts` row inserted afterwards never receives it, and events on connected accounts cannot be re-sent through the API (`POST /v1/events/{id}/retry` is refused for them).
- The school billing endpoint (`/api/billing/webhook/stripe`) also receives `invoice.*` and `customer.subscription.deleted`; its handling was not exercised here.

## Still open

- `payout.failed` (unit test with signed mock event).
- Schedule and verify the `/api/cron/*` jobs on staging, including the subscription expiry sweep.
- School billing webhook (`we_1UTLU6LU…`) invoice/subscription events.
- Disputes (`charge.dispute.*`) are not handled by `/api/stripe/webhook`.
- Rotate the test keys and signing secrets that were pasted into chat.
