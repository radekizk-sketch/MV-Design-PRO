# SLD — szablony pól ABB Ltd.

> Status: WIĄŻĄCY · Wersja: 1.0 · Goal §11A.3.C

## 1. Producent

| Pole | Wartość |
|---|---|
| `manufacturer_ref` | `ABB` |
| `normalized_code` | `ABB` |
| `country` | CH |
| `status` | **`requires_catalog`** |
| `lifecycle_status` | `current` |
| `verified_at` | brak |
| `source_refs` | brak |

## 2. Polityka katalogowa

> Dane techniczne mogą pochodzić wyłącznie z oficjalnych kart produktów ABB lub dokumentacji zatwierdzonej przez producenta. Rodziny produktowe (UniGear, SafeRing, SafePlus itp.) wymagają weryfikacji wersji katalogu.

## 3. Jakie źródła wykorzystano

**ŻADNE.** Brak zweryfikowanych źródeł ABB. System NIE zgaduje parametrów rodzin ABB.

## 4. Jakie rodziny rozdzielnic są zweryfikowane

**ŻADNE.** Aby dodać rodzinę ABB (np. UniGear ZS1, SafeRing, SafePlus, UniSec), procedura:
1. Pobrać oficjalną kartę produktu ABB (np. UniGear ZS1 — najnowsza rewizja).
2. Utworzyć `SwitchgearFamily` z:
   - `status="verified"`,
   - `source_document_refs=["catalog:abb_unigear_zs1_<year>.pdf"]`,
   - `source_version="<rev>"`,
   - `verified_at="<iso8601>"`,
   - `product_line_code="UNIGEAR_ZS1"` (lub odpowiedni),
   - `voltage_levels` (np. [12, 17.5, 24]),
   - `rated_current_options` (np. [1250, 2500, 4000]),
   - `short_time_current_options` (np. [25, 31, 50]),
   - `insulation_type="air"`,
   - `construction_type="wysuwna"` (UniGear ZS1) lub `"RMU"` (SafeRing),
   - `busbar_system="single"` (UniGear) lub `"ring_main"` (SafeRing).
3. Pull request z linkiem do oficjalnej karty + zatwierdzenie przez catalog admin.

## 5. Jakie typy pól wdrożono

Tylko canonical fallback. Wymagane minimum:
- liniowe,
- transformatorowe,
- pomiarowe,
- sprzęgłowe/sekcyjne,
- potrzeb własnych,
- odgromnikowe,
- DER (PV/BESS/FW).

## 6. Pola wymagające katalogu

Wszystkie pola dla ABB w statusie `requires_catalog`. UI pokazuje badge „Wymaga uzupełnienia katalogu" + fallback.

## 7. Visual snapshots

Brak dedykowanych ABB. Po uzupełnieniu — dodać snapshoty dla LOD 0-5 zgodnie z §11A.12.D, w szczególności dla UniGear ZS1 (pole wysuwne z członem) i SafeRing (RMU).

## 8. E2E

Producent w `test_all_starters_require_catalog` + `test_list_canonical_fallback_for_manufacturer_with_ref_marks_meta` (sprawdza że `?manufacturer_ref=ABB` zwraca 10 fallbacków z dopisanym `manufacturer_ref="ABB"` ale `source_status="canonical_fallback"` — NIE udajemy oficjalnego katalogu ABB).

Real-backend Playwright: `e2e/sld-real-backend-flow.spec.ts` test `GET /api/catalog/complete-bay-templates?manufacturer_ref=ABB → 10 z dopisaną referencją` PASS.

## 9. Raport lineage

```
manufacturer_ref: ABB
manufacturer_status: requires_catalog (BLOCKER — wymaga oficjalnej karty produktu)
switchgear_family_ref: null
bay_template_ref: CANONICAL_FALLBACK__<...>
source_status: canonical_fallback
source_refs: []
verification_note: "Pole renderowane z szablonu kanonicznego ogólnego.
                    Aby użyć oficjalnego katalogu ABB, uzupełnij source_refs."
```
