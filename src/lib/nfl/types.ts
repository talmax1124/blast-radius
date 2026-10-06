import type { ScoredPlayer } from "./score";

export type NflMarket = "atd" | "pass" | "rush" | "recyd" | "rec" | "passtd" | "fant";
export type GameState = "pre" | "in" | "post";
export type OddsType = "standard" | "demon" | "goblin";
export type LegResult = "hit" | "miss" | "pending" | "dnp";

export type NflGame = {
  id: string;
  away: string;
  home: string;
  awayScore: number | null;
  homeScore: number | null;
  state: GameState;
  detail: string;
  spreadLabel: string | null;
  total: number | null;
  venue: string;
  neutral: boolean;
};

export type NflActual = {
  passYd: number;
  passTd: number;
  ints: number;
  rushYd: number;
  rushTd: number;
  rec: number;
  recYd: number;
  recTd: number;
  played: boolean;
};

export type NflQuote = {
  market: NflMarket;
  stat: string;
  line: number;
  oddsType: OddsType;
  cover: number;
  projection: number;
};

export type NflPick = ScoredPlayer & {
  rank: number;
  gameId: string;
  gameState: GameState;
  actual: NflActual | null;
  quotes: NflQuote[];
};

export type NflLeg = {
  playerId: string;
  name: string;
  team: string;
  opp: string;
  pos: string;
  market: NflMarket;
  stat: string;
  line: number;
  cover: number;
  projection: number;
  actual: number | null;
  result: LegResult;
};

export type NflSlip = {
  size: 2 | 3 | 6;
  title: string;
  notes: string;
  skip: boolean;
  legs: NflLeg[];
};

export type PropLean = "over" | "under" | "no play";

export type ListedProp = {
  market: NflMarket;
  stat: string;
  projection: number;
  line: number | null;
  cover: number | null;
  lean: PropLean;
};

export type SheetPlayer = {
  id: string;
  name: string;
  pos: string;
  team: string;
  opp: string;
  espnId: number | null;
  status: string;
  form: string;
  pTd: number;
  expPassYd: number;
  expRushYd: number;
  expRec: number;
  expRecYd: number;
  expPassTd: number;
  expFantasy: number;
  reasons: string[];
  props: ListedProp[];
};

export type MatchSheet = {
  gameId: string;
  away: string;
  home: string;
  detail: string;
  spread: string | null;
  total: number | null;
  venue: string;
  weather: string;
  note: string;
  players: SheetPlayer[];
};

export type NflBoard = {
  date: string;
  week: number;
  season: number;
  model: { version: string; name: string };
  games: NflGame[];
  goalLine: NflPick[];
  props: NflPick[];
  slips: NflSlip[];
  notes: string[];
  lineCount: number;
  match: MatchSheet | null;
};
