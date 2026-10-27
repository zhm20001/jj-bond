import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const manifest = JSON.parse(readFileSync('LICENSES/manifest.json', 'utf8'));
const metadata = JSON.parse(execFileSync('cargo', [
  'metadata', '--locked', '--format-version', '1', '--manifest-path', 'src-tauri/Cargo.toml',
], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
const expected = metadata.packages.filter((p) => p.name !== 'jj-bond')
  .map((p) => `cargo:${p.name}@${p.version}`);
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
for (const [location, p] of Object.entries(lock.packages)) {
  if (location && !p.dev && !p.optional) {
    expected.push(`npm:${p.name ?? location.split('node_modules/').at(-1)}@${p.version}`);
  }
}
assert.deepEqual(manifest.packages.map((p) => `${p.ecosystem}:${p.name}@${p.version}`).sort(), expected.sort());
for (const p of manifest.packages) {
  assert.ok(p.license && p.source && p.texts.length, `Missing license evidence: ${p.name}`);
  for (const text of p.texts) {
    assert.match(text.file, /^texts\/[a-f0-9]{64}\.txt$/);
    const content = readFileSync(`LICENSES/${text.file}`);
    assert.ok(content.length && text.source);
    assert.equal(createHash('sha256').update(content).digest('hex'), text.sha256);
  }
}
console.log(`verify-licenses: ${expected.length} packages covered`);
