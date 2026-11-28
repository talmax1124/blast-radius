#!/usr/bin/env python3
"""Today's CBB slate: model lines vs DraftKings lines, with picks only where the
walk-forward backtest (backtest.py -> data/backtest_result.json) showed an out-of-sample edge.

Refreshes today's scoreboard + odds, fits ratings on all games before today with the
configurations chosen in the backtest, applies the same walk-forward calibration, writes today.md.
"""
import json, os, datetime as dt
from zoneinfo import ZoneInfo
import fetch as F
import model as M
import backtest as B

TODAY = F.TODAY
ET = ZoneInfo("America/New_York")


def tip_et(iso):
    t = dt.datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return t.astimezone(ET)


def config_preds(cfg, games_today):
    """Fit on games before TODAY with cfg; return {id: (margin, total)} calibrated if cfg['cal']."""
    prior = M.build_prior(B.prev, cfg["reg"])
    dflt = tuple(cfg["reg"] * x for x in prior["default"]) if cfg["reg"] else (0.0, 0.0)
    R = M.fit(M.completed_games("games_2027.json", before=TODAY), prior=prior, lam=cfg["lam"],
              cap=B.CAP, hca=B.HCA, default_prior=dflt)
    cal = (0.0, 1.0, 0.0, 1.0)
    if cfg["cal"]:
        hist = B.run(cfg["lam"], cfg["reg"], keep_warm=True)   # walk-forward rows WARM..yesterday
        ps = [r for r in hist if r["spread"] is not None]
        pt = [r for r in hist if r["line_total"] is not None]
        am, bm = B.ols([r["m_margin"] for r in ps], [r["margin"] for r in ps])
        at, bt = B.ols([r["m_total"] for r in pt], [r["total"] for r in pt])
        cal = (am, bm, at, bt)
    out = {}
    for g in games_today:
        mm, mt, _, _ = M.predict(R, g)
        out[g["id"]] = (cal[0] + cal[1] * mm, cal[2] + cal[3] * mt,
                        R["n"].get(g["home_id"], 0), R["n"].get(g["away_id"], 0))
    return out, cal


def main():
    F.fetch_season("games_2027.json", TODAY, TODAY, refetch_recent=1)
    season = M.load_json("games_2027.json", {})
    games = season.get(TODAY, [])
    F.fetch_odds([g["id"] for g in games], refresh=[g["id"] for g in games])
    odds = M.load_json("odds.json", {})
    res = M.load_json("backtest_result.json")
    now = dt.datetime.now(dt.timezone.utc)

    sp_cfg, tot_cfg = res["spread"], res["total"]
    p_sp, cal_sp = config_preds(sp_cfg, games)
    p_tot, cal_tot = config_preds(tot_cfg, games)

    rows, skipped, nolines = [], [], []
    for g in sorted(games, key=lambda x: x["start"]):
        tip = tip_et(g["start"])
        sp, tot = M.market(odds, g)
        started = g["state"] != "pre" or tip.astimezone(dt.timezone.utc) <= now
        if started:
            skipped.append((g, tip)); continue
        if sp is None and tot is None:
            nolines.append((g, tip)); continue
        mm = p_sp[g["id"]][0]; mt = p_tot[g["id"]][1]
        nh, na = p_sp[g["id"]][2], p_sp[g["id"]][3]
        rows.append({"g": g, "tip": tip, "sp": sp, "tot": tot, "mm": mm, "mt": mt, "nh": nh, "na": na,
                     "sp_edge": (mm + sp) if sp is not None else None,
                     "tot_edge": (mt - tot) if tot is not None else None})

    picks = []
    for r in rows:
        g = r["g"]
        if res["edge"]["spread"] != "none" and r["sp_edge"] is not None and abs(r["sp_edge"]) >= sp_cfg["threshold"]:
            side = g["home"] if r["sp_edge"] > 0 else g["away"]
            line = r["sp"] if r["sp_edge"] > 0 else -r["sp"]
            picks.append((r, "spread", f"{side} {line:+g}", r["sp_edge"]))
        if res["edge"]["total"] != "none" and r["tot_edge"] is not None and abs(r["tot_edge"]) >= tot_cfg["threshold"]:
            side = "Over" if r["tot_edge"] > 0 else "Under"
            picks.append((r, "total", f"{side} {r['tot']:g}", r["tot_edge"]))

    def matchup(g):
        return f"{g['away']} {'vs' if g['neutral'] else '@'} {g['home']}"

    L = []
    P = L.append
    P(f"# CBB picks — {TODAY[:4]}-{TODAY[4:6]}-{TODAY[6:]} (Thanksgiving)\n")
    P(f"Generated {now.astimezone(ET):%Y-%m-%d %H:%M} ET by `today.py`. Lines: DraftKings via ESPN "
      f"(current number at generation time). Model: ratings fit on all D-I games through "
      f"{(dt.date(int(TODAY[:4]), int(TODAY[4:6]), int(TODAY[6:])) - dt.timedelta(days=1)).isoformat()}; "
      f"spreads use λ={sp_cfg['lam']:g}, prior regress={sp_cfg['reg']:g}"
      f"{', calibrated' if sp_cfg['cal'] else ''}; totals use λ={tot_cfg['lam']:g}, prior regress={tot_cfg['reg']:g}"
      f"{', calibrated (actual ≈ %.1f + %.3f·model)' % (cal_tot[2], cal_tot[3]) if tot_cfg['cal'] else ''}.\n")

    P("## Verdict from the backtest (see backtest.md)\n")
    for k, cfg in (("Spreads", sp_cfg), ("Totals", tot_cfg)):
        e = res["edge"][k.lower()[:-1]]
        P(f"- **{k}: {'NO EDGE' if e == 'none' else ('WEAK / UNPROVEN edge' if e == 'weak' else 'edge')}** — "
          f"threshold ≥{cfg['threshold']} pts chosen on Nov 12–18; out of sample (Nov 19–25) "
          f"{cfg['test_w']}-{cfg['test_l']}-{cfg['test_p']}, ROI {100*cfg['test_roi']:+.1f}% "
          f"(95% CI {100*cfg['test_roi_lo']:+.1f}% to {100*cfg['test_roi_hi']:+.1f}%).")
    P("")

    P("## Picks\n")
    if not picks:
        P("**No edge — no picks today.** No upcoming game clears a threshold that held up out of sample.\n")
    else:
        P("Only totals qualify (spreads showed no edge). These are **low-confidence**: the out-of-sample "
          f"sample is {tot_cfg['test_w'] + tot_cfg['test_l']} bets and its ROI CI includes losing money. "
          "Treat as small-stake / tracking plays, not proven edges.\n")
        P("| tip (ET) | game | pick | market | model | edge | games played (away/home) |")
        P("|---|---|---|---|---|---|---|")
        for r, kind, label, edge in picks:
            g = r["g"]
            mk = f"O/U {r['tot']:g}" if kind == "total" else f"{g['home_abbr']} {r['sp']:+g}"
            md = f"{r['mt']:.1f}" if kind == "total" else f"{g['home_abbr']} {-r['mm']:+.1f}"
            P(f"| {r['tip']:%I:%M %p} | {matchup(g)} | **{label}** | {mk} | {md} | {edge:+.1f} | {r['na']}/{r['nh']} |")
        P("")

    P("## Full slate (upcoming games with a posted line)\n")
    P("Spread shown from the home team's perspective (negative = home favored). Edge = model − market "
      "(spread edge > 0 means the model likes the home side).\n")
    P("| tip (ET) | game | site | DK spread | model spread | spread edge | DK total | model total | total edge |")
    P("|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        g = r["g"]
        dk_sp = "" if r["sp"] is None else f"{g['home_abbr']} {r['sp']:+g}"
        sp_e = "" if r["sp_edge"] is None else f"{r['sp_edge']:+.1f}"
        dk_t = "" if r["tot"] is None else f"{r['tot']:g}"
        t_e = "" if r["tot_edge"] is None else f"{r['tot_edge']:+.1f}"
        site = "neutral" if g["neutral"] else "home"
        P(f"| {r['tip']:%I:%M %p} | {matchup(g)} | {site} | {dk_sp} | {g['home_abbr']} {-r['mm']:+.1f} | "
          f"{sp_e} | {dk_t} | {r['mt']:.1f} | {t_e} |")
    if not rows:
        P("| – | no upcoming games with lines | | | | | | | |")
    P("")
    if skipped:
        P("## Skipped (already started or final at generation time)\n")
        for g, tip in skipped:
            sc = f" — {g['away_score']}-{g['home_score']}" if g["home_score"] is not None else ""
            P(f"- {tip:%I:%M %p} ET {matchup(g)} ({g['status']}{sc})")
        P("")
    if nolines:
        P("## Upcoming, no line posted (not evaluated)\n")
        for g, tip in nolines:
            P(f"- {tip:%I:%M %p} ET {matchup(g)}")
        P("")
    P("## Caveats\n")
    P("- Early season: most teams have 5–7 games; ratings are noisy, injuries/rotations are not modelled.")
    P("- The backtest covers only Nov 12–25 (≈650 lined games, ≈60 out-of-sample totals bets at the chosen "
      "threshold). The market's closing number has a lower MAE than the model for both spreads and totals.")
    P("- Totals out-of-sample wins came mostly from overs during an over-heavy week; that may not persist.")
    P("- Lines move: re-check the number before betting; an edge computed vs. the close is not the same as vs. "
      "an early number.")
    with open(os.path.join(M.HERE, "today.md"), "w") as f:
        f.write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
