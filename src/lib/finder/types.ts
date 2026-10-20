export type FinderRow = {
  id: string;
  sport: "NBA" | "NHL";
  name: string;
  team: string;
  opp: string;
  pos: string;
  game: string;
  start: string;
  market: string;
  line: number;
  projection: number;
  lean: "over" | "under" | "pass";
  avg: number | null;
  diff: number | null;
  l5: number | null;
  l10: number | null;
  l15: number | null;
  season: number | null;
  pre: number | null;
  streak: number;
  n10: number;
  source: "season" | "preseason";
};

export type FinderBoard = {
  date: string;
  rows: FinderRow[];
  notes: string[];
};
