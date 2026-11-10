// Datos locales: un solo objeto versionado en localStorage (si no hay, queda en memoria).
import { dateKey, addDays, weekday } from './logic.js';

// Marca: cambiar acá el nombre si se vende con otra marca.
// avisos: dirección del servidor de avisos push (se completa al publicarlo; también se puede cambiar en Ajustes).
export const APP = { name: 'Rutina', tagline: 'Tus hábitos y tu día, en un toque', storageKey: 'rutina.datos', schema: 2, avisos: '' };

export const COLORES = ['#2F9E62', '#2B7FD9', '#8B5CF6', '#E07B39', '#D94F70', '#C9A227', '#14A3A3', '#6B7280'];

let uid = 0;
export function newId(p = 'x') {
  return p + Date.now().toString(36) + (uid++).toString(36) + Math.random().toString(36).slice(2, 5);
}

const nuevoH = (today, id, name, icon, color, freq, extra = {}) => ({ id, name, icon, color, freq, time: null, part: null, dur: 30, archived: false, created: today, ...extra });

// Los 10 de Gabriel (también se usan en la demo).
export function defaultHabits(today) {
  return [
    nuevoH(today, 'despertar', 'Despertarme temprano', '⏰', COLORES[5], { type: 'days', days: [1, 2, 3, 4, 5] }, { time: '07:00', dur: 15 }),
    nuevoH(today, 'meditar', 'Meditar', '🧘', COLORES[2], { type: 'daily' }, { time: '07:30', dur: 15 }),
    nuevoH(today, 'gym', 'Gym', '🏋️', COLORES[3], { type: 'times', n: 3 }, { time: '09:00', dur: 60 }),
    nuevoH(today, 'ingles', 'Estudiar inglés', '🗣️', COLORES[1], { type: 'days', days: [1, 2, 3, 4, 5] }, { time: '11:00', dur: 30 }),
    nuevoH(today, 'contenido', 'Subir contenido de pádel', '🎾', COLORES[0], { type: 'times', n: 4 }, { part: 'tarde' }),
    nuevoH(today, 'correr', 'Salir a correr', '🏃', COLORES[6], { type: 'times', n: 2 }, { part: 'manana' }),
    nuevoH(today, 'entrenar', 'Entrenar', '💪', COLORES[4], { type: 'times', n: 3 }, { part: 'tarde' }),
    nuevoH(today, 'psicologo', 'Psicólogo', '🧠', COLORES[7], { type: 'days', days: [3] }, { time: '15:00', dur: 60 }),
    nuevoH(today, 'comer', 'Comer bien', '🥗', COLORES[0], { type: 'daily' }, { part: 'noche' }),
    nuevoH(today, 'dormir', 'Dormir bien', '😴', COLORES[2], { type: 'daily' }, { time: '23:30', dur: 15 }),
  ];
}

// Sugerencias para la primera vez: los de Gabriel + comunes. Se elige cuáles.
export function sugeridos(today) {
  const extra = [
    nuevoH(today, 'agua', 'Tomar agua', '💧', COLORES[1], { type: 'daily' }, { part: 'manana' }),
    nuevoH(today, 'leer', 'Leer', '📖', COLORES[5], { type: 'daily' }, { time: '22:30', dur: 20 }),
    nuevoH(today, 'estirar', 'Estirar', '🤸', COLORES[6], { type: 'daily' }, { part: 'manana', dur: 10 }),
    nuevoH(today, 'skincare', 'Skincare', '🧴', COLORES[4], { type: 'daily' }, { time: '22:45', dur: 10 }),
    nuevoH(today, 'redes', 'Sin redes de noche', '📵', COLORES[7], { type: 'daily' }, { time: '23:00', dur: 15 }),
    nuevoH(today, 'caminar', 'Caminar 30 min', '🚶', COLORES[0], { type: 'times', n: 4 }, { part: 'tarde' }),
    nuevoH(today, 'diario', 'Escribir el diario', '✍️', COLORES[2], { type: 'daily' }, { part: 'noche', dur: 10 }),
  ];
  const g = defaultHabits(today);
  const orden = ['agua', 'meditar', 'gym', 'leer', 'estirar', 'skincare', 'redes', 'dormir', 'comer', 'caminar', 'correr', 'entrenar', 'despertar', 'ingles', 'diario', 'psicologo', 'contenido'];
  const todos = [...extra, ...g];
  return orden.map((id) => todos.find((h) => h.id === id));
}

// Plantilla de ejemplo de clases (hay que revisarla: la grilla real está en la app de clases y pide login).
export function defaultClasses() {
  return [
    { id: 'c-la10', days: [1, 2, 3, 4, 5], from: '18:00', to: '21:00', dur: 60, club: 'La 10' },
    { id: 'c-jump', days: [2, 4], from: '16:30', to: '17:30', dur: 60, club: 'Jump' },
  ];
}

const settingsBase = () => ({
  name: '', theme: 'auto', grouping: true,
  remind: { on: false, morning: '08:00', evening: '21:30', habits: true, tone: 'motivador', textoManana: '', textoNoche: '', quiet: { on: false, from: '23:00', to: '07:00' } },
  classesOn: false, classesReviewed: false, onboarded: false,
  cal: { url: '', token: '' },
  push: { url: '', on: false, id: '', clave: '' },
});

// Usuario nuevo: sin hábitos ni clases (los elige en la bienvenida).
export function emptyState() {
  return { v: APP.schema, settings: settingsBase(), habits: [], log: {}, blocks: [], classes: [], classOff: {} };
}

// Migraciones: cuando cambie el esquema, se agrega un paso acá.
export function migrate(s) {
  if (!s || typeof s !== 'object') return null;
  if (!s.v) s.v = 1;
  const base = settingsBase();
  const viejo = s.settings || {};
  if (s.v < 2) { viejo.onboarded = true; if (viejo.classesOn == null) viejo.classesOn = true; if (viejo.name == null) viejo.name = 'Gabi'; } // datos de antes: se respetan tal cual
  s.settings = {
    ...base, ...viejo,
    remind: { ...base.remind, ...(viejo.remind || {}), quiet: { ...base.remind.quiet, ...((viejo.remind || {}).quiet || {}) } },
    cal: { ...base.cal, ...(viejo.cal || {}) },
    push: { ...base.push, ...(viejo.push || {}) },
  };
  s.habits = Array.isArray(s.habits) ? s.habits : (s.v < 2 ? defaultHabits(dateKey()) : []);
  s.log = s.log && typeof s.log === 'object' ? s.log : {};
  s.blocks = Array.isArray(s.blocks) ? s.blocks : [];
  s.classes = Array.isArray(s.classes) ? s.classes : (s.v < 2 ? defaultClasses() : []);
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
  const s = emptyState();
  s.habits = defaultHabits(addDays(today, -20));
  s.classes = defaultClasses();
  Object.assign(s.settings, { name: 'Gabi', onboarded: true, classesOn: true, classesReviewed: true });
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
