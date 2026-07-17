# KARTA ZADANIA K2 — ADAPTER KONWENCJI ZNAKU Q (rozstrzygnięcie V12K-027, opcja B)

**Typ:** delta backendowa (application) · **Wykonawca:** Opus · **Warstwa:**
application (ZERO zmian w `network_model/solvers/**`, `enm/**` — `PowerFlowResult`
pozostaje FROZEN) · **Wiążące:** CLAUDE.md (NOT-A-SOLVER; No-Heuristics — adapter
to deterministyczne przekształcenie znaku, nie korekta wyniku; WHITE BOX),
DECYZJA WŁAŚCICIELA V12K-027 = **opcja B** (2026-07-17).

## 0. Decyzja właściciela (WIĄŻĄCA — cytat)
`PowerFlowResult` FROZEN, bez zmian. Solver liczy poprawnie (dowód K1). Źródłem
niespójności jest INTERPRETACJA `slack_q`/`q_from`/`q_to` przy wyznaczaniu cosφ
w D8. Rozwiązanie: **dedykowana warstwa interpretacyjna (adapter konwencji
znaków)** w warstwie aplikacyjnej + jednoznaczna dokumentacja konwencji.

### Kanoniczna konwencja aplikacyjna (obowiązująca po adapterze)
- **P > 0** — pobór mocy czynnej,
- **Q > 0** — pobór mocy biernej INDUKCYJNEJ,
- **Q < 0** — moc bierna POJEMNOŚCIOWA (kompensacja).
Dopiero po przekształceniu danych do tej postaci liczyć: moc bierną netto,
cosφ, stopień kompensacji, dobór baterii.

## 1. Zadanie
1. NOWY moduł `application/analyses/konwencja_mocy.py` — adapter konwencji:
   funkcja przekształcająca wielkości mocy biernej z konwencji `PowerFlowResult`
   (branch_results `q_from_mvar`/`q_to_mvar` — injekcja do gałęzi na danym końcu;
   `slack_q_mvar`) na KANONICZNĄ konwencję aplikacyjną (§0). Docstring modułu =
   JEDNOZNACZNA dokumentacja konwencji kanonicznej + odwzorowanie z konwencji
   solvera (z cytatem plik:linia solvera i K1 jako dowodu). Funkcja pomocnicza
   „moc bierna netto w punkcie" = suma incydentnych przepływów gałęzi PO
   przełożeniu na znak kanoniczny (dodatnia = netto indukcyjny pobór punktu).
   ZERO fizyki, ZERO heurystyk — czyste przekształcenie znaku wg udokumentowanej
   reguły; regułę wyprowadź z fixtur K1 (`tests/application/analyses/
   test_diagnostyka_znaku_shunt.py` — twarda prawda liczbowa: kondensator na
   odbiorze indukcyjnym MUSI zmniejszać |Q netto indukcyjne| punktu → cosφ rośnie).
2. Przebudowa `dobor_kompensacji._point_cos_phi` (`dobor_kompensacji.py:200-265`):
   `q_sum`/cosφ liczone Z WYNIKU adaptera (Q netto w konwencji kanonicznej),
   NIE z surowego `q_to`/`q_from`. cosφ = |P| / hypot(P, Q_netto_kanoniczne).
   Warunek fizyczny do spełnienia: dodanie kondensatora do odbioru indukcyjnego
   PODNOSI cosφ (dziś obniża — to jest naprawiany błąd). Werdykty D8
   (`_candidate_verdict`, `_meets`) bez zmian strukturalnych — tylko źródło cosφ.
3. Ślad WHITE BOX: adapter eksponuje wielkości przed/po przekształceniu
   (surowe q_from/q_to → znak kanoniczny → Q netto) dla audytu.

## 2. Testy kontraktowe (WYMÓG WŁAŚCICIELA — wszystkie 7)
NOWY plik `tests/application/analyses/test_konwencja_mocy_biernej.py` (+ rozszerz
istniejące testy D8 o intencję kompensacji). Scenariusze (przypadki minimalne,
wzorzec z K1 — slack + odbiór + gałąź o znanej impedancji, rachunek w komentarzu):
1. odbiór indukcyjny BEZ kompensacji → Q netto > 0, cosφ < 1 (wartość liczbowa),
2. CZĘŚCIOWA kompensacja → cosφ ROŚNIE względem (1) (asercja kierunku — kluczowa),
3. PEŁNA kompensacja → cosφ ≈ 1 (Q netto ≈ 0),
4. PRZEKOMPENSOWANIE → Q netto < 0 (pojemnościowy), cosφ < 1 z drugiej strony,
5. przepływ ODWROTNY dla źródeł OZE/BESS (generacja) → znak kanoniczny spójny,
6. bilans `q_from`/`q_to` gałęzi (spójność adaptera na obu końcach),
7. zgodność z bilansem mocy biernej całego układu (suma Q netto punktów vs
   `slack_q` + generacja, w granicach strat — tolerancja jawna).

## 3. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD`. Baza pełnego pytest: 6112, ZERO failed. Środowisko: venv
główny (D2vgvUMQ); pełny pytest do pliku (`-q > pelny_pytest.log 2>&1; tail -2`),
NIGDY na goły potok; przed pełnym biegiem `until ! ps aux | grep -E
"vitest|pytest" | grep -v grep > /dev/null; do sleep 30; done`; po biegu
NATYCHMIAST commit. Celowane (7 kontraktowych + D8) + PEŁNY pytest ZERO failed
(istniejące testy D8 i K1 muszą przejść — K1 jest READ-ONLY dowodem, NIE zmieniaj
jego asercji; jeśli test D8 asertował dziś błędny kierunek cosφ, popraw go
Z INTENCJĄ i komentarzem, że to naprawa V12K-027). ruff/black/mypy na twoich
plikach; guardy: arch, solver_boundary, pcc_zero, load_flow_no_heuristics
(venv główny). ZERO zmian w `network_model/solvers/**`, `enm/**`. Commit
`feat(application): adapter konwencji znaku Q + naprawa cosφ w doborze
kompensacji (K2, V12K-027 opcja B)` BEZ push. Raport standardowy (plik:linia;
wyprowadzenie reguły znaku z K1; potwierdzenie że cosφ rośnie z kompensacją).
