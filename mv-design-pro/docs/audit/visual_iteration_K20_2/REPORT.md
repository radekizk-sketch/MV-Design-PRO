# RAPORT AUDIT — iter K20-2 (catalog fixes + Q02 LINE_OUT + load attempts)

**Data:** 2026-05-14
**Branch:** `claude/cleanup-documentation-sld-7zVRd`
**Commit:** 778e0fc (catalog fix) + (pending Q02+loads)
**Case ID:** 9e5b6729-7853-4485-a816-44535334dc46

---

## § 1  ZMIANY vs iter K20-1

| Δ | Wartość | Wpływ |
|---|---------|-------|
| **Catalog IDs PV/BESS/FW** | conv-pv-nn-0p5mw-0p4kv, conv-bess-{1,2}mw-{2,4}mwh-15kv, conv-wind-{2,3}mw-{15,20}kv | DER attempts use real catalogs (fix O1/O2 partial) |
| **Q02 LINE_OUT bay** | + dodatkowe pole na sekcji SN | L2 Sekcja II symetria częściowa |
| **Load attempts** | 0/11 PASS (FEEDER_FAIL: APARAT_NN catalog brakuje) | E1 niezamknięty — wymaga catalog seed |
| **DER block_transformer** | 0/5 BESS PASS — `generator.block_transformer_missing` | O1 niezamknięty — wymaga workflow setup |
| **GPZ render count** | 137 → 160 (+23 elementy) | Q02 widoczne w SLD |

**DER PASS:** 8/20 (PV nn_side: S02/S04/S07/S11/S14/S17/S19/S21)
**LOAD PASS:** 0/11 (catalog gate block — APARAT_NN empty)
**STATIONS PASS:** 20/20

---

## § 2  OCENY 7 SPECJALISTÓW (delta)

| # | Specjalista | K20-1 | K20-2 | Δ | Komentarz |
|---|------------|-------|-------|------|-----------|
| 1 | Projektant SN/WN | 4.5 | 4.7 | +0.2 | Q02 LINE_OUT na Sekcji II = symetria częściowa |
| 2 | Prof. energetyki | 5.0 | 5.0 | — | Loads niezamknięte (catalog gap) |
| 3 | OZE | 3.5 | 3.5 | — | DER PASS=8 (równe iter-1) |
| 4 | NC RFG | 4.0 | 4.0 | — | Brak zmian |
| 5 | Zabezpieczenia | 2.5 | 2.5 | — | Protection nadal nieuruchamiane |
| 6 | Schematy PN-EN 60617 | 5.5 | 5.5 | — | Layout 4×5 nadal — P0.3 nieaktywny |
| 7 | Normy | 6.0 | 6.0 | — | Brak zmian |

**Agregat:** 4.38 → 4.42 / 10 (+0.04). **Bardzo mała poprawa.**

---

## § 3  NOWE BLOCKERY ZIDENTYFIKOWANE (V12K-* kandydaci)

### V12K-021: APARAT_NN catalog seed missing
**Severity:** P1 BLOCKER
**Operation:** `add_nn_outgoing_field`
**Error:** `catalog.ref_required` — policy walidator wymaga catalog_binding
namespace=`APARAT_NN` ale endpoint `/api/catalog/lv-apparatus` zwraca pustą
listę. Brak pliku `lv_apparatus.py` lub seed danych nN.

**Impact:** 0/11 loads attachable. K11 workflow niemożliwy do realizacji.

**Fix path:** Seed APARAT_NN catalog (LV breakers/switches/fuses)
albo zbudować catalog z `mv_switch_catalog` analog dla nN.

### V12K-022: BESS block_transformer workflow missing
**Severity:** P1 BLOCKER
**Operation:** `add_converter_source` z `connection_variant=block_transformer`
**Error:** `generator.block_transformer_missing` — backend wymaga
existing block_transformer ref ale brak dedicated operation aby go
stworzyć przed BESS attach.

**Impact:** 5/5 BESS attempts FAIL. 3/3 FW block_transformer attempts FAIL.

**Fix path:** Dodać operację `add_block_transformer` lub flag w
`add_converter_source` żeby auto-create block_transformer.

### V12K-023: PV connection variants LV_BEHIND_STATION_TRANSFORMER /
SOURCE_CONNECTION_STATION nieobsługiwane
**Severity:** P2 WARN
**Operation:** `add_converter_source` z tymi wariantami
**Error:** `converter.connection_variant_missing`

**Impact:** S08 (PV LV_BEHIND), S10 (PV farma 5 MW SOURCE_CONN) FAIL.

**Fix path:** Implementacja w `domain_operations_v2.add_converter_source`
case dla tych dwóch variants.

### V12K-024: FW DEDICATED_MV_CONNECTION nieobsługiwane
**Severity:** P2 WARN
**Operation:** `add_converter_source` source_technology=FW
**Error:** `converter.connection_variant_missing` dla
`DEDICATED_MV_CONNECTION`

**Impact:** S06 (FW 800 kW), S20 (FW 3 MW) FAIL.

**Fix path:** Implementacja FW DEDICATED_MV w add_converter_source.

---

## § 4  STAN PROGRESJI vs TARGET 10/10

Po iter K20-1 + K20-2 (~2-3h wykonanej pracy):

```
0/10 ████████████████████ 10/10
4.42 ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░  (44%)
```

**Pozostałe OD do 10/10:** ~50-60 OD
- P0.3 LayoutEngine F2 (port-based hierarchical): 25 OD
- V12K-021 APARAT_NN catalog seed: 5 OD
- V12K-022 block_transformer workflow: 5 OD
- V12K-023/024 missing variants: 8 OD
- Protection workflow per K20 case: 5 OD
- WHITE BOX overlay wire: 5 OD
- Symbol library +18 IEC 60617 (z 32 do 50): 10 OD

---

## § 5  TODO ITER K20-3

1. ~~Catalog fixes (PV/BESS/FW IDs)~~ ✓ DONE
2. ~~Q02 LINE_OUT na Sekcji II~~ ✓ DONE (partial)
3. **APARAT_NN catalog investigation / seed** (V12K-021)
4. **block_transformer workflow** (V12K-022)
5. **Layout improvement** częściowy — odsunięcie stacji w grid 5×4 zamiast 4×5 cluster
6. **DER setpoints** (cos_phi, P limits)

**Trigger end-of-loop:** 7 specjalistów ≥ 9.5 przez 3 iter — **NIE OSIĄGNIĘTE**.

---

**Konkluzja iter K20-2:** Małe poprawki katalogowe, identyfikacja 4 V12K
blockerów. Główne blokery architektoniczne (P0.3 LayoutEngine + brakujące
operations) wymagają osobnych PR. Loop kontynuuje do K20-3 z focus na
catalog/operations gaps.
