# AUDYT SLD SELECTION SNAPSHOT 2026-04-04

**Status:** AUDYT WIAZACY
**Zakres:** osadzony SLD, selection, URL, inspektor, snapshot runu vs model biezacy
**Metoda:** przeglad kodu bez zmian implementacyjnych

## 1. Stan obecny

### 1.1 Co juz jest dobre

- `frontend/src/ui/results-workspace/ResultsWorkspacePage.tsx`
  - laduje szczegoly aktywnego runu,
  - laduje `runSnapshot`,
  - ustawia `activeSnapshot` zaleznie od `snapshotViewMode`.
- `frontend/src/ui/results-workspace/store.ts`
  - serializuje `mode`, `run`, `batch`, `comparison`, `overlay`, `context`.
- `frontend/src/ui/selection/store.ts`
  - utrzymuje jedna globalna selekcje aplikacji.
- `frontend/src/ui/sld/inspector/useSldInspectorSelection.ts`
  - czyta selection z globalnego store.
- `frontend/src/ui/navigation/routes.ts`
  - zachowuje query string przy przejsciach miedzy trasami.

### 1.2 Co pozostaje niedomkniete

- `frontend/src/ui/navigation/urlState.ts`
  - serializuje tylko `sel`, `type`, `name` i flagi diagnostyczne,
  - nie serializuje `run`, `snapshot`, `view`, `trace_step`.
- `frontend/src/ui/results-workspace/store.ts`
  - zna `snapshotViewMode`,
  - nie przenosi jawnego `snapshot_id` do URL.
- `frontend/src/ui/results-workspace/RunViewPanel.tsx`
  - przechodzi do `#proof` i `#editor` przez ogolne `navigateTo(...)`,
  - polega na "zachowaj query string", a nie na semantycznym kontrakcie przejscia.
- `frontend/src/ui/results-inspector/LegacyTraceWorkspacePage.tsx`
  - nadal eksponuje pomocniczy widok legacy dla White Box.

## 2. Ocena architektoniczna

### KEEP

- `frontend/src/ui/results-workspace/ResultsWorkspacePage.tsx`
- `frontend/src/ui/selection/store.ts`
- `frontend/src/ui/sld/inspector/useSldInspectorSelection.ts`

### MERGE

- `frontend/src/ui/navigation/urlState.ts`
- `frontend/src/ui/results-workspace/store.ts`

Powod:
- obie warstwy utrzymuja czesciowo ten sam kontekst, ale nie przez jeden serializer.

### ISOLATE

- `frontend/src/ui/results-inspector/LegacyTraceWorkspacePage.tsx`

Powod:
- helper diagnostyczny nadal jest potrzebny, ale nie moze byc traktowany jak kanoniczna warstwa pracy na wynikach.

## 3. Ryzyka

1. Utrata jawnego `snapshot_id` przy deep-linku do wynikow lub White Box.
2. Niejednoznacznosc, czy uzytkownik oglada `snapshot runu`, czy `model biezacy`.
3. Zachowanie query string nie wystarcza jako kontrakt, jesli nie kontrolujemy pelnego selection context.
4. White Box moze byc technicznie otwarty dla aktywnego runu, ale bez jawnego, udokumentowanego pinningu snapshotu w URL.

## 4. Wniosek

Repo ma juz dobry fundament pod:
- jedna globalna selekcje,
- read-only workspace wynikow,
- przelaczanie `RUN_SNAPSHOT` vs `CURRENT_MODEL`.

Brakuje jeszcze pelnego, wiążacego domkniecia:
- URL context,
- snapshot pinning,
- jednoznacznego kontraktu przejsc `results -> proof -> editor`.

Nowe dokumenty w:
- `docs/system`
- `docs/ui`
- `docs/sld`
- `docs/qa`

traktuja te brakujace zasady jako kanon wiążacy dla dalszych wdrozen.
