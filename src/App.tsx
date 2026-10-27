import { useCallback, useEffect, useState } from 'react';
import {
  revealInFileManager,
  initialRepoHint,
  pickRepoDirectory,
  supportsDirectoryPicker,
  jjAbandon,
  jjBookmarkCreate,
  jjBookmarkDelete,
  jjBookmarkMove,
  jjBookmarkRename,
  jjDescribe,
  jjDuplicate,
  jjEdit,
  jjNew,
  jjNewRevisions,
  jjRebase,
  jjRedo,
  jjRestoreFromParent,
  jjRevertOntoWc,
  jjSquash,
  jjUndo,
  listConflicts,
  loadPrefs,
  openRepo,
  reloadLog,
  resolveConflict,
  savePrefs,
} from './api';
import { ConfirmDialog } from './components/ConfirmDialog';
import {
  ContextMenu,
  type ContextMenuAction,
} from './components/ContextMenu';
import { ConflictBanner } from './components/ConflictBanner';
import { DetailPanel } from './components/DetailPanel';
import { DiffPane } from './components/DiffPane';
import { GraphCanvas } from './components/GraphCanvas';
import { PromptDialog } from './components/PromptDialog';
import { Toolbar } from './components/Toolbar';
import { I18nProvider } from './I18nContext';
import { htmlLang, labelRev, t } from './i18n';
import { orderSelectedByGraph } from './selection';
import type {
  ConflictNotice,
  ContextMenuState,
  DensityMode,
  GraphLayout,
  GrowthDirection,
  Locale,
  PendingConfirm,
  PendingPrompt,
  Prefs,
  DiffRange,
  DiffViewMode,
  SortMode,
  ThemeMode,
} from './types';
import { shortId } from './types';
import { applyTheme } from './theme';
import './App.css';

const defaultPrefs: Prefs = {
  density: 'compact',
  sort: 'workingCopyFirst',
  growth: 'bottomUp',
  theme: 'system',
  locale: 'zh',
  detailPanelOpen: true,
  detailPanelWidth: 320,
  diffPanelWidth: 420,
  diffViewMode: 'unified',
  lastRepo: null,
  lastRevset: null,
};

export default function App() {
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs);
  const [repoInput, setRepoInput] = useState('');
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [revsetInput, setRevsetInput] = useState('');
  const [appliedRevset, setAppliedRevset] = useState('');
  const [layout, setLayout] = useState<GraphLayout | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const [status, setStatus] = useState(() => t(defaultPrefs.locale, 'status.ready'));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [prompt, setPrompt] = useState<PendingPrompt | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [busy, setBusy] = useState(false);
  const [canPickDirectory] = useState(() => supportsDirectoryPicker());
  const [conflictNotice, setConflictNotice] = useState<ConflictNotice | null>(null);

  const locale: Locale = prefs.locale ?? 'zh';

  // Resolve & apply theme; follow OS when theme === system.
  useEffect(() => {
    const mode = prefs.theme ?? 'system';
    applyTheme(mode);
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [prefs.theme]);

  // Sync <html lang> with locale.
  useEffect(() => {
    document.documentElement.lang = htmlLang(locale);
  }, [locale]);

  // Re-translate status (and known local errors) when language changes.
  useEffect(() => {
    if (layout && repoPath) {
      setStatus(
        t(locale, 'status.loaded', { n: layout.nodes.length, path: repoPath }),
      );
    } else {
      setStatus(t(locale, 'status.ready'));
    }
    setError((prev) => {
      if (!prev) return prev;
      // Only rewrite errors that came from our i18n keys.
      const known = [
        t('zh', 'status.enterPath'),
        t('en', 'status.enterPath'),
        t('zh', 'status.revealNeedPath'),
        t('en', 'status.revealNeedPath'),
      ];
      if (!known.includes(prev)) return prev;
      if (prev === t('zh', 'status.enterPath') || prev === t('en', 'status.enterPath')) {
        return t(locale, 'status.enterPath');
      }
      return t(locale, 'status.revealNeedPath');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const persist = useCallback(async (next: Prefs) => {
    setPrefs(next);
    try {
      await savePrefs(next);
    } catch (e) {
      console.warn('save prefs', e);
    }
  }, []);

  const doOpen = useCallback(
    async (path: string, sort: SortMode = prefs.sort, revset?: string) => {
      const trimmed = path.trim();
      const loc = prefs.locale ?? 'zh';
      if (!trimmed) {
        setError(t(loc, 'status.enterPath'));
        return;
      }
      const rev = (revset ?? appliedRevset).trim();
      setBusy(true);
      setError(null);
      try {
        const res = await openRepo(trimmed, sort, rev);
        setRepoPath(res.path);
        setRepoInput(res.path);
        setLayout(res.layout);
        setSelected([]);
        setPending(null);
        setPrompt(null);
        setContextMenu(null);
        setConflictNotice(null);
        setAppliedRevset(rev);
        setRevsetInput(rev);
        setStatus(
          t(loc, 'status.loaded', { n: res.layout.nodes.length, path: res.path }),
        );
        await persist({
          ...prefs,
          lastRepo: res.path,
          sort,
          lastRevset: rev || null,
        });
      } catch (e) {
        setLayout(null);
        setRepoPath(null);
        setError(String(e));
        setStatus(t(loc, 'status.openFailed'));
      } finally {
        setBusy(false);
      }
    },
    [prefs, persist, appliedRevset],
  );

  const doReload = useCallback(async () => {
    if (!repoPath) return;
    const loc = prefs.locale ?? 'zh';
    setBusy(true);
    setError(null);
    try {
      const next = await reloadLog(repoPath, prefs.sort, appliedRevset);
      setLayout(next);
      setPending(null);
      setContextMenu(null);
      setDetailRefresh((n) => n + 1);
      setStatus(t(loc, 'status.refreshed', { n: next.nodes.length }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [repoPath, prefs.sort, prefs.locale, appliedRevset]);

  const applyRevset = useCallback(async () => {
    if (!repoPath) return;
    const loc = prefs.locale ?? 'zh';
    const rev = revsetInput.trim();
    setBusy(true);
    setError(null);
    try {
      const next = await reloadLog(repoPath, prefs.sort, rev);
      setLayout(next);
      setAppliedRevset(rev);
      setSelected([]);
      setPending(null);
      setContextMenu(null);
      setStatus(t(loc, 'status.revsetApplied', { n: next.nodes.length }));
      await persist({ ...prefs, lastRevset: rev || null });
    } catch (e) {
      // Keep previous graph; show friendly error.
      setError(String(e));
      setStatus(t(loc, 'status.revsetInvalid'));
    } finally {
      setBusy(false);
    }
  }, [repoPath, revsetInput, prefs, persist]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let p = await loadPrefs();
        if (cancelled) return;
        const params = new URLSearchParams(window.location.search);
        const detailParam = params.get('detail');
        if (detailParam === 'collapsed') p = { ...p, detailPanelOpen: false };
        if (detailParam === 'open') p = { ...p, detailPanelOpen: true };
        const merged: Prefs = {
          ...defaultPrefs,
          ...p,
          theme: p.theme ?? 'system',
          locale: p.locale ?? 'zh',
          diffViewMode: p.diffViewMode ?? 'unified',
          lastRevset: p.lastRevset ?? null,
        };
        setPrefs(merged);
        const loc = merged.locale;
        const hint = await initialRepoHint();
        if (cancelled) return;
        const path = params.get('repo') || hint || p.lastRepo || '';
        const initialRevset = (params.get('revset') || p.lastRevset || '').trim();
        setRepoInput(path);
        setRevsetInput(initialRevset);
        setAppliedRevset(initialRevset);
        if (!path) return;
        const opened = await openRepo(path, p.sort, initialRevset);
        if (cancelled) return;
        setRepoPath(opened.path);
        setRepoInput(opened.path);
        setLayout(opened.layout);
        setPending(null);
        setStatus(
          t(loc, 'status.loaded', {
            n: opened.layout.nodes.length,
            path: opened.path,
          }),
        );
        await persist({
          ...merged,
          lastRepo: opened.path,
          sort: p.sort,
          lastRevset: initialRevset || null,
        });
        if (detailParam === 'open' || params.get('select') === '1') {
          const pick =
            opened.layout.nodes.find(
              (n) => n.rev.parents.length > 0 && n.rev.description.trim(),
            ) ?? opened.layout.nodes[0];
          if (pick) setSelected([pick.rev.changeId]);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') {
        if (contextMenu) {
          e.preventDefault();
          setContextMenu(null);
          return;
        }
        if (prompt) {
          e.preventDefault();
          setPrompt(null);
          return;
        }
        if (pending) {
          e.preventDefault();
          setPending(null);
          return;
        }
      }
      if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        void runUndo();
      } else if (meta && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        void runRedo();
      } else if (e.key === 'F5' || (meta && e.key.toLowerCase() === 'r')) {
        e.preventDefault();
        void doReload();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onSelect = (ids: string[]) => {
    setSelected(ids);
  };

  const onDoubleClick = async (changeId: string) => {
    if (!repoPath || !layout) return;
    const rev = layout.nodes.find((n) => n.rev.changeId === changeId)?.rev;
    if (!rev) return;
    setBusy(true);
    setError(null);
    try {
      const msg = rev.immutable
        ? await jjNew(repoPath, changeId)
        : await jjEdit(repoPath, changeId);
      setStatus(msg);
      await doReload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const runUndo = async () => {
    if (!repoPath) return;
    setBusy(true);
    try {
      const msg = await jjUndo(repoPath);
      setStatus(msg);
      await doReload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const runRedo = async () => {
    if (!repoPath) return;
    setBusy(true);
    try {
      const msg = await jjRedo(repoPath);
      setStatus(msg);
      await doReload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const conflictedIds = (layout: GraphLayout | null): Set<string> => {
    const set = new Set<string>();
    if (!layout) return set;
    for (const n of layout.nodes) {
      if (n.rev.conflict) set.add(n.rev.changeId);
    }
    return set;
  };

  const buildConflictNotice = async (
    path: string,
    next: GraphLayout,
    before: Set<string> | null,
  ): Promise<ConflictNotice | null> => {
    const after = conflictedIds(next);
    let newIds: string[];
    if (before === null) {
      // Before-set unavailable: surface any post-rebase conflicts.
      newIds = [...after];
    } else {
      newIds = [...after].filter((id) => !before.has(id));
    }
    // Only newly conflicted (or all, when before was unavailable).
    const focusIds = newIds;
    if (focusIds.length === 0) return null;
    const byId = new Map(next.nodes.map((n) => [n.rev.changeId, n.rev]));
    const commits = focusIds.map((id) => {
      const rev = byId.get(id);
      return {
        changeId: id,
        description: rev?.description ?? '',
      };
    });
    const pathSet = new Set<string>();
    for (const id of focusIds) {
      try {
        const entries = await listConflicts(path, id);
        for (const e of entries) pathSet.add(e.path);
      } catch {
        // ignore per-rev list failures
      }
    }
    return {
      changeIds: focusIds,
      commits,
      paths: [...pathSet].sort(),
    };
  };

  const confirmPending = async () => {
    if (!pending || !repoPath) return;
    const loc = prefs.locale ?? 'zh';
    setBusy(true);
    setError(null);
    try {
      if (pending.kind === 'rebase') {
        const before = conflictedIds(layout);
        await jjRebase(repoPath, pending.sourceIds, pending.targetId);
        setPending(null);
        const next = await reloadLog(repoPath, prefs.sort, appliedRevset);
        setLayout(next);
        const notice = await buildConflictNotice(repoPath, next, before);
        if (notice) {
          setConflictNotice(notice);
          setStatus(
            t(loc, 'status.rebaseOkConflicts', { n: notice.changeIds.length }),
          );
        } else {
          setConflictNotice(null);
          setStatus(t(loc, 'status.rebaseOk'));
        }
      } else if (pending.kind === 'abandon') {
        const msg = await jjAbandon(repoPath, pending.revisionIds);
        setStatus(msg);
        setPending(null);
        setContextMenu(null);
        await doReload();
      } else if (pending.kind === 'resolveConflict') {
        await resolveConflict(
          repoPath,
          pending.revisionId,
          pending.filePath,
          pending.tool,
        );
        setStatus(
          t(loc, 'status.resolveOk', {
            path: pending.filePath,
            tool: pending.tool,
          }),
        );
        setPending(null);
        setConflictNotice(null);
        await doReload();
      } else if (pending.kind === 'bookmarkDelete') {
        const msg = await jjBookmarkDelete(repoPath, pending.name);
        setStatus(msg);
        setPending(null);
        await doReload();
      } else {
        const msg = pending.immutable
          ? await jjNew(repoPath, pending.targetId)
          : await jjEdit(repoPath, pending.targetId);
        setStatus(msg);
        setPending(null);
        await doReload();
      }
    } catch (e) {
      setError(String(e));
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  const runAfterMenu = async (fn: () => Promise<string>) => {
    if (!repoPath) return;
    setBusy(true);
    setError(null);
    setContextMenu(null);
    try {
      const msg = await fn();
      setStatus(msg);
      await doReload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onContextAction = (action: ContextMenuAction) => {
    if (!repoPath || !layout || !contextMenu) return;
    const ids = orderSelectedByGraph(layout.nodes, contextMenu.revisionIds);
    if (!ids.length) {
      setContextMenu(null);
      return;
    }
    const byId = new Map(layout.nodes.map((n) => [n.rev.changeId, n.rev]));
    const revs = ids.map((id) => byId.get(id)!).filter(Boolean);
    const oldest = revs[revs.length - 1];
    const newest = revs[0];
    const loc = prefs.locale ?? 'zh';
    const labelOne = (r: (typeof revs)[0]) =>
      labelRev(loc, r.changeId, r.description);
    const selLabel =
      revs.length === 1
        ? labelOne(newest)
        : `${labelOne(oldest)}  …  ${labelOne(newest)} (${revs.length})`;

    switch (action) {
      case 'newChild':
        void runAfterMenu(() => jjNewRevisions(repoPath, ids, 'child'));
        break;
      case 'newInsertBefore':
        // GG: insert before oldest selected.
        void runAfterMenu(() =>
          jjNewRevisions(repoPath, [oldest.changeId], 'insertBefore'),
        );
        break;
      case 'edit': {
        const rev = newest;
        setContextMenu(null);
        void runAfterMenu(async () =>
          rev.immutable
            ? jjNew(repoPath, rev.changeId)
            : jjEdit(repoPath, rev.changeId),
        );
        break;
      }
      case 'revert':
        void runAfterMenu(() => jjRevertOntoWc(repoPath, ids));
        break;
      case 'duplicate':
        void runAfterMenu(() => jjDuplicate(repoPath, ids));
        break;
      case 'abandon':
        setContextMenu(null);
        setPending({
          kind: 'abandon',
          revisionIds: ids,
          label: selLabel,
        });
        break;
      case 'squash': {
        const parent =
          oldest.parents.length === 1 ? oldest.parents[0] : null;
        if (!parent) {
          setContextMenu(null);
          return;
        }
        if (ids.length === 1) {
          void runAfterMenu(() => jjSquash(repoPath, ids));
        } else {
          void runAfterMenu(() => jjSquash(repoPath, ids, parent));
        }
        break;
      }
      case 'restore': {
        const parent =
          oldest.parents.length === 1 ? oldest.parents[0] : null;
        if (!parent) {
          setContextMenu(null);
          return;
        }
        void runAfterMenu(() =>
          jjRestoreFromParent(repoPath, ids, parent),
        );
        break;
      }
      case 'bookmark':
        setContextMenu(null);
        setPrompt({
          kind: 'bookmark',
          revisionId: newest.changeId,
          label: labelOne(newest),
        });
        break;
      case 'bookmarkMove': {
        setContextMenu(null);
        const candidates = [
          ...new Set(
            layout.nodes.flatMap((n) => n.rev.bookmarks).filter(Boolean),
          ),
        ].sort();
        setPrompt({
          kind: 'bookmarkMove',
          revisionId: newest.changeId,
          label: labelOne(newest),
          candidates,
        });
        break;
      }
      case 'bookmarkRename': {
        setContextMenu(null);
        const marks = newest.bookmarks;
        if (marks.length === 1) {
          setPrompt({
            kind: 'bookmarkRename',
            revisionId: newest.changeId,
            label: labelOne(newest),
            oldName: marks[0],
          });
        } else {
          setPrompt({
            kind: 'bookmarkPick',
            next: 'rename',
            revisionId: newest.changeId,
            label: labelOne(newest),
            candidates: marks,
          });
        }
        break;
      }
      case 'bookmarkDelete': {
        setContextMenu(null);
        const marks = newest.bookmarks;
        if (marks.length === 1) {
          setPending({
            kind: 'bookmarkDelete',
            name: marks[0],
            label: `${marks[0]} · ${labelOne(newest)}`,
          });
        } else {
          setPrompt({
            kind: 'bookmarkPick',
            next: 'delete',
            revisionId: newest.changeId,
            label: labelOne(newest),
            candidates: marks,
          });
        }
        break;
      }
      case 'describe':
        setContextMenu(null);
        setPrompt({
          kind: 'describe',
          revisionId: newest.changeId,
          label: labelOne(newest),
          initial: newest.description,
        });
        break;
    }
  };

  const submitPrompt = async (value: string) => {
    if (!prompt || !repoPath) return;
    const pendingPrompt = prompt;
    setPrompt(null);
    const loc = prefs.locale ?? 'zh';

    if (pendingPrompt.kind === 'bookmarkPick') {
      const name = value.trim();
      if (!name) return;
      if (pendingPrompt.next === 'rename') {
        setPrompt({
          kind: 'bookmarkRename',
          revisionId: pendingPrompt.revisionId,
          label: pendingPrompt.label,
          oldName: name,
        });
        return;
      }
      setPending({
        kind: 'bookmarkDelete',
        name,
        label: `${name} · ${pendingPrompt.label}`,
      });
      return;
    }

    setBusy(true);
    setError(null);
    try {
      let msg: string;
      if (pendingPrompt.kind === 'bookmark') {
        msg = await jjBookmarkCreate(
          repoPath,
          value,
          pendingPrompt.revisionId,
        );
      } else if (pendingPrompt.kind === 'bookmarkMove') {
        msg = await jjBookmarkMove(
          repoPath,
          value,
          pendingPrompt.revisionId,
        );
      } else if (pendingPrompt.kind === 'bookmarkRename') {
        msg = await jjBookmarkRename(
          repoPath,
          pendingPrompt.oldName,
          value,
        );
      } else {
        msg = await jjDescribe(
          repoPath,
          pendingPrompt.revisionId,
          value,
        );
      }
      setStatus(msg);
      await doReload();
    } catch (e) {
      setError(String(e));
      setStatus(
        pendingPrompt.kind === 'bookmark'
          || pendingPrompt.kind === 'bookmarkMove'
          || pendingPrompt.kind === 'bookmarkRename'
          ? String(e)
          : t(loc, 'status.openFailed'),
      );
    } finally {
      setBusy(false);
    }
  };

  const doRevealDir = useCallback(async () => {
    const path = (repoPath || repoInput).trim();
    const loc = prefs.locale ?? 'zh';
    if (!path) {
      setError(t(loc, 'status.revealNeedPath'));
      return;
    }
    try {
      await revealInFileManager(path);
      setStatus(t(loc, 'status.revealed', { path }));
    } catch (e) {
      setError(String(e));
      setStatus(t(loc, 'status.revealFailed'));
    }
  }, [repoPath, repoInput, prefs.locale]);

  // Empty-state picker: choose a repo with the OS dialog, then open it.
  const doOpenPicked = useCallback(async () => {
    const dir = await pickRepoDirectory();
    if (dir) await doOpen(dir);
  }, [doOpen]);

  const setDensity = (density: DensityMode) => persist({ ...prefs, density });
  const setSort = async (sort: SortMode) => {
    await persist({ ...prefs, sort });
    if (repoPath) {
      setBusy(true);
      try {
        const next = await reloadLog(repoPath, sort, appliedRevset);
        setLayout(next);
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    }
  };

  const compareRange: DiffRange | null =
    layout && selected.length === 2
      ? (() => {
          const ordered = orderSelectedByGraph(layout.nodes, selected);
          if (ordered.length !== 2) return null;
          return { from: ordered[1], to: ordered[0] };
        })()
      : null;

  const requestResolve = (
    revisionId: string,
    filePath: string,
    tool: 'ours' | 'theirs',
  ) => {
    const rev = layout?.nodes.find((n) => n.rev.changeId === revisionId)?.rev;
    const label = rev
      ? `${shortId(revisionId)} · ${filePath}`
      : filePath;
    setPending({
      kind: 'resolveConflict',
      revisionId,
      filePath,
      tool,
      label,
    });
  };
  const setGrowth = (growth: GrowthDirection) => persist({ ...prefs, growth });
  const setTheme = (theme: ThemeMode) => persist({ ...prefs, theme });
  const setLocale = (nextLocale: Locale) => {
    void persist({ ...prefs, locale: nextLocale });
  };
  const toggleDetail = () => {
    persist({ ...prefs, detailPanelOpen: !prefs.detailPanelOpen });
  };

  const setDetailWidthLive = useCallback((w: number) => {
    setPrefs((p) => ({ ...p, detailPanelWidth: w }));
  }, []);

  const commitDetailWidth = useCallback((w: number) => {
    setPrefs((p) => {
      const next = { ...p, detailPanelWidth: w };
      void savePrefs(next).catch((e) => console.warn('save prefs', e));
      return next;
    });
  }, []);

  const setDiffWidthLive = useCallback((w: number) => {
    setPrefs((p) => ({ ...p, diffPanelWidth: w }));
  }, []);

  const commitDiffWidth = useCallback((w: number) => {
    setPrefs((p) => {
      const next = { ...p, diffPanelWidth: w };
      void savePrefs(next).catch((e) => console.warn('save prefs', e));
      return next;
    });
  }, []);

  const setDiffViewMode = useCallback((mode: DiffViewMode) => {
    setPrefs((p) => {
      const next = { ...p, diffViewMode: mode };
      void savePrefs(next).catch((e) => console.warn('save prefs', e));
      return next;
    });
  }, []);

  return (
    <I18nProvider locale={locale}>
      <div className="app-shell">
        <Toolbar
          repoInput={repoInput}
          onRepoInput={setRepoInput}
          onOpen={() => void doOpen(repoInput)}
          onOpenCwd={() => void doRevealDir()}
          revsetInput={revsetInput}
          onRevsetInput={setRevsetInput}
          onApplyRevset={() => void applyRevset()}
          density={prefs.density}
          sort={prefs.sort}
          growth={prefs.growth}
          theme={prefs.theme ?? 'system'}
          locale={locale}
          onDensity={setDensity}
          onSort={(s) => void setSort(s)}
          onGrowth={setGrowth}
          onTheme={setTheme}
          onLocale={setLocale}
          onUndo={() => void runUndo()}
          onRedo={() => void runRedo()}
          onReload={() => void doReload()}
          disabled={busy}
        />
        <div className="main-row">
          <main className="graph-pane">
            {conflictNotice && (
              <ConflictBanner
                notice={conflictNotice}
                onSelect={(ids) => {
                  setSelected(ids);
                  if (!prefs.detailPanelOpen) {
                    void persist({ ...prefs, detailPanelOpen: true });
                  }
                }}
                onDismiss={() => setConflictNotice(null)}
              />
            )}
            <GraphCanvas
              layout={layout}
              density={prefs.density}
              growth={prefs.growth}
              selected={selected}
              onSelect={onSelect}
              onDoubleClick={(id) => void onDoubleClick(id)}
              onRequestConfirm={setPending}
              onOpenContextMenu={setContextMenu}
              onOpenPicker={canPickDirectory ? () => void doOpenPicked() : undefined}
            />
          </main>
          <DetailPanel
            open={prefs.detailPanelOpen}
            width={prefs.detailPanelWidth ?? 320}
            onToggle={toggleDetail}
            onWidthChange={setDetailWidthLive}
            onWidthCommit={commitDetailWidth}
            selectedIds={selected}
            layout={layout}
            repoPath={repoPath}
            selectedFile={selectedFile}
            onSelectedFileChange={setSelectedFile}
            refreshToken={detailRefresh}
            onResolveConflict={requestResolve}
          />
          <DiffPane
            open={prefs.detailPanelOpen}
            width={prefs.diffPanelWidth ?? 420}
            onWidthChange={setDiffWidthLive}
            onWidthCommit={commitDiffWidth}
            leftRail={{
              width: prefs.detailPanelWidth ?? 320,
              onChange: setDetailWidthLive,
              onCommit: commitDetailWidth,
            }}
            repoPath={repoPath}
            changeId={
              compareRange
                ? compareRange.to
                : selected.length
                  ? selected[selected.length - 1]
                  : null
            }
            filePath={selectedFile}
            compareRange={compareRange}
            viewMode={prefs.diffViewMode ?? 'unified'}
            onViewModeChange={setDiffViewMode}
          />
        </div>
        <footer className="status-bar">
          <span>{status}</span>
          {error && <span className="status-error">{error}</span>}
        </footer>
        {pending && (
          <ConfirmDialog
            pending={pending}
            onConfirm={() => void confirmPending()}
            onCancel={() => setPending(null)}
          />
        )}
        {prompt && (
          <PromptDialog
            pending={prompt}
            onSubmit={(v) => void submitPrompt(v)}
            onCancel={() => setPrompt(null)}
          />
        )}
        {contextMenu && layout && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            revisions={orderSelectedByGraph(
              layout.nodes,
              contextMenu.revisionIds,
            )
              .map((id) => layout.nodes.find((n) => n.rev.changeId === id)?.rev)
              .filter((r): r is NonNullable<typeof r> => !!r)}
            onAction={onContextAction}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    </I18nProvider>
  );
}
