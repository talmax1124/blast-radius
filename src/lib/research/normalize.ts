import type { Article, League } from "./types.ts";

type NewsItem = {
  id?: number | string;
  headline?: string;
  description?: string;
  published?: string;
  links?: { web?: { href?: string } };
};

export function normalizeNews(payload: unknown, league: League, now = new Date()): Article[] {
  const articles = (payload as { articles?: NewsItem[] } | null)?.articles;
  if (!Array.isArray(articles)) throw new Error("News source returned an unexpected format");
  const seen = new Set<string>();
  return articles
    .flatMap((item): Article[] => {
      const title = typeof item?.headline === "string" ? item.headline.trim() : "";
      const timestamp = Date.parse(item?.published ?? "");
      const age = now.getTime() - timestamp;
      if (!title || !Number.isFinite(timestamp) || age < -300_000 || age > 72 * 3_600_000)
        return [];
      let url: URL;
      try {
        url = new URL(item.links?.web?.href ?? "");
      } catch {
        return [];
      }
      if (
        url.protocol !== "https:" ||
        !(url.hostname === "espn.com" || url.hostname.endsWith(".espn.com"))
      )
        return [];
      url.search = "";
      url.hash = "";
      if (seen.has(url.href)) return [];
      seen.add(url.href);
      const summary = typeof item.description === "string" ? item.description.slice(0, 650) : "";
      const text = `${title} ${summary}`;
      const topic =
        /injur|ruled out|questionable|surgery|concussion|illness|inactive|sprain|fracture|torn|tear|out for|sidelin|uncertain|miss.*week|suspend/i.test(
          text,
        )
          ? "availability"
          : /trade|signs|signed|signing|to sign|waiver|roster|recall|optioned/i.test(text)
            ? "roster"
            : "report";
      return [
        {
          id: `${league}:${item.id ?? url.pathname}`,
          league,
          title,
          summary,
          url: url.href,
          publishedAt: new Date(timestamp).toISOString(),
          source: "ESPN",
          topic,
        },
      ];
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 30);
}

export function validatedSynthesis(
  value: unknown,
  articles: Article[],
): { text: string; sourceIds: string[] }[] {
  const rows = (value as { insights?: unknown } | null)?.insights;
  if (!Array.isArray(rows)) return [];
  const known = new Set(articles.map((a) => a.id));
  return rows.slice(0, 8).flatMap((row) => {
    if (
      !row ||
      typeof row !== "object" ||
      typeof row.text !== "string" ||
      !Array.isArray(row.sourceIds)
    )
      return [];
    const ids: unknown[] = row.sourceIds;
    if (!ids.length || ids.some((id) => typeof id !== "string" || !known.has(id))) return [];
    const text = row.text.trim().slice(0, 700);
    return text ? [{ text, sourceIds: [...new Set(ids)] as string[] }] : [];
  });
}
