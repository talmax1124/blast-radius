import type { NflGameIn, NflGameState } from "./nfl.ts";
import type { PlayEvent } from "./nba-pbp.ts";
import { makeRng, type Rng } from "./rng.ts";

/**
 * An NFL game played snap by snap.
 *
 * Teams trade drives from their own 25 (or wherever the last drive left them) until the clock runs out.
 * Each snap is a pass or a run, chosen by the team's projected mix and the game state: long yardage
 * and a deficit throw more, a lead late runs more. A pass can be a sack, an interception, an incompletion
 * or a catch by a target picked by share, gaining yards a catch at a time; a run goes to a carrier
 * picked by share. Fourth downs punt, kick or go for it by field position. Shares and efficiency are tuned
 * per game so many games average each player's projection and each team's market-implied points,
 * and each game draws a form for each offense so scores spread like real ones.
 */

const PLAY = { sack: 0.065, sackYards: 7, interception: 0.022, fumble: 0.008, xp: 0.95, punt: 43, runClock: 38, passClock: 28, incClock: 7 } as const;
const GAME_SECONDS = 3600;

type Tune = { target: Float64Array; carry: Float64Array; passEff: [number, number]; runEff: [number, number]; passRate: [number, number] };
const tunes = new WeakMap<NflGameIn, Tune>();
const fulls = new WeakMap<NflGameIn, NflGameIn>();

/** Targets and carries the listed players do not cover go to a depth player per side, so shares stay honest. */
function withDepth(game: NflGameIn): NflGameIn {
  const cached = fulls.get(game);
  if (cached) return cached;
  const players = [...game.players];
  for (const team of [game.away, game.home]) {
    const mine = game.players.filter((p) => p.team === team);
    const att = mine.reduce((a, p) => a + (p.passAtt ?? 0), 0) || 33;
    const targets = mine.reduce((a, p) => a + (p.targets ?? 0), 0);
    const carries = mine.reduce((a, p) => a + (p.rushAtt ?? 0), 0);
    const spareT = Math.max(0, att * 0.93 - targets);
    const spareC = Math.max(0, 26 - carries);
    if (spareT > 0.5 || spareC > 0.5) {
      players.push({ name: `${team} depth`, team, pos: "WR", targets: spareT, rec: spareT * 0.62, recYd: spareT * 6.8, recTd: spareT * 0.03, rushAtt: spareC, rushYd: spareC * 4.1, rushTd: spareC * 0.025 });
    }
  }
  const full = { ...game, players };
  fulls.set(game, full);
  return full;
}

function teamOf(game: NflGameIn, side: 0 | 1): string {
  return side === 1 ? game.home : game.away;
}

function baseTune(game: NflGameIn): Tune {
  const n = game.players.length;
  const t: Tune = { target: new Float64Array(n), carry: new Float64Array(n), passEff: [1, 1], runEff: [1, 1], passRate: [0.58, 0.58] };
  game.players.forEach((p, i) => {
    t.target[i] = p.targets ?? 0;
    t.carry[i] = p.rushAtt ?? 0;
  });
  for (const side of [0, 1] as const) {
    const mine = game.players.filter((p) => p.team === teamOf(game, side));
    const att = mine.reduce((a, p) => a + (p.passAtt ?? 0), 0) || mine.reduce((a, p) => a + (p.targets ?? 0), 0) / 0.93;
    const rush = mine.reduce((a, p) => a + (p.rushAtt ?? 0), 0);
    t.passRate[side] = att + rush > 0 ? att / (att + rush) : 0.58;
  }
  return t;
}

type Scratch = NflGameState;
function emptyState(n: number): Scratch {
  const a = () => new Float64Array(n);
  return { homePts: 0, awayPts: 0, stat: { passYd: a(), passTd: a(), rushAtt: a(), rushYd: a(), rushTd: a(), targets: a(), rec: a(), recYd: a(), recTd: a() } };
}

function tuneOf(game: NflGameIn): Tune {
  const cached = tunes.get(game);
  if (cached) return cached;
  const t = baseTune(game);
  const rng = makeRng(23);
  const n = game.players.length;
  const st = emptyState(n);
  const homeEdge = -game.spread;
  const wantPts = [(game.total - homeEdge) / 2, (game.total + homeEdge) / 2];
  for (let round = 0; round < 9; round++) {
    const games = 400;
    const sum = { targets: new Float64Array(n), rushAtt: new Float64Array(n), rec: new Float64Array(n), recYd: new Float64Array(n), rushYd: new Float64Array(n) };
    const pts = [0, 0];
    for (let g = 0; g < games; g++) {
      play(game, t, rng, st, null, true);
      pts[0] += st.awayPts;
      pts[1] += st.homePts;
      for (let i = 0; i < n; i++) for (const k of Object.keys(sum) as (keyof typeof sum)[]) sum[k][i] += st.stat[k][i];
    }
    const step = (want: number, got: number, k = 0.8) => Math.pow(Math.max(0.05, want) / Math.max(0.05, got / games), k);
    game.players.forEach((p, i) => {
      if ((p.targets ?? 0) > 0) t.target[i] *= step(p.targets ?? 0, sum.targets[i]);
      if ((p.rushAtt ?? 0) > 0) t.carry[i] *= step(p.rushAtt ?? 0, sum.rushAtt[i]);
    });
    for (const side of [0, 1] as const) {
      const mine = game.players.map((p, i) => [p, i] as const).filter(([p]) => p.team === teamOf(game, side));
      const wantRecYd = mine.reduce((a, [p]) => a + (p.recYd ?? 0), 0);
      const gotRecYd = mine.reduce((a, [, i]) => a + sum.recYd[i], 0);
      const wantRushYd = mine.reduce((a, [p]) => a + (p.rushYd ?? 0), 0);
      const gotRushYd = mine.reduce((a, [, i]) => a + sum.rushYd[i], 0);
      // Yards follow each player's projection; points follow the market. Both pull on efficiency.
      const ptsPull = step(wantPts[side], pts[side], 1);
      t.passEff[side] = clamp(t.passEff[side] * Math.pow(step(wantRecYd, gotRecYd, 1), 0.25) * Math.pow(ptsPull, 0.8), 0.4, 2.5);
      t.runEff[side] = clamp(t.runEff[side] * Math.pow(step(wantRushYd, gotRushYd, 1), 0.25) * Math.pow(ptsPull, 0.8), 0.4, 2.5);
      // The team's mix: projected targets against projected carries, as volume, not just share.
      const wantT = mine.reduce((a, [p]) => a + (p.targets ?? 0), 0);
      const gotT = mine.reduce((a, [, i]) => a + sum.targets[i], 0) / games;
      const wantC = mine.reduce((a, [p]) => a + (p.rushAtt ?? 0), 0);
      const gotC = mine.reduce((a, [, i]) => a + sum.rushAtt[i], 0) / games;
      if (wantT > 0 && wantC > 0 && gotT > 0 && gotC > 0) {
        const odds = (t.passRate[side] / (1 - t.passRate[side])) * Math.pow((wantT / gotT) / (wantC / gotC), 0.8);
        t.passRate[side] = clamp(odds / (1 + odds), 0.3, 0.8);
      }
    }
  }
  tunes.set(game, t);
  return t;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function pick(rng: Rng, idx: number[], w: Float64Array): number {
  let total = 0;
  for (const i of idx) total += w[i];
  if (!(total > 0)) return -1;
  let r = rng.next() * total;
  for (const i of idx) {
    r -= w[i];
    if (r <= 0) return i;
  }
  return idx[idx.length - 1];
}

function play(game: NflGameIn, t: Tune, rng: Rng, out: Scratch, log: PlayEvent[] | null, tuning = false): void {
  out.homePts = 0;
  out.awayPts = 0;
  for (const arr of Object.values(out.stat)) arr.fill(0);
  const side: number[][] = [[], []];
  game.players.forEach((p, i) => side[p.team === game.home ? 1 : 0].push(i));
  const qb = [0, 1].map((s) => side[s].find((i) => (game.players[i].passAtt ?? 0) > 0) ?? -1);
  // Tonight's form for each offense: the spread between good and bad days.
  const form = [0, 1].map(() => (tuning ? 1 : Math.exp(0.2 * rng.normal())));
  const score = [0, 0];
  let clock = GAME_SECONDS;
  let off: 0 | 1 = rng.next() < 0.5 ? 0 : 1;
  let spot = 25;
  const names = [game.away, game.home];
  const say = (kind: PlayEvent["kind"], text: string, team: number, player = -1, credit?: [number, string, number][]) => {
    if (!log) return;
    const period = Math.min(4, Math.floor((GAME_SECONDS - clock) / 900) + 1);
    log.push({ period, clock: Math.max(0, Math.round(clock - (4 - period) * 900)), team: names[team], text, away: score[0], home: score[1], player, kind, credit });
  };
  const nm = (i: number) => game.players[i]?.name ?? "Someone";
  const yardText = (s: number) => (s >= 50 ? `${names[1 - off]} ${100 - s}` : `${names[off]} ${s}`);
  // Who had the ball on the latest snap, and how: a touchdown goes to them.
  let lastBall = -1;
  let lastKind: "pass" | "run" = "run";

  while (clock > 0) {
    let down = 1;
    let toGo = 10;
    let plays = 0;
    say("drive", `${names[off]} ball at the ${yardText(spot)}`, off);
    let driveOver = false;
    while (!driveOver && clock > 0) {
      plays++;
      const lead = score[off] - score[1 - off];
      const late = clock < 900;
      let passP = t.passRate[off];
      if (toGo >= 7) passP += 0.15;
      if (toGo <= 2) passP -= 0.2;
      if (late && lead < -7) passP += 0.2;
      if (late && lead > 7) passP -= 0.2;
      passP = clamp(passP, 0.15, 0.92);

      if (down === 4) {
        const fgDist = 100 - spot + 17;
        if (spot >= 63 && fgDist <= 57) {
          const make = clamp(0.99 - 0.0135 * Math.max(0, fgDist - 22), 0.45, 0.99);
          clock -= 5;
          if (rng.next() < make) {
            score[off] += 3;
            say("fg", `${names[off]} kicks a ${fgDist}-yard field goal`, off);
          } else say("fg", `${names[off]} misses from ${fgDist}`, off);
          spot = 25;
          driveOver = true;
          break;
        }
        const goForIt = (toGo <= 2 && spot >= 45) || (late && lead < 0 && clock < 300);
        if (!goForIt) {
          const net = Math.round(PLAY.punt + 6 * rng.normal());
          clock -= 8;
          say("punt", `${names[off]} punts`, off);
          spot = clamp(100 - (spot + net), 5, 40);
          driveOver = true;
          break;
        }
      }

      let gain = 0;
      let turnover = false;
      lastBall = -1;
      if (rng.next() < passP) {
        const q = qb[off];
        if (rng.next() < PLAY.sack) {
          gain = clamp(-PLAY.sackYards + Math.round(2 * rng.normal()), -12, -1);
          clock -= PLAY.passClock;
          say("pass", `${q >= 0 ? nm(q) : names[off]} sacked for ${-gain}`, off, q);
        } else if (rng.next() < PLAY.interception) {
          turnover = true;
          clock -= PLAY.passClock;
          say("turnover", `${q >= 0 ? nm(q) : names[off]} intercepted`, off, q);
        } else {
          const who = pick(rng, side[off], t.target);
          if (who < 0) {
            clock -= PLAY.incClock;
          } else {
            const p = game.players[who];
            out.stat.targets[who] += 1;
            const rate = (p.targets ?? 0) > 0 ? clamp((p.rec ?? 0) / (p.targets ?? 1), 0.3, 0.92) : 0.6;
            if (rng.next() < rate) {
              const ypr = ((p.recYd ?? 0) / Math.max(0.1, p.rec ?? 0.1)) * t.passEff[off] * form[off];
              gain = Math.max(-3, Math.round(rng.lognormal(Math.max(2, ypr), 0.9)));
              gain = Math.min(gain, 100 - spot);
              out.stat.rec[who] += 1;
              out.stat.recYd[who] += gain;
              lastBall = who;
              lastKind = "pass";
              if (q >= 0) out.stat.passYd[q] += gain;
              clock -= PLAY.passClock;
              say("pass", `${q >= 0 ? nm(q) : names[off]} to ${nm(who)} for ${gain}`, off, who, [[who, "rec", 1], [who, "recYd", gain], ...(q >= 0 ? [[q, "passYd", gain] as [number, string, number]] : [])]);
            } else {
              clock -= PLAY.incClock;
              say("pass", `Incomplete, intended for ${nm(who)}`, off, who);
            }
          }
        }
      } else {
        const who = pick(rng, side[off], t.carry);
        if (who >= 0) {
          const p = game.players[who];
          const ypc = ((p.rushYd ?? 0) / Math.max(0.1, p.rushAtt ?? 0.1)) * t.runEff[off] * form[off];
          gain = Math.round(ypc - 1.5 + 4.2 * rng.normal());
          if (rng.next() < 0.025) gain += 12 + Math.round(40 * rng.next());
          gain = Math.min(Math.max(gain, -6), 100 - spot);
          out.stat.rushAtt[who] += 1;
          out.stat.rushYd[who] += gain;
          lastBall = who;
          lastKind = "run";
          if (rng.next() < PLAY.fumble) turnover = true;
          say("run", `${nm(who)} runs for ${gain}${turnover ? ", fumbles" : ""}`, off, who, [[who, "rushAtt", 1], [who, "rushYd", gain]]);
          clock -= PLAY.runClock;
          if (turnover) say("turnover", `${names[1 - off]} recovers`, 1 - off);
        }
      }

      if (turnover) {
        spot = clamp(100 - spot - gain, 5, 95);
        driveOver = true;
        break;
      }
      spot += gain;
      if (spot >= 100) {
        // Touchdown: credited to whoever had the ball on the scoring play.
        const scorer = lastBall;
        score[off] += 6;
        if (scorer >= 0) {
          if (lastKind === "pass") {
            out.stat.recTd[scorer] += 1;
            if (qb[off] >= 0) out.stat.passTd[qb[off]] += 1;
          } else out.stat.rushTd[scorer] += 1;
        }
        if (rng.next() < PLAY.xp) score[off] += 1;
        say("td", `Touchdown ${names[off]}${scorer >= 0 ? `, ${nm(scorer)}` : ""}`, off, scorer, scorer >= 0 ? [[scorer, "td", 1], ...(lastKind === "pass" && qb[off] >= 0 ? [[qb[off], "passTd", 1] as [number, string, number]] : [])] : undefined);
        spot = 25;
        driveOver = true;
        break;
      }
      if (spot <= 0) {
        score[1 - off] += 2;
        say("td", `Safety, ${names[1 - off]}`, 1 - off);
        spot = 25;
        driveOver = true;
        break;
      }
      toGo -= gain;
      if (toGo <= 0) {
        down = 1;
        toGo = Math.min(10, 100 - spot);
      } else {
        down++;
        if (down > 4) {
          say("turnover", `Turnover on downs`, off);
          spot = 100 - spot;
          driveOver = true;
          break;
        }
      }
      if (plays > 30) driveOver = true;
    }
    off = (1 - off) as 0 | 1;
  }
  out.awayPts = score[0];
  out.homePts = score[1];
  if (log) log.push({ period: 4, clock: 0, team: names[0], text: `Final: ${game.away} ${score[0]}, ${game.home} ${score[1]}`, away: score[0], home: score[1], player: -1, kind: "period" });
}

const scratches = new WeakMap<NflGameIn, Scratch>();

/** Fill a game state snap by snap. Same state shape as the fast engine. */
export function playNflPbp(game: NflGameIn, rng: Rng, out: NflGameState): void {
  const full = withDepth(game);
  let st = scratches.get(game);
  if (!st) {
    st = emptyState(full.players.length);
    scratches.set(game, st);
  }
  play(full, tuneOf(full), rng, st, null);
  out.homePts = st.homePts;
  out.awayPts = st.awayPts;
  for (const k of Object.keys(out.stat) as (keyof NflGameState["stat"])[]) out.stat[k].set(st.stat[k].subarray(0, game.players.length));
}

export function nflPlayByPlay(game: NflGameIn, seed: number): { state: NflGameState; events: PlayEvent[]; players: string[] } {
  const full = withDepth(game);
  const st = emptyState(full.players.length);
  const events: PlayEvent[] = [];
  play(full, tuneOf(full), makeRng(seed), st, events);
  return { state: st, events, players: full.players.map((p) => p.name) };
}
