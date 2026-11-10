// Rutina · Calendario: lee el calendario público de iCloud (ICS) y lo devuelve como JSON para la app.
// Sin dependencias: se puede pegar tal cual en el editor de Cloudflare Workers.
//
// Variables (Cloudflare → Worker → Settings → Variables and Secrets):
//   ICS_URL  (secreto)  link del calendario público (webcal://... o https://...)
//   TOKEN    (secreto, opcional) clave que la app manda en ?t=
//   ORIGEN   (texto)    origen permitido para el navegador, ej. https://masterpadel360.github.io (se pueden poner varios separados por coma)
//
// GET /eventos?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&t=TOKEN
//   → { actualizado, zona, eventos: [{ id, title, start, end, allDay }] }
//   Con hora: start/end en ISO UTC ("2026-11-11T12:00:00.000Z").
//   Todo el día: start/end como "AAAA-MM-DD" (end es exclusivo, como en ICS).

const ZONA = 'America/Argentina/Cordoba';
const CACHE_MS = 5 * 60 * 1000;
const MAX_DIAS = 400;

// ---------------------------------------------------------------- Fechas y zonas
const fmts = {};
function offsetMin(utcMs, tz) { // minutos a sumar a UTC para tener la hora local en tz
  let f = fmts[tz];
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    } catch { f = null; }
    fmts[tz] = f;
  }
  if (!f) return tz === 'UTC' ? 0 : offsetMin(utcMs, ZONA);
  const p = {};
  for (const x of f.formatToParts(new Date(utcMs))) p[x.type] = x.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUTC - Math.floor(utcMs / 1000) * 1000) / 60000);
}
// Hora local (tz) → instante UTC en ms.
function localToUTC(y, m, d, hh, mm, ss, tz) {
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  const o1 = offsetMin(guess - 0, tz);
  let r = guess - o1 * 60000;
  const o2 = offsetMin(r, tz);
  if (o2 !== o1) r = guess - o2 * 60000;
  return r;
}
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const keyToMs = (k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
const msToKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (k, n) => msToKey(keyToMs(k) + n * 86400000);
const wdOf = (k) => new Date(keyToMs(k)).getUTCDay();
const diasDelMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// ---------------------------------------------------------------- Lectura del ICS
function unfold(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}
function parseLine(line) {
  // NOMBRE;PARAM=valor;PARAM="valor:con:dos puntos":VALOR
  let i = 0, q = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === ':' && !q) break;
  }
  const head = line.slice(0, i), value = line.slice(i + 1);
  const parts = head.split(';');
  const params = {};
  for (const p of parts.slice(1)) {
    const j = p.indexOf('=');
    if (j > 0) params[p.slice(0, j).toUpperCase()] = p.slice(j + 1).replace(/^"|"$/g, '');
  }
  return { name: parts[0].toUpperCase(), params, value };
}
const unescapeText = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

// Valor de fecha ICS → { allDay, key, ms } (ms = instante UTC; para todo el día, la medianoche en tz).
function parseDate(value, params, defTz = ZONA) {
  const v = value.trim();
  const tzid = params && params.TZID ? params.TZID : null;
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m || (params && params.VALUE === 'DATE')) {
    m = m || /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    const key = keyOf(+m[1], +m[2], +m[3]);
    return { allDay: true, key, ms: localToUTC(+m[1], +m[2], +m[3], 0, 0, 0, tzid || defTz) };
  }
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const [y, mo, d, hh, mi, ss] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)];
  const tz = m[7] ? 'UTC' : (tzid || defTz); // sin zona ("hora flotante") = Córdoba
  return { allDay: false, ms: m[7] ? Date.UTC(y, mo - 1, d, hh, mi, ss) : localToUTC(y, mo, d, hh, mi, ss, tz), tz };
}
function parseDuration(v) { // P1D, PT1H30M, -PT15M, P1W
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v).trim());
  if (!m) return null;
  const s = ((+m[2] || 0) * 7 * 86400) + ((+m[3] || 0) * 86400) + ((+m[4] || 0) * 3600) + ((+m[5] || 0) * 60) + (+m[6] || 0);
  return (m[1] === '-' ? -s : s) * 1000;
}

function parseICS(text) {
  const out = [];
  let cur = null, depth = 0;
  for (const raw of unfold(text)) {
    if (!raw) continue;
    const l = parseLine(raw);
    if (l.name === 'BEGIN') {
      if (l.value.toUpperCase() === 'VEVENT') { cur = { exdates: [], rrule: null }; depth = 0; }
      else if (cur) depth++;
      continue;
    }
    if (l.name === 'END') {
      if (l.value.toUpperCase() === 'VEVENT' && cur) { out.push(cur); cur = null; }
      else if (cur) depth--;
      continue;
    }
    if (!cur || depth > 0) continue; // ignora VALARM y otros bloques internos
    switch (l.name) {
      case 'UID': cur.uid = l.value.trim(); break;
      case 'SUMMARY': cur.title = unescapeText(l.value).trim(); break;
      case 'LOCATION': cur.location = unescapeText(l.value).trim(); break;
      case 'STATUS': cur.status = l.value.trim().toUpperCase(); break;
      case 'DTSTART': cur.start = parseDate(l.value, l.params); cur.tzid = l.params.TZID || null; break;
      case 'DTEND': cur.end = parseDate(l.value, l.params); break;
      case 'DURATION': cur.duration = parseDuration(l.value); break;
      case 'RRULE': cur.rrule = parseRRule(l.value); break;
      case 'EXDATE':
        for (const v of l.value.split(',')) { const d = parseDate(v, l.params); if (d) cur.exdates.push(d); }
        break;
      case 'RECURRENCE-ID': cur.recurrenceId = parseDate(l.value, l.params); break;
      default: break;
    }
  }
  return out.filter((e) => e.start);
}

function parseRRule(v) {
  const r = {};
  for (const p of v.split(';')) {
    const [k, val] = p.split('=');
    if (k && val != null) r[k.toUpperCase()] = val.toUpperCase();
  }
  const until = r.UNTIL ? parseDate(r.UNTIL, {}) : null;
  return {
    freq: r.FREQ,
    interval: Math.max(1, +r.INTERVAL || 1),
    count: r.COUNT ? +r.COUNT : null,
    until: until ? (until.allDay ? until.ms + 86400000 - 1 : until.ms) : null,
    untilKey: until ? (until.allDay ? until.key : msToKey(until.ms + offsetMin(until.ms, ZONA) * 60000)) : null,
    byday: r.BYDAY ? r.BYDAY.split(',').map((x) => { const m = /^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(x); return m ? { n: m[1] ? +m[1] : 0, wd: ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].indexOf(m[2]) } : null; }).filter(Boolean) : null,
    bymonthday: r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null,
    bymonth: r.BYMONTH ? r.BYMONTH.split(',').map(Number) : null,
  };
}

// ---------------------------------------------------------------- Repeticiones
// Fechas candidatas (claves AAAA-MM-DD, en hora local del evento) en orden, desde el día de inicio.
function* fechasRRule(startKey, r) {
  const [y0, m0, d0] = [+startKey.slice(0, 4), +startKey.slice(5, 7), +startKey.slice(8, 10)];
  const wd0 = wdOf(startKey);
  if (r.freq === 'DAILY') {
    for (let k = startKey; ; k = addDays(k, r.interval)) {
      if (r.bymonth && !r.bymonth.includes(+k.slice(5, 7))) continue;
      if (r.byday && !r.byday.some((b) => b.wd === wdOf(k))) continue;
      yield k;
    }
  } else if (r.freq === 'WEEKLY') {
    const dias = (r.byday && r.byday.length ? r.byday.map((b) => b.wd) : [wd0]).map((w) => (w + 6) % 7).sort((a, b) => a - b); // 0 = lunes
    let lunes = addDays(startKey, -((wd0 + 6) % 7));
    for (;;) {
      for (const i of dias) { const k = addDays(lunes, i); if (k >= startKey) yield k; }
      lunes = addDays(lunes, 7 * r.interval);
    }
  } else if (r.freq === 'MONTHLY') {
    for (let i = 0; ; i += r.interval) {
      const y = y0 + Math.floor((m0 - 1 + i) / 12), m = ((m0 - 1 + i) % 12) + 1;
      const n = diasDelMes(y, m);
      let dias = [];
      if (r.byday && r.byday.length) {
        for (const b of r.byday) {
          const todos = [];
          for (let d = 1; d <= n; d++) if (wdOf(keyOf(y, m, d)) === b.wd) todos.push(d);
          if (!b.n) dias.push(...todos);
          else { const d = b.n > 0 ? todos[b.n - 1] : todos[todos.length + b.n]; if (d) dias.push(d); }
        }
      } else {
        dias = (r.bymonthday || [d0]).map((d) => (d < 0 ? n + d + 1 : d)).filter((d) => d >= 1 && d <= n);
      }
      for (const d of [...new Set(dias)].sort((a, b) => a - b)) { const k = keyOf(y, m, d); if (k >= startKey) yield k; }
    }
  } else if (r.freq === 'YEARLY') {
    const meses = r.bymonth || [m0];
    for (let y = y0; ; y += r.interval) {
      for (const m of meses) {
        const dd = r.bymonthday || [d0];
        for (const d of dd) if (d <= diasDelMes(y, m)) { const k = keyOf(y, m, d); if (k >= startKey) yield k; }
      }
    }
  } else {
    yield startKey;
  }
}

// Devuelve las ocurrencias de todos los eventos que tocan [desde, hasta] (fechas locales de Córdoba, inclusive).
function expandir(eventos, desde, hasta, tz = ZONA) {
  const ini = localToUTC(+desde.slice(0, 4), +desde.slice(5, 7), +desde.slice(8, 10), 0, 0, 0, tz);
  const finKey = addDays(hasta, 1);
  const fin = localToUTC(+finKey.slice(0, 4), +finKey.slice(5, 7), +finKey.slice(8, 10), 0, 0, 0, tz);
  const out = [];

  // Instancias modificadas (RECURRENCE-ID): reemplazan a la original.
  const cambiadas = new Map();
  for (const e of eventos) if (e.recurrenceId && e.uid) {
    const s = cambiadas.get(e.uid) || new Set();
    s.add(e.recurrenceId.allDay ? e.recurrenceId.key : e.recurrenceId.ms);
    cambiadas.set(e.uid, s);
  }

  for (const e of eventos) {
    if (e.status === 'CANCELLED') continue;
    const st = e.start;
    const title = e.title || '(Sin título)';
    if (st.allDay) {
      const durDias = e.end && e.end.allDay ? Math.max(1, Math.round((keyToMs(e.end.key) - keyToMs(st.key)) / 86400000))
        : e.duration ? Math.max(1, Math.round(e.duration / 86400000)) : 1;
      const ex = new Set(e.exdates.map((d) => d.key || msToKey(d.ms)));
      const skip = (!e.recurrenceId && e.uid && cambiadas.get(e.uid)) || new Set();
      const push = (k) => {
        const endK = addDays(k, durDias);
        if (k <= hasta && endK > desde) out.push({ id: `${e.uid || title}@${k}`, title, start: k, end: endK, allDay: true });
      };
      if (!e.rrule || e.recurrenceId) { push(st.key); continue; }
      let n = 0;
      for (const k of fechasRRule(st.key, e.rrule)) {
        if (++n > 20000) break;
        if (e.rrule.count && n > e.rrule.count) break;
        if (e.rrule.untilKey && k > e.rrule.untilKey) break;
        if (k > hasta) break;
        if (ex.has(k) || skip.has(k)) continue;
        push(k);
      }
      continue;
    }

    // Con hora
    const tzE = st.tz || ZONA;
    const durMs = e.end && !e.end.allDay ? Math.max(0, e.end.ms - st.ms) : e.duration != null ? Math.max(0, e.duration) : 0;
    const local = new Date(st.ms + offsetMin(st.ms, tzE) * 60000);
    const hh = local.getUTCHours(), mi = local.getUTCMinutes(), ss = local.getUTCSeconds();
    const startKey = local.toISOString().slice(0, 10);
    const ex = new Set(e.exdates.map((d) => (d.allDay ? 'd' + d.key : d.ms)));
    const skip = (!e.recurrenceId && e.uid && cambiadas.get(e.uid)) || new Set();
    const push = (ms) => {
      const end = ms + durMs;
      if (ms < fin && (end > ini || (durMs === 0 && ms >= ini))) {
        out.push({ id: `${e.uid || title}@${new Date(ms).toISOString()}`, title, start: new Date(ms).toISOString(), end: new Date(end).toISOString(), allDay: false });
      }
    };
    if (!e.rrule || e.recurrenceId) { push(st.ms); continue; }
    let n = 0;
    for (const k of fechasRRule(startKey, e.rrule)) {
      if (++n > 20000) break;
      if (e.rrule.count && n > e.rrule.count) break;
      const ms = localToUTC(+k.slice(0, 4), +k.slice(5, 7), +k.slice(8, 10), hh, mi, ss, tzE);
      if (e.rrule.until && ms > e.rrule.until) break;
      if (ms >= fin) break;
      if (ex.has(ms) || ex.has('d' + k) || skip.has(ms)) continue;
      push(ms);
    }
  }
  return out.sort((a, b) => (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1) || (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

// ---------------------------------------------------------------- Servidor
let memo = { at: 0, text: null }; // copia del ICS en memoria (dura mientras el worker siga vivo)

async function leerICS(env, now) {
  if (memo.text && now - memo.at < CACHE_MS) return { text: memo.text, at: memo.at };
  const url = String(env.ICS_URL || '').trim().replace(/^webcals?:\/\//i, 'https://');
  if (!/^https:\/\//i.test(url)) throw new Error('Falta configurar ICS_URL');
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Rutina-Calendario/1.0' }, cf: { cacheTtl: 300, cacheEverything: true } });
    if (!r.ok) throw new Error(`iCloud respondió ${r.status}`);
    const text = await r.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('El link no devuelve un calendario');
    memo = { at: now, text };
    return { text, at: now };
  } catch (err) {
    if (memo.text) return { text: memo.text, at: memo.at, viejo: true };
    throw err;
  }
}

function iguales(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

function hoyEn(tz, now) {
  const o = offsetMin(now, tz);
  return msToKey(now + o * 60000);
}

async function atender(request, env, now = Date.now()) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const permitidos = String(env.ORIGEN || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  const cors = { Vary: 'Origin' };
  if (origin && permitidos.includes(origin)) {
    cors['Access-Control-Allow-Origin'] = origin;
    cors['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    cors['Access-Control-Max-Age'] = '86400';
  }
  const json = (status, data, extra = {}) => new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra },
  });

  if (request.method === 'OPTIONS') return new Response(null, { status: origin && cors['Access-Control-Allow-Origin'] ? 204 : 403, headers: cors });
  if (request.method !== 'GET') return json(405, { error: 'Solo GET' });
  if (origin && !cors['Access-Control-Allow-Origin']) return json(403, { error: 'Origen no permitido' });
  if (url.pathname === '/' || url.pathname === '') return json(200, { ok: true, servicio: 'Rutina · Calendario' });
  if (url.pathname.replace(/\/+$/, '') !== '/eventos') return json(404, { error: 'No existe' });
  if (env.TOKEN && !iguales(url.searchParams.get('t') || '', env.TOKEN)) return json(401, { error: 'Clave incorrecta' });

  const hoy = hoyEn(ZONA, now);
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const desde = re.test(url.searchParams.get('desde') || '') ? url.searchParams.get('desde') : addDays(hoy, -7);
  let hasta = re.test(url.searchParams.get('hasta') || '') ? url.searchParams.get('hasta') : addDays(hoy, 60);
  if (hasta < desde) return json(400, { error: 'hasta es anterior a desde' });
  if ((keyToMs(hasta) - keyToMs(desde)) / 86400000 > MAX_DIAS) hasta = addDays(desde, MAX_DIAS);

  let ics;
  try { ics = await leerICS(env, now); }
  catch (err) { return json(502, { error: `No se pudo leer el calendario: ${err.message}` }); }
  const eventos = expandir(parseICS(ics.text), desde, hasta);
  return json(200, { actualizado: new Date(ics.at).toISOString(), viejo: !!ics.viejo, zona: ZONA, desde, hasta, eventos },
    { 'Cache-Control': 'private, max-age=60' });
}

export default {
  fetch: (request, env) => atender(request, env || {}),
  // Para las pruebas (node tests/ics.test.mjs). El worker no los usa.
  _prueba: { parseICS, expandir, localToUTC, atender, reset: () => { memo = { at: 0, text: null }; } },
};
