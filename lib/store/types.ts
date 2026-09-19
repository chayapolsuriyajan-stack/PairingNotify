/** One followed player. `tournamentIds` are pinned; discovery adds more at poll time. */
export interface Follow {
  id: string;
  playerName: string;
  fideId: string | null;
  tournamentIds: string[];
}

/** A browser Web Push subscription (one per device). */
export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Everything the poller and the UI persist. Kept as a small interface so the poll
 * logic can be tested against the in-memory implementation.
 */
export interface Store {
  listFollows(): Promise<Follow[]>;
  saveFollow(follow: Follow): Promise<void>;
  removeFollow(id: string): Promise<void>;

  listSubscriptions(): Promise<PushSub[]>;
  saveSubscription(sub: PushSub): Promise<void>;
  removeSubscription(endpoint: string): Promise<void>;

  /** Diff state, same shape as the old data/state.json (see lib/diff.js). */
  getState(): Promise<{ version: number; players: Record<string, unknown> }>;
  setState(state: { version: number; players: Record<string, unknown> }): Promise<void>;

  /** Latest feed the UI renders (the old data/pairings.json). */
  getFeed(): Promise<unknown | null>;
  setFeed(feed: unknown): Promise<void>;
}
