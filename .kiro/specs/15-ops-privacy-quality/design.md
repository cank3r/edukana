# 15 · Operación y calidad — Diseño
**Jobs:** tabla `Job` con `FOR UPDATE SKIP LOCKED`; worker invocado por cron cada minuto; manejadores registrados por tipo.
**Exportación:** job que escribe CSV por modelo filtrado por espacio + archivos, comprime y entrega URL firmada de 24 h.
**Anonimización:** reemplaza identificadores personales conservando registros académicos y contables.
**PWA:** manifiesto generado por espacio (`/manifest.webmanifest` dinámico), service worker con caché de lectura.
**API:** `/api/v1/**` con clave → membresía de servicio con rol; mismo `can()` y DAL.
**CI:** lint, tipos, unitarias, integración con Postgres, E2E Playwright, axe, auditoría de dependencias, guardas de ruta.
