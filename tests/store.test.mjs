// Pruebas de datos: usuario nuevo vs. datos de antes (los de Gabriel no se tocan). Uso: node tests/store.test.mjs
import assert from 'node:assert/strict';
import { emptyState, migrate, importJSON, exportJSON, sugeridos, seedDemo } from '../js/store.js';

let ok = 0, fail = 0;
function t(name, fn) {
  try { fn(); ok++; console.log('  ok  ', name); }
  catch (e) { fail++; console.log('  FALLA', name, '\n       ', e.message); }
}

t('Usuario nuevo: sin hábitos, sin clases, con bienvenida', () => {
  const s = emptyState();
  assert.equal(s.settings.onboarded, false);
  assert.equal(s.settings.classesOn, false);
  assert.deepEqual(s.habits, []);
  assert.deepEqual(s.classes, []);
  assert.equal(s.settings.name, '');
});
t('Datos de antes (v1): quedan igual, sin bienvenida y con clases', () => {
  const v1 = {
    v: 1,
    settings: { name: 'Gabi', theme: 'dark', grouping: true, remind: { on: true, morning: '07:45', evening: '22:00', habits: false }, classesReviewed: true, cal: { url: 'https://x.workers.dev', token: 'k' } },
    habits: [{ id: 'gym', name: 'Gym', icon: '🏋️', freq: { type: 'times', n: 3 }, created: '2026-10-01' }],
    log: { '2026-11-09': { gym: 'done' } },
    blocks: [{ id: 'b1', date: '2026-11-10', start: '10:00', end: '11:00', title: 'Reel' }],
    classes: [{ id: 'c1', days: [1], from: '18:00', to: '19:00', dur: 60, club: 'La 10' }],
    classOff: {},
  };
  const copia = JSON.parse(JSON.stringify(v1));
  const s = migrate(v1);
  assert.equal(s.settings.onboarded, true);
  assert.equal(s.settings.classesOn, true);
  assert.equal(s.settings.name, 'Gabi');
  assert.equal(s.settings.theme, 'dark');
  assert.deepEqual(s.habits, copia.habits);
  assert.deepEqual(s.log, copia.log);
  assert.deepEqual(s.blocks, copia.blocks);
  assert.deepEqual(s.classes, copia.classes);
  assert.equal(s.settings.remind.morning, '07:45');
  assert.equal(s.settings.remind.habits, false);
  assert.equal(s.settings.remind.tone, 'motivador'); // lo nuevo toma el valor por defecto
  assert.deepEqual(s.settings.cal, { url: 'https://x.workers.dev', token: 'k' });
  assert.equal(s.v, 3);
});
t('Copia de seguridad vieja se importa sin bienvenida', () => {
  const s = importJSON(JSON.stringify({ app: 'Rutina', datos: { v: 1, settings: { name: 'Gabi' }, habits: [], log: {} } }));
  assert.equal(s.settings.onboarded, true);
});
t('Datos v2 de un usuario que no da clases: siguen sin clases', () => {
  const s = migrate({ v: 2, settings: { name: 'Vale', onboarded: true, classesOn: false }, habits: [], log: {}, classes: [] });
  assert.equal(s.settings.classesOn, false);
  assert.deepEqual(s.classes, []);
});
t('Sugerencias: los 10 de Gabriel + comunes, sin repetidos', () => {
  const s = sugeridos('2026-11-10');
  const ids = s.map((h) => h.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['agua', 'leer', 'estirar', 'skincare', 'redes', 'gym', 'meditar', 'dormir', 'psicologo', 'contenido']) assert.ok(ids.includes(id), id);
  assert.ok(s.every((h) => h.name && h.icon && h.freq));
});
t('Datos v2 → v3: se suman tareas y gastos vacíos sin tocar lo demás', () => {
  const v2 = { v: 2, settings: { name: 'Gabi', onboarded: true, classesOn: true, palette: 'rosa' }, habits: [{ id: 'gym', name: 'Gym', icon: '🏋️', freq: { type: 'daily' } }], log: { '2026-11-09': { gym: 'done' } }, blocks: [], classes: [], classOff: {} };
  const copia = JSON.parse(JSON.stringify(v2));
  const s = migrate(v2);
  assert.equal(s.v, 3);
  assert.deepEqual(s.tasks, []);
  assert.deepEqual(s.expenses, []);
  assert.deepEqual(s.settings.budgets, {});
  assert.deepEqual(s.settings.taskLists, []);
  assert.deepEqual(s.habits, copia.habits);
  assert.deepEqual(s.log, copia.log);
  assert.equal(s.settings.palette, 'rosa');
});
t('Tareas y gastos viajan en la copia de seguridad', () => {
  const s = emptyState();
  s.tasks.push({ id: 't1', title: 'Llamar a Ari', date: '2026-11-11', time: '10:00', prio: 'alta', list: 'Liga', done: false });
  s.expenses.push({ id: 'g1', kind: 'gasto', amount: 12500, cat: 'comida', note: 'Súper', date: '2026-11-10' });
  s.settings.budgets = { comida: 90000 };
  const r = importJSON(exportJSON(s));
  assert.deepEqual(r.tasks, s.tasks);
  assert.deepEqual(r.expenses, s.expenses);
  assert.deepEqual(r.settings.budgets, { comida: 90000 });
});
t('La demo trae tareas y gastos de ejemplo', () => {
  const s = seedDemo('2026-11-10');
  assert.ok(s.tasks.length >= 5);
  assert.ok(s.expenses.length >= 10);
});
t('La demo sigue con los datos de Gabriel', () => {
  const s = seedDemo('2026-11-10');
  assert.equal(s.settings.onboarded, true);
  assert.equal(s.settings.classesOn, true);
  assert.equal(s.habits.length, 10);
  assert.ok(s.classes.length > 0);
});

console.log(`\n${ok} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
