import { notFound } from 'next/navigation';
import { NextScreen } from '@/components/NextScreen';

export default async function NextPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { id } = await params;
  const { p } = await searchParams;
  if (!/^\d{3,9}$/.test(id)) notFound();
  return <NextScreen id={id} p={p && /^\d+$/.test(p) ? Number(p) : null} />;
}
