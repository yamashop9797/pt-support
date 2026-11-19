// 第2段階の計算と文づくり(画面とは切り離した部品。テストあり)
import { diffDays, addDays, fmt, isDate, monthKey, endOfMonth } from './dates.js';
import { ADL_ITEMS, label, visitDate, EVENT_TYPES } from './logic.js';
import { strokeSummary } from './stroke.js';
import { orthoSummary } from './ortho.js';
import { sciSummary } from './sci.js';

export const GENDERS = { m: '男性', f: '女性' };
export const AGES = [['u50', '50代以下'], ['60', '60代'], ['70', '70代'], ['80', '80代'], ['90', '90代以上']];
export const LIMITS = [60, 90, 150, 180];
export const MODES = ['徒歩', '自転車', '車', 'バス', 'タクシー'];
export const PLACE_KINDS = { super: 'スーパー', hospital: '病院・通院先', hobby: '趣味・好きな場所' };
export const LIVING = ['独居', '昼間独居', '同居'];
export const RELS = ['配偶者', '長男', '長女', '次男', '次女', 'その他'];
export const COOP = ['とても協力的', '協力的', '限られる', '難しい'];
export const WORK = ['働いていない', 'パート', 'フルタイム', '夜勤あり'];
export const DIST = ['同居', '15分以内', '30分以内', '1時間以内', 'それ以上'];
export const KAIGO = ['未申請', '申請中', '要支援1', '要支援2', '要介護1', '要介護2', '要介護3', '要介護4', '要介護5'];
export const TECHO = ['なし', '申請中', '身体1級', '身体2級', '身体3級', '身体4級', '身体5級', '身体6級', 'その他'];
export const ORTHO_STATUS = { none: 'なし', yes: 'あり', making: '作製中' };
export const ORTHO_TYPES = { afo: '短下肢装具', kafo: '長下肢装具', other: 'その他' };
export const FIM_MOTOR = [
  ['eat', '食事'], ['groom', '整容'], ['bath', '清拭'], ['dressU', '更衣(上半身)'], ['dressL', '更衣(下半身)'],
  ['toilet', 'トイレ動作'], ['bladder', '排尿管理'], ['bowel', '排便管理'], ['trBed', 'ベッド・椅子・車椅子移乗'],
  ['trToilet', 'トイレ移乗'], ['trTub', '浴槽・シャワー移乗'], ['walk', '歩行・車椅子'], ['stairs', '階段'],
];
export const FIM_COG = [['comp', '理解'], ['expr', '表出'], ['social', '社会的交流'], ['problem', '問題解決'], ['memory', '記憶']];
export const FIM_TIMINGS = { admit: '入院時', mid: '途中', discharge: '退院時' };
export const DAILY_TAGS = ['歩行', '立位・バランス', '移乗', 'ADL練習', '階段', '屋外歩行', '上肢', '自主トレ', '家族指導'];
export const MOODS = ['良い', 'ふつう', '不調'];
export const VISIT_PEOPLE = ['本人', '家族', 'ケアマネ', '福祉用具', 'PT', 'OT', '看護師', 'MSW'];
export const VISIT_AREAS = ['屋外(アプローチ)', '玄関', '廊下', 'トイレ', '浴室', '寝室', '居間', '台所', '階段'];
export const VISIT_STATUS = ['問題なし', '手すり', '段差解消', '福祉用具', '要検討'];

const ageName = (a) => (AGES.find((x) => x[0] === a) || [])[1] || '';

// ---------- 大きな数字 ----------
export function patientNumbers(p, today) {
  const out = {};
  if (isDate(p.admitDate)) out.sinceAdmit = diffDays(today, p.admitDate);
  if (isDate(p.kaifukuDate)) out.sinceKaifuku = diffDays(today, p.kaifukuDate);
  if (isDate(p.dischargeDate)) out.toDischarge = diffDays(p.dischargeDate, today);
  if (isDate(p.kaifukuDate) && LIMITS.includes(Number(p.diseaseLimit))) {
    // 回復期病棟に来た日を1日目として数える
    out.limitDate = addDays(p.kaifukuDate, Number(p.diseaseLimit) - 1);
    out.toLimit = diffDays(out.limitDate, today);
  }
  return out;
}

// ---------- FIM ----------
export function fimTotal(scores = {}) {
  const sum = (list) => list.reduce((s, [k]) => s + (Number(scores[k]) || 0), 0);
  const filled = [...FIM_MOTOR, ...FIM_COG].filter(([k]) => Number(scores[k]) >= 1).length;
  const motor = sum(FIM_MOTOR);
  const cog = sum(FIM_COG);
  return { motor, cog, total: motor + cog, complete: filled === 18, filled };
}
export function fimSummary(records) {
  const list = records.filter((r) => r.type === 'fim').sort((a, b) => a.date.localeCompare(b.date));
  if (!list.length) return null;
  const first = list.find((r) => r.timing === 'admit') || list[0];
  const latest = list[list.length - 1];
  const f = fimTotal(first.scores);
  const l = fimTotal(latest.scores);
  return { first, latest, firstTotal: f, latestTotal: l, gain: first === latest ? 0 : l.total - f.total };
}

// ---------- 行き先 ----------
export function placeFlags(place, p, settings) {
  const out = [];
  const limit = Number(settings.walkLimitMin) || 15;
  if (place.mode === '徒歩' && Number(place.minutes) >= limit) out.push(`徒歩${place.minutes}分(${limit}分以上)`);
  const ok = (p.env && p.env.afterModes) || [];
  if (place.mode && ok.length && !ok.includes(place.mode)) out.push(`退院後の移動手段(${ok.join('・')})では行けない`);
  return out;
}
const TRAVEL = { 徒歩: 'walking', 自転車: 'bicycling', 車: 'driving', タクシー: 'driving', バス: 'transit' };
export function mapsUrl(town, place) {
  const q = new URLSearchParams({ api: '1', destination: `${place.name || ''} ${town || ''}`.trim() });
  if (town) q.set('origin', town);
  if (TRAVEL[place.mode]) q.set('travelmode', TRAVEL[place.mode]);
  return 'https://www.google.com/maps/dir/?' + q.toString();
}

// ---------- 文にする ----------
export function orthosisText(p) {
  const o = p.orthosis || {};
  if (!o.status) return '未入力';
  if (o.status === 'none') return 'なし';
  const type = o.type === 'other' ? o.other || 'その他' : ORTHO_TYPES[o.type] || '種類未入力';
  return `${ORTHO_STATUS[o.status]}(${type})`;
}
export function familyText(f) {
  const rel = f.rel === 'その他' ? f.relOther || 'その他' : f.rel || '続柄未入力';
  const bits = [f.kp ? 'KP' : '', f.coop, f.work, f.distance ? `本人宅まで${f.distance}` : ''].filter(Boolean);
  return `${rel}${bits.length ? `(${bits.join('・')})` : ''}`;
}
export function lifeLines(p, settings) {
  const e = p.env || {};
  const lines = [];
  lines.push(`・住まい:${e.town || '町名未入力'}/${e.living || '状況未入力'}`);
  lines.push(`・退院後の移動手段:${(e.afterModes || []).join('・') || '未入力'}`);
  for (const pl of e.places || []) {
    const flags = placeFlags(pl, p, settings);
    lines.push(`・${PLACE_KINDS[pl.kind] || '行き先'}「${pl.name || '名前なし'}」:${pl.mode || '手段未入力'}${pl.minutes ? `${pl.minutes}分` : ''}${flags.length ? ` ‼️${flags.join('/')}` : ''}`);
  }
  return lines;
}
export function familyLines(p) {
  const fam = p.family || [];
  return fam.length ? fam.map((f) => `・${familyText(f)}`) : ['・未入力'];
}
export function systemText(p) {
  const s = p.system || {};
  const techo = s.techo === 'その他' ? s.techoOther || 'その他' : s.techo;
  return `介護保険:${s.kaigo || '未入力'}/障害者手帳:${techo || '未入力'}`;
}
function adlLines(p) {
  const a = p.adl || {};
  return ADL_ITEMS.filter(([k]) => k !== 'dischargeDate').map(([k, n]) => `・${n}:${(a[k] || '').trim() || '(未入力)'}`);
}
function inbodyLine(r) {
  if (!r) return '';
  const v = [r.weight && `体重${r.weight}kg`, r.smm && `骨格筋量${r.smm}kg`, r.pbf && `体脂肪率${r.pbf}%`, r.smi && `SMI${r.smi}`].filter(Boolean);
  return `${fmt(r.date)} ${v.join(' ') || '数値なし'}`;
}

export function summaryDraft(p, state, today) {
  const recs = (state.records || []).filter((r) => r.patientId === p.id);
  const n = patientNumbers(p, p.dischargeDate && p.dischargeDate < today ? p.dischargeDate : today);
  const fim = fimSummary(recs);
  const ib = recs.filter((r) => r.type === 'inbody').sort((a, b) => a.date.localeCompare(b.date));
  const daily = recs.filter((r) => r.type === 'daily').sort((a, b) => a.date.localeCompare(b.date));
  const tagCount = {};
  for (const d of daily) for (const t of d.tags || []) tagCount[t] = (tagCount[t] || 0) + 1;
  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, c]) => `${t}(${c}回)`);
  const notes = daily.filter((d) => (d.memo || '').trim()).slice(-5).map((d) => `・${fmt(d.date)} ${d.memo.trim()}`);
  const L = [];
  L.push(`【退院時サマリー(下書き)】${label(p)} ${GENDERS[p.gender] || ''} ${ageName(p.ageGroup)}`.trim());
  L.push(`・入院日:${fmt(p.admitDate) || '未入力'} 回復期入棟:${fmt(p.kaifukuDate) || '未入力'} 退院予定:${fmt(p.dischargeDate) || '未入力'}`);
  if (n.sinceAdmit != null && isDate(p.dischargeDate)) L.push(`・在院日数:約${diffDays(p.dischargeDate, p.admitDate)}日`);
  if (p.diseaseLimit) L.push(`・疾患区分:${p.diseaseLimit}日${n.limitDate ? `(上限 ${fmt(n.limitDate)})` : ''}`);
  L.push('', '■入院前の状態', (p.preState || '').trim() || '(未入力)');
  L.push(...strokeSummary(p, recs), ...orthoSummary(p, recs), ...sciSummary(p, recs));
  L.push('', '■FIM');
  if (fim) {
    L.push(`・${FIM_TIMINGS[fim.first.timing] || ''}${fmt(fim.first.date)}:${fim.firstTotal.total}点(運動${fim.firstTotal.motor}/認知${fim.firstTotal.cog})`);
    if (fim.latest !== fim.first) L.push(`・${FIM_TIMINGS[fim.latest.timing] || '最新'}${fmt(fim.latest.date)}:${fim.latestTotal.total}点(運動${fim.latestTotal.motor}/認知${fim.latestTotal.cog}) 利得${fim.gain >= 0 ? '+' : ''}${fim.gain}`);
  } else L.push('・(未入力)');
  L.push('', '■InBody');
  if (ib.length) {
    L.push(`・最初 ${inbodyLine(ib[0])}`);
    if (ib.length > 1) L.push(`・最新 ${inbodyLine(ib[ib.length - 1])}`);
  } else L.push('・(未入力)');
  L.push('', '■ADL', ...adlLines(p));
  L.push('', `■装具:${orthosisText(p)}`);
  L.push('', '■生活環境', ...lifeLines(p, state.settings));
  L.push('', '■家族', ...familyLines(p));
  L.push('', `■制度:${systemText(p)}`);
  L.push('', '■経過(毎日の記録から)');
  L.push(daily.length ? `・記録${daily.length}回。主な内容:${topTags.join('、') || '—'}` : '・(記録なし)');
  L.push(...notes);
  L.push('', '■今後の課題・申し送り', '(ここに書いてください)');
  return L.join('\n');
}

export function homeReportDraft(p, rep = {}, events = []) {
  const v = rep.date || visitDate(p, events);
  const L = [];
  L.push(`【家屋調査報告書(下書き)】${label(p)}`);
  L.push(`・訪問日:${fmt(v) || '未入力'} 参加:${(rep.people || []).join('・') || '未入力'}`);
  L.push(`・住まい:${(p.env && p.env.town) || '町名未入力'}/${(p.env && p.env.living) || '状況未入力'}`);
  L.push('', '■場所ごとの確認');
  let any = false;
  for (const a of VISIT_AREAS) {
    const r = (rep.areas || {})[a];
    if (!r || (!r.status && !r.memo)) continue;
    any = true;
    L.push(`・${a}:${r.status || '—'}${r.memo ? `(${r.memo})` : ''}`);
  }
  if (!any) L.push('・(未入力)');
  L.push('', '■提案・まとめ', (rep.proposal || '').trim() || '(未入力)');
  L.push('', `■装具:${orthosisText(p)}`, `■退院後の移動手段:${((p.env && p.env.afterModes) || []).join('・') || '未入力'}`);
  return L.join('\n');
}

export function aiPrompt(kind, draft) {
  const what = kind === 'report' ? '家屋調査報告書' : '退院時サマリー';
  return [
    `以下は回復期リハビリテーション病棟の患者さんの情報です(個人が特定できる情報は含みません)。`,
    `理学療法士の${what}として、読みやすい文章に整えてください。`,
    `・書かれていない事実は付け足さないでください`,
    `・見出しごとに、短い文と箇条書きでまとめてください(A4で1枚程度)`,
    `・情報が足りない所は「(要確認)」と書いてください`,
    `・名前や住所などの個人情報は書かないでください`,
    '---',
    draft,
  ].join('\n');
}

// ---------- 月の振り返り ----------
export function monthReview(state, mk) {
  const start = mk + '-01';
  const end = endOfMonth(mk);
  const inMonth = (d) => isDate(d) && d >= start && d <= end;
  const mine = state.patients.filter((p) => p.mine !== false);
  const active = mine.filter((p) => (!p.admitDate || p.admitDate <= end) && (!p.dischargeDate || p.dischargeDate >= start));
  const discharged = mine.filter((p) => inMonth(p.dischargeDate) && (p.archived || p.dischargeDate < (state.today || end)));
  const recs = (state.records || []).filter((r) => inMonth(r.date));
  const gains = [];
  for (const p of discharged) {
    const f = fimSummary((state.records || []).filter((r) => r.patientId === p.id));
    if (f && f.latest !== f.first) gains.push({ p, gain: f.gain });
  }
  const pl = (state.plans || {})[mk];
  return {
    active: active.length,
    discharged: discharged.length,
    newPatients: mine.filter((p) => inMonth(p.admitDate)).length,
    daily: recs.filter((r) => r.type === 'daily').length,
    fim: recs.filter((r) => r.type === 'fim').length,
    inbody: recs.filter((r) => r.type === 'inbody').length,
    summaries: mine.filter((p) => inMonth(p.summaryDone)).length,
    reports: mine.filter((p) => inMonth(p.homeReportDone)).length,
    plans: pl ? (pl.explained || []).length : 0,
    events: (state.events || []).filter((e) => inMonth(e.date) && mine.some((p) => p.id === e.patientId)).length,
    gains,
    avgGain: gains.length ? Math.round((gains.reduce((s, g) => s + g.gain, 0) / gains.length) * 10) / 10 : null,
  };
}

// 予定と進み具合の一覧(患者ページ)
export function scheduleRows(p, state, today) {
  const evs = state.events.filter((e) => e.patientId === p.id).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const rows = [];
  for (const t of ['firstConf', 'dischargeConf', 'homeVisit']) {
    const list = evs.filter((e) => e.type === t);
    if (t === 'homeVisit' && p.homeVisitNeeded === false) continue;
    if (!list.length) rows.push({ type: t, name: EVENT_TYPES[t], status: 'none' });
    for (const e of list) rows.push({ type: t, name: EVENT_TYPES[t], event: e, status: e.done || e.date < today ? 'done' : 'plan' });
  }
  for (const e of evs.filter((x) => x.type === 'other')) rows.push({ type: 'other', name: e.title || '予定', event: e, status: e.done || e.date < today ? 'done' : 'plan' });
  return rows;
}
export { monthKey };
