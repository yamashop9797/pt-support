// 整形フォーマット:項目の一覧と、文にする部品(画面とは切り離した部品。テストあり)
import { diffDays, fmt, isDate } from './dates.js';

export const ORTHO_DX = [
  '大腿骨頸部骨折', '大腿骨転子部骨折', '変形性膝関節症', '変形性股関節症', '脊椎圧迫骨折', '腰部脊柱管狭窄症',
  '骨盤骨折', '上腕骨近位部骨折', '橈骨遠位端骨折', 'その他',
];
export const SURGERY = ['人工骨頭', '人工股関節(THA)', '人工膝関節(TKA)', '骨接合', '脊椎固定術', '保存療法', 'その他'];
export const O_SIDES = ['右', '左', '両側', '体幹'];
export const WB = ['免荷', '1/3荷重', '1/2荷重', '2/3荷重', '全荷重'];
export const PRECAUTIONS = ['股 深い屈曲(90°以上)', '股 内転', '股 内旋', '股 外旋', '股 伸展', '膝 深い屈曲', '体幹 前屈', '体幹 ひねり', '重い物を持つ', '正座'];

export const PAIN_SCENES = [['rest', '安静時'], ['move', '動作時'], ['wb', '荷重時']];
export const NRS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
export const INFLAM = [['heat', '熱感'], ['swell', '腫脹'], ['red', '発赤']];
export const YESNO = ['なし', 'あり'];
// ROM:[キー, 名前, 参考可動域]
export const O_ROM = [
  ['shFlex', '肩 屈曲', 180], ['shAbd', '肩 外転', 180], ['shER', '肩 外旋', 60], ['elFlex', '肘 屈曲', 145], ['elExt', '肘 伸展', 5],
  ['wrExt', '手 背屈', 70], ['wrFlex', '手 掌屈', 90],
  ['hipFlex', '股 屈曲', 125], ['hipExt', '股 伸展', 15], ['hipAbd', '股 外転', 45], ['hipAdd', '股 内転', 20], ['hipIR', '股 内旋', 45], ['hipER', '股 外旋', 45],
  ['knFlex', '膝 屈曲', 130], ['knExt', '膝 伸展', 0], ['ankDF', '足 背屈', 20], ['ankPF', '足 底屈', 45],
];
export const O_MMT = [
  ['shFlex', '肩 屈曲'], ['shAbd', '肩 外転'], ['elFlex', '肘 屈曲'], ['elExt', '肘 伸展'], ['grip', '握る'],
  ['hipFlex', '股 屈曲'], ['hipExt', '股 伸展'], ['hipAbd', '股 外転'], ['knExt', '膝 伸展'], ['knFlex', '膝 屈曲'], ['ankDF', '足 背屈'], ['ankPF', '足 底屈'],
];
export const MMT = ['0', '1', '2', '3', '4', '5'];
export const O_CIRC = [['pat0', '膝蓋骨上縁 0cm'], ['pat5', '膝蓋骨上縁 5cm'], ['pat10', '膝蓋骨上縁 10cm'], ['pat15', '膝蓋骨上縁 15cm'], ['calf', '下腿(最大)']];
export const AIDS = ['なし', 'T字杖', '四点杖', '歩行器', '平行棒', '車椅子'];
export const O_TESTS = [['walk10', '10m歩行', '秒'], ['tug', 'TUG', '秒'], ['oneLeg', '片脚立位', '秒']];

const SN = { R: '右', L: '左' };
const get = (o, ...keys) => keys.reduce((x, k) => (x == null ? undefined : x[k]), o);
const filled = (v) => v !== undefined && v !== null && v !== '';

// 手術した側を先に(両側・体幹は右・左)
export function sidesFor(p) {
  const s = p.ortho && p.ortho.side;
  return s === '右' ? ['R', 'L'] : s === '左' ? ['L', 'R'] : ['R', 'L'];
}

export function diagnosisText(p) {
  const o = p.ortho || {};
  if (!o.dx) return '';
  const other = o.dx === 'その他';
  const head = [other ? o.memo || 'その他' : o.dx, o.side && o.side !== '体幹' ? o.side : ''].filter(Boolean).join(' ');
  return `${head}${o.surgery ? `/${o.surgery}` : ''}${!other && o.memo ? `(${o.memo})` : ''}`;
}
export function postOpDays(p, today) {
  const o = p.ortho || {};
  if (!isDate(o.opDate) || o.surgery === '保存療法') return null;
  return diffDays(today, o.opDate);
}
// 今の荷重:最新の評価で入れていればそれ、なければ登録のとき
export function currentWB(p, records = []) {
  const o = p.ortho || {};
  const list = records.filter((r) => r.type === 'ortho' && r.patientId === p.id && r.wb).sort((a, b) => a.date.localeCompare(b.date));
  if (list.length) {
    // 同じ荷重が続いている一番最初の日(登録のときから同じなら登録の開始日)
    const wb = list[list.length - 1].wb;
    let i = list.length - 1;
    while (i > 0 && list[i - 1].wb === wb) i--;
    const from = i === 0 && o.wb === wb && o.wbDate ? o.wbDate : list[i].date;
    return { wb, from };
  }
  return o.wb ? { wb: o.wb, from: o.wbDate || '' } : null;
}

export function normalValues() {
  const v = { pain: {}, inflam: {}, mmt: {} };
  for (const [k] of PAIN_SCENES) v.pain[k] = '0';
  for (const [k] of INFLAM) v.inflam[k] = 'なし';
  for (const [k] of O_MMT) v.mmt[k] = { R: '5', L: '5' };
  return v;
}

// 1回分の評価を短い文の行にする(正常は書かない)
export function evalLines(r) {
  const L = [];
  if (r.wb) L.push(`・荷重:${r.wb}`);
  const painKeys = PAIN_SCENES.filter(([k]) => filled(get(r, 'pain', k)));
  if (painKeys.some(([k]) => String(r.pain[k]) !== '0')) L.push(`・痛み(NRS):${painKeys.map(([k, n]) => `${n}${r.pain[k]}`).join(' ')}`);
  const inf = INFLAM.filter(([k]) => get(r, 'inflam', k) === 'あり').map(([, n]) => n);
  if (inf.length) L.push(`・炎症:${inf.join('・')}あり`);
  const rom = [];
  for (const [k, n, ref] of O_ROM) for (const s of ['R', 'L']) {
    const v = get(r, 'rom', k, s);
    if (filled(v)) rom.push(`${SN[s]}${n}${v}°(参考${ref}°)`);
  }
  if (rom.length) L.push(`・ROM制限:${rom.join('、')}`);
  const mmt = [];
  for (const [k, n] of O_MMT) for (const s of ['R', 'L']) {
    const v = get(r, 'mmt', k, s);
    if (filled(v) && v !== '5') mmt.push(`${SN[s]}${n}${v}`);
  }
  if (mmt.length) L.push(`・MMT(5未満):${mmt.join('、')}`);
  const circ = [];
  for (const [k, n] of O_CIRC) {
    const R = get(r, 'circ', k, 'R');
    const Lv = get(r, 'circ', k, 'L');
    if (filled(R) || filled(Lv)) circ.push(`${n} 右${filled(R) ? R : '—'}/左${filled(Lv) ? Lv : '—'}cm${filled(R) && filled(Lv) ? `(差${Math.round(Math.abs(R - Lv) * 10) / 10})` : ''}`);
  }
  if (circ.length) L.push(`・周径:${circ.join('、')}`);
  const ld = legDiff(r);
  if (ld) L.push(`・棘果長:${ld}`);
  const walk = [r.aid && `補助具 ${r.aid}`, ...O_TESTS.filter(([k]) => filled(get(r, 'tests', k))).map(([k, n, u]) => `${n}${r.tests[k]}${u}`)].filter(Boolean);
  if (walk.length) L.push(`・歩行:${walk.join(' ')}`);
  return L;
}
export function legDiff(r) {
  const R = get(r, 'smd', 'R');
  const Lv = get(r, 'smd', 'L');
  if (!filled(R) && !filled(Lv)) return '';
  const d = filled(R) && filled(Lv) ? Math.round((R - Lv) * 10) / 10 : null;
  return `右${filled(R) ? R : '—'}/左${filled(Lv) ? Lv : '—'}cm${d ? `(${d > 0 ? '左' : '右'}が${Math.abs(d)}cm短い)` : d === 0 ? '(差なし)' : ''}`;
}
export function evalShort(r) {
  const pain = Math.max(...PAIN_SCENES.map(([k]) => Number(get(r, 'pain', k)) || 0));
  return [r.wb, `痛み最大${pain}`, r.aid && r.aid !== 'なし' ? r.aid : '', filled(get(r, 'tests', 'tug')) ? `TUG${r.tests.tug}秒` : ''].filter(Boolean).join(' / ');
}

export function orthoSummary(p, records) {
  if (p.format !== 'ortho') return [];
  const o = p.ortho || {};
  const list = records.filter((r) => r.type === 'ortho').sort((a, b) => a.date.localeCompare(b.date));
  const L = ['', '■整形', `・診断:${diagnosisText(p) || '(未入力)'}`];
  if (isDate(o.opDate) && o.surgery !== '保存療法') L.push(`・手術日:${fmt(o.opDate)}`);
  const wb = currentWB(p, records);
  if (wb) L.push(`・荷重:${wb.wb}${wb.from ? `(${fmt(wb.from)}〜)` : ''}`);
  if ((o.precautions || []).length || o.precMemo) L.push(`・禁止の動き:${[...(o.precautions || []), o.precMemo].filter(Boolean).join('、')}`);
  L.push('', '■身体機能');
  if (!list.length) return [...L, '・(未評価)'];
  const first = list[0];
  const last = list[list.length - 1];
  const block = (r, t) => [`〈${t} ${fmt(r.date)}〉`, ...(evalLines(r).length ? evalLines(r) : ['・目立った問題なし'])];
  L.push(...block(first, '最初'));
  if (last !== first) L.push(...block(last, '最新'));
  if (first.memo || last.memo) L.push(`・メモ:${(last.memo || first.memo).trim()}`);
  return L;
}
