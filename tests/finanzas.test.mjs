// Pruebas de gastos: montos en pesos, totales del mes, categorías, presupuesto y CSV. Uso: node tests/finanzas.test.mjs
import assert from 'node:assert/strict';
import { formatARS, parseMonto, resumenMes, presupuesto, parseCSV, parseFecha, importarGastos, gastosCSV, catPorNombre, mesSiguiente, categorias } from '../js/finanzas.js';

let ok = 0, fail = 0;
function t(name, fn) {
  try { fn(); ok++; console.log('  ok  ', name); }
  catch (e) { fail++; console.log('  FALLA', name, '\n       ', e.message); }
}

t('Formato pesos: $ 12.500, decimales con coma, negativos', () => {
  assert.equal(formatARS(12500), '$ 12.500');
  assert.equal(formatARS(1234567.5), '$ 1.234.567,50');
  assert.equal(formatARS(0), '$ 0');
  assert.equal(formatARS(-300), '−$ 300');
  assert.equal(formatARS(800, { signo: true }), '+$ 800');
});
t('Leer montos como los escribimos', () => {
  assert.equal(parseMonto('12.500'), 12500);
  assert.equal(parseMonto('$ 1.234,50'), 1234.5);
  assert.equal(parseMonto('12500'), 12500);
  assert.equal(parseMonto('1234.5'), 1234.5);
  assert.equal(parseMonto('-300'), -300);
  assert.equal(parseMonto('(450)'), -450);
  assert.ok(Number.isNaN(parseMonto('hola')));
});
const movs = [
  { kind: 'gasto', amount: 1000, cat: 'comida', date: '2026-11-01' },
  { kind: 'gasto', amount: 3000, cat: 'comida', date: '2026-11-03' },
  { kind: 'gasto', amount: 2000, cat: 'transporte', date: '2026-11-03' },
  { kind: 'ingreso', amount: 10000, cat: 'trabajo', date: '2026-11-05' },
  { kind: 'gasto', amount: 9999, cat: 'casa', date: '2026-10-31' },
];
t('Total del mes: gastos, ingresos y balance (solo ese mes)', () => {
  const r = resumenMes(movs, '2026-11');
  assert.equal(r.gastos, 6000);
  assert.equal(r.ingresos, 10000);
  assert.equal(r.balance, 4000);
  assert.equal(r.cantidad, 4);
  assert.equal(resumenMes(movs, '2026-10').gastos, 9999);
});
t('Por categoría: de mayor a menor, con porcentaje; los ingresos no cuentan', () => {
  const r = resumenMes(movs, '2026-11');
  assert.deepEqual(r.porCat.map((x) => x.cat), ['comida', 'transporte']);
  assert.equal(r.porCat[0].total, 4000);
  assert.ok(Math.abs(r.porCat[0].pct - 2 / 3) < 1e-9);
});
t('Por día: más reciente primero, con total del día', () => {
  const r = resumenMes(movs, '2026-11');
  assert.deepEqual(r.porDia.map((d) => d.date), ['2026-11-05', '2026-11-03', '2026-11-01']);
  assert.equal(r.porDia[1].gastos, 5000);
  assert.equal(r.porDia[0].ingresos, 10000);
});
t('Presupuesto: porcentaje, lo que queda y si se pasó', () => {
  assert.deepEqual(presupuesto(4000, 5000), { usado: 4000, tope: 5000, pct: 0.8, resto: 1000, pasado: false });
  assert.equal(presupuesto(6000, 5000).pasado, true);
  assert.equal(presupuesto(100, 0), null);
});
t('Mes siguiente y anterior cruzando el año', () => {
  assert.equal(mesSiguiente('2026-12'), '2027-01');
  assert.equal(mesSiguiente('2026-01', -1), '2025-12');
});
t('CSV: comillas, punto y coma y saltos de línea', () => {
  assert.deepEqual(parseCSV('a;b;c\n1;"dos; y algo";3\r\n'), [['a', 'b', 'c'], ['1', 'dos; y algo', '3']]);
  assert.deepEqual(parseCSV('x,y\n"con ""comillas""",2'), [['x', 'y'], ['con "comillas"', '2']]);
});
t('Fechas en varios formatos', () => {
  assert.equal(parseFecha('10/11/2026'), '2026-11-10');
  assert.equal(parseFecha('2026-11-10'), '2026-11-10');
  assert.equal(parseFecha('3-2-26'), '2026-02-03');
  assert.equal(parseFecha('31/02/2026'), null);
});
t('Categorías por nombre y sinónimos', () => {
  assert.equal(catPorNombre('Supermercado'), 'comida');
  assert.equal(catPorNombre('NAFTA'), 'transporte');
  assert.equal(catPorNombre('Salud'), 'salud');
  assert.equal(catPorNombre('Mascotas', [{ id: 'c-masc', name: 'Mascotas', emoji: '🐶' }]), 'c-masc');
  assert.equal(catPorNombre('xyz'), null);
  assert.equal(categorias().length, 8);
});
t('Importar gastos de otra app (Mi Agenda): columnas flexibles', () => {
  const csv = 'Fecha;Descripción;Monto;Categoría\n10/11/2026;Súper Disco;$ 12.500,00;Supermercado\n09/11/2026;Uber;3200;\n08/11/2026;Algo;abc;Otros\n';
  const r = importarGastos(csv, { today: '2026-11-10' });
  assert.equal(r.items.length, 2);
  assert.deepEqual(r.items[0], { kind: 'gasto', amount: 12500, cat: 'comida', note: 'Súper Disco', date: '2026-11-10' });
  assert.equal(r.items[1].cat, 'transporte');
  assert.equal(r.errores.length, 1);
});
t('Importar: con negativos, los positivos son ingresos', () => {
  const r = importarGastos('date,description,amount\n2026-11-01,Clases,50000\n2026-11-02,Café,-2500\n', { today: '2026-11-10' });
  assert.deepEqual(r.items.map((x) => [x.kind, x.amount]), [['ingreso', 50000], ['gasto', 2500]]);
});
t('Importar: sin columna de monto avisa', () => {
  const r = importarGastos('fecha,nota\n2026-11-01,algo\n', { today: '2026-11-10' });
  assert.equal(r.items.length, 0);
  assert.match(r.errores[0], /monto/);
});
t('Exportar CSV y volver a importar da lo mismo', () => {
  const csv = gastosCSV(movs.slice(0, 4));
  const r = importarGastos(csv, { today: '2026-11-10' });
  assert.deepEqual(r.items.map((x) => [x.kind, x.amount, x.cat, x.date]), movs.slice(0, 4).map((x) => [x.kind, x.amount, x.cat, x.date]));
});

console.log(`\n${ok} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
