// 脳卒中フォーマットの入力画面(身体機能・高次脳機能)
import { fmt, isDate } from './dates.js';
import * as L from './logic.js';
import * as SK from './stroke.js';
import { FIM_TIMINGS } from './stage2.js';
import { praise } from './messages.js';
import { S, actions, changes, today, $, esc, uid, byId, recordsOf, recordById, saveRecord, deleteRecord, getPath, setPath, toast, radioChips, radioChipsN } from './core.js';

const NUM_PREFIX = ['rom.', 'anthro.', 'scores.'];

// 記録タブに出すカード
export function strokeCard(p) {
  if (p.format !== 'stroke') return '';
  const list = recordsOf(p.id, 'stroke');
  return `<div class="card"><div class="topbar"><h3 style="margin:0">身体機能・高次脳</h3><a class="btn primary" href="#/patient/${p.id}/eval/new">+ 評価する</a></div>
    <div class="small">${esc(SK.diagnosisText(p) || '診断名は「編集」で入れられます')}</div>
    ${list.length ? list.map((r) => `<div class="list-row"><a href="#/patient/${p.id}/eval/${r.id}"><b>${fmt(r.date)}</b> ${esc(FIM_TIMINGS[r.timing] || '')}<div class="small">${esc(SK.evalShort(r))}</div></a><span class="chev">›</span></div>`).join('')
      : '<div class="sub">まだありません。「全部 正常にする」を押してから、気になる所だけ直すと早いです。</div>'}</div>`;
}

// 入力画面
export function viewStrokeEval(p, recId, query) {
  const list = recordsOf(p.id, 'stroke');
  const rec = recId && recId !== 'new' ? recordById(recId) : null;
  const latest = list[0];
  let v = rec || {};
  if (!rec && query === 'copy' && latest) {
    const { id, date, timing, updatedAt, ...rest } = latest;
    v = JSON.parse(JSON.stringify(rest));
  }
  const val = (path) => getPath(v, path);
  const timing = rec ? rec.timing : list.length ? 'mid' : 'admit';
  const pare = SK.pareticSides(p);
  const non = SK.nonPareticSides(p);
  const sideLabel = (arr) => arr.map(SK.sideName).join('・');
  const row = (label, name, opts, normal) => `<div class="erow"><div class="fn">${esc(label)}</div>${radioChipsN(name, opts, val(name) ?? '', normal)}</div>`;
  const num = (label, name, ph = '', unit = '') => `<div class="numrow"><label>${esc(label)}</label><input type="number" inputmode="decimal" step="0.1" name="${name}" value="${esc(val(name) ?? '')}" placeholder="${esc(ph)}"><span>${unit}</span></div>`;
  const sec = (title, body, open = false) => `<details class="card esec" ${open ? 'open' : ''}><summary>${title}</summary>${body}</details>`;

  let h = `<div class="topbar"><a class="back" href="#/patient/${p.id}/rec">‹ 記録</a>${rec ? `<button class="btn danger sm" data-act="strokeDel" data-id="${rec.id}" data-pid="${p.id}">消す</button>` : ''}</div>
  <h2 style="margin-top:4px">${esc(L.label(p))} 身体機能・高次脳</h2>
  <div class="sub">${esc(SK.diagnosisText(p) || '診断名は未入力')}・麻痺側:${sideLabel(pare)}${p.stroke && p.stroke.side ? '' : '(損傷側が未入力なので左右とも)'}</div>
  <form data-form="stroke" data-pid="${p.id}" data-id="${rec ? rec.id : ''}" data-chg="strokeLive">
  <div class="card">
    <label class="f" for="seDate">日にち</label><input type="date" id="seDate" name="date" value="${esc(rec ? rec.date : today())}" required>
    <label class="f">いつの評価</label>${radioChips('timing', Object.entries(FIM_TIMINGS), timing)}
    <div class="btns"><button type="button" class="btn" data-act="strokeNormal">全部 正常にする</button>${!rec && latest && query !== 'copy' ? `<a class="btn" href="#/patient/${p.id}/eval/new?copy">前回と同じにする</a>` : ''}</div>
    ${query === 'copy' ? `<div class="hint">前回(${fmt(latest.date)})の内容を写しました。変わった所だけ直してください。</div>` : '<div class="hint">「全部 正常にする」→ 気になる所だけ直す、が早いです。</div>'}
  </div>`;

  h += sec(`麻痺(ブルンストローム・筋緊張)<span class="small">麻痺側 ${sideLabel(pare)}</span>`,
    SK.BRS_PARTS.map(([k, n]) => row(`ブルンストローム ${n}`, `brs.${k}`, SK.BRS)).join('') +
    `<h4>筋緊張(MAS)</h4>` + SK.MAS_MUSCLES.map(([k, n]) => row(n, `mas.${k}`, SK.MAS, '0')).join(''), true);

  h += sec('高次脳機能',
    SK.hbfOrder(p).map(([k, n]) => row(n, `hbf.${k}`, SK.HBF_LEVELS, 'なし')).join('') +
    `<h4>検査の点数(してなければ空のまま)</h4>` + SK.SCORES.map(([k, n, u]) => num(n, `scores.${k}`, '', u)).join(''), true);

  h += sec('ROM(制限がある所だけ角度)',
    `<div class="hint">空のままは「制限なし」です。</div><div class="romhead"><span></span><span>右</span><span>左</span></div>` +
    SK.ROM_JOINTS.map(([k, n, ref]) => `<div class="romrow"><span>${n}<span class="small"> 参考${ref}°</span></span>${['R', 'L'].map((s) => `<input type="number" inputmode="numeric" name="rom.${k}.${s}" value="${esc(val(`rom.${k}.${s}`) ?? '')}" placeholder="なし">`).join('')}</div>`).join(''));

  h += sec(`MMT<span class="small">非麻痺側 ${sideLabel(non)}・体幹</span>`,
    SK.MMT_MUSCLES.flatMap(([k, n]) => non.map((s) => row(`${SK.sideName(s)} ${n}`, `mmt.${k}.${s}`, SK.MMT, '5'))).join('') +
    SK.MMT_TRUNK.map(([k, n]) => row(n, `mmt.${k}`, SK.MMT, '5')).join(''));

  h += sec(`感覚<span class="small">麻痺側 ${sideLabel(pare)}</span>`,
    `<h4>表在感覚(触覚・痛覚)</h4>` + SK.LIMBS.flatMap(([l, ln]) => pare.map((s) => row(`${SK.sideName(s)} ${ln}`, `sens.sup.${l}.${s}`, SK.SENS_SUP, '正常'))).join('') +
    `<h4>深部感覚(位置覚・運動覚)</h4>` + SK.LIMBS.flatMap(([l, ln]) => pare.map((s) => row(`${SK.sideName(s)} ${ln}`, `sens.deep.${l}.${s}`, SK.SENS_DEEP, '正常'))).join(''));

  h += sec('失調',
    SK.ATAXIA_TESTS.flatMap(([k, n]) => ['R', 'L'].map((s) => row(`${SK.sideName(s)} ${n}`, `ataxia.${k}.${s}`, SK.ATAXIA, 'なし'))).join('') +
    SK.ATAXIA_TRUNK.map(([k, n]) => row(n, `ataxia.${k}`, SK.ATAXIA, 'なし')).join(''));

  const b = SK.bmi(val('anthro.height'), val('anthro.weight'));
  h += sec('形態測定',
    num('身長', 'anthro.height', '', 'cm') + num('体重', 'anthro.weight', '', 'kg') + `<div class="hint" id="bmiOut">${b ? `BMI ${b}` : 'BMIは身長と体重から自動で出ます'}</div>` +
    `<div class="romhead"><span>周径</span><span>右</span><span>左</span></div>` +
    SK.CIRC.map(([k, n]) => `<div class="romrow"><span>${n}</span>${['R', 'L'].map((s) => `<input type="number" inputmode="decimal" step="0.1" name="anthro.circ.${k}.${s}" value="${esc(val(`anthro.circ.${k}.${s}`) ?? '')}" placeholder="cm">`).join('')}</div>`).join(''));

  h += `<div class="card"><label class="f" for="seMemo">メモ(なくてもOK)</label><textarea id="seMemo" name="memo" rows="3">${esc(v.memo || '')}</textarea></div>
    <div class="savebar"><button class="btn primary block" type="submit">保存</button></div></form>`;
  return h;
}

actions.strokeNormal = () => {
  const f = $('form[data-form=stroke]');
  f.querySelectorAll('input[data-normal]').forEach((i) => (i.checked = true));
  toast('正常で埋めました。違う所だけ直してください', 2200);
};
actions.strokeDel = async (d) => {
  if (!confirm('この評価を消しますか?')) return;
  await deleteRecord(d.id);
  toast('消しました');
  location.hash = `#/patient/${d.pid}/rec`;
};
changes.strokeLive = (d, el) => {
  const fd = new FormData(el);
  const b = SK.bmi(fd.get('anthro.height'), fd.get('anthro.weight'));
  const o = $('#bmiOut');
  if (o) o.textContent = b ? `BMI ${b}` : 'BMIは身長と体重から自動で出ます';
};

document.addEventListener('submit', async (ev) => {
  const f = ev.target;
  if (f.dataset.form !== 'stroke') return;
  ev.preventDefault();
  const fd = new FormData(f);
  const date = fd.get('date');
  if (!isDate(date)) return alert('日にちを入れてください');
  const rec = { id: f.dataset.id || uid(), patientId: f.dataset.pid, type: 'stroke', date, timing: fd.get('timing') || 'mid', memo: String(fd.get('memo') || '').trim() };
  for (const [name, value] of fd.entries()) {
    if (['date', 'timing', 'memo'].includes(name) || value === '') continue;
    setPath(rec, name, NUM_PREFIX.some((x) => name.startsWith(x)) ? Number(value) : value);
  }
  await saveRecord(rec);
  toast('評価を保存しました。' + praise());
  location.hash = `#/patient/${f.dataset.pid}/rec`;
});
