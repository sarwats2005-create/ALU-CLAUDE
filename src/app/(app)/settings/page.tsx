import type { Metadata } from 'next';
import { guardPage } from '@/lib/server/page';
import { SettingsView } from './SettingsView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  await guardPage('settings');
  const { section } = await searchParams;
  return <SettingsView initial={section ?? 'company'} />;
}
