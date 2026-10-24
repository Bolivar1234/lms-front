/**
 * Solana kill-switch. Solana payment code is kept in-tree to track upstream,
 * but it is OFF unless SOLANA_PAYMENTS_ENABLED=true. This is the only place
 * that reads the flag.
 */
export function isSolanaEnabled(): boolean {
  return process.env.SOLANA_PAYMENTS_ENABLED === 'true'
}

/** Route guard: returns a 404 Response when disabled, else null. */
export function solanaDisabledResponse(): Response | null {
  return isSolanaEnabled()
    ? null
    : new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
}
