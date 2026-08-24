#!/usr/bin/env bash
# Shim: delegate to upstream install.sh with --harness omp support for OMP.
set -euo pipefail
DIR="$(dirname "$0")"
UPSTREAM="$DIR/../../_ov/examples/memory-plugin-shared/install.sh"
if [ -f "$UPSTREAM" ]; then
  # translate --harness omp -> --harness pi (same extension path, OMP compatible)
  ARGS=()
  for a in "$@"; do
    if [ "$a" = "--harness" ]; then ARGS+=("$a"); shift; continue; fi
    ARGS+=("$a")
  done
  # naive replace omp->pi in harness list
  MAPPED=()
  for a in "$@"; do
    case "$a" in
      *omp*) MAPPED+=("${a//omp/pi}") ;;
      *) MAPPED+=("$a") ;;
    esac
  done
  exec bash "$UPSTREAM" "${MAPPED[@]}"
else
  echo "Upstream install.sh not found at $UPSTREAM — install marketplace plugin directly:"
  echo "  omp plugin marketplace add ./ --scope project && omp plugin install omp-openviking-memory --scope project"
fi
