// Lógica pura (sin DOM): fechas en la zona de Córdoba, frecuencias, rachas con perdón y semana.
// Las fechas se manejan como claves 'AAAA-MM-DD' y se calculan en UTC para no depender del reloj del equipo.

export const TZ = 'America/Argentina/Cordoba';
export const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const fmtCache = {};
function partes(d, tz) {
  const f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }));
  const o = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return o;
}

// Clave del día en la zona elegida (por defecto Córdoba, UTC-3).
export function dateKey(d = new Date(), tz = TZ) {
  const p = partes(d, tz);
  return `${p.year}-${p.month}-${p.day}`;
}
// Minutos desde la medianoche en la zona elegida.
export function nowMinutes(d = new Date(), tz = TZ) {
  const p = partes(d, tz);
  return Number(p.hour) * 60 + Number(p.minute);
}

export function keyToUTC(k) {
  const [y, m, d] = k.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
export function utcToKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
export function addDays(k, n) {
  return utcToKey(keyToUTC(k) + n * 86400000);
}
export function diffDays(a, b) { // b - a en días
  return Math.round((keyToUTC(b) - keyToUTC(a)) / 86400000);
}
export function weekday(k) { // 0 = domingo
  return new Date(keyToUTC(k)).getUTCDay();
}
// La semana arranca el lunes.
export function weekStart(k) {
  return addDays(k, -((weekday(k) + 6) % 7));
}
export function weekKeys(k) {
  const s = weekStart(k);
  return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(s, i));
}
export function toMin(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}
export function fromMin(min) {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
export function fechaLarga(k) {
  const [, m, d] = k.split('-').map(Number);
  return `${DIAS_LARGO[weekday(k)]} ${d} de ${MESES[m - 1]}`;
}

// ---------- Frecuencia ----------
// freq: {type:'daily'} | {type:'days', days:[0..6], cada?:2, desde?:'AAAA-MM-DD'} | {type:'times', n}
export function isScheduled(h, k) {
  if (h.created && k < h.created) return false;
  const f = h.freq || { type: 'daily' };
  if (f.type === 'days') {
    if (!(f.days || []).includes(weekday(k))) return false;
    // Cada 2 (o más) semanas: toca solo en las semanas que caen en la cuenta desde una fecha conocida.
    if (f.cada > 1 && f.desde) {
      const w = Math.round(diffDays(weekStart(f.desde), weekStart(k)) / 7);
      return ((w % f.cada) + f.cada) % f.cada === 0;
    }
    return true;
  }
  return true; // daily y times: cualquier día sirve
}
export function statusOf(log, hid, k) {
  return (log[k] && log[k][hid]) || null;
}
export function freqLabel(f) {
  if (!f || f.type === 'daily') return 'Todos los días';
  if (f.type === 'times') return f.n === 1 ? '1 vez por semana' : `${f.n} veces por semana`;
  const d = [...(f.days || [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (!(f.cada > 1)) {
    if (d.length === 7) return 'Todos los días';
    if (d.length === 5 && !d.includes(0) && !d.includes(6)) return 'Lunes a viernes';
  }
  const base = d.map((x) => DIAS[x]).join(' · ');
  return f.cada > 1 ? `${base} · cada ${f.cada} semanas` : base;
}

// Cuántas veces se hizo en la semana de k (opcionalmente solo antes de 'antes').
export function weekCount(log, hid, k, estado = 'done', antes = null) {
  let n = 0;
  for (const d of weekKeys(k)) {
    if (antes && d >= antes) continue;
    if (statusOf(log, hid, d) === estado) n++;
  }
  return n;
}
// Meta semanal para 'times': los días de descanso planificado bajan la meta (nunca por debajo de 0).
export function weekTarget(h, log, k) {
  const n = (h.freq && h.freq.n) || 1;
  const libres = 7 - weekCount(log, h.id, k, 'skip');
  return Math.max(0, Math.min(n, libres));
}

// ¿Aparece hoy en la lista? Los semanales desaparecen cuando ya se cumplió la meta (salvo que se haya hecho hoy).
export function dueOn(h, log, k) {
  if (h.archived) return false;
  if (!isScheduled(h, k)) return false;
  const st = statusOf(log, h.id, k);
  if (h.freq && h.freq.type === 'times') {
    if (st) return true;
    return weekCount(log, h.id, k, 'done', k) < weekTarget(h, log, k);
  }
  return true;
}

// ---------- Rachas con perdón ----------
// Diario / días fijos: cada día que toca y se hizo suma 1. Descanso planificado no cuenta ni rompe.
// Un día que se escapa por semana (lunes a domingo) usa el comodín y no corta la racha. El día de hoy, si
// todavía no se marcó, queda pendiente. Semanales (N veces): la racha se cuenta en semanas cumplidas; si te
// faltó solo 1 (con meta de 2 o más) usás el comodín de esa semana. La semana en curso y la de alta quedan pendientes.
export function analyze(h, log, today) {
  const f = h.freq || { type: 'daily' };
  const created = h.created || today;
  const jokers = new Set();
  let run = 0, best = 0;
  if (f.type === 'times') {
    const n = f.n || 1;
    let w = weekStart(created);
    const cur = weekStart(today);
    let guard = 0;
    while (w <= cur && guard++ < 600) {
      const done = weekCount(log, h.id, w);
      const target = weekTarget(h, log, w);
      if (done >= target && target > 0) { run++; best = Math.max(best, run); }
      else if (target === 0) { /* semana de descanso */ }
      else if (w === cur || w === weekStart(created)) { /* pendiente o semana de alta */ }
      else if (n >= 2 && done >= target - 1) { jokers.add(w); }
      else run = 0;
      w = addDays(w, 7);
    }
    return { current: run, best, unit: 'sem', jokers };
  }
  const usedWeek = new Set();
  let k = created > today ? today : created;
  const start = diffDays(k, today) > 730 ? addDays(today, -730) : k;
  k = start;
  while (k <= today) {
    if (isScheduled(h, k)) {
      const st = statusOf(log, h.id, k);
      if (st === 'done') { run++; best = Math.max(best, run); }
      else if (st === 'skip') { /* no cuenta */ }
      else if (k === today) { /* pendiente */ }
      else {
        const w = weekStart(k);
        if (!usedWeek.has(w)) { usedWeek.add(w); jokers.add(k); }
        else run = 0;
      }
    }
    k = addDays(k, 1);
  }
  return { current: run, best, unit: 'd', jokers };
}

// Estado de una celda para la grilla (sin rojo: lo que no se hizo se ve apagado).
export function cellState(h, log, k, today, info) {
  if (k > today) return isScheduled(h, k) ? 'future' : 'off';
  const st = statusOf(log, h.id, k);
  if (st === 'done') return 'done';
  if (st === 'skip') return 'skip';
  if (!isScheduled(h, k)) return 'off';
  if (h.freq && h.freq.type === 'times') return k === today ? 'pending' : 'open';
  if (k === today) return 'pending';
  const a = info || analyze(h, log, today);
  return a.jokers.has(k) ? 'joker' : 'miss';
}

// Números de la semana de k: por hábito, hechos y meta (la semana en curso se cuenta hasta hoy).
export function weekStats(habits, log, k, today) {
  const keys = weekKeys(k);
  const enCurso = keys.includes(today);
  const per = [];
  let sumDone = 0, sumTarget = 0;
  for (const h of habits) {
    if (h.archived) continue;
    if (h.created && h.created > keys[6]) continue;
    let done = 0, target = 0;
    if (h.freq && h.freq.type === 'times') {
      done = weekCount(log, h.id, k);
      target = weekTarget(h, log, k);
      if (enCurso) {
        const transcurridos = diffDays(keys[0], today) + 1;
        target = Math.min(target, Math.max(Math.ceil(target * transcurridos / 7), Math.min(done, target)));
      }
      done = Math.min(done, target);
    } else {
      for (const d of keys) {
        if (d > today || !isScheduled(h, d)) continue;
        const st = statusOf(log, h.id, d);
        if (st === 'skip') continue;
        if (d === today && st !== 'done') continue;
        target++;
        if (st === 'done') done++;
      }
    }
    if (target === 0 && done === 0) continue;
    per.push({ id: h.id, name: h.name, done, target, pct: target ? done / target : 1 });
    sumDone += done; sumTarget += target;
  }
  return { pct: sumTarget ? sumDone / sumTarget : 0, done: sumDone, target: sumTarget, per };
}

export function dayProgress(habits, log, k) {
  let done = 0, total = 0;
  for (const h of habits) {
    if (!dueOn(h, log, k)) continue;
    const st = statusOf(log, h.id, k);
    if (st === 'skip') continue;
    total++;
    if (st === 'done') done++;
  }
  return { done, total };
}

// Momento del día: el elegido o el que sale de la hora.
export function partOf(h) {
  if (h.part) return h.part;
  const m = toMin(h.time);
  if (m == null) return 'any';
  if (m < 12 * 60) return 'manana';
  if (m < 19 * 60) return 'tarde';
  return 'noche';
}

// ---------- Agenda ----------
// Plantilla de clases: [{id, days:[1..5], from:'18:00', to:'21:00', dur:60, club}] → bloques del día.
export function expandClasses(classes, k) {
  const wd = weekday(k);
  const out = [];
  for (const c of classes || []) {
    if (!(c.days || []).includes(wd)) continue;
    const dur = Number(c.dur) || 60;
    const a = toMin(c.from), b = toMin(c.to || c.from) ;
    for (let m = a; m + dur <= Math.max(b, a + dur); m += dur) {
      out.push({ kind: 'clase', id: `${c.id}@${m}`, start: m, end: m + dur, title: `Clase · ${c.club} · ${fromMin(m)}`, club: c.club });
    }
  }
  return out.sort((x, y) => x.start - y.start);
}

// Reparte en carriles los bloques que se pisan.
export function layoutLanes(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let group = [], groupEnd = -1;
  const flush = () => {
    const lanes = [];
    for (const it of group) {
      let i = lanes.findIndex((end) => end <= it.start);
      if (i === -1) { i = lanes.length; lanes.push(it.end); } else lanes[i] = it.end;
      it.lane = i;
    }
    for (const it of group) { it.lanes = lanes.length; out.push(it); }
    group = []; groupEnd = -1;
  };
  for (const it of sorted) {
    if (group.length && it.start >= groupEnd) flush();
    group.push(it);
    groupEnd = Math.max(groupEnd, it.end);
  }
  if (group.length) flush();
  return out;
}

// Bloques propios del día: los de esa fecha y los que se repiten ese día de la semana.
export function blocksFor(blocks, k) {
  const wd = weekday(k);
  return (blocks || []).filter((b) => (b.date === k || (b.weekly && b.wd === wd && (!b.since || b.since <= k))) && !(b.except || []).includes(k));
}
