# Institución de demostración

Para mostrar Edukana sin usar datos reales hay una institución de demostración, **«Instituto Técnico Demo»**, que se carga en la base de staging con un solo comando y se quita con otro.

- Crea **una sola institución nueva**. No cambia ni borra nada de las demás instituciones que ya están en staging.
- Todas las cuentas usan correos `@demo.edukana.do` y **la misma contraseña**, que el comando muestra al final.
- Las fechas se calculan desde el día en que se carga: el cuatrimestre «va por la semana 7», hay tareas vencidas, exámenes abiertos y clases en vivo en los próximos días.

## Qué crea

| Qué | Detalle |
|---|---|
| Personas | Directora (administración), coordinador, 4 docentes, 40 estudiantes y 6 madres, padres o tutores vinculados a un estudiante |
| Períodos | El cuatrimestre actual (empezó hace 7 semanas) y el anterior |
| Programas | **Técnico en Enfermería** (Anatomía y Fisiología Básica, Fundamentos de Enfermería, Primeros Auxilios) y **Técnico en Contabilidad** (Contabilidad Básica, Matemática Financiera, Legislación Tributaria Dominicana) |
| Curso suelto | **Excel para la Oficina**, los sábados |
| Grupos | «Enfermería 2026 — Mañana» (18 estudiantes) y «Contabilidad 2026 — Noche» (16), con el año en curso |
| Contenido | Cada curso tiene 3 capítulos con 3 lecciones de texto, actividades, guías y videos educativos de YouTube. Una lección queda en borrador para mostrar cómo se prepara antes de publicarla |
| Tareas | 2 por curso: una ya vencida (con entregas a tiempo, tarde, sin entregar y casi todas calificadas con comentario) y otra que vence en 6 días |
| Exámenes | 1 por curso, con 7 preguntas, abierto hasta dentro de 4 días; la mayoría de los estudiantes ya lo presentó (algunos dos veces) |
| Notas | Libro de calificaciones con Tareas 40 % y Exámenes 60 %; hay estudiantes destacados, regulares, atrasados y en riesgo |
| Asistencia | 6 semanas por curso, con tardanzas, ausencias y excusas |
| Horario y clases en vivo | Horario semanal de cada curso y clases en vivo programadas para los próximos días |
| Avisos | Bienvenida a toda la institución, aviso de una docente a sus cursos, charla para Contabilidad y recordatorio de pago a estudiantes y tutores |
| Certificados | 2 estudiantes terminaron Excel y tienen su certificado emitido |
| Cobros | Mensualidad del mes pasado y del mes actual para cada grupo, y el pago del curso de Excel: pagos completos, pagos parciales y cuentas vencidas |
| Admisiones | 5 solicitudes, cada una en una etapa: interesada, documentos, revisión, aceptada y no continúa |
| Catálogo | Primeros Auxilios (RD$3,500) y Excel para la Oficina (RD$2,500) aparecen en el catálogo público |
| Un retiro | Un estudiante se retiró de Matemática Financiera, con su motivo |

## Cuentas para entrar

Todas con la contraseña que muestra el comando al terminar.

| Rol | Nombre | Correo |
|---|---|---|
| Administración | Margarita Rosario Díaz | `directora@demo.edukana.do` |
| Coordinación | Francisco Taveras Gil | `coordinacion@demo.edukana.do` |
| Docente (Enfermería) | Rosa Almonte Guzmán | `rosa.almonte@demo.edukana.do` |
| Docente (Primeros Auxilios) | Julio César Ventura | `julio.ventura@demo.edukana.do` |
| Docente (Contabilidad) | Ramón Peña Castillo | `ramon.pena@demo.edukana.do` |
| Docente (Matemática y Excel) | Yokasta Féliz Matos | `yokasta.feliz@demo.edukana.do` |
| Estudiante destacada | Ana Mercedes Reyes | `ana.reyes@demo.edukana.do` |
| Estudiante en riesgo | Yaritza Mejía Lora | `yaritza.mejia@demo.edukana.do` |
| Estudiante de Contabilidad | José Miguel Fernández | `jose.fernandez@demo.edukana.do` |
| Tutora (madre de Ana) | María Altagracia Reyes | `maria.reyes@demo.edukana.do` |

## Cómo cargarla en staging, paso a paso

Necesitas una computadora con el proyecto descargado y Node.js 22. Si nunca has usado la terminal, pide ayuda solo para los pasos 1 y 2; el resto es copiar y pegar.

1. **Abre la terminal en la carpeta del proyecto** (la carpeta `edukana`).
2. **Instala lo necesario** (solo la primera vez):
   ```
   npm install
   ```
3. **Busca la dirección de la base de staging.** En Vercel: proyecto Edukana → *Settings* → *Environment Variables* → entorno de staging/Preview → copia el valor de `DIRECT_URL` (si no existe, el de `DATABASE_URL`). Empieza con `postgresql://`. Copia también `CERTIFICATE_SECRET` (o, si no existe, `AUTH_SECRET`) del mismo entorno: sin ella los certificados no se emiten.
4. **Ejecuta el comando**, cambiando lo que está entre comillas por lo que copiaste:

   En Mac o Linux:
   ```
   DATABASE_URL="postgresql://…" CERTIFICATE_SECRET="…" DEMO_CONFIRM=crear-demo npm run demo:seed
   ```
   En Windows (PowerShell):
   ```
   $env:DATABASE_URL="postgresql://…"; $env:CERTIFICATE_SECRET="…"; $env:DEMO_CONFIRM="crear-demo"; npm run demo:seed
   ```
5. **Revisa la línea «Base de datos: …»** que aparece en pantalla. Debe ser el servidor de staging. Tienes 5 segundos: si no es la correcta, pulsa **Ctrl + C** y no se hace nada.
6. **Espera a que diga «Listo».** Tarda entre 3 y 15 minutos según la conexión.
7. **Guarda la contraseña y la tabla de cuentas** que aparecen al final. Con ellas entras a staging.

Si quieres elegir tú la contraseña, agrega `DEMO_PASSWORD="LaQueQuieras2026"` al comando (al menos 8 caracteres).

### Si ya estaba cargada

Volver a ejecutar el comando no duplica nada: dice que ya existe y termina. Para borrarla y crearla de nuevo con fechas de hoy, agrega `DEMO_RESET=1`:

```
DATABASE_URL="postgresql://…" CERTIFICATE_SECRET="…" DEMO_CONFIRM=crear-demo DEMO_RESET=1 npm run demo:seed
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
| «Falta DATABASE_URL o no es una dirección válida» | Revisa que copiaste la dirección completa, entre comillas. También puedes escribirla en el archivo `.env` de la carpeta del proyecto. |
| «… ya existe en esta base. No se creó nada» | Ya estaba cargada. Úsala, o agrega `DEMO_RESET=1` para recrearla. |
| «No se emitieron los certificados porque falta CERTIFICATE_SECRET» | Todo lo demás quedó cargado. Recárgala con `DEMO_RESET=1` y la clave del paso 3, o emite los dos certificados desde la pantalla de certificados del curso de Excel. |
| Tarda mucho | La dirección tiene `connection_limit=1` (la que usa la aplicación en Vercel) y el comando va de uno en uno. Usa `DIRECT_URL`, que permite varias operaciones a la vez. |
| «No se pudo completar» | Lo que se alcanzó a crear se borró solo y las demás instituciones no se tocaron. Copia el mensaje y compártelo con el equipo técnico. |

## Para el equipo técnico

- Código: `scripts/demo/seed-demo.ts` (línea de comandos), `scripts/demo/demo-seed.ts` (crear y quitar) y `scripts/demo/content/**` (personas y contenido de los cursos).
- Casi todo se crea con las funciones de `src/server/**` que usan las pantallas (personas, períodos, cursos, contenido, inscripciones, tareas, entregas, notas, exámenes e intentos, asistencia, clases en vivo, cobros y pagos, admisiones, retiros y certificados). Se escribe directo en la base solo lo que no tiene función propia: horario, avisos, tutores, catálogo y el avance de lecciones (en bloque, con el mismo cálculo de porcentaje que `setLessonCompleted`).
- Los resultados son reproducibles: el reparto de notas, asistencia y pagos sale de un azar con semilla fija.
- La prueba `tests/integration/demo-seed.test.ts` la carga contra la base de integración, revisa conteos y aislamiento, que repetirla no duplica y que quitarla deja intactas las instituciones A y B.
