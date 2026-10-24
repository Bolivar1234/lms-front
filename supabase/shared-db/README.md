# Shared SayThanks DB (staging): LMS setup

One auth service and one Postgres database serve both SayThanks and the LMS.
The LMS lives in the `lms` schema. Production is not on this setup yet.

## Files

- `lms-schema-search-path.sql`: points `lms` functions at `lms, public` so
  unqualified table names resolve. Idempotent.
- `lms-access-token-hook.sql`: the access token hook. Picks the highest
  privilege role when a user has several `lms.user_roles` rows.
- `lms-realtime-publication.sql`: publishes `lms.community_posts` and
  `lms.community_comments` to Realtime. The repo migration publishes the
  `public.` tables, which do not exist for the LMS on the shared DB.
- `lms-tenant-slug-reserved.sql`: blocks platform host labels as school slugs.
- `lms-catchup-20261024.sql`: the 21 repo migrations the staging `lms` schema was
  missing after the upstream syncs (#33, #34): billing mode, tenant assets, read gates,
  the AI evals tables and more. Generated, one transaction, with a preflight and a
  ledger (`lms.lms_migration_log`). Applied to staging on 2026-10-24 (21/21 in the
  ledger). Its preflight referenced the ledger statically and failed on the fresh
  schema, so the ledger was created first with the bundle's own definition and the file
  ran unchanged. The generator now emits a dynamic-SQL preflight; this file is kept as
  the record of what ran.

- `lms-catchup-20261024b.sql`: `20261026121500_tighten_permissive_rls` (#38; renamed from 20261026120000, which upstream also uses). Replaces the
  `true` read policies on `profiles`, `messages`, `assignments`, `comment_reactions` and
  `gamification_profiles` with school-scoped ones. Not yet applied.

## Applying new repo migrations

The shared DB has no migration history for `lms`. Build a bundle of the migrations
added between two refs, read it (the header lists every statement that touches the
shared `storage` schema), then run it on the host:

```bash
node scripts/shared-db/build-lms-bundle.mjs <last-applied-ref> origin/main supabase/shared-db/lms-catchup-<date>.sql
docker exec -i saythanks-staging-db-1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 < lms-catchup-<date>.sql
```

The bundle records each version in `lms.lms_migration_log` and refuses to run if any
of its versions is already there.

## Staging auth settings (GoTrue)

These live in the staging `.env` on the Hetzner host. Changing them needs an
auth container recreate (`docker compose up -d --no-deps auth`).

| Setting | Value | Why |
| --- | --- | --- |
| `SITE_URL` | `https://staging.saythanks.org` | default host for emails |
| `ADDITIONAL_REDIRECT_URLS` | `https://circles.saythanks.org/**,https://*.circles.saythanks.org/**,https://staging.saythanks.org/**` | lets the LMS tenant hosts receive confirmation and reset links |

Before this, `SITE_URL` was `http://localhost:3000` and the allow-list was
empty, so LMS confirmation links pointed at localhost.

Hook wiring: `GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED=true` and
`GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI=pg-functions://postgres/app_private/custom_access_token_hook`.

## Verify

- Sign up with `redirect_to=https://<tenant>.circles.saythanks.org/auth/confirm`.
  The confirmation link in the email should carry that `redirect_to`.
- Sign in as a teacher, admin and student. The `user_role` claim should be
  `teacher`, `admin` and `student`.
