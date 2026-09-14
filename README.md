# Blast Radius

In-browser MLB home-run and prop desk. Live slate, RotoWire cards, PrizePicks lines, and Statcast — scored into daily 2/3/6-man slips and a top-10 home-run board.

## What it does

- **Fetch & analyze** pulls tonight’s games, official lineups, PrizePicks board, and Statcast.
- **Power 2 / Core 3 / Flex 6** are exclusive (no shared players). Counting props can sit vs an ace; HR/hits/TB overs vs aces stay off.
- **Daily grades** live in a shared 7-day book. After first pitch, boxes mark each leg hit / miss / DNP. PrizePicks is not required to grade a saved card.
- Saturday 9/12 is seeded at **9/11** (Seymour 10 Ks; Baez and Pederson missed).

## Stack

TanStack Start, React 19, Tailwind v4. Auth is off. The grade book uses Postgres (Neon in production, PGLite in local preview).

## Develop

```sh
npm install
npm run dev
```

The desk expects the app on port 8080.

## Model

Current desk model is **2.0**: mix barrels vs arsenal, recency (hot/cold/thin/drought), reverse platoon, park/env, opener and short-start flags, juice floors on 1.5 counting lines.
