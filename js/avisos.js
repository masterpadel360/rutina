// Avisos: qué aviso sale, a qué hora y con qué texto. Lógica pura (la usan los avisos locales y el plan que va al servidor).
// Variables en los textos: {nombre}, {faltan} ("3 hábitos"), {lista} ("Gym, Inglés y Leer"), {habito}, {icono}.
import { addDays, keyToUTC, toMin, dueOn, statusOf } from './logic.js';

export const OFFSET_CBA = -180; // Córdoba: UTC-3 todo el año (sin horario de verano)

export const TONOS = {
  motivador: {
    nombre: 'Motivador',
    manana: ['¡Buen día, {nombre}! ☀️', 'Hoy tenés {faltan}: {lista}. ¡Vamos que se puede!'],
    noche: ['Último empujón 💪', 'Para cerrar el día: {lista}. ¡Vamos que se puede!'],
    habito: ['{icono} {habito}', '¡Es tu momento! Dale que suma.'],
  },
  tranqui: {
    nombre: 'Tranqui',
    manana: ['Buen día, {nombre} 🌿', 'Cuando puedas: {lista}. Sin apuro.'],
    noche: ['Antes de dormir 🌙', 'Si te da: {lista}. Y si no, mañana seguimos.'],
    habito: ['{icono} {habito}', 'Cuando quieras. Un pasito y listo.'],
  },
  directo: {
    nombre: 'Directo',
    manana: ['Hoy: {faltan}', '{lista}.'],
    noche: ['Sin hacer: {faltan}', '{lista}. Ahora.'],
    habito: ['{icono} {habito}', 'Ahora.'],
  },
};

export function listaTxt(nombres, max = 4) {
  const n = nombres.length;
  if (!n) return '';
  if (n > max) return `${nombres.slice(0, max - 1).join(', ')} y ${n - max + 1} más`;
  return n === 1 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} y ${nombres[n - 1]}`;
}
export const faltanTxt = (n) => (n === 1 ? '1 hábito' : `${n} hábitos`);

// Reemplaza variables; las que no vienen quedan como están (el servidor completa {faltan} y {lista} al enviar).
export function plantilla(tpl, vars) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

// Completa {faltan}/{lista} con lo que todavía no se hizo. null = no hay que mandar nada.
// (El worker de avisos tiene una copia de esta función: mantenerlas iguales.)
export function llenar(av, hechos) {
  const h = new Set(hechos || []);
  if (av.tipo === 'habito') return h.has(av.hid) ? null : { title: av.title, body: av.body };
  const faltan = (av.cand || []).filter((c) => !h.has(c.id));
  if (!faltan.length) return null;
  const v = { faltan: faltanTxt(faltan.length), lista: listaTxt(faltan.map((c) => c.name)) };
  return { title: plantilla(av.title, v), body: plantilla(av.body, v) };
}

// ¿minuto m cae en las horas de silencio? (soporta que crucen la medianoche: 22:30 a 07:30)
export function enSilencio(m, q) {
  if (!q || !q.on) return false;
  const a = toMin(q.from), b = toMin(q.to);
  if (a == null || b == null || a === b) return false;
  return a < b ? m >= a && m < b : m >= a || m < b;
}

// Aviso propio de un hábito (si no tiene, se arma con lo general).
export function avisoHabito(h, r) {
  const x = h.remind || {};
  const on = x.on != null ? !!x.on : !!(r.habits && h.time);
  const time = x.time || h.time || null;
  return { on: on && !!time, time, text: x.text || '' };
}

// Plan de avisos de `dias` días desde `desde`. Cada aviso: { id, dia, at (ms UTC), min, tipo, title, body, cand?, hid? }.
export function planAvisos(S, desde, dias = 7) {
  const r = S.settings.remind;
  if (!r || !r.on) return [];
  const tono = TONOS[r.tone] || TONOS.motivador;
  const nombre = S.settings.name || '';
  const out = [];
  const add = (k, min, tipo, title, body, extra) => {
    if (min == null || enSilencio(min, r.quiet)) return;
    out.push({ id: `${k}/${extra.hid || tipo}`, dia: k, at: keyToUTC(k) + (min - OFFSET_CBA) * 60000, min, tipo, title, body, ...extra });
  };
  for (let i = 0; i < dias; i++) {
    const k = addDays(desde, i);
    const due = S.habits.filter((h) => !h.archived && dueOn(h, S.log, k) && statusOf(S.log, h.id, k) !== 'skip');
    if (!due.length) continue;
    const cand = due.map((h) => ({ id: h.id, name: h.name }));
    const v = { nombre };
    const sinNombre = (s) => (nombre ? s : s.replace(/,\s*\{nombre\}/g, '').replace(/\{nombre\}\s*/g, ''));
    if (r.morning) add(k, toMin(r.morning), 'manana', plantilla(sinNombre(tono.manana[0]), v), plantilla(sinNombre(r.textoManana || tono.manana[1]), v), { cand });
    if (r.evening) add(k, toMin(r.evening), 'noche', plantilla(sinNombre(tono.noche[0]), v), plantilla(sinNombre(r.textoNoche || tono.noche[1]), v), { cand });
    for (const h of due) {
      const a = avisoHabito(h, r);
      if (!a.on) continue;
      const vh = { nombre, habito: h.name, icono: h.icon || '' };
      add(k, toMin(a.time), 'habito', plantilla(tono.habito[0], vh).trim(), plantilla(a.text || tono.habito[1], vh), { hid: h.id });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

// Hábitos hechos por día (para que el servidor sepa qué ya no hay que recordar).
export function hechosDe(S, dias) {
  const o = {};
  for (const k of dias) o[k] = Object.entries(S.log[k] || {}).filter(([, v]) => v === 'done' || v === 'skip').map(([id]) => id);
  return o;
}

// Ejemplo para "Probar aviso" (con los hábitos de hoy).
export function ejemploAviso(S, k, tipo = 'manana') {
  const p = planAvisos({ ...S, settings: { ...S.settings, remind: { ...S.settings.remind, on: true, quiet: { on: false } } } }, k, 1).find((a) => a.tipo === tipo);
  if (!p) return { title: 'Rutina', body: 'Así te van a llegar los avisos.' };
  return llenar(p, []) || { title: p.title, body: p.body };
}

