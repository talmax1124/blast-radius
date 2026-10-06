export const SABER_GLOSSARY = [
  {
    key: "launch",
    label: "Launch",
    blurb: "Average launch angle. Home runs live around 25–32°. Ground-ball bats at 8–12° do not go yard no matter the EV.",
  },
  {
    key: "pullAir",
    label: "Pull air",
    blurb: "Fly-ball rate times pull rate. The HR shape: pulled flies at a short porch. Opposite-field grounders are not.",
  },
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
    key: "parkHand",
    label: "Park hand",
    blurb: "LHB vs RHB HR factor. Yankee Stadium and GABP juice lefties; Fenway juices righties. Switch hitters stay at the overall park number.",
  },
  {
    key: "fbVelo",
    label: "FB velo",
    blurb: "Usage-weighted fastball velocity. 97+ mph four-seamers cut home runs; 92 mph heat is liftable.",
  },
  {
    key: "vsHandHr",
    label: "vs-hand HR",
    blurb: "Home-run rate against that pitcher's hand, 40+ PA. More HR-specific than a SLG split.",
  },
  {
    key: "pitchEnv",
    label: "Pitcher HR env",
    blurb: "HR/9 blended with ground-to-air ratio. A fly-ball 1.6 HR/9 is a different animal than a ground-ball 0.8.",
  },
  {
    key: "porch",
    label: "Porch",
    blurb: "Pull-air times the park factor. Short porch plus pulled flies is the HR shape.",
  },
  {
    key: "nightHr",
    label: "Night HR",
    blurb: "This bat's home-run rate in night games vs day games, shrunk toward the season rate. League night slates run a bit louder; Alvarez-type night mashers get a real bump, day-split bats get docked after dark.",
  },
  {
    key: "hrClock",
    label: "HR clock",
    blurb: "First-pitch hour of the games this player actually went yard, matched to tonight's start. Eight or more homers. A 7pm cluster does not help a 1pm game.",
  },
  {
    key: "xera",
    label: "xERA",
    blurb: "Expected ERA from contact quality allowed. A gap vs ERA flags a pitcher likely to regress.",
  },
  {
    key: "kRate",
    label: "K/BF",
    blurb: "Strikeouts per batter faced, shrunk with the last 10. More honest than K/9 when outing length moves around.",
  },
  {
    key: "expectedK",
    label: "Expected Ks",
    blurb: "K/BF times tonight's expected batters faced, park, the lineup's punchout rate vs that hand, and mix-weighted whiff. A 4.9 IP/GS starter is not a 6-inning K factory. Over 5.0 needs 6 Ks.",
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
  {
    key: "night",
    label: "Night masher",
    blurb: "A real day/night HR split, 80+ PA. Night mashers move up on night slates; day-split bats move up on getaway days.",
  },
] as const;

export const SLIP_GLOSSARY = [
  {
    key: "power2",
    label: "Power 2",
    blurb: "Two-leg PrizePicks Power card. Ks, 0.5 hits, 0.5 runs. 1.5 juice stays off Power — that is −EV at 3x. Break-even is 57.7% each.",
  },
  {
    key: "core3",
    label: "Core 3",
    blurb: "Three mixed props, disjoint from Power 2. Model 3.1 is K-led with one quality 1.5 allowed. Weak 1.5 H+R+RBI stays off — Saturday Core died on Báez, not on the market.",
  },
  {
    key: "flex6",
    label: "Flex 6",
    blurb: "Six-leg Flex with leftover names. Independent break-even is 54%. 3.1 posts Flex at 1.03x expected return. Two juice lines max. Same-game stacks are penalized.",
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
    blurb: "Calibrated chance of clearing the posted line. The card is not the average of those percents — PrizePicks EV is a Poisson-binomial over the payout table, then a same-game copula.",
  },
  {
    key: "ace",
    label: "Ace dock",
    blurb: "Wheeler / deGrom / Gilbert / Skenes territory (9.5+ K/9, or 9.0 K/9 with 3.05- xERA). HR, hits, and TB overs vs aces stay off. H+R+RBI, fantasy score, and runs can still sit. Openers and short starters are not aces — K overs skip them, counting gets a boost.",
  },
  {
    key: "recency",
    label: "Recency",
    blurb: "Last 6 days. Hot: average well above the season line. Cold: well below. Thin: short sample. Drought: 0 HR in 22+ PA — a quiet week is noise for a 30-HR bat, not a veto.",
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

export const WIRE_GLOSSARY = [
  {
    key: "tape",
    label: "Line tape",
    blurb: "Every PrizePicks MLB projection is snapped on the night-desk tick. Open is the first print of the day. Last is now. Close is the last print before first pitch.",
  },
  {
    key: "steam",
    label: "Steam",
    blurb: "The line moved a half-point or more toward our side vs open. Fade is the same move against us. The desk does not chase steam onto the locked 2/3/6.",
  },
  {
    key: "clv",
    label: "Closing line value",
    blurb: "Posted number vs the close. An over that closes higher (0.5 → 1.5) beat the close even if the night misses. CLV is the market's grade of the number, not the box score.",
  },
  {
    key: "plus",
    label: "+EV scan",
    blurb: "Cover minus juice. Standard juice is 50%, demons 58%, goblins 40%. A line at +8 or more is unposted value — it is not auto-added to the card.",
  },
  {
    key: "noauto",
    label: "No auto-bet",
    blurb: "The wire ranks and alerts. It never places a wager. Fetch remains a manual override. Sizing stays quarter-Kelly on the published 1u slips.",
  },
] as const;

export const BOOKS_GLOSSARY = [
  {
    key: "consensus",
    label: "Consensus",
    blurb: "Action Network's blended number across US books. Open is the first print of the day. DraftKings, FanDuel, BetMGM, and BetRivers sit next to it so you can shop the moneyline and total.",
  },
  {
    key: "hold",
    label: "Hold",
    blurb: "Over implied plus under implied minus 1. A 4–6% hold is a clean number. Double-digit hold is juice — the book is charging more than the pick'em floor.",
  },
  {
    key: "shop",
    label: "Line shop",
    blurb: "PrizePicks number vs Bovada. If PrizePicks is 6.5 Ks and the book is 7.5, the pick'em over is the softer number. That is leak, not an auto-bet.",
  },
  {
    key: "implied",
    label: "Implied",
    blurb: "American odds converted to a win rate, juice in. +600 to hit a homer is about 14%. Compare that to the desk's cover — a gap is the book's grade of the same prop.",
  },
  {
    key: "nokey",
    label: "No paid key",
    blurb: "The Odds API, SharpAPI, and OddsPapi all need a key and gate player props. The desk uses public Action Network and Bovada feeds plus the PrizePicks partner board. It never places a wager.",
  },
] as const;

export const SOURCE_GLOSSARY = [
  {
    key: "live",
    label: "Live",
    blurb: "Answered on this tick with no API key. The desk uses a subset: MLB Stats, Savant, PrizePicks, RotoWire, Open-Meteo, Action Network, Bovada, Pinnacle, Underdog, ESPN, Kalshi.",
  },
  {
    key: "key",
    label: "Needs a key",
    blurb: "A free tier exists but it will not answer without signup. The Odds API (500 credits), SharpAPI (12/min), OddsPapi (250/mo), SportsGameOdds amateur, OpenWeather.",
  },
  {
    key: "blocked",
    label: "Blocked",
    blurb: "The URL exists and is free in a browser, but this desk gets Cloudflare or 403: DraftKings sportsbook, FanGraphs, Sofascore, BetOnline.",
  },
] as const;

export const TAPE_GLOSSARY = [
  {
    key: "open",
    label: "Open / last / close",
    blurb: "Open is the morning print (Action Network Open, or the first tick of the day). Last is now. Close freezes at first pitch. The desk snaps the board on every night-desk tick and every three minutes while this page is open.",
  },
  {
    key: "steam",
    label: "Steam",
    blurb: "The favorite juiced 15 cents or more vs open, or the total moved a half-run. Fade is the favorite getting shorter. The tape records it. It does not chase it onto the 2/3/6.",
  },
  {
    key: "rlm",
    label: "Reverse line",
    blurb: "The favorite got shorter (–180 → –155). That is money on the dog, or a book laying off the public side. Not a bet — a tell.",
  },
  {
    key: "total",
    label: "Total",
    blurb: "Consensus runs line. Up a half vs open is over steam; down is under steam. Hold still lives on the Books page.",
  },
  {
    key: "prop",
    label: "Prop tape",
    blurb: "Bovada and Underdog player-prop Americans. A 25-cent juice vs the first print is a move. Shop those against PrizePicks on Books.",
  },
  {
    key: "nobet",
    label: "No auto-bet",
    blurb: "The tape is a record, not a ticket. The desk never places a wager. Sizing stays on the published 1u slips.",
  },
] as const;

export const GRADE_GLOSSARY = [
  {
    key: "ledger",
    label: "Daily grade",
    blurb: "Published 2/3/6 slips are stored on this device and in the shared book. After first pitch, the desk pulls MLB box scores — not PrizePicks — and marks each leg hit, miss, or DNP.",
  },
  {
    key: "payout",
    label: "Power / Flex",
    blurb: "Legs are not the card. Power 2 pays 3x if both hit. Core 3 is Power — 6x only if all three hit. Flex 6 pays 25x / 2x / 0.4x for 6/6, 5/6, 4/6. Standard PrizePicks chart, September 2026.",
  },
  {
    key: "units",
    label: "Units",
    blurb: "One unit per slip. Return minus stake: Cash 3x is +2.0u, a loss is −1.0u, Flex 2x is +1.0u. Saturday 9/12 went 9/11 legs and still only +2.0u because Core 3 lost.",
  },
  {
    key: "open",
    label: "Open",
    blurb: "Game is still Preview or the player has not appeared. Partial Live boxes grade legs that already have PA or pitcher Ks; the rest stay open until Final.",
  },
  {
    key: "dnp",
    label: "DNP",
    blurb: "Final box, zero plate appearances and zero pitcher Ks. Scratches drop the card size — a 6-flex becomes a 5-flex (10x / 2x / 0.4x). One remaining pick voids and returns the stake.",
  },
  {
    key: "brier",
    label: "Brier / log-loss",
    blurb: "Calibration of cover vs the binary result. Brier is mean (p − y)² — 0 is perfect, 0.25 is a coin flip. Log-loss clamps p to 2–98% so a 99% miss cannot explode the book.",
  },
  {
    key: "expected",
    label: "Expected hits",
    blurb: "Sum of independent cover probabilities on decided legs. Actual minus expected is luck. The card multiplier uses a Poisson-binomial over those same covers — not the product of the three slips.",
  },
  {
    key: "smash",
    label: "Smash",
    blurb: "A hit that cleared the line by 2 or more (Seymour 10 vs 5.5 Ks). Margin is side-adjusted: overs count actual − line, unders count line − actual.",
  },
  {
    key: "leak",
    label: "Market leak",
    blurb: "Hit rate and Brier by prop. A 9/11 card can still hide a dead market — Saturday’s HR board went 0/10 while counting carried Flex.",
  },
  {
    key: "ev",
    label: "Expected value",
    blurb: "Expected multiplier from the PrizePicks chart and the cover vector. Power 2 at 82% / 70% is 1.72x. Independent first, then a Gaussian copula if two legs share a game. Units = EV − 1.",
  },
  {
    key: "breakeven",
    label: "Break-even",
    blurb: "Cover each equal leg needs for EV = 1.0x. Power 2: 57.7%. Power 3: 55.0%. Flex 6: 54.2%. A 55% counting pair is −EV on Power and +EV on Flex.",
  },
  {
    key: "kelly",
    label: "Quarter Kelly",
    blurb: "Log-utility stake from the correlated payout distribution, divided by four. Pass / Half / Full / Max is that fraction mapped onto a 1u published card. The desk still posts 1u slips.",
  },
  {
    key: "corr",
    label: "Same-game ρ",
    blurb: "Teammate counting overs correlate ~0.24; pitcher K vs opposing hits/TB is negative. Power likes clustered overs. Flex gets a stack haircut so three Brewers do not become the 6-man.",
  },
  {
    key: "drag",
    label: "Drag",
    blurb: "Leave-one-out: EV with the leg minus EV if that leg DNPs (size drops, payout table reprices). A 35% third on Power 3 can be worth less than the 2-man of the first two.",
  },
  {
    key: "powerflex",
    label: "Power vs Flex",
    blurb: "Same names, both charts. Core 3 stays Power (6x or zero) unless the note says otherwise. Saturday Core 3 was 1.05x Power vs 0.94x Flex — Power was correct; Báez was variance.",
  },
  {
    key: "folio",
    label: "Folio",
    blurb: "The masthead line: volume, issue number (day of year), Home run desk, and the long date. Vol. 2 is the 3.x model book.",
  },
  {
    key: "lede",
    label: "Lede / nut",
    blurb: "The recap column. The lede is what happened on the last Final card. The nut graf is what it means for tonight. Dateline is DESK NOTES — not a city line.",
  },
  {
    key: "agate",
    label: "Agate",
    blurb: "The tiny box-score type next to the recap. Last name, team, line, actual, then H / — / DNP. Legs are not the card — the slip header still carries the Power/Flex payout.",
  },
] as const;
