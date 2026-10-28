/** Graded cards. A leg stays open until the box is final. A ticket with a miss is a miss. */

import type { LedgerLeg, Sport } from "../board/types.ts";

export type BookLeg = {
  name: string;
  market: string;
  side: "over" | "under";
  line: number;
  actual: number | null;
  result: "hit" | "miss" | "open" | "void";
  /** Raw model chance before the trust factor, with the board's market key. Legs without one do not train calibration. */
  model?: { sport: Sport; key: string; p: number };
};

export type BookCard = {
  date: string;
  title: string;
  result: "hit" | "miss" | "open";
  legs: BookLeg[];
};

export const BOOK: BookCard[] = [
  {
    date: "2026-10-27",
    title: "2 NBA, 4 NHL",
    result: "miss",
    legs: [
      { name: "Jalen Brunson", market: "points", side: "under", line: 26.5, actual: 23, result: "hit", model: { sport: "nba", key: "pts-under", p: 0.688 } },
      { name: "Cade Cunningham", market: "points", side: "under", line: 23.5, actual: 19, result: "hit", model: { sport: "nba", key: "pts-under", p: 0.621 } },
      { name: "David Pastrnak", market: "shots", side: "over", line: 2.5, actual: 1, result: "miss", model: { sport: "nhl", key: "sog25", p: 0.722 } },
      { name: "Kirill Kaprizov", market: "points", side: "over", line: 0.5, actual: 2, result: "hit", model: { sport: "nhl", key: "point", p: 0.759 } },
      { name: "Macklin Celebrini", market: "points", side: "over", line: 0.5, actual: 0, result: "miss", model: { sport: "nhl", key: "point", p: 0.736 } },
      { name: "Matt Boldy", market: "shots", side: "over", line: 2.5, actual: 2, result: "miss", model: { sport: "nhl", key: "sog25", p: 0.766 } },
    ],
  },
  {
    date: "2026-10-26",
    title: "3 NBA, 3 WNBA",
    result: "miss",
    legs: [
      { name: "Jamal Murray", market: "rebounds", side: "over", line: 3.5, actual: 6, result: "hit", model: { sport: "nba", key: "reb", p: 0.75 } },
      { name: "Jamal Murray", market: "points", side: "over", line: 23.5, actual: 19, result: "miss", model: { sport: "nba", key: "pts", p: 0.639 } },
      { name: "Stephen Curry", market: "points", side: "over", line: 24.5, actual: 24, result: "miss", model: { sport: "nba", key: "pts", p: 0.553 } },
      { name: "Rhyne Howard", market: "threes", side: "under", line: 2.5, actual: 3, result: "miss" },
      { name: "Angel Reese", market: "rebounds", side: "over", line: 11.5, actual: 15, result: "hit" },
      { name: "Dream at Valkyries", market: "total points", side: "under", line: 150.5, actual: 119, result: "hit" },
    ],
  },
  {
    date: "2026-10-26",
    title: "2 NFL, 3 NBA, 1 NHL",
    result: "miss",
    legs: [
      { name: "Makai Lemon", market: "receiving yards", side: "over", line: 37.5, actual: 67, result: "hit", model: { sport: "nfl", key: "recyd", p: 0.936 } },
      { name: "Javonte Williams", market: "receiving yards", side: "over", line: 12.5, actual: 0, result: "miss", model: { sport: "nfl", key: "recyd", p: 0.741 } },
      { name: "Paul George", market: "points", side: "over", line: 19.5, actual: 16, result: "miss", model: { sport: "nba", key: "pts", p: 0.611 } },
      { name: "Jarrett Allen", market: "rebounds", side: "over", line: 7.5, actual: 9, result: "hit", model: { sport: "nba", key: "reb", p: 0.569 } },
      { name: "Moussa Diabate", market: "rebounds", side: "under", line: 8.5, actual: 17, result: "miss", model: { sport: "nba", key: "reb-under", p: 0.562 } },
      { name: "Connor McDavid", market: "points", side: "over", line: 1.5, actual: 1, result: "miss", model: { sport: "nhl", key: "point2", p: 0.657 } },
    ],
  },
  {
    date: "2026-10-26",
    title: "6-man, model lines",
    result: "miss",
    legs: [
      { name: "Dameon Pierce", market: "rushing yards", side: "over", line: 18.5, actual: 47, result: "hit", model: { sport: "nfl", key: "rush", p: 0.92 } },
      { name: "Connor McDavid", market: "points", side: "over", line: 0.5, actual: 1, result: "hit", model: { sport: "nhl", key: "point", p: 0.894 } },
      { name: "Auston Matthews", market: "shots", side: "over", line: 1.5, actual: 1, result: "miss", model: { sport: "nhl", key: "sog15", p: 0.876 } },
      { name: "Artemi Panarin", market: "shots", side: "over", line: 1.5, actual: 3, result: "hit", model: { sport: "nhl", key: "sog15", p: 0.811 } },
      { name: "Peyton Watson", market: "rebounds", side: "over", line: 2.5, actual: 8, result: "hit", model: { sport: "nba", key: "reb", p: 0.665 } },
      { name: "Cameron Johnson", market: "rebounds", side: "over", line: 2.5, actual: null, result: "void" },
    ],
  },
  {
    date: "2026-10-25",
    title: "6-man mix",
    result: "miss",
    legs: [
      { name: "Jaxon Smith-Njigba", market: "receiving yards", side: "over", line: 93.5, actual: 150, result: "hit" },
      { name: "Patrick Mahomes", market: "passing yards", side: "over", line: 216.5, actual: 165, result: "miss" },
      { name: "Nathan MacKinnon", market: "points", side: "over", line: 1.5, actual: 1, result: "miss" },
      { name: "LaMelo Ball", market: "points", side: "over", line: 19.5, actual: 15, result: "miss" },
      { name: "Shai Gilgeous-Alexander", market: "rebounds", side: "over", line: 3.5, actual: 6, result: "hit" },
      { name: "Angel Reese", market: "points", side: "over", line: 15.5, actual: 7, result: "miss" },
    ],
  },
  {
    date: "2026-10-20",
    title: "4-leg mix",
    result: "miss",
    legs: [
      { name: "Nathan MacKinnon", market: "shots", side: "over", line: 1.5, actual: 5, result: "hit" },
      { name: "Macklin Celebrini", market: "shots", side: "over", line: 1.5, actual: 6, result: "hit" },
      { name: "Payton Pritchard", market: "assists", side: "over", line: 3.5, actual: 1, result: "miss" },
      { name: "Jaylen Brown", market: "assists", side: "over", line: 3.5, actual: 6, result: "hit" },
    ],
  },
  {
    date: "2026-10-20",
    title: "NBA three",
    result: "miss",
    legs: [
      { name: "Payton Pritchard", market: "assists", side: "over", line: 3.5, actual: 1, result: "miss" },
      { name: "Jaylen Brown", market: "assists", side: "over", line: 3.5, actual: 6, result: "hit" },
      { name: "De'Aaron Fox", market: "points", side: "under", line: 22.5, actual: 14, result: "hit" },
    ],
  },
];

/** Graded legs that carry a model chance, as ledger rows the board calibrates against. */
export function bookLedger(book: BookCard[] = BOOK): LedgerLeg[] {
  const out: LedgerLeg[] = [];
  for (const card of book) {
    card.legs.forEach((leg, i) => {
      if (!leg.model || (leg.result !== "hit" && leg.result !== "miss")) return;
      out.push({
        id: `book:${card.date}:${card.title}:${i}`,
        date: card.date,
        sport: leg.model.sport,
        market: leg.model.key,
        marketLabel: leg.market,
        name: leg.name,
        prop: `${leg.side === "over" ? "Over" : "Under"} ${leg.line} ${leg.market}`,
        p: leg.model.p,
        result: leg.result,
      });
    });
  }
  return out;
}
