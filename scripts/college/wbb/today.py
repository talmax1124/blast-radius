#!/usr/bin/env python3
"""Today's WBB slate: model predictions for every game, picks only where the backtest supports an edge.

  python3 today.py [YYYYMMDD]   (default 20261126)
Refreshes the day's scoreboard + current odds from ESPN, fits on all final games before tip,
writes data/today_<date>.json and today.md.
"""
import json, os, sys, datetime as dt
from zoneinfo import ZoneInfo
import model as M
import fetch as F

ET = ZoneInfo("America/New_York")


def main():
    day = sys.argv[1] if len(sys.argv) > 1 else "20261126"
    P = json.load(open(os.path.join(M.DATA, "params.json")))
    params = {k: P[k] for k in ("lam", "cap", "unk_o", "unk_d")}
    sigma = P["sigma"]

    js = F.get_json(F.SB.format(d=day))
    slate = [F.condense_event(ev, day) for ev in (js or {}).get("events", [])]
    for g in slate:
        g["odds"] = F.condense_odds(F.get_json(F.ODDS.format(e=g["id"])))
    json.dump(slate, open(os.path.join(M.DATA, f"today_{day}.json"), "w"), indent=0)

    g25, g26, g27 = M.load("2025"), M.load("2026"), M.load("2027")
    R25 = M.fit(M.final_games(g25))
    R26 = M.fit(M.final_games(g26), prior=M.make_prior(R25, P["rho"]), params=params)
    prior = M.make_prior(R26, P["rho"])
    ids_today = {g["id"] for g in slate}
    train = [g for g in M.final_games(g27) if g["qdate"] < day and g["id"] not in ids_today]
    train += M.final_games(slate)  # today's already-finished games (no look-ahead for later tips)
    R = M.fit(train, prior=prior, params=params)

    rows = []
    now = dt.datetime.now(dt.timezone.utc)
    for g in sorted(slate, key=lambda x: x["date_utc"]):
        tip = dt.datetime.fromisoformat(g["date_utc"].replace("Z", "+00:00"))
        ph, pa = R.predict(g["home"]["id"], g["away"]["id"], g["neutral"], prior=prior)
        ln = M.pick_line(g)
        pm, pt = ph - pa, ph + pa
        r = {"id": g["id"], "tip_et": tip.astimezone(ET).strftime("%a %-I:%M %p ET"), "state": g["state"],
             "status": g["detail"], "home": g["home"]["name"], "away": g["away"]["name"], "neutral": g["neutral"],
             "pred_home": round(ph, 1), "pred_away": round(pa, 1), "pred_margin": round(pm, 1), "pred_total": round(pt, 1),
             "p_home": round(M.phi(pm / sigma), 3),
             "gp_home": R.games_played.get(g["home"]["id"], 0), "gp_away": R.games_played.get(g["away"]["id"], 0),
             "spread": ln["spread"] if ln else None, "total": ln["total"] if ln else None,
             "provider": ln["provider"] if ln else None, "pick": None}
        started = g["state"] != "pre" or tip <= now
        r["started"] = started
        if not started and r["spread"] is not None:
            e = pm + r["spread"]
            r["spread_edge"] = round(e, 1)
            if P.get("edge_spread") and abs(e) >= P["threshold_spread_from_2025_26_H1"]:
                r["pick"] = f"{r['home'] if e > 0 else r['away']} ATS"
        if not started and r["total"] is not None:
            e = pt - r["total"]
            r["total_edge"] = round(e, 1)
            if P.get("edge_total") and abs(e) >= P["threshold_total_from_2025_26_H1"]:
                r["pick"] = (r["pick"] + "; " if r["pick"] else "") + ("Over" if e > 0 else "Under")
        rows.append(r)
    json.dump(rows, open(os.path.join(M.DATA, f"today_preds_{day}.json"), "w"), indent=1)

    def spr(x):
        return "–" if x is None else (f"{x:+.1f}" if x else "PK")
    out = [f"# WBB slate — {dt.datetime.strptime(day, '%Y%m%d').strftime('%A %b %-d, %Y')}\n",
           f"Generated {now.astimezone(ET).strftime('%Y-%m-%d %-I:%M %p ET')} by `scripts/college/wbb/today.py`. "
           f"Ratings fit on {len(train)} final 2026-27 games (prior: 2025-26 final × {P['rho']}). Lines: ESPN core odds (current), home perspective.\n"]
    picks = [r for r in rows if r["pick"]]
    out.append("## Picks\n")
    if picks:
        for r in picks:
            out.append(f"- **{r['pick']}** — {r['away']} @ {r['home']}, {r['tip_et']} (model {r['pred_margin']:+.1f}, line {spr(r['spread'])}, total {r['pred_total']} vs {r['total']})")
    else:
        out.append(f"**No edge — no picks.** The walk-forward backtest did not show an out-of-sample edge "
                   f"(spread edge: {'yes' if P.get('edge_spread') else 'no'}, total edge: {'yes' if P.get('edge_total') else 'no'}; see backtest.md). "
                   "Model numbers below are informational only; where they disagree with the line, trust the line.\n")
    upcoming = [r for r in rows if not r["started"]]
    started = [r for r in rows if r["started"]]
    out.append(f"\n## Upcoming games ({len(upcoming)})\n")
    out.append("| tip (ET) | away @ home | model score (A–H) | model home margin | P(home) | line (home) | model−line | total model / line |")
    out.append("|---|---|---|---|---|---|---|---|")
    for r in upcoming:
        site = " (N)" if r["neutral"] else ""
        out.append(f"| {r['tip_et']} | {r['away']} @ {r['home']}{site} | {r['pred_away']:.0f}–{r['pred_home']:.0f} | {r['pred_margin']:+.1f} | {100*r['p_home']:.0f}% | "
                   f"{spr(r['spread'])} | {spr(r.get('spread_edge'))} | {r['pred_total']:.0f} / {r['total'] if r['total'] else '–'} |")
    out.append(f"\n## Skipped — already started or final ({len(started)})\n")
    for r in started:
        out.append(f"- {r['away']} @ {r['home']} — {r['status']}")
    out.append("\nNotes: (N) = neutral site (Thanksgiving tournaments). Teams with few games lean on the 2025-26 prior; "
               "P(home) = Φ(margin/σ), σ = %.1f." % sigma)
    open(os.path.join(M.HERE, "today.md"), "w").write("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
