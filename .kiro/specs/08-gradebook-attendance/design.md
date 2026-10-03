# 08 · Calificaciones y asistencia — Diseño
**Motor:** `src/server/grading/engine.ts` puro y probado: `categoryAverage`, `termGrade`, `finalGrade(formula)`, `applyScale`, `round`, `gpa`. Recibe la configuración resuelta; sin acceso a base de datos.
**Cuadrícula:** componente virtualizado; `saveGradeCell` con control de concurrencia optimista (`updatedAt`); recalcula en cliente con el mismo motor (paquete compartido).
**Cierre:** `closeTerm(offeringId|groupId, termId)` transaccional → `TermGrade` + `lockedAt` → encola boletines.
**PDF:** plantilla React renderizada a PDF en job (`@react-pdf/renderer`), tema del espacio, guardado en Storage; `ReportCard` apunta al `Asset`.
**Asistencia:** `AttendanceSession` única por (oferta|grupo, fecha, bloque). Resumen materializado por matrícula actualizado en la transacción.
**Orientación:** cuerpo cifrado con clave derivada por espacio; acceso de emergencia = flujo con doble aprobación y auditoría.
**UI:** `/ensenar/[offeringId]/calificaciones`, `/ensenar/[offeringId]/asistencia`, `/academico/calificaciones/cierre`, `/academico/documentos`, `/ensenar/mi-grupo`.
**Pruebas:** motor con tablas de casos por escala; edición tras cierre; boletín bloqueado por deuda; visibilidad de no publicadas; notas de orientación inaccesibles para ADMIN.
