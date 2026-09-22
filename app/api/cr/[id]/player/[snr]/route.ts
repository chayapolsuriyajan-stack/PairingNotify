import { cachedJson, errorJson, intParam, memo } from '@/server/http';
import { isTournamentId } from '@/lib/ref.js';
import { fetchPlayer } from '@/lib/chessresults/pages.js';

/** One player's card in a tournament: /api/cr/1486488/player/12 */
export const maxDuration = 30;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; snr: string }> }) {
  const { id, snr } = await params;
  const startNo = intParam(snr, 1, 99999);
  if (!isTournamentId(id) || startNo == null) return errorJson('Bad tournament id or start number', 400);

  try {
    const data = await memo(`player:${id}:${startNo}`, 60_000, () => fetchPlayer(id, startNo));
    return cachedJson({ id, startNo, ...data });
  } catch (error) {
    return errorJson(error);
  }
}
