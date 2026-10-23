-- Lesson media reuses lesson_resources and its existing course-access signer.
UPDATE storage.buckets SET public = false, file_size_limit = 26214400,
  allowed_mime_types = ARRAY[
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/aac'
  ]
WHERE id = 'lesson-resources';

-- This bucket formerly existed only in the local seed. Keep direct signed uploads
-- for exercise recordings: audio UI cap 25MiB, video cap and bucket ceiling 100MiB.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('exercise-media', 'exercise-media', false, 104857600, ARRAY[
  'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a',
  'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/3gpp',
  'video/webm', 'video/ogg', 'video/mp4', 'video/quicktime', 'video/3gpp'
]) ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Public read user avatars" ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'avatars');

-- Service uploads have no user owner field. Clean up only exact user namespaces,
-- across all of their school memberships; never delete an entire school folder.
CREATE OR REPLACE FUNCTION public.prepare_account_deletion(_user_id uuid)
RETURNS TABLE (bucket_id text, name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.transactions SET status = 'canceled' WHERE user_id = _user_id AND status = 'pending';
  UPDATE public.payment_requests SET status = 'cancelled' WHERE user_id = _user_id
    AND status IN ('pending', 'contacted', 'payment_received');
  UPDATE public.payment_requests SET contact_name = '', contact_email = '', contact_phone = NULL,
    message = NULL, payer_name = NULL, payer_phone = NULL WHERE user_id = _user_id;

  RETURN QUERY SELECT o.bucket_id, o.name FROM storage.objects o
  WHERE o.owner = _user_id OR o.owner_id = _user_id::text
    OR (o.bucket_id = 'avatars' AND pg_catalog.split_part(o.name, '/', 1) = _user_id::text)
    OR EXISTS (
      SELECT 1 FROM public.tenant_users tu WHERE tu.user_id = _user_id AND (
        (o.bucket_id = 'community-assets' AND pg_catalog.split_part(o.name, '/', 1) = tu.tenant_id::text
          AND pg_catalog.split_part(o.name, '/', 2) = _user_id::text)
        OR (o.bucket_id = 'exercise-media' AND pg_catalog.split_part(o.name, '/', 1) = tu.tenant_id::text
          AND pg_catalog.split_part(o.name, '/', 3) = _user_id::text)
        OR (o.bucket_id = 'payment-proofs' AND (
          (pg_catalog.split_part(o.name, '/', 1) = tu.tenant_id::text AND pg_catalog.split_part(o.name, '/', 2) = _user_id::text)
          OR (pg_catalog.split_part(o.name, '/', 1) = 'student' AND pg_catalog.split_part(o.name, '/', 2) = tu.tenant_id::text
              AND pg_catalog.split_part(o.name, '/', 3) = _user_id::text)
        ))
      )
    );
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion(uuid) TO service_role;
