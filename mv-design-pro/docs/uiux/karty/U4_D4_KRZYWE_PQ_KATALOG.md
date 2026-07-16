# KARTA ZADANIA D4 — DELTA KATALOGOWA: KRZYWE ZDOLNOŚCI P–Q FALOWNIKÓW (P41 backend)

**Faza:** U4 · **Epik:** E4/E11 · **Wykonawca:** Opus · **Warstwa:** backend (katalog +
application + API) · **Wiążące:** CLAUDE.md (Catalog Binding Rule; typy katalogu
NIEZMIENNE po publikacji — delta wyłącznie ADDYTYWNA, pole opcjonalne; wszystkie guardy
katalogowe muszą przejść), `PROPOZYCJE_ROZSZERZEN` P41.

## 1. Cel
1. **Katalog**: opcjonalne pole `pq_curve` w `ConverterType`
   (`network_model/catalog/types.py:954`): deterministyczna lista punktów
   `(p_mw, q_min_mvar, q_max_mvar)` rosnąco po p_mw (krzywa producenta przy U znam.;
   warianty napięciowo-temperaturowe = przyszła karta — pole główne wystarcza dla
   weryfikacji zakresu). Serializacja w `to_dict`/parserach 1:1; istniejące rekordy bez
   pola działają bez zmian (None). Dodaj krzywe do KILKU rekordów referencyjnych
   katalogu konwerterów (`mv_converter_catalog.py`) — wartości SPÓJNE z istniejącymi
   q_min/q_max (prostokąt → realistyczne zwężenie przy p_max; skomentuj jako profil
   referencyjny do potwierdzenia kartą producenta).
2. **Weryfikacja pokrycia**: serwis `application/analyses/pq_coverage.py` — dla modułu
   (converter type + operator NC RfG) porównaj krzywą producenta z wymaganiem operatora
   (ZBADAJ profil `catalog/profiles/nc_rfg` — `reactive_power` w profilu operatora;
   wymaganie prostokątne/procentowe P_n) punkt po punkcie: wynik per punkt
   (pokryty/niepokryty + margines [Mvar]) + werdykt całości + WHITE BOX (wzór
   porównania, dane, wynik). Zero fizyki — porównanie słownikowe wartości.
3. **API**: `GET /api/oze-analysis/pq-coverage?catalog_item_id=&operator_id=`
   (konwencja `oze_analysis_runs.py`); 404/422 PL (brak typu/krzywej/operatora —
   uczciwy komunikat „typ nie ma krzywej producenta").
4. **Testy ≥ 16**: parser/serializacja pola (w tym brak pola), monotoniczność punktów
   (walidacja wejścia katalogu — błąd konstrukcji przy nieposortowanych/ujemnych p),
   pokrycie pełne/częściowe/brak, marginesy, determinizm, 404/422.

## 2. Bramki i zasady
NIE zmieniaj istniejących pól/rekordów poza dodaniem `pq_curve`. Bramki: celowane +
PEŁNY `poetry run pytest -q` ZERO failed (baza 5783); ruff/black/mypy na twoich plikach;
guardy: arch, solver_boundary, pcc, catalog_binding, catalog_enforcement, catalog_gate,
catalog_metadata (pipefail; przy >600 s odczytaj wynik po zakończeniu i DOKOŃCZ
commit+raport w tej samej sesji — commit NATYCHMIAST po zielonych bramkach).
Commit `feat(catalog): krzywe zdolności P–Q falowników + weryfikacja pokrycia (D4)`
BEZ push. Raport standardowy z mapowaniami plik:linia i przykładem JSON.
