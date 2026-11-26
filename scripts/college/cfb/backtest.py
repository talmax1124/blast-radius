#!/usr/bin/env python3
"""Walk-forward backtest of the CFB margin/points models vs ESPN (DraftKings / ESPN BET) closing lines.

Design (no look-ahead):
  * For every test week w of a season, models are fit ONLY on that season's games with week < w,
    with ratings shrunk toward the PREVIOUS season's final ratings (regressed by rho).
  * Hyperparameters are tuned on the 2025 season only (MAE vs actual result, weeks 4+).
  * Betting rules (threshold x segment) are chosen on 2025 only and then evaluated, frozen, on
    2026 weeks 5-13 (true out-of-sample). A second split chooses on 2026 weeks 5-8 and tests 9-13.

Outputs: data/params.json, data/backtest_records.json, data/rules.json, backtest.md
"""
import json, math, os, sys, itertools, statistics as st
import model as M

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = M.DATA
VIG_WIN = 100.0 / 110.0
BE = 110.0 / 210.0  # breakeven win% at -110


# ----------------------------------------------------------------------------- walk-forward
def walk_forward(season, mparams, pparams, weeks, want="both"):
    gs, done, tier = M.load_season(season)
    prev = M.prev_season_models(season - 1)
    recs = []
    for w in weeks:
        train = [g for g in done if g["week"] < w]
        test = [g for g in done if g["week"] == w and 80 in g["groups"]]
        if not test or not train:
            continue
        ref = min(g["date"] for g in test)
        mm = M.fit_margin(train, tier, prev["rating"], prev["tier"], mparams, ref) if want in ("both", "m") else None
        pm = M.fit_points(train, tier, prev["od"], prev["tier"], pparams, ref) if want in ("both", "p") else None
        for g in test:
            sp, tl = M.home_spread(g), M.total_line(g)
            r = {"season": season, "week": w, "id": g["id"], "date": g["date"],
                 "home": g["home"], "away": g["away"], "neutral": g["neutral"],
                 "p4_both": M.is_p4(g, "home") and M.is_p4(g, "away"),
                 "fcs_game": tier.get(g["home_id"]) != "FBS" or tier.get(g["away_id"]) != "FBS",
                 "margin": g["home_score"] - g["away_score"], "total": g["home_score"] + g["away_score"],
                 "line_margin": (-sp if sp is not None else None), "line_total": tl,
                 "open_margin": (-(g.get("odds") or {})["open_spread"] if (g.get("odds") or {}).get("open_spread") is not None else None),
                 "open_total": (g.get("odds") or {}).get("open_total")}
            if mm:
                r["model_margin"] = M.predict_margin(mm, g)
            if pm:
                ph, pa = M.predict_points(pm, g)
                r["model_total"] = ph + pa
                r["model_margin_pts"] = ph - pa
            recs.append(r)
    return recs


def mae(xs):
    return sum(abs(x) for x in xs) / len(xs) if xs else float("nan")


# ----------------------------------------------------------------------------- tuning
MKT = (0.0, 1.0, 3.0, 10.0)  # weight of past closing lines as pseudo-observations


def tune(season=2025, weeks=range(4, 16)):
    best_m, best_p = None, None
    res_m, res_p = [], []
    for lam, rho, cap, hl, mk in itertools.product((2.0, 4.0, 8.0), (0.4, 0.6, 0.8), (21.0, 28.0, 0), (None, 45), MKT):
        mp = dict(lam=lam, rho=rho, cap=cap, half_life=hl, mkt_w=mk)
        recs = walk_forward(season, mp, None, weeks, want="m")
        e = mae([r["model_margin"] - r["margin"] for r in recs if r["line_margin"] is not None])
        res_m.append((e, mp))
    for lam, rho, cap, hl, mk in itertools.product((2.0, 4.0, 8.0), (0.4, 0.6, 0.8), (49.0, 63.0, 0), (None, 45), MKT):
        pp = dict(lam_pts=lam, rho_pts=rho, pts_cap=cap, half_life=hl, mkt_w=mk)
        recs = walk_forward(season, None, pp, weeks, want="p")
        e = mae([r["model_total"] - r["total"] for r in recs if r["line_total"] is not None])
        res_p.append((e, pp))
    res_m.sort(key=lambda z: z[0])
    res_p.sort(key=lambda z: z[0])
    return res_m, res_p


# ----------------------------------------------------------------------------- betting stats
def wilson(k, n, z=1.96):
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((c - h) / d, (c + h) / d)


def bets(recs, kind, thr, seg="all", w_blend=1.0, vs="close"):
    """kind 'spread' or 'total'. Bet whenever |model - line| >= thr (model optionally shrunk to line).
    vs='open' grades against the opening line instead of the close."""
    out = []
    for r in recs:
        if kind == "spread":
            line, mod, act = r["line_margin" if vs == "close" else "open_margin"], r.get("model_margin"), r["margin"]
        else:
            line, mod, act = r["line_total" if vs == "close" else "open_total"], r.get("model_total"), r["total"]
        if line is None or mod is None:
            continue
        if seg == "p4" and not r["p4_both"]:
            continue
        if seg == "nonp4" and r["p4_both"]:
            continue
        if seg == "nonp4_fbs" and (r["p4_both"] or r["fcs_game"]):
            continue
        edge = w_blend * (mod - line)
        if abs(edge) < thr or edge == 0:
            continue
        side = 1 if edge > 0 else -1  # +1 = home / over
        res = (act - line) * side
        out.append(1 if res > 0 else (0 if res == 0 else -1))
    return out


def summarize(outcomes):
    w = sum(1 for o in outcomes if o == 1)
    l = sum(1 for o in outcomes if o == -1)
    p = sum(1 for o in outcomes if o == 0)
    n = w + l
    rets = [VIG_WIN if o == 1 else (-1.0 if o == -1 else 0.0) for o in outcomes]
    roi = sum(rets) / len(rets) if rets else float("nan")
    if len(rets) > 1:
        sd = st.pstdev(rets)
        roi_ci = (roi - 1.96 * sd / math.sqrt(len(rets)), roi + 1.96 * sd / math.sqrt(len(rets)))
    else:
        roi_ci = (float("nan"), float("nan"))
    lo, hi = wilson(w, n)
    return {"n": len(outcomes), "w": w, "l": l, "p": p, "win": (w / n if n else float("nan")),
            "lo": lo, "hi": hi, "roi": roi, "roi_lo": roi_ci[0], "roi_hi": roi_ci[1]}


def fmt(s):
    if not s["n"]:
        return "| 0 | - | - | - | - |"
    return (f"| {s['n']} | {s['w']}-{s['l']}-{s['p']} | {100*s['win']:.1f}% [{100*s['lo']:.1f}, {100*s['hi']:.1f}] "
            f"| {100*s['roi']:+.1f}% [{100*s['roi_lo']:+.1f}, {100*s['roi_hi']:+.1f}] |")


def ols_slope(recs, kind):
    """Slope b of (actual - line) on (model - line), no intercept, with SE. b>0 => model adds info."""
    xs, ys = [], []
    for r in recs:
        if kind == "spread":
            line, mod, act = r["line_margin"], r.get("model_margin"), r["margin"]
        else:
            line, mod, act = r["line_total"], r.get("model_total"), r["total"]
        if line is None or mod is None:
            continue
        xs.append(mod - line)
        ys.append(act - line)
    sxx = sum(x * x for x in xs)
    if not sxx:
        return float("nan"), float("nan"), 0
    b = sum(x * y for x, y in zip(xs, ys)) / sxx
    res = [y - b * x for x, y in zip(xs, ys)]
    s2 = sum(e * e for e in res) / max(1, len(xs) - 1)
    return b, math.sqrt(s2 / sxx), len(xs)


def mae_table(recs, kind):
    if kind == "spread":
        rs = [r for r in recs if r["line_margin"] is not None]
        m = mae([r["model_margin"] - r["margin"] for r in rs])
        l = mae([r["line_margin"] - r["margin"] for r in rs])
        d = mae([r["model_margin"] - r["line_margin"] for r in rs])
    else:
        rs = [r for r in recs if r["line_total"] is not None]
        m = mae([r["model_total"] - r["total"] for r in rs])
        l = mae([r["line_total"] - r["total"] for r in rs])
        d = mae([r["model_total"] - r["line_total"] for r in rs])
    return len(rs), m, l, d


def blend_mae(recs, kind, w):
    out = []
    for r in recs:
        if kind == "spread":
            line, mod, act = r["line_margin"], r.get("model_margin"), r["margin"]
        else:
            line, mod, act = r["line_total"], r.get("model_total"), r["total"]
        if line is None or mod is None:
            continue
        out.append(line + w * (mod - line) - act)
    return mae(out)


THRS = (0, 2, 3, 5, 7)
SEGS = ("all", "p4", "nonp4", "nonp4_fbs")
SEG_LABEL = {"all": "all FBS-lined games", "p4": "P4 vs P4 (incl. ND)", "nonp4": "any non-P4 team",
             "nonp4_fbs": "non-P4, FBS vs FBS only"}


def choose_rule(recs, kind, min_n=60):
    """Pick (seg, thr) with best ROI in-sample, requiring n >= min_n. Returns rule + its in-sample stats."""
    best = None
    for seg in SEGS:
        for thr in THRS:
            s = summarize(bets(recs, kind, thr, seg))
            if s["n"] >= min_n and (best is None or s["roi"] > best[2]["roi"]):
                best = (seg, thr, s)
    return best


def main():
    os.makedirs(DATA, exist_ok=True)
    print("tuning hyperparameters on 2025 ...", flush=True)
    res_m, res_p = tune()
    mparams, pparams = res_m[0][1], res_p[0][1]
    print("  margin best", res_m[0], "\n  points best", res_p[0], flush=True)
    json.dump({"margin": mparams, "points": pparams,
               "margin_grid_top5": res_m[:5], "points_grid_top5": res_p[:5]},
              open(os.path.join(DATA, "params.json"), "w"), indent=1)

    r25 = walk_forward(2025, mparams, pparams, range(2, 16))
    r26 = walk_forward(2026, mparams, pparams, range(2, 14))
    json.dump(r25 + r26, open(os.path.join(DATA, "backtest_records.json"), "w"), indent=0)

    sel25 = [r for r in r25 if r["week"] >= 5]
    oos26 = [r for r in r26 if r["week"] >= 5]
    early26 = [r for r in r26 if 5 <= r["week"] <= 8]
    late26 = [r for r in r26 if r["week"] >= 9]

    L = []
    L.append("# CFB model backtest (walk-forward, closing lines)\n")
    L.append("Generated by `backtest.py`. Data: ESPN scoreboards (FBS + FCS results) and ESPN core-API closing "
             "lines (2026: DraftKings; 2025: ESPN BET, a few DraftKings). Bets graded at -110 (breakeven 52.38%). "
             "Win% CIs are Wilson 95%; ROI CIs are normal-approx 95% on per-bet returns. Pushes count as 0 return.\n")
    L.append("## Method\n")
    L.append("* **Margin model**: ridge regression, `margin_home = HFA*(not neutral) + r_home - r_away`, margins capped; "
             "team rating = group offset (FBS=0 / FCS / other, weakly penalized) + team deviation shrunk toward "
             "`rho * previous-season deviation`. FCS teams get their own ratings (FCS-vs-FCS games are included) "
             "pooled toward a fitted FCS mean.")
    L.append("* **Points model (totals)**: `pts = mu + HP*home + off_team - def_opp`, same shrinkage scheme, two rows per game.")
    L.append("* **No look-ahead**: for each week w, fit only on that season's games with week < w (+ prior-season ratings).")
    L.append("* **Hyperparameters** tuned on **2025 only** (MAE vs actual, weeks 4-15). "
             f"Margin: `{mparams}` (MAE {res_m[0][0]:.2f}). Points: `{pparams}` (MAE {res_p[0][0]:.2f}).")
    L.append("* **Rule selection**: threshold x segment picked on 2025 weeks 5-15 (best ROI, n>=60), then frozen and "
             "graded on 2026 weeks 5-13. Second split: pick on 2026 wk 5-8, grade wk 9-13.\n")

    for kind in ("spread", "total"):
        L.append(f"## {'Spreads' if kind == 'spread' else 'Totals'}\n")
        L.append("### Accuracy (MAE, points)\n")
        L.append("| period | games | model vs actual | closing line vs actual | model vs line |")
        L.append("|---|---|---|---|---|")
        for name, rs in (("2025 wk 5-15", sel25), ("2026 wk 5-13", oos26), ("2026 wk 5-8", early26), ("2026 wk 9-13", late26)):
            n, m, l, d = mae_table(rs, kind)
            L.append(f"| {name} | {n} | {m:.2f} | {l:.2f} | {d:.2f} |")
        b25, se25, n25 = ols_slope(sel25, kind)
        b26, se26, n26 = ols_slope(oos26, kind)
        L.append("")
        L.append("### Does the model add information beyond the line?\n")
        L.append("Slope b of `(actual - line)` on `(model - line)` (b=0: model adds nothing; b=1: trust model fully).\n")
        L.append(f"* 2025 wk 5-15: b = {b25:+.3f} (SE {se25:.3f}, n={n25})")
        L.append(f"* 2026 wk 5-13: b = {b26:+.3f} (SE {se26:.3f}, n={n26})")
        wb = max(0.0, min(1.0, b25))
        L.append(f"* Blend `line + w*(model-line)` with w = {wb:.3f} fit on 2025 -> 2026 wk 5-13 MAE "
                 f"{blend_mae(oos26, kind, wb):.3f} vs line-only {blend_mae(oos26, kind, 0.0):.3f} "
                 f"vs model-only {blend_mae(oos26, kind, 1.0):.3f}\n")

        for seg in SEGS:
            L.append(f"### ATS by threshold - {SEG_LABEL[seg]}\n")
            L.append("| period | \\|model-line\\| >= | bets | W-L-P | win% [95% CI] | ROI [95% CI] |")
            L.append("|---|---|---|---|---|---|")
            for name, rs in (("2025 wk 5-15 (selection)", sel25), ("2026 wk 5-13 (OOS)", oos26),
                             ("2026 wk 5-8", early26), ("2026 wk 9-13", late26)):
                for thr in THRS:
                    s = summarize(bets(rs, kind, thr, seg))
                    L.append(f"| {name} | {thr} " + fmt(s))
            L.append("")

    # opener analysis
    L.append("## Secondary: model vs OPENING lines (not bettable for today's near-close lines)\n")
    L.append("Same predictions, graded against ESPN's recorded opening line. `move slope` = slope of "
             "(close - open) on (model - open): >0 means the market moves toward the model between open and close.\n")
    L.append("| season | market | move slope | \\|model-open\\| >= 3: W-L-P | win% [95% CI] | ROI |")
    L.append("|---|---|---|---|---|---|")
    for name, rs in (("2025 wk 5-15", sel25), ("2026 wk 5-13", oos26)):
        for kind in ("spread", "total"):
            ok = "open_margin" if kind == "spread" else "open_total"
            ck = "line_margin" if kind == "spread" else "line_total"
            mk_ = "model_margin" if kind == "spread" else "model_total"
            pr = [(r[mk_] - r[ok], r[ck] - r[ok]) for r in rs if r.get(ok) is not None and r.get(ck) is not None]
            sl = sum(x * y for x, y in pr) / sum(x * x for x, y in pr) if pr else float("nan")
            s_ = summarize(bets(rs, kind, 3, vs="open"))
            L.append(f"| {name} | {kind} | {sl:+.2f} | {s_['w']}-{s_['l']}-{s_['p']} | {100*s_['win']:.1f}% "
                     f"[{100*s_['lo']:.1f}, {100*s_['hi']:.1f}] | {100*s_['roi']:+.1f}% |")
    L.append("")

    # rule selection + frozen OOS grading
    rules = {}
    L.append("## Frozen-rule out-of-sample results\n")
    L.append("| market | chosen on | rule (segment, threshold) | in-sample | out-of-sample period | OOS result |")
    L.append("|---|---|---|---|---|---|")
    for kind in ("spread", "total"):
        for chosen_name, chosen_rs, test_name, test_rs, mn in (
                ("2025 wk 5-15", sel25, "2026 wk 5-13", oos26, 60),
                ("2026 wk 5-8", early26, "2026 wk 9-13", late26, 30)):
            seg, thr, s_in = choose_rule(chosen_rs, kind, mn)
            s_out = summarize(bets(test_rs, kind, thr, seg))
            L.append(f"| {kind} | {chosen_name} | {SEG_LABEL[seg]}, >= {thr} | "
                     f"{s_in['w']}-{s_in['l']}-{s_in['p']}, {100*s_in['roi']:+.1f}% | {test_name} | "
                     f"{s_out['w']}-{s_out['l']}-{s_out['p']}, win {100*s_out['win']:.1f}% "
                     f"[{100*s_out['lo']:.1f}, {100*s_out['hi']:.1f}], ROI {100*s_out['roi']:+.1f}% |")
            if chosen_name.startswith("2025"):
                # an edge is "supported" only if the frozen rule's OOS win% CI lower bound clears breakeven
                rules[kind] = {"segment": seg, "threshold": thr, "in_sample": s_in, "oos": s_out,
                               "edge_supported": bool(s_out["n"] and s_out["lo"] > BE)}
    L.append("")
    L.append("**Edge criterion for flagging live picks**: the rule frozen on 2025 must have a 2026 out-of-sample "
             "win% whose 95% CI lower bound exceeds 52.38% (breakeven at -110).\n")
    for kind in ("spread", "total"):
        r = rules[kind]
        L.append(f"* {kind}: rule = {SEG_LABEL[r['segment']]}, |model-line| >= {r['threshold']} -> "
                 f"**{'EDGE SUPPORTED' if r['edge_supported'] else 'NO EDGE'}** "
                 f"(OOS {r['oos']['w']}-{r['oos']['l']}-{r['oos']['p']}, CI low {100*r['oos']['lo']:.1f}%)")
    L.append("")
    json.dump({"rules": rules, "margin_params": mparams, "points_params": pparams,
               "blend_w_spread": max(0.0, min(1.0, ols_slope(sel25, "spread")[0])),
               "blend_w_total": max(0.0, min(1.0, ols_slope(sel25, "total")[0]))},
              open(os.path.join(DATA, "rules.json"), "w"), indent=1)
    open(os.path.join(HERE, "backtest.md"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
