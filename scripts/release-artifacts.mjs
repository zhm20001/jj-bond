// Find packaged Tauri bundle artifacts and write a SHA-256 checksum file.
//
// Usage: node scripts/release-artifacts.mjs <target-root> <checksums-file>
//
// Scans <target-root> (src-tauri/target) for installer files that live under
// a */bundle/* path, prints their paths one per line for the caller to
// upload, and writes <checksums-file> with `sha256  basename` lines sorted
// by file name. Exits with an empty output when no artifacts match.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [targetRoot, checksumsFile] = process.argv.slice(2);
if (!targetRoot || !checksumsFile) {
  console.error('usage: node scripts/release-artifacts.mjs <target-root> <checksums-file>');
  process.exit(1);
}

const extensions = new Set(['.dmg', '.exe', '.msi', '.deb', '.appimage', '.rpm']);

const artifacts = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile()) {
      if (!path.split(/[\\/]/).includes('bundle')) continue;
      const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
      if (!extensions.has(ext)) continue;
      artifacts.push(path);
    }
  }
};
walk(targetRoot);
artifacts.sort();

const lines = artifacts.map((path) => {
  const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
  return `${digest}  ${path.split(/[\\/]/).pop()}`;
});
writeFileSync(checksumsFile, `${lines.join('\n')}\n`);
console.log(artifacts.join('\n'));
