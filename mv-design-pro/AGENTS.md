# MV-DESIGN-PRO Agent Governance

**Version:** 4.1
**Status:** CANONICAL & BINDING
**Authority:** docs/spec/ > SYSTEM_SPEC.md > ARCHITECTURE.md > AGENTS.md > PLANS.md
**Updated:** 2026-04-30 for GPT-5.5-oriented Codex workflows

---

## 0. GPT-5.5 Operating Standard

Use these rules for agent behavior. They do not weaken any domain, solver, proof, or architecture rule below.

### 0.1 Prompting and Autonomy

- Work from explicit outcomes, success criteria, constraints, and verification needs.
- Avoid heavy process scripts and "think step by step" instructions; GPT-5.5 performs better with clear goals and room to choose the route.
- Keep responses concise and direct by default. Expand only for architecture, solver, proof, safety, or audit-sensitive reasoning.
- Gather enough context to act, then stop searching. Continue discovery only when a required fact, file, contract, or test result is missing.
- Bias toward implementing requested changes after reading the relevant code. Ask only when local context cannot resolve a material ambiguity.

### 0.2 Reasoning, Tools, and Verification

- Match reasoning effort to task difficulty: low for simple edits, medium for normal implementation, high for complex debugging/architecture, xhigh only for very hard asynchronous work or evals.
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

## 1. Document Hierarchy

| Document | Purpose | Authority |
|----------|---------|-----------|
| **[`docs/spec/`](docs/spec/)** | Detailed specification (18 chapters) | SOURCE OF TRUTH |
| **[`docs/spec/AUDIT_SPEC_VS_CODE.md`](docs/spec/AUDIT_SPEC_VS_CODE.md)** | Spec-vs-code gap analysis + decision matrix | BINDING |
| **[`SYSTEM_SPEC.md`](SYSTEM_SPEC.md)** | Executive overview + navigation hub | BINDING |
| **[`ARCHITECTURE.md`](ARCHITECTURE.md)** | Technical architecture reference | BINDING |
| **[`AGENTS.md`](AGENTS.md)** | Agent governance rules (this file) | BINDING |
| **[`PLANS.md`](PLANS.md)** | Operational status & next steps | LIVING |

In case of conflict: `docs/spec/` wins (it is the most detailed and authoritative). SYSTEM_SPEC.md summarizes the spec chapters. No other document overrides the above.

---

## 2. Immutable Rules

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
