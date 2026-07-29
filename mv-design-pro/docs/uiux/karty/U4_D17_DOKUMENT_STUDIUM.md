# KARTA ZADANIA D17 — DELTA BACKENDOWA: DOKUMENT STUDIUM PRZYŁĄCZENIOWEGO (E13)

**Faza:** U4 · **Epik:** E13 · **Wykonawca:** Opus · **Warstwa:** backend ·
**Wiążące:** CLAUDE.md (kompozycja ISTNIEJĄCYCH analiz — ZERO nowych ocen;
determinizm; WHITE BOX: sekcje cytują hash wejść), wzorce dokumentów E13:
`application/analyses/certyfikat_zgodnosci.py` (D14), `wniosek_osd.py` (D15,
bramka braków), renderery PDF/DOCX D16 (determinizm bajtowy PDF:
canvas invariant=1).

## 0. Rozstrzygnięcia zarządcy (WIĄŻĄCE)
1. Dokument studium = serwerowa kompozycja TEJ SAMEJ sekwencji, którą
   frontend liczy w kreatorze studium (`ui2/oze/studium/studiumModel.ts`:
   per wariant hosting-capacity → pq-area → pq-coverage; serwisy:
   `application/analyses/hosting_capacity.py`, `pq_area.py`,
   `pq_coverage.py` — wołaj SERWISY bezpośrednio, nie przez HTTP).
   Parametry jak kreator: `catalog_item_id` (typ przekształtnika),
   `operator_id`, `warianty` (lista bus_ref, kolejność zachowana),
   `run_id` przebiegu bazowego (jak wymaga hosting_capacity — ZBADAJ
   sygnatury serwisów i końcówki `api/oze_analysis_runs.py:133,155,330`).
2. Błąd jednego wariantu NIE przerywa dokumentu (wzorzec runnera
   frontendu): sekcja wariantu z uczciwym opisem błędu PL. Braki twarde
   (nieznany typ katalogowy/operator/przebieg) → 422 PL z listą przed
   generacją (wzorzec D15).
3. Struktura dokumentu PL: nagłówek + identyfikacja projektu, założenia
   (typ modułu, operator, przebieg bazowy + hash), per wariant: zdolność
   przyłączeniowa (max moc, ograniczenie), obszar PQ (skrót), pokrycie
   wymagań PQ (werdykt), klasa NC RfG wariantu (jak `klasaNcRfg` rankingu —
   jeżeli ta klasyfikacja żyje TYLKO we froncie (`ranking/rankingModel`),
   NIE dubluj jej w backendzie: pomiń klasę albo użyj istniejącej
   klasyfikacji backendowej (`classify_module`) — decyzja z uzasadnieniem
   w raporcie, zero dwóch prawd), podsumowanie porównawcze wariantów
   (tabela), stopka z odciskami SHA-256 per sekcja + `input_hash`.
4. Eksporty: JSON + DOCX (make_docx_bytes_deterministic) + PDF
   (invariant=1, determinizm bajtowy jak D16). Końcówki
   `POST /api/oze-analysis/connection-study` (+ `.docx`, `.pdf`)
   w `api/oze_analysis_runs.py`.

## 1. Zakres
1. `application/analyses/dokument_studium.py` — serwis + renderery.
2. Końcówki jw. (404/422 PL).
3. Testy ≥ 16: dokument z 2 wariantów (sekcje per wariant, podsumowanie),
   błąd jednego wariantu → sekcja błędu + reszta liczona, braki twarde →
   422 z listą, determinizm bajtowy DOCX i PDF, hash stabilny, etykiety
   PL w obu formatach, content-type, 404, kolejność wariantów zachowana.

## 2. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD`. Baza pytest: 6089, ZERO failed. Środowisko: venv główny
(D2vgvUMQ); pełny pytest do pliku (usuń przed commitem), NIGDY na goły
potok, pętla `until` przed pełnym biegiem; po biegu NATYCHMIAST commit.
Celowane + PEŁNY pytest ZERO failed; ruff/black/mypy na twoich plikach;
guardy: arch, solver_boundary, pcc_zero, no_codenames, trace_determinism.
ZERO nowych zależności. Commit:
`feat(api): dokument studium przyłączeniowego z eksportem DOCX/PDF (D17)`
BEZ push. Raport standardowy (plik:linia; decyzja klasy NC RfG z §0.3).
