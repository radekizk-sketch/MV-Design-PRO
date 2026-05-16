#!/bin/bash
# run_all_guards.sh — Iter K20-5: run all guard scripts, count PASS/FAIL.
# Per ACCEPTANCE DoD: "67/67 guardów PASS".

cd "$(dirname "$0")/.."

PASS=0
FAIL=0
SKIP=0
declare -a FAILED_GUARDS

for guard in scripts/*guard*.py; do
  name=$(basename "$guard" .py)
  # Niektóre guardy wymagają argumentów lub interaktywności, pomiń te
  if [[ "$name" == "false_zero_guard" || "$name" == "vulture_guard" || \
        "$name" == "import_graph_guard" || "$name" == "language_guard" ]]; then
    SKIP=$((SKIP+1))
    continue
  fi
  result=$(timeout 60 python "$guard" 2>&1 | tail -3)
  exit_code=$?
  if [ $exit_code -eq 0 ]; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
    FAILED_GUARDS+=("$name")
  fi
done

echo "=================================================================="
echo "GUARD RESULTS"
echo "=================================================================="
echo "PASS: $PASS"
echo "FAIL: $FAIL"
echo "SKIP: $SKIP (manual-only guards)"
echo "TOTAL: $((PASS+FAIL+SKIP))"
if [ ${#FAILED_GUARDS[@]} -gt 0 ]; then
  echo ""
  echo "Failed guards:"
  for g in "${FAILED_GUARDS[@]}"; do
    echo "  - $g"
  done
fi
