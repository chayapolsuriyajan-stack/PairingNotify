import { cachedJson, errorJson, intParam, memo } from '@/server/http';
import { isTournamentId } from '@/lib/ref.js';
import { fetchStandings } from '@/lib/chessresults/pages.js';

/** Ranking after a round (latest when ?rd is omitted): /api/cr/1486488/standings?rd=1 */
export const maxDuration = 30;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raw = new URL(request.url).searchParams.get('rd');
  const round = raw ? intParam(raw, 1, 99) : null;
  if (!isTournamentId(id) || (raw && round == null)) return errorJson('Bad tournament id or round', 400);

  try {
    const data = await memo(`standings:${id}:${round ?? 'latest'}`, 60_000, () => fetchStandings(id, round));
    return cachedJson({ id, round, ...data });
  } catch (error) {
    return errorJson(error);
  }
}
