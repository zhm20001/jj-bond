/** Verify the production diff parser using Node 24 native TypeScript support. */
import assert from "node:assert/strict";
import { parseUnifiedDiff, toSideBySide } from "../src/diffParse.ts";

const sample = `diff --git a/foo.txt b/foo.txt
index 111..222 100644
--- a/foo.txt
+++ b/foo.txt
@@ -1,3 +1,4 @@
 line1
-old
+new
+extra
 line3
`;

const rows = parseUnifiedDiff(sample);
assert.equal(rows[0].kind, 'meta');
assert.equal(rows[4].kind, 'hunk');
assert.equal(rows[4].oldStart, 1);
assert.equal(rows[4].newStart, 1);

const content = rows.filter((row) => row.kind === 'ctx' || row.kind === 'del' || row.kind === 'add');
assert.deepEqual(
  content.map((row) => ({
    kind: row.kind,
    text: row.text,
    oldNo: row.oldNo,
    newNo: row.newNo,
  })),
  [
    { kind: 'ctx', text: 'line1', oldNo: 1, newNo: 1 },
    { kind: 'del', text: 'old', oldNo: 2, newNo: undefined },
    { kind: 'add', text: 'new', oldNo: undefined, newNo: 2 },
    { kind: 'add', text: 'extra', oldNo: undefined, newNo: 3 },
    { kind: 'ctx', text: 'line3', oldNo: 3, newNo: 4 },
  ],
);

const sbs = toSideBySide(rows);
const pairs = sbs.filter((row) => row.kind === 'pair');
assert.equal(pairs.length, 5);
assert.equal(pairs[1].left.type, 'del');
assert.equal(pairs[1].right.type, 'empty');
assert.equal(pairs[2].left.type, 'empty');
assert.equal(pairs[2].right.type, 'add');

const tiny = parseUnifiedDiff('@@ -5 +5 @@\n-a\n+b\n');
assert.equal(tiny[0].kind, 'hunk');
assert.equal(tiny[1].oldNo, 5);
assert.equal(tiny[2].newNo, 5);

console.log('verify-diff-parse: ok');
