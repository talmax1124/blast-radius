import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bayesHrPa,
  contactShape,
  fbVeloHr,
  hrDrought,
  isoHrPa,
  launchHrWindow,
  pitcherHrEnv,
  pullAirScore,
  recencyFlags,
  nightHrFit,
  hrClockFit,
  isNightSlate,
  scoreHomeRun,
  vsHandHrRate,
  expectedIpOf,
  expectedKOf,
  kRateOf,
  arsenalWhiff,
  scoreStrikeouts,
  type MatchupCtx,
} from "./score.ts";
import { parkHandHr } from "./parks.ts";
import type { BatterSeason, PitcherCard, SaberCard } from "./types.ts";

function season(over: Partial<BatterSeason> = {}): BatterSeason {
  return {
    pa: 500,
    ab: 440,
    hr: 35,
    hits: 120,
    avg: 0.27,
    obp: 0.35,
    slg: 0.52,
    iso: 0.25,
    ops: 0.87,
    rbi: 90,
    runs: 85,
    sb: 4,
    k: 130,
    tb: 230,
    babip: 0.3,
    abPerHr: 12.5,
    ...over,
  };
}

function pitcher(over: Partial<PitcherCard> = {}): PitcherCard {
  return {
    id: 1,
    name: "Soft Toss",
    hand: "R",
    era: 4.8,
    hr9: 1.55,
    k9: 7.4,
    whip: 1.38,
    hits9: 9.2,
    goAo: 0.85,
    ip: 140,
    hr: 24,
    k: 115,
    gamesStarted: 24,
    gamesPlayed: 24,
    opener: false,
    xera: 4.6,
    arsenal: [
      { code: "FF", name: "4-Seam", family: "heat", usage: 55, velo: 94, pitches: 800, pa: 200, slg: 0.48, xslg: 0.5, xba: 0.26, xwoba: 0.34, whiff: 18, kPct: 20, hardHit: 42, rv100: 0.4 },
      { code: "SL", name: "Slider", family: "break", usage: 30, velo: 85, pitches: 400, pa: 110, slg: 0.38, xslg: 0.4, xba: 0.2, xwoba: 0.28, whiff: 32, kPct: 28, hardHit: 30, rv100: -0.2 },
    ],
    vsL: null,
    vsR: null,
    sbRate: 0.01,
    recentK9: 7.2,
    recentIp: 5.5,
    bf: 580,
    recentK: 40,
    recentBf: 210,
    ...over,
  };
}

function saber(over: Partial<SaberCard> = {}): SaberCard {
  return {
    xba: 0.26,
    xslg: 0.54,
    xwoba: 0.36,
    woba: 0.35,
    wrcPlus: 140,
    war: 4,
    spd: 4,
    barrels: 40,
    barrelPct: 12,
    barrelPa: 8.2,
    evAvg: 92,
    evMax: 114,
    launch: 28,
    hardHit: 48,
    sweetSpot: 36,
    ...over,
  };
}

function ctx(over: Partial<MatchupCtx> = {}): MatchupCtx {
  return {
    pitcher: pitcher(),
    parkHr: 110,
    parkHits: 104,
    parkK: 96,
    parkSb: 100,
    weather: { tempF: 82, windMph: 10, windDir: 180, windLabel: "Wind out 10 mph", carry: 0.7 },
    lineupSlot: 3,
    platoon: 0.68,
    saber: saber(),
    vsPitches: [],
    isHome: true,
    edge: {
      vsHand: { avg: 0.29, slg: 0.56, ops: 0.9, iso: 0.27, hr: 12, pa: 180, k: 40, hits: 50 },
      vsHandCode: "vr",
      ha: { avg: 0.28, slg: 0.55, ops: 0.88, iso: 0.27, hr: 18, pa: 250, k: 60, hits: 70 },
      haCode: "h",
      fbRate: 32,
      gbRate: 38,
      ldRate: 22,
      pullRate: 46,
      sprint: 27,
      hpTo1b: 4.3,
      bolts: 1,
      pitcherSbRate: 0.01,
      catcherCs: 0.22,
      catcherPop: 1.95,
      catcherArm: 80,
      catcherName: "Catcher",
      teamObp: 0.33,
      pitcherVsHandHr9: 1.6,
      pitcherVsHandHits9: 9.1,
      pitcherVsHandK9: 7.2,
      pitcherK9: 7.4,
      pitcherWhip: 1.38,
      pitcherXera: 4.6,
      dn: { avg: 0.28, slg: 0.58, ops: 0.92, iso: 0.3, hr: 22, pa: 320, k: 80, hits: 85 },
      dnCode: "n",
    },
    flags: [],
    reverse: false,
    dayNight: "night",
    roof: "open",
    venueId: 2392,
    batSide: "L",
    ...over,
  };
}

describe("launchHrWindow", () => {
  it("peaks near 28 degrees", () => {
    assert.ok(launchHrWindow(28).score > launchHrWindow(12).score);
    assert.ok(launchHrWindow(28).score > launchHrWindow(40).score);
    assert.ok(launchHrWindow(28).score >= 0.95);
  });
});

describe("pullAirScore", () => {
  it("rewards pull-side fly balls", () => {
    const mash = pullAirScore(36, 48);
    const gb = pullAirScore(18, 32);
    assert.ok(mash.score > gb.score);
    assert.ok(mash.mult > gb.mult);
  });
});

describe("bayesHrPa", () => {
  it("does not treat a quiet week as zero power", () => {
    const s = season({ hr: 40, pa: 520 });
    const quiet = bayesHrPa(s, { hr: 0, pa: 24, games: 6 }, 0);
    const seasonOnly = bayesHrPa(s, null, null);
    assert.ok(quiet.rate >= seasonOnly.rate * 0.65, `quiet ${quiet.rate} vs season ${seasonOnly.rate}`);
    assert.ok(quiet.form > 0.3);
  });
});

describe("hrDrought", () => {
  it("needs a real sample, not 10 PA", () => {
    assert.equal(hrDrought({ hr: 0, pa: 12 }), false);
    assert.equal(hrDrought({ weekHr: 0, weekPa: 24 }), true);
  });
});

describe("scoreHomeRun", () => {
  it("ranks a barrel masher over a light bat", () => {
    const loud = scoreHomeRun(season(), 0.06, ctx(), { hr: 3, pa: 28, games: 7, avg: 0.32 });
    const light = scoreHomeRun(
      season({ hr: 8, pa: 480, slg: 0.38, iso: 0.12, avg: 0.26 }),
      0.01,
      ctx({
        saber: saber({ barrelPa: 2.1, xslg: 0.38, hardHit: 30, launch: 10, evAvg: 86, wrcPlus: 88 }),
        parkHr: 92,
        pitcher: pitcher({ hr9: 0.7, k9: 11.2, xera: 2.8, goAo: 1.6 }),
        edge: { ...ctx().edge!, fbRate: 16, pullRate: 32, pitcherVsHandHr9: 0.65, pitcherK9: 11.2, pitcherXera: 2.8 },
      }),
      { hr: 0, pa: 26, games: 7, avg: 0.22 },
    );
    assert.ok(loud.hrPct > light.hrPct, `loud ${loud.hrPct} vs light ${light.hrPct}`);
    assert.ok(loud.score > light.score, `loud ${loud.score} vs light ${light.score}`);
  });

  it("keeps a 40-HR bat playable after a quiet week", () => {
    const hot = scoreHomeRun(season({ hr: 42, pa: 510 }), 0.07, ctx(), { hr: 4, pa: 26, games: 6, avg: 0.34 });
    const quiet = scoreHomeRun(season({ hr: 42, pa: 510 }), 0, ctx({ flags: ["drought"] }), { hr: 0, pa: 24, games: 6, avg: 0.22 });
    assert.ok(quiet.hrPct > 0.12, `quiet P(HR) ${quiet.hrPct}`);
    assert.ok(quiet.score > 55, `quiet score ${quiet.score}`);
    assert.ok(hot.hrPct > quiet.hrPct);
  });

  it("puts slugger P(HR) in a live 12-38% band", () => {
    const r = scoreHomeRun(season(), 0.05, ctx(), { hr: 2, pa: 26, games: 6, avg: 0.3 });
    assert.ok(r.hrPct >= 0.12 && r.hrPct <= 0.4, `P(HR) ${r.hrPct}`);
    assert.ok(r.impliedHr >= 0.12 && r.impliedHr <= 0.5);
  });

  it("boosts Coors and launch-window contact", () => {
    const coors = scoreHomeRun(season(), 0.05, ctx({ parkHr: 118, venueId: 19 }), { hr: 2, pa: 24, games: 6, avg: 0.28 });
    const petco = scoreHomeRun(season(), 0.05, ctx({ parkHr: 88, venueId: 2680, weather: { tempF: 62, windMph: 12, windDir: 0, windLabel: "Wind in", carry: 0.28 } }), {
      hr: 2,
      pa: 24,
      games: 6,
      avg: 0.28,
    });
    assert.ok(coors.hrPct > petco.hrPct, `coors ${coors.hrPct} vs petco ${petco.hrPct}`);
  });

  it("marks a hot week without calling a 0-HR week thin", () => {
    const flags = recencyFlags(season(), { hr: 4, pa: 26, games: 6, avg: 0.36 });
    assert.ok(flags.includes("hot"));
    const cold = recencyFlags(season(), { hr: 0, pa: 26, games: 6, avg: 0.18 });
    assert.ok(cold.includes("drought"));
  });

  it("juices a lefty at Yankee Stadium over a righty", () => {
    const lhb = scoreHomeRun(season(), 0.05, ctx({ venueId: 3313, parkHr: 113, batSide: "L" }), { hr: 2, pa: 24, games: 6, avg: 0.28 });
    const rhb = scoreHomeRun(season(), 0.05, ctx({ venueId: 3313, parkHr: 113, batSide: "R" }), { hr: 2, pa: 24, games: 6, avg: 0.28 });
    assert.ok(lhb.hrPct > rhb.hrPct, `LHB ${lhb.hrPct} vs RHB ${rhb.hrPct}`);
  });

  it("ranks a fly-ball 1.6 HR/9 over a ground-ball 0.8", () => {
    const fly = scoreHomeRun(season(), 0.05, ctx({ pitcher: pitcher({ hr9: 1.65, goAo: 0.7 }) }), { hr: 2, pa: 24, games: 6, avg: 0.28 });
    const gb = scoreHomeRun(season(), 0.05, ctx({ pitcher: pitcher({ hr9: 0.75, goAo: 1.7, k9: 8.2, xera: 3.8 }) }), { hr: 2, pa: 24, games: 6, avg: 0.28 });
    assert.ok(fly.hrPct > gb.hrPct, `fly ${fly.hrPct} vs gb ${gb.hrPct}`);
  });
});

describe("parkHandHr", () => {
  it("adds LHB juice at Yankee Stadium", () => {
    assert.ok(parkHandHr(3313, "L", 113) > parkHandHr(3313, "R", 113));
  });
});

describe("pitcherHrEnv", () => {
  it("punishes ground-ball low-HR/9 more than fly-ball juice", () => {
    assert.ok(pitcherHrEnv(1.7, 0.65).score > pitcherHrEnv(0.7, 1.7).score);
  });
});

describe("isoHrPa", () => {
  it("maps ISO onto a HR/PA scale", () => {
    assert.ok(isoHrPa(0.25) > isoHrPa(0.12));
    assert.ok(isoHrPa(0.25) > 0.05 && isoHrPa(0.25) < 0.09);
  });
});

describe("fbVeloHr", () => {
  it("suppresses 98 mph heat vs 91", () => {
    const hard = fbVeloHr([{ code: "FF", name: "4-Seam", family: "heat", usage: 60, velo: 98, pitches: 800, pa: 200, slg: 0.4, xslg: 0.4, xba: 0.22, xwoba: 0.3, whiff: 22, kPct: 24, hardHit: 35, rv100: -0.1 }]);
    const soft = fbVeloHr([{ code: "FF", name: "4-Seam", family: "heat", usage: 60, velo: 91, pitches: 800, pa: 200, slg: 0.48, xslg: 0.5, xba: 0.26, xwoba: 0.34, whiff: 16, kPct: 18, hardHit: 42, rv100: 0.4 }]);
    assert.ok(soft.mult > hard.mult);
    assert.ok(hard.mult < 1);
  });
});

describe("vsHandHrRate", () => {
  it("needs 40 PA", () => {
    assert.equal(vsHandHrRate({ avg: 0.3, slg: 0.6, ops: 0.95, iso: 0.3, hr: 4, pa: 20, k: 6, hits: 8 }).rate, null);
    const split = vsHandHrRate({ avg: 0.28, slg: 0.58, ops: 0.92, iso: 0.3, hr: 18, pa: 200, k: 50, hits: 55 });
    assert.ok(split.rate != null && split.rate > 0.07);
  });
});

describe("contactShape", () => {
  it("rewards barrel + launch + pull-air", () => {
    assert.ok(contactShape({ barrel: 0.9, launch: 0.95, air: 0.85, hard: 0.8 }) > contactShape({ barrel: 0.2, launch: 0.2, air: 0.2, hard: 0.3 }));
  });
});

describe("nightHrFit", () => {
  it("boosts a night masher on a night slate and a day masher on a day slate", () => {
    const alvarez = { d: { avg: 0.27, slg: 0.52, ops: 0.87, iso: 0.24, hr: 9, pa: 206, k: 50, hits: 50 }, n: { avg: 0.32, slg: 0.64, ops: 0.98, iso: 0.31, hr: 31, pa: 449, k: 90, hits: 120 } };
    const night = nightHrFit({ dn: alvarez, dayNight: "night", seasonHrPa: 40 / 655 });
    const day = nightHrFit({ dn: alvarez, dayNight: "day", seasonHrPa: 40 / 655 });
    assert.ok(night.mult > day.mult, `night ${night.mult} vs day ${day.mult}`);
    assert.ok(night.mult > 1.05);
    assert.match(night.detail, /at night/);
  });

  it("does not trust a 29-PA burst", () => {
    const thin = nightHrFit({
      dn: { d: { avg: 0.3, slg: 0.5, ops: 0.85, iso: 0.2, hr: 0, pa: 6, k: 2, hits: 2 }, n: { avg: 0.4, slg: 0.73, ops: 1.1, iso: 0.46, hr: 4, pa: 29, k: 8, hits: 10 } },
      dayNight: "night",
      seasonHrPa: 0.04,
    });
    assert.equal(thin.rate, null);
    assert.ok(thin.mult <= 1.06);
  });

  it("lifts the league night slate when the split is missing", () => {
    const night = nightHrFit({ dayNight: "night", seasonHrPa: 0.05 });
    const day = nightHrFit({ dayNight: "day", seasonHrPa: 0.05 });
    assert.ok(night.mult > day.mult);
  });
});

describe("hrClockFit", () => {
  it("rewards a bat whose homers cluster around tonight's first pitch", () => {
    const hours = [19, 19, 20, 19, 21, 20, 19, 18, 20, 19, 13, 19];
    const late = hrClockFit(hours, 19);
    const noon = hrClockFit(hours, 13);
    assert.ok(late.mult > noon.mult, `late ${late.mult} vs noon ${noon.mult}`);
    assert.match(late.detail, /7pm ET/);
  });

  it("needs eight homers", () => {
    assert.equal(hrClockFit([19, 19, 20], 19).mult, 1);
  });
});

describe("isNightSlate", () => {
  it("treats 7pm as night and 1pm as day", () => {
    assert.equal(isNightSlate("night", 13), true);
    assert.equal(isNightSlate("day", 19), false);
    assert.equal(isNightSlate(undefined, 19), true);
    assert.equal(isNightSlate(undefined, 13), false);
  });
});

describe("scoreHomeRun night", () => {
  it("ranks the same bat higher at night when the night split is loud", () => {
    const dn = {
      d: { avg: 0.26, slg: 0.48, ops: 0.82, iso: 0.22, hr: 8, pa: 220, k: 60, hits: 50 },
      n: { avg: 0.3, slg: 0.62, ops: 0.97, iso: 0.32, hr: 28, pa: 410, k: 90, hits: 110 },
    };
    const night = scoreHomeRun(season(), 0.05, ctx({ dayNight: "night", dn, gameHour: 19 }), { hr: 2, pa: 24, games: 6, avg: 0.28 });
    const day = scoreHomeRun(season(), 0.05, ctx({ dayNight: "day", dn, gameHour: 13 }), { hr: 2, pa: 24, games: 6, avg: 0.28 });
    assert.ok(night.hrPct > day.hrPct, `night ${night.hrPct} vs day ${day.hrPct}`);
  });
});

describe("expectedIpOf", () => {
  it("does not turn a 4.9 IP/GS starter into a 6-inning outing", () => {
    const short = expectedIpOf(pitcher({ ip: 34.2, gamesStarted: 7, recentIp: 4.9 }));
    assert.ok(short < 5.3, `ip ${short}`);
  });

  it("lets a workhorse keep 6 IP", () => {
    const long = expectedIpOf(pitcher({ ip: 190, gamesStarted: 31, recentIp: 6.1, k9: 11, k: 228, bf: 722 }));
    assert.ok(long >= 5.7, `ip ${long}`);
  });
});

describe("expectedKOf", () => {
  it("prices a 31% K/BF ace over a contact starter", () => {
    const ace = expectedKOf(
      pitcher({ k9: 11.1, k: 228, bf: 722, ip: 184, gamesStarted: 31, recentK9: 12.1, recentIp: 6.1, recentK: 83, recentBf: 233, whip: 1.05 }),
      0.24,
      100,
    );
    const soft = expectedKOf(
      pitcher({ k9: 6.1, k: 84, bf: 513, ip: 124, gamesStarted: 17, recentK9: 5.5, recentIp: 6.5, recentK: 40, recentBf: 259, whip: 1.22 }),
      0.21,
      100,
    );
    assert.ok(ace.mean > soft.mean + 1.2, `ace ${ace.mean} vs soft ${soft.mean}`);
    assert.ok(ace.kPct > 0.28);
  });

  it("does not give a 5-IP 8.5 K/9 pitcher six expected Ks", () => {
    const p = expectedKOf(
      pitcher({ k9: 8.5, k: 90, bf: 380, ip: 95, gamesStarted: 19, recentK9: 8.2, recentIp: 5.0, recentK: 45, recentBf: 200, whip: 1.28 }),
      0.22,
      100,
    );
    assert.ok(p.mean < 5.6, `mean ${p.mean} ip ${p.ip}`);
  });
});

describe("scoreStrikeouts", () => {
  it("ranks Schlittler-type K/BF over a 6 K/9 innings-eater", () => {
    const loud = scoreStrikeouts(
      pitcher({ k9: 11.1, k: 228, bf: 722, ip: 184, gamesStarted: 31, recentK9: 12.1, recentIp: 6.1, recentK: 83, recentBf: 233, whip: 1.05, xera: 2.9 }),
      0.25,
      102,
    );
    const quiet = scoreStrikeouts(
      pitcher({ k9: 6.1, k: 84, bf: 513, ip: 124, gamesStarted: 17, recentK9: 5.5, recentIp: 6.5, recentK: 40, recentBf: 259, whip: 1.22, xera: 4.8 }),
      0.2,
      96,
    );
    assert.ok(loud.impliedK > quiet.impliedK, `loud ${loud.impliedK} vs quiet ${quiet.impliedK}`);
    assert.ok(loud.score > quiet.score);
  });
});

describe("kRateOf", () => {
  it("uses batters faced, not just K/9", () => {
    const r = kRateOf(pitcher({ k: 228, bf: 722, k9: 11.1, recentK: null, recentBf: null }));
    assert.ok(Math.abs(r.kPct - 228 / 722) < 0.03);
  });
});

describe("arsenalWhiff", () => {
  it("weights the mix, not only the primary", () => {
    const loud = arsenalWhiff([
      { code: "FF", name: "4-Seam", family: "heat", usage: 40, velo: 97, pitches: 800, pa: 200, slg: 0.4, xslg: 0.4, xba: 0.22, xwoba: 0.3, whiff: 22, kPct: 24, hardHit: 35, rv100: -0.1 },
      { code: "SL", name: "Slider", family: "break", usage: 35, velo: 86, pitches: 400, pa: 110, slg: 0.3, xslg: 0.32, xba: 0.18, xwoba: 0.25, whiff: 38, kPct: 32, hardHit: 28, rv100: -0.4 },
    ]);
    const dead = arsenalWhiff([
      { code: "SI", name: "Sinker", family: "heat", usage: 70, velo: 93, pitches: 800, pa: 200, slg: 0.45, xslg: 0.44, xba: 0.27, xwoba: 0.33, whiff: 14, kPct: 16, hardHit: 42, rv100: 0.3 },
    ]);
    assert.ok(loud.mult > dead.mult);
  });
});
