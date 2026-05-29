# STAN_REPO.md — ŻYWY REJESTR STANU MV-DESIGN-PRO

> **TO JEST PIERWSZE CZYTANIE DLA KAŻDEGO AGENTA.** Zanim sięgniesz po `PROMPT_MV_DESIGN_PRO_PRZEBUDOWA.md` (kanon docelowy), przeczytaj ten plik — mówi, co NAPRAWDĘ jest w repo i jaki jest RZECZYWISTY dług. Kanon mówi „co znaczy skończone"; ten rejestr mówi „gdzie jesteśmy". **Repo > specy > ten rejestr** (gdy rejestr jest nieaktualny, prawdą jest świeży skan repo wg §5.0). Dla zadań masowych/równoległych — orkiestracja wg `ORKIESTRACJA_AGENTOW.md` (workflow + swarm), z barierami B-01…B-05.

> **ZASADA NR 3 (nadrzędna): NIC NA POTEM + WSZYSTKO WSZĘDZIE.** Wykryte = naprawione natychmiast, w tej samej pracy. Zakaz „follow-on" / „osobny przebieg" / „bounded increment" / „dług porządkowy odłożony" / jawnego błędu zamiast funkcji / okrajania zakresu / **wyłączania kategorii spod zakresu („to inna kategoria, więc jej nie dotyczy")**. Jeśli byt fizycznie podlega zjawisku — modelujesz je dla niego, choćby innym modelem (np. falowniki: Q(U)/P(f), nie „pominięte bo generacja"). Dług architektoniczny wykryty przy okazji → naprawiony od razu. Rozmiar → orkiestracja teraz, nie odroczenie.

**Ostatnia aktualizacja:** 2026-05-29 · **Gałąź:** `claude/zealous-bardeen-xrqtp` · **Poziom repo:** domknięcie V12.6 (PLANS.md v5.1)
**Cykl życia:** aktualizowany KAŻDĄ sesją. Każda zmiana stanu kryterium / długu → wpis tutaj.

---

## 1. ZDROWIE SYSTEMU (ground truth — uruchomione)

| Sprawdzenie | Wynik | Data |
|---|---|---|
| Backend pytest | **5271 passed**, 11 skipped, 4 xpassed, 0 failed (po D-14) | 2026-05-29 |
| Frontend type-check (tsc) | PASS | 2026-05-28 |
| Guardy (arch/pcc/codenames/forbidden-terms/heurystyki/vulture) | PASS | 2026-05-28 |
| Skala: backend 625 `.py` (+378 testów), frontend 597 `.tsx`/696 `.ts`, 88 guardów | — | 2026-05-28 |

**Wniosek:** warstwa obliczeniowa zdrowa i kompletna. NIE jest to stan „kalkulator z UI" z prompta — to dojrzały, zielony pipeline.

---

## 2. CO JEST ZROBIONE (nie ruszać — K-23: zero utraconych funkcji)

- **Zwarcia** IEC 60909 (K3/K2/K1/K2E, Ik''/ip/Ith/Ib, κ, Z1/Z2/Z0) — FROZEN
- **Rozpływy** Newton-Raphson, Gauss-Seidel, Fast-Decoupled, niesymetryczny, **QSTS** (szereg czasowy)
- **Zabezpieczenia** 50/51 IDMT/TCC + sanity-checks (27/59/59N, 81U/81O/ROCOF, SPZ)
- **FRT/LVRT/HVRT** (RMS time-domain) — PODPIĘTE i liczą
- **Stabilność dynamiczna RMS** — PODPIĘTE
- **NC RfG / PTPiREE** bateria zgodności (LFSM-O/U, FSM, FRT, Q(U), harmoniczne, typy A/B/C/D, profile OSD) + API `/api/ncrfg-tests`
- **V12.6 E-35…E-45** (11 analiz): jakość energii, stabilność napięciowa (CPF/modalna/L-index), niezawodność N-1/N-2 MC, uziemienia IEEE 80, koordynacja izolacji, TRV/inrush, rozruch silników, hosting capacity MC, OPF/straty/LCC, walidacja benchmarkowa IEEE 9/14/39, niepewność k=2 — wszystkie z API + White Box
- **Detekcja ziemnozwarciowa** sieci kompensowanych
- **SCR/WSCR per węzeł** (dodane 2026-05-28, moduł `analysis/grid_strength`, 24 testy)
- **Frontend §7B**: app shell `AppShellV12`, selektor `case_ref`, router powierzchni, kanon ekranów `screenCanonRegistry.ts`, inspektor + White Box, powierzchnie V12.6

---

## 3. RZECZYWISTY DŁUG FUNKCJONALNY (do domknięcia, ZASADA NR 1)

| # | Pozycja | Kryterium | Status | Priorytet |
|---|---|---|---|---|
| D-01 | **Arc Flash** — energia incydentu IEEE 1584-2018, granice, ŚOI; IAC IEC 62271-200 jako obliczenie | K-25, §8C.1 | BRAK — **wymaga autorytatywnych tablic IEEE 1584-2018** (patrz ustalenie niżej) | 3 |
| D-02 | **CIM / CGMES** (IEC 61970/61968) import-eksport | K-30, §8C.8 | BRAK | 4 |
| D-03 | **SCR/WSCR per PCC** (✔ część) + stabilność impedancyjna (Nyquist) + **SSCI** | K-30, §8C.4 | CZĘŚCIOWO (SCR/WSCR done; skan impedancji sieci Z(f)+rezonanse JEST w `_power_quality`; brakuje sprzężenia falownik↔sieć — **wymaga modelu impedancji małosygnałowej falownika**, patrz ustalenie niżej) | 2 |
| D-04 | **Pełny model napięciowo-/częstotliwościowo-zależny we WSZYSTKICH węzłach i solverach** (NR scalone, GS, FD): odbiory ZIP+P(f)/Q(f) ✔; **źródła falownikowe Q(U)/P(f)/tryby NC RfG (§8.7) wpięte w ten sam rozpływ — WSZYSTKO WSZĘDZIE (korekta właściciela: błędem było „falowniki = generacja, ZIP nie dotyczy")**. reduce-to-NR per ścieżka. | K-29, §8.7, §8.14, §8C.5 | **W TOKU** — ZIP odbiorów + scalenie NR WDROŻONE (dowód niżej); **falowniki U/f do wpięcia → D-04 niedomknięte** | wysoki |
| D-05 | **IEC 61850** (logical nodes/GOOSE) + **estymacja stanu WLS** | §8C.8 | BRAK | 5 |
| D-06 | Dobór uziemienia (Petersen/rezystor), kompensacja Q, CVC/Volt-VAR, IEC 60853 (cykliczna) | §8C.7 | ZWERYFIKOWAĆ zakres | 5 |
| D-10 | `ncrfg_compliance/checker.py` `DYNAMIC_TEST_IDS` zwracają `no_module` (legacy, niepodpięte do API) | — | DO WYGASZENIA (zastąpione przez `ncrfg_ptpiree`) | niski |
| D-11 | API 501: `power_flow_comparisons`, `power_flow_runs`, `fault_loop` TT/IT | — | DECYZJA ZAKRESOWA | niski |
| D-12 | **Tryb geo-schematyczny SLD** — odłożony (ENM bez współrzędnych geo); podłączyć do CGMES `DiagramLayout`/`PositionPoint` po D-02 | 7.6.C | ODŁOŻONY (zależny od D-02) | po D-02 |
| D-13 | **„Druga prawda" (Z15) we frontendzie** — (a) `ProtectionCurvesEditor.tsx` generuje krzywe IEC/IEEE + koordynację: **DEAD/legacy (niemontowany w żadnym surface — tylko barrel index.ts)**; backend MA `protection/curves/{iec,ieee}_curves.py` + API `protection_coordination.py` → fix = czytać z backendu lub usunąć martwy duplikat. (b) `AddDerWizard.tsx:505` `powerKw/0.9` — LIVE, pre-filtr pojemności trafo w ~4 miejscach; backend `add_converter_source` waliduje pojemność AUTORYTATYWNIE → fix = delegacja do backendu (jedna prawda). Live UI ⇒ wymaga weryfikacji renderem (B-02). | Z15, K-12 | **(a) WDROŻONE** (martwy duplikat usunięty — dowód niżej); **(b) POZOSTAJE** (live → B-02 + delegacja do backendu) | 2 |
| D-14 | **K-08: sanity-bounds analiz V12.6** — `_reliability`/`_opf_loss_lcc`/`_uncertainty` + fix `_benchmark_validation` (cichy fałsz K-09) + per-poziom-napięcia guard Ik'' (DEF-01) | K-08, K-04, K-09 | **WDROŻONE** (blok `sanity` w 3 metodach; benchmark bez refs → „dane niekompletne"; moduł `analysis/sanity_bounds`) | — |
| D-14b | **Wpięcie guardu Ik'' w ścieżkę konsumpcji wyników SC** — `short_circuit_to_resultset_v1._build_global_results` woła `evaluate_short_circuit_current(un_v/1000, ikss_a/1000)` i wstawia `ikss_sanity` do `global_results` (overlay/proof/tabele czytają jedną prawdę; Z15). Solver zamrożony nietknięty (B-01); `global_results` ma `additionalProperties:true` → kontrakt ResultSet v1 niezmieniony. | K-08, §5 (done = zintegrowane z API/UI), DEF-01 | **WDROŻONE** (dowód niżej) | — |
| D-14c | **Domknięcie powłoki sanity-bounds — wszystkie 12 analiz V12.6** — bloki `sanity` dodane do pozostałych 8 metod (`_power_quality`/`_voltage_stability`/`_earthing`/`_insulation`/`_earth_fault_detection`/`_transient`/`_motor_starting`/`_hosting_capacity`); granice wiarygodności + ref. normatywne (IEC 61000/EN 50160, IEEE 80/EN 50522, IEC 60071, IEC 62271). Brak wejść → „dane niekompletne" (zakaz cichego PASS). | K-08 (pełne pokrycie), K-04 | **WDROŻONE** (dowód niżej) | — |

**Domknięte porządkowo 2026-05-28:** D-07 (`eligibility_service` — usunięta fraza „Funkcja w przygotowaniu"), D-08 (`frt_hvrt` — usunięte etykiety-wymówki), D-09 (`ncrfg_compliance/checker` docstring).

**DOWÓD D-14b (2026-05-29):** `evaluate_short_circuit_current` wpięte w `application/result_mapping/short_circuit_to_resultset_v1.py:152` (klucz `ikss_sanity` w `global_results`). Test golden-MV (`test_pr18_sc_integration.py::test_mapper_global_results_complete:1052-1056`) asercjonuje `status="zweryfikowany"`, `in_range`, `voltage_band="SN"`, `blocks_osd_package=False`. Bramki: ResultSet v1 schema guard OK (kontrakt niezmieniony — `additionalProperties:true`), pcc-zero OK. Testy: 66 (sanity bounds + v126 + PR18) + 273 (slice SC/resultset) zielone, 0 fail. Solver IEC 60909 nietknięty (B-01).

**DOWÓD D-13(a) (2026-05-29):** martwy duplikat fizyki krzywych IEC/IEEE usunięty z frontendu. Usunięte pliki: `ProtectionCurvesEditor.tsx` (zawierał `generateIECCurvePoints`/`generateIEEECurvePoints` — `t=TMS·a/(Mᵇ−1)`, IEC 60255 + IEEE C37.112; komentarz w kodzie sam przyznawał „In production, this should come from the backend") + jego wyłączne dzieci `CurveLibrary.tsx`/`CurveSettings.tsx`/`CoordinationAnalysis.tsx`. Dowód martwoty: brak użycia `<ProtectionCurvesEditor>` w JSX, zero importów z barrela `index.ts` (live kod importuje wprost `TimeCurrentChart`/`FrtHvrtCurves`/`types`). Zostawione (LIVE): `TimeCurrentChart.tsx` (tylko renderuje zadane `curve.points`, bez generacji), `FrtHvrtCurves.tsx`, `types.ts`, `__tests__/`. Autorytet w backendzie: `protection/curves/{iec_curves,ieee_curves,curve_calculator}.py`. Bramki: `tsc --noEmit` OK, vitest 164/164 (protection-curves + protection-coordination) OK, no-codenames OK. **(b) NIE ruszane** — `AddDerWizard.tsx` jest LIVE (wymaga B-02).

**ZNALEZISKO (B-04, niepotwierdzone jako bloker):** `protection-coordination/tccCurveGenerator.ts` to LIVE frontendowy generator krzywych TCC — kandydat na kolejną „drugą prawdę" (Z15) podobny do D-13(b). Live ⇒ poza zakresem D-13(a); do oceny pod B-02/delegację, nie tknięte.

**DOWÓD D-14c (2026-05-29):** powłoka sanity-bounds kompletna — **12/12 analiz V12.6** ma blok `sanity` (4 z D-14 + 8 z D-14c). Każdy blok sprawdza granicę wiarygodności (skończoność/znak/zakres fizyczny), NIE liczy fizyki (czyta policzone wyniki). Brak wejść → `status="dane niekompletne"`, `checks_passed=0` (np. PQ bez źródeł harmonicznych, silnik bez `motors`). Testy `tests/test_v126_sanity_bounds.py` (15, w tym `test_every_analysis_has_sanity_block`, `test_missing_inputs_report_incomplete_not_fake_pass`, determinizm) + 40 konsumentów (`test_v126_academic_solver`, `test_audit2_validation_pack`, `test_audit2_catalogs_api`) zielone. Bramki: `trace_determinism_guard` PASS (run_hash/signature/permutation invariance pod poetry), `v12xx_canon_guard` OK, ruff+black czyste. Helper `_finite()` chroni przed NaN/inf. Determinizm zachowany.

> Uwaga audytowa: `solver_boundary_guard` flaguje `short_circuit_iec60909.py` jako zmieniony vs `origin/main` — to **pre-existing** stan gałęzi (commit `e6f2877`, wcześniejsza sesja), NIE pochodzi z D-14/D-14b/D-14c. Mój diff D-14c dotyka wyłącznie `v126_academic.py` (analiza akademicka, poza listą chronioną guardu) + testu. Guard jest projektowany dla wąskich PR-ów load-flow; na gałęzi big-refactor flaguje skumulowaną historię SC.

**USTALENIE D-03 / D-01 (2026-05-29) — blokada DANYMI, nie twardym przystankiem:** oba moduły wymagają autorytatywnych danych inżynierskich, których NIE wolno odtwarzać z pamięci (ZASADA: „działający solver dający złą wartość jest groźniejszy niż brak solvera"):
> - **D-03 (część brakująca = SSCI / Nyquist falownik↔sieć):** skan impedancji *sieci* Z_grid(jω) + rezonanse JUŻ są (`_power_quality._ybus(model, h)` + `z_scan`/`resonance_peaks`). Brakuje impedancji *małosygnałowej falownika* Z_conv(jω) — wymaga pasm regulatorów (PLL, pętla prądowa/napięciowa), których model NIE ma (`V126ConverterInput` ma tylko inercję/tłumienie/droop GFM, nie pasma). Wersja „przesiewowa" (np. flaga SSCI gdy niski SCR + kompensacja szeregowa) byłaby **heurystyką** (zakazane w warstwie fizyki) i teatrem ukończenia. Pełny solver impedancyjny = nowy solver (dozwolony), ale wymaga rozszerzenia modelu o parametry sterowania falownika — **decyzja zakresowa właściciela**.
> - **D-01 (Arc Flash IEEE 1584-2018):** model bezpieczeństwa (ŚOI/granice/PPE). Poprawna implementacja wymaga **autorytatywnych tablic współczynników IEEE 1584-2018** (5 konfiguracji elektrod × 3 poziomy napięcia, korekcje obudowy). Implementacja „z pamięci" ryzykuje subtelnie błędne wartości, których sanity-bounds NIE wyłapią (przejdą jako wiarygodne, dadzą złe PPE) — dokładnie zagrożenie, przed którym ostrzega ZASADA. **Wymaga: tablic ze standardu + walidacji wobec przykładu z normy.**

Rekomendacja: dla D-01/D-03 dostarczyć dane autorytatywne (tablice IEEE 1584-2018 / parametry sterowania falowników) albo świadomie zlecić wersję best-effort z jawnym oznaczeniem „do weryfikacji wobec normy". Do tego czasu — nie zmyślam fizyki bezpieczeństwa.

**DOWÓD D-04 / ADR-011 (2026-05-29):** właściciel autoryzował edycję rdzenia (B-01, zakresowo) i **pełny zakres** (ZASADA NR 3 — bez „GS/FD odrzucają", bez „P(f) poza zakresem"). ADR-011 **przepisane na pełny zakres** (Status: Accepted). Wdrożone i udowodnione:
> - **Model:** wielomian ZIP P(V)/Q(V) (a+b+c=1) + liniowa zależność częstotliwościowa `1+k·(f−f0)/f0`; współczynniki z katalogu (`LoadType` + `MaterializationContract.solver_fields`), Rule #10. `f` = wejście studium (`PowerFlowInput.base_frequency_hz` z `ENMDefaults.frequency_hz`).
> - **NR v1+v2:** `p_spec/q_spec` per iteracja z |V| + człon ZIP w Jakobianie J12/J22 (konwencja zweryfikowana w kodzie: aktualizacja `v_mag+=ΔV` ⇒ J12=∂P/∂V czysta). Częstotliwość = jednorazowe skalowanie bazy. Commit b7f60c8.
> - **GS i FD liczą ZIP** (nie odrzucają): GS — `S_i(|V|)` per przejście; FD — efektywny spec w mismatchu, B′/B″ stałe. Commit 72d41d7.
> - **Parytet NR/GS/FD** na const-Z: |V_B|=0.980203747 (9 m.dz.); const-Z mniej obciąża niż const-P we wszystkich; P(f)@49Hz parytet. `test_power_flow_zip_solver_parity.py`.
> - **reduce-to-NR bajt-identyczny** per solver (a=b=0,c=1,f=f0): dVmax=0, slack P identyczny; 80+ testów GS/FD/parity bez zmian; `test_power_flow_zip.py` (14).
> - **Pełne wpięcie ENM→katalog→Node(agregacja ważona mocą)→PQSpec** we wszystkich builderach obciążeń (canonical_analysis, load_flow_run_input, network_wizard, analysis_run, power_flow_input_builder). E2E: ZIP load z katalogu zmienia napięcie na ścieżce kanonicznej. 633 testy enm+PF zielone; guardy katalog/arch/binding OK.
> - **KOREKTA (ZASADA NR 3 — wszystko wszędzie):** wcześniejsze „setpointy inwerter/konwerter = generacja, ZIP nie dotyczy" było BŁĘDEM. Falownik podlega U/f (Q(U) volt-var, P(f) LFSM, tryby NC RfG §8.7) → musi być modelowany w tym samym rozpływie. **Źródła falownikowe — w toku**, ten sam wzorzec co ZIP (charakterystyka z katalogu, per-iteracja z |V|/f, człon Jakobianu, reduce-to-NR). ADR-011 rozszerzane o sekcję generacji falownikowej.
> - **Scalenie ścieżek NR (ZASADA NR 3 — zrobione):** usunięto `newton_raphson_solve` (v1) + `build_jacobian` (v1) + `_serialize_jacobian_blocks` (v1); jeden rdzeń NR (`newton_raphson_solve_v2`) + jeden Jakobian (`build_jacobian_v2`). Bramka reduce-to-NR: v1 vs v2 dla PQ-only **bajt-identyczne** (`np.array_equal` napięć, równe iteracje); 126 testów PF zielonych, 77+ szerszych (e2e/invariants) zielonych. `solver_hashes.json` odświeżony (autoryzowana zmiana rdzenia, B-01). Realizuje **Z-ZIP-04** (`SPEC_CHAPTER_07:1032`).
> - **Uwaga (poza D-04):** `solver_boundary_guard` flaguje `short_circuit_iec60909.py` zmieniony w commicie e6f2877 (V12.6 SLD), **nie** w tej pracy — to stan gałęzi sprzed sesji (guard nie obejmuje power_flow). Rozwiązanie = decyzja o niezmienności solvera SC, poza zakresem ZIP.

---

## 4. BILANS KRYTERIÓW (K-01…K-30, J-01…J-05)

**Spełnione (dowód w kodzie):** K-02, K-03, K-05, K-06, K-08 (sanity-bounds **12/12 analiz V12.6** + Ik'' wpięty w ścieżkę wyników SC — D-14/D-14b/D-14c, z testami), K-09, K-10, K-11, K-12, K-16, K-18, K-22, K-23, K-24 (rdzeń), K-28 (większość).
**Częściowo / do potwierdzenia:** K-01 (dług = D-01…D-06), K-04 (solvery liczą; **wartości/progi do walidacji testami** — sanity-bounds chroni przed absurdem, ale zgodność z referencjami IEEE/CIGRE wymaga benchmarku), K-13 (bramka CI), K-14 (coverage per moduł), K-26 (87T katalogowe; pełny solver różnicowy brak), K-27 (anti-islanding w profilach; blinding/sympathetic jawne — brak), K-29 (odbiory ZIP+P(f) we wszystkich solverach ✔ + QSTS; **źródła falownikowe U/f w toku** — D-04), K-30 (SCR done; CIM/SSCI brak).
**NIEZWERYFIKOWANE WIZUALNIE (wymagają renderu — ZASADA NR 2):** K-15, K-17 (interakcja), oraz interakcyjne warunki §7B.9 (3/5/6, A-07).

> **KOREKTA 2026-05-28 (właściciel):** werdykt sesji „SLD = klasa industrialna" **ODRZUCONY**. Ocena na zrzucie `sld_canvas_detail.png`: **SLD = 1/10** jako schemat dokumentacyjny. K-07, K-21 (SLD) i J-01 **NIE są spełnione** — cofnięte do statusu „dług blokujący". Defekty V-01…V-06 (patrz `ZADANIE_WERYFIKACJA_WIZUALNA.md` §7) podniesione do blokujących; próg wyjścia: ekspert ≥ 8/10 + warunki §7.3. Render aplikacji działa (DEF-VIS-01 naprawiony) — ale „renderuje się" ≠ „schemat dobry". **Priorytet: realna przebudowa kompozycji SLD przed czymkolwiek innym.**
>
> **KOREKTA 2 (zrzut `4.png`) — BŁĄD FIZYCZNY:** dodane defekty blokujące **V-07** (przewody WISZĄ W POWIETRZU — muszą wychodzić z głowicy/terminala, schemat jest technicznie fałszywy bez modelu punktów przyłączenia), **V-08** (wszystkie elementy klikalne → konfiguracja/wyniki), **V-09** (test wyłącznie na sieci **≥ 50 stacji**, nie na zabawce), **V-10** (wszystkie łańcuchy OZE/BESS/FW + układy mieszane przetestowane wizualnie). Próg §7.3 rozszerzony do 11 warunków.

> **Uwaga o wadze (dla audytora):** K-04 i K-08 są ważniejsze niż brakujące moduły D-01…D-06. **Działający solver dający złą wartość jest groźniejszy niż brak solvera.** Walidacja progów V12.6 i sanity-bounds przeciw absurdom (np. Ik'' 116 kA na SN 15 kV) ma priorytet diagnostyczny.

---

## 5. ZADANIE BIEŻĄCE

**`ZADANIE_WERYFIKACJA_WIZUALNA.md`** — weryfikacja wizualna (ZASADA NR 2) na stacku z renderem. Priorytet najwyższy: zanim dosypiemy moduły, zobacz prawdę na ekranie. Wymaga `docker-compose up` + render przeglądarką — niewykonalne w bezgłowym kontenerze.

---

## 6. KOLEJNOŚĆ DALSZEJ PRACY

0. **PRZEBUDOWA SLD do progu ≥ 8/10** (`ZADANIE_WERYFIKACJA_WIZUALNA.md` §7) — NAJWYŻSZY priorytet. Ustalenia + decyzje (2026-05-28):
   - **V-07 = defekt RENDERU, nie modelu.** ENM ma pełny model terminali (`Port/PortRef/PortKind`, `endpoint_a_port/endpoint_b_port`, `starting_port_ref`, `external_ports`); `enmToSldAdapter.ts` go ignoruje, licząc geometrię ze sztywnych slotów (`Y_RUN_BASE`, `X_START + j×pitch`). Naprawa w adapterze, nie w modelu. Rozpływ/zwarcia wzdłuż połączeń mają na czym liczyć (model jest).
   - **Sieć 52 stacji (substrate `generate-large-network.mjs`) ujawniła „grzebień":** auto-layout = jeden płaski rząd, ~70% pustki, brak drzewa. To inadekwatność silnika layoutu przy skali — przebudowa, nie tweak.
   - **DECYZJA (właściciel):** layout + zakotwiczenie portów **równolegle**, przez wspólny kontrakt geometrii (silnik layoutu zwraca pozycje obiektów ORAZ portów; adapter rysuje krawędzie port→port, nie ze slotów).
   - **DECYZJA (właściciel):** SLD **przełączalny topologiczny ↔ geo-schematyczny** — jedna prawda topologiczna ENM, dwie warstwy geometrii (zakaz drugiej prawdy). Tryb topologiczny: laterale w rankach (koniec grzebienia). Tryb geo: **diagnoza wykonana 2026-05-28 → ENM NIE MA współrzędnych geo** (tylko `position_km` topologiczne). **Tryb geo ODŁOŻONY jako dług D-12** — wartość naprawcza jest w topologicznym; geo podłączy się do CGMES `DiagramLayout`/`PositionPoint` (D-02) w swoim czasie. Robimy najpierw tryb topologiczny do ≥8/10.
   - **Kontrakt geometrii dostarczony:** `docs/sld/SLD_GEOMETRY_CONTRACT_V1.md` — `LayoutEngine.layout(snapshot, mode) → LayoutResult` (pozycje obiektów + portów); adapter czyta kotwice, rysuje port→port. **Nie ma dedykowanego silnika layoutu** — to nowa warstwa, nie refaktor.
   - Próg §7.3 (11 warunków, ≥8/10) obowiązuje dla trybu topologicznego na sieci ≥50 stacji.
   - **POSTĘP (impl, iteracja 1, 2026-05-28):** generator naprawiony → substrate **52 stacje + 12 LATERALÓW** (drzewo; `sld_large_network*.png`). Payloady ops ustalone empirycznie (branch: `from_ref=<feederFieldRef>.BRANCH`; converter: `source_technology`+`connection_variant=block_transformer`+`station_ref`).
   - **USTALENIE LAYOUTU (ze zrzutu 52-stacji z lateralami):** adapter „kanały Y per run" FAKTYCZNIE tworzy laterale (poziome rzędy stacji) — drzewo istnieje. ALE: **(a)** auto-fit zostawiał drzewo malutkie w rogu; **(b)** laterale lewo-wyrównane do tego samego X (stos), bo `buildSldLineRunsForLayout` klasyfikował WSZYSTKIE korytarze jako `main_trunk` (brak `branch_origin_station_ref`), a `stationXFromCumKm` miał `minimumX` przyklejony do `X_STATIONS_START`.
   - **POSTĘP (impl, iteracja 2, 2026-05-28) — DRZEWO ROZŁOŻONE ✔ (zrzut `sld_large_network*.png`):** (1) `buildSldLineRunsForLayout` klasyfikuje teraz korytarz jako `branch` z `branch_origin_station_ref`, gdy stacja-rodzic (from_bus pierwszego segmentu) leży na innym runie; (2) `stationXFromCumKm` ma param `minimumBaseX`; (3) `buildStations` startuje laterale od X stacji-rodzica. Efekt na zrzucie: pozioma **magistrala S02→S18 na pełną szerokość + laterale schodzące w dół w punktach przyłączenia** (S23 pod S03, S25–S27, S28–S29, S30–S33…) — ewidentna zmiana ze „stosu" na **drzewo**. 2232 testy SLD zielone.
   - **POZOSTAJE (SLD < 8/10, nie zamykać):** **(a) fit/wypełnienie pionowe** — drzewo siedzi w dolnej połowie, górne ~40-50% kadru puste (auto-fit po realnym zasięgu treści ≥75%); **(b) V-07** zakotwiczenie do portów głowic (krawędzie port→port, nie do slotów); **(c) V-10** OZE (generator der=0 — `add_converter_source` binding); **(d) V-06** tryb prezentacyjny; **(e) V-08** klikalność. Werdykt eksperta jeszcze < 8/10.
   - **OZE (V-10) — BLOKER MODELOWY (zdiagnozowany, nie zmyślony):** `add_converter_source` z `connection_variant=block_transformer` używa trafo stacji (630 kVA @ 0.4 kV). Warianty katalogowe konwerterów: PV `conv-pv-sma-1p5mw` = 1650 kVA (> 630), `pv_inv_sma_2500`/`bess_pcs_sma_2200` = 0.69 kV (≠ 0.4 kV) → odrzucane (capacity/voltage mismatch). `FALOWNIK/inv-pv-1500` przeszedł w izolowanym probe, ale w pełnym generatorze daje `catalog.ref_required`. **Do zrobienia:** dedykowany transformator blokowy OZE (nie trafo dystr. stacji) ALBO wariant katalogowy ≤630 kVA @ 0.4 kV ALBO `nn_side` z `bus_nn_ref`. Nie udajemy OZE bez poprawnego modelu.
   - **POMIAR FILL (§7.3.1, harness):** union-bbox elementów SLD = **fillW 100% / fillH 100%** (treść rozpięta na cały kadr), ALE kompozycja rzadka — pusty górny-prawy obszar (GPZ izolowany lewy-górny, magistrala niżej). „≥75% bbox" spełnione; „zero wielkich pustych obszarów" — NIE. Do poprawy: zbalansowanie drzewa (laterale nad i pod magistralą) lub zmniejszenie luki GPZ→magistrala.
1. **Reszta weryfikacji wizualnej** — harness interakcyjny (A-07, §7B.9-3/5/6), pozostałe surface'y.
2. **K-04 + K-08** — walidacja progów V12.6 i sanity-bounds (wiarygodność wartości przed nowymi modułami).
3. **D-04 ZIP** → **D-03 stabilność impedancyjna/SSCI** → **D-01 Arc Flash** → **D-02 CIM/CGMES** → **D-05/D-06**.
4. Porządki: D-10 (wygaszenie legacy), D-11 (decyzja zakresowa).

Każda pozycja: pełne wdrożenie (UI → solver → kontrakt → test → integracja), sanity-bounds, weryfikacja wizualna na stacku.

---

## 7. AUDYT SWARM 2026-05-29 (orkiestracja read-only, 3 subagenty + integracja B-04)

Pierwszy run orkiestracji wg `ORKIESTRACJA_AGENTOW.md` (3 subagenty read-only: backend-debt, frontend-debt, value-integrity/V-defekty; integracja w głównej sesji). Bariery: B-01 (read-only, zero edycji), B-02 (zero werdyktu wizualnego — tylko stan kodu), B-04 (klasyfikacja kandydatów przez integratora).

**Status defektów SLD V-01…V-10 (z kodu, nie z prozy):**
- **ADDRESSED-IN-CODE:** **V-05** (magistrala cienka 3,5 px + chip napięcia + strzałki kierunku), **V-08** (klikalność — ~92 miejsc `onSelectElement` + `data-element-kind` dla pól/aparatów/stacji/trafo/ZKSN; hit-boxy). *(V-08 wcześniej „niezweryfikowane" → faktycznie zrobione.)*
- **OPEN:** **V-06** (komponenty `SldTitleBlock/SldLegendOverlay/SldScaleRuler/SldRevisionTable/SldNorthArrow/SldPowerBalancePanel` ISTNIEJĄ + propsy zadeklarowane w `SldCanvasV2`, ale **nigdy nie renderowane** — tylko testy je konsumują; brak komponentu ramki rysunku); **V-07** (geometria kabli wciąż ze slotów; `portRef` wypełnia tylko `terminalBindings` metadane, nie pozycje — zgodnie z diagnozą §6).
- **PARTIAL:** V-01 (fit centruje, ale kompozycja rzadka), V-02 (token zunifikowany, ale geometria trunku z innego pipeline'u niż aparatura GPZ), V-03 (drzewo jest; brak wagi hierarchii poza lane index), V-04 (dedup „GPZ 15 kV" ✔, ucięcia złagodzone nie udowodnione), V-09 (kod skaluje; substrate 52 stacji jest), V-10 (łańcuchy OZE zakodowane, ale bloker `add_converter_source` → der=0 na seedzie).

**Dług nowy (wysokiej pewności, dowód file:line):** D-13 (Z15 frontend), D-14 (K-08 sanity-bounds — priorytet diagnostyczny właściciela).

**Kandydaci backend do weryfikacji (B-04 — nie potwierdzone jako blokery):** `solver_input/builder.py:415` PROTECTION stub (pusty payload) + `enm/models.py:55` `ProtectionSetting` „stub" — ALE ochrona DZIAŁA przez własny pipeline `application/analyses/protection/` (pipeline/coordination/sanity_checks); to ścieżki drugorzędne/legacy, nie brak ochrony. `api/designer/engine.py` „Run Analysis not implemented" — ścieżka niepewna (główny pipeline `execution/runs` działa), do weryfikacji. `audit2_catalogs.py:1150` DER defaults hardcoded — wiąże z V-10. Znane: TT/IT=D-11, ncrfg=D-10.

**Legitymne (nie dług):** 501 dla opcjonalnych zależności (reportlab/python-docx), `no_module` jako kontrakt statusu, komentarze/TODO bez wpływu runtime, walidacja wejścia (`input_invalid`).

-----

*Żywy rejestr stanu. Aktualizuj każdą sesją. Źródłem prawdy ostatecznej jest świeży skan repo (§5.0) — gdy ten plik się z nim rozjedzie, prawdą jest repo.*
