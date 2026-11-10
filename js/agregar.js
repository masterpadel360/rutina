// Texto libre en castellano → bloque de agenda. "gym mañana a las 9" → { title: 'Gym', date, start: '09:00', end: '10:00' }.
// Lógica pura (sin DOM): la usan el ?agregar= de Siri/Atajos y el campo rápido de la Agenda.
import { addDays, weekday, fromMin } from './logic.js';

const ACENTOS = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' };
const DIAS_N = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MESES_N = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const PARTE_HORA = { manana: 9 * 60, tarde: 16 * 60, noche: 21 * 60, mediodia: 12 * 60 };
const DUR = 60;

function dMes(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
const pad = (n) => String(n).padStart(2, '0');

// Próximo día del mes "d" (hoy incluido); si el mes no lo tiene, el siguiente que sí.
function proximoDiaDelMes(today, d) {
  let y = +today.slice(0, 4), m = +today.slice(5, 7);
  if (d < +today.slice(8, 10)) { m++; if (m > 12) { m = 1; y++; } }
  for (let i = 0; i < 13; i++) {
    if (d <= dMes(y, m)) return `${y}-${pad(m)}-${pad(d)}`;
    m++; if (m > 12) { m = 1; y++; }
  }
  return null;
}
function proximaFecha(today, d, m, y) {
  let yy = y || +today.slice(0, 4);
  if (yy < 100) yy += 2000;
  if (d < 1 || m < 1 || m > 12 || d > dMes(yy, m)) return null;
  let k = `${yy}-${pad(m)}-${pad(d)}`;
  if (!y && k < today) { yy++; if (d > dMes(yy, m)) return null; k = `${yy}-${pad(m)}-${pad(d)}`; }
  return k;
}

const H = '(\\d{1,2})(?:[:.](\\d{2}))?';
const SUF = '\\s*(?:hs|h|horas|hrs)?';

export function parseAgregar(texto, today, nowMin = 0) {
  const orig = String(texto || '').replace(/\s+/g, ' ').trim();
  // Versión para buscar: minúsculas sin tildes, mismo largo que el original (así se puede recortar el título).
  let n = [...orig].map((c) => { const l = c.toLowerCase(); return l.length === 1 ? (ACENTOS[l] || l) : c; }).join('');
  if (n.length !== orig.length) n = orig.toLowerCase(); // por las dudas (caracteres raros)
  const usado = new Array(orig.length).fill(false);
  const tomar = (re) => {
    re.lastIndex = 0;
    const m = re.exec(n);
    if (!m) return null;
    for (let i = m.index; i < m.index + m[0].length; i++) usado[i] = true;
    n = n.slice(0, m.index) + ' '.repeat(m[0].length) + n.slice(m.index + m[0].length);
    return m;
  };

  // Verbo del pedido ("agendá", "anotame", "recordame que...")
  tomar(/^\s*(?:agenda(?:me|r)?|anota(?:me|r)?|agrega(?:me|r)?|pone(?:me|r)?|recorda(?:me|r)?)(?:\s+que)?\b(?=\s+\S)/);

  // ---------- Día ----------
  let date = null, part = null;
  let m;
  if (tomar(/\bpasado\s+manana\b/)) date = addDays(today, 2);
  if ((m = tomar(/\b(?:a|de|por|en)\s+la\s+(manana|tarde|noche)\b/))) part = m[1];
  else if (tomar(/\b(?:al|a|de|del)\s+mediodia\b/)) part = 'mediodia';
  if (!date && tomar(/\bmanana\b/)) date = addDays(today, 1);
  if (!date && tomar(/\bhoy\b/)) date = today;
  if (!date && (m = tomar(new RegExp(`\\b(?:el\\s+|este\\s+|el\\s+proximo\\s+|proximo\\s+)?(${DIAS_N.join('|')})(?:\\s+que\\s+viene|\\s+proximo)?\\b`)))) {
    const wd = DIAS_N.indexOf(m[1]);
    const d = (wd - weekday(today) + 7) % 7 || 7;
    date = addDays(today, d);
  }
  if (!date && (m = tomar(/\b(?:el\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) date = proximaFecha(today, +m[1], +m[2], m[3] ? +m[3] : null);
  if (!date && (m = tomar(new RegExp(`\\b(?:el\\s+)?(\\d{1,2})\\s+de\\s+(${MESES_N.join('|')})\\b`)))) date = proximaFecha(today, +m[1], MESES_N.indexOf(m[2]) + 1, null);
  if (!date && (m = tomar(/\bel\s+(\d{1,2})\b(?!\s*(?:[:.]\d|hs\b|h\b|horas\b|a\s+\d))/))) date = proximoDiaDelMes(today, +m[1]);
  const conFecha = !!date;

  // ---------- Hora ----------
  let ini = null, fin = null, explicita = false; // explicita: con ":mm", "hs" o am/pm (no se corre a la tarde)
  const aMin = (h, mm) => +h * 60 + (+mm || 0);
  if ((m = tomar(new RegExp(`\\b(?:de\\s+|desde\\s+)?(?:las?\\s+)?${H}${SUF}\\s*(?:a|-|hasta)\\s*(?:las?\\s+)?${H}${SUF}(?=\\s|$|[,.])`)))
    || (m = tomar(new RegExp(`\\bentre\\s+(?:las?\\s+)?${H}${SUF}\\s+y\\s+(?:las?\\s+)?${H}${SUF}(?=\\s|$|[,.])`)))) {
    ini = aMin(m[1], m[2]); fin = aMin(m[3], m[4]);
    explicita = !!(m[2] || m[4]) || /h/.test(m[0]) || ini >= 13 * 60 || fin >= 13 * 60;
  } else if ((m = tomar(new RegExp(`\\ba\\s+las?\\s+${H}(?:\\s+y\\s+(media|cuarto))?${SUF}(?:\\s*(am|pm))?(?=\\s|$|[,.])`)))) {
    ini = aMin(m[1], m[2]) + (m[3] === 'media' ? 30 : m[3] === 'cuarto' ? 15 : 0);
    explicita = !!m[2] || /h/.test(m[0]);
    if (m[4] === 'pm' && ini < 12 * 60) ini += 12 * 60;
    if (m[4]) explicita = true;
  } else if ((m = tomar(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/))) {
    ini = aMin(m[1], m[2]); explicita = true;
    if (m[3] === 'pm' && ini < 12 * 60) ini += 12 * 60;
    if (m[3] === 'am' && ini >= 12 * 60) ini -= 12 * 60;
  } else if ((m = tomar(/\b(\d{1,2})\s*(?:hs|h|horas|hrs)\b/)) || (m = tomar(/\b(\d{1,2})[:.](\d{2})\b/))) {
    ini = aMin(m[1], m[2]); explicita = true;
  } else if ((m = tomar(/(?:^|\s)(\d{1,2})\s*$/))) { // número suelto al final: "correr 7"
    ini = aMin(m[1]);
  }

  // "de la tarde/noche" corre a la tarde; sin nada, 1 a 6 se entiende de tarde ("a las 3" = 15:00)
  const ajustar = (x) => {
    if (x == null) return x;
    if (part === 'tarde' || part === 'noche') { if (x < 12 * 60) x += 12 * 60; }
    else if (part !== 'manana' && !explicita && x >= 60 && x < 7 * 60) x += 12 * 60;
    return x;
  };
  let sinHora = false;
  if (ini != null && ini <= 24 * 60) {
    ini = ajustar(ini);
    if (fin != null) {
      fin = ajustar(fin);
      if (fin <= ini && fin + 12 * 60 > ini && fin < 12 * 60) fin += 12 * 60; // "de 11 a 1" → 11 a 13
      if (fin <= ini) fin = ini + DUR;
    }
  } else if (part) {
    ini = PARTE_HORA[part];
  } else {
    ini = null;
  }
  if (ini == null || ini >= 24 * 60) { // sin hora: la próxima hora en punto
    sinHora = true;
    ini = Math.min(23 * 60, (Math.floor(nowMin / 60) + 1) * 60);
  }
  if (fin == null) fin = ini + DUR;
  fin = Math.min(fin, 23 * 60 + 59);

  // Sin día y la hora ya pasó: mañana.
  let date2 = date || today;
  if (!conFecha && !sinHora && ini < nowMin) date2 = addDays(today, 1);

  // ---------- Título ----------
  let title = [...orig].map((c, i) => (usado[i] ? ' ' : c)).join('');
  title = title.replace(/\s+/g, ' ').trim();
  const sobra = /^(?:el|la|los|las|a|al|de|del|para|que|en|y|,|-|–|\.)\s+|\s+(?:el|la|los|las|a|al|de|del|para|que|en|y|con|desde|hasta)$/i;
  for (let i = 0; i < 6; i++) { const t = title.replace(sobra, '').replace(/^[\s,.;:–-]+|[\s,.;:–-]+$/g, '').trim(); if (t === title) break; title = t; }
  if (/^(el|la|a|de|y|en)$/i.test(title)) title = '';
  title = title ? title.charAt(0).toUpperCase() + title.slice(1) : 'Nuevo bloque';

  return { title, date: date2, start: fromMin(ini), end: fromMin(fin), sinHora, conFecha, texto: orig };
}
