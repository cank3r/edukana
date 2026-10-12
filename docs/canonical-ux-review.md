# Evidencia UX del recorrido canónico

Base de aplicación de Run06: `ffaadff471c4c02341b31619dbef8956bf1b4896`. Claims `MVP-UX-CANONICA`, `MVP-UX-CONTROLES` y `MVP-UX-DESBORDAMIENTO`, rama `mvp/canonical-ux-proof-20261012`.

## Alcance y estado

`tests/e2e/canonical-mvp/ux.spec.ts` añade diez casos: cuatro roles por dos anchos, y dos casos de teclado en el editor de nota. La prueba depende de los seis bloques UI completos y de los helpers/fixtures del nuevo harness canónico; no funciona por sí sola sobre esta rama de documentación/prueba.

**Run06-ux01: 3 casos PASS y 7 FAIL. Run07 confirma las áreas táctiles observables de administración; la corrección del desbordamiento todavía necesita runtime. No es aceptación del MVP.** El integrador ejecutó los diez casos el 12 de octubre de 2026 contra la aplicación local y la fixture de Run06, con acceso académico y progreso de lección restaurados por UI antes del ensayo. Carlos mantiene la aceptación final en Preview.

Validación estática local: TypeScript 5.9.3 sin errores (resolución virtual de solo lectura a los helpers/fixtures reales del integrador y dependencias existentes); ESLint con el preset TypeScript de Next 16.4.0, cero errores y avisos; sintaxis y `git diff --check` correctos. No se instaló ni copió el harness a esta rama, y estas comprobaciones no ejecutaron navegador ni base de datos.

Selectores contrastados con la UI: contenido usa el botón accesible «Editar lección …», sin depender del prefijo numérico del título; comentario admite el prefijo «Comentario de tu docente». La entrega editable comprueba el valor del textbox; una entrega ya calificada aparece como texto en la región «Tu entrega», pues la política impide reenviarla. Ambos estados deben conservar exactamente la respuesta del ensayo.

## Qué comprueba

| Área | Comprobación |
|---|---|
| Administración | Inicio, Personas, Datos de la institución, Tutores y estudiantes, Avisos; zona horaria tras recarga. |
| Docente | Inicio, contenido, entrega, calificaciones y avisos; lección persistente. |
| Estudiante | Inicio, lección, entrega, notas y avisos; progreso, entrega calificada y comentario tras recarga. |
| Tutor | Inicio, resumen del hijo y avisos; avance, nota y asistencia tras recarga. |
| 360 × 844 y 1280 × 800 | Sin desbordamiento global; a 360 px tampoco contenido principal de ancho oculto. Controles de 44 px, contando la etiqueta visible asociada de inputs. Enlaces de texto corrido no se consideran botones; el control móvil «Volver» sí se mide. |
| Teclado móvil | Abrir Menú con Enter, alcanzar opción principal con Tab y navegar con Enter; menú cerrado al cambiar de página. |
| Modal docente | Apertura de nota mediante enlace real y teclado; foco inicial, Tab/Shift+Tab, Escape, vuelta del foco y nota 92 conservada al recargar, sin guardar. |

Cada caso autentica exclusivamente cuentas ficticias creadas por el core mediante el login normal. Después del login, el navegador bloquea cualquier POST/PUT/PATCH/DELETE y lo registra como fallo; bloquea también orígenes externos. Cerrar el contexto termina el caso. No modifica usuarios, notas, vínculos, permisos ni archivos. El login puede producir las escrituras propias de autenticación.

La prueba no guarda cookies, tokens, enlaces firmados, capturas, vídeo ni trazas. Sus fallos y medidas permanecen en el informe privado del harness. Las aserciones blandas conservan el fallo del caso y permiten continuar otras pantallas; no se usan skips ni fallos esperados para convertir discrepancias en éxito.

## Evidencia de Run06-ux01

Fuente: `../canonical-mvp-evidence/run-local-01/run06-ux01/private/results.json` y sus `test-results/*/error-context.md`, inspeccionados sin abrir navegador ni modificar datos. Diez casos, cero omitidos y cero fluctuantes; duración de 108,3 segundos. Los informes privados contienen la evidencia detallada del integrador.

| Caso | 360 px | 1280 px | Evidencia y clasificación |
|---|---|---|---|
| Administración | FAIL | FAIL | Móvil: documento de 526 px en Inicio, «Volver» de 20 px en cuatro rutas y controles de vínculos pequeños. Escritorio: controles de vínculos pequeños. |
| Docente | FAIL | PASS | Móvil: «Volver» de 20 px en cuatro rutas. |
| Estudiante | FAIL | PASS | Móvil: «Volver» de 20 px en cuatro rutas. |
| Tutor | FAIL | PASS | Móvil: «Volver» de 20 px en dos rutas. |
| Modal de nota | FAIL | FAIL | Tab y Shift+Tab permiten salir; Escape no cierra; el cierre no devuelve el foco al origen. En móvil, además, se pliega la tarjeta que contenía el enlace. |

Las comprobaciones de rutas, encabezados, persistencia tras recarga y navegación móvil por teclado pasaron. Los tres selectores corregidos de lección, comentario y entrega no generaron falsos fallos. Las aserciones blandas mantuvieron rojos los siete casos afectados.

- **Áreas táctiles confirmadas:** `DashboardBreadcrumbs.tsx:30` renderizaba «Volver» con altura de 20 px. `GuardianshipManager.tsx:9/33/43/59/61` producía selects de 37 px, botones habilitados de 36 px y casillas nativas de 13 × 13 px sin etiqueta asociada de 44 px. Son fallos del criterio táctil del recorrido, observado en la UI.
- **Modal confirmado, fuera del cambio de controles:** `calificaciones/page.tsx:222–264` declara un diálogo sin retención de foco ni cierre con Escape; `GradebookTools.tsx:264` solo inicia el foco. La tarjeta móvil depende de `cell` para estar abierta (`calificaciones/page.tsx:99`), y al cerrar se pierde el origen visible. El archivo de página solapa PR114 y necesita coordinación previa a cualquier corrección.
- **Desbordamiento observado:** el documento del Inicio de administración mide 526 px a un viewport de 360 px. El contexto de Run06 corresponde a una pantalla posterior y no identifica el elemento causante; la sonda posterior de Run07 lo localiza en la tabla accesible del gráfico, como se detalla abajo.
- **Aislamiento de Escape:** en Run06 se comprobaba después de una fuga de foco. La prueba ahora enfoca «Cerrar» dentro del diálogo antes de pulsar Escape, conservando todas las aserciones de retención, cierre y retorno del foco. Falta ejecutar este diagnóstico aislado; no se marca el fallo anterior como PASS.

## Corrección de controles y medidas de Run07

`DashboardBreadcrumbs.tsx` añade `min-h-11` al enlace móvil. `GuardianshipManager.tsx` añade la misma altura mínima a selects y a los cuatro botones, y convierte cada etiqueta de casilla en un área flex de al menos 44 px con la casilla de 20 px alineada. Solo cambian clases CSS: se conservan acciones, confirmaciones, condiciones de habilitación, permisos y destinos.

El integrador incorporó la corrección de controles en `f926e28`, obtuvo revisión independiente CSS y build Node22 correctos, y habilitó la sonda de administración `run07-ux-diagnostic`. El vínculo de la fixture está revocado y la matrícula completada: la sonda no equivale a repetir los diez casos UX.

Validación estática inicial del cambio: cero errores de TypeScript en la prueba, cero errores de sintaxis TSX en los dos componentes y cero errores o avisos de lint con los presets Next core-web-vitals/TypeScript; `git diff --check` correcto. Las dependencias se resolvieron desde el checkout local existente, sin instalar paquetes. El lint avisó que este worktree no tiene React instalado para autodetectar su versión y asumió la más reciente.

La sonda posterior usa Node 22.20.0 y el build `B0vrKq9OtJdqr3i3sQ2Tv`, `fixtureEnvironment`, `readManifest` y login UI de la aplicación local. Después del login bloquea métodos distintos de GET/HEAD y orígenes externos. Resultado: cero solicitudes de escritura posteriores al login y cero solicitudes externas. Ambos contextos y el navegador terminaron cerrados. La evidencia y seis capturas sintéticas permanecen fuera de Git, en `../canonical-mvp-evidence/run-local-01/run07-ux-diagnostic/private/`.

| Ruta y medida | 360 px | 1280 px |
|---|---|---|
| `/dashboard`: ancho del documento | 526 px | 1280 px |
| `/dashboard/gestion`: ancho del documento | 360 px | 1280 px |
| `/dashboard/configuracion/tutores`: ancho del documento | 360 px | 1280 px |
| «Volver» en Personas y vínculos | 44 px de altura | Oculto por diseño |
| Tres selects de vínculos | 44 px de altura | 44 px de altura |
| Botón Crear y Guardar deshabilitado | 44 px de altura | 44 px de altura |
| Diez etiquetas de casilla | 286 × 44 px como mínimo | 455 × 44 px como mínimo |

Las casillas visibles miden 20 × 20 px y su etiqueta completa proporciona el área táctil. Activar y Revocar no aparecen en la fixture revocada; no se verificaron sus medidas ni el estado habilitado de Guardar. Tampoco se repitieron las rutas de los otros roles ni el modal.

## Desbordamiento localizado y corrección pendiente de runtime

En `/dashboard` a 360 px, `main figure > table.sr-only` ocupa `x=32`, `y=1626.23`, ancho `494`, alto `240` y extremo derecho `526`, que coincide con el ancho del documento. `main` conserva `clientWidth=360` y `scrollWidth=360`. La tabla, su caption y filas son el grupo que alcanza ese extremo. El CSS calculado de la tabla es `display: table`, `position: absolute`, `width: 494px`, `white-space: nowrap` y `overflow-x: hidden`. La fuente es `src/app/dashboard/_tablero/TrendChart.tsx`, tabla posterior a los dos SVG (líneas 43–59 antes del cambio).

Los enlaces de «Ordenar cursos» también tienen bounds fuera del viewport, pero están contenidos por su navegación con `overflow-x-auto`; no explican el ancho del documento. Tampoco lo explica la caja del menú móvil cerrado, que termina en x=336. La medición de bounds por sí sola no convierte estos elementos recortados en fallos adicionales.

El claim `MVP-UX-DESBORDAMIENTO` autoriza mover `sr-only` de la tabla a un `div` envolvente. El contenedor permite recortar el ancho intrínseco de la tabla manteniendo `table`, `caption`, cabeceras con `scope`, filas y datos intactos; no cambia el SVG ni las acciones. No se elimina contenido accesible ni se oculta el overflow global.

Siguiente paso del integrador: incorporar este cambio, reconstruir y volver a medir 360/1280; comprobar también que la tabla conserva su presencia y contenido en el árbol de accesibilidad. Hasta esa ejecución no se declara corregido el overflow. El modal continúa abierto y fuera de este alcance.

Validación local de `TrendChart.tsx`: sintaxis TSX correcta, lint Next core-web-vitals/TypeScript con cero errores y avisos, y `git diff --check` correcto. No se reconstruyó ni abrió navegador para este cambio; el integrador conserva el turno de runtime.

La sonda tuvo dos errores de preparación resueltos antes del resultado final: `SyntaxError: The requested module '/app/tests/e2e/canonical-mvp/helpers.ts' does not provide an export named 'login'` y `page.evaluate: ReferenceError: __name is not defined`. Se resolvieron importando el helper CJS por default y cargando la medición DOM como JS sin transformación de tsx. El ensayo final terminó con código 0.

## Hallazgos de código sin ejecución específica

- `TeacherHome.tsx:25`: el docente sin cursos recibe la instrucción de esperar asignación, aunque tiene permiso para crear cursos. Es un problema de orientación del vacío; la fixture completa ya no reproduce ese vacío.
- `ContentEditor.tsx:176`: publicar/ocultar contenido no solicita confirmación ni muestra impacto. No se pulsa en esta prueba porque cambiaría datos de negocio.

No cubre lector de pantalla, contraste completo, correo real, backend Supabase, red lenta ni el recorrido completo de creación a 360 px. El smoke preparado y las suites de Personas/matrícula/asistencia siguen siendo evidencia complementaria, nunca sustituyen este recorrido ni la revisión humana.
