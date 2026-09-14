export const SABER_GLOSSARY = [
  {
    key: "barrelPa",
    label: "Brl/PA",
    blurb: "Barrels per plate appearance. The cleanest Statcast power tell for home-run cards.",
  },
  {
    key: "xslg",
    label: "xSLG",
    blurb: "Expected slugging from exit velo and launch angle — strips out park and defender luck.",
  },
  {
    key: "xwoba",
    label: "xwOBA",
    blurb: "Expected weighted on-base. Contact quality in one number; .320 is roughly average.",
  },
  {
    key: "xba",
    label: "xBA",
    blurb: "Expected batting average on contact quality. A gap vs AVG flags luck either way.",
  },
  {
    key: "hardHit",
    label: "Hard hit",
    blurb: "Share of batted balls at 95 mph or more.",
  },
  {
    key: "evAvg",
    label: "Avg EV",
    blurb: "Average exit velocity. Mid-90s is loud; low-80s is weak contact.",
  },
  {
    key: "wrcPlus",
    label: "wRC+",
    blurb: "Park- and league-adjusted run creation. 100 is average; 140 is a star season.",
  },
  {
    key: "war",
    label: "WAR",
    blurb: "Wins above replacement — batting, running, and fielding in one ledger.",
  },
  {
    key: "spd",
    label: "SPD",
    blurb: "Speed score. Useful for stolen-base leans, not for power.",
  },
  {
    key: "luckSlg",
    label: "Luck",
    blurb: "SLG minus xSLG. Positive is lucky (likely to cool); negative is due (contact has been unlucky).",
  },
  {
    key: "xera",
    label: "xERA",
    blurb: "Expected ERA from contact quality allowed. A gap vs ERA flags a pitcher likely to regress.",
  },
] as const;

export const PITCH_GLOSSARY = [
  {
    key: "heat",
    label: "Heat",
    blurb: "Four-seam, sinker, cutter. Usage bar in bone. A heat-first starter plus a hitter who mashes FF is the classic HR shape.",
  },
  {
    key: "break",
    label: "Break",
    blurb: "Slider, sweeper, curve, slurve. Brick on the mix bar. High whiff breaking balls juice punchout cards.",
  },
  {
    key: "off",
    label: "Offspeed",
    blurb: "Changeup, splitter, knuckle. Pine on the mix bar. Change-heavy lefties often suppress left-handed power.",
  },
  {
    key: "whiff",
    label: "Whiff%",
    blurb: "Swinging-strike rate on that pitch. Mid-30s on a sweeper is a wipeout; low-teens on a four-seam is batting-practice heat.",
  },
  {
    key: "usage",
    label: "Usage",
    blurb: "Share of the arsenal. The primary pitch is the one the hitter will see most tonight.",
  },
  {
    key: "rv100",
    label: "RV/100",
    blurb: "Run value per 100 pitches. For pitchers, positive is a plus pitch; for hitters, positive means they punish that type.",
  },
] as const;

export const EDGE_GLOSSARY = [
  {
    key: "platoon",
    label: "Platoon",
    blurb: "Live vs-LHP / vs-RHP SLG with 25+ PA. Same-side is not an automatic dock — a 40+ PA split at .455+ SLG is reverse-platoon.",
  },
  {
    key: "steal",
    label: "Steal climate",
    blurb: "Sprint speed plus the starter's steal-attempt rate and the catcher's CS% / pop time. Parks with extra SB also count.",
  },
  {
    key: "fly",
    label: "Fly-ball park",
    blurb: "Air-ball hitters in homer parks. Pull rate is the second tell — pulled flies leave yards.",
  },
  {
    key: "mix",
    label: "Pitch mix",
    blurb: "Usage-weighted barrels and xwOBA against the starter's whole mix — not just the primary pitch. A 50% four-seam diet vs a FF masher still counts, but so does the rest of the bag.",
  },
  {
    key: "climate",
    label: "K climate",
    blurb: "Starter K/9, opponent punchout rate, and the park's strikeout factor. Petco and Oracle play up; Coors plays down.",
  },
  {
    key: "luck",
    label: "Due",
    blurb: "SLG running behind xSLG. Contact quality says more extra-base hits are coming — unless the bat has a 6-day HR drought, in which case 'due' is ignored.",
  },
  {
    key: "home",
    label: "Home split",
    blurb: "OPS at home versus the season line. Some bats are park creatures; the split has to be 40+ PA.",
  },
  {
    key: "rbi",
    label: "RBI table",
    blurb: "Heart-of-order bats in front of a team that actually gets on base. Team OBP is the table-setter.",
  },
] as const;

export const SLIP_GLOSSARY = [
  {
    key: "power2",
    label: "Power 2",
    blurb: "Two-leg PrizePicks Power card. Leads with pitcher Ks. HR, hits, and TB overs vs aces never sit here. Names on this card never appear on Core 3 or Flex 6.",
  },
  {
    key: "core3",
    label: "Core 3",
    blurb: "Three mixed props, disjoint players from Power 2. Counting first: H+R+RBI, fantasy score, runs — those can sit vs an ace. Standard lines only. Caps two 1.5 juice lines unless the card would sit short.",
  },
  {
    key: "flex6",
    label: "Flex 6",
    blurb: "Six-leg Flex with leftover names. Demons live here. Counting 1.5s can fill. Goblin unders vs aces can fill. Soft names under 70 never repeat.",
  },
  {
    key: "exclusive",
    label: "No chalk copy",
    blurb: "Player IDs are exclusive across the three slips. A 77 HR over on Power 2 cannot also sit on Core 3 and Flex 6.",
  },
  {
    key: "demon",
    label: "Demon / goblin",
    blurb: "PrizePicks modifiers. Demons are over-only (need a higher hit rate). Goblins lean under. Standard is both sides.",
  },
  {
    key: "cover",
    label: "Cover",
    blurb: "Calibrated chance of clearing the posted line. Season and last-10 rates, mix multipliers, docked vs ace K/9 / xERA, then shrunk so 1.5 TB and H+R+RBI are not fake locks. Each leg is independent — the card % is not the product.",
  },
  {
    key: "ace",
    label: "Ace dock",
    blurb: "Wheeler / deGrom / Gilbert / Skenes territory (9.5+ K/9, or 9.0 K/9 with 3.05- xERA). HR, hits, and TB overs vs aces stay off. H+R+RBI, fantasy score, and runs can still sit. Openers and short starters are not aces — K overs skip them, counting gets a boost.",
  },
  {
    key: "recency",
    label: "Recency",
    blurb: "Last 6 days. Hot: average well above the season line. Cold: well below — HR% is docked so a cooling bat does not lead the board. Thin: short sample. Drought: 0 HR in 10+ PA — HR overs are off the card.",
  },
  {
    key: "opener",
    label: "Opener",
    blurb: "Short-outing probable (low GS, or ~3 IP/app). Not an ace. Do not buy 5.5+ Ks. Counting can rise if the bullpen is softer.",
  },
  {
    key: "fs",
    label: "Fantasy score",
    blurb: "PrizePicks hitter fantasy score. Modeled as TB + runs + RBI + SB + walks. Independent cover, same as H+R+RBI.",
  },
] as const;

export const GRADE_GLOSSARY = [
  {
    key: "ledger",
    label: "Daily grade",
    blurb: "Published 2/3/6 slips are stored on this device. After first pitch, the desk pulls MLB box scores — not PrizePicks — and marks each leg hit, miss, or DNP.",
  },
  {
    key: "open",
    label: "Open",
    blurb: "Game is still Preview or the player has not appeared. Partial Live boxes grade legs that already have PA or pitcher Ks; the rest stay open until Final.",
  },
  {
    key: "dnp",
    label: "DNP",
    blurb: "Final box, zero plate appearances and zero pitcher Ks. Scratches do not count against the hit rate.",
  },
  {
    key: "rate",
    label: "Ledger rate",
    blurb: "Hits over decided legs across saved cards. DNP is tracked separately. Saturday 9/12 is seeded at 9/11 so the book is never blank.",
  },
] as const;
