# Siri → Rutina (privado)

Le hablás a Siri y aparece en la Agenda de Rutina. **Es privado**: lo dictado va directo a tu propio servidor (`rutina-siri` en tu Cloudflare) con tu clave, y solo tu app lo lee. No pasa por iCloud ni por calendarios públicos.

## 1. En Rutina (una vez)
Más → Ajustes → **Siri** → pegá la **Clave de Siri** → **Probar** → tiene que decir «Conectado».

## 2. El atajo de Siri (una vez, en el iPhone)
1. App **Atajos** → **+**.
2. **Agregar acción** → **Dictar texto** (idioma Español (Argentina), dejar de escuchar «Tras una pausa»).
3. **Agregar acción** → **Obtener contenido de URL**.
   - URL: `https://rutina-siri.gabohuppi22.workers.dev/agregar`
   - Tocá la flechita (Mostrar más) → **Método: POST** → **Cuerpo de solicitud: JSON**.
   - **Agregar campo nuevo → Texto**: clave `t`, valor: tu Clave de Siri.
   - **Agregar campo nuevo → Texto**: clave `texto`, valor: la variable **Texto dictado**.
4. Arriba, el nombre del atajo: **Agendar en Rutina**.

## 3. Usarlo
«Oye Siri, **agendar en Rutina**» → «dentista mañana a las 15».
Al abrir Rutina (o al minuto, si ya está abierta) aparece en la Agenda y te avisa «Siri agendó: …».

Entiende: «gym mañana a las 9», «reunión con Ari el jueves 18:30», «el 14 a las 20 cena», «pasado mañana 10 a 11 dentista». Sin duración: 1 hora.

## Servidor
`cloudflare/siri-worker.js` → Worker `rutina-siri` con KV `BUZON`, secreto `TOKEN` y `ORIGEN` = https://masterpadel360.github.io. La clave no está en ningún archivo: si se pierde, se genera otra y se carga de nuevo.
