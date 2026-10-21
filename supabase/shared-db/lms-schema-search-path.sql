-- Shared-DB setup for the LMS `lms` schema (SayThanks staging).
--
-- The LMS schema was loaded from a schema-only dump that renamed `public.` to
-- `lms.`. Functions created with `SET search_path = public` still reference
-- unqualified tables (e.g. league_memberships), so they fail at runtime with
-- "relation does not exist". Point every such function at `lms` first.
--
-- Idempotent: functions already on `lms, public` are skipped.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'lms'
      AND p.proconfig @> ARRAY['search_path=public']
  LOOP
    EXECUTE 'ALTER FUNCTION ' || r.sig || ' SET search_path = lms, public';
  END LOOP;
END
$$;
