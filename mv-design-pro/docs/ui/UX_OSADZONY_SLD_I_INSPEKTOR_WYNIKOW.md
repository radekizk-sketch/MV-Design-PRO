# UX OSADZONY SLD I INSPEKTOR WYNIKOW

**Status:** WIAZACY
**Data:** 2026-04-04
**Zakres:** UX operatora SN dla `#editor`, `#results`, `#proof`

## 1. Cel

Opisac prosty, przemyslowy przeplyw pracy operatora SN bez rozjazdu miedzy:
- tabela wynikow,
- osadzone SLD,
- inspektor,
- White Box,
- raport,
- powrotem do modelu.

## 2. Zasada UX

Uzytkownik nie ma "skakac po produktach". Ma pracowac w jednym ciagu:
- modeluje siec,
- uruchamia analize,
- oglada wyniki,
- wskazuje element,
- czyta White Box albo raport,
- wraca do tego samego elementu.

## 3. Uklad ekranu `#results`

### 3.1 Lewa kolumna

- lista runow i statusow,
- aktywny filtr,
- identyfikacja aktywnego runu.

### 3.2 Srodkowa kolumna

- tabele wynikow,
- status `PENDING`, `RUNNING`, `DONE`, `FAILED`,
- akcje dla aktywnego runu:
  - `Pokaz w SLD`
  - `White Box`
  - `Raport`
  - `Powrot do modelu`

### 3.3 Prawa kolumna

- osadzony SLD tylko do odczytu,
- ten sam element zaznaczony co w tabeli,
- ten sam kontekst selection co w inspektorze.

## 4. Widoczne identyfikatory kontekstu

Wyniki musza zawsze pokazywac:
- `Run`
- `Snapshot`
- `Tryb widoku`
- `Status zgodnosci z modelem biezacym`

Przyklad etykiet:
- `Run: 4b6a...`
- `Snapshot: 90f1...`
- `Widok: Snapshot runu`
- `Model biezacy rozni sie od runu`

## 5. Zachowanie przy rozjezdzie modelu

Jesli model biezacy zostal zmieniony po analizie:
- UI pokazuje banner ostrzegawczy,
- osadzony SLD nadal domyslnie pokazuje `snapshot runu`,
- przycisk `Powrot do modelu` nie moze sugerowac, ze to ten sam stan,
- White Box i raport dalej odnosza sie do snapshotu runu.

## 6. Semantyka przyciskow

### 6.1 `Powrot do modelu`

Znaczy:
- przejdz do `#editor`,
- zachowaj zaznaczenie elementu,
- nie zgub informacji, z jakiego runu przyszedles.

Nie znaczy:
- "przelacz wyniki na model biezacy bez ostrzezenia".

### 6.2 `White Box`

Znaczy:
- otworz slad dla tego samego runu,
- wejdz z tym samym elementem,
- jesli to mozliwe, ustaw odpowiedni krok trace.

### 6.3 `Raport`

Znaczy:
- generuj raport dla tego samego runu i tego samego snapshotu,
- opcjonalnie zawez do aktywnie zaznaczonego elementu.

## 7. Zasady dla inspektora

Inspektor jest jeden, ale ma dwa jawne tryby:
- `Model biezacy`
- `Snapshot runu`

Inspektor w trybie runu pokazuje:
- identyfikacje elementu,
- pochodzenie katalogowe, jesli dostepne,
- parametry materializowane,
- wyniki dla elementu,
- link do White Box i raportu.

Inspektor nie moze:
- pozwalac na mutacje w trybie wynikowym,
- udawac, ze dane pochodza z modelu biezacego, jesli sa z runu.

## 8. Zasady dla selection

Klik w dowolnym miejscu ma prowadzic do tego samego efektu:
- klik w tabeli,
- klik w SLD,
- klik w inspektorze,
- klik w White Box.

Efekt:
- ten sam element staje sie aktywny,
- URL niesie ten sam kontekst,
- UI nie tworzy lokalnej "drugiej selekcji".

## 9. Zasady jezykowe

W UX uzywamy tylko polskich nazw:
- `Edytor sieci`
- `Wyniki i analiza`
- `Slad obliczen`
- `Snapshot runu`
- `Model biezacy`
- `Powrot do modelu`

Nie uzywamy jako glownych etykiet:
- `legacy trace workspace`
- `results inspector`
- `workspace helper`

## 10. Zakazane wzorce UX

- placeholder zamiast prawdziwego osadzonego SLD w workspace wynikow,
- dwa niezalezne panele selection dla wynikow i SLD,
- brak widocznego `snapshot_id`,
- przejscie do White Box bez zachowania aktywnego elementu,
- raport bez informacji, ktorego runu dotyczy.
