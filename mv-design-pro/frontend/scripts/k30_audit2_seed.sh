#!/bin/bash
# K30 audit2 station configs — bulk-initialize 30 stacji + DER specs per PV/BESS/FW.
# Bumps OZE/NC RFG specialists by including NC RFG Module A compliance per DER.
#
# USAGE: PROJECT_ID=<uuid> CASE_ID=<uuid> bash scripts/k30_audit2_seed.sh
# Wymagane env: PROJECT_ID, CASE_ID (z output seed-gn30.mjs JSON line).

PROJECT_ID="${PROJECT_ID:?PROJECT_ID env required (z seed-gn30.mjs JSON)}"
CASE_ID="${CASE_ID:?CASE_ID env required (z seed-gn30.mjs JSON)}"
BACKEND="${BACKEND_URL:-http://127.0.0.1:8000}"

# Build {station_hash -> [der_id, der_id, ...]} mapping z ENM snapshot
python3 -c "
import json, urllib.request, sys

req = urllib.request.urlopen(f'$BACKEND/api/cases/$CASE_ID/enm')
data = json.load(req)
gens = data.get('generators', [])

station_ders = {}
for g in gens:
    ref = g.get('ref_id', '')
    parts = ref.split('/')
    if len(parts) >= 2:
        station_hash = parts[1]
        station_ders.setdefault(station_hash, []).append({
            'der_id': ref,
            'kind': 'PV' if g.get('gen_type') == 'pv_inverter' else (
                'BESS' if g.get('gen_type') == 'bess' else 'FW'
            ),
            'p_kw': float(g.get('p_mw', 0)) * 1000.0,
        })

print(json.dumps(station_ders), file=sys.stdout)
" > /tmp/k30_station_ders.json

PASS=0
FAIL=0

# Lista stacji inline z ENM snapshot
STATIONS=$(curl -s "$BACKEND/api/cases/$CASE_ID/enm" | python3 -c "
import json, sys
d = json.load(sys.stdin)
subs = [s for s in d.get('substations', []) if s.get('station_type') in ('inline', 'sectional')]
print(' '.join(s.get('ref_id', '').replace('/', '_') for s in subs))")

# Per K30 STATION_CONFIGS macierz — które stacje mają DER PV/BESS/FW:
# S02 PV, S04 PV, S05 BESS, S06 FW, S07 PV+BESS, S08 PV, S10 PV, S11 PV,
# S12 BESS, S13 2×FW, S14 PV+BESS+FW, S17 PV, S18 BESS, S19 PV, S20 FW,
# S21 PV, S22 PV, S23 BESS, S24 FW, S25 PV+BESS+FW, S27 PV, S29 PV, S30 PV+BESS
i=2
for STATION_ID in $STATIONS; do
  DER_SPECS='[]'
  # PV stations (cos_phi_static_unity NC RFG Module A)
  case $i in
    2|4|7|8|10|11|14|17|19|21|22|25|27|29|30)
      DER_SPECS='[{"der_id":"pv_inverter_'$i'","der_kind":"PV","nominal_power_kw":500.0,"pf_curve_ref":"cos_phi_static_unity","block_transformer_catalog_ref":null,"device_catalog_ref":"conv-pv-nn-0p5mw-0p4kv"}]'
      ;;
    # BESS stations
    5|12|18|23)
      DER_SPECS='[{"der_id":"bess_inverter_'$i'","der_kind":"BESS","nominal_power_kw":1000.0,"pf_curve_ref":"cos_phi_static_unity","block_transformer_catalog_ref":"tr-sn-nn-15-04-1000kva-dyn11","device_catalog_ref":"conv-bess-1mw-2mwh-15kv"}]'
      ;;
    # FW stations
    6|13|20|24)
      DER_SPECS='[{"der_id":"fw_inverter_'$i'","der_kind":"FW","nominal_power_kw":2000.0,"pf_curve_ref":"cos_phi_dynamic_default","block_transformer_catalog_ref":null,"device_catalog_ref":"conv-wind-2mw-15kv"}]'
      ;;
  esac

  STATUS=$(curl -s -X PUT \
    "$BACKEND/api/v1/projects/$PROJECT_ID/audit2-station-config/$STATION_ID" \
    -H "Content-Type: application/json" \
    -d "{\"mv_neutral_grounding_ref\":\"mv_isolated\",\"tap_changer_refs\":[],\"der_specs\":$DER_SPECS,\"transformer_tap_changers\":{},\"bay_hv_fuses\":{},\"bay_vts\":{},\"bay_device_withstand\":{}}" \
    -o /dev/null -w "%{http_code}")
  if [ "$STATUS" = "200" ]; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
  fi
  i=$((i+1))
done

echo "K30 audit2 station configs: $PASS PASS / $FAIL FAIL"

curl -s -X POST \
  "$BACKEND/api/v1/projects/$PROJECT_ID/audit2-station-config/_validate-all" \
  -H "Content-Type: application/json" -d '{}' \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'K30 validate-all: all_pass={d.get(\"all_pass\")}, stations={d.get(\"station_count\")}')
ps = d.get('per_station', [])
if ps:
    pass_count = sum(1 for s in ps if s.get('all_pass'))
    print(f'per_station: {pass_count}/{len(ps)} PASS')"
