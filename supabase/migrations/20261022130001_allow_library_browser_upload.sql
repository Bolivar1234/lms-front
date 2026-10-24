-- The asset library (upstream #999) uploads from the browser into
-- landing-page-assets/<school>/library/. The restrictive insert policy from
-- 20261022120000_storage_security_hardening.sql blocks every browser insert into that
-- bucket, so the upload failed. Allow browser inserts into the library folder only;
-- every other path in these buckets stays server-only.
--
-- A restrictive policy still has to pass, and the permissive "Staff upload into their
-- school folder" policy (20261022130000_tenant_assets.sql) still pins the first folder to a
-- school the caller is staff of. Bucket size and MIME limits still apply. Trade-off: library
-- uploads skip the server-side content check that app/actions/storage.ts performs.
DROP POLICY IF EXISTS "App storage writes require trusted server insert" ON storage.objects;
CREATE POLICY "App storage writes require trusted server insert" ON storage.objects
AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (
  bucket_id NOT IN ('payment-proofs', 'landing-page-assets', 'course-images', 'community-assets',
                   'certificates', 'exercise-media', 'lesson-resources', 'ai-chat-attachments', 'avatars')
  OR (bucket_id = 'landing-page-assets' AND (storage.foldername(name))[2] = 'library')
);
