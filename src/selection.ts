/** GG-style linear range selection along direct parent edges. */

import type { LaidOutNode } from './types';

/** Child is a direct parent-link of parent (change-id parents). */
export function isDirectParent(child: LaidOutNode, parent: LaidOutNode): boolean {
  return child.rev.parents.includes(parent.rev.changeId);
}

/**
 * Farthest index from anchor toward target that stays a linear chain
 * of direct parent edges (GG `findLinearLimit`).
 */
export function findLinearLimit(
  nodes: LaidOutNode[],
  anchorIdx: number,
  targetIdx: number,
): number {
  if (anchorIdx < 0 || targetIdx < 0 || anchorIdx >= nodes.length || targetIdx >= nodes.length) {
    return anchorIdx;
  }
  if (anchorIdx === targetIdx) return anchorIdx;
  const direction = targetIdx > anchorIdx ? 1 : -1;
  let lastValid = anchorIdx;
  for (
    let i = anchorIdx + direction;
    direction > 0 ? i <= targetIdx : i >= targetIdx;
    i += direction
  ) {
    // In jj log order, lower index = newer child, higher = older parent.
    const newerIdx = direction > 0 ? lastValid : i;
    const olderIdx = direction > 0 ? i : lastValid;
    if (isDirectParent(nodes[newerIdx], nodes[olderIdx])) {
      lastValid = i;
    } else {
      break;
    }
  }
  return lastValid;
}

/** Inclusive change-ids from anchor through the linear limit toward target. */
export function linearRangeIds(
  nodes: LaidOutNode[],
  anchorIdx: number,
  targetIdx: number,
): string[] {
  const limit = findLinearLimit(nodes, anchorIdx, targetIdx);
  const lo = Math.min(anchorIdx, limit);
  const hi = Math.max(anchorIdx, limit);
  return nodes.slice(lo, hi + 1).map((n) => n.rev.changeId);
}

/** Order selected ids by graph row (newer / lower index first). */
export function orderSelectedByGraph(nodes: LaidOutNode[], selected: string[]): string[] {
  const set = new Set(selected);
  return nodes.filter((n) => set.has(n.rev.changeId)).map((n) => n.rev.changeId);
}
