export type SundayLeg = {
  player: string;
  prop: string;
  price: string;
  p: number;
  why: string;
};

export const SUNDAY_NFL = {
  title: "Sunday 3-leg",
  price: "+305",
  priceNote: "Multiplied from today's prices. No book has posted this ticket.",
  legs: [
    {
      player: "Jahmyr Gibbs",
      prop: "Anytime touchdown",
      price: "−325",
      p: 0.8,
      why: "Detroit at Carolina, Lions −3.5 and −192. BetMGM has anytime at −325. Action is −345. Either price clears by less than 5 points, so he is not sized.",
    },
    {
      player: "Trey McBride",
      prop: "Over 6.5 receptions",
      price: "−135",
      p: 0.72,
      why: "Arizona at the Giants, Cardinals −2.5. The 6.5 was −169. It is −130 to −144 now. A few books moved the number to 7.5 and pay plus money. This stake is the 6.5.",
    },
    {
      player: "Josh Allen",
      prop: "Over 0.5 rushing touchdowns",
      price: "−128",
      p: 0.72,
      why: "New England at Buffalo, Bills −7 and −305. The rushing score is −128, about where it was. Anytime touchdown is a different bet, around −130 to −145.",
    },
  ] satisfies SundayLeg[],
};

export function sundaySweep(): number {
  return SUNDAY_NFL.legs.reduce((p, leg) => p * leg.p, 1);
}
