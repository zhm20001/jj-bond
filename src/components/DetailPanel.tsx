import { useEffect, useMemo, useState } from 'react';
import { getDiffFiles, listConflicts } from '../api';
import type {
  ConflictEntry,
  DiffFileEntry,
  DiffRange,
  DiffStat,
  GraphLayout,
  Revision,
} from '../types';
import { shortId, splitChangeIdPrefix } from '../types';
import { formatTsRelativeThenAbsolute } from '../i18n';
import { useI18n } from '../I18nContext';
import { orderSelectedByGraph } from '../selection';
import {
  RAIL_MAX_WIDTH,
  RAIL_MIN_WIDTH,
  useRailResize,
} from '../useRailResize';

// Diff summary marks; R/C have no intuitive symbol and keep their letter.
const STATUS_MARK: Record<string, string> = {
  A: '+',
  M: '±',
  D: '−',
};

interface Props {
  open: boolean;
  width: number;
  onToggle: () => void;
  onWidthChange: (width: number) => void;
  onWidthCommit: (width: number) => void;
  selectedIds: string[];
  layout: GraphLayout | null;
  repoPath: string | null;
  selectedFile: string | null;
  onSelectedFileChange: (path: string | null) => void;
  /** Bump after resolve so conflicts/files reload. */
  refreshToken?: number;
  onResolveConflict?: (
    revisionId: string,
    filePath: string,
    tool: 'ours' | 'theirs',
  ) => void;
}

export function DetailPanel({
  open,
  width,
  onToggle,
  onWidthChange,
  onWidthCommit,
  selectedIds,
  layout,
  repoPath,
  selectedFile,
  onSelectedFileChange,
  refreshToken = 0,
  onResolveConflict,
}: Props) {
  const { t, locale } = useI18n();

  const compareRange: DiffRange | null = useMemo(() => {
    if (!layout || selectedIds.length !== 2) return null;
    const ordered = orderSelectedByGraph(layout.nodes, selectedIds);
    if (ordered.length !== 2) return null;
    // orderSelectedByGraph: newer (lower index) first → older last.
    const newer = ordered[0];
    const older = ordered[1];
    return { from: older, to: newer };
  }, [layout, selectedIds]);

  const primaryId = compareRange
    ? compareRange.to
    : selectedIds.length
      ? selectedIds[selectedIds.length - 1]
      : null;
  const rev: Revision | null =
    primaryId && layout
      ? layout.nodes.find((n) => n.rev.changeId === primaryId)?.rev ?? null
      : null;

  const [conflicts, setConflicts] = useState<ConflictEntry[] | null>(null);
  const [files, setFiles] = useState<DiffFileEntry[] | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);
  const { dragging, onResizePointerDown } = useRailResize(
    width,
    onWidthChange,
    onWidthCommit,
  );

  const [stat, setStat] = useState<DiffStat | null>(null);

  const rangeKey = compareRange
    ? `${compareRange.from}:${compareRange.to}`
    : '';

  useEffect(() => {
    let cancelled = false;
    setConflicts(null);
    if (!rev || !repoPath || !rev.conflict || compareRange) return;
    listConflicts(repoPath, rev.changeId)
      .then((entries) => {
        if (!cancelled) setConflicts(entries);
      })
      .catch(() => {
        if (!cancelled) setConflicts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [rev?.changeId, rev?.commitId, rev?.conflict, repoPath, refreshToken, compareRange]);

  useEffect(() => {
    let cancelled = false;
    setFiles(null);
    setStat(null);
    setFilesError(null);
    onSelectedFileChange(null);
    if (!rev || !repoPath) return;
    getDiffFiles(repoPath, rev.changeId, compareRange)
      .then(({ files: list, stat: totals }) => {
        if (cancelled) return;
        setFiles(list);
        setStat(totals);
        if (list.length > 0) {
          onSelectedFileChange(list[0].path);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setFiles([]);
        setFilesError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clear selection only when revision/range changes
  }, [rev?.changeId, rev?.commitId, repoPath, rangeKey, refreshToken]);

  if (!open) {
    return (
      <aside className="detail-rail collapsed" onClick={onToggle} title={t('detail.expand')}>
        <div className="rail-label">◀</div>
        <div className="rail-vertical">{t('detail.title')}</div>
      </aside>
    );
  }

  const byChange = new Map(
    (layout?.nodes ?? []).map((n) => [n.rev.changeId, n.rev] as const),
  );

  const conflictPaths = new Set((conflicts ?? []).map((c) => c.path));

  return (
    <aside
      className={`detail-rail open${dragging ? ' is-resizing' : ''}`}
      style={{ width }}
    >
      <div
        className="detail-resize-handle"
        onPointerDown={onResizePointerDown}
        title={t('detail.resize')}
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={RAIL_MIN_WIDTH}
        aria-valuemax={RAIL_MAX_WIDTH}
      />
      <div className="detail-header">
        <h2>{t('detail.title')}</h2>
        <button type="button" className="icon-btn" onClick={onToggle} title={t('detail.collapse')}>
          ▶
        </button>
      </div>
      {!rev ? (
        <p className="detail-empty">{t('detail.empty')}</p>
      ) : (
        <div className="detail-body">
          {compareRange && (
            <p className="detail-compare-hint">
              {t('detail.compareHint', {
                from: shortId(compareRange.from),
                to: shortId(compareRange.to),
              })}
            </p>
          )}
          {!compareRange && selectedIds.length > 1 && (
            <p className="detail-multi">
              {t('detail.multiMore', { n: selectedIds.length - 1 })}
            </p>
          )}
          <p className="detail-desc">
            {rev.description.trim() || t('detail.noDescription')}
          </p>
          <Meta label={t('detail.author')} value={rev.author || '—'} />
          <Meta
            label={t('detail.date')}
            value={formatTsRelativeThenAbsolute(locale, rev.committerTs)}
          />
          <div className="meta-row">
            <span className="meta-label">{t('detail.change')}</span>
            <span className="meta-value mono">
              <ChangeIdSpan changeId={rev.changeId} uniquePrefixLen={rev.uniquePrefixLen} />
              {'  |  '}
              <CommitIdSpan
                commitId={rev.commitId}
                uniqueCommitPrefixLen={rev.uniqueCommitPrefixLen}
              />
            </span>
          </div>
          <div className="meta-row">
            <span className="meta-label">{t('detail.parents')}</span>
            <div className="meta-value-stack">
              {rev.parents.length === 0 ? (
                <span className="mono">—</span>
              ) : (
                rev.parents.map((pid) => {
                  const parent = byChange.get(pid);
                  return (
                    <span key={pid} className="mono">
                      <ChangeIdSpan
                        changeId={pid}
                        uniquePrefixLen={parent?.uniquePrefixLen ?? 1}
                      />
                      {'  |  '}
                      {parent ? (
                        <CommitIdSpan
                          commitId={parent.commitId}
                          uniqueCommitPrefixLen={parent.uniqueCommitPrefixLen}
                        />
                      ) : (
                        '—'
                      )}
                    </span>
                  );
                })
              )}
            </div>
          </div>
          <Meta
            label={t('detail.bookmarks')}
            value={rev.bookmarks.length ? rev.bookmarks.join(', ') : '—'}
          />
          <div className="meta-row">
            <span className="meta-label">{t('detail.diff')}</span>
            <DiffStatView stat={stat} />
          </div>
          {rev.isWorkingCopy && <span className="badge wc">{t('detail.wc')}</span>}
          {rev.immutable && <span className="badge imm">{t('detail.immutable')}</span>}
          {rev.conflict && !compareRange && (
            <span className="badge conflict">{t('detail.conflictBadge')}</span>
          )}
          {rev.conflict && !compareRange && (
            <div className="detail-conflicts">
              <h3 className="detail-conflicts-title">{t('detail.conflicts')}</h3>
              {conflicts === null ? (
                <p className="muted">…</p>
              ) : conflicts.length === 0 ? (
                <p className="muted">—</p>
              ) : (
                <ul className="conflict-file-list">
                  {conflicts.map((c) => (
                    <li key={c.path} className="conflict-file-item">
                      <div className="conflict-file-row">
                        <span className="mono conflict-file-path">{c.path}</span>
                        {c.detail ? (
                          <span className="muted conflict-file-detail"> · {c.detail}</span>
                        ) : null}
                      </div>
                      {onResolveConflict && (
                        <div className="conflict-resolve-actions">
                          <button
                            type="button"
                            className="btn resolve-btn"
                            onClick={() =>
                              onResolveConflict(rev.changeId, c.path, 'ours')
                            }
                          >
                            {t('resolve.ours')}
                          </button>
                          <button
                            type="button"
                            className="btn resolve-btn"
                            onClick={() =>
                              onResolveConflict(rev.changeId, c.path, 'theirs')
                            }
                          >
                            {t('resolve.theirs')}
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="detail-conflict-hint">{t('detail.conflictHint')}</p>
            </div>
          )}

          <div className="detail-files">
            <h3 className="detail-files-title">{t('detail.files')}</h3>
            {files === null ? (
              <p className="muted">…</p>
            ) : filesError ? (
              <p className="muted">{filesError}</p>
            ) : files.length === 0 ? (
              <p className="muted">{t('detail.noFiles')}</p>
            ) : (
              <ul className="file-list">
                {files.map((f) => {
                  const conflicted = conflictPaths.has(f.path);
                  const selected = selectedFile === f.path;
                  return (
                    <li key={`${f.status}:${f.path}`}>
                      <button
                        type="button"
                        className={`file-row${selected ? ' is-selected' : ''}${
                          conflicted ? ' is-conflict' : ''
                        }`}
                        onClick={() => onSelectedFileChange(f.path)}
                        title={f.path}
                      >
                        <span className={`file-status status-${f.status}`}>
                          {STATUS_MARK[f.status] ?? f.status}
                        </span>
                        <span className="file-path mono">
                          {conflicted ? (
                            <span className="file-conflict-mark" title={t('detail.fileConflict')}>
                              !
                            </span>
                          ) : null}
                          {f.path}
                        </span>
                        <span className="file-stat">
                          {f.insertions > 0 && (
                            <span className="ins">+{f.insertions}</span>
                          )}
                          {f.deletions > 0 && (
                            <span className="del">-{f.deletions}</span>
                          )}
                          {f.insertions === 0 && f.deletions === 0 && (
                            <span className="muted">±0</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function ChangeIdSpan({
  changeId,
  uniquePrefixLen,
}: {
  changeId: string;
  uniquePrefixLen: number;
}) {
  const { prefix, rest } = splitChangeIdPrefix(changeId, uniquePrefixLen ?? 1);
  return (
    <span className="rev-id" title={changeId}>
      <span className="id-prefix">{prefix}</span>
      <span className="id-rest">{rest}</span>
    </span>
  );
}

function CommitIdSpan({
  commitId,
  uniqueCommitPrefixLen,
}: {
  commitId: string;
  uniqueCommitPrefixLen: number;
}) {
  const { prefix, rest } = splitChangeIdPrefix(commitId, uniqueCommitPrefixLen ?? 1);
  return (
    <span className="rev-id" title={commitId}>
      <span className="id-prefix-commit">{prefix}</span>
      <span className="id-rest">{rest}</span>
    </span>
  );
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="meta-row">
      <span className="meta-label">{label}</span>
      <span className={mono ? 'meta-value mono' : 'meta-value'}>{value}</span>
    </div>
  );
}

function DiffStatView({ stat }: { stat: DiffStat | null }) {
  if (!stat) return <span className="muted">…</span>;
  if (stat.insertions === 0 && stat.deletions === 0) {
    return (
      <span className="diff-stat">
        <span className="ins">+0</span> <span className="del">-0</span>
      </span>
    );
  }
  return (
    <span className="diff-stat">
      {stat.insertions > 0 && <span className="ins">+{stat.insertions}</span>}{' '}
      {stat.deletions > 0 && <span className="del">-{stat.deletions}</span>}
    </span>
  );
}
