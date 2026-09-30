# Baseline wydajnosci — macierz budzetow B1-B10 (karta PERF-0)

Dokument GENEROWANY przez `backend/scripts/benchmark_baseline.py` (zrodlo budzetow: `docs/twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md sekcja 1a`). Nie edytowac recznie — uruchom skrypt ponownie. Baseline = POMIAR, nie ocena: kazda pozycja ma albo liczbe (mediana + p95 z N powtorzen w tym samym procesie), albo wpis NIEMIERZALNE z jawnym powodem.

## Warunki pomiaru

- Data pomiaru: 2026-09-04T23:12:34.097365+00:00
- Python: 3.11.15; numpy 1.26.4; scipy 1.17.0
- Platforma: Linux-6.18.44-fc-v24-x86_64-with-glibc2.39
- Rdzenie logiczne: 4
- Powtorzenia zadane: 5 (siec G00: zawsze 1, bez rozgrzewki)
- Sieci wybrane (--sieci): M, S
- Czas calkowity pomiaru: 435.636 s
- Metoda: time.perf_counter() w JEDNYM procesie, ta sama maszyna dla wszystkich pozycji. Kazda pozycja/siec: 1 wywolanie rozgrzewkowe (nieliczone, POMINIETE dla sieci G00) + N wywolan mierzonych. Raportowana mediana i p95 (indeks ceil(0.95*N)-1 posortowanej listy rosnaco; dla N=1 mediana=p95=jedyna probka). Siec G00 (budowa ~15-20 s, zwarcia bardzo wolne — gesta algebra): N=1, BEZ rozgrzewki, niezaleznie od --powtorzenia.

## Sieci zmierzone

| Siec | Rejestr | Nazwa | Wielkosc | Szyny | Galezie | Transf. | Budowa [ms] | Walidacja | BLOCKER |
|---|---|---|---|---|---|---|---|---|---|
| G02[0] | G02 | SN promieniowa / z odgalezieniem (GN_01, GN_02) | S | 10 | 7 | 2 | 667.8 | WARN | 0 |
| G02[1] | G02 | SN promieniowa / z odgalezieniem (GN_01, GN_02) | S | 11 | 8 | 2 | 667.8 | WARN | 0 |
| G03[0] | G03 | SN pierscien + NOP, N-1 (GN_03) | S | 7 | 6 | 1 | 10.7 | WARN | 0 |
| G08[0] | G08 | SN+nN z zabezpieczeniami (GN_05) | S | 8 | 5 | 2 | 7.0 | WARN | 0 |
| G13[0] | G13 | feeder 110/SN CGMES (golden_enm) | M | 5 | 4 | 2 | 17.0 | WARN | 0 |
| G00[0] | G00 | substrat SLD 52 stacji (build_sld_substrate_52s) | M | 315 | 260 | 54 | 21257.8 | FAIL | 21 |

### BLOCKER walidatora per siec

**G00[0]** (21 BLOCKER):
- E003: Wyspa sieci odcięta od źródła zasilania: bus/3afb050fcc53cef0e85a995c49de8083/switch_node_2, bus/9d8b94d29e4257370d79228bedb55956/branch_end, stn/a99b8720d7f58f0ea6addc9ba91b9482/nn_bus, stn/a99b8720d7f58f0ea6addc9ba91b9482/sn_bus, stn/a99b8720d7f58f0ea6addc9ba91b9482/sn_field_terminal/000....
- E063: Stacja 'stn/0cbb22accf6682c74c740d72817a45cc/station' zasila odbiory nN, ale nie deklaruje ukladu uziemienia sieci nN (meta.nn_earthing_system).
- E063: Stacja 'stn/13dd9627b2fec31332ba4d88c4d6196a/station' zasila odbiory nN, ale nie deklaruje ukladu uziemienia sieci nN (meta.nn_earthing_system).
- E063: Stacja 'stn/2f175e1390e4ee60df561868f596d1c1/station' zasila odbiory nN, ale nie deklaruje ukladu uziemienia sieci nN (meta.nn_earthing_system).
- E063: Stacja 'stn/4c79886a98b1d48388a3ed40a4ba46f5/station' zasila odbiory nN, ale nie deklaruje ukladu uziemienia sieci nN (meta.nn_earthing_system).
- E063: Stacja 'stn/576669a7f56ed1fbd34aa5fedb2f8b79/station' zasila odbiory nN, ale nie deklaruje ukladu uziemienia sieci nN (meta.nn_earthing_system).
- E063: Stacja 'stn/5a301fd1afa2a18ade850193ad4b3618/station' zasila odbiory nN, ale nie deklaruje ukladu uziemienia sieci nN (meta.nn_earthing_system).
- E063: Stacja 'stn/65b257a1e5494234ad4a2a834057d9f8/station' zasila odbiory nN, ale nie deklaruje ukladu uziemienia sieci nN (meta.nn_earthing_system).
- E063: Stacja 'stn/6eb0d3f4b4744db6093e0de70e01f522/station' zasila odbiory nN, ale nie deklaruje ukladu uziemienia sieci nN (meta.nn_earthing_system).
- E063: Stacja 'stn/7fa8fe60c79cf3fcb3d1e55c74203c62/station' zasila odbiory nN, ale nie deklaruje ukladu uziemienia sieci nN (meta.nn_earthing_system).
- E063: Stacja 'stn/8c9267971b12adb6e391bc1356237bf2/station' zasila odbiory nN, ale nie deklaruje ukladu uziemienia sieci nN (meta.nn_earthing_system).
- E063: Stacja 'stn/9362898d51b84fac908fc531f50eb6a4/station' zasila odbiory nN, ale nie deklaruje ukladu uziemienia sieci nN (meta.nn_earthing_system).
- E063: Stacja 'stn/9db5fd4c37bbd8dea1f3b5ecd6f5c8b5/station' zasila odbiory nN, ale nie deklaruje ukladu uziemienia sieci nN (meta.nn_earthing_system).
- E063: Stacja 'stn/afb04a2f432567f8d0b41983557664a0/station' zasila odbiory nN, ale nie deklaruje ukladu uziemienia sieci nN (meta.nn_earthing_system).
- E063: Stacja 'stn/c448aa4cc61ab9b16eb60bfba0162e16/station' zasila odbiory nN, ale nie deklaruje ukladu uziemienia sieci nN (meta.nn_earthing_system).
- E063: Stacja 'stn/d618a861ba1547cb6b08a55cc1e6b1fb/station' zasila odbiory nN, ale nie deklaruje ukladu uziemienia sieci nN (meta.nn_earthing_system).
- E063: Stacja 'stn/dc154c33739945a48fdcff3ff2e1e743/station' zasila odbiory nN, ale nie deklaruje ukladu uziemienia sieci nN (meta.nn_earthing_system).
- E063: Stacja 'stn/ddc097bcd071b9c255e09ef90508ed29/station' zasila odbiory nN, ale nie deklaruje ukladu uziemienia sieci nN (meta.nn_earthing_system).
- E063: Stacja 'stn/dff11bb9e2cd9fb89ea1c6da7099782c/station' zasila odbiory nN, ale nie deklaruje ukladu uziemienia sieci nN (meta.nn_earthing_system).
- E063: Stacja 'stn/e6a18d6f65bb20a9921cb725894a59c0/station' zasila odbiory nN, ale nie deklaruje ukladu uziemienia sieci nN (meta.nn_earthing_system).
- E063: Stacja 'stn/faa7d680f43b242708f5e12c9c0a6e7e/station' zasila odbiory nN, ale nie deklaruje ukladu uziemienia sieci nN (meta.nn_earthing_system).

## Siec L

**NIEMIERZALNE.** Siec wzorcowa L (~2000 szyn SN+nN, ~150 stacji z nN) NIE ISTNIEJE w rejestrze tests/golden/registry.py — generator L nie jest zaimplementowany. Najwiekszy zbudowany substrat to G00 (52 stacje / 315 szyn / 260 galezi), ktory rejestr (tests/golden/registry.py, wpis 'G00', pole proweniencja) oznacza jako NIEOBLICZALNY: 'substrat 52 stacji NIEOBLICZALNY (A10) - do naprawy u zrodla; generator L nie istnieje'.

## Macierz pomiarow

| Pozycja | Nazwa | Siec | Wielk. | Szyny | Galezie | N | Mediana [ms] | p95 [ms] | Budzet | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| B1 | topology | G02[0] | S | 10 | 7 | 5 | 0.342 | 1.853 | < 5 ms | WEWNATRZ |
| B1 | topology | G02[1] | S | 11 | 8 | 5 | 0.318 | 18.012 | < 5 ms | WEWNATRZ |
| B1 | topology | G03[0] | S | 7 | 6 | 5 | 0.200 | 0.256 | < 5 ms | WEWNATRZ |
| B1 | topology | G08[0] | S | 8 | 5 | 5 | 0.216 | 0.257 | < 5 ms | WEWNATRZ |
| B1 | topology | G13[0] | M | 5 | 4 | 5 | 0.194 | 0.266 | < 30 ms | WEWNATRZ |
| B1 | topology | G00[0] | M | 315 | 260 | 1 | 110.030 | 110.030 | < 30 ms | PRZEKROCZONY |
| B2 | snapshot assembly | G02[0] | S | 10 | 7 | 5 | 9.210 | 11.947 | < 20 ms | WEWNATRZ |
| B2 | snapshot assembly | G02[1] | S | 11 | 8 | 5 | 17.002 | 20.311 | < 20 ms | WEWNATRZ |
| B2 | snapshot assembly | G03[0] | S | 7 | 6 | 5 | 30.135 | 43.438 | < 20 ms | PRZEKROCZONY |
| B2 | snapshot assembly | G08[0] | S | 8 | 5 | 5 | 15.028 | 50.734 | < 20 ms | WEWNATRZ |
| B2 | snapshot assembly | G13[0] | M | 5 | 4 | 5 | 28.249 | 43.545 | < 80 ms | WEWNATRZ |
| B2 | snapshot assembly | G00[0] | M | 315 | 260 | - | - | - | < 80 ms | NIEMIERZALNE ⚠ |
| B3 | LF | G02[0] | S | 10 | 7 | 5 | 42.990 | 68.889 | < 50 ms | WEWNATRZ |
| B3 | LF | G02[1] | S | 11 | 8 | 5 | 55.241 | 74.243 | < 50 ms | PRZEKROCZONY |
| B3 | LF | G03[0] | S | 7 | 6 | 5 | 8.002 | 15.550 | < 50 ms | WEWNATRZ |
| B3 | LF | G08[0] | S | 8 | 5 | 5 | 20.012 | 60.011 | < 50 ms | WEWNATRZ |
| B3 | LF | G13[0] | M | 5 | 4 | 5 | 47.417 | 115.823 | < 200 ms | WEWNATRZ |
| B3 | LF | G00[0] | M | 315 | 260 | 1 | 5099.590 | 5099.590 | < 200 ms | PRZEKROCZONY |
| B4 | SC | G02[0] | S | 10 | 7 | 5 | 89.708 | 166.772 | < 100 ms | WEWNATRZ |
| B4 | SC | G02[1] | S | 11 | 8 | 5 | 60.536 | 100.160 | < 100 ms | WEWNATRZ |
| B4 | SC | G03[0] | S | 7 | 6 | 5 | 32.468 | 35.809 | < 100 ms | WEWNATRZ |
| B4 | SC | G08[0] | S | 8 | 5 | 5 | 168.320 | 175.992 | < 100 ms | PRZEKROCZONY |
| B4 | SC | G13[0] | M | 5 | 4 | 5 | 289.626 | 343.194 | < 1 s | WEWNATRZ |
| B4 | SC | G00[0] | M | 315 | 260 | 1 | 376794.154 | 376794.154 | < 1 s | PRZEKROCZONY |
| B5 | ABCN nN | - | - | - | - | - | - | - | - | NIEMIERZALNE ⚠ |
| B6 | scenario batch | G03[0] | S | 7 | 6 | 5 | 62.825 | 75.284 | < 1 s (N-1 pelne) | WEWNATRZ |
| B7 | projection SN | - | - | - | - | - | - | - | - | NIEMIERZALNE ⚠ |
| B8 | projection nN | 01_single_tr (stacja stC) | S | 11 | 9 | 5 | 32.230 | 33.483 | < 15 ms | PRZEKROCZONY |
| B8 | projection nN | 02_two_tr_qbc_open (stacja stAB) | S | 15 | 13 | 5 | 294.914 | 328.715 | < 15 ms | PRZEKROCZONY |
| B8 | projection nN | 03_two_tr_qbc_closed (stacja stAB) | S | 15 | 13 | 5 | 241.344 | 387.289 | < 15 ms | PRZEKROCZONY |
| B8 | projection nN | 04_shared_upstream_boundary (stacja stAB) | S | 16 | 14 | 5 | 875.358 | 1335.805 | < 15 ms | PRZEKROCZONY |
| B8 | projection nN | 05_independent_upstream (stacja stAB) | S | 16 | 13 | 5 | 18.123 | 38.836 | < 15 ms | PRZEKROCZONY |
| B8 | projection nN | 06_conflict_parallel_sources (stacja stAB) | S | 16 | 13 | 5 | 18.610 | 29.438 | < 15 ms | PRZEKROCZONY |
| B8 | projection nN | 07_island_grid_following (stacja stW) | S | 17 | 15 | 5 | 169.722 | 208.193 | < 15 ms | PRZEKROCZONY |
| B8 | projection nN | 08_island_grid_forming (stacja stW) | S | 17 | 15 | 5 | 167.989 | 260.170 | < 15 ms | PRZEKROCZONY |
| B8 | projection nN | 09_island_unknown (stacja stW) | S | 17 | 15 | 5 | 154.410 | 201.850 | < 15 ms | PRZEKROCZONY |
| B8 | projection nN | 10_deenergized_section (stacja stAB) | S | 15 | 13 | 5 | 253.312 | 334.988 | < 15 ms | PRZEKROCZONY |
| B8 | projection nN | 11_double_sided_open (stacja stAB) | S | 21 | 19 | 5 | 551.975 | 623.013 | < 15 ms | PRZEKROCZONY |
| B8 | projection nN | 12_der_full_path (stacja stDER) | S | 11 | 9 | 5 | 132.916 | 184.017 | < 15 ms | PRZEKROCZONY |
| B8 | projection nN | 13_loads_via_fields (stacja stODB) | S | 13 | 11 | 5 | 200.123 | 270.902 | < 15 ms | PRZEKROCZONY |
| B8 | projection nN | 14_sub_boards (stacja stSUB) | S | 15 | 13 | 5 | 73.547 | 178.180 | < 15 ms | PRZEKROCZONY |
| B8 | projection nN | 15_many_feeders (stacja stWIELE) | S | 27 | 25 | 5 | 350.948 | 387.543 | < 15 ms | PRZEKROCZONY |
| B8 | projection nN | 16_stale_result (stacja stC) | S | 11 | 9 | 5 | 24.194 | 29.019 | < 15 ms | PRZEKROCZONY |
| B8 | projection nN | 17_sc_results (stacja stC) | S | 11 | 9 | 5 | 24.301 | 28.045 | < 15 ms | PRZEKROCZONY |
| B8 | projection nN | 18_swz_overlay (stacja stSWZ) | S | 9 | 7 | 5 | 20.736 | 23.382 | < 15 ms | PRZEKROCZONY |
| B8 | projection nN | RAZEM (18 scenariuszy nN, mediana median) | S | - | - | 18 | 161.199 | 875.358 | < 15 ms | PRZEKROCZONY |
| B9 | dense renderer | - | - | - | - | - | - | - | - | NIEMIERZALNE ⚠ |
| B10 | document generation | G02[0] | S | 10 | 7 | 5 | 27.506 | 28.589 | < 5 s | WEWNATRZ |

## Uwagi szczegolowe / powody NIEMIERZALNE

- **B1 / G02[0]:** razem = mapowanie ENM->graf + scalanie wezlow. Rozbicie median: mapowanie=0.3214 ms, scalanie (union-find zamknietych lacznikow, BEZ budowy macierzy Y-bus)=0.0220 ms.
- **B1 / G02[1]:** razem = mapowanie ENM->graf + scalanie wezlow. Rozbicie median: mapowanie=0.3003 ms, scalanie (union-find zamknietych lacznikow, BEZ budowy macierzy Y-bus)=0.0180 ms.
- **B1 / G03[0]:** razem = mapowanie ENM->graf + scalanie wezlow. Rozbicie median: mapowanie=0.1914 ms, scalanie (union-find zamknietych lacznikow, BEZ budowy macierzy Y-bus)=0.0090 ms.
- **B1 / G08[0]:** razem = mapowanie ENM->graf + scalanie wezlow. Rozbicie median: mapowanie=0.2037 ms, scalanie (union-find zamknietych lacznikow, BEZ budowy macierzy Y-bus)=0.0125 ms.
- **B1 / G13[0]:** razem = mapowanie ENM->graf + scalanie wezlow. Rozbicie median: mapowanie=0.1838 ms, scalanie (union-find zamknietych lacznikow, BEZ budowy macierzy Y-bus)=0.0100 ms.
- **B1 / G00[0]:** razem = mapowanie ENM->graf + scalanie wezlow. Rozbicie median: mapowanie=109.6412 ms, scalanie (union-find zamknietych lacznikow, BEZ budowy macierzy Y-bus)=0.3884 ms.
- **B2 / G02[0]:** enm.canonical_analysis.create_run(case_id, analysis_type='PF') W CALOSCI: ENMValidator.validate + readiness + model_dump(mode='json') + compute_enm_hash + CanonicalRunRepository.create (ZAPIS DO DB). WYMAGA DB — skrypt zaklada WLASNA izolowana baze SQLite w katalogu tymczasowym (/tmp/perf-baseline-5r7st36u), analogicznie do tests/conftest.py::_izolowana_baza_przebiegow; NIE dotyka mv_design_pro.db repozytorium. Brak w kodzie sciezki 'w pamieci' bez DB dla create_run (istnieje wykonaj_bieg_w_pamieci, ale przyjmuje JUZ zlozony CanonicalRun — nie wykonuje assemblacji migawki). Rozgrzewka: pierwsze (nieliczone) wywolanie z proby kandydata pochlania jednorazowy koszt inicjalizacji silnika DB + schematu (~130 ms na tej maszynie, kolejne wywolania ~12-18 ms).
- **B2 / G02[1]:** enm.canonical_analysis.create_run(case_id, analysis_type='PF') W CALOSCI: ENMValidator.validate + readiness + model_dump(mode='json') + compute_enm_hash + CanonicalRunRepository.create (ZAPIS DO DB). WYMAGA DB — skrypt zaklada WLASNA izolowana baze SQLite w katalogu tymczasowym (/tmp/perf-baseline-5r7st36u), analogicznie do tests/conftest.py::_izolowana_baza_przebiegow; NIE dotyka mv_design_pro.db repozytorium. Brak w kodzie sciezki 'w pamieci' bez DB dla create_run (istnieje wykonaj_bieg_w_pamieci, ale przyjmuje JUZ zlozony CanonicalRun — nie wykonuje assemblacji migawki). Rozgrzewka: pierwsze (nieliczone) wywolanie z proby kandydata pochlania jednorazowy koszt inicjalizacji silnika DB + schematu (~130 ms na tej maszynie, kolejne wywolania ~12-18 ms).
- **B2 / G03[0]:** enm.canonical_analysis.create_run(case_id, analysis_type='short_circuit_sn') W CALOSCI: ENMValidator.validate + readiness + model_dump(mode='json') + compute_enm_hash + CanonicalRunRepository.create (ZAPIS DO DB). WYMAGA DB — skrypt zaklada WLASNA izolowana baze SQLite w katalogu tymczasowym (/tmp/perf-baseline-5r7st36u), analogicznie do tests/conftest.py::_izolowana_baza_przebiegow; NIE dotyka mv_design_pro.db repozytorium. Brak w kodzie sciezki 'w pamieci' bez DB dla create_run (istnieje wykonaj_bieg_w_pamieci, ale przyjmuje JUZ zlozony CanonicalRun — nie wykonuje assemblacji migawki). Rozgrzewka: pierwsze (nieliczone) wywolanie z proby kandydata pochlania jednorazowy koszt inicjalizacji silnika DB + schematu (~130 ms na tej maszynie, kolejne wywolania ~12-18 ms). UWAGA: analysis_type='PF' odmowiony (PF: ValueError: Analiza rozpływu mocy nie jest dostepna dla biezacego snapshotu ENM), zmierzono zamiast tego z analysis_type='short_circuit_sn' — TEN SAM mechanizm assemblacji migawki, inna biznesowa brama dostepnosci.
- **B2 / G08[0]:** enm.canonical_analysis.create_run(case_id, analysis_type='PF') W CALOSCI: ENMValidator.validate + readiness + model_dump(mode='json') + compute_enm_hash + CanonicalRunRepository.create (ZAPIS DO DB). WYMAGA DB — skrypt zaklada WLASNA izolowana baze SQLite w katalogu tymczasowym (/tmp/perf-baseline-5r7st36u), analogicznie do tests/conftest.py::_izolowana_baza_przebiegow; NIE dotyka mv_design_pro.db repozytorium. Brak w kodzie sciezki 'w pamieci' bez DB dla create_run (istnieje wykonaj_bieg_w_pamieci, ale przyjmuje JUZ zlozony CanonicalRun — nie wykonuje assemblacji migawki). Rozgrzewka: pierwsze (nieliczone) wywolanie z proby kandydata pochlania jednorazowy koszt inicjalizacji silnika DB + schematu (~130 ms na tej maszynie, kolejne wywolania ~12-18 ms).
- **B2 / G13[0]:** enm.canonical_analysis.create_run(case_id, analysis_type='PF') W CALOSCI: ENMValidator.validate + readiness + model_dump(mode='json') + compute_enm_hash + CanonicalRunRepository.create (ZAPIS DO DB). WYMAGA DB — skrypt zaklada WLASNA izolowana baze SQLite w katalogu tymczasowym (/tmp/perf-baseline-5r7st36u), analogicznie do tests/conftest.py::_izolowana_baza_przebiegow; NIE dotyka mv_design_pro.db repozytorium. Brak w kodzie sciezki 'w pamieci' bez DB dla create_run (istnieje wykonaj_bieg_w_pamieci, ale przyjmuje JUZ zlozony CanonicalRun — nie wykonuje assemblacji migawki). Rozgrzewka: pierwsze (nieliczone) wywolanie z proby kandydata pochlania jednorazowy koszt inicjalizacji silnika DB + schematu (~130 ms na tej maszynie, kolejne wywolania ~12-18 ms).
- **B2 / G00[0]:** create_run odmowil zlozenia migawki dla WSZYSTKICH probowanych rodzajow analizy (PF, short_circuit_sn): PF: ValueError: Wyspa sieci odcięta od źródła zasilania: bus/3afb050fcc53cef0e85a995c49de8083/switch_node_2, bus/9d8b94d29e4257370d79228bedb55956/branch_end, nn/6f416902359efd92fb5a0e2e636766a3/feeder_bus, nn/d86f5c65f9a1bf8d09c2ba0e55de4a52/feeder_bus, nn/e138efd5ddc04f3d17f3f77b49b70939/feeder_bus....; Odbior nN 'load/7c9528b68bf7cf3ba6d38b09cb697f87/nn' na szynie 'nn/e138efd5ddc04f3d17f3f77b49b70939/feeder_bus' nie ma ciaglej sciezki (przez zamkniete galezie/transformatory) do zadnego zrodla zasilania.; Odbior nN 'load/b983fa715972bf587babc44d7c96af9d/nn' na szynie 'nn/d86f5c65f9a1bf8d09c2ba0e55de4a52/feeder_bus' nie ma ciaglej sciezki (przez zamkniete galezie/transformatory) do zadnego zrodla zasilania. | short_circuit_sn: ValueError: Wyspa sieci odcięta od źródła zasilania: bus/3afb050fcc53cef0e85a995c49de8083/switch_node_2, bus/9d8b94d29e4257370d79228bedb55956/branch_end, nn/6f416902359efd92fb5a0e2e636766a3/feeder_bus, nn/d86f5c65f9a1bf8d09c2ba0e55de4a52/feeder_bus, nn/e138efd5ddc04f3d17f3f77b49b70939/feeder_bus....; Odbior nN 'load/7c9528b68bf7cf3ba6d38b09cb697f87/nn' na szynie 'nn/e138efd5ddc04f3d17f3f77b49b70939/feeder_bus' nie ma ciaglej sciezki (przez zamkniete galezie/transformatory) do zadnego zrodla zasilania.; Odbior nN 'load/b983fa715972bf587babc44d7c96af9d/nn' na szynie 'nn/d86f5c65f9a1bf8d09c2ba0e55de4a52/feeder_bus' nie ma ciaglej sciezki (przez zamkniete galezie/transformatory) do zadnego zrodla zasilania.
- **B3 / G02[0]:** cala funkcja enm.canonical_analysis._execute_power_flow(run, graph=None) — budowa PQSpec + solver NR (power_flow_newton_internal, przez solve_with_oltc) + montaz wyniku WHITE BOX. Graf budowany WEWNATRZ funkcji (koszt B1 NIE odjety — 'bez montazu migawki' z definicji B3 odnosi sie do migawki/DB z B2, nie do grafu). power_flow_trace nie niesie sub-znacznikow czasu wewnatrz solvera, wiec nie da sie wydzielic 'samego' solvera od reszty funkcji. Zbieznosc: True.
- **B3 / G02[1]:** cala funkcja enm.canonical_analysis._execute_power_flow(run, graph=None) — budowa PQSpec + solver NR (power_flow_newton_internal, przez solve_with_oltc) + montaz wyniku WHITE BOX. Graf budowany WEWNATRZ funkcji (koszt B1 NIE odjety — 'bez montazu migawki' z definicji B3 odnosi sie do migawki/DB z B2, nie do grafu). power_flow_trace nie niesie sub-znacznikow czasu wewnatrz solvera, wiec nie da sie wydzielic 'samego' solvera od reszty funkcji. Zbieznosc: True.
- **B3 / G03[0]:** cala funkcja enm.canonical_analysis._execute_power_flow(run, graph=None) — budowa PQSpec + solver NR (power_flow_newton_internal, przez solve_with_oltc) + montaz wyniku WHITE BOX. Graf budowany WEWNATRZ funkcji (koszt B1 NIE odjety — 'bez montazu migawki' z definicji B3 odnosi sie do migawki/DB z B2, nie do grafu). power_flow_trace nie niesie sub-znacznikow czasu wewnatrz solvera, wiec nie da sie wydzielic 'samego' solvera od reszty funkcji. Zbieznosc: True.
- **B3 / G08[0]:** cala funkcja enm.canonical_analysis._execute_power_flow(run, graph=None) — budowa PQSpec + solver NR (power_flow_newton_internal, przez solve_with_oltc) + montaz wyniku WHITE BOX. Graf budowany WEWNATRZ funkcji (koszt B1 NIE odjety — 'bez montazu migawki' z definicji B3 odnosi sie do migawki/DB z B2, nie do grafu). power_flow_trace nie niesie sub-znacznikow czasu wewnatrz solvera, wiec nie da sie wydzielic 'samego' solvera od reszty funkcji. Zbieznosc: True.
- **B3 / G13[0]:** cala funkcja enm.canonical_analysis._execute_power_flow(run, graph=None) — budowa PQSpec + solver NR (power_flow_newton_internal, przez solve_with_oltc) + montaz wyniku WHITE BOX. Graf budowany WEWNATRZ funkcji (koszt B1 NIE odjety — 'bez montazu migawki' z definicji B3 odnosi sie do migawki/DB z B2, nie do grafu). power_flow_trace nie niesie sub-znacznikow czasu wewnatrz solvera, wiec nie da sie wydzielic 'samego' solvera od reszty funkcji. Zbieznosc: True.
- **B3 / G00[0]:** cala funkcja enm.canonical_analysis._execute_power_flow(run, graph=None) — budowa PQSpec + solver NR (power_flow_newton_internal, przez solve_with_oltc) + montaz wyniku WHITE BOX. Graf budowany WEWNATRZ funkcji (koszt B1 NIE odjety — 'bez montazu migawki' z definicji B3 odnosi sie do migawki/DB z B2, nie do grafu). power_flow_trace nie niesie sub-znacznikow czasu wewnatrz solvera, wiec nie da sie wydzielic 'samego' solvera od reszty funkcji. Zbieznosc: True.
- **B4 / G02[0]:** cala funkcja enm.canonical_analysis._execute_short_circuit(run) — zwarcie 3F IEC 60909 (scenariusz MAX) na WSZYSTKICH wezlach raportowalnych (3 wynikow w ostatnim powtorzeniu), z budowa grafu WEWNATRZ funkcji (koszt B1 NIE odjety, jak w B3). Solver dzis liczy inwersje ODDZIELNIE per wezel zwarcia (gesta algebra) — patrz docs/twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md sekcja 0 ('SC wszystkie wezly: O(N*n^3): inwersja per wezel').
- **B4 / G02[1]:** cala funkcja enm.canonical_analysis._execute_short_circuit(run) — zwarcie 3F IEC 60909 (scenariusz MAX) na WSZYSTKICH wezlach raportowalnych (3 wynikow w ostatnim powtorzeniu), z budowa grafu WEWNATRZ funkcji (koszt B1 NIE odjety, jak w B3). Solver dzis liczy inwersje ODDZIELNIE per wezel zwarcia (gesta algebra) — patrz docs/twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md sekcja 0 ('SC wszystkie wezly: O(N*n^3): inwersja per wezel').
- **B4 / G03[0]:** cala funkcja enm.canonical_analysis._execute_short_circuit(run) — zwarcie 3F IEC 60909 (scenariusz MAX) na WSZYSTKICH wezlach raportowalnych (1 wynikow w ostatnim powtorzeniu), z budowa grafu WEWNATRZ funkcji (koszt B1 NIE odjety, jak w B3). Solver dzis liczy inwersje ODDZIELNIE per wezel zwarcia (gesta algebra) — patrz docs/twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md sekcja 0 ('SC wszystkie wezly: O(N*n^3): inwersja per wezel').
- **B4 / G08[0]:** cala funkcja enm.canonical_analysis._execute_short_circuit(run) — zwarcie 3F IEC 60909 (scenariusz MAX) na WSZYSTKICH wezlach raportowalnych (3 wynikow w ostatnim powtorzeniu), z budowa grafu WEWNATRZ funkcji (koszt B1 NIE odjety, jak w B3). Solver dzis liczy inwersje ODDZIELNIE per wezel zwarcia (gesta algebra) — patrz docs/twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md sekcja 0 ('SC wszystkie wezly: O(N*n^3): inwersja per wezel').
- **B4 / G13[0]:** cala funkcja enm.canonical_analysis._execute_short_circuit(run) — zwarcie 3F IEC 60909 (scenariusz MAX) na WSZYSTKICH wezlach raportowalnych (5 wynikow w ostatnim powtorzeniu), z budowa grafu WEWNATRZ funkcji (koszt B1 NIE odjety, jak w B3). Solver dzis liczy inwersje ODDZIELNIE per wezel zwarcia (gesta algebra) — patrz docs/twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md sekcja 0 ('SC wszystkie wezly: O(N*n^3): inwersja per wezel').
- **B4 / G00[0]:** cala funkcja enm.canonical_analysis._execute_short_circuit(run) — zwarcie 3F IEC 60909 (scenariusz MAX) na WSZYSTKICH wezlach raportowalnych (107 wynikow w ostatnim powtorzeniu), z budowa grafu WEWNATRZ funkcji (koszt B1 NIE odjety, jak w B3). Solver dzis liczy inwersje ODDZIELNIE per wezel zwarcia (gesta algebra) — patrz docs/twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md sekcja 0 ('SC wszystkie wezly: O(N*n^3): inwersja per wezel').
- **B5 / -:** Solver rozplywu 4-przewodowego nN (current-injection/BFS ABCN) NIE ISTNIEJE w backendzie — brak jakiejkolwiek klasy ABCN/FourWire w src/network_model/solvers/** (potwierdzone grep). docs/adr/ADR-021-frozen-core-extensions-and-lv-four-wire-solver.md:3 opisuje go jako NOWY solver ze statusem 'PROPOSED (program Digital Twin 2026-09; wymaga zgody wlasciciela B-01)' — rozszerzenie zamrozonego rdzenia wymagajace zgody wlasciciela (bramka B-01), NIE wdrozone.
- **B6 / G03[0]:** application.analyses.kontyngencje_n1.build_kontyngencje_n1_view(run) — PELNY wsad N-1 (element_refs=None = WSZYSTKIE kwalifikowane elementy: 6 kontyngencji na G03[0]), sekwencyjnie, jeden rdzen (funkcja liczy takze WLASNY 'przypadek bazowy' PF wewnatrz — druga, wewnetrzna kopia biegu bazowego, wiec pomiar zawiera 2x koszt PF bazowego + 1x PF per element). Bieg PF WEJSCIOWY (przekazywany do funkcji) policzony PRZED petla pomiarowa, poza czasem mierzonym (izolacja od B3). Porownanie do kolumny budzetu 'N-1 pelne' z sekcji 1 planu.
- **B7 / -:** Scena semantyczna SN jest liczona W CALOSCI PO STRONIE KLIENTA (frontend TypeScript, frontend/src/ui/sld/v3/scene/**, ~35,3 tys. LOC) — backend NIE MA endpointu/serwisu budujacego projekcje SN (w odroznieniu od projekcji nN, application/analyses/lv_domain/projection_v1.py, ktora istnieje — patrz B8). Zrodlo: docs/twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md:29 ('SLD SN | projekcja 100 % w kliencie (35,3 tys. LOC TS), trzy geometrie per LOD (3 sceny), brak wirtualizacji, wydajnosc dowodzona tylko w jsdom | A7-01/07').
- **B8 / 01_single_tr (stacja stC):** application.analyses.lv_domain.projection_v1.build_lv_domain_projection_v1(enm, case_id, station_ref) BEZ przebiegu (run=None) — czysta projekcja jednej stacji. Scenariusz sekcja 47: 'Jeden transformator'. Porownanie do kolumny S/M budzetu (obie '< 15 ms', bo scenariusz to pojedyncza stacja — nie jest to substrat wielostacyjny).
- **B8 / 02_two_tr_qbc_open (stacja stAB):** application.analyses.lv_domain.projection_v1.build_lv_domain_projection_v1(enm, case_id, station_ref) BEZ przebiegu (run=None) — czysta projekcja jednej stacji. Scenariusz sekcja 47: 'Dwa transformatory, sprzęgło otwarte'. Porownanie do kolumny S/M budzetu (obie '< 15 ms', bo scenariusz to pojedyncza stacja — nie jest to substrat wielostacyjny).
- **B8 / 03_two_tr_qbc_closed (stacja stAB):** application.analyses.lv_domain.projection_v1.build_lv_domain_projection_v1(enm, case_id, station_ref) BEZ przebiegu (run=None) — czysta projekcja jednej stacji. Scenariusz sekcja 47: 'Dwa transformatory, sprzęgło zamknięte'. Porownanie do kolumny S/M budzetu (obie '< 15 ms', bo scenariusz to pojedyncza stacja — nie jest to substrat wielostacyjny).
- **B8 / 04_shared_upstream_boundary (stacja stAB):** application.analyses.lv_domain.projection_v1.build_lv_domain_projection_v1(enm, case_id, station_ref) BEZ przebiegu (run=None) — czysta projekcja jednej stacji. Scenariusz sekcja 47: 'Wspólne zasilanie SN i granica domeny'. Porownanie do kolumny S/M budzetu (obie '< 15 ms', bo scenariusz to pojedyncza stacja — nie jest to substrat wielostacyjny).
- **B8 / 05_independent_upstream (stacja stAB):** application.analyses.lv_domain.projection_v1.build_lv_domain_projection_v1(enm, case_id, station_ref) BEZ przebiegu (run=None) — czysta projekcja jednej stacji. Scenariusz sekcja 47: 'Niezależne systemy SN'. Porownanie do kolumny S/M budzetu (obie '< 15 ms', bo scenariusz to pojedyncza stacja — nie jest to substrat wielostacyjny).
- **B8 / 06_conflict_parallel_sources (stacja stAB):** application.analyses.lv_domain.projection_v1.build_lv_domain_projection_v1(enm, case_id, station_ref) BEZ przebiegu (run=None) — czysta projekcja jednej stacji. Scenariusz sekcja 47: 'Konflikt: niezależne systemy spięte sprzęgłem'. Porownanie do kolumny S/M budzetu (obie '< 15 ms', bo scenariusz to pojedyncza stacja — nie jest to substrat wielostacyjny).
- **B8 / 07_island_grid_following (stacja stW):** application.analyses.lv_domain.projection_v1.build_lv_domain_projection_v1(enm, case_id, station_ref) BEZ przebiegu (run=None) — czysta projekcja jednej stacji. Scenariusz sekcja 47: 'Wyspa DER: źródło podążające'. Porownanie do kolumny S/M budzetu (obie '< 15 ms', bo scenariusz to pojedyncza stacja — nie jest to substrat wielostacyjny).
- **B8 / 08_island_grid_forming (stacja stW):** application.analyses.lv_domain.projection_v1.build_lv_domain_projection_v1(enm, case_id, station_ref) BEZ przebiegu (run=None) — czysta projekcja jednej stacji. Scenariusz sekcja 47: 'Wyspa DER: źródło tworzące napięcie'. Porownanie do kolumny S/M budzetu (obie '< 15 ms', bo scenariusz to pojedyncza stacja — nie jest to substrat wielostacyjny).
- **B8 / 09_island_unknown (stacja stW):** application.analyses.lv_domain.projection_v1.build_lv_domain_projection_v1(enm, case_id, station_ref) BEZ przebiegu (run=None) — czysta projekcja jednej stacji. Scenariusz sekcja 47: 'Wyspa DER: zdolność nieznana'. Porownanie do kolumny S/M budzetu (obie '< 15 ms', bo scenariusz to pojedyncza stacja — nie jest to substrat wielostacyjny).
- **B8 / 10_deenergized_section (stacja stAB):** application.analyses.lv_domain.projection_v1.build_lv_domain_projection_v1(enm, case_id, station_ref) BEZ przebiegu (run=None) — czysta projekcja jednej stacji. Scenariusz sekcja 47: 'Sekcja niezasilona'. Porownanie do kolumny S/M budzetu (obie '< 15 ms', bo scenariusz to pojedyncza stacja — nie jest to substrat wielostacyjny).
- **B8 / 11_double_sided_open (stacja stAB):** application.analyses.lv_domain.projection_v1.build_lv_domain_projection_v1(enm, case_id, station_ref) BEZ przebiegu (run=None) — czysta projekcja jednej stacji. Scenariusz sekcja 47: 'Energizacja dwustronna aparatu otwartego'. Porownanie do kolumny S/M budzetu (obie '< 15 ms', bo scenariusz to pojedyncza stacja — nie jest to substrat wielostacyjny).
- **B8 / 12_der_full_path (stacja stDER):** application.analyses.lv_domain.projection_v1.build_lv_domain_projection_v1(enm, case_id, station_ref) BEZ przebiegu (run=None) — czysta projekcja jednej stacji. Scenariusz sekcja 47: 'Pełny tor źródeł rozproszonych'. Porownanie do kolumny S/M budzetu (obie '< 15 ms', bo scenariusz to pojedyncza stacja — nie jest to substrat wielostacyjny).
- **B8 / 13_loads_via_fields (stacja stODB):** application.analyses.lv_domain.projection_v1.build_lv_domain_projection_v1(enm, case_id, station_ref) BEZ przebiegu (run=None) — czysta projekcja jednej stacji. Scenariusz sekcja 47: 'Odbiory przez pola'. Porownanie do kolumny S/M budzetu (obie '< 15 ms', bo scenariusz to pojedyncza stacja — nie jest to substrat wielostacyjny).
- **B8 / 14_sub_boards (stacja stSUB):** application.analyses.lv_domain.projection_v1.build_lv_domain_projection_v1(enm, case_id, station_ref) BEZ przebiegu (run=None) — czysta projekcja jednej stacji. Scenariusz sekcja 47: 'Podrozdzielnice zagnieżdżone'. Porownanie do kolumny S/M budzetu (obie '< 15 ms', bo scenariusz to pojedyncza stacja — nie jest to substrat wielostacyjny).
- **B8 / 15_many_feeders (stacja stWIELE):** application.analyses.lv_domain.projection_v1.build_lv_domain_projection_v1(enm, case_id, station_ref) BEZ przebiegu (run=None) — czysta projekcja jednej stacji. Scenariusz sekcja 47: 'Wiele odpływów'. Porownanie do kolumny S/M budzetu (obie '< 15 ms', bo scenariusz to pojedyncza stacja — nie jest to substrat wielostacyjny).
- **B8 / 16_stale_result (stacja stC):** application.analyses.lv_domain.projection_v1.build_lv_domain_projection_v1(enm, case_id, station_ref) BEZ przebiegu (run=None) — czysta projekcja jednej stacji. Scenariusz sekcja 47: 'Wynik nieaktualny'. Porownanie do kolumny S/M budzetu (obie '< 15 ms', bo scenariusz to pojedyncza stacja — nie jest to substrat wielostacyjny).
- **B8 / 17_sc_results (stacja stC):** application.analyses.lv_domain.projection_v1.build_lv_domain_projection_v1(enm, case_id, station_ref) BEZ przebiegu (run=None) — czysta projekcja jednej stacji. Scenariusz sekcja 47: 'Wyniki zwarciowe'. Porownanie do kolumny S/M budzetu (obie '< 15 ms', bo scenariusz to pojedyncza stacja — nie jest to substrat wielostacyjny).
- **B8 / 18_swz_overlay (stacja stSWZ):** application.analyses.lv_domain.projection_v1.build_lv_domain_projection_v1(enm, case_id, station_ref) BEZ przebiegu (run=None) — czysta projekcja jednej stacji. Scenariusz sekcja 47: 'SWZ: odpływy spełniające i niespełniające'. Porownanie do kolumny S/M budzetu (obie '< 15 ms', bo scenariusz to pojedyncza stacja — nie jest to substrat wielostacyjny).
- **B8 / RAZEM (18 scenariuszy nN, mediana median):** Mediana median wszystkich scenariuszy nN (tests/application/analyses/lv_domain/scenariusze_nn.py:SCENARIUSZE) — jedna pozycja porownawcza zbiorcza; p95 = najwolniejszy scenariusz (max median). Wiersze indywidualne powyzej niosa pelny rozklad.
- **B9 / -:** Dense renderer (pierwsze wyrenderowanie + interakcja kanwy pan/zoom/selekcja) jest kodem PRZEGLADARKI (Canvas/SVG, frontend/src/ui/sld/**) — backend Python nie ma odpowiednika do zmierzenia time.perf_counter(). Wymaga harnessu Playwright W PRZEGLADARCE (nie jsdom) na sieci M/L — docs/twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md sekcja 3 ('Frontend: Playwright performance.now()/requestAnimationFrame na sieci M/L: czas do pierwszej sceny, fps przy pan/zoom, pamiec'). Poza zakresem karty PERF-0 (backend Python) — osobna karta dla frontendu.
- **B10 / G02[0]:** application.proof_engine.pakiet_biegu.zbuduj_pakiet_biegu(run) po biegu LF na G02[0] (run.status=FINISHED) — pakiet ZIP zbiorczy rozpływu: rozplyw.zip + spadek_napiecia.zip + straty.zip (kazdy: proof.json + proof.tex + manifest.json + signature.json). PDF (proof.pdf) NIEDOSTEPNY w tym srodowisku (brak pdflatex) — pakiet NIE zawiera proof.pdf, wiec ten pomiar jest DOLNYM oszacowaniem kosztu pelnego pakietu z PDF (renderowanie LaTeX->PDF nie jest wliczone). Mediana rozmiaru ZIP: 107721 B.

## Podsumowanie

- Wpisow WEWNATRZ budzetu: 19
- Wpisow PRZEKROCZONY: 25
- Wpisow NIEMIERZALNE: 4
- Pokrycie: wszystkie pozycje B1-B10 maja co najmniej jeden wpis.

Baseline nie jest bramka CI (zero asercji na czasy) — status PRZEKROCZONY jest danymi wejsciowymi do kart naprawczych programu wydajnosci (`docs/twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md`), nie powodem do podniesienia progu.
