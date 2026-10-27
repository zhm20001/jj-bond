import { useState } from 'react';
import type { DensityMode, GrowthDirection, Locale, SortMode, ThemeMode } from '../types';
import { useI18n } from '../I18nContext';
import appIcon from '../../assets/icon01.svg';
import {
  IconOpenRepo,
  IconRedo,
  IconRefresh,
  IconRevealFolder,
  IconSettings,
  IconUndo,
} from './Icons';
import { SettingsDialog } from './SettingsDialog';

interface Props {
  repoInput: string;
  onRepoInput: (v: string) => void;
  onOpen: () => void;
  onOpenCwd: () => void;
  revsetInput: string;
  onRevsetInput: (v: string) => void;
  onApplyRevset: () => void;
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
  onUndo: () => void;
  onRedo: () => void;
  onReload: () => void;
  disabled?: boolean;
}

export function Toolbar(props: Props) {
  const {
    repoInput,
    onRepoInput,
    onOpen,
    onOpenCwd,
    revsetInput,
    onRevsetInput,
    onApplyRevset,
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
    onUndo,
    onRedo,
    onReload,
    disabled,
  } = props;

  const { t } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <header className="toolbar">
        <div className="toolbar-brand">
          <div
            className="brand-icon"
            role="img"
            aria-label="jj-bond"
            style={{ backgroundImage: `url(${appIcon})` }}
          />
        </div>
        <div className="toolbar-repo">
          <input
            className="repo-input"
            value={repoInput}
            onChange={(e) => onRepoInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onOpen();
            }}
            placeholder={t('toolbar.repoPlaceholder')}
            spellCheck={false}
            title={t('toolbar.repoTitle')}
          />
          <button
            type="button"
            className="btn icon-btn primary"
            onClick={onOpen}
            disabled={disabled}
            title={t('toolbar.open')}
            aria-label={t('toolbar.open')}
          >
            <IconOpenRepo />
          </button>
          <button
            type="button"
            className="btn icon-btn"
            onClick={onOpenCwd}
            disabled={disabled}
            title={t('toolbar.reveal')}
            aria-label={t('toolbar.reveal')}
          >
            <IconRevealFolder />
          </button>
          <button
            type="button"
            className="btn icon-btn"
            onClick={onReload}
            disabled={disabled}
            title={t('toolbar.refreshTitle')}
            aria-label={t('toolbar.refresh')}
          >
            <IconRefresh />
          </button>
        </div>
        <div className="toolbar-revset">
          <label className="revset-label" htmlFor="jj-revset-input">
            {t('toolbar.revsetLabel')}
          </label>
          <input
            id="jj-revset-input"
            className="repo-input revset-input"
            value={revsetInput}
            onChange={(e) => onRevsetInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onApplyRevset();
            }}
            placeholder={t('toolbar.revsetPlaceholder')}
            spellCheck={false}
            title={t('toolbar.revsetTitle')}
            disabled={disabled}
          />
          <button
            type="button"
            className="btn"
            onClick={onApplyRevset}
            disabled={disabled}
            title={t('toolbar.revsetTitle')}
          >
            {t('toolbar.revsetApply')}
          </button>
        </div>
        <div className="toolbar-ops">
          <button
            type="button"
            className="btn icon-btn"
            onClick={onUndo}
            disabled={disabled}
            title={t('toolbar.undoTitle')}
            aria-label={t('toolbar.undo')}
          >
            <IconUndo />
          </button>
          <button
            type="button"
            className="btn icon-btn"
            onClick={onRedo}
            disabled={disabled}
            title={t('toolbar.redoTitle')}
            aria-label={t('toolbar.redo')}
          >
            <IconRedo />
          </button>
          <button
            type="button"
            className={`btn icon-btn settings-btn${settingsOpen ? ' active' : ''}`}
            onClick={() => setSettingsOpen(true)}
            aria-haspopup="dialog"
            title={t('toolbar.settings')}
            aria-label={t('toolbar.settings')}
          >
            <IconSettings />
          </button>
        </div>
      </header>
      {settingsOpen && (
        <SettingsDialog
          density={density}
          sort={sort}
          growth={growth}
          theme={theme}
          locale={locale}
          onDensity={onDensity}
          onSort={onSort}
          onGrowth={onGrowth}
          onTheme={onTheme}
          onLocale={onLocale}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  );
}
