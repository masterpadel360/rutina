// Pruebas de tareas: agregar con texto, vencidas, agrupar, pasar a mañana e importar CSV. Uso: node tests/tareas.test.mjs
import assert from 'node:assert/strict';
import { estadoTarea, agruparTareas, tareasDeHoy, posponer, tareaDesdeTexto, importarTareas, listas } from '../js/tareas.js';

let ok = 0, fail = 0;
function t(name, fn) {
  try { fn(); ok++; console.log('  ok  ', name); }
  catch (e) { fail++; console.log('  FALLA', name, '\n       ', e.message); }
}
const HOY = '2026-11-10'; // martes
const tk = (id, date, extra = {}) => ({ id, title: id, date, time: null, prio: 'normal', list: null, done: false, ...extra });

t('Estado: vencida, hoy, mañana, próxima, sin fecha, hecha', () => {
  assert.equal(estadoTarea(tk('a', '2026-11-08'), HOY), 'vencida');
  assert.equal(estadoTarea(tk('a', HOY), HOY), 'hoy');
  assert.equal(estadoTarea(tk('a', '2026-11-11'), HOY), 'manana');
  assert.equal(estadoTarea(tk('a', '2026-11-20'), HOY), 'proxima');
  assert.equal(estadoTarea(tk('a', null), HOY), 'sinfecha');
  assert.equal(estadoTarea(tk('a', '2026-11-08', { done: true }), HOY), 'hecha');
});
t('Una vencida hecha ya no figura como vencida', () => {
  const g = agruparTareas([tk('a', '2026-11-01', { done: true, doneAt: '2026-11-02' })], HOY);
  assert.equal(g.vencida.length, 0);
  assert.equal(g.hecha.length, 1);
});
t('Hoy: importantes arriba, después por hora; luego lo pendiente de días anteriores', () => {
  const tasks = [tk('v', '2026-11-09'), tk('b', HOY, { time: '09:00' }), tk('c', HOY, { prio: 'alta' }), tk('a', HOY, { time: '08:00' }), tk('m', '2026-11-11')];
  assert.deepEqual(tareasDeHoy(tasks, HOY).map((x) => x.id), ['c', 'a', 'b', 'v']);
});
t('Agrupar filtra por lista', () => {
  const g = agruparTareas([tk('a', HOY, { list: 'Liga' }), tk('b', HOY, { list: 'Trabajo' })], HOY, 'Liga');
  assert.deepEqual(g.hoy.map((x) => x.id), ['a']);
});
t('Pasar a mañana mantiene la hora', () => {
  const p = posponer(tk('a', '2026-11-08', { time: '10:00' }), HOY);
  assert.equal(p.date, '2026-11-11');
  assert.equal(p.time, '10:00');
});
t('Texto: "llamar a Ari mañana 10" → mañana a las 10', () => {
  const r = tareaDesdeTexto('llamar a Ari mañana 10', HOY, 15 * 60);
  assert.deepEqual(r, { title: 'Llamar a Ari', date: '2026-11-11', time: '10:00', prio: 'normal', list: null });
});
t('Texto sin día ni hora → sin fecha', () => {
  const r = tareaDesdeTexto('comprar grips', HOY, 15 * 60);
  assert.equal(r.date, null);
  assert.equal(r.time, null);
  assert.equal(r.title, 'Comprar grips');
});
t('Texto con #lista e importante', () => {
  const r = tareaDesdeTexto('mandar fixture el viernes #liga importante', HOY, 15 * 60);
  assert.equal(r.list, 'Liga');
  assert.equal(r.prio, 'alta');
  assert.equal(r.date, '2026-11-13');
  assert.equal(r.title, 'Mandar fixture');
});
t('Listas: las fijas + las propias sin repetir', () => {
  assert.deepEqual(listas(['Facu', 'liga']), ['Trabajo', 'Liga', 'Clases', 'Personal', 'Facu']);
});
t('Importar tareas de otra app (Mi Agenda)', () => {
  const csv = 'Título;Fecha;Hora;Categoría;Prioridad;Estado\nLlamar al club;11/11/2026;10:30;trabajo;Alta;Pendiente\nPagar luz;05/11/2026;;Casa;;Completada\n;12/11/2026;;;;\n';
  const r = importarTareas(csv);
  assert.equal(r.items.length, 2);
  assert.deepEqual(r.items[0], { title: 'Llamar al club', date: '2026-11-11', time: '10:30', list: 'Trabajo', prio: 'alta', done: false });
  assert.equal(r.items[1].done, true);
  assert.equal(r.items[1].list, 'Casa');
  assert.equal(r.errores.length, 1);
});

console.log(`\n${ok} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
