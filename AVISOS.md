# Avisos de Rutina (y cómo dársela a otra persona)

Sirve igual para Gabriel y para cualquiera a quien le pases la app (por ejemplo, tu novia). Cada uno la usa en **su** teléfono, con **sus** datos: nadie ve lo del otro.

## 1. Instalar la app en el iPhone (una sola vez)

1. Abrí el link de Rutina en **Safari** (no en Chrome ni dentro de Instagram/WhatsApp: si se abre ahí, tocá “Abrir en Safari”).
2. Tocá **Compartir** (el cuadrado con la flecha) → **Agregar a inicio** → **Agregar**.
3. Desde ahora abrila siempre **desde el ícono**, no desde Safari. (iPhone le da datos propios a la app instalada: lo de Safari y lo del ícono no se mezclan.)

## 2. La primera vez

Si es un teléfono nuevo, Rutina pregunta:
1. **Tu nombre.**
2. **Tus hábitos:** elegís de la lista (tomar agua, leer, estirar, skincare, sin redes de noche, gym, meditar…) o creás los tuyos. Con 4 a 6 se sostiene mejor.
3. **¿Das clases?** Viene apagado. Prendelo solo si sos profe: ahí cargás tus horarios.

En el teléfono de Gabriel no aparece nada de esto: sus datos quedan como están.

## 3. Prender los avisos (aunque la app esté cerrada)

1. Abrí Rutina **desde el ícono** → **Ajustes** → **Avisos**.
2. En **Con la app cerrada**, tocá **Activar** → cuando el iPhone pregunte, tocá **Permitir**.
3. Tocá **Probar aviso**, cerrá la app y esperá unos segundos: tiene que llegar.

Si dice “Primero instalá la app”, volvé al paso 1. Si dice “Bloqueados”: **Ajustes del iPhone → Notificaciones → Rutina → Permitir notificaciones**.

## 4. Elegir cómo te hablan

En **Ajustes → Avisos** y **Cómo te hablan**:
- **Mañana** y **Noche:** a qué hora. El de la noche lista **solo lo que te falta**; si hiciste todo, no te molesta.
- **A la hora de cada hábito:** prendido/apagado para todos. Cada hábito se ajusta en su ficha (Ajustes → tocá el hábito → **Aviso**): prender/apagar, otra hora y su propio texto (ej. “🧘 10 minutos y listo”).
- **Horas de silencio:** por ejemplo de 23:00 a 07:00 no sale nada.
- **Tono:** Motivador, Tranqui o Directo.
- **Mensajes propios** de mañana y noche. Podés usar:
  - `{nombre}` → tu nombre
  - `{faltan}` → “3 hábitos”
  - `{lista}` → “Gym, Leer y Agua”
  
  Ejemplo: `{nombre}, hoy te esperan {faltan}: {lista} 💪`

## Bueno saber
- Abrí la app al menos una vez por semana: así se renuevan los avisos de los próximos días (se planifican 10 días).
- Cuando marcás un hábito, el servidor se entera en unos segundos (hace falta internet en ese momento).
- Si algo falla, siguen andando los avisos con la app abierta y el botón **Pasarlos al calendario** (los agrega como alarmas del Calendario).

## Lo que hace el asistente para que esto ande
1. Genera las claves de avisos (`node tools/generar-vapid.mjs`).
2. Publica el servidor `rutina-avisos` en Cloudflare (cuenta de Gabriel), con su base de datos KV y el reloj cada 5 minutos (pasos en `cloudflare/README.md`).
3. Deja puesta la dirección del servidor en la app (`APP.avisos` en `js/store.js`) y publica la app en GitHub Pages.
4. Te pasa el link de la app para instalar (y para mandarle a quien quieras).
