/** Shapes returned by the app's API routes (see app/api). */

export type Colour = 'white' | 'black' | null;

export interface CardRound {
  round: number;
  board: number | null;
  opponentNo: number | null;
  opponent: string | null;
  rating: number | null;
  federation: string | null;
  colour: Colour;
  result: string | null;
  paired: boolean;
}

export interface FeedTournament {
  id: string;
  title: string;
  url: string;
  startNo: number;
  playerName: string;
  pinned: boolean;
  rounds: CardRound[];
  latestPaired: CardRound | null;
  lastChangeAt: number | null;
}

export interface FeedFollow {
  id: string;
  playerName: string;
  isMe: boolean;
  discoveryError: string | null;
  /** When the poller last searched chess-results for this player's events. */
  discoveryAt: number | null;
  /** When it will search again (lib/poll.js#discoveryInterval). */
  discoveryNextAt: number | null;
  tournaments: FeedTournament[];
}

export interface Feed {
  generatedAt: string | null;
  follows: FeedFollow[];
  errors: { followId: string; tournamentId: string; message: string }[];
}

export interface Follow {
  id: string;
  playerName: string;
  fideId: string | null;
  isMe: boolean;
  autoDiscover: boolean;
  tournaments: { id: string; label: string }[];
}

export interface FeedResponse {
  feed: Feed;
  follows: Follow[];
}

/** One row of a chess-results player search (GET /api/search). */
export interface FoundTournament {
  id: string;
  label: string;
  endDate: string | null;
  /** The player's start number, read from the row's own link. */
  startNo: number | null;
  name: string;
  fideId: string | null;
  federation: string | null;
  rank: number | null;
  rounds: number | null;
}

export interface FoundPlayer {
  name: string;
  fideId: string | null;
  federation: string | null;
  tournaments: FoundTournament[];
}

export interface SearchResponse {
  query: string;
  players: FoundPlayer[];
}

export interface Config {
  vapidPublicKey: string | null;
  passcodeRequired: boolean;
  authed: boolean;
  storage: 'redis' | 'memory';
  cronConfigured: boolean;
}

export interface CrossGame {
  round: number;
  opponent: number | null;
  colour: Colour;
  score: number | null;
  kind: 'game' | 'pending' | 'forfeit' | 'bye' | 'absent';
}

export interface CrossPlayer {
  startNo: number;
  name: string;
  title: string | null;
  rating: number | null;
  federation: string | null;
  points: number | null;
  rank: number | null;
  games: CrossGame[];
}

export interface Overview {
  id: string;
  title: string | null;
  started: boolean;
  format: 'swiss' | 'round-robin' | null;
  details: Record<string, string | number | undefined>;
  menu: {
    pairedRounds: number[];
    standingsRounds: number[];
    currentRound: number | null;
    totalRounds: number | null;
    lastUpdate: string | null;
  } | null;
  totalRounds: number | null;
  rounds: number;
  players: CrossPlayer[];
  schedule: { round: number; date: string | null; time: string | null }[];
}

export interface PairingSide {
  startNo: number | null;
  name: string;
  rating: number | null;
  title: string | null;
  points: number | null;
}

export interface Pairing {
  board: number;
  white: PairingSide;
  black: PairingSide | null;
  bye: boolean;
  notPaired: boolean;
  resultText: string;
  result: { white: number; black: number; forfeit: boolean } | null;
}

export interface StandingRow {
  rank: number | null;
  startNo: number | null;
  name: string;
  title: string | null;
  federation: string | null;
  rating: number | null;
  points: number | null;
  tiebreaks: number[];
}

export interface PlayerResponse {
  id: string;
  startNo: number;
  rounds: CardRound[];
  header: {
    name?: string;
    rating?: number | null;
    performance?: number | null;
    federation?: string;
    fideId?: string;
    club?: string;
    points?: number | null;
    rank?: number | null;
    title?: string;
    ratingChange?: number | null;
  };
}
