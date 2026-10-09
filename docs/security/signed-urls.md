# URLs firmadas y revocación de acceso

**Estado:** contrato vigente desde S1. Código: `src/server/signed-urls.ts` y `src/app/api/assets/[assetId]/route.ts`.

## Qué garantiza Edukana

1. Ningún archivo tiene URL pública permanente. Toda lectura pasa por `/api/assets/[assetId]`, que
   comprueba sesión vigente, institución y permiso sobre ese archivo antes de emitir una URL firmada.
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
