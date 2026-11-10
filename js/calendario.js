// Eventos del Calendario del iPhone (vienen del worker como JSON). Lógica pura: qué se ve cada día.
import { dateKey, nowMinutes, addDays, keyToUTC } from './logic.js';

export const CAL_COLOR = '#E5484D';

// Dirección del worker → URL de /eventos con rango y clave.
export function urlEventos(base, token, desde, hasta) {
  let b = String(base || '').trim().replace(/\/+$/, '');
  if (!b) return null;
  if (!/^https?:\/\//i.test(b)) b = 'https://' + b;
  if (!/\/eventos$/.test(b)) b += '/eventos';
  const q = new URLSearchParams({ desde, hasta });
  if (token) q.set('t', String(token).trim());
  return `${b}?${q}`;
}

// Eventos de un día: { timed: [{start,end (minutos del día), ...}], allDay: [...] }.
export function calDia(eventos, k) {
  const timed = [], allDay = [];
  for (const e of eventos || []) {
    if (e.allDay) {
      const end = e.end && e.end > e.start ? e.end : addDays(e.start, 1);
      if (e.start <= k && k < end) allDay.push({ id: e.id, title: e.title, start: e.start, end });
      continue;
    }
    const s = new Date(e.start), f = new Date(e.end || e.start);
    if (isNaN(s) || isNaN(f)) continue;
    const sk = dateKey(s), fk = dateKey(f), fm = nowMinutes(f);
    if (sk > k || fk < k) continue;
    if (fk === k && fm === 0 && sk < k) continue; // termina justo a la medianoche
    const a = sk < k ? 0 : nowMinutes(s);
    let b = fk > k ? 24 * 60 : fm;
    if (b <= a) b = Math.min(24 * 60, a + 15);
    timed.push({ id: e.id, title: e.title, start: a, end: b, desde: sk < k, hasta: fk > k, iso: e.start, isoEnd: e.end });
  }
  return { timed: timed.sort((x, y) => x.start - y.start), allDay };
}

// Rango que se le pide al worker: una semana para atrás y dos meses para adelante.
export function rangoCal(today) {
  return { desde: addDays(today, -7), hasta: addDays(today, 60) };
}

// Hace cuánto (texto corto).
export function haceCuanto(ms, now = Date.now()) {
  const min = Math.round((now - ms) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

// Eventos de ejemplo para la demo (sin internet). Horas de Córdoba (UTC-3).
export function calDemo(today) {
  const iso = (k, hhmm) => new Date(keyToUTC(k) + (Number(hhmm.slice(0, 2)) + 3) * 3600000 + Number(hhmm.slice(3)) * 60000).toISOString();
  const ev = (id, k, a, b, title) => ({ id, title, start: iso(k, a), end: iso(k, b), allDay: false });
  return [
    ev('d1', today, '08:30', '09:15', 'Gym con Nico'),
    ev('d2', today, '15:00', '15:45', 'Reunión con Ari'),
    ev('d3', addDays(today, 1), '09:00', '10:00', 'Gym'),
    ev('d4', addDays(today, 1), '12:30', '13:30', 'Dentista'),
    ev('d5', addDays(today, 2), '20:00', '22:00', 'Cena con amigos'),
    { id: 'd6', title: 'Cumple de Esteban', start: today, end: addDays(today, 1), allDay: true },
  ];
}
