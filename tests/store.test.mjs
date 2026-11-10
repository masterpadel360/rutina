// Pruebas de datos: usuario nuevo vs. datos de antes (los de Gabriel no se tocan). Uso: node tests/store.test.mjs
import assert from 'node:assert/strict';
import { emptyState, migrate, importJSON, sugeridos, seedDemo } from '../js/store.js';

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
  assert.equal(s.v, 2);
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
t('La demo sigue con los datos de Gabriel', () => {
  const s = seedDemo('2026-11-10');
  assert.equal(s.settings.onboarded, true);
  assert.equal(s.settings.classesOn, true);
  assert.equal(s.habits.length, 10);
  assert.ok(s.classes.length > 0);
});

console.log(`\n${ok} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
