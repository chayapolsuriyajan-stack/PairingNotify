import { notFound } from 'next/navigation';
import { TournamentScreen } from '@/components/TournamentScreen';

type Tab = 'pairings' | 'standings' | 'card' | 'info';
const TABS: Tab[] = ['pairings', 'standings', 'card', 'info'];

export default async function TournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { p, tab } = await searchParams;
  if (!/^\d{3,9}$/.test(id)) notFound();
  const startNo = p && /^\d+$/.test(p) ? Number(p) : null;
  return <TournamentScreen id={id} p={startNo} tab={TABS.includes(tab as Tab) ? (tab as Tab) : null} />;
}
