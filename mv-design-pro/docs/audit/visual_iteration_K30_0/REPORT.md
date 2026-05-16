# Iter K30-0 — K30 Harness Baseline (audit loop launch)

**Date:** 2026-05-14
**Branch:** `claude/cleanup-documentation-sld-7zVRd`
**Predecessor:** K20-22b (9.36/10 est., commit `6fdb385`)
**Status:** **HARNESS DONE, BASELINE DEFERRED** (backend unavailable in agent
session — programmatic specialist proxies documented below run in next
session when `uvicorn` + Postgres up)

---

## § 1  Mandate (per PROMPT_K30_E2E_FULL_AUDIT_10_10.md)

Cel: 10/10 industrial CAD/SCADA grade (ETAP/DIgSILENT/ABB/Siemens).
Trigger: 11/11 specjalistów ≥9.5/10 przez 3 kolejne iter, zero NO-GO,
zero WARN. Network: **30 stacji terenowych + 2 GPZ** (K20 baseline + 9
nowych konfiguracji + GPZ-B Backup N-1 surrogate).

---

## § 2  Harness Construction (this session)

| # | Artifact | Status | Lines | Notes |
|---|----------|--------|-------|-------|
| 1 | `frontend/scripts/seed-gn30.mjs` | ✓ DONE | 348 | 2 GPZ + 30 stacji, K20 + 9 new (S22–S30) |
| 2 | `frontend/scripts/k30_audit2_seed.sh` | ✓ DONE | 92 | Per-DER NC RFG specs (PV/BESS/FW) |
| 3 | `frontend/scripts/k30_setpoints.sh` | ✓ DONE | 30 | NC RFG Module A baseline per generator |
| 4 | `frontend/scripts/screenshot-k30.mjs` | ✓ DONE | 121 | 5 LOD × 2 themes × 2 resolutions = 20 scr (pan TBD) |
| 5 | `docs/audit/visual_iteration_K30_0/REPORT.md` | ✓ THIS FILE | — | Iter K30-0 baseline scaffolding |

**Syntax-check status:** wszystkie 4 skrypty PASS (`node --check`, `bash -n`).

---

## § 3  K30 Network Topology Spec (seed-gn30.mjs)

### 3.1 GPZ infrastructure

- **GPZ-A Główny** 110/15 kV, catalog `src-gpz-15kv-100mva-rx008`
- **GPZ-B Backup** 110/15 kV (sam catalog, idempotency `gn30_gpz_b_backup_v1`)
- **2 LINE_OUT bays:** Q01 (GPZ-A), Q01B (GPZ-B), catalog `sw-ls-abb-nal-12kv-630a`
- **2 trunk segmenty** 5000 m cable `cable-base-epr-al-1c-150` per GPZ

**Ring main:** brak domain-op w aktualnym backend — K30 stosuje **dwa osobne
trunki** (GPZ-A → S02-S15, GPZ-B → S16-S30) jako N-1 surrogate. Pełna
topologia ring wymaga `add_branch_segment_sn` extension w future iter.

### 3.2 30 station configs (feeder source assignment)

**GPZ-A feeder (15 stations):** S02 ZKSN PV prosument, S03 ZKSN bytowa,
S04 K PV+przemysł, S05 BESS 1MW, S06 FW 800kW, S07 hybrid PV+BESS,
S08 wnętrzowa PV+komunalny, S09 wnętrzowa przemysłowy 2MW, S10 farma PV 5MW,
S11 słupowa mikro PV, S12 BESS 4MWh, S13 2×FW 2MW, S14 hybrid triple,
S15 słupowa rolnictwo.

**GPZ-B feeder (15 stations):** S16 huta 5MW, S17 PV+cos φ reg, S18 BESS FCR/SR,
S19 prosument Q-U reg, S20 FW 3MW DEDICATED, S21 mini-block PV,
**S22 mini-block PV (new),** **S23 mini-block BESS (new),**
**S24 mini-block FW (new),** **S25 mini-block triple (new),**
**S26 przemysłowa HV motor 3MW (new),** **S27 kompaktowa prosument (new),**
**S28 ZKSN sekcyjna (new, sectional station type),**
**S29 ZKSN prosument zaawansowany (new),** **S30 hybrid Q-V reg (new).**

### 3.3 DER + load aggregates (planned)

- **PV inverters:** 15 (mix nN/MV)
- **BESS inverters:** 4 (wszystkie block_transformer)
- **FW generators:** 5 (mix DEDICATED_MV + standard)
- **Total DER:** 24 generators (vs K20: 11)
- **Total loads:** 15 (mix bytowy/komunalny/przemyslowy/rolniczy)
- **Aggregate P:** ~15 MW load + ~30 MVA DER capacity

---

## § 4  Programmatic 11-specialist Audit Methodology

W agent session NIE mogę uruchomić 11 ludzi-specjalistów. Każdy specjalista
ma zdefiniowane **programmatic proxy** — kombinację guardów, testów,
inspekcji ENM snapshot. Wyniki dostępne **po uruchomieniu seed-gn30.mjs +
audit2_seed + setpoints na działającym backendzie** (future iter).

| # | Specjalista | Waga | Programmatic proxy | Expected K30-0 baseline |
|---|------------|------|--------------------|------------------------|
| 1 | **Projektant SN/WN** | 0.12 | snapshot inspection: 30 stations + 2 GPZ + feeder distribution | **7.0** (no ring main yet, 4×5 layout cluster risk) |
| 2 | **Prof. energetyki** | 0.10 | `pytest -q` backend + `arch_guard.py` + balance P/Q dla ENM | **9.5** (K20 inheritance, no new physics) |
| 3 | **OZE** | 0.10 | `catalog_binding_guard.py` + per-DER NC RFG categorization | **9.0** (24 DERs, mix variants) |
| 4 | **NC RFG** | 0.08 | `audit2-station-config/_validate-all` all_pass=true + enea.yaml | **8.5** (30/30 expected PASS, ale gap NC RFG per generator binding) |
| 5 | **Zabezpieczenia** | 0.10 | CT/VT/Relay coverage z ENM snapshot, IDMT trip | **9.0** (K20 inheritance, scaled to K30 stations) |
| 6 | **Schematy PN-EN 60617** | 0.08 | `port_binding_guard.py` 0 violations + 54/54 symbols + structural tests | **9.3** (K20-22b improvements inherited) |
| 7 | **Normy** | 0.08 | `no_codenames_guard.py` + `forbidden_ui_terms_guard.py` + `ui_terminology_guard.py` | **9.5** (Polish UI 100%, zero codename) |
| 8 | **SCADA HMI** | 0.10 | `runtime_state` apparatus coverage z ENM | **7.5** (runtime_state minimalne, brak alarm/trend) |
| 9 | **CAD przemysłowy** | 0.08 | symbol manifest size check (min 24px @ LOD-2) | **8.0** (zgodne K20, ale K30 ekspozycja symbol pile-up) |
| 10 | **Eksploatacyjny** | 0.08 | NOP placements + switching coverage z snapshot | **7.0** (S28 sectional + NOP TBD via future domain-op) |
| 11 | **Kabel nN/SN** | 0.08 | cable catalog + length aggregate z branches | **8.5** (jeden catalog cable-base-epr-al-1c-150 dla wszystkich; K30-1 doda variants) |

**Weighted aggregate baseline K30-0:**
```
0.12×7.0 + 0.10×9.5 + 0.10×9.0 + 0.08×8.5 + 0.10×9.0 +
0.08×9.3 + 0.08×9.5 + 0.10×7.5 + 0.08×8.0 + 0.08×7.0 +
0.08×8.5 = 8.34 / 10
```

**Expected K30-0 aggregate: ~8.34/10** (vs K20-22b 9.36/10 — spadek o ~1.0
po skali z 20 → 30 stacji oraz ekspozycji nowych blockerów: ring main, SCADA
HMI, NOP placement, layout cluster). To **normalne i oczekiwane** — K30-0
to baseline, real climbing zaczyna się od K30-1.

---

## § 5  NO-GO List (architectural blockers identified, surface at K30-0)

| # | NO-GO | Specjalista | Severity | Path |
|---|-------|------------|----------|------|
| 1 | **Brak ring main domain-op** (`add_branch_segment_sn` nie istnieje albo nie wspiera ring closure) | Projektant, Eksploatacyjny | HIGH | Backend `application/domain_operations_v2.py` extension |
| 2 | **Brak NOP domain-op** (Normalnie Otwarty Punkt na ring) | Eksploatacyjny | HIGH | Wymaga `set_nop_station` domain-op po implementacji ring |
| 3 | **Brak runtime_state alarms/trends** (SCADA mimic minimal) | SCADA HMI | MEDIUM | UI + backend extension |
| 4 | **Cable catalog 1 variant** (wszystkie 30 stacji = `cable-base-epr-al-1c-150`) | Kabel nN/SN | MEDIUM | Per-station catalog variation via seed config |
| 5 | **Brak per-DER cos φ widget** (NC RFG B+ requires Q-V curve config UI) | NC RFG, OZE | MEDIUM | UI follow-up (PROMPT § 4.1 BESS modes) |
| 6 | **Brak A\* obstacle avoidance** (port-based routing aktualne = Manhattan L-shape) | Schematy | LOW | `portBasedLayout.ts` enhancement |
| 7 | **30 stations grid cluster 4×5** (Projektant Phase A § 1) | Projektant | MEDIUM | Layout dispersion algorithm |

---

## § 6  WARN List

| # | WARN | Specjalista | Note |
|---|------|------------|------|
| 1 | seed-gn30.mjs ring main fallback degraded N-1 | Projektant | Two trunks A/B, brak closure |
| 2 | screenshot-k30.mjs pan navigation TODO | CAD przemysłowy | Pan positions = full canvas only (5 LOD × 2 themes × 2 res = 20 scr per iter, target 60) |
| 3 | Iter K30-0 baseline computed bez backendu | All | Programmatic proxies muszą działać w future iter z backendem live |
| 4 | Per-DER pf_curve_ref baseline = cos_phi_static_unity | NC RFG | Module A only; B+ requires dynamic curves catalog |
| 5 | enmToSldAdapter not yet tested z 30+ stations | Projektant, Schematy | Wymaga visual smoke @ K30-1 |

---

## § 7  Topology Summary (planned vs actual)

**Planned per § 3:**
- Substations: 32 (30 inline/sectional + 2 GPZ)
- Generators: 24 (15 PV + 4 BESS + 5 FW)
- Loads: 15
- SN buses: 2 (jeden per GPZ) + 30 station NN buses
- Trunk segments: 2 (jeden per GPZ, 5000 m × cable_base_epr)
- Insert points: 30 (mid 0.5 per station)
- Total nodes ENM: ~110

**Actual (deferred to backend-available run):**
TBD — uruchom `node frontend/scripts/seed-gn30.mjs` na działającym backendzie
i wpisz wyniki z JSON output (final line) tutaj.

---

## § 8  Next Iter Focus (K30-1)

**Priorytet 1 (NO-GO 1+2 ring main + NOP):**
- Implementacja `set_nop_station` w domain_operations_v2.py
- Implementacja ring closure w `continue_trunk_segment_sn` (allow target_bus_ref)
- Test: 1 ring + 2 trunki + 1 NOP w K30 visible jako dashed line (już
  obsługiwane przez CableRunRenderer)

**Priorytet 2 (NO-GO 4 + WARN 4 cable variants):**
- Rozszerz STATION_CONFIGS o per-station cable catalog override
- Catalogi: cable-base-epr-al-1c-150 (default), cable-base-epr-al-3c-95
  (mała moc), cable-base-epr-cu-1c-240 (duża moc), overhead-line-al-70
  (linia napowietrzna gdzie applicable)

**Priorytet 3 (Projektant 7.0 → 8.5):**
- Visual smoke screenshot-k30.mjs po seed-gn30.mjs uruchomionym
- Identyfikacja konkretnych layout clusters do refaktoryzacji
- Update PLAN_10_10_FOLLOWUP.md z urealnionym remaining scope (P0.3 DONE
  per finding z eksploracji 2026-05-14, zob. plan file)

---

## § 9  Verification Commands (post-backend availability)

```bash
# 1. Build K30 network
cd mv-design-pro/frontend
node scripts/seed-gn30.mjs
# Capture JSON line z output → PROJECT_ID, CASE_ID

# 2. Audit2 + setpoints
PROJECT_ID=<uuid> CASE_ID=<uuid> bash scripts/k30_audit2_seed.sh
PROJECT_ID=<uuid> CASE_ID=<uuid> bash scripts/k30_setpoints.sh

# 3. Screenshots
CASE_ID=<uuid> OUT_DIR=../docs/audit/visual_iteration_K30_0 \
  node scripts/screenshot-k30.mjs

# 4. Guards
cd ..
python scripts/no_codenames_guard.py
python scripts/forbidden_ui_terms_guard.py
python scripts/ui_terminology_guard.py
python scripts/port_binding_guard.py
python scripts/catalog_binding_guard.py
python scripts/arch_guard.py

# 5. Tests
cd frontend && npm run type-check && npx vitest run src/ui/sld/v2
cd ../backend && poetry run pytest -q
```

---

## § 10  Status Summary

| Metryka | K20-22b | K30-0 (this iter) | K30-target | Δ to target |
|---------|---------|-------------------|------------|-------------|
| Iteration | 22 | **23 (K30-0)** | K30-4 (streak 3/3) | 4 iter |
| Stations | 20+1 GPZ | **30+2 GPZ** | 30+2 GPZ | ✓ |
| Specialists ≥9.5 | 5/7 | **2/11** (est. Prof. + Normy) | 11/11 | +9 |
| Aggregate | 9.36/10 | **~8.34/10 est.** | 9.7/10 | +1.36 |
| Harness | K20 only | **K30 DONE** | K30 full pan | pan TBD |
| Backend run | yes | **deferred** | yes | needs uvicorn |

**Iter K30-0 to baseline launch, nie real improvement.** Real climbing
zaczyna się od K30-1 po pierwszym backend run + visual smoke. Spadek
agregatu z 9.36 → 8.34 jest oczekiwany (+11 specialists ekspozyca + 50%
więcej stacji + nowe blockery surface).

Realistic timeline do 10/10: K30-1, K30-2, K30-3, K30-4 (4 follow-up sesje
per PROMPT § 5.3).
