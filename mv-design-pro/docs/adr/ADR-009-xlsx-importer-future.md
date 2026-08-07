# ADR-009: XLSX Importer Deferred

## Status
SUPERSEDED (2026-08-07, karta XLSX-IMPORT) — decyzja o odroczeniu nie odpowiada
stanowi kodu. Dokument zostaje jako zapis historyczny wraz z faktycznym stanem.

## Context
PR3 requires JSON and CSV import/export. XLSX support is optional and should only be
added if it is already standard in the repository.

## Decision
We defer XLSX import/export to a future PR. JSON and CSV contracts cover all required
workflows for PR3.

## Consequences
- No XLSX importer is included in the current implementation.
- Future work can add XLSX support without breaking existing contracts.

## Stan faktyczny (2026-08-07)

Odroczenie z tego ADR-u zostało w międzyczasie złamane po cichu: w repozytorium
istniał importer XLSX (`application/xlsx_import/`) i wpięta końcówka
`POST /api/import/xlsx` — ale **nie działały**. Pomiar karty XLSX-IMPORT
(uruchomienie końcówki na poprawnym pliku):

- `openpyxl` nie było w zależnościach → końcówka zwracała HTTP 422
  „Brak biblioteki openpyxl" dla każdego wejścia;
- wstrzykiwany `uow_factory` nie był używany → import nie tworzył projektu ani
  migawki, tylko meldował sukces;
- testy chodziły po metodzie bez wołającego produkcyjnego, więc jedno i drugie
  było niewidoczne.

Import XLSX jest dziś zdolnością **zaimplementowaną i uruchomioną**:

- `POST /api/import/xlsx/preview` — podgląd zawartości arkusza bez zapisu,
- `POST /api/import/xlsx` — nowy projekt z węzłami, gałęziami, źródłami,
  odbiorami i migawką sieci ustawioną jako aktywna (transakcyjnie),
- konsument: okno „Import sieci z arkusza (XLSX)" w przestrzeni „Projekt"
  (`frontend/src/ui2/spaces/projekt/arkusz/`).

Ograniczenie świadome: arkusz operatora nie niesie identyfikatorów katalogowych,
więc odcinki bez jawnej kolumny `typ_katalogowy` przechodzą import z zapaloną
bramką katalogową (`mapowanie_katalogowe_wymagane`) — dokładnie jak przy imporcie
archiwum ZIP. Żadnego dopasowywania typu po nazwie handlowej (zakaz zgadywania).

Pomiar, naprawy, testy i bramki: `docs/v12xx/REJESTR_KONFLIKTOW.md`, wiersz
`XLSX-IMPORT`.
