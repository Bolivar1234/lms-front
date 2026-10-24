# Hosted video: apply provider webhooks inline, with a sweep as backstop

Status: accepted (2026-10-23)

The earlier plan processed provider notifications through a durable queue with leases, fencing, reservations and a reconciler. For the first release we apply each verified webhook inline as an idempotent upsert keyed by provider namespace and event ID, and run a minute-by-minute sweep only to recover missed or stuck work. This removes most of the lifecycle machinery that reviewers found hardest to verify, and it makes the first release observable on staging, which has no scheduler today.

## Considered Options

- **Durable queue with leases and a reconciler (earlier plan).** Rejected for now: far more state to specify and test before any real traffic exists.
- **Inline apply plus sweep (chosen).** Simple, idempotent, and the sweep covers dropped notifications.

## Consequences

A webhook that cannot finish within the request is recovered by the sweep, so ready latency is bounded by the sweep interval in that case. Revisit with a queue if sustained webhook volume or processing that cannot finish within a request appears.
