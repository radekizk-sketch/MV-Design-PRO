# MV-DESIGN-PRO — CONVERGENCE EVIDENCE (dowody konwergencji; dokument żywy)

**Status:** KANONICZNY, ŻYWY (kontrakt MAX PLATFORM 2026-09-04, §34–§36, §40, §42). Jedyne miejsce, w którym stan programu jest raportowany z dowodem (CI, testy, pomiary, wyrocznie). Zasada: „zielone przez pominięcie" nie jest dowodem; test snapshotowy nie jest wyrocznią fizyki.

---

## A. Stan faktyczny CI (§34) — gałąź `claude/mv-design-pro-twin-audit-u4lhy0`

Klasyfikacja czerwonych bramek na szczycie `c5ebde3f` (pomiar z logów GitHub Actions, 2026-09-02) i ich los:

| Workflow | Stan @ c5ebde3f | Klasa (§34) | Przyczyna źródłowa | Naprawa | Stan po naprawie |
|---|---|---|---|---|---|
| Docs Integrity Guard | zielony | — | — | — | zielony |
| Physics Label Guard | zielony | — | — | — | zielony |
| Architectural And Repo Hygiene | zielony | — | — | — | zielony |
| Frontend E2E smoke | zielony | — | — | — | zielony |
| Python tests | czerwony (2 testy) | **stale test / policy guard** | `scripts/guardy_z_ci.py` nie rozpoznawał `$GUARD_PY` po ujednoliceniu środowiska guardów | regex `(?:python3?|\$\{?GUARD_PY\}?)` (`cfbc75fb`) | krok pytest **zielony** @ e6f11de7 (10 568 testów); czerwony pozostał krok „Testy guardów": 2 testy własne `test_solver_input_substitute_guard.py` (11 naruszeń + 2 moduły bez decyzji w mapie: `lv_temperature_correction.py`, `lv_mcb_bands_iec60898.py`) → karta CI-A |
| Frontend checks | czerwony (1 test vitest + zapadka tsconfig) | **source regression** (komunikat nie w formie dokonanej — moja zmiana) + **policy guard** (dług typów 658 > 531, wyciszenia 39 > 35 — pre-existing) | `operationSuccessMessages.ts`; `tsconfig_gate_guard` | komunikaty poprawione (`cfbc75fb`); karta CI-B (agent, worktree) | @ e6f11de7: type-check, lint, vitest, audit2, 5 guardów **zielone**; czerwony wyłącznie `TSConfig Gate Guard` → CI-B |
| P0 Extended Guards | czerwony (11 naruszeń) | **environment/dependency** (naprawione w `c5ebde3f`: jedno środowisko poetry) → odsłoniło **source regression** z #472 (podstawianie liczb za brakujące dane w `domain_operations_v2.py`, `mapping.py`) + zapadka `c_factor` do obniżenia | `solver_input_substitute_guard` | karta CI-A (agent, worktree; §0: brak podstawień, jawna odmowa, jedna definicja `n_parallel`) | w toku |
| SLD Determinism Guards | czerwony | **nowa treść sceny (portal LV nN, #472), nie regresja trasowania** — dowód: atrybucja per przyczyna (footprint `#lv-portal-drop` +848 px na L1/L2; kaskada rezerwacji kanału i jogu trasy z wyższego footprintu stacji: 29/53 stacji 0→48 px), ablacja 2×2 = stan sprzed #472 co do piksela | `frontend/scripts/sld_v3_acceptance.mjs` baseline | karta CI-C: baseline z komentarzem dowodowym + bramka per przyczyna `VERTICAL_LENGTH_BY_CAUSE_BASELINE` + test negatywny (`ee0ec472`) | **zielony** @ ee0ec472 (run 33925212895) |
| Frontend E2E full | czerwony (12 speców) | **source regression na `main` od #472** (identyczna lista na `main` @ a1ab2959; poprzedni zielony bieg: 2031fc75, 2026-08-15) | m.in. chip `mvd-casebar-model` „Model: w budowie" przy `ready: true` z serwera | karta CI-D (agent, realny backend, przyczyna źródłowa w produkcie) | w toku |

Zakazy respektowane: brak `skip`, brak podnoszenia tolerancji, brak aktualizacji goldenów bez dowodu semantycznego, brak kasowania testów.

## B. Ochrona gałęzi `main` (§36) — **OWNER ACTION P0**

Pomiar (GitHub API `list_branches`, 2026-09-04): `main` → `protected: false`; łącznie ponad 400 gałęzi (`claude/*`, `codex/*`, `kopia/*`), żadna chroniona. Sesja agenta nie ma uprawnień administracyjnych do włączenia ochrony (brak narzędzia w MCP; wymaga roli admin repozytorium).

**Dokładne działanie właściciela (Settings → Branches → Add branch ruleset / protection rule dla `main`):**
1. Require a pull request before merging (min. 1 approval; dismiss stale approvals on new commits).
2. Require status checks to pass before merging — wymagane checki (nazwy jobów): `pytest` (Python tests), `frontend` (Frontend checks), `V12K Extended Invariant Guards` (P0 Extended Guards), `SLD Guards (Python)` i `SLD Contract Tests (Vitest)` (SLD Determinism), `Docs Integrity Guard`, `Architectural And Repo Hygiene Guard`, `Physics Label Guard`, `full-real-backend-e2e` (Frontend E2E full) oraz smoke e2e; „Require branches to be up to date before merging".
3. Require conversation resolution before merging.
4. Block force pushes; block deletions; „Do not allow bypassing the above settings" (dotyczy także administratorów).
5. Opcjonalnie: require linear history.
Do czasu wykonania: każdy merge do `main` bez zielonego kompletu bramek jest naruszeniem kontraktu (§36) — odnotowane jako P0 w §H.

## C. Determinizm numeryczny (§35)
- Polityka: `docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md` §C.5. Kod: `backend/src/application/analyses/kontrakt_liczb.py` (tryb ścisły: NaN/±inf/complex → `KontraktNiefinitowyError` ze ścieżką pola).
- Dowód: `tests/application/analyses/lv_domain/test_kwantyzacja_kontraktu.py` — fixtury × ±1 ULP (18 fixtur), własności, klasa równoważności 1e-12 vs 1e-8, porządek kluczy/list, niezależność od skali jednostki, `int`/`bool` nietknięte; pakiet `lv_domain` zielony lokalnie (wynik w §F). 18/18 fixtur nN: 0 wartości niefinitowych.

## D. Definition of Done — program (§40)

| # | Kryterium | Stan | Dowód / wycinek |
|---|---|---|---|
| 1 | Project posiada jeden Canonical Twin | NIE — ENM per `case_id` | CV-1 |
| 2 | ENM nie jest kopiowany per StudyCase | NIE | CV-1 |
| 3 | Assets mają stabilną tożsamość | CZĘŚCIOWO — `ref_id` stabilne; tłumaczenia uuid5 w 4 przestrzeniach | CV-4 (T-4) |
| 4 | Terminal/connectivity model jest fundamentem | NIE — `Port*` metadane bez egzekwowania | CV-5 (T-2) |
| 5 | Phase model nie blokuje ABCN ani earth-fault | NIE — brak faz, N/PEN/PE | CV-5 (F-1, F-2) |
| 6 | Grounding jest first-class | NIE — 6 reprezentacji, fizyka nie czyta | CV-5 (F-3) |
| 7 | Revision / Variation / Scenario / StudyCase rozdzielone | NIE — 6 modeli scenariusza, 4 delty in-memory | CV-3 |
| 8 | EffectiveSnapshot immutable i reprodukowalny | CZĘŚCIOWO — `CanonicalRun.snapshot` zamrożony, bez scenariusza | CV-3 |
| 9 | Topology derived | CZĘŚCIOWO — union-find w Ybus; 20 implementacji | CV-4 |
| 10 | Jeden canonical computational boundary | NIE — 10 builderów PF / 7 SC | CV-4 |
| 11 | `network_model` nie konkuruje z ENM | NIE — legacy ORM `network_*` żywy (wizard, XLSX) | CV-4 (procedura kasacji) |
| 12 | Solver input ma pełny provenance | CZĘŚCIOWO — `input_hash`, `snapshot_hash`; pola stałe w `build_analysis_run_reproducibility` | CV-2 |
| 13 | ResultSet posiada RevisionEnvelope | NIE | CV-2 |
| 14 | Protection settings — jedno ownership | NIE — nastawy per case i w modelu | po CV-5 (ADR-022) |
| 15 | SLD jest projekcją tego samego stanu | CZĘŚCIOWO — nN 3.0.0 tak; SN: klient liczy topologię | CV-4 → SLD |
| 16 | SN i nN bez konkurencyjnych modeli | CZĘŚCIOWO — jeden graf; nN miało równoległą prawdę (A1-08) | CV-5 |
| 17 | White Box odtwarza pełną drogę wyniku | CZĘŚCIOWO — ślady inline; `trace_v2` martwe | CV-4 |
| 18 | Reference Networks mają niezależne wyrocznie | CZĘŚCIOWO — 12 benchmarków IEEE/CIGRE (pandapower) tak; reszta REGRESSION_ONLY | rejestr §2 |
| 19 | CI wiarygodne | W TOKU — @ e6f11de7/ee0ec472: Docs, Physics Label, Arch/Hygiene, E2E smoke, SLD Determinism zielone (5/9); pytest zielony (krok guardów → CI-A); Frontend checks tylko tsconfig gate (→ CI-B); P0 (→ CI-A); E2E full (→ CI-D) | §A |
| 20 | Main chroniony lub jednoznaczne owner action | OWNER ACTION zapisane | §B |
| 21 | G01 przechodzi end-to-end | NIE — G01 nie istnieje jako jedna sieć | CV-6 |
| 22 | Future Capability Review potwierdza fundament | TAK (projektowo) — 16 decyzji, 4 z warunkiem | `docs/architecture/DECISION_FREEZE_REGISTER.md` |
| 23 | Brak równoległych trwałych subsystemów legacy | NIE — inwentarz w `CANONICAL_TWIN_ARCHITECTURE.md` §B.2, `CANONICAL_TWIN_ARCHITECTURE.md` §C.2.3 | CV-1…CV-4 |
| 24 | Każda usunięta ścieżka ma guard przeciw wskrzeszeniu | CZĘŚCIOWO — `legacy_public_path_guard`, `verification_phantom_paths_guard` istnieją | per wycinek |

## E. Karty w toku (delegowane; model wykonawczy: `AGENTS.md` §8)
| Karta | Zakres | Wykonawca | Stan |
|---|---|---|---|
| CI-A | `solver_input_substitute_guard` 11 naruszeń u źródła | agent (worktree) | w toku |
| CI-B | tsconfig gate 658 → ≤ 531, wyciszenia 39 → ≤ 35 | agent (worktree) | w toku |
| CI-C | SLD `vertical_length_probe` z dowodem semantycznym | agent (worktree) | **odebrana** (`ee0ec472`), CI zielone |
| CI-D | 12 czerwonych speców e2e (pre-existing od #472) | agent (worktree) | w toku |
| FAB-A | fikcyjny katalog przekaźników → profile referencyjne (D-33) | agent (worktree) | w toku |
| FAB-B | fantom nastaw `SldDetailDrawer` → dane z modelu / uczciwy stan zerowy | agent (worktree) | **odebrana** (`021423bf`): 3 bloki (DER 6 fikcyjnych progów ANSI, pole 5 wierszy, aparat 3 nastawy) → `ElementProtectionFunctionsPanel` na tej samej ścieżce danych co widok zabezpieczeń (`useProtectionAssignment` → `GET /enm/protection-view`); 6 testów klasy (pozytywne + negatywne bez liczb z jednostkami); 72/72; guardy zielone |
| CV-1-G | guard `enm_store_key_guard` (klucz przypadku w API/aplikacji = naruszenie; zapadka mierzona) + krok CI | agent (główny checkout, bez commitu) | w toku |
| FAB-C | ta sama klasa w tym samym pliku (znalezisko FAB-B): zakładka `cable_run` — zaszyte `XRUHKXS 1×120`, `120 mm²`, `270 A`, `PN-HD 620 S2` → dane z ENM przez kontrakt `cableRunSpec` | agent (worktree) | w toku |
| PERF-0 | baseline wydajności B1–B10 na sieciach rejestru (S: G02/G03/G08, M: G13/G00; L brak) — pomiar albo NIEMIERZALNE z powodem | agent (główny checkout, bez commitu) | w toku |
| CV-1-W | przepięcie 21 konsumentów magazynu na klucz projektu (zależność FastAPI `KluczTwin`, 404 dla przypadku spoza bazy, archiwum per projekt, testy I-3 na HTTP) | agent (worktree) | w toku |

## F. Dowody inżynierskie (testy, wyrocznie, przebiegi) — uzupełniane po każdym wycinku
- 2026-09-04: `pytest tests/application/analyses/lv_domain/` — komplet zielony po wdrożeniu trybu ścisłego (liczby w commicie).
- 2026-09-04: `tests/ci/test_guardy_z_ci.py` 4 passed; `snapshotStore.successToast.test.ts` 8 passed; guardy: `success_toast`, `claude_md_struktura`, `docs_guard`, `docs_archive_guard` zielone.
- 2026-09-04: CV-1 rdzeń (`9667235a`): `tests/invariants` + `tests/enm` + magazyn 1682 passed; `tests/api` + `station_templates` + `project_archive` 1086 passed po zmianie klucza magazynu (semantyka klucza surowego w testach niezmieniona).
- 2026-09-04: rejestr sieci wzorcowych w kodzie (`0c506744`): `tests/golden/test_registry.py` 14 passed (budowniczowie G02/G03/G04/G05/G07/G08/G13/G00/B-BENCH wykonalni; tabela generowana aktualna; zapadka pokrycia rodzin).
- 2026-09-04: SLD acceptance `npm run accept:sld-v3` RC=0 lokalnie (410 PASS) i w CI @ ee0ec472.
- 2026-09-04: snapshot OpenAPI (`0cb1c8d0`): 319 ścieżek, 227 schematów; test aktualności i determinizmu 2 passed — kontrakt HTTP jest odtąd diffowalny (M0-6).

## G. Ustalenia adwersaryjne (§38) — po każdej granicy
| Data | Granica | Próba obalenia | Wynik |
|---|---|---|---|
| — | — | — | brak przeglądów (pierwszy po CV-1) |

## H. Pozostałe P0/P1 (tylko realne)
| ID | Ryzyko | Klasa | Działanie |
|---|---|---|---|
| P0-1 | `main` bez ochrony; merge #472 z czerwonym CI (P0/vitest/pytest maskowane przez środowisko) | governance | owner action §B |
| P0-2 | ENM per `case_id` — kopia sieci per przypadek | architektura | CV-1 |
| P0-3 | fabrykacje użytkowe: fikcyjny katalog, fantom nastaw, `c_factor=1.0` domyślne w torze legacy | zaufanie | FAB-A/B; kasacja toru legacy (CV-4) |
| P0-4 | 12 czerwonych e2e na `main` od #472 | regresja produktu | CI-D |
| P1-1 | 4 rejestry biegów, 5 sposobów uruchomienia | spójność | CV-3.3 |
| P1-2 | uziemienie: 6 reprezentacji, fizyka nie czyta żadnej | fizyka doziemna | CV-5 |
| P1-3 | 12 benchmarków IEEE/CIGRE/IEC + `oze_pv_bess` istnieją tylko w dialekcie słownikowym P9 (nie walidują się jako ENM) — jedyna niezależna wyrocznia LF/SC liczy się poza torem kanonicznym | spójność / dowodowość | CV-4 (benchmarki jako ENM przez assembler; zapadka `BENCHMARK_DICT_ZASTANE`) |
| P1-4 | substrat 52 stacji (G00): 21 BLOCKER walidatora, budowa ≈ 40 s — sieć skali nieobliczalna | wydajność / rejestr | CV-4/CV-6 (naprawa u źródła; zapadka `BLOKERY_ZASTANE`) |

## I. Decyzje właściciela (tylko nierozstrzygalne z repo/norm/danych)
| ID | Pytanie | Dlaczego nie da się rozstrzygnąć samodzielnie |
|---|---|---|
| OD-1 | Ochrona `main` (§B) | wymaga uprawnień administratora |
| OD-2 | Czy istnieją projekty użytkowników w legacy ORM `network_*` (XLSX/wizard) wymagające eksportu przed kasacją (D-03 krok 3) | dane produkcyjne poza repozytorium |
| OD-3 | Publikowane wyrocznie dla G01 (sieć kompensowana): wskazanie źródła literaturowego/normowego akceptowanego przez właściciela jako `PUBLISHED_BENCHMARK` | wybór źródła normatywnego/literaturowego jest decyzją właściciela produktu |

## J. Następny vertical slice
**CV-1 — Project owns ENM** (`docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md` §2): magazyn per projekt, fasada `case_id → project_id`, migracja per-case ENM → warianty, guard przeciw zapisowi kluczem przypadku, inwarianty I-1…I-4 w `tests/invariants/`.
