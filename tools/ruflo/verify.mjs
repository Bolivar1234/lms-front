#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { withMcpSession, unpack, stateRoot, runtimeRoot } from './mcp-call.mjs';

const receipt = {
  timestamp: new Date().toISOString(), runtime: 'ruflo@3.38.23 + @claude-flow/cli@3.38.23',
  runtimeRoot, stateRoot, transport: 'stdio', modelCalls: 0, calls: [],
  limitations: ['Mock embeddings may be active; query execution is not evidence of semantic retrieval quality.',
    'Tool discovery does not establish that every tool works.', 'A local MCP installation does not hot-load native tools into an existing chat.'],
};
const namespace = `portable-setup-verification-${randomUUID()}`;
const key = `receipt-${randomUUID()}`;
const expected = { purpose: 'RuFlo portable installation verification', marker: receipt.timestamp };

async function call(client, name, args) {
  const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 });
  assert(!response.isError, `${name} returned an MCP error`);
  const data = unpack(response);
  assert(data && typeof data === 'object' && !data.error && data.success !== false, `${name} failed`);
  receipt.calls.push(name);
  return data;
}

try {
  await withMcpSession(async client => {
    const names = []; let cursor;
    do { const page = await client.listTools(cursor ? { cursor } : {}); names.push(...page.tools.map(tool => tool.name)); cursor = page.nextCursor; } while (cursor);
    receipt.toolCount = names.length;
    for (const name of ['system_health', 'memory_store', 'memory_retrieve', 'memory_search']) assert(names.includes(name), `Missing tool ${name}`);
    const health = await call(client, 'system_health', {});
    for (const component of ['memory', 'config', 'mcp']) assert(health.checks?.some(check => check.name === component && check.status === 'healthy'), `${component} is not healthy`);
    await call(client, 'memory_store', { namespace, key, value: expected, tags: ['setup', 'verification'], provenance_type: 'system_observation' });
  });
  // A second stdio process establishes persistence, not just an in-memory cache.
  await withMcpSession(async client => {
    const retrieved = await call(client, 'memory_retrieve', { namespace, key });
    assert.equal(retrieved.found, true);
    assert.deepEqual(retrieved.value, expected);
    const search = await call(client, 'memory_search', { namespace, query: expected.purpose, limit: 100, threshold: 0 });
    assert(JSON.stringify(search).includes(key), 'Query did not return this stored verification key');
  });
  receipt.passed = true;
} catch (error) { receipt.passed = false; receipt.error = error.message; process.exitCode = 1; }
finally {
  const directory = join(stateRoot, 'receipts');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'mcp-verification.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
}
