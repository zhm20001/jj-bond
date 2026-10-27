import type {
  ConflictEntry,
  DiffFilesResult,
  GraphLayout,
  OpenResult,
  Prefs,
  SortMode,
} from './types';

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

async function bridgeFetch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || res.statusText);
  }
  return data as T;
}

export async function loadPrefs(): Promise<Prefs> {
  if (isTauri()) return invokeTauri('load_prefs');
  return bridgeFetch('/prefs');
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  if (isTauri()) {
    await invokeTauri('save_prefs', { prefs });
    return;
  }
  await bridgeFetch('/prefs', prefs);
}

export async function openRepo(
  path: string,
  sort: SortMode,
  revset?: string | null,
): Promise<OpenResult> {
  const payload = { path, sort, revset: revset ?? null };
  if (isTauri()) return invokeTauri('open_repo', payload);
  return bridgeFetch('/open', payload);
}

export async function reloadLog(
  path: string,
  sort: SortMode,
  revset?: string | null,
): Promise<GraphLayout> {
  const req = { path, sort, revset: revset ?? null };
  if (isTauri()) return invokeTauri('reload_log', { req });
  return bridgeFetch('/log', req);
}

export async function getDiffFiles(
  path: string,
  changeId: string,
  range?: { from: string; to: string } | null,
): Promise<DiffFilesResult> {
  const payload = {
    path,
    changeId,
    from: range?.from,
    to: range?.to,
  };
  if (isTauri()) return invokeTauri('diff_files', payload);
  return bridgeFetch('/diff-files', payload);
}

export async function getDiffFile(
  path: string,
  changeId: string,
  filePath: string,
  range?: { from: string; to: string } | null,
): Promise<string> {
  const payload = {
    path,
    changeId,
    filePath,
    from: range?.from,
    to: range?.to,
  };
  if (isTauri()) {
    const res = await invokeTauri<{ text: string }>('diff_file', payload);
    return res.text;
  }
  const res = await bridgeFetch<{ text: string }>('/diff-file', payload);
  return res.text;
}

export async function listConflicts(
  path: string,
  revision: string,
): Promise<ConflictEntry[]> {
  if (isTauri()) return invokeTauri('list_conflicts', { path, revision });
  return bridgeFetch('/conflicts', { path, revision });
}

export async function resolveConflict(
  path: string,
  revision: string,
  filePath: string,
  tool: 'ours' | 'theirs',
): Promise<string> {
  const payload = { path, revision, filePath, tool };
  if (isTauri()) return invokeTauri('resolve_conflict', payload);
  return (await bridgeFetch<{ message: string }>('/resolve-conflict', payload))
    .message;
}

export async function jjEdit(path: string, changeId: string): Promise<string> {
  if (isTauri()) return invokeTauri('jj_edit', { path, changeId });
  return (await bridgeFetch<{ message: string }>('/edit', { path, changeId })).message;
}

export async function jjNew(path: string, changeId: string): Promise<string> {
  if (isTauri()) return invokeTauri('jj_new', { path, changeId });
  return (await bridgeFetch<{ message: string }>('/new', { path, changeId })).message;
}

export async function jjRebase(
  path: string,
  revisions: string[],
  destination: string,
): Promise<string> {
  if (isTauri()) {
    return invokeTauri('jj_rebase', { path, revisions, destination });
  }
  return (
    await bridgeFetch<{ message: string }>('/rebase', {
      path,
      revisions,
      destination,
    })
  ).message;
}

export async function jjUndo(path: string): Promise<string> {
  if (isTauri()) return invokeTauri('jj_undo', { path });
  return (await bridgeFetch<{ message: string }>('/undo', { path })).message;
}

export async function jjRedo(path: string): Promise<string> {
  if (isTauri()) return invokeTauri('jj_redo', { path });
  return (await bridgeFetch<{ message: string }>('/redo', { path })).message;
}

export type NewRevisionMode = 'child' | 'insertBefore';

export async function jjNewRevisions(
  path: string,
  revisions: string[],
  mode: NewRevisionMode,
): Promise<string> {
  if (isTauri()) {
    return invokeTauri('jj_new_revisions', { path, revisions, mode });
  }
  return (
    await bridgeFetch<{ message: string }>('/new-revisions', {
      path,
      revisions,
      mode,
    })
  ).message;
}

export async function jjAbandon(path: string, revisions: string[]): Promise<string> {
  if (isTauri()) return invokeTauri('jj_abandon', { path, revisions });
  return (
    await bridgeFetch<{ message: string }>('/abandon', { path, revisions })
  ).message;
}

export async function jjSquash(
  path: string,
  revisions: string[],
  into?: string | null,
): Promise<string> {
  if (isTauri()) {
    return invokeTauri('jj_squash', {
      path,
      revisions,
      into: into ?? null,
    });
  }
  return (
    await bridgeFetch<{ message: string }>('/squash', {
      path,
      revisions,
      into: into ?? undefined,
    })
  ).message;
}

export async function jjRestoreFromParent(
  path: string,
  revisions: string[],
  parent: string,
): Promise<string> {
  if (isTauri()) {
    return invokeTauri('jj_restore_from_parent', { path, revisions, parent });
  }
  return (
    await bridgeFetch<{ message: string }>('/restore-from-parent', {
      path,
      revisions,
      parent,
    })
  ).message;
}

export async function jjDuplicate(path: string, revisions: string[]): Promise<string> {
  if (isTauri()) return invokeTauri('jj_duplicate', { path, revisions });
  return (
    await bridgeFetch<{ message: string }>('/duplicate', { path, revisions })
  ).message;
}

export async function jjRevertOntoWc(
  path: string,
  revisions: string[],
): Promise<string> {
  if (isTauri()) return invokeTauri('jj_revert_onto_wc', { path, revisions });
  return (
    await bridgeFetch<{ message: string }>('/revert-onto-wc', {
      path,
      revisions,
    })
  ).message;
}

export async function jjBookmarkCreate(
  path: string,
  name: string,
  revision: string,
): Promise<string> {
  if (isTauri()) {
    return invokeTauri('jj_bookmark_create', { path, name, revision });
  }
  return (
    await bridgeFetch<{ message: string }>('/bookmark-create', {
      path,
      name,
      revision,
    })
  ).message;
}

export async function jjBookmarkMove(
  path: string,
  name: string,
  revision: string,
): Promise<string> {
  if (isTauri()) {
    return invokeTauri('jj_bookmark_move', { path, name, revision });
  }
  return (
    await bridgeFetch<{ message: string }>('/bookmark-move', {
      path,
      name,
      revision,
    })
  ).message;
}

export async function jjBookmarkRename(
  path: string,
  oldName: string,
  newName: string,
): Promise<string> {
  if (isTauri()) {
    return invokeTauri('jj_bookmark_rename', {
      path,
      old: oldName,
      new: newName,
    });
  }
  return (
    await bridgeFetch<{ message: string }>('/bookmark-rename', {
      path,
      old: oldName,
      new: newName,
    })
  ).message;
}

export async function jjBookmarkDelete(
  path: string,
  name: string,
): Promise<string> {
  if (isTauri()) {
    return invokeTauri('jj_bookmark_delete', { path, name });
  }
  return (
    await bridgeFetch<{ message: string }>('/bookmark-delete', {
      path,
      name,
    })
  ).message;
}

export async function jjDescribe(
  path: string,
  revision: string,
  message: string,
): Promise<string> {
  if (isTauri()) {
    return invokeTauri('jj_describe', { path, revision, message });
  }
  return (
    await bridgeFetch<{ message: string }>('/describe', {
      path,
      revision,
      message,
    })
  ).message;
}

export async function initialRepoHint(): Promise<string | null> {
  if (isTauri()) return invokeTauri('initial_repo_hint');
  const q = new URLSearchParams(window.location.search).get('repo');
  if (q) return q;
  try {
    const prefs = await loadPrefs();
    return prefs.lastRepo;
  } catch {
    return null;
  }
}


/** Open a folder in Finder / Explorer / the desktop file manager. */
export async function revealInFileManager(path: string): Promise<void> {
  if (isTauri()) {
    await invokeTauri('reveal_in_file_manager', { path });
    return;
  }
  await bridgeFetch('/reveal', { path });
}

/** Native directory picker is only available in the desktop (Tauri) build. */
export function supportsDirectoryPicker(): boolean {
  return isTauri();
}

/**
 * Open the OS directory-picker dialog and return the chosen path,
 * or null when the user cancels (or the backend cannot show a dialog).
 */
export async function pickRepoDirectory(): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const picked = await open({ directory: true, multiple: false });
  // multiple:false → string path; guard against unexpected shapes anyway.
  if (typeof picked === 'string' && picked.trim()) return picked;
  return null;
}
