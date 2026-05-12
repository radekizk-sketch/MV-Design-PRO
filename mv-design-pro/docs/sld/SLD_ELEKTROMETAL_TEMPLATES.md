# SLD — szablony pól Elektrometal Energetyka S.A.

> Status: WIĄŻĄCY · Wersja: 1.0 · Goal §11A.3.B

## 1. Producent

| Pole | Wartość |
|---|---|
| `manufacturer_ref` | `ELEKTROMETAL` |
| `normalized_code` | `ELEKTROMETAL` |
| `country` | PL |
| `status` | **`requires_catalog`** |
| `lifecycle_status` | `current` |
| `verified_at` | brak |
| `source_refs` | brak |

## 2. Polityka katalogowa

> Dane techniczne mogą pochodzić wyłącznie z oficjalnych katalogów Elektrometal Energetyka S.A. lub dokumentacji zatwierdzonej przez producenta.

## 3. Jakie źródła wykorzystano

**ŻADNE.** Producent ma status `requires_catalog`.

## 4. Jakie rodziny rozdzielnic są zweryfikowane

**ŻADNE.** Procedura promocji identyczna jak dla ZPUE — wymaga `source_document_refs`, `source_version`, `verified_at` i zatwierdzenia w PR.

## 5. Jakie typy pól wdrożono

Tylko canonical fallback. Wymagane minimum (do uzupełnienia):
- liniowe,
- transformatorowe,
- pomiarowe,
- sprzęgłowe/sekcyjne,
- potrzeb własnych,
- odgromnikowe,
- DER (jeśli Elektrometal oficjalnie wspiera).

## 6. Pola wymagające katalogu

Wszystkie pola dla Elektrometal w statusie `requires_catalog`.

## 7. Visual snapshots

Brak dedykowanych — fallback canonical.

## 8. E2E

Producent w testach `test_all_starters_require_catalog`. E2E z prawdziwym katalogiem oczekuje na uzupełnienie.

## 9. Raport lineage

```
manufacturer_ref: ELEKTROMETAL
manufacturer_status: requires_catalog (BLOCKER)
switchgear_family_ref: null
bay_template_ref: CANONICAL_FALLBACK__<...>
source_status: canonical_fallback
```
