// 日付の計算(すべて "YYYY-MM-DD" の文字列で扱う。時差のずれを避けるため正午で計算)
export const WD = ['日', '月', '火', '水', '木', '金', '土'];
export const pad = (n) => String(n).padStart(2, '0');

export function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parse(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}
export function isDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
export function addDays(s, n) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
// a - b(日数)
export function diffDays(a, b) {
  return Math.round((parse(a) - parse(b)) / 86400000);
}
export function weekday(s) {
  return parse(s).getDay();
}
export function todayStr() {
  return ymd(new Date());
}
export function monthKey(s) {
  return String(s).slice(0, 7);
}
export function addMonths(mk, n) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1, 12);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function endOfMonth(mk) {
  return addDays(addMonths(mk, 1) + '-01', -1);
}
// 月曜はじまりの週の最初の日
export function weekStart(s) {
  const w = weekday(s);
  return addDays(s, w === 0 ? -6 : 1 - w);
}
export function fmt(s) {
  if (!isDate(s)) return '';
  const d = parse(s);
  return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`;
}
export function fmtLong(s) {
  if (!isDate(s)) return '';
  const d = parse(s);
  return `${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`;
}
