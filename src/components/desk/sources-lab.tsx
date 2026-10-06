import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ApiSource, BooksBoard, SourceStatus } from "@/lib/mlb/types";

const KIND: Record<ApiSource["kind"], string> = {
  stats: "Stats",
  odds: "Odds",
  pickem: "Pick'em",
  weather: "Weather",
  news: "News",
};

function statusOf(s: SourceStatus): { label: string; variant: "pine" | "brick" | "default" } {
  if (s === "live") return { label: "Live", variant: "pine" };
  if (s === "blocked") return { label: "Blocked", variant: "brick" };
  if (s === "key") return { label: "Key", variant: "default" };
  return { label: "Idle", variant: "default" };
}

export function SourcesLab({ books }: { books?: BooksBoard | null }) {
  const feeds = books?.feeds ?? [];
  const news = books?.news ?? [];
  const live = feeds.filter((f) => f.status === "live").length;
  const used = feeds.filter((f) => f.used && f.status === "live").length;

  if (!feeds.length && !news.length) {
    return (
      <Card className="px-5 py-10 text-center text-sm text-muted">
        The desk pings free feeds on each tick. Open after a post to see what answered.
      </Card>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div>
        <p className="kicker">The wires</p>
        <h2 className="font-display mt-1 text-4xl font-semibold tracking-tight">Free APIs</h2>
        <p className="font-serif mt-1 max-w-2xl text-sm leading-relaxed text-muted italic">
          Everything we can hit without a paid key. Live is answering now. Key means the free tier exists but needs signup. Blocked is Cloudflare or a 403. The desk never places a wager.
        </p>
      </div>

      <div className="grid grid-cols-2 overflow-hidden border border-border sm:grid-cols-4">
        <Tile kicker="Pinged" value={String(feeds.length)} />
        <Tile kicker="Live" value={String(live)} tone="pine" />
        <Tile kicker="On desk" value={String(used)} />
        <Tile kicker="Moves" value={String(news.length)} />
      </div>

      {news.length ? (
        <section className="panel min-w-0 p-4">
          <p className="kicker">Transactions</p>
          <ul className="mt-3 flex flex-col divide-y divide-border">
            {news.map((item, i) => (
              <li key={`${item.date}-${item.name}-${i}`} className="py-2.5">
                <p className="text-sm font-medium">
                  {item.headline}
                  {item.name ? ` · ${item.name}` : ""}
                </p>
                <p className="text-xs text-muted">{item.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ol className="enter-stagger panel min-w-0 divide-y divide-border overflow-hidden">
        {feeds.map((feed) => {
          const st = statusOf(feed.status);
          return (
            <li key={feed.id} className="flex min-h-14 min-w-0 items-start gap-3 px-3 py-3 sm:px-4">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">{feed.name}</p>
                  <Badge variant={st.variant}>{st.label}</Badge>
                  {feed.used ? <Badge variant="lean">Desk</Badge> : null}
                  <span className="kicker">{KIND[feed.kind]}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">{feed.note}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Tile({ kicker, value, tone }: { kicker: string; value: string; tone?: "pine" | "brick" }) {
  return (
    <div className="border-b border-border px-4 py-4 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="kicker">{kicker}</p>
      <p className={`font-display mt-1 text-3xl leading-none font-semibold tabular-nums ${tone === "pine" ? "text-pine" : tone === "brick" ? "text-brick" : ""}`}>
        {value}
      </p>
    </div>
  );
}
