import { notFound } from 'next/navigation';
import { PlayerScreen } from '@/components/PlayerScreen';

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; snr: string }>;
  searchParams: Promise<{ me?: string }>;
}) {
  const { id, snr } = await params;
  const { me } = await searchParams;
  if (!/^\d{3,9}$/.test(id) || !/^\d+$/.test(snr)) notFound();
  return <PlayerScreen id={id} startNo={Number(snr)} me={me && /^\d+$/.test(me) ? Number(me) : null} />;
}
