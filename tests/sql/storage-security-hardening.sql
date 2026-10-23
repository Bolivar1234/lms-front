-- Disposable LOCAL database only. These deliberate permissive-policy and object
-- fixtures prove that browser API calls cannot bypass the server upload boundary.
-- docker exec -i supabase_db_lms-front psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/sql/storage-security-hardening.sql
\set ON_ERROR_STOP on
BEGIN;
-- Match the Storage API's transaction setting so DELETE reaches its RLS policy
-- instead of the platform's unconditional direct-SQL deletion guard.
SET LOCAL storage.allow_delete_query = 'true';

INSERT INTO storage.objects (bucket_id, name)
SELECT bucket, 'storage-boundary-regression/probe.webp'
FROM unnest(ARRAY['payment-proofs', 'landing-page-assets', 'course-images', 'community-assets',
                  'certificates', 'exercise-media', 'lesson-resources', 'ai-chat-attachments', 'avatars']) bucket;

CREATE POLICY "Regression permissive policy cannot reopen app storage" ON storage.objects
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

SET LOCAL ROLE authenticated;
DO $$
DECLARE bucket text; affected integer;
BEGIN
  FOREACH bucket IN ARRAY ARRAY['payment-proofs', 'landing-page-assets', 'course-images', 'community-assets',
                                'certificates', 'exercise-media', 'lesson-resources', 'ai-chat-attachments', 'avatars'] LOOP
    BEGIN
      INSERT INTO storage.objects(bucket_id, name) VALUES (bucket, 'storage-boundary-regression/forged.webp');
      RAISE EXCEPTION 'Browser INSERT unexpectedly succeeded: %', bucket;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    UPDATE storage.objects SET metadata = '{"forged":true}'::jsonb
      WHERE bucket_id = bucket AND name = 'storage-boundary-regression/probe.webp';
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'Browser UPDATE unexpectedly succeeded: %', bucket; END IF;
    DELETE FROM storage.objects WHERE bucket_id = bucket AND name = 'storage-boundary-regression/probe.webp';
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'Browser DELETE unexpectedly succeeded: %', bucket; END IF;
  END LOOP;
  IF EXISTS (SELECT FROM storage.objects WHERE bucket_id IN ('payment-proofs', 'exercise-media', 'lesson-resources', 'ai-chat-attachments')
      AND name = 'storage-boundary-regression/probe.webp') THEN
    RAISE EXCEPTION 'Browser read leaked private app objects';
  END IF;
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id IN ('landing-page-assets', 'course-images', 'community-assets', 'certificates', 'avatars')
      AND name = 'storage-boundary-regression/probe.webp') <> 5 THEN
    RAISE EXCEPTION 'Public media reads regressed';
  END IF;
END $$;

RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    INSERT INTO storage.objects(bucket_id, name) VALUES ('avatars', 'storage-boundary-regression/anonymous.webp');
    RAISE EXCEPTION 'Anonymous INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF EXISTS (SELECT FROM storage.objects WHERE bucket_id = 'payment-proofs' AND name = 'storage-boundary-regression/probe.webp') THEN
    RAISE EXCEPTION 'Anonymous read leaked a payment proof';
  END IF;
END $$;
RESET ROLE;

-- The service writer still supports repeated upserts on the same proof key.
SET LOCAL ROLE service_role;
INSERT INTO storage.objects(bucket_id, name, metadata)
VALUES ('payment-proofs', 'storage-boundary-regression/service-proof.pdf', '{"version":1}')
ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = EXCLUDED.metadata;
INSERT INTO storage.objects(bucket_id, name, metadata)
VALUES ('payment-proofs', 'storage-boundary-regression/service-proof.pdf', '{"version":2}')
ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = EXCLUDED.metadata;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM storage.objects WHERE bucket_id = 'payment-proofs'
      AND name = 'storage-boundary-regression/service-proof.pdf' AND metadata->>'version' = '2') THEN
    RAISE EXCEPTION 'Trusted proof replacement regressed';
  END IF;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF EXISTS (SELECT FROM storage.buckets WHERE id IN ('landing-page-assets', 'course-images', 'avatars')
      AND 'image/svg+xml' = ANY(allowed_mime_types)) THEN RAISE EXCEPTION 'SVG uploads remain enabled'; END IF;
  IF NOT EXISTS (SELECT FROM storage.buckets WHERE id = 'exercise-media' AND NOT public AND file_size_limit = 104857600) THEN
    RAISE EXCEPTION 'Exercise recording bucket not tracked with the expected limit'; END IF;
  IF NOT EXISTS (SELECT FROM storage.buckets WHERE id = 'community-assets'
      AND ARRAY['video/webm', 'video/quicktime'] <@ allowed_mime_types) THEN RAISE EXCEPTION 'Community video MIME compatibility regressed'; END IF;
  RAISE NOTICE 'PASS: direct app storage writes/private reads denied despite permissive sibling policy; public reads and service upserts preserved';
END $$;
ROLLBACK;
