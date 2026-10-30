#!/usr/bin/env bash
# MV-DESIGN-PRO: odczyt całej biblioteki katalogowej + testy źródeł ENEA.
# Uruchomienie: bash scripts/catalog_audit_ubuntu.sh [--strict]
# Środowisko: Python 3.11 i zależności backendu zainstalowane w bieżącym venv.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PYTHONPATH="$ROOT/backend/src:$ROOT/backend${PYTHONPATH:+:$PYTHONPATH}"

echo "[KATALOG] 27 rodzin: liczność i minimum danych"
python -m network_model.catalog.completeness_report --summary

echo "[KATALOG] testy danych NKT/ENEA, CT i kontroli jakości"
python -m pytest -q \
  backend/tests/network_model/catalog/test_cable_line_catalog_width.py \
  backend/tests/network_model/catalog/test_cable_manufacturer_catalogs_2026.py \
  backend/tests/network_model/catalog/test_ct_vt_enea_manufacturer_2026.py \
  backend/tests/network_model/catalog/test_ct_vt_manufacturers_poland_2026.py \
  backend/tests/network_model/test_lv_catalog_p02.py \
  backend/tests/network_model/catalog/test_catalog_global_completeness_report.py \
  backend/tests/network_model/catalog/test_protection_ct_vt_v1_completeness.py \
  backend/tests/network_model/catalog/test_katalog_proweniencja_kompletnosc.py

if [[ "${1:-}" == "--strict" ]]; then
  echo "[KATALOG] twarda bramka minimum — z brakami wyjście 1"
  python -m network_model.catalog.completeness_report --strict
else
  echo "[KATALOG] pełny raport diagnostyczny: brak minimum vs opcjonalne"
  python -m network_model.catalog.completeness_report
fi
