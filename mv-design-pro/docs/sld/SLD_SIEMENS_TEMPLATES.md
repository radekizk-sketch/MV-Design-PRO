# SLD — szablony pól Siemens AG

> Status: WIĄŻĄCY · Wersja: 1.0 · Goal §11A.3.D

## 1. Producent

| Pole | Wartość |
|---|---|
| `manufacturer_ref` | `SIEMENS` |
| `normalized_code` | `SIEMENS` |
| `country` | DE |
| `status` | **`requires_catalog`** |
| `lifecycle_status` | `current` |
| `verified_at` | brak |
| `source_refs` | brak |

## 2. Polityka katalogowa

> Dane techniczne mogą pochodzić wyłącznie z oficjalnych kart produktów Siemens lub dokumentacji zatwierdzonej przez producenta. Rodziny produktowe (NXAIR, 8DJH, SIMOSEC itp.) wymagają weryfikacji wersji katalogu.

## 3. Jakie źródła wykorzystano

**ŻADNE.** Brak zweryfikowanych źródeł Siemens. System NIE zgaduje rodzin produktowych Siemens.

## 4. Jakie rodziny rozdzielnic są zweryfikowane

**`repo_verified` (NIE `official_catalog`):**

| Rodzina | switchgear_family_ref | source_refs |
|---|---|---|
| NXAIR | `SIEMENS__NXAIR` | https://www.siemens.com/en-us/products/energy-systems/nxair/ |
| 8DJH | `SIEMENS__8DJH` | https://www.siemens.com/en-us/products/energy/medium-voltage/medium-voltage-switchgear/8djh-36.html |

### NXAIR
- voltage: 12 / 17.5 / 24 kV
- rated current: 1250 / 2500 / 4000 A
- Ith: 25 / 31 / 40 kA / 1s
- konstrukcja: wysuwna, izolacja powietrzna, single busbar
- klasyfikacja: IAC A FLR + LSC 2B + PM
- bay kinds: liniowe / transformatorowe / pomiarowe / sprzęgłowe / potrzeb własnych / odgromnikowe

### 8DJH
- voltage: 12 / 17.5 / 24 kV
- rated current: 630 A
- Ith: 20 / 21 / 25 kA / 1s
- konstrukcja: RMU, izolacja SF6, sealed-for-life
- bay kinds: liniowe / transformatorowe

Aby promować do `verified` (oficjalny katalog Siemens), wymagana procedura:
1. Pobrać oficjalną kartę produktu Siemens.
2. Utworzyć `SwitchgearFamily` z `status="verified"`, `source_document_refs`, `source_version`, `verified_at`.
3. PR z linkiem do oficjalnej karty.

## 5. Jakie typy pól wdrożono

Tylko canonical fallback. Wymagane minimum:
- liniowe,
- transformatorowe,
- pomiarowe,
- sprzęgłowe/sekcyjne,
- potrzeb własnych,
- odgromnikowe,
- DER.

## 6. Pola wymagające katalogu

Wszystkie pola dla Siemens w statusie `requires_catalog`.

## 7. Visual snapshots

Brak dedykowanych Siemens.

## 8. E2E

Producent w `test_all_starters_require_catalog`. Test API `GET /api/catalog/manufacturers` zwraca SIEMENS w liście 4 producentów ze statusem `requires_catalog`.

## 9. Raport lineage

```
manufacturer_ref: SIEMENS
manufacturer_status: requires_catalog (BLOCKER)
switchgear_family_ref: null
bay_template_ref: CANONICAL_FALLBACK__<...>
source_status: canonical_fallback
source_refs: []
```
