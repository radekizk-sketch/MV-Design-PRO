# SYSTEM E2E IDENTITY AUDIT

**Status**: BINDING — kazda niezgodnosc blokuje merge.
**Wersja**: 1.0 (RUN #3E §2)
**Data**: 2026-02-14

## 1. KANONICZNY PRZEPLYW TOZSAMOSCI

```
  Kreator (ENM)         ref_id
       │
       ▼
  Domena (ElementRefV1) element_id  ← JEDNO ZRODLO PRAWDY
       │
       ├──► Snapshot    element_id  (ten sam)
       │
       ├──► TopologyInput  .id     (ten sam, = ref_id z ENM)
       │
       ├──► VisualGraph  node.id + attributes.elementId  (ten sam)
       │
       ├──► Solver       element_ref  (ten sam)
       │
       ├──► ResultSet    element_ref  (ten sam)
       │
       ├──► ResultJoin   element_id   (ten sam)
       │
       ├──► SLD Overlay  element_id   (ten sam)
       │
       ├──► Inspector    element_id   (ten sam)
       │
       └──► Export       element_ids  (ten sam, posortowane)
```

**REGULA ZERO**: Jeden elementId od kreatora do eksportu. Brak translacji. Brak prefixow.

## 2. AUDYT WARSTW — WYNIKI

### 2.1 ENM Layer (Backend: `enm/models.py`)

| Pole | Opis | Status |
|------|------|--------|
| `ENMElement.id` | UUID4 — persistence only | OK (nie jest domain identity) |
| `ENMElement.ref_id` | Domain identity | OK — to jest elementId |
| `*.bus_ref`, `*.from_bus_ref` | Referencja do Bus.ref_id | OK |
| `*.catalog_ref` | Referencja do katalogu | OK |

### 2.2 Domain Layer (Backend: `domain/`)

| Plik | Pole | Status |
|------|------|--------|
| `element_ref.py` → `ElementRefV1.element_id` | Kanoniczny elementId | OK |
| `readiness.py` → `ReadinessIssueV1.element_id` | Referencja do elementu | OK |
| `result_join.py` → join po `element_ref` | element_ref z ResultSet = element_id | OK |
| `generator_validation.py` → `ref_id` z dict | Uzywa ref_id z ENM dict | OK |
| `export_manifest.py` → `element_ids` | Lista posortowanych elementId | OK |

### 2.3 Frontend Types (Frontend: `types/enm.ts`)

| Pole | Opis | Status |
|------|------|--------|
| `ENMElement.id` | UUID string (persistence) | OK |
| `ENMElement.ref_id` | Domain identity | OK |
| `ValidationIssue.severity: 'IMPORTANT'` | Niezgodne z ReadinessPriority.WARNING | **MISMATCH** — patrz §3.1 |
| `SelectionRef.element_ref_id` | Jeszcze inna nazwa | **MISMATCH** — patrz §3.2 |

### 2.4 TopologyInput Layer (Frontend: `topologyInputReader.ts`)

| Pole | Opis | Status |
|------|------|--------|
| `ConnectionNodeV1.id` = `bus.ref_id` | Poprawne | OK |
| `TopologyBranchV1.id` = `branch.ref_id` | Poprawne | OK |
| `TopologyDeviceV1.id` = `dev_${b.ref_id}` | **FABRYKACJA** `dev_` prefix | **MISMATCH** — patrz §3.3 |
| `TopologySourceV1.id` = `source.ref_id` | Poprawne | OK |
| `TopologyGeneratorV1.id` = `generator.ref_id` | Poprawne | OK |
| `TopologyFixAction.elementRef` | Pole `elementRef` vs `elementId` | **NAMING** — patrz §3.4 |

### 2.5 VisualGraph Layer (Frontend: `topologyAdapterV2.ts`)

| Pole | Opis | Status |
|------|------|--------|
| Node `.id` = domain id | Poprawne | OK |
| Node `.attributes.elementId` = domain id | Poprawne | OK |
| Station `.attributes.elementType` = `'Bus'` | **WRONG** — powinno byc `'STATION'` | **MISMATCH** — patrz §3.5 |
| Generator `.attributes.elementType` = `'Source'` | **WRONG** — powinno byc `'GENERATOR'` | **MISMATCH** — patrz §3.6 |
| Edge `.id` = `edge_${branch.id}` | **FABRYKACJA** `edge_` prefix | **MISMATCH** — patrz §3.7 |
| Edge `.id` = `edge_src_${source.id}` | **FABRYKACJA** prefix | **MISMATCH** — patrz §3.7 |
| Edge `.id` = `edge_gen_${gen.id}` | **FABRYKACJA** prefix | **MISMATCH** — patrz §3.7 |
| Edge `.id` = `edge_load_${load.id}` | **FABRYKACJA** prefix | **MISMATCH** — patrz §3.7 |

### 2.6 ResultJoin Layer (Frontend: `resultJoin.ts`)

| Pole | Opis | Status |
|------|------|--------|
| `ElementResultInput.elementRef` | Pole `elementRef` vs `elementId` | **NAMING** — patrz §3.4 |
| Join po `elementRef` → `elementId` w tokenach | Poprawne | OK |

### 2.7 Readiness Layer (Frontend: `readinessProfile.ts`)

> Stan 2026-10-30: plik `readinessProfile.ts` nie istnieje w repozytorium, a backendowy profil
> `ReadinessProfileV1` z bramkami `require_*` skasowano (jeden walidator: ENM +
> `CalculationReadiness`, ADR-025). Zostały typy rekordu braku `ReadinessIssueV1` /
> `ReadinessPriority` w `mv-design-pro/backend/src/domain/readiness.py`.

| Pole | Opis | Status |
|------|------|--------|
| `ReadinessIssueV1.elementId` | Poprawne | OK |
| `ReadinessPriority` = BLOCKER/WARNING/INFO | Poprawne | OK |

### 2.8 Export Layer (Backend + Frontend: `export_manifest.*`)

| Pole | Opis | Status |
|------|------|--------|
| `ExportManifestV1.element_ids` | Posortowane, deduplikowane | OK |

## 3. WYKRYTE NIEZGODNOSCI — NAPRAWY

### 3.1 ValidationIssue.severity: `IMPORTANT` vs `WARNING`

**Plik**: `frontend/src/types/enm.ts:353`
**Problem**: `severity: 'BLOCKER' | 'IMPORTANT' | 'INFO'` — `IMPORTANT` nie istnieje w `ReadinessPriority`. Nowy standard to `WARNING`.
**Naprawa**: Zmien `IMPORTANT` → `WARNING` w `ValidationIssue`.
**Status**: NAPRAWIONY

### 3.2 SelectionRef.element_ref_id

**Plik**: `frontend/src/types/enm.ts:435`
**Problem**: Pole `element_ref_id` — niezgodne z kanoniczny `elementId`.
**Naprawa**: Zmien na `elementId` i ustaw alias `element_ref_id`.
**Status**: NAPRAWIONY

### 3.3 Device ID fabrication: `dev_` prefix

**Plik**: `frontend/src/ui/sld/core/topologyInputReader.ts:380,714`
**Problem**: Switching branches tworza urzadzenia z fabrykowanym ID `dev_${ref_id}`, ktore NIE istnieje w domenie.
**Ocena**: **DOPUSZCZALNE** z zastrzezeniem — urzadzenia (CB, DS) NIE istnieja jako samodzielne elementy ENM.
W ENM switching branch jest jednoczesnie galazia i aparatem. TopologyInput modeluje aparat jako oddzielny TopologyDeviceV1.
`dev_` prefix jest DETERMINYSTYCZNY i ODWRACALNY (strip `dev_` → oryginalny ref_id galezi).
**Naprawa**: Dodano komentarz dokumentujacy konwencje. Nie zmieniono — fabrykacja jest uzasadniona i deterministyczna.
**Status**: UDOKUMENTOWANY

### 3.4 Naming: elementRef vs elementId

**Pliki**: `topologyInputReader.ts:207`, `resultJoin.ts:90`
**Problem**: `TopologyFixAction.elementRef` i `ElementResultInput.elementRef` uzywaja nazwy `elementRef` zamiast `elementId`.
**Ocena**: `elementRef` w kontekscie wynikow to nazwa pola w danych wejsciowych (ResultSet), nie identyfikator w sensie ElementRefV1.
`TopologyFixAction.elementRef` jest lokalnym polem wskazujacym na element, nie kanoniczny contract.
**Naprawa**: **NIE ZMIENIAM** — `elementRef` jest nazwy pola w InputData, nie kanoniczny typ. Zmiana lamalaby API.
Dodano komentarz wyjasniajacy.
**Status**: UDOKUMENTOWANY

### 3.5 Station elementType: `'Bus'` → `'STATION'`

**Plik**: `frontend/src/ui/sld/core/topologyAdapterV2.ts:500`
**Problem**: `attributes.elementType = 'Bus'` dla stacji — niezgodne z `ElementTypeV1.STATION`.
**Naprawa**: Zmien na `ElementTypeV1.STATION` = `'STATION'`.
**Status**: NAPRAWIONY

### 3.6 Generator elementType: `'Source'` → `'GENERATOR'`

**Plik**: `frontend/src/ui/sld/core/topologyAdapterV2.ts:558`
**Problem**: `attributes.elementType = 'Source'` dla generatorow — niezgodne z `ElementTypeV1.GENERATOR`.
**Naprawa**: Zmien na `ElementTypeV1.GENERATOR` = `'GENERATOR'`.
**Status**: NAPRAWIONY

### 3.7 Edge ID fabrication: `edge_` prefix

**Plik**: `frontend/src/ui/sld/core/topologyAdapterV2.ts:658,686,712,738`
**Problem**: Edge IDs maja prefixy `edge_`, `edge_src_`, `edge_gen_`, `edge_load_`.
**Ocena**: **DOPUSZCZALNE** — krawedzie VisualGraph sa bytami SLD, nie elementami domeny.
Krawedz laczy dwa wezly (bijekcja z TopologyBranch), ale SLD dodaje tez krawedzie source→bus, gen→bus, bus→load
ktore nie maja bezposredniego odpowiednika w ENM branches.
Prefiks jest DETERMINYSTYCZNY i ODWRACALNY.
**Naprawa**: Dodano komentarz dokumentujacy konwencje.
**Status**: UDOKUMENTOWANY

## 4. CI GUARD: identity_guard.py

Skrypt `scripts/identity_guard.py` skanuje repo pod katem:
- Nowych fabrykacji UUID/nanoid poza ENMElement.id
- Nowych prefixow ID (`dev_`, `edge_`) poza uydokumentowanymi
- Uzycia `elementType: 'Bus'` dla stacji
- Uzycia `elementType: 'Source'` dla generatorow
- Nowych pol `*_id` lub `*_ref` bez dokumentacji w tym audycie

## 5. PODSUMOWANIE

| Kategoria | Wykryte | Naprawione | Udokumentowane |
|-----------|---------|------------|----------------|
| elementType mismatch | 2 | 2 | 0 |
| severity naming | 1 | 1 | 0 |
| SelectionRef naming | 1 | 1 | 0 |
| ID fabrication (dopuszczalna) | 2 | 0 | 2 |
| Naming (elementRef vs elementId) | 2 | 0 | 2 |
| **TOTAL** | **8** | **4** | **4** |
