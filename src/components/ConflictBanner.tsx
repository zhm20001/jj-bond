import type { ConflictNotice } from '../types';
import { shortId } from '../types';
import { useI18n } from '../I18nContext';

interface Props {
  notice: ConflictNotice;
  onSelect: (changeIds: string[]) => void;
  onDismiss: () => void;
}

export function ConflictBanner({ notice, onSelect, onDismiss }: Props) {
  const { t } = useI18n();
  const n = notice.commits.length || notice.changeIds.length;

  return (
    <div className="conflict-banner" role="status">
      <div className="conflict-banner-main">
        <div className="conflict-banner-title">{t('conflict.bannerTitle')}</div>
        <div className="conflict-banner-body">
          <div className="conflict-banner-section">
            <span className="conflict-banner-label">
              {t('conflict.bannerCommits', { n })}
            </span>
            <ul className="conflict-banner-list">
              {notice.commits.map((c) => (
                <li key={c.changeId} className="mono">
                  <span className="id-prefix">{shortId(c.changeId)}</span>
                  <span className="muted">
                    {' '}
                    · {c.description.trim() || t('common.noDescription')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {notice.paths.length > 0 && (
            <div className="conflict-banner-section">
              <span className="conflict-banner-label">{t('conflict.bannerPaths')}</span>
              <ul className="conflict-banner-list paths">
                {notice.paths.map((p) => (
                  <li key={p} className="mono">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <div className="conflict-banner-actions">
        <button
          type="button"
          className="btn primary"
          onClick={() => onSelect(notice.changeIds)}
        >
          {t('conflict.select')}
        </button>
        <button type="button" className="btn" onClick={onDismiss}>
          {t('conflict.dismiss')}
        </button>
      </div>
    </div>
  );
}
