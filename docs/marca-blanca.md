# Marca blanca por institución

Pieza G del issue #101. Se reutilizan `Institution.domain`, `logoUrl`, `brandColor`, `settings` y `PlatformPlan.features`; no se crea una migración para G. La implementación no agrega dominios a Vercel, no modifica DNS ni variables de un proyecto real y no envía correos de prueba reales.

## Operación

El operador central configura la marca en la ficha institucional. El alta nueva conserva el envío de invitación existente y ofrece un segundo paso de marca: la primera invitación usa el nombre institucional y la marca vigente en ese momento. Logo/color/dominio agregados después se aplican a correos posteriores; el enlace existente permite reenviar la invitación. El administrador institucional conserva permisos para su color/logo, pero no recibe permiso para cambiar el dominio.

Un dominio almacenado es un hostname normalizado, sin esquema, ruta, puerto, credenciales ni comodines. No usar el host central de Edukana para una institución. Antes de guardar un dominio destinado a enlaces de acceso, el operador debe verificar propiedad y configuración TLS/DNS; guardar el dato no verifica ni configura infraestructura.

## Hosts, sesiones y aislamiento

`PLATFORM_ROOT_DOMAIN` habilita `<slug>.<dominio-raíz>`. Los hosts centrales configurados mediante APP_URL/AUTH_URL/NEXTAUTH_URL quedan reservados. Un dominio propio válido resuelve la institución por `Institution.domain`; los subdominios del dominio raíz resuelven exclusivamente por slug. Un host desconocido conserva el comportamiento general anterior.

El servidor toma la autoridad Host y descarta pistas de tenant y host reenviado suministradas por el cliente. El despliegue debe conservar un Host confiable y no admitir hosts arbitrarios como alias autorizados. Auth.js conserva `trustHost` para la plataforma de despliegue; no se comparten cookies mediante un atributo Domain global. Cada dominio inicia su propia sesión. La sesión y el cambio de membresía se vuelven a contrastar con la institución del host; poseer una sesión B no permite leer B desde A.

La resolución cosmética del proxy usa una caché acotada de 15 segundos y 256 entradas. Los controles de autorización usan lectura fresca por petición y memoización dentro de esa petición. Los cambios de marca/dominio invalidan la caché del proceso; otras réplicas pueden mantener la presentación anterior hasta el TTL, pero no se usa esa caché para autorizar datos.

Las herramientas `/operador` pertenecen al host central: no se habilitan bajo un host institucional aunque la cuenta esté en la lista de operadores.

## Correos y marca visible

Invitaciones, recuperación y notificaciones usan nombre, color y logo institucional cuando corresponda. El nombre visible es «Institución vía Edukana»; el buzón verificado de EMAIL_FROM no cambia. El HTML escapa datos y los enlaces salen únicamente de configuración y dominios almacenados validados, nunca de un Host recibido sin validar. La recuperación elige una institución solicitada solo si la identidad tiene una membresía activa allí; la respuesta pública no revela cuentas ni instituciones.

El pie «Hecho con Edukana» se oculta cuando `PlatformPlan.features.whiteLabel` es true. Si el plan no define esa opción, se usa `settings.platform.hideEdukanaBrand`. El título y el icono de las pantallas institucionales reflejan la marca.

## Activación de dominio, pendiente de autorización

1. Confirmar con el colegio que controla el dominio/subdominio y acordar el nombre exacto.
2. Un responsable autorizado agrega el dominio al proyecto correcto mediante `vercel domains add <dominio> <proyecto>` o el panel Vercel.
3. Copiar el registro DNS concreto que Vercel muestre para ese proyecto. Para subdominios será normalmente un CNAME; el ejemplo histórico `cname.vercel-dns.com` no debe sustituir un destino específico del proyecto. Para dominio raíz seguir la instrucción A/ALIAS de Vercel.
4. Completar, si corresponde, la verificación TXT de propiedad, esperar DNS/TLS y comprobar HTTPS antes de guardar/activar enlaces.
5. Probar login, recuperación, cambio de membresía y aislamiento entre dos instituciones. Revisar AUTH_URL en el entorno: una URL fija puede afectar callbacks multidominio; no cambiarla sin validar el despliegue real.

Estas instrucciones no han sido ejecutadas. Fuentes oficiales: [Vercel: añadir dominio](https://vercel.com/docs/domains/working-with-domains/add-a-domain), [Vercel: configuración](https://vercel.com/docs/domains/set-up-custom-domain), [Auth.js: trustHost](https://authjs.dev/reference/nextjs).

## Verificación pendiente

Las pruebas locales y la revisión adversarial se registrarán con el SHA final. No se declara validación real multidominio ni Preview hasta ejecutar el recorrido autorizado. DNS, TLS, correo real y configuración de infraestructura quedan fuera de esta entrega de código.

### Revisión independiente y pruebas locales

Revisión adversarial independiente PASS sobre host, JWT/sesión viva, cambio de membresía, redirecciones con AUTH_URL fijo, catálogo, certificados, imágenes públicas, carga de logos y correo. Incluye pruebas HTTP con cookies Auth.js realmente cifradas (sesión B devuelve null bajo A; sesión del host correcto y acceso central conservados). No sustituye DNS/TLS ni navegador multidominio desplegado.

G aporta 21 pruebas host/auth, 12 correo y 10 marca; la suite global de backoffice conserva además A–F. Hay cinco regresiones PostgreSQL de marca pendientes de CI. No hay migración G; la lista sigue siendo suspensión, planes y avisos.
