// Rutina — pantalla y acciones. Sin librerías: todo se dibuja con plantillas y un solo manejador de toques.
import {
  dateKey, nowMinutes, addDays, diffDays, weekday, weekStart, weekKeys, toMin, fromMin, fechaLarga,
  isScheduled, statusOf, freqLabel, weekCount, weekTarget, dueOn, analyze, cellState, weekStats, dayProgress,
  partOf, expandClasses, layoutLanes, blocksFor, DIAS, DIAS_LARGO, MESES,
} from './logic.js';
import { APP, COLORES, newId, load, save, exportJSON, importJSON, seedDemo, persistente } from './store.js';

const DEMO = typeof window !== 'undefined' && !!window.RUTINA_DEMO;
if (DEMO) APP.storageKey = 'rutina.demo';

let S = load();
if (DEMO && !hasStored()) S = seedDemo(dateKey());
function hasStored() { try { return !!localStorage.getItem(APP.storageKey); } catch { return false; } }

const ui = { tab: 'hoy', day: dateKey(), week: dateKey(), pop: null, ringPrev: 0, scrollNow: true, month: null };
const today = () => dateKey();
const habitsActive = () => S.habits.filter((h) => !h.archived);
const byId = (id) => S.habits.find((h) => h.id === id);
const commit = () => save(S);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- Íconos (trazos propios) ----------
const I = {
  hoy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/></svg>',
  agenda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3"/></svg>',
  semana: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20V12M10 20V6M15 20v-9M20 20V4"/></svg>',
  ajustes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>',
  mas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  izq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  der: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  arriba: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14l6-6 6 6"/></svg>',
  abajo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10l6 6 6-6"/></svg>',
  puntos: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5.5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18.5" cy="12" r="1.8"/></svg>',
  cerrar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  tilde: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};
const EMOJIS = ['🧘', '🏋️', '🧠', '🗣️', '🎾', '🏃', '💪', '🥗', '😴', '⏰', '📚', '💧', '🚴', '🏊', '🧴', '📖', '✍️', '🙏', '🍎', '📵', '🧹', '💰', '🎯', '📞'];
const PARTES = [['manana', 'Mañana'], ['tarde', 'Tarde'], ['noche', 'Noche'], ['any', 'Cuando puedas']];

// ---------- Armado ----------
const root = document.getElementById('app');
root.innerHTML = `
  <main class="wrap" id="view"></main>
  <nav class="tabs" aria-label="Secciones">
    ${[['hoy', 'Hoy'], ['agenda', 'Agenda'], ['semana', 'Semana'], ['ajustes', 'Ajustes']].map(([t, n]) => `<button class="tab" data-act="tab" data-tab="${t}">${I[t]}<span>${n}</span></button>`).join('')}
  </nav>
  <button class="btn primary fab" data-act="newBlock" hidden>${I.mas}<span>Bloque</span></button>
  <div class="scrim" data-act="closeSheet"></div>
  <section class="sheet" id="sheet" role="dialog" aria-modal="true"></section>
  <div class="toast" id="toast" role="status"><span></span><button data-act="undo">Deshacer</button></div>`;
const view = document.getElementById('view');
const sheet = document.getElementById('sheet');

function applyTheme() {
  const t = S.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else document.documentElement.removeAttribute('data-theme');
}

function render() {
  applyTheme();
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === ui.tab ? 'page' : 'false'));
  document.querySelector('.fab').hidden = ui.tab !== 'agenda';
  view.innerHTML = ({ hoy: renderHoy, agenda: renderAgenda, semana: renderSemana, ajustes: renderAjustes })[ui.tab]();
  if (ui.tab === 'hoy') animateRing();
  if (ui.tab === 'agenda' && ui.scrollNow) {
    ui.scrollNow = false;
    const el = view.querySelector('.now') || view.querySelector('.ev');
    if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 220) });
  }
  ui.pop = null;
}

// ---------- HOY ----------
function saludo() {
  const m = nowMinutes();
  const n = S.settings.name ? `, ${esc(S.settings.name)}` : '';
  if (m < 5 * 60) return `Buenas noches${n}`;
  if (m < 12 * 60 + 30) return `Buen día${n}`;
  if (m < 20 * 60) return `Buenas tardes${n}`;
  return `Buenas noches${n}`;
}

function habitMeta(h, k) {
  const st = statusOf(S.log, h.id, k);
  const a = analyze(h, S.log, today());
  const out = [];
  if (h.time) out.push(`<span class="num">${h.time}</span>`);
  if (h.freq.type === 'times') out.push(`<span class="num">${weekCount(S.log, h.id, k)}/${weekTarget(h, S.log, k)} esta semana</span>`);
  else if (h.freq.type === 'days' && h.freq.days.length < 5) out.push(`<span>${freqLabel(h.freq)}</span>`);
  if (st === 'skip') out.push('<span>Descanso</span>');
  else if (a.current >= 2) out.push(`<span class="st num">🔥 ${a.current}${a.unit === 'sem' ? ' sem' : ''}</span>`);
  return out.join('');
}

function habitRow(h, k) {
  const st = statusOf(S.log, h.id, k) || '';
  const pop = ui.pop === h.id ? ' pop' : '';
  return `<div class="habit ${st}${pop}" style="--c:${h.color}">
    <button class="tap" data-act="toggle" data-id="${h.id}" aria-pressed="${st === 'done'}">
      <span class="ico" aria-hidden="true">${h.icon || '•'}</span>
      <span class="txt"><span class="name">${esc(h.name)}</span><span class="meta">${habitMeta(h, k)}</span></span>
      <span class="check" aria-hidden="true">${I.tilde}</span>
    </button>
    <button class="icon-btn more" data-act="habitMenu" data-id="${h.id}" aria-label="Opciones de ${esc(h.name)}">${I.puntos}</button>
  </div>`;
}

function sortHabits(list) {
  const idx = (h) => S.habits.indexOf(h);
  return [...list].sort((a, b) => (toMin(a.time) ?? 9999) - (toMin(b.time) ?? 9999) || idx(a) - idx(b));
}

function ringSVG(done, total) {
  const C = 2 * Math.PI * 44;
  const pct = total ? done / total : 0;
  ui.ringTarget = C * (1 - pct);
  const from = ui.ringPrev ?? C;
  return `<div class="ring" role="img" aria-label="${done} de ${total} hábitos hechos">
    <svg viewBox="0 0 104 104"><circle class="bgc" cx="52" cy="52" r="44" fill="none" stroke-width="10"/>
    <circle class="fgc" cx="52" cy="52" r="44" fill="none" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${from}"/></svg>
    <div class="lbl"><div><b class="num">${done}/${total}</b><span>hoy</span></div></div></div>`;
}
function animateRing() {
  const c = view.querySelector('.fgc');
  if (!c) return;
  requestAnimationFrame(() => requestAnimationFrame(() => { c.style.strokeDashoffset = ui.ringTarget; }));
  ui.ringPrev = ui.ringTarget;
}

function nextItem(k) {
  const m = nowMinutes();
  return agendaItems(k).filter((x) => !x.off && !x.done).find((x) => x.end > m);
}

function renderHoy() {
  const k = today();
  ui.day = ui.day || k;
  const due = habitsActive().filter((h) => dueOn(h, S.log, k));
  const other = habitsActive().filter((h) => !dueOn(h, S.log, k));
  const p = dayProgress(S.habits, S.log, k);
  const falta = p.total - p.done;
  const titulo = p.total === 0 ? 'Hoy no hay nada pendiente' : falta === 0 ? 'Día completo. Bien ahí.' : falta === 1 ? 'Te falta 1' : `Te faltan ${falta}`;
  const sub = p.total === 0 ? 'Disfrutá el descanso.' : falta === 0 ? 'Mañana seguimos.' : 'Un toque y listo.';
  const nx = nextItem(k);
  const m = nowMinutes();
  const nextHTML = nx ? `<div class="next"><i style="background:${nx.color}"></i><span>${nx.start <= m ? 'Ahora' : fromMin(nx.start)} · ${esc(nx.label)}</span></div>` : '';

  let lista = '';
  if (!due.length) lista = `<div class="card empty"><b>Nada por hoy</b>Usá “Otros hábitos” si querés sumar algo extra.</div>`;
  else if (S.settings.grouping) {
    for (const [pk, pn] of PARTES) {
      const g = sortHabits(due.filter((h) => partOf(h) === pk));
      if (!g.length) continue;
      const d = g.filter((h) => statusOf(S.log, h.id, k) === 'done').length;
      lista += `<div class="section-t">${pn}<small class="num">${d}/${g.length}</small></div><div class="list">${g.map((h) => habitRow(h, k)).join('')}</div>`;
    }
  } else lista = `<div class="list" style="margin-top:16px">${sortHabits(due).map((h) => habitRow(h, k)).join('')}</div>`;

  const wd = weekday(k);
  const resumen = wd === 0 ? summaryCard(k, 'Cierre de la semana') : wd === 1 ? summaryCard(addDays(k, -7), 'Tu semana pasada') : '';

  return `<header class="head"><div><div class="eyebrow">${cap(fechaLarga(k))}</div><h1>${saludo()}</h1></div><div class="brand">${esc(APP.name)}</div></header>
  <section class="card hero">${ringSVG(p.done, p.total)}<div class="grow"><h2>${titulo}</h2><p>${sub}</p>${nextHTML}</div></section>
  ${resumen}
  ${lista}
  ${other.length ? `<details class="other"><summary>Otros hábitos (hoy no tocan) · ${other.length}${I.abajo}</summary><div class="list">${sortHabits(other).map((h) => habitRow(h, k)).join('')}</div></details>` : ''}
  ${persistente ? '' : '<p class="help">Ojo: este navegador no deja guardar datos. Lo que marques se pierde al cerrar.</p>'}`;
}

function summaryCard(k, titulo) {
  const s = weekStats(S.habits, S.log, k, today());
  if (!s.target) return '';
  const pct = Math.round(s.pct * 100);
  const orden = [...s.per].sort((a, b) => b.pct - a.pct || b.done - a.done);
  const mejor = orden[0];
  const ajustar = [...s.per].sort((a, b) => a.pct - b.pct).find((x) => x.pct < 0.6 && x.id !== mejor.id);
  let racha = null;
  for (const h of habitsActive()) { const a = analyze(h, S.log, today()); if (!racha || a.current > racha.a.current) racha = { h, a }; }
  const frase = pct >= 85 ? 'Semana enorme.' : pct >= 65 ? 'Buena semana, sostenela.' : pct >= 40 ? 'Vas armando la base.' : 'Semana difícil. Se arranca de nuevo, sin culpa.';
  return `<section class="card summary"><h3>${titulo}</h3>
    <div class="row"><div class="big num">${pct}%</div><div class="grow"><div class="muted tiny">${frase}</div><div class="bar" style="margin-top:6px"><i style="width:${pct}%"></i></div></div></div>
    <ul>
      <li>💚 Lo mejor: <b>${esc(mejor.name)}</b> <span class="num muted">${mejor.done}/${mejor.target}</span></li>
      ${ajustar ? `<li>🎯 Para la próxima: <b>${esc(ajustar.name)}</b> <span class="num muted">${ajustar.done}/${ajustar.target}</span></li>` : ''}
      ${racha && racha.a.current >= 2 ? `<li>🔥 Racha más larga: <b>${esc(racha.h.name)}</b> <span class="num muted">${racha.a.current} ${racha.a.unit === 'sem' ? 'semanas' : 'días'}</span></li>` : ''}
    </ul></section>`;
}

// ---------- AGENDA ----------
function agendaItems(k) {
  const items = [];
  const off = !!S.classOff[k];
  for (const c of expandClasses(S.classes, k)) items.push({ ...c, kind: 'clase', color: '#8FB21C', label: c.title, off });
  for (const h of habitsActive()) {
    if (!h.time || !dueOn(h, S.log, k)) continue;
    const st = statusOf(S.log, h.id, k);
    if (st === 'skip') continue;
    const s = toMin(h.time);
    items.push({ kind: 'habito', id: h.id, start: s, end: s + (Number(h.dur) || 30), color: h.color, label: `${h.icon || ''} ${h.name}`.trim(), done: st === 'done' });
  }
  for (const b of blocksFor(S.blocks, k)) {
    const s = toMin(b.start), e = Math.max(toMin(b.end) || 0, s + 15);
    items.push({ kind: 'bloque', id: b.id, start: s, end: e, color: b.color, label: b.title, weekly: b.weekly });
  }
  return items.sort((a, b) => a.start - b.start);
}

function diaNombre(k) {
  const d = diffDays(today(), k);
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Mañana';
  if (d === -1) return 'Ayer';
  return cap(DIAS_LARGO[weekday(k)]);
}

function renderAgenda() {
  const k = ui.day;
  const items = layoutLanes(agendaItems(k));
  const PX = 64;
  let h0 = 7, h1 = 23;
  for (const it of items) { h0 = Math.min(h0, Math.floor(it.start / 60)); h1 = Math.max(h1, Math.ceil(it.end / 60)); }
  h1 = Math.min(h1, 24);
  const y = (min) => ((min - h0 * 60) / 60) * PX;
  let rows = '';
  for (let h = h0; h <= h1; h++) {
    rows += `<div class="tl-hour" style="top:${(h - h0) * PX}px"><span>${String(h % 24).padStart(2, '0')}:00</span></div>`;
    if (h < h1) rows += `<button class="tl-slot" style="top:${(h - h0) * PX}px;height:${PX}px" data-act="newBlock" data-h="${h}" aria-label="Nuevo bloque a las ${h}"></button>`;
  }
  const evs = items.map((it) => {
    const top = y(it.start), hgt = Math.max(24, y(it.end) - top - 2);
    const short = hgt < 42;
    const w = 100 / it.lanes;
    const cls = ['ev', it.kind === 'clase' ? 'clase' : '', it.kind === 'habito' ? 'habito' : '', it.done ? 'hecho' : '', it.off ? 'off' : '', short ? 'short' : ''].join(' ');
    const act = it.kind === 'clase' ? 'classMenu' : it.kind === 'habito' ? 'habitMenu' : 'editBlock';
    const hora = `${fromMin(it.start)}–${fromMin(it.end)}`;
    return `<button class="${cls}" style="--c:${it.color};top:${top}px;height:${hgt}px;left:calc(${it.lane * w}% + 2px);width:calc(${w}% - 6px)" data-act="${act}" data-id="${esc(it.id)}">
      <b>${esc(it.label)}${it.off ? ' (suspendida)' : ''}</b><span class="num">${short ? fromMin(it.start) : hora}${it.weekly && !short ? ' · se repite' : ''}</span></button>`;
  }).join('');
  const nowLine = k === today() && nowMinutes() >= h0 * 60 && nowMinutes() <= h1 * 60 ? `<div class="now" style="top:${y(nowMinutes())}px"></div>` : '';
  const clases = expandClasses(S.classes, k);
  const off = !!S.classOff[k];
  return `<header class="head"><div><div class="eyebrow">Agenda del día</div><h1>${diaNombre(k)}</h1></div><div class="brand">${esc(APP.name)}</div></header>
    <div class="daynav"><button class="icon-btn" data-act="day" data-d="-1" aria-label="Día anterior">${I.izq}</button>
      <button class="lbl" data-act="day" data-d="0">${cap(fechaLarga(k))}<small>${k === today() ? 'Hoy' : 'Volver a hoy'}</small></button>
      <button class="icon-btn" data-act="day" data-d="1" aria-label="Día siguiente">${I.der}</button></div>
    ${S.settings.classesReviewed ? '' : `<div class="notice"><p>Tus clases son <b>de ejemplo</b>. Cargá tus horarios reales una vez y quedan para todas las semanas.</p><button class="btn sm primary" data-act="classes">Cargar</button></div>`}
    <div class="chips">
      ${clases.length ? `<span class="chip"><i style="background:#8FB21C"></i>${clases.length} ${clases.length === 1 ? 'clase' : 'clases'}</span>
        <button class="chip ${off ? 'on' : ''}" data-act="toggleOff">${off ? 'Sin clases este día · Reactivar' : 'Suspender clases'}</button>` : '<span class="chip">Sin clases este día</span>'}
      <button class="chip" data-act="classes">Mis clases</button>
    </div>
    <div class="timeline"><div class="tl-inner" style="height:${(h1 - h0) * PX}px">${rows}${evs}${nowLine}</div></div>
    <p class="help">Tocá un horario vacío para agregar un bloque. Los hábitos con hora aparecen punteados.</p>`;
}

// ---------- SEMANA ----------
function weekLabel(k) {
  const ks = weekKeys(k);
  const [, m1, d1] = ks[0].split('-').map(Number), [, m2, d2] = ks[6].split('-').map(Number);
  return m1 === m2 ? `${d1} al ${d2} de ${MESES[m2 - 1]}` : `${d1} de ${MESES[m1 - 1]} al ${d2} de ${MESES[m2 - 1]}`;
}

function renderSemana() {
  const k = ui.week, t = today();
  const ks = weekKeys(k);
  const enCurso = ks.includes(t);
  const hs = habitsActive().filter((h) => !h.created || h.created <= ks[6]);
  const head = `<span></span>${ks.map((d) => `<span class="hd ${d === t ? 'hoy' : ''}">${DIAS[weekday(d)].charAt(0)}<br>${Number(d.slice(8))}</span>`).join('')}`;
  const rows = hs.map((h) => {
    const a = analyze(h, S.log, t);
    return `<span class="hn"><span aria-hidden="true">${h.icon}</span><span>${esc(h.name)}</span></span>` +
      ks.map((d) => `<span class="cell ${cellState(h, S.log, d, t, a)}" style="--c:${h.color}" title="${d}"></span>`).join('');
  }).join('');
  const streaks = sortHabits(hs).sort((a, b) => analyze(b, S.log, t).current - analyze(a, S.log, t).current).map((h) => {
    const a = analyze(h, S.log, t);
    const u = a.unit === 'sem' ? (a.current === 1 ? 'semana' : 'semanas') : (a.current === 1 ? 'día' : 'días');
    return `<button class="streak" style="--c:${h.color}" data-act="month" data-id="${h.id}"><span class="ico">${h.icon}</span>
      <span class="grow"><b>${esc(h.name)}</b><br><span class="muted tiny">${freqLabel(h.freq)} · mejor: <span class="num">${a.best}</span></span></span>
      <span class="val"><b class="num">${a.current ? '🔥 ' : ''}${a.current}</b><span>${u}</span></span></button>`;
  }).join('');
  return `<header class="head"><div><div class="eyebrow">Rachas y semana</div><h1>${enCurso ? 'Esta semana' : 'Semana'}</h1></div><div class="brand">${esc(APP.name)}</div></header>
    <div class="daynav weeknav"><button class="icon-btn" data-act="week" data-d="-7" aria-label="Semana anterior">${I.izq}</button>
      <button class="lbl" data-act="week" data-d="0">${cap(weekLabel(k))}<small>${enCurso ? 'En curso' : 'Volver a esta semana'}</small></button>
      <button class="icon-btn" data-act="week" data-d="7" aria-label="Semana siguiente" ${enCurso ? 'disabled style="opacity:.3"' : ''}>${I.der}</button></div>
    ${summaryCard(k, enCurso ? (weekday(t) === 0 ? 'Cierre de la semana' : 'Cómo va la semana') : 'Resumen de la semana') || '<div class="card empty"><b>Sin datos esta semana</b>Marcá tus hábitos en Hoy.</div>'}
    <section class="card"><div class="grid">${head}${rows}</div>
      <div class="legend"><span><i class="cell done"></i>Hecho</span><span><i class="cell joker"></i>Comodín</span><span><i class="cell skip"></i>Descanso</span><span><i class="cell miss"></i>Sin marcar</span></div></section>
    <div class="section-t">Rachas<small>1 comodín por semana: un día malo no te corta</small></div>
    <div class="streaks">${streaks}</div>`;
}

function monthSheet(id) {
  const h = byId(id); if (!h) return;
  const t = today();
  const ym = ui.month || t.slice(0, 7);
  const first = `${ym}-01`;
  const [y, m] = ym.split('-').map(Number);
  const dias = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (weekday(first) + 6) % 7;
  const a = analyze(h, S.log, t);
  let cells = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<span class="hd" style="text-align:center;font-size:12px;color:var(--faint);font-weight:700">${d}</span>`).join('');
  cells += '<span class="cell empty"></span>'.repeat(lead);
  let hechos = 0;
  for (let i = 0; i < dias; i++) {
    const d = addDays(first, i);
    const st = cellState(h, S.log, d, t, a);
    if (st === 'done') hechos++;
    cells += `<span class="cell ${st}" style="--c:${h.color}" title="${d}">${i + 1}</span>`;
  }
  const prev = addDays(first, -1).slice(0, 7), next = addDays(first, 32).slice(0, 7);
  openSheet(`<h2><span>${h.icon} ${esc(h.name)}</span><button class="icon-btn" data-act="closeSheet" aria-label="Cerrar">${I.cerrar}</button></h2>
    <div class="two" style="margin-bottom:14px"><div class="card" style="margin:0"><div class="muted tiny">Racha</div><b class="num" style="font-size:24px">${a.current} ${a.unit === 'sem' ? 'sem' : 'd'}</b></div>
      <div class="card" style="margin:0"><div class="muted tiny">Mejor racha</div><b class="num" style="font-size:24px">${a.best} ${a.unit === 'sem' ? 'sem' : 'd'}</b></div></div>
    <div class="daynav"><button class="icon-btn" data-act="monthNav" data-id="${id}" data-m="${prev}" aria-label="Mes anterior">${I.izq}</button>
      <span class="lbl" style="display:grid;place-items:center">${cap(MESES[m - 1])} ${y}<small class="num">${hechos} ${hechos === 1 ? 'vez' : 'veces'}</small></span>
      <button class="icon-btn" data-act="monthNav" data-id="${id}" data-m="${next}" aria-label="Mes siguiente" ${ym >= t.slice(0, 7) ? 'disabled style="opacity:.3"' : ''}>${I.der}</button></div>
    <div class="card"><div class="month">${cells}</div></div>
    <p class="help">${freqLabel(h.freq)}. Los días sin marcar se ven apagados, no en rojo: lo importante es volver.</p>`);
}

// ---------- AJUSTES ----------
function renderAjustes() {
  const r = S.settings.remind;
  const act = S.habits.filter((h) => !h.archived), arch = S.habits.filter((h) => h.archived);
  const hrow = (h, i, n) => `<div class="set-row" style="--c:${h.color}"><span class="ico">${h.icon}</span>
      <span class="lbl"><b>${esc(h.name)}</b><span>${freqLabel(h.freq)}${h.time ? ' · ' + h.time : ''}</span></span>
      <button class="icon-btn" data-act="move" data-id="${h.id}" data-d="-1" aria-label="Subir" ${i === 0 ? 'disabled style="opacity:.25"' : ''}>${I.arriba}</button>
      <button class="icon-btn" data-act="move" data-id="${h.id}" data-d="1" aria-label="Bajar" ${i === n - 1 ? 'disabled style="opacity:.25"' : ''}>${I.abajo}</button>
      <button class="icon-btn" data-act="editHabit" data-id="${h.id}" aria-label="Editar">${I.puntos}</button></div>`;
  const notif = typeof Notification === 'undefined' ? 'no' : Notification.permission;
  const notifTxt = notif === 'granted' ? 'Permiso dado' : notif === 'denied' ? 'Bloqueados en este navegador' : notif === 'no' ? 'Este navegador no los permite' : 'Falta dar permiso';
  return `<header class="head"><div><div class="eyebrow">Tu ${esc(APP.name)}</div><h1>Ajustes</h1></div><div class="brand">${esc(APP.name)}</div></header>
    <div class="section-t">Hábitos<small class="num">${act.length} activos</small></div>
    <div class="set-list">${act.map((h, i) => hrow(h, i, act.length)).join('')}</div>
    <button class="btn block" style="margin-top:8px" data-act="newHabit">${I.mas} Nuevo hábito</button>
    <p class="help">Consejo: con 5 o 6 hábitos activos se sostiene mejor. Los que no uses, archivalos.</p>
    ${arch.length ? `<div class="section-t">Archivados</div><div class="set-list">${arch.map((h) => `<div class="set-row" style="--c:${h.color}"><span class="ico">${h.icon}</span><span class="lbl"><b>${esc(h.name)}</b></span><button class="btn sm ghost" data-act="unarchive" data-id="${h.id}">Recuperar</button></div>`).join('')}</div>` : ''}

    <div class="section-t">Mis clases</div>
    <div class="set-list">${S.classes.map((c) => `<div class="set-row" style="--c:#8FB21C"><span class="ico">🎾</span><span class="lbl"><b>${esc(c.club)}</b><span>${freqLabel({ type: 'days', days: c.days })} · ${c.from} a ${c.to}</span></span><button class="icon-btn" data-act="editClass" data-id="${c.id}" aria-label="Editar">${I.puntos}</button></div>`).join('') || '<div class="set-row"><span class="lbl muted">Sin clases cargadas</span></div>'}</div>
    <button class="btn block" style="margin-top:8px" data-act="editClass">${I.mas} Agregar horario de clases</button>

    <div class="section-t">Recordatorios</div>
    <div class="set-list">
      <label class="set-row"><span class="lbl"><b>Avisos</b><span>${notifTxt}</span></span><span class="switch"><input type="checkbox" data-set="remind.on" ${r.on ? 'checked' : ''}><i></i></span></label>
      <div class="set-row"><span class="lbl"><b>Mañana</b><span>Qué toca hoy</span></span><input class="input" style="width:120px" type="time" data-set="remind.morning" value="${r.morning}"></div>
      <div class="set-row"><span class="lbl"><b>Noche</b><span>Lo que te falta</span></span><input class="input" style="width:120px" type="time" data-set="remind.evening" value="${r.evening}"></div>
      <label class="set-row"><span class="lbl"><b>A la hora de cada hábito</b><span>Solo los que tienen hora</span></span><span class="switch"><input type="checkbox" data-set="remind.habits" ${r.habits ? 'checked' : ''}><i></i></span></label>
      <div class="set-row"><button class="btn sm" data-act="testNotif">Probar aviso</button><button class="btn sm ghost" data-act="ics">Pasarlos al calendario</button></div>
    </div>
    <p class="help">En iPhone los avisos solo andan con la app instalada (Compartir → Agregar a inicio) y abierta desde el ícono. Para que suenen siempre, aunque la app esté cerrada, usá “Pasarlos al calendario”: se agregan como eventos con alarma.</p>

    <div class="section-t">Preferencias</div>
    <div class="set-list">
      <div class="set-row"><span class="lbl"><b>Tu nombre</b></span><input class="input" style="width:150px" data-set="name" value="${esc(S.settings.name)}" maxlength="20" autocomplete="given-name"></div>
      <label class="set-row"><span class="lbl"><b>Agrupar por momento</b><span>Mañana, tarde y noche</span></span><span class="switch"><input type="checkbox" data-set="grouping" ${S.settings.grouping ? 'checked' : ''}><i></i></span></label>
      <div class="set-row"><span class="lbl"><b>Apariencia</b></span><div class="seg" style="width:210px">${[['auto', 'Auto'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, n]) => `<button data-act="theme" data-v="${v}" aria-pressed="${S.settings.theme === v}">${n}</button>`).join('')}</div></div>
    </div>

    <div class="section-t">Copia de seguridad</div>
    <div class="set-list"><div class="set-row"><button class="btn sm" data-act="export">Exportar</button><label class="btn sm ghost">Importar<input type="file" accept="application/json,.json" data-set="import" class="sr"></label></div></div>
    <p class="help">Tus datos quedan solo en este teléfono. Exportá una copia cada tanto.</p>
    ${DEMO ? '<div class="set-list" style="margin-top:14px"><div class="set-row"><span class="lbl"><b>Demo</b><span>Volver a los datos de ejemplo</span></span><button class="btn sm danger" data-act="resetDemo">Reiniciar</button></div></div>' : ''}
    <p class="help" style="text-align:center;margin-top:24px">${esc(APP.name)} · ${esc(APP.tagline)}</p>`;
}

// ---------- Hojas ----------
function openSheet(html) {
  sheet.innerHTML = '<div class="grab"></div>' + html;
  sheet.scrollTop = 0;
  document.body.classList.add('open');
}
function closeSheet() { document.body.classList.remove('open'); ui.month = null; }

const pressed = (group) => [...sheet.querySelectorAll(`[data-group="${group}"] [aria-pressed="true"]`)].map((b) => b.dataset.v);
const segHTML = (group, opts, val) => `<div class="seg" data-group="${group}">${opts.map(([v, n]) => `<button type="button" data-pick="${v}" data-v="${v}" aria-pressed="${String(v) === String(val)}">${n}</button>`).join('')}</div>`;
const daysHTML = (group, days) => `<div class="days" data-group="${group}" data-multi="1">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button type="button" data-pick="${d}" data-v="${d}" aria-pressed="${days.includes(d)}" aria-label="${DIAS_LARGO[d]}">${DIAS[d].charAt(0)}</button>`).join('')}</div>`;
const swHTML = (val) => `<div class="swatches" data-group="color">${COLORES.map((c) => `<button type="button" data-pick="${c}" data-v="${c}" style="--c:${c}" aria-pressed="${c === val}" aria-label="Color"></button>`).join('')}</div>`;

function habitMenu(id, k = today()) {
  const h = byId(id); if (!h) return;
  const st = statusOf(S.log, id, k);
  const cuando = k === today() ? 'hoy' : diaNombre(k).toLowerCase();
  openSheet(`<h2><span>${h.icon} ${esc(h.name)}</span><button class="icon-btn" data-act="closeSheet" aria-label="Cerrar">${I.cerrar}</button></h2>
    <p class="muted" style="margin-top:-8px">${freqLabel(h.freq)}${h.time ? ' · ' + h.time : ''}</p>
    <div class="actions">
      <button class="btn primary block" data-act="setStatus" data-id="${id}" data-k="${k}" data-v="${st === 'done' ? '' : 'done'}">${st === 'done' ? 'Desmarcar' : `Hecho ${cuando}`}</button>
      <button class="btn block" data-act="setStatus" data-id="${id}" data-k="${k}" data-v="${st === 'skip' ? '' : 'skip'}">${st === 'skip' ? 'Quitar descanso' : `Descanso ${cuando} (no cuenta)`}</button>
      <button class="btn block" data-act="month" data-id="${id}">Ver calendario y racha</button>
      <button class="btn ghost block" data-act="editHabit" data-id="${id}">Editar hábito</button>
    </div>`);
}

function habitForm(id) {
  const h = id ? byId(id) : { name: '', icon: '🎯', color: COLORES[0], freq: { type: 'daily' }, time: null, part: null, dur: 30 };
  const f = h.freq;
  openSheet(`<h2><span>${id ? 'Editar hábito' : 'Nuevo hábito'}</span><button class="icon-btn" data-act="closeSheet" aria-label="Cerrar">${I.cerrar}</button></h2>
    <form id="fHabit" data-id="${id || ''}">
      <div class="field"><label for="hName">Nombre</label><input class="input" id="hName" value="${esc(h.name)}" maxlength="40" required placeholder="Ej.: Estirar 10 minutos"></div>
      <div class="field"><span class="lb">Ícono</span><div class="emojis" data-group="icon">${EMOJIS.map((e) => `<button type="button" data-pick="${e}" data-v="${e}" aria-pressed="${e === h.icon}">${e}</button>`).join('')}</div></div>
      <div class="field"><span class="lb">Color</span>${swHTML(h.color)}</div>
      <div class="field"><span class="lb">Frecuencia</span>${segHTML('freq', [['daily', 'Todos los días'], ['days', 'Días fijos'], ['times', 'Veces x sem.']], f.type)}</div>
      <div class="field" data-show="days" ${f.type === 'days' ? '' : 'hidden'}><span class="lb">Qué días</span>${daysHTML('days', f.type === 'days' ? f.days : [1, 2, 3, 4, 5])}</div>
      <div class="field" data-show="times" ${f.type === 'times' ? '' : 'hidden'}><span class="lb">Cuántas veces por semana</span>
        <div class="stepper"><button type="button" data-act="step" data-d="-1" aria-label="Menos">−</button><b class="num" id="hN">${f.type === 'times' ? f.n : 3}</b><button type="button" data-act="step" data-d="1" aria-label="Más">+</button></div></div>
      <div class="two"><div class="field"><label for="hTime">Hora (opcional)</label><input class="input" id="hTime" type="time" value="${h.time || ''}"></div>
        <div class="field"><label for="hDur">Duración</label><select class="input" id="hDur">${[10, 15, 30, 45, 60, 90, 120].map((m) => `<option value="${m}" ${Number(h.dur) === m ? 'selected' : ''}>${m < 60 ? m + ' min' : m / 60 + ' h'}</option>`).join('')}</select></div></div>
      <div class="field"><span class="lb">Momento del día</span>${segHTML('part', [['', 'Auto'], ['manana', 'Mañana'], ['tarde', 'Tarde'], ['noche', 'Noche']], h.part || '')}</div>
      <p class="help" style="margin-top:-6px">Con hora, aparece en la agenda y te puede avisar.</p>
      <div class="actions"><button class="btn primary block" type="submit">Guardar</button>
        ${id ? `<button class="btn block" type="button" data-act="archive" data-id="${id}">Archivar (guarda la historia)</button><button class="btn danger block" type="button" data-act="delHabit" data-id="${id}">Borrar para siempre</button>` : ''}</div>
    </form>`);
}

function saveHabit(form) {
  const id = form.dataset.id;
  const name = form.querySelector('#hName').value.trim();
  if (!name) { form.querySelector('#hName').focus(); return; }
  const type = pressed('freq')[0] || 'daily';
  const freq = type === 'days' ? { type, days: pressed('days').map(Number) } : type === 'times' ? { type, n: Number(form.querySelector('#hN').textContent) } : { type: 'daily' };
  if (type === 'days' && !freq.days.length) { toast('Elegí al menos un día'); return; }
  const data = { name, icon: pressed('icon')[0] || '🎯', color: pressed('color')[0] || COLORES[0], freq, time: form.querySelector('#hTime').value || null, dur: Number(form.querySelector('#hDur').value) || 30, part: pressed('part')[0] || null };
  if (id) Object.assign(byId(id), data);
  else S.habits.push({ id: newId('h'), archived: false, created: today(), ...data });
  commit(); closeSheet(); render(); toast(id ? 'Hábito actualizado' : 'Hábito agregado');
}

function blockForm(id, hour) {
  const b = id ? S.blocks.find((x) => x.id === id) : { title: '', start: fromMin((hour ?? Math.min(23, Math.floor(nowMinutes() / 60) + 1)) * 60), end: fromMin(Math.min(23 * 60 + 59, ((hour ?? Math.floor(nowMinutes() / 60) + 1) + 1) * 60)), color: COLORES[1], weekly: false };
  if (!b) return;
  const dn = DIAS_LARGO[b.weekly ? b.wd : weekday(ui.day)];
  openSheet(`<h2><span>${id ? 'Editar bloque' : 'Nuevo bloque'}</span><button class="icon-btn" data-act="closeSheet" aria-label="Cerrar">${I.cerrar}</button></h2>
    <form id="fBlock" data-id="${id || ''}">
      <div class="field"><label for="bTitle">Qué</label><input class="input" id="bTitle" value="${esc(b.title)}" maxlength="50" required placeholder="Ej.: Grabar reel" enterkeyhint="done"></div>
      <div class="two"><div class="field"><label for="bStart">Desde</label><input class="input" id="bStart" type="time" value="${b.start}" required></div>
        <div class="field"><label for="bEnd">Hasta</label><input class="input" id="bEnd" type="time" value="${b.end}" required></div></div>
      <div class="field"><span class="lb">Color</span>${swHTML(b.color)}</div>
      <label class="set-row" style="padding:0 2px;border:0"><span class="lbl"><b>Repetir todos los ${dn}</b></span><span class="switch"><input type="checkbox" id="bWeekly" ${b.weekly ? 'checked' : ''}><i></i></span></label>
      <div class="actions"><button class="btn primary block" type="submit">Guardar</button>
        ${id && b.weekly ? `<button class="btn block" type="button" data-act="delBlock" data-id="${id}" data-only="1">Borrar solo este día</button>` : ''}
        ${id ? `<button class="btn danger block" type="button" data-act="delBlock" data-id="${id}">${b.weekly ? 'Borrar todas las semanas' : 'Borrar'}</button>` : ''}</div>
    </form>`);
  if (!id) setTimeout(() => sheet.querySelector('#bTitle')?.focus(), 300);
}

function saveBlock(form) {
  const id = form.dataset.id;
  const title = form.querySelector('#bTitle').value.trim();
  if (!title) { form.querySelector('#bTitle').focus(); return; }
  const start = form.querySelector('#bStart').value;
  let end = form.querySelector('#bEnd').value;
  if (!end || toMin(end) <= toMin(start)) end = fromMin(Math.min(23 * 60 + 59, toMin(start) + 30));
  const weekly = form.querySelector('#bWeekly').checked;
  const data = { title, start, end, color: pressed('color')[0] || COLORES[1], weekly };
  if (weekly) { data.wd = id ? (S.blocks.find((x) => x.id === id).wd ?? weekday(ui.day)) : weekday(ui.day); data.since = data.since || ui.day; data.date = null; }
  else data.date = ui.day;
  if (id) Object.assign(S.blocks.find((x) => x.id === id), data);
  else S.blocks.push({ id: newId('b'), ...data });
  commit(); closeSheet(); render(); toast(id ? 'Bloque actualizado' : 'Bloque agregado');
}

function classesSheet() {
  openSheet(`<h2><span>Mis clases</span><button class="icon-btn" data-act="closeSheet" aria-label="Cerrar">${I.cerrar}</button></h2>
    <p class="muted" style="margin-top:-6px">Cargá cada horario una vez (club, días y de qué hora a qué hora). La agenda arma las clases sola, todas las semanas.</p>
    <div class="set-list">${S.classes.map((c) => `<div class="set-row"><span class="ico" style="--c:#8FB21C">🎾</span><span class="lbl"><b>${esc(c.club)}</b><span>${freqLabel({ type: 'days', days: c.days })} · ${c.from} a ${c.to} · ${c.dur} min</span></span><button class="icon-btn" data-act="editClass" data-id="${c.id}" aria-label="Editar">${I.puntos}</button></div>`).join('') || '<div class="set-row muted">Todavía no cargaste clases</div>'}</div>
    <div class="actions"><button class="btn block" data-act="editClass">${I.mas} Agregar horario</button>
      ${S.settings.classesReviewed ? '' : '<button class="btn primary block" data-act="classesOk">Están bien así</button>'}</div>`);
}

function classForm(id) {
  const c = id ? S.classes.find((x) => x.id === id) : { club: 'La 10', days: [1, 2, 3, 4, 5], from: '18:00', to: '21:00', dur: 60 };
  openSheet(`<h2><span>${id ? 'Editar horario' : 'Nuevo horario'}</span><button class="icon-btn" data-act="closeSheet" aria-label="Cerrar">${I.cerrar}</button></h2>
    <form id="fClass" data-id="${id || ''}">
      <div class="field"><label for="cClub">Club</label><input class="input" id="cClub" list="clubes" value="${esc(c.club)}" maxlength="30" required><datalist id="clubes"><option value="Jump"><option value="La 10"></datalist></div>
      <div class="field"><span class="lb">Días</span>${daysHTML('cdays', c.days)}</div>
      <div class="two"><div class="field"><label for="cFrom">Primera clase</label><input class="input" id="cFrom" type="time" value="${c.from}" required></div>
        <div class="field"><label for="cTo">Termina la última</label><input class="input" id="cTo" type="time" value="${c.to}" required></div></div>
      <div class="field"><span class="lb">Duración de cada clase</span>${segHTML('cdur', [[45, '45 min'], [60, '1 h'], [90, '1 h 30']], c.dur)}</div>
      <div class="actions"><button class="btn primary block" type="submit">Guardar</button>
        ${id ? `<button class="btn danger block" type="button" data-act="delClass" data-id="${id}">Borrar horario</button>` : ''}</div>
    </form>`);
}

function saveClass(form) {
  const id = form.dataset.id;
  const club = form.querySelector('#cClub').value.trim() || 'Club';
  const days = pressed('cdays').map(Number);
  if (!days.length) { toast('Elegí al menos un día'); return; }
  const from = form.querySelector('#cFrom').value, dur = Number(pressed('cdur')[0]) || 60;
  let to = form.querySelector('#cTo').value;
  if (!to || toMin(to) < toMin(from) + dur) to = fromMin(toMin(from) + dur);
  const data = { club, days, from, to, dur };
  if (id) Object.assign(S.classes.find((x) => x.id === id), data);
  else S.classes.push({ id: newId('c'), ...data });
  S.settings.classesReviewed = true;
  commit(); render(); classesSheet(); toast('Clases guardadas');
}

function classMenu(itemId) {
  const k = ui.day, off = !!S.classOff[k];
  const it = expandClasses(S.classes, k).find((x) => x.id === itemId);
  openSheet(`<h2><span>${esc(it ? it.title : 'Clase')}</span><button class="icon-btn" data-act="closeSheet" aria-label="Cerrar">${I.cerrar}</button></h2>
    <div class="actions"><button class="btn block" data-act="toggleOff">${off ? 'Reactivar las clases de este día' : 'Suspender las clases de este día'}</button>
      <button class="btn ghost block" data-act="classes">Editar mis clases</button></div>
    <p class="help">Suspender sirve para lluvia o feriados: solo afecta a tu agenda, no avisa a nadie.</p>`);
}

// ---------- Aviso con deshacer ----------
let toastTimer, undoFn = null;
function toast(msg, undo) {
  const t = document.getElementById('toast');
  t.querySelector('span').textContent = msg;
  t.querySelector('button').hidden = !undo;
  undoFn = undo || null;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); undoFn = null; }, undo ? 5000 : 2200);
}

function setStatus(id, k, v) {
  const prev = statusOf(S.log, id, k);
  S.log[k] = S.log[k] || {};
  if (v) S.log[k][id] = v; else delete S.log[k][id];
  if (!Object.keys(S.log[k]).length) delete S.log[k];
  commit();
  return prev;
}

// ---------- Recordatorios ----------
const FIRED = 'rutina.avisos';
function firedGet() { try { return JSON.parse(localStorage.getItem(FIRED)) || {}; } catch { return firedMem; } }
let firedMem = {};
function firedSet(o) { firedMem = o; try { localStorage.setItem(FIRED, JSON.stringify(o)); } catch { /* sin almacenamiento */ } }

async function notify(title, body, tag) {
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg && reg.showNotification) return reg.showNotification(title, { body, tag, icon: 'icons/icono-192.png', badge: 'icons/icono-192.png' });
    if (typeof Notification !== 'undefined') new Notification(title, { body, tag });
  } catch { /* algunos navegadores no dejan */ }
}

function remindTick() {
  const r = S.settings.remind;
  if (!r.on || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const k = today(), m = nowMinutes();
  let f = firedGet();
  if (f.k !== k) f = { k, ids: [] };
  const due = habitsActive().filter((h) => dueOn(h, S.log, k) && !statusOf(S.log, h.id, k));
  const list = [];
  if (r.morning) list.push({ id: 'manana', at: toMin(r.morning), go: () => due.length && notify(`Buen día ☀️`, `Hoy tenés ${due.length} ${due.length === 1 ? 'hábito' : 'hábitos'}. Arrancá por: ${due[0].name}.`, 'manana') });
  if (r.evening) list.push({ id: 'noche', at: toMin(r.evening), go: () => due.length && notify('Cierre del día', `Te ${due.length === 1 ? 'falta' : 'faltan'}: ${due.slice(0, 4).map((h) => h.name).join(', ')}.`, 'noche') });
  if (r.habits) for (const h of due) if (h.time) list.push({ id: h.id, at: toMin(h.time), go: () => notify(`${h.icon} ${h.name}`, 'Es la hora. Un toque y listo.', h.id) });
  for (const it of list) {
    if (m >= it.at && m < it.at + 10 && !f.ids.includes(it.id)) { f.ids.push(it.id); it.go(); }
  }
  firedSet(f);
}

function icsText() {
  const r = S.settings.remind;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const d0 = today().replace(/-/g, '');
  const BY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const ev = (uid, title, hhmm, rule, dur = 15) => {
    const s = hhmm.replace(':', '') + '00';
    const e = fromMin(toMin(hhmm) + dur).replace(':', '') + '00';
    return ['BEGIN:VEVENT', `UID:${uid}@rutina`, `DTSTAMP:${stamp}`, `DTSTART;TZID=America/Argentina/Cordoba:${d0}T${s}`, `DTEND;TZID=America/Argentina/Cordoba:${d0}T${e}`, `RRULE:${rule}`, `SUMMARY:${title}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${title}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT'].join('\r\n');
  };
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${APP.name}//ES`, 'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE', 'TZID:America/Argentina/Cordoba', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:-0300', 'TZOFFSETTO:-0300', 'TZNAME:-03', 'END:STANDARD', 'END:VTIMEZONE'];
  if (r.morning) out.push(ev('manana', `${APP.name}: qué toca hoy`, r.morning, 'FREQ=DAILY'));
  if (r.evening) out.push(ev('noche', `${APP.name}: cerrá el día`, r.evening, 'FREQ=DAILY'));
  if (r.habits) for (const h of habitsActive()) {
    if (!h.time) continue;
    const rule = h.freq.type === 'days' ? `FREQ=WEEKLY;BYDAY=${h.freq.days.map((d) => BY[d]).join(',')}` : 'FREQ=DAILY';
    out.push(ev(h.id, `${h.icon} ${h.name}`, h.time, rule, Number(h.dur) || 15));
  }
  out.push('END:VCALENDAR');
  return out.join('\r\n');
}

function download(name, text, type) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch { toast('No se pudo descargar en este navegador'); }
}

// ---------- Toques ----------
const actions = {
  tab: (el) => { ui.tab = el.dataset.tab; if (ui.tab === 'agenda') { ui.scrollNow = true; } window.scrollTo({ top: 0 }); render(); },
  toggle: (el) => {
    const id = el.dataset.id, k = today();
    const prev = statusOf(S.log, id, k);
    const next = prev === 'done' ? '' : 'done';
    setStatus(id, k, prev === 'skip' ? '' : next);
    if (next === 'done' && prev !== 'skip') { ui.pop = id; try { navigator.vibrate && navigator.vibrate(12); } catch { /* */ } }
    render();
    const h = byId(id);
    toast(prev === 'done' ? `${h.name}: desmarcado` : prev === 'skip' ? `${h.name}: vuelve a contar hoy` : `${h.name} ✓`, () => { setStatus(id, k, prev || ''); render(); });
  },
  habitMenu: (el) => habitMenu(el.dataset.id, ui.tab === 'agenda' ? ui.day : today()),
  setStatus: (el) => {
    const { id, k, v } = el.dataset;
    const prev = setStatus(id, k, v);
    if (v === 'done' && k === today()) ui.pop = id;
    closeSheet(); render();
    toast(v === 'done' ? 'Marcado ✓' : v === 'skip' ? 'Descanso: hoy no cuenta' : 'Listo', () => { setStatus(id, k, prev || ''); render(); });
  },
  month: (el) => { ui.month = null; monthSheet(el.dataset.id); },
  monthNav: (el) => { ui.month = el.dataset.m; monthSheet(el.dataset.id); },
  closeSheet: () => closeSheet(),
  undo: () => { const f = undoFn; undoFn = null; document.getElementById('toast').classList.remove('show'); if (f) f(); },
  day: (el) => { const d = Number(el.dataset.d); ui.day = d ? addDays(ui.day, d) : today(); ui.scrollNow = !d; render(); },
  week: (el) => { const d = Number(el.dataset.d); ui.week = d ? addDays(ui.week, d) : today(); render(); },
  newBlock: (el) => blockForm(null, el.dataset.h != null ? Number(el.dataset.h) : undefined),
  editBlock: (el) => blockForm(el.dataset.id),
  delBlock: (el) => {
    const b = S.blocks.find((x) => x.id === el.dataset.id); if (!b) return;
    const copia = JSON.parse(JSON.stringify(S.blocks));
    if (el.dataset.only) b.except = [...(b.except || []), ui.day];
    else S.blocks = S.blocks.filter((x) => x !== b);
    commit(); closeSheet(); render();
    toast('Bloque borrado', () => { S.blocks = copia; commit(); render(); });
  },
  classMenu: (el) => classMenu(el.dataset.id),
  classes: () => classesSheet(),
  classesOk: () => { S.settings.classesReviewed = true; commit(); closeSheet(); render(); toast('Listo, quedan guardadas'); },
  editClass: (el) => classForm(el.dataset.id),
  delClass: (el) => { S.classes = S.classes.filter((c) => c.id !== el.dataset.id); commit(); render(); classesSheet(); toast('Horario borrado'); },
  toggleOff: () => { const k = ui.day; if (S.classOff[k]) delete S.classOff[k]; else S.classOff[k] = true; commit(); closeSheet(); render(); },
  newHabit: () => habitForm(null),
  editHabit: (el) => habitForm(el.dataset.id),
  archive: (el) => { const h = byId(el.dataset.id); h.archived = true; commit(); closeSheet(); render(); toast(`${h.name} archivado`, () => { h.archived = false; commit(); render(); }); },
  unarchive: (el) => { const h = byId(el.dataset.id); h.archived = false; commit(); render(); toast(`${h.name} vuelve a Hoy`); },
  delHabit: (el) => {
    if (!el.dataset.armed) { el.dataset.armed = '1'; el.textContent = 'Tocá de nuevo para borrar todo su historial'; return; }
    const id = el.dataset.id;
    S.habits = S.habits.filter((h) => h.id !== id);
    for (const k of Object.keys(S.log)) { delete S.log[k][id]; if (!Object.keys(S.log[k]).length) delete S.log[k]; }
    commit(); closeSheet(); render(); toast('Hábito borrado');
  },
  move: (el) => {
    const act = S.habits.filter((h) => !h.archived);
    const i = act.findIndex((h) => h.id === el.dataset.id), j = i + Number(el.dataset.d);
    if (j < 0 || j >= act.length) return;
    const a = S.habits.indexOf(act[i]), b = S.habits.indexOf(act[j]);
    [S.habits[a], S.habits[b]] = [S.habits[b], S.habits[a]];
    commit(); render();
  },
  step: (el) => { const n = sheet.querySelector('#hN'); n.textContent = Math.max(1, Math.min(7, Number(n.textContent) + Number(el.dataset.d))); },
  theme: (el) => { S.settings.theme = el.dataset.v; commit(); render(); },
  testNotif: async () => {
    if (typeof Notification === 'undefined') { toast('Acá no hay avisos. En iPhone: instalá la app y abrila desde el ícono.'); return; }
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission !== 'granted') { toast('Sin permiso para avisos'); render(); return; }
    notify(`${APP.name}`, 'Así te van a llegar los avisos.', 'prueba'); render();
  },
  ics: () => { download(`${APP.name.toLowerCase()}-recordatorios.ics`, icsText(), 'text/calendar'); toast('Abrí el archivo para sumarlos al calendario'); },
  export: () => { download(`${APP.name.toLowerCase()}-copia-${today()}.json`, exportJSON(S), 'application/json'); toast('Copia exportada'); },
  resetDemo: () => { S = seedDemo(today()); commit(); ui.tab = 'hoy'; render(); toast('Demo reiniciada'); },
};

document.addEventListener('click', (e) => {
  const pick = e.target.closest('[data-pick]');
  if (pick) {
    const g = pick.closest('[data-group]');
    if (g.dataset.multi) pick.setAttribute('aria-pressed', pick.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    else g.querySelectorAll('[data-pick]').forEach((b) => b.setAttribute('aria-pressed', String(b === pick)));
    if (g.dataset.group === 'freq') sheet.querySelectorAll('[data-show]').forEach((x) => { x.hidden = x.dataset.show !== pick.dataset.v; });
    return;
  }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.id === 'fHabit') saveHabit(e.target);
  if (e.target.id === 'fBlock') saveBlock(e.target);
  if (e.target.id === 'fClass') saveClass(e.target);
});

document.addEventListener('change', async (e) => {
  const k = e.target.dataset && e.target.dataset.set;
  if (!k) return;
  const r = S.settings.remind;
  if (k === 'name') S.settings.name = e.target.value.trim().slice(0, 20);
  if (k === 'grouping') S.settings.grouping = e.target.checked;
  if (k === 'remind.morning') r.morning = e.target.value;
  if (k === 'remind.evening') r.evening = e.target.value;
  if (k === 'remind.habits') r.habits = e.target.checked;
  if (k === 'remind.on') {
    r.on = e.target.checked;
    if (r.on && typeof Notification !== 'undefined' && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch { /* */ } }
    if (r.on && (typeof Notification === 'undefined' || Notification.permission !== 'granted')) toast('Guardado. Para que lleguen, instalá la app y dale permiso.');
  }
  if (k === 'import') {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try { S = importJSON(await file.text()); commit(); render(); toast('Copia importada'); } catch (err) { toast(err.message || 'No se pudo importar'); }
    return;
  }
  commit(); render();
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('open')) closeSheet(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (!document.body.classList.contains('open')) render(); remindTick(); } });
setInterval(() => { remindTick(); if (ui.tab !== 'ajustes' && !document.body.classList.contains('open') && !document.hidden) { const y = window.scrollY; render(); window.scrollTo(0, y); } }, 60000);

if (!DEMO && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo offline */ });
}

// Para pruebas automáticas
window.__rutina = { get S() { return S; }, ui, render, analyze, today };

render();
remindTick();
