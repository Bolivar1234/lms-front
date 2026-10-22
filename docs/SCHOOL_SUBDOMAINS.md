# School subdomains on a shared root domain

A school lives at `<slug>.<NEXT_PUBLIC_PLATFORM_DOMAIN>`. To serve schools at
`<slug>.saythanks.org` instead of `<slug>.circles.saythanks.org`, the platform
domain becomes the shared root. The root also holds other products' hosts
(`www`, `staging`, `api`, `api-staging`…), so three things keep them apart.

## What the code does

- `lib/tenant/host.ts` turns a host into a school slug, shared by `proxy.ts`
  and the auth email hook. It returns no school for localhost, the bare root,
  any host in `NEXT_PUBLIC_PLATFORM_HOSTS`, a reserved label, or a nested host.
- `lib/tenant/reserved-slugs.ts` lists labels no school may take. The
  `tenants_slug_not_reserved_check` constraint enforces the same list in the
  database (`supabase/migrations/20261022000000_tenant_slug_reserved.sql`; the
  shared-DB copy is `supabase/shared-db/lms-tenant-slug-reserved.sql`), and a
  unit test keeps the two lists equal.
- An unknown school URL redirects to the first `NEXT_PUBLIC_PLATFORM_HOSTS`
  entry, not to the bare root, which is another product on `saythanks.org`.

## Cutover checklist (nothing here is applied automatically)

1. Apply `lms-tenant-slug-reserved.sql` to the shared DB. Check no tenant uses
   a reserved slug, then `VALIDATE CONSTRAINT tenants_slug_not_reserved_check`.
2. Build the LMS with `NEXT_PUBLIC_PLATFORM_DOMAIN=saythanks.org` and
   `NEXT_PUBLIC_PLATFORM_HOSTS=circles.saythanks.org` (both are build-time).
   Also update `NEXT_PUBLIC_APP_URL` if it should point at the LMS home host.
3. DNS: add a wildcard `*.saythanks.org` record to the same server. Existing
   explicit records (`www`, `staging`, `api`…) keep winning over the wildcard.
4. Routing: the LMS app needs a wildcard host rule for `*.saythanks.org`, with
   lower priority than the exact hosts the other apps use. Check
   `staging.saythanks.org`, `www.saythanks.org` and `api-staging.saythanks.org`
   still reach their own apps after the change.
5. TLS: a first-level wildcard covers `*.saythanks.org`. Confirm the certificate
   source (Cloudflare proxy or a DNS-01 wildcard cert).
6. Auth redirects: add `https://*.saythanks.org/**` to
   `ADDITIONAL_REDIRECT_URLS`. Keep the `circles` entries until old links expire.
7. Session cookies: the app scopes them to `.<platform domain>`, so on
   `saythanks.org` they are visible to every `*.saythanks.org` host, including
   the SayThanks apps, which use the same Supabase project and cookie name.
   Decide whether shared sign-in across both products is wanted before cutover.

Existing schools on `*.circles.saythanks.org` stop resolving once the platform
domain changes, so move them or run both domains side by side until they are
migrated.
