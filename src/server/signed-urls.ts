/**
 * Duración de una URL firmada de lectura, según el tipo de archivo.
 *
 * Contrato de revocación: quitar un acceso (revocar un tutor, suspender una cuenta, retirar
 * una matrícula) impide de inmediato obtener URL nuevas, porque cada una se emite después de
 * autorizar. Una URL ya emitida sigue siendo válida hasta que vence; esta función fija ese
 * máximo. El video necesita más tiempo porque el reproductor pide el archivo por partes;
 * dejará de servirse así cuando S5 lo mueva a un proveedor de streaming.
 */
export function signedUrlSeconds(kind: "DOCUMENT" | "VIDEO" | "IMAGE" | "OTHER") {
  return kind === "VIDEO" ? 300 : 60;
}
