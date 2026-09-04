# MV-DESIGN-PRO — AUDYT FORENSYCZNY POD DIGITAL TWIN SN+nN (FAZA A; mandat §1–§4, §153–§155)

> **Status od 2026-09-04 (kontrakt MAX PLATFORM):** materiał wejściowy i dowodowy programu konwergencji. Źródło kanoniczne architektury: `../architecture/PRODUCT_CAPABILITY_MODEL.md`, `../architecture/CANONICAL_DIGITAL_TWIN.md`, `../architecture/REVISION_SCENARIO_EXECUTION_MODEL.md`, `../architecture/COMPUTATIONAL_BOUNDARY.md`, `../architecture/FUTURE_CAPABILITY_REVIEW.md`, `../reference-networks/REFERENCE_NETWORK_REGISTRY.md`, `../evidence/CONVERGENCE_EVIDENCE.md`. Przy rozbieżności obowiązuje dokument kanoniczny; w szczególności: nie powstaje nowa klasa `TwinModel` (Canonical Project Twin = rozwinięty ENM), `network_model` jest pochodnym IR, program nie zatrzymuje się po M0, lecz prowadzi konwergencję wycinkami CV-0…CV-6 z bramkami B-01/B-02 i procedurą kasacji.


**Status:** WYNIK AUDYTU (stan zastany; READ-ONLY — w tej fazie nic nie naprawiono, zgodnie z mandatem §2/§180)
**Data pomiaru:** 2026-09-02 · **HEAD:** `a1ab2959` (= `origin/main`) · **Gałąź:** `claude/mv-design-pro-twin-audit-u4lhy0`
**Metoda:** 12 niezależnych audytów obszarowych (A1 model i tożsamość · A2 topologia/scenariusze/inwalidacja · A3 solvery · A4 zabezpieczenia · A5 DER/punkt przyłączenia/RfG/wyspy · A6 katalogi/jednostki/provenance · A7 SLD/CAD/SCADA · A8 frontend · A9 API/aplikacja/persystencja/integracje/wydajność · A10 dokumentacja/testy/guardy · A11 uziemienia/nN/kable/SWZ · A12 tarcia inżynierskie W1–W14), każdy z dowodem `plik:linia` lub pomiarem (`grep/find/wc/AST/pytest/API Actions`), wykonanych na tym samym HEAD; synteza i ranking przez koordynatora. Ścieżki względem `mv-design-pro/`. Gdzie czegoś nie ma: „nie znaleziono (szukano: …)".
**Dokumenty odpowiedzi (FAZY B–F):** `MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md`, `MV_DESIGN_PRO_DATA_VERSIONING_PROVENANCE.md`, `MV_DESIGN_PRO_TARGET_ENGINEERING_WORKFLOW.md`, `MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md`, `MV_DESIGN_PRO_DESIGN_OPTIMIZATION_ARCHITECTURE.md`, `MV_DESIGN_PRO_PROTECTION_ARCHITECTURE.md`, `MV_DESIGN_PRO_SLD_PRESENTATION_ARCHITECTURE.md`, `SLD_SYMBOL_SYSTEM_PLAN.md`, `MV_DESIGN_PRO_PERFORMANCE_PLAN.md`, `MV_DESIGN_PRO_MIGRATION_PLAN.md`, `ENGINEERING_FRICTION_REGISTER.md`, `OWNER_REVIEW_PACKAGE.md`.

---

## 1. Streszczenie wykonawcze

MV-DESIGN-PRO ma **działające, dobrze przetestowane rdzenie** (solvery IEC 60909 i NR/GS/FD z White Box, deterministyczny ENM z hashami i dziennikiem, projekcja domeny nN 3.0.0 z backendu, tor DER-SN z doborem i auto-biegiem, archiwum ZIP z odciskami, 10 513 zielonych testów) — ale **nie jest cyfrowym bliźniakiem** w sensie mandatu §184–§185. Kryteria FAIL z §185 są spełnione niemal wszystkie:

1. **Nie ma jednego modelu prawdy.** Trzy magazyny modelu (ENM w plikach, legacy SQL `network_*`, kopie ENM per bieg); import XLSX zapisuje do magazynu, którego tor obliczeniowy nie czyta (A9-01). Nietypowany worek `meta.field_specs` jest aktywną prawdą o polach, a typowane klasy Bay są „write-disabled" (A1-02).
2. **Nie ma terminali, faz ani stanu efektywnego.** `Port/ConnectionNode` to metadane bez egzekwowania; brak rozróżnienia connectivity node ≠ topological node (A1-03); brak L1/L2/L3/N/PE/PEN i układu sieci nN jako danych (A1-04); stan łącznika w 8–9 reprezentacjach, „effective topology" liczona w 20 miejscach z 4 definicjami krawędzi, frontend liczy energizację sam (A2-01/03/08).
3. **Scenariusz nie jest deltą.** 6 równoległych modeli przypadku/scenariusza, 7 fantomowych operacji STUDY_CASE, what-if = destrukcyjna edycja jedynego modelu, brak wariantów, brak historii rewizji (A2-02/04/14/15, A9-07).
4. **Solvery bez kanonicznego wejścia i bez orkiestratora.** 10 builderów rozpływu / 7 ścieżek zwarć z rozbieżną interpretacją (c=1,0 vs 1,1), 5 torów uruchomienia, 4 rejestry biegów, Celery z 0 zadań, solvery synchronicznie w żądaniu HTTP, algebra gęsta, N-1 374,7 s / 142 kontyngencje (A3-01/02/10, A9-02/10).
5. **Zabezpieczenia nie są częścią modelu.** Nastawy w przypadku i w body żądania, fantomowe nastawy na żywo w szufladzie SLD, 5 implementacji fizyki IDMT, brak trip matrix, 67 bez modelu kierunku, katalog przekaźników z fikcyjnymi kartami pod marką producenta (A4-01…07, A4-13).
6. **nN nie da się zaprojektować w żywej powłoce**: ekran doboru skasowany, 5 endpointów bez konsumenta, uziemienie w 6 reprezentacjach, dwie fizyki Ik1 na dwóch zbiorach danych (A11-01…05).
7. **SLD SN żyje w 100 % w kliencie** (35,3 tys. LOC TS rekonstruuje topologię), dwie rodziny symboli, trzy sceny per LOD, ~54 tys. LOC martwego kodu SLD, martwy potok SLD v1 w backendzie i „druga prawda" diagramu w DB (A7-01/02/07/11).
8. **Frontend:** ~80 tys. LOC nieosiągalnego kodu, plik danych 134 193 LOC dublujący katalog backendu, dwie prawdy nawigacji, pięć silników „następnego kroku", siedem inspektorów, brak silnika workflow (A8-01…05).
9. **Katalog bez rewizji pozycji**, cicha automatyczna rematerializacja, trzy kopie tej samej danej, provenance zapisywalne przez klienta, ciche fallbacki (`or 0.0`, `k_sc 1.1`, `DEFAULT_LOAD_KW=30`), `UnitSystem` bez konsumenta, 50 Hz zaszyte (A6-01…12).
10. **Pomiar jest niewiarygodny**: CI na `main` czerwone w 5 z 8 workflowów (bez required checks), 7/18 scenariuszy nN ma inny hash w CI niż lokalnie, guardy „determinizmu" nie uruchamiają solvera ani renderu, 755 dokumentów z 87 „kanonami" SLD i trzema sprzecznymi hierarchiami, dokumenty root opisują nieistniejące katalogi (A10-01…04/09).
11. **Łańcuch pracy projektanta (§181) rwie się** w ogniwach: założenia (1), dobór przekroju SN (3), nN (5), komplet obliczeń (7), zabezpieczenia (11); „optymalny" jest nieweryfikowalny — brak doborów z rankingiem poza DER/kompensacją i brak kryterium optymalności (A12).

Mimo to **nie należy przepisywać od zera**: rdzeń solverów, ENM store/hash/dziennik, projekcja nN 3.0.0, tor kanoniczny biegów, archiwum ZIP, `dobor_przekladnika`, `nn_device_selection`, `swz`/`fault_loop`, `protection_iec60255`, `der_selection_preview`, reguła NBA, gotowość wg celów i `dry_run` stacji są fundamentem, na którym da się zbudować twin metodą strangler (FAZA F). Warunkiem wstępnym jest przywrócenie wiarygodności pomiaru (CI zielone i wymagane, hash kanoniczny cross-platform, rejestr sieci wzorcowych, inwarianty klasy).

---

## 2. Mapa systemu (stan faktyczny, zmierzony)

```
FRONTEND (React/TS ≈ 670 tys. LOC; ui/ 56 modułów + ui2/ 18; 29 store'ów Zustand; 2 prawdy nawigacji)
  ├─ ui2/ (powłoka 2026-07: przestrzenie, 23 kreatory, NBA R1–R6, gotowość, wyniki 32 zakładki, OZE 12 zakładek)
  ├─ ui/  (legacy: SLD v2/v3, koordynacja E-28, biblioteka zabezpieczeń, inspektory ×7, harnessy 20,9 tys. LOC)
  ├─ SLD SN: projekcja w kliencie (35,3 tys. LOC), 3 sceny per LOD; SLD nN: scena z backendu (3.0.0)
  └─ dane: PTPiREE 134 193 LOC w bundlu; ręczne lustro ENM 1 642 linii; ≈80 tys. LOC nieosiągalne
        │ HTTP /api (334 trasy; ≈70 bez konsumenta; 4 martwe ścieżki klienta; bez auth; bez OpenAPI snapshot)
BACKEND (FastAPI ≈ 267 tys. LOC; 48 routerów; handlery sync w puli wątków; 19 god-files ≥1 500 LOC)
  ├─ api/            (logika raportów 1 847 LOC i polityki katalogowej 1 480 LOC w kontrolerach)
  ├─ application/    (96,7 tys. LOC / 41 pakietów; ≈15,6 tys. LOC martwych/legacy, w tym symphony/ obce domenie)
  ├─ enm/            (models 1 550 · domain_operations 9 864 + v2 6 666 · canonical_analysis 3 266 — importuje application/infrastructure)
  ├─ domain/         (StudyCase = parametry; 6 modeli „przekaźnika"; canonical_operations 58 + 100 kodów gotowości)
  ├─ network_model/  (core graph uuid5(ref_id); catalog jako kod 3 980+2 393+2 175 LOC; solvers FROZEN + 18 modułów)
  ├─ analysis/, solver_input/, protection/, proof_engine (5 272 LOC generator, 21 wyrażeń fizycznych)
  └─ infrastructure/ (SQLAlchemy 35 tabel; cgmes 1 382 LOC bez API; cloud_backup niezamontowany)
MAGAZYNY (11 klas): ENM plik JSON per przypadek (+dziennik ≤500) · canonical_runs (pełny snapshot ENM per bieg) ·
  analysis_runs (legacy) · study_runs/results · legacy network_* + network_snapshots + sld_* · study_cases + operating_cases ·
  katalog w DB (*_types) ≠ katalog w kodzie · document_records (bez hasha modelu) · 7 magazynów in-memory · .station_templates/
ZADEKLAROWANE, NIEUŻYWANE: MongoDB (0 importów), Redis (0), Celery (0 zadań)
CI: 9 workflowów, 78 guardów (82 wywołania), 10 523 testów backend / 10 466 frontend; main: 5/8 czerwone; 0 required checks; 0 benchmarków
DOKUMENTY: 755 md w docs/ (+36 poza), 288 z markerem BINDING, ~425 bez statusu, 3 hierarchie, kanon docelowy `PROMPT_MV_DESIGN_PRO_PRZEBUDOWA.md` nie istnieje
```

Przepływ prawdy dziś: kreator (ui2) → `POST /api/cases/{id}/enm/domain-ops` (jedyny produkcyjny tor zapisu; dispatcher połyka wyjątki bez logu) → `enm/store.set_enm` (rewizja++, hash, dziennik) → unieważnienie wszystkich wyników (`result_status=OUTDATED`) → bieg: `execution_runs` → `canonical_analysis` (snapshot = pełna kopia ENM) → `solver_input`/buildery → solver (sync) → `canonical_runs` → interpretacje (OZE/quality/insights) → eksporty; SLD SN: klient rekonstruuje z ENM; SLD nN: `lv_domain/projection_v1` z backendu. Równolegle żyją: legacy SQL NetworkModel (XLSX, wizard), `analysis_runs` (porównania, unified), `study_runs` (comparison), in-memory (scenariusze, serie, overrides, konfiguracje rozdzielnic, V12.6, koordynacja, cache interpretacji).

---

## 3. Ustalenia per obszar (identyfikatory z raportów obszarowych; pełne treści w raportach A1–A12 zachowanych w materiałach sesji audytowej)

### 3.1 Model i tożsamość (A1)
- **A1-01 P0** dwa równoległe tory zapisu sieci (ENM plik vs ORM `network_*` + `NetworkSnapshot`); **A1-02 P0** `meta.field_specs`/`nn_field_specs` aktywną prawdą, typowane `Bay/Measurement/ProtectionAssignment` „legacy write-disabled"; **A1-03 P0** brak modelu terminal-centric; **A1-04 P0** brak modelu fazowego i układu sieci nN; **A1-05 P1** poziom napięcia jako liczba, dwie niezgodne stałe pasma nN; **A1-06 P1** `ref_id` stabilne, ale tłumaczone na uuid5 w 4 przestrzeniach i wyciekające do kontraktów/UI; **A1-07 P1** brak lifecycle assetu, stan łącznika w 8 reprezentacjach, brak EARTHED/TRIPPED/`in_service`; **A1-08 P1** punkt przyłączenia nietypowanym parametrem; **A1-09 P1** duplikaty typów źródeł/maszyn/łączników/portów/ról; **A1-10 P1** god-files z inwersją zależności; **A1-13 P1** catalog item vs asset bez pinowania wersji i z podwójnym przechowywaniem; **A1-18 P1** wartości pomiarowe jako placeholder SCADA w ASSET bez dostawcy; A1-11/12/14/15/16/17/19/20 (P2–P3): martwe artefakty, lustro FE z 86 rzutowaniami `as unknown as`, `id: uuid4` bez funkcji, dwie technologie persystencji bez transakcji, relikty jednonapięciowe, SCENARIO w ≥9 klasach, 133 sygnatury `enm: dict[str, Any]`, graf terminali T0 nieużywany.
- **Do zachowania:** `ref_id` jako stabilna tożsamość, ENM header z łańcuchem hashy, `enm/store.py`, dziennik, Bay v10 jako szkielet read-modelu, `E2E_IDENTITY_MAP.md`.

### 3.2 Topologia, scenariusze, inwalidacja (A2)
- **A2-01 P0** 20 implementacji effective topology, 4 definicje krawędzi; **A2-02 P0** 7 operacji STUDY_CASE fantomowych (`run_time_series_power_flow` itd.); **A2-03 P0** brak EFFECTIVE STATE (BASE + AS-BUILT + OPERATIONAL + SCENARIO), 9 reprezentacji stanu, rozsiane `??`; **A2-04 P0** brak ScenarioEngine, 6 modeli, warianty analiz jako 4 ad-hoc kopie migawki; **A2-05 P1** inwalidacja all-or-nothing (zmiana nazwy unieważnia zwarcia), macierz inwalidacji tylko w dokumencie; **A2-06 P1** `switching_snapshot_hash` pokrywa tylko `branches[].status`; **A2-07 P1** dwie/trzy prawdy NOP; **A2-08 P1** frontend liczy energizację (`SupplyPathHighlighter`), scena v3 inna definicja krawędzi; **A2-09 P1** N-1 poza silnikiem scenariuszy, druga N-1 akademicka, bez cache; **A2-10 P1** brak rewizji scenariusza/katalogu, provenance częściowo stała; **A2-11 P1** brak dependency graph/selektywnego przeliczenia/cache; A2-12…19 (P2–P3): QSTS fantom, undo/redo pilotażowe, what-if brak, warianty brak, decision log brak, ADR-008 nieaktualny, stub `enm/topology.py`, 4 słowniki świeżości.
- **Do zachowania:** `result_freshness.py` (jedna funkcja odcisku), unieważnienie serwerowe, `MACIERZ_INVALIDACJI.md` jako specyfikacja, `kopia_graniczna_enm`, `archive_diff`.

### 3.3 Solvery i symulacja (A3)
- **A3-01 P0** brak kanonicznego snapshotu, 10 builderów PF / 7 ścieżek SC; **A3-02 P0** brak orkiestratora; **A3-03 P0** FDLF nie zbiega na kablach nN (udowodnione testem), BFS wyspą, brak faz odbiorów; **A3-04 P1** kanoniczny PF nie buduje szyn PV; **A3-05 P1** wiele źródeł = wiele SLACK, równanie tylko dla pierwszego; **A3-06 P1** `v126_academic.py` 14 analiz z ukrytymi domyślnymi; **A3-07 P1** druga NR i drugi Ybus w aplikacji (4 Ybus łącznie); **A3-08 P1** fizyka poza solverami (proof engine 21 wyrażeń, arc flash, flicker, IDMT); **A3-09 P1** estymacja stanu bez modelu pomiaru; **A3-10 P1** algebra gęsta, SC O(N·n³), N-1 2,64 s/kontyngencję; A3-11…20 (P2–P3): stałe magiczne w mostach, trace_v2 martwy, pętla nN z drugim c, luki SC wobec §24, QSTS deklaracja vs kod, wrażliwość jako perturbacje, PQ/harmoniczne, rozruch statyczny, „FROZEN porowate" (guardy pilnują hashy, nie fizyki).
- **Do zachowania:** rdzenie FROZEN (IEC 60909 z κ/ip/Ith, NR z White Box), `canonical_analysis` jako jedyne miejsce wołania solverów, benchmarki IEEE/CIGRE vs pandapower, `solver_capability_registry`.

### 3.4 Zabezpieczenia, CT/VT, aparatura (A4)
- **A4-01 KRYT.** 5 implementacji fizyki IDMT; **A4-02 KRYT.** nastawy poza modelem w ścieżce użytkownika (kreator bez nastaw, `update_relay_settings` → `legacy_write_disabled` a w rejestrze kanonicznym; nastawy w `ProtectionConfig.overrides` i w body); **A4-03 KRYT.** fantom nastaw w `SldDetailDrawer.tsx:1833-1835` pinowany testem; **A4-04 WYS.** `validate_selectivity` dead-on-arrival (słownik vs lista, pary po indeksie, mutacja `enm.meta`); **A4-05 WYS.** TCC = kalkulator z body; **A4-06 WYS.** brak IED/trip matrix/logiki; pola automatyki zawsze False; **A4-07 WYS.** funkcje ANSI: pełne tylko 50/51, 67 bez kierunku; **A4-08 WYS.** trace = jeden aparat po porządku ID, FUSE wykluczony, nN brak; A4-09…17: CT jednordzeniowy bez Rct/Vk, VT podwójny predykat 3U0, aparatura bez Ima/Ics/cyklu, SWZ TN-only/gG bez „spełnia", katalog „ACME REX", martwy łańcuch PR-26…31, brak kaskady unieważnienia, `frequency_hz=50.0` fabrykowane, profile anti-islanding OSD brak.
- **Do zachowania:** `protection_iec60255.py`, `protection_lv_curves.py`, `swz/*`, `fault_loop/*`, `nn_device_selection.py`, `PodstawaKrzywej` (N-D5), `pradyZBiegow/lokalizacjeZModelu.ts`, `dobor_przekladnika.py`, `ct_burden_saturation/vt_burden_voltage_drop`, `der_protection_functions/der_readiness`, `ochrona_lom.py`, Bay v10 szkielet, `protectionMarking.ts`, `sanity_checks`/`base_values`, `protection_settings` (Hoppel).

### 3.5 DER, punkt przyłączenia, RfG, wyspy (A5)
- **A5-01 HIGH** `ConverterSource` zlepia źródło pierwotne + konwerter + sterowanie (+ TR w katalogu SN) w `Generator`+`meta`; **A5-02** bloker V-10 (niedopasowanie falownik ↔ TR) wynika z A5-01; **A5-03 HIGH** grid-forming/following jako string w 12 wariantach, tryby Q z katalogu nieme w rozpływie, zdolność wyspowa nigdy nie zapisywana; **A5-04 HIGH** BESS bez stanu/sprawności/zdolności ładowania/szeregu/black-start; **A5-05 HIGH** silnik wysp tylko nN (projekcja), brak wysp SN/bilansu z solvera; **A5-06 HIGH (konflikt mandatu)** punkt przyłączenia: termin zakazany, 12 rozproszonych ról, brak obiektu interfejsu umownego; **A5-07 HIGH** NC RfG: trzy silniki zgodności, formularz z fabrykowanymi domyślnymi, test FRT tautologiczny (T14/T15); A5-08…16 (MEDIUM/LOW): PQ z fabrykowanym widmem, hosting capacity ×2, N-1 z DER/SCR, drugi store DER w przeglądarce, dwa kreatory DER, wycinek §165 na niekanonicznym schemacie, wkład SC = tylko `k_sc·In`, dynamika bez mostu, reguła gotowości DER w dwóch stosach.
- **Do zachowania:** tor DER-SN (dobór kaskadowy z odrzuconymi, auto-bieg, raport, BOM), `der_selection_preview`, LoM, karta falownika z provenance, gotowość per wytwórca.

### 3.6 Katalogi, jednostki, provenance (A6)
- **A6-01 KRYT.** brak rewizji pozycji (wersja literałowa „2024.1"); **A6-06 KRYT.** `materialized_params` i `parameter_source` zapisywalne przez klienta bez bramy; **A6-02…05, 07…12 WYS.**: materializacja ignoruje wersję, drift detection martwe, propagacja katalogu cicha i automatyczna, trzy kopie danej, override w dwóch semantykach bez old/new/autora, provenance per pole poza ścieżką wyników, ≥12 słowników jakości, duplikaty typów i katalogi wbudowane w UI, `UnitSystem` bez konsumenta / 50 Hz zaszyte / 27 aliasów nazw, konwersje i fabrykacje w React, ciche fallbacki na wejściu solvera; A6-13…18: 5 słowników gotowości, brak rejestru założeń, rejestry normatywne puste/częściowe (G-D2, TT), lustro FE dryfuje, katalog zabezpieczeń z fikcyjnymi identyfikatorami, guardy nie pokrywają klasy „rewizja/jakość per pole".
- **Do zachowania:** katalog-first w operacjach, Reference Engine rodzin rozdzielnic, `catalog_governance`, karty producentów ze źródłem, `DeterministicJSON`.

### 3.7 SLD / CAD / SCADA (A7)
- **A7-01** projekcja SN w 100 % po stronie klienta (§185 FAIL); **A7-02** dwa języki symboli i dwie strategie geometrii SN vs nN; **A7-03** `engine/sld-layout` i geometria slotowa v2 liczone w ścieżce żywej, wynik odrzucany; ~12,9 tys. LOC JSX v2 w bundlu bez montażu; CI pilnuje martwego silnika; **A7-04** brak trybów CAD/SCADA/ENGINEERING; **A7-05** fragmentacja rejestrów symboli, martwa biblioteka SVG; **A7-06** brak edycji layoutu w UI, API nadpisań osierocone; **A7-07** LOD SN: trzy geometrie, brak wirtualizacji; **A7-08** druk tylko A3, tabliczka tylko w eksporcie, brak rewizji/arkusza nN; **A7-09** ślepe zaułki nawigacji (TCC/koordynacja), fantomowe nastawy w szufladzie; **A7-10** auto-layout bez zachowania zatwierdzonego układu; **A7-11** martwy potok SLD v1 w backendzie + diagram w DB; A7-12…16: rozrost dokumentacji, wyrocznie z kodu produkcyjnego, harnessy jako osobne prawdy wizualne (20,9 tys. LOC), gramatyka pola data-first, luki listy symboli §100.
- **Do zachowania:** `lv_domain/projection_v1.py` 3.0.0 (backend: energizacja, wyspy, SWZ), `geometry_overrides.py`, `protectionMarking.ts`, rejestr normatywny symboli R2.1, scena v3 jako podstawa `SceneSemanticsV1`.

### 3.8 Frontend (A8)
- **A8-01 KRYT.** ~80 tys. LOC martwego kodu prod i 12 martwych modułów opisywanych jako żywe; **A8-02 KRYT.** plik danych 134 193 LOC dubluje katalog backendu; **A8-03 KRYT.** dwie prawdy nawigacji + orkiestrator 938 LOC na `hashchange`; **A8-04 WYS.** pięć silników „następnego kroku", NBA milczy dla E6–E8; **A8-05 WYS.** siedem inspektorów; **A8-06 WYS.** undo/redo tylko dla multi-edycji; **A8-07 WYS.** ślepe zaułki w ui2 poza `dead_click_guard`; **A8-08 WYS.** akcje kontekstowe kończą się toastem „Etap N roadmapy"; **A8-09 WYS.** tryby niezgodne ze specyfikacją, role bez implementacji, 32 zakładki; **A8-10 WYS.** kontrakty API ręczne (172 typy, 58 klientów) bez generowania; A8-11…21: duplikat osi trybu, rejestr mostu legacy przypięty testem do fałszywego stanu, paleta bez akcji obiektowych, skróty w 10 plikach, batch bez zdolności, guardy maskujące, testy z torem syntetycznym, 5 paneli obliczeń z `document.querySelector`, martwe zależności.
- **Do zachowania:** ui2 jako powłoka docelowa (przestrzenie, kreatory katalog-first, NBA, gotowość, świeżość, diagnoza), `dead_click_guard` (rozszerzyć), hydratacja z serwera.

### 3.9 API, aplikacja, persystencja, integracje, wydajność (A9)
- **A9-01 KRYT.** trzy magazyny modelu, XLSX do legacy SQL; **A9-02 WYS.** cztery rejestry biegów, `study_results` FK bez wiersza (SQLite bez FK); **A9-03 WYS.** 7 magazynów in-memory; **A9-04 ŚR.** ≈70 tras bez konsumenta, 4 martwe ścieżki klienta, 6 wierszy-widm macierzy; **A9-05** analizy nN bez rekordu biegu; **A9-06 WYS.** zero auth/aktora (decyzja właściciela: jednostanowiskowo); **A9-07 WYS.** brak historii rewizji; **A9-08** integralność (ENM niezależny od DB, brak FK/sprzątania); **A9-09 WYS.** odczyt = migracje + uzupełnienie + zapis (0,355 s); **A9-10 WYS.** solvery sync, GIL, Celery fantom; **A9-11 WYS.** god-file 9 864 LOC, dispatcher połyka wyjątki; A9-12…26: logika w API, infrastruktura fantomowa (Mongo/Redis/Celery), schemat bez migracji, CGMES bez API/UI, GIS 0 współrzędnych, DXF minimalny, 61850 brak, `runtime_state` z `pending_command` w modelu projektowym, brak zestawień i świeżości dokumentów, archiwum bez ewolucji formatu, nazewnictwo etapowe v125/v126/audit2 w ścieżkach, brak benchmarków, brak egzekwowania warstw importów, martwe klienty, 501 w produkcji.
- **Do zachowania:** `enm/store.py`, dziennik, hashe, `result_freshness`, `canonical_analysis`, archiwum ZIP, CGMES side-car, guardy API, macierz kompatybilności, `X-Request-Id`, `DeterministicJSON`, `gotowosc.py`, `nn_circuit_sheet`/`lista_materialowa`, importer XLSX (kontrakt), `test_nn_full_chain.py`, metodyka `10X_WSP_INWENTARZ.md`.

### 3.10 Dokumentacja, testy, guardy, determinizm, silnik dokumentów (A10)
- **A10-01 KRYT.** CI `main` czerwone 5/8 z pięciu przyczyn, brak required checks; **A10-02 KRYT.** niedeterminizm hashu między środowiskami (7/18 scenariuszy nN); **A10-03 WYS.** brak jednego kanonu SLD (87 dokumentów wiążących, 7 kanonów symboli, 4 definicje LOD, 2 typy `LodLevel`, SSOT map z 21/29 martwych ścieżek); **A10-04 WYS.** dokumenty root opisują nieistniejący stan; **A10-05 WYS.** trzy niezgodne listy sieci wzorcowych, brak listy §146; **A10-06 WYS.** 264 prywatne buildery, 123 ręczne `EnergyNetworkModel(`; **A10-07** inwarianty §145 jako testy instancji (5/5/1); **A10-08** e2e golden 6/12 obszarów; **A10-09** guardy determinizmu nie mierzą determinizmu; **A10-10** zapadki przekroczone bez sygnału; **A10-11** silnik dokumentacji: 5 wejść, brak 4 zestawień, magazyn bez świeżości; **A10-12** decision log/assumptions tylko w kanonie, 0 w produkcie; **A10-13** testy przechodzące mimo defektów (wyrocznie z kodu produkcyjnego, „395 PASS" przy 6/10); **A10-14** proces generuje dokumenty zamiast kodu (86 kart, 38 promptów); A10-15…17: środowisko guardów, higiena katalogów, zapadki merytoryczne (parytet TS, 11 podstawień liczb, 15 operacji bez komunikatu).
- **Do zachowania:** `guardy_z_ci.py`, zapadki dwustronne (`mypy_ratchet`, `tsconfig_gate`, `no_direct_fault_params`), guardy klasy (`enm_contract_parity`, `success_toast`, `claude_md_struktura`, `verification_phantom_paths`, `dead_click`), 18 scenariuszy nN jako jedno źródło backend→frontend, substrat 52s, `test_nn_full_chain.py`, testy iloczynu cech, `E2E_IDENTITY_MAP.md`, `MACIERZ_INVALIDACJI.md`, `REJESTR_KONFLIKTOW.md`, silnik raportów deterministyczny, benchmarki solverów, KANON_V12_XX + SPEC_*, `PROJEKCJA_SN_NN_PORTAL_V1.md`.

### 3.11 Uziemienia, nN, kable, SWZ, cieplne (A11)
- **A11-01 KRYT.** nN STUDIO skasowany (`c8f253d3`), 5 endpointów bez konsumenta, STAN_REPO nieaktualny, guard zakazuje odtworzenia pod tą nazwą; **A11-02 WYS.** uziemienie w 6 reprezentacjach, `Bus.grounding`/`meta.grounding` fantomy dla fizyki; **A11-03 WYS.** układ sieci nN = string z cichym TN-C-S, TT/IT bez fizyki, PEN vs PE nierozróżnione; **A11-04 WYS.** jedna „żyła powrotna" bez N, brak szyny PE/N i punktu rozdziału; **A11-05 WYS.** dwie fizyki Ik1 nN na dwóch zbiorach danych (0/17 kabli nN z r0/x0), test krzyżowy z pasmem 0,5–2,0 legalizuje rozjazd; **A11-09 WYS.** rozruch silników na DTO z zaszytą impedancją źródła 0,1+j0,4; **A11-11 WYS.** rozpływ niesymetryczny nN odcięty; **A11-13 WYS.** dwa systemy szablonów stacji, brak transformer designera, pole nN = meta; A11-06/07/08/10/12/14/15/16/17: SWZ gG bez „spełnia", model cieplny częściowy (brak metod ułożenia, IEC 60287), I²t bez sprzężenia, harmoniczne z widm zaszytych, luki domeny 3.0.0, brak linii napowietrznych nN/ekranu SN, V12.6 z domyślnych, most SC_1F→uziemienia bez producenta, agregat/UPS bez katalogu.
- **Do zachowania:** projekcja 3.0.0, `fault_loop` fail-closed, `swz` 3-stanowe, `nn_circuit_sheet`, `lv_ampacity_iec60364_5_52`, `lv_mcb_bands_iec60898`, rezolucja MCCB do górnego krańca (nazwana).

### 3.12 Tarcia inżynierskie (A12) — patrz `ENGINEERING_FRICTION_REGISTER.md`
60 pozycji (P0 = 17), 13/14 klas §5 niespełnionych, role §168 od 13/70 (eksploatacja) do 45/70 (OZE), §181 nie przechodzi (zerwania w ogniwach 1, 3, 5, 7, 11).

---

## 4. Rejestr legacy (co jest martwe lub podwójne — kandydaci do kasacji po cutoverze)

| Obszar | Element | LOC (pomiar) | Dowód martwoty/duplikatu |
|---|---|---|---|
| backend | `application/symphony/` (orkiestracja agentów kodujących) | 810 | 0 użyć; obce domenie (A9 §6) |
| backend | `application/network_wizard/` + `NetworkWizardRepository` + tabele `network_*`/`network_snapshots`/`sld_*` | 4 083 + 572 | trasy deprecated/wyłączone; drugi tor mutacji (A1-01, A9-01) |
| backend | `application/analysis_run/` + `analysis_dispatch` + `unified_run_dispatch` + `api/unified_runs.py` + `execution_engine/` | 3 181 + 889 + 1 189 | legacy rejestr biegów, adapter bez konsumenta, resztkowy `get_engine()` (A9-02) |
| backend | `lifecycle/`, `designer/`, `read_models/`, `wizard_runtime/`, `validation_problem/`, `trace_export/`, `report_readiness/` | 199+206+378+293+229+224+83 | 0 użyć w src (A9 §2.1) |
| backend | `ncrfg_compliance/` (`no_module`) | 457 | D-10 „do wygaszenia" (A9 §6, A4-17) |
| backend | niezamontowane API (`archive_diff`, `incremental_archive`, `cloud_backup` + infra) | 2 070 + 917 | budżet 9 tras odstawionych |
| backend | `api/v125_contracts.py`, nazewnictwo v126/audit2 w ścieżkach | 461 | stałe etapowe w artefaktach (A9-22) |
| backend | łańcuch PR-26…31 zabezpieczeń (`protection_engine_v1`, `execute_run_protection`, `protection_current_resolver`, mapowania v1, `trace_emitters/protection_emitter`), `protection_report_model.py`, `api/protection_analysis_runs.py`, `validate_selectivity`/`_compute_tcc_*`, `line_overcurrent_setting` (tylko wzorzec) | ≈2 500 + 359 + 5 + 1 800 | 0 wywołujących / 0 konsumentów (A4 §5) |
| backend | martwy potok SLD v1 + diagram w DB; `enm/topology.py` stub; 9 plików SQL migracji; Celery/Redis/Mongo | — | A7-11, A2-18, A9-13/14 |
| backend | `v126_academic.py` (14 analiz, większość z ukrytymi domyślnymi) | 2 322 | los per analiza (A3-06) |
| backend | trace_v2 | 2 404 | bez konsumenta — wpiąć albo usunąć (A3-12) |
| backend | 10 tras wyłączonych produkcyjnie, 2 deprecated wizard, 2 legacy 410, ≈70 tras bez konsumenta, 6 wierszy-widm macierzy | — | A9-04 |
| frontend | nieosiągalny kod prod | ≈80 000 | A8-01 (`reach_main.json`) |
| frontend | plik danych PTPiREE | 134 193 | A8-02 |
| frontend | SLD: v2 JSX bez montażu (12,9 tys.), `engine/sld-layout` (1 537), harnessy (20,9 tys.), martwa biblioteka SVG, drugi rejestr symboli, `sldNetwork53` | ≈54 000 | A7-03/05/14 |
| frontend | `TopologyPanel.tsx` (+`api.ts` ops), `traceExportApi.ts`, `comparison/api.ts:62-100`, `EdytowalnaTabela`, `element-assignment.ts` „nie zaimplementowany", fantom nastaw `SldDetailDrawer`, `ProtectionRunButton` niezamontowany, `CaseConfigPage` wygaszony | — | A9-25, A8-19, A4-03/14 |
| frontend | drugi store DER (`synchronizacjaZModelu.ts`), 4 z 5 silników NBA, 6 z 7 inspektorów, orkiestrator `hashchange` | — | A5-11, A8-03/04/05 |
| dokumenty | 191 do kasacji (86 kart, 108 artefaktów review, 30 zastąpionych kanonów SLD, 6 promptów), 464 do archiwum | — | A10 §2 |
| dokumenty | `PROTECTION_SYSTEM_CANONICAL.md` (BINDING, wskazuje legacy `CTRatio`), `SLD_SCADA_CAD_CONTRACT.md` („BoundaryNode ZAWSZE" vs Core Rule 5), SSOT map SLD z 21/29 martwych ścieżek, `STAN_REPO.md` nagłówek z maja | — | A4 §9, A9 §5 pkt 13, A10 S7/S12 |

---

## 5. Rejestr ryzyk

| ID | Ryzyko | Prawdopodobieństwo / skutek | Źródło | Mitigacja (dokument) |
|---|---|---|---|---|
| R-01 | Wynik inżynierski liczony na fabrykacji (ciche fallbacki, domyślne NC RfG, `k_sc 1.1`, impedancja rozruchu 0,1+j0,4, widma zaszyte, 50 Hz) trafia do dokumentu dla OSD | wysokie / błąd merytoryczny w dokumencie urzędowym | A6-12, A5-07/08, A11-09/10/15, A4-16 | O-04, PR-06, I-xx „brak danych ≠ wartość"; guard podstawień |
| R-02 | Nastawy w raporcie ≠ nastawy w modelu ≠ nastawy w SLD (trzy magazyny + fantom) | wysokie / błędna koordynacja | A4-02/03 | PZ-01, M0-4, M4-1 |
| R-03 | Dwa Ik″ w jednym projekcie (Sk″ w kreatorze i w przypadku), c_min w trzech wartościach | wysokie / błąd doboru aparatów i czułości | EF-001/004 | rejestr założeń (FAZA C §3) |
| R-04 | „Wynik świeży" fałszywie (hash zależny od środowiska) lub fałszywie OUTDATED | średnie / utrata zaufania do świeżości | A10-02 | M0-2 |
| R-05 | Regresja fizyki niewidoczna (guardy hashy plików, nie zachowania; `solver_output_drift` nie liczy) | średnie / regresja solvera w produkcji | A3-20, A10-09 | M0-5 rejestr + testy determinizmu na realnych biegach |
| R-06 | Import sieci od operatora (XLSX) fantomem dla obliczeń mimo „✅" w inwentarzu | pewne dziś / bezużyteczna funkcja | A9-01 | M1-4 |
| R-07 | Utrata pracy inżyniera po restarcie (7 magazynów in-memory) | pewne przy redeployu | A9-03 | M1-3 |
| R-08 | Każda zmiana w `domain_operations.py` (9 864 LOC, wyjątki połykane bez logu) = regresja bez sygnału | wysokie | A9-11 | M2-6, pakiet komend |
| R-09 | Kolejny wykonawca implementuje nieistniejący pipeline z jednego z 87 „kanonów" SLD (precedens: `SldSemanticGraphV1`) | wysokie | A10-03 | M7-1, `docs/twin/` jako jedyny kanon docelowy |
| R-10 | Werdykt wizualny 6/10 przy „395 PASS" — samocertyfikacja | pewne | A10-13 | wyrocznie właściciela w repo; B-02 w bramce |
| R-11 | Sieć OSD (setki stacji) nieinteraktywna (0,36 s/odczyt, N-1 minuty, SLD 3 sceny) | wysokie przy skali | A9-09/10, A7-07 | plan wydajności |
| R-12 | Migracja rdzenia zmienia hashe i unieważnia wszystko | pewne w trakcie migracji | — | rewizja „migracja formatu", test odtworzenia hashy (plan migracji §7) |
| R-13 | Konflikt kanonu (PCC zakazany) z mandatem (punkt przyłączenia pierwszej klasy) blokuje wycinek §165 | średnie | A5-06 | `GridConnectionPoint` (ADR-027) |
| R-14 | Brak auth/aktora przy wielu użytkownikach OSD | zależne od decyzji W-D1 | A9-06 | ADR-028 (aktor w komendach) |

---

## 6. Macierz luk (GAP REGISTER, mandat §155) — luka · obszar · waga · przyczyna źródłowa · stan docelowy · dokument

| ID | Luka | Obszar | Waga | Przyczyna źródłowa | Stan docelowy | Dokument |
|---|---|---|---|---|---|---|
| G-01 | jeden model prawdy (3 magazyny; import do legacy) | model | P0 | dwie generacje modelu nigdy niescalone (M2 niedomknięta) | jeden `RevisionStore` ENM; importery przez komendy | wersjonowanie §6, migracja M1 |
| G-02 | terminale/ConnectivityNode/TopologicalNode | model | P0 | bus-branch od początku; porty jako metadane | model terminalowy z `TopologyService` | architektura §6, §9; ADR-013/014 |
| G-03 | model fazowy i układ sieci nN jako dane | model/nN | P0 | 3ph-only; nN dobudowane w meta | `PhaseCode`, `EarthingSystem`, żyły | architektura §7, §16; ADR-015 |
| G-04 | effective state (11 warstw, precedencja) | stan | P0 | stan łącznika dopisywany w 9 miejscach | `EffectiveStateResolver` | architektura §3, §10; ADR-017 |
| G-05 | scenariusze jako delty, warianty, what-if | scenariusze | P0 | Case = parametry solvera; kopie migawki ad hoc | `Scenario{deltas}`, `VariantBranch` | architektura §11, §20; ADR-016 |
| G-06 | typowane wyposażenie pól (bez worka meta) | model | P0 | „legacy write-disabled" bez zastępczej komendy | komendy zapisu do obiektów Bay | architektura §4.2; migracja M2-6 |
| G-07 | kanoniczny snapshot + assembler | symulacja | P0 | buildery per karta | `CanonicalNetworkSnapshot` + widoki | symulacja §2–§3; ADR-020 |
| G-08 | orkiestrator, zadania, cache, provenance | symulacja | P0 | brak warstwy zadań; Celery fantom | `SolverOrchestrator` + pula procesów | symulacja §7; wydajność §2.3 |
| G-09 | zabezpieczenia jako obiekty + jedna fizyka + TCC z modelu + trace | zabezpieczenia | P0 | model przypisania; kalkulator E-28; karty bez kasacji | `ProtectionDevice/SettingGroup/TripMatrix`; `TccProjection`; `trace_protection` | zabezpieczenia; ADR-022 |
| G-10 | nN projektowalne w powłoce; dobór aparatu; SWZ w werdykcie | nN/UI | P0 | kasacja ekranu bez zastępstwa | akcje nN w kanwie/inspektorze; `DEVICE_NN` w pętli doboru | workflow W6; migracja M6-3 |
| G-11 | wiarygodny pomiar (CI, hash, guardy determinizmu, rejestr sieci) | jakość | P0 | brak required checks; fixtury z laptopa; guardy strukturalne | M0 | migracja M0; ADR-018 (hash) |
| G-12 | rewizja katalogu, provenance parametru, brak cichych fallbacków | katalogi | P0 | wersja literałowa; materializacja przy odczycie | `CatalogRevision`, `ParameterProvenance`, guard podstawień | wersjonowanie §3–§4; ADR-019 |
| G-13 | inwalidacja selektywna i graf zależności | stan/wyniki | P1 | all-or-nothing najprostsze | `AttributeClass` graf | architektura §22; ADR-026 |
| G-14 | scena SN z backendu; jedna geometria; jeden rejestr symboli; polityki | SLD | P0 | historia v1→v2→v3 w kliencie | L1–L6, `SceneSemanticsV1`, R3 | prezentacja; plan symboli; ADR-023/024 |
| G-15 | dekompozycja DER, tryby jako typ, `GridConnectionPoint`, RfG jako bieg | DER | P0 | Generator+meta; zakaz PCC bez obiektu zastępczego | ADR-027; `PowerElectronicsConnection` | architektura §17; ADR-027 |
| G-16 | silnik workflow, definicja gotowego, NBA E1–E8, Command Center, fix-action executor | workflow | P0 | 5 silników, akcja = nawigacja | `WorkflowEngine` | workflow §2 |
| G-17 | dobór z kandydatami dla 8 klas; `ConstraintEngine`; remedia; impact preview | decyzje | P0/P1 | wyspy per karta | FAZA D cz. 2 | optymalizacja |
| G-18 | jeden rejestr biegów; zero in-memory; Postgres/FK/Alembic | persystencja | P1 | warstwy PR-6/14/P10a/P15a addytywne | M1-2/3/5 | wersjonowanie §6; ADR-028 |
| G-19 | historia rewizji, aktor, decision log, rejestr założeń | provenance | P1 | rewizja = licznik | `RevisionGraph`, `DesignDecision`, `Assumption`, `ProjectAssumptions` | wersjonowanie §2, §4 |
| G-20 | rozpływ nN 4-przewodowy; szyny PV; slack rozproszony; jądro rzadkie | symulacja | P1 | FDLF/BFS; NR bez PV; gęsta algebra | nowy solver ABCN; ADR-021 (B-01) | symulacja §4–§5 |
| G-21 | fizyka poza solverami → solvery; v126 los; trace v2 | symulacja | P1 | NOT-A-SOLVER nieegzekwowany dla klas wielkości | `backend_no_physics_guard` | symulacja §9 |
| G-22 | frontend: martwy kod, plik danych, nawigacja, inspektor, store'y, kontrakty generowane | frontend | P1 | migracja ui→ui2 bez kasacji | M6 | workflow §5, §9; wydajność §2.6 |
| G-23 | dokumenty: rejestr typów §124, zestawienia, świeżość, pakiet | dokumentacja | P1 | generatory per karta; magazyn bez hasha | `DocumentType`, `DocumentRecord{model_revision}` | workflow W14; wersjonowanie §5.2 |
| G-24 | jednostki (`UnitSystem`), 50 Hz, słowniki jakości, katalogi w UI | dane | P1 | konwersje rozproszone | `Quantity` na granicy API; 1 słownik jakości | architektura §15 |
| G-25 | dokumentacja: 755 → 100, jedna hierarchia, STAN_REPO generowany | docs | P1 | proces generuje dokumenty | M7 | migracja M7 |
| G-26 | integracje: CGMES API/UI + SSH/SV, GIS pola geo, DXF z backendu, SCL (decyzja), granica SCADA | integracje | P2 | decyzje odroczone D-02/D-05a/D-12 | jak w architekturze §24 | architektura §24; ADR-023 |
| G-27 | wyspy SN z solvera, BESS pełny, PQ liczone, rozruch z encją silnika | DER/nN | P2 | modele DTO/meta | encje + solvery | symulacja §5.4–5.6 |
| G-28 | trasy-sieroty, 501, nazewnictwo etapowe, guard trasa↔konsument | API | P3 | brak guarda dwukierunkowego | OpenAPI snapshot + guard | wydajność §2.5; migracja M1 |

---

## 7. TOP 30 problemów (mandat §154; ranking według wpływu na twin; P0 = blokuje twin, P1 = blokuje jakość/skalę, P2 = istotne, P3 = porządkowe)

| # | P | Problem | Ustalenia | Odpowiedź |
|---|---|---|---|---|
| 1 | P0 | Trzy magazyny modelu; import XLSX niewidoczny dla obliczeń; brak historii rewizji | A1-01, A9-01, A9-07 | ADR-028, M1-1/M1-4 |
| 2 | P0 | Brak modelu terminalowego (Port/ConnectionNode bez egzekwowania; CN≠TN nierozróżnione) | A1-03, A1-20 | ADR-013/014, M2-1 |
| 3 | P0 | Effective topology w 20 miejscach z 4 definicjami krawędzi; frontend liczy energizację | A2-01, A2-08 | `TopologyService`, M2-1 |
| 4 | P0 | Brak effective state; 8–9 reprezentacji stanu łącznika; 7 fantomowych operacji STUDY_CASE | A2-02/03, A1-07 | ADR-017, M2-2 |
| 5 | P0 | Brak ScenarioEngine; 6 modeli scenariusza; what-if destrukcyjny; brak wariantów | A2-04/14/15 | ADR-016, M2-2 |
| 6 | P0 | Brak kanonicznego wejścia solverów (10 PF / 7 SC, c=1,0 vs 1,1) i orkiestratora | A3-01/02 | ADR-020, M3-1/M3-3 |
| 7 | P0 | `meta.field_specs` aktywną prawdą; typowane klasy Bay write-disabled | A1-02 | M2-6 |
| 8 | P0 | Brak modelu fazowego i uziemień jako encji; PE/N/PEN; TN-C-S cichy; dwie fizyki Ik1 na dwóch zbiorach danych | A1-04, A11-02…05 | ADR-015, M2-5 |
| 9 | P0 | Nastawy poza modelem; 5 fizyk IDMT; fantom nastaw w SLD; brak trip matrix; 67 bez kierunku; katalog „ACME REX" | A4-01/02/03/06/07/13 | ADR-022, M0-4, M4-1 |
| 10 | P0 | nN nieprojektowalne w powłoce (ekran skasowany, 5 endpointów bez UI, dobór aparatu bez konsumenta, SWZ tylko nakładka) | A11-01, EF-021/022/023 | M6-3, W6 |
| 11 | P0 | CI `main` czerwone 5/8 bez required checks; hash zależny od środowiska; guardy determinizmu nie mierzą determinizmu | A10-01/02/09/10 | M0-1/2/5 |
| 12 | P0 | Katalog bez rewizji pozycji; cicha rematerializacja; provenance zapisywalne przez klienta; ciche fallbacki | A6-01/03/06/12 | ADR-019, M2-4 |
| 13 | P0 | Inwalidacja all-or-nothing; brak grafu zależności i cache | A2-05/11 | ADR-026, M2-3 |
| 14 | P0 | SLD SN w 100 % w kliencie; dwie rodziny symboli; 3 sceny per LOD; ~54 tys. LOC martwe; potok SLD v1 w backendzie | A7-01/02/03/07/11 | ADR-023/024, M5 |
| 15 | P0 | DER jako `Generator`+meta; tryby jako stringi, tryby Q nieme w PF; punkt przyłączenia w 12 rolach bez obiektu; RfG z fabrykowanymi domyślnymi i tautologicznym testem FRT | A5-01/03/06/07 | ADR-027, M2-7, §165 |
| 16 | P0 | Łańcuch §181 zerwany (założenia, dobór przekroju, nN, komplet obliczeń, zabezpieczenia); brak WorkflowEngine; akcja naprawcza = nawigacja | A12, A8-04 | FAZA C, M4-3 |
| 17 | P1 | Cztery rejestry biegów, 5 torów uruchomienia, 7 magazynów in-memory, FK nieegzekwowane | A9-02/03/08 | M1-2/3/5 |
| 18 | P1 | Frontend: ~80 tys. LOC martwe, plik 134 tys. LOC, 2 nawigacje, 5 NBA, 7 inspektorów, undo tylko dla multi-edycji | A8-01…06 | M6 |
| 19 | P1 | FDLF nie zbiega na kablach nN; PV nigdy nie budowane; multi-slack; rozpływ niesymetryczny nN odcięty | A3-03/04/05, A11-11 | ADR-021, M3-4 |
| 20 | P1 | Fizyka poza solverami (proof engine, arc flash, flicker, IDMT); v126 z ukrytymi domyślnymi; trace_v2 martwy | A3-06/08/12 | M3-5/6/7 |
| 21 | P1 | Brak rewizji scenariusza/katalogu, aktora, decision log i rejestru założeń; provenance częściowo stała | A2-10/16, A6-14, A9-06, A10-12 | wersjonowanie, ADR-028 |
| 22 | P1 | Wydajność: algebra gęsta, SC O(N·n³), N-1 374 s, solvery sync w żądaniu, GIL, odczyt z zapisem 0,36 s | A3-10, A9-09/10 | plan wydajności |
| 23 | P1 | God-files (9 864 LOC), dispatcher połyka wyjątki, inwersja zależności `enm`→`application`/`infrastructure`, logika w API | A9-11/12, A1-10 | M2-6, guard import-linter |
| 24 | P1 | Dokumenty: 5 generatorów, brak zestawień kabli/TR/rozdzielnic/CT-VT, brak świeżości dokumentów, PW gate 1 blokada | A9-20, A10-11 | M4-4 |
| 25 | P1 | Fixtury per moduł (264 buildery, 123 ręczne ENM), 3 listy sieci wzorcowych, inwarianty jako instancje, e2e 6/12 obszarów | A10-05…08 | M0-5 |
| 26 | P1 | Jednostki: `UnitSystem` bez konsumenta, 50 Hz zaszyte, ≥12 słowników jakości, katalogi w UI, lustro FE dryfuje | A6-08…11/16 | architektura §15 |
| 27 | P1 | Dokumentacja: 755 md, 87 kanonów SLD, 3 hierarchie, root opisuje nieistniejący stan, kanon docelowy nie istnieje | A10-03/04/14 | M7 |
| 28 | P2 | Integracje: CGMES bez API/UI, GIS 0 współrzędnych, DXF minimalny w kliencie, 61850 brak, `runtime_state` z `pending_command` w modelu projektowym | A9-15…19 | architektura §24 |
| 29 | P2 | Wyspy tylko nN; BESS niepełny; PQ z fabrykowanym widmem; rozruch z zaszytą impedancją; agregat/UPS bez katalogu | A5-04/05/08, A11-09/10/17 | symulacja §5 |
| 30 | P3 | ≈70 tras bez konsumenta, 4 martwe ścieżki klienta, 501 w produkcji, nazewnictwo etapowe v125/v126/audit2, 6 wierszy-widm macierzy API | A9-04/22/26 | M1, guard trasa↔konsument |

---

## 8. Rekomendacje docelowe (skrót; pełne treści w dokumentach FAZ B–F)

1. **Rdzeń twin** (FAZA B): model terminalowy zgodny z CIM (ConnectivityNode/Terminal, TN wyprowadzany), 11 warstw stanu z jednym resolverem, scenariusze jako typowane delty i warianty jako gałęzie rewizji, rewizja katalogu i provenance per parametr, encje uziemień i model fazowy, `GridConnectionPoint` jako obiekt umowny, rozdzielenie walidacja/gotowość/ograniczenia, graf zależności do selektywnej inwalidacji.
2. **Symulacja** (FAZA D cz. 1): jeden `CanonicalNetworkSnapshot` i `SolverInputAssembler`, `SolverOrchestrator` z DAG/cache/zadaniami, jądro rzadkie, nowy solver nN 4-przewodowy, fizyka wyłącznie w solverach, ślad jednego formatu, rejestr zdolności ze stosowalnością i budżetem.
3. **Decyzje projektowe** (FAZA D cz. 2): `ConstraintEngine` z klasami ograniczeń, jedna pętla doboru dla 10 klas, `DesignOptimizationEngine` z jawnymi strategiami, threshold finder, wrażliwość z Jacobianu, optymalizacja łączeniowa i Q/U, planer wzmocnień, model ekonomiczny i niezawodność jako gotowość na dane.
4. **Zabezpieczenia**: IED/funkcje/grupy nastaw/trip matrix w modelu, jedna fizyka, kierunkowość i kryteria ziemnozwarciowe sieci kompensowanych, TCC jako projekcja, trace per element (SN+nN), katalog IED z realnymi kartami, profile OSD.
5. **Workflow** (FAZA C): `WorkflowEngine` z definicją gotowego per cel, jedno NBA E1–E8, Command Center (Sprawdź/Policz/Zweryfikuj/Porównaj/Wydaj), rejestr założeń, zapotrzebowanie i jednoczesność, remedia dla każdego FAIL, jeden inspektor, akcje obiektowe, profile ról, test §181 jako odbiór.
6. **Prezentacja** (FAZA E): scena semantyczna z backendu dla SN i nN, jedna geometria z LOD jako filtrem, jeden rejestr symboli R3 zatwierdzany przez właściciela, polityki CAD/SCADA/ENGINEERING, arkusz/tabliczka/rewizja, DXF/PDF z backendu.
7. **Persystencja i provenance**: `RevisionGraph`, jeden rejestr biegów, zero in-memory, Postgres/Alembic/FK, aktor w komendach, dokumenty ze świeżością i gotowością, archiwum 2.0 z migracją formatu.
8. **Jakość i pomiar** (M0): CI zielone i wymagane, hash cross-platform, rejestr sieci G01–G17 + sieć L, `tests/invariants/` po rejestrze, benchmark z budżetami, guardy klasy, jedna hierarchia dokumentów.
9. **Migracja** (FAZA F): strangler w wycinkach z kasacją, trzy wycinki pionowe (§163–§165), bramki ≥ 9/10 z dowodem, werdykt B-02 właściciela w bramce SLD.

---

## 9. Metoda, ograniczenia i uczciwość pomiaru

- Audyt był READ-ONLY; żaden defekt nie został naprawiony (mandat §2/§180 nad zasadą „wykryte = naprawione natychmiast" CLAUDE.md — konflikt procesowy zgłoszony w `OWNER_REVIEW_PACKAGE.md` §178).
- Liczby są pomiarem na HEAD `a1ab2959` (LOC przez `wc -l`, trasy przez AST `api_lifecycle_guard`, testy przez `pytest --co`, konsumpcja tras przez dopasowanie literałów klienta, CI przez API Actions). Tam, gdzie brief lub dokumenty repo podawały inne liczby (274 trasy, 88 guardów, 1600+/5400 testów), raport podaje pomiar i źródło rozbieżności.
- Lista sieci wzorcowych §146 (G01–G17) oraz treść §21/§60/§115/§131 mandatu nie występują w repo; mapowania w §7 planu migracji i w A9 są **inferowane** i wymagają potwierdzenia właściciela.
- Cztery audyty (A4, A9, A10, A12) zostały dokończone po przerwie limitu API; ich wyniki są spójne z wcześniejszymi (krzyżowo cytowane, każda liczba zmierzona ponownie).
- Ocena wizualna SLD nie była przedmiotem audytu (B-02 należy do właściciela); oceniano dane, przepływy i kod.
- Raporty obszarowe A1–A12 (≈870 KB, z dowodami `plik:linia`) powstały w katalogu roboczym sesji; ten dokument jest ich syntezą. Jeśli właściciel chce mieć pełne raporty w repo (archiwum audytu), jest to pozycja do decyzji (`OWNER_REVIEW_PACKAGE.md`, decyzja P-05).
