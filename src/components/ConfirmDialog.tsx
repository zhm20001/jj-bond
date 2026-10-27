import type { PendingConfirm } from '../types';
import { useI18n } from '../I18nContext';

interface Props {
  pending: PendingConfirm;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ pending, onConfirm, onCancel }: Props) {
  const { t } = useI18n();

  if (pending.kind === 'abandon') {
    const n = pending.revisionIds.length;
    const title =
      n > 1 ? t('confirm.abandonN', { n }) : t('confirm.abandon');
    return (
      <div className="modal-backdrop" onClick={onCancel}>
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-badge">{t('confirm.badgeDanger')}</div>
          <h3>{title}</h3>
          <p className="modal-detail">{t('confirm.abandonDetail')}</p>
          <div className="modal-pair single">
            <div>
              <span className="muted">{t('confirm.target')}</span>
              <div className="mono">{pending.label}</div>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onCancel}>
              {t('confirm.cancel')}
            </button>
            <button type="button" className="btn primary danger" onClick={onConfirm}>
              {t('confirm.actionAbandon')}
            </button>
          </div>
          <p className="modal-hint">{t('confirm.hint')}</p>
        </div>
      </div>
    );
  }

  if (pending.kind === 'resolveConflict') {
    const detail =
      pending.tool === 'ours'
        ? t('confirm.resolveDetailOurs', { path: pending.filePath })
        : t('confirm.resolveDetailTheirs', { path: pending.filePath });
    return (
      <div className="modal-backdrop" onClick={onCancel}>
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-badge">{t('confirm.badgeDanger')}</div>
          <h3>{t('confirm.resolveTitle')}</h3>
          <p className="modal-detail">{detail}</p>
          <div className="modal-pair single">
            <div>
              <span className="muted">{t('confirm.target')}</span>
              <div className="mono">{pending.label}</div>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onCancel}>
              {t('confirm.cancel')}
            </button>
            <button type="button" className="btn primary danger" onClick={onConfirm}>
              {t('confirm.actionResolve')}
            </button>
          </div>
          <p className="modal-hint">{t('confirm.hint')}</p>
        </div>
      </div>
    );
  }

  if (pending.kind === 'bookmarkDelete') {
    return (
      <div className="modal-backdrop" onClick={onCancel}>
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-badge">{t('confirm.badgeDanger')}</div>
          <h3>{t('confirm.bookmarkDelete')}</h3>
          <p className="modal-detail">
            {t('confirm.bookmarkDeleteDetail', { name: pending.name })}
          </p>
          <div className="modal-pair single">
            <div>
              <span className="muted">{t('confirm.target')}</span>
              <div className="mono">{pending.label}</div>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onCancel}>
              {t('confirm.cancel')}
            </button>
            <button type="button" className="btn primary danger" onClick={onConfirm}>
              {t('confirm.actionBookmarkDelete')}
            </button>
          </div>
          <p className="modal-hint">{t('confirm.hint')}</p>
        </div>
      </div>
    );
  }

  const isRebase = pending.kind === 'rebase';
  const count = isRebase ? pending.sourceIds.length : 1;
  const title = isRebase
    ? count > 1
      ? t('confirm.rebaseN', { n: count })
      : t('confirm.rebase')
    : t('confirm.atTransfer');
  const detail = isRebase
    ? count > 1
      ? t('confirm.rebaseDetailMulti')
      : t('confirm.rebaseDetail')
    : pending.immutable
      ? t('confirm.atImmutable')
      : t('confirm.atMutable');
  const action = isRebase ? t('confirm.actionRebase') : t('confirm.actionAt');

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-badge">{t('confirm.badge')}</div>
        <h3>{title}</h3>
        <p className="modal-detail">{detail}</p>
        <div className="modal-pair">
          <div>
            <span className="muted">{t('confirm.source')}</span>
            <div className="mono">{pending.sourceLabel}</div>
          </div>
          <div className="arrow">→</div>
          <div>
            <span className="muted">{t('confirm.target')}</span>
            <div className="mono">{pending.targetLabel}</div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            {t('confirm.cancel')}
          </button>
          <button type="button" className="btn primary danger" onClick={onConfirm}>
            {action}
          </button>
        </div>
        <p className="modal-hint">{t('confirm.hint')}</p>
      </div>
    </div>
  );
}
