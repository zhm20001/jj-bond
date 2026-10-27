/**
 * Parse git unified diff (`--git`) text into structured rows with line numbers.
 * Pure helper — safe to unit-test without React.
 */

export type DiffRow =
  | { kind: 'meta'; text: string }
  | { kind: 'hunk'; text: string; oldStart: number; newStart: number }
  | { kind: 'ctx'; text: string; oldNo: number; newNo: number }
  | { kind: 'del'; text: string; oldNo: number }
  | { kind: 'add'; text: string; newNo: number };

/** Side-by-side aligned row derived from a DiffRow. */
export type SbsRow =
  | { kind: 'meta' | 'hunk'; text: string; span: true }
  | {
      kind: 'pair';
      left: { text: string; no: number | null; type: 'ctx' | 'del' | 'empty' };
      right: { text: string; no: number | null; type: 'ctx' | 'add' | 'empty' };
    };

const HUNK_RE = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s@@/;

/**
 * Parse unified diff output into DiffRow[].
 * Meta lines (diff --git, index, ---/+++, Binary, new/deleted file, etc.)
 * get no line numbers. Hunk headers reset counters.
 */
export function parseUnifiedDiff(text: string): DiffRow[] {
  const lines = text.replace(/\n$/, '').split('\n');
  const rows: DiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const raw of lines) {
    const hunk = raw.match(HUNK_RE);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[3]);
      inHunk = true;
      rows.push({
        kind: 'hunk',
        text: raw,
        oldStart: oldLine,
        newStart: newLine,
      });
      continue;
    }

    // File headers / meta — before or between hunks
    if (
      raw.startsWith('diff --git') ||
      raw.startsWith('index ') ||
      raw.startsWith('---') ||
      raw.startsWith('+++') ||
      raw.startsWith('new file') ||
      raw.startsWith('deleted file') ||
      raw.startsWith('old mode') ||
      raw.startsWith('new mode') ||
      raw.startsWith('similarity index') ||
      raw.startsWith('rename from') ||
      raw.startsWith('rename to') ||
      raw.startsWith('copy from') ||
      raw.startsWith('copy to') ||
      raw.startsWith('Binary files') ||
      raw.startsWith('GIT binary')
    ) {
      inHunk = false;
      rows.push({ kind: 'meta', text: raw });
      continue;
    }

    if (!inHunk) {
      rows.push({ kind: 'meta', text: raw });
      continue;
    }

    // Content lines inside a hunk
    if (raw.startsWith('-')) {
      rows.push({ kind: 'del', text: raw.slice(1), oldNo: oldLine });
      oldLine += 1;
      continue;
    }
    if (raw.startsWith('+')) {
      rows.push({ kind: 'add', text: raw.slice(1), newNo: newLine });
      newLine += 1;
      continue;
    }
    // Context: leading space, or (rarely) no prefix after parse
    const ctxText = raw.startsWith(' ') ? raw.slice(1) : raw;
    rows.push({ kind: 'ctx', text: ctxText, oldNo: oldLine, newNo: newLine });
    oldLine += 1;
    newLine += 1;
  }

  return rows;
}

/**
 * Simple SBS alignment: one SBS row per unified row.
 * del → left filled / right empty; add → left empty / right filled; ctx → both.
 */
export function toSideBySide(rows: DiffRow[]): SbsRow[] {
  return rows.map((row) => {
    if (row.kind === 'meta' || row.kind === 'hunk') {
      return { kind: row.kind, text: row.text, span: true as const };
    }
    if (row.kind === 'ctx') {
      return {
        kind: 'pair' as const,
        left: { text: row.text, no: row.oldNo, type: 'ctx' as const },
        right: { text: row.text, no: row.newNo, type: 'ctx' as const },
      };
    }
    if (row.kind === 'del') {
      return {
        kind: 'pair' as const,
        left: { text: row.text, no: row.oldNo, type: 'del' as const },
        right: { text: '', no: null, type: 'empty' as const },
      };
    }
    // add
    return {
      kind: 'pair' as const,
      left: { text: '', no: null, type: 'empty' as const },
      right: { text: row.text, no: row.newNo, type: 'add' as const },
    };
  });
}
