import { useEffect, useRef } from 'react';
import type { DensityMode, GrowthDirection, Locale, SortMode, ThemeMode } from '../types';
import { useI18n } from '../I18nContext';

interface Props {
  density: DensityMode;
  sort: SortMode;
  growth: GrowthDirection;
  theme: ThemeMode;
  locale: Locale;
  onDensity: (d: DensityMode) => void;
  onSort: (s: SortMode) => void;
  onGrowth: (g: GrowthDirection) => void;
  onTheme: (t: ThemeMode) => void;
  onLocale: (l: Locale) => void;
  onClose: () => void;
}

export function SettingsDialog({
  density,
  sort,
  growth,
  theme,
  locale,
  onDensity,
  onSort,
  onGrowth,
  onTheme,
  onLocale,
  onClose,
}: Props) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('select,button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-badge">{t('settings.badge')}</div>
        <h3 id="settings-dialog-title">{t('settings.title')}</h3>
        <p className="modal-detail">{t('settings.detail')}</p>

        <label className="settings-field">
          <span className="settings-label">{t('settings.language')}</span>
          <select value={locale} onChange={(e) => onLocale(e.target.value as Locale)}>
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>

        <label className="settings-field">
          <span className="settings-label">{t('settings.theme')}</span>
          <select value={theme} onChange={(e) => onTheme(e.target.value as ThemeMode)}>
            <option value="system">{t('settings.theme.system')}</option>
            <option value="light">{t('settings.theme.light')}</option>
            <option value="dark">{t('settings.theme.dark')}</option>
          </select>
        </label>

        <label className="settings-field">
          <span className="settings-label">{t('settings.density')}</span>
          <select
            value={density}
            onChange={(e) => onDensity(e.target.value as DensityMode)}
          >
            <option value="compact">{t('settings.density.compact')}</option>
            <option value="rich">{t('settings.density.rich')}</option>
          </select>
        </label>

        <label className="settings-field">
          <span className="settings-label">{t('settings.sort')}</span>
          <select value={sort} onChange={(e) => onSort(e.target.value as SortMode)}>
            <option value="workingCopyFirst">{t('settings.sort.wcFirst')}</option>
            <option value="recentRewrite">{t('settings.sort.recent')}</option>
          </select>
        </label>

        <label className="settings-field">
          <span className="settings-label">{t('settings.growth')}</span>
          <select
            value={growth}
            onChange={(e) => onGrowth(e.target.value as GrowthDirection)}
          >
            <option value="bottomUp">{t('settings.growth.bottomUp')}</option>
            <option value="topDown">{t('settings.growth.topDown')}</option>
          </select>
        </label>

        <div className="modal-actions">
          <button type="button" className="btn primary" onClick={onClose}>
            {t('settings.done')}
          </button>
        </div>
        <p className="modal-hint">{t('settings.hint')}</p>
      </div>
    </div>
  );
}
