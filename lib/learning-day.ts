export function learningTimezone(value?: string | null) {
  try { new Intl.DateTimeFormat("en", { timeZone: value || "Asia/Shanghai" }); return value || "Asia/Shanghai"; }
  catch { return "Asia/Shanghai"; }
}

export function learningDayKey(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: learningTimezone(timezone), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
