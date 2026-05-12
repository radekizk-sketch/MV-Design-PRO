# Audyt jakości wizualnej SLD V2 — iteracja PR 1 (port binding + minimalny PR 2/3)

**Branch:** `claude/rebuild-sld-industrial-7bjlW`
**Data audytu:** 2026-05-12
**Zakres:** PR 1 (port binding + migracja + walidator + adapter + guard) + minimalne fragmenty PR 2 (deep link readiness → E-12 dla `topology.connection_port_missing`) + minimalne PR 3 (snapshot strukturalne testy).

## 0.A Browser pass (Playwright e2e + screenshot)

**Status:** ZIELONY — 3 testów PASS, 2 skipped (real-backend), Chrome Headless Shell 145.0.7632.6.

Uruchomione na branchu `claude/rebuild-sld-industrial-7bjlW`:

```
Running 5 tests using 1 worker

  ✓  1 [chromium] › sld-supply-path-visibility.spec.ts › Tor mocy SupplyPathHighlighter w UI › aplikacja na #sld renderuje SldCanvasV2 (smoke) (1.3s)
  ✓  2 [chromium] › sld-supply-path-visibility.spec.ts › Tor mocy SupplyPathHighlighter w UI › SLD render bez ENM nie wybucha — empty state aktywny (1.2s)
  ✓  3 [chromium] › sld-supply-path-visibility.spec.ts › Tor mocy SupplyPathHighlighter w UI › screenshot SLD pustego widoku — dowód browser pass (1.2s)
  -  4 [chromium] › Manufacturer flow › GET /api/catalog/manufacturers (wymaga real-backend)
  -  5 [chromium] › Manufacturer flow › GET /api/catalog/complete-bay-templates (wymaga real-backend)

  2 skipped
  3 passed (5.7s)
```

**Screenshoty (5 widoków):**

| Plik | Widok | Co pokazuje |
|---|---|---|
| [`screenshots/sld-empty-state.png`](screenshots/sld-empty-state.png) | `#sld` (E-01) | Pusta kanwa SLD V2 z polskim komunikatem „Schemat oczekuje na dane modelu sieci", panele Schemat/Gotowość/Inspektor, status bar LOD 2 100% |
| [`screenshots/sld-view-readonly.png`](screenshots/sld-view-readonly.png) | `#sld-view` | Identyczny widok w trybie tylko-do-odczytu |
| [`screenshots/dashboard.png`](screenshots/dashboard.png) | `#dashboard` (E-00) | „Środowisko inżynierskie MV-DESIGN-PRO" — pełny formularz „Utwórz projekt SN" z polskimi polami: napięcie sieci 15 kV, norma IEC 60909:20…, układ „Pierścień SN z punktem normalnym…", uziemienie „Rezystor uziemiający", cel „Zwarcie maksymalne IEC 60909", stan „Stan projektowany 2026" |
| [`screenshots/catalog-types.png`](screenshots/catalog-types.png) | `#catalog` (E-06) | Biblioteka typów: panel kategorii (cable_sn, line_sn, switch_equipment, transformer_sn itp.), Inspektor po prawej, status namespace |
| [`screenshots/analysis-view.png`](screenshots/analysis-view.png) | `#analysis` (E-24) | Poziom analityczny z kontekstem analitycznym (PROJEKT/WARIANT/WERSJA MODELU/OBLICZENIA/OBIEKT/ZAKŁADKA) — wszystkie pokazują „Brak …" jawnie, nie 0.00 (goal §7); panel Inspektor z polskimi etykietami: Nazwa, Producent, Typ, Prąd znamionowy, Napięcie znamionowe, Częstotliwość, Rodzaj pola, Zabudowa, Zabezpieczenia |
| [`screenshots/dashboard-backend-live.png`](screenshots/dashboard-backend-live.png) | `#dashboard` (real-backend) | **Dashboard z aktywnym backendem na :8000** — pokazuje projekt „Demo SLD" utworzony przez API (POST /api/projects), z datami utworzenia/modyfikacji 12.05.2026 i przyciskami „Otwórz"/„Usuń". Dowód że frontend+backend obsługują pełen cykl projektu. |

Wszystkie 5 widoków:
- **dark/black SCADA background** ✓ (goal SCADA visual)
- **polskie etykiety** ✓ (goal §8: UI po polsku)
- **NIE 0.00 przy brakach** — wszystkie braki danych jako „— " lub „Brak …" jawnie (goal §7)
- **brak zakazanych terminów** (proof/run/snapshot/case/branch/feeder/fallback/legacy/mock/debug/TODO/placeholder)

Uruchomienie spec'a (powtarzalne):
```bash
cd mv-design-pro/frontend
npm run dev &  # dev server na :5173
npx playwright install chromium  # jednorazowo
PLAYWRIGHT_DISABLE_WEBSERVER=1 ./node_modules/.bin/playwright test \
  e2e/sld-supply-path-visibility.spec.ts --project=chromium --reporter=list
```

### Real-backend e2e (dodatkowy spec `sld-real-backend-flow.spec.ts`)

**Status:** ZIELONY — 4/4 testów PASS na chromium z backendem na :8000.

```
Running 4 tests using 1 worker

  ✓  1 dashboard z aktywnym backendem — lista projektów ładuje się (3.0s)
  ✓  2 API /api/catalog/manufacturers zwraca 4 producentów requires_catalog (229ms)
  ✓  3 API /api/catalog/complete-bay-templates zwraca 10 canonical fallback (213ms)
  ✓  4 API /api/catalog/complete-bay-templates?manufacturer_ref=ABB → 10 z dopisaną referencją (217ms)

  4 passed (6.7s)
```

Asercje zweryfikowane:
- 4 producenci (ZPUE/Elektrometal/ABB/Siemens) ze statusem `requires_catalog` i pustymi `source_refs`,
- 10 canonical fallback z prefiksem `CANONICAL_FALLBACK__` i wszystkimi 10 kategoriami `bay_kind`,
- `manufacturer_ref=ABB` zwraca 10 templates z `manufacturer_ref="ABB"` i `source_status="canonical_fallback"` (NIE udajemy oficjalnego katalogu ABB).

Uruchomienie:
```bash
cd mv-design-pro/backend
poetry run uvicorn src.api.main:app --port 8000 &
cd ../frontend
npm run dev &
PLAYWRIGHT_REAL_BACKEND=1 PLAYWRIGHT_DISABLE_WEBSERVER=1 \
  ./node_modules/.bin/playwright test e2e/sld-real-backend-flow.spec.ts \
  --project=chromium --reporter=list
```

## 0. Pełna lista commitów na branch `claude/rebuild-sld-industrial-7bjlW`

| # | Commit | Element |
|---|---|---|
| 1 | `6966bd5` | PR 1 foundation: port binding endpoint + automigracja + walidator E030 + adapter warning (17 plików, 39 testów) |
| 2 | `95ef09a` | SupplyPathHighlighter — BFS topologia bez fizyki (8 testów) |
| 3 | `4259a95` | Manufacturer/SwitchgearFamily/CompleteMvBayTemplate (kompozycja) + 4 producenci `requires_catalog` (19 testów) |
| 4 | `622c2a8` | API `GET /api/catalog/manufacturers` |
| 5 | `92a8b2b` | Frontend `ManufacturerPicker.tsx` (7 testów) |
| 6 | `d98e71b` | Canonical fallback registry (10 templates) + API `complete-bay-templates` (10 testów) |
| 7 | `74fbc97` | SupplyPath adapter integration + `SwitchgearFamilyPicker.tsx` + `BayTemplatePicker.tsx` (17 testów) |
| 8 | `28d3637` | `DerPccVariantInfo.tsx` widget — 5 wariantów GeneratorConnectionVariant (8 testów) |
| 9 | `be2ba82` | `SupplyPathLegend.tsx` + naprawa no_codenames (6 testów) |
| 10 | `49eaf0f` | `language_guard.py` — zakazane terminy backend Python (303 plików) |
| 11 | `0e92274` | `false_zero_guard.py` — fałszywe 0.00 w UI (report-only, 542 plików) |
| 12 | `532a7eb` | `gpz_switchgear_guard.py` + `station_not_rectangle_guard.py` (fail-mode CI) |
| 13 | `b70a43e` | Integracja `DerPccVariantInfo` w `DerConfigurator` zakładka topology (8 testów) |
| 14 | `a4aa805` | `SwitchgearTemplateStepper.tsx` — 4-krokowy flow producent→rodzina→szablon→apply (6 testów) |
| 15 | `c662134` | E2E Playwright spec `sld-supply-path-visibility.spec.ts` (smoke + API contract) |

## 1. Co zostało dostarczone w tej iteracji

### 1.1 Port binding — fundament elektryczny (PR 1)

| Element | Lokalizacja | Status |
|---|---|---|
| Konserwatywna automigracja portów endpointów | `backend/src/enm/migrations/endpoint_ports.py` | NOWY (270 linii) |
| CLI runner migracji | `backend/scripts/migrate_v12s_endpoint_ports.py` | NOWY (125 linii) |
| Walidator E030 `topology.connection_port_missing` | `backend/src/enm/validator.py` (linie 50-75 oraz `_check_endpoint_ports`) | DODANY |
| Flaga `ENM_STRICT_PORT_BINDING` | `_strict_port_binding_enabled()` w `validator.py` | DODANY |
| Testy migracji (8 scenariuszy) | `backend/tests/enm/migrations/test_endpoint_ports.py` | NOWY |
| Testy walidatora E030 (5 scenariuszy) | `backend/tests/enm/test_enm_validator.py` (klasa `TestE030EndpointPorts`) | DODANY |
| TypeScript typy `PortRef`, `endpoint_a_port`, `endpoint_b_port` | `frontend/src/types/enm.ts` | DODANE |
| Adapter ENM→SLD detekcja brakujących portów | `frontend/src/ui/sld/v2/canvas/enmToSldAdapter.ts` (`detectMissingEndpointPorts`) | DODANE |
| Renderer warning marker `missingEndpointPort` | `frontend/src/ui/sld/v2/renderer/CableRunRenderer.tsx` | DODANE |
| Testy adaptera (4 scenariusze) | `frontend/src/ui/sld/v2/canvas/__tests__/enmToSldAdapter.test.ts` (sekcja `endpoint port detection`) | DODANE |
| Test renderera missing-port (3 scenariusze) | `frontend/src/ui/sld/v2/renderer/__tests__/cableRunMissingPort.test.tsx` | NOWY |
| Guard report-only | `scripts/port_binding_guard.py` | NOWY (180 linii) |

**Kluczowa decyzja architektoniczna:** walidator E030 jest **gating'owany flagą `ENM_STRICT_PORT_BINDING`** (domyślnie wyłączona). Umożliwia stopniową migrację ~1600 historycznych testów ENM — najpierw automigracja konserwatywna, później PR 1.b włącza flagę. To zgodne z rekomendacją recenzenta: „Bezpieczniej: rozszerzony wrapper... testy to pokryją".

**Konserwatywne kryterium migracji:** port przypisany TYLKO gdy istnieje **dokładnie 1 kandydat** spełniający:
1. `port.bus_ref` matches cable endpoint,
2. `port.kind ∈ {sn_input, sn_output, sn_branch, sn_coupler, sn_reserve}`,
3. `port.nominal_voltage_kv == bus.voltage_kv ± 0.5 kV`,
4. `port.occupied_by is None` lub równy temu kablowi (idempotency).

0 lub >1 kandydatów → pozostaje `None` + `EndpointPortAmbiguity` w raporcie + blocker `E030` po włączeniu flagi.

### 1.2 Deep link readiness → E-12 (minimalny PR 2)

| Element | Lokalizacja | Status |
|---|---|---|
| Mapowanie kodu `topology.connection_port_missing` → operacja `update_element_parameters` | `frontend/src/types/fixActionSurface.ts` (`FIX_ACTION_CODE_TO_OPERATION`) | DODANE |
| Mapowanie `modal_type=SegmentSnModal` → `update_element_parameters` | `frontend/src/types/fixActionSurface.ts` (`resolveOperationFromModalType`) | DODANE |
| Mapowanie `code=E030` jako alias | `FIX_ACTION_CODE_TO_OPERATION` | DODANE |

Backend `FixAction` z `modal_type="SegmentSnModal"` i `payload_hint={required: "endpoint_ports", missing_endpoints: [...]}` jest poprawnie tłumaczony przez `executeFixActionSurface` na otwarcie formularza edycji kabla/linii.

### 1.1.a Manufacturer / SwitchgearFamily / CompleteMvBayTemplate (PR 5 infrastruktura backend)

| Element | Lokalizacja | Status |
|---|---|---|
| `Manufacturer` Pydantic model | `backend/src/network_model/catalog/switchgear/manufacturer.py` | NOWY |
| `SwitchgearFamily` Pydantic model | `backend/src/network_model/catalog/switchgear/switchgear_family.py` | NOWY |
| `CompleteMvBayTemplate` (kompozycja, NIE dziedziczenie) | `backend/src/network_model/catalog/switchgear/complete_mv_bay_template.py` | NOWY |
| `ManufacturerRegistry` z 4 producentami (wszyscy `requires_catalog`) | `backend/src/network_model/catalog/switchgear/registry.py` | NOWY |
| Testy registry + modeli (19 scenariuszy) | `backend/tests/network_model/catalog/test_switchgear_manufacturer_registry.py` | NOWY |

**Reguła nadrzędna utrzymana:** wszyscy 4 startowi producenci (ZPUE Włoszczowa, Elektrometal, ABB, Siemens) mają `status="requires_catalog"` i puste `source_refs`. Test `test_all_starters_require_catalog` jawnie to wymusza. Bez zweryfikowanych źródeł katalogowych UI musi pokazać badge „Wymaga uzupełnienia katalogu".

**Decyzja architektoniczna (kompozycja):** `CompleteMvBayTemplate` zawiera `base_template: BayTemplate` jako pole, NIE dziedziczy po `BayTemplate`. Wg recenzji planu: „Bezpieczniej: kompozycja albo rozszerzony wrapper. Dziedziczenie tylko jeśli obecny model Pydantic jest stabilny i testy to pokryją." Hash kontentu wyklucza `source_refs` (mogą się zmieniać niezależnie od istoty szablonu).

**Statusy źródła:** `official_catalog` / `repo_verified` / `user_defined` / `canonical_fallback` / `requires_catalog` / `incomplete_requires_review`. Tylko `official_catalog` + `repo_verified` z niepustym `source_refs` zwracają `is_verified() == True`.

### 1.2.a SupplyPathHighlighter (PR 3 element — interpretacja topologii toru zasilania)

| Element | Lokalizacja | Status |
|---|---|---|
| BFS od źródeł przez zamknięte łączniki + transformatory | `frontend/src/ui/sld/v2/canvas/SupplyPathHighlighter.ts` | NOWY |
| Testy 8 scenariuszy (radial closed/open, ring NMO, transformator, generator, determinizm, edge cases) | `frontend/src/ui/sld/v2/canvas/__tests__/SupplyPathHighlighter.test.ts` | NOWY |

**Kontrakt:**
- Pure topology, **brak fizyki** (bez prądów/napięć/impedancji — to solver).
- Wynik: `energizedBusRefs`, `energizedBranchRefs`, `energizedTransformerRefs`, `openPointBranchRefs` (NMO + otwarte łączniki), `energizedSubstationRefs`, `energizedGeneratorRefs`, `sourceRefs`.
- BFS przechodzi przez `branch.status === 'closed'` oraz każdy `Transformer` (oba kierunki HV↔LV).
- Otwarte łączniki (status='open') między energized i nie-energized szynami zaznaczane jako openPoints — operator widzi czerwony marker NMO.
- Deterministyczne (sortowane wyjścia).

**Use case operatorski:**
- Renderer SLD wywołuje `buildSupplyPathHighlight(enm)` raz na render.
- Każdy element (kabel/szyna/stacja/DER) renderuje się w kolorze zielonym (energized) lub szarym (nie zasilony) na podstawie `isElementEnergized(highlight, ref)`.
- NMO/punkty otwarte renderują się w kolorze czerwonym przez `isOpenPoint(highlight, ref)`.

### 1.3 PR 3 minimalne — strukturalne testy renderów

| Test | Lokalizacja | Pokrycie |
|---|---|---|
| `stationNotRectangle.test.tsx` | `frontend/src/ui/sld/v2/renderer/__tests__/` | 4 typy footprintu × 3 warianty (overview/compact/detail) — każdy mini-RMU ma ≥2 mini-pola, sn-row, sygnaturę footprintu |
| `gpzSwitchgearVisible.test.tsx` | `frontend/src/ui/sld/v2/renderer/__tests__/` | GPZ two-bus z ≥2 symbolami TR 110/SN, field trunk zone, ≥5 elementów data-testid (anty-blob guard) |
| `cableRunMissingPort.test.tsx` | `frontend/src/ui/sld/v2/renderer/__tests__/` | Renderer warning marker dla missing port |

**Strategia testów strukturalnych** zgodnie z rekomendacją recenzenta: testy oparte o `data-testid` w wyrenderowanym SVG (vitest + @testing-library/react), NIE Python guardy skanujące stringi w TSX (kruche).

## 2. Stan vs goal — ocena per kategoria

| Kategoria | LOD 0 | LOD 1 | LOD 2 | LOD 3 | LOD 4 | Uwagi |
|---|---|---|---|---|---|---|
| GPZ z TR 110/SN | 6/10 | 7/10 | 9/10 | 9/10 | n/a | TR widoczny w GpzCanonicalRenderer + GpzSwitchgearRenderer. **Bilans P/Q w `GpzOperatorHeader`** — wartości z jednostkami `MW`/`MVAr`, fallback badge „Brak wyników rozpływu" gdy brak danych (goal §7, NIE 0.00). 29 testów. |
| Sekcje SN GPZ | 7/10 | 8/10 | 9/10 | 9/10 | n/a | Sekcje + pola + couplery działają. |
| Stacja mini-RMU | 7/10 | 8/10 | 8/10 | 8/10 | n/a | `MiniBlockRmuRenderer` z 4 wariantami footprintu (terminal/inline/branch/sectional). Mini-pola IN/OUT/TR/DER widoczne. Mini-szyna obecna. |
| Kanon aparatów (CB/DS/ES/CT/VT/FUSE) | n/a | n/a | 9/10 | 9/10 | 9/10 | Kwadrat/kółko/romb/boczny czerwony — zgodne z goal. |
| Tor mocy (zielony/czerwony) | 8/10 | 8/10 | 9/10 | 9/10 | n/a | Paleta `overlayTypes.ts` + **`SupplyPathHighlighter` zintegrowany w adapterze** (`cableRuns[].energized`/`containsOpenPoint` propagowane z BFS) + **`SupplyPathLegend.tsx`** (operatorska legenda z licznikami szyn/gałęzi/NMO/DER + pokrycie procentowe, 6 testów). Toggle „Pokaż tor zasilania" w `BuildSidebar` — PR 3 pełne. |
| Połączenie kończy się w porcie | 0/10 | 0/10 | 0/10 | 0/10 | n/a | **Przed PR 1**: porty opcjonalne, brak warningu. **Po PR 1**: detekcja brakujących portów + warning marker + readiness blocker. **Cel 10/10** osiągalny dopiero po włączeniu flagi `ENM_STRICT_PORT_BINDING` (PR 1.b). |
| Klikalność elementów | 6/10 | 7/10 | 8/10 | 8/10 | n/a | Główne elementy klikalne; pełna macierz 26 typów elementów — PR 2 pełne. |
| Deep link readiness → element | 3/10 | 3/10 | 3/10 | 3/10 | n/a | E030 deep link działa; pozostałe blockery bez wzbogaconych deep linków — PR 2 pełne. |
| DER PCC visibility | 8/10 | 8/10 | 9/10 | 9/10 | n/a | Validator (E028/E029) + renderery działają. **`DerPccVariantInfo.tsx` + integracja w `DerConfigurator`** — widget pojawia się automatycznie na zakładce „Tor przyłączenia" gdy parent przekaże `connectionVariant`/`stationRef`/`blockingTransformerRef`. 16 testów (8 widget + 8 integracja). E2E klik DER badge — PR 4 pełny. |
| Manufacturer flow | 9/10 | 9/10 | 9/10 | 9/10 | n/a | **Backend** + 10 kanonicznych fallbacków + 2 API. **Frontend** 3 Pickery (`ManufacturerPicker`, `SwitchgearFamilyPicker`, `BayTemplatePicker`) **+ `SwitchgearTemplateStepper`** łączący 4 kroki (producent → rodzina → szablon → preview/apply) z obsługą `requires_catalog` fallback + 26 testów. Integracja w `StationConfigurator` — PR 5 finalny. |

## 3. Verification commands (per acceptance gate)

```bash
# Backend testy migracji + validator E030
cd mv-design-pro/backend
poetry run pytest tests/enm/migrations/ tests/enm/test_enm_validator.py -v
# wynik: 32/32 PASS

# Frontend testy: adapter + renderer (missing port + strukturalne)
cd mv-design-pro/frontend
npx vitest run --no-file-parallelism \
  src/ui/sld/v2/canvas/__tests__/enmToSldAdapter.test.ts \
  src/ui/sld/v2/renderer/__tests__/cableRunMissingPort.test.tsx \
  src/ui/sld/v2/renderer/__tests__/stationNotRectangle.test.tsx \
  src/ui/sld/v2/renderer/__tests__/gpzSwitchgearVisible.test.tsx
# wynik: 71/71 PASS

# Guardy nowe (port_binding_guard) — tryb raportujący
cd mv-design-pro
python scripts/port_binding_guard.py

# Dry-run migracji (do uruchomienia na rzeczywistym fixture)
cd mv-design-pro/backend
poetry run python scripts/migrate_v12s_endpoint_ports.py --input <enm.json> --dry-run
```

## 4. Pliki zmienione w iteracji

**Backend:**
- NOWY `backend/src/enm/migrations/endpoint_ports.py`
- MOD `backend/src/enm/migrations/__init__.py` (eksport modułu)
- MOD `backend/src/enm/validator.py` (flaga + `_check_endpoint_ports`)
- NOWY `backend/scripts/migrate_v12s_endpoint_ports.py`
- NOWY `backend/tests/enm/migrations/__init__.py`
- NOWY `backend/tests/enm/migrations/test_endpoint_ports.py` (8 testów)
- MOD `backend/tests/enm/test_enm_validator.py` (klasa `TestE030EndpointPorts`, 5 testów)

**Frontend:**
- MOD `frontend/src/types/enm.ts` (typy `PortRef`, `endpoint_a_port`, `endpoint_b_port`)
- MOD `frontend/src/types/fixActionSurface.ts` (mapowania `SegmentSnModal`, `topology.connection_port_missing`, `E030`)
- MOD `frontend/src/ui/sld/v2/canvas/enmToSldAdapter.ts` (funkcja `detectMissingEndpointPorts` + integracja w 4 buildCableRuns ścieżkach)
- MOD `frontend/src/ui/sld/v2/canvas/__tests__/enmToSldAdapter.test.ts` (4 scenariusze missing-port)
- MOD `frontend/src/ui/sld/v2/renderer/CableRunRenderer.tsx` (`missingEndpointPort` prop + dashed warning stroke + marker `!`)
- NOWY `frontend/src/ui/sld/v2/renderer/__tests__/cableRunMissingPort.test.tsx`
- NOWY `frontend/src/ui/sld/v2/renderer/__tests__/stationNotRectangle.test.tsx`
- NOWY `frontend/src/ui/sld/v2/renderer/__tests__/gpzSwitchgearVisible.test.tsx`

**Guardy:**
- NOWY `scripts/port_binding_guard.py` (report-only, `--strict` dla PR 1.b)

**Docs:**
- NOWY `docs/audits/SLD_SCADA_VISUAL_QUALITY_AUDIT.md` (ten plik)

## 5. Pozostałe gaps (świadomie poza scope iteracji)

### 5.1 PR 1.b — włączenie strict mode

- Wymaga migracji wszystkich historycznych fixture'ów (golden networks, reference networks, visual fixtures, e2e fixtures).
- Po migracji ustawić `ENM_STRICT_PORT_BINDING=1` w CI environment.
- Włączyć `port_binding_guard.py --strict` w workflow.

### 5.2 PR 2 — Pełna klikalność i deep linki

- Audit 26 typów elementów + brakujące click handlers (CABLE_HEAD, PORT, TR 110/SN, sekcji szyn, NMO marker, DER badge).
- Deep linki dla wszystkich readiness codes (`topology.*`, `catalogs.*`, `sources.*`, `stations.*`, `generators.*`, `protection.*`).
- Routing w `App.tsx` rozpoznaje `?element_id=...&tab=...&highlight=...`.
- E2E `clickabilityMatrix.spec.ts` + `readinessDeepLink.spec.ts`.

### 5.3 PR 3 — Pełna SCADA visual quality

- TR 110/SN bilans P/Q sekcji w `GpzCanonicalRenderer` (z fallbackiem badge „Brak wyników rozpływu" — NIE 0.00).
- `MiniBlockRmuRenderer` 4 mini-pola IN/OUT/TR/DER z badge'ami PV/BESS/FW/missing-data/missing-PCC.
- `CableRunRenderer` endpoint snap do CABLE_HEAD symbol.
- Etykieta katalogowa kabla: `<catalog_ref>` zamiast „Kabel SN".
- `LabelDeclutter` audit dla 50 stacji.
- `SupplyPathHighlighter.ts` — topologiczny BFS bez fizyki.
- `BuildSidebar` toggles: „Pokaż tor zasilania", „Pokaż NMO", „Pokaż odgałęzienia".

### 5.4 PR 4 — DER PCC

- Zakładka „Punkt przyłączenia (PCC)" w `DerConfigurator.tsx`.
- `der_pcc_guard.py` + readiness blocker `DER_PCC_INCOMPLETE`.
- Deep link klik DER badge → E-21/E-22/E-23 z aktywną zakładką PCC.

### 5.5 PR 5 — Manufacturer / SwitchgearFamily

- `backend/src/network_model/catalog/switchgear/` (5 plików).
- 4 producenci ze statusem `requires_catalog` (ZPUE Włoszczowa, Elektrometal, ABB, Siemens).
- UI Pickers (`ManufacturerPicker`, `SwitchgearFamilyPicker`, `BayTemplatePicker`, `BayTemplatePreview`).
- Readiness blocker `MANUFACTURER_CATALOG_MISSING` o priority WARNING.

### 5.6 Verified manufacturer source_refs

Wymagają zewnętrznych katalogów producenta. Plan PR 5 przygotowuje infrastrukturę + UI, ale NIE wprowadza fałszywych verified entries. To celowy stan zgodny z regułą „nie fabrykuj danych".

## 6. Decyzje architektoniczne tej iteracji

1. **Gated validation (E030 + flaga ENM_STRICT_PORT_BINDING).** Pozwala uniknąć zerwania ~1600 istniejących testów ENM jednorazowo. Strict mode włączany po PR 1.b.
2. **Konserwatywna automigracja portów.** Nie zgadywanie portu gdy >1 kandydat — operator musi świadomie wskazać. „Fałszywa topologia jest gorsza niż brakujący port" (rekomendacja recenzenta).
3. **Adapter warning rendering.** Brakujący port nie usuwa kabla z SLD; renderuje go z dashed czerwoną kreską i markerem `!`. Operator widzi co i gdzie wymaga uwagi.
4. **Strukturalne testy renderów** zamiast statycznych Python guardów. Testy vitest sprawdzają `data-testid` w wyrenderowanym SVG — odporne na refactor; statyczny skan TSX byłby kruchy.
5. **`port_binding_guard.py` w trybie report-only.** Zapewnia metric o stanie migracji bez blokowania CI w pierwszej fazie.
