/**
 * Print the model's scorecard over every graded leg in the book:
 *
 *   node --experimental-strip-types src/lib/sim/score-cli.ts
 */
import { BOOK } from "../slips/book.ts";
import { bookLegs, scorecard, type Score } from "./score.ts";

const c = scorecard(bookLegs(BOOK));
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const s = (x: Score) => `Brier ${x.brier.toFixed(3)}  log loss ${x.logLoss.toFixed(3)}`;
console.log(`${c.n} graded model legs: ${c.hits} hit, ${c.expected.toFixed(1)} expected\n`);
console.log(`raw model      ${s(c.raw)}`);
console.log(`after trust    ${s(c.trusted)}`);
console.log(`flat hit rate  ${s(c.flat)}   <- the bar to clear`);
if (c.priced) {
  console.log(`\non ${c.priced.n} legs with a saved Hard Rock price:`);
  console.log(`  model        ${s(c.priced.model)}`);
  console.log(`  book no-vig  ${s(c.priced.market)}`);
  console.log(`  blend        ${s(c.priced.blended)}`);
} else console.log("\nno graded legs carry a saved price yet; record price and opposite when grading");
console.log("\nmodel said   legs   hit");
for (const b of c.bins) console.log(`${pct(b.from)}–${pct(b.to)}`.padEnd(13), String(b.n).padStart(4), pct(b.did).padStart(6), `  (avg said ${pct(b.said)})`);
console.log("\nmarket".padEnd(36), "legs  hit  expected");
for (const m of c.markets) console.log(m.key.padEnd(35), String(m.n).padStart(4), String(m.hits).padStart(4), m.expected.toFixed(1).padStart(9));
