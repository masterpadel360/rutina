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
