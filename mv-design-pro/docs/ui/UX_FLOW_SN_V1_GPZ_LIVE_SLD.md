# UX FLOW SN V1 — GPZ LIVE SLD

> Dokument wiążący: definiuje pełny flow UX od GPZ do analizy z live SLD.
> Patrz też: `KANON_KREATOR_SN_NN_NA_ZYWO.md` (szczegóły kreatora).

## 1. DEFINICJE

| Termin | Znaczenie |
|--------|-----------|
| GPZ | Główny Punkt Zasilający (źródło SN) |
| Live SLD | Schemat SLD aktualizowany po każdej operacji domenowej |
| Snapshot | Pełny stan sieci ENM (dict/JSON) |
| Operacja domenowa | Jedna z 11 kanonicznych operacji V1 |
| Readiness | System gotowości E001–E010 |
| FixAction | Akcja naprawcza z nawigacją do UI |

## 2. KANON NAZW OPERACJI

| # | Operacja | Klik użytkownika |
|---|----------|-----------------|
| 1 | `add_grid_source_sn` | "Dodaj GPZ" |
| 2 | `continue_trunk_segment_sn` | "Kontynuuj magistralę" |
| 3 | `insert_station_on_segment_sn` | "Wstaw stację" |
| 4 | `start_branch_segment_sn` | "Odgałęzienie" |
| 5 | `insert_section_switch_sn` | "Wstaw łącznik" |
| 6 | `connect_secondary_ring_sn` | "Połącz ring" |
| 7 | `set_normal_open_point` | "Ustaw NOP" |
| 8 | `add_transformer_sn_nn` | "Dodaj trafo" |
| 9 | `assign_catalog_to_element` | "Przypisz katalog" |
| 10 | `update_element_parameters` | "Edytuj parametry" |
| 11 | `refresh_snapshot` | automatycznie |

## 3. SEKWENCJA V1 (KLIK PO KLIKU)

```
Krok 1: add_grid_source_sn
   → GPZ pojawia się na SLD (szyna 15 kV + źródło)
   → Readiness: E008 jeśli brak Sk3

Krok 2–N: continue_trunk_segment_sn
   → Kolejne odcinki magistrali (KABEL/LINIA)
   → Wymaga catalog_ref (bramka katalogowa)
   → SLD rośnie w prawo (równe odstępy)

Krok M: insert_station_on_segment_sn
   → insert_at: {mode: "RATIO", value: 0.5}
   → Stacja typu B/C/D wstawiona w odcinek
   → SLD: nowa szyna + trafo (opcjonalnie)
   → Readiness: E006 jeśli trafo bez uk%

Krok M+1: start_branch_segment_sn
   → Odgałęzienie od portu stacji
   → Wymaga catalog_ref

Krok M+2: connect_secondary_ring_sn
   → Połączenie dwóch szyn (ring wtórny)
   → Wymaga catalog_ref
   → SLD: linia przerywana na Y_RING

Krok M+3: set_normal_open_point
   → NOP na łączniku w ringu
   → SLD: symbol otwartego łącznika

Krok K: assign_catalog_to_element
   → Przypisanie z katalogu → materializacja parametrów
   → Readiness E009 znika
```

## 4. WALIDACJE

### 4.1 Bramka katalogowa (Double Gate)

**Backend**: operacje `continue_trunk_segment_sn`, `start_branch_segment_sn`, `connect_secondary_ring_sn` wymagają `catalog_ref`. Brak → `error_code: "catalog.ref_required"`.

**Frontend**: context menu sprawdza potrzebę katalogu przed emisją operacji.

### 4.2 Readiness E001–E010

Każda operacja zwraca `readiness` w odpowiedzi:
- `ready: true` → analizy dostępne
- `ready: false` → lista `blockers[]` z `fix_actions[]`

### 4.3 PV/BESS Gate

Generatory PV i BESS wymagają transformatora w stacji (`transformer_required`).

## 5. LIVE SLD — PĘTLA RENDERINGU

```
Użytkownik klika akcję
    ↓
Frontend wysyła POST /api/enm/domain-ops {op, payload}
    ↓
Backend: execute_domain_operation(snapshot, op, payload)
    ↓
Odpowiedź: {snapshot, logical_views, readiness, fix_actions, layout}
    ↓
Frontend: store.setSnapshot(response.snapshot)
    ↓
SLD Pipeline (6 faz):
  1. Voltage Bands (dynamiczne z modelu)
  2. Bay Detection (z topologii)
  3. Crossing Minimization (Sugiyama)
  4. Coordinate Assignment (snap to grid)
  5. Edge Routing (orthogonal)
  6. Hash + Invariants (SHA-256)
    ↓
Canvas rerenders (< 16ms target)
```

## 6. KANONIZACJA

### 6.1 Determinizm

- Ten sam Snapshot → identyczny piksel SLD
- Layout hash (SHA-256) stabilny przy permutacji elementów
- 50× test permutacyjny w CI

### 6.2 Estetyka przemysłowa

- Siatka: GRID_BASE = 20px
- Magistrala: Y_MAIN = 400px
- Ring: Y_RING = 320px (4×GRID_BASE nad magistralą)
- Odgałęzienia: Y_BRANCH = 480px
- Równy rozstaw stacji: GRID_SPACING_MAIN = 280px
- Grubość szyny: 3px (dominująca)
- Kolory napięciowe: benchmark/benchmark/Monochrome presets
- Polskie etykiety: "15 kV", "0,4 kV"

### 6.3 Layout Config Presets

| Preset | Użycie |
|--------|--------|
| `DEFAULT_LAYOUT_CONFIG` | Domyślny (benchmark-grade) |
| `INDUSTRIAL_LAYOUT_CONFIG` | Estetyka przemysłowa DIgSILENT/ABB |

## 7. KONTRAKT SLD ↔ ENM

| Pole odpowiedzi | Konsument SLD |
|-----------------|---------------|
| `snapshot.buses[]` | Szyny (pozycja, napięcie, kolor) |
| `snapshot.branches[]` | Kable/linie (routing) |
| `snapshot.transformers[]` | Symbole trafo |
| `snapshot.sources[]` | Symbol źródła |
| `snapshot.substations[]` | Grupy stacji (bay detection) |
| `logical_views.trunks[]` | Magistrala (kolejność) |
| `logical_views.branches[]` | Odgałęzienia |
| `logical_views.secondary_connectors[]` | Ringi |
| `layout.layout_hash` | Hash deterministyczny |

## 8. TESTY

| Test | Plik | Co weryfikuje |
|------|------|---------------|
| Estetyka przemysłowa | `sld/__tests__/industrialAesthetics.test.ts` | Grid, kanały Y, rozstaw, 50× permutacje |
| Layout pipeline | `sld/core/__tests__/layoutPipeline.test.ts` | 6 faz, GN-SLD-01–04 |
| Config hash | `sld/core/__tests__/switchgearConfig.test.ts` | SHA-256 stabilność, 100× |
| Voltage bands | `sld-layout/__tests__/voltage-bands.test.ts` | Dynamiczne pasma |
| Determinism | `sld/core/__tests__/determinism.test.ts` | Pixel-perfect powtarzalność |

