const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const TIME_ZONE = "Asia/Baghdad";

export const fmtNum = (n: number, digits = 2): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtUsd = (n: number): string => "$" + fmtNum(n);
export const fmtKg = (n: number): string => fmtNum(n) + " kg";
export const fmtIqd = (n: number): string => fmtNum(n, 0) + " IQD";

/** "08 Oct 2026" – always Latin digits, always Baghdad time */
export function fmtDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day").padStart(2, "0")} ${MONTHS[Number(get("month")) - 1]} ${get("year")}`;
}

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ENTITIES[c] as string);
