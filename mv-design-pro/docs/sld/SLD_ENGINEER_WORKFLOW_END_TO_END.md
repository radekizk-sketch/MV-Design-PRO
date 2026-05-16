# SLD_ENGINEER_WORKFLOW_END_TO_END — Docelowy flow inżyniera

**Status:** AKTUALNY (binding flow design)
**Wersja:** 1.0
**Data:** 2026-05-13
**Powiązane:**
- `docs/audit/ENGINEER_WORKFLOW_AUDIT.md` — audyt aktualnego flow
- `docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md` — plan E2E implementacji
- `docs/sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md` — docelowy SLD
- `docs/sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md` — kryteria akceptacji

---

## 1. Zasada nadrzędna

Flow inżyniera projektanta sieci SN MUSI być **prosty, inżynierski, nie programistyczny**.

Punktem odniesienia jest sposób pracy projektanta w **PowerFactory / ETAP** + uproszczenia dla typowych przypadków OSD.

System ma być narzędziem inżynierskim, nie panelem programistycznym. Eliminacja zbędnych zakładek, technicznych pól, ukrytych ścieżek.

---

## 2. 14-krokowy flow (docelowy)

### Krok 1 — Start projektu

**Co robi inżynier:**
- Otwiera aplikację
- Klika „Nowy projekt"
- Wpisuje nazwę projektu + numer projektu (opcjonalnie) + projektant

**Co dzieje się w backendzie:**
- `POST /api/projects` z payload `{name, project_number, designer, created_by}`
- Inicjalizacja pustego ENM (singleton per projekt)
- Inicjalizacja domyślnego Study Case „Wariant bazowy"

**UX wymagania:**
- Modal kreacji nowego projektu — max 5 pól
- Default values: częstotliwość 50 Hz, voltage_levels SN [15, 20 kV]

**Stan:** ✅ Działa (ui/projects/, api/projects.py).

### Krok 2 — Definicja GPZ / źródła zasilania

**Co robi inżynier:**
- Wybiera z listy szablon GPZ (vendor template lub generic)
- Wpisuje: nominał TR (np. 25 MVA), grupa przekładni (Dyn11), liczba sekcji SN
- Topologia szyn SN: single / double / ring

**Co dzieje się w backendzie:**
- `POST /api/enm/operations` z `create_gpz` operation
- Materializacja TR + busbar + sekcje
- Logical_views automatycznie aktualizowane

**UX wymagania:**
- Selektor szablonu vendor (rodzina ABB / Siemens / ZPUE Włoszczowa / Elektrometal) — **wymaga vendor templates (CANDIDATE / REQUIRES_SOURCE — konkretne serie do weryfikacji wg vendor datasheets)**
- Toggle topologii szyn SN (single/double/ring) jako wizualny chooser z preview
- Nie 10 pól tabelarycznych — wizualne wybory

**Stan:** ⚠️ Częściowy (`StationConfigurator` 10 zakładek, brak szablonów vendor). Plan: F1 + UX optimization.

### Krok 3 — Parametry zwarciowe (Z TOGGLE)

**TOGGLE:** `Tryb uproszczony` (default) / `Tryb zaawansowany`

#### 3a. Tryb uproszczony (default — dla typowego case'u)

**Co wpisuje inżynier:**
- Moc zwarciowa S″k po stronie SN [MVA]
- R/X stosunek po stronie SN (default 0.1)

**Co dzieje się w backendzie:**
- Solver SC IEC 60909 używa S″k_SN + R/X_SN bezpośrednio
- Nie potrzeba modelu 110 kV ani TR (uproszczenie zachowane jako contractowe)

**UX wymagania:** 2 pola input, 1 toggle do trybu zaawansowanego.

#### 3b. Tryb zaawansowany (dla pełnego modelu 110 kV)

**Co wpisuje inżynier:**
- Strona 110 kV: U_n, S_n_min/max, R/X 110, X/R 110, kk
- Transformator: S_n, U_k%, P_k, grupa, tap range
- Układ GPZ: liczba TR, sekcje, sprzęgło, ring/double busbar

**Co dzieje się w backendzie:** Pełny model używany przez solver IEC 60909.

**UX wymagania:** Pełny formularz, ale podzielony na logiczne sekcje (3-4 zakładki max).

**Stan:** ✅ UI toggle dostarczony 2026-05-13 (`CreateCaseDialog.tsx` data-testid=`sc-input-mode` + conditional inputs `sc-sk-mva` + `sc-rx-ratio`).
Backend `StudyCaseConfig.sc_input_mode` + `sc_simplified_sk_mva` + `sc_simplified_r_x_ratio`
zaimplementowane z backward-compat fallback. Default tryb: `simplified`.

**Pozostały scope:** integracja `sc_simplified_sk_mva` w `solver_input/builder.py`
(materializacja c_factor z S″k_SN gdy mode='simplified') — follow-up ~1 OD.

### Krok 4 — Wybór standardów operatora

**Co robi inżynier:**
- Dropdown selektor operatora (top of project): **ENEA Operator (default)** / Energa / PGE Dystrybucja / PSE / Tauron Dystrybucja
- Wybór wpływa na: krzywe FRT, zakres Q, profil cos φ(P), ramp rate, dead band, kryteria walidacji NC RfG

**Co dzieje się w backendzie:**
- `study_case.operator_id` ustawione (np. „enea")
- Loader profilu YAML aktywny: `backend/src/catalog/profiles/nc_rfg/{operator}.yaml`
- Audit2 validation używa profilu operatora

**UX wymagania:**
- Selektor widoczny w global context bar (sticky top)
- Default: ENEA Operator (per `/goal`)
- Indykator: „Wymagania ENEA Operator obowiązują w tym projekcie"

> **BLOCKER:** Dokumentacja narracyjna ENEA Operator (IRiESD, NC RfG) — wymaga źródła. Nie fabrykować. YAML jest źródłem prawdy w repo (`backend/src/catalog/profiles/nc_rfg/enea.yaml`).

**Stan:** ✅ UI selektor dostarczony 2026-05-13 (`CreateCaseDialog.tsx` data-testid=`operator-profile-id`).
5 operatorów (ENEA default + Energa + PGE + PSE + Tauron) propagowane do
`StudyCaseConfig.operator_profile_id`. YAML profile w
`backend/src/catalog/profiles/nc_rfg/{operator}.yaml` pozostają jako source of truth
parametrów NC RfG (loader.py).

**BLOCKER (utrzymany):** narracja IRiESD ENEA Operator wymaga źródła vendor /
regulatora — NIE fabrykować. UI tylko wybiera operator_profile_id.

### Krok 5 — Wybór katalogowych typów kabli/linii

**Co robi inżynier:**
- Otwiera Catalog Browser
- Wybiera domyślne typy dla projektu:
  - Linia napowietrzna: np. AFL-6 70 mm² 15 kV
  - Kabel SN: np. YAKXS 3×120/16 mm² 15 kV (XLPE Al, TFK)
  - Transformator SN/NN typowy: np. 630 kVA Dyn11
- Wybór staje się **default** dla następnych operacji

**Co dzieje się w backendzie:**
- `study_case.default_catalog_refs` ustawione
- Operacje `create_line`, `create_cable`, `create_transformer` używają default jeśli nie sprecyzowano

**UX wymagania:**
- Catalog Browser z filtrem (vendor, rating, mm²)
- Visual preview symbolu per typ
- „Ostatnio użyte" sekcja

**Stan:** ✅ Działa (CatalogBrowser, catalog/v1_spec). UX optimization P2.

### Krok 6 — Budowa magistrali SN

**Co robi inżynier:**
- Klika „Rozbuduj magistralę" lub draguje z end-pointu GPZ
- Wskazuje kierunek + długość kolejnego odcinka (domyślnie 250 m)
- System automatycznie ustawia trunk_id, typ linii (default z K5)

**Co dzieje się w backendzie:**
- `POST /api/enm/operations` z `extend_trunk` operation
- Logical_views aktualizowane (trunk segments)

**UX wymagania:**
- Drag z portu end-pointu (nie z menu 3-kliknięciowego)
- Snap do grid 5 mm

**Stan:** ⚠️ Częściowy (klikalność istnieje, ale brak intuicyjnego drag). Plan: F2 + UX optimization.

### Krok 7 — Wstawianie stacji (Z PREVIEW)

**Co robi inżynier (wariant A: na końcu odcinka):**
- Klika na end-point trunkA
- Wybiera „Wstaw stację na końcu"
- Wybiera typ stacji (przelotowa / konsumentowa / DER) + szablon
- Stacja dodana po commit

**Co robi inżynier (wariant B: split z preview):**
- Klika na środek odcinka SN
- Wybiera „Podziel + wstaw stację"
- **Preview:** odcinek dzieli się na 2, stacja w pozycji kursora (drag), długości segmentów aktualizują się dynamicznie
- **Cancel** lub **Commit**
- Po commit: idempotency_key wygenerowany deterministycznie + ENM_OP

**Co dzieje się w backendzie:**
- Wariant A: `extend_trunk` + `create_station`
- Wariant B: `split_line` (z preview rendering w FE) + `create_station`

**UX wymagania:**
- Preview MUSI być widoczny przed commit (zmiana wizualna real-time)
- Cancel zawsze dostępny

**Stan:** ❌ Brak preview dla wariantu B. Plan: F2 + dom_ops extension (10 OD).

### Krok 8 — Stacje przelotowe, konsumentowe, PV, BESS, FW

**Co robi inżynier:**
- Po wstawieniu stacji (K7) konfiguruje typ:
  - **Przelotowa**: 2 pola liniowe + TR + odbiory NN
  - **Konsumentowa**: 1 pole liniowe + TR + odbiory NN
  - **PV (DER)**: pole liniowe + falownik PV + (opcj.) TR + PCC marker
  - **BESS**: pole liniowe + PCS + (opcj.) TR + PCC marker
  - **FW**: pole liniowe + zespół turbin + transformator + PCC marker

**Co dzieje się w backendzie:**
- Topology classifier ustawia typ stacji (`station_kind`)
- Logical_views aktualizowane (stations, der_units, pcc_points)

**UX wymagania:**
- StationConfigurator z **wizard mode** (3 zakładki dla typowych) zamiast 10
- Dla DER: profil operatora (z K4) propagowany automatycznie + walidacja NC RfG
- PCC marker wizualnie powiązany z polem stacji nadrzędnej

**Stan:** ✅ Funkcjonalnie (StationConfigurator + DerConfigurator) | ⚠️ UX (10 zakładek przytłaczają). Plan: F1 vendor templates + P2 wizard mode.

### Krok 9 — Odgałęzienia, ZK SN, słupy rozgałęźne, NOP

**Co robi inżynier:**
- Klika na node w magistrali SN → wybiera „Dodaj odgałęzienie"
- Wybiera punkt odgałęzienia: **branch_point** (kropka electrical) / **ZK SN** (złącze kablowe) / **słup rozgałęźny** (`pole.svg`)
- Buduje gałąź odgałęźną (analogicznie do K6)
- NOP (Normalnie Otwarty Punkt): klika na końcówkę gałęzi → „Oznacz jako NOP"

**Co dzieje się w backendzie:**
- `create_branch_point` / `create_zk_sn` / `create_pole` operations
- NOP zaznaczony w logical_views.nops

**UX wymagania:**
- Tool palette z 3 typami punktów rozgałęzienia (kropka / ZK / słup)
- NOP wizualnie wyraźny (otwarty symbol)

**Stan:** ⚠️ Częściowy (NOP w logical_views, ZK SN symbol istnieje, brak intuicyjnego tool palette). Plan: F2 + tool palette extension.

### Krok 10 — Obliczenia rozpływu mocy i zwarć

**Co robi inżynier:**
- Sprawdza Readiness Gate (zielony / żółty / czerwony)
- Jeśli zielony: klika „Oblicz" w wybranej zakładce:
  - **Rozpływ mocy** (Power Flow: NR / GS / FD)
  - **Zwarcia** (Short Circuit: 3F / 2F / 1F / 2F+G IEC 60909)
- Wybiera study case (lub używa aktywnego)
- Klika „Uruchom"

**Co dzieje się w backendzie:**
- `POST /api/analysis-runs` → run_id
- `POST /api/analysis-runs/{run_id}/execute` → solver
- Wyniki: WHITE BOX trace + frozen ResultSet

**UX wymagania:**
- Readiness Panel pokazuje status (z fix-actions)
- Po zielonym readiness — 1 klik uruchamia
- Progress indicator (czas oczekiwania na solver)

**Stan:** ✅ Działa (api/analysis-runs, executeRun w FE).

### Krok 11 — Dobór i koordynacja zabezpieczeń

**Co robi inżynier:**
- Otwiera Protection Coordination panel
- Wybiera relay (z `protection_engine_v1.py` library)
- Configures: I> setpoint, I>> setpoint, krzywa IDMT (IEC: SI, VI, EI, LTI), TMS
- Sprawdza coordination z relayem nadrzędnym (margin selektywności)
- Klika „Uruchom Protection Analysis"

**Co dzieje się w backendzie:**
- `POST /api/analysis-runs` z `analysis_type=protection`
- Wyniki: protection settings + coordination margins + selectivity diagram

**UX wymagania:**
- TCC chart (krzywe czas-prąd) widoczny
- Margins selektywności numerical (brak werdyktów)
- Strefy zadziałania wizualne na SLD overlay

**Stan:** ✅ STUB SI-100 USUNIĘTY 2026-05-13 (commit P0.2). `solver_input/eligibility.py`
implementuje realne warunki Protection eligibility:
1. ≥ 1 BREAKER lub RECLOSER w grafie (chroniony aparat)
2. SLACK źródło (E-D01 z common blockers)

Krok 11 flow inżyniera odblokowany. Per-relay validation (settings, krzywe IDMT,
CT/VT bindings) jest deferred do runtime'u `protection_engine_v1`. 121/121 protection
testów PASS.

### Krok 12 — Wizualizacja wyników na SLD

**Co robi inżynier:**
- Po obliczeniu (K10/K11) otwiera Results Browser
- Wybiera analizę (PF / SC / Protection)
- Klika „Pokaż na SLD"
- Overlay włącza się: strzałki przepływu / I''k3 per Bus / strefy zabezpieczeń

**Co dzieje się w backendzie:**
- Results read-only z frozen ResultSet
- Renderer SLD overlay (sld-overlay/) aplikuje styling per result

**UX wymagania:**
- Toggle warstw overlay (results-overlay / fault-flow / power-flow)
- Hover na Bus pokazuje pełne dane (V, φ, I, P, Q, Sk)
- Kolory severity wg ratingu

**Stan:** ⚠️ Częściowe (overlay istnieje, ale wizualnie nieprzemysłowy — patrz SLD_VISUAL_QUALITY_AUDIT). Plan: F4 (overlay redesign).

### Krok 13 — Dowód obliczeń i raport

**Co robi inżynier:**
- Otwiera Proof Inspector
- Wybiera pakiet (SC3F / VDROP / Equipment / PF / Losses / Protection / Earthing / LF Voltage)
- Widzi: Formula → Data → Substitution → Result → Unit verification
- Eksport: JSON / LaTeX / PDF / **DOCX**

**Co dzieje się w backendzie:**
- `GET /api/proof-pack/{run_id}?type=...` generuje proof
- LaTeX rendering, PDF via reportlab, DOCX via python-docx

**UX wymagania:**
- Każdy krok dowodu klikalny (raise issue / annotate)
- Eksport 4 formatów: JSON + LaTeX + PDF + DOCX

**Stan:** ✅ DOCX EXPORT DOSTARCZONY 2026-05-13 (commit P0.8). `proof_inspector/exporters.py`
implementuje `export_docx()` z python-docx. 8 pakietów dowodów (SC3F, VDROP, Equipment,
PF, Losses, Protection, Earthing, LF Voltage) eksportowalne do 4 formatów:
JSON + LaTeX + PDF + DOCX (V12K-007 light_technical). VDROP + Earthing standalone packs
dostarczone 2026-05-13 (commit P0.4).

### Krok 14 — Eksport CAD/SCADA/raport

**Co robi inżynier:**
- Wybiera „Eksport" w menu głównym
- Opcje:
  - **SLD do SVG / PDF / DXF** (CAD)
  - **Pakiet projektu ZIP** (deterministyczny, archiwum)
  - **Raport końcowy PDF** (z proof pack + SLD + tabelki)
  - **Raport DOCX** (edytowalny dla projektanta)

**Co dzieje się w backendzie:**
- ZIP: `api/projects/{id}/archive` (deterministyczny)
- Raport: `api/analysis_run_exports` z formatem

**UX wymagania:**
- File dialog z opcjami (motyw light_technical dla eksportu, skala, format papieru)
- Header light_technical: nazwa projektu, case, snapshot, timestamp, paginacja
- Deterministyczny hash eksportu (SHA-256 stabilny)

**Stan:** ⚠️ Częściowe (ZIP + raport PDF działają, eksport SLD do PDF/SVG = LUKA, DXF = roadmap). Plan: F4 (SLD eksport).

---

## 3. Uproszczenia względem aktualnego flow

| Aktualnie | Docelowo | Uzasadnienie |
|-----------|----------|--------------|
| K3: zawsze pełny model 110 kV | Toggle uproszczony/zaawansowany | Dla typowego SN tylko S″k_SN wystarcza |
| K4: operator wybierany przy DerConfigurator | K1: wybór operatora na start projektu | Wymagania OSD wpływają na cały projekt |
| K7: split bez preview | Split z preview/cancel/commit | Eliminacja surprise |
| K8: 10-zakładkowy StationConfigurator | Wizard mode (3 zakładki dla typowych) | Mniejszy bagaż dla nowego użytkownika |
| K10: protection blokowany SI-100 | K11 działa do końca (Hoppel method) | Krytyczny dead-click |
| K12: overlay generic | Industrial overlay (strzałki, severity colors) | Wizualna jakość |
| K13: proof JSON+LaTeX+PDF | + DOCX | Polskie raporty |
| K14: brak SLD eksportu | SLD do PDF/SVG/DXF | Diagram istnieje poza przeglądarką |

---

## 4. Czego inżynier projektant NIE musi widzieć (programistyczne)

- `idempotency_key` — generowany automatycznie (deterministyczny)
- `ENM_OP` codes — opakowane w czytelne akcje („Dodaj stację" zamiast „create_station")
- `domain_op_response` raw — pokazywane jako readiness + fix_actions
- API endpoint paths — ukryte
- Trace JSON — dostępne w Proof Inspector, nie w głównym UI
- Snapshot hash — w nagłówku eksportu, nie w UI dialogu

---

## 5. Acceptance criteria (workflow)

- [ ] Krok 1–14 działa bez dead clicków
- [ ] Toggle „Tryb uproszczony" / „Tryb zaawansowany" w K3
- [ ] Selektor operatora na K1 (default ENEA Operator)
- [ ] Split z preview/cancel/commit w K7
- [ ] StationConfigurator wizard mode (3 zakładki) w K8
- [ ] Protection działa do końca (K11) — bez stuba SI-100
- [ ] Wyniki widoczne na SLD jako overlay (K12)
- [ ] Proof eksportuje JSON+LaTeX+PDF+DOCX (K13)
- [ ] SLD eksport do PDF/SVG (K14)
- [ ] E2E test `critical-run-flow.spec.ts` (real backend) PASS dla flow 1–14

---

**KONIEC FLOW INŻYNIERA E2E**
