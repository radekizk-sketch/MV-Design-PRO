# Karta wykonawcza AB-1a — uczciwość natychmiastowa + profil regulacyjny v1 + kontrakt werdyktu wyjaśnialnego + uczciwa zgodność NC RfG

**Program:** `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` (§5 AB-1a, §6, §12). **Kontrakt:**
`docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`. **Data karty:** 2026-09-23 (korekta po przeglądzie
adwersarzowym Opus 5.5, ETAP 7 — decyzje O-26…O-44 planu). **Wykonawca:** Claude Opus 5.5 (subagent;
pakiety 0, A–E z własnymi bramkami, worktree `r10`, bez `git commit`/`push` — zmiany odbiera i commituje
Fable po własnej weryfikacji). **Rdzeń B-01:** `network_model/solvers/ncrfg_ptpiree/**` edytowany z
delegacji O-5 (parytet w testach klasy).

## §0 Rozstrzygnięcia (nienegocjowalne w tej karcie)

0. **Pakiet 0 — uczciwość natychmiastowa PRZED pakietem A (O-21, O-25; przegląd #1, #9, #17).**
   Każda pozycja ma test padający na STARYM zachowaniu (test pisany pierwszy):
   - `application/analyses/frt_trajektorie.py:70-94, :261-282` i `frt_sekwencja.py:55-81, :171-189,
     :228` — werdykty „w obwiedni / poza obwiednią / moduł wypadł" → `NIE_OCENIONO` z powodem
     „trajektoria nie jest rozwiązaniem sieci; kryterium v > 0,05 wobec profilu wejściowego jest
     tautologią (sonda P3: 0,06 pu przez 3 s → „w obwiedni")"; NIE „obwiednia z profilu";
   - tor T1: `enm/canonical_analysis.py:1612` (`_execute_dynamic_stability` z kątów użytkownika),
     `application/automation/trace.py` (narracja „wyłączone przez zabezpieczenia" z czasu wpisanego
     przez użytkownika), `application/stability/*`, `ui2/wyniki/stabilnosc/model.ts:363-367`,
     `EkranStabilnosci.tsx:170-209, :236-265` → `NIE_OCENIONO` z powodem (kasacja toru w AB-1c);
   - E-40: `network_model/solvers/v126_academic.py:413, :466` (`compatibility_status` „zgodny" —
     także dla szyny bez danych harmonicznych) → `NIE_OCENIONO`; WSZYSTKIE liczby E-40 (THD, TDD,
     K-factor, U_h, „rezonanse") znikają z ekranu użytkownika (`ui2/wyniki/akademickie/prezentacja.ts:
     196-216, :238-270`, `EkranAnalizAkademickich.tsx:906-921, :1088-1100, :1145-1176, :510-545`) —
     widoczne wyłącznie w widoku audytowym z etykietą „solver niezwalidowany (P1–P14)"; etykieta
     sanity „zweryfikowany" → „w paśmie wiarygodności" (`analysis/sanity_bounds/*`, FE `:211`);
     złota fikstura THD_U 3049 % (`frontend/src/harness-fixtures/generated/akademickie_scena_biegi.json`,
     `backend/tests/golden/parytet_p11/zlote_hashe.json`) KASOWANA wraz z testem, który ją pinuje
     (nie osłabiana do „THD < 100 %"); wpis rejestru zdolności
     (`application/solvers/solver_capability_registry.py:219-231`) → status `UNVALIDATED`, wersja i
     test odniesienia zgodne ze stanem; kasacja nadpisania `parameters.harmonic_sources`
     (`api/v126_academic.py:179-184`), zakładek `widmo`/`z-f`/`flicker` (`ui/workspace/types.ts:801`),
     osi DER „THDi/THDu" i `PowerQualityMeter`; fałszywe twierdzenia karty
     (`v126_katalog.py:346-349, :393`, `MAPA_DOMKNIECIA:239`) przepisane; surowa re-ekspozycja
     statusów V12.6 (`api/v126_academic.py:289, :400`, `application/v126_artifacts.py:36-59`) →
     rekordy kontraktu albo `NIE_OCENIONO`;
   - SSCI: `analysis/ssci_stability/models.py:63-66, :158-178`, `builder.py:169-207`,
     `service.py:84-113`, `ui2/wyniki/ssci/model.ts:21-47`, `EkranSsci.tsx:80-100` — werdykt
     „stabilny / niestabilny" → `NIE_OCENIONO` z powodem „Z_grid liczone bez przekładni (×1400 dla
     0,4 kV — sonda P13)"; wskaźnik `z_conv_negative_resistance.present` zostaje (wartość fizyczna);
   - `application/analyses/werdykt_projektowy.py:855-858` (`_WYNIK_Z_STATUSU`: WARN/WARNING →
     SPEŁNIA) i `:1224` (`.get(status, WYNIK_SPELNIA)`) → nieznany status i ostrzeżenie „brak
     danych" = `BRAK_PODSTAW` (nigdy SPEŁNIA); test: status `kaskada_prad_pole_brak` → nie SPEŁNIA;
   - `application/analyses/ochrona_lom.py:626-629` — `status = "OK"` przy zerze sprawdzeń →
     `NIE_OCENIONO` z „czego brakuje"; `ui2/oze/lom/strings.ts:86-96`, `EkranLom.tsx` — etykieta z
     rekordu;
   - solver PTPiREE `engine.py:296-312` — kasacja `overall_status`, `pass_count`, `fail_count`
     (O-13) i konsumentów: `certyfikat_zgodnosci.py:232, :260-265`, `wniosek_osd.py:222-224`,
     `ui2/oze/macierz/SekcjaZgodnosciPrzekrojowej.tsx:212-215`, `macierzModel.ts:488`,
     `ui/workspace/surfaces/NcRfgTestsTab.tsx:636-651` (licznik PASS/FAIL) — w Pakiecie 0 zastąpione
     `NIE_OCENIONO` per moduł z powodem „ocena per wymaganie od Pakietu C", w Pakiecie C rekordami.
   Bramka Pakietu 0: testy nowe zielone, pełna regresja backend + frontend zielona, zrzuty ekranów
   E-40/FRT/T1/SSCI z etykietą „Ocena niewykonana" (B-02).
1. **Jeden typ podstawy** `PodstawaWymagania` (leaf `backend/src/werdykt/kontrakt.py`) zastępuje
   `catalog.profiles.nc_rfg.ZrodloWartosci` (alias skasowany): pola `rodzaj`
   (`ROZPORZADZENIE_UE` / `NORMA` / `WOS` / `PROCEDURA_PTPIREE` / `WIPWC` / `OSD` /
   `KATALOG_PRODUCENTA` / `ZALOZENIE_PROJEKTOWE` / `NIEUSTALONA`), `dokument`, `wydanie`,
   `jednostka_redakcyjna`, `status` (`ZWERYFIKOWANE` / `WSKAZANE` / `NIEUSTALONE`), `uwagi_pl`.
   **Walidator:** `WSKAZANE`/`ZWERYFIKOWANE` ⇒ `dokument`, `wydanie` i `jednostka_redakcyjna`
   niepuste (artykuł/ustęp/punkt — nie opis parametru); inaczej `NIEUSTALONE` (przegląd #3).
   Skutek dla warstw: `wos.yaml::progi_klas.jednostka` jest dziś opisem → stan `NIEUSTALONE` z
   uwagą „wartości wg decyzji właściciela O-1; jednostka redakcyjna WOS do wskazania (§12 planu)";
   klasyfikacja pozostaje ważna (stosowalność), a rekord niesie zastrzeżenie. Warstwa profilu
   `NC_RFG` → `ROZPORZADZENIE_UE`, `NIEUSTALONA` → `NIEUSTALONA`, pozostałe 1:1.
2. **Pakiet `werdykt/`** (leaf: pydantic + stdlib + `solver_input.provenance`, zero importów z
   `analysis`/`application`/`network_model`/`api`/`catalog`/`enm`): `kontrakt.py` (typy §1 i §4
   kontraktu), `decyzja.py` (reguła K §2.2, agregacja W §2.3, kompletność §3, skala marginesu §2.4
   — czyste funkcje, JEDYNE miejsce tych reguł; walidatory rekordów wołają to samo ciało),
   `wyjasnienie.py` (JEDYNY generator `zdanie_pl` / `przyczyna_pl` / `czego_brakuje` /
   `zastrzezenia` z pól rekordu), `dokument.py` (serializer rekordu do bloku dokumentu formalnego
   §10), `etykiety.py` (słownik etykiet §9 — backend jest właścicielem etykiet; rekord niesie
   `etykieta`; UI mapuje wyłącznie `semantyka` → kolor). Szczegóły: karta pakietu A (scratchpad
   wykonawcy) + komunikat korekty z 2026-09-23 (reguły K/W po przeglądzie).
3. **Walidacja przy konstrukcji** (pydantic `model_validator`): T1–T5, T10, T11, T14–T16, T20
   kontraktu są błędami walidacji typu. Liczba bez jednostki = `ValidationError`; bezwymiarowe
   jawnie `"1"`, `"%"` albo `"p.u. (<baza>)"` — gołe `"p.u."` odrzucane (przegląd #33).
4. **Niepewność** w AB-1a: dla porównań deklaracji `Niepewnosc(nie_dotyczy=True,
   powod_pl="porównanie wartości zadeklarowanych — niepewność numeryczna nie dotyczy")`; metoda
   `SYMULACJA` bez wartości niepewności = `ValidationError` (walidator gotowy na AB-1b/AB-1c).
5. **Solver PTPiREE emituje `OcenaKryterium` per test** (pole `ocena` w `NcRfgPtpireeTestResult`);
   `verdict` (`pass`/`fail`/`no_data`/`not_required`) jest ENUMEM WEWNĘTRZNYM wyprowadzanym JEDNĄ
   funkcją całkowitą `werdykt_maszynowy(ocena) -> PtpireeVerdict` (przypiętą testem; `SPELNIA` →
   `pass`, `NIE_SPELNIA` → `fail`, `NIE_DOTYCZY` → `not_required`, reszta → `no_data`);
   `summary_pl = ocena.wyjasnienie.zdanie_pl`; `overall_status`, `pass_count`, `fail_count` ZNIKAJĄ
   z kontraktu modułu (O-13). Kryterium każdego testu ma `warunek_latex`; wynik i limit mają
   jednostki; limit ma `podstawa` z profilu; margines i skala liczone w `werdykt/decyzja.py` (nie w
   solverze). Metody: T01/T05/T09/T12/T13 (konfiguracja zadeklarowana) — `DEKLARACJA`;
   T14/T15/T16/T17 (zachowanie dynamiczne) — bez biegu dynamiki `NIE_OCENIONO` (O-34; porównanie
   deklaracji nie wykazuje zachowania dynamicznego). Wejścia `der_kind`, `module_family`,
   `operator_id` WYMAGANE (bez wartości domyślnych); `procedure_version` usunięte z żądania
   (z profilu); `certificate_status` NIE jest polem żądania — solver dostaje `DowodCertyfikatu`
   (rekord wykazu: zakres typów, warunek, data akceptacji, wersja WiPWC) wyprowadzony przez
   `model_bridge` z tabliczki × rejestr (O-27). Jedna funkcja `stosowalnosc_testu(test, wymagania,
   modul, certyfikat) -> (wymagany, powod_pl)` zastępuje trzy bramki z `engine.py:411-433`;
   stosowalność nigdy nie zależy od obecności danych (T20 „gdy podano THD" znika).
6. **Wynik zgodności per wymaganie** w `application/ncrfg_compliance/ocena_wymagan.py` na typach
   `werdykt/` (reguły W kontraktu §2.3 po korekcie: `BRAK_METODY` → `BRAK_DOWODU` z pustymi
   składowymi; stosowalne wymaganie o samych `NIE_DOTYCZY` → `NIE_OCENIONO`; `pokrycie_programu`;
   `kompletnosc_dowodu` z §3 i §3a); `NcRfgPtpireeRunResponse.ocena_wymagan:
   list[OcenaWymaganModulu]` (wymagane); certyfikat i wniosek do OSD czytają WYŁĄCZNIE ten wynik
   (lista braków = rekordy `WynikWymagania`, serializowane `werdykt/dokument.py`) i powstają
   WYŁĄCZNIE z zatwierdzonego modelu: końcówki `/certyfikat*` i `/wniosek*` wymagają `case_id` +
   `klucz_twin`, wejście solvera z `model_bridge`; bieg „co-jeśli" `POST /api/ncrfg-tests/run`
   znakuje każdą wartość z żądania jako `UNVALIDATED_INPUT` (`dane_przyjete` z wartością i powodem)
   → `NIEPELNY`, `sposob_wykazania ≠ CERTYFIKAT` (O-27; test T17). Nowe kryteria koordynacji
   statycznej (O-32): `frt.koordynacja_nastaw_u_min`, `rocof.koordynacja_nastaw_lom` — nastawy z
   `nastawy_zabezpieczen_modulu` wejścia (opcjonalne → `NIE_OCENIONO`), limity z profilu (dziś
   `NIEUSTALONE` → `BRAK_PODSTAWY`). Stosowalność = typ × technologia × `modul_istniejacy` (art. 4)
   × `data_umowy_przylaczeniowej` (resolver wersji warstw; dziś jedna wersja) × flaga
   `operator_skorzystal_z_prawa` dla wymagań z prawem operatora (art. 20 ust. 2 lit. a–c, art. 17
   ust. 2 lit. a: `False` → `NIE_DOTYCZY`, `None` → `BRAK_PODSTAWY`) (O-31).
7. **Warstwa WiPWC** `catalog/profiles/nc_rfg/warstwy/wipwc.yaml`: `dokument` (tytuł, wydanie 1.3,
   status `WSKAZANE` — dokument i wydanie wskazane; treść nie w repo), `wersje` (1.2 / 1.3 z datami i
   oknami akceptacji DOKŁADNIE ze snapshotu), `rejestr` WSKAZUJE istniejący
   `network_model/catalog/ptpiree_wykaz_snapshot.json` (6887 rekordów, `mv_ptpiree_catalog.py`,
   `/api/catalog/ptpiree/manifest` i `/generator-certificates`) — ŻADNEJ trzeciej kopii rekordów
   (przegląd #16); `pokrycie_certyfikatem` per wymaganie przeniesione 1:1 z `certyfikat_pokrywa_typy`
   (które znika z `nc_rfg.yaml` i `zastane.yaml`) ze stanem `NIEUSTALONE` do czasu wskazania punktu
   WiPWC per wpis (przegląd #3) — sam certyfikat daje więc dziś `BRAK_DOWODU` z wyjaśnieniem, a
   `SPELNIA/CERTYFIKAT` staje się osiągalne z dokumentem, nie przez przeetykietowanie. Dowód
   certyfikatu per REKORD wykazu (zakres typów, warunek „tylko z modułem …", data akceptacji, wersja
   WiPWC/WOS); certyfikat jednostki (PGU) nie wykazuje wymagań poziomu modułu (PGM) typu B w punkcie
   przyłączenia. Kopia frontowa `ptpireeCertifiedInverters.generated.ts` (134 KB) i lista ręczna w
   `ptpireeCertifiedInverters.ts` KASOWANE; klient czyta rejestr z `/api/catalog/ptpiree/*`
   (Pakiet D).
8. **Bank Nastaw** w `operatorzy/<id>.yaml: bank_nastaw` (słownik zamknięty pozycji: `u_min_pu`,
   `u_min_czas_s`, `u_max_pu`, `u_max_czas_s`, `f_min_hz`, `f_min_czas_s`, `f_max_hz`,
   `f_max_czas_s`, `rocof_hz_s`, `rocof_czas_s`, `przesuniecie_fazy_deg`) — wartości TYLKO z
   proweniencją; dziś sekcje puste ze `status: NIEUSTALONE` we wszystkich pięciu plikach, nigdy
   wartości „typowe". Loader eksponuje `profile.bank_nastaw`. Konsumenci w AB-1a: API katalogu
   (widok) i kryteria koordynacji O-32 (limit FRT/RoCoF z profilu, nastawa z modułu); AB-5 czyta
   je jako nastawy zabezpieczeń.
9. **Warstwa magazynów** `warstwy/magazyny.yaml` (O-28): `dokument` (IRiESD / wymagania krajowe dla
   magazynów — `NIEUSTALONE`), `wymagania: []`; technologia `MAGAZYN` w `Technologia`; `der_kind ==
   "BESS"` bez części wytwórczej → NC RfG `NIE_DOTYCZY` z powodem „art. 3 ust. 2 lit. d"; instalacja
   hybrydowa PV+BESS = PPM o mocy części wytwórczej. `Morski_PPM` → `NIE_DOTYCZY` w narzędziu SN/nN
   (O-42), nie mapowanie na PPM.
10. **Klasa modułu wyłącznie z backendu**: kasacja `ui2/oze/ranking/rankingModel.ts::klasaNcRfg` i
    klasyfikacji w `studiumModel.ts`; `/modul` przyjmuje `p_max_kw` (kW — jedna jednostka na
    granicy, O-34) i zwraca `klasyfikacja_modulu` (`modul`, `prog_min_kw`, `progi_kw`,
    `napiecie_d_kv`, `podstawa`, `powod_pl`); `voltage_kv_max` w `KlasaModuluNcRfg` →
    `napiecie_ponizej_kv`. Wyrażenie „urządzenie nie jest modułem wytwarzania energii" → „moduł
    poniżej progu istotności art. 5 ust. 2 lit. a" (przegląd #36).
11. **Pole `compliance_tests`** (OD-26) skasowane z kontraktu katalogu, API i typów FE.
12. **Strażnik** `scripts/werdykt_wyjasnialny_guard.py` + `scripts/test_werdykt_wyjasnialny_guard.py`
    wg §12 kontraktu po korekcie: lista dozwolonych TOŻSAMOŚCI (`moduł:symbol`), nie licznik ani
    `plik:linia`; pola werdyktu `bool`/`str` po nazwie i typie; reguła AST dla porównań z progiem
    zasilających klasę etykiety w UI; zero map „status → etykieta" w UI (mapa „semantyka → kolor"
    tylko w karcie); wpięty do `.github/workflows/python-tests.yml` i `frontend-checks.yml`.
    Dodatkowo `scripts/plan_ab_zaleznosci_guard.py` (O-35; sekwencja §5 wobec §11 planu; self-test
    z cyklem) w `docs-guard.yml` oraz `scripts/bramka_danych_profilu.py` (O-43; generuje tabelę
    §12.1 planu z profilu; guard porównuje tabelę z pomiarem).
13. **Etykiety**: `werdykt/etykiety.py` jest jedynym słownikiem; rekord niesie `etykieta`
    (etykieta PL + semantyka); `KartaWerdyktu.tsx` mapuje `semantyka` → tokeny koloru i NIC więcej
    (przegląd #40).

## §1 Inwentarz klasy (miejsca dzielące mechanizm — komplet, nie przykład)

| Mechanizm | Miejsca |
|-----------|---------|
| progi klas / klasyfikacja | `catalog/profiles/nc_rfg/loader.py::klasyfikuj_modul` (jedyne), `compliance/nc_rfg_modul.py`, `api/ncrfg_ptpiree_tests.py::/modul`, `api/generators.py::_weryfikuj_modul_ncrfg`, `application/analyses/dokument_studium.py` (~224–234), `frontend ui2/oze/ranking/rankingModel.ts`, `ui2/oze/studium/studiumModel.ts`, fixtury ranking/studium, harness `harness-fixtures/generated/*`, e2e `kreator-oze-max.spec.ts` |
| kryteria testów PTPiREE | `network_model/solvers/ncrfg_ptpiree/engine.py` (T01–T20; trzy bramki stosowalności `:411-433`; agregat `:296-312`), `solver_input/dowod_ncrfg.py::TEST_ZDOLNOSC`, `solver_input/provenance.py` (uzasadnienia `ncrfg_ptpiree.*` — teksty o „zaszytej częstotliwości" do korekty), `docs/analysis/NC_RFG_PTPiREE_TESTY_KANON.md` |
| wejścia solvera z żądania (O-27) | `contracts.py:36-50` (`certificate_status`, wartości domyślne `der_kind`/`module_family`/`operator_id`, deklaracje `p_recovery_time_s`, `reactive_current_gain`, `harmonic_thdu_percent`, `droop_percent`), `NcRfgPtpireeRunRequest.procedure_version`, `api/oze_analysis_runs.py:405-415, :503-510` (certyfikat i wniosek z `request.run_request`), `api/ncrfg_ptpiree_tests.py::run_ncrfg_ptpiree_tests`, `ui/workspace/surfaces/NcRfgTestsTab.tsx:563` (lista rozwijana statusu certyfikatu), `application/ncrfg_compliance/model_bridge.py::certificate_status_z_tabliczki`, `station-der/certyfikatPtpiree.ts` (ten sam predykat po stronie FE — zostaje jako odczyt tabliczki, nie źródło dla solvera) |
| konsumenci wyniku biegu | `application/ncrfg_compliance/bieg.py`, `application/analyses/certyfikat_zgodnosci.py` (`zbierz_braki`, `build_certyfikat_view`, `:232`, `:260-265`, DOCX/PDF), `application/analyses/wniosek_osd.py:222-224`, `api/ncrfg_ptpiree_tests.py`, `api/oze_analysis_runs.py` (`_certyfikat_view`), FE `ui/ncrfg-tests/api.ts`, `ui2/oze/api.ts`, `ui2/oze/macierz/**` (`SekcjaZgodnosciPrzekrojowej.tsx:212-215`, `macierzModel.ts:488`), `ui2/oze/wniosek/**`, `ui2/oze/certyfikat/**` (jeśli istnieje), `NcRfgTestsTab.tsx:110-122, :239-245, :636-673`, harness `ncrfg_zgodnosc_przekrojowa_scena_macierz.json`, `openapi_snapshot.json` |
| rejestr certyfikatów (O-17) | `network_model/catalog/ptpiree_wykaz_snapshot.json` + `mv_ptpiree_catalog.py` (JEDNO źródło), `api/catalog.py:494-540` (`/ptpiree/manifest`, `/ptpiree/generator-certificates`), `scripts/generate_ptpiree_inverter_catalog.py` (dwie projekcje → od tej karty jedna: JSON), FE `ptpireeCertifiedInverters.ts` (lista ręczna + loader), `ptpireeCertifiedInverters.generated.ts` (kasacja), `AddDerWizard.tsx:686-724, :593`, `DerSurfaces.tsx:903-982`, `station-der/index.ts`, `__tests__/ptpireeCertifiedInverters.test.ts`, `canon-codenames-global.test.ts` |
| profil i jego katalog | `api/ncrfg_ptpiree_tests.py::/catalog`, `enm/validator.py:640-700` (tryby regulacji), `application/analyses/{frt_trajektorie,frt_sekwencja,pq_coverage}.py` (Pakiet 0 → `NIE_OCENIONO`; `pq_coverage` czyta zakres Q z profilu z podstawą), `application/ncrfg_compliance/model_bridge.py` (inwentarz pól wejścia — nowe pola `cease_generation_time_s`, `nastawy_zabezpieczen_modulu`, `modul_istniejacy`, `data_umowy_przylaczeniowej`, `DowodCertyfikatu`) |
| uczciwość natychmiastowa (Pakiet 0) | komplet `plik:linia` w §0 pkt 0 |
| testy do przepisania (intencja zachowana w komentarzu) | `tests/catalog/test_pr9_nc_rfg_profiles_and_turbines.py` (classify_module → klasyfikuj_modul), `tests/compliance/test_nc_rfg_modul.py` (parytet progów URE), `tests/test_ncrfg_ptpiree_solver.py` (moduł B kompletny ≠ zgodny), `tests/enm/test_ncrfg_model_bridge.py:379-380` (test maskujący → ścieżka realna), `tests/api/test_certyfikat_zgodnosci.py`, `test_wniosek_osd.py`, `test_ncrfg_ptpiree_api.py`, `test_dokument_studium.py`, `test_generators_api.py`, `tests/test_solver_input_dowod_ncrfg.py` (fixtury z `technologia`, `profile_version`, `profile_hash`), `tests/ci/test_fixtury_harnessu.py`, `tests/api/test_openapi_snapshot.py` (regeneracja `scripts/generuj_snapshot_openapi.py`), testy FRT/T1/E-40/SSCI/LoM/werdykt projektowy z Pakietu 0 |

Baza czerwona zmierzona 2026-09-23 na kodzie w toku (przed pakietami): 192 failed / 310 passed w
zestawie NC RfG (`scratchpad/baza_czerwona_ab1a.log`) — przyczyna: `classify_module`,
`compliance_tests`, `ZrodloWartosci`, snapshot OpenAPI.

## §2 Pakiety pracy (kolejność; każdy z własną bramką)

**Pakiet 0 — uczciwość natychmiastowa (przed A).** §0 pkt 0. Bramka: testy padające na starym
zachowaniu → zielone; pełna regresja backend (`-m "not pandapower and not andes"`) i frontend
(vitest pełny) zielona; `guardy_z_ci.py`; zrzuty ekranów (B-02).

**Pakiet A — `werdykt/` + testy T1–T20 (bez konsumentów).** Typy, decyzja, generator, dokument,
etykiety; testy iloczynu cech (status × kompletność × stan źródła × status modelu × status danych ×
metoda × relacja) parametryzacją pytest (`hypothesis` nie jest w zależnościach — nie dodawać).
Bramka: `pytest tests/werdykt -q`, mypy strict na pakiecie (0 błędów), ruff/black.

**Pakiet B — profil regulacyjny v1 (dokończenie).** `PodstawaWymagania` w loaderze z walidatorem
§0.1; `wipwc.yaml` (wskazanie snapshotu, pokrycie `NIEUSTALONE`), `magazyny.yaml`, `bank_nastaw`,
pola O-30 (zbiór scenariuszy programu badań, S_k,min, punkt pracy — `NIEUSTALONE`), O-31
(wersje warstw po dacie, flagi prawa operatora — `NIEUSTALONE`); `sposob_wykazania` czyta pokrycie
z WiPWC; `klasyfikacja_modulu` z podstawą i powodem; testy loadera (złożenie warstw, pierwszeństwo
OSD > WOS > zastane, walidacja granic LFSM-O, stan źródła najsłabszy, klasyfikacja URE + 110 kV
włącznie + < 0,8 kW → `None`, odrzucenie profilu bez sekcji `dokument`, `WSKAZANE` bez jednostki
→ błąd, każda podstawa w profilu z rodzajem zgodnym z warstwą). Bramka: `pytest tests/catalog -q`,
mypy na pakiecie.

**Pakiet C — solver PTPiREE + dowód + ocena wymagań + API.** `OcenaKryterium` per test (z
`werdykt/`), `criterion_source` → `ocena.limit.podstawa`; `werdykt_maszynowy(ocena)`; kasacja
`overall_status`/liczników; jedna funkcja stosowalności; wejścia wymagane; `DowodCertyfikatu` z
`model_bridge`; `provenance.py` uzasadnienia zaktualizowane do stanu faktycznego;
`ocena_wymagan.py` (reguły W po korekcie, `pokrycie_programu`, kompletność §3/§3a, stosowalność
O-31, kryteria O-32); `bieg.py` z `ocena_wymagan`; certyfikat i wniosek na rekordach i wyłącznie z
modelu (`case_id` + `klucz_twin` wymagane; końcówka 422 niesie rekordy; DOCX/PDF przez
`werdykt/dokument.py`; test T13: to samo zdanie w API i w dokumencie); `/run` znakuje dane z
żądania jako `UNVALIDATED_INPUT` (T17); `compliance/nc_rfg_modul.py`, `api/*` (`/modul` w kW),
`dokument_studium.py`, `pq_coverage` na profilu; `model_bridge.py` z nowymi wierszami inwentarza;
testy klasy: typ × technologia (PPM/SPGM/MAGAZYN) × certyfikat (rekord wykazu / brak) × dane ×
nowy/istniejący (A bez certyfikatu → `BRAK_DOWODU` 13.1a… i `BRAK_PODSTAWY` LFSM-O; B → 14(3)/
20(2)(b)/20(3)(a) `NIE_OCENIONO`; z certyfikatem → `BRAK_DOWODU` „pokrycie WiPWC NIEUSTALONE";
SPGM B bez T17; BESS → `NIE_DOTYCZY`; < 0,8 kW → `nie_dotyczy`; dane z żądania → `NIEPELNY`;
`ptpiree_verified` z żądania nie daje `PELNY`), determinizm (`deterministic_hash` stabilny w dwóch
biegach), snapshot OpenAPI. Bramka: pełna regresja backendu `-m "not pandapower and not andes"`,
`guardy_z_ci.py`.

**Pakiet D — frontend.** `ui2/wyniki/wzorzec/KartaWerdyktu.tsx` (+ typy `werdykt.ts` lustrzane do
kontraktu; etykieta Z REKORDU, mapa tylko `semantyka` → kolor), użycie w macierzy NC RfG (sekcja
„Wymagania" per moduł z ocenami składowymi; testy PTPiREE jako karty; ZERO liczników „zgodne /
PASS / FAIL" zamiast listy), w sekcji przekrojowej, we wniosku i certyfikacie (lista braków jako
karty; dokumenty tylko z zatwierdzonego modelu — kasacja ścieżki „z formularza"); pola T12
(`cease_generation_time_s`), nastaw zabezpieczeń modułu, `modul_istniejacy`, daty umowy w
formularzu macierzy; kasacja listy rozwijanej statusu certyfikatu (`NcRfgTestsTab.tsx:563`) —
status wyłącznie z tabliczki/API; kasacja klasyfikacji klienckiej i `compliance_tests`; rejestr
WiPWC z API (`/api/catalog/ptpiree/generator-certificates?search=`; kasacja `.generated.ts` i listy
ręcznej); ekrany Pakietu 0 (E-40 audytowy, FRT/T1/SSCI/LoM z etykietą „Ocena niewykonana");
fixtury i harness zregenerowane skryptem (`backend/scripts/eksport_fixtur_harnessu.py`), nie
ręcznie. Bramka: `npm run type-check`, `lint`, `vitest` (pełny), e2e dotkniętych spec
(`kreator-oze-max`, `critical-oze-evidence`) na realnym backendzie; zrzuty obu motywów (B-02).

**Pakiet E — strażniki + dokumenty.** `werdykt_wyjasnialny_guard` (tożsamości, bool/str, AST UI)
+ self-test + wpięcie do workflow; `plan_ab_zaleznosci_guard` + self-test; `bramka_danych_profilu`
+ tabela §12.1 planu z pomiaru; aktualizacja `docs/analysis/NC_RFG_PTPiREE_TESTY_KANON.md` (wynik
per wymaganie, wersja V2, identyfikatory T01–T20 jako numeracja repozytorium, cztery wymagania
FRT), `docs/plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` (OD-5, OD-20, OD-21, OD-26, OD-33 — decyzje;
`:239` twierdzenie E-40 przepisane), rejestr postępu planu §7, wiersz inwentarza §8 (tożsamości
zmigrowane usunięte z listy). Bramka: `docs_guard`, `guardy_z_ci`.

## §3 Granice

- Nie dotykać `network_model/solvers/dynamika/**` (AB-1b), `frt_hvrt/**` i `stability_rms/**`
  (kasacja w AB-1c — w Pakiecie 0 tylko werdykt konsumentów → `NIE_OCENIONO`), kontraktów FROZEN
  SC/PF, budowniczych admitancji (O-26 za bramką B-01), fikstur e2e poza dotkniętymi ścieżkami.
- Zero liczb kryterium w kodzie; zero wartości „typowych" w Banku Nastaw i warstwie magazynów; zero
  tekstu werdyktu poza generatorem; zero map etykiet poza `werdykt/etykiety.py`; zero danych z
  żądania traktowanych jako zwalidowane.
- Każdy test przepisany zachowuje intencję (komentarz z powodem zmiany kanonu); test maskujący
  defekt = dwa defekty.

## §4 Definicja ukończenia (CLAIMED DONE → VERIFICATION GATE)

Pełna regresja backend + frontend zielona, `guardy_z_ci.py` zielony (w tym trzy nowe strażniki),
snapshot OpenAPI zregenerowany, harness zregenerowany, e2e dotkniętych ścieżek na realnym
backendzie zielone. Sondy (każda z wklejonym wyjściem): (1) moduł A bez certyfikatu → certyfikat
odmówiony z rekordami `BRAK_DOWODU` (13.1a, 13.1b, 13.3, 13.4, 13.7 — „brak metody") i
`BRAK_PODSTAWY` (LFSM-O — „parametr zastany, stan NIEUSTALONE, potrzebny WOS") niosącymi
wyjaśnienie; (2) moduł A z certyfikatem z wykazu (rekord dopasowany po stronie serwera) →
`BRAK_DOWODU` z wyjaśnieniem „reguła pokrycia certyfikatem bez wskazanej jednostki WiPWC"; (3)
moduł B → 14(3), 20(2)(b), 20(3)(a) `NIE_OCENIONO` z „czego brakuje: bieg dynamiki (AB-1c)" i
zastrzeżeniem o obwiedni `NIEUSTALONE`; (4) SPGM B → 20(2)(b) `NIE_DOTYCZY`, 17(3) `NIE_OCENIONO`;
(5) BESS samodzielny → NC RfG `NIE_DOTYCZY` (art. 3 ust. 2 lit. d); (6) `POST /run` z
`certificate_status: ptpiree_verified` w ciele → 422 (pole nieznane) — a deklaracje z żądania →
`UNVALIDATED_INPUT`, `NIEPELNY`; (7) certyfikat bez `case_id` → 422; (8) P3 (0,06 pu przez 3 s) →
`NIE_OCENIONO`; T1 → `NIE_OCENIONO`; E-40 → `NIE_OCENIONO` bez liczb na ekranie użytkownika; SSCI →
`NIE_OCENIONO`; `werdykt_projektowy` z nieznanym statusem → `BRAK_PODSTAW`; LoM bez sprawdzeń →
`NIE_OCENIONO`; (9) `/modul` (kW) zwraca podstawę WOS ze stanem `NIEUSTALONE` i powodem; (10)
strażnik zależności planu zielony na sekwencji §5 i czerwony na dawnym porządku. Werdykt wizualny
karty werdyktu i ekranów Pakietu 0 (oba motywy) — zrzuty do oceny właściciela (B-02), bez
samocertyfikacji.
