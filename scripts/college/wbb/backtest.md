# WBB (NCAA D-I women's basketball) model — walk-forward backtest

Generated 2026-11-26 by `scripts/college/wbb/backtest.py` (10s). Data: ESPN scoreboard (groups=50) + core odds API (closing line; DraftKings preferred, else ESPN BET).

## Data & line coverage

- **2024-25**: 5965 completed games; closing spread on 0 (0.0%), total on 0 (scores only, used for the 2025-26 prior)
- **2025-26**: 6029 completed games; closing spread on 922 (15.3%), total on 920
- **2026-27 (to Nov 25)**: 1354 completed games; closing spread on 153 (11.3%), total on 153
- Walk-forward predictions (dates ≥ Nov 12): 2025-26 5509 games (885 lined); 2026-27 713 games (99 lined).

## Model

Ridge points model: `pts = mu ± h/2 + O_team + D_opp` (neutral → no home term), margin capped for training, O/D shrunk toward last season's final rating × rho (teams with <10 prior games, mostly non-D-I opponents, get a fixed 'unknown' prior). Re-fit each morning on games before that date only.

Tuned on margin MAE of **un-lined** 2025-26 games only (lined games, i.e. the ATS test set, never touched): lam=0.5, cap=45, rho=0.4, unknown prior O=-16/D=16 (MAE 10.32). Fitted home court (2025-26 full): 2.92 pts. Win-prob map: P(home) = Φ(margin/σ), σ = 12.6 (fit on 2025-26, log-loss 0.455).

## Accuracy (lined games)

| set | n | MAE model vs actual | MAE line vs actual | MAE model vs line | total: model MAE | total: line MAE | info slope b (SE) |
|---|---|---|---|---|---|---|---|
| 2025-26 all | 885 | 10.54 | 9.82 | 3.38 | 12.69 | 12.35 | +0.07 (0.08) |
| 2025-26 H1 | 442 | 11.24 | 9.97 | 4.75 | 12.75 | 12.49 | +0.03 (0.09) |
| 2025-26 H2 | 443 | 9.83 | 9.67 | 2.02 | 12.62 | 12.20 | +0.25 (0.21) |
| 2026-27 | 99 | 14.41 | 10.37 | 7.62 | 15.18 | 13.18 | -0.13 (0.14) |

*info slope b*: OLS of (actual margin − market margin) on (model margin − market margin). b≈0 → model adds nothing to the closing line; b>0 significantly → model has information the line lacks.

All games (incl. un-lined): 2025-26: model margin MAE 10.35, SU acc 77.2% (n=5509), 2026-27: model margin MAE 12.63, SU acc 79.4% (n=713)

Straight-up on lined games (both seasons, n=984): model 80.3% vs line favorite 82.1%.

## ATS vs closing spread (-110, pushes = no action)


**2025-26 H1 (20251112–20260129, n=442) — threshold selection**

| |edge| ≥ | W-L-P | win% [95% CI] | ROI @-110 [95% CI] |
|---|---|---|---|
| 0 | 227-215-0 | 51.4% [46.7, 56.0] | -2.0% [-10.8, +6.9] |
| 2 | 143-140-0 | 50.5% [44.7, 56.3] | -3.5% [-14.6, +7.5] |
| 3 | 115-113-0 | 50.4% [44.0, 56.9] | -3.7% [-16.0, +8.6] |
| 5 | 85-84-0 | 50.3% [42.8, 57.7] | -4.0% [-18.2, +10.2] |
| 7 | 54-59-0 | 47.8% [38.8, 56.9] | -8.8% [-25.9, +8.7] |

**2025-26 H2 (20260129–20260405, n=443) — held out**

| |edge| ≥ | W-L-P | win% [95% CI] | ROI @-110 [95% CI] |
|---|---|---|---|
| 0 | 235-208-0 | 53.0% [48.4, 57.6] | +1.3% [-7.6, +10.1] |
| 2 | 84-89-0 | 48.6% [41.2, 56.0] | -7.3% [-21.3, +6.8] |
| 3 | 36-48-0 | 42.9% [32.8, 53.5] | -18.2% [-37.4, +2.2] |
| 5 | 19-14-0 | 57.6% [40.8, 72.8] | +9.9% [-22.1, +38.9] |
| 7 | 9-7-0 | 56.2% [33.2, 76.9] | +7.4% [-36.7, +46.8] |

**2026-27 to date (n=99) — fully held out**

| |edge| ≥ | W-L-P | win% [95% CI] | ROI @-110 [95% CI] |
|---|---|---|---|
| 0 | 42-57-0 | 42.4% [33.2, 52.3] | -19.0% [-36.7, -0.2] |
| 2 | 31-50-0 | 38.3% [28.4, 49.2] | -26.9% [-45.7, -6.2] |
| 3 | 26-48-0 | 35.1% [25.2, 46.5] | -32.9% [-51.8, -11.2] |
| 5 | 20-40-0 | 33.3% [22.7, 45.9] | -36.4% [-56.6, -12.3] |
| 7 | 13-32-0 | 28.9% [17.7, 43.4] | -44.8% [-66.2, -17.2] |

**2026-27 H1 (20261112–20261118, n=49)**

| |edge| ≥ | W-L-P | win% [95% CI] | ROI @-110 [95% CI] |
|---|---|---|---|
| 0 | 21-28-0 | 42.9% [30.0, 56.7] | -18.2% [-42.7, +8.3] |
| 2 | 14-24-0 | 36.8% [23.4, 52.7] | -29.7% [-55.4, +0.6] |
| 3 | 12-22-0 | 35.3% [21.5, 52.1] | -32.6% [-59.0, -0.6] |
| 5 | 10-18-0 | 35.7% [20.7, 54.2] | -31.8% [-60.5, +3.4] |
| 7 | 9-14-0 | 39.1% [22.2, 59.2] | -25.3% [-57.7, +13.0] |

**2026-27 H2 (20261118–20261126, n=50)**

| |edge| ≥ | W-L-P | win% [95% CI] | ROI @-110 [95% CI] |
|---|---|---|---|
| 0 | 21-29-0 | 42.0% [29.4, 55.8] | -19.8% [-43.9, +6.5] |
| 2 | 17-26-0 | 39.5% [26.4, 54.4] | -24.5% [-49.7, +3.9] |
| 3 | 14-26-0 | 35.0% [22.1, 50.5] | -33.2% [-57.7, -3.6] |
| 5 | 10-22-0 | 31.2% [18.0, 48.6] | -40.3% [-65.7, -7.3] |
| 7 | 4-18-0 | 18.2% [7.3, 38.5] | -65.3% [-86.1, -26.5] |

Secondary: same rule vs the **opening** spread (bet at open, graded vs result):

**2025-26 + 2026-27 vs open**

| |edge| ≥ | W-L-P | win% [95% CI] | ROI @-110 [95% CI] |
|---|---|---|---|
| 0 | 495-488-0 | 50.4% [47.2, 53.5] | -3.9% [-9.8, +2.1] |
| 2 | 251-252-0 | 49.9% [45.5, 54.3] | -4.7% [-13.0, +3.6] |
| 3 | 177-190-0 | 48.2% [43.2, 53.3] | -7.9% [-17.6, +1.8] |
| 5 | 118-114-0 | 50.9% [44.5, 57.2] | -2.9% [-15.1, +9.3] |
| 7 | 76-74-0 | 50.7% [42.7, 58.6] | -3.3% [-18.4, +11.8] |

## Totals vs closing O/U


**2025-26 H1 totals**

| |edge| ≥ | W-L-P | win% [95% CI] | ROI @-110 [95% CI] |
|---|---|---|---|
| 0 | 240-197-0 | 54.9% [50.2, 59.5] | +4.8% [-4.1, +13.6] |
| 2 | 152-123-0 | 55.3% [49.4, 61.0] | +5.5% [-5.8, +16.5] |
| 3 | 116-98-0 | 54.2% [47.5, 60.7] | +3.5% [-9.3, +16.0] |
| 5 | 64-48-0 | 57.1% [47.9, 65.9] | +9.1% [-8.6, +25.8] |
| 7 | 34-25-0 | 57.6% [44.9, 69.4] | +10.0% [-14.2, +32.5] |

**2025-26 H2 totals — held out**

| |edge| ≥ | W-L-P | win% [95% CI] | ROI @-110 [95% CI] |
|---|---|---|---|
| 0 | 216-227-0 | 48.8% [44.1, 53.4] | -6.9% [-15.7, +2.0] |
| 2 | 119-127-0 | 48.4% [42.2, 54.6] | -7.6% [-19.4, +4.2] |
| 3 | 80-79-0 | 50.3% [42.6, 58.0] | -3.9% [-18.6, +10.7] |
| 5 | 37-27-0 | 57.8% [45.6, 69.1] | +10.4% [-12.9, +32.0] |
| 7 | 9-9-0 | 50.0% [29.0, 71.0] | -4.5% [-44.6, +35.5] |

**2026-27 totals — fully held out**

| |edge| ≥ | W-L-P | win% [95% CI] | ROI @-110 [95% CI] |
|---|---|---|---|
| 0 | 47-52-0 | 47.5% [37.9, 57.2] | -9.4% [-27.6, +9.2] |
| 2 | 40-44-0 | 47.6% [37.3, 58.2] | -9.1% [-28.8, +11.0] |
| 3 | 39-41-0 | 48.8% [38.1, 59.5] | -6.9% [-27.2, +13.6] |
| 5 | 26-33-0 | 44.1% [32.2, 56.7] | -15.9% [-38.6, +8.3] |
| 7 | 20-21-0 | 48.8% [34.3, 63.5] | -6.9% [-34.6, +21.3] |

## Threshold chosen on earlier half → out-of-sample result

- **Spread**: H1 best |edge| ≥ 2 (H1 143-140-0 | 50.5% [44.7, 56.3] | -3.5% [-14.6, +7.5]). 2025-26 H2: 84-89-0 | 48.6% [41.2, 56.0] | -7.3% [-21.3, +6.8]. 2026-27: 31-50-0 | 38.3% [28.4, 49.2] | -26.9% [-45.7, -6.2]. **Combined OOS: 115-139-0 | 45.3% [39.3, 51.4] | -13.6% [-25.0, -1.8]**.
- **Total**: H1 best |edge| ≥ 7 (H1 34-25-0 | 57.6% [44.9, 69.4] | +10.0% [-14.2, +32.5]). 2025-26 H2: 9-9-0 | 50.0% [29.0, 71.0] | -4.5% [-44.6, +35.5]. 2026-27: 20-21-0 | 48.8% [34.3, 63.5] | -6.9% [-34.6, +21.3]. **Combined OOS: 29-30-0 | 49.2% [36.8, 61.6] | -6.2% [-29.7, +17.5]**.
- (Per brief, within 2026-27 alone: H1 picks ≥2 → H2 17-26-0 | 39.5% [26.4, 54.4] | -24.5% [-49.7, +3.9]; tiny sample.)

Break-even at -110 is 52.38%. Edge is declared only if the out-of-sample 95% CI lower bound exceeds break-even.

**Verdict: spread edge = NO; total edge = NO.**

## Win-probability calibration (out of sample)


**2025-26 (σ fit here — in-sample for σ only)** — Brier 0.1504

| fav prob bin | n | mean predicted | actual fav win% |
|---|---|---|---|
| 0.50-0.60 | 968 | 55.0% | 53.9% |
| 0.60-0.70 | 981 | 64.8% | 62.6% |
| 0.70-0.80 | 1045 | 75.1% | 76.4% |
| 0.80-0.90 | 968 | 85.2% | 85.1% |
| 0.90-0.97 | 821 | 93.6% | 95.1% |
| 0.97-1.00 | 726 | 99.0% | 98.5% |

**2026-27 (held out)** — Brier 0.1359

| fav prob bin | n | mean predicted | actual fav win% |
|---|---|---|---|
| 0.50-0.60 | 92 | 54.9% | 44.6% |
| 0.60-0.70 | 75 | 65.0% | 66.7% |
| 0.70-0.80 | 105 | 75.4% | 71.4% |
| 0.80-0.90 | 112 | 84.9% | 78.6% |
| 0.90-0.97 | 127 | 93.7% | 90.6% |
| 0.97-1.00 | 202 | 99.2% | 97.5% |

On 736 games with closing moneylines: Brier model 0.1631 vs no-vig market 0.1574.


## Caveats

- Only ~15% of D-I WBB games have an ESPN-recorded line; lined games skew to high-major / TV games, which are the most efficiently priced.
- Hundreds of bets give a 95% CI of roughly ±5 percentage points on win%; a real but small edge (53–55%) cannot be confirmed or excluded at this sample size.
- Hyper-parameters were tuned on un-lined games' margins (no use of lines or lined results), so ATS numbers are out-of-sample; the threshold was chosen on the earlier half only.
- The model's margins are compressed vs. the market on blowout-type lined games (e.g. LSU/UConn vs low-majors: model +27 to +40 where the close was +50 to +75 and the result landed nearer the line). Regressing actual on predicted margin gives a slope ≈1.0 on un-lined games but ≈1.2–1.3 on lined games, so most 'edges' are just the model under-rating elite teams early in the season — a known weakness, not information.
- 2026-27 is only two weeks old: priors (last season × rho) are weak after portal/graduation turnover, and the line (MAE ~10.4) is far better than the model (MAE ~14.4). The win-prob map is also overconfident out of sample early in the season (e.g. 85% bin won 79%).
- Market efficiency check: the 'info slope' of the model's disagreement with the close is +0.07 ± 0.08 over a full season — statistically indistinguishable from zero. The closing line already contains everything this rating model knows.
