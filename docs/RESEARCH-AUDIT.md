# Research workbench: Arizona comparison and implementation

Inspected the signed-in member experience at https://ab.arizonalol.com on October 5, 2026. This is a feature and interface audit, not validation of Arizona's private models or statistical claims. AB remains a separate app; no private source code, chat messages, or account settings were copied.

## What the live reference does well

- Live game view: dated multi-league schedules, scores and game states, baseball pitch/at-bat context, batting order, box scores, weather/roof information, replay and win-probability displays.
- MLB predictions: a projected score and win chance with starter, bullpen, and offense explanations. The page says it runs 4,000 simulations and locks picks at first pitch; this was observed UI copy, not independently verified computation.
- HR Radar: game and handedness filters; player/team search; probability, value, power and long-shot sorting; separate model, no-vig market and blended numbers; sportsbook/provider labels; lineup position; season HR/PA; pitcher, park, weather, and head-to-head explanations; recent and opponent game logs.
- NFL TD and QB Radar: positional filters, recent box-score coverage counts, projected volume, scoring probabilities, passing TD/INT/yardage summaries, injury exclusions, and source-week labels for play-by-play and snap information.
- Lineups: MLB batting order and starting pitcher, with an explicit official label.
- NBA/NHL: date navigation, picks/standings, and a hockey Goal Radar entry. For the selected day, the picks view said all games had started; that is not evidence that pregame functionality is missing.

## Lessons rather than assumptions

The useful research pattern is game → player → underlying evidence. A generic news feed does not provide that workflow. Likewise, a probability label should not obscure the number: Arizona's HR detail called a 26% home-run chance “Strong chance.” Its NFL relative descriptions included “softest ... of 2,” which should not be mistaken for a league-wide ranking. Source IDs and calculations cannot independently establish calibration or predictive accuracy.

## Delivered in Great Run

- A dedicated game/player workbench, separated from News & daily edition.
- MLB, NFL, NBA, NHL schedules with an Eastern date selector, previous/next day, source retrieval times, and distinct loading/error/no-game states.
- Searchable game player tables; source starter flags and batting order; roster fallback before lineups are posted; no inferred starters or inferred healthy status.
- Player game logs with last 5/10/20 or full-season windows and home/away/opponent filters. Selected-day and future games are excluded from historical calculations. Doubleheaders retain separate event IDs.
- User-entered prop line, empirical overs/pushes, sample count, average, median, value bars, and the underlying table. Missing/compound values do not become zeros. Duplicated NFL labels are distinguished. MLB cumulative rate columns and innings notation are excluded from numerical prop calculations.
- Injury entries retain their original dates. Markets separate open/close/live phases and calculate no-vig shares only when both valid moneylines exist. OFF and missing quotes remain unavailable. No-vig market probability is not treated as an independent model edge.
- Game team stats, reported weather with roof uncertainty, linked news, and source links.
- Browser-local player watchlist and editable notes with storage-failure feedback.
- NBA added to the news feed. The authenticated daily research job also gathers source-linked matchup context (up to six games per league), including starter flags, dated injuries, market phases and weather. The optional configured text model receives those facts and coverage gaps as well as news. Citation validation applies to the exact sources supplied. No paid model runs occur just by browsing.
- Removed the static Sunday ticket, static Monday Eagles/Bears ticket, and the fixed Kelly stake example from live screens. These used frozen prices/probabilities while claiming to describe today.

## Meaning of the removed “Sized” label

The old Sunday card marked a leg Sized when its hard-coded probability minus its price's implied probability was at least 0.05 (five percentage points). This meant eligible for its stake calculation. It did not mean a bet was placed, a wager had positive verified value, or the probability was calibrated. Those hard-coded cards are no longer rendered.

## Current boundaries

ESPN is the workbench's current data provider; the existing sport desks retain their separate providers. Public feed schemas and availability can change. Game logs may lag recent games, rosters are current rather than historical, and live endpoint snapshots can differ briefly. Retrieval timestamps are not quote-update timestamps. The explorer has no connected multi-book prop comparison, snap-count/red-zone feed, Statcast pitch-level database, injury-news consensus model, or validated probability calibration. It does not imitate those capabilities with synthetic data. Existing sport model estimates remain separate from empirical research metrics.

The daily brief is a source-based text synthesis, not a newly trained probability model. Model key/name and persistent deployment configuration are still required to verify a real hosted morning edition. The user is hosting the app separately; this PR does not activate a new production deployment.


## Live game center and maps

The research schedule checks ESPN every 15 seconds while open. Selected in-progress games refresh every 15 seconds, pregame every minute, and completed games every five minutes for corrections. A shared server cache lasts ten seconds after successful retrieval and coalesces in-flight requests. Failed requests are not cached. Pause/resume, reconnect/focus recovery, last retrieval age, offline state, and stale/error labels are explicit. Browser background throttling still applies; this is not a server daemon or a guaranteed real-time stream.

The game center normalizes baseball plays and football drives, deduplicates IDs, and preserves feed order (baseball sequence numbers reset per at-bat). It shows source win probability, a scoring filter, MLB base occupancy and pitch coordinates, and NFL start/end field positions. Missing values remain unknown. Turnovers with incompatible coordinate frames are omitted. NBA/NHL shot maps are not implemented.

MLB venue maps use uniquely matched official MLB venue-directory coordinates and an attributed OpenStreetMap embed. Other sports receive a venue search link until verified coordinates are connected. ESPN venue photographs and reported weather remain source-labeled. No API key or location permission is required.

## Simulation lab

Inside each player dossier, open Simulation lab after entering a prop line. Its 20,000 seeded draws per scenario resample whole completed game rows, using the existing season/date/window/split filters. One or two statistics from the same player can be evaluated jointly, preserving their empirical dependence. Missing, nonnumeric, duplicated, and invalid-date observations are excluded; at least five complete games are required.

Lower and higher scenarios weight games by exp(tilt × clipped primary-stat z-score), alongside a uniform baseline. This changes resampling weights without inventing fractional counts or unseen stat pairs. Outputs include win/push/loss, exact weighted rates, effective sample size, the baseline distribution, an independence comparison, a 95% Wilson interval based on actual sample size, and Monte Carlo error based on trial count. These two kinds of uncertainty are intentionally separate.

An expanding-window diagnostic uses only prior Eastern dates, requires five training games, smooths the empirical joint probability as (wins + 1)/(games + 2), and reports Brier loss on held-out games. It is a retrospective diagnostic at the chosen threshold, not proof of prospective calibration. Tests use known perfectly dependent and opposing outcomes, boundary probabilities, Wilson reference values, missing data, deterministic draws, and no-future-data checks.

The simulation is a pregame empirical scenario tool. Live score, news, injuries, opponent strength, and weather do not automatically change its distribution. It does not yet simulate cross-player slips or full games, settle pushes by sportsbook rules, estimate payouts, or feed probabilities into the daily publishing pipeline. Existing daily models and text synthesis remain separate; this work must not be described as a trained, calibrated joint betting model.

Method references: [NIST Wilson intervals](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm) and [scikit-learn probability evaluation](https://scikit-learn.org/stable/modules/calibration.html).


## Manual grading removed

The board no longer exposes Hit/Miss actions. Source results are read-only. The old browser ledger mixed manual marks with automatic results and recorded no provenance, so it is preserved but excluded from both recommendation filtering and performance adjustments. A separate automatic-results ledger starts from source-reported outcomes; old mixed history is not migrated. This also prevents initial rendering from overwriting saved results before storage has loaded.
