-- Tighten the RLS policies that still grant `true` on tenant data.
--
-- A Supabase security scan flagged every policy whose USING / WITH CHECK is a
-- bare `true`. Policies are OR-ed, so one `true` SELECT policy makes the
-- tenant-scoped policies beside it moot: every row is readable by every
-- caller the policy names, in every school.
--
-- Fixed here:
--   profiles               anyone (anon too) could read every profile in every
--                          school, including stripe_customer_id.
--   messages               legacy chat table, unused by the app; anyone could
--                          read it and any signed-in user could write to any chat.
--   assignments            legacy table, unused by the app; any signed-in user
--                          could read every school's assignments.
--   comment_reactions      any signed-in user could read reactions in every school.
--   gamification_profiles  the global leaderboard policy overrode the
--                          per-school one (and leagues_opt_out).
--
-- Left as is on purpose (global reference data or public catalog, no tenant
-- data behind them): roles, permissions, role_permissions, gamification_levels,
-- league_tiers, landing_page_templates, course_categories, product_courses,
-- plan_courses, reviews; user_roles' policy is for supabase_auth_admin (the JWT
-- hook); certificate_verification_log only accepts inserts from the public
-- verify route and has no public read.
--
-- Tables with RLS on and no policies (webhook_events, tenant_ai_credentials,
-- cron_runs, …) are server-only by design: the service role bypasses RLS and
-- everyone else is denied.

-- ─── profiles ──────────────────────────────────────────────────────────────
-- Who may read a profile row besides its owner and super admins:
--   * signed-in members of the school in the caller's JWT, when the profile
--     belongs to that school too (dashboards, comments, community, leaderboards);
--   * anyone, for authors of published courses (public course pages).
-- Both checks read tenant_users / courses, whose own RLS would hide the rows,
-- so they are SECURITY DEFINER helpers.

CREATE OR REPLACE FUNCTION public.shares_current_tenant(target_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_users me
    JOIN public.tenant_users them ON them.tenant_id = me.tenant_id
    WHERE me.user_id = auth.uid()
      AND me.tenant_id = public.get_tenant_id()
      AND them.user_id = target_user
  );
$$;

CREATE OR REPLACE FUNCTION public.is_published_course_author(target_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.author_id = target_user AND c.status = 'published'
  );
$$;

REVOKE ALL ON FUNCTION public.shares_current_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_published_course_author(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shares_current_tenant(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_published_course_author(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Profiles are visible within the school" ON public.profiles;
CREATE POLICY "Profiles are visible within the school"
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (
    id = (SELECT auth.uid())
    OR (SELECT public.is_super_admin())
    OR ((SELECT auth.uid()) IS NOT NULL AND public.shares_current_tenant(id))
    OR public.is_published_course_author(id)
  );

-- ─── messages (legacy, unused) ─────────────────────────────────────────────
-- "Tenant admins can manage their members' messages" stays.
DROP POLICY IF EXISTS "Enable read access for all users" ON public.messages;
DROP POLICY IF EXISTS "Authenticated users can create messages" ON public.messages;

-- ─── assignments (legacy, unused) ──────────────────────────────────────────
-- "Tenant staff can manage tenant assignments" stays.
DROP POLICY IF EXISTS "Authenticated users can view assignments" ON public.assignments;

-- ─── comment_reactions ─────────────────────────────────────────────────────
-- A reaction is visible when its comment is; the subquery runs under the
-- caller's lesson_comments RLS.
DROP POLICY IF EXISTS "Authenticated users can view comment reactions" ON public.comment_reactions;
DROP POLICY IF EXISTS "Users can view reactions on readable comments" ON public.comment_reactions;
CREATE POLICY "Users can view reactions on readable comments"
  ON public.comment_reactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.lesson_comments c WHERE c.id = comment_reactions.comment_id)
  );

-- ─── gamification_profiles ─────────────────────────────────────────────────
-- "Anyone can view tenant profiles for leaderboard" (same school) and the
-- own-profile policies stay.
DROP POLICY IF EXISTS "Anyone can view gamification profiles for leaderboards" ON public.gamification_profiles;
