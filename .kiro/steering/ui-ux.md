---
inclusion: always
---
# Edukana — Interfaz y experiencia

## Sistema visual
- **Tema por espacio.** `:root` recibe variables desde `tenant.branding`: `--brand`, `--brand-fg`, `--accent`, `--radius`, `--font`. Neutros fijos (escala slate). Estados: éxito verde, alerta ámbar, error rojo, info azul; nunca dependen del color de marca.
- **Tipografía:** una familia sans (por defecto Inter; lista cerrada de 6). Tamaños 12/14/16/20/24/30. Cuerpo 14 en escritorio, 16 en móvil.
- **Espaciado** base 4 px. Ancho máximo de contenido 1200 px; formularios 640 px.
- **Densidad:** tablas compactas para personal; tarjetas amplias para estudiantes y tutores.
- **Modo oscuro** opcional por usuario.
- **Componentes base (`components/ui`):** Button (primario, secundario, fantasma, peligro), Input, Textarea, Select, Combobox con búsqueda, DatePicker, Switch, Checkbox, RadioCards, Tabs, Dialog, Drawer lateral, Toast, Tooltip, Badge de estado, Avatar, Breadcrumbs, DataTable (orden, filtros, selección múltiple, acciones masivas, paginación por cursor, exportar), EmptyState, Skeleton, Stepper, FileDropzone con progreso, ProgressBar, StatCard, Timeline, CommandPalette (Ctrl/⌘+K).
- **Patrones:** crear/editar en Drawer cuando son ≤ 8 campos, página completa con Stepper cuando son más. Confirmación con texto del nombre para acciones destructivas. Guardado optimista con Toast y opción de deshacer cuando sea reversible.
- **Estados obligatorios** en cada pantalla: cargando (skeleton), vacío (explicación + acción principal), error (qué pasó + reintentar), sin permiso (404), solo lectura (banda superior con motivo), límite de plan alcanzado (banda con contacto).

## Estructura de la aplicación (AppShell)
- **Barra lateral** (escritorio, plegable): logo del espacio, navegación por rol agrupada, selector de sede/período arriba, usuario abajo.
- **Barra superior:** breadcrumbs, búsqueda global, selector de período activo, campana de notificaciones, mensajes, menú de usuario con **selector de rol** (si tiene varios) y **selector de espacio** (si pertenece a varios).
- **Móvil:** barra inferior de 4–5 destinos por rol + "Más". Tablas se convierten en tarjetas.
- **Banner de suplantación** fijo en rojo: "Estás viendo como {nombre} — Salir".
- **Banner de estado del espacio:** prueba (días restantes), pago vencido, suspendido.

## Navegación por rol
**OWNER / ADMIN:** Inicio · Personas · Académico (Estructura, Cursos, Secciones, Matrícula, Calificaciones, Asistencia) · Admisiones · Finanzas · Comunicación · Calendario · Catálogo* · Reportes · Configuración
**ACADEMIC_LEAD:** Inicio · Académico · Personas (lectura) · Comunicación · Calendario · Reportes
**REGISTRAR:** Inicio · Personas · Matrícula · Documentos (boletines, récord, constancias) · Admisiones · Calendario
**FINANCE:** Inicio · Finanzas (Cargos, Pagos, Planes, Descuentos, Conciliación) · Reportes · Liquidaciones*
**ADMISSIONS:** Inicio · Admisiones (Embudo, Solicitudes, Formulario) · Calendario
**TEACHER / ASSISTANT:** Inicio · Mis secciones · Por calificar · Asistencia · Mensajes · Calendario
**HOMEROOM:** lo del docente + Mi grupo (vista 360 del grado)
**COUNSELOR:** Inicio · Casos · Estudiantes · Calendario
**STUDENT:** Inicio · Mis cursos · Pendientes · Calificaciones · Asistencia* · Horario* · Certificados · Mi cuenta* · Explorar*
**GUARDIAN:** Inicio (selector de hijo) · Progreso · Tareas · Asistencia · Calificaciones · Pagos* · Mensajes · Avisos
**INSTRUCTOR (marketplace):** Inicio · Mis cursos · Preguntas · Reseñas · Ventas · Liquidaciones
(* según módulo)

## Pantallas — Consola de plataforma (`/platform`)
1. **Resumen:** espacios activos, en prueba, vencidos; ingreso recurrente; uso agregado; alertas (límites, jobs fallidos, dominios sin verificar).
2. **Espacios:** tabla (nombre, tipo, plan, estado, estudiantes activos/límite, último acceso, próximo cobro). Filtros por tipo, plan, estado. Acción "Nuevo espacio".
3. **Asistente "Nuevo espacio" (5 pasos):** ① Tipo (4 tarjetas con descripción y módulos incluidos) → ② Datos (nombre, país, zona horaria, moneda, subdominio con verificación en vivo) → ③ Plan, límites y módulos (interruptores sobre el preset) → ④ Marca inicial (logo, color; vista previa en vivo del login) → ⑤ Propietario (nombre y correo; se envía invitación). Resultado: espacio creado con datos base sembrados y lista de puesta en marcha.
4. **Detalle de espacio:** pestañas Resumen · Plan y límites · Módulos · Dominio · Uso · Facturación · Usuarios clave · Auditoría · Acciones (suplantar, suspender, reactivar, exportar, cancelar).
5. **Planes:** CRUD de planes, precios, límites y features.
6. **Facturación SaaS:** facturas por espacio, estado, registrar pago.
7. **Marketplace global** (si existe el espacio público de Edukana): liquidaciones y comisiones.
8. **Operadores:** usuarios de plataforma y roles.
9. **Sistema:** jobs, webhooks, estado de integraciones, banderas globales.

## Pantallas — Acceso (con marca del espacio)
- **Login:** dos columnas en escritorio (imagen y mensaje del espacio | formulario). Correo y contraseña, botones Google/Microsoft si están activos, "¿Olvidaste tu contraseña?". Sin enlace de registro salvo que el catálogo esté activo.
- **Aceptar invitación:** nombre precargado, crear contraseña, aceptar términos del espacio.
- **Recuperar contraseña**, **Verificar correo**, **Elegir espacio** (en `app.edukana.com` si el usuario pertenece a varios), **Elegir rol**.
- **2FA** cuando aplique.

## Pantallas — Puesta en marcha del espacio (OWNER, primer ingreso)
Lista de verificación persistente en Inicio hasta completarla: ① Marca ② Estructura académica (asistente según tipo) ③ Escala de calificación ④ Importar personas ⑤ Crear cursos y secciones ⑥ Matricular ⑦ Configurar cobros ⑧ Invitar al personal. Cada paso abre un asistente con valores sugeridos del preset.

## Pantallas — Personal
- **Inicio:** "Requiere tu atención" (máx. 5 tarjetas accionables) · "Continuar" · indicadores del rol. Sin métricas que no pueda accionar.
- **Personas → Directorio:** pestañas por tipo (Estudiantes, Docentes, Personal, Tutores). DataTable con búsqueda, filtros (estado, grado/programa, sede), acciones masivas (invitar, matricular, desactivar, exportar). Botones: Nuevo, Importar.
- **Ficha de persona (Drawer o página):** encabezado con foto, nombre, código, estado. Pestañas según permiso: Resumen · Académico · Asistencia · Familia · Cuenta · Documentos · Conducta · Actividad. Una pestaña sin permiso no se renderiza ni se consulta.
- **Importar (Stepper):** Subir CSV → Mapear columnas → Vista previa con errores por fila → Confirmar → Progreso → Reporte.
- **Roles y permisos:** lista de roles (sistema y personalizados). Editor: matriz de permisos agrupada por área con interruptores; advertencias de combinaciones riesgosas; "Ver como este rol".
- **Académico → Estructura:** árbol editable (año → períodos; niveles → grados → secciones | facultades → carreras → plan). Asistente inicial por tipo.
- **Cursos:** tarjetas o tabla; ficha con Información · Contenido (constructor) · Banco de preguntas · Secciones/Ofertas.
- **Constructor de contenido:** dos paneles — índice arrastrable (secciones, lecciones, estado) | editor de la lección (título, tipo, editor de texto, carga de video con progreso, adjuntos, publicación, fecha de liberación, prerrequisito). "Vista previa como estudiante".
- **Sección/Oferta (espacio del docente):** pestañas Resumen · Contenido · Estudiantes · Tareas · Exámenes · Calificaciones · Asistencia · Avisos · Foro · Ajustes. Cada pestaña es una ruta, no un ancla.
- **Calificar entregas (SpeedGrader):** tres paneles — lista de estudiantes con estado | entrega (texto, visor de archivos) | rúbrica, nota, comentario. Atajos: siguiente/anterior.
- **Libro de calificaciones:** cuadrícula estudiantes × ítems con columnas fijas, edición en celda, colores para faltante/tarde/excusado, promedio por categoría y final, filtros por período, botón Publicar y Cerrar período.
- **Asistencia:** fecha y sección → lista con botones grandes de estado, "Todos presentes", nota por fila; resumen arriba. Vista mensual tipo calendario por estudiante.
- **Horario:** rejilla semanal con detección de choques (docente, aula, grupo).
- **Admisiones:** tablero Kanban por etapa + tabla; ficha de solicitud con documentos y botón "Convertir en estudiante".
- **Finanzas:** Resumen (cobrado, pendiente, vencido por moneda y período) · Cargos · Pagos · Planes de pago · Descuentos y becas · Conciliación. Ficha de cuenta del estudiante con línea de tiempo y "Registrar pago".
- **Comunicación:** Avisos (lista + editor con selector de audiencia y vista previa de alcance "Lo verán 124 personas") · Mensajes (bandeja de dos paneles) · Plantillas · Registro de envíos.
- **Reportes:** galería de reportes por área con filtros y exportación.
- **Configuración:** menú lateral por sección de `tenant-configuration.md`; cada sección es un formulario con ayuda en línea, valores heredados marcados y botón "Restablecer al valor sugerido". Marca incluye vista previa en vivo (login, barra lateral, correo, certificado).

## Pantallas — Estudiante
- **Inicio:** saludo · "Continúa donde quedaste" (tarjeta grande con la última lección) · Pendientes ordenados por fecha · Próxima clase · Avisos recientes.
- **Mis cursos:** pestañas En curso · Completados · Archivados. Tarjeta con progreso.
- **Curso:** pestañas Contenido · Tareas · Exámenes · Mis calificaciones · Mi asistencia · Foro · Certificado. Sin lista de compañeros.
- **Reproductor de lección:** contenido al centro, índice plegable a la derecha, botón "Marcar como completada y continuar", video con reanudación, velocidad y subtítulos, notas personales.
- **Entregar tarea:** instrucciones, rúbrica visible, fecha y estado; área de respuesta y archivos; historial de intentos; retroalimentación.
- **Examen:** pantalla de inicio (reglas, tiempo, intentos) → pregunta por página o todas, temporizador fijo, guardado automático con indicador, navegación de preguntas, confirmar envío → resultado según configuración.
- **Calificaciones:** por curso y período, solo publicadas; descarga de boletín.
- **Curso completado:** banda "Vista de consulta"; sin botones de entrega.

## Pantallas — Tutor
- **Inicio:** selector de hijo (avatares) · resumen del hijo: asistencia de la semana, tareas por vencer, últimas notas, saldo si está autorizado · avisos.
- Secciones por hijo: Progreso · Tareas · Asistencia (calendario, justificar) · Calificaciones (boletín) · Pagos (estado de cuenta, pagar) · Mensajes con docentes.

## Pantallas — Sitio público del espacio
- **Inicio** configurable (hero, secciones, contacto), **Admisión** (formulario), **Verificar certificado**.
- **Catálogo** (si aplica): rejilla con filtros (categoría, nivel, precio, duración, valoración), búsqueda.
- **Página de curso:** título, resultado prometido, video de presentación, qué aprenderás, temario desplegable con lecciones de vista previa, instructor, reseñas, precio con cupón, botón Comprar / Inscribirme. Barra de compra fija en móvil.
- **Checkout:** una página — resumen, cupón, cuenta (crear o entrar), pago por pasarela alojada. Confirmación con acceso inmediato.

## Reglas de contenido
Verbos en los botones ("Guardar cambios", "Publicar notas"). Mensajes de error dicen qué pasó y cómo resolverlo. Fechas relativas cuando son cercanas ("vence mañana a las 8:00"). Sin jerga técnica. Tuteo neutro.
