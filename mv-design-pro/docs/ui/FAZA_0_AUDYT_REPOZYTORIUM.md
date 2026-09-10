# Faza 0 — Audyt repozytorium przed zmianami kodu

| Pole              | Wartosc                                          |
|-------------------|--------------------------------------------------|
| Status            | **BINDING**                                      |
| Wersja            | 1.0                                              |
| Data              | 2026-02-20                                       |
| Cel               | Mapa plikow, flow map, identyfikacja luk katalogowych |

---

## 1. Mapa plikow — klucze komponentu systemu

### 1.1 Snapshot (definicja, hash, serializacja)

| Plik | Klasa/Funkcja | Opis |
|------|---------------|------|
| `backend/src/network_model/core/snapshot.py:167` | `NetworkSnapshot` (frozen dataclass) | Niemutowalny zrzut grafu sieci |
| `backend/src/network_model/core/snapshot.py:104` | `SnapshotMeta` (frozen dataclass) | Metadane: snapshot_id, parent, fingerprint |
| `backend/src/network_model/core/snapshot.py:48` | `compute_fingerprint(data)` | SHA-256 z kanonicznego JSON (sortowane klucze, 10 miejsc po przecinku) |
| `backend/src/network_model/core/snapshot.py:79` | `SnapshotReadOnlyGuard` | Wykrywa mutacje in-place (porownanie fingerprint przed/po) |
| `backend/src/infrastructure/persistence/repositories/snapshot_repository.py` | `SnapshotRepository` | Persystencja: add/get/lineage/fingerprint |

### 1.2 Operacje domenowe (rejestr kanoniczny)

| Plik | Klasa/Funkcja | Opis |
|------|---------------|------|
| `backend/src/domain/canonical_operations.py:48` | `CANONICAL_OPERATIONS` (dict 39 operacji) | JEDYNE ZRODLO PRAWDY nazw operacji |
| `backend/src/domain/canonical_operations.py:34` | `OperationSpec` (frozen dataclass) | Specyfikacja operacji: kategoria, required/optional fields |
| `backend/src/domain/canonical_operations.py:388` | `ALIAS_MAP` | Mapowanie aliasow na nazwy kanoniczne |
| `backend/src/domain/canonical_operations.py:405` | `resolve_operation_name()` | Rozwiaz alias do nazwy kanonicznej |
| `backend/src/domain/canonical_operations.py:449` | `READINESS_CODES` (40+ kodow) | Kody gotowosci po polsku z nawigacja naprawcza (`fix_action_id` usuniety 2026-09-05, karta FIX-ACTION-KASACJA, REJESTR_KONFLIKTOW.md V12K-338) |

### 1.3 Operacje ENM (V1 — budowa sieci)

| Plik | Funkcja | Opis |
|------|---------|------|
| `backend/src/enm/domain_operations.py:570` | `add_grid_source_sn()` | Dodaj GPZ (1 na model) |
| `backend/src/enm/domain_operations.py:691` | `continue_trunk_segment_sn()` | Kontynuuj magistrale SN |
| `backend/src/enm/domain_operations.py:824` | `insert_station_on_segment_sn()` | Wstaw stacje na segmencie |
| `backend/src/enm/domain_operations.py` | `start_branch_segment_sn()` | Rozpocznij odgalezienie |
| `backend/src/enm/domain_operations.py` | `insert_section_switch_sn()` | Wstaw lacznik sekcyjny |
| `backend/src/enm/domain_operations.py` | `connect_secondary_ring_sn()` | Zamknij pierscien wtorny |
| `backend/src/enm/domain_operations.py` | `set_normal_open_point()` | Ustaw NOP |
| `backend/src/enm/domain_operations_v2.py` | Operacje V2 (protection, TCC) | Ochrona nadpradowa, krzywe TCC |

### 1.4 Endpoint API — punkt wejscia operacji

| Plik | Endpoint | Opis |
|------|----------|------|
| `backend/src/api/domain_operations.py:109` | `POST /api/v1/domain-ops/execute` | Jedyny punkt wejscia |
| `backend/src/api/domain_operations.py:45` | `DomainOperationRequest` | Request: operation, payload, meta |
| `backend/src/api/domain_operations.py:63` | `DomainOperationResponse` | Response: status, snapshot_id, readiness, fix_actions, changes |
| `backend/src/api/domain_operations.py:281` | `_CATALOG_REQUIRED_OPERATIONS` | frozenset 12 operacji wymagajacych katalogu |
| `backend/src/api/domain_operations.py:297` | `_enforce_catalog_binding()` | Walidacja wiazania katalogowego (422 HTTP) |
| `backend/src/api/domain_operations.py:344` | `_infer_namespace()` | Mapowanie operacja → namespace katalogu |

### 1.5 Pipeline SLD (frontend)

| Plik | Klasa/Funkcja | Opis |
|------|---------------|------|
| `frontend/src/ui/sld/core/topologyAdapterV2.ts` | TopologyAdapterV2 | ENM → VisualGraph (konwersja topologii) |
| `frontend/src/ui/sld/core/layoutPipeline.ts` | LayoutPipeline | 7-fazowy pipeline: pasma, kolumny, wspolrzedne, routing |
| `frontend/src/ui/sld/core/stationBlockBuilder.ts` | StationBlockBuilder | Budowa blokow stacji (pola SN + nN + transformator) |
| `frontend/src/ui/sld/core/visualGraph.ts` | VisualGraph | Deterministyczny graf wizualny SLD |
| `frontend/src/ui/sld/core/switchgearConfig.ts` | SwitchgearConfig | Konfiguracja rozdzielni (pola aparatowe) |
| `frontend/src/engine/sld-layout/` | SLD Layout Engine | Silnik ukladu — 7 faz deterministycznych |

### 1.6 Katalog (Type Library)

| Plik | Klasa/Funkcja | Opis |
|------|---------------|------|
| `backend/src/network_model/catalog/types.py` | `CatalogBinding` | Struktura wiazania: namespace, item_id, version |
| `backend/src/network_model/catalog/repository.py` | `get_default_mv_catalog()` | Fabryka domyslnego katalogu |
| `backend/src/network_model/catalog/materialization.py` | `materialize_catalog_binding()` | Materializacja: binding → solver_fields |
| `backend/src/network_model/catalog/materialization.py` | `validate_catalog_binding()` | Walidacja kompletnosci wiazania |
| `backend/src/network_model/catalog/readiness_checker.py` | `check_snapshot_readiness()` | Sprawdzenie gotowosci snapshot |

### 1.7 Gotowosc i dzialania naprawcze

| Plik | Klasa/Funkcja | Opis |
|------|---------------|------|
| `backend/src/domain/canonical_operations.py:420` | `ReadinessLevel` (enum) | BLOCKER, WARNING, INFO |
| `backend/src/domain/canonical_operations.py:436` | `ReadinessCodeSpec` | Kod: area, priority, level, message_pl, fix_navigation (`fix_action_id` usuniety 2026-09-05, karta FIX-ACTION-KASACJA, REJESTR_KONFLIKTOW.md V12K-338) |
| `backend/src/domain/canonical_operations.py:449` | `READINESS_CODES` | 40+ kodow: trunk.catalog_missing, transformer.catalog_missing, ... |
| `backend/src/enm/domain_operations.py:156` | `_build_readiness()` | Oblicza gotowosc + fix_actions z ENMValidator |
| `backend/src/enm/validator.py` | `ENMValidator` | Walidator ENM (issues + readiness) |

### 1.8 Menu kontekstowe (frontend)

| Plik | Klasa/Funkcja | Opis |
|------|---------------|------|
| `frontend/src/ui/context-menu/EngineeringContextMenu.tsx` | `EngineeringContextMenu` | Centralny komponent menu kontekstowego SLD |
| `frontend/src/ui/context-menu/actionMenuBuilders.ts` | 25+ builderow (A-AZ) | Budowanie menu per typ elementu (100% PL) |
| `frontend/src/ui/context-menu/actions.ts` | `buildContextMenuActions()` | Bazowe menu (wlasciwosci, typ, usun) |
| `frontend/src/ui/context-menu/__tests__/` | 4 pliki testowe | Testy menu kontekstowego |

### 1.9 Testy i strazniki CI

| Plik | Opis |
|------|------|
| `backend/tests/` | ~241 plikow, 1600+ testow |
| `frontend/src/**/__tests__/` | ~138 plikow testowych |
| `scripts/pcc_zero_guard.py` | grep-zero PCC w calym repo |
| `scripts/no_codenames_guard.py` | Blokowanie kodow projektowych w UI |
| `scripts/arch_guard.py` | Granice warstw architektonicznych |
| `scripts/solver_boundary_guard.py` | Izolacja warstwy solverow |
| `scripts/domain_no_guessing_guard.py` | Brak zgadywania w domenach |
| `scripts/canonical_ops_guard.py` | Zgodnosc operacji z rejestrem |
| `scripts/sld_determinism_guards.py` | Determinizm renderingu SLD |
| `.github/workflows/python-tests.yml` | Backend testy + strazniki |
| `.github/workflows/frontend-checks.yml` | Frontend testy + strazniki |
| `.github/workflows/sld-determinism.yml` | Testy kontraktow SLD |
| `.github/workflows/docs-guard.yml` | Integralnosc dokumentacji |

---

## 2. Flow Map — od klikniecia do SLD

```
Klikniecie uzytkownika na SLD (prawy przycisk)
    |
    v
EngineeringContextMenu.tsx:132
    resolveElementType → BUILDER_REGISTRY[elementType]
    |
    v
actionMenuBuilders.ts (np. buildSegmentSNContextMenu)
    generuje liste akcji 100% PL
    |
    v
onOperation(operationId, elementId, elementType)
    |
    v
[FRONTEND] POST /api/v1/domain-ops/execute
    DomainOperationRequest { operation, payload, meta }
    |
    v
[BACKEND] api/domain_operations.py:109
    1. resolve_operation_name(request.operation)
    2. validate_operation_payload(resolved_name, payload)
    3. _enforce_catalog_binding(resolved_name, payload) ← BRAMA KATALOGOWA
       → 422 jesli brak catalog_binding dla operacji z _CATALOG_REQUIRED_OPERATIONS
    4. materialize_catalog_binding(binding, catalog)
    |
    v
[BACKEND] enm/domain_operations.py
    Funkcja operacji (np. continue_trunk_segment_sn)
    1. Walidacja wejscia
    2. _compute_seed({...}) → deterministyczny hash
    3. _make_id(prefix, seed, local_path) → element_id
    4. Mutacja kopii ENM (copy.deepcopy)
    5. _response(enm) → pelna odpowiedz
    |
    v
[BACKEND] _response() buduje:
    1. snapshot (nowy stan ENM)
    2. logical_views (_compute_logical_views)
    3. readiness + fix_actions (_build_readiness via ENMValidator)
    4. materialized_params (_compute_materialized_params)
    5. layout_hash (_compute_layout_hash → SHA-256)
    6. changes, selection_hint, audit_trail, domain_events
    |
    v
[FRONTEND] Odebrano DomainOperationResponse
    |
    v
SLD Pipeline (deterministyczny):
    1. topologyAdapterV2 — ENM snapshot → VisualGraph
    2. layoutPipeline — 7 faz (pasma, kolumny, pozycjonowanie, routing)
    3. stationBlockBuilder — bloki stacji
    4. Render na canvas/SVG
    |
    v
Aktualizacja paneli:
    - Readiness panel (kody gotowosci)
    - Fix actions (dzialania naprawcze z nawigacja)
    - Inspector (wlasciwosci elementu)
    - Selection highlight
```

---

## 3. Identyfikacja luk bramki katalogowej (CATALOG GATE GAPS)

### LUKA 1: Warstwa ENM pozwala na tworzenie segmentow bez catalog_ref

**Plik**: `enm/domain_operations.py:725-780`
**Operacja**: `continue_trunk_segment_sn`

```python
# Linia 725 — catalog_ref jest OPCJONALNY
catalog_ref = segment.get("catalog_ref")

# Linia 779 — ustawiany TYLKO jesli podany
if catalog_ref:
    branch_data["catalog_ref"] = catalog_ref
```

**Skutek**: Segment tworzony z `r_ohm_per_km: 0.0, x_ohm_per_km: 0.0` — puste parametry fizyczne.
Readiness wykryje brak (kod `trunk.catalog_missing`), ale element JUZ ISTNIEJE w modelu.

### LUKA 2: Transformator w insert_station_on_segment_sn bez katalogu

**Plik**: `enm/domain_operations.py:1110-1125`
**Operacja**: `insert_station_on_segment_sn`

```python
# Linia 1111 — catalog OPCJONALNY
tr_catalog = transformer.get("transformer_catalog_ref")

# Linia 1118-1121 — PLACEHOLDER wartosci!
"sn_mva": 0.001,       # ← placeholder, nie prawdziwa moc
"uk_percent": 0.01,     # ← placeholder, nie prawdziwe uk%
"pk_kw": 0.0,

# Linia 1124-1125 — ustawiany TYLKO jesli podany
if tr_catalog:
    tr_data["catalog_ref"] = tr_catalog
```

**Skutek**: Transformator tworzony z FIKCYJNYMI parametrami (sn_mva=0.001, uk%=0.01).
Readiness wykryje brak (kod `transformer.catalog_missing`), ale element JUZ ISTNIEJE.

### LUKA 3: Warstwa API wymusza katalog, ale warstwa ENM NIE

**Plik API**: `api/domain_operations.py:281-294`
```python
_CATALOG_REQUIRED_OPERATIONS: frozenset = frozenset({
    "continue_trunk_segment_sn",
    "start_branch_segment_sn",
    "insert_station_on_segment_sn",
    "add_transformer_sn_nn",
    ...
})
```

**Problem**: Brama katalogowa istnieje na warstwie API (422 HTTP), ale warstwa ENM
(`enm/domain_operations.py`) traktuje catalog_ref jako opcjonalny. Jesli operacja
zostanie wywolana z pominieciem warstwy API (np. batch, wizard session, import),
element zostanie utworzony BEZ katalogu.

### LUKA 4: Menu kontekstowe UI nie wymusza katalogu PRZED operacja

**Plik**: `frontend/src/ui/context-menu/actionMenuBuilders.ts`

- `buildBusSNContextMenu`: opcja `'add_line'` (linia 86) — handler `onAddLine` bez bramy
- `buildStationContextMenu`: opcja `'add_transformer'` (linia 142) — handler `onAddTransformer` bez bramy
- `buildTerminalSNContextMenu`: opcja `'add_trunk_segment'` (linia 899) — handler bez bramy

**Problem**: Handler UI wysyla operacje BEZ uprzedniego wyswietlenia CatalogPicker.
Backend odrzuci (422), ale UX jest zly — uzytkownik powinien wybrac katalog PRZED wyslaniem.

### LUKA 5: Brak blokady tworzenia elementow podczas importu bez mapowania katalogowego

Nie znaleziono dedykowanego stanu `MAPOWANIE_KATALOGOWE_WYMAGANE` w istniejacym kodzie.
Import nie blokuje dalszego tworzenia elementow bez przypisania katalogu.

---

## 4. Istniejace dokumenty UX (31 plikow)

```
docs/ui/
├── BATCH_COMPARE_DELTA_OVERLAY_CONTRACT.md
├── BRAKI_DANYCH_FIXACTIONS.md
├── CASE_COMPARISON_UI_CONTRACT.md
├── CATALOG_BROWSER_CONTRACT.md
├── ELEMENT_INSPECTOR_CONTRACT.md
├── EXPERT_MODES_CONTRACT.md
├── GLOBAL_CONTEXT_BAR.md
├── KANON_KREATOR_SN_NN_NA_ZYWO.md        ← kluczowy: budowa na zywo
├── KATALOG_WIAZANIE_I_MATERIALIZACJA.md   ← kluczowy: wiazanie katalogowe
├── KONTRAKT_OPERACJI_ENM_OP.md
├── MACIERZ_OKIEN_DIALOGOWYCH_I_AKCJI.md
├── PDF_REPORT_SUPERIOR_CONTRACT.md
├── PROTECTION_CURVES_IT_SUPERIOR_CONTRACT.md
├── PROTECTION_ELEMENT_ASSIGNMENT_CONTRACT.md
├── PROTECTION_INSIGHT_CONTRACT.md
├── RESULTS_BROWSER_CONTRACT.md
├── SC_NODE_RESULTS_CONTRACT.md
├── SHORT_CIRCUIT_PANELS_AND_PRINTING.md
├── SLD_RENDER_LAYERS_CONTRACT.md
├── SLD_SCADA_CAD_CONTRACT.md
├── SLD_SHORT_CIRCUIT_BUS_CENTRIC.md
├── SLD_UI_CONTRACT.md
├── SWITCHING_STATE_EXPLORER_CONTRACT.md
├── TOPOLOGY_TREE_CONTRACT.md
├── UI_CANONICAL_PARITY_MATRIX.md
├── UI_UX_10_10_ABSOLUTE_CANONICAL.md
├── URUCHOMIENIE_UX_SLD.md
├── VOLTAGE_PROFILE_BUS_CONTRACT.md
├── ui_canonical_parity.md
├── sld_rules.md
└── wizard_screens.md
```

---

## 5. Podsumowanie — co wymaga naprawy

| # | Luka | Priorytet | Naprawa |
|---|------|-----------|---------|
| 1 | ENM: segment bez catalog_ref | KRYTYCZNY | Dodac walidacje BLOKUJACA w enm/domain_operations.py |
| 2 | ENM: transformator z placeholder | KRYTYCZNY | Dodac walidacje BLOKUJACA w enm/domain_operations.py |
| 3 | Niespojna brama: API vs ENM | KRYTYCZNY | Ujednolicic — brama musi byc NA OBU WARSTWACH |
| 4 | UI: brak CatalogPicker przed operacja | WAZNY | Frontend: wyswietlac CatalogPicker PRZED wyslaniem operacji |
| 5 | Import: brak stanu mapowania | WAZNY | Dodac stan MAPOWANIE_KATALOGOWE_WYMAGANE i blokowac tworzenie |

---

*Dokument wygenerowany automatycznie w ramach Fazy 0 audytu.*
