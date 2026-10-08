# Roadmap de capacidades de Edukana

## Norte del producto

Edukana busca centralizar la operación y la experiencia educativa de una institución: captar e inscribir personas, organizar programas y cursos, impartir contenidos, comunicar, mostrar próximas actividades, evaluar, calificar, certificar y dar seguimiento institucional.

El referente combinado es:

- **Moodle LMS:** profundidad académica, actividades, evaluación, progreso y extensibilidad.
- **Moodle Workplace:** multitenancy, estructura organizacional, programas y seguimiento por responsables.
- **Google Classroom:** simplicidad de uso, colaboración, calendario e integraciones.

El objetivo no es copiar cada ajuste ni cada plugin. Una capacidad cuenta como terminada solo cuando un recorrido real funciona de extremo a extremo en un entorno desplegado, con autenticación, persistencia, permisos, archivos y experiencia de usuario.

## Estado de partida

### Funcional y validado localmente

- Alta inicial de institución y administrador.
- Usuarios, roles efectivos, departamentos y períodos.
- Cursos, secciones, lecciones, texto, documentos y video privado.
- Matrícula administrativa.
- Tareas, entregas, banco básico de preguntas, exámenes y calificación.
- Asistencia, horarios, progreso, finalización y certificados verificables.
- Portal de tutores con vínculo explícito y permisos por área.
- Anuncios segmentados por institución, rol, curso, persona o departamento.
- Aislamiento multi-tenant y autorización en páginas, acciones y archivos.

### Parcial

- Ciclo de vida de usuarios, perfiles y suspensión.
- Panel personal y calendario.
- Admisiones, analítica, configuración de marca y cobros administrativos.
- Reportes, comunicación por curso y experiencia móvil adaptable.
- Plantillas, categorías académicas y reutilización de cursos.

### Ausente o pendiente de recorrido completo

- Importación masiva, autorregistro, recuperación de contraseña, OAuth/SSO y MFA.
- Cohortes, grupos, agrupaciones, programas, niveles y planes de estudio completos.
- Automatrícula y sincronización externa de inscripciones.
- Acceso condicionado por fecha, grupo, calificación o actividad anterior.
- Foros, encuestas, glosarios, wikis, talleres entre pares y contenido H5P.
- SCORM, LTI, API pública y servicios web.
- Rúbricas, evaluación avanzada, entregas grupales y flujo de corrección.
- Competencias, planes de aprendizaje, badges y reglas dinámicas.
- Notificaciones multicanal, actividad próxima consolidada y mensajería.
- Reportes configurables, analítica de riesgo y registros operativos completos.
- Portabilidad y eliminación de datos, retención y consentimientos.
- Aplicación móvil, uso offline y ecosistema de extensiones.
- Integraciones de videoconferencia, IA y pasarelas de pago.

## Secuencia de entrega

## Fase 0 — Piloto desplegado verificable

**Meta:** demostrar una institución pequeña operando el flujo académico completo en Preview.

- Ejecutar onboarding sobre una base limpia.
- Crear usuarios, período, departamento, curso y matrícula.
- Publicar contenido y video, entregar, registrar asistencia y calificar.
- Vincular tutor y comprobar permisos.
- Publicar anuncio multimedia y comprobar persistencia.
- Ejecutar el runner canónico y obtener PASS desplegado.

**Salida:** el piloto completo puede repetirse sin seed, SQL manual ni datos preparados.

## Fase 1 — Operación diaria de un instituto

**Meta:** permitir que una institución pequeña trabaje diariamente sin apoyo técnico.

- Recuperación de contraseña y correo transaccional.
- Importación masiva y suspensión/reactivación de usuarios.
- Programas, niveles, cohortes, grupos y períodos.
- Inscripción y matrícula desde la interfaz, individual y masiva.
- Inicio del estudiante con próximas actividades, vencimientos y calendario.
- Comentarios por curso, anuncios y notificaciones.
- Plantillas y reutilización de cursos.
- Cobros administrativos: conceptos, asignación masiva y estados pagado/pendiente/vencido.
- Vías externas de pago visibles para estudiante y tutor, sin pasarela integrada.
- Backups, monitoreo, alertas y herramientas básicas de soporte.

**Salida:** una institución piloto puede operar durante varias semanas y repetir sus procesos normales.

## Fase 2 — Núcleo competitivo de LMS

**Meta:** alcanzar una experiencia académica comparable con el núcleo habitual de Classroom y Moodle.

- Grupos y trabajo diferenciado.
- Acceso condicionado y finalización automática configurable.
- Carpetas, páginas, libros y reutilización de contenido.
- Foros, consultas y encuestas de retroalimentación.
- Preguntas numéricas, emparejamiento, ordenamiento y variantes calculadas.
- Configuración avanzada de intentos, tiempos, revisión y excepciones.
- Rúbricas, escalas, fórmulas, historial e importación/exportación de notas.
- Entregas grupales, borradores, reenvíos y flujo de corrección.
- Calendario institucional y comunicación multicanal.
- Reportes académicos y administrativos exportables.
- PWA instalable y experiencia móvil validada.

**Salida:** docentes y estudiantes pueden trabajar cotidianamente sin depender de otra plataforma LMS.

## Fase 3 — Plataforma institucional extensible

**Meta:** operar múltiples instituciones y conectarse con su ecosistema tecnológico.

- OAuth 2, Microsoft/Google SSO, MFA y proveedores institucionales.
- Programas formativos, certificaciones renovables y reglas dinámicas.
- Competencias, planes de aprendizaje y badges.
- API pública, webhooks, servicios web y auditoría de integraciones.
- LTI, SCORM 1.2 y H5P mediante integraciones controladas.
- Reportes configurables, programación de entregas y analítica de riesgo.
- Gestión de consentimiento, exportación, eliminación y retención de datos.
- Temas, dominios, terminología y marca blanca validados por tenant.
- Alta disponibilidad, restauración comprobada y pruebas de carga.

**Salida:** el alta y operación de nuevos tenants es repetible, observable y soportable.

## Fase 4 — Extensiones estratégicas

**Meta:** ampliar valor sin bloquear el núcleo institucional.

- Integraciones con Meet, Teams o BigBlueButton.
- Aplicaciones móviles nativas y sincronización offline avanzada.
- Subsistema de IA con proveedores, permisos, costos y auditoría.
- Marketplace o SDK de extensiones.
- Pasarelas de pago, webhooks, conciliación y reembolsos.
- Gamificación avanzada y actividades colaborativas especializadas.

Estas capacidades no forman parte del MVP inicial y deben responder a demanda comprobada.

## Prioridad para la presentación

La demostración debe seguir un único recorrido:

1. La administración configura la institución y crea personas.
2. El docente crea un curso, contenido, video y actividad.
3. El estudiante consulta próximas actividades, estudia y entrega.
4. El docente registra asistencia y califica.
5. El tutor consulta solo la información autorizada.
6. La institución comunica un aviso segmentado.
7. Los datos y archivos persisten después de cerrar sesión.

No se presentarán como terminadas las capacidades que solo tengan pantalla, modelo de datos o pruebas aisladas.

## Estimación orientativa

- Fase 0: días, una vez disponible un Preview limpio.
- Fase 1: 5–8 semanas de trabajo continuo.
- Fase 2: 2–4 meses adicionales.
- Fase 3: 3–6 meses adicionales.
- Fase 4: evolución por demanda; no tiene una fecha única de cierre.
