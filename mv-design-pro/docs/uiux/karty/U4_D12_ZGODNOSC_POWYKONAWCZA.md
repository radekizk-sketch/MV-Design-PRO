# KARTA ZADANIA D12 — DELTA BACKENDOWA: ZGODNOŚĆ POWYKONAWCZA (P45)

**Faza:** U4 · **Epik:** E11/E13 · **Wykonawca:** Opus · **Warstwa:** backend ·
**Wiążące:** CLAUDE.md (NOT-A-SOLVER: porównanie pomiarów z obiektu z wynikiem
FROZEN solvera rozpływu = czysta interpretacja, ZERO estymacji/korekt/dopasowań
modelu; No-Heuristics: tolerancje jawne — z parametrów wywołania albo
udokumentowanych stałych normatywnych ze źródłem; WHITE BOX), wzorce:
`application/analyses/energy_validation/service.py` (dostęp do wyniku PF:
`_reconstruct_power_flow_result`:37, walidacja rodzaju przebiegu:125),
`api/quality_analysis_runs.py` (rodzina, `_require_run`:28).

## 0. Rozstrzygnięcia zarządcy (WIĄŻĄCE — z rekonesansu)
1. Stan zastany: infrastruktury importu CSV NIE ma; `enm.Measurement`
   (`enm/models.py:472`) to przekładniki CT/VT (urządzenia), NIE wartości
   pomiarowe — NIE mieszaj; wartości pomiarów z obiektu NIE wchodzą do ENM
   (to dane odbiorowe, nie model sieci) — żyją wyłącznie w żądaniu i wyniku
   analizy. Solver WLS (`state_estimation_wls.py`) ISTNIEJE, ale P45 go NIE
   używa — porównanie 1:1, bez estymacji (odnotuj w `zalozenia_pl`).
2. Wejście: POST (jedyna końcówka rodziny z body — uzasadnione rozmiarem
   danych pomiarowych): `run_id` (przebieg PF FINISHED), `tolerancje`
   (opcjonalne: napiecie_pct, moc_pct — domyślne z udokumentowanym źródłem
   albo wymagane jawnie; bez źródła dla domyślnej → wymagaj jawnej wartości
   422 PL), `pomiary`: lista wierszy {element_ref, wielkosc: "U"|"P"|"Q",
   wartosc, jednostka} ORAZ alternatywnie `csv` (tekst; parser stdlib `csv`,
   nagłówek `element_ref;wielkosc;wartosc;jednostka`, średnik LUB przecinek —
   wykryj po nagłówku; przecinek dziesiętny PL dopuszczalny przy średniku;
   błędy parsowania → 422 PL z numerem wiersza).
3. Porównanie: U z `bus_results.u_pu` (przelicz na kV po `nominal_kv` węzła —
   jak `grid_strength._nominal_kv_by_bus`), P/Q z `branch_results.p_from_mw/
   q_from_mvar` (kierunek „from" — udokumentuj; konwencja znaku Q: NIE
   interpretuj znaku poza wartością bezwzględną odchyłki, dopóki V12K-040
   nierozstrzygnięte — porównuj |wartości| dla Q i odnotuj w `zalozenia_pl`).
   Odchyłka bezwzględna + procentowa względem wartości modelowej; werdykt PL
   per punkt („w tolerancji" / „poza tolerancją" / „brak odpowiednika w
   modelu" / „brak wyniku dla elementu"). Element_ref nieznany w snapshocie →
   uczciwy wiersz raportu, nie 422.
4. Raport: podsumowanie (liczby punktów wg werdyktów, największa odchyłka),
   wiersze deterministycznie posortowane (element_ref, wielkosc),
   `input_hash` (run_id + pomiary + tolerancje), ślad WHITE BOX
   (model → pomiar → odchyłka → tolerancja → werdykt).

## 1. Cel
Domknięcie pętli projekt → budowa → odbiór: raport rozbieżności pomiarów
z obiektu (rejestratory, CSV) względem modelu (wynik rozpływu) i jawnych
tolerancji — deterministyczny, audytowalny, po polsku.

## 2. Zakres
1. `application/analyses/zgodnosc_powykonawcza.py` — serwis
   `build_zgodnosc_powykonawcza_view(run, pomiary, tolerancje)` + parser CSV
   (osobna funkcja, testowalna).
2. Końcówka `POST /api/quality/as-built-compliance` w
   `api/quality_analysis_runs.py` (pydantic model żądania; 404 przebieg,
   422 PL: zły rodzaj przebiegu, brak pomiarów, błąd CSV, brak tolerancji
   bez źródła domyślnego).
3. Testy ≥ 16 w `tests/application/analyses/test_zgodnosc_powykonawcza.py`
   (+ API): punkt w tolerancji / poza (rachunek ręczny), U w kV z u_pu
   (rachunek), nieznany element_ref → wiersz „brak odpowiednika", parser CSV
   (średnik+przecinek dziesiętny, przecinek+kropka, błąd → 422 z numerem
   wiersza), determinizm (hash, sortowanie), zły rodzaj przebiegu → 422,
   404, pusta lista pomiarów → 422, Q porównywane po |wartości| z założeniem.

## 3. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD` (HEAD = commit tej karty lub nowszy). Baza pełnego pytest:
5986 passed, ZERO failed. Celowane + PEŁNY pytest ZERO failed; ruff/black/mypy
na twoich plikach; guardy: arch, solver_boundary, pcc_zero,
load_flow_no_heuristics (pipefail; przy >600 s odczytaj wynik i NATYCHMIAST
commit+raport). ZERO zmian w `network_model/solvers/**`, `enm/**`. Commit
`feat(api): raport zgodności powykonawczej z pomiarów obiektu (D12)` BEZ push.
Raport standardowy (plik:linia, źródła ewentualnych tolerancji domyślnych).
