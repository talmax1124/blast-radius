#!/usr/bin/env python3
"""Predict the Thanksgiving (Thu 11/26/2026) + Black Friday (Fri 11/27/2026) FBS slate.

Run after fetch.py (use `python3 fetch.py --slate` to refresh lines) and backtest.py (which writes
data/rules.json with frozen hyperparameters + the out-of-sample edge verdicts). Writes today.md.
"""
import json, os, sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import model as M

HERE = os.path.dirname(os.path.abspath(__file__))
ET = ZoneInfo("America/New_York")


def parse_spread_details(g):
    """Home spread from the scoreboard odds `details` string ('TTU -14', 'EVEN')."""
    o = g.get("sb_odds") or {}
    d = (o.get("details") or "").split()
    if o.get("spread") is not None:  # scoreboard `spread` is the home line; sanity-check sign vs details
        v = float(o["spread"])
        if d and d[0] == g["away_abbr"] and v < 0 or d and d[0] == g["home_abbr"] and v > 0:
            v = -v
        return v
    if not d:
        return None
    if d[0].upper() in ("EVEN", "PK", "PICK"):
        return 0.0
    try:
        v = float(d[-1])
    except ValueError:
        return None
    if d[0] == g["home_abbr"]:
        return v
    if d[0] == g["away_abbr"]:
        return -v
    return None


def seg_ok(seg, p4_both, fcs):
    return {"all": True, "p4": p4_both, "nonp4": not p4_both, "nonp4_fbs": (not p4_both) and not fcs}[seg]


def main():
    rules = json.load(open(os.path.join(M.DATA, "rules.json")))
    slate = json.load(open(os.path.join(M.DATA, "slate.json")))
    gs, done, tier = M.load_season(2026)
    prev = M.prev_season_models(2025)
    now = datetime.now(timezone.utc)
    ref = now.strftime("%Y-%m-%dT%H:%MZ")
    mm = M.fit_margin(done, tier, prev["rating"], prev["tier"], rules["margin_params"], ref)
    pm = M.fit_points(done, tier, prev["od"], prev["tier"], rules["points_params"], ref)
    wS, wT = rules["blend_w_spread"], rules["blend_w_total"]
    rs, rt = rules["rules"]["spread"], rules["rules"]["total"]

    rows, picks = [], []
    for g in sorted(slate["games"], key=lambda x: (x["date"], x["home"])):
        ko = datetime.fromisoformat(g["date"].replace("Z", "+00:00"))
        started = g.get("state") != "pre" or ko <= now
        sp = parse_spread_details(g)
        tl = (g.get("sb_odds") or {}).get("overUnder")
        pmarg = M.predict_margin(mm, g)
        ph, pa = M.predict_points(pm, g)
        ptot = ph + pa
        p4_both = M.is_p4(g, "home") and M.is_p4(g, "away")
        fcs = tier.get(g["home_id"]) != "FBS" or tier.get(g["away_id"]) != "FBS"
        r = {"kickoff_et": ko.astimezone(ET).strftime("%a %m/%d %I:%M %p ET"), "matchup": f"{g['away']} @ {g['home']}",
             "neutral": g["neutral"], "started": started, "status": g.get("status"),
             "line_spread_home": sp, "line_total": tl, "model_margin_home": pmarg, "model_total": ptot,
             "spread_edge": (pmarg - (-sp)) if sp is not None else None,
             "total_edge": (ptot - tl) if tl is not None else None, "p4_both": p4_both, "fcs": fcs,
             "home_abbr": g["home_abbr"], "away_abbr": g["away_abbr"]}
        r["spread_pick"] = r["total_pick"] = None
        if not started:
            if (sp is not None and rs["edge_supported"] and abs(r["spread_edge"]) >= rs["threshold"]
                    and seg_ok(rs["segment"], p4_both, fcs)):
                side = g["home_abbr"] if r["spread_edge"] > 0 else g["away_abbr"]
                ln = sp if r["spread_edge"] > 0 else -sp
                r["spread_pick"] = f"{side} {ln:+.1f}"
            if (tl is not None and rt["edge_supported"] and abs(r["total_edge"]) >= rt["threshold"]
                    and seg_ok(rt["segment"], p4_both, fcs)):
                r["total_pick"] = f"{'OVER' if r['total_edge'] > 0 else 'UNDER'} {tl}"
        if r["spread_pick"] or r["total_pick"]:
            picks.append(r)
        rows.append(r)

    def fs(x, nd=1):
        return "-" if x is None else f"{x:+.{nd}f}"

    L = ["# CFB picks - Thanksgiving Thu 11/26/2026 + Black Friday Fri 11/27/2026\n"]
    L.append(f"Generated {now.astimezone(ET).strftime('%Y-%m-%d %I:%M %p ET')} by `today.py`; lines = ESPN scoreboard "
             f"(DraftKings) as fetched {slate['fetched_at']}. Model fit on all {len(done)} completed 2026 games "
             f"(FBS+FCS), shrunk toward 2025 final ratings; hyperparameters frozen from the 2025 tuning in backtest.md.\n")
    L.append("## Verdict\n")
    for kind, r_ in (("Spreads", rs), ("Totals", rt)):
        o = r_["oos"]
        L.append(f"* **{kind}: {'EDGE' if r_['edge_supported'] else 'NO EDGE'}.** Rule frozen on 2025 "
                 f"(|model-line| >= {r_['threshold']}, segment `{r_['segment']}`) went {o['w']}-{o['l']}-{o['p']} "
                 f"on 2026 weeks 5-13 (win {100*o['win']:.1f}%, 95% CI [{100*o['lo']:.1f}, {100*o['hi']:.1f}], "
                 f"ROI {100*o['roi']:+.1f}%). Breakeven is 52.4%; the CI does not clear it, so no picks are flagged."
                 if not r_["edge_supported"] else
                 f"* **{kind}: EDGE SUPPORTED** by the frozen rule (|model-line| >= {r_['threshold']}, `{r_['segment']}`).")
    L.append("")
    L.append(f"**Official picks: {'none - no edge' if not picks else len(picks)}**\n")
    for p in picks:
        L.append(f"* {p['kickoff_et']} - {p['matchup']}: {p['spread_pick'] or ''} {p['total_pick'] or ''}")
    L.append("")
    L.append("## Full slate (informational only - model numbers are NOT picks)\n")
    L.append("Spread columns are from the home team's view (negative = home favored). `edge` = model minus market "
             "in points (spread edge > 0 means the model likes the home side). `blend` = market + "
             f"{wS:.2f} x (model - market) for spreads and {wT:.2f} x for totals (weights fit on 2025; did not beat "
             "the plain line out of sample in 2026).\n")
    L.append("| kickoff (ET) | matchup | home line | model home | edge | blend home | total | model total | edge | blend total | pick |")
    L.append("|---|---|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        sp = r["line_spread_home"]
        bl = (sp + wS * (-(r["model_margin_home"]) - sp)) if sp is not None else None
        bt = (r["line_total"] + wT * r["total_edge"]) if r["line_total"] is not None else None
        pk = "STARTED - skipped" if r["started"] else (" / ".join(x for x in (r["spread_pick"], r["total_pick"]) if x) or "no edge")
        L.append(f"| {r['kickoff_et']} | {r['matchup']}{' (N)' if r['neutral'] else ''} | {fs(sp)} | {fs(-r['model_margin_home'])} "
                 f"| {fs(r['spread_edge'])} | {fs(bl)} | {r['line_total'] if r['line_total'] is not None else '-'} "
                 f"| {r['model_total']:.1f} | {fs(r['total_edge'])} | {'-' if bt is None else f'{bt:.1f}'} | {pk} |")
    L.append("")
    L.append("Note: the totals model sits above the market on most of this slate. Late-season weather, pace and "
             "injury news are priced by the market but not by the model, and in the 2026 out-of-sample test the "
             "model's over/under leans lost (see backtest.md) - treat the totals columns as diagnostics only.\n")
    L.append(f"Model home-field advantage: {mm['hfa']:.2f} pts; FCS group offset {mm['groups'].get('FCS', 0):+.1f} "
             f"vs FBS average. Points model: mu {pm['mu']:.1f}, home bump {pm['hp']:.2f}.\n")
    open(os.path.join(HERE, "today.md"), "w").write("\n".join(L) + "\n")
    json.dump(rows, open(os.path.join(M.DATA, "today_predictions.json"), "w"), indent=1)
    print("\n".join(L))


if __name__ == "__main__":
    main()
