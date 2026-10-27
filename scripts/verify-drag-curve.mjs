/** Verify the production drag geometry, not a copied implementation. */
import { targetAnchor, dragCurve, curvePath } from "../src/drag/curve.ts";

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// Approach from below → anchor just under target row
const startBelow = { x: 23, y: 200 };
const rect = { left: 17.5, top: 36, bottom: 64 };
const endBelow = targetAnchor(rect, startBelow);
ok(endBelow.y === rect.bottom + 5, `from below → bottom+5, got ${endBelow.y}`);
ok(endBelow.x === rect.left + 6, `end.x = left+6`);
const curveUp = dragCurve(startBelow, endBelow);
ok(curveUp.c1.x > startBelow.x, `c1 bulges right: ${curveUp.c1.x} > ${startBelow.x}`);
ok(curveUp.c2.x > endBelow.x, `c2 right of end`);

// Approach from above → anchor just above target row
const startAbove = { x: 23, y: 20 };
const endAbove = targetAnchor(rect, startAbove);
ok(endAbove.y === rect.top - 5, `from above → top-5, got ${endAbove.y}`);
const curveDown = dragCurve(startAbove, endAbove);
ok(curveDown.c1.x > startAbove.x, `downward also bulges right`);

// Same-x free drag still bulges
const free = dragCurve(startBelow, { x: startBelow.x, y: 80 });
ok(free.c1.x > startBelow.x, `free-drag same-x bulges: ${free.c1.x}`);

if (fails.length) {
  console.error('FAIL:\n' + fails.join('\n'));
  process.exit(1);
}
console.log('OK dragCurve right bulge');
console.log('  curve (from below):', curvePath(curveUp));
console.log('  c1', curveUp.c1, 'c2', curveUp.c2);
