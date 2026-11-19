// 整形・脊損フォーマットのテスト(node --test formats.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as OR from './ortho.js';
import * as SC from './sci.js';
import { summaryDraft } from './stage2.js';
import { defaultSettings } from './logic.js';

// ---------- 整形 ----------
const OP = (o = {}) => ({ id: 'o1', initials: 'B', format: 'ortho', admitDate: '2026-11-01',
  ortho: { dx: '大腿骨頸部骨折', surgery: '人工骨頭', side: '右', opDate: '2026-10-29', wb: '1/2荷重', wbDate: '2026-11-01', precautions: ['股 内転', '股 内旋'], precMemo: '', memo: '' }, ...o });

test('整形:診断の文・術後日数・今の荷重', () => {
  assert.equal(OR.diagnosisText(OP()), '大腿骨頸部骨折 右/人工骨頭');
  assert.equal(OR.diagnosisText(OP({ ortho: { dx: 'その他', memo: '足関節果部骨折', side: '左' } })), '足関節果部骨折 左');
  assert.equal(OR.postOpDays(OP(), '2026-11-19'), 21);
  assert.equal(OR.postOpDays(OP({ ortho: { surgery: '保存療法', opDate: '2026-10-29' } }), '2026-11-19'), null);
  assert.deepEqual(OR.currentWB(OP(), []), { wb: '1/2荷重', from: '2026-11-01' });
  const recs = [{ patientId: 'o1', type: 'ortho', date: '2026-11-10', wb: '全荷重' }];
  assert.deepEqual(OR.currentWB(OP(), recs), { wb: '全荷重', from: '2026-11-10' });
  // 登録のときと同じ荷重が続いていれば、登録の開始日のまま
  const same = [{ patientId: 'o1', type: 'ortho', date: '2026-11-05', wb: '1/2荷重' }, { patientId: 'o1', type: 'ortho', date: '2026-11-12', wb: '1/2荷重' }];
  assert.deepEqual(OR.currentWB(OP(), same), { wb: '1/2荷重', from: '2026-11-01' });
  const changed = [...same, { patientId: 'o1', type: 'ortho', date: '2026-11-14', wb: '全荷重' }, { patientId: 'o1', type: 'ortho', date: '2026-11-18', wb: '全荷重' }];
  assert.deepEqual(OR.currentWB(OP(), changed), { wb: '全荷重', from: '2026-11-14' });
  assert.deepEqual(OR.sidesFor(OP()), ['R', 'L']);
  assert.deepEqual(OR.sidesFor(OP({ ortho: { side: '左' } })), ['L', 'R']);
});

test('整形:評価を文にする(正常は書かない)', () => {
  const r = {
    type: 'ortho', date: '2026-11-02', wb: '1/2荷重', pain: { rest: '0', move: '4', wb: '6' }, inflam: { heat: 'あり', swell: 'あり', red: 'なし' },
    rom: { hipFlex: { R: 80 } }, mmt: { hipAbd: { R: '3', L: '5' } }, circ: { pat0: { R: 40.5, L: 38 } }, smd: { R: 80, L: 81 },
    aid: '歩行器', tests: { tug: 18.2 },
  };
  const t = OR.evalLines(r).join('\n');
  assert.match(t, /荷重:1\/2荷重/);
  assert.match(t, /痛み\(NRS\):安静時0 動作時4 荷重時6/);
  assert.match(t, /炎症:熱感・腫脹あり/);
  assert.match(t, /ROM制限:右股 屈曲80°\(参考125°\)/);
  assert.match(t, /MMT\(5未満\):右股 外転3/);
  assert.doesNotMatch(t, /左股 外転/);
  assert.match(t, /膝蓋骨上縁 0cm 右40.5\/左38cm\(差2.5\)/);
  assert.match(t, /棘果長:右80\/左81cm\(右が1cm短い\)/);
  assert.match(t, /歩行:補助具 歩行器 TUG18.2秒/);
  assert.equal(OR.evalLines({ pain: { rest: '0', move: '0' }, inflam: { heat: 'なし' } }).length, 0);
  assert.equal(OR.evalShort(r), '1/2荷重 / 痛み最大6 / 歩行器 / TUG18.2秒');
});

test('整形:サマリーに診断・荷重・禁止の動きが入る', () => {
  const recs = [{ patientId: 'o1', type: 'ortho', date: '2026-11-02', pain: { move: '5' } }, { patientId: 'o1', type: 'ortho', date: '2026-11-16', pain: { move: '2' }, wb: '全荷重' }];
  const d = summaryDraft(OP(), { settings: defaultSettings(), records: recs, events: [] }, '2026-11-19');
  assert.match(d, /■整形\n・診断:大腿骨頸部骨折 右\/人工骨頭\n・手術日:10\/29\(木\)\n・荷重:全荷重\(11\/16\(月\)〜\)\n・禁止の動き:股 内転、股 内旋/);
  assert.match(d, /〈最初 11\/2\(月\)〉\n・痛み\(NRS\):動作時5/);
  assert.match(d, /〈最新 11\/16\(月\)〉\n・荷重:全荷重\n・痛み\(NRS\):動作時2/);
  assert.doesNotMatch(d, /■脳卒中|■脊髄損傷/);
});

// ---------- 脊損(ISNCSCI) ----------
// 上から「この高さまで正常、その下は val」で感覚を作る
function sens(r, normalTo, val, side = ['R', 'L']) {
  r.lt = r.lt || {}; r.pp = r.pp || {};
  const cut = SC.DERMS.indexOf(normalTo);
  SC.DERMS.forEach((d, i) => {
    for (const s of side) {
      (r.lt[d] = r.lt[d] || {})[s] = i <= cut ? '2' : val;
      (r.pp[d] = r.pp[d] || {})[s] = i <= cut ? '2' : val;
    }
  });
  return r;
}
function motor(r, map) {
  r.motor = {};
  for (const [lv] of SC.KEY_MUSCLES) r.motor[lv] = { R: String(map[lv] ?? map.rest), L: String(map[lv] ?? map.rest) };
  return r;
}

test('脊損:全部正常なら E', () => {
  const r = SC.normalValues();
  const c = SC.classify(r);
  assert.equal(c.nli, 'INT');
  assert.equal(c.ais, 'E');
  assert.equal(c.complete, false);
  const t = SC.totals(r);
  assert.deepEqual([t.uems.R + t.uems.L, t.lems.R + t.lems.L, t.lt.R + t.lt.L, t.pp.R + t.pp.L], [50, 50, 112, 112]);
});

test('脊損:C5完全損傷は A', () => {
  const r = motor(sens({}, 'C5', '0'), { C5: 4, rest: 0 });
  r.vac = 'なし'; r.dap = 'なし';
  const c = SC.classify(r);
  assert.deepEqual(c.sensory, { R: 'C5', L: 'C5' });
  assert.deepEqual(c.motor, { R: 'C5', L: 'C5' });
  assert.equal(c.nli, 'C5');
  assert.equal(c.complete, true);
  assert.equal(c.ais, 'A');
  assert.equal(SC.adWarning(c.nli), true);
});

test('脊損:C5が3未満なら運動レベルはC4', () => {
  const r = motor(sens({}, 'C4', '1'), { C5: 2, rest: 0 });
  r.vac = 'なし'; r.dap = 'あり';
  const c = SC.classify(r);
  assert.equal(c.motor.R, 'C4');
  assert.equal(c.nli, 'C4');
  assert.equal(c.complete, false);
  assert.equal(c.ais, 'B'); // 肛門の感覚だけ残り、運動は残っていない
});

test('脊損:T10 不完全。下肢が少し動けば C、全く動かなければ B', () => {
  const base = () => sens({}, 'T10', '1');
  const r = motor(base(), { C5: 5, C6: 5, C7: 5, C8: 5, T1: 5, rest: 1 });
  r.vac = 'なし'; r.dap = 'なし';
  let c = SC.classify(r);
  assert.equal(c.sensory.R, 'T10');
  assert.equal(c.motor.R, 'T10');
  assert.equal(c.nli, 'T10');
  assert.equal(c.ais, 'C');
  assert.equal(SC.adWarning(c.nli), false);
  const r2 = motor(base(), { C5: 5, C6: 5, C7: 5, C8: 5, T1: 5, rest: 0 });
  r2.vac = 'なし'; r2.dap = 'なし';
  assert.equal(SC.classify(r2).ais, 'B');
  // 下肢の半分以上が3以上なら D
  const r3 = motor(base(), { C5: 5, C6: 5, C7: 5, C8: 5, T1: 5, rest: 3 });
  r3.vac = 'あり'; r3.dap = 'あり';
  assert.equal(SC.classify(r3).ais, 'D');
});

test('脊損:未入力があれば判定しない・文とサマリー', () => {
  assert.equal(SC.classify({}).nli, null);
  assert.equal(SC.classify({}).ais, null);
  const r = motor(sens({}, 'C5', '0'), { C5: 4, rest: 0 });
  Object.assign(r, { type: 'sci', patientId: 's1', date: '2026-11-03', vac: 'なし', dap: 'なし', bladder: '間欠導尿', skin: '発赤あり' });
  const p = { id: 's1', initials: 'C', format: 'sci', sci: { level: 'C5', ais: 'A', cause: '外傷性', injuryDate: '2026-10-10', surgery: '', memo: '' } };
  assert.equal(SC.diagnosisText(p), '脊髄損傷(外傷性) C5レベル AIS A');
  assert.equal(SC.onsetDays(p, '2026-11-19'), 40);
  const lines = SC.evalLines(r).join('\n');
  assert.match(lines, /神経学的レベル:C5 {2}AIS:A\(完全\)/);
  assert.match(lines, /運動点数 上肢8\/50 下肢0\/50/);
  assert.match(lines, /排尿:間欠導尿、皮膚:発赤あり/);
  const d = summaryDraft(p, { settings: defaultSettings(), records: [r], events: [] }, '2026-11-19');
  assert.match(d, /■脊髄損傷\n・診断:脊髄損傷\(外傷性\) C5レベル AIS A\n・受傷日:10\/10\(土\)\n・T6より上の損傷:自律神経過反射に注意/);
  assert.match(d, /■神経学的評価\(ISNCSCI\)\n〈最初 11\/3\(火\)〉/);
});
