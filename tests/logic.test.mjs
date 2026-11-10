// Pruebas de la lógica. Uso: node tests/logic.test.mjs
import assert from 'node:assert/strict';
import {
  dateKey, nowMinutes, addDays, weekday, weekStart, isScheduled, dueOn, analyze, weekStats,
  dayProgress, cellState, expandClasses, layoutLanes, blocksFor, freqLabel, weekTarget,
} from '../js/logic.js';

let ok = 0, fail = 0;
function t(name, fn) {
  try { fn(); ok++; console.log('  ok  ', name); }
  catch (e) { fail++; console.log('  FALLA', name, '\n       ', e.message); }
}
const L = (entries) => { const log = {}; for (const [k, id, st] of entries) (log[k] ||= {})[id] = st; return log; };

console.log('Fechas y zona horaria');
t('02:30 UTC del 11/11 es todavía 10/11 en Córdoba', () => {
  assert.equal(dateKey(new Date('2026-11-11T02:30:00Z')), '2026-11-10');
  assert.equal(nowMinutes(new Date('2026-11-11T02:30:00Z')), 23 * 60 + 30);
});
t('03:00 UTC ya es el día siguiente en Córdoba', () => {
  assert.equal(dateKey(new Date('2026-11-11T03:00:00Z')), '2026-11-11');
});
t('Con otra zona da otro día (UTC)', () => {
  assert.equal(dateKey(new Date('2026-11-11T02:30:00Z'), 'UTC'), '2026-11-11');
});
t('Semana empieza el lunes', () => {
  assert.equal(weekday('2026-11-10'), 2); // martes
  assert.equal(weekStart('2026-11-10'), '2026-11-09');
  assert.equal(weekStart('2026-11-15'), '2026-11-09'); // domingo
  assert.equal(weekStart('2026-11-16'), '2026-11-16');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

console.log('Frecuencias');
const diario = { id: 'm', name: 'Meditar', freq: { type: 'daily' }, created: '2026-10-01' };
const psico = { id: 'p', name: 'Psicólogo', freq: { type: 'days', days: [3] }, created: '2026-10-01' };
const correr = { id: 'c', name: 'Correr', freq: { type: 'times', n: 3 }, created: '2026-10-01' };
t('Días fijos: psicólogo solo los miércoles', () => {
  assert.equal(isScheduled(psico, '2026-11-11'), true);
  assert.equal(isScheduled(psico, '2026-11-10'), false);
  assert.equal(freqLabel(psico.freq), 'Mié');
  assert.equal(freqLabel({ type: 'days', days: [1, 2, 3, 4, 5] }), 'Lunes a viernes');
});
t('No aparece antes de creado', () => {
  assert.equal(isScheduled({ ...diario, created: '2026-11-10' }, '2026-11-09'), false);
});
t('3 por semana: desaparece al cumplir, sigue si lo hiciste hoy', () => {
  const log = L([['2026-11-09', 'c', 'done'], ['2026-11-10', 'c', 'done']]);
  assert.equal(dueOn(correr, log, '2026-11-11'), true); // 2/3
  log['2026-11-11'] = { c: 'done' };
  assert.equal(dueOn(correr, log, '2026-11-11'), true); // hecho hoy: se sigue viendo
  assert.equal(dueOn(correr, log, '2026-11-12'), false); // 3/3: ya no
});
t('Descanso planificado baja la meta semanal', () => {
  const log = L([...['09', 10, 11, 12, 13].map((d) => [`2026-11-${d}`, 'c', 'skip'])]);
  assert.equal(weekTarget(correr, log, '2026-11-14'), 2);
});

console.log('Rachas con perdón');
t('Diario: 5 seguidos = 5, hoy pendiente no corta', () => {
  const log = L([5, 6, 7, 8, 9].map((d) => [`2026-11-0${d}`, 'm', 'done']));
  const a = analyze({ ...diario, created: '2026-11-05' }, log, '2026-11-10');
  assert.equal(a.current, 5);
  assert.equal(a.best, 5);
});
t('Diario: un día salteado en la semana usa el comodín y no corta', () => {
  // lun 9 hecho, mar 10 no, mié 11 hecho, jue 12 hecho
  const log = L([['2026-11-09', 'm', 'done'], ['2026-11-11', 'm', 'done'], ['2026-11-12', 'm', 'done']]);
  const a = analyze({ ...diario, created: '2026-11-09' }, log, '2026-11-12');
  assert.equal(a.current, 3);
  assert.ok(a.jokers.has('2026-11-10'));
  assert.equal(cellState({ ...diario, created: '2026-11-09' }, log, '2026-11-10', '2026-11-12', a), 'joker');
});
t('Diario: dos fallas en la misma semana sí cortan', () => {
  const log = L([['2026-11-09', 'm', 'done'], ['2026-11-12', 'm', 'done']]);
  const a = analyze({ ...diario, created: '2026-11-09' }, log, '2026-11-12');
  assert.equal(a.current, 1);
  assert.equal(a.best, 1);
});
t('Diario: el comodín se renueva cada lunes', () => {
  // dom 8 fallado (semana 2-8), lun 9 fallado (semana 9-15): cada uno usa el suyo
  const log = L([['2026-11-07', 'm', 'done'], ['2026-11-10', 'm', 'done']]);
  const a = analyze({ ...diario, created: '2026-11-07' }, log, '2026-11-10');
  assert.equal(a.current, 2);
});
t('Descanso planificado no cuenta ni corta', () => {
  const log = L([['2026-11-09', 'm', 'done'], ['2026-11-10', 'm', 'skip'], ['2026-11-11', 'm', 'skip'], ['2026-11-12', 'm', 'done']]);
  const a = analyze({ ...diario, created: '2026-11-09' }, log, '2026-11-12');
  assert.equal(a.current, 2);
  assert.equal(a.jokers.size, 0);
});
t('Días fijos: los días que no tocan no cuentan', () => {
  const log = L([['2026-10-28', 'p', 'done'], ['2026-11-04', 'p', 'done']]);
  const a = analyze(psico, log, '2026-11-10');
  assert.equal(a.current, 2);
});
t('Semanal 3x: cuenta semanas cumplidas; la semana en curso queda pendiente', () => {
  const h = { ...correr, created: '2026-10-26' };
  const log = L([
    ['2026-10-26', 'c', 'done'], ['2026-10-28', 'c', 'done'], ['2026-10-30', 'c', 'done'], // cumplida
    ['2026-11-02', 'c', 'done'], ['2026-11-04', 'c', 'done'], ['2026-11-06', 'c', 'done'], // cumplida
    ['2026-11-09', 'c', 'done'], // en curso
  ]);
  const a = analyze(h, log, '2026-11-10');
  assert.equal(a.unit, 'sem');
  assert.equal(a.current, 2);
});
t('Semanal 3x: faltó solo 1 → comodín; faltaron 2 → corta', () => {
  const h = { ...correr, created: '2026-10-19' };
  const base = [['2026-10-19', 'c', 'done'], ['2026-10-20', 'c', 'done'], ['2026-10-21', 'c', 'done']];
  const a1 = analyze(h, L([...base, ['2026-10-26', 'c', 'done'], ['2026-10-27', 'c', 'done'], ['2026-11-02', 'c', 'done'], ['2026-11-03', 'c', 'done'], ['2026-11-04', 'c', 'done']]), '2026-11-10');
  assert.equal(a1.current, 2); // semana 26/10 salvada con comodín
  const a2 = analyze(h, L([...base, ['2026-10-26', 'c', 'done'], ['2026-11-02', 'c', 'done'], ['2026-11-03', 'c', 'done'], ['2026-11-04', 'c', 'done']]), '2026-11-10');
  assert.equal(a2.current, 1);
  assert.equal(a2.best, 1);
});

console.log('Semana y día');
t('Progreso del día excluye descansos y hábitos que no tocan', () => {
  const log = L([['2026-11-10', 'm', 'done'], ['2026-11-10', 'c', 'skip']]);
  const p = dayProgress([diario, psico, correr], log, '2026-11-10');
  assert.deepEqual(p, { done: 1, total: 1 });
});
t('% semanal: diario 2 de 2 hasta hoy, hoy sin marcar no baja', () => {
  const log = L([['2026-11-09', 'm', 'done'], ['2026-11-10', 'm', 'done']]);
  const s = weekStats([diario], log, '2026-11-11', '2026-11-11');
  assert.equal(s.done, 2); assert.equal(s.target, 2); assert.equal(s.pct, 1);
});
t('% semanal de una semana cerrada', () => {
  const log = L([['2026-11-02', 'm', 'done'], ['2026-11-03', 'm', 'done'], ['2026-11-04', 'p', 'done']]);
  const s = weekStats([diario, psico], log, '2026-11-02', '2026-11-10');
  assert.equal(s.target, 8); assert.equal(s.done, 3);
});

console.log('Agenda');
t('Plantilla de clases → bloques del día', () => {
  const cl = [{ id: 'a', days: [1, 2, 3, 4, 5], from: '18:00', to: '21:00', dur: 60, club: 'La 10' }, { id: 'b', days: [2], from: '16:30', to: '17:30', dur: 60, club: 'Jump' }];
  const hoy = expandClasses(cl, '2026-11-10'); // martes
  assert.deepEqual(hoy.map((x) => x.title), ['Clase · Jump · 16:30', 'Clase · La 10 · 18:00', 'Clase · La 10 · 19:00', 'Clase · La 10 · 20:00']);
  assert.equal(expandClasses(cl, '2026-11-14').length, 0); // sábado
});
t('Carriles cuando se pisan', () => {
  const r = layoutLanes([{ start: 60, end: 120 }, { start: 90, end: 150 }, { start: 200, end: 230 }]);
  assert.equal(r[0].lanes, 2); assert.equal(r[1].lane, 1); assert.equal(r[2].lanes, 1);
});
t('Bloques que se repiten y excepciones', () => {
  const b = [{ id: 1, date: '2026-11-10' }, { id: 2, weekly: true, wd: 2, since: '2026-11-01' }, { id: 3, weekly: true, wd: 2, except: ['2026-11-10'] }];
  assert.deepEqual(blocksFor(b, '2026-11-10').map((x) => x.id), [1, 2]);
  assert.deepEqual(blocksFor(b, '2026-11-17').map((x) => x.id), [2, 3]);
});

console.log(`\n${ok} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
