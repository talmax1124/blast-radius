# Great Run deployment and daily publication

This release targets **blast-radius as a separate app**. It does not modify AB at ab.arizonalol.com. The existing Great Run deployment is blastprops.grok.me; the owner is arranging separate hosting.

## Required configuration

Use the hosting provider's secret/environment controls. Never put passwords, API keys, or database URLs in Git.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Persistent Postgres database. The local embedded database resets with the process and is deliberately rejected by the scheduled endpoint. |
| `CRON_SECRET` | Long, random server-to-server bearer secret, shared with the scheduler. Both daily and existing intraday cron endpoints now require it. |
| `DESK_BASE_URL` | HTTPS app URL, used only by `npm run daily:run` on your scheduler. |
| `XAI_API_KEY` | Optional xAI API key for the morning research synthesis. |
| `RESEARCH_MODEL` | Optional model ID enabled for that xAI account. No model is guessed; without both model settings, the app publishes a source digest. |

Preserve the deployment's existing authentication configuration. This change does not configure a new identity provider or reuse the AB login.

## Build and migrate

1. Install the locked dependencies with `npm ci` using a current Node runtime compatible with the package requirements.
2. Set hosting environment variables, then run `npm run build`. The existing build command includes `npm run db:migrate`; it applies the new `0006_daily_research.sql` table along with outstanding migrations.
3. The current Nitro preset emits Vercel output. To host on a different runtime, configure the matching Nitro preset in `vite.config.ts` and use that runtime's deployment process. A static-only host cannot run these server functions.
4. Give the daily server request sufficient execution time for the existing sports data providers (allow at least five minutes and confirm real production duration). Use a worker/job runner if the host has shorter request limits.
5. Visit `/research`. Its source health, model mode, and persisted publication history distinguish actual results from mere configuration.

## Schedule

The target is **8:00 AM America/New_York**, including daylight saving time.

- Vercel: `vercel.json` includes 12:00 and 13:00 UTC candidates. The daily GET handler runs only during Eastern hour 08; the other candidate is a no-op. Preserve the existing intraday MLB jobs. Confirm the host's plan supports the configured schedule frequency. Scheduler dispatch timing is provider-dependent.
- Another scheduler: invoke `npm run daily:run` at 08:00 in `America/New_York`, with `DESK_BASE_URL` and `CRON_SECRET` in its environment. It sends an authenticated POST to `/api/desk/daily`. POST permits an explicit later retry; it is still idempotent for published tasks.
- A Codex follow-up is separately scheduled at 08:00 Eastern. It checks deployment readiness and can invoke the same protected job once the necessary host credentials are available. It does not replace an always-on hosting scheduler. Concurrent invocations are protected by database leases.

The endpoint saves five tasks: MLB, NFL, NHL, source-linked research, and the combined multi-sport slip board. The combined board waits for all three sport editions. Published tasks are immutable for the day. Failed tasks may retry; a crashed task's lease expires after 20 minutes. Already-running work is not reported as successful. Review `/research` and retry failures explicitly, or configure host retries after the lease period. Existing intraday MLB grading remains separate.

Publication means saved analytical editions inside this app. It does not place wagers or publish to social networks. Initial source/news coverage is ESPN MLB/NFL/NHL (dated reports from the last 72 hours), in addition to the existing sport model inputs. Text synthesis uses only supplied source summaries, validates reference IDs, and falls back to the source digest if generation fails. This is not independent fact-checking and does not establish predictive accuracy. The prose model does not modify numeric projections.

## Verify after hosting

- Missing bearer, wrong bearer, and a forged `x-vercel-cron` header must return 401 on both endpoints.
- `npm run daily:run` must return all five tasks as `published` or `already-published`.
- Run it a second time: it must not duplicate published tasks.
- `/research` must show five saved tasks for today's Eastern date; a failed task must be visible.
- NFL, NHL, and the overview should load the saved morning edition on a fresh visit. Their explicit refresh buttons still request live updates.
- Verify a real 08:00 run with the app closed. A configured schedule alone does not establish successful background execution.

## Validation performed

- TypeScript and Vite/Nitro builds passed locally.
- 61 focused sports/research tests passed, plus a PGLite integration test covering concurrent claims, duplicate suppression, retries, expired-lease recovery, and date/task isolation.
- Live preview loaded all three news feeds and 66 recent items during verification. Search, league/topic filters, and the empty state were checked in the browser.
- The pre-change full suite had 13 failures out of 195 script tests, including absent `.grok/skills/og` files, auth-schema fixtures, and platform metadata expectations. They are unrelated to this release; do not represent the full baseline suite as passing.
- Production deployment, AI synthesis with a paid model, and a real scheduled five-task publication still require hosting configuration and have not been verified.
