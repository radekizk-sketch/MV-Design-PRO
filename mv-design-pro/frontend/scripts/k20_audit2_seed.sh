#!/bin/bash
# K20 audit2 station configs bulk seeder
# Saves minimal audit2 config per stacja → enables validate-all per project.

PROJECT_ID="2f79f8a3-a303-4a39-8664-9a1aaab79226"
CASE_ID="651654aa-52b1-43ba-880d-254c25e5dc20"
BACKEND="${BACKEND_URL:-http://127.0.0.1:8000}"

# List 20 station ref_ids z K20 ENM
STATIONS=$(curl -s "$BACKEND/api/cases/$CASE_ID/enm" | python3 -c "
import json, sys
d = json.load(sys.stdin)
subs = [s for s in d.get('substations', []) if s.get('station_type') == 'inline']
print(' '.join(s.get('ref_id', '').replace('/', '_') for s in subs))")

PASS=0
FAIL=0
for STATION_ID in $STATIONS; do
  STATUS=$(curl -s -X PUT \
    "$BACKEND/api/v1/projects/$PROJECT_ID/audit2-station-config/$STATION_ID" \
    -H "Content-Type: application/json" \
    -d '{"mv_neutral_grounding_ref":"mv_isolated","tap_changer_refs":[],"der_specs":[],"transformer_tap_changers":{},"bay_hv_fuses":{},"bay_vts":{},"bay_device_withstand":{}}' \
    -o /dev/null -w "%{http_code}")
  if [ "$STATUS" = "200" ]; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
  fi
done
echo "audit2 station configs: $PASS PASS / $FAIL FAIL"
echo "Validate-all..."
curl -s -X POST \
  "$BACKEND/api/v1/projects/$PROJECT_ID/audit2-station-config/_validate-all" \
  -H "Content-Type: application/json" -d '{}' \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'all_pass: {d.get(\"all_pass\")}')
print(f'station_count: {d.get(\"station_count\")}')
ps = d.get('per_station', [])
if ps:
    pass_count = sum(1 for s in ps if s.get('all_pass'))
    print(f'per_station pass: {pass_count}/{len(ps)}')"
