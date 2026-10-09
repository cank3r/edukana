# URLs firmadas y revocación de acceso

**Estado:** contrato vigente desde S1. Código: `src/server/signed-urls.ts` y `src/app/api/assets/[assetId]/route.ts`.

## Qué garantiza Edukana

1. Ningún archivo privado tiene URL pública permanente. Toda lectura pasa por `/api/assets/[assetId]`,
   que comprueba sesión vigente, institución y permiso sobre ese archivo antes de emitir una URL
   firmada. La única excepción son las imágenes públicas descritas abajo.
2. Al revocar un acceso (vínculo de tutor, cuenta suspendida, matrícula retirada), la siguiente
   solicitud de URL se rechaza. Esto es inmediato.
3. Una URL firmada ya emitida sigue funcionando hasta que vence. Ese es el **acceso residual**:

| Tipo de archivo | Vigencia máxima de una URL emitida |
|---|---|
| Documento, imagen, otro | 60 segundos |
| Video | 5 minutos |

## Qué no garantiza

- No se puede invalidar una URL de Supabase Storage antes de su vencimiento.
- No se puede retirar una copia que la persona ya descargó.

## Pendiente de medir

Este contrato describe lo que el código pide al proveedor. Falta la prueba en un entorno desplegado
con Supabase real: obtener una URL, revocar el acceso y comprobar por separado el portal, el endpoint,
la URL anterior y la caché del navegador. Corresponde al recorrido E2E en Preview.

## Cuándo cambiar esto

Si un tipo de archivo exige corte total e inmediato, la entrega debe pasar por el servidor
(streaming con autorización por petición) en lugar de una redirección a una URL firmada.

## Imágenes públicas: imagen del curso y logo (desde M2 · archivos)

El catálogo público necesita mostrar la imagen del curso y el logo sin sesión. El esquema no tiene
una visibilidad «pública» (`AssetVisibility` solo trae `COURSE`, `PRIVATE`, `INSTITUTION`) y no se
cambia, así que la decisión es:

- Se suben a una carpeta propia: `<institución>/public/course/<curso>/…` y `<institución>/public/logo/…`,
  con `kind = IMAGE` y `visibility = INSTITUTION`. Ninguna otra subida usa esa carpeta.
- `Course.imageUrl` e `Institution.logoUrl` guardan `/api/public-images/<assetId>`.
- `/api/public-images/[assetId]` (sin sesión) sirve el archivo **solo si** es una imagen confirmada
  JPG/PNG/WebP de esa carpeta **y** hoy es la imagen de un curso o el logo de su institución.
  Cualquier otro id (entregas, fotos de perfil, lecciones, avisos, imágenes ya reemplazadas) responde
  404, igual que un id inexistente. El servidor lee el archivo y lo entrega él mismo (no redirige a
  una URL firmada), con `Cache-Control: public, max-age=3600`.
- Acceso residual: al quitar o cambiar la imagen se borra el archivo; una copia en caché del
  navegador o de la CDN puede seguir viéndose hasta una hora.
- Quien sube la imagen ve el aviso «Cualquier persona podrá verla, también sin iniciar sesión».

## Archivos de entregas, foto de perfil (desde M2 · archivos)

- Subida directa firmada con `POST /api/uploads` → `PUT` al almacenamiento → `PATCH /api/uploads/[id]`.
  La confirmación compara tamaño y tipo declarados y además la **firma de bytes** del contenido
  (`src/lib/uploads.ts`); si no coincide, el archivo se borra.
- Entregas: hasta 5 archivos de 25 MB (PDF, imágenes, Office, ZIP) en `<institución>/submissions/…`,
  `visibility = PRIVATE`, ligados con `StorageAsset.submissionId`. Los descarga, por
  `/api/assets/[assetId]`, el estudiante dueño y quien gestiona el curso; otro estudiante, un docente
  de otro curso u otra institución reciben 403/404. Al reenviar, la versión anterior conserva sus
  archivos en `SubmissionRevision.assetIds`; un archivo dejado fuera de la versión nueva no se borra.
  `DELETE /api/assets/[id]` no borra archivos de estas carpetas: lo entregado se conserva.
- Foto de perfil: `<institución>/avatars/<persona>/…`, privada; `User.avatarUrl` guarda
  `/api/assets/<assetId>` y el menú la pide en `/api/avatar`. Por ahora solo la ve su dueño.
- No existe cuota de almacenamiento por institución; los límites son por archivo y por entrega.
