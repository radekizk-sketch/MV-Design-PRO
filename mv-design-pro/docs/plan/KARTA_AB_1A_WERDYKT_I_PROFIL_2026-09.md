# Karta wykonawcza AB-1a — profil regulacyjny v1 + kontrakt werdyktu wyjaśnialnego + uczciwa zgodność NC RfG

**Program:** `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` (§5 AB-1a, §6). **Kontrakt:**
`docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`. **Data karty:** 2026-09-23. **Wykonawca:** Claude
Opus 5.5 (subagent; sekwencyjnie per pakiet A→E, worktree `r10`, bez `git commit`/`push` —
zmiany odbiera i commituje Fable po własnej weryfikacji). **Rdzeń B-01:** `network_model/solvers/
ncrfg_ptpiree/**` edytowany z delegacji O-5 (parytet w testach klasy).

## §0 Rozstrzygnięcia (nienegocjowalne w tej karcie)

1. **Jeden typ podstawy** `PodstawaWymagania` (leaf `backend/src/werdykt/kontrakt.py`) zastępuje
   `catalog.profiles.nc_rfg.ZrodloWartosci` (alias skasowany, nie utrzymywany): pola `rodzaj`
   (`ROZPORZADZENIE_UE` / `NORMA` / `WOS` / `PROCEDURA_PTPIREE` / `WIPWC` / `OSD` /
   `KATALOG_PRODUCENTA` / `ZALOZENIE_PROJEKTOWE` / `NIEUSTALONA`), `dokument`, `wydanie`,
   `jednostka_redakcyjna`, `status` (`ZWERYFIKOWANE` / `WSKAZANE` / `NIEUSTALONE`), `uwagi_pl`.
   Warstwa profilu `NC_RFG` → `ROZPORZADZENIE_UE`, `NIEUSTALONA` → `NIEUSTALONA`, pozostałe 1:1.
2. **Pakiet `werdykt/`** (leaf: pydantic + stdlib, zero importów z `analysis`/`application`/
   `network_model`): `kontrakt.py` (typy §1 i §4 kontraktu), `decyzja.py` (reguła K §2.2 i
   agregacja W §2.3 — czyste funkcje, JEDYNE miejsce tych reguł), `wyjasnienie.py` (generator
   `zdanie_pl` / `przyczyna_pl` / `zastrzezenia` z pól rekordu — JEDYNY generator tekstu werdyktu),
   `dokument.py` (serializer rekordu do bloku dokumentu formalnego §10 — JEDYNE mapowanie statusu
   na etykietę po stronie backendu), `etykiety.py` (słownik etykiet §9 — importowany przez
   `dokument.py` i eksponowany w API dla karty; UI nie definiuje własnych map).
3. **Walidacja przy konstrukcji** (pydantic `model_validator`): T1–T5, T10, T11 kontraktu są
   błędami walidacji typu, nie testami zewnętrznymi. Liczba bez jednostki = `ValidationError`;
   bezwymiarowe jawnie `"p.u."` albo `"1"`.
4. **Niepewność** w AB-1a: dla porównań deklaracji `Niepewnosc(nie_dotyczy=True,
   powod_pl="porównanie wartości zadeklarowanych — niepewność numeryczna nie dotyczy")`; pole
   liczbowe wchodzi w użycie w AB-1b (połowienie kroku, O-14).
5. **Solver PTPiREE emituje `OcenaKryterium` per test** (pole addytywne `ocena` w
   `NcRfgPtpireeTestResult`; dotychczasowe `verdict`/`summary_pl`/`metrics`/`fix_actions` zostają
   jako enum maszynowy i skrót, ale `summary_pl` = `ocena.wyjasnienie.zdanie_pl` — jedno zdanie,
   jedno źródło). Kryterium każdego testu ma `warunek_latex`; wynik i limit mają jednostki; limit
   ma `podstawa` z profilu (stan źródła); margines wg definicji z `_zapas`-podobnej jednej funkcji
   w `werdykt/decyzja.py` (nie w solverze).
6. **Wynik zgodności per wymaganie** w `application/ncrfg_compliance/ocena_wymagan.py` na typach
   `werdykt/`; `NcRfgPtpireeRunResponse.ocena_wymagan: list[OcenaWymaganModulu]` (wymagane, bez
   domyślnej pustej listy); certyfikat i wniosek do OSD czytają wyłącznie ten wynik (lista braków
   = rekordy `WynikWymagania` z `BRAK_*`/`NIE_OCENIONO`, serializowane `werdykt/dokument.py`).
7. **Warstwa WiPWC** `catalog/profiles/nc_rfg/warstwy/wipwc.yaml`: `dokument` (tytuł, wydanie,
   status), `pokrycie_certyfikatem: {RFG_13_1A: [A, B], …}` — pole `certyfikat_pokrywa_typy`
   znika z `nc_rfg.yaml` (rozporządzenie nie mówi, co pokrywa certyfikat); rejestr certyfikowanych
   urządzeń (`frontend/src/ui/network-build/station-der/ptpireeCertifiedInverters*.ts`) przenosi
   się do `warstwy/wipwc_rejestr.yaml` (wersja listy, data, pozycje) z końcówką
   `GET /api/ncrfg-tests/catalog` niosącą rejestr; klient czyta z API, plik `.generated.ts`
   skasowany. Stan źródła obu: `WSKAZANE` (dokument i wydanie wskazane; treść nie w repo).
8. **Bank Nastaw** w `operatorzy/<id>.yaml: bank_nastaw` (progi U</U>/f</f>, czasy, LoM — wartości
   TYLKO z proweniencją; brak danych = sekcja pusta z `status: NIEUSTALONE`, nigdy wartości
   „typowe"). Loader eksponuje `profile.bank_nastaw` (typ z proweniencją per pozycja). W AB-1a
   konsumentem jest wyłącznie API katalogu (widok) — ocena FRT (AB-1c) i zabezpieczenia (AB-5)
   czytają je później; zero fabrykacji.
9. **Klasa modułu wyłącznie z backendu**: kasacja `ui2/oze/ranking/rankingModel.ts::klasaNcRfg`
   i klasyfikacji w `studiumModel.ts`; ranking/studium czytają klasę z odpowiedzi (`/modul`
   zwraca `{modul, prog_min_kw, podstawa}` — z podstawą i progami, nie gołą literę);
   `voltage_kv_max` w `KlasaModuluNcRfg` → `napiecie_ponizej_kv`.
10. **Pole `compliance_tests`** (OD-26) skasowane z kontraktu katalogu, API i typów FE.
11. **Strażnik** `scripts/werdykt_wyjasnialny_guard.py` + `scripts/test_werdykt_wyjasnialny_guard.py`
    wg §12 kontraktu, wpięty do `.github/workflows/python-tests.yml` (guardy_z_ci czyta workflow);
    lista dozwolonych enumów wewnętrznych = wiersze `ENUM_WEWNETRZNY` z
    `docs/audit/INWENTARZ_WERDYKTOW_LAKONICZNYCH_2026-09-23.md`; zapadka = liczba wierszy
    `MIGRACJA` jeszcze niezmigrowanych (tylko w dół).

## §1 Inwentarz klasy (miejsca dzielące mechanizm — komplet, nie przykład)

| Mechanizm | Miejsca |
|-----------|---------|
| progi klas / klasyfikacja | `catalog/profiles/nc_rfg/loader.py::klasyfikuj_modul` (jedyne), `compliance/nc_rfg_modul.py`, `api/ncrfg_ptpiree_tests.py::/modul`, `api/generators.py::_weryfikuj_modul_ncrfg`, `application/analyses/dokument_studium.py` (~224–234), `frontend ui2/oze/ranking/rankingModel.ts`, `ui2/oze/studium/studiumModel.ts`, fixtury ranking/studium, harness `harness-fixtures/generated/*`, e2e `kreator-oze-max.spec.ts` |
| kryteria testów PTPiREE | `network_model/solvers/ncrfg_ptpiree/engine.py` (T01–T20), `solver_input/dowod_ncrfg.py::TEST_ZDOLNOSC`, `solver_input/provenance.py` (uzasadnienia `ncrfg_ptpiree.*` — teksty o „zaszytej częstotliwości" do korekty), `docs/analysis/NC_RFG_PTPiREE_TESTY_KANON.md` |
| konsumenci wyniku biegu | `application/ncrfg_compliance/bieg.py`, `application/analyses/certyfikat_zgodnosci.py` (`zbierz_braki`, `build_certyfikat_view`, DOCX/PDF), `application/analyses/wniosek_osd.py`, `api/ncrfg_ptpiree_tests.py`, `api/oze_analysis_runs.py` (`_certyfikat_view`), FE `ui/ncrfg-tests/api.ts`, `ui2/oze/api.ts`, `ui2/oze/macierz/**`, `ui2/oze/wniosek/**`, `ui2/oze/certyfikat/**` (jeśli istnieje), harness `ncrfg_zgodnosc_przekrojowa_scena_macierz.json`, `openapi_snapshot.json` |
| profil i jego katalog | `api/ncrfg_ptpiree_tests.py::/catalog`, `enm/validator.py:640-700` (tryby regulacji), `application/analyses/{frt_trajektorie,frt_sekwencja,pq_coverage}.py` (obwiednie/zakres Q z profilu), `application/ncrfg_compliance/model_bridge.py` (inwentarz pól wejścia — nowe pole `cease_generation_time_s`) |
| testy do przepisania (intencja zachowana w komentarzu) | `tests/catalog/test_pr9_nc_rfg_profiles_and_turbines.py` (classify_module → klasyfikuj_modul), `tests/compliance/test_nc_rfg_modul.py` (parytet progów URE), `tests/test_ncrfg_ptpiree_solver.py` (moduł B kompletny ≠ zgodny), `tests/enm/test_ncrfg_model_bridge.py:379-380` (test maskujący → ścieżka realna), `tests/api/test_certyfikat_zgodnosci.py`, `test_wniosek_osd.py`, `test_ncrfg_ptpiree_api.py`, `test_dokument_studium.py`, `test_generators_api.py`, `tests/test_solver_input_dowod_ncrfg.py` (fixtury z `technologia`, `profile_version`, `profile_hash`), `tests/ci/test_fixtury_harnessu.py`, `tests/api/test_openapi_snapshot.py` (regeneracja `scripts/generuj_snapshot_openapi.py`) |

## §2 Pakiety pracy (kolejność; każdy z własną bramką)

**Pakiet A — `werdykt/` + testy T1–T13 (bez konsumentów).** Typy, decyzja, generator, dokument,
etykiety; testy iloczynu cech (status × kompletność × stan źródła × status modelu × status
danych) z użyciem `hypothesis`, jeśli jest w zależnościach (sprawdź `pyproject.toml`; nie dodawaj
pakietu bez powodu), inaczej parametryzacja pytest. Bramka: `pytest tests/werdykt -q`, mypy strict
na pakiecie, ruff/black.

**Pakiet B — profil regulacyjny v1 (dokończenie).** `PodstawaWymagania` w loaderze; `wipwc.yaml`,
`wipwc_rejestr.yaml`, `bank_nastaw`; `sposob_wykazania` czyta pokrycie z WiPWC; testy loadera
(złożenie warstw, pierwszeństwo OSD > WOS > zastane, walidacja granic LFSM-O, stan źródła
najsłabszy, klasyfikacja URE + 110 kV włącznie + < 0,8 kW → `None`, odrzucenie profilu bez
sekcji `dokument`). Bramka: `pytest tests/catalog -q`.

**Pakiet C — solver PTPiREE + dowód + ocena wymagań.** `OcenaKryterium` per test (z
`werdykt/`), `criterion_source` → `ocena.limit.podstawa`; `provenance.py` uzasadnienia
zaktualizowane do stanu faktycznego; `ocena_wymagan.py`; `bieg.py` z `ocena_wymagan`; certyfikat i
wniosek na rekordach (`zbierz_braki` zwraca rekordy, końcówka 422 niesie rekordy; DOCX/PDF przez
`werdykt/dokument.py`; test T13: to samo zdanie w API i w dokumencie); `compliance/nc_rfg_modul.py`,
`api/*`, `dokument_studium.py`, FRT/pq_coverage na profilu; `model_bridge.py` z nowym wierszem
inwentarza; testy klasy: typ × technologia × certyfikat × dane (A bez cert → `BRAK_DOWODU`
13.1a…, LFSM-O → `BRAK_PODSTAWY`; B → FRT `NIE_OCENIONO`; z certyfikatem → `SPELNIA/CERTYFIKAT`;
SPGM B bez T17; < 0,8 kW → `nie_dotyczy`), determinizm (`deterministic_hash` stabilny w dwóch
biegach), snapshot OpenAPI. Bramka: pełna regresja backendu `-m "not pandapower and not andes"`,
`guardy_z_ci.py`.

**Pakiet D — frontend.** `ui2/wyniki/wzorzec/KartaWerdyktu.tsx` (+ typy `werdykt.ts` lustrzane
do kontraktu, etykiety z API), użycie w macierzy NC RfG (sekcja „Wymagania" per moduł z ocenami
składowymi; testy PTPiREE jako karty), w sekcji przekrojowej, we wniosku i certyfikacie (lista
braków jako karty); pole T12 (`cease_generation_time_s`) w formularzu macierzy; kasacja klasyfikacji
klienckiej i `compliance_tests`; rejestr WiPWC z API; fixtury i harness zregenerowane skryptem
(`backend/scripts/eksport_fixtur_harnessu.py`), nie ręcznie. Bramka: `npm run type-check`, `lint`,
`vitest` (pełny), e2e dotkniętych spec (`kreator-oze-max`, `critical-oze-evidence`) na realnym
backendzie.

**Pakiet E — strażnik + dokumenty.** Guard + self-test + wpięcie do workflow; aktualizacja
`docs/analysis/NC_RFG_PTPiREE_TESTY_KANON.md` (wynik per wymaganie, wersja V2, identyfikatory
T01–T20 jako numeracja repozytorium), `docs/plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` (OD-5, OD-20,
OD-21, OD-26, OD-33 — decyzje), rejestr postępu planu §7. Bramka: `docs_guard`, `guardy_z_ci`.

## §3 Granice

- Nie dotykać `network_model/solvers/dynamika/**` (AB-1b), `frt_hvrt/**` i `stability_rms/**`
  (kasacja w AB-1c), kontraktów FROZEN SC/PF, fikstur e2e poza dotkniętymi ścieżkami.
- Zero liczb kryterium w kodzie; zero wartości „typowych" w Banku Nastaw; zero tekstu werdyktu
  poza generatorem; zero map etykiet poza `werdykt/etykiety.py` i `KartaWerdyktu`.
- Każdy test przepisany zachowuje intencję (komentarz z powodem zmiany kanonu).

## §4 Definicja ukończenia (CLAIMED DONE → VERIFICATION GATE)

Pełna regresja backend + frontend zielona, `guardy_z_ci.py` zielony (w tym nowy guard z zapadką),
snapshot OpenAPI zregenerowany, harness zregenerowany, e2e dotkniętych ścieżek na realnym
backendzie zielone, sonda: moduł A bez certyfikatu → certyfikat odmówiony z rekordami
`BRAK_DOWODU`/`BRAK_PODSTAWY` niosącymi wyjaśnienie; moduł A z certyfikatem pokrywającym →
certyfikat z rekordami `SPELNIA`/`CERTYFIKAT` i podstawą WiPWC `WSKAZANE`; moduł B → FRT
`NIE_OCENIONO` z „czego brakuje: bieg dynamiki (AB-1c)". Werdykt wizualny karty werdyktu (oba
motywy) — zrzuty do oceny właściciela (B-02), bez samocertyfikacji.
