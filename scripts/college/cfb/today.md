# CFB picks - Thanksgiving Thu 11/26/2026 + Black Friday Fri 11/27/2026

Generated 2026-11-26 03:26 PM ET by `today.py`; lines = ESPN scoreboard (DraftKings) as fetched 2026-11-26T20:25:20Z. Model fit on all 1542 completed 2026 games (FBS+FCS), shrunk toward 2025 final ratings; hyperparameters frozen from the 2025 tuning in backtest.md.

## Verdict

* **Spreads: NO EDGE.** Rule frozen on 2025 (|model-line| >= 5, segment `all`) went 37-31-3 on 2026 weeks 5-13 (win 54.4%, 95% CI [42.7, 65.7], ROI +3.7%). Breakeven is 52.4%; the CI does not clear it, so no picks are flagged.
* **Totals: NO EDGE.** Rule frozen on 2025 (|model-line| >= 5, segment `all`) went 34-64-0 on 2026 weeks 5-13 (win 34.7%, 95% CI [26.0, 44.5], ROI -33.8%). Breakeven is 52.4%; the CI does not clear it, so no picks are flagged.

**Official picks: none - no edge**


## Full slate (informational only - model numbers are NOT picks)

Spread columns are from the home team's view (negative = home favored). `edge` = model minus market in points (spread edge > 0 means the model likes the home side). `blend` = market + 0.31 x (model - market) for spreads and 0.65 x for totals (weights fit on 2025; did not beat the plain line out of sample in 2026).

| kickoff (ET) | matchup | home line | model home | edge | blend home | total | model total | edge | blend total | pick |
|---|---|---|---|---|---|---|---|---|---|---|
| Thu 11/26 08:00 PM ET | TCU Horned Frogs @ Texas Tech Red Raiders | -14.0 | -11.5 | -2.5 | -13.2 | 46.5 | 51.4 | +4.9 | 49.7 | no edge |
| Fri 11/27 12:00 PM ET | Buffalo Bulls @ Akron Zips | +7.5 | +3.5 | +4.0 | +6.3 | 47.5 | 50.9 | +3.4 | 49.8 | no edge |
| Fri 11/27 12:00 PM ET | Nebraska Cornhuskers @ Iowa Hawkeyes | -3.5 | -3.7 | +0.2 | -3.6 | 40.5 | 42.7 | +2.2 | 41.9 | no edge |
| Fri 11/27 12:00 PM ET | Toledo Rockets @ Ohio Bobcats | +3.0 | +3.4 | -0.4 | +3.1 | 45.5 | 50.7 | +5.2 | 48.9 | no edge |
| Fri 11/27 12:00 PM ET | Mississippi State Bulldogs @ Ole Miss Rebels | -18.5 | -14.0 | -4.5 | -17.1 | 56.5 | 61.4 | +4.9 | 59.7 | no edge |
| Fri 11/27 12:00 PM ET | Tulsa Golden Hurricane @ UTSA Roadrunners | +1.5 | -3.0 | +4.5 | +0.1 | 56.5 | 57.0 | +0.5 | 56.8 | no edge |
| Fri 11/27 03:00 PM ET | App State Mountaineers @ South Alabama Jaguars | -3.5 | -3.6 | +0.1 | -3.5 | 56.5 | 58.4 | +1.9 | 57.7 | no edge |
| Fri 11/27 03:30 PM ET | Florida Gators @ Florida State Seminoles | +6.5 | +5.3 | +1.2 | +6.1 | 53.5 | 56.4 | +2.9 | 55.4 | no edge |
| Fri 11/27 03:30 PM ET | Temple Owls @ Memphis Tigers | -18.5 | -16.6 | -1.9 | -17.9 | 66.5 | 58.0 | -8.5 | 60.9 | no edge |
| Fri 11/27 03:30 PM ET | North Dakota State Bison @ San José State Spartans | +7.5 | +10.9 | -3.4 | +8.5 | 39.5 | 46.3 | +6.8 | 44.0 | no edge |
| Fri 11/27 04:30 PM ET | Air Force Falcons @ New Mexico Lobos | -6.5 | -9.3 | +2.8 | -7.4 | 42.5 | 46.5 | +4.0 | 45.1 | no edge |
| Fri 11/27 07:30 PM ET | Texas Longhorns @ Texas A&M Aggies | +11.5 | +9.2 | +2.3 | +10.8 | 40.5 | 46.8 | +6.3 | 44.6 | no edge |
| Fri 11/27 07:30 PM ET | Minnesota Golden Gophers @ Wisconsin Badgers | -7.5 | -11.0 | +3.5 | -8.6 | 37.5 | 38.7 | +1.2 | 38.3 | no edge |
| Fri 11/27 09:00 PM ET | West Virginia Mountaineers @ Utah Utes | -26.5 | -19.0 | -7.5 | -24.2 | 66.5 | 62.0 | -4.5 | 63.5 | no edge |

Note: the totals model sits above the market on most of this slate. Late-season weather, pace and injury news are priced by the market but not by the model, and in the 2026 out-of-sample test the model's over/under leans lost (see backtest.md) - treat the totals columns as diagnostics only.

Model home-field advantage: 2.92 pts; FCS group offset -33.9 vs FBS average. Points model: mu 24.5, home bump 2.77.

