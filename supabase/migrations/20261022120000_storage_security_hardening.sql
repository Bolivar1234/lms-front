-- App uploads are authorized and byte-validated by trusted server entry points.
-- A role check in a UI/server action cannot constrain a direct Storage API call.
DROP POLICY IF EXISTS "Users upload payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Users read payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Tenant admins can upload landing page assets" ON storage.objects;
DROP POLICY IF EXISTS "Tenant admins can delete landing page assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload course images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete course images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload community assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own community assets" ON storage.objects;
DROP POLICY IF EXISTS "Upload community assets" ON storage.objects;
DROP POLICY IF EXISTS "Upload community assets to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Delete own community assets" ON storage.objects;

-- Restrictive policies also close unknown permissive grants left by manual setup,
-- while leaving unrelated buckets on a shared Supabase deployment alone.
CREATE POLICY "App storage writes require trusted server insert" ON storage.objects
AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (
  bucket_id NOT IN ('payment-proofs', 'landing-page-assets', 'course-images', 'community-assets',
                   'certificates', 'exercise-media', 'lesson-resources', 'ai-chat-attachments', 'avatars')
);
CREATE POLICY "App storage writes require trusted server update" ON storage.objects
AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (
  bucket_id NOT IN ('payment-proofs', 'landing-page-assets', 'course-images', 'community-assets',
                   'certificates', 'exercise-media', 'lesson-resources', 'ai-chat-attachments', 'avatars')
) WITH CHECK (
  bucket_id NOT IN ('payment-proofs', 'landing-page-assets', 'course-images', 'community-assets',
                   'certificates', 'exercise-media', 'lesson-resources', 'ai-chat-attachments', 'avatars')
);
CREATE POLICY "App storage writes require trusted server delete" ON storage.objects
AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (
  bucket_id NOT IN ('payment-proofs', 'landing-page-assets', 'course-images', 'community-assets',
                   'certificates', 'exercise-media', 'lesson-resources', 'ai-chat-attachments', 'avatars')
);
CREATE POLICY "Private app storage reads require authorized signature" ON storage.objects
AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (
  bucket_id NOT IN ('payment-proofs', 'exercise-media', 'lesson-resources', 'ai-chat-attachments')
);

UPDATE storage.buckets SET public = false, file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
WHERE id = 'payment-proofs';
UPDATE storage.buckets SET public = true, file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
WHERE id IN ('landing-page-assets', 'course-images');
UPDATE storage.buckets SET public = true, file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp',
                           'video/mp4', 'video/webm', 'video/quicktime', 'application/pdf']
WHERE id = 'community-assets';

-- Preserve the published pdfs/{certificateId}.pdf and badges/{certificateId}.png URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('certificates', 'certificates', true, 10485760, ARRAY['application/pdf', 'image/png'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Public read issued certificates" ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'certificates');
