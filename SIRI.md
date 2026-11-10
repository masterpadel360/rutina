# Siri → Rutina

La idea: le hablás a Siri y aparece en la Agenda de Rutina. Hay dos caminos. Arrancá por el 1, que es el bueno.

---

## Camino 1 — Siri anota en el Calendario y Rutina lo muestra (recomendado)

Decís **“Oye Siri, agendá gym mañana a las 9”**. Siri lo guarda en el Calendario del iPhone y Rutina lo muestra en la Agenda (rayado en rojo, con el ícono de calendario) y en “lo que viene” de Hoy. Desde Rutina solo se ve: para cambiarlo o borrarlo, usás la app Calendario o le pedís a Siri.

### a) Lo que hacés vos en el iPhone (5 minutos)

1. **Crear el calendario “Rutina”**
   App **Calendario** → abajo, **Calendarios** → **Agregar calendario** → nombre **Rutina** → que diga **iCloud** (no “En mi iPhone”) → **OK**.
2. **Hacerlo el calendario de Siri**
   **Ajustes** → **Apps** → **Calendario** → **Calendario predeterminado** (en algunas versiones: “por omisión”) → elegí **Rutina**.
   Desde ahora, todo lo que le dictes a Siri cae ahí.
3. **Hacerlo público y copiar el link**
   App Calendario → **Calendarios** → tocá la **(i)** al lado de **Rutina** → bajá y prendé **Calendario público** → **Compartir enlace** → **Copiar**.
   Es un link que empieza con `webcal://p…-caldav.icloud.com/…`.
4. **Pasame ese link por acá** (no por un grupo ni redes).
5. Probalo: “Oye Siri, agendá gym mañana a las 9”. Fijate que en Calendario aparezca en **Rutina**.

> **Privacidad, importante.** El link público no aparece en ningún buscador, pero **cualquiera que lo tenga puede leer ese calendario**. Por eso:
> - Usá **Rutina** solo para cosas de rutina (gym, reels, reuniones de trabajo, clases). **Nada personal ni médico** ahí: eso dejalo en tu calendario de siempre.
> - El link queda guardado **solo en el servidor**, como secreto. Ni la app ni la página lo muestran.
> - Si alguna vez se filtra: apagá y volvé a prender “Calendario público” (cambia el link) y me pasás el nuevo.

### b) Lo que hago yo con ese link

1. Publico el servidor del calendario en tu cuenta de **Cloudflare** (el mismo lugar donde está el de la liga): se llama `rutina-calendario`.
2. Le cargo tres datos secretos: tu link de iCloud, una clave que invento yo y la dirección de tu página de Rutina (así solo tu app lo puede leer).
3. Te paso **la dirección del servidor y la clave**. Vos los pegás en Rutina → **Ajustes** → **Calendario del iPhone** → **Probar conexión**. Tiene que decir “Conectado: N eventos”.

Listo. Rutina busca novedades al abrirla, al volver a la app y cada 10 minutos. Sin internet muestra lo último que bajó.
Ojo: iCloud tarda unos minutos en publicar lo nuevo, así que lo que le dictaste a Siri puede aparecer en Rutina 5 a 15 minutos después.

---

## Camino 2 — Atajo “Agendar en Rutina” (de respaldo, sin servidor)

Decís **“Oye Siri, agendar en Rutina”**, Siri te escucha, y se abre Rutina con el bloque armado para que lo confirmes (podés corregir antes de guardar).

### Armar el atajo (una sola vez)

1. App **Atajos** → **+** (arriba a la derecha).
2. Tocá **Agregar acción** → buscá **Dictar texto** → agregala. (Tocá la flechita: idioma **Español (Argentina)**, dejar de escuchar **Tras una pausa**.)
3. Buscá **Codificar URL** → agregala. Tiene que decir “Codificar URL **Texto dictado**”.
4. Buscá **Abrir URL** → agregala. En la URL escribí la dirección de tu Rutina seguida de `?agregar=` y después insertá la variable **Texto codificado**:
   `https://masterpadel360.github.io/rutina/?agregar=` **[Texto codificado]**
   (te confirmo la dirección exacta cuando la app quede publicada).
5. Arriba, tocá el nombre → **Cambiar nombre** → **Agendar en Rutina** → **OK**.
6. Probalo: “Oye Siri, agendar en Rutina” → “grabar reel hoy 15hs”.

### Qué entiende
- “gym mañana a las 9” · “grabar reel hoy 15hs” · “reunión con Ari el jueves a las 18:30”
- “pasado mañana 10 a 11 dentista” · “el 14 a las 20 cena” · “torneo el 3 de diciembre a las 9”
- “correr 7” (si las 7 ya pasaron, lo pone mañana) · “a la mañana / tarde / noche” = 9 / 16 / 21
- “a las 3” se entiende 15:00 (de 1 a 6 sin aclarar, es de tarde). Si no dice hora, te avisa para que la elijas.
- Si no decís cuánto dura, es 1 hora.

En la Agenda de Rutina también hay un campo arriba para **escribir** lo mismo (“gym mañana a las 9”) y agregarlo de una.

### Limitación de iPhone (leela)
Los atajos abren los links en **Safari**. Si tenés Rutina **instalada en la pantalla de inicio**, iPhone le da sus propios datos, separados de Safari: lo que agregues con el atajo queda en la Rutina de Safari, no en la del ícono. Por eso:
- Si usás Rutina desde el ícono → usá el **Camino 1** (Calendario), que funciona siempre.
- El Camino 2 sirve si usás Rutina desde Safari, o como respaldo si el servidor no anda.
