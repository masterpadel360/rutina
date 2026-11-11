// Tareas (cosas por hacer): agregar con texto, vencidas sin culpa, pasar a mañana e importar de otra app por CSV.
// Lógica pura (sin DOM).
import { addDays, diffDays, toMin } from './logic.js';
import { parseAgregar } from './agregar.js';
import { parseCSV, columnas, parseFecha, norm } from './finanzas.js';

export const LISTAS = ['Trabajo', 'Liga', 'Clases', 'Personal'];
export function listas(propias = []) {
  const out = [...LISTAS];
  for (const l of Array.isArray(propias) ? propias : []) if (l && !out.some((x) => norm(x) === norm(l))) out.push(l);
  return out;
}

// 'hecha' | 'vencida' | 'hoy' | 'manana' | 'proxima' | 'sinfecha'
export function estadoTarea(t, today) {
  if (t.done) return 'hecha';
  if (!t.date) return 'sinfecha';
  const d = diffDays(today, t.date);
  if (d < 0) return 'vencida';
  if (d === 0) return 'hoy';
  if (d === 1) return 'manana';
  return 'proxima';
}

const ordenar = (a, b) => (a.date || '9999').localeCompare(b.date || '9999')
  || (b.prio === 'alta') - (a.prio === 'alta')
  || (toMin(a.time) ?? 9999) - (toMin(b.time) ?? 9999)
  || String(a.created || '').localeCompare(String(b.created || ''));

export function agruparTareas(tasks, today, lista = null) {
  const g = { vencida: [], hoy: [], manana: [], proxima: [], sinfecha: [], hecha: [] };
  for (const t of tasks || []) {
    if (lista && t.list !== lista) continue;
    g[estadoTarea(t, today)].push(t);
  }
  for (const k of Object.keys(g)) g[k].sort(ordenar);
  g.hoy.sort((a, b) => (b.prio === 'alta') - (a.prio === 'alta') || (toMin(a.time) ?? 9999) - (toMin(b.time) ?? 9999));
  g.hecha.sort((a, b) => String(b.doneAt || '').localeCompare(String(a.doneAt || '')));
  return g;
}

// Para "Hoy": lo de hoy primero (importantes arriba) y después lo que quedó pendiente.
export function tareasDeHoy(tasks, today) {
  const g = agruparTareas(tasks, today);
  return [...g.hoy, ...g.vencida];
}

export function posponer(t, today) { return { ...t, date: addDays(today, 1) }; }

// "llamar a Ari mañana 10 #liga !" → { title, date, time, prio, list }
export function tareaDesdeTexto(texto, today, nowMin = 0, propias = []) {
  let txt = String(texto || '').trim();
  let prio = 'normal', list = null;
  const todas = listas(propias);
  txt = txt.replace(/#([\p{L}\d_-]+)/gu, (_, nom) => {
    const l = todas.find((x) => norm(x) === norm(nom));
    list = l || nom.charAt(0).toUpperCase() + nom.slice(1);
    return ' ';
  });
  if (/(^|\s)!(\s|$)|\b(importante|urgente)\b/i.test(txt)) {
    prio = 'alta';
    txt = txt.replace(/(^|\s)!(?=\s|$)/g, ' ').replace(/\b(importante|urgente)\b/gi, ' ');
  }
  const p = parseAgregar(txt, today, nowMin);
  const title = p.title === 'Nuevo bloque' ? 'Nueva tarea' : p.title;
  const date = p.conFecha || !p.sinHora ? p.date : null;
  const time = p.sinHora ? null : p.start;
  return { title, date, time, prio, list };
}

// Importa tareas de un CSV (columnas flexibles: titulo/tarea/descripcion, fecha, hora, lista/categoria, prioridad, hecha/estado).
export function importarTareas(texto, { propias = [] } = {}) {
  const filas = parseCSV(texto);
  if (filas.length < 2) return { items: [], errores: ['El archivo está vacío o no tiene encabezados'] };
  const col = columnas(filas[0], {
    titulo: ['titulo', 'tarea', 'descripcion', 'title', 'nombre', 'asunto', 'task', 'texto', 'nota'],
    fecha: ['fecha', 'date', 'vence', 'vencimiento', 'dia', 'día'],
    hora: ['hora', 'time', 'horario'],
    lista: ['lista', 'categoria', 'etiqueta', 'tag', 'list', 'proyecto'],
    prio: ['prioridad', 'priority', 'importante'],
    hecha: ['hecha', 'hecho', 'estado', 'completada', 'completado', 'done', 'status'],
  });
  if (col.titulo < 0) return { items: [], errores: ['No encontré la columna del título (titulo, tarea o descripcion)'] };
  const todas = listas(propias);
  const items = [], errores = [];
  filas.slice(1).forEach((f, i) => {
    const title = (f[col.titulo] || '').slice(0, 80);
    if (!title) { errores.push(`Fila ${i + 2}: sin título`); return; }
    const date = col.fecha >= 0 && f[col.fecha] ? parseFecha(f[col.fecha]) : null;
    if (col.fecha >= 0 && f[col.fecha] && !date) errores.push(`Fila ${i + 2}: fecha "${f[col.fecha]}" no válida (queda sin fecha)`);
    let time = null;
    const h = col.hora >= 0 ? String(f[col.hora] || '').match(/(\d{1,2})[:.hH](\d{2})/) : null;
    if (h && +h[1] < 24 && +h[2] < 60) time = `${h[1].padStart(2, '0')}:${h[2]}`;
    const ln = col.lista >= 0 ? f[col.lista] : '';
    const list = ln ? (todas.find((x) => norm(x) === norm(ln)) || ln.slice(0, 20)) : null;
    const pr = col.prio >= 0 ? norm(f[col.prio]) : '';
    const prio = /alta|import|urgent|high|^si$|^1$|^true$|^x$/.test(pr) ? 'alta' : 'normal';
    const hc = col.hecha >= 0 ? norm(f[col.hecha]) : '';
    const done = /^(si|sí|1|true|x|hecha|hecho|completad|done|terminad|lista)/.test(hc);
    items.push({ title, date, time, list, prio, done });
  });
  return { items, errores };
}
