# SLD END-TO-END GUARDS I TESTY

**Status:** WIAZACY
**Data:** 2026-04-04
**Zakres:** testy i guardy dla osadzonego SLD, selection, URL, snapshot runu, White Box

## 1. Cel

Zdefiniowac minimalny zestaw testow i guardow, bez ktorych obszar:
- `#results`
- osadzony SLD
- `#proof`
- powrot do `#editor`

nie moze byc uznany za domkniety.

## 2. Guardy obowiazkowe

### 2.1 Guard URL context

Sprawdza, ze serializacja i nawigacja nie gubia:
- `run`
- `snapshot`
- `view`
- `sel`
- `type`
- `trace_step`

### 2.2 Guard snapshot pinning

Sprawdza, ze:
- workspace wynikow,
- White Box,
- raport,
- osadzony SLD

odnosza sie do tego samego `snapshot_id` dla danego `run_id`.

### 2.3 Guard geometry invariance

Sprawdza, ze overlay wynikowy nie zmienia geometrii SLD.

### 2.4 Guard selection parity

Sprawdza, ze klik w tabeli, SLD i White Box prowadzi do tego samego aktywnego elementu.

## 3. Testy frontendowe wymagane

### 3.1 Vitest

- serializer/deserializer URL dla `run + snapshot + view + sel + type + trace_step`
- `ResultsWorkspacePage`:
  - odczyt aktywnego snapshotu runu
  - banner rozjazdu model biezacy vs run
  - blokada cichego fallbacku
- `RunViewPanel`:
  - przejscie do `#proof` z zachowaniem `run + snapshot + selection`
  - powrot do `#editor` z zachowaniem selection
- hook inspektora:
  - poprawny odczyt selection w `MODEL_CURRENT`
  - poprawny odczyt selection w `RUN_SNAPSHOT`

### 3.2 Playwright E2E

Minimalny scenariusz:
1. wejscie do `#editor`
2. zbudowanie modelu
3. uruchomienie analizy
4. wejscie do `#results`
5. klik wyniku
6. wskazanie elementu w osadzonym SLD
7. przejscie do `#proof`
8. powrot do `#editor`
9. potwierdzenie tego samego `run` i `snapshot`

Scenariusz negatywny:
- otwarcie `#results` albo `#proof` z niespojnym `run/snapshot`
- oczekiwany jest jawny komunikat bledu albo blokada

## 4. Testy backendowe wymagane

- kontrakt `results workspace projection` musi nosic `snapshot_id` dla aktywnego runu
- kontrakt `results v1` musi byc zgodny z tym samym `snapshot_id`
- kontrakt White Box / proof pack musi byc zgodny z tym samym `snapshot_id`
- test negatywny dla niespojnego `run/snapshot`, jesli API dopuszcza taki parametr

## 5. Macierz minimalna

| Obszar | Typ testu | Musi byc zielone |
|---|---|---|
| URL context | Vitest | TAK |
| Selection parity | Vitest | TAK |
| Embedded SLD geometry invariance | Vitest | TAK |
| Workspace -> proof -> model | Playwright | TAK |
| Results contract snapshot pinning | Backend tests | TAK |
| White Box contract snapshot pinning | Backend tests | TAK |

## 6. Dowod domkniecia

Obszar jest QA-domkniety dopiero wtedy, gdy:
- istnieje co najmniej jeden E2E bez helperowego obchodzenia UI dla calej sciezki,
- istnieje test negatywny na `run/snapshot mismatch`,
- selection i URL sa sprawdzone jako jedna prawda,
- snapshot pinning jest sprawdzony w backendzie i frontendzie.
