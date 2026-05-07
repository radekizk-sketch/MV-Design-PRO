# SLD LOD Spec — Operator-Grade (Phase 0A)

**Status:** BINDING (Phase 0A)
**Wersja:** 1.0
**Powiązane:** `SLD_LOD_AND_LAYERS.md` (legacy reference), `SLD_STATION_MINI_BLOCK_SPEC.md`, `SLD_GPZ_SWITCHGEAR_DEPTH.md`, `SLD_SYMBOLS_CANONICAL_OPERATOR_GRADE.md`

---

## 1. Cel

Operator-grade LOD ma być stabilny w pracy zoom (brak migotania), zachowywać Acceptance Invariant nr 6 (LOD zmienia szczegół wizualny, nie elektryczne znaczenie) i nadawać każdemu typowi obiektu dokładnie zdefiniowany próg widoczności.

## 2. Pięć poziomów

| LOD | Zakres scale | Zastosowanie | Główne kindy widoczne |
|---|---|---|---|
| 0 | < 0.30 | Mapa sieci (overview) | `gpz_block` (kompakt), `mini_block_compact`, `cable_run`, `der_marker`, `alarm_marker` |
| 1 | 0.30 – 0.70 | Sieć terenowa | + `gpz_switchgear`, `section`, `bay_head`, `nop_marker`, `missing_data_marker` |
| 2 | 0.70 – 1.50 | Obiekty + bays | + `mini_block_detail`, `device`, `der_full` |
| 3 | 1.50 – 3.00 | Szczegół techniczny | + `station_internal`, `device_label`, `q_label`, `measurement`, `der_sub_tree` |
| 4 | ≥ 3.00 | Diagnostyka | wszystkie + warstwy diagnostyczne |

Progi: stałe `LOD_ZOOM_THRESHOLDS` w `frontend/src/ui/sld/v2/lod/LodPolicy.ts`.

## 3. Histereza i debounce

Aby zapobiec migotaniu na granicy progów (np. 0.68 ↔ 0.72 dla LOD 1↔2), kontroler LOD stosuje:

- **Margines histerezy 15%**: aby przejść z LOD N do N+1, scale musi przekroczyć próg(N) × 1.15. Aby spaść z LOD N do N-1, scale musi spaść poniżej próg(N) × 0.85.
- **Debounce 250 ms**: zmiana LOD wymaga utrzymania nowego progu przez 250 ms. Wcześniejszy powrót anuluje przejście.

API: `createLodController({ initialScale, hysteresisMargin?, debounceMs?, nowProvider? })` zwraca `{ update, getLod, getScale, reset }`. Nie używa real timerów — wywołujący przekazuje `now`.

Test inwariantu: `lod/__tests__/lodHysteresis.test.ts` — 10 cases, w tym bouncing zoom 10×.

## 4. Override dla zaznaczenia

Element zaznaczony "wybija" się na minimum LOD 3 bez zmiany globalnego LOD. API: `effectiveLodForElement(globalLod, isSelected)`.

## 5. Reguła nadrzędna (Acceptance Invariant nr 6)

LOD MUSI uprościć szczegół wizualny. NIE wolno mu zmienić:
- topologii (porty, endpointy, stany aparatów),
- znaczenia elektrycznego (kolor toru wynika z `energization_state`/`switching_state`),
- liczby pól w stacji (pusta tablica `bays[]` → blocker badge, nie domyślny szablon).

## 6. Hierarchia etykiet (per LOD)

| LOD | Etykiety widoczne |
|---|---|
| 0 | nazwy GPZ, krótkie kody RMU (`RMU·P`/`RMU·O`/...), badge DER, badge missing-data |
| 1 | + nazwy stacji, nazwy sekcji GPZ, oznaczenia odpływów liczbowo |
| 2 | + nazwy pól (`Q1`, `T1`), liczba odpływów nN |
| 3 | + Q-numery aparatów, ratingi katalogowe, pomiary (jeśli warstwa Pomiary aktywna) |
| 4 | + wszystkie warstwy diagnostyczne |

Locked labels (CAD lock, Phase 2) NIE są ukrywane przez declutter.

## 7. Element kinds (kanon)

```ts
type LodElementKind =
  | 'gpz_block' | 'gpz_switchgear'
  | 'section' | 'bay_head' | 'device' | 'device_label'
  | 'cable_run'
  | 'station_block' | 'station_internal'
  | 'mini_block_compact' | 'mini_block_detail'
  | 'der_marker' | 'der_full' | 'der_sub_tree'
  | 'measurement' | 'q_label'
  | 'missing_data_marker' | 'alarm_marker' | 'nop_marker';
```

Phase 0A dodaje 4 nowe kindy: `mini_block_compact`, `mini_block_detail`, `gpz_switchgear`, `der_sub_tree`.

## 8. Hash invariants

Zmiana LOD MUSI:
- pozostawić `topology_hash` niezmieniony,
- pozostawić `layout_hash` niezmieniony,
- zmienić `view_hash`.

Egzekwowane przez `core/__tests__/hashes.test.ts` (3 cases pod tytułem "LOD switch zmienia tylko view_hash").

## 9. Pre-flight Phase 0A → kolejne fazy

- Histereza 15% + debounce 250 ms domyślnie aktywna.
- Histereza testowana 10× bouncing zoom — brak migotania.
- 4 nowe element kindy podłączone do `isVisibleAtLod`.
- Hash triad rozdzielony, invariant testowany.
