# KARTA AB-1a — FUNDAMENT WYNIKÓW, PROWENIENCJI I WYJAŚNIALNOŚCI (Program A/B)

**Status:** WYKONAWCZA (projekt architekta Fable 5.1, 2026-09-23) · **Program:**
`PROGRAM_AB_DYNAMIKA_I_JAKOSC_ENERGII_2026-09.md` §6, §7 (wiersz AB-1a), §12 · **Wykonawca:** Claude Opus 5.5
(dwa worktree równoległe, commit BEZ push; integracja i pełne potwierdzenia — Fable) · **Baza:** HEAD gałęzi
`claude/relaxed-sagan-ww188q` po ETAPIE 9 mandatu.

**Po co (jednym zdaniem):** każdy wynik produktu — rozpływ, zwarcie, RMS, harmoniczne, supraharmoniczne, zgodność
— ma nieść tę samą, sprawdzalną strukturę „z jakiej domeny, wobec czego, z jakim marginesem, z jakiego modelu o jakim
statusie, z jakim dowodem", zanim powstanie choć jeden nowy solver; bez tego fundamentu tor H (harmoniczne)
powstałby jako druga wyspa, a tor R dalej produkowałby werdykty bez towarzyszy.

---

## §0 Rozstrzygnięcia (wiążące; zmiana = wróć do architekta)

| Id | Rozstrzygnięcie | Skąd |
|---|---|---|
| R-1 | `PhysicsDomain` jest **wyprowadzana z `analysis_type` przez JEDEN rejestr** (`application/solvers/solver_capability_registry.py`), nie dopisywana do kontraktów wyników FROZEN (`resultset_v1`, `resultset_dynamic_v1`). Koperta API biegu dostaje pole addytywne `physics_domain` (`exclude_none` nie dotyczy — pole zawsze obecne dla biegu zarejestrowanego). Nieznany `analysis_type` → wyjątek nazwany, nie `None`. | audyt regulacyjny §3.1; plan §6.10 |
| R-2 | `WynikInzynierski` = **rozszerzenie** `OcenaElementu` + `PozycjaWerdyktu` (`application/analyses/werdykt_projektowy.py`, front `ui2/wyniki/ocena/api.ts`). Zero trzeciego kontraktu. Nowe pola addytywne, `None` = „brak" (kreska na ekranie), nigdy wartość zastępcza. | audyt §3.2 |
| R-3 | Dwie osie statusu modelu urządzenia: `StatusRownan` (klasa urządzenia wobec wyroczni; rejestr per rodzina w `solver_input/provenance.py`, fail-closed `UNKNOWN`) i `StatusParametrow` (egzemplarz/typ wobec pomiaru/certyfikatu; pole OPCJONALNE `status_walidacji` w `ProweniencjaParametrow`, brak = `UNKNOWN` przy odczycie, żadnej domyślki zapisywanej). Trzecia oś (dowód zaakceptowany) NIE istnieje na modelu — należy do łańcucha zgodności (AB-1c). Nazwy różne od `EvidenceTier`. | audyt §6.8; wzorzec A-8 |
| R-4 | `BadanieZgodnosci` = **osobny kontrakt** obok `ScenariuszDynamiczny` (`enm/scenariusze.py`), warianty `rodzaj_badania` biegu `dynamika_rms`. NIE nowy rodzaj w unii `ZdarzenieDynamiczne`. `ScenariuszDynamiczny.tresc()`/`hash()` istniejących scenariuszy — bit w bit bez zmian (pin). Rdzeń nie obsługuje bodźca → adapter kończy nazwaną odmową `bodziec.rdzen_nieobslugiwany` (kod dopisany do zamkniętego rejestru `KODY_ODMOW` z testem). | audyt §6.9 |
| R-5 | Guard werdyktu działa na **obiekcie wyniku**, nie na literale (reguła audytu §3.3 p. 1–8, przeniesiona do docstringu guardu w całości). Zamknięta lista wyjątków FROZEN z przypiętym adapterem per pozycja. `ochrona_lom.Verdict` NIE jest FROZEN → przebudowa w tej karcie. | audyt §3.3 |
| R-6 | Poprawki rejestru dowodowego bez dotykania solvera FROZEN: T10 → zdolność `ncrfg_ptpiree.test_bez_tresci` (tier `NOT_SIMULATED`, claim `DYNAMIC_PERFORMANCE` → nie `reportable`); T20 → `ncrfg_ptpiree.power_quality_declared` z **poprawionym opisem** (limit 8 % zaszyty w `engine.py:860`, THD_U jest własnością napięcia sieci, nie emisji urządzenia) i `claim_kind=DYNAMIC_PERFORMANCE` (nie fakt konfiguracyjny) → nie `reportable`; moduł z zerem wymaganych testów → `not_reportable` z ograniczeniem `brak_wymaganych_testow` (reinterpretacja w `dowod_ncrfg.py`, solver nietknięty). | audyt §2.2, §6.6 |
| R-7 | Liczby normatywne (progi LoM 2,0 Hz/s, 47,5 Hz, 51,5 Hz; limity 8/5/5 %) **nie zmieniają się** w tej karcie (OD-38, OD-40); zmienia się wyłącznie ich OPIS: pole `zrodlo_status = UNVERIFIED_SOURCE` tam, gdzie dokument/wersja/klauzula nie są potwierdzone. | plan §12.2 |
| R-8 | Zakaz: edycji `network_model/solvers/**` poza `dynamika/zdarzenia.py::KODY_ODMOW` (dopisanie kodu odmowy — pod bramkami R10), `v126_academic.py`, `ncrfg_ptpiree/**`, `power_flow_*`, `short_circuit_*`; zakaz zmiany liczb w `catalog/profiles/nc_rfg/*.yaml`; zakaz nowych literałów fizyki w UI (`ui_no_physics_guard`). | B-01, R-07 planu |
| R-9 | Terminologia: „miejsce przyłączenia" (nie „PCC"), etykiety UI po polsku bez kodów projektowych; identyfikatory wewnętrzne (E2E-*, G*, M*) nie trafiają do UI. | `pcc_zero_guard`, `no_codenames_guard` |

---

## §1 Inwentarz klasy (reguła KLASA, NIE INSTANCJA — przed naprawą)

### 1.1 Miejsca, które dziś produkują werdykt bez pełnych towarzyszy (do objęcia guardem lub adapterem)

| Nośnik | Plik | FROZEN? | Działanie w AB-1a |
|---|---|---|---|
| `NcRfgPtpireeTestResult`, `NcRfgPtpireeModuleResult` (`pass/fail/no_data/not_required`, `zgodny/niezgodny/brak_danych`) | `network_model/solvers/ncrfg_ptpiree/contracts.py` | TAK | lista wyjątków + adapter `wynik_inzynierski_z_testu_ncrfg` w `application/ncrfg_compliance/` (pole addytywne `wynik_inzynierski` per test w odpowiedzi `POST /api/ncrfg-tests/run`) |
| `bus_results[].compatibility_status` („zgodny") | `network_model/solvers/v126_academic.py` | TAK | lista wyjątków; adapter NIE powstaje (zdolność wycofywana w AB-1d_min — audyt harmoniczny #7 REJECT) — pozycja na liście z adnotacją `WYCOFYWANA_AB-1d_min` i testem przypinającym, że adnotacja zniknie razem z wpisem rejestru |
| `ochrona_lom.Verdict(severity, message_pl)` | `application/analyses/ochrona_lom.py:133` | NIE | przebudowa → `OcenaNastawyLom` z towarzyszami (§2 D7) |
| `OcenaElementu.wynik` (`SPELNIA/NIE_SPELNIA/BRAK_PODSTAW`) | `application/analyses/werdykt_projektowy.py:451` | NIE | przechodzi (towarzysze obecni; podstawa w rodzicu `PozycjaWerdyktu.norma_pl`) — rozszerzany o nowe pola (§2 D2) |
| `WierszZgodnosci` (odbiór) | `application/analyses/odbior*.py` / `ui2/wyniki/odbior` | NIE | przechodzi wg pomiaru wstępnego audytu; potwierdzić guardem |
| `ReportingStatus`/`ProofStatus` (`reportable`, `complete`) | `solver_input/dowod_ncrfg.py` | NIE | to NIE są werdykty (osie A-8) — poza zakresem guardu; pinowane osobno |
| Frontend: unie literałów werdyktu w `ui2/**/api.ts` bez towarzyszy | `frontend/src/ui2/**` | NIE | reguła frontowa guardu (§2 D7) — pomiar na HEAD i lista wyjątków z adnotacją |

Wykonawca **rozszerza** tę tabelę o każde kolejne trafienie guardu na HEAD (pomiar przed naprawą wchodzi do meldunku).

### 1.2 Listy rodzajów biegów (trzy dziś → jedno źródło prawdy)

| Lista | Plik | Treść |
|---|---|---|
| `AnalysisType = Literal["PF", "short_circuit_sn"]` | `domain/analysis_run.py:10` | 2 rodzaje |
| `ExecutionAnalysisType` | `domain/execution.py:49-66` | SC_3F, SC_1F, SC_2F, SC_2F_G, LOAD_FLOW, PF_UNBALANCED, PHASE_STATE_SN, DYNAMIC_STABILITY, PROTECTION, DYNAMIKA_RMS |
| dyspozytor `execute_run` + `_execution_analysis_type_for_run` | `enm/canonical_analysis.py:476-500, 1015-1037` | PF, rozplyw_niesymetryczny, short_circuit_sn, phase_state_sn, dynamic_stability, dynamika_rms, protection_sn, v126:* |
| mapy kontraktów | `api/v125_contracts.py:326-352` | per `analysis_type` |
| rejestr zdolności | `application/solvers/solver_capability_registry.py` | `analysis_type` per zdolność |

Rozstrzygnięcie R-1: rejestr zdolności staje się **jedynym** miejscem, które wiąże `analysis_type` z domeną;
pozostałe listy zostają (ich kasacja to osobna klasa — AB-1d_min), ale test parytetu pilnuje, że każdy
`analysis_type` znany dyspozytorowi ma wpis z domeną (fail-closed w obie strony).

---

## §2 Zakres — deliverables

### Wykonawca 1 (worktree `ab1a-rejestr`): D1, D4, D5, D6, D8a

**D1 — `PhysicsDomain` w rejestrze zdolności + koperta API + nagłówek wyniku w UI**
- `application/solvers/solver_capability_registry.py`: `class PhysicsDomain(StrEnum)` z członami
  `POWER_FLOW, SHORT_CIRCUIT, RMS_DYNAMICS, SEQUENCE_DOMAIN, HARMONIC_FREQUENCY_DOMAIN,
  SUPRAHARMONIC_FREQUENCY_DOMAIN` (W-07) oraz `label_pl`; pole `physics_domain: PhysicsDomain` w `SolverCapability`
  **bez wartości domyślnej** (każdy wpis rejestru wypełniony jawnie: PF → `POWER_FLOW`, rozpływ niesymetryczny →
  `SEQUENCE_DOMAIN`? NIE — rozpływ niesymetryczny jest w dziedzinie fazowej 50 Hz: wykonawca proponuje
  `POWER_FLOW` z adnotacją `reprezentacja: "abc"`, a `SEQUENCE_DOMAIN` rezerwuje dla składowych symetrycznych
  zwarć/stanu fazowego; decyzję zapisuje w docstringu z uzasadnieniem — to jest jedyne miejsce, gdzie wykonawca
  rozstrzyga sam, i ma to zgłosić w meldunku); zwarcia IEC 60909 → `SHORT_CIRCUIT`; `dynamika_rms`,
  `dynamic_stability` → `RMS_DYNAMICS`; `POWER_QUALITY_HARMONICS`, `SSCI_IMPEDANCE` → `HARMONIC_FREQUENCY_DOMAIN`
  (bez zmiany `availability`/`reportable` — to robi AB-1d_min); pozostałe wg fizyki, każdy z jednym zdaniem
  uzasadnienia w komentarzu.
- Funkcja `domena_fizyczna_biegu(analysis_type: str) -> PhysicsDomain` (fail-closed: nieznany typ → `ValueError`
  z nazwą; prefiks `v126:` mapowany przez tabelę jawną, nie regex-zgadywanie).
- `api/canonical_run_views.py`: pole `physics_domain` (wartość + `physics_domain_pl`) w widoku biegu; OpenAPI
  snapshot przeliczony (`backend/schemas/openapi_snapshot.json`) z komentarzem w commicie, co się zmieniło.
- Frontend: typ w `types/` (pin do OpenAPI), prezentacja w JEDNYM komponencie nagłówka biegu w `ui2/wyniki/**`
  (wykonawca znajduje istniejący nagłówek wspólny; jeśli go nie ma — nie tworzy nowego, tylko dodaje pole do
  istniejącej sekcji tożsamości/świeżości biegu i wskazuje ją w meldunku), etykieta PL ze `strings.ts`.
- Testy: parytet „każdy `analysis_type` dyspozytora ma domenę" (iteracja po realnych gałęziach dyspozytora — nie po
  liście w teście), nieznany typ → wyjątek, OpenAPI snapshot, vitest nagłówka.

**D4 — `BadanieZgodnosci` obok `ScenariuszDynamiczny`**
- `enm/scenariusze.py` (albo nowy `enm/badanie_zgodnosci.py` importowany z `scenariusze`): `BadanieZgodnosci`
  (`frozen`, `extra="forbid"`): `urzadzenie_ref`, `bodziec: ProfilNapieciaZaciskow | RampaCzestotliwosci |
  SkokCzestotliwosci` (dyskryminator `rodzaj`), `impedancja_zastepcza_sieci: ImpedancjaZastepcza` (R, X w Ω albo pu z
  jawną bazą + `proweniencja: ProweniencjaParametrow`; **brak wartości domyślnej**), `horyzont_s`, `krok_wyjscia_s`,
  walidacje spójności (profil monotoniczny w czasie, rampa z `df_dt_hz_s ≠ 0`, skok z `f_do_hz` w paśmie ważności
  modelu), `tresc()`/`hash()` własne.
- Opcje biegu `dynamika_rms`: `rodzaj_badania: Literal["scenariusz_sieciowy", "badanie_zgodnosci"]` — brak pola =
  `scenariusz_sieciowy` **wyłącznie w warstwie odczytu opcji** (nie zapis domyślki), test pinuje, że hash opcji
  istniejących biegów (fikstury harnessu) się nie zmienia; oba rodzaje naraz → 422 nazwany.
- Adapter `enm/adapter_dynamiki.py`: `badanie_zgodnosci` → odmowa `bodziec.rdzen_nieobslugiwany` z pełnym
  kontekstem (urządzenie, rodzaj bodźca, co trzeba dostarczyć: „szyna o zadanym przebiegu — karta AB-3R"); kod
  dopisany do `dynamika/zdarzenia.py::KODY_ODMOW` (rejestr zamknięty — test rejestru zaktualizowany z uzasadnieniem
  w komentarzu).
- Wynik biegu (koperta) niesie `rodzaj_badania`.
- Testy: pin hashy 3 istniejących scenariuszy z fikstur (bit w bit), 422 dla obu rodzajów naraz, odmowa nazwana,
  round-trip JSON.

**D5 — kontrakt parametru z proweniencją (W-98)**
- `solver_input/provenance.py`: `WartoscZProweniencja[T]` (`value`, `unit`, `source: SourceKind`, `version: str |
  None`, `status: FieldQuality | StatusZrodla`, `domain: PhysicsDomain | None`) + `StatusZrodla(StrEnum)` =
  `{UNVERIFIED_SOURCE, VERIFIED_SOURCE}` — **żadnego domyślnego `status`**; `to_dict`; konsument w tej karcie: pole
  `podstawa` w D2/D7 (dokument, wersja, klauzula, `zrodlo_status`).
- Testy kontraktu (brak statusu → błąd budowy; serializacja stabilna).

**D6 — kody fail-closed (W-99)**
- `solver_input/provenance.py`: `KodFailClosed(StrEnum)` = `{UNVALIDATED_INPUT, MODEL_MISSING, OUTSIDE_DOMAIN,
  REQUIREMENT_UNVERIFIED}` + `label_pl` + `opis_pl` (co użytkownik ma zrobić); konsument w tej karcie:
  `dowod_ncrfg.py` (moduł bez wymaganych testów → `REQUIREMENT_UNVERIFIED`), D7 (podstawa niepotwierdzona →
  `REQUIREMENT_UNVERIFIED` w polu `zrodlo_status`, nie w werdykcie).
- Test: każdy kod ma etykietę i opis; słownik zamknięty (pin).

**D8a — piny i zapadki**
- `scripts/solver_input_substitute_guard` (zapadka pól kontraktów, liczba plików) — przeliczenie pinów Z POMIARU z
  wpisem uzasadnienia w dzienniku testu (wzorzec R10 §W.3); `mypy` zapadka bez wzrostu długu; `openapi_snapshot`.

### Wykonawca 2 (worktree `ab1a-werdykt`): D2, D3, D7, D8b

**D2 — `WynikInzynierski` jako rozszerzenie `OcenaElementu`/`PozycjaWerdyktu`**
- `application/analyses/werdykt_projektowy.py`: pola addytywne (wszystkie `None`/puste domyślnie = „brak", zgodnie z
  konwencją klasy): w `PozycjaWerdyktu`: `physics_domain: str | None` (z rejestru D1 po `zrodlo`/`run_id` biegu —
  wykonawca 2 importuje `domena_fizyczna_biegu` z gałęzi wykonawcy 1 po integracji; do tego czasu stub lokalny
  **niedopuszczalny** — uzgodnić kolejność: D1 scala się pierwszy), `podstawa: PodstawaNormatywna | None`
  (`dokument`, `wersja`, `klauzula`, `zrodlo_status`) obok tekstowego `norma_pl` (zostaje; test pinuje, że gdy
  `podstawa` jest, `norma_pl` = jej rendering, jedno źródło); w `OcenaElementu`: `punkt_krytyczny:
  PunktKrytyczny | None` (`element_ref`, `wspolrzedna: {"t_s" | "f_hz" | None: float}`), `przyczyna:
  PrzyczynaOgraniczenia | None` (`rodzaj: element | regulator | ogranicznik | zrodlo_emisji | rezonans`, `ref`,
  `opis_pl`), `status_modelu: {rownania: StatusRownan, parametry: StatusParametrow} | None`, `status_wejscia:
  FieldQuality | None`, `niepewnosc: {wartosc, jednostka, metoda_pl} | None`, `zakres_waznosci: {opis_pl,
  granice} | None`; `dowod` ujednolicony: `{run_id, element_id, trace_ref | None}`.
- Producenci istniejący (`_ocena_elementu`, `_pozycja_cieplna`, `_pozycja_wiarygodnosci`, `_pozycja_der_sn`,
  walidacja energetyczna, warunki przyłączenia) wypełniają nowe pola TAM, GDZIE dostawca ma dane (np.
  `physics_domain` z biegu — zawsze; `status_wejscia` z proweniencji pola — gdy widok dostawcy ją niesie); nigdzie
  nie wymyślają wartości.
- Adapter NC RfG: `application/ncrfg_compliance/wynik_inzynierski.py::z_testu_ncrfg(test, modul, profil) ->
  OcenaElementu` + pozycja; wpięty w odpowiedź `POST /api/ncrfg-tests/run` jako pole addytywne
  `wynik_inzynierski` per test (obok istniejących `reporting_status`/`proof_status`); `podstawa.zrodlo_status =
  UNVERIFIED_SOURCE` dla wszystkich (OD-21).
- Frontend: `ui2/wyniki/ocena/api.ts` + `model.ts` + `EkranOceny.tsx`: prezentacja nowych pól w istniejącym
  łańcuchu „podstawa → wynik → odniesienie → ocena → wniosek → dowód" (podstawa strukturalna z dokumentem/wersją/
  klauzulą i odznaką `źródło niezweryfikowane`; punkt krytyczny; przyczyna; status modelu jako DWIE odznaki; zakres
  ważności); macierz NC RfG (`ui2/oze/macierz`) pokazuje `wynik_inzynierski` testu w szczególe werdyktu
  (`SzczegolWerdyktu.tsx`); vitest natywną ścieżką (bez syntetycznych `dispatchEvent`).
- Testy: `to_dict` addytywny (klucze starych pól bez zmian, snapshot fikstur harnessu przeliczony z uzasadnieniem),
  adapter NC RfG dla T01/T10/T14/T20 (każdy z innym stanem: deklaracja / bez treści / brak symulacji / limit
  niezweryfikowany), test „nigdy wartość zastępcza" (brak danych → `None`).

**D3 — dwie osie statusu modelu**
- `solver_input/provenance.py`: `StatusRownan(StrEnum)` = `{VALIDATED, UNVALIDATED, UNKNOWN, OUTSIDE_DOMAIN}`,
  `StatusParametrow(StrEnum)` = `{MEASURED, CERTIFIED, DATASHEET, ESTIMATED, UNKNOWN}` (rozłączne z `FieldQuality`
  nazwami wartości tam, gdzie znaczenie inne — `DATASHEET`/`ESTIMATED` mogą się pokrywać, wtedy jedna definicja:
  `StatusParametrow` importuje etykiety z `FieldQuality`, nie dubluje), rejestr `_STATUS_ROWNAN_RODZIN: dict[str,
  StatusRownan]` dla rodzin `ROdzinaDynamiki` (`synchroniczna` klasyczna 2. rzędu → `VALIDATED` z `audit_ref` R10;
  wszystkie pozostałe → `UNVALIDATED` z odsyłaczem do przeglądu dynamiki §3), funkcja `status_rownan_rodziny(rodzina)`
  fail-closed `UNKNOWN`.
- `enm/dynamika_modele.py::ProweniencjaParametrow.status_walidacji: StatusParametrow | None = None` (opcjonalne,
  `exclude_none`; **żaden istniejący hash ENM nie zmienia się** — pin na fikstury golden), reader
  `status_parametrow(prow) -> StatusParametrow` (`None → UNKNOWN`).
- Predykat parami: `czy_awans_dopuszczalny(tier_docelowy, status_rownan, status_parametrow) -> bool`: `VALIDATED_SIMULATION`
  wymaga `rownania=VALIDATED` i `parametry ∈ {MEASURED, CERTIFIED}`; test iloczynu cech (4 × 5 kombinacji) + test,
  że rejestr `_DYNAMIC_CAPABILITY_EVIDENCE` nie zawiera wpisu `VALIDATED_SIMULATION` łamiącego predykat.
- Konsument UI: inspektor urządzenia dynamicznego (istniejąca sekcja proweniencji w `ui2/inspector` albo
  `ui2/oze/pulpit` — wykonawca wskazuje jedną) pokazuje dwie odznaki; D2 wypełnia `status_modelu` dla pozycji
  dynamiki.

**D7 — guard werdyktu + przebudowa LoM**
- `scripts/explainable_verdict_guard.py` (AST, zakres `backend/src/{api,application,analysis,solver_input}/**`)
  dokładnie wg reguły audytu §3.3 p. 1–8 (tokeny, nośnik, pięć grup towarzyszy, zagnieżdżenie, wyjątki: definicje
  typów, mapy etykiet, porównania, `tests/**`, `docs/**`); `scripts/explainable_verdict_allowlist.txt` (zamknięta:
  `NcRfgPtpireeTestResult → wynik_inzynierski_z_testu_ncrfg`, `NcRfgPtpireeModuleResult → j.w.`,
  `v126_academic bus_results → WYCOFYWANA_AB-1d_min`); test przypina, że adapter z listy istnieje i jest wywoływany
  przez trasę API (grep AST, nie napis).
- Reguła frontowa: `scripts/explainable_verdict_guard.py --frontend` (albo osobny plik, jeśli konwencja repo
  rozdziela) na `frontend/src/ui2/**/api.ts`: propercja typu unii literałów z tokenami bez pięciu grup w tym samym
  interfejsie lub rodzicu; pomiar na HEAD → lista wyjątków z adnotacją per pozycja.
- `scripts/test_explainable_verdict_guard.py`: 7 mutacji z audytu §3.3 p. 8 (+ frontowa: interfejs z samym
  `wynik` → zgłoszenie).
- Wpięcie do CI: krok w `.github/workflows/python-tests.yml` obok innych guardów (wzorzec istniejących kroków);
  `scripts/guardy_z_ci.py` wykrywa go sam (to test, że wykrywa).
- **LoM:** `application/analyses/ochrona_lom.py`: `Verdict(severity, message_pl)` → `OcenaNastawyLom` (`funkcja`,
  `wartosc`, `jednostka`, `odniesienie_dolne`, `odniesienie_gorne`, `margines`, `margines_jednostka`, `podstawa:
  PodstawaNormatywna` z `zrodlo_status=UNVERIFIED_SOURCE` dla ROCOF 2,0 Hz/s i pasma 47,5/51,5 (opis z audytu:
  brak dokumentu i okna pomiaru; podstawa „IEEE 1547 / NC RfG Art. 14" **usunięta** jako błędna, zastąpiona
  `dokument=None, zrodlo_status=UNVERIFIED_SOURCE, uwaga_pl`), `dowod {run_id | None, element_id}`, `wynik`
  (dotychczasowa `severity`), `komunikat_pl`); LICZBY BEZ ZMIAN (R-7); BESS: dziś wyłączony z wymogu — zostaje
  wyłączony, ale z **nazwanym** powodem `poza_zakresem_rfg_do_OD-40` w wyniku (nie cichym pominięciem); frontend
  ekranu LoM (`frontend/src/ui2/oze/lom/**` — pomiar 2026-09-23) konsumuje nowy kształt; testy LoM przepisane do
  nowego kształtu z zachowaniem intencji (komentarz w każdym), plus test „odznaka źródło niezweryfikowane widoczna".

**D8b — piny**: fikstury harnessu (`frontend/src/harness-fixtures/generated/*`) przeliczone generatorem repo
(nie ręcznie), z listą zmienionych plików i powodem w meldunku; `dialog_completeness`, `dead_click`,
`ui_terminology`, `forbidden_ui_terms` zielone.

---

## §3 Wspólne dla obu wykonawców

- Każda nowa klasa/pole: docstring PL z „po co", bez skrótów „etc.".
- Zero wartości domyślnych dla danych fizycznych i normatywnych (`dynamika_zero_default_guard`, `solver_input_substitute_guard`).
- Nowy kod odmowy/enum → rejestr zamknięty + test w obie strony.
- Testy interakcji frontowej natywną ścieżką (CLAUDE.md, Zero-Debt p. 5).
- Meldunek końcowy per wykonawca: (1) inwentarz klasy zmierzony na HEAD (liczby), (2) lista plików, (3) wynik
  pełnej regresji warstwy z kodami wyjścia łapanymi BEZPOŚREDNIO, (4) piny przeliczone z uzasadnieniem, (5) czego
  NIE zrobiono i dlaczego (jeśli cokolwiek), (6) rozstrzygnięcia własne (D1 rozpływ niesymetryczny; wybór
  komponentu nagłówka; miejsce ekranu LoM).

## §4 Bramki odbioru (Fable, po cherry-pick na gałąź programu)

1. `cd backend && poetry run pytest tests/ -q -m "not pandapower and not andes"` — 0 failed, 0 skipped.
2. `poetry run python -m tests.walidacja_fizyczna.uruchom` — `WERDYKT: WALIDACJA WYKONANA`, `kroki_nieudane: []`
   (nieregresja R10).
3. `poetry run python ../scripts/guardy_z_ci.py` — komplet zielony (w tym nowy guard i jego testy).
4. `cd frontend && npm run type-check && npm run lint && npm test` — 0 błędów; e2e `critical-run-flow.spec.ts`
   na realnym backendzie.
5. Determinizm: `tests/e2e/test_so1a_scenariusz_odniesienia.py` (hash biegu bez zmian), fikstury golden ENM bez
   zmiany hashy.
6. Guard werdyktu na HEAD po integracji: 0 zgłoszeń poza listą wyjątków.
7. Zrzuty ekranu (oba motywy) ekranu „Ocena techniczna wyników" z nowymi polami i ekranu LoM — do werdyktu
   wizualnego właściciela (B-02), nie do samocertyfikacji.

## §5 Wiersze zamrożenia / rejestru domykane

H3 (trójstopniowy status walidacji — dwie osie modelu + `EvidenceTier` wyniku: „rozłącznie: wykonywalne /
zwalidowane / kwalifikowane"), W-07, W-71, W-72/W-73 (szablony zdań — w `wniosek_pl` adaptera NC RfG i LoM), W-96,
W-98, W-99, §6.8, §6.9, §6.11 planu.
