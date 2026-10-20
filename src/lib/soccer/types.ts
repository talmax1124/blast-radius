export type SoccerGame = {
  id: string;
  away: string;
  home: string;
  awayName: string;
  homeName: string;
  start: string;
  state: string;
};

export type SoccerPlayer = {
  id: string;
  name: string;
  team: string;
  opp: string;
  pos: string;
  gameId: string;
  start: string;
  starts: number;
  shots: number;
  sot: number;
  goals: number;
  pShots15: number;
  pSot05: number;
  pGoal: number;
  cashShots: number | null;
};

export type SoccerSlip = {
  title: string;
  sweep: number;
  note: string;
  legs: { name: string; team: string; projection: number; line: number; cover: number }[];
};

export type SoccerBoard = {
  date: string;
  league: string;
  fetchedAt: string;
  model: { version: string; name: string };
  games: SoccerGame[];
  players: SoccerPlayer[];
  slip: SoccerSlip | null;
  notes: string[];
};
