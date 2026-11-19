// 脳卒中フォーマット:項目の一覧と、文にする部品(画面とは切り離した部品。テストあり)
import { diffDays, fmt, isDate } from './dates.js';

export const FORMATS = [['stroke', '脳卒中'], ['none', 'なし(あとで)']];
export const DX = ['脳梗塞', '脳出血', 'くも膜下出血', 'その他'];
export const INFARCT_TYPES = ['アテローム血栓性', '心原性', 'ラクナ', 'その他'];
export const SIDES = ['右', '左', '両側'];
export const LESIONS = ['被殻', '視床', '内包', '放線冠', '皮質下', '前頭葉', '頭頂葉', '側頭葉', '後頭葉', '脳幹(橋・延髄)', '小脳'];
export const VESSELS = ['中大脳動脈', '前大脳動脈', '後大脳動脈', '椎骨脳底動脈'];

export const BRS_PARTS = [['ue', '上肢'], ['hand', '手指'], ['le', '下肢']];
export const BRS = [['1', 'Ⅰ'], ['2', 'Ⅱ'], ['3', 'Ⅲ'], ['4', 'Ⅳ'], ['5', 'Ⅴ'], ['6', 'Ⅵ']];
export const MAS_MUSCLES = [['elbowF', '肘屈筋'], ['fingerF', '手指屈筋'], ['kneeE', '膝伸筋'], ['triceps', '下腿三頭筋']];
export const MAS = ['0', '1', '1+', '2', '3', '4'];
// ROM:[キー, 名前, 参考可動域]
export const ROM_JOINTS = [
  ['shFlex', '肩 屈曲', 180], ['shAbd', '肩 外転', 180], ['shER', '肩 外旋', 60], ['elFlex', '肘 屈曲', 145], ['wrExt', '手 背屈', 70],
  ['hipFlex', '股 屈曲', 125], ['hipExt', '股 伸展', 15], ['hipAbd', '股 外転', 45], ['knFlex', '膝 屈曲', 130], ['knExt', '膝 伸展', 0], ['ankDF', '足 背屈', 20],
];
export const MMT_MUSCLES = [
  ['shFlex', '肩 屈曲'], ['elFlex', '肘 屈曲'], ['elExt', '肘 伸展'], ['hipFlex', '股 屈曲'], ['hipExt', '股 伸展'], ['hipAbd', '股 外転'],
  ['knExt', '膝 伸展'], ['knFlex', '膝 屈曲'], ['ankDF', '足 背屈'], ['ankPF', '足 底屈'],
];
export const MMT_TRUNK = [['trFlex', '体幹 屈曲'], ['trRot', '体幹 回旋']];
export const MMT = ['0', '1', '2', '3', '4', '5'];
export const SENS_SUP = ['正常', '軽度鈍麻', '重度鈍麻', '脱失', '過敏'];
export const SENS_DEEP = ['正常', '軽度鈍麻', '重度鈍麻', '脱失'];
export const LIMBS = [['ue', '上肢'], ['le', '下肢']];
export const ATAXIA_TESTS = [['fn', '指鼻試験'], ['hk', '踵膝試験'], ['dd', '反復拮抗運動']];
export const ATAXIA_TRUNK = [['sit', '体幹(座位)'], ['stand', '体幹(立位)']];
export const ATAXIA = ['なし', '軽度', '中等度', '重度'];
export const CIRC = [['arm', '上腕'], ['forearm', '前腕'], ['thigh', '大腿(膝上10cm)'], ['calf', '下腿(最大)']];
export const HBF = [
  ['neglect', '半側空間無視'], ['attention', '注意障害'], ['aphComp', '失語(理解)'], ['aphExp', '失語(表出)'], ['apraxia', '失行'],
  ['memory', '記憶障害'], ['executive', '遂行機能障害'], ['insight', '病識の低下'], ['pusher', 'プッシャー現象'],
];
export const HBF_LEVELS = ['なし', '疑い', '軽度', '中等度', '重度'];
export const SCORES = [['mmse', 'MMSE', '/30'], ['hdsr', 'HDS-R', '/30'], ['fab', 'FAB', '/18'], ['tmtA', 'TMT-A', '秒'], ['tmtB', 'TMT-B', '秒']];

const R = { R: '右', L: '左' };
const roman = (v) => (BRS.find((b) => b[0] === String(v)) || [])[1] || '';

// 損傷側 → 麻痺側(右の損傷なら左の麻痺)。両側・不明なら両方
export function pareticSides(p) {
  const s = p.stroke && p.stroke.side;
  if (s === '右') return ['L'];
  if (s === '左') return ['R'];
  return ['R', 'L'];
}
export function nonPareticSides(p) {
  const s = p.stroke && p.stroke.side;
  if (s === '右') return ['R'];
  if (s === '左') return ['L'];
  return ['R', 'L'];
}
export const sideName = (k) => R[k];

// 損傷側に合わせて、高次脳の項目の並びを変える(右→無視を先頭、左→失語を先頭)
export function hbfOrder(p) {
  const s = p.stroke && p.stroke.side;
  const first = s === '右' ? ['neglect', 'attention', 'pusher'] : s === '左' ? ['aphComp', 'aphExp', 'apraxia'] : [];
  return [...HBF.filter(([k]) => first.includes(k)).sort((a, b) => first.indexOf(a[0]) - first.indexOf(b[0])), ...HBF.filter(([k]) => !first.includes(k))];
}

export function diagnosisText(p) {
  const s = p.stroke || {};
  if (!s.dx) return '';
  const dx = s.dx === '脳梗塞' && s.subtype && s.subtype !== 'その他' ? `脳梗塞(${s.subtype})` : s.dx;
  const where = [...(s.lesions || []), ...(s.vessels || []).map((v) => `${v}領域`)];
  return `${dx}${s.side ? ` ${s.side}` : ''}${where.length ? ` ${where.join('・')}` : ''}${s.memo ? `(${s.memo})` : ''}`;
}
export function onsetDays(p, today) {
  const d = p.stroke && p.stroke.onsetDate;
  return isDate(d) ? diffDays(today, d) : null;
}

// 「全部 正常」のときの値
export function normalValues(p) {
  const v = { brs: {}, mas: {}, mmt: {}, sens: { sup: {}, deep: {} }, ataxia: {}, hbf: {} };
  for (const [k] of MAS_MUSCLES) v.mas[k] = '0';
  for (const [k] of MMT_MUSCLES) for (const s of nonPareticSides(p)) setIn(v.mmt, [k, s], '5');
  for (const [k] of MMT_TRUNK) v.mmt[k] = '5';
  for (const [l] of LIMBS) for (const s of pareticSides(p)) { setIn(v.sens.sup, [l, s], '正常'); setIn(v.sens.deep, [l, s], '正常'); }
  for (const [k] of ATAXIA_TESTS) for (const s of ['R', 'L']) setIn(v.ataxia, [k, s], 'なし');
  for (const [k] of ATAXIA_TRUNK) v.ataxia[k] = 'なし';
  for (const [k] of HBF) v.hbf[k] = 'なし';
  return v;
}
function setIn(o, keys, val) {
  let x = o;
  for (const k of keys.slice(0, -1)) x = x[k] = x[k] || {};
  x[keys[keys.length - 1]] = val;
}
const get = (o, ...keys) => keys.reduce((x, k) => (x == null ? undefined : x[k]), o);

export function bmi(height, weight) {
  const h = Number(height) / 100;
  const w = Number(weight);
  if (!h || !w) return null;
  return Math.round((w / (h * h)) * 10) / 10;
}

// 1回分の評価を、短い文の行にする(正常なものは書かない)
export function evalLines(r, p) {
  const L = [];
  const brs = BRS_PARTS.map(([k, n]) => (get(r, 'brs', k) ? `${n}${roman(r.brs[k])}` : '')).filter(Boolean);
  if (brs.length) L.push(`・ブルンストローム(${pareticSides(p).map(sideName).join('・')}):${brs.join(' ')}`);
  const mas = MAS_MUSCLES.filter(([k]) => get(r, 'mas', k) && r.mas[k] !== '0').map(([k, n]) => `${n}${r.mas[k]}`);
  if (mas.length) L.push(`・MAS:${mas.join(' ')}`);
  const rom = [];
  for (const [k, n, ref] of ROM_JOINTS) for (const s of ['R', 'L']) {
    const v = get(r, 'rom', k, s);
    if (v !== undefined && v !== '') rom.push(`${sideName(s)}${n}${v}°(参考${ref}°)`);
  }
  if (rom.length) L.push(`・ROM制限:${rom.join('、')}`);
  const mmt = [];
  for (const [k, n] of MMT_MUSCLES) for (const s of ['R', 'L']) {
    const v = get(r, 'mmt', k, s);
    if (v !== undefined && v !== '5') mmt.push(`${sideName(s)}${n}${v}`);
  }
  for (const [k, n] of MMT_TRUNK) if (get(r, 'mmt', k) && r.mmt[k] !== '5') mmt.push(`${n}${r.mmt[k]}`);
  if (mmt.length) L.push(`・MMT(5未満):${mmt.join('、')}`);
  for (const [kind, name] of [['sup', '表在感覚'], ['deep', '深部感覚']]) {
    const bad = [];
    for (const [l, ln] of LIMBS) for (const s of ['R', 'L']) {
      const v = get(r, 'sens', kind, l, s);
      if (v && v !== '正常') bad.push(`${sideName(s)}${ln}${v}`);
    }
    if (bad.length) L.push(`・${name}:${bad.join('、')}`);
  }
  const atx = [];
  for (const [k, n] of ATAXIA_TESTS) for (const s of ['R', 'L']) {
    const v = get(r, 'ataxia', k, s);
    if (v && v !== 'なし') atx.push(`${sideName(s)}${n}${v}`);
  }
  for (const [k, n] of ATAXIA_TRUNK) if (get(r, 'ataxia', k) && r.ataxia[k] !== 'なし') atx.push(`${n}${r.ataxia[k]}`);
  if (atx.length) L.push(`・失調:${atx.join('、')}`);
  const a = r.anthro || {};
  const b = bmi(a.height, a.weight);
  const circ = [];
  for (const [k, n] of CIRC) for (const s of ['R', 'L']) {
    const v = get(a, 'circ', k, s);
    if (v !== undefined && v !== '') circ.push(`${sideName(s)}${n}${v}cm`);
  }
  if (a.height || a.weight || circ.length) L.push(`・形態:${[a.height && `身長${a.height}cm`, a.weight && `体重${a.weight}kg`, b && `BMI${b}`, ...circ].filter(Boolean).join(' ')}`);
  return L;
}
export function hbfLines(r) {
  const L = [];
  const bad = HBF.filter(([k]) => get(r, 'hbf', k) && r.hbf[k] !== 'なし').map(([k, n]) => `${n}${r.hbf[k]}`);
  if (bad.length) L.push(`・${bad.join('、')}`);
  else if (r.hbf && Object.keys(r.hbf).length) L.push('・目立った障害なし');
  const sc = SCORES.filter(([k]) => get(r, 'scores', k) !== undefined && r.scores[k] !== '').map(([k, n, u]) => `${n}${r.scores[k]}${u}`);
  if (sc.length) L.push(`・検査:${sc.join(' ')}`);
  return L;
}
// 一覧に出す短い1行
export function evalShort(r) {
  const brs = BRS_PARTS.map(([k, n]) => (get(r, 'brs', k) ? `${n}${roman(r.brs[k])}` : '')).filter(Boolean).join(' ');
  const bad = HBF.filter(([k]) => get(r, 'hbf', k) && r.hbf[k] !== 'なし').length;
  const mmse = get(r, 'scores', 'mmse');
  return [brs && `BRS ${brs}`, bad ? `高次脳 ${bad}項目` : '', mmse !== undefined && mmse !== '' ? `MMSE${mmse}` : ''].filter(Boolean).join(' / ') || '入力あり';
}

// サマリーの下書きに入れる部分
export function strokeSummary(p, records) {
  if (p.format !== 'stroke') return [];
  const list = records.filter((r) => r.type === 'stroke').sort((a, b) => a.date.localeCompare(b.date));
  const s = p.stroke || {};
  const L = ['', '■脳卒中', `・診断:${diagnosisText(p) || '(未入力)'}`];
  if (isDate(s.onsetDate)) L.push(`・発症日:${fmt(s.onsetDate)}`);
  if (!list.length) return [...L, '', '■身体機能・高次脳機能', '・(未評価)'];
  const first = list[0];
  const last = list[list.length - 1];
  const block = (r, title) => [`〈${title} ${fmt(r.date)}〉`, ...evalLines(r, p), ...hbfLines(r).map((x) => (x.startsWith('・検査') ? x : x.replace('・', '・高次脳:')))];
  L.push('', '■身体機能・高次脳機能');
  L.push(...block(first, '最初'));
  if (last !== first) L.push(...block(last, '最新'));
  if (first.memo || last.memo) L.push(`・メモ:${(last.memo || first.memo).trim()}`);
  return L;
}
