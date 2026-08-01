# AUDYT SZCZYTU 2026-08-01 — siedem soczewek z adwersaryjną weryfikacją (WIĄŻĄCY)

Szczyt badany: `34c9afe1` (V12K-289…304). Soczewek: 7; znalezisk surowych: 21; po deduplikacji: 21; POTWIERDZONYCH po próbie obalenia: 8; obalonych: 2.

Metoda: każde znalezisko niesie plik, scenariusz awarii i WYKONANY dowód; następnie niezależny sceptyk próbował je OBALIĆ (ścieżka nieosiągalna? walidacja wyżej? świadomy zamysł w rejestrze? nie odtwarza się?). Do dokumentu trafia wyłącznie to, co przetrwało próbę obalenia — z poprawionym scenariuszem sceptyka tam, gdzie zgłaszający mylił się co do mechanizmu.

## Potwierdzone defekty

### D1 [krytyczna] Wielomian ZIP zbudowany z SAMYCH odbiorów jest nakładany na WYPADKOWĄ moc szyny (odbiory + generacja) — rozpływ zwraca złą wartość, w skrajnym przypadku z odwróconym znakiem

**Miejsce:** /home/user/MV-Design-PRO/mv-design-pro/backend/src/enm/mapping.py:537 (do bus_zip_components wchodzą WYŁĄCZNIE odbiory) vs :544-546 (generacja wchodzi do bus_p/bus_q) i :561 + :573/:583 (agregat przypięty do węzła); konsumpcja: /home/user/MV-Design-PRO/mv-design-pro/backend/src/enm/canonical_analysis.py:1557-1561; agregacja: /home/user/MV-Design-PRO/mv-design-pro/backend/src/network_model/solvers/power_flow_zip.py:181-227

**Na czym polega:** `bus_zip_components` (mapping.py:537) zbiera składniki ZIP tylko z `enm.loads`. Generatory (mapping.py:544) wchodzą do `bus_p`/`bus_q`, ale NIE do agregacji ZIP. Powstały `ZipCoeffs` jest przypinany do węzła (mapping.py:573/583), a `canonical_analysis.py:1557-1561` buduje `PQSpec(p_mw=-node.active_power, zip_coeffs=node.zip_coeffs)` — czyli wielomian wyliczony z udziałów mocy ODBIORÓW jest mnożony przez moc WYPADKOWĄ szyny (odbiory minus generacja). Solver (`zip_effective_spec`) wykonuje `p_eff = p_spec * zip_factor(...)` i nie ma jak wiedzieć, że waga i mnożnik pochodzą z różnych zbiorów elementów. Fizycznie poprawnie: P_szyny(V) = -P_odb·(a(V/V0)²+b(V/V0)+c) + P_gen (generator PQ jest stałej mocy). Kod liczy: (P_gen - P_odb)·(a(V/V0)²+b(V/V0)+c). Dodatkowo `aggregate_zip` nigdy nie przepuszcza wyniku przez `validate_zip_coeffs`, więc przy q_tot = 0 zwraca a_q=b_q=c_q=0 (suma 0 zamiast 1) — Q odbioru zostaje wyzerowane, jeśli na szynie jest generacja mocy biernej. Rachunek jest cichy: brak ostrzeżenia, brak kodu gotowości, ślad WHITE BOX pokazuje spójne liczby, bo solver dostał już skażone wejście.

**Scenariusz awarii:** Szyna SN 15 kV z odbiorem 1,0 MW o charakterystyce stałej impedancji (a_p=1, katalogowy `materialized_params`) i instalacją PV 0,9 MW na tej samej szynie — układ typowy dla przyłączenia OZE za stacją odbiorczą. Rozpływ przy napięciu 0,90 pu wstrzykuje do szyny -0,081 MW (pobór) zamiast fizycznych +0,09 MW (oddawanie do sieci). Znak przepływu przez transformator zasilający jest odwrotny, więc projektant dostaje zaniżony spadek napięcia, zły kierunek mocy na przyłączu i błędną ocenę warunków przyłączenia OZE — a ekran pokazuje wynik jako pełnoprawny, bo nic nie sygnalizuje niespójności.

**Dowód zgłaszającego:** Sonda uruchomiona na HEAD (poetry run python, pełny łańcuch ENM→graf): zbudowałem `EnergyNetworkModel` z jedną szyną B1, odbiorem L1 (p_mw=1.0, materialized_params a_p=1.0,c_p=0.0) i generatorem G1 (p_mw=0.9), wywołałem `map_enm_to_network_graph`. Wynik:
  node.active_power (MW, NETTO) = -0.09999999999999998
  node.zip_coeffs (z SAMYCH odbiorow) = ZipCoeffs(a_p=1.0, b_p=0.0, c_p=0.0, a_q=0.0, b_q=0.0, c_q=0.0, v0_pu=1.0, ...)
  P(V=0.9) wg lancucha ENM->solver = -0.081 MW
  P(V=0.9) fizycznie              =  0.09 MW
Znak wyniku jest odwrotny. Zwróć uwagę na a_q=b_q=c_q=0.0 — to drugi objaw: `aggregate_zip` (power_flow_zip.py:205-208) przy q_tot==0 zwraca 0.0 dla wszystkich trzech udziałów Q, czyli wielomian o sumie 0 zamiast 1, i nikt tego nie waliduje (`validate_zip_coeffs` jest wołane tylko w `build_zip_table` i `zip_coeffs_from_materialized_params`, nigdy na agregacie).
BRAMKA NIE MOŻE SIĘ ZAPALIĆ: jedyne testy agregacji to tests/test_power_flow_zip.py:282 i :292 — oba podają wyłącznie odbiory ((2.0,0.0,CONST_Z),(1.0,0.0,CONST_P)), żaden nie stawia generatora na szynie z odbiorem ZIP, więc regresja tej klasy jest niewykrywalna.
PRZY OKAZJI (bez znaleziska): zweryfikowałem determinizm solvera IEC 60909 realnym dwukrotnym biegiem na sieci referencyjnej GN-04 (8 węzłów) — SHA-256 pełnego zserializowanego wyniku ze śladem (12 028 B) identyczny w obu biegach: ff94d57f2203831e32c0f58048f62f6421d91ed09eb78b479787ad54d9bf7c8a. Determinizm czysty.

**Werdykt sceptyka (nie obalono):** DEFEKT SIĘ BRONI — odtworzony NA PRODUKCYJNEJ ŚCIEŻCE, ale scenariusz zgłaszającego wymagał dwóch istotnych korekt (jedna z jego dwóch tez jest FAŁSZYWA co do mechanizmu).

CO PRÓBOWAŁEM OBALIĆ I Z JAKIM SKUTKIEM

1) „Wyżej stoi walidacja" — CZĘŚCIOWO SKUTECZNE, ale nie ratuje kodu.
Scenariusz zgłaszającego (falownik PV 0,9 MW BEZPOŚREDNIO na szynie SN 15 kV) jest odrzucany PRZED solverem: reguła E029 w src/enm/validator.py:356-391 daje BLOCKER dla gen_type ∈ {pv_inverter, wind_inverter, fw_*, bess} z connection_variant ∈ {None, nn_side, LV_BEHIND_STATION_TRANSFORMER} na szynie > 1 kV, plus E028 przy braku wariantu; src/api/enm.py:620-627 zwraca wtedy 422 i bieg nie startuje. Dowód (sonda /tmp/probe_zip2.py): dokładnie ten model → status=FAIL, BLOCKER E028 + E029.
ALE: reguła nie dotyczy generatora synchronicznego (nie jest typem falownikowym) ani szyny nN (warunek voltage_kv > 1.0). Zbudowałem model z generatorem synchronicznym na tej samej szynie SN co odbiór ZIP → ENMValidator: status=OK, 0 BLOCKERÓW. Ścieżka otwarta.

2) „Ścieżka nieosiągalna / kontrakt gwarantuje typ" — OBALONE.
Kontrakt materializacji katalogowej JAWNIE wprowadza udziały ZIP do Load.materialized_params: src/network_model/catalog/types.py:3121-3140 (namespace OBCIAZENIE, solver_fields = p_kw, q_kvar, model, a_p, b_p, c_p, a_q, b_q, c_q, v0_pu, k_pf, k_qf, f0_hz), a Load w src/enm/models.py:396,402 ma model: "pq"|"zip" i materialized_params. Wejście z zewnątrz: PUT /api/.../{case_id}/enm (src/api/enm.py:133-137) przyjmuje dowolny EnergyNetworkModel razem z materialized_params. UCZCIWE ZASTRZEŻENIE (na korzyść obrony, nie obalające): żaden z 3 dostarczonych typów katalogowych odbioru (mv_auxiliary_catalog.get_all_load_types) nie ma niezerowych udziałów ZIP, a operacje domenowe zapisują loads z model:"pq" bez ZIP — więc DZIŚ, bez importu ENM / własnego typu katalogowego, użytkownik nie aktywuje tej gałęzi klikiem w UI. Kod jest jednak żywy na kanonicznej ścieżce rozpływu i uzbraja się w chwili pojawienia się jakiegokolwiek odbioru ZIP.

3) „Test już to pokrywa" — OBALONE, bramka NIE MOŻE się zapalić.
tests/test_power_flow_zip.py:282 i :292 agregują wyłącznie odbiory. tests/enm/test_zip_wiring.py:54-77 (test_zip_aggregation_is_power_weighted_across_loads) trzyma w ręku wadliwy agregat (oba odbiory q_mvar=0 → a_q=b_q=c_q=0) i NIE asertuje niczego o Q. Żaden test w repo nie stawia generacji na szynie z odbiorem ZIP.

4) „To znany dług z rejestru" — OBALONE. grep po docs/v12xx/REJESTR_KONFLIKTOW.md: jedyne trafienia „ZIP" to archiwum projektu i panel teorii cosφ/ZIP; wpisy V12K-289..304 (KD-1..KD-4) nie dotyczą ani agregacji ZIP, ani rozpływu z generacją.

5) „Scenariusz nie odtwarza się w praktyce" — OBALONE POMIAREM na produkcyjnej funkcji enm.canonical_analysis._execute_power_flow (sonda /tmp/probe_zip4.py). Model walidatorowo czysty (status=OK): szyna SN 15 kV, odbiór 3,0 MW / 1,5 Mvar o charakterystyce stałej impedancji (a_p=a_q=1), generator synchroniczny na TEJ SAMEJ szynie, linia 12 km 0,4+j0,8 Ω/km, GPZ 1,0 pu, S_b=10 MVA. Odniesienie: własny Newton w numpy (niezależny od repo), zwalidowany zerowym błędem (do 1e-9) w wariancie bez generacji.
  P_gen=0,0: łańcuch U=0,883332 pu = odniesienie 0,883332 (0 różnicy — odniesienie poprawne)
  P_gen=2,7: łańcuch U=0,934080 vs fizyka 0,940366 (-0,0063 pu = -94 V); P na przyłączu łańcuch +0,3053 MW (POBÓR) vs fizyka -0,0046 MW (ODDAWANIE) → ZNAK ODWROTNY
  P_gen=3,0: łańcuch +0,0424 MW vs fizyka -0,2720 MW → ZNAK ODWROTNY, błąd 0,31 MW
  P_gen=4,0: łańcuch -0,8517 vs fizyka -1,1450 MW → błąd 0,29 MW (29% zaniżenia eksportu)
Prawo błędu wyprowadzone z kodu i potwierdzone liczbowo: ΔP = P_gen·(f_ZIP−1), więc błąd rośnie z mocą generacji i z odchyłką napięcia; nigdy nie znika i nigdy nie jest sygnalizowany. Determinizm nietknięty (dwa biegi identyczne) — wynik jest konsekwentnie błędny, co jest gorsze niż niestabilny.

CO ZGŁASZAJĄCY NAPISAŁ ŹLE (korekty, nie unieważniające defektu)
A) Drugi objaw NIE polega na cichym zerowaniu Q. build_zip_table (power_flow_zip.py:95) WOŁA validate_zip_coeffs na agregacie, więc przy q_tot==0 rzuca ValueError("ZIP Q coefficients must sum to 1, got 0.0") i bieg kończy się statusem FAILED (canonical_analysis.py:581-586). To nie fałszywy wynik, tylko twarda wywrotka — ZA TO o szerszym zasięgu, niż twierdzi zgłaszający: generacja NIE JEST potrzebna. Sam odbiór ZIP z q_mvar = 0 (odbiór skompensowany do cosφ=1) na modelu walidatorowo czystym (status=OK, 0 BLOCKERÓW) wywraca CAŁY rozpływ, a inżynier dostaje w error_message angielski komunikat wewnętrzny (naruszenie reguły polskich etykiet). Zweryfikowane wykonaniem.
B) Sonda zgłaszającego liczyła P przy NARZUCONYM napięciu 0,90 pu. Przy gen ≈ odbiór szyna zostaje blisko 1,0 pu i inwersja znaku tam NIE wystąpi; odtworzyłem ją dopiero w zbieżnym punkcie pracy obciążonego ciągu (U = 0,934 pu). Arytmetyka zgłaszającego jest poprawna, ale przykład liczbowy nie był punktem pracy.
C) Cytowane miejsca w kodzie potwierdzone co do wiersza: mapping.py:534-543 (do bus_zip_components wchodzą TYLKO enm.loads), :544-546 (generatory tylko do bus_p/bus_q), :561/:573/:583 (agregat przypięty do węzła), canonical_analysis.py:1548-1562 (PQSpec z mocy NETTO + zip_coeffs szyny), power_flow_zip.py:181-227 (aggregate_zip bez walidacji, wagi z modułów mocy odbiorów).

PRZY OKAZJI (odrębne, wykryte podczas weryfikacji, nie część werdyktu): artefakt wyniku raportuje moc szyny SPRZED wielomianu ZIP — bus_results.p_injected_mw = -3,0000 MW przy rzeczywistym wstrzyku wynikającym z przepływu gałęzi p_to = -2,3408 MW (P_gen=0). Tabela wyników łamie bilans węzłowy o 22% na każdej szynie ZIP, niezależnie od obecności generacji.

REPRODUKCJA: /tmp/probe_zip.py, /tmp/probe_zip2.py, /tmp/probe_zip3.py, /tmp/probe_zip4.py (uruchamiane `cd mv-design-pro/backend && poetry run python <plik>`; żaden plik repo nie był modyfikowany).

**Scenariusz po korekcie sceptyka:** SCENARIUSZ 1 (błędny wynik, znak przepływu na przyłączu odwrócony — odtworzony na produkcyjnej ścieżce)
Model ENM przechodzący walidator (ENMValidator: status=OK, 0 BLOCKERÓW): szyna SN 15 kV „Zakład" z odbiorem 3,0 MW / 1,5 Mvar o charakterystyce STAŁEJ IMPEDANCJI (Load.model="zip", materialized_params a_p=a_q=1,0 z kontraktu materializacji OBCIAZENIE, types.py:3121-3140) ORAZ generatorem synchronicznym (agregat kogeneracyjny) 2,7 MW na TEJ SAMEJ szynie; zasilanie z GPZ przez linię 12 km 0,4+j0,8 Ω/km, slack 1,0 pu, S_b = 10 MVA. Bieg: POST /api/.../runs/power-flow → canonical_analysis._execute_power_flow.
UWAGA — korekta wobec zgłoszenia: generacji NIE wolno w tym scenariuszu modelować jako falownika PV wpiętego wprost w szynę SN, bo to blokuje reguła walidatora E029 (validator.py:356-391) i API zwraca 422. Klasę defektu odtwarza się generatorem synchronicznym na szynie SN (dowiedzione) albo falownikiem OZE po stronie nN stacji / z jawnym transformatorem blokowym (E029 wtedy nie strzela).
WYNIK ZMIERZONY: łańcuch daje U = 0,934080 pu i P na przyłączu +0,3053 MW (POBÓR z sieci); niezależne rozwiązanie fizyczne tego samego układu daje U = 0,940366 pu i P = -0,0046 MW (ODDAWANIE). Znak mocy na przyłączu odwrócony, spadek napięcia zawyżony o 0,63 pkt proc. (94 V przy 15 kV). Przy P_gen = 3,0 MW: łańcuch +0,0424 MW poboru vs fizyka 0,2720 MW oddawania (błąd 0,31 MW). Przyczyna: wielomian ZIP zbudowany z UDZIAŁÓW SAMYCH ODBIORÓW (mapping.py:534-543) jest przypięty do węzła (mapping.py:561,573,583), a canonical_analysis.py:1548-1562 mnoży go przez moc WYPADKOWĄ szyny (odbiory minus generacja). Błąd wstrzyku = P_gen·(f_ZIP − 1) — rośnie z mocą generacji i z odchyłką napięcia, nie daje żadnego ostrzeżenia ani kodu gotowości, a ślad WHITE BOX jest wewnętrznie spójny, bo solver dostał już skażone wejście. Skutek dla projektanta: zły kierunek i wartość mocy na przyłączu, zawyżony spadek napięcia, błędna ocena warunków przyłączenia generacji.

SCENARIUSZ 2 (wywrotka biegu — poprawka objawu opisanego przez zgłaszającego)
Model walidatorowo czysty (status=OK, 0 BLOCKERÓW) z JEDNYM odbiorem ZIP o q_mvar = 0,0 (odbiór skompensowany do cosφ = 1) — BEZ ŻADNEJ GENERACJI. aggregate_zip (power_flow_zip.py:205-208) przy q_tot == 0 zwraca a_q=b_q=c_q=0 (suma 0 zamiast 1), po czym build_zip_table (power_flow_zip.py:95) woła validate_zip_coeffs i rzuca ValueError. Bieg kończy się statusem FAILED z error_message = „ZIP Q coefficients must sum to 1, got 0.0 (a=0.0, b=0.0, c=0.0)" — angielski komunikat wewnętrzny prezentowany polskiemu inżynierowi. To NIE jest ciche zerowanie Q (teza zgłoszenia), tylko twarda awaria — o szerszym zasięgu, bo nie wymaga generacji.

BRAMKA (potwierdzone): tests/test_power_flow_zip.py:282,292 oraz tests/enm/test_zip_wiring.py:54-77 agregują wyłącznie odbiory; test wiring wręcz WYTWARZA wadliwy agregat (oba odbiory q_mvar=0) i nie sprawdza udziałów Q. Regresja obu scenariuszy jest dziś niewykrywalna.

### D2 [krytyczna] append_station_on_endpoint połyka błąd materializacji katalogu — transformator z nieistniejącym typem i parametrami wstrzykniętymi z payloadu przechodzi do solvera jako wynik „reportable"

**Miejsce:** mv-design-pro/backend/src/enm/domain_operations.py:7846-7854 (warunek `if not isinstance(materialization, dict):` w linii 7851); powiązane: mv-design-pro/backend/src/api/domain_ops_policy.py:17-36 (brak `append_station_on_endpoint` w `CATALOG_REQUIRED_OPERATIONS`)

**Na czym polega:** `_materialize_catalog_payload` zwraca dict błędu, gdy pozycji katalogowej nie ma. W repozytorium jest 13 wywołań tej funkcji; 12 z nich robi `if isinstance(materialization, dict): return materialization` (m.in. bliźniacza operacja `insert_station_on_segment_sn`, linia 5095-5102). JEDYNIE wywołanie w `append_station_on_endpoint` ma warunek ODWRÓCONY (`if not isinstance(...)`) i przy błędzie po prostu pomija materializację, nie zwracając błędu. Transformator jest wtedy zapisany z `catalog_ref` wskazującym nieistniejącą pozycję, `catalog_namespace: TRAFO_SN_NN` i `source_mode: KATALOG` (twarde stałe wpisane przed materializacją, linie 7833-7841), `materialized_params: null`, a `sn_mva`/`uk_percent`/`pk_kw` biorą się WPROST z payloadu (`transformer_payload.get(...)`). Druga bramka też nie zadziała: `append_station_on_endpoint` nie figuruje w `CATALOG_REQUIRED_OPERATIONS`, więc polityka katalogowa API tej operacji nie sprawdza (w odróżnieniu od `insert_station_on_segment_sn`). Efekt: brama katalogowa jest omijana, a model kłamie o źródle danych — deklaruje wiązanie katalogowe, którego nie ma.

**Scenariusz awarii:** Projektant (albo klient API/skrypt/import) kończy ciąg SN stacją operacją `append_station_on_endpoint`, podając `transformer.transformer_catalog_ref` z literówką lub ref z innej wersji katalogu, oraz dane tabliczki (`sn_mva`, `uk_percent`, `pk_kw`). Operacja kończy się sukcesem (HTTP 200, `error: null`), snapshot jest utrwalony, gotowość zwraca `ready: true` bez blokad, a zwarcie liczy się na impedancji z payloadu i wraca jako `reporting_status: reportable`, `proof_status: complete`. Ta sama literówka w `insert_station_on_segment_sn` daje HTTP 422 `catalog.item_not_found`. Wariant bez tabliczki jest równie zły: model dostaje `sn_mva=0`, `uk_percent=0` i jedyny sygnał to ogólna blokada E006 „brak napięcia zwarcia", która wskazuje objaw, a nie przyczynę (nieistniejący typ katalogowy).

**Dowód zgłaszającego:** Sonda na żywym backendzie (port 19100, HTTP przez /api/cases/{case}/enm/domain-ops). (1) `append_station_on_endpoint` z `transformer_catalog_ref: "trafo-ktorego-nie-ma"` + `sn_mva:0.63, uk_percent:4.0, pk_kw:6.5` → `err=None`, `READY=True`, `blockers=[]`, a w snapshocie: {"catalog_ref":"trafo-ktorego-nie-ma","catalog_namespace":"TRAFO_SN_NN","source_mode":"KATALOG","sn_mva":0.63,"uk_percent":4.0,"materialized_params":null}. (2) DOKŁADNIE ten sam ref w `insert_station_on_segment_sn` → HTTP 422 {"code":"catalog.item_not_found","message_pl":"Nie znaleziono rekordu katalogu: trafo-ktorego-nie-ma w kategorii TRAFO_SN_NN"}. (3) `POST /api/cases/{case}/runs/short-circuit` na tym modelu → HTTP 200, `reporting_status: "reportable"`, `proof_status: "complete"`, `ikss_a: 23753.1` na szynie nN — wartość policzona z uk=4% wstrzykniętego payloadem (kontrola: 1,1·400/(√3·0,04·0,4²/0,63) ≈ 25 kA). (4) Wariant bez tabliczki: transformator z `sn_mva:0.0, uk_percent:0.0`, jedyna blokada to E006. (5) Przegląd wszystkich 13 wywołań `_materialize_catalog_payload` (linie 3070, 3246, 3838, 4791, 4829, 5095, 5944, 6325, 6461, 6599, 6617, 7846) — tylko 7846 ma warunek odwrócony. `pytest tests/enm tests/api` = 1393 passed, czyli żaden test tej ścieżki błędu nie dotyka.

**Werdykt sceptyka (nie obalono):** PRÓBY OBALENIA — wszystkie pięć zawiodło, każda zmierzona wykonaniem.

(1) „Wyżej stoi walidacja" — NIE. `append_station_on_endpoint` (domain_operations.py:7365) nie ma `_require_catalog_ref` (którego używa bliźniacza `insert_station_on_segment_sn`, linia 5074-5080), nie ma modelu pydantic payloadu (0 trafień w domain_ops_models.py), a brama API jest wyłączona. POMIAR: `validate_and_materialize_catalog_binding("append_station_on_endpoint", {…"transformer_catalog_ref":"trafo-ktorego-nie-ma"…})` → `policy_error=None`; TEN SAM payload dla `insert_station_on_segment_sn` → `CatalogPolicyError(code='catalog.item_not_found', …)`. Jedyne wystąpienie `append_station_on_endpoint` w domain_ops_policy.py (linia 324) to `_STATION_OPERATIONS_WITH_FIELD_EQUIPMENT`, obejmujące CT/VT/przekaźnik pól SN — NIE transformator.

(2) „Kontrakt gwarantuje typ" — NIE. `_materialize_catalog_payload` (2065-2099) zwraca `tuple` przy sukcesie i `dict` z `_error_response` przy błędzie. Warunek `if not isinstance(materialization, dict)` wykonuje ciało TYLKO przy sukcesie, a błąd milcząco porzuca. Inwentarz wszystkich wywołań na SZCZYCIE 34c9afe1: 12 miejsc w domain_operations.py (3125, 3301, 3899, 4852, 4890, 5156, 6005, 6386, 6522, 6668, 6686, 7915) — jedenaście ma `if isinstance(materialization, dict): return materialization`, wyłącznie 7920 jest odwrócone. (Trzy dalsze w domain_operations_v2.py: 2478 i 2582 wzorcowe; 2629 to `not isinstance(…, tuple)` w czytniku zwracającym `float | None` — inna semantyka, nie zapis elementu.) `git log -L 7846,7854` pokazuje, że odwrócony warunek wszedł RAZEM z funkcją (594e48d4), pod komentarzem „Materializacja z katalogu (ujednolicony wzorzec)" — kod deklaruje wzorzec, którego łamie; nic nie wskazuje na świadomy wyjątek.

(3) „Łapie to bramka gotowości" — NIE, i to jest najciekawsze. Jedyny checker, który MA blokadę `catalog.materialization_failed` przy `materialized_params` pustym (readiness_checker.py:204-216, 246-289), to `check_snapshot_readiness` — a on NIE JEST WOŁANY Z ŻADNEGO MODUŁU PRODUKCYJNEGO: grep po src/ daje tylko definicję i `is_analysis_ready` (samo bez wywołań), jedyny konsument to tests/e2e/test_production_scenario.py. Bramka, która miała chronić dokładnie ten defekt, nie może się zapalić. Ścieżka realna używa `_build_readiness` → `ENMValidator`, który sprawdza wyłącznie `uk_percent <= 0` (validator.py:232-252) i nie zna pojęcia „referencja katalogowa nie istnieje". POMIAR na utrwalonej migawce: `ready=true`, `blockers=[]`, tylko ostrzeżenia W002/W003/W004.

(4) „Test już to pokrywa" — NIE. Zero asercji `catalog.item_not_found` w tests/enm/test_append_station_on_endpoint.py i tests/enm/test_station_*.py.

(5) „To znany dług z rejestru" — NIE. Żaden wpis V12K-289…304 nie dotyczy tej ścieżki; trzy wystąpienia `append_station_on_endpoint` w rejestrze (V12K-044, V12K-075, V12K-077) mówią o polach GPZ, kreatorze i `nn_block`. PRZECIWNIE — rejestr zawiera precedens rozstrzygający NA NIEKORZYŚĆ: V12K-241 („Operacja `set_der_catalog_bindings` przyjmowala DOWOLNY lancuch jako referencje katalogowa … literowka albo referencja z wycofanej wersji katalogu stawala sie dana projektowa") to defekt tego samego kształtu, uznany za CONFIRMED i naprawiony. Dom traktuje ten wzorzec jako defekt, nie jako projekt.

ODTWORZENIE (sonda `/tmp/probe_append.py`, `poetry run python`, HEAD 6946807a; blok kodu bajt-identyczny z 34c9afe1):
- ZŁY ref + tabliczka: `error=None`, w migawce `{"catalog_ref":"trafo-ktorego-nie-ma","catalog_namespace":"TRAFO_SN_NN","source_mode":"KATALOG","sn_mva":0.63,"uk_percent":4.0,"pk_kw":6.5,"materialized_params":null,"catalog_item_id":null,"catalog_item_version":null}`.
- ZŁY ref bez tabliczki: `sn_mva=0.0, uk_percent=0.0, pk_kw=0.0`, nadal `source_mode:"KATALOG"`.
- DOBRY ref (kontrola): `uk_percent=5.0` z katalogu + pełne `materialized_params`.
- Mapowanie ENM→graf: `TransformerBranch{rated_power_mva:0.63, uk_percent:4.0}` — impedancja solvera bierze się z payloadu.
- SOLVER (`ShortCircuitIEC60909Solver.compute_3ph_short_circuit`, szyna nN 0,4 kV, c=1,1, tk=1 s): ZŁY ref → **Ikss = 23753,1 A** (Sk 16,4567 MVA, |Zkk| 0,010695 Ω); DOBRY ref → **19391,1 A** (Sk 13,4346 MVA). Błąd **+22,5%** w stronę niebezpieczną (zawyżony prąd zwarciowy → przewymiarowanie/fałszywy werdykt wytrzymałości). Liczba 23753,1 A zgadza się co do 0,1 A z sondą HTTP zgłaszającego — niezależne potwierdzenie jego pomiaru na żywym backendzie.

DROBNE POPRAWKI DO ZGŁOSZENIA (nie zmieniają istoty): numery linii 7846-7854/7851 odpowiadają szczytowi roboczemu 6946807a; na wskazanym szczycie 34c9afe1 ten sam blok to linie 7915-7923, warunek odwrócony w 7920. Wywołań `_materialize_catalog_payload` jest 12 w domain_operations.py (nie 13) plus 3 w domain_operations_v2.py.

**Scenariusz po korekcie sceptyka:** DEFEKT: `mv-design-pro/backend/src/enm/domain_operations.py:7851` (na szczycie 34c9afe1: linia 7920) — w `append_station_on_endpoint` warunek `if not isinstance(materialization, dict):` jest ODWRÓCONY względem jedenastu pozostałych wywołań `_materialize_catalog_payload` w tym pliku. Przy nieudanej materializacji katalogu funkcja zwraca dict błędu, a ten warunek po prostu POMIJA materializację i idzie dalej, zamiast zwrócić błąd. Druga bramka też nie działa: `append_station_on_endpoint` nie figuruje w `CATALOG_REQUIRED_OPERATIONS` (`mv-design-pro/backend/src/api/domain_ops_policy.py:17-36`), a jedyny checker znający blokadę `catalog.materialization_failed` (`network_model/catalog/readiness_checker.py:204-216`) jest MARTWY — nie woła go żaden moduł produkcyjny.

SCENARIUSZ AWARII (odtworzony wykonaniem):
1. Projektant kończy ciąg SN stacją: `POST /api/cases/{case}/enm/domain-ops`, operacja `append_station_on_endpoint`, w `transformer` podaje `transformer_catalog_ref` z literówką (albo ref z wycofanej wersji katalogu, albo ref przeniesiony importem archiwum projektu) oraz dane tabliczki `sn_mva: 0.63, uk_percent: 4.0, pk_kw: 6.5`.
2. Brama katalogowa API przepuszcza (operacja poza `CATALOG_REQUIRED_OPERATIONS`): zmierzone `policy_error=None`.
3. Operacja domenowa kończy się sukcesem: `error=None`, HTTP 200, migawka utrwalona. Transformator zapisany jako `{"catalog_ref":"trafo-ktorego-nie-ma","catalog_namespace":"TRAFO_SN_NN","source_mode":"KATALOG","sn_mva":0.63,"uk_percent":4.0,"pk_kw":6.5,"materialized_params":null,"catalog_item_id":null,"catalog_item_version":null}` — model DEKLARUJE wiązanie katalogowe (`source_mode: KATALOG`), którego nie ma, a fizyka pochodzi wprost z payloadu (zakaz wstrzykiwania parametrów z pominięciem katalogu, §10 kanonu).
4. Gotowość milczy: `_build_readiness` → `ready=true`, `blockers=[]` (tylko ostrzeżenia W002/W003/W004). `ENMValidator` sprawdza jedynie `uk_percent <= 0`, więc wstrzyknięte 4,0 przechodzi.
5. Bieg zwarciowy `POST /api/cases/{case}/runs/short-circuit` przechodzi walidację i liczy na wstrzykniętej impedancji. POMIAR na szynie nN 0,4 kV (c=1,1, tk=1 s): **Ikss = 23 753,1 A** (Sk 16,4567 MVA) zamiast **19 391,1 A** (Sk 13,4346 MVA) dla realnej pozycji katalogowej `tr-sn-nn-15-04-630kva-dyn11` (uk = 5%). Błąd **+22,5%**, wynik wraca jako `reporting_status: reportable`, `proof_status: complete` — czyli jako dana projektowa gotowa do raportu i do doboru aparatury.
6. WARIANT BEZ TABLICZKI jest równie zły inaczej: transformator dostaje `sn_mva=0.0, uk_percent=0.0, pk_kw=0.0` przy `source_mode: KATALOG`, a jedyny sygnał to ogólna blokada E006 „brak napięcia zwarcia" — komunikat wskazujący OBJAW zamiast przyczyny (nieistniejący typ katalogowy), więc projektant zaczyna od ręcznego wpisywania uk% zamiast od poprawy referencji.
7. PARYTET ZŁAMANY: DOKŁADNIE ten sam ref w bliźniaczej `insert_station_on_segment_sn` jest odrzucany dwukrotnie — bramą API (`CatalogPolicyError code='catalog.item_not_found'` → HTTP 422) i bramą domenową (`error_code='catalog.item_not_found'`, „Nie znaleziono rekordu katalogu: trafo-ktorego-nie-ma w kategorii TRAFO_SN_NN"). Ta sama pomyłka projektanta jest łapana, gdy stacja wchodzi w środek odcinka, a przepuszczana, gdy kończy ciąg.

DOWODY WYKONANE: sonda `/tmp/probe_append.py` (budowa GPZ + odcinek 500 m, trzy warianty refa + kontrola przez `insert_station_on_segment_sn`); sonda polityki katalogowej (obie operacje, ten sam payload); `_build_readiness` na utrwalonej migawce; mapowanie `map_enm_to_network_graph` (uk_percent 4,0 vs 5,0 na `TransformerBranch`); `ShortCircuitIEC60909Solver.compute_3ph_short_circuit` (23 753,1 A vs 19 391,1 A); inwentarz 12 wywołań `_materialize_catalog_payload` na szczycie 34c9afe1 (11 poprawnych, 1 odwrócone w 7920); `grep` potwierdzający martwotę `check_snapshot_readiness`; przegląd rejestru V12K-289…304 i całego REJESTR_KONFLIKTOW.md (brak wpisu; precedens V12K-241 naprawiony jako defekt tego samego kształtu).

### D3 [krytyczna] Guard „Brak bezposrednich parametrow zwarcia" nie skanuje ANI JEDNEGO pliku — zdublowany segment ścieżki daje ciche RC=0

**Miejsce:** mv-design-pro/scripts/no_direct_fault_params_guard.py:27 (oraz :96-98); wpięty w .github/workflows/p0-extended-guards.yml:146

**Na czym polega:** BACKEND_SRC liczone jest jako Path(__file__).resolve().parent.parent / "mv-design-pro" / "backend" / "src". Skrypt leży w /repo/mv-design-pro/scripts/, więc parent.parent to już /repo/mv-design-pro — doklejenie drugiego "mv-design-pro" daje /repo/mv-design-pro/mv-design-pro/backend/src, katalog który nie istnieje. main() trafia wtedy w gałąź `if not BACKEND_SRC.exists(): print("WARN..."); return 0` i kończy się kodem 0 bez otwarcia jednego pliku. Krok CI świeci na zielono, a inwariant (zakaz surowego fault_node_id i bezpośrednich wywołań execute_short_circuit poza warstwą wiązania FaultScenario) nie jest egzekwowany. To dokładnie wzorzec „fałszywej zieleni": bramka mierzy coś, czego nie ma.

**Scenariusz awarii:** Dowolny PR wstrzykuje surowy fault_node_id albo woła execute_short_circuit bezpośrednio z warstwy API/analiz, omijając domenowy FaultScenario. Krok „Brak bezposrednich parametrow zwarcia" przechodzi (RC=0), recenzent widzi zielone CI i scala zmianę, która obchodzi kanoniczne wiązanie scenariusza zwarciowego — czyli defekt, przed którym ta bramka miała chronić, przechodzi bez zatrzymania. Stan jest trwały: bramka nie zapali się NIGDY, niezależnie od zawartości repo.

**Dowód zgłaszającego:** (1) Sonda ścieżki: BACKEND_SRC = /home/user/MV-Design-PRO/mv-design-pro/mv-design-pro/backend/src, exists=False; realny katalog /home/user/MV-Design-PRO/mv-design-pro/backend/src, exists=True. (2) Uruchomienie w dokładnym kontekście CI (working-directory: mv-design-pro, jak w defaults workflowu): `python scripts/no_direct_fault_params_guard.py` → wypis „WARN: Backend source directory not found, skipping guard.", RC=0 (kod złapany bezpośrednio, bez pipe'a). (3) Sonda instrumentująca builtins.open i Path.read_text: guard otwiera 0 plików źródłowych (dla porównania: ui_no_physics_guard 1212, trace_ui_leak_guard 1240). (4) Ta sama logika (check_file) uruchomiona po podmianie BACKEND_SRC na realny katalog zwraca 220 trafień, m.in. backend/src/api/fault_loop.py:47/60/108, backend/src/api/case_runs.py:104/432, backend/src/api/proof_pack.py:124/144/330, backend/src/analysis/machine_short_circuit/contribution.py:96/111/171 — czyli bramka jest nie-pusta z definicji, po prostu nigdy nic nie ogląda.

**Werdykt sceptyka (nie obalono):** Próbowałem obalić sześcioma drogami — każda potwierdziła znalezisko.

(1) ŚCIEŻKA. Sonda: `Path(__file__).resolve().parent.parent` = `/home/user/MV-Design-PRO/mv-design-pro`, więc BACKEND_SRC = `/home/user/MV-Design-PRO/mv-design-pro/mv-design-pro/backend/src`, `exists=False`; realny katalog `/home/user/MV-Design-PRO/mv-design-pro/backend/src` `exists=True`. `BACKEND_SRC.rglob('*.py')` daje 0 plików (po repointowaniu: 760).

(2) CZY TO ŚWIADOMY UKŁAD? Nie. Bratni guard `mv-design-pro/scripts/fix_action_completeness_guard.py:17` liczy `parent.parent / "backend" / "src"` — bez zdublowanego segmentu. `no_direct_fault_params_guard.py:27-28` jest JEDYNYM plikiem w scripts/ z wzorcem `parent.parent / "mv-design-pro"`. `git log -p --follow` pokazuje wyłącznie linie `+BACKEND_SRC` ze zdublowanym segmentem i ani jednej linii `-` zmieniającej tę stałą — ścieżka NIGDY nie była poprawna, guard jest pusty od narodzin.

(3) REJESTR. `grep` po `REJESTR_KONFLIKTOW.md` za `no_direct_fault_params`, `BACKEND_SRC`, `bezposrednich parametrow`, `skipping guard` — zero trafień. To nie jest zarejestrowany dług ani wpis V12K-289..304.

(4) KOMPENSACJA INNYM GUARDEM? Nie ma. Jedyne inne pliki w scripts/ zawierające te wzorce to `solver_boundary_guard.py:41` (fraza w komentarzu-sankcji V12K-184) i `solver_output_drift_guard.py:58` (f-string komunikatu) — żaden nie egzekwuje inwariantu.

(5) TEST? Brak. W scripts/ jest 9 plików `test_*_guard.py`, żaden dla tego guarda; `grep -rn no_direct_fault_params backend/tests/` — zero trafień.

(6) CZY KROK CI W OGÓLE SIĘ WYKONUJE (może workflow pada wcześniej)? Wykonuje się i świeci na zielono. `p0-extended-guards.yml` ma `on: pull_request, push`, `defaults.run.working-directory: mv-design-pro`, ZERO `continue-on-error`. Uruchomiłem wszystkie guardy poprzedzające krok :146 — `load_flow_no_heuristics`, `protection_no_heuristics`, `solver_boundary`, `overlay_no_physics`, `ui_no_physics`, `trace_ui_leak` — każdy RC=0.

DOWÓD ROZSTRZYGAJĄCY (odtworzenie scenariusza PR, wyłącznie w /tmp, zero dotknięcia repo): zbudowałem `/tmp/fakerepo/mv-design-pro/` z kopią guarda i plikiem `backend/src/api/evil_endpoint.py` zawierającym OBA zakazane wzorce (surowy `fault_node_id` + bezpośrednie `execute_short_circuit`) w niebiałolistowanej warstwie API. Uruchomienie z `working-directory: mv-design-pro` (jak w workflow), kod wyjścia łapany bezpośrednio: „WARN: Backend source directory not found, skipping guard.", RC=0. Następnie w TEJ SAMEJ kopii zmieniłem WYŁĄCZNIE zdublowany segment ścieżki (`parent.parent / "mv-design-pro" / "backend"` → `parent.parent / "backend"`) — ten sam guard, ten sam plik wejściowy: RC=1, 3 naruszenia wypisane. Różnica RC 0→1 wynika w 100% ze zdublowanego segmentu.

NIE-PUSTOŚĆ NA REALNYM DRZEWIE: `check_file` z podmienionym BACKEND_SRC na realny katalog → 760 plików przeskanowanych, 220 naruszeń w 37 plikach (m.in. `backend/src/api/fault_loop.py:47/108`, `api/case_runs.py:104/432`, `analysis/machine_short_circuit/contribution.py:96/111/171`).

KOREKTA WOBEC ZGŁOSZENIA (istotna dla naprawy): rozbicie 220 trafień to 220× `fault_node_id` i 0× `execute_short_circuit`. Sama naprawa ścieżki zapali krok na 37 plikach preexisting — biała lista (linie 35-41: 5 pozycji) jest nieaktualna wobec dzisiejszego drzewa. Naprawa musi być dwuczłonowa: ścieżka + re-baseline białej listy do realnej warstwy wiązania FaultScenario. To nie osłabia defektu — wręcz go pogłębia: CI od zawsze raportuje jako egzekwowany inwariant, którego 37 plików nie spełnia.

USTERKA WTÓRNA (ta sama przyczyna, potwierdza brak jakiejkolwiek obrony): `is_whitelisted` (:52-56) łapie `ValueError` z `relative_to(BACKEND_SRC)` i zwraca `True`. Przy zepsutym BACKEND_SRC nawet gdyby pliki jakoś trafiły do `check_file`, KAŻDY zostałby uznany za białolistowany — pustka jest podwójna. Dodatkowo `BACKEND_TESTS` (:28) niesie tę samą zepsutą ścieżkę i nie jest nigdzie używana — martwa stała potwierdzająca, że blok stałych nigdy nie był wykonywany na realnych danych.

**Scenariusz po korekcie sceptyka:** Bramka `mv-design-pro/scripts/no_direct_fault_params_guard.py:27` (i bliźniacza stała :28) liczy korzeń skanowania jako `Path(__file__).resolve().parent.parent / "mv-design-pro" / "backend" / "src"`. Skrypt leży w `/repo/mv-design-pro/scripts/`, więc `parent.parent` to już `/repo/mv-design-pro` — doklejenie drugiego segmentu `mv-design-pro` daje nieistniejący `/repo/mv-design-pro/mv-design-pro/backend/src`. `main()` (:96-98) trafia w gałąź `if not BACKEND_SRC.exists(): print("WARN..."); return 0` i kończy się kodem 0 bez otwarcia ani jednego pliku (rglob = 0 plików; realny katalog ma 760).

Awaria: dowolny PR wstrzykuje surowy `fault_node_id` albo woła `execute_short_circuit` bezpośrednio z warstwy API/analiz, omijając domenowy FaultScenario i ExecutionEngine. Krok „Brak bezposrednich parametrow zwarcia" w `.github/workflows/p0-extended-guards.yml:146` (workflow na `push` i `pull_request`, `working-directory: mv-design-pro`, bez `continue-on-error`, wszystkie kroki poprzedzające RC=0, więc krok realnie się wykonuje) przechodzi na zielono. Recenzent widzi potwierdzenie inwariantu i scala zmianę omijającą kanoniczne wiązanie scenariusza zwarciowego. Stan jest trwały i niezależny od zawartości repo: `git log -p --follow` pokazuje wyłącznie linie `+BACKEND_SRC` ze zdublowanym segmentem, bez ani jednej linii korygującej — bramka nie zapaliła się nigdy od momentu powstania.

Odtworzenie (wyłącznie w /tmp, repo nietknięte): w `/tmp/fakerepo/mv-design-pro/` kopia guarda + `backend/src/api/evil_endpoint.py` z oboma zakazanymi wzorcami w niebiałolistowanej warstwie API. Uruchomienie z `working-directory: mv-design-pro`, kod wyjścia łapany bezpośrednio (bez pipe'a): „WARN: Backend source directory not found, skipping guard.", RC=0. Po zmianie w tej samej kopii WYŁĄCZNIE zdublowanego segmentu (`parent.parent / "mv-design-pro" / "backend"` → `parent.parent / "backend"`), przy identycznym pliku wejściowym: RC=1 i trzy wypisane naruszenia (`evil_endpoint.py:2` fault_node_id, `:3` execute_short_circuit, `:3` fault_node_id). Cała różnica RC 0→1 pochodzi ze zdublowanego segmentu.

Skala na realnym drzewie: `check_file` z BACKEND_SRC ustawionym na `mv-design-pro/backend/src` przeskanował 760 plików i zwrócił 220 naruszeń w 37 plikach — rozbicie: 220× `fault_node_id`, 0× `execute_short_circuit`; przykłady `backend/src/api/fault_loop.py:47/108`, `api/case_runs.py:104/432`, `api/analysis_run_exports.py:577`, `analysis/machine_short_circuit/contribution.py:96/111/171`.

Zakres naprawy: dwuczłonowy. Sama korekta ścieżki zapali krok na 37 plikach preexisting, bo biała lista (:35-41, 5 pozycji) jest nieaktualna wobec dzisiejszego drzewa — potrzebny jest re-baseline białej listy do realnej warstwy wiązania FaultScenario. Przy okazji: `is_whitelisted` (:52-56) łapie `ValueError` z `relative_to(BACKEND_SRC)` i zwraca `True`, więc przy zepsutym korzeniu każdy plik byłby białolistowany nawet gdyby dotarł do `check_file` (pustka podwójna), a `BACKEND_TESTS` (:28) niesie tę samą zepsutą ścieżkę i nie jest nigdzie używana. Brak testu bramki (w scripts/ jest 9 plików `test_*_guard.py`, żaden dla tego guarda) — dlatego regresja była niewykrywalna; naprawa powinna dodać test wykonujący guard na fikstrze z naruszeniem i asertujący RC=1.

### D4 [krytyczna] Dwa równoległe zapisy modelu sieci gubią całą operację — magazyn ENM nie ma ŻADNEJ ochrony współbieżności, a API melduje sukces

**Miejsce:** mv-design-pro/backend/src/enm/store.py:137-150 (set_enm: odczyt-modyfikacja-zapis globalnego `_enm_store` + inkrementacja rewizji bez blokady); wejście: mv-design-pro/backend/src/api/station_templates.py:173 (`def apply_station_template` — endpoint SYNCHRONICZNY, więc FastAPI wykonuje go w PULI WĄTKÓW) → mv-design-pro/backend/src/application/station_templates/apply.py:287 (`saved = _set_enm(case_key, new_enm)`); współdzielona ścieżka tymczasowa: enm/store.py:70 i :82 oraz enm/dziennik_zmian.py:145 i :154

**Na czym polega:** `set_enm` czyta bieżący model (`existing = _enm_store.get(case_id)`, l. 137), liczy nową rewizję (l. 145-146) i podmienia wpis w globalnym słowniku (l. 149), po czym zapisuje plik (l. 150). Cała ta sekwencja nie jest niczym serializowana. Endpoint `POST /api/station-templates/{id}/apply` jest zdefiniowany jako `def` (nie `async def`), więc dwa żądania biegną NAPRAWDĘ równolegle w wątkach roboczych i oba wykonują ten cykl na tej samej bazie wyjściowej — zwycięzca to ten, który zapisze jako ostatni; praca drugiego znika. Model zapytania `ApplyTemplateRequest` (api/station_templates.py:42-49) nie ma nawet pola `snapshot_base_hash`, więc bramka optymistyczna z `domain-ops` (api/enm.py:781-790) tej ścieżki nie chroni. Dodatkowo `_persist_enm` (l. 70) i `dziennik_zmian._zapisz` (l. 145) piszą do JEDNEJ, wspólnej dla przypadku ścieżki `<digest>.tmp`, a potem robią `replace()` — przy nałożeniu wątków `replace()` drugiego kończy się ENOENT; wyjątek leci PO tym, jak `_enm_store[case_id] = enm` (l. 149) już podmienił model w pamięci, więc użytkownik dostaje błąd zapisu, mimo że żywy model już się zmienił, a plik na dysku nie.

**Scenariusz awarii:** Dwóch projektantów (albo dwie karty przeglądarki jednego) pracuje na tym samym przypadku obliczeniowym i w tej samej chwili zatwierdza wstawienie stacji z szablonu na dwóch różnych odcinkach magistrali. Oba żądania kończą się HTTP 200 z listą 12 utworzonych elementów każde, kreator melduje „wykonano”, a w modelu przybywa TYLKO JEDNA stacja — 12 elementów drugiego projektanta nie istnieje. Rewizja modelu rośnie o 2, więc dziennik zmian i znacznik nieaktualności wyników pokazują dwie zmiany, których nie da się już odtworzyć. Wariant drugi: jedno z żądań kończy się HTTP 422 „Błąd zapisu snapshot: [Errno 2] No such file or directory: …/<digest>.tmp -> …/<digest>.json” — komunikat mówi o awarii zapisu, choć model w pamięci procesu został już zmieniony.

**Dowód zgłaszającego:** Uruchomiony backend na porcie 19200 (świeża baza, sieć 12 stacji zbudowana przez API). KONTROLA SEKWENCYJNA (/tmp/persist-probe/wyscig2.py): jedno zastosowanie szablonu tpl_bess_1mw_2mwh → HTTP 200, stacje 14→15, szyny 80→84, gałęzie 65→68, zwrócony `station_ref` OBECNY w `substations` = True. WYŚCIG (te same wywołania, dwa wątki zsynchronizowane barierą, różne odcinki): „zadanie A: HTTP 200 station_ref=stn/9bb6301c…/station utworzone=12 / zadanie B: HTTP 200 station_ref=stn/4655e2b6…/station utworzone=12”, a stan modelu „stacje 15 -> 16 (oczekiwane +2), rewizja 30 -> 32, nowe stacje w modelu: 1 {stn/9bb6301c…}”, „stacja zadania B obecna w modelu: False”. Powtórzenie 3× (/tmp/persist-probe/wyscig3.py): próba 1 — oba HTTP 200, delta stacji 1, 12 elementów zadania A nieobecnych w modelu; próba 2 — oba HTTP 200, delta 1, 12 elementów zadania B nieobecnych; próba 3 — HTTP 422 `template.persist_failed`. Kolizja pliku tymczasowego odtworzona 5× na 6 prób przy 4 wątkach, z pełnym komunikatem wskazującym zarówno `…<digest>.tmp -> …<digest>.json`, jak i `…<digest>.dziennik.tmp -> …<digest>.dziennik.json` (/tmp/persist-probe zapis w logu sondy).

**Werdykt sceptyka (nie obalono):** PRÓBY OBALENIA (wszystkie wykonane, wszystkie nieudane):

1. „Wyżej stoi bramka optymistyczna" — NIE. `ApplyTemplateRequest` (src/api/station_templates.py:42-49) nie ma pola `snapshot_base_hash`; bramka 409 z `domain_ops` (src/api/enm.py:781-790) działa tylko na własnym kontrakcie i jest dodatkowo opcjonalna (`if req.snapshot_base_hash`).

2. „Gdzieś jest blokada" — NIE. `grep -rn "threading\.|Lock()|RLock|asyncio.Lock|filelock|fcntl" backend/src/` → ZERO trafień w całym backendzie. `_get_enm`/`_set_enm` w api/enm.py:38-39 to gołe aliasy `enm.store.get_enm`/`set_enm`.

3. „Test już to pokrywa" — NIE. `grep -rln "threading|ThreadPool|concurrent.futures|asyncio.gather" backend/tests/` → ZERO plików. Jedyny spec dotykający tej końcówki (frontend/e2e/industrial-template-mass-flow.spec.ts:272-296) wykonuje 50 wywołań ŚCIŚLE SEKWENCYJNIE w pętli `for`.

4. „To znany dług z rejestru" — NIE. Przeczytałem V12K-289..304. Jedyny wpis o współbieżności (linia 94) dotyczy INNEGO magazynu — blokady zapisu SQLite artefaktów biegu („database is locked"), naprawionej trybem WAL + busy_timeout. Trafienia „WYSCIG" (linie 157, 254) to wyścigi w testach FRONTENDU. Zero wpisu o magazynie ENM.

5. „Ścieżka nieosiągalna z produktu" — NIE. `applyStationTemplate` (frontend/src/ui/network-build/station-templates/api.ts:160) jest wołane z `StationTemplateWizard.tsx:244` (kreator w przestrzeni Model), a końcówka jest zarejestrowana w main.py:146.

6. „Endpoint i tak jest serializowany" — NIE, i to jest sedno. Statyczny przegląd AST WSZYSTKICH końcówek piszących do magazynu ENM: 6 z 7 to `async def` z DOKŁADNIE ZERO punktami `await` między odczytem a zapisem (put_enm, topology_ops, topology_ops_batch, wizard_apply_step, domain_ops, create_der_generator, set_der_bindings) — te pętla zdarzeń przypadkiem serializuje. JEDYNY pisarz zdefiniowany jako `def` (a więc oddawany przez Starlette do puli wątków) to `apply_station_template` (api/station_templates.py:173). Deployment potwierdza założenie: backend/Dockerfile:41 uruchamia uvicorn z domyślnym JEDNYM workerem, więc ta jedna końcówka jest jedynym miejscem realnej równoległości — i dokładnie tam siedzi cykl odczyt-modyfikacja-zapis bez blokady.

REPRODUKCJA NIEZALEŻNA (inna uprząż niż u zgłaszającego: httpx.ASGITransport na realnym `api.main:app`, ENM_STORE_DIR w /tmp; sonda /tmp/obalanie/probe.py i /tmp/obalanie/probe4.py, poetry env backendu). Za PIERWSZYM razem:
- 2 równoległe zastosowania na dwóch różnych odcinkach: oba HTTP 200, `utworzone=12` każde, a model: „stacje=2 (delta 1, oczekiwane +2), rewizja 4 -> 6"; stacja zadania A nieobecna, 12 z 12 jej elementów nieobecnych. Oba żądania trwały 1077 i 1080 ms i zakończyły się w tej samej sekundzie — dowód faktycznej równoległości (przy serializacji drugie trwałoby ~2,1 s).
- 4 próby po 4 równoległe żądania (świeży przypadek każda): za każdym razem delta stacji = 1 zamiast 4, rewizja 6->10. Próby 3 i 4: WSZYSTKIE 4 żądania HTTP 200, a 3 z 4 stacji nie istnieją w modelu (36 zgłoszonych elementów to fikcja).
- Wariant drugi odtworzony w 2 z 4 prób: HTTP 422 `template.persist_failed` z komunikatem „Błąd zapisu snapshot: [Errno 2] No such file or directory: …<digest>.tmp -> …<digest>.json" (próba 1, dwa żądania) oraz „…<digest>.dziennik.tmp -> …<digest>.dziennik.json" (próba 2) — kolizja WSPÓLNEJ ścieżki tymczasowej z enm/store.py:70,82 i enm/dziennik_zmian.py:145,154.

CO ZGŁASZAJĄCY OPISAŁ NIEŚCIŚLE (poprawione w scenariuszu):
- Wpisy dziennika dla TEJ ścieżki mają `operacja=None` i PUSTE listy elementów (apply.py:287 woła `_set_enm` bez `zrodlo_zmiany`), więc nie „pokazują dwóch zmian z elementami" — pokazują dwie zmiany BEZ przyczyny. Za to odsłoniłem gorszy skutek, którego zgłaszający nie nazwał: DZIURY w dzienniku. Odczyt pliku dziennika próby 1: wpisy dla rewizji [2,3,4,5,6,8,10] — rewizje 7 i 9 POWSTAŁY w modelu, ale nie mają ŻADNEGO wpisu (wyjątek z store.py:150 leci przed `dopisz` z linii 151). Dziennik istnieje po to, by odpowiedzieć „która zmiana unieważniła mój wynik" (V12K-264) — z dziurami nie odpowiada.
- Framing „magazyn ENM nie ma żadnej ochrony" jest strukturalnie prawdziwy, ale operacyjnie za szeroki: realnie wywraca się JEDNA końcówka (patrz pkt 6).
- „Dwukrotny klik w kreatorze" NIE jest wyzwalaczem — przycisk ma `disabled={applying || applyResult != null}` (StationTemplateWizard.tsx:381). Zostają: dwie karty/dwóch projektantów na tym samym przypadku oraz dowolny klient API (backend nie ma uwierzytelniania ani izolacji sesji, a `_enm_store` jest kluczowany wyłącznie po `case_id`).

WNIOSEK: defekt się broni. Reguła domu złamana wprost — API melduje sukces operacji, której skutek nie istnieje (fabrykacja wyniku), a w wariancie 422 melduje błąd zapisu po tym, jak żywy model już awansował o rewizję (rewizja +4 przy tylko 2 odpowiedziach 200 w próbie 1).

**Scenariusz po korekcie sceptyka:** TYTUŁ: Równoległe zastosowania szablonu stacji gubią całe operacje — jedyna synchroniczna końcówka pisząca do magazynu ENM robi odczyt-modyfikacja-zapis bez blokady, a API melduje sukces nieistniejącej stacji

MIEJSCE (pliki bezwzględne):
- /home/user/MV-Design-PRO/mv-design-pro/backend/src/enm/store.py:137-150 — `set_enm`: odczyt `existing = _enm_store.get(case_id)` (137), wyliczenie rewizji (145-146), podmiana wpisu w globalnym słowniku (149), zapis pliku (150). Zero serializacji.
- /home/user/MV-Design-PRO/mv-design-pro/backend/src/api/station_templates.py:172-176 — `def apply_station_template` (NIE `async def`): Starlette oddaje ją do puli wątków, więc dwa żądania biegną naprawdę równolegle. To JEDYNY taki pisarz — pozostałych 6 końcówek piszących ENM (api/enm.py:134,420,484,666,762; api/generators.py:431,488) to `async def` z zerem punktów `await` między odczytem a zapisem, więc pętla zdarzeń przypadkiem je serializuje (Dockerfile:41 = jeden worker uvicorna).
- /home/user/MV-Design-PRO/mv-design-pro/backend/src/application/station_templates/apply.py:285-296 — `saved = _set_enm(case_key, new_enm)` wewnątrz `try`, którego `except` zamienia KAŻDY wyjątek na HTTP 422 `template.persist_failed`.
- /home/user/MV-Design-PRO/mv-design-pro/backend/src/enm/store.py:70,82 oraz /home/user/MV-Design-PRO/mv-design-pro/backend/src/enm/dziennik_zmian.py:145,154 — WSPÓLNA dla przypadku ścieżka tymczasowa `<digest>.tmp` / `<digest>.dziennik.tmp` + `replace()`.

WEJŚCIE/STAN: dwóch projektantów (albo dwie karty przeglądarki jednego, albo dowolny klient API — backend nie ma uwierzytelniania ani izolacji sesji, a `_enm_store` jest kluczowany wyłącznie po `case_id`) ma otwarty TEN SAM przypadek obliczeniowy i w tej samej chwili zatwierdza wstawienie stacji z szablonu na dwóch RÓŻNYCH odcinkach magistrali.

ZŁY SKUTEK — WARIANT 1 (cicha utrata pracy, częstszy):
Oba żądania kończą się HTTP 200 z `station_ref` i listą 12 utworzonych elementów, kreator melduje „wykonano", a w modelu przybywa TYLKO JEDNA stacja. 12 elementów drugiego projektanta nie istnieje — jego ekran pokazuje referencje, których GET /api/cases/{id}/enm nie zna. Licznik rewizji rośnie o 2 (wygasza wyniki obu), ale odtworzyć da się tylko jedną zmianę.

ZŁY SKUTEK — WARIANT 2 (kłamliwy błąd, rzadszy):
Jedno z żądań kończy się HTTP 422 `template.persist_failed` z komunikatem „Błąd zapisu snapshot: [Errno 2] No such file or directory: …<digest>.tmp -> …<digest>.json" (albo „…<digest>.dziennik.tmp -> …"). Komunikat mówi „nie zapisano", ale `_enm_store[case_id] = enm` (store.py:149) już podmienił żywy model i rewizja już awansowała. Dodatkowo komunikat w polu `message_pl` wypycha inżynierowi bezwzględną ścieżkę systemu plików.

ZŁY SKUTEK — WARIANT 3 (dziury w dzienniku zmian):
Gdy wyjątek pada na store.py:150, `dopisz_do_dziennika` z linii 151 nie wykonuje się w ogóle. Dziennik dostaje LUKĘ: rewizja istnieje w modelu, ale nie ma dla niej wpisu. Zmierzone: wpisy dla rewizji [2,3,4,5,6,8,10] przy rewizji bieżącej 10 — brak 7 i 9. Dziennik istnieje dokładnie po to, by odpowiedzieć „która zmiana unieważniła mój wynik" (V12K-264); z dziurami nie odpowiada. (Uwaga: wpisy z tej ścieżki mają `operacja=None` i puste listy elementów, bo apply.py:287 woła `_set_enm` bez `zrodlo_zmiany` — projektant widzi „zmiana bez zarejestrowanej operacji", nie fałszywą listę elementów.)

DOWÓD WYKONANY (sondy /tmp/obalanie/probe.py i /tmp/obalanie/probe4.py, httpx.ASGITransport na realnym `api.main:app`, ENM_STORE_DIR w /tmp, venv poetry backendu; sieć budowana realnymi wywołaniami domain-ops):
- 2 równoległe zastosowania `tpl_bess_1mw_2mwh` na dwóch odcinkach: „zadanie A: HTTP 200 utworzone=12 / zadanie B: HTTP 200 utworzone=12", stan modelu „stacje=2 (delta 1, oczekiwane +2), rewizja 4 -> 6", stacja zadania A obecna w modelu: False, brakujących elementów 12 z 12. Czasy 1077 ms i 1080 ms z zakończeniem w tej samej sekundzie = faktyczna równoległość (przy serializacji drugie żądanie trwałoby ~2,1 s).
- 4 próby po 4 równoległe żądania na świeżych przypadkach: ZA KAŻDYM RAZEM delta stacji = 1 zamiast 4, rewizja 6 -> 10. Próby 3 i 4: wszystkie 4 żądania HTTP 200, 3 z 4 stacji nieobecne w modelu (36 zgłoszonych elementów fikcyjnych). Próba 1: 2× HTTP 422 z kolizją `<digest>.tmp`; próba 2: 1× HTTP 422 z kolizją `<digest>.dziennik.tmp`. W próbie 1 rewizja awansowała o 4 mimo tylko 2 odpowiedzi 200 — dowód, że żądania kończące się błędem i tak zmieniły żywy model.

BRAK OCHRONY I BRAK BRAMKI: w całym `backend/src` nie ma ani jednego prymitywu synchronizacji (grep na threading/Lock/RLock/asyncio.Lock/filelock/fcntl = 0 trafień); `ApplyTemplateRequest` (api/station_templates.py:42-49) nie ma `snapshot_base_hash`, więc bramka 409 z domain-ops (api/enm.py:781-790) tej ścieżki nie chroni; w `backend/tests` nie ma ani jednego testu współbieżnego (grep na threading/ThreadPool/concurrent.futures/asyncio.gather = 0 plików), a jedyny spec dotykający tej końcówki (frontend/e2e/industrial-template-mass-flow.spec.ts:272-296) wykonuje 50 wywołań ściśle sekwencyjnie — bramka nie może się zapalić na defekcie, który miałaby chronić.

### D5 [krytyczna] Bramka gotowości kłamie po każdym biegu: wczytanie migawki przebiegu wpisuje do jedynej prawdy gotowości zaszyte „ready: true, blockers: [], warnings: []”

**Miejsce:** mv-design-pro/frontend/src/ui2/legacy/useLegacyOrchestrator.ts:273-303 (blok readiness w liniach 279-283), wołane z tego samego pliku:498; konsument: mv-design-pro/frontend/src/ui2/spaces/gotowosc/adapters/gotowoscAdapter.ts:120-124 i 173-180 przez mv-design-pro/frontend/src/ui/topology/snapshotStore.ts:464-478

**Na czym polega:** `createAnalysisRunSnapshotEnvelope` opakowuje migawkę ENM przebiegu w `DomainOpResponseV1` i FABRYKUJE w niej pole gotowości: `readiness: { ready: true, blockers: [], warnings: [] }` oraz `fix_actions: []` — wartości zaszyte w kodzie, nikt ich nie liczy. Ta koperta idzie do `useSnapshotStore.setSnapshot`, a `snapshotStore.readiness` jest — po karcie KD-1/V12K-289 — JEDYNĄ prawdą gotowości dla panelu „Gotowość”, chipów paska przypadku („Model: zwalidowany”, „Gotowość”), liczników blokad w drzewie topologii, pasków budowy sieci, panelu luk danych i warunku możliwości obliczeń. Wywołanie następuje automatycznie po każdym zakończonym biegu (lądowanie na `#analysis?run=…`) oraz przy każdym wejściu/przeładowaniu na głęboki link przebiegu. Dług nazwany w V12K-286/289 dotyczył USUNIĘTEGO `readinessLiveStore`; to jest osobne, żywe źródło tego samego kłamstwa, wstrzykujące je do store’u, na którym KD-1 skoncentrowało wszystkich czytelników.

**Scenariusz awarii:** Projekt „Nowa sieć SN” z samym GPZ (bez odbiorów i generatorów). Przed obliczeniem: chip „Gotowość: 1 ostrzeżenie”, panel Gotowość „BLOKADY 0 / OSTRZEŻENIA 1 — Brak odbiorów i generatorów — rozpływ mocy będzie pusty” z akcją „Napraw…”. Inżynier uruchamia zwarcie 3F. Po biegu (i tak samo po przeładowaniu strony na linku przebiegu) model jest NIEZMIENIONY (rew. 2, ten sam hash), a aplikacja pokazuje: chip „Gotowość: brak uwag”, „Model: zwalidowany”, panel Gotowość „BLOKADY 0 / OSTRZEŻENIA 0 — Gotowe do analiz — Kontrola techniczna układu nie wskazuje braków — można uruchomić obliczenia”. Ostrzeżenie zniknęło razem z akcją naprawczą. Inżynier idzie po zielonej bramce do rozpływu mocy — dostaje twardy błąd z backendu („Analiza rozpływu mocy nie jest dostepna dla biezacego snapshotu ENM”, HTTP 409), bo backend cały czas wie, że `analysis_available.load_flow = false`. Ten sam mechanizm gasi BLOKADY, więc po wczytaniu migawki starego przebiegu przy modelu, który zdążył się zepsuć, chrom deklaruje zwalidowany model, którego nikt nie zwalidował.

**Dowód zgłaszającego:** Przejście wykonane na żywej aplikacji (Playwright, /tmp/flow/s25.mjs, s31.mjs). Pomiar UI: PRZED biegiem „BLOKADY: 0 OSTRZEŻENIA: 1”, chip „Gotowość: 1 ostrzeżenie”; PO biegu „BLOKADY: 0 OSTRZEŻENIA: 0 / Gotowe do analiz”, chip „Gotowość: brak uwag”. Po przeładowaniu strony na `#analysis?case=…&run=…` chipy: „Model: zwalidowany ; Gotowość: brak uwag ; Wyniki: aktualne ; Model: rew. 2” (zrzut /tmp/flow/s31-po-przeladowaniu.png). Kontrola u źródła prawdy — backend dla TEGO SAMEGO przypadku po biegu: `curl http://127.0.0.1:19300/api/cases/76203a8b-d854-4e7a-82ef-2942e0d205c0/enm/readiness` → `"enm_revision":2`, `"status":"WARN"`, `{"code":"W003","severity":"IMPORTANT","message_pl":"Brak odbiorów i generatorów — rozpływ mocy będzie pusty."}`, `"analysis_available":{..."load_flow":false}`. Reguła W003 jest czystą funkcją modelu (backend/src/enm/validator.py:702-717: `if not enm.loads and not enm.generators`), więc bieg nie mógł jej spełnić. Podsłuch sieci po biegu (/tmp/flow/s27.mjs, s28.mjs): ŻADNA odpowiedź API nie niosła pola `readiness` — wartość 0 ostrzeżeń powstała wyłącznie w przeglądarce, z literału w useLegacyOrchestrator.ts:279-283. Próba rozpływu po zielonej bramce: `409 POST /api/execution/study-cases/…/runs` (/tmp/flow/s30-rozplyw.png).

**Werdykt sceptyka (nie obalono):** PRÓBA OBALENIA NIEUDANA — defekt potwierdzony wykonaniem. Sprawdziłem pięć dróg obalenia, żadna nie zadziałała.

1) „Ścieżka nieosiągalna / wyżej stoi walidacja" — NIE. `restoreAnalysisRunSnapshot` jest wołane z CZTERECH gałęzi efektu trasowego (useLegacyOrchestrator.ts:875 trasa SLD, :914 lądowiska wygaszone, :931 `#analysis` i aliasy, :965 `#report`), zawsze gdy `isUuid(routeRunId)`. Jedyne bramki przed zapisem to `isEnergyNetworkModel` (:240) i `hasTopologicalContent` (:253). Odpaliłem obie predykaty na PRAWDZIWEJ odpowiedzi backendu dla przypadku „sam GPZ" — obie `true`. Gałąź wykonuje `setSnapshotFromResponse(createAnalysisRunSnapshotEnvelope(...))` (:497-499).

2) „Wyżej stoi prawdziwa gotowość / coś ją odtwarza po biegu" — NIE. W całym froncie są DOKŁADNIE trzy wołania `refreshFromBackend` (jedyna droga do prawdziwego `readiness`): `ui/topology/store.ts:101` (po udanej operacji topologicznej), `WorkspaceSurfaceRouter.tsx:1590` (po `StationBatchPlanner`) i `useHydratacjaPowloki.ts:132` — a to ostatnie jest pod warunkiem `!migawka.snapshot && !migawka.loading && migawka.error != null` (:131), więc po zapisie koperty (snapshot ≠ null) NIE odpali; przy zimnym wejściu na deep-link też nie (error == null). Żaden tor zakończenia biegu nie odświeża gotowości. Zmyślona wartość zostaje w store aż do następnej operacji domenowej.

3) „Kontrakt gwarantuje typ / backend dosyła readiness" — NIE. Uruchomiłem backend (uvicorn, port 19311). `GET /api/analysis-runs/{run}/snapshot` zwraca klucze najwyższego poziomu DOKŁADNIE `['run_id','snapshot','snapshot_id']` — pola `readiness` ani `fix_actions` NIE MA (potwierdzone także w kodzie: `api/analysis_runs.py:110-121`). Wartość „0 ostrzeżeń" powstaje wyłącznie z literału w `useLegacyOrchestrator.ts:281-285`.

4) „Test/bramka już to pokrywa" — NIE. `grep` po całym froncie: `createAnalysisRunSnapshotEnvelope` występuje wyłącznie w dwóch miejscach produkcyjnych (definicja :273, wołanie :498) — ZERO testów. `scripts/readiness_codes_guard.py` RC=0 i `scripts/readiness_consumption_guard.py` RC=0 (pod poetry) — obie sprawdzają, czy kod gotowości ma DROGĘ do projektanta, żadna nie sprawdza, czy store gotowości nie zostaje nadpisany pustką. Bramka nie może się zapalić na defekcie, który miałaby chronić.

5) „To świadomy zamysł opisany w rejestrze / znany dług" — NIE. `grep` po `docs/v12xx/REJESTR_KONFLIKTOW.md`: ani `createAnalysisRunSnapshotEnvelope`, ani ten literał nie występują. V12K-286 i V12K-289 (KD-1) dotyczą USUNIĘTEGO `readinessLiveStore` — i to one przepięły WSZYSTKICH czytelników na `useSnapshotStore.readiness`, przez co ten stary literał (wprowadzony w 2274d723, ekstrakcja z App.tsx — `git log -S` potwierdza jedyny commit) stał się dziś jedynym źródłem tego samego kłamstwa. To osobne, żywe znalezisko, nie powtórka.

DOWÓD WYKONANY (nie cytat z kodu):
A) Backend, żywa instancja. Projekt + przypadek + `add_grid_source_sn` (katalog `src-gpz-15kv-250mva-rx010`). Odpowiedź operacji domenowej: `readiness = {ready:true?, blockers:[], warnings:[W002, W003]}`, `fix_actions` = 2. `GET /api/cases/{id}/enm/readiness` PRZED biegiem: `enm_revision: 2`, `status: WARN`, issues W002 (IMPORTANT), W003 (IMPORTANT), I004 (INFO).
B) Bieg SC_3F: `POST /api/execution/study-cases/{id}/runs` → 201, `POST /api/execution/runs/{id}/execute` → 200 `DONE`.
C) PO biegu backend bez zmian: `enm_revision: 2`, `status: WARN`, te same W002 + W003. `snapshot.header.hash_sha256` = `f4e289d4ab57a563…` identyczny przed i po. Reguła W003 to czysta funkcja modelu (`backend/src/enm/validator.py:702-717`: `if not enm.loads and not enm.generators`) — bieg nie mógł jej spełnić.
D) SONDA NA PRODUKCYJNYM KODZIE. Zwierciadło frontu w /tmp/probe-fe (repozytorium NIETKNIĘTE — `git status` czysty), test montujący PRAWDZIWY hook `useLegacyOrchestrator` i podający mu PRAWDZIWE odpowiedzi backendu (zrzut fixture z instancji 19311), hash `#analysis?case=…&run=…`. Wynik (vitest, 1 passed):
   PRZED → `{"ready":false,"blokady":0,"ostrzezenia":2}`, kody `W002,W003`
   PO    → `{"ready":true,"blokady":0,"ostrzezenia":0}`, kody `[]`, `readiness: {"ready":true,"blockers":[],"warnings":[]}`
   MODEL → rev 2, hash `f4e289d4ab57a563` (NIEZMIENIONY)
   Liczby liczone przez PRODUKCYJNE `podsumujGotowosc` i `polaczGotowosc` z `gotowoscAdapter.ts`.
E) Skutek dla inżyniera potwierdzony u źródła: `POST /api/execution/study-cases/{id}/runs {"analysis_type":"LOAD_FLOW"}` → **HTTP 409** `{"detail":"Analiza rozpływu mocy nie jest dostepna dla biezacego snapshotu ENM"}`; `GET /api/cases/{id}/analysis/eligibility` → `load_flow: eligible:false`.

ZASIĘG KŁAMSTWA (grep czytelników `useSnapshotStore.readiness`): `shellStatus.ts:79-91` — `modelValidated = projectPresent && gotowosc.ready` → chip „Model: zwalidowany" (`shell/strings.ts:50`) i „Gotowość: brak uwag" (`strings.ts:97`); `PanelGotowosci.tsx:60-61` + `gotowoscAdapter.ts:142-143` → stan `wszystko-gotowe` → „Gotowe do analiz" (`gotowosc/strings.ts:24`); `topologyTreeAdapter.ts:175` (liczniki blokad w drzewie); `networkBuildStore.ts:1389` (`buildPhase`/`readinessVisualState`); `WorkspaceOperationalBar.tsx:91`; `DataGapPanel.tsx:290`; `liveReadiness.ts:59-77`; `ReadinessBlockersReview.tsx:66`; `InspectorEngineeringView.tsx:2424`.

KOREKTY WOBEC ZGŁOSZENIA (drobne, nie zmieniają istoty): literał jest w liniach **281-285** (nie 279-283), funkcja 273-304; `setSnapshot` w `snapshotStore.ts:460-472` (przypisanie `readiness: response.readiness` w :465); `podsumujGotowosc` w `gotowoscAdapter.ts:172-178`, `useStanGotowosci` w :140-143. Znikają **DWA** ostrzeżenia (W002 „brak składowej zerowej Z₀ — zwarcia 1F/2F-Z niedostępne" i W003), nie jedno — razem z dwiema akcjami naprawczymi. Naruszona reguła domu: „zakaz fabrykacji — wartość zmyślona zamiast kodu gotowości".

**Scenariusz po korekcie sceptyka:** SCENARIUSZ (odtworzony wykonaniem, backend na porcie 19311 + sonda na produkcyjnym hooku):

KROK 1 — model. Projekt „Nowa sieć SN", przypadek, jedna operacja domenowa `add_grid_source_sn` (GPZ 15 kV, Sk3 250 MVA, wiązanie katalogowe `ZRODLO_SN/src-gpz-15kv-250mva-rx010@2024.1`). Model: 1 źródło, 2 szyny, 0 odbiorów, 0 generatorów. Rewizja 2, `hash_sha256` = f4e289d4ab57a563….

KROK 2 — stan PRZED (prawda backendu i to, co widzi inżynier). `GET /api/cases/{case}/enm/readiness` → `enm_revision: 2`, `status: WARN`, issues: W002 IMPORTANT („Źródło … nie ma składowej zerowej (Z₀) — zwarcia 1F/2F-Z niedostępne."), W003 IMPORTANT („Brak odbiorów i generatorów — rozpływ mocy będzie pusty."), I004 INFO. Odpowiedź operacji domenowej niesie te same 2 ostrzeżenia i 2 `fix_actions`, i to ona zasila `useSnapshotStore.readiness`. Chrom: „Gotowość: 2 ostrzeżenia". Panel „Gotowość": BLOKADY 0 / OSTRZEŻENIA 2, obie pozycje z akcją naprawczą (SourceModal / LoadModal). Pomiar sondy: `podsumujGotowosc` → {ready:false, blokady:0, ostrzezenia:2}; `polaczGotowosc` → [W002, W003].

KROK 3 — bieg. Inżynier uruchamia zwarcie 3F: `POST /api/execution/study-cases/{case}/runs {"analysis_type":"SC_3F"}` → 201; `POST /api/execution/runs/{run}/execute` → 200, status `DONE`. Aplikacja ląduje na `#analysis?case=…&run=…`.

KROK 4 — moment kłamstwa. Efekt trasowy w `mv-design-pro/frontend/src/ui2/legacy/useLegacyOrchestrator.ts:931` woła `restoreAnalysisRunSnapshot`. Ten pobiera `GET /api/analysis-runs/{run}/snapshot` — odpowiedź ma klucze WYŁĄCZNIE `run_id`, `snapshot_id`, `snapshot` (bez `readiness`, bez `fix_actions`; `backend/src/api/analysis_runs.py:110-121`). Obie bramki frontu przechodzą (`isEnergyNetworkModel` :240, `hasTopologicalContent` :253 — zmierzone `true` na tym payloadzie), więc linia :497-499 zapisuje do store'u kopertę z `createAnalysisRunSnapshotEnvelope`, w której linie **281-285** wpisują literał `readiness: { ready: true, blockers: [], warnings: [] }` i `fix_actions: []`. `snapshotStore.setSnapshot` (`mv-design-pro/frontend/src/ui/topology/snapshotStore.ts:460-472`, przypisanie w :465) nadpisuje `readiness` tą pustką. Model pozostaje TEN SAM: rewizja 2, hash f4e289d4ab57a563….

KROK 5 — stan PO (zmierzony sondą na produkcyjnym hooku). `useSnapshotStore.readiness` = {ready:true, blockers:[], warnings:[]}. `podsumujGotowosc` → {ready:true, blokady:0, ostrzezenia:0}; `polaczGotowosc` → lista PUSTA. Skutki widoczne dla inżyniera: chip „Model: zwalidowany" (`ui2/shell/shellStatus.ts:79-91` + `shell/strings.ts:50`), chip „Gotowość: brak uwag" (`shell/strings.ts:97`), panel „Gotowość" w stanie `wszystko-gotowe` → „Gotowe do analiz" (`ui2/spaces/gotowosc/adapters/gotowoscAdapter.ts:142-143` + `gotowosc/strings.ts:24`), liczniki blokad w drzewie topologii wyzerowane, pasek budowy sieci w fazie gotowej. Oba ostrzeżenia zniknęły razem z akcjami naprawczymi.

KROK 6 — koszt. Inżynier idzie po zielonej bramce do rozpływu mocy: `POST /api/execution/study-cases/{case}/runs {"analysis_type":"LOAD_FLOW"}` → **HTTP 409** „Analiza rozpływu mocy nie jest dostepna dla biezacego snapshotu ENM" (`GET /api/cases/{case}/analysis/eligibility` cały czas: `load_flow eligible:false`). Backend nigdy nie zmienił zdania — zmieniła je wyłącznie przeglądarka.

WARIANT GORSZY (zimny deep-link). Po przeładowaniu strony na `#analysis?case=…&run=…` koperta z literałem jest JEDYNĄ rzeczą, która zasila `useSnapshotStore` — hydratacja powłoki (`ui2/shell/useHydratacjaPowloki.ts:131-133`) odświeża z backendu tylko przy `error != null`, a w całym froncie istnieją zaledwie trzy wołania `refreshFromBackend` (`ui/topology/store.ts:101` po operacji topologicznej, `WorkspaceSurfaceRouter.tsx:1590` po StationBatchPlanner, oraz wspomniana hydratacja). Skutkiem `blockers: []` w literale: po wczytaniu migawki starego przebiegu przy modelu, który zdążył się zepsuć (realne BLOKADY), chrom deklaruje „Model: zwalidowany", a panel „Gotowe do analiz" — modelu, którego nikt nie zwalidował.

DLACZEGO ŻADNA BRAMKA TEGO NIE ŁAPIE: `createAnalysisRunSnapshotEnvelope` nie ma ani jednego testu (jedyne wystąpienia w repo to definicja :273 i wołanie :498); `readiness_codes_guard.py` (RC=0) i `readiness_consumption_guard.py` (RC=0) sprawdzają wyłącznie, czy kod gotowości ma drogę do projektanta — nie, czy store gotowości nie zostaje nadpisany zmyśloną pustką.

### D6 [wysoka] Optymalizacja zaczepów „jak najmniej przełączeń" stosuje ZASZYTE pasmo akceptacji ±5 % U_cel, którego nie ma w żadnym wejściu ani w wywodzie — a wywód wprost twierdzi „bez heurystyk"; bez podanego U_cel kryterium napięciowe znika bez śladu

**Miejsce:** /home/user/MV-Design-PRO/mv-design-pro/backend/src/network_model/solvers/power_flow_oltc_studies.py:515-520 (warunek `feasible`, stała `0.05 * target_kv` w wierszu 519); wywód: :599-613; deklaracja „enumeracja dokladna, bez heurystyk": :578-581; ścieżka wywołania: /home/user/MV-Design-PRO/mv-design-pro/backend/src/enm/canonical_analysis.py:1316-1323

**Na czym polega:** W `optimize_tap_positions` dla celu `minimize_switching` funkcja celu to J(n)=|n-n0|, więc o wyniku decyduje wyłącznie to, które pozycje uznano za dopuszczalne. Dopuszczalność liczy wiersz 519: `deviation is None or target_kv is None or deviation <= 1e-9 + 0.05 * target_kv`. Stała 0,05 (±5 % napięcia celu) nie pochodzi z żadnego parametru wejściowego, nie ma odniesienia normatywnego, nie występuje w `OptimizationResult`, nie występuje w polu `assumptions` (którego ten wynik w ogóle nie ma) i nie występuje w żadnym kroku `wywod`. To jest dokładnie „nieudokumentowana korekta/heurystyka" zakazana regułą WHITE BOX i regułą #9. Co gorsza, ten sam wywód (wiersz 578-581) zapewnia inżyniera: „optymalizacja pozycji zaczepu przez pelny przeglad pozycji (enumeracja dokladna, bez heurystyk)". Drugi człon warunku (`target_kv is None`) powoduje, że przy braku napięcia celu kryterium napięciowe znika CAŁKOWICIE — wszystkie zbieżne pozycje stają się dopuszczalne, zwycięża pozycja początkowa (J=0), a wynik nie niesie żadnego kodu gotowości ani noty; wywód kończy się zdaniem „Wynik: najlepsza pozycja n* = 0", czyli fabrykuje werdykt. Trzeci człon (`deviation is None`) daje ten sam efekt, gdy szyna regulowana nie ma napięcia w rozwiązaniu.

**Scenariusz awarii:** Inżynier otwiera ekran „Regulacja napięcia zaczepami (OLTC)" (frontend/src/ui2/wyniki/oltc/strings.ts:21 — „Jak najmniej przełączeń"), wpisuje w pole „Napięcie, które chcemy utrzymać" 15,75 kV i uruchamia badanie. Sieć przy pozycji bieżącej n=0 daje na szynie 16,40 kV (0,65 kV = 4,13 % ponad cel). Program odpowiada „najlepsza pozycja n* = 0, liczba przełączeń 0" — czyli „nie ruszaj zaczepu" — bo 4,13 % mieści się w niewidocznym pasmie 5 %. Inżynier nie ma jak zobaczyć, że jego cel 15,75 kV został po cichu rozmyty do przedziału 14,96–16,54 kV, i zostawia GPZ z napięciem 4 % powyżej zadanego. Wariant drugi: gdy pole napięcia celu zostanie puste (`oltc_target_kv` nie trafia do run_options), badanie zwraca ten sam werdykt „n* = 0, 0 przełączeń" nie sprawdziwszy napięcia w ogóle — i nadal nazywa go najlepszą pozycją.

**Dowód zgłaszającego:** Sonda uruchomiona na HEAD: zbudowałem transformator 110/15,75 kV z OLTC (zakres -2..+2, krok 1,5 %) i zastępczy `solve_once` zwracający U(n) = {-2:15.90, -1:16.15, 0:16.40, +1:16.65, +2:16.90} kV, po czym wywołałem `optimize_tap_positions(..., objective='minimize_switching', target_kv=15.75)`. Wynik:
  n=-2 U=15.900 |dU|=0.150 (0.95 %) dopuszczalna=True
  n=-1 U=16.150 |dU|=0.400 (2.54 %) dopuszczalna=True
  n=+0 U=16.400 |dU|=0.650 (4.13 %) dopuszczalna=True
  n=+1 U=16.650 |dU|=0.900 (5.71 %) dopuszczalna=False
  n=+2 U=16.900 |dU|=1.150 (7.30 %) dopuszczalna=False
  -> best_position = 0 | switch_count = 0 | U wybrana = 16.4 kV
Granica przechodzi dokładnie między 4,13 % a 5,71 % — to jest zaszyte 0,05·U_cel. Przeszukanie zserializowanego `to_dict()` (wynik + wywód) na obecność progu: '0.05'->False, '5 %'->False, '5%'->False, 'pasm'->False, 'dopuszcz'->False, 'tolerancj'->False. Próg nie istnieje nigdzie w kontrakcie wyniku.
Drugi bieg tej samej sondy z `target_kv=None`: dopuszczalne = [True, True, True, True, True], best_position = 0, switch_count = 0, a wywód zawiera wyłącznie kroki „Wzor: funkcja celu minimalizacji przelaczen", „Podstawienie ... J = 0", „Wynik: najlepsza pozycja n* = 0" — ani jednego kroku o braku kryterium napięciowego (gałąź „uczciwy brak, bez fabrykacji" z wiersza 641-646 nie odpala, bo `best` nie jest None).

**Werdykt sceptyka (nie obalono):** Nie udało się obalić — defekt odtworzony na REALNYM solverze Newtona (nie na atrapie zgłaszającego), a wszystkie pięć prób obalenia upadło.

1) ŚCIEŻKA OSIĄGALNA. Opcja „Jak najmniej przełączeń" istnieje w UI (frontend/src/ui2/wyniki/oltc/strings.ts:21), ekran jest zamontowany (ui2/spaces/wyniki/WynikiWarsztat.tsx:319 + creator-harness-main.tsx:3858), model żądania niesie cel i napięcie (oltcBadaniaModel.ts:108-112), a backend przyjmuje je bez walidacji (enm/canonical_analysis.py:1315-1324, gołe `run_options.get("oltc_target_kv")`).

2) BRAK WALIDACJI U GÓRY. EkranBadanOltc.tsx:92-99 podaje `PoleLiczbowe` BEZ propsa `wymagane`, a ui2/kreatory/rama/pola.tsx:139-146 zwraca `null` przy pustym polu. Wyczyszczenie pola napięcia to zwykły ruch użytkownika → `oltc_target_kv=null` → `target_kv=None` → drugi człon warunku z wiersza 519 kasuje kryterium napięciowe w całości.

3) BRAK ZAMYSŁU W DOKUMENTACH. Przeszukałem docs/plan/OLTC_ARCHITEKTURA_2026-07.md wzorcem `0.05|5 %|5%|pasm|toleranc|dopuszczal|feasible` — trafienia dotyczą wyłącznie pasma nieczułości PĘTLI AVR (§2, pole `deadband_kv`), nie kryterium dopuszczalności §17. Wpis G3 (wiersz 243) opisuje §17 jako „enumeracja EXACT ... deterministyczne rozstrzyganie remisów" — o paśmie ani słowa. Wpisy rejestru V12K-045 i V12K-046 też milczą; żaden z V12K-289..304 nie dotyczy OLTC.

4) ŻADEN TEST NIE PRZYPINA PROGU. tests/network_model/solvers/test_power_flow_oltc_studies.py:116-128 (`test_minimize_switching_prefers_initial_when_feasible`) uruchamia się z target_kv=14,0; POMIAR: U(n=0)=13,8073 kV, |dU|=0,1927 kV = 1,38 % U_cel. Test przeszedłby dla DOWOLNEGO progu > 1,38 % — czyli bramka nie może się zapalić na zmianie stałej 0,05, którą rzekomo chroni. Komentarz w teście („Wide voltage tolerance") jest jedynym śladem istnienia pasma i nie mówi, ile ono wynosi.

5) PASMO NIE POCHODZI Z MODELU (najmocniejszy dowód). Sonda A/B na realnym solverze: przy `deadband_kv` ∈ {0,05; 0,2; 1,0; 5,0} kV zbiór pozycji dopuszczalnych jest IDENTYCZNY ([-3,-2,-1,0,1,2,3,4]) i `best_position` identyczny (-3); przy `voltage_setpoint_kv` ∈ {15,0; 15,75; 20,0} kV wynik również identyczny (best=-3, switch=0). Kanoniczny obiekt `TapChanger` MA pole pasma (`deadband_kv`) i pole napięcia zadanego — solver §17 ignoruje oba i podstawia literał 0,05·U_cel, ok. 4× szerszy niż domyślne pasmo modelu (0,2 kV / 15,75 kV = 1,27 %).

POMIAR GRANICY (realny Newton, 110/15 kV, S=25 MVA, uk=12 %, obciążenie 10 MW/5 Mvar, slack 1,08 pu, U_cel=15,75 kV, pozycje -4..+4, krok 1,25 %):
  n=-4 |dU|/U_cel = 0,059792 → feasible=False
  n=-3 |dU|/U_cel = 0,045395 → feasible=True
  n=-2 0,031356 True; n=-1 0,017664 True; n=0 0,004303 True; n=+1 0,008738 True; n=+2 0,021470 True; n=+3 0,033906 True; n=+4 0,046055 True
Granica leży dokładnie na 0,05·U_cel — zgodnie z wierszem 519.

BRAK PROGU W KONTRAKCIE. Przeszukanie zserializowanego `OptimizationResult.to_dict()` (wynik + wywód): '0.05'→False, '5 %'→False, '5%'→False, 'pasm'→False, 'dopuszcz'→False, 'toleranc'→False, 'band'→False. Dataklasa (wiersze 443-463) nie ma pola `assumptions` ani żadnego miejsca na próg. Jednocześnie wywód (wiersze 575-578) zapewnia: „enumeracja dokladna, bez heurystyk". To wprost narusza regułę WHITE BOX i regułę #9 (zakaz nieudokumentowanych korekt w solverach).

ŚCIEŻKA BEZ U_CEL. Drugi bieg z `target_kv=None`: dopuszczalne = wszystkie 9 pozycji, best=0, switch_count=0, a pięciokrokowy wywód nie zawiera ANI JEDNEJ wzmianki o braku kryterium napięciowego (gałąź „uczciwy brak, bez fabrykacji" z wierszy 642-648 nie odpala, bo `best` nie jest None).

SPROSTOWANIA DO ZGŁOSZENIA (drobne, nie podważają istoty): (a) liczby zgłaszającego pochodziły z atrapy `solve_once`; realny solver daje inne napięcia, ale tę samą klasę awarii i tę samą granicę 0,05·U_cel; (b) wywód NIE kończy się zdaniem „Wynik: najlepsza pozycja n* = 0" — po nim jest jeszcze krok o rozstrzyganiu remisów; (c) numer wiersza deklaracji „bez heurystyk" to 575-578, nie 578-581; (d) UI POKAZUJE kolumny „Odchyłka U" i „Dopuszczalna" (strings.ts, EkranBadanOltc.tsx:279-281), więc inżynier widzi odchyłkę liczbowo — nie widzi natomiast, JAKIE kryterium zdecydowało o „tak/nie", a nagłówek KPI („Pozycja optymalna", „Wymagane przełączenia") prezentuje werdykt bez zastrzeżenia.

ZNALEZISKO OSTRZEJSZE NIŻ ZGŁOSZONE: przy n0 = -4 program nie mówi „zostaw" — wykonuje DOKŁADNIE JEDNO przełączenie na pozycję -3, która nadal leży 4,54 % od celu, i nazywa ją optymalną. Ruch istnieje wyłącznie po to, żeby wejść tuż pod niewidoczne pasmo.

Sondy: /tmp/oltc_probe.py, /tmp/oltc_probe2.py, /tmp/oltc_probe3.py (uruchamiane `PYTHONPATH=src:. poetry run python ...` z mv-design-pro/backend, HEAD 6946807a). Nie zmieniałem żadnego pliku repozytorium.

**Scenariusz po korekcie sceptyka:** DEFEKT: `optimize_tap_positions` dla celu `minimize_switching` (mv-design-pro/backend/src/network_model/solvers/power_flow_oltc_studies.py:515-520) uznaje pozycję zaczepu za dopuszczalną, gdy odchyłka napięcia mieści się w ZASZYTYM paśmie ±5 % napięcia celu — stała `0.05 * target_kv` w wierszu 519. Stała nie pochodzi z żadnego wejścia (ignoruje `TapChanger.deadband_kv` i `voltage_setpoint_kv` — dowiedzione sondą A/B), nie ma odniesienia normatywnego, nie występuje w `OptimizationResult` (wiersze 443-463 — brak pola `assumptions`) ani w żadnym kroku wywodu, a sam wywód (wiersze 575-578) zapewnia inżyniera: „enumeracja dokladna, bez heurystyk". Człony `deviation is None` i `target_kv is None` w tym samym warunku kasują kryterium napięciowe CAŁKOWICIE, bez śladu w wyniku.

SCENARIUSZ 1 (odtworzony na realnym solverze Newtona). Sieć: GPZ 110/15 kV, transformator 25 MVA, uk=12 %, OLTC na uzwojeniu GN, krok 1,25 %, obciążenie 10 MW / 5 Mvar, napięcie slack 1,08 pu. Zaczep stoi na pozycji n0 = -3. Inżynier otwiera „Regulacja napięcia zaczepami (OLTC)" → „Która pozycja jest najlepsza" → cel „Jak najmniej przełączeń", wpisuje w „Napięcie, które chcemy utrzymać" 15,75 kV i uruchamia badanie.
WYNIK PROGRAMU: „Pozycja optymalna: -3 · Pozycja startowa: -3 · Wymagane przełączenia: 0", wywód: „…enumeracja dokladna, bez heurystyk… J(-3) = |-3 - -3| = 0 … Wynik: najlepsza pozycja n* = -3".
RZECZYWISTOŚĆ: na tej pozycji szyna SN ma 16,4650 kV, czyli 0,7150 kV = 4,54 % POWYŻEJ zadanego celu. Pozycja faktycznie trzymająca cel to n=0 (15,8178 kV, odchyłka 0,0678 kV = 0,43 %), odległa o 3 przełączenia. Cel 15,75 kV został po cichu rozmyty do przedziału 14,96–16,54 kV; próg 5 % nie występuje NIGDZIE w odpowiedzi backendu (przeszukanie `to_dict()`: '0.05'/'5 %'/'5%'/'pasm'/'dopuszcz'/'toleranc'/'band' → wszystkie False).

SCENARIUSZ 2 (ostrzejszy — program aktywnie zaleca zły ruch). Ta sama sieć, zaczep na n0 = -4 (16,6917 kV, 5,98 % od celu → poza pasmem). Program odpowiada: „Pozycja optymalna: -3 · Wymagane przełączenia: 1". Czyli każe wykonać DOKŁADNIE JEDNO przełączenie na pozycję, która nadal jest 4,54 % od zadanego napięcia, i nazywa ją optymalną. Ruch nie służy trzymaniu napięcia — służy wejściu tuż pod niewidoczne pasmo 5 %.

SCENARIUSZ 3 (kryterium znika bez śladu). Ten sam ekran, inżynier czyści pole „Napięcie, które chcemy utrzymać" (pole nie jest oznaczone jako wymagane — EkranBadanOltc.tsx:92-99 nie podaje propsa `wymagane`; pola.tsx:140-141 zwraca `null` przy pustym wejściu; canonical_analysis.py:1321 przekazuje `None` bez walidacji). Backend uznaje WSZYSTKIE 9 zbieżnych pozycji za dopuszczalne, zwraca „n* = 0, 0 przełączeń" i wywód złożony wyłącznie z: „enumeracja dokladna, bez heurystyk" / „J(n)=|n-n0|" / „J = 0" / „Wynik: najlepsza pozycja n* = 0" / „Remis rozstrzygany deterministycznie". Ani jednego kroku ani kodu gotowości mówiącego, że napięcia w ogóle NIE SPRAWDZONO — gałąź uczciwego braku (wiersze 642-648) nie odpala, bo `best` nie jest None. To fabrykacja werdyktu.

DOWÓD POMIAROWY (HEAD 6946807a, realny `PowerFlowNewtonSolver`, sonda /tmp/oltc_probe.py i /tmp/oltc_probe2.py):
  n=-4 U=16,6917 kV |dU|=0,9417 kV (5,98 %) → dopuszczalna=False
  n=-3 U=16,4650 kV |dU|=0,7150 kV (4,54 %) → dopuszczalna=True
  n=-2 U=16,2439 kV (3,14 %) True; n=-1 16,0282 kV (1,77 %) True; n=0 15,8178 kV (0,43 %) True; n=+1 15,6124 kV (0,87 %) True; n=+2 15,4118 kV (2,15 %) True; n=+3 15,2160 kV (3,39 %) True; n=+4 15,0246 kV (4,61 %) True
Granica |dU|/U_cel: 0,045395 → True, 0,059792 → False. Dokładnie 0,05·U_cel.

BRAMKA NIE ZAPALI SIĘ NA TYM DEFEKCIE: jedyny test celu `minimize_switching` (tests/network_model/solvers/test_power_flow_oltc_studies.py:116-128) używa target_kv=14,0 przy U(n=0)=13,8073 kV, czyli odchyłce 1,38 % — przechodzi dla dowolnego progu > 1,38 %. Zmiana stałej z 0,05 na 0,02 albo 0,20 nie zapali ani jednego testu. Guard `scripts/load_flow_no_heuristics_guard.py` też nie chroni tego pliku: skanuje wyłącznie `backend/src/application/analysis_run`, `backend/src/domain`, `backend/src/analysis/power_flow` — katalog `backend/src/network_model/solvers` jest poza jego zasięgiem.

### D7 [wysoka] Domyślne odbiory nN stacji mają Q = 0 mimo katalogowego cosφ = 0,92 — rozpływ zaniża spadek napięcia na szynie nN 2,6-krotnie

**Miejsce:** mv-design-pro/backend/src/enm/catalog_completion.py:506 (`q_mvar=0.0` w `_build_default_load`, linie 493-531)

**Na czym polega:** `_build_default_load` tworzy odbiór z pozycji katalogowej `load_uslugi_30kw` (katalog deklaruje `p_kw: 30.0`, `q_kvar: null`, `cos_phi: 0.92`, `cos_phi_mode: IND`). Do modelu trafia `p_mw=0.03` i `q_mvar=0.0`, przy czym TEN SAM rekord niesie `materialized_params.cos_phi = 0.92` i `meta.cos_phi = 0.92` oraz `parameter_source: CATALOG` / `source_mode: KATALOG`. Mapowanie ENM→solver (`enm/mapping.py:536`) czyta wyłącznie `load.q_mvar` — cosφ z meta nie jest nigdzie odtwarzany. Element sam sobie przeczy: deklaruje cosφ 0,92, a do rozpływu idzie cosφ = 1,0, i twierdzi przy tym, że parametry pochodzą z katalogu, choć katalogowy cosφ został zgubiony. To dokładnie ta klasa defektu, którą rejestr V12K-050 nazwał „PHANTOM cosφ" i zamknął dla `add_nn_load` (tam Q = P·tan(arccos cosφ)); drugie miejsce produkujące odbiory — i to masowo, bo per odpływ nN każdej stacji — zostało nietknięte. Niespójność jest też wewnątrz jednej operacji stacyjnej: `_materialize_station_auxiliary_load` (domain_operations.py:4266-4270) liczy Q z cosφ poprawnie.

**Scenariusz awarii:** Projektant stawia stację SN/nN z blokiem nN (np. 3 odpływy). System sam zakłada 3 odbiory po 30 kW z pozycji katalogowej z cosφ 0,92 i zapisuje im Q = 0. Rozpływ mocy pokazuje na szynie nN napięcie zawyżone — spadek liczony bez składowej biernej na reaktancji transformatora i kabli. Inspektor elementu pokazuje cosφ 0,92 (z meta/materialized_params), więc inżynier nie ma podstaw podejrzewać, że w rachunku Q nie było. Decyzje oparte na tym wyniku (dobór przekroju odpływu, potrzeba kompensacji, ocena warunków napięciowych, ocena zgodności z limitem spadku) są podejmowane na zaniżonym spadku napięcia.

**Dowód zgłaszającego:** Sonda na żywym backendzie. (1) Stacja z `nn_block.outgoing_feeders_nn_count = 3` → w modelu 3 odbiory `load/<hash>/nn` (format ref_id 1:1 z `_build_default_load`), każdy: `p_mw: 0.03`, `q_mvar: 0.0`, `catalog_ref: "load_uslugi_30kw"`, `parameter_source: "CATALOG"`, `meta.cos_phi: 0.92`, `materialized_params.cos_phi: 0.92`. (2) `GET /api/catalog/load-types` → pozycja `load_uslugi_30kw`: {"p_kw":30.0,"q_kvar":null,"cos_phi":0.92,"cos_phi_mode":"IND"}. (3) `POST /api/cases/{case}/runs/power-flow` na tym modelu: szyna nN `p_injected_mw: -0.09`, `q_injected_mvar: 0.0`, `v_pu = 0.99808` (spadek 0,192%). (4) POMIAR KONTROLNY: po ustawieniu na tych samych trzech odbiorach `q_mvar = 0.030·tan(arccos 0,92) = 0,012780 Mvar` (wartość z katalogowego cosφ) ten sam rozpływ daje `q_injected_mvar: -0.03834`, `v_pu = 0.99509`, czyli spadek 0,491% zamiast 0,192% — zaniżenie 2,6× (0,30 pp napięcia na szynie nN) przy raptem 90 kW odbioru; błąd rośnie liniowo z Q. (5) `enm/mapping.py:536` potwierdza, że solver bierze `load.q_mvar` wprost — cosφ z meta nie jest używany.

**Werdykt sceptyka (nie obalono):** PRÓBY OBALENIA (wszystkie nieudane, każda wykonana):

R1 — „ścieżka jest tylko migracją legacy, nieosiągalną w normalnym biegu". OBALONE NA POMIARZE. Sonda /tmp/probe/p1.py (execute_domain_operation: add_grid_source_sn → 2× continue_trunk_segment_sn → insert_station_on_segment_sn z nn_block.outgoing_feeders_nn_count=3): BEZPOŚREDNIO po operacji stacyjnej `loads` ma 0 elementów; dopiero complete_catalog_defaults (enm/store.py:114 i 136, api/analysis_runs.py:72) dokłada 3 odbiory. Czyli `_build_default_load` NIE jest ścieżką awaryjną dla starych snapshotów — jest JEDYNYM producentem odbiorów nN dla stacji stawianej kanoniczną operacją. Kreator ui2 idzie dokładnie tędy: frontend/src/ui2/kreatory/stacja/stacjaModel.ts:335-336 wybiera `append_station_on_endpoint`/`insert_station_on_segment_sn`, a zbudujPayload (linie 918-941) wysyła `outgoing_feeders_nn` BEZ jakiejkolwiek definicji odbioru.

R2 — „wyżej stoi walidacja / bramka gotowości powie, że dane są niepełne". OBALONE. Sonda p6: GET /api/cases/{case}/enm/readiness → readiness.ready=true, blockers=[], analysis_readiness.load_flow=true; jedyny issue to W002 o braku Z₀ w źródle — ANI SŁOWA o odbiorach. Sonda p5: nagłówek biegu rozpływu → analysis_case_context.completeness="complete", reporting_limitations=null. System deklaruje model kompletny i gotowy.

R3 — „kontrakt/downstream odtwarza Q z cosφ". OBALONE cytatem i grepem. enm/mapping.py:536-537: `bus_q[load.bus_ref] = bus_q.get(...) - load.q_mvar` — wprost z pola. Grep `math.tan(math.acos` po src: wyprowadzenie Q z cosφ istnieje WYŁĄCZNIE w domain_operations.py:4271 (potrzeby własne stacji), domain_operations_v2.py:1964 (add_nn_load) i w setpointach OZE — nigdzie na drodze odbiór katalogowy → solver. materialized_params jest czytane tylko po współczynniki ZIP (brak a_p/b_p/c_p ⇒ stała moc).

R4 — „test już to przypina jako zamierzone". OBALONE. tests/enm/test_enm_store.py:141-152 (jedyny test tej migracji) sprawdza bus_ref, catalog_ref, catalog_namespace i meta.feeder_ref — q_mvar NIE jest asertowane. Grep `q_mvar == 0` po tests/: zero trafień dla tych odbiorów. Bramka, która miałaby chronić przed tym defektem, nie ma jak się zapalić.

R5 — „to świadomy zamysł opisany w rejestrze". OBALONE. Przeczytałem V12K-289..304 (wiersze 100-103 REJESTR_KONFLIKTOW.md) — nic o katalogowych odbiorach nN. Za to V12K-050 (wiersz 69) rozstrzyga DOKŁADNIE tę klasę dla add_nn_load, a kod nosi komentarz nazywający ją po imieniu (domain_operations_v2.py:1952-1957: „cosφ trafiał tylko do meta i był ignorowany przez rozpływ mocy (Q=0) — phantom"). Zamysł produktu potwierdzają dwa inne miejsca: _materialize_station_auxiliary_load (domain_operations.py:4266-4271) i ścieżka szablonowa (application/station_templates/apply.py:188-203), która odbiory nN per odpływ tworzy PRZEZ add_nn_load, więc z Q. Drugi producent został pominięty.

R6 — „scenariusz nie odtwarza się liczbowo". OBALONE pomiarem kontrolnym (p3/p4, ten sam model, ta sama końcówka): BASE v_pu szyny nN = 0,998125 (spadek 0,1875 %), Q wstrzyknięte = 0,000000; KONTROLA po podstawieniu q_mvar = 0,030·tan(arccos 0,92) = 0,012780 Mvar na odbiór: v_pu = 0,995161 (spadek 0,4839 %), Q = −0,038340. Zaniżenie 2,58× — zgodne ze zgłoszeniem (2,6×) w granicach różnicy długości magistrali.

KOREKTA ZGŁOSZENIA (jeden element niepotwierdzony): teza „Inspektor elementu pokazuje cosφ 0,92" NIE potwierdziła się. frontend/src/ui2/adapters/inspectorAdapter.ts:66-86 buduje dla odbioru wyłącznie wiersze Nazwa/Typ elementu + identyfikatory — cosφ tam nie ma. Pole `cos_phi` dla Load istnieje tylko w starszej siatce ui/property-grid/field-definitions.ts:494 (z zaszytą wartością domyślną 0,95). Usunąłem tę tezę ze scenariusza; sprzeczność, którą ZMIERZYŁEM, siedzi w samym rekordzie modelu i w odpowiedzi API, nie w inspektorze. Reszta zgłoszenia stoi.

**Scenariusz po korekcie sceptyka:** DEFEKT POTWIERDZONY (odtworzony na żywym backendzie, z pomiarem kontrolnym).

Miejsce: mv-design-pro/backend/src/enm/catalog_completion.py:506 (`q_mvar=0.0` w `_build_default_load`, linie 493-531), wywołanie w linii 428 z `complete_station_loads_from_nn_feeders` (linie 399-437), uruchamiane na każdej granicy ENM: enm/store.py:114 i 136 oraz api/analysis_runs.py:72.

CO SIĘ DZIEJE
Projektant stawia w kreatorze ui2 stację SN/nN z 3 odpływami nN (frontend/src/ui2/kreatory/stacja/stacjaModel.ts:335-336 → operacja `insert_station_on_segment_sn`/`append_station_on_endpoint`; payload nn_block z linii 918-941 nie niesie żadnej definicji odbioru). Sama operacja stacyjna tworzy ZERO odbiorów — potwierdzone sondą. Odbiory dokłada dopiero migracja katalogowa na granicy ENM: po jednym na odpływ, z pozycji katalogowej `load_uslugi_30kw`, która (GET /api/catalog/load-types, zweryfikowane) deklaruje {"p_kw":30.0,"q_kvar":null,"cos_phi":0.92,"cos_phi_mode":"IND"}.

Do modelu trafia rekord SAM SOBIE PRZECZĄCY (GET /api/cases/{case}/enm, zweryfikowane dosłownie):
  ref_id "load/f9aa2e11.../nn", p_mw 0.03, q_mvar 0.0,
  catalog_ref "load_uslugi_30kw", parameter_source "CATALOG", source_mode "KATALOG",
  materialized_params {"catalog_item_id":"load_uslugi_30kw","p_kw":30.0,"cos_phi":0.92},
  meta.cos_phi 0.92.
Element twierdzi, że parametry pochodzą z katalogu, i niesie katalogowe cosφ 0,92 w dwóch miejscach — a do solvera idzie cosφ = 1,0, bo enm/mapping.py:536-537 czyta wyłącznie `load.q_mvar` (`bus_q[...] -= load.q_mvar`) i nigdzie na tej drodze nie ma odtworzenia Q z cosφ. Tracony jest też `cos_phi_mode: IND`.

SKUTEK LICZBOWY (pomiar kontrolny na tym samym modelu i tej samej końcówce POST /api/cases/{case}/runs/power-flow)
  stan obecny:  szyna nN v_pu = 0,998125, P = −0,09 MW, Q = 0,000000 Mvar → spadek 0,1875 %
  kontrola (q_mvar = 0,030·tan(arccos 0,92) = 0,012780 Mvar na odbiór, czyli wartość z katalogowego cosφ):
                szyna nN v_pu = 0,995161, P = −0,09 MW, Q = −0,038340 Mvar → spadek 0,4839 %
  zaniżenie spadku napięcia 2,58× (0,30 pp na szynie nN) przy raptem 90 kW odbioru; błąd rośnie liniowo z Q, a odbiory powstają MASOWO — po jednym na każdy odpływ nN każdej stacji SN/nN w projekcie.

DLACZEGO NIKT TEGO NIE ZOBACZY
Nie ma ani jednego sygnału, że rachunek pominął moc bierną: GET /api/cases/{case}/enm/readiness → readiness.ready=true, blockers=[], analysis_readiness.load_flow=true, jedyny issue to W002 o braku Z₀ w źródle; nagłówek biegu rozpływu → analysis_case_context.completeness="complete", reporting_limitations=null. Znacznik `meta.completion_source="station_catalog_migration"` nie ma w repozytorium ŻADNEGO konsumenta (grep: występuje wyłącznie w catalog_completion.py) — nie zapala kodu gotowości, nie trafia do UI, nie oznacza odbioru jako prowizorycznego. Decyzje inżynierskie oparte na tym rozpływie (dobór przekroju odpływu, potrzeba kompensacji, ocena warunków napięciowych, zgodność z limitem spadku) zapadają na zaniżonym spadku.

DLACZEGO TO DEFEKT, A NIE WYBÓR PROJEKTOWY
Ten sam produkt liczy Q z cosφ w dwóch innych producentach odbiorów: add_nn_load (enm/domain_operations_v2.py:1952-1964, naprawa V12K-050, z komentarzem nazywającym Q=0 przy podanym cosφ „phantomem") oraz potrzeby własne stacji (enm/domain_operations.py:4266-4271). Ścieżka szablonowa też robi to poprawnie — application/station_templates/apply.py:188-203 tworzy odbiory nN per odpływ PRZEZ add_nn_load. Pominięty został wyłącznie ten jeden, najliczniejszy producent.

BRAMKA, KTÓRA NIE MOŻE SIĘ ZAPALIĆ
tests/enm/test_enm_store.py:141-152 to jedyny test tej migracji: sprawdza bus_ref, catalog_ref, catalog_namespace i meta.feeder_ref, ale NIE q_mvar. Grep `q_mvar == 0` po tests/ nie daje trafień dla tych odbiorów. Regresja naprawy będzie niewykrywalna do czasu dopisania asercji Q = P·tan(arccos cosφ) na odbiorze z `_build_default_load` (a docelowo: wyprowadzenia Q w samym `_build_default_load` z katalogowego cosφ, parytet z add_nn_load — z zachowaniem pierwszeństwa jawnego q_kvar z pozycji katalogowej, jak w `load_przem_75kw`, które q_kvar 28.0 podaje wprost).

DOWODY WYKONANE: /tmp/probe/p1.py (0 odbiorów po operacji stacyjnej → 3 po granicy ENM, pełne rekordy), p3.py (pełny łańcuch API: domain-ops → GET enm → POST runs/power-flow → GET results), p4.py (pomiar kontrolny BASE vs Q z katalogowego cosφ), p5.py/p6.py (gotowość i kontekst biegu), p7.py (GET /api/catalog/load-types). Żadnego pliku produkcyjnego ani testu nie zmieniano.

### D8 [wysoka] Bilans VT: dla przekładnika bez uzwojenia pomiarowego kryterium „uzwojenie POMIAROWE" liczy się na limicie zabezpieczeniowym (1,0 % zamiast 0,5 %) i wychodzi PASS — bez żadnego kodu gotowości

**Miejsce:** mv-design-pro/backend/src/api/equipment_checks.py:214-221 (`klasa = pozycja.accuracy_class_metering or pozycja.accuracy_class` w linii 217)

**Na czym polega:** Końcówka `POST /api/solver/vt-burden-check` przyjmuje `uzwojenie` (domyślnie `POMIAROWE`) i wyprowadza kategorię z klasy katalogowej. Gdy rekord VT nie ma osobnej klasy pomiarowej (`accuracy_class_metering = null`), fallback podstawia `accuracy_class`. Dla przekładników czysto zabezpieczeniowych (w katalogu: `vt_15kv_100v_3p_abb`, `vt_20kv_100v_3p_abb`, `vt_24kv_100v_3p_schneider` — `accuracy_class: "3P"`, `accuracy_class_metering: null`, `application: "protection"`) fallback oddaje klasę ZABEZPIECZENIOWĄ, a `kategoria_z_klasy` zamienia limit ΔU z 0,5 % na 1,0 %. Docstring samego solvera (`vt_burden_voltage_drop.py:79-85`) wprost zakazuje takiego domysłu: „Domyslanie sie kategorii … zamienialoby limit 0,5 % na 1,0 % i przepuszczaloby obwod pomiarowy dwukrotnie za dlugi". Końcówka ma w rekordzie komplet danych, by wykryć brak uzwojenia pomiarowego (`application`, `accuracy_class_metering`), ale ich nie używa i nie zwraca żadnego kodu gotowości — podmiana jest niewidoczna. Warstwa prezentacji jej nie ujawnia: `ui2/kryteria/SekcjaBilansuCtVt.tsx:246` pokazuje `limit_delta_u_procent`, a `kategoria_uzwojenia` z odpowiedzi NIE jest nigdzie renderowana, więc na ekranie zostaje wybór użytkownika („Sprawdzane uzwojenie: POMIAROWE", `KreatorStacjiSnNn.tsx:1668-1678`) i zielony werdykt.

**Scenariusz awarii:** W kroku „Pomiar i zabezpieczenia" kreatora stacji projektant wybiera przekładnik napięciowy 3P (normalny wybór dla obwodu zabezpieczeniowego), zostawia domyślne „Sprawdzane uzwojenie: POMIAROWE" i podaje obwód wtórny (długość, przekrój, moc aparatów). Readout pokazuje werdykt PASS przy limicie 1,0 %, choć obwód pomiarowy tego limitu nie spełnia. Projektant zatwierdza obwód wtórny dwukrotnie za długi względem kryterium pomiarowego IEC 61869-3; błąd wyjdzie dopiero na uchybie układu pomiarowego w eksploatacji.

**Dowód zgłaszającego:** Dwa realne wywołania końcówki na żywym backendzie (port 19100), IDENTYCZNY obwód wtórny: 100 m, 1,5 mm², 30 VA. (a) `vt_catalog_ref: "vt_15kv_100v_3p_abb"`, `uzwojenie: "POMIAROWE"` → {"status":"PASS","status_spadku":"PASS","delta_u_procent":0.68964,"limit_delta_u_procent":1.0,"kategoria_uzwojenia":"ZABEZPIECZENIOWE","klasa_dokladnosci":"3P","readiness_codes":[]} — zapytano o uzwojenie pomiarowe, odpowiedziano kategorią zabezpieczeniową, lista kodów gotowości PUSTA. (b) `vt_catalog_ref: "vt_15kv_100v_05_abb"` (VT z realnym uzwojeniem pomiarowym), ten sam obwód → {"status":"FAIL","delta_u_procent":0.68964,"limit_delta_u_procent":0.5,"kategoria_uzwojenia":"POMIAROWE"}. Ten sam ΔU = 0,690 % raz jest PASS, raz FAIL — różnicę robi wyłącznie podmieniony limit. (c) `GET /api/catalog/vt-types` potwierdza trzy rekordy z `accuracy_class: "3P"` i `accuracy_class_metering: null` (czyli bez uzwojenia pomiarowego), obok czterech rekordów 3P, które klasę pomiarową mają i fallbacku nie uruchamiają.

**Werdykt sceptyka (nie obalono):** PRÓBY OBALENIA (wszystkie nieudane, każda sprawdzona wykonaniem):

1. „Ścieżka nieosiągalna / picker filtruje przekładniki". OBALONE NIEUDANE. `mv-design-pro/frontend/src/ui2/kreatory/stacja/KreatorStacjiSnNn.tsx:1543-1554` podaje `opcje={vtTypy.map(...)}` — ZERO filtrowania po klasie/zastosowaniu; lista pochodzi wprost z `fetchVtTypes()` (linia 447/454). Wybór uzwojenia to osobna kontrolka niżej (linia 1666-1679) z domyślną wartością `'POMIAROWE'` (`stacjaModel.ts:167`). Nic nie wiąże obu kontrolek.

2. „Wyżej stoi walidacja". OBALONE NIEUDANE. `VtBurdenRequest` (equipment_checks.py:164-175) ogranicza tylko literał `POMIAROWE|ZABEZPIECZENIOWE`; jedyne sprawdzenie w handlerze to istnienie pozycji katalogowej (207-212). Brak porównania żądanego uzwojenia z tym, co rekord faktycznie ma.

3. „Kontrakt gwarantuje typ (każdy VT ma klasę pomiarową)". OBALONE NIEUDANE. Sonda na realnym katalogu: 13 rekordów VT, z tego 9 jednouzwojeniowych (`accuracy_class_metering=None`), a 3 z nich to rekordy WYŁĄCZNIE zabezpieczeniowe (`vt_15kv_100v_3p_abb`, `vt_20kv_100v_3p_abb`, `vt_24kv_100v_3p_schneider`, klasa `3P`). Fallback z linii 217 zwraca dla nich klasę zabezpieczeniową.

4. „Test już to pokrywa". OBALONE NIEUDANE — i to jest bramka, która nie może się zapalić na defekcie, który ma chronić. `mv-design-pro/backend/tests/api/test_equipment_checks_api.py:107-114` CELOWO wybiera pozycję `if pozycja.accuracy_class_metering`, czyli omija gałąź fallbacku. Fixture frontendu (`ui2/kryteria/__tests__/kryteria.test.tsx:80-86`) też podaje wyłącznie spójny przypadek (`kategoria_uzwojenia:'POMIAROWE'` + `limit 0.5`). Oba pliki na zielono (49 passed, RC=0) przy w pełni odtworzonym defekcie.

5. „To świadomy zamysł z rejestru". OBALONE NIEUDANE. Wpisy V12K-289..304 przeczytane. V12K-292 (KD-3, ta sama karta, która ten moduł stworzyła) zapisuje regułę ODWROTNĄ: „limity dU 0,5%/1,0% wg klasy uzwojenia (klasa nierozpoznana -> kod gotowosci, nie limit domyslny)". Docstring solvera (`vt_burden_voltage_drop.py:79-85`) nazywa tę podmianę wprost jako niedopuszczalną. Kod gotowości `vt.winding_category_missing` ISTNIEJE w rejestrze (`domain/canonical_operations.py:970`) i nie jest tu emitowany. Żaden wpis rejestru nie nazywa tego fallbacku przyjętym długiem.

6. „Scenariusz nie odtwarza się w praktyce". OBALONE NIEUDANE — odtworzony i pogłębiony (patrz poprawiony scenariusz). Determinizm potwierdzony: dwa biegi identyczne co do bajtu.

DOWÓD WYKONANY (sonda `/tmp/probe_vt.py`, `/tmp/probe_vt2.py`, TestClient na `api.main:app`, identyczny obwód 100 m / 1,5 mm² / 30 VA):
  pytanie=POMIAROWE        vt_15kv_100v_3p_abb -> kat=ZABEZPIECZENIOWE klasa=3P  limit=1.0 status=PASS kody=[]
  pytanie=ZABEZPIECZENIOWE vt_15kv_100v_3p_abb -> kat=ZABEZPIECZENIOWE klasa=3P  limit=1.0 status=PASS kody=[]
  pytanie=POMIAROWE        vt_15kv_100v_05_abb -> kat=POMIAROWE        klasa=0.5 limit=0.5 status=FAIL kody=[]
  pytanie=ZABEZPIECZENIOWE vt_15kv_100v_05_abb -> kat=POMIAROWE        klasa=0.5 limit=0.5 status=FAIL kody=[]
Ten sam ΔU = 0,68964 % raz PASS, raz FAIL — różnicę robi wyłącznie podmieniony limit.

ZNALEZISKO SIĘ BRONI I JEST SZERSZE, NIŻ OPISAŁ ZGŁASZAJĄCY (dwa fakty domierzone przeze mnie):
(a) Dla WSZYSTKICH 9 rekordów jednouzwojeniowych kontrolka „Sprawdzane uzwojenie" jest MARTWA — odpowiedź jest bajtowo taka sama dla obu wartości (dowód w tabeli wyżej: oba wiersze `vt_15kv_100v_3p_abb` identyczne, oba wiersze `vt_15kv_100v_05_abb` identyczne). To phantom w czystej postaci: kontrolka, której backend nie widzi. Selektor działa tylko dla 4 rekordów dwuuzwojeniowych (rodzina faza–ziemia).
(b) Sprzeczność jest WIDOCZNA NA JEDNYM EKRANIE, a nie tylko ukryta: etykieta opcji brzmi dosłownie „pomiarowe (limit 0,5 %)" (`ui2/kryteria/strings.ts:44`), a wiersz readoutu tuż pod spodem pokazuje „Limit dla kategorii uzwojenia: 1,0 %" (`SekcjaBilansuCtVt.tsx:246`) i „Werdykt zmiany napięcia: spełnione" (`strings.ts:93`). Ekran sam sobie przeczy i nie tłumaczy dlaczego. Grep po całym `frontend/src` i `frontend/e2e`: `kategoria_uzwojenia` i `klasa_dokladnosci` występują wyłącznie w typie odpowiedzi (`wyposazenieApi.ts:74,57,80`) i w fixture testowym — NIGDZIE nie są renderowane. `readiness_codes` puste, więc lista braków (`SekcjaBilansuCtVt.tsx:252-258`) się nie pokazuje.
(c) Werdykt nie ma żadnej bramki niżej: wybór uzwojenia i obwód wtórny NIE trafiają do modelu — `zbudujWyposazeniePolaDoPayloadu` (`stacjaModel.ts:673-709`) wysyła tylko `catalog_ref`, `catalog_binding` i przekładnię. Ten readout jest jedyną informacją zwrotną, jaką projektant dostaje.

Naruszone reguły domu: zakaz fabrykacji (kontrolka bez pokrycia w backendzie + podmieniony limit zamiast kodu gotowości), własny kontrakt solvera („klasa nierozpoznana → kod gotowości, nie limit domyślny"), uczciwy stan zerowy. Naprawa u źródła: fallback w linii 217 wolno uruchamiać tylko wtedy, gdy `kategoria_z_klasy(pozycja.accuracy_class)` daje POMIAROWE (rekord jednouzwojeniowy pomiarowy); gdy daje ZABEZPIECZENIOWE, a proszono o POMIAROWE (i symetrycznie), kategoria = None → `vt.winding_category_missing`, `status_spadku = UNAVAILABLE`. Symetrycznie w gałęzi 219. Do tego ekran musi renderować `kategoria_uzwojenia` obok limitu, żeby podmiana nigdy więcej nie była niewidoczna, a test API musi ćwiczyć rekord BEZ `accuracy_class_metering`.

**Scenariusz po korekcie sceptyka:** MIEJSCE: mv-design-pro/backend/src/api/equipment_checks.py:216-219 (fallback `pozycja.accuracy_class_metering or pozycja.accuracy_class` w linii 217 oraz symetryczne `klasa = pozycja.accuracy_class` w linii 219); skutki widoczne w mv-design-pro/frontend/src/ui2/kryteria/SekcjaBilansuCtVt.tsx:246 i mv-design-pro/frontend/src/ui2/kryteria/strings.ts:44.

WEJŚCIE/STAN: Kreator stacji SN/nN, krok „Pomiar i zabezpieczenia", pole liniowe. Projektant wybiera z pickera przekładnik napięciowy „VT 15 kV / 100 V kl. 3P · 15000/100 V" (picker nie filtruje po zastosowaniu — KreatorStacjiSnNn.tsx:1543-1554), wpisuje obwód wtórny: długość 100 m, przekrój 1,5 mm², moc aparatów 30 VA, i zostawia domyślną wartość kontrolki „Sprawdzane uzwojenie" = „pomiarowe (limit 0,5 %)" (domyślna w stacjaModel.ts:167).

CO SIĘ DZIEJE: końcówka POST /api/solver/vt-burden-check dostaje `uzwojenie: "POMIAROWE"`, ale rekord `vt_15kv_100v_3p_abb` ma `accuracy_class_metering = None`, więc fallback z linii 217 podstawia klasę ZABEZPIECZENIOWĄ „3P". `kategoria_z_klasy("3P")` → ZABEZPIECZENIOWE → limit ΔU 1,0 % zamiast 0,5 %. Zmierzona odpowiedź: {"status":"PASS","status_spadku":"PASS","delta_u_procent":0.68964,"limit_delta_u_procent":1.0,"kategoria_uzwojenia":"ZABEZPIECZENIOWE","klasa_dokladnosci":"3P","readiness_codes":[]}. Lista kodów gotowości PUSTA, choć kanoniczny kod `vt.winding_category_missing` istnieje (domain/canonical_operations.py:970) i docstring solvera (vt_burden_voltage_drop.py:79-85) wprost zakazuje takiej podmiany.

ZŁY SKUTEK NA EKRANIE: pod kontrolką z etykietą „pomiarowe (limit 0,5 %)" readout pokazuje „Limit dla kategorii uzwojenia: 1,0 %" i „Werdykt zmiany napięcia: spełnione". Ekran przeczy sam sobie w dwóch sąsiednich wierszach i nie tłumaczy dlaczego: `kategoria_uzwojenia` ani `klasa_dokladnosci` NIE są renderowane nigdzie we frontendzie (grep po src/ i e2e/ — występują wyłącznie w typie odpowiedzi wyposazenieApi.ts:74,57,80 i w fixture testowym), a lista braków się nie pokazuje, bo `readiness_codes` jest puste. Projektant zatwierdza obwód pomiarowy DWUKROTNIE za długi względem kryterium 0,5 % — ten sam ΔU = 0,68964 % przy VT z realnym uzwojeniem pomiarowym (`vt_15kv_100v_05_abb`, identyczny obwód) daje FAIL przy limicie 0,5 %. Błąd nie ma żadnej bramki niżej: wybór uzwojenia ani obwód wtórny nie trafiają do modelu (stacjaModel.ts:673-709 wysyła tylko catalog_ref/binding/przekładnię), więc wyjdzie dopiero na uchybie układu pomiarowego w eksploatacji.

ZASIĘG SZERSZY NIŻ POJEDYNCZY PRZYPADEK (domierzony): dla WSZYSTKICH 9 rekordów jednouzwojeniowych z 13 w katalogu kontrolka „Sprawdzane uzwojenie" jest całkowicie martwa — odpowiedź jest identyczna dla obu wartości (POMIAROWE i ZABEZPIECZENIOWE dają ten sam limit, tę samą kategorię, ten sam werdykt). Fałszywy PASS dotyczy 3 rekordów czysto zabezpieczeniowych (vt_15kv_100v_3p_abb, vt_20kv_100v_3p_abb, vt_24kv_100v_3p_schneider); pozostałe 6 daje odpowiedź na inne pytanie, niż zadano (kierunek zachowawczy). Selektor działa poprawnie wyłącznie dla 4 rekordów dwuuzwojeniowych (rodzina faza–ziemia z `accuracy_class_metering`).

BRAMKA, KTÓRA NIE MOŻE SIĘ ZAPALIĆ: test kontraktowy tests/api/test_equipment_checks_api.py:107-114 celowo wybiera pozycję warunkiem `if pozycja.accuracy_class_metering`, czyli omija gałąź fallbacku — gałąź z linii 217 ma zerowe pokrycie. Uruchomione: tests/api/test_equipment_checks_api.py + tests/network_model/test_equipment_checks.py → 49 passed, RC=0, przy w pełni odtworzonym defekcie.

DOWÓD WYKONANY: sondy /tmp/probe_vt.py i /tmp/probe_vt2.py (fastapi TestClient na api.main:app, katalog z network_model.catalog.repository.get_default_mv_catalog) — pełna tabela 13 rekordów, pełna odpowiedź JSON, krok 5 śladu WHITE BOX z założeniem „Limit ΔU = 1.0 % dla kategorii »uzwojenie zabezpieczeniowe« — wyprowadzony z klasy dokladnosci uzwojenia, nie przyjety domyslnie" (zdanie nieprawdziwe dla tej ścieżki) oraz potwierdzenie determinizmu (dwa biegi identyczne co do bajtu).

## Synteza i plan kart (A–H)

# Plan naprawczy — 8 potwierdzonych defektów, 8 kart równoległych

**Uwaga wstępna dla nadzorcy:** katalog roboczy stoi na `6946807a`, nie na `34c9afe1` z polecenia. Wszystkie numery wierszy poniżej zweryfikowałem odczytem na `6946807a` (m.in. `if not isinstance(materialization, dict):` = wiersz 7851, literał `readiness: {ready:true}` = wiersze 281–285, `0.05 * target_kv` = wiersz 519). W kartach każ kotwiczyć się **treścią, nie numerem wiersza**.

---

## 1. Ranking ryzyka dla projektanta

| # | Defekt | Dlaczego tu |
|---|---|---|
| R1 | Katalog omijany w `append_station_on_endpoint` | Zły **prąd zwarciowy w raporcie** (+22,5 %, 23 753 A zamiast 19 391 A), status `reportable`/`complete`, zero sygnału. Wyzwalacz: literówka w refie — dostępne dziś, jednym klikiem. Wynik idzie wprost do doboru aparatury. |
| R2 | Domyślne odbiory nN z Q = 0 mimo katalogowego cosφ 0,92 | Zaniżony spadek napięcia **2,6×** na KAŻDEJ stacji stawianej kreatorem, cicho, przy `completeness: complete`. Najwyższa powtarzalność ze wszystkich znalezisk. |
| R3 | Wielomian ZIP z samych odbiorów mnożony przez moc wypadkową szyny | **Odwrócony znak mocy na przyłączu** (+0,31 MW poboru zamiast oddawania) + twarda wywrotka biegu przy q=0. Fizycznie najgorsze, ale uzbrojone dopiero przy odbiorze ZIP (import ENM / własny typ katalogowy) — stąd R3, nie R1. |
| R4 | OLTC: zaszyte pasmo ±5 % U_cel | Zalecenie „nie ruszaj zaczepu" przy 4,54 % od celu albo jeden ruch donikąd; bez U_cel kryterium znika bez śladu. Narusza WHITE BOX i regułę #9 wprost w solverze. |
| R5 | Bilans VT: kategoria uzwojenia z domysłu | Fałszywy PASS przy limicie 1,0 % zamiast 0,5 % → obwód pomiarowy 2× za długi. Dodatkowo kontrolka martwa dla 9 z 13 rekordów (phantom). |
| R6 | Fabrykowana gotowość po każdym biegu | „Model: zwalidowany / Gotowe do analiz" na modelu z blokadami; kosztuje zaufanie do bramki i pracę (409 dopiero na backendzie). Nie fałszuje liczb — stąd niżej. |
| R7 | Brak ochrony współbieżności magazynu ENM | Cicha utrata 12 elementów przy HTTP 200 + dziury w dzienniku zmian. Niszczy pracę, ale wychodzi na jaw (brak stacji). |
| R8 | Guard `no_direct_fault_params` skanuje 0 plików | Ryzyko meta: fałszywa zieleń CI od narodzin + 37 plików preexisting. Nie daje złego wyniku sam, ale wpuszcza klasę, która daje. |

---

## 2. Karty (rozłączne pliki, osobne worktree)

### KARTA A — Brama katalogowa: `append_station_on_endpoint` (R1)
**Zakres (wyłączny):** `/home/user/MV-Design-PRO/mv-design-pro/backend/src/enm/domain_operations.py`, `/home/user/MV-Design-PRO/mv-design-pro/backend/src/api/domain_ops_policy.py`, `/home/user/MV-Design-PRO/mv-design-pro/backend/tests/enm/test_append_station_on_endpoint.py`, `/home/user/MV-Design-PRO/mv-design-pro/backend/tests/api/` (testy polityki).

**Rozstrzygnięcia z góry:**
1. Naprawa = odwrócenie warunku na wzorzec z pozostałych 11 wywołań (`if isinstance(materialization, dict): return materialization`). Zakaz „miękkiego" wariantu (ostrzeżenie zamiast błędu).
2. Parytet z `insert_station_on_segment_sn` jest wiążący: **ten sam payload → ten sam kod błędu** `catalog.item_not_found` i ten sam status HTTP 422.
3. `append_station_on_endpoint` dopisać do `CATALOG_REQUIRED_OPERATIONS` — brama API musi zadziałać zanim operacja domenowa w ogóle wystartuje.
4. Nie ruszać `network_model/catalog/readiness_checker.py` (martwy checker → sekcja 4).
5. `source_mode: "KATALOG"` nie wolno ustawiać przed udaną materializacją.

**Bramka:** (a) test parytetu: identyczny zły ref w obu operacjach → oba 422 `catalog.item_not_found`; (b) test wariantu bez tabliczki → też 422, nie E006; (c) **test klasy**: skan `domain_operations*.py` asertujący zero wystąpień `not isinstance(materialization, dict)`; (d) pomiar końcowy: brak ścieżki produkującej Ikss 23 753 A na szynie nN.
**Iniekcja:** przywróć `not` w warunku → (a) i (c) czerwone. Usuń wpis z `CATALOG_REQUIRED_OPERATIONS` → test polityki czerwony.

---

### KARTA B — Q domyślnych odbiorów nN z katalogowego cosφ (R2)
**Zakres (wyłączny):** `/home/user/MV-Design-PRO/mv-design-pro/backend/src/enm/catalog_completion.py`, `/home/user/MV-Design-PRO/mv-design-pro/backend/tests/enm/test_enm_store.py` + nowy test.

**Rozstrzygnięcia:**
1. Wzór jak w naprawionym `add_nn_load` (V12K-050): `q = p·tan(arccos cosφ)`, znak wg `cos_phi_mode` (IND = pobór Q).
2. **Pierwszeństwo jawnego `q_kvar` z pozycji katalogowej** (np. `load_przem_75kw`: 28 kVAr) nad wyprowadzeniem z cosφ. Brak obu → kod gotowości, nie zero.
3. Zakaz dotykania `enm/store.py`, `enm/mapping.py`, `domain_operations*.py` (karty G i C).
4. Wykonawca **nie zmienia** wartości `DEFAULT_LOAD_COS_PHI` ani pozycji katalogowej.

**Bramka:** (a) test jednostkowy: stacja z 3 odpływami → każdy `Load.q_mvar == 0.03·tan(arccos 0,92)` ±1e-9, `cos_phi_mode` zachowane; (b) test rozpływu end-to-end: `v_pu` szyny nN = 0,99516 ±1e-4 (dziś 0,99813); (c) test pierwszeństwa jawnego q_kvar.
**Iniekcja:** przywróć `q_mvar=0.0` → (a) i (b) czerwone.
**Uwaga scaleniowa:** zmienia hashe ENM i unieważnia istniejące biegi — patrz sekcja 4 pkt 9.

---

### KARTA C — ZIP: wielomian tylko na części odbiorowej (R3)
**Zakres (wyłączny):** `/home/user/MV-Design-PRO/mv-design-pro/backend/src/enm/mapping.py`, `/home/user/MV-Design-PRO/mv-design-pro/backend/src/enm/canonical_analysis.py`, `/home/user/MV-Design-PRO/mv-design-pro/backend/src/network_model/solvers/power_flow_zip.py`, `/home/user/MV-Design-PRO/mv-design-pro/backend/tests/test_power_flow_zip.py`, `/home/user/MV-Design-PRO/mv-design-pro/backend/tests/enm/test_zip_wiring.py`.

**Rozstrzygnięcia (bez nich wykonawca zaimprowizuje fizykę):**
1. Model wiążący: `P_szyny(V) = −P_odb·f_ZIP(V) + P_gen`, generator PQ = **stała moc**, wielomian dotyczy wyłącznie części odbiorowej. Znaczy to, że do solvera muszą trafić **dwie składowe** (odbiorowa z ZIP + generacyjna stała), a nie jedna moc netto z jednym wielomianem.
2. `aggregate_zip` przy `q_tot == 0` zwraca `(a_q, b_q, c_q) = (0, 0, 1)` — stała moc, suma 1. Zakaz zwracania sumy 0.
3. Każdy agregat przepuszczony przez `validate_zip_coeffs` **przed** użyciem.
4. Błąd walidacji ZIP nie może wypłynąć do użytkownika jako angielski `ValueError` — kod gotowości lub polski komunikat.
5. `bus_results.p_injected_mw` musi równać się faktycznemu wstrzykowi (bilans węzłowy) — dziś raportuje moc sprzed wielomianu.
6. Zakaz zmiany kształtu `PowerFlowResult` (FROZEN): poprawiamy wartość, nie schemat.

**Bramka:** (a) test agregatu q_tot=0 → suma 1, walidacja przechodzi; (b) test wiring: szyna 3 MW ZIP (a_p=1) + generator 2,7 MW → wartości z niezależnego wzoru, w szczególności **znak dodatni (oddawanie) przy V=0,9**; (c) test bilansu: `p_injected_mw` == suma przepływów gałęziowych ±1e-6 na sieci ZIP; (d) test „odbiór ZIP z q=0 bez generacji" → bieg kończy się sukcesem, nie FAILED.
**Iniekcja:** przywróć `PQSpec(p_mw=-node.active_power, zip_coeffs=node.zip_coeffs)` → (b) i (c) czerwone; przywróć `return 0.0` w `_share_q` → (a) i (d) czerwone.

---

### KARTA D — OLTC: koniec zaszytego pasma (R4)
**Zakres (wyłączny):** `/home/user/MV-Design-PRO/mv-design-pro/backend/src/network_model/solvers/power_flow_oltc_studies.py`, `/home/user/MV-Design-PRO/mv-design-pro/backend/tests/network_model/solvers/test_power_flow_oltc_studies.py`.

**Rozstrzygnięcia:**
1. **Literał `0.05 * target_kv` znika bez zamiennika-literału.** Do czasu decyzji właściciela (sekcja 4 pkt 1) obowiązuje wariant bezpieczny: brak jawnego kryterium → `feasible` nierozstrzygalne → wynik NIEDOSTĘPNY + kod gotowości, `best_position = None`.
2. `target_kv is None` i `deviation is None` **nie mogą** oznaczać „dopuszczalna". Dziś oznaczają — to jest fabrykacja werdyktu.
3. Kryterium faktycznie użyte (wartość + źródło) musi trafić do `OptimizationResult` i do wywodu. Zdanie „enumeracja dokładna, bez heurystyk" wolno zostawić tylko wtedy, gdy jest prawdziwe.
4. Karta jest **wyłącznie backendowa**. Zakaz dotykania `canonical_analysis.py` (karta C) i `ui2/wyniki/oltc/**` (zmiana kontraktu ekranu → sekcja 4).

**Bramka:** (a) test: `minimize_switching` bez `target_kv` → NIEDOSTĘPNY + kod gotowości, `best_position is None`; (b) test na realnym Newtonie: pozycja odległa 4,54 % od celu nie jest zwracana jako optymalna, gdy jedynym kryterium z modelu jest `deadband_kv` = 0,2 kV; (c) test kontraktu: `to_dict()` zawiera nazwę, wartość i źródło użytego kryterium.
**Iniekcja:** wstaw z powrotem `0.05 * target_kv` → (b) czerwone; usuń kryterium z `to_dict()` → (c) czerwone. Dodatkowo: istniejący test `test_minimize_switching_prefers_initial_when_feasible` (odchyłka 1,38 %) **przechodzi dla dowolnego progu** — wykonawca ma go wzmocnić, bo dziś jest bramką pozorną.

---

### KARTA E — Bilans VT: kategoria uzwojenia bez domysłu (R5)
**Zakres (wyłączny):** `/home/user/MV-Design-PRO/mv-design-pro/backend/src/api/equipment_checks.py`, `/home/user/MV-Design-PRO/mv-design-pro/backend/tests/api/test_equipment_checks_api.py`, `/home/user/MV-Design-PRO/mv-design-pro/frontend/src/ui2/kryteria/SekcjaBilansuCtVt.tsx`, `/home/user/MV-Design-PRO/mv-design-pro/frontend/src/ui2/kryteria/strings.ts`, `/home/user/MV-Design-PRO/mv-design-pro/frontend/src/ui2/kryteria/__tests__/kryteria.test.tsx`.

**Rozstrzygnięcia:**
1. Fallback `accuracy_class_metering or accuracy_class` wolno uruchomić **tylko** gdy `kategoria_z_klasy(accuracy_class)` daje POMIAROWE. Gdy daje ZABEZPIECZENIOWE, a proszono o POMIAROWE (i symetrycznie): kategoria = None, `status_spadku = UNAVAILABLE`, kod `vt.winding_category_missing` (kod już istnieje w rejestrze — nie wymyślać nowego).
2. Ekran **musi renderować `kategoria_uzwojenia` obok limitu** — dziś podmiana jest niewidoczna, a etykieta opcji mówi „pomiarowe (limit 0,5 %)" tuż nad wierszem „Limit: 1,0 %".
3. Zakaz „naprawy" przez filtrowanie pickera — to ukryłoby problem zamiast go rozwiązać.

**Bramka:** (a) test parametryczny 13 rekordów × 2 uzwojenia: nigdy PASS na limicie niezgodnym z pytanym uzwojeniem; (b) test „kontrolka żyje": dla rekordu jednouzwojeniowego odpowiedzi dla POMIAROWE i ZABEZPIECZENIOWE muszą się różnić (kategorią lub kodem); (c) test frontu: przy UNAVAILABLE widać uczciwy stan zerowy i zdanie kodu.
**Iniekcja:** przywróć `or pozycja.accuracy_class` → (a) czerwone na `vt_15kv_100v_3p_abb`; usuń render kategorii → (c) czerwone. Zwróć uwagę: istniejący test celowo wybiera pozycję warunkiem `if pozycja.accuracy_class_metering` — to bramka omijająca własną gałąź, do przepisania.

---

### KARTA F — Koniec fabrykowanej gotowości w kopercie migawki (R6)
**Zakres (wyłączny):** `/home/user/MV-Design-PRO/mv-design-pro/frontend/src/ui2/legacy/useLegacyOrchestrator.ts`, `/home/user/MV-Design-PRO/mv-design-pro/frontend/src/ui/topology/snapshotStore.ts` (tylko jeśli konieczne dla „gotowość nieustalona"), nowy test obok hooka.

**Rozstrzygnięcia:**
1. Literał `readiness: {ready:true, blockers:[], warnings:[]}` i `fix_actions: []` znika. **Zakaz zastąpienia go innym literałem** (np. `ready:false`) — gotowość ma być albo prawdziwa, albo jawnie nieustalona.
2. Wczytanie migawki przebiegu **nie może nadpisywać** stanu gotowości bieżącego modelu.
3. Test **musi ćwiczyć realną ścieżkę** — bez opakowania całego ładowania w `await act(...)`, bo to właśnie ten wzorzec ukrył defekt (precedens z zasady „test maskujący defekt = dwa defekty").
4. Etykieta stanu „nieustalona" — patrz sekcja 4 pkt 3; do decyzji wykonawca używa istniejącego stanu zerowego, nie wymyśla nowego napisu.

**Bramka:** (a) test na produkcyjnym hooku: model z W002+W003 → po wejściu na `#analysis?run=…` `podsumujGotowosc` nadal {blokady 0, ostrzeżenia 2}; (b) test blokad: model z BLOKADĄ → chip nie mówi „Model: zwalidowany"; (c) test zimnego deep-linku (przeładowanie).
**Iniekcja:** przywróć literał → (a) i (b) czerwone.

---

### KARTA G — Współbieżność magazynu ENM (R7)
**Zakres (wyłączny):** `/home/user/MV-Design-PRO/mv-design-pro/backend/src/enm/store.py`, `/home/user/MV-Design-PRO/mv-design-pro/backend/src/enm/dziennik_zmian.py`, `/home/user/MV-Design-PRO/mv-design-pro/backend/src/api/station_templates.py`, `/home/user/MV-Design-PRO/mv-design-pro/backend/src/application/station_templates/apply.py`, nowy `/home/user/MV-Design-PRO/mv-design-pro/backend/tests/enm/test_store_concurrency.py`.

**Rozstrzygnięcia (najbardziej podatne na improwizację):**
1. **Zamiana `def` → `async def` NIE jest naprawą** — chowa wyścig za pętlą zdarzeń, nie usuwa go. Zakazane.
2. Blokada per-`case_id` (reentrant) musi obejmować **cały cykl odczyt→przeliczenie→zapis** operacji szablonowej, nie samo `set_enm`. Blokada tylko w `set_enm` zostawia zgubiony zapis, bo `apply.py` czyta model wcześniej.
3. Plik tymczasowy dostaje **unikalną nazwę** (pid + uuid) w `store.py` i `dziennik_zmian.py`; `replace()` zostaje.
4. Wpis do dziennika i inkrementacja rewizji **w tej samej sekcji krytycznej** — dziury w dzienniku (rewizje bez wpisu) są osobnym defektem do zamknięcia w tej karcie.
5. Ochrona międzyprocesowa i `snapshot_base_hash` w `ApplyTemplateRequest` — **poza kartą** (sekcja 4 pkt 7).

**Bramka:** (a) test: 4 wątki × `apply` na jednym case, zsynchronizowane `threading.Barrier` → stacje +4, rewizja +4, zero 422, każdy zwrócony `station_ref` obecny w modelu; (b) test dziennika: liczba wpisów == liczba rewizji; (c) 20 powtórzeń bez ENOENT.
**Iniekcja:** zdejmij blokadę → test (a) musi być czerwony **w ≥3 z 5 przebiegów**; jeśli nie jest, test jest za słaby i wymaga mocniejszej bariery. Wymóg twardy: bramka wyścigowa bez wymuszonej synchronizacji nie zostanie przyjęta.

---

### KARTA H — Bramka CI, która nigdy nie skanowała (R8)
**Zakres (wyłączny):** `/home/user/MV-Design-PRO/mv-design-pro/scripts/no_direct_fault_params_guard.py`, nowy `/home/user/MV-Design-PRO/mv-design-pro/scripts/test_no_direct_fault_params_guard.py`.

**Rozstrzygnięcia:**
1. Poprawka ścieżki (usunięcie zdublowanego segmentu `mv-design-pro`) w `BACKEND_SRC` **i** `BACKEND_TESTS`.
2. **Pusty skan = RC 1, nie RC 0.** Guard musi wypisywać liczbę przeskanowanych plików i kończyć się błędem, gdy wynosi zero. To reguła klasy — proponuję rozciągnąć na pozostałe guardy osobną kartą.
3. `is_whitelisted` nie może zwracać `True` przy `ValueError` z `relative_to` — to była druga warstwa pustki.
4. **Wykonawca NIE re-baseline'uje białej listy sam.** Dostarcza inwentarz 37 plików / 220 trafień z propozycją klasyfikacji; decyzję podejmuje nadzorca przed scaleniem (sekcja 4 pkt 5). Dopisanie 37 plików do białej listy „żeby przeszło" = maskowanie długu, odrzucenie karty.

**Bramka:** (a) test guarda na fikstrze w `/tmp` z naruszeniem → RC=1; na czystej → RC=0; (b) asercja „przeskanowano > 0 plików"; (c) kod wyjścia łapany bezpośrednio, nigdy przez pipe.
**Iniekcja:** przywróć zdublowany segment ścieżki → (b) czerwone.

---

## 3. Rozłączność i kolejność scalania

Żadne dwie karty nie dzielą pliku — sprawdziłem to odczytem, w szczególności: A ma na wyłączność `domain_operations.py` (god-file, największe ryzyko konfliktu), C ma `canonical_analysis.py` (dlatego D jest czysto solverowa), G ma `store.py` (dlatego B, która zmienia zachowanie wywoływanego z niego `catalog_completion`, nie dotyka store'a), E i F to rozłączne poddrzewa `ui2/`.

**Sprzężenia numeryczne (nie plikowe):** B, C i D zmieniają liczby. Kolejność scalania: **A → H → G → B → C → D → E → F**. Po scaleniu B i po scaleniu C — pełna regresja backendu + golden + determinizm od nowa, nie tylko testy karty. Karty E, F, H są numerycznie obojętne i mogą wejść w dowolnym momencie.

**Wymóg wspólny każdej karty:** pełna regresja właściwej warstwy z kodem wyjścia łapanym bezpośrednio, właściwe guardy, hashe/determinizm, kontrakty FROZEN nietknięte, oraz **udokumentowany wynik iniekcji** (zrzut czerwonej bramki) w opisie commitu. Karta bez dowodu, że bramka gryzie, nie jest gotowa.

---

## 4. Czego NIE wolno naprawiać bez decyzji właściciela

1. **Skąd bierze się kryterium dopuszczalności napięcia w OLTC** — `TapChanger.deadband_kv` z modelu, jawne pole „dopuszczalna odchyłka" w żądaniu, czy limit normatywny. Każda z opcji to inna fizyka doboru zaczepu. Do decyzji obowiązuje wariant NIEDOSTĘPNY z karty D.
2. **Czy pole „Napięcie, które chcemy utrzymać" staje się wymagane** — zmiana kontraktu ekranu badań OLTC.
3. **Nazwa i zachowanie stanu „gotowość nieustalona"** (karta F) — nowa polska etykieta widoczna dla inżyniera plus rozstrzygnięcie, czy chip pokazuje gotowość bieżącego modelu, czy migawki przebiegu.
4. **Martwy `check_snapshot_readiness`** (`network_model/catalog/readiness_checker.py`) z blokadą `catalog.materialization_failed`, niewołany z żadnego modułu produkcyjnego: ożywić jako bramkę (u istniejących projektów pojawią się nowe blokady) czy usunąć jako martwy kod. Ożywienie zmienia gotowość widoczną dla użytkownika.
5. **Definicja kanonicznej warstwy wiązania FaultScenario** (biała lista karty H) — 220 trafień w 37 plikach preexisting. Decyzja architektoniczna, nie wykonawcza.
6. **Rozszerzenie zakresu `load_flow_no_heuristics_guard.py` na `network_model/solvers/`** — dziś ten katalog jest poza zasięgiem guarda, co jest powodem, dla którego pasmo ±5 % przeżyło. Rozszerzenie zapali nieznaną liczbę plików.
7. **Model wdrożeniowy magazynu ENM** — czy potrzebna blokada międzyprocesowa (uvicorn >1 worker / wiele instancji) oraz czy wprowadzić `snapshot_base_hash` do `ApplyTemplateRequest` (odpowiedź 409 = zmiana kontraktu API).
8. **Dane, których nie ma:** trzy przekładniki VT czysto zabezpieczeniowe (`vt_15kv_100v_3p_abb`, `vt_20kv_100v_3p_abb`, `vt_24kv_100v_3p_schneider`) — czy katalog dostaje uzupełnienie klasy pomiarowej z danych producenta, czy pozostają bez uzwojenia pomiarowego. Bez decyzji: kod gotowości, nigdy domysł.
9. **Skutek karty B dla istniejących projektów** — nadanie Q wszystkim domyślnym odbiorom nN zmienia hashe ENM i unieważnia wyniki wszystkich zapisanych biegów. Potrzebna decyzja: migracja cicha, komunikat dla użytkownika, czy wersjonowanie.
10. **Semantyka `bus_results.p_injected_mw`** (karta C, pkt 5) — wartości w istniejących raportach dla sieci ZIP się zmienią. Traktuję to jako poprawkę błędu, nie zmianę kontraktu FROZEN, ale potwierdzenie należy do właściciela.
11. **Reprezentacja generacji na szynie z odbiorem ZIP** (generator = stała moc PQ) — to rozstrzygnięcie fizyczne karty C i musi trafić do `docs/v12xx/REJESTR_KONFLIKTOW.md` jako wpis kanonu, a nie zostać w kodzie jako domysł wykonawcy.