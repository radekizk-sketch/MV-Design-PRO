# SLD_INDUSTRIAL_SPEC_v1 — Specyfikacja SLD klasy przemysłowej

**Status:** BINDING (V12.xx canon — feeder do `KANON_V12_XX.md` § 3 „SLD jest osią systemu")
**Wersja:** 1.0
**Data:** 2026-05-13
**Powiązane:**
- `docs/audit/AUDYT_BRAKI_2026-05.md` § 7 — audyt aktualnego stanu SLD
- `docs/plan/PLAN_SLD_REWORK.md` — fazowany plan reworku F1–F5
- `docs/sld/SLD_CONTRACT_FLOW_V1.md` — pipeline semantyka→layout→render (binding kontrakt)
- `docs/sld/SLD_SEMANTIC_MODEL_CANONICAL_V1.md` — model semantyczny (binding)
- `docs/sld/DARK_SCADA_NEON_THEME_SPEC.md` — paleta ekranowa (binding)
- `docs/v12xx/REJESTR_KONFLIKTOW.md` V12K-007 — Dark SCADA vs light technical

---

## 1. Cel

Doprowadzić SLD do stanu **klasy przemysłowej** porównywalnej z ETAP / DIgSILENT PowerFactory / ABB MicroSCADA / Siemens SICAM. Cel: 9/10 z aktualnych 5/10. Eliminacja wyglądu „atrapy z klocków".

System osiąga „klasę przemysłową" gdy spełnia wszystkie sześć filarów (§ 2) i przechodzi kryteria akceptacji (§ 9).

## 2. Sześć filarów industrial-grade SLD

| # | Filar | Aktualny stan | Target | Kontrakt |
|---|-------|---------------|--------|----------|
| F1 | Biblioteka symboli IEC 60617 | 58% parity, 32 symbole, brak ring/double busbar | ≥ 90% IEC 60617 parity + ANSI 315 alt mode | § 3 |
| F2 | Layout & routing (port-based, CAD) | A* obstacle avoidance OK, ale routing łączy współrzędne nie porty | Port-based routing 100%, grid snap, busbar-first | § 4 |
| F3 | LOD + warstwy + typografia | brak LOD, 13 ról fontów OK, brak warstw toggle | 5 poziomów LOD, 13 warstw toggle, hierarchia wizualna | § 5 |
| F4 | Overlay wyników + dark SCADA + light technical | overlay istnieje, dark SCADA OK, brak light technical | 2 motywy, overlay z strzałkami przepływu, kolory severity, fault current | § 6 |
| F5 | Eksport (SVG / PDF / DXF) | BRAK | SVG (vector-clean) + PDF (vector) + DXF (roadmap) | § 7 |
| F6 | Visual regression w CI | BRAK | Playwright `toHaveScreenshot` dla 15 fixtures × 4 LOD = 60 snapshotów | § 8 |

## 3. F1 — Biblioteka symboli IEC 60617

### 3.1 Standardy

- **IEC 60617** (Graphical symbols for diagrams) — primary
- **ANSI/IEEE 315** — alternative mode dla rynku US
- Format: SVG 1.1, viewBox `0 0 100 100`, stroke jedynie z `STROKE_PX` tokens
- Kolor bazowy `currentColor` (sterowane theme)
- Port definitions w `ports.json` (per-symbol port_id + (x, y) + kind + voltage_kv_compat)

### 3.2 Lista symboli docelowa (target ≥ 50)

#### Szyny i magistrale (8)

- `busbar_single` (single section)
- `busbar_section_marker` (oznaczenie sekcji)
- `busbar_double_main` (główna)
- `busbar_double_aux` (pomocnicza)
- `busbar_coupler` (sprzęgło)
- `busbar_ring` (pierścień S1–S2)
- `busbar_ring_section` (sekcja pierścienia)
- `nop_open` (NOP punkt otwarcia)

#### Łączniki (10)

- `circuit_breaker_fixed` (stałozamocowany)
- `circuit_breaker_drawout` (wyciągalny, IEC 60617-4-30)
- `disconnector` (rozłącznik)
- `load_switch` (rozłącznik bezpiecznikowy)
- `earthing_switch` (uziemnik)
- `fuse` (bezpiecznik)
- `auto_recloser` (PPZ, różny graficznie od CB)
- `motor_starter`
- `switch_3pos` (3-pozycyjny: ON/OFF/EARTH)
- `bypass_switch`

#### Transformatory (6)

- `transformer_2w` (z grupą Yyn0 / Dyn5 / Dyn11 / Yd11 jako annotation)
- `transformer_3w` (Y układ)
- `transformer_2w_drycast` (suchy)
- `autotransformer`
- `transformer_tap_changer` (z OLTC marker)
- `voltage_regulator`

#### Pomiarowe (6)

- `ct_ratio_marked` (CT z ratio np. „5A/2000A")
- `vt_ratio_marked` (VT z ratio)
- `ct_split_core`
- `metering_cubicle`
- `pq_meter` (licznik)
- `synchrocheck` (25, ANSI)

#### Ochronne (6)

- `surge_arrester_10ka`
- `surge_arrester_exd`
- `surge_arrester_metal_oxide`
- `lightning_rod`
- `grounding_resistor`
- `grounding_reactor`

#### Źródła i obciążenia (10)

- `utility_source` (sieć zewnętrzna, External Grid)
- `synchronous_generator` (z polem wzbudzenia)
- `induction_generator`
- `pv_inverter_nc_rfg` (z parametrami FRT/Q-U na annotation)
- `wind_turbine_full_converter`
- `wind_turbine_dfig`
- `battery_storage` (BESS)
- `static_load` (P+jQ)
- `motor_squirrel_cage`
- `motor_synchronous`

#### Inne (5)

- `capacitor_bank`
- `reactor_shunt`
- `cable_joint`
- `cable_head_triangle`
- `pole_overhead`

### 3.3 Reguły kontraktowe symboli

1. **Każdy symbol ma ports.json entry** z minimum 1 portem (kind: `BUS`, `LINE_IN`, `LINE_OUT`, `EARTH`, `TAP`).
2. **Port voltage compat** — port deklaruje na jakim napięciu może być (np. `voltage_kv_compat: [110, 15, 0.4]`).
3. **Stroke z tokenów** — `STROKE_PX` (default 3), `STROKE_DETAIL_PX` (2), `STROKE_GRID_PX` (1.5).
4. **`currentColor`** dla wszystkich elementów rysujących (theme-driven).
5. **Dozwolone rotacje** wymienione w meta (0°, 90°, 180°, 270°).
6. **Anchor point** dla etykiety (top/bottom/left/right).

### 3.4 Inspiracja (nie kopiować artefaktów)

- **ETAP color palette** — semantyka stanów (closed=zielony, open=czerwony, fault=czerwony pulsujący)
- **ABB MicroSCADA layout density** — gęstość pól ~3.5 pól/cm² w skali 1:50
- **Siemens SICAM grid** — grid snap 5 mm, snap step 1 mm
- **AutoCAD Electrical dimension style** — wymiarowanie linii, kabli (długość, R/X)
- **DIgSILENT PowerFactory annotation** — krój sans, alignment top-of-symbol

## 4. F2 — Layout & routing (port-based, CAD-grade)

### 4.1 Pipeline (binding, patrz `SLD_CONTRACT_FLOW_V1.md`)

```
Snapshot / TopologyInput
  → SldSemanticGraphV1
  → LayoutInputGraphV1   ← TUTAJ port geometry jest dołączana
  → LayoutEngine (z 4 strategiami: legacy/greedy/force-directed/hierarchical-port-based)
  → LayoutResultV1       ← KAŻDY edge ma port_id_start + port_id_end (port_based: true)
  → Renderer
```

### 4.2 Strategia hierarchical-port-based (NOWA, target)

1. **Faza 1: place_gpz_with_busbar_topology** — GPZ z bus-bar (single/double/ring) jest pierwszym byteim; busbar zawsze poziomy w SN (V12.xx orientation rule).
2. **Faza 2: place_fields_along_busbar** — pola SN ustawione w stałym `FIELD_GAP_PX` (default 120 px).
3. **Faza 3: build_trunk_with_branches** — magistrala SN i odejścia (logical_views.trunks + branches).
4. **Faza 4: place_stations_and_load_centers** — stacje SN/NN i odbiory.
5. **Faza 5: route_all_edges_port_based** — A* z obstacle avoidance, każdy edge zaczyna i kończy w PORT.
6. **Faza 6: place_labels_with_collision_avoidance** — etykiety nie zachodzą.
7. **Faza 7: enforce_invariants_and_hash** — SHA-256 fingerprint.

### 4.3 Routing — wymagania krytyczne

- **Port-based 100%:** każdy `edge.start = {x, y, port_id}` i `edge.end = {x, y, port_id}`. Brak routing-to-bbox.
- **Orthogonal (Manhattan):** 0° / 90° tylko.
- **Obstacle avoidance:** A* z weight'ami (gęsty obszar pola GPZ = większy weight).
- **Grid snap:** 5 mm @ 1:50 (na ekranie ~10 px), wszystkie nodes i bends snapowane.
- **Bus-bar first:** szyny renderowane jako first-class, edge nie przecina busbar prostopadle bez junction.
- **Junctions:** kropka (electrical) przy 3+ edge'ach; przeskok (mechanical jump) przy crossings bez połączenia.
- **Minimum 2 segments** dla każdego edge'a (port → bend → port).
- **Crossings minimization** jako secondary objective A*.

### 4.4 Plik kontraktu

`frontend/src/ui/sld/core/layoutEngine.ts` — strategia `hierarchical-port-based` (NOWA).
`frontend/src/ui/sld/v2/builder/PortBasedLayout.ts` (NOWY) — implementacja.

## 5. F3 — LOD + warstwy + typografia + grid

### 5.1 Level-of-Detail (5 poziomów)

| LOD | Zoom range | Co renderuje |
|-----|------------|--------------|
| LOD-0 (overview) | < 0.15× | tylko outline GPZ, magistrala, brak pól |
| LOD-1 (planview) | 0.15–0.30× | + pola GPZ jako prostokąty z nazwą, bez detali |
| LOD-2 (standard) | 0.30–0.70× | + CB, DS w polach, główne pomiary |
| LOD-3 (technical) | 0.70–1.30× | + CT/VT, badge'e SPZ/SCO/OWG, parametry techniczne |
| LOD-4 (full detail) | > 1.30× | wszystko + footnoty, snapshot info, źródła |

### 5.2 Warstwy (13 toggle'ach)

1. `power` — obwód mocy (always-on)
2. `control` — obwody pomocnicze (LV, sygnalizacja)
3. `protection` — przekaźniki, krzywe, strefy
4. `metering` — CT/VT, liczniki
5. `annotations` — etykiety tekstowe
6. `dimensions` — wymiary (długość linii, %)
7. `results-overlay` — wyniki na SLD
8. `fault-flow` — strzałki prądów zwarciowych
9. `power-flow` — strzałki przepływu P/Q
10. `grid` — siatka snap
11. `ports` (debug) — kropki portów
12. `boundaries` — granice stref (Analysis layer)
13. `legend` — legenda kolorów + symboli

### 5.3 Typografia hierarchiczna

| Rola | Font size | Weight | Token |
|------|-----------|--------|-------|
| `gpzName` | 24 px | 700 | `FONT_SIZES.gpzName` |
| `bayName` | 14 px | 600 | `FONT_SIZES.bayName` |
| `deviceQ` | 12 px | 500 | `FONT_SIZES.deviceQ` |
| `parameter` | 11 px | 400 | `FONT_SIZES.parameter` |
| `fieldMeasurement` | 11 px | 500 | `FONT_SIZES.fieldMeasurement` |
| `badge` | 9 px | 700 | `FONT_SIZES.badge` |
| `footnote` | 8 px | 400 | `FONT_SIZES.footnote` |

Krój: Inter (lub system sans serif fallback). Tabular numerals dla liczb.

### 5.4 Grid system

- Grid base = 5 mm
- Snap step = 1 mm
- Scale 1:50 default (1 mm rzeczywisty = 20 mm rysunkowy)
- Alternatywne skale: 1:25, 1:100, 1:200

### 5.5 Visual emphasis

- Wyłącznik główny GPZ: stroke 4 px, fontWeight 800
- Rozłącznik pomocniczy: stroke 2 px, fontWeight 400
- Element z BLOCKER readiness: outline pulsujący czerwony (animacja CSS)
- Element z WARN: outline żółty
- Element OK: bez outline

## 6. F4 — Overlay wyników + dark SCADA + light technical

### 6.1 Dwa motywy (V12K-007)

| Tryb | Użycie | Tła | Linie | Akcenty |
|------|--------|-----|-------|---------|
| `dark_scada` | ekran operatora | #101316 | #F2F4F6 | #07983A (closed), #C9151B (open), #FFB200 (warn) |
| `light_technical` | eksport PDF/DOCX, druk A3 | #FFFFFF | #000000 | #007A3D (closed), #B71C1C (open), #E08400 (warn) |

Theme switch via CSS variables `--sld-*`. Eksport zawsze w `light_technical` (W12K-007).

### 6.2 Overlay SC (short circuit)

- Per Bus: `I''k3` [kA], `Ip` [kA], `Ith` [kA] w karcie pod busem
- Kolor: severity wg ratingu sprzętu (`zielony`: 0–80% rating, `żółty`: 80–100%, `czerwony`: > 100%)
- Strzałki kierunkowe wkładów źródeł (jeśli > 1 źródło)

### 6.3 Overlay PF (power flow)

- Strzałki kierunku P+jQ na linii: `→` (P > 0), `←` (P < 0), grubość ∝ |S|
- Kolor strzałki: gradient od zielonego (lekko obciążone) do czerwonego (przeciążone)
- Per Bus: `|V|` [pu], `φ` [°], etykietki kolorystyczne (under/normal/over)

### 6.4 Overlay Protection

- Strefy zadziałania per relay (przezroczyste tło)
- Czas zadziałania t51 [s] przy CB
- Margins selektywności (numerical only, brak werdyktów)

### 6.5 Plik kontraktu

`docs/ui/SLD_RENDER_LAYERS_CONTRACT.md` (istnieje) + extension w tym dokumencie.

## 7. F5 — Eksport (SVG / PDF / DXF)

### 7.1 SVG export

- Vector-clean — bez `<image>` tagów, bez raster
- Wszystkie symbole inline (nie reference do external)
- `viewBox` adjusted do bbox
- `currentColor` zastąpiony konkretnym kolorem motywu eksportu (`light_technical`)
- ID atrybuty stabilne (deterministyczne hash)
- Plik kontraktu: `docs/sld/SLD_EXPORT_SVG_CONTRACT.md` (NOWY do dopisania w F4 reworku)

### 7.2 PDF export

- Vector PDF (nie raster) via `pdfkit` lub natywne SVG → PDF
- A3 default (420 × 297 mm), opcjonalnie A2, A1
- Embedded fonts (Inter subset)
- Header light_technical: nazwa projektu, case, snapshot, timestamp, paginacja
- Footer: legenda + skala graficzna

### 7.3 DXF export (roadmap, F5 → P2)

- AutoCAD DXF 2018 format
- Każdy symbol jako BLOCK
- Layery odpowiadające `power`, `control`, `protection`, `annotations`
- Linie jako LWPOLYLINE
- Outsourcowane do follow-up po F1–F4

### 7.4 UI

- Toolbar w SLD: `Pobierz SVG`, `Pobierz PDF`, (`Pobierz DXF` — disabled w F1–F4)
- File dialog z opcjami: motyw (auto = light_technical dla eksportu), skala, format papieru

## 8. F6 — Visual regression w CI

### 8.1 Playwright fixtures

15 visual fixtures × 4 LOD = 60 snapshotów:

- Sieci referencyjne (4): `leaf`, `pass`, `branch`, `ring+NOP`
- GPZ stand-alone (1): GPZ 110/15 kV 12-bay
- Stacje (4): GPZ, RMU, MV/LV przelotowa, MV/LV odgałęźna
- DER (3): PV (1 MWp), BESS (500 kWh), FW (2 MW)
- Edge cases (3): missing-data, no-calc, empty-project
- LOD per fixture: 0, 1, 2, 3 (LOD-4 testowane manualnie)

### 8.2 Toleancja

- Pixel diff threshold: 0.5% per snapshot
- Update baseline tylko explicit (`npm run test:e2e:update-snapshots`)
- Diff artifacts uploaded jako CI artifacts

### 8.3 Plik CI

`.github/workflows/sld-determinism.yml` — extension z Playwright visual regression.

## 9. Kryteria akceptacji (Definition of Done dla SLD industrial)

System SLD osiąga „klasa przemysłowa" gdy:

- [ ] **F1:** ≥ 50 symboli SVG z ports.json, IEC 60617 parity ≥ 90% (audit checklist `docs/sld/SLD_IEC_60617_PARITY.md`)
- [ ] **F2:** 100% edges port-based (guard: `port_binding_guard.py` rozszerzony)
- [ ] **F3:** 5 poziomów LOD przełączane, 13 warstw toggle'owalnych, typografia z `FONT_SIZES`
- [ ] **F4:** 2 motywy (dark_scada, light_technical), overlay SC/PF/Protection w pełni funkcjonalne
- [ ] **F5:** SVG + PDF eksport działa dla 4 referencyjnych sieci, deterministyczny
- [ ] **F6:** 60 visual snapshots w CI, < 0.5% pixel diff tolerance
- [ ] Konsolidacja: `GpzSwitchgearRenderer.tsx` + `GpzCanonicalRenderer.tsx` → jeden `GpzIndustrialRenderer.tsx`
- [ ] Konsolidacja: 3 pipeline'y → 1 kanoniczny (pozostałe oznaczone `@deprecated`)
- [ ] Visual regression dla 4 sieci referencyjnych: leaf, pass, branch, ring+NOP — PASS
- [ ] Manual review przez inżyniera SN: 4 sieci × 2 motywy = 8 widoków, ocena ≥ 9/10
- [ ] Performance: render 200 pól w < 500 ms (initial), < 50 ms (zoom/pan)
- [ ] Zero codename'ów (`no_codenames_guard.py` PASS)
- [ ] Zero forbidden UI terms (`forbidden_ui_terms_guard.py` PASS)
- [ ] Polskie etykiety wszędzie (user-visible strings)

## 10. Plan reworku — patrz osobny dokument

Faza F1–F5 z szacunkami osobodni, plików do zmiany, ryzyk i testów jest opisana w **[`docs/plan/PLAN_SLD_REWORK.md`](../plan/PLAN_SLD_REWORK.md)**.

---

**KONIEC SPECYFIKACJI SLD INDUSTRIAL**
