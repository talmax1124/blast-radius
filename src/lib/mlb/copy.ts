import { formatUnits, isSmash, payoutLabel, reportOf } from "./grade";
import { formatDeskDate } from "./parse";
import { HR_LOOKBACK, isSkipDay, type DeskLogEntry } from "./recap";
import type { SlipCard, SlipLeg } from "./types";

export type EditionCopy = {
  folioLeft: string;
  folioMid: string;
  folioRight: string;
  hed: string;
  deck: string;
  dateline: string;
  lede: string;
  nut: string;
};

function lastName(name: string): string {
  return name.split(" ").filter(Boolean).slice(-1)[0] ?? name;
}

function dayOfYear(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const start = Date.UTC(y, 0, 0);
  const now = Date.UTC(y, (m || 1) - 1, d || 1);
  return Math.max(1, Math.floor((now - start) / 86_400_000));
}

export function formatEditionDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

export function latestFinal(log: DeskLogEntry[]): DeskLogEntry | null {
  return log.find((e) => e.slips.length > 0 && e.grade && e.grade.n > 0) ?? null;
}

function smashLegs(slips: SlipCard[]): SlipLeg[] {
  return slips.flatMap((s) => s.legs).filter(isSmash);
}

function missLegs(slips: SlipCard[]): SlipLeg[] {
  return slips.flatMap((s) => s.legs).filter((l) => l.result === "miss");
}

function saturdayCopy(entry: DeskLogEntry, today: string, games: number): EditionCopy {
  const report = reportOf(entry.slips);
  const units = report.units ?? 2;
  return {
    folioLeft: `Vol. 2 · No. ${dayOfYear(today)}`,
    folioMid: "Home run desk",
    folioRight: formatEditionDate(today),
    hed: "Nine of eleven, and only plus two",
    deck: "A Power Play is not a batting average. Báez went 0-for-4. Milwaukee carried the Flex.",
    dateline: "DESK NOTES —",
    lede: `The desk cashed the two-man, lost the three-man, and flexed the six-man on Saturday. Ian Seymour struck out ten. Elly De La Cruz cleared 1.5 Hits+Runs+RBIs. That is a 3x. Then Joshua Báez put up a zero in Chicago and Core 3 was dead. Joc Pederson went 0-for-3; Garrett Mitchell and Jake Bauers smashed in a 13-run Milwaukee game, and the Flex paid 2x. The book is ${formatUnits(units)} on three slips staked.`,
    nut:
      games > 0
        ? `Tonight’s 2/3/6 is still open. ${games} games on the Eastern board. Home runs went 0-for-10 on Saturday — counting was the card.`
        : "Home runs went 0-for-10 on Saturday. Counting was the card.",
  };
}

export function editionCopy(opts: { date: string; log: DeskLogEntry[]; games: number }): EditionCopy {
  const { date, log, games } = opts;
  const folio = {
    folioLeft: `Vol. 2 · No. ${dayOfYear(date)}`,
    folioMid: "Home run desk",
    folioRight: formatEditionDate(date),
  };
  const final = latestFinal(log);

  if (date === "2026-09-12" && final?.date === "2026-09-12") {
    return saturdayCopy(final, date, games);
  }

  if (!final) {
    const lookHits = HR_LOOKBACK.reduce((s, r) => s + r.hits, 0);
    const lookN = HR_LOOKBACK.reduce((s, r) => s + r.n, 0);
    const lookRand = HR_LOOKBACK.reduce((s, r) => s + r.random, 0);
    return {
      ...folio,
      hed: "The Great Run is on",
      deck: "Tonight’s board ranks who goes yard. The 2/3/6 posts itself.",
      dateline: "DESK NOTES —",
      lede: games
        ? `${games} games are on the Eastern board. The desk pulls lineups, PrizePicks, Statcast, and each bat's day/night homers — then ranks who goes yard. Starters are priced on K/BF, outing length, and the lineup they actually face.`
        : "Off day, or the slate has not landed. Open cards still grade from the boxes.",
      nut: `The last boards went ${lookHits} of ${lookN} against ${lookRand.toFixed(1)} random names. A 25% board is 3 of 12 — not 10 of 10. Empty days are skips, not losses.`,
    };
  }

  const postedToday = log.some((e) => e.date === date && e.slips.some((s) => !s.skip && s.legs.length > 0));
  const skipDays = log.filter((e) => e.date !== "2026-09-12" && isSkipDay(e)).length;

  if (final.date !== date) {
    const units = reportOf(final.slips).units;
    return {
      ...folio,
      hed: postedToday ? "Tonight is posted" : "Skips are not losses",
      deck:
        units != null
          ? `Last graded card is ${formatDeskDate(final.date)}, ${formatUnits(units)}. ${skipDays ? `${skipDays} empty day${skipDays === 1 ? "" : "s"} in the file are skips.` : "Empty days are skips."}`
          : `Last graded card is ${formatDeskDate(final.date)}. Empty days are skips, not red.`,
      dateline: "DESK NOTES —",
      lede: `The phone was reading leftover 1.5 H+R+RBI slips as losses on days that never posted a 2/3/6. Those days are skips. Saturday remains ${formatUnits(units ?? 2)} on three slips. Model 3.2 ranks home runs with day/night splits and when each bat actually went yard. Last Great Run boards: ${HR_LOOKBACK.reduce((s, r) => s + r.hits, 0)} of ${HR_LOOKBACK.reduce((s, r) => s + r.n, 0)} vs ${HR_LOOKBACK.reduce((s, r) => s + r.random, 0).toFixed(1)} random.`,
      nut:
        games > 0
          ? postedToday
            ? `Tonight’s card is live. ${games} games.`
            : `${games} games on the board. A skip tonight is not a loss.`
          : "Off day.",
    };
  }

  const report = reportOf(final.slips);
  const smash = smashLegs(final.slips);
  const miss = missLegs(final.slips);
  const labels = report.slips.map(payoutLabel).join(", ");
  const smashLine = smash.length
    ? smash
        .slice(0, 2)
        .map((l) => `${lastName(l.name)} ${l.actual}`)
        .join(" and ")
    : null;
  const missLine = miss.length
    ? miss
        .slice(0, 2)
        .map((l) => lastName(l.name))
        .join(" and ")
    : null;
  const units = report.units;
  const hed =
    units != null && units > 0
      ? `${final.grade?.hits ?? report.hits} of ${final.grade?.n ?? report.n}, ${formatUnits(units)}`
      : units != null && units < 0
        ? `A red night in the book, ${formatUnits(units)}`
        : `${formatDeskDate(final.date)} is in the book`;

  return {
    ...folio,
    hed,
    deck: labels || "The slips are graded from the boxes.",
    dateline: "DESK NOTES —",
    lede: [
      `The ${formatDeskDate(final.date)} card went ${final.grade?.hits ?? report.hits}-for-${final.grade?.n ?? report.n}.`,
      labels ? `${labels}.` : null,
      smashLine ? `${smashLine} smashed.` : null,
      missLine ? `${missLine} missed.` : null,
      units != null ? `The desk is ${formatUnits(units)} on ${report.staked} slip${report.staked === 1 ? "" : "s"} staked.` : null,
    ]
      .filter(Boolean)
      .join(" "),
    nut:
      games > 0
        ? `Tonight’s card is ${log.some((e) => e.date === date && e.slips.length) ? "posted and still open" : "not posted"}. ${games} games.`
        : "The next slate will grade the same way: boxes, not PrizePicks.",
  };
}

export function agateLine(leg: SlipLeg): string {
  const side = leg.side === "over" ? "O" : "U";
  const actual = leg.actual != null ? String(leg.actual) : "—";
  const mark = leg.result === "hit" ? "H" : leg.result === "miss" ? "—" : leg.result === "dnp" ? "DNP" : "";
  return `${side} ${leg.line} ${leg.stat || leg.market}  ${actual}${mark ? `  ${mark}` : ""}`;
}

export function openNote(games: number, posted: boolean): string {
  if (posted) return "Tonight’s slips are posted. Boxes grade after first pitch.";
  if (games) return `${games} games on the board. Fetch the 2/3/6 from the masthead.`;
  return "No MLB games on this date.";
}
