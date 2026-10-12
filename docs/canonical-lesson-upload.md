# Carga de archivos de lecciones

La carga desde `LessonFiles` reservaba el tamaño y tipo del archivo original, pero enviaba un cuerpo `FormData` al PUT firmado. La envoltura multipart añadía bytes y hacía que la confirmación rechazara el archivo.

El cliente ahora envía el `File` directamente y declara `content-type: file.type`, como ya hace `AnnouncementComposer`. Conserva `x-upsert: false` y el flujo existente de reserva, confirmación, errores y actualización de pantalla. El cambio se limita a la llamada PUT; no cambia permisos, API, proveedor, esquema ni migraciones.

## Evidencia y validación

- Base de aplicación: `ffaadff471c4c02341b31619dbef8956bf1b4896`; claim publicado en `acbd7f2501f39b282603198073e65db0e039c4e0`.
- Antes del cambio, Run06 del recorrido canónico mostró el aviso «El archivo recibido no coincide con la carga autorizada» al adjuntar un archivo desde la lección.
- El integrador reprodujo el protocolo con los handlers PUT/PATCH reales y fixtures en memoria: el PDF de 38 bytes produjo 307 bytes con multipart y confirmación 409; enviarlo crudo conservó los 38 bytes y obtuvo PUT 201 / PATCH 200. Esa sonda no sustituye la prueba HTTP del cliente corregido.
- ESLint focal con Node 24 y dependencias del checkout vecino: exit 0, con aviso de detección de versión React por la ubicación de las dependencias. `git diff --check`: PASS. Diff de aplicación: una línea añadida y cuatro eliminadas, exclusivamente en el PUT de `LessonFiles`.
- QA independiente del cambio: PASS. Run07 sobre `4f8a4e0674e8e61667176112df12ec7c9f57d3e4`, árbol limpio al iniciar, confirmó desde UI un documento de texto y un WebM generado en Chromium: PATCH 200, estado «Archivo adjuntado», GET autorizado y descarga con bytes idénticos. Node 22, PostgreSQL 16.4 y Storage privado temporal. El fallo posterior de selector al editar contenido impidió terminar la revocación de capacidad/TTL; no invalida la carga comprobada ni se presenta como PASS de esa prueba completa.
- No se ejecutó esta corrección en Preview ni se afirma entrega con Supabase. No hubo merge ni despliegue.

El siguiente escritor es el integrador para incorporar el commit, registrar los resultados HTTP y completar la evidencia. Carlos conserva la aceptación del recorrido desplegado.
