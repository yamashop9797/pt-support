// 画面と操作(データの計算は logic.js、保存は db.js)
import * as db from './db.js';
import { todayStr, addDays, diffDays, fmt, fmtLong, monthKey, addMonths, weekStart, weekday, isDate, WD, parse } from './dates.js';
import * as L from './logic.js';
import { dailyMessage, praise, greeting } from './messages.js';

export const APP_VERSION = '1.0.0';

// ---------- 状態 ----------
const S = {
  settings: null, patients: [], events: [], holidays: new Set(), flags: new Set(), plans: {},
  ui: { mineOnly: true, sortBy: 'discharge' },
};
// 動作確認用:URLに ?today=2026-12-01 を付けると「今日」をずらせる
const fakeToday = new URLSearchParams(location.search).get('today');
const today = () => (fakeToday && isDate(fakeToday) ? fakeToday : todayStr());

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const nowIso = () => new Date().toISOString();
const byId = (id) => S.patients.find((p) => p.id === id);
const texts = {}; // コピー用の文

async function load() {
  const saved = (await db.get('kv', 'settings')) || {};
  const def = L.defaultSettings();
  S.settings = { ...def, ...saved, adlTable: saved.adlTable || def.adlTable, visitChecklist: saved.visitChecklist || def.visitChecklist };
  S.patients = await db.getAll('patients');
  S.events = await db.getAll('events');
  S.holidays = new Set((await db.getAll('holidays')).map((h) => h.date));
  S.flags = new Set((await db.getAll('flags')).map((f) => f.key));
  S.plans = Object.fromEntries((await db.getAll('plans')).map((p) => [p.month, p]));
}
const saveSettings = () => db.put('kv', S.settings);
async function savePatient(p) {
  p.updatedAt = nowIso();
  await db.put('patients', p);
  const i = S.patients.findIndex((x) => x.id === p.id);
  if (i >= 0) S.patients[i] = p; else S.patients.push(p);
}
async function saveEvent(e) {
  await db.put('events', e);
  const i = S.events.findIndex((x) => x.id === e.id);
  if (i >= 0) S.events[i] = e; else S.events.push(e);
}
async function setFlag(key) {
  S.flags.add(key);
  await db.put('flags', { key, at: nowIso() });
}
async function savePlan(pl) {
  S.plans[pl.month] = pl;
  await db.put('plans', pl);
}

// ---------- 小さな部品 ----------
let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}
const cheer = () => toast(praise());

function openSheet(title, html) {
  const w = $('#sheet');
  w.innerHTML = `<div class="sheet" role="dialog"><div class="sheet-head"><h3>${esc(title)}</h3><button class="x" data-act="closeSheet" aria-label="閉じる">✕</button></div>${html}</div>`;
  w.hidden = false;
}
function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheet').innerHTML = '';
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('コピーしました');
}
function copyBtn(text, labelText = 'コピー') {
  const k = 'c' + Object.keys(texts).length;
  texts[k] = text;
  return `<button class="btn" data-act="copy" data-k="${k}">${labelText}</button>`;
}
const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const leftText = (p, t) => {
  if (!isDate(p.dischargeDate)) return { text: '退院予定日 未入力', lv: 'green' };
  const n = diffDays(p.dischargeDate, t);
  if (n > 0) return { text: `退院まであと${n}日`, lv: n <= 7 ? 'red' : n <= 30 ? 'yellow' : 'green' };
  if (n === 0) return { text: '今日が退院日', lv: 'red' };
  return { text: `退院予定日を${-n}日過ぎています`, lv: 'red' };
};
function dueLabel(n, t) {
  if (!n.due) return '';
  const d = diffDays(n.due, t);
  const txt = d < 0 ? `期限を${-d}日過ぎています` : d === 0 ? '今日まで' : d === 1 ? `明日まで(${fmt(n.due)})` : d <= 6 ? `今週中(${fmt(n.due)}まで)` : `${fmt(n.due)}まで`;
  return `<span class="n-due">${txt}</span>`;
}

// ---------- 画面:今日 ----------
function viewToday() {
  const t = today();
  const notices = L.computeNotices(S, t);
  const big = notices.filter((n) => n.big);
  const rest = notices.filter((n) => !n.big);
  const fresh = L.activePatients(S)
    .map((p) => ({ p, list: L.newPatientChecklist(p, S.events) }))
    .filter((x) => x.list.some((c) => !c.done));
  const name = S.settings.name ? `${esc(S.settings.name)}さん、` : '';
  let h = `<div class="hello">${name}${greeting()}</div><h1>今日やること</h1><div class="sub">${fmtLong(t)}${S.holidays.has(t) ? ' <span class="tag holiday-tag">お休み</span>' : ''}</div>
  <div class="card word">${esc(dailyMessage(t))}</div>`;

  if (!S.patients.filter((p) => !p.archived).length) {
    h += `<div class="card"><h3>はじめに</h3><p>担当の患者さんを登録すると、期日やお知らせを自動で出します。</p>
      <div class="btns"><a class="btn primary" href="#/patient-new">患者さんを登録する</a></div></div>`;
  }
  for (const n of big) h += bigCard(n, t);
  for (const { p, list } of fresh) {
    h += `<div class="card"><div class="n-title">新しく担当:${esc(L.label(p))}${p.room ? ` <span class="sub">${esc(p.room)}</span>` : ''}</div>
      <div class="sub">終わるまでここに出ます</div>${checklistRows(p, list)}</div>`;
  }
  for (const n of rest) h += noticeCard(n, t);
  if (!notices.length && !fresh.length && S.patients.length) h += `<div class="empty">今日やることはありません。<br>いい一日を過ごしてください。</div>`;
  return h;
}
function checklistRows(p, list) {
  return list
    .map((c) => {
      const act = c.key === 'firstConf' ? `data-act="addEvent" data-pid="${p.id}" data-type="firstConf"`
        : c.key === 'preState' ? `data-act="editPreState" data-pid="${p.id}"`
        : `data-act="toggleAdmit" data-pid="${p.id}" data-key="${c.key}"`;
      return `<div class="check ${c.done ? 'done' : ''}" ${c.done && c.key !== 'inbodyAdmit' && c.key !== 'fimAdmit' ? '' : act}><span class="box"></span><span class="ctext">${esc(c.label)}</span>${c.done ? '' : '<span class="chev">›</span>'}</div>`;
    })
    .join('');
}
function bigCard(n, t) {
  return `<div class="big-card s${n.strength}"><div class="n-title">${esc(n.title)}</div><div class="n-body">${esc(n.body)}</div>
    <div class="btns"><button class="btn" data-act="summaryDone" data-pid="${n.pid}">サマリーができた</button><a class="btn" href="#/patient/${n.pid}">患者ページ</a></div></div>`;
}
function noticeCard(n, t) {
  let extra = '';
  let btns = '';
  if (n.draft) extra += `<pre class="draft">${esc(n.draft)}</pre>`;
  if (n.checklist) {
    extra += `<div style="margin-top:8px"><div class="small">持ち物チェック</div>${n.checklist
      .map((c, i) => `<div class="check ${c.done ? 'done' : ''}" data-act="evCheck" data-eid="${n.eventId}" data-i="${i}"><span class="box"></span><span class="ctext">${esc(c.text)}</span></div>`)
      .join('')}</div>`;
  }
  switch (n.kind) {
    case 'visitAdjust':
      btns = `<button class="btn primary" data-act="addEvent" data-pid="${n.pid}" data-type="homeVisit">訪問日を入れる</button>`;
      break;
    case 'visitReport':
      btns = `<button class="btn primary" data-act="reportDone" data-pid="${n.pid}">報告書ができた</button>`;
      break;
    case 'adl':
      btns = `${copyBtn(n.draft, '下書きをコピー')}<a class="btn" href="#/patient/${n.pid}?adl">ADLを更新</a><button class="btn" data-act="flag" data-key="${n.key}">済み</button>`;
      break;
    case 'event':
      btns = `${n.draft ? copyBtn(n.draft, '下書きをコピー') + `<a class="btn" href="#/patient/${n.pid}?adl">ADLを更新</a>` : ''}${n.checklist ? `<button class="btn" data-act="editEvent" data-eid="${n.eventId}">持ち物を編集</button>` : ''}<button class="btn" data-act="flag" data-key="${n.key}">確認した</button>`;
      break;
    case 'planSelect':
      btns = `<a class="btn primary" href="#/plan/${n.month}">対象者を選ぶ</a>`;
      break;
    case 'planExplain':
      btns = `<button class="btn primary" data-act="planExplained" data-month="${n.month}" data-pid="${n.pid}">説明済み</button>`;
      break;
    case 'backup':
      btns = `<button class="btn primary" data-act="backup">今すぐバックアップ</button>`;
      break;
  }
  if (n.pid && n.kind !== 'adl' && n.kind !== 'event') btns += `<a class="btn" href="#/patient/${n.pid}">患者ページ</a>`;
  return `<div class="card notice lv-${n.level}"><div class="n-title">${esc(n.title)}</div>${n.body ? `<div class="n-body">${esc(n.body)}</div>` : ''}${dueLabel(n, t)}${extra}<div class="btns">${btns}</div></div>`;
}

// ---------- 画面:今週 ----------
function viewWeek(offset) {
  const t = today();
  const start = addDays(weekStart(t), 7 * offset);
  const end = addDays(start, 6);
  const ag = L.agenda(S, start, end);
  let h = `<h1>今週の予定</h1><div class="sub">${fmt(start)} 〜 ${fmt(end)}</div>
    <div class="btns"><a class="btn" href="#/week/${offset - 1}">‹ 前の週</a>${offset ? `<a class="btn" href="#/week/0">今週</a>` : ''}<a class="btn" href="#/week/${offset + 1}">次の週 ›</a></div>`;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const items = ag[d] || [];
    const off = S.holidays.has(d);
    h += `<div class="card day ${d === t ? 'today' : ''}"><div class="day-h"><b>${fmt(d)}</b>${d === t ? '<span class="tag">今日</span>' : ''}${off ? '<span class="tag holiday-tag">お休み</span>' : ''}</div>`;
    if (!items.length) h += `<div class="small" style="margin-top:4px">予定はありません</div>`;
    for (const it of items) {
      const inner = `<span class="t">${esc(it.time || '')}</span><span class="k-${it.kind}">${esc(it.text)}</span>`;
      h += `<div class="ag">${it.pid ? `<a href="#/patient/${it.pid}" style="display:flex;gap:10px">${inner}</a>` : it.kind === 'plan' ? `<a href="#/plan/${monthKey(addDays(d, 10))}" style="display:flex;gap:10px">${inner}</a>` : inner}</div>`;
    }
    h += `</div>`;
  }
  h += `<div class="card"><h3>iPhoneのカレンダーに入れる</h3><p class="sub">担当の人全員の期日・予定と、毎月の計画書のお知らせをまとめて入れます(通知つき)。</p>
    <div class="btns"><button class="btn primary" data-act="icsAll">まとめてカレンダーへ</button></div></div>`;
  return h;
}

// ---------- 画面:患者一覧 ----------
function viewPatients() {
  const t = today();
  let list = S.patients.filter((p) => !p.archived);
  if (S.ui.mineOnly) list = list.filter((p) => p.mine !== false);
  list.sort((a, b) =>
    S.ui.sortBy === 'discharge'
      ? (a.dischargeDate || '9999').localeCompare(b.dischargeDate || '9999')
      : (L.roomKey(a.room) || '9999').localeCompare(L.roomKey(b.room) || '9999'),
  );
  let h = `<div class="topbar"><h1>患者</h1><a class="btn primary" href="#/patient-new">+ 追加</a></div>
    <div class="seg"><button class="${S.ui.mineOnly ? 'on' : ''}" data-act="ui" data-k="mineOnly" data-v="1">担当のみ</button><button class="${S.ui.mineOnly ? '' : 'on'}" data-act="ui" data-k="mineOnly" data-v="0">すべて</button></div>
    <div class="seg"><button class="${S.ui.sortBy === 'discharge' ? 'on' : ''}" data-act="ui" data-k="sortBy" data-v="discharge">退院予定順</button><button class="${S.ui.sortBy === 'room' ? 'on' : ''}" data-act="ui" data-k="sortBy" data-v="room">部屋番号順</button></div>`;
  if (!list.length) h += `<div class="empty">まだ登録されていません。<br>右上の「+ 追加」から登録できます。</div>`;
  for (const p of list) {
    const lt = leftText(p, t);
    const pr = L.progress(p, S, t);
    h += `<a class="card pcard" href="#/patient/${p.id}"><div class="row"><span class="ini">${esc(L.label(p))}</span><span class="room">${esc(p.room || '')}</span>${p.mine === false ? '<span class="tag">担当外</span>' : ''}</div>
      <div class="left lv-${lt.lv}">${lt.text}</div>${dots(pr)}</a>`;
  }
  h += `<div class="btns"><a class="btn" href="#/archive">退院済みの人</a></div>`;
  return h;
}
function dots(pr) {
  const one = (k, name) => `<span class="dot ${pr[k]}"><i></i>${name}${pr[k] === 'none' ? (k === 'plan' ? '(今月なし)' : '(なし)') : ''}</span>`;
  return `<div class="dots">${one('plan', '計画書')}${one('homeVisit', '家屋調査')}${one('summary', 'サマリー')}</div>`;
}

// ---------- 画面:患者ページ ----------
function viewPatient(id, focus) {
  const p = byId(id);
  if (!p) return `<a class="back" href="#/patients">‹ 患者</a><div class="empty">見つかりませんでした</div>`;
  const t = today();
  const lt = leftText(p, t);
  const rem = L.remainingFor(p, S, t);
  const evs = S.events.filter((e) => e.patientId === p.id).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const v = L.visitDate(p, S.events);
  const ps = L.planState(p, S.plans, t);
  const a = p.adl || {};
  const conf = L.adlWeekdays(p.room, S.settings.adlTable);

  let h = `<div class="topbar"><a class="back" href="${p.archived ? '#/archive' : '#/patients'}">‹ ${p.archived ? '退院済み' : '患者'}</a><a class="btn" href="#/patient-edit/${p.id}">編集</a></div>
    <div class="pcard"><div class="row"><span class="ini">${esc(L.label(p))}</span><span class="room">${esc(p.room || '')}</span>${p.archived ? '<span class="tag">退院済み</span>' : ''}</div>
    <div class="left lv-${lt.lv}">${lt.text}</div><div class="sub">入院 ${fmt(p.admitDate) || '未入力'} ・ 退院予定 ${fmt(p.dischargeDate) || '未入力'}</div></div>`;

  h += `<div class="card"><h3>残っていること</h3>${
    rem.length ? rem.map((r) => `<div class="check" ${remAct(p, r)}><span class="box"></span><span class="ctext">${esc(r.label)}</span><span class="chev">›</span></div>`).join('') : '<div class="sub">残っていることはありません。すばらしいです!</div>'
  }</div>`;

  h += `<div class="card"><h3>入院時のこと</h3>${checklistRows(p, L.newPatientChecklist(p, S.events))}
    <label class="f" for="preState">入院前の状態</label><textarea id="preState" placeholder="例:独歩・屋外も自立、階段手すりあり">${esc(p.preState || '')}</textarea>
    <div class="btns"><button class="btn" data-act="savePreState" data-pid="${p.id}">保存</button></div></div>`;

  h += `<div class="card"><h3>進み具合</h3>
    <div class="list-row"><span>計画書(${Number(t.slice(5, 7))}月)</span><span>${ps === 'done' ? '説明済み' : ps === 'todo' ? `<button class="btn" data-act="planExplained" data-month="${monthKey(t)}" data-pid="${p.id}">説明済みにする</button>` : `<a href="#/plan/${monthKey(t)}">今月は対象外</a>`}</span></div>
    <div class="list-row"><span>家屋調査</span><span>${
      p.homeVisitNeeded === false ? `なし <button class="btn" data-act="visitNeeded" data-pid="${p.id}" data-v="1">ありにする</button>`
      : !v ? `<button class="btn" data-act="addEvent" data-pid="${p.id}" data-type="homeVisit">訪問日を入れる</button>`
      : p.homeReportDone ? `報告書 済 <button class="btn" data-act="reportUndo" data-pid="${p.id}">戻す</button>`
      : `${fmt(v)}訪問 <button class="btn" data-act="reportDone" data-pid="${p.id}">報告書ができた</button>`
    }</span></div>
    ${p.homeVisitNeeded !== false && !v ? `<div class="small" style="text-align:right"><a href="#" data-act="visitNeeded" data-pid="${p.id}" data-v="0">この人は家屋調査なし</a></div>` : ''}
    <div class="list-row"><span>サマリー</span><span>${p.summaryDone ? `済(${fmt(p.summaryDone)}) <button class="btn" data-act="summaryUndo" data-pid="${p.id}">戻す</button>` : `<button class="btn" data-act="summaryDone" data-pid="${p.id}">サマリーができた</button>`}</span></div>
    <div class="small">サマリーは退院7日前から「今日」の画面の一番上に出ます。</div></div>`;

  h += `<div class="card"><div class="topbar"><h3 style="margin:0">予定</h3><button class="btn" data-act="addEvent" data-pid="${p.id}">+ 追加</button></div>${
    evs.length ? evs.map((e) => `<div class="list-row"><a href="#" data-act="editEvent" data-eid="${e.id}"><b>${fmt(e.date)}</b> ${esc(e.time || '')} ${esc(e.type === 'other' ? e.title || '予定' : L.EVENT_TYPES[e.type])}</a><span class="chev">›</span></div>`).join('') : '<div class="sub">まだありません(初回カンファ・退院前カンファ・家屋訪問など)</div>'
  }</div>`;

  h += `<div class="card" id="adl"><h3>病棟ADLカンファ用の8項目</h3>
    <div class="sub">${conf.length ? `この部屋のカンファは毎週 ${conf.map((w) => WD[w]).join('・')}曜日(前日の朝にお知らせ)` : '部屋番号がカンファの表にありません(設定で変えられます)'}</div>
    ${L.ADL_ITEMS.map(([k, name]) => k === 'dischargeDate'
      ? `<label class="f">${name}</label><div class="sub">${p.dischargeDate ? fmt(p.dischargeDate) + '(退院予定日から自動)' : '退院予定日を入れると自動で入ります'}</div>`
      : `<div class="adl-row"><label class="f" for="adl-${k}">${name}</label><input type="text" id="adl-${k}" value="${esc(a[k] || '')}"></div>`).join('')}
    <div class="hint">${a.updatedAt ? `最後の更新:${fmtLong(a.updatedAt)}` : 'まだ更新していません'}</div>
    <div class="btns"><button class="btn primary" data-act="saveAdl" data-pid="${p.id}">更新する</button>${copyBtn(L.adlDraft(p, t, null), '下書きをコピー')}</div></div>`;

  if (p.memo) h += `<div class="card"><h3>メモ</h3><div style="white-space:pre-wrap">${esc(p.memo)}</div></div>`;

  h += `<div class="card"><h3>iPhoneのカレンダーに入れる</h3><p class="sub">この人の期日と予定を、通知つきでカレンダーに入れます。予定名はイニシャルだけです。</p>
    <div class="btns"><button class="btn primary" data-act="icsPatient" data-pid="${p.id}">カレンダーへ</button></div></div>`;

  h += `<div class="btns" style="margin-top:20px">${p.archived
    ? `<button class="btn" data-act="unarchive" data-pid="${p.id}">担当中に戻す</button>`
    : `<button class="btn" data-act="archive" data-pid="${p.id}">退院済みにする</button>`}<button class="btn danger" data-act="deletePatient" data-pid="${p.id}">削除</button></div>`;

  if (focus === 'adl') setTimeout(() => $('#adl')?.scrollIntoView({ behavior: 'smooth' }), 50);
  return h;
}
function remAct(p, r) {
  switch (r.key) {
    case 'firstConf': return `data-act="addEvent" data-pid="${p.id}" data-type="firstConf"`;
    case 'visitDate': return `data-act="addEvent" data-pid="${p.id}" data-type="homeVisit"`;
    case 'preState': return `data-act="editPreState" data-pid="${p.id}"`;
    case 'inbodyAdmit':
    case 'fimAdmit': return `data-act="toggleAdmit" data-pid="${p.id}" data-key="${r.key}"`;
    case 'plan': return `data-act="planExplained" data-month="${monthKey(today())}" data-pid="${p.id}"`;
    case 'homeReport': return `data-act="reportDone" data-pid="${p.id}"`;
    case 'summary': return `data-act="summaryDone" data-pid="${p.id}"`;
  }
  return '';
}

// ---------- 画面:患者の登録・編集 ----------
function viewPatientForm(id) {
  const p = id ? byId(id) : null;
  const v = p || { initials: '', room: '', admitDate: today(), dischargeDate: '', memo: '', mine: true, homeVisitNeeded: true };
  return `<div class="topbar"><a class="back" href="${p ? `#/patient/${p.id}` : '#/patients'}">‹ もどる</a></div>
  <h1>${p ? '患者さんを編集' : '患者さんを登録'}</h1>
  <form class="card" data-form="patient" data-id="${p ? p.id : ''}">
    <label class="f" for="initials">イニシャル・あだ名</label>
    <input type="text" id="initials" name="initials" maxlength="8" value="${esc(v.initials)}" placeholder="例:A、K.T" required autocomplete="off">
    <div class="warn-hint">名前は入れないでください(イニシャルやあだ名だけ)</div>
    <label class="f" for="room">部屋番号</label>
    <input type="text" id="room" name="room" inputmode="numeric" value="${esc(v.room)}" placeholder="例:221">
    <label class="f" for="admitDate">入院日</label>
    <input type="date" id="admitDate" name="admitDate" value="${esc(v.admitDate)}">
    <label class="f" for="dischargeDate">退院予定日</label>
    <input type="date" id="dischargeDate" name="dischargeDate" value="${esc(v.dischargeDate)}">
    <div class="hint">変えると、お知らせと期日を自動で計算し直します。</div>
    <label class="f" for="memo">メモ</label>
    <textarea id="memo" name="memo" placeholder="名前など個人が分かることは書かないでください">${esc(v.memo)}</textarea>
    <label class="toggle"><input type="checkbox" name="mine" ${v.mine !== false ? 'checked' : ''}> 自分の担当</label>
    <label class="toggle"><input type="checkbox" name="homeVisitNeeded" ${v.homeVisitNeeded !== false ? 'checked' : ''}> 家屋調査あり</label>
    <div class="btns"><button class="btn primary block" type="submit">保存</button></div>
  </form>`;
}

// ---------- 画面:カレンダー(休みの登録) ----------
function viewCalendar(mk) {
  const t = today();
  mk = mk || monthKey(t);
  const first = mk + '-01';
  const last = addDays(addMonths(mk, 1) + '-01', -1);
  const ag = L.agenda(S, first, last);
  let h = `<h1>カレンダー</h1><div class="sub">日にちをタップすると「休み」になります(もう一度タップで戻ります)。お知らせが休みの日に当たるときは、前の出勤日に出します。</div>
  <div class="topbar" style="margin-top:10px"><a class="btn" href="#/calendar/${addMonths(mk, -1)}">‹</a><b style="font-size:20px">${Number(mk.slice(0, 4))}年${Number(mk.slice(5))}月</b><a class="btn" href="#/calendar/${addMonths(mk, 1)}">›</a></div>
  <div class="card calcard"><div class="cal">${WD.map((w, i) => `<div class="wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`).join('')}`;
  for (let i = 0; i < weekday(first); i++) h += `<div class="c empty"></div>`;
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const off = S.holidays.has(d);
    const n = (ag[d] || []).length;
    const w = weekday(d);
    h += `<button class="c ${off ? 'off' : ''} ${d === t ? 'today' : ''} ${w === 0 ? 'sun' : w === 6 ? 'sat' : ''}" data-act="toggleHoliday" data-date="${d}"><span>${Number(d.slice(8))}</span>${off ? '<span class="o">休</span>' : ''}<span class="ds">${'<i></i>'.repeat(Math.min(n, 3))}</span></button>`;
  }
  h += `</div></div>`;
  const days = Object.keys(ag).sort();
  h += `<h2>この月の予定</h2>`;
  if (!days.length) h += `<div class="sub" style="margin:0 4px">予定はありません</div>`;
  for (const d of days) {
    h += `<div class="card"><b>${fmt(d)}</b>${S.holidays.has(d) ? ' <span class="tag holiday-tag">お休み</span>' : ''}${ag[d]
      .map((it) => `<div class="ag"><span class="t">${esc(it.time || '')}</span>${it.pid ? `<a href="#/patient/${it.pid}" class="k-${it.kind}">${esc(it.text)}</a>` : `<span>${esc(it.text)}</span>`}</div>`)
      .join('')}</div>`;
  }
  return h;
}

// ---------- 画面:計画書の対象者 ----------
function viewPlan(mk) {
  const pl = S.plans[mk] || { month: mk, selected: false, targets: [], explained: [] };
  const list = L.activePatients(S);
  const m = Number(mk.slice(5));
  let h = `<div class="topbar"><a class="back" href="#/today">‹ 今日</a></div><h1>${m}月の計画書</h1>
    <div class="sub">今月計画書を作る人にチェックを入れて「決定」を押してください。説明が済んだら「説明済み」にします。</div>
    <div class="card">`;
  if (!list.length) h += `<div class="sub">担当の人がいません</div>`;
  for (const p of list) {
    const on = pl.targets.includes(p.id);
    const ex = pl.explained.includes(p.id);
    h += `<div class="check ${on ? 'done' : ''}" data-act="planToggle" data-month="${mk}" data-pid="${p.id}"><span class="box"></span><span class="ctext" style="text-decoration:none;color:inherit">${esc(L.label(p))} ${esc(p.room || '')}</span>${
      on ? (ex ? '<span class="tag">説明済み</span>' : `<button class="btn" data-act="planExplained" data-month="${mk}" data-pid="${p.id}">説明済み</button>`) : ''
    }</div>`;
  }
  h += `</div><div class="btns"><button class="btn primary block" data-act="planDecide" data-month="${mk}">${pl.selected ? '決定済み(変えたら押し直し)' : '決定'}</button></div>`;
  return h;
}

// ---------- 画面:退院済み ----------
function viewArchive() {
  const list = S.patients.filter((p) => p.archived).sort((a, b) => (b.dischargeDate || '').localeCompare(a.dischargeDate || ''));
  let h = `<div class="topbar"><a class="back" href="#/patients">‹ 患者</a></div><h1>退院済みの人</h1><div class="card">`;
  if (!list.length) h += `<div class="sub">まだいません</div>`;
  for (const p of list) h += `<div class="list-row"><a href="#/patient/${p.id}"><b>${esc(L.label(p))}</b> ${esc(p.room || '')} <span class="sub">退院 ${fmt(p.dischargeDate)}</span></a><span class="chev">›</span></div>`;
  return h + `</div>`;
}

// ---------- 画面:設定 ----------
function viewSettings() {
  const s = S.settings;
  const floors = s.adlTable.floors;
  let h = `<h1>設定</h1>
  <div class="card"><label class="f" for="setName">呼び名</label><input type="text" id="setName" value="${esc(s.name)}" placeholder="例:ゆう">
    <div class="hint">「今日」の画面のあいさつに使います。</div>
    <label class="f" for="setLock">自動でロックするまで(何もしない時間)</label>
    <select id="setLock">${[1, 3, 5, 10, 30].map((m) => `<option value="${m}" ${s.lockMinutes == m ? 'selected' : ''}>${m}分</option>`).join('')}</select>
    <label class="f" for="setTime">カレンダーのお知らせ時刻</label><input type="time" id="setTime" value="${esc(s.notifyTime)}">
    <div class="hint">iPhoneのカレンダーに入れる予定の通知時刻です。</div>
    <div class="btns"><button class="btn primary" data-act="saveBasic">保存</button><button class="btn" data-act="changePin">暗証番号を変える</button></div></div>

  <h2>病棟ADLカンファの曜日</h2>
  <div class="card"><div class="sub">部屋番号を「,」で区切って入れます。部屋番号から曜日を自動で決めます。</div>
    ${floors.map((f, fi) => `<div style="margin-top:14px"><input type="text" data-floor="${fi}" data-k="name" value="${esc(f.name)}" style="font-weight:700">
      ${[1, 2, 3, 4, 5, 6, 0].map((w) => `<div style="display:flex;align-items:center;gap:10px;margin-top:6px"><span style="width:2em">${WD[w]}</span><input type="text" data-floor="${fi}" data-k="${w}" value="${esc(f.days[w] || '')}" inputmode="numeric"></div>`).join('')}</div>`).join('')}
    <div class="btns"><button class="btn primary" data-act="saveAdlTable">保存</button><button class="btn" data-act="addFloor">階を追加</button></div></div>

  <h2>家屋訪問の持ち物</h2>
  <div class="card"><div class="sub">1行に1つ。新しく家屋訪問を入れるときの初めの形です(訪問ごとにも変えられます)。</div>
    <textarea id="setVisit" rows="5">${esc(s.visitChecklist.join('\n'))}</textarea>
    <div class="btns"><button class="btn primary" data-act="saveVisitList">保存</button></div></div>

  <h2>バックアップ(機種変更のとき)</h2>
  <div class="card"><div class="sub">データはこのiPhoneの中だけにあります。月に1回、書き出して「ファイル」アプリやiCloudに保存しておくと安心です。</div>
    <p>前回のバックアップ:<b>${s.lastBackupAt ? fmtLong(s.lastBackupAt.slice(0, 10)) : 'まだ'}</b></p>
    <div class="btns"><button class="btn primary" data-act="backup">書き出す</button><button class="btn" data-act="restore">読み込む</button></div>
    <input type="file" id="restoreFile" accept=".json,application/json" hidden></div>

  <h2>iPhoneのカレンダー</h2>
  <div class="card"><div class="btns" style="margin-top:0"><button class="btn" data-act="icsAll">全員の期日・予定を入れる</button><button class="btn" data-act="icsPlans">毎月の計画書のお知らせを入れる</button></div></div>

  <h2>使い方</h2>
  <div class="card">
    <div class="list-row"><a href="#/help/home">ホーム画面に追加する</a><span class="chev">›</span></div>
    <div class="list-row"><a href="#/help/shortcut">毎朝アプリを開く(ショートカット)</a><span class="chev">›</span></div>
    <div class="list-row"><a href="#/help/ics">カレンダーにうまく入らないとき</a><span class="chev">›</span></div>
    <div class="list-row"><a href="#/help/backup">バックアップと機種変更</a><span class="chev">›</span></div>
    <div class="list-row"><a href="#/archive">退院済みの人</a><span class="chev">›</span></div>
  </div>

  <h2>そのほか</h2>
  <div class="card"><button class="btn" data-act="lockNow">今すぐロック</button>
    <div class="btns"><button class="btn danger" data-act="wipe">すべてのデータを消す</button></div>
    <div class="small" style="margin-top:12px">バージョン ${APP_VERSION}・データはこの端末の中だけに保存され、外には送られません。</div></div>`;
  return h;
}

// ---------- 画面:使い方 ----------
function viewHelp(topic) {
  const back = `<div class="topbar"><a class="back" href="#/settings">‹ 設定</a></div>`;
  const url = location.origin + location.pathname;
  const pages = {
    home: `<h1>ホーム画面に追加</h1><div class="card"><ol class="steps">
      <li>iPhoneの<b>Safari</b>でこのアプリのページを開きます。<br><span class="small">${esc(url)}</span></li>
      <li>画面の下(または上)の<b>共有ボタン</b>(四角から矢印が出ているマーク)を押します。</li>
      <li>下にずらして<b>「ホーム画面に追加」</b>を押します。</li>
      <li>名前はそのまま「PTサポート」で<b>「追加」</b>を押します。</li>
      <li>これからは、ホーム画面のアイコンから開いてください。電波がなくても動きます。</li></ol>
      <p class="small">※Safariで開いたときと、ホーム画面から開いたときでは、データの置き場所が別になります。ふだんは<b>ホーム画面のアイコン</b>から使ってください。</p></div>`,
    shortcut: `<h1>毎朝アプリを開く</h1><div class="card"><p>iPhoneの「ショートカット」アプリで、決まった時間にお知らせを出せます。</p><ol class="steps">
      <li>「ショートカット」アプリを開き、下の<b>「オートメーション」</b>を押します。</li>
      <li>右上の<b>「+」</b>→<b>「時刻」</b>を選びます。</li>
      <li>時刻(例:7:30)を決め、<b>「毎日」</b>(出勤日だけなら「毎週」で曜日を選ぶ)にします。</li>
      <li><b>「すぐに実行」</b>を選び、「次へ」を押します。</li>
      <li>アクションの検索で<b>「Appを開く」</b>を選び、「App」のところで<b>「PTサポート」</b>を選びます。</li>
      <li>「PTサポート」が一覧に出ないときは、代わりに<b>「通知を表示」</b>を選び、文に「PTサポートで今日やることを見ましょう」と入れます。通知が出たら、ホーム画面のアイコンから開いてください。</li>
      <li>「完了」を押して終わりです。</li></ol>
      <p class="small">※「URLを開く」はSafariで開いてしまい、ホーム画面のアプリとはデータが別になるので使わないでください。</p></div>`,
    ics: `<h1>カレンダーにうまく入らないとき</h1><div class="card"><p>ホーム画面のアプリからだと、カレンダーのファイルがうまく開けないことがあります。そのときは次の順で試してください。</p><ol class="steps">
      <li>カレンダーの画面で<b>「共有・ファイルに保存」</b>を押します。</li>
      <li>出てきた画面で<b>「"ファイル"に保存」</b>を選び、保存します。</li>
      <li>「ファイル」アプリを開き、保存したファイル(PTサポート〜.ics)を押します。</li>
      <li><b>「すべてを追加」</b>(または「カレンダーに追加」)を押します。</li>
      <li>それでもだめなときは<b>「一覧をコピー」</b>を押し、メモなどに貼って、カレンダーに手で入れてください。</li></ol>
      <p class="small">退院予定日を変えたときは、前に入れたカレンダーの予定を消してから、もう一度入れ直してください。</p></div>`,
    backup: `<h1>バックアップと機種変更</h1><div class="card"><h3>バックアップの取り方(月1回)</h3><ol class="steps">
      <li>「設定」→「バックアップ」の<b>「書き出す」</b>を押します。</li>
      <li><b>「"ファイル"に保存」</b>を選び、iCloud Drive などに保存します。</li></ol>
      <h3>新しいiPhoneで戻す</h3><ol class="steps">
      <li>新しいiPhoneでアプリをホーム画面に追加し、暗証番号を決めます。</li>
      <li>「設定」→<b>「読み込む」</b>を押し、保存したファイルを選びます。</li></ol>
      <p class="small">バックアップのファイルには患者さんのイニシャルや予定が入っています。人に送ったり、共有のフォルダに置いたりしないでください。</p></div>`,
  };
  return back + (pages[topic] || '');
}

// ---------- 画面の切り替え ----------
function render() {
  const raw = location.hash.slice(1) || '/today';
  const [path, query] = raw.split('?');
  const [, route, arg] = path.split('/');
  const views = {
    today: viewToday,
    week: () => viewWeek(Number(arg) || 0),
    patients: viewPatients,
    patient: () => viewPatient(arg, query),
    'patient-new': () => viewPatientForm(null),
    'patient-edit': () => viewPatientForm(arg),
    calendar: () => viewCalendar(arg),
    plan: () => viewPlan(arg || monthKey(today())),
    archive: viewArchive,
    settings: viewSettings,
    help: () => viewHelp(arg),
  };
  for (const k of Object.keys(texts)) delete texts[k];
  const html = (views[route] || viewToday)();
  $('#main').innerHTML = html;
  const tab = { today: 'today', week: 'week', patients: 'patients', patient: 'patients', 'patient-new': 'patients', 'patient-edit': 'patients', archive: 'patients', calendar: 'calendar', settings: 'settings', help: 'settings', plan: 'today' }[route] || 'today';
  document.querySelectorAll('#tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
}
let lastRoute = '';
window.addEventListener('hashchange', () => {
  const r = location.hash.split('?')[0];
  render();
  if (r !== lastRoute) window.scrollTo(0, 0);
  lastRoute = r;
});

// ---------- 予定の入力(下から出る画面) ----------
function openEventSheet({ pid, eid, type }) {
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
    <div class="hint">前日(休みなら前の出勤日)に「今日」の画面でお知らせします。</div>
    <div class="btns"><button class="btn primary block" type="submit">保存</button></div>
    ${e ? `<div class="btns"><button class="btn danger" type="button" data-act="deleteEvent" data-eid="${e.id}">この予定を消す</button></div>` : ''}
  </form>`);
  $('#evType').addEventListener('change', (ev) => {
    $('#evTitleBox').hidden = ev.target.value !== 'other';
    $('#evListBox').hidden = ev.target.value !== 'homeVisit';
  });
}

// ---------- iPhoneのカレンダー(.ics) ----------
let currentIcs = null;
function showIcs(title, items, filename) {
  if (!items.length) return toast('これから先の期日・予定はありません');
  currentIcs = { text: L.buildIcs(items), filename, items };
  const list = items.map((it) => `${fmt(it.date)} ${it.time} ${it.title}`).join('\n');
  openSheet(title, `<p class="sub">次の${items.length}件を、通知つきでカレンダーに入れます。</p><pre class="draft">${esc(list)}</pre>
    <div class="btns"><button class="btn primary" data-act="icsOpen">カレンダーに入れる</button><button class="btn" data-act="icsShare">共有・ファイルに保存</button>${copyBtn(list, '一覧をコピー')}</div>
    <p class="small" style="margin-top:12px">うまく入らないときは「共有・ファイルに保存」→「"ファイル"に保存」→ ファイルアプリでそのファイルを開く →「すべてを追加」。<a href="#/help/ics" data-act="closeSheet">くわしく</a></p>`);
}
function icsFile() {
  return new File([currentIcs.text], currentIcs.filename, { type: 'text/calendar' });
}
async function shareFile(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return 'abort';
    }
  }
  return false;
}
function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ---------- バックアップ ----------
async function doBackup() {
  const data = await db.exportAll();
  const t = today();
  const payload = JSON.stringify({ app: 'pt-support', version: 1, exportedAt: nowIso(), data }, null, 1);
  const file = new File([payload], `PTサポート_バックアップ_${t}.json`, { type: 'application/json' });
  const r = isStandalone() || /iPhone|iPad/.test(navigator.userAgent) ? await shareFile(file) : false;
  if (r === 'abort') return;
  if (!r) downloadFile(file);
  S.settings.lastBackupAt = nowIso();
  await saveSettings();
  toast('バックアップを書き出しました。' + praise());
  render();
}
async function doRestore(file) {
  try {
    const obj = JSON.parse(await file.text());
    if (obj.app !== 'pt-support' || !obj.data) throw new Error('形式');
    if (!confirm('今このiPhoneに入っているデータを、バックアップの中身に置きかえます。よろしいですか?')) return;
    // 暗証番号は今のものを残す
    const keep = { pinHash: S.settings.pinHash, pinSalt: S.settings.pinSalt };
    const kv = (obj.data.kv || []).map((r) => (r.key === 'settings' ? { ...r, ...keep } : r));
    await db.importAll({ ...obj.data, kv: kv.length ? kv : [{ ...S.settings }] });
    await load();
    toast('読み込みました');
    location.hash = '#/today';
    render();
  } catch {
    alert('このファイルは読み込めませんでした。「書き出す」で作ったファイルを選んでください。');
  }
}

// ---------- 暗証番号とロック ----------
async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(salt + ':' + pin);
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381;
  for (const b of data) h = ((h << 5) + h + b) >>> 0;
  return 'x' + h.toString(16);
}
let locked = false;
let lastActive = Date.now();

function pinPad(title, sub, onDone, opts = {}) {
  const el = $('#lock');
  let pin = '';
  el.hidden = false;
  const draw = () => {
    el.innerHTML = `<div class="setup-box" style="text-align:center">${opts.top || ''}<h2>${esc(title)}</h2><div class="sub">${esc(sub)}</div>
      <div class="pin-dots" style="justify-content:center">${[0, 1, 2, 3].map((i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join('')}</div>
      <div class="pad" style="margin:0 auto">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-n="${n}">${n}</button>`).join('')}
      <button class="ghost" data-n="cancel">${opts.cancel ? 'やめる' : ''}</button><button data-n="0">0</button><button class="ghost" data-n="del">消す</button></div>
      ${opts.forgot ? '<button class="linkbtn" data-n="forgot">暗証番号を忘れたとき</button>' : ''}</div>`;
  };
  draw();
  el.onclick = async (ev) => {
    const b = ev.target.closest('button');
    // 前の画面のボタン(「次へ」など)の押下は数えない
    if (!b || !el.contains(b) || !b.dataset.n) return;
    const n = b.dataset.n;
    if (n === 'del') pin = pin.slice(0, -1);
    else if (n === 'cancel') { if (opts.cancel) { el.hidden = true; el.onclick = null; opts.cancel(); } return; }
    else if (n === 'forgot') return forgotPin();
    else if (/^\d$/.test(n) && pin.length < 4) pin += n;
    else return;
    draw();
    if (pin.length === 4) {
      const ok = await onDone(pin);
      if (ok === false) {
        pin = '';
        draw();
        $('.pin-dots', el).classList.add('shake');
      }
    }
  };
}
function lockNow() {
  if (!S.settings.pinHash) return;
  locked = true;
  closeSheet();
  pinPad('暗証番号を入れてください', 'PTサポート', async (pin) => {
    if ((await hashPin(pin, S.settings.pinSalt)) !== S.settings.pinHash) return false;
    locked = false;
    lastActive = Date.now();
    $('#lock').hidden = true;
    $('#lock').onclick = null;
    render();
    return true;
  }, { forgot: true });
}
async function forgotPin() {
  if (!confirm('暗証番号を忘れたときは、データをすべて消して最初からになります。\nバックアップがあれば、あとで「読み込む」で戻せます。\n消してよろしいですか?')) return;
  if (!confirm('本当に消します。元には戻せません。よろしいですか?')) return;
  await db.clearAll();
  location.reload();
}
function setPinFlow(onFinish, opts = {}) {
  pinPad('暗証番号を決めます', '4けたの数字を入れてください', async (p1) => {
    pinPad('もう一度入れてください', '確認のため同じ数字を入れます', async (p2) => {
      if (p1 !== p2) {
        toast('数字がちがいました。はじめからやり直してください');
        setPinFlow(onFinish, opts);
        return true;
      }
      const salt = uid();
      S.settings.pinSalt = salt;
      S.settings.pinHash = await hashPin(p1, salt);
      await saveSettings();
      $('#lock').hidden = true;
      $('#lock').onclick = null;
      onFinish();
      return true;
    }, opts);
    return true;
  }, opts);
}
function firstSetup() {
  const el = $('#lock');
  el.hidden = false;
  el.onclick = null;
  el.innerHTML = `<div class="setup-box"><h1 style="text-align:center">PTサポート</h1>
    <div class="card"><p>理学療法の担当業務の期日やお知らせをまとめるアプリです。</p>
    <p class="sub">データはこのiPhoneの中だけに保存され、外には送られません。患者さんはイニシャルやあだ名で登録します。</p>
    <label class="f" for="firstName">あなたの呼び名(あとで変えられます)</label><input type="text" id="firstName" placeholder="例:ゆう">
    <div class="btns"><button class="btn primary block" id="firstNext">次へ(暗証番号を決める)</button></div></div></div>`;
  $('#firstNext').onclick = (ev) => {
    ev.stopPropagation();
    S.settings.name = $('#firstName').value.trim();
    if (!S.settings.firstUseAt) S.settings.firstUseAt = nowIso();
    setPinFlow(() => {
      toast('準備ができました。まずは患者さんを登録しましょう');
      location.hash = '#/today';
      render();
    });
  };
}
['pointerdown', 'keydown', 'touchstart'].forEach((t) => document.addEventListener(t, () => (lastActive = Date.now()), { passive: true }));
const idleTooLong = () => Date.now() - lastActive > (Number(S.settings?.lockMinutes) || 5) * 60000;
setInterval(() => { if (!locked && S.settings?.pinHash && idleTooLong()) lockNow(); }, 15000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (!locked && S.settings?.pinHash && idleTooLong()) lockNow();
    else if (!locked) render(); // 日付が変わっていたら計算し直す
  }
});

// ---------- ボタンの動き ----------
const actions = {
  closeSheet: () => closeSheet(),
  copy: (d) => copyText(texts[d.k] || ''),
  ui: (d) => {
    S.ui[d.k] = d.k === 'mineOnly' ? d.v === '1' : d.v;
    render();
  },
  async summaryDone(d) {
    const p = byId(d.pid);
    p.summaryDone = today();
    await savePatient(p);
    cheer();
    render();
  },
  async summaryUndo(d) {
    const p = byId(d.pid);
    p.summaryDone = null;
    await savePatient(p);
    render();
  },
  async reportDone(d) {
    const p = byId(d.pid);
    if (!L.visitDate(p, S.events)) return openEventSheet({ pid: p.id, type: 'homeVisit' });
    p.homeReportDone = today();
    await savePatient(p);
    cheer();
    render();
  },
  async reportUndo(d) {
    const p = byId(d.pid);
    p.homeReportDone = null;
    await savePatient(p);
    render();
  },
  async visitNeeded(d) {
    const p = byId(d.pid);
    p.homeVisitNeeded = d.v === '1';
    await savePatient(p);
    render();
  },
  async toggleAdmit(d) {
    const p = byId(d.pid);
    p[d.key] = p[d.key] ? null : today();
    await savePatient(p);
    if (p[d.key]) cheer();
    render();
  },
  editPreState(d) {
    const p = byId(d.pid);
    openSheet(`${L.label(p)} 入院前の状態`, `<textarea id="sheetPre" rows="6" placeholder="例:独歩・屋外も自立、階段手すりあり">${esc(p.preState || '')}</textarea>
      <div class="btns"><button class="btn primary block" data-act="savePreState" data-pid="${p.id}" data-from="sheet">保存</button></div>`);
  },
  async savePreState(d) {
    const p = byId(d.pid);
    const el = d.from === 'sheet' ? $('#sheetPre') : $('#preState');
    p.preState = el.value.trim();
    await savePatient(p);
    closeSheet();
    cheer();
    render();
  },
  async saveAdl(d) {
    const p = byId(d.pid);
    const adl = { ...(p.adl || {}) };
    for (const [k] of L.ADL_ITEMS) if (k !== 'dischargeDate') adl[k] = ($(`#adl-${k}`)?.value || '').trim();
    adl.updatedAt = today();
    p.adl = adl;
    // 更新の記録を残す(第2段階の振り返りでも使える)
    p.adlHistory = [...(p.adlHistory || []), { at: nowIso(), values: adl }].slice(-30);
    await savePatient(p);
    cheer();
    render();
  },
  addEvent: (d) => openEventSheet({ pid: d.pid, type: d.type }),
  editEvent: (d) => openEventSheet({ eid: d.eid }),
  async deleteEvent(d) {
    if (!confirm('この予定を消しますか?')) return;
    await db.del('events', d.eid);
    S.events = S.events.filter((e) => e.id !== d.eid);
    closeSheet();
    toast('消しました');
    render();
  },
  async evCheck(d) {
    const e = S.events.find((x) => x.id === d.eid);
    if (!e || !e.checklist) return;
    e.checklist[d.i].done = !e.checklist[d.i].done;
    await saveEvent(e);
    render();
  },
  async flag(d) {
    await setFlag(d.key);
    cheer();
    render();
  },
  async planToggle(d, el, ev) {
    if (ev.target.closest('button')) return;
    const pl = S.plans[d.month] || { month: d.month, selected: false, targets: [], explained: [] };
    pl.targets = pl.targets.includes(d.pid) ? pl.targets.filter((x) => x !== d.pid) : [...pl.targets, d.pid];
    await savePlan(pl);
    render();
  },
  async planDecide(d) {
    const pl = S.plans[d.month] || { month: d.month, selected: false, targets: [], explained: [] };
    pl.selected = true;
    await savePlan(pl);
    toast(pl.targets.length ? `対象は${pl.targets.length}人です。` + praise() : '今月は対象なしで決定しました');
    location.hash = '#/today';
  },
  async planExplained(d, el, ev) {
    ev.stopPropagation();
    const pl = S.plans[d.month] || { month: d.month, selected: true, targets: [d.pid], explained: [] };
    if (!pl.targets.includes(d.pid)) pl.targets.push(d.pid);
    if (!pl.explained.includes(d.pid)) pl.explained.push(d.pid);
    await savePlan(pl);
    cheer();
    render();
  },
  async toggleHoliday(d) {
    const date = d.date;
    if (S.holidays.has(date)) {
      S.holidays.delete(date);
      await db.del('holidays', date);
      toast(`${fmt(date)} を出勤日に戻しました`, 1500);
    } else {
      S.holidays.add(date);
      await db.put('holidays', { date });
      toast(`${fmt(date)} を休みにしました`, 1500);
    }
    render();
  },
  async archive(d) {
    const p = byId(d.pid);
    if (!confirm(`${L.label(p)} を退院済みにしますか?(お知らせが止まります。あとで戻せます)`)) return;
    p.archived = true;
    p.archivedAt = today();
    await savePatient(p);
    toast('おつかれさまでした。' + praise());
    location.hash = '#/patients';
  },
  async unarchive(d) {
    const p = byId(d.pid);
    p.archived = false;
    await savePatient(p);
    render();
  },
  async deletePatient(d) {
    const p = byId(d.pid);
    if (!confirm(`${L.label(p)} のデータをすべて消しますか?元には戻せません。\n(退院した人は「退院済みにする」がおすすめです)`)) return;
    await db.del('patients', p.id);
    for (const e of S.events.filter((x) => x.patientId === p.id)) await db.del('events', e.id);
    S.patients = S.patients.filter((x) => x.id !== p.id);
    S.events = S.events.filter((x) => x.patientId !== p.id);
    toast('消しました');
    location.hash = '#/patients';
  },
  icsPatient(d) {
    const p = byId(d.pid);
    showIcs(`${L.label(p)} をカレンダーへ`, L.calendarItemsForPatient(p, S, today()), `PTサポート_${p.initials}_${today()}.ics`);
  },
  icsAll() {
    const t = today();
    const items = L.activePatients(S).flatMap((p) => L.calendarItemsForPatient(p, S, t)).concat(L.calendarItemsPlans(S, t));
    items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    showIcs('まとめてカレンダーへ', items, `PTサポート_全員_${t}.ics`);
  },
  icsPlans() {
    showIcs('計画書のお知らせ(毎月1日)', L.calendarItemsPlans(S, today()), `PTサポート_計画書_${today()}.ics`);
  },
  icsOpen() {
    if (!currentIcs) return;
    // Safariでは、ファイルを開くと「カレンダーに追加」の画面が出る
    const url = URL.createObjectURL(icsFile());
    location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
  async icsShare() {
    if (!currentIcs) return;
    const r = await shareFile(icsFile());
    if (!r) downloadFile(icsFile());
  },
  backup: () => doBackup(),
  restore: () => {
    const input = $('#restoreFile');
    input.onchange = () => input.files[0] && doRestore(input.files[0]);
    input.click();
  },
  async saveBasic() {
    S.settings.name = $('#setName').value.trim();
    S.settings.lockMinutes = Number($('#setLock').value) || 5;
    S.settings.notifyTime = $('#setTime').value || '07:30';
    await saveSettings();
    toast('保存しました');
    render();
  },
  changePin() {
    pinPad('今の暗証番号', '確認のため入れてください', async (pin) => {
      if ((await hashPin(pin, S.settings.pinSalt)) !== S.settings.pinHash) return false;
      setPinFlow(() => toast('暗証番号を変えました'), { cancel: () => {} });
      return true;
    }, { cancel: () => {} });
  },
  async saveAdlTable() {
    const floors = S.settings.adlTable.floors.map((f, fi) => {
      const nf = { name: f.name, days: {} };
      document.querySelectorAll(`[data-floor="${fi}"]`).forEach((inp) => {
        if (inp.dataset.k === 'name') nf.name = inp.value.trim() || f.name;
        else if (inp.value.trim()) nf.days[inp.dataset.k] = inp.value.replace(/[、\s]+/g, ',').replace(/,+/g, ',').replace(/^,|,$/g, '');
      });
      return nf;
    });
    S.settings.adlTable = { floors: floors.filter((f) => f.name || Object.keys(f.days).length) };
    await saveSettings();
    toast('保存しました');
    render();
  },
  async addFloor() {
    S.settings.adlTable.floors.push({ name: `${S.settings.adlTable.floors.length + 2}階`, days: {} });
    await saveSettings();
    render();
  },
  async saveVisitList() {
    S.settings.visitChecklist = $('#setVisit').value.split('\n').map((s) => s.trim()).filter(Boolean);
    await saveSettings();
    toast('保存しました');
  },
  lockNow: () => lockNow(),
  async wipe() {
    if (!confirm('すべてのデータ(患者・予定・設定・暗証番号)を消します。元には戻せません。\n先にバックアップを取ることをおすすめします。消しますか?')) return;
    if (!confirm('本当に消しますか?')) return;
    await db.clearAll();
    location.hash = '';
    location.reload();
  },
};
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || locked) return;
  if (el.tagName === 'A' && el.getAttribute('href') === '#') ev.preventDefault();
  const fn = actions[el.dataset.act];
  if (fn) fn(el.dataset, el, ev);
});
$('#sheet').addEventListener('click', (ev) => { if (ev.target.id === 'sheet') closeSheet(); });

// ---------- 入力フォームの保存 ----------
document.addEventListener('submit', async (ev) => {
  const f = ev.target;
  ev.preventDefault();
  const fd = new FormData(f);
  if (f.dataset.form === 'patient') {
    const initials = String(fd.get('initials') || '').trim();
    if (!initials) return alert('イニシャルかあだ名を入れてください');
    if (/[一-鿿]{2,}/.test(initials) || initials.length > 6) {
      if (!confirm('名前のように見えます。名前は入れないでください。\nこのまま保存しますか?')) return;
    }
    const old = f.dataset.id ? byId(f.dataset.id) : null;
    const p = old ? { ...old } : { id: uid(), createdAt: nowIso(), archived: false, adl: {}, adlHistory: [] };
    Object.assign(p, {
      initials,
      room: String(fd.get('room') || '').trim(),
      admitDate: fd.get('admitDate') || '',
      dischargeDate: fd.get('dischargeDate') || '',
      memo: String(fd.get('memo') || '').trim(),
      mine: fd.get('mine') === 'on',
      homeVisitNeeded: fd.get('homeVisitNeeded') === 'on',
    });
    if (old && p.dischargeDate !== old.dischargeDate) {
      p.dischargeHistory = [...(old.dischargeHistory || []), { from: old.dischargeDate, to: p.dischargeDate, at: nowIso() }];
    }
    await savePatient(p);
    if (!S.settings.firstUseAt) { S.settings.firstUseAt = nowIso(); await saveSettings(); }
    location.hash = `#/patient/${p.id}`;
    if (old && old.dischargeDate !== p.dischargeDate && p.dischargeDate) {
      openSheet('退院予定日を変えました', `<p>サマリー・家屋調査などのお知らせと期日を、新しい退院予定日(${fmtLong(p.dischargeDate)})で計算し直しました。</p>
        <p><b>iPhoneのカレンダーに入れていた予定も入れ直してください。</b><br><span class="sub">前に入れた「${esc(L.label(p))} 〜」の予定をカレンダーから消してから、下のボタンで入れ直します。</span></p>
        <div class="btns"><button class="btn primary" data-act="icsPatient" data-pid="${p.id}">カレンダーに入れ直す</button><button class="btn" data-act="closeSheet">あとで</button></div>`);
    } else {
      toast(old ? '保存しました。' + praise() : '登録しました。入院時のチェックから始めましょう');
    }
  } else if (f.dataset.form === 'event') {
    const type = fd.get('type');
    const date = fd.get('date');
    if (!isDate(date)) return alert('日にちを入れてください');
    const old = f.dataset.eid ? S.events.find((x) => x.id === f.dataset.eid) : null;
    const e = old ? { ...old } : { id: uid(), patientId: f.dataset.pid, createdAt: nowIso() };
    e.type = type;
    e.title = type === 'other' ? String(fd.get('title') || '').trim() || '予定' : '';
    e.date = date;
    e.time = fd.get('time') || '';
    if (type === 'homeVisit') {
      const lines = String(fd.get('checklist') || '').split('\n').map((s) => s.trim()).filter(Boolean);
      const prev = Object.fromEntries((old?.checklist || []).map((c) => [c.text, c.done]));
      e.checklist = lines.map((text) => ({ text, done: !!prev[text] }));
    } else e.checklist = null;
    await saveEvent(e);
    closeSheet();
    toast('予定を保存しました。' + praise());
    render();
  }
});

// ---------- 起動 ----------
async function start() {
  try {
    await load();
  } catch (e) {
    $('#main').innerHTML = `<div class="card">データを開けませんでした。Safariの「プライベートブラウズ」をオフにして開き直してください。</div>`;
    return;
  }
  if (!S.settings.pinHash) firstSetup();
  else lockNow();
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}
start();
