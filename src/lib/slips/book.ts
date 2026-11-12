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
  {
    // The user's own research, placed on Hard Rock. No model p, so it does not train calibration.
    // Curry left in the 1st quarter after 6 minutes; Hard Rock keeps props live once a player checks in.
    date: "2026-11-11",
    title: "Placed: GS@HOU SGP + Ziaire Williams + Ty Jerome (user's picks)",
    result: "miss",
    legs: [
      { name: "Brandin Podziemski", market: "pts+reb+ast", side: "over", line: 22.5, actual: 32, result: "hit" },
      { name: "Stephen Curry", market: "threes", side: "over", line: 2.5, actual: 1, result: "miss" },
      { name: "Stephen Curry", market: "points", side: "over", line: 26.5, actual: 3, result: "miss" },
      { name: "Yaxel Lendeborg", market: "reb+ast", side: "over", line: 10.5, actual: 10, result: "miss" },
      { name: "Draymond Green", market: "reb+ast", side: "over", line: 10.5, actual: 12, result: "hit" },
      { name: "Ziaire Williams", market: "points", side: "over", line: 8.5, actual: 9, result: "hit", price: -115 },
      { name: "Ty Jerome", market: "points", side: "over", line: 19.5, actual: 22, result: "hit", price: -180 },
    ],
  },
  // Nov 11. First card priced off real DraftKings main lines (ESPN feed). Model p is the mean of both engines; graded legs carry the DK price.
  {
    date: "2026-11-11",
    title: "8 PM+ NBA 12-leg list (all legs I thought would hit)",
    result: "miss",
    legs: [
      { name: "Al Horford", market: "rebounds", side: "over", line: 3.5, actual: 1, result: "miss", model: { sport: "nba", key: "reb", p: 0.628 }, price: 112, opposite: -148 },
      { name: "Georges Niang", market: "pts+reb+ast", side: "over", line: 11.5, actual: 10, result: "miss", model: { sport: "nba", key: "pra", p: 0.592 }, price: -106, opposite: -124 },
      { name: "Yaxel Lendeborg", market: "pts+reb+ast", side: "under", line: 28.5, actual: 35, result: "miss", model: { sport: "nba", key: "pra-under", p: 0.632 }, price: -121, opposite: -109 },
      { name: "Tari Eason", market: "pts+reb+ast", side: "over", line: 14.5, actual: 9, result: "miss", model: { sport: "nba", key: "pra", p: 0.626 }, price: -129, opposite: -102 },
      { name: "Nic Claxton", market: "rebounds", side: "over", line: 5.5, actual: 6, result: "hit", model: { sport: "nba", key: "reb", p: 0.608 }, price: 114, opposite: -150 },
      { name: "Ryan Rollins", market: "rebounds", side: "over", line: 3.5, actual: 7, result: "hit", model: { sport: "nba", key: "reb", p: 0.598 }, price: 123, opposite: -163 },
      { name: "Jerami Grant", market: "pts+reb+ast", side: "over", line: 15.5, actual: 18, result: "hit", model: { sport: "nba", key: "pra", p: 0.628 }, price: -103, opposite: -128 },
      { name: "Cameron Boozer", market: "assists", side: "under", line: 4.5, actual: 5, result: "miss", model: { sport: "nba", key: "ast-under", p: 0.619 }, price: 120, opposite: -158 },
      { name: "Derik Queen", market: "pts+reb+ast", side: "over", line: 18.5, actual: 9, result: "miss", model: { sport: "nba", key: "pra", p: 0.652 }, price: -121, opposite: -108 },
      { name: "Danny Wolf", market: "assists", side: "under", line: 2.5, actual: 4, result: "miss", model: { sport: "nba", key: "ast-under", p: 0.612 }, price: -103, opposite: -128 },
      { name: "Tristan da Silva", market: "threes", side: "under", line: 2.5, actual: null, result: "void" },
      { name: "Aday Mara", market: "points", side: "under", line: 10.5, actual: 11, result: "miss", model: { sport: "nba", key: "pts-under", p: 0.648 }, price: -110, opposite: -116 },
    ],
  },
  {
    date: "2026-11-11",
    title: "GS@HOU 4-leg SGP",
    result: "miss",
    legs: [
      { name: "Al Horford", market: "rebounds", side: "over", line: 3.5, actual: 1, result: "miss" },
      { name: "Georges Niang", market: "pts+reb+ast", side: "over", line: 11.5, actual: 10, result: "miss" },
      { name: "Yaxel Lendeborg", market: "pts+reb+ast", side: "under", line: 28.5, actual: 35, result: "miss" },
      { name: "Tari Eason", market: "pts+reb+ast", side: "over", line: 14.5, actual: 9, result: "miss" },
    ],
  },
  {
    date: "2026-11-11",
    title: "6-leg: GS@HOU four + Claxton + Rollins",
    result: "miss",
    legs: [
      { name: "Al Horford", market: "rebounds", side: "over", line: 3.5, actual: 1, result: "miss" },
      { name: "Georges Niang", market: "pts+reb+ast", side: "over", line: 11.5, actual: 10, result: "miss" },
      { name: "Yaxel Lendeborg", market: "pts+reb+ast", side: "under", line: 28.5, actual: 35, result: "miss" },
      { name: "Tari Eason", market: "pts+reb+ast", side: "over", line: 14.5, actual: 9, result: "miss" },
      { name: "Nic Claxton", market: "rebounds", side: "over", line: 5.5, actual: 6, result: "hit" },
      { name: "Ryan Rollins", market: "rebounds", side: "over", line: 3.5, actual: 7, result: "hit" },
    ],
  },
  {
    date: "2026-11-11",
    title: "3-leg plus-money rebounds",
    result: "miss",
    legs: [
      { name: "Nic Claxton", market: "rebounds", side: "over", line: 5.5, actual: 6, result: "hit" },
      { name: "Ryan Rollins", market: "rebounds", side: "over", line: 3.5, actual: 7, result: "hit" },
      { name: "Al Horford", market: "rebounds", side: "over", line: 3.5, actual: 1, result: "miss" },
    ],
  },
  {
    // Mentioned as good value near 50%; graded so the scorecard sees them.
    date: "2026-11-11",
    title: "Value legs named but left off the list",
    result: "hit",
    legs: [
      { name: "Marcus Smart", market: "threes", side: "over", line: 1.5, actual: 2, result: "hit", model: { sport: "nba", key: "threes", p: 0.469 }, price: 159, opposite: -212 },
      { name: "De'Anthony Melton", market: "rebounds", side: "over", line: 3.5, actual: 4, result: "hit", model: { sport: "nba", key: "reb", p: 0.504 }, price: 125, opposite: -165 },
    ],
  },
  // Nov 10. Built, not confirmed placed. Prices are DraftKings via ESPN (Hard Rock was not readable); the legs were alternate lines, priced far past -115.
  {
    // Herro did not play and his leg voided.
    date: "2026-11-10",
    title: "3-SGP mega: Herro/Knicks, Peterson/Heat, Bane/Magic (Hard Rock +600)",
    result: "hit",
    legs: [
      { name: "Tyler Herro", market: "rebounds", side: "under", line: 4.5, actual: null, result: "void" },
      { name: "Knicks", market: "moneyline", side: "over", line: 0.5, actual: 1, result: "hit", price: -1040, opposite: 670 },
      { name: "Darryn Peterson", market: "threes", side: "over", line: 1.5, actual: 4, result: "hit", model: { sport: "nba", key: "threes", p: 0.607 }, price: -304 },
      { name: "Heat", market: "moneyline", side: "over", line: 0.5, actual: 1, result: "hit", price: -406, opposite: 319 },
      { name: "Desmond Bane", market: "assists", side: "over", line: 2.5, actual: 4, result: "hit", model: { sport: "nba", key: "ast", p: 0.629 }, price: -199 },
      { name: "Magic", market: "moneyline", side: "over", line: 0.5, actual: 1, result: "hit", price: -229, opposite: 190 },
    ],
  },
  {
    date: "2026-11-10",
    title: "NBA 4-leg (Hard Rock +443)",
    result: "hit",
    legs: [
      { name: "Jayson Tatum", market: "threes", side: "over", line: 1.5, actual: 3, result: "hit", model: { sport: "nba", key: "threes", p: 0.643 }, price: -367 },
      { name: "Tyler Herro", market: "rebounds", side: "under", line: 4.5, actual: null, result: "void" },
      { name: "Desmond Bane", market: "assists", side: "over", line: 2.5, actual: 4, result: "hit" },
      { name: "Jrue Holiday", market: "threes", side: "over", line: 1.5, actual: 2, result: "hit", model: { sport: "nba", key: "threes", p: 0.622 }, price: -253 },
    ],
  },
  {
    date: "2026-11-10",
    title: "SGP MIL@NY: Herro under 4.5 rebounds + Anunoby over 1.5 threes",
    result: "hit",
    legs: [
      { name: "Tyler Herro", market: "rebounds", side: "under", line: 4.5, actual: null, result: "void" },
      { name: "OG Anunoby", market: "threes", side: "over", line: 1.5, actual: 5, result: "hit", model: { sport: "nba", key: "threes", p: 0.613 }, price: -245 },
    ],
  },
  {
    date: "2026-11-10",
    title: "SGP BOS@PHI: Tatum + Pritchard over 1.5 threes",
    result: "hit",
    legs: [
      { name: "Jayson Tatum", market: "threes", side: "over", line: 1.5, actual: 3, result: "hit" },
      { name: "Payton Pritchard", market: "threes", side: "over", line: 1.5, actual: 4, result: "hit", model: { sport: "nba", key: "threes", p: 0.605 }, price: -186, opposite: 141 },
    ],
  },
  {
    date: "2026-11-10",
    title: "SGP LAC@PHX: Jones Jr. over 3.5 rebounds + Brooks over 1.5 threes",
    result: "miss",
    legs: [
      { name: "Derrick Jones Jr.", market: "rebounds", side: "over", line: 3.5, actual: 3, result: "miss", model: { sport: "nba", key: "reb", p: 0.601 }, price: -293 },
      { name: "Dillon Brooks", market: "threes", side: "over", line: 1.5, actual: 0, result: "miss", model: { sport: "nba", key: "threes", p: 0.601 }, price: -153, opposite: 116 },
    ],
  },
  {
    date: "2026-11-10",
    title: "SGP MIA@UTAH: Peterson over 1.5 threes + Hayes over 4.5 rebounds",
    result: "miss",
    legs: [
      { name: "Darryn Peterson", market: "threes", side: "over", line: 1.5, actual: 4, result: "hit" },
      { name: "Jaxson Hayes", market: "rebounds", side: "over", line: 4.5, actual: 2, result: "miss", model: { sport: "nba", key: "reb", p: 0.585 }, price: -418 },
    ],
  },
  {
    date: "2026-11-10",
    title: "SGP ORL@SAC: Bane over 2.5 + Black over 3.5 assists",
    result: "hit",
    legs: [
      { name: "Desmond Bane", market: "assists", side: "over", line: 2.5, actual: 4, result: "hit" },
      { name: "Anthony Black", market: "assists", side: "over", line: 3.5, actual: 5, result: "hit", model: { sport: "nba", key: "ast", p: 0.611 }, price: -300 },
    ],
  },
  {
    date: "2026-11-10",
    title: "SGP OKC@POR: Holiday + Gilgeous-Alexander over 1.5 threes",
    result: "miss",
    legs: [
      { name: "Jrue Holiday", market: "threes", side: "over", line: 1.5, actual: 2, result: "hit" },
      { name: "Shai Gilgeous-Alexander", market: "threes", side: "over", line: 1.5, actual: 0, result: "miss", model: { sport: "nba", key: "threes", p: 0.604 }, price: -250 },
    ],
  },
  // Nov 9. Model p is the mean of the fast and play-by-play engines. Prop prices on the SGPs were not posted to us, so only quoted prices are kept.
  {
    date: "2026-11-09",
    title: "MNF + NBA 6-man (Cade under 8.5 version)",
    result: "miss",
    legs: [
      { name: "James Cook III", market: "rushing yards", side: "over", line: 80.5, actual: 107, result: "hit", model: { sport: "nfl", key: "rush", p: 0.594 }, price: -110, opposite: -110 },
      { name: "James Cook III", market: "anytime touchdown", side: "over", line: 0.5, actual: 1, result: "hit", model: { sport: "nfl", key: "atd", p: 0.566 }, price: -110, opposite: -110 },
      { name: "Cade Cunningham", market: "assists", side: "under", line: 8.5, actual: 7, result: "hit", model: { sport: "nba", key: "ast-under", p: 0.625 }, price: 100 },
      { name: "Cedric Coward", market: "rebounds", side: "over", line: 6.5, actual: 6, result: "miss", model: { sport: "nba", key: "reb", p: 0.532 }, price: -102, opposite: -118 },
      { name: "Mavericks", market: "moneyline", side: "over", line: 0.5, actual: 1, result: "hit", price: -170, opposite: 143 },
      { name: "Donovan Mitchell", market: "threes", side: "over", line: 2.5, actual: 1, result: "miss", model: { sport: "nba", key: "threes", p: 0.537 }, price: -114, opposite: -106 },
    ],
  },
  {
    date: "2026-11-09",
    title: "SGP LAL@ATL: Reaves under 22.5 + Hawks ML",
    result: "miss",
    legs: [
      // Reaves did not play.
      { name: "Austin Reaves", market: "points", side: "under", line: 22.5, actual: null, result: "void" },
      { name: "Hawks", market: "moneyline", side: "over", line: 0.5, actual: 0, result: "miss", price: -119, opposite: 101 },
    ],
  },
  {
    date: "2026-11-09",
    title: "SGP CLE@CHA: Naz Reid over 1.5 threes + Cavaliers ML",
    result: "miss",
    legs: [
      { name: "Naz Reid", market: "threes", side: "over", line: 1.5, actual: 4, result: "hit", model: { sport: "nba", key: "threes", p: 0.616 } },
      { name: "Cavaliers", market: "moneyline", side: "over", line: 0.5, actual: 0, result: "miss", price: -337, opposite: 270 },
    ],
  },
  {
    date: "2026-11-09",
    title: "SGP WSH@DET: Davis under 31.5 PRA + Duncan Robinson over 2.5 threes",
    result: "miss",
    legs: [
      { name: "Anthony Davis", market: "pts+reb+ast", side: "under", line: 31.5, actual: 58, result: "miss", model: { sport: "nba", key: "pra-under", p: 0.663 } },
      { name: "Duncan Robinson", market: "threes", side: "over", line: 2.5, actual: 4, result: "hit", model: { sport: "nba", key: "threes", p: 0.622 } },
    ],
  },
  // SGP MEM@TOR (Barnes under 33.5 PRA + Quickley under 5.5 assists) voided: neither played.
  {
    date: "2026-11-09",
    title: "SGP IND@DAL: Flagg over 5.5 rebounds + Mavericks ML",
    result: "hit",
    legs: [
      { name: "Cooper Flagg", market: "rebounds", side: "over", line: 5.5, actual: 10, result: "hit", model: { sport: "nba", key: "reb", p: 0.586 } },
      { name: "Mavericks", market: "moneyline", side: "over", line: 0.5, actual: 1, result: "hit" },
    ],
  },
  {
    date: "2026-11-09",
    title: "SGP DEN@HOU: Jokic under 43.5 PRA + Rockets ML",
    result: "miss",
    legs: [
      { name: "Nikola Jokic", market: "pts+reb+ast", side: "under", line: 43.5, actual: 50, result: "miss", model: { sport: "nba", key: "pra-under", p: 0.637 } },
      { name: "Rockets", market: "moneyline", side: "over", line: 0.5, actual: 1, result: "hit", price: -173, opposite: 146 },
    ],
  },
  {
    date: "2026-11-09",
    title: "SGP SA@PHX: Booker under 24.5 + Spurs ML",
    result: "miss",
    legs: [
      { name: "Devin Booker", market: "points", side: "under", line: 24.5, actual: 32, result: "miss", model: { sport: "nba", key: "pts-under", p: 0.577 } },
      { name: "Spurs", market: "moneyline", side: "over", line: 0.5, actual: 1, result: "hit", price: -372, opposite: 296 },
    ],
  },
  {
    date: "2026-11-09",
    title: "SGP NO@GS: Podziemski over 1.5 threes + Bey over 3.5 rebounds",
    result: "miss",
    legs: [
      { name: "Brandin Podziemski", market: "threes", side: "over", line: 1.5, actual: 5, result: "hit", model: { sport: "nba", key: "threes", p: 0.615 } },
      { name: "Saddiq Bey", market: "rebounds", side: "over", line: 3.5, actual: 0, result: "miss", model: { sport: "nba", key: "reb", p: 0.609 } },
    ],
  },
  {
    // Built, not placed. Reaves and Barnes voided; legs are graded on the SGP cards above.
    date: "2026-11-09",
    title: "NBA 6-leg mega (one prop per game)",
    result: "miss",
    legs: [
      { name: "Austin Reaves", market: "points", side: "under", line: 22.5, actual: null, result: "void" },
      { name: "Naz Reid", market: "threes", side: "over", line: 1.5, actual: 4, result: "hit" },
      { name: "Anthony Davis", market: "pts+reb+ast", side: "under", line: 31.5, actual: 58, result: "miss" },
      { name: "Scottie Barnes", market: "pts+reb+ast", side: "under", line: 33.5, actual: null, result: "void" },
      { name: "Nikola Jokic", market: "pts+reb+ast", side: "under", line: 43.5, actual: 50, result: "miss" },
      { name: "Brandin Podziemski", market: "threes", side: "over", line: 1.5, actual: 5, result: "hit" },
    ],
  },
  {
    // The alternate pair in each game and the two extra mega legs. Built, not placed.
    date: "2026-11-09",
    title: "NBA alternate SGP legs",
    result: "miss",
    legs: [
      { name: "Pascal Siakam", market: "rebounds", side: "over", line: 5.5, actual: 9, result: "hit", model: { sport: "nba", key: "reb", p: 0.589 } },
      { name: "Dillon Brooks", market: "threes", side: "over", line: 1.5, actual: 1, result: "miss", model: { sport: "nba", key: "threes", p: 0.594 } },
      { name: "Onyeka Okongwu", market: "threes", side: "under", line: 1.5, actual: 2, result: "miss", model: { sport: "nba", key: "threes-under", p: 0.568 } },
      { name: "Evan Mobley", market: "rebounds", side: "over", line: 7.5, actual: 2, result: "miss", model: { sport: "nba", key: "reb", p: 0.579 } },
      { name: "Jamal Murray", market: "pts+reb+ast", side: "under", line: 33.5, actual: 42, result: "miss", model: { sport: "nba", key: "pra-under", p: 0.613 } },
      { name: "Miles Bridges", market: "assists", side: "over", line: 2.5, actual: 0, result: "miss", model: { sport: "nba", key: "ast", p: 0.58 } },
      { name: "Grizzlies at Raptors", market: "total points", side: "under", line: 227.5, actual: 220, result: "hit", model: { sport: "nba", key: "total-under", p: 0.508 }, price: -110, opposite: -110 },
      { name: "Wizards at Pistons", market: "total points", side: "under", line: 219.5, actual: 233, result: "miss", model: { sport: "nba", key: "total-under", p: 0.503 }, price: -110, opposite: -110 },
      { name: "Pelicans", market: "spread", side: "over", line: 11.5, actual: -51, result: "miss", price: -110, opposite: -110 },
    ],
  },
  // Nov 8. Model p is the mean of the fast and play-by-play engines.
  {
    date: "2026-11-08",
    title: "Week 10 NFL one-prop-per-game card (built, not placed whole)",
    result: "miss",
    legs: [
      { name: "Bijan Robinson", market: "rushing yards", side: "over", line: 96.5, actual: 100, result: "hit", model: { sport: "nfl", key: "rush", p: 0.629 }, price: -105 },
      { name: "Jonathan Taylor", market: "rushing yards", side: "under", line: 69.5, actual: 46, result: "hit", model: { sport: "nfl", key: "rush-under", p: 0.55 }, price: -105 },
      { name: "Cowboys at Colts", market: "total points", side: "under", line: 51.5, actual: 50, result: "hit", model: { sport: "nfl", key: "total-under", p: 0.59 }, price: -110, opposite: -110 },
      { name: "Travis Kelce", market: "receptions", side: "under", line: 4.5, actual: 4, result: "hit", model: { sport: "nfl", key: "rec-under", p: 0.728 }, price: -116, opposite: -104 },
      { name: "Jahmyr Gibbs", market: "rushing yards", side: "over", line: 98.5, actual: 74, result: "miss", model: { sport: "nfl", key: "rush", p: 0.6 }, price: -115, opposite: -105 },
      { name: "Denzel Boston", market: "receptions", side: "under", line: 3.5, actual: 6, result: "miss", model: { sport: "nfl", key: "rec-under", p: 0.713 }, price: -165 },
      // Emergency starter with no NFL snaps: the model had no rushing history and missed a mobile QB.
      { name: "Joe Milton", market: "rushing yards", side: "under", line: 22.5, actual: 64, result: "miss", model: { sport: "nfl", key: "rush-under", p: 0.807 }, price: -105, opposite: -115 },
      { name: "Stefon Diggs", market: "receiving yards", side: "over", line: 49.5, actual: 51, result: "hit", model: { sport: "nfl", key: "recyd", p: 0.683 }, price: -110, opposite: -110 },
      { name: "Bryce Young", market: "rushing yards", side: "under", line: 6.5, actual: 13, result: "miss", model: { sport: "nfl", key: "rush-under", p: 0.731 }, price: -100 },
      { name: "Dalton Schultz", market: "receptions", side: "under", line: 4.5, actual: 2, result: "hit", model: { sport: "nfl", key: "rec-under", p: 0.694 }, price: -167 },
      { name: "Rhamondre Stevenson", market: "receiving yards", side: "under", line: 25.5, actual: 46, result: "miss", model: { sport: "nfl", key: "recyd-under", p: 0.682 }, price: -115 },
      { name: "George Kittle", market: "receptions", side: "under", line: 6.5, actual: 4, result: "hit", model: { sport: "nfl", key: "rec-under", p: 0.835 }, price: -151 },
      { name: "Trey McBride", market: "receptions", side: "under", line: 7.5, actual: 7, result: "hit", model: { sport: "nfl", key: "rec-under", p: 0.704 }, price: -148 },
      { name: "Bucky Irving", market: "anytime touchdown", side: "over", line: 0.5, actual: 2, result: "hit", model: { sport: "nfl", key: "atd", p: 0.548 }, price: 106 },
    ],
  },
  {
    // Placed: card A with the Celtics moneyline in place of Tatum assists. McBride and Kittle are graded on the card above.
    date: "2026-11-08",
    title: "4 PM NFL + NBA 5-leg (placed, Celtics ML version)",
    result: "miss",
    legs: [
      { name: "Trey McBride", market: "receptions", side: "under", line: 7.5, actual: 7, result: "hit" },
      { name: "George Kittle", market: "receptions", side: "under", line: 6.5, actual: 4, result: "hit" },
      { name: "Giannis Antetokounmpo", market: "points", side: "under", line: 29.5, actual: 29, result: "hit", model: { sport: "nba", key: "pts-under", p: 0.597 }, price: -102, opposite: -118 },
      { name: "Celtics", market: "moneyline", side: "over", line: 0.5, actual: 1, result: "hit", price: -740, opposite: 527 },
      // Luka was ruled out; Austin Reaves scored 43 and the Lakers won 121-116.
      { name: "Pistons", market: "moneyline", side: "over", line: 0.5, actual: 0, result: "miss", price: -264, opposite: 217 },
    ],
  },
  // Nov 7, placed on Hard Rock. First card built with the consensus filter; model p is the mean of both engines.
  {
    date: "2026-11-07",
    title: "NBA 6-leg (placed), about +922",
    result: "miss",
    legs: [
      { name: "Nikola Jokic", market: "points", side: "under", line: 26.5, actual: 19, result: "hit", model: { sport: "nba", key: "pts-under", p: 0.609 }, price: -118, opposite: -102 },
      { name: "Evan Mobley", market: "points", side: "under", line: 19.5, actual: 12, result: "hit", model: { sport: "nba", key: "pts-under", p: 0.672 }, price: -115, opposite: -105 },
      { name: "Thunder", market: "moneyline", side: "over", line: 0.5, actual: 1, result: "hit", price: -598, opposite: 443 },
      { name: "Warriors", market: "moneyline", side: "over", line: 0.5, actual: 1, result: "hit", price: -273, opposite: 224 },
      { name: "Rockets", market: "moneyline", side: "over", line: 0.5, actual: 0, result: "miss", price: -270, opposite: 221 },
      { name: "Hawks", market: "moneyline", side: "over", line: 0.5, actual: 1, result: "hit", price: -283, opposite: 231 },
    ],
  },
  // Nov 6. Model p is the mean of the fast and play-by-play engines. The play-by-play engine was
  // set aside as miscalibrated that night; it had Maxey 29%, Brown assists 37%, Luka assists 39%, and was closer.
  {
    date: "2026-11-06",
    title: "NBA 5-leg, Hard Rock +779",
    result: "miss",
    legs: [
      { name: "Tyrese Maxey", market: "points", side: "over", line: 25.5, actual: 17, result: "miss", model: { sport: "nba", key: "pts", p: 0.42 }, price: -108, opposite: -112 },
      { name: "Jaylen Brown", market: "assists", side: "over", line: 3.5, actual: 5, result: "hit", model: { sport: "nba", key: "ast", p: 0.469 }, price: 100 },
      { name: "76ers", market: "moneyline", side: "over", line: 0.5, actual: 0, result: "miss", price: -148, opposite: 124 },
      { name: "Luka Doncic", market: "assists", side: "over", line: 6.5, actual: 5, result: "miss", model: { sport: "nba", key: "ast", p: 0.491 } },
      { name: "Spurs", market: "moneyline", side: "over", line: 0.5, actual: 1, result: "hit", price: -990, opposite: 650 },
    ],
  },
  {
    // Shared legs are graded once, on the card above.
    date: "2026-11-06",
    title: "NBA 6-leg spread-out version (option A)",
    result: "miss",
    legs: [
      { name: "Tyrese Maxey", market: "points", side: "over", line: 25.5, actual: 17, result: "miss" },
      { name: "Jaylen Brown", market: "assists", side: "over", line: 3.5, actual: 5, result: "hit" },
      { name: "Luka Doncic", market: "assists", side: "over", line: 6.5, actual: 5, result: "miss" },
      { name: "Spurs", market: "moneyline", side: "over", line: 0.5, actual: 1, result: "hit" },
      { name: "Mavericks", market: "moneyline", side: "over", line: 0.5, actual: 1, result: "hit", price: -277, opposite: 227 },
      { name: "Celtics", market: "moneyline", side: "over", line: 0.5, actual: 1, result: "hit", price: -344, opposite: 276 },
    ],
  },
  // Nov 5, both placed on Hard Rock. Model p is the mean of the fast and play-by-play engines
  // (they disagreed on several legs), after the live injury check with Tuten active.
  {
    date: "2026-11-05",
    title: "TNF 5-leg SGP, +1096, $10.26 to pay $122.70",
    result: "miss",
    legs: [
      { name: "Jaguars", market: "moneyline", side: "over", line: 0.5, actual: 1, result: "hit", price: -550, opposite: 410 },
      { name: "Chris Rodriguez Jr.", market: "anytime touchdown", side: "over", line: 0.5, actual: 1, result: "hit", model: { sport: "nfl", key: "atd", p: 0.319 }, price: 113 },
      { name: "Joe Fagnano", market: "passing yards", side: "over", line: 160.5, actual: 60, result: "miss", model: { sport: "nfl", key: "passyd", p: 0.581 } },
      { name: "Parker Washington", market: "anytime touchdown", side: "over", line: 0.5, actual: 1, result: "hit", model: { sport: "nfl", key: "atd", p: 0.34 }, price: 156 },
      { name: "Derrick Henry", market: "rushing yards", side: "under", line: 71.5, actual: 57, result: "hit", model: { sport: "nfl", key: "rush-under", p: 0.606 } },
    ],
  },
  {
    date: "2026-11-05",
    title: "TNF + Heat-Warriors 2-game SGP, +1914",
    result: "miss",
    legs: [
      { name: "Trevor Lawrence", market: "passing touchdowns", side: "over", line: 1.5, actual: 1, result: "miss", model: { sport: "nfl", key: "passtd", p: 0.651 }, price: -133, opposite: 100 },
      { name: "Rashod Bateman", market: "receiving yards", side: "over", line: 13.5, actual: 6, result: "miss", model: { sport: "nfl", key: "recyd", p: 0.652 } },
      { name: "Stephen Curry", market: "points", side: "over", line: 25.5, actual: 29, result: "hit", model: { sport: "nba", key: "pts", p: 0.595 } },
      { name: "Warriors", market: "moneyline", side: "over", line: 0.5, actual: 1, result: "hit", price: -281, opposite: 230 },
      { name: "De'Anthony Melton", market: "rebounds", side: "over", line: 3.5, actual: 6, result: "hit", model: { sport: "nba", key: "reb", p: 0.554 }, price: 103 },
      { name: "Giannis Antetokounmpo", market: "points", side: "under", line: 28.5, actual: 20, result: "hit", model: { sport: "nba", key: "pts-under", p: 0.68 } },
    ],
  },
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
