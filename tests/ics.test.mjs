// Pruebas del lector de calendario (worker) y de cómo se ven los eventos por día. Uso: node tests/ics.test.mjs
import assert from 'node:assert/strict';
import worker from '../cloudflare/calendario-worker.js';
import { calDia, urlEventos } from '../js/calendario.js';

const { parseICS, expandir, atender, reset } = worker._prueba;
let ok = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); ok++; console.log('  ok  ', name); }
  catch (e) { fail++; console.log('  FALLA', name, '\n       ', e.message); }
}

const ICS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Apple Inc.//iCloud//EN', 'X-WR-CALNAME:Rutina',
  'BEGIN:VTIMEZONE', 'TZID:America/Argentina/Cordoba', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:-0300', 'TZOFFSETTO:-0300', 'END:STANDARD', 'END:VTIMEZONE',
  // Todo el día
  'BEGIN:VEVENT', 'UID:cumple', 'DTSTART;VALUE=DATE:20261112', 'DTEND;VALUE=DATE:20261113', 'SUMMARY:Cumple de Esteban', 'END:VEVENT',
  // Con hora y TZID (+ alarma que hay que ignorar, y línea doblada)
  'BEGIN:VEVENT', 'UID:gym1', 'DTSTART;TZID=America/Argentina/Cordoba:20261111T090000', 'DTEND;TZID=America/Argentina/Cordoba:20261111T100000',
  'SUMMARY:Gym con\\, Nico', 'BEGIN:VALARM', 'TRIGGER:-PT10M', 'SUMMARY:alarma', 'END:VALARM', 'END:VEVENT',
  // En UTC (Z)
  'BEGIN:VEVENT', 'UID:utc1', 'DTSTART:20261111T183000Z', 'DTEND:20261111T193000Z', 'SUMMARY:Reunión con ', ' Ari', 'END:VEVENT',
  // Semanal martes y jueves con EXDATE, COUNT 6
  'BEGIN:VEVENT', 'UID:ingles', 'DTSTART;TZID=America/Argentina/Cordoba:20261103T110000', 'DTEND;TZID=America/Argentina/Cordoba:20261103T113000',
  'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=6', 'EXDATE;TZID=America/Argentina/Cordoba:20261112T110000', 'SUMMARY:Inglés', 'END:VEVENT',
  // Varios días (con hora): viernes 20:00 a domingo 12:00
  'BEGIN:VEVENT', 'UID:viaje', 'DTSTART;TZID=America/Argentina/Cordoba:20261113T200000', 'DTEND;TZID=America/Argentina/Cordoba:20261115T120000', 'SUMMARY:Torneo en Carlos Paz', 'END:VEVENT',
  // Varios días (todo el día)
  'BEGIN:VEVENT', 'UID:vacas', 'DTSTART;VALUE=DATE:20261120', 'DTEND;VALUE=DATE:20261123', 'SUMMARY:Vacaciones', 'END:VEVENT',
  // Diario hasta UNTIL
  'BEGIN:VEVENT', 'UID:med', 'DTSTART;TZID=America/Argentina/Cordoba:20261109T073000', 'DURATION:PT15M', 'RRULE:FREQ=DAILY;UNTIL=20261111T235959Z', 'SUMMARY:Meditar', 'END:VEVENT',
  // Cancelado
  'BEGIN:VEVENT', 'UID:nada', 'DTSTART:20261111T150000Z', 'DTEND:20261111T160000Z', 'STATUS:CANCELLED', 'SUMMARY:No va', 'END:VEVENT',
  // Semanal con una instancia movida (RECURRENCE-ID)
  'BEGIN:VEVENT', 'UID:psico', 'DTSTART;TZID=America/Argentina/Cordoba:20261104T150000', 'DTEND;TZID=America/Argentina/Cordoba:20261104T160000', 'RRULE:FREQ=WEEKLY', 'SUMMARY:Psicólogo', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:psico', 'RECURRENCE-ID;TZID=America/Argentina/Cordoba:20261111T150000', 'DTSTART;TZID=America/Argentina/Cordoba:20261111T170000', 'DTEND;TZID=America/Argentina/Cordoba:20261111T180000', 'SUMMARY:Psicólogo (movido)', 'END:VEVENT',
  // Cumpleaños anual
  'BEGIN:VEVENT', 'UID:anual', 'DTSTART;VALUE=DATE:20200310', 'DTEND;VALUE=DATE:20200311', 'RRULE:FREQ=YEARLY', 'SUMMARY:Cumple mamá', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const evs = parseICS(ICS);
const rango = (d, h) => expandir(evs, d, h);
const titulos = (xs) => xs.map((x) => x.title);

console.log('Lectura del ICS');
await t('Lee todos los VEVENT e ignora la alarma', () => {
  assert.equal(evs.length, 11);
  assert.equal(evs.find((e) => e.uid === 'gym1').title, 'Gym con, Nico');
});
await t('Línea doblada se une (se saca solo el primer espacio)', () => {
  assert.equal(evs.find((e) => e.uid === 'utc1').title, 'Reunión con Ari');
});

console.log('Expansión');
await t('Todo el día: un solo día, fin exclusivo', () => {
  const r = rango('2026-11-12', '2026-11-12').filter((x) => x.allDay);
  assert.deepEqual(r.map((x) => [x.title, x.start, x.end]), [['Cumple de Esteban', '2026-11-12', '2026-11-13']]);
  assert.equal(rango('2026-11-13', '2026-11-13').some((x) => x.title === 'Cumple de Esteban'), false);
});
await t('Con hora y TZID Córdoba → UTC +3', () => {
  const g = rango('2026-11-11', '2026-11-11').find((x) => x.title.startsWith('Gym'));
  assert.equal(g.start, '2026-11-11T12:00:00.000Z');
  assert.equal(g.end, '2026-11-11T13:00:00.000Z');
  assert.equal(g.allDay, false);
});
await t('En UTC (Z) queda igual', () => {
  const r = rango('2026-11-11', '2026-11-11').find((x) => x.id.startsWith('utc1'));
  assert.equal(r.start, '2026-11-11T18:30:00.000Z');
});
await t('Semanal BYDAY=TU,TH con COUNT y EXDATE', () => {
  const r = rango('2026-11-01', '2026-11-30').filter((x) => x.title === 'Inglés').map((x) => x.start.slice(0, 10));
  // 6 ocurrencias: 3, 5, 10, 12 (excluida), 17, 19 → quedan 5
  assert.deepEqual(r, ['2026-11-03', '2026-11-05', '2026-11-10', '2026-11-17', '2026-11-19']);
});
await t('Diario con DURATION y UNTIL', () => {
  const r = rango('2026-11-01', '2026-11-30').filter((x) => x.title === 'Meditar');
  assert.deepEqual(r.map((x) => x.start), ['2026-11-09T10:30:00.000Z', '2026-11-10T10:30:00.000Z', '2026-11-11T10:30:00.000Z']);
  assert.equal(r[0].end, '2026-11-09T10:45:00.000Z');
});
await t('Cancelados no aparecen', () => {
  assert.equal(rango('2026-11-11', '2026-11-11').some((x) => x.title === 'No va'), false);
});
await t('Instancia movida reemplaza a la original', () => {
  const r = rango('2026-11-01', '2026-11-20').filter((x) => x.title.startsWith('Psicólogo'));
  assert.deepEqual(r.map((x) => [x.title, x.start]), [
    ['Psicólogo', '2026-11-04T18:00:00.000Z'],
    ['Psicólogo (movido)', '2026-11-11T20:00:00.000Z'],
    ['Psicólogo', '2026-11-18T18:00:00.000Z'],
  ]);
});
await t('Varios días con hora: aparece en los tres días', () => {
  for (const d of ['2026-11-13', '2026-11-14', '2026-11-15']) assert.ok(rango(d, d).some((x) => x.title === 'Torneo en Carlos Paz'), d);
  assert.equal(rango('2026-11-16', '2026-11-16').some((x) => x.title === 'Torneo en Carlos Paz'), false);
});
await t('Varios días todo el día: tocado por un rango del medio', () => {
  const r = rango('2026-11-21', '2026-11-21').filter((x) => x.title === 'Vacaciones');
  assert.equal(r.length, 1);
  assert.equal(r[0].start, '2026-11-20'); assert.equal(r[0].end, '2026-11-23');
});
await t('Anual: el cumple aparece en 2027', () => {
  const r = rango('2027-03-01', '2027-03-31').filter((x) => x.title === 'Cumple mamá');
  assert.deepEqual(r.map((x) => x.start), ['2027-03-10']);
});
await t('Otra zona (Madrid) se convierte bien, con horario de verano', () => {
  const x = parseICS('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:m\nDTSTART;TZID=Europe/Madrid:20260715T100000\nDTEND;TZID=Europe/Madrid:20260715T110000\nSUMMARY:Madrid\nEND:VEVENT\nEND:VCALENDAR');
  assert.equal(expandir(x, '2026-07-15', '2026-07-15')[0].start, '2026-07-15T08:00:00.000Z');
});

console.log('Cómo se ve por día (app)');
const json = rango('2026-11-09', '2026-11-22');
await t('Día con evento con hora y uno de todo el día', () => {
  const d = calDia(json, '2026-11-12');
  assert.deepEqual(d.allDay.map((x) => x.title), ['Cumple de Esteban']);
  assert.equal(d.timed.some((x) => x.title === 'Inglés'), false); // ese jueves está excluido
});
await t('Minutos del día en Córdoba', () => {
  const d = calDia(json, '2026-11-11');
  const g = d.timed.find((x) => x.title.startsWith('Gym'));
  assert.equal(g.start, 9 * 60); assert.equal(g.end, 10 * 60);
  const r = d.timed.find((x) => x.title === 'Reunión con Ari');
  assert.equal(r.start, 15 * 60 + 30);
});
await t('Evento de varios días se corta por día', () => {
  assert.deepEqual(calDia(json, '2026-11-13').timed.filter((x) => x.title.startsWith('Torneo')).map((x) => [x.start, x.end]), [[20 * 60, 24 * 60]]);
  assert.deepEqual(calDia(json, '2026-11-14').timed.filter((x) => x.title.startsWith('Torneo')).map((x) => [x.start, x.end]), [[0, 24 * 60]]);
  assert.deepEqual(calDia(json, '2026-11-15').timed.filter((x) => x.title.startsWith('Torneo')).map((x) => [x.start, x.end]), [[0, 12 * 60]]);
});
await t('URL del worker', () => {
  assert.equal(urlEventos('rutina-cal.gabo.workers.dev/', 'abc', '2026-11-01', '2026-11-30'), 'https://rutina-cal.gabo.workers.dev/eventos?desde=2026-11-01&hasta=2026-11-30&t=abc');
  assert.equal(urlEventos('', 'x', 'a', 'b'), null);
});

console.log('Worker (servidor)');
const realFetch = globalThis.fetch;
let pedidos = 0;
globalThis.fetch = async (u) => { pedidos++; assert.match(String(u), /^https:\/\/p\d+-caldav/); return new Response(ICS, { status: 200 }); };
const env = { ICS_URL: 'webcal://p42-caldav.icloud.com/published/2/abc', TOKEN: 'secreto', ORIGEN: 'https://masterpadel360.github.io' };
const req = (path, origin) => new Request('https://w.example' + path, { headers: origin ? { Origin: origin } : {} });
const AHORA = Date.parse('2026-11-10T15:00:00Z');
await t('Sin clave → 401', async () => {
  reset();
  const r = await atender(req('/eventos'), env, AHORA);
  assert.equal(r.status, 401);
});
await t('Origen no permitido → 403', async () => {
  const r = await atender(req('/eventos?t=secreto', 'https://otro.com'), env, AHORA);
  assert.equal(r.status, 403);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
});
await t('Origen permitido + clave → JSON con CORS y rango', async () => {
  const r = await atender(req('/eventos?t=secreto&desde=2026-11-11&hasta=2026-11-11', 'https://masterpadel360.github.io'), env, AHORA);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://masterpadel360.github.io');
  const j = await r.json();
  assert.ok(j.eventos.some((x) => x.title.startsWith('Gym')));
  assert.ok(j.eventos.every((x) => 'title' in x && 'start' in x && 'end' in x && 'allDay' in x));
});
await t('Cache de 5 minutos: no vuelve a pedir el ICS', async () => {
  reset(); pedidos = 0;
  await atender(req('/eventos?t=secreto'), env, AHORA);
  await atender(req('/eventos?t=secreto'), env, AHORA + 60000);
  assert.equal(pedidos, 1);
  await atender(req('/eventos?t=secreto'), env, AHORA + 6 * 60000);
  assert.equal(pedidos, 2);
});
await t('Si iCloud falla, usa la última copia (viejo: true)', async () => {
  globalThis.fetch = async () => new Response('x', { status: 503 });
  const r = await atender(req('/eventos?t=secreto'), env, AHORA + 20 * 60000);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).viejo, true);
  reset();
  const r2 = await atender(req('/eventos?t=secreto'), env, AHORA + 30 * 60000);
  assert.equal(r2.status, 502);
});
await t('Preflight OPTIONS', async () => {
  const r = await atender(new Request('https://w.example/eventos', { method: 'OPTIONS', headers: { Origin: 'https://masterpadel360.github.io' } }), env, AHORA);
  assert.equal(r.status, 204);
});
globalThis.fetch = realFetch;

console.log(`\n${ok} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
