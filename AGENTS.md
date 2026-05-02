# AGENTS.md - MV-DESIGN-PRO Codex Instructions

**Status:** Repository-level guidance
**Updated:** 2026-04-30
**OpenAI basis:** GPT-5.5 model, prompting, reasoning, eval, and Codex AGENTS.md guidance

This file is intentionally concise. Codex loads `AGENTS.md` files from the repository root down to the current working directory, with closer files taking precedence. Keep this root file below the default instruction budget and put detailed contracts in the canonical project documents.

When working inside `mv-design-pro/`, also follow `mv-design-pro/AGENTS.md`.

Przy pracy nad stacjami, GPZ, rozdzielnią SN, SLD, zabezpieczeniami i kartami obiektów obowiązuje standard projektowy:
`mv-design-pro/docs/sld/STACJE_ELEKTROENERGETYCZNE_PROJECT_STANDARD.md`.

Reguła języka i kodowania: dokumentacja projektu, etykiety interfejsu i komunikaty użytkownika mają być po polsku technicznym. Naprawiaj widoczne błędy kodowania w dotykanym zakresie, szczególnie typowe pozostałości po błędnym odczycie UTF-8.

## Authority

Project authority order, highest first:

1. `mv-design-pro/docs/spec/`
2. `mv-design-pro/docs/spec/AUDIT_SPEC_VS_CODE.md`
3. `mv-design-pro/SYSTEM_SPEC.md`
4. `mv-design-pro/ARCHITECTURE.md`
5. `mv-design-pro/AGENTS.md`
6. `mv-design-pro/POWERFACTORY_COMPLIANCE.md`
7. `mv-design-pro/PLANS.md`
8. `docs/INDEX.md`

If documents conflict, stop and follow the highest-authority document. For architecture changes, consult `docs/spec/` first.

## GPT-5.5 Operating Profile

- Treat `gpt-5.5` as the default frontier model for complex coding, reasoning, and professional work.
- Prefer clear outcomes, success criteria, constraints, and verification expectations over long step-by-step process instructions.
- Do not add "think step by step" style prompting. GPT-5.5 and reasoning models perform best when the task is well-defined and the process is not over-specified.
- Use concise, direct communication by default. Increase detail only for architecture, solver, safety, or audit-sensitive work.
- For API or agent integrations, prefer the Responses API for reasoning, tool-calling, and multi-turn workflows. Use Structured Outputs instead of prompt-only schemas where possible.
- Tune reasoning effort to the task: `low` for straightforward edits, `medium` for normal work, `high` for complex architecture/debugging, and `xhigh` only for very hard asynchronous tasks or evals.
- For time-sensitive facts, current APIs, pricing, regulations, dependencies, or OpenAI model behavior, verify against current sources and use exact dates.
- Do not restate the current date in prompts, docs, or code unless it materially affects the task.
- Optimize long prompts for caching: stable project rules first, task-specific context last.

## Agent Workflow

Before changing code:

1. Identify the active project area and read the nearest applicable `AGENTS.md`.
2. Read only the highest-value specs needed for the task.
3. Inspect the existing implementation before proposing or editing.
4. Make a short plan for non-trivial work, then execute.

During implementation:

- Keep changes narrowly scoped to the request and surrounding ownership boundary.
- Prefer existing project patterns over new abstractions.
- Use structured parsers and typed contracts instead of ad hoc string manipulation when reasonable.
- Preserve user changes in the working tree. Never revert unrelated edits.
- Use `apply_patch` for manual edits.
- Search with `rg` first when available; if unavailable, use the best native fallback.
- Batch independent file reads/searches in parallel when tooling supports it.
- Ask the user only when the answer cannot be discovered locally and a reasonable assumption would be risky.

After implementation:

- Run the narrowest meaningful tests, guards, type checks, or builds for the changed surface.
- If tests cannot be run, say exactly why.
- Summarize changed files, behavior, and verification in the final response.

## MV-DESIGN-PRO Architecture Rules

MV-DESIGN-PRO is a professional Medium Voltage network design and analysis system aligned with DIgSILENT PowerFactory principles:

- One explicit `NetworkModel` per project.
- Multiple immutable study cases.
- WHITE BOX solver calculations with auditable intermediate values.
- No fictional entities in solvers.
- Strict solver, analysis, application, domain, and presentation boundaries.

Layer boundaries:

- Presentation: frontend, reports, exports. No physics and no model mutation.
- Application: wizard, SLD, validation, orchestration. No physics.
- Domain: `NetworkModel`, ENM, catalog, cases. Model mutation is allowed here only.
- Solver: IEC 60909 short circuit and load-flow solvers. Physics here only, WHITE BOX required.
- Analysis/Interpretation: protection insight, boundary identification, recommendations, proof/report interpretation. No physics.

Immutable project rules:

- Only dedicated solvers in `mv-design-pro/backend/src/network_model/solvers/` compute physics.
- All solvers must expose calculation steps and intermediate values.
- One `NetworkModel` per project; no shadow models or duplicate stores.
- Study cases cannot mutate `NetworkModel`; they store calculation parameters only.
- `BoundaryNode` is analysis-layer interpretation, never a `NetworkModel` entity.
- `ShortCircuitResult` and `PowerFlowResult` APIs are frozen unless a major version change is explicitly approved.
- Same input must produce identical output; preserve deterministic fingerprints.
- Project codenames must never appear in UI-visible strings, exports, or test artifacts.
- Solvers must not apply undocumented heuristics, guesses, or hidden corrections.
- Network elements must bind through catalog types; do not bypass catalog governance.

## Technology Snapshot

Backend:

- Python 3.11+, FastAPI, Poetry.
- Core libraries: numpy, scipy, networkx, pydantic, pandas.
- Storage/services: PostgreSQL, MongoDB, Redis, Celery.
- Tests and quality: pytest, pytest-asyncio, pytest-cov, black line length 100, ruff, mypy strict.

Frontend:

- TypeScript 5, React 18, Vite 5.
- State/data/forms: Zustand, TanStack Query, react-hook-form, zod.
- Styling and rendering: Tailwind CSS, KaTeX, Recharts.
- Tests and quality: Vitest, Testing Library, Playwright, ESLint, strict `tsconfig`.
- Node.js >=18, CI uses Node 20.

## Common Commands

Backend:

```bash
cd mv-design-pro/backend
poetry install --with dev
poetry run pytest -q
poetry run ruff check src tests
poetry run black src tests
poetry run mypy src
poetry run uvicorn src.api.main:app --reload --port 8000
```

Frontend:

```bash
cd mv-design-pro/frontend
npm ci
npm test
npm run test:ci
npm run type-check
npm run lint
npm run build
npm run dev
```

Docker:

```bash
cd mv-design-pro
docker-compose up -d
docker-compose logs -f backend
docker-compose down
```

High-value guards:

```bash
cd mv-design-pro
python scripts/arch_guard.py
python scripts/pcc_zero_guard.py
python scripts/domain_no_guessing_guard.py
python scripts/solver_boundary_guard.py
python scripts/no_codenames_guard.py
python scripts/forbidden_ui_terms_guard.py
python scripts/catalog_binding_guard.py
python scripts/overlay_no_physics_guard.py
python scripts/load_flow_no_heuristics_guard.py
python scripts/protection_no_heuristics_guard.py
python scripts/sld_determinism_guards.py
python scripts/trace_determinism_guard.py
python scripts/resultset_v1_schema_guard.py
python scripts/docs_guard.py
```

## Task-Specific Guidance

Adding a network element:

1. Check `mv-design-pro/docs/spec/` and `SYSTEM_SPEC.md`.
2. Add domain model support in the correct domain/core location.
3. Update ENM and validation when applicable.
4. Add SLD mapping only after the domain contract is correct.
5. Add focused tests.

Changing solver behavior:

1. Stop and confirm the result API is not being changed.
2. Preserve WHITE BOX traceability and deterministic output.
3. Keep physics in the solver layer only.
4. Update proof/report mappings only as read-only interpretation.
5. Run numerical and determinism tests.

Changing frontend UI:

1. Review relevant UI contracts in `mv-design-pro/docs/ui/`.
2. Use Polish UI labels and normative IEC/PN-EN terminology.
3. Do not expose project codenames.
4. Do not place physics or model mutation in UI code.
5. Run focused Vitest/Playwright checks and UI guards.

Working with study cases:

- Cases store configuration only.
- Model changes invalidate all case results.
- Cloning a case creates a new case with no copied results.
- Only one case is active at a time.

Working with proof engine:

- Proof generation is interpretation over solver trace/result data.
- Do not modify solvers or frozen result APIs for proof output.
- Preserve deterministic proof artifacts.
- Use block LaTeX `$$...$$` for formulas.
- SC3F proofs must include `I_dyn` and `I_th`.

## Escalation

Stop implementation and ask for architectural review when:

- A requested change conflicts with `docs/spec/`.
- A frozen result API change appears necessary.
- A non-solver layer would need physics to satisfy the request.
- A `NetworkModel` change would introduce boundary, PCC, virtual, or aggregated entities.
- Deterministic behavior cannot be preserved.

## Git

- Do not run destructive git commands unless explicitly requested.
- Preserve unrelated user changes.
- Prefer small, focused commits and PRs.
- Branch naming in this environment should use `codex/` unless the user asks otherwise.
