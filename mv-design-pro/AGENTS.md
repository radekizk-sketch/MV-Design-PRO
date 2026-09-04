# MV-DESIGN-PRO Agent Governance

**Version:** 4.3
**Status:** CANONICAL & BINDING
**Authority:** docs/v12xx/KANON_V12_XX.md > docs/system/ > docs/domain/+docs/sld/contracts > SYSTEM_SPEC.md > ARCHITECTURE.md > AGENTS.md > PLANS.md > docs/INDEX.md > docs/spec/ (ARCHIVAL)
**Updated:** 2026-09-04 (profil modelu: GPT-6 Astra)

---

## 0. GPT-6 Astra Operating Standard

Use these rules for agent behavior. They do not weaken any domain, solver, proof, or architecture rule below.

### 0.1 Prompting and Autonomy

- Work from explicit outcomes, success criteria, constraints, and verification needs.
- Avoid heavy process scripts and "think step by step" instructions; GPT-6 Astra performs better with clear goals and room to choose the route.
- Keep responses concise and direct by default. Expand only for architecture, solver, proof, safety, or audit-sensitive reasoning.
- Gather enough context to act, then stop searching. Continue discovery only when a required fact, file, contract, or test result is missing.
- Bias toward implementing requested changes after reading the relevant code. Ask only when local context cannot resolve a material ambiguity.

### 0.2 Reasoning, Tools, and Verification

- Match reasoning effort to task difficulty: low for simple edits, medium for normal implementation, high for complex debugging/architecture, xhigh for very hard asynchronous work or evals, max when correctness outweighs cost. `none` is not supported on GPT-6 Astra.
- Batch independent file reads/searches where tooling supports parallel calls.
- Prefer `apply_patch` for manual edits and project-native tools for formatting, tests, and guards.
- Preserve user changes. Do not revert unrelated dirty-worktree edits.
- Use tests and guards as evals: choose the smallest meaningful set that exercises the changed behavior, and report any verification gap.

### 0.3 OpenAI/API Work

- For OpenAI API or agent integrations, prefer the Responses API for reasoning, tool-calling, and multi-turn workflows.
- Use Structured Outputs instead of prompt-only JSON schemas when an API contract is required.
- Put stable instructions before dynamic task context to improve prompt caching.
- For current model behavior, pricing, API parameters, regulations, dependencies, or time-sensitive facts, verify against current sources and cite exact dates.
- Do not add the current date to prompts or docs unless the task is time-sensitive.

### 0.4 Język i kodowanie

- W dokumentacji projektu, etykietach interfejsu, komunikatach i nowych komentarzach używaj polskiego języka technicznego.
- Angielski zostawiaj tylko dla nazw własnych standardów, bibliotek, API, typów kodowych, ścieżek i identyfikatorów programu.
- Każdy widoczny błąd kodowania, w tym typowe pozostałości po błędnym odczycie UTF-8, jest błędem do naprawy w dotykanym zakresie.
- Nie zostawiaj w interfejsie ani dokumentacji mieszanki językowej, jeżeli nie wynika ona z nazwy własnej albo kontraktu kodowego.

### 0.5 Zasady inżynierskie (dyrektywa właściciela)

1. Nie dbaj o kompatybilność wsteczną. Co przestarzałe, to usuń na amen – bez warstw kompatybilności, bez migracji, bez fallbacków.
2. Wybierz najprostszą implementację, która spełnia bieżące potrzeby. Zero prewencyjnych abstrakcji, zero zbędnych warstw konfiguracyjnych.
3. Dziel system na warstwy, ale stopniowo. Najpierw uruchom minimalną wersję end-to-end, potem dodawaj. Nigdy nie rozwalaj działającej rzeczy dla niedokończonej złożoności.
4. Trzymaj komponenty modułowe, separuj odpowiedzialności.
5. Stawiaj na dojrzałe, utrzymywane biblioteki. Bez konkretnego powodu nie przepisuj od zera.
6. Najpierw sprawdź, co potrafią istniejące zależności w projekcie, zanim zaczniesz dodawać nowe pakiety czy pisać własne. Nie zakładaj z góry, że w bibliotekach niczego nie ma.
7. Podejmuj decyzje architektoniczne z myślą o przyszłości. Nie akceptuj prowizorek w stylu „na razie tak, potem zmienimy".
8. Sprawdź, jak dojrzałe produkty rozwiązują ten sam problem – korzystaj z zweryfikowanych wzorców, nie wymyślaj koła na nowo.

## 1. Document Hierarchy

| Document | Purpose | Authority |
|----------|---------|-----------|
| **[`docs/v12xx/KANON_V12_XX.md`](docs/v12xx/KANON_V12_XX.md)** | V12.xx canon (frozen 2026-04-24) | SOURCE OF TRUTH |
| **[`docs/v12xx/REJESTR_KONFLIKTOW.md`](docs/v12xx/REJESTR_KONFLIKTOW.md)** | Active conflict registry (V12K-*) | BINDING |
| **[`docs/system/SPEC_*.md`](docs/system/)** | 6 binding system specs (catalog/model/operations/readiness/results/types) | BINDING |
| **[`docs/domain/`](docs/domain/), [`docs/sld/SLD_CONTRACT_FLOW_V1.md`](docs/sld/SLD_CONTRACT_FLOW_V1.md), [`docs/sld/SLD_INDUSTRIAL_SPEC_v1.md`](docs/sld/SLD_INDUSTRIAL_SPEC_v1.md)** | Active operational & semantic contracts | BINDING |
| **[`SYSTEM_SPEC.md`](SYSTEM_SPEC.md)** | Executive overview + navigation hub | BINDING (executive) |
| **[`ARCHITECTURE.md`](ARCHITECTURE.md)** | Technical architecture reference | BINDING |
| **[`AGENTS.md`](AGENTS.md)** | Agent governance rules (this file) | BINDING |
| **[`PLANS.md`](PLANS.md)** | Operational status & next steps | LIVING |
| **[`docs/INDEX.md`](docs/INDEX.md)** + **[`INDEX_KANONICZNY.md`](docs/INDEX_KANONICZNY.md)** | Active canon indexes | REFERENCE |
| **[`docs/spec/SPEC_CHAPTER_*.md`](docs/spec/)** (18 chapters) | V11 reference — all 28 files carry "Historical note (V12.5)" disclaimer | ARCHIVAL |
| **[`docs/audit/archive/`](docs/audit/archive/) + [`historical_execplans/`](docs/audit/historical_execplans/)** | Closed audits & ExecPlans | ARCHIVE |

In case of conflict: higher priority wins. Record any conflict in `docs/v12xx/REJESTR_KONFLIKTOW.md` (V12K-* entries). For architecture changes, consult `docs/v12xx/KANON_V12_XX.md` and `docs/system/` first.

---

## 2. Immutable Rules

### 2.0 Standard projektowania stacji

Przy pracy nad GPZ, rozdzielnią SN, stacjami SN/nN, odgałęzieniami, zabezpieczeniami, kartami obiektów i SLD stosuj
[`docs/sld/STACJE_ELEKTROENERGETYCZNE_PROJECT_STANDARD.md`](docs/sld/STACJE_ELEKTROENERGETYCZNE_PROJECT_STANDARD.md).

- Traktuj każdą stację jako funkcjonalny układ elektroenergetyczny: tor zasilania, tor transformatora, sekcje szyn, pola, aparaturę, uziemienie, zabezpieczenia, sterowanie, sygnalizację i wyprowadzone odcinki sieci.
- Nie rysuj dekoracyjnej ani atrapowej aparatury. Każdy widoczny element schematu musi wynikać z danych domeny, katalogu, pola stacji, aparatu albo jawnego stanu brakujących danych.
- Obowiązująca sekwencja budowy to `GPZ -> pole SN -> magistrala SN -> odcinek/stacja/odgałęzienie -> transformator/odbiór/OZE/BESS -> obliczenia serwerowe -> nakładka wyników i dowód obliczeń`.
- Warstwa prezentacji wysyła wyłącznie dane wejściowe. Wartości obliczone pochodzą z solverów i wyników serwerowych.
- Główne karty użytkownika są kartami inżynierskimi. Surowe identyfikatory, skróty haszy i referencje wewnętrzne mogą występować tylko w zwiniętej diagnostyce.

### 2.1 NOT-A-SOLVER Rule

Only dedicated solvers compute physics. Everything else is forbidden from physics:

| Component | Layer | Physics Allowed |
|-----------|-------|----------------|
| IEC 60909 Short Circuit | Solver | YES |
| Newton-Raphson Power Flow | Solver | YES |
| Protection Engine v1 | Domain (interpretation) | NO — consumes SC results read-only |
| Proof Engine | Interpretation | NO |
| Wizard | Application | NO |
| SLD | Application | NO |
| Frontend/Reporting | Presentation | NO |
| Validation | Application | NO |

### 2.2 WHITE BOX Rule

All solvers MUST:
- Expose every intermediate value (Y-bus, Z-thevenin, Jacobian)
- Provide full calculation trace
- Enable manual numerical audit
- Document all assumptions

FORBIDDEN: black-box solvers, hidden corrections, undocumented simplifications.

### 2.3 Single Model Rule

- ONE NetworkModel per project (singleton)
- Wizard and SLD edit THE SAME model instance
- No shadow models, no duplicate data stores

### 2.4 Case Immutability Rule

- Case CANNOT mutate NetworkModel
- Case stores ONLY calculation parameters (configuration)
- Multiple Cases reference one Model (read-only view)
- Model change invalidates ALL case results

### 2.5 BoundaryNode Prohibition Rule

- BoundaryNode is NOT in NetworkModel (it is interpretation, not physics)
- BoundaryNode belongs ONLY in Analysis/Interpretation layer (BoundaryIdentifier)

### 2.6 Frozen Result API Rule

- ShortCircuitResult and PowerFlowResult APIs are FROZEN
- Changes require major version bump
- Proof Engine reads results READ-ONLY

### 2.7 Determinism Rule

- Same input MUST produce identical output
- Solver results, proof documents, exports must be deterministic
- SHA-256 fingerprints must be stable

---

## 3. Layer Boundaries

```
PRESENTATION ─── Frontend, Reports, Export (NO physics, NO model mutation)
     │
APPLICATION ──── Wizard, SLD, Validation (NO physics)
     │
DOMAIN ────────── NetworkModel, Catalog, Case (model mutation HERE ONLY)
     │
SOLVER ────────── IEC 60909, Newton-Raphson (PHYSICS HERE ONLY, WHITE BOX)
     │
INTERPRETATION ── Analysis, Proof Engine, Boundary (INTERPRETATION ONLY)
```

Cross-layer violations are architectural regressions requiring immediate fix.

---

## 4. Execution Protocol

### 4.1 Before Implementation

1. Read SYSTEM_SPEC.md
2. Check PLANS.md for current priorities
3. Verify no layer boundary violations
4. Verify no frozen API modifications

### 4.2 During Implementation

1. Preserve frozen Result APIs
2. Maintain deterministic behavior
3. Keep WHITE BOX traceability
4. Do not add BoundaryNode to NetworkModel
5. Do not add physics to non-solver layers
6. Do not create shadow data models

### 4.3 After Implementation

1. Update PLANS.md with completed work
2. Run full test suite (backend + frontend)
3. Verify WHITE BOX trace integrity
4. Create focused, small PRs

---

## 5. Prohibited Actions

### 5.1 NEVER

- Add BoundaryNode/boundary concepts to NetworkModel
- Add physics calculations to non-solver components
- Create black-box calculations
- Modify frozen Result APIs without version bump
- Create shadow/duplicate data models
- Bypass NetworkValidator before solver execution
- Use project codenames (P7, P11, P14, etc.) in UI-visible strings
- Create "basic UI" and "advanced UI" as separate interfaces

### 5.2 ALWAYS

- Maintain WHITE BOX traceability in solvers
- Preserve deterministic behavior
- Use Polish labels in UI
- Use IEC/PN-EN normative terminology
- Test solver changes with numerical audit
- Update PLANS.md after completing work

---

## 6. AI Agent Instructions

### 6.1 Context Loading

Before any implementation:
1. Read SYSTEM_SPEC.md (executive overview + navigation to spec chapters)
2. Consult relevant `docs/spec/SPEC_CHAPTER_*.md` for detailed contracts
3. Read ARCHITECTURE.md (layer details)
4. Read PLANS.md (current status)
5. Check relevant code before proposing changes

### 6.2 Behavioral Rules

1. Do not invent scope beyond the request or the active plan
2. Do not add features not requested
3. Prefer "no change" for architecture-sensitive ambiguity until the relevant spec is checked
4. Reference SYSTEM_SPEC.md and docs/spec/ for architectural questions
5. Preserve all existing functionality (no regressions)
6. Follow existing code patterns and conventions
7. State acceptance criteria before broad implementation work
8. Verify with targeted tests, guards, type checks, or builds before finalizing
9. If verification cannot run, record the exact blocker

### 6.3 Protection Rules (BINDING)

1. Protection is AnalysisType `PROTECTION` — separate from SC in execution pipeline
2. Protection READS SC results (read-only) — NEVER modifies solver or SC ResultSet v1
3. Current source is EXPLICIT user selection (`TEST_POINTS` or `SC_RESULT`) — no auto-mapping
4. Ambiguous mapping → deterministic error + FixAction candidates — no fallback
5. Coordination pairs are EXPLICIT (upstream + downstream relay IDs) — no auto-detection
6. Coordination produces numerical margins ONLY — no OK/FAIL verdicts
7. All Protection results are deterministic (hash + permutation invariant)
8. See [`docs/analysis/PROTECTION_CANONICAL_ARCHITECTURE.md`](docs/analysis/PROTECTION_CANONICAL_ARCHITECTURE.md)

### 6.4 Proof Engine Rules (BINDING)

1. Take definitions, JSON schemas, LaTeX equations LITERALLY
2. Do NOT modify solvers or Result API
3. Use mapping keys literally in implementation
4. Maintain determinism: same run_id = identical proof output
5. Proof step format: Formula > Data > Substitution > Result > Unit Check
6. LaTeX block format ONLY: `$$...$$` (no inline `$...$`)
7. I_dyn and I_th are MANDATORY in every SC3F proof

---

## 7. Escalation

If any rule conflict is detected:
1. STOP implementation
2. Document conflict in PLANS.md
3. Request architectural review
4. Do not proceed until resolved

---

**END OF AGENT GOVERNANCE**

## 8. Model operacyjny programu konwergencji MAX PLATFORM (dyrektywa właściciela, 2026-09-04)

Kontrakt nadrzędny: „MV-DESIGN-PRO — MAX PLATFORM ARCHITECTURE & CONVERGENCE CONTRACT" (§0–§43).
Dokumenty kanoniczne programu (konstytucja 2026-09-04 §39): `docs/architecture/PRODUCT_CAPABILITY_CONSTITUTION.md`,
`docs/architecture/CAPABILITY_ARCHITECTURE_MATRIX.md`, `docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md`,
`docs/architecture/CONVERGENCE_ROADMAP.md`, `docs/architecture/DECISION_FREEZE_REGISTER.md`,
`docs/reference-networks/REFERENCE_NETWORK_REGISTRY.md`, `docs/evidence/CONVERGENCE_EVIDENCE.md`.
Te same decyzje nie są kopiowane do innych dokumentów — inne dokumenty wskazują źródło kanoniczne.

### 8.1 Role (BINDING)
1. **Fable = Lead Principal Power Systems Engineer + Chief Domain Architect + Autonomous
   Engineering Orchestrator + Adversarial System Reviewer.** Wyłącznie Fable: wizja produktu,
   każda decyzja architektoniczna (granice, modele, kontrakty, zamrożenia i ich ponowne otwarcie),
   rozstrzygnięcia §0 w kartach, integracja wyników wykonawców, konflikty, dowód końcowy,
   Definition of Done, raport §42, decyzje do właściciela.
2. **Tanie agenty (wykonawcy) = zadania proste i mechaniczne** z jednoznacznymi rozstrzygnięciami
   §0 od Fable: naprawy zapadek, migracje mechaniczne, regeneracje fixtur skryptami, inwentarze,
   reprodukcje czerwonych testów, dokumentacja pochodna. Wykonawca NIE tworzy konkurencyjnej
   architektury, nie zmienia granic, nie dodaje trzeciej implementacji, nie decyduje o zakresie —
   niejasność zgłasza w raporcie, nie rozstrzyga sam.
3. Zadania oznaczone „tylko dla Fable / opcja MAX" (audyty jakościowe, projekt granic,
   przegląd adwersaryjny, `DECISION_FREEZE_REGISTER.md`) Fable wykonuje osobiście.

### 8.2 Przepływ pracy karty
Karta (Fable) = kontekst zmierzony (plik:linia, liczby BEFORE) + §0 rozstrzygnięcia + zakres +
zakazy + komendy weryfikacyjne + format raportu (surowe dane). Wykonawca pracuje w osobnym git
worktree, robi commit BEZ push, raportuje SHA, liczby BEFORE/AFTER, komendy z kodami wyjścia i
listę „czego nie zrobiono i dlaczego". Fable weryfikuje niezależnie (uruchamia testy i guardy
sam), cherry-pickuje, uruchamia pełne potwierdzenia i pushuje. Karta bez pomiaru = karta
nieodebrana.

### 8.3 Reguły niezmienne programu
- Zero-Debt i „KLASA, NIE INSTANCJA" (sekcje wyżej) obowiązują każdego wykonawcę.
- Zakaz: green-by-skip, ślepego podnoszenia progów, aktualizacji goldenów bez dowodu
  semantycznego, kasowania testu „bo przeszkadza", permanentnych dual-write i warstw zgodności.
- Kasacja wyłącznie procedurą: inventory → consumer search → data export → parity → cutover →
  post-cutover observation → removal → guard przeciw wskrzeszeniu.
- Po każdej istotnej granicy: niezależny przegląd adwersaryjny („spróbuj obalić"), wynik do
  `docs/evidence/CONVERGENCE_EVIDENCE.md` §G; granica FROZEN dopiero po dowodzie implementacji,
  wyroczni inżynierskiej, `DECISION_FREEZE_REGISTER.md`, przeglądzie adwersaryjnym i bramce CI.
- Bramki właścicielskie B-01 (fizyka rdzeni solverów) i B-02 (ocena SLD na rzeczywistych
  arkuszach) pozostają osobne; agent nie wystawia werdyktu wizualnego.
- Raport końcowy każdej fazy w formacie §42 (A–J): stan faktyczny, werdykt architektoniczny,
  wpływ na kopertę zdolności, wdrożone, skasowane legacy z parity, dowody, ustalenia
  adwersaryjne, pozostałe P0/P1, decyzje właściciela, następny vertical slice.
