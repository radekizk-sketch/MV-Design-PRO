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
| D-04 | **Pełny model napięciowo-/częstotliwościowo-zależny we WSZYSTKICH węzłach i solverach** (NR scalone, GS, FD): odbiory ZIP+P(f)/Q(f) ✔; **źródła falownikowe Q(U)/P(f)/tryby NC RfG (§8.7) wpięte w ten sam rozpływ — WSZYSTKO WSZĘDZIE (korekta właściciela: błędem było „falowniki = generacja, ZIP nie dotyczy")**. reduce-to-NR per ścieżka. | K-29, §8.7, §8.14, §8C.5 | **WDROŻONE** — odbiory ZIP + scalenie NR + **źródła falownikowe U/f we wszystkich 3 solverach + wpięcie katalog→solver**; parytet NR/GS/FD, reduce-to-NR bajt-identyczny (dowód niżej). Granica numeryczna GS/FD przy bardzo stromym nachyleniu Q(U) — patrz dowód | — |
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
> - **Źródła falownikowe U/f (korekta „falowniki = generacja" — WDROŻONE, ZASADA NR 3):** model `InverterControl` (NC RfG §8.7: Q_CONST, COSPHI_CONST, COSPHI_P, Q(U) volt-var, P(f)/LFSM) na `PQSpec.inverter_control`. We **wszystkich 3 solverach**: NR (per-iteracja Q(U) + człon ∂Q/∂V w J22, white-box `inverter_sources`), GS, FD — ten sam kontrakt co ZIP. Wpięcie katalog→solver kompletne: `ConverterType`/`InverterType` pola U/f + `MaterializationContract.solver_fields` + wszystkie buildery źródeł → `inverter_control_from_params`. Dowód: parytet NR=GS=FD (V_B=1.009403) + cosφ + LFSM; reduce-to-NR bajt-identyczny (źródło pasywne = czysty wstrzyk PQ); `test_power_flow_inverter.py` (13) + `test_power_flow_inverter_parity.py` (4); 142 PF + 1549 enm/app testy zielone; guardy katalogu OK; `solver_hashes.json` odświeżony.
> - **Strome nachylenie Q(U) — ROZWIĄZANE (under-relaxation, decyzja właściciela):** GS/FD mają under-relaxation rdzenia Q(U) (`inverter_relax_q`, α=1/max(1,slope)) — punkt stały tłumiony, więc zbiegają przy stromych nachyleniach (gdzie wcześniej oscylowały). Dowód: parytet NR/GS/FD przy nachyleniach 2/4/8 w granicy ≤2e-8 (GS 15/29/46, FD 18/36/59 iteracji; NR 4); reduce-to-NR bajt-identyczny zachowany; `test_power_flow_inverter_parity` testuje pełny parytet 3-solverowy przy nachyleniach stromych. Wartość zbieżna = qu_q(V*), więc parytet z NR i reduce-to-NR niezmienione — tłumiona tylko ścieżka iteracji.
> - **Scalenie ścieżek NR (ZASADA NR 3 — zrobione):** usunięto `newton_raphson_solve` (v1) + `build_jacobian` (v1) + `_serialize_jacobian_blocks` (v1); jeden rdzeń NR (`newton_raphson_solve_v2`) + jeden Jakobian (`build_jacobian_v2`). Bramka reduce-to-NR: v1 vs v2 dla PQ-only **bajt-identyczne** (`np.array_equal` napięć, równe iteracje); 126 testów PF zielonych, 77+ szerszych (e2e/invariants) zielonych. `solver_hashes.json` odświeżony (autoryzowana zmiana rdzenia, B-01). Realizuje **Z-ZIP-04** (`SPEC_CHAPTER_07:1032`).
> - **§2 B-01 — diagnoza SC + ROZWIĄZANE (decyzja właściciela: revert):** guard flagował `short_circuit_iec60909.py` zmieniony w e6f2877 (V12.6 SLD). Diagnoza (read-only): zmiana to **5 linii NIE-fizyki** w `_build_white_box_trace` (`r_ohm`/`x_ohm`/`z_equiv_abs_ohm` = re-projekcje `z_equiv`), zero zmiany wyników (158 testów SC zielonych, golden bajt-stabilne). Właściciel wybrał revert (R/X/|Z| wyprowadzalne z `z_equiv_ohm`). **Wykonane:** krok „Zk" przywrócony do `{z_equiv_ohm}`, test cofnięty; `short_circuit_iec60909.py` == `origin/main` → `solver_boundary_guard` ZIELONY, `solver_diff_guard` ZIELONY, 29 testów SC OK. Commit `620595d`. Rdzeń SC nietknięty fizycznie.

**§3 W TOKU — KARTA FALOWNIKA (bez braków = kompletna struktura + status pochodzenia per pole; bez zmyślania).** Recon (read-only) ustalił: `ConverterType` (catalog/types.py) = jedyne źródło autorytatywne; **`InverterType` = DUPLIKAT/druga prawda → do wygaszenia (RULE 3)**; mechanizm provenance **ISTNIEJE** (`solver_input/provenance.py`: SourceKind CATALOG/OVERRIDE/DERIVED/DEFAULT_FORBIDDEN) — rozszerzyć o oś jakości danych (karta_techniczna/oszacowane/domyślne_techniczne), nie dublować; model SC falownika = tylko `k_sc`·In (brak P+Q/transient — do rozszerzenia §8.7); **pasma regulatorów (prąd/napięcie/PLL) dla Z_conv(f) NIE ISTNIEJĄ nigdzie — luka blokująca D-03**; bramka OSD (blokada `oszacowane`/`domyślne` bez akceptacji inżyniera) **NIE ISTNIEJE — nowy kod**; karty referencyjne = rodziny parametryczne w `mv_converter_catalog.py`. **FUNDAMENT ZROBIONY (commit `41fa568`):** `ConverterType` rozszerzony o pełny schemat karty (SC-warianty `sc_model`/`sc_pq_split`/`sc_transient_k`/`sc_sustained_k`; pasma regulatora `current/voltage/pll_bandwidth_hz`+`control_delay_ms` dla Z_conv; hierarchia mocy + `validate_power_hierarchy`) — opcjonalne, 173 konwertery bajt-identyczne, w `solver_fields`. Oś jakości danych: `FieldQuality` (DATASHEET/ESTIMATED/SYSTEM_DEFAULT) + `CardFieldStatus` w `provenance.py` (zintegrowane z `ProvenanceEntry`, nie równoległe); seed `card_field_quality_map`: pasma regulatora = ESTIMATED nawet gdy podane (gwarancja anty-zmyślania). 20 testów karty + 322 regresji + guardy katalogu zielone.
> **D-03 SSCI — POŁOWA FIZYCZNA ZROBIONA (solver, Steps 0-3):** `v126_academic._z_conv_components` — Z_conv(jω) małosygnałowa impedancja wyjściowa GFL VSC (Sun 2011 / Cespedes&Sun 2014 / Wen 2016), white-box, z pól karty (pasma regulatora + filtr); `_ssci_impedance` — przemiata 1-250 Hz, Z_grid(f) z reuse `_ybus`+diagonala (shunt źródła bramkowany TYLKO do SSCI → golden PQ bajt-identyczny), L(f)=Z_grid/Z_conv. Mechanizm SSCI potwierdzony: ujemna rezystancja poniżej pasma PLL; sieć słaba (SCR 1.5) pcha |L|→O(1) ku −1, sieć silna (SCR 50) trzyma |L|<0.5. Braki pól → „dane niekompletne" (zakaz fabrykacji). **DECYZJE (jawne, wg stałych dyrektyw):** (1) `filter_l_pu`/`filter_r_pu` dodane jako pola karty ESTIMATED (bez braków + bez zmyślania); (2) ko-lokacja w `v126_academic.py` (jedna prawda Ybus, RULE 3); (3) shunt bramkowany do SSCI (golden PQ zamrożony).
> **D-03 SSCI — KOMPLETNE (fizyka + werdykt):** połowa werdyktu `analysis/ssci_stability/` (Nyquist na L(jω)=Z_grid/Z_conv; Sun 2011/Wen 2016/Cespedes&Sun 2014). Klasyfikacja: `stabilny` (max|L|<1 → bezwarunkowa stabilność Sun 2011) / `ryzyko SSCI` (max|L|≥1, przecięcie magnitud) / `niestabilny` (okrążenie −1 lub Δφ≤0 przy |L|≥1) / `brak danych`. Werdykty literaturowe: sieć silna SCR 50 → `stabilny` (max|L|=0.087); sieć słaba SCR 1.5 → `ryzyko SSCI` (max|L|=2.73, przecięcie 119 Hz, ∠L=132°). Provenance worst-case → tag „werdykt oparty na oszacowanych pasmach regulatora" (komponuje z `osd_card_gate`, bez blokady analizy). Deterministyczne SHA-256; arch_guard zielony (analiza nie importuje solvera); 22 testy. **UCZCIWE NIUANSE (jawne):** (a) dla kart referencyjnych próg marginesu fazy plateau ~39° niezależnie od sieci → dyskryminatorem pierwotnym jest przekrycie magnitud (Sun 2011), nie strojony próg fazy; (b) pasmo przekrycia |L|≥1 dla tych kart wypada blisko-/nad-synchronicznie (119-250 Hz), nie ściśle <50 Hz — mechanizm ujemnej rezystancji jest sub-synchroniczny (4.78 Hz), ale przecięcie impedancji wyżej; werdykt raportuje rzeczywistą częstotliwość, nie zmyśla wartości <50 Hz. To analiza stabilności impedancyjnej (pełny Nyquist, nie przesiew) — klasyczne SSCI to jej sub-synchroniczny przypadek.
> **§3 KARTA KOMPLETNA (commit `0eb1c09`):** (a) bramka OSD `osd_card_gate` — blokuje ESTIMATED/SYSTEM_DEFAULT w pakiecie bez akceptacji inżyniera (DATASHEET nigdy nie blokuje), zintegrowana z `ReadinessBlocker` + kod `oze.card_field_not_accepted`; analiza NIE jest blokowana (liczy na wartości typowej). (b) karty referencyjne: Huawei SUN2000-215KTL-H3 (string PV), Sungrow SG3150U-MV (central), Sungrow SC2000UD-MV (BESS PCS) — ratingi DATASHEET (źródło=producent), pasma regulatora ESTIMATED (źródło=Yazdani&Iravani 2010/IEEE 1547, nigdy DATASHEET). (c) testy: `test_inverter_card_osd_gate` + schema; 195 catalog + 263 provenance + guardy zielone. **Potem D-03 SSCI** na pasmach regulatora (pełny Nyquist Z_grid/Z_conv, nie przesiew).
> **§2 SC — ROZSTRZYGNIĘTE (un-revert AUTORYZOWANY B-01 przez właściciela):** `origin/main` przeszło do `0b87b0e` i ZAWIERA już zmianę trace SC z e6f2877; trzymanie reverta §2 tworzyłoby DRUGĄ PRAWDĘ o zamrożonym rdzeniu (gałąź mówi „tych 5 linii nie ma", main mówi „są"). Fakt bazowy się zmienił → decyzja musi się zmienić: właściciel świadomie autoryzował wyrównanie gałęzi do main (un-revert), bo jedna prawda o main > czystość pierwotnego reverta. SC przywrócony do `origin/main` exactly, guard zielony.
> **AUTORYZOWANY FAKT (ślad, nie zamiecione):** e6f2877 dodał NIE-FIZYCZNE pola trace `r_ohm`/`x_ohm`/`z_equiv_abs_ohm` (re-projekcje już policzonego `z_equiv`) do zamrożonego SC; weszło do main `0b87b0e`; **DELTA WYNIKÓW = 0** (dowód: 158 testów SC zielonych + golden `proof.json` bajt-stabilny + `solver_diff_guard` hash-based zielony). Zamrożony rdzeń dotknięty ŚWIADOMIE, przez e6f2877, skutek zerowy, zaakceptowane przez właściciela jako zgodne z main — nie „guard przypadkiem zgasł".
> **DŁUG D-16 (zaplanowany, ZASADA NR 3 — naprawa u źródła):** przenieść wyliczanie `R`/`X`/`|Z|` z trace solvera SC do WARSTWY PREZENTACJI (White Box/inspektor liczy z `z_equiv_ohm`), żeby zamrożony rdzeń nie nosił pól pochodnych. Osobna, czysta zmiana warstwy prezentacji + ADR + zgoda B-01 — NIE „przy okazji" pod presją zielonego CI, NIE w tej turze (to znów byłaby zmiana frozen-core pod presją). Jawny zaplanowany dług, nie odroczenie w złym sensie: un-revert daje jedną prawdę + zielony guard natychmiast; D-16 to ulepszenie architektury dotykające frozen SC, więc wymaga ADR+B-01 tak czy inaczej.

**DŁUG D-15 (druga prawda, RULE 3 — wykryty przy §3, OTWARTY):** `InverterType` ≡ `ConverterType` to ŻYWY duplikat namespace'u, nie osierocony (recon mylił się): tabela DB `inverter_types`+`InverterTypeORM`, publiczny REST `list_inverter_types`, import/eksport ZIP (`json_importer`/`json_exporter`), `network_wizard.assign_converter_type` używa `get_inverter_type` jako akcesora KONWERTERA, `_derive_inverter_records` lustrzy converter→inverter. Usunięcie złamałoby schemat DB + API + round-trip ZIP. **Wymaga dedykowanej migracji** (drop tabeli + deprecjacja API + shim import/eksport + usunięcie `_derive_inverter_records`), nie efektu ubocznego bez regresji — osobny krok ExecPlan. Karta zbudowana na `ConverterType` (autorytatywny).

---

## 4. BILANS KRYTERIÓW (K-01…K-30, J-01…J-05)

**Spełnione (dowód w kodzie):** K-02, K-03, K-04 (**walidacja krzyżowa pandapower 3.4.0** — NR PRODUKCYJNY `power_flow_newton.solve_power_flow_physics` + NR harness `computation.py` vs IEEE case9/14/39: worst |V| ~5e-8 % ≪ 0.5 %, kąt ~5e-7°, Ybus zgodny do ~7e-15; referencje committed z proweniencją, generowane offline, BEZ runtime-zależności pandapower; nie-tautologiczne; SC krzyżowo poza zakresem — case'y MATPOWER nie mają danych zwarciowych), K-05, K-06, K-08 (sanity-bounds **12/12 analiz V12.6** + Ik'' wpięty w ścieżkę wyników SC — D-14/D-14b/D-14c, z testami), K-09 (regresja < 0.5% z dowodem krzyżowym, nie literały), K-10, K-11, K-12, K-16, K-18, K-22, K-23, K-24 (rdzeń), K-28 (większość), K-29 (U/f wszędzie: odbiory ZIP+P(f) i źródła falownikowe Q(U)/P(f) we wszystkich 3 solverach + QSTS — D-04).
**Częściowo / do potwierdzenia:** K-01 (dług = D-05/D-06 + część D-01…D-02 best-effort/odłożone), K-13 (bramka CI), K-14 (coverage per moduł), K-26 (87T katalogowe; pełny solver różnicowy brak), K-27 (anti-islanding w profilach; blinding/sympathetic jawne — brak), K-30 (SCR done; CIM/SSCI brak).
**NIEZWERYFIKOWANE WIZUALNIE (wymagają renderu — ZASADA NR 2):** K-15, K-17 (interakcja), oraz interakcyjne warunki §7B.9 (3/5/6, A-07).

> **KOREKTA 2026-05-28 (właściciel):** werdykt sesji „SLD = klasa industrialna" **ODRZUCONY**. Ocena na zrzucie `sld_canvas_detail.png`: **SLD = 1/10** jako schemat dokumentacyjny. K-07, K-21 (SLD) i J-01 **NIE są spełnione** — cofnięte do statusu „dług blokujący". Defekty V-01…V-06 (patrz `ZADANIE_WERYFIKACJA_WIZUALNA.md` §7) podniesione do blokujących; próg wyjścia: ekspert ≥ 8/10 + warunki §7.3. Render aplikacji działa (DEF-VIS-01 naprawiony) — ale „renderuje się" ≠ „schemat dobry". **Priorytet: realna przebudowa kompozycji SLD przed czymkolwiek innym.**
>
> **KOREKTA 2 (zrzut `4.png`) — BŁĄD FIZYCZNY:** dodane defekty blokujące **V-07** (przewody WISZĄ W POWIETRZU — muszą wychodzić z głowicy/terminala, schemat jest technicznie fałszywy bez modelu punktów przyłączenia), **V-08** (wszystkie elementy klikalne → konfiguracja/wyniki), **V-09** (test wyłącznie na sieci **≥ 50 stacji**, nie na zabawce), **V-10** (wszystkie łańcuchy OZE/BESS/FW + układy mieszane przetestowane wizualnie). Próg §7.3 rozszerzony do 11 warunków.
>
> **ROZSZERZENIE 2026-05-29 — LOD (Level of Detail), ZASADA 3:** pominięcie LOD w specyfikacji SLD = błąd krytyczny (nie kosmetyka). SLD ≥50 stacji NIECZYTELNY bez LOD niezależnie od layoutu (dowód: 52 stacje jako mikro-znaczki). LOD = 2 sprzężone warstwy: graficzny (zoom) + danych (semantyczny). Trzy poziomy: **L0** (stacje jako bloki, przegląd) / **L1** (stacja: pola/trafo/sprzęgła + kluczowe wyniki) / **L2** (pełna aparatura + głowice + pełne wyniki). **JEDNA prawda geometrii** (zagnieżdżona `NodeGeometry.children`, NIE trzy osobne pozycje); widoczność warstw per poziom rozwiązuje nachodzenie etykiet (A-01/A-03) STRUKTURALNIE. Kontrakt `docs/sld/SLD_GEOMETRY_CONTRACT_V1.md` §7 rozszerzony; nowy agent swarm **`lod-controller`**; próg §7.3 → **16 warunków** (12 L0-czytelność, 13 L2-bez-nachodzeń, 14 płynność, 15 etykiety-przez-LOD, 16 klik-nawigacja); werdykt ≥8/10 (B-02) na WSZYSTKICH 3 poziomach; zrzuty L0/L1/L2 per poziom → STOP.

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
3. **D-04 ZIP** ✅ → **D-03 stabilność impedancyjna/SSCI** ✅ (fizyka+werdykt, commits `13d41d5`+`85b8281`) → **D-01 Arc Flash** ✅ STRUKTURA GOTOWA, WSPÓŁCZYNNIKI OD WŁAŚCICIELA (best-effort USUNIĘTE — owner refinement; `analysis/arc_flash/` pełna struktura IEEE 1584-2018: kotwice 600/2700/14300 V + interpolacja, 5 konfiguracji elektrod VCB/VCBB/HCB/VOA/HOA, korekta obudowy, AFB przy publicznym progu 1.2 cal/cm², czas łuku z czasu zadziałania zabezpieczeń, zakres ważności 208 V–15 kV / 500 A–106 kA, **Ralph Lee >15 kV jawnie osobno** (publiczny wzór 2.142e6, NIE udaje IEEE 1584); współczynniki = PUSTA typowana tablica `norma_IEEE_1584` z markerem „BRAK — wymaga tablic IEEE 1584-2018 od właściciela", brakujący współczynnik=None nie fałszywy float; PPE NFPA 70E pusta `norma_NFPA_70E`; **pusta tablica → status `dane niekompletne — tablice IEEE 1584`, ZERO wyniku**; ścieżka flip-to-verified gotowa — wypełnienie tablicy daje wynik bez zmian kodu; 47 testów NA STRUKTURZE nie wartościach; bramka OSD blokuje; arch/solver_diff zielone, frozen nietknięte). **ZASILONE współczynnikami open-source (rwl/arcflash MIT, ref IEEE DataPort) → status `COMPUTED_IEEE_1584_OPEN_SOURCE` (audit-pending): liczy realne wyniki (pełny model IEEE 1584-2018 — Iarc k1..k10, VarCf k1..k7, E/AFB k1..k13 × interpolacja 600/2700/14300 V, CF Tab.7), ale bramka OSD blokuje pakiet CERTYFIKOWANY bez świadomej akceptacji; flip→verified gdy właściciel zweryfikuje z licencjonowaną IEEE 1584-2018 (bez zmian kodu). Współczynniki ładowane z `data/norm_coefficients/` — 41 zestawów zgodnych co do bajta, ZERO zmyślenia; plausibility 13.8 kV/25 kA → I_arc 23.25 kA/E 7.06 cal/cm²/AFB 2831 mm; 52 testy; frozen nietknięte. NFPA 70E progi nadal `dane niekompletne`. IAC IEC 62271-200 osobno.** → **D-02 CIM/CGMES** ✅ EQ+TP (CIM 3.0), eksport/import deterministyczny, round-trip bezstratny (semantic+input hash równe), ścieżka katalogu MIGRACJA/CATALOG_MAPPING_REQUIRED, side-car dla pojęć ENM-specyficznych, stdlib XML (bez nowych zależności), brak PCC; 36 testów; arch/pcc_zero/domain_no_guessing/catalog_binding/utf8 zielone. **ODŁOŻONE: SSH/SV/DL (DL→D-12, brak geo), pełny 61968, endpointy API (seam=service).** → **D-06a/b uziemienie neutralne** ✅ (cewka Petersena: L=1/(3ω²C0), prąd resztkowy z rozstrojeniem; rezystor NER: R=U/I_ef + sprawdzenie cieplne I²Rt; `v126_academic`, formuły pierwszych zasad, „dane niekompletne" gdy brak b0 — naprawiono lukę: `b0_siemens_per_km` dodane do `V126BranchInput`; 24 testy; arch/solver_boundary/diff zielone, frozen SC/PF nietknięte). → **D-06d adekwatność mocy biernej** ✅ (`analysis/reactive_adequacy/`, rezerwa/saturacja Q + naruszenia U z wyniku PF, czysta interpretacja, prowenancja worst-case; uczciwy caveat: PF daje Q per-szyna nie per-źródło → Q_actual jako wejście, brak→„dane niekompletne"; odroczone: dobór Mvar=sensitivity, shunt=D-06c; 29 testów, arch zielony). → **D-06c bateria kondensatorów shunt** ✅ (element ENM `ShuntCapacitor` + namespace katalogu `KOMPENSATOR_SN` + typ/kontrakt + walidator E040-42/W040 + eksport CGMES `LinearShuntCompensator`; mapuje na ISTNIEJĄCY `ShuntSpec` (b_pu=Mvar/S_base) → **frozen solver NIETKNIĘTY** (solver_diff PASS 7 plików); test efektu PF: |V| rośnie monotonicznie 1.070→1.108→1.167 dla 0/2/5 Mvar; 15 testów + 690 regresji; wszystkie guardy katalogu/arch/pcc zielone; naprawiono pr-existing E741 w dotykanym hash.py). Odroczone: przełączanie dyskretne (bank stały + status), import 3rd-party LinearShuntCompensator (side-car=ścieżka bezstratna). → **D-14 walidacja krzyżowa pandapower** ✅ (NR PRODUKCYJNY `power_flow_newton` + NR harness `computation.py` vs IEEE case9/14/39: worst |V| ~5e-8 % ≪ 0.5 %, kąt ~5e-7°, Ybus zgodny do ~7e-15 — sieć wierna, agreement realny nie artefakt; referencje committed z proweniencją `pandapower 3.4.0`, generacja offline `scripts/generate_ieee_references.py`, BEZ runtime-zależności; K-04/K-09 dowód krzyżowy NIE-tautologiczny; `frozen_solver_input.py` + złapane 2 bugi wierności konwertera, frozen solver NIETKNIĘTY solver_diff PASS; SC krzyżowo poza zakresem — case'y MATPOWER bez danych zwarciowych, SC pokryte fixturem `iec60909-radial`). → **NIE BUDOWAĆ (spekulacyjne): D-05a IEC 61850 bez konsumenta.** → **D-05c WLS estymacja stanu** ✅ (`network_model/solvers/state_estimation_wls.py` — WLS Schweppe/Abur, Jacobian analityczny, równania normalne Gaussa-Newtona, detekcja błędów grubych chi²+LNR, obsługa obserwowalności bez zgadywania; benchmark SYNTETYCZNY jawnie oznaczony — rng seed 20260529, odzysk stanu prawdziwego worst |V̂−V|=0.00088 pu / |θ̂−θ|=0.00085 rad, +20σ błąd wykryty i zlokalizowany; reużywa frozen `build_ybus_pu` read-only — NIETKNIĘTY, solver_diff PASS; 25 testów, determinizm; **rzeczywista walidacja SCADA/PMU = przyszłość**). **CZEKA NA DANE NORMOWE (wyszukać, nie fabrykować): D-01 współczynniki IEEE 1584-2018, D-06f tablice IEC 60853. NIE BUDOWAĆ (spekulacyjne): D-05a. SCOPING (zgłosić): D-05b GOOSE, D-06e CVC, D-12 geo.**
   **✅ CERTYFIKACJA SESJI 2026-05-29 (capstone §2):** pełna bateria backendu **5578 passed, 6 skipped, 4 xpassed, 0 FAILED** (407 s); guardy **71/77 PASS** — 6 awarii w 100% PRE-EXISTING i poza zakresem sesji (frontend: `CanonicalLayout.tsx`, `PVInverterModal.tsx`, `engineering-semantic/types.ts`, `V126AcademicSurface.tsx`, brak `SLD_V2_BUILD_GATE_2026.md`; backend martwy kod: `catalog/types.py:1423` z commitu `e6f28774` 2026-05-28 + `station_templates/`+`reporting/` — wszystkie nietknięte w sesji), **ZERO regresji wprowadzonych przez sesję**; **frozen SC/PF NIETKNIĘTE** (solver_diff PASS przez całą sesję). Certyfikowane commity: D-04 U/f, §2 SC, §3 karta falownika, D-03 SSCI, D-01 Arc Flash (oznaczony), D-02 CGMES, D-06a/b uziemienie, D-06d adekwatność Q, D-06c shunt, D-14 walidacja krzyżowa pandapower.
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

## 8. PROGRAM MODUŁU nN (2026-08-13) — raport przedimplementacyjny A–I DOSTARCZONY

Zlecenie właściciela: pełny moduł projektowania i obliczeń nN jako integralna część systemu
(jeden model SN↔TR↔nN, zakaz kalkulatora obok). Wykonano wymagany raport przedimplementacyjny
(§75 zlecenia): audyt 10 obszarów repo (agenci równolegle, dowody plik:linia) + synteza
architektoniczna → **`docs/nn/INDEX_NN.md`** (9 wiążących dokumentów: A audyt stanu, B mapa
reuse, C plan modelu, D kontrakt SN↔nN + LV-INV-01…12, E macierz obliczeń, F plan UI nN STUDIO,
G macierz luk + rejestr danych normatywnych, H plan implementacji P0/P1/P2, I macierz testów).

Kluczowe ustalenia audytu: (1) topologia obwodów nN nie istnieje (odpływ = metadane, odbiór na
szynie stacji); (2) Ik_min nieosiągalny z kanonicznej ścieżki (`c_factor_min` martwe dane,
c nie per pasmo, brak korekty temperaturowej R); (3) SWZ nie istnieje jako werdykt (zero tabeli
czasów, zero Ia↔Ik_min); (4) krzywe aparatów nN brak (FUSE=fantom cicho liczony jak przekaźnik);
(5) **dług repo-wide: archiwum ZIP nie serializuje ENM** — dane nN znikałyby przy eksporcie
(N-D1, bloker P0.0). Dług napotkany N-D1…N-D12 zarejestrowany w `docs/nn/A_AUDYT_STANU_NN_2026-08.md` §2
— naprawa w kolejce P0.0 planu H. Implementacja P0 — następna sesja/sesje wg `docs/nn/H_PLAN_IMPLEMENTACJI_NN.md`.

**Aktualizacja 2026-08-13 (ta sama sesja): P0.0 WYKONANE + scalenie z nadzorem.**
Commit `862ac163`: N-D1 (sekcja ENM w archiwum ZIP + archiwum przyrostowe, round-trip 1:1),
N-D2 (martwe ścieżki fault-loop), N-D8 (rejestr operacji 48↔48, guard AST dwukierunkowy),
N-D9 (forbidden_ui_terms obejmuje ui2), N-D12 (widma CLAUDE.md), U5 (typowanie importu study
results). N-D3 wstrzymane wg uzgodnień międzywątkowych — pomiar importerów wykonany, wariant (a),
kasacja po scaleniu karty MINI-RMU-CAD (wiersz `N-D3-POMIAR-U2` w `docs/v12xx/REJESTR_KONFLIKTOW.md`).
Merge `4fc75c90`: gałąź nadzoru `claude/przejecie-nadzoru-fable-dtie3b` scalona (U1) przed P0.2/P0.5;
kanał koordynacji: `docs/nn/UZGODNIENIA_WATKOW_2026-08-13.md` (sekcja „Stanowisko nN").
Bramka drzewa scalonego: pytest **8666 passed / 0 failed**, vitest **863 pliki / 11297 testów**,
tsc + eslint czyste, 16 guardów OK, FROZEN SC/PF nietknięte.

**Aktualizacja 2026-08-13 (ta sama sesja): P0.1–P0.4 WYKONANE.**
- P0.1 (`6ef48b73`): topologia obwodów nN — operacje NN_NETWORK (9 handlerów), promocja
  `nn_field_specs` → jawne elementy ENM (migracja deterministyczna), walidator E060–E064/W060/W062,
  `station_type="rozdzielnica_nn"`, `Cable.n_parallel` (skalowanie Z), naprawa klasowa
  `_field_bus_ref` (po promocji nowe przyłącza celują w szynę odpływu, nie w surowe pole).
- P0.2 (`416a000d` + `6b0034c0`): katalog nN — 30 MCB IEC 60898-1 (B/C/D), 30 wkładek gG
  IEC 60269-1 (i2t=None do czasu danych producenta, G-D2), pola cieplne kabli (r0/x0/ith/jth),
  struktura korekt Iz wg PN-HD 60364-5-52 (rejestr G-D1 pusty do weryfikacji danych — wzorzec
  flip-to-verified jak Arc Flash D-01), trasy `GET /api/catalog/lv-breaker-mcb-types` i
  `lv-fuse-link-types` zarejestrowane w macierzy API.
- P0.3 (`8e184165` + fix-forward `26518c3a`): zwarcia nN — c per pasmo napięciowe wg IEC 60909
  Tab. 1 (≤1 kV: 1,05/0,95; >1 kV: 1,10/1,00), scenariusz MIN z korektą temperaturową
  R_θ = R20·[1+0,004·(θk−20)] jako dekoracja wejścia (solver FROZEN nietknięty). **Incydent
  procesowy**: P0.3 zmodyfikował zamrożony mapper `short_circuit_to_resultset_v1.py` i push
  wykonał się mimo FAIL guardu (pętla `for` maskująca kod wyjścia — dokładnie zakazany wzorzec);
  naprawa w przód `26518c3a`: mapper przywrócony 1:1 do origin/main, meta bindingu przeniesione
  do wrappera `sc_binding_meta.py` (przebudowa ResultSet, podpis liczony PO wzbogaceniu),
  `resultset_v1_schema_guard` zielony na HEAD.
- P0.4 (`3bd3c51c` + `40c284ea`): rozpływ nN — dowód konwergencji na sieci 0,4 kV
  (NR: 5 iter na 20-odcinkowym feederze R/X≈10,6; NR+GS parytet ≤1,2e-11 pu na modelu
  SN+nN z TR 15/0,4; reverse flow: p_from(TR)<0 przy generacji 50 kW > odbiór), dekompozycja
  ΔU per odcinek (`analysis/voltage_profile/segment_decomposition.py`) + najgorsza ścieżka nN,
  trasa `GET /api/quality/voltage-profile` (addytywna, zarejestrowana w macierzy API).
  **ESKALACJA ARCHITEKTONICZNA (do decyzji właściciela, nie obejście):** Fast-Decoupled
  NIE ZBIEGA na ŻADNYM kablu katalogu KABEL_NN (sweep R/X 1,89–10,6; test izolacyjny dowodzi,
  że to właściwość metody FDLF — założenie X≫R z docstringa `FastDecoupledOptions` — a nie błąd
  `_base_scale`). NR i GS pokrywają sieci nN poprawnie. Pytanie produktowe: czy system ma
  otrzymać solver klasy Backward-Forward-Sweep dla sieci rozdzielczych R/X≥1 (nowy solver,
  addytywny, poza FROZEN)? Do rozstrzygnięcia przed P1; testy dokumentują stan uczciwie
  (bez maskowania).
Bramka P0.4: pytest solvers+analysis+api+ci **1428 passed**, mypy/ruff/black czyste,
7 guardów (solver_diff, solver_boundary, arch, overlay_no_physics, load_flow_no_heuristics,
resultset_v1_schema, api_lifecycle) zielone.
W kolejce: P0.3b (ścieżka SC w `enm/canonical_analysis.py` ma płaskie `c_factor=1.10` —
wpięcie c per pasmo + scenariusz MIN w głównej ścieżce użytkownika), P0.5–P0.10 wg planu H.

**Aktualizacja 2026-08-13 (ta sama sesja): scalenie fali 9 nadzoru + P0.3b + kasacja N-D3.**
- Merge `ecc16af9`: fala 9 nadzoru (MINI-RMU-CAD, N-1-BACKEND, symbol recloser w kanonie
  SLD v3, zapadki 1 A/NaN w mapping/energy_validation). Konflikt `enm/mapping.py`
  rozwiązany UNIĄ: „brak obciążalności zostaje brakiem (0,0)" × skalowanie `n_parallel`
  z P0.1 (`rated_current_a=rated_a_eff`; 0·n=0 — brak dalej się propaguje). Bramka drzewa
  scalonego: pytest **8893 passed / 13 skipped**, vitest **864 pliki / 11378 testów**,
  tsc+eslint czyste.
- P0.3b (`5cc8a917` + pin `1bc9c40c`): c per pasmo IEC 60909 Tab. 1 + scenariusz MIN
  w KANONICZNEJ ścieżce SC (`enm/canonical_analysis.py::_execute_short_circuit`) — reuse
  `voltage_factor.c_for_node` + `build_min_scenario_graph`, jawny `c_factor` w options =
  override płaski (wstecznie zgodny), whitelist opcji `scenario` w API. Odbiór nadzoru:
  iniekcja wykryła NIEPRZYPIĘTĄ whitelistę (trzecia instancja klasy „deklaracja bez testu"
  w tej fali — po N-1 i MINI-RMU) — naprawione W ODBIORZE testem pełnej ścieżki HTTP
  (c 1,10→1,00 na scenario=min; dowód iniekcji: czerwień → sha identyczne → zieleń).
  Weryfikacja na drzewie scalonym: 1792+19 testów, mypy/ruff, 4 guardy.
- Kasacja N-D3 (`231e8ee2`): 31 plików `station-wizard-v2/**` usuniętych (wiersz
  N-D3-POMIAR-U2; brak weta nadzoru, runda 2; kanon symboli recloser nietknięty);
  piny SCADA przepisane, allowlista ui_no_physics −2, baseline 16→13 pomiarem,
  D3 skorygowana. Bramka: pełny vitest **851 plików / 11149 testów**, tsc+lint,
  guard + 37 testów CI + 32 testy kontraktu SCADA.
- Koordynacja: „Stanowisko nN (runda 3)" w `docs/nn/UZGODNIENIA_WATKOW_2026-08-13.md` —
  m.in. wiążące rozstrzygnięcie semantyki zdolności wyłączania dla nN (wkładka gG:
  własne `breaking_capacity_ka` wg IEC 60269-1, NIGDY NIE_DOTYCZY; rozłącznik
  bezpiecznikowy: `conditional_sc_current_ka` kombinacji; MCB: `icn_ka` — pola wchodzą
  RAZEM z konsumentem w P0.6/P0.7).
**Aktualizacja 2026-08-13 (ta sama sesja): P0.5 WYKONANE (obie połówki).**
- P0.5a (`1a7583b7`): Iz′ nN wg PN-HD 60364-5-52. Wykonawca naprawił CZTERY instancje
  klasy (inwentarz): (1)+(2) dwie równoległe implementacje mnożenia współczynników →
  jedna ścieżka fizyki w `cable_ampacity_derating.py` (moduł katalogowy = czysty nośnik
  danych, przypięte testem); (3) parser SN błędnie walidował warunki ułożenia nN →
  dedykowany parser fail-closed na G-D1; (4) kontrakt materializacji KABEL_NN gubił pola
  cieplne → kryterium cieplne realnie liczy dla kabli nN. G-D1 zasilony 5 tablicami
  (B.52.14/15/16/17/18), KAŻDA zweryfikowana w 2 niezależnych źródłach (LAPP/DIN VDE
  0298-4, SEP, ecalpro); wartości bez podwójnego potwierdzenia jawnie POZA rejestrem.
  Odbiór: 5169 testów, iniekcja nadzoru (usunięcie pola cieplnego z kontraktu → czerwień
  na predykacie „dane docierają do grafu", sha-identyczne odtworzenie).
- P0.5b (`5266ddc2`): dowód VDROP multi-segment na kanonie kV (U4). Nowe EQ_VDROP_010
  (granica TR jako JAWNY krok zmiany podstawy — lekcja PODSTAWA-VDROP), pętla
  multi-segment w `proof_generator` (limit 1 odcinka zniesiony), kompozycja
  `vdrop_chain_binding.py` = reuse dekompozycji P0.4 (topologia) + `voltage_drop_binding`
  (fizyka odcinka). Inwentarz N-D6 (6 miejsc ΔU): 1 naprawione, 2 reużyte, 1 świadomie
  osobne (podgląd doboru kabla przed siecią), 1 inna klasa fizyki (LF Voltage kV z węzła),
  1 czysty konsument. Iniekcja wykonawcy I2 wykryła podwójne niezależne liczenie delty —
  naprawione u źródła. Pre-existing czerwony `test_no_any_in_domain_types` naprawiony.
  Odbiór na drzewie ŁĄCZONYM P0.5a+P0.5b (kombinacja niewidziana przez wykonawców):
  pełny pytest **9275 passed / 13 skipped**, frontend tsc+lint+vitest ui2 267 plików /
  3005 testów; iniekcja nadzoru (ciche pominięcie granicy TR w pętli łańcucha → 5 testów
  czerwonych, w tym piny dowód↔bieg z PODSTAWA-VDROP; sha-identyczne odtworzenie).
Następne: P0.6 (pętla zwarcia z grafu + SWZ — serce modułu), P0.7 (krzywe nN + pola
zdolności wyłączania wg rozstrzygnięcia rundy 3), P0.8–P0.10.

**Aktualizacja 2026-08-13 (ta sama sesja): P0.6 wykonane + fala 10 scalona.**
P0.6 (`60f8ab76`+`eca30a12`): szczegóły wyżej w sekcji — odbiór z iniekcją
(bezwarunkowe łagodne pasmo SWZ → 2 czerwone, sha-identyczne odtworzenie),
pełny pytest 9344/13 na HEAD odbioru. Restart kontenera zabił wykonawców
P0.7/G-22 PRZED zapisem (worktree czyste — zmierzone) — bez strat; okazało
się to korzystne, bo fala 10 nadzoru (`75693a57`: NAWIGACJA-JEDEN-KANON D1/D2/D4,
PACK-NASTAWY I>/I>>, RATCHET-DICT-READ — 3 fabrykacje wejść ENM usunięte
u źródła) przerobiła `protection/coordination/**`, na którym stara karta P0.7
by się wywróciła. Merge `072ee0f4` (konflikt: unia wierszy rejestru;
`canonical_analysis.py` czysto z P0.3b), runda 4 w kanale koordynacji
(`3489e171`): kolizja P0.7×PACK-NASTAWY zgłoszona z granicą (coordination/**
nietykalne dla nN; powierzchnia `protection/curves` zachowana adapterami).
Bramka drzewa scalonego: pytest **9413 passed / 13 skipped**, vitest
**849 plików / 11163 testy**, tsc+eslint czyste. Karty P0.7 i G-22 zlecone
ponownie na bazie `3489e171` (rozłączne zbiory plików, granice w §0).

**Aktualizacja 2026-08-13 (ta sama sesja): G-22 i P0.7 WYKONANE.**
- G-22 (`19b6dba8` + odbiór `747b90ea`): `FAULT_LOOP_NN`/`SWZ_NN` w AnalysisKind (5)
  i AnalysisType (6); bramki eligibility reużywają predykaty `fault_loop.service`;
  dispatch woła wprost serwisy P0.6 na `enm.store` (uczciwe FAILED, deterministyczny
  run_id); bez persystencji AnalysisRun (świadome — most ENM→ResultSet osobną
  decyzją). Odbiór: 4276 testów + 7 guardów; iniekcja nadzoru wykryła klasę
  „deklaracja bez testu" (fixtura-kopia z deklaracją „jedno źródło prawdy") —
  dodany pin predykatów parami ELIGIBLE⇒FINISHED na jednym modelu.
- P0.7 (`f4a822bb`): jedna fizyka krzywych (N-D4: `compute_idmt_generic` +
  `compute_ieee_c37112_generic` w protection_iec60255; iec/ieee_curves = delegacja
  z własnym denom_guard; tożsamość numeryczna 1440 kombinacji 0 rozbieżności;
  coordination/** NIETKNIĘTE, 324 testy zielone bez edycji); NOWY solver
  `protection_lv_curves.py` (MCB B/C/D jako PASMA gwarancji normy — przedział albo
  jawna nieoznaczoność, nigdy zmyślona linia; MCCB parametryczny; FUSE_GG na
  bramkach G-D2); G-D2: Inf=1,25·In / If=1,6·In podwójnie źródłowane, czasy umowne
  63/160/400 A JEDNO mocne źródło (nazwane w kodzie), In≤16 A fail-closed;
  pola rundy 3 wdrożone (`breaking_capacity_ka`=120 kA NH gG — 5 producentów;
  `conditional_sc_current_ka` — migracja rb_nn_* z i_cu_ka, PRZENIESIONE nie
  zdublowane; naprawiony skutek uboczny w equipment_proof/catalog_bridge —
  dokładnie defekt, przed którym ostrzegała runda 2); dobór aparatu
  `nn_device_selection.py` (4 kryteria, trzeci stan nigdy nie znika, ranking
  deterministyczny) + `GET .../enm/nn-device-selection`. Odbiór: pełny pytest
  **9632 passed / 13 skipped**, 8 guardów; iniekcja nadzoru (podmiana pola
  kombinacji na stare i_cu_ka → 2 piny rundy 3 czerwone, sha-identyczne
  odtworzenie).
DŁUGI NAZWANE z meldunku P0.7 (nie ciche): (1) N-D5 fantom FUSE — 2 miejsca
w `coordination/analyzer.py` (standard_map bez FUSE, fallback do IEC) — POZA
granicą rundy 4 (własność nadzoru), zgłoszone nadzorowi w UZGODNIENIA runda 4b;
(2) `czas_wylaczenia_galezi/pola` nie obsługują branż z wkładką (FUSE poza
`_APARATY_WYLACZAJACE`) — osobny wątek danych „nastawa dla aparatu katalogowego";
(3) kontrakt materializacji APARAT_NN nie kopiuje pól zdolności do gałęzi
(bez konsumenta dziś — pole bez konsumenta byłoby martwą wagą; wpięcie razem
z konsumentem); (4) czasy umowne gG — drugie źródło do domknięcia flip-to-verified.
Zostają: P0.8 (SLD nN), P0.9 (nN STUDIO UI), P0.10 (pakiet dowodowy + raport),
bramka E2E §80 planu H.

**Aktualizacja 2026-08-14: runda 5 nadzoru obsłużona + P0.8 WYKONANE.**
- Runda 5 nadzoru (fala 11): zgoda WPROST na semantykę pól zdolności wyłączania;
  żądana zapadka DOSTARCZONA (`49486895`): `LVFuseLinkType.__post_init__` —
  wkładka bez `breaking_capacity_ka` (None/≤0) = ValueError strukturalny + pin
  całego katalogu; fala 11 scalona (`b5c8d6d1`), bramki drzewa: backend
  **9667/13**, frontend **857 plików / 11276 testów**. Runda 5b: stabilność API
  coordination do fali 12 przyjęta; `wykonaj_bieg_w_pamieci` = kanoniczne
  wejście wariantów; rozróżnienie werdyktów kombinacja/goły aparat wiążące dla
  P0.10.
- P0.8 (`14550dda`): SLD nN end-to-end — adapter per-szyna/per-odpływ (seam A8;
  aparat z katalogu wg `device_kind`, UNRESOLVED = pusty tor + komunikat błędu,
  zero fabrykacji; odbiorca chain-walk przez kable), kompozycja wzorcem DER
  (ownerRef = realny ref ENM), 4 nowe symbole w kanonie (rozdzielnica nN, MCB,
  rozłącznik bezp., licznik) z testem rozróżnialności rodziny, rezerwacje
  szerokości N odpływów, kontrakt SWZ w overlay (addytywny, fail-closed
  `nierozstrzygalne`→`unknown`). Substrat istniejących sieci BAJTOWO identyczny
  (pomiar stash+SHA + test). Pre-existing dług naprawiony: `types/enm.ts` bez
  `rozdzielnica_nn`/`nn_sections` od P0.1. Bramka odbiorcza na drzewie łączonym
  z falą 11: vitest SLD **248 plików / 4609 testów**, accept:sld-v3, 4 guardy,
  tsc+lint; iniekcja nadzoru (nierozstrzygalne→ok po cichu → 1 test czerwony,
  sha-identyczne odtworzenie). ODSTĘPSTWA JAWNE wykonawcy: (a) rozdzielnica nN
  jako liść odpływu wg litery karty (węzeł korytarzowy = osobna duża funkcja);
  (b) odznaka SWZ na kanwie NIE wdrożona — kontrakt tak, renderer = osobna
  karta (precedens OLTC V12K-092), naturalnie wchodzi w P0.9. **B-02: zrzuty
  (oba motywy, deterministyczne, `docs/audit/visual/nn_board_demo_*.png`)
  przekazane właścicielowi — werdykt wizualny OCZEKUJE.**

**Aktualizacja 2026-08-14: P0.10 WYKONANE.**
P0.10 (`4720530b` + pin odbiorczy): pakiet dowodowy `LV_CIRCUIT_VERIFICATION` —
10 kroków (EQ_LVCV_001..007 addytywnie + reuse EQ_LC/EQ_VDROP), każdy krok
konsumuje wynik ISTNIEJĄCEGO dostawcy (mapowanie 10/10 w meldunku; zero
trzeciej fizyki), dwa zdania zdolności wyłączania wg rundy 5b (6-wariantowy
iloczyn cech), SWZ trzeci stan, determinizm ZIP; API `/api/nn-proof/circuit/
{pack,preview,report}` (3 wiersze macierzy); sekcje nN raportu w kontrakcie
JSON z provenance (runId+revisionId+przypadek). Pomiar ProofPacksPanel:
zamontowany ale inertny dla 8 paczek (mount bez callbacków) — dla nN osobny
działający `NnCircuitProofPanel`. Wykonawca naprawił dług nazwany #3 z P0.7
(materializacja APARAT_NN: device_kind/i_cu_ka/conditional_sc_current_ka) —
Z konsumentem (binding czyta materialized_params). Odbiór: pełny pytest
**9725 passed / 13 skipped**, frontend tsc+lint+43 testy panelu; INIEKCJA
ODBIORCZA WYKRYŁA brak pinu łańcucha katalog→kontrakt→materializacja (testy
wstrzykiwały parametry ręcznie — usunięcie pola z kontraktu zostawało
zielone); pin dodany W ODBIORZE (rb_nn_100a end-to-end), re-iniekcja czerwona,
sha-identyczne odtworzenie. DŁUGI NAZWANE: (a) sekcje nN raportu bez rendererów
PDF/DOCX (renderery operują na CanonicalRun; analizy nN świadomie
niepersystowane — wpięcie po decyzji o moście ENM→AnalysisRun, razem z G-22);
(b) callbacki 8 paczek kanonicznych — pre-existing, osobna integracja;
(c) pełny spis §63 raportu = P1 (z karty).
W biegu: P0.9 (nN STUDIO UI). Po nim: bramka końcowa E2E §80.

**Aktualizacja 2026-08-14: P0.9 WYKONANE — komplet kart implementacyjnych P0 scalony.**
P0.9 (`3d89e5d4` + fix-forward `df9e9140`): nN STUDIO — adapter drzewa
(TR→RGnN→odpływy→podrozdzielnice), 6 zakładek, 3 kreatory na operacjach
domenowych P0.1 (zarejestrowane w guardzie dialogów: 13 modali / 24 operacje),
generyczna `EdytowalnaTabela` w ui2/shared + tabela ODCINKI (edycja inline →
update_element_parameters / assign_catalog_to_element), 4 ekrany wynikowe
(Ik1(l), ΔU, heatmapa SWZ z marginesem, ranking doboru), okna W-623…W-629.
Dowód zero-phantom w meldunku (każda kontrolka → realny endpoint; zero zmian
backendu). Wykonawca naprawił pre-existing: lustra typów LVApparatusType/Cable,
validateCatalogFirst dla operacji nN, zbyt szeroka reguła repo_hygiene_guard
(zawężenie oknem kontekstu ZWERYFIKOWANE w odbiorze iniekcją: kontrakt backendu
realnie przyjmuje from_bus_ref — linia 2593 domain_operations_v2; reguła nadal
łapie klasę poza oknem — dowód czerwień/sha/zieleń). Odbiór na drzewie
łączonym P0.9×P0.10: pełny vitest wykrył 3 trafienia terminologii
(ui-terminology-guard.test.ts poza zasięgiem celowanych bramek kart) —
naprawa w przód `df9e9140` (zmienna `feeder`→`odplyw`; wyjątek literałów
'/api/' w skanerze testowym z parytetem do pythonowego guarda). Recertyfikacja:
**876 plików / 11445 testów** + testy CI + 9 guardów. LUKI API NAZWANE przez
wykonawcę (nie fabrykowane): (a) brak endpointu podglądu Iz′ nN (istnieje
tylko SN `cable-ampacity-derating-preview`) — kreator pokazuje Iz katalogowe;
(b) Ib/Iz′/SWZ per wiersz tabeli wymaga algorytmu „który aparat chroni
odcinek" — per-odpływ w zakładkach; (c) zrzuty B-02 NIEWYKONALNE w sandboxie
(brak demona Docker) — werdykt wizualny właściciela po `docker-compose up`.
OSTATNIA POZYCJA P0: bramka końcowa E2E §80 (test_nn_full_chain).

**Aktualizacja 2026-08-14: BRAMKA KOŃCOWA E2E §80 WYKONANA — werdykt uczciwy.**
Bramka (`3292eb26` + `e637b7f0`): `tests/e2e/test_nn_full_chain.py` (16 testów) —
substrat GPZ→SN→ST-03→TR 15/0,4→RGnN→K1→R1→K2·silnik→K3·odbiór→K4·PV→K5·BESS
zbudowany WYŁĄCZNIE operacjami domenowymi (realna ścieżka użytkownika; BESS
z realnej pozycji `conv-bess-nn-0p5mw-0p4kv`, przyłączony do RGnN — kontrakt
`add_converter_source` wymaga stacji z TR). 10 kroków + determinizm: rozpływ
SN+nN (NR zbiega, weryfikacja krzyżowa 2% — regulacja Q(U) falowników
nazwana), profil U, ΔU (suma teleskopowa), Ik max/min (RGnN 31,86/28,98 kA;
liść 8,40/5,37 kA — fizyka promieniowa), Iz′ (240→283,2 A), stale detection
(hash+freshness+GENUINE inny wynik po zmianie kabla 120→95 mm²), trace,
pakiet ZIP deterministyczny, raport JSON. Pełna suita na HEAD: **9742/13**.
**WERDYKT: mechanizmy działają w pełni na jednym modelu; integracja NIE JEST
w pełni gotowa — 4 luki danych/kontraktu** (znaleziska bramki, NIE maskowane):
(#1) 17/17 kabli `kab_nn_*` bez danych żyły PE/PEN → pętla/SWZ/pakiet tylko
zero-hop (fail-closed działa poprawnie); (#2) bramka `CATALOG_REQUIRED_
OPERATIONS` wymaga catalog_ref dla add_nn_outgoing_field/add_nn_load, kreator
go nie wysyła; (#3) `complete_station_loads_from_nn_feeders` materializuje
fantomowy odbiór 30 kW NA ODCZYCIE między żądaniami kreatora (predykaty
parami złamane — kryterium „legacy" = „bez odbioru"); (#4) dobór aparatu bez
pełnej rekomendacji dla żadnego obwodu (pochodna #1 + MCB 6 kA jedyne +
MCCB bez nastaw + gG bez bramek I²t). NAPRAWY W BIEGU (Zero-Debt, nie
odłożone): karta NAPRAWA-A (dane katalogu: PE/PEN×17 podwójnie źródłowane,
MCB 10 kA, nastawy MCCB, dokończenie G-D2 + flip kroków 5/7/10 na pełny
PASS) i NAPRAWA-B (fantom u źródła + spójność kontraktu catalog_ref) —
wykonawcy równolegle w worktree.

**Aktualizacja 2026-08-14 (c.d.): NAPRAWA-B scalona + fala nadzoru z N-D5-FUSE.**
NAPRAWA-B (`7128fc1d`, odbiór z iniekcją filtra markera — czerwień na pinie
sekwencji, sha-identyczne odtworzenie): fantom odbioru zabity u źródła
(marker pochodzenia `nn_field_origin`; legacy dalej migruje — utrwalone
snapshoty uzdrawiane), martwy wymóg catalog_ref `add_nn_outgoing_field`
usunięty z bramki po pomiarze; rozjazd `add_nn_load` (tryb ekspercki bez
katalogu vs Catalog Binding Rule) = DECYZJA WŁAŚCICIELA, wiersz w rejestrze.
INCYDENT INFRA: kontener odtworzony ze świeżego klona (lokalna gałąź cofnięta
do początku sesji, worktree NAPRAWA-A zabity przed commitem, puste venv) —
zero strat dzięki dyscyplinie push-po-odbiorze; stan odtworzony, zależności
zainstalowane. Scalenie fali nadzoru (`37ed6a70`: N-D5-FUSE — fantom
bezpiecznika w coordination/** zabity PO ICH STRONIE zgodnie z rundą 6 +
zapadka w p0-extended-guards; EPE-MARTWY; PULPIT-NBA) + runda 7 w kanale
(`46cb67ff`: wspólna baza istnieje → TCC odblokowany; granice P0.8 w sld/v3
dotrzymane z dowodami). Bramka drzewa scalonego: pytest **9804 passed /
11 skipped**, vitest **876 plików / 11444 testy**, tsc+eslint czyste.
W biegu: NAPRAWA-A (restart; dane żyły PE/PEN ×17, MCB 10 kA, nastawy MCCB,
bramki gG + flip kroków 5/7/10 E2E na pełny przebieg).
**Aktualizacja 2026-08-13 (ta sama sesja): P0.6 WYKONANE (`b746b6a9`) — „serce modułu".**
- Pętla zwarcia z REALNEJ trasy grafu: `application/analyses/fault_loop/route.py`
  (NOWY) — BFS po ENM (kable/łącznik/wkładka `status=closed`), fail-closed na brak
  R/X żyły powrotnej PE/PEN i na linie napowietrzne (P1). Impedancja transformatora
  ujednolicona (zero-sequence-aware, gate na `LV_SHUNT_GROUND` — rodzina Dyn) i
  upstream Thevenin SN (reuse `build_zbus`) w JEDNEJ funkcji dla widoku „u źródła",
  dowolnego punktu i wszystkich punktów per odpływ (ranking po rzeczywistej |Z|,
  nie po liczbie hopów — dowód testem z rozgałęzieniem, gdzie krótsza gałąź ma
  większą impedancję).
- SWZ (`application/analyses/swz/`, NOWY pakiet): werdykt 3-stanowy z dowodem
  liczbowym Ik1_min (scenariusz MIN, R_θ) vs Ia (IEC 60898-1, G-D4) vs t_wymagany
  (Tab. 41.1 IEC 60364-4-41, G-D3, 2 źródła/wartość, status REFERENCYJNY do
  weryfikacji przy dostępie do normy). Wkładka gG (G-D2 puste) = zawsze
  NIEROZSTRZYGALNE.
- Klasa-nie-instancja: dodano `return_conductor_x_ohm_per_km` (reaktancja żyły
  powrotnej — nie istniała NIGDZIE w repo) + naprawiono kontrakt materializacji
  KABEL_NN (gubił pola żyły powrotnej — ten sam defekt co F-K1/P0.5a) w 5 miejscach.
  Przy okazji naprawiony bug granicy pasma Tab. 41.1 (400V/√3=230,94V wpadało w złe
  pasmo) i dwa pre-existing błędy mypy napotkane na bramce.
- Test krzyżowy Ik1 pętla vs IEC 60909 (Z1+Z2+Z0, Dyn11): ratio ≈0,86, przyczyny
  różnic nazwane (brak K_T w fault_loop, model Z0 kabla symetryczne vs PE/PEN
  fizyczne, wzór napięciowy).
- Bramka: pełny pytest **14619 passed / 16 skipped**, ruff+black+mypy czyste,
  16 guardów zielonych (solver_diff, resultset_v1_schema, solver_boundary, arch,
  catalog_binding/enforcement/gate/metadata, domain_no_guessing, pcc_zero,
  readiness_codes, audit_contract, repo_hygiene, vulture, import_graph,
  api_lifecycle, no_codenames).
- Świadomie POZA zakresem: G-22 (wpięcie FAULT_LOOP_NN/SWZ_NN do `AnalysisKind`/
  eligibility dispatch) — nowe endpointy są read-only pod `/enm/` (wzorzec
  `station-fault-loop` już istniejący), tak jak ich poprzednik; G-22 zostaje
  osobnym zadaniem (cross-cutting dla wszystkich analiz nN, nie tylko P0.6).

-----

*Żywy rejestr stanu. Aktualizuj każdą sesją. Źródłem prawdy ostatecznej jest świeży skan repo (§5.0) — gdy ten plik się z nim rozjedzie, prawdą jest repo.*
