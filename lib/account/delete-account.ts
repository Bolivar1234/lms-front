import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Account deletion (#850) — required by Google Play and the App Store.
 *
 * Deleting an account is `auth.admin.deleteUser()`; the foreign keys set by
 * migration 20260927120000 decide the rest: the person's own activity is
 * removed, money records stay anonymised (user_id → NULL), and content they
 * authored for a school stays with the school, unattributed.
 */

export type AccountDeletionBlocker =
  | { reason: 'super_admin' }
  | { reason: 'sole_admin'; school: string }
  | { reason: 'live_subscription'; plan: string | null }

/** Why the account can't be deleted yet; empty when it can. */
export async function getAccountDeletionBlockers(userId: string): Promise<AccountDeletionBlocker[]> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('account_deletion_blockers', { _user_id: userId })
  if (error) throw error
  return ((data ?? []) as { reason: string; detail: string | null }[]).map((row) => {
    if (row.reason === 'sole_admin') return { reason: 'sole_admin', school: row.detail ?? '' }
    if (row.reason === 'live_subscription') return { reason: 'live_subscription', plan: row.detail }
    return { reason: 'super_admin' }
  })
}

/**
 * The phrase the caller must type to confirm: their email, or `DELETE` for an
 * account without one. Compared case-insensitively.
 */
export function deletionConfirmationPhrase(user: Pick<User, 'email'>): string {
  return user.email?.trim() || 'DELETE'
}

export function isDeletionConfirmed(user: Pick<User, 'email'>, typed: unknown): boolean {
  return (
    typeof typed === 'string' &&
    typed.trim().toLowerCase() === deletionConfirmationPhrase(user).toLowerCase()
  )
}

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; blockers: AccountDeletionBlocker[] }

/**
 * Delete the account for good. Refuses while a blocker stands; otherwise
 * closes pending payments, removes the person's uploaded files, and deletes
 * the auth user, which cascades through the database. Authentication deletion
 * is withheld if storage cleanup fails so a retry can complete cleanup.
 */
export async function deleteAccount(userId: string): Promise<DeleteAccountResult> {
  const blockers = await getAccountDeletionBlockers(userId)
  if (blockers.length > 0) return { ok: false, blockers }

  const admin = createAdminClient()
  const { data: files, error: prepareError } = await admin.rpc('prepare_account_deletion', {
    _user_id: userId,
  })
  if (prepareError) throw prepareError

  const byBucket = new Map<string, string[]>()
  for (const file of (files ?? []) as { bucket_id: string; name: string }[]) {
    byBucket.set(file.bucket_id, [...(byBucket.get(file.bucket_id) ?? []), file.name])
  }
  const cleanupFailures: string[] = []
  for (const [bucket, names] of byBucket) {
    const { error } = await admin.storage.from(bucket).remove(names)
    if (error) {
      console.error(`Account deletion: could not remove files from ${bucket}:`, error)
      cleanupFailures.push(bucket)
    }
  }

  if (cleanupFailures.length > 0) {
    throw new Error(`Account deletion could not remove stored files from: ${cleanupFailures.join(', ')}. Please retry.`)
  }

  await recordSelfDeleteIntent(admin, userId)

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
  if (deleteError) throw deleteError
  return { ok: true }
}

// PostgREST says PGRST205 for a table it can't see; Postgres says 42P01.
const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01'])

/**
 * On the shared SayThanks database a trigger on `auth.users` refuses any
 * delete that has no short-lived intent row in `public.admin_auth_action_intents`
 * ("Missing admin auth action intent for delete_user", SQLSTATE 42501, surfaced
 * by GoTrue as a 500). A self-delete intent has the user as both actor and target.
 * A standalone LMS database has no such table, so a missing table is not an error.
 */
async function recordSelfDeleteIntent(admin: ReturnType<typeof createAdminClient>, userId: string) {
  // The admin client is scoped to the LMS schema; the intent table lives in `public`.
  const shared = admin.schema('public') as unknown as SupabaseClient
  const { error } = await shared.from('admin_auth_action_intents').insert({
    action: 'self_delete_user',
    acting_admin_user_id: userId,
    target_user_id: userId,
  })
  if (error && !MISSING_TABLE_CODES.has(error.code)) throw error
}
