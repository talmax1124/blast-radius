# Great Run

A multi-sport research desk: MLB home-run and counting-stat analysis, NFL projections, NHL shots, a combined board, market context, and a source-linked news edition.

The shared UI includes league navigation, readable data panels, analysis freshness, source health, and a research page with league, topic, and text filters. Morning publication persists sports editions and research independently, with database-backed duplicate protection and retryable failures.

## Local development

```sh
npm ci
npm run dev
```

Open http://localhost:8080. Local development uses an embedded database when `DATABASE_URL` is absent. Morning background publication requires persistent Postgres; local preview never claims that a real schedule has run.

## Checks

```sh
npm run typecheck
npm run test:research
npm run build:dev
```

See [deployment and daily publication](docs/DEPLOYMENT.md) for the 8 AM Eastern schedule, hosting variables, verification steps, coverage limits, and known baseline test failures.
