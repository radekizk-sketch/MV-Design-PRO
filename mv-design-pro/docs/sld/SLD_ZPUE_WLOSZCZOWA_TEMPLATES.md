# SLD — szablony pól ZPUE S.A. (Włoszczowa)

> Status: WIĄŻĄCY · Wersja: 1.0 · Goal §11A.3.A

## 1. Producent

| Pole | Wartość |
|---|---|
| `manufacturer_ref` | `ZPUE_WLOSZCZOWA` |
| `normalized_code` | `ZPUE` |
| `country` | PL |
| `status` | **`requires_catalog`** |
| `lifecycle_status` | `current` |
| `verified_at` | brak |
| `source_refs` | brak |

## 2. Polityka katalogowa

> Dane techniczne mogą pochodzić wyłącznie z oficjalnych katalogów ZPUE S.A. (Włoszczowa), kart produktów lub dokumentacji zatwierdzonej przez producenta. Niezweryfikowane wartości nie mogą być oznaczone jako 'official_catalog'.

## 3. Jakie źródła wykorzystano

**ŻADNE.** Producent ma status `requires_catalog` — żadne dane techniczne nie zostały zweryfikowane przeciwko oficjalnym źródłom ZPUE. UI pokazuje badge „Wymaga uzupełnienia katalogu".

## 4. Jakie rodziny rozdzielnic są zweryfikowane

**`repo_verified` (NIE `official_catalog`):**

| Rodzina | switchgear_family_ref | source_refs |
|---|---|---|
| Rotoblok | `ZPUE_WLOSZCZOWA__ROTOBLOK` | https://zpue.pl/rozdzielnice-sn/rotoblok |

### Rotoblok
- voltage: 15 / 20 kV (max equipment 17.5 / 24 kV)
- rated current: 630 / 1250 A
- Ith: 16 kA / 1s, peak 40 kA
- konstrukcja: wnętrzowa, dwuprzedziałowa, izolacja powietrzna, pojedynczy system szyn
- bay kinds: RL1/RL4 (liniowe), RT1/RWT/RWT3/RWTp14 (transformatorowe), RS1L/RS4 (sprzęgłowe), RP1 (pomiarowe), RO1 (odgromnikowe), RTpwł4/RTpwł 25kVA (potrzeb własnych)
- certyfikat IEL

Aby promować do `verified` (oficjalny katalog ZPUE), procedura:
1. Pobrać oficjalny katalog ZPUE (np. Rotoblok, Safevap — jeśli takie są aktualne).
2. Utworzyć `SwitchgearFamily` z `status="verified"`, `source_document_refs=["catalog:zpue_<family>_<year>.pdf"]`, `source_version`, `verified_at`.
3. Wypełnić `voltage_levels`, `rated_current_options`, `short_time_current_options`, `insulation_type`, `construction_type`, `busbar_system`.
4. Pull request z linkiem do źródła + zatwierdzenie przez catalog admin.

## 5. Jakie typy pól wdrożono

W tej chwili: **tylko canonical fallback** (z `manufacturer_ref="ZPUE_WLOSZCZOWA"` ale `source_status="canonical_fallback"`).

Wymagane minimum typów pól dla ZPUE (do uzupełnienia):
- liniowe dopływowe/odpływowe,
- transformatorowe,
- pomiarowe,
- sprzęgłowe/sekcyjne,
- odgromnikowe,
- potrzeb własnych,
- DER (PV/BESS/FW) — jeśli ZPUE oficjalnie wspiera.

## 6. Pola wymagające katalogu (`requires_catalog_for_*`)

Wszystkie pola dla ZPUE są w statusie `requires_catalog` — operator widzi w UI badge „Pole zostanie zbudowane z szablonu kanonicznego ogólnego (fallback)".

## 7. Visual snapshots

Aktualne snapshoty: brak dedykowanych ZPUE. Renderery używają canonical fallback. Po uzupełnieniu katalogu dodać snapshoty dla każdego LOD 0-5 zgodnie z §11A.12.D.

## 8. E2E

Aktualnie ZPUE występuje w testach jako producent ze statusem `requires_catalog` (test `test_all_starters_require_catalog`). E2E z prawdziwym katalogiem ZPUE oczekuje na uzupełnienie.

## 9. Co trafia do raportu

Raport eksportu zawiera lineage:
```
manufacturer_ref: ZPUE_WLOSZCZOWA
manufacturer_status: requires_catalog (BLOCKER — wymaga uzupełnienia katalogu)
switchgear_family_ref: null (brak verified family)
bay_template_ref: CANONICAL_FALLBACK__<...> (fallback)
source_status: canonical_fallback
source_refs: []
```
