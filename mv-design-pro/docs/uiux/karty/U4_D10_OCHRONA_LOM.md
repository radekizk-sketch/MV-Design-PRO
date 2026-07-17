# KARTA ZADANIA D10 — DELTA BACKENDOWA: OCHRONA PRZED PRACĄ WYSPOWĄ / LoM (P46)

**Faza:** U4 · **Epik:** E10/E11 · **Wykonawca:** Opus · **Warstwa:** backend
(domain addytywnie + application + api) · **Wiążące:** CLAUDE.md (NOT-A-SOLVER:
ocena LoM = interpretacja normatywna, porównania deterministyczne — ZERO symulacji
fizyki wyspy; No-Heuristics: okna normatywne WYŁĄCZNIE jako udokumentowane stałe
ze źródłem PTPiREE/NC RfG/IRiESD w docstringu; WHITE BOX), wzorce:
`application/analyses/protection/sanity_checks/rules.py` (81R:436-482),
`application/protection_read_model.py`, `application/analyses/odpowiedz_osd.py`.

## 0. Rozstrzygnięcia zarządcy (WIĄŻĄCE — z rekonesansu)
1. Stan zastany: `enm/models.py` — `ProtectionSetting.function_type` (linia 54-68)
   zna TYLKO funkcje nadprądowe/ziemnozwarciowe/kierunkowe; `Bay.protection_codes`
   (linia 714, wolna lista kodów ANSI) niesie obecność funkcji;
   `ProtectionFunctionState` (linia 866) i `SpzState` (linia 891: `fast_time_s`,
   `slow_time_s`) istnieją; `_build_protection_config`
   (`application/field_read_model.py:646`) buduje funkcje wyłącznie z
   `ProtectionAssignment.settings`. Reguła sanity 81R już istnieje
   (`sanity_checks/rules.py:440`, kod funkcji "ROCOF").
2. Rozszerzenie domeny — ADDYTYWNE i TYLKO takie: do
   `ProtectionSetting.function_type` dodaj literały `"rocof_81R"`,
   `"vector_shift_78"`, `"underfrequency_81U"`, `"overfrequency_81O"`; dodaj
   opcjonalne pola nastaw: `threshold_hz_s: float | None` (df/dt),
   `threshold_deg: float | None` (przesunięcie wektora),
   `threshold_hz: float | None` (progi częstotliwościowe). Zaktualizuj
   odwzorowanie w `field_read_model._setting_to_function_state` i
   `protection_read_model.FUNCTION_META` (kody: ROCOF/81R, VECTOR_SHIFT/78,
   UNDERFREQUENCY/81U, OVERFREQUENCY/81O — spójne z istniejącymi kodami
   sanity_checks: `rules.py:159-171` używa UNDERFREQUENCY/OVERFREQUENCY).
   ZERO zmian łamiących: istniejące dokumenty ENM bez nowych pól muszą
   walidować się bez zmian (pola opcjonalne z default None).
3. Okna normatywne LoM: stałe modułu z cytowanym źródłem (docstring: nazwa
   dokumentu + punkt). Jeżeli nie możesz wskazać źródła dla konkretnej liczby —
   NIE zmyślaj: parametr wchodzi do odpowiedzi jako „brak okna normatywnego
   w katalogu — podaj wymaganie OSD" (uczciwy INFO), a okno zostaje None.
4. Koordynacja z SPZ: porównanie deterministyczne — czas zadziałania LoM
   (`time_delay_s` nastawy + brak własnych domysłów o czasie wyłącznika; jeżeli
   czasu brak → INFO „brak danych") vs czas przerwy SPZ (`SpzState.fast_time_s`
   / `slow_time_s` jednostek nadrzędnych, a gdy SpzState nieosiągalny w ENM —
   uczciwe INFO). Werdykty PL: „wyłączenie przed ponownym załączeniem SPZ" (OK) /
   „ryzyko załączenia na wyspę" (ERROR, LoM wolniejszy niż przerwa SPZ) /
   nastawa df/dt PONIŻEJ dolnego okna → WARN „ryzyko zbędnych wyłączeń
   (fałszywe wykrycie wyspy)".

## 1. Cel
Weryfikacja doboru zabezpieczeń od utraty sieci (LoM: ROCOF 81R, przesunięcie
wektora 78, kryteria częstotliwościowe 81U/81O) dla pól przyłączeniowych modułów
wytwórczych w dokumencie ENM przypadku: obecność funkcji, nastawy w oknach
normatywnych, koordynacja czasowa z automatyką SPZ. Czysta interpretacja
(porównania), wynik deterministyczny z hash wejścia i śladem WHITE BOX
(każde porównanie: wartości, okno, źródło, werdykt).

## 2. Zakres
1. Domena (addytywnie, §0.2) + aktualizacja read-modeli, bez zmiany zachowania
   dla istniejących typów funkcji.
2. `application/analyses/ochrona_lom.py` — serwis `build_ochrona_lom_view(enm)`:
   - identyfikacja pól z modułami wytwórczymi (generatory/źródła falownikowe —
     jak `grid_strength._installed_mva_by_bus` rozpoznaje typy falownikowe;
     w ENM: `enm.generators` + `bays` z `protection_ref`),
   - per pole: obecność funkcji LoM (z `ProtectionAssignment.settings` po
     rozszerzeniu ORAZ z `Bay.protection_codes` po ANSI — gdy kod jest w
     `protection_codes`, a nastaw brak → INFO „funkcja zadeklarowana bez nastaw"),
   - oceny z §0.3-0.4; brak JAKIEJKOLWIEK funkcji LoM przy module wytwórczym →
     ERROR PL,
   - odpowiedź: lista pól z werdyktami, podsumowanie, `zalozenia_pl`,
     `input_hash`, ślad WHITE BOX.
3. Końcówka `GET /api/oze-analysis/lom-protection?case_id=` — ładowanie ENM jak
   `api/enm.py:_get_enm` (wzór: `get_enm_protection_view`, `api/enm.py:175-179`);
   404 PL nieznany przypadek, 200 z uczciwymi INFO przy brakach danych.
4. Testy ≥ 14 w `tests/application/analyses/test_ochrona_lom.py` (+ API):
   moduł bez LoM → ERROR; ROCOF w oknie → OK; df/dt poniżej okna → WARN
   fałszywe wyspy; czas LoM > przerwa SPZ → ERROR ryzyko załączenia na wyspę;
   czas LoM < przerwa SPZ → OK; brak SpzState → INFO; kod w `protection_codes`
   bez nastaw → INFO; determinizm (hash); walidacja wstecz (stary dokument ENM
   bez nowych pól parsuje się bez zmian); 404; nowe literały function_type
   przechodzą walidację ENM; sanity_checks 81R niezmienione (regresja).

## 3. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD` (HEAD = commit tej karty lub nowszy). Baza pełnego pytest:
5915 passed (+ ewentualne scalenia D9) — ZERO failed. Celowane + PEŁNY pytest
ZERO failed; ruff/black/mypy na twoich plikach; guardy: arch, solver_boundary,
pcc_zero, domain_no_guessing, canonical_ops, protection_no_heuristics
(pipefail; przy >600 s odczytaj wynik i NATYCHMIAST commit+raport).
ZERO zmian w `network_model/solvers/**`. Zmiany w `enm/models.py` WYŁĄCZNIE
addytywne z §0.2. Commit
`feat(api): weryfikacja ochrony przed pracą wyspową LoM (D10)` BEZ push.
Raport standardowy z rozstrzygnięciami recon (plik:linia) + wykaz źródeł
okien normatywnych.
