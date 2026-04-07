# SPEC OSADZONEGO SLD, SELECTION I SNAPSHOT RUNU

**Status:** WIAZACY
**Data:** 2026-04-04
**Zakres:** `#editor`, `#results`, `#proof`, osadzony SLD, selection, URL, inspektor, kontekst runu
**Pierwszenstwo:** Ten dokument wygrywa z ogolniejszymi starszymi opisami tam, gdzie dotycza osadzonego SLD, selection i relacji `run snapshot` vs `model biezacy`.

## 1. Cel

Ustalic jeden kanon dla:
- osadzonego SLD w workspace wynikow,
- jednej prawdy selection i URL,
- relacji miedzy `snapshotem runu` a `modelem biezacym`,
- przejsc `wyniki -> SLD -> inspektor -> White Box -> raport -> model`.

## 2. Aksjomaty

1. Jedyna prawda modelu pozostaje Snapshot domenowy.
2. Run analizy jest przypiety do konkretnego snapshotu i nie moze byc interpretowany na "jakims aktualnym modelu".
3. Osadzony SLD w `#results` nie jest osobnym viewerem z osobna logika. Jest read-only projekcja tego samego kanonicznego SLD.
4. Overlay wynikowy nie zmienia geometrii. Naklada informacje na geometrie juz wynikajaca ze snapshotu.
5. Selection jest jedna prawda dla tabel wynikow, SLD, inspektora i White Box.
6. White Box i raport musza byc otwierane w kontekscie tego samego `run_id` i tego samego `snapshot_id`.
7. Powrot do modelu nie moze gubic zaznaczenia elementu ani informacji, czy uzytkownik oglada model biezacy czy snapshot runu.

## 3. Definicje

### 3.1 Model biezacy

Aktualny snapshot roboczy aplikacji, na ktorym operator moze wykonywac mutacje domenowe.

### 3.2 Snapshot runu

Snapshot, na ktorym wykonano konkretne uruchomienie analizy. Jest niemutowalny dla potrzeb audytu wynikow, White Box i raportu.

### 3.3 Osadzony SLD

Prawa kolumna albo panel pomocniczy w `#results`, renderujacy read-only SLD dla aktywnego kontekstu wynikowego.

### 3.4 Selection context

Minimalny wspolny kontekst nawigacyjny:
- `route`
- `run`
- `snapshot`
- `view`
- `sel`
- `type`
- opcjonalnie `trace_step`

## 4. Kanoniczne tryby pracy

### 4.1 Tryb modelu biezacego

- Route glowna: `#editor`
- Mutacje domenowe: dozwolone
- SLD: interaktywny
- Inspektor: pokazuje model biezacy
- Wyniki: tylko odniesienie do runu, nie zrodlo prawdy o geometrii

### 4.2 Tryb snapshotu runu

- Route glowna: `#results`
- Mutacje domenowe: zakazane
- SLD: read-only
- Overlay: wlaczony zgodnie z aktywnym runem
- Inspektor: pokazuje dane elementu z kontekstu runu
- White Box i raport: otwierane w tym samym kontekscie runu

### 4.3 Tryb pomocniczego sladu obliczen

- Route pomocnicza: `#proof`
- White Box pozostaje pomocniczym widokiem audytowym, ale nie moze zrywac kontekstu `run + snapshot + selection`
- Jesli widok legacy pozostaje w repo, jest jawnie traktowany jako izolowany helper, nie osobna prawda systemowa

## 5. Kontrakt URL

Docelowy, wiążacy kontrakt URL dla przeplywow wynikowych:

- `mode=run|batch|compare`
- `run=<run_id>`
- `snapshot=<snapshot_id>`
- `view=current|run`
- `sel=<element_id>`
- `type=<element_type>`
- `name=<element_name>`
- `trace_step=<index>` opcjonalnie
- `overlay=result|delta|none` opcjonalnie

Reguly:
- `#results` i `#proof` musza byc deep-linkowalne.
- `snapshot` jest obowiazkowy, gdy route reprezentuje audyt konkretnego runu.
- `view=run` oznacza ogladasz snapshot runu.
- `view=current` oznacza ogladasz model biezacy, ale nadal w kontekscie konkretnego runu.
- Przejscia miedzy `#results`, `#proof` i `#editor` zachowuja caly dozwolony kontekst, a nie tylko `sel`.

## 6. Kontrakt selection

Selection ma byc jedna prawda dla:
- tabel wynikow,
- osadzonego SLD,
- glownego SLD w edytorze,
- inspektora,
- White Box,
- raportu.

Selection nigdy nie moze byc opisywana osobnymi lokalnymi strukturami dla:
- "wynikow",
- "proof",
- "inspektora".

Minimalna tozsamosc selection:
- `element_id`
- `element_type`
- `element_name`

Rozszerzenie wynikowe:
- `run_id`
- `snapshot_id`
- `trace_step` opcjonalnie

## 7. Kontrakt osadzonego SLD

1. Workspace wynikow renderuje ten sam renderer SLD albo ten sam kontrakt renderowania, co edytor.
2. Geometria w `#results` wynika z aktywnego snapshotu, nie z lokalnych uproszczen workspace.
3. Overlay jest warstwa wizualna. Nie przesuwa symboli i nie generuje alternatywnej topologii.
4. Klik w wynik:
   - ustawia selection,
   - centruje osadzony SLD,
   - ustawia inspektor,
   - daje mozliwosc wejscia do White Box bez utraty selection.
5. Klik w osadzony SLD:
   - ustawia ten sam selection context,
   - nie uruchamia mutacji,
   - moze otworzyc inspektor i White Box.

## 8. Relacja snapshot runu vs model biezacy

System musi jawnie rozrozniac dwa stany:

### 8.1 Zgodnosc

Model biezacy odpowiada temu samemu snapshotowi co aktywny run.

### 8.2 Rozjazd

Model biezacy zostal zmieniony po wykonaniu runu.

W obu przypadkach UI musi pokazywac:
- `run_id`,
- `snapshot_id`,
- tryb widoku: `snapshot runu` albo `model biezacy`,
- komunikat o zgodnosci lub rozjezdzie.

Zakazane:
- ciche podmienienie snapshotu runu na model biezacy,
- White Box dla runu A otwarty na selection z modelu B bez ostrzezenia,
- raport bez jawnego wskazania, ktorego snapshotu dotyczy.

## 9. Przejscia obowiazkowe

### 9.1 Wyniki -> White Box

White Box dostaje:
- `run_id`
- `snapshot_id`
- `element_id`
- `element_type`
- `trace_step` jesli wywolanie wyszlo z konkretnego kroku

### 9.2 Wyniki -> model

Powrot do modelu ma dwie legalne semantyki:
- `pokaz ten element w modelu biezacym`
- `wroc do wynikow tego samego runu`

UI nie moze udawac, ze model biezacy i snapshot runu to to samo, jesli sa rozne.

### 9.3 White Box -> raport

Raport dziedziczy ten sam `run_id` i `snapshot_id`.

## 10. Decyzje wiazace dla repo

- `frontend/src/ui/results-workspace/*` jest kanonicznym miejscem pracy na wynikach.
- `frontend/src/ui/results-inspector/LegacyTraceWorkspacePage.tsx` jest helperem do czasu pelnego scalenia, nie rownoleglym produktem.
- `frontend/src/ui/navigation/urlState.ts` i `frontend/src/ui/results-workspace/store.ts` maja docelowo wspoldzielic jeden model serializacji kontekstu wynikowego.
- `frontend/src/ui/sld/inspector/useSldInspectorSelection.ts` pozostaje glownym hookiem inspektora, ale ma pracowac na jednym selection context, nie na lokalnych obejsciach.

## 11. Definition of Done dla tego obszaru

Obszar jest domkniety dopiero wtedy, gdy:
- `#results` ma osadzone read-only SLD,
- `#proof` i raport dziedzicza `run + snapshot + selection`,
- selection i URL sa jedna prawda,
- UI pokazuje roznice miedzy `snapshotem runu` i `modelem biezacym`,
- nie ma lokalnych fallbackow ani cichych podmian snapshotu.
