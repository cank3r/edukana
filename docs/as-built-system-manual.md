# Manual del sistema construido de Edukana

**Tipo:** documento “as built” — estado real del producto
**Propósito:** explicar qué existe hasta hoy, cómo fue construido y cómo funciona internamente cada detalle importante
**No sustituye:** el catálogo de pantallas ni el blueprint futuro
**Documentos relacionados:**

- `screen-action-catalog.md`: qué hace cada pantalla y botón.
- `detailed-functional-blueprint.md`: qué agregaremos y a qué nivel de detalle.
- `platform-capability-roadmap.md`: fases y prioridades.
- `canonical-mvp-pilot.md`: recorrido que define si el MVP funciona.

---

# 1. Estado exacto del repositorio

## 1.1 Rama y publicación

- Rama de trabajo: `fix/role-access-hardening`.
- La evidencia Git y de validación debe vincularse al SHA exacto ejecutado; este manual no usa un “último commit” fijo porque envejece con cada publicación.
- El historial publicado contiene el MVP académico, endurecimiento de permisos, tutores, anuncios avanzados y onboarding canónico.
- No se ha fusionado el PR a producción.

## 1.2 Estado de S0

El runner E2E, sus guardas, Playwright Test 1.64.0, Next.js 16.4.0 y la documentación rectora ya están versionados en las ramas coordinadas de S0 y desplegados como Preview del PR. Permanecen fuera de producción mientras el PR no se fusione.

S0 continúa en `IMPLEMENTING`: falta ejecutar el recorrido E2E aditivo sobre el Preview conectado al staging Edukana. Staging conserva todos sus datos ficticios para demostraciones; el runner no borra, no resetea y no modifica el período activo. Las migraciones desde cero se verifican por separado en PostgreSQL temporal de CI. Los resultados de cada puerta se registran junto con el SHA ejecutado en el PR.

## 1.3 Dimensión actual

Según el mapa del repositorio:

- Aproximadamente 202 archivos relevantes.
- Aproximadamente 6,437 líneas de código analizadas en el núcleo priorizado.
- 21 páginas `page.tsx`.
- 44 acciones de servidor o handlers API identificados.
- Seis migraciones versionadas.
- La cantidad vigente de pruebas se registra con el SHA y la salida de ejecución en el PR; no se fija aquí porque cambia con cada incremento.

---

# 2. Cómo se construyó

El sistema se construyó de forma incremental, cerrando recorridos verticales en lugar de agregar pantallas aisladas.

## 2.1 Base Alpha

La primera migración creó:

- Instituciones.
- Usuarios y autenticación.
- Períodos.
- Cursos y módulos básicos.
- Matrículas.
- Asistencia inicial.
- Tareas y entregas.
- Admisiones básicas.
- Cobros básicos.
- Anuncios.
- Eventos.
- Auditoría.

## 2.2 MVP académico real

La segunda migración agregó:

- Secciones y lecciones.
- Progreso por lección.
- Sesiones de asistencia normalizadas.
- Libro de calificaciones.
- Categorías y elementos de nota.
- Banco de preguntas.
- Exámenes, intentos y respuestas.
- Horarios.
- Archivos privados.
- Certificados verificables.
- `institutionId` directo en entidades académicas sensibles.

## 2.3 Endurecimiento de roles

La tercera migración agregó excepciones de capabilities por institución. Después se implementó:

- Catálogo central de permisos.
- Defaults por rol.
- Límites máximos por rol.
- Capacidades protegidas.
- Prevención de escalamiento.
- Auditoría del actor que modifica permisos.

## 2.4 Portal de tutores

La cuarta migración creó vínculos tutor–estudiante con:

- Estado pendiente, activo o revocado.
- Cinco áreas independientes de acceso.
- Activación explícita.
- Revocación terminal.
- Versión monotónica para evitar sobrescrituras concurrentes.
- Registro de creador, modificador y fechas.

## 2.5 Anuncios avanzados

La quinta migración convirtió anuncios simples en un compositor institucional:

- Enlace externo seguro.
- Audiencia por institución.
- Audiencias normalizadas por rol, curso, persona y unidad.
- Cursos relacionados.
- Menciones.
- Departamentos y miembros.
- Assets de anuncio confirmados.
- Migración de audiencias legacy sin perder anuncios anteriores.

## 2.6 Imágenes en Storage

La sexta migración endureció el bucket privado y añadió MIME permitidos para imágenes, conservando documentos y videos.

## 2.7 Piloto canónico

Se agregó una puesta en marcha desde base vacía para crear:

- Primera institución.
- Administrador.
- Docente, estudiante y tutor.
- Período académico.
- Departamento.
- Curso y matrícula.

Luego se recorrió el caso completo localmente y se corrigieron defectos descubiertos por uso real:

- Finalización prematura de la matrícula.
- Error asíncrono del selector multimedia.
- Desplazamiento de fechas de asistencia.
- Exportación incompatible en una acción de servidor.
- Necesidad de Storage privado local para pruebas aisladas.

## 2.8 Runner E2E de Preview

La automatización reproduce el piloto de dos maneras separadas:

- `bootstrap`: valida `/setup` únicamente contra una base vacía controlada.
- `existing`: entra con un administrador de la institución Edukana, verifica su slug y crea artefactos exclusivos mediante `PILOT_RUN_ID` sin borrar datos ni cambiar el período activo.
- Usa Chromium incluido mediante Playwright Test; Edge es una opción explícita.
- Recibe URL y credenciales por variables de entorno.
- Rechaza cualquier host que no sea un Preview de Vercel `-git-` confirmado.
- Guarda trazas y capturas en el scratch de la sesión, no en el repositorio.
- Recorre múltiples roles, persistencia, archivos y permisos.
- CircleCI aplica todas las migraciones desde cero sobre PostgreSQL 16 temporal; nunca usa staging para esa prueba destructiva.

---

# 3. Arquitectura técnica

## 3.1 Stack

- Next.js 16.4 con App Router.
- React 19.
- TypeScript 5.9.
- Tailwind CSS 4.
- Auth.js / NextAuth v5 beta con credenciales.
- Prisma 5.
- PostgreSQL/Supabase.
- Supabase Storage privado.
- Playwright Test para aceptación desplegada.
- Node Test Runner con `tsx` para pruebas unitarias y contractuales.

## 3.2 Capas

### Interfaz

- Server Components cargan datos autorizados.
- Client Components manejan formularios, estado local, confirmaciones y uploads directos.
- Navegación y botones se derivan de capabilities resueltas en servidor.

### Acciones de servidor

- Procesan formularios sin crear APIs públicas innecesarias.
- Vuelven a comprobar sesión, tenant, rol y alcance.
- Validan entradas con Zod.
- Ejecutan transacciones cuando una operación produce varios cambios.
- Revalidan rutas después de mutar.

### Route Handlers

- Auth.js.
- Preparación, confirmación, lectura y eliminación de archivos.
- Verificación pública de certificados.
- Backend privado local para pruebas aisladas.

### Dominio

La carpeta `src/lib` concentra:

- Capacidades.
- Autorización.
- Alcance de cursos.
- Políticas de tutorías.
- Visibilidad de anuncios.
- Validación de archivos.
- Cálculo académico.
- Storage.
- Etiquetas y navegación.

### Persistencia

- Prisma describe modelos y relaciones.
- Migraciones SQL versionadas crean y evolucionan el esquema.
- Cada consulta sensible filtra por institución y alcance.

---

# 4. Flujo de una solicitud

## 4.1 Navegación autenticada

1. El navegador solicita una ruta.
2. `src/proxy.ts` comprueba únicamente si existe sesión.
3. Si no hay sesión y la ruta no es pública, redirige a login con `callbackUrl`.
4. La página protegida vuelve a cargar la sesión.
5. La página consulta capabilities efectivas desde PostgreSQL.
6. Aplica además el alcance específico del recurso.
7. Ejecuta una consulta con `institutionId` y proyección mínima.
8. Renderiza solo datos y controles permitidos.

El Proxy no es la frontera de autorización; solo evita navegación anónima obvia.

## 4.2 Mutación mediante formulario

1. El usuario completa el formulario.
2. El Client Component envía `FormData` a una Server Action.
3. La acción obtiene la identidad desde la sesión.
4. Relee al actor activo en la base cuando la operación es sensible.
5. Resuelve capabilities institucionales.
6. Valida forma y límites con Zod.
7. Relee entidades referenciadas dentro del tenant.
8. Ejecuta la transacción.
9. Registra auditoría cuando corresponde.
10. Revalida rutas.
11. Devuelve estado `{ ok, message }`.
12. La UI muestra éxito o error.

## 4.3 Lectura de archivo privado

1. La UI usa `/api/assets/[assetId]`, nunca una URL pública permanente.
2. El handler exige sesión.
3. Busca el asset por ID e institución.
4. Comprueba que la ruta física empieza con el tenant.
5. Determina si el usuario es propietario, gestor, participante del curso o destinatario del anuncio.
6. Si no tiene acceso, devuelve 403/404.
7. Si tiene acceso, genera una URL firmada de cinco minutos.
8. Responde con redirección temporal.

---

# 5. Autenticación

## Archivo principal

`src/lib/auth.ts`

## Funcionamiento

- Proveedor actual: correo y contraseña.
- Valida formato antes de consultar.
- Busca cuentas activas por correo.
- Exige exactamente una coincidencia para evitar ambigüedad entre tenants.
- Compara contraseña con bcrypt.
- Inserta en el JWT:
  - ID.
  - Rol.
  - Institution ID.
  - Slug institucional.
- Expone esos datos en la sesión del servidor.

## Seguridad

- Las contraseñas se guardan hasheadas con bcrypt.
- Login no coloca credenciales en URL.
- Error genérico para no revelar cuentas.
- Sesión JWT evita depender de una consulta de sesión en cada navegación.
- Los overrides de capabilities sí se consultan nuevamente en servidor; no se confía en permisos viejos dentro del JWT.

## Límites actuales

- El mismo correo en más de una institución produce ambigüedad y no autentica.
- No hay recuperación.
- No hay invitaciones.
- No hay MFA ni SSO.
- El modelo futuro debe separar identidad global de membresía institucional.

---

# 6. Autorización y roles

## Archivos principales

- `src/lib/capabilities.ts`.
- `src/lib/authorization.ts`.
- `src/lib/access.ts`.
- `src/lib/role-permissions.ts`.

## Modelo

Los roles base son:

- Súper administrador.
- Administrador.
- Coordinador.
- Docente.
- Estudiante.
- Tutor.

Las capabilities cubren:

- Portal estudiantil.
- Lectura y gestión de cursos.
- Participación.
- Roster.
- Horario.
- Personas.
- Estructura académica.
- Matrículas.
- Admisiones.
- Anuncios.
- Cobros.
- Analítica.
- Configuración.
- Roles.
- Tutorías y áreas del portal familiar.

## Resolución

1. Se parte del conjunto por defecto del rol.
2. Se leen overrides del tenant.
3. Se ignoran capabilities desconocidas.
4. Se elimina cualquier capability fuera del límite permitido para el rol.
5. Se aplican altas o bajas válidas.
6. Se restauran capacidades críticas protegidas de ADMIN.
7. SUPER_ADMIN permanece inmutable.

## Protección contra escalamiento

- Un actor no puede conceder o retirar lo que no posee.
- Un rol no puede recibir capabilities fuera de su límite de producto.
- El formulario envía deltas explícitos, no una lista total confiable.
- El servidor preserva capacidades fuera de autoridad.
- Cambios críticos solicitan confirmación.
- Cada guardado conserva actor y auditoría.

---

# 7. Multi-tenancy

## Regla central

Toda entidad académica sensible lleva `institutionId` directamente o se alcanza mediante una relación validada dentro del tenant.

## Estrategia

- La sesión entrega `institutionId`.
- Las páginas no aceptan tenant desde query o formulario.
- Acciones releen referencias con filtro institucional.
- IDs externos no bastan para acceder.
- Los assets usan prefijo de ruta por tenant.
- Tutores y anuncios combinan tenant con reglas adicionales.

## Por qué hay `institutionId` redundante

En entidades como notas, asistencia, assets y preguntas, el tenant podría inferirse desde el curso. Se guarda también directamente para:

- Filtrar de forma explícita.
- Crear índices eficientes.
- Reducir riesgo de joins incompletos.
- Facilitar auditoría.
- Hacer visibles inconsistencias.

---

# 8. Base de datos y modelos existentes

## 8.1 Institución

Guarda:

- Nombre y slug.
- Tipo.
- Logo y dominio.
- Zona horaria e idioma.
- Plan.
- Configuración JSON.

Relaciona todas las entidades del tenant.

## 8.2 Usuario

Guarda:

- Identidad básica.
- Correo y contraseña.
- Estado.
- Rol.
- Avatar y teléfono.
- Relaciones docentes, estudiantiles, familiares y administrativas.

La unicidad de correo es por institución, aunque el login actual exige coincidencia global única.

## 8.3 Período académico

- Nombre.
- Inicio y fin.
- Activo/inactivo.
- Cursos, cobros y períodos de nota relacionados.

Al crear uno nuevo desde la puesta en marcha se desactiva el anterior.

## 8.4 Curso

- Período.
- Docente principal.
- Nombre, código y descripción.
- Capacidad y umbral de finalización.
- Horario legacy JSON y slots normalizados.
- Secciones, lecciones, evaluaciones, matrículas y assets.

Actualmente curso y oferta concreta son la misma entidad; el blueprint los separará.

## 8.5 Sección y lección

La jerarquía es:

`Course -> CourseSection -> Lesson`

La sección define orden, publicación y descripción. La lección define:

- Tipo.
- Contenido.
- Resumen.
- Duración estimada.
- Publicación.
- Assets.
- Progreso individual.

## 8.6 Matrícula

Relaciona estudiante y curso con:

- Estado.
- Nota final.
- Progreso porcentual.
- Fecha de alta y finalización.
- Entregas, notas, asistencia, intentos y certificado.

Completar una lección actualiza progreso, pero no completa automáticamente el curso. La finalización es una acción docente explícita.

## 8.7 Asistencia

- `AttendanceSession`: curso, fecha, título y actor que registra.
- `Attendance`: sesión, matrícula, estado, nota y fecha.

La fecha usa tipo SQL `DATE` para evitar cambios por zona horaria.

Limitación: una sesión de asistencia no es todavía una sesión pedagógica híbrida.

## 8.8 Calificaciones

Jerarquía:

`GradingPeriod -> GradeCategory -> GradeItem -> GradeEntry`

Permite:

- Períodos de nota.
- Categorías ponderadas.
- Descartar notas bajas.
- Tareas o exámenes vinculados a elementos.
- Puntuación, feedback y exención.
- Publicación del período.

## 8.9 Tareas y entregas

Tarea:

- Instrucciones.
- Vencimiento.
- Máximo.
- Tipo.
- Publicada o borrador.
- Política tardía.

Entrega:

- Estudiante y matrícula.
- Texto y assets.
- Estado.
- Nota y feedback.
- Fechas de envío y calificación.

Existe una sola entrega por estudiante y tarea en el modelo actual.

## 8.10 Banco y exámenes

Banco:

- Curso.
- Tipo.
- Enunciado.
- Opciones.
- Respuesta correcta.
- Explicación.
- Puntos.

Examen:

- Preguntas seleccionadas.
- Apertura/cierre preparados en el modelo.
- Duración.
- Intentos.
- Publicación.
- Revisión.

Intento:

- Número.
- Estado.
- Respuestas.
- Puntuación.

La lógica autocalifica opción múltiple y verdadero/falso; respuesta corta queda para revisión manual.

## 8.11 Horario

`ScheduleSlot` guarda:

- Curso y docente.
- Día de semana.
- Minuto inicial/final.
- Aula como texto.
- Vigencia opcional.

Valida solapamientos básicos de docente y aula.

No guarda todavía modalidad, sede normalizada, enlace virtual, contenido o excepción individual.

## 8.12 Assets

Guarda:

- Tenant y curso opcional.
- Lección, tarea, entrega o anuncio.
- Usuario que carga.
- Bucket y ruta privada.
- Nombre, MIME, tamaño, tipo y visibilidad.
- Checksum/etag.
- Confirmación.

Un asset preparado no se considera usable hasta que el servidor inspecciona el objeto real y marca `confirmedAt`.

## 8.13 Certificado

- Curso y matrícula.
- Emisor.
- Código público.
- Hash firmado.
- Emisión y revocación.
- Metadata extensible.

La verificación compara código, matrícula y curso contra el hash con secreto del servidor.

## 8.14 Admisión

Actualmente es un lead con:

- Contacto.
- Programa de interés.
- Etapa.
- Documentos JSON.
- Notas y origen.

La UI actual solo crea y lista; no ejecuta el embudo completo.

## 8.15 Cobros

Actualmente guarda:

- Estudiante opcional.
- Período opcional.
- Concepto.
- Monto y moneda.
- Vencimiento.
- Fecha de pago.
- Estado y notas.

La UI crea y edita individualmente. Falta lote, referencia, reversión auditada e instrucciones de vías externas.

## 8.16 Anuncios

Anuncio base:

- Autor.
- Título y contenido seguro.
- Enlace externo.
- Fijado.
- Fecha.

Audiencias normalizadas:

- Institución completa.
- Roles.
- Cursos.
- Personas.
- Unidades.

Además:

- Cursos relacionados.
- Menciones.
- Imágenes/videos confirmados.

## 8.17 Tutorías

El vínculo guarda:

- Padre/tutor.
- Estudiante.
- Relación.
- Estado.
- Cinco permisos de datos.
- Creador y actualizador.
- Versión y revocación.

La capability abre el módulo; la bandera del vínculo concede el área concreta. Se necesitan ambas.

## 8.18 Unidades organizacionales

- Unidad con jerarquía opcional.
- Membresías por usuario.
- Uso actual principal: segmentar anuncios.

La jerarquía existe en el modelo, pero la interfaz todavía no la administra.

## 8.19 Auditoría

`AuditLog` guarda:

- Tenant opcional.
- Actor.
- Acción.
- Entidad e ID.
- Cambios JSON.
- IP y agente preparados.
- Fecha.

No todas las acciones antiguas auditan todavía con el mismo nivel de detalle.

---

# 9. Curso: funcionamiento interno

## 9.1 Alcance de lectura

- Tutor: ningún curso directo.
- Estudiante: solo matrículas activas o completadas.
- Docente: cursos donde es titular.
- Actor con `course.view.all`: todos los cursos del tenant.
- Otros roles sin alcance natural: ninguno.

## 9.2 Alcance de escritura

- Estudiante y tutor: ninguno.
- Docente: únicamente cursos asignados, aunque posea lectura global.
- Actor autorizado con `course.view.all` y `course.manage`: todos dentro del tenant.

## 9.3 Participación

Solo estudiante activo con `course.participate` y matrícula activa puede:

- Entregar tareas.
- Presentar exámenes.
- Marcar progreso.

Una matrícula completada sigue visible pero queda en consulta.

## 9.4 Creación de curso

- Solo docente desde la UI actual.
- El docente se asigna automáticamente como titular.
- El período debe estar activo y pertenecer al tenant.
- Código único por institución.
- Genera auditoría.

## 9.5 Contenido

- El gestor crea secciones publicadas o borrador.
- Dentro crea lecciones ordenadas.
- Usuarios no gestores solo reciben contenido publicado.
- El estudiante registra progreso por lección.
- El porcentaje se recalcula acotado entre 0 y 100.

## 9.6 Horario

- Se expresa en minutos desde medianoche para simplificar solapamientos.
- La utilidad central compara intervalos.
- Bloques adyacentes no son conflicto.
- Mismo docente o misma aula superpuestos sí son conflicto.

---

# 10. Evaluaciones y notas

## 10.1 Libro de calificaciones

La creación inicial genera:

- Período de notas.
- Categoría de asignaciones.
- Categoría de exámenes.
- Pesos configurados.

## 10.2 Cálculo ponderado

- Cada categoría aporta según peso.
- Se pueden descartar las notas más bajas.
- Si una categoría no tiene notas, los pesos presentes se renormalizan.
- Una exención no penaliza.
- El resultado se muestra solo cuando el período y elemento son visibles.

## 10.3 Entrega

- El estudiante envía texto y opcionalmente documento.
- El servidor comprueba matrícula activa y tarea publicada.
- El docente revisa dentro del curso gestionado.
- La nota actualiza entrega y elemento de calificación.

## 10.4 Examen

- Se crea desde preguntas del curso.
- Cada intento se numera.
- Las respuestas objetivas se normalizan y comparan.
- La respuesta corta queda `SUBMITTED` hasta revisión.
- El docente completa puntuación y feedback.

---

# 11. Storage privado

## 11.1 Dos backends

### Supabase

Usado en Preview/producción:

- Service Role solo en servidor.
- Bucket privado.
- URL firmada de carga.
- URL firmada de lectura.

### Local

Usado para el piloto aislado:

- Raíz privada en disco.
- Token HMAC con acción, bucket, ruta y vencimiento.
- Resolución de ruta bloquea absolutos y traversal.
- Metadata separada para MIME, tamaño y etag.

## 11.2 Flujo de carga académica

1. Cliente envía metadatos a `POST /api/assets`.
2. Servidor valida rol, matrícula/curso, tipo y tamaño.
3. Genera ruta con tenant, curso, UUID y nombre seguro.
4. Crea fila no confirmada.
5. Devuelve URL firmada.
6. Navegador sube directo al Storage.
7. Cliente llama `PATCH /api/assets/[id]`.
8. Servidor inspecciona objeto.
9. Compara MIME y tamaño autorizados.
10. Si difiere, elimina objeto y fila.
11. Si coincide, guarda checksum y `confirmedAt`.

## 11.3 Flujo de anuncio

- Ruta de borrador incluye tenant y uploader.
- Solo quien puede publicar prepara la carga.
- Fotos: JPEG, PNG, WebP o GIF hasta 10 MB.
- Videos: MP4 o WebM hasta 100 MB.
- El anuncio solo acepta assets confirmados, propios y del tenant.
- Después de publicar, el asset queda relacionado al anuncio.

## 11.4 Lectura

- Propietario puede leer su carga.
- Gestor puede leer assets del curso permitido.
- Participante puede leer assets no privados del curso.
- Destinatario de anuncio puede leer assets del anuncio.
- Usuario fuera de audiencia no obtiene URL firmada.

---

# 12. Anuncios avanzados

## 12.1 Edición segura

El compositor usa una sintaxis limitada tipo Markdown:

- Encabezado.
- Negrita.
- Cursiva.
- Listas.
- Cita.
- Enlaces.
- Menciones.

No renderiza HTML arbitrario. Los enlaces solo aceptan HTTPS o `mailto`.

## 12.2 Audiencia

El servidor combina destinatarios por OR dentro del tenant:

- Toda la institución.
- Rol.
- Curso.
- Persona.
- Unidad.

Para curso se incluyen estudiantes matriculados y docentes que lo imparten.

## 12.3 Menciones

- La UI inserta token con ID.
- El servidor comprueba que la persona está dentro de la audiencia.
- Una mención no amplía la audiencia.

## 12.4 Privacidad

- Autor y manager pueden ver desglose de audiencia.
- Destinatarios comunes solo ven una descripción genérica.
- No se revelan nombres de co-destinatarios.
- Tutor recibe anuncio de su estudiante solo si vínculo activo y bandera de anuncios están habilitados.

## 12.5 Cursos relacionados

- Se muestran como tarjetas.
- El enlace solo existe si el usuario puede abrir el curso.
- Tutor recibe tarjeta informativa sin ruta prohibida.

---

# 13. Portal de tutores

## 13.1 Selección

- Solo vínculos activos del tutor autenticado.
- Estudiante también debe estar activo y en el mismo tenant.
- Un ID manipulado devuelve no encontrado.

## 13.2 Áreas

### Académico

- Matrículas activas/completadas.
- Progreso.
- Tareas próximas.
- Notas publicadas.

### Asistencia

- Registros del estudiante vinculado.

### Horario

- Slots de sus cursos y eventos institucionales.

### Anuncios

- Anuncios generales o dirigidos a cursos/persona/unidad del estudiante.

### Finanzas

- Solo si capability y bandera específica están activas.

## 13.3 Revocación

Al revocar:

- El vínculo cambia a `REVOKED`.
- Se registra fecha.
- Todas las consultas dejan de encontrarlo.
- No existe reactivación automática.

---

# 14. Dashboards y navegación

## 14.1 Navegación

`navigationForRole` recibe rol y capabilities efectivas. La barra lateral no contiene destinos prohibidos.

## 14.2 Dashboard por tarea

El inicio consulta pendientes reales:

- Tareas no entregadas.
- Cobros pendientes.
- Entregas por calificar.
- Admisiones abiertas.
- Cursos y personas disponibles.

Luego construye tarjetas de atención, continuidad y resumen.

## 14.3 Limitación

Todavía no ordena sesiones concretas por fecha ni muestra modalidad. El futuro Panel Hoy reemplazará la inferencia genérica por una agenda operativa.

---

# 15. Admisiones

## Implementado

- Registrar nombre, correo, teléfono, programa, origen y notas.
- Crear en estado `INTERESTED`.
- Listar hasta 100 solicitudes.
- Calcular contadores por etapa.

## No implementado

- Detalle de solicitud.
- Cambio de etapa.
- Documentos desde UI.
- Responsable.
- Decisión.
- Conversión a estudiante.
- Inscripción/matrícula.

Por eso el módulo se considera parcial.

---

# 16. Cobros

## Implementado

- Crear cargo individual o general.
- Relacionar período.
- Monto, moneda, vencimiento, estado y notas.
- Editar registro.
- Mostrar métricas agregadas.
- Mostrar estado al estudiante.
- Mostrar al tutor si está autorizado.

## Decisión de producto

En esta etapa no habrá procesamiento electrónico. El objetivo inmediato es:

- Generación masiva.
- Marcado masivo pagado/pendiente/vencido.
- Referencia y vía externa.
- Reversión auditada.
- Instrucciones de pago.

## No se agregará ahora

- Stripe/PayPal.
- Tarjetas.
- Webhooks.
- Reembolsos.
- Conciliación.

---

# 17. Certificados

## Emisión

- Requiere matrícula elegible.
- Genera código y hash ligados a matrícula y curso.
- Guarda emisor.

## Verificación HTML

La página pública muestra:

- Institución.
- Estudiante.
- Curso.
- Fecha.
- Código.
- Estado válido/no válido.

## Verificación JSON

El handler público:

- Busca código.
- Comprueba secreto.
- Recalcula autenticidad.
- Revisa revocación.
- Devuelve 200 válido, 410 inválido/revocado, 404 inexistente o 503 sin verificación.
- Cachea brevemente el resultado público.

---

# 18. Seguridad HTTP y de contenido

## Cabeceras

Next.js añade:

- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- Permissions Policy sin cámara, micrófono ni geolocalización.

## SVG

- Se permite imagen SVG.
- Se fuerza descarga/attachment.
- Se aplica CSP sin scripts y sandbox.

## Contenido de anuncios

- No permite HTML ejecutable.
- Filtra protocolos de enlaces.
- Assets siguen privados.

## Límites

- Falta rate limiting general.
- Falta CSP global más estricta.
- Falta recuperación, MFA, rotación y monitoreo de seguridad.

---

# 19. Migraciones

Orden obligatorio:

1. `20260930000000_alpha_baseline`.
2. `20261001193000_real_edukana_mvp`.
3. `20261003231500_role_capability_overrides`.
4. `20261003234000_guardianship`.
5. `20261004111500_advanced_announcements`.
6. `20261004223000_announcement_image_mimes`.

## Propiedades

- Son acumulativas.
- La migración de anuncios preserva datos legacy.
- La migración de MIME comprueba si existe el esquema Storage antes de actualizar.
- Producción debe usar `prisma migrate deploy`, no `db push` destructivo.

---

# 20. Variables de entorno

## Runtime

- `DATABASE_URL`: pooler para consultas.
- `DIRECT_URL`: conexión para migraciones.
- `AUTH_SECRET` o `NEXTAUTH_SECRET`.
- `SUPABASE_URL`.
- `SUPABASE_SERVICE_ROLE_KEY`.
- `SUPABASE_STORAGE_BUCKET`.
- `CERTIFICATE_SECRET` opcional; puede usar `AUTH_SECRET` como fallback.

## Storage local de piloto

- `LOCAL_STORAGE_ROOT`.
- `LOCAL_STORAGE_SECRET` de 32+ caracteres.
- `APP_URL`.

## Runner Preview

- URL Preview.
- Host esperado duplicado.
- Confirmación literal `PREVIEW_ONLY`.
- Slug y cuatro correos piloto.
- Contraseña temporal.
- `KIROCREW_SCRATCH`.

Los secretos nunca deben confirmarse en Git ni imprimirse en reportes.

---

# 21. Pruebas actuales

## Suite unitario-contractual

La suite automatizada cubre:

- Protocolos seguros de enlaces.
- Render seguro de anuncios.
- MIME y tamaños.
- Audiencias y menciones.
- Privacidad de co-destinatarios.
- Cursos del docente y participación estudiantil.
- Multi-tenancy.
- Capabilities y límites por rol.
- Tutorías y concurrencia.
- Ponderación de notas.
- Conflictos de horario.
- Autocalificación.
- Progreso.
- Firma de certificados.
- Storage local firmado.
- Rutas públicas/protegidas.
- Minimización de datos.
- Navegación y UX.
- Onboarding canónico.
- Guardas del runner Preview.

## Puerta técnica

- Prisma validate/generate.
- Pruebas.
- Auth focalizada.
- TypeScript.
- ESLint.
- Build.
- Auditoría de producción.
- Diff check.

## Resultado más reciente

- Suite completa aprobada; el conteo, comandos y SHA exactos se publican juntos en el PR.
- TypeScript aprobado.
- ESLint aprobado.
- Build de 22 páginas.
- Cero vulnerabilidades de dependencias de producción con Next.js 16.4.

## Runner E2E

El escenario automatizado cubre:

1. Setup.
2. Login/relogin.
3. Usuarios y período.
4. Departamento.
5. Curso, sección y lección.
6. Libro y tarea.
7. Matrícula.
8. Tutoría.
9. Asistencia.
10. Entrega y persistencia.
11. Calificación y finalización.
12. Portal del tutor.
13. Anuncio con imagen.
14. Recepción por roles.

Todavía no se ha ejecutado contra un entorno de aceptación desplegado, nuevo y aislado. El staging existente se conserva con datos ficticios para explicar y demostrar la plataforma.

---

# 22. Validación local real ejecutada

Se levantó una base PostgreSQL vacía y se aplicaron las seis migraciones. Desde la interfaz se completó:

- Institución y administrador.
- Usuarios y período.
- Departamento.
- Curso y contenido.
- Matrícula.
- Tutoría.
- Tarea, entrega, asistencia y nota 92/100.
- Finalización.
- Anuncio multimedia.
- Cierre de sesión y reingreso.
- Restricciones por rol.
- Storage privado con acceso anónimo bloqueado.

Eso prueba el recorrido local equivalente, pero no sustituye la aceptación desplegada en Preview.

---

# 23. Despliegue actual

## Preview publicado

La rama del PR se despliega automáticamente en Vercel Preview. El SHA candidato, deployment y resultado de checks vigentes se registran juntos en el PR; este manual no fija un commit como “actual”. Un deployment exitoso demuestra compilación y publicación, no la aceptación E2E.

## Staging demostrativo

- Conserva datos ficticios para explicar cómo se ve y funciona la plataforma.
- No se resetea, vacía ni borra antes de producción.
- El runner E2E no se ejecuta allí porque su recorrido requiere una base nueva.

## Entorno de aceptación

- Debe ser nuevo, aislado de staging y producción y usar PostgreSQL y Storage allowlisted propios.
- El runner está versionado y publicado en Preview, pero todavía no se ejecutó contra ese entorno aislado.

## Producción

- No se fusionó el PR.
- No se aplicaron las nuevas migraciones como parte de este trabajo.
- No debe considerarse actualizado.

---

# 24. Estado de cada módulo

| Módulo | Estado real | Qué funciona | Bloqueo principal |
|---|---|---|---|
| Setup/login | Funcional local | Alta inicial y credenciales | Recuperación/SSO |
| Roles | Funcional | Overrides seguros por tenant | Roles personalizados/ámbitos |
| Personas | Parcial | Crear piloto, buscar y ver | CRUD/importación |
| Períodos | Básico funcional | Crear y activar | Cierre/reapertura |
| Cursos | Funcional piloto | Crear, ver y gestionar | Oferta/grupos/plantillas |
| Contenido | Funcional piloto | Secciones, lecciones y assets | Biblioteca/condiciones |
| Video | Funcional piloto | Carga y reproducción privada | Transcodificación/streaming |
| Matrícula | Funcional básica | Administrativa individual | Masiva/automatrícula |
| Tareas | Funcional básica | Crear, entregar y calificar | Reenvíos/rúbricas/grupos |
| Exámenes | Funcional básico | Tres tipos e intentos | Tipos y reglas avanzadas |
| Notas | Funcional básico | Ponderación y publicación | Cierre/boletín/historial |
| Asistencia | Funcional básica | Curso/fecha/estado | Sesión híbrida/corrección |
| Horario | Básico | Día/hora/aula/conflictos | Modalidad/sesiones/excepciones |
| Certificados | Funcional | Emisión y verificación | Diseño/renovación |
| Tutores | Funcional piloto | Acceso por vínculo y área | Acciones/digest |
| Anuncios | Funcional avanzado | Formato, audiencias y multimedia | Notificaciones/mensajes |
| Admisión | Parcial | Alta y listado | Embudo/conversión |
| Cobros | Parcial | Crear/editar/consultar | Lotes/referencias/vías |
| Calendario | Parcial | Slots y eventos | Agenda operativa |
| Analítica | Parcial | KPIs | Filtros/reportes/exportación |
| Operador SaaS | No implementado | Modelo tenant base | Consola/aprovisionamiento |

---

# 25. Decisiones de diseño importantes

## 25.1 Curso completado visible

Una matrícula completada sigue apareciendo para consulta. Se bloquean nuevas entregas, intentos y cambios de progreso.

## 25.2 Docente con lectura global

Aunque se le conceda `course.view.all`, el docente solo escribe en cursos asignados. Lectura y escritura se calculan por separado.

## 25.3 Tutor sin acceso directo a Aula

El tutor nunca entra a `/dashboard/aula`. Recibe una proyección mínima desde su portal. Incluso un curso relacionado en un anuncio se muestra sin enlace.

## 25.4 Publicador no es manager

`announcement.publish` permite publicar, pero no leer todos los anuncios privados ni ver todas las audiencias. Eso requiere `announcement.manage`.

## 25.5 Asset no confirmado no existe funcionalmente

Preparar una carga no basta. Solo se publica o lee cuando objeto real y metadatos coinciden.

## 25.6 Setup público solo con base vacía

La ruta es pública porque no existe usuario aún. Se cierra en cuanto hay una institución. Debe ejecutarse antes de compartir un despliegue recién reiniciado.

## 25.7 Cobros sin pasarela

Edukana registra obligaciones y estados. El pago real ocurre por vías externas hasta una etapa futura.

---

# 26. Límites conocidos y deuda real

## Producto

- Curso y oferta están unidos.
- Horario no modela sesión pedagógica.
- No hay panel Hoy real.
- No hay importación de usuarios.
- Admisión y cobros son parciales.
- No hay comentarios, foros ni mensajería.
- No hay recuperación de contraseña.
- No hay notificaciones por correo.

## Técnica

- No existe consola del operador.
- No hay API pública.
- No hay jobs de limpieza de cargas abandonadas.
- No hay monitoreo integral ni restore automatizado probado.
- No hay rate limiting global.
- Auditoría no cubre todas las operaciones históricas.
- No hay pruebas E2E desplegadas ejecutadas de forma continua.

## Experiencia

- Adaptable a móvil, pero no PWA/offline.
- No hay auditoría WCAG completa.
- Inglés está configurado, pero no existe sistema integral de traducción.
- Algunas pantallas muestran datos pero no permiten operar el ciclo completo.

---

# 27. Qué se construye a continuación

El orden operativo vigente está en `.kiro/PLAN.md` y sustituye cualquier secuencia anterior de este manual:

1. **S1 — seguridad y pruebas reales:** sesión viva, suspensión inmediata, recuperación, rate limiting, bootstrap protegido, PostgreSQL CI, examen temporal, URLs firmadas e historia académica mínima.
2. **S2 — identidad y personas:** identidad global, `Membership`, invitaciones e importación CSV idempotente.
3. **S3 — estructura académica:** separar curso reusable de oferta, programas, cohortes, grupos, varios docentes y matrícula masiva.
4. **S4 — semana híbrida:** patrones, sesiones concretas, participación presencial/virtual/híbrida, temporalidad sincrónica/asincrónica, contenido por sesión, Panel Hoy, asistencia y notificaciones.

Los detalles de la semana híbrida se conservan como objetivo funcional de S4, pero no autorizan adelantar sus contratos antes de cerrar S1–S3.

---

# 28. Cómo reproducir el sistema localmente

## Requisitos

- Node 22.
- npm.
- PostgreSQL/Supabase.
- Variables de entorno válidas.

## Pasos

1. Instalar dependencias con `npm ci`.
2. Crear `.env` local desde el ejemplo.
3. Ejecutar `npx prisma validate`.
4. Ejecutar `npx prisma generate`.
5. Ejecutar `npx prisma migrate deploy`.
6. Iniciar `npm run dev` o compilar y usar `npm run start`.
7. Con base vacía, abrir `/setup`.
8. Completar la puesta en marcha desde la UI.

El seed existe solo como ayuda opcional de desarrollo y no valida el MVP.

---

# 29. Cómo se verifica antes de publicar

Ejecutar:

1. Prisma validate.
2. Prisma generate.
3. `npm test`.
4. `npm run test:auth`.
5. `npm run typecheck`.
6. `npm run lint`.
7. `npm run build`.
8. `npm audit --omit=dev`.
9. `git diff --check`.
10. Runner E2E en Preview limpio.

Un resultado verde en los primeros nueve pasos no sustituye el décimo.

---

# 30. Definición actual del MVP

El MVP se considerará completo cuando una institución real y acotada pueda, en un entorno desplegado:

1. Crear su espacio y administrador.
2. Crear personas, período y departamento.
3. Crear curso y contenido.
4. Matricular estudiante.
5. Estudiar, entregar y persistir progreso.
6. Registrar asistencia y calificar.
7. Activar tutor y restringir sus datos.
8. Publicar anuncio con archivo privado.
9. Cerrar sesión y volver a comprobar todo.
10. Repetir el recorrido sin seed, SQL ni datos preparados.

El sistema construido ya completó este recorrido localmente. Falta publicarlo con el runner nuevo y repetirlo en Preview limpio para declarar el MVP desplegado.
