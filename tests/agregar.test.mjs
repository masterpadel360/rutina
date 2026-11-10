// Pruebas del texto libre → bloque (Siri / campo rápido). Uso: node tests/agregar.test.mjs
import assert from 'node:assert/strict';
import { parseAgregar } from '../js/agregar.js';

let ok = 0, fail = 0;
const HOY = '2026-11-10'; // martes
const OCHO = 8 * 60;
// [frase, título, fecha, desde, hasta, ahora (min), extra]
const casos = [
  ['gym mañana a las 9', 'Gym', '2026-11-11', '09:00', '10:00'],
  ['grabar reel hoy 15hs', 'Grabar reel', HOY, '15:00', '16:00'],
  ['reunión con Ari el jueves a las 18:30', 'Reunión con Ari', '2026-11-12', '18:30', '19:30'],
  ['pasado mañana 10 a 11 dentista', 'Dentista', '2026-11-12', '10:00', '11:00'],
  ['correr 7', 'Correr', HOY, '07:00', '08:00', 6 * 60],
  ['correr 7', 'Correr', '2026-11-11', '07:00', '08:00', 15 * 60], // ya pasó: mañana
  ['el 14 a las 20 cena', 'Cena', '2026-11-14', '20:00', '21:00'],
  ['el 5 a las 20 cena', 'Cena', '2026-12-05', '20:00', '21:00'], // el 5 ya pasó este mes
  ['Agendá llamar a Esteban mañana a la tarde', 'Llamar a Esteban', '2026-11-11', '16:00', '17:00'],
  ['clase de prueba el lunes a la mañana', 'Clase de prueba', '2026-11-16', '09:00', '10:00'],
  ['cena con Vale el sábado a la noche', 'Cena con Vale', '2026-11-14', '21:00', '22:00'],
  ['martes 9:30 inglés', 'Inglés', '2026-11-17', '09:30', '10:30'], // mismo día de la semana → el próximo
  ['psicólogo a las 3', 'Psicólogo', HOY, '15:00', '16:00'], // 1 a 6 se entiende de tarde
  ['turno médico a las 8 de la mañana', 'Turno médico', HOY, '08:00', '09:00', 7 * 60],
  ['partido de 19 a 20:30 en Jump', 'Partido en Jump', HOY, '19:00', '20:30'],
  ['de 11 a 1 almuerzo con el club', 'Almuerzo con el club', HOY, '11:00', '13:00'],
  ['pagar canchas mañana', 'Pagar canchas', '2026-11-11', null, null], // sin hora
  ['entrenar a las 7 de la tarde', 'Entrenar', HOY, '19:00', '20:00'],
  ['videollamada 21/11 a las 10', 'Videollamada', '2026-11-21', '10:00', '11:00'],
  ['torneo el 3 de diciembre a las 9', 'Torneo', '2026-12-03', '09:00', '10:00'],
  ['Mañana a la mañana gym', 'Gym', '2026-11-11', '09:00', '10:00'],
  ['almuerzo al mediodía', 'Almuerzo', HOY, '12:00', '13:00'],
  ['reunión a las 9 y media', 'Reunión', HOY, '09:30', '10:30'],
  ['grabar 2 reels hoy a las 17', 'Grabar 2 reels', HOY, '17:00', '18:00'],
  ['el jueves', 'Nuevo bloque', '2026-11-12', null, null],
  ['dentista 8pm', 'Dentista', HOY, '20:00', '21:00'],
];

for (const [frase, titulo, fecha, desde, hasta, ahora = OCHO] of casos) {
  try {
    const r = parseAgregar(frase, HOY, ahora);
    assert.equal(r.title, titulo, 'título');
    assert.equal(r.date, fecha, 'fecha');
    if (desde) { assert.equal(r.start, desde, 'desde'); assert.equal(r.end, hasta, 'hasta'); assert.equal(r.sinHora, false, 'sinHora'); }
    else { assert.equal(r.sinHora, true, 'sinHora'); assert.equal(r.start, '09:00'); assert.equal(r.end, '10:00'); }
    ok++; console.log('  ok  ', frase, '→', r.title, r.date, r.start + '–' + r.end);
  } catch (e) {
    fail++; console.log('  FALLA', frase, '\n       ', e.message);
  }
}

console.log(`\n${ok} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
