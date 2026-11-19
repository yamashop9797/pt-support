// 第2段階の計算のテスト(node --test stage2.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from './stage2.js';
import { defaultSettings } from './logic.js';

const settings = { ...defaultSettings(), walkLimitMin: 15 };
const P = (o = {}) => ({ id: 'p1', initials: 'A', room: '221', admitDate: '2026-10-01', kaifukuDate: '2026-10-15', dischargeDate: '2026-12-20', diseaseLimit: 90, gender: 'm', ageGroup: '80', adl: {}, env: {}, family: [], system: {}, orthosis: {}, ...o });

test('大きな数字:入院から・回復期に来て・退院まで・算定上限まで', () => {
  const n = T.patientNumbers(P(), '2026-11-19');
  assert.equal(n.sinceAdmit, 49);
  assert.equal(n.sinceKaifuku, 35);
  assert.equal(n.toDischarge, 31);
  // 10/15 を1日目として90日目 = 2027-01-12
  assert.equal(n.limitDate, '2027-01-12');
  assert.equal(n.toLimit, 54);
  const m = T.patientNumbers(P({ kaifukuDate: '', diseaseLimit: '' }), '2026-11-19');
  assert.equal(m.toLimit, undefined);
  assert.equal(m.sinceKaifuku, undefined);
});

test('FIMの合計と利得', () => {
  const all = (v) => Object.fromEntries([...T.FIM_MOTOR, ...T.FIM_COG].map(([k]) => [k, v]));
  assert.deepEqual(T.fimTotal(all(7)), { motor: 91, cog: 35, total: 126, complete: true, filled: 18 });
  assert.equal(T.fimTotal({ eat: 5 }).complete, false);
  const recs = [
    { type: 'fim', date: '2026-10-02', timing: 'admit', scores: all(3) },
    { type: 'fim', date: '2026-11-15', timing: 'mid', scores: all(5) },
  ];
  const s = T.fimSummary(recs);
  assert.equal(s.firstTotal.total, 54);
  assert.equal(s.latestTotal.total, 90);
  assert.equal(s.gain, 36);
  assert.equal(T.fimSummary([]), null);
});

test('行き先の‼️:徒歩15分以上/退院後の手段で行けない', () => {
  const p = P({ env: { afterModes: ['徒歩', 'タクシー'] } });
  assert.deepEqual(T.placeFlags({ mode: '徒歩', minutes: 10 }, p, settings), []);
  assert.equal(T.placeFlags({ mode: '徒歩', minutes: 15 }, p, settings).length, 1);
  assert.match(T.placeFlags({ mode: 'バス', minutes: 10 }, p, settings)[0], /行けない/);
  // 基準は設定で変えられる
  assert.deepEqual(T.placeFlags({ mode: '徒歩', minutes: 15 }, p, { walkLimitMin: 20 }), []);
  // 退院後の手段が未入力なら2つめの判定はしない
  assert.deepEqual(T.placeFlags({ mode: 'バス', minutes: 10 }, P(), settings), []);
});

test('地図のリンク:町名から行き先まで(APIキーなし)', () => {
  const u = T.mapsUrl('◯◯市△△町', { name: 'スーパーX', mode: '徒歩' });
  assert.match(u, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1/);
  const q = new URL(u).searchParams;
  assert.equal(q.get('origin'), '◯◯市△△町');
  assert.equal(q.get('destination'), 'スーパーX ◯◯市△△町');
  assert.equal(q.get('travelmode'), 'walking');
  assert.equal(new URL(T.mapsUrl('', { name: 'B', mode: 'バス' })).searchParams.get('travelmode'), 'transit');
});

test('サマリーの下書きに生活・家族・制度・装具が入る(名前は入らない)', () => {
  const p = P({
    preState: '独歩',
    orthosis: { status: 'yes', type: 'afo' },
    env: { town: '◯◯市△△町', living: '独居', afterModes: ['徒歩'], places: [{ kind: 'super', name: 'スーパーX', mode: '徒歩', minutes: 20 }] },
    family: [{ rel: '長女', kp: true, coop: '協力的', work: 'フルタイム', distance: '30分以内' }],
    system: { kaigo: '要介護1', techo: 'なし' },
  });
  const st = { settings, records: [{ patientId: 'p1', type: 'daily', date: '2026-11-01', tags: ['歩行'], memo: '屋外200m' }], events: [] };
  const d = T.summaryDraft(p, st, '2026-11-19');
  assert.match(d, /Aさん 男性 80代/);
  assert.match(d, /装具:あり\(短下肢装具\)/);
  assert.match(d, /住まい:◯◯市△△町\/独居/);
  assert.match(d, /スーパー「スーパーX」:徒歩20分 ‼️/);
  assert.match(d, /長女\(KP・協力的・フルタイム・本人宅まで30分以内\)/);
  assert.match(d, /介護保険:要介護1\/障害者手帳:なし/);
  assert.match(d, /疾患区分:90日/);
  assert.match(d, /記録1回。主な内容:歩行\(1回\)/);
  const ai = T.aiPrompt('summary', d);
  assert.match(ai, /退院時サマリーとして/);
  assert.match(ai, /個人情報は書かないで/);
  assert.ok(ai.endsWith(d));
});

test('家屋調査報告書の下書き', () => {
  const p = P({ env: { town: '◯◯市', living: '同居' } });
  const d = T.homeReportDraft(p, { date: '2026-11-25', people: ['本人', 'ケアマネ'], areas: { 玄関: { status: '手すり', memo: '段差18cm' } }, proposal: '玄関に縦手すり' }, []);
  assert.match(d, /訪問日:11\/25\(水\) 参加:本人・ケアマネ/);
  assert.match(d, /・玄関:手すり\(段差18cm\)/);
  assert.match(d, /玄関に縦手すり/);
});

test('月の振り返りの集計', () => {
  const all = (v) => Object.fromEntries([...T.FIM_MOTOR, ...T.FIM_COG].map(([k]) => [k, v]));
  const st = {
    patients: [P({ dischargeDate: '2026-11-10', archived: true, summaryDone: '2026-11-08' }), P({ id: 'p2', admitDate: '2026-11-05', dischargeDate: '2027-01-10' })],
    records: [
      { patientId: 'p1', type: 'fim', date: '2026-10-02', timing: 'admit', scores: all(3) },
      { patientId: 'p1', type: 'fim', date: '2026-11-09', timing: 'discharge', scores: all(4) },
      { patientId: 'p2', type: 'daily', date: '2026-11-06' },
    ],
    events: [{ patientId: 'p2', type: 'firstConf', date: '2026-11-12' }],
    plans: { '2026-11': { explained: ['p2'] } },
  };
  const r = T.monthReview(st, '2026-11');
  assert.equal(r.active, 2);
  assert.equal(r.discharged, 1);
  assert.equal(r.newPatients, 1);
  assert.equal(r.daily, 1);
  assert.equal(r.summaries, 1);
  assert.equal(r.plans, 1);
  assert.equal(r.events, 1);
  assert.equal(r.avgGain, 18);
});

test('予定と進み具合の一覧', () => {
  const st = { events: [{ id: 'a', patientId: 'p1', type: 'firstConf', date: '2026-11-10' }, { id: 'b', patientId: 'p1', type: 'homeVisit', date: '2026-11-25' }] };
  const rows = T.scheduleRows(P(), st, '2026-11-19');
  assert.deepEqual(rows.map((r) => `${r.type}:${r.status}`), ['firstConf:done', 'dischargeConf:none', 'homeVisit:plan']);
});
