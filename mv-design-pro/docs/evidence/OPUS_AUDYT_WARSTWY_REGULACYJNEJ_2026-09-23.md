# Audyt warstwy regulacyjnej i dowodowej — przed kamieniem AB-1 (Opus 5.5, READ-ONLY)

**Baza:** start audytu na `ef9f6228` (drzewo robocze: plan programu nieśledzony). W trakcie audytu orkiestrator
zatwierdził i wypchnął `637a322f` („Program A/B: odtworzenie planu…”) na `claude/relaxed-sagan-ww188q` — lokalny
HEAD i ref zdalny przesunęły się pod audytem. Wszystkie odczyty kodu `backend/src/**` i `frontend/src/**` są
identyczne na obu SHA (commit `637a322f` dodaje wyłącznie dokument planu). Żaden plik repozytorium nie został
zmieniony przez ten audyt; jedyne zapisy: katalog scratchpad (w tym tymczasowy, osobny klon zdalnych refów, usunięty
po użyciu).

Oznaczenia pewności w części normatywnej: **[PEWNE]** — wiem z tekstu dokumentu; **[DO POTWIERDZENIA — OD]** —
nie jestem pewien tytułu, wersji albo liczby; takie pozycje NIE mogą trafić do kodu przed decyzją właściciela
(mandat §70).

---

## ZADANIE 1 — POTWIERDZENIE ŚLEDCZE

### 1.1 Co uruchomiłem i co wróciło

| # | Polecenie | Wynik |
|---|---|---|
| 1 | `grep -rIil` (bez `.git`, `node_modules`) dla 14 terminów na całym `/home/user/MV-Design-PRO` | patrz 1.2 |
| 2 | `git stash list` | pusto |
| 3 | `git for-each-ref` (lokalnie) | 5 refów: `refs/heads/claude/relaxed-sagan-ww188q`, `refs/heads/main`, `refs/remotes/origin/{claude/mv-design-pro-twin-audit-u4lhy0, claude/relaxed-sagan-ww188q, main}`. **Brak `refs/kopia/*`** lokalnie |
| 4 | `git fsck --lost-found --no-reflogs` i `git fsck --unreachable --no-reflogs` | pusto (0 obiektów wiszących), rc=0; `git count-objects -v`: `count: 0`, `garbage: 0` |
| 5 | `git reflog --all` | wyłącznie `fetch --depth 50`, utworzenie gałęzi, fast-forward do `ef9f6228` — brak śladu jakiejkolwiek pracy lokalnej poprzedniej sesji |
| 6 | `git rev-parse --is-shallow-repository` | **`true`** — `.git/shallow` ma 12 granic; lokalnie osiągalne 1108 commitów. **Lokalny `git log --all -S` NIE jest wyczerpujący** (klon płytki) |
| 7 | `git log --all -S<term>` lokalnie (8 terminów) | `ModelValidationStatus`, `ComplianceStimulus`, `SupraharmonicBand`, `AcceptedEvidence`, `Bank Nastaw`: 0 przed commitem planu; `PhysicsDomain`, `PhysicalNetworkDisturbance`, `Explainable Verdict`: 1 = `637a322f` (sam plan) |
| 8 | `git ls-remote origin` | **419 gałęzi + 475 głów PR + HEAD** na `origin` (w tym 123 gałęzie `refs/heads/kopia/*`, 91 `codex/*`, 197 `claude/*`). Plan §0.2 twierdzi, że sprawdzono „wszystkie gałęzie zdalne” i wymienia trzy — **to twierdzenie jest fałszywe co do zakresu** (sprawdzono 3 z 419 + 0 z 475 PR) |
| 9 | Osobny klon goły w scratchpad (`git init --bare` + `git fetch origin '+refs/heads/*:refs/heads/*'`, potem `'+refs/pull/*/head:refs/pull/*/head'`) — **repozytorium robocze i jego refy nietknięte** | pełna, niepłytka historia: 4779 commitów osiągalnych z 419 gałęzi i 475 głów PR |
| 10 | W tym klonie `git log --all -S<term>` dla 9 terminów | `ModelValidationStatus`, `ComplianceStimulus`, `SupraharmonicBand`, `AcceptedEvidence`, `Bank Nastaw`, `PhysicalNetworkDisturbance`, `Explainable Verdict`, `PhysicsDomain`: **dokładnie 1 commit każdy = `637a322f` (2026-09-23)**. `WiPWC`: 27 commitów, pierwszy `60d2b649` (2026-05-13) |
| 11 | W tym klonie `git log --all -i --grep='AB-1\|AB1\|Program A/B\|poprawki §95'` | jedyny trafny: `637a322f`; pozostałe trafienia to `ZAB-100-BACKEND` (fałszywy podciąg) i dwa commity z 2026-09-05 (FAB-L, SKIP-INWENTARZ — trafienie w podciąg) |
| 12 | Najnowsze gałęzie zdalne wg daty (`--sort=-committerdate`) | `relaxed-sagan-ww188q` (09-23), `program-wizualizacji-2026-09` (09-21), `mv-design-pro-twin-audit-u4lhy0` (09-20), `max-dynamic-audit-kzbivg` (09-14), `opus5-dynamic-*` ×3 (09-10/11) — żadna nie niesie terminów (pkt 10) |

### 1.2 Wynik grep drzewa roboczego (plik planu wyłączony z interpretacji)

| Termin | Wynik | Interpretacja |
|---|---|---|
| `Bank Nastaw`, `AcceptedEvidence`, `ModelValidationStatus`, `ComplianceStimulus`, `PhysicalNetworkDisturbance`, `Explainable Verdict`, `AB1a`, `Program A/B`, `PhysicsDomain`, `PHYSICS_DOMAIN`, `SupraharmonicBand` | tylko `docs/plan/PROGRAM_AB_…md` | nie istnieją — potwierdzam plan |
| `AB-1` | 20+ plików kodu | **fałszywe trafienia**: podciąg `ZAB-100-BACKEND` i identyfikatorów testów kreatorów; nie ma związku z programem |
| **`WiPWC`** | **ok. 40 plików kodu produkcyjnego** | **ISTNIEJE** — plan §0.2 i §6.3 błędnie traktują WiPWC jako nowy byt. Stan: `network_model/catalog/types.py:1428,1888,3656,3795` (`ptpiree_wipwc_version`, `PtpireeGeneratorCertificate.wipwc_version`), `mv_ptpiree_catalog.py:147,243-264,342-453`, `application/analyses/dowod_certyfikatu.py:61,74,85` (`wipwc_version`, etykieta „Wersja WiPWC”), `api/catalog.py:1333`, frontend `ui/network-build/station-der/**`, `ui2/oze/macierz/**`, `ui/ncrfg-tests/api.ts:108`, `ui/help/HelpPanel.tsx:63,113,234`. Istnieje **wersja dokumentu i rejestr**, nie istnieje **reguła** WiPWC (kiedy certyfikat zastępuje test) |
| **`SyPGM`** | `ncrfg_ptpiree/contracts.py:15`, `engine.py:49,329-331`, `ncrfg_compliance/model_bridge.py:27-29,211`, OpenAPI snapshot | **ISTNIEJE** jako `PtpireeModuleFamily = Literal["PPM","SyPGM","Morski_PPM"]` w kontrakcie FROZEN. Plan §6.5 „PPM vs SyPGM — nowe pole” pomija, że rozróżnienie już jest (w solverze FROZEN) i że most modelu **wpisuje na sztywno `"PPM"`** (`model_bridge.py:211`) oraz **pomija generatory synchroniczne** (`model_bridge.py:266-267`) |

### 1.3 Werdykt śledczy

1. Dziewięć identyfikatorów §95 poza WiPWC i SyPGM **nigdy nie istniało** w żadnym commicie osiągalnym z żadnej z
   419 gałęzi ani 475 głów PR na `origin` przed `637a322f`. Potwierdzam wniosek planu co do treści, **koryguję
   uzasadnienie**: plan zbadał 3 gałęzie i płytki klon; pełny dowód daje pkt 9–11.
2. Czego NIE da się tym wykluczyć: pracy nigdy niewypchniętej z innego kontenera, gałęzi skasowanych na GitHubie bez
   PR, forków. To granica metody, nie luka wykonania.
3. **Korekta planu §0.2/§6:** WiPWC i SyPGM istnieją w kodzie — definicje §6.3 i §6.5 mają **rozszerzać istniejące
   byty**, a nie tworzyć drugie.
4. Wykryta **kolizja akronimu „WOS”**: `MAPA_DOMKNIECIA_PRODUKTU_2026-09.md:716` (OD-21) definiuje „WOS = właściwy
   operator systemu”, plan §6.1 używa „WOS = wymogi ogólnego stosowania”, rejestr PTPiREE niesie `wos_version` =
   „WOS 2018” / „WOS 2025” (wymogi), a dokumenty mówią „Wersja WOŚ” (`dowod_certyfikatu.py:84`). Trzy zapisy, dwa
   znaczenia. Rekomendacja: „WOS” = wymogi ogólnego stosowania (tak używa go rejestr PTPiREE i solver: „właściwego
   OS” w `engine.py:51,154`), „właściwy operator systemu” pisany w pełni albo „OS”; poprawka OD-21 i etykiety „WOŚ”.

---

## ZADANIE 2 — INWENTARZ WARSTWY REGULACYJNEJ

### 2.1 Profile `backend/src/catalog/profiles/nc_rfg/*.yaml` + `loader.py`

**Struktura (`loader.py`):** `NcRfgProfile` (65-77): `operator_id`, `operator_name_pl`, `voltage_level_pl` (tekst,
nie predykat), `last_revision` (znacznik pliku „2024-Q4”, nie wydanie dokumentu), `module_types[]`,
`frequency_response` (27-34), `reactive_power` (37-41), `voltage_levels.lvrt/hvrt` (44-51), `p_recovery_after_fault`
(54-57, **z wartościami domyślnymi w modelu Pydantic** 1,0 s / 80 %/s — ciche domyślne), `compliance_tests` (60-62,
martwe — OD-26). **Brak pól:** `source_document`, `version`, `valid_from`, `clause_ref`, zakres typu modułu dla
wymagań, zakres PPM/SyPGM, punkt pomiaru. `SUPPORTED_OPERATORS` (14) = pse, energa, tauron, enea, pge — **brak
piątego dużego OSD (Stoen Operator)**.

**`classify_module` (79-90):** progi z YAML; dla braku dopasowania spada do **ostatniego typu (D)** (89-90) — dla
mocy < 0,8 kW też zwraca D (nie „poza zakresem RfG”). To defekt klasyfikacji (moduł < 0,8 kW nie podlega
2016/631 wg art. 5 ust. 2 lit. a [PEWNE co do progu 0,8 kW]).

**Różnice między operatorami (pomiar parsowaniem wszystkich liści liczbowych, pse: 42 liście, OSD: 40 liści):**
- cztery OSD (energa, enea, pge, tauron): **0 różnic liczbowych** (`diff` różni się wyłącznie liniami 1-5 nagłówka);
- PSE vs OSD: **jedna różnica merytoryczna** — HVRT PSE ma 5 punktów z dodatkowym `(0,50 s; 1,20 pu)`
  (`pse.yaml:64`), OSD 4 punkty (`energa.yaml:33-36`); wszystkie `module_types` są identyczne we wszystkich 5
  plikach.

**Werdykt wobec SYNTEZA A-15** (`SYNTEZA_DOMKNIECIA_PRODUKTU_2026-09.md:559`): A-15 mówi „0 różnic między
operatorami (różnią się wyłącznie nagłówkiem; PSE niesie dodatkowo progi klas modułów)”. **Potwierdzam dla czterech
OSD, obalam dla PSE:** (a) PSE różni się liczbowo krzywą HVRT (jeden punkt), (b) progi `module_types` NIE są
cechą PSE — niosą je wszystkie pięć plików z identycznymi liczbami. Wniosek A-15 („zróżnicowanie OSD jest
pozorne”) pozostaje prawdziwy.

**Konsumenci profilu:** solver FROZEN `ncrfg_ptpiree/engine.py:234`; `compliance/nc_rfg_modul.py:69` (klasyfikacja,
profil referencyjny `pse`); `api/ncrfg_ptpiree_tests.py:27-44` (katalog), `api/oze_analysis_runs.py:255,344,381,652`
(trajektorie FRT, sekwencja FRT, pokrycie PQ, dokument studium); `enm/validator.py:660-681` (tryb
`voltage_control`); `application/analyses/pq_coverage.py:63-64`, `frt_trajektorie.py:217`, `frt_sekwencja.py:164`.
**Pola bez konsumenta (martwe):** `steady_state_hz_min/max`, `transient_hz_min/max`, `p_recovery_rate_pct_per_s`,
`required_for_modules`, `compliance_tests` (grep `backend/src` poza profilami — 0 trafień).

**Dwie prawdy wyboru operatora (nowe znalezisko):** generator niesie `materialized_params.profiles.nc_rfg_profile_ref`
(czytane przez `enm/validator.py:625-660`), a bieg zgodności przypadku bierze `operator_id` z **parametru trasy**
(`model_bridge.py:30`, „wybór projektanta”) i ignoruje profil zapisany na generatorze. Ten sam DER może być
walidowany wobec profilu X i oceniany wobec profilu Y.

### 2.2 Solver FROZEN `network_model/solvers/ncrfg_ptpiree/{contracts,engine}.py`

**Słownik werdyktów:** `PtpireeVerdict = pass | fail | no_data | not_required` (`contracts.py:16`); moduł
`overall_status = zgodny | niezgodny | brak_danych` (`contracts.py:123`), reguła `engine.py:246-251`:
**moduł bez żadnego testu wymaganego dostaje „zgodny”** (pusta koniunkcja) — dla typu A z certyfikatem
(`certificate_status="ptpiree_verified"`) wszystkie testy są `not_required` i wynik brzmi „zgodny” bez jednego
sprawdzenia; `dowod_ncrfg.py:219-225` nadaje mu `reportable/complete`.

**Katalog T01–T20 (`engine.py:45-171`) z klasyfikacją rzetelności:**

| Test | Zdolność | Wymagany dla | Algorytm | Klasa rzetelności (cytat) |
|---|---|---|---|---|
| T01 | LFSM-O | C, D; SyPGM A/B bez cert. (326-331) | `_frequency_test` 354-413 | **algebraiczny, zaszyta f=50,6 Hz** (369); porównanie droop z tolerancją ±1,0 p.p. (374) i deadband +0,05 Hz (375) — progi bez źródła; brak f(t)/P(t) |
| T02 | LFSM-U | C, D | ten sam `_frequency_test` | f=49,4 Hz (369); **ten sam droop i deadband co LFSM-O** — LFSM-U ma w RfG własne parametry (próg, statyzm) [PEWNE co do odrębności art. 15 ust. 2 lit. c]; test nie odróżnia |
| T03 | FSM | C, D | jw. | f=50,6 Hz; FSM ma własną martwą strefę i nieczułość — nie sprawdzane |
| T04 | odbudowa częstotliwości | C, D | jw. + `ramp ≥ 0,5·profil` (376-380) | współczynnik 0,5 bez źródła |
| T05 | regulacja P | B, C, D | `_active_power_control` 415-461 | cel 0,5·Pmax (428), tolerancja ×2 i minimum 0,1 min (435) — bez źródła |
| T06 | tryb regulacji U | C, D | `_reactive_voltage_test` 463-531 | **deklaracyjny**: `has_qu_curve` + porównanie zakresu Q |
| T07 | tryb Q | C, D | jw. | deklaracyjny |
| T08 | tryb cosφ | C, D | 473-497 | deklaracyjny: `cos_phi_min ≤ profil` |
| T09 | zdolność Q | B, C, D | 502-531 | deklaracyjny: zakres Q/Pn vs profil ±0,33 |
| **T10** | PMAX | B, C, D | 541-543 | **TAUTOLOGIA**: `ok = p_max_kw > 0`, a kontrakt wymusza `p_max_kw: Field(gt=0)` (`contracts.py:27`) → zawsze `pass` |
| T11 | PMIN | B, C, D | 546-552 | deklaracyjny: `0 ≤ p_min < p_max` |
| T12 | zaprzestanie generacji | A/B bez cert. | `_remote_power_command` 573-624 | deklaracyjny (flaga) + rampa ×2 (597) |
| T13 | zmniejszenie generacji | B bez cert. | jw., cel 0,2·Pmax (591) | jw. |
| **T14** | LVRT | B, C, D | `_ride_through_test` 626-682 | **TAUTOLOGIA**: `simulated_voltage = limiting.voltage_pu` (646-647) → `margin = 0` (648) → zawsze `pass`, gdy flagi są prawdą |
| **T15** | HVRT | B, C, D | 651-655 | **TAUTOLOGIA** (to samo) |
| T16 | odbudowa P | B, C, D | `_p_recovery_test` 684-717 | deklaracyjny: `t_deklarowany ≤ profil 1,0 s` |
| T17 | prąd bierny FRT | B, C, D | `_reactive_current_test` 719-755 | **zaszyte ΔU = 0,5 pu, K_FRT ≥ 2, Iq ≥ 1,0** (731-733) — żadna z liczb nie pochodzi z profilu ani ze źródła |
| T18 | wyspa / black start / POD | na żądanie | 757-809 | deklaracyjny: trzy flagi |
| T19 | SCADA + rejestrator | C, D | 811-848 | deklaracyjny: dwie flagi |
| **T20** | THD_U źródła | gdy podano THD | `_harmonics_test` 850-886 | **zaszyty limit 8 %** (860) bez źródła; liczbowo odpowiada charakterystyce napięcia zasilającego PN-EN 50160 (wielkość sieciowa, statystyczna), zastosowany do emisji urządzenia — dokładnie przeniesienie „kompatybilność/zasilanie → emisja”, którego zakazuje mandat §70 |

**Fałszywa deklaracja w rejestrze dowodowym:** `provenance.py:318-326` opisuje T20 jako „porównywane z limitem
profilu” — nieprawda, limit jest stałą solvera (`engine.py:860`). Jednocześnie T20 ma `DECLARATION +
DECLARED_CONFIGURATION` → `regulatory_evidence_eligible = True` (`provenance.py:199-202`). To samo dotyczy T10
(tautologia) — klasyfikowany jako „fakt konfiguracyjny”, więc wynik `pass` bez żadnej treści jest **raportowalny**.
To zawyżenie pewności, które AB-1b musi zamknąć (niżej §3, poz. 6).

### 2.3 `application/ncrfg_compliance/**`

- `model_bridge.py` (289 l.): inwentarz pól 23-72 jest rzetelny; defekty:
  1. **`module_family="PPM"` na sztywno** (211) i **pominięcie `gen_type=="synchronous"`** (266-267) — SyPGM typu A/B
     w SN/nN (agregaty biogazowe, kogeneracja, małe hydro) nie wchodzą do zgodności w ogóle; test `T01` dla SyPGM
     (`engine.py:326-331`) jest nieosiągalny z modelu.
  2. **`p_max_kw ← |generator.p_mw|`** (192, 213) — to **punkt pracy** (nastawa rozpływu), a klasyfikacja art. 5
     używa **mocy maksymalnej**; ENM ma `GenLimits.p_max_mw` (`enm/models.py:87`). Moduł 1,2 MW pracujący na 150 kW
     zostanie zaklasyfikowany jako typ A.
  3. **`voltage_kv ←` napięcie szyny generatora** (262, 268) — klasyfikacja i poziom napięcia wymagań dotyczą
     **miejsca przyłączenia**, nie zacisków falownika; dla wariantu `nn_side`/`block_transformer`
     (`enm/models.py:594-603`) szyna generatora to nN, a przyłączenie jest w SN.
  4. `certificate_status` (161-177): `POWIAZANY` → `ptpiree_verified` bez sprawdzenia zakresu ważności (moc, wersja
     oprogramowania, data ważności, warunek „tylko z modułem …”).
- `bieg.py`, `frt_input.py` — odczytane nagłówkowo; bez liczb normatywnych.

### 2.4 `solver_input/provenance.py` i `solver_input/dowod_ncrfg.py`

- Osie: `SourceKind` (19), `FieldQuality` (32: DATASHEET/ESTIMATED/SYSTEM_DEFAULT), `EvidenceTier` (70-119:
  VALIDATED_SIMULATION/DECLARATION/UNVALIDATED_MODEL/NOT_SIMULATED), `ClaimKind` (137-158), `CapabilityEvidence`
  (168-213), rejestr `_DYNAMIC_CAPABILITY_EVIDENCE` (237-371, 11 zdolności), fail-closed `classify_dynamic_capability`
  (374-395), `BRAK_DOWODU_PL` (127).
- Mapowanie `test_id → (capability_id, ClaimKind)`: **`dowod_ncrfg.py:46-67` (`TEST_ZDOLNOSC`)**, nie w
  `provenance.py`. Pin kompletności: `testy_bez_klasyfikacji()` (74-83) iteruje po `TEST_CATALOG` solvera.
- Brak w rejestrze: osi **walidacji modelu urządzenia** (czy parametry urządzenia są potwierdzone pomiarem lub
  certyfikatem) i osi **akceptacji metody dowodu przez profil**. `EvidenceTier` łączy dziś obie w jednej skali —
  dlatego AB-1a potrzebuje `ModelValidationStatus` jako drugiej osi (§3 poz. 8).
- `ocena_dowodowa_biegu` (228-260) — konsumenci: `api/ncrfg_ptpiree_tests.py`, `certyfikat_zgodnosci.py`,
  `wniosek_osd.py` (tranzytywnie).

### 2.5 `application/analyses/dowod_certyfikatu.py`

Tylko przepisuje tabliczkę (`_POLA_TABLICZKI` 67-75). Defekty danych:
- pole `acceptance_date` (etykieta „Data akceptacji”, 81) — w rejestrze **6697 z 6887 rekordów ma datę po
  2026-09-23** (np. `"31.12.2026"`), 184 w przeszłości, 6 dat niepoprawnych kalendarzowo (`"31.09.2029"`). To jest
  najpewniej **data ważności**, nie akceptacji — dokument formalny (certyfikat, wniosek OSD) niesie mylną etykietę.
- `firmware` — 632 rekordy zawierają śmieci nagłówka PDF („… number dokumentu / Document Acceptance Date Nazwa
  producenta /”), a zakres wersji oprogramowania jest składnikiem ważności certyfikatu.

### 2.6 Rejestr certyfikatów `network_model/catalog/mv_ptpiree_catalog.py` + `ptpiree_wykaz_snapshot.json`

- Snapshot: schema `ptpiree_wykaz_snapshot/v1`, **6887 rekordów** = 6356 (źródło „WiPWC 1.2”, publikacja
  2026-05-06, `…Wykaz-urzadzen_1.2.pdf`) + 531 („WiPWC 1.3”, 2026-05-08, `…Wykaz-urzadzen_1.3.pdf`); 782 różne
  numery dokumentów (jeden certyfikat obejmuje wiele modeli); `certificate_status = ptpiree_verified` we
  wszystkich; `electrical_data_status = requires_datasheet` we wszystkich; `module_types`: A 4334, A+B 1772,
  A–D 261, B 239, B–D 111, D 89, C+D 57, C 1, **puste 23**; `wos_version`: brak 6356, „WOS 2018” 331, „WOS 2025”
  200 (rejestr sam cytuje wersję WOS 2025 — wspiera OD-21).
- „Dane śladowe” (MAPA K-H, J3, `MAPA_DOMKNIECIA_PRODUKTU_2026-09.md:561`) dotyczą **dopasowania katalog
  przekształtników ↔ rejestr (1/176)**, nie samego rejestru (rejestr jest pełny). Plan §6.3 miesza te dwa fakty.
- `PTPIREE_ACCEPTED_FROM = "2024-11-01"` (`mv_ptpiree_catalog.py:61`) — „fakt regulacyjny” bez źródła.
- **Nazwa źródła:** plik PDF to „Wykaz urządzeń”, a snapshot etykietuje go `source_version: "WiPWC 1.2"`. Relacja
  „wykaz urządzeń” ↔ „WiPWC” (czy wykaz jest częścią WiPWC, czy osobnym dokumentem z numeracją zgodną z wersją
  WiPWC) — **[DO POTWIERDZENIA — OD]**.
- **Błędna atrybucja WiPWC do aparatury, kabli, transformatorów:** `mv_switch_catalog.py:961,1016-1117`,
  `mv_cable_line_catalog.py:358`, `mv_transformer_catalog.py:1226` („PTPiREE WiPWC” jako źródło danych rozdzielnic
  ZPUE, kabli, transformatorów). Wykaz PTPiREE dotyczy modułów wytwarzania / ich komponentów (falowniki,
  przekształtniki), nie aparatury SN — to cytat fikcyjnej proweniencji (klasa: fabrykacja źródła).

### 2.7 Koncepcja „profilu regulacyjnego” w kodzie i dokumentach

- `ProfilRegulacyjny`/`RegulatoryProfile`/`regulatory_profile`: **0 trafień** poza planem. Faktycznym profilem jest
  `NcRfgProfile` (loader).
- `docs/analysis/NC_RFG_PTPiREE_TESTY_KANON.md:47-60`: T01–T20 = numeracja repo (Procedura PTPiREE wer. 3.0, Tabela 1
  nie numeruje testów); kanon mówi „certyfikat PTPiREE może zamknąć część oceny dokumentacyjnej” (93) — nie określa
  której (to jest luka WiPWC).
- `docs/audit/FRT_PROWENIENCJA_NORMATYWNA.md`: trzy reprezentacje obwiedni FRT (R1 YAML, R2
  `application/stability/voltage_trajectory.py:129-139` z cytatem **„NC RfG Annex II”**, R3
  `frontend/src/ui/network-build/station-der/frtEnvelopeValidator.ts:52-65`). **Stan na HEAD: R2 i R3 nadal
  istnieją**; R3 ma jedynego importera — własny test (`__tests__/frtEnvelopeValidator.test.ts:7`) — dopuszczona
  kasacja (§5 dokumentu) nie wykonana. Cytat R2 „Annex II” jest nieweryfikowalny: w 2016/631 wymagania FRT stoją w
  art. 14 ust. 3 (typ B; tabele 3.1 dla SPGM i 3.2 dla PPM) i art. 16 ust. 3 (typ D; tabele 7.1/7.2) [PEWNE co do
  lokalizacji w artykułach; numery tabel — wysoka pewność].

### 2.8 Ochrona LoM `application/analyses/ochrona_lom.py` i pokrewne

- Progi to **stałe modułu**, nie profil: `ROCOF_MIN_DF_DT_HZ_S = 2.0` (65), `FREQ_UNDER_MAX_HZ = 47.5` (69),
  `FREQ_OVER_MIN_HZ = 51.5` (70); źródła tekstowe 72-106; funkcja 78 bez okna (101-106, uczciwe INFO).
- Ocena cytatów: art. 13 ust. 1 lit. b 2016/631 wymaga zdolności do wytrzymania ROCOF **o wartości określonej przez
  właściwego OSP** — rozporządzenie nie podaje 2 Hz/s [PEWNE]; „wartość krajowa PTPiREE 2 Hz/s” bez dokumentu,
  wersji i okna pomiarowego (ROCOF bez okna uśredniania jest niedookreślony) — **[DO POTWIERDZENIA — OD]**. Art. 13
  ust. 1 lit. a, tabela 2 (Europa kontynentalna): 47,5–48,5 Hz ≥ 30 min, 48,5–49,0 Hz czas określa OSP, 49,0–51,0 Hz
  bez ograniczeń, 51,0–51,5 Hz 30 min [PEWNE]. Okno „81U ≤ 47,5 Hz, 81O ≥ 51,5 Hz” ignoruje czasy — nastawa 81U
  na 48,0 Hz z opóźnieniem ≥ 30 min nie narusza tabeli 2, a moduł ją odrzuci.
- **27/59 w ogóle nie istnieją** w `ProtectionSetting.function_type` (`enm/models.py:104-118`), choć
  `domain/der_protection_functions.py:314-329` wymaga 27/59/81U/81O jako ochrony od pracy wyspowej, z podstawą
  „IEEE 1547 / NC RfG Art. 14” — IEEE 1547 to norma USA, a art. 14 2016/631 nie wymaga zabezpieczenia od pracy
  wyspowej; właściwą klasą dokumentu jest zabezpieczenie interfejsowe PN-EN 50549-1 (nN) / PN-EN 50549-2 (SN)
  [PEWNE co do istnienia i zakresu; wydanie 2019 — wysoka pewność] oraz IRiESD. BESS wyłączony z wymogu
  (`der_kind in ("PV","FW")`, 313) — luka.
- `application/analyses/protection/sanity_checks/rules.py`: U< < 0,5·Un (323), U> > 1,2·Un (340), f< < 45 Hz (401),
  f> > 55 Hz (418) — progi wiarygodności bez źródła (dopuszczalne jako sanity, nie jako wymaganie).

### 2.9 Konsumenci frontendu

| Moduł | Co czyta | Werdykt |
|---|---|---|
| `ui2/oze/macierz/**` (`macierzModel.ts:100-521`, `strings.ts:139-190`, `SzczegolWerdyktu.tsx`, `SladTestu.tsx`, `SekcjaZgodnosciPrzekrojowej.tsx`) | `pass/fail/no_data/not_required`, `zgodny/niezgodny/brak_danych`, `evidence_by_test` (407), `reporting_status` | wyświetla stopień dowodowy; nie pokazuje wersji profilu, źródła wymagania ani metody dowodu |
| `ui/ncrfg-tests/api.ts` | kontrakt biegu, `wipwc_version` (108), `module_family` | warstwa `ui/` — typy współdzielone przez macierz |
| `ui2/wyniki/odbior/**` (`api.ts:52-92`) | model vs pomiar U/P/Q: `werdykt: string`, odchyłki, tolerancje, `zrodlo_tolerancji`, `slad_pl` | zalążek osi `device_model_validated` (walidacja modelu pomiarem) — dziś tylko rozpływ |
| `ui2/wyniki/ocena/**` (`api.ts:20-151`, `model.ts`) | `SPELNIA/NIE_SPELNIA/BRAK_PODSTAW` z wartością, odniesieniem, marginesem, `norma_pl`, `dowod` | najbliższy istniejący kształt wyniku wyjaśnialnego (patrz §3 poz. 11) |
| `ui/network-build/station-der/**` | `ptpiree_wipwc_version`, `ptpiree_wos_version`, R3 obwiednia | R3 martwa |

### 2.10 Tabela wszystkich liczb wymagań w kodzie i YAML

Oznaczenia: „Źródło = BRAK” — plik nie cytuje dokumentu z wersją i punktem. „Typ” i „punkt pomiaru” — co kod
zakłada (zwykle nic, co samo jest luką).

| Wartość | Plik:linia | Cytowane źródło (dokument+wersja+punkt) | Poziom napięcia | Typ modułu | Punkt pomiaru |
|---|---|---|---|---|---|
| typ A 0,8–1000 kW, U ≤ 110 kV | `pse.yaml:13-17` (identycznie 4 OSD) | „NC RfG art. 5” — bez wersji decyzji; **sprzeczne z progami PL 200 kW / 10 MW / 75 MW** udokumentowanymi w `compliance/nc_rfg_modul.py:23-37` | wszystkie | klasyfikacja | brak (powinno: miejsce przyłączenia) |
| typ B 1000–50000 kW | `pse.yaml:18-22` | jw. | wszystkie | klasyfikacja | brak |
| typ C 50000–75000 kW | `pse.yaml:23-27` | jw. | wszystkie | klasyfikacja | brak |
| typ D ≥ 75000 kW lub ≥ 110 kV | `pse.yaml:28-31` | jw. (D przez „fallback”, `loader.py:89-90`) | wszystkie | klasyfikacja | brak |
| f ustalona 49,5–50,5 Hz | `pse.yaml:34-35` | BRAK (nie odpowiada tabeli 2 art. 13) — martwe pole | nie określono | nie określono | brak |
| f przejściowa 47,5–51,5 Hz | `pse.yaml:36-37` | BRAK — martwe pole | nie określono | nie określono | brak |
| statyzm 5 % | `pse.yaml:38` | BRAK (komentarz „wymagany dla B/C/D”) | nie określono | T01–T04 wymagane tylko C/D | brak |
| martwa strefa 0,2 Hz | `pse.yaml:39` | BRAK | nie określono | jw. | brak |
| rampa 10 %/min | `pse.yaml:40` | BRAK | nie określono | T04/T05/T12/T13 | brak |
| Q ±0,33 (nazwa pola „pct”, wartość ułamek) | `pse.yaml:43-44` | BRAK | nie określono | T09 (B, C, D) | brak (baza: `Pn` modułu, `model_bridge.py:65-68`) |
| cosφ_min 0,95 | `pse.yaml:45` | BRAK | nie określono | T08 | brak |
| tryby regulacji U/Q | `pse.yaml:46-50` | BRAK | nie określono | walidator ENM | — |
| LVRT (0; 0,05) (0,15; 0,05) (0,70; 0,50) (1,50; 0,85) (3,00; 0,90) | `pse.yaml:55-59`, `energa.yaml:27-31` | BRAK | nie określono | T14 B, C, D — **brak różnicowania PPM/SyPGM i typu** | brak (RfG: miejsce przyłączenia) |
| HVRT PSE 5 pkt / OSD 4 pkt | `pse.yaml:62-66`, `energa.yaml:33-36` | BRAK; 2016/631 nie zawiera wymogu HVRT dla typów A–C [PEWNE co do braku w art. 13/14/17/20] | nie określono | T15 | brak |
| odbudowa P 1,0 s | `pse.yaml:70` + domyślna `loader.py:56` | BRAK | nie określono | T16 B, C, D | brak |
| odbudowa P 80 %/s | `pse.yaml:71` + `loader.py:57` | BRAK — martwe pole | — | — | — |
| f testowa 50,6 / 49,4 Hz | `engine.py:369` | BRAK | — | T01–T04 | — |
| tolerancja statyzmu ±1,0 p.p. | `engine.py:374` | BRAK | — | T01–T04 | — |
| tolerancja martwej strefy +0,05 Hz | `engine.py:375` | BRAK | — | T01–T04 | — |
| rampa T04 ≥ 0,5·profil | `engine.py:376-380` | BRAK | — | T04 | — |
| cel 0,5·Pmax, tolerancja ×2, minimum 0,1 min | `engine.py:428,435` | BRAK | — | T05 | — |
| cel 0 / 0,2·Pmax, ×2, 0,1 min | `engine.py:591,597` | BRAK | — | T12/T13 | — |
| ΔU 0,5 pu; K_FRT ≥ 2; Iq ≥ 1,0 pu | `engine.py:731-733` | BRAK | — | T17 | — |
| THD_U ≤ 8 % (emisja urządzenia) | `engine.py:860` | BRAK (liczbowo = charakterystyka napięcia EN 50160) | — | T20 | brak |
| ROCOF ≥ 2 Hz/s | `ochrona_lom.py:65,77-81` | art. 13 ust. 1 lit. b 2016/631 (liczby tam nie ma) + „PTPiREE 2 Hz/s” bez dokumentu | nie określono | nie określono | brak okna pomiaru |
| 81U ≤ 47,5 Hz / 81O ≥ 51,5 Hz | `ochrona_lom.py:69-70,86-99` | art. 13 ust. 1 lit. a, tabela 2 (bez czasów) | nie określono | nie określono | przekładnik pola |
| U< 0,5·Un, U> 1,2·Un | `rules.py:323,340` | BRAK (sanity) | — | — | — |
| f< 45 Hz, f> 55 Hz | `rules.py:401,418` | BRAK (sanity) | — | — | — |
| LVRT R2 (0; 0) (0,15; 0) (0,15001; 0,30) (0,7; 0,70) (1,5; 0,85) (3; 0,90) (60; 0,90), U_max 1,30…1,10 | `voltage_trajectory.py:129-139` | „NC RfG Annex II” — cytat błędny | „SN/WN” | „B/C/D” | brak |
| LVRT/HVRT R3 | `frtEnvelopeValidator.ts:52-65` | BRAK (nazwa „PSE”) | — | — | — |
| THD_U > 8 % „PN-EN 50160” / > 5 % „IEEE 519” / TDD > 5 % | `v126_academic.py:455-460` (FROZEN), `api/v126_academic.py:421` | bez wydania; IEEE 519 zastosowane bez rozróżnienia klasy napięcia (≤ 1 kV ma inne granice niż 1–69 kV) i bez stosunku Isc/IL dla TDD [PEWNE co do struktury IEEE 519] | wszystkie szyny jednakowo | — | każda szyna (nie miejsce przyłączenia) |
| Plt 0,7 SN (poziom planowania), m = 3 | `migotanie.py:23-31,46-55` | IEC/TR 61000-3-7:2008 §5.2, Tablica 1 | SN | — | miejsce przyłączenia | 
| `PTPIREE_ACCEPTED_FROM` 2024-11-01 | `mv_ptpiree_catalog.py:61` | BRAK | — | — | — |
| próg 87T 1600 kW | `der_protection_functions.py:58` | (poza zakresem RfG; do sprawdzenia źródła) | — | — | — |

`migotanie.py` jest jedynym miejscem, gdzie liczba ma dokument, wydanie, klauzulę, klasę (poziom planowania) i
poziom napięcia — to wzorzec, który AB-1b ma uogólnić.

---

## ZADANIE 3 — PRZEGLĄD PROJEKTU §6 (definicje 1–11) i kamieni AB-1a/1b/1d_min/1c

Format każdej pozycji: (a) poprawność, (b) miejsce wpięcia, (c) rdzenie FROZEN do ominięcia, (d) testy przypinające,
(e) konsumenci frontendu.

### §6.1 WOS resolver
(a) Kierunek poprawny, trzy korekty. (1) Wymogi ogólnego stosowania wynikają z art. 7 2016/631 (propozycja
właściwego operatora systemu, zatwierdzenie organu regulacyjnego) [PEWNE co do mechanizmu]; zdanie planu
„zatwierdzone przez URE dla PSE” zawęża podmiot — czy w PL zatwierdzano osobne dokumenty dla OSD, czy jeden
wspólny — **[DO POTWIERDZENIA — OD]**. (2) Klucz rozwiązywania „data warunków przyłączenia” jest niewystarczający:
2016/631 odróżnia moduł nowy od istniejącego po dacie zawarcia ostatecznej i wiążącej umowy na zakup głównego
urządzenia wytwórczego (art. 4 ust. 2) [PEWNE co do kryterium, daty graniczne — OD]; resolver potrzebuje
`data_umowy_urzadzen` i `data_przylaczenia` osobno, a wersję WOS wybiera po dacie obowiązywania. (3) Brak wymiaru
„magazyn energii”: 2016/631 nie obejmuje magazynów poza elektrowniami szczytowo-pompowymi (art. 3 ust. 2) [PEWNE
co do wyłączenia; litera przepisu — OD]; dla BESS resolver musi zwrócić nazwane `REQUIREMENT_UNVERIFIED` z
powodem „wymagania krajowe dla magazynów — OD”, nie wymagania PPM. Akronim: patrz §1.3 p. 4.
(b) Rozszerzyć `catalog/profiles/nc_rfg/loader.py` o `NcRfgProfile.zrodlo` (`source_document`, `version`,
`valid_from`, `validation_status`) i `wymagania[]` (`clause_ref`, `module_types`, `rodzaj_modulu`, `poziom_napiecia`
jako predykat kV, `miejsce_pomiaru`, `wartosc`, `jednostka`); **nie** zakładać drugiego katalogu `wos/` z
równoległym loaderem — jeden loader, dwa rodzaje plików (profil operatora = IRiESD/warunki; profil WOS = krajowy),
powiązane referencją. `classify_module` przenieść z progów per plik do jednego źródła krajowego (dziś pięć kopii)
i naprawić fallback D (89-90) oraz < 0,8 kW.
(c) YAML jest czytany przez solver FROZEN (`engine.py:234`); każde nowe pole YAML musi być addytywne i
opcjonalne dla `NcRfgProfile` — zmiana liczb w YAML **zmienia werdykty solvera FROZEN**, więc liczby zostają do
OD-21, a nowe pola są metadanymi. Solver nie czyta nowych pól; resolver żyje w `application/` lub `catalog/`.
(d) Testy: każdy plik profilu ma `source_document` albo `validation_status=UNVERIFIED_SOURCE` (pin w obie strony);
resolver dla BESS zwraca odmowę; resolver bez wersji ważnej na datę → odmowa; `classify_module(0,5 kW)` → poza
zakresem; test „ta sama klasyfikacja z jednego źródła” (zastępuje pięć kopii progów).
(e) `ui2/oze/macierz/**` (nagłówek: wersja i status źródła profilu), dokumenty certyfikatu/wniosku/studium
(sekcja „Podstawa”), kreator OZE (wybór profilu → jedna prawda operatora, patrz 2.1 „dwie prawdy”).

### §6.2 PTPiREE resolver
(a) Poprawne: T01–T20 = jedyna przestrzeń numeracji, numeracja własna repo (kanon §3.1). Uzupełnienie: mapowanie
musi być **wymaganie → test**, a test nie może nieść liczb wymagań (dziś T17/T20/tolerancje są w solverze —
2.10). Tytuł „Procedura testowania … wer. 3.0, obowiązuje od 2026-01-01” opieram wyłącznie na cytacie repo
(`NC_RFG_PTPiREE_TESTY_KANON.md:5,49`) — **[DO POTWIERDZENIA — OD]**.
(b) Rozszerzyć `solver_input/dowod_ncrfg.py::TEST_ZDOLNOSC` o `wymaganie_ref` (identyfikator wymagania z profilu) —
to jest już rejestr POZA solverem; nie tworzyć trzeciej tabeli.
(c) `TEST_CATALOG` (FROZEN) nietknięty; OD-20(c) zbędne.
(d) Test: każdy `test_id` z `TEST_CATALOG` ma wymaganie albo jawne `BEZ_WYMAGANIA` (np. T10) — iteracja po
katalogu solvera (wzorzec `testy_bez_klasyfikacji`).
(e) `SzczegolWerdyktu.tsx` — pokazuje wymaganie i klauzulę obok testu.

### §6.3 WiPWC
(a) Definicja kierunkowo poprawna; tytuł „Warunki i procedury wykorzystania certyfikatów w procesie przyłączenia
modułów wytwarzania energii” — rozpoznaję taki dokument PTPiREE z wysokim prawdopodobieństwem, ale dokładny tytuł,
numeracja wersji (1.2/1.3 w repo) i relacja do „Wykazu urządzeń” — **[DO POTWIERDZENIA — OD]**. Korekta faktów:
WiPWC już istnieje w modelu danych (§1.2); rejestr ma 6887 realnych rekordów (nie „dane śladowe”). Zakres ważności
certyfikatu (moc, typ, wersja oprogramowania, warunek „tylko z …”) jest w danych częściowo (`firmware`
zaśmiecone w 632 rekordach, warunek w `ptpiree_note`) — reguła WiPWC bez oczyszczenia tych pól byłaby fałszywą
pewnością.
(b) Reguła w `application/ncrfg_compliance/` (obok `certificate_status_z_tabliczki`, `model_bridge.py:161`):
`status_certyfikatu(tabliczka, data_oceny, moc, wersja_oprogramowania) → {WAZNY_W_ZAKRESIE, POZA_ZAKRESEM, WYGASLY,
NIEOKRESLONY}` → dopiero to mapuje na `certificate_status` solvera (`ptpiree_verified`/`expired`/`unknown`, kontrakt
już ma `expired`, `contracts.py:13`, dziś bez dostawcy — `model_bridge.py:169-171`). Wymaga poprawy etykiety
`acceptance_date` (2.5).
(c) Solver FROZEN nietknięty — reguła produkuje wyłącznie wejście `certificate_status`.
(d) Testy: data ważności w przeszłości → `expired` (dziś niemożliwe); moc modułu poza `module_types` pozycji →
`POZA_ZAKRESEM`; warunek „tylko z modułem X” bez X w modelu → `NIEOKRESLONY`; 6 dat niekalendarzowych → jawny błąd
danych, nie cicha akceptacja.
(e) `AddDerWizard.tsx:2047` („WOS/WiPWC”), macierz (status certyfikatu z powodem), dokumenty formalne.

### §6.4 Bank Nastaw
(a) **Nie znam dokumentu PTPiREE o tytule „Bank Nastaw”.** Nie potwierdzam jego istnienia, wydawcy ani zakresu —
**[DO POTWIERDZENIA — OD]**. Zasada architektoniczna planu („nastawy wymagane = profil; nastawy rzeczywiste = model;
OD-34”) jest poprawna. Klasa dokumentów, z których wymagania nastaw zabezpieczeń interfejsowych realnie pochodzą:
IRiESD danego OSD (i jego standardy techniczne), PN-EN 50549-1/-2 (funkcje i zakresy nastaw zabezpieczenia
interfejsowego) [PEWNE co do zakresu norm, nie co do polskich wartości domyślnych].
(b) Sekcja profilu `nastawy_wymagane[]`: `funkcja (27/59/81U/81O/81R/78)`, `prog`, `opoznienie`, `okno_pomiaru`,
`miejsce_pomiaru`, `zrodlo`. Konsument: `ochrona_lom.py` zastępuje stałe 65-70 odczytem profilu (z fail-closed
INFO, gdy profil pusty — wzorzec funkcji 78). **Warunek wstępny:** `ProtectionSetting.function_type` nie ma 27/59
(`enm/models.py:104-118`) — dopisać addytywnie, inaczej wymaganie nie ma z czym się porównać.
(c) `protection` IEC 60255 (FROZEN) nietknięty — to warstwa interpretacji.
(d) Testy: nastawa 81U 48,0 Hz z opóźnieniem zgodnym z tabelą czasu → nie „naruszenie”; profil bez sekcji → INFO z
nazwą braku; 27/59 zadeklarowane w `der_protection_functions` → sprawdzane (dziś nie); BESS objęty wymogiem.
(e) Ekran LoM (konsument `api` LoM), inspektor pola SN (nastawy 27/59).

### §6.5 PPM vs SyPGM
(a) Definicja 2016/631 [PEWNE]: moduł parku energii = jednostka lub zespół jednostek przyłączonych do sieci
niesynchronicznie lub przez energoelektronikę; SPGM = przyłączony synchronicznie. Z tego wynika mapowanie
`gen_type`: `synchronous → SyPGM`; `pv_inverter`, `wind_inverter`, `fw_pmsg`, `fw_dfig`, `fw_scig` → PPM (SCIG jest
maszyną asynchroniczną przyłączoną bezpośrednio, czyli niesynchronicznie — PPM); `bess` → **poza zakresem 2016/631**
(pkt §6.1) — trzecia wartość, nie PPM.
**Czy potrzebne nowe pole?** Nie. Wartość jest **wyprowadzalna** z `Generator.gen_type` (`enm/models.py:571-582`),
a spójność sprawdzalna z `dynamika.rodzina` (`enm/dynamika_modele.py:155,218,274,313,387`: `synchroniczna` ↔
`synchronous`). Zapisane pole `Generator.modul_wytworczy` byłoby drugą prawdą o tym samym fakcie (klasa defektu z
reguły „predykaty parami”). Rekomendacja: funkcja `rodzaj_modulu_nc_rfg(generator) -> Literal["PPM","SyPGM",
"POZA_ZAKRESEM_RFG"]` obok `GEN_TYPES_PRZEKSZTALTNIKOWE` (`enm/models.py:562`) + reguła walidatora: sprzeczność
`gen_type` vs `dynamika.rodzina` = blocker.
(b) `model_bridge.py:211` (zamiast „PPM” na sztywno) i 266-267 (włączyć SyPGM do biegu; BESS → pominięty z nazwanym
powodem `poza_zakresem_rfg`). Przy okazji: `p_max_kw ← GenLimits.p_max_mw` zamiast `p_mw`, napięcie ← miejsce
przyłączenia (2.3).
(c) Kontrakt solvera już ma `module_family` — zero zmian FROZEN.
(d) Test iloczynu cech: `gen_type × connection_variant × (p_mw ≠ p_max_mw)` — klasyfikacja nie zależy od punktu
pracy; SyPGM typu B bez certyfikatu dostaje T01 z modelu.
(e) `ui2/oze/macierz` (kolumna rodzaju modułu), kreator źródła OZE / generatora SN.

### §6.6 AcceptedEvidenceMethods
(a) Poprawna idea; zbiór `{SIMULATION_VALIDATED_MODEL, TYPE_TEST, COMMISSIONING_TEST, CERTIFICATE, DECLARATION}`
jest spójny z tytułem IV 2016/631 (monitorowanie zgodności: testy, symulacje, certyfikaty sprzętu — art. 2
definiuje „certyfikat sprzętu”) [PEWNE co do istnienia tych kategorii]. Który zbiór jest akceptowany per wymaganie w
PL — wyłącznie z WOS/WiPWC/Procedury (OD-21).
(b) **Nie** nowa oś obok `EvidenceTier`, tylko funkcja: `ComplianceResult` = (metoda, którą faktycznie dostarczono,
wyprowadzona z `EvidenceTier` + `ClaimKind` + status certyfikatu) ∈ (metody akceptowane przez profil dla
wymagania). Mapowanie: `VALIDATED_SIMULATION → SIMULATION_VALIDATED_MODEL`, `DECLARATION → DECLARATION`,
certyfikat z §6.3 → `CERTIFICATE`, `ui2/wyniki/odbior` (pomiar) → `COMMISSIONING_TEST`. Wynik bez metody
akceptowanej → `REQUIREMENT_UNVERIFIED`. To zamyka dzisiejszy błąd, że T10/T20 są raportowalne tylko dlatego, że są
„faktem konfiguracyjnym” (2.2).
(c) `dowod_ncrfg.py` poza FROZEN — tam.
(d) Test: T10 (tautologia) nie może dać `reportable`, dopóki profil nie akceptuje `DECLARATION` dla PMAX; profil bez
listy metod → wszystkie wymagania `REQUIREMENT_UNVERIFIED`; moduł bez wymaganych testów **nie** jest „zgodny”
(pusta koniunkcja, `engine.py:246-251` — reinterpretacja w warstwie aplikacji, nie w solverze).
(e) Macierz, certyfikat, wniosek OSD — nowy stan „wymaganie niezweryfikowane” obok „brak dowodu”.

### §6.7 Internal test IDs
(a) Poprawne. (b) „Mapowanie w rejestrze `provenance.py` (A-2)” — mapowanie test PTPiREE → zdolność żyje dziś w
`dowod_ncrfg.py:46-67`, nie w `provenance.py`; rejestr identyfikatorów wewnętrznych (E2E-*, G*, M*) powinien żyć
tam, gdzie żyją bramki (`tests/walidacja_fizyczna/**` manifest), a relacja do zdolności w `provenance.py` jako
`CapabilityEvidence.audit_ref`/dowód awansu. (c) nic FROZEN. (d) guard: identyfikator `T\d\d` poza
`TEST_CATALOG`/`TEST_ZDOLNOSC` = błąd; `T\d{1,2}` bez zera wiodącego (dawny `checker.py`, dziś w
`compliance_tests` YAML) = błąd poza plikami profili (OD-26). (e) brak — identyfikatory wewnętrzne nie idą do UI
(reguła „no codenames”).

### §6.8 ModelValidationStatus
(a) Poprawne: trzy pytania rozłączne (W-96). Uwaga semantyczna: `compliance_evidence_accepted` **nie jest cechą
modelu** — zależy od wymagania i profilu (ten sam model może być akceptowany dla LVRT i nie dla LFSM-O). Na modelu
urządzenia zostają dwie osie: `rownania_zwalidowane` (klasa urządzenia wobec wyroczni) i
`parametry_urzadzenia_zwalidowane` (konkretny egzemplarz/typ wobec pomiaru lub certyfikatu); trzecia
(`dowod_zaakceptowany`) należy do `ComplianceResult` (§6.6). Nazwy różne od `EvidenceTier` (wzorzec A-8) —
poprawnie.
(b) Osie modelu wpiąć w `enm/dynamika_modele.py::ProweniencjaParametrow` (parametry) i w rejestr zdolności (równania);
sekcje katalogu (W-68) — statusy `VALIDATED/UNVALIDATED/MEASURED/CERTIFIED/UNKNOWN/OUTSIDE_DOMAIN` w
`network_model/catalog/types.py` jako pole sekcji. Dostawca pierwszej realnej wartości
`parametry_urzadzenia_zwalidowane = MEASURED`: istniejący `ui2/wyniki/odbior` (model vs pomiar) — dziś tylko U/P/Q
rozpływu.
(c) `stability_rms`, `frt_hvrt` FROZEN — nie dopisywać statusu do ich kontraktów; status liczony w adapterze.
(d) Test: `EvidenceTier.VALIDATED_SIMULATION` niemożliwy, gdy `parametry_urzadzenia_zwalidowane ≠ {MEASURED,
CERTIFIED}` (predykat parami — jedno źródło prawdy); nowa rodzina dynamiczna bez statusu → `UNKNOWN` (fail-closed).
(e) Inspektor urządzenia (ui2), macierz, ekran stabilności.

### §6.9 ComplianceStimulus ≠ PhysicalNetworkDisturbance
(a) Rozróżnienie poprawne i ważne. Fizycznie bodziec na zaciskach (zadany profil U(t) albo f(t)) to **inny
warunek brzegowy** niż zdarzenie w sieci: sieć zostaje zastąpiona źródłem o przebiegu zadanym (stanowisko
badawcze), a nie zmodyfikowana topologicznie.
(b) **Osobny kontrakt, nie nowy rodzaj w `ZdarzenieDynamiczne`** (`enm/scenariusze.py:262-272`). Argumenty:
(1) zdarzenia sieciowe są walidowane referencjami do elementów modelu (`_refy_zdarzenia`, ~330) — bodziec odnosi się
do zacisków jednego urządzenia i wymaga zastąpienia reszty sieci; (2) mieszanie w jednej unii pozwoliłoby złożyć
scenariusz „zwarcie w sieci + zadany U(t) na zaciskach” bez fizycznego sensu; (3) wynik musi nieść, którym był —
rozłączność wymuszona typem jest pewniejsza niż flagą. Proponowany kształt:
`BadanieZgodnosci{urzadzenie_ref, bodziec: ProfilNapieciaZaciskow | RampaCzestotliwosci | SkokCzestotliwosci,
impedancja_zastepcza_sieci (jawna, z proweniencją, zakaz domyślnej), horyzont_s, krok_wyjscia_s}` obok
`ScenariuszDynamiczny`, oba jako warianty `rodzaj_badania` biegu `dynamika_rms`. `ScenariuszDynamiczny.tresc()`
(hash) nie zmienia się, bo scenariusz sieciowy nie dostaje nowego pola.
(c) Rdzeń `network_model/solvers/dynamika/**` nie jest na liście FROZEN (R-07), ale jest pod bramkami R10 — warunek
brzegowy „szyna o zadanym przebiegu” wymaga zmiany rdzenia (`silnik.py`, dziś szyna sztywna ~870) → karta AB-2/AB-3,
nie AB-1a; AB-1a daje tylko kontrakt z nazwaną odmową `bodziec.rdzen_nieobslugiwany`.
(d) Test: scenariusz z oboma rodzajami = 422; wynik niesie `rodzaj_badania`; odciski istniejących scenariuszy bez
zmian (pin hash).
(e) Kreator scenariusza dynamiki (ui2) — osobny tor „badanie zgodności na zaciskach”; macierz NC RfG konsumuje
wyłącznie wyniki rodzaju „badanie zgodności”.

### §6.10 AB-1d_min przed AB-1c
(a) Poprawne co do kolejności. **Kolizja z istniejącym stanem:** `application/solvers/solver_capability_registry.py:218-230`
już rejestruje `POWER_QUALITY_HARMONICS` (`analysis_type="power_quality_harmonics"`, `availability="available"`,
`reportable=True`, `proof_support=True`) wskazujący na `v126_academic` (FROZEN). Dodanie `harmoniczne` z odmową
obok tworzy dwie prawdy o tej samej zdolności: jedna mówi „dostępne i raportowalne”, druga „solver nieobecny”.
Korekta faktu planu §2 (W6-7): `v126_academic._power_quality` **buduje Y(h)** (`v126_academic.py:240-270, 421-436`)
— nie jest „sumowaniem bez modelu sieci”; jest natomiast (i) modelem `R = const, X·h` bez kwalifikacji domeny
(257-260 — dokładnie zakaz H-42), (ii) wstrzykiwaniem prądów wszystkich źródeł z fazą 0 (433 — niejawna suma
koherentna, zakaz H-49), (iii) oceną limitami z 2.10.
(b) AB-1d_min musi w tym samym kroku przeklasyfikować `POWER_QUALITY_HARMONICS` w rejestrze zdolności (rejestr jest
w `application/`, nie FROZEN): `reportable=False`, tier `UNVALIDATED_MODEL`, `superseded_by="harmoniczne"` — inaczej
gotowość zamelduje `ready`. `domain/analysis_run.py:10` (`AnalysisType = Literal["PF","short_circuit_sn"]`) to trzecia
lista typów biegów — wskazać jedną.
(c) `v126_academic.py` FROZEN — nie zmieniać; klasyfikacja wyłącznie w rejestrze.
(d) Test: każdy `analysis_type` z `PhysicsDomain ∈ {HARMONIC, SUPRAHARMONIC}` ma albo solver z `VALIDATED`, albo
odmowę; żaden nie jest `reportable` przed AB-2H.
(e) `ui2/wyniki/**` (harmoniczne dziś w „akademickich”) — stan „solver w przygotowaniu” jest zakazany (ZASADA NR 1),
więc UI musi pokazać nazwaną odmowę z powodem, nie kafelek.

### §6.11 Explainable Verdict Contract (`WynikInzynierski`) + guard
(a) Poprawne co do celu; szczegóły niżej (3.2, 3.3).

### 3.1 Kamienie AB-1a / AB-1b / AB-1d_min / AB-1c

| Kamień | Ocena | Korekty |
|---|---|---|
| AB-1a | Zakres poprawny. Kryterium wyjścia „`ResultSetDynamicV1` niesie `physics_domain=RMS_DYNAMICS` bez zmiany odcisków” — **lepiej wyprowadzać** domenę z `analysis_type` przez jeden rejestr (`solver_capability_registry.py` ma już `analysis_type` per zdolność), zamiast dodawać pole do kontraktu wyniku (`resultset_dynamic_v1.py:141-165`); pole addytywne w kopercie API (`exclude_none`) jest dopuszczalne, pole w kontrakcie — zbędne | dodać: poprawka rejestru dowodowego (T10 tautologia, T20 fałszywy opis), reinterpretacja „zgodny” dla pustego zbioru testów |
| AB-1b | Zakres poprawny; **zależność na OD-21 i OD-38 jest twarda** — bez dokumentów resolver może dostarczyć wyłącznie strukturę + `UNVERIFIED_SOURCE`. Dołożyć: jedna prawda operatora (profil na generatorze vs parametr trasy), naprawa `classify_module` (fallback D, < 0,8 kW), progi PL z jednego źródła, BESS poza zakresem RfG, 27/59 w ENM | nie wolno „uzupełnić” liczb YAML z pamięci modelu językowego ani z niemieckich kodeksów |
| AB-1d_min | Poprawne co do kolejności; musi objąć przeklasyfikowanie `POWER_QUALITY_HARMONICS` (6.10) i jedną listę typów biegów | `SupraharmonicBand` bez wartości domyślnych — zgodne z W-70 |
| AB-1c | Poprawne; kryterium „T-test z RMS i z harmonicznych przechodzi tym samym łańcuchem” wymaga, żeby T20 przestał być oceną limitem 8 % (to nie jest wymaganie RfG — do czasu OD-38 T20 = `REQUIREMENT_UNVERIFIED`) | bezpiecznik A-6 zachowany |

### 3.2 `WynikInzynierski` (16 pól) wobec istniejących kształtów

Porównanie z `ui2/wyniki/ocena/api.ts` (`OcenaElementu` 35-60, `PozycjaOceny` 64-102; producent
`application/analyses/werdykt_projektowy.py`), `ResultSetDynamicV1` i `api/canonical_run_views.py`:

| Pole W-71 | Istniejące pole | Stan |
|---|---|---|
| `subject` | `OcenaElementu.element_id/element_nazwa/element_rodzaj`; `KanalDynamicznyV1.element_ref`; `NcRfgPtpireeModuleResult.der_ref` | ISTNIEJE |
| `physics_domain` | brak; najbliżej `PozycjaOceny.zrodlo: 'PF'\|'short_circuit_sn'\|'model'` (to źródło biegu, nie domena) i `analysis_type` biegu | NOWE (wyprowadzane z `analysis_type`) |
| `criterion` | `PozycjaOceny.kryterium_id, nazwa_pl, warunek, warunek_pl, warunek_latex, symbol` | ISTNIEJE |
| `measured` | `OcenaElementu.wartosc + jednostka`; `MetrykaDynamicznaV1.wartosc/jednostka`; `NcRfgPtpireeTestResult.metrics` (słownik bez schematu) | ISTNIEJE (NC RfG: częściowo) |
| `required` | `odniesienie, odniesienie_dolne, odniesienie_ostrzegawcze` | ISTNIEJE (NC RfG: brak — wartość w `trace.data`) |
| `margin` | `margines, margines_jednostka, margines_wzor_latex` | ISTNIEJE (NC RfG: T14/T15/T20 w `metrics`, reszta brak) |
| `critical_point` | `PozycjaOceny.wiodacy_element_id/wiodacy_opis_pl` (element); w czasie: T14 `critical_time_s` | CZĘŚCIOWE — brak współrzędnej czasu/częstotliwości jako pola ogólnego |
| `cause` | `OcenaElementu.uzasadnienie_pl` (tekst) | CZĘŚCIOWE — brak struktury (element/regulator/ogranicznik) |
| `explanation` | `wniosek_pl`, `uwaga_pl`; NC RfG `summary_pl` | ISTNIEJE (tekst) |
| `basis` | `PozycjaOceny.norma_pl` (tekst, bez wydania/klauzuli); NC RfG `procedure_basis_pl` | CZĘŚCIOWE — NOWE: `{dokument, wersja, klauzula, zrodlo_status}` |
| `evidence` | `OcenaElementu.dowod {run_id, element_id}`; `StopienDowodowyV1`; `evidence_by_test` | ISTNIEJE (dwa kształty — ujednolicić) |
| `model_status` | brak | NOWE (§6.8) |
| `input_status` | `FieldQuality`/`SourceKind` w `provenance.py` — nie trafia do wyników oceny | CZĘŚCIOWE (jest w proweniencji, nie w wyniku) |
| `uncertainty` | brak | NOWE |
| `domain_of_validity` | rdzeń dynamiki egzekwuje zakres (`dynamika/waznosc.py`), ale go nie raportuje w wyniku | NOWE (w wyniku) |
| `trace` | `run_id` + `white_box_trace` (`canonical_run_views.py:53-58`), `margines_wzor_latex`, NC RfG `trace_refs` | ISTNIEJE |

Wniosek: `OcenaElementu`+`PozycjaOceny` pokrywają 8 z 16 pól w pełni i 4 częściowo — `WynikInzynierski` należy
zbudować jako **rozszerzenie** tego kształtu (łańcuch ekranu „podstawa → wynik → odniesienie → ocena → wniosek →
dowód” już istnieje), a nie jako trzeci kontrakt. `SPELNIA/NIE_SPELNIA/BRAK_PODSTAW` pozostaje dozwolonym polem
**wewnątrz** obiektu z pełnymi towarzyszami. Wyniki FROZEN (NC RfG, v126) dostają adapter do tego kształtu w
warstwie aplikacji/API.

### 3.3 Guard werdyktu — reguła dokładna (wykonalna)

Zakaz literałów w ogóle jest niewykonalny i błędny (słowniki `pass/fail/no_data/not_required`,
`zgodny/niezgodny/brak_danych`, `SPELNIA/NIE_SPELNIA/BRAK_PODSTAW`, `SPELNIONE/NARUSZONE/NIESPRAWDZONE`,
`OK/INFO/WARN/ERROR` w LoM, `compatibility_status` w v126 są legalnymi członkami typów). Reguła musi dotyczyć
**obiektu wyniku**, nie literału.

**`scripts/explainable_verdict_guard.py` — Python (AST), zakres `backend/src/{api,application,analysis,solver_input}/**`:**
1. `TOKENY_WERDYKTU` = {`pass`, `fail`, `PASS`, `FAIL`, `SPELNIA`, `NIE_SPELNIA`, `SPEŁNIA`, `NIE SPEŁNIA`,
   `zgodny`, `niezgodny`, `SPELNIONE`, `NARUSZONE`} (dokładne dopasowanie wielkości liter).
2. **Nośnik werdyktu** = (a) klasa `BaseModel`/`@dataclass`/`TypedDict` z polem, którego adnotacja zawiera
   `Literal[...]` z ≥ 1 tokenem albo alias takiego `Literal`; (b) literał słownika w `return`/argumencie konstruktora
   z kluczem ∈ {`verdict`, `werdykt`, `wynik`, `status`, `overall_status`, `compatibility_status`} i wartością
   będącą stałą z `TOKENY_WERDYKTU`.
3. **Grupy towarzyszy** (każda grupa: dowolna z nazw), wyszukiwane w nośniku **albo w klasie nadrzędnej, która go
   zawiera jako pole** (zagnieżdżenie jak `PozycjaOceny → OcenaElementu`):
   `wartość` {measured, wartosc, value, wartosc_pomiar}; `wymaganie` {required, odniesienie, limit, tolerancja_pct};
   `margines` {margin, margines, odchylka_pct}; `podstawa` {basis, podstawa, norma_pl, clause_ref, zrodlo_tolerancji};
   `dowód` {evidence, dowod, trace, trace_refs, slad_pl, run_id}.
4. **Guard ZGŁASZA** nośnik, któremu brakuje ≥ 1 grupy, chyba że jest to `WynikInzynierski` lub pole w nim.
5. **Guard NIE ZGŁASZA:** samej definicji typu (`X = Literal[...]`, `class X(StrEnum)`), map etykiet (`dict`
   o kluczach będących członkami typu werdyktu), porównań (`== "pass"`), plików `tests/**`, `docs/**`.
6. **Lista wyjątków** `scripts/explainable_verdict_allowlist.txt`, zamknięta: `NcRfgPtpireeTestResult`,
   `NcRfgPtpireeModuleResult` (FROZEN), wynik `v126_academic` szyn (FROZEN) — każda pozycja z nazwą adaptera, który
   ją opakowuje w `WynikInzynierski`; test przypina, że adapter istnieje i jest używany przez trasę API.
   `ochrona_lom.Verdict(status, message)` **nie** jest FROZEN → nie trafia na listę, musi zostać przebudowany.
7. **Frontend:** analogiczna reguła na interfejsach w `frontend/src/ui2/**/api.ts` (propercja o typie unii
   literałów z tokenami bez grup towarzyszy) + reguła renderu: etykieta werdyktu z `strings.ts` wolno użyć
   wyłącznie w jednym komponencie prezentacji wyniku wyjaśnionego (import-graph guard).
8. **Testy guardu (mutacje):** klasa z samym `verdict: Literal["pass","fail"]` → zgłoszenie; ta sama z pięcioma
   grupami → brak; alias `Literal` → brak; mapa etykiet → brak; `return {"status": "zgodny"}` → zgłoszenie;
   zagnieżdżenie `PozycjaOceny/OcenaElementu` → brak; usunięcie adaptera z listy wyjątków → zgłoszenie.

Pomiar wstępny (co guard zgłosi na HEAD): `ochrona_lom.Verdict`, `v126_academic` `bus_results` (FROZEN → lista),
`NcRfgPtpireeTestResult`/`ModuleResult` (FROZEN → lista). `OcenaElementu` i `WierszZgodnosci` (odbiór) —
przechodzą (towarzysze obecni, podstawa w rodzicu).

---

## ZADANIE 4 — LUKI REGULACYJNE JAKOŚCI ENERGII (materiał do OD-38)

Zasada: każda wiersz mówi, **co** dokument definiuje. Liczby podaję wyłącznie tam, gdzie jestem pewien, i
wyłącznie jako charakterystykę dokumentu — do kodu trafiają dopiero po OD-38.

| Dokument | Status pewności | Co definiuje (klasa) | Przedmiot | Napięcie | Miejsce oceny | Agregacja / okno | Pasmo | Czego NIE wolno przenosić |
|---|---|---|---|---|---|---|---|---|
| Rozporządzenie 2016/631 (NC RfG) | [PEWNE] | wymagania przyłączeniowe modułów; **brak limitów harmonicznych** (jakość energii odsyła do OS/krajowo) | moduł wytwórczy | wszystkie | miejsce przyłączenia | — | — | nie wolno twierdzić, że limit THD jest „wymaganiem NC RfG” (dziś T20) |
| PN-EN 50160 | [PEWNE co do zakresu]; wydanie i zmiany — OD | **charakterystyki napięcia zasilającego** w sieciach publicznych (poziomy, których OSD dotrzymuje w typowych warunkach); THD_U ≤ 8 % w nN i SN [PEWNE] | napięcie sieci, nie urządzenie, nie instalacja | nN, SN (wydanie z 2010 dodało WN) | zaciski zasilania odbiorcy | wartości 10-min, 95 % tygodnia | harmoniczne do rzędu 40 | nie jest limitem emisji; nie wolno porównywać z nim wartości deterministycznej z symulacji jednego punktu pracy jako „spełnia/nie spełnia” (dziś `engine.py:860`, `v126_academic.py:455`) |
| Rozporządzenie systemowe (w sprawie szczegółowych warunków funkcjonowania systemu elektroenergetycznego, MG 2007) | istnienie i zakres — [PEWNE]; aktualność brzmienia i ewentualny następca — OD | parametry jakościowe energii per grupa przyłączeniowa (THD, harmoniczne, wahania, asymetria) — prawo krajowe wiążące OSD | napięcie w miejscu dostarczania | grupy przyłączeniowe (nN/SN/WN) | miejsce dostarczania | 10-min, 95 % tygodnia (do potwierdzenia) | do rzędu 40 (do potwierdzenia) | nie przenosić progów między grupami przyłączeniowymi |
| IRiESD: Energa Operator, Enea Operator, PGE Dystrybucja, Tauron Dystrybucja, **Stoen Operator** | istnienie — [PEWNE]; wydania 2025 i treść — OD (OD-21) | warunki przyłączenia i eksploatacji; parametry jakości i sposób przydziału emisji dla przyłączanych instalacji (per OSD) | instalacja przyłączana / sieć OSD | nN, SN (i 110 kV) | miejsce przyłączenia | wg IRiESD | wg IRiESD | nie przenosić wartości między OSD; repo nie ma profilu Stoen |
| IEC 61000-2-2 | [PEWNE co do zakresu]; numer zmiany dodającej 2–150 kHz — OD | **poziomy kompatybilności** (odniesienie koordynacji EMC; nie limit emisji ani odporności) | środowisko sieci | nN publiczne | — (poziom sieci) | wg IEC 61000-4-7/-4-30 | harmoniczne, interharmoniczne; zmiana dodała 2–150 kHz | kompatybilność ≠ emisja; nN ≠ SN |
| IEC 61000-2-12 | [PEWNE co do zakresu] | poziomy kompatybilności | środowisko sieci | SN publiczne | — | jw. | zaburzenia przewodzone niskiej częstotliwości | nie stosować do nN; nie jako limit emisji |
| IEC 61000-2-4 | [PEWNE co do zakresu] | poziomy kompatybilności w sieciach przemysłowych (klasy 1, 2, 3) | sieć wewnętrzna zakładu | nN, SN przemysłowe | punkt w sieci zakładu | jw. | jw. | nie stosować do sieci publicznej OSD (dziś `HelpPanel.tsx:48`) |
| IEC TR 61000-3-6 (wyd. 2008) | [PEWNE co do zakresu i koncepcji] | **poziomy planowania** i metoda **przydziału limitów emisji** instalacjom (etapy 1/2/3, współczynniki sumowania) | instalacja zaburzająca | SN, WN, NN | miejsce przyłączenia | 10-min / krótkie, percentyle wg raportu | harmoniczne (do 50) | poziom planowania ≠ kompatybilność ≠ limit emisji; przydział wymaga danych OSD (moc zwarciowa, pojemność sieci) |
| IEC TR 61000-3-14 | istnienie — wysoka pewność; wydanie — OD | przydział emisji instalacjom w nN | instalacja zaburzająca | nN | miejsce przyłączenia | jw. | harmoniczne, interharmoniczne, wahania, asymetria | nie stosować 61000-3-6 do nN |
| IEC TR 61000-3-15 | istnienie — średnia pewność — OD | ocena EMC niskiej częstotliwości dla generacji rozproszonej w nN | generacja rozproszona | nN | — | — | — | do potwierdzenia przed użyciem |
| IEC 61000-3-2 | [PEWNE co do zakresu] | **limity emisji urządzeń** (prąd fazy ≤ 16 A) | urządzenie | nN publiczne | zaciski urządzenia (badanie typu) | wg IEC 61000-4-7 | do rzędu 40 | nie stosować do instalacji ani do SN |
| IEC 61000-3-12 | [PEWNE co do zakresu] | limity emisji urządzeń 16 A < I ≤ 75 A, zależne od stosunku mocy zwarciowej (Rsce) | urządzenie | nN publiczne | zaciski urządzenia | wg IEC 61000-4-7 | do rzędu 40 | widmo z deklaracji wg 61000-3-12 (`types.py:1397`) jest widmem **badania typu** przy określonym Rsce, nie modelem źródła w sieci SN |
| IEC 61000-4-7 | [PEWNE co do zakresu] | **metoda pomiaru** harmonicznych i interharmonicznych (okno ~200 ms, grupowanie, podgrupy); załącznik informacyjny 2–9 kHz | przyrząd | wszystkie | — | 10/12 okresów, grupowanie | do rzędu 50; 2–9 kHz informacyjnie | definicja pasma/grupowania decyduje o wartości — wynik symulacji bez tej definicji nie jest porównywalny z limitem mierzonym |
| IEC 61000-4-30 | [PEWNE co do zakresu]; wydanie i status pasma 2–150 kHz — OD | metody pomiaru parametrów jakości (klasa A/S), agregacja 150/180 okresów, 10 min, 2 h | przyrząd | wszystkie | punkt pomiaru | 10 min itd. | harmoniczne przez 61000-4-7 | nie jest limitem |
| CISPR 16-1-1 | [PEWNE co do pasma A 9–150 kHz, RBW 200 Hz] | metoda pomiaru zaburzeń radioelektrycznych | przyrząd | — | — | detektory QP/AV/PK | 9–150 kHz (pasmo A) | inna metoda niż 61000-4-7 zał. B — wartości z obu metod nieporównywalne |
| EN 50065-1 | [PEWNE co do istnienia i pasma 3–148,5 kHz] | sygnalizacja w sieciach nN (PLC), pasma CENELEC | nadajniki PLC | nN | — | — | 3–148,5 kHz | nie jest limitem emisji falowników |
| PN-EN 50549-1 / -2 | [PEWNE co do zakresu]; wydanie 2019 — wysoka pewność | wymagania przyłączeniowe generacji do sieci dystrybucyjnych (nN / SN), w tym zabezpieczenie interfejsowe; jakość energii odsyła do dokumentów EMC | moduł wytwórczy | nN (-1), SN (-2) | miejsce przyłączenia | — | — | nie traktować jako źródła limitów harmonicznych |
| IEEE 519 (2014; rewizja 2022 — wysoka pewność) | [PEWNE co do struktury] | granice napięcia w miejscu przyłączenia per klasa napięcia; granice prądu (TDD) zależne od stosunku Isc/IL | instalacja odbiorcy / zasilanie | per klasa (≤ 1 kV; 1–69 kV; wyżej) | miejsce przyłączenia | percentyle tygodniowe | do rzędu 50 | **norma USA, niewiążąca w PL**; nie stosować jednego progu 5 % do wszystkich szyn (dziś `v126_academic.py:457-460`) |
| Wymagania supraharmoniczne dla falowników przyłączanych do sieci OSD w PL (2–150 kHz) | **nie znam dokumentu wiążącego** — OD | — | — | — | — | — | 2–150 kHz | do czasu OD: `SupraharmonicBand` bez limitu, wynik = `REQUIREMENT_UNVERIFIED` |
| Wymagania PTPiREE/WOS dotyczące jakości energii modułów (np. T20) | **nie znam** źródła limitu THD dla modułu w Procedurze wer. 3.0 — OD | — | — | — | — | — | — | T20 nie może oceniać limitem 8 % do czasu OD-38 |

**Pytania do właściciela (OD-38 „dokumenty źródłowe jakości energii”):**
1. Które dokumenty są wiążące dla oceny emisji harmonicznych przyłączanego PPM w nN i w SN: IRiESD danego OSD
   (wydanie), rozporządzenie systemowe (brzmienie aktualne), IEC TR 61000-3-6/-3-14 jako metoda przydziału?
2. Czy OSD udostępniają poziomy planowania i dane do przydziału (moc zwarciowa, tło harmoniczne) — bez nich
   ocena emisji w miejscu przyłączenia ma wynik `UNVALIDATED_INPUT`, nie liczbę.
3. Jakie wydanie PN-EN 50160 i PN-EN 50549-1/-2 obowiązuje w projekcie?
4. Czy istnieje wiążący dokument dla 2–150 kHz dla falowników w PL; jeśli nie — produkt pokazuje wyłącznie
   metryki fizyczne pasma bez werdyktu.
5. Metoda pomiarowa referencyjna dla walidacji (AB-7): IEC 61000-4-7 zał. B, IEC 61000-4-30 czy CISPR 16 — jedna na
   pasmo, zapisana w `SupraharmonicBand.measurement_method`.

---

## PODSUMOWANIE KRYTYCZNYCH ZNALEZISK (dla orkiestratora)

1. **Plan §0.2 zbadał 3 z 419 gałęzi zdalnych i klon płytki.** Pełne sprawdzenie (419 gałęzi + 475 głów PR, 4779
   commitów) potwierdza wniosek: identyfikatory §95 poza WiPWC i SyPGM nie istniały przed `637a322f`.
2. **WiPWC i SyPGM istnieją w kodzie** — §6.3 i §6.5 mają rozszerzać, nie tworzyć.
3. **Kolizja akronimu WOS** (właściwy operator systemu w OD-21 vs wymogi ogólnego stosowania w planie i rejestrze).
4. **Tautologie solvera FROZEN:** T14, T15 (znane) i **T10 (nowe)**; T10 jest dziś raportowalny.
5. **`provenance.py:318-326` fałszywie twierdzi**, że T20 porównuje z limitem profilu; limit 8 % jest stałą solvera i
   przenosi charakterystykę napięcia zasilającego na emisję urządzenia.
6. **Most modelu:** SyPGM wykluczony, `module_family="PPM"` na sztywno, klasyfikacja z punktu pracy `p_mw` zamiast
   `p_max_mw`, napięcie szyny generatora zamiast miejsca przyłączenia, dwie prawdy wyboru operatora.
7. **A-15 częściowo błędne:** PSE różni się od OSD punktem HVRT; progi klas nie są cechą PSE.
8. **Progi klas modułów w YAML (1 MW / 50 MW) sprzeczne z progami PL (200 kW / 10 MW)** — zapisane w repo od karty
   FAB-J jako pytanie do właściciela, nierozstrzygnięte; `classify_module` zwraca D dla < 0,8 kW.
9. **„Moduł zgodny” przy zerze wymaganych testów** (pusta koniunkcja) i `reportable/complete`.
10. **Rejestr PTPiREE:** `acceptance_date` to w 97 % data przyszła (najpewniej data ważności) — dokumenty formalne
    niosą mylną etykietę; 632 rekordy z uszkodzonym `firmware`; brak profilu Stoen Operator.
11. **Fikcyjna proweniencja „PTPiREE WiPWC”** w katalogach rozdzielnic, kabli i transformatora.
12. **LoM:** progi zaszyte, 27/59 nieobecne w `ProtectionSetting`, podstawa „IEEE 1547 / NC RfG Art. 14” błędna,
    BESS wyłączony z wymogu; ROCOF 2 Hz/s bez dokumentu i okna.
13. **AB-1d_min vs istniejący `POWER_QUALITY_HARMONICS` (`reportable=True`)** — bez przeklasyfikowania powstaną dwie
    prawdy o harmonicznych; plan §2 błędnie opisuje v126 jako „bez modelu sieci” (buduje Y(h), ale `R=const, X·h`
    i fazy 0).
14. **R2 i R3 obwiedni FRT nadal w repo**; R2 cytuje nieistniejący „Annex II”.
15. **„Bank Nastaw”** — nie znam takiego dokumentu; do OD.
