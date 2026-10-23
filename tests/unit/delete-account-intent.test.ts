import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER = '11111111-1111-4111-8111-111111111111'

const insert = vi.fn()
const deleteUser = vi.fn()
const schema = vi.fn()
const rpc = vi.fn()
const remove = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc,
    schema,
    storage: { from: () => ({ remove }) },
    auth: { admin: { deleteUser } },
  }),
}))

import { deleteAccount } from '@/lib/account/delete-account'

beforeEach(() => {
  vi.clearAllMocks()
  rpc.mockImplementation(async (name: string) => ({ data: name === 'account_deletion_blockers' ? [] : [], error: null }))
  schema.mockReturnValue({ from: () => ({ insert }) })
  deleteUser.mockResolvedValue({ error: null })
  remove.mockResolvedValue({ error: null })
})

describe('deleteAccount auth intent', () => {
  it('records a self-delete intent in the public schema before deleting the auth user', async () => {
    insert.mockResolvedValue({ error: null })

    await expect(deleteAccount(USER)).resolves.toEqual({ ok: true })

    expect(schema).toHaveBeenCalledWith('public')
    expect(insert).toHaveBeenCalledWith({
      action: 'self_delete_user',
      acting_admin_user_id: USER,
      target_user_id: USER,
    })
    expect(insert.mock.invocationCallOrder[0]).toBeLessThan(deleteUser.mock.invocationCallOrder[0])
  })

  it('still deletes on a standalone database that has no intent table', async () => {
    insert.mockResolvedValue({ error: { code: 'PGRST205', message: 'table not found' } })

    await expect(deleteAccount(USER)).resolves.toEqual({ ok: true })
    expect(deleteUser).toHaveBeenCalledWith(USER)
  })

  it('does not delete the auth user when the intent cannot be recorded', async () => {
    insert.mockResolvedValue({ error: { code: '42501', message: 'permission denied' } })

    await expect(deleteAccount(USER)).rejects.toMatchObject({ code: '42501' })
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('does not delete the auth user when uploaded-file cleanup fails', async () => {
    rpc.mockImplementation(async (name: string) =>
      name === 'prepare_account_deletion'
        ? { data: [{ bucket_id: 'lesson-media', name: 'users/file.mp3' }], error: null }
        : { data: [], error: null },
    )
    remove.mockResolvedValue({ error: { message: 'storage unavailable' } })

    await expect(deleteAccount(USER)).rejects.toThrow('could not remove stored files')
    expect(insert).not.toHaveBeenCalled()
    expect(deleteUser).not.toHaveBeenCalled()
  })
})
