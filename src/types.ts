export type DensityMode = 'compact' | 'rich';
export type SortMode = 'workingCopyFirst' | 'recentRewrite';
export type GrowthDirection = 'bottomUp' | 'topDown';
/** Appearance: follow OS, or force light/dark. Default system. */
export type ThemeMode = 'system' | 'light' | 'dark';

/** UI language. Default zh. */
export type Locale = 'zh' | 'en';

/** Diff pane layout: unified stream or side-by-side. Default unified. */
export type DiffViewMode = 'unified' | 'sideBySide';

export interface Prefs {
  density: DensityMode;
  sort: SortMode;
  growth: GrowthDirection;
  theme: ThemeMode;
  /** UI language: zh | en. Default zh. */
  locale: Locale;
  detailPanelOpen: boolean;
  /** Middle detail panel width in px when open (resizable). */
  detailPanelWidth: number;
  /** Right unified-diff panel width in px when open (resizable). */
  diffPanelWidth: number;
  /** Diff view: unified | sideBySide. Default unified. */
  diffViewMode: DiffViewMode;
  lastRepo: string | null;
  /** Last applied revset filter; empty/null → all(). */
  lastRevset: string | null;
}

export interface Revision {
  changeId: string;
  /** Length of jj `change_id.shortest()` — unique prefix in this repo. */
  uniquePrefixLen: number;
  commitId: string;
  /** Length of jj `commit_id.shortest()` — unique prefix in this repo. */
  uniqueCommitPrefixLen: number;
  isWorkingCopy: boolean;
  immutable: boolean;
  /** True when jj reports this revision as conflicted. */
  conflict: boolean;
  parents: string[];
  bookmarks: string[];
  author: string;
  committerTs: string;
  description: string;
}

export interface LaidOutNode {
  rev: Revision;
  row: number;
  lane: number;
  /** GG-style: active stems to the right of this node. Linear history → 0. */
  padding: number;
}

export interface Edge {
  fromRow: number;
  toRow: number;
  fromLane: number;
  toLane: number;
  colorLane: number;
}

export interface GraphLayout {
  nodes: LaidOutNode[];
  edges: Edge[];
  laneCount: number;
}

export interface DiffStat {
  insertions: number;
  deletions: number;
}

/** One file from `diff_files` (summary status + per-file ±). */
export interface DiffFileEntry {
  path: string;
  status: 'A' | 'M' | 'D' | 'R' | 'C' | string;
  insertions: number;
  deletions: number;
}

/** Files and exact totals returned together by `diff_files`. */
export interface DiffFilesResult {
  files: DiffFileEntry[];
  stat: DiffStat;
}

/** One path from `jj resolve --list`. */
export interface ConflictEntry {
  path: string;
  detail: string;
}

/** Post-rebase conflict notice shown as a dismissible banner. */
export interface ConflictNotice {
  changeIds: string[];
  /** Short labels: changeId prefix · description */
  commits: { changeId: string; description: string }[];
  /** Deduped conflicted file paths across those commits. */
  paths: string[];
}

export interface OpenResult {
  path: string;
  layout: GraphLayout;
}

export type PendingConfirm =
  | {
      kind: 'rebase';
      /** Change ids to move with `jj rebase -r` (剪枝，不含选区外后代). */
      sourceIds: string[];
      targetId: string;
      sourceLabel: string;
      targetLabel: string;
    }
  | {
      kind: 'atTransfer';
      targetId: string;
      immutable: boolean;
      sourceLabel: string;
      targetLabel: string;
    }
  | {
      kind: 'abandon';
      revisionIds: string[];
      label: string;
    }
  | {
      kind: 'resolveConflict';
      revisionId: string;
      filePath: string;
      tool: 'ours' | 'theirs';
      label: string;
    }
  | {
      kind: 'bookmarkDelete';
      name: string;
      label: string;
    };

/** Text prompt modal (bookmark name / describe message). */
export type PendingPrompt =
  | {
      kind: 'bookmark';
      revisionId: string;
      label: string;
    }
  | {
      kind: 'bookmarkMove';
      revisionId: string;
      label: string;
      /** Existing bookmark names in the repo (for hint / default). */
      candidates: string[];
    }
  | {
      kind: 'bookmarkRename';
      revisionId: string;
      label: string;
      oldName: string;
    }
  | {
      kind: 'bookmarkPick';
      /** After picking a name, continue with rename or delete. */
      next: 'rename' | 'delete';
      revisionId: string;
      label: string;
      candidates: string[];
    }
  | {
      kind: 'describe';
      revisionId: string;
      label: string;
      initial: string;
    };

/** Optional from/to for compare-two-revisions mode. */
export interface DiffRange {
  from: string;
  to: string;
}

/** Right-click context menu placement + selection snapshot. */
export interface ContextMenuState {
  x: number;
  y: number;
  /** Selected change ids in graph order (newer → older). */
  revisionIds: string[];
}

export const LANE_COLORS = [
  'rgb(80,160,255)',
  'rgb(120,200,120)',
  'rgb(240,160,60)',
  'rgb(200,120,220)',
  'rgb(240,100,120)',
  'rgb(80,200,200)',
  'rgb(220,200,80)',
  'rgb(160,140,255)',
  'rgb(100,220,160)',
  'rgb(255,140,180)',
];

export function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length];
}

/** Default change-id width in the UI (prefix highlighted; at least uniquePrefixLen). */
export const CHANGE_ID_DISPLAY_LEN = 8;

export function shortId(id: string, len = CHANGE_ID_DISPLAY_LEN): string {
  return id.slice(0, len);
}

/** GG IdSpan split: unique shortest prefix + muted remainder. */
export function splitChangeIdPrefix(
  changeId: string,
  uniquePrefixLen: number,
): { prefix: string; rest: string } {
  const n = Math.max(1, Math.min(uniquePrefixLen || 1, changeId.length));
  return { prefix: changeId.slice(0, n), rest: changeId.slice(n) };
}

/** Visible change-id text: unique pink prefix + muted rest, total ≥ 8 chars. */
export function formatChangeIdDisplay(
  changeId: string,
  uniquePrefixLen: number,
  displayLen = CHANGE_ID_DISPLAY_LEN,
): { prefix: string; rest: string; title: string } {
  const { prefix, rest } = splitChangeIdPrefix(changeId, uniquePrefixLen ?? 1);
  const total = Math.max(displayLen, prefix.length);
  const displayRest = rest.slice(0, Math.max(0, total - prefix.length));
  return { prefix, rest: displayRest, title: changeId };
}


export function formatTs(ts: string): string {
  if (ts.length >= 19 && ts[10] === 'T') {
    return ts.slice(0, 10) + ' ' + ts.slice(11);
  }
  return ts || '—';
}

/** Parse jj committer timestamps (`2026-10-25T12:00:00` or with space). */
export function parseCommitterTs(ts: string): number | null {
  if (!ts) return null;
  const normalized = ts.includes('T') ? ts : ts.replace(' ', 'T');
  const t = Date.parse(normalized);
  return Number.isFinite(t) ? t : null;
}


export function rowMetrics(compact: boolean) {
  // Tighter than GG's 18px column pitch — keep GG leftpad formula, less bulk.
  if (compact) {
    return { rowH: 28, laneW: 12, graphPad: 10, nodeR: 4.5 };
  }
  return { rowH: 56, laneW: 12, graphPad: 10, nodeR: 5.5 };
}

/** GG: leftpad = padding * columnWidth + columnWidth + 6 */
export function rowLeftPad(lane: number, padding: number, laneW: number, graphPad: number): number {
  return graphPad + (lane + padding + 1) * laneW + 6;
}

export function visualRow(row: number, n: number, growth: GrowthDirection): number {
  return growth === 'bottomUp' ? row : Math.max(0, n - 1 - row);
}
