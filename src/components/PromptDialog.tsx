import { useEffect, useRef, useState } from 'react';
import type { PendingPrompt } from '../types';
import { useI18n } from '../I18nContext';

interface Props {
  pending: PendingPrompt;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({ pending, onSubmit, onCancel }: Props) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  const initial = (() => {
    if (pending.kind === 'describe') return pending.initial;
    if (pending.kind === 'bookmarkRename') return '';
    if (pending.kind === 'bookmarkMove' && pending.candidates.length === 1) {
      return pending.candidates[0];
    }
    if (pending.kind === 'bookmarkPick' && pending.candidates.length === 1) {
      return pending.candidates[0];
    }
    return '';
  })();

  const [value, setValue] = useState(initial);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    inputRef.current?.select();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onCancel]);

  let title: string;
  let label: string;
  let placeholder: string;
  let action: string;
  let canSubmit: boolean;
  let detail = pending.label;
  let listHint: string | null = null;

  switch (pending.kind) {
    case 'bookmark':
      title = t('prompt.bookmarkTitle');
      label = t('prompt.bookmarkLabel');
      placeholder = t('prompt.bookmarkPlaceholder');
      action = t('prompt.bookmarkOk');
      canSubmit = value.trim().length > 0;
      break;
    case 'bookmarkMove':
      title = t('prompt.bookmarkMoveTitle');
      label = t('prompt.bookmarkMoveLabel');
      placeholder = t('prompt.bookmarkMovePlaceholder');
      action = t('prompt.bookmarkMoveOk');
      canSubmit = value.trim().length > 0;
      if (pending.candidates.length) {
        listHint = pending.candidates.slice(0, 12).join(', ');
      }
      break;
    case 'bookmarkRename':
      title = t('prompt.bookmarkRenameTitle');
      label = t('prompt.bookmarkRenameLabel');
      placeholder = t('prompt.bookmarkRenamePlaceholder');
      action = t('prompt.bookmarkRenameOk');
      canSubmit = value.trim().length > 0;
      detail = `${pending.oldName} → … · ${pending.label}`;
      break;
    case 'bookmarkPick':
      title = t('prompt.bookmarkPickTitle');
      label = t('prompt.bookmarkPickLabel');
      placeholder = t('prompt.bookmarkPickPlaceholder');
      action = t('prompt.bookmarkPickOk');
      canSubmit = value.trim().length > 0;
      if (pending.candidates.length) {
        listHint = pending.candidates.join(', ');
      }
      break;
    case 'describe':
    default:
      title = t('prompt.describeTitle');
      label = t('prompt.describeLabel');
      placeholder = t('prompt.describePlaceholder');
      action = t('prompt.describeOk');
      canSubmit = true;
      break;
  }

  const submit = () => {
    if (!canSubmit) return;
    const out =
      pending.kind === 'describe' ? value : value.trim();
    onSubmit(out);
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal prompt-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-badge">{t('prompt.badge')}</div>
        <h3>{title}</h3>
        <p className="modal-detail mono">{detail}</p>
        {listHint && (
          <p className="modal-hint mono" style={{ marginTop: 0 }}>
            {listHint}
          </p>
        )}
        <label className="settings-field">
          <span className="settings-label">{label}</span>
          <input
            ref={inputRef}
            className="repo-input prompt-input"
            type="text"
            value={value}
            placeholder={placeholder}
            list={
              pending.kind === 'bookmarkMove' || pending.kind === 'bookmarkPick'
                ? 'jj-bookmark-candidates'
                : undefined
            }
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
          {(pending.kind === 'bookmarkMove' || pending.kind === 'bookmarkPick') &&
            pending.candidates.length > 0 && (
              <datalist id="jj-bookmark-candidates">
                {pending.candidates.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            )}
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            {t('confirm.cancel')}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!canSubmit}
            onClick={submit}
          >
            {action}
          </button>
        </div>
        <p className="modal-hint">{t('prompt.hint')}</p>
      </div>
    </div>
  );
}
