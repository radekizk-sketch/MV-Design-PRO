# MV-DESIGN-PRO — CONVERGENCE ROADMAP (kolejność migracji sterowana dowodami + stan i kontynuacja)

**Status:** KANONICZNY, ŻYWY (konstytucja §31, §40, §41). Zastępuje §7 dawnego `CANONICAL_DIGITAL_TWIN.md` i §7 dawnego `REVISION_SCENARIO_EXECUTION_MODEL.md`; plan M0–M7 z `../twin/MV_DESIGN_PRO_MIGRATION_PLAN.md` (FAZA F) jest materiałem wejściowym — obowiązuje ten dokument. Architektura: `CANONICAL_TWIN_ARCHITECTURE.md`. Dowody: `../evidence/CONVERGENCE_EVIDENCE.md`.

## 0. Zasady migracji (konstytucja §31)
Bez big-bang. Każda migrowana odpowiedzialność: CURRENT RUNTIME INVENTORY → CANONICAL OWNER → ONE COMPLETE VERTICAL PATH → PARITY / ENGINEERING EVIDENCE → CONSUMER MIGRATION → DELETE OBSOLETE PATH → GUARD AGAINST RESURRECTION. Bez trwałego dual-write, bez ukrytego fallbacku legacy. Kasacja wyłącznie procedurą siedmiu kroków (inventory → consumer search → data export → parity → cutover → post-cutover observation → removal). Miara migracji nie jest ilościowa (LOC, liczba dokumentów) — kryterium to jedna prawda, pełna fizyka, traceability, brak pracy ręcznej między modułami, zdolność do dowolnej realnej sieci SN+nN.

## 1. STAN I KONTYNUACJA (konstytucja §41 — punkt wejścia każdej przyszłej sesji)

| Pozycja | Stan (2026-09-04) |
|---|---|
| Gałąź / HEAD | `claude/mv-design-pro-twin-audit-u4lhy0`; `main` = `7e84753a` (#473); pełna historia i pomiary w `../evidence/CONVERGENCE_EVIDENCE.md` |
| Decyzje przyjęte | `DECISION_FREEZE_REGISTER.md` (DT-1…DT-16, status per decyzja) |
| Odrzucone alternatywy | tamże, kolumna „Odrzucone alternatywy" |
| Rzeczywisty runtime | ENM per `case_id` (fasada) → CV-1 w toku (rdzeń `9667235a`; przepięcie konsumentów: karta CV-1-W); tor kanoniczny biegów `execution_runs` → `canonical_analysis` (P1/S1); legacy ORM `network_*` żywy dla XLSX/wizard; 4 rejestry biegów; 6 modeli scenariusza |
| Aktywna granica migracji | **CV-1 Project owns ENM** (rdzeń wdrożony; wiring konsumentów + guard klucza + przegląd adwersaryjny w toku) |
| Dowody uzyskane | `../evidence/CONVERGENCE_EVIDENCE.md` §A (CI), §C (determinizm), §F (testy), rejestr sieci (`../reference-networks/REGISTRY_TABLE.md`) |
| Otwarte blokery | CI: karty CI-A (guard podstawień), CI-B (tsconfig), CI-D (12 e2e od #472); `main` bez ochrony (owner action) |
| Nierozstrzygnięte decyzje właściciela | `../evidence/CONVERGENCE_EVIDENCE.md` §I (OD-1 ochrona `main`, OD-2 projekty w legacy ORM, OD-3 wyrocznie G01) |
| Dokładny następny wycinek | CV-1 domknięcie (wiring + guard + adwersaryjny) → CV-2 (`ModelRevision` + `RevisionEnvelope`) — §2 |
| Stan CI (2026-09-05) | **9/9 zielone** na `ef9d6790` (7 workflowów) + `e2a0dc17` (E2E full 408 speców, E2E smoke; path-filtered, ta sama treść kodu) — pierwszy w pełni zielony szczyt gałęzi; `main` (7e84753a) nadal czerwony na E2E full i SLD Determinism od #472. Odebrane karty CV-0: CI-A/B/C/D, FAB-A/B/C, PERF-0, CV-1-G; własna naprawa klasy `KLUCZE_ROZPLYWU` (1e9f21c5). W toku: CV-1-W, FAB-D1/D2/E/F, SLD-LOC (SUB-52s wykonana, wstrzymana do SLD-LOC). Dowody: `../evidence/CONVERGENCE_EVIDENCE.md` §A/§E/§F |

## 2. Wycinki konwergencji CV-0…CV-6 (kolejność wiążąca; każdy = vertical strangler)

| Wycinek | Zakres | Parity evidence | Guard przeciw wskrzeszeniu | DoD §40 |
|---|---|---|---|---|
| **CV-0 Trust foundation** | CI 8/9 → 9/9 zielone na gałęzi; polityka determinizmu (`CANONICAL_TWIN_ARCHITECTURE.md` §C.5); ochrona `main` lub owner action; fabrykacje (FAB-A/B); rejestr sieci wzorcowych; inwarianty | wyniki CI, guardy, testy | `verification_phantom_paths_guard` (istnieje), `guardy_z_ci` | 18, 19, 20 |
| **CV-1 Project owns ENM** | magazyn per projekt, fasada case→project, migracja per-case ENM → rewizja/warianty | hash ENM projektu = hash ENM aktywnego przypadku; wszystkie e2e na fasadzie zielone | guard: zapis magazynu kluczem `case_id` = czerwony | 1, 2 |
| **CV-2 Rewizje i envelope** | `ModelRevision` z dziennika (bez limitu 500, checkpointy), `checkout(rev)`; `RevisionEnvelope` na `CanonicalRun`; świeżość z envelope; `catalog_revision_set`, `assumptions_revision` | `checkout(rev_n)` odtwarza `hash_sha256` rewizji n dla wszystkich sieci rejestru | guard: bieg bez envelope = czerwony | 12, 13 |
| **CV-3 Scenariusze** | jeden `OperatingScenario`, jedna funkcja `apply_scenario` → `EffectiveNetworkSnapshot`; migracja N-1/hosting/pq_area/odpowiedz_osd/FaultScenario; kasacja C2/C3/C4/C5 | wyniki N-1 i hosting bit-identyczne przed/po | guard: `copy.deepcopy(snapshot)` poza `apply_scenario` = czerwony | 7, 8 |
| **CV-4 Granica obliczeniowa** | jeden assembler ES → TV → IR → kontrakt; kasacja P2–P12/S2–S7 i własnego NR; `TopologyService` jedna implementacja; legacy ORM procedurą | 12 benchmarków IEEE/CIGRE + rejestr sieci: wyniki identyczne (tolerancja zadeklarowana) | guard: konstrukcja `PowerFlowInput(`/`ShortCircuitInput(` poza assemblerem = czerwony; `backend_no_physics_guard` | 9, 10, 11, 12 |
| **CV-5 Terminale, fazy, uziemienie** | T-2, F-1…F-4; walidator; migracja `meta.field_specs` → `Bay` | scena SLD i projekcja nN identyczne; Z0 identyczne | `meta_field_specs_resurrection_guard`; walidator terminali | 3, 4, 5, 6 |
| **CV-6 G01 vertical slice** | sieć G01 (§31) zbudowana komendami domenowymi; pełny łańcuch EDIT → … → REPORT; analiza doziemna kompensowana; PV; nN ABCN/SWZ w zakresie gotowym | wyrocznie z rejestru (analityczne + benchmark) | test e2e G01 jako bramka CI | 21 |
| dalej | ownership zabezpieczeń (14), SLD jako projekcja (15), SN/nN bez równoległych modeli (16), White Box (17), kasacje legacy (23, 24) | | | |

Każdy wycinek kończy się raportem w formacie §43 konstytucji (A–K) i wpisem w `../evidence/CONVERGENCE_EVIDENCE.md`; granica przechodzi w **FROZEN** dopiero po: dowodzie implementacji, wyroczni inżynierskiej, `DECISION_FREEZE_REGISTER.md`, przeglądzie adwersaryjnym i bramce CI (§39). Ponowne otwarcie wymaga dowodu defektu (inżynierskiego, numerycznego, spójności danych, niezdolności do zdolności z `PRODUCT_CAPABILITY_MODEL.md`, bezpieczeństwa, wydajności) albo nowego jawnego wymagania właściciela — preferencja architektoniczna nie jest dowodem.


## 3. Kroki CV-1 → CV-3 (parity, guardy)

| Krok | Działanie | Parity evidence | Guard |
|---|---|---|---|
| CV-1.1 | magazyn ENM kluczem `project_id`; fasada `case_id → project_id` w `api/enm.py` | wszystkie e2e i testy API zielone przez fasadę; hash ENM projektu = hash aktywnego przypadku | zapis kluczem `case_id` = czerwony |
| CV-1.2 | migracja danych: ENM przypadków ≠ aktywnego → `NetworkVariation` (diff komend) albo raport migracji | liczba przypadków z własnym ENM BEFORE/AFTER; 0 utraconych modeli (eksport ZIP) | — |
| CV-2.1 | **DONE** — `ModelRevision` PRZY MAGAZYNIE ENM (`enm/rewizje.py`): niezmienna migawka per rewizja `<digest>.rev/<n>.json.gz` (gzip `mtime=0`, kanoniczny JSON, adresowana hashem treści) + wpis dziennika z `hash_sha256`, `rodzic`, PEŁNYM ładunkiem komendy (`ZrodloZmiany.ladunek`); kolejność: dziennik (roboczy) → migawka (robocza) → HEAD → migawka → dziennik; HEAD autorytatywny; sierota (migawka > HEAD) usuwana przy wczytaniu, brakująca migawka/wpis bieżącej rewizji odtwarzane z HEAD z opisem nazywającym brak; `LIMIT_WPISOW` usunięty; `checkout(klucz, n)`; migracja klucza przypadku (CV-1) kopiuje dziennik i migawki pod klucz projektu (wcześniej historia lądowała w `legacy_przypadki/`); import archiwum daje migawkę + wpis „import" | `checkout(n).hash == revision[n].hash` dla całego rejestru sieci wzorcowych; dziennik zmian = projekcja rewizji (parity z dzisiejszym API dziennika) | bieg bez envelope = czerwony |
| CV-2.2 | **DONE (rdzeń)** — `RevisionEnvelope` (`enm/envelope.py`: `project_id`, `model_revision`, `snapshot_hash`, `catalog_fingerprint` z `network_model/catalog/odcisk.py`, `options_hash` = `input_hash`, `semantic_fingerprint`) na `CanonicalRun.envelope` (kolumna addytywna `envelope_json`, dokładana do istniejących baz); świeżość z koperty (`evaluate_envelope_freshness`, lista zmian z dziennika, przyczyna „katalog zmieniony"); H1/H2/H3 skasowane. **W toku (karta CV-2-W):** status przypadku liczony z biegów w API, kasacja pisarzy `ResultInvalidator`/`mark_*`/końcówek `invalidate*`, ładunek komendy w `api/enm.py`, ekran świeżości z listą zmian | wyniki biegów bit-identyczne przed/po (envelope nie zmienia fizyki) — golden nietknięte | `provenance_constant_guard`: literał wersji/katalogu w polu proweniencji = czerwony |
| CV-3.1 | `OperatingScenario` + `apply_scenario`; migracja C6 (trwały magazyn), D1–D4 | N-1, hosting, pq_area, odpowiedz_osd: wyniki bit-identyczne | `deepcopy(snapshot)` poza `apply_scenario` = czerwony |
| CV-3.2 | kasacja C2, C3, C4, C5 procedurą (inventory → consumer search → export → parity → cutover → observation → removal) | 0 importów, 0 tras, 0 testów wskazujących skasowane byty | `legacy_public_path_guard` rozszerzony o skasowane nazwy |
| CV-3.3 | E2/E3 kasacja; E4 do orkiestratora; R2/R3/R4 kasacja | 1 rejestr biegów; porównania i zabezpieczenia czytają R1 | guard: `analysis_runs`/`study_runs` w kodzie = czerwony |

## 4. Kolejność dalsza (po CV-3)
CV-4 (jeden assembler, `TopologyService`, kasacja P2–P12/S2–S7 i dialektu benchmarków, legacy ORM procedurą) → CV-5 (terminale, fazy, uziemienie; `meta.field_specs` → `Bay`) → CV-6 (G01 end-to-end) → ownership zabezpieczeń (ADR-022, `ProtectionCapabilityRegistry`) → SLD jako projekcja TV (program SLD, B-02) → kasacje legacy z guardami → dokumentacja (archive-first, manifest supersesji).

## 5. Raportowanie
Po każdym wycinku: raport w formacie §43 konstytucji (A–K) i aktualizacja `../evidence/CONVERGENCE_EVIDENCE.md`; granica przechodzi w FROZEN w `DECISION_FREEZE_REGISTER.md` dopiero po dowodzie implementacji, wyroczni, przeglądzie future-capability, przeglądzie adwersaryjnym i bramce CI.
