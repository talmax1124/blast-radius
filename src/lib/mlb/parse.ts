export function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "-.--" || trimmed === "-") return 0;
    const normalized = trimmed.startsWith(".") ? `0${trimmed}` : trimmed;
    const n = Number.parseFloat(normalized);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function int(value: unknown): number {
  return Math.round(num(value));
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function todayEt(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days));
  return dt.toISOString().slice(0, 10);
}

export function seasonFromDate(date: string): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  if (month < 3) return year - 1;
  return year;
}

export function formatDeskDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

export function handCode(value: unknown): "L" | "R" | "S" | null {
  if (!value || typeof value !== "object") return null;
  const code = (value as { code?: string }).code;
  if (code === "L" || code === "R" || code === "S") return code;
  return null;
}

export function abbrOf(team: { abbreviation?: string; teamCode?: string; name?: string }): string {
  return team.abbreviation ?? team.teamCode?.toUpperCase() ?? team.name ?? "MLB";
}

export function headshotUrl(playerId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:best/v1/people/${playerId}/headshot/67/current`;
}

export function teamLogoUrl(teamId: number): string {
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`;
}

export function formatGameTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

export function parseCsv(text: string): Record<string, string>[] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") {
      cell += c;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((v) => v.trim()))
    .map((r) => {
      const out: Record<string, string> = {};
      headers.forEach((h, i) => {
        out[h] = r[i] ?? "";
      });
      return out;
    });
}

export function foldName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameParts(name: string): { first: string; last: string } {
  const parts = foldName(name).split(" ").filter(Boolean);
  return { first: parts[0] ?? "", last: parts[parts.length - 1] ?? "" };
}

export function namesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const A = nameParts(a);
  const B = nameParts(b);
  if (!A.last || A.last !== B.last) return false;
  if (A.first === B.first) return true;
  if (A.first[0] && A.first[0] === B.first[0]) return true;
  return false;
}
