-- Shared-DB variant of 20261022000000_tenant_slug_reserved.sql (LMS lives in the lms schema).
--
-- Schools live at <slug>.<platform domain>. On a shared root such as
-- saythanks.org that level also holds the platform's own hosts (www, api,
-- staging…), so these slugs must never become tenants. Keep the list in step
-- with lib/tenant/reserved-slugs.ts (a unit test compares them).
--
-- NOT VALID: enforced for every new or changed slug without blocking on an
-- existing row. Run VALIDATE CONSTRAINT once no tenant uses a reserved slug.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_slug_not_reserved_check'
      AND conrelid = 'lms.tenants'::regclass
  ) THEN
    ALTER TABLE lms.tenants
      ADD CONSTRAINT tenants_slug_not_reserved_check
      CHECK (slug <> ALL (ARRAY[
        'admin', 'api', 'api-staging', 'app', 'assets', 'auth', 'billing', 'blog',
        'cdn', 'circles', 'dashboard', 'docs', 'ftp', 'help', 'login', 'mail', 'mx',
        'ns1', 'ns2', 'portal', 'smtp', 'staging', 'static', 'status', 'support',
        'webmail', 'www'
      ])) NOT VALID;
  END IF;
END $$;
