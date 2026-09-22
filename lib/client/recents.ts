'use client';

/**
 * The events you opened recently, kept on the device.
 *
 * Opening a tournament used to mean pasting its chess-results link again every time,
 * which sent you back to the site the app exists to replace. Anything you have looked
 * at once is listed on the Events tab from here on.
 */

export interface RecentEvent {
  id: string;
  title: string;
  /** Your start number in that event, when the screen knew it. */
  startNo: number | null;
  at: number;
}

const KEY = 'pn:recent';
const MAX = 12;

export function recentEvents(): RecentEvent[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as RecentEvent[];
    if (!Array.isArray(list)) return [];
    return list.filter((e) => e && typeof e.id === 'string').sort((a, b) => b.at - a.at);
  } catch {
    return []; // Storage blocked (private mode).
  }
}

/** Record (or refresh) one event. Newest first, most recent MAX kept. */
export function rememberEvent(event: { id: string; title?: string | null; startNo?: number | null }): void {
  try {
    const previous = recentEvents();
    const before = previous.find((e) => e.id === event.id);
    const entry: RecentEvent = {
      id: event.id,
      // A poll can arrive before the title does: never overwrite a real title with a stub.
      title: event.title || before?.title || `Tournament ${event.id}`,
      startNo: event.startNo ?? before?.startNo ?? null,
      at: Date.now(),
    };
    const next = [entry, ...previous.filter((e) => e.id !== event.id)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Nothing to do: recents are a convenience, not state the app depends on.
  }
}

export function forgetEvent(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(recentEvents().filter((e) => e.id !== id)));
  } catch {
    // ignore
  }
}
