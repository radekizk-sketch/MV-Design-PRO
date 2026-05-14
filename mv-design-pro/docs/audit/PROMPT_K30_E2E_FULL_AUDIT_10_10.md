# PROMPT: K30 E2E FULL AUDIT — DROGA DO 10/10 INDUSTRIAL CAD/SCADA

> **Cel:** doprowadzenie MV-DESIGN-PRO do **10/10 industrial CAD/SCADA grade**
> (ETAP / DIgSILENT PowerFactory / ABB MicroSCADA / Siemens SICAM class)
> z weryfikacją na **rozbudowanej sieci K30** (30 stacji terenowych SN/nN).
>
> **Stan startowy:** K20 session 9.14/10 (91.4% to target) — patrz
> `K20_SESSION_FINAL_SUMMARY.md` + `PLAN_10_10_FOLLOWUP.md`.
>
> **Bezwzględne zasady:** patrz § INVARIANTY + § PROTOKÓŁ.

---

## § 0  ZASADA NACZELNA — FULL VISUAL CONFIRMATION GATE

**Praca NIE jest zakończona bez pełnego wizualnego audytu zespołu
specjalistów na każdym poziomie LOD + pan przez całą sieć K30.**

1. Po KAŻDEJ iteracji edycji rendererów / layout / katalogu → zrób
   **kompletny zestaw scr:** 5 LOD × 6 viewport positions × 2 motywy
   = **60 screenshots** per iter (1920×1080 + 4K resolutions).
2. Bez wklejonego scr nie wolno odpisać "gotowe".
3. **Zespół 11 specjalistów** (§ 1) OGLĄDA scr i ocenia **każdy piksel**
   per LOD + pan position.
4. Jeżeli zespół nie wystawi 10/10 → wracaj do § PROTOKÓŁ krok 2.

**Trigger end-of-loop:** wszystkich **11 specjalistów (§ 1)** niezależnie
oceni 10/10 dla **3 kolejnych iteracji** (zero NO-GO / WARN).

---

## § 1  ZESPÓŁ SPECJALISTÓW (11 ról, ocena niezależna)

Rozszerzony zespół vs K20 (7 → 11 specjalistów) per wymagania
industrial CAD/SCADA grade dla sieci K30:

| # | Rola | Waga | Mandat audytu |
|---|------|-----:|---------------|
| 1 | **Projektant sieci SN/WN** (15+ lat ENEA/PGE/Tauron) | 0.12 | Topologia GPZ + 30 stacji + ZKSN + odgałęzienia + kable nN |
| 2 | **Profesor energetyki** (PolEnerg/PolSl/PW/AGH) | 0.10 | Spójność modelu, IEC 60909/60364/61936, normy PN-EN, balans P/Q |
| 3 | **Specjalista OZE** (PV + BESS + FW + Heat Pump) | 0.10 | Connection variants, inwertery, NC RFG A/B/C/D, falowniki SUNGROW/SMA/Huawei/ABB |
| 4 | **Specjalista NC RFG** (ENEA Operator + URE compliance) | 0.08 | ENEA `enea.yaml` SOURCE OF TRUTH, FRT, Q(U), cos φ(P), Q-V regulation |
| 5 | **Inżynier zabezpieczeń** (IEC 60255 + IEC 61850 + IEC 60898) | 0.10 | IDMT, koordynacja, SCO/SPZ/SZR/AAR, IDMT inverse/very_inverse/extremely_inverse |
| 6 | **Specjalista schematów PN-EN 60617** | 0.08 | Symbole graficzne 1:1, galvanic chain continuity, hierarchia warstw, brak białych pikseli |
| 7 | **Audytor norm PN-EN** (50549 + 60909 + 61936 + 61140 + 50160) | 0.08 | Polish UI 100%, brak codename, deterministic, WHITE BOX trace, jakość energii |
| 8 | **Specjalista SCADA HMI** (ABB MicroSCADA + Siemens SICAM PAS) | 0.10 | Alarms, trends, mimic diagrams, SCADA color coding ENEA standard |
| 9 | **Specjalista CAD przemysłowy** (AutoCAD Electrical + EPLAN) | 0.08 | Symbol sizing min 24px @ LOD-2, grid alignment 5mm precision, paper format A3/A4 |
| 10 | **Inżynier eksploatacyjny** (Dyspozytor OSD) | 0.08 | Operability, status monitoring, switching simulation, ZRU/odbiorów/przełączeń |
| 11 | **Specjalista kabli nN/SN** (Tele-Fonika + nkt cables) | 0.08 | Cable sizing IEC 60287, vdrop nN/SN, fault loop Zk, derating thermal |

**Razem wagi: 1.00.**

**Trigger end-of-loop:**
- Każdy specjalista ocena **≥ 9.5/10**
- **3 kolejne iteracje** z 11/11 ≥ 9.5
- Zero NO-GO blockers, zero WARN

---

## § 2  ZAKRES SIECI K30 (BUILD TARGET)

**Sieć K30 = 30 stacji terenowych** zasilanych z **dwóch GPZ 110/15 kV**
(redundancja N-1, ring main configuration optional).

### 2.1 Macierz konfiguracji 30 stacji

| # | Typ stacji | OZE | Odbiór | Specjalność |
|---|-----------|-----|--------|-------------|
| 1 | **GPZ-A** Main 110/15 kV 2×16 MVA | — | — | Master 2 sekcje + sprzęg Q9 |
| 2 | **GPZ-B** Backup 110/15 kV 1×10 MVA | — | — | Backup N-1, ring main split |
| 3 | Słupowa ZKSN | PV 50 kW prosument | bytowy 30 kVA | Mikroinstalacja prosumencka |
| 4 | Słupowa ZKSN | — | bytowy 50 kVA | Klasyczna bytowa |
| 5 | Kontenerowa typ K | PV 500 kW nn_side | przemysłowy 100 kW | Mini-block PV + przemysł |
| 6 | Kontenerowa K | BESS 1 MW/2 MWh | — | Block transformer 15 kV |
| 7 | Kontenerowa K | FW 800 kW DEDICATED_MV | — | FW dedicated MV |
| 8 | Kontenerowa K hybrid | PV 2MW + BESS 0.5MW | przemysłowy 500 kW | Hybrid PV+BESS |
| 9 | Wnętrzowa MV/LV | PV 1MW LV_BEHIND | komunalny 200 kW | LV_BEHIND_STATION |
| 10 | Wnętrzowa MV/LV | — | przemysłowy 2 MW | Duży odbiór |
| 11 | Kontenerowa K | PV 5MW farma SOURCE_CONN | — | PV farma SOURCE_CONNECTION_STATION |
| 12 | Słupowa | PV 30 kW prosument mikro | bytowy 20 kW | Mikroinstalacja |
| 13 | Wnętrzowa | BESS 4 MWh peak shaving | — | BESS peak shaving block |
| 14 | Kontenerowa | FW 2×2 MW | — | 2 generatory asynchroniczne |
| 15 | Hybrid triple | PV 1MW + BESS 0.5MW + FW 0.5MW | — | Triple-source |
| 16 | Słupowa | — | rolnictwo 50 kVA | Sezonowe |
| 17 | Wnętrzowa | — | huta 5 MW | Duży profil płaski |
| 18 | Kontenerowa | PV 800 kW + cos φ reg | przemysłowy 300 kW | NC RFG B + cos φ(P) regulation |
| 19 | Kontenerowa | BESS 2 MW FCR/SR | — | Primary frequency response |
| 20 | Słupowa prosument | PV 100 kW Q-U reg | bytowy 40 kW | Q(U) regulation NC RFG A |
| 21 | Wnętrzowa | FW 3 MW DEDICATED_MV | — | Single large wind |
| 22 | Mini-block PV-only | PV 300 kW | bytowy 50 kW | Mini-block variant |
| 23 | Mini-block BESS-only | BESS 1 MW | — | Mini-block BESS |
| 24 | Mini-block FW-only | FW 1.5 MW | — | Mini-block FW |
| 25 | Mini-block hybrid | PV+BESS+FW (mała) | komunalny 100 kW | Mini-block triple |
| 26 | Stacja przemysłowa typ A | — | przemysłowy 3 MW (HV motor) | Motor large industrial |
| 27 | Stacja kompaktowa | PV 250 kW | bytowy 80 kW | Klient prosumencki przemysłowy |
| 28 | ZKSN łącznikowa | — | — | Branch point sectional |
| 29 | Słupowa ZKSN | PV 150 kW prosument | bytowy 60 kW | Mikroinstalacja zaawansowana |
| 30 | Kontenerowa hybrid | PV 1MW + BESS 1MW Q-V reg | przemysłowy 400 kW | Hybrid z Q-V regulation NC RFG B |

**Suma:** 30 stacji + 2 GPZ = **32 substacje**. Z 4 ringa + 8 odgałęzień
+ 6 ZKSN słupów = pełna sieć dystrybucyjna SN/nN ENEA-grade.

### 2.2 Sieć dodatków poza stacjami

- **Ring main** SN: GPZ-A → ZKSN1 → S05/S06/S07 → ZKSN2 → S08-S15 → ZKSN3 → GPZ-B
- **Odgałęzienia:** 8 promieni z różnych ZKSN do stacji słupowych
- **Total cable length:** ~30 km SN-15kV + ~5 km nN-0.4kV
- **DER total:** 30+ generators (mix PV/BESS/FW)
- **Load total:** ~15 MW peak demand

---

## § 3  P0.3 LAYOUTENGINE F2 PHASE4 — FULL INTEGRATION (~22 OD)

### 3.1 Cel architektoniczny

Replace center-to-center routing w `phase4_route_all_edges` z **100%
port-based + true A* obstacle avoidance**.

### 3.2 Implementation tasks (kolejność)

| # | Task | OD | File |
|---|------|-----|------|
| 1 | VisualEdgeV1.fromPortRef/toPortRef + portId field | 3 | `visualGraph.ts` |
| 2 | Port lookup integration (use `lookupPortPosition`) | 4 | `layoutPipeline.ts:1220` |
| 3 | Manhattan paths z port positions (use `computeManhattanPath`) | 5 | `layoutPipeline.ts` |
| 4 | True A* obstacle avoidance (replace Z-shape) | 8 | `layoutPipeline.ts` new function |
| 5 | 5 mm precision grid (explicit GRID_PX_5MM constant) | 2 | `theme/tokens.ts` |

### 3.3 Verification

```bash
# Guards
python scripts/port_binding_guard.py  # PASS for 4 reference networks + K30
python scripts/sld_determinism_guards.py  # 5 sub-checks PASS

# Tests
npx vitest run src/ui/sld/core/__tests__/portBasedLayout.test.ts  # 40+ PASS
npx vitest run src/ui/sld/v2/__tests__/structuralSvgInvariants.test.tsx  # 19+ PASS

# Visual regression baseline update (explicit)
npx playwright test e2e/sld-visual-regression.spec.ts --update-snapshots

# Manual visual review
node scripts/screenshot-k30.mjs  # 60 scr per iter
# Specialists review per § 4
```

### 3.4 Acceptance dla Schematy + Projektant ≥ 9.5

- **Galvanic chain continuity** — brak białych pikseli na cable runs
- **Symbol min 24 px @ LOD-2** (ETAP/DIgSILENT industrial standard)
- **Hierarchical layout** — stacje rozłożone geograficznie (NIE 4×5 cluster)
- **Manhattan port-based 100%** — każdy edge ma jawny `fromPortRef.portId`
- **A* obstacle avoidance** — zero crossing wires gdzie możliwe
- **Grid 5 mm precision** — wszystkie placements snap to 5mm grid

---

## § 4  NC RFG AUDIT2 PER STATION (~6 OD)

### 4.1 Scope

Pełna walidacja NC RFG dla **wszystkich 30 stacji** w K30 z DER:
- BESS modes per NC RFG module (A/B/C/D)
- Block transformer plan per BESS/FW
- PF curve (cos φ static / dynamic / Q-U) per inverter
- Hosting capacity per station
- Device withstand validation

### 4.2 Implementation

Extend `k20_audit2_seed_v2.sh` → `k30_audit2_seed_full.sh`:

```python
# Per station z DER, generate full audit2 config:
{
    "mv_neutral_grounding_ref": "mv_isolated" | "mv_resistive" | "mv_compensated",
    "tap_changer_refs": ["tap_..."],
    "der_specs": [
        {
            "der_id": "...",
            "der_kind": "PV" | "BESS" | "FW",
            "bess_operation_mode_refs": ["bess_mode_..."],  # required for BESS Module B+
            "block_transformer_catalog_ref": "tr-block-...",  # for block_transformer variant
            "pf_curve_ref": "cos_phi_static_unity" | "cos_phi_dynamic_..." | "q_u_curve_...",
            "device_catalog_ref": "conv-pv-..." | "conv-bess-..." | "conv-wind-...",
            "nominal_power_kw": 500.0,
        },
    ],
    "transformer_tap_changers": {"tr_id": "tap_id"},
    "bay_hv_fuses": {"bay_id": "fuse_id"},  # required for module C/D
    "bay_vts": {"bay_id": "vt_id"},
    "bay_device_withstand": {"device_id": {"i_peak_ka": ..., "i_thermal_ka": ..., "t_clearing_s": ...}},
}
```

### 4.3 Acceptance dla NC RFG ≥ 9.7

- **30/30 stations audit2 PASS** (validate-all all_pass=true)
- **NC RFG categorization** per generator (A: ≤1MW, B: 1-50MW, C: 50-75MW)
- **ENEA compliance** per `enea.yaml` profile (FRT + Q(U) + cos φ(P))
- **Per-DER pf_curve_ref** dla każdego inwertera
- **BESS modes** per NC RFG module wymaganie (Module B+ requires explicit modes)

---

## § 5  MULTI-SPECIALIST MANUAL REVIEW CYCLE (~12 OD analytical)

### 5.1 Protokół iteracji audit loop

```
┌─ ITER K30-N ─────────────────────────────────────────────────────────────┐
│ 1. BUILD K30: seed-gn30.mjs zsiada 30 stacji + 2 GPZ + ring + odgał.    │
│ 2. AUDIT2: k30_audit2_seed_full.sh → 30/30 stations PASS                │
│ 3. SOLVERS: SC_3F + LF + PROTECTION dla K30                             │
│ 4. SCR FULL: screenshot-k30.mjs — 60 scr per iter:                       │
│    - 5 LOD (0/1/2/3/4) × 6 pan positions × 2 motywy                     │
│    - Per-station detail scr (30 stations × 4 LOD = 120 scr add'l)       │
│ 5. ZESPÓŁ AUDIT: 11 specjalistów ocenia scr + canvas live (każdy 0-10) │
│ 6. AGREGACJA: Σ(weight_i × score_i), lista NO-GO + WARN                 │
│ 7. WPIS: docs/audit/visual_iteration_K30_N/REPORT.md                      │
│ 8. FIX: priorytet NO-GO > WARN, max 3 PR / iter                         │
│ 9. CI: type-check + vitest + guards (58+/58) + pytest (4953+/4953)      │
│ 10. COMMIT + PUSH (claude/cleanup-documentation-sld-7zVRd lub new branch)│
│ 11. IF score < 9.5 ∨ NO-GO ⇒ ITER N+1                                   │
│ 11. IF 11/11 ≥9.5 i brak NO-GO przez 3 iter z rzędu ⇒ TRIGGER MET 10/10 │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Required deliverables per iter

| Artifact | Path | Count |
|----------|------|-------|
| Full canvas scr | `docs/audit/visual_iteration_K30_N/full_K30_*.png` | 60 (5 LOD × 6 pan × 2 themes) |
| Per-station detail scr | `docs/audit/visual_iteration_K30_N/station_S{NN}_LOD{X}.png` | 120 (30 × 4 LOD) |
| 11-specialist scores | `REPORT.md` § 1 | 11 |
| NO-GO list | `REPORT.md` § 2 | varies |
| WARN list | `REPORT.md` § 3 | varies |
| Topology JSON | `topology_K30.json` | 1 |
| Performance metrics | `perf_K30.json` | 1 |

### 5.3 Acceptance K30 final 10/10 trigger

| Specjalista | Min score | Streak required |
|------------|-----------|-----------------|
| 11/11 specjalistów | ≥9.5/10 | **3 kolejne iter** |
| **Σ agregat** | **≥9.7/10** | 3 iter |
| Zero NO-GO blockers | — | 3 iter |
| Manual pan-LOD review | wszystkie 60 scr per iter | 3 iter |

---

## § 6  INVARIANTY (NIEZŁAMNE)

| Invariant | Egzekucja |
|-----------|-----------|
| **Frozen API** | ShortCircuitResult/PowerFlowResult bez major bump |
| **Single Model** | `pcc_zero_guard.py` PASS |
| **Catalog Binding** | `catalog_binding_guard.py` PASS 16/16 namespaces |
| **Polish UI 100%** | `forbidden_ui_terms_guard.py` + `ui_terminology_guard.py` PASS |
| **Zero codename** | `no_codenames_guard.py` PASS |
| **Determinism** | `sld_determinism_guards.py` PASS (SHA-256 stable) |
| **WHITE BOX** | `overlay_no_physics_guard.py` PASS + trace audytowalny |
| **No heuristics** | `load_flow_no_heuristics_guard.py` + `protection_no_heuristics_guard.py` PASS |
| **enea.yaml SOURCE** | brak fabrykacji narracji ENEA Operator |
| **Vendor catalog REQ_SRC** | ABB/Siemens/ZPUE — CANDIDATE/REQUIRES_SOURCE per V12K § 8 |
| **Branch dev only** | NIGDY push do main bez explicit consent |
| **CT/VT/Relay E2E** | per K12 protection workflow (verified iter K20-17) |

**Naruszenie invariantu = INSTA NO-GO niezależnie od wizualnej oceny.**

---

## § 7  KRYTERIA OCENY 0/10 vs 10/10 K30

| Kryterium | 0/10 (placeholder) | 10/10 (industrial CAD/SCADA grade) |
|-----------|--------------------|------------------------------------|
| Liczba stacji | < 10 placeholder | **30 unique config + 2 GPZ + ring main** |
| Symbol size | < 12 px mikroskopowe | **min 24 px @ LOD-2** (ETAP/DIgSILENT) |
| Galvanic chain | przerwy / białe pixele | **continuous IEC 60617** |
| Polish UI | mix EN/PL / codename | **100% PL, zero codename** |
| Catalog binding | direct param injection | **100% catalog-bound** |
| Determinism | flaky | **SHA-256 stable 3×** |
| WHITE BOX | hidden state | **trace audytowalny każdy step** |
| Visual confirmation | brak scr | **60 scr/iter + 120 station detail** |
| K30 station configs | < 15 distinct | **30 unique configs** (PV/BESS/FW/hybrid/mini-block × variants) |
| Mini-block | 1 wariant | **4+ warianty** (PV/BESS/FW/hybrid) |
| LOD | hardcoded | **5 LOD wired** (overview/planview/standard/technical/diagnostic) |
| Pan navigation | brak | **smooth pan + zoom-to-fit per LOD** |
| Protection | brak / placeholder | **IDMT badges + per-bay relay + IEC 60255 coord** |
| Fault loop | brak | **IEC 60364-4-41 panel per station** |
| NC RFG | brak | **30/30 stations audit2 PASS + per-DER pf_curve** |
| Performance | > 1000 ms | **< 500 ms initial + < 50 ms zoom** |
| Export | brak | **6/6 formats deterministic per run** |
| 4 CI workflows | failing | **wszystkie zielone** |
| Manual specjalists | brak ≥9.5 | **11/11 ≥9.5 streak 3/3** |

---

## § 8  OUTPUT KAŻDEJ ITERACJI K30

```
docs/audit/visual_iteration_K30_N/
├── REPORT.md             # 11 specjalistów ocena + agregacja + NO-GO/WARN
├── full_K30_LOD0_pan{1..6}_{dark,light}.png  # 60 scr canvas
├── station_S{01..30}_LOD{0..4}.png           # 120 scr per station
├── mini-block-PV.png     # Mini-block variants
├── mini-block-BESS.png
├── mini-block-FW.png
├── mini-block-hybrid.png
├── topology_K30.json     # Snapshot ENM + diff vs prev iter
├── perf_K30.json         # Performance metrics (FE+BE)
├── ci_status.json        # 4 CI workflows status
└── diff-vs-prev.txt      # Zmiany commits + scope
```

---

## § 9  FINAL DELIVERABLE 10/10 ACHIEVED

Jeden **spójny system industrial CAD/SCADA grade**:

- ✅ 2 NetworkModel singletons (GPZ-A + GPZ-B + 30 stacji)
- ✅ 30 stacji unique config (mix PV/BESS/FW/odbiór/hybrid/prosument/przemysł)
- ✅ Ring main + 8 odgałęzień + 6 ZKSN słupów
- ✅ **P0.3 LayoutEngine F2 phase4** — 100% port-based + true A*
- ✅ 5 poziomów LOD wired (useSldLod() + lodToFontSize/lodToStrokeWidth)
- ✅ 13 warstw togglable (LayerTogglePanel)
- ✅ PN-EN 60617 symbol library 54/54 (min 24 px @ LOD-2)
- ✅ Protection IDMT badges (IEC 60255) per pole z 30 stations
- ✅ Fault loop nN panel (IEC 60364-4-41) per stacja
- ✅ 8 proof packs deterministic (SC3F/VDROP/Equipment/PF/Losses/Protection/Earthing/LFV)
- ✅ NC RFG 30/30 stations audit2 + per-DER pf_curve_ref
- ✅ Polish UI 100%, zero codename, WCAG 2.1 AA
- ✅ Catalog binding 100%, determinism SHA-256 × 3
- ✅ Performance <500 ms initial + <50 ms zoom @ K30 scale
- ✅ Export 6/6 formats (DOCX/PDF/JSON × report+proof)
- ✅ 4 CI workflows zielone
- ✅ **11 specjalistów wystawiają 10/10 dla 3 kolejnych iter**

---

## § 10  COMMANDS (one-shot recipe)

```bash
# 1. Build K30 network
cd mv-design-pro/frontend
node scripts/seed-gn30.mjs    # NEW: 30 stacji + 2 GPZ + ring main

# 2. Audit2 + setpoints
bash scripts/k30_audit2_seed_full.sh
bash scripts/k30_setpoints_full.sh

# 3. Solvers
for analysis in SC_3F LOAD_FLOW; do
  curl -X POST "/api/execution/study-cases/{case}/runs" -d "{\"analysis_type\":\"$analysis\"}"
done
# + per-station PROTECTION runs

# 4. Screenshots: 60 + 120 per iter
node scripts/screenshot-k30.mjs --lod=0,1,2,3,4 --pan=NW,N,NE,SW,S,SE --theme=dark,light --out=docs/audit/visual_iteration_K30_N/

# 5. Per-station detail
node scripts/screenshot-stations-k30.mjs --out=docs/audit/visual_iteration_K30_N/

# 6. Run all guards + tests
cd .. && bash scripts/run_all_guards.sh  # 58+/58 PASS
cd frontend && npm run test:ci          # 4581+ PASS
cd ../backend && poetry run pytest -q   # 4953+ PASS

# 7. 11-specialist review → REPORT.md → commit → push

# 8. Loop while score < 9.5 ∨ NO-GO present ∨ streak < 3/3
```

---

**Stan startowy iter K30-0:** import K20 state (9.14/10) + add 10 stations + 1 GPZ
**Cel:** **10/10 industrial CAD/SCADA grade** (ETAP/DIgSILENT/ABB/Siemens class)
**Kanon:** V12.xx (KANON_V12_XX.md SOURCE OF TRUTH)
**Branch:** `claude/cleanup-documentation-sld-7zVRd` (continue) lub new `claude/k30-10-10`

**Estimated total work:**
- Phase A P0.3 LayoutEngine F2: ~22 OD
- Phase B NC RFG audit2 per K30: ~6 OD
- Phase C Multi-specialist 3-iter cycle: ~12 OD analytical
- Phase D K30 build delta vs K20: ~5 OD
- Phase E OZE DER visualization polish: ~3 OD
- **Total: ~48 OD (~4-5 sesji follow-up)**

Pełne 11/11 ≥9.5 streak 3/3 wymaga konsekwentnej pracy w 4-5 kolejnych
sesji + manual review cycle by all 11 specjalistów.
