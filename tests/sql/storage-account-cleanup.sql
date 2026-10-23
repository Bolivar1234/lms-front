-- Disposable LOCAL seeded database only. No object bytes or hosted storage used.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.tenant_users(tenant_id, user_id, role, status)
VALUES ('00000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'student', 'active')
ON CONFLICT (tenant_id, user_id) DO NOTHING;

INSERT INTO storage.objects(bucket_id, name) VALUES
('avatars', 'a1000000-0000-0000-0000-000000000001/cleanup-test.webp'),
('community-assets', '00000000-0000-0000-0000-000000000001/a1000000-0000-0000-0000-000000000001/cleanup-test.webp'),
('community-assets', '00000000-0000-0000-0000-000000000002/a1000000-0000-0000-0000-000000000001/cleanup-test.webp'),
('exercise-media', '00000000-0000-0000-0000-000000000002/7/a1000000-0000-0000-0000-000000000001/cleanup-test.webm'),
('payment-proofs', '00000000-0000-0000-0000-000000000002/a1000000-0000-0000-0000-000000000001/4/cleanup-test.pdf'),
('payment-proofs', 'student/00000000-0000-0000-0000-000000000002/a1000000-0000-0000-0000-000000000001/4/cleanup-test.pdf'),
('community-assets', '00000000-0000-0000-0000-000000000002/a1000000-0000-0000-0000-000000000004/cleanup-test.webp'),
('payment-proofs', 'platform/00000000-0000-0000-0000-000000000002/4/cleanup-test.pdf'),
('course-images', '00000000-0000-0000-0000-000000000002/cleanup-test.webp');

DO $$
DECLARE files jsonb;
BEGIN
  SELECT jsonb_agg(to_jsonb(f)) INTO files FROM public.prepare_account_deletion('a1000000-0000-0000-0000-000000000001') f
  WHERE f.name LIKE '%cleanup-test.%';
  IF COALESCE(jsonb_array_length(files), 0) <> 6 THEN RAISE EXCEPTION 'Exact own-user cleanup expected six fixtures, got %', files; END IF;
  IF files::text LIKE '%000000000004/cleanup-test%' OR files::text LIKE '%platform/%' OR files::text LIKE '%course-images%' THEN
    RAISE EXCEPTION 'Cleanup included another user or retained school asset: %', files;
  END IF;
  IF has_function_privilege('authenticated', 'public.prepare_account_deletion(uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.prepare_account_deletion(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'An untrusted caller can invoke global account cleanup';
  END IF;
  RAISE NOTICE 'PASS: service-owned user media cleaned across memberships; other users, school assets and platform proofs retained';
END $$;
ROLLBACK;
