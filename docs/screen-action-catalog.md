# Catálogo funcional de pantallas y acciones de Edukana

**Tipo de documento:** contrato funcional de interfaz
**Objetivo:** explicar qué ocurre al entrar a cada pantalla y qué hace cada botón, enlace, selector o acción
**Complementa:** `detailed-functional-blueprint.md` y `platform-capability-roadmap.md`
**Criterio:** se separa estrictamente lo implementado de lo planificado.

---

## 1. Cómo leer este documento

### Estados

- **ACTUAL:** el control existe en la aplicación.
- **PARCIAL:** existe, pero su recorrido aún no cubre toda la operación esperada.
- **PLANIFICADO:** se agregará según el blueprint.
- **DIFERIDO:** no forma parte de la etapa inmediata.

### Campos de cada pantalla

- **Ruta:** dirección interna.
- **Acceso:** roles o capacidades necesarias.
- **Propósito:** trabajo que resuelve.
- **Al entrar:** datos y estados que carga.
- **Acciones:** botones, enlaces, selectores y resultado.
- **Reglas:** validación, permisos y efectos secundarios.
- **Vacíos:** lo que todavía no puede hacerse.

### Reglas comunes de interacción

1. La institución siempre se obtiene de la sesión.
2. Un control oculto no sustituye una validación de servidor.
3. Al enviar un formulario, el botón queda deshabilitado mientras se procesa.
4. El resultado muestra confirmación o error sin perder el contexto.
5. Las acciones sensibles requieren confirmación cuando corresponde.
6. Una referencia a otro tenant no debe revelar si el recurso existe.
7. Los archivos privados se autorizan nuevamente al descargarse.
8. En móvil se mantienen las mismas capacidades, con navegación adaptada.

---

# PARTE I — PANTALLAS ACTUALES

# 2. Entrada pública

## 2.1 Página raíz

- **Ruta:** `/`
- **Estado:** ACTUAL
- **Acceso:** público.
- **Propósito:** decidir el destino inicial.
- **Al entrar:** redirige al dashboard si existe sesión válida o al login si no existe.
- **Acciones visibles:** ninguna.

## 2.2 Crear primera institución

- **Ruta:** `/setup`
- **Estado:** ACTUAL
- **Acceso:** público únicamente mientras no exista ninguna institución.
- **Propósito:** crear el primer tenant y su administrador sin seed ni SQL manual.

### Al entrar

- Cuenta cuántas instituciones existen.
- Si existe al menos una, redirige a `/login`.
- Si la base está vacía, muestra el formulario inicial.

### Campos

- Nombre de la institución.
- Identificador del espacio.
- Nombre del administrador.
- Correo del administrador.
- Contraseña.

### Acciones

| Control | Qué hace | Resultado |
|---|---|---|
| **Crear institución** | Valida datos, crea institución, administrador y auditoría dentro de una transacción serializable. | Muestra “Institución creada” y bloquea nuevos envíos. |
| **Iniciar sesión** | Aparece después de crear correctamente. | Navega a `/login`. |

### Reglas

- Slug con minúsculas, números y guiones.
- Contraseña de al menos 10 caracteres, con letra y número.
- Correo y slug no pueden estar repetidos.
- Dos altas concurrentes no pueden crear dos primeras instituciones.
- Después del alta, la ruta se cierra automáticamente.

## 2.3 Inicio de sesión

- **Ruta:** `/login`
- **Estado:** ACTUAL
- **Acceso:** público.
- **Propósito:** autenticar a cualquier rol.

### Campos

- Correo electrónico.
- Contraseña.

### Acciones

| Control | Qué hace | Resultado |
|---|---|---|
| **Ingresar** | Envía las credenciales a Auth.js sin incluirlas en la URL. | Abre el callback solicitado o `/dashboard`. |
| **Crear la primera institución** | Enlace auxiliar para bases nuevas. | Abre `/setup`; esta ruta se cierra si ya existe una institución. |
| **Escríbenos** | Abre el cliente de correo del usuario. | Prepara un mensaje a soporte; no recupera automáticamente la cuenta. |

### Reglas y vacíos

- Credenciales incorrectas muestran un error genérico.
- Falta recuperación de contraseña, invitaciones, SSO y MFA.

---

# 3. Navegación global autenticada

## 3.1 Barra lateral de escritorio

- Muestra solo destinos permitidos por rol y capacidades efectivas.
- El logo **Edukana** vuelve al dashboard.
- El destino activo se resalta.
- **Cerrar sesión** termina la sesión y regresa a `/login`.
- El bloque inferior muestra nombre y correo del usuario.

## 3.2 Menú móvil

| Control | Qué hace |
|---|---|
| **Menú** | Abre la lista de destinos permitidos. |
| Cada destino | Navega y cierra el menú. |
| **Cerrar sesión** | Termina la sesión y vuelve al login. |

## 3.3 Breadcrumbs

- Muestran la jerarquía de la ruta.
- Los segmentos anteriores son enlaces.
- En móvil aparece un enlace de regreso al padre inmediato.

## 3.4 Saltar al contenido principal

- Primer enlace accesible del dashboard.
- Permite a teclado y lector de pantalla omitir la navegación repetida.

---

# 4. Inicio por rol

## 4.1 Dashboard

- **Ruta:** `/dashboard`
- **Estado:** ACTUAL/PARCIAL
- **Acceso:** toda sesión válida.
- **Propósito:** indicar qué necesita atención y ofrecer accesos rápidos.

### Al entrar

El contenido cambia por rol:

- **Estudiante:** cursos activos, tareas y cobros pendientes.
- **Docente:** cursos, estudiantes permitidos y entregas por calificar.
- **Administrador/coordinación:** cursos, personas, admisiones y anuncios según permisos.
- **Tutor:** número de estudiantes vinculados.
- **Otros casos:** anuncios disponibles.

### Acciones dinámicas

| Tarjeta o enlace | Quién la ve | Qué hace |
|---|---|---|
| **Completar tareas** | Estudiante con tareas pendientes | Abre el portal estudiantil. |
| **Revisar estado de cuenta** | Estudiante con cobros pendientes | Abre el portal estudiantil en el contexto donde se muestra la cuenta. |
| **Continuar aprendiendo** | Estudiante | Abre sus cursos y tareas. |
| **Ver próximas fechas** | Quien tiene `schedule.view` | Abre el calendario actual. |
| **Calificar entregas** | Docente con entregas pendientes | Abre Aula; todavía no navega directamente a una entrega concreta. |
| **Continuar en mis cursos** | Docente | Abre Aula con cursos asignados. |
| **Ver estudiantes por curso** | Docente autorizado | Abre Aula. |
| **Revisar admisiones** | Rol autorizado | Abre solicitudes. |
| **Gestionar cursos** | Administración/coordinación | Abre Aula. |
| **Consultar personas** | Quien posee `people.view` | Abre Gestión estudiantil. |
| **Publicar un aviso** | Quien puede publicar | Abre Comunidad. |
| **Abrir Mis hijos** | Tutor autorizado | Abre el portal de tutores. |
| **Leer/Consultar avisos** | Usuario con anuncios disponibles | Abre Comunidad. |
| Tarjetas de **Resumen** | Según rol | Abren el módulo correspondiente. |

### Vacíos

- No existe todavía un panel “Hoy” con sesiones híbridas, próxima clase y vencimientos ordenados cronológicamente.
- Las tarjetas no siempre abren el elemento concreto que requiere atención.

---

# 5. Configuración institucional

## 5.1 Configuración

- **Ruta:** `/dashboard/configuracion`
- **Estado:** ACTUAL/PARCIAL
- **Acceso:** `tenant.settings.manage`.
- **Propósito:** configurar información institucional y abrir submódulos.

### Enlaces

| Control | Condición | Qué hace |
|---|---|---|
| **Puesta en marcha del piloto** | Gestiona personas y estructura académica | Abre creación de cuentas y período. |
| **Roles y permisos** | `roles.permissions.manage` | Abre matriz de capacidades. |
| **Tutores y estudiantes** | `guardianship.manage` | Abre vínculos y permisos familiares. |
| **Departamentos y unidades** | Puede administrar unidades | Abre estructura organizacional. |

### Formulario institucional

| Campo/control | Qué hace |
|---|---|
| Nombre | Cambia el nombre institucional visible. |
| Tipo | Selecciona colegio, universidad, instituto, academia u otro. |
| Dominio | Guarda el dominio deseado; todavía no verifica DNS ni configura despliegue. |
| Zona horaria | Define la referencia institucional de fechas y horas. |
| Idioma | Selecciona español o inglés; la traducción integral aún es parcial. |
| **Actualizar institución** | Valida y persiste los valores en el tenant actual. |

### Vacíos

- Falta marca visual completa, validación de dominio, módulos, terminología y configuración de vías de pago.

## 5.2 Puesta en marcha del piloto

- **Ruta:** `/dashboard/configuracion/puesta-en-marcha`
- **Estado:** ACTUAL
- **Acceso:** `people.manage` y `academic.structure.manage`.
- **Propósito:** preparar el conjunto mínimo de personas y período.

### Checklist

Muestra si existen:

- Docente.
- Estudiante.
- Tutor.
- Período activo.
- Departamento.
- Vínculo activo.

### Crear cuenta

| Control | Qué hace |
|---|---|
| Rol | Elige docente, estudiante o tutor. No permite crear administradores. |
| **Crear usuario** | Valida nombre, correo, rol y contraseña; crea cuenta activa y auditoría. |

### Crear período académico

| Control | Qué hace |
|---|---|
| Inicio/fin | Define las fechas del período. |
| **Crear período** | Desactiva el período activo anterior, crea el nuevo y lo activa. |

### Enlaces inferiores

- **Configurar roles y permisos**.
- **Crear departamento**.
- **Vincular tutor**.

### Vacíos

- No edita, suspende ni importa usuarios.
- No administra programas, cohortes, grupos ni ofertas.

## 5.3 Roles y permisos

- **Ruta:** `/dashboard/configuracion/roles`
- **Estado:** ACTUAL
- **Acceso:** `roles.permissions.manage`.
- **Propósito:** aplicar excepciones institucionales a los permisos permitidos por cada rol.

### Acciones

| Control | Qué hace |
|---|---|
| **Rol institucional** | Cambia la matriz visual al rol seleccionado. |
| **Buscar permisos** | Filtra capacidades por nombre, descripción o grupo. |
| Checkbox de capacidad | Prepara concesión o revocación; no guarda inmediatamente. |
| **Guardar permisos** | Envía únicamente cambios explícitos y conserva capacidades fuera de la autoridad del actor. |
| Confirmación crítica | Aparece para cambios sensibles. Cancelar evita guardar. |

### Reglas

- El actor no puede conceder ni retirar lo que no posee.
- `SUPER_ADMIN` y capacidades críticas de `ADMIN` están protegidos.
- Los límites permitidos por rol no pueden ampliarse desde la interfaz.
- Los cambios solo afectan la institución actual y generan auditoría.

## 5.4 Departamentos y unidades

- **Ruta:** `/dashboard/configuracion/unidades`
- **Estado:** ACTUAL/PARCIAL
- **Propósito:** agrupar personas para organización y segmentación.

### Acciones

| Control | Qué hace |
|---|---|
| **Crear unidad** | Crea una unidad con nombre único dentro del tenant. |
| **Guardar nombre** | Renombra la unidad. |
| **Asignar persona** | Agrega un miembro activo de la misma institución. |
| Chip o selector de persona | Elige quién se asignará. |
| **Retirar** | Elimina la membresía, no elimina a la persona. |

### Vacíos

- El modelo admite jerarquía, pero la UI actual no configura padre/hijos.
- Faltan sedes, puestos, responsables y equipos.

## 5.5 Tutores y estudiantes

- **Ruta:** `/dashboard/configuracion/tutores`
- **Estado:** ACTUAL
- **Acceso:** `guardianship.manage`.

### Crear vínculo

| Control | Qué hace |
|---|---|
| Tutor | Selecciona cuenta `PARENT` activa. |
| Estudiante | Selecciona cuenta `STUDENT` activa. |
| Relación | Define madre, padre, tutor legal u otro vínculo. |
| Académico | Autoriza progreso y notas publicadas. |
| Asistencia | Autoriza registros de asistencia. |
| Horario | Autoriza calendario y horario. |
| Avisos | Autoriza anuncios relevantes. |
| Finanzas | Autoriza cobros; solo aparece utilizable si el actor posee la capacidad correspondiente. |
| **Crear pendiente** | Crea el vínculo sin conceder acceso todavía. |

### Administrar vínculo existente

| Control | Qué hace |
|---|---|
| Checkboxes de áreas | Preparan cambios permitidos. |
| **Guardar permisos** | Aplica deltas con control de concurrencia. |
| **Activar vínculo** | Requiere confirmación; concede acceso a las áreas activadas. |
| **Revocar vínculo** | Requiere confirmación; corta inmediatamente nuevas consultas y es terminal en el MVP. Los enlaces privados ya emitidos conservan una ventana residual nominal de hasta 300 segundos. |

---

# 6. Gestión de personas

## 6.1 Gestión estudiantil

- **Ruta:** `/dashboard/gestion`
- **Estado:** ACTUAL/PARCIAL
- **Acceso:** `people.view`.

### Acciones

| Control | Qué hace |
|---|---|
| **Buscar por nombre o correo** | Envía el término en `q`, limita longitud y filtra dentro del tenant. |
| Nombre del estudiante | Abre el perfil del estudiante. |

### Vacíos

- Solo lista estudiantes activos.
- No crea, edita, suspende, importa ni exporta desde esta pantalla.

## 6.2 Perfil del estudiante

- **Ruta:** `/dashboard/gestion/estudiantes/[studentId]`
- **Estado:** ACTUAL/PARCIAL
- **Acceso:** `people.view`; docentes solo pueden abrir estudiantes de sus propios cursos.

### Acciones

| Control | Qué hace |
|---|---|
| **Volver a estudiantes** | Regresa al directorio filtrable. |
| Tarjeta de curso | Abre el curso si está dentro del alcance del actor. |

### Información

- Identidad y contacto permitido.
- Matrículas, calificación final y asistencia resumida.
- Cobros solo si el actor posee `finance.manage`.

### Vacíos

- Falta edición del perfil, documentos, historial, programa/cohorte y acciones administrativas.

---

# 7. Aula y cursos

## 7.1 Lista de cursos

- **Ruta:** `/dashboard/aula`
- **Estado:** ACTUAL
- **Acceso:** `course.view`.

### Al entrar

- Estudiante: solo cursos con matrícula activa o completada.
- Docente: cursos asignados.
- Roles con alcance global: cursos autorizados del tenant.
- Tutor: no entra directamente.

### Acciones

| Control | Quién | Qué hace |
|---|---|---|
| **Crear un curso** | Docente con `course.manage` | Abre/cierra el formulario. |
| Período activo | Docente | Elige el período institucional. |
| **Crear curso** | Docente | Crea el curso asignándolo al docente autenticado. |
| Tarjeta del curso | Usuario autorizado | Abre el detalle del curso. |

### Vacíos

- Falta separar curso reusable de oferta concreta.
- Falta copiar, archivar, agrupar y asignar co-docentes.

## 7.2 Detalle del curso

- **Ruta:** `/dashboard/aula/[courseId]`
- **Estado:** ACTUAL, con áreas parciales.
- **Acceso:** según alcance central de curso.

### Navegación interna

| Control | Qué hace |
|---|---|
| Resumen | Salta al resumen. |
| Contenido | Salta a la ruta de aprendizaje. |
| Estudiantes | Visible solo con permiso de roster. |
| Tareas/exámenes | Salta a evaluaciones. |
| Calificaciones | Salta al libro de notas. |
| Asistencia | Salta al registro. |
| **Más** | Despliega Horario y Certificados. |
| Selector móvil | Cumple la misma navegación sin scroll horizontal. |
| Tarjetas numéricas del resumen | Saltan al área correspondiente. |

## 7.3 Ruta de aprendizaje

| Control | Quién | Qué hace |
|---|---|---|
| **Nueva sección** | Gestor del curso | Abre formulario de sección. |
| **Crear sección** | Gestor | Crea sección, descripción y estado publicado. |
| **Agregar lección** | Gestor | Abre formulario dentro de una sección. |
| Tipo de lección | Gestor | Selecciona texto, video, documento o actividad. |
| **Crear lección** | Gestor | Crea contenido, duración y publicación. |
| **Adjuntar documento o video** | Gestor | Abre los cargadores privados de la lección. |
| **Subir documento** | Gestor | Solicita URL firmada, carga directo a Storage y confirma el archivo. |
| **Subir video** | Gestor | Hace el mismo flujo para MP4/WebM. |
| Descargar archivo | Usuario autorizado | Autoriza nuevamente y redirige a URL firmada temporal. |
| Reproductor de video | Usuario autorizado | Reproduce el archivo privado. |
| **Marcar como completada** | Estudiante activo | Registra progreso; no finaliza automáticamente la matrícula. |

## 7.4 Estudiantes y matrícula

| Control | Quién | Qué hace |
|---|---|---|
| **Ver perfil del estudiante** | Gestor autorizado | Abre su perfil dentro del alcance. |
| **Matricular estudiante** | Actor con `enrollment.manage` | Abre formulario. |
| Selector de estudiante | Actor autorizado | Solo muestra estudiantes activos aún no matriculados. |
| **Matricular estudiante** del formulario | Actor autorizado | Crea matrícula activa y auditoría. |

## 7.5 Asignaciones y entregas

| Control | Quién | Qué hace |
|---|---|---|
| **Nueva asignación** | Gestor | Abre formulario. |
| **Crear tarea** | Gestor | Crea instrucciones, categoría, vencimiento, puntuación y publicación. |
| **Publicar / Retirar publicación** | Gestor | Cambia visibilidad de la tarea. |
| **Entregar tarea** | Estudiante | Guarda o actualiza la entrega activa. |
| **Subir documento** | Estudiante | Adjunta archivo privado a su entrega. |
| **Calificar entrega** | Gestor | Registra puntuación y retroalimentación. |

### Reglas

- Curso completado queda en modo consulta para el estudiante.
- El docente solo modifica sus cursos.
- La entrega pertenece al estudiante y matrícula autenticados.

## 7.6 Banco de preguntas y exámenes

| Control | Quién | Qué hace |
|---|---|---|
| **Agregar pregunta al banco** | Gestor | Abre formulario de pregunta. |
| **Agregar pregunta** | Gestor | Crea pregunta reutilizable básica. |
| **Crear examen desde el banco** | Gestor | Abre configuración de examen. |
| **Crear examen** | Gestor | Crea examen, intentos, duración y publicación. |
| Opciones/radio o respuesta | Estudiante | Registra respuestas del intento. |
| **Enviar examen** | Estudiante | Cierra y califica automáticamente lo objetivo. |
| **Calificar examen** | Gestor | Revisa respuestas cortas y completa puntuación. |

### Tipos actuales

- Opción múltiple.
- Verdadero/falso.
- Respuesta corta.

## 7.7 Libro de calificaciones

| Control | Quién | Qué hace |
|---|---|---|
| **Crear libro de calificaciones** | Gestor | Crea período y categorías ponderadas iniciales. |
| **Publicar** | Gestor | Hace visible el período y sus resultados autorizados. |
| **Retirar publicación** | Gestor | Oculta el período a estudiante/tutor. |

### Vacíos

- Falta editor de categorías, fórmulas, rúbricas, escalas, importación y cierre formal.

## 7.8 Asistencia

| Control | Quién | Qué hace |
|---|---|---|
| **Tomar asistencia** | Gestor | Abre formulario de sesión por fecha. |
| Estado por estudiante | Gestor | Selecciona presente, ausente, tarde o justificado. |
| Nota de asistencia | Gestor | Añade contexto del registro. |
| **Registrar asistencia** | Gestor | Crea sesión y registros; fecha se interpreta en UTC para evitar desplazamiento. |

### Vacíos

- No distingue presencial, remoto o asincrónico.
- No permite corrección auditada desde la interfaz.
- No está ligada a una sesión pedagógica concreta.

## 7.9 Horario

| Control | Quién | Qué hace |
|---|---|---|
| **Agregar bloque sin conflictos** | Gestor | Abre formulario semanal. |
| Día, aula, inicio y fin | Gestor | Define slot recurrente básico. |
| **Agregar bloque al horario** | Gestor | Valida hora, aula y conflicto de docente antes de guardar. |

### Vacíos críticos

- No configura modalidad, sede, enlace, contenido, recurrencia avanzada ni excepciones.
- No existe botón para cambiar una clase concreta a virtual.
- El diseño objetivo está documentado en el blueprint detallado.

## 7.10 Finalización y certificados

| Control | Quién | Qué hace |
|---|---|---|
| **Finalizar curso** | Gestor | Cambia matrícula a completada si cumple la regla requerida y audita. |
| **Reabrir curso** | Gestor | Devuelve matrícula a estado activo y audita. |
| **Emitir certificado** | Gestor | Genera certificado verificable para matrícula elegible. |
| Código del certificado | Usuario autorizado | Abre la página pública verificable. |

---

# 8. Portal estudiantil

- **Ruta:** `/dashboard/portal`
- **Estado:** ACTUAL/PARCIAL
- **Acceso:** estudiante con `student.portal.view`.

### Acciones

| Control | Qué hace |
|---|---|
| Nombre de curso | Abre el curso. |
| Tarjetas de tareas | Actualmente informativas; muestran entrega, nota o vencimiento. |
| Estado de cuenta | Actualmente informativo. |

### Vacíos

- Falta botón directo “Continuar”.
- Falta panel de próxima clase y agenda cronológica.
- Falta enlace directo a cada tarea.
- Falta información de vías externas de pago.

---

# 9. Portal de tutores

- **Ruta:** `/dashboard/hijos`
- **Estado:** ACTUAL/PARCIAL
- **Acceso:** tutor con `child.portal.view` y vínculo activo.

### Acciones

| Control | Qué hace |
|---|---|
| Chip con nombre del estudiante | Cambia el estudiante seleccionado. Solo admite vínculos activos propios. |
| **Abrir enlace relacionado** | Abre enlace seguro del anuncio. |
| Reproductor/imagen del anuncio | Muestra archivo privado autorizado por vínculo y audiencia. |

### Secciones condicionadas

- Progreso y notas.
- Asistencia.
- Horario y eventos.
- Avisos.
- Estado de cuenta.

Cada sección exige simultáneamente capability institucional y bandera del vínculo.

### Vacíos

- Falta justificar ausencias, confirmar comunicaciones, descargar boletín y ver instrucciones de pago.

---

# 10. Comunidad y anuncios

- **Ruta:** `/dashboard/comunidad`
- **Estado:** ACTUAL
- **Acceso:** toda persona ve anuncios de su audiencia; publicar exige capability.

## 10.1 Lista de anuncios

| Control | Qué hace |
|---|---|
| Curso relacionado enlazado | Abre el curso solo si el usuario puede entrar. |
| Curso informativo | Para tutor u otro usuario sin acceso, muestra información sin enlace. |
| **Abrir enlace** | Abre únicamente HTTPS o `mailto`. |
| Imagen/video | Carga desde endpoint autorizado de archivo privado. |

## 10.2 Crear anuncio

| Control | Qué hace |
|---|---|
| **Crear anuncio** | Abre/cierra el compositor. |
| **Editar** | Muestra textarea y barra de formato. |
| **Vista previa** | Renderiza el comunicado seguro sin publicarlo. |
| **Título** de formato | Inserta encabezado Markdown. |
| **Negrita** | Envuelve selección con énfasis fuerte. |
| **Cursiva** | Envuelve selección con cursiva. |
| **Lista** | Convierte líneas seleccionadas en lista. |
| **Lista numerada** | Añade numeración. |
| **Cita** | Añade bloque de cita. |
| **Enlace** | Inserta plantilla de enlace HTTPS. |
| Toda la institución | Selecciona como audiencia a personas activas del tenant. |
| Checkboxes de roles | Añaden roles destinatarios. |
| Checkboxes de cursos | Añaden matrículas y docentes de cursos destinatarios. |
| Checkboxes de personas | Añaden destinatarios explícitos si el actor puede ver personas. |
| Checkboxes de unidades | Añaden miembros de departamentos. |
| Chip seleccionado | Retira ese elemento de la audiencia. |
| Buscadores | Filtran opciones sin cambiar la selección. |
| Insertar mención | Añade token seguro de una persona; el servidor exige que esté dentro de audiencia. |
| Botón/enlace destacado | Guarda enlace separado del cuerpo. |
| Cursos relacionados | Añade tarjetas de contexto. |
| Selector/arrastre de archivos | Carga imágenes o videos privados. |
| **Retirar** archivo | Borra el asset preparado y lo quita del anuncio. |
| Fijar anuncio | Coloca el anuncio en la parte superior. |
| **Revisar anuncio** | Valida formulario y audiencia; no publica. |
| **Volver a editar** | Cierra revisión conservando el contenido. |
| **Confirmar publicación** | Persiste anuncio, audiencias, menciones, cursos y assets confirmados. |

---

# 11. Calendario

- **Ruta:** `/dashboard/calendario`
- **Estado:** ACTUAL/PARCIAL
- **Acceso:** `schedule.view`.
- **Al entrar:** muestra slots autorizados y eventos institucionales.
- **Acciones:** actualmente no tiene botones; es una vista informativa.
- **Vacíos:** filtros, vista mensual/semanal, próxima sesión, modalidad, reprogramación, iCal y recordatorios.

---

# 12. Admisiones

- **Ruta:** `/dashboard/admisiones`
- **Estado:** PARCIAL
- **Acceso:** `admissions.manage`.

### Acciones

| Control | Qué hace |
|---|---|
| **Nueva solicitud** | Abre/cierra el formulario. |
| Origen | Selecciona web, referido, presencial u otro. |
| **Registrar solicitud** | Crea un lead en etapa “Interesado”. |

### Vista

- Indicadores por etapa.
- Tabla con aspirante, programa, origen, fecha y estado.

### Vacíos

- No abre detalle, cambia etapa, adjunta documentos, asigna responsable ni convierte a estudiante.

---

# 13. Cobros

- **Ruta:** `/dashboard/pagos`
- **Nombre visible:** Cobros.
- **Estado:** PARCIAL
- **Acceso:** `finance.manage`.

### Acciones

| Control | Qué hace |
|---|---|
| **Registrar pago o cargo** | Abre formulario nuevo. |
| Estudiante | Asigna cargo individual o general. |
| Período | Relaciona el concepto con período. |
| Concepto/monto/moneda/vencimiento | Define obligación. |
| Estado | Selecciona pendiente, pagado, parcial, vencido o cancelado. |
| **Registrar pago** | Crea registro. |
| **Editar este pago** o concepto en tabla | Abre formulario existente. |
| **Actualizar pago** | Modifica el registro dentro del tenant. |

### Vacíos de la etapa acordada

- Marcar pagado masivamente.
- Generar cargos por grupo/cohorte.
- Referencia, método externo y reversión auditada.
- Instrucciones de vías de pago para estudiante/tutor.
- Exportación.

### Fuera de alcance actual

- Tarjetas, pasarela, webhooks, reembolsos y conciliación.

---

# 14. Analítica

- **Ruta:** `/dashboard/analitica`
- **Estado:** PARCIAL
- **Acceso:** `analytics.view`.
- **Acciones:** actualmente no tiene controles interactivos.
- **Muestra:** estudiantes, docentes, cursos, matrículas, tasa de admisión, total facturado/cobrado y estudiantes recientes.
- **Vacíos:** filtros, drill-down, exportación, programación y analítica de riesgo.

---

# 15. Certificado público

- **Ruta:** `/certificados/[code]`
- **Estado:** ACTUAL
- **Acceso:** público mediante código.

### Acciones

| Control | Qué hace |
|---|---|
| **Ver registro JSON firmado** | Abre representación JSON verificable. |

### Estado mostrado

- Válido si firma, identidad y revocación son correctas.
- No válido si falta secreto, fue revocado o la firma no coincide.

---

# 16. Estados de error

## Recurso no encontrado

| Control | Qué hace |
|---|---|
| **Volver al inicio** | Regresa a `/dashboard`. |

El mismo estado se usa para recurso inexistente o fuera de la institución, evitando filtración.

## Error de sección

| Control | Qué hace |
|---|---|
| **Reintentar** | Pide a Next.js volver a renderizar la sección. |

---

# PARTE II — PANTALLAS QUE SE AGREGARÁN

# 17. Panel “Hoy”

- **Ruta prevista:** `/dashboard/hoy` o evolución de `/dashboard`.
- **Estado:** PLANIFICADO.

### Controles previstos

| Control | Qué hará |
|---|---|
| **Entrar a clase** | Abre sala virtual de la sesión vigente, dentro de la ventana permitida. |
| **Ver ubicación** | Muestra sede, edificio y aula. |
| **Prepararme** | Abre materiales previos de la sesión. |
| **Continuar actividad** | Abre exactamente la lección o tarea pendiente. |
| **Entregar ahora** | Abre tarea concreta. |
| **Ver cambio** | Explica una reprogramación o cambio de modalidad. |
| **Marcar notificación leída** | Actualiza bandeja personal. |
| Filtros Hoy/Semana | Cambian horizonte temporal sin perder rol ni alcance. |

---

# 18. Constructor de oferta, grupo y horario híbrido

- **Ruta prevista:** `/dashboard/academico/ofertas/[offeringId]/horario`.
- **Estado:** PLANIFICADO.

### Acciones de patrón

| Control | Qué hará |
|---|---|
| **Agregar patrón** | Abre configuración recurrente. |
| Participación | Presencial, virtual o híbrida. |
| Temporalidad | Sincrónica o asincrónica; la segunda usa una ventana de disponibilidad. |
| Tipo pedagógico | Clase, práctica, evaluación o evento. |
| Día/frecuencia | Semanal o quincenal con vigencia. |
| Hora y zona | Define inicio, fin y zona horaria. |
| Sede/aula | Requeridos para presencial/híbrida. |
| Sala virtual | Requerida para virtual/híbrida. |
| **Comprobar conflictos** | Valida docente, grupo, aula, capacidad y traslados. |
| **Previsualizar sesiones** | Muestra todas las fechas que se materializarán. |
| **Guardar patrón** | Persiste patrón y genera sesiones futuras. |
| **Duplicar patrón** | Crea copia editable para otro día/grupo. |
| **Archivar patrón** | Detiene nuevas sesiones sin borrar historial. |

### Acciones masivas

| Control | Qué hará |
|---|---|
| **Aplicar a futuras sesiones** | Cambia solo sesiones no iniciadas desde una fecha. |
| **Regenerar calendario** | Recalcula fechas respetando excepciones y feriados. |
| **Publicar horario** | Hace visible el horario y notifica diferencias. |
| **Exportar** | Genera CSV/iCal dentro del alcance autorizado. |

---

# 19. Detalle de sesión de clase

- **Ruta prevista:** `/dashboard/sesiones/[sessionId]`.
- **Estado:** PLANIFICADO.

### Al entrar

Muestra modalidad efectiva, fecha, hora, aula/enlace, docentes, grupo, objetivos, contenido, preparación, asistencia, grabación, actividades y cambios.

### Acciones docentes

| Control | Qué hará |
|---|---|
| **Editar sesión** | Modifica título, objetivos, temas y resumen. |
| **Cambiar a virtual** | Solicita sala/enlace, motivo y audiencia; solo afecta esta sesión por defecto. |
| **Cambiar a presencial** | Solicita sede/aula y valida capacidad/conflictos. |
| **Marcar híbrida** | Conserva aula y añade sala virtual. |
| **Reprogramar** | Cambia fecha/hora con validación y notificación. |
| **Cancelar sesión** | Requiere motivo; conserva registro y notifica. |
| **Agregar sesión extraordinaria** | Crea sesión fuera del patrón. |
| **Asignar sustituto** | Cambia docente efectivo sin alterar titular del curso. |
| **Publicar agenda** | Hace visibles objetivos y bloques. |
| **Añadir material** | Vincula contenido, archivo, enlace o lección. |
| **Programar publicación** | Decide si el recurso aparece antes, durante o después. |
| **Crear tarea desde sesión** | Prellena curso, grupo y fecha. |
| **Tomar asistencia** | Abre lista ligada a la sesión. |
| **Completar sesión** | Cierra ejecución y habilita trabajo posterior. |
| **Publicar grabación** | Autoriza y muestra video grabado. |

### Acciones del estudiante

| Control | Qué hará |
|---|---|
| **Entrar a clase** | Abre sala dentro de la ventana configurada. |
| **Abrir material** | Muestra recurso autorizado. |
| **Confirmar que vi el cambio** | Registra lectura cuando la institución lo exige. |
| **Ver grabación** | Reproduce archivo autorizado. |
| **Realizar actividad** | Abre actividad ligada a la sesión. |

---

# 20. Calendario avanzado

- **Ruta prevista:** `/dashboard/calendario` evolucionada.

### Controles previstos

| Control | Qué hará |
|---|---|
| Día/Semana/Mes/Agenda | Cambia representación. |
| Mis cursos/Todo autorizado | Filtra alcance. |
| Modalidad | Filtra presencial, virtual, híbrida o asincrónica. |
| **Nueva sesión** | Crea evento o sesión extraordinaria según permisos. |
| Arrastrar sesión | Propone reprogramación; requiere confirmación y validación. |
| **Abrir sesión** | Abre detalle pedagógico. |
| **Exportar calendario** | Descarga iCal. |
| **Sincronizar** | Conecta Google/Microsoft en etapa posterior. |

---

# 21. Biblioteca y constructor de contenido

### Controles previstos

| Control | Qué hará |
|---|---|
| **Nuevo recurso** | Elige página, libro, archivo, carpeta, enlace o actividad. |
| **Subir archivos** | Carga múltiple privada con progreso. |
| **Crear página** | Abre editor enriquecido seguro. |
| **Crear libro** | Crea capítulos y subcapítulos. |
| **Mover** | Reordena dentro de curso/sección. |
| **Duplicar** | Copia recurso conservando origen. |
| **Guardar como plantilla** | Publica plantilla al alcance autorizado. |
| **Programar** | Define disponibilidad. |
| **Añadir condición** | Fecha, grupo, nota o finalización previa. |
| **Vista previa como estudiante** | Renderiza respetando una identidad simulada autorizada. |
| **Publicar** | Cambia estado y notifica si corresponde. |
| **Restaurar versión** | Crea una nueva versión basada en una anterior. |

---

# 22. Personas e importación masiva

### Controles previstos

| Control | Qué hará |
|---|---|
| **Nueva persona** | Crea perfil y opcionalmente acceso. |
| **Importar CSV** | Carga archivo sin aplicar aún. |
| **Mapear columnas** | Relaciona CSV con campos. |
| **Validar importación** | Muestra errores por fila y duplicados. |
| **Descargar errores** | Exporta filas rechazadas. |
| **Confirmar importación** | Crea solo registros válidos dentro del tenant. |
| **Invitar** | Envía activación de cuenta. |
| **Suspender** | Corta acceso y sesiones con confirmación. |
| **Reactivar** | Restablece acceso. |
| **Editar perfil** | Cambia datos permitidos y audita. |
| **Exportar** | Genera archivo según alcance y privacidad. |

---

# 23. Programas, cohortes, ofertas y grupos

### Pantallas previstas

- Programas.
- Plan curricular.
- Cohortes.
- Ofertas del período.
- Grupos y participantes.

### Acciones principales

| Control | Qué hará |
|---|---|
| **Crear programa** | Define nombre, código, duración y estado. |
| **Añadir nivel/módulo** | Construye secuencia académica. |
| **Añadir curso** | Vincula curso reusable al plan. |
| **Nueva cohorte** | Define fechas, sede y capacidad. |
| **Generar ofertas** | Crea ofertas a partir del plan. |
| **Crear grupo** | Segmenta estudiantes dentro de oferta. |
| **Asignar docente** | Define titular, asistente o sustituto. |
| **Matricular** | Añade estudiante individualmente. |
| **Matrícula masiva** | Previsualiza y confirma lote. |
| **Mover de grupo** | Conserva historial y ajusta sesiones futuras. |
| **Cerrar oferta** | Bloquea nuevas operaciones y conserva consulta. |

---

# 24. Admisión completa

### Controles previstos

| Control | Qué hará |
|---|---|
| **Abrir convocatoria** | Publica programas y fechas. |
| **Configurar formulario** | Define campos y documentos. |
| **Enviar solicitud** | Candidato registra su caso. |
| **Asignar responsable** | Entrega seguimiento a un actor. |
| **Solicitar documento** | Notifica faltante. |
| **Mover de etapa** | Actualiza embudo con motivo. |
| **Aceptar** | Registra decisión, no crea matrícula aún. |
| **Rechazar** | Requiere motivo y conserva historial. |
| **Convertir a estudiante** | Reutiliza datos y crea identidad/membresía. |
| **Inscribir en programa** | Asigna cohorte y prepara matrícula. |

---

# 25. Cobros administrativos completos

### Controles previstos

| Control | Qué hará |
|---|---|
| **Nuevo concepto** | Crea matrícula, mensualidad, material u otro. |
| **Generar cargos** | Elige programa, cohorte, grupo o personas. |
| **Previsualizar lote** | Muestra destinatarios, montos y excepciones. |
| **Confirmar cargos** | Crea obligaciones auditadas. |
| Selección múltiple | Elige cargos a actualizar. |
| **Marcar pagados** | Solicita fecha, vía externa, referencia y nota. |
| **Marcar pendientes/vencidos** | Cambia estado autorizado. |
| **Exonerar** | Requiere motivo. |
| **Revertir registro** | No borra; crea corrección auditada. |
| **Configurar vías de pago** | Define transferencia, depósito, caja o enlace externo. |
| **Enviar recordatorio** | Notifica cargos seleccionados. |
| **Exportar estado de cuenta** | Genera CSV/PDF. |

No habrá botón “Pagar con tarjeta” hasta la etapa de pasarela.

---

# 26. Notificaciones y mensajes

### Controles previstos

| Control | Qué hará |
|---|---|
| Campana | Abre bandeja de notificaciones. |
| **Marcar leída** | Actualiza una notificación. |
| **Marcar todas leídas** | Actualiza lote propio. |
| **Abrir origen** | Navega a tarea, sesión, nota o anuncio concreto. |
| **Nueva conversación** | Elige destinatarios dentro de política institucional. |
| **Responder** | Agrega mensaje al hilo. |
| **Archivar** | Oculta de bandeja sin borrar historial. |
| **Reportar** | Envía a moderación. |
| Preferencias | Configura correo, digest y horario silencioso. |

---

# 27. Reportes

### Controles previstos

| Control | Qué hará |
|---|---|
| Tipo de reporte | Matrícula, asistencia, progreso, notas, actividad o cobros. |
| Filtros | Período, programa, cohorte, grupo, curso y docente. |
| **Aplicar filtros** | Recalcula datos autorizados. |
| **Abrir detalle** | Explica el indicador. |
| **Exportar CSV/PDF** | Genera archivo en segundo plano si es grande. |
| **Programar envío** | Define frecuencia y destinatarios autorizados. |
| **Guardar vista** | Conserva filtros personales o institucionales. |

---

# 28. Consola del operador

### Controles previstos

| Control | Qué hará |
|---|---|
| **Crear espacio** | Aprovisiona tenant, plan y administrador. |
| **Configurar módulos** | Habilita capacidades según contrato. |
| **Configurar marca** | Define apariencia del tenant. |
| **Ver salud** | Muestra despliegue, DB, Storage, correo y jobs. |
| **Suspender espacio** | Bloquea operación con motivo y confirmación. |
| **Reactivar** | Restablece servicio. |
| **Acceso de soporte** | Solicita suplantación temporal, auditada y visible. |
| **Finalizar soporte** | Revoca inmediatamente la sesión de soporte. |

---

# 29. Matriz resumida de cobertura

| Dominio | Pantalla actual | Acciones actuales | Pantalla objetivo |
|---|---|---:|---|
| Login/setup | Sí | Funcional | Invitación, recuperación, SSO |
| Dashboard | Sí | Accesos rápidos | Panel Hoy contextual |
| Personas | Parcial | Buscar y ver | CRUD, importación y ciclo de vida |
| Estructura | Parcial | Período, curso | Programa, cohorte, oferta y grupo |
| Curso/contenido | Sí | Núcleo funcional | Biblioteca, plantillas y condiciones |
| Sesiones híbridas | No | Slot básico | Patrón, sesión y excepción |
| Tareas/exámenes | Sí | Núcleo funcional | Rúbricas, grupos y tipos avanzados |
| Notas | Parcial | Ponderación/publicación | Cierre, historial y boletín |
| Asistencia | Sí | Registro básico | Por sesión/modalidad y corrección |
| Comunicación | Parcial | Anuncios | Bandeja, mensajes y notificaciones |
| Tutor | Sí | Consulta autorizada | Acciones, digest y justificantes |
| Admisión | Parcial | Crear lead | Embudo y conversión completa |
| Cobros | Parcial | Crear/editar | Lotes, referencias y vías externas |
| Reportes | Parcial | KPIs | Filtros, exportación y programación |
| Certificados | Sí | Emitir/verificar | Diseño, vigencia y renovación |
| Operador SaaS | No | — | Aprovisionamiento multi-tenant |

---

# 30. Regla para implementar una pantalla nueva

Antes de desarrollar se documentará:

1. Problema y rol principal.
2. Ruta y permisos.
3. Datos mínimos que carga.
4. Estados vacío, cargando, éxito, error y sin permiso.
5. Lista exacta de controles.
6. Efecto de cada control.
7. Validación en cliente y servidor.
8. Confirmaciones y reversibilidad.
9. Auditoría.
10. Comportamiento móvil y accesible.
11. Pruebas unitarias, autorización y E2E.
12. Evidencia desplegada.

Una pantalla no se considera funcional si sus botones solo modifican estado visual, si depende de SQL manual o si el usuario no puede verificar el resultado después de cerrar sesión.

---

# 31. Especificación de pantalla prevista para S4

Después de cerrar S1 (seguridad), S2 (identidad) y S3 (estructura académica), S4 diseñará e implementará **Detalle de sesión de clase**, **Constructor de horario híbrido** y **Panel Hoy**. El orden operativo vigente está en `.kiro/PLAN.md`; este catálogo define comportamiento, no autoriza adelantar contratos. Juntas forman el recorrido vertical:

1. Configurar lunes presencial y miércoles virtual.
2. Materializar las sesiones.
3. Preparar contenido de cada clase.
4. Mostrar ubicación o enlace al estudiante.
5. Cambiar una sesión concreta y notificar.
6. Registrar asistencia según modalidad.
7. Publicar materiales, grabación y actividad posterior.
8. Confirmar persistencia y permisos por rol.

Ese recorrido lleva Edukana del horario básico actual al nivel operativo detallado requerido para un instituto real.
