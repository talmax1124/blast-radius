export type PropMarket = "hr" | "hits" | "tb" | "rbi" | "sb" | "k" | "hrrbi" | "runs" | "fs";

/** Index at or above this is chalk. Soft names below it never repeat across slips. */
export const CHALK_SCORE = 70;

export type Lean = "smash" | "strong" | "lean" | "spec";

export type PitchFamily = "heat" | "break" | "off";

export type EdgeKind = "platoon" | "steal" | "fly" | "mix" | "climate" | "luck" | "home" | "rbi";

export type RecencyFlag = "hot" | "cold" | "thin" | "drought";

export type Factor = {
  key: string;
  label: string;
  score: number;
  detail: string;
};

export type WeatherSnap = {
  tempF: number | null;
  windMph: number | null;
  windDir: number | null;
  windLabel: string;
  carry: number;
};

export type GameCard = {
  gamePk: number;
  date: string;
  gameDate: string;
  status: string;
  abstractState: string;
  dayNight: string;
  venueId: number;
  venueName: string;
  city: string;
  parkHrFactor: number;
  parkHitsFactor: number;
  parkKFactor: number;
  parkSbFactor: number;
  elevationFt: number;
  azimuth: number | null;
  lat?: number | null;
  lon?: number | null;
  weather: WeatherSnap | null;
  umpire: string | null;
  away: TeamSide;
  home: TeamSide;
};

export type LineupStatus = "confirmed" | "expected" | "none";

export type LineupSpot = {
  slot: number;
  playerId: number | null;
  name: string;
  pos: string;
  batSide: "L" | "R" | "S" | null;
};

export type OddsType = "standard" | "demon" | "goblin";

export type PropLine = {
  line: number;
  side: "over" | "under";
  oddsType: OddsType;
  stat: string;
};

export type TeamSide = {
  id: number;
  name: string;
  abbr: string;
  wins: number;
  losses: number;
  probable: PitcherCard | null;
  lineup: LineupSpot[] | null;
  lineupStatus: LineupStatus;
  score: number | null;
};

export type PitchTypeRow = {
  code: string;
  name: string;
  family: PitchFamily;
  usage: number;
  velo: number | null;
  pitches: number | null;
  pa: number | null;
  slg: number | null;
  xslg: number | null;
  xba: number | null;
  xwoba: number | null;
  whiff: number | null;
  kPct: number | null;
  hardHit: number | null;
  rv100: number | null;
};

export type PitchMatchup = {
  code: string;
  name: string;
  family: PitchFamily;
  usage: number;
  batterXslg: number | null;
  batterWhiff: number | null;
  pitcherXwoba: number | null;
  pitcherWhiff: number | null;
  pitcherSlg: number | null;
};

export type SplitCard = {
  avg: number;
  slg: number;
  ops: number;
  iso: number;
  hr: number;
  pa: number;
  k: number;
  hits: number;
};

export type PitcherHandSplit = {
  avg: number;
  slg: number;
  hr9: number;
  hits9: number;
  k9: number;
  whip: number;
  ip: number;
  bf: number;
};

export type PitcherCard = {
  id: number;
  name: string;
  hand: "L" | "R" | "S" | null;
  era: number;
  hr9: number;
  k9: number;
  whip: number;
  hits9: number;
  goAo: number;
  ip: number;
  hr: number;
  k: number;
  gamesStarted: number;
  gamesPlayed: number;
  opener: boolean;
  xera: number | null;
  arsenal: PitchTypeRow[];
  vsL: PitcherHandSplit | null;
  vsR: PitcherHandSplit | null;
  sbRate: number | null;
  recentK9: number | null;
  recentIp: number | null;
};

export type PropEdge = {
  vsHand: SplitCard | null;
  vsHandCode: "vl" | "vr" | null;
  ha: SplitCard | null;
  haCode: "h" | "a" | null;
  fbRate: number | null;
  gbRate: number | null;
  ldRate: number | null;
  pullRate: number | null;
  sprint: number | null;
  hpTo1b: number | null;
  bolts: number | null;
  pitcherSbRate: number | null;
  catcherCs: number | null;
  catcherPop: number | null;
  catcherArm: number | null;
  catcherName: string | null;
  teamObp: number | null;
  pitcherVsHandHr9: number | null;
  pitcherVsHandHits9: number | null;
  pitcherVsHandK9: number | null;
  pitcherK9: number | null;
  pitcherWhip: number | null;
  pitcherXera: number | null;
};

export type BatterPick = {
  rank: number;
  playerId: number;
  name: string;
  teamId: number;
  teamAbbr: string;
  opponentAbbr: string;
  opponentId: number;
  gamePk: number;
  venueName: string;
  batSide: "L" | "R" | "S" | null;
  pitcherName: string | null;
  pitcherHand: "L" | "R" | "S" | null;
  lineupSlot: number;
  market: PropMarket;
  score: number;
  lean: Lean;
  impliedHr: number;
  hrPct: number;
  reasons: string[];
  factors: Factor[];
  season: BatterSeason;
  recent: {
    games: number;
    hr: number;
    avg: number;
    hits: number;
    pa: number;
    tb: number;
    rbi: number;
    runs: number;
    weekHr: number;
    weekPa: number;
    weekGames: number;
  } | null;
  flags: RecencyFlag[];
  reversePlatoon: boolean;
  opener: boolean;
  mixBarrel: number | null;
  mixXwoba: number | null;
  dmgMult: number;
  hrMult: number;
  gameState: string;
  weather: WeatherSnap | null;
  parkHrFactor: number;
  note: string | null;
  actual?: { hr: number; hits: number; tb: number; rbi: number; sb: number; k: number; runs: number; pa: number } | null;
  saber: SaberCard | null;
  vsPitches: PitchTypeRow[];
  matchup: PitchMatchup | null;
  edge: PropEdge | null;
  isHome: boolean;
  propLine: PropLine | null;
  inLineup: boolean;
  lineupStatus: LineupStatus;
};

export type SaberCard = {
  xba: number | null;
  xslg: number | null;
  xwoba: number | null;
  woba: number | null;
  wrcPlus: number | null;
  war: number | null;
  spd: number | null;
  barrels: number | null;
  barrelPct: number | null;
  barrelPa: number | null;
  evAvg: number | null;
  evMax: number | null;
  launch: number | null;
  hardHit: number | null;
  sweetSpot: number | null;
};

export type SaberRow = {
  playerId: number;
  name: string;
  teamAbbr: string;
  opponentAbbr: string;
  gamePk: number;
  slg: number;
  avg: number;
  iso: number;
  hr: number;
  pa: number;
  hrScore: number;
  venueName: string;
  pitcherName: string | null;
  saber: SaberCard;
  vsPitches: PitchTypeRow[];
  matchup: PitchMatchup | null;
  edge: PropEdge | null;
};

export type BatterSeason = {
  pa: number;
  ab: number;
  hr: number;
  hits: number;
  avg: number;
  obp: number;
  slg: number;
  iso: number;
  ops: number;
  rbi: number;
  runs: number;
  sb: number;
  k: number;
  tb: number;
  babip: number;
  abPerHr: number;
};

export type PitcherPick = {
  rank: number;
  playerId: number;
  name: string;
  teamId: number;
  teamAbbr: string;
  opponentAbbr: string;
  gamePk: number;
  venueName: string;
  hand: "L" | "R" | "S" | null;
  market: "k";
  score: number;
  lean: Lean;
  reasons: string[];
  factors: Factor[];
  pitcher: PitcherCard;
  oppKRate: number;
  note: string | null;
  parkKFactor: number;
  propLine: PropLine | null;
  actualK?: number | null;
  gameState: string;
};

export type ArsenalCard = {
  playerId: number;
  name: string;
  teamAbbr: string;
  opponentAbbr: string;
  gamePk: number;
  venueName: string;
  pitcher: PitcherCard;
};

export type EdgeRow = {
  id: string;
  kind: EdgeKind;
  title: string;
  detail: string;
  score: number;
  market: PropMarket;
  playerId: number | null;
  name: string;
  teamAbbr: string;
  opponentAbbr: string;
  venueName: string;
  pitcherName: string | null;
};

export type LegResult = "hit" | "miss" | "dnp" | "pending";

export type SlipLeg = {
  playerId: number;
  name: string;
  teamAbbr: string;
  opponentAbbr: string;
  market: PropMarket;
  stat: string;
  line: number;
  side: "over" | "under";
  oddsType: OddsType;
  score: number;
  lean: Lean;
  reason: string;
  cover: number;
  lineupStatus?: LineupStatus;
  result?: LegResult;
  actual?: number | null;
};

export type SlipCard = {
  size: 2 | 3 | 6;
  title: string;
  date: string;
  confidence: number;
  lean: Lean;
  legs: SlipLeg[];
  notes: string;
};

export type AnalysisResult = {
  date: string;
  generatedAt: string;
  briefing: string | null;
  games: GameCard[];
  picks: {
    hr: BatterPick[];
    hits: BatterPick[];
    tb: BatterPick[];
    rbi: BatterPick[];
    sb: BatterPick[];
    k: PitcherPick[];
  };
  sources: string[];
  model: {
    name: string;
    version: string;
    notes: string[];
  };
  saberBoard: SaberRow[];
  arsenals: ArsenalCard[];
  edges: EdgeRow[];
  slips: SlipCard[];
  lineCount: number;
  grade: { hits: number; n: number; dnp: number; summary: string } | null;
};

export type SlateResult = {
  date: string;
  games: GameCard[];
  source: string;
};

export type GradedPublished = {
  date: string;
  slips: SlipCard[];
  grade: AnalysisResult["grade"];
  complete: boolean;
  live: number;
  finals: number;
  games: number;
};
