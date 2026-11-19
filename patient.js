// 患者ページ(概要・記録・生活・書類)と、その中の操作
import * as db from './db.js';
import { addDays, diffDays, fmt, fmtLong, monthKey, isDate, WD } from './dates.js';
import * as L from './logic.js';
import * as T from './stage2.js';
import { praise } from './messages.js';
import { avatarSvg } from './avatar.js';
import {
  S, actions, changes, today, $, esc, uid, nowIso, byId, render, savePatient, saveEvent, saveRecord, deleteRecord, recordsOf, recordById,
  getPath, setPath, toast, cheer, openSheet, closeSheet, copyText, copyBtn, chips, radioChips,
} from './core.js';
import { leftText, dots, checkAct, shareFile, downloadFile } from './app.js';
import { formatCard, viewEval, formatHeader } from './formsui.js';

const SECTIONS = [['main', '概要'], ['rec', '記録'], ['life', '生活'], ['docs', '書類']];
const statusTag = { none: '<span class="tag">未登録</span>', plan: '<span class="tag plan">予定</span>', done: '<span class="tag ok">済</span>' };

export function viewPatient(id, section = 'main', query, extra) {
  const p = byId(id);
  if (!p) return `<a class="back" href="#/patients">‹ 患者</a><div class="empty">見つかりませんでした</div>`;
  if (section === 'eval') return viewEval(p, extra, query);
  if (!SECTIONS.some(([k]) => k === section)) section = 'main';
  const t = today();
  const lt = leftText(p, t);
  let h = `<div class="topbar"><a class="back" href="${p.archived ? '#/archive' : '#/today'}">‹ ${p.archived ? '退院済み' : 'ホーム'}</a><a class="btn" href="#/patient-edit/${p.id}">編集</a></div>
    <div class="phead">${avatarSvg(p.gender, p.ageGroup, 76)}<div><div class="row"><span class="ini">${esc(L.label(p))}</span><span class="room">${esc(p.room || '')}</span>${p.archived ? '<span class="tag">退院済み</span>' : ''}</div>
    <div class="sub">${[T.GENDERS[p.gender], (T.AGES.find((a) => a[0] === p.ageGroup) || [])[1], p.diseaseLimit ? `区分${p.diseaseLimit}日` : ''].filter(Boolean).join('・') || '性別・年代は「編集」で入れられます'}</div>
    ${formatHeader(p, t)}</div></div>
    ${bigNumbers(p, t)}
    <div class="seg sticky">${SECTIONS.map(([k, n]) => `<a class="${k === section ? 'on' : ''}" href="#/patient/${p.id}/${k}">${n}</a>`).join('')}</div>`;
  if (section === 'main') h += sectionMain(p, t, lt);
  if (section === 'rec') h += sectionRecords(p, t);
  if (section === 'life') h += sectionLife(p);
  if (section === 'docs') h += sectionDocs(p, t);
  if (query === 'adl') setTimeout(() => $('#adl')?.scrollIntoView({ behavior: 'smooth' }), 50);
  return h;
}

function bigNumbers(p, t) {
  const n = T.patientNumbers(p, t);
  const tile = (v, top, unit, cls = '', note = '') => `<div class="bign ${cls}"><span class="bt">${top}</span><b>${v == null ? '—' : v}</b><span class="bu">${v == null ? note : unit}</span></div>`;
  const dCls = n.toDischarge == null ? '' : n.toDischarge <= 7 ? 'red' : n.toDischarge <= 30 ? 'yellow' : '';
  const lCls = n.toLimit == null ? '' : n.toLimit <= 14 ? 'red' : n.toLimit <= 30 ? 'yellow' : '';
  return `<div class="bigns">
    ${tile(n.sinceAdmit, '入院から', '日', '', '入院日を入力')}
    ${tile(n.sinceKaifuku, '回復期に来て', '日', '', '来た日を入力')}
    ${tile(n.toDischarge, '退院まであと', '日', dCls, '退院予定日を入力')}
    ${tile(n.toLimit, '算定上限まであと', n.limitDate ? `日(${fmt(n.limitDate)})` : '日', lCls, '区分を選ぶ')}
  </div>`;
}

// ---------- 概要 ----------
function sectionMain(p, t) {
  const rem = L.remainingFor(p, S, t);
  const a = p.adl || {};
  const conf = L.adlWeekdays(p.room, S.settings.adlTable);
  const v = L.visitDate(p, S.events);
  const ps = L.planState(p, S.plans, t);
  const o = p.orthosis || {};
  let h = `<div class="card"><h3>残っていること</h3>${
    rem.length ? rem.map((r) => `<div class="check" ${remAct(p, r)}><span class="box"></span><span class="ctext">${esc(r.label)}</span><span class="chev">›</span></div>`).join('') : '<div class="sub">残っていることはありません。すばらしいです!</div>'
  }</div>`;

  // 予定と進み具合
  const rows = T.scheduleRows(p, S, t);
  h += `<div class="card"><div class="topbar"><h3 style="margin:0">予定と進み具合</h3><button class="btn" data-act="addEvent" data-pid="${p.id}">+ 予定</button></div>
    ${rows.map((r) => r.event
      ? `<div class="list-row"><a href="#" data-act="editEvent" data-eid="${r.event.id}">${esc(r.name)} <span class="sub">${fmt(r.event.date)}${r.event.time ? ' ' + esc(r.event.time) : ''}</span></a>${statusTag[r.status]}${r.status === 'plan' ? `<button class="btn sm" data-act="evDone" data-eid="${r.event.id}">済にする</button>` : ''}</div>`
      : `<div class="list-row"><span>${esc(r.name)}</span>${statusTag.none}<button class="btn sm" data-act="addEvent" data-pid="${p.id}" data-type="${r.type}">日付を入れる</button></div>`).join('')}
    <div class="list-row"><span>計画書(${Number(t.slice(5, 7))}月)</span>${ps === 'done' ? statusTag.done : ps === 'todo' ? `<span class="tag plan">対象</span><button class="btn sm" data-act="planExplained" data-month="${monthKey(t)}" data-pid="${p.id}">説明済み</button>` : `<a class="small" href="#/plan/${monthKey(t)}">今月は対象外</a>`}</div>
    ${p.homeVisitNeeded === false ? `<div class="list-row"><span>家屋調査</span><span class="tag">なし</span><button class="btn sm" data-act="visitNeeded" data-pid="${p.id}" data-v="1">ありにする</button></div>`
      : `<div class="list-row"><span>家屋調査の報告書</span>${p.homeReportDone ? `${statusTag.done}<button class="btn sm" data-act="reportUndo" data-pid="${p.id}">戻す</button>` : `${v ? '<span class="tag plan">作成中</span>' : statusTag.none}<a class="btn sm" href="#/patient/${p.id}/docs">作る</a>`}</div>
         ${!v ? `<div class="small" style="text-align:right"><a href="#" data-act="visitNeeded" data-pid="${p.id}" data-v="0">この人は家屋調査なし</a></div>` : ''}`}
    <div class="list-row"><span>サマリー</span>${p.summaryDone ? `${statusTag.done}<button class="btn sm" data-act="summaryUndo" data-pid="${p.id}">戻す</button>` : `${isDate(p.dischargeDate) && diffDays(p.dischargeDate, t) <= 7 ? '<span class="tag plan">作成中</span>' : '<span class="tag">退院7日前から</span>'}<a class="btn sm" href="#/patient/${p.id}/docs">作る</a>`}</div>
    ${dots(L.progress(p, S, t))}</div>`;

  // 装具
  h += `<div class="card"><h3>装具</h3>${chips(Object.entries(T.ORTHO_STATUS), o.status, `data-act="setP" data-pid="${p.id}" data-path="orthosis.status"`)}
    ${o.status === 'yes' || o.status === 'making' ? `<div class="small" style="margin-top:8px">種類</div>${chips(Object.entries(T.ORTHO_TYPES), o.type, `data-act="setP" data-pid="${p.id}" data-path="orthosis.type"`)}
      ${o.type === 'other' ? `<input type="text" placeholder="装具の名前" value="${esc(o.other || '')}" data-chg="inputP" data-pid="${p.id}" data-path="orthosis.other" style="margin-top:8px">` : ''}` : ''}</div>`;

  // 入院時のこと
  h += `<div class="card"><h3>入院時のこと</h3>${L.newPatientChecklist(p, S.events)
    .map((c) => `<div class="check ${c.done ? 'done' : ''}" ${c.done && (c.key === 'firstConf' || c.key === 'preState') ? '' : checkAct(p, c.key)}><span class="box"></span><span class="ctext">${esc(c.label)}</span>${c.done ? '' : '<span class="chev">›</span>'}</div>`).join('')}
    <label class="f" for="preState">入院前の状態</label><textarea id="preState" placeholder="例:独歩・屋外も自立、階段手すりあり">${esc(p.preState || '')}</textarea>
    <div class="btns"><button class="btn" data-act="savePreState" data-pid="${p.id}">保存</button></div></div>`;

  // ADL
  h += `<div class="card" id="adl"><h3>病棟ADLカンファ用の8項目</h3>
    <div class="sub">${conf.length ? `この部屋のカンファは毎週 ${conf.map((w) => WD[w]).join('・')}曜日(前日の朝にお知らせ)` : '部屋番号がカンファの表にありません(設定で変えられます)'}</div>
    ${L.ADL_ITEMS.map(([k, name]) => k === 'dischargeDate'
      ? `<label class="f">${name}</label><div class="sub">${p.dischargeDate ? fmt(p.dischargeDate) + '(退院予定日から自動)' : '退院予定日を入れると自動で入ります'}</div>`
      : `<div class="adl-row"><label class="f" for="adl-${k}">${name}</label><input type="text" id="adl-${k}" value="${esc(a[k] || '')}"></div>`).join('')}
    <div class="hint">${a.updatedAt ? `最後の更新:${fmtLong(a.updatedAt)}` : 'まだ更新していません'}</div>
    <div class="btns"><button class="btn primary" data-act="saveAdl" data-pid="${p.id}">更新する</button>${copyBtn(L.adlDraft(p, t, null), '下書きをコピー')}</div></div>`;
  if (p.memo) h += `<div class="card"><h3>メモ</h3><div style="white-space:pre-wrap">${esc(p.memo)}</div></div>`;
  return h;
}
function remAct(p, r) {
  switch (r.key) {
    case 'firstConf':
    case 'preState':
    case 'inbodyAdmit':
    case 'fimAdmit': return checkAct(p, r.key);
    case 'visitDate': return `data-act="addEvent" data-pid="${p.id}" data-type="homeVisit"`;
    case 'plan': return `data-act="planExplained" data-month="${monthKey(today())}" data-pid="${p.id}"`;
    case 'homeReport': return `data-act="goto" data-href="#/patient/${p.id}/docs"`;
    case 'summary': return `data-act="goto" data-href="#/patient/${p.id}/docs"`;
  }
  return '';
}

// ---------- 記録 ----------
function sectionRecords(p, t) {
  const daily = recordsOf(p.id, 'daily');
  const fims = recordsOf(p.id, 'fim');
  const ibs = recordsOf(p.id, 'inbody');
  const fs = T.fimSummary(S.records.filter((r) => r.patientId === p.id));
  let h = formatCard(p) +`<div class="card"><div class="topbar"><h3 style="margin:0">毎日の記録</h3><button class="btn primary" data-act="dailyNew" data-pid="${p.id}">+ 今日の記録</button></div>
    ${daily.length ? daily.slice(0, 20).map((r) => `<div class="list-row"><a href="#" data-act="dailyEdit" data-id="${r.id}"><b>${fmt(r.date)}</b> <span class="mood m${T.MOODS.indexOf(r.mood)}">${esc(r.mood || '')}</span> <span class="sub">${esc((r.tags || []).join('・'))}</span>${r.memo ? `<div class="small">${esc(r.memo)}</div>` : ''}</a><span class="chev">›</span></div>`).join('')
      : '<div class="sub">まだありません。ボタンで選ぶだけで残せます。</div>'}
    ${daily.length > 20 ? `<div class="small">ほか${daily.length - 20}件</div>` : ''}</div>`;

  h += `<div class="card"><div class="topbar"><h3 style="margin:0">FIM</h3><button class="btn primary" data-act="fimNew" data-pid="${p.id}" data-timing="${fims.length ? 'mid' : 'admit'}">+ 入力</button></div>
    ${fs ? `<div class="fimsum"><div><span class="small">${T.FIM_TIMINGS[fs.first.timing] || '最初'}</span><b>${fs.firstTotal.total}</b></div>${fs.latest !== fs.first ? `<div class="arrow">→</div><div><span class="small">最新</span><b>${fs.latestTotal.total}</b></div><div class="gain ${fs.gain >= 0 ? 'up' : 'down'}">${fs.gain >= 0 ? '+' : ''}${fs.gain}</div>` : ''}</div>` : ''}
    ${fims.length ? fims.map((r) => { const ft = T.fimTotal(r.scores); return `<div class="list-row"><a href="#" data-act="fimEdit" data-id="${r.id}"><b>${fmt(r.date)}</b> ${esc(T.FIM_TIMINGS[r.timing] || '')} <b>${ft.total}点</b> <span class="sub">運動${ft.motor}/認知${ft.cog}${ft.complete ? '' : `・${18 - ft.filled}項目未入力`}</span></a><span class="chev">›</span></div>`; }).join('')
      : '<div class="sub">まだありません</div>'}</div>`;

  h += `<div class="card"><div class="topbar"><h3 style="margin:0">InBody</h3><button class="btn primary" data-act="inbodyNew" data-pid="${p.id}" data-timing="${ibs.length ? 'mid' : 'admit'}">+ 入力</button></div>
    ${ibs.length ? ibs.map((r) => `<div class="list-row"><a href="#" data-act="inbodyEdit" data-id="${r.id}" class="ibrow">${r.photo ? `<img class="thumb" src="${r.photo}" alt="InBodyの写真">` : ''}<span><b>${fmt(r.date)}</b> ${esc(T.FIM_TIMINGS[r.timing] || '')}<br><span class="sub">${[r.weight && `体重${r.weight}kg`, r.smm && `骨格筋${r.smm}kg`, r.pbf && `体脂肪${r.pbf}%`, r.smi && `SMI ${r.smi}`].filter(Boolean).join(' ') || '数値なし'}</span></span></a><span class="chev">›</span></div>`).join('')
      : '<div class="sub">まだありません。結果の紙の写真も残せます(名前などは塗りつぶします)。</div>'}</div>`;
  return h;
}

// ---------- 生活 ----------
function sectionLife(p) {
  const e = p.env || {};
  const sy = p.system || {};
  const at = (path) => `data-act="setP" data-pid="${p.id}" data-path="${path}"`;
  let h = `<div class="card"><h3>住まい</h3>
    <label class="f" for="town">市・町まで(番地は入れない)</label>
    <input type="text" id="town" value="${esc(e.town || '')}" placeholder="例:◯◯市◯◯町" data-chg="town" data-pid="${p.id}">
    <label class="f">住まいの状況</label>${chips(T.LIVING, e.living, at('env.living'))}
    <label class="f">退院後に本人が使う移動手段(いくつでも)</label>${chips(T.MODES, e.afterModes, `data-act="toggleP" data-pid="${p.id}" data-path="env.afterModes"`, { multi: true })}</div>`;

  h += `<div class="card"><h3>行き先</h3>${(e.places || []).length ? '' : '<div class="sub">まだありません。下のボタンで足します。</div>'}`;
  (e.places || []).forEach((pl, i) => {
    const flags = T.placeFlags(pl, p, S.settings);
    h += `<div class="place ${flags.length ? 'warn' : ''}">
      <div class="topbar"><span class="tag">${esc(T.PLACE_KINDS[pl.kind] || '行き先')}</span>${flags.length ? '<span class="bang">‼️</span>' : ''}<button class="x" data-act="placeDel" data-pid="${p.id}" data-i="${i}" aria-label="消す">✕</button></div>
      <input type="text" value="${esc(pl.name || '')}" placeholder="行き先の名前(例:◯◯スーパー)" data-chg="inputP" data-pid="${p.id}" data-path="env.places.${i}.name" data-render="1">
      <div class="btns"><a class="btn" href="${esc(T.mapsUrl(e.town, pl))}" target="_blank" rel="noopener">地図で調べる</a></div>
      ${!e.town ? '<div class="hint">「市・町」を入れると、そこからの道順が出ます。</div>' : ''}
      <div class="small" style="margin-top:8px">移動手段</div>${chips(T.MODES, pl.mode, at(`env.places.${i}.mode`))}
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px"><span class="small">かかる時間</span><input type="number" inputmode="numeric" min="0" style="width:90px" value="${esc(pl.minutes || '')}" data-chg="inputP" data-num="1" data-render="1" data-pid="${p.id}" data-path="env.places.${i}.minutes"><span>分</span></div>
      ${flags.map((f) => `<div class="flag">‼️ ${esc(f)}</div>`).join('')}
    </div>`;
  });
  h += `<div class="btns">${Object.entries(T.PLACE_KINDS).map(([k, n]) => `<button class="btn" data-act="placeAdd" data-pid="${p.id}" data-kind="${k}">+ ${n}</button>`).join('')}</div></div>`;

  h += `<div class="card"><h3>家族</h3><div class="small">名前は入れません。</div>`;
  (p.family || []).forEach((f, i) => {
    const fa = (path) => at(`family.${i}.${path}`);
    h += `<div class="place"><div class="topbar"><b>${esc(T.familyText(f))}</b><button class="x" data-act="famDel" data-pid="${p.id}" data-i="${i}" aria-label="消す">✕</button></div>
      <div class="small">続柄</div>${chips(T.RELS, f.rel, fa('rel'))}
      ${f.rel === 'その他' ? `<input type="text" placeholder="例:姪、友人" value="${esc(f.relOther || '')}" data-chg="inputP" data-render="1" data-pid="${p.id}" data-path="family.${i}.relOther">` : ''}
      <div class="small">キーパーソン</div><div class="chips"><button class="chip ${f.kp ? 'on' : ''}" data-act="famKp" data-pid="${p.id}" data-i="${i}">KP</button></div>
      <div class="small">協力の状況</div>${chips(T.COOP, f.coop, fa('coop'))}
      <div class="small">就労の状況</div>${chips(T.WORK, f.work, fa('work'))}
      <div class="small">本人の家まで</div>${chips(T.DIST, f.distance, fa('distance'))}</div>`;
  });
  h += `<div class="btns"><button class="btn" data-act="famAdd" data-pid="${p.id}">+ 家族を追加</button></div></div>`;

  h += `<div class="card"><h3>制度</h3><div class="small">介護保険</div>${chips(T.KAIGO, sy.kaigo, at('system.kaigo'))}
    <div class="small" style="margin-top:8px">障害者手帳</div>${chips(T.TECHO, sy.techo, at('system.techo'))}
    ${sy.techo === 'その他' ? `<input type="text" placeholder="例:精神2級" value="${esc(sy.techoOther || '')}" data-chg="inputP" data-pid="${p.id}" data-path="system.techoOther">` : ''}</div>`;
  return h;
}

// ---------- 書類 ----------
function sectionDocs(p, t) {
  const sum = recordById(`${p.id}:summary`);
  const draft = T.summaryDraft(p, S, t);
  let h = `<div class="card"><h3>サマリー</h3><div class="sub">これまでの入力から下書きを自動で作ります。直して「保存」できます。</div>
    <textarea id="sumText" rows="16">${esc(sum && sum.text ? sum.text : draft)}</textarea>
    <div class="hint">${sum && sum.text ? `保存:${fmtLong(sum.updatedAt.slice(0, 10))}` : 'まだ保存していません(自動の下書きを表示中)'}</div>
    <div class="btns"><button class="btn primary" data-act="sumSave" data-pid="${p.id}">保存</button><button class="btn" data-act="sumRegen" data-pid="${p.id}">下書きを作り直す</button>
      <button class="btn" data-act="copyField" data-field="sumText">コピー</button><button class="btn" data-act="copyField" data-field="sumText" data-ai="summary">AI用にコピー</button></div>
    <div class="btns">${p.summaryDone ? `<span class="tag ok">完成 ${fmt(p.summaryDone)}</span><button class="btn sm" data-act="summaryUndo" data-pid="${p.id}">戻す</button>` : `<button class="btn primary" data-act="summaryDone" data-pid="${p.id}">サマリーができた</button>`}</div>
    <p class="small"><a href="#/help/ai">「AI用にコピー」の使い方</a></p></div>`;

  if (p.homeVisitNeeded !== false) {
    const rep = (recordById(`${p.id}:homeReport`) || {}).data || {};
    const ra = (path) => `data-act="repSet" data-pid="${p.id}" data-path="${path}"`;
    const v = L.visitDate(p, S.events);
    const rd = T.homeReportDraft(p, rep, S.events);
    h += `<div class="card"><h3>家屋調査報告書</h3><div class="sub">訪問日:${v ? fmtLong(v) : '<a href="#" data-act="addEvent" data-pid="' + p.id + '" data-type="homeVisit">まだ入っていません</a>'}</div>
      <label class="f">参加した人</label>${chips(T.VISIT_PEOPLE, rep.people, `data-act="repToggle" data-pid="${p.id}" data-path="people"`, { multi: true })}
      ${T.VISIT_AREAS.map((a) => { const r = (rep.areas || {})[a] || {}; return `<div class="area"><b>${a}</b>${chips(T.VISIT_STATUS, r.status, ra(`areas.${a}.status`))}<input type="text" placeholder="寸法やメモ(例:段差18cm)" value="${esc(r.memo || '')}" data-chg="repInput" data-pid="${p.id}" data-path="areas.${a}.memo"></div>`; }).join('')}
      <label class="f" for="repProposal">提案・まとめ</label><textarea id="repProposal" rows="4" data-chg="repInput" data-pid="${p.id}" data-path="proposal">${esc(rep.proposal || '')}</textarea>
      <label class="f">下書き</label><pre class="draft">${esc(rd)}</pre>
      <div class="btns">${copyBtn(rd, 'コピー')}${copyBtn(T.aiPrompt('report', rd), 'AI用にコピー')}</div>
      <div class="btns">${p.homeReportDone ? `<span class="tag ok">完成 ${fmt(p.homeReportDone)}</span><button class="btn sm" data-act="reportUndo" data-pid="${p.id}">戻す</button>` : `<button class="btn primary" data-act="reportDone" data-pid="${p.id}">報告書ができた</button>`}</div></div>`;
  }

  h += `<div class="card"><h3>iPhoneのカレンダーに入れる</h3><p class="sub">この人の期日と予定を、通知つきでカレンダーに入れます。予定名はイニシャルだけです。</p>
    <div class="btns"><button class="btn primary" data-act="icsPatient" data-pid="${p.id}">カレンダーへ</button></div></div>
    <div class="btns" style="margin-top:20px">${p.archived
      ? `<button class="btn" data-act="unarchive" data-pid="${p.id}">担当中に戻す</button>`
      : `<button class="btn" data-act="archive" data-pid="${p.id}">退院済みにする</button>`}<button class="btn danger" data-act="deletePatient" data-pid="${p.id}">削除</button></div>`;
  return h;
}

// ---------- 予定の入力 ----------
export function openEventSheet({ pid, eid, type }) {
  const e = eid ? S.events.find((x) => x.id === eid) : null;
  const p = byId(e ? e.patientId : pid);
  if (!p) return;
  const v = e || { type: type || 'firstConf', title: '', date: '', time: '', checklist: null };
  const cl = (v.checklist || S.settings.visitChecklist.map((t) => ({ text: t, done: false }))).map((c) => c.text).join('\n');
  openSheet(`${L.label(p)} の予定${e ? 'を編集' : 'を追加'}`, `<form data-form="event" data-pid="${p.id}" data-eid="${e ? e.id : ''}">
    <label class="f" for="evType">種類</label>
    <select id="evType" name="type">${Object.entries(L.EVENT_TYPES).map(([k, n]) => `<option value="${k}" ${v.type === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <div id="evTitleBox" ${v.type === 'other' ? '' : 'hidden'}><label class="f" for="evTitle">予定の名前</label><input type="text" id="evTitle" name="title" value="${esc(v.title)}" placeholder="例:装具の採型"></div>
    <label class="f" for="evDate">日にち</label><input type="date" id="evDate" name="date" value="${esc(v.date)}" required>
    <label class="f" for="evTime">時間(なくてもOK)</label><input type="time" id="evTime" name="time" value="${esc(v.time)}">
    <div id="evListBox" ${v.type === 'homeVisit' ? '' : 'hidden'}><label class="f" for="evList">持ち物(1行に1つ)</label><textarea id="evList" name="checklist" rows="5">${esc(cl)}</textarea></div>
    <label class="toggle"><input type="checkbox" name="done" ${v.done ? 'checked' : ''}> 済んだ</label>
    <div class="hint">前日(休みなら前の出勤日)に「今日やること」でお知らせします。</div>
    <div class="btns"><button class="btn primary block" type="submit">保存</button></div>
    ${e ? `<div class="btns"><button class="btn danger" type="button" data-act="deleteEvent" data-eid="${e.id}">この予定を消す</button></div>` : ''}
  </form>`);
  $('#evType').addEventListener('change', (ev) => {
    $('#evTitleBox').hidden = ev.target.value !== 'other';
    $('#evListBox').hidden = ev.target.value !== 'homeVisit';
  });
}

// ---------- 毎日の記録・FIM・InBody の入力 ----------
function checkChips(name, list, current = []) {
  return `<div class="chips">${list.map((v) => `<label class="chip-r"><input type="checkbox" name="${name}" value="${esc(v)}" ${current.includes(v) ? 'checked' : ''}><span>${esc(v)}</span></label>`).join('')}</div>`;
}
function openDaily(pid, id) {
  const r = id ? recordById(id) : null;
  const p = byId(r ? r.patientId : pid);
  const v = r || { date: today(), mood: '', tags: [], memo: '' };
  openSheet(`${L.label(p)} 毎日の記録`, `<form data-form="daily" data-pid="${p.id}" data-id="${r ? r.id : ''}">
    <label class="f" for="dDate">日にち</label><input type="date" id="dDate" name="date" value="${esc(v.date)}" required>
    <label class="f">様子</label>${radioChips('mood', T.MOODS, v.mood)}
    <label class="f">やったこと(いくつでも)</label>${checkChips('tags', T.DAILY_TAGS, v.tags)}
    <label class="f" for="dMemo">メモ(なくてもOK)</label><textarea id="dMemo" name="memo" rows="3" placeholder="例:屋外歩行200m、見守りで可">${esc(v.memo)}</textarea>
    <div class="btns"><button class="btn primary block" type="submit">保存</button></div>
    ${r ? `<div class="btns"><button class="btn danger" type="button" data-act="recDel" data-id="${r.id}">この記録を消す</button></div>` : ''}</form>`);
}
function fimRows(scores) {
  const row = ([k, n]) => `<div class="fimrow"><div class="fn">${n}</div>${radioChips(`s_${k}`, [1, 2, 3, 4, 5, 6, 7].map((x) => [String(x), String(x)]), scores[k] != null ? String(scores[k]) : '')}</div>`;
  return `<h4>運動(13項目)</h4>${T.FIM_MOTOR.map(row).join('')}<h4>認知(5項目)</h4>${T.FIM_COG.map(row).join('')}`;
}
function openFim(pid, id, timing) {
  const r = id ? recordById(id) : null;
  const p = byId(r ? r.patientId : pid);
  const v = r || { date: today(), timing: timing || 'mid', scores: {} };
  const tt = T.fimTotal(v.scores);
  openSheet(`${L.label(p)} FIM`, `<form data-form="fim" data-pid="${p.id}" data-id="${r ? r.id : ''}" data-chg="fimLive">
    <label class="f" for="fDate">日にち</label><input type="date" id="fDate" name="date" value="${esc(v.date)}" required>
    <label class="f">いつの評価</label>${radioChips('timing', Object.entries(T.FIM_TIMINGS), v.timing)}
    <div class="small" style="margin-top:8px">1=全介助 … 7=完全自立。数字を押して選びます。</div>
    <div class="fimtotal" id="fimTotal">合計 ${tt.total}点(運動${tt.motor}/認知${tt.cog})</div>
    ${fimRows(v.scores)}
    <div class="btns"><button class="btn primary block" type="submit">保存</button></div>
    ${r ? `<div class="btns"><button class="btn danger" type="button" data-act="recDel" data-id="${r.id}">この記録を消す</button></div>` : ''}</form>`);
}
let pendingPhoto = null;
function openInbody(pid, id, timing) {
  const r = id ? recordById(id) : null;
  const p = byId(r ? r.patientId : pid);
  const v = r || { date: today(), timing: timing || 'mid' };
  pendingPhoto = r ? r.photo || null : null;
  const num = (name, label, unit) => `<div class="numrow"><label for="ib_${name}">${label}</label><input type="number" step="0.1" inputmode="decimal" id="ib_${name}" name="${name}" value="${esc(v[name] || '')}"><span>${unit}</span></div>`;
  openSheet(`${L.label(p)} InBody`, `<form data-form="inbody" data-pid="${p.id}" data-id="${r ? r.id : ''}">
    <label class="f" for="iDate">日にち</label><input type="date" id="iDate" name="date" value="${esc(v.date)}" required>
    <label class="f">いつの測定</label>${radioChips('timing', Object.entries(T.FIM_TIMINGS), v.timing)}
    ${num('weight', '体重', 'kg')}${num('smm', '骨格筋量', 'kg')}${num('pbf', '体脂肪率', '%')}${num('smi', 'SMI', 'kg/m²')}
    <label class="f">結果の写真</label>
    <div id="ibPhoto">${pendingPhoto ? `<img class="photo" src="${pendingPhoto}" alt="InBodyの写真">` : '<div class="sub">まだありません</div>'}</div>
    <div class="btns"><button class="btn" type="button" data-act="ibPick">写真を撮る・選ぶ</button>${pendingPhoto ? '<button class="btn" type="button" data-act="ibPhotoDel">写真を外す</button>' : ''}</div>
    <input type="file" id="ibFile" accept="image/*" hidden data-chg="ibFile">
    <div class="warn-hint">写真を選ぶと、名前やIDの所を指でなぞって黒く塗りつぶす画面になります。</div>
    <div class="btns"><button class="btn primary block" type="submit">保存</button></div>
    ${r ? `<div class="btns"><button class="btn danger" type="button" data-act="recDel" data-id="${r.id}">この記録を消す</button></div>` : ''}</form>`);
}

// 写真の塗りつぶし(名前・ID・生年月日を黒く隠す)
function openMask(file, done) {
  const wrap = document.createElement('div');
  wrap.className = 'maskwrap';
  document.body.appendChild(wrap);
  const img = new Image();
  const url = URL.createObjectURL(file);
  const close = () => { wrap.remove(); URL.revokeObjectURL(url); };
  img.onerror = () => { close(); alert('この写真は読み込めませんでした'); };
  img.onload = () => {
    const sc = Math.min(1, 1400 / Math.max(img.width, img.height));
    const cw = Math.round(img.width * sc);
    const ch = Math.round(img.height * sc);
    wrap.innerHTML = `<div class="maskhead"><b>名前・ID・生年月日を塗りつぶす</b><div class="small">隠したい所を指でななめになぞると、黒い四角になります。</div></div>
      <canvas width="${cw}" height="${ch}"></canvas>
      <div class="btns maskbtns"><button class="btn" data-m="undo">1つ戻す</button><button class="btn" data-m="cancel">やめる</button><button class="btn primary" data-m="ok">決定</button></div>`;
    const cv = wrap.querySelector('canvas');
    const ctx = cv.getContext('2d');
    const rects = [];
    let cur = null;
    const draw = () => {
      ctx.drawImage(img, 0, 0, cw, ch);
      ctx.fillStyle = '#111';
      for (const r of cur ? [...rects, cur] : rects) ctx.fillRect(r.x, r.y, r.w, r.h);
    };
    const pos = (e) => {
      const b = cv.getBoundingClientRect();
      return { x: ((e.clientX - b.left) * cw) / b.width, y: ((e.clientY - b.top) * ch) / b.height };
    };
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      const q = pos(e);
      cur = { x0: q.x, y0: q.y, x: q.x, y: q.y, w: 0, h: 0 };
    });
    cv.addEventListener('pointermove', (e) => {
      if (!cur) return;
      const q = pos(e);
      cur.x = Math.min(cur.x0, q.x);
      cur.y = Math.min(cur.y0, q.y);
      cur.w = Math.abs(q.x - cur.x0);
      cur.h = Math.abs(q.y - cur.y0);
      draw();
    });
    const end = () => {
      if (cur && cur.w > 4 && cur.h > 4) rects.push(cur);
      cur = null;
      draw();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    wrap.addEventListener('click', (e) => {
      const m = e.target.closest('[data-m]')?.dataset.m;
      if (m === 'undo') { rects.pop(); draw(); }
      if (m === 'cancel') close();
      if (m === 'ok') {
        if (!rects.length && !confirm('塗りつぶしがありません。名前などが写っていないことを確かめましたか?')) return;
        done(cv.toDataURL('image/jpeg', 0.72));
        close();
      }
    });
    draw();
  };
  img.src = url;
}

// ---------- iPhoneのカレンダー(.ics) ----------
let currentIcs = null;
export function showIcs(title, items, filename) {
  if (!items.length) return toast('これから先の期日・予定はありません');
  currentIcs = { text: L.buildIcs(items), filename, items };
  const list = items.map((it) => `${fmt(it.date)} ${it.time} ${it.title}`).join('\n');
  openSheet(title, `<p class="sub">次の${items.length}件を、通知つきでカレンダーに入れます。</p><pre class="draft">${esc(list)}</pre>
    <div class="btns"><button class="btn primary" data-act="icsOpen">カレンダーに入れる</button><button class="btn" data-act="icsShare">共有・ファイルに保存</button>${copyBtn(list, '一覧をコピー')}</div>
    <p class="small" style="margin-top:12px">うまく入らないときは「共有・ファイルに保存」→「"ファイル"に保存」→ ファイルアプリでそのファイルを開く →「すべてを追加」。<a href="#/help/ics" data-act="closeSheet">くわしく</a></p>`);
}
const icsFile = () => new File([currentIcs.text], currentIcs.filename, { type: 'text/calendar' });

// ---------- ボタンの動き ----------
async function patch(pid, fn, { cheerUp = false, keep = false } = {}) {
  const p = byId(pid);
  if (!p) return;
  fn(p);
  await savePatient(p);
  if (cheerUp) cheer();
  if (!keep) render();
}
async function patchReport(pid, fn, keep = false) {
  const id = `${pid}:homeReport`;
  const rec = recordById(id) || { id, patientId: pid, type: 'homeReport', date: today(), data: {} };
  rec.data = rec.data || {};
  fn(rec.data);
  await saveRecord(rec);
  if (!keep) render();
}
Object.assign(actions, {
  goto: (d) => (location.hash = d.href),
  summaryDone: (d) => patch(d.pid, (p) => (p.summaryDone = today()), { cheerUp: true }),
  summaryUndo: (d) => patch(d.pid, (p) => (p.summaryDone = null)),
  reportDone(d) {
    const p = byId(d.pid);
    if (!L.visitDate(p, S.events)) return openEventSheet({ pid: p.id, type: 'homeVisit' });
    patch(d.pid, (x) => (x.homeReportDone = today()), { cheerUp: true });
  },
  reportUndo: (d) => patch(d.pid, (p) => (p.homeReportDone = null)),
  visitNeeded: (d) => patch(d.pid, (p) => (p.homeVisitNeeded = d.v === '1')),
  editPreState(d) {
    const p = byId(d.pid);
    openSheet(`${L.label(p)} 入院前の状態`, `<textarea id="sheetPre" rows="6" placeholder="例:独歩・屋外も自立、階段手すりあり">${esc(p.preState || '')}</textarea>
      <div class="btns"><button class="btn primary block" data-act="savePreState" data-pid="${p.id}" data-from="sheet">保存</button></div>`);
  },
  async savePreState(d) {
    const el = d.from === 'sheet' ? $('#sheetPre') : $('#preState');
    closeSheet();
    await patch(d.pid, (p) => (p.preState = el.value.trim()), { cheerUp: true });
  },
  saveAdl(d) {
    const adl = { ...(byId(d.pid).adl || {}) };
    for (const [k] of L.ADL_ITEMS) if (k !== 'dischargeDate') adl[k] = ($(`#adl-${k}`)?.value || '').trim();
    adl.updatedAt = today();
    patch(d.pid, (p) => {
      p.adl = adl;
      p.adlHistory = [...(p.adlHistory || []), { at: nowIso(), values: adl }].slice(-30);
    }, { cheerUp: true });
  },
  addEvent: (d) => openEventSheet({ pid: d.pid, type: d.type }),
  editEvent: (d) => openEventSheet({ eid: d.eid }),
  async evDone(d) {
    const e = S.events.find((x) => x.id === d.eid);
    e.done = true;
    await saveEvent(e);
    cheer();
    render();
  },
  async deleteEvent(d) {
    if (!confirm('この予定を消しますか?')) return;
    await db.del('events', d.eid);
    S.events = S.events.filter((e) => e.id !== d.eid);
    closeSheet();
    toast('消しました');
    render();
  },
  async archive(d) {
    const p = byId(d.pid);
    if (!confirm(`${L.label(p)} を退院済みにしますか?(お知らせが止まります。あとで戻せます)`)) return;
    p.archived = true;
    p.archivedAt = today();
    await savePatient(p);
    toast('おつかれさまでした。' + praise());
    location.hash = '#/today';
  },
  unarchive: (d) => patch(d.pid, (p) => (p.archived = false)),
  async deletePatient(d) {
    const p = byId(d.pid);
    if (!confirm(`${L.label(p)} のデータ(記録・写真も)をすべて消しますか?元には戻せません。\n(退院した人は「退院済みにする」がおすすめです)`)) return;
    await db.del('patients', p.id);
    for (const e of S.events.filter((x) => x.patientId === p.id)) await db.del('events', e.id);
    for (const r of S.records.filter((x) => x.patientId === p.id)) await deleteRecord(r.id);
    S.patients = S.patients.filter((x) => x.id !== p.id);
    S.events = S.events.filter((x) => x.patientId !== p.id);
    toast('消しました');
    location.hash = '#/today';
  },
  // ボタンで選ぶ(同じものをもう一度押すと外れる)
  setP: (d) => patch(d.pid, (p) => setPath(p, d.path, getPath(p, d.path) === d.v ? '' : d.v)),
  toggleP: (d) => patch(d.pid, (p) => {
    const cur = getPath(p, d.path) || [];
    setPath(p, d.path, cur.includes(d.v) ? cur.filter((x) => x !== d.v) : [...cur, d.v]);
  }),
  placeAdd(d) {
    openSheet(`${T.PLACE_KINDS[d.kind]}を追加`, `<label class="f" for="placeName">行き先の名前</label>
      <input type="text" id="placeName" placeholder="${d.kind === 'super' ? '例:◯◯スーパー' : d.kind === 'hospital' ? '例:◯◯クリニック' : '例:◯◯公園、カラオケ'}">
      <div class="hint">個人の家(親せきの家など)は、名前でなく「娘の家」などにしてください。</div>
      <div class="btns"><button class="btn primary block" data-act="placeSave" data-pid="${d.pid}" data-kind="${d.kind}">追加</button></div>`);
    setTimeout(() => $('#placeName')?.focus(), 50);
  },
  placeSave(d) {
    const name = $('#placeName').value.trim();
    closeSheet();
    patch(d.pid, (p) => {
      p.env = p.env || {};
      p.env.places = [...(p.env.places || []), { id: uid(), kind: d.kind, name, mode: '', minutes: '' }];
    });
  },
  placeDel(d) {
    if (!confirm('この行き先を消しますか?')) return;
    patch(d.pid, (p) => p.env.places.splice(Number(d.i), 1));
  },
  famAdd: (d) => patch(d.pid, (p) => (p.family = [...(p.family || []), { id: uid(), rel: '', kp: false, coop: '', work: '', distance: '' }])),
  famDel(d) {
    if (!confirm('この家族の情報を消しますか?')) return;
    patch(d.pid, (p) => p.family.splice(Number(d.i), 1));
  },
  famKp: (d) => patch(d.pid, (p) => (p.family[Number(d.i)].kp = !p.family[Number(d.i)].kp)),
  // 記録
  dailyNew: (d) => openDaily(d.pid),
  dailyEdit: (d) => openDaily(null, d.id),
  fimNew: (d) => openFim(d.pid, null, d.timing),
  fimEdit: (d) => openFim(null, d.id),
  inbodyNew: (d) => openInbody(d.pid, null, d.timing),
  inbodyEdit: (d) => openInbody(null, d.id),
  async recDel(d) {
    if (!confirm('この記録を消しますか?')) return;
    await deleteRecord(d.id);
    closeSheet();
    toast('消しました');
    render();
  },
  ibPick: () => $('#ibFile').click(),
  ibPhotoDel() {
    pendingPhoto = null;
    $('#ibPhoto').innerHTML = '<div class="sub">写真を外しました(保存で確定)</div>';
  },
  // 書類
  async sumSave(d) {
    await saveRecord({ id: `${d.pid}:summary`, patientId: d.pid, type: 'summary', date: today(), text: $('#sumText').value });
    cheer();
    render();
  },
  sumRegen(d) {
    if (recordById(`${d.pid}:summary`) && !confirm('今の文を消して、最新の入力から下書きを作り直します。よろしいですか?')) return;
    $('#sumText').value = T.summaryDraft(byId(d.pid), S, today());
    toast('作り直しました(「保存」で残ります)');
  },
  copyField(d) {
    const text = $('#' + d.field).value;
    copyText(d.ai ? T.aiPrompt(d.ai, text) : text, d.ai ? 'AIへのお願いの文と一緒にコピーしました' : 'コピーしました');
  },
  repSet: (d) => patchReport(d.pid, (r) => setPath(r, d.path, getPath(r, d.path) === d.v ? '' : d.v)),
  repToggle: (d) => patchReport(d.pid, (r) => {
    const cur = getPath(r, d.path) || [];
    setPath(r, d.path, cur.includes(d.v) ? cur.filter((x) => x !== d.v) : [...cur, d.v]);
  }),
  // カレンダー
  icsPatient(d) {
    const p = byId(d.pid);
    showIcs(`${L.label(p)} をカレンダーへ`, L.calendarItemsForPatient(p, S, today()), `PTサポート_${p.initials}_${today()}.ics`);
  },
  icsOpen() {
    if (!currentIcs) return;
    const url = URL.createObjectURL(icsFile());
    location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
  async icsShare() {
    if (!currentIcs) return;
    const r = await shareFile(icsFile());
    if (!r) downloadFile(icsFile());
  },
});

Object.assign(changes, {
  inputP(d, el) {
    const val = d.num ? (el.value === '' ? '' : Math.max(0, Number(el.value) || 0)) : el.value.trim();
    patch(d.pid, (p) => setPath(p, d.path, val), { keep: !d.render });
  },
  town(d, el) {
    const v = el.value.trim();
    if (/[0-9０-９]|番地|号$|-/.test(v)) {
      alert('番地や数字は入れないでください。「◯◯市◯◯町」までにしてください。');
      el.value = (byId(d.pid).env || {}).town || '';
      return;
    }
    patch(d.pid, (p) => { p.env = p.env || {}; p.env.town = v; });
  },
  repInput: (d, el) => patchReport(d.pid, (r) => setPath(r, d.path, el.value.trim())),
  fimLive(d, el) {
    const fd = new FormData(el);
    const scores = {};
    for (const [k] of [...T.FIM_MOTOR, ...T.FIM_COG]) if (fd.get(`s_${k}`)) scores[k] = Number(fd.get(`s_${k}`));
    const tt = T.fimTotal(scores);
    $('#fimTotal').textContent = `合計 ${tt.total}点(運動${tt.motor}/認知${tt.cog})${tt.complete ? '' : ` ・あと${18 - tt.filled}項目`}`;
  },
  ibFile(d, el) {
    const f = el.files[0];
    el.value = '';
    if (!f) return;
    openMask(f, (dataUrl) => {
      pendingPhoto = dataUrl;
      $('#ibPhoto').innerHTML = `<img class="photo" src="${dataUrl}" alt="InBodyの写真">`;
    });
  },
});

// ---------- フォームの保存 ----------
document.addEventListener('submit', async (ev) => {
  const f = ev.target;
  const kind = f.dataset.form;
  if (!['event', 'daily', 'fim', 'inbody'].includes(kind)) return;
  ev.preventDefault();
  const fd = new FormData(f);
  const date = fd.get('date');
  if (!isDate(date)) return alert('日にちを入れてください');
  if (kind === 'event') {
    const type = fd.get('type');
    const old = f.dataset.eid ? S.events.find((x) => x.id === f.dataset.eid) : null;
    const e = old ? { ...old } : { id: uid(), patientId: f.dataset.pid, createdAt: nowIso() };
    e.type = type;
    e.title = type === 'other' ? String(fd.get('title') || '').trim() || '予定' : '';
    e.date = date;
    e.time = fd.get('time') || '';
    e.done = fd.get('done') === 'on';
    if (type === 'homeVisit') {
      const lines = String(fd.get('checklist') || '').split('\n').map((s) => s.trim()).filter(Boolean);
      const prev = Object.fromEntries((old?.checklist || []).map((c) => [c.text, c.done]));
      e.checklist = lines.map((text) => ({ text, done: !!prev[text] }));
    } else e.checklist = null;
    await saveEvent(e);
    closeSheet();
    toast('予定を保存しました。' + praise());
    render();
    return;
  }
  const pid = f.dataset.pid;
  const base = { id: f.dataset.id || uid(), patientId: pid, type: kind, date };
  if (kind === 'daily') {
    await saveRecord({ ...base, mood: fd.get('mood') || '', tags: fd.getAll('tags'), memo: String(fd.get('memo') || '').trim() });
  } else if (kind === 'fim') {
    const scores = {};
    for (const [k] of [...T.FIM_MOTOR, ...T.FIM_COG]) if (fd.get(`s_${k}`)) scores[k] = Number(fd.get(`s_${k}`));
    const tt = T.fimTotal(scores);
    if (!tt.filled) return alert('点数を1つ以上選んでください');
    if (!tt.complete && !confirm(`まだ${18 - tt.filled}項目が入っていません。このまま保存しますか?`)) return;
    const timing = fd.get('timing') || 'mid';
    await saveRecord({ ...base, timing, scores });
    if (timing === 'admit') await patch(pid, (p) => (p.fimAdmit = p.fimAdmit || date), { keep: true });
  } else if (kind === 'inbody') {
    const n = (k) => (fd.get(k) === '' ? '' : Number(fd.get(k)));
    const timing = fd.get('timing') || 'mid';
    await saveRecord({ ...base, timing, weight: n('weight'), smm: n('smm'), pbf: n('pbf'), smi: n('smi'), photo: pendingPhoto || '' });
    pendingPhoto = null;
    if (timing === 'admit') await patch(pid, (p) => (p.inbodyAdmit = p.inbodyAdmit || date), { keep: true });
  }
  closeSheet();
  toast('記録しました。' + praise());
  render();
});
