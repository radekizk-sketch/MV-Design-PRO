# SLD WORKSPACE SELECTION URL CONTRACT

**Status:** WIAZACY
**Data:** 2026-04-04
**Zakres:** osadzony SLD, selection, URL, inspektor, overlay, workspace wynikow

## 1. Cel

Zdefiniowac techniczny kontrakt dla SLD renderowanego w `#results` oraz dla przeplywu:
- selection,
- URL,
- inspektor,
- overlay wynikowego,
- przejsc do `#proof` i `#editor`.

## 2. Jedna geometria

1. `#editor` i `#results` korzystaja z tego samego kontraktu geometrii.
2. Osadzony SLD nie moze miec "wynikowego layoutu specjalnego".
3. Overlay nie moze przesuwac symboli, zmieniac routingu ani tworzyc nowych polaczen.

## 3. Jedna tozsamosc symbolu

Kazdy symbol eksponowany do selection ma miec:
- `symbol_id`
- `element_id`
- `element_type`
- `view_mode`

`view_mode` przyjmuje:
- `MODEL_CURRENT`
- `RUN_SNAPSHOT`

## 4. Jedna prawda selection

Selection jest wspolna dla:
- `frontend/src/ui/selection/store.ts`
- `frontend/src/ui/navigation/urlState.ts`
- `frontend/src/ui/results-workspace/store.ts`
- `frontend/src/ui/sld/inspector/useSldInspectorSelection.ts`

Docelowo URL i store workspace maja wspoldzielic jedna serializacje selection context.

## 5. Minimalny selection context

Obowiazkowe pola:
- `sel`
- `type`
- `run`
- `snapshot`
- `view`

Pola opcjonalne:
- `name`
- `trace_step`
- `overlay`

## 6. Kontrakt przejsc

### 6.1 Wyniki -> SLD

Klik wiersza tabeli:
- ustawia globalny selection store,
- zapisuje selection context do URL,
- centruje osadzony SLD na aktywnym symbolu,
- ustawia inspektor na tym samym elemencie.

### 6.2 SLD -> White Box

Klik akcji `White Box`:
- zachowuje `run`,
- zachowuje `snapshot`,
- zachowuje `sel` i `type`,
- jesli dostepne, dopisuje `trace_step`.

### 6.3 White Box -> model

Powrot do modelu:
- zachowuje selection,
- nie moze skasowac wiedzy o tym, z jakiego runu i snapshotu pochodzi kontekst.

## 7. Kontrakt inspektora

Inspektor ma czytac:
- globalny selection store,
- aktywny `view_mode`,
- aktywny kontekst runu.

Inspektor nie moze budowac osobnej lokalnej selekcji dla:
- trace,
- tabel wynikow,
- read-only SLD.

## 8. Kontrakt snapshot runu

W trybie `RUN_SNAPSHOT`:
- dane elementu pochodza ze snapshotu runu,
- overlay pochodzi z kontraktu wynikowego runu,
- mutacje sa zablokowane.

W trybie `MODEL_CURRENT`:
- selection pozostaje ta sama,
- UI musi pokazac, ze wynik dotyczy snapshotu historycznego, jesli hash modelu jest inny.

## 9. Kontrakt warstwy overlay

Overlay wynikowy:
- czyta dane tylko z kontraktu runu,
- jest identyfikowany przez `run_id`,
- jest zgodny z `snapshot_id`,
- nie moze byc interpretowany na innym snapshotcie bez jawnego bledu.

## 10. Obszary obecnie wymagajace domkniecia

Na podstawie realnego stanu repo:
- `ResultsWorkspacePage.tsx` juz przelacza `activeSnapshot`, ale URL nie serializuje jeszcze `snapshot`.
- `navigateTo(...)` zachowuje query string, ale nie waliduje semantycznie spojnosc `run + snapshot + selection`.
- `LegacyTraceWorkspacePage.tsx` nadal jest helperem legacy.
- `urlState.ts` serializuje selection, ale nie caly selection context wynikowy.

Te braki nie zmieniaja kontraktu. Oznaczaja jedynie, ze implementacja musi dojsc do stanu opisanego wyzej.
