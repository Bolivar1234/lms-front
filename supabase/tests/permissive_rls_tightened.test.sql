-- 20261026120000_tighten_permissive_rls: profiles, messages, assignments,
-- comment_reactions and gamification_profiles no longer have `true` read
-- policies. Run with `supabase test db` against a seeded local stack
-- (supabase/seed.sql: default school = owner a1…02 + student a1…01; code-academy
-- = creator a1…03 + student a1…04; every admin authors published courses).
-- Everything rolls back.
BEGIN;
SELECT plan(14);

CREATE FUNCTION pg_temp.act_as(uid uuid, tenant uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'tenant_id', tenant)::text, true);
$$;

-- No `true` policy is left on the tables this migration owns.
SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('profiles', 'messages', 'assignments', 'comment_reactions', 'gamification_profiles')
     AND (qual = 'true' OR with_check = 'true')),
  0, 'no permissive true policy remains on the tightened tables');

-- A second, non-author student in the default school.
INSERT INTO auth.users (id, email) VALUES ('a1000000-0000-0000-0000-0000000000e1', 'pgtap-rls@example.invalid');
INSERT INTO public.profiles (id, full_name) VALUES ('a1000000-0000-0000-0000-0000000000e1', 'Classmate')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.tenant_users (tenant_id, user_id, role, status)
  VALUES ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000e1', 'student', 'active');

-- ── student in the default school ──────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('a1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001');

SELECT ok(EXISTS (SELECT 1 FROM public.profiles WHERE id = 'a1000000-0000-0000-0000-000000000001'),
  'a student reads their own profile');
SELECT ok(EXISTS (SELECT 1 FROM public.profiles WHERE id = 'a1000000-0000-0000-0000-0000000000e1'),
  'a student reads a classmate in the same school');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = 'a1000000-0000-0000-0000-000000000004'),
  'a student cannot read a student of another school');
SELECT ok(EXISTS (SELECT 1 FROM public.profiles WHERE id = 'a1000000-0000-0000-0000-000000000003'),
  'published course authors stay readable (public course pages)');
SELECT is((SELECT count(*)::int FROM public.messages), 0, 'a student reads no legacy messages');
SELECT is((SELECT count(*)::int FROM public.assignments), 0, 'a student reads no legacy assignments');
SELECT throws_ok(
  $$INSERT INTO public.messages (message, chat_id, sender) VALUES ('x', 1, 'user')$$,
  '42501', NULL, 'a student cannot write to the legacy messages table');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.gamification_profiles
                      WHERE tenant_id = '00000000-0000-0000-0000-000000000002'),
  'leaderboard rows of another school are hidden');

-- A JWT naming a school the caller does not belong to grants nothing extra.
SELECT pg_temp.act_as('a1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = 'a1000000-0000-0000-0000-000000000004'),
  'a foreign tenant claim does not expose that school''s members');

-- ── admin of code-academy ──────────────────────────────────────────────────
SELECT pg_temp.act_as('a1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002');
SELECT ok(EXISTS (SELECT 1 FROM public.profiles WHERE id = 'a1000000-0000-0000-0000-000000000004'),
  'a school admin reads their students');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = 'a1000000-0000-0000-0000-0000000000e1'),
  'a school admin cannot read another school''s students');

-- ── anonymous visitor (a forged x-tenant-id header changes nothing) ────────
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT set_config('request.headers', '{"x-tenant-id":"00000000-0000-0000-0000-000000000001"}', true);
SELECT ok(NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = 'a1000000-0000-0000-0000-0000000000e1'),
  'an anonymous visitor cannot read students');
SELECT ok(EXISTS (SELECT 1 FROM public.profiles WHERE id = 'a1000000-0000-0000-0000-000000000002'),
  'an anonymous visitor reads published course authors');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
