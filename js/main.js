// Rutina — pantalla y acciones. Sin librerías: todo se dibuja con plantillas y un solo manejador de toques.
import {
  dateKey, nowMinutes, addDays, diffDays, weekday, weekStart, weekKeys, toMin, fromMin, fechaLarga,
  isScheduled, statusOf, freqLabel, weekCount, weekTarget, dueOn, analyze, cellState, weekStats, dayProgress,
  partOf, expandClasses, layoutLanes, blocksFor, DIAS, DIAS_LARGO, MESES,
} from './logic.js';
import { APP, COLORES, newId, load, save, exportJSON, importJSON, seedDemo, persistente, sugeridos } from './store.js';
import { TONOS, planAvisos, llenar, avisoHabito, hechosDe, ejemploAviso } from './avisos.js';
import { parseAgregar } from './agregar.js';
import { categorias, catDe, formatARS, parseMonto, mesDe, mesSiguiente, resumenMes, presupuesto, importarGastos, gastosCSV } from './finanzas.js';
import { listas, estadoTarea, agruparTareas, tareasDeHoy, posponer, tareaDesdeTexto, importarTareas } from './tareas.js';
import { CAL_COLOR, urlEventos, calDia, rangoCal, haceCuanto, calDemo } from './calendario.js';

const DEMO = typeof window !== 'undefined' && !!window.RUTINA_DEMO;
if (DEMO) APP.storageKey = 'rutina.demo';

let S = load();
if (DEMO && !hasStored()) S = seedDemo(dateKey());
function hasStored() { try { return !!localStorage.getItem(APP.storageKey); } catch { return false; } }

// ---------- Calendario del iPhone (solo lectura, vía el worker) ----------
// Copia aparte de los datos (no va en la copia de seguridad): { at, eventos, error, errorAt }
const CAL_KEY = 'rutina.calendario';
let cal = { at: 0, eventos: [], error: null, errorAt: 0 };
try { const c = JSON.parse(localStorage.getItem(CAL_KEY)); if (c && Array.isArray(c.eventos)) cal = { ...cal, ...c }; } catch { /* sin copia */ }
if (DEMO) cal = { at: Date.now(), eventos: calDemo(dateKey()), error: null, errorAt: 0 };
const calOn = () => DEMO || !!(S.settings.cal && S.settings.cal.url);
let calBusy = false;

async function calSync({ avisar = false, forzar = false } = {}) {
  if (DEMO) { if (avisar) toast('En la demo los eventos del calendario son de ejemplo'); return; }
  if (!calOn() || calBusy) return;
  if (!forzar && Date.now() - Math.max(cal.at, cal.errorAt) < 2 * 60000) return;
  const { desde, hasta } = rangoCal(today());
  const url = urlEventos(S.settings.cal.url, S.settings.cal.token, desde, hasta);
  calBusy = true;
  let msg;
  try {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), 15000);
    const r = await fetch(url, { signal: ctl ? ctl.signal : undefined, cache: 'no-store' });
    clearTimeout(timer);
    let j = null;
    try { j = await r.json(); } catch { /* no es JSON */ }
    if (!r.ok || !j || !Array.isArray(j.eventos)) {
      throw new Error(r.status === 401 ? 'La clave no coincide con la del servidor'
        : r.status === 403 ? 'El servidor no acepta esta página (revisá ORIGEN)'
        : r.status === 502 ? 'El servidor no pudo leer el calendario de iCloud'
        : (j && j.error) || `El servidor respondió ${r.status}`);
    }
    cal = { at: Date.now(), eventos: j.eventos, error: null, errorAt: 0 };
    const n = j.eventos.length;
    msg = `Conectado: ${n} ${n === 1 ? 'evento' : 'eventos'} en los próximos dos meses`;
  } catch (err) {
    const red = err && (err.name === 'AbortError' || err.name === 'TypeError');
    cal = { ...cal, error: red ? 'No se pudo conectar (sin internet o dirección mal escrita)' : err.message, errorAt: Date.now() };
    msg = cal.error;
  } finally { calBusy = false; }
  try { localStorage.setItem(CAL_KEY, JSON.stringify(cal)); } catch { /* sin almacenamiento */ }
  if (avisar) toast(msg);
  if (!document.body.classList.contains('open') && !typing()) { const y = window.scrollY; render(); window.scrollTo(0, y); }
}
const typing = () => { const a = document.activeElement; return !!(a && view.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)); };

const ui = { tab: 'hoy', day: dateKey(), week: dateKey(), pop: null, ringPrev: 0, scrollNow: true, month: null };
const today = () => dateKey();
const habitsActive = () => S.habits.filter((h) => !h.archived);
const byId = (id) => S.habits.find((h) => h.id === id);
const commit = () => { save(S); pushLuego(); };
const clasesOn = () => !!S.settings.classesOn;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- Íconos (trazos propios) ----------
const I = {
  hoy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/></svg>',
  agenda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3"/></svg>',
  semana: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20V12M10 20V6M15 20v-9M20 20V4"/></svg>',
  ajustes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>',
  izq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  der: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  arriba: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14l6-6 6 6"/></svg>',
  abajo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10l6 6 6-6"/></svg>',
  puntos: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5.5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18.5" cy="12" r="1.8"/></svg>',
  cerrar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  tilde: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  tareas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="5" height="5" rx="1.6"/><path d="M4.8 15.8l1.3 1.3 2.4-2.6M12 7h8.5M12 16h8.5"/></svg>',
  gastos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><path d="M4 9.5h16M15.5 14.5h1.5"/></svg>',
  mas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/></svg>',
  borrar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h10.5A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5H9l-6-7z"/><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
};
const EMOJIS = ['🧘', '🏋️', '🧠', '🗣️', '🎾', '🏃', '💪', '🥗', '😴', '⏰', '📚', '💧', '🚴', '🏊', '🧴', '📖', '✍️', '🙏', '🍎', '📵', '🧹', '💰', '🎯', '📞'];
const TEMAS = [['vida', 'Vida'], ['arena', 'Arena'], ['cognac', 'Coñac'], ['salvia', 'Salvia'], ['rosa', 'Rosa']];
const PARTES = [['manana', 'Mañana'], ['tarde', 'Tarde'], ['noche', 'Noche'], ['any', 'Cuando puedas']];

// ---------- Armado ----------
const root = document.getElementById('app');
root.innerHTML = `
  <div class="cielo" aria-hidden="true"><i class="estrellas"></i><i class="estrellas e2"></i><i class="rayos"></i><i class="sol"></i><i class="luna"></i><i class="nubes n1"></i><i class="nubes n2"></i><i class="nubes n3"></i><i class="bruma"></i><svg class="sierras" viewBox="0 0 400 120" preserveAspectRatio="none"><path class="lejos" d="M0 70 L30 58 L62 64 L95 44 L128 56 L160 40 L196 52 L232 34 L268 50 L300 42 L338 56 L370 46 L400 54 L400 120 L0 120Z"/><path class="cerca" d="M0 92 L40 80 L78 88 L118 72 L150 84 L188 74 L226 86 L262 70 L300 82 L338 76 L372 88 L400 80 L400 120 L0 120Z"/></svg></div>
  <main class="wrap" id="view"></main>
  <nav class="tabs" aria-label="Secciones">
    ${[['hoy', 'Hoy', 'hoy'], ['agenda', 'Agenda', 'agenda'], ['tareas', 'Tareas', 'tareas'], ['gastos', 'Gastos', 'gastos'], ['mas', 'Más', 'menu']].map(([t, n, i]) => `<button class="tab" data-act="tab" data-tab="${t}">${I[i]}<span>${n}</span></button>`).join('')}
  </nav>
  <button class="btn primary fab" data-act="newBlock" hidden>${I.mas}<span>Bloque</span></button>
  <div class="scrim" data-act="closeSheet"></div>
  <section class="sheet" id="sheet" role="dialog" aria-modal="true"></section>
  <div class="toast" id="toast" role="status"><span></span><button data-act="undo">Deshacer</button></div>`;
const view = document.getElementById('view');
const sheet = document.getElementById('sheet');

/* ---------- Cielo según la hora (tema Vida, apariencia "Hora") ----------
   Como una app del clima: el fondo es el cielo de este momento en Córdoba. Amanece, el sol cruza
   el cielo, se esconde al atardecer y de noche hay luna y estrellas. De día la app va en claro; de noche, en oscuro. */
function solDelDia(d) {
  const rad = Math.PI / 180, lat = -31.42, lon = -64.18, tz = -3;
  const N = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
  const g = 2 * Math.PI / 365 * (N - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(dec)) - Math.tan(lat * rad) * Math.tan(dec)) / rad;
  return { sale: 720 - 4 * (lon + ha) - eq + tz * 60, pone: 720 - 4 * (lon - ha) - eq + tz * 60 }; // minutos desde medianoche, hora local
}
// Paradas del cielo: s = 0 sale el sol, s = 1 se pone. [s, arriba, medio, abajo, nubes, sierras]
const CIELO = [
  [-0.30, '#0B1430', '#16204A', '#2A2A5C', '#2B3260', '#0A0F24'],
  [-0.10, '#1E2D63', '#4A4F8F', '#C77E8E', '#9C7A9E', '#2A2445'],
  [0.00, '#A4B8EC', '#D2C6EC', '#FFD2B0', '#FFE2D2', '#7C7FA8'],
  [0.08, '#8CC2F6', '#BFDDF9', '#FFEBD2', '#FFF4EA', '#8597BC'],
  [0.25, '#76BAF7', '#AEDAFB', '#EEF7FF', '#FFFFFF', '#8EA6C8'],
  [0.75, '#76BAF7', '#AEDAFB', '#EEF7FF', '#FFFFFF', '#8EA6C8'],
  [0.90, '#86B6EE', '#BCD5F2', '#FFE0B5', '#FFEBD6', '#8A93B8'],
  [1.00, '#9AA6DE', '#F0B4A2', '#FFB27A', '#FFC9A6', '#6E5F8C'],
  [1.08, '#2C3474', '#7A4E86', '#D0706A', '#B07A92', '#2C2448'],
  [1.30, '#0B1430', '#16204A', '#2A2A5C', '#2B3260', '#0A0F24'],
];
const mezclar = (a, b, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
function cielo() {
  const el = document.documentElement;
  if ((S.settings.palette || 'vida') !== 'vida') { el.removeAttribute('data-cielo'); return null; }
  const now = window.CIELO_HORA ? new Date(window.CIELO_HORA) : new Date(); // CIELO_HORA: para probar otra hora
  const { sale, pone } = solDelDia(now);
  const m = now.getHours() * 60 + now.getMinutes();
  let s = (m - sale) / (pone - sale);
  if (s > 1.3) s = 1.3; if (s < -0.3) s = -0.3;
  let i = 0; while (i < CIELO.length - 2 && s > CIELO[i + 1][0]) i++;
  const [a, b] = [CIELO[i], CIELO[i + 1]]; const k = Math.min(1, Math.max(0, (s - a[0]) / (b[0] - a[0])));
  const col = [1, 2, 3, 4, 5].map((j) => mezclar(a[j], b[j], k));
  const dia = s >= -0.03 && s <= 1.03;
  const t = Math.min(1, Math.max(0, s));
  const v = {
    '--sky-1': col[0], '--sky-2': col[1], '--sky-3': col[2], '--nube': col[3], '--sierra': col[4],
    '--sol-x': (10 + t * 80).toFixed(1) + 'vw', '--sol-y': (26 - Math.sin(Math.PI * t) * 21).toFixed(1) + 'vh',
    '--sol-o': dia ? 1 : 0, '--sol-tarde': Math.max(0, Math.abs(s - 0.5) * 2 - 0.55).toFixed(2), // 0 al mediodía, ~0.45 al salir/ponerse
    '--noche': Math.min(1, Math.max(0, s < 0 ? -s / 0.15 : (s - 1) / 0.15)).toFixed(2),
  };
  Object.entries(v).forEach(([n, x]) => el.style.setProperty(n, x));
  el.dataset.cielo = dia ? 'dia' : 'noche';
  const mc = document.querySelector('meta[name="theme-color"]'); if (mc) mc.content = col[0];
  return dia;
}

function applyTheme() {
  const t = S.settings.theme;
  const p = S.settings.palette || 'vida'; // Vida es el tema por defecto
  if (p !== 'cognac') document.documentElement.dataset.palette = p;
  else document.documentElement.removeAttribute('data-palette');
  const dia = cielo();
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else if (dia !== null) document.documentElement.dataset.theme = dia ? 'light' : 'dark'; // Vida en "Hora": claro de día, oscuro de noche
  else document.documentElement.removeAttribute('data-theme');
}

function render() {
  applyTheme();
  const ob = !S.settings.onboarded;
  document.body.classList.toggle('ob', ob);
  if (ob) { view.innerHTML = renderBienvenida(); ui.pop = null; return; }
  const enMas = ui.tab === 'semana' || ui.tab === 'ajustes';
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === ui.tab || (b.dataset.tab === 'mas' && enMas) ? 'page' : 'false'));
  const fab = document.querySelector('.fab');
  const F = ({ agenda: ['newBlock', 'Bloque'], gastos: ['newGasto', 'Anotar'] })[ui.tab];
  fab.hidden = !F;
  if (F) { fab.dataset.act = F[0]; fab.querySelector('span').textContent = F[1]; }
  const masNav = enMas ? `<div class="seg masnav">${[['semana', 'Semana'], ['ajustes', 'Ajustes']].map(([t, n]) => `<button data-act="tab" data-tab="${t}" aria-pressed="${ui.tab === t}">${n}</button>`).join('')}</div>` : '';
  view.innerHTML = masNav + ({ hoy: renderHoy, agenda: renderAgenda, tareas: renderTareas, gastos: renderGastos, semana: renderSemana, ajustes: renderAjustes })[ui.tab]();
  if (ui.tab === 'hoy') animateRing();
  if (ui.tab === 'agenda' && ui.scrollNow) {
    ui.scrollNow = false;
    const el = view.querySelector('.now') || view.querySelector('.ev');
    if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 220) });
  }
  ui.pop = null;
}

// ---------- BIENVENIDA (primera vez en un teléfono nuevo) ----------
// Cada persona usa su propio teléfono y sus datos. Si ya hay datos guardados, esto no aparece.
function obEstado() {
  if (!ui.ob) ui.ob = { paso: 0, name: S.settings.name || '', sel: [], propios: [], nuevo: '', clases: false };
  return ui.ob;
}
function renderBienvenida() {
  const o = obEstado();
  const pasos = `<div class="ob-pasos" aria-hidden="true">${[0, 1, 2].map((i) => `<i class="${i <= o.paso ? 'on' : ''}"></i>`).join('')}</div>`;
  if (o.paso === 0) {
    return `${pasos}<header class="ob-head ob-intro"><div class="ob-arte" aria-hidden="true"><i></i><i></i><i></i></div><div class="brand">${esc(APP.name)}</div><h1>Te damos la <em>bienvenida</em></h1><p class="muted">${esc(APP.tagline)}. Armamos tu rutina en tres pasos.</p></header>
      <form id="fOb0" class="card" style="margin-top:6px"><div class="field" style="margin:0"><label for="obName">¿Cómo te llamás?</label>
        <input class="input" id="obName" value="${esc(o.name)}" maxlength="20" autocomplete="given-name" placeholder="Tu nombre" enterkeyhint="next"></div></form>
      <div class="actions"><button class="btn primary block" data-act="obNext">Seguir</button></div>
      <p class="help" style="text-align:center">Tus datos quedan solo en este teléfono.</p>`;
  }
  if (o.paso === 1) {
    const list = [...sugeridos(today()), ...o.propios];
    const n = o.sel.length;
    return `${pasos}<header class="ob-head"><h1>Elegí tus <em>hábitos</em></h1><p class="muted">Con 4 a 6 se sostiene mejor. Después podés cambiar todo.</p></header>
      <div class="sugs">${list.map((h) => `<button class="sug" data-act="obPick" data-id="${esc(h.id)}" aria-pressed="${o.sel.includes(h.id)}" style="--c:${h.color}">
        <span class="ico" aria-hidden="true">${h.icon}</span><span class="lbl"><b>${esc(h.name)}</b><span>${freqLabel(h.freq)}${h.time ? ' · ' + h.time : ''}</span></span><span class="check" aria-hidden="true">${I.tilde}</span></button>`).join('')}</div>
      <form id="fObNuevo" class="quick" style="margin-top:12px" autocomplete="off"><input class="input" id="obNuevo" placeholder="Crear uno propio: ej. Tejer" maxlength="40" value="${esc(o.nuevo)}" enterkeyhint="done">
        <button class="btn sm" type="submit" aria-label="Agregar hábito propio">${I.mas}</button></form>
      <div class="actions ob-sticky"><button class="btn primary block" data-act="obNext" ${n ? '' : 'disabled'}>${n ? `Seguir con ${n} ${n === 1 ? 'hábito' : 'hábitos'}` : 'Elegí al menos uno'}</button>
        <button class="btn ghost block" data-act="obBack">Volver</button></div>`;
  }
  return `${pasos}<header class="ob-head"><h1>¿Das <em>clases</em>?</h1><p class="muted">Si sos profe o entrenás a alguien, cargás tus horarios una vez y la agenda los arma sola todas las semanas.</p></header>
    <div class="set-list"><label class="set-row"><span class="ico" style="--c:#8FB21C">🎾</span><span class="lbl"><b>Mis clases</b><span>${o.clases ? 'Las cargás en el paso siguiente' : 'Apagado: no aparecen en la agenda'}</span></span>
      <span class="switch"><input type="checkbox" id="obClases" ${o.clases ? 'checked' : ''}><i></i></span></label></div>
    <p class="help">Lo podés cambiar cuando quieras en Ajustes.</p>
    <div class="actions"><button class="btn primary block" data-act="obFin">Empezar</button><button class="btn ghost block" data-act="obBack">Volver</button></div>`;
}
function obFin() {
  const o = obEstado();
  const t = today();
  const todos = [...sugeridos(t), ...o.propios];
  S.habits = o.sel.map((id) => todos.find((h) => h.id === id)).filter(Boolean).map((h) => ({ ...h, created: t }));
  S.settings.name = o.name.trim().slice(0, 20);
  S.settings.classesOn = o.clases;
  S.settings.classesReviewed = true;
  S.settings.onboarded = true;
  ui.ob = null;
  commit();
  ui.tab = 'hoy';
  render();
  if (o.clases) { classesSheet(); } else toast('¡Listo! Activá los avisos en Ajustes cuando quieras.');
}

// ---------- HOY ----------
const INTENCIONES = ['Respirá. Mañana seguimos.', 'Poco, pero todos los días.', 'Un paso a la vez.', 'Lo simple, bien hecho.', 'Hoy también cuenta.', 'Sin apuro y sin pausa.', 'Volver es lo importante.'];
function saludo() {
  const m = nowMinutes();
  const n = S.settings.name ? `, <em>${esc(S.settings.name)}</em>` : '';
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
  const grad = '<defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="rg-a"/><stop offset="1" class="rg-b"/></linearGradient></defs>';
  const pct = total ? done / total : 0;
  ui.ringTarget = C * (1 - pct);
  const from = ui.ringPrev ?? C;
  return `<div class="ring" role="img" aria-label="${done} de ${total} hábitos hechos">
    <svg viewBox="0 0 104 104">${grad}<circle class="bgc" cx="52" cy="52" r="44" fill="none" stroke-width="7"/>
    <circle class="fgc" cx="52" cy="52" r="44" fill="none" stroke="url(#ringGrad)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${from}"/></svg>
    <div class="lbl"><div><b class="num">${done}<small>/${total}</small></b><span>hoy</span></div></div></div>`;
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
  const todoDia = calOn() ? calDia(cal.eventos, k).allDay : [];
  const nextHTML = (nx ? `<div class="next${nx.kind === 'cal' ? ' cal' : ''}"><i style="background:${nx.color}"></i><span>${nx.start <= m ? 'Ahora' : fromMin(nx.start)} · ${esc(nx.label)}</span></div>` : '')
    + (todoDia.length ? `<div class="next cal"><i style="background:${CAL_COLOR}"></i><span>Todo el día · ${todoDia.map((e) => esc(e.title)).join(' · ')}</span></div>` : '');

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

  return `<header class="head"><div><div class="eyebrow">${cap(fechaLarga(k))}</div><h1>${saludo()}</h1><p class="intencion">${INTENCIONES[wd]}</p></div><div class="brand">${esc(APP.name)}</div></header>
  <section class="card hero">${ringSVG(p.done, p.total)}<div class="grow"><h2>${titulo}</h2><p>${sub}</p>${nextHTML}</div></section>
  ${tareasHoyCard(k)}
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
  if (clasesOn()) for (const c of expandClasses(S.classes, k)) items.push({ ...c, kind: 'clase', color: '#8FB21C', label: c.title, off });
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
  for (const t of S.tasks) {
    if (t.date !== k || !t.time) continue;
    const s = toMin(t.time);
    items.push({ kind: 'tarea', id: t.id, start: s, end: s + 30, color: '#C9A227', label: t.title, done: !!t.done });
  }
  if (calOn()) for (const e of calDia(cal.eventos, k).timed) {
    items.push({ kind: 'cal', id: e.id, start: e.start, end: e.end, color: CAL_COLOR, label: e.title, cont: e.desde || e.hasta });
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
    const cls = ['ev', it.kind === 'clase' ? 'clase' : '', it.kind === 'habito' ? 'habito' : '', it.kind === 'tarea' ? 'tarea' : '', it.kind === 'cal' ? 'cal' : '', it.done ? 'hecho' : '', it.off ? 'off' : '', short ? 'short' : ''].join(' ');
    const act = ({ clase: 'classMenu', habito: 'habitMenu', cal: 'calEvent', tarea: 'editTask' })[it.kind] || 'editBlock';
    const hora = `${fromMin(it.start)}–${it.end >= 1440 ? '24:00' : fromMin(it.end)}`;
    const extra = it.weekly && !short ? ' · se repite' : it.kind === 'cal' && !short ? ' · Calendario' : '';
    return `<button class="${cls}" style="--c:${it.color};top:${top}px;height:${hgt}px;left:calc(${it.lane * w}% + 2px);width:calc(${w}% - 6px)" data-act="${act}" data-id="${esc(it.id)}">
      <b>${it.kind === 'cal' ? `<i class="ci" aria-hidden="true">${I.cal}</i>` : ''}${esc(it.label)}${it.off ? ' (suspendida)' : ''}</b><span class="num">${short ? fromMin(it.start) : hora}${extra}</span></button>`;
  }).join('');
  const todoDia = calOn() ? calDia(cal.eventos, k).allDay : [];
  const calNota = calOn() && !DEMO && cal.error
    ? `<p class="help cal-err">No se pudo actualizar el calendario${cal.at ? ` (mostramos lo de ${haceCuanto(cal.at)})` : ''}. <button class="linkish" data-act="calRetry">Reintentar</button></p>` : '';
  const nowLine = k === today() && nowMinutes() >= h0 * 60 && nowMinutes() <= h1 * 60 ? `<div class="now" style="top:${y(nowMinutes())}px"></div>` : '';
  const clases = clasesOn() ? expandClasses(S.classes, k) : [];
  const off = !!S.classOff[k];
  return `<header class="head"><div><div class="eyebrow">Agenda del día</div><h1>${diaNombre(k)}</h1></div><div class="brand">${esc(APP.name)}</div></header>
    <div class="daynav"><button class="icon-btn" data-act="day" data-d="-1" aria-label="Día anterior">${I.izq}</button>
      <button class="lbl" data-act="day" data-d="0">${cap(fechaLarga(k))}<small>${k === today() ? 'Hoy' : 'Volver a hoy'}</small></button>
      <button class="icon-btn" data-act="day" data-d="1" aria-label="Día siguiente">${I.der}</button></div>
    <form class="quick" id="fQuick" autocomplete="off"><input class="input" id="qText" placeholder="Escribí: gym mañana a las 9" aria-label="Agregar rápido" enterkeyhint="done" maxlength="120" value="${esc(ui.quick || '')}">
      <button class="btn primary sm" type="submit" aria-label="Agregar">${I.mas}</button></form>
    <p class="quick-prev" id="qPrev" aria-live="polite">${quickPreview(ui.quick)}</p>
    ${todoDia.length ? `<div class="allday">${todoDia.map((e) => `<button class="chip cal" data-act="calEvent" data-id="${esc(e.id)}"><i class="ci" aria-hidden="true">${I.cal}</i>${esc(e.title)}</button>`).join('')}</div>` : ''}
    ${calNota}
    ${!clasesOn() || S.settings.classesReviewed ? '' : `<div class="notice"><p>Tus clases son <b>de ejemplo</b>. Cargá tus horarios reales una vez y quedan para todas las semanas.</p><button class="btn sm primary" data-act="classes">Cargar</button></div>`}
    ${clasesOn() ? `<div class="chips">
      ${clases.length ? `<span class="chip"><i style="background:#8FB21C"></i>${clases.length} ${clases.length === 1 ? 'clase' : 'clases'}</span>
        <button class="chip ${off ? 'on' : ''}" data-act="toggleOff">${off ? 'Sin clases este día · Reactivar' : 'Suspender clases'}</button>` : '<span class="chip">Sin clases este día</span>'}
      <button class="chip" data-act="classes">Mis clases</button>
    </div>` : ''}
    <div class="timeline"><div class="tl-inner" style="height:${(h1 - h0) * PX}px">${rows}${evs}${nowLine}</div></div>
    <p class="help">Tocá un horario vacío para agregar un bloque. Los hábitos con hora aparecen punteados${calOn() ? ' y lo del Calendario del iPhone, rayado' : ''}.</p>`;
}

// ---------- Agregar con texto (Siri / campo rápido) ----------
function cuandoTxt(k) {
  const d = diffDays(today(), k);
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Mañana';
  if (d > 1 && d < 7) return cap(DIAS_LARGO[weekday(k)]);
  const [, mm, dd] = k.split('-').map(Number);
  return `${cap(DIAS_LARGO[weekday(k)])} ${dd}/${mm}`;
}
function quickPreview(txt) {
  if (!txt || !txt.trim()) return '';
  const p = parseAgregar(txt, today(), nowMinutes());
  return `→ <b>${esc(p.title)}</b> · ${cuandoTxt(p.date)} · <span class="num">${p.sinHora ? 'sin hora (' + p.start + ')' : p.start + '–' + p.end}</span>`;
}

function agregarSheet(texto) {
  const p = parseAgregar(texto, today(), nowMinutes());
  openSheet(`<h2><span>Agregar a la agenda</span><button class="icon-btn" data-act="closeSheet" aria-label="Cerrar">${I.cerrar}</button></h2>
    <p class="muted heard">Escuché: “${esc(p.texto)}”</p>
    <form id="fAgregar">
      <div class="field"><label for="aTitle">Qué</label><input class="input" id="aTitle" value="${esc(p.title)}" maxlength="50" required enterkeyhint="done"></div>
      <div class="field"><label for="aDate">Día</label><input class="input" id="aDate" type="date" value="${p.date}" required></div>
      <div class="two"><div class="field"><label for="aStart">Desde</label><input class="input" id="aStart" type="time" value="${p.start}" required></div>
        <div class="field"><label for="aEnd">Hasta</label><input class="input" id="aEnd" type="time" value="${p.end}" required></div></div>
      ${p.sinHora ? '<p class="help" style="margin-top:-6px">No entendí la hora: revisala antes de guardar.</p>' : ''}
      <div class="field"><span class="lb">Color</span>${swHTML(COLORES[1])}</div>
      <div class="actions"><button class="btn primary block" type="submit">Guardar en ${esc(cuandoTxt(p.date).toLowerCase())}</button>
        <button class="btn ghost block" type="button" data-act="closeSheet">Cancelar</button></div>
    </form>`);
}

function addBlockFrom(data) {
  let { title, date, start, end, color } = data;
  if (!end || toMin(end) <= toMin(start)) end = fromMin(Math.min(23 * 60 + 59, toMin(start) + 60));
  const b = { id: newId('b'), date, start, end, title, color: color || COLORES[1], weekly: false };
  S.blocks.push(b);
  commit();
  return b;
}

function saveAgregar(form) {
  const title = form.querySelector('#aTitle').value.trim();
  if (!title) { form.querySelector('#aTitle').focus(); return; }
  const date = form.querySelector('#aDate').value || today();
  const b = addBlockFrom({ title, date, start: form.querySelector('#aStart').value || '09:00', end: form.querySelector('#aEnd').value, color: pressed('color')[0] });
  closeSheet();
  ui.tab = 'agenda'; ui.day = date; ui.scrollNow = true; render();
  toast(`Agendado: ${b.title} · ${cuandoTxt(date)} ${b.start}`, () => { S.blocks = S.blocks.filter((x) => x !== b); commit(); render(); });
}

function saveQuick(form) {
  const txt = form.querySelector('#qText').value.trim();
  if (!txt) return;
  const p = parseAgregar(txt, today(), nowMinutes());
  const b = addBlockFrom(p);
  ui.quick = ''; ui.day = p.date; ui.scrollNow = true;
  form.querySelector('#qText').blur();
  render();
  toast(`Agendado: ${b.title} · ${cuandoTxt(p.date)} ${b.start}`, () => { S.blocks = S.blocks.filter((x) => x !== b); commit(); ui.quick = txt; render(); });
}

// Lee ?agregar= o #agregar= una sola vez y limpia la dirección (así recargar no lo duplica).
function leerAgregar() {
  let txt = null;
  try {
    const u = new URL(location.href);
    txt = u.searchParams.get('agregar');
    if (txt == null && /^#agregar=/.test(u.hash)) txt = decodeURIComponent(u.hash.slice(9).replace(/\+/g, ' '));
    if (txt != null) {
      u.searchParams.delete('agregar');
      if (/^#agregar=/.test(u.hash)) u.hash = '';
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    }
  } catch { /* dirección rara */ }
  return txt && txt.trim() ? txt.trim().slice(0, 200) : null;
}

function calEventSheet(id) {
  const e = (cal.eventos || []).find((x) => x.id === id);
  if (!e) return;
  let cuando;
  if (e.allDay) {
    const ult = addDays(e.end || addDays(e.start, 1), -1);
    cuando = ult === e.start ? `${cap(fechaLarga(e.start))} · todo el día` : `Del ${fechaLarga(e.start)} al ${fechaLarga(ult)}`;
  } else {
    const s = new Date(e.start), f = new Date(e.end || e.start);
    const sk = dateKey(s), fk = dateKey(f);
    cuando = sk === fk ? `${cap(fechaLarga(sk))} · ${fromMin(nowMinutes(s))} a ${fromMin(nowMinutes(f))}` : `${cap(fechaLarga(sk))} ${fromMin(nowMinutes(s))} → ${fechaLarga(fk)} ${fromMin(nowMinutes(f))}`;
  }
  openSheet(`<h2><span class="cal-title"><i class="ci" aria-hidden="true">${I.cal}</i>${esc(e.title)}</span><button class="icon-btn" data-act="closeSheet" aria-label="Cerrar">${I.cerrar}</button></h2>
    <p class="muted" style="margin-top:-6px">${esc(cuando)}</p>
    <div class="notice cal-notice"><p>Viene del <b>Calendario del iPhone</b>. Acá solo se ve: para cambiarlo o borrarlo, usá la app Calendario (o pedíselo a Siri).</p></div>
    <p class="help">No cuenta como hábito. Si lo cambiás en el iPhone, acá se actualiza solo en unos minutos.</p>`);
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
      <span class="val"><b class="num">${a.current ? '<i class="fuego" aria-hidden="true">🔥</i>' : ''}${a.current}</b><span>${u}</span></span></button>`;
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
function calEstado() {
  if (DEMO) return 'Demo: eventos de ejemplo';
  if (!calOn()) return 'Sin configurar';
  if (calBusy) return 'Actualizando…';
  const ok = cal.at ? `Actualizado ${haceCuanto(cal.at)} · ${cal.eventos.length} ${cal.eventos.length === 1 ? 'evento' : 'eventos'}` : 'Todavía sin datos';
  return cal.error && cal.errorAt >= cal.at ? `${esc(cal.error)}${cal.at ? ` · último bien: ${haceCuanto(cal.at)}` : ''}` : ok;
}

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
    <div class="set-list">
      <label class="set-row"><span class="ico" style="--c:#8FB21C">🎾</span><span class="lbl"><b>Doy clases</b><span>${clasesOn() ? 'Tus horarios aparecen en la agenda' : 'Apagado'}</span></span><span class="switch"><input type="checkbox" data-set="classesOn" ${clasesOn() ? 'checked' : ''}><i></i></span></label>
      ${clasesOn() ? S.classes.map((c) => `<div class="set-row" style="--c:#8FB21C"><span class="ico">🎾</span><span class="lbl"><b>${esc(c.club)}</b><span>${freqLabel({ type: 'days', days: c.days })} · ${c.from} a ${c.to}</span></span><button class="icon-btn" data-act="editClass" data-id="${c.id}" aria-label="Editar">${I.puntos}</button></div>`).join('') || '<div class="set-row"><span class="lbl muted">Sin clases cargadas</span></div>' : ''}
    </div>
    ${clasesOn() ? `<button class="btn block" style="margin-top:8px" data-act="editClass">${I.mas} Agregar horario de clases</button>` : ''}

    <div class="section-t">Calendario del iPhone</div>
    <div class="set-list">
      <div class="set-row stack"><label class="lbl" for="calUrl"><b>Dirección del servidor</b><span>La que te pasa el asistente (termina en workers.dev)</span></label>
        <input class="input" id="calUrl" data-set="cal.url" type="url" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="https://rutina-calendario….workers.dev" value="${esc(S.settings.cal.url)}" ${DEMO ? 'disabled' : ''}></div>
      <div class="set-row stack"><label class="lbl" for="calTok"><b>Clave</b><span>La misma que tiene el servidor</span></label>
        <input class="input" id="calTok" data-set="cal.token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(S.settings.cal.token)}" ${DEMO ? 'disabled' : ''}></div>
      <div class="set-row"><span class="lbl"><b>Estado</b><span>${calEstado()}</span></span><button class="btn sm" data-act="calTest" ${calOn() ? '' : 'disabled'}>Probar conexión</button></div>
    </div>
    <p class="help">Lo que le pidas a Siri (“agendá gym mañana a las 9”) va al calendario “Rutina” del iPhone y aparece en tu Agenda, rayado. Acá solo se ve: para cambiarlo, usá la app Calendario.</p>

    <div class="section-t">Avisos</div>
    <div class="set-list">
      <label class="set-row"><span class="lbl"><b>Avisos</b><span>${notifTxt}</span></span><span class="switch"><input type="checkbox" data-set="remind.on" ${r.on ? 'checked' : ''}><i></i></span></label>
      <div class="set-row"><span class="lbl"><b>Con la app cerrada</b><span>${pushEstado()}</span></span>${pushBoton()}</div>
      <div class="set-row"><span class="lbl"><b>Mañana</b><span>Qué toca hoy</span></span><input class="input" style="width:120px" type="time" data-set="remind.morning" value="${r.morning}"></div>
      <div class="set-row"><span class="lbl"><b>Noche</b><span>Solo lo que te falta</span></span><input class="input" style="width:120px" type="time" data-set="remind.evening" value="${r.evening}"></div>
      <label class="set-row"><span class="lbl"><b>A la hora de cada hábito</b><span>Cada uno se ajusta en su ficha</span></span><span class="switch"><input type="checkbox" data-set="remind.habits" ${r.habits ? 'checked' : ''}><i></i></span></label>
      <label class="set-row"><span class="lbl"><b>Horas de silencio</b><span>${r.quiet.on ? `De ${r.quiet.from} a ${r.quiet.to} no sale nada` : 'Apagado'}</span></span><span class="switch"><input type="checkbox" data-set="remind.quiet.on" ${r.quiet.on ? 'checked' : ''}><i></i></span></label>
      ${r.quiet.on ? `<div class="set-row"><span class="lbl"><b>Horario</b></span><input class="input" style="width:110px" type="time" data-set="remind.quiet.from" value="${r.quiet.from}"><input class="input" style="width:110px" type="time" data-set="remind.quiet.to" value="${r.quiet.to}"></div>` : ''}
    </div>

    <div class="section-t">Cómo te hablan</div>
    <div class="set-list">
      <div class="set-row stack"><span class="lbl"><b>Tono</b></span><div class="seg">${Object.entries(TONOS).map(([v, t]) => `<button data-act="tone" data-v="${v}" aria-pressed="${(r.tone || 'motivador') === v}">${t.nombre}</button>`).join('')}</div></div>
      <div class="set-row stack"><label class="lbl" for="txMan"><b>Mensaje de la mañana</b><span>Vacío = el del tono</span></label><textarea class="input area" id="txMan" rows="2" maxlength="200" data-set="remind.textoManana" placeholder="${esc((TONOS[r.tone] || TONOS.motivador).manana[1])}">${esc(r.textoManana)}</textarea></div>
      <div class="set-row stack"><label class="lbl" for="txNoc"><b>Mensaje de la noche</b><span>Vacío = el del tono</span></label><textarea class="input area" id="txNoc" rows="2" maxlength="200" data-set="remind.textoNoche" placeholder="${esc((TONOS[r.tone] || TONOS.motivador).noche[1])}">${esc(r.textoNoche)}</textarea></div>
      <div class="set-row"><button class="btn sm" data-act="testNotif">Probar aviso</button><button class="btn sm ghost" data-act="ics">Pasarlos al calendario</button></div>
    </div>
    <p class="help">Podés usar <b>{nombre}</b>, <b>{faltan}</b> (“3 hábitos”) y <b>{lista}</b> (“Gym, Leer y Agua”). El texto de cada hábito se cambia en su ficha.</p>
    <p class="help">En iPhone: instalá la app (Safari → Compartir → Agregar a inicio), abrila desde el ícono y tocá “Activar”. Si no, “Pasarlos al calendario” los agrega como alarmas.</p>
    ${DEMO ? '' : `<details class="other adv"><summary>Servidor de avisos${I.abajo}</summary><div class="set-list"><div class="set-row stack"><label class="lbl" for="pushUrl"><b>Dirección</b><span>Ya viene puesta; cambiala solo si te lo piden</span></label>
      <input class="input" id="pushUrl" data-set="push.url" type="url" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="${esc(APP.avisos || 'https://rutina-avisos….workers.dev')}" value="${esc(S.settings.push.url)}"></div></div></details>`}

    <div class="section-t">Preferencias</div>
    <div class="set-list">
      <div class="set-row"><span class="lbl"><b>Tu nombre</b></span><input class="input" style="width:150px" data-set="name" value="${esc(S.settings.name)}" maxlength="20" autocomplete="given-name"></div>
      <label class="set-row"><span class="lbl"><b>Agrupar por momento</b><span>Mañana, tarde y noche</span></span><span class="switch"><input type="checkbox" data-set="grouping" ${S.settings.grouping ? 'checked' : ''}><i></i></span></label>
      <div class="set-row stack"><span class="lbl"><b>Tema</b><span>Los colores de la app</span></span><div class="temas">${TEMAS.map(([v, n]) => `<button class="tema" data-act="palette" data-v="${v}" data-p="${v}" aria-pressed="${(S.settings.palette || 'vida') === v}"><i aria-hidden="true"></i><span>${n}</span></button>`).join('')}</div></div>
      <div class="set-row"><span class="lbl"><b>Apariencia</b></span><div class="seg" style="width:210px">${[['auto', (S.settings.palette || 'vida') === 'vida' ? 'Hora' : 'Auto'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, n]) => `<button data-act="theme" data-v="${v}" aria-pressed="${S.settings.theme === v}">${n}</button>`).join('')}</div></div>
    </div>

    <div class="section-t">Traer de otra app</div>
    <div class="set-list">
      <div class="set-row"><span class="lbl"><b>Tareas</b><span>Desde un CSV (ej. Mi Agenda)</span></span><label class="btn sm">Importar<input type="file" accept=".csv,text/csv,text/plain" data-set="impTareas" class="sr"></label></div>
      <div class="set-row"><span class="lbl"><b>Gastos</b><span>Fecha, descripción, monto, categoría</span></span><label class="btn sm">Importar<input type="file" accept=".csv,text/csv,text/plain" data-set="impGastos" class="sr"></label></div>
    </div>
    <p class="help">Si tu app vieja no exporta CSV, copiá los datos a una planilla (Google Sheets o Excel) y descargala como CSV. Las columnas pueden estar en cualquier orden.</p>

    <div class="section-t">Copia de seguridad</div>
    <div class="set-list"><div class="set-row"><button class="btn sm" data-act="export">Exportar</button><label class="btn sm ghost">Importar<input type="file" accept="application/json,.json" data-set="import" class="sr"></label></div></div>
    <p class="help">Tus datos quedan solo en este teléfono. Exportá una copia cada tanto.</p>
    ${DEMO ? '<div class="set-list" style="margin-top:14px"><div class="set-row"><span class="lbl"><b>Demo</b><span>Volver a los datos de ejemplo</span></span><button class="btn sm danger" data-act="resetDemo">Reiniciar</button></div></div>' : ''}
    <p class="help" style="text-align:center;margin-top:24px">${esc(APP.name)} · ${esc(APP.tagline)}</p>`;
}

// ---------- TAREAS ----------
function quedoTxt(k) {
  const d = diffDays(k, today());
  if (d === 1) return 'Quedó de ayer';
  if (d < 7) return `Quedó del ${DIAS_LARGO[weekday(k)]}`;
  const [, mm, dd] = k.split('-').map(Number);
  return `Quedó del ${dd}/${mm}`;
}
function taskRow(t, { compacto = false } = {}) {
  const k = today();
  const st = estadoTarea(t, k);
  const meta = [];
  if (st === 'vencida') meta.push(`<span class="vieja-t">${quedoTxt(t.date)}</span>`);
  else if (t.date && st !== 'hoy' && !(compacto && st === 'hecha')) meta.push(`<span>${esc(cuandoTxt(t.date))}</span>`);
  if (t.time) meta.push(`<span class="num">${t.time}</span>`);
  if (t.list && !compacto) meta.push(`<span class="lista">${esc(t.list)}</span>`);
  const pop = ui.popTask === t.id ? ' pop' : '';
  const fin = st === 'vencida'
    ? `<button class="chip mini" data-act="postpone" data-id="${t.id}">Mañana${I.der}</button>`
    : `<button class="icon-btn more" data-act="editTask" data-id="${t.id}" aria-label="Opciones de ${esc(t.title)}">${I.puntos}</button>`;
  return `<div class="task${t.done ? ' done' : ''}${st === 'vencida' ? ' vieja' : ''}${t.prio === 'alta' ? ' alta' : ''}${pop}">
    <button class="tcheck" data-act="toggleTask" data-id="${t.id}" aria-pressed="${!!t.done}" aria-label="${t.done ? 'Desmarcar' : 'Marcar hecha'}: ${esc(t.title)}"><span class="check" aria-hidden="true">${I.tilde}</span></button>
    <button class="tbody" data-act="editTask" data-id="${t.id}"><span class="name">${t.prio === 'alta' ? '<i class="star" aria-label="Importante">✦</i>' : ''}${esc(t.title)}</span>${meta.length ? `<span class="meta">${meta.join('')}</span>` : ''}</button>
    ${fin}</div>`;
}
function tareaPreview(txt) {
  if (!txt || !txt.trim()) return '';
  const p = tareaDesdeTexto(txt, today(), nowMinutes(), S.settings.taskLists);
  const partes = [`<b>${esc(p.title)}</b>`, p.date ? esc(cuandoTxt(p.date)) : 'sin fecha'];
  if (p.time) partes.push(`<span class="num">${p.time}</span>`);
  if (p.list) partes.push(esc(p.list));
  if (p.prio === 'alta') partes.push('importante');
  return '→ ' + partes.join(' · ');
}
function tareasHoyCard(k) {
  const lista = tareasDeHoy(S.tasks, k);
  const hechasHoy = S.tasks.filter((t) => t.done && t.doneAt === k).length;
  if (!lista.length && !hechasHoy) return '';
  const muestra = lista.slice(0, 4);
  return `<section class="card tasks-hoy"><div class="tasks-h"><h3>Pendientes</h3><span class="muted tiny num">${hechasHoy ? `${hechasHoy} ${hechasHoy === 1 ? 'hecha' : 'hechas'} hoy` : ''}</span></div>
    ${muestra.length ? `<div class="tlist">${muestra.map((t) => taskRow(t, { compacto: true })).join('')}</div>` : '<p class="muted tiny" style="margin:4px 0 0">Todo hecho por hoy.</p>'}
    <button class="btn ghost block sm vermas" data-act="tab" data-tab="tareas">${lista.length > muestra.length ? `Ver ${lista.length - muestra.length} más` : 'Ver todas las tareas'}${I.der}</button></section>`;
}
function renderTareas() {
  const k = today();
  const filtro = ui.tlista || null;
  const g = agruparTareas(S.tasks, k, filtro);
  const ls = listas(S.settings.taskLists);
  const sec = (titulo, items, nota = '') => items.length ? `<div class="section-t">${titulo}<small class="num">${nota || items.length}</small></div><div class="tlist">${items.map((t) => taskRow(t)).join('')}</div>` : '';
  const pendientes = g.vencida.length + g.hoy.length + g.manana.length + g.proxima.length + g.sinfecha.length;
  return `<header class="head"><div><div class="eyebrow">Tus pendientes</div><h1>Tareas</h1></div><div class="brand">${esc(APP.name)}</div></header>
    <form class="quick" id="fTarea" autocomplete="off"><input class="input" id="tText" placeholder="Escribí: llamar a Ari mañana 10" aria-label="Agregar tarea" enterkeyhint="done" maxlength="120" value="${esc(ui.tquick || '')}">
      <button class="btn primary sm" type="submit" aria-label="Agregar tarea">${I.mas}</button></form>
    <p class="quick-prev" id="tPrev" aria-live="polite">${tareaPreview(ui.tquick)}</p>
    <div class="chips filtros"><button class="chip ${filtro ? '' : 'on'}" data-act="tlista" data-v="">Todas</button>${ls.map((l) => `<button class="chip ${filtro === l ? 'on' : ''}" data-act="tlista" data-v="${esc(l)}">${esc(l)}</button>`).join('')}</div>
    ${pendientes ? '' : `<div class="card empty"><b>${filtro ? 'Nada en esta lista' : 'Nada pendiente'}</b>Escribí arriba lo que tengas que hacer.</div>`}
    ${sec('Quedaron pendientes', g.vencida, 'sin culpa')}
    ${sec('Hoy', g.hoy)}
    ${sec('Mañana', g.manana)}
    ${sec('Próximas', g.proxima)}
    ${sec('Cuando puedas', g.sinfecha)}
    ${g.hecha.length ? `<details class="other"><summary>Hechas · ${g.hecha.length}${I.abajo}</summary><div class="tlist">${g.hecha.slice(0, 30).map((t) => taskRow(t)).join('')}</div></details>` : ''}
    <p class="help">Tip: sumá <b>#liga</b> para la lista o “importante” para marcarla. Con hora, aparece en la Agenda.</p>
    <div class="set-list" style="margin-top:14px"><div class="set-row"><span class="lbl"><b>¿Venís de otra app?</b><span>Importá tus tareas desde un CSV</span></span><label class="btn sm">Importar<input type="file" accept=".csv,text/csv,text/plain" data-set="impTareas" class="sr"></label></div></div>
    <p class="help">Columnas que entiende: título, fecha, hora, lista, prioridad y estado (en cualquier orden).</p>`;
}
function taskForm(id) {
  const t = id ? S.tasks.find((x) => x.id === id) : { title: '', date: today(), time: null, prio: 'normal', list: null };
  if (!t) return;
  const ls = listas(S.settings.taskLists);
  openSheet(`<h2><span>${id ? 'Tarea' : 'Nueva tarea'}</span><button class="icon-btn" data-act="closeSheet" aria-label="Cerrar">${I.cerrar}</button></h2>
    <form id="fTask" data-id="${id || ''}">
      <div class="field"><label for="kTitle">Qué</label><input class="input" id="kTitle" value="${esc(t.title)}" maxlength="80" required enterkeyhint="done"></div>
      <div class="two"><div class="field"><label for="kDate">Día</label><input class="input" id="kDate" type="date" value="${t.date || ''}"></div>
        <div class="field"><label for="kTime">Hora</label><input class="input" id="kTime" type="time" value="${t.time || ''}"></div></div>
      <p class="help" style="margin-top:-10px;margin-bottom:14px">Sin día queda en “Cuando puedas”. Con hora, aparece en la Agenda.</p>
      <div class="field"><span class="lb">Prioridad</span>${segHTML('kprio', [['normal', 'Normal'], ['alta', 'Importante']], t.prio || 'normal')}</div>
      <div class="field"><span class="lb">Lista</span><div class="chips pick" data-group="klist"><button type="button" class="chip" data-pick="" data-v="" aria-pressed="${!t.list}">Ninguna</button>${ls.map((l) => `<button type="button" class="chip" data-pick="${esc(l)}" data-v="${esc(l)}" aria-pressed="${t.list === l}">${esc(l)}</button>`).join('')}</div>
        <input class="input" id="kNewList" maxlength="20" placeholder="O creá una lista nueva"></div>
      <div class="actions"><button class="btn primary block" type="submit">Guardar</button>
        ${id && !t.done ? `<button class="btn block" type="button" data-act="postpone" data-id="${id}">Pasar a mañana</button>` : ''}
        ${id ? `<button class="btn block" type="button" data-act="toggleTask" data-id="${id}">${t.done ? 'Desmarcar' : 'Marcar hecha'}</button><button class="btn danger block" type="button" data-act="delTask" data-id="${id}">Borrar</button>` : ''}</div>
    </form>`);
}
function saveTask(form) {
  const id = form.dataset.id;
  const title = form.querySelector('#kTitle').value.trim();
  if (!title) { form.querySelector('#kTitle').focus(); return; }
  const nueva = form.querySelector('#kNewList').value.trim().slice(0, 20);
  let list = pressed('klist')[0] || null;
  if (nueva) {
    list = listas(S.settings.taskLists).find((l) => l.toLowerCase() === nueva.toLowerCase()) || nueva;
    if (!listas(S.settings.taskLists).includes(list)) S.settings.taskLists.push(list);
  }
  const data = { title, date: form.querySelector('#kDate').value || null, time: form.querySelector('#kTime').value || null, prio: pressed('kprio')[0] || 'normal', list };
  if (id) Object.assign(S.tasks.find((x) => x.id === id), data);
  else S.tasks.push({ id: newId('t'), done: false, doneAt: null, created: today(), ...data });
  commit(); closeSheet(); keepScroll(); toast(id ? 'Tarea actualizada' : 'Tarea agregada');
}
function saveTareaRapida(form) {
  const txt = form.querySelector('#tText').value.trim();
  if (!txt) return;
  const p = tareaDesdeTexto(txt, today(), nowMinutes(), S.settings.taskLists);
  if (p.list && !listas(S.settings.taskLists).includes(p.list)) S.settings.taskLists.push(p.list);
  const t = { id: newId('t'), ...p, done: false, doneAt: null, created: today() };
  S.tasks.push(t);
  commit();
  ui.tquick = '';
  form.querySelector('#tText').blur();
  render();
  toast(`Anotada: ${t.title}${t.date ? ' · ' + cuandoTxt(t.date) : ''}`, () => { S.tasks = S.tasks.filter((x) => x !== t); commit(); ui.tquick = txt; render(); });
}
const keepScroll = () => { const y = window.scrollY; render(); window.scrollTo(0, y); };

// ---------- GASTOS ----------
const CAT_HEX = { comida: '#E07B39', transporte: '#2B7FD9', canchas: '#2F9E62', casa: '#C9A227', salud: '#14A3A3', ocio: '#8B5CF6', trabajo: '#D94F70', otros: '#6B7280' };
function catColor(id) {
  if (CAT_HEX[id]) return CAT_HEX[id];
  const i = (S.settings.expenseCats || []).findIndex((c) => c.id === id);
  return COLORES[(i < 0 ? 7 : i) % COLORES.length];
}
const mesNombre = (ym) => { const [y, m] = ym.split('-').map(Number); return `${cap(MESES[m - 1])} ${y}`; };
function dona(r) {
  const R = 46, C = 2 * Math.PI * R;
  let acc = 0;
  const segs = r.gastos ? r.porCat.map((x) => {
    const len = Math.max(0, x.pct * C - (r.porCat.length > 1 ? 2.5 : 0));
    const s = `<circle cx="60" cy="60" r="${R}" fill="none" stroke-width="13" style="--c:${catColor(x.cat)}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-acc}"/>`;
    acc += x.pct * C;
    return s;
  }).join('') : '';
  return `<div class="dona" role="img" aria-label="Gastado ${formatARS(r.gastos)}"><svg viewBox="0 0 120 120"><circle class="d-bg" cx="60" cy="60" r="${R}" fill="none" stroke-width="13"/>${segs}</svg>
    <div class="d-lbl"><span>Gastado</span><b class="num">${formatARS(r.gastos)}</b></div></div>`;
}
function renderGastos() {
  const t = today();
  const ym = ui.mes || mesDe(t);
  const esteMes = ym === mesDe(t);
  const r = resumenMes(S.expenses, ym);
  const propias = S.settings.expenseCats;
  const budgets = S.settings.budgets || {};
  const filasCat = [...r.porCat];
  for (const c of Object.keys(budgets)) if (budgets[c] && !filasCat.some((x) => x.cat === c)) filasCat.push({ cat: c, total: 0, pct: 0 });
  const catRows = filasCat.map((x) => {
    const c = catDe(x.cat, propias);
    const p = presupuesto(x.total, budgets[x.cat]);
    const ancho = Math.min(100, Math.round((p ? p.pct : x.pct) * 100));
    const nota = p ? (p.pasado ? `Te pasaste ${formatARS(-p.resto).replace('−', '')}` : `${Math.round(p.pct * 100)}% de ${formatARS(p.tope)}`) : `${Math.round(x.pct * 100)}% del mes`;
    return `<button class="gcatrow${p && p.pasado ? ' pasado' : ''}" style="--c:${catColor(x.cat)}" data-act="budget" data-id="${esc(x.cat)}">
      <span class="ico" aria-hidden="true">${c.emoji}</span><span class="grow"><span class="gl"><b>${esc(c.name)}</b><b class="num">${formatARS(x.total)}</b></span>
      <span class="bar"><i style="width:${ancho}%"></i></span><span class="gn">${nota}${p ? '' : ' · <u>Poner tope</u>'}</span></span></button>`;
  }).join('');
  const dias = r.porDia.map((d) => `<div class="gday"><span>${esc(diaGasto(d.date))}</span><span class="num">${d.gastos ? '−' + formatARS(d.gastos) : ''}${d.ingresos ? ` <em>+${formatARS(d.ingresos)}</em>` : ''}</span></div>
    <div class="set-list movs">${d.items.map((x) => { const c = catDe(x.cat, propias); return `<button class="set-row mov${x.kind === 'ingreso' ? ' ing' : ''}" style="--c:${catColor(x.cat)}" data-act="editGasto" data-id="${x.id}"><span class="ico" aria-hidden="true">${c.emoji}</span>
      <span class="lbl"><b>${esc(x.note || c.name)}</b><span>${x.note ? esc(c.name) : x.kind === 'ingreso' ? 'Ingreso' : 'Gasto'}</span></span><span class="monto-r num">${x.kind === 'ingreso' ? '+' : '−'}${formatARS(x.amount)}</span></button>`; }).join('')}</div>`).join('');
  return `<header class="head"><div><div class="eyebrow">Tu plata</div><h1>Gastos</h1></div><div class="brand">${esc(APP.name)}</div></header>
    <div class="daynav"><button class="icon-btn" data-act="mes" data-d="-1" aria-label="Mes anterior">${I.izq}</button>
      <button class="lbl" data-act="mes" data-d="0">${mesNombre(ym)}<small>${esteMes ? 'Este mes' : 'Volver a este mes'}</small></button>
      <button class="icon-btn" data-act="mes" data-d="1" aria-label="Mes siguiente" ${esteMes ? 'disabled style="opacity:.3"' : ''}>${I.der}</button></div>
    <section class="card gsum">${dona(r)}<div class="g-top">${r.porCat.slice(0, 4).map((x) => { const c = catDe(x.cat, propias); return `<span style="--c:${catColor(x.cat)}"><i></i>${esc(c.name)}<b class="num">${Math.round(x.pct * 100)}%</b></span>`; }).join('') || '<span class="muted">Todavía sin gastos este mes</span>'}</div>
      ${r.ingresos ? `<div class="g-bal"><span>Ingresos <b class="num">+${formatARS(r.ingresos)}</b></span><span>Balance <b class="num">${formatARS(r.balance)}</b></span></div>` : ''}</section>
    ${catRows ? `<div class="section-t">Por categoría<small>tocá para poner un tope</small></div><div class="gcats-l">${catRows}</div>` : ''}
    <div class="section-t">Movimientos<small class="num">${r.cantidad || ''}</small></div>
    ${dias || '<div class="card empty"><b>Sin movimientos</b>Tocá “Anotar” para sumar el primero.</div>'}
    <div class="set-list" style="margin-top:22px"><div class="set-row"><span class="lbl"><b>Planilla</b><span>Exportá o traé gastos de otra app</span></span>
      <button class="btn sm" data-act="gastosCSV">Exportar</button><label class="btn sm ghost">Importar<input type="file" accept=".csv,text/csv,text/plain" data-set="impGastos" class="sr"></label></div></div>
    <p class="help">El CSV puede tener fecha, descripción, monto y categoría, en cualquier orden. Los montos negativos se toman como gastos.</p>`;
}
function diaGasto(k) {
  const d = diffDays(k, today());
  const [, mm, dd] = k.split('-').map(Number);
  if (d === 0) return `Hoy · ${DIAS_LARGO[weekday(k)]} ${dd}`;
  if (d === 1) return `Ayer · ${DIAS_LARGO[weekday(k)]} ${dd}`;
  return `${cap(DIAS_LARGO[weekday(k)])} ${dd}/${mm}`;
}
function gastoSheet(id) {
  const x = id ? S.expenses.find((e) => e.id === id) : null;
  if (id && !x) return;
  ui.g = { monto: x ? String(Math.round(x.amount)) : '' };
  const cats = categorias(S.settings.expenseCats);
  const cat = x ? x.cat : null;
  openSheet(`<h2><span>${id ? 'Movimiento' : 'Anotar'}</span><button class="icon-btn" data-act="closeSheet" aria-label="Cerrar">${I.cerrar}</button></h2>
    ${segHTML('gkind', [['gasto', 'Gasto'], ['ingreso', 'Ingreso']], x ? x.kind : 'gasto')}
    <div class="monto num" id="gMonto" aria-live="polite">${formatARS(Number(ui.g.monto || 0))}</div>
    <div class="gcats" data-group="gcat">${cats.map((c) => `<button type="button" data-pick="${esc(c.id)}" data-v="${esc(c.id)}" aria-pressed="${c.id === cat}" style="--c:${catColor(c.id)}"><span aria-hidden="true">${c.emoji}</span><b>${esc(c.name)}</b></button>`).join('')}</div>
    <input class="input gnueva" id="gNuevaCat" maxlength="20" placeholder="Otra categoría (ej. Mascotas)">
    <div class="pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'x'].map((k) => `<button type="button" data-act="key" data-k="${k}" ${k === 'x' ? 'aria-label="Borrar"' : ''}>${k === 'x' ? I.borrar : k}</button>`).join('')}</div>
    <div class="two"><div class="field"><label for="gNote">Nota</label><input class="input" id="gNote" maxlength="80" placeholder="Opcional" value="${esc(x ? x.note : '')}"></div>
      <div class="field"><label for="gDate">Día</label><input class="input" id="gDate" type="date" value="${x ? x.date : today()}"></div></div>
    <div class="actions gsave"><button class="btn primary block" data-act="saveGasto" data-id="${id || ''}">Guardar</button>
      ${id ? `<button class="btn danger block" data-act="delGasto" data-id="${id}">Borrar</button>` : ''}</div>`);
}
function teclaMonto(k) {
  if (!ui.g) return;
  let m = ui.g.monto || '';
  if (k === 'x') m = m.slice(0, -1);
  else if (m.length < 10) m = (m + k).replace(/^0+/, '');
  ui.g.monto = m.slice(0, 10);
  const el = document.getElementById('gMonto');
  if (el) { el.textContent = formatARS(Number(ui.g.monto || 0)); el.classList.remove('tic'); void el.offsetWidth; el.classList.add('tic'); }
}
function saveGasto(id) {
  const amount = Number(ui.g && ui.g.monto);
  if (!amount) { toast('Poné el monto con el teclado'); return; }
  let cat = pressed('gcat')[0] || null;
  const nueva = (sheet.querySelector('#gNuevaCat').value || '').trim().slice(0, 20);
  if (nueva) {
    const exacta = categorias(S.settings.expenseCats).find((c) => c.name.toLowerCase() === nueva.toLowerCase());
    if (exacta) cat = exacta.id;
    else { const c = { id: 'c-' + newId(''), name: cap(nueva), emoji: '🏷️' }; S.settings.expenseCats.push(c); cat = c.id; }
  }
  const kind = pressed('gkind')[0] || 'gasto';
  if (!cat) cat = kind === 'ingreso' ? 'trabajo' : 'otros';
  const data = { kind, amount, cat, note: sheet.querySelector('#gNote').value.trim().slice(0, 80), date: sheet.querySelector('#gDate').value || today() };
  let nuevo = null;
  if (id) Object.assign(S.expenses.find((e) => e.id === id), data);
  else { nuevo = { id: newId('g'), created: new Date().toISOString(), ...data }; S.expenses.push(nuevo); }
  commit(); closeSheet(); ui.mes = mesDe(data.date); ui.g = null; keepScroll();
  const c = catDe(cat, S.settings.expenseCats);
  toast(`${id ? 'Guardado' : 'Anotado'}: ${formatARS(amount)} · ${c.name}`, nuevo ? () => { S.expenses = S.expenses.filter((e) => e !== nuevo); commit(); render(); } : undefined);
}
function budgetSheet(cat) {
  const c = catDe(cat, S.settings.expenseCats);
  const tope = (S.settings.budgets || {})[cat];
  openSheet(`<h2><span>${c.emoji} ${esc(c.name)}</span><button class="icon-btn" data-act="closeSheet" aria-label="Cerrar">${I.cerrar}</button></h2>
    <p class="muted" style="margin-top:-6px">Un tope mensual para esta categoría. Es solo una guía: te muestra cuánto vas, sin alarmas.</p>
    <form id="fBudget" data-id="${esc(cat)}"><div class="field"><label for="bTope">Tope por mes</label><input class="input" id="bTope" inputmode="numeric" placeholder="Ej.: 80.000" value="${tope ? formatARS(tope).replace('$ ', '') : ''}" enterkeyhint="done"></div>
      <div class="actions"><button class="btn primary block" type="submit">Guardar</button>${tope ? '<button class="btn ghost block" type="button" data-act="budgetOff" data-id="' + esc(cat) + '">Quitar tope</button>' : ''}</div></form>`);
}
function importar(tipo, texto) {
  const t = today();
  if (tipo === 'tareas') {
    const r = importarTareas(texto, { propias: S.settings.taskLists });
    const nuevos = r.items.map((x) => ({ id: newId('t'), ...x, doneAt: x.done ? (x.date || t) : null, created: t }));
    for (const x of nuevos) if (x.list && !listas(S.settings.taskLists).includes(x.list)) S.settings.taskLists.push(x.list);
    S.tasks.push(...nuevos);
    commit(); render();
    toast(nuevos.length ? `${nuevos.length} ${nuevos.length === 1 ? 'tarea importada' : 'tareas importadas'}${r.errores.length ? ` · ${r.errores.length} con problemas` : ''}` : (r.errores[0] || 'No encontré tareas en el archivo'),
      nuevos.length ? () => { const ids = new Set(nuevos.map((x) => x.id)); S.tasks = S.tasks.filter((x) => !ids.has(x.id)); commit(); render(); } : undefined);
  } else {
    const r = importarGastos(texto, { propias: S.settings.expenseCats, today: t });
    const nuevos = r.items.map((x, i) => ({ id: newId('g'), created: new Date(Date.now() - i).toISOString(), ...x }));
    S.expenses.push(...nuevos);
    if (nuevos.length) ui.mes = mesDe(nuevos.map((x) => x.date).sort().pop());
    commit(); render();
    toast(nuevos.length ? `${nuevos.length} ${nuevos.length === 1 ? 'movimiento importado' : 'movimientos importados'}${r.errores.length ? ` · ${r.errores.length} con problemas` : ''}` : (r.errores[0] || 'No encontré movimientos en el archivo'),
      nuevos.length ? () => { const ids = new Set(nuevos.map((x) => x.id)); S.expenses = S.expenses.filter((x) => !ids.has(x.id)); commit(); render(); } : undefined);
  }
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
      ${(() => {
        const a = avisoHabito(h, S.settings.remind);
        const tono = TONOS[S.settings.remind.tone] || TONOS.motivador;
        return `<div class="field aviso-h"><span class="lb">Aviso</span><div class="set-list">
          <label class="set-row"><span class="lbl"><b>Avisarme</b><span>${S.settings.remind.on ? 'A la hora que elijas' : 'Los avisos están apagados en Ajustes'}</span></span><span class="switch"><input type="checkbox" id="hRemOn" ${a.on || (h.remind && h.remind.on) ? 'checked' : ''}><i></i></span></label>
          <div class="set-row"><span class="lbl"><b>Hora del aviso</b><span>Vacío = la del hábito</span></span><input class="input" style="width:120px" type="time" id="hRemTime" value="${esc((h.remind && h.remind.time) || '')}"></div>
          <div class="set-row stack"><label class="lbl" for="hRemText"><b>Texto</b><span>Vacío = el del tono</span></label><input class="input" id="hRemText" maxlength="120" value="${esc((h.remind && h.remind.text) || '')}" placeholder="${esc(tono.habito[1])}"></div>
        </div></div>`;
      })()}
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
  const remOn = form.querySelector('#hRemOn').checked, remTime = form.querySelector('#hRemTime').value || null;
  if (remOn && !remTime && !data.time) { toast('Para avisarte, poné una hora (del hábito o del aviso)'); form.querySelector('#hRemTime').focus(); return; }
  const porDefecto = !!(S.settings.remind.habits && data.time); // si coincide con lo general, sigue a lo general
  data.remind = { on: remOn === porDefecto ? null : remOn, time: remTime, text: form.querySelector('#hRemText').value.trim().slice(0, 120) };
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

// Avisos locales (con la app abierta). Si están los avisos push, los manda el servidor y acá no se repiten.
function remindTick() {
  const r = S.settings.remind;
  if (!r.on || pushActivo() || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const k = today(), m = nowMinutes();
  let f = firedGet();
  if (f.k !== k) f = { k, ids: [] };
  const hechos = hechosDe(S, [k])[k];
  for (const av of planAvisos(S, k, 1)) {
    if (m < av.min || m >= av.min + 10 || f.ids.includes(av.id)) continue;
    f.ids.push(av.id);
    const msg = llenar(av, hechos);
    if (msg) notify(msg.title, msg.body, av.hid || av.tipo);
  }
  firedSet(f);
}

// ---------- Avisos push (app cerrada) ----------
// iPhone: solo con la app instalada en la pantalla de inicio (iOS 16.4+). El servidor guarda la suscripción y un
// plan de los próximos días; cada vez que marcás algo, le avisamos qué hiciste para que la noche liste solo lo que falta.
const PUSH_DIAS = 10;
const pushUrl = () => String(S.settings.push.url || APP.avisos || '').trim().replace(/\/+$/, '');
const instalada = () => { try { return !!(navigator.standalone || matchMedia('(display-mode: standalone)').matches); } catch { return false; } };
const pushSoportado = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
const pushActivo = () => !DEMO && !!(S.settings.push.on && S.settings.push.id);
let pushTimer = null, pushBusy = false;

function pushEstado() {
  if (DEMO) return 'En la demo no hay avisos push';
  if (pushActivo()) return S.settings.remind.on ? 'Activos en este teléfono' : 'Prendé “Avisos” para que salgan';
  if (!pushSoportado()) return /iPhone|iPad/.test(navigator.userAgent) && !instalada() ? 'Primero instalá la app (Compartir → Agregar a inicio)' : 'Este navegador no los permite';
  if (!pushUrl()) return 'Falta el servidor de avisos';
  if (Notification.permission === 'denied') return 'Bloqueados: habilitalos en Ajustes del iPhone → Notificaciones';
  return 'Apagados';
}
function pushBoton() {
  if (DEMO || (!pushActivo() && (!pushSoportado() || !pushUrl()))) return '';
  return pushActivo() ? '<button class="btn sm ghost" data-act="pushOff">Apagar</button>' : '<button class="btn sm primary" data-act="pushOn">Activar</button>';
}
const b64uBytes = (s) => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); const b = atob(t + '='.repeat((4 - (t.length % 4)) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };

async function pushPost(ruta, data) {
  const r = await fetch(pushUrl() + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  let j = null; try { j = await r.json(); } catch { /* */ }
  if (!r.ok) { const e = new Error((j && j.error) || `El servidor respondió ${r.status}`); e.status = r.status; throw e; }
  return j;
}
const pushDatos = () => {
  const k = today();
  return { plan: planAvisos(S, k, PUSH_DIAS), hechos: hechosDe(S, [addDays(k, -1), k]) };
};

async function pushOn() {
  if (!S.settings.remind.on) { S.settings.remind.on = true; save(S); }
  try {
    if (Notification.permission !== 'granted') await Notification.requestPermission();
    if (Notification.permission !== 'granted') { toast('Sin permiso: habilitalo en Ajustes del iPhone → Notificaciones → Rutina'); render(); return; }
    toast('Activando…');
    const reg = await navigator.serviceWorker.ready;
    const { clave } = await (await fetch(pushUrl() + '/vapid')).json();
    if (!clave) throw new Error('El servidor no tiene claves');
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(clave) });
    const p = S.settings.push;
    const j = await pushPost('/suscribir', { sub: sub.toJSON(), id: p.id, clave: p.clave, ...pushDatos() });
    Object.assign(p, { on: true, id: j.id, clave: j.clave });
    save(S); render();
    toast('Listo: te van a llegar aunque cierres la app');
  } catch (err) {
    toast(err && err.name === 'TypeError' ? 'No se pudo conectar con el servidor de avisos' : (err.message || 'No se pudo activar'));
  }
}
async function pushOff() {
  const p = S.settings.push;
  try { if (p.id) await pushPost('/baja', { id: p.id, clave: p.clave }); } catch { /* igual se apaga acá */ }
  try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch { /* */ }
  Object.assign(p, { on: false, id: '', clave: '' });
  save(S); render(); toast('Avisos con la app cerrada: apagados');
}
// Después de cada cambio (debounce): manda plan y hechos. Si el servidor no reconoce el equipo, hay que reactivar.
function pushLuego(ms = 2500) {
  if (!pushActivo()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushSync, ms);
}
async function pushSync() {
  if (!pushActivo() || pushBusy) return;
  pushBusy = true;
  try { await pushPost('/plan', { id: S.settings.push.id, clave: S.settings.push.clave, ...pushDatos() }); }
  catch (err) { if (err.status === 404) { S.settings.push.on = false; save(S); toast('Los avisos con la app cerrada se cortaron: tocá Activar de nuevo en Ajustes'); } }
  finally { pushBusy = false; }
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
  for (const h of habitsActive()) {
    const a = avisoHabito(h, r);
    if (!a.on) continue;
    const rule = h.freq.type === 'days' ? `FREQ=WEEKLY;BYDAY=${h.freq.days.map((d) => BY[d]).join(',')}` : 'FREQ=DAILY';
    out.push(ev(h.id, `${h.icon} ${h.name}`, a.time, rule, Number(h.dur) || 15));
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
  tab: (el) => {
    let t = el.dataset.tab;
    if (t === 'mas') t = ui.mas || 'semana';
    if (t === 'semana' || t === 'ajustes') ui.mas = t;
    ui.tab = t; if (ui.tab === 'agenda') { ui.scrollNow = true; } window.scrollTo({ top: 0 }); render();
  },
  toggleTask: (el) => {
    const t = S.tasks.find((x) => x.id === el.dataset.id); if (!t) return;
    const antes = { done: t.done, doneAt: t.doneAt };
    t.done = !t.done; t.doneAt = t.done ? today() : null;
    if (t.done) { ui.popTask = t.id; try { navigator.vibrate && navigator.vibrate(12); } catch { /* */ } }
    commit();
    if (document.body.classList.contains('open')) closeSheet();
    keepScroll(); ui.popTask = null;
    toast(t.done ? `${t.title} ✓` : `${t.title}: vuelve a pendientes`, () => { Object.assign(t, antes); commit(); keepScroll(); });
  },
  postpone: (el) => {
    const t = S.tasks.find((x) => x.id === el.dataset.id); if (!t) return;
    const antes = t.date;
    Object.assign(t, posponer(t, today()));
    commit(); if (document.body.classList.contains('open')) closeSheet(); keepScroll();
    toast(`${t.title}: pasa a mañana`, () => { t.date = antes; commit(); keepScroll(); });
  },
  editTask: (el) => taskForm(el.dataset.id),
  delTask: (el) => {
    const i = S.tasks.findIndex((x) => x.id === el.dataset.id); if (i < 0) return;
    const [t] = S.tasks.splice(i, 1);
    commit(); closeSheet(); keepScroll();
    toast('Tarea borrada', () => { S.tasks.splice(i, 0, t); commit(); keepScroll(); });
  },
  tlista: (el) => { ui.tlista = el.dataset.v || null; keepScroll(); },
  mes: (el) => { const d = Number(el.dataset.d); ui.mes = d ? mesSiguiente(ui.mes || mesDe(today()), d) : null; render(); },
  newGasto: () => gastoSheet(null),
  editGasto: (el) => gastoSheet(el.dataset.id),
  key: (el) => teclaMonto(el.dataset.k),
  saveGasto: (el) => saveGasto(el.dataset.id || null),
  delGasto: (el) => {
    const i = S.expenses.findIndex((x) => x.id === el.dataset.id); if (i < 0) return;
    const [x] = S.expenses.splice(i, 1);
    commit(); closeSheet(); keepScroll();
    toast('Movimiento borrado', () => { S.expenses.splice(i, 0, x); commit(); keepScroll(); });
  },
  budget: (el) => budgetSheet(el.dataset.id),
  budgetOff: (el) => { delete S.settings.budgets[el.dataset.id]; commit(); closeSheet(); keepScroll(); toast('Tope quitado'); },
  gastosCSV: () => { download(`${APP.name.toLowerCase()}-gastos-${today()}.csv`, gastosCSV(S.expenses, S.settings.expenseCats), 'text/csv'); toast('Planilla exportada'); },
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
  palette: (el) => { S.settings.palette = el.dataset.v; commit(); render(); },
  testNotif: async () => {
    const ej = ejemploAviso(S, today(), nowMinutes() < 15 * 60 ? 'manana' : 'noche');
    if (pushActivo()) {
      try { await pushPost('/probar', { id: S.settings.push.id, clave: S.settings.push.clave, ...ej }); toast('Enviado desde el servidor: cerrá la app y fijate'); }
      catch (err) { toast(err.message || 'No se pudo probar'); if (err.status === 410 || err.status === 404) { S.settings.push.on = false; save(S); render(); } }
      return;
    }
    if (typeof Notification === 'undefined') { toast(`Así sería: “${ej.title} — ${ej.body}”`); return; }
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission !== 'granted') { toast('Sin permiso para avisos'); render(); return; }
    notify(ej.title, ej.body, 'prueba'); render();
  },
  tone: (el) => { S.settings.remind.tone = el.dataset.v; commit(); render(); const ej = ejemploAviso(S, today()); toast(`${ej.title} — ${ej.body}`); },
  pushOn: () => pushOn(),
  pushOff: () => pushOff(),
  obNext: () => {
    const o = obEstado();
    if (o.paso === 0) { const i = document.getElementById('obName'); if (i) o.name = i.value; }
    o.paso = Math.min(2, o.paso + 1); window.scrollTo({ top: 0 }); render();
  },
  obBack: () => { const o = obEstado(); o.paso = Math.max(0, o.paso - 1); window.scrollTo({ top: 0 }); render(); },
  obPick: (el) => {
    const o = obEstado(), id = el.dataset.id;
    o.sel = o.sel.includes(id) ? o.sel.filter((x) => x !== id) : [...o.sel, id];
    const y = window.scrollY; render(); window.scrollTo(0, y);
  },
  obFin: () => obFin(),
  ics: () => { download(`${APP.name.toLowerCase()}-recordatorios.ics`, icsText(), 'text/calendar'); toast('Abrí el archivo para sumarlos al calendario'); },
  export: () => { download(`${APP.name.toLowerCase()}-copia-${today()}.json`, exportJSON(S), 'application/json'); toast('Copia exportada'); },
  resetDemo: () => { S = seedDemo(today()); commit(); ui.tab = 'hoy'; render(); toast('Demo reiniciada'); },
  calEvent: (el) => calEventSheet(el.dataset.id),
  calTest: () => { toast('Probando…'); calSync({ avisar: true, forzar: true }); },
  calRetry: () => calSync({ avisar: true, forzar: true }),
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
  if (e.target.id === 'fAgregar') saveAgregar(e.target);
  if (e.target.id === 'fQuick') saveQuick(e.target);
  if (e.target.id === 'fTarea') saveTareaRapida(e.target);
  if (e.target.id === 'fTask') saveTask(e.target);
  if (e.target.id === 'fBudget') {
    const v = parseMonto(e.target.querySelector('#bTope').value);
    const cat = e.target.dataset.id;
    if (Number.isFinite(v) && v > 0) S.settings.budgets[cat] = Math.round(v); else delete S.settings.budgets[cat];
    commit(); closeSheet(); keepScroll(); toast('Tope guardado');
  }
  if (e.target.id === 'fOb0') actions.obNext();
  if (e.target.id === 'fObNuevo') {
    const o = obEstado(), name = e.target.querySelector('#obNuevo').value.trim().slice(0, 40);
    if (!name) return;
    const id = newId('h');
    o.propios.push({ id, name, icon: '🎯', color: COLORES[o.propios.length % COLORES.length], freq: { type: 'daily' }, time: null, part: null, dur: 30, archived: false });
    o.sel.push(id); o.nuevo = '';
    render(); toast(`${name}: agregado`);
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'obName') { obEstado().name = e.target.value; return; }
  if (e.target.id === 'obNuevo') { obEstado().nuevo = e.target.value; return; }
  if (e.target.id === 'tText') {
    ui.tquick = e.target.value;
    const p = document.getElementById('tPrev');
    if (p) p.innerHTML = tareaPreview(ui.tquick);
    return;
  }
  if (e.target.id !== 'qText') return;
  ui.quick = e.target.value;
  const p = document.getElementById('qPrev');
  if (p) p.innerHTML = quickPreview(ui.quick);
});

document.addEventListener('change', async (e) => {
  if (e.target.id === 'obClases') { obEstado().clases = e.target.checked; render(); return; }
  const k = e.target.dataset && e.target.dataset.set;
  if (!k) return;
  const r = S.settings.remind;
  if (k === 'name') S.settings.name = e.target.value.trim().slice(0, 20);
  if (k === 'grouping') S.settings.grouping = e.target.checked;
  if (k === 'classesOn') { S.settings.classesOn = e.target.checked; S.settings.classesReviewed = true; }
  if (k === 'remind.morning') r.morning = e.target.value;
  if (k === 'remind.evening') r.evening = e.target.value;
  if (k === 'remind.habits') r.habits = e.target.checked;
  if (k === 'remind.quiet.on') r.quiet.on = e.target.checked;
  if (k === 'remind.quiet.from' && e.target.value) r.quiet.from = e.target.value;
  if (k === 'remind.quiet.to' && e.target.value) r.quiet.to = e.target.value;
  if (k === 'remind.textoManana' || k === 'remind.textoNoche') r[k.slice(7)] = e.target.value.trim().slice(0, 200);
  if (k === 'push.url') S.settings.push.url = e.target.value.trim();
  if (k === 'cal.url' || k === 'cal.token') {
    S.settings.cal[k.slice(4)] = e.target.value.trim();
    if (k === 'cal.url' && !S.settings.cal.url) { cal = { at: 0, eventos: [], error: null, errorAt: 0 }; try { localStorage.removeItem(CAL_KEY); } catch { /* */ } }
    commit(); render();
    if (calOn()) calSync({ forzar: true });
    return;
  }
  if (k === 'remind.on') {
    r.on = e.target.checked;
    if (r.on && typeof Notification !== 'undefined' && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch { /* */ } }
    if (r.on && (typeof Notification === 'undefined' || Notification.permission !== 'granted')) toast('Guardado. Para que lleguen, instalá la app y dale permiso.');
  }
  if (k === 'impTareas' || k === 'impGastos') {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try { importar(k === 'impTareas' ? 'tareas' : 'gastos', await file.text()); } catch { toast('No se pudo leer el archivo'); }
    e.target.value = '';
    return;
  }
  if (k === 'import') {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try { S = importJSON(await file.text()); commit(); render(); toast('Copia importada'); } catch (err) { toast(err.message || 'No se pudo importar'); }
    return;
  }
  commit(); render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('open')) closeSheet();
  // Teclado físico en la hoja de gastos (si no estás escribiendo en un campo)
  if (document.body.classList.contains('open') && document.getElementById('gMonto') && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) {
    if (/^\d$/.test(e.key)) { teclaMonto(e.key); e.preventDefault(); }
    else if (e.key === 'Backspace') { teclaMonto('x'); e.preventDefault(); }
  }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (!document.body.classList.contains('open') && !typing()) render(); remindTick(); calSync(); pushLuego(500); } });
setInterval(() => { remindTick(); if (ui.tab !== 'ajustes' && !document.body.classList.contains('open') && !document.hidden && !typing()) { const y = window.scrollY; render(); window.scrollTo(0, y); } }, 60000);
setInterval(() => { if (!document.hidden) calSync({ forzar: true }); }, 10 * 60000);
setInterval(() => { if (!document.hidden) applyTheme(); }, 60000); // el cielo se mueve aunque estés en Ajustes o con una hoja abierta
if (DEMO) window.rutinaCielo = applyTheme; // demo: la barrita de hora mueve el cielo

if (!DEMO && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo offline */ });
}

// Para pruebas automáticas
window.__rutina = { get S() { return S; }, get cal() { return cal; }, ui, render, analyze, today, importar };

const pedido = leerAgregar();
if (pedido) ui.tab = 'agenda';
render();
remindTick();
calSync({ forzar: true });
pushLuego(1500);
// Tocar un aviso abre la app en Hoy.
if (!DEMO && 'serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.ir === 'hoy') { closeSheet(); ui.tab = 'hoy'; window.scrollTo({ top: 0 }); render(); } });
if (new URLSearchParams(location.search).get('ir') === 'hoy') { try { history.replaceState(null, '', location.pathname); } catch { /* */ } }
if (pedido) agregarSheet(pedido);
// Si la pestaña ya estaba abierta, el Atajo solo cambia el #: se atiende igual.
window.addEventListener('hashchange', () => { const t = leerAgregar(); if (t) { ui.tab = 'agenda'; render(); agregarSheet(t); } });
