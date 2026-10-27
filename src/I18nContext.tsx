import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Locale } from './types';
import { makeT, type MsgKey, type TFunction } from './i18n';

interface I18nValue {
  locale: Locale;
  t: TFunction;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const value = useMemo<I18nValue>(
    () => ({ locale, t: makeT(locale) }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}

export type { MsgKey, TFunction };
