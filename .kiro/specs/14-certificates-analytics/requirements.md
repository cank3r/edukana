# 14 · Certificados, reportes y analítica — Requisitos
### Requisito 1 — Certificados
1. Plantilla por espacio (fondo, logo, firmas, texto con variables, horas, nota opcional) con vista previa.
2. Emisión automática al cumplir la regla de finalización o manual; revocación con motivo.
3. PDF con código y QR hacia la página pública de verificación del espacio; firma HMAC.
4. La verificación pública SHALL mostrar solo nombre, curso, institución, fecha y estado, con límite de peticiones.
### Requisito 2 — Tableros por rol
1. Cada rol SHALL ver en Inicio: "Requiere tu atención", "Continuar" e indicadores accionables de su ámbito (ver `ui-ux.md`).
### Requisito 3 — Reportes
1. Académicos: rendimiento por oferta y grupo, distribución de notas, asistencia, entregas a tiempo, estudiantes en riesgo (regla configurable).
2. Operativos: matrícula por período, retención, admisiones.
3. Financieros y de ventas (según permiso).
4. Todos con filtros, ámbito del usuario y exportación CSV/XLSX.
### Requisito 4 — Rendimiento
1. Los indicadores SHALL leerse de tablas de resumen actualizadas por job o evento, no calcularse en cada carga.
### Requisito 5 — Uso para el operador
1. La consola SHALL mostrar uso por espacio y alertas de límites.
