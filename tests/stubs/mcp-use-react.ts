/**
 * Root-workspace stand-in for `mcp-use/react`.
 *
 * `mcp-use` is a dependency of `mcp-server/` only, but root unit tests render
 * shared widget code (`mcp-server/views/shared/lesson`), which reaches it
 * through `views/shared/i18n.tsx`. With no host context the widget i18n falls
 * back to English, which is what these hooks return here. Mapped in
 * `tsconfig.json` paths and `vitest.config.ts`; `mcp-server` keeps the real
 * package through its own config and install.
 */
export function useHostContext(): { locale?: string; timeZone?: string } {
  return {}
}

export function useToolContext(): { meta?: Record<string, unknown> } {
  return {}
}
