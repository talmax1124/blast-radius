export function easternClock(now = new Date()): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
  };
}

export function cronAuthorized(headers: Headers, secret: string | undefined): boolean {
  // An easily forged provider header must never substitute for authentication.
  return Boolean(secret?.trim()) && headers.get("authorization") === `Bearer ${secret}`;
}
