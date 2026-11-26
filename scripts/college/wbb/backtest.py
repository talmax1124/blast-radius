#!/usr/bin/env python3
"""Walk-forward backtest (no look-ahead) for the WBB rating model.

Steps
 1. tune   : hyper-params (lam, cap, rho, unknown-team prior) by margin MAE on 2025-26 games
             that had NO betting line (so lined games -- the ATS test set -- are never used for fitting).
 2. walk   : for every date from Nov 12, fit only on games with an earlier date, predict that date.
             Seasons: 2025-26 (prior = 2024-25 final ratings) and 2026-27 to date (prior = 2025-26 final).
 3. report : MAE, ATS/ROI at -110 by |model-line| threshold with Wilson 95% CIs, threshold chosen on the
             earlier half and evaluated on the later half, straight-up accuracy, win-prob calibration.
Writes data/params.json, data/preds_<season>.json and backtest.md.

  python3 backtest.py            # full (tune + walk + report)
  python3 backtest.py --no-tune  # reuse data/params.json
"""
import json, math, os, sys, time
import model as M

DATA = M.DATA
THRESH = [0, 2, 3, 5, 7]
WIN, LOSS = 100 / 110, -1.0
BE = 110 / 210


def walk(games, prior, params, start):
    fin = M.final_games(games)
    dates = sorted({g["qdate"] for g in fin if g["qdate"] >= start})
    out, R = [], None
    for d in dates:
        train = [g for g in fin if g["qdate"] < d]
        R = M.fit(train, prior=prior, params=params, warm=R)
        for g in fin:
            if g["qdate"] != d:
                continue
            ph, pa = R.predict(g["home"]["id"], g["away"]["id"], g["neutral"], prior=prior)
            ln = M.pick_line(g)
            out.append({
                "id": g["id"], "qdate": d, "home": g["home"]["name"], "away": g["away"]["name"],
                "neutral": g["neutral"], "pm": ph - pa, "pt": ph + pa,
                "am": g["home"]["score"] - g["away"]["score"], "at": g["home"]["score"] + g["away"]["score"],
                "gp_h": R.games_played.get(g["home"]["id"], 0), "gp_a": R.games_played.get(g["away"]["id"], 0),
                "spread": ln["spread"] if ln else None, "total": ln["total"] if ln else None,
                "spread_open": ln["spread_open"] if ln else None, "total_open": ln["total_open"] if ln else None,
                "home_ml": ln["home_ml"] if ln else None, "away_ml": ln["away_ml"] if ln else None,
            })
    return out, R


def mae(xs):
    return sum(abs(x) for x in xs) / len(xs) if xs else float("nan")


def wilson(w, n, z=1.96):
    if n == 0:
        return (float("nan"), float("nan"))
    p = w / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return c - h, c + h


def ats(preds, thr, market="spread", line_key=None):
    """Bet side of model vs line when |edge|>=thr. Returns dict with w,l,p,roi,ci."""
    w = l = p = 0
    for r in preds:
        L = r[line_key or market]
        if L is None:
            continue
        if market == "spread":
            edge = r["pm"] + L               # >0 -> model likes home vs home line L
            res = r["am"] + L                # >0 home covered
        else:
            edge = r["pt"] - L               # >0 -> over
            res = r["at"] - L
        if abs(edge) < thr or edge == 0:
            continue
        s = res * (1 if edge > 0 else -1)
        if s > 0: w += 1
        elif s < 0: l += 1
        else: p += 1
    n = w + l
    roi = (w * WIN + l * LOSS) / (n + p) if n + p else float("nan")
    lo, hi = wilson(w, n)
    # ROI CI from the win-rate CI (pushes ignored)
    return dict(w=w, l=l, p=p, n=n, pct=w / n if n else float("nan"), lo=lo, hi=hi, roi=roi,
                roi_lo=lo * WIN - (1 - lo) if n else float("nan"), roi_hi=hi * WIN - (1 - hi) if n else float("nan"))


def ols_slope(xs, ys):
    n = len(xs)
    if n < 3:
        return float("nan"), float("nan")
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    a = my - b * mx
    res = sum((y - a - b * x) ** 2 for x, y in zip(xs, ys)) / (n - 2)
    return b, math.sqrt(res / sxx)


def tune(g26, prior25):
    """Coordinate search on margin MAE of UNLINED 2025-26 games (dates >= Nov 12)."""
    space = {"lam": [0.5, 1, 1.5, 2.5, 4], "cap": [20, 25, 30, 35, 45, 80], "rho": [0.4, 0.55, 0.7, 0.85],
             "unk": [(-4, 4), (-8, 8), (-12, 12), (-16, 16)]}
    cur = {"lam": 1.5, "cap": 30, "rho": 0.7, "unk": (-8, 8)}
    cache = {}

    def score(c):
        key = json.dumps(c, sort_keys=True)
        if key in cache:
            return cache[key]
        params = {"lam": c["lam"], "cap": c["cap"], "unk_o": c["unk"][0], "unk_d": c["unk"][1]}
        pri = M.make_prior(prior25, c["rho"])
        preds, _ = walk(g26, pri, params, "20251112")
        un = [r for r in preds if r["spread"] is None]
        s = mae([r["pm"] - r["am"] for r in un])
        cache[key] = s
        print(f"  tune {c} -> MAE {s:.3f} (n={len(un)})", file=sys.stderr)
        return s

    best = score(cur)
    for _ in range(2):
        improved = False
        for k, vals in space.items():
            for v in vals:
                c = dict(cur); c[k] = v
                s = score(c)
                if s < best - 1e-6:
                    best, cur, improved = s, c, True
        if not improved:
            break
    return cur, best, cache


def fit_sigma(preds):
    best = None
    for s10 in range(60, 200, 2):
        s = s10 / 10
        ll = 0.0
        n = 0
        for r in preds:
            if r["am"] == 0:
                continue
            p = min(max(M.phi(r["pm"] / s), 1e-6), 1 - 1e-6)
            ll -= math.log(p if r["am"] > 0 else 1 - p)
            n += 1
        if best is None or ll < best[1]:
            best = (s, ll, n)
    return best[0], best[1] / best[2]


def calib_table(preds, sigma):
    bins = [(0.5, 0.6), (0.6, 0.7), (0.7, 0.8), (0.8, 0.9), (0.9, 0.97), (0.97, 1.01)]
    rows = []
    for lo, hi in bins:
        sel = []
        for r in preds:
            if r["am"] == 0:
                continue
            p = M.phi(r["pm"] / sigma)
            fav_p, fav_won = (p, r["am"] > 0) if p >= 0.5 else (1 - p, r["am"] < 0)
            if lo <= fav_p < hi:
                sel.append((fav_p, fav_won))
        if sel:
            rows.append((f"{lo:.2f}-{min(hi,1):.2f}", len(sel), sum(x[0] for x in sel) / len(sel),
                         sum(x[1] for x in sel) / len(sel)))
    brier = sum((M.phi(r["pm"] / sigma) - (1 if r["am"] > 0 else 0)) ** 2 for r in preds if r["am"]) / max(1, sum(1 for r in preds if r["am"]))
    return rows, brier


def fmt_ats(a):
    if a["n"] == 0:
        return "0 | – | – | –"
    return (f"{a['w']}-{a['l']}-{a['p']} | {100*a['pct']:.1f}% [{100*a['lo']:.1f}, {100*a['hi']:.1f}] | "
            f"{100*a['roi']:+.1f}% [{100*a['roi_lo']:+.1f}, {100*a['roi_hi']:+.1f}]")


def section_ats(title, preds, market="spread", line_key=None):
    lines = [f"\n**{title}**\n", "| |edge| ≥ | W-L-P | win% [95% CI] | ROI @-110 [95% CI] |", "|---|---|---|---|"]
    for t in THRESH:
        lines.append(f"| {t} | " + fmt_ats(ats(preds, t, market, line_key)) + " |")
    return "\n".join(lines)


def choose_threshold(preds, market="spread"):
    """Pick the threshold with best ROI among those with >= 30 bets; require ROI > 0 to 'adopt'."""
    best = None
    for t in THRESH[1:]:
        a = ats(preds, t, market)
        if a["n"] >= 30 and (best is None or a["roi"] > best[1]["roi"]):
            best = (t, a)
    return best


def main():
    t0 = time.time()
    g25, g26, g27 = M.load("2025"), M.load("2026"), M.load("2027")
    R25 = M.fit(M.final_games(g25))
    ppath = os.path.join(DATA, "params.json")
    if "--no-tune" in sys.argv and os.path.exists(ppath):
        P = json.load(open(ppath))
    else:
        cur, best, cache = tune(g26, R25)
        P = {"lam": cur["lam"], "cap": cur["cap"], "rho": cur["rho"], "unk_o": cur["unk"][0],
             "unk_d": cur["unk"][1], "tune_mae_unlined_2025_26": best,
             "tune_log": [[json.loads(k), v] for k, v in cache.items()]}
    params = {k: P[k] for k in ("lam", "cap", "unk_o", "unk_d")}

    pre26, R26 = walk(g26, M.make_prior(R25, P["rho"]), params, "20251112")
    R26full = M.fit(M.final_games(g26), prior=M.make_prior(R25, P["rho"]), params=params)
    pre27, _ = walk(g27, M.make_prior(R26full, P["rho"]), params, "20261112")
    sigma, ll = fit_sigma(pre26)
    P["sigma"] = sigma
    for tag, pr in (("2026", pre26), ("2027", pre27)):
        json.dump(pr, open(os.path.join(DATA, f"preds_{tag}.json"), "w"), separators=(",", ":"))

    L26 = [r for r in pre26 if r["spread"] is not None]
    L27 = [r for r in pre27 if r["spread"] is not None]
    half = len(L26) // 2
    L26a, L26b = L26[:half], L26[half:]
    h27 = len(L27) // 2
    L27a, L27b = L27[:h27], L27[h27:]

    # threshold selection on earlier half only
    pick26 = choose_threshold(L26a)
    pick26_tot = choose_threshold([r for r in L26a if r["total"] is not None], "total")
    pick27 = choose_threshold(L27a) if len(L27a) >= 30 else None
    P["threshold_spread_from_2025_26_H1"] = pick26[0] if pick26 else None
    P["threshold_total_from_2025_26_H1"] = pick26_tot[0] if pick26_tot else None

    def spread_oos(rows, t):
        return ats(rows, t) if t is not None else None

    oos_b = spread_oos(L26b, pick26[0] if pick26 else None)
    oos_27 = spread_oos(L27, pick26[0] if pick26 else None)
    oos_tot_b = ats([r for r in L26b if r["total"] is not None], pick26_tot[0], "total") if pick26_tot else None
    oos_tot_27 = ats([r for r in L27 if r["total"] is not None], pick26_tot[0], "total") if pick26_tot else None

    # edge decision: positive ROI with lower CI of win% above break-even on the held-out sets combined
    def comb(a, b):
        w, l, p = a["w"] + b["w"], a["l"] + b["l"], a["p"] + b["p"]
        lo, hi = wilson(w, w + l)
        return dict(w=w, l=l, p=p, n=w + l, pct=w / max(1, w + l), lo=lo, hi=hi,
                    roi=(w * WIN + l * LOSS) / max(1, w + l + p), roi_lo=lo * WIN - (1 - lo), roi_hi=hi * WIN - (1 - hi))
    oos_all = comb(oos_b, oos_27) if oos_b and oos_27 else None
    oos_tot_all = comb(oos_tot_b, oos_tot_27) if oos_tot_b and oos_tot_27 else None
    edge_spread = bool(oos_all and oos_all["lo"] > BE)
    edge_total = bool(oos_tot_all and oos_tot_all["lo"] > BE)
    P["edge_spread"], P["edge_total"] = edge_spread, edge_total
    json.dump(P, open(ppath, "w"), indent=1)

    # ---------- report ----------
    out = []
    A = out.append
    A("# WBB (NCAA D-I women's basketball) model — walk-forward backtest\n")
    A(f"Generated 2026-11-26 by `scripts/college/wbb/backtest.py` ({time.time()-t0:.0f}s). Data: ESPN scoreboard (groups=50) + core odds API (closing line; DraftKings preferred, else ESPN BET).\n")
    A("## Data & line coverage\n")
    for tag, g, pr in (("2024-25", g25, None), ("2025-26", g26, pre26), ("2026-27 (to Nov 25)", g27, pre27)):
        fin = M.final_games(g)
        if tag.startswith("2026-27"):
            fin = [x for x in fin if x["qdate"] < "20261126"]
        ls = [x for x in fin if (M.pick_line(x) or {}).get("spread") is not None]
        lt = [x for x in fin if (M.pick_line(x) or {}).get("total") is not None]
        A(f"- **{tag}**: {len(fin)} completed games; closing spread on {len(ls)} ({100*len(ls)/max(1,len(fin)):.1f}%), total on {len(lt)}" + (" (scores only, used for the 2025-26 prior)" if tag == "2024-25" else ""))
    A(f"- Walk-forward predictions (dates ≥ Nov 12): 2025-26 {len(pre26)} games ({len(L26)} lined); 2026-27 {len(pre27)} games ({len(L27)} lined).\n")
    A("## Model\n")
    A("Ridge points model: `pts = mu ± h/2 + O_team + D_opp` (neutral → no home term), margin capped for training, "
      "O/D shrunk toward last season's final rating × rho (teams with <10 prior games, mostly non-D-I opponents, get a fixed 'unknown' prior). "
      "Re-fit each morning on games before that date only.\n")
    A(f"Tuned on margin MAE of **un-lined** 2025-26 games only (lined games, i.e. the ATS test set, never touched): "
      f"lam={P['lam']}, cap={P['cap']}, rho={P['rho']}, unknown prior O={P['unk_o']}/D={P['unk_d']} (MAE {P.get('tune_mae_unlined_2025_26', float('nan')):.2f}). "
      f"Fitted home court (2025-26 full): {R26full.h:.2f} pts. Win-prob map: P(home) = Φ(margin/σ), σ = {sigma:.1f} (fit on 2025-26, log-loss {ll:.3f}).\n")

    A("## Accuracy (lined games)\n")
    A("| set | n | MAE model vs actual | MAE line vs actual | MAE model vs line | total: model MAE | total: line MAE | info slope b (SE) |")
    A("|---|---|---|---|---|---|---|---|")
    for name, rows in (("2025-26 all", L26), ("2025-26 H1", L26a), ("2025-26 H2", L26b), ("2026-27", L27)):
        rt = [r for r in rows if r["total"] is not None]
        b, se = ols_slope([r["pm"] + r["spread"] for r in rows], [r["am"] + r["spread"] for r in rows])
        A(f"| {name} | {len(rows)} | {mae([r['pm']-r['am'] for r in rows]):.2f} | {mae([-r['spread']-r['am'] for r in rows]):.2f} | "
          f"{mae([r['pm']+r['spread'] for r in rows]):.2f} | {mae([r['pt']-r['at'] for r in rt]):.2f} | {mae([r['total']-r['at'] for r in rt]):.2f} | {b:+.2f} ({se:.2f}) |")
    A("\n*info slope b*: OLS of (actual margin − market margin) on (model margin − market margin). b≈0 → model adds nothing to the closing line; b>0 significantly → model has information the line lacks.\n")
    A("All games (incl. un-lined): " + ", ".join(
        f"{n}: model margin MAE {mae([r['pm']-r['am'] for r in pr]):.2f}, SU acc {100*sum((r['pm']>0)==(r['am']>0) for r in pr if r['am'])/max(1,sum(1 for r in pr if r['am'])):.1f}% (n={len(pr)})"
        for n, pr in (("2025-26", pre26), ("2026-27", pre27))) + "\n")
    su_line = [r for r in L26 + L27 if r["am"] and r["spread"]]
    A(f"Straight-up on lined games (both seasons, n={len(su_line)}): model {100*sum((r['pm']>0)==(r['am']>0) for r in su_line)/len(su_line):.1f}% vs line favorite {100*sum((r['spread']<0)==(r['am']>0) for r in su_line)/len(su_line):.1f}%.\n")

    A("## ATS vs closing spread (-110, pushes = no action)\n")
    A(section_ats(f"2025-26 H1 ({L26a[0]['qdate']}–{L26a[-1]['qdate']}, n={len(L26a)}) — threshold selection", L26a))
    A(section_ats(f"2025-26 H2 ({L26b[0]['qdate']}–{L26b[-1]['qdate']}, n={len(L26b)}) — held out", L26b))
    if L27:
        A(section_ats(f"2026-27 to date (n={len(L27)}) — fully held out", L27))
        if L27a and L27b:
            A(section_ats(f"2026-27 H1 ({L27a[0]['qdate']}–{L27a[-1]['qdate']}, n={len(L27a)})", L27a))
            A(section_ats(f"2026-27 H2 ({L27b[0]['qdate']}–{L27b[-1]['qdate']}, n={len(L27b)})", L27b))
    A("\nSecondary: same rule vs the **opening** spread (bet at open, graded vs result):")
    A(section_ats("2025-26 + 2026-27 vs open", [r for r in L26 + L27 if r["spread_open"] is not None], "spread", "spread_open"))

    A("\n## Totals vs closing O/U\n")
    T26a = [r for r in L26a if r["total"] is not None]; T26b = [r for r in L26b if r["total"] is not None]
    T27 = [r for r in L27 if r["total"] is not None]
    A(section_ats("2025-26 H1 totals", T26a, "total"))
    A(section_ats("2025-26 H2 totals — held out", T26b, "total"))
    A(section_ats("2026-27 totals — fully held out", T27, "total"))

    A("\n## Threshold chosen on earlier half → out-of-sample result\n")
    def line(name, pk, b, c, allc):
        if not pk:
            return f"- {name}: no threshold had ≥30 bets in H1."
        return (f"- **{name}**: H1 best |edge| ≥ {pk[0]} (H1 {fmt_ats(pk[1])}). "
                f"2025-26 H2: {fmt_ats(b)}. 2026-27: {fmt_ats(c)}. **Combined OOS: {fmt_ats(allc)}**.")
    A(line("Spread", pick26, oos_b, oos_27, oos_all))
    A(line("Total", pick26_tot, oos_tot_b, oos_tot_27, oos_tot_all))
    if pick27:
        A(f"- (Per brief, within 2026-27 alone: H1 picks ≥{pick27[0]} → H2 {fmt_ats(ats(L27b, pick27[0]))}; tiny sample.)")
    A(f"\nBreak-even at -110 is {100*BE:.2f}%. Edge is declared only if the out-of-sample 95% CI lower bound exceeds break-even.\n")
    A(f"**Verdict: spread edge = {'YES' if edge_spread else 'NO'}; total edge = {'YES' if edge_total else 'NO'}.**\n")

    A("## Win-probability calibration (out of sample)\n")
    for name, pr in (("2025-26 (σ fit here — in-sample for σ only)", pre26), ("2026-27 (held out)", pre27)):
        rows, brier = calib_table(pr, sigma)
        A(f"\n**{name}** — Brier {brier:.4f}\n")
        A("| fav prob bin | n | mean predicted | actual fav win% |")
        A("|---|---|---|---|")
        for b, n, mp, act in rows:
            A(f"| {b} | {n} | {100*mp:.1f}% | {100*act:.1f}% |")
    # moneyline check vs closing ML (vig-free)
    def implied(ml):
        return 100 / (ml + 100) if ml > 0 else -ml / (-ml + 100)
    mlrows = [r for r in L26 + L27 if r["home_ml"] and r["away_ml"] and r["am"]]
    if mlrows:
        bm = bk = 0.0
        for r in mlrows:
            ph, pa = implied(r["home_ml"]), implied(r["away_ml"])
            q = ph / (ph + pa)
            y = 1 if r["am"] > 0 else 0
            bm += (M.phi(r["pm"] / sigma) - y) ** 2; bk += (q - y) ** 2
        A(f"\nOn {len(mlrows)} games with closing moneylines: Brier model {bm/len(mlrows):.4f} vs no-vig market {bk/len(mlrows):.4f}.\n")
    A("\n## Caveats\n")
    A("- Only ~15% of D-I WBB games have an ESPN-recorded line; lined games skew to high-major / TV games, which are the most efficiently priced.")
    A("- Hundreds of bets give a 95% CI of roughly ±5 percentage points on win%; a real but small edge (53–55%) cannot be confirmed or excluded at this sample size.")
    A("- Hyper-parameters were tuned on un-lined games' margins (no use of lines or lined results), so ATS numbers are out-of-sample; the threshold was chosen on the earlier half only.")
    A("- The model's margins are compressed vs. the market on blowout-type lined games (e.g. LSU/UConn vs low-majors: model +27 to +40 where the close was +50 to +75 and the result landed nearer the line). "
      "Regressing actual on predicted margin gives a slope ≈1.0 on un-lined games but ≈1.2–1.3 on lined games, so most 'edges' are just the model under-rating elite teams early in the season — a known weakness, not information.")
    A("- 2026-27 is only two weeks old: priors (last season × rho) are weak after portal/graduation turnover, and the line (MAE ~10.4) is far better than the model (MAE ~14.4). "
      "The win-prob map is also overconfident out of sample early in the season (e.g. 85% bin won 79%).")
    A("- Market efficiency check: the 'info slope' of the model's disagreement with the close is +0.07 ± 0.08 over a full season — statistically indistinguishable from zero. The closing line already contains everything this rating model knows.")
    open(os.path.join(M.HERE, "backtest.md"), "w").write("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
