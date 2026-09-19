# KARTA W6-1 — „Kontrakty czasu": dane dynamiczne w ENM, zdarzenia w scenariuszu, kanoniczny wynik czasowy (projekt architekta)

**Status:** WIĄŻĄCA (rozstrzygnięcia architekta; synteza `SYNTEZA_DOMKNIECIA_PRODUKTU_2026-09.md` §2.6, §2.11 W6-1,
§4.1 A-9/A-12/A-13/A-15). **Warunek wejścia:** W6-0 odebrane (S-1+S-4, S-2, S-3) — karta dotyka `calculation_readiness`,
`inverter.py`, `provenance.py`, które W6-0 zmienia. **Wykonawca:** agent (implementacja kontraktów wg tej karty);
projekt i odbiór: architekt. **Zero fizyki** w tej karcie: kontrakty, walidacja, gotowość, persystencja, API, UI wyboru —
żadnego całkowania (to W6-2).

## §0 Rozstrzygnięcia

1. **Parametry dynamiczne jako typowany blok ENM, addytywnie, `exclude_none`:** `Generator.dynamika: ParametryDynamiczne | None`
   (`enm/models.py`; `None` = brak danych, NIGDY domyślka). `ParametryDynamiczne` = unia dyskryminowana po `rodzina`:
   - `MaszynaSynchroniczna` (`rodzina="synchroniczna"`): `s_n_mva`, `h_s`, `d_pu`, `xd_pu`, `xq_pu`, `xd_prim_pu`, `xq_prim_pu`,
     `xd_bis_pu`, `xq_bis_pu`, `td0_prim_s`, `tq0_prim_s`, `td0_bis_s`, `tq0_bis_s`, `xl_pu`, `nasycenie_s10`, `nasycenie_s12`,
     `ra_pu`; `wzbudzenie: RegulatorNapiecia | None` (`typ: "SEXS" | "IEEE_ST1A" | "IEEE_AC1A"`, `ka`, `ta_s`, `tb_s`, `tc_s`,
     `efd_min_pu`, `efd_max_pu`), `turbina: RegulatorObrotow | None` (`typ: "TGOV1" | "HYGOV"`, `r_pu`, `t1_s`, `t2_s`, `t3_s`,
     `p_max_pu`, `p_min_pu`), `stabilizator: StabilizatorSystemowy | None` (`typ: "PSS1A"`, `ks`, `tw_s`, `t1_s`…`t4_s`, limity);
   - `PrzeksztaltnikGFL` (`rodzina="przeksztaltnikowa_gfl"`): `i_max_pu`, **`priorytet_ogranicznika: "bierna" | "czynna"`
     (WYMAGANY, bez domyślki — A-9)**, `pll_kp`, `pll_ki`, `reg_pradu_kp`, `reg_pradu_ki`, `k_frt` (wzmocnienie prądu
     biernego przy zapadzie), `prog_frt_pu`, `tp_s`, `tiq_s`, `p_odbudowa_pu_na_s`, `p_odbudowa_opoznienie_s`,
     `droop_p_f_pu`, `martwa_strefa_f_hz`, `droop_q_u_pu`, `martwa_strefa_u_pu`, `u_min_ciagle_pu`, `u_max_ciagle_pu`;
   - `PrzeksztaltnikGFM` (`rodzina="przeksztaltnikowa_gfm"`): `tryb: "droop" | "vsm"`, `mp_pu`, `mq_pu`, `h_wirtualne_s`,
     `d_wirtualne_pu`, `r_wirtualne_pu`, `x_wirtualne_pu`, `i_max_pu`, **`strategia_ograniczenia: "impedancja_wirtualna" |
     "nasycenie_zadania"` (WYMAGANA, bez domyślki — shadow review §12: postać zmierzona, nie wybrana)**, `tp_s`, `tiq_s`;
   - `Magazyn` (`rodzina="magazyn"`): `e_n_kwh`, `p_ladowania_max_kw`, `p_rozladowania_max_kw`, `sprawnosc_ladowania`,
     `sprawnosc_rozladowania`, `soc_min`, `soc_max`, `soc_poczatkowy`, `regulacja_f: RegulacjaCzestotliwosciMagazynu | None`
     (`droop_pu`, `martwa_strefa_hz`, `p_rezerwa_pu`), `przeksztaltnik: PrzeksztaltnikGFL | PrzeksztaltnikGFM`
     (magazyn = energia + przekształtnik; jedna baza mocy `s_n_mva` przekształtnika — łańcuch baz z laboratorium `bazy_bess`);
   - `TurbinaWiatrowa` (`rodzina="wiatr_typ_1" | "wiatr_typ_2" | "wiatr_typ_3" | "wiatr_typ_4"`): `h_calkowite_s`,
     `sztywnosc_walu_pu`, `tlumienie_walu_pu`, `poslizg_ustalony_pu`, `crowbar: Crowbar | None` (typ 3), `pitch_tempo_deg_s`,
     `pitch_min_deg`, `pitch_max_deg`, `przeksztaltnik: PrzeksztaltnikGFL | None` (typ 3/4).
   Każde pole liczbowe ma zakres fizyczny (`ge`/`le`) i **żadnego `default=` liczbowego**; walidacje krzyżowe
   (`xd_bis ≤ xd_prim ≤ xd`, `soc_min < soc_max`, `p_rozladowania_max_kw ≤ s_n·1000`) jako `model_validator` z komunikatem PL.
2. **Proweniencja bloku:** `ParametryDynamiczne.proweniencja: ProweniencjaParametrow` = `{zrodlo: "karta_producenta" |
   "certyfikat_jednostki" | "profil_typowy_normy" | "deklaracja_uzytkownika", odniesienie: str (numer dokumentu/normy),
   data: str | None}` — WYMAGANA; `profil_typowy_normy` jest legalnym źródłem (IEEE 1547-2018, IEC 61400-27-1, EN 50549),
   ale wybranym JAWNIE przez projektanta; stopień dowodowy wyniku z takiego profilu: `DECLARATION` na osi proweniencji
   wejścia (rejestr A-2 rozszerzony o `zrodlo_parametrow`), nigdy `VALIDATED_SIMULATION` z automatu.
3. **Katalog `der_dynamic` przestaje niemo dostarczać wartości:** `InverterDynamicProfile`/`WindTurbineDynamicProfile`
   tracą `default=` na polach fizycznych (stają się wymagane), dostają `proweniencja` (p. 2) i mapują się 1:1 na
   `ParametryDynamiczne`; 8 profili „domyślnych" (`defaults.py`, deklarowane jako „praktyka: SMA/Tesla/Vestas/GE") →
   przemianowane na **profile typowe normy** z proweniencją `profil_typowy_normy` i odniesieniem do normy (wartości, których
   nie da się przypisać do normy, ZNIKAJĄ — brak = brak); `resolve_der_dynamic_profile` NIE zwraca profilu, gdy nie ma
   jawnego wyboru ani wpisu katalogu przekształtnika (`DerDynamicResolution.source = "brak"`) — koniec „ZAWSZE zwraca
   profil — żaden DER nie zostanie bez modelu". Readiness: `der.dynamic_profile_default` (WARNING) → **kasacja**, brak
   jawnego profilu = `blocked` `der.dynamika_missing` (kod istniejący `der.dynamic_profile_missing` rozszerzony o listę
   brakujących pól). Kreator OZE (`ui2/kreatory/zrodlo-oze`) i drawer DER (`DerWiazaniaEditor`): wybór profilu jawny
   (picker istnieje od FAB-L L3), pola parametrów widoczne z proweniencją; brak = pole puste z akcją, nie liczba.
   `materialized_params` przekształtnika (`enm/domain_operations_v2.py::_build_converter_materialized_params`) niesie
   `dynamika` skopiowaną z katalogu z proweniencją (jedna prawda zapisu: `materialized_params`, jak dla k_sc — S-2).
4. **Maszyny synchroniczne wchodzą do produktu:** `Generator.gen_type == "synchronous"` dostaje kreator/edytor bloku
   `MaszynaSynchroniczna` (ui2: sekcja w kreatorze źródła zasilania / drawer DER — jedna powierzchnia edycji bloku dla
   wszystkich rodzin), katalog `MASZYNA_SYNCHRONICZNA` (przestrzeń katalogowa nowa, wpisy z proweniencją; na start
   wyłącznie profile typowe z literatury normatywnej — IEEE 421.5 dla regulatorów, Kundur dla przykładów TESTOWYCH,
   nie katalogowych) — readiness `stability` przestaje zwracać `n_a` dla maszyn synchronicznych (P0-10).
5. **Zdarzenia w scenariuszu, addytywnie:** `OperatingScenario.dynamika: ScenariuszDynamiczny | None` =
   `{horyzont_s, krok_wyjscia_s, zdarzenia: tuple[ZdarzenieDynamiczne, ...]}`; `ZdarzenieDynamiczne` = unia po `rodzaj`:
   `Zwarcie(t_s, bus_ref, typ: "3F" | "2F" | "1F" | "2FZ", r_f_ohm, x_f_ohm, t_usuniecia_s | None)`,
   `WylaczenieGalezi(t_s, element_ref)`, `ZalaczenieGalezi(t_s, element_ref)`, `OdlaczenieZrodla(t_s, ref_id)`,
   `SkokObciazenia(t_s, ref_id, delta_p_mw, delta_q_mvar)`, `KomendaRegulacji(t_s, ref_id, nastawa: Nastawa)`,
   `Synchronizacja(t_s, ref_id, bus_ref)`. Kolejność kanoniczna = `(t_s, indeks)`; walidator: `t_s ≤ horyzont_s`, refy
   istnieją w modelu, zwarcie usuwane przed horyzontem albo jawnie nieusuwane; `apply_scenario` NIE stosuje zdarzeń
   (to solver W6-2 czyta harmonogram) — scenariusz statyczny (`out_of_service`, `setpoints`) obowiązuje jako stan
   początkowy. Magazyn scenariuszy (`enm/scenariusze.py`) serializuje blok addytywnie; hash scenariusza obejmuje blok.
6. **Kanoniczny wynik czasowy `ResultSetDynamicV1`** (`application/contracts/resultset_dynamic_v1.py`, FROZEN po odbiorze
   W6-2; osobny kontrakt, `ResultSetV1` nietknięty — DT-10/A-13): `kontrakt: "resultset_dynamic_v1"`, `run_id`,
   `analysis_type: "dynamika_rms"`, `kanaly: [{klucz, przestrzen: "siec" | "urzadzenie" | "regulator" | "magazyn",
   jednostka, element_ref | null, opis_pl}]`, `os_czasu_s: [float]`, `probki: {klucz: [float]}` (kwantyzacja 9 cyfr na
   granicy kontraktu — DT-11), `zdarzenia_wykonane: [{t_zaplanowany_s, t_wykonany_s, rodzaj, ref, delta_x_max,
   delta_y_max, residuum_kcl_max}]`, `wlasnosci_biegu: {zbiegl: bool, kroki: int, kroki_odrzucone: int,
   max_residuum_f, max_residuum_g, czas_obliczen_s, integrator: str, dt_s: float, tolerancja: float}`,
   `tozsamosc: {odcisk_migawki, odcisk_punktu_pracy, odcisk_nastaw_solvera, odcisk_harmonogramu, odcisk_implementacji,
   wersja_solvera}`, `metryki: [{klucz, wartosc, jednostka, wzor_ref, element_ref | null}]` (np. `u_min_pu`,
   `t_odbudowy_p_s`, `rocof_max_hz_s`, `delta_f_max_hz`, `cct_s` gdy liczone), `stopien_dowodowy: [CapabilityEvidence]`
   (rejestr A-2; dziś `UNVALIDATED_MODEL`), `zalozenia: [str]`. Persystencja: metadane + metryki + tożsamość w
   `CanonicalRun.raw_result`; **szeregi czasowe w osobnej tabeli** `canonical_run_time_series` (run_id, klucz kanału,
   próbki; wzorzec `CanonicalRunBranchFlowORM` — lekcja PERF-SC-50/K5: nigdy w wierszu biegu); API:
   `GET /api/analysis-runs/{id}/results/dynamika` (bez próbek) + `GET …/results/dynamika/time-series?kanaly=a,b`
   (na żądanie; brak = 404 nazwany). Snapshot OpenAPI.
7. **Rodzaj biegu `dynamika_rms`** w rejestrze (`api/v125_contracts.py` mapy solver_family/formula_set/standard_basis,
   `canonical_analysis.execute` dyspozytor → w W6-1 wykonawca ODMAWIA nazwanym kodem `dynamika.rdzen_niedostepny`
   (`OdmowaBiegu…`) — bez fasady; W6-2 podpina rdzeń), readiness typ `dynamika_rms` (`calculation_readiness`):
   każde źródło ma blok `dynamika` z proweniencją (per rodzina, per pole), scenariusz dynamiczny istnieje i jest
   spójny, rozpływ punktu pracy `ready`; `stability`/`frt_hvrt` zostają do OD-20 z etykietą diagnostyczną (S-1).
8. **Pole osierocone `Load.load_profile_ref`** (zapis bez odczytu, K-E) — **kasacja** w tej karcie (operacja domenowa,
   modele, migracja `nn_field_specs`/kompilator, FE typy) z bramką wskrzeszenia; profile czasowe wracają w W6-6 razem
   z konsumentem (QSTS) jako encja `ProfilCzasowy` — nie wcześniej (funkcja bez konsumenta = dług).
9. **Archiwum dowodowe wątku badawczego:** `docs/audit/archive/dynamika_2026-09/` — kopie `KARTA_MAX_DYNAMIC_SIMULATION_AUDIT_2026-09.md`,
   `PAKIET_DECYZYJNY_DYNAMIKA_D01_D13_2026-09.md`, `WORK_SHADOW_REVIEW_LATEST.md`, `RAPORT_NAPRAW_PO_AUDYCIE_2026-09-12.md`,
   `PRE_FABLE_DYNAMIC_ENGINEERING_HANDOFF_2026-09.md` z gałęzi `origin/claude/max-dynamic-audit-kzbivg@85084102`, każdy z
   nagłówkiem „ARCHIWUM DOWODOWE — nie kanon; źródło: gałąź/SHA; klasyfikacja: synteza §3"; `docs_archive_guard` zielony.
10. **Czego NIE robić:** żadnego całkowania ani fizyki (W6-2); nie dotykać `network_model/solvers/**`; nie dodawać
    domyślek liczbowych; nie tworzyć drugiego magazynu scenariuszy; nie rozszerzać `ResultSetV1`; nie zostawiać
    resolvera „zawsze zwraca profil".

## §1 Inwentarz klasy (do zmierzenia przed implementacją)

konsumenci `resolve_der_dynamic_profile`/`get_profile`/`DEFAULT_*` (readiness, FRT, stability, kreator, API katalogu
`GET /api/catalog/der-dynamic-profiles`), wszystkie pola `default=` w `der_dynamic/models.py` (liczba), miejsca zapisu
`materialized_params` przekształtnika, konsumenci `load_profile_ref` (zapis/odczyt/FE), serializacja scenariuszy i hash,
mapy rodzajów biegów (`v125_contracts`, `execution_runs`, FE `analysisType` unie), OpenAPI.

## §2 Testy (iloczyn cech)

rodzina × (komplet / brak pola / poza zakresem / niespójność krzyżowa) × proweniencja (karta / certyfikat / profil typowy /
deklaracja) → walidacja i readiness; scenariusz: zdarzenia × (t poza horyzontem / ref nieistniejący / kolejność) × hash;
`ResultSetDynamicV1`: kwantyzacja, determinizm serializacji, próbki poza wierszem biegu (rozmiar odpowiedzi biegu bez
szeregów), 404 nazwany; katalog: 0 pól z domyślką liczbową (test AST/pydantic po klasie), profile typowe z odniesieniem
normy; resolver bez jawnego wyboru → `brak`; kasacja `load_profile_ref` → guard wskrzeszenia; parytet ENM round-trip
(zapis/odczyt/ZIP) z blokiem `dynamika`; snapshot OpenAPI; e2e: kreator OZE z jawnym profilem i widocznymi parametrami.

## §3 DoD

pełna regresja backendu + wyrocznia pandapower; mypy; `guardy_z_ci.py` komplet; snapshot OpenAPI; vitest/tsc/eslint;
e2e realny backend (kreator OZE, gotowość); złote hashe bez zmian (blok `dynamika` nie wchodzi do wejścia PF/SC —
test parytetu assemblera PRZED/PO); meldunek UCZCIWOŚĆ.
