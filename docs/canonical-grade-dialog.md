# Modal de calificaciones: foco y navegación

Claim `MVP-UX-MODAL`, rama `mvp/grade-dialog-20261012`, base `65f5b6a1395c6cee49b2348a577b354bffb19175`.
El coordinador autorizó el handoff limitado de `calificaciones/page.tsx`; PR114 permanece fuera de esta entrega.

## Problema y alcance

Run06 y el recorrido UX posterior detectaron fuga de foco con Tab/Shift+Tab, Escape sin cierre y pérdida del
disparador al volver. En móvil, retirar la query también plegaba el `<details>` del estudiante.

El cambio de aplicación consta de `GradeDialog.tsx` y el import/wrapper del bloque de modal en `page.tsx`.
Los hijos del modal permanecen idénticos: encabezado, Cerrar, `GradeEditor` e historial. No cambia
`GradebookTools.tsx`, la acción de guardar, validación, formato, permisos, datos ni construcción de rutas.

## Comportamiento

- El componente cliente permanece montado al retirar `?nota=…`; conserva el href exacto de la celda.
- Usa `<dialog>` con `showModal()` para mantener inerte el fondo y conserva el nombre accesible del estudiante.
- Al abrir, incluso por URL directa o recarga, enfoca `input[name="score"]`. Tab y Shift+Tab circulan por los
  controles visibles y habilitados. La comprobación de foco excluye controles deshabilitados y ocultos.
- Escape cancela el cierre automático del diálogo y navega a `closeHref` con `router.push` y `scroll:false`,
  igual que el enlace Cerrar. La query sigue determinando si está abierto; no se envía el formulario.
- Cerrar, Cancelar y el `router.replace` de `GradeEditor` tras guardar siguen su implementación actual.
  Atrás/Adelante siguen el historial de navegación existente.
- Después de la actualización de la página, se enfoca el enlace de esa celda visible en el viewport actual.
  En móvil se abre antes el `<details>` correspondiente. Si desapareció la celda, se intenta el resumen
  conservado y, finalmente, el título de la página. No se restaura foco al navegar a otra ruta.
- El frame de restauración se cancela si cambia de nuevo el estado; el cleanup cierra el diálogo nativo.

El contenedor conserva panel, espaciado, scroll interior y alineación inferior móvil/centrada de escritorio.
No agrega cierre por click en el fondo, confirmaciones nuevas ni manejo diferente del envío pendiente.

## Validación y trabajo separado

Validación local: TypeScript 5.9.3 del componente nuevo, sintaxis TSX de ambos archivos, lint de ambos con
Next 16.4 core-web-vitals/TypeScript y `git diff --check`. El worktree no instala dependencias; las
comprobaciones resuelven las existentes del checkout local. Todos esos chequeos terminaron sin errores;
el lint no reportó avisos de código. El primer chequeo de tipos no encontró
`next/navigation`; se corrigió el mapeo de solo lectura a su declaración real, sin stubs ni cambios del repo.
El lint avisa que no puede autodetectar React en este worktree y asume la versión más reciente.

El agente UX es el único escritor de estos archivos de aplicación y de este documento. El runner escribe
`grade-dialog.spec.ts` en `mvp/grade-dialog-tests-20261012`, commit `04e5824e791764be7cf72484611eb75222fe9077`;
el integrador configura el proyecto y ejecuta el runtime. La prueba nueva contiene cuatro casos (dos por viewport),
con tipos/lint/diff correctos y ejecución pendiente. QA independiente
revisa sin editar; su revisión preliminar no detectó bloqueantes y solicitó retirar `tabIndex` del diálogo nativo,
ajuste aplicado antes del commit. El frente de acceso a archivos tiene otro escritor y alcance.

No se ejecutaron navegador, build ni base de datos desde este worktree. La integración debe verificar
360/1280, foco inicial, ciclo Tab/Shift+Tab, Escape/Cerrar/Cancelar, entrada directa, recarga abierta,
Atrás/Adelante, retorno móvil y nota persistente. Las pruebas conservan el bloqueo de escrituras de negocio
después del login. Los resultados de estas ejecuciones y la aceptación de Carlos siguen pendientes.
