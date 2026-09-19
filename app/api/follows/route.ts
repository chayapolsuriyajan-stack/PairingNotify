import { after } from 'next/server';
import { randomUUID } from 'node:crypto';
import { isAuthed, unauthorized } from '@/server/auth';
import { pollOnce } from '@/server/poll';
import { getStore } from '@/lib/store/index.js';
import { parseTournamentRef } from '@/lib/ref.js';

type Follow = {
  id: string;
  playerName: string;
  fideId: string | null;
  isMe: boolean;
  autoDiscover: boolean;
  tournaments: { id: string; label: string }[];
};

type Body = Partial<Omit<Follow, 'tournaments'>> & { tournaments?: string[] };

export async function GET() {
  if (!(await isAuthed())) return unauthorized();
  return Response.json(await getStore().listFollows(), { headers: { 'Cache-Control': 'no-store' } });
}

/** Create or update a follow. Tournaments may be ids or pasted chess-results links. */
export async function POST(request: Request) {
  if (!(await isAuthed())) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as Body;

  const playerName = String(body.playerName ?? '').trim().slice(0, 120);
  const fideId = String(body.fideId ?? '').replace(/\D/g, '').slice(0, 12) || null;
  if (!playerName && !fideId) {
    return Response.json({ error: 'Enter a name as it appears on chess-results, or a FIDE ID.' }, { status: 400 });
  }

  const tournaments: Follow['tournaments'] = [];
  for (const raw of body.tournaments ?? []) {
    if (!String(raw).trim()) continue;
    const ref = parseTournamentRef(raw);
    if (!ref) return Response.json({ error: `Not a chess-results tournament: ${raw}` }, { status: 400 });
    if (!tournaments.some((t) => t.id === ref.id)) tournaments.push({ id: ref.id, label: `Tournament ${ref.id}` });
  }
  const autoDiscover = body.autoDiscover ?? true;
  if (tournaments.length === 0 && !autoDiscover) {
    return Response.json({ error: 'Add a tournament, or turn on auto-discovery.' }, { status: 400 });
  }

  const store = getStore();
  const all: Follow[] = await store.listFollows();
  const existing = all.find((f) => f.id === body.id);
  const follow: Follow = {
    id: existing?.id ?? randomUUID(),
    playerName,
    fideId,
    isMe: Boolean(body.isMe),
    autoDiscover,
    tournaments,
  };

  // Only one follow is "you".
  if (follow.isMe) {
    for (const other of all) {
      if (other.id !== follow.id && other.isMe) await store.saveFollow({ ...other, isMe: false });
    }
  }
  // A changed name/FIDE ID invalidates the cached start numbers for this follow.
  if (existing && (existing.playerName !== playerName || existing.fideId !== fideId)) {
    const poll = (await store.get('poll')) ?? {};
    for (const key of Object.keys(poll.players ?? {})) {
      if (key.startsWith(`${follow.id}:`)) delete poll.players[key];
    }
    if (poll.discovery) delete poll.discovery[follow.id];
    await store.set('poll', poll);
  }
  await store.saveFollow(follow);

  // Fetch right away so the app shows the new player without waiting for cron.
  after(() => pollOnce().catch(() => {}));
  return Response.json(follow);
}

export async function DELETE(request: Request) {
  if (!(await isAuthed())) return unauthorized();
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
  await getStore().removeFollow(id);
  return Response.json({ ok: true });
}
