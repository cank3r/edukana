# Institución de demostración

Para mostrar Edukana sin usar datos reales hay una institución de demostración, **«Instituto Técnico Demo»**, que se carga en la base de staging con un solo comando y se quita con otro.

- Crea **una sola institución nueva**. No cambia ni borra nada de las demás instituciones que ya están en staging.
- Todas las cuentas usan correos `@demo.edukana.do` y **la misma contraseña**, la que tú pones en `DEMO_PASSWORD`. El comando nunca la muestra ni la guarda.
- Las fechas se calculan desde el día en que se carga: el cuatrimestre «va por la semana 9», con ocho semanas de clases, tareas, notas y asistencia ya tomadas, un examen abierto y clases en vivo en los próximos días. Si la demo se muestra semanas después, recárgala con `DEMO_RESET=1` para que vuelva a verse actual.
- Tarda menos de un minuto: todo se escribe por lotes.

## Qué crea

| Qué | Detalle |
|---|---|
| Personas | Directora, coordinador, **10 docentes**, **120 estudiantes** con nombres dominicanos y **15 tutores** vinculados a un estudiante cada uno |
| Períodos | El cuatrimestre actual (empezó hace 8 semanas) y el anterior |
| Programas y grupos | **Técnico en Enfermería** (grupos Mañana 30 y Tarde 28) y **Técnico en Contabilidad** (grupos Noche 30 y Sábados 26), 3 cursos cada uno |
| Cursos complementarios | Mantenimiento de Computadoras, Electricidad Residencial, Instalaciones Solares Fotovoltaicas, Mercadeo Digital, Servicio al Turista y Excel para la Oficina. Cada estudiante de un grupo toma uno o dos |
| Contenido | 12 cursos con 3 capítulos y 3 lecciones publicadas cada uno; 10 lecciones con video de YouTube (charlas TED y videos educativos públicos). Una lección queda en borrador |
| Asistencia | Dos clases por semana en cada curso durante 8 semanas (192 clases). Promedio cercano a 88 %, con una leve mejora semana a semana. **9 estudiantes** quedan entre 60 y 75 %: aparecen «en riesgo» |
| Tareas | 9 por curso: una práctica semanal ya vencida (8) y una que vence en 5 días. La mayoría se entregó a tiempo, algunas tarde y otras sin entregar. Lo de más de una semana está calificado con comentario; lo de esta semana espera al docente |
| Exámenes | 1 por curso, abierto hasta dentro de 3 días, con preguntas de selección y una de respuesta corta. La mayoría ya lo presentó (algunos dos veces); las respuestas cortas de los últimos 4 días están **por revisar** |
| Notas | Libro de calificaciones con Tareas 40 % y Exámenes 60 %, visible para cada estudiante |
| Cobros | Inscripción y tres mensualidades por estudiante de grupo (vencen el día 15). Cerca del 80 % pagado, con pagos parciales y mensualidades vencidas |
| Admisiones | 25 solicitudes en todas las etapas; 6 ya convertidas en estudiantes |
| Avisos y notificaciones | 6 avisos (bienvenida, laboratorio, charla, feria de empleo, recordatorio de pago, reunión de docentes) y notificaciones de tareas, notas, exámenes, cobros y entregas por revisar |
| Horario y clases en vivo | Horario semanal de cada curso y 2–3 clases en vivo por curso; siempre hay una en las próximas horas |
| Catálogo | Primeros Auxilios (RD$3,500), Excel para la Oficina (RD$2,500) y Mercadeo Digital (RD$2,800) en el catálogo público; 4 pedidos pagados y 2 reseñas de Excel |
| Certificados y retiros | 4 estudiantes terminaron Excel (3 con certificado emitido y 1 por emitir). Un estudiante se retiró de Matemática Financiera con su motivo |

## Cuentas para entrar

Todas con la contraseña que pusiste en `DEMO_PASSWORD`.

| Rol | Nombre | Correo | Para mostrar |
|---|---|---|---|
| Dirección (administración) | Margarita Rosario Díaz | `directora@demo.edukana.do` | Tablero, personas, cobros, admisiones, reportes |
| Coordinación | Francisco Taveras Gil | `coordinacion@demo.edukana.do` | Programas, grupos, estudiantes en riesgo, admisiones |
| Docente de Enfermería | Rosa Almonte Guzmán | `rosa.almonte@demo.edukana.do` | Anatomía y Fisiología Básica (58 estudiantes) |
| Docente de Contabilidad | Ramón Peña Castillo | `ramon.pena@demo.edukana.do` | Contabilidad Básica y Legislación Tributaria |
| Docente de Matemática y Excel | Yokasta Féliz Matos | `yokasta.feliz@demo.edukana.do` | Excel (certificados) y Matemática Financiera (retiro) |
| Docente de Mercadeo | Lissette Marte Cabral | `lissette.marte@demo.edukana.do` | Curso con video y en el catálogo; clase en vivo hoy |
| Docente de Electricidad | Domingo Antonio Severino | `domingo.severino@demo.edukana.do` | Electricidad Residencial |
| Estudiante destacada | Ana Mercedes Reyes | `ana.reyes@demo.edukana.do` | Enfermería Mañana + Servicio al Turista + Excel con certificado |
| Estudiante en riesgo | Yaritza Mejía Lora | `yaritza.mejia@demo.edukana.do` | Asistencia baja, tareas sin entregar, cobro vencido |
| Estudiante de Contabilidad | José Miguel Fernández | `jose.fernandez@demo.edukana.do` | Contabilidad Noche + Mercadeo + Excel |
| Tutora (madre de Ana) | María Altagracia Reyes | `maria.reyes@demo.edukana.do` | Notas, asistencia y cuenta de su hija |
| Tutora (madre de Yaritza) | Mercedes Mejía Lora | `mercedes.mejia@demo.edukana.do` | Cómo ve la familia a una estudiante en riesgo |

Los otros docentes son `julio.ventura`, `milagros.concepcion`, `victor.liriano`, `fausto.then` y `yahaira.nolasco` (todos `@demo.edukana.do`).

## Guion de 10 minutos

**1. Dirección — 3 minutos** (`directora@…`)
1. Inicio: el tablero con asistencia promedio, avance, entregas a tiempo, estudiantes en riesgo y la tendencia de 8 semanas.
2. Estudiantes en riesgo: abre a Yaritza Mejía Lora y muestra el motivo (asistencia, avance, tareas vencidas).
3. Cobros: lo cobrado del mes, los pagos parciales y las mensualidades vencidas. Abre un recibo.
4. Admisiones: el embudo de 25 solicitudes y una ya convertida en estudiante.

**2. Coordinación — 1 minuto** (`coordinacion@…`)
1. Programas y grupos: Enfermería con sus tandas Mañana y Tarde, cada una con sus 3 cursos.
2. Reportes: docentes con entregas por calificar.

**3. Docente — 3 minutos** (`rosa.almonte@…` o `lissette.marte@…`)
1. Inicio del docente: entregas por revisar de esta semana y la clase en vivo próxima.
2. Curso → Tareas → «Práctica semana 8»: califica una entrega con comentario.
3. Exámenes → resultados: revisa una respuesta corta pendiente y pon sus puntos.
4. Asistencia: toma la de hoy o muestra la de la semana pasada.
5. Calificaciones: el libro con Tareas 40 % y Exámenes 60 %.

**4. Estudiante — 2 minutos** (`ana.reyes@…`, y si hay tiempo `yaritza.mejia@…`)
1. Inicio: la tarea que vence en 5 días, el examen abierto y la clase en vivo.
2. Una lección con video y marcar avance.
3. Mis notas y Mis certificados (el de Excel).
4. Con Yaritza: cómo se ve un estudiante atrasado y con un cobro vencido.

**5. Familia — 1 minuto** (`maria.reyes@…`)
1. Notas, asistencia y estado de cuenta de su hija, sin poder cambiar nada.

## Cómo cargarla en staging, paso a paso

Necesitas una computadora con el proyecto descargado y Node.js 22. Si nunca has usado la terminal, pide ayuda solo para los pasos 1 y 2; el resto es copiar y pegar.

1. **Abre la terminal en la carpeta del proyecto** (la carpeta `edukana`).
2. **Instala lo necesario** (solo la primera vez):
   ```
   npm install
   ```
3. **Busca la dirección de la base de staging.** En Vercel: proyecto Edukana → *Settings* → *Environment Variables* → entorno de staging/Preview → copia el valor de `DIRECT_URL` (si no existe, el de `DATABASE_URL`). Empieza con `postgresql://`. Copia también `CERTIFICATE_SECRET` (o, si no existe, `AUTH_SECRET`) del mismo entorno: sin ella los certificados no se emiten.
4. **Elige la contraseña de la demo** (al menos 8 caracteres). No la escribas en ningún archivo del proyecto.
5. **Ejecuta el comando**, cambiando lo que está entre comillas por lo que copiaste:

   En Mac o Linux:
   ```
   DATABASE_URL="postgresql://…" CERTIFICATE_SECRET="…" DEMO_PASSWORD="…" DEMO_CONFIRM=crear-demo npm run demo:seed
   ```
   En Windows (PowerShell):
   ```
   $env:DATABASE_URL="postgresql://…"; $env:CERTIFICATE_SECRET="…"; $env:DEMO_PASSWORD="…"; $env:DEMO_CONFIRM="crear-demo"; npm run demo:seed
   ```
6. **Revisa la línea «Base de datos: …»** que aparece en pantalla. Debe ser el servidor de staging. Tienes 5 segundos: si no es la correcta, pulsa **Ctrl + C** y no se hace nada.
7. **Espera a que diga «Listo».** Muestra cuánto tardó, cuántos registros creó de cada tipo y la tabla de cuentas (sin contraseña).

### Si ya estaba cargada

Volver a ejecutar el comando no duplica nada: dice que ya existe y termina. Para borrarla y crearla de nuevo con fechas de hoy, agrega `DEMO_RESET=1`:

```
DATABASE_URL="postgresql://…" CERTIFICATE_SECRET="…" DEMO_PASSWORD="…" DEMO_CONFIRM=crear-demo DEMO_RESET=1 npm run demo:seed
```

## Cómo quitarla

```
DATABASE_URL="postgresql://…" DEMO_CONFIRM=borrar-demo npm run demo:remove
```

En Windows: `$env:DATABASE_URL="postgresql://…"; $env:DEMO_CONFIRM="borrar-demo"; npm run demo:remove`

Borra en una sola operación «Instituto Técnico Demo» con todo su contenido y las cuentas `@demo.edukana.do` que no pertenezcan a ninguna otra institución. Si alguien agregó una de esas cuentas a otra institución, esa cuenta se queda. Si algo falla, no se borra nada.

## Problemas frecuentes

| Mensaje | Qué hacer |
|---|---|
| «Para crear la institución de demostración escribe DEMO_CONFIRM=crear-demo…» | Falta `DEMO_CONFIRM=crear-demo` (o `borrar-demo` para quitarla) en el comando. Es a propósito: evita cargarla por accidente. |
| «Falta DEMO_PASSWORD…» | Agrega `DEMO_PASSWORD="…"` con al menos 8 caracteres. |
| «Falta DATABASE_URL o no es una dirección válida» | Revisa que copiaste la dirección completa, entre comillas. También puedes escribirla en el archivo `.env` de la carpeta del proyecto. |
| «… ya existe en esta base. No se creó nada» | Ya estaba cargada. Úsala, o agrega `DEMO_RESET=1` para recrearla con fechas de hoy. |
| «No se emitieron los certificados porque falta CERTIFICATE_SECRET» | Todo lo demás quedó cargado. Recárgala con `DEMO_RESET=1` y la clave del paso 3, o emite los certificados desde la pantalla de certificados del curso de Excel. |
| «No se pudo completar» | Lo que se alcanzó a crear se borró solo y las demás instituciones no se tocaron. Copia el mensaje y compártelo con el equipo técnico. |

## Para el equipo técnico

- Código: `scripts/demo/seed-demo.ts` (línea de comandos), `scripts/demo/demo-seed.ts` (crear y quitar) y `scripts/demo/content/**` (personas, admisiones y contenido de los cursos).
- Todo se arma en memoria y se escribe por lotes (`createMany`) con los mismos campos que dejan las funciones de `src/server/**`: columna del libro de calificaciones por tarea y examen, copia de cada pregunta en el examen (`questionSnapshot`), puntaje automático con `autoScoreAnswer`, video normalizado con `normalizeLessonVideo`, avance con `progressPercentage`, estado y `paidAt` de cada cobro según sus pagos, certificados con `createCertificateIdentity`. Solo los dos períodos pasan por `createPeriod`. Ningún paso envía correos.
- Los repartos de notas, asistencia y pagos salen de un azar con semilla fija.
- La prueba `tests/integration/demo-seed.test.ts` la carga contra la base de integración y revisa conteos, distribución (asistencia, riesgo, tendencia, entregas, cobros), que tarda menos de 60 s, que repetirla no duplica ninguna tabla y que quitarla no deja ninguna fila de la institución demo y deja intactas las instituciones A y B.
