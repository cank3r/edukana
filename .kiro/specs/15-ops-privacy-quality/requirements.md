# 15 · Operación, privacidad, accesibilidad e integraciones — Requisitos
### Requisito 1 — Trabajo en segundo plano
1. SHALL existir cola con reintentos exponenciales, idempotencia, cola de fallidos y panel en la consola.
### Requisito 2 — Privacidad
1. Consentimientos versionados por espacio; registro de quién aceptó qué y cuándo.
2. Exportación de datos y anonimización por solicitud; retención según parámetros.
3. Exportación completa del espacio para el propietario (ZIP con CSV y archivos).
### Requisito 3 — Seguridad
1. Encabezados CSP, límite global de peticiones, protección CSRF en rutas API, validación de origen en webhooks.
2. Política de contraseñas, 2FA y lista de IP según parámetros.
3. Respaldos diarios con restauración probada.
### Requisito 4 — Accesibilidad e idioma
1. WCAG 2.1 AA verificado con pruebas automáticas (axe) en los flujos principales.
2. Español e inglés; formato de fecha, número y moneda según el espacio.
### Requisito 5 — Móvil
1. PWA instalable con icono y nombre del espacio, push y lectura sin conexión de lecciones de texto.
### Requisito 6 — Integraciones
1. Google Classroom: sincronizar cursos, listas y notas.
2. Importar SCORM; LTI 1.3 como plataforma; listas en formato OneRoster CSV.
3. API pública con claves por espacio y webhooks salientes firmados (según plan).
### Requisito 7 — Observabilidad
1. Registro estructurado, monitoreo de errores, métricas de jobs y de integraciones, página de salud.
