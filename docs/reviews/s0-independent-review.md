# Revisión independiente de S0 — Edukana

**Objeto fijo:** [`0e67a916b03083b22d4142f0a56b5635ba145c52`](https://github.com/cank3r/edukana/commit/0e67a916b03083b22d4142f0a56b5635ba145c52).
**Fecha:** 2026-10-08 UTC. **Revisor:** Codex. **Claim:** S0-CODEX-REVIEW.
**Rama propia:** `codex/s0-independent-review`.
**Autorización delimitada:** [registro existente en PR #2](https://github.com/cank3r/edukana/pull/2#issuecomment-6054480829), exclusivamente este archivo.

## Dictamen y alcance

**S0 no reúne todavía las condiciones escritas para declararlo cerrado.** Hay un defecto bloqueante en el nuevo runner: cinco llamadas pasan una expresión regular donde Playwright exige una cadena. Lo reproduje con el validador del paquete exacto 1.64.0. Además, la aceptación desplegada S0-12 sigue BLOCKED y varios documentos de S0 contradicen las decisiones rectoras.

La dirección aprobada sí queda clara en `current-state.md` y PLAN: S1 seguridad, S2 identidad, S3 estructura, S4 semana híbrida. La ausencia actual de Membership, Offering, ClassSession, bootstrap con token e historia académica **no se presenta como una implementación que S0 deba incorporar ahora**. Las correcciones documentales y del runner pertenecen a S0; las capacidades planificadas conservan su sprint.

La revisión abarca seguridad adversarial, UX, lenguaje, casos límite, coordinación y calidad de evidencia. No es una revisión formal de GitHub, aprobación del PR, auditoría exhaustiva ni certificación de producción. No adopta el veredicto de Claude.

## Procedencia, aislamiento y método

- Leídos en el orden solicitado: `TEAM-COORDINATION.md`, `.kiro/steering/current-state.md`, `.kiro/steering/simplicity.md` y `.kiro/PLAN.md`, primero desde GitHub fijado al SHA y después contrastados con el checkout.
- Consultado `AGENTS.md`. Se inventariaron las dos habilidades de `.agents/skills`: Prisma Composer y Prisma Platform. Sus ámbitos de operación/despliegue no se aplicaron a esta revisión del ORM 5.22; no se ejecutó sincronización de habilidades ni infraestructura.
- Se utilizó un checkout aislado en el equipo autorizado. Se clonó la **rama remota existente**; no se recreó la rama ni el claim. HEAD y la referencia remota de revisión eran el SHA solicitado, con árbol limpio antes de escribir.
- `git merge-base --is-ancestor cff38c6 HEAD` devolvió 0. `git diff cff38c6..HEAD -- src prisma .circleci` quedó vacío. S0 añade documentación, runner/pruebas y cambios de dependencias; los problemas del código académico y de bootstrap aquí descritos son anteriores a S0.
- La terminal inicial falló; la ejecución se recuperó en el mismo equipo sin cambiar permisos.
- Herramientas observadas: Git, Node, npm y pnpm; `rg` no disponible, se usó `git grep`. Node local: **24.14.0**; el proyecto exige **22.x**. No se instalaron dependencias en el repositorio.
- Se descargaron únicamente los archivos de distribución de `zod@4.6.5` y `playwright-core@1.64.0` indicados por el lockfile. Se verificó SHA-512 contra `integrity` antes de extraerlos en `%TEMP%\edukana-s0-review-0e67a91`; no se ejecutaron hooks de instalación ni se descargaron navegadores.
- No se leyeron archivos de secretos ni datos reales de alumnos. No hubo conexión de las pruebas a DB, Storage, Preview o producción; tampoco reset, migraciones, despliegue, merge o cambios de permisos.
- **Único archivo de entrega y cambio versionable:** `docs/reviews/s0-independent-review.md`. Helpers y paquetes temporales son instrumentación de pruebas fuera del repositorio.

### Qué significa cada evidencia

**Ejecutada** significa que se invocó la función o prueba indicada. Las pruebas que leen texto fuente siguen siendo comprobaciones estáticas aunque su runner termine verde. **Inspección** significa lectura de código/documentos. **Declarada** es una afirmación de otro documento o autor, no repetida aquí. **Pendiente** significa que no se ejecutó y no tiene resultado.

## Matriz de aceptación de los ocho puntos

| Punto | Criterio de aceptación | Declaración documental | Verificación independiente en el SHA | Resultado / condición |
|---|---|---|---|---|
| 1. Código, steering y roadmap | Una secuencia vigente y separación explícita entre construido y futuro | [PLAN 38–43][plan-sprints] ordena S1→S2→S3→S4. [Estado 18–25][state-current] describe legacy | El esquema conserva User institucional, Course unido y ScheduleSlot. Manual §27, blueprint §26 y catálogo §31 recomiendan híbrido primero. Hay frases de cambios sin commit ya versionados | **Parcial; Importante I1/I3.** Corregir referencias rectoras antes de entregar S0 |
| 2. Tres ejes de ClassSession | Participación, temporalidad y tipo pedagógico independientes, con combinaciones válidas definidas | [Estado 34][state-class] y [data-model 52–58][model-class] los separan | [Blueprint 263–271][blueprint-mode] y [catálogo 803][catalog-mode] los mezclan en “Modalidad”. No hay ClassSession en el esquema actual | **Contrato documental incoherente; Importante I2.** Conciliar en S0, implementar en S4 |
| 3. Rechazo de producción por runner | Rechazo antes de escrituras y vínculo comprobable con recursos aislados | Guion dice que exige host Preview; estado promete allowlist DB/Storage futura | 4/4 pruebas del runner; 14 casos sintéticos. Rechaza alias de producción convencional, HTTP, host distinto, credenciales/query/fragmento. Acepta recursos ficticios etiquetados producción porque no los comprueba | **Parcial; Importante I4.** La forma del host no certifica aislamiento. El E2E además tiene B1 |
| 4. Plan de protección de /setup | Bootstrap de un uso, consumo atómico, cierre por defecto y pruebas adversariales | [Estado 44][state-security], [PLAN 38][plan-sprints] y handoff 51 lo asignan a S1 | Página comprueba count; acción usa transacción Serializable, pero ningún token. Ver [setup 18–56][setup-action] | **Plan presente; protección pendiente en S1. Importante I5.** No exponer una base vacía asumiendo que ya está protegido |
| 5. URLs emitidas tras revocar | Distinguir nueva autorización de descarga ya firmada; medir ventana por backend | Estado 45 reconoce ventana residual; catálogo promete cortar “todo acceso” inmediatamente | API firma 300 s; token local sigue válido hasta el vencimiento. No consulta revocación durante GET local. No se midió Supabase | **Promesa excesiva; Importante I6.** Documentar TTL real en S0; cierre técnico/medición en S1 |
| 6. Preguntas, reenvíos y notas | Historia estable con actor, motivo y fecha; preservar contenido evaluado | Estado 46 y PLAN S1 lo exigen | Submission se sobrescribe; GradeEntry conserva última nota; preguntas/answers referencian banco vivo sin snapshot. Inspección, sin mutaciones DB | **Deuda legacy explícita para S1; Importante I7.** No exigir migrarla en S0 ni declarar resuelto |
| 7. Ediciones simultáneas de contratos | Un escritor verificable y handoff explícito; REVIEW no libera el claim | TEAM prohíbe solapes y enumera contratos | Handoff permite interpretar REVIEW como permiso; registrar filas en ramas separadas no arbitra una carrera de claims | **Protocolo parcial; Importante I8.** Corregir ambigüedad y establecer confirmación remota antes de escribir |
| 8. Simplicidad de pantallas | Español cotidiano, confirmación/impacto y evidencia a 360 px, teclado y tiempos | [simplicity 7–35][simplicity] define la aceptación | UX 11/11: 3 pruebas de funciones y 8 de strings. Sidebar/select móvil tienen medidas positivas; hay texto técnico y publicación directa. No se renderizó la app | **Aceptación no demostrada; Importante I9, Recomendación R1.** Mantener evidencia de fuente separada de usabilidad real |

## Hallazgos

### B1 — Bloqueante: el runner usa RegExp en selectOption

**Ruta y líneas:** [`tests/e2e/canonical-pilot.spec.mjs:94`][runner-regex]; también 136, 155–156 y 234 del mismo archivo. Introducido en S0.

**Verificado:** pasa `{ label: new RegExp(...) }` o `{ label: /Asignaciones/ }`. El esquema `FrameSelectOptionParams` del paquete fijado `playwright-core@1.64.0` exige `label: tString`. Una reproducción sin navegador, exponiendo ese validador solo en memoria, rechazó ambos tipos de RegExp con:

```text
synthetic.options[0].label: expected string, got object
```

El control positivo `label: "Asignaciones"` fue aceptado. Es consistente con la [API oficial de Playwright](https://playwright.dev/docs/api/class-locator#locator-select-option). Esto valida el rechazo del argumento, **no constituye una ejecución del E2E**.

**Impacto:** si el recorrido llega a la asignación de persona de la línea 94, no puede continuar por esa llamada; las demás repiten el defecto. Las 87 pruebas de `npm test` no incluyen este recorrido de navegador y no lo detectan.

**Corrección esperada, dueño Kiro/S0:** seleccionar por valor estable o por texto exacto; si hace falta coincidencia parcial, localizar una opción y obtener su value antes de llamar a selectOption. Cubrir las cinco llamadas y ejecutar después el recorrido completo en el entorno aislado autorizado. No relajar el validador ni esconder la excepción.

### I1 — Importante: tres documentos recomiendan una secuencia distinta de PLAN

**Rutas y líneas:** [`docs/as-built-system-manual.md:1291–1306`][manual-next], [`docs/detailed-functional-blueprint.md:925–959`][blueprint-order], [`docs/screen-action-catalog.md:1091–1104`][catalog-next], frente a [`.kiro/PLAN.md:38–43,51–54`][plan-sprints].

**Inspección:** el manual presenta la semana híbrida como siguiente incremento y deja recuperación/importación para después. El blueprint antepone sesiones y Panel Hoy a recuperación e identidad. El catálogo manda implementar esas pantallas a continuación. PLAN prioriza seguridad e identidad, después estructura y finalmente híbrido.

**Impacto:** un integrador que siga los manuales puede empezar contratos de S3/S4 antes de las dependencias aprobadas. Que TEAM establezca precedencia reduce la ambigüedad normativa, pero no elimina instrucciones contradictorias publicadas por S0.

**Corrección esperada, S0 documental:** hacer que esos apartados remitan a PLAN y marquen su orden anterior como sustituido; mantener los detalles funcionales como objetivos de S4. No adelantar ClassSession ni modificar esquema. Distinguir fases generales del [roadmap 68–99][roadmap] de sprints y aclarar que la conservación mínima de historia ya corresponde a S1.

### I2 — Importante: los formularios futuros vuelven a mezclar los tres ejes de ClassSession

**Rutas y líneas:** [`docs/detailed-functional-blueprint.md:261–284,299–303`][blueprint-mode], [`docs/screen-action-catalog.md:798–807`][catalog-mode]; contraste [`.kiro/steering/current-state.md:34`][state-class] y [`.kiro/steering/data-model.md:52–58`][model-class].

**Inspección:** una sola lista contiene presencial, virtual, híbrida, asincrónica, práctica, evaluación y evento. El contrato rector separa cómo participa la persona, cuándo participa y qué actividad hace. “Práctica híbrida sincrónica” necesita conservar tres valores simultáneos.

**Impacto:** implementar el catálogo literalmente forzaría opciones excluyentes y perdería información o produciría migraciones incompatibles.

**Corrección esperada:** alinear blueprint y catálogo en S0; en la spec READY de S4 definir campos separados, defaults y combinaciones admitidas, disponibilidad asincrónica, zona horaria y cambios por sesión. Acordar el nombre definitivo del enum antes de migrar; cambiar `PRESENTIAL` por `IN_PERSON` es una decisión de nomenclatura, no un defecto de comportamiento demostrado. La ausencia de ClassSession en [`prisma/schema.prisma:624–642`][schedule] es coherente con el estado legacy.

### I3 — Importante: la fuente de estado describe como locales cambios que ya contiene el commit

**Rutas y líneas:** [`.kiro/steering/current-state.md:16,25`][state-current], [`docs/as-built-system-manual.md:19–34`][manual-state]; resultados en [`PLAN:27`][plan-s0] y [`manual:1127–1133`][manual-evidence].

**Verificado:** el checkout y la rama remota de revisión apuntaban a 0e67a916; ese commit ya contiene runner, dependencias y documentación. Son obsoletas las frases “último commit cff38c6” y “cambios todavía sin commit”. No se deduce de ello qué SHA se ejecutó en cada Preview.

**Impacto:** dificulta reproducir la base y puede hacer que se atribuyan pruebas o ausencia de despliegue al commit equivocado.

**Corrección esperada, S0:** redactar esas secciones como estado histórico fechado o eliminar el estado Git efímero; vincular cada evidencia a SHA, comando, entorno y resultado. El conteo de **87 pruebas sí coincide** con las declaraciones encontradas y con las pruebas ejecutadas aquí; no se denuncia como conteo falso. Build 22/22, auditoría cero, types/lint y el E2E local previo quedan como resultados **declarados**, no revalidados por esta revisión.

### I4 — Importante: la protección del runner valida un nombre, no la identidad del entorno

**Rutas y líneas:** [`scripts/canonical-pilot-config.mjs:19–35,54–70`][runner-config], [`tests/canonical-pilot-runner.test.mjs:24–29`][runner-test], [`docs/canonical-mvp-pilot.md:84–101`][pilot-runner]; plan futuro en [`current-state:44`][state-security].

**Ejecutado:** el validador rechaza el alias convencional `edukana.vercel.app`; también host diferente, HTTP, credenciales, query y fragmento. Pero con host sintético permitido acepta `PILOT_ENVIRONMENT=production`, DB ficticia en `production.invalid` y Storage ficticio en ese dominio: estos campos se ignoran. No se resolvió ni contactó ninguno de esos hosts. También acepta puerto 444 y descarta un pathname al devolver `origin`; la comparación es de hostname, no de origen completo.

**Impacto:** repetir el hostname en dos variables es confirmación de intención, no prueba de que un deployment Preview use recursos de staging. Un deployment de producción nombrado con `-git-` o un Preview conectado a recursos compartidos no queda descartado por esta función. No se afirma que Edukana esté actualmente mal conectado.

**Corrección esperada:** S0 debe describir el alcance exacto de la guarda y exigir verificación independiente del deployment, DB y bucket antes de un run con escrituras. S1 implementa la allowlist prometida, con identidad obtenida del entorno servidor, no solo valores autodeclarados por el cliente; rechazo por defecto y antes de `/setup`. Fijar origen/puerto y evitar seguir redirecciones inesperadas debe entrar en ese criterio. **No se exige introducir esa infraestructura en este informe ni en S0 documental.**

### I5 — Importante: /setup sigue siendo un bootstrap público mientras la base esté vacía

**Rutas y líneas:** [`src/app/setup/page.tsx:7–17`][setup-page], [`src/app/setup/actions.ts:18–56`][setup-action], [`docs/as-built-system-manual.md:1249–1251`][manual-setup]; [`PLAN:38`][plan-sprints].

**Inspección:** la acción valida datos y crea institución/admin cuando el count es cero. La transacción Serializable y manejo P2034 protegen la concurrencia de inicialización; no se demostró doble creación. No hay requisito de token de bootstrap ni autenticación del iniciador.

**Impacto:** quien complete primero el formulario de un despliegue accesible y vacío puede obtener el primer administrador. “Ejecutarlo antes de compartir” no es un mecanismo de autenticación.

**Corrección esperada:** mantenerlo como deuda S1 reconocida. La spec debe cubrir token de un solo uso con caducidad, consumo atómico, estado deshabilitado por defecto, replay/concurrencia, ausencia de filtrado a URL/log y cierre posterior. Antes de resetear/exponer staging, el coordinador debe garantizar aislamiento y acceso restringido con autorización específica. Nada de eso fue ejecutado por esta revisión.

### I6 — Importante: “revocación inmediata de todo acceso” no describe URLs ya emitidas

**Rutas y líneas:** [`docs/screen-action-catalog.md:342`][catalog-revoke], [`src/app/api/assets/[assetId]/route.ts:9–35`][asset-route], [`src/lib/storage.ts:88–97`][storage-url], [`src/app/api/local-storage/route.ts:23–32,50–65`][local-route], [`src/lib/local-storage.ts:14–27`][local-token].

**Inspección y ejecución:** la autorización precede a la emisión de URL por 300 segundos. El acceso posterior del backend local comprueba firma, ruta y vencimiento, sin consultar sesión ni vínculo. Con un token sintético emitido en t=0, fue válido en t=1 s, t=299.999 s y t=300 s; expiró en t=300.001 s. La comparación usa `expiresAt < now`, por lo que el instante exacto del vencimiento todavía pasa.

El portal y la audiencia vuelven a filtrar vínculos activos ([`guardian-portal.ts:34–47`][guardian-read], [`announcement-data.ts:30–39`][announcement-read]). Eso puede cerrar nuevas autorizaciones del tutor sin invalidar una firma previamente entregada. La llamada a Supabase solicita el mismo TTL, pero **no se midió su ventana efectiva, caché ni una revocación real**. El ensayo local no representa una prueba de Supabase.

**Impacto:** una copia de la URL puede continuar habilitando una descarga durante el tiempo restante; revocar no recupera bytes ya descargados. La promesa categórica del catálogo excede el contrato correcto de `current-state:45`.

**Corrección esperada:** precisar en S0 “bloquea nuevas autorizaciones; enlaces emitidos tienen una ventana residual nominal de hasta 300 s desde emisión”. En S1 medir ambos backends con revocación real, decidir TTL por sensibilidad y, si un caso exige revocación por petición, diseñar mediación que consulte autorización. No afirmar revocación criptográfica inmediata ni una medición remota inexistente.

### I7 — Importante: la historia académica prometida aún no se conserva en el modelo legacy

**Rutas y líneas:** [`src/app/dashboard/academico/actions.ts:180–207`][academic-history], [`actions.ts:236–268`][exam-history], [`prisma/schema.prisma:437–454`][grade-model], [`schema.prisma:488–533`][submission-model], [`schema.prisma:566–620`][exam-model]; compromiso [`current-state:46`][state-security] y [`PLAN:38`][plan-sprints].

**Inspección:**

- Reenviar una tarea actualiza el mismo Submission y borra su score, feedback y gradedAt; no conserva el contenido anterior como intento. La misma acción no actualiza el GradeEntry anterior, por lo que el estado de ambas representaciones también debe definirse.
- Calificar vuelve a actualizar Submission y hace upsert del GradeEntry. Conserva actor/fecha de la última calificación, no versiones ni motivo de cada modificación.
- ExamAttempt sí distingue número de intento y ExamAnswer guarda respuesta/puntuación. Sin embargo, ExamQuestion y ExamAnswer referencian QuestionBankItem; no guardan copia de prompt/opciones/clave. La corrección usa el banco actual.
- No se encontró en las acciones académicas inspeccionadas una operación de edición del banco que demuestre una alteración retroactiva ya explotable. La falta de snapshot es una brecha del contrato de conservación, no prueba de que se haya modificado una pregunta usada.

**Impacto:** no puede reconstruirse completamente qué se entregó y quién cambió una nota con su motivo; ampliar edición de preguntas sin inmovilización agravaría el problema.

**Corrección esperada en S1:** revisiones inmutables o eventos asociados a los identificadores académicos estables, snapshot/inmovilización de pregunta usada, actor/motivo/fecha y política explícita de reenvío/recalificación. Probar transacciones y concurrencia reales; conservar intentos y definir qué nota se publica mientras se revisa el reenvío. Mantener separado el historial mínimo de S1 del boletín/cierre de S6 y de la migración Course/Offering de S3. **No se solicita modificar schema ni acciones en S0.**

### I8 — Importante: REVIEW se puede interpretar como liberación de archivos y los claims no tienen arbitraje explícito

**Rutas y líneas:** [`docs/claude-s0-handoff.md:31–38`][handoff-claim], [`TEAM-COORDINATION.md:38–56,62`][team-protocol] y [`TEAM:93–100`][team-contracts].

**Inspección:** TEAM exige esperar handoff ante solape y define REVIEW como terminado/esperando revisión. El handoff dice no editar hasta que cambie a REVIEW **o** se reciba handoff. S0-GOV ya está en REVIEW y conserva alcance exclusivo. Además, leer ausencia de claim y escribir una fila local en ramas distintas puede dar dos reservas simultáneas; no se designa un punto de confirmación remota.

**Impacto:** dos agentes pueden creer que tienen permiso sobre el mismo contrato aunque cada uno siga parte de la documentación. Las ramas aisladas evitan pisar un checkout, pero no eliminan divergencias del contrato compartido.

**Corrección esperada en S0:** aclarar que REVIEW no libera escritura; propietario/coordinador confirma explícitamente la transferencia, con SHA, alcance y próximo escritor. Identificar dónde se consulta el registro autoritativo y exigir confirmación publicada antes de editar; ante una carrera, el segundo espera. Basta un procedimiento sencillo y verificable, no se propone construir un sistema de bloqueos. La excepción de Carlos para este único informe ya resuelve nuestro solape documental y no autoriza otras ediciones.

### I9 — Importante: hay incumplimientos visibles de lenguaje/confirmación y no existe aceptación UX ejecutada

**Rutas y líneas:** [`src/app/setup/page.tsx:15`][setup-page], [`src/components/dashboard/AcademicForms.tsx:13–18,38–39,77–82,105–113`][academic-ui]; reglas [`simplicity.md:7–30`][simplicity]; evidencia [`tests/ux.test.ts:33–88`][ux-tests].

**Inspección:** setup habla de “base de datos”, “seed” y “SQL manual”; el horario pide minutos desde 00:00 en vez de una hora; una carga puede mostrar “Supabase rechazó” y la ruta `/api/assets/<id>`. PublishForm envía directamente publicar/retirar mediante el Form genérico, sin revisión de impacto/confirmación. Son ejemplos concretos de deuda legacy, no cambios introducidos por S0.

AttendanceForm, **línea 39 en este SHA**, impone `min-w-[520px]` dentro de `overflow-x-auto`, sin alternativa móvil en ese componente. La declaración CSS contradice el objetivo de operar a 360 px sin una tabla que obligue a desplazamiento lateral. Esto es evidencia estática del diseño previsto; no se midió el ancho efectivo ni se observó un navegador renderizado. El default `PRESENT` sí coincide con registrar solo excepciones de asistencia.

**Evidencia positiva:** Sidebar usa etiquetas, navegación móvil y `min-h-11`; CourseTabs ofrece select móvil con label; formularios anuncian mensajes con aria-live. Sus fuentes respaldan intención de accesibilidad, no medidas de pantalla renderizada.

**Impacto:** aumenta la carga para personas no técnicas y permite publicar notas/tareas sin la confirmación que ahora exige el contrato de experiencia.

**Corrección esperada:** inventariar estas excepciones en S0 y asignar su corrección al recorrido correspondiente; antes de aceptar esa pantalla, usar hora legible, errores que indiquen el siguiente paso y resultado de carga por nombre, mostrar impacto antes de publicar y ofrecer filas/tarjetas de asistencia que quepan en móvil. Verificar 360 px, teclado y persistencia en app real. No se afirma haber visto desbordamientos, medido controles de 44 px o cronometrado tareas; esos ensayos están pendientes.

### R1 — Recomendación: convertir la puerta de simplicidad y aislamiento en evidencia de comportamiento

**Rutas y líneas:** [`tests/ux.test.ts:33–88`][ux-tests], [`.circleci/config.yml:5–30`][ci], [`tests/e2e/canonical-pilot.spec.mjs:212–256`][runner-final], [`docs/canonical-mvp-pilot.md:58–64,99–101`][pilot-negatives].

**Verificado/inspeccionado:** UX tiene 11 pruebas; ocho leen strings de archivos. Las otras tres comprueban helpers de navegación/etiquetas. Permisos usa MemoryPermissionStore, políticas construyen filtros y schema lee texto; no ejecutan el SQL real. CircleCI define un contenedor Node y variables de DB, sin servicio PostgreSQL ni ejecución del runner Preview. El E2E limita el escenario a una institución y un destinatario de cada rol; no revoca el vínculo y declara pendientes segundo tenant y destinatario externo.

**Impacto:** resultados verdes ayudan a detectar regresiones del código esperado, pero no prueban aislamiento DB, denegación HTTP sin datos, revocación real, renderizado a 360 px, recorrido por teclado ni éxito de una persona nueva en un minuto.

**Corrección esperada:** conservar estas pruebas como regresión y nombrarlas correctamente. En S1 añadir integración PostgreSQL con dos instituciones y casos sin permiso/ID ajeno; para UX medir tareas y dimensiones sobre interfaz real por rol, incluidos vacíos, errores y confirmaciones. Registrar resultados y artefactos vinculados al SHA y al entorno. No convertir “se encontró la palabra” en “el usuario pudo hacerlo”.

### R2 — Recomendación: parametrizar el navegador antes de llevar el piloto a CI

**Ruta y líneas:** [`playwright.pilot.config.mjs:16–23`][playwright-config].

**Inspección:** fija `Desktop Edge` y `channel: "msedge"`. Es consistente con el guion actual de Edge del sistema, pero no hay instalación de ese canal en la configuración de CircleCI inspeccionada. No se ejecutó una reproducción Linux.

**Impacto:** incorporar el runner a CI tal cual añade una dependencia de navegador externo que no declara el job.

**Corrección esperada en la integración S1:** canal configurable y navegador instalado/versionado de manera reproducible; conservar Edge si se requiere para aceptación específica. Esto no demuestra que falle en el equipo Windows actual.

### Q1 — Pregunta: ¿qué cierre exacto se espera para S0-GOV frente a S0-12?

**Rutas y líneas:** [`.kiro/PLAN.md:30–32,51–54`][plan-s0], [`TEAM-COORDINATION.md:53–55,62,68`][team-protocol] y [`docs/as-built-system-manual.md:1334–1368`][manual-done].

**Inspección:** S0-12 sigue BLOCKED, S1 depende de S0 y TEAM define DONE como fusionado y verificado. La documentación exige E2E desplegado para una salida. La aprobación de otra revisión no cambia esas condiciones.

**Impacto:** declarar S0 DONE sin decidir qué sucede con S0-12 puede habilitar S1 bajo una dependencia incumplida.

**Resolución esperada del coordinador/Carlos:** cerrar la aceptación desplegada con evidencia, o registrar explícitamente una redefinición de salida/traslado de S0-12 y sus riesgos. Este informe no toma esa decisión ni autoriza reset, merge o despliegue.

## Pruebas ejecutadas y resultados

### Registro de ejecución

| ID | Comando/método | Resultado observado | Qué demuestra / límite |
|---|---|---|---|
| T1 | `git rev-parse HEAD`, `git status --short --branch`, `git ls-remote` | SHA exacto; rama propia y árbol inicialmente limpio | Aislamiento y base; no estado del checkout de Kiro, que no se operó |
| T2 | `git merge-base --is-ancestor cff38c6 HEAD`; `git diff cff38c6..HEAD -- src prisma .circleci` | Exit 0; diff vacío | Problemas de esos archivos preceden S0 |
| T3 | `node --test tests/canonical-pilot-runner.test.mjs` | **4/4 PASS**, exit 0 | Validador local, sin navegación |
| T4 | Node 24 + resolvedor temporal; ocho suites indicadas abajo | **58/58 PASS**, exit 0 | Funciones puras, MemoryPermissionStore y comprobaciones de fuente |
| T5 | Mismo resolvedor + Zod exacto verificado; security y announcements | **25/25 PASS**, exit 0 | Completa las **87/87 pruebas existentes**, con runtime distinto del oficial |
| T6 | Importar loadCanonicalPilotConfig e invocarlo con 14 entradas sintéticas | **14 resultados observados y afirmados**, exit 0 | 10 rechazos y 4 aceptaciones; aceptación de recursos ignorados expone límite, no un PASS de seguridad |
| T7 | signLocalStorageToken/verifyLocalStorageToken, reloj sintético | **6 aserciones PASS**, exit 0 | Cuatro momentos válidos, uno expirado y rechazo de ruta alterada; no revocación DB ni Supabase |
| T8 | Validador FrameSelectOptionParams de Playwright 1.64.0, exportado en memoria | **2 RegExp rechazados + 1 string aceptado**, exit 0 | Confirma B1 sin navegador, DOM ni servidor |
| T9 | `git diff --check` antes del informe y `git diff --cached --check` antes de commit | Exit 0 | Higiene del diff, no corrección funcional |

T4 ejecutó `permissions` (10), `course-scope` (5), `guardianship` (11), `lms` (8), `schema` (6), `ux` (11), `local-storage` (2) y `canonical-pilot` (5). T5 ejecutó `security` (11) y `announcements` (14). Junto con T3 son 87 casos únicos; no se suman dos veces por repetir una suite.

No se ejecutó `npm test` literalmente: se ejecutaron todos los archivos que enumera con Node 24, su eliminación nativa de anotaciones TypeScript y resolución temporal. No se reescribieron los archivos ni se sustituyeron funciones de negocio; el resolvedor solo añade extensiones, resuelve `@/` y apunta `zod` al paquete temporal íntegro. Los imports `type` se eliminan, por lo que estas pruebas no necesitan generar Prisma Client; no hay validación de tipos. Esto no sustituye la puerta prescrita Node 22/tsx ni una instalación completa.

**Incidencias de instrumentación, resueltas:** el primer intento de T4 pasó una ruta Windows a `--import` y falló antes de cargar las ocho suites (`ERR_UNSUPPORTED_ESM_URL_SCHEME`); se repitió con URI file y pasó. La primera instrumentación de T8 ya rechazó RegExp pero su control positivo falló por faltar `context.isUnderTest`; con ese callback requerido, los tres controles pasaron. No se atribuyen esos fallos del harness al producto. Hubo además una búsqueda de archivos de Playwright en una estructura anterior; se localizó su bundle real sin modificarlo en disco.

### Reproducción del entorno alternativo

El resolvedor temporal usado no cambia lógica del producto ni mocks de negocio:

```javascript
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve, extname } from "node:path";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "zod")
      return nextResolve(new URL("./zod/package/index.js", import.meta.url).href, context);
    if (specifier.startsWith("@/"))
      return nextResolve(pathToFileURL(resolve(process.cwd(), "src", specifier.slice(2) + ".ts")).href, context);
    if (specifier.startsWith(".") && !extname(specifier))
      return nextResolve(specifier + ".ts", context);
    return nextResolve(specifier, context);
  },
});
```

Desde el checkout, con ese archivo en el directorio temporal y Zod extraído a su lado:

```powershell
$reviewScratch = Join-Path $env:TEMP 'edukana-s0-review-0e67a91'
$reviewLoader = ([Uri](Join-Path $reviewScratch 'resolve-ts.mjs')).AbsoluteUri
node --test tests/canonical-pilot-runner.test.mjs
node --import $reviewLoader --test tests/permissions.test.ts tests/course-scope.test.ts tests/guardianship.test.ts tests/lms.test.ts tests/schema.test.ts tests/ux.test.ts tests/local-storage.test.ts tests/canonical-pilot.test.ts
node --import $reviewLoader --test tests/security.test.ts tests/announcements.test.ts
```

T6 usó un objeto explícito, no `process.env`, con cuatro correos `@pilot.test`, contraseña sintética y host `edukana-git-synthetic-example.vercel.app`. Resultado:

| Variante | Resultado |
|---|---|
| Host de forma Preview | Aceptada |
| Alias `edukana.vercel.app`; dominio `school.example`; HTTP; host diferente | Rechazadas (4) |
| Credenciales en URL; query; fragmento; confirmación incorrecta; correo duplicado sin distinguir mayúsculas; scratch vacío | Rechazadas (6) |
| Campos extra `PILOT_ENVIRONMENT=production`, DB/Storage en `production.invalid` | Aceptada; campos ignorados |
| Puerto 444 | Aceptada |
| Pathname `/not-root` | Aceptada; origin devuelto sin pathname |

T7 usó `expiresAt=301000`, emisión lógica en 1000 y `now=[1000,2000,300999,301000,301001]`; devolvió `[true,true,true,true,false]`. Cambiar solo objectPath devolvió false.

Para T8, se cargó en un módulo temporal en memoria el texto verificado de `playwright-core/package/lib/coreBundle.js`, añadiendo únicamente:

```javascript
init_validator();
module.exports.reviewValidator = findValidator("Frame", "selectOption", "Params");
```

Se invocó ese validador con `{selector:"select",options:[{label}]}` y contexto `{isUnderTest:()=>false}`: `/Asignaciones/` y `new RegExp("Docente Piloto")` fallaron; `"Asignaciones"` pasó. No se ejecutó código del E2E ni interacción con un sitio.

### No ejecutado y límites

| Comprobación | Estado / motivo |
|---|---|
| Puerta oficial con Node 22 y tsx | No ejecutada; runtime disponible Node 24 y checkout sin node_modules |
| Prisma validate/generate, typecheck, lint, build, npm audit | No ejecutados; no se instaló el árbol completo. Los PASS de documentos/CI no se adoptan como propios |
| E2E local completo de Edukana | No ejecutado; sin DB/app/navegador preparados. Reproducción del validador no lo sustituye |
| Preview limpio con DB y Supabase | No ejecutado; no hay autorización de reset ni identidad de recursos verificada para esta revisión; además B1 impide completar el runner fijo |
| Revocación real y ventana efectiva de URL Supabase | No ejecutadas; se inspeccionó llamada con TTL 300 y se ejercitó solo token local |
| Integración de dos instituciones, carreras DB y acciones con IDs ajenos | No ejecutada; se verificaron helpers/strings, no SQL ni HTTP real |
| Historia de tareas/notas/preguntas con transacciones | Solo inspección; no se mutó base ni se simuló una DB como si fuera evidencia real |
| UX renderizada a 360 px, teclado, 44 px y tiempos de persona nueva | No ejecutada; no hay capturas ni mediciones en este informe |
| Revisión o pruebas contra producción | Fuera de alcance y no ejecutadas |

## Contexto remoto posterior, separado del objeto auditado

Última comprobación de referencias y coordinación: **2026-10-08, aproximadamente 07:19 UTC**.

| Referencia | Estado observado | Uso en esta revisión |
|---|---|---|
| `codex/s0-independent-review` | `0e67a916b03083b22d4142f0a56b5635ba145c52` antes del commit local del informe | Base autorizada; claim ya existente verificado, no duplicado |
| `fix/role-access-hardening` | `1191b82ba20c324d60c9f8fcdc29eaa5a337ffc4` | [TEAM posterior](https://github.com/cank3r/edukana/blob/1191b82ba20c324d60c9f8fcdc29eaa5a337ffc4/TEAM-COORDINATION.md) conserva S0-GOV REVIEW y menciona CI/Vercel y soporte de Deployment Protection |
| PLAN de esa rama | S0-12 BLOCKED por reset autorizado y configuración del secreto de automatización | [Contexto posterior](https://github.com/cank3r/edukana/blob/1191b82ba20c324d60c9f8fcdc29eaa5a337ffc4/.kiro/PLAN.md); no se leyó valor alguno de ese secreto |
| `claude/s1-sec-proposal` | `0bb74bba23353757ff020761d02cebe3b61df059` | [TEAM de propuesta](https://github.com/cank3r/edukana/blob/0bb74bba23353757ff020761d02cebe3b61df059/TEAM-COORDINATION.md) incluye S1-SEC-PROPOSAL REVIEW, solo propuestas/fila; [PR #5](https://github.com/cank3r/edukana/pull/5) es draft y depende de S0 DONE |

Se leyeron los comentarios actuales de PR #2 y #5. Claude emitió una revisión sobre 0e67a91 y otra hasta 1191b82, incluyendo una observación de cabeceras de bypass. **Son opiniones/evidencias de otro revisor sobre bases diferentes**, no hallazgos propios ni autorizaciones. No se traslada el problema posterior de cabeceras al SHA auditado: su `playwright.pilot.config.mjs` no contiene esas cabeceras. Tampoco se declara que los cambios posteriores hayan corregido los hallazgos de este informe.

No se escribieron comentarios, review formal, fila de claim, ni PR nuevo. El coordinador actualizará el comentario existente con este handoff.

## Condiciones de salida de S0 y handoff

1. **Kiro corrige B1** en su claim y aporta ejecución del recorrido completo en una revisión posterior identificada. Este informe permanece anclado a 0e67a916.
2. **Conciliar documentación S0:** orden de sprints, los tres ejes de ClassSession, estado Git histórico, alcance real de rechazo de producción y URLs ya emitidas, y significado de REVIEW/handoff. Corresponde a I1–I4, I6 e I8; no requiere migraciones.
3. **Resolver S0-12/Q1 de forma explícita:** el cierre escrito exige Preview limpio, persistencia real y separación de recursos. Cualquier reset/configuración de acceso sigue necesitando la autorización específica del coordinador/Carlos; no existe en esta tarea. Si se difiere, registrar el cambio de salida/dependencia.
4. **Evidencia vinculada al SHA que se cierre:** puerta oficial Node 22, comandos/resultados, E2E y límites; no reutilizar el PASS de una base distinta. Las pruebas de fuente mantienen su nombre y alcance.
5. **S1 hereda deudas sin reabrir alcance S0:** bootstrap, allowlist, sesión viva, TTL/revocación, historia académica e integración PostgreSQL. Las nuevas specs deben estar READY y el escritor del contrato confirmado antes de tocarlo.
6. **Simplicidad:** declarar las excepciones legacy y vincular su aceptación a pruebas reales por pantalla. No declarar las pantallas ya conformes solo porque se adoptó el steering.
7. **S0-10/S0-11:** Carlos/coordinación resuelven o registran explícitamente privacidad del repositorio e infraestructura; aquí no se cambió ninguna de esas decisiones.
8. **Alcance del handoff:** solo este informe. Sin cambios de código, schema, migraciones, contratos, PLAN, steering ni archivos reclamados por otros. Al cierre local previo a la publicación de este informe no se había realizado push, merge, despliegue ni actualización del claim. El commit local y su hash se entregan en la respuesta final. El primer intento de commit se detuvo por identidad Git ausente; se usó autoría explícita `Codex <codex@review.invalid>` solo para el comando, sin modificar configuración global ni atribuir el trabajo a otra persona. La coordinación remota y el registro final de la entrega en el claim quedan al coordinador.

### Referencias al SHA auditado

Todos los enlaces de evidencia del cuerpo, salvo el apartado remoto y la API externa identificada, apuntan al SHA fijo.

[state-current]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/.kiro/steering/current-state.md#L13-L25
[state-class]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/.kiro/steering/current-state.md#L29-L34
[state-security]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/.kiro/steering/current-state.md#L42-L46
[plan-s0]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/.kiro/PLAN.md#L19-L54
[plan-sprints]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/.kiro/PLAN.md#L38-L54
[simplicity]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/.kiro/steering/simplicity.md#L7-L35
[model-class]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/.kiro/steering/data-model.md#L50-L58
[runner-regex]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/tests/e2e/canonical-pilot.spec.mjs#L94-L156
[runner-config]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/scripts/canonical-pilot-config.mjs#L19-L70
[runner-test]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/tests/canonical-pilot-runner.test.mjs#L24-L40
[runner-final]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/tests/e2e/canonical-pilot.spec.mjs#L212-L256
[playwright-config]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/playwright.pilot.config.mjs#L16-L23
[pilot-runner]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/canonical-mvp-pilot.md#L82-L101
[pilot-negatives]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/canonical-mvp-pilot.md#L58-L101
[manual-next]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/as-built-system-manual.md#L1291-L1306
[manual-state]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/as-built-system-manual.md#L19-L34
[manual-evidence]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/as-built-system-manual.md#L1091-L1133
[manual-setup]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/as-built-system-manual.md#L1249-L1251
[manual-done]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/as-built-system-manual.md#L1334-L1368
[blueprint-mode]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/detailed-functional-blueprint.md#L261-L303
[blueprint-order]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/detailed-functional-blueprint.md#L925-L959
[catalog-mode]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/screen-action-catalog.md#L798-L807
[catalog-next]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/screen-action-catalog.md#L1091-L1104
[catalog-revoke]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/screen-action-catalog.md#L335-L342
[roadmap]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/platform-capability-roadmap.md#L68-L99
[setup-action]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/app/setup/actions.ts#L18-L56
[setup-page]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/app/setup/page.tsx#L7-L17
[schedule]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/prisma/schema.prisma#L624-L642
[asset-route]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/app/api/assets/%5BassetId%5D/route.ts#L9-L35
[storage-url]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/lib/storage.ts#L88-L97
[local-route]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/app/api/local-storage/route.ts#L23-L65
[local-token]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/lib/local-storage.ts#L14-L27
[guardian-read]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/lib/guardian-portal.ts#L34-L47
[announcement-read]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/lib/announcement-data.ts#L30-L39
[academic-history]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/app/dashboard/academico/actions.ts#L180-L207
[exam-history]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/app/dashboard/academico/actions.ts#L236-L268
[grade-model]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/prisma/schema.prisma#L437-L454
[submission-model]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/prisma/schema.prisma#L488-L533
[exam-model]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/prisma/schema.prisma#L566-L620
[handoff-claim]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/claude-s0-handoff.md#L31-L38
[team-protocol]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/TEAM-COORDINATION.md#L38-L68
[team-contracts]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/TEAM-COORDINATION.md#L90-L100
[academic-ui]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/components/dashboard/AcademicForms.tsx#L13-L113
[ux-tests]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/tests/ux.test.ts#L33-L88
[ci]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/.circleci/config.yml#L5-L30

---

## Seguimiento independiente — 2026-10-08 — SHA 3b5e644

**Objeto fijo:** `3b5e644afa56071c0edd6e42931141714caf4599`. Este apartado contrasta las correcciones posteriores a `0e67a916b03083b22d4142f0a56b5635ba145c52`. Todo el informe anterior, incluidas sus referencias, se conserva íntegro como historial; sus resultados no se convierten en resultados del nuevo SHA. Salvo las referencias históricas o externas identificadas, todos los enlaces de este seguimiento apuntan a `3b5e644`.

**Veredicto: BLOQUEAR el cierre de S0 sobre este SHA.** B1 está corregido, pero el bypass introducido después de la primera auditoría conserva una fuga reproducible de cabeceras entre orígenes por redirección (**B2, Bloqueante**). Su filtro también ignora el puerto (**I10, Importante**). Continúan pendientes inconsistencias documentales, aceptación UX y la decisión de salida S0-12/Q1. Las implementaciones de bootstrap, historial y revocación previstas para S1 no se exigen como código nuevo en S0.

### Base, alcance y coordinación comprobados

- Leídos primero, en orden: TEAM, current-state, simplicity y PLAN del objeto fijo; después AGENTS e inventario de `.agents/skills`. No fue necesario aplicar herramientas de plataforma o migración.
- Se reutilizó la rama propia en `4cbbde6fe8ff8fa60129388784cb68eb37bba647`. Las lecturas y pruebas se hicieron en otra copia aislada con HEAD separado en `3b5e644`, en el equipo autorizado. No se mezclaron commits de Kiro en la rama del informe.
- El diff `0e67a916..3b5e644` cambia 13 archivos: documentación, configuración y pruebas del runner. `git diff --exit-code 0e67a916..3b5e644 -- src prisma .circleci package.json package-lock.json` devuelve 0, sin diferencias. La deuda de producto original no se corrigió ni se introdujo en este intervalo.
- Se verificó el [claim existente 6054480829](https://github.com/cank3r/edukana/pull/2#issuecomment-6054480829), IMPLEMENTING, limitado a este informe y reactivado para el nuevo SHA. [TEAM:42–47,63,69][fu-team] mantiene transferencia explícita, S0-GOV REVIEW y S1-SEC PLANNED; [PLAN:32,38,52–54][fu-plan] mantiene S0-12 BLOCKED y la dependencia de S1.
- La rama remota de propuesta seguía en `0bb74bba23353757ff020761d02cebe3b61df059`; su [registro](https://github.com/cank3r/edukana/blob/0bb74bba23353757ff020761d02cebe3b61df059/TEAM-COORDINATION.md#L61-L70) reserva únicamente propuestas documentales en REVIEW. Se leyeron los comentarios actuales de PR #2 y #5. Una declaración de otro revisor sobre aprobación o un posible inicio de S1 no modifica los estados verificados ni autoriza esta tarea.
- Los resultados de types, lint, build, audit y validación declarados en [PLAN:27][fu-plan], [manual:1127–1133][fu-manual-evidence] y comentarios son evidencia atribuida a sus autores. Solo las ejecuciones de este apartado se presentan como propias.

**Avance remoto posterior, separado del objeto:** al comprobar referencias hacia las 15:32 UTC del 2026-10-08, `fix/role-access-hardening` estaba ya en `d3078325a25380f88faa3db0ba3ce4c7aaab62a8`. Solo se consultó su [registro de claims:63–69](https://github.com/cank3r/edukana/blob/d3078325a25380f88faa3db0ba3ce4c7aaab62a8/TEAM-COORDINATION.md#L63-L69): conserva S0-GOV REVIEW y S1-SEC PLANNED y declara correcciones adicionales. **No se auditó ese código ni se ejecutaron sus pruebas**; no se adopta esa declaración como corrección verificada. La copia de pruebas permaneció en 3b5e644 y la rama remota del informe en 4cbbde6.

### Matriz de seguimiento de todos los hallazgos originales

“Resuelto” se limita al defecto descrito; no significa E2E aprobado. “Previsto para otro sprint” mantiene la deuda abierta en su sprint asignado y no declara una corrección implementada.

| ID / prioridad original | Estado en 3b5e644 | Evidencia, decisión y siguiente paso |
|---|---|---|
| **B1 / Bloqueante** | **Resuelto** | [Runner:14–19][fu-runner], [117,159,178–179][fu-selects] y [257][fu-media] usan strings. Los cinco labels coinciden con las fuentes de UI detalladas más abajo. **Prueba ejecutada:** cinco selecciones con los helpers actuales en DOM sintético, Playwright 1.64.0 y Edge, correctas. No prueba el recorrido completo ni los datos reales de sus componentes. |
| **I1 / Importante** | **Resuelto** | **Inspección:** [manual:1291–1300][fu-manual-order], [blueprint:927–963][fu-blueprint-order] y [catálogo:1093–1106][fu-catalog-order] subordinan S4 a S1→S2→S3 y coinciden con [PLAN:38–43][fu-plan]. No se adelanta la migración híbrida a S0. |
| **I2 / Importante** | **Parcialmente resuelto** | **Inspección:** [estado:32][fu-state], [modelo:52–53][fu-model], [blueprint:261–304][fu-blueprint-class] y [catálogo:803–805][fu-catalog-class] separan los tres ejes. Queda una contradicción de reglas: el blueprint exige sala/enlace virtual cuando la sesión es sincrónica, pero [catálogo:809][fu-catalog-class] lo exige para toda virtual/híbrida, incluida la combinación virtual asincrónica permitida. [Filtro:878][fu-catalog-filter] y [tarjeta:353][fu-blueprint-ui] siguen agrupando participación y temporalidad. Conciliar reglas y representación en documentos S0; implementación sigue en S4. |
| **I3 / Importante** | **Parcialmente resuelto** | **Inspección:** current-state elimina el SHA efímero y la afirmación de cambios locales; [manual:20][fu-manual-history] también. Sin embargo, **manual:24–34 conserva “cambios todavía sin commit” sobre cff38c6** y afirma ausencia en Preview sin identificar una ejecución. Los archivos ya estaban versionados en 0e67a916. Corregir o fechar expresamente como historia. El 89/89 sí se reprodujo con el runtime alternativo; las otras puertas siguen siendo declaraciones ajenas. |
| **I4 / Importante** | **Parcialmente resuelto** | **Inspección:** [piloto:84–86][fu-pilot-guard] reconoce que hostname no certifica DB/bucket y exige verificar identidad antes de escribir; [estado:42][fu-state] mantiene allowlist para S1. [Validador:34–85][fu-config] sigue sin comprobar recursos desplegados y acepta puertos no predeterminados. Las seis pruebas existentes del runner pasan, sin convertir el patrón de hostname en prueba de rechazo efectivo de producción. No se ensayó ningún recurso remoto. Véase además I10. |
| **I5 / Importante** | **Previsto para otro sprint — S1** | **Inspección:** [setup/page:7–17][fu-setup-page] y [actions:18–56][fu-setup-action] no cambiaron: guardan ausencia de instituciones y transacción Serializable, pero no token de bootstrap. [Estado:42][fu-state] y [PLAN:38][fu-plan] sí lo planifican. No declarar el endpoint protegido ni inferir una carrera demostrada; no se exige implementar S1 ahora. |
| **I6 / Importante** | **Parcialmente resuelto** | **Inspección:** [catálogo:342][fu-catalog-revoke] y [piloto:62][fu-pilot-revoke] corrigen la promesa de revocación total inmediata: nuevas consultas frente a URLs emitidas con TTL nominal de hasta 300 s. [Assets:35][fu-asset] y [storage:88–97][fu-storage] no cambiaron. Pasan las dos pruebas existentes de token local, pero no miden revocación ni Supabase. Medición y reducción/mediación de la ventana siguen en S1. |
| **I7 / Importante** | **Previsto para otro sprint — S1** | **Inspección:** [acciones:180–207][fu-academic-history], [236–268][fu-exam-history] y [schema:437–620][fu-schema-history] permanecen iguales: reenvío reemplaza estado, cambios de nota no tienen revisiones y preguntas usadas carecen de snapshot. [PLAN:38][fu-plan] conserva historia académica en S1. Sin ensayo transaccional ni prueba de alteración retroactiva explotada. Mantener separado de Offering S3 y cierre/boletín S6. |
| **I8 / Importante** | **Resuelto** | **Inspección:** [TEAM:42–47][fu-team] declara que REVIEW no libera, reserva confirmación remota, establece arbitraje por primer claim publicado y exige próximo escritor confirmado; [handoff:31][fu-handoff] ya no contradice esa regla. Se comprobó el registro remoto; no se simuló una carrera de escritores. Una interpretación contraria en un comentario no sustituye el protocolo. |
| **I9 / Importante** | **Abierto** | **Inspección:** persisten texto técnico en [setup:15][fu-setup-page], tabla mínima de 520 px y horarios en minutos, publicación sin confirmación y mensajes internos en [AcademicForms:39,78,82,106–110][fu-academic-ui]. No hay cambios de producto ni inventario/aceptación de estas excepciones en las correcciones S0. La regla de cinco opciones sí fue restaurada en [simplicity:22][fu-simplicity], pero no resuelve esos casos. Sin medición UX del producto. Inventariar y asignar aceptación; corregir cada dominio en su recorrido. |
| **R1 / Recomendación** | **Previsto para otro sprint — S1 y aceptación por pantalla** | **Inspección y pruebas:** [UX:33–88][fu-ux-tests] continúa comprobando fuente; [CI:5–31][fu-ci] no incorpora PostgreSQL ni piloto. El [runner:270–279][fu-media] sigue sin segundo tenant/destinatario externo ni revocación. 89/89 no equivale a esos comportamientos. Integración DB en S1; la aceptación real de simplicidad sigue exigida por [PLAN:54][fu-plan], no queda dispensada. |
| **R2 / Recomendación** | **Parcialmente resuelto** | **Inspección:** [config:6,18–20][fu-browser] elimina Edge obligatorio: Chromium predeterminado y canal opcional. **Prueba ejecutada:** se inició Edge del sistema para ensayos locales, sin cargar esta configuración. No se instaló ni ensayó Chromium incluido/CI; [CI:19–31][fu-ci] aún no instala navegador ni ejecuta el piloto. Completar esa integración reproducible en S1. |
| **Q1 / Pregunta** | **Abierto** | **Inspección:** [TEAM:54–56,63,69][fu-team] conserva REVIEW y dependencia; [PLAN:32,52–54][fu-plan] conserva S0-12 BLOCKED y E2E requerido. [Manual:1341–1343,1362][fu-manual-done] separa puertas locales de Preview. Una aprobación ajena o CI verde no resuelve el cierre. Coordinación debe aportar E2E sobre SHA identificado o registrar la redefinición autorizada del criterio y sus riesgos. |

**Contraste de labels de B1:** `Docente Piloto · Docente` coincide con [OrganizationalUnitsManager:36][fu-units], [mapeo de página:24][fu-unit-page] y [roleLabel:46–56][fu-role]. `Asignaciones` coincide con [AssignmentForm:47][fu-category] y la categoría creada en [actions:156][fu-category-create]. Los labels de tutor/estudiante usan nombre, punto medio y correo como [GuardianshipManager:42][fu-guardian]. La mención docente usa ese mismo rol según [AnnouncementComposer:195][fu-mention] y [comunidad:88][fu-community]. La inspección verifica la cadena esperada; el DOM sintético prueba la API de selección, no el renderizado de esos componentes con DB.

### Hallazgos nuevos respecto de 0e67a916

#### B2 — Bloqueante: el bypass cruza orígenes al seguir redirecciones

**Rutas y líneas del objeto:** [`tests/e2e/canonical-pilot.spec.mjs:22–31`][fu-runner], [`scripts/canonical-pilot-config.mjs:22–25`][fu-guard]; declaración incorrecta en [`docs/canonical-mvp-pilot.md:86`][fu-pilot-guard]. Relevancia funcional: [`src/app/api/assets/[assetId]/route.ts:35`][fu-asset], [`src/app/dashboard/comunidad/page.tsx:108`][fu-community] y [`tests/e2e/canonical-pilot.spec.mjs:270–275`][fu-media].

**Origen:** el [commit 1191b82](https://github.com/cank3r/edukana/commit/1191b82ba20c324d60c9f8fcdc29eaa5a337ffc4) añadió el bypass como cabecera global. 3b5e644 elimina esa configuración y mejora las solicitudes directas mediante `page.route`, pero no corta la propagación por redirección. Es un riesgo nuevo frente a la auditoría de 0e67a916, que no contenía ese bypass; no se afirma que el filtro de 3b5e644 empeore la cabecera global anterior.

**Inspección de la versión fijada:** en `playwright-core@1.64.0/lib/coreBundle.js:37600–37610`, el manejador Chromium recupera `_alreadyContinuedParams.headers` de la petición original, los aplica a la petición redirigida y continúa sin crear otra ruta de usuario. `37857–37866` conserva esos overrides. La [fuente oficial de v1.64.0, crNetworkManager.ts](https://github.com/microsoft/playwright/blob/v1.64.0/packages/playwright-core/src/server/chromium/crNetworkManager.ts#L342-L355) contiene la misma lógica. No hay comparación de origen en ese camino.

**Prueba ejecutada:** Playwright 1.64.0 + Edge 154.0.4258.48, servidores HTTP exclusivamente en loopback, cabecera sin valor real. El origen inicial responde 302. La cabecera añadida mediante `route.continue({headers})` llegó al receptor de otro puerto y al receptor con hostname `localhost` en vez de `127.0.0.1`. El handler se invocó solo para `/start`, no para `/end`. El control de petición directa al otro origen llegó sin cabecera.

**Límite:** este ensayo ejecutó la propagación del navegador con HTTP local. El helper real se probó aparte con URLs HTTPS sintéticas; no se conectó a ellas. No se ejecutó la combinación completa runner→Preview HTTPS→Supabase, ni se usó credencial de Vercel. Tampoco se alteraron certificados, proxy, hosts o seguridad. Se confirma el mecanismo de propagación y la insuficiencia de la guarda; **no se afirma una filtración real ocurrida en un despliegue**.

**Impacto:** un GET permitido de un archivo pasa por Edukana y responde 302 a la URL firmada. La imagen del anuncio usa `/api/assets/<id>` con `unoptimized`, y el piloto exige cargarla. Por ello, una ejecución con bypass podría entregar la credencial de protección al origen de Storage o a otro destino de redirección. La frase “nunca a Supabase ni a otros orígenes” carece de soporte y contradice el comportamiento observado del cliente.

**Corrección esperada antes de usar bypass real o cerrar S0:** garantizar el confinamiento de la cabecera durante toda la cadena, con origen permitido exacto y tratamiento explícito de cada salto. Una posible estrategia es obtener respuestas sin seguimiento automático y continuar de manera controlada; no basta añadir otro filtro `page.route` esperando que intercepte redirecciones. Añadir regresión con 302 entre orígenes y control directo negativo, además del caso permitido. Kiro debe elegir e implementar la solución dentro de su claim; esta revisión no modifica el runner.

**Documentación externa, con cautela:** [Route.continue, Details](https://playwright.dev/docs/api/class-route#route-continue) describe la propagación a redirecciones; [Route.fetch, Details](https://playwright.dev/docs/api/class-route#route-fetch) contiene una recomendación aparentemente contradictoria. La decisión se apoya en el paquete exacto y en el ensayo ejecutado, no únicamente en esas frases.

#### I10 — Importante: el filtro compara hostname, no origen completo

**Rutas y líneas:** [`scripts/canonical-pilot-config.mjs:22–25`][fu-guard] y [`34–49,70–72`][fu-config]; [`tests/canonical-pilot-runner.test.mjs:59–73`][fu-tests].

**Origen:** el helper por URL aparece en 3b5e644. El validador de configuración ya aceptaba puertos en 0e67a916; el efecto nuevo es usar ese mismo hostname como frontera para enviar la cabecera.

**Prueba ejecutada del helper real:** con valor sintético, `https://<host>/asset`, `https://<host>:443/asset` y `https://<host>:444/asset` reciben la cabecera. HTTP y hostname diferente devuelven un objeto vacío. No se hizo conexión a ninguna de esas URL.

**Impacto:** 443 y 444 comparten hostname pero son orígenes distintos. La guarda no cumple el confinamiento “nunca a otros orígenes”, incluso antes de considerar un 302. No se afirma que exista un servicio escuchando en 444 en el despliegue real.

**Corrección esperada:** comparar el `origin` normalizado con el único origen aprobado para el piloto y decidir expresamente qué puertos se admiten. Si solo se acepta el Preview habitual, rechazar cualquier puerto efectivo distinto de 443 desde la configuración. Probar 443 explícito, puerto distinto, cambio de esquema y hostname; tratar también B2, porque validar el origen inicial no resuelve redirecciones.

### Pruebas propias del seguimiento y límites

| ID | Ejecución | Resultado observado |
|---|---|---|
| F1 | Git: HEAD fijo, diff contra 0e67a916 y estado de ambas copias | Copia de revisión en 3b5e644; rama del informe conserva 4cbbde6 antes de añadir este apartado. Sin cambios de producto, schema, CI o lockfile en el intervalo. |
| F2 | Los once archivos del script `npm test`, mediante Node 24.14.0 y el resolvedor temporal descrito en la auditoría original | **89/89 PASS**, 0 fallos: 83 casos anteriores más 6 del runner. No fue `npm test` literal ni Node 22/tsx. Node emitió avisos MODULE_TYPELESS_PACKAGE_JSON; no hubo fallos. |
| F3 | `node --check` del E2E y `playwright.pilot.config.mjs` | Ambos exit 0; solo sintaxis. |
| F4 | Helper real con cinco entradas sintéticas HTTPS/HTTP, host y puertos | 5 resultados afirmados: cabecera presente en HTTPS esperado, 443 y 444; ausente en HTTP y otro host. |
| F5 | Navegador, cuatro escenarios HTTP loopback con 302/control directo | Mismo origen: presente; otro puerto: presente; otro hostname: presente; petición directa al otro origen: ausente. Handler llamado una vez por caso. |
| F6 | Cinco labels del runner en cinco selects de DOM sintético | **5/5 selecciones correctas**. No renderiza la aplicación. |
| F7 | Inspección de Playwright 1.64.0, fuentes de producto, instrucciones y claims | Hallazgos y matriz separados de pruebas dinámicas. |
| F8 | Preservación del prefijo histórico del informe y `git diff --check` | Prefijo histórico íntegro, 13 IDs y 45 referencias al SHA nuevo comprobados; diff sin errores tras quitar una línea vacía final. Solo se añade este seguimiento al archivo autorizado. |

F2 reutilizó Zod 4.6.5 y el resolvedor temporal ya preparado; F4–F6 reutilizaron playwright-core 1.64.0. No se instalaron dependencias nuevas ni navegadores. El navegador usado fue Edge del sistema, no el Chromium predeterminado del piloto. Huella SHA-256 del bundle ejecutado: `2325ca4c1c83070e89dc49fb82525508f0a68e0cf12e2a624277968da216b7e0`. El lockfile no cambió y los paquetes se habían verificado contra su integridad en la revisión original.

Comando de F2, desde la copia aislada del SHA nuevo:

```powershell
$reviewScratch = Join-Path $env:TEMP 'edukana-s0-review-0e67a91'
$reviewLoader = ([Uri](Join-Path $reviewScratch 'resolve-ts.mjs')).AbsoluteUri
node --import $reviewLoader --test tests/security.test.ts tests/permissions.test.ts tests/course-scope.test.ts tests/guardianship.test.ts tests/lms.test.ts tests/schema.test.ts tests/ux.test.ts tests/announcements.test.ts tests/local-storage.test.ts tests/canonical-pilot.test.ts tests/canonical-pilot-runner.test.mjs
node --check tests/e2e/canonical-pilot.spec.mjs
node --check playwright.pilot.config.mjs
```

**No ejecutado:** puerta oficial Node 22/tsx; Prisma validate/generate, typecheck, lint, build y audit; runner completo ni `playwright --list`; PostgreSQL, Supabase, Preview o producción; reset; aislamiento DB entre instituciones; revocación real; historial transaccional; UX del producto renderizada a 360 px, teclado, tamaños o tiempos. El ensayo de navegador local no sustituye ninguno de esos recorridos. No se consultaron secretos ni datos reales de alumnos.

### Harness exacto de los ensayos F4–F6

Guardado fuera del repositorio como `followup-browser.cjs`, junto al directorio temporal `playwright-core/package` ya verificado. Ejecutado desde la copia aislada de 3b5e644 con:

```powershell
node (Join-Path $env:TEMP 'edukana-s0-review-0e67a91/followup-browser.cjs')
```

En la parte de red, la cabecera que produce el helper para una cadena HTTPS sintética se inyecta en una solicitud HTTP loopback deliberadamente. Esto permite ensayar el comportamiento de redirección sin certificados de prueba ni excepciones TLS; **no equivale a ejecutar el beforeEach del producto contra HTTPS**. Las cuatro navegaciones solo alcanzan los servidores locales creados por el ensayo.

```javascript
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('./playwright-core/package');

(async () => {
  const { getPreviewProtectionHeadersForUrl: headersFor } = await import(pathToFileURL(path.resolve('scripts/canonical-pilot-config.mjs')).href);
  const expectedHost = 'edukana-git-synthetic-example.vercel.app';
  const env = { VERCEL_AUTOMATION_BYPASS_SECRET: 'SYNTHETIC-REVIEW-MARKER-NOT-A-SECRET' };
  const cases = [
    ['expected-https', `https://${expectedHost}/asset`, true],
    ['explicit-443', `https://${expectedHost}:443/asset`, true],
    ['other-port-444', `https://${expectedHost}:444/asset`, true],
    ['http', `http://${expectedHost}/asset`, false],
    ['other-host', 'https://storage.invalid/asset', false],
  ];
  for (const [name, url, expected] of cases) {
    const present = !!headersFor(url, expectedHost, env)['x-vercel-protection-bypass'];
    assert.equal(present, expected);
    console.log(JSON.stringify({ type: 'actual-helper', name, headerPresent: present }));
  }
  const observed = [];
  let destination;
  const app = http.createServer((req, res) => {
    observed.push({server:'app',path:req.url,marker:req.headers['x-vercel-protection-bypass'] === env.VERCEL_AUTOMATION_BYPASS_SECRET});
    if (req.url === '/start') { res.writeHead(302, {Location:destination}); res.end(); }
    else { res.writeHead(200, {'Content-Type':'text/html'}); res.end('<p>LOCAL SYNTHETIC RESPONSE</p>'); }
  });
  const sink = http.createServer((req, res) => {
    observed.push({server:'sink',path:req.url,marker:req.headers['x-vercel-protection-bypass'] === env.VERCEL_AUTOMATION_BYPASS_SECRET});
    res.writeHead(200, {'Content-Type':'text/html'}); res.end('<p>LOCAL SYNTHETIC RESPONSE</p>');
  });
  const listen = server => new Promise((resolve,reject) => {server.once('error',reject); server.listen(0,'127.0.0.1',resolve);});
  let browser;
  try {
    await listen(app); await listen(sink);
    const appOrigin = `http://127.0.0.1:${app.address().port}`;
    const sinkOrigin = `http://127.0.0.1:${sink.address().port}`;
    browser = await chromium.launch({channel:'msedge',headless:true});
    console.log(JSON.stringify({type:'runtime',playwright:require('./playwright-core/package/package.json').version,browser:browser.version()}));
    for (const [name,target,redirect,expected] of [
      ['same-origin',appOrigin+'/end',true,true],
      ['other-port',sinkOrigin+'/end',true,true],
      ['other-hostname',`http://localhost:${sink.address().port}/end`,true,true],
      ['direct-other-origin',sinkOrigin+'/direct',false,false],
    ]) {
      observed.length = 0; destination = target;
      const context = await browser.newContext();
      const page = await context.newPage();
      const routed = [];
      await page.route('**/*', async route => {
        const request = route.request(); const url = new URL(request.url());
        if (!['127.0.0.1','localhost'].includes(url.hostname)) return route.abort();
        routed.push(url.pathname);
        if (url.origin === appOrigin) return route.continue({headers:{...request.headers(),...headersFor(`https://${expectedHost}/asset`,expectedHost,env)}});
        return route.continue();
      });
      const response = await page.goto(redirect ? appOrigin+'/start' : target,{waitUntil:'domcontentloaded',timeout:10000});
      assert.equal(response.status(),200);
      const received = observed.find(x=>x.path === (redirect ? '/end' : '/direct'));
      assert.ok(received); assert.equal(received.marker,expected);
      assert.deepEqual(routed,redirect ? ['/start'] : ['/direct']);
      console.log(JSON.stringify({type:'http-loopback-browser',name,finalHeaderPresent:received.marker,routed}));
      await context.close();
    }
    const context = await browser.newContext(); const page=await context.newPage();
    await page.route('**/*',route=>route.abort());
    const spec=fs.readFileSync('tests/e2e/canonical-pilot.spec.mjs','utf8');
    const emailLabel = new Function('user',spec.match(/function personEmailOptionLabel\(user\) \{([\s\S]*?)\n\}/)[1]);
    const roleLabel = new Function('user','role',spec.match(/function personRoleOptionLabel\(user, role\) \{([\s\S]*?)\n\}/)[1]);
    const teacher={name:'Docente Piloto',email:'teacher@pilot.test'};
    const parent={name:'Tutor Piloto',email:'parent@pilot.test'};
    const student={name:'Estudiante Piloto',email:'student@pilot.test'};
    const options=[['unit',roleLabel(teacher,'Docente')],['category','Asignaciones'],['parent',emailLabel(parent)],['student',emailLabel(student)],['mention',roleLabel(teacher,'Docente')]];
    await page.setContent(options.map(([id,label])=>`<select id="${id}"><option value="">Choose</option><option value="${id}">${label}</option></select>`).join(''));
    for(const [id,label] of options){ assert.deepEqual(await page.locator('#'+id).selectOption({label}),[id]); }
    console.log(JSON.stringify({type:'synthetic-select-dom',selected:options.length,actualProductRendered:false}));
    await context.close();
  } finally {
    if(browser) await browser.close();
    await Promise.all([app,sink].map(server=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve)})));
  }
})().catch(error=>{console.error(error.message);process.exitCode=1});
```

Salida resumida observada: helper `[true,true,true,false,false]`; redirecciones/control `[true,true,true,false]`; selects `5`. Todos los assertions terminaron con exit 0 y se cerraron navegador y servidores.

### Condiciones de handoff del seguimiento

1. Kiro corrige B2/I10 y sustituye la garantía absoluta sobre el bypass por un comportamiento comprobado con regresión de redirecciones y origen completo. No usar el secreto real para validar la corrección.
2. Conciliar las reglas residuales de I2 y la evidencia histórica de I3; registrar excepciones y aceptación de I9. Las tres dimensiones de ClassSession se mantienen separadas y su implementación sigue en S4.
3. Mantener el cierre Q1/S0-12 abierto hasta aportar ejecución desplegada sobre un SHA identificado o una decisión explícita del criterio y riesgo. Los 89 casos y el ensayo local de cabeceras no satisfacen esa salida.
4. Bootstrap, historia académica, identidad de recursos y revocación/medición permanecen en sus sprints acordados. No se convierte su ausencia legacy en una nueva implementación requerida para S0.
5. Entregar este seguimiento como un nuevo commit local sobre 4cbbde6, con **solo** `docs/reviews/s0-independent-review.md` modificado y la auditoría original intacta. Sin push, comentarios, review formal, PR nuevo ni actualización de claim en esta fase. La coordinación revisará la entrega antes de publicarla.

### Referencias del seguimiento al SHA 3b5e644

[fu-team]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/TEAM-COORDINATION.md#L38-L69
[fu-state]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/.kiro/steering/current-state.md#L13-L44
[fu-plan]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/.kiro/PLAN.md#L19-L54
[fu-simplicity]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/.kiro/steering/simplicity.md#L8-L30
[fu-runner]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/tests/e2e/canonical-pilot.spec.mjs#L14-L31
[fu-selects]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/tests/e2e/canonical-pilot.spec.mjs#L117-L179
[fu-media]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/tests/e2e/canonical-pilot.spec.mjs#L245-L279
[fu-guard]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/scripts/canonical-pilot-config.mjs#L13-L26
[fu-config]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/scripts/canonical-pilot-config.mjs#L34-L85
[fu-browser]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/playwright.pilot.config.mjs#L5-L24
[fu-tests]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/tests/canonical-pilot-runner.test.mjs#L47-L73
[fu-manual-history]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/docs/as-built-system-manual.md#L17-L34
[fu-manual-evidence]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/docs/as-built-system-manual.md#L1127-L1133
[fu-manual-order]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/docs/as-built-system-manual.md#L1291-L1300
[fu-manual-done]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/docs/as-built-system-manual.md#L1330-L1362
[fu-blueprint-order]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/docs/detailed-functional-blueprint.md#L927-L963
[fu-blueprint-class]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/docs/detailed-functional-blueprint.md#L261-L304
[fu-blueprint-ui]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/docs/detailed-functional-blueprint.md#L347-L368
[fu-catalog-class]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/docs/screen-action-catalog.md#L798-L809
[fu-catalog-filter]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/docs/screen-action-catalog.md#L872-L881
[fu-catalog-order]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/docs/screen-action-catalog.md#L1093-L1106
[fu-catalog-revoke]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/docs/screen-action-catalog.md#L335-L342
[fu-pilot-revoke]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/docs/canonical-mvp-pilot.md#L59-L64
[fu-pilot-guard]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/docs/canonical-mvp-pilot.md#L82-L105
[fu-handoff]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/docs/claude-s0-handoff.md#L29-L38
[fu-setup-action]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/src/app/setup/actions.ts#L18-L56
[fu-setup-page]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/src/app/setup/page.tsx#L7-L17
[fu-asset]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/src/app/api/assets/%5BassetId%5D/route.ts#L9-L35
[fu-storage]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/src/lib/storage.ts#L88-L97
[fu-academic-history]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/src/app/dashboard/academico/actions.ts#L180-L207
[fu-exam-history]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/src/app/dashboard/academico/actions.ts#L236-L268
[fu-schema-history]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/prisma/schema.prisma#L437-L620
[fu-academic-ui]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/src/components/dashboard/AcademicForms.tsx#L38-L113
[fu-ux-tests]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/tests/ux.test.ts#L33-L88
[fu-ci]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/.circleci/config.yml#L5-L31
[fu-units]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/src/components/dashboard/OrganizationalUnitsManager.tsx#L36
[fu-unit-page]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/src/app/dashboard/configuracion/unidades/page.tsx#L24
[fu-role]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/src/lib/ux.ts#L46-L56
[fu-category]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/src/components/dashboard/AcademicForms.tsx#L46-L47
[fu-category-create]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/src/app/dashboard/academico/actions.ts#L156
[fu-guardian]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/src/components/dashboard/GuardianshipManager.tsx#L42
[fu-mention]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/src/components/dashboard/AnnouncementComposer.tsx#L195
[fu-community]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/src/app/dashboard/comunidad/page.tsx#L88-L108
[fu-model]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/.kiro/steering/data-model.md#L50-L58
[fu-package]: https://github.com/cank3r/edukana/blob/3b5e644afa56071c0edd6e42931141714caf4599/package.json#L5-L17

---

## Comprobación acotada del candidato d3078325 — 2026-10-08

**Objeto fijo:** `d3078325a25380f88faa3db0ba3ce4c7aaab62a8`. Revisión limitada a **B2, I10, I3 y Q1/S0-12**, autorizada después del seguimiento anterior. La auditoría original y el seguimiento de 3b5e644 se conservan como historial. La nota previa que identifica d3078325 como “no auditado” describe el momento anterior a esta ampliación; este apartado incorpora únicamente las cuatro comprobaciones nuevas.

**Conclusión vigente para esos cuatro puntos:** **B2 resuelto en el mecanismo ensayado; I3 resuelto en sus afirmaciones documentales obsoletas; I10 y Q1 continúan abiertos.** La propagación por 302 observada en 3b5e644 no se presenta como defecto actual de este candidato. No se cambia el estado global de S0 ni se concede aceptación desplegada.

### Evidencia y decisiones del candidato

| ID / prioridad | Estado en d3078325 | Evidencia y decisión |
|---|---|---|
| **B2 / Bloqueante en 3b5e644** | **Resuelto — alcance de propagación por 302 probado** | [Handler:28–40][ca-handler] usa `route.fetch` con `maxRedirects:0` y `route.fulfill`; [runner:22–24][ca-runner] lo invoca. **Navegador ejecutado:** el receptor final no recibió la cabecera sintética tras 302 al mismo origen, otro puerto ni otro hostname. La cabecera sí llegó al primer salto. No se probó Preview/Supabase real ni una política universal para cualquier recurso. |
| **I10 / Importante** | **Abierto** | [Helper:22–25][ca-handler] continúa comparando hostname y esquema, sin puerto/origen; [config:55–65][ca-config] tampoco restringe puerto. **Helper real:** HTTPS normal, 443 y 444 reciben cabecera. **Navegador con handler real y fachada sintética:** una solicitud directa al mismo hostname en otro puerto recibió la cabecera; a otro hostname, no. Comparar origen completo y probar puertos sigue pendiente. |
| **I3 / Importante** | **Resuelto — corrección documental** | **Inspección:** [manual:24–39][ca-manual] elimina “sin commit” y conteos efímeros; [1175–1183][ca-preview] elimina el SHA/estado Preview obsoleto y distingue despliegue de aceptación. [PLAN:27][ca-plan] remite resultados al SHA ejecutado. Git confirma que los archivos están versionados. Las afirmaciones sobre despliegues o puertas locales de terceros no se verificaron operacionalmente ni se adoptan como propias. |
| **Q1 / Pregunta; S0-12** | **Abierto** | [TEAM:63,69][ca-team] conserva REVIEW y dependencia de S1; [PLAN:32,52–54][ca-plan] conserva BLOCKED y E2E requerido. El [registro de staging:9–16,32–48][ca-staging] tiene identidad DB, autorización y preflight pendientes; [84–110][ca-evidence] tiene ejecución y conclusión pendientes. Crear el documento no ejecuta ni autoriza el reset o E2E. Coordinación debe completar la aceptación o registrar una redefinición explícita del criterio y riesgo. |

**Otros IDs:** no se reauditaron en esta comprobación acotada. Su último resultado documentado, fijado a **3b5e644**, permanece: B1/I1/I8 resueltos; I2/I4/I6/R2 parciales; I5/I7/R1 previstos para otro sprint o aceptación por pantalla; I9 abierto. La matriz anterior conserva rutas y evidencias de esos resultados. No se presentan como una nueva auditoría integral de d3078325.

**Origen de las correcciones:** `fa13427` introduce el handler y el registro de staging; `bb34cd4` retira conteos obsoletos; `d307832` corrige el estado Preview. El delta cambia siete archivos; AGENTS, habilidades locales, producto, schema y lockfile no cambiaron. Se leyeron TEAM, current-state, simplicity y PLAN en el orden requerido. El ensayo usó otro worktree con HEAD separado en d3078325; la copia de 3b5e644 y la rama propia del informe no cambiaron de base.

**Límite importante de B2:** en las tres redirecciones el callback de `page.route` solo se ejecutó para `/start`. La corrección evita propagar los headers de `route.fetch`, pero **no se observó una segunda llamada al helper para validar el destino**. Incluso el redirect al mismo origen terminó sin la cabecera. No se probó si la configuración real de Deployment Protection, cookies y login mantiene el recorrido operativo. No se afirma un fallo funcional de Vercel: esa compatibilidad debe cubrirse en la aceptación autorizada.

La [prueba añadida:77–114][ca-test] usa rutas simuladas e invoca por separado el handler del origen permitido y otro externo. Confirma opciones y decisiones aisladas; por sí sola no reproduce un 302 de navegador. El ensayo local siguiente cubre esa diferencia.

**Límite importante de Q1:** [registro:14–16][ca-staging] propone una rama/alias Preview y deja el SHA por registrar. No se supone que ese alias esté sirviendo este candidato. Su preflight exige comprobar que HEAD, PR y deployment coinciden; no se consultaron credenciales, recursos ni se ejecutaron las instrucciones destructivas del documento.

### Ejecuciones propias, método y límites

**Versiones:** Node **24.14.0**, playwright-core **1.64.0**, Edge del sistema **154.0.4258.48**, headless. Se reutilizó el mismo paquete verificado; no hubo instalaciones o descargas nuevas.

| Ejecución | Resultado |
|---|---|
| `node --test tests/canonical-pilot-runner.test.mjs` | **7/7 PASS**, exit 0. No se repitió toda la suite del candidato. El 89/89 anterior pertenece a 3b5e644. |
| Cinco entradas al helper actual | Cabecera presente para HTTPS esperado, 443 explícito y 444; ausente para HTTP y otro hostname. |
| Cinco escenarios de navegador en HTTP loopback | Tres redirects sin cabecera final; directo a otro hostname sin cabecera; directo al mismo hostname/otro puerto con cabecera. Todos los assertions terminaron con exit 0. |
| `node --check` de E2E y configuración del runner | Exit 0; solo sintaxis. |
| Git y lectura documental | HEAD fijo, worktree limpio, delta acotado y registros pendientes confirmados. |

**Resultado de red detallado:**

| Escenario | Cabecera en primer salto | Cabecera en destino final | Callback |
|---|---|---|---|
| 302 al mismo origen | Sí | No | Solo `/start` |
| 302 al mismo hostname y otro puerto | Sí | No | Solo `/start` |
| 302 a otro hostname local | Sí | No | Solo `/start` |
| Directo a otro hostname local | No | No | Solo `/direct` |
| Directo al mismo hostname y otro puerto | Sí | Sí | Solo `/direct` |

Los servidores escucharon únicamente en `127.0.0.1`; el segundo hostname fue `localhost`. Se usó un marcador sintético sin valor real. El handler del candidato se importó sin modificarlo. Una fachada presentó a `request.url()` una URL HTTPS sintética con el mismo patrón de hostname/puerto, mientras `fetch`, `fulfill` y `continue` delegaron al Route real y todas las conexiones fueron HTTP loopback. Se comprobó `maxRedirects:0` en cada primer salto.

**Este ensayo HTTP demuestra la semántica de redirección de Playwright y la decisión del handler con entradas sintéticas; no ejecuta el flujo HTTPS real de Edukana.** No se usó `ignoreHTTPSErrors`, ni flags para certificados, cambios de proxy/hosts o permisos. No hubo conexión a DB, Storage, Preview o producción; tampoco secretos, datos reales, reset, escritura del registro de staging o implementación de correcciones.

Siguen sin ejecutarse puerta oficial Node 22/tsx, build/typecheck/lint/audit/Prisma, E2E completo, integración DB, revocación real y UX del producto. No se trasladan resultados de 3b5e644 como si fueran ejecuciones de d3078325.

### Harness exacto del candidato

Archivo temporal `candidate-browser.cjs` junto a `playwright-core/package`, ejecutado desde el worktree de d3078325:

```powershell
node --test tests/canonical-pilot-runner.test.mjs
node (Join-Path $env:TEMP 'edukana-s0-review-0e67a91/candidate-browser.cjs')
node --check tests/e2e/canonical-pilot.spec.mjs
node --check scripts/canonical-pilot-config.mjs
```

```javascript
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('./playwright-core/package');

(async () => {
  const { getPreviewProtectionHeadersForUrl: headersFor, handlePreviewProtectionRoute: handle } = await import(pathToFileURL(path.resolve('scripts/canonical-pilot-config.mjs')).href);
  const expectedHost='edukana-git-synthetic-example.vercel.app';
  const env={VERCEL_AUTOMATION_BYPASS_SECRET:'SYNTHETIC-REVIEW-MARKER-NOT-A-SECRET'};
  for(const [name,url,expected] of [
    ['expected-https',`https://${expectedHost}/asset`,true],
    ['explicit-443',`https://${expectedHost}:443/asset`,true],
    ['other-port-444',`https://${expectedHost}:444/asset`,true],
    ['http',`http://${expectedHost}/asset`,false],
    ['other-host','https://storage.invalid/asset',false],
  ]) {const present=!!headersFor(url,expectedHost,env)['x-vercel-protection-bypass']; assert.equal(present,expected); console.log(JSON.stringify({type:'candidate-helper',name,headerPresent:present}));}
  const observed=[];let destination;
  const app=http.createServer((req,res)=>{
    observed.push({server:'app',path:req.url,marker:req.headers['x-vercel-protection-bypass']===env.VERCEL_AUTOMATION_BYPASS_SECRET});
    if(req.url==='/start'){res.writeHead(302,{Location:destination});res.end();}
    else{res.writeHead(200,{'Content-Type':'text/html'});res.end('<p>LOCAL SYNTHETIC RESPONSE</p>');}
  });
  const sink=http.createServer((req,res)=>{
    observed.push({server:'sink',path:req.url,marker:req.headers['x-vercel-protection-bypass']===env.VERCEL_AUTOMATION_BYPASS_SECRET});
    res.writeHead(200,{'Content-Type':'text/html'});res.end('<p>LOCAL SYNTHETIC RESPONSE</p>');
  });
  const listen=s=>new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve)});
  let browser;
  try{
    await listen(app);await listen(sink);
    const appOrigin=`http://127.0.0.1:${app.address().port}`;
    const sinkOrigin=`http://127.0.0.1:${sink.address().port}`;
    browser=await chromium.launch({channel:'msedge',headless:true});
    console.log(JSON.stringify({type:'runtime',node:process.version,playwright:require('./playwright-core/package/package.json').version,browser:browser.version()}));
    for(const [name,target,redirect,expected] of [
      ['same-origin',appOrigin+'/end',true,false],
      ['other-port',sinkOrigin+'/end',true,false],
      ['other-hostname',`http://localhost:${sink.address().port}/end`,true,false],
      ['direct-other-hostname',`http://localhost:${sink.address().port}/direct`,false,false],
      ['direct-other-port',sinkOrigin+'/direct',false,true],
    ]){
      observed.length=0;destination=target;
      const context=await browser.newContext();const page=await context.newPage();const routed=[];const fetched=[];
      await page.route('**/*',async route=>{
        const request=route.request();const url=new URL(request.url());
        if(!['127.0.0.1','localhost'].includes(url.hostname))return route.abort();
        routed.push(url.pathname);
        const syntheticHost=url.hostname==='127.0.0.1'?expectedHost:'storage.invalid';
        const facade={
          request:()=>({url:()=>`https://${syntheticHost}:${url.port}${url.pathname}`,headers:()=>request.headers()}),
          continue:options=>route.continue(options),
          fetch:options=>{fetched.push({maxRedirects:options.maxRedirects});return route.fetch(options)},
          fulfill:options=>route.fulfill(options),
        };
        await handle(facade,expectedHost,env);
      });
      const response=await page.goto(redirect?appOrigin+'/start':target,{waitUntil:'domcontentloaded',timeout:10000});
      assert.equal(response.status(),200);
      const final=observed.find(x=>x.path===(redirect?'/end':'/direct'));
      assert.ok(final);assert.equal(final.marker,expected);
      if(redirect){assert.equal(observed.find(x=>x.path==='/start').marker,true);assert.equal(fetched.length,1);assert.equal(fetched[0].maxRedirects,0);}
      assert.deepEqual(routed,redirect?['/start']:['/direct']);
      console.log(JSON.stringify({type:'candidate-http-loopback',name,finalHeaderPresent:final.marker,routed,fetched}));
      await context.close();
    }
  }finally{
    if(browser)await browser.close();
    await Promise.all([app,sink].map(s=>new Promise(resolve=>{s.closeAllConnections();s.close(resolve)})));
  }
})().catch(error=>{console.error(error.message);process.exitCode=1});
```

### Entrega acotada

Corregir I10 antes de dar por verificado el confinamiento por origen; mantener Q1/S0-12 pendiente con evidencia identificada. B2 no se reabre por el comportamiento de 3b5e644 que ya se corrigió. Conservar las conclusiones históricas con sus SHA y completar una aceptación autorizada del candidato que finalmente se elija.

Se consolida únicamente el seguimiento añadido a `docs/reviews/s0-independent-review.md` en un commit local cuyo padre es `4cbbde6fe8ff8fa60129388784cb68eb37bba647`. Auditoría original y seguimiento de 3b5e644 intactos. Sin push, PR nuevo, comentarios, revisión formal ni cambios en el registro de staging.

[ca-handler]: https://github.com/cank3r/edukana/blob/d3078325a25380f88faa3db0ba3ce4c7aaab62a8/scripts/canonical-pilot-config.mjs#L22-L41
[ca-config]: https://github.com/cank3r/edukana/blob/d3078325a25380f88faa3db0ba3ce4c7aaab62a8/scripts/canonical-pilot-config.mjs#L49-L65
[ca-runner]: https://github.com/cank3r/edukana/blob/d3078325a25380f88faa3db0ba3ce4c7aaab62a8/tests/e2e/canonical-pilot.spec.mjs#L22-L24
[ca-test]: https://github.com/cank3r/edukana/blob/d3078325a25380f88faa3db0ba3ce4c7aaab62a8/tests/canonical-pilot-runner.test.mjs#L77-L114
[ca-manual]: https://github.com/cank3r/edukana/blob/d3078325a25380f88faa3db0ba3ce4c7aaab62a8/docs/as-built-system-manual.md#L17-L39
[ca-preview]: https://github.com/cank3r/edukana/blob/d3078325a25380f88faa3db0ba3ce4c7aaab62a8/docs/as-built-system-manual.md#L1175-L1183
[ca-plan]: https://github.com/cank3r/edukana/blob/d3078325a25380f88faa3db0ba3ce4c7aaab62a8/.kiro/PLAN.md#L27-L54
[ca-team]: https://github.com/cank3r/edukana/blob/d3078325a25380f88faa3db0ba3ce4c7aaab62a8/TEAM-COORDINATION.md#L54-L69
[ca-staging]: https://github.com/cank3r/edukana/blob/d3078325a25380f88faa3db0ba3ce4c7aaab62a8/docs/s0-staging-acceptance-record.md#L5-L48
[ca-evidence]: https://github.com/cank3r/edukana/blob/d3078325a25380f88faa3db0ba3ce4c7aaab62a8/docs/s0-staging-acceptance-record.md#L80-L110

---

## Nota final documental — 2026-10-08 — SHA 7deb3f1

**Objeto:** `7deb3f1b45cf56c1eb50f4acffe8c7fff7a5bd41`, contrastado únicamente con `d3078325a25380f88faa3db0ba3ce4c7aaab62a8`. El delta modifica siete documentos; no cambia producto, schema, runner, pruebas ni dependencias. No se repitió ninguna comprobación dinámica. Las últimas pruebas del handler permanecen fijadas a **d3078325**; el 89/89 histórico permanece fijado a **3b5e644**.

**Explicación vigente de Q1/S0-12: abierto.** [PLAN:32](https://github.com/cank3r/edukana/blob/7deb3f1b45cf56c1eb50f4acffe8c7fff7a5bd41/.kiro/PLAN.md#L32) sustituye el reset por un **entorno de aceptación NUEVO, aislado y allowlisted**. Staging y su Storage conservan los datos demostrativos y no se resetean, vacían ni limpian. Faltan provisión/asignación, identidad y separación verificadas, autorización específica y E2E del entorno nuevo. El [registro:9–33](https://github.com/cank3r/edukana/blob/7deb3f1b45cf56c1eb50f4acffe8c7fff7a5bd41/docs/s0-staging-acceptance-record.md#L9-L33) deja pendientes recursos y autorización, y [82–109](https://github.com/cank3r/edukana/blob/7deb3f1b45cf56c1eb50f4acffe8c7fff7a5bd41/docs/s0-staging-acceptance-record.md#L82-L109) deja pendiente evidencia y conclusión. Se conserva su ruta histórica, pero ya no prescribe reset. Leer ese registro **no autoriza crear recursos**, asumir costos, ejecutar migraciones o hacer escrituras.

**Residuo dentro de Q1 — Importante, inspección estática:** [blueprint §26:931–936](https://github.com/cank3r/edukana/blob/7deb3f1b45cf56c1eb50f4acffe8c7fff7a5bd41/docs/detailed-functional-blueprint.md#L931-L936) todavía ordena en la línea 935: “Reiniciar solo staging con autorización explícita”. El delta no modifica ese apartado. Contradice la conservación expresa del nuevo PLAN/registro y podría orientar una operación sobre el entorno equivocado. **Corrección esperada:** reemplazar esa instrucción por provisión y aceptación en el entorno nuevo aislado, conservando staging. Se señala como inconsistencia documental; no se ejecutó ni se interpretó como autorización de reset.

**Estados:** B2 permanece resuelto para la propagación por 302 probada en d3078325; I3 permanece corregido documentalmente; I10 sigue abierto porque el código de hostname/puerto no cambió. Q1 continúa abierto con las condiciones nuevas y el residuo anterior. Los demás IDs conservan su última evaluación y SHA, sin una nueva auditoría integral. No se declara S0 DONE.

Esta nota actualiza el requisito vigente; las menciones a reset en auditorías anteriores se conservan exclusivamente como historia de sus SHA. Los cierres “sin push” anteriores describen entregas locales previas. La publicación ahora autorizada comprende solo este informe; el coordinador actualizará el claim existente. No se modificaron el registro de aceptación, código ni documentación ajena.
