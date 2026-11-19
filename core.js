// 画面どうしで共通に使う部品(状態・保存・小さな表示部品)
import * as db from './db.js';
import { todayStr, isDate } from './dates.js';
import * as L from './logic.js';
import { praise } from './messages.js';

export const S = {
  settings: null, patients: [], events: [], holidays: new Set(), flags: new Set(), plans: {}, records: [],
  ui: { mineOnly: true, sortBy: 'discharge' },
};
// ボタンの動き(各画面のファイルがここに足していく)
export const actions = {};
// 入力欄を変えたときの動き(data-chg)
export const changes = {};

// 動作確認用:URLに ?today=2026-12-01 を付けると「今日」をずらせる
const fakeToday = new URLSearchParams(location.search).get('today');
export const today = () => (fakeToday && isDate(fakeToday) ? fakeToday : todayStr());

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const nowIso = () => new Date().toISOString();
export const byId = (id) => S.patients.find((p) => p.id === id);

let renderFn = () => {};
export const setRender = (fn) => (renderFn = fn);
export const render = () => renderFn();

export async function load() {
  const saved = (await db.get('kv', 'settings')) || {};
  const def = L.defaultSettings();
  S.settings = { ...def, walkLimitMin: 15, ...saved, adlTable: saved.adlTable || def.adlTable, visitChecklist: saved.visitChecklist || def.visitChecklist };
  S.patients = await db.getAll('patients');
  S.events = await db.getAll('events');
  S.holidays = new Set((await db.getAll('holidays')).map((h) => h.date));
  S.flags = new Set((await db.getAll('flags')).map((f) => f.key));
  S.plans = Object.fromEntries((await db.getAll('plans')).map((p) => [p.month, p]));
  S.records = await db.getAll('records');
}
export const saveSettings = () => db.put('kv', S.settings);
export async function savePatient(p) {
  p.updatedAt = nowIso();
  await db.put('patients', p);
  const i = S.patients.findIndex((x) => x.id === p.id);
  if (i >= 0) S.patients[i] = p; else S.patients.push(p);
}
export async function saveEvent(e) {
  await db.put('events', e);
  const i = S.events.findIndex((x) => x.id === e.id);
  if (i >= 0) S.events[i] = e; else S.events.push(e);
}
export async function setFlag(key) {
  S.flags.add(key);
  await db.put('flags', { key, at: nowIso() });
}
export async function savePlan(pl) {
  S.plans[pl.month] = pl;
  await db.put('plans', pl);
}
export async function saveRecord(r) {
  r.updatedAt = nowIso();
  await db.put('records', r);
  const i = S.records.findIndex((x) => x.id === r.id);
  if (i >= 0) S.records[i] = r; else S.records.push(r);
}
export async function deleteRecord(id) {
  await db.del('records', id);
  S.records = S.records.filter((r) => r.id !== id);
}
export const recordsOf = (pid, type) =>
  S.records.filter((r) => r.patientId === pid && (!type || r.type === type)).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
export const recordById = (id) => S.records.find((r) => r.id === id);

// 「a.b.c」の形で中身を読み書きする
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] = o[k] && typeof o[k] === 'object' ? o[k] : {};
  o[keys[keys.length - 1]] = value;
}

// ---------- 小さな部品 ----------
let toastTimer;
export function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}
export const cheer = () => toast(praise());

export function openSheet(title, html) {
  const w = $('#sheet');
  w.innerHTML = `<div class="sheet" role="dialog"><div class="sheet-head"><h3>${esc(title)}</h3><button class="x" data-act="closeSheet" aria-label="閉じる">✕</button></div>${html}</div>`;
  w.hidden = false;
}
export function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheet').innerHTML = '';
}
export async function copyText(text, msg = 'コピーしました') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(msg);
}
export const texts = {}; // コピー用の文
export function copyBtn(text, labelText = 'コピー', cls = '') {
  const k = 'c' + Object.keys(texts).length;
  texts[k] = text;
  return `<button class="btn ${cls}" data-act="copy" data-k="${k}">${labelText}</button>`;
}
export function clearTexts() {
  for (const k of Object.keys(texts)) delete texts[k];
}
// ボタンで1つ選ぶ(押すとすぐ保存)
export function chips(list, current, attrs, { multi = false } = {}) {
  return `<div class="chips">${list
    .map((item) => {
      const [v, name] = Array.isArray(item) ? item : [item, item];
      const on = multi ? (current || []).includes(v) : current === v;
      return `<button class="chip ${on ? 'on' : ''}" ${attrs} data-v="${esc(v)}">${esc(name)}</button>`;
    })
    .join('')}</div>`;
}
// フォームの中で使う選択ボタン(ラジオボタン)
export function radioChips(name, list, current) {
  return `<div class="chips">${list
    .map((item) => {
      const [v, n] = Array.isArray(item) ? item : [item, item];
      return `<label class="chip-r"><input type="radio" name="${name}" value="${esc(v)}" ${String(current) === String(v) ? 'checked' : ''}><span>${esc(n)}</span></label>`;
    })
    .join('')}</div>`;
}
