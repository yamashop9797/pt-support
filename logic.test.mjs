// 計算の部品のテスト(node --test tests で実行)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';
import { weekStart } from '../js/dates.js';

function mkState(over = {}) {
  return {
    settings: L.defaultSettings(),
    patients: [],
    events: [],
    holidays: new Set(),
    flags: new Set(),
    plans: {},
    ...over,
  };
}
const P = (o) => ({ id: 'p1', initials: 'A', room: '221', admitDate: '2026-10-01', dischargeDate: '', mine: true, archived: false, homeVisitNeeded: true, adl: {}, ...o });
// 計画書のお知らせ(月の初めから選ぶまで毎日出る)は別のテストで見るので、ここでは除く
const kinds = (st, t) => L.computeNotices(st, t).map((n) => n.kind).filter((k) => k !== 'planSelect');

test('休みなら前の出勤日にずらす', () => {
  const h = new Set(['2026-11-20', '2026-11-19']);
  assert.equal(L.prevWorkday('2026-11-20', h), '2026-11-18');
  assert.equal(L.noticeDayFor('2026-11-21', h), '2026-11-18');
  assert.equal(L.noticeDayFor('2026-11-25', new Set()), '2026-11-24');
});

test('部屋番号から病棟ADLカンファの曜日', () => {
  const t = L.defaultSettings().adlTable;
  assert.deepEqual(L.adlWeekdays('221', t), [1]);
  assert.deepEqual(L.adlWeekdays('226号室', t), [5]);
  assert.deepEqual(L.adlWeekdays('323-2', t), [3]);
  assert.deepEqual(L.adlWeekdays('999', t), []);
});

test('病棟ADLカンファは前日の朝(前日が休みならその前の出勤日)', () => {
  const st = mkState({ patients: [P({ room: '222' })] }); // 火曜
  // 2026-11-23(月)に 11-24(火)のお知らせ
  let n = L.computeNotices(st, '2026-11-23').find((x) => x.kind === 'adl');
  assert.ok(n);
  assert.equal(n.title, '明日は病棟ADLカンファです');
  assert.match(n.draft, /・起居:\(未入力\)/);
  assert.match(n.draft, /相談が必要な内容/);
  assert.equal(L.computeNotices(st, '2026-11-22').find((x) => x.kind === 'adl'), undefined);
  // 月曜が休み → 日曜にお知らせ
  st.holidays = new Set(['2026-11-23']);
  n = L.computeNotices(st, '2026-11-22').find((x) => x.kind === 'adl');
  assert.equal(n.title, 'あさっては病棟ADLカンファです');
  // 済みにしたら消える
  st.flags.add(n.key);
  assert.equal(L.computeNotices(st, '2026-11-22').find((x) => x.kind === 'adl'), undefined);
});

test('サマリーは退院7日前から、完了で消える', () => {
  const st = mkState({ patients: [P({ dischargeDate: '2026-11-26' })] });
  assert.ok(!kinds(st, '2026-11-18').includes('summary'));
  const n = L.computeNotices(st, '2026-11-19')[0];
  assert.equal(n.kind, 'summary');
  assert.equal(n.big, true);
  assert.equal(n.title, 'Aさん サマリー作成');
  assert.equal(n.strength, 1);
  assert.equal(L.computeNotices(st, '2026-11-25')[0].strength, 3);
  // 開始日が休みなら前の出勤日から
  st.holidays = new Set(['2026-11-19']);
  assert.ok(kinds(st, '2026-11-18').includes('summary'));
  st.patients[0].summaryDone = '2026-11-20';
  assert.ok(!kinds(st, '2026-11-21').includes('summary'));
});

test('退院予定日を変えると期日が計算し直される', () => {
  const st = mkState({ patients: [P({ dischargeDate: '2026-11-26' })] });
  assert.ok(kinds(st, '2026-11-20').includes('summary'));
  st.patients[0].dischargeDate = '2026-12-20';
  assert.ok(!kinds(st, '2026-11-20').includes('summary'));
  assert.ok(kinds(st, '2026-12-13').includes('summary'));
});

test('家屋調査:45日前→調整、30日前→まだです、訪問日で止まり翌日から報告書', () => {
  const st = mkState({ patients: [P({ room: '', dischargeDate: '2027-01-03' })] });
  assert.deepEqual(kinds(st, '2026-11-18'), []);
  let n = L.computeNotices(st, '2026-11-19').find((x) => x.kind === 'visitAdjust');
  assert.match(n.title, /日程を調整しましょう/);
  n = L.computeNotices(st, '2026-12-04').find((x) => x.kind === 'visitAdjust');
  assert.match(n.title, /家屋調査がまだです/);
  st.events.push({ id: 'e1', patientId: 'p1', type: 'homeVisit', date: '2026-12-10', checklist: [{ text: 'メジャー', done: false }] });
  assert.ok(!kinds(st, '2026-12-05').includes('visitAdjust'));
  assert.ok(!kinds(st, '2026-12-10').includes('visitReport'));
  // 前日は持ち物チェックつきのお知らせ
  const ev = L.computeNotices(st, '2026-12-09').find((x) => x.kind === 'event');
  assert.equal(ev.title, '明日は家屋訪問です');
  assert.equal(ev.checklist[0].text, 'メジャー');
  assert.ok(kinds(st, '2026-12-11').includes('visitReport'));
  st.patients[0].homeReportDone = '2026-12-12';
  assert.ok(!kinds(st, '2026-12-13').includes('visitReport'));
  // 家屋調査なしの人には出さない
  const st2 = mkState({ patients: [P({ room: '', dischargeDate: '2027-01-03', homeVisitNeeded: false })] });
  assert.ok(!kinds(st2, '2026-12-04').includes('visitAdjust'));
});

test('計画書:毎月1日にチェック、選んだ人は説明済みで完了', () => {
  const st = mkState({ patients: [P({ room: '' }), P({ id: 'p2', initials: 'B', room: '' })] });
  const sel = (t) => L.computeNotices(st, t).filter((x) => x.kind === 'planSelect').map((x) => x.month);
  assert.deepEqual(sel('2026-11-30'), ['2026-11']); // 11月分はまだ選んでいないので出たまま
  st.plans['2026-11'] = { month: '2026-11', selected: true, targets: [], explained: [] };
  assert.deepEqual(sel('2026-11-30'), []);
  const n = L.computeNotices(st, '2026-12-01').find((x) => x.kind === 'planSelect');
  assert.equal(n.title, '12月の計画書の対象者をチェックしましょう');
  // 1日が休みなら前の出勤日(前の月末)から
  st.holidays = new Set(['2026-12-01']);
  assert.deepEqual(sel('2026-11-30'), ['2026-12']);
  // 患者がいなければ出さない
  assert.deepEqual(L.computeNotices(mkState(), '2026-12-02'), []);
  st.plans['2026-12'] = { month: '2026-12', selected: true, targets: ['p2'], explained: [] };
  const list = L.computeNotices(st, '2026-12-02').filter((x) => x.kind === 'planExplain');
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Bさん 計画書の説明(12月)');
  assert.equal(L.planState(st.patients[1], st.plans, '2026-12-02'), 'todo');
  st.plans['2026-12'].explained.push('p2');
  assert.ok(!kinds(st, '2026-12-02').includes('planExplain'));
  assert.equal(L.planState(st.patients[1], st.plans, '2026-12-02'), 'done');
});

test('予定の前日のお知らせ(初回カンファ・退院前カンファの下書き)', () => {
  const st = mkState({
    patients: [P({ room: '', adl: { kiko: '自立', updatedAt: '2026-11-18' }, dischargeDate: '2027-02-01' })],
    events: [
      { id: 'a', patientId: 'p1', type: 'firstConf', date: '2026-11-20', time: '14:00' },
      { id: 'b', patientId: 'p1', type: 'dischargeConf', date: '2026-11-21' },
    ],
  });
  const ns = L.computeNotices(st, '2026-11-19').filter((x) => x.kind === 'event');
  assert.equal(ns.length, 1);
  assert.equal(ns[0].title, '明日は初回カンファレンスです');
  assert.equal(ns[0].body, 'Aさん 14:00から');
  const dc = L.computeNotices(st, '2026-11-20').find((x) => x.type === 'dischargeConf');
  assert.match(dc.draft, /退院前カンファで伝えること Aさん/);
  assert.match(dc.draft, /・起居:自立/);
  assert.match(dc.draft, /・退院日:2\/1\(月\)\(あと73日\)/);
  assert.equal(dc.draft.split('\n').filter((l) => l.startsWith('・')).length, 8);
  // 過ぎた予定は出ない
  assert.equal(L.computeNotices(st, '2026-11-22').filter((x) => x.kind === 'event').length, 0);
});

test('新規担当のチェックリストと「残っていること」', () => {
  const st = mkState({ patients: [P({ dischargeDate: '2027-01-03' })] });
  const p = st.patients[0];
  assert.deepEqual(L.newPatientChecklist(p, st.events).map((c) => c.done), [false, false, false, false]);
  let rem = L.remainingFor(p, st, '2026-11-19').map((r) => r.key);
  assert.deepEqual(rem, ['firstConf', 'preState', 'inbodyAdmit', 'fimAdmit', 'visitDate', 'summary']);
  p.preState = '独歩';
  p.inbodyAdmit = '2026-11-19';
  p.fimAdmit = '2026-11-19';
  st.events.push({ id: 'x', patientId: 'p1', type: 'firstConf', date: '2026-11-25' });
  p.summaryDone = '2026-11-19';
  rem = L.remainingFor(p, st, '2026-11-19').map((r) => r.key);
  assert.deepEqual(rem, ['visitDate']);
  assert.ok(L.newPatientChecklist(p, st.events).every((c) => c.done));
});

test('担当外・退院済みの人にはお知らせを出さない', () => {
  const st = mkState({ patients: [P({ dischargeDate: '2026-11-26', mine: false }), P({ id: 'p2', dischargeDate: '2026-11-26', archived: true })] });
  assert.deepEqual(kinds(st, '2026-11-20'), []);
});

test('色:今日まで=赤、今週中=黄、余裕=緑', () => {
  assert.equal(L.levelFor('2026-11-19', '2026-11-19'), 'red');
  assert.equal(L.levelFor('2026-11-25', '2026-11-19'), 'yellow');
  assert.equal(L.levelFor('2026-11-26', '2026-11-19'), 'green');
});

test('今週の予定(日ごと)', () => {
  const st = mkState({
    patients: [P({ room: '223', dischargeDate: '2026-11-26' })],
    events: [{ id: 'a', patientId: 'p1', type: 'homeVisit', date: '2026-11-20', time: '10:00' }],
  });
  const from = weekStart('2026-11-19');
  assert.equal(from, '2026-11-16');
  const ag = L.agenda(st, from, '2026-11-22');
  assert.ok(ag['2026-11-18'].some((x) => x.text === 'Aさん 病棟ADLカンファ'));
  assert.ok(ag['2026-11-19'].some((x) => x.kind === 'summary'));
  assert.ok(ag['2026-11-20'].some((x) => x.text === 'Aさん 家屋訪問' && x.time === '10:00'));
});

test('カレンダー用ファイル(.ics):イニシャルだけ・通知つき', () => {
  const st = mkState({
    patients: [P({ room: '', dischargeDate: '2026-12-20' })],
    events: [{ id: 'a', patientId: 'p1', type: 'firstConf', date: '2026-11-20', time: '09:00' }],
  });
  const items = L.calendarItemsForPatient(st.patients[0], st, '2026-11-19');
  const titles = items.map((i) => i.title);
  assert.ok(titles.includes('Aさん サマリー作成'));
  assert.ok(titles.includes('Aさん 初回カンファ'));
  assert.ok(titles.includes('Aさん 退院日'));
  const ics = L.buildIcs(items, new Date('2026-11-19T00:00:00Z'));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /SUMMARY:Aさん 初回カンファ\r\n/);
  assert.match(ics, /DTSTART:20261120T090000/);
  assert.match(ics, /TRIGGER:-PT1530M/); // 前日7:30に通知
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, items.length);
  const plans = L.calendarItemsPlans(st, '2026-11-19');
  assert.equal(plans[0].date, '2026-12-01');
});
