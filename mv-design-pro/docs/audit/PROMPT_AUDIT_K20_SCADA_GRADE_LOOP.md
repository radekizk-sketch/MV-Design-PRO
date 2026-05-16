# PROMPT: AUDYT ZESPOŁU SPECJALISTÓW — K20 SLD SCADA-CAD GRADE LOOP

> **Cel:** doprowadzenie schematu SLD do oceny 10/10 (SCADA-CAD industrial grade
> klasy ETAP / DIgSILENT / ABB MicroSCADA / Siemens SICAM) na sieci K20
> (≥ 20 stacji, każda z inną konfiguracją OZE/odbiór + mini-block).
> **Status startowy:** 0/10 (placeholder, atrapa z klocków).
> **Bezwzględne zasady:** patrz § PROTOKÓŁ + § INVARIANTY.

---

## § 0  ZASADA NACZELNA — VISUAL CONFIRMATION GATE

**Praca NIE jest zakończona bez wizualnego potwierdzenia.**

1. Po KAŻDEJ iteracji edycji rendererów / katalogu / topologii → zrób
   **pełny screenshot canvasu SLD** (1920×1080 minimum, headless Playwright,
   wszystkie warstwy ON).
2. Bez wklejonego screenshotu nie wolno odpisać "gotowe".
3. Zespół specjalistów (§ 1) OGLĄDA scr i ocenia **każdy piksel** — nie
   ufaj samym testom jednostkowym ani type-checkom.
4. Jeżeli scr nie osiąga 10/10 → wracaj do § PROTOKÓŁ krok 2.

**Trigger end-of-loop:** wszystkich 7 specjalistów (§ 1) niezależnie
oceni 10/10 dla **3 kolejnych iteracji** (bez nowych NO-GO / WARN).

---

## § 1  ZESPÓŁ SPECJALISTÓW (7 ról, ocena niezależna)

| # | Rola | Waga | Mandat audytu |
|---|------|-----:|---------------|
| 1 | **Projektant sieci SN/WN** (15+ lat ENEA/PGE/Tauron) | 0.20 | Topologia GPZ, pola SN, wyprowadzenia, ZKSN, stacje słupowe, kable nN |
| 2 | **Profesor energetyki** (PolEnerg/PolSl/PW) | 0.15 | Spójność modelu sieciowego, IEC 60909 / 60364 / 61936, normy PN-EN |
| 3 | **Specjalista OZE** (PV + BESS + FW) | 0.15 | Connection variants, inwertery, NC RFG kategorie A/B/C/D, falowniki SUNGROW/SMA/Huawei |
| 4 | **Specjalista NC RFG** (ENEA Operator) | 0.10 | Wymagania ENEA `enea.yaml` SOURCE OF TRUTH — bez fabrykacji |
| 5 | **Inżynier zabezpieczeń** (IEC 60255 + IEC 61850) | 0.15 | Krzywe IDMT, koordynacja, SCO/SPZ/SZR/AAR, badge protection, SI-100/SI-150 |
| 6 | **Specjalista schematów PN-EN 60617** | 0.15 | Symbole graficzne 1:1, połączenia galwaniczne, hierarchia warstw, brak białych pikseli |
| 7 | **Audytor norm i certyfikacji** (PN-EN 50549 + 60909 + 61936 + 61140) | 0.10 | Polish UI 100%, brak codename'ów, deterministic render, WHITE BOX trace |

**Każdy specjalista wystawia ocenę 0–10 + listę NO-GO (krytyczne) + WARN (do poprawy).**

**Ocena całościowa:** `Σ(weight_i × score_i)`. **Trigger 10/10:**
wszyscy ≥ 9.5 i brak NO-GO przez 3 iteracje.

---

## § 2  ZAKRES SIECI K20 (BUILD TARGET)

Sieć **K20** = **co najmniej 20 stacji** SN/nN, każda z UNIKALNĄ konfiguracją.
Wszystkie ZASILANE z jednego GPZ 110/15 kV (dwie sekcje 2×16 MVA).

### Macierz konfiguracji stacji (przykład min 20 wariantów)

| # | Typ stacji | OZE | Odbiór | Specjalność |
|---|------------|-----|--------|-------------|
| 1 | GPZ-ABG | — | — | Master GPZ, 2 sekcje, ZE25 + ZN140 + Q9 sprzęg |
| 2 | Słupowa ZKSN (linia napowietrzna) | PV 50 kW | — | Pojedynczy odpinacz, nadprądowy |
| 3 | Słupowa ZKSN | — | bytowy 30 kVA | Klasyczna mała |
| 4 | Kontenerowa typ "K" | PV 500 kW | przemysłowy 100 kW | Mini-block, inverter nN |
| 5 | Kontenerowa typ "K" | BESS 1 MW / 2 MWh | — | Block transformer 15 kV |
| 6 | Kontenerowa typ "K" | FW 800 kW | — | DEDICATED_MV_CONNECTION |
| 7 | Kontenerowa typ "K" | PV 2 MW + BESS 500 kW | przemysłowy 500 kW | Hybrid, 2 invertery |
| 8 | Wnętrzowa MV/LV | PV 1 MW | komunalny 200 kW | LV_BEHIND_STATION_TRANSFORMER |
| 9 | Wnętrzowa MV/LV | — | przemysłowy 2 MW | Klasyczny duży odbiór |
| 10 | Kontenerowa "K" | PV 5 MW farma | — | SOURCE_CONNECTION_STATION |
| 11 | Słupowa | PV 30 kW prosument | bytowy 20 kW | Mikroinstalacja prosumencka |
| 12 | Wnętrzowa | BESS 4 MWh peak shaving | — | Block transformer 15 kV |
| 13 | Kontenerowa | FW 2 × 2 MW | — | 2 generatory asynchroniczne |
| 14 | Kontenerowa hybrid | PV 1 MW + BESS 500 kWh + FW 500 kW | — | Triple-source |
| 15 | Słupowa ZKSN | — | rolnictwo 50 kVA | Rzadkie obciążenie sezonowe |
| 16 | Wnętrzowa MV | — | przemysłowy 5 MW (huta) | Duży zakład, profil płaski |
| 17 | Kontenerowa | PV 800 kW | przemysłowy 300 kW | Cos φ regulacja |
| 18 | Kontenerowa | BESS 2 MW / 4 MWh | — | FCR / SR — primary regulation |
| 19 | Słupowa | PV 100 kW prosument | bytowy 40 kW | Q-U regulation NC RFG |
| 20 | Wnętrzowa | FW 1 × 3 MW | — | Single large wind turbine |
| **+** | Mini-block | (rebuild) | (rebuild) | **Stacja kompaktowa do przebudowy** — patrz § 3 |

**Mini-block do przebudowy:** istniejący `MiniBlockRmuRenderer` ma być
**rozszerzony** do reprezentacji 4 wariantów stacji (PV-only / BESS-only /
FW-only / hybrid) z **kompletną hierarchią** symboli IEC 60617 i czytelnymi
badge'ami przy LOD-0/1 (overview).

---

## § 3  WYMAGANIA TECHNICZNE (DoD każdej iteracji)

### 3.1 Topologia (1 → 20 stacji)
- **Jeden** NetworkModel singleton (PowerFactory rule)
- **Jeden** GPZ z 2 sekcjami SN, sprzęg Q9
- 20 stacji wpiętych w odpowiednie pola SN (każde pole max 5 stacji)
- **Catalog binding** każdego elementu (NO direct param injection)
- **Brak white-spotów** na cable runs — wszystkie BRANCH_1/BRANCH_2 podłączone

### 3.2 Symbole PN-EN 60617
- Wyłącznik (Q): kwadrat, **galvanic chain** continuous
- Odłącznik (T): trójkąt
- Bezpiecznik topikowy: prostokąt z linią poziomą
- Trafo SN/nN: dwa okręgi styczne
- Inverter PV: okrąg + sinus
- BESS: prostokąt z "B"
- FW: okrąg + 3 ramiona
- Wszystkie **min 24 px** @ LOD-2 (ETAP/DIgSILENT min)

### 3.3 Hierarchia LOD (5 poziomów per `LodPolicy.ts`)
- **LOD-0** (overview, scale < 0.3): tylko GPZ + 20 nodes + main feeders
- **LOD-1** (planview, 0.3-0.7): + station mini-blocks z badge'ami DER
- **LOD-2** (standard, 0.7-1.5): + pola SN + wyłączniki Q + trafo
- **LOD-3** (technical, 1.5-3.0): + invertery + BESS + FW connection trees
- **LOD-4** (diagnostic, ≥3.0): + IDMT badges + Y_pcc + Z_loop diagnostics

### 3.4 Typografia (BASE_FONT_SIZES + WCAG)
- **gpzName:** 24 px @ LOD-2
- **bayName:** 16 px
- **deviceQ:** 13 px (Q1/Q2/Q9)
- **parameter:** 12 px (WCAG min)
- **fieldMeasurement:** 12 px
- **badge:** 11 px
- **footnote:** 10 px (clamp ≥ MIN_FONT_PX)
- **Polish 100%, zero codename'ów** (forbidden_ui_terms_guard)

### 3.5 Warstwy (13 togglable)
1. Tor mocy SN (busbar+feeder)
2. Tor mocy nN
3. Aparaty (Q/T/F)
4. Trafo
5. Inverter / BESS / FW
6. Cable runs
7. Stacje (mini-block kontur)
8. Etykiety identyfikacji
9. Etykiety parametrów
10. Pomiary (V/I/P/Q)
11. Protection badges
12. Y_pcc / Z_loop overlay
13. WHITE BOX trace markers

### 3.6 Determinism + WHITE BOX
- Identyczny snapshot SLD dla identycznego JSON inputu (SHA-256 fingerprint)
- Każdy solver dostarcza WHITE BOX trace audytowalny
- Brak heurystyk w protection / load flow / SC
- Frozen Result API (ShortCircuitResult / PowerFlowResult — bez major bump)

---

## § 4  PROTOKÓŁ ITERACJI (LOOP)

```
┌─ ITER N ─────────────────────────────────────────────────────────┐
│ 1. BUILD K20: seed-gn20.mjs zsiada 20 stacji, każda inna config │
│ 2. RUN: scripts/screenshot-full-sld.mjs → docs/audit/iter-N.png  │
│ 3. ZESPÓŁ AUDIT: 7 specjalistów ocenia scr (każdy 0-10)          │
│ 4. AGREGACJA: Σ(weight × score), lista NO-GO + WARN              │
│ 5. WPIS: docs/audit/visual_iteration_N/REPORT.md                  │
│ 6. FIX: priorytet NO-GO > WARN, max 3 PR / iter                  │
│ 7. CI: type-check + vitest + guards (64+)                         │
│ 8. COMMIT + PUSH (claude/cleanup-documentation-sld-7zVRd)        │
│ 9. JEŻELI: ocena < 9.5 ∨ NO-GO obecne → ITER N+1                 │
│ 9. JEŻELI: ocena ≥ 9.5 i brak NO-GO przez 3 iter z rzędu → DONE │
└──────────────────────────────────────────────────────────────────┘
```

---

## § 5  INVARIANTY (NIEZŁAMNE)

| Invariant | Źródło | Egzekucja |
|-----------|--------|-----------|
| Frozen API | V12K § 6 | Brak major bump bez ADR |
| Single Model | PowerFactory rule | `pcc_zero_guard.py` |
| Catalog Binding | V12K § 8 | `catalog_binding_guard.py` |
| Polish UI 100% | V12K § 4 | `forbidden_ui_terms_guard.py` |
| Zero codename | V12K § 4 | `no_codenames_guard.py` |
| Determinism | V12K § 7 | `sld_determinism_guards.py` |
| WHITE BOX | V12K § 9 | `overlay_no_physics_guard.py` |
| No heuristics | V12K § 9 | `load_flow_no_heuristics_guard.py` |
| ENEA YAML SOURCE | enea.yaml | Brak fabrykacji narracji |
| Vendor catalog REQ_SRC | V12K § 8 | CANDIDATE / REQUIRES_SOURCE |
| Branch dev only | global | NIGDY push do main bez zgody |

**Naruszenie invariantu = INSTA NO-GO niezależnie od oceny wizualnej.**

---

## § 6  KRYTERIA OCENY 0/10 vs 10/10

| Kryterium | 0/10 (atrapa) | 10/10 (SCADA-CAD grade) |
|-----------|---------------|------------------------|
| Liczba stacji | 1-5 placeholder | **20+ unikalne konfiguracje** |
| Symbol size | < 12 px (mikroskopowe) | **min 24 px @ LOD-2** |
| Galvanic chain | przerwy / białe pixele | **continuous IEC 60617** |
| Polish UI | mix EN/PL / codename | **100 % PL, zero codename** |
| Catalog | direct param injection | **catalog-bound 100%** |
| Determinism | flaky snapshot | **SHA-256 stable 3×** |
| WHITE BOX | hidden solver state | **trace audytowalny każdy step** |
| Visual confirmation | brak scr | **scr każda iteracja + audit** |
| K20 station configs | < 5 distinct | **20 unique configs (PV/BESS/FW/odbiór + hybrid)** |
| Mini-block | jeden wariant | **4 warianty (PV/BESS/FW/hybrid)** |
| LOD | hardcoded fontSize | **useSldLod() context wired** |
| Protection | brak / placeholder | **IDMT badges + IEC 60255 koord.** |
| Fault loop | brak | **IEC 60364-4-41 + FaultLoopResultPanel** |

---

## § 7  OUTPUT KAŻDEJ ITERACJI (artefakty)

```
docs/audit/visual_iteration_N/
├── REPORT.md             # Ocena 7 specjalistów + agregacja + NO-GO/WARN
├── canvas-full.png       # 1920×1080 pełny SLD canvas
├── canvas-lod0.png       # Overview
├── canvas-lod1.png       # Planview
├── canvas-lod2.png       # Standard
├── canvas-lod3.png       # Technical
├── canvas-lod4.png       # Diagnostic
├── mini-block-PV.png     # Mini-block PV variant
├── mini-block-BESS.png   # Mini-block BESS variant
├── mini-block-FW.png     # Mini-block FW variant
├── mini-block-hybrid.png # Mini-block hybrid variant
└── diff-vs-prev.txt      # Lista zmian vs iter N-1
```

---

## § 8  FINAL DELIVERABLE (10/10 achieved)

Jeden **spójny system**:
- ✅ 1 NetworkModel singleton (GPZ + 20 stacji)
- ✅ 20 stacji każda unique config (PV/BESS/FW/odbiór + hybrid + prosument)
- ✅ Mini-block 4 warianty (PV-only / BESS-only / FW-only / hybrid)
- ✅ 5 poziomów LOD wired (useSldLod context)
- ✅ 13 warstw togglable (LayerTogglePanel)
- ✅ PN-EN 60617 symbol library complete (min 24 px @ LOD-2)
- ✅ Protection badges (IEC 60255 IDMT) per pole
- ✅ Fault loop nN panel (IEC 60364-4-41) per stacja
- ✅ 8 proof packs (SC3F/VDROP/Equipment/PF/Losses/Protection/Earthing/LFV)
- ✅ Polish UI 100%, zero codename, WCAG 2.1 AA
- ✅ Catalog binding 100%, determinism SHA-256 × 3
- ✅ 7 specjalistów wystawiają 10/10 przez **3 kolejne iteracje**

---

## § 9  COMMANDS (one-shot recipe)

```bash
# 1. Build K20 network
cd mv-design-pro/frontend
node scripts/seed-gn20.mjs

# 2. Screenshot full SLD
node scripts/screenshot-full-sld.mjs --lod=0,1,2,3,4 --out=docs/audit/visual_iteration_N/

# 3. Run all guards
cd ..
python scripts/no_codenames_guard.py
python scripts/forbidden_ui_terms_guard.py
python scripts/catalog_binding_guard.py
python scripts/pcc_zero_guard.py
python scripts/overlay_no_physics_guard.py
python scripts/sld_determinism_guards.py
python scripts/load_flow_no_heuristics_guard.py
python scripts/protection_no_heuristics_guard.py

# 4. Run all tests
cd frontend && npm run type-check && npm test
cd ../backend && poetry run pytest -q

# 5. Audit team review (7 specjalistów evaluate)
#    → docs/audit/visual_iteration_N/REPORT.md

# 6. Loop if score < 10/10 OR NO-GO present
```

---

**Status startowy iter 0:** 0/10 (placeholder atrapa)
**Cel:** 10/10 (SCADA-CAD industrial grade ETAP/DIgSILENT/ABB/Siemens class)
**Kanon:** V12.xx (KANON_V12_XX.md SOURCE OF TRUTH)
**Branch:** `claude/cleanup-documentation-sld-7zVRd`
