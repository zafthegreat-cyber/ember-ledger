export function relativeUiTime(value, now = Date.now()) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "Date not recorded";
  const minutes = Math.floor((now - timestamp) / 60000);
  if (minutes < 0) return new Date(timestamp).toLocaleDateString();
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) { const hours = Math.floor(minutes / 60); return `${hours} hour${hours === 1 ? "" : "s"} ago`; }
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
export function dateGroup(value, now = Date.now()) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "Date not recorded";
  const today = new Date(now);
  const yesterday = new Date(now); yesterday.setDate(today.getDate() - 1);
  return date.toDateString() === today.toDateString() ? "Today" : date.toDateString() === yesterday.toDateString() ? "Yesterday" : "Earlier";
}
