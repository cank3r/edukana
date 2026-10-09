#!/usr/bin/env bash
# Publica los registros de un job de CI en la rama `ci-registros` (solo esa rama).
# Uso: publicar-registros.sh <job> <carpeta-con-registros>
# Deja <sha>/<job>/*.log y <sha>/RESUMEN.md; conserva las 30 corridas más recientes.
# Cada publicación es un único commit huérfano empujado con --force-with-lease, y se reintenta
# si el otro job publicó a la vez (validate y browser-smoke corren en paralelo).
set -u
JOB="$1"; SRC="$(cd "$2" && pwd)"; MAX=30
SHA="${GITHUB_SHA}"
REMOTE="https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
WORK="$(mktemp -d)"

for intento in 1 2 3 4 5 6 7 8; do
  rm -rf "$WORK/repo" && mkdir -p "$WORK/repo" && cd "$WORK/repo" || exit 1
  git init -q -b ci-registros
  git remote add origin "$REMOTE"
  BASE=""
  if git fetch -q --depth 1 origin ci-registros 2>/dev/null; then
    BASE="$(git rev-parse FETCH_HEAD)"
    git checkout -q FETCH_HEAD -- . 2>/dev/null || true
  fi

  rm -rf "${SHA:?}/$JOB" && mkdir -p "$SHA/$JOB" && cp -r "$SRC/." "$SHA/$JOB/"

  # Resumen de la corrida: cabecera + el resumen de cada job publicado para este commit.
  {
    echo "# Registros de CI"
    echo
    echo "Rama: \`${GITHUB_REF_NAME}\`  "
    echo "Commit: \`${SHA}\`  "
    echo "Actualizado: $(date -u +'%Y-%m-%d %H:%M UTC')"
    for resumen in "$SHA"/*/RESUMEN.md; do [ -f "$resumen" ] && { echo; cat "$resumen"; }; done
  } > "$SHA/RESUMEN.md"

  # Orden de llegada: el commit actual al final; se borran las carpetas que salen de las 30 últimas.
  touch ORDEN
  grep -vx "$SHA" ORDEN > ORDEN.tmp || true
  echo "$SHA" >> ORDEN.tmp
  tail -n "$MAX" ORDEN.tmp > ORDEN && rm -f ORDEN.tmp
  for dir in */; do
    dir="${dir%/}"
    grep -qx "$dir" ORDEN || rm -rf "$dir"
  done

  cat > README.md <<'EOF'
# Registros de CI de Edukana

Una carpeta por commit (`<sha>/`), con `RESUMEN.md` (qué paso falló) y la salida completa de cada paso
en `<sha>/validate/*.log` y `<sha>/browser-smoke/*.log`. Se conservan las 30 corridas más recientes
(el orden está en `ORDEN`, la más nueva al final).

Leer desde una copia del repo:

    git fetch origin ci-registros
    git show FETCH_HEAD:<sha>/RESUMEN.md
    git archive FETCH_HEAD <sha> | tar -x -C /tmp/registros
EOF

  git checkout -q --orphan publicar
  git add -A
  git -c user.name="edukana-ci" -c user.email="ci@users.noreply.github.com" \
    commit -q -m "registros de ${GITHUB_REF_NAME} @ ${SHA::7} (${JOB})"
  if git push -q --force-with-lease="ci-registros:${BASE}" origin HEAD:ci-registros; then
    echo "Registros publicados en la rama ci-registros: ${SHA}/${JOB}"
    exit 0
  fi
  echo "Otro job publicó a la vez; reintento ${intento}…"
  sleep $(( (RANDOM % 5) + 2 ))
done
echo "No se pudieron publicar los registros"
exit 1
