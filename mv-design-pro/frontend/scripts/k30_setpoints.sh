#!/bin/bash
# K30 OZE setpoints bulk update — NC RFG Module A baseline per PV/BESS/FW.
#
# USAGE: PROJECT_ID=<uuid> CASE_ID=<uuid> bash scripts/k30_setpoints.sh

PROJECT_ID="${PROJECT_ID:?PROJECT_ID env required}"
CASE_ID="${CASE_ID:?CASE_ID env required}"
BACKEND="${BACKEND_URL:-http://127.0.0.1:8000}"

# Lista refów generatorów (pomijamy te, które mają już ustawione NC RFG name)
REFS=$(curl -s "$BACKEND/api/cases/$CASE_ID/enm" | python3 -c "
import json, sys
d = json.load(sys.stdin)
gens = d.get('generators', [])
# Wszystkie generatory bez prefiksu NC-RFG w name
refs = [g.get('ref_id') for g in gens if 'NC-RFG' not in g.get('name', '')]
print(' '.join(refs))")

i=2
PASS=0
FAIL=0
for REF in $REFS; do
  STATION_ID=$(printf "S%02d" $i)
  STATUS=$(curl -s -X POST "$BACKEND/api/cases/$CASE_ID/enm/domain-ops" \
    -H "Content-Type: application/json" \
    -d "{\"project_id\":\"$PROJECT_ID\",\"operation\":{\"name\":\"update_element_parameters\",\"idempotency_key\":\"k30_setpoint_${STATION_ID}\",\"payload\":{\"element_ref\":\"$REF\",\"parameters\":{\"name\":\"DER $STATION_ID NC-RFG-A\",\"p_mw\":0.4,\"q_mvar\":0.0,\"limits\":{\"p_max_mw\":0.5,\"q_min_mvar\":-0.18,\"q_max_mvar\":0.18,\"cos_phi_min\":0.9,\"cos_phi_max\":1.0}}}}}" \
    -o /dev/null -w "%{http_code}")
  if [ "$STATUS" = "200" ]; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
  fi
  i=$((i+1))
done
echo "K30 setpoints update: $PASS PASS / $FAIL FAIL"
