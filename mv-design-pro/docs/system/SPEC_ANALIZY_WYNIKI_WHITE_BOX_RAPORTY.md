# SPEC_ANALIZY_WYNIKI_WHITE_BOX_RAPORTY

Status: wiazacy dla aktywnego toru canonical-only.

Kod:
- `backend/src/enm/mapping.py`
- `backend/src/enm/canonical_analysis.py`
- `backend/src/api/analysis_runs.py`
- `backend/src/api/power_flow_runs.py`
- `backend/src/api/canonical_run_views.py`
- `backend/src/api/sld.py`
- `frontend/src/ui/proof/TraceMetadataPanel.tsx`
- `frontend/src/ui/proof/export/exportTraceJsonl.ts`
- `frontend/src/ui/proof/export/exportTracePdf.ts`

Aktywny przeplyw:
- `snapshot` ENM jest mapowany do solvera przez `backend/src/enm/mapping.py`,
- wykonanie analizy prowadzi `backend/src/enm/canonical_analysis.py`,
- wynik kanoniczny przechowuje `snapshot_hash`, `input_hash`, `validation`, `readiness`, `white_box_trace`; dla rozplywu rowniez `power_flow_trace`,
- rozszerzony trace budowany przez `build_extended_trace()` zwraca `catalog_context` wyprowadzony ze snapshot: `element_id`, `catalog_binding`, `materialized_params`, `parameter_origin` i `manual_overrides`, jesli sa dostepne.

Reguly aktualne:
- solver czyta pola instancyjne galezi i transformatorow, nie czyta bezposrednio koperty odpowiedzi `materialized_params`,
- katalog dociera do solvera tylko tam, gdzie operacja domenowa skopiowala dane katalogowe na pola instancyjne elementu,
- `GET /api/analysis-runs/{run_id}/results/trace` zwraca rozszerzony White Box z `catalog_context`,
- `build_run_trace_payload()` zwraca trace z `CanonicalRun`, a frontendowy White Box czyta kontekst katalogowy z `trace.catalog_context`,
- eksporty sladu po stronie frontendu (`JSONL`, `PDF`) przenosza ten sam `catalog_context` bez domyslania danych poza snapshot,
- backendowy overlay SLD czyta tylko wynik `CanonicalRun` i nie modyfikuje geometrii.

API i eksport:
- aktywne trace: `GET /api/analysis-runs/{run_id}/trace`, `GET /api/analysis-runs/{run_id}/trace/summary` oraz `GET /api/analysis-runs/{run_id}/results/trace`,
- aktywne eksporty rozplywu: `GET /api/power-flow-runs/{run_id}/export/json|docx|pdf`,
- ogolne `analysis-runs/.../export/docx|pdf` zwracaja `410 Gone`.

Granice aktualnego stanu:
- backendowe eksporty `power-flow-runs/{run_id}/export/json|docx|pdf` pozostaja osobnym torem raportowym i nie przenosza jeszcze pelnego `catalog_context` z rozszerzonego White Box,
- wynikowe `element_ref` sa czesto identyfikatorami solvera (`bus_id`, `fault_node_id`), a nie zawsze bezposrednio `ref_id` elementu ENM.

Siec zwarciowa bez admitancji poprzecznych galezi (karta BEZ-POJEMNOSCI, zgoda B-01 architekta):
- siec zgodna i przeciwna (Z_2 = Z_1) zwarc IEC 60909 to `short_circuit_core.build_zbus` = `AdmittanceMatrixBuilder.build(siec_zwarciowa=True)` — BEZ B/2 linii i kabli; podstawa IEC 60909-0:2016 p. 5.2 e) (zalozenia obliczen: pojemnosci linii, admitancje poprzeczne i obciazenia niewirujace pomija sie — z wyjatkiem skladowej zerowej) i p. 5.3.1 (zastepcze zrodlo napiecia c·U_n/√3 w miejscu zwarcia jedynym napieciem czynnym sieci); jedno zrodlo tekstu: `network_model/core/ybus.py::PODSTAWA_POMINIECIA_ADMITANCJI_POPRZECZNYCH`,
- skladowa zerowa zachowuje pojemnosc doziemna B0 (`enm/mapping.py::_assemble_zero_sequence_y0`) — p. 5.3.2: w sieci z punktem neutralnym izolowanym i skompensowanym pojemnosci zerowe linii uwzglednia sie; w sieci izolowanej to jedyna droga pradu doziemnego; rozplyw, estymacja stanu i dynamika (`build_ybus_pu`) zachowuja B/2 (pojemnosc jest fizyka stanu ustalonego),
- slad White Box wiersza zwarcia ma krok `admitancje_poprzeczne_pominiete` (lista linii i kabli w ruchu z B ≠ 0: identyfikator, nazwa z modelu, B·l [S]; suma; uwaga = tekst podstawy) — wylacznie gdy cos pominieto; siec bez takich galezi ma slad bit w bit jak przed karta,
- rozplyw pradu Thevenina po galeziach liczy prad z admitancji szeregowej TEJ SAMEJ sieci, z ktorej powstala Z-bus — zespolona suma pradow galezi wchodzacych do wezla zwarcia rowna sie pradowi iniekcji dokladnie (przed karta bocznik B/2 wezla zwarcia pobieral jego czesc); suma modulow w kroku `thevenin_flow_balance` jest mu rowna dla zasilania promieniowego (test `test_zwarcie_bez_admitancji_poprzecznych.py`).

Rozplyw pradu zwarciowego galezi — wklad pominiety (karta PROG-ZERA-WKLADOW, zgoda B-01 wlasciciela z 2026-10-21):
- jedyna definicja progu: `PROG_WKLADU_POMIJALNEGO_A = 1e-6` [A] (= 1e-9 kA) w `backend/src/network_model/solvers/short_circuit_contributions.py`; jedyny predykat `jest_wkladem_pominietym(I) = abs(I) < PROG_WKLADU_POMIJALNEGO_A` (ostra nierownosc — wklad dokladnie na progu jest publikowany, NaN nie jest pomijany) stosowany w OBU torach wkladow galeziowych (superpozycja falownikowa i podzial pradu Thevenina) oraz na wkladzie przeniesionym zrodla,
- wpis o |I| < 1e-6 A to „wklad pominiety na podstawie tolerancji numerycznej (|I| < 1e-6 A)” — NIE zero: nie trafia do `branch_contributions`, do kroku sladu `thevenin_flow_<galaz>` ani do sumy kontrolnej KCL (`thevenin_flow_balance` sumuje galezie opublikowane); trafia do addytywnego pola wyniku `wklady_pominiete` (exclude-None; zrodlo, galaz, tor `thevenin`/`falownik`, |I| obciete w strone zera do 3 cyfr znaczacych, kat fazora albo `None` dla fazora zerowego; kolejnosc (zrodlo, galaz)) i do kroku sladu `wklady_pominiete` (liczba wpisow i suma modulow per tor, suma fazorowa toru Thevenina — z wartosci obcietych, wiec krok jest funkcja zestawienia),
- `GET /api/analysis-runs/{run_id}/results/short-circuit/rozplyw` oddaje obok `branch_contributions` i `branch_flow_trace` pola `wklady_pominiete` (projekcja z `ref_id` galezi i nazwa z modelu, prad w kA) oraz `prog_wkladu_pominietego_a` — odbicie jedynej definicji progu; warstwa prezentacji nie ma wlasnej stalej progu ani tokenu kierunku „brak”,
- eksporty raportu (JSON/DOCX/PDF) i pakiet dowodowy nie niosa rozplywu galeziowego w zadnej postaci (K13 — wiersz niesie wylacznie flage `branch_contributions_available`), wiec nie moga pokazac innego zbioru galezi niz endpoint rozplywu,
- analizy czytajace prad galezi z rozplywu (kryterium cieplne przewodu, czas wylaczenia per galaz) dla galezi bez opublikowanego wkladu nie wykazuja pradu 0 A: pole pradu `None`, uzasadnienie nazywa wklad pominiety i granice progu (`application/analyses/prad_zwarciowy_galezi.py::galaz_bez_opublikowanego_wkladu`).

Wklad zrodla do pradu zwarciowego (karta WKLAD-ZRODLA, zgoda B-01 architekta z 2026-10-22, GPZ H5 R8):
- metoda zastepczego zrodla napiecia (IEC 60909-0:2016 §4.2): zasilania systemowe (Y_Q = Z_base/Z_Q), szyny sztywne i maszyny wirujace (Z_base/Z″) sa bocznikami macierzy Y; wklad bocznika k do zwarcia w wezle f to `I_Q,k = Y_Q,k · Z_kf · I_k''(Th)` (kolumna Z_bus[:, f] tej samej faktoryzacji, z ktorej licza sie wklady galeziowe; kierunek „do wezla zwarcia” jak w `branch_contributions`); admitancja zrodel per wezel pochodzi z metod stemplujacych budowniczego macierzy (`admitancje_zrodel_macierzy` w `backend/src/network_model/solvers/short_circuit_contributions.py` wywoluje `_ground_slack_buses` i `_add_machine_shunts` na macierzy zerowej), rozbicie na zrodla to `boczniki_zrodel` (szyna sztywna = reszta przekatnej stempla po maszynach); zgodnosc rozbicia z macierza sprawdza krok bilansu i test `test_rozbicie_na_zrodla_rowne_stemplowi_macierzy`,
- rozklad liczy sie w sieci zgodnej dla kazdego rodzaju zwarcia (3F, 1F, 2F, 2F+Z), skalowany pradem I_k''(Th) tego rodzaju — ta sama podstawa co wklady galeziowe; falowniki nie sa na liscie (stoja per zrodlo w `contributions` wiersza), I_k'' = I_k''(Th) + I_k(falowniki),
- klasa wpisu `klasa`: `WKLAD`, `POMINIETY` (jedyny predykat `jest_wkladem_pominietym`, |I| obciete do 3 cyfr znaczacych w strone zera) albo `INNA_WYSPA` — zrodlo w innej wyspie macierzy niz wezel zwarcia (`wyspy_macierzy`: skladowe spojne wzoru niezerowych wpisow tej samej macierzy Y, ktora odwrocono) ma wklad STRUKTURALNIE zerowy z przyczyna,
- addytywne pola wyniku `wklady_zrodel` i `wklady_zrodel_slad` (exclude-None, `OPTIONAL_SHORT_CIRCUIT_RESULT_KEYS`); slad: krok `wklad_zrodla_<zrodlo>` per zrodlo i jawny krok `wklady_zrodel_bilans` (Σ I_Q,k fazorowo + prad czlonow poprzecznych galezi = I_k''(Th), reszta w `max(1e-9·|I|, 1e-6 A)`; czlon poprzeczny = suma kolumnowa macierzy Y sieci zwarciowej minus admitancja zrodel wezla — wylacznie przekladnia poza-znamionowa transformatorow, y·(1 − 1/a)²: admitancje poprzeczne linii i kabli nie wchodza do sieci zwarciowej (karta BEZ-POJEMNOSCI), wiec przy przekladniach znamionowych czlon jest zerowy i Σ I_Q,k = I_k''(Th) w tolerancji — test `test_bilans_wkladow_zrodel_kabel_o_duzym_b_bez_czlonow_poprzecznych` z B kabla do 2500 µS/km),
- klasa ladunku rozplywu punktu (`KLUCZE_ROZPLYWU` w `canonical_run_repository.py`): oba pola utrwalane w `canonical_run_branch_flows` (kolumny `wklady_zrodel_json`, `wklady_zrodel_slad_json`), liczone na zadanie albo w biegu jak `branch_contributions`,
- `GET /api/analysis-runs/{run_id}/results/short-circuit/rozplyw` oddaje `wklady_zrodel` (projekcja `_sc_wklady_zrodel`: odnosnik zrodla z modelu ENM, nazwa wezla, prad w kA w miejscu zwarcia i na zaciskach zrodla, kat fazora, udzial wzgledem I_k''; sort po odnosniku) i `wklady_zrodel_slad`; typ kontraktu frontu `WkladZrodlaRozplywu` (`frontend/src/ui/results-inspector/types.ts`).
