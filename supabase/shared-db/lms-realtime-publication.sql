-- Publish the LMS community tables to Supabase Realtime on the shared DB.
--
-- Migration 20261001150000_community_realtime_mentions_876.sql adds
-- public.community_posts and public.community_comments to the
-- `supabase_realtime` publication. On the shared SayThanks database the LMS
-- tables live in the `lms` schema, so that migration publishes nothing for the
-- LMS, and a realtime channel on `lms.community_posts` is rejected with
-- "Unable to subscribe to changes with given parameters".
--
-- Idempotent: only adds a table that is not already published.
-- community_reactions stays unpublished on purpose (see that migration).

DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'no supabase_realtime publication here; skipping';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['community_posts', 'community_comments'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'lms' AND tablename = t
    ) THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE lms.%I', t);
  END LOOP;
END $$;
