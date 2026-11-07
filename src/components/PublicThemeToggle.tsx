'use client';

import type { Lang } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import { ThemeToggle } from './ThemeToggle';

export function PublicThemeToggle({ lang }: { lang: Lang }) {
  return <ThemeToggle labelLight={t('nav.themeLight', lang)} labelDark={t('nav.themeDark', lang)} className="text-ink" />;
}
