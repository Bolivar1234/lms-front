#!/usr/bin/env node
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
export const runtimeRoot = resolve(process.env.RUFLO_RUNTIME_ROOT ?? fileURLToPath(new URL('.', import.meta.url)));
export const stateRoot = resolve(process.env.RUFLO_STATE_DIR ?? join(repoRoot, 'tools/ruflo/state'));

export function unpack(result) {
  if (result.structuredContent) return result.structuredContent;
  const content = (result.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('\n');
  try { return JSON.parse(content); } catch { return content; }
}

export async function withMcpSession(action) {
  const require = createRequire(join(runtimeRoot, 'package.json'));
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const transport = new StdioClientTransport({
    command: join(repoRoot, 'scripts/ruflo.sh'), args: ['mcp', 'start'], cwd: stateRoot,
    env: { ...process.env }, stderr: 'pipe',
  });
  // Keep protocol stdout clean. Server diagnostics stay on stderr, never in MCP payloads.
  transport.stderr?.on('data', chunk => process.stderr.write(chunk));
  const client = new Client({ name: 'lms-ruflo-helper', version: '1.0.0' });
  try {
    await client.connect(transport);
    return await action(client);
  } finally { await client.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [tool, raw = '{}'] = process.argv.slice(2);
    if (!tool) throw new Error('Usage: node tools/ruflo/mcp-call.mjs <tool-name|--list> [JSON arguments]');
    const result = await withMcpSession(async client => {
      if (tool === '--list') {
        const names = []; let cursor;
        do { const page = await client.listTools(cursor ? { cursor } : {}); names.push(...page.tools.map(item => item.name)); cursor = page.nextCursor; } while (cursor);
        return { toolCount: names.length, toolNames: names };
      }
      const params = JSON.parse(raw);
      if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('Tool arguments must be a JSON object');
      const response = await client.callTool({ name: tool, arguments: params }, undefined, { timeout: 120000 });
      if (response.isError) throw new Error(`MCP tool ${tool} returned an error`);
      return unpack(response);
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
