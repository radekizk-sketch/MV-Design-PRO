#!/usr/bin/env bash
# Lokalna analiza AST: bez API modeli, chmury Graphify i zmian runtime MV-DESIGN-PRO.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if ! command -v graphify >/dev/null 2>&1; then
  echo "Brak Graphify CLI. Zainstaluj: uv tool install 'graphifyy==0.9.104'" >&2
  exit 127
fi

# Wyłączenie automatycznego wyboru modelu z kluczy środowiskowych.
export GRAPHIFY_BACKEND=none
export GRAPHIFY_QUERY_LOG_DISABLE=1

# Wersja bez rozszerzenia semantycznego: tylko kod lokalny (AST).
graphify extract mv-design-pro --code-only --backend none

GRAPH_FILE="graphify-out/graph.json"
if [[ ! -s "$GRAPH_FILE" && -s "mv-design-pro/graphify-out/graph.json" ]]; then
  GRAPH_FILE="mv-design-pro/graphify-out/graph.json"
fi
if [[ ! -s "$GRAPH_FILE" ]]; then
  echo "Nie powstał graph.json. Sprawdź komunikaty Graphify." >&2
  exit 1
fi
python3 mv-design-pro/scripts/graphify_smoke.py "$GRAPH_FILE"
echo "Graf dostępny w: $GRAPH_FILE"
