import type { Locale } from './types';
import { formatTs, parseCommitterTs, shortId } from './types';

export type { Locale };

/** All user-visible UI message keys. */
export type MsgKey =
  // Settings
  | 'settings.badge'
  | 'settings.title'
  | 'settings.detail'
  | 'settings.language'
  | 'settings.theme'
  | 'settings.theme.system'
  | 'settings.theme.light'
  | 'settings.theme.dark'
  | 'settings.density'
  | 'settings.density.compact'
  | 'settings.density.rich'
  | 'settings.sort'
  | 'settings.sort.wcFirst'
  | 'settings.sort.recent'
  | 'settings.growth'
  | 'settings.growth.bottomUp'
  | 'settings.growth.topDown'
  | 'settings.done'
  | 'settings.hint'
  // Toolbar
  | 'toolbar.repoPlaceholder'
  | 'toolbar.repoTitle'
  | 'toolbar.open'
  | 'toolbar.reveal'
  | 'toolbar.refresh'
  | 'toolbar.refreshTitle'
  | 'toolbar.undo'
  | 'toolbar.undoTitle'
  | 'toolbar.redo'
  | 'toolbar.redoTitle'
  | 'toolbar.settings'
  // Confirm
  | 'confirm.badge'
  | 'confirm.rebase'
  | 'confirm.rebaseN'
  | 'confirm.atTransfer'
  | 'confirm.rebaseDetail'
  | 'confirm.rebaseDetailMulti'
  | 'confirm.atImmutable'
  | 'confirm.atMutable'
  | 'confirm.actionRebase'
  | 'confirm.actionAt'
  | 'confirm.source'
  | 'confirm.target'
  | 'confirm.cancel'
  | 'confirm.hint'
  // Detail
  | 'detail.title'
  | 'detail.expand'
  | 'detail.collapse'
  | 'detail.resize'
  | 'detail.empty'
  | 'detail.multiMore'
  | 'detail.noDescription'
  | 'detail.author'
  | 'detail.date'
  | 'detail.change'
  | 'detail.parents'
  | 'detail.bookmarks'
  | 'detail.diff'
  | 'detail.wc'
  | 'detail.immutable'
  | 'detail.conflicts'
  | 'detail.conflictHint'
  | 'detail.conflictBadge'
  | 'detail.files'
  | 'detail.noFiles'
  | 'detail.fileConflict'
  | 'diff.title'
  | 'diff.empty'
  | 'diff.noSelection'
  | 'diff.loading'
  | 'diff.error'
  | 'diff.binaryOrEmpty'
  | 'diff.resize'
  | 'diff.mode'
  | 'diff.modeUnified'
  | 'diff.modeSideBySide'
  // Graph
  | 'graph.empty'
  | 'graph.emptyHint'
  | 'graph.openRepoPicker'
  | 'graph.dragAt'
  | 'graph.noDescription'
  | 'graph.hint'
  | 'graph.multiSource'
  | 'graph.conflictMark'
  // Conflict banner
  | 'conflict.bannerTitle'
  | 'conflict.bannerCommits'
  | 'conflict.bannerPaths'
  | 'conflict.select'
  | 'conflict.dismiss'
  // App status
  | 'status.ready'
  | 'status.enterPath'
  | 'status.loaded'
  | 'status.openFailed'
  | 'status.refreshed'
  | 'status.revealNeedPath'
  | 'status.revealed'
  | 'status.revealFailed'
  | 'status.rebaseOk'
  | 'status.rebaseOkConflicts'
  // Context menu
  | 'ctx.title'
  | 'ctx.titleN'
  | 'ctx.newChild'
  | 'ctx.newChildN'
  | 'ctx.newInsertBefore'
  | 'ctx.edit'
  | 'ctx.revert'
  | 'ctx.revertN'
  | 'ctx.duplicate'
  | 'ctx.duplicateN'
  | 'ctx.abandon'
  | 'ctx.abandonN'
  | 'ctx.squash'
  | 'ctx.restore'
  | 'ctx.bookmark'
  | 'ctx.describe'
  // Confirm abandon / prompt
  | 'confirm.badgeDanger'
  | 'confirm.abandon'
  | 'confirm.abandonN'
  | 'confirm.abandonDetail'
  | 'confirm.actionAbandon'
  | 'prompt.badge'
  | 'prompt.bookmarkTitle'
  | 'prompt.describeTitle'
  | 'prompt.bookmarkLabel'
  | 'prompt.describeLabel'
  | 'prompt.bookmarkPlaceholder'
  | 'prompt.describePlaceholder'
  | 'prompt.bookmarkOk'
  | 'prompt.describeOk'
  | 'prompt.hint'
  | 'prompt.bookmarkMoveTitle'
  | 'prompt.bookmarkMoveLabel'
  | 'prompt.bookmarkMovePlaceholder'
  | 'prompt.bookmarkMoveOk'
  | 'prompt.bookmarkRenameTitle'
  | 'prompt.bookmarkRenameLabel'
  | 'prompt.bookmarkRenamePlaceholder'
  | 'prompt.bookmarkRenameOk'
  | 'prompt.bookmarkPickTitle'
  | 'prompt.bookmarkPickLabel'
  | 'prompt.bookmarkPickPlaceholder'
  | 'prompt.bookmarkPickOk'
  // Resolve conflict
  | 'resolve.ours'
  | 'resolve.theirs'
  | 'confirm.resolveTitle'
  | 'confirm.resolveDetailOurs'
  | 'confirm.resolveDetailTheirs'
  | 'confirm.actionResolve'
  | 'status.resolveOk'
  | 'status.resolveFailed'
  // Revset
  | 'toolbar.revsetLabel'
  | 'toolbar.revsetPlaceholder'
  | 'toolbar.revsetApply'
  | 'toolbar.revsetTitle'
  | 'status.revsetApplied'
  | 'status.revsetInvalid'
  // Bookmark advanced
  | 'ctx.bookmarkMove'
  | 'ctx.bookmarkRename'
  | 'ctx.bookmarkDelete'
  | 'confirm.bookmarkDelete'
  | 'confirm.bookmarkDeleteDetail'
  | 'confirm.actionBookmarkDelete'
  // Compare two
  | 'detail.compareHint'
  | 'diff.compareTitle'
  // Shared
  | 'common.noDescription';

type Dict = Record<MsgKey, string>;

const zh: Dict = {
  'settings.badge': '外观与图谱',
  'settings.title': '设置',
  'settings.detail': '主题与图谱选项会写入本机偏好。',
  'settings.language': '语言',
  'settings.theme': '主题',
  'settings.theme.system': '跟随系统',
  'settings.theme.light': '明',
  'settings.theme.dark': '暗',
  'settings.density': '密度',
  'settings.density.compact': '紧凑 · 一行摘要',
  'settings.density.rich': '详细 · 含作者与时间',
  'settings.sort': '排序',
  'settings.sort.wcFirst': 'WC 优先 · @ 所在线靠前',
  'settings.sort.recent': '最近改写 · 按提交时间浮顶',
  'settings.growth': '生长',
  'settings.growth.bottomUp': '自下而上 · 像 GG / JayJay',
  'settings.growth.topDown': '自上而下',
  'settings.done': '完成',
  'settings.hint': 'Esc 或点击遮罩关闭',

  'toolbar.repoPlaceholder': '仓库路径…',
  'toolbar.repoTitle': 'jj 仓库本地路径',
  'toolbar.open': '打开仓库',
  'toolbar.reveal': '在文件管理器中打开当前目录',
  'toolbar.refresh': '刷新',
  'toolbar.refreshTitle': '刷新（F5 / ⌘R）',
  'toolbar.undo': '撤销',
  'toolbar.undoTitle': '撤销（⌘Z）',
  'toolbar.redo': '重做',
  'toolbar.redoTitle': '重做（⌘⇧Z）',
  'toolbar.settings': '设置',

  'confirm.badge': '拖放预览 · 尚未修改仓库',
  'confirm.rebase': '确认变基？',
  'confirm.rebaseN': '确认变基 {n} 个提交？',
  'confirm.atTransfer': '确认切换工作副本？',
  'confirm.rebaseDetail':
    '将用 jj rebase -r 剪枝变基：只移动该提交，其后代不会跟着整棵搬走（会接到原父节点一侧）。',
  'confirm.rebaseDetailMulti':
    '将用 jj rebase -r 剪枝变基：只移动选中的这一串，选区外的后代会留在原处并接到新父节点上；选区内部父子关系保持不变。',
  'confirm.atImmutable':
    '目标为不可变提交：将对其创建新的子提交并切换工作副本（jj new）。',
  'confirm.atMutable': '将工作副本切换到目标提交（jj edit）。',
  'confirm.actionRebase': '确认变基',
  'confirm.actionAt': '确认切换',
  'confirm.source': '源',
  'confirm.target': '目标',
  'confirm.cancel': '取消',
  'confirm.hint': 'Esc 取消 · 确认后才会调用 jj',

  'detail.title': '详情',
  'detail.expand': '展开详情栏',
  'detail.collapse': '向右收起',
  'detail.resize': '拖动调整宽度',
  'detail.empty': '选择一个提交查看详情',
  'detail.multiMore': '另有 {n} 个已选',
  'detail.noDescription': '(无描述)',
  'detail.author': '作者',
  'detail.date': '日期',
  'detail.change': '变更',
  'detail.parents': '父节点',
  'detail.bookmarks': '书签',
  'detail.diff': '更改',
  'detail.wc': '工作副本 @',
  'detail.immutable': '不可变',
  'detail.conflicts': '冲突',
  'detail.conflictHint':
    '双击或 jj new 创建子提交，编辑冲突标记或用 jj resolve 解决，再 squash 回本变更。',
  'detail.conflictBadge': '冲突',
  'detail.files': '文件',
  'detail.noFiles': '此提交无文件变更',
  'detail.fileConflict': '冲突',
  'diff.title': '差异',
  'diff.empty': '选择文件查看 unified diff',
  'diff.noSelection': '选择一个提交以查看差异',
  'diff.loading': '加载中…',
  'diff.error': '加载差异失败',
  'diff.binaryOrEmpty': '（二进制或空差异）',
  'diff.resize': '拖动调整差异栏宽度',
  'diff.mode': '差异视图',
  'diff.modeUnified': '统一',
  'diff.modeSideBySide': '并排',

  'graph.empty': '打开一个 jj 仓库以查看修订图谱',
  'graph.emptyHint': '例如 {path}',
  'graph.openRepoPicker': '打开仓库…',
  'graph.dragAt': '拖动 @ 切换工作副本',
  'graph.noDescription': '(无描述)',
  'graph.hint':
    '单击选择 · ⌘/Ctrl 多选 · 右键菜单 · 双击 edit/new · 拖动变基（弯箭头预览 + 确认）· 拖 @ 切换工作副本',
  'graph.multiSource': '（{n} 个）',
  'graph.conflictMark': '冲突',

  'conflict.bannerTitle': '变基产生了冲突',
  'conflict.bannerCommits': '{n} 个冲突提交',
  'conflict.bannerPaths': '冲突文件',
  'conflict.select': '选中冲突提交',
  'conflict.dismiss': '关闭',

  'status.ready': '准备就绪',
  'status.enterPath': '请输入仓库路径',
  'status.loaded': '已加载 {n} 个修订 · {path}',
  'status.openFailed': '打开失败',
  'status.refreshed': '已刷新 · {n} 个修订',
  'status.revealNeedPath': '请先打开仓库，或在路径框填入目录',
  'status.revealed': '已在文件管理器中打开 · {path}',
  'status.revealFailed': '打开文件管理器失败',
  'status.rebaseOk': '变基成功',
  'status.rebaseOkConflicts': '变基成功 · {n} 个提交产生冲突',

  'ctx.title': '修订',
  'ctx.titleN': '修订（{n}）',
  'ctx.newChild': '新建子提交',
  'ctx.newChildN': '新建子提交（合并父节点）',
  'ctx.newInsertBefore': '在选区前插入父提交',
  'ctx.edit': '编辑为工作副本',
  'ctx.revert': '还原到工作副本',
  'ctx.revertN': '还原到工作副本',
  'ctx.duplicate': '复制',
  'ctx.duplicateN': '复制',
  'ctx.abandon': '丢弃…',
  'ctx.abandonN': '丢弃…',
  'ctx.squash': '挤压到父提交',
  'ctx.restore': '从父提交还原',
  'ctx.bookmark': '创建书签…',
  'ctx.describe': '描述…',

  'confirm.badgeDanger': '危险操作 · 可撤销',
  'confirm.abandon': '确认丢弃？',
  'confirm.abandonN': '确认丢弃 {n} 个提交？',
  'confirm.abandonDetail':
    '将用 jj abandon 丢弃选中的提交；后代会接到其父节点上。可用撤销恢复。',
  'confirm.actionAbandon': '确认丢弃',

  'prompt.badge': '输入后才会调用 jj',
  'prompt.bookmarkTitle': '创建书签',
  'prompt.describeTitle': '编辑描述',
  'prompt.bookmarkLabel': '书签名称',
  'prompt.describeLabel': '描述',
  'prompt.bookmarkPlaceholder': '例如 feature-x',
  'prompt.describePlaceholder': '提交说明…',
  'prompt.bookmarkOk': '创建',
  'prompt.describeOk': '保存',
  'prompt.hint': 'Enter 确认 · Esc 取消',
  'prompt.bookmarkMoveTitle': '移动书签到此处',
  'prompt.bookmarkMoveLabel': '书签名称',
  'prompt.bookmarkMovePlaceholder': '要移动的书签…',
  'prompt.bookmarkMoveOk': '移动',
  'prompt.bookmarkRenameTitle': '重命名书签',
  'prompt.bookmarkRenameLabel': '新名称',
  'prompt.bookmarkRenamePlaceholder': '新书签名…',
  'prompt.bookmarkRenameOk': '重命名',
  'prompt.bookmarkPickTitle': '选择书签',
  'prompt.bookmarkPickLabel': '书签名称',
  'prompt.bookmarkPickPlaceholder': '输入书签名…',
  'prompt.bookmarkPickOk': '继续',

  'resolve.ours': '取我们的',
  'resolve.theirs': '取他们的',
  'confirm.resolveTitle': '确认解决冲突？',
  'confirm.resolveDetailOurs':
    '将用 jj resolve --tool :ours 采用「我们的」一侧覆盖 {path}。',
  'confirm.resolveDetailTheirs':
    '将用 jj resolve --tool :theirs 采用「他们的」一侧覆盖 {path}。',
  'confirm.actionResolve': '确认解决',
  'status.resolveOk': '已解决冲突 · {path}（{tool}）',
  'status.resolveFailed': '解决冲突失败',

  'toolbar.revsetLabel': 'Revset',
  'toolbar.revsetPlaceholder': 'all() 或 bookmarks() | @',
  'toolbar.revsetApply': '应用',
  'toolbar.revsetTitle': '过滤修订集合（Enter 应用）',
  'status.revsetApplied': '已应用 revset · {n} 个修订',
  'status.revsetInvalid': '无效的 revset',

  'ctx.bookmarkMove': '移动书签到此处…',
  'ctx.bookmarkRename': '重命名书签…',
  'ctx.bookmarkDelete': '删除书签…',
  'confirm.bookmarkDelete': '确认删除书签？',
  'confirm.bookmarkDeleteDetail':
    '将用 jj bookmark delete 删除书签 {name}。提交本身不会被丢弃。',
  'confirm.actionBookmarkDelete': '确认删除',

  'detail.compareHint': '对比 {from} → {to}',
  'diff.compareTitle': '对比 {from} → {to}',

  'common.noDescription': '无描述',
};

const en: Dict = {
  'settings.badge': 'Appearance & graph',
  'settings.title': 'Settings',
  'settings.detail': 'Theme and graph options are saved to local preferences.',
  'settings.language': 'Language',
  'settings.theme': 'Theme',
  'settings.theme.system': 'System',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.density': 'Density',
  'settings.density.compact': 'Compact · one-line summary',
  'settings.density.rich': 'Detailed · author & time',
  'settings.sort': 'Sort',
  'settings.sort.wcFirst': 'WC first · pin @ line',
  'settings.sort.recent': 'Recent rewrite · by commit time',
  'settings.growth': 'Growth',
  'settings.growth.bottomUp': 'Bottom-up · like GG / JayJay',
  'settings.growth.topDown': 'Top-down',
  'settings.done': 'Done',
  'settings.hint': 'Esc or click backdrop to close',

  'toolbar.repoPlaceholder': 'Repo path…',
  'toolbar.repoTitle': 'Local jj repository path',
  'toolbar.open': 'Open repo',
  'toolbar.reveal': 'Reveal in file manager',
  'toolbar.refresh': 'Refresh',
  'toolbar.refreshTitle': 'Refresh (F5 / ⌘R)',
  'toolbar.undo': 'Undo',
  'toolbar.undoTitle': 'Undo (⌘Z)',
  'toolbar.redo': 'Redo',
  'toolbar.redoTitle': 'Redo (⌘⇧Z)',
  'toolbar.settings': 'Settings',

  'confirm.badge': 'Drag preview · repo not modified yet',
  'confirm.rebase': 'Confirm rebase?',
  'confirm.rebaseN': 'Confirm rebase {n} commits?',
  'confirm.atTransfer': 'Move working copy?',
  'confirm.rebaseDetail':
    'Pruning rebase with jj rebase -r: only this commit moves; its descendants stay and reparent beside the old parent.',
  'confirm.rebaseDetailMulti':
    'Pruning rebase with jj rebase -r: only the selected chain moves; descendants outside the selection stay and reparent onto the new parents; parent–child links inside the selection are kept.',
  'confirm.atImmutable':
    'Target is immutable: create a new child and switch the working copy (jj new).',
  'confirm.atMutable': 'Switch the working copy to the target (jj edit).',
  'confirm.actionRebase': 'Confirm rebase',
  'confirm.actionAt': 'Confirm switch',
  'confirm.source': 'Source',
  'confirm.target': 'Target',
  'confirm.cancel': 'Cancel',
  'confirm.hint': 'Esc to cancel · jj runs only after confirm',

  'detail.title': 'Detail',
  'detail.expand': 'Expand detail panel',
  'detail.collapse': 'Collapse to the right',
  'detail.resize': 'Drag to resize',
  'detail.empty': 'Select a commit to view details',
  'detail.multiMore': '{n} more selected',
  'detail.noDescription': '(no description)',
  'detail.author': 'Author',
  'detail.date': 'Date',
  'detail.change': 'Change',
  'detail.parents': 'Parents',
  'detail.bookmarks': 'Bookmarks',
  'detail.diff': 'Diff',
  'detail.wc': 'Working copy @',
  'detail.immutable': 'Immutable',
  'detail.conflicts': 'Conflicts',
  'detail.conflictHint':
    'Create a child with double-click / jj new, edit markers or run jj resolve, then squash back.',
  'detail.conflictBadge': 'Conflict',
  'detail.files': 'Files',
  'detail.noFiles': 'No file changes in this commit',
  'detail.fileConflict': 'Conflict',
  'diff.title': 'Diff',
  'diff.empty': 'Select a file to view its unified diff',
  'diff.noSelection': 'Select a commit to view diffs',
  'diff.loading': 'Loading…',
  'diff.error': 'Failed to load diff',
  'diff.binaryOrEmpty': '(binary or empty diff)',
  'diff.resize': 'Drag to resize diff panel',
  'diff.mode': 'Diff view',
  'diff.modeUnified': 'Unified',
  'diff.modeSideBySide': 'Side by side',

  'graph.empty': 'Open a jj repo to view the revision graph',
  'graph.emptyHint': 'e.g. {path}',
  'graph.openRepoPicker': 'Open Repository…',
  'graph.dragAt': 'Drag @ to move working copy',
  'graph.noDescription': '(no description)',
  'graph.hint':
    'Click to select · ⌘/Ctrl multi-select · Right-click menu · Double-click edit/new · Drag to rebase (arc preview + confirm) · Drag @ to move working copy',
  'graph.multiSource': '({n})',
  'graph.conflictMark': 'Conflict',

  'conflict.bannerTitle': 'Rebase created conflicts',
  'conflict.bannerCommits': '{n} conflicted commits',
  'conflict.bannerPaths': 'Conflicted files',
  'conflict.select': 'Select conflicted',
  'conflict.dismiss': 'Dismiss',

  'status.ready': 'Ready',
  'status.enterPath': 'Enter a repository path',
  'status.loaded': 'Loaded {n} revisions · {path}',
  'status.openFailed': 'Open failed',
  'status.refreshed': 'Refreshed · {n} revisions',
  'status.revealNeedPath': 'Open a repo first, or enter a directory path',
  'status.revealed': 'Opened in file manager · {path}',
  'status.revealFailed': 'Failed to open file manager',
  'status.rebaseOk': 'Rebase ok',
  'status.rebaseOkConflicts': 'Rebase ok · {n} commit conflicted',

  'ctx.title': 'Revision',
  'ctx.titleN': 'Revisions ({n})',
  'ctx.newChild': 'New child',
  'ctx.newChildN': 'New child (merge parents)',
  'ctx.newInsertBefore': 'New inserted parent',
  'ctx.edit': 'Edit as working copy',
  'ctx.revert': 'Revert into working copy',
  'ctx.revertN': 'Revert into working copy',
  'ctx.duplicate': 'Duplicate',
  'ctx.duplicateN': 'Duplicate',
  'ctx.abandon': 'Abandon…',
  'ctx.abandonN': 'Abandon…',
  'ctx.squash': 'Squash into parent',
  'ctx.restore': 'Restore from parent',
  'ctx.bookmark': 'Create bookmark…',
  'ctx.describe': 'Describe…',

  'confirm.badgeDanger': 'Destructive · undoable',
  'confirm.abandon': 'Abandon revision?',
  'confirm.abandonN': 'Abandon {n} revisions?',
  'confirm.abandonDetail':
    'Runs jj abandon on the selection; descendants reparent onto its parents. Undo can reverse this.',
  'confirm.actionAbandon': 'Abandon',

  'prompt.badge': 'jj runs only after confirm',
  'prompt.bookmarkTitle': 'Create bookmark',
  'prompt.describeTitle': 'Describe',
  'prompt.bookmarkLabel': 'Bookmark name',
  'prompt.describeLabel': 'Description',
  'prompt.bookmarkPlaceholder': 'e.g. feature-x',
  'prompt.describePlaceholder': 'Commit message…',
  'prompt.bookmarkOk': 'Create',
  'prompt.describeOk': 'Save',
  'prompt.hint': 'Enter to confirm · Esc to cancel',
  'prompt.bookmarkMoveTitle': 'Move bookmark here',
  'prompt.bookmarkMoveLabel': 'Bookmark name',
  'prompt.bookmarkMovePlaceholder': 'Bookmark to move…',
  'prompt.bookmarkMoveOk': 'Move',
  'prompt.bookmarkRenameTitle': 'Rename bookmark',
  'prompt.bookmarkRenameLabel': 'New name',
  'prompt.bookmarkRenamePlaceholder': 'New bookmark name…',
  'prompt.bookmarkRenameOk': 'Rename',
  'prompt.bookmarkPickTitle': 'Pick bookmark',
  'prompt.bookmarkPickLabel': 'Bookmark name',
  'prompt.bookmarkPickPlaceholder': 'Enter bookmark name…',
  'prompt.bookmarkPickOk': 'Continue',

  'resolve.ours': 'Take ours',
  'resolve.theirs': 'Take theirs',
  'confirm.resolveTitle': 'Resolve conflict?',
  'confirm.resolveDetailOurs':
    'Runs jj resolve --tool :ours to keep our side for {path}.',
  'confirm.resolveDetailTheirs':
    'Runs jj resolve --tool :theirs to keep their side for {path}.',
  'confirm.actionResolve': 'Resolve',
  'status.resolveOk': 'Resolved · {path} ({tool})',
  'status.resolveFailed': 'Resolve failed',

  'toolbar.revsetLabel': 'Revset',
  'toolbar.revsetPlaceholder': 'all() or bookmarks() | @',
  'toolbar.revsetApply': 'Apply',
  'toolbar.revsetTitle': 'Filter revisions (Enter to apply)',
  'status.revsetApplied': 'Revset applied · {n} revisions',
  'status.revsetInvalid': 'Invalid revset',

  'ctx.bookmarkMove': 'Move bookmark here…',
  'ctx.bookmarkRename': 'Rename bookmark…',
  'ctx.bookmarkDelete': 'Delete bookmark…',
  'confirm.bookmarkDelete': 'Delete bookmark?',
  'confirm.bookmarkDeleteDetail':
    'Runs jj bookmark delete on {name}. The commit itself is kept.',
  'confirm.actionBookmarkDelete': 'Delete',

  'detail.compareHint': 'Compare {from} → {to}',
  'diff.compareTitle': 'Compare {from} → {to}',

  'common.noDescription': 'no description',
};

export const messages: Record<Locale, Dict> = { zh, en };

export type TFunction = (key: MsgKey, vars?: Record<string, string | number>) => string;

export function t(
  locale: Locale,
  key: MsgKey,
  vars?: Record<string, string | number>,
): string {
  const dict = messages[locale] ?? messages.zh;
  let s = dict[key] ?? messages.zh[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

export function makeT(locale: Locale): TFunction {
  return (key, vars) => t(locale, key, vars);
}

/** Relative time in the active locale. */
export function formatRelative(locale: Locale, ts: string, now = Date.now()): string {
  const parsed = parseCommitterTs(ts);
  if (parsed === null) return '—';
  const diffMs = Math.max(0, now - parsed);
  const sec = Math.floor(diffMs / 1000);
  if (locale === 'en') {
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return min === 1 ? '1 minute ago' : `${min} minutes ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr === 1 ? '1 hour ago' : `${hr} hours ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return day === 1 ? '1 day ago' : `${day} days ago`;
    const week = Math.floor(day / 7);
    if (day < 30) return week === 1 ? '1 week ago' : `${week} weeks ago`;
    const month = Math.floor(day / 30);
    if (month < 12) return month === 1 ? '1 month ago' : `${month} months ago`;
    const year = Math.max(1, Math.floor(day / 365));
    return year === 1 ? '1 year ago' : `${year} years ago`;
  }
  // zh
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  const week = Math.floor(day / 7);
  if (day < 30) return `${week} 周前`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} 个月前`;
  const year = Math.max(1, Math.floor(day / 365));
  return `${year} 年前`;
}

export function formatTsRelativeThenAbsolute(
  locale: Locale,
  ts: string,
  now = Date.now(),
): string {
  const abs = formatTs(ts);
  if (!ts) return abs;
  return `${formatRelative(locale, ts, now)} · ${abs}`;
}

export function labelRev(locale: Locale, changeId: string, description: string): string {
  const desc = description.trim() || t(locale, 'common.noDescription');
  return `${shortId(changeId)} · ${desc}`;
}

export function htmlLang(locale: Locale): string {
  return locale === 'en' ? 'en' : 'zh-CN';
}
