/** Small display helpers shared by the screens. */

/** "Myat Kaung," -> "Myat Kaung" (chess-results leaves a comma when there's no first name). */
export function tidyName(name: string | null | undefined): string {
  return String(name ?? '').replace(/,\s*$/, '').trim();
}

/** Accent/punctuation/word-order-insensitive name key, so "Kantor, Sam" == "Kantor Sam". */
export function nameKey(name: string | null | undefined): string {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function hhmm(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** "5", "4.5" -> "4½" */
export function points(value: number | null | undefined): string {
  if (value == null) return '–';
  const whole = Math.floor(value);
  const half = value - whole >= 0.5;
  return half ? `${whole || ''}½` : String(whole);
}

/**
 * Round start from the schedule, read in the phone's own time zone (chess-results
 * doesn't publish one; players are normally in the event's time zone).
 */
export function roundStart(
  schedule: { round: number; date: string | null; time: string | null }[] | undefined,
  round: number | null | undefined,
): Date | null {
  const entry = schedule?.find((s) => s.round === round);
  if (!entry?.date) return null;
  const date = new Date(`${entry.date}T${entry.time ?? '00:00'}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "IN 42 MIN", "IN 2 H 05", "STARTED 12 MIN AGO" */
export function countdown(start: Date, now: number): string {
  const diff = Math.round((start.getTime() - now) / 60_000);
  if (diff > 0) {
    if (diff < 60) return `IN ${diff} MIN`;
    if (diff < 24 * 60) return `IN ${Math.floor(diff / 60)} H ${pad2(diff % 60)}`;
    return `IN ${Math.round(diff / (24 * 60))} D`;
  }
  const ago = -diff;
  if (ago < 1) return 'STARTING NOW';
  if (ago < 180) return `STARTED ${ago} MIN AGO`;
  return 'STARTED';
}

export function syncLabel(updatedAt: number | null | undefined): string {
  if (!updatedAt) return 'SYNC —';
  return `SYNC ${hhmm(new Date(updatedAt))}`;
}

/** Result from the player's side: "1", "0", "½", or "" when not played yet. */
export function resultLabel(result: string | null | undefined): string {
  const r = String(result ?? '').trim();
  if (r === '0.5' || r === '½') return '½';
  return r;
}

export function percent(p: number): string {
  if (p > 0 && p < 0.01) return '<1%';
  return `${Math.round(p * 100)}%`;
}
