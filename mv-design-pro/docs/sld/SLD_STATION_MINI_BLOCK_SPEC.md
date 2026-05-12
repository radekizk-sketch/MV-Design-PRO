# SLD Station Mini-Block Spec (Phase 0A)

**Status:** BINDING (Phase 0A)
**Wersja:** 1.0
**Pliki źródłowe:**
- `frontend/src/ui/sld/v2/renderer/MiniBlockRmuRenderer.tsx`
- `frontend/src/ui/sld/v2/renderer/MiniBlockFootprints.ts`

---

## 1. Reguła nadrzędna

Stacja w widoku oddalonym (LOD 0/1) NIE jest pojedynczym prostokątem ani romkiem. Stacja jest mini-blokiem RMU/RM6 wynikającym z **faktycznych pól** (`Substation.bays`) i portów (`Bay.equipment_refs`). Jeśli `bays[]` jest pusta — renderer NIE rysuje domyślnego szablonu, tylko **blocker badge** „Brak pól SN — uzupełnij konfigurację".

To jest realizacja Acceptance Invariant nr 11 z planu.

## 2. Siedem typów footprintu (bez GPZ)

GPZ ma osobny renderer (`GpzRenderer` → `GpzSwitchgearRenderer`); NIE jest jednym z typów mini-bloku.

| Typ | Polska etykieta | Krótki kod | TR | Sekcja nN | Domyślne role pól |
|---|---|---|---|---|---|
| `mv_lv_terminal` | Stacja końcowa SN/nN | RMU·K | TAK | TAK | RMU_LINE × 1, RMU_TRANSFORMER × 1 |
| `mv_lv_inline` | Stacja przelotowa SN/nN | RMU·P | TAK | TAK | RMU_LINE × 2, RMU_TRANSFORMER × 1 |
| `mv_lv_branch` | Stacja odgałęźna SN/nN | RMU·O | TAK | TAK | RMU_LINE × 3, RMU_TRANSFORMER × 1 |
| `mv_lv_sectional` | Stacja sekcyjna SN/nN | RMU·S | TAK | TAK | RMU_LINE × 2, RMU_TRANSFORMER × 2, COUPLER × 1 |
| `mv_lv_customer` | Stacja abonencka SN/nN | RMU·A | TAK | TAK | RMU_LINE × 1, MEASUREMENT × 1, RMU_TRANSFORMER × 1 |
| `switching_station` | Stacja łącznikowa SN | ŁCZ | NIE | NIE | RMU_LINE × 3 |
| `der_station` | Stacja źródłowa OZE | OZE | TAK | NIE | RMU_LINE × 1, RMU_TRANSFORMER × 1 |

Dane: `MINI_BLOCK_FOOTPRINT[type]` w `MiniBlockFootprints.ts`.

## 3. Wnioskowanie typu (`deriveFootprintType`)

```
GPZ → throw (osobny renderer)
switching → switching_station
customer → mv_lv_customer
sectional → mv_lv_sectional
hasDer == true → der_station
inline lub line_count == 2 → mv_lv_inline
branch lub line_count >= 3 → mv_lv_branch
domyślnie → mv_lv_terminal
```

## 4. Warianty mini-bloku

- **compact** (LOD 0/1): 100×56 px. Górny rząd: szyna SN + markery pól. Tytuł stacji + krótki kod.
- **detail** (LOD 2): 160×100 px. Dwa rzędy: SN (góra) + nN (dół). Symbol transformatora w środku z napisem mocy [kVA].

ViewBox jest STAŁY per wariant (kontrakt structural invariant). `miniBlockViewBox(variant)` zwraca `{width, height}`.

## 5. Markery pól

| Field role | Kolor markera | Symbol |
|---|---|---|
| RMU_LINE / LINE_IN / LINE_OUT / LINE_BRANCH | szary `#1F2A38` | mały prostokąt z pionowym łącznikiem |
| RMU_TRANSFORMER / TRANSFORMER | jasnoniebieski `#A5C8FF` | prostokąt + dolny trójkąt TR |
| COUPLER | szary `#9aa6b8` | prostokąt z dwiema poziomami |
| MEASUREMENT | żółty `#FFE48A` | mały prostokąt |
| Brak wymaganego aparatu | żółty `#FFC857` | prostokąt z warning stroke |

## 6. DER badge

Kolor badge **wyłącznie** wskazuje typ DER (PV=żółty, BESS=niebieski, FW=cyjan). NIE służy do oznaczania stanu elektrycznego — kolor toru wynika z `energization_state` i `switching_state` (warstwa wyższa).

```
| typ | kolor (token) | promień | widoczne LOD |
|---|---|---|---|
| PV  | #FFC857 | 5 | 0+ |
| BESS| #5BB8FF | 5 | 0+ |
| FW  | #5BFFD9 | 5 | 0+ |
```

## 7. Missing data marker

`missingData=true` → żółty marker w prawym górnym rogu (LOD ≥ 1, na compact już widoczny). Tooltip: "Brakuje danych do obliczeń".

## 8. Reguła kolorów zaznaczenia

Token `COLOR_SELECTION` (a NIE hardkodowane `#35C7FF`). Używany dla wszystkich rendererów V2.

## 9. Acceptance Invariants pokryte

- nr 1 (ENM jest jedyną prawdą): `bays[]` z ENM → mini-block.
- nr 2 (każdy element ma `domain_ref`): każdy bay marker ma `data-bay-ref` i `data-field-role`.
- nr 9 (brak danych ≠ 0.00): pusty `bays[]` → blocker badge.
- nr 11 (mini-RMU od LOD 0): obejmuje 7 typów stacji.
- nr 13 (CT/VT/uziemnik wynika z BayTemplate): operator-grade markery.

## 10. Testy (Phase 0A)

- `renderer/__tests__/miniBlockRmu.test.tsx` - 32 cases (kompozycja z bays, blocker badge, DER badges, viewBox invariant, derive footprintów).
- W połączeniu z `gpzCompactBlock.test.tsx` (21 cases) → 53 cases pokrywają mini-block + GPZ compact.
