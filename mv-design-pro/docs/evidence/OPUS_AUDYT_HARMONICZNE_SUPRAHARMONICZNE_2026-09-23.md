# AUDYT §91–§92 — harmoniczne, supraharmoniczne, jakość energii (Program A/B)

Audytor: Opus 5.5 (tryb READ-ONLY). HEAD `ef9f6228`. Data 2026-09-23.
Metoda: VERIFY (czytanie matematyki, nie docstringów) → REPRODUCE (istniejące testy + własne skrypty w scratchpadzie)
→ FALSIFY (eksperymenty liczbowe F1–F8 i mutacje M1–M5 przez monkeypatch, bez edycji repo) → DECIDE.

Skrypty dowodowe (poza repo): skrypt sesji `falsify.py` (poza repozytorium), skrypt sesji `falsify2.py` (poza repozytorium), skrypt sesji `mutplug.py` (poza repozytorium),
logi skrypt sesji `mut_*.txt` (poza repozytorium), skrypt sesji `pq_tests.txt` (poza repozytorium).

Uczciwość środowiska: pytest uruchomiony przez `poetry run` (Poetry 2.3.3). Pierwsze dwa przebiegi zapisały
`__pycache__/*.pyc` w `backend/tests/**` (pliki ignorowane przez git; `git status --porcelain` czysty). Kolejne
przebiegi z `PYTHONDONTWRITEBYTECODE=1`. Żaden plik śledzony nie został zmieniony.

Korekta polecenia: test harmoniczny solvera NC RfG to **T20** (`ncrfg_ptpiree/engine.py:164-170, 850-880`), nie T18.
T18 w solverze = „praca wyspowa, rozruch autonomiczny, tłumienie oscylacji” (`engine.py:151-157`), natomiast w
profilach YAML `T18` = „Test harmonicznych” (`catalog/profiles/nc_rfg/{pse.yaml:108-109, enea,energa,pge,tauron.yaml:59}`)
— dwie przestrzenie numeracji tego samego identyfikatora (A-5 / OD-26 potwierdzone).

---

## 0. REPRODUCE — testy uruchomione (kody wyjścia łapane bezpośrednio)

| Zestaw | Wynik | Kod |
|---|---|---|
| `tests/test_v126_academic_solver.py tests/test_v126_ssci_impedance.py tests/test_v126_sanity_bounds.py tests/analysis/test_ssci_stability.py tests/application/analyses/test_migotanie.py` | 60 passed | 0 |
| `tests/test_ncrfg_ptpiree_solver.py tests/api/test_v126_converter_widmo_gate_api.py tests/network_model/catalog/test_converter_type_widmo_droop.py tests/solver_input/test_most_v126_bez_podstawien.py tests/application/analyses/test_v126_gotowosc.py tests/api/test_v126_ssci_stability_api.py tests/api/test_quality_analysis_runs_api.py tests/test_advanced_solver_capability_registry.py` | 200 passed | 0 |
| Zestaw mutacyjny (10 plików, 344 testy) bez mutacji | 344 passed | 0 |

Zielone testy NIE są dowodem fizyki: jedyny test „referencyjny” zdolności `POWER_QUALITY_HARMONICS`
(`solver_capability_registry.py:229` → `test_v126_academic_solver.py:96-104`) sprawdza wyłącznie determinizm hasha
i `thd_u_percent >= 0`, na fiksturze, w której transformator 110/15 kV łączy DWIE szyny 15 kV równolegle z kablem
(`test_v126_academic_solver.py:21-57`) — topologia fizycznie bezsensowna. To powtórzenie precedensu NC RfG.

## 0.1 FALSIFY — eksperymenty liczbowe na solverze FROZEN (`V126AcademicSolver.run(POWER_QUALITY_HARMONICS, …)`)

| # | Eksperyment | Wynik | Defekt |
|---|---|---|---|
| F1 | TR 15/0,4 kV 0,63 MVA u_k=6 %, źródło 100 A z 10 % 5. harm. na szynie nN | U_5@nN = 1071 V, oczekiwane ≈ I·5·X_T(nN) = 0,76 V; **stosunek 1406 = (15/0,4)²**; THD_U(nN)=**463,9 %** | macierz Y w omach bez przekładni: impedancja TR po stronie GN (`v126_academic.py:282-286`) mieszana z prądem i napięciem strony DN; brak sprowadzenia poziomów napięć |
| F1b | R transformatora | kod: R = P_k/(1000·S_n²) = 0,0164 Ω; poprawnie R_GN = P_k·U²/S_n² = 3,685 Ω | brak czynnika U² (`v126_academic.py:284`) — R zaniżone ×225 dla 15 kV, ×12100 dla 110 kV; tłumienie rezonansów przez TR praktycznie wyzerowane |
| F2 | ta sama sieć GPZ–kabel–ST, zmieniona tylko kolejność szyn na liście | GPZ pierwsza: THD(ST)=0,1003 %; ST pierwsza: THD(ST)=**0,0 %** | „odniesienie” = `ybus[0,0] += 1e6` na PIERWSZEJ szynie listy (`v126_academic.py:294-295`), nie na źródle; wynik zależy od kolejności danych |
| F3 | ta sama sieć, S_k''=50 MVA vs 5000 MVA | THD(ST)=0,0778 % w obu | ścieżka PQ woła `_driving_point_impedance(..., with_source_shunt=False)` (`v126_academic.py:475`) i nigdy nie czyta `fault_level_mva`; sieć zasilająca = idealna szyna; katalog analiz deklaruje S_k jako daną wejściową (`v126_katalog.py:393`) — fałsz |
| F4 | 1 vs 2 identyczne źródła na tej samej szynie | THD 0,0777 → 0,1555 (×2,0013) | wstrzyknięcie `complex(current, 0.0)` (`v126_academic.py:431-433`) — faza 0° dla KAŻDEGO źródła i rzędu = sumowanie arytmetyczne modułów, niezadeklarowane (H-49) |
| F5 | sieć bez źródeł, kabel 30 km, B=1e-4 S/km | `compatibility_status: "zgodny"` na każdej szynie przy `sanity: "dane niekompletne"`; `voltage_unbalance_u2_u1: 0.0`; ST: 49 „rezonansów” 540…2500 Hz co 10 Hz; GPZ: 0 | werdykt „zgodny” z braku danych (`:413,466`); asymetria zawsze 0,0 — fabrykacja liczby (`:412`); „resonance_peaks” = każdy punkt siatki powyżej 10·|Z_50|, nie ekstrema (`:486-489`); szyna 0 ma |Z|≈1e-6 z definicji |
| F6 | I_1=38,49 A, 10 % 5. harm., obciążenie 1 MW | `k_factor`=0,5; K wg IEEE C57.110/UL 1561 = ΣI_h²h²/ΣI_h² = 1,238 | wzór `sqrt(Σ I_h² h²)/I_load` (`:435, 463-465`) — pierwiastek, brak składowej podstawowej, mianownik z obciążenia szyny, nie z prądu TR |
| F7 | 3. harmoniczna (20 %) wstrzyknięta po stronie nN przez Dyn11 vs YNyn0 | U_3@SN = 14,422 V w OBU grupach | `vector_group` przenoszony do wejścia (`v126_contracts.py:930`), ale solver go nie czyta; harmoniczne potrójne (składowa zerowa w układzie symetrycznym) przechodzą przez trójkąt |
| F8 | `base_frequency_hz=60` | skan raportuje f = 50, 150, 250, 350 Hz | zakres skanu zaszyty `range(50, 2501, 10)`, `f_hz == 50` jako „Z_50” (`:470-486`) |
| F9 | znak susceptancji | Y_11(h=5) = 0,6897 − j1,72389 vs y_szer = 0,6897 − j1,72414 | znak +jhB/2 POPRAWNY (`:272`) — jedyny element Y(f) bez zarzutu (poza brakiem R(f), G, modelu rozłożonego) |

---

## 1. TABELA KLASYFIKACJI (każdy znaleziony element)

Kolumny: element · co robi naprawdę · REPRODUCE · FALSIFY · DECIDE · kamień.

| # | Element (plik:linia, symbol) | Co robi naprawdę (z matematyki) | REPRODUCE | FALSIFY | DECIDE | Kamień |
|---|---|---|---|---|---|---|
| 1 | `network_model/solvers/v126_academic.py:240-296` `_ybus(model, harmonic)` | Y w omach nad węzłami elektrycznymi; linia: z = R + j·h·X (R stałe), bocznik +j·h·B/2 na końcach (π jednosekcyjne); TR: z = P_k/(1000·S_n²) + j·(u_k/100)·U_GN²/S_n, X·h; brak przekładni, brak grupy połączeń, brak gałęzi magnesowania; `ybus[0,0]+=1e6` | pośrednio `test_v126_academic_solver.py:96` | F1, F1b, F2, F7; R(f)=R_50; X(f)=h·X_50 dla całego pasma; linia jako π skupione także dla długich kabli przy 2,5 kHz; brak G | **REWRITE** — nie da się poprawić bez zmiany semantyki wyniku (FROZEN, B-01); nowy `Y(f)` w `solvers/harmoniczne/` | AB-2H |
| 2 | `v126_academic.py:298-332` `_grid_source_shunt_admittance` | Z_src = 0,15·Z + j·h·0,99·Z, Z=U²/S_k (tylko ścieżka SSCI) | `test_v126_ssci_impedance.py` | R/X = 0,15/0,99 zaszyte (bez źródła) mimo `Source.rx_ratio` w ENM (`enm/models.py:470`); |Z_src| = 1,0013·Z; R stałe | **REWRITE** (w nowym pakiecie: Thevenin źródła z R/X z ENM + domena ważności) | AB-2H |
| 3 | `v126_academic.py:334-383` `_driving_point_impedance` | `pinv(Y(f))` → przekątna; opcja bocznika źródła; fallback 1e-6 | jw. | `pinv` maskuje osobliwość (sieć pływająca daje liczbę zamiast odmowy); przekątna tylko — brak Z_ij (transfer S-58) | **REWRITE** | AB-2H |
| 4 | `v126_academic.py:385-391` `_solve_linear` | `solve`, przy `LinAlgError` → `pinv` | — | cichy fallback do pseudoodwrotności = ukryta korekta (reguła WHITE BOX) | **REJECT** | — |
| 5 | `v126_academic.py:393-520` `_power_quality` (harmonic load flow) | dla h∈{2,3,5,…,49} (`:394`): I_h = I_base·%/100 z fazą 0, V = Y(h)⁻¹I; THD = √ΣU_h² / (U_n/√3); TDD, K, skan 50–2500 Hz co 10 Hz (wynik co 100 Hz), „rezonans” gdy |Z|>10·|Z_50| | `test_v126_academic_solver.py:96`, `test_v126_sanity_bounds.py:218,275`, `test_most_v126_bez_podstawien.py:692` | F1–F8; U_1 = napięcie znamionowe, nie rozwiązane; brak tła (U_bg=0 z definicji); brak odbiorów, kondensatorów, impedancji przekształtników i maszyn w Y(f); triplen w składowej zgodnej; h=4,6,8,9,10,12,… pominięte bez źródła; wyniki I_h w gałęziach nie istnieją (`i_h: []` zawsze puste, `:404`) | **REWRITE** (zachować jako historyczne, wycofać z powierzchni po AB-2H wzorcem W3-E 410 + zamiennik; kasacja kodu = OD-15(d)) | AB-2H |
| 6 | `v126_academic.py:455-460` limity THD/TDD | `thd>8` → „PN-EN 50160”, `thd>5` → „IEEE 519”, `tdd>5` → „IEEE 519” | — | EN 50160: 95 % 10-min wartości w tygodniu na zaciskach zasilania, THD do h=40 — solver: wartość chwilowa modelu, do h=49, w każdym węźle; IEEE 519-2014 5 % tylko dla 1–69 kV (nN: 8 %, >69 kV: 2,5 %), w miejscu przyłączenia; TDD 5 % = najostrzejszy wiersz I_sc/I_L<20 stosowany bezwarunkowo | **REJECT** (narusza W-70) | AB-1b (profil fail-closed) |
| 7 | `v126_academic.py:410-414` pola `flicker_pst/plt=None`, `voltage_unbalance_u2_u1=0.0`, `compatibility_status="zgodny"` | stałe | F5 | 0,0 asymetrii i „zgodny” bez obliczenia = fabrykacja | **REJECT** | — |
| 8 | `v126_academic.py:540-549` `_ssci_frequencies_hz` | 61 punktów log 1…250 Hz | `test_v126_ssci_impedance.py` | siatka stała, niezależna od f_PLL/f_ci; brak zagęszczania wokół przecięcia | **ADAPT** (oś f z kontraktu `OsCzestotliwosci`) | AB-5H |
| 9 | `v126_academic.py:551-675` `_z_conv_components` | Z_conv = (Z_f + G_d·G_ci)/(1 − G_d·H_pll·(I_0·G_ci − V_0)/V_0), pu → Ω przez `rated_kv` | `test_v126_academic_solver.py:121-170` (asymptoty: wysoka f → Z_f, w paśmie wysoka Z, ujemne R poniżej PLL) | SISO składowej zgodnej, sprzężenie dq zwinięte; V_0=1,0 zaszyte; I_0 z P,Q; testy sprawdzają kształt, nie wartości względem opublikowanego przypadku; brak walidacji wobec Sun/Cespedes z liczbami | **KEEP_RESEARCH_ONLY** (dopuszczalny kandydat na `FREQUENCY_DEPENDENT_EQUIVALENT` przekształtnika po wyroczni publikacyjnej) | AB-5H / AB-7 |
| 10 | `v126_academic.py:686-900` `_ssci_impedance` | Z_grid(f) z #1+#2 na szynie przekształtnika, L = Z_grid/Z_conv | `test_v126_ssci_impedance.py` (11 testów), `test_ssci_stability.py` | Z_grid dziedziczy F1/F1b: przekształtnik na 0,69 kV za transformatorem blokowym widzi impedancję sieci w omach strony GN, a Z_conv w omach bazy 0,69 kV — iloraz mieszający poziomy napięć; wybór „pierwszy przekształtnik” (`:684`) | **KEEP_RESEARCH_ONLY** (werdykt stabilności wymaga poprawnego Z_grid(f) z AB-2H) | AB-5H |
| 11 | `v126_academic.py:1805-1866` `_transient` (2. harmoniczna udaru) | `second_harmonic_percent = 63/inrush_multiple`, blokada 87T przy ≥10 % | `test_v126_academic_solver.py` | wzór bez normy (MAPA G4 to przyznaje); nie należy do dziedziny harmonicznej sieci | **REJECT** dla programu H (osobny dług W6-8/OD-15(d)) | poza H |
| 12 | `v126_academic.py:1962-1966` `_source_impedance` | 0,15/0,99 · U²/S_k | — | ta sama stała bez źródła co #2 | **REJECT** | — |
| 13 | `solver_input/v126_contracts.py:103-114` `V126HarmonicSourceInput` | `bus_ref, source_ref, base_current_a, spectrum_percent: dict[int,float], spectrum_provenance` | `test_converter_type_widmo_droop.py` | tylko rzędy całkowite, tylko moduł, brak fazy, punktu pracy, wersji, statusu walidacji, rodzaju modelu (H-48) | **REWRITE** (nowy kontrakt `ZrodloHarmoniczne`) | AB-2H |
| 14 | `v126_contracts.py:740-944` `build_v126_input_from_enm` | most ENM → V12.6: szyny, linie/kable (R,X,B,B0), aparaty, TR (w tym `vector_group`), przekształtniki, źródła harmoniczne z karty | `test_most_v126_bez_podstawien.py` | pomija `enm.shunt_capacitors` (0 odwołań w pliku), odbiory jako impedancje, generatory synchroniczne, źródła `Source.rx_ratio`; `base_frequency_hz` z PIERWSZEJ szyny (`:936`), nie z nagłówka studium (walidator W009 `enm/validator.py:1620-1645` to potwierdza) | **REJECT** jako źródło wejścia H (zastąpić `enm/assembler.py::zloz_wejscie_harmoniczne`) | AB-2H |
| 15 | `v126_contracts.py:473-492` `_card_spectrum`, `:495-525` `_widma_jawne_z_parametrow`, `:527-657` `_oceb_karte_przeksztaltnika` | rozstrzygnięcie widma: ręczne > karta > brak z kodem | `test_v126_converter_widmo_gate_api.py`, `test_v126_gotowosc.py` | logika proweniencji poprawna i fail-closed | **ADAPT** (wzorzec rozstrzygania proweniencji do nowego kontraktu źródła) | AB-2H |
| 16 | `api/v126_academic.py:179-184` override `parameters.harmonic_sources` | użytkownik wstrzykuje dowolne źródła (prąd bazowy, widmo) z pominięciem katalogu | — | obejście reguły Catalog Binding (#10) — dowolny `base_current_a` bez karty | **REJECT** | — |
| 17 | `api/v126_academic.py:420-425` `harmonic-limits` | publikuje 8 %, 5 %, 5 %, indywidualne {5:6, 7:5, 11:3,5, 13:3} | `EkranAnalizAkademickich.test.tsx:635-638` (tylko liczba wywołań) | wartości indywidualne = EN 50160 tabela 1 (zgodne liczbowo), ale **żaden kod ich nie ocenia** (grep: jedyne użycie to ten słownik); brak wersji normy, poziomu napięcia, sposobu agregacji | **REJECT** jako źródło limitów (przenieść do profilu W-69 z pełną proweniencją) | AB-1b |
| 18 | `application/analyses/v126_katalog.py:244-246, 339-408` karta „Jakość energii i harmoniczne” | literały 8/5/5 z parytetem, zakres „2–49”, „skan 50–2500 Hz z wykrywaniem rezonansów”, dane: „Moc zwarciowa źródła zasilania” | `test_v126_katalog_analiz.py` | F3 obala daną „moc zwarciowa”; „wykrywanie rezonansów” = próg 10× (F5) | **REWRITE** (karta nowej analizy po AB-2H) | AB-2H |
| 19 | `application/analyses/v126_gotowosc.py:392-470` `_warunki_harmoniczne` | gotowość: źródła z kartą/widmem, pominięte źródła | `test_v126_gotowosc.py` | nie sprawdza tła, kondensatorów, poziomów napięć, domeny ważności modeli — gotowość „POTWIERDZONA” dla sieci, dla której wynik jest błędny o ×1406 (F1) | **ADAPT** (wzorzec warunków, nowe warunki H) | AB-2H |
| 20 | `application/solvers/solver_capability_registry.py:219-231` `POWER_QUALITY_HARMONICS` | `availability="available"`, `implementation_status="implemented"`, `solver_version="v126-academic-whitebox-1.0"` | `test_advanced_solver_capability_registry.py` | wersja nieaktualna (solver = 1.2, `v126_academic.py:28`); deklaracja „skan Z(f), rezonans i kompatybilność” bez testu fizyki | **ADAPT** (status → nazwana odmowa `domena.solver_nieobecny` do AB-2H; nowe wpisy `harmoniczne`, `skan_czestotliwosciowy`, `supraharmoniczne`) | AB-1d_min |
| 21 | `solver_capability_registry.py:232-246` `SSCI_IMPEDANCE` | jw. dla SSCI | jw. | dziedziczy #10 | **KEEP_RESEARCH_ONLY** | AB-5H |
| 22 | `analysis/ssci_stability/builder.py:40-500`, `models.py:52-61` | werdykt Nyquista: przecięcie |L|=1, Δφ=180°−|∠L|, próg ryzyka 30°, „okrążenia” z przejść Im przez 0 | `tests/analysis/test_ssci_stability.py`, `tests/api/test_v126_ssci_stability_api.py` | kontur tylko f>0 na 61 próbkach; liczenie okrążeń przybliżone (docstring `:316-320` sam to mówi); 30° = konwencja bez źródła normowego | **KEEP_RESEARCH_ONLY** | AB-5H |
| 23 | `network_model/solvers/ncrfg_ptpiree/engine.py:164-170, 850-880` T20 `_harmonics_test` | `harmonic_thdu_percent` (pole wejścia modułu) ≤ 8,0 (`:860`) | `test_ncrfg_ptpiree_solver.py` | THD_U jest własnością NAPIĘCIA SIECI, nie emisji urządzenia; 8 % = poziom kompatybilności EN 50160 przeniesiony na emisję urządzenia (zakaz W-70: kompatybilność→emisja, sieć→urządzenie); limit zaszyty, nie z profilu | **REJECT** jako dowód (solver FROZEN — nie edytować; w AB-1c T20 czyta `WynikInzynierski` z AB-2H albo zostaje `REQUIREMENT_UNVERIFIED`) | AB-1b/AB-1c |
| 24 | `network_model/solvers/ncrfg_ptpiree/contracts.py:57` `harmonic_thdu_percent` + `application/ncrfg_compliance/model_bridge.py:71-72,247` (zawsze `None`) + `frontend/src/ui2/oze/macierz/macierzModel.ts:347`, `PanelModulu.tsx:73` („THD napięcia [%]”), `ui/workspace/surfaces/NcRfgTestsTab.tsx:192,584` | ścieżka ręcznego THD_U urządzenia | `test_ncrfg_model_bridge.py` | UI prosi użytkownika o „THD napięcia” modułu wytwórczego — wielkość bez sensu dla urządzenia | **REJECT** (kontrolka „phantom” semantycznie) | AB-1c |
| 25 | `solver_input/provenance.py:318-325` `ncrfg_ptpiree.power_quality_declared` | stopień DECLARATION, „porównywane z limitem profilu” | — | limit NIE pochodzi z profilu (`engine.py:860`) — deklaracja fałszywa | **ADAPT** (poprawić tekst przy AB-1b) | AB-1b |
| 26 | `catalog/profiles/nc_rfg/*.yaml` T18 „Test harmonicznych” | etykieta w martwej liście `compliance_tests` | — | kolizja numeracji z T18 solvera | **REJECT** (OD-26) | AB-1b |
| 27 | `network_model/catalog/types.py:1397-1403, 1463-1480, 1536-1546, 1614` `ConverterType.harmonic_spectrum_percent` | `dict[int, float]` 2..50, 0..100 % I_n, walidacja | `test_converter_type_widmo_droop.py`, `test_niezmienniki_obie_strony.py` | **0 z N rekordów katalogu przekształtników niesie widmo** (`grep -c harmonic_spectrum_percent mv_converter_catalog.py` = 0); brak fazy, punktu pracy (P,Q,U,tryb,SOC), metody pomiaru, wersji, statusu walidacji; komentarz przypisuje widmo „IEC 61000-3-12”, który dotyczy urządzeń ≤75 A/faza w sieciach nN — nie PCS SN | **ADAPT** (zachować pole jako `CURRENT_SPECTRUM` klasy „deklaracja producenta, moduł”; sekcja `harmonic` katalogu W-68 obok) | AB-2H / AB-4H |
| 28 | `network_model/catalog/niezmienniki_katalogu.py:312-392` | niezmienniki widma: obiekt, niepuste, rząd 2..50 („IEC 61000-4-7”), 0..100 % | jw. | rząd całkowity 2..50 wyklucza interharmoniczne i supraharmoniczne (H-41, S-54) — jako niezmiennik PRODUKTU jest błędny | **ADAPT** (niezmiennik tylko dla rodzaju `CURRENT_SPECTRUM_INTEGER_ORDER`; nowa oś f∈ℝ⁺) | AB-1d_min |
| 29 | `network_model/catalog/mv_converter_catalog.py:153-157, 1158-1268` pola `current_loop_bandwidth_hz`, `pll_bandwidth_hz`, `filter_l_pu`, `filter_r_pu`, `control_delay_ms`, `flicker_c` | wartości karty referencyjnej, status `ESTIMATED` z cytatem literatury | `test_inverter_card_schema.py` | proweniencja uczciwa (ESTIMATED, nie DATASHEET) | **ADOPT** (jako dane z jawnym statusem; do Z_conv(f) i migotania) | AB-2H / AB-5H |
| 30 | `network_model/catalog/mv_cable_line_catalog.py` (nagłówek 1-24; pola R20, X@50 Hz, C nF/km) + `types.py:863-876` `susceptancja_us_per_km(f)` | parametry 50 Hz; B(f)=ωC | testy katalogu | brak geometrii (promień żyły, ekran, ułożenie), brak tan δ, brak R_ac(f); B(f)=ωC poprawne, ale jedyna zależność od f | **ADAPT** (dołożyć sekcję `harmonic`: tabela R(f)/L(f) albo parametry modelu naskórkowości + tan δ, z `validation_status`) | AB-2H |
| 31 | `network_model/catalog/mv_transformer_catalog.py` | S_n, U, u_k, P_k, P_0, i_0, grupa połączeń, zaczepy | testy katalogu | brak danych R_k(f) (współczynnik strat dodatkowych/wiroprądowych), brak pojemności uzwojeń (supraharmoniczne) | **ADAPT** | AB-2H / AB-4H |
| 32 | `network_model/catalog/mv_shunt_capacitor_catalog.py` + `ShuntCapacitorType` | Q_n, U_n, `loss_kw`; `REFERENCYJNY` | testy katalogu | brak C [µF] jawnie (wyprowadzalne), brak dławika odstrajającego p %, brak połączenia (Y/Δ, uziemienie punktu gwiazdowego) | **ADAPT** | AB-2H |
| 33 | `enm/models.py:519-545` `ShuntCapacitor` | element ENM first-class (Q_n, U_n, status) | `enm/validator.py:1449-1470`, PF przez `enm/assembler.py:218-266` `_build_shunt_specs_from_snapshot` | jedyny element kompensacyjny ENM; brak dławika, filtra, dławika odstrajającego | **ADOPT** (C = Q/(ωU²) z pierwszych zasad) + rozszerzyć | AB-2H |
| 34 | `network_model/solvers/shunt_compensator_preview.py:1-60` | B = Q/U², I_c = Q/(√3U) | testy podglądu | poprawne tożsamości | **ADOPT** | AB-2H |
| 35 | `enm/models.py:247-340` `OverheadLine`, `Cable` | R, X, B, R0, X0, B0 na km, `n_parallel`, `screen_bonding`, izolacja | liczne | wyłącznie 50 Hz; brak parametrów częstotliwościowych | **ADAPT** (pola addytywne `harmonic_model_ref` + parametry z katalogu) | AB-2H |
| 36 | `enm/models.py:399-440` `Transformer` | u_k, P_k, P_0, i_0, `vector_group`, uziemienia, `n_parallel`, zaczepy | liczne | brak danych f-zależnych; `vector_group` istnieje i jest czytany przez `network_model/core/branch.py:761-768` (przesunięcie fazowe) — do wykorzystania | **ADOPT** (grupa połączeń, uziemienia) + **ADAPT** (R_k(f)) | AB-2H |
| 37 | `enm/models.py:446-492` `Source` | S_k, I_k, R/X (`rx_ratio`), R0/X0, c_max/c_min, `u_set_pu` | liczne | brak U_bg(f) (tło) | **ADAPT** (pole tła jako osobny byt z proweniencją pomiaru, nie domyślne 0) | AB-2H |
| 38 | `enm/models.py:495-517` `Load` | P,Q, `pq`/`zip`, fazy | liczne | brak modelu harmonicznego odbioru (R‖L, CIGRE C-type, silnik) | **ADAPT** | AB-2H |
| 39 | `enm/assembler.py:190-206` `czestotliwosc_studium_hz`, `:541-575` `wezly_bez_impedancji_do_odniesienia`, `:593-640` `_wyspy_zasilone`, `zbuduj_graf`, `:1245-1330` `_droga_zerowa`, `enm/zero_sequence_transformer.py` | topologia, wyspy zasilone, redukcja łączników, droga składowej zerowej przez TR | testy assemblera, golden `parytet_assemblera` | nie dotyczy (infrastruktura) | **ADOPT** (jedyna droga topologii dla H; zakaz drugiego modelu sieci) | AB-2H |
| 40 | `network_model/core/ybus.py:29` `AdmittanceMatrixBuilder`, `core/branch.py:703-812` `TransformerBranch` | Y 50 Hz w pu z przekładnią i przesunięciem fazowym | testy PF | wzorzec per-unit + przekładnia rozwiązuje F1; tylko 50 Hz | **ADAPT** (wzorzec, nie import do Y(f) — Y(f) ma własne modele elementów; wyrocznia nie może dzielić builderów) | AB-2H |
| 41 | `network_model/solvers/power_flow_unbalanced.py:24, 262-274` VUF | VUF = |V_2|/|V_1|·100 z fazorów abc, 50 Hz | testy W5-D | poprawny w dziedzinie podstawowej; baza fazowa pod S-59 | **ADOPT** (jako fizyka asymetrii 50 Hz) | AB-5H (S-59 baza) |
| 42 | `application/analyses/migotanie.py:48-57, 243, 318` + `api/quality_analysis_runs.py:218-222` | P_st,i = c·S_n/S_k''; sumowanie m=3; P_lt=P_st; poziomy planowania SN 0,9/0,7; d = S_n/S_k''·100 | `test_migotanie.py` | źródła cytowane (IEC/TR 61000-3-7:2008 §5.2, Tab. 1) — zgodne liczbowo; ALE: c stałe (niezależne od kąta ψ_k i prędkości wiatru — IEC 61400-21-1 podaje c(ψ_k,v_a)); S_k'' z biegu IEC 60909 (scenariusz z c_max, z wkładem źródeł) zamiast mocy zwarciowej sieci bez ocenianej instalacji; P_lt=P_st założenie; fizyka w `application/` (NOT-A-SOLVER) | **ADAPT** (przeniesienie do solvera bez zmiany liczb = W6-7; c(ψ_k) z karty; S_k z właściwego scenariusza; limity do profilu) | AB-1b / W6-7 |
| 43 | `analysis/normative/kryteria_napiecia.py:54-97` | pasmo U_n ± 10 % PN-EN 50160 z cytatem | testy | poprawne źródło dla wartości skutecznej 50 Hz | **ADOPT** (wzorzec cytowania limitu) | AB-1b |
| 44 | `domain/canonical_operations.py:1212-1226` `generator.harmonic_spectrum_missing` | kod gotowości WARNING | testy gotowości | poprawny fail-closed | **ADOPT** | AB-2H |
| 45 | `enm/validator.py:1620-1645` W009 | ostrzeżenie o sprzeczności częstotliwości | testy walidatora | poprawne | **ADOPT** | AB-1d_min |
| 46 | `network_model/solvers/dynamika/wynik.py:98-140` `ladunek_resultset_dynamic_v1` + `silnik.py:579-680` kanały | szeregi czasowe `u_pu@szyna`, `kat_deg@szyna`, `p_pu@urz`, `q_pu@urz`, stany urządzeń (w tym `soc_pu`, `magazyn.py:64`), `f_hz@`, zdarzenia wykonane | testy dynamiki | brak ekstrakcji migawki punktu pracy w chwili t*; brak kanału stanu ogranicznika/trybu | **ADOPT** (źródło S-65) + nowa funkcja migawki | AB-3H |
| 47 | `frontend/src/ui2/wyniki/akademickie/prezentacja.ts:238-270` | tabela THD_U/TDD/K/status; „następny krok: sprawdź rezonanse w skanie impedancji… dobierz filtr harmonicznych” | `prezentacja.straznik.test.tsx`, `EkranAnalizAkademickich.test.tsx` | skan Z(f), U_h, fazy NIE są prezentowane; remedium „dobierz filtr” wskazuje element, którego ENM nie ma (phantom remedy) | **REWRITE** (nowy ekran `ui2/wyniki/harmoniczne`, `ui2/wyniki/skan`) | AB-2H |
| 48 | `frontend/src/ui2/wyniki/jakosc/*` (`EkranJakosci.tsx`, `SekcjaPasmRozplywu.tsx`, testy `migotanie.test.tsx`, `arcFlash.test.tsx`, `pasmaRozplywu.test.tsx`) | ekran „Jakość”: migotanie, arc flash, pasma napięć | vitest (nie uruchamiany w tym audycie) | brak harmonicznych na ekranie „Jakość” | **ADAPT** (miejsce wpięcia W-85) | AB-2H |
| 49 | `frontend/src/ui2/wyniki/ssci/*` | ekran werdyktu SSCI | vitest (nie uruchamiany) | dziedziczy #10/#22 | **KEEP_RESEARCH_ONLY** | AB-5H |
| 50 | `frontend/src/ui/workspace/screenCanonRegistry.ts:986-991` E-40 „Jakość energii i harmoniczne” | wpis kanonu ekranów | `screen-registry-coverage.test.ts` | ekran istnieje w kanonie dla zdolności do REWRITE | **ADAPT** (przepięcie na nową analizę) | AB-2H |
| 51 | `frontend/src/ui2/kreatory/kompensator/strings.ts:84-85` | tekst teorii: „rezonans z indukcyjnością sieci” | — | zapowiedź zjawiska, którego żaden bieg nie liczy dla baterii (#14 pomija baterie) | **ADAPT** (odsyłacz do skanu po AB-2H) | AB-2H |
| 52 | `infrastructure/cgmes/cgmes_exporter.py:584` eksport `shunt_capacitors` | eksport CGMES | testy CGMES | nie dotyczy fizyki | **ADOPT** (bez zmian) | — |

Nie znaleziono (0 trafień w `backend/src`, `frontend/src`, `scripts`, `backend/tests`): `supraharmonic`, `interharmonic`,
`frequency_scan` jako rodzaj biegu, FFT/STFT/`scipy.signal`/`np.fft`, dławik/filtr jako element ENM, `SupraharmonicBand`,
tło harmoniczne, import widma z pomiaru, `IEC 61000-3-6`, `IEC 61000-4-7` jako metoda grupowania (jedyne wystąpienie
to uzasadnienie niezmiennika rzędu 2..50), `IEC TR 61000-3-6` zasada sumowania α.

---

## 2. HARMONIC GAP MATRIX (H-36…H-52)

| Id | CURRENT | Dowód | Czego brakuje |
|---|---|---|---|
| H-36 | GAP | harmoniczne istnieją wyłącznie jako rodzaj „akademicki” FROZEN (`v126_academic.py:393`), nie jako `PhysicsDomain` | domena `HARMONIC_FREQUENCY_DOMAIN`, rodzaj biegu kanonicznego `harmoniczne`, solver poza V12.6 |
| H-37 | PARTIAL (formalnie) / GAP (merytorycznie) | `V=Y(h)⁻¹I` istnieje (`:421-447`), ale Y(h) błędna (F1, F1b, F2, F7), brak I_h gałęzi (`i_h` puste), brak udziałów | Y(f) w pu z przekładnią, I_h gałęzi, przepływ harmoniczny, udziały źródło→szyna/gałąź |
| H-38 | PARTIAL | `u_h` z `magnitude_kv` i `phase_deg` (`:444-446`); faza bez znaczenia, bo wszystkie źródła mają fazę 0 | φ_I,h, I_h gałęzi, faza źródeł z danych |
| H-39 | PARTIAL | THD = √ΣU_h²/U_n (`:451`) — U_1 = znamionowe, nie rozwiązane; zakres h do 49, EN 50160 do 40 | U_1 z rozpływu, zakres H z profilu, THD_I |
| H-40 | GAP | UI pokazuje tylko THD/TDD/K (`prezentacja.ts:250-262`); `u_h` w payloadzie bez prezentacji; brak kierunku propagacji, źródła dominującego | tabele U_h/I_h, szyna krytyczna, kierunek (znak Re(V·I*) per h) |
| H-41 | GAP | rzędy całkowite (`:394`, `dict[int,float]` `v126_contracts.py:107`, niezmiennik 2..50 `niezmienniki_katalogu.py:375`) | oś `f ∈ ℝ⁺` w kontrakcie |
| H-42 | GAP | R stałe, X·h (`:257-260`); katalog bez danych f | model R(f),L(f),C(f),G(f) z domeną ważności i kwalifikacją jakości |
| H-43 | GAP | TR: R bez U² (F1b), X·h, grupa ignorowana (F7), brak przekładni (F1) | Z_TR(f) z R_k(f), przekładnią, przesunięciem fazowym ±30°·k per składowa, blokadą składowej zerowej wg uziemień |
| H-44 | GAP | ENM ma `ShuntCapacitor`, most go gubi (`v126_contracts.py` 0 odwołań); brak dławika w ENM | kondensator w Y(f), dławik z R_L(f), dławik odstrajający |
| H-45 | GAP | brak elementu filtra w ENM/katalogu/solverze; UI mimo to zaleca „dobierz filtr” | elementy filtrów + porównanie przed/po |
| H-46 | PARTIAL (pozorne) | skan 50–2500 Hz co 10 Hz, publikowane co 100 Hz, szyna 0 = 1e-6 Ω (`:469-489`) | Z_th(f) z fizycznym źródłem, faza, ekstrema lokalne, antyrezonanse, zagęszczanie siatki |
| H-47 | GAP | „severity: ALERT” dla każdego punktu >10·Z_50 | analiza przyczynowa (wrażliwość dZ/dp, element dominujący — np. modalna analiza rezonansu / participation factors) |
| H-48 | GAP | tylko `CURRENT_SPECTRUM` bez fazy i punktu pracy | pięć pozostałych rodzajów + pola `frequency, amplitude, phase, operating_point, source, version, validation_status` |
| H-49 | GAP | sumowanie fazorów z fazą 0 = arytmetyczne (F4), niezadeklarowane | metoda jawna: fazorowa / statystyczna (np. wykładnik α wg IEC TR 61000-3-6 — do potwierdzenia wersji w OD-21/38) / obwiednia |
| H-50 | GAP | U_bg=0 z konstrukcji (brak pola) | `U_background`, `U_plant`, `U_combined` z superpozycji |
| H-51 | GAP | brak | macierz wkładów V_i,h = Σ_j Z_ij(h) I_j,h (ścisła z liniowości) |
| H-52 | GAP | brak | framework wariantów AB-6 |

## 3. SUPRAHARMONIC GAP MATRIX (S-53…S-67)

| Id | CURRENT | Dowód | Czego brakuje |
|---|---|---|---|
| S-53 | GAP | 0 trafień `supraharm` w kodzie; plan AB §5.3 istnieje tylko w docs | rejestr domeny i rodzaju biegu |
| S-54 | GAP | brak `SupraharmonicBand` | kontrakt bez domyślnych wartości; pasmo i metoda z dokumentu źródłowego |
| S-55 | GAP | katalog przekształtników: brak widma w.cz. (brak nawet widma harmonicznego) | modele E(f), E(f,P,Q,U,mode), E(f,P,Q,U,SOC,mode) |
| S-56 | GAP | widmo niezależne od punktu pracy | parametryzacja punktem pracy |
| S-57 | GAP | Y(f) ograniczone do 2,5 kHz, modele 50 Hz skalowane | Y(f) do 150 kHz z modelami o domenie ważności (pojemności TR, kabel jako linia długa, G dielektryczne) |
| S-58 | GAP | tylko przekątna Z_bus (`_driving_point_impedance`) | H_i←j(f)=Z_ij(f) |
| S-59 | GAP | Y_abc tylko 50 Hz w rozpływie niesymetrycznym (`power_flow_unbalanced.py`) | Y_abc(f) po W5 |
| S-60 | GAP | brak importu widm | importer CSV/XLSX/PQ-analizator z metadanymi |
| S-61 | GAP | brak | parametry pomiaru jako dane |
| S-62 | GAP | brak | metryki model↔pomiar |
| S-63 | GAP | brak | metryki supraharmoniczne |
| S-64 | GAP (świadomie po S-62/S-63) | brak | STFT po dziedzinie statycznej |
| S-65 | PARTIAL (tylko po stronie RMS) | kanały `p_pu, q_pu, u_pu, soc_pu` (`silnik.py:579-620`, `magazyn.py:64`) | migawka punktu pracy, wybór modelu widmowego |
| S-66 | GAP | brak | scenariusz łańcuchowy na wspólnej osi zdarzeń |
| S-67 | GAP | brak kontraktu domeny; ryzyko: nic dziś nie deklaruje przebiegów chwilowych (dobrze) | zapis w kontrakcie domeny, że wynik jest w dziedzinie f, nie EMT |

## 4. MULTI-PHYSICS GAP MATRIX (S-65, S-66, E2E-MP1…MP3)

Istnieje (RMS → dane do migawki):
- `ResultSetDynamicV1` (`dynamika/wynik.py:98-140`): `os_czasu_s`, `probki` dla kanałów `u_pu@szyna`, `kat_deg@szyna`
  (`silnik.py:579-593`), `p_pu@urz`, `q_pu@urz` (`:606-622`), stany urządzeń `{nazwa}@{ident}` (`:595-604`) w tym
  `soc_pu` magazynu (`urzadzenia/magazyn.py:64`), obserwable `f_hz@`, `u_f_est_hz@`; `zdarzenia_wykonane` z
  `t_wykonany_s, rodzaj, ref` (`wynik.py:127-137`) — to wystarcza do odtworzenia topologii w chwili t* przez
  odtworzenie zdarzeń na migawce ENM.
- `PunktPracy` (`dynamika/kontrakty.py:207-216`) — słowniki napięć i mocy źródeł; jest to dokładnie kształt migawki,
  tylko w kierunku odwrotnym (wejście RMS, nie wyjście).

Brakuje:
| Pozycja | Stan | Brak |
|---|---|---|
| Ekstrakcja migawki `PunktPracyWChwili(t*)` z `ResultSetDynamicV1` | GAP | funkcja: t* → {U_i∠θ_i, P_k, Q_k, SOC_k, tryb_k, stan ogranicznika_k, topologia(t*)}; zasady wyboru t* (po ustaleniu, w szczycie wsparcia Q, po odbudowie) z tolerancją stanu quasi-ustalonego (|dx/dt| < ε) — harmoniczne mają sens tylko dla stanu quasi-ustalonego |
| Kanał stanu ogranicznika prądu GFL | GAP | `przeksztaltnik_gfl.py:283-285` liczy `ogranicz_prad`, wynik nie jest kanałem; bez niego wybór widma „w ograniczeniu” niemożliwy |
| Kanał trybu (ładowanie/rozładowanie/FRT) | PARTIAL | ładowanie/rozładowanie wyprowadzalne ze znaku `p_pu`; tryb FRT nie jest kanałem |
| Topologia po zdarzeniach jako model | PARTIAL | zdarzenia są, brak funkcji „ENM + zdarzenia do t* → migawka topologii” dzielonej z assemblerem |
| Kontrakt wyboru modelu widmowego `E(f, P, Q, U, SOC, tryb)` | GAP | brak sekcji `harmonic/supraharmonic` w katalogu, brak reguły interpolacji między punktami pracy (i jej domeny ważności) |
| Wspólna oś zdarzeń RMS ↔ bieg harmoniczny | GAP | bieg harmoniczny musi nieść `zrodlo_punktu_pracy = {run_id_rms, t*}` i odcisk migawki |
| E2E-MP1 (PF → FRT → snapshot → widmo) | GAP | wszystkie ogniwa po stronie H |
| E2E-MP2 (BESS praca→zwarcie→Q→odbudowa→nowe widmo) | GAP | jw. + widmo BESS zależne od trybu |
| E2E-MP3 (topologia → RMS → skan → nowy rezonans) | GAP | skan z topologii w chwili t* |

## 5. MODEL GAPS (Y(f))

| Model | ENM | Katalog | Wejście solvera | Stan |
|---|---|---|---|---|
| Linia/kabel R(f) | R_50 (`enm/models.py:250,281`) | R20 [Ω/km] | R stałe | GAP |
| L(f) | X_50 | X_50 | X·h | GAP (skalowanie liniowe bez domeny) |
| C(f) | B_50 opcj. | C [nF/km] (`types.py:863-876` B(f)=ωC) | +j·h·B/2 | PARTIAL (poprawna zależność, brak modelu rozłożonego) |
| G(f) (straty dielektryczne) | brak | brak tan δ | brak | GAP |
| Model rozłożony (γ, Z_c) dla długich kabli | brak | brak | π jednosekcyjne | GAP |
| Transformator Z_TR(f) (R_k(f), przekładnia, grupa, składowa zerowa, pojemności) | `vector_group`, uziemienia, P_k, u_k (`:399-440`) | S_n,U,u_k,P_k,P_0,i_0,grupa | R bez U² (F1b), grupa ignorowana (F7), brak przekładni (F1) | GAP |
| Kondensator | `ShuntCapacitor` (`:523-545`) | `mv_shunt_capacitor_catalog.py` (Q,U,straty) | pominięty przez most | PARTIAL (ENM+katalog tak, solver nie) |
| Dławik ze stratami (Q-factor, R(f)) | brak | brak | brak | GAP |
| Dławik odstrajający baterii (p %) | brak | brak | brak | GAP |
| Filtry: strojony, górnoprzepustowy, tłumiony (C-type) | brak | brak | brak | GAP |
| Źródło Norton (widmo + Y_N(f)) | brak | brak | brak | GAP |
| Źródło Thevenin | brak | brak | brak | GAP |
| Widmo prądowe | pośrednio przez `ConverterType` | pole istnieje, 0 rekordów z danymi | `V126HarmonicSourceInput` bez fazy | PARTIAL |
| Widmo napięciowe | brak | brak | brak | GAP |
| Widmo zmierzone (z metadanymi pomiaru) | brak | brak | brak | GAP |
| Ekwiwalent częstotliwościowy (Z_conv(f) przekształtnika) | pola karty SSCI | pola ESTIMATED (`mv_converter_catalog.py:1158-1255`) | tylko SSCI | PARTIAL (KEEP_RESEARCH_ONLY) |
| Sieć zasilająca Z_Q(f) | S_k, R/X, R0/X0 (`:446-492`) | `mv_source_catalog.py` | PQ: idealna szyna (F3); SSCI: 0,15/0,99 zaszyte | GAP |
| Tło U_bg(f) | brak | brak | brak (=0) | GAP |
| Odbiór w dziedzinie f (R‖L, C-type CIGRE, silnik) | P,Q,model | — | pominięty | GAP |
| Maszyna synchroniczna X''(f), silnik asynchroniczny | dane dynamiczne w katalogu `der_dynamic` | X''d | pominięte | GAP |
| Agregacja wielu źródeł | — | — | faza 0 = arytmetyka (F4) | GAP |

## 6. REGULATORY GAPS — każda liczba zaszyta w kodzie dotykającym jakości energii

| Plik:linia | Liczba | Deklarowane źródło | Ocena |
|---|---|---|---|
| `v126_academic.py:394` | rzędy {2,3,5,7,11,13,17,19,23,25,29,31,35,37,41,43,47,49} | brak | brak źródła; pomija 4,6,8,9,10,12,14,15,16,18,20,21,…; EN 50160 i IEC 61000-4-7 obejmują wszystkie rzędy do 40/50 |
| `v126_academic.py:455-456` | THD_U 8 % | „PN-EN 50160” (bez roku, bez poziomu napięcia, bez agregacji 95 %/tydzień, bez miejsca oceny) | źródło niekompletne; zastosowane w każdym węźle do wartości modelu |
| `v126_academic.py:457-458` | THD_U 5 % | „IEEE 519” (bez roku) | poprawne tylko dla 1–69 kV w miejscu przyłączenia; stosowane także do nN i >69 kV |
| `v126_academic.py:459-460` | TDD 5 % | „IEEE 519” | najostrzejszy wiersz tabeli (I_sc/I_L<20) bez obliczenia I_sc/I_L |
| `v126_academic.py:452` | I_load ≥ 1,0 A | brak | podłoga bez źródła; I_L z obciążenia szyny, nie z maks. zapotrzebowania w miejscu przyłączenia |
| `v126_academic.py:470, 481` | 50…2500 Hz, krok 10 Hz, publikacja co 100 Hz | brak | zaszyte, niezależne od f_1 (F8) |
| `v126_academic.py:486` | rezonans przy |Z| > 10·|Z_50| | brak | próg bez źródła |
| `v126_academic.py:510` | THD ≤ 100 % (sanity) | „granica wiarygodności” | granica wiarygodności, nie limit — dopuszczalne |
| `v126_academic.py:295, 369, 375` | 1e6 S, 1e-6 S | „numeryczne” | ukryta korekta (F2) |
| `v126_academic.py:328, 1966` | R/Z=0,15, X/Z=0,99 | brak | zaszyte mimo `Source.rx_ratio` |
| `v126_academic.py:547` | SSCI 1…250 Hz, 61 punktów | brak | parametr metody bez źródła |
| `v126_academic.py:638, 645` | V_0=1,0 pu; I_0=1,0 pu przy braku P,Q | „assumption” | domysł punktu pracy |
| `v126_academic.py:1808` | 2. harmoniczna = 63/k % | brak | bez źródła (MAPA G4) |
| `v126_katalog.py:244-246` | 8,0 / 5,0 / 5,0 | parytet z solverem | kopia literałów bez źródła normowego |
| `api/v126_academic.py:421-424` | 8,0 / 5,0 / 5,0 / {5:6,0; 7:5,0; 11:3,5; 13:3,0} | brak (klucze nazywają normy) | wartości indywidualne zgodne z tabelą EN 50160 dla nN/SN, ale nieużywane i bez wersji |
| `ncrfg_ptpiree/engine.py:860` | THD_U źródła ≤ 8,0 % | brak | kompatybilność sieci przeniesiona na emisję urządzenia (zakaz W-70) |
| `niezmienniki_katalogu.py:375-392` | rząd 2..50; udział 0..100 % | „IEC 61000-4-7” | granica zakresu produktu, nie limit — ale wyklucza interharmoniczne |
| `migotanie.py:48` | m = 3 | IEC/TR 61000-3-7:2008 §5.2 | cytowane poprawnie |
| `migotanie.py:51-52` | P_st 0,9, P_lt 0,7 (SN) | IEC/TR 61000-3-7:2008 Tab. 1 (orientacyjne) | cytowane poprawnie; wiążące wartości OSD — brak w profilu |
| `migotanie.py:57` | k_max = 1 | IEC/TR 61000-3-7:2008 §5.5 (założenie konserwatywne) | jawne założenie |
| `mv_converter_catalog.py:1173, 1220, 1268` | c = 0,30 / 0,30 / 0,35 | ESTIMATED, IEC 61400-21-1:2019 metodyka | uczciwie oznaczone jako oszacowanie; brak c(ψ_k) |
| `analysis/ssci_stability/models.py:52, 57, 61` | |L|=1; 30°; 0° | Sun 2011 (1 i 0 — definicyjne); 30° „konwencja regulacji” | 30° bez źródła normowego |
| `analysis/normative/kryteria_napiecia.py:54-97` | ±10 % U_n | PN-EN 50160 | poprawne (dziedzina 50 Hz) |
| `power_flow_unbalanced.py:262-274` | definicja VUF | IEC 61000-4-30 | definicyjne, poprawne |

Wniosek regulacyjny: w repo nie istnieje ANI JEDEN limit harmoniczny z kompletną proweniencją (dokument, wersja,
poziom napięcia, podmiot, miejsce oceny, agregacja, pasmo, jednostka). Supraharmonicznych limitów: zero. Zgodnie z
W-70 i planem AB-1b wszystkie sloty power-quality/harmonic/supraharmonic w profilu muszą startować jako
`UNVERIFIED_SOURCE` do OD-21/OD-38; wartości z tabeli powyżej nie mogą zostać przeniesione do profilu jako „znane”.

## 7. ORACLE GAPS (AB-2H)

Dziś: brak jakiejkolwiek wyroczni harmonicznej (jedyny test „referencyjny” = determinizm i `THD ≥ 0`).
`pandapower` jest wyłącznie markerem testów izolowanych (`pyproject.toml:148`) i — według mojej wiedzy — nie ma
rozpływu harmonicznego (do potwierdzenia przy karcie, nie zakładać); OpenDSS nie ma w zależnościach.
`numpy` 1.26 + `scipy` 1.12 WYSTARCZAJĄ do wszystkich wyroczni poniżej.

| Wyrocznia | Konstrukcja | Zależności | Niezależność od `Y(f)` produkcji |
|---|---|---|---|
| W-A1 analityczna 2 szyny (E2E-H1) | V_h = I_h·(R + jhX_Q) ‖ … zapis zamknięty, ręcznie | brak | pełna (wzór) |
| W-A2 równoległy RLC (E2E-H4/H5) | Z(ω) = 1/(1/(R+jωL) + jωC); f_r = 1/(2π√(LC)) i Q; ekstremum |Z| analitycznie | brak | pełna |
| W-A3 linia długa | ABCD: cosh(γl), Z_c sinh(γl) — porównanie z kaskadą π n-sekcyjną (zbieżność ~1/n²) | numpy | pełna |
| W-A4 superpozycja tła (E2E-H3) | U_combined = U_bg·(transfer z Thevenina) + Z_th·I_plant, zapis zamknięty | brak | pełna |
| W-A5 transformator z grupą połączeń | przesunięcie fazowe składowej zgodnej +30°·k, przeciwnej −30°·k, blokada składowej zerowej przez Δ — przypadek 3 szyn zapisany wzorem | brak | pełna |
| W-M1 niezależny solver macierzowy (E2E-H2) | w katalogu testów: własna budowa Y z surowych formuł (inny kod per-unit, inna kolejność węzłów, `scipy.sparse` + `spsolve` albo `numpy.linalg.lstsq`), zero importów z `solvers/harmoniczne/` | numpy/scipy | wymuszona guardem importu (skan AST testu) |
| W-M2 funkcje wymierne filtrów | `scipy.signal.freqs(b, a, ω)` dla transmitancji filtrów strojonych/tłumionych jako niezależny ewaluator Z_filtr(f) | scipy | pełna |
| Niezmienniki | wzajemność Z_ij=Z_ji; pasywność Re Z_th(f) ≥ 0 dla sieci pasywnej; twierdzenie Fostera (dla sieci bezstratnej dX/dω > 0); bilans mocy Tellegena per f; niezależność od kolejności węzłów (zabija F2); skalowanie jednostek Hz↔kHz | numpy | pełna |
| Benchmark literaturowy | IEEE Task Force „Test Systems for Harmonics Modeling and Simulation” (IEEE Trans. PWRD 1999, 14-bus) albo CIGRE (np. TB 766 „Network modelling for harmonic studies”) — transkrypcja danych z proweniencją | numpy | pełna, klasa W „opublikowana” |
| Benchmark pomiarowy (E2E-H8, AB-7) | brak w repo jakichkolwiek widm zmierzonych | — | GAP — wymaga danych właściciela (OD) |

## 8. CI / MUTATION GAPS

Eksperyment mutacyjny wykonany (monkeypatch skrypt sesji `mutplug.py` (poza repozytorium), 10 plików / 344 testy, bez edycji repo):

| Klasa mutacji | Czy daje się wstrzyknąć w obecny kod | Co zabija DZIŚ | Test, który ma zabić (AB-2H/AB-4H) |
|---|---|---|---|
| H-M1 zły znak susceptancji | tak (`_ybus` z −jhB/2) | tylko `test_fixtury_harnessu.py::…[akademickie_scena_biegi]` — porównanie bajtowe fikstury UI (detektor zmiany, nie wyrocznia; zabije też każdą POPRAWKĘ) | W-A2: f_r kabel/kondensator ≠ 1/(2π√LC) → czerwień; Foster |
| H-M2 błąd Hz/kHz | tak (skan ×1000) | fikstura harnessu + 3 testy SSCI (`test_weak_grid_approaches_instability…`, `test_strong_grid_is_stable`, `test_weak_grid_flags_ssci_risk…`) — tylko ścieżka SSCI; ścieżka PQ nie ma żadnego testu | test typu jednostki osi f (oś niesie jednostkę; wejście w kHz odrzucone bez konwersji) + W-A2 w dwóch skalach |
| H-M3 zgubione źródło | tak (ostatnie źródło usunięte) | `test_v126_sanity_bounds.py::test_power_quality_with_harmonic_sources_verified` — wyłącznie dlatego, że fikstura ma JEDNO źródło (status → „dane niekompletne”); przy dwóch źródłach mutant przeżywa | W-M1 z ≥2 źródłami; bilans: Σ wkładów = wynik |
| H-M4 stałe R zamiast R(f) | nie — kod JUŻ jest mutantem (R stałe) | nic | test R(f) z danych: przy f=1 kHz R_ac/R_dc zgodne z modelem naskórkowości ±tolerancja; kwalifikacja jakości „R(f) nieznane” gdy brak danych |
| H-M5 brak kondensatora | nie — most już go gubi | nic | E2E-H5: bateria w ENM → pik |Z| przy f_r z modelu |
| H-M6 zła grupa połączeń | nie — grupa już ignorowana (F7) | nic | W-A5: U_3 po stronie SN przez Dyn = 0 dla harmonicznej symetrycznej; przesunięcie 5./7. o ∓30° |
| H-M7 zignorowane tło | nie — tła nie ma | nic | W-A4: U_combined ≠ U_plant gdy U_bg ≠ 0; brak tła → `UNVALIDATED_INPUT`, nie 0 |
| H-M8 zły kosz częstotliwości | tak (Y(h+1)) | tylko fikstura harnessu | W-A1 per h; test, że wynik przy f jest liczony z Y(f) (sonda z elementem o znanym Z(f)) |
| H-M9 amplituda/szczyt/RMS | tak (I·√2) | tylko fikstura harnessu | kontrakt wielkości (`rms`/`peak`) w typie amplitudy + W-A1 z jawnym RMS |
| S-M1 zignorowany punkt pracy | nie istnieje kod | nic | E2E-SH2: charge/discharge/idle → różne widma, różny wynik |
| S-M2 zła interpolacja widma | nie istnieje | nic | test interpolacji w domenie ważności + odmowa poza nią |
| S-M3 oś ×1000 | nie istnieje | nic | jw. H-M2 dla pasma 2–150 kHz |
| S-M4 złe sprzężenie faz | nie istnieje | nic | E2E-SH6: źródło na fazie A → odpowiedź A/B/C z Y_abc(f) vs wyrocznia |
| S-M5 zgubione tłumienie w.cz. | nie istnieje | nic | W-A3 z G(f)≠0: tłumienie wzdłuż kabla zgodne z Re(γ)·l |
| S-M6 zły kierunek transferu | nie istnieje | nic | test niesymetrii H_i←j przy elementach nieodwracalnych (przekształtnik aktywny) / test wzajemności dla sieci pasywnej |

Wniosek wprost: **żadna z dziewięciu klas mutacji harmonicznych nie jest dziś zabijana przez test fizyki.** Cztery
(H-M4, H-M5, H-M6, H-M7) nie dają się nawet wstrzyknąć, bo obecny kod już JEST mutantem. Pozostałe pięć ginie
wyłącznie na porównaniu bajtowym fikstury UI (które zabija również poprawkę) albo przypadkiem kształtu fikstury.
Klas supraharmonicznych: kodu brak, testów brak.

## 9. ARCHITECTURE RECOMMENDATION — `backend/src/network_model/solvers/harmoniczne/`

Granice (twarde): nie edytować `v126_academic.py`, `solver_input/v126_contracts.py` (ścieżka V12.6),
`ncrfg_ptpiree/*`, `short_circuit_iec60909.py`/`short_circuit_core.py`, `power_flow_*.py`, `dynamika/*` rdzenia
(poza ADDYTYWNĄ funkcją migawki w warstwie aplikacji). Wycofanie `POWER_QUALITY_HARMONICS` z powierzchni po AB-2H
wzorcem W3-E (410 + zamiennik), kasacja kodu = OD-15(d) właściciela.

Podział modułów:
1. `os_czestotliwosci.py` — `OsCzestotliwosci(f_hz: tuple[float,...], rodzaj: HARMONICZNE|LISTA|SIATKA_LIN|SIATKA_LOG,
   f1_hz, zrodlo)`; wartości `float` w Hz (jedna jednostka w rdzeniu; kHz tylko w prezentacji), walidacja f>0,
   sortowanie, deduplikacja z tolerancją; rząd h = f/f1 jest ATRYBUTEM pochodnym, nie kluczem (H-41, S-54).
2. `kontrakty.py` — frozen dataclasses: `WezelH`, `GalazH` (model: `PI_SKUPIONE | LINIA_DLUGA`, parametry R(f),L(f),
   C(f),G(f) jako tabela albo model z danymi, `domena_waznosci_hz`, `jakosc_modelu`), `TransformatorH` (przekładnia
   zespolona z grupy, R_k(f), uziemienia → droga składowej zerowej), `KondensatorH`, `DlawikH` (R(f) / Q), `FiltrH`
   (`STROJONY | GORNOPRZEPUSTOWY | TLUMIONY_C`), `ZrodloH` (`CURRENT_SPECTRUM | VOLTAGE_SPECTRUM | NORTON_EQUIVALENT |
   THEVENIN_EQUIVALENT | MEASURED_SPECTRUM | FREQUENCY_DEPENDENT_EQUIVALENT` + `frequency, amplitude(rms), phase|None,
   operating_point, source, version, validation_status`), `TloH` (U_bg(f) z fazą lub statystyką, proweniencja),
   `MetodaAgregacji` (`FAZOROWA | STATYSTYCZNA(parametry ze źródła) | OBWIEDNIA`). Brak wartości domyślnych dla danych.
3. `elementy.py` — czyste funkcje `Z_element(f) → (complex, KwalifikacjaModelu)`; poza domeną → `OUTSIDE_DOMAIN`, nie
   ekstrapolacja.
4. `ybus_f.py` — Y(f) w pu na bazie assemblera; rozdział sekwencji dla układu symetrycznego (h≡1 mod 3 zgodna,
   h≡2 przeciwna, h≡0 zerowa) z przekładnią fazową TR per sekwencja; później `Y_abc(f)` (S-59, po W5).
5. `rozwiazanie.py` — dla każdego f: faktoryzacja LU raz, rozwiązanie dla wektora źródeł i kolumn jednostkowych;
   ŻADNEGO `pinv`/cichej stabilizacji — osobliwość = odmowa nazwana `harmoniczne.siec_plywajaca`.
   Superpozycja: tło + instalacja; wkłady V_i = Σ_j Z_ij I_j (H-51 ścisłe z liniowości).
6. `skan.py` — Z_th(f)=Z_ii(f), H_i←j(f)=Z_ij(f); ekstrema lokalne |Z| + przejścia fazy przez 0; zagęszczanie
   (bisekcja / złoty podział) w oknach ekstremów; rezonans/antyrezonans z częstotliwością, modułem, Q.
7. `metryki.py` — U_h, I_h, φ, THD_U/THD_I (zakres H z profilu), TDD z jawnym I_L, metryki pasmowe (grupowanie
   wg metody z profilu, bez domyślnej).
8. `slad.py` — White Box W-75/W-76/W-77.
9. `wynik.py` — ładunek `resultset_harmonic_v1` (i `resultset_frequency_scan_v1`), kwantyzacja na granicy jak
   `dynamika/wynik.py`, `physics_domain` w ładunku.
10. `supraharmoniczne/` (AB-4H) — ten sam `ybus_f` z modelami o domenie do 150 kHz + `emisja.py` E(f, punkt pracy).

Topologia bez drugiego modelu sieci: nowa funkcja `enm/assembler.py::zloz_wejscie_harmoniczne(snapshot, opcje)`
obok `zloz_wejscie_rozplywu` / `zloz_wejscie_zwarcia` / `zloz_wejscie_rozplywu_niesymetrycznego`, używająca
`zbuduj_graf`, `_wyspy_zasilone`, `wezly_bez_impedancji_do_odniesienia`, `czestotliwosc_studium_hz`,
`_droga_zerowa`, `_build_shunt_specs_from_snapshot` (bateria → C) — ta sama redukcja łączników, te same wyspy,
ta sama częstotliwość studium co PF/SC. Punkt pracy (U_1, P, Q odbiorów i źródeł) z biegu PF (`run_id` PF w
wejściu) albo z migawki RMS (AB-3H: `application/…/migawka_punktu_pracy(resultset_dynamic_v1, t*)` — odtworzenie
zdarzeń na migawce ENM; wynik niesie `{run_id_rms, t*}` i odcisk).

Wpięcie: `analysis_type` = `harmoniczne`, `skan_czestotliwosciowy`, `supraharmoniczne` w `api/execution_runs.py`
(`ExecutionAnalysisType`), `api/v125_contracts.py` (mapy kontraktów, wzorzec `dynamika_rms` :330-352),
`enm/canonical_analysis.py` (wykonawca), `application/calculation_readiness/service.py` (etykiety, gotowość bez
`ready` bez solvera — AB-1d_min), `application/solvers/solver_capability_registry.py`, kontrakt w
`application/contracts/`. UI: `ui2/wyniki/harmoniczne` (widmo U_h/I_h, tabele, wkłady), `ui2/wyniki/skan`
(|Z|, kąt, rezonanse), sekcja na ekranie `ui2/wyniki/jakosc`; SLD: nakładka po `element_ref` tych samych obiektów
ENM (W-86). Wyrocznie w `backend/tests/harmoniczne/wyrocznie/` z guardem importu zakazującym
`network_model.solvers.harmoniczne.elementy|ybus_f`.

## 10. TRZY FALSYFIKOWALNE TEZY — dokumenty zawyżają zdolność harmoniczną

1. **MAPA_DOMKNIECIA_PRODUKTU_2026-09.md:239** — „Harmoniczne / THD / TDD / rezonans | CZĘŚCIOWE |
   `v126_academic.py:240-520` (18 rzędów, limity EN 50160 / IEEE 519)”, luka opisana jako „odwzorowanie
   kondensatorów/filtrów w skanie niezweryfikowane”. Obalenie: odwzorowanie jest ZWERYFIKOWANE jako nieobecne —
   `solver_input/v126_contracts.py:740-944` nie czyta `enm.shunt_capacitors` (0 odwołań), filtrów i dławików nie ma
   w `enm/models.py:1703-1726`; ponadto `v126_academic.py:284` (R_T bez U²) i `:282-293` (brak przekładni) dają
   błąd ×1406 napięcia harmonicznego po stronie nN (F1). Stan właściwy: REWRITE, nie CZĘŚCIOWE. „Limity EN 50160”
   to próg chwilowy w każdym węźle (`:455`), podczas gdy wartości indywidualne (`api/v126_academic.py:424`) nie są
   oceniane nigdzie.
2. **SYNTEZA_DOMKNIECIA_PRODUKTU_2026-09.md:475** (§2.8) — „harmoniczne/impedancja harmoniczna z widmami z
   proweniencją (W2-C dała wejście)”. Obalenie: wejście nie niesie danych — `grep -c harmonic_spectrum_percent
   network_model/catalog/mv_converter_catalog.py` = 0 (żaden rekord), a kontrakt wejścia
   `v126_contracts.py:103-114` nie ma fazy, punktu pracy, wersji ani statusu walidacji (H-48); impedancja sieci
   zasilającej nie wchodzi do ścieżki harmonicznej wcale (`v126_academic.py:475` `with_source_shunt=False`; F3:
   THD identyczne dla S_k 50 i 5000 MVA). Pokrewnie `v126_katalog.py:393` deklaruje „Moc zwarciowa źródła
   zasilania” jako daną tej analizy — F3 to obala.
3. **MAPA_DOMKNIECIA_PRODUKTU_2026-09.md:89** (domena 6) i **SYNTEZA:106-107** — harmoniczne (18 rzędów) jako
   zdolność istniejąca, której luką jest położenie w UI („harmoniczne pod »akademickimi«”); oraz
   **INWENTARZ_FUNKCJI_2026-07.md:36** (E-40 „Jakość energii i harmoniczne” jako ekran zdolności) z rejestrem
   `solver_capability_registry.py:219-231` (`implementation_status="implemented"`, „skan Z(f), rezonans”).
   Obalenie: wynik zależy od kolejności szyn na liście (`v126_academic.py:294-295`; F2: THD(ST) 0,1003 % → 0,0 %),
   „rezonanse” to każdy punkt siatki powyżej 10·|Z_50| (`:486-489`; F5: 49 „pików” na zwykłym kablu), a test
   referencyjny zdolności (`test_v126_academic_solver.py:96-104`) sprawdza tylko `THD ≥ 0`. To problem fizyki, nie
   nawigacji.

Dodatkowo (poza trzema tezami): `solver_input/provenance.py:322` „THD_U (T20) … porównywane z limitem profilu” —
limit jest zaszyty w solverze (`ncrfg_ptpiree/engine.py:860`), nie w profilu.

## 11. DECYZJE ZBIORCZE

- ADOPT: #29, #33, #34, #36 (grupa/uziemienia), #39, #41, #43, #44, #45, #46, #52.
- ADAPT: #8, #15, #19, #20, #25, #27, #28, #30, #31, #32, #35, #37, #38, #40, #42, #48, #50, #51.
- REWRITE: #1, #2, #3, #5, #13, #18, #47.
- KEEP_RESEARCH_ONLY: #9, #10, #21, #22, #49.
- REJECT: #4, #6, #7, #11 (dla H), #12, #14 (jako wejście H), #16, #17 (jako źródło limitów), #23, #24, #26.

## 12. Kontrola zdań §104

- „dodamy harmoniczne później” — raport nie odracza: każda luka ma kamień AB-1b/AB-1d_min/AB-2H/AB-3H/AB-4H/AB-5H/AB-7.
- „harmoniczne = THD” — raport wymaga U_h, I_h, faz, Z_th(f), transferu, wkładów, tła, agregacji; THD jest jedną z metryk.
- „dynamika = FRT + LFSM-O” — poza zakresem tego audytu; audyt wiąże RMS z widmem przez S-65 (migawka).
- „supraharmoniczne = FFT” — raport nie proponuje FFT; supraharmoniczne = modele emisji zależne od punktu pracy +
  propagacja Y(f) do 150 kHz + transfer + walidacja pomiarowa.
