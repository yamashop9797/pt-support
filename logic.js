// お知らせ・期日・カレンダー用ファイルの計算(画面とは切り離した部品。テストあり)
import { addDays, diffDays, weekday, monthKey, addMonths, endOfMonth, fmt, isDate, pad } from './dates.js';

export const EVENT_TYPES = {
  firstConf: '初回カンファ',
  dischargeConf: '退院前カンファ',
  homeVisit: '家屋訪問',
  other: 'その他',
};

export const ADL_ITEMS = [
  ['kiko', '起居'],
  ['tanza', '端座位'],
  ['ijo', '移乗'],
  ['shoes', '靴の着脱'],
  ['ido', '移動方法'],
  ['dischargeDate', '退院日'], // 患者の退院予定日から自動で入る
  ['afterMove', '退院後の移動形態'],
  ['consult', '相談が必要な内容'],
];

export function defaultSettings() {
  return {
    key: 'settings',
    name: '',
    pinHash: '',
    pinSalt: '',
    lockMinutes: 5,
    notifyTime: '07:30',
    adlTable: {
      floors: [
        { name: '2階', days: { 1: '221,228', 2: '222', 3: '223', 4: '225', 5: '226,227' } },
        { name: '3階', days: { 1: '321', 2: '322', 3: '323', 4: '325', 5: '326,327' } },
      ],
    },
    visitChecklist: ['メジャー', 'カメラ(スマホ)', '記録用紙', '筆記用具', '名札'],
    firstUseAt: '',
    lastBackupAt: '',
  };
}

export const label = (p) => `${p.initials || '?'}さん`;

// ---------- 休みと出勤日 ----------
// その日が休みなら、前の出勤日までさかのぼる
export function prevWorkday(date, holidays) {
  let d = date;
  for (let i = 0; i < 60 && holidays.has(d); i++) d = addDays(d, -1);
  return d;
}
// 予定の「前日」のお知らせ日(前日が休みなら前の出勤日)
export function noticeDayFor(date, holidays) {
  return prevWorkday(addDays(date, -1), holidays);
}

// ---------- 病棟ADLカンファ ----------
export function roomKey(room) {
  const m = String(room || '').match(/\d{3,4}/);
  return m ? m[0] : '';
}
export function adlWeekdays(room, table) {
  const key = roomKey(room);
  if (!key || !table) return [];
  const out = new Set();
  for (const f of table.floors || []) {
    for (const [wd, rooms] of Object.entries(f.days || {})) {
      const list = String(rooms || '').split(/[,、\s]+/).filter(Boolean);
      if (list.includes(key)) out.add(Number(wd));
    }
  }
  return [...out].sort();
}
// 今日お知らせすべきADLカンファ(お知らせ日〜カンファ当日のあいだ)
export function currentAdlConf(p, table, today, holidays) {
  const wds = adlWeekdays(p.room, table);
  if (!wds.length) return null;
  for (let i = 0; i <= 14; i++) {
    const c = addDays(today, i);
    if (p.dischargeDate && c > p.dischargeDate) return null;
    if (!wds.includes(weekday(c))) continue;
    const n = noticeDayFor(c, holidays);
    if (n <= today) return { confDate: c, noticeDate: n };
  }
  return null;
}
export function adlConfDates(p, table, from, to) {
  const wds = adlWeekdays(p.room, table);
  const out = [];
  if (!wds.length) return out;
  for (let c = from; c <= to; c = addDays(c, 1)) {
    if (p.dischargeDate && c > p.dischargeDate) break;
    if (p.admitDate && c < p.admitDate) continue;
    if (wds.includes(weekday(c))) out.push(c);
  }
  return out;
}

// ---------- 下書き ----------
export function relDay(date, today) {
  const d = diffDays(date, today);
  if (d === 0) return '今日';
  if (d === 1) return '明日';
  if (d === 2) return 'あさって';
  return fmt(date);
}
export function adlLines(p, today) {
  const a = p.adl || {};
  return ADL_ITEMS.map(([k, name]) => {
    let v;
    if (k === 'dischargeDate') {
      v = p.dischargeDate ? `${fmt(p.dischargeDate)}(あと${diffDays(p.dischargeDate, today)}日)` : '';
    } else v = (a[k] || '').trim();
    return `・${name}:${v || '(未入力)'}`;
  });
}
export function adlDraft(p, today, confDate) {
  const head = `【病棟ADLカンファ ${label(p)}${p.room ? `(${p.room})` : ''}】${confDate ? fmt(confDate) : ''}`;
  const tail = p.adl && p.adl.updatedAt ? `(ADLの更新日 ${fmt(p.adl.updatedAt)})` : '(ADLはまだ入力されていません)';
  return [head, ...adlLines(p, today), tail].join('\n');
}
export function dischargeConfDraft(p, today, date) {
  const head = `【退院前カンファで伝えること ${label(p)}】${date ? fmt(date) : ''}`;
  const tail = p.adl && p.adl.updatedAt ? `(ADLの更新日 ${fmt(p.adl.updatedAt)})` : '(ADLはまだ入力されていません)';
  return [head, ...adlLines(p, today), tail].join('\n');
}

// ---------- 患者ごとの状態 ----------
export function visitDate(p, events) {
  const v = events
    .filter((e) => e.patientId === p.id && e.type === 'homeVisit' && isDate(e.date))
    .map((e) => e.date)
    .sort();
  return v[0] || '';
}
export function hasFirstConf(p, events) {
  return events.some((e) => e.patientId === p.id && e.type === 'firstConf' && isDate(e.date));
}
export function newPatientChecklist(p, events) {
  return [
    { key: 'firstConf', label: '初回カンファの日を入れる', done: hasFirstConf(p, events) },
    { key: 'preState', label: '入院前の状態をメモ', done: !!(p.preState || '').trim() },
    { key: 'inbodyAdmit', label: 'InBody測定(入院時)', done: !!p.inbodyAdmit },
    { key: 'fimAdmit', label: 'FIM入力(入院時)', done: !!p.fimAdmit },
  ];
}
export function planState(p, plans, today) {
  const pl = plans[monthKey(today)];
  if (!pl || !(pl.targets || []).includes(p.id)) return 'none';
  return (pl.explained || []).includes(p.id) ? 'done' : 'todo';
}
export function progress(p, state, today) {
  return {
    plan: planState(p, state.plans, today),
    homeVisit: p.homeVisitNeeded === false ? 'none' : p.homeReportDone ? 'done' : 'todo',
    summary: p.summaryDone ? 'done' : 'todo',
  };
}
// 患者ページ最上部の「残っていること」
export function remainingFor(p, state, today) {
  const out = [];
  for (const c of newPatientChecklist(p, state.events)) if (!c.done) out.push({ key: c.key, label: c.label });
  if (planState(p, state.plans, today) === 'todo') out.push({ key: 'plan', label: '計画書の説明(今月)' });
  if (p.homeVisitNeeded !== false) {
    const v = visitDate(p, state.events);
    if (!v) out.push({ key: 'visitDate', label: '家屋調査の日程を決める' });
    else if (!p.homeReportDone) {
      out.push({ key: 'homeReport', label: v < today ? '家屋調査の報告書' : `家屋調査(${fmt(v)}訪問)・報告書` });
    }
  }
  if (!p.summaryDone) out.push({ key: 'summary', label: p.dischargeDate ? `サマリー(退院 ${fmt(p.dischargeDate)})` : 'サマリー' });
  return out;
}

// ---------- 色 ----------
export function levelFor(due, today) {
  if (!due) return 'green';
  const d = diffDays(due, today);
  if (d <= 0) return 'red';
  if (d <= 6) return 'yellow';
  return 'green';
}
export function summaryLevel(daysLeft) {
  if (daysLeft <= 1) return 3;
  if (daysLeft <= 4) return 2;
  return 1;
}

// ---------- 計画書の月 ----------
// お知らせが出ている月(今月。来月1日が休みで前倒しのときは来月も)
export function planMonths(today, holidays) {
  const now = monthKey(today);
  const next = addMonths(now, 1);
  const out = [];
  if (prevWorkday(now + '-01', holidays) <= today) out.push(now);
  if (prevWorkday(next + '-01', holidays) <= today) out.push(next);
  return out;
}

// ---------- 今日やること ----------
export function activePatients(state) {
  return state.patients.filter((p) => !p.archived && p.mine !== false);
}

export function computeNotices(state, today) {
  const { events, holidays, flags, plans, settings } = state;
  const out = [];
  const pats = activePatients(state);
  const byId = Object.fromEntries(state.patients.map((p) => [p.id, p]));

  for (const p of pats) {
    const d = p.dischargeDate;
    // サマリー:退院7日前から完成まで毎日(大きなカード)
    if (isDate(d) && !p.summaryDone) {
      const start = prevWorkday(addDays(d, -7), holidays);
      if (today >= start) {
        const left = diffDays(d, today);
        out.push({
          key: `summary:${p.id}`, kind: 'summary', pid: p.id, big: true,
          title: `${label(p)} サマリー作成`,
          body: left > 0 ? `退院まであと${left}日です(${fmt(d)})` : left === 0 ? '今日が退院日です' : `退院日(${fmt(d)})を過ぎています`,
          due: d, level: 'red', strength: summaryLevel(left),
        });
      }
    }
    // 家屋調査
    if (p.homeVisitNeeded !== false) {
      const v = visitDate(p, events);
      if (!v && isDate(d) && today <= d) {
        const s45 = prevWorkday(addDays(d, -45), holidays);
        const s30 = prevWorkday(addDays(d, -30), holidays);
        if (today >= s30) {
          out.push({ key: `visitLate:${p.id}`, kind: 'visitAdjust', pid: p.id,
            title: `${label(p)} 家屋調査がまだです`, body: `${diffDays(d, today) ? `退院まであと${diffDays(d, today)}日` : '今日が退院日'}。訪問日を決めて入力しましょう`,
            due: today, level: 'red' });
        } else if (today >= s45) {
          out.push({ key: `visitAdjust:${p.id}`, kind: 'visitAdjust', pid: p.id,
            title: `${label(p)} 家屋調査の日程を調整しましょう`, body: `退院まであと${diffDays(d, today)}日。訪問日が決まったら入力してください`,
            due: addDays(d, -30), level: levelFor(addDays(d, -30), today) });
        }
      }
      if (v && !p.homeReportDone && today >= addDays(v, 1)) {
        out.push({ key: `visitReport:${p.id}`, kind: 'visitReport', pid: p.id,
          title: `${label(p)} 家屋調査の報告書を作りましょう`, body: `訪問日 ${fmt(v)}`,
          due: today, level: 'yellow' });
      }
    }
    // 病棟ADLカンファ
    const adl = currentAdlConf(p, settings.adlTable, today, holidays);
    if (adl && !flags.has(`adl:${p.id}:${adl.confDate}`)) {
      out.push({ key: `adl:${p.id}:${adl.confDate}`, kind: 'adl', pid: p.id,
        title: `${relDay(adl.confDate, today)}は病棟ADLカンファです`, body: `${label(p)}${p.room ? `(${p.room})` : ''}`,
        due: adl.confDate, level: levelFor(adl.confDate, today), draft: adlDraft(p, today, adl.confDate) });
    }
  }

  // 患者ごとの予定(前日〜当日)
  for (const e of events) {
    const p = byId[e.patientId];
    if (!p || p.archived || p.mine === false || !isDate(e.date)) continue;
    if (e.date < today || flags.has(`ev:${e.id}`)) continue;
    const n = noticeDayFor(e.date, holidays);
    if (today < n) continue;
    const name = e.type === 'other' ? e.title || '予定' : e.type === 'firstConf' ? '初回カンファレンス' : e.type === 'dischargeConf' ? '退院前カンファレンス' : '家屋訪問';
    const item = { key: `ev:${e.id}`, kind: 'event', eventId: e.id, pid: p.id, type: e.type,
      title: `${relDay(e.date, today)}は${name}です`, body: `${label(p)}${e.time ? ` ${e.time}から` : ''}`,
      due: e.date, level: levelFor(e.date, today) };
    if (e.type === 'dischargeConf') item.draft = dischargeConfDraft(p, today, e.date);
    if (e.type === 'homeVisit') item.checklist = e.checklist || [];
    out.push(item);
  }

  // 計画書
  for (const mk of pats.length ? planMonths(today, holidays) : []) {
    const pl = plans[mk];
    const m = Number(mk.slice(5));
    if (!pl || !pl.selected) {
      out.push({ key: `planSelect:${mk}`, kind: 'planSelect', month: mk,
        title: `${m}月の計画書の対象者をチェックしましょう`, body: '担当の一覧から対象の人を選びます',
        due: mk + '-01' < today ? today : mk + '-01', level: 'yellow' });
    } else {
      for (const pid of pl.targets || []) {
        const p = byId[pid];
        if (!p || p.archived || (pl.explained || []).includes(pid)) continue;
        out.push({ key: `plan:${mk}:${pid}`, kind: 'planExplain', month: mk, pid,
          title: `${label(p)} 計画書の説明(${m}月)`, body: '説明が済んだら「説明済み」を押してください',
          due: endOfMonth(mk), level: levelFor(endOfMonth(mk), today) });
      }
    }
  }

  // 月の振り返り(毎月1〜7日、先月分)
  if (pats.length && Number(today.slice(8)) <= 7) {
    const prev = addMonths(monthKey(today), -1);
    if (!flags.has(`review:${prev}`)) {
      out.push({ key: `review:${prev}`, kind: 'review', month: prev,
        title: `${Number(prev.slice(5))}月の振り返りを見てみましょう`, body: '先月のがんばりをまとめました',
        due: null, level: 'green' });
    }
  }

  // バックアップ(月1回)
  const base = settings.lastBackupAt || settings.firstUseAt;
  if (base && diffDays(today, base.slice(0, 10)) >= 30 && state.patients.length) {
    out.push({ key: 'backup', kind: 'backup', title: 'バックアップを取りましょう',
      body: settings.lastBackupAt ? `前回は ${fmt(settings.lastBackupAt.slice(0, 10))}` : 'まだ一度も取っていません',
      due: today, level: 'yellow' });
  }

  out.sort((a, b) => (b.big ? 1 : 0) - (a.big ? 1 : 0) || (a.due || '9999').localeCompare(b.due || '9999') || a.key.localeCompare(b.key));
  return out;
}

// ---------- 今週の予定(日ごと) ----------
export function agenda(state, from, to) {
  const { events, holidays, settings } = state;
  const days = {};
  const add = (date, item) => {
    if (date < from || date > to) return;
    (days[date] = days[date] || []).push(item);
  };
  for (const p of activePatients(state)) {
    const d = p.dischargeDate;
    if (isDate(d)) {
      add(d, { kind: 'discharge', pid: p.id, text: `${label(p)} 退院日` });
      if (!p.summaryDone) add(prevWorkday(addDays(d, -7), holidays), { kind: 'summary', pid: p.id, text: `${label(p)} サマリー作成の開始(退院7日前)` });
      if (p.homeVisitNeeded !== false && !visitDate(p, events)) {
        add(prevWorkday(addDays(d, -45), holidays), { kind: 'visitAdjust', pid: p.id, text: `${label(p)} 家屋調査の日程調整を始める` });
        add(prevWorkday(addDays(d, -30), holidays), { kind: 'visitAdjust', pid: p.id, text: `${label(p)} 家屋調査の日程を決める目安` });
      }
    }
    for (const c of adlConfDates(p, settings.adlTable, from, to)) {
      add(c, { kind: 'adl', pid: p.id, text: `${label(p)} 病棟ADLカンファ` });
    }
  }
  for (const e of events) {
    const p = state.patients.find((x) => x.id === e.patientId);
    if (!p || p.archived || !isDate(e.date)) continue;
    const name = e.type === 'other' ? e.title || '予定' : EVENT_TYPES[e.type];
    add(e.date, { kind: 'event', pid: p.id, time: e.time || '', text: `${label(p)} ${name}` });
  }
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addMonths(m, 1)) {
    add(prevWorkday(m + '-01', holidays), { kind: 'plan', text: `${Number(m.slice(5))}月の計画書の対象者チェック` });
  }
  for (const k of Object.keys(days)) days[k].sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  return days;
}

// ---------- iPhoneのカレンダー用(.ics) ----------
function addMinutes(date, time, min) {
  const [h, m] = time.split(':').map(Number);
  let total = h * 60 + m + min;
  let d = date;
  while (total >= 1440) { total -= 1440; d = addDays(d, 1); }
  while (total < 0) { total += 1440; d = addDays(d, -1); }
  return { date: d, time: `${pad(Math.floor(total / 60))}:${pad(total % 60)}` };
}
function minutesBetween(d1, t1, d2, t2) {
  const [h1, m1] = t1.split(':').map(Number);
  const [h2, m2] = t2.split(':').map(Number);
  return diffDays(d2, d1) * 1440 + (h2 * 60 + m2) - (h1 * 60 + m1);
}

export function calendarItemsForPatient(p, state, today) {
  const { events, holidays, settings } = state;
  const t = settings.notifyTime || '07:30';
  const L = label(p);
  const items = [];
  const push = (it) => { if (it.date >= today) items.push(it); };
  const d = p.dischargeDate;
  if (isDate(d)) {
    if (!p.summaryDone) push({ uid: `${p.id}-summary`, title: `${L} サマリー作成`, date: prevWorkday(addDays(d, -7), holidays), time: t });
    if (p.homeVisitNeeded !== false && !visitDate(p, events)) {
      push({ uid: `${p.id}-visit45`, title: `${L} 家屋調査の日程調整`, date: prevWorkday(addDays(d, -45), holidays), time: t });
      push({ uid: `${p.id}-visit30`, title: `${L} 家屋調査がまだなら決める`, date: prevWorkday(addDays(d, -30), holidays), time: t });
    }
    push({ uid: `${p.id}-discharge`, title: `${L} 退院日`, date: d, time: t });
  }
  const v = visitDate(p, events);
  if (v && !p.homeReportDone) push({ uid: `${p.id}-visitReport`, title: `${L} 家屋調査の報告書`, date: addDays(v, 1), time: t });
  for (const e of events.filter((x) => x.patientId === p.id && isDate(x.date))) {
    const name = e.type === 'other' ? e.title || '予定' : EVENT_TYPES[e.type];
    const time = e.time || '09:00';
    const n = noticeDayFor(e.date, holidays);
    push({ uid: `ev-${e.id}`, title: `${L} ${name}`, date: e.date, time, alarmDate: n, alarmTime: t });
  }
  for (const c of adlConfDates(p, settings.adlTable, today, addDays(today, 27))) {
    const n = noticeDayFor(c, holidays);
    push({ uid: `${p.id}-adl-${c}`, title: `${L} 病棟ADLカンファ準備(${fmt(c)})`, date: n, time: t });
  }
  return items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
export function calendarItemsPlans(state, today, months = 6) {
  const items = [];
  const t = state.settings.notifyTime || '07:30';
  for (let i = 0; i <= months; i++) {
    const mk = addMonths(monthKey(today), i);
    const date = prevWorkday(mk + '-01', state.holidays);
    if (date >= today) items.push({ uid: `plan-${mk}`, title: `${Number(mk.slice(5))}月の計画書の対象者チェック`, date, time: t });
  }
  return items;
}

function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
const icsDT = (date, time) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;

export function buildIcs(items, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PT Support//JA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const it of items) {
    const end = addMinutes(it.date, it.time, 15);
    const before = it.alarmDate ? minutesBetween(it.alarmDate, it.alarmTime, it.date, it.time) : 0;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${it.uid}@pt-support`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDT(it.date, it.time)}`,
      `DTEND:${icsDT(end.date, end.time)}`,
      `SUMMARY:${icsEscape(it.title)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(it.title)}`,
      `TRIGGER:${before > 0 ? `-PT${before}M` : 'PT0M'}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
