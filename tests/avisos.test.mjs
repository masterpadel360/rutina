// Pruebas de avisos: plan (horas, silencio, tono, por hábito), cifrado Web Push (RFC 8291), VAPID y el cron.
// Uso: node tests/avisos.test.mjs
import assert from 'node:assert/strict';
import worker from '../cloudflare/avisos-worker.js';
import { planAvisos, llenar, enSilencio, plantilla, listaTxt, avisoHabito } from '../js/avisos.js';

const W = worker._prueba;
let ok = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); ok++; console.log('  ok  ', name); }
  catch (e) { fail++; console.log('  FALLA', name, '\n       ', e.message); }
}

// ---------- Plan ----------
const HOY = '2026-11-10'; // martes
const base = () => ({
  settings: { name: 'Vale', remind: { on: true, morning: '08:00', evening: '21:30', habits: true, tone: 'motivador', textoManana: '', textoNoche: '', quiet: { on: false, from: '22:30', to: '07:30' } } },
  habits: [
    { id: 'agua', name: 'Tomar agua', icon: '💧', freq: { type: 'daily' }, time: null, created: '2026-11-01' },
    { id: 'gym', name: 'Gym', icon: '🏋️', freq: { type: 'days', days: [1, 3, 5] }, time: '09:00', created: '2026-11-01' },
    { id: 'leer', name: 'Leer', icon: '📖', freq: { type: 'daily' }, time: '23:00', created: '2026-11-01' },
    { id: 'skin', name: 'Skincare', icon: '🧴', freq: { type: 'daily' }, time: null, created: '2026-11-01', remind: { on: true, time: '22:45', text: '🧴 2 minutos y listo' } },
    { id: 'viejo', name: 'Archivado', icon: '•', freq: { type: 'daily' }, time: '10:00', created: '2026-11-01', archived: true },
  ],
  log: {},
});

console.log('Plan de avisos');
await t('Mañana, noche y por hábito con hora UTC (Córdoba = UTC-3)', () => {
  const p = planAvisos(base(), HOY, 1);
  assert.deepEqual(p.map((a) => [a.tipo, a.hid || '', new Date(a.at).toISOString()]), [
    ['manana', '', '2026-11-10T11:00:00.000Z'],
    ['noche', '', '2026-11-11T00:30:00.000Z'],
    ['habito', 'skin', '2026-11-11T01:45:00.000Z'],
    ['habito', 'leer', '2026-11-11T02:00:00.000Z'],
  ]);
  assert.deepEqual(p[0].cand.map((c) => c.id), ['agua', 'leer', 'skin']); // el gym no toca los martes
});
await t('Texto del tono con {nombre}; {faltan} y {lista} quedan para el envío', () => {
  const [m] = planAvisos(base(), HOY, 1);
  assert.equal(m.title, '¡Buen día, Vale! ☀️');
  assert.equal(m.body, 'Hoy tenés {faltan}: {lista}. ¡Vamos que se puede!');
});
await t('Sin nombre no queda ", " colgando', () => {
  const S = base(); S.settings.name = '';
  assert.equal(planAvisos(S, HOY, 1)[0].title, '¡Buen día! ☀️');
});
await t('Texto propio por hábito y tono directo', () => {
  const S = base(); S.settings.remind.tone = 'directo';
  const p = planAvisos(S, HOY, 1);
  assert.equal(p.find((a) => a.hid === 'skin').body, '🧴 2 minutos y listo');
  assert.equal(p.find((a) => a.hid === 'leer').title, '📖 Leer');
  assert.equal(p.find((a) => a.hid === 'leer').body, 'Ahora.');
  assert.equal(p.find((a) => a.tipo === 'noche').title, 'Sin hacer: {faltan}');
});
await t('Plantilla propia de mañana', () => {
  const S = base(); S.settings.remind.textoManana = '{nombre}, hoy: {lista}';
  assert.equal(planAvisos(S, HOY, 1)[0].body, 'Vale, hoy: {lista}');
});
await t('Horas de silencio (cruzan la medianoche) sacan los avisos de la noche tarde', () => {
  const S = base(); S.settings.remind.quiet = { on: true, from: '22:30', to: '07:30' };
  assert.deepEqual(planAvisos(S, HOY, 1).map((a) => a.hid || a.tipo), ['manana', 'noche']);
  assert.equal(enSilencio(23 * 60, S.settings.remind.quiet), true);
  assert.equal(enSilencio(7 * 60 + 30, S.settings.remind.quiet), false);
  assert.equal(enSilencio(13 * 60, { on: true, from: '13:00', to: '15:00' }), true);
});
await t('Apagar un hábito, apagar "a la hora de cada hábito" y apagar todo', () => {
  const S = base(); S.habits[2].remind = { on: false };
  assert.equal(planAvisos(S, HOY, 1).some((a) => a.hid === 'leer'), false);
  S.settings.remind.habits = false;
  assert.deepEqual(planAvisos(S, HOY, 1).filter((a) => a.tipo === 'habito').map((a) => a.hid), ['skin']); // el que tiene aviso propio sigue
  S.settings.remind.on = false;
  assert.deepEqual(planAvisos(S, HOY, 1), []);
  assert.equal(avisoHabito({ time: null }, { habits: true }).on, false); // sin hora no hay aviso
});
await t('Varios días: el gym aparece miércoles; descanso y archivados no', () => {
  const S = base(); S.log['2026-11-11'] = { agua: 'skip' };
  const mie = planAvisos(S, HOY, 2).filter((a) => a.dia === '2026-11-11');
  assert.ok(mie.some((a) => a.hid === 'gym'));
  assert.equal(mie[0].cand.some((c) => c.id === 'agua'), false);
  assert.equal(planAvisos(S, HOY, 7).some((a) => a.hid === 'viejo'), false);
});
await t('Al enviar: la noche lista solo lo que falta; si está todo, no se manda', () => {
  const [, noche] = planAvisos(base(), HOY, 1);
  assert.deepEqual(llenar(noche, ['agua']), { title: 'Último empujón 💪', body: 'Para cerrar el día: Leer y Skincare. ¡Vamos que se puede!' });
  assert.deepEqual(llenar(noche, ['leer', 'skin']).body, 'Para cerrar el día: Tomar agua. ¡Vamos que se puede!');
  assert.equal(llenar(noche, ['agua', 'leer', 'skin']), null);
  const leer = planAvisos(base(), HOY, 1).find((a) => a.hid === 'leer');
  assert.equal(llenar(leer, ['leer']), null);
});
await t('El servidor completa igual que la app', () => {
  for (const a of planAvisos(base(), HOY, 3)) for (const h of [[], ['agua'], ['agua', 'leer', 'skin', 'gym']]) assert.deepEqual(W.llenar(a, h), llenar(a, h));
});
await t('Lista corta', () => {
  assert.equal(listaTxt(['A', 'B', 'C', 'D', 'E', 'F']), 'A, B, C y 3 más');
  assert.equal(plantilla('{x} {y}', { x: 1 }), '1 {y}');
});

// ---------- Cifrado (RFC 8291, sección 5) ----------
console.log('Web Push');
const V = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  esperado: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};
const u = W.unb64u;
await t('Vector de prueba del RFC 8291 (byte a byte)', async () => {
  const out = await W.cifrar(u(V.plaintext), V.uaPublic, V.auth, { asPublic: u(V.asPublic), asPrivate: u(V.asPrivate), salt: u(V.salt) });
  assert.equal(W.b64u(out), V.esperado);
});

// Descifrado del lado del "teléfono" (para probar con claves nuevas al azar)
async function descifrar(body, uaPub, uaPriv, auth) {
  const enc = new TextEncoder();
  const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
  const jwk = { kty: 'EC', crv: 'P-256', x: W.b64u(uaPub.slice(1, 33)), y: W.b64u(uaPub.slice(33)), d: W.b64u(uaPriv) };
  const priv = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const pubK = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: pubK }, priv, 256));
  const hm = async (k, d) => new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), d));
  const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
  const ikm = await hm(await hm(auth, ecdh), cat(enc.encode('WebPush: info\0'), uaPub, asPub, new Uint8Array([1])));
  const prk = await hm(salt, ikm);
  const cek = (await hm(prk, cat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hm(prk, cat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, k, ct));
  assert.equal(pt[pt.length - 1], 2);
  return new TextDecoder().decode(pt.slice(0, -1));
}
async function telefono() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const d = u((await crypto.subtle.exportKey('jwk', kp.privateKey)).d);
  return { pub, d, auth: crypto.getRandomValues(new Uint8Array(16)) };
}
await t('Ida y vuelta con claves nuevas (lo que hace el teléfono)', async () => {
  const tel = await telefono();
  const msg = JSON.stringify({ title: '🧘 Meditar', body: '10 minutos y listo' });
  const out = await W.cifrar(msg, W.b64u(tel.pub), W.b64u(tel.auth));
  assert.equal(await descifrar(out, tel.pub, tel.d, tel.auth), msg);
});

const vapid = await (async () => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { kp, env: { VAPID_PUBLIC: W.b64u(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))), VAPID_PRIVATE: (await crypto.subtle.exportKey('jwk', kp.privateKey)).d, VAPID_SUBJECT: 'mailto:test@example.com' } };
})();
await t('VAPID: JWT ES256 válido para el origen del endpoint', async () => {
  const h = await W.vapidHeader('https://web.push.apple.com/QGv7abc', vapid.env, Date.parse('2026-11-10T12:00:00Z'));
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
  assert.ok(m);
  const claims = JSON.parse(Buffer.from(m[2], 'base64url').toString());
  assert.equal(claims.aud, 'https://web.push.apple.com');
  assert.equal(claims.sub, 'mailto:test@example.com');
  assert.equal(claims.exp, Date.parse('2026-11-10T12:00:00Z') / 1000 + 12 * 3600);
  const okFirma = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vapid.kp.publicKey, u(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`));
  assert.equal(okFirma, true);
  assert.equal(m[4], vapid.env.VAPID_PUBLIC);
});

// ---------- Servidor y cron con KV de mentira ----------
console.log('Servidor de avisos');
class KV {
  constructor() { this.m = new Map(); }
  async get(k, t) { const v = this.m.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }
  async put(k, v) { this.m.set(k, v); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix }) { return { keys: [...this.m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; }
}
const env = { ...vapid.env, AVISOS: new KV(), ORIGEN: 'https://masterpadel360.github.io' };
const tel = await telefono();
const sub = { endpoint: 'https://web.push.apple.com/abc123', keys: { p256dh: W.b64u(tel.pub), auth: W.b64u(tel.auth) } };
const enviados = [];
const realFetch = globalThis.fetch;
let respuesta = 201;
globalThis.fetch = async (url, init) => {
  enviados.push({ url, headers: init.headers, msg: JSON.parse(await descifrar(new Uint8Array(init.body), tel.pub, tel.d, tel.auth)) });
  return new Response(null, { status: respuesta });
};
const post = (ruta, data, origin = 'https://masterpadel360.github.io') => W.atender(new Request('https://a.example' + ruta, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(data) }), env);
const plan = planAvisos(base(), HOY, 2);
let eq;
await t('Suscribir guarda el equipo y devuelve id + clave', async () => {
  const r = await post('/suscribir', { sub, plan, hechos: {} });
  assert.equal(r.status, 200);
  eq = await r.json();
  assert.match(eq.id, /^[a-z0-9]{8,40}$/);
  assert.equal(eq.avisos, plan.length);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://masterpadel360.github.io');
});
await t('Otro origen no puede', async () => {
  assert.equal((await post('/suscribir', { sub, plan }, 'https://malo.com')).status, 403);
});
await t('Sin la clave no se puede tocar el plan', async () => {
  assert.equal((await post('/plan', { id: eq.id, clave: 'x', plan: [] })).status, 404);
});
await t('Cron: a las 08:00 manda el de la mañana una sola vez', async () => {
  const at = Date.parse('2026-11-10T11:00:00Z');
  assert.equal(await W.correrCron(env, at + 60000), 1);
  assert.equal(enviados[0].msg.title, '¡Buen día, Vale! ☀️');
  assert.equal(enviados[0].msg.body, 'Hoy tenés 3 hábitos: Tomar agua, Leer y Skincare. ¡Vamos que se puede!');
  assert.equal(enviados[0].headers['Content-Encoding'], 'aes128gcm');
  assert.match(enviados[0].headers.Authorization, /^vapid t=/);
  assert.equal(await W.correrCron(env, at + 5 * 60000), 0); // no repite
});
await t('Marcar hechos desde el teléfono → la noche lista solo lo que falta', async () => {
  assert.equal((await post('/plan', { id: eq.id, clave: eq.clave, hechos: { [HOY]: ['agua', 'skin'] } })).status, 200);
  await W.correrCron(env, Date.parse('2026-11-11T00:31:00Z'));
  assert.equal(enviados.at(-1).msg.body, 'Para cerrar el día: Leer. ¡Vamos que se puede!');
});
await t('Si ya está hecho, el aviso del hábito no sale', async () => {
  const n = enviados.length;
  await W.correrCron(env, Date.parse('2026-11-11T01:46:00Z')); // skincare 22:45 (hecho)
  assert.equal(enviados.length, n);
  await W.correrCron(env, Date.parse('2026-11-11T02:01:00Z')); // leer 23:00 (no hecho)
  assert.equal(enviados.at(-1).msg.title, '📖 Leer');
});
await t('Si el cron se atrasó más de 20 min, no manda avisos viejos', async () => {
  const n = enviados.length;
  await W.correrCron(env, Date.parse('2026-11-11T12:00:00Z')); // 09:00 de Córdoba + gym del miércoles es 12:00Z → toca justo
  const m = enviados.slice(n).map((x) => x.msg.title);
  assert.ok(!m.some((x) => x.startsWith('¡Buen día')), 'el de las 08:00 ya pasó hace 60 min');
});
await t('Suscripción vencida (410) → se borra el equipo', async () => {
  respuesta = 410;
  const r = await post('/probar', { id: eq.id, clave: eq.clave });
  assert.equal(r.status, 410);
  assert.equal(env.AVISOS.m.size, 0);
});
globalThis.fetch = realFetch;

console.log(`\n${ok} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
