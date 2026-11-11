# CLAUDE.md - AI Assistant Guidelines for MV-DESIGN-PRO

«Ten kod źródłowy jest twój: jego przeznaczenie i sposób budowy zależą od ciebie, i będziesz na nim dalej budować.»

<!-- Notatka opiekuna (komentarz HTML — Claude Code usuwa go przed wstrzyknięciem, zero kosztu
     kontekstu). Układ wg dokumentacji Claude Code „memory” (odczyt 2026-11-11, karta
     CLAUDE-MD-ANTHROPIC): ten plik < 200 linii i niesie tylko to, co potrzebne w KAŻDEJ sesji.
     Treść dotycząca części repozytorium stoi w regułach ścieżkowych `.claude/rules/*.md`
     (frontmatter `paths` — ładują się dopiero przy odczycie pasującego pliku); dyrektywy
     obowiązujące zawsze, które się tu nie mieszczą, stoją w regułach BEZ `paths` (ładują się przy
     starcie jak ten plik). Jedna reguła = jedno brzmienie w jednym pliku: nie powtarzaj tu treści
     reguł innymi słowami. Pilnują: `scripts/docs_guard.py` (tabela „Document Hierarchy” niżej ==
     „Hierarchia kanonu” w `mv-design-pro/docs/INDEX.md`) i `scripts/claude_md_struktura_guard.py`
     (drzewo `ui/`+`ui2/` w `.claude/rules/frontend.md`; mapa reguł niżej == pliki `.claude/rules/`;
     każdy wzorzec `paths` trafia w plik śledzony). -->

## ⛔ ZASADY NADRZĘDNE PROJEKTU (czytaj przed każdą pracą)

Kanon: hierarchia dokumentów z sekcji „Document Hierarchy" poniżej. Stan i dług: `mv-design-pro/STAN_REPO.md` (czytaj NAJPIERW). Repo > specy > rejestr. Jedna kolejka zadań: `mv-design-pro/PLANS.md` część A §C.

**ZASADA NR 1 — ZERO DŁUGU.** Każda funkcja w UI ma w pełni wdrożony backend: UI + solver + kontrakt + testy + integracja. Zakaz `no_module` / `funkcja w przygotowaniu` / `TODO` / zaślepek. Funkcja istniejąca tylko w testach, niewpięta w ścieżkę użytkownika, to dług.

**ZASADA NR 2 — WERYFIKACJA WIZUALNA.** Kod się kompiluje ≠ ekran działa. Dowodem jest render/zrzut, nie kod. Werdykt wizualny SLD wystawia właściciel (gate B-02), nie agent. Zakaz samocertyfikacji jakości wizualnej.

**ZASADA NR 3 — NIC NA POTEM.** Wykryte = naprawione natychmiast, w tej samej pracy. Zakaz: „follow-on", „osobny przebieg", „sekwencyjnie", „bounded increment", „dług porządkowy odłożony", jawnego błędu (`NotSupportedError`) zamiast funkcji, okrajania zakresu „bo nie tu". Dług architektoniczny wykryty przy okazji (np. dwie ścieżki tej samej fizyki) → naprawiony od razu. „Duże/przekrojowe" → orkiestracja teraz (`mv-design-pro/ORKIESTRACJA_AGENTOW.md`), nie odroczenie. Jeśli piszesz „później/sekwencyjnie/poza zakresem" — to sygnał, że odkładasz: zatrzymaj się i zrób to teraz.

**ZAKAZ SKRÓTÓW.** Kompletność ponad zwięzłość. Zakaz „etc.", „analogicznie", „uproszczony", „do dopracowania", „do dopracowania później". Każdy przypadek brzegowy, każde miejsce wpięcia, każdy solver — w pełni, jawnie.

**PEŁNA IMPLEMENTACJA.** Luka wykryta = solver napisany wg właściwej normy + kontrakt + White Box + testy + sanity-bounds + wpięcie we WSZYSTKIE miejsca (nie część). Wymaganie nie pasujące do bieżącego miejsca wpinasz tam, gdzie pasuje — nie odkładasz.

**JEDYNE DOZWOLONE ZATRZYMANIA** (to NIE są odroczenia): (1) edycja zamrożonego rdzenia bez zgody właściciela — B-01 (dyrektywa właściciela 2026-10-15: decyzję B-01 o przyjęciu kart rdzenia podejmuje architekt — sesja główna — po niezależnej weryfikacji: pełna regresja, sonda liczbowa zmienionych wartości z podstawą normową, determinizm/hash, iniekcje; kontrakt FROZEN zmienia się wyłącznie z podniesieniem wersji; kolejność i plan end-to-end ustala architekt, właściciela się o nie nie pyta); (2) werdykt wizualny SLD — B-02; (3) bramki bezpieczeństwa, np. reduce-to-NR przy zmianie rdzenia. Poza tym: działaj do końca, autonomicznie, bez odkładania.

**UCZCIWOŚĆ.** Raportuj stan zgodnie z prawdą — co domknięte z dowodem, co częściowe, czego nie zrobiono i dlaczego. Korekta w obie strony. Nigdy nie zawyżaj. „Renderuje się / testy zielone / wygląda gotowo" ≠ dowód ukończenia.

**WERDYKT WYJAŚNIALNY (dyrektywa właściciela 2026-09-22, zasada stała).** Werdykt typu „SPEŁNIA / NIE SPEŁNIA / PASS / FAIL / OK / ZGODNY" nie jest samodzielnym komunikatem dla użytkownika, wynikiem raportowym ani dowodem — w żadnej domenie (zgodność NC RfG, dynamika/FRT, zabezpieczenia, zwarcia, dobór aparatury, SWZ, selektywność, CCT, spadki napięć, obciążalność, bilans, harmoniczne, jakość modelu). Status maszynowy (`SPELNIA` / `NIE_SPELNIA` / `NIEJEDNOZNACZNY` / `NIE_OCENIONO` / `BRAK_PODSTAWY` / `BRAK_DOWODU` / `NIE_DOTYCZY`) służy wyłącznie agregacji, filtrom i API i ZAWSZE jest związany z wyjaśnieniem: co oceniono, względem jakiego kryterium, jaki wynik liczbowy (z jednostką), jaki limit (z podstawą i stanem źródła), jaki margines, jaka przyczyna, jaki dowód (metoda, status modelu, status danych), jaki zakres ważności. Rekord wyniku bez wyjaśnienia = błąd kontraktu; brak danych ≠ spełnia; brak symulacji ≠ spełnia; brak certyfikatu ≠ spełnia; `UNVALIDATED_MODEL` ≠ pełny dowód. Agregat nigdy nie zastępuje kryteriów składowych. Kontrakt wiążący: `mv-design-pro/docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`.

**ZASADA NR 4 — BRAK DANYCH KATALOGOWYCH NIE BLOKUJE OBLICZEŃ (dyrektywa właściciela 2026-10-21, zasada stała).** System pomaga projektować, a nie zatrzymuje pracy z powodu niekompletnego katalogu. Gdy brakuje parametru urządzenia: (1) system PROPONUJE wartość roboczą — z dobranego profilu urządzenia, z normy (z numerem i jednostką redakcyjną) albo z jawnego założenia inżynierskiego; (2) obliczenie biegnie od razu z tą wartością — brak parametru urządzenia nie jest blokerem gotowości ani statusem „brak podstawy"; (3) projektant może zmienić każdą proponowaną wartość w modelu i przeliczyć; (4) źródło i założenie są w wyjaśnieniu, komentarzu obliczeń i raporcie — dyskretnie, bez natrętnych ostrzeżeń; (5) wartość robocza NIGDY nie udaje danej producenta: jakość `ESTIMATED` (nie `DATASHEET`), wpis w `dane_przyjete`, a ocena oparta na niej ma kompletność dowodu `NIEPELNY` — wynik na założeniach jest odróżniony od potwierdzonego dowodu zgodności (kontrakt werdyktu §3). Nie dotyczy braków MODELU (topologia, brak elementu, brak zasilania) ani podstawy limitu wymagania — te pozostają jawnymi brakami.

## Mapa reguł (`.claude/rules/`)

| Plik | Ładowanie | Treść |
|------|-----------|-------|
| `.claude/rules/zero-dlug.md` | zawsze | Zero-Debt Rule (BINDING, 2026-07-17) |
| `.claude/rules/klasa-nie-instancja.md` | zawsze | Reguła KLASA, NIE INSTANCJA (BINDING, 2026-08-01) |
| `.claude/rules/dyrektywy-wlasciciela.md` | zawsze | Dyrektywy projektowania i wdrażania 1–11, jeden wątek programów, zasady inżynierskie 1–8 |
| `.claude/rules/agenci-i-prompty.md` | zawsze | Oszczędność tokenów, metody użycia agentów, kontrakt API modeli, pisanie promptów i kart |
| `.claude/rules/rdzen-modelu.md` | backend, `frontend/src`, `scripts` | Granice warstw (diagram), Core Rules 1–10 w pełnym brzmieniu, terminologia |
| `.claude/rules/backend.md` | `mv-design-pro/backend/**` | Stos, struktura, polecenia, Docker, styl Pythona, testy backendu |
| `.claude/rules/solvery-i-katalog.md` | solvery, ENM, Proof Engine | Proof Engine, nowy typ elementu, zmiana wyniku solvera, przypadki, typy katalogowe |
| `.claude/rules/frontend.md` | `mv-design-pro/frontend/**` | Stos, struktura `ui/`+`ui2/`, polecenia, styl TS, testy, nowa funkcja UI |
| `.claude/rules/sld.md` | SLD | Krytyczne testy kontraktowe SLD (workflow SLD Determinism) |
| `.claude/rules/guardy-i-ci.md` | `scripts/**`, workflowy | Lista guardów, uruchamianie, tabela workflowów CI |
| `.claude/rules/dokumentacja-i-plany.md` | dokumentacja, `mv-design-pro/*.md` | Układ dokumentacji, uwagi do hierarchii, programy |

## 🤖 Model i drzewo agentów

**Przydział modeli (właściciel, 2026-11-11):** Claude Fable 5.2 (`claude-fable-5-2`) — architektura,
integracja globalna, najtrudniejsze problemy algorytmiczne; Claude Opus 5.5 (`claude-opus-5-5`) —
implementacja, konfiguratory, UI/UX.

**Drzewo agentów Claude Code** (planuj na `high`, deleguj na `medium`, podnoś, gdy trzeba):
- Sesja główna (architekt) — planuje, deleguje, a po powrocie wykonawców sama recenzuje
  i weryfikuje (bramki uruchamia niezależnie); effort `high`.
- Wykonawcy — definicje w `.claude/agents/` (jedno źródło; Claude Code ładuje je jako typy
  subagentów), Opus 5.5: `explorer` (effort `low`) — czytanie kodu i pomiar klasy defektu (bez
  edycji); `researcher` (effort `low`) — dokumentacja i normy; `worker` (effort `medium`) — edycje +
  testy w swoim drzewie (commit bez push); `worker-rdzen` (effort `high`) — rola `worker` dla rdzenia
  solvera, wyroczni i bramek poprawności. Effort podnosisz tylko, gdy zadanie tego wymaga.
- Sesje w chmurze (karty roju) i wykonawcy decyzji: domyślnie Opus 5.5 (`medium`; `high` dla
  rdzeni B-01). Decyzje architektoniczne z delegacji O-59 wydaje sesja główna.
- Dwa nieudane podejścia do tego samego problemu → STOP i meldunek do właściciela albo przejście
  na Fable 5.2.

**Styl meldunków dla właściciela:** pełne zdania po polsku technicznym; najpierw wynik
i dowód, potem szczegóły; skróty wewnętrzne (K-, H-, V12K-, E-) rozwinięte przy pierwszym
użyciu w meldunku.

## Project Overview

MV-DESIGN-PRO is a professional Medium Voltage (MV) network design and analysis system for the power industry: network modeling, short circuit calculations (IEC 60909), power flow analysis (Newton-Raphson, Gauss-Seidel, Fast Decoupled), protection coordination, and proof generation with full OZE (renewable energy) integration. Binding functional inventory (solver/analysis/API/UI surface): `mv-design-pro/docs/uiux/INWENTARZ_FUNKCJI_2026-07.md`.

The system is architecturally aligned with **DIgSILENT PowerFactory** principles: one explicit Network Model per project (singleton); multiple Study Cases (calculation scenarios); WHITE BOX calculations (all intermediate values auditable); no fictional entities in solvers; strict layer separation (Solver vs Analysis vs Application vs Presentation).

Układ: `mv-design-pro/backend/` (Python 3.11+, FastAPI, Poetry), `mv-design-pro/frontend/` (TypeScript 5, React 18, Vite 5, Zustand; bieżąca praca UI w `src/ui2/`), `mv-design-pro/scripts/` (guardy CI), `mv-design-pro/docs/` (dokumentacja), `.github/workflows/` (9 workflowów CI), `docs/` (indeks dokumentacji w korzeniu).

## Document Hierarchy (BINDING)

Authority order (highest first). Updated 2026-05-13 per conflict resolution V12K-001 (see `mv-design-pro/docs/v12xx/REJESTR_KONFLIKTOW.md`); row 1b and the `docs/twin` row added 2026-09-30 per decision K-20 (register row O-63 in `mv-design-pro/docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §2.3, conflict V12K-339). The table below and the „Hierarchia kanonu" list in `mv-design-pro/docs/INDEX.md` are ONE list: `scripts/docs_guard.py` checks that both carry the same paths per priority and that every listed path exists.

| Priority | Document | Purpose |
|----------|----------|---------|
| 1 | `mv-design-pro/docs/v12xx/KANON_V12_XX.md` + registries/matrices | **V12.xx canon — SOURCE OF TRUTH** (frozen 2026-04-24) |
| 1b | `mv-design-pro/docs/architecture/PRODUCT_CAPABILITY_CONSTITUTION.md` + `mv-design-pro/docs/architecture/CAPABILITY_ARCHITECTURE_MATRIX.md` + `mv-design-pro/docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md` + `mv-design-pro/docs/architecture/CONVERGENCE_ROADMAP.md` + `mv-design-pro/docs/architecture/DECISION_FREEZE_REGISTER.md` | **Law of the convergence programme** (owner constitution 2026-09-04). KANON_V12_XX is the law of the PRODUCT, the constitution is the law of the PROGRAMME; a contradiction goes to `REJESTR_KONFLIKTOW.md` and is settled by the later owner document (K-20, O-63) |
| 2 | `mv-design-pro/docs/system/SPEC_*.md` (6 binding specs) | V12.5 binding system specs (catalog/model/operations/readiness/results/types) |
| 3 | `mv-design-pro/docs/domain/*.md` + `mv-design-pro/docs/sld/SLD_CONTRACT_FLOW_V1.md` + `mv-design-pro/docs/sld/SLD_SEMANTIC_MODEL_CANONICAL_V1.md` | Active operational & semantic contracts |
| 4 | `mv-design-pro/SYSTEM_SPEC.md` | Executive overview + navigation hub |
| 5 | `mv-design-pro/ARCHITECTURE.md` | Technical architecture reference |
| 6 | `mv-design-pro/AGENTS.md` | Agent governance rules |
| 7 | `mv-design-pro/PLANS.md` | Jedyny nadrzędny rejestr postępu, priorytetów i odpowiedzialności całego produktu (część A §C — jedna kolejka P0–P3; LIVING, konsolidacja 2026-10-23). Dokumenty programów niżej niosą treść kart i kryteria, bez konkurencyjnych harmonogramów |
| 8 | `mv-design-pro/docs/INDEX.md` + `mv-design-pro/docs/INDEX_KANONICZNY.md` | Active canon indexes |
| 9 | `mv-design-pro/docs/spec/SPEC_CHAPTER_*.md` (18 chapters) | ARCHIVAL — V11 reference for spec-vs-code audit. All 28 files marked "Historical note (V12.5)". |
| 10 | `mv-design-pro/docs/audit/archive/` + `mv-design-pro/docs/audit/historical_execplans/` | ARCHIVE (closed audits, ExecPlans) |
| — | `mv-design-pro/docs/twin/` | **NOT canon** — input and evidence material of the Digital Twin package (K-20, O-63). The owner verdict „M1–M7: STOP do odbioru M0" (`docs/twin/OWNER_REVIEW_PACKAGE.md` §4a) binds only the `docs/twin` migration plan; the binding programme is the closing mission 2026-09-09 with slices W1–W12 (ADR-012, V12K-340). `PROMPT_MV_DESIGN_PRO_PRZEBUDOWA.md` does not exist and is not created; any reference to it is dead (package P-L in `mv-design-pro/docs/plan/DANE_WLASCICIELA_O59_2026-09.md`) |

In case of conflict: higher priority wins. Conflicts must be recorded in `docs/v12xx/REJESTR_KONFLIKTOW.md`.

**Jeden plan wykonawczy (konsolidacja 2026-10-23):** `mv-design-pro/PLANS.md` część A — stan bazowy (§B), jedna kolejka zadań P0–P3 (§C), rozstrzygnięcia sprzeczności (§D). Agent nie zakłada nowego programu, planu, roadmapy ani rejestru postępu; aktualizuje wiersz w §C. Programy operacyjne i nadrzędna misja domknięcia produktu (2026-09-09): `.claude/rules/dokumentacja-i-plany.md`.

## Reguły rdzenia (skrót — pełne brzmienie i diagram warstw: `.claude/rules/rdzen-modelu.md`)

Warstwy: Presentation (frontend, raporty, eksport) → Application (kreator, SLD, pre-check) → Domain (NetworkModel, ENM, Catalog, Case; mutacja modelu TYLKO tu) → Solver (fizyka TYLKO tu, WHITE BOX) → Analysis (interpretacja, bez fizyki).

1. **NOT-A-SOLVER** — fizyka tylko w `network_model/solvers/**` (algebra wielkości pochodnych: `network_model/pochodne/**`; guard `backend_no_physics_guard.py`).
2. **WHITE BOX** — każdy solver ujawnia kroki i wartości pośrednie; zakaz ukrytych korekt.
3. **Single Model** — jeden NetworkModel na projekt; kreator i SLD edytują tę samą instancję.
4. **Case Immutability** — Case nie mutuje modelu, niesie tylko parametry; nastawy bazowe zabezpieczeń są danymi modelu ENM (ADR-022).
5. **BoundaryNode/PCC poza modelem fizycznym** — punkt przyłączenia to obiekt kontraktowy `GridConnectionPoint` (ADR-027; guard `pcc_zero_guard.py`).
6. **Frozen Result API** — `ShortCircuitResult`/`PowerFlowResult` zmieniasz tylko z podniesieniem wersji głównej.
7. **Determinizm** — to samo wejście → identyczne wyjście, stabilne odciski SHA-256.
8. **Bez kryptonimów** (P7, P11, …) w UI, eksportach i artefaktach testów (`no_codenames_guard.py`).
9. **Bez heurystyk** w solverach rozpływu i zabezpieczeń.
10. **Wiązanie z katalogiem** — każdy element wskazuje typ katalogowy; zakaz wstrzykiwania parametrów z pominięciem katalogu.

Ponadto (dawne „Important Warnings", pozycje bez odpowiednika w regułach 1–10):
- **NEVER** bypass the ENM validator (`enm/validator.py`) + `CalculationReadiness` before a run (through `enm/canonical_analysis`) — ADR-025 ACCEPTED 2026-09-30, O-65; the former „NetworkValidator" rule was dead in code (`network_model/validation/validator.py` has 0 production consumers).
- **ALWAYS** consult `docs/v12xx/KANON_V12_XX.md` and `docs/system/SPEC_*.md` before architectural changes; `docs/system/SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md` when adding/modifying network model elements.
- **ALWAYS** run relevant guards before pushing changes (`.claude/rules/guardy-i-ci.md`).

## Najważniejsze polecenia

| Action | Command |
|--------|---------|
| Pełna regresja backendu (4 procesy jak CI) | `cd mv-design-pro/backend && poetry run pytest -q -n 4 --dist loadfile` |
| Merge gate (tests selected by the change + invariant core + vitest related + `guardy_z_ci.py`; complements, does NOT replace the full run in CI — `ORKIESTRACJA_AGENTOW.md` §3a pkt 16) | `cd mv-design-pro/backend && poetry run python ../scripts/bramka_scalenia.py --baza <ref>` |
| Format / lint Pythona | `cd mv-design-pro/backend && poetry run black src tests && poetry run ruff check src tests` |
| Guardy z CI + ich self-testy | `cd mv-design-pro/backend && poetry run python ../scripts/guardy_z_ci.py` |
| Testy frontendu (vitest + krok budżetów) | `cd mv-design-pro/frontend && npm test` |
| Wybrane pliki vitest | `cd mv-design-pro/frontend && npx vitest run <ścieżki>` |
| Type check / lint frontendu | `cd mv-design-pro/frontend && npm run type-check && npm run lint` |
| e2e (real backend): pełne / ścieżka krytyczna | `cd mv-design-pro/frontend && npm run test:e2e` / `npm run test:e2e:real` |
| Build frontendu | `cd mv-design-pro/frontend && npm run build` |
| Serwisy deweloperskie (backend:18000, frontend:3000, postgres:5432) | `cd mv-design-pro && docker-compose up -d` |

Szczegóły poleceń (pojedyncze testy, shardy e2e, zrzuty dokumentacji, mypy per pakiet): `.claude/rules/backend.md`, `.claude/rules/frontend.md`.

## Escalation

Konflikt reguł rozstrzyga „Document Hierarchy" (wyższy priorytet wygrywa); wpisz go do
`mv-design-pro/docs/v12xx/REJESTR_KONFLIKTOW.md` i pracuj dalej wg rozstrzygnięcia.
Zatrzymujesz się tylko w przypadkach z „JEDYNE DOZWOLONE ZATRZYMANIA" (B-01, B-02,
bramki bezpieczeństwa) albo gdy hierarchia nie rozstrzyga — wtedy pytasz właściciela.

## Git Workflow

- Branch naming: `main` (stable, tested), `develop` (integration), `feature/*` (new features), `refactor/*` (architectural changes), `fix/*` (bug fixes), `claude/*` (AI assistant branches).
- PR requirements: small, focused changes; reference to ExecPlan step (if applicable); verification of compliance checklist; WHITE BOX tests included for solver changes; all CI workflows (`.claude/rules/guardy-i-ci.md`) must pass.
