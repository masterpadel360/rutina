// Datos locales: un solo objeto versionado en localStorage (si no hay, queda en memoria).
import { dateKey, addDays, weekday } from './logic.js';

// Marca: cambiar acá el nombre si se vende con otra marca.
export const APP = { name: 'Rutina', tagline: 'Tus hábitos y tu día, en un toque', storageKey: 'rutina.datos', schema: 1 };

export const COLORES = ['#2F9E62', '#2B7FD9', '#8B5CF6', '#E07B39', '#D94F70', '#C9A227', '#14A3A3', '#6B7280'];

let uid = 0;
export function newId(p = 'x') {
  return p + Date.now().toString(36) + (uid++).toString(36) + Math.random().toString(36).slice(2, 5);
}

export function defaultHabits(today) {
  const H = (id, name, icon, color, freq, extra = {}) => ({ id, name, icon, color, freq, time: null, part: null, dur: 30, archived: false, created: today, ...extra });
  return [
    H('despertar', 'Despertarme temprano', '⏰', COLORES[5], { type: 'days', days: [1, 2, 3, 4, 5] }, { time: '07:00', dur: 15 }),
    H('meditar', 'Meditar', '🧘', COLORES[2], { type: 'daily' }, { time: '07:30', dur: 15 }),
    H('gym', 'Gym', '🏋️', COLORES[3], { type: 'times', n: 3 }, { time: '09:00', dur: 60 }),
    H('ingles', 'Estudiar inglés', '🗣️', COLORES[1], { type: 'days', days: [1, 2, 3, 4, 5] }, { time: '11:00', dur: 30 }),
    H('contenido', 'Subir contenido de pádel', '🎾', COLORES[0], { type: 'times', n: 4 }, { part: 'tarde' }),
    H('correr', 'Salir a correr', '🏃', COLORES[6], { type: 'times', n: 2 }, { part: 'manana' }),
    H('entrenar', 'Entrenar', '💪', COLORES[4], { type: 'times', n: 3 }, { part: 'tarde' }),
    H('psicologo', 'Psicólogo', '🧠', COLORES[7], { type: 'days', days: [3] }, { time: '15:00', dur: 60 }),
    H('comer', 'Comer bien', '🥗', COLORES[0], { type: 'daily' }, { part: 'noche' }),
    H('dormir', 'Dormir bien', '😴', COLORES[2], { type: 'daily' }, { time: '23:30', dur: 15 }),
  ];
}

// Plantilla de ejemplo de clases (hay que revisarla: la grilla real está en la app de clases y pide login).
export function defaultClasses() {
  return [
    { id: 'c-la10', days: [1, 2, 3, 4, 5], from: '18:00', to: '21:00', dur: 60, club: 'La 10' },
    { id: 'c-jump', days: [2, 4], from: '16:30', to: '17:30', dur: 60, club: 'Jump' },
  ];
}

export function emptyState(today = dateKey()) {
  return {
    v: APP.schema,
    settings: {
      name: 'Gabi', theme: 'auto', grouping: true,
      remind: { on: false, morning: '08:00', evening: '21:30', habits: true },
      classesReviewed: false,
    },
    habits: defaultHabits(today),
    log: {},
    blocks: [],
    classes: defaultClasses(),
    classOff: {},
  };
}

// Migraciones: cuando cambie el esquema, se agrega un paso acá.
export function migrate(s) {
  if (!s || typeof s !== 'object') return null;
  if (!s.v) s.v = 1;
  const base = emptyState();
  s.settings = { ...base.settings, ...(s.settings || {}), remind: { ...base.settings.remind, ...((s.settings || {}).remind || {}) } };
  s.habits = Array.isArray(s.habits) ? s.habits : base.habits;
  s.log = s.log && typeof s.log === 'object' ? s.log : {};
  s.blocks = Array.isArray(s.blocks) ? s.blocks : [];
  s.classes = Array.isArray(s.classes) ? s.classes : base.classes;
  s.classOff = s.classOff && typeof s.classOff === 'object' ? s.classOff : {};
  s.v = APP.schema;
  return s;
}

let memoria = null; // si localStorage no anda, los datos viven acá mientras la página esté abierta
export let persistente = true;

export function load() {
  let raw = null;
  try { raw = localStorage.getItem(APP.storageKey); } catch { persistente = false; }
  if (raw) {
    try { const s = migrate(JSON.parse(raw)); if (s) return s; } catch { /* datos rotos: se arranca de cero */ }
  }
  return memoria || emptyState();
}

export function save(s) {
  memoria = s;
  try { localStorage.setItem(APP.storageKey, JSON.stringify(s)); persistente = true; } catch { persistente = false; }
}

export function exportJSON(s) {
  return JSON.stringify({ app: APP.name, exportado: new Date().toISOString(), datos: s }, null, 2);
}
export function importJSON(text) {
  const o = JSON.parse(text);
  const s = migrate(o && o.datos ? o.datos : o);
  if (!s || !Array.isArray(s.habits)) throw new Error('El archivo no es una copia válida');
  return s;
}

// Historia de ejemplo (solo para la demo): ~2 semanas creíbles.
export function seedDemo(today = dateKey()) {
  const s = emptyState(addDays(today, -20));
  s.settings.classesReviewed = true;
  let x = 7;
  const rnd = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  const prob = { despertar: 0.8, meditar: 0.85, gym: 0.55, ingles: 0.7, contenido: 0.6, correr: 0.35, entrenar: 0.5, comer: 0.75, dormir: 0.7, psicologo: 0.95 };
  for (let i = 16; i >= 1; i--) {
    const k = addDays(today, -i);
    const day = (s.log[k] = {});
    for (const h of s.habits) {
      const f = h.freq;
      if (f.type === 'days' && !f.days.includes(weekday(k))) continue;
      if (weekday(k) === 0 && h.id === 'gym') continue;
      if (rnd() < prob[h.id]) day[h.id] = 'done';
      else if (h.id === 'correr' && rnd() < 0.15) day[h.id] = 'skip';
    }
  }
  // Hoy: la mañana ya arrancó
  s.log[today] = { despertar: 'done', meditar: 'done' };
  s.blocks = [
    { id: 'b1', date: today, start: '10:00', end: '11:00', title: 'Editar reel de la liga', color: COLORES[0] },
    { id: 'b2', date: today, start: '13:00', end: '14:00', title: 'Almuerzo', color: COLORES[5] },
    { id: 'b3', weekly: true, wd: 1, start: '12:00', end: '12:30', title: 'Pagar canchas a Gonza', color: COLORES[3] },
  ];
  return s;
}
