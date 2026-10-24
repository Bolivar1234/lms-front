import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  // Widget sources are .tsx; the app's tsconfig sets jsx: 'preserve' for Next,
  // which esbuild can not execute. Compile JSX for tests instead.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      // mcp-use is installed only under mcp-server; see tests/stubs/mcp-use-react.ts.
      'mcp-use/react': resolve(__dirname, 'tests/stubs/mcp-use-react.ts'),
    },
    // mcp-server has its own node_modules; without this, widget sources under
    // it load a second copy of React and hooks blow up mid-render.
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    globals: false,
    // Solana is off in the app unless this is 'true'; the Solana suites exercise the
    // code itself, and solana-flag.test.ts covers the disabled behavior.
    env: { SOLANA_PAYMENTS_ENABLED: 'true' },
  },
})
