# KARTA ZADANIA K3 — REKALIBRACJA ADAPTERA KONWENCJI PO NAPRAWIE F9.8 (konsolidacja wątków)

**Typ:** delta backendowa (application + testy) · **Wykonawca:** zarządca (przejęcie —
rekalibracja precyzyjna po scaleniu wątku SLD) · **Warstwa:** application (ZERO zmian
w `network_model/solvers/**`, `enm/**` — `PowerFlowResult` pozostaje FROZEN) ·
**Wiążące:** CLAUDE.md, decyzja właściciela V12K-040 (opcja B), scalenie konsolidacyjne
wątku SLD (commit `75a70d3f`).

## 0. Stan faktyczny (rozstrzygnięcie zarządcy — WIĄŻĄCE)
1. Wątek SLD w rundzie **F9.8** (commit `6508c12f`, 2026-07-15, recenzja APPROVE
   z niezależną reprodukcją) naprawił KRYTYCZNY defekt canonical PF pipeline:
   podwójną negację znaku mocy (obciążenia wchodziły do solvera jako generacja).
   Naprawa na granicy budowy PQSpec (`enm/canonical_analysis.py`,
   `sld_substrate_power_flow.py`); solver niskopoziomowy i `PowerFlowResult`
   NIETKNIĘTE.
2. **Pierwotna przyczyna anomalii V12K-040** (cosφ z przepływu gałęzi malał
   po dodaniu baterii; „anomalia znaku shuntu") była TYM SAMYM defektem —
   odwróconym znakiem pipeline, nie cechą solvera. Po F9.8 (pomiar zarządcy,
   skrypt `pomiar_k3.py`, sieć K1: slack → linia 5 km → odbiór 1,0+j0,5):
   - bez baterii: `v_load=0,989299` (<1 — fizyczny spadek), `q_to=−0,500000`,
     `slack_q=+0,509650`;
   - z baterią 0,5 Mvar: `q_to=−0,006904`, `slack_q=+0,014566` — przepływ bierny
     gałęzi MALEJE po kompensacji (anomalia ZNIKŁA);
   - `−q_to + rated·V² = +0,500000` STAŁE dla całego przeglądu baterii
     (0,1…2,4 Mvar) — potwierdzenie reguły odwzorowania;
   - odbiór wyprzedzający (q=−0,5): `slack_q=−0,490497`, kondensator 0,5:
     `slack_q=−0,487410` — znaki ZGODNE (sprzeczność interpretacyjna K1 znikła).
3. Decyzja właściciela V12K-040 (opcja B) POZOSTAJE w mocy: adapter konwencji
   w warstwie aplikacyjnej + rozdział DWÓCH wielkości cosφ (przekrój/punkt).
   Zmienia się wyłącznie REGUŁA ODWZOROWANIA i wartości odniesienia.
4. **DRUGIE ZNALEZISKO (defekt następczy F9.8)**: montaż wyniku w
   `enm/canonical_analysis.py:1256` przekazywał `pq.p_mw`/`pq.q_mvar` (PQSpec —
   po F9.8 konwencja OBCIĄŻENIOWA) wprost jako `node_p_injected_pu`, przez co
   FROZEN pole `BusResult.p_injected_mw` („ujemna = pobór",
   `power_flow_result.py:35`) niosło dla szyn PQ znak POBORU — odwrotny do
   kontraktu i do slacka (pomiar: szyna odbioru 1,0 MW → `p_injected=+1,0`;
   golden `bus_sn_c` netto-generacyjna → `−0,8`). Naprawa: negacja przy montażu
   (ten sam wzorzec granicznej konwersji co F9.8, ten sam plik). Dowód
   poprawności: 3 testy D7 (`test_odpowiedz_osd_service`), które kodowały
   udokumentowaną konwencję, przechodzą PO naprawie BEZ zmian asercji.
   Wyjątek od bramki „ZERO zmian w enm/**" — udokumentowany tutaj i w PLANS;
   `PowerFlowResult` (solver) nietknięty, naprawa przywraca jego kontrakt.

## 1. Zakres
1. `application/analyses/konwencja_mocy.py`: reguła odwzorowania
   tożsamość → **NEGACJA** końca incydentnego (po F9.8 przepływ końca gałęzi to
   injekcja węzła DO gałęzi; pobór punktu = −(przepływ końca)). Docstring modułu:
   nowa konwencja solvera z cytatem F9.8, sekcja „anomalia znaku shuntu"
   zastąpiona notą historyczną (anomalia usunięta przez F9.8; księgowanie
   `Q_cap_eff = rated·V²` pozostaje jako wielkość STEROWNIKA doboru — Wymóg 2).
2. `application/analyses/dobor_kompensacji.py`: `q_load = q_przekroju + q_cap_eff`
   (odwrócenie dawnej korekty anomalnej — po F9.8 przepływ już ZAWIERA efekt
   baterii, więc odzysk zapotrzebowania odbioru wymaga DODANIA `Q_cap_eff`);
   docstringi `_point_cos_phi` i moduł.
3. Testy: `test_diagnostyka_znaku_shunt.py` (K1), `test_dowod_v12k040.py`,
   `test_konwencja_mocy_biernej.py` (7 kontraktowych) + testy D8/API — nowe
   wartości odniesienia z pomiaru §0.2, z jawną notą intencji: „wartości
   przemierzone po naprawie F9.8 (commit 6508c12f)". K1 przestaje dokumentować
   sprzeczność (testy przeformułowane na zgodność znaków po F9.8).
4. Rejestr `docs/v12xx/REJESTR_KONFLIKTOW.md` V12K-040: adnotacja o pierwotnej
   przyczynie i F9.8; PLANS §3.-1 wpis.

## 2. Bramki
Celowane (K1 + K2 + dowód + D8 + API compensation-sizing) ZERO failed; PEŁNY
pytest ZERO failed na drzewie skonsolidowanym; ruff/black/mypy na zmienionych
plikach; guardy: arch, solver_boundary, pcc_zero, load_flow_no_heuristics
(venv główny). ZERO zmian w `network_model/solvers/**`, `enm/**`. Commit
`fix(application): rekalibracja adaptera konwencji Q po naprawie F9.8 (K3, V12K-040)`.
