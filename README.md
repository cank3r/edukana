# Registros de CI de Edukana

Una carpeta por commit (`<sha>/`), con `RESUMEN.md` (qué paso falló) y la salida completa de cada paso
en `<sha>/validate/*.log` y `<sha>/browser-smoke/*.log`. Se conservan las 30 corridas más recientes
(el orden está en `ORDEN`, la más nueva al final).

Leer desde una copia del repo:

    git fetch origin ci-registros
    git show FETCH_HEAD:<sha>/RESUMEN.md
    git archive FETCH_HEAD <sha> | tar -x -C /tmp/registros
