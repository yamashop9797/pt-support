// 画面の切り替え・ホーム・今週・患者一覧・カレンダー・設定・ロック
// (患者ページと第2段階の記録・書類は patient.js)
import * as db from './db.js';
import { addDays, diffDays, fmt, fmtLong, monthKey, addMonths, weekStart, weekday, isDate, WD } from './dates.js';
import * as L from './logic.js';
import * as T from './stage2.js';
import * as SK from './stroke.js';
import * as OR from './ortho.js';
import * as SC from './sci.js';
import { dailyMessage, praise, greeting } from './messages.js';
import { avatarSvg } from './avatar.js';
import {
  S, actions, changes, today, $, esc, uid, nowIso, byId, setRender, load, saveSettings, savePatient, saveEvent, setFlag, savePlan,
  saveRecord, toast, cheer, openSheet, closeSheet, copyText, texts, copyBtn, clearTexts, radioChips, checkChips, recordById,
} from './core.js';
changes.formatToggle = (d, el) => {
  const on = el.querySelector('input[name=format]:checked');
  for (const k of ['stroke', 'ortho', 'sci']) {
    const box = $(`#${k}Box`);
    if (box) box.hidden = !on || on.value !== k;
  }
};
import { viewPatient, showIcs } from './patient.js';

export const APP_VERSION = '2.3.0';

const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
export const leftText = (p, t) => {
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

// ---------- ホーム(患者のタブ+今日やること) ----------
function patientTabs() {
  const list = L.activePatients(S).sort((a, b) => (a.dischargeDate || '9999').localeCompare(b.dischargeDate || '9999'));
  return `<div class="ptabs">${list
    .map((p) => `<a class="ptab" href="#/patient/${p.id}">${avatarSvg(p.gender, p.ageGroup, 58)}<span>${esc(L.label(p))}</span></a>`)
    .join('')}<a class="ptab add" href="#/patient-new"><span class="plus">+</span><span>追加</span></a></div>`;
}
function viewToday() {
  const t = today();
  const notices = L.computeNotices(S, t);
  const big = notices.filter((n) => n.big);
  const rest = notices.filter((n) => !n.big);
  const fresh = L.activePatients(S)
    .map((p) => ({ p, list: L.newPatientChecklist(p, S.events) }))
    .filter((x) => x.list.some((c) => !c.done));
  const name = S.settings.name ? `${esc(S.settings.name)}さん、` : '';
  let h = `<div class="hello">${name}${greeting()}</div>${patientTabs()}
    <div class="topbar"><h1>今日やること</h1><button class="btn sm" data-act="holidaySheet">🌴 休みを入れる</button></div><div class="sub">${fmtLong(t)}${S.holidays.has(t) ? ' <span class="tag holiday-tag">お休み</span>' : ''}</div>
    <div class="word-line">${esc(dailyMessage(t))}</div>`;
  if (!S.patients.filter((p) => !p.archived).length) {
    h += `<div class="card"><h3>はじめに</h3><p>上の「+ 追加」から担当の患者さんを登録すると、期日やお知らせを自動で出します。</p></div>`;
  }
  for (const pl of L.preHolidayPlans(S, t)) h += preHolidayCard(pl, t);
  for (const n of big) h += bigCard(n);
  for (const { p, list } of fresh) {
    const left = list.filter((c) => !c.done);
    h += `<div class="card notice lv-yellow"><div class="n-title">${esc(L.label(p))} 入院時のこと(あと${left.length}つ)</div>
      ${left.map((c) => `<div class="check" ${checkAct(p, c.key)}><span class="box"></span><span class="ctext">${esc(c.label)}</span><span class="chev">›</span></div>`).join('')}</div>`;
  }
  for (const n of rest) h += noticeCard(n, t);
  if (!notices.length && !fresh.length && S.patients.length) h += `<div class="empty">今日やることはありません。<br>いい一日を過ごしてください。</div>`;
  return h;
}
// ---------- 休み前にやっておくこと ----------
function patientNotes(p) {
  const out = [];
  if (p.format === 'ortho') {
    const prec = [...((p.ortho && p.ortho.precautions) || []), p.ortho && p.ortho.precMemo].filter(Boolean);
    if (prec.length) out.push(`禁止の動き ${prec.join('、')}`);
    const wb = OR.currentWB(p, S.records.filter((r) => r.patientId === p.id));
    if (wb) out.push(`荷重 ${wb.wb}`);
  }
  if (p.format === 'sci') {
    const lv = SC.currentLevel(p, S.records.filter((r) => r.patientId === p.id));
    if (SC.adWarning(lv)) out.push(`${lv}の損傷。自律神経過反射に注意`);
  }
  return out;
}
function preItems(pl, withChecks) {
  if (!pl.items.length) return `<div class="n-body">${pl.all.length ? '全部済みました。安心して休んでください。' : '休み中に来る期日・予定はありません。安心して休んでください。'}</div>`;
  return pl.items.map((it) => `<div class="preitem">${withChecks ? `<div class="check" data-act="flag" data-key="${esc(it.key)}"><span class="box"></span>` : '<div class="check nocheck">'}<span class="ctext"><b>${fmt(it.date)}${it.soon ? '<span class="tag">休み明け</span>' : ''}</b> ${esc(it.text)}<br><span class="small">→ ${esc(it.todo)}</span></span></div>
    ${withChecks && it.draft ? `<div class="btns">${copyBtn(it.draft, '下書きをコピー', 'sm')}${it.pid ? `<a class="btn sm" href="#/patient/${it.pid}?adl">ADLを更新</a>` : ''}</div>` : ''}</div>`).join('');
}
function preHolidayCard(pl, t) {
  const lastDay = t === pl.last;
  const range = `${fmt(pl.start)}${pl.end !== pl.start ? `〜${fmt(pl.end)}` : ''}`;
  return `<div class="card notice lv-${lastDay ? 'red' : 'yellow'} prehol"><div class="n-title">🌴 休み前にやっておくこと</div>
    <div class="n-body">${range} お休み。${lastDay ? '<b>今日が休み前の最後の出勤日です</b>' : `休み前の出勤はあと${pl.workdaysLeft}日(最後は${fmt(pl.last)})`}</div>
    ${preItems(pl, true)}
    <div class="btns">${copyBtn(L.handoverText(S, pl, patientNotes), '申し送りをコピー', 'primary')}<button class="btn" data-act="holidaySheet">休みを変える</button></div></div>`;
}

// 休みを入れる画面(下から出る)
let holSel = null;
let holUndo = null;
function holidaySheetHtml() {
  const t = today();
  const days = Array.from({ length: 28 }, (_, i) => addDays(t, i + 1));
  const first = weekday(days[0]);
  const blanks = Array.from({ length: (first + 6) % 7 }, () => '<span></span>').join('');
  return `<p class="sub">1回押すだけで休みになります。</p>
    <div class="btns"><button class="btn primary" data-act="holidayQuick" data-date="${addDays(t, 1)}">明日(${fmt(addDays(t, 1))})</button><button class="btn primary" data-act="holidayQuick" data-date="${addDays(t, 2)}">あさって(${fmt(addDays(t, 2))})</button></div>
    <h4>日を選ぶ(いくつでも。もう一度押すと外れます)</h4>
    <div class="holgrid">${['月', '火', '水', '木', '金', '土', '日'].map((w) => `<span class="wd">${w}</span>`).join('')}${blanks}${days
      .map((d) => `<button class="hday ${holSel.has(d) ? 'on' : ''} ${[0, 6].includes(weekday(d)) ? 'we' : ''}" data-act="holidayPick" data-date="${d}">${Number(d.slice(5, 7))}/${Number(d.slice(8))}</button>`)
      .join('')}</div>
    <div class="btns"><button class="btn primary block" data-act="holidaySave">この内容で休みにする</button></div>`;
}
async function saveHolidays(next) {
  const t = today();
  const before = new Set([...S.holidays].filter((d) => d > t));
  for (const d of before) if (!next.has(d)) { S.holidays.delete(d); await db.del('holidays', d); }
  for (const d of next) if (!S.holidays.has(d)) { S.holidays.add(d); await db.put('holidays', { date: d }); }
  holUndo = before;
  render();
  showHolidayResult();
}
function showHolidayResult() {
  const t = today();
  const plans = L.preHolidayPlans(S, t, { any: true }).filter((pl) => pl.start <= addDays(t, 28));
  const body = plans.length
    ? plans.map((pl) => `<div class="card"><b>${fmt(pl.start)}${pl.end !== pl.start ? `〜${fmt(pl.end)}` : ''} お休み</b><div class="small">休み前の最後の出勤日:${fmt(pl.last)}。${fmt(pl.from)}からホームに「休み前にやっておくこと」を出します。</div>${preItems(pl, false)}
      <div class="btns">${copyBtn(L.handoverText(S, pl, patientNotes), '申し送りをコピー', 'sm')}</div></div>`).join('')
    : '<p>これから4週間に休みはありません。</p>';
  openSheet('休みを保存しました', `${body}<div class="btns"><button class="btn" data-act="holidayUndo">元に戻す</button><button class="btn primary" data-act="closeSheet">閉じる</button></div>`);
}
Object.assign(actions, {
  holidaySheet() {
    holSel = new Set([...S.holidays].filter((d) => d > today()));
    openSheet('休みを入れる', holidaySheetHtml());
  },
  holidayPick(d, el) {
    if (holSel.has(d.date)) holSel.delete(d.date); else holSel.add(d.date);
    el.classList.toggle('on');
  },
  async holidayQuick(d) {
    const next = new Set([...S.holidays].filter((x) => x > today()));
    next.add(d.date);
    await saveHolidays(next);
  },
  async holidaySave() { await saveHolidays(holSel); },
  async holidayUndo() {
    if (!holUndo) return closeSheet();
    const prev = holUndo;
    await saveHolidays(prev);
    holUndo = null;
    closeSheet();
    toast('元に戻しました');
  },
});

export function checkAct(p, key) {
  switch (key) {
    case 'firstConf': return `data-act="addEvent" data-pid="${p.id}" data-type="firstConf"`;
    case 'preState': return `data-act="editPreState" data-pid="${p.id}"`;
    case 'inbodyAdmit': return `data-act="inbodyNew" data-pid="${p.id}" data-timing="admit"`;
    case 'fimAdmit': return `data-act="fimNew" data-pid="${p.id}" data-timing="admit"`;
  }
  return '';
}
function bigCard(n) {
  return `<div class="big-card s${n.strength}"><div class="n-title">${esc(n.title)}</div><div class="n-body">${esc(n.body)}</div>
    <div class="btns"><a class="btn" href="#/patient/${n.pid}/docs">下書きを作る</a><button class="btn" data-act="summaryDone" data-pid="${n.pid}">サマリーができた</button></div></div>`;
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
      btns = `<a class="btn primary" href="#/patient/${n.pid}/docs">報告書を作る</a><button class="btn" data-act="reportDone" data-pid="${n.pid}">報告書ができた</button>`;
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
    case 'review':
      btns = `<a class="btn primary" href="#/review/${n.month}">振り返りを見る</a><button class="btn" data-act="flag" data-key="${n.key}">閉じる</button>`;
      break;
    case 'backup':
      btns = `<button class="btn primary" data-act="backup">今すぐバックアップ</button>`;
      break;
  }
  if (n.pid && !['adl', 'event', 'visitReport'].includes(n.kind)) btns += `<a class="btn" href="#/patient/${n.pid}">患者ページ</a>`;
  return `<div class="card notice lv-${n.level}"><div class="n-title">${esc(n.title)}</div>${n.body ? `<div class="n-body">${esc(n.body)}</div>` : ''}${dueLabel(n, t)}${extra}<div class="btns">${btns}</div></div>`;
}

// ---------- 今週 ----------
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
    <div class="btns"><button class="btn primary" data-act="icsAll">まとめてカレンダーへ</button><a class="btn" href="#/review/${addMonths(monthKey(t), -1)}">先月の振り返り</a></div></div>`;
  return h;
}

// ---------- 患者一覧 ----------
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
    h += `<a class="card pcard" href="#/patient/${p.id}"><div class="prow">${avatarSvg(p.gender, p.ageGroup, 64)}<div><div class="row"><span class="ini">${esc(L.label(p))}</span><span class="room">${esc(p.room || '')}</span>${p.mine === false ? '<span class="tag">担当外</span>' : ''}</div>
      <div class="left lv-${lt.lv}">${lt.text}</div></div></div>${dots(L.progress(p, S, t))}</a>`;
  }
  h += `<div class="btns"><a class="btn" href="#/archive">退院済みの人</a></div>`;
  return h;
}
export function dots(pr) {
  const one = (k, name) => `<span class="dot ${pr[k]}"><i></i>${name}${pr[k] === 'none' ? (k === 'plan' ? '(今月なし)' : '(なし)') : ''}</span>`;
  return `<div class="dots">${one('plan', '計画書')}${one('homeVisit', '家屋調査')}${one('summary', 'サマリー')}</div>`;
}

// ---------- 患者の登録・編集 ----------
function viewPatientForm(id) {
  const p = id ? byId(id) : null;
  const v = p || { initials: '', room: '', admitDate: today(), kaifukuDate: today(), dischargeDate: '', memo: '', mine: true, homeVisitNeeded: true, format: 'stroke' };
  const st = (p && p.stroke) || {};
  const ot = (p && p.ortho) || {};
  const sc = (p && p.sci) || {};
  return `<div class="topbar"><a class="back" href="${p ? `#/patient/${p.id}` : '#/today'}">‹ もどる</a></div>
  <h1>${p ? '患者さんを編集' : '患者さんを登録'}</h1>
  <form class="card" data-form="patient" data-id="${p ? p.id : ''}">
    <label class="f" for="initials">イニシャル・あだ名</label>
    <input type="text" id="initials" name="initials" maxlength="8" value="${esc(v.initials)}" placeholder="例:A、K.T" required autocomplete="off">
    <div class="warn-hint">名前は入れないでください(イニシャルやあだ名だけ)</div>
    <label class="f">性別</label>${radioChips('gender', Object.entries(T.GENDERS), v.gender || '')}
    <label class="f">年代</label>${radioChips('ageGroup', T.AGES, v.ageGroup || '')}
    <div class="hint">アバターの見た目が変わります。生年月日は入れません。</div>
    <label class="f" for="room">部屋番号</label>
    <input type="text" id="room" name="room" inputmode="numeric" value="${esc(v.room)}" placeholder="例:221">
    <label class="f" for="admitDate">入院日</label>
    <input type="date" id="admitDate" name="admitDate" value="${esc(v.admitDate)}">
    <label class="f" for="kaifukuDate">回復期病棟に来た日</label>
    <input type="date" id="kaifukuDate" name="kaifukuDate" value="${esc(v.kaifukuDate || '')}">
    <label class="f">疾患の区分(算定上限)</label>${radioChips('diseaseLimit', T.LIMITS.map((n) => [String(n), `${n}日`]), v.diseaseLimit || '')}
    <label class="f" for="dischargeDate">退院予定日</label>
    <input type="date" id="dischargeDate" name="dischargeDate" value="${esc(v.dischargeDate)}">
    <div class="hint">変えると、お知らせと期日を自動で計算し直します。</div>
    <label class="f">評価の型</label>
    <div data-chg="formatToggle">${radioChips('format', SK.FORMATS, ['stroke', 'ortho', 'sci'].includes(v.format) ? v.format : 'none')}</div>
    <div id="strokeBox" class="subbox" ${v.format === 'stroke' ? '' : 'hidden'}>
      <label class="f">診断名</label>${radioChips('dx', SK.DX, st.dx || '')}
      <label class="f">脳梗塞の種類(脳梗塞のとき)</label>${radioChips('subtype', SK.INFARCT_TYPES, st.subtype || '')}
      <label class="f" for="onsetDate">発症日</label><input type="date" id="onsetDate" name="onsetDate" value="${esc(st.onsetDate || '')}">
      <label class="f">損傷側(病巣のある側)</label>${radioChips('side', SK.SIDES, st.side || '')}
      <div class="hint">右の損傷なら左の麻痺として評価の画面を出します。</div>
      <label class="f">病巣(いくつでも)</label>${checkChips('lesions', SK.LESIONS, st.lesions || [])}
      <label class="f">血管の領域(いくつでも)</label>${checkChips('vessels', SK.VESSELS, st.vessels || [])}
      <label class="f" for="strokeMemo">ボタンにないもの・メモ</label><input type="text" id="strokeMemo" name="strokeMemo" value="${esc(st.memo || '')}" placeholder="例:左前頭葉皮質下の多発梗塞">
    </div>
    <div id="orthoBox" class="subbox" ${v.format === 'ortho' ? '' : 'hidden'}>
      <label class="f">疾患</label>${radioChips('oDx', OR.ORTHO_DX, ot.dx || '')}
      <label class="f">手術・治療</label>${radioChips('oSurgery', OR.SURGERY, ot.surgery || '')}
      <label class="f">患側</label>${radioChips('oSide', OR.O_SIDES, ot.side || '')}
      <label class="f" for="opDate">手術日</label><input type="date" id="opDate" name="opDate" value="${esc(ot.opDate || '')}">
      <div class="hint">入れると「術後◯日」が出ます。</div>
      <label class="f">荷重(登録のとき)</label>${radioChips('oWb', OR.WB, ot.wb || '')}
      <label class="f" for="wbDate">この荷重の開始日</label><input type="date" id="wbDate" name="wbDate" value="${esc(ot.wbDate || '')}">
      <div class="hint">荷重が変わったら、評価の画面の「今の荷重」で変えられます。</div>
      <label class="f">禁止の動き(いくつでも)</label>${checkChips('precautions', OR.PRECAUTIONS, ot.precautions || [])}
      <input type="text" name="precMemo" value="${esc(ot.precMemo || '')}" placeholder="ほかの禁止・注意(例:後方アプローチ)">
      <label class="f" for="orthoMemo">ボタンにないもの・メモ</label><input type="text" id="orthoMemo" name="orthoMemo" value="${esc(ot.memo || '')}" placeholder="例:γネイル">
    </div>
    <div id="sciBox" class="subbox" ${v.format === 'sci' ? '' : 'hidden'}>
      <label class="f">損傷の高さ(神経学的レベル)</label>${radioChips('sLevel', SC.LEVELS, sc.level || '')}
      <div class="hint">T6より上なら「自律神経過反射に注意」を出します。評価を入れると、その結果の高さを使います。</div>
      <label class="f">AIS(登録のとき)</label>${radioChips('sAis', SC.AIS.map(([k]) => k), sc.ais || '')}
      <label class="f">原因</label>${radioChips('sCause', SC.CAUSES, sc.cause || '')}
      <label class="f" for="injuryDate">受傷日・発症日</label><input type="date" id="injuryDate" name="injuryDate" value="${esc(sc.injuryDate || '')}">
      <label class="f" for="sSurgery">手術(なければ空)</label><input type="text" id="sSurgery" name="sSurgery" value="${esc(sc.surgery || '')}" placeholder="例:C3-6 椎弓形成術">
      <label class="f" for="sciMemo">メモ</label><input type="text" id="sciMemo" name="sciMemo" value="${esc(sc.memo || '')}" placeholder="例:中心性頸髄損傷">
    </div>
    <label class="f" for="memo">メモ</label>
    <textarea id="memo" name="memo" placeholder="名前など個人が分かることは書かないでください">${esc(v.memo)}</textarea>
    <label class="toggle"><input type="checkbox" name="mine" ${v.mine !== false ? 'checked' : ''}> 自分の担当</label>
    <label class="toggle"><input type="checkbox" name="homeVisitNeeded" ${v.homeVisitNeeded !== false ? 'checked' : ''}> 家屋調査あり</label>
    <div class="btns"><button class="btn primary block" type="submit">保存</button></div>
  </form>`;
}

// ---------- カレンダー ----------
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

// ---------- 計画書の対象者 ----------
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

// ---------- 退院済み ----------
function viewArchive() {
  const list = S.patients.filter((p) => p.archived).sort((a, b) => (b.dischargeDate || '').localeCompare(a.dischargeDate || ''));
  let h = `<div class="topbar"><a class="back" href="#/patients">‹ 患者</a></div><h1>退院済みの人</h1><div class="card">`;
  if (!list.length) h += `<div class="sub">まだいません</div>`;
  for (const p of list) h += `<div class="list-row"><a href="#/patient/${p.id}"><b>${esc(L.label(p))}</b> ${esc(p.room || '')} <span class="sub">退院 ${fmt(p.dischargeDate)}</span></a><span class="chev">›</span></div>`;
  return h + `</div>`;
}

// ---------- 月の振り返り ----------
function viewReview(mk) {
  mk = mk || addMonths(monthKey(today()), -1);
  const r = T.monthReview({ ...S, today: today() }, mk);
  const memoRec = recordById(`review:${mk}`);
  const m = Number(mk.slice(5));
  const tile = (n, name) => `<div class="stat"><b>${n}</b><span>${name}</span></div>`;
  const total = r.daily + r.summaries + r.reports + r.plans + r.fim + r.inbody + r.events;
  return `<div class="topbar"><a class="btn" href="#/review/${addMonths(mk, -1)}">‹</a><b style="font-size:18px">${Number(mk.slice(0, 4))}年${m}月の振り返り</b><a class="btn" href="#/review/${addMonths(mk, 1)}">›</a></div>
  <div class="card word">${total ? `${m}月もおつかれさまでした。${esc(praise())}` : 'この月の記録はまだありません。'}</div>
  <div class="stats">${tile(r.active, '担当した人')}${tile(r.newPatients, '新しく担当')}${tile(r.discharged, '退院した人')}${tile(r.events, 'カンファ・訪問など')}</div>
  <div class="stats">${tile(r.daily, '毎日の記録')}${tile(r.fim, 'FIMの入力')}${tile(r.inbody, 'InBody')}${tile(r.plans, '計画書の説明')}</div>
  <div class="stats">${tile(r.summaries, 'サマリー完成')}${tile(r.reports, '家屋調査報告書')}${tile(r.avgGain == null ? '—' : (r.avgGain >= 0 ? '+' : '') + r.avgGain, '退院した人のFIM利得(平均)')}</div>
  ${r.gains.length ? `<div class="card"><h3>退院した人のFIMの変化</h3>${r.gains.map((g) => `<div class="list-row"><span>${esc(L.label(g.p))}</span><b>${g.gain >= 0 ? '+' : ''}${g.gain}点</b></div>`).join('')}</div>` : ''}
  <div class="card"><h3>ひとことメモ</h3><div class="sub">うまくいったこと、次に試したいことなど</div>
    <textarea id="reviewMemo" rows="4">${esc(memoRec ? memoRec.memo : '')}</textarea>
    <div class="btns"><button class="btn primary" data-act="saveReview" data-month="${mk}">保存</button></div></div>`;
}

// ---------- 設定 ----------
function viewSettings() {
  const s = S.settings;
  const floors = s.adlTable.floors;
  return `<h1>設定</h1>
  <div class="card"><label class="f" for="setName">呼び名</label><input type="text" id="setName" value="${esc(s.name)}" placeholder="例:ゆう">
    <div class="hint">ホームのあいさつに使います。</div>
    <label class="f" for="setLock">自動でロックするまで(何もしない時間)</label>
    <select id="setLock">${[1, 3, 5, 10, 30].map((m) => `<option value="${m}" ${s.lockMinutes == m ? 'selected' : ''}>${m}分</option>`).join('')}</select>
    <label class="f" for="setTime">カレンダーのお知らせ時刻</label><input type="time" id="setTime" value="${esc(s.notifyTime)}">
    <label class="f" for="setWalk">行き先の‼️:徒歩で何分以上なら目立たせるか</label><input type="number" id="setWalk" min="1" max="120" value="${esc(s.walkLimitMin)}">
    <div class="hint">本人が退院後に使う移動手段で行けない行き先にも‼️が付きます。</div>
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
  <div class="card"><div class="sub">データはこのiPhoneの中だけにあります。月に1回、書き出して「ファイル」アプリやiCloudに保存しておくと安心です。InBodyの写真も一緒に入ります。</div>
    <p>前回のバックアップ:<b>${s.lastBackupAt ? fmtLong(s.lastBackupAt.slice(0, 10)) : 'まだ'}</b></p>
    <div class="btns"><button class="btn primary" data-act="backup">書き出す</button><button class="btn" data-act="restore">読み込む</button></div>
    <input type="file" id="restoreFile" accept=".json,application/json" hidden></div>

  <h2>iPhoneのカレンダー</h2>
  <div class="card"><div class="btns" style="margin-top:0"><button class="btn" data-act="icsAll">全員の期日・予定を入れる</button><button class="btn" data-act="icsPlans">毎月の計画書のお知らせを入れる</button></div></div>

  <h2>使い方・ほか</h2>
  <div class="card">
    <div class="list-row"><a href="#/review">月の振り返り</a><span class="chev">›</span></div>
    <div class="list-row"><a href="#/help/home">ホーム画面に追加する</a><span class="chev">›</span></div>
    <div class="list-row"><a href="#/help/shortcut">毎朝アプリを開く(ショートカット)</a><span class="chev">›</span></div>
    <div class="list-row"><a href="#/help/ics">カレンダーにうまく入らないとき</a><span class="chev">›</span></div>
    <div class="list-row"><a href="#/help/backup">バックアップと機種変更</a><span class="chev">›</span></div>
    <div class="list-row"><a href="#/help/ai">「AI用にコピー」の使い方</a><span class="chev">›</span></div>
    <div class="list-row"><a href="#/archive">退院済みの人</a><span class="chev">›</span></div>
  </div>

  <h2>そのほか</h2>
  <div class="card"><button class="btn" data-act="lockNow">今すぐロック</button>
    <div class="btns"><button class="btn danger" data-act="wipe">すべてのデータを消す</button></div>
    <div class="small" style="margin-top:12px">バージョン ${APP_VERSION}・データはこの端末の中だけに保存され、外には送られません。</div></div>`;
}

// ---------- 使い方 ----------
function viewHelp(topic) {
  const back = `<div class="topbar"><a class="back" href="#/settings">‹ 設定</a></div>`;
  const url = location.origin + location.pathname;
  const pages = {
    home: `<h1>ホーム画面に追加</h1><div class="card"><ol class="steps">
      <li>iPhoneの<b>Safari</b>でこのアプリのページを開きます。<br><span class="small">${esc(url)}</span></li>
      <li>共有ボタン(四角から矢印が出ているマーク)を押します。</li>
      <li>下にずらして<b>「ホーム画面に追加」</b>を押し、<b>「追加」</b>を押します。</li>
      <li>これからは、ホーム画面のアイコンから開いてください。電波がなくても動きます。</li></ol>
      <p class="small">※Safariで開いたときと、ホーム画面から開いたときでは、データの置き場所が別になります。ふだんは<b>ホーム画面のアイコン</b>から使ってください。</p></div>`,
    shortcut: `<h1>毎朝アプリを開く</h1><div class="card"><ol class="steps">
      <li>「ショートカット」アプリを開き、下の<b>「オートメーション」</b>を押します。</li>
      <li>右上の<b>「+」</b>→<b>「時刻」</b>を選びます。</li>
      <li>時刻(例:7:30)を決め、<b>「毎日」</b>(出勤日だけなら「毎週」で曜日を選ぶ)にします。</li>
      <li><b>「すぐに実行」</b>を選び、「次へ」を押します。</li>
      <li><b>「Appを開く」</b>を選び、<b>「PTサポート」</b>を選びます。</li>
      <li>一覧に出ないときは、代わりに<b>「通知を表示」</b>で「PTサポートで今日やることを見ましょう」と入れます。</li></ol>
      <p class="small">※「URLを開く」はSafariで開いてしまい、データが別になるので使わないでください。</p></div>`,
    ics: `<h1>カレンダーにうまく入らないとき</h1><div class="card"><ol class="steps">
      <li><b>「共有・ファイルに保存」</b>を押します。</li>
      <li><b>「"ファイル"に保存」</b>を選び、保存します。</li>
      <li>「ファイル」アプリで、保存したファイルを押します。</li>
      <li><b>「すべてを追加」</b>を押します。</li>
      <li>それでもだめなときは<b>「一覧をコピー」</b>で、カレンダーに手で入れてください。</li></ol>
      <p class="small">退院予定日を変えたときは、前に入れた予定を消してから入れ直してください。</p></div>`,
    backup: `<h1>バックアップと機種変更</h1><div class="card"><h3>バックアップ(月1回)</h3><ol class="steps">
      <li>「設定」→<b>「書き出す」</b>を押します。</li>
      <li><b>「"ファイル"に保存」</b>で iCloud Drive などに保存します。</li></ol>
      <h3>新しいiPhoneで戻す</h3><ol class="steps">
      <li>新しいiPhoneでアプリをホーム画面に追加し、暗証番号を決めます。</li>
      <li>「設定」→<b>「読み込む」</b>で保存したファイルを選びます。</li></ol>
      <p class="small">バックアップには患者さんのイニシャルや記録が入っています。人に送ったり、共有のフォルダに置いたりしないでください。</p></div>`,
    ai: `<h1>「AI用にコピー」の使い方</h1><div class="card"><p>このアプリはAIにつながっていません。文章を整えたいときは、あなたが使っているAIのアプリに貼り付けます。</p><ol class="steps">
      <li>患者ページの「書類」で<b>「AI用にコピー」</b>を押します(お願いの文と下書きがまとめてコピーされます)。</li>
      <li>AIのアプリを開いて、入力欄に貼り付けて送ります。</li>
      <li>できた文章を確かめて、必要ならアプリの下書き欄に貼り戻して保存します。</li></ol>
      <p class="small">名前・住所の番地・生年月日・IDは、このアプリにもAIにも入れないでください。AIの答えは必ず自分で確かめてください。勤め先にAIの使い方の決まりがあるときは、それに従ってください。</p></div>`,
  };
  return back + (pages[topic] || '');
}

// ---------- 画面の切り替え ----------
function render() {
  const raw = location.hash.slice(1) || '/today';
  const [path, query] = raw.split('?');
  const [, route, arg, arg2, arg3] = path.split('/');
  const views = {
    today: viewToday,
    week: () => viewWeek(Number(arg) || 0),
    patients: viewPatients,
    patient: () => viewPatient(arg, arg2 || 'main', query, arg3),
    'patient-new': () => viewPatientForm(null),
    'patient-edit': () => viewPatientForm(arg),
    calendar: () => viewCalendar(arg),
    plan: () => viewPlan(arg || monthKey(today())),
    review: () => viewReview(arg),
    archive: viewArchive,
    settings: viewSettings,
    help: () => viewHelp(arg),
  };
  clearTexts();
  $('#main').innerHTML = (views[route] || viewToday)();
  const tab = { patients: 'patients', patient: 'patients', 'patient-new': 'patients', 'patient-edit': 'patients', archive: 'patients', calendar: 'calendar', settings: 'settings', help: 'settings', week: 'week', review: 'week' }[route] || 'today';
  document.querySelectorAll('#tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
}
setRender(render);
let lastRoute = '';
window.addEventListener('hashchange', () => {
  const r = location.hash.split('?')[0];
  render();
  if (r !== lastRoute) window.scrollTo(0, 0);
  lastRoute = r;
});

// ---------- バックアップ ----------
export async function shareFile(file) {
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
export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function doBackup() {
  const data = await db.exportAll();
  const payload = JSON.stringify({ app: 'pt-support', version: 2, exportedAt: nowIso(), data });
  const file = new File([payload], `PTサポート_バックアップ_${today()}.json`, { type: 'application/json' });
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
    el.innerHTML = `<div class="setup-box" style="text-align:center"><h2>${esc(title)}</h2><div class="sub">${esc(sub)}</div>
      <div class="pin-dots" style="justify-content:center">${[0, 1, 2, 3].map((i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join('')}</div>
      <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-n="${n}">${n}</button>`).join('')}
      <button class="ghost" data-n="cancel">${opts.cancel ? 'やめる' : ''}</button><button data-n="0">0</button><button class="ghost" data-n="del">消す</button></div>
      ${opts.forgot ? '<button class="linkbtn" data-n="forgot">暗証番号を忘れたとき</button>' : ''}</div>`;
  };
  draw();
  el.onclick = async (ev) => {
    const b = ev.target.closest('button');
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
    else if (!locked && S.settings && $('#sheet').hidden) render(); // 日付が変わっていたら計算し直す
  }
});

// ---------- ボタンの動き(共通) ----------
Object.assign(actions, {
  closeSheet: () => closeSheet(),
  copy: (d) => copyText(texts[d.k] || ''),
  ui: (d) => {
    S.ui[d.k] = d.k === 'mineOnly' ? d.v === '1' : d.v;
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
  icsAll() {
    const t = today();
    const items = L.activePatients(S).flatMap((p) => L.calendarItemsForPatient(p, S, t)).concat(L.calendarItemsPlans(S, t));
    items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    showIcs('まとめてカレンダーへ', items, `PTサポート_全員_${t}.ics`);
  },
  icsPlans() {
    showIcs('計画書のお知らせ(毎月1日)', L.calendarItemsPlans(S, today()), `PTサポート_計画書_${today()}.ics`);
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
    S.settings.walkLimitMin = Math.max(1, Number($('#setWalk').value) || 15);
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
  async saveReview(d) {
    await saveRecord({ id: `review:${d.month}`, type: 'review', month: d.month, date: d.month + '-28', memo: $('#reviewMemo').value.trim() });
    await setFlag(`review:${d.month}`);
    cheer();
  },
  lockNow: () => lockNow(),
  async wipe() {
    if (!confirm('すべてのデータ(患者・予定・記録・設定・暗証番号)を消します。元には戻せません。\n先にバックアップを取ることをおすすめします。消しますか?')) return;
    if (!confirm('本当に消しますか?')) return;
    await db.clearAll();
    location.hash = '';
    location.reload();
  },
});
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || locked) return;
  if (el.tagName === 'A' && el.getAttribute('href') === '#') ev.preventDefault();
  const fn = actions[el.dataset.act];
  if (fn) fn(el.dataset, el, ev);
});
document.addEventListener('change', (ev) => {
  const el = ev.target.closest('[data-chg]');
  if (!el || locked) return;
  const fn = changes[el.dataset.chg];
  if (fn) fn(el.dataset, el, ev);
});
$('#sheet').addEventListener('click', (ev) => { if (ev.target.id === 'sheet') closeSheet(); });

// ---------- 患者の登録フォーム ----------
document.addEventListener('submit', async (ev) => {
  const f = ev.target;
  if (f.dataset.form !== 'patient') return;
  ev.preventDefault();
  const fd = new FormData(f);
  const initials = String(fd.get('initials') || '').trim();
  if (!initials) return alert('イニシャルかあだ名を入れてください');
  if (/[一-鿿]{2,}/.test(initials) || initials.length > 6) {
    if (!confirm('名前のように見えます。名前は入れないでください。\nこのまま保存しますか?')) return;
  }
  const old = f.dataset.id ? byId(f.dataset.id) : null;
  const p = old ? { ...old } : { id: uid(), createdAt: nowIso(), archived: false, adl: {}, adlHistory: [], env: {}, family: [], system: {}, orthosis: {} };
  Object.assign(p, {
    initials,
    gender: fd.get('gender') || '',
    ageGroup: fd.get('ageGroup') || '',
    room: String(fd.get('room') || '').trim(),
    admitDate: fd.get('admitDate') || '',
    kaifukuDate: fd.get('kaifukuDate') || '',
    diseaseLimit: Number(fd.get('diseaseLimit')) || '',
    dischargeDate: fd.get('dischargeDate') || '',
    memo: String(fd.get('memo') || '').trim(),
    mine: fd.get('mine') === 'on',
    homeVisitNeeded: fd.get('homeVisitNeeded') === 'on',
    format: ['stroke', 'ortho', 'sci'].includes(fd.get('format')) ? fd.get('format') : '',
  });
  if (p.format === 'ortho') {
    p.ortho = {
      dx: fd.get('oDx') || '',
      surgery: fd.get('oSurgery') || '',
      side: fd.get('oSide') || '',
      opDate: fd.get('opDate') || '',
      wb: fd.get('oWb') || '',
      wbDate: fd.get('wbDate') || '',
      precautions: fd.getAll('precautions'),
      precMemo: String(fd.get('precMemo') || '').trim(),
      memo: String(fd.get('orthoMemo') || '').trim(),
    };
  }
  if (p.format === 'sci') {
    p.sci = {
      level: fd.get('sLevel') || '',
      ais: fd.get('sAis') || '',
      cause: fd.get('sCause') || '',
      injuryDate: fd.get('injuryDate') || '',
      surgery: String(fd.get('sSurgery') || '').trim(),
      memo: String(fd.get('sciMemo') || '').trim(),
    };
  }
  if (p.format === 'stroke') {
    p.stroke = {
      dx: fd.get('dx') || '',
      subtype: fd.get('dx') === '脳梗塞' ? fd.get('subtype') || '' : '',
      onsetDate: fd.get('onsetDate') || '',
      side: fd.get('side') || '',
      lesions: fd.getAll('lesions'),
      vessels: fd.getAll('vessels'),
      memo: String(fd.get('strokeMemo') || '').trim(),
    };
  }
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
    toast(old ? '保存しました。' + praise() : '登録しました。入院時のことから始めましょう');
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
