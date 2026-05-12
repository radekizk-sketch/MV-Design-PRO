# Audyt jakości wizualnej SLD V2 — iteracja PR 1 (port binding + minimalny PR 2/3)

**Branch:** `claude/rebuild-sld-industrial-7bjlW`
**Data audytu:** 2026-05-12
**Zakres:** PR 1 (port binding + migracja + walidator + adapter + guard) + minimalne fragmenty PR 2 (deep link readiness → E-12 dla `topology.connection_port_missing`) + minimalne PR 3 (snapshot strukturalne testy).

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
| GPZ z TR 110/SN | 6/10 | 7/10 | 8/10 | 8/10 | n/a | TR widoczny w GpzCanonicalRenderer + GpzSwitchgearRenderer. Bilans P/Q nieobecny — pozostaje PR 3 pełne. |
| Sekcje SN GPZ | 7/10 | 8/10 | 9/10 | 9/10 | n/a | Sekcje + pola + couplery działają. |
| Stacja mini-RMU | 7/10 | 8/10 | 8/10 | 8/10 | n/a | `MiniBlockRmuRenderer` z 4 wariantami footprintu (terminal/inline/branch/sectional). Mini-pola IN/OUT/TR/DER widoczne. Mini-szyna obecna. |
| Kanon aparatów (CB/DS/ES/CT/VT/FUSE) | n/a | n/a | 9/10 | 9/10 | 9/10 | Kwadrat/kółko/romb/boczny czerwony — zgodne z goal. |
| Tor mocy (zielony/czerwony) | 7/10 | 8/10 | 8/10 | 8/10 | n/a | Paleta `overlayTypes.ts` poprawna. **`SupplyPathHighlighter` zbudowany** — BFS od źródeł przez zamknięte łączniki + transformatory; openPoints dla NMO. Integracja w `SldCanvasV2` toggle „Pokaż tor zasilania" — PR 3 pełne. |
| Połączenie kończy się w porcie | 0/10 | 0/10 | 0/10 | 0/10 | n/a | **Przed PR 1**: porty opcjonalne, brak warningu. **Po PR 1**: detekcja brakujących portów + warning marker + readiness blocker. **Cel 10/10** osiągalny dopiero po włączeniu flagi `ENM_STRICT_PORT_BINDING` (PR 1.b). |
| Klikalność elementów | 6/10 | 7/10 | 8/10 | 8/10 | n/a | Główne elementy klikalne; pełna macierz 26 typów elementów — PR 2 pełne. |
| Deep link readiness → element | 3/10 | 3/10 | 3/10 | 3/10 | n/a | E030 deep link działa; pozostałe blockery bez wzbogaconych deep linków — PR 2 pełne. |
| DER PCC visibility | 5/10 | 6/10 | 7/10 | 7/10 | n/a | Validator + renderery działają; brak dedykowanej zakładki PCC w E-21/E-22/E-23 — PR 4. |
| Manufacturer flow | 0/10 | 0/10 | 0/10 | 0/10 | n/a | Brak warstwy Manufacturer/SwitchgearFamily/CompleteMvBayTemplate — PR 5. |

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
