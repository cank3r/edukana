---
inclusion: always
---
# Edukana — Roles y permisos

## Modelo
- **Permiso:** cadena `recurso.acción[.alcance]`. Catálogo cerrado en `src/server/authz/permissions.ts`.
- **Rol:** conjunto de permisos. Hay **plantillas de sistema** por tipo de espacio (no editables) y **roles personalizados** por espacio (copiar plantilla y ajustar), si el plan lo permite.
- **Membresía:** usuario + espacio + rol + **ámbito** opcional (sede, nivel/facultad, programa, oferta). Un usuario puede tener varias membresías y varios roles; usa un selector de rol activo.
- **Relación:** además del rol, se exige relación con el recurso: docente de la oferta, matriculado, tutor vinculado, autor del curso.
- **Estado:** matrícula activa, período abierto, curso publicado, espacio no suspendido.
- **Módulo y plan:** el permiso solo aplica si el módulo está activo.

`can()` evalúa en este orden: espacio activo → módulo → permiso del rol → ámbito → relación → estado. Devuelve motivo legible.

Alcances: `.own` (propio), `.assigned` (ofertas asignadas o hijos vinculados), `.scope` (dentro del ámbito de la membresía), `.all` (todo el espacio).

## Roles de plataforma (nivel 1)
| Rol | Puede |
|---|---|
| `PLATFORM_OWNER` | Todo: espacios, planes, precios, operadores, suplantación, configuración global |
| `PLATFORM_SALES` | Crear espacios en prueba, cambiar plan, ver uso y facturación SaaS |
| `PLATFORM_SUPPORT` | Ver espacios, suplantar con motivo y tiempo límite, reintentar jobs; sin facturación |
| `PLATFORM_FINANCE` | Facturas SaaS, cobros, liquidaciones de marketplace; sin suplantación |

## Roles por tipo de espacio (plantillas de sistema)
| Rol | SCHOOL | UNIVERSITY | INSTITUTE | MARKETPLACE | Descripción |
|---|:-:|:-:|:-:|:-:|---|
| `OWNER` | ✔ | ✔ | ✔ | ✔ | Titular del espacio. Único que transfiere propiedad y ve la suscripción |
| `ADMIN` | ✔ | ✔ | ✔ | ✔ | Administra todo salvo propiedad y suscripción |
| `ACADEMIC_LEAD` | Coordinador | Decano / Director de carrera | Coordinador | — | Gestión académica dentro de su ámbito. Sin finanzas |
| `REGISTRAR` | Secretaría | Registro | Registro | — | Personas, matrícula, expedientes, documentos oficiales |
| `FINANCE` | Caja | Tesorería | Cobros | Finanzas | Cargos, pagos, reportes, liquidaciones. Sin notas |
| `ADMISSIONS` | ✔ | ✔ | Ventas | — | Solicitudes y conversión |
| `TEACHER` | Docente | Profesor | Instructor | Instructor | Sus ofertas: contenido, evaluación, asistencia, notas |
| `ASSISTANT` | Auxiliar | Monitor | Asistente | Co-instructor | Como docente pero sin publicar notas finales ni borrar |
| `HOMEROOM` | Titular de grado | — | — | — | Ve todas las asignaturas de su grupo, conducta, contacto con familias |
| `COUNSELOR` | Orientación | Bienestar | — | — | Fichas de seguimiento confidenciales; lee notas y asistencia |
| `ADVISOR` | — | Asesor académico | — | — | Aprueba inscripción de materias de sus asesorados |
| `CONTENT_REVIEWER` | — | — | — | ✔ | Aprueba cursos antes de publicar, modera reseñas |
| `SUPPORT` | — | — | ✔ | ✔ | Atiende usuarios, reembolsos dentro de política |
| `STUDENT` | ✔ | ✔ | ✔ | ✔ | Aprende |
| `GUARDIAN` | ✔ | opcional | opcional | — | Ve a sus vinculados |

## Catálogo de permisos
**Espacio:** `tenant.settings.view` `tenant.settings.edit` `tenant.branding.edit` `tenant.domain.manage` `tenant.subscription.view` `tenant.ownership.transfer` `tenant.integrations.manage` `tenant.audit.view` `tenant.data.export`
**Personas:** `people.view.{scope|all}` `people.create` `people.edit` `people.deactivate` `people.import` `people.invite` `people.contact.view` `people.documents.view` `people.sensitive.view` `roles.view` `roles.manage` `membership.assign`
**Estructura:** `structure.view` `structure.manage` (sedes, niveles, programas, períodos, grupos, aulas) `curriculum.manage`
**Cursos y ofertas:** `course.view.{assigned|scope|all}` `course.create` `course.edit` `course.publish` `course.archive` `offering.manage` `offering.assign_teacher` `schedule.view` `schedule.manage`
**Matrícula:** `enrollment.view` `enrollment.manage` `enrollment.self` `enrollment.approve` `enrollment.withdraw`
**Contenido:** `content.view` `content.manage` `content.publish` `asset.upload`
**Evaluación:** `assignment.manage` `assignment.submit` `assignment.review` `exam.manage` `exam.attempt` `exam.review` `questionbank.manage` `rubric.manage`
**Notas:** `grade.view.own` `grade.view.assigned` `grade.view.{scope|all}` `grade.edit` `grade.publish` `grade.period.close` `grade.period.reopen` `reportcard.generate` `transcript.issue`
**Asistencia:** `attendance.view.own` `attendance.view.assigned` `attendance.view.{scope|all}` `attendance.take` `attendance.justify` `attendance.edit_past`
**Conducta y seguimiento:** `behavior.record` `behavior.view.{assigned|all}` `counseling.notes.manage`
**Familia:** `guardian.link.manage` `child.view` `child.finance.view`
**Comunicación:** `announcement.view` `announcement.publish.{offering|scope|all}` `message.send` `message.moderate` `forum.participate` `forum.moderate` `template.manage` `notification.broadcast`
**Calendario y en vivo:** `calendar.view` `calendar.manage` `live.manage` `live.join`
**Admisiones:** `admission.view` `admission.manage` `admission.convert` `admission.form.edit`
**Finanzas:** `finance.view.own` `finance.view.all` `feeplan.manage` `charge.manage` `payment.record` `payment.refund` `payment.void` `discount.manage` `finance.report` `gateway.manage` `fiscal.manage`
**Catálogo y ventas:** `catalog.manage` `catalog.review` `coupon.manage` `order.view` `order.refund` `review.write` `review.moderate` `payout.view.own` `payout.manage` `instructor.manage`
**Certificados:** `certificate.view.own` `certificate.issue` `certificate.revoke` `certificate.template.manage`
**Reportes:** `report.academic` `report.finance` `report.sales` `report.export`

## Matriz por plantilla (resumen)
`●` todo · `◐` dentro de su ámbito o asignación · `○` solo lo propio · vacío = sin acceso

| Área | OWNER/ADMIN | ACADEMIC_LEAD | REGISTRAR | FINANCE | ADMISSIONS | TEACHER | ASSISTANT | HOMEROOM | COUNSELOR | STUDENT | GUARDIAN |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Configuración del espacio | ● | | | | | | | | | | |
| Roles y membresías | ● | | | | | | | | | | |
| Personas (ver) | ● | ◐ | ● | ◐ nombre y cuenta | ◐ aspirantes | ◐ sus alumnos | ◐ | ◐ su grupo | ◐ | | ◐ hijos |
| Personas (crear, editar, importar) | ● | | ● | | | | | | | | |
| Datos sensibles (salud, documentos) | ● | | ● | | | | | ◐ | ◐ | ○ | ◐ |
| Estructura académica | ● | ◐ | lectura | | | | | | | | |
| Cursos y ofertas (gestionar) | ● | ◐ | | | | ◐ contenido | ◐ | | | | |
| Matrícula | ● | ◐ aprobar | ● | | ◐ inicial | | | | | ○ si está habilitada | |
| Contenido | ● | ◐ | | | | ◐ | ◐ | lectura | | lectura publicada | lectura del hijo |
| Tareas y exámenes (crear, calificar) | ● | ◐ | | | | ◐ | ◐ calificar | | | ○ entregar | lectura |
| Notas (editar) | ● | ◐ | | | | ◐ | ◐ borrador | | | | |
| Notas (publicar, cerrar período) | ● | ◐ | | | | ◐ publicar | | | | | |
| Notas (ver) | ● | ◐ | ● | | | ◐ | ◐ | ◐ | ◐ | ○ publicadas | ◐ publicadas |
| Boletín y récord | ● | ◐ | ● emitir | | | | | ◐ | | ○ | ◐ |
| Asistencia (tomar) | ● | ◐ | | | | ◐ | ◐ | ◐ | | | |
| Asistencia (ver) | ● | ◐ | ● | | | ◐ | ◐ | ◐ | ◐ | ○ | ◐ |
| Conducta | ● | ◐ | | | | ◐ registrar | | ◐ | ◐ | ○ si se publica | ◐ si se publica |
| Notas de orientación | | | | | | | | | ● confidencial | | |
| Vínculos tutor–estudiante | ● | | ● | | ◐ al convertir | | | | | | |
| Avisos (publicar) | ● | ◐ | ◐ | ◐ cobros | | ◐ su oferta | | ◐ su grupo | | | |
| Mensajes | ● | ● | ● | ● | ● | ◐ | ◐ | ◐ | ◐ | ◐ con docentes | ◐ con docentes |
| Calendario (gestionar) | ● | ◐ | ◐ | | | ◐ su oferta | | | | | |
| Admisiones | ● | lectura | ● | | ● | | | | | | |
| Finanzas (gestionar) | ● | | | ● | | | | | | | |
| Finanzas (ver) | ● | | | ● | | | | | | ○ | ◐ si está autorizado |
| Certificados (emitir) | ● | ◐ | ● | | | ◐ | | | | ○ ver | ◐ ver |
| Reportes académicos | ● | ◐ | ● | | | ◐ | | ◐ | ◐ | | |
| Reportes financieros | ● | | | ● | | | | | | | |
| Auditoría | ● | | | | | | | | | | |

**Marketplace:** `INSTRUCTOR` gestiona solo sus cursos, ve sus ventas y liquidaciones (`payout.view.own`), responde preguntas; no ve correos de alumnos salvo que el parámetro `marketplace.instructorSeesEmails` esté activo. `CONTENT_REVIEWER`: `catalog.review`, `review.moderate`. `SUPPORT`: `order.view`, `order.refund` dentro del plazo, `people.view`. `FINANCE`: `payout.manage`, `report.sales`. `STUDENT`: `enrollment.self` por compra, `review.write`.

## Reglas fijas (no configurables)
1. `FINANCE` nunca ve notas; `ACADEMIC_LEAD` y `TEACHER` nunca ven pagos, ni por rutas indirectas.
2. Un estudiante nunca recibe nombres ni correos de compañeros salvo `privacy.classmatesVisible` (solo nombre).
3. `GUARDIAN` sin vínculo activo ve únicamente avisos generales y su perfil.
4. Nadie edita su propio rol ni sus propias notas.
5. Las notas de orientación solo las ve `COUNSELOR`; ni `OWNER` las lee sin proceso de acceso de emergencia auditado.
6. El operador de plataforma no ve datos del espacio salvo suplantación con motivo, límite de tiempo, banner visible y registro.
7. Debe existir siempre al menos un `OWNER` activo.
8. Las acciones de escritura se bloquean si el espacio está suspendido (solo lectura y exportación).
