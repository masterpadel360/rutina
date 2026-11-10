// Rutina · Avisos: notificaciones push aunque la app esté cerrada (Web Push, iPhone con la app instalada, iOS 16.4+).
// Sin dependencias: cifrado aes128gcm (RFC 8291) y firma VAPID (RFC 8292) con WebCrypto.
//
// Necesita (Cloudflare → Worker → Settings):
//   KV namespace con binding  AVISOS
//   VAPID_PUBLIC   (texto)   clave pública (base64url, 65 bytes)  ← node tools/generar-vapid.mjs
//   VAPID_PRIVATE  (secreto) clave privada "d" (base64url, 32 bytes)
//   VAPID_SUBJECT  (texto)   mailto:tu@mail.com
//   ORIGEN         (texto)   https://masterpadel360.github.io  (varios separados por coma)
//   Cron Trigger: */5 * * * *
//
// El teléfono manda su suscripción y un "plan" de avisos (próximos días, ya con hora UTC y texto) y, cada vez que
// marca algo, qué hábitos hizo. Cada 5 minutos se mandan los avisos que tocan; el de la noche lista solo lo que falta.

const MAX_EQUIPOS = 30;
const MAX_AVISOS = 600;
const VENTANA_MS = 20 * 60 * 1000; // si el cron se atrasa, igual se manda hasta 20 min tarde

// ---------------------------------------------------------------- base64url y bytes
const enc = new TextEncoder();
function b64u(bytes) {
  let s = '';
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(s) {
  const t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(...arrs) {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
const jwkDe = (pub, d) => ({ kty: 'EC', crv: 'P-256', x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ...(d ? { d: b64u(d) } : {}), ext: true });

// ---------------------------------------------------------------- Cifrado (RFC 8291, aes128gcm)
// opciones de prueba: { asPublic, asPrivate (bytes), salt (bytes) }
async function cifrar(texto, p256dh, auth, prueba = null) {
  const uaPublic = typeof p256dh === 'string' ? unb64u(p256dh) : p256dh;
  const authSecret = typeof auth === 'string' ? unb64u(auth) : auth;
  let asPublic, asPrivKey;
  if (prueba) {
    asPublic = prueba.asPublic;
    asPrivKey = await crypto.subtle.importKey('jwk', jwkDe(asPublic, prueba.asPrivate), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  } else {
    const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
    asPrivKey = kp.privateKey;
  }
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPrivKey, 256));
  const prkKey = await hmac(authSecret, ecdh);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const salt = prueba ? prueba.salt : crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const datos = concat(typeof texto === 'string' ? enc.encode(texto) : texto, new Uint8Array([2])); // 0x02 = último registro
  const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, k, datos));
  const rs = 4096;
  const head = concat(salt, new Uint8Array([(rs >>> 24) & 255, (rs >>> 16) & 255, (rs >>> 8) & 255, rs & 255, asPublic.length]), asPublic);
  return concat(head, cifrado);
}

// ---------------------------------------------------------------- VAPID (RFC 8292)
async function vapidHeader(endpoint, env, now = Date.now()) {
  const pub = unb64u(env.VAPID_PUBLIC);
  const key = await crypto.subtle.importKey('jwk', jwkDe(pub, unb64u(env.VAPID_PRIVATE)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:gabohuppi22@gmail.com' })));
  const firma = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`)));
  return `vapid t=${head}.${body}.${b64u(firma)}, k=${env.VAPID_PUBLIC}`;
}

async function enviarPush(sub, payload, env, opts = {}) {
  const body = await cifrar(JSON.stringify(payload), sub.keys.p256dh, sub.keys.auth);
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(sub.endpoint, env),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(opts.ttl || 3600),
      Urgency: 'high',
      ...(payload.tag ? { Topic: String(payload.tag).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'rutina' } : {}),
    },
    body,
  });
  return r.status;
}

// ---------------------------------------------------------------- Qué mandar (copia de llenar() de js/avisos.js)
function listaTxt(nombres, max = 4) {
  const n = nombres.length;
  if (!n) return '';
  if (n > max) return `${nombres.slice(0, max - 1).join(', ')} y ${n - max + 1} más`;
  return n === 1 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} y ${nombres[n - 1]}`;
}
const plantilla = (tpl, v) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? String(v[k]) : m));
function llenar(av, hechos) {
  const h = new Set(hechos || []);
  if (av.tipo === 'habito') return h.has(av.hid) ? null : { title: av.title, body: av.body };
  const faltan = (av.cand || []).filter((c) => !h.has(c.id));
  if (!faltan.length) return null;
  const v = { faltan: faltan.length === 1 ? '1 hábito' : `${faltan.length} hábitos`, lista: listaTxt(faltan.map((c) => c.name)) };
  return { title: plantilla(av.title, v), body: plantilla(av.body, v) };
}

// Avisos que tocan ahora para un equipo (y cuáles ya se mandaron).
function pendientes(eq, now) {
  const enviados = new Set(eq.enviados || []);
  return (eq.plan || []).filter((a) => a.at <= now && a.at > now - VENTANA_MS && !enviados.has(a.id));
}

async function correrCron(env, now = Date.now()) {
  const kv = env.AVISOS;
  let cursor, total = 0;
  do {
    const l = await kv.list({ prefix: 'eq:', cursor });
    cursor = l.list_complete ? null : l.cursor;
    for (const { name } of l.keys) {
      const eq = await kv.get(name, 'json');
      if (!eq || !eq.sub) continue;
      const toca = pendientes(eq, now);
      if (!toca.length) continue;
      let borrar = false;
      for (const a of toca) {
        const msg = llenar(a, (eq.hechos || {})[a.dia]);
        eq.enviados = [...(eq.enviados || []), a.id];
        if (!msg) continue;
        try {
          const st = await enviarPush(eq.sub, { title: msg.title, body: msg.body, tag: a.tipo === 'habito' ? a.hid : a.tipo, url: './' }, env);
          total++;
          if (st === 404 || st === 410) { borrar = true; break; } // la suscripción ya no existe
        } catch { /* error de red: queda marcado igual, para no mandar repetidos */ }
      }
      if (borrar) { await kv.delete(name); continue; }
      const corte = now - 2 * 86400000;
      eq.plan = (eq.plan || []).filter((a) => a.at > corte);
      const vivos = new Set(eq.plan.map((a) => a.id));
      eq.enviados = eq.enviados.filter((id) => vivos.has(id));
      await kv.put(name, JSON.stringify(eq));
    }
  } while (cursor);
  return total;
}

// ---------------------------------------------------------------- HTTP
function iguales(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
function limpiarPlan(plan) {
  if (!Array.isArray(plan)) return [];
  return plan.slice(0, MAX_AVISOS).filter((a) => a && typeof a.at === 'number' && a.id && a.tipo).map((a) => ({
    id: String(a.id).slice(0, 80), dia: String(a.dia || '').slice(0, 10), at: a.at, tipo: String(a.tipo).slice(0, 10),
    title: String(a.title || '').slice(0, 120), body: String(a.body || '').slice(0, 300),
    ...(a.hid ? { hid: String(a.hid).slice(0, 60) } : {}),
    ...(Array.isArray(a.cand) ? { cand: a.cand.slice(0, 40).map((c) => ({ id: String(c.id).slice(0, 60), name: String(c.name).slice(0, 60) })) } : {}),
  }));
}
function limpiarHechos(h) {
  const o = {};
  if (h && typeof h === 'object') for (const [k, v] of Object.entries(h).slice(-10)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Array.isArray(v)) o[k] = v.slice(0, 60).map(String);
  return o;
}

async function atender(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const permitidos = String(env.ORIGEN || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  const cors = { Vary: 'Origin' };
  if (origin && permitidos.includes(origin)) {
    cors['Access-Control-Allow-Origin'] = origin;
    cors['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    cors['Access-Control-Allow-Headers'] = 'Content-Type';
    cors['Access-Control-Max-Age'] = '86400';
  }
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } });
  if (request.method === 'OPTIONS') return new Response(null, { status: cors['Access-Control-Allow-Origin'] ? 204 : 403, headers: cors });
  if (origin && !cors['Access-Control-Allow-Origin']) return json(403, { error: 'Origen no permitido' });
  const ruta = url.pathname.replace(/\/+$/, '') || '/';
  if (request.method === 'GET' && ruta === '/') return json(200, { ok: true, servicio: 'Rutina · Avisos' });
  if (request.method === 'GET' && ruta === '/vapid') return json(200, { clave: env.VAPID_PUBLIC || null });
  if (request.method !== 'POST') return json(405, { error: 'Método no permitido' });
  if (!env.AVISOS || !env.VAPID_PUBLIC || !env.VAPID_PRIVATE) return json(500, { error: 'Servidor sin configurar (KV o VAPID)' });

  const texto = await request.text();
  if (texto.length > 200000) return json(413, { error: 'Demasiado grande' });
  let d;
  try { d = JSON.parse(texto); } catch { return json(400, { error: 'JSON inválido' }); }
  const kv = env.AVISOS;

  if (ruta === '/suscribir') {
    const s = d.sub;
    if (!s || !/^https:\/\//.test(s.endpoint || '') || !s.keys || !s.keys.p256dh || !s.keys.auth) return json(400, { error: 'Suscripción inválida' });
    let id = typeof d.id === 'string' && /^[a-z0-9]{8,40}$/.test(d.id) ? d.id : null;
    let clave = typeof d.clave === 'string' ? d.clave : null;
    const previo = id ? await kv.get('eq:' + id, 'json') : null;
    if (previo && !iguales(previo.clave, clave || '')) { id = null; clave = null; }
    if (!previo || !id) {
      const lista = await kv.list({ prefix: 'eq:' });
      if (lista.keys.length >= MAX_EQUIPOS) return json(429, { error: 'Demasiados equipos registrados' });
      id = b64u(crypto.getRandomValues(new Uint8Array(12))).toLowerCase().replace(/[^a-z0-9]/g, 'x');
      clave = b64u(crypto.getRandomValues(new Uint8Array(24)));
    }
    const eq = { ...(previo || {}), clave, sub: { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }, plan: limpiarPlan(d.plan), hechos: limpiarHechos(d.hechos), enviados: (previo && previo.enviados) || [], at: Date.now() };
    await kv.put('eq:' + id, JSON.stringify(eq));
    return json(200, { id, clave, avisos: eq.plan.length });
  }

  const id = typeof d.id === 'string' ? d.id : '';
  const eq = /^[a-z0-9]{8,40}$/.test(id) ? await kv.get('eq:' + id, 'json') : null;
  if (!eq || !iguales(eq.clave, d.clave || '')) return json(404, { error: 'Equipo no registrado' });

  if (ruta === '/plan') {
    if (d.plan) eq.plan = limpiarPlan(d.plan);
    if (d.hechos) eq.hechos = { ...(eq.hechos || {}), ...limpiarHechos(d.hechos) };
    const dias = Object.keys(eq.hechos || {}).sort();
    for (const k of dias.slice(0, Math.max(0, dias.length - 4))) delete eq.hechos[k];
    eq.at = Date.now();
    await kv.put('eq:' + id, JSON.stringify(eq));
    return json(200, { ok: true, avisos: eq.plan.length });
  }
  if (ruta === '/probar') {
    const st = await enviarPush(eq.sub, { title: String(d.title || 'Rutina').slice(0, 120), body: String(d.body || 'Así te van a llegar los avisos.').slice(0, 300), tag: 'prueba', url: './' }, env, { ttl: 600 });
    if (st === 404 || st === 410) { await kv.delete('eq:' + id); return json(410, { error: 'La suscripción venció: activá los avisos de nuevo' }); }
    return json(st < 300 ? 200 : 502, { ok: st < 300, estado: st });
  }
  if (ruta === '/baja') { await kv.delete('eq:' + id); return json(200, { ok: true }); }
  return json(404, { error: 'No existe' });
}

export default {
  fetch: (request, env) => atender(request, env || {}),
  scheduled: (event, env, ctx) => ctx.waitUntil(correrCron(env)),
  // Para las pruebas (node tests/avisos.test.mjs). El worker no los usa.
  _prueba: { cifrar, vapidHeader, llenar, pendientes, correrCron, atender, b64u, unb64u },
};
