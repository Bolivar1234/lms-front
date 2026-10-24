import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

// Fork-only migrations end their version in 99 and start their name with fork_,
// so they can never share a version with upstream (docs/MIGRATIONS.md).
// These predate the rule and are already recorded on the shared staging DB by
// version, so they keep their names.
const GRANDFATHERED_FORK_MIGRATIONS = [
  '20261022000000_tenant_slug_reserved.sql',
  '20261022120000_storage_security_hardening.sql',
  '20261022120001_drop_unenforced_enrollment_settings.sql',
  '20261022121000_private_lesson_media_and_avatars.sql',
  '20261022130001_allow_library_browser_upload.sql',
]

const files = readdirSync(resolve(process.cwd(), 'supabase/migrations')).filter((f) => f.endsWith('.sql'))

it('names every fork migration with a 99-second version and a fork_ prefix', () => {
  const bad = files.filter((file) => {
    const [version, ...rest] = file.split('_')
    const forkName = rest.join('_').startsWith('fork_')
    const forkVersion = version.endsWith('99')
    return forkName !== forkVersion
  })
  expect(bad, 'fork_ names and versions ending in 99 must go together').toEqual([])
})

it('keeps the grandfathered fork migrations in place', () => {
  expect(GRANDFATHERED_FORK_MIGRATIONS.filter((f) => !files.includes(f))).toEqual([])
})
