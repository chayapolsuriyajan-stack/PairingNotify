'use client';

/**
 * What the PGN renamer remembers between visits: your Lichess username and how you like
 * names written. Kept on the device, like the recent events and the haptics: they are
 * properties of the phone in your hand, nothing the server needs, and every read and
 * write is guarded because private mode throws on storage access.
 *
 * The PGN and the pasted rows are deliberately not saved: they belong to one study and
 * would only come back as stale text the next time.
 */

export type NameOrder = 'first-last' | 'last-first';

export interface PgnPrefs {
  username: string;
  template: string;
  nameOrder: NameOrder;
  updateChapterName: boolean;
}

export const DEFAULT_PGN_PREFS: PgnPrefs = {
  username: '',
  template: '{opponent} {score}',
  nameOrder: 'first-last',
  updateChapterName: true,
};

const KEY = 'pn:pgn-prefs';

export function loadPgnPrefs(): PgnPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<PgnPrefs> | null;
    return {
      username: typeof raw?.username === 'string' ? raw.username : DEFAULT_PGN_PREFS.username,
      // An empty template would name every chapter "": fall back rather than trust it.
      template: typeof raw?.template === 'string' && raw.template.trim() ? raw.template : DEFAULT_PGN_PREFS.template,
      nameOrder: raw?.nameOrder === 'last-first' ? 'last-first' : 'first-last',
      updateChapterName: typeof raw?.updateChapterName === 'boolean' ? raw.updateChapterName : true,
    };
  } catch {
    return { ...DEFAULT_PGN_PREFS };
  }
}

export function savePgnPrefs(prefs: PgnPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Nothing to do: these are conveniences, not state the tool depends on.
  }
}
