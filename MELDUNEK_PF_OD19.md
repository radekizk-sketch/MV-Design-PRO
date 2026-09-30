# Meldunek karty PF-OD19 — korekta rdzenia NR: rozwiązanie na gałęzi niskonapięciowej (STOP-warunek)

Gałąź: `claude/mv-design-pro-twin-audit-u4lhy0-karta-pf-od19`, baza `2df02f85` (czubek gałęzi
`…-karta-b01-runda1`). Podstawa: decyzja ostateczna doradcy OD-19 (opcja 1), zgoda B-01 w delegacji
właściciela O-59, z jawnym STOP-warunkiem: „jeśli J_R w przypadku W3-G2 NIE ma ujemnej wartości
własnej — STOP i meldunek z pomiarem (nie wolno dosztukować progu ani innego kryterium)".

## 1. Wynik — STOP-warunek SPEŁNIONY, korekta rdzenia NIE wdrożona

**Zredukowany jakobian J_R = J_QV − J_Qθ·J_Pθ⁻¹·J_PV w punkcie zbieżności zmierzonego przypadku
W3-G2 ma WSZYSTKIE wartości własne dodatnie.** Rdzeń `network_model/solvers/power_flow_newton*.py`
pozostaje bit w bit nietknięty (odciski `solver_diff_guard` bez zmian). Zamiast korekty rdzenia karta
oddaje: diagnozę w White Box przypiętą testami poza rdzeniem, wyrocznię pandapower dla topologii W3-G2,
inwentarz klasy konsumentów `converged` i trzy znaleziska dla właściciela (§6).

Pomiar (sieć W3-G2 odtworzona recepturą speca `frontend/e2e/pasma-rozplywu-jakosc.spec.ts` 1:1 przez API,
start płaski, rdzeń NR bez zmian):

| Wielkość | Wartość |
|---|---|
| `converged` / iteracje / `max_mismatch` | `True` / 6 / 7,27·10⁻¹² p.u. |
| U „Szyna 110 kV TR1" | 1,131·10⁻¹⁹ p.u. = 1,24·10⁻¹⁷ kV, kąt −30,000° |
| Moc szyny bilansującej (Szyna GPZ S1 15 kV) | 5713,390880 MW / 21 399,1146 Mvar |
| Wartości własne J_R (12 szyn PQ, wszystkie rzeczywiste) | 0,0809 · 4,334 · 32,07 · 44,83 · 123,06 · 147,64 · 269,35 · 395,99 · 22 534,5 · 22 655,3 · 22 718,0 · 112 482,9 |
| min λ(J_R) | **+0,080879** (wektor własny: „Szyna nN stacji" 0,709, „Wyłącznik główny nN" 0,705 — szyny nN, nie szyna 110 kV) |
| σ_min(J) / cond(J) pełnego jakobianu | 3,4·10⁻¹³ / 3,1·10¹⁷ (jakobian OSOBLIWY) |
| σ_min(J_Pθ); wiersz J_Pθ szyny 110 kV; wiersz J_Qθ szyny 110 kV | 8·10⁻¹⁴; max\|·\| 7,7·10⁻¹⁴; max\|·\| 2,1·10⁻¹⁴ |
| J_QV[110,110] | +41,85 |

Ten sam wynik dla J_R liczonego przez `np.linalg.solve` i przez pseudoodwrotność (`pinv`): jedyna
różnica to wartość związana z szyną zerową (44,83 → 41,85 = J_QV[110,110]) — czyli dokładnie ta wartość,
która jest ilorazem 0/0 (§3). Pomiar jest przypięty testem
`backend/tests/network_model/solvers/test_od19_diagnoza_rozwiazania_zerowego.py::test_w3g2_start_plaski_zbiega_do_rozwiazania_zerowego_a_j_r_jest_dodatni`.

## 2. Co pokazała diagnoza — przypadek W3-G2 NIE jest gałęzią niskonapięciową krzywej P–U

Premisa karty („NR zbiega do niestabilnej napięciowo, niskonapięciowej gałęzi rozwiązania") jest w tym
przypadku nieprawdziwa. Zmierzone rozwiązanie jest **rozwiązaniem TRYWIALNYM szyny PQ o zerowej mocy**:

1. **Topologia.** Szyną bilansującą jest szyna SN GPZ („Szyna GPZ S1 15 kV"; `enm/mapping.py:1072`,
   `is_slack = bus.ref_id in source_bus_refs`). „Szyna 110 kV TR1" (tworzona przez `add_grid_source_sn`,
   `enm/domain_operations.py:4476,4507`) jest szyną **PQ o P = Q = 0**, zawieszoną WYŁĄCZNIE na
   transformatorze TR1 do szyny bilansującej (test `test_w3g2_szyna_110_kv_jest_szyna_pq_zerowej_mocy`).
2. **Równania.** Dla takiej szyny `S_k = U_k · I_k* = 0` zachodzi przy U_k = 0 dla DOWOLNEGO prądu,
   więc U_k = 0 spełnia ΔP_k = ΔQ_k = 0 dokładnie — jest to drugie, legalne rozwiązanie równań bilansu,
   niezależne od topologii i parametrów (sieć dwuszynowa slack — linia — PQ(0, 0) ma je tak samo:
   `test_szyna_pq_zerowej_mocy_ma_rozwiazanie_zerowe_zalezne_od_startu`).
3. **Mechanizm w W3-G2 — defekt fikstury speca.** Pętla
   `for (const transformer of op.snapshot?.transformers ?? [])` (`pasma-rozplywu-jakosc.spec.ts:284-299`)
   wpisuje `update_element_parameters` z tabliczką **0,63 MVA, 15/0,4 kV, uk 4 %, Dyn5** na KAŻDY
   transformator migawki — także na **TR1 110/15 kV GPZ** (z operacji `add_grid_source_sn`: 25 MVA,
   110/15 kV, uk 11 %, Yd11, i0 0,35 %, P0 25 kW). Rdzeń liczy wtedy przekładnię poza-znamionową
   (`_off_nominal_tap`, V12K-187) a = (15/110)/(0,4/15) = **5,114**, więc rozwiązanie ROBOCZE leży w
   |U_110| = 5,114 p.u. (start |U_110| = 5 → zbieżność do 5,1136 p.u., slack 0,5003 MW —
   `test_w3g2_galaz_robocza_lezy_w_przekladni_poza_znamionowej_tr1`), a start płaski 1,0 p.u. leży w
   basenie rozwiązania zerowego (starty 0,5 / 0,2 / 10⁻³ → zero; `test_w3g2_starty_ponizej_przekladni_laduja_na_zerze`).
   Z TR1 nietkniętym (25 MVA) start płaski zbiega do gałęzi roboczej: U_110 = 1,000000 p.u., slack
   0,500255 MW / 0,138819 Mvar, 3 iteracje (`test_w3g2_tr1_nietkniety_start_plaski_zbiega_do_galezi_roboczej`).
4. **Klasa, nie fikstura.** Także z poprawnym TR1 start |U_110| = 10⁻³ ląduje na zerze i jest
   raportowany jako zbieżny (slack 10,4176 MW / 227,195 Mvar = moc zwarcia TR1 do U = 0;
   `test_w3g2_tr1_nietkniety_start_bliski_zera_dalej_laduje_na_zerze`). Start |U_110| = 0,5 z TR1
   nietkniętym nie zbiega w 30 iteracjach (granica basenów).
5. **Wyrocznia pandapower 3.5.4 daje TO SAMO rozwiązanie zerowe** dla receptury speca: U_110 = 0,000000,
   moc źródła 5713,390880 MW przy i0 = P0 = 0 (|ΔP| = 2,5·10⁻⁷ MW względem rdzenia), a dla TR1
   nietkniętego zbiega do gałęzi roboczej z parytetem |ΔU| ≤ 5,9·10⁻⁷ p.u. (kryterium karty 10⁻⁶
   spełnione) — `backend/tests/golden/wyrocznie/test_pandapower_od19_w3g2.py` (marker `pandapower`,
   3 testy; uruchomione lokalnie w osobnym środowisku pandapower 3.5.4 / scipy 1.16.3: 3 passed).

## 3. Dlaczego kryterium J_R nie ma czego wykryć w tej klasie — wyprowadzenie

Dla szyny k o zerowej mocy, połączonej z szyną m gałęzią o Y_km = G_km + jB_km, w granicy U_k → 0 wyrazy
jakobianu (postać z `build_jacobian_v2` / `wyrazy_przekatne`):

```
P_k = G_kk U_k² + U_k U_m (G_km cos θ_km + B_km sin θ_km)
Q_k = −B_kk U_k² + U_k U_m (G_km sin θ_km − B_km cos θ_km)

J_Pθ,kk = −Q_k − B_kk U_k²  =  U_k U_m (B_km cos θ_km − G_km sin θ_km)   → 0   (~U_k)
J_Qθ,kk =  P_k − G_kk U_k²  =  U_k U_m (G_km cos θ_km + B_km sin θ_km)   → 0   (~U_k)
J_PV,kk =  P_k/U_k + G_kk U_k → U_m (G_km cos θ_km + B_km sin θ_km)        (skończone)
J_QV,kk =  Q_k/U_k − B_kk U_k → U_m (G_km sin θ_km − B_km cos θ_km)        (skończone)

J_R,kk = J_QV − J_Qθ·J_PV/J_Pθ  →  U_m · |Y_km|² / (G_km sin θ_km − B_km cos θ_km)
```

Wnioski: (a) jakobian pełny jest w tym punkcie **osobliwy** (wiersze kątowe szyny zerowej znikają) — kąt
θ_k szyny o U_k = 0 jest fizycznie nieokreślony; (b) człon sprzęgający J_Qθ·J_Pθ⁻¹·J_PV jest ilorazem
dwóch wielkości → 0 — J_R ma granicę skończoną, ale jej **znak zależy od kąta θ_km, o którym decyduje
wyłącznie droga iteracji** (moduł napięcia przechodzący przez zero obraca fazor o π). Pomiar na sieci
dwuszynowej: start 10⁻³ ląduje w θ_km = π → J_R = +3,214 (= U_m|Y_km|²/B_km); ta sama postać w θ_km = 0
daje −3,214. Rdzeń NR i pandapower lądują w W3-G2 na kącie dającym wartość dodatnią (J_QV[110,110] =
+41,85). Kryterium „wszystkie λ(J_R) > 0" jest więc w tej klasie **artefaktem kąta, nie własnością
fizyczną** — dosztukowanie go nie odróżniłoby rozwiązania zerowego od roboczego
(`test_j_r_w_rozwiazaniu_zerowym_jest_granica_0_przez_0_o_znaku_zaleznym_od_kata`, zgodność postaci
zamkniętej z `build_jacobian_v2` do 10⁻⁹).

**Kontrola dodatnia kryterium.** Na klasie, którą karta miała na myśli — PRAWDZIWA dolna gałąź krzywej
P–U szyny OBCIĄŻONEJ — kryterium działa: sieć dwuszynowa z odbiorem 2 MW / 0,5 Mvar ze startu ≤ 0,3 p.u.
zbiega (`converged=True`) do |U| = 0,0074253 p.u., θ = −45,9°, moc slacka 139,04 MW zamiast 2 MW, i tam
**J_R = −11,149 < 0** przy jakobianie regularnym (σ_min = 2,1·10⁻²); gałąź robocza 0,99485 p.u. ma
J_R = +3,19 (`test_galaz_niskonapieciowa_szyny_obciazonej_ma_j_r_ujemny`). Rdzeń raportuje TAKŻE to
rozwiązanie jako zbieżny wynik roboczy — to jest defekt klasy „gałąź niskonapięciowa" i kryterium J_R
byłoby na niego celne. W3-G2 do tej klasy nie należy, więc karta wg własnego STOP-warunku nie mogła być
wdrożona.

## 4. Inwentarz klasy — miejsca, które przyjmują wynik NR z `converged=True` jako roboczy

W rdzeniu `converged=True` ⇔ `max_mismatch < tolerance` (`power_flow_newton_internal.py:907`); brak
kontroli |U| wobec U_n w rdzeniu i w każdej warstwie wyżej. Bieg niezbieżny kończy się statusem
`FINISHED` (`enm/canonical_analysis.py:1307-1308`), a niezbieżność niosą tylko pola `converged`,
`reporting_status`, `quality_status`, `reporting_limitations`. Rozwiązanie zerowe z `converged=True`
przechodzi przez WSZYSTKIE poniższe miejsca. Inwentarz sporządził eksplorator (grep po `backend/src`);
pozycje oznaczone ✓ zweryfikowałem odczytem kodu osobiście, pozostałe cytuję za inwentarzem
(file:line względem `backend/src`).

| Miejsce | Co robi z `converged` | Co przy `False` |
|---|---|---|
| `network_model/solvers/power_flow_gauss_seidel.py:126-492` | własna pętla, zwraca `PowerFlowNewtonSolution`; przy `allow_fallback=True` przejście do NR (`:289-356`, `converged` przepisane z NR) | `max_iter` / `numerical_issue` |
| `network_model/solvers/power_flow_fast_decoupled.py:141-450` | własna pętla, zwraca `PowerFlowNewtonSolution`, bez przejścia do NR | `max_iter` / `singular_matrix` / `numerical_issue` |
| `enm/canonical_analysis.py:2382-2425` (`_solve_power_flow_with_method`) | wybiera NR/GS/FD, dla GS `allow_fallback=False` | oddaje dalej |
| ✓ `network_model/solvers/power_flow_oltc.py:112-282` (`solve_with_oltc`) | **nie czyta `solution.converged`**; decyzje zaczepowe z `node_voltage_kv` bieżącego rozwiązania; `trace["converged"]` (`:256`) = zbieżność pętli regulatora | regulator przestawia zaczep wg napięć rozwiązania niezbieżnego |
| `network_model/solvers/power_flow_oltc_studies.py:162-215, 378-476, 751-773` | `sweep_tap_positions` zapisuje flagę; `run_annual_oltc_profile` **nie czyta**; `optimize_tap_positions` — `converged` warunkiem dopuszczalności | punkt z flagą / napięcie z rozwiązania niezbieżnego / pozycja wykluczona |
| `enm/rozplyw_wysp.py:69-135` (`scal_rozwiazania_wysp`) | `converged = all(...)` po wyspach | wynik zbiorczy niezbieżny |
| ✓ **Dynamika t = 0:** `enm/adapter_dynamiki.py:489-591` (`punkt_pracy_z_biegu_rozplywu`) | bramki: `PF`, `FINISHED`, hash migawki, `result_v1`, `if not wynik.get("converged")` (`:547`); **bez kontroli \|U\|** | `dynamika.punkt_pracy_niepelny` |
| `api/dynamika.py:81-97`, `application/dynamika/gotowosc.py:47-79` | lista biegów PF do dynamiki filtrowana po `PF`/`FINISHED`/hash — **bez `converged`** | bieg niezbieżny na liście gotowości |
| `network_model/solvers/dynamika/silnik.py:571-622, 783-878` | napięcia punktu pracy bez kontroli \|U\|; bramka równowagi \|\|f\|\|,\|\|g\|\| ≤ eps | `dynamika.inicjalizacja_niezbiezna` |
| ✓ `network_model/solvers/dynamika/kontrakty.py:96-103` (`KOD_WYSPA_BEZ_ZRODLA`) | rdzeń dynamiki NAZWAŁ już odpowiednik tej klasy u siebie: „residuum \|S\|/\|V\| schodzi poniżej dowolnej tolerancji przez samo odjechanie napięcia … rdzeń meldował «zbieżność» przy \|V\| ~ 1e11 pu" — odmowa PRZED Newtonem | — |
| ✓ **Estymacja WLS:** `application/analyses/state_estimation/service.py:88-99` | bramka tylko `PF` + `FINISHED`; z biegu PF bierze topologię i U_n (`:122-141`), napięć rozpływu nie używa ani jako prawdy, ani jako startu; `state_estimation_wls.py` start płaski (`:659`), własna flaga zbieżności Gaussa-Newtona | — |
| `enm/canonical_analysis.py:2501-2775` (`_execute_power_flow`) | `reporting_status` / `proof_status` / `quality_status` / `dopuszczalnosc_raportowa` / `reporting_limitations` z `converged`; **bez kontroli \|U\|** | `not_reportable`, `partial`, `failed`, `solver_non_convergence`; bieg `FINISHED` |
| Grupa A (czytają `converged`): `kontyngencje_n1.py:426-436,539-560`, `sanity_bounds.py:228-300` (+ `analysis/sanity_bounds/power_flow_bounds.py:128-190` — to ta oś zgłosiła W3-G2 jako „poza zakresem wiarygodności"), `hosting_capacity.py:167-200`, `pq_area.py:167-186`, `dobor_kompensacji.py:296-340`, `protection_settings/batch_run.py:488-508`, `warunki_przylaczenia.py:180-200`, `reactive_adequacy.py:167-177`, `diagnoza_przebiegu.py:136-215`, `proof_engine/packs/p14_power_flow.py:255-330` (ostrzeżenie U < 0,9 / > 1,1 p.u., `WARN`), `power_flow_comparison/service.py:215-256` | przy `False` odmawiają / wygaszają | — |
| Grupa B (bramka tylko `FINISHED`, `converged` nieczytane): `energy_validation/service.py:55-69` → `analysis/energy_validation/builder.py:218-282` (U ≈ 0 daje δU ≈ 100 % = `FAIL` progu, nie „niezbieżność"), `voltage_profile_view.py:60-70`, `wrazliwosc_rozplywu.py:74-86`, `power_flow_reconstruction.py:92-160`, `pokrycie_analiz.py:37-43`, `werdykt_projektowy.py:1494-1530`, `wniosek_osd.py:185-194`, `zgodnosc_powykonawcza.py:499-510`, `lv_domain/projection_v1.py:150`, `nn_circuit_sheet.py:406-414`, `dokument_studium.py:144-151`, `proof_engine/pakiet_biegu.py:243-300` → `application/solvers/power_flow_binding.py:80-129` (odmawia przy `unsolved_node_ids`, nie przy `converged=False`), `comparison/service.py:117-161`, `odpowiedz_osd.py:189-198, 398-408` (warianty bez bramki) | działają także na rozwiązaniu niezbieżnym | — |
| Kody przyczyny: `cause_if_failed_optional` ∈ {`max_iter`, `numerical_issue`, `singular_jacobian`, `singular_matrix`}; PL: `application/analyses/diagnoza_przebiegu.py:40-54`, `frontend/src/ui2/spaces/obliczenia/diagnoza/kodyDiagnozy.ts:59-76` | brak kodu dla rozwiązania zbieżnego, ale zdegenerowanego (`PF_GALAZ_NISKONAPIECIOWA` NIE został dodany — STOP) | — |
| Frontend: `ui2/wyniki/zbieznosc/EkranZbieznosci.tsx:185-210` (werdykt ZBIEŻNY/NIEZBIEŻNY z przyczyną), `ui2/wyniki/rozplyw/adapters/rozplywAdapter.ts:148-151` (wiersz „Zbieżność: Tak/Nie"), `ui2/wyniki/co-wymaga-uwagi/model.ts:120-135`, `ui2/wyniki/jakosc/SekcjaPasmRozplywu.tsx:274` | pokazują `converged=false` jako werdykt; rozwiązanie zerowe z `converged=true` pokazują jako zbieżne (pasma W3-G2 meldują „poza zakresem wiarygodności") | — |

Strażniki (✓): `solver_diff_guard` chroni 7 plików (`PROTECTED_FILES`, w tym oba pliki NR) —
odciski **bez zmian**; `solver_boundary_guard.WATCHED_PATHS` (`scripts/solver_boundary_guard.py:29-38`)
**nie zawiera żadnego pliku rozpływu**, więc klucz `power_flow_newton_internal.py` w `SANCTIONED_CHANGES`
nigdy nie jest dopasowywany; `load_flow_no_heuristics_guard` skanuje `application/analysis_run`, `domain`,
`analysis/power_flow` — nie `network_model/solvers/`; `resultset_v1_schema_guard` obejmuje mapowania SC i
zabezpieczeń, nie kontrakt PF. Wpis „SANCTIONED z odwołaniem do O-59 OD-19" NIE został dodany — nie
było zmiany do usankcjonowania.

## 5. Dowody wykonania

| Sprawdzenie | Wynik |
|---|---|
| `tests/network_model/solvers/test_od19_diagnoza_rozwiazania_zerowego.py` (19 testów: sieć dwuszynowa ×2 klasy, W3-G2 ×2 warianty TR1, starty, J_R, postać zamknięta) | 19 passed |
| `tests/network_model/solvers/test_punkt_startowy_nie_zmienia_wyniku.py` (docstring z korektą zakresu twierdzenia, kod testów bez zmian) | 7 passed |
| `tests/golden/wyrocznie/test_pandapower_od19_w3g2.py` (marker `pandapower`; osobne środowisko pandapower 3.5.4 / scipy 1.16.3 / numpy 1.26.4) | 3 passed; w głównym venv 3 deselected |
| Pełna regresja `pytest -q -m "not pandapower and not andes"` (`OPENBLAS_NUM_THREADS=1`) | **27 196 passed**, 37 deselected, 10 failed, 6 errors, 1:21:05 — czerwień w całości bazy (niżej) |
| `python ../scripts/guardy_z_ci.py` z `backend/` | wynik w §5a |
| `solver_diff_guard` | PASS (7 plików, odciski bez zmian) |
| Frontend | nietknięty (zero zmian w `frontend/**`) — vitest/type-check/lint nie uruchamiane |

**Czerwień bazy (zmierzona osobno, NIE naprawiana — karta: „nie naprawiaj czerwieni bazy partii 6
naprawianej w innej karcie"):** 10 failed = `tests/enm/migrations/test_nn_field_specs_promocja_aparat.py`
×8 (brak `_materializuj_aparat` / `materialize_catalog_binding` w module),
`tests/domain/test_rejestr_kodow_bram_katalogowych.py` ×1 (`catalog.assign_failed` poza
`READINESS_CODES`), `tests/enm/test_nazwy_jedno_zrodlo.py` ×1 (`enm/validator.py:100`). Dowód, że to
baza: te same 10 czerwonych na czystym worktree bazy `2df02f85` (151 passed w tych czterech plikach);
ten sam zestaw wymieniony w `MELDUNEK_B01_RUNDA1.md:127-128` jako „styki partii 6, karta
PARTIA-6-BACKEND". 6 errors = `tests/test_protection_settings_w3c2_identity.py` — `git show a16f8d2b`
w PŁYTKIM klonie (299 commitów); po dociągnięciu historii (`git fetch --depth=400`): 7 passed. To
środowisko, nie kod.

### 5a. Strażniki CI

Bieg 1 `poetry run python ../scripts/guardy_z_ci.py` (z `backend/`, przed `npm ci`): 106 strażników
wołanych przez CI uruchomionych — **104 zielone, 2 czerwone ŚRODOWISKOWO** (`tsconfig_gate_guard` RC=1:
brak typów `vitest`; `werdykt_wyjasnialny_guard` RC=2: „BŁĄD ŚRODOWISKA: brak pakietu `typescript` …
uruchom `npm ci`"), kroki npm pominięte („frontend/node_modules nieobecne"); te same dwa strażniki są
czerwone identycznie na czystym worktree bazy `2df02f85`. Po `npm ci` (522 pakiety): `tsconfig_gate_guard`
→ „0 błędów W BRAMCE, 80 POZA BRAMKĄ (budżet 80)" RC=0; `werdykt_wyjasnialny_guard` → „brak nowych
tożsamości z lakonicznym werdyktem" RC=0; `npm run type-check` RC=0; `npm run lint` RC=0;
`solver_diff_guard` PASS (7 plików). Samotesty strażników biegu 1 i pełny powtórny bieg łańcucha z
`node_modules` — wynik w §5b (dopisany osobnym commitem meldunku po zakończeniu biegu).

## 6. Znaleziska dla właściciela (poza zakresem zgody OD-19 — nie ruszane)

1. **Defekt fikstury speca e2e** `pasma-rozplywu-jakosc.spec.ts:284-299`: pętla po wszystkich
   transformatorach nadpisuje TR1 110/15 kV tabliczką 630 kVA 15/0,4 kV. To ona (przekładnia 5,114)
   wpycha start płaski w basen rozwiązania zerowego. Nie poprawiona, bo karta zakazuje migracji fikstur
   tego speca i bo sekcja pasm W3-G2 OPIERA SIĘ na tym wyniku (dowód „poza zakresem wiarygodności").
   Decyzja: naprawa fikstury (i wtedy sekcja pasm potrzebuje innego dowodu) albo zachowanie jako
   świadomego przypadku brzegowego z komentarzem.
2. **Operacja domenowa `update_element_parameters` przyjmuje tabliczkę 15/0,4 kV na transformatorze
   między szynami 110 kV i 15 kV** (przekładnia poza-znamionowa ×5,1) bez odmowy. Klasa: rozjazd
   tabliczki z napięciami znamionowymi szyn. Każda granica „dopuszczalnego" rozjazdu jest progiem z góry,
   więc nie została dosztukowana — decyzja produktowa (walidator ENM poza rdzeniem, z nazwanym powodem).
3. **Rdzeń rozpływu NR pomija gałąź magnesującą transformatora** (`power_flow_newton_internal.py:1350-1358`,
   `_get_branch_admittances_ohm` oddaje bocznik `0.0 + 0.0j` dla `TransformerBranch`), choć ENM niesie
   i0 % / P0 (TR1: 0,35 % / 25 kW; 630 kVA: 1,5 % / 1,3 kW) i most pandapower je odwzorowuje
   (`tests/golden/wyrocznie/pandapower.py:201-202`). Pomiar na W3-G2 z TR1 nietkniętym: |ΔU_110| =
   1,87·10⁻⁴ p.u., |ΔU_nN| = 3,0·10⁻⁴ p.u., ΔP = 26,3 kW, ΔQ = 93,2 kvar; z i0 = P0 = 0 parytet
   5,9·10⁻⁷ p.u. Kryterium karty „|ΔU| ≤ 10⁻⁶ wobec pandapower" na tej topologii jest spełnialne
   WYŁĄCZNIE po wyzerowaniu gałęzi magnesującej w obu solverach. Luka przypięta pasem z pomiaru w
   `test_pandapower_od19_w3g2.py::test_tr1_nietkniety_z_katalogu_luka_galezi_magnesujacej_rdzenia`
   (zniknięcie albo wzrost zaświeci). To zmiana rdzenia FROZEN — B-01, poza OD-19. Uwaga: docstring
   mostu deklaruje „te same reguły co `enm/mapping.py`" — dla gałęzi magnesującej to nieprawda.
4. **Korekta twierdzenia** w `test_punkt_startowy_nie_zmienia_wyniku.py` („wynik zbieżny nie zależy od
   punktu startowego" — uzasadnienie wpisu budżetowego `solver_input_substitute_guard`): zachodzi dla
   szyny obciążonej w zmierzonym paśmie startów; dla szyny o zerowej mocy i dla startu bliskiego zera
   szyny obciążonej jest fałszywe (dwa rozwiązania zbieżne). Docstring skorygowany w tej karcie, wpis
   budżetowy pozostaje w mocy z innym uzasadnieniem (start płaski 1,0 p.u. leży w basenie gałęzi
   roboczej) — do wpisania przez integratora tam, gdzie budżet jest udokumentowany.
5. **Rozstrzygnięcie A-1** (`SYNTEZA_DOMKNIECIA_PRODUKTU_2026-09.md:545`: „jawna szyna WN niedozwolona,
   walidator odrzuca U_n > 36 kV") pozostaje w rejestrze, choć OD-19 opcja 1 je ODRZUCIŁA (9 budowniczych
   złotych ma szyny > 36 kV). Wpis do `REJESTR_KONFLIKTOW` należy do integratora — nie pisałem do
   współdzielonych rejestrów (precedens fali 3).

**Fakty do decyzji o dalszej drodze (bez rekomendacji progu):** (a) rozwiązanie zerowe szyny o zerowej
mocy jest osiągalne ze startu płaskiego tylko wtedy, gdy rozwiązanie robocze leży daleko od 1,0 p.u.
(tu: przekładnia 5,1 z błędnej tabliczki) — dla poprawnych danych start płaski „U_n każdej szyny" ląduje
na gałęzi roboczej (pomiar §2 p. 3); (b) w rozwiązaniu zerowym jakobian pełny jest osobliwy
(σ_min ~ 10⁻¹³ wobec 7,8·10⁻² na gałęzi roboczej tej samej sieci) — to jest własność fizyczna tego
punktu, ale każde jej numeryczne użycie wymaga tolerancji; (c) kryterium J_R jest celne na PRAWDZIWĄ
dolną gałąź P–U szyny obciążonej (J_R = −11,15 na sieci dwuszynowej), którą rdzeń dziś także raportuje
jako zbieżną — to osobna klasa, bez zmierzonego przypadku produkcyjnego.

## 7. Zależność od rundy tekstowej B01-RUNDA-3 i kolizje

Gałąź `…-karta-b01-runda3` pojawiła się na `origin` pod koniec tej karty z dwoma commitami nad bazą
`2df02f85` (`1677c09e6` „B-01 runda 3 … typy i teksty, zero zmian liczbowych", `39d98b482` plan/STAN_REPO),
ale **bez commitu `MELDUNEK_B01_RUNDA3.md`** — warunek karty do przeniesienia pracy na jej czubek nie był
spełniony, więc ta gałąź pozostaje na bazie `2df02f85`. Rdzeń nie był tu edytowany, więc **nie ma
kolizji** w `power_flow_newton_internal.py` (runda3: +183/−45 wierszy tekstu i typów) ani w odciskach
`solver_diff_guard` (runda3 aktualizuje `solver_hashes.json`, ta karta go nie dotyka). Zbiory plików obu
gałęzi są rozłączne. Kontrola krzyżowa: 19 testów diagnozy uruchomionych w worktree na czubku runda3
(`39d98b482`) — 19 passed, te same liczby (potwierdza „zero zmian liczbowych" rundy 3 dla tej klasy).
Pliki tej karty są wyłącznie addytywne w `backend/tests/**` (+ jedna zmiana docstringu) i w korzeniu
repo (ten meldunek).

## 8. Czego nie zrobiono i dlaczego

- Korekta rdzenia (`converged=false`, kod `PF_GALAZ_NISKONAPIECIOWA`, wartości własne w śladzie,
  wyprowadzenie J_R w docstringu i EquationRegistry, test iloczynu cech {gałąź} × {slack, PV z limitem Q,
  ZIP} × {SN, WN}, iniekcja, SANCTIONED, ekran wyników z werdyktem wyjaśnialnym, sekcja pasm W3-G2 na
  „potwierdzone") — **NIE**, z powodu STOP-warunku karty (§1). Wdrożenie kryterium wbrew pomiarowi
  dałoby produkt, który w zmierzonym przypadku nadal raportuje 5713 MW jako wynik roboczy, a
  dosztukowanie innego kryterium karta zakazuje wprost.
- Naprawa fikstury speca e2e — **NIE** (zakaz migracji fikstur w karcie; §6 p. 1).
- Gałąź magnesująca w rdzeniu NR — **NIE** (B-01 poza zgodą OD-19; §6 p. 3).
- Wpisy do `MAPA_DOMKNIECIA` (wiersz OD-19), `REJESTR_KONFLIKTOW`, `STAN_REPO`, planu A/B §7 — **NIE**
  (rejestry współdzielone, wpisuje integrator).
- Frontend — nietknięty.

## 9. Commity

| Commit | Treść |
|---|---|
| `00beaca12` | diagnoza OD-19 poza rdzeniem: budowniczy sieci W3-G2 przez API (`tests/reference_networks/w3g2_pasma_rozplywu.py`), test przypięcia pomiaru (19), wyrocznia pandapower (3, marker), korekta docstringu testu punktu startowego |
| (ten) | `MELDUNEK_PF_OD19.md` |
