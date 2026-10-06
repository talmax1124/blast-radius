export type League = "mlb" | "nfl" | "nhl";
export type Article = {
  id: string;
  league: League;
  title: string;
  summary: string;
  url: string;
  publishedAt: string;
  source: string;
  topic: "availability" | "roster" | "report";
};
export type ResearchFeed = {
  league: League;
  name: string;
  status: "live" | "empty" | "error";
  count: number;
  checkedAt: string;
  message: string;
};
export type ResearchReport = {
  generatedAt: string;
  articles: Article[];
  feeds: ResearchFeed[];
  synthesis: { text: string; sourceIds: string[] }[];
  mode: "source-digest" | "model-assisted";
  model: string | null;
  note: string;
};
export type DailyTask = "mlb" | "nfl" | "nhl" | "research" | "board";
export type DailyRun = {
  date: string;
  task: DailyTask;
  status: "running" | "published" | "failed";
  started_at: string;
  finished_at: string | null;
  error: string | null;
};
