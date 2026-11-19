// 脊損フォーマット:国際基準(ISNCSCI)の項目と計算(画面とは切り離した部品。テストあり)
// 計算は参考です。最終の判定は人が確かめてください。
import { diffDays, fmt, isDate } from './dates.js';

// C1〜S4-5 の並び(上から下)
export const LEVELS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'L1', 'L2', 'L3', 'L4', 'L5', 'S1', 'S2', 'S3', 'S4-5'];
export const DERMS = LEVELS.slice(1); // 感覚は C2〜S4-5 の28か所
// キーマッスル(左右10筋)
export const KEY_MUSCLES = [
  ['C5', '肘屈筋'], ['C6', '手関節背屈筋'], ['C7', '肘伸筋'], ['C8', '指屈筋(中指)'], ['T1', '小指外転筋'],
  ['L2', '股屈筋'], ['L3', '膝伸筋'], ['L4', '足関節背屈筋'], ['L5', '長母趾伸筋'], ['S1', '足関節底屈筋'],
];
export const UPPER = KEY_MUSCLES.slice(0, 5).map((m) => m[0]);
export const LOWER = KEY_MUSCLES.slice(5).map((m) => m[0]);
export const MOTOR = ['0', '1', '2', '3', '4', '5', 'NT'];
export const SENS = ['2', '1', '0', 'NT']; // 2=正常 1=異常 0=なし NT=検査できず
export const AIS = [['A', 'A 完全'], ['B', 'B 感覚のみ残る'], ['C', 'C 運動あり(半分未満が3以上)'], ['D', 'D 運動あり(半分以上が3以上)'], ['E', 'E 正常']];
export const CAUSES = ['外傷性', '非外傷性'];
export const SPASM = ['なし', '軽度', '中等度', '重度'];
export const BLADDER = ['自排尿', '間欠導尿', '留置カテーテル', 'おむつ', 'その他'];
export const BOWEL = ['自然排便', '下剤で調整', '摘便・浣腸', 'その他'];
export const SKIN = ['なし', '発赤あり', '褥瘡あり'];
export const OH = ['なし', 'あり'];

const SN = { R: '右', L: '左' };
const idx = (lv) => LEVELS.indexOf(lv);
const get = (o, ...keys) => keys.reduce((x, k) => (x == null ? undefined : x[k]), o);
const num = (v) => (v === undefined || v === '' || v === 'NT' ? null : Number(v));

export function onsetDays(p, today) {
  const d = p.sci && p.sci.injuryDate;
  return isDate(d) ? diffDays(today, d) : null;
}
export function diagnosisText(p) {
  const s = p.sci || {};
  if (!s.level && !s.cause && !s.memo) return '';
  return [s.cause ? `脊髄損傷(${s.cause})` : '脊髄損傷', s.level && `${s.level}レベル`, s.ais && `AIS ${s.ais}`].filter(Boolean).join(' ') + (s.memo ? `(${s.memo})` : '');
}
// T6より上(T6を含む)なら自律神経過反射に注意
export function adWarning(level) {
  const i = idx(level);
  return i >= 0 && i <= idx('T6');
}

// 感覚レベル(片側):上から見て、触覚・痛覚とも2が続く一番下
export function sensoryLevel(r, side) {
  for (let i = 0; i < DERMS.length; i++) {
    const lt = get(r, 'lt', DERMS[i], side);
    const pp = get(r, 'pp', DERMS[i], side);
    if (lt === undefined || pp === undefined || lt === '' || pp === '') return null; // 未入力で決められない
    if (String(lt) !== '2' || String(pp) !== '2') return LEVELS[idx(DERMS[i]) - 1];
  }
  return 'INT';
}

// 運動レベル(片側)。キーマッスルのない所(C1-4, T2-L1, S2-5)は感覚レベルと同じとみなす
export function motorLevel(r, side) {
  const sl = sensoryLevel(r, side);
  if (!sl) return null;
  const m = (lv) => get(r, 'motor', lv, side);
  // 上肢
  for (let i = 0; i < UPPER.length; i++) {
    const v = m(UPPER[i]);
    if (v === undefined || v === '' || v === 'NT') return null;
    const n = Number(v);
    if (n < 3) {
      if (i === 0) return sl !== 'INT' && idx(sl) < idx('C4') ? sl : 'C4';
      return UPPER[i - 1];
    }
    if (n < 5) return UPPER[i];
  }
  // 上肢が全部5:T2〜L1 は感覚レベルに合わせる
  if (sl !== 'INT' && idx(sl) < idx('L1')) return idx(sl) < idx('T1') ? 'T1' : sl;
  // 下肢
  for (let i = 0; i < LOWER.length; i++) {
    const v = m(LOWER[i]);
    if (v === undefined || v === '' || v === 'NT') return null;
    const n = Number(v);
    if (n < 3) return i === 0 ? 'L1' : LOWER[i - 1];
    if (n < 5) return LOWER[i];
  }
  return sl === 'INT' || idx(sl) <= idx('S1') ? (sl === 'INT' ? 'INT' : 'S1') : sl;
}

export function totals(r) {
  const sum = (lvs, side) => lvs.reduce((a, lv) => a + (num(get(r, 'motor', lv, side)) || 0), 0);
  const sens = (kind, side) => DERMS.reduce((a, d) => a + (num(get(r, kind, d, side)) || 0), 0);
  return {
    uems: { R: sum(UPPER, 'R'), L: sum(UPPER, 'L') },
    lems: { R: sum(LOWER, 'R'), L: sum(LOWER, 'L') },
    lt: { R: sens('lt', 'R'), L: sens('lt', 'L') },
    pp: { R: sens('pp', 'R'), L: sens('pp', 'L') },
  };
}

// まとめの判定:神経学的レベル・完全/不完全・AIS(参考)
export function classify(r) {
  const s = { R: sensoryLevel(r, 'R'), L: sensoryLevel(r, 'L') };
  const m = { R: motorLevel(r, 'R'), L: motorLevel(r, 'L') };
  const levels = [s.R, s.L, m.R, m.L];
  const nli = levels.includes(null) ? null : levels.reduce((a, b) => (rank(b) < rank(a) ? b : a));
  const out = { sensory: s, motor: m, nli, complete: null, ais: null };
  // 仙髄(S4-5)の残り方
  const s45 = ['R', 'L'].flatMap((sd) => [get(r, 'lt', 'S4-5', sd), get(r, 'pp', 'S4-5', sd)]);
  if (s45.some((v) => v === undefined || v === '') || !r.vac || !r.dap) return out;
  const sacralSens = s45.some((v) => v !== 'NT' && Number(v) > 0) || r.dap === 'あり';
  const vac = r.vac === 'あり';
  out.complete = !sacralSens && !vac;
  if (!nli) return out;
  const allMotor = KEY_MUSCLES.every(([lv]) => ['R', 'L'].every((sd) => get(r, 'motor', lv, sd) === '5'));
  const allSens = DERMS.every((d) => ['R', 'L'].every((sd) => String(get(r, 'lt', d, sd)) === '2' && String(get(r, 'pp', d, sd)) === '2'));
  if (allMotor && allSens && vac && r.dap === 'あり') { out.ais = 'E'; return out; }
  if (out.complete) { out.ais = 'A'; return out; }
  // 運動レベルより3つ以上下に動く筋があるか(片側ずつ)
  const below3 = ['R', 'L'].some((sd) => m[sd] && m[sd] !== 'INT' && KEY_MUSCLES.some(([lv]) => idx(lv) > idx(m[sd]) + 3 && (num(get(r, 'motor', lv, sd)) || 0) > 0));
  if (!vac && !below3) { out.ais = 'B'; return out; }
  const under = KEY_MUSCLES.filter(([lv]) => nli !== 'INT' && idx(lv) > idx(nli)).flatMap(([lv]) => ['R', 'L'].map((sd) => num(get(r, 'motor', lv, sd))));
  const good = under.filter((v) => v != null && v >= 3).length;
  out.ais = under.length && good * 2 < under.length ? 'C' : 'D';
  return out;
}
function rank(lv) { return lv === 'INT' ? 999 : idx(lv); }

export function normalValues() {
  const v = { motor: {}, lt: {}, pp: {}, vac: 'あり', dap: 'あり' };
  for (const [lv] of KEY_MUSCLES) v.motor[lv] = { R: '5', L: '5' };
  for (const d of DERMS) { v.lt[d] = { R: '2', L: '2' }; v.pp[d] = { R: '2', L: '2' }; }
  return v;
}

const lvName = (v) => (v === 'INT' ? '正常' : v || '未確定');
export function evalLines(r) {
  const c = classify(r);
  const t = totals(r);
  const L = [];
  L.push(`・神経学的レベル:${lvName(c.nli)}  AIS:${r.ais || c.ais || '未確定'}${r.ais && c.ais && r.ais !== c.ais ? `(計算では${c.ais})` : ''}${c.complete == null ? '' : c.complete ? '(完全)' : '(不完全)'}`);
  L.push(`・感覚レベル 右${lvName(c.sensory.R)}/左${lvName(c.sensory.L)}  運動レベル 右${lvName(c.motor.R)}/左${lvName(c.motor.L)}`);
  L.push(`・運動点数 上肢${t.uems.R + t.uems.L}/50 下肢${t.lems.R + t.lems.L}/50  触覚${t.lt.R + t.lt.L}/112 痛覚${t.pp.R + t.pp.L}/112`);
  if (r.vac || r.dap) L.push(`・肛門:随意収縮${r.vac || '—'} 深部圧覚${r.dap || '—'}`);
  const other = [r.spasm && r.spasm !== 'なし' && `痙縮${r.spasm}`, r.bladder && `排尿:${r.bladder}`, r.bowel && `排便:${r.bowel}`, r.skin && r.skin !== 'なし' && `皮膚:${r.skin}`, r.oh === 'あり' && '起立性低血圧あり'].filter(Boolean);
  if (other.length) L.push(`・${other.join('、')}`);
  return L;
}
export function evalShort(r) {
  const c = classify(r);
  const t = totals(r);
  return [`レベル${lvName(c.nli)}`, `AIS ${r.ais || c.ais || '?'}`, `運動${t.uems.R + t.uems.L + t.lems.R + t.lems.L}/100`].join(' / ');
}
// 今の高さ(最新の評価 → 登録のとき)
export function currentLevel(p, records = []) {
  const last = records.filter((r) => r.type === 'sci' && r.patientId === p.id).sort((a, b) => b.date.localeCompare(a.date))[0];
  const c = last ? classify(last).nli : null;
  return c && c !== 'INT' ? c : (p.sci && p.sci.level) || '';
}

export function sciSummary(p, records) {
  if (p.format !== 'sci') return [];
  const s = p.sci || {};
  const list = records.filter((r) => r.type === 'sci').sort((a, b) => a.date.localeCompare(b.date));
  const L = ['', '■脊髄損傷', `・診断:${diagnosisText(p) || '(未入力)'}`];
  if (isDate(s.injuryDate)) L.push(`・受傷日:${fmt(s.injuryDate)}`);
  if (s.surgery) L.push(`・手術:${s.surgery}`);
  if (adWarning(currentLevel(p, records))) L.push('・T6より上の損傷:自律神経過反射に注意');
  L.push('', '■神経学的評価(ISNCSCI)');
  if (!list.length) return [...L, '・(未評価)'];
  const first = list[0];
  const last = list[list.length - 1];
  L.push(`〈最初 ${fmt(first.date)}〉`, ...evalLines(first));
  if (last !== first) L.push(`〈最新 ${fmt(last.date)}〉`, ...evalLines(last));
  if (first.memo || last.memo) L.push(`・メモ:${(last.memo || first.memo).trim()}`);
  return L;
}
export const sideName = (k) => SN[k];
