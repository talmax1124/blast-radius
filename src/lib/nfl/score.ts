/**
 * Red-Zone Mass (RZM). NFL touchdowns are a mixture, not one rate.
 *
 * Finish channel: short, high-probability chances (goal line, red zone).
 * Explosive channel: chunk plays from outside the 20.
 * Team mass is a shrunk per-game rate, scaled by opponent permeability,
 * a tanh script from the implied total, and a power on that total.
 * Player share is Dirichlet: real touches plus a rank prior.
 * Channel tilt is share-conserving — a short roster does not eat the team.
 * Anytime probability is Poisson, 1 − exp(−λ), after a calibration multiply.
 * Yards are lognormal. Receptions and multi-TD props are Poisson.
 */

export type Pos = "QB" | "RB" | "WR" | "TE";

export const RZM = {
  version: "1.3",
  name: "Red-Zone Mass",
  phi: 0.62,
  tauGames: 6,
  leaguePassTd: 1.55,
  leagueRushTd: 0.95,
  leaguePassYpa: 7.15,
  leagueYpc: 4.35,
  leagueYpr: 11.4,
  leagueCatch: 0.65,
  leaguePlays: 63,
  leaguePassRate: 0.575,
  leagueTeamPts: 22.5,
  rushFinishFrac: 0.62,
  recFinishFrac: 0.55,
  scriptRush: 0.2,
  scriptPass: -0.1,
  totalRushExp: 0.55,
  totalPassExp: 0.7,
  calib: 0.74,
  lambdaMax: 0.95,
  pseudoRush: 18,
  pseudoTgt: 16,
  pseudoPass: 36,
  ypaPseudo: 48,
  ypcPseudo: 22,
  yprPseudo: 10,
  catchPseudo: 14,
  intPseudo: 50,
  intRate: 0.022,
  gravityPseudo: 18,
  permLo: 0.82,
  permHi: 1.22,
  cvPass: 0.27,
  cvRush: 0.52,
  cvRecYd: 0.6,
  cvFantasyQb: 0.32,
  cvFantasySkill: 0.58,
} as const;

const RUSH_PRIOR: Record<Pos, number[]> = {
  RB: [0.48, 0.26, 0.12, 0.05],
  QB: [0.12, 0.03],
  WR: [0.04, 0.02],
  TE: [0.02, 0.01],
};

const TGT_PRIOR: Record<Pos, number[]> = {
  WR: [0.23, 0.17, 0.12, 0.07],
  TE: [0.16, 0.07, 0.03],
  RB: [0.13, 0.07, 0.03],
  QB: [0.02, 0.01],
};

const PASS_PRIOR = [0.92, 0.06, 0.02];

export type WeekLine = {
  passAtt: number;
  passYd: number;
  passTd: number;
  ints: number;
  rushAtt: number;
  rushYd: number;
  rushTd: number;
  tgt: number;
  rec: number;
  recYd: number;
  recTd: number;
};

export type RosterPlayer = {
  id: string;
  name: string;
  pos: Pos;
  espnId: number | null;
  team: string;
  opp: string;
  line: WeekLine;
  games: number;
  injury: number;
};

export type GameMass = {
  rushTd: number;
  passTd: number;
  passAtt: number;
  rushAtt: number;
  ypaFactor: number;
  ypcFactor: number;
  permPass: number;
  permRush: number;
};

export type SlateEnv = {
  team: string;
  opp: string;
  implied: number;
  script: number;
  fromBook: boolean;
};

export type ScoredPlayer = {
  id: string;
  name: string;
  pos: Pos;
  espnId: number | null;
  team: string;
  opp: string;
  lambda: number;
  pTd: number;
  lambdaFinish: number;
  lambdaExplosive: number;
  gravity: number;
  rushShare: number;
  tgtShare: number;
  passShare: number;
  expPassAtt: number;
  expPassYd: number;
  expPassTd: number;
  expInt: number;
  expRushAtt: number;
  expRushYd: number;
  expRushTd: number;
  expTargets: number;
  expRec: number;
  expRecYd: number;
  expRecTd: number;
  expFantasy: number;
  implied: number;
  script: number;
  fromBook: boolean;
  permPass: number;
  permRush: number;
  reasons: string[];
};

export function emptyLine(): WeekLine {
  return {
    passAtt: 0,
    passYd: 0,
    passTd: 0,
    ints: 0,
    rushAtt: 0,
    rushYd: 0,
    rushTd: 0,
    tgt: 0,
    rec: 0,
    recYd: 0,
    recTd: 0,
  };
}

export function addLine(into: WeekLine, line: WeekLine, w = 1): void {
  into.passAtt += line.passAtt * w;
  into.passYd += line.passYd * w;
  into.passTd += line.passTd * w;
  into.ints += line.ints * w;
  into.rushAtt += line.rushAtt * w;
  into.rushYd += line.rushYd * w;
  into.rushTd += line.rushTd * w;
  into.tgt += line.tgt * w;
  into.rec += line.rec * w;
  into.recYd += line.recYd * w;
  into.recTd += line.recTd * w;
}

export function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export function sigmoid(x: number): number {
  if (x > 12) return 1;
  if (x < -12) return 0;
  return 1 / (1 + Math.exp(-x));
}

export function weekWeight(week: number, latest: number, phi = RZM.phi): number {
  return phi ** Math.max(0, latest - week);
}

export function normCdf(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const az = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * az);
  const d = 0.3989422804014327 * Math.exp((-az * az) / 2);
  const p =
    d *
    t *
    (0.319381530 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const lo = clamp(p, 0, 1);
  return z >= 0 ? 1 - lo : lo;
}

export function shrunkRate(weightedSum: number, weight: number, leaguePerGame: number, tau = RZM.tauGames): number {
  if (weight <= 0) return leaguePerGame;
  return (weightedSum + leaguePerGame * tau) / (weight + tau);
}

export function permRatio(allowedWeightedSum: number, weight: number, leaguePerGame: number): number {
  const rate = shrunkRate(allowedWeightedSum, weight, leaguePerGame);
  return clamp(rate / leaguePerGame, RZM.permLo, RZM.permHi);
}

export function impliedPoints(input: {
  spread: number | null;
  total: number | null;
  pointsFor: number;
  games: number;
  oppPointsAllowed: number;
  oppGames: number;
  home: boolean;
  neutral: boolean;
}): { implied: number; script: number; fromBook: boolean } {
  if (input.spread != null && input.total != null && input.total > 20) {
    const implied = input.total / 2 - input.spread / 2;
    return { implied, script: (implied - RZM.leagueTeamPts) / 6.5, fromBook: true };
  }
  const pf = (input.pointsFor + RZM.leagueTeamPts * RZM.tauGames) / (Math.max(0, input.games) + RZM.tauGames);
  const allowed =
    (input.oppPointsAllowed + RZM.leagueTeamPts * RZM.tauGames) /
    (Math.max(0, input.oppGames) + RZM.tauGames);
  let implied = 0.55 * pf + 0.45 * allowed;
  if (input.home && !input.neutral) implied += 1.1;
  return { implied, script: (implied - RZM.leagueTeamPts) / 6.5, fromBook: false };
}

export function teamMass(
  off: WeekLine,
  offWeight: number,
  permPass: number,
  permRush: number,
  ypaFactor: number,
  ypcFactor: number,
  env: { implied: number; script: number },
): GameMass {
  const s = Math.tanh(env.script);
  const tot = Math.max(0.6, env.implied / RZM.leagueTeamPts);
  const rushTd =
    shrunkRate(off.rushTd, offWeight, RZM.leagueRushTd) *
    permRush *
    (1 + RZM.scriptRush * s) *
    tot ** RZM.totalRushExp;
  const passTd =
    shrunkRate(off.passTd, offWeight, RZM.leaguePassTd) *
    permPass *
    (1 + RZM.scriptPass * s) *
    tot ** RZM.totalPassExp;
  const playsW = off.passAtt + off.rushAtt;
  const plays = shrunkRate(playsW, offWeight, RZM.leaguePlays) * tot ** 0.22;
  const passShare = (off.passAtt + RZM.leaguePassRate * 40) / (playsW + 40);
  const passAtt = plays * passShare * (1 - 0.06 * s);
  const rushAtt = plays * (1 - passShare) * (1 + 0.08 * s);
  return {
    rushTd,
    passTd,
    passAtt,
    rushAtt,
    ypaFactor: clamp(ypaFactor, 0.84, 1.18),
    ypcFactor: clamp(ypcFactor, 0.84, 1.18),
    permPass,
    permRush,
  };
}

export function finishGravity(pos: Pos, line: WeekLine): number {
  const gRush = rushGravity(line.rushYd, line.rushAtt, line.rushTd);
  const gRec = recGravity(line.recYd, line.rec, line.tgt, line.recTd);
  const wR = line.rushAtt;
  const wC = line.tgt;
  if (wR + wC < 1) {
    if (pos === "RB") return 0.62;
    if (pos === "QB") return 0.7;
    if (pos === "TE") return 0.58;
    return 0.46;
  }
  return (gRush * wR + gRec * wC) / (wR + wC);
}

function rushGravity(yd: number, att: number, td: number): number {
  if (att < 4) return 0.6;
  const ypc = yd / att;
  const tdpt = td / att;
  const z = 1.7 * (tdpt / 0.04 - 1) - 0.85 * (ypc / RZM.leagueYpc - 1);
  return sigmoid(z);
}

function recGravity(yd: number, rec: number, tgt: number, td: number): number {
  if (tgt < 3) return 0.5;
  const ypr = rec > 0 ? yd / rec : RZM.leagueYpr;
  const tdpt = td / tgt;
  const z = 1.6 * (tdpt / 0.055 - 1) - 0.7 * (ypr / RZM.leagueYpr - 1);
  return sigmoid(z);
}

export function shrinkGravity(g: number, touches: number, pos: Pos): number {
  const prior = pos === "RB" || pos === "QB" ? 0.64 : pos === "TE" ? 0.58 : 0.46;
  const k = RZM.gravityPseudo;
  return (g * Math.max(0, touches) + prior * k) / (Math.max(0, touches) + k);
}

function priorAt(table: number[], index: number): number {
  if (!table.length) return 0.02;
  return table[Math.min(Math.max(0, index), table.length - 1)] ?? 0.02;
}

function dirichlet(stat: number, teamStat: number, prior: number, pseudo: number): number {
  return (Math.max(0, stat) + pseudo * prior) / (Math.max(0, teamStat) + pseudo);
}

function conservedMix(
  shares: number[],
  finishScore: number[],
  explosiveScore: number[],
  finishFrac: number,
): { mix: number[]; finish: number[] } {
  const shareSum = shares.reduce((a, b) => a + b, 0);
  if (shareSum <= 0) return { mix: shares.map(() => 0), finish: shares.map(() => 0) };
  const avgF = shares.reduce((a, s, i) => a + s * (finishScore[i] ?? 0), 0) / shareSum || 1;
  const avgX = shares.reduce((a, s, i) => a + s * (explosiveScore[i] ?? 0), 0) / shareSum || 1;
  const mix: number[] = [];
  const finish: number[] = [];
  shares.forEach((s, i) => {
    const f = (finishScore[i] ?? 0) / avgF;
    const x = (explosiveScore[i] ?? 0) / avgX;
    finish.push(s * finishFrac * f);
    mix.push(s * (finishFrac * f + (1 - finishFrac) * x));
  });
  return { mix, finish };
}

export function fantasyPoints(p: {
  passYd: number;
  passTd: number;
  ints: number;
  rushYd: number;
  rushTd: number;
  rec: number;
  recYd: number;
  recTd: number;
}): number {
  return (
    0.04 * p.passYd +
    4 * p.passTd -
    p.ints +
    0.1 * p.rushYd +
    6 * p.rushTd +
    p.rec +
    0.1 * p.recYd +
    6 * p.recTd
  );
}

export function lognormalSurv(mean: number, cv: number, line: number): number {
  if (!(mean > 0) || !(cv > 0)) return line <= 0 ? 1 : 0;
  if (line <= 0) return 1;
  const s2 = Math.log(1 + cv * cv);
  const mu = Math.log(mean) - 0.5 * s2;
  const sig = Math.sqrt(s2);
  const z = (Math.log(line) - mu) / sig;
  return clamp(1 - normCdf(z), 0.01, 0.99);
}

export function poissonGe(k: number, mu: number): number {
  if (k <= 0) return 1;
  if (!(mu > 0)) return 0;
  const kk = Math.floor(k);
  let term = Math.exp(-mu);
  let cdf = term;
  for (let i = 1; i < kk; i++) {
    term *= mu / i;
    cdf += term;
    if (cdf >= 1) return 0;
  }
  return clamp(1 - cdf, 0, 0.99);
}

export function coverOver(mean: number, line: number, kind: "yards" | "count" | "td", cv = 0.4): number {
  if (kind === "yards") return lognormalSurv(mean, cv, line);
  const need = Math.floor(line) + 1;
  if (kind === "td" && need <= 1) return clamp(1 - Math.exp(-Math.max(0, mean)), 0, 0.99);
  return poissonGe(need, mean);
}

export function projectRoster(players: RosterPlayer[], teamLine: WeekLine, mass: GameMass, env: SlateEnv): ScoredPlayer[] {
  const byPos = (pos: Pos, stat: (p: RosterPlayer) => number) =>
    players.filter((p) => p.pos === pos).sort((a, b) => stat(b) - stat(a));
  const rushRank = new Map<string, number>();
  for (const pos of ["RB", "QB", "WR", "TE"] as Pos[]) {
    byPos(pos, (p) => p.line.rushAtt).forEach((p, i) => rushRank.set(p.id, i));
  }
  const tgtRank = new Map<string, number>();
  for (const pos of ["WR", "TE", "RB", "QB"] as Pos[]) {
    byPos(pos, (p) => p.line.tgt).forEach((p, i) => tgtRank.set(p.id, i));
  }
  const qbs = byPos("QB", (p) => p.line.passAtt);
  const passRank = new Map(qbs.map((p, i) => [p.id, i]));

  const drafts = players.map((p) => {
    const rushPrior = priorAt(RUSH_PRIOR[p.pos], rushRank.get(p.id) ?? 9);
    const tgtPrior = priorAt(TGT_PRIOR[p.pos], tgtRank.get(p.id) ?? 9);
    const passPrior = p.pos === "QB" ? priorAt(PASS_PRIOR, passRank.get(p.id) ?? 9) : 0;
    const rushShare = dirichlet(p.line.rushAtt, teamLine.rushAtt, rushPrior, RZM.pseudoRush);
    const tgtShare = dirichlet(p.line.tgt, teamLine.tgt, tgtPrior, RZM.pseudoTgt);
    const passShare = p.pos === "QB" ? dirichlet(p.line.passAtt, teamLine.passAtt, passPrior, RZM.pseudoPass) : 0;
    const g = shrinkGravity(finishGravity(p.pos, p.line), p.line.rushAtt + p.line.tgt, p.pos);
    const ypc = (p.line.rushYd + RZM.leagueYpc * RZM.ypcPseudo) / (p.line.rushAtt + RZM.ypcPseudo);
    const ypr = (p.line.recYd + RZM.leagueYpr * RZM.yprPseudo) / (p.line.rec + RZM.yprPseudo);
    return { p, rushShare, tgtShare, passShare, g, ypc, ypr };
  });

  const rushMix = conservedMix(
    drafts.map((d) => d.rushShare),
    drafts.map((d) => 0.35 + 0.65 * d.g),
    drafts.map((d) => (0.35 + 0.65 * (1 - d.g)) * clamp(d.ypc / RZM.leagueYpc, 0.65, 1.7)),
    RZM.rushFinishFrac,
  );
  const recMix = conservedMix(
    drafts.map((d) => d.tgtShare),
    drafts.map((d) => 0.4 + 0.6 * d.g),
    drafts.map((d) => (0.4 + 0.6 * (1 - d.g)) * clamp(d.ypr / RZM.leagueYpr, 0.7, 1.8)),
    RZM.recFinishFrac,
  );

  return drafts.map((d, i) => {
    const { p } = d;
    const inj = clamp(p.injury, 0, 1);
    const rawRush = mass.rushTd * (rushMix.mix[i] ?? 0);
    const rawRec = mass.passTd * (recMix.mix[i] ?? 0);
    let expRushTd = rawRush * RZM.calib * inj;
    let expRecTd = rawRec * RZM.calib * inj;
    let lambda = expRushTd + expRecTd;
    if (lambda > RZM.lambdaMax && lambda > 0) {
      const scale = RZM.lambdaMax / lambda;
      expRushTd *= scale;
      expRecTd *= scale;
      lambda = RZM.lambdaMax;
    }
    const finishScale = rawRush + rawRec > 0 ? lambda / (rawRush + rawRec) : 0;
    const lambdaFinish =
      (mass.rushTd * (rushMix.finish[i] ?? 0) + mass.passTd * (recMix.finish[i] ?? 0)) * finishScale;
    const lambdaExplosive = Math.max(0, lambda - lambdaFinish);

    const ypa = (p.line.passYd + RZM.leaguePassYpa * RZM.ypaPseudo) / (p.line.passAtt + RZM.ypaPseudo);
    const expPassAtt = mass.passAtt * d.passShare * inj;
    const expPassYd = expPassAtt * ypa * mass.ypaFactor;
    const expPassTd = mass.passTd * d.passShare * RZM.calib * inj;
    const intRate = (p.line.ints + RZM.intRate * RZM.intPseudo) / (p.line.passAtt + RZM.intPseudo);
    const expInt = expPassAtt * intRate;
    const expRushAtt = mass.rushAtt * d.rushShare * inj;
    const expRushYd = expRushAtt * d.ypc * mass.ypcFactor;
    const catchR = (p.line.rec + RZM.leagueCatch * RZM.catchPseudo) / (p.line.tgt + RZM.catchPseudo);
    const expTargets = mass.passAtt * d.tgtShare * inj;
    const expRec = expTargets * catchR;
    const expRecYd = expRec * d.ypr * mass.ypaFactor;
    const expFantasy = fantasyPoints({
      passYd: expPassYd,
      passTd: expPassTd,
      ints: expInt,
      rushYd: expRushYd,
      rushTd: expRushTd,
      rec: expRec,
      recYd: expRecYd,
      recTd: expRecTd,
    });

    const reasons: string[] = [];
    if (d.g >= 0.62) reasons.push(`Finish gravity ${d.g.toFixed(2)} — scores on short touches`);
    else if (d.g <= 0.44) reasons.push(`Explosive gravity ${d.g.toFixed(2)} — chunk yards, thin finish rate`);
    else reasons.push(`Split gravity ${d.g.toFixed(2)}`);
    if (d.rushShare >= 0.12) reasons.push(`${Math.round(d.rushShare * 100)}% of team rushes`);
    if (d.tgtShare >= 0.1) reasons.push(`${Math.round(d.tgtShare * 100)}% of team targets`);
    if (p.pos === "QB" && d.passShare >= 0.4) reasons.push(`${Math.round(d.passShare * 100)}% of dropbacks`);
    reasons.push(
      env.fromBook
        ? `Implied ${env.implied.toFixed(1)}, script ${env.script >= 0 ? "+" : ""}${env.script.toFixed(2)}`
        : `No number up. Implied ${env.implied.toFixed(1)} from the first weeks`,
    );
    if (mass.permRush >= 1.06 && expRushTd >= expRecTd && expRushTd >= 0.08) {
      reasons.push(`Opp rush TDs ${mass.permRush.toFixed(2)}×`);
    } else if (mass.permPass >= 1.06 && expRecTd > expRushTd) {
      reasons.push(`Opp pass TDs ${mass.permPass.toFixed(2)}×`);
    }

    return {
      id: p.id,
      name: p.name,
      pos: p.pos,
      espnId: p.espnId,
      team: p.team,
      opp: p.opp,
      lambda,
      pTd: clamp(1 - Math.exp(-lambda), 0, 0.99),
      lambdaFinish,
      lambdaExplosive,
      gravity: d.g,
      rushShare: d.rushShare,
      tgtShare: d.tgtShare,
      passShare: d.passShare,
      expPassAtt,
      expPassYd,
      expPassTd,
      expInt,
      expRushAtt,
      expRushYd,
      expRushTd,
      expTargets,
      expRec,
      expRecYd,
      expRecTd,
      expFantasy,
      implied: env.implied,
      script: env.script,
      fromBook: env.fromBook,
      permPass: mass.permPass,
      permRush: mass.permRush,
      reasons,
    };
  });
}

function retune(p: ScoredPlayer): void {
  const td = Math.max(0, p.expRushTd) + Math.max(0, p.expRecTd);
  const capped = Math.min(td, RZM.lambdaMax);
  if (td > 0 && capped !== td) {
    const s = capped / td;
    p.expRushTd *= s;
    p.expRecTd *= s;
  }
  p.lambda = Math.max(0, p.expRushTd) + Math.max(0, p.expRecTd);
  p.pTd = clamp(1 - Math.exp(-p.lambda), 0, 0.99);
  const prev = p.lambdaFinish + p.lambdaExplosive;
  const finishShare = prev > 0 ? p.lambdaFinish / prev : p.gravity;
  p.lambdaFinish = p.lambda * finishShare;
  p.lambdaExplosive = Math.max(0, p.lambda - p.lambdaFinish);
  p.expFantasy = fantasyPoints({
    passYd: p.expPassYd,
    passTd: p.expPassTd,
    ints: p.expInt,
    rushYd: p.expRushYd,
    rushTd: p.expRushTd,
    rec: p.expRec,
    recYd: p.expRecYd,
    recTd: p.expRecTd,
  });
}

/**
 * A doubtful or questionable player keeps a play-probability slice.
 * The touches he is unlikely to see move to healthy teammates at the same position,
 * in proportion to their current share. Team volume is conserved.
 */
export function reseatAbsences(players: ScoredPlayer[], injury: Map<string, number>): ScoredPlayer[] {
  const next = players.map((p) => ({ ...p, reasons: [...p.reasons] }));
  for (const pos of ["WR", "TE", "RB"] as Pos[]) {
    const group = next.filter((p) => p.pos === pos);
    const healthy = group.filter((p) => (injury.get(p.id) ?? 1) >= 0.9);
    const gone = group.filter((p) => (injury.get(p.id) ?? 1) === 0);
    const hurt = group.filter((p) => {
      const inj = injury.get(p.id) ?? 1;
      return inj > 0 && inj < 0.9;
    });
    if ((!healthy.length && !gone.length) || (!hurt.length && !gone.length)) continue;
    let lostTargets = 0;
    let lostRec = 0;
    let lostYd = 0;
    let lostRecTd = 0;
    let lostRushAtt = 0;
    let lostRushYd = 0;
    let lostRushTd = 0;
    const names: string[] = [];
    for (const h of gone) {
      lostTargets += h.expTargets;
      lostRec += h.expRec;
      lostYd += h.expRecYd;
      lostRecTd += h.expRecTd;
      lostRushAtt += h.expRushAtt;
      lostRushYd += h.expRushYd;
      lostRushTd += h.expRushTd;
      names.push(h.name.split(" ").slice(-1)[0] ?? h.name);
      h.expTargets = 0;
      h.expRec = 0;
      h.expRecYd = 0;
      h.expRecTd = 0;
      h.expRushAtt = 0;
      h.expRushYd = 0;
      h.expRushTd = 0;
      h.expPassAtt = 0;
      h.expPassYd = 0;
      h.expPassTd = 0;
      h.expInt = 0;
      retune(h);
    }
    for (const h of hurt) {
      const inj = injury.get(h.id) ?? 1;
      const miss = (1 - inj) / inj;
      lostTargets += h.expTargets * miss;
      lostRec += h.expRec * miss;
      lostYd += h.expRecYd * miss;
      lostRecTd += h.expRecTd * miss;
      lostRushAtt += h.expRushAtt * miss;
      lostRushYd += h.expRushYd * miss;
      lostRushTd += h.expRushTd * miss;
      names.push(h.name.split(" ").slice(-1)[0] ?? h.name);
    }
    if (!healthy.length) continue;
    const weights = healthy.map((p) => Math.max(0, pos === "RB" ? p.rushShare : p.tgtShare));
    let sum = weights.reduce((a, b) => a + b, 0);
    if (sum <= 0) {
      weights.forEach((_, i) => {
        weights[i] = 1;
      });
      sum = weights.length;
    }
    healthy.forEach((p, i) => {
      const f = (weights[i] ?? 0) / sum;
      p.expTargets += lostTargets * f;
      p.expRec += lostRec * f;
      p.expRecYd += lostYd * f;
      p.expRecTd += lostRecTd * f;
      if (pos === "RB") {
        p.expRushAtt += lostRushAtt * f;
        p.expRushYd += lostRushYd * f;
        p.expRushTd += lostRushTd * f;
      }
      retune(p);
      if (lostYd + lostRushYd > 8) {
        p.reasons.unshift(`Vacated work from ${names.join(", ")}`);
      }
    });
  }
  return next;
}

/** Thin air. Yards and passing touchdowns only — rush volume is unchanged. */
export function applyAir(players: ScoredPlayer[], yards = 1, passTd = 1): ScoredPlayer[] {
  if (yards === 1 && passTd === 1) return players;
  return players.map((p) => {
    const next = { ...p, reasons: [...p.reasons] };
    next.expPassYd *= yards;
    next.expRecYd *= yards;
    next.expPassTd *= passTd;
    retune(next);
    return next;
  });
}

/**
 * A depth or injured player who did not earn a rank prior.
 * Share is his real touches over the team, nothing invented.
 */
export function usageShell(p: RosterPlayer, teamLine: WeekLine, mass: GameMass, env: SlateEnv): ScoredPlayer {
  const inj = clamp(p.injury, 0, 1);
  const tgtShare = teamLine.tgt > 0 ? Math.max(0, p.line.tgt) / teamLine.tgt : 0;
  const rushShare = teamLine.rushAtt > 0 ? Math.max(0, p.line.rushAtt) / teamLine.rushAtt : 0;
  const ypc = (p.line.rushYd + RZM.leagueYpc * RZM.ypcPseudo) / (p.line.rushAtt + RZM.ypcPseudo);
  const ypr = (p.line.recYd + RZM.leagueYpr * RZM.yprPseudo) / (Math.max(0, p.line.rec) + RZM.yprPseudo);
  const catchR = (p.line.rec + RZM.leagueCatch * RZM.catchPseudo) / (p.line.tgt + RZM.catchPseudo);
  const g = shrinkGravity(finishGravity(p.pos, p.line), p.line.rushAtt + p.line.tgt, p.pos);
  const expTargets = mass.passAtt * tgtShare * inj;
  const expRec = expTargets * catchR;
  const expRecYd = expRec * ypr * mass.ypaFactor;
  const expRushAtt = mass.rushAtt * rushShare * inj;
  const expRushYd = expRushAtt * ypc * mass.ypcFactor;
  const expRecTd = mass.passTd * tgtShare * RZM.calib * inj;
  const expRushTd = mass.rushTd * rushShare * RZM.calib * inj;
  const row: ScoredPlayer = {
    id: p.id,
    name: p.name,
    pos: p.pos,
    espnId: p.espnId,
    team: p.team,
    opp: p.opp,
    lambda: 0,
    pTd: 0,
    lambdaFinish: 0,
    lambdaExplosive: 0,
    gravity: g,
    rushShare,
    tgtShare,
    passShare: 0,
    expPassAtt: 0,
    expPassYd: 0,
    expPassTd: 0,
    expInt: 0,
    expRushAtt,
    expRushYd,
    expRushTd,
    expTargets,
    expRec,
    expRecYd,
    expRecTd,
    expFantasy: 0,
    implied: env.implied,
    script: env.script,
    fromBook: env.fromBook,
    permPass: mass.permPass,
    permRush: mass.permRush,
    reasons: [],
  };
  retune(row);
  return row;
}

