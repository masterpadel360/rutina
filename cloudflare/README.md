# Servidores de Rutina (Cloudflare Workers)

## Calendario (`calendario-worker.js`)

Lee el calendario público de iCloud (ICS) y se lo da a la app como JSON. El navegador no puede leer iCloud directo (CORS), por eso hace falta este puente. Un solo archivo, sin dependencias.

### Qué hace
- `GET /eventos?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&t=CLAVE` → `{ actualizado, viejo, zona, desde, hasta, eventos: [{ id, title, start, end, allDay }] }`
  - Con hora: `start`/`end` en ISO UTC. Todo el día: `"AAAA-MM-DD"`, `end` exclusivo (como ICS).
  - Sin `desde`/`hasta`: una semana atrás y 60 días adelante. Máximo 400 días.
- Expande repeticiones: DAILY, WEEKLY (BYDAY, INTERVAL), MONTHLY (BYMONTHDAY o BYDAY tipo `2TU`/`-1FR`), YEARLY; COUNT, UNTIL, EXDATE; instancias movidas (RECURRENCE-ID); ignora STATUS:CANCELLED y las alarmas.
- Zonas: TZID (cualquier zona IANA, p. ej. `America/Argentina/Cordoba`), horas en UTC (`Z`), hora flotante = Córdoba.
- Guarda el ICS 5 minutos (en memoria + caché de Cloudflare). Si iCloud falla, devuelve la última copia con `viejo: true`.
- CORS solo para los orígenes de `ORIGEN`. Si hay `TOKEN`, sin `?t=` correcto responde 401.

### Variables
| Nombre | Tipo | Valor |
|---|---|---|
| `ICS_URL` | Secreto | Link de “Calendario público” de iCloud (`webcal://p…-caldav.icloud.com/published/2/…`). Se acepta `webcal://` o `https://`. |
| `TOKEN` | Secreto | Clave larga al azar (la misma va en Rutina → Ajustes → Calendario del iPhone → Clave). |
| `ORIGEN` | Texto | Origen de la app, sin ruta: `https://masterpadel360.github.io`. Varios separados por coma. |

Generar una clave (PowerShell): `[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')`

### Publicarlo (lo hace el asistente)
**Opción A — panel de Cloudflare (sin instalar nada):**
1. dash.cloudflare.com → Workers & Pages → Create → Worker → nombre `rutina-calendario` → Deploy.
2. Edit code → borrar todo → pegar `calendario-worker.js` entero → Deploy.
3. Settings → Variables and Secrets → agregar `ICS_URL` (Secret), `TOKEN` (Secret), `ORIGEN` (Text) → Deploy.
4. Probar: `https://rutina-calendario.<cuenta>.workers.dev/eventos?t=<TOKEN>` tiene que devolver JSON con los eventos.

**Opción B — wrangler (con token de API):**
```
npx wrangler deploy                       # usa wrangler.toml de esta carpeta
npx wrangler secret put ICS_URL
npx wrangler secret put TOKEN
```
(`ORIGEN` está en `wrangler.toml` → `[vars]`; cambiarlo si la app queda en otra dirección.)

### En la app
Ajustes → Calendario del iPhone → Dirección del servidor (`https://rutina-calendario.<cuenta>.workers.dev`) + Clave → “Probar conexión”. La app pide eventos al abrir, al volver a la app y cada 10 minutos, y guarda la última respuesta para verla sin internet.

### Pruebas
`node tests/ics.test.mjs` (lector ICS, repeticiones, zonas y el servidor con CORS/clave/caché).

## Avisos push (`avisos-worker.js`)

Manda las notificaciones aunque la app esté cerrada (Web Push; en iPhone solo con la app instalada en la pantalla de inicio, iOS 16.4+). Un solo archivo, sin dependencias: cifrado aes128gcm (RFC 8291) y firma VAPID (RFC 8292) con WebCrypto. Probado contra el vector del RFC 8291 y contra el servicio push real de Chrome (FCM respondió 201).

### Cómo funciona
- El teléfono se suscribe (`POST /suscribir` con la suscripción + un **plan** de avisos de los próximos 10 días: hora UTC, título y texto ya armados) y recibe `id` + `clave`.
- Cada cambio en la app (marcar un hábito, cambiar horarios o textos) manda `POST /plan` con el plan nuevo y los **hechos** de hoy y ayer.
- El **cron** (cada 5 min) manda lo que toca. Los de mañana/noche se completan al enviar con lo que falta (`{faltan}`, `{lista}`); si ya está todo hecho, no se mandan. El de cada hábito no sale si ya se hizo. Si el cron se atrasa, se manda hasta 20 min tarde; más viejo, se descarta.
- Si el servicio push responde 404/410 (suscripción vencida), se borra el equipo y la app pide reactivar.
- Si el teléfono no abre la app en 10 días, se terminan los avisos planificados (se renuevan al abrirla).
- Otros endpoints: `GET /vapid` (clave pública), `POST /probar` (aviso de prueba), `POST /baja`. Máximo 30 equipos.

### Variables y recursos
| Nombre | Tipo | Valor |
|---|---|---|
| `AVISOS` | KV namespace (binding) | Crear uno nuevo (`rutina-avisos`) |
| `VAPID_PUBLIC` | Texto | De `node tools/generar-vapid.mjs` |
| `VAPID_PRIVATE` | **Secreto** | De `node tools/generar-vapid.mjs` (no guardarla en el repo) |
| `VAPID_SUBJECT` | Texto | `mailto:gabohuppi22@gmail.com` |
| `ORIGEN` | Texto | `https://masterpadel360.github.io` |
| Cron Trigger | — | `*/5 * * * *` |

### Publicarlo (lo hace el asistente)
1. `node tools/generar-vapid.mjs` → anotar las dos claves (una sola vez; si se cambian, todos tienen que reactivar).
2. Panel: Workers & Pages → KV → Create namespace `rutina-avisos`.
3. Create Worker `rutina-avisos` → pegar `avisos-worker.js` → Deploy.
4. Settings → Bindings → KV namespace: nombre `AVISOS` → `rutina-avisos`. Variables: las de la tabla. Triggers → Cron: `*/5 * * * *`.
   (Con wrangler: `wrangler-avisos.toml` tiene todo; completar el id del KV y la clave pública.)
5. Poner la dirección en `js/store.js` → `APP.avisos = 'https://rutina-avisos.<cuenta>.workers.dev'` (así nadie la tiene que escribir), subir `VERSION` en `sw.js` y publicar la app.

Pruebas: `node tests/avisos.test.mjs`.
