export type NhlGame = {
  id: string;
  away: string;
  home: string;
  awayName: string;
  homeName: string;
  start: string;
  state: string;
  total: number | null;
  homeMl: string | null;
  awayMl: string | null;
  goalies: { name: string; team: string }[];
};

export type NhlSkater = {
  id: string;
  name: string;
  team: string;
  opp: string;
  pos: string;
  home: boolean;
  gameId: string;
  gameLabel: string;
  start: string;
  gp: number;
  careerGp: number;
  lambdaSog: number;
  lambdaPts: number;
  shPct: number;
  pShots15: number;
  pShots25: number;
  pPoint: number;
  pGoal: number;
  weight: number;
};

export type NhlSlip = {
  title: string;
  market: string;
  sweep: number;
  note: string;
  legs: NhlSkater[];
};

export type NhlBoard = {
  date: string;
  fetchedAt: string;
  model: { version: string; shrinkGames: number };
  games: NhlGame[];
  skaters: NhlSkater[];
  slip: NhlSlip | null;
  notes: string[];
};
