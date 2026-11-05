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
  /** Hard Rock price taken, American odds, and the other side when it was posted. Scores the model against the book. */
  price?: number;
  opposite?: number;
};

export type BookCard = {
  date: string;
  title: string;
  result: "hit" | "miss" | "open";
  legs: BookLeg[];
};

export const BOOK: BookCard[] = [
  // Nov 4. Model p is the simulator's raw chance after the live injury check, before trust and the market blend.
  // Spread legs: line is the handicap taken, actual is that team's final margin.
  {
    date: "2026-11-04",
    title: "NBA 6-man",
    result: "miss",
    legs: [
      { name: "Tyrese Maxey", market: "points", side: "over", line: 23.5, actual: 19, result: "miss", model: { sport: "nba", key: "pts", p: 0.54 }, price: -117 },
      { name: "Isaiah Hartenstein", market: "points", side: "under", line: 10.5, actual: 3, result: "hit", model: { sport: "nba", key: "pts-under", p: 0.589 }, price: 105 },
      { name: "Donovan Mitchell", market: "assists", side: "over", line: 5.5, actual: 6, result: "hit", model: { sport: "nba", key: "ast", p: 0.507 }, price: 113 },
      { name: "LaMelo Ball", market: "points", side: "under", line: 19.5, actual: 20, result: "miss", model: { sport: "nba", key: "pts-under", p: 0.622 }, price: -111, opposite: -109 },
      { name: "Alperen Sengun", market: "assists", side: "over", line: 5.5, actual: 10, result: "hit", model: { sport: "nba", key: "ast", p: 0.616 } },
      { name: "Luka Doncic", market: "points", side: "over", line: 34.5, actual: 40, result: "hit", model: { sport: "nba", key: "pts", p: 0.553 }, price: -106, opposite: -114 },
    ],
  },
  {
    // Shared legs with the 6-man are graded once, there.
    date: "2026-11-04",
    title: "NBA mega card, 6 games, 15 legs",
    result: "miss",
    legs: [
      { name: "Tyrese Maxey", market: "points", side: "over", line: 23.5, actual: 19, result: "miss" },
      { name: "Cade Cunningham", market: "points", side: "under", line: 24.5, actual: 26, result: "miss", model: { sport: "nba", key: "pts-under", p: 0.558 }, price: -110, opposite: -110 },
      { name: "76ers", market: "spread", side: "over", line: 2.5, actual: 6, result: "hit", price: -114, opposite: -106 },
      { name: "Isaiah Hartenstein", market: "points", side: "under", line: 10.5, actual: 3, result: "hit" },
      { name: "Donovan Mitchell", market: "assists", side: "over", line: 5.5, actual: 6, result: "hit" },
      { name: "Cavaliers", market: "spread", side: "over", line: 2.5, actual: -8, result: "miss", price: -115, opposite: -105 },
      { name: "Rockets", market: "spread", side: "over", line: -8.5, actual: -10, result: "miss", price: -104, opposite: -116 },
      { name: "Alperen Sengun", market: "assists", side: "over", line: 5.5, actual: 10, result: "hit" },
      { name: "LaMelo Ball", market: "points", side: "under", line: 19.5, actual: 20, result: "miss" },
      { name: "Luka Doncic", market: "points", side: "over", line: 34.5, actual: 40, result: "hit" },
      { name: "Lakers at Kings", market: "total points", side: "over", line: 234.5, actual: 219, result: "miss", price: -110, opposite: -110 },
      { name: "Jamal Murray", market: "points", side: "over", line: 23.5, actual: 14, result: "miss", model: { sport: "nba", key: "pts", p: 0.593 }, price: -122 },
      { name: "Nuggets", market: "spread", side: "over", line: -4.5, actual: 19, result: "hit", price: -110, opposite: -110 },
      { name: "Kyshawn George", market: "assists", side: "over", line: 3.5, actual: 7, result: "hit", model: { sport: "nba", key: "ast", p: 0.553 }, price: -133 },
      { name: "Hawks at Wizards", market: "total points", side: "over", line: 232.5, actual: 225, result: "miss", price: -110, opposite: -110 },
    ],
  },
  {
    date: "2026-11-04",
    title: "NBA top 4 (final run)",
    result: "miss",
    legs: [
      { name: "LaMelo Ball", market: "points", side: "under", line: 19.5, actual: 20, result: "miss" },
      { name: "Alperen Sengun", market: "assists", side: "over", line: 5.5, actual: 10, result: "hit" },
      { name: "Jamal Murray", market: "points", side: "over", line: 23.5, actual: 14, result: "miss" },
      { name: "Luka Doncic", market: "points", side: "over", line: 34.5, actual: 40, result: "hit" },
    ],
  },
  {
    date: "2026-11-04",
    title: "NBA final 6-man",
    result: "miss",
    legs: [
      { name: "LaMelo Ball", market: "points", side: "under", line: 19.5, actual: 20, result: "miss" },
      { name: "Alperen Sengun", market: "assists", side: "over", line: 5.5, actual: 10, result: "hit" },
      { name: "Jamal Murray", market: "points", side: "over", line: 23.5, actual: 14, result: "miss" },
      { name: "Luka Doncic", market: "points", side: "over", line: 34.5, actual: 40, result: "hit" },
      { name: "Fred VanVleet", market: "assists", side: "over", line: 5.5, actual: 3, result: "miss", model: { sport: "nba", key: "ast", p: 0.565 }, price: 113 },
      { name: "Tyrese Maxey", market: "points", side: "over", line: 23.5, actual: 19, result: "miss" },
    ],
  },
  {
    date: "2026-11-02",
    title: "MNF + NBA",
    result: "hit",
    legs: [
      { name: "Colston Loveland", market: "receiving yards", side: "over", line: 42.5, actual: 65, result: "hit", model: { sport: "nfl", key: "recyd", p: 0.861 }, price: -114, opposite: -114 },
      { name: "Jaxon Smith-Njigba", market: "anytime touchdown", side: "over", line: 0.5, actual: 1, result: "hit", model: { sport: "nfl", key: "atd", p: 0.344 } },
      { name: "D'Andre Swift", market: "anytime touchdown", side: "over", line: 0.5, actual: 3, result: "hit", model: { sport: "nfl", key: "atd", p: 0.45 } },
      { name: "Jamal Murray", market: "rebounds", side: "over", line: 3.5, actual: 5, result: "hit", model: { sport: "nba", key: "reb", p: 0.729 } },
      { name: "Scottie Barnes", market: "rebounds", side: "over", line: 5.5, actual: 15, result: "hit", model: { sport: "nba", key: "reb", p: 0.68 } },
      { name: "Luka Doncic", market: "points", side: "over", line: 24.5, actual: 42, result: "hit", model: { sport: "nba", key: "pts", p: 0.837 } },
    ],
  },
  {
    // Loveland, Smith-Njigba and Swift are graded once, on the card above.
    date: "2026-11-02",
    title: "MNF 5-leg, +1293, $10 paid $139.26",
    result: "hit",
    legs: [
      { name: "Caleb Williams", market: "rushing yards", side: "under", line: 22.5, actual: 1, result: "hit" },
      { name: "Colston Loveland", market: "receiving yards", side: "over", line: 42.5, actual: 65, result: "hit" },
      { name: "Jaxon Smith-Njigba", market: "anytime touchdown", side: "over", line: 0.5, actual: 1, result: "hit" },
      { name: "D'Andre Swift", market: "anytime touchdown", side: "over", line: 0.5, actual: 3, result: "hit" },
      { name: "Bears at Seahawks", market: "total points", side: "over", line: 46.5, actual: 51, result: "hit" },
    ],
  },
  {
    date: "2026-11-02",
    title: "Suns-Warriors + Nuggets",
    result: "miss",
    legs: [
      { name: "De'Anthony Melton", market: "threes", side: "over", line: 0.5, actual: 0, result: "miss", model: { sport: "nba", key: "threes", p: 0.893 } },
      { name: "Brandin Podziemski", market: "rebounds", side: "over", line: 3.5, actual: 3, result: "miss", model: { sport: "nba", key: "reb", p: 0.785 } },
      { name: "Brandin Podziemski", market: "assists", side: "over", line: 2.5, actual: 2, result: "miss", model: { sport: "nba", key: "ast", p: 0.828 } },
      { name: "Dillon Brooks", market: "points", side: "over", line: 11.5, actual: 18, result: "hit", model: { sport: "nba", key: "pts", p: 0.868 } },
      { name: "Devin Booker", market: "assists", side: "over", line: 3.5, actual: 5, result: "hit", model: { sport: "nba", key: "ast", p: 0.805 } },
      { name: "Jamal Murray", market: "rebounds", side: "over", line: 3.5, actual: 5, result: "hit" },
    ],
  },
  {
    date: "2026-11-02",
    title: "Six-game NBA",
    result: "miss",
    legs: [
      { name: "Trae Young", market: "assists", side: "over", line: 8.5, actual: 9, result: "hit" },
      { name: "Alperen Sengun", market: "rebounds", side: "over", line: 8.5, actual: 7, result: "miss", model: { sport: "nba", key: "reb", p: 0.527 } },
      { name: "Shai Gilgeous-Alexander", market: "points", side: "over", line: 24.5, actual: 43, result: "hit", model: { sport: "nba", key: "pts", p: 0.664 } },
      { name: "Cade Cunningham", market: "assists", side: "over", line: 6.5, actual: 7, result: "hit", model: { sport: "nba", key: "ast", p: 0.682 } },
      { name: "Nikola Jokic", market: "assists", side: "over", line: 7.5, actual: 8, result: "hit", model: { sport: "nba", key: "ast", p: 0.69 } },
      { name: "Dejounte Murray", market: "assists", side: "over", line: 4.5, actual: null, result: "void" },
      { name: "Pistons", market: "moneyline", side: "over", line: 0.5, actual: 1, result: "hit" },
      { name: "Nuggets", market: "moneyline", side: "over", line: 0.5, actual: 0, result: "miss" },
    ],
  },
  {
    date: "2026-11-01",
    title: "SNF + Lakers",
    result: "miss",
    legs: [
      { name: "Makai Lemon", market: "receptions", side: "over", line: 4.5, actual: 6, result: "hit", model: { sport: "nfl", key: "rec", p: 0.917 } },
      { name: "Rachaad White", market: "receiving yards", side: "over", line: 13.5, actual: 5, result: "miss", model: { sport: "nfl", key: "recyd", p: 0.851 } },
      { name: "Chig Okonkwo", market: "receiving yards", side: "over", line: 33.5, actual: 32, result: "miss", model: { sport: "nfl", key: "recyd", p: 0.73 } },
      { name: "Darius Cooper", market: "receiving yards", side: "over", line: 26.5, actual: 19, result: "miss", model: { sport: "nfl", key: "recyd", p: 0.76 } },
      { name: "Jayden Daniels", market: "passing yards", side: "over", line: 200.5, actual: 217, result: "hit", model: { sport: "nfl", key: "pass", p: 0.66 } },
      { name: "Walker Kessler", market: "rebounds", side: "over", line: 7.5, actual: 15, result: "hit", model: { sport: "nba", key: "reb", p: 0.667 } },
    ],
  },
  {
    date: "2026-11-01",
    title: "Colts-Jaguars + Warriors",
    result: "hit",
    legs: [
      { name: "Jaguars", market: "moneyline", side: "over", line: 0.5, actual: 1, result: "hit" },
      { name: "Jonathan Taylor", market: "rushing yards", side: "under", line: 60.5, actual: 23, result: "hit" },
      { name: "Bhayshul Tuten", market: "anytime touchdown", side: "over", line: 0.5, actual: 2, result: "hit", model: { sport: "nfl", key: "atd", p: 0.44 } },
      { name: "Darius Garland", market: "points", side: "over", line: 14.5, actual: 15, result: "hit" },
      { name: "Brandin Podziemski", market: "points", side: "over", line: 14.5, actual: 17, result: "hit" },
      { name: "Kris Dunn", market: "assists", side: "over", line: 2.5, actual: 4, result: "hit" },
    ],
  },
  {
    date: "2026-10-29",
    title: "2 WNBA, 2 NBA, 2 NFL",
    result: "miss",
    legs: [
      { name: "Angel Reese", market: "rebounds", side: "over", line: 9.5, actual: 14, result: "hit" },
      { name: "Valkyries at Dream", market: "total points", side: "under", line: 147.5, actual: 149, result: "miss" },
      { name: "Chuba Hubbard", market: "receiving yards", side: "over", line: 14.5, actual: 38, result: "hit", model: { sport: "nfl", key: "recyd", p: 0.765 } },
      { name: "John Metchie III", market: "receiving yards", side: "over", line: 15.5, actual: 14, result: "miss", model: { sport: "nfl", key: "recyd", p: 0.774 } },
      { name: "James Harden", market: "assists", side: "over", line: 4.5, actual: 4, result: "miss", model: { sport: "nba", key: "ast", p: 0.801 } },
      { name: "Domantas Sabonis", market: "rebounds", side: "over", line: 9.5, actual: 15, result: "hit", model: { sport: "nba", key: "reb", p: 0.748 } },
    ],
  },
  {
    date: "2026-10-28",
    title: "SGP: Heat-Hawks, Magic-Raptors, Warriors-Wolves",
    result: "miss",
    legs: [
      { name: "Bam Adebayo", market: "points", side: "under", line: 18.5, actual: 24, result: "miss", model: { sport: "nba", key: "pts-under", p: 0.671 } },
      { name: "Giannis Antetokounmpo", market: "rebounds", side: "over", line: 7.5, actual: 18, result: "hit", model: { sport: "nba", key: "reb", p: 0.7 } },
      { name: "Wendell Carter Jr.", market: "rebounds", side: "under", line: 8.5, actual: 10, result: "miss", model: { sport: "nba", key: "reb-under", p: 0.62 } },
      { name: "Scottie Barnes", market: "rebounds", side: "over", line: 7.5, actual: 6, result: "miss", model: { sport: "nba", key: "reb", p: 0.512 } },
      { name: "LaMelo Ball", market: "rebounds", side: "under", line: 4.5, actual: 4, result: "hit", model: { sport: "nba", key: "reb-under", p: 0.627 } },
      { name: "Jaden McDaniels", market: "points", side: "under", line: 17.5, actual: 19, result: "miss", model: { sport: "nba", key: "pts-under", p: 0.657 } },
    ],
  },
  {
    // Bam and LaMelo are graded once, on the card above, so they do not count twice in calibration.
    date: "2026-10-28",
    title: "4-leg NBA",
    result: "miss",
    legs: [
      { name: "Bam Adebayo", market: "points", side: "under", line: 18.5, actual: 24, result: "miss" },
      { name: "Darius Garland", market: "assists", side: "under", line: 8.5, actual: 5, result: "hit", model: { sport: "nba", key: "ast-under", p: 0.692 } },
      { name: "LeBron James", market: "points + rebounds + assists", side: "over", line: 30.5, actual: 28, result: "miss", model: { sport: "nba", key: "pra", p: 0.614 } },
      { name: "LaMelo Ball", market: "rebounds", side: "under", line: 4.5, actual: 4, result: "hit" },
    ],
  },
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
