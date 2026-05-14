# NC RFG VALIDATION — K20 (iter K20-16)

**Operator:** ENEA Operator (`enea.yaml` SOURCE OF TRUTH per V12K canon)
**Profile version:** rev 2024-Q4
**Voltage level:** SN/nN (dystrybucyjny — zachodnia Polska)

---

## § 1  NC RFG MODULE CLASSIFICATION (ENEA)

Per `enea.yaml` § module_types:

| Module | P_n range | Voltage max | Opis |
|--------|-----------|-------------|------|
| **A** | 0.8 kW – 1000 kW | ≤110 kV | Mikroinstalacje |
| **B** | 1000 kW – 50000 kW | ≤110 kV | Małe / średnie |
| **C** | 50000 kW – 75000 kW | ≤110 kV | Duże |
| **D** | ≥75000 kW | — | Bardzo duże (typowo 110+ kV) |

---

## § 2  K20 GENERATOR CLASSIFICATION

K20 zawiera 9 PV generators (8 attached + 1 planned via STATION_CONFIGS):

| Stacja | Generator | P_n [kW] | **NC RFG Module** | Wymagania compliance |
|--------|-----------|---------|------------------|---------------------|
| S02 | PV prosument | 50 | **A** Mikro | cos φ static, U-protection |
| S04 | PV przemysł | 500 | **A** Mikro | + Q-static range |
| S07 | PV hybrid+BESS | 2000 | **B** Małe | + FRT + Q(U) regulation |
| S10 | PV farma 5MW | 5000 | **B** Małe | + FRT + Q(U) + telemetria SCADA |
| S11 | PV mikro | 30 | **A** Mikro | cos φ static |
| S14 | PV triple-hybrid | 1000 | **A** Mikro (na granicy) | + Q dynamic |
| S17 | PV cos phi reg | 800 | **A** Mikro | + cos φ(P) dynamic |
| S19 | PV Q-U reg | 100 | **A** Mikro | + Q(U) regulation |
| S21 | PV mini-block | 300 | **A** Mikro | cos φ static |

**Klasyfikacja K20:**
- **7/9 generators NC RFG module A** (mikroinstalacje, prosumeci)
- **2/9 generators NC RFG module B** (małe instalacje: S07 2 MW + S10 5 MW)
- 0/9 modules C lub D (brak generators ≥50 MW)

---

## § 3  COMPLIANCE TESTS (per ENEA module)

Module A wymagania (per `enea.yaml § compliance_tests`):
- cos φ static range (typically 0.95 ind / 0.95 cap)
- Voltage protection (U< U>>)
- Frequency protection (f<, f>)
- Anti-islanding (loss of mains)

Module B dodatkowo:
- Fault Ride Through (FRT) per IEC 61400-21
- Q(U) regulation curve
- Active power control
- Telemetria SCADA (P, Q, U)

K20 generators powinny być testowane per moduł:
- **7 stations module A:** lokalna walidacja UI cos φ ranges
- **2 stations module B:** dodatkowo FRT + Q(U) per Q-U regulation tests

---

## § 4  AUDIT2 PROOF PACK INFRASTRUCTURE

Backend implementuje 5 typów audit2 validations:
1. `generate_bess_modes_proof` — tryby BESS per NC RFG module
2. `generate_tap_changer_plan_proof` — plan przelawienia transformatorów
3. `generate_hosting_capacity_export_proof` — hosting capacity
4. `generate_device_withstand_proof` — wytrzymałość urządzeń
5. `generate_vt_grounding_validation_proof` — uziemienie VT

API endpoint: `POST /api/v1/projects/{id}/audit2/generate-proof-pack`

Tests: **53/53 PASS** (test_audit2_validation_pack + test_audit2_*).

---

## § 5  V12K SUMMARY POST K20-16

| Kod | Status | Resolution |
|-----|--------|-----------|
| V12K-021 | ✓ RESOLVED | False-positive (catalog endpoint path) |
| V12K-022 | ✓ RESOLVED | block_transformer auto-resolve |
| V12K-023 | ✓ RESOLVED | LV_BEHIND/SOURCE_CONNECTION alias |
| V12K-024 | ✓ RESOLVED | DEDICATED_MV alias |
| V12K-025 | partial | PROTECTION redirect |

**V12K resolution rate: 4/5 (80%) RESOLVED, 1/5 partial.**

---

## § 6  K20 VALIDATION SUMMARY

| Validation | Status | Evidence |
|-----------|--------|----------|
| **NC RFG operators** | ✓ 5 profiles loaded | ENEA, PSE, PGE, Energa, Tauron |
| **NC RFG modules A/B/C/D** | ✓ defined w each profile | Per enea.yaml § module_types |
| **K20 generator classification** | ✓ all 9 categorized | 7×A + 2×B |
| **audit2 proof pack tests** | ✓ 53/53 PASS | tests/proof_engine + tests/solver_input |
| **Operator_profile_id** | ✓ K20 case = enea | study_case.config |
| **enea.yaml SOURCE OF TRUTH** | ✓ respected | brak fabrykacji narracji per V12K |
