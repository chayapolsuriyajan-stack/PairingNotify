import { cachedJson, errorJson, intParam, memo } from '@/server/http';
import { isTournamentId } from '@/lib/ref.js';
import { fetchPairings } from '@/lib/chessresults/pages.js';

/** Board pairings for one round: /api/cr/1486488/pairings?rd=2 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const round = intParam(new URL(request.url).searchParams.get('rd'), 1, 99);
  if (!isTournamentId(id) || round == null) return errorJson('Need a tournament id and ?rd=<round>', 400);

  try {
    const data = await memo(`pairings:${id}:${round}`, 60_000, () => fetchPairings(id, round));
    return cachedJson({ id, round, ...data });
  } catch (error) {
    return errorJson(error);
  }
}
