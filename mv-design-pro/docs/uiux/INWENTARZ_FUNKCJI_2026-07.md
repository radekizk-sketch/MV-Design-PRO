# INWENTARZ FUNKCJI OBLICZENIOWYCH I POWIERZCHNI UI — 2026-07

**Status:** WIĄŻĄCY dla Programu UI/UX 2026-07 (podrzędny wobec kanonu V12.xx)
**Data inwentaryzacji:** 2026-07-15 (żywy klon, gałąź `claude/power-network-design-ui-ir91mv`, HEAD `95d0576`)
**Rewizja:** 2026-07-20 (Audyt F) — synchronizacja z rzeczywistą powierzchnią kodu na HEAD `b30249d`; delty w §8.
**Rewizja:** 2026-07-25 (audyt FLOW, karty F-K1…F-K3) — powierzchnia kryteriów projektowych (solver cieplny, dwie analizy kryterialne, agregat werdyktu, 3 końcówki, 1 nowy moduł UI); delty w §9.
**Rewizja macierzy pokrycia (§6):** 2026-08-06 (karta G-09 audytu bramek U2–U5) — rewizja WSZYSTKICH 45 wierszy przeciw kodowi na szczycie `f6be9185`, w ramach domykania bramki U4; bilans i wzorzec luk na końcu §6.
**Metoda:** listing katalogów + grep w żywym repo (bez zgadywania). Każdy wpis ma źródło w postaci ścieżki.
**Cel:** gwarancja „ŻADNA funkcja obliczeniowa nie zostaje pominięta" w przebudowie UI/UX.
**Reguła nadrzędna:** każda pozycja z §1–§3 MUSI mieć przypisaną powierzchnię UI w §6 (macierz pokrycia).
Pozycja bez powierzchni UI = luka do zaprojektowania w Programie UI/UX, nie do zignorowania.

---

## 1. Solvery (fizyka; `backend/src/network_model/solvers/`)

| # | Moduł | Funkcja | Plik(i) |
|---|---|---|---|
| S1 | Zwarcia IEC 60909 | Prądy zwarciowe I''k, ip, Ith, wkłady źródeł | `short_circuit_iec60909.py`, `short_circuit_core.py`, `short_circuit_contributions.py` |
| S2 | Zwarcia maszyn IEC 60909 | Wkłady silników/generatorów | `machine_sc_iec60909.py` |
| S3 | Rozpływ mocy Newton–Raphson | Load flow NR (+ wariant wewnętrzny) | `power_flow_newton.py`, `power_flow_newton_internal.py` |
| S4 | Rozpływ mocy Gauss–Seidel | Load flow GS | `power_flow_gauss_seidel.py` |
| S5 | Rozpływ mocy Fast Decoupled | Load flow FD | `power_flow_fast_decoupled.py` |
| S6 | Rozpływ niesymetryczny | Load flow dla stanów niesymetrycznych | `power_flow_unbalanced.py` |
| S7 | Modele falowników w rozpływie | Źródła OZE (inwertery) w LF | `power_flow_inverter.py` |
| S8 | Modele obciążeń ZIP | Obciążenia napięciowo-zależne | `power_flow_zip.py` |
| S9 | Pętla zwarciowa IEC 60364 (nn) | Impedancja pętli, warunek samoczynnego wyłączenia | `fault_loop_iec60364.py`, `fault_loop_builder.py` |
| S10 | Charakterystyki zabezpieczeń IEC 60255 | Krzywe czasowo-prądowe przekaźników | `protection_iec60255.py` |
| S11 | Testy NC RfG / PTPiREE | Zgodność przyłączeniowa modułów wytwarzania | `ncrfg_ptpiree/` (pakiet) |
| S12 | FRT / HVRT | Przejazd przez zapady/wzrosty napięcia | `frt_hvrt/` (pakiet) |
| S13 | Stabilność RMS | Symulacje stabilności RMS | `stability_rms/` (pakiet) |
| S14 | Estymacja stanu WLS | Weighted Least Squares + benchmark syntetyczny | `state_estimation_wls.py`, `state_estimation_synthetic_benchmark.py` |
| S15 | Stan fazowy SN | Analiza stanu fazowego sieci SN | `phase_state_sn.py` |
| S16 | Podgląd źródła sieciowego | Parametry zwarciowe źródła zasilania (preview) | `grid_source_preview.py` |
| S17 | Pakiet akademicki V12.6 | Ekrany E-40..E-50 (analizy akademicko-przemysłowe) | `v126_academic.py` |
| S18 | Infrastruktura WHITE BOX rozpływu | Trace, typy, wynik (FROZEN) | `power_flow_trace.py`, `power_flow_result.py`, `power_flow_types.py` |
| S19 | Regulacja OLTC w rozpływie | Rozpływ z zaczepami transformatora + studia zaczepów | `power_flow_oltc.py`, `power_flow_oltc_studies.py` (wpięte przez `enm/canonical_analysis.py`, `analysis/reporting/oltc_report.py`) |
| S20 | Spadek napięcia na kablu (preview) | Preview spadku napięcia kabla | `cable_voltage_drop.py` (endpoint `/api/solver/cable-voltage-drop-preview`, `/api/solver/cable-rated-current-preview`); korekta obciążalności: `cable_ampacity_derating.py` (endpoint `/api/solver/cable-ampacity-derating-preview`, `/api/solver/cable-laying-conditions`) |
| S21 | Prądy znamionowe transformatora (preview) | Preview prądów znamionowych | `transformer_rated_currents.py` (endpoint `/api/solver/transformer-rated-currents-preview`) |
| S22 | Kompensator równoległy (preview) | Preview doboru kompensatora bocznikowego | `shunt_compensator_preview.py` (endpoint `/api/solver/shunt-compensator-preview`) |

> Uzupełnienie 2026-07-20: solvery S19–S22 istnieją w `network_model/solvers/` i były pominięte
> w inwentaryzacji 2026-07-15. Pakiet `src/solvers/` (podpakiety `power_flow/`, `short_circuit/`)
> to obecnie puste stuby (`__init__.py` tylko) — fizyka pozostaje w `network_model/solvers/`.

## 2. Analizy (interpretacja, bez fizyki; `backend/src/analysis/`)

| # | Moduł | Funkcja |
|---|---|---|
| A1 | `arc_flash` | Analiza łuku elektrycznego (arc flash) |
| A2 | `boundary` | Identyfikacja granic (BoundaryIdentifier — TYLKO tu, nie w modelu) |
| A3 | `coverage_score` | Ocena pokrycia analizami |
| A4 | `energy_validation` | Walidacja energetyczna |
| A5 | `grid_strength` | Siła sieci (SCR/miary sztywności) |
| A6 | `lf_sensitivity` | Wrażliwość rozpływu mocy |
| A7 | `machine_short_circuit` | Interpretacja zwarć maszynowych |
| A8 | `normative` | Zgodność normatywna |
| A9 | `power_flow` + `power_flow_interpretation` | Interpretacja wyników rozpływu |
| A10 | `protection_curves_it` | Krzywe I–t zabezpieczeń |
| A11 | `protection_insight` | Wnioski / diagnostyka zabezpieczeń |
| A12 | `reactive_adequacy` | Adekwatność mocy biernej |
| A13 | `recommendations` | Rekomendacje |
| A14 | `reporting` | Generacja raportów (PDF/DOCX) |
| A15 | `sanity_bounds` | Kontrola granic wiarygodności wyników |
| A16 | `scenario_comparison` | Porównania scenariuszy |
| A17 | `sensitivity` | Analiza wrażliwości |
| A18 | `ssci_stability` | Stabilność SSCI (interakcje podsynchroniczne, OZE) |
| A19 | `voltage_profile` | Profil napięciowy |

## 3. Proof Engine (WHITE BOX — dowody obliczeń)

Pakiety dowodowe (źródło: `backend/tests/proof_engine/`, `docs/proof_engine/`):
SC3F (zwarcie 3-fazowe, z obowiązkowymi I_dyn oraz I_th), VDROP (spadek napięcia), Equipment
(wytrzymałość cieplna/dynamiczna), Power Flow, Losses/Energy (straty), Protection (nadprądowe),
Earthing (ziemnozwarciowe), LF Voltage, pakiet akademicki V12.6.
Eksport: `proof.json`, `proof.tex`, `proof.pdf`, DOCX. Matematyka wyłącznie w LaTeX `$$...$$`.

**Droga do inżyniera (stan 2026-08-08, karty PACK-DOWODY / PACK-ROZPLYW / PACK-BEZ-KONSUMENTA).**
Pakiety pobiera się JEDNĄ drogą — `GET /api/analysis-runs/{run}/pakiet-dowodowy[/dostepnosc]`,
sekcja „Pakiet dowodowy" okna dowodu. Rodzaj pakietu wynika z DANYCH biegu, nigdy z ekranu.
Pakiet biegu rozpływu jest ZBIORCZY: `rozplyw.zip` (zbieżność, bilans P/Q, zakres napięć) +
`straty.zip` (straty gałęziowe, sumy, udział) + `spadek_napiecia.zip` (ΔU na ODCINKU wskazanym
przez użytkownika, o ile bieg ma linię lub kabel). Bez konsumenta pozostają DWA generatory —
`protection_settings` i `qu_regulation` — każdy z powodu BRAKU DANYCH nazwanego pole po polu
w `docs/v12xx/REJESTR_KONFLIKTOW.md` (wiersz PACK-BEZ-KONSUMENTA), nie z powodu zakresu.

## 4. Powierzchnia API (`backend/src/api/`, 62 moduły)

Routery wpięte w `main.py` (38, stan HEAD `b30249d`): analysis_runs, audit2_catalogs, audit2_station_config,
catalog, comparison, diagnostics, equipment_proof_pack, health, ncrfg_ptpiree_tests,
power_flow_comparisons, power_flow_runs, reference_networks, project_archive, projects, proof_pack,
protection_comparisons, protection_analysis_runs, reference_patterns, sld, station_templates,
study_cases, xlsx_import, enm, execution_runs, unified_runs, v126_academic, result_contract_v1,
fault_loop, fault_scenarios, generators, grid_source_preview, sld_overrides, switchgear_config,
solver_capabilities, solver_input, **oze_analysis_runs**, **quality_analysis_runs**, **reference_engine**.

Nowe routery wpięte (dodane 2026-07-20, źródło: `api/main.py` include_router):
- **oze_analysis_runs** (`api/oze_analysis_runs.py`) — analizy OZE/DER: `/api/oze-analysis/lom-protection`,
  `/grid-strength`, `/reactive-adequacy`, `/hosting-capacity`, `/pq-area`, `/compensation-sizing`,
  `/frt-trajectories`, `/frt-sequence`, `/pq-coverage`, `/compliance-certificate(.docx/.pdf)`,
  `/osd-application(.docx/.pdf)`, `/osd-response`, `/connection-study(.docx/.pdf)`.
- **quality_analysis_runs** (`api/quality_analysis_runs.py`) — jakość/kontrola: `/api/quality/sanity-bounds`,
  `/energy-validation`, `/flicker`, `/as-built-compliance`, `/arc-flash`, `/arc-flash/report(.pdf/.docx)`.
- **reference_engine** (`api/reference_engine.py`) — Reference Engine: `/api/reference/packs`,
  `/api/reference/packs/{pack_id}`, `/api/cases/{case_id}/reference/compliance`.

Wpięcie pozostałych modułów `src/api/` — PRZEMIERZONE 2026-08-08 (karta ROUTERY-MARTWE)
po **tożsamości funkcji obsługi w żywej aplikacji**, nie po nazwie pliku ani napisie ścieżki.
Pomiar z 2026-07-15 (grep importów) mylił się w trzech miejscach i wszystkie trzy są tu
sprostowane — dlatego ta lista nie jest już utrzymywana ręcznie, tylko **pilnowana przez
`scripts/router_mount_guard.py`** (router zdefiniowany = router wpięty albo świadomie
odstawiony z uzasadnieniem; zapadka działa w obie strony).

- **Wpięte pośrednio** (importowane przez zamontowane routery): analysis_case_context,
  analysis_run_exports, canonical_run_views, domain_ops_policy, v125_contracts,
  protection_runs (przez 5-liniowy reeksport `protection_analysis_runs` — 6 tras ŻYWYCH
  pod `/api/...`; poprzedni pomiar zaliczał ten moduł do niewpiętych).
- **SPROSTOWANIA poprzedniego pomiaru:** `cases` NIE był „wpięty w main.py" — `main.py`
  nigdy go nie importował, więc jego 3 trasy nie istniały dla nikogo; `batch_execution`
  JEST wpięty (karta BATCH-ROUTER); `case_runs` już nie istnieje jako plik.
- **USUNIĘTE 2026-08-08** jako cienie zdolności wystawionych żywą trasą albo sieroty bez
  konsumenta: analysis_runs_index, analysis_runs_read, cases, design_synth,
  domain_operations, protection_engine_v1 (sam router HTTP; `domain/protection_engine_v1.py`
  zostaje — jest żywy przez `application/execution_engine`), snapshots, topology_links.
  Uzasadnienie per moduł w komunikacie commitu kasacji.
- **ŚWIADOMIE ODSTAWIONE** (moduł zostaje, router niewpięty, decyzja o ZDOLNOŚCI należy do
  osobnej karty — uzasadnienia merytoryczne w `SWIADOMIE_ODSTAWIONE` w guardzie):
  protection_coordination, archive_diff, incremental_archive, cloud_backup.
  Reguła właściciela: montować WYŁĄCZNIE z konsumentem — trasa bez odbiorcy to fantom.

## 5. Powierzchnia frontendu (stan zastany)

### 5a. `frontend/src/ui/` — powierzchnia klasyczna (56 katalogów, listing 2026-07-20)

analysis-eligibility, app-state, audit, canon, catalog, common, comparison, config, context-menu,
contracts, data-manager, engineering-readiness, enm-inspector, fault-scenarios, field, help,
history, icons, inspector, issue-panel, mode-gate, navigation, ncrfg-tests, network-build,
notifications, onboarding, power-distribution, power-flow-comparison, power-flow-results,
project-archive, projects, proof, property-grid, protection, protection-comparison,
protection-coordination, protection-curves, reference-networks, reference-patterns, reports,
results, results-inspector, schema-completeness, selection, settings, shared, shell, sld,
sld-editor, sld-overlay, status-bar, study-cases, tech-card, topology, voltage-profile, workspace
(+ pliki: index.ts, operatingMode.ts, types.ts, `__tests__`).

> Zmiana od 2026-07-15 (rewizja Audyt F): usunięto katalogi `active-case-bar`, `layout`,
> `sensitivity` (63 → 56). Funkcja wrażliwości (`sensitivity`) migruje do `ui2/` (patrz §5b).

### 5b. `frontend/src/ui2/` — nowa powierzchnia klasy przemysłowej (NOWE, dodane 2026-07-20)

Katalog `ui2/` był całkowicie pominięty w inwentaryzacji 2026-07-15. To docelowa powierzchnia
Programu UI/UX (clean-room). Struktura (listing 2026-07-20):
- Rdzeń: `AppRoot.tsx`, `shell/`, `nav/`, `theme/`, `search/`, `freshness/`, `events/`, `model/`,
  `adapters/`, `legacy/`, `referencje/` (Reference Engine), `inspector/` (panel właściwości + zakładki).
- **`spaces/`** (przestrzenie robocze): `projekt`, `model`, `obliczenia`, `wyniki`, `gotowosc`.
- **`kreatory/`** (kreatory elementów): `zrodlo`, `zrodlo-oze`, `transformator`, `pole`, `lacznik`,
  `odbior`, `kompensator`, `magistrala`, `pierscien`, `rama`.
- **`wyniki/`** (ekrany wyników): `zwarcia`, `rozplyw`, `analizy`, `jakosc`, `koordynacja`, `dowod`,
  `porownanie`, `kontrakt-analizy`, `odbior`, `oltc`, `wzorzec`.
- **`oze/`** (analizy OZE/DER): `pulpit` (m.in. `SekcjaSilySieci.tsx`, `SekcjaAdekwatnosciQ.tsx`),
  `frt`, `krzywe`, `lom`, `macierz`, `obszar`, `osd`, `wniosek`, `studium`, `kompensacja`,
  `ranking`, `zdolnosc`, `ncRfgStore.ts`, `api.ts`.

Poza `ui/`/`ui2/`: `designer/` (kreator), `engine/sld-layout/` (silnik layoutu), `modules/`,
harnessy renderu (`screenshot-harness-main.tsx` i pokrewne).

> UWAGA: struktura opisana w `CLAUDE.md` (sekcja Project Structure) jest snapshotem historycznym
> i częściowo rozjechana z powyższym listingiem. Dla powierzchni UI wiążący jest TEN inwentarz.
> `ui2/` jest objęty guardem `scripts/ui_no_physics_guard.py` (zero fizyki w warstwie prezentacji).

## 6. MACIERZ POKRYCIA: funkcja obliczeniowa → API → UI

Status: ✅ pełne pokrycie UI (powierzchnia + test) · ◐ częściowe (jedno zdanie: czego konkretnie brakuje) · ❌ BRAK powierzchni UI (luka).
Metoda dowodu (rewizja 2026-08-06): dla KAŻDEGO wiersza — listing końcówek backendu (`grep '@router'`)
przeciw ich konsumpcji we froncie (`grep` po ścieżce URL i po nazwie funkcji klienta), montaż komponentu
(import w rodzicu, nie samo istnienie pliku) oraz plik testu. Zdanie „brak konsumenta" oznacza ZERO
wystąpień poza definicją i testem. Kod wygrywa z dokumentem.

| Funkcja | Solver/Analiza | API | UI (stan zastany) | Status |
|---|---|---|---|---|
| Zwarcia IEC 60909 | S1 | fault_scenarios, execution_runs, unified_runs | `ui2/wyniki/zwarcia` (EkranZwarc, wykres Ik″, rozpływ zwarciowy, weryfikacja aparatury), zakładka „Zwarcia" warsztatu wyników; 7 testów | ✅ |
| Zwarcia maszyn | S2 + A7 | ✅ `POST /api/proof/sc3f/contributions` | `ui2/wyniki/zwarcia/WkladyZwarciowe.tsx` — rozwijany szczegół wkładu z parametrami maszyny IEC 60909 (Ir, μ, q, Ib) i śladem wywodu, zamontowany w `EkranZwarc.tsx:25`; test `wkladyZwarciowe.test.tsx` | ✅ (2026-08-06: powstała DEDYKOWANA sekcja ekranu — poprzednie ◐ „tylko przez ProofPack" nieaktualne) |
| Rozpływ NR/GS/FD | S3–S5 | power_flow_runs, power_flow_comparisons | `ui2/wyniki/rozplyw` (szyny, gałęzie, profil napięć), `ui2/wyniki/zbieznosc` (ślad iteracji, zaczepy); 8 testów | ✅ |
| Rozpływ niesymetryczny | S6 | ✅ tor sieci referencyjnych: `POST /api/v1/reference-networks/{id}/run` (dobór BFS per faza dla `is_unbalanced` w `solve_reference_network`) + `/validate` | `ui/reference-networks/ReferenceNetworkRunPanel` (konsument `runReferenceNetwork`: napięcia węzłów, zbieżność, iteracje) zamontowany w powierzchni E-39, osiągalnej kartą „Walidacja sieci referencyjnych" huba „Pozostałe analizy" (`ui2/wyniki/analizy/model.ts`); 4 testy panelu | ◐ (2026-08-07, ROUTERY-4A: łańcuch klik→BFS→wynik domknięty dla WBUDOWANYCH sieci referencyjnych IEEE 13/34-bus; bieg niesymetryczny na modelu PROJEKTU nadal nie istnieje — to osobna zdolność toru biegów) |
| Falowniki OZE w LF | S7 | generators, grid_source_preview, operacje ENM | `ui2/kreatory/zrodlo-oze` — pełna regulacja falownika (`control_mode` STALY_COS_PHI / Q_OD_U ze spadkiem i strefą nieczułości, q_min/max, magazyn); 6 testów | ◐ (kontrakt `PowerFlowResult`/`PowerFlowTrace` nie niesie wyniku regulacji falownika — w wynikach nie widać, który tryb zadziałał ani czy limit Q został osiągnięty) |
| Obciążenia ZIP | S8 | solver_input (materializacja katalogowa), `add_nn_load` | `ui2/kreatory/odbior` — sekcja „Model obciążenia (ZIP)": udziały `a`/`b`/`c` dla P i Q, wrażliwość częstotliwościowa `k_pf`/`k_qf`, sumy na bieżąco, walidacja `a+b+c = 1`; prefill z pozycji katalogowej; 31 testów kreatora + 23 kontraktu backendu | ✅ (2026-08-06: komplet ośmiu współczynników dopisany do `ui_fields` kontraktu OBCIAZENIE i wystawiony w kreatorze; wartości płyną do `Load.materialized_params`, skąd czyta je rozpływ. Wejście do modelu ma JEDEN kontrakt — `enm/load_zip_model.py` — wołany przez wszystkie trzy drogi zapisu: `add_nn_load`, `create_device`, `update_element_parameters`. Stała moc nie zapisuje żadnego klucza, więc istniejące projekty liczą identycznie) |
| Pętla zwarciowa nn IEC 60364 | S9 | fault_loop (`POST /api/fault-loop/compute`), `GET /api/cases/{id}/enm/station-fault-loop` | `ui2/inspector/SekcjaPetlaZwarcia` (Z_loop, Ik min/max, składniki pętli) zamontowana w `InspectorPanel.tsx:321`; test | ◐ (pełna końcówka `/api/fault-loop/compute` — warunek samoczynnego wyłączenia i dobór zabezpieczenia — ma jedynego konsumenta w `ui/sld/v2/fault-loop/FaultLoopResultPanel.tsx`, renderowanym WYŁĄCZNIE we własnym teście) |
| Zabezpieczenia IEC 60255 | S10 + A10, A11 | protection_* (5 routerów) | `ui2/wyniki/koordynacja` (EkranKoordynacji + SekcjaNastaw, 2 testy), `ui2/model/zabezpieczenia-automatyka` (E-27, test) | ✅ |
| NC RfG / PTPiREE | S11 | ncrfg_ptpiree_tests: `/catalog`, `/run`, `/cases/{case_id}/compliance` | `ui2/oze/macierz` (MacierzNcRfg, panel modułu, szczegół werdyktu — 4 testy), bieg przez `ncRfgStore` | ◐ (2026-08-06: przekrojowa zgodność liczona Z MODELU — `GET /api/ncrfg-tests/cases/{case_id}/compliance`, raport per DER dla wskazanego operatora — nie ma we froncie ANI JEDNEGO konsumenta) |
| FRT / HVRT | S12 | ncrfg_ptpiree_tests, `/api/oze-analysis/frt-trajectories`, `/frt-sequence` | `ui2/oze/frt` (EkranFrt + wykres trajektorii + model sekwencji); 4 testy | ✅ |
| Stabilność RMS | S13 | ✅ execution_runs (DYNAMIC_STABILITY) → `application/stability/dynamic_stability.py` | `ui2/wyniki/stabilnosc` (EkranStabilnosci: scenariusz, werdykt, kryteria, ślad automatyki); 3 testy | ◐ (2026-08-06: ekran żywi się przebiegami DYNAMIC_STABILITY, natomiast SILNIK wskazany w §1 — `solvers/stability_rms/engine.py` — nie ma w backendzie ANI JEDNEGO wywołania poza własnym pakietem: nie istnieje ścieżka S13 → API → UI) |
| Estymacja stanu WLS | S14 | ✅ `POST /api/quality/state-estimation` (+ `/requirements`) — quality_analysis_runs.py | `ui2/wyniki/estymacja/EkranEstymacji` (wejście pomiarów → \|V\|/kąt/rezydua/χ²/LNR + WHITE BOX), zakładka „Estymacja stanu"; 2 testy | ✅ |
| Stan fazowy SN | S15 | ✅ analysis_runs + execution_runs | `ui2/wyniki/stan-fazowy/EkranStanuFazowego` (E-31: napięcia/prądy/straty per faza, wskaźniki asymetrii z flag solvera, stan obwodu, ograniczenia raportowe), zakładka „Stan fazowy"; test | ✅ (2026-08-06: poprzednie ◐ „9 plików" pochodziło sprzed powstania ekranu) |
| Podgląd źródła sieciowego | S16 | grid_source_preview | `ui2/kreatory/zrodlo/KreatorZrodloZasilania` (Sk″/Ik″/κ/ip/Ith/Z1/Z0 liczone przez backend); 3 testy | ✅ |
| Pakiet akademicki V12.6 | S17 | v126_academic (**14** rodzajow analiz — pomiar 2026-08-07 obalil `12`; 7 rodzin koncowek: bieg, wynik, slad, werdykt SSCI, dowod, raport, katalog) | `ui2/wyniki/akademickie/EkranAnalizAkademickich` — okno parametryzowane rodzajem (pelny wynik, pelny slad WHITE BOX, pakiet dowodowy, raport, dane odniesienia z katalogu, formularz parametrow projektowych 1:1 z kontraktem solvera), zakladka „Analizy akademickie” warsztatu Wynikow + ekrany trasowe E-40…E-50; 48 testow frontu + 6 CI parytetu | ✅ (2026-08-07, V126-OKNA: powierzchnia zastana `V126AcademicSurface.tsx` USUNIETA — jedno wejscie do zdolnosci, pilnowane testem CI. Limity `slice(0,8)`/`(0,3)`/`(0,18)` zastapione limitem Z DANYCH — zmierzone straty zastanej: 11 pol dla `ssci_impedance`, 6 dla `neutral_earthing_design`, po 4 dla `voltage_stability`/`earthing_safety`. Koniec fabrykacji danych wejsciowych w UI: zaszyty silnik 630 kW i narzucony sposob uziemienia punktu neutralnego usuniete, pole puste = klucz nieprzekazany. Katalog V12.6 ma wreszcie konsumenta. Rodzaje `neutral_earthing_design` i `earth_fault_detection`, dotad bez wejscia, sa osiagalne) **◐ (2026-08-07, V126-JEZYK — po ocenie wlasciciela 0/10 wiersz WRACA NA ◐: dane byly komplety, ale ekran mowil kodami kontraktu, nie jezykiem inzyniera; karta dala 14 rodzajom werdykt z kryterium, jednostki, nazwy obiektow ze schematu, polski slad z liczba i jednostka oraz straznika na renderze. decyzja wlasciciela o dwoch kandydatach do wygaszenia ZAPADLA — patrz nizej)** **◐ (2026-08-07, V126-WYGASZENIE — DECYZJA WLASCICIELA „wycofac OBA z ekranu”: (1) `benchmark_validation` (bada narzedzie, nie projekt) zdjety z listy wyboru okna i z nawigacji (E-49 `visibleInNavigation: false`); zdolnosc backendu NIETKNIETA i uruchamiana w kontroli jakosci przez `backend/tests/application/reference_networks/test_ieee_benchmark_wiring.py` (IEEE 9/14/39 vs pandapower, solver produkcyjny); (2) margines P–U w `voltage_stability` zdjety z prezentacji WRAZ Z CALA RODZINA wielkosci z tego samego przyblizenia (`voltage_stability_margin_percent`, tabela `pv_curves`: `lambda_max`, `u_at_max`, `margin_percent`) — wskaznik L z kryterium „L < 0,5” i zapas Q–U zostaja; pola pozostaja w odpowiedzi solvera (FROZEN), dlug nazwany w rejestrze. Zakaz cichego wykluczenia: rejestr `ui2/wyniki/akademickie/nieprezentowane.ts` z POWODEM na kazdy wpis, parytet `prezentowane + nieprezentowane = komplet kontraktu` pilnowany przez `backend/tests/ci/test_v126_rodzaje_parytet.py`, wiec rodzaj dodany w backendzie bez decyzji nadal zapala czerwien. 12 rodzajow analiz prezentowanych + 1 wycofany + `ssci_impedance` z wlasnym oknem = 14 kontraktu)** **◐ (2026-08-08, QU-FABRYKACJA: `voltage_stability` wycofany W CALOSCI — pomiar wykazal, ze wszystkie cztery jego wielkosci staly na mocy zwarciowej wezla podstawianej z napiecia znamionowego (`fault_level_mva` podane dla 1 z 315 szyn sieci odniesienia) oraz na wspolczynnikach bez pokrycia w danych i w normie: zapas mocy biernej z `0,15 · P` i `0,35 · P` mimo dostepnego `bus.load_mvar` i przy ZEROWYM pokryciu zdolnosci wytworczej Q (0 z 35 wytworcow niesie `GenLimits.q_min/max_mvar`, 0 — `pq_curve`), wskaznik L z mnoznika `· 4`. Solver 1.1 → 1.2 przestal je wyznaczac: kontrakt FROZEN w komplecie, wartosc `null` + `brak_danych` z powodem po polsku, sanity „dane niekompletne”. E-41 `visibleInNavigation: false` i zdjety z mapy rodzajow ekranow trasowych, ekran zostaje w kanonie. Ten sam defekt naprawiony w sasiedniej funkcji tego samego pliku: `_z_conv_components` bierze czestotliwosc podstawowa z kontraktu zamiast z zaszytego 2π·50. 11 rodzajow prezentowanych + 2 wycofane + `ssci_impedance` z wlasnym oknem = 14 kontraktu; inwentarz stalych calego solvera: `docs/audit/INWENTARZ_STALYCH_V126_2026-08-08.md`)** |
| Arc flash | A1 | ✅ `/api/quality/arc-flash` + `/report(.pdf/.docx)` | `ui2/wyniki/jakosc` sekcja 4 (energia incydentu, granica łuku, nagłówek najgorszego przypadku, eksport raportu PDF/DOCX); test `arcFlash.test.tsx` | ✅ (2026-08-06: potwierdzone jakościowo) |
| Siła sieci (SCR) | A5 | ✅ `/api/oze-analysis/grid-strength` | `ui2/oze/pulpit/SekcjaSilySieci` zamontowana w `KartaModulu.tsx:99` (pulpit OZE, zakładka warsztatu); test `SekcjaSilySieci.test.tsx` | ✅ |
| Adekwatność mocy biernej | A12 | ✅ `/api/oze-analysis/reactive-adequacy` | `ui2/oze/pulpit/SekcjaAdekwatnosciQ` zamontowana w `KartaModulu.tsx:102`; test `SekcjaAdekwatnosciQ.test.tsx` | ✅ |
| Stabilność SSCI | A18 | ✅ `POST /api/cases/{id}/runs/v126/ssci_impedance` + `GET /api/analysis-runs/{run_id}/results/v126/ssci_impedance/stability` | `ui2/wyniki/ssci/EkranSsci` (werdykt Nyquista z istotnością, uzasadnienie, metryki, proweniencja, ślad), zakładka „SSCI"; 2 testy | ✅ (2026-08-06: UI domknięte, poprzednie ◐ „0 plików" nieaktualne) |
| Sanity bounds | A15 | ✅ `/api/quality/sanity-bounds` | `ui2/wyniki/jakosc` sekcja 1 „Wiarygodność zwarciowa" + uczciwy stan zerowy prowadzący do brakującego biegu; testy `sekcje`/`ekranJakosci` | ✅ |
| Walidacja energetyczna | A4 | ✅ `/api/quality/energy-validation` | `ui2/wyniki/jakosc` sekcja 2 + kolumna „Obciążenie" tabeli gałęzi rozpływu (werdykt BRANCH/TRANSFORMER_LOADING); testy `sekcje`/`jakoscModel` | ✅ |
| Profil napięciowy | A19 | analysis_runs | `ui2/wyniki/rozplyw/ProfilNapiecChart` + oznaczanie wartości poza przedziałem EN 50160; test `profilNapiecChart.test.tsx` | ✅ |
| Wrażliwość (LF + ogólna) | A6, A17 | ✅ `GET /api/insights/sensitivity?run_id=` (`api/analysis_insights.py` → `application/analyses/wrazliwosc_rozplywu.py`: dowód spadków napięć + profil napięć + `LFSensitivityBuilder` + `SensitivityBuilder` z przebiegu PF) | `ui2/wyniki/wrazliwosc/EkranWrazliwosci` — zakładka „Wrażliwość" warsztatu Wyników (ranking czynników R/X/P/Q/U_n, marginesy przy ±delta%, stan zerowy z akcją biegu); 6 testów | ◐ (2026-08-07, ROUTERY-4A: wejścia zabezpieczeniowe wrażliwości ogólnej — analiza zabezpieczeń, krzywe I–t — nieprodukowalne z żadnego biegu kanonicznego; pominięcie zadeklarowane w odpowiedzi i w UI) |
| Zgodność normatywna | A8 | ✅ `/api/quality/design-verdict` (agregat `application/analyses/werdykt_projektowy.py`) | `ui2/wyniki/werdykt/EkranWerdyktu` (2 testy) + `ui2/spaces/gotowosc/PanelGotowosci` (9 testów); wskazywane dotąd `ui/engineering-readiness` i `ui/issue-panel` NIE MAJĄ konsumentów produkcyjnych | ◐ (moduł A8 `analysis/normative/evaluator.py` nie ma poza własnym pakietem ANI JEDNEGO importera — do łańcucha trafia wyłącznie `NormativeConfig` jako progi profilu napięć) |
| Porównania scenariuszy | A16 | comparison (`/api/comparison/runs`), power_flow_comparisons, protection_comparisons, `/api/short-circuit-comparisons` | `ui2/wyniki/porownanie` — A/B rozpływu (szyny/gałęzie/ranking) + tryb zwarciowy, z deep-linkiem do dowodu przebiegu A i B; 5 testów | ◐ (z trzech równoległych torów porównań osiągalny jest jeden: `ui/protection-comparison` i generyczne `/api/comparison/runs` nie mają ŻADNEGO konsumenta produkcyjnego) |
| Rekomendacje | A13 | ❌ brak końcówki dla `analysis/recommendations` | `ui2/wyniki/co-wymaga-uwagi` — skonsolidowany rejestr przekroczeń z akcją „Popraw w modelu" (źródła: werdykt projektowy + rozpływ); 2 testy | ◐ (zdolność obsłużona zastępczo z innych źródeł; moduł A13 `analysis/recommendations` nie ma w backendzie ANI JEDNEGO importera) |
| Pokrycie analizami | A3 | ✅ `GET /api/insights/analysis-coverage?case_id=` (`api/analysis_insights.py` → `application/analyses/pokrycie_analiz.py`: `CoverageScoreBuilder` na najnowszym zakończonym biegu PF przypadku) | `ui2/spaces/gotowosc/SekcjaPokryciaAnaliz` — punktacja 0–100 + braki + luki krytyczne (etykiety PL bez kodenamów — naprawa u źródła w `coverage_score/builder.py`); 5 testów | ✅ (2026-08-07, ROUTERY-4A; brakujące pakiety dowodowe na liście braków to PRZEDMIOT widoku, nie luka powierzchni) |
| Granice (boundary) | A2 | ✅ `GET /api/insights/network-boundary?case_id=` (`api/analysis_insights.py` → `application/analyses/granice_sieci.py`: `BoundaryIdentifier` na BIEŻĄCYM modelu ENM, case_params mapowane przepisem `ref_to_graph_id`) | `ui2/spaces/gotowosc/SekcjaGranicySieci` — szyna + metoda PL + ufność albo uczciwa diagnostyka PL; 4 testy | ✅ (2026-08-07, ROUTERY-4A; fasada `application/analyses/boundary.py` pozostaje bez importerów — łańcuch idzie wprost z `analysis/boundary`) |
| Raporty PDF/DOCX | A14 | ✅ `analysis-runs/{id}/export/report/{json,docx,pdf}` + `.../export/proof/{json,latex,pdf}` (komplet 6 końcówek) | `ui2/spaces/dokumentacja/generator/GeneratorRaportu` — KAŻDA kontrolka składu (zakres, poziom, profil, sekcje) jest parametrem realnego wywołania eksportu; zamontowany w `MostDokumentacji.tsx:53`; test | ✅ (2026-08-06: most E-37 z kontrolkami-atrapami zastąpiony) |
| Dowody WHITE BOX (wszystkie pakiety §3) | Proof Engine | proof_pack (`/sc3f/pack`, `/sc-asymmetrical/pack`, `/sc3f/contributions`), equipment_proof_pack, result_contract_v1 + **brama pakietu przebiegu** `GET /api/analysis-runs/{run}/pakiet-dowodowy[/dostepnosc]` (`application/proof_engine/pakiet_biegu.py`) | `ui2/wyniki/dowod` (PrzegladDowodu w kanonie pięciu pól, spis kroków, źródło LaTeX) + **sekcja „Pakiet dowodowy”** (`PakietDowodowy.tsx`: rodzaj pakietu i punkty zwarcia z serwera, pobranie ZIP, świeżość z `useSwiezoscWynikow`, uczciwy powód braku); 11 testów UI + 44 testy kontraktu bramy | ◐ (2026-08-07, karta PACK-DOWODY: pakiety zwarciowe — 3F oraz niesymetryczne 1F-Z/2F/2F-Z — mają realnego konsumenta i są deterministyczne bajt-w-bajt; `GET /api/proof/{project}/{case}/{run}/pack` to 410 Gone (wycofany świadomie, nie luka). POZA nawiasem z podaniem przyczyny: `/api/equipment-proof/pack` — katalog APARAT_SN nie niesie U_m ani I_cu, więc dwa z czterech kryteriów dałyby dowód z pozornym FAIL; pakiet rozpływu mocy — DOMKNIĘTY 2026-08-07 kartą PACK-ROZPLYW: rodzaj `ROZPLYW_MOCY` w tej samej bramie, wejście z zapisu biegu przez `application/solvers/power_flow_binding.py` (rozpływ NIE jest liczony po raz drugi), pakiet deterministyczny bajt-w-bajt w ośmiu wariantach modelu. Poza nawiasem zostaje wyłącznie `/api/equipment-proof/pack` — nazwany dług w rejestrze) |
| Migotanie (flicker) | `application/analyses/migotanie.py` | ✅ `/api/quality/flicker` | `ui2/wyniki/jakosc` sekcja 3 „Migotanie i szybkie zmiany napięcia" (Pst/Plt per moduł); test `migotanie.test.tsx` | ✅ |
| Zdolność przyłączeniowa (hosting capacity) | `application/analyses/hosting_capacity.py` | ✅ `/api/oze-analysis/hosting-capacity` | `ui2/oze/zdolnosc` (EkranZdolnosci + wykres), zakładka „Zdolność przyłączeniowa"; 3 testy | ✅ |
| Obszar/pokrycie P-Q | `application/analyses/pq_area.py`, `pq_coverage.py` | ✅ `/api/oze-analysis/pq-area`, `/pq-coverage` | `ui2/oze/obszar` (3 testy), `ui2/oze/krzywe` (3 testy), `ui2/oze/macierz` | ✅ |
| Dobór kompensacji mocy biernej | `application/analyses/dobor_kompensacji.py` | ✅ `/api/oze-analysis/compensation-sizing`, `/api/solver/shunt-compensator-preview` | `ui2/oze/kompensacja` (test) + `ui2/kreatory/kompensator` (3 testy, wykres Q(U)) | ✅ |
| Ochrona przed utratą sieci (LoM) | `application/analyses/ochrona_lom.py` | ✅ `/api/oze-analysis/lom-protection` | `ui2/oze/lom` (EkranLom + model doboru), zakładka „Ochrona LoM"; 2 testy | ✅ |
| Dokumenty przyłączeniowe OSD | `application/analyses/{wniosek_osd,odpowiedz_osd,dokument_studium,certyfikat_zgodnosci,zgodnosc_powykonawcza}.py` | ✅ `/api/oze-analysis/{osd-application,osd-response,connection-study,compliance-certificate}` (warianty .docx/.pdf), `/api/quality/as-built-compliance` | `ui2/oze/{osd,wniosek,studium}` — 7 testów, dowody dokumentów w osobnym teście API | ◐ (wniosek OSD i certyfikat zgodności eksportują WYŁĄCZNIE DOCX — końcówki `/osd-application.pdf` i `/compliance-certificate.pdf` bez konsumenta, choć studium przyłączeniowe ma komplet DOCX+PDF) |
| Regulacja OLTC w rozpływie | S19 | ✅ `solver_input:{oltc_study}` → `global_results.oltc_*` (`enm/canonical_analysis.py:1274`) | `ui2/wyniki/oltc/EkranBadanOltc` — wszystkie trzy rodzaje badania (przemiatanie zaczepów, profil roczny, optymalizacja) z wykresami; 2 testy; zaczepy również w `ui2/wyniki/zbieznosc` | ✅ |
| Preview kabla/transformatora/kompensatora | S20–S22 | ✅ `/api/solver/{cable-voltage-drop,cable-rated-current,transformer-rated-currents,shunt-compensator}-preview` + `/cable-laying-conditions` | `ui2/kreatory/magistrala` (ΔU), `ui2/kreatory/odbior` (prąd znamionowy), `ui2/kreatory/transformator`, `ui2/kreatory/kompensator`, `ui2/kreatory/zrodlo-oze/DoborToruSn`; 12 testów | ✅ |
| Reference Engine (paczki referencyjne) | — | ✅ `/api/reference/packs`, `/packs/{pack_id}`, `/api/cases/{id}/reference/compliance` (parametr `?packs=` — zawężenie oceny) | `ui2/referencje/WyborPakietuReferencyjnego` (wspólna kontrolka „Zakres oceny", jeden stan wyboru) → `ui2/spaces/gotowosc/SekcjaZgodnosciReferencyjnej` + `ui2/spaces/model/ZgodnoscReferencyjna` + `ui/enm-inspector/ReferencePanel` (osiągalny z ui2: Model → Diagnostyka); 25 testów + e2e zrzutów | ✅ (karta REF-PAKIET 2026-08-07: wybór pakietu pochodzi z listy rejestru, nie ze stałej — pakiety OSD wybierane RODZAJEM (`kind='osd'`), zapamiętany pakiet spoza rejestru wycofywany z powodem, uczciwy stan zerowy przy pustym rejestrze; „wszystkie referencje" = domyślne zachowanie backendu, nie wymyślony w UI pakiet domyślny. Klasy pilnuje test-strażnik czytający identyfikatory z katalogu pakietów backendu. Dług nazwany: `_osd_checks` w silniku zgodności implementuje reguły pod kodami `osd_enea.*` — inny standard OSD dostaje uczciwe „nie dotyczy" (0 sprawdzeń, zmierzone), a uogólnienie wymaga danych tego standardu — REF-PAKIET-DLUG-OSD-SILNIK w rejestrze) |
| Import XLSX | — | ✅ xlsx_import: `POST /api/import/xlsx/preview` (podgląd bez zapisu) + `POST /api/import/xlsx` (nowy projekt: węzły/gałęzie/źródła/odbiory + migawka aktywna, transakcyjnie) | `ui2/spaces/projekt/arkusz` — okno „Import sieci z arkusza (XLSX)": kafel pulpitu, podgląd „co wejdzie do modelu" z backendu, raport zastrzeżeń per wiersz (arkusz·wiersz·kolumna), bramka katalogowa, jawny następny krok; 13 testów natywną ścieżką | ✅ (karta XLSX-IMPORT 2026-08-07: teza „końcówka działa, brak konsumenta" OBALONA pomiarem — końcówka zwracała 422 „Brak biblioteki openpyxl" dla KAŻDEGO wejścia (biblioteki nie było w zależnościach), a wstrzykiwany `uow_factory` nie był używany: import niczego nie zapisywał, tylko meldował sukces. Naprawa u źródła: zależność, zapis do kanonicznego magazynu modelu, zero fizyki w warstwie aplikacji (dane źródła jako wejście), zero wartości fikcyjnych (`rated_current_a=1.0` usunięte), bramka katalogowa wspólna z importem ZIP) |
| Archiwum projektu (ZIP) | — | ✅ project_archive: `POST /projects/{id}/export` (parametr `zapisz_do_magazynu` → magazyn dokumentów, typ ARCHIWUM), `POST /projects/import`, `POST /projects/import/preview`; archive_diff, incremental_archive bez wejścia w UI | ui2/spaces/projekt/archiwum (okno „Archiwum projektu (ZIP)": kafel pulpitu + karta huba dokumentacji); `ui/project-archive` = warstwa zastana BEZ konsumenta produkcyjnego (kasacja: G-07) | ◐ (naprawa fałszywego ✅ — G-01 audytu bramek U2–U5: do 2026-08 karta huba prowadziła do przestrzeni bez akcji, a dialog warstwy zastanej miał zero konsumentów; wpięte eksport/import/podgląd, poza UI zostają różnicowanie i archiwum przyrostowe) |
| Katalog typów | — | catalog (44 końcówki), audit2_catalogs | `ui2/spaces/model/katalog` (KatalogPanel, KartaTechniczna, GdzieUzyty, ParametrRow); 7 testów | ✅ |
| Kreator sieci/stacji | — | station_templates, switchgear_config, reference_patterns; design_synth NIEWPIĘTY | `ui2/kreatory` — 18 kreatorów, KAŻDY z testem (48 plików testowych) + `ui2/spaces/model/szablony` (przeglądarka i porównanie szablonów stacji) | ◐ (`/api/reference-patterns` ma jedynego konsumenta w `ui/reference-patterns`, bez montażu produkcyjnego, a router `design_synth` nadal nie ma `include_router` w `main.py`) |
| Przypadki obliczeniowe | — | study_cases, unified_runs, batch_execution (WPIĘTY 2026-08-07: 4 końcówki serii przebiegów torem kanonicznym) | `ui2/spaces/obliczenia` (MenedzerPrzypadkow, NowyPrzypadek, UruchomObliczenie, PorownanieKonfiguracji, panel przebiegów, panel scenariuszy, panel serii przebiegów); 9 testów | ✅ (karta BATCH-ROUTER 2026-08-07: seria przebiegów end-to-end — router→serwis→biegi kanoniczne→`SeriePanel` z wejściem w wyniki lądowiskiem K3; teza „8 końcówek do wpięcia" OBALONA pomiarem: 4 wsadowe fabrykowały wyniki z żądania klienta, 4 porównawcze duplikowały żywe `/api/short-circuit-comparisons` — przepisane/usunięte; `api/case_runs.py` USUNIĘTY: fantomowy równoległy magazyn biegów, którego biegi nigdy nie wychodziły z CREATED, a ślad/pakiet dowodowy był fabrykowany) |
| SLD + nakładki wyników | — | sld, sld_overrides | `ui2/spaces/schemat` (przełącznik podglądu + następny krok, 2 testy) osadzający zastane `ui/sld`, `ui/sld-editor`, `ui/sld-overlay` | ◐ (OSOBNY WĄTEK — patrz Program §2.3) |

**Bilans rewizji 2026-08-06 (karta G-09 audytu bramek U2–U5 — domknięcie bramki U4).**
Przed rewizją: **11 ✅ / 34 ◐ / 0 ❌**. Po rewizji wobec kodu: **24 ✅ / 16 ◐ / 5 ❌**.
Werdykt zmieniło 24 z 45 wierszy: 16 wyszło z ◐ na ✅ (powierzchnia `ui2/` powstała po
2026-07-25 i nie była odnotowana — zwarcia maszyn, stan fazowy, SSCI, arc flash, siła sieci,
adekwatność Q, sanity bounds, walidacja energetyczna, migotanie, hosting capacity, P-Q,
kompensacja, LoM, OLTC, preview S20–S22, raporty), 3 zeszły z ✅ na ◐ (NC RfG, pakiet
akademicki V12.6, dowody WHITE BOX — pokrycie było liczone zdolnością, nie konsumpcją
końcówek), a 5 zeszło z ◐ na ❌ (rozpływ niesymetryczny, wrażliwość, pokrycie analizami,
granice, import XLSX — dotychczasowe ◐ opierało się na liczbie plików z trafieniem grepa,
a nie na istnieniu ścieżki solver → API → UI). Teza „0 funkcji ❌ zero-UI" z bilansu
2026-07-21c była zatem NIEPRAWDZIWA już w chwili zapisu dla trzech z tych pięciu zdolności.

**Wzorzec luk (do kart Programu UI/UX).** Cztery z pięciu ❌ mają tę samą przyczynę: moduł
analizy istnieje, ale nie prowadzi z niego ŻADEN router — brak nie jest brakiem ekranu, tylko
brakiem całego ogniwa łańcucha (dyrektywa właściciela §1). Osobna klasa to końcówki wpięte
w `main.py`, których front nie woła (import XLSX, przekrojowa zgodność NC RfG, pakiety
dowodowe, lista pakietów referencyjnych, warianty PDF dokumentów OSD) — tu backend jest
gotowy, brakuje wyłącznie konsumenta. Wszystkie ❌ i ◐ mają obowiązkowe karty zadań.

**Korekta punktowa 2026-08-05 (G-01 audytu bramek U2–U5).** Wiersz **Archiwum
projektu (ZIP)** zmieniony ✅ → ◐: poprzedni status był FAŁSZYWY — karta huba
dokumentacji celowała w przestrzeń „Projekt", w której nie było ŻADNEJ akcji
archiwum, a `ui/project-archive` (dialog warstwy zastanej) nie miał ani jednego
konsumenta produkcyjnego. Po naprawie: okno `ui2/spaces/projekt/archiwum`
(eksport z zapisem do magazynu dokumentów, import, podgląd zawartości), wejście
z kafla pulpitu i z karty huba. ◐, bo `archive_diff` i `incremental_archive`
nadal nie mają powierzchni. Pełna rewizja pozostałych wierszy — wykonana
2026-08-06 kartą G-09 (bilans powyżej).

**Aktualizacja 2026-08-07 (karta ROUTERY-4A — TOP-1 z kolejki G-09).** Cztery
z pięciu ❌ (wzorzec „brak routera, nie brak ekranu") domknięte łańcuchem
router→application→UI: **Granice** ❌→✅ i **Pokrycie analizami** ❌→✅ (nowy
router `api/analysis_insights.py`, sekcje przestrzeni „Gotowość"),
**Wrażliwość (LF + ogólna)** ❌→◐ (zakładka „Wrażliwość" warsztatu Wyników;
wejścia zabezpieczeniowe nieprodukowalne z żadnego biegu — pominięcie jawne)
i **Rozpływ niesymetryczny** ❌→◐ (konsument `runReferenceNetwork` + karta
E-39 w hubie; bieg na modelu projektu nadal nie istnieje). Bilans po karcie:
**26 ✅ / 18 ◐ / 1 ❌** (ostatni ❌: import XLSX). Szczegóły i pomiary:
`docs/v12xx/REJESTR_KONFLIKTOW.md` wiersz ROUTERY-4A.

**Aktualizacja 2026-08-07 (karta XLSX-IMPORT — ostatni ❌ macierzy).** Import XLSX ❌→✅.
Bilans po karcie: **27 ✅ / 18 ◐ / 0 ❌ — kolumna ❌ macierzy jest PUSTA.**
Uwaga do odczytu bilansu: zero ❌ znaczy „każda zdolność ma powierzchnię i test",
nie „nie ma już długu" — 18 wierszy ◐ nadal niesie nazwany brak w jednym zdaniu
i ma kartę w kolejce. Pomiar stanu przed i dowody: `docs/v12xx/REJESTR_KONFLIKTOW.md`
wiersz XLSX-IMPORT.

---

## 7. Reguła aktualizacji

Inwentarz aktualizuje wyłącznie zarządca programu (Fable) po zakończeniu fazy lub po zmianie
powierzchni obliczeniowej backendu. Każda aktualizacja = nowa data + dowody (listing/grep).

---

## 8. Rewizja 2026-07-20 (Audyt F)

Synchronizacja inwentarza z rzeczywistą powierzchnią kodu na HEAD `b30249d` (gałąź
`claude/power-network-design-ui-ir91mv`). Metoda: listing katalogów + grep importów/dekoratorów
`@router` w żywym repo. Każda delta ma odwołanie `plik:symbol`/`plik:endpoint`.

### 8.1 Dodane — solvery (§1)

| Delta | Dowód | Uzasadnienie |
|---|---|---|
| S19 Regulacja OLTC w rozpływie | `network_model/solvers/power_flow_oltc.py`, `power_flow_oltc_studies.py`; użycie w `enm/canonical_analysis.py`, `analysis/reporting/oltc_report.py` | Solver istniał, brak w inwentarzu 2026-07-15 |
| S20 Spadek napięcia na kablu (preview) | `network_model/solvers/cable_voltage_drop.py`; endpoint `api/grid_source_preview.py:/api/solver/cable-voltage-drop-preview` | Solver preview pominięty |
| S21 Prądy znamionowe transformatora (preview) | `network_model/solvers/transformer_rated_currents.py`; endpoint `/api/solver/transformer-rated-currents-preview` | Solver preview pominięty |
| S22 Kompensator równoległy (preview) | `network_model/solvers/shunt_compensator_preview.py`; endpoint `/api/solver/shunt-compensator-preview` | Solver preview pominięty |

### 8.2 Dodane — API (§4)

| Delta | Dowód | Uzasadnienie |
|---|---|---|
| Router `oze_analysis_runs` wpięty | `api/main.py:oze_analysis_runs_router`; `api/oze_analysis_runs.py` (13 endpointów `/api/oze-analysis/*`) | Nowy router — ujawnia analizy OZE/DER (m.in. grid-strength, reactive-adequacy, hosting-capacity, LoM, P-Q, dokumenty OSD) |
| Router `quality_analysis_runs` wpięty | `api/main.py:quality_analysis_runs_router`; `api/quality_analysis_runs.py` (endpointy `/api/quality/*`) | Nowy router — ujawnia arc-flash, sanity-bounds, energy-validation, flicker, as-built-compliance |
| Router `reference_engine` wpięty | `api/main.py:reference_engine_router`; `api/reference_engine.py:/api/reference/packs` | Nowy router — Reference Engine paczek referencyjnych |
| Zmiana liczby wpiętych routerów 35 → 38 | `api/main.py` include_router | Trzy nowe routery powyżej |

### 8.3 Dodane — frontend (§5)

| Delta | Dowód | Uzasadnienie |
|---|---|---|
| Cała powierzchnia `ui2/` (spaces, kreatory, wyniki, oze, inspector, shell, nav…) | `frontend/src/ui2/` (listing) | Katalog całkowicie pominięty w inwentarzu 2026-07-15; to docelowa powierzchnia Programu UI/UX |

### 8.4 Poprawione — macierz pokrycia (§6)

| Delta | Dowód | Uzasadnienie |
|---|---|---|
| Arc flash: ❌ API+UI → ◐ | `api/quality_analysis_runs.py:/api/quality/arc-flash`; `ui2/wyniki/jakosc/` | Zdolność wpięta (API+UI2) |
| Siła sieci (SCR): ❌ API+UI → ◐ | `api/oze_analysis_runs.py:/api/oze-analysis/grid-strength`; `ui2/oze/pulpit/SekcjaSilySieci.tsx` | Zdolność wpięta |
| Adekwatność mocy biernej: ❌ API+UI → ◐ | `api/oze_analysis_runs.py:/api/oze-analysis/reactive-adequacy`; `ui2/oze/pulpit/SekcjaAdekwatnosciQ.tsx` | Zdolność wpięta |
| Sanity bounds: ❌ UI → ◐ | `api/quality_analysis_runs.py:/api/quality/sanity-bounds`; `ui2/wyniki/jakosc/` | Zdolność wpięta |
| Walidacja energetyczna: ❌ UI → ◐ | `api/quality_analysis_runs.py:/api/quality/energy-validation`; `ui2/wyniki/jakosc/` | Zdolność wpięta |
| Nowe wiersze macierzy: migotanie, hosting capacity, P-Q, dobór kompensacji, LoM, dokumenty OSD, OLTC, preview kabla/transformatora/kompensatora, Reference Engine | endpointy `oze_analysis_runs.py`/`quality_analysis_runs.py`/`grid_source_preview.py`/`reference_engine.py`; `application/analyses/*.py` | Zdolności obecne w backendzie i `ui2/`, brak w macierzy 2026-07-15 |
| Wrażliwość: UI `sensitivity` skorygowane | `ui/sensitivity` usunięty; `ui/workspace/screenCanonRegistry.ts` | Katalog usunięty, ekspozycja przez rejestr ekranów |
| Przypadki obliczeniowe: UI `active-case-bar` skorygowane | `ui/active-case-bar` usunięty | Katalog usunięty |

### 8.5 Bez zmian (potwierdzone jako nadal aktualne)

- ~~Lista modułów NIEWPIĘTYCH z §4~~ — **NIEAKTUALNE, rozstrzygnięte 2026-08-08**
  (karta ROUTERY-MARTWE). Ten wpis był podwójnie nieprawdziwy: `batch_execution` był już
  wpięty, a `case_runs` już nie istniał — czyli „potwierdzone jako nadal aktualne" nie
  zostało wtedy przemierzone. Stan po rozstrzygnięciu: 8 modułów usuniętych, 4 świadomie
  odstawione, granica pilnowana przez `scripts/router_mount_guard.py` (patrz §4).
  Wpisu NIE odtwarzaj ręcznie — ręcznie utrzymywana lista modułów zawsze odjedzie od kodu.
- ❌ pozostające (rewizja 2026-07-21c): BRAK — zero funkcji ❌ zero-UI. Zwarcia maszyn skorygowane
  ❌→◐ (widoczne przez ProofPack SC3F, G-SCM F2 — patrz macierz §6).
- ◐ Stabilność SSCI: backend wpięty 2026-07-21 (`api/v126_academic.py` +
  `application/analyses/ssci_stability` na bazie `analysis/ssci_stability`); werdykt Nyquista
  (Sun 2011 / Wen 2016) z gotowego przebiegu v126 ssci_impedance; UI (ekran werdyktu/metryk/flag) = następna faza.
- ◐ Estymacja stanu WLS: backend wpięty 2026-07-21 (`quality_analysis_runs.py` +
  `application/analyses/state_estimation`); UI (ekran wyników |V|/kąt/χ²) = następna faza.

---

## 9. Rewizja 2026-07-25 (audyt FLOW — karty F-K1…F-K3)

Powierzchnia dodana po rewizji 2026-07-20, wcześniej nieujęta w inwentarzu (dług dokumentacyjny
domknięty przy karcie F-K3). Metoda bez zmian: grep w żywym repo, każdy wpis ze ścieżką.

### 9.1 Dodane — solvery (§1)

| Delta | Dowód | Uzasadnienie |
|---|---|---|
| `conductor_thermal_withstand.py` — kryterium wytrzymałości zwarciowej przewodu (IEC 60949 / PN-HD 60364-5-54: `I_th ≤ I_th(1s)/√t`, `S_min = I_th·√t/Jth`) | `network_model/solvers/conductor_thermal_withstand.py` (V12K-192) | Kryterium normowe, którego nikt nie sprawdzał — znalezisko Z1 audytu FLOW |
| `cable_ampacity_derating.py` — korekta obciążalności długotrwałej wg warunków UŁOŻENIA (`I′z = Iz · f_grunt · f_wiazka · f_grupa`; zestawy z podstawą dokumentową + współczynniki własne z wymaganym opisem; bez interpolacji) | `network_model/solvers/cable_ampacity_derating.py` (V12K-207); konsument: `der_selection_preview.propose_mv_cable` | Dobór porównywał prąd z obciążalnością KATALOGOWĄ wprost — znalezisko Z6 audytu FLOW. Rachunek istniał też w warstwie prezentacji, z własną kopią współczynników |

### 9.2 Dodane — analizy (§2, warstwa application/analyses)

| Delta | Dowód | Uzasadnienie |
|---|---|---|
| `wytrzymalosc_cieplna_przewodow.py` — kryterium cieplne na CAŁYM modelu po biegu zwarciowym (per gałąź) | `application/analyses/wytrzymalosc_cieplna_przewodow.py` (V12K-195/196) | Z1 na modelu, nie tylko w doborze kabla |
| Kryterium cieplne przewodu wystawia **dowód obliczeniowy**: kryteria cząstkowe, bilans I²·t / k²·S², uzasadnienie k (materiał · izolacja · θ_b → θ_k · źródło), działania naprawcze z progiem liczbowym, wrażliwość i normy z punktem | `network_model/solvers/conductor_thermal_withstand.py`, `ui2/wyniki/jakosc/PanelDowoduCieplnego.tsx` (V12K-210) | Ocena właściciela: raport ma być materiałem do odbioru technicznego, nie prezentacją wyniku |
| Kryterium cieplne obejmuje **linie napowietrzne** na równi z kablami: para temperatur θ_b → θ_k przewodu gołego z materiału żyły (220 °C dla AAL/AAC, 200 °C dla AFL/ACSR), rodzaj przewodu rozstrzygający, czy brak izolacji jest brakiem danej, oraz odniesienie normowe źródła k | `network_model/catalog/mv_cable_line_catalog.py`, `network_model/catalog/types.py` (kontrakt `LINIA_SN`), `enm/models.py::OverheadLine`, `network_model/solvers/conductor_thermal_withstand.py` (V12K-211) | Bez tego ogniwa raport globalny pomijał połowę sieci SN — każda linia dawała werdykt NIEDOSTĘPNY |
| `protection/czas_wylaczenia_galezi.py` — czas wyłączenia PER GAŁĄŹ z mapy zabezpieczeń (topologia → wyłącznik → nastawa 50/51 → solver IEC 60255 przy prądzie tej gałęzi) + `prad_zwarciowy_galezi.py` (wspólny odczyt rozbicia prądu) | `application/analyses/protection/czas_wylaczenia_galezi.py`, `application/analyses/prad_zwarciowy_galezi.py` (V12K-209) | Z1: kryterium cieplne brało jeden założony `tk_s` dla całej sieci; teraz czas ma źródło per gałąź |
| `warunki_przylaczenia.py` — moc i cosφ w punkcie przyłączenia wobec warunków OSD | `application/analyses/warunki_przylaczenia.py` (V12K-194) | Z2: warunki OSD przestały być wyświetlaczem, są kryterium |
| `werdykt_projektowy.py` — agregat 10 kryteriów projektu (E1–E6) z 5 dostawców, trzy stany, jawny zakres poza automatem | `application/analyses/werdykt_projektowy.py` (V12K-198) | Z3: etap E7 (weryfikacja normatywna) nie miał dostawcy |

### 9.3 Dodane — API (§4)

| Delta | Dowód | Uzasadnienie |
|---|---|---|
| `GET /api/quality/conductor-thermal-withstand?run_id=` | `api/quality_analysis_runs.py` | Wytrzymałość zwarciowa przewodów per gałąź |
| `GET /api/quality/conductor-thermal-withstand/proof?run_id=&branch_id=` | `api/quality_analysis_runs.py` (V12K-209) | Pakiet dowodowy kryterium cieplnego jednej gałęzi; krok 1 nazywa źródło czasu trwania zwarcia |
| `GET /api/quality/connection-conditions?run_id=` | `api/quality_analysis_runs.py` | Ocena warunków przyłączenia OSD wobec rozpływu |
| `GET /api/quality/design-verdict?case_id=` | `api/quality_analysis_runs.py` | Agregat werdyktu projektowego (jedyna końcówka rodziny per PRZYPADEK — obejmuje wiele biegów) |
| `GET /api/protection/overcurrent-settings?run_id=` albo `?case_id=` | `api/protection_overcurrent_settings.py` (V12K-204) | Nastawy nadprądowe w postaci prezentacyjnej: wartość albo jawny stan NIEDOSTĘPNA z powodem i akcją naprawczą (dług V12K-189) |
| `GET /api/readiness/registry` | `api/readiness_registry.py` (V12K-206) | Kanoniczny rejestr kodów gotowości (64 kody) RAZEM z lukami: odwzorowanie kodów walidatora ENM na kanon, kody bez odpowiednika z powodem, rezerwacje kodów bez emitera — jedno źródło treści naprawczej (Z8) |

### 9.4 Dodane — frontend (§5b)

| Delta | Dowód | Uzasadnienie |
|---|---|---|
| `ui2/wyniki/jakosc/` — dwie nowe sekcje: „Warunki przyłączenia" (bieg PF) i „Wytrzymałość zwarciowa przewodów" (bieg SC) | `ui2/wyniki/jakosc/{api.ts,jakoscModel.ts,EkranJakosci.tsx}` (V12K-194/197) | Kryteria widoczne dla projektanta, z pętlą decyzji |
| `ui2/wyniki/werdykt/` — NOWY moduł: ekran „Werdykt projektowy" jako pierwsza zakładka przestrzeni Wyniki | `ui2/wyniki/werdykt/`, `ui2/spaces/wyniki/WynikiWarsztat.tsx` (V12K-198) | Jedno miejsce rozliczenia kryteriów projektu (etap E7) |
| `ui2/wyniki/koordynacja/` — nowa sekcja „Nastawy wyznaczone z analizy" PRZED stroną selektywności; kreator OZE (`ui2/kreatory/zrodlo-oze/`) dostał `cos φ toru` i `Charakter mocy biernej falownika` | `ui2/wyniki/koordynacja/{nastawyApi.ts,SekcjaNastaw.tsx}` (V12K-204); `ui2/kreatory/zrodlo-oze/{derSelectionApi,zrodloOzeDobor,DoborToruSn}` (V12K-203) | Nastawa niedostępna widoczna jako stan z drogą do naprawy; przypadek pracy toru DER wybierany, a ΔU nazwane wzrostem albo spadkiem |

### 9.5 Poprawione — macierz pokrycia (§6)

| Delta | Dowód | Uzasadnienie |
|---|---|---|
| Wytrzymałość zwarciowa przewodu: pozycji nie było → ✔ solver + API + UI | `conductor_thermal_withstand.py`; `/api/quality/conductor-thermal-withstand`; `ui2/wyniki/jakosc/` | Zdolność nowa, wpięta end-to-end |
| Warunki przyłączenia OSD jako kryterium: pozycji nie było → ✔ analiza + API + UI | `warunki_przylaczenia.py`; `/api/quality/connection-conditions`; `ui2/wyniki/jakosc/` | Z2 domknięte |
| Werdykt projektowy (agregat E7): pozycji nie było → ✔ analiza + API + UI | `werdykt_projektowy.py`; `/api/quality/design-verdict`; `ui2/wyniki/werdykt/` | Z3 domknięte |
| Nastawy nadprądowe: solver ✔ / API ✖ / UI ✖ → ✔ solver + API + UI | `overcurrent/settings_presentation.py`; `/api/protection/overcurrent-settings`; `ui2/wyniki/koordynacja/SekcjaNastaw.tsx` | Dług V12K-189 domknięty: nastawa niedostępna ma stan, powód i akcję naprawczą |
| Kanoniczny rejestr kodów gotowości: rejestr ✔ / konsument runtime ✖ → ✔ rejestr + API + UI | `domain/readiness_bridge.py`; `/api/readiness/registry` + wzbogacone `engineering-readiness`; `ui/engineering-readiness/ReadinessLivePanel.tsx` (kolejność napraw po kanonicznym priorytecie) | Z8 domknięte: kanon ma drogę do projektanta, luki są policzalne, guard pilnuje konsumpcji |
| Przypadek pracy toru DER w doborze kabla: solver ✔ / API ✖ / UI ✖ → ✔ solver + API + UI | `der_selection_preview.propose_mv_cable`; `/api/solver/der-selection-preview`; `ui2/kreatory/zrodlo-oze/DoborToruSn.tsx` | Dług V12K-190 domknięty: charakter Q zmienia dobrany przekrój |
| Korekta obciążalności wg warunków ułożenia: pozycji nie było (rachunek tylko w UI, bez konsumenta produkcyjnego) → ✔ solver + API + UI + MODEL | `cable_ampacity_derating.py`; `/api/solver/cable-laying-conditions` + `/api/solver/cable-ampacity-derating-preview` + `der-selection-preview`; `ui2/kreatory/zrodlo-oze/DoborToruSn.tsx`; `meta.cable_laying_conditions` kabla DER; raport zgodności D2 | Z6 domknięte: kryterium doborowe w solverze, założenie jawne w wyniku i w modelu, drugi rachunek w warstwie prezentacji usunięty |
| Kryteria POZA automatem (selektywność zabezpieczeń, wytrzymałość aparatury na całym modelu, korekta obciążalności wg warunków ułożenia **na całym modelu** — po V12K-207 działa w torze DER, ekonomiczna gęstość prądu) | `werdykt_projektowy.ZAKRES_POZA_AUTOMATEM` | Luki są WIDOCZNE w produkcie, nie tylko w dokumentach — nie da się ich przeoczyć. Zakres wpisu o obciążalności ZAWĘŻONY (nie skreślony): korekta jest w torze DER, ale nie ma przebiegu dla wszystkich przewodów modelu |
