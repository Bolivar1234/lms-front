-- Read-only evidence only. Confirm the deployed app's Supabase project separately
-- before connecting. A commit/image identity cannot be derived from this SQL.
-- Do not run repository migrations, regression fixtures or reset/seed commands on production.
BEGIN TRANSACTION READ ONLY;

SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;

SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id IN ('payment-proofs', 'landing-page-assets', 'course-images', 'community-assets',
             'certificates', 'exercise-media', 'lesson-resources', 'ai-chat-attachments', 'avatars')
ORDER BY id;

SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced, c.relacl
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'storage' AND c.relname IN ('objects', 'buckets') ORDER BY c.relname;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'storage' AND tablename IN ('objects', 'buckets') ORDER BY tablename, policyname;

SELECT r.rolname, c.relname,
       has_table_privilege(r.oid, c.oid, 'SELECT') AS can_select,
       has_table_privilege(r.oid, c.oid, 'INSERT') AS can_insert,
       has_table_privilege(r.oid, c.oid, 'UPDATE') AS can_update,
       has_table_privilege(r.oid, c.oid, 'DELETE') AS can_delete
FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE r.rolname IN ('anon', 'authenticated', 'service_role') AND n.nspname = 'storage'
  AND c.relname IN ('objects', 'buckets') ORDER BY c.relname, r.rolname;

SELECT grantee, table_schema, table_name, column_name, privilege_type
FROM information_schema.column_privileges WHERE table_schema = 'storage' AND table_name IN ('objects', 'buckets')
  AND grantee IN ('anon', 'authenticated', 'service_role') ORDER BY table_name, grantee, column_name, privilege_type;

SELECT n.nspname AS schema_name, p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer, p.proconfig, p.proacl,
       pg_get_functiondef(p.oid) AS definition,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'lms', 'app_private') AND p.prokind = 'f'
  AND p.proname IN ('custom_access_token_hook', 'get_tenant_id', 'has_course_access',
                   'account_deletion_blockers', 'prepare_account_deletion', 'settle_solana_subscription_initial')
ORDER BY n.nspname, p.proname, arguments;

COMMIT;
