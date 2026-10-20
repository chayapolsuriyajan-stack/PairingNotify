import { studyError, studyExportUrl, studyIdFrom } from '@/lib/pgn/lichess.js';

/**
 * Fallback for browsers that can't fetch Lichess directly (a strict network or an old
 * WebView): the same public export, relayed. Nothing is stored.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = studyIdFrom((await params).id);
  if (!id) return Response.json({ error: 'Not a Lichess study id' }, { status: 400 });

  const response = await fetch(studyExportUrl(id), {
    headers: { Accept: 'application/x-chess-pgn', 'User-Agent': 'PairingNotify study renamer' },
    cache: 'no-store',
  }).catch(() => null);
  if (!response) return Response.json({ error: 'Lichess is unreachable right now.' }, { status: 502 });
  if (!response.ok) return Response.json({ error: studyError(response.status) }, { status: response.status });
  return new Response(await response.text(), {
    headers: { 'Content-Type': 'application/x-chess-pgn; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
