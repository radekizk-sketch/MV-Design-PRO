#!/bin/bash
# K20 OZE setpoints bulk update
REFS=$(curl -s "http://127.0.0.1:8000/api/cases/651654aa-52b1-43ba-880d-254c25e5dc20/enm" | python3 -c "
import json, sys
d = json.load(sys.stdin)
gens = d.get('generators', [])
refs = [g.get('ref_id') for g in gens if not g.get('name', '').startswith('PV S')]
print(' '.join(refs))")

i=3
PASS=0
FAIL=0
for REF in $REFS; do
  STATION_ID=$(printf "S%02d" $i)
  STATUS=$(curl -s -X POST "http://127.0.0.1:8000/api/cases/651654aa-52b1-43ba-880d-254c25e5dc20/enm/domain-ops" \
    -H "Content-Type: application/json" \
    -d "{\"project_id\":\"2f79f8a3-a303-4a39-8664-9a1aaab79226\",\"operation\":{\"name\":\"update_element_parameters\",\"idempotency_key\":\"k20_pv_setpoints_${STATION_ID}\",\"payload\":{\"element_ref\":\"$REF\",\"parameters\":{\"name\":\"PV $STATION_ID NC-RFG-A\",\"p_mw\":0.4,\"q_mvar\":0.0,\"limits\":{\"p_max_mw\":0.5,\"q_min_mvar\":-0.18,\"q_max_mvar\":0.18,\"cos_phi_min\":0.9,\"cos_phi_max\":1.0}}}}}" \
    -o /dev/null -w "%{http_code}")
  if [ "$STATUS" = "200" ]; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
  fi
  i=$((i+1))
done
echo "Setpoints update: $PASS PASS / $FAIL FAIL"
