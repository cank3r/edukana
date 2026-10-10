# Institución de demostración

Para mostrar Edukana sin usar datos reales hay una institución de demostración, **«Instituto Técnico Demo»**, preparada para una base de pruebas aislada, cuyo destino debe verificarse antes de cargarla.

- Crea **una institución de demostración**. Usarla únicamente en una base ficticia dedicada verificada; también inserta planes globales faltantes y gestiona identidades demo.
- Las cuentas nuevas usan correos `@demo.edukana.do` y una contraseña de demo suministrada de forma segura. Identidades preexistentes compartidas conservan su contraseña; no reutilizar esta demo en una base con datos reales. El comando no muestra la contraseña ni la guarda en Git.
- Las fechas se calculan desde el día en que se carga: el cuatrimestre «va por la semana 9», con ocho semanas de clases, tareas, notas y asistencia ya tomadas, un examen abierto y clases en vivo en los próximos días. Si la demo se muestra semanas después, planificar su renovación en la base desechable; un reset destruye la demo anterior y requiere autorización explícita.
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

Las cuentas creadas en una base ficticia nueva usan la contraseña de demo configurada mediante el mecanismo seguro del entorno. No compartirla por chat.

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

## Destino seguro antes de cargarla

El cargador público ahora falla cerrado antes de importar Prisma, conectarse o iniciar la cuenta regresiva. El nombre «Preview» no demuestra aislamiento: primero se debe comprobar que ese entorno apunta a una base dedicada exclusivamente a la demo, distinta de cualquier base con datos reales.

### Preview de Vercel

Es el destino solicitado. Por ahora **ninguna base remota está aprobada**: `scripts/demo/approved-targets.ts` está vacío y el cargador rechazará todos los destinos remotos.

Antes de autorizar una entrada se debe verificar, sin compartir contraseñas ni URLs de conexión:

1. Proyecto o rama de base de datos dedicado a datos ficticios, con referencia no secreta y responsable identificado.
2. Asociación explícita del entorno Preview correcto a esa base; comprobar que no hereda la conexión de producción.
3. Identidad de cada conexión de Prisma: host, puerto, nombre de base, usuario/rol y schema. Un pooler compartido requiere identificar también el tenant mediante su usuario. DATABASE_URL y DIRECT_URL pueden tener endpoints distintos, pero ambos deben figurar en la misma entrada aprobada.
4. Migraciones requeridas y permiso específico de carga. La aprobación del guard no aplica migraciones ni carga datos.

La entrada revisada contiene solo esos identificadores, nunca contraseñas, claves o URLs. El CLI exige `DEMO_TARGET=isolated-preview`, `DEMO_TARGET_ID` de una entrada aprobada, TLS y coincidencia exacta de ambos endpoints. Ninguna variable de entorno puede agregar una entrada a la allowlist. No cambiar variables Vercel ni crear credenciales como parte de este paso de código.

### Base local desechable

Se admite `DEMO_TARGET=isolated-local` únicamente con host localhost, 127.0.0.1 o ::1 y nombre `edukana_demo_*`; ambas conexiones deben coincidir. Esto es una barrera contra accidentes, **no prueba de aislamiento físico**: un puerto local podría ser un túnel. Verificar su origen antes de cualquier carga. No se ha instalado ni creado una base local en esta entrega.

Ambos modos rechazan NODE_ENV=production o VERCEL_ENV=production, protocolos ajenos a PostgreSQL y parámetros que alteren el host/ruta. Se conserva DEMO_CONFIRM para crear o quitar, y una contraseña de demo suministrada por el mecanismo seguro del entorno; nunca enviarla por chat o guardarla en Git. No se ejecutó ninguna carga o reset.

### Repetición, alcance y borrado

- Repetir el CLI sin reset no duplica la demo. Una demo antigua sin suscripción requiere revisión aparte: el retorno temprano del CLI no ejecuta la reparación idempotente disponible en la función interna.
- Reset y remove son destructivos y requieren autorización separada. Reset borra antes de recrear; no ofrece recuperación si la nueva carga falla.
- El seed inserta planes globales faltantes, reutiliza identidades del dominio demo y puede actualizar identidades exclusivas de esa demo. La limpieza también contempla identidades huérfanas del dominio demo. Por ello este código solo debe ejecutarse en la base ficticia dedicada verificada, nunca como aislamiento suficiente dentro de una base real compartida.
- El guard protege el **CLI público**. Las funciones internas createDemo/removeDemo utilizadas por pruebas de integración no incorporan este guard y no son una ruta alternativa para saltarlo.
- Si algo falla, revisar el estado real antes de repetir: el error no garantiza que la limpieza haya terminado.

## Para el equipo técnico

- Código: `scripts/demo/seed-demo.ts` (línea de comandos), `scripts/demo/demo-seed.ts` (crear y quitar) y `scripts/demo/content/**` (personas, admisiones y contenido de los cursos).
- Todo se arma en memoria y se escribe por lotes (`createMany`) con los mismos campos que dejan las funciones de `src/server/**`: columna del libro de calificaciones por tarea y examen, copia de cada pregunta en el examen (`questionSnapshot`), puntaje automático con `autoScoreAnswer`, video normalizado con `normalizeLessonVideo`, avance con `progressPercentage`, estado y `paidAt` de cada cobro según sus pagos, certificados con `createCertificateIdentity`. Solo los dos períodos pasan por `createPeriod`. Ningún paso envía correos.
- Los repartos de notas, asistencia y pagos salen de un azar con semilla fija.
- La prueba `tests/integration/demo-seed.test.ts` la carga contra la base de integración y revisa conteos, distribución (asistencia, riesgo, tendencia, entregas, cobros), que tarda menos de 60 s, que repetirla no duplica ninguna tabla y que quitarla no deja ninguna fila de la institución demo y deja intactas las instituciones A y B.
