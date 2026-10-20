import type { Market, Quote } from "./score.ts";

export type NbaGame = {
  id: string;
  away: string;
  home: string;
  awayName: string;
  homeName: string;
  start: string;
  state: "pre" | "in" | "post";
};

export type NbaActual = {
  min: number;
  pts: number;
  reb: number;
  ast: number;
  threes: number;
  pra: number;
};

export type NbaPlayer = {
  id: string;
  espnId: string;
  name: string;
  team: string;
  opp: string;
  pos: string;
  home: boolean;
  gameId: string;
  start: string;
  gp: number;
  minutes: number;
  quotes: Record<Market, Quote>;
  actual: NbaActual | null;
};

export type NbaSlip = {
  title: string;
  sweep: number;
  note: string;
  legs: { name: string; team: string; market: Market; projection: number; line: number; cover: number }[];
};

export type NbaBoard = {
  date: string;
  fetchedAt: string;
  model: { version: string; name: string };
  games: NbaGame[];
  players: NbaPlayer[];
  slip: NbaSlip | null;
  notes: string[];
};
