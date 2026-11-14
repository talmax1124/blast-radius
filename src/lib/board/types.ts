export type Sport = "nhl" | "nfl" | "mlb" | "nba" | "wnba" | "nwsl" | "arg" | "uru" | "col" | "tennis";

export type BoardLeg = {
  id: string;
  sport: Sport;
  date: string;
  gameId: string;
  game: string;
  playerId: string;
  name: string;
  team: string;
  market: string;
  marketLabel: string;
  prop: string;
  p: number;
  note: string;
  settled: "hit" | "miss" | null;
};

export type SpotSize = 2 | 3 | 4 | 6;

export type BoardSlip = {
  id: string;
  sport: Sport | "all";
  size: SpotSize;
  kind: "power" | "mix";
  title: string;
  sweep: number;
  legs: BoardLeg[];
  /** Return per unit on a power card and a flex card. 1 is break-even. */
  power: number | null;
  flex: number | null;
  /** Best-mode return with every leg cut 3 points. */
  stressed: number | null;
  play: "power" | "flex" | "pass";
  /** P(exactly k hits). Index is k. */
  dist: number[];
};

export type HeatCell = {
  row: string;
  col: string;
  p: number;
  name: string;
  prop: string;
};

export type TennisSide = {
  name: string;
  rank: number | null;
  winner: boolean;
};

export type TennisMatch = {
  id: string;
  tour: "ATP" | "WTA";
  event: string;
  round: string;
  state: "pre" | "in" | "post";
  detail: string;
  start: string;
  players: TennisSide[];
};

export type LedgerLeg = {
  id: string;
  date: string;
  sport: Sport;
  market: string;
  marketLabel: string;
  name: string;
  prop: string;
  p: number;
  result: "hit" | "miss";
};
