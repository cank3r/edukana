# 09 · Portal de familias — Diseño
**Datos:** `Guardianship`. Resolutor de relación `child` en `can()`.
**DAL:** `getGuardianHome(ctx, studentId)`, `getChild*View`; todas reciben `studentId` y validan vínculo + permiso del vínculo + módulo.
**Rutas:** `/familia`, `/familia/[studentId]/{progreso,tareas,asistencia,calificaciones,pagos,mensajes}`. El hijo seleccionado va en la URL, no en estado oculto.
**Resumen semanal:** job por espacio en día y hora configurados.
**Pruebas:** ID de hijo ajeno 404; permiso de finanzas apagado; revocación inmediata; mayoría de edad.
