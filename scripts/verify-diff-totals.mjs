import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jjBridgeMiddleware } from './jj-bridge.mjs';

// This script runs in its own process; never read personal jj configuration.
process.env.JJ_CONFIG = '';
const repo = mkdtempSync(join(tmpdir(), 'jj-bond-diff-test-'));
const middleware = jjBridgeMiddleware();
const server = createServer((req, res) => middleware(req, res, () => res.end()));
const jj = (...args) => execFileSync('jj', args, { cwd: repo, encoding: 'utf8' });
try {
  jj('git', 'init', '.');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const read = async (extra = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/diff-files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: repo, changeId: '@', ...extra }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  assert.deepEqual((await read()).stat, { insertions: 0, deletions: 0 });
  writeFileSync(join(repo, 'large.txt'), 'added line\n'.repeat(1000));
  jj('status');
  const result = await read();
  assert.deepEqual(result.stat, { insertions: 1000, deletions: 0 });
  assert.equal(result.files[0].path, 'large.txt');
  const reversed = await read({ from: '@', to: '@-' });
  assert.deepEqual(reversed.stat, { insertions: 0, deletions: 1000 });
  console.log('verify-diff-totals: ok');
} finally {
  await new Promise((resolve) => server.close(resolve));
  rmSync(repo, { recursive: true, force: true });
}
