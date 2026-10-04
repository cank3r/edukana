# 14 · Certificados y analítica — Diseño
**Certificado:** `issueCertificate(enrollmentId)` idempotente; HMAC-SHA256 con secreto de plataforma; PDF en job; ruta pública `(public)/verificar/[code]`.
**Resúmenes:** `StatOfferingDaily`, `StatStudentTerm`, `StatTenantDaily` actualizadas por suscriptores del bus de eventos + job nocturno de consolidación.
**En riesgo:** regla = asistencia < X o entregas faltantes ≥ N o promedio < Y; parámetros en configuración.
**Pruebas:** emisión doble; código manipulado; ámbito en reportes; exportación respeta permisos de columnas.
