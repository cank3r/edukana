# Blueprint funcional detallado de Edukana

**Estado:** documento rector de producto y ejecución
**Alcance:** plataforma integral para instituciones educativas
**Referentes:** Moodle LMS, Moodle Workplace y Google Classroom
**Principio de terminado:** una capacidad solo está terminada cuando un usuario real completa el recorrido en un entorno desplegado, con autenticación, persistencia, permisos, archivos, auditoría y experiencia utilizable.

---

## 1. Qué debe ser Edukana

Edukana no es solo un aula virtual ni un módulo de anuncios. Es el sistema donde una institución puede:

1. Configurar su identidad, estructura, períodos, sedes, departamentos y reglas.
2. Captar, admitir, inscribir y matricular estudiantes.
3. Crear programas, niveles, cohortes, cursos, grupos y horarios.
4. Definir cómo ocurre cada clase: presencial, virtual, híbrida o asincrónica.
5. Preparar el contenido de cada sesión, publicarlo y reutilizarlo.
6. Permitir que el estudiante sepa qué tiene hoy, qué debe entregar y cómo va.
7. Recibir tareas, realizar evaluaciones, registrar asistencia y calificar.
8. Comunicar avisos, cambios, recordatorios y conversaciones por curso.
9. Dar a tutores una vista estrictamente autorizada de sus estudiantes.
10. Gestionar cobros administrativos sin procesar tarjetas en la primera etapa.
11. Emitir certificados, reportes y evidencia académica.
12. Operar múltiples instituciones con marca, datos y permisos aislados.

## 2. Leyenda de estado

- **IMPLEMENTADO:** existe modelo, servidor e interfaz funcional comprobados localmente.
- **PARCIAL:** existe una parte funcional, pero faltan casos normales, configuración o recorrido desplegado.
- **PLANIFICADO:** está documentado, pero todavía no existe como flujo utilizable.
- **DIFERIDO:** se reserva para una etapa posterior y no bloquea el piloto inicial.

## 3. Principios transversales

### 3.1 Aislamiento institucional

- Toda entidad de negocio pertenece a una institución.
- La institución se deriva de la sesión, nunca de un valor confiado al navegador.
- No se aceptan referencias a usuarios, cursos, archivos o grupos de otro tenant.
- Los accesos cruzados deben responder como inexistentes o no autorizados sin revelar datos.

### 3.2 Permisos

- Denegación por defecto.
- Separación entre ver, crear, administrar, publicar, calificar y exportar.
- Alcance por institución, unidad, programa, cohorte, curso, grupo y recurso cuando corresponda.
- La navegación oculta lo no autorizado, pero la decisión real siempre se repite en servidor.
- Toda elevación o reducción sensible queda auditada.

### 3.3 Experiencia

- Cada rol ve qué debe hacer ahora.
- Una acción primaria por pantalla.
- Las tareas próximas y vencidas se muestran primero.
- Las acciones masivas permiten previsualizar el impacto antes de confirmar.
- Móvil y teclado no son adaptaciones posteriores: forman parte del criterio de aceptación.

### 3.4 Estados y trazabilidad

- Los estados deben ser explícitos y no inferirse solo por la existencia de registros.
- Los cambios sensibles registran actor, fecha, antes, después y motivo.
- Borrar datos académicos históricos no es una operación normal; se archivan, anulan o revocan.
- Fechas y horas se guardan con zona horaria definida por institución.

---

# 4. Plataforma, tenants y marca blanca

## Estado actual — PARCIAL

Existe:

- Institución con nombre, slug, tipo, dominio, zona horaria, idioma, plan y configuración JSON.
- Aislamiento por `institutionId` en el núcleo académico.
- Alta inicial de la primera institución.
- Tipos generales de institución.

Falta:

- Consola del operador de Edukana.
- Aprovisionamiento repetible de nuevos espacios.
- Estados del tenant: prueba, activo, suspendido, archivado.
- Límites por plan y módulos habilitados.
- Dominio personalizado validado.
- Marca completa: logos, colores, tipografía, correos y documentos.
- Soporte auditado y suplantación temporal controlada.

## Se agregará

### Datos

- `TenantLifecycle`: estado, fecha de activación, suspensión y motivo.
- `TenantBrand`: logos, favicon, colores, tipografía y nombre visible.
- `TenantDomain`: dominio, estado DNS, certificado y dominio principal.
- `TenantModule`: módulo, habilitado, límites y procedencia del plan.
- `TenantSubscription`: plan comercial y límites, sin integrar cobro automático todavía.

### Pantallas

- Consola del operador.
- Asistente para crear institución.
- Configuración de marca y dominio.
- Módulos y límites.
- Historial de soporte y auditoría.

### Criterio E2E

El operador crea una institución nueva, aplica marca y módulos, invita a su administrador y confirma que ningún dato es visible desde otro tenant.

---

# 5. Identidad, usuarios y ciclo de vida

## Estado actual — PARCIAL

Existe:

- Login con correo y contraseña.
- Roles de administrador, coordinación, docente, estudiante y tutor.
- Creación individual de usuarios desde la puesta en marcha.
- Estados activo, inactivo y suspendido en el modelo.
- Sesiones y cuentas de proveedores preparadas en el esquema.

Falta:

- Invitaciones por correo.
- Recuperación de contraseña.
- Verificación de correo.
- Importación masiva.
- Autorregistro configurable.
- OAuth/SSO y MFA.
- Una identidad global con membresías en varias instituciones.
- Gestión completa de perfil y preferencias.

## Se agregará

### Datos

- Invitación con token, vencimiento, rol y alcance.
- Membresía institucional separada de identidad global.
- Métodos de autenticación por tenant.
- Preferencias: idioma, zona horaria, canales y accesibilidad.
- Historial de estado de cuenta y cierre de sesiones.

### Pantallas y acciones

- Invitar una o varias personas.
- Importar CSV con previsualización, validación y reporte por fila.
- Restablecer contraseña sin revelar si el correo existe.
- Suspender/reactivar y cerrar sesiones activas.
- Perfil propio y cambio de contraseña.
- Configuración posterior de Google/Microsoft SSO y MFA.

### Criterio E2E

Un administrador importa 100 usuarios, corrige errores antes de confirmar, invita cuentas válidas, suspende una y verifica que acceso y sesiones quedan cortados inmediatamente.

---

# 6. Personas, perfiles y estructura organizacional

## Estado actual — PARCIAL

Existe:

- Usuarios con nombre, correo, teléfono, avatar, rol y estado.
- Departamentos/unidades y miembros.
- Vínculos explícitos tutor–estudiante.

Falta:

- Directorio administrable y filtros.
- Perfiles académicos y de personal.
- Campos personalizados.
- Jerarquía completa de sedes, departamentos y puestos.
- Responsables y equipos.
- Contactos de emergencia y documentos personales.

## Se agregará

- Persona separada de credencial de acceso cuando sea necesario.
- Sedes, departamentos, puestos, responsables y equipos.
- Perfil de estudiante: matrícula, programa, cohorte, estado y contactos.
- Perfil de docente: especialidades, carga y disponibilidad.
- Campos personalizados por tipo de institución.
- Documentos privados con vencimiento y permisos.
- Historial de cambios y exportación autorizada.

### Criterio E2E

La administración crea una sede, un departamento y un puesto; asigna un docente y limita una comunicación a esa unidad sin exponer miembros a usuarios no autorizados.

---

# 7. Estructura académica

## Estado actual — PARCIAL

Existe:

- Períodos académicos.
- Cursos asociados a período y docente.
- Secciones de contenido dentro del curso.
- Matrícula del estudiante en el curso.

Falta:

- Año académico, programa, nivel, cohorte, asignatura y oferta diferenciados.
- Grupos de estudiantes dentro de una oferta.
- Prerrequisitos y créditos.
- Plantillas de estructura según colegio, universidad o instituto.
- Copiar oferta a un período nuevo.

## Se agregará

### Jerarquía para instituto

- Programa.
- Plan o versión curricular.
- Nivel, módulo o período sugerido.
- Cohorte.
- Asignatura o curso reusable.
- Oferta concreta del curso para un período.
- Grupo/sección de estudiantes.
- Docentes principales y asistentes.

### Reglas

- Un curso reusable conserva descripción y materiales base.
- La oferta define fechas, docentes, capacidad, modalidad y grupos.
- Los cambios de una plantilla no alteran automáticamente ofertas históricas.
- La finalización y calificación pertenecen a la matrícula de la oferta.

### Criterio E2E

La administración crea un programa de tres niveles, abre una cohorte, genera sus ofertas y matricula estudiantes en un grupo sin duplicar manualmente la estructura.

---

# 8. Clases, sesiones, modalidad y horario híbrido

Este dominio expresa el nivel de detalle operativo requerido.

## Estado actual — PARCIAL

Existe `ScheduleSlot` con:

- Curso.
- Docente.
- Día de la semana.
- Hora de inicio y fin.
- Aula como texto.
- Fechas opcionales de vigencia.
- Prevención básica de conflictos de docente y aula.

No existe todavía una sesión pedagógica individual ni modalidades diferenciadas.

## Se agregará

## 8.1 Modalidades

Cada patrón o sesión admite:

- `PRESENCIAL`: requiere sede y aula o ubicación.
- `VIRTUAL_EN_VIVO`: requiere proveedor y enlace o sala virtual.
- `HIBRIDA`: combina aula y acceso virtual simultáneo.
- `ASINCRONICA`: no requiere presencia a una hora concreta; tiene ventana de disponibilidad.
- `PRACTICA`: laboratorio, taller o trabajo de campo.
- `EVALUACION`: examen o actividad sincrónica.
- `EVENTO`: orientación, tutoría, presentación u otra sesión académica.

## 8.2 Patrón recurrente

Un patrón de horario define:

- Oferta y grupo.
- Docente o docentes responsables.
- Día de la semana.
- Hora y duración.
- Zona horaria.
- Fecha inicial y final.
- Frecuencia semanal o quincenal.
- Modalidad predeterminada.
- Sede, edificio y aula.
- Proveedor virtual y sala o enlace.
- Capacidad presencial.
- Requiere asistencia o no.
- Política de entrada: acceso antes del inicio y cierre posterior.

Ejemplo:

- Lunes, 08:00–10:00, presencial, aula A-203.
- Miércoles, 18:00–19:30, virtual en vivo, sala del curso.
- Viernes, actividad asincrónica disponible durante 24 horas.

## 8.3 Sesión concreta

El sistema materializa sesiones individuales a partir del patrón. Cada sesión guarda:

- Fecha y horas reales.
- Modalidad efectiva, que puede diferir del patrón.
- Estado: programada, confirmada, en curso, completada, cancelada o reprogramada.
- Título y objetivo pedagógico.
- Temas que se cubrirán.
- Lecciones, materiales, tareas o evaluaciones vinculadas.
- Preparación previa requerida.
- Trabajo posterior.
- Aula/ubicación efectiva.
- Enlace virtual y proveedor efectivo.
- Grabación y fecha de disponibilidad.
- Docente sustituto o co-docentes.
- Notas privadas del docente.
- Resumen visible para estudiantes.
- Control de asistencia.
- Motivo de cambio o cancelación.

## 8.4 Excepciones

- Cambiar solo una sesión de presencial a virtual.
- Reprogramar fecha u hora.
- Cambiar aula o docente.
- Cancelar por feriado o incidencia.
- Añadir sesión extraordinaria.
- Aplicar un cambio a esta sesión, a futuras sesiones o a todo el patrón.
- Notificar únicamente a participantes afectados.
- Conservar historial anterior para auditoría.

## 8.5 Contenido de la clase

En cada sesión el docente puede preparar:

- Objetivos.
- Agenda por bloques de tiempo.
- Lecciones y páginas.
- Presentación, documento, imagen, audio o video.
- Enlace externo.
- Actividad interactiva.
- Pregunta rápida o encuesta.
- Tarea que abre al finalizar.
- Evaluación asociada.
- Recursos solo para docentes.
- Recursos que se publican antes, durante o después de la sesión.

## 8.6 Experiencia del estudiante

La tarjeta de próxima clase muestra:

- Curso y grupo.
- Día, hora y zona horaria.
- Presencial, virtual, híbrida o asincrónica.
- Aula con sede o botón “Entrar a clase”.
- Cuenta regresiva y estado.
- Material de preparación.
- Objetivos y temas.
- Actividades que vencen.
- Cambio reciente o cancelación.
- Grabación y materiales posteriores cuando estén disponibles.

## 8.7 Asistencia por modalidad

- Presencial: registro manual, lista rápida o código temporal posterior.
- Virtual: entrada a sala como evidencia auxiliar, nunca como única verdad.
- Híbrida: estado más modo de asistencia presencial/remota.
- Asincrónica: participación o actividad completada según regla configurada.
- Estados: presente, remoto, tarde, ausente, excusado y participación asincrónica.
- Corrección posterior con motivo y auditoría.

## 8.8 Conflictos

Validar:

- Docente en dos sesiones simultáneas.
- Aula ocupada.
- Grupo o estudiante en ofertas incompatibles.
- Capacidad del aula.
- Sede y tiempo de traslado configurable.
- Enlace o sala virtual reutilizada indebidamente cuando el proveedor lo prohíba.

## 8.9 Datos nuevos propuestos

- `Campus` y `Room`.
- `CourseOffering` y `StudentGroup`.
- `MeetingPattern`.
- `ClassSession`.
- `ClassSessionTeacher`.
- `ClassSessionResource`.
- `ClassSessionChange`.
- `VirtualRoom`.
- `ClassRecording`.
- `HolidayCalendar` y `ScheduleException`.

## 8.10 Pantallas

- Constructor semanal de horario.
- Calendario de oferta y calendario institucional.
- Editor de patrón recurrente.
- Panel de sesión individual.
- Acción rápida: cambiar a virtual, reprogramar o cancelar.
- Vista “Hoy” para docente y estudiante.
- Lista de asistencia específica de la sesión.
- Historial de cambios.

## 8.11 Permisos

- Ver horario propio.
- Ver horario institucional.
- Crear y modificar patrones.
- Cambiar una sesión.
- Gestionar salas virtuales.
- Publicar grabaciones.
- Registrar y corregir asistencia.
- Exportar horarios.

## 8.12 Criterio E2E

Una oferta se configura con lunes presencial y miércoles virtual. El estudiante ve aula el lunes y botón de acceso el miércoles. La administración cambia un lunes específico a virtual, todos reciben el cambio, la asistencia registra modalidad, el docente publica materiales y grabación, y las semanas posteriores conservan el patrón original.

---

# 9. Contenidos y constructor del curso

## Estado actual — IMPLEMENTADO/PARCIAL

Existe:

- Secciones y lecciones ordenadas.
- Tipos texto, video, documento y actividad.
- Publicación de secciones y lecciones.
- Archivos privados y video MP4/WebM.
- Progreso por lección.

Falta:

- Carpetas, páginas compuestas y libros con capítulos.
- Reutilización y copia de contenido.
- Versiones y programación de publicación.
- Contenido asociado a sesiones concretas.
- H5P, SCORM e IMS.
- Acceso condicionado.

## Se agregará

- Biblioteca de recursos institucional y por docente.
- Página enriquecida segura con bloques.
- Libro con capítulos y navegación.
- Carpetas y colecciones.
- Duplicar sección, lección o curso.
- Plantillas con control de versiones.
- Publicación programada y ventana de disponibilidad.
- Requisitos previos por fecha, grupo, nota o finalización.
- Visibilidad diferenciada por grupo o persona.
- Historial de versiones y restauración.

### Criterio E2E

Un docente copia una plantilla, adapta dos sesiones, programa la publicación y confirma que cada grupo ve solo el contenido que le corresponde en el momento definido.

---

# 10. Actividades colaborativas

## Estado actual — PLANIFICADO

Los anuncios y entregas cubren comunicación unidireccional y trabajo individual, pero no colaboración académica completa.

## Se agregará por prioridad

1. Comentarios privados en entregas.
2. Conversación contextual dentro del curso.
3. Pregunta rápida o consulta.
4. Foro con temas, respuestas, moderación y suscripción.
5. Encuesta de retroalimentación.
6. Entrega grupal.
7. Glosario colaborativo.
8. Wiki.
9. Taller de evaluación entre pares.

H5P, SCORM y LTI se añadirán después del núcleo propio.

### Criterio E2E

Un docente abre un foro para un grupo, modera una respuesta, recibe una entrega grupal y devuelve retroalimentación sin exponer conversaciones privadas a otros grupos.

---

# 11. Tareas, entregas y evaluación

## Estado actual — IMPLEMENTADO/PARCIAL

Existe:

- Tareas con instrucciones, vencimiento, puntuación y publicación.
- Entrega de texto y archivos privados.
- Calificación y retroalimentación textual.
- Exámenes con intentos y duración.
- Banco con opción múltiple, verdadero/falso y respuesta corta.
- Autocalificación objetiva y revisión manual.

## Se agregará

### Tareas

- Borrador, publicación programada y cierre.
- Entregas tardías según política.
- Reenvíos y número máximo de intentos.
- Entregas grupales.
- Formatos y límites configurables.
- Excepciones por estudiante o grupo.
- Anotaciones y archivos de devolución.
- Audio/video como retroalimentación posterior.

### Banco de preguntas

- Categorías, etiquetas, búsqueda y versiones.
- Importación y exportación.
- Numérica, ensayo, emparejamiento, ordenamiento, calculada y arrastrar/soltar.
- Estadísticas básicas de dificultad y discriminación cuando haya datos suficientes.

### Exámenes

- Apertura/cierre y contraseña opcional.
- Navegación libre, secuencial o por páginas.
- Aleatorización.
- Retroalimentación inmediata o diferida.
- Excepciones de tiempo e intentos.
- Publicación controlada de respuestas y notas.
- Safe Exam Browser como integración posterior; no se promete supervisión por cámara.

### Criterio E2E

El docente asigna una tarea diferenciada, el estudiante entrega y reenvía, el docente usa una rúbrica, publica la nota y el tutor ve únicamente el resultado autorizado.

---

# 12. Calificaciones, progreso, competencias y certificados

## Estado actual — IMPLEMENTADO/PARCIAL

Existe:

- Períodos y categorías ponderadas.
- Puntuaciones, retroalimentación y exenciones básicas.
- Publicación de períodos.
- Progreso por lecciones y finalización explícita del curso.
- Certificado verificable con revocación en el modelo.

## Se agregará

- Escalas cualitativas.
- Rúbricas y guías de evaluación.
- Fórmulas y ponderaciones configurables.
- Historial de notas y motivo de corrección.
- Importación y exportación.
- Recuperación y extraordinarios.
- Cierre de período con bloqueo y reapertura auditada.
- Boletín y récord académico.
- Reglas automáticas de finalización.
- Marcos de competencias y evidencias.
- Planes de aprendizaje individuales o por cohorte.
- Badges separados de certificados.
- Certificados diseñables y renovables en fase posterior.

### Criterio E2E

La institución cierra un período, genera boletín, corrige una nota mediante reapertura autorizada, conserva ambas versiones y actualiza el progreso sin alterar datos históricos.

---

# 13. Panel del estudiante y próximas actividades

## Estado actual — PARCIAL

Existe acceso a cursos, progreso, tareas, notas y horario básico. Falta una experiencia diaria consolidada.

## Se agregará

### Inicio “Hoy”

- Próxima clase con modalidad, aula o acceso virtual.
- Tareas próximas y vencidas.
- Evaluaciones abiertas.
- Material que debe revisar antes de clase.
- Anuncios relevantes.
- Cambios de horario y cancelaciones.
- Progreso de cursos.
- Acciones pendientes ordenadas por urgencia.

### Mis cursos

- Actuales, futuros, completados y archivados.
- Filtros por programa, período y estado.
- Continuar desde la última lección.
- Calendario y línea de tiempo.

### Criterio E2E

El estudiante entra sin conocer la navegación y puede identificar en menos de un minuto su próxima clase, cómo asistir, qué preparar y qué debe entregar.

---

# 14. Comunicación y notificaciones

## Estado actual — PARCIAL

Existe:

- Anuncios enriquecidos y segmentados.
- Menciones.
- Cursos relacionados.
- Imágenes y videos privados.

Falta:

- Bandeja de notificaciones.
- Correo transaccional.
- Preferencias de canal.
- Mensajería y conversaciones.
- Digest para tutores.
- Alertas por eventos académicos.

## Se agregará

- Notificación interna con leído/no leído.
- Reglas de evento: nueva tarea, cambio de horario, nota publicada, ausencia, anuncio y vencimiento.
- Correo inmediato o resumen configurable.
- Conversaciones uno-a-uno y por curso con políticas institucionales.
- Moderación, archivo y auditoría.
- Plantillas por institución.
- Preferencias de canal y horarios silenciosos.
- Push/PWA después de la bandeja interna.

### Criterio E2E

Al cambiar una sesión presencial a virtual, los afectados reciben notificación interna y correo, el enlace actualizado aparece en “Hoy” y ningún usuario ajeno al grupo recibe el mensaje.

---

# 15. Calendario institucional

## Estado actual — PARCIAL

Existe un evento básico y slots semanales, pero no un calendario conectado con todas las actividades.

## Se agregará

- Vista personal, curso, grupo e institución.
- Clases materializadas desde patrones.
- Tareas, exámenes, vencimientos y eventos.
- Feriados y cierres institucionales.
- Reprogramaciones y conflictos.
- Exportación iCal.
- Integración posterior con Google Calendar y Microsoft 365.
- Recordatorios y filtros por tipo.

### Criterio E2E

Una reprogramación actualiza calendario, panel “Hoy”, asistencia y notificaciones sin duplicar ni perder la sesión original.

---

# 16. Tutores y familias

## Estado actual — IMPLEMENTADO/PARCIAL

Existe:

- Vínculo pendiente, activo o revocado.
- Permisos independientes para académico, asistencia, horario, avisos y finanzas.
- Revocación inmediata.
- Aislamiento por estudiante y tenant.

## Se agregará

- Resumen de próximas actividades y pendientes.
- Preferencias y frecuencia del digest.
- Justificación de ausencias.
- Acuse o firma de comunicaciones.
- Descarga de boletines.
- Cobros del estudiante cuando esté autorizado.
- Multiplicidad de estudiantes e instituciones bajo una identidad global futura.

### Criterio E2E

Un tutor con dos estudiantes recibe información separada, confirma un aviso y justifica una ausencia sin acceder al aula, compañeros o datos institucionales restringidos.

---

# 17. Admisiones, inscripción y matrícula

## Estado actual — PARCIAL

Existe un lead básico y matrícula administrativa de estudiante en curso. No existe el embudo completo.

## Se agregará

- Formulario público configurable.
- Programas disponibles y períodos de admisión.
- Solicitud con documentos.
- Etapas, responsables y notas internas.
- Revisión, decisión y comunicación.
- Conversión de candidato aceptado en persona, usuario y estudiante.
- Inscripción a programa/cohorte.
- Matrícula individual y masiva en ofertas.
- Lista de espera y capacidad.
- Automatrícula opcional por código o enlace en fase posterior.

### Criterio E2E

Una persona solicita ingreso, adjunta documentos, es aceptada, crea su cuenta y queda matriculada sin duplicar datos ni requerir SQL o seed.

---

# 18. Cobros administrativos

## Decisión de alcance

En el MVP no se procesan tarjetas ni se integran pasarelas. Edukana registra y comunica obligaciones; la institución cobra por sus vías externas.

## Estado actual — PARCIAL

Existe concepto, monto, moneda, vencimiento, fecha de pago, estado y nota. Falta el flujo operativo completo.

## Se agregará

- Catálogo de conceptos.
- Generación individual y masiva por programa, cohorte, grupo o estudiante.
- Estados pendiente, pagado, vencido, exonerado y anulado.
- Marcado individual y masivo como pagado.
- Referencia, método externo, fecha, observación y actor.
- Corrección o reversión auditada.
- Estado de cuenta de estudiante y tutor autorizado.
- Instrucciones de pago: transferencia, depósito, caja o enlace externo.
- Filtros, totales y exportación.
- Recordatorios sin bloqueo académico automático por defecto.

## Diferido

- Tarjetas, pasarela, webhooks, pagos recurrentes, reembolsos, conciliación bancaria y facturación fiscal.

### Criterio E2E

La administración genera mensualidades para una cohorte, marca un lote pagado con referencia, corrige una operación y el tutor ve el estado actualizado y las vías externas de pago.

---

# 19. Reportes, analítica y registros

## Estado actual — PARCIAL

Existen cálculos y vistas puntuales, además de `AuditLog`. Falta una capa de reportes operable.

## Se agregará

- Reportes predefinidos de matrícula, asistencia, progreso, notas, actividad y cobros.
- Filtros por período, programa, cohorte, grupo y docente.
- Exportación CSV y PDF cuando corresponda.
- Programación de entrega posterior.
- Constructor de reportes en etapa avanzada.
- Indicadores de riesgo basados primero en reglas transparentes.
- Registro de accesos, acciones y participación.
- Métricas del operador sin mezclar datos identificables entre tenants.

### Criterio E2E

Coordinación filtra una cohorte, identifica ausencias y tareas vencidas, exporta el resultado y comprueba que un docente solo recibe datos de su alcance.

---

# 20. Integraciones y extensibilidad

## Estado actual — INICIAL

Existe almacenamiento Supabase y preparación de cuentas externas en el esquema. No existe una API pública ni ecosistema de extensiones.

## Se agregará en orden

1. Correo transaccional.
2. Google/Microsoft SSO.
3. Calendario Google/Microsoft.
4. Videoconferencia mediante Meet, Teams o BigBlueButton.
5. Importación/exportación institucional.
6. API versionada y webhooks firmados.
7. LTI.
8. SCORM 1.2.
9. H5P.
10. SDK o marketplace de extensiones cuando exista demanda real.

Toda integración tendrá secretos por tenant, scopes mínimos, estado de salud, auditoría y mecanismo de desconexión.

---

# 21. Móvil, accesibilidad e idiomas

## Estado actual — PARCIAL

La interfaz es adaptable y está principalmente en español. No existe aplicación móvil, offline ni certificación de accesibilidad.

## Se agregará

- Auditoría WCAG 2.2 AA de flujos críticos.
- Navegación completa por teclado y lectores de pantalla.
- Contraste, foco, errores y estados accesibles.
- Formatos locales de fecha, hora, moneda y nombres.
- Sistema real de traducciones.
- PWA con instalación y notificaciones.
- Caché offline limitada para contenido permitido.
- Aplicaciones nativas solo cuando el uso justifique el costo.

---

# 22. Privacidad, seguridad y operación

## Estado actual — PARCIAL

Existe aislamiento, autorización server-side, archivos privados, URLs firmadas, validaciones y auditoría básica.

## Se agregará

- Recuperación y rotación de secretos.
- Backups automáticos y restauración probada.
- Monitoreo, trazas, alertas y correlación de errores.
- Rate limiting y protección contra abuso.
- Políticas, consentimientos y aceptación versionada.
- Exportación y eliminación autorizada de datos.
- Retención por categoría.
- Registro de incidentes y acceso de soporte.
- Pruebas de carga y objetivos de disponibilidad.
- Runbooks de despliegue, rollback y recuperación.

### Criterio E2E

Se restaura staging desde backup, se confirma integridad del piloto y se prueba que una solicitud de exportación o eliminación respeta permisos y retención obligatoria.

---

# 23. IA

## Estado — DIFERIDO

La IA no bloquea la operación del instituto.

Cuando se incorpore deberá incluir:

- Proveedor configurable.
- Consentimiento y política institucional.
- Límites de costo.
- Separación tenant por tenant.
- Registro de generación y revisión humana.
- Herramientas docentes: borradores, preguntas, rúbricas y adaptación de texto.
- Herramientas estudiantiles: explicaciones y práctica, nunca calificación definitiva sin reglas claras.
- Prohibición de entrenar proveedores con datos institucionales salvo acuerdo explícito.

---

# 24. Modelo de permisos objetivo

Los permisos se organizarán por recurso y acción:

- `tenant.*`: configuración, marca, módulos y dominio.
- `people.*`: ver, crear, importar, editar, suspender y exportar.
- `academic.*`: estructura, período, programa, cohorte y oferta.
- `course.*`: ver, crear, administrar, copiar y archivar.
- `schedule.*`: ver propio, ver todos, administrar patrones y modificar sesiones.
- `session.*`: contenido, enlace virtual, grabación, asistencia y cancelación.
- `content.*`: crear, publicar, reutilizar y exportar.
- `assignment.*`: crear, entregar, revisar y calificar.
- `assessment.*`: banco, examen, excepciones y revisión.
- `grade.*`: registrar, publicar, corregir y cerrar.
- `communication.*`: publicar, moderar y administrar audiencias.
- `guardian.*`: administrar vínculo y áreas visibles.
- `admission.*`: captar, revisar, decidir y convertir.
- `billing.*`: crear cargos, registrar pago, revertir y exportar.
- `report.*`: ver, construir, exportar y programar.
- `integration.*`: configurar y auditar.
- `privacy.*`: consentimientos, exportación, eliminación y retención.

Cada permiso debe definir además su alcance: institución, sede, unidad, programa, cohorte, oferta, grupo o recurso propio.

---

# 25. Recorridos verticales que guiarán el desarrollo

## Recorrido A — Operar una semana híbrida

1. Administración abre una oferta.
2. Configura lunes presencial y miércoles virtual.
3. El docente prepara objetivos y contenido para cada sesión.
4. El estudiante ve agenda, aula/enlace y preparación.
5. Una sesión cambia excepcionalmente de modalidad.
6. Se notifica a participantes.
7. Se registra asistencia según modalidad.
8. Se publican grabación, materiales y tarea.
9. El estudiante entrega.
10. El docente califica y tutor autorizado consulta.

## Recorrido B — Admitir y matricular

1. Candidato completa solicitud.
2. Administración revisa documentos.
3. Acepta y convierte a estudiante.
4. Lo asigna a programa, cohorte y grupo.
5. Se generan matrículas y cobros administrativos.
6. El estudiante recibe acceso y próximas actividades.

## Recorrido C — Cerrar un período

1. Docentes completan calificaciones.
2. Coordinación revisa excepciones.
3. Se publica y cierra el período.
4. Estudiante y tutor ven resultados.
5. Se genera boletín o récord.
6. Una corrección posterior exige reapertura, motivo y auditoría.

## Recorrido D — Comunicar un cambio institucional

1. Administración segmenta por sede, programa, grupo o curso.
2. Publica mensaje con archivo y acción.
3. Se entrega por bandeja y correo.
4. El destinatario confirma lectura cuando se requiere.
5. El remitente ve entrega agregada sin exposición indebida.

---

# 26. Orden de implementación

## Etapa inmediata — cerrar el piloto actual

- Publicar runner E2E.
- Reiniciar solo staging.
- Ejecutar el piloto desplegado completo.
- Corregir diferencias entre local y Preview.

## Incremento 1 — semana académica híbrida

- `CourseOffering`, grupos, sede y aula.
- Patrones y sesiones concretas.
- Modalidad, enlace virtual y excepciones.
- Panel “Hoy”.
- Contenido y asistencia por sesión.
- Notificación de cambios.

## Incremento 2 — operación del estudiante

- Próximas actividades y calendario consolidado.
- Comentarios y comunicación por curso.
- Recuperación de contraseña y correo.
- Importación masiva.

## Incremento 3 — estructura y matrícula

- Programas, niveles, cohortes y ofertas.
- Admisión, conversión, matrícula individual y masiva.
- Plantillas y copia de cursos.

## Incremento 4 — evaluación institucional

- Rúbricas, preguntas adicionales y excepciones.
- Cierre de período, boletín e historial.
- Reportes académicos.

## Incremento 5 — cobros administrativos

- Conceptos y asignación masiva.
- Estados y marcado masivo.
- Estado de cuenta e instrucciones externas.
- Exportación y auditoría.

## Incremento 6 — robustez y plataforma

- Marca blanca y aprovisionamiento de tenants.
- Backups, monitoreo, privacidad y soporte.
- SSO, API e integraciones prioritarias.

---

# 27. Estimación basada en el alcance refinado

Con trabajo continuo asistido por agentes y sin integrar pasarelas de pago:

- Piloto desplegado actual: días, condicionado al reset de staging.
- Semana híbrida detallada y panel “Hoy”: 2–4 semanas.
- Operación diaria básica de un instituto: 5–8 semanas acumuladas.
- Beta institucional convincente: 2–3 meses.
- Núcleo LMS competitivo: 4–6 meses.
- Plataforma multiinstitución robusta y extensible: 9–15 meses.
- Amplitud cercana a Moodle más Workplace: evolución de 18–30 meses, no un único lanzamiento.

Las integraciones, cumplimiento, pruebas con usuarios y operación real pueden dominar el calendario más que la escritura de código.

---

# 28. Definición de terminado por capacidad

Cada capacidad deberá demostrar:

1. Modelo y migración compatible.
2. Reglas de negocio y estados explícitos.
3. Permisos server-side y aislamiento tenant.
4. Interfaz para todos los roles involucrados.
5. Validación, errores y recuperación.
6. Auditoría de cambios sensibles.
7. Experiencia móvil y accesible.
8. Pruebas unitarias y de autorización.
9. Recorrido E2E desplegado.
10. Persistencia tras cerrar sesión.
11. Observabilidad y procedimiento de soporte.
12. Documentación para usuarios y administradores.

Una pantalla, un modelo o una prueba aislada no equivalen a una capacidad terminada.

---

# 29. Qué no se agregará todavía

- Procesamiento de tarjetas y conciliación bancaria.
- Videoconferencia propia.
- Supervisión de exámenes por cámara.
- Aplicaciones nativas antes de validar la PWA.
- Marketplace de plugins antes de estabilizar la API.
- IA antes de cerrar privacidad, costos y revisión humana.
- Cada actividad especializada de Moodle antes de completar los recorridos institucionales principales.

---

# 30. Resultado esperado

La primera meta comercial no es afirmar paridad total con Moodle. Es demostrar que un instituto pequeño puede operar una semana real en Edukana:

- admite y matricula;
- organiza cursos, grupos y sesiones híbridas;
- enseña con contenido y video;
- comunica cambios;
- muestra próximas actividades;
- registra asistencia;
- recibe trabajos y evalúa;
- publica notas;
- informa a tutores;
- controla cobros administrativos;
- conserva datos y archivos de forma segura.

Cuando ese recorrido sea repetible en un entorno desplegado sin pasos técnicos ocultos, tendremos una beta institucional real. El resto del inventario se incorporará por fases, manteniendo el mismo nivel de detalle y prueba.
