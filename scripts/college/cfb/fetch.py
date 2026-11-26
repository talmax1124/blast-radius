#!/usr/bin/env python3
"""Fetch CFB game results + closing lines from ESPN public APIs and cache as JSON.

Usage:
  python3 fetch.py            # fetch/refresh everything (cached odds are reused)
  python3 fetch.py --slate    # refresh only the current-week slate (today/tomorrow)

Outputs (in ./data):
  games_2026.json   all 2026 regular-season games involving FBS or FCS teams (scores, neutral, odds)
  games_2025.json   2025 regular-season results + closing lines (prior for 2026 + extra backtest season)
  games_2024.json   2024 regular-season results (prior for the 2025 backtest only)
  odds_cache.json   per-event closing odds from the core API (DraftKings)
  slate.json        Thursday Nov 26 + Friday Nov 27 2026 games with current lines
"""
import json, os, sys, time, random, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
os.makedirs(DATA, exist_ok=True)

SB = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"
CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football"


def get_json(url, tries=6):
    delay = 1.0
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (cfb-model)"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code in (403, 429, 500, 502, 503, 504) and i < tries - 1:
                time.sleep(delay + random.random())
                delay *= 2
                continue
            raise
        except Exception:
            if i < tries - 1:
                time.sleep(delay + random.random())
                delay *= 2
                continue
            raise


def parse_event(e, group):
    c = e["competitions"][0]
    comps = {t["homeAway"]: t for t in c["competitors"]}
    h, a = comps["home"], comps["away"]
    st = c["status"]["type"]
    g = {
        "id": e["id"],
        "date": e["date"],
        "season": e.get("season", {}).get("year"),
        "week": (e.get("week") or {}).get("number"),
        "group": group,
        "neutral": bool(c.get("neutralSite")),
        "conf_game": bool(c.get("conferenceCompetition")),
        "state": st.get("state"),
        "completed": bool(st.get("completed")),
        "status": st.get("name"),
        "home_id": h["team"]["id"], "home": h["team"].get("displayName"),
        "home_abbr": h["team"].get("abbreviation"), "home_conf": h["team"].get("conferenceId"),
        "away_id": a["team"]["id"], "away": a["team"].get("displayName"),
        "away_abbr": a["team"].get("abbreviation"), "away_conf": a["team"].get("conferenceId"),
        "home_score": float(h["score"]) if h.get("score") not in (None, "") else None,
        "away_score": float(a["score"]) if a.get("score") not in (None, "") else None,
    }
    o = c.get("odds") or []
    if o:
        o = sorted(o, key=lambda x: (x.get("provider", {}).get("priority", 99)))[0]
        g["sb_odds"] = {"details": o.get("details"), "overUnder": o.get("overUnder"),
                        "spread": o.get("spread"), "provider": o.get("provider", {}).get("name")}
    return g


def fetch_week(season, week, group):
    url = f"{SB}?dates={season}&seasontype=2&week={week}&groups={group}&limit=400"
    d = get_json(url)
    out = []
    for e in (d or {}).get("events", []):
        try:
            g = parse_event(e, group)
            g["week"] = week
            g["season"] = season
            out.append(g)
        except Exception as ex:  # malformed event
            print("skip", e.get("id"), ex, file=sys.stderr)
    return out


def fetch_season(season, weeks):
    games = {}
    jobs = [(season, w, grp) for w in weeks for grp in (80, 81)]
    with ThreadPoolExecutor(6) as ex:
        for res in ex.map(lambda j: fetch_week(*j), jobs):
            for g in res:
                if g["id"] in games:
                    games[g["id"]]["groups"] = sorted(set(games[g["id"]]["groups"] + [g["group"]]))
                else:
                    g["groups"] = [g["group"]]
                    games[g["id"]] = g
    for g in games.values():
        g.pop("group", None)
    return sorted(games.values(), key=lambda g: (g["date"], g["id"]))


def pick_line(item, side):
    try:
        return item[side]["close"]["pointSpread"]["american"]
    except Exception:
        return None


def fetch_odds(eid):
    d = get_json(f"{CORE}/events/{eid}/competitions/{eid}/odds")
    if not d or not d.get("items"):
        return {"none": True}
    items = [x for x in d["items"] if "live" not in (x.get("provider", {}).get("name") or "").lower()]
    if not items:
        return {"none": True, "live_only": True}
    # prefer DraftKings (the 2026 default); fall back to provider priority
    items = sorted(items, key=lambda x: (0 if (x.get("provider", {}).get("name") or "").startswith("DraftKings") else 1,
                                         x.get("provider", {}).get("priority", 99)))
    it = items[0]
    out = {
        "provider": it.get("provider", {}).get("name"),
        "details": it.get("details"),
        "spread": it.get("spread"),
        "overUnder": it.get("overUnder"),
        "overOdds": it.get("overOdds"), "underOdds": it.get("underOdds"),
        "homeSpreadOdds": (it.get("homeTeamOdds") or {}).get("spreadOdds"),
        "awaySpreadOdds": (it.get("awayTeamOdds") or {}).get("spreadOdds"),
    }
    try:
        out["open_total"] = float(it["open"]["total"]["american"])
    except Exception:
        out["open_total"] = None
    try:
        v = it["homeTeamOdds"]["open"]["pointSpread"]["american"]
        out["open_spread"] = 0.0 if v in ("EVEN", "PK", "pk") else float(v)
    except Exception:
        out["open_spread"] = None
    try:
        v = it["homeTeamOdds"]["close"]["pointSpread"]["american"]
        out["close_spread_home"] = 0.0 if v in ("EVEN", "PK", "pk") else float(v)
    except Exception:
        out["close_spread_home"] = None
    return out


def main():
    slate_only = "--slate" in sys.argv
    if not slate_only:
        cache_path = os.path.join(DATA, "odds_cache.json")
        cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
        # 2024: results only (prior for 2025). 2025: full extra backtest season. 2026: current.
        for season, weeks, want_odds in ((2024, range(1, 16), False), (2025, range(1, 16), True), (2026, range(1, 14), True)):
            print(f"fetching {season} ...")
            gs = fetch_season(season, weeks)
            if want_odds:
                need = [g["id"] for g in gs if 80 in g["groups"] and g["completed"] and g["id"] not in cache]
                print(f"  {season} games:", len(gs), " odds to fetch:", len(need))
                with ThreadPoolExecutor(8) as ex:
                    for eid, od in zip(need, ex.map(fetch_odds, need)):
                        cache[eid] = od
                json.dump(cache, open(cache_path, "w"), indent=0)
                for g in gs:
                    if g["id"] in cache:
                        g["odds"] = cache[g["id"]]
            json.dump(gs, open(os.path.join(DATA, f"games_{season}.json"), "w"), indent=0)
            print(f"  {season} games:", len(gs))

    # slate: Thursday 11/26 and Friday 11/27 (ESPN dates are US Eastern days)
    slate = []
    for day in ("20261126", "20261127"):
        d = get_json(f"{SB}?dates={day}&groups=80&limit=300")
        for e in (d or {}).get("events", []):
            g = parse_event(e, 80)
            g["slate_day"] = day
            slate.append(g)
    json.dump({"fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "games": slate},
              open(os.path.join(DATA, "slate.json"), "w"), indent=1)
    print("slate games:", len(slate))


if __name__ == "__main__":
    main()
