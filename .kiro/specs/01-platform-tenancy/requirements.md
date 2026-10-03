# 01 · Plataforma, espacios y marca blanca — Requisitos

## Introducción
El operador de Edukana crea y vende espacios (colegio, universidad, instituto, marketplace). Cada espacio opera con su dominio y su marca, aislado de los demás.

### Requisito 1 — Consola de plataforma
**Historia:** Como operador, quiero una consola para crear y administrar espacios, para vender la plataforma.
1. WHEN el host es `app.edukana.com` y el usuario es `PlatformUser` THEN el sistema SHALL mostrar `/platform`.
2. WHEN un usuario sin rol de plataforma abre `/platform` THEN SHALL responder 404.
3. La lista de espacios SHALL mostrar tipo, plan, estado, uso frente a límites, último acceso y próximo cobro, con filtros.

### Requisito 2 — Crear espacio
**Historia:** Como operador, quiero un asistente de 5 pasos, para entregar un espacio listo en minutos.
1. WHEN elijo el tipo THEN el sistema SHALL precargar módulos, roles, terminología y parámetros del preset.
2. WHEN escribo el subdominio THEN SHALL validar disponibilidad y formato en vivo y rechazar nombres reservados.
3. WHEN confirmo THEN SHALL crear en una transacción: `Tenant`, dominio, roles de sistema, ajustes por defecto, estructura académica base del tipo, plantillas de mensajes y de certificado, e invitación al propietario.
4. WHEN la creación termina THEN el propietario SHALL recibir un correo con la marca del espacio para activar su cuenta.
5. IF falla un paso THEN nada SHALL quedar creado.

### Requisito 3 — Resolución por dominio
1. WHEN llega una petición THEN el sistema SHALL resolver el espacio por host (subdominio o dominio propio verificado).
2. WHEN el host no corresponde a un espacio THEN SHALL responder 404.
3. WHEN un usuario autenticado en un espacio abre otro donde no tiene membresía THEN SHALL pedir acceso o mostrar "No perteneces a este espacio".
4. Las cookies de sesión SHALL estar limitadas al host del espacio.

### Requisito 4 — Dominio propio
1. WHEN el administrador registra un dominio THEN SHALL mostrar los registros DNS a crear y un token de verificación.
2. WHEN la verificación DNS pasa THEN SHALL activar el dominio y redirigir el subdominio hacia él.
3. IF el plan no incluye `features.customDomain` THEN la opción SHALL mostrarse bloqueada con el motivo.

### Requisito 5 — Marca blanca
1. WHEN el administrador cambia logo, colores o tipografía THEN SHALL ver una vista previa en vivo de login, barra lateral, correo y certificado antes de guardar.
2. WHEN se guarda THEN todas las pantallas, correos, PDFs y la página pública SHALL usar la marca del espacio.
3. IF el contraste no cumple AA THEN SHALL ajustar el color de texto y avisar.
4. IF el plan no incluye `removePoweredBy` THEN SHALL mostrar "Con tecnología de Edukana" en pie de página y correos.

### Requisito 6 — Planes, límites y módulos
1. El operador SHALL poder definir planes con modelo de precio, límites y features.
2. WHEN el uso alcanza 80 % de un límite THEN SHALL avisar al propietario y al operador; al 100 % SHALL bloquear nuevas altas de ese recurso con mensaje claro.
3. WHEN el operador apaga un módulo THEN SHALL desaparecer de navegación, rutas (404) y permisos, sin borrar datos.

### Requisito 7 — Ciclo de vida
1. Estados: TRIAL → ACTIVE → PAST_DUE → SUSPENDED → CANCELLED.
2. WHEN SUSPENDED THEN el espacio SHALL quedar en solo lectura con banner y exportación disponible para el propietario.
3. WHEN CANCELLED THEN SHALL permitir exportar durante 30 días y programar el borrado.
4. Un job diario SHALL calcular uso (`UsageSnapshot`) y generar `SaasInvoice` según el modelo de cobro.

### Requisito 8 — Suplantación
1. WHEN soporte suplanta THEN SHALL exigir motivo, limitar a 60 minutos, mostrar banner permanente y auditar cada acción con `impersonatorId`.
2. Durante la suplantación SHALL estar bloqueado: cambiar contraseñas, ver secretos, ver notas de orientación, transferir propiedad.

### Requisito 9 — Puesta en marcha
1. WHEN el propietario entra por primera vez THEN SHALL ver la lista de verificación de 8 pasos de `ui-ux.md` con progreso persistente.
