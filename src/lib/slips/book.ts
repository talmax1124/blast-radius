/** Graded cards. A leg stays open until the box is final. A ticket with a miss is a miss. */

export type BookLeg = {
  name: string;
  market: string;
  side: "over" | "under";
  line: number;
  actual: number | null;
  result: "hit" | "miss" | "open";
};

export type BookCard = {
  date: string;
  title: string;
  result: "hit" | "miss" | "open";
  legs: BookLeg[];
};

export const BOOK: BookCard[] = [
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
      { name: "Angel Reese", market: "points", side: "over", line: 15.5, actual: null, result: "open" },
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
