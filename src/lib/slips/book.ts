/** Graded cards. The desk records a result only after the box is final. */

export type BookLeg = {
  name: string;
  market: string;
  side: "over" | "under";
  line: number;
  actual: number;
  result: "hit" | "miss";
};

export type BookCard = {
  date: string;
  title: string;
  result: "hit" | "miss";
  legs: BookLeg[];
};

export const BOOK: BookCard[] = [
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
