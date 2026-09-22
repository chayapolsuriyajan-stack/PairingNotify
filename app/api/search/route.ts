import { isAuthed, unauthorized } from '@/server/auth';
import { searchPlayers } from '@/lib/chessresults/search.js';

/**
 * Find a player — and the events they are in — from a FIDE ID or a name, so nobody has
 * to go back to chess-results to copy a tournament link.
 *
 * Two upstream requests per call (the WebForms form, then the POST), throttled by the
 * shared client in lib/chessresults/client.js.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await isAuthed())) return unauthorized();
  const query = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (!query) return Response.json({ error: 'Type a name or a FIDE ID.' }, { status: 400 });

  try {
    const players = await searchPlayers({ query });
    return Response.json({ query, players }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    // Nothing found, or chess-results changed/was unreachable: the message says which.
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
