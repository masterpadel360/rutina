// Gastos e ingresos: montos en pesos, totales del mes, categorías, presupuesto y CSV (exportar / importar de otra app).
// Lógica pura (sin DOM).

export const CATEGORIAS = [
  { id: 'comida', name: 'Comida', emoji: '🍽️' },
  { id: 'transporte', name: 'Transporte', emoji: '🚕' },
  { id: 'canchas', name: 'Canchas', emoji: '🎾' },
  { id: 'casa', name: 'Casa', emoji: '🏠' },
  { id: 'salud', name: 'Salud', emoji: '🩺' },
  { id: 'ocio', name: 'Ocio', emoji: '🍷' },
  { id: 'trabajo', name: 'Trabajo', emoji: '💼' },
  { id: 'otros', name: 'Otros', emoji: '🧾' },
];

// Todas las categorías: las fijas + las propias (settings.expenseCats).
export function categorias(propias = []) {
  return [...CATEGORIAS, ...(Array.isArray(propias) ? propias : []).filter((c) => c && c.id && c.name)];
}
export function catDe(id, propias) {
  return categorias(propias).find((c) => c.id === id) || CATEGORIAS[CATEGORIAS.length - 1];
}

// $ 12.500 · $ 1.234,50 · −$ 300
export function formatARS(n, { signo = false } = {}) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const cent = Math.round(abs * 100) % 100;
  const ent = Math.floor(Math.round(abs * 100) / 100);
  const miles = String(ent).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const txt = `$ ${miles}${cent ? ',' + String(cent).padStart(2, '0') : ''}`;
  if (v < 0) return '−' + txt;
  return signo && v > 0 ? '+' + txt : txt;
}

// "12.500" · "12500" · "$ 1.234,50" · "1234.5" · "-300" → número (NaN si no se entiende)
export function parseMonto(s) {
  if (typeof s === 'number') return s;
  let t = String(s ?? '').trim().replace(/\s|\$|ARS/gi, '');
  if (!t) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/^[-−]/.test(t)) { neg = true; t = t.slice(1); }
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  const v = parseFloat(t);
  return neg ? -v : v;
}

export const mesDe = (k) => String(k || '').slice(0, 7);
export function mesSiguiente(ym, n = 1) {
  let [y, m] = ym.split('-').map(Number);
  m += n;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

// Resumen de un mes: totales, por categoría (solo gastos) y por día.
export function resumenMes(movs, ym) {
  const delMes = (movs || []).filter((x) => mesDe(x.date) === ym);
  let gastos = 0, ingresos = 0;
  const cats = {};
  const dias = {};
  for (const x of delMes) {
    const v = Math.abs(Number(x.amount) || 0);
    if (x.kind === 'ingreso') ingresos += v;
    else { gastos += v; cats[x.cat || 'otros'] = (cats[x.cat || 'otros'] || 0) + v; }
    const d = (dias[x.date] ||= { date: x.date, items: [], gastos: 0, ingresos: 0 });
    d.items.push(x);
    if (x.kind === 'ingreso') d.ingresos += v; else d.gastos += v;
  }
  const porCat = Object.entries(cats).map(([cat, total]) => ({ cat, total, pct: gastos ? total / gastos : 0 }))
    .sort((a, b) => b.total - a.total || a.cat.localeCompare(b.cat));
  const porDia = Object.values(dias).sort((a, b) => b.date.localeCompare(a.date));
  for (const d of porDia) d.items.sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
  return { gastos, ingresos, balance: ingresos - gastos, porCat, porDia, cantidad: delMes.length };
}

// Presupuesto mensual por categoría: { usado, tope, pct, resto, pasado }
export function presupuesto(total, tope) {
  const t = Number(tope) || 0;
  if (!t) return null;
  const pct = total / t;
  return { usado: total, tope: t, pct, resto: t - total, pasado: total > t };
}

// ---------- CSV ----------
export function parseCSV(texto) {
  const txt = String(texto || '').replace(/^﻿/, '');
  const primera = txt.split(/\r?\n/).find((l) => l.trim()) || '';
  const cuenta = (c) => primera.split(c).length - 1;
  const sep = [';', '\t', ','].reduce((a, c) => (cuenta(c) > cuenta(a) ? c : a), ',');
  const filas = [];
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (comillas) {
      if (c === '"' && txt[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && txt[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some((x) => x.trim() !== '')) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  fila.push(campo);
  if (fila.some((x) => x.trim() !== '')) filas.push(fila);
  return filas.map((f) => f.map((x) => x.trim()));
}
const celda = (v) => { const s = String(v ?? ''); return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCSV(filas) { return '﻿' + filas.map((f) => f.map(celda).join(',')).join('\r\n') + '\r\n'; }

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// Busca la columna por varios nombres posibles.
export function columnas(cab, nombres) {
  const c = cab.map(norm);
  const out = {};
  for (const [clave, opciones] of Object.entries(nombres)) {
    const i = c.findIndex((x) => opciones.some((o) => x === o || x.startsWith(o)));
    out[clave] = i;
  }
  return out;
}

// "2026-11-10" · "10/11/2026" · "10/11/26" · "10-11-2026" · "10.11.2026" · "2026/11/10" → "2026-11-10" (o null)
export function parseFecha(s) {
  const t = String(s || '').trim().split(/[ T]/)[0];
  let m;
  const pad = (n) => String(n).padStart(2, '0');
  const ok = (y, mo, d) => {
    if (y < 100) y += 2000;
    if (mo < 1 || mo > 12 || d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  };
  if ((m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) return ok(+m[1], +m[2], +m[3]);
  if ((m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) return ok(+m[3], +m[2], +m[1]);
  return null;
}

const SINONIMOS = {
  comida: ['comida', 'super', 'supermercado', 'almacen', 'verduleria', 'carniceria', 'restaurant', 'resto', 'delivery', 'cafe', 'comidas', 'alimentos', 'mercado'],
  transporte: ['transporte', 'nafta', 'combustible', 'uber', 'taxi', 'remis', 'colectivo', 'cabify', 'peaje', 'estacionamiento', 'auto', 'sube'],
  canchas: ['canchas', 'cancha', 'padel', 'deporte', 'deportes', 'paletas', 'pelotas'],
  casa: ['casa', 'alquiler', 'expensas', 'luz', 'gas', 'agua', 'internet', 'servicios', 'hogar', 'limpieza'],
  salud: ['salud', 'farmacia', 'medico', 'obra social', 'prepaga', 'psicologo', 'dentista', 'gimnasio', 'gym'],
  ocio: ['ocio', 'salidas', 'salida', 'cine', 'bar', 'entretenimiento', 'viajes', 'viaje', 'regalos', 'ropa', 'compras'],
  trabajo: ['trabajo', 'clases', 'sueldo', 'negocio', 'publicidad', 'ads', 'equipo', 'liga'],
  otros: ['otros', 'otro', 'varios', 'general'],
};
export function catPorNombre(nombre, propias = []) {
  const n = norm(nombre);
  if (!n) return null;
  const todas = categorias(propias);
  const exacta = todas.find((c) => norm(c.name) === n || c.id === n);
  if (exacta) return exacta.id;
  for (const [id, lista] of Object.entries(SINONIMOS)) if (lista.some((w) => n === w || n.includes(w))) return id;
  return null;
}

// Importa gastos/ingresos de un CSV con columnas flexibles (fecha, descripcion, monto, categoria, tipo).
// Si hay montos negativos, los negativos son gastos y los positivos ingresos.
export function importarGastos(texto, { propias = [], today } = {}) {
  const filas = parseCSV(texto);
  if (filas.length < 2) return { items: [], errores: ['El archivo está vacío o no tiene encabezados'] };
  const col = columnas(filas[0], {
    fecha: ['fecha', 'date', 'dia', 'día'],
    desc: ['descripcion', 'detalle', 'concepto', 'nota', 'notas', 'titulo', 'title', 'nombre', 'description'],
    monto: ['monto', 'importe', 'amount', 'valor', 'precio', 'total', 'gasto'],
    cat: ['categoria', 'category', 'rubro', 'tipo de gasto'],
    tipo: ['tipo', 'type', 'movimiento'],
  });
  if (col.monto < 0) return { items: [], errores: ['No encontré la columna del monto (monto, importe o amount)'] };
  const datos = filas.slice(1);
  const hayNeg = datos.some((f) => parseMonto(f[col.monto]) < 0);
  const items = [], errores = [];
  datos.forEach((f, i) => {
    const v = parseMonto(f[col.monto]);
    if (!Number.isFinite(v) || v === 0) { errores.push(`Fila ${i + 2}: monto "${f[col.monto] ?? ''}" no válido`); return; }
    const fecha = col.fecha >= 0 ? parseFecha(f[col.fecha]) : null;
    if (col.fecha >= 0 && !fecha && f[col.fecha]) { errores.push(`Fila ${i + 2}: fecha "${f[col.fecha]}" no válida`); return; }
    const tipoTxt = col.tipo >= 0 ? norm(f[col.tipo]) : '';
    const kind = /ingres|entrada|cobro|income/.test(tipoTxt) ? 'ingreso' : /gast|egres|salida|expense/.test(tipoTxt) ? 'gasto' : hayNeg && v > 0 ? 'ingreso' : 'gasto';
    const desc = col.desc >= 0 ? f[col.desc] : '';
    const cat = (col.cat >= 0 && catPorNombre(f[col.cat], propias)) || catPorNombre(desc, propias) || (kind === 'ingreso' ? 'trabajo' : 'otros');
    items.push({ kind, amount: Math.abs(v), cat, note: String(desc || (col.cat >= 0 ? f[col.cat] : '') || '').slice(0, 80), date: fecha || today });
  });
  return { items, errores };
}

export function gastosCSV(movs, propias = []) {
  const filas = [['fecha', 'tipo', 'categoria', 'descripcion', 'monto']];
  for (const x of [...(movs || [])].sort((a, b) => a.date.localeCompare(b.date))) {
    filas.push([x.date, x.kind === 'ingreso' ? 'ingreso' : 'gasto', catDe(x.cat, propias).name, x.note || '', String(Math.abs(x.amount)).replace('.', ',')]);
  }
  return toCSV(filas);
}
