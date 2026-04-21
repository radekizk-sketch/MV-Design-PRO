# UX FLOW SN V1 â€” GPZ LIVE SLD

> Dokument wiÄ…ĹĽÄ…cy: definiuje peĹ‚ny flow UX od GPZ do analizy z live SLD.
> Patrz teĹĽ: `KANON_KREATOR_SN_NN_NA_ZYWO.md` (szczegĂłĹ‚y kreatora).

## 1. DEFINICJE

| Termin | Znaczenie |
|--------|-----------|
| GPZ | GĹ‚Ăłwny Punkt ZasilajÄ…cy (ĹşrĂłdĹ‚o SN) |
| Live SLD | Schemat SLD aktualizowany po kaĹĽdej operacji domenowej |
| Snapshot | PeĹ‚ny stan sieci ENM (dict/JSON) |
| Operacja domenowa | Jedna z 11 kanonicznych operacji V1 |
| Readiness | System gotowoĹ›ci E001â€“E010 |
| FixAction | Akcja naprawcza z nawigacjÄ… do UI |

## 2. KANON NAZW OPERACJI

| # | Operacja | Klik uĹĽytkownika |
|---|----------|-----------------|
| 1 | `add_grid_source_sn` | "Dodaj GPZ" |
| 2 | `continue_trunk_segment_sn` | "Kontynuuj magistralÄ™" |
| 3 | `insert_station_on_segment_sn` | "Wstaw stacjÄ™" |
| 4 | `start_branch_segment_sn` | "OdgaĹ‚Ä™zienie" |
| 5 | `insert_section_switch_sn` | "Wstaw Ĺ‚Ä…cznik" |
| 6 | `connect_secondary_ring_sn` | "PoĹ‚Ä…cz ring" |
| 7 | `set_normal_open_point` | "Ustaw NOP" |
| 8 | `add_transformer_sn_nn` | "Dodaj trafo" |
| 9 | `assign_catalog_to_element` | "Przypisz katalog" |
| 10 | `update_element_parameters` | "Edytuj parametry" |
| 11 | `refresh_snapshot` | automatycznie |

## 3. SEKWENCJA V1 (KLIK PO KLIKU)

```
Krok 1: add_grid_source_sn
   â†’ GPZ pojawia siÄ™ na SLD (szyna 15 kV + ĹşrĂłdĹ‚o)
   â†’ Readiness: E008 jeĹ›li brak Sk3

Krok 2â€“N: continue_trunk_segment_sn
   â†’ Kolejne odcinki magistrali (KABEL/LINIA)
   â†’ Wymaga catalog_ref (bramka katalogowa)
   â†’ SLD roĹ›nie w prawo (rĂłwne odstÄ™py)

Krok M: insert_station_on_segment_sn
   â†’ insert_at: {mode: "RATIO", value: 0.5}
   â†’ Stacja typu B/C/D wstawiona w odcinek
   â†’ SLD: nowa szyna + trafo (opcjonalnie)
   â†’ Readiness: E006 jeĹ›li trafo bez uk%

Krok M+1: start_branch_segment_sn
   â†’ OdgaĹ‚Ä™zienie od portu stacji
   â†’ Wymaga catalog_ref

Krok M+2: connect_secondary_ring_sn
   â†’ PoĹ‚Ä…czenie dwĂłch szyn (ring wtĂłrny)
   â†’ Wymaga catalog_ref
   â†’ SLD: linia przerywana na Y_RING

Krok M+3: set_normal_open_point
   â†’ NOP na Ĺ‚Ä…czniku w ringu
   â†’ SLD: symbol otwartego Ĺ‚Ä…cznika

Krok K: assign_catalog_to_element
   â†’ Przypisanie z katalogu â†’ materializacja parametrĂłw
   â†’ Readiness E009 znika
```

## 4. WALIDACJE

### 4.1 Bramka katalogowa (Double Gate)

**Backend**: operacje `continue_trunk_segment_sn`, `start_branch_segment_sn`, `connect_secondary_ring_sn` wymagajÄ… `catalog_ref`. Brak â†’ `error_code: "catalog.ref_required"`.

**Frontend**: context menu sprawdza potrzebÄ™ katalogu przed emisjÄ… operacji.

### 4.2 Readiness E001â€“E010

KaĹĽda operacja zwraca `readiness` w odpowiedzi:
- `ready: true` â†’ analizy dostÄ™pne
- `ready: false` â†’ lista `blockers[]` z `fix_actions[]`

### 4.3 PV/BESS Gate

Generatory PV i BESS wymagajÄ… transformatora w stacji (`transformer_required`).

## 5. LIVE SLD â€” PÄTLA RENDERINGU

```
UĹĽytkownik klika akcjÄ™
    â†“
Frontend wysyĹ‚a POST /api/enm/domain-ops {op, payload}
    â†“
Backend: execute_domain_operation(snapshot, op, payload)
    â†“
OdpowiedĹş: {snapshot, logical_views, readiness, fix_actions, layout}
    â†“
Frontend: store.setSnapshot(response.snapshot)
    â†“
SLD Pipeline (6 faz):
  1. Voltage Bands (dynamiczne z modelu)
  2. Bay Detection (z topologii)
  3. Crossing Minimization (Sugiyama)
  4. Coordinate Assignment (snap to grid)
  5. Edge Routing (orthogonal)
  6. Hash + Invariants (SHA-256)
    â†“
Canvas rerenders (< 16ms target)
```

## 6. KANONIZACJA

### 6.1 Determinizm

- Ten sam Snapshot â†’ identyczny piksel SLD
- Layout hash (SHA-256) stabilny przy permutacji elementĂłw
- 50Ă— test permutacyjny w CI

### 6.2 Estetyka przemysĹ‚owa

- Siatka: GRID_BASE = 20px
- Magistrala: Y_MAIN = 400px
- Ring: Y_RING = 320px (4Ă—GRID_BASE nad magistralÄ…)
- OdgaĹ‚Ä™zienia: Y_BRANCH = 480px
- RĂłwny rozstaw stacji: GRID_SPACING_MAIN = 280px
- GruboĹ›Ä‡ szyny: 3px (dominujÄ…ca)
- Kolory napiÄ™ciowe: benchmark/benchmark/Monochrome presets
- Polskie etykiety: "15 kV", "0,4 kV"

### 6.3 Layout Config Presets

| Preset | UĹĽycie |
|--------|--------|
| `DEFAULT_LAYOUT_CONFIG` | DomyĹ›lny (benchmark-grade) |
| `INDUSTRIAL_LAYOUT_CONFIG` | Estetyka przemysĹ‚owa DIgSILENT/ABB |

## 7. KONTRAKT SLD â†” ENM

| Pole odpowiedzi | Konsument SLD |
|-----------------|---------------|
| `snapshot.buses[]` | Szyny (pozycja, napiÄ™cie, kolor) |
| `snapshot.branches[]` | Kable/linie (routing) |
| `snapshot.transformers[]` | Symbole trafo |
| `snapshot.sources[]` | Symbol ĹşrĂłdĹ‚a |
| `snapshot.substations[]` | Grupy stacji (bay detection) |
| `logical_views.trunks[]` | Magistrala (kolejnoĹ›Ä‡) |
| `logical_views.branches[]` | OdgaĹ‚Ä™zienia |
| `logical_views.secondary_connectors[]` | Ringi |
| `layout.layout_hash` | Hash deterministyczny |

## 8. TESTY

| Test | Plik | Co weryfikuje |
|------|------|---------------|
| Estetyka przemysĹ‚owa | `sld/__tests__/industrialAesthetics.test.ts` | Grid, kanaĹ‚y Y, rozstaw, 50Ă— permutacje |
| Layout pipeline | `sld/core/__tests__/layoutPipeline.test.ts` | 6 faz, GN-SLD-01â€“04 |
| Config hash | `sld/core/__tests__/switchgearConfig.test.ts` | SHA-256 stabilnoĹ›Ä‡, 100Ă— |
| Voltage bands | `sld-layout/__tests__/voltage-bands.test.ts` | Dynamiczne pasma |
| Determinism | `sld/core/__tests__/determinism.test.ts` | Pixel-perfect powtarzalnoĹ›Ä‡ |

