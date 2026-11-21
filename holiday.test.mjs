// 休み前にやっておくことのテスト(node --test holiday.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from './logic.js';

const st = (over = {}) => ({ settings: L.defaultSettings(), patients: [], events: [], holidays: new Set(), flags: new Set(), plans: {}, ...over });
const P = (o) => ({ id: 'p1', initials: 'A', room: '222', admitDate: '2026-10-01', dischargeDate: '', mine: true, archived: false, homeVisitNeeded: true, adl: {}, ...o });
// 11/28(土)〜12/1(火)が休み
const H = new Set(['2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01']);

test('休みのかたまりと出勤日', () => {
  const h = new Set([...H, '2026-12-05']);
  assert.deepEqual(L.holidayBlocks(h, '2026-11-21', 20), [{ start: '2026-11-28', end: '2026-12-01' }, { start: '2026-12-05', end: '2026-12-05' }]);
  assert.equal(L.workdayBefore('2026-11-28', 3, H), '2026-11-25');
  assert.equal(L.nextWorkday('2026-11-28', H), '2026-12-02');
});

test('休みの3出勤日前から最後の出勤日まで出る', () => {
  const s = st({ holidays: H, patients: [P({})] });
  assert.equal(L.preHolidayPlans(s, '2026-11-24').length, 0);
  const pl = L.preHolidayPlans(s, '2026-11-25')[0];
  assert.equal(pl.last, '2026-11-27');
  assert.equal(pl.back, '2026-12-02');
  assert.equal(pl.workdaysLeft, 3);
  assert.equal(L.preHolidayPlans(s, '2026-11-27')[0].workdaysLeft, 1);
  assert.equal(L.preHolidayPlans(s, '2026-11-28').length, 0); // 休みに入ったら出さない
  assert.equal(L.preHolidayPlans(s, '2026-11-20', { any: true }).length, 1); // 休みを入れた直後の確認用
});

test('休み中の期日を洗い出す', () => {
  const s = st({
    holidays: H,
    patients: [
      P({ id: 'p1', initials: 'A', room: '222', dischargeDate: '2026-11-30', kaifukuDate: '2026-10-01', diseaseLimit: 60 }),
      P({ id: 'p2', initials: 'B', room: '221', dischargeDate: '2027-01-01' }),
    ],
    events: [{ id: 'e1', patientId: 'p2', type: 'dischargeConf', date: '2026-11-29', time: '14:00' }],
  });
  const pl = L.preHolidayPlans(s, '2026-11-26')[0];
  const t = pl.items.map((i) => `${i.date} ${i.text}${i.soon ? '(明け)' : ''}`);
  assert.ok(t.includes('2026-11-30 Aさん 退院'));
  assert.ok(t.includes('2026-11-29 Aさん 算定上限の日'));
  assert.ok(t.includes('2026-12-01 Aさん 病棟ADLカンファ') === false); // 退院後のADLカンファは出ない
  assert.ok(t.includes('2026-11-30 Bさん 病棟ADLカンファ'));
  assert.ok(t.includes('2026-11-29 Bさん 退院前カンファ 14:00'));
  assert.ok(t.includes('2026-12-02 Bさん 家屋調査の日程を決める目安(明け)'));
  assert.ok(t.includes('2026-12-01 12月の計画書の対象者チェック'));
  assert.match(pl.items.find((i) => i.kind === 'adl').draft, /病棟ADLカンファ Bさん/);
  // チェックしたものは消える
  const key = pl.items.find((i) => i.kind === 'discharge').key;
  s.flags.add(key);
  assert.equal(L.preHolidayPlans(s, '2026-11-26')[0].items.some((i) => i.kind === 'discharge'), false);
});

test('申し送りの文(名前なし・注意つき)', () => {
  const s = st({ holidays: H, patients: [P({ dischargeDate: '2026-11-30' }), P({ id: 'p3', initials: 'C', room: '' })] });
  const pl = L.preHolidayPlans(s, '2026-11-25')[0];
  const txt = L.handoverText(s, pl, (p) => (p.id === 'p3' ? ['股 内転は禁止'] : []));
  assert.match(txt, /^【休み中の申し送り】11\/28\(土\)〜12\/1\(火\) お休み\(12\/2\(水\)から出勤\)/);
  assert.match(txt, /■Aさん\(222\)\n・11\/30\(月\) 退院/);
  assert.match(txt, /■Cさん\n・注意:股 内転は禁止/);
  assert.match(txt, /■全体\n・12\/1\(火\) 12月の計画書の対象者チェック/);
});
