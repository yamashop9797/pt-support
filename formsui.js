// 評価の型ごとの画面(整形・脊損)と、型による振り分け
import { fmt, isDate } from './dates.js';
import * as L from './logic.js';
import * as SK from './stroke.js';
import * as OR from './ortho.js';
import * as SC from './sci.js';
import { FIM_TIMINGS } from './stage2.js';
import { praise } from './messages.js';
import { S, actions, changes, today, $, esc, uid, recordsOf, recordById, saveRecord, deleteRecord, getPath, setPath, toast, radioChips, radioChipsN } from './core.js';
import { strokeCard, viewStrokeEval } from './strokeui.js';

const TYPE_NAME = { ortho: '身体機能(整形)', sci: '神経学的評価(脊損)' };
const NUM_PREFIX = { ortho: ['rom.', 'circ.', 'smd.', 'tests.'], sci: [] };

// ---------- 振り分け ----------
export function formatCard(p) {
  if (p.format === 'stroke') return strokeCard(p);
  if (p.format === 'ortho' || p.format === 'sci') return evalCard(p, p.format);
  return '';
}
export function viewEval(p, recId, query) {
  if (p.format === 'ortho') return viewOrthoEval(p, recId, query);
  if (p.format === 'sci') return viewSciEval(p, recId, query);
  return viewStrokeEval(p, recId, query);
}
// 患者ページの上に出す1〜2行(診断と日数、注意)
export function formatHeader(p, t) {
  const recs = (S.records || []).filter((r) => r.patientId === p.id);
  if (p.format === 'stroke') {
    const d = SK.onsetDays(p, t);
    return `<div class="small dxline">${esc(SK.diagnosisText(p) || '脳卒中(診断名は「編集」で)')}${d != null ? ` ・発症から${d}日` : ''}</div>`;
  }
  if (p.format === 'ortho') {
    const d = OR.postOpDays(p, t);
    const wb = OR.currentWB(p, recs);
    const prec = [...((p.ortho && p.ortho.precautions) || []), p.ortho && p.ortho.precMemo].filter(Boolean);
    return `<div class="small dxline">${esc(OR.diagnosisText(p) || '整形(診断名は「編集」で)')}${d != null ? ` ・術後${d}日` : ''}${wb ? ` ・${esc(wb.wb)}` : ''}</div>
      ${prec.length ? `<div class="small dxwarn">⚠ 禁止:${esc(prec.join('、'))}</div>` : ''}`;
  }
  if (p.format === 'sci') {
    const d = SC.onsetDays(p, t);
    const lv = SC.currentLevel(p, recs);
    return `<div class="small dxline">${esc(SC.diagnosisText(p) || '脊髄損傷(高さは「編集」で)')}${d != null ? ` ・受傷から${d}日` : ''}</div>
      ${SC.adWarning(lv) ? `<div class="small dxwarn">⚠ ${esc(lv)}:T6より上の損傷。自律神経過反射に注意</div>` : ''}`;
  }
  return '';
}

function evalCard(p, type) {
  const list = recordsOf(p.id, type);
  const M = type === 'ortho' ? OR : SC;
  return `<div class="card"><div class="topbar"><h3 style="margin:0">${TYPE_NAME[type]}</h3><a class="btn primary" href="#/patient/${p.id}/eval/new">+ 評価する</a></div>
    <div class="small">${esc(M.diagnosisText(p) || '診断は「編集」で入れられます')}</div>
    ${list.length ? list.map((r) => `<div class="list-row"><a href="#/patient/${p.id}/eval/${r.id}"><b>${fmt(r.date)}</b> ${esc(FIM_TIMINGS[r.timing] || '')}<div class="small">${esc(M.evalShort(r))}</div></a><span class="chev">›</span></div>`).join('')
      : '<div class="sub">まだありません。「全部 正常にする」を押してから、気になる所だけ直すと早いです。</div>'}</div>`;
}

// 入力画面に共通の部品
function frame(p, type, recId, query) {
  const list = recordsOf(p.id, type);
  const rec = recId && recId !== 'new' ? recordById(recId) : null;
  const latest = list[0];
  let v = rec || {};
  if (!rec && query === 'copy' && latest) {
    const { id, date, timing, updatedAt, ...rest } = latest;
    v = JSON.parse(JSON.stringify(rest));
  }
  const val = (path) => getPath(v, path);
  const timing = rec ? rec.timing : list.length ? 'mid' : 'admit';
  const top = `<div class="topbar"><a class="back" href="#/patient/${p.id}/rec">‹ 記録</a>${rec ? `<button class="btn danger sm" data-act="evalDel" data-id="${rec.id}" data-pid="${p.id}">消す</button>` : ''}</div>
  <h2 style="margin-top:4px">${esc(L.label(p))} ${TYPE_NAME[type]}</h2>`;
  const head = `<div class="card">
    <label class="f" for="evDate">日にち</label><input type="date" id="evDate" name="date" value="${esc(rec ? rec.date : today())}" required>
    <label class="f">いつの評価</label>${radioChips('timing', Object.entries(FIM_TIMINGS), timing)}
    <div class="btns"><button type="button" class="btn" data-act="evalNormal" data-type="${type}">全部 正常にする</button>${!rec && latest && query !== 'copy' ? `<a class="btn" href="#/patient/${p.id}/eval/new?copy">前回と同じにする</a>` : ''}</div>
    ${query === 'copy' && latest ? `<div class="hint">前回(${fmt(latest.date)})の内容を写しました。変わった所だけ直してください。</div>` : '<div class="hint">「全部 正常にする」→ 気になる所だけ直す、が早いです。</div>'}
  </div>`;
  const row = (label, name, opts, normal) => `<div class="erow"><div class="fn">${esc(label)}</div>${radioChipsN(name, opts, val(name) ?? '', normal)}</div>`;
  const num = (label, name, unit = '') => `<div class="numrow"><label>${esc(label)}</label><input type="number" inputmode="decimal" step="0.1" name="${name}" value="${esc(val(name) ?? '')}"><span>${unit}</span></div>`;
  const sec = (title, body, open = false) => `<details class="card esec" ${open ? 'open' : ''}><summary>${title}</summary>${body}</details>`;
  const pair = (label, base, ph) => `<div class="romrow"><span>${label}</span>${['R', 'L'].map((s) => `<input type="number" inputmode="decimal" step="0.1" name="${base}.${s}" value="${esc(val(`${base}.${s}`) ?? '')}" placeholder="${ph}">`).join('')}</div>`;
  const foot = `<div class="card"><label class="f" for="evMemo">メモ(なくてもOK)</label><textarea id="evMemo" name="memo" rows="3">${esc(v.memo || '')}</textarea></div>
    <div class="savebar"><button class="btn primary block" type="submit">保存</button></div></form>`;
  const form = (extra = '') => `<form data-form="eval" data-type="${type}" data-pid="${p.id}" data-id="${rec ? rec.id : ''}" ${extra}>`;
  return { rec, v, val, top, head, row, num, sec, pair, foot, form };
}

// ---------- 整形 ----------
function viewOrthoEval(p, recId, query) {
  const F = frame(p, 'ortho', recId, query);
  const recs = (S.records || []).filter((r) => r.patientId === p.id);
  const wbNow = F.val('wb') || (OR.currentWB(p, recs) || {}).wb || '';
  const sides = OR.sidesFor(p);
  let h = F.top + `<div class="sub">${esc(OR.diagnosisText(p) || '診断は未入力')}</div>` + F.form() + F.head;
  h += F.sec('荷重・痛み・炎症',
    `<div class="erow"><div class="fn">今の荷重</div>${radioChips('wb', OR.WB, wbNow)}</div>
    <h4>痛み(NRS 0〜10)</h4>` + OR.PAIN_SCENES.map(([k, n]) => F.row(n, `pain.${k}`, OR.NRS, '0')).join('') +
    `<h4>炎症</h4>` + OR.INFLAM.map(([k, n]) => F.row(n, `inflam.${k}`, OR.YESNO, 'なし')).join(''), true);
  h += F.sec('ROM(制限がある所だけ角度)',
    `<div class="hint">空のままは「制限なし」です。</div><div class="romhead"><span></span><span>右</span><span>左</span></div>` +
    OR.O_ROM.map(([k, n, ref]) => F.pair(`${n}<span class="small"> 参考${ref}°</span>`, `rom.${k}`, 'なし')).join(''));
  h += F.sec(`MMT<span class="small">${p.ortho && ['右', '左'].includes(p.ortho.side) ? `手術側(${p.ortho.side})を先に` : '左右'}</span>`,
    OR.O_MMT.flatMap(([k, n]) => sides.map((s) => F.row(`${SC.sideName(s)} ${n}`, `mmt.${k}.${s}`, OR.MMT, '5'))).join(''));
  h += F.sec('周径・脚の長さ',
    `<div class="romhead"><span>周径</span><span>右</span><span>左</span></div>` + OR.O_CIRC.map(([k, n]) => F.pair(n, `circ.${k}`, 'cm')).join('') +
    `<div class="romhead"><span>棘果長(脚の長さ)</span><span>右</span><span>左</span></div>` + F.pair('上前腸骨棘〜内果', 'smd', 'cm'));
  h += F.sec('歩行',
    `<div class="erow"><div class="fn">補助具</div>${radioChips('aid', OR.AIDS, F.val('aid') || '')}</div>` + OR.O_TESTS.map(([k, n, u]) => F.num(n, `tests.${k}`, u)).join(''));
  return h + F.foot;
}

// ---------- 脊損(ISNCSCI) ----------
function viewSciEval(p, recId, query) {
  const F = frame(p, 'sci', recId, query);
  const cell = (name) => {
    const v = F.val(name) ?? '';
    return `<button type="button" class="sc s${v === 'NT' ? 'nt' : v === '' ? 'e' : v}" data-act="sciCycle" data-k="${name}">${v === '' ? '—' : esc(v)}</button><input type="hidden" name="${name}" value="${esc(v)}">`;
  };
  let h = F.top + `<div class="sub">${esc(SC.diagnosisText(p) || '高さは未入力')}</div>` + F.form('data-chg="sciLive"') + F.head;
  h += `<div class="card"><h3 style="margin:0 0 6px">自動の判定(参考)</h3><div id="sciCalc"></div>
    <label class="f">AIS(自分で決めるとき。空なら自動の判定を使います)</label>${radioChips('ais', SC.AIS, F.val('ais') || '')}
    <div class="btns"><button type="button" class="btn sm" data-act="sciAisClear">AISの選択を消す</button></div></div>`;
  h += F.sec('運動(キーマッスル 0〜5・NT)',
    `<div class="hint">NT=検査できなかった</div>` +
    SC.KEY_MUSCLES.flatMap(([lv, n]) => ['R', 'L'].map((s) => F.row(`${SC.sideName(s)} ${lv} ${n}`, `motor.${lv}.${s}`, SC.MOTOR, '5'))).join(''), true);
  h += F.sec('感覚(触覚・痛覚 28か所)',
    `<div class="hint">押すたびに 2(正常)→1(異常)→0(なし)→NT と変わります。「↓」はその行の値を下の行すべてに写します。</div>
    <div class="sgrid sghead"><span></span><span>右 触</span><span>右 痛</span><span>左 触</span><span>左 痛</span><span></span></div>` +
    SC.DERMS.map((d) => `<div class="sgrid"><span class="lv">${d}</span>${cell(`lt.${d}.R`)}${cell(`pp.${d}.R`)}${cell(`lt.${d}.L`)}${cell(`pp.${d}.L`)}<button type="button" class="sc down" data-act="sciDown" data-d="${d}" aria-label="下に写す">↓</button></div>`).join(''), true);
  h += F.sec('肛門(S4-5)',
    F.row('随意的な肛門収縮', 'vac', SC.OH, 'あり') + F.row('深部肛門圧覚', 'dap', SC.OH, 'あり'), true);
  h += F.sec('その他',
    F.row('痙縮', 'spasm', SC.SPASM, 'なし') + F.row('排尿の方法', 'bladder', SC.BLADDER) + F.row('排便の方法', 'bowel', SC.BOWEL) +
    F.row('皮膚(褥瘡)', 'skin', SC.SKIN, 'なし') + F.row('起立性低血圧', 'oh', SC.OH, 'なし'));
  setTimeout(sciRecalc, 0);
  return h + F.foot;
}

const SENS_NEXT = { '': '2', 2: '1', 1: '0', 0: 'NT', NT: '2' };
function setCell(btn, v) {
  btn.textContent = v === '' ? '—' : v;
  btn.className = `sc s${v === 'NT' ? 'nt' : v === '' ? 'e' : v}`;
  btn.nextElementSibling.value = v;
}
function formObject(f) {
  const o = {};
  for (const [name, value] of new FormData(f).entries()) if (value !== '' && !['date', 'timing', 'memo'].includes(name)) setPath(o, name, value);
  return o;
}
function sciRecalc() {
  const f = $('form[data-form=eval][data-type=sci]');
  const out = $('#sciCalc');
  if (!f || !out) return;
  const r = formObject(f);
  const c = SC.classify(r);
  const t = SC.totals(r);
  const n = (v) => (v === 'INT' ? '正常' : v || '未確定');
  out.innerHTML = `<div class="stats">
    <div class="stat"><span>神経学的レベル</span><b>${n(c.nli)}</b></div>
    <div class="stat"><span>AIS(計算)</span><b>${c.ais || '—'}</b></div>
    <div class="stat"><span>完全/不完全</span><b>${c.complete == null ? '—' : c.complete ? '完全' : '不完全'}</b></div></div>
    <div class="small">感覚レベル 右${n(c.sensory.R)}・左${n(c.sensory.L)}/運動レベル 右${n(c.motor.R)}・左${n(c.motor.L)}<br>
    運動 上肢${t.uems.R + t.uems.L}/50・下肢${t.lems.R + t.lems.L}/50/触覚${t.lt.R + t.lt.L}/112・痛覚${t.pp.R + t.pp.L}/112</div>
    ${c.nli == null || c.ais == null ? '<div class="hint">全部入れると判定が出ます。</div>' : ''}
    ${SC.adWarning(c.nli) ? '<div class="small dxwarn">⚠ T6より上:自律神経過反射に注意</div>' : ''}`;
}

actions.sciCycle = (d, el) => { setCell(el, SENS_NEXT[el.nextElementSibling.value] ?? '2'); sciRecalc(); };
actions.sciDown = (d) => {
  const i = SC.DERMS.indexOf(d.d);
  const f = $('form[data-form=eval][data-type=sci]');
  for (const key of ['lt.%.R', 'pp.%.R', 'lt.%.L', 'pp.%.L']) {
    const src = f.querySelector(`input[name="${key.replace('%', d.d)}"]`).value;
    for (const dd of SC.DERMS.slice(i + 1)) setCell(f.querySelector(`button[data-k="${key.replace('%', dd)}"]`), src);
  }
  sciRecalc();
  toast(`${d.d}の値を下に写しました`);
};
actions.sciAisClear = () => { document.querySelectorAll('input[name=ais]').forEach((i) => (i.checked = false)); };
changes.sciLive = () => sciRecalc();
actions.evalNormal = (d) => {
  const f = $(`form[data-form=eval][data-type=${d.type}]`);
  f.querySelectorAll('input[data-normal]').forEach((i) => (i.checked = true));
  if (d.type === 'sci') { f.querySelectorAll('button[data-act=sciCycle]').forEach((b) => setCell(b, '2')); sciRecalc(); }
  toast('正常で埋めました。違う所だけ直してください', 2200);
};
actions.evalDel = async (d) => {
  if (!confirm('この評価を消しますか?')) return;
  await deleteRecord(d.id);
  toast('消しました');
  location.hash = `#/patient/${d.pid}/rec`;
};

document.addEventListener('submit', async (ev) => {
  const f = ev.target;
  if (f.dataset.form !== 'eval') return;
  ev.preventDefault();
  const type = f.dataset.type;
  const fd = new FormData(f);
  const date = fd.get('date');
  if (!isDate(date)) return alert('日にちを入れてください');
  const rec = { id: f.dataset.id || uid(), patientId: f.dataset.pid, type, date, timing: fd.get('timing') || 'mid', memo: String(fd.get('memo') || '').trim() };
  for (const [name, value] of fd.entries()) {
    if (['date', 'timing', 'memo'].includes(name) || value === '') continue;
    setPath(rec, name, NUM_PREFIX[type].some((x) => name.startsWith(x)) ? Number(value) : value);
  }
  await saveRecord(rec);
  toast('評価を保存しました。' + praise());
  location.hash = `#/patient/${f.dataset.pid}/rec`;
});
