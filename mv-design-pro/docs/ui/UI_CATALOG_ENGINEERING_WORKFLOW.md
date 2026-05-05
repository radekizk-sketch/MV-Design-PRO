# Katalog -- przeplyw inzynierski

| Pole            | Wartosc                                                                      |
|-----------------|------------------------------------------------------------------------------|
| Data            | 2026-03-28                                                                   |
| Zakres          | Przeplyw przypisywania typow katalogowych do elementow sieci SN              |
| Pliki kluczowe  | `ui/catalog/elementCatalogRegistry.ts`, `ui/catalog/useCatalogAssignment.ts`, `ui/catalog/TypeLibraryBrowser.tsx`, `ui/network-build/CatalogBrowser.tsx` |
| Status dokumentu| **ZAMKNIETY**                                                                |

---

## 1. Przeplyw E2E

```
Element bez katalogu
  |
  v
ReadinessBar: blocker "missing_catalog" / "no_catalog"
  |-- FixAction: action_type=SELECT_CATALOG
  |-- openOperationForm('assign_catalog_to_element', { element_ref })
  |
  v
CatalogBrowser (inline w panelu inspektora)
  |-- filtracja po namespace (z elementCatalogRegistry)
  |-- wyswietlenie typow katalogowych (readonly)
  |
  v
Uzytkownik wybiera typ
  |
  v
useCatalogAssignment.assignType(element_id, catalog_type_id)
  |-- executeDomainOperation('assign_catalog_to_element', { element_id, type_id })
  |
  v
Backend: materializacja parametrow
  |-- Kopiowanie R1, X1, B1, I_n, ... z typu katalogowego do elementu
  |-- Element.catalog_ref = type_id
  |
  v
Readiness update
  |-- Blocker "missing_catalog" usuniety
  |-- Snapshot odswiezony
  |-- ReadinessBar aktualizowany
```

---

## 2. elementCatalogRegistry -- Single Source of Truth

Plik: `ui/catalog/elementCatalogRegistry.ts`

Rejestr mapowania typ elementu sieci --> namespace katalogu. Uzyty przez:
- `CatalogBrowser` -- do filtracji typow po namespace
- `useCatalogAssignment` -- do walidacji kompatybilnosci
- `MissingCatalogReview` -- do skanu elementow bez katalogu
- `TypeLibraryBrowser` -- do organizacji zakladek

### Mapowania (36 wpisow)

| Element type           | Catalog namespace      | Przyklad typu katalogowego           |
|------------------------|------------------------|--------------------------------------|
| `line_overhead`        | `line_overhead`        | AFL-6 120mm2, AFL-8 70mm2            |
| `line_overhead_hn`     | `line_overhead`        | j.w. (HN = high neutral)            |
| `cable_mv`             | `cable_mv`             | XRUHAKXS 1x120/50, YAKYy 3x240     |
| `cable_lv`             | `cable_lv`             | YKYp 4x120, YAKXS 4x240            |
| `transformer_2w`       | `transformer_2w`       | TMG 250/15, TON 630/15              |
| `transformer_2w_dry`   | `transformer_2w`       | j.w. (typ suchy)                    |
| `switch_breaker`       | `switch_breaker`       | VD4 12kV 630A, Evolis 24kV          |
| `switch_disconnector`  | `switch_disconnector`  | NAL 24kV 630A                       |
| `switch_fuse`          | `switch_fuse`          | SN-bezpiecznik                       |
| `switch_recloser`      | `switch_recloser`      | OSM 15/27 kV                        |
| `ct_current`           | `ct_current`           | CTR 100/5A, IMZ 200/5A              |
| `ct_voltage`           | `ct_voltage`           | VTR 15000/100V                      |
| `relay_overcurrent`    | `relay_overcurrent`    | SIPROTEC 7SJ82, MiCOM P141          |
| `relay_distance`       | `relay_distance`       | SIPROTEC 7SA87                      |
| `relay_differential`   | `relay_differential`   | SIPROTEC 7UT87                      |
| `generator_sync`       | `generator_sync`       | Generator synchroniczny              |
| `generator_async`      | `generator_async`      | Generator asynchroniczny             |
| `load_lv`              | `load_lv`              | Odbior nN                            |
| `load_mv`              | `load_mv`              | Odbior SN                            |
| `inverter_pv`          | `inverter_pv`          | SMA Tripower 60kW                   |
| `inverter_bess`        | `inverter_bess`        | SMA Storage 50kW                    |
| ... (+ dodatkowe warianty po 36 lacznych wpisow)                                      |

> Pelna lista w `ui/catalog/__tests__/elementCatalogRegistry.test.ts`.

### Invarianty rejestru

1. **Kazdy element z impedancja MUSI miec namespace** -- linie, kable, transformatory.
2. **Namespace MUSI istniec w backendowym katalogu** -- walidowane przez
   `catalog_binding_guard.py`.
3. **Mapowanie jest 1:1** -- jeden typ elementu --> jeden namespace (nie wielokrotny).
4. **Rejestr jest SSOT** -- zadne inne miejsce nie definiuje mapowania element-->katalog.

---

## 3. CatalogBrowser

Plik: `ui/network-build/CatalogBrowser.tsx`

Przegladarka katalogu renderowana inline w panelu inspektora (nie jako overlay modal).

### Funkcjonalnosc

| Cecha                  | Opis                                                              |
|------------------------|-------------------------------------------------------------------|
| Filtracja po namespace | Automatyczna na podstawie `elementCatalogRegistry[element.type]`  |
| Wyszukiwanie           | Pelnotekstowe po nazwie typu, producencie, parametrach            |
| Sortowanie             | Po nazwie, S_n, U_n, I_n (zalezne od namespace)                  |
| Podglad parametrow     | Rozwijany wiersz z pelna karta parametrow typu                    |
| Selekcja               | Przycisk "Przypisz" --> `useCatalogAssignment.assignType()`       |
| Tryb                   | **Readonly** -- nie pozwala na edycje/tworzenie typow katalogowych|

### Readonly -- uzasadnienie

Typy katalogowe sa **immutable** po opublikowaniu (benchmark Type Library parity,
`CANONICAL_COMPLIANCE.md`). Edycja typow katalogowych nie jest dozwolona w warstwie
UI. Zmiana parametrow elementu po przypisaniu katalogu wymaga:
1. Odlaczenia biezacego typu (`clear_catalog_from_element`)
2. Przypisania innego typu
3. Lub: nadpisania parametrow (override) -- jesli architektura na to pozwala

---

## 4. TypeLibraryBrowser

Plik: `ui/catalog/TypeLibraryBrowser.tsx`

Pelna przegladarka katalogu dostepna z menu glownego (P13a: Type Library Browser).

### Zakladki

| Zakladka       | Namespace(s)                           | Kolumny                              |
|----------------|----------------------------------------|--------------------------------------|
| Linie          | `line_overhead`                        | Nazwa, R1, X1, B1, I_n, materiaĹ‚    |
| Kable          | `cable_mv`, `cable_lv`                 | Nazwa, R1, X1, B1, I_n, przekroj    |
| Transformatory | `transformer_2w`                       | Nazwa, S_n, U_HV/U_LV, u_k, P_Cu   |
| Laczniki       | `switch_breaker`, `switch_disconnector`| Nazwa, I_n, I_dyn, U_n              |

---

## 5. Mass review: MissingCatalogReview

Komponent skanujacy siec w poszukiwaniu elementow bez przypisanego typu katalogowego.

### Zakres skanu

| Kategoria       | Typy elementow skanowane                           | Wymaganie katalogu |
|-----------------|----------------------------------------------------|--------------------|
| Linie/kable     | `line_overhead`, `cable_mv`, `cable_lv`            | **WYMAGANY**       |
| Transformatory  | `transformer_2w`                                   | **WYMAGANY**       |
| Generatory      | `generator_sync`, `generator_async`                | **WYMAGANY**       |
| Odbiory         | `load_lv`, `load_mv`                               | OPCJONALNY         |
| Laczniki        | `switch_breaker`, `switch_disconnector`             | OPCJONALNY         |
| **Sources**     | **WYKLUCZONE** -- Source nie ma catalog_ref         | N/A                |

### Sources excluded -- uzasadnienie

`Source` (External Grid / GPZ) nie ma referencji katalogowej. Parametry GPZ
(moc zwarciowa S_kQ, stosunek R/X, napiecie U_n) definiowane sa bezposrednio
w modelu, poniewaz:

1. GPZ nie jest "urzadzeniem z katalogu" -- to punkt przylaczenia do systemu
   nadrzednego o znanych parametrach zwarciowych.
2. IEC 60909 modeluje zrodlo zewnetrzne przez impedancje zastecza
   Z_Q = c * U_n^2 / S_kQ, nie przez typ katalogowy.
3. benchmark rowniez nie uzywa Type Library dla External Grid.

Jest to swiadoma decyzja architektoniczna, nie luka.

---

## 6. Materializacja parametrow

Po przypisaniu typu katalogowego do elementu backend wykonuje materializacje:

```
assign_catalog_to_element(element_id, type_id)
  |
  v
CatalogResolver.resolve(type_id)
  |-- Pobranie pelnych parametrow typu z katalogu
  |
  v
Element.apply_catalog_type(resolved_params)
  |-- R1 = type.R1_per_km * element.length_km
  |-- X1 = type.X1_per_km * element.length_km
  |-- B1 = type.B1_per_km * element.length_km
  |-- I_n = type.I_n
  |-- catalog_ref = type_id
  |
  v
NetworkValidator.validate()
  |-- Sprawdzenie kompletnosci parametrow
  |-- Aktualizacja readiness
```

### Invarianty materializacji

1. **Parametry per-km mnozene przez dlugosc** -- dla linii i kabli.
2. **Transformatory: parametry bezposrednie** -- S_n, u_k, P_Cu, P_Fe z katalogu.
3. **catalog_ref zapisywany** -- element "pamięta" skad pochodza parametry.
4. **Walidacja po materializacji** -- NetworkValidator sprawdza czy parametry sa
   kompletne i poprawne (np. R1 > 0, I_n > 0).
5. **Zmiana katalogu invaluduje wyniki** -- zgodnie z Case Immutability Rule,
   zmiana modelu uniewaĹĽnia wyniki wszystkich Study Cases.

---

## 7. Guardy katalogowe

| Guard                              | Cel                                                    |
|------------------------------------|--------------------------------------------------------|
| `catalog_binding_guard.py`         | Kazdy element z impedancja MUSI miec catalog_ref       |
| `catalog_enforcement_guard.py`     | Brak bezposredniego wstrzykiwania parametrow (bypass)  |
| `catalog_gate_guard.py`            | Walidacja istnienia namespace w backendowym katalogu   |
| `transformer_catalog_voltage_guard.py` | U_HV/U_LV trafo zgodne z katalogiem               |

Wszystkie guardy uruchamiane w CI (`python-tests.yml`) i lokalnie.

---

## Podsumowanie

| Komponent               | Status     | Uwagi                                        |
|--------------------------|------------|----------------------------------------------|
| elementCatalogRegistry   | KOMPLETNY  | 36 mapowaĹ„, SSOT, przetestowany              |
| CatalogBrowser           | KOMPLETNY  | Readonly by design, filtracja po namespace   |
| TypeLibraryBrowser       | KOMPLETNY  | 4 zakladki, pelna przegladarka               |
| useCatalogAssignment     | KOMPLETNY  | Hook: assign + clear + walidacja             |
| MissingCatalogReview     | KOMPLETNY  | Skan branches + trafo + generators           |
| Sources excluded         | BY DESIGN  | Source bez catalog_ref -- IEC 60909 / PF     |
| Materializacja           | KOMPLETNY  | Backend: resolve --> apply --> validate       |
| Guardy CI                | AKTYWNE    | 4 guardy, CI green                           |

**Status: ZAMKNIETY**

