// 脳卒中フォーマットのテスト(node --test stroke.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as SK from './stroke.js';
import { summaryDraft } from './stage2.js';
import { defaultSettings } from './logic.js';

const P = (o = {}) => ({ id: 'p1', initials: 'A', format: 'stroke', admitDate: '2026-10-01', dischargeDate: '2026-12-20',
  stroke: { dx: '脳梗塞', subtype: '心原性', onsetDate: '2026-09-20', side: '右', lesions: ['放線冠'], vessels: ['中大脳動脈'], memo: '' }, ...o });

test('損傷側から麻痺側を決める', () => {
  assert.deepEqual(SK.pareticSides(P()), ['L']);
  assert.deepEqual(SK.nonPareticSides(P()), ['R']);
  assert.deepEqual(SK.pareticSides(P({ stroke: { side: '左' } })), ['R']);
  assert.deepEqual(SK.pareticSides(P({ stroke: {} })), ['R', 'L']);
});

test('損傷側で高次脳の並びが変わる', () => {
  assert.equal(SK.hbfOrder(P())[0][0], 'neglect');
  assert.equal(SK.hbfOrder(P({ stroke: { side: '左' } }))[0][0], 'aphComp');
  assert.equal(SK.hbfOrder(P({ stroke: {} })).length, SK.HBF.length);
});

test('診断名の文と発症からの日数', () => {
  assert.equal(SK.diagnosisText(P()), '脳梗塞(心原性) 右 放線冠・中大脳動脈領域');
  assert.equal(SK.diagnosisText(P({ stroke: { dx: 'くも膜下出血', memo: '前交通動脈瘤' } })), 'くも膜下出血(前交通動脈瘤)');
  assert.equal(SK.onsetDays(P(), '2026-11-19'), 60);
});

test('全部正常の値:麻痺側の感覚・非麻痺側のMMT', () => {
  const n = SK.normalValues(P());
  assert.equal(n.mmt.shFlex.R, '5');
  assert.equal(n.mmt.shFlex.L, undefined);
  assert.equal(n.sens.sup.ue.L, '正常');
  assert.equal(n.hbf.neglect, 'なし');
  assert.equal(n.mas.elbowF, '0');
});

test('評価を文にする(正常は書かない)', () => {
  const r = {
    type: 'stroke', date: '2026-10-02', timing: 'admit',
    brs: { ue: '3', hand: '2', le: '4' }, mas: { elbowF: '1+', kneeE: '0' },
    rom: { shFlex: { L: 120 } }, mmt: { hipAbd: { R: '4' }, shFlex: { R: '5' }, trFlex: '3' },
    sens: { sup: { ue: { L: '軽度鈍麻' }, le: { L: '正常' } }, deep: { le: { L: '重度鈍麻' } } },
    ataxia: { fn: { R: 'なし' }, sit: '軽度' },
    anthro: { height: 160, weight: 51.2, circ: { calf: { L: 30.5 } } },
    hbf: { neglect: '中等度', attention: '軽度', memory: 'なし' }, scores: { mmse: 24 },
  };
  const lines = SK.evalLines(r, P()).join('\n');
  assert.match(lines, /ブルンストローム\(左\):上肢Ⅲ 手指Ⅱ 下肢Ⅳ/);
  assert.match(lines, /MAS:肘屈筋1\+/);
  assert.doesNotMatch(lines, /膝伸筋/);
  assert.match(lines, /ROM制限:左肩 屈曲120°\(参考180°\)/);
  assert.match(lines, /MMT\(5未満\):右股 外転4、体幹 屈曲3/);
  assert.match(lines, /表在感覚:左上肢軽度鈍麻/);
  assert.match(lines, /深部感覚:左下肢重度鈍麻/);
  assert.match(lines, /失調:体幹\(座位\)軽度/);
  assert.match(lines, /身長160cm 体重51.2kg BMI20 左下腿\(最大\)30.5cm/);
  assert.deepEqual(SK.hbfLines(r), ['・半側空間無視中等度、注意障害軽度', '・検査:MMSE24/30']);
  assert.equal(SK.evalShort(r), 'BRS 上肢Ⅲ 手指Ⅱ 下肢Ⅳ / 高次脳 2項目 / MMSE24');
});

test('サマリーの下書きに診断と最初・最新の評価が入る', () => {
  const recs = [
    { patientId: 'p1', type: 'stroke', date: '2026-10-02', timing: 'admit', brs: { ue: '3' }, hbf: { neglect: '重度' } },
    { patientId: 'p1', type: 'stroke', date: '2026-11-15', timing: 'mid', brs: { ue: '4' }, hbf: { neglect: '軽度' } },
  ];
  const d = summaryDraft(P(), { settings: defaultSettings(), records: recs, events: [] }, '2026-11-19');
  assert.match(d, /■脳卒中\n・診断:脳梗塞\(心原性\) 右 放線冠・中大脳動脈領域\n・発症日:9\/20/);
  assert.match(d, /〈最初 10\/2\(金\)〉\n・ブルンストローム\(左\):上肢Ⅲ\n・高次脳:半側空間無視重度/);
  assert.match(d, /〈最新 11\/15\(日\)〉\n・ブルンストローム\(左\):上肢Ⅳ\n・高次脳:半側空間無視軽度/);
  // 脳卒中の型でない人には出さない
  assert.doesNotMatch(summaryDraft(P({ format: '' }), { settings: defaultSettings(), records: recs, events: [] }, '2026-11-19'), /■脳卒中/);
});
