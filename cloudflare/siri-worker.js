// Buzón privado de Siri para Rutina. Sin iCloud ni calendarios públicos.
// El atajo de Siri manda lo que dictaste (POST /agregar) y la app lo levanta (GET /buzon) y lo confirma (POST /buzon/ok).
// Todo pide la clave (TOKEN). Variables: TOKEN (secreto), ORIGEN (texto, ej. https://masterpadel360.github.io), BUZON (KV).

const MAX = 100;

function iguales(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origen = request.headers.get('Origin') || '';
    const permitidos = String(env.ORIGEN || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
    const cors = permitidos.includes(origen)
      ? { 'Access-Control-Allow-Origin': origen, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' }
      : { Vary: 'Origin' };
    const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    let body = {};
    if (request.method === 'POST') {
      const txt = await request.text();
      try { body = JSON.parse(txt || '{}'); } catch { body = Object.fromEntries(new URLSearchParams(txt)); }
    }
    const clave = body.t || url.searchParams.get('t');
    if (!env.TOKEN || !iguales(clave, env.TOKEN)) return json(401, { error: 'Clave incorrecta' });
    if (!env.BUZON) return json(500, { error: 'Servidor sin configurar (falta el KV BUZON)' });

    const leer = async () => { try { return JSON.parse((await env.BUZON.get('items')) || '[]'); } catch { return []; } };

    if (url.pathname === '/agregar') {
      const texto = String(body.texto || url.searchParams.get('texto') || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (!texto) return json(400, { error: 'No llegó ningún texto' });
      const items = await leer();
      items.push({ id: crypto.randomUUID(), texto, ts: Date.now() });
      await env.BUZON.put('items', JSON.stringify(items.slice(-MAX)));
      return json(200, { ok: true, mensaje: `Listo: “${texto}” va a Rutina` });
    }
    if (url.pathname === '/buzon' && request.method === 'GET') return json(200, { items: await leer() });
    if (url.pathname === '/buzon/ok' && request.method === 'POST') {
      const ids = new Set(Array.isArray(body.ids) ? body.ids : []);
      const items = (await leer()).filter((x) => !ids.has(x.id));
      await env.BUZON.put('items', JSON.stringify(items));
      return json(200, { ok: true, quedan: items.length });
    }
    return json(404, { error: 'No existe' });
  },
};
