# KARTA ZADANIA D8 — DELTA BACKENDOWA: DOBÓR KOMPENSACJI MOCY BIERNEJ (P42)

**Faza:** U4 · **Epik:** E11 · **Wykonawca:** Opus · **Warstwa:** backend ·
**Wiążące:** CLAUDE.md (NOT-A-SOLVER: orkiestracja jak D3/D5/D7; catalog-first —
kandydaci WYŁĄCZNIE z katalogu baterii kondensatorów; No-Heuristics: dobór =
deterministyczny przegląd kandydatów, nie optymalizacja heurystyczna), wzorce:
`application/analyses/hosting_capacity.py`, `pq_area.py`, `odpowiedz_osd.py`.

## 1. Cel
Dobór kompensacji dla spełnienia wymaganego cosφ w punkcie przyłączenia (wskazany
węzeł): deterministyczny przegląd rekordów katalogu baterii kondensatorów
(`network_model/catalog/mv_shunt_capacitor_catalog.py` — ZBADAJ kształt rekordów
i jak ENM mapuje `ShuntCapacitor` → ShuntSpec solvera: `enm/models.py:309,1236`)
w rosnącej kolejności mocy: dla każdego kandydata bieg rozpływu w pamięci (shunt
dopisany do KOPII snapshotu przy wskazanym węźle — jak generator próbny D3) →
odczyt cosφ w punkcie przyłączenia Z WYNIKU solvera (przepływ P/Q gałęzi zasilającej
— ZBADAJ skąd; zero liczenia własnego poza cosφ=P/S jako projekcją prezentacyjną
z komentarzem, jeśli wynik nie niesie cosφ wprost) → pierwszy kandydat spełniający
wymaganie = dobór. Scenariusz nocny: opcjonalny drugi przegląd z generacją źródeł
ustawioną na 0 (kopia snapshotu; generacja Q kabli ujawnia się w rozpływie) —
werdykt per scenariusz (dzień/noc), dobór musi spełniać OBA jeżeli noc włączona.

## 2. Zakres
1. `application/analyses/dobor_kompensacji.py` — serwis (parametry: bus_ref punktu,
   wymagany cosφ min [np. 0,95], kierunek (pobór/oddawanie — wg konwencji wyniku),
   uwzglednij_noc: bool); odpowiedź: lista kandydatów z werdyktami (rekord katalogu,
   cosφ osiągnięty dzień/noc, spełnia/nie), dobór (pierwszy spełniający lub null +
   uczciwy powód), hash wejścia, ślad WHITE BOX.
2. Końcówka `GET /api/oze-analysis/compensation-sizing?...` (konwencja rodziny;
   404/422 PL).
3. Testy ≥ 14: dobór znajdowany (golden network z farmą/źródłem), żaden kandydat
   nie spełnia → null z powodem, scenariusz nocny zmienia dobór, determinizm,
   kolejność kandydatów rosnąca po mocy, 404/422.

## 3. Bramki
Jak rodzina D: celowane + PEŁNY pytest ZERO failed (baza 5884); ruff/black/mypy na
twoich plikach; guardy arch/solver_boundary/pcc/load_flow_no_heuristics + katalogowe
binding/enforcement (pipefail; przy >600 s odczytaj wynik i NATYCHMIAST commit+raport).
Commit `feat(api): dobór kompensacji mocy biernej z katalogu (D8)` BEZ push.
Raport standardowy z rozstrzygnięciami recon (plik:linia).
