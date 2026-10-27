/**
 * Vite-dev bridge: shells `jj` and mirrors Tauri commands over HTTP /api/*.
 * Layout algorithm ported from src-tauri/src/graph.rs.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PREFS_DIR = path.join(os.homedir(), '.config', 'jj-bond');
const PREFS_PATH = path.join(PREFS_DIR, 'prefs.json');

function defaultPrefs() {
  return {
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
}

function loadPrefs() {
  try {
    if (!fs.existsSync(PREFS_PATH)) return defaultPrefs();
    return { ...defaultPrefs(), ...JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8')) };
  } catch {
    return defaultPrefs();
  }
}

function savePrefs(prefs) {
  fs.mkdirSync(PREFS_DIR, { recursive: true });
  fs.writeFileSync(PREFS_PATH, JSON.stringify(prefs, null, 2));
}

function runJj(repo, args) {
  const r = spawnSync('jj', ['-R', repo, ...args], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    cwd: repo,
  });
  return r;
}

function parseRevLine(line) {
  const parts = line.split('\t');
  if (parts.length < 12) throw new Error(`bad log line (${parts.length} fields)`);
  let description = parts.slice(11).join('\t');
  try {
    description = JSON.parse(description);
  } catch {
    description = description.replace(/^"|"$/g, '');
  }
  const shortest = parts[1] || parts[0].slice(0, 1);
  const commitShortest = parts[3] || parts[2].slice(0, 1);
  return {
    changeId: parts[0],
    uniquePrefixLen: Math.max(1, [...shortest].length),
    commitId: parts[2],
    uniqueCommitPrefixLen: Math.max(1, [...commitShortest].length),
    isWorkingCopy: parts[4] === '1',
    immutable: parts[5] === '1',
    conflict: parts[6] === '1',
    parents: parts[7] ? parts[7].split(',') : [],
    bookmarks: parts[8] ? parts[8].split(',') : [],
    author: parts[9],
    committerTs: parts[10],
    description,
  };
}

function parseResolveListLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const tab = trimmed.indexOf('\t');
  if (tab >= 0) {
    return { path: trimmed.slice(0, tab).trim(), detail: trimmed.slice(tab + 1).trim() };
  }
  const sp = trimmed.search(/  +/);
  if (sp >= 0) {
    return { path: trimmed.slice(0, sp).trim(), detail: trimmed.slice(sp).trim() };
  }
  return { path: trimmed, detail: '' };
}

function listConflicts(repoPath, revision) {
  const r = runJj(repoPath, ['resolve', '--list', '-r', revision]);
  const stdout = r.stdout || '';
  const stderr = (r.stderr || '').trim();
  if (r.status !== 0 && !stdout.trim() && stderr) {
    throw new Error(`jj resolve --list failed: ${stderr}`);
  }
  return stdout.split('\n').map(parseResolveListLine).filter(Boolean);
}

function resolveConflict(repoPath, revision, filePath, tool) {
  const toolArg = tool === 'ours' ? ':ours' : tool === 'theirs' ? ':theirs' : null;
  if (!toolArg) throw new Error(`unknown resolve tool: ${tool} (use ours|theirs)`);
  if (!filePath || !String(filePath).trim()) throw new Error('file path required');
  const r = runJj(repoPath, [
    'resolve',
    '-r',
    revision,
    '--tool',
    toolArg,
    '--',
    filePath,
  ]);
  if (r.status !== 0) {
    throw new Error(`resolve failed: ${(r.stderr || '').trim()}`);
  }
  return `resolved ${filePath} with ${tool}`;
}

function stripGraphPrefix(line) {
  // ASCII-graph glyphs and padding are non-alphanumeric; template output
  // always starts with the change id. Pure-glyph rows (elision `⋮`/`~`)
  // carry no template output.
  const rest = line.replace(/^[^a-z0-9]+/i, '');
  return rest || null;
}

function normalizeRevset(revset) {
  if (revset == null) return 'all()';
  const t = String(revset).trim();
  return t ? t : 'all()';
}

// Single graph-mode run: row order equals the graph drawing order, which
// keeps first-parent stacks contiguous (`--no-graph` interleaves other heads).
function jjLog(repoPath, revset) {
  const rev = normalizeRevset(revset);
  const template =
    'change_id ++ "\\t" ++ ' +
    'change_id.shortest() ++ "\\t" ++ ' +
    'commit_id ++ "\\t" ++ ' +
    'commit_id.shortest() ++ "\\t" ++ ' +
    'if(current_working_copy, "1", "0") ++ "\\t" ++ ' +
    'if(immutable, "1", "0") ++ "\\t" ++ ' +
    'if(conflict, "1", "0") ++ "\\t" ++ ' +
    'parents.map(|c| c.change_id()).join(",") ++ "\\t" ++ ' +
    'bookmarks.map(|b| b.name()).join(",") ++ "\\t" ++ ' +
    'author.name() ++ "\\t" ++ ' +
    'committer.timestamp().format("%Y-%m-%dT%H:%M:%S") ++ "\\t" ++ ' +
    'description.first_line().escape_json() ++ "\\n"';
  const r = runJj(repoPath, ['log', '--ignore-working-copy', '-r', rev, '-T', template]);
  if (r.status !== 0) throw new Error((r.stderr || 'jj log failed').trim());
  const revs = [];
  const seen = new Set();
  for (const line of (r.stdout || '').split('\n')) {
    const fields = stripGraphPrefix(line);
    if (!fields) continue;
    const revLine = parseRevLine(fields);
    if (!seen.has(revLine.changeId)) {
      seen.add(revLine.changeId);
      revs.push(revLine);
    }
  }
  return revs;
}

function diffRangeArgs(changeId, from, to, extra) {
  const args = ['diff'];
  if (from && to) {
    args.push('--from', from, '--to', to);
  } else {
    args.push('-r', changeId);
  }
  args.push(...extra);
  return args;
}

function persistRevset(revset) {
  if (revset === undefined) return;
  const prefs = loadPrefs();
  const trimmed = revset == null ? '' : String(revset).trim();
  prefs.lastRevset = trimmed ? trimmed : null;
  savePrefs(prefs);
}

function parseTsKey(ts) {
  if (ts.length >= 19) {
    const digits = ts.replace(/\D/g, '');
    return Number(digits) || 0;
  }
  return 0;
}

function transitiveChildren(revs, root) {
  const idSet = new Set(revs.map((r) => r.changeId));
  const children = new Map();
  for (const r of revs) {
    for (const p of r.parents) {
      if (idSet.has(p)) {
        if (!children.has(p)) children.set(p, []);
        children.get(p).push(r.changeId);
      }
    }
  }
  const out = new Set();
  const stack = [...(children.get(root) || [])];
  while (stack.length) {
    const c = stack.pop();
    if (out.has(c)) continue;
    out.add(c);
    for (const x of children.get(c) || []) stack.push(x);
  }
  return out;
}

function prioritizeWorkingCopy(revs) {
  const wcPos = revs.findIndex((r) => r.isWorkingCopy);
  if (wcPos <= 0) return revs;
  const wcId = revs[wcPos].changeId;
  const descendants = transitiveChildren(revs, wcId);
  const out = [];
  for (let i = 0; i < wcPos; i++) {
    if (descendants.has(revs[i].changeId)) out.push(revs[i]);
  }
  out.push(revs[wcPos]);
  const emitted = new Set(out.map((r) => r.changeId));
  for (const r of revs) {
    if (!emitted.has(r.changeId)) out.push(r);
  }
  return out;
}

function sortRecentRewrite(revs) {
  const byId = new Map(revs.map((r) => [r.changeId, r]));
  const ids = revs.map((r) => r.changeId);
  const idSet = new Set(ids);
  const childCount = new Map();
  for (const id of ids) {
    for (const p of byId.get(id).parents) {
      if (idSet.has(p)) childCount.set(p, (childCount.get(p) || 0) + 1);
    }
  }
  const score = (r) => {
    let s = parseTsKey(r.committerTs);
    if (r.isWorkingCopy) s += 1_000_000_000_000;
    return s;
  };
  const order = [];
  const emitted = new Set();
  let ready = ids.filter((id) => (childCount.get(id) || 0) === 0);
  while (ready.length) {
    ready.sort((a, b) => {
      const d = score(byId.get(b)) - score(byId.get(a));
      return d !== 0 ? d : a.localeCompare(b);
    });
    const id = ready.shift();
    if (emitted.has(id)) continue;
    emitted.add(id);
    order.push(id);
    for (const p of byId.get(id).parents) {
      if (!idSet.has(p)) continue;
      const c = (childCount.get(p) || 0) - 1;
      childCount.set(p, Math.max(0, c));
      if (c === 0 && !emitted.has(p)) ready.push(p);
    }
  }
  for (const id of ids) if (!emitted.has(id)) order.push(id);
  return order.map((id) => byId.get(id));
}

function assignLanes(revs) {
  const idSet = new Set(revs.map((r) => r.changeId));
  const columns = [];
  const out = [];
  const stemCounts = [];
  for (let row = 0; row < revs.length; row++) {
    const rev = revs[row];
    const id = rev.changeId;
    let lane = columns.findIndex((c) => c === id);
    let padding = 0;
    if (lane >= 0) {
      padding = Math.max(0, columns.length - lane - 1);
    } else {
      lane = columns.findIndex((c) => c == null);
      if (lane >= 0) {
        padding = Math.max(0, columns.length - lane - 1);
      } else {
        columns.push(null);
        lane = columns.length - 1;
        padding = 0;
      }
    }
    while (columns.length <= lane) columns.push(null);
    for (let i = 0; i < columns.length; i++) {
      if (columns[i] === id) columns[i] = null;
    }
    const parentsInGraph = rev.parents.filter((p) => idSet.has(p));
    if (parentsInGraph.length) {
      columns[lane] = parentsInGraph[0];
      for (let i = 1; i < parentsInGraph.length; i++) {
        const free = columns.findIndex((c) => c == null);
        if (free >= 0) columns[free] = parentsInGraph[i];
        else columns.push(parentsInGraph[i]);
      }
    }
    while (columns.length && columns[columns.length - 1] == null) columns.pop();
    const stemCount = padding + lane + 1;
    stemCounts.push(stemCount);
    out.push({ rev, row, lane, padding });
  }
  return { nodes: out, stemCounts };
}

function buildLayout(revs, sort) {
  let ordered =
    sort === 'recentRewrite' ? sortRecentRewrite(revs) : prioritizeWorkingCopy(revs);
  const { nodes, stemCounts } = assignLanes(ordered);
  const wc = nodes.find((n) => n.rev.isWorkingCopy);
  if (wc && wc.lane !== 0) {
    const a = wc.lane;
    for (const n of nodes) {
      if (n.lane === a) n.lane = 0;
      else if (n.lane === 0) n.lane = a;
    }
  }
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].padding = Math.max(0, stemCounts[i] - nodes[i].lane - 1);
  }
  const laneCount = Math.max(0, ...nodes.map((n) => n.lane)) + 1 || 1;
  const index = new Map(nodes.map((n, i) => [n.rev.changeId, i]));
  const edges = [];
  for (const node of nodes) {
    for (const p of node.rev.parents) {
      if (!index.has(p)) continue;
      const parent = nodes[index.get(p)];
      edges.push({
        fromRow: node.row,
        toRow: parent.row,
        fromLane: node.lane,
        toLane: parent.lane,
        colorLane: node.lane,
      });
    }
  }
  return { nodes, edges, laneCount };
}

function openRepo(repoPath) {
  const r = runJj(repoPath, ['root']);
  if (r.status !== 0) throw new Error((r.stderr || 'not a jj repo').trim());
  return path.resolve(repoPath);
}

function parseDiffStat(stdout) {
  let insertions = 0;
  let deletions = 0;
  const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    if (!(line.includes('insertion') || line.includes('deletion') || line.includes('changed'))) {
      continue;
    }
    const ins = line.match(/(\d+)\s+insertion/);
    const del = line.match(/(\d+)\s+deletion/);
    if (ins) insertions = Number(ins[1]);
    if (del) deletions = Number(del[1]);
    if (line.includes('changed') || insertions || deletions) {
      return { insertions, deletions };
    }
  }
  return { insertions: 0, deletions: 0 };
}

function renameNewPath(raw) {
  const m = String(raw).trim().match(/^\{(.+?)\s*=>\s*(.+)\}$/);
  return m ? m[2].trim() : String(raw).trim();
}

function parseDiffSummary(stdout) {
  const out = [];
  for (const line of (stdout || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^([A-Za-z])\s+(.+)$/);
    if (!m) continue;
    out.push({ status: m[1].toUpperCase(), path: renameNewPath(m[2]) });
  }
  return out;
}

function countPlusMinus(rest) {
  let insertions = 0;
  let deletions = 0;
  for (const c of rest) {
    if (c === '+') insertions += 1;
    else if (c === '-') deletions += 1;
  }
  return { insertions, deletions };
}

function parseDiffStatFiles(stdout) {
  const out = [];
  for (const line of (stdout || '').split('\n')) {
    if (!line.trim()) continue;
    const trimmed = line.trim();
    if (
      trimmed.includes('file changed') ||
      trimmed.includes('files changed') ||
      trimmed.includes('insertion') ||
      trimmed.includes('deletion')
    ) {
      continue;
    }
    const idx = line.lastIndexOf('|');
    if (idx < 0) continue;
    const path = renameNewPath(line.slice(0, idx).trim());
    if (!path) continue;
    const rest = line.slice(idx + 1).trim();
    if (/binary/i.test(rest)) {
      out.push({ path, insertions: 0, deletions: 0 });
      continue;
    }
    const { insertions, deletions } = countPlusMinus(rest);
    out.push({ path, insertions, deletions });
  }
  return out;
}

function mergeDiffFiles(summary, stats) {
  const byPath = new Map(stats.map((s) => [s.path, s]));
  const files = [];
  for (const s of summary) {
    const st = byPath.get(s.path);
    byPath.delete(s.path);
    files.push({
      path: s.path,
      status: s.status,
      insertions: st?.insertions ?? 0,
      deletions: st?.deletions ?? 0,
    });
  }
  for (const st of byPath.values()) {
    files.push({
      path: st.path,
      status: 'M',
      insertions: st.insertions,
      deletions: st.deletions,
    });
  }
  return files;
}

function resultMessage(op, r) {
  const stderr = (r.stderr || '').trim();
  const stdout = (r.stdout || '').trim();
  if (r.status !== 0) throw new Error(`${op} failed: ${stderr}`);
  return stderr || stdout || `${op} ok`;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req.iterator({ destroyOnReturn: false })) {
    size += c.length;
    if (size > 1024 * 1024) {
      req.resume();
      throw Object.assign(new Error('Request body exceeds 1 MiB'), { status: 413 });
    }
    chunks.push(c);
  }
  if (!chunks.length) return null;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

// The bridge can mutate repositories: accept only local same-origin requests.
// CLI clients may omit Origin; browser clients must use the exact serving origin.
function checkBridgeAccess(req) {
  const peer = req.socket.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer)) return 403;
  let host;
  try {
    host = new URL(`http://${req.headers.host}`);
  } catch {
    return 403;
  }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host.hostname)
      || host.username || host.password || host.pathname !== '/') return 403;
  if (req.headers.origin && req.headers.origin !== host.origin) return 403;
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return 403;
  if (req.method === 'GET' && req.url?.split('?')[0] === '/api/prefs') return null;
  if (req.method !== 'POST') return 405;
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') return 415;
  return null;
}

export function jjBridgeMiddleware() {
  return async (req, res, next) => {
    if (!req.url?.startsWith('/api/')) return next();
    const denied = checkBridgeAccess(req);
    if (denied) {
      req.resume();
      return sendJson(res, denied, { error: 'Bridge request rejected' });
    }
    const url = new URL(req.url, 'http://localhost');
    const route = url.pathname.replace(/^\/api/, '');
    try {
      if (route === '/prefs' && req.method === 'GET') {
        return sendJson(res, 200, loadPrefs());
      }
      if (route === '/prefs' && req.method === 'POST') {
        const body = await readBody(req);
        savePrefs({ ...defaultPrefs(), ...body });
        return sendJson(res, 200, { ok: true });
      }
      const body = req.method === 'POST' ? await readBody(req) : null;
      if (route === '/reveal') {
        const target = body?.path;
        if (!target) return sendJson(res, 400, { error: 'path required' });
        const { spawn } = await import('node:child_process');
        const fs = await import('node:fs');
        if (!fs.existsSync(target)) return sendJson(res, 400, { error: `路径不存在: ${target}` });
        let dir = target;
        try {
          if (fs.statSync(target).isFile()) dir = path.dirname(target);
        } catch {}
        const plat = process.platform;
        const cmd = plat === 'darwin' ? 'open' : plat === 'win32' ? 'explorer' : 'xdg-open';
        spawn(cmd, [dir], { detached: true, stdio: 'ignore' }).unref();
        return sendJson(res, 200, { ok: true });
      }
      if (route === '/open') {
        const resolved = openRepo(body.path);
        const revset = body.revset;
        const layout = buildLayout(jjLog(resolved, revset), body.sort || 'workingCopyFirst');
        const prefs = loadPrefs();
        prefs.lastRepo = resolved;
        if (revset !== undefined) {
          const trimmed = revset == null ? '' : String(revset).trim();
          prefs.lastRevset = trimmed ? trimmed : null;
        }
        savePrefs(prefs);
        return sendJson(res, 200, { path: resolved, layout });
      }
      if (route === '/log') {
        const resolved = openRepo(body.path);
        persistRevset(body.revset);
        return sendJson(
          res,
          200,
          buildLayout(jjLog(resolved, body.revset), body.sort || 'workingCopyFirst'),
        );
      }
      if (route === '/diff-stat') {
        const args = diffRangeArgs(body.changeId, body.from, body.to, [
          '--stat',
          '--ignore-working-copy',
        ]);
        const r = runJj(body.path, args);
        return sendJson(res, 200, parseDiffStat(r.stdout || ''));
      }
      if (route === '/diff-files') {
        if (!body?.path || !body?.changeId) {
          return sendJson(res, 400, { error: 'path and changeId required' });
        }
        const summaryR = runJj(
          body.path,
          diffRangeArgs(body.changeId, body.from, body.to, [
            '--summary',
            '--ignore-working-copy',
          ]),
        );
        const statR = runJj(
          body.path,
          diffRangeArgs(body.changeId, body.from, body.to, [
            '--stat',
            '--ignore-working-copy',
          ]),
        );
        if (statR.status !== 0) {
          throw new Error(`jj diff --stat failed: ${(statR.stderr || '').trim()}`);
        }
        const summary = parseDiffSummary(summaryR.stdout || '');
        const stats = parseDiffStatFiles(statR.stdout || '');
        return sendJson(res, 200, { files: mergeDiffFiles(summary, stats), stat: parseDiffStat(statR.stdout || '') });
      }
      if (route === '/diff-file') {
        if (!body?.path || !body?.changeId || !body?.filePath) {
          return sendJson(res, 400, { error: 'path, changeId, and filePath required' });
        }
        const args = diffRangeArgs(body.changeId, body.from, body.to, [
          '--git',
          '--ignore-working-copy',
          '--',
          body.filePath,
        ]);
        const r = runJj(body.path, args);
        if (r.status !== 0 && !(r.stdout || '').trim()) {
          return sendJson(res, 400, {
            error: (r.stderr || 'jj diff failed').trim(),
          });
        }
        return sendJson(res, 200, { text: r.stdout || '' });
      }
      if (route === '/conflicts') {
        const revision = body.revision || body.changeId;
        if (!body.path || !revision) return sendJson(res, 400, { error: 'path and revision required' });
        return sendJson(res, 200, listConflicts(body.path, revision));
      }
      if (route === '/resolve-conflict') {
        if (!body?.path || !body?.revision || !body?.filePath || !body?.tool) {
          return sendJson(res, 400, {
            error: 'path, revision, filePath, and tool required',
          });
        }
        const message = resolveConflict(
          body.path,
          body.revision,
          body.filePath,
          body.tool,
        );
        return sendJson(res, 200, { message });
      }
      if (route === '/edit') {
        const r = runJj(body.path, ['edit', '-r', body.changeId]);
        return sendJson(res, 200, { message: resultMessage('edit', r) });
      }
      if (route === '/new') {
        const r = runJj(body.path, ['new', '-r', body.changeId]);
        return sendJson(res, 200, { message: resultMessage('new', r) });
      }
      if (route === '/rebase') {
        const revisions = Array.isArray(body.revisions)
          ? body.revisions
          : body.source
            ? [body.source]
            : [];
        if (!revisions.length) return sendJson(res, 400, { error: 'revisions required' });
        const revset = revisions.join('|');
        const r = runJj(body.path, ['rebase', '-r', revset, '-d', body.destination]);
        return sendJson(res, 200, { message: resultMessage('rebase', r) });
      }
      if (route === '/undo') {
        const r = runJj(body.path, ['undo']);
        return sendJson(res, 200, { message: resultMessage('undo', r) });
      }
      if (route === '/redo') {
        const r = runJj(body.path, ['redo']);
        return sendJson(res, 200, { message: resultMessage('redo', r) });
      }
      if (route === '/new-revisions') {
        const revisions = Array.isArray(body.revisions) ? body.revisions : [];
        if (!revisions.length) return sendJson(res, 400, { error: 'revisions required' });
        const mode = body.mode || 'child';
        const args = ['new', '--no-edit'];
        if (mode === 'insertBefore') {
          args.push('--insert-before', revisions[0]);
        } else if (mode === 'child') {
          args.push(...revisions);
        } else {
          return sendJson(res, 400, { error: `unknown new mode: ${mode}` });
        }
        const r = runJj(body.path, args);
        return sendJson(res, 200, { message: resultMessage('new', r) });
      }
      if (route === '/abandon') {
        const revisions = Array.isArray(body.revisions) ? body.revisions : [];
        if (!revisions.length) return sendJson(res, 400, { error: 'revisions required' });
        const r = runJj(body.path, ['abandon', ...revisions]);
        return sendJson(res, 200, { message: resultMessage('abandon', r) });
      }
      if (route === '/squash') {
        const revisions = Array.isArray(body.revisions) ? body.revisions : [];
        if (!revisions.length) return sendJson(res, 400, { error: 'revisions required' });
        const args = ['squash'];
        if (body.into) {
          for (const r of revisions) {
            args.push('--from', r);
          }
          args.push('--into', body.into);
        } else {
          if (revisions.length !== 1) {
            return sendJson(res, 400, { error: 'multi-revision squash requires into' });
          }
          args.push('-r', revisions[0]);
        }
        const r = runJj(body.path, args);
        return sendJson(res, 200, { message: resultMessage('squash', r) });
      }
      if (route === '/restore-from-parent') {
        const revisions = Array.isArray(body.revisions) ? body.revisions : [];
        if (!revisions.length || !body.parent) {
          return sendJson(res, 400, { error: 'revisions and parent required' });
        }
        const into = revisions.join('|');
        const r = runJj(body.path, ['restore', '--from', body.parent, '--into', into]);
        return sendJson(res, 200, { message: resultMessage('restore', r) });
      }
      if (route === '/duplicate') {
        const revisions = Array.isArray(body.revisions) ? body.revisions : [];
        if (!revisions.length) return sendJson(res, 400, { error: 'revisions required' });
        const r = runJj(body.path, ['duplicate', ...revisions]);
        return sendJson(res, 200, { message: resultMessage('duplicate', r) });
      }
      if (route === '/revert-onto-wc') {
        const revisions = Array.isArray(body.revisions) ? body.revisions : [];
        if (!revisions.length) return sendJson(res, 400, { error: 'revisions required' });
        const args = ['revert'];
        for (const rev of revisions) {
          args.push('-r', rev);
        }
        args.push('--onto', '@');
        const r = runJj(body.path, args);
        return sendJson(res, 200, { message: resultMessage('revert', r) });
      }
      if (route === '/bookmark-create') {
        if (!body.name || !body.revision) {
          return sendJson(res, 400, { error: 'name and revision required' });
        }
        const r = runJj(body.path, ['bookmark', 'create', body.name, '-r', body.revision]);
        return sendJson(res, 200, { message: resultMessage('bookmark create', r) });
      }
      if (route === '/bookmark-move') {
        if (!body.name || !body.revision) {
          return sendJson(res, 400, { error: 'name and revision required' });
        }
        const r = runJj(body.path, ['bookmark', 'move', body.name, '-t', body.revision, '--allow-backwards']);
        return sendJson(res, 200, { message: resultMessage('bookmark move', r) });
      }
      if (route === '/bookmark-rename') {
        if (!body.old || !body.new) {
          return sendJson(res, 400, { error: 'old and new required' });
        }
        const r = runJj(body.path, ['bookmark', 'rename', body.old, body.new]);
        return sendJson(res, 200, { message: resultMessage('bookmark rename', r) });
      }
      if (route === '/bookmark-delete') {
        if (!body.name) {
          return sendJson(res, 400, { error: 'name required' });
        }
        const r = runJj(body.path, ['bookmark', 'delete', body.name]);
        return sendJson(res, 200, { message: resultMessage('bookmark delete', r) });
      }
      if (route === '/describe') {
        if (!body.revision || body.message === undefined) {
          return sendJson(res, 400, { error: 'revision and message required' });
        }
        const r = runJj(body.path, ['describe', '-r', body.revision, '-m', body.message]);
        return sendJson(res, 200, { message: resultMessage('describe', r) });
      }
      return sendJson(res, 404, { error: 'not found' });
    } catch (e) {
      return sendJson(res, e?.status === 413 ? 413 : 500, { error: String(e?.message || e) });
    }
  };
}
