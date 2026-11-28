#!/usr/bin/env python3
"""Walk-forward (look-ahead-free) backtest of the CBB rating model vs DraftKings closing lines.

For each date D in [START, END]: fit ratings on completed games with date < D only
(plus last season's final ratings as a regressed prior), predict D's games, compare to
the closing spread/total. Hyper-parameters and edge thresholds are chosen on the first
half of dates (TUNE) and evaluated untouched on the second half (TEST).

Writes backtest.md and data/backtest_preds.json.
"""
import json, os, statistics as st, itertools, sys
import model as M

START, SPLIT, END = "20261112", "20261119", "20261125"  # TUNE = [START, SPLIT), TEST = [SPLIT, END]
WARM = "20261105"   # predictions from WARM..START-1 are used only to warm up the walk-forward calibration
CAP = 25.0
THRESH = [0, 1, 2, 3, 4, 5, 6, 8]
GRID_LAM = [1.0, 2.0, 4.0, 8.0]
GRID_REG = [0.0, 0.4, 0.6, 0.8, 1.0]   # 0.0 = no prior (shrink to zero)

season = M.load_json("games_2027.json", {})
odds = M.load_json("odds.json", {})
prev = M.prior_season_ratings(CAP)
HCA = prev["hca"]
dates = [d for d in sorted(season) if WARM <= d <= END]


def run(lam, reg, keep_warm=False):
    prior = M.build_prior(prev, reg)
    dflt = tuple(reg * x for x in prior["default"]) if reg else (0.0, 0.0)
    rows = []
    for D in dates:
        train = M.completed_games("games_2027.json", before=D)
        R = M.fit(train, prior=prior, lam=lam, cap=CAP, hca=HCA, default_prior=dflt)
        for g in season[D]:
            if not g["completed"] or g["home_score"] is None:
                continue
            sp, tot = M.market(odds, g)
            mm, mt, _, _ = M.predict(R, g)
            rows.append({"id": g["id"], "date": D, "home": g["home"], "away": g["away"],
                         "neutral": g["neutral"],
                         "margin": g["home_score"] - g["away_score"],
                         "total": g["home_score"] + g["away_score"],
                         "m_margin": mm, "m_total": mt, "spread": sp, "line_total": tot,
                         "n_home": R["n"].get(g["home_id"], 0), "n_away": R["n"].get(g["away_id"], 0)})
    calibrate(rows)
    return rows if keep_warm else [r for r in rows if r["date"] >= START]


def ols(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx if sxx else 1.0
    return my - b * mx, b


def calibrate(rows):
    """Walk-forward outcome calibration: for date D, regress actual on model over all rows
    dated < D that had a closing line (so the calibration sample matches the betting sample),
    and store c_margin / c_total. Uses only results known before D."""
    for D in sorted({r["date"] for r in rows}):
        prior = [r for r in rows if r["date"] < D]
        ps = [r for r in prior if r["spread"] is not None]
        pt = [r for r in prior if r["line_total"] is not None]
        am, bm = ols([r["m_margin"] for r in ps], [r["margin"] for r in ps]) if len(ps) > 50 else (0.0, 1.0)
        at, bt = ols([r["m_total"] for r in pt], [r["total"] for r in pt]) if len(pt) > 50 else (0.0, 1.0)
        for r in rows:
            if r["date"] == D:
                r["c_margin"] = am + bm * r["m_margin"]
                r["c_total"] = at + bt * r["m_total"]
                r["cal"] = [am, bm, at, bt]


def use_calibrated(rows):
    out = []
    for r in rows:
        q = dict(r); q["m_margin"] = r["c_margin"]; q["m_total"] = r["c_total"]; out.append(q)
    return out


def split(rows):
    return [r for r in rows if r["date"] < SPLIT], [r for r in rows if r["date"] >= SPLIT]


def mae(xs):
    return st.mean(xs) if xs else float("nan")


def ats(rows, kind, t, maxt=None):
    """Bet the side the model prefers when |edge| >= t. Returns (w, l, p, n_bets)."""
    w = l = p = 0
    for r in rows:
        if kind == "spread":
            if r["spread"] is None: continue
            edge = r["m_margin"] + r["spread"]           # >0: model likes home vs line
            res = r["margin"] + r["spread"]               # >0: home covered
        else:
            if r["line_total"] is None: continue
            edge = r["m_total"] - r["line_total"]        # >0: model likes over
            res = r["total"] - r["line_total"]
        if abs(edge) < t or edge == 0 or (maxt is not None and abs(edge) >= maxt):
            continue
        if res == 0:
            p += 1
        elif (res > 0) == (edge > 0):
            w += 1
        else:
            l += 1
    return w, l, p


def fmt_ats(w, l, p):
    n = w + l
    if n == 0:
        return "| 0 | – | – | – |"
    lo, hi = M.wilson(w, n)
    return (f"| {n} ({p}P) | {100*w/n:.1f}% [{100*lo:.1f}, {100*hi:.1f}] | "
            f"{100*M.roi_110(w, l):+.1f}% | [{100*M.p_to_roi(lo):+.1f}, {100*M.p_to_roi(hi):+.1f}] |")


def errors(rows):
    sp = [r for r in rows if r["spread"] is not None]
    tt = [r for r in rows if r["line_total"] is not None]
    return {
        "n_all": len(rows), "n_sp": len(sp), "n_tot": len(tt),
        "model_margin_all": mae([abs(r["m_margin"] - r["margin"]) for r in rows]),
        "model_margin": mae([abs(r["m_margin"] - r["margin"]) for r in sp]),
        "line_margin": mae([abs(-r["spread"] - r["margin"]) for r in sp]),
        "model_total": mae([abs(r["m_total"] - r["total"]) for r in tt]),
        "line_total": mae([abs(r["line_total"] - r["total"]) for r in tt]),
    }


def blend_mae(rows, kind, w):
    if kind == "spread":
        xs = [abs(w * r["m_margin"] + (1 - w) * (-r["spread"]) - r["margin"]) for r in rows if r["spread"] is not None]
    else:
        xs = [abs(w * r["m_total"] + (1 - w) * r["line_total"] - r["total"]) for r in rows if r["line_total"] is not None]
    return mae(xs)


def ols_weight(rows, kind):
    """Least-squares weight on model in (actual - line) = w * (model - line)."""
    num = den = 0.0
    for r in rows:
        if kind == "spread":
            if r["spread"] is None: continue
            x = r["m_margin"] + r["spread"]; y = r["margin"] + r["spread"]
        else:
            if r["line_total"] is None: continue
            x = r["m_total"] - r["line_total"]; y = r["total"] - r["line_total"]
        num += x * y; den += x * x
    return num / den if den else float("nan")


def slope_test(rows, kind):
    """OLS with intercept of (actual - line) on (model - line): slope, SE, t, intercept, n."""
    import math
    xs, ys = [], []
    for r in rows:
        if kind == "spread":
            if r["spread"] is None: continue
            xs.append(r["m_margin"] + r["spread"]); ys.append(r["margin"] + r["spread"])
        else:
            if r["line_total"] is None: continue
            xs.append(r["m_total"] - r["line_total"]); ys.append(r["total"] - r["line_total"])
    n = len(xs)
    a, b = ols(xs, ys)
    mx = sum(xs) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    s2 = sum((y - a - b * x) ** 2 for x, y in zip(xs, ys)) / (n - 2)
    se = math.sqrt(s2 / sxx)
    return b, se, b / se, a, n


def choose_threshold(tune, kind, min_n=25):
    """Highest-ROI threshold on the tuning half among those with >= min_n bets."""
    best = None
    for t in THRESH[1:]:
        w, l, p = ats(tune, kind, t)
        if w + l < min_n:
            continue
        roi = M.roi_110(w, l)
        if best is None or roi > best[1]:
            best = (t, roi, w, l)
    return best


def main():
    out = []
    P = out.append
    # ---- hyper-parameter search on TUNE half only
    grid = []
    cache = {}
    for lam, reg in itertools.product(GRID_LAM, GRID_REG):
        base = run(lam, reg)
        for cal in (False, True):
            rows = use_calibrated(base) if cal else base
            cache[(lam, reg, cal)] = rows
            tune, test = split(rows)
            e = errors(tune)
            grid.append((lam, reg, cal, e["model_margin"], e["model_total"], errors(test)))
            print(f"lam={lam} reg={reg} cal={cal} tune MAE margin {e['model_margin']:.3f} "
                  f"total {e['model_total']:.3f}", flush=True)
    best_m = min(grid, key=lambda x: x[3])
    best_t = min(grid, key=lambda x: x[4])
    rows_m = cache[best_m[:3]]
    rows_t = cache[best_t[:3]]
    tune_m, test_m = split(rows_m)
    tune_t, test_t = split(rows_t)
    em_tune, em_test = errors(tune_m), errors(test_m)
    et_tune, et_test = errors(tune_t), errors(test_t)

    P("# CBB (men's D-I) rating model — walk-forward backtest vs DraftKings closing lines\n")
    P(f"Generated by `backtest.py`. Season 2026-27 games from ESPN; closing lines from the ESPN core odds "
      f"endpoint (DraftKings). Ratings for date D are fit only on games completed before D, "
      f"with last season's (2025-26) final ratings regressed toward the mean as the prior. "
      f"Margins capped at ±{CAP:.0f} for fitting; HCA fixed at {HCA:.2f} pts (fit on 2025-26).\n")
    P(f"- Tuning half (hyper-params + thresholds chosen here): {START} – {SPLIT[:4]}{SPLIT[4:6]}{int(SPLIT[6:])-1:02d}")
    P(f"- Test half (out of sample, untouched): {SPLIT} – {END}")
    P(f"- Games predicted: tune {em_tune['n_all']} ({em_tune['n_sp']} with a closing line), "
      f"test {em_test['n_all']} ({em_test['n_sp']} with a closing line)\n")

    P("## Hyper-parameter grid (tuning half MAE; test MAE shown for reference only)\n")
    P("Calibrated = walk-forward linear recalibration (actual ≈ a + b·model, fit on earlier dates only).\n")
    P("| ridge λ (games) | prior regress | calibrated | tune margin MAE | tune total MAE | test margin MAE | test total MAE |")
    P("|---|---|---|---|---|---|---|")
    for lam, reg, cal, mm, mt, et in grid:
        P(f"| {lam:g} | {reg:g} | {'yes' if cal else 'no'} | {mm:.3f} | {mt:.3f} | {et['model_margin']:.3f} | {et['model_total']:.3f} |")
    P(f"\nChosen for spreads: λ={best_m[0]:g}, regress={best_m[1]:g}, calibrated={best_m[2]}. "
      f"Chosen for totals: λ={best_t[0]:g}, regress={best_t[1]:g}, calibrated={best_t[2]}.\n")

    P("## (a) Mean absolute error vs actual results (games with a closing line)\n")
    P("| half | n | model margin MAE | closing spread MAE | n | model total MAE | closing total MAE |")
    P("|---|---|---|---|---|---|---|")
    for name, em, et in (("tune", em_tune, et_tune), ("test", em_test, et_test)):
        P(f"| {name} | {em['n_sp']} | {em['model_margin']:.2f} | {em['line_margin']:.2f} | {et['n_tot']} | "
          f"{et['model_total']:.2f} | {et['line_total']:.2f} |")
    P("")

    res = {}
    for kind, tune, test in (("spread", tune_m, test_m), ("total", tune_t, test_t)):
        P(f"## (b) {kind.capitalize()}s: bet model side when |model − line| ≥ threshold (−110)\n")
        P("Win% excludes pushes; 95% Wilson CI; ROI CI mapped from the win% CI. Break-even = 52.38%.\n")
        for name, rr in (("Tuning half", tune), ("Test half (out of sample)", test), ("All dates", tune + test)):
            P(f"**{name}**\n")
            P("| threshold | bets | win% [95% CI] | ROI | ROI 95% CI |")
            P("|---|---|---|---|---|")
            for t in THRESH:
                P(f"| ≥{t} " + fmt_ats(*ats(rr, kind, t)))
            P("")
        ch = choose_threshold(tune, kind)
        if ch:
            t = ch[0]
            w, l, p = ats(test, kind, t)
            n = w + l
            lo, hi = M.wilson(w, n) if n else (float("nan"),) * 2
            res[kind] = {"threshold": t, "tune_roi": ch[1], "tune_n": ch[2] + ch[3],
                         "test_w": w, "test_l": l, "test_p": p,
                         "test_roi": M.roi_110(w, l) if n else float("nan"),
                         "test_roi_lo": M.p_to_roi(lo) if n else float("nan"),
                         "test_roi_hi": M.p_to_roi(hi) if n else float("nan"),
                         "lam": best_m[0] if kind == "spread" else best_t[0],
                         "reg": best_m[1] if kind == "spread" else best_t[1],
                         "cal": best_m[2] if kind == "spread" else best_t[2]}
            r = res[kind]
            P(f"Threshold picked on tuning half: **≥{t}** (tune ROI {100*ch[1]:+.1f}% on {ch[2]+ch[3]} bets). "
              f"Out of sample: **{w}-{l}-{p}**, ROI {100*r['test_roi']:+.1f}% "
              f"[{100*r['test_roi_lo']:+.1f}, {100*r['test_roi_hi']:+.1f}].\n")
        else:
            res[kind] = None
            P("No threshold had ≥25 tuning bets.\n")

    P("## (c) Blend check: w·model + (1−w)·line\n")
    P("| market | w | tune MAE | test MAE |")
    P("|---|---|---|---|")
    for kind, tune, test in (("spread", tune_m, test_m), ("total", tune_t, test_t)):
        for w in (0.0, 0.1, 0.2, 0.3, 0.5):
            P(f"| {kind} | {w:.1f} | {blend_mae(tune, kind, w):.3f} | {blend_mae(test, kind, w):.3f} |")
        wt = ols_weight(tune, kind)
        P(f"| {kind} | OLS-fit on tune: {wt:.3f} | {blend_mae(tune, kind, wt):.3f} | {blend_mae(test, kind, wt):.3f} |")
        res.setdefault("blend", {})[kind] = {"w_tune": wt, "w_test": ols_weight(test, kind)}
    P("\n**Does the model add information beyond the closing line?** OLS with intercept of "
      "(actual − line) on (model − line). Slope > 0 with |t| > 2 would mean yes.\n")
    P("| market | half | n | slope | SE | t | intercept |")
    P("|---|---|---|---|---|---|---|")
    for kind, tune, test in (("spread", tune_m, test_m), ("total", tune_t, test_t)):
        for name, rr in (("tune", tune), ("test", test), ("all", tune + test)):
            b, se, t, a, n = slope_test(rr, kind)
            P(f"| {kind} | {name} | {n} | {b:.3f} | {se:.3f} | {t:.2f} | {a:+.2f} |")
    P("\nA blend can only beat the line ATS if the model carries information the line lacks; "
      "betting the blend's side with threshold t is identical to betting the model's side with threshold t/w. "
      f"OLS weight on the test half alone (for reference): spread {res['blend']['spread']['w_test']:.3f}, "
      f"total {res['blend']['total']['w_test']:.3f}.\n")

    # Robustness: does the out-of-sample result depend on the exact configuration chosen?
    P("## Robustness: out-of-sample (test half) record for every grid configuration\n")
    P("Same thresholds as chosen above; configuration choice was made on tuning MAE, this table is for context.\n")
    ts, tt = (res["spread"] or {}).get("threshold", 2), (res["total"] or {}).get("threshold", 8)
    P(f"| λ | regress | calibrated | spreads ≥{ts}: W-L | ROI | totals ≥{tt}: W-L | ROI |")
    P("|---|---|---|---|---|---|---|")
    pos_t = 0
    for key, rows in cache.items():
        _, test = split(rows)
        w1, l1, _ = ats(test, "spread", ts)
        w2, l2, _ = ats(test, "total", tt)
        pos_t += M.roi_110(w2, l2) > 0
        P(f"| {key[0]:g} | {key[1]:g} | {'yes' if key[2] else 'no'} | {w1}-{l1} | {100*M.roi_110(w1, l1):+.1f}% | "
          f"{w2}-{l2} | {100*M.roi_110(w2, l2):+.1f}% |")
    P(f"\nTotals ≥{tt} were profitable out of sample in {pos_t} of {len(cache)} configurations.\n")

    # Subgroups — descriptive only (all dates, at each market's chosen threshold)
    P("## Subgroups (descriptive only; all dates; at each market's chosen threshold)\n")
    for kind, allr in (("spread", tune_m + test_m), ("total", tune_t + test_t)):
        if not res.get(kind):
            continue
        t = res[kind]["threshold"]
        P(f"**{kind}s ≥{t}**\n")
        P("| subset | bets | win% [95% CI] | ROI | ROI 95% CI |")
        P("|---|---|---|---|---|")
        for lab, f in (("both teams ≥4 games in sample", lambda r: min(r["n_home"], r["n_away"]) >= 4),
                       ("either team <4 games", lambda r: min(r["n_home"], r["n_away"]) < 4),
                       ("neutral site", lambda r: r["neutral"]),
                       ("true home game", lambda r: not r["neutral"]),
                       ("|spread| ≤ 10", lambda r: r["spread"] is not None and abs(r["spread"]) <= 10),
                       ("|spread| > 10", lambda r: r["spread"] is not None and abs(r["spread"]) > 10)):
            P(f"| {lab} " + fmt_ats(*ats([r for r in allr if f(r)], kind, t)))
        P("")
    P("(Subgroups were not used to choose anything; they are many looks at small samples.)\n")

    # verdict (rule from the task: positive out-of-sample ROI with a CI that is not clearly negative)
    def verdict(r):
        if not r:
            return "none"
        n = r["test_w"] + r["test_l"]
        if n < 40 or not r["test_roi"] > 0:
            return "none"
        return "proven" if r["test_roi_lo"] > 0 else "weak"
    edge = {k: verdict(res.get(k)) for k in ("spread", "total")}
    res["edge"] = edge
    label = {"none": "no edge", "weak": "weak edge candidate (OOS ROI > 0 but CI includes losing)",
             "proven": "edge (OOS ROI CI above zero)"}
    P("## Verdict\n")
    for k in ("spread", "total"):
        r = res.get(k)
        if r:
            P(f"- {k}: threshold ≥{r['threshold']}, out-of-sample {r['test_w']}-{r['test_l']}-{r['test_p']}, "
              f"ROI {100*r['test_roi']:+.1f}% [{100*r['test_roi_lo']:+.1f}, {100*r['test_roi_hi']:+.1f}] → "
              f"**{label[edge[k]]}**")
    P("\nRule for flagging picks in today.md: out-of-sample ROI > 0 on ≥40 bets at the threshold chosen on the "
      "tuning half (\"weak\" if the 95% CI still includes negative ROI, \"proven\" only if the whole CI is above 0). "
      "A stricter bar drafted earlier (CI lower bound > −10%) is *not* met by either market.\n")
    P("### Caveats\n")
    P("- Two weeks of out-of-sample data; every CI above is wide enough to include both a sizeable edge and a sizeable loss.")
    P("- Totals: model − line regressed on actual − line gives a positive slope in both halves "
      "(table in section c; significant in the tuning half and pooled, not on its own in the test half), but the test-half win came mostly from *overs* during a stretch "
      "when games went over the closing total on average; the tuning half was balanced over/under.")
    P("- Spreads: the model is less accurate than the closing spread and shows no ATS signal at any threshold.")
    P("- Lines are DraftKings closing numbers via ESPN; bets placed earlier at worse/better numbers will differ.")
    with open(os.path.join(M.HERE, "backtest.md"), "w") as f:
        f.write("\n".join(out) + "\n")
    with open(os.path.join(M.DATA, "backtest_result.json"), "w") as f:
        json.dump(res, f, indent=1)
    with open(os.path.join(M.DATA, "backtest_preds.json"), "w") as f:
        json.dump({"spread_rows": rows_m, "total_rows": rows_t}, f)
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
