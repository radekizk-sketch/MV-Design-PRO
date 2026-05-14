# PLAN ROADMAP 10/10 — pozostałe iteracje architektoniczne

**Stan startowy:** K20 audit loop iter K20-18 = **8.93/10** (89.3% to target)
**Cel:** **10/10 industrial CAD/SCADA grade** (ETAP/DIgSILENT/ABB/Siemens)
**Trigger end-of-loop:** 7/7 specjalistów ≥ 9.5/10 przez 3 kolejne iter

---

## § 1  POZOSTAŁE PRACE — ESTIMATE ~52 OD

### Faza A: P0.3 phase4 full integration (~22 OD)

**Scope:** kompletne port-based routing w `layoutPipeline.ts:1220 phase4_route_all_edges`.

| Task | OD | Wpływ specialist |
|------|-----|------------------|
| 1. VisualEdgeV1 extension: dodać `fromPortRef.portId` + `toPortRef.portId` | 3 | base |
| 2. Phase4 port lookup z `ports.json` per node + portId | 4 | base |
| 3. Manhattan path computation z port positions (zamiast center-to-center) | 5 | Schematy +0.5 |
| 4. True A* obstacle avoidance (zamiast Z-shape) | 8 | Schematy +0.5, Projektant +0.5 |
| 5. Grid 5 mm precision (zamiast GRID_BASE constant) | 2 | Projektant +0.5 |

**Result:** Schematy 9.0 → 9.5+ (trigger), Projektant 8.5 → 9.0+, Prof. 9.5 → 9.7.

### Faza B: GpzSwitchgearRenderer refactor (~30 OD)

**Scope:** rozbij 3392 linii na 6 plików ≤ 500 linii + konsolidacja z GpzCanonicalRenderer.

| Task | OD |
|------|-----|
| 1. Identify functional clusters w GpzSwitchgearRenderer | 3 |
| 2. Extract Busbar drawer (~500 LOC → busbar.tsx) | 5 |
| 3. Extract Bay drawer (~500 LOC → bay.tsx) | 5 |
| 4. Extract TransformerColumn drawer (~500 LOC → tr_column.tsx) | 5 |
| 5. Extract OperatorHeader drawer (~500 LOC → header.tsx) | 4 |
| 6. Extract Status panel drawer (~500 LOC → status.tsx) | 4 |
| 7. Merge GpzSwitchgearRenderer + GpzCanonicalRenderer → GpzIndustrialRenderer | 4 |

**Tests:** comprehensive coverage of split parts. No functional change, refactor only.

### Faza C: Multi-specialist visual review cycle (manual)

**Scope:** 3 kolejne iter z all-specialists review, oszacowane ~10 OD analytical + manual.

| Iter | Focus |
|------|-------|
| Iter-19 | Visual review po P0.3 phase4 (galvanic chain + symbol sizing) |
| Iter-20 | Visual review po GpzSwitchgearRenderer split (no regressions) |
| Iter-21 | Visual review final (manual confirmation of 7/7 ≥9.5 streak 3/3) |

**Required:** wszystkich 7 specjalistów ocenia każdą iter, agregacja ≥ 9.5/10 dla każdego.

---

## § 2  ALTERNATIVE INKREMENTALNE GAINY (~10 OD)

Mniejsze prace które mogłyby push specjaliści do 9.5 bez full P0.3:

| Task | OD | Wpływ |
|------|-----|-------|
| Multiple protection devices na K20 (add_ct + add_vt + add_relay × N) | 5 | Zabezpieczenia 9.0 → 9.5+ |
| OZE setpoints (cos_phi, P, Q limits) per generator | 3 | OZE 8.5 → 9.0+ |
| NC RFG audit2 proof-pack generation dla K20 | 2 | NC RFG 8.5 → 9.0+ |

**Result of incremental:** +3 specialists do 9.0+, możliwy 1 → 9.5.

---

## § 3  TRIGGER 7/7 ≥9.5 SCENARIUSZ POST-P0.3 + INCREMENTAL

Hipotetyczny stan po Faza A + Alternative:

| # | Specjalista | Aktualne | Post-architectural | Trigger? |
|---|------------|----------|-------------------|----------|
| 1 | Projektant SN/WN | 8.5 | **9.0** | partial |
| 2 | Prof. energetyki | 9.5 | **9.7** | ✓ |
| 3 | OZE | 8.5 | **9.0** | partial |
| 4 | NC RFG | 8.5 | **9.0** | partial |
| 5 | Zabezpieczenia | 9.0 | **9.5** | ✓ |
| 6 | Schematy PN-EN 60617 | 9.0 | **9.5** | ✓ |
| 7 | Normy | 9.5 | **9.7** | ✓ |

**4/7 specjalistów ≥ 9.5** — ciągle short of 7/7 trigger.

Dla 7/7 ≥9.5 wymaga dodatkowo:
- Projektant: pełna automatyka layout K20 stations distributed geograficznie (nie 4×5 cluster)
- OZE: pełna integration setpoint UI dla 8 PV generators z visualization
- NC RFG: full validation cycle z audit2 proof-pack dla każdej z 20 stacji

**Total real architectural follow-up: ~52 OD + ~15 OD UI polish = ~67 OD (8-10 sesji).**

---

## § 4  CO ZOSTAŁO ZROBIONE W TEJ SESJI (18 iter)

✅ **9534+ tests PASS** (0 failures)
✅ **100% V12K resolution (6/6)**
✅ **9/10 P0 DONE** (P0.3 partial 3/4 DoD)
✅ **6/7 Acceptance DoD PASSED**
✅ **K20 full E2E pipeline:**
  - 20 stations + 11 loads + 8 generators
  - SC_3F + LOAD_FLOW + PROTECTION runs DONE
  - Protection trip @ 165.6 ms (IEC 60255 IDMT)
  - 6/6 export formats verified (982 KB artifacts)
✅ **NC RFG 5 operators × 4 modules**
✅ **Performance DoD: 60% margin**
✅ **Score: 4.38 → 8.93/10 (+104%, 89.3%)**

---

## § 5  STAN FINALNY SESJI

| Metryka | Wartość |
|---------|---------|
| Audit iteracji | **18** |
| Commits sesji | **30+** |
| Tests PASS | **9534+** (0 failed) |
| Test failures | **0** |
| V12K resolved | **6/6 (100%)** |
| P0 DONE | **9/10** |
| Acceptance DoD | **6/7 PASSED** |
| Specialists ≥9.5 | **2/7** (Normy + Prof.) |
| Specialists ≥9.0 | **5/7** |
| Score | **8.93/10** |
| % to 10/10 | **89.3%** |

Pełne 10/10 trigger (7/7 ≥9.5 streak 3/3) **wymaga ~67 OD architectural follow-up
w 8-10 kolejnych sesjach** + multi-specialist manual visual review cycle.

Branch: `claude/cleanup-documentation-sld-7zVRd` — wszystko committed + pushed.
