import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Revision } from '../types';
import type { MsgKey } from '../i18n';
import { useI18n } from '../I18nContext';

export type ContextMenuAction =
  | 'newChild'
  | 'newInsertBefore'
  | 'edit'
  | 'revert'
  | 'duplicate'
  | 'abandon'
  | 'squash'
  | 'restore'
  | 'bookmark'
  | 'bookmarkMove'
  | 'bookmarkRename'
  | 'bookmarkDelete'
  | 'describe';

interface Props {
  x: number;
  y: number;
  /** Selected revisions in graph order (newer → older). */
  revisions: Revision[];
  onAction: (action: ContextMenuAction) => void;
  onClose: () => void;
}

interface Item {
  id: ContextMenuAction;
  labelKey: MsgKey;
  enabled: boolean;
  danger?: boolean;
}

export function ContextMenu({ x, y, revisions, onAction, onClose }: Props) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  const plural = revisions.length > 1;
  const singleton = revisions.length === 1;
  const oldest = revisions[revisions.length - 1];
  const anyImmutable = revisions.some((r) => r.immutable);
  const allMutable = !anyImmutable;
  const oldestSingleParent =
    !!oldest && oldest.parents.length === 1 ? oldest.parents[0] : null;
  const canSquashOrRestore = allMutable && !!oldestSingleParent;
  const alreadyWc = singleton && revisions[0]?.isWorkingCopy;
  const hasBookmarks = singleton && (revisions[0]?.bookmarks.length ?? 0) > 0;

  const items: (Item | 'sep')[] = useMemo(() => {
    const list: (Item | 'sep')[] = [
      {
        id: 'newChild',
        labelKey: plural ? 'ctx.newChildN' : 'ctx.newChild',
        enabled: revisions.length > 0,
      },
      {
        id: 'newInsertBefore',
        labelKey: 'ctx.newInsertBefore',
        enabled: revisions.length > 0,
      },
      'sep',
      {
        id: 'edit',
        labelKey: 'ctx.edit',
        enabled: singleton && !alreadyWc,
      },
      {
        id: 'revert',
        labelKey: plural ? 'ctx.revertN' : 'ctx.revert',
        enabled: revisions.length > 0,
      },
      {
        id: 'duplicate',
        labelKey: plural ? 'ctx.duplicateN' : 'ctx.duplicate',
        enabled: revisions.length > 0,
      },
      {
        id: 'abandon',
        labelKey: plural ? 'ctx.abandonN' : 'ctx.abandon',
        enabled: revisions.length > 0 && allMutable,
        danger: true,
      },
      'sep',
      {
        id: 'squash',
        labelKey: 'ctx.squash',
        enabled: canSquashOrRestore,
      },
      {
        id: 'restore',
        labelKey: 'ctx.restore',
        enabled: canSquashOrRestore,
      },
      'sep',
      {
        id: 'bookmark',
        labelKey: 'ctx.bookmark',
        enabled: singleton,
      },
      {
        id: 'bookmarkMove',
        labelKey: 'ctx.bookmarkMove',
        enabled: singleton,
      },
      {
        id: 'bookmarkRename',
        labelKey: 'ctx.bookmarkRename',
        enabled: hasBookmarks,
      },
      {
        id: 'bookmarkDelete',
        labelKey: 'ctx.bookmarkDelete',
        enabled: hasBookmarks,
        danger: true,
      },
      {
        id: 'describe',
        labelKey: 'ctx.describe',
        enabled: singleton && allMutable,
      },
    ];
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    revisions,
    plural,
    singleton,
    allMutable,
    canSquashOrRestore,
    alreadyWc,
    hasBookmarks,
  ]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pad = 8;
    const rect = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    setPos({ left, top });
  }, [x, y, items]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    const onPointer = (e: MouseEvent | PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onScroll = () => onClose();
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer, true);
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer, true);
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  const title = plural
    ? t('ctx.titleN', { n: revisions.length })
    : t('ctx.title');

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      aria-label={title}
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="context-menu-title">{title}</div>
      {items.map((item, i) => {
        if (item === 'sep') {
          return <div key={`sep-${i}`} className="context-menu-sep" role="separator" />;
        }
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={`context-menu-item${item.danger ? ' danger' : ''}`}
            disabled={!item.enabled}
            onClick={() => {
              if (!item.enabled) return;
              onAction(item.id);
            }}
          >
            {t(item.labelKey, plural ? { n: revisions.length } : undefined)}
          </button>
        );
      })}
    </div>
  );
}
