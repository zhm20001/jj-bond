import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { getDiffFile } from '../api';
import { parseUnifiedDiff, toSideBySide, type DiffRow, type SbsRow } from '../diffParse';
import { useI18n } from '../I18nContext';
import type { DiffRange, DiffViewMode } from '../types';
import { shortId } from '../types';
import {
  RAIL_MAX_WIDTH,
  RAIL_MIN_WIDTH,
  useRailResize,
  type RailCounterpart,
} from '../useRailResize';

interface Props {
  open: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  onWidthCommit: (width: number) => void;
  /** The detail rail to the left: the divider trades width with it so the
   * graph pane keeps its size while detail and diff rebalance. */
  leftRail?: RailCounterpart;
  repoPath: string | null;
  changeId: string | null;
  filePath: string | null;
  /** When set (exactly two selected), compare from→to instead of -r. */
  compareRange?: DiffRange | null;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
}

export function DiffPane({
  open,
  width,
  onWidthChange,
  onWidthCommit,
  leftRail,
  repoPath,
  changeId,
  filePath,
  compareRange = null,
  viewMode,
  onViewModeChange,
}: Props) {
  const { t } = useI18n();
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { dragging, onResizePointerDown } = useRailResize(
    width,
    onWidthChange,
    onWidthCommit,
    leftRail,
  );

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);
    if (!open || !repoPath || !changeId || !filePath) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getDiffFile(repoPath, changeId, filePath, compareRange)
      .then((body) => {
        if (!cancelled) {
          setText(body);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, repoPath, changeId, filePath, compareRange?.from, compareRange?.to]);

  if (!open) return null;

  let body: ReactNode;
  if (!changeId) {
    body = <p className="diff-empty">{t('diff.noSelection')}</p>;
  } else if (!filePath) {
    body = <p className="diff-empty">{t('diff.empty')}</p>;
  } else if (loading) {
    body = <p className="diff-empty muted">{t('diff.loading')}</p>;
  } else if (error) {
    body = (
      <p className="diff-empty diff-error">
        {t('diff.error')}
        <br />
        <span className="muted">{error}</span>
      </p>
    );
  } else if (text === null) {
    body = <p className="diff-empty muted">{t('diff.loading')}</p>;
  } else if (!text.trim() || isBinaryOrEmpty(text)) {
    body = <p className="diff-empty muted">{t('diff.binaryOrEmpty')}</p>;
  } else if (viewMode === 'sideBySide') {
    body = <DiffSideBySide text={text} />;
  } else {
    body = <DiffUnified text={text} />;
  }

  return (
    <aside
      className={`diff-rail open${dragging ? ' is-resizing' : ''}`}
      style={{ width }}
    >
      <div
        className="diff-resize-handle"
        onPointerDown={onResizePointerDown}
        title={t('diff.resize')}
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={RAIL_MIN_WIDTH}
        aria-valuemax={RAIL_MAX_WIDTH}
      />
      <div className="diff-header">
        <h2>
          {compareRange
            ? t('diff.compareTitle', {
                from: shortId(compareRange.from),
                to: shortId(compareRange.to),
              })
            : t('diff.title')}
        </h2>
        {filePath && (
          <span className="diff-header-path mono" title={filePath}>
            {filePath}
          </span>
        )}
        <div
          className="diff-mode-toggle"
          role="group"
          aria-label={t('diff.mode')}
        >
          <button
            type="button"
            className={`diff-mode-btn${viewMode === 'unified' ? ' is-active' : ''}`}
            aria-pressed={viewMode === 'unified'}
            onClick={() => onViewModeChange('unified')}
          >
            {t('diff.modeUnified')}
          </button>
          <button
            type="button"
            className={`diff-mode-btn${viewMode === 'sideBySide' ? ' is-active' : ''}`}
            aria-pressed={viewMode === 'sideBySide'}
            onClick={() => onViewModeChange('sideBySide')}
          >
            {t('diff.modeSideBySide')}
          </button>
        </div>
      </div>
      <div className="diff-body">{body}</div>
    </aside>
  );
}

function isBinaryOrEmpty(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/\(binary\)/i.test(trimmed) && trimmed.split('\n').length <= 3) {
    return true;
  }
  return false;
}

function gutter(n: number | null | undefined): string {
  return n == null ? '' : String(n);
}

function DiffUnified({ text }: { text: string }) {
  const rows = useMemo(() => parseUnifiedDiff(text), [text]);
  return (
    <pre className="diff-pre diff-unified">
      {rows.map((row, i) => (
        <UnifiedRow key={i} row={row} />
      ))}
    </pre>
  );
}

function UnifiedRow({ row }: { row: DiffRow }) {
  if (row.kind === 'meta') {
    return (
      <div className="diff-line diff-meta">
        <span className="diff-gutter" />
        <span className="diff-gutter" />
        <span className="diff-sign" />
        <span className="diff-text">{row.text || ' '}</span>
      </div>
    );
  }
  if (row.kind === 'hunk') {
    return (
      <div className="diff-line diff-hunk">
        <span className="diff-gutter" />
        <span className="diff-gutter" />
        <span className="diff-sign" />
        <span className="diff-text">{row.text || ' '}</span>
      </div>
    );
  }
  if (row.kind === 'ctx') {
    return (
      <div className="diff-line diff-ctx">
        <span className="diff-gutter">{gutter(row.oldNo)}</span>
        <span className="diff-gutter">{gutter(row.newNo)}</span>
        <span className="diff-sign"> </span>
        <span className="diff-text">{row.text.length ? row.text : ' '}</span>
      </div>
    );
  }
  if (row.kind === 'del') {
    return (
      <div className="diff-line diff-del">
        <span className="diff-gutter">{gutter(row.oldNo)}</span>
        <span className="diff-gutter" />
        <span className="diff-sign">-</span>
        <span className="diff-text">{row.text.length ? row.text : ' '}</span>
      </div>
    );
  }
  // add
  return (
    <div className="diff-line diff-add">
      <span className="diff-gutter" />
      <span className="diff-gutter">{gutter(row.newNo)}</span>
      <span className="diff-sign">+</span>
      <span className="diff-text">{row.text.length ? row.text : ' '}</span>
    </div>
  );
}

function DiffSideBySide({ text }: { text: string }) {
  const sbs = useMemo(() => toSideBySide(parseUnifiedDiff(text)), [text]);
  return (
    <div className="diff-sbs">
      {sbs.map((row, i) => (
        <SbsRowView key={i} row={row} />
      ))}
    </div>
  );
}

function SbsRowView({ row }: { row: SbsRow }) {
  if (row.kind !== 'pair') {
    return (
      <div className={`diff-sbs-row diff-sbs-span diff-${row.kind}`}>
        <span className="diff-text">{row.text || ' '}</span>
      </div>
    );
  }
  const { left, right } = row;
  return (
    <div className="diff-sbs-row">
      <div className={`diff-sbs-cell diff-${left.type}`}>
        <span className="diff-gutter">{gutter(left.no)}</span>
        <span className="diff-sign">
          {left.type === 'del' ? '-' : left.type === 'ctx' ? ' ' : ''}
        </span>
        <span className="diff-text">
          {left.type === 'empty' ? ' ' : left.text.length ? left.text : ' '}
        </span>
      </div>
      <div className={`diff-sbs-cell diff-${right.type}`}>
        <span className="diff-gutter">{gutter(right.no)}</span>
        <span className="diff-sign">
          {right.type === 'add' ? '+' : right.type === 'ctx' ? ' ' : ''}
        </span>
        <span className="diff-text">
          {right.type === 'empty' ? ' ' : right.text.length ? right.text : ' '}
        </span>
      </div>
    </div>
  );
}
