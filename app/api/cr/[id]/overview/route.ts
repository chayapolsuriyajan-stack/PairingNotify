import { cachedJson, errorJson, memo } from '@/server/http';
import { isTournamentId } from '@/lib/ref.js';
import { fetchCrosstable, fetchSchedule } from '@/lib/chessresults/pages.js';
import { fetchStartingRank } from '@/lib/chessresults/tournament.js';
import { detectFormat } from '@/lib/predict/forecast.js';

/**
 * Everything the tournament screens and the forecast need, in two requests: the
 * starting-rank crosstable (players, every game so far, tournament details, round
 * menu) and the playing schedule. Before round 1 is paired there is no crosstable, so
 * it falls back to the starting-rank list.
 *
 * The two pages are fetched in parallel, not one after the other: each is a throttled,
 * retried request to a site that is sometimes slow or briefly 503s, so doing them in
 * series could take 25-30s+ on a bad day — enough to hit the old 30s ceiling on Vercel
 * and come back as a dead "Reading event…" screen with no error at all. Running them
 * together roughly halves the worst case, and a schedule-page failure (some events
 * never publish one) no longer takes the whole event down with it.
 */
export const maxDuration = 60;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isTournamentId(id)) return errorJson('Not a tournament id', 400);

  try {
    const data = await memo(`overview:${id}`, 60_000, async () => {
      const [scheduleResult, crossResult] = await Promise.allSettled([fetchSchedule(id), fetchCrosstable(id)]);
      const schedule = scheduleResult.status === 'fulfilled' ? scheduleResult.value : [];

      if (crossResult.status === 'fulfilled') {
        const cross = crossResult.value;
        return {
          id,
          title: cross.title,
          started: true,
          format: detectFormat(cross, cross.details),
          details: cross.details,
          menu: cross.menu,
          totalRounds: cross.details.rounds ?? cross.menu.totalRounds ?? null,
          rounds: cross.rounds,
          players: cross.players,
          schedule,
        };
      } else {
        // No crosstable yet (round 1 unpaired, or the event hasn't started): fall
        // back to the starting-rank list for the entrant roster.
        const rank = await fetchStartingRank(id);
        return {
          id,
          title: rank.title,
          started: false,
          format: null,
          details: {},
          menu: null,
          totalRounds: schedule.length || null,
          rounds: 0,
          players: rank.players.map((p: { startNo: number; name: string; rating: number | null; federation: string | null }) => ({
            startNo: p.startNo,
            name: p.name,
            title: null,
            rating: p.rating,
            federation: p.federation,
            points: 0,
            rank: null,
            games: [],
          })),
          schedule,
        };
      }
    });
    return cachedJson(data);
  } catch (error) {
    return errorJson(error);
  }
}
