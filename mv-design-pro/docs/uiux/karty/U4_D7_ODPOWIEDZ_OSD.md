# KARTA ZADANIA D7 — DELTA BACKENDOWA: SYMULACJA ODPOWIEDZI NA POLECENIA OSD (P40)

**Faza:** U4 · **Epik:** E11 · **Wykonawca:** Opus · **Warstwa:** backend ·
**Wiążące:** CLAUDE.md (NOT-A-SOLVER: solver rozpływu z falownikami — w tym LFSM-O/U —
JUŻ ISTNIEJE: `network_model/solvers/power_flow_inverter.py:60-95` `InverterControl`
z lfsm_droop_pct/deadband/allow_increase i trybami Q; delta = WYŁĄCZNIE orkiestracja
w application jak D3/D5), wzorzec D3/D5 (bieg w pamięci przez `_execute_power_flow`).

## 1. Cel
Symulacja zachowania źródła na polecenie OSD: dla wskazanego źródła i polecenia
(a) ograniczenie mocy czynnej do X% Pn, (b) zadany cosφ / zadana Q, (c) odpowiedź
częstotliwościowa LFSM-O/U przy zadanej częstotliwości systemowej f — wykonaj DWA biegi
rozpływu (stan bazowy + stan z poleceniem) i zwróć porównanie: P/Q źródła, napięcia
węzłów (delta), straty — wszystko z wyników solvera.

## 2. Zakres
1. **RECON WIĄŻĄCY**: ZBADAJ jak `InverterControl` per źródło jest budowany na ścieżce
   `_execute_power_flow` (solver_input/mapowanie z modelu/katalogu: control_mode,
   lfsm_*, cosφ — skąd pochodzą wartości i czy `run.options`/snapshot pozwala je
   nadpisać per bieg BEZ dotykania solvera). Jeżeli nastawy nie są nadpisywalne przez
   istniejące wejście biegu — STOP-RAPORT z opisem opcji (bez obejścia i bez zmiany
   solvera).
2. `application/analyses/odpowiedz_osd.py` — serwis: bieg bazowy + bieg z poleceniem
   (nadpisanie nastaw/wartości źródła w snapshocie w pamięci — jak generator próbny
   w D3, tu modyfikacja ISTNIEJĄCEGO źródła w KOPII snapshotu; udokumentuj że to kopia
   w pamięci, zero mutacji modelu); odpowiedź: per źródło P/Q przed/po, napięcia
   węzłów przed/po (delta), straty przed/po, parametry polecenia, hash wejścia,
   ślad WHITE BOX (co nadpisano, wynik obu biegów).
3. Końcówka `GET/POST /api/oze-analysis/osd-response` (konwencja rodziny; parametry
   polecenia jawne; 404/422 PL).
4. Testy ≥ 14: ograniczenie P (P po ≤ zadanego), zadana Q/cosφ (wartości z wyniku
   solvera), LFSM-O przy f>f0+deadband (P spada wg statyzmu — wartości Z SOLVERA,
   test porównuje bieg vs bieg, nie liczy wzorem), determinizm, 404/422.

## 3. Bramki
Jak D3–D6: celowane + PEŁNY pytest ZERO failed (baza 5856); ruff/black/mypy na twoich
plikach; guardy arch/solver_boundary/pcc/load_flow_no_heuristics (pipefail; przy >600 s
odczytaj wynik i NATYCHMIAST commit+raport). Commit
`feat(api): symulacja odpowiedzi źródła na polecenia OSD (D7)` BEZ push.
Raport standardowy z rozstrzygnięciem recon (plik:linia).
