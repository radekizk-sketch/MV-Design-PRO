> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# Rozdział 17 — Testy Systemowe, Weryfikacja, Odbiór Inżynierski (benchmark-GRADE)

**Wersja:** 1.0
**Status:** AS-IS + TO-BE (jawnie oznaczone)
**Warstwa:** Cross-cutting (Quality Assurance)
**Zależności:** Rozdział 6 (Solvery), 10 (Study Cases), 12 (Walidacje), 14 (Determinizm)
**Decision Matrix:** Decyzje #127–#133

---

## §17.0 Zakres i cel

### §17.0.1 Zasada nadrzędna

> **System MV-DESIGN-PRO stosuje wielowarstwową piramidę testową, w której każda warstwa pokrywa odrębny aspekt jakości: od poprawności numerycznej solverów (Unit), przez spójność warstw (Integration), po weryfikację scenariuszy użytkownika (E2E). Testy są deterministyczne, powtarzalne i zautomatyzowane w CI/CD. Żaden merge do `main` bez zielonego pipeline'u.**

- Testy weryfikują poprawność fizyczną (IEC 60909), determinizm (golden tests), spójność warstw (NOT-A-SOLVER), bezpieczeństwo UI (guard tests) i akceptowalność użytkownika (E2E).
- Każda zmiana w solverze wymaga aktualizacji golden testów.
- Testy NIE zawierają logiki obliczeniowej — są konsumentami wyników.

### §17.0.2 Parytet z benchmark / benchmark

| Aspekt | benchmark | benchmark | MV-DESIGN-PRO |
|--------|------|--------------|---------------|
| Testy jednostkowe solverów | Wewnętrzne (zamknięte) | Wewnętrzne (zamknięte) | ✓ Otwarte, audytowalne |
| Golden tests (regresja) | Partial (QA lab) | Partial (reference cases) | ✓ W repo, CI-enforced |
| Determinizm CI | ✗ | ✗ | ✓ Same input → same hash |
| Guard tests (UI compliance) | ✗ | ✗ | ✓ Codenames + alert bans |
| E2E browser tests | ✗ | ✗ | ✓ Playwright + Chromium |
| White Box w testach | ✗ | ✗ | ✓ Trace verification |

---

## §17.1 Architektura testów — piramida testowa

### §17.1.1 Piramida

```
                    ┌───────────┐
                    │   E2E     │  ← Playwright (3 specs) + Determinism (4 files)
                    │  Browser  │
                 ┌──┴───────────┴──┐
                 │  Integration    │  ← API (20+), DB (50+), Application (15+)
                 │  + API          │
              ┌──┴─────────────────┴──┐
              │     Unit Tests        │  ← Physics (1200+), Proof (80+), Analysis (40+)
              │   (Core + Domain)     │
           ┌──┴───────────────────────┴──┐
           │      Guard / Compliance     │  ← Codenames (2), Alert ban (1), Arch guard
           │         (CI Gates)          │
           └─────────────────────────────┘
```

### §17.1.2 Statystyki AS-IS

| Warstwa | Pliki testowe | Funkcje testowe | Lokalizacja |
|---------|---------------|-----------------|-------------|
| Unit (backend) | ~100 | ~1 200 | `backend/tests/test_*.py` |
| Integration (backend) | ~30 | ~300 | `backend/tests/api/`, `application/`, `infrastructure/` |
| E2E Determinism (backend) | 4 | ~40 | `backend/tests/e2e/` |
| Golden / Regresja | ~15 | ~80 | `backend/tests/proof_engine/`, `golden/` |
| Proof Engine | ~12 | ~80 | `backend/tests/proof_engine/` |
| CI Compliance (backend) | 1 | 2 | `backend/tests/ci/` |
| Vitest (frontend) | ~72 | ~400 | `frontend/src/**/__tests__/` |
| Playwright E2E | 3 | ~15 | `frontend/e2e/` |
| **RAZEM** | **~237** | **~2 117** | |

### §17.1.3 Zakazy

- **Z-TST-01:** Test NIE MOŻE zawierać logiki obliczeniowej (physics). Test jest KONSUMENTEM wyników solvera. ZAKAZANY.
- **Z-TST-02:** Test NIE MOŻE modyfikować golden files bez jawnego review. ZAKAZANY.
- **Z-TST-03:** Merge do `main` bez zielonego CI pipeline'u. ZAKAZANY.

---

## §17.2 Testy jednostkowe — Solver Physics (Unit)

### §17.2.1 Zakres

Testy jednostkowe weryfikują poprawność numeryczną izolowanych komponentów:

| Komponent | Plik testowy | Kluczowe testy |
|-----------|-------------|----------------|
| LineBranch impedancja | `test_branch.py` | Z = (r + jx) × L, tolerancja 1e-12 |
| TransformerBranch | `test_branch.py` | uk%, Pk, Zk — IEC 60076 |
| Y-bus matrix | `test_ybus.py` | Symetria, diagonal dominance, WHITE BOX |
| SC IEC 60909 | `test_short_circuit_iec60909.py` | Ik″, ip, Ith, Sk″ — 784 linii |
| PF Newton-Raphson | `test_power_flow_v2.py` | Convergence, V/δ, P/Q balance |
| PF Gauss-Seidel | `test_power_flow_gauss_seidel.py` | Convergence, porównanie z NR |
| PF Fast-Decoupled | `test_power_flow_fast_decoupled.py` | FDLF convergence |
| NetworkValidator | `test_network_validator.py` | 13 reguł grafowych |
| NetworkSnapshot | `test_network_snapshot.py` | Immutability guards |
| Graph topology | `test_graph.py` | Connectivity, paths, islands |

### §17.2.2 Wzorzec testu numerycznego

```python
# backend/tests/test_branch.py

class TestLineBranchImpedance:
    """T1: LineBranch — total impedance calculation."""

    def test_impedance_basic(self):
        """For r=0.2, x=0.4, L=10: Z == 2 + j4 exactly."""
        line = LineBranch(r_ohm_per_km=0.2, x_ohm_per_km=0.4, length_km=10.0)
        z = line.get_total_impedance()
        assert z.real == pytest.approx(2.0, abs=1e-12)
        assert z.imag == pytest.approx(4.0, abs=1e-12)
```

**Konwencje:**
- `pytest.approx(value, abs=1e-12)` dla porównań floating-point.
- Każdy test ma docstring z oczekiwanym wynikiem.
- Brak external dependencies (pure unit).

### §17.2.3 Parametryzacja solverów

```python
# backend/tests/e2e/test_pf_determinism_workflow.py

SOLVER_METHODS = [
    ("newton-raphson", solve_power_flow_physics),
    ("gauss-seidel", solve_power_flow_gauss_seidel),
    ("fast-decoupled", solve_power_flow_fast_decoupled),
]

@pytest.mark.parametrize("method_name,solver_func", SOLVER_METHODS)
def test_pf_determinism_same_input_same_output(method_name, solver_func):
    """Same input → 2× run → identical trace & JSON."""
    input1 = make_power_flow_input()
    result1 = solver_func(input1)
    result2 = solver_func(input1)
    trace1 = json.dumps(result1.trace, sort_keys=True)
    trace2 = json.dumps(result2.trace, sort_keys=True)
    assert trace1 == trace2
```

> **INV-TST-01:** Każdy solver (SC IEC 60909, PF NR, PF GS, PF FDLF) MUSI mieć dedykowany zestaw testów jednostkowych z referencyjnymi wartościami numerycznymi.

---

## §17.3 Testy integracyjne

### §17.3.1 Zakres

Testy integracyjne weryfikują współpracę między warstwami:

| Warstwa | Pliki | Wzorzec |
|---------|-------|---------|
| API endpoints | `tests/api/test_*.py` (20+ plików) | FastAPI TestClient + dependency override |
| Persistence | `tests/infrastructure/persistence/` | SQLite in-memory per test |
| Study Case lifecycle | `tests/application/study_case/` | CRUD, clone, invalidation |
| Designer engine | `tests/application/designer/` | Action state machine |
| Protection coordination | `tests/application/analyses/protection/` | Overcurrent, line settings |
| Catalog governance | `tests/network_model/catalog/` | `@pytest.mark.integration` |

### §17.3.2 Fixtures — łańcuch zależności

```python
# backend/tests/conftest.py — Global fixtures

@pytest.fixture()
def db_engine(tmp_path):
    """SQLAlchemy engine z SQLite (izolowany per test)."""
    db_path = tmp_path / "test.db"
    engine = create_engine_from_url(f"sqlite+pysqlite:///{db_path}")
    init_db(engine)
    yield engine
    engine.dispose()

@pytest.fixture()
def db_session_factory(db_engine):
    """Session factory powiązany z test db_engine."""
    return create_session_factory(db_engine)

@pytest.fixture()
def uow_factory(db_session_factory):
    """Unit of Work factory dla repository pattern."""
    return build_uow_factory(db_session_factory)
```

```python
# backend/tests/api/conftest.py — API fixtures

@pytest.fixture()
def app_client(uow_factory):
    """FastAPI TestClient z dependency injection override."""
    app.dependency_overrides[get_uow_factory] = lambda _: uow_factory
    app.state.uow_factory = uow_factory
    client = TestClient(app)
    yield client
    app.dependency_overrides.pop(get_uow_factory, None)
    client.close()
```

**Łańcuch:** `db_engine(tmp_path)` → `db_session_factory` → `uow_factory` → `app_client`

### §17.3.3 Marker integracyjny

```toml
# backend/pyproject.toml
[tool.pytest.ini_options]
markers = [
    "integration: tests requiring database/persistence",
]
```

AS-IS: `@pytest.mark.integration` stosowany w `catalog/test_governance.py`.

Uruchamianie:
- Tylko integracyjne: `poetry run pytest -m integration`
- Bez integracyjnych: `poetry run pytest -m "not integration"`

> **INV-TST-02:** Testy integracyjne MUSZĄ używać izolowanej bazy danych per test (SQLite `tmp_path`). Współdzielenie stanu DB między testami jest ZAKAZANE.

---

## §17.4 Testy E2E — Determinism Workflow

### §17.4.1 Backend E2E

| Plik | Zakres | Mechanizm |
|------|--------|-----------|
| `test_pf_determinism_workflow.py` | NR/GS/FDLF ×2 → identical trace | `json.dumps(sort_keys=True)` comparison |
| `test_pf_exports_deterministic.py` | PDF/DOCX/JSON export SHA-256 | `hashlib.sha256()` binary comparison |
| `test_protection_exports_deterministic.py` | Protection export hashing | SHA-256 per format |
| `test_reference_pattern_reports.py` | Reference pattern regression | Full report structure comparison |

### §17.4.2 Bariera determinizmu

| Bariera | Rozwiązanie | Status |
|---------|-------------|--------|
| Timestamps | Normalizacja do `FIXED_CREATED_AT` | ✓ AS-IS |
| UUIDs | Stałe `FIXED_DOC_ID`, `FIXED_ARTIFACT_ID` | ✓ AS-IS |
| Dict ordering | `json.dumps(sort_keys=True)` | ✓ AS-IS |
| Floating-point | `pytest.approx(value, abs=1e-12)` | ✓ AS-IS |
| PDF binary | `@pytest.mark.xfail` (content OK, binary nie) | ✓ AS-IS |

### §17.4.3 Frontend E2E (Playwright)

AS-IS: 3 spec files w `frontend/e2e/`:

| Spec | Scenariusz |
|------|-----------|
| `create-first-case.spec.ts` | Tworzenie pierwszego projektu i Case |
| `happy-path.spec.ts` | Projekt → Case → Snapshot → Run → SLD → Results → Proof |
| `wizard-full-flow.spec.ts` | Pełny wizard flow |

```typescript
// frontend/playwright.config.ts — kluczowe ustawienia

export default defineConfig({
  fullyParallel: false,              // Sekwencyjne (determinizm)
  workers: process.env.CI ? 1 : undefined,  // 1 worker w CI
  retries: process.env.CI ? 1 : 0,
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      contextOptions: { reducedMotion: 'reduce' },  // Determinizm animacji
    },
  }],
});
```

**Konwencje Playwright:**
- Selektory: wyłącznie `data-testid` (zero brittle CSS/class selectors).
- Waity: `waitForSelector` + state checks (zero `sleep(1000)`).
- Seed: `localStorage.setItem()` z fixture data.
- Język: polskie etykiety w asercjach UI.

> **INV-TST-03:** Testy E2E MUSZĄ być sekwencyjne (`fullyParallel: false`, `workers: 1` w CI). Równoległy dostęp do zasobów UI jest ZAKAZANY.

---

## §17.5 Golden Tests — Regresja numeryczna

### §17.5.1 Zasada golden test

> **Golden test porównuje kanoniczny output (JSON/LaTeX) z zatwierdzonym plikiem referencyjnym. Zmiana golden file wymaga jawnego review i commit.**

### §17.5.2 Implementacja AS-IS

```python
# backend/tests/proof_engine/test_sc_asymmetrical_golden.py

def _canonicalize_proof(proof) -> tuple[str, str]:
    """Normalizacja pól niedeterministycznych."""
    payload = proof.to_dict()
    payload["document_id"] = FIXED_DOC_ID
    payload["artifact_id"] = FIXED_ARTIFACT_ID
    payload["created_at"] = FIXED_CREATED_AT
    json_text = json.dumps(payload, sort_keys=True)
    tex_text = export_to_tex(proof)
    return json_text, tex_text

@pytest.mark.parametrize("case_key", ["1f_z", "2f", "2f_z"])
def test_sc1_proof_golden(case_key):
    json_text, tex_text = _generate_case(case_key)
    golden_path = GOLDEN_ROOT / f"sc_asymmetrical_{case_key}.json"
    expected = golden_path.read_text()
    assert json_text == expected, "Proof JSON changed — intentional?"
```

### §17.5.3 Golden Network (20-station SN)

AS-IS: `backend/tests/golden/golden_network_sn.py`, `tests/enm/golden_network_fixture.py`.

| Parametr | Wartość |
|----------|---------|
| Stacje | 20 |
| Transformatory HV/MV | 2 |
| Transformatory LV/MV | 20 |
| Linie | 31+ |
| Źródła OZE | 2 (PV + WIND) |
| Topologia | Ring + radial |
| Builder | Deterministyczny (same build → same structure) |

```python
# backend/tests/golden/test_golden_network_sn.py

def test_has_enough_nodes(self, stats):
    assert stats["wezly"] >= 40

def test_has_transformers(self, stats):
    assert stats["transformatory"] >= 22

def test_has_oze_sources(self, stats):
    assert stats["zrodla_oze"] >= 2
```

### §17.5.4 Workflow aktualizacji golden files

1. Zmiana w solverze → golden test FAIL.
2. Developer sprawdza diff (intentional change?).
3. Jeśli zmiana zamierzona: aktualizacja golden file + commit + review.
4. Jeśli zmiana niezamierzona: fix bug, golden test GREEN.

> **INV-TST-04:** Golden files MUSZĄ być wersjonowane w repozytorium. Aktualizacja golden file bez review jest ZAKAZANA.

---

## §17.6 Guard Tests — CI Compliance

### §17.6.1 Backend guard tests

AS-IS: `backend/tests/ci/test_user_visible_guards.py`

| Test | Reguła | Pattern |
|------|--------|---------|
| `test_no_alert_calls_in_frontend_source` | Zakaz `window.alert/confirm/prompt` w UI | `\b(?:window\.)?(?:alert\|confirm\|prompt)\s*\(` |
| `test_no_project_codenames_in_user_visible_proof_docs_and_ui` | Zakaz P7, P11, P14 w docs/proof + frontend/ui/proof | `\b[Pp](?!0\b)\d+\b` |

### §17.6.2 Frontend guard tests (Vitest)

AS-IS: `frontend/src/ui/__tests__/`:

| Test | Reguła |
|------|--------|
| `canon-codenames-global.test.ts` | Zakaz codenames w string literals (tsx/ts) |
| `canon-alert-ban.test.ts` | Zakaz alert/confirm/prompt |
| `canon-polish-labels.test.ts` | Polskie etykiety w UI |

### §17.6.3 Skrypt guard (Python)

AS-IS: `scripts/no_codenames_guard.py`

```python
# scripts/no_codenames_guard.py — fragment

SCAN_DIRS = ["frontend/src", "frontend/e2e"]
FILE_EXTENSIONS = {".ts", ".tsx", ".css", ".html"}
CODENAME_PATTERN = re.compile(r"\b[pP](?!0\b)\d+\b")

def find_codenames_in_strings(line: str) -> list[str]:
    """Find codenames inside string literals."""
    for string_match in STRING_LITERAL_PATTERN.finditer(line):
        for codename_match in CODENAME_PATTERN.finditer(string_match.group()):
            matches.append(codename_match.group())
    return matches
```

Wywołanie: `python scripts/no_codenames_guard.py` lub `npm run guard:codenames`.

### §17.6.4 Architectural guard

AS-IS: `scripts/arch_guard.py`

```python
FORBIDDEN_IMPORTS = {
    "solvers": ("analysis", "analysis.protection"),
    "analysis": ("solvers",),
    "analysis.protection": ("solvers",),
}
```

**Reguła:** Solvery ≠ Analysis (zakaz circular dependencies).

> **INV-TST-05:** Guard tests MUSZĄ być uruchamiane w CI na każdym push/PR. Pominięcie guard test w pipeline jest ZAKAZANE.

---

## §17.7 Frontend Tests — Vitest + Playwright

### §17.7.1 Vitest — konfiguracja

AS-IS: `frontend/vite.config.ts` (sekcja `test`):

| Parametr | Wartość | Cel |
|----------|---------|-----|
| `environment` | `jsdom` | Symulacja DOM |
| `globals` | `true` | Auto-import `describe`, `it`, `expect` |
| `setupFiles` | `./src/test/setup.ts` | Import `@testing-library/jest-dom/vitest` |
| `include` | `src/**/*.{test,spec}.{ts,tsx}` | Pattern discovery |
| `--no-file-parallelism` | CLI flag | Sekwencyjne uruchamianie (determinizm) |

### §17.7.2 Kategorie testów Vitest

| Kategoria | Lokalizacja | Przykłady |
|-----------|-------------|-----------|
| SLD Layout | `engine/sld-layout/__tests__/` | determinism, stationGeometry, voltage-bands |
| SLD Editor | `ui/sld-editor/__tests__/` | geometry, connectionRouting, copyPaste, deterministicId |
| UI Components | `ui/__tests__/` | app-state-store, selection-store, type-catalog, property-grid |
| Proof Inspector | `proof-inspector/__tests__/` | proof-inspector-utils |
| Validation | `ui/__tests__/validation.test.ts` | Form field validation (NOT physics) |
| Guards | `ui/__tests__/canon-*.test.ts` | Codenames, alerts, polish labels |

### §17.7.3 Wzorzec testu Vitest

```typescript
// frontend/src/ui/__tests__/validation.test.ts

describe('Property Grid Validation', () => {
  it('should validate required string fields', () => {
    const field: PropertyField = {
      key: 'name', label: 'Nazwa', value: '',
      type: 'string', editable: true, source: 'instance',
    };
    const result = validateField('Bus', field, '');
    expect(result.valid).toBe(false);
    expect(result.code).toBe('E-REQ-01');
  });
});
```

> **INV-TST-06:** Testy Vitest MUSZĄ być uruchamiane z `--no-file-parallelism` w CI. Równoległe uruchamianie testów frontendowych jest ZAKAZANE w pipeline.

---

## §17.8 CI/CD Pipeline

### §17.8.1 GitHub Actions — workflows AS-IS

| Workflow | Plik | Trigger | Zakres |
|----------|------|---------|--------|
| Python tests | `.github/workflows/python-tests.yml` | push + PR | `poetry run pytest -q` |
| Frontend E2E smoke | `.github/workflows/frontend-e2e-smoke.yml` | push/PR (paths: frontend/) | Playwright `create-first-case.spec.ts` |
| Architectural guard | `.github/workflows/arch-guard.yml` | push + PR | `python scripts/arch_guard.py` |
| No-codenames guard | `.github/workflows/no-codenames-guard.yml` | push + PR | `python scripts/no_codenames_guard.py` |

### §17.8.2 Backend CI pipeline — szczegóły

```yaml
# .github/workflows/python-tests.yml
name: Python tests
on: [push, pull_request]

jobs:
  pytest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11.x'
          cache: pip
          cache-dependency-path: mv-design-pro/backend/poetry.lock
      - run: pipx install poetry
      - uses: actions/cache@v4
        with:
          path: |
            ~/.cache/pypoetry
            ~/.cache/pip
            ~/.cache/pypoetry/virtualenvs
          key: poetry-${{ runner.os }}-${{ hashFiles('mv-design-pro/backend/poetry.lock') }}
      - working-directory: mv-design-pro/backend
        run: poetry install --no-interaction --with dev
      - working-directory: mv-design-pro/backend
        run: poetry run pytest -q
```

**Kluczowe aspekty:**
- **OS:** ubuntu-latest (deterministyczne środowisko).
- **Python:** 3.11.x (locked version).
- **Cache:** Poetry virtualenv cached by `poetry.lock` hash.
- **Fail-fast:** `pytest -q` — zatrzymanie na pierwszym błędzie.

### §17.8.3 Frontend CI pipeline

```yaml
# .github/workflows/frontend-e2e-smoke.yml
name: frontend-e2e-smoke
on:
  push:
    paths: ['frontend/**']
  pull_request:
    paths: ['frontend/**']

jobs:
  create-first-case-smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test e2e/create-first-case.spec.ts
```

### §17.8.4 Gate policy

| Gate | Warunek | Blokada merge |
|------|---------|---------------|
| pytest | `exit 0` | ✓ Blokuje |
| Playwright smoke | `exit 0` | ✓ Blokuje |
| Arch guard | `exit 0` | ✓ Blokuje |
| No-codenames guard | `exit 0` | ✓ Blokuje |

> **INV-TST-07:** Wszystkie 4 workflows MUSZĄ przejść (exit 0) przed merge do `main`. Pominięcie gate'u jest ZAKAZANE.

---

## §17.9 Determinizm testów

### §17.9.1 Zasady determinizmu testowego

| Zasada | Mechanizm AS-IS |
|--------|-----------------|
| Brak random seed | Solvery nie używają `random` (Decyzja #110) |
| Brak time-dependent | Timestamps normalizowane w golden tests |
| Brak shared state | `tmp_path` per test (SQLite) |
| Sorted output | `json.dumps(sort_keys=True)` |
| Sequential execution | `--no-file-parallelism` (Vitest), `workers: 1` (Playwright CI) |
| Deterministic JSON | `DeterministicJSON` SQLAlchemy type |

### §17.9.2 xfail — znane ograniczenia

```python
@pytest.mark.xfail(reason="PDF timestamps non-deterministic", strict=False)
def test_pdf_export_deterministic():
    """PDF binary jest niedeterministyczny (timestamps), ale content jest."""
```

**Reguła:** `xfail(strict=False)` = test NIE blokuje CI, ale raportuje status. Jeśli test PRZEJDZIE, pytest zgłosi `XPASS` (unexpected pass → do review).

### §17.9.3 Warunkowe skipowanie

```python
@pytest.mark.skipif(not _PDF_AVAILABLE, reason="reportlab not installed")
def test_pdf_export():
    result = export_to_pdf(...)
    assert result is not None
```

AS-IS: `conftest.py` → `pytest_ignore_collect()` pomija testy jeśli brak `sqlalchemy`, `numpy`, `networkx` (ale `proof_engine/` zawsze uruchomiony).

> **INV-TST-08:** Test oznaczony `xfail` MUSI mieć jawny `reason` i MUSI być `strict=False`. Użycie `xfail` bez reason jest ZAKAZANE.

---

## §17.10 Komendy testowe (KANONICZNE)

### §17.10.1 Backend

| Komenda | Cel |
|---------|-----|
| `poetry run pytest -q` | Wszystkie testy (quiet mode) |
| `poetry run pytest tests/test_branch.py -v` | Konkretny plik |
| `poetry run pytest tests/test_branch.py::TestLineBranch -v` | Konkretna klasa |
| `poetry run pytest -m integration` | Tylko integracyjne |
| `poetry run pytest -m "not integration"` | Bez integracyjnych |
| `poetry run pytest tests/e2e/ -v` | E2E determinizm |
| `poetry run pytest tests/proof_engine/ -v` | Proof Engine |
| `poetry run pytest --cov=src tests/` | Z coverage |
| `poetry run pytest -x` | Stop on first failure |
| `poetry run pytest --lf` | Re-run last failed |

### §17.10.2 Frontend

| Komenda | Cel |
|---------|-----|
| `npm test` | Vitest run (sequential) |
| `npm run test:watch` | Watch mode (auto-rerun) |
| `npm run test:coverage` | Coverage report |
| `npm run test:e2e` | Playwright E2E |
| `npm run test:e2e:ui` | Playwright UI debugger |
| `npm run type-check` | TypeScript `tsc --noEmit` |
| `npm run guard:codenames` | No-codenames guard |

---

## §17.11 Inwarianty testowe (BINDING)

| ID | Inwariant |
|----|-----------|
| INV-TST-01 | Każdy solver MUSI mieć dedykowany zestaw testów jednostkowych z referencyjnymi wartościami numerycznymi. |
| INV-TST-02 | Testy integracyjne MUSZĄ używać izolowanej bazy danych per test. Współdzielenie stanu DB jest ZAKAZANE. |
| INV-TST-03 | Testy E2E MUSZĄ być sekwencyjne w CI. Równoległy dostęp do zasobów UI jest ZAKAZANY. |
| INV-TST-04 | Golden files MUSZĄ być wersjonowane w repozytorium. Aktualizacja bez review jest ZAKAZANA. |
| INV-TST-05 | Guard tests MUSZĄ być uruchamiane w CI na każdym push/PR. Pominięcie jest ZAKAZANE. |
| INV-TST-06 | Testy Vitest MUSZĄ być uruchamiane z `--no-file-parallelism` w CI. |
| INV-TST-07 | Wszystkie 4 CI workflows MUSZĄ przejść przed merge do `main`. |
| INV-TST-08 | Test `xfail` MUSI mieć jawny `reason` i `strict=False`. |
| INV-TST-09 | Test NIE MOŻE zawierać logiki obliczeniowej (physics). Test jest KONSUMENTEM wyników. |
| INV-TST-10 | Zmiana w solverze wymaga aktualizacji golden testów lub jawnego potwierdzenia braku wpływu. |

---

## §17.12 Definition of Done — Rozdział 17

- [ ] Piramida testowa zdefiniowana (4 warstwy: Unit, Integration, E2E, Guard).
- [ ] Statystyki AS-IS: ~237 plików, ~2 117 funkcji testowych.
- [ ] Testy numeryczne: wzorzec `pytest.approx(abs=1e-12)`.
- [ ] Fixtures: łańcuch `db_engine → db_session_factory → uow_factory → app_client`.
- [ ] Golden tests: workflow aktualizacji (FAIL → review → update → commit).
- [ ] Guard tests: codenames, alerts, arch, polish labels.
- [ ] CI/CD: 4 workflows (pytest, Playwright, arch guard, codenames guard).
- [ ] Determinizm: brak random, brak shared state, sequential execution.
- [ ] Komendy testowe: backend (10) + frontend (7).
- [ ] Inwarianty INV-TST-01..10, zakazy Z-TST-01..03.
- [ ] Decyzje #127–#133 zapisane w AUDIT_SPEC_VS_CODE.md.

