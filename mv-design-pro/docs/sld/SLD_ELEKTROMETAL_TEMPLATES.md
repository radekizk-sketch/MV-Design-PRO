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

**`repo_verified` (NIE `official_catalog`):**

| Rodzina | switchgear_family_ref | source_refs |
|---|---|---|
| e²ALPHA | `ELEKTROMETAL__E2ALPHA` | https://elektrometal-energetyka.pl/rozdzielnice-sn-e²alpha/ |

### e²ALPHA
- voltage: 12 / 17.5 / 24 kV
- rated current: 630-2000 A (szyna do 2500 A)
- Ith: 31.5 kA / 1s (12/17.5 kV), 25 kA / 1s (24 kV)
- konstrukcja: wnętrzowa, 4-przedziałowa (busbar / cable / apparatus / lv_control), izolacja powietrzna, single busbar
- klasyfikacja: LSC2B + PM + AFLR + IP4X/IP54

Aby promować do `verified` (oficjalny katalog Elektrometal), procedura identyczna jak dla ZPUE.

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
