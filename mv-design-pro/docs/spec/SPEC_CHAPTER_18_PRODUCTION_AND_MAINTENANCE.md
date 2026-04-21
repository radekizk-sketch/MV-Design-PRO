> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# Rozdział 18 — Wdrożenie Produkcyjne, Eksploatacja, Audyt i Utrzymanie (benchmark-GRADE)

**Wersja:** 1.0
**Status:** AS-IS + TO-BE (jawnie oznaczone)
**Warstwa:** Infrastructure + Operations
**Zależności:** Rozdział 12 (Walidacje), 14 (Determinizm), 15 (Governance), 16 (Integracje), 17 (Testy)
**Decision Matrix:** Decyzje #134–#140

**SPECYFIKACJA ZAMKNIĘTA — Rozdział 18 jest ostatnim rozdziałem specyfikacji.**

---

## §18.0 Zakres i cel

### §18.0.1 Zasada nadrzędna

> **System MV-DESIGN-PRO jest wdrażany jako konteneryzowana aplikacja wielousługowa (Docker Compose / Kubernetes). Każda usługa ma zdefiniowane health checki, logowanie strukturalne z request-ID correlation, i konfigurację środowiskową przez zmienne ENV. Produkcja wymaga jawnego SECRET_KEY, zamkniętego CORS, i zautomatyzowanego backupu.**

- Architektura: 6 usług (backend, frontend, PostgreSQL, MongoDB, Redis, Celery worker).
- Deployment: Docker Compose (dev/staging), Kubernetes (production).
- Monitoring: 3-tier health checks (basic, readiness, extended).
- Logging: structured, request-ID correlation, severity-based routing.

### §18.0.2 Parytet z benchmark / benchmark

| Aspekt | benchmark | benchmark | MV-DESIGN-PRO |
|--------|------|--------------|---------------|
| Konteneryzacja | ✗ (desktop) | ✗ (desktop) | ✓ Docker + K8s |
| Health checks | ✗ | ✗ | ✓ 3-tier |
| Request-ID correlation | ✗ | ✗ | ✓ X-Request-Id |
| CI/CD pipeline | Internal QA | Internal QA | ✓ GitHub Actions |
| Structured logging | ✗ | ✗ | ✓ Timestamp + level + rid |
| Database migrations | N/A | N/A | ✓ 9 SQL migrations |
| Task queue | ✗ | ✗ | ✓ Celery + Redis |

---

## §18.1 Architektura wdrożeniowa

### §18.1.1 Stack usług (Docker Compose)

AS-IS: `mv-design-pro/docker-compose.yml`

| Usługa | Image | Port | Rola | Health Check |
|--------|-------|------|------|-------------|
| **backend** | python:3.11-slim | 8000→18000 | FastAPI/Uvicorn API server | `curl /api/health` |
| **frontend** | node:20-alpine | 3000→3000 | React Vite (SPA) | HTTP 200 |
| **postgres** | postgres:16-alpine | 5432→5432 | OLTP database (primary) | `pg_isready` |
| **mongodb** | mongo:7.0 | 27017→27017 | Document store (proof artifacts) | `mongosh --eval` |
| **redis** | redis:7-alpine | 6379→6379 | Cache + task queue broker | `redis-cli ping` |
| **celery-worker** | python:3.11-slim | — | Async task worker | Celery inspect |

### §18.1.2 Volume persistence

| Volume | Mount | Cel |
|--------|-------|-----|
| `postgres_data` | `/var/lib/postgresql/data` | Dane OLTP |
| `mongodb_data` | `/data/db` | Dokumenty proof |
| `redis_data` | `/data` | Cache persistence |
| `./backend` | `/app` (dev mount) | Hot reload |
| `./frontend` | `/app` (dev mount) | Hot reload |

### §18.1.3 Network

AS-IS: `mv-design-network` (bridge). Wszystkie usługi w jednej sieci Docker.

TO-BE: segmentacja sieci (frontend → backend only, backend → DB only).

### §18.1.4 Backend Dockerfile

```dockerfile
# mv-design-pro/backend/Dockerfile
FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y build-essential curl && rm -rf /var/lib/apt/lists/*

ENV POETRY_VERSION=1.7.1
ENV POETRY_HOME=/opt/poetry
ENV POETRY_VENV=/opt/poetry-venv
RUN python -m venv $POETRY_VENV && $POETRY_VENV/bin/pip install poetry==$POETRY_VERSION
ENV PATH="${POETRY_VENV}/bin:${PATH}"

COPY pyproject.toml ./
RUN poetry config virtualenvs.create false && poetry install --no-interaction --no-ansi --no-root

COPY . .
RUN poetry install --no-interaction --no-ansi
ENV PYTHONPATH=/app/src

EXPOSE 8000
CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

**Produkcja:** usunąć `--reload`, dodać `--workers 4`.

> **INV-PRD-01:** Obraz produkcyjny MUSI być zbudowany z locked dependencies (`poetry.lock`). Brak lock file = ZAKAZANY deploy.

---

## §18.2 Konfiguracja środowiskowa

### §18.2.1 Zmienne środowiskowe (BINDING)

| Zmienna | Domyślna (dev) | Produkcja | Wymagana |
|---------|----------------|-----------|----------|
| `DATABASE_URL` | `postgresql+psycopg://mvdesign:mvdesign_secret@postgres:5432/mvdesign_db` | Silne hasło + SSL | TAK |
| `MONGODB_URL` | `mongodb://mongodb:27017/mvdesign_db` | Auth + SSL | NIE (fallback SQLite) |
| `REDIS_URL` | `redis://redis:6379/0` | `--requirepass` | TAK (Celery) |
| `SECRET_KEY` | `your-secret-key-change-in-production` | `secrets.token_urlsafe(32)` | **KRYTYCZNA** |
| `DEBUG` | `true` | `false` | NIE |
| `ALLOWED_ORIGINS` | localhost:3000,5173,18000 | Production domain(s) | TAK (prod) |

### §18.2.2 Frontend ENV

| Plik | Zmienna | Wartość |
|------|---------|---------|
| `.env.development` | `VITE_API_URL_DEV` | `http://127.0.0.1:8000` |
| `.env.production` | `VITE_API_URL` | `http://localhost:8000` (→ production URL) |

**Uwaga:** Vite przetwarza ENV w build-time (nie runtime). Zmiana wymaga re-build.

### §18.2.3 Zakazy

- **Z-PRD-01:** Deploy produkcyjny z domyślnym `SECRET_KEY` (`your-secret-key-change-in-production`). ZAKAZANY.
- **Z-PRD-02:** Deploy produkcyjny z `DEBUG=true`. ZAKAZANY.
- **Z-PRD-03:** Commit credentials (`.env`, `secrets.json`, hasła DB) do repozytorium. ZAKAZANY.

---

## §18.3 Baza danych i migracje

### §18.3.1 PostgreSQL — schemat migracji

AS-IS: 9 migracji SQL w `backend/src/infrastructure/persistence/migrations/`:

| Migracja | Tabele | Cel |
|----------|--------|-----|
| 001_initial | projects, network_nodes, network_branches, operating_cases, study_cases, scenarios, study_runs, study_results, sld_diagrams | Fundament schematu |
| 002_add_pcc_sources | ALTER projects | PCC (Point of Connection) |
| 003_network_wizard_assets | project_settings, network_sources, network_loads, line_types, cable_types, transformer_types, network_switching_states | Catalog + switching |
| 004_sld_symbols | indices/constraints | SLD optymalizacja |
| 005_analysis_runs | analysis_runs | Run lifecycle |
| 006_snapshot_store | snapshot | Network snapshot |
| 007_analysis_runs_index | analysis_runs_index | Deterministyczny indeks |
| 008_snapshot_network_model_id | ALTER snapshot | Snapshot-model link |
| 009_analysis_runs_result_status | ALTER analysis_runs | Run result status |

### §18.3.2 Inicjalizacja

```python
# backend/src/infrastructure/persistence/db.py

def init_db(engine: Engine) -> None:
    Base.metadata.create_all(engine)
```

AS-IS: `lifespan()` wywołuje `init_db(engine)` przy starcie aplikacji. Idempotentne (`CREATE IF NOT EXISTS`).

### §18.3.3 Indeksy krytyczne

```sql
-- Deduplikacja deterministyczna (Decyzja #72)
CONSTRAINT uq_analysis_runs_deterministic UNIQUE (
    project_id, operating_case_id, analysis_type, input_hash
)

CREATE INDEX ix_analysis_runs_input_hash ON analysis_runs (input_hash);
CREATE INDEX ix_analysis_runs_index_fingerprint ON analysis_runs_index (fingerprint);
CREATE INDEX ix_analysis_runs_index_created_at_utc ON analysis_runs_index (created_at_utc);
```

### §18.3.4 Connection pooling

AS-IS: Domyślny SQLAlchemy `QueuePool`.

TO-BE (produkcja):
```python
create_engine(url,
    pool_size=20,
    max_overflow=40,
    pool_recycle=3600,
    pool_pre_ping=True,
)
```

> **INV-PRD-02:** Migracje MUSZĄ być idempotentne. Ponowne uruchomienie migracji NIE MOŻE uszkodzić danych.

---

## §18.4 Task Queue — Celery

### §18.4.1 Konfiguracja AS-IS

```python
# backend/src/api/celery_app.py

app = Celery("mv_design_pro", broker=redis_url, backend=redis_url)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Warsaw",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)
```

### §18.4.2 Kluczowe parametry

| Parametr | Wartość | Cel |
|----------|---------|-----|
| `task_serializer` | `json` | Bezpieczna serializacja (zero pickle) |
| `timezone` | `Europe/Warsaw` | Strefa czasowa operatorów OSD |
| `enable_utc` | `True` | Wewnętrzne UTC, wyświetlanie Warsaw |
| `task_acks_late` | `True` | Potwierdzenie PO zakończeniu (crash safety) |
| `worker_prefetch_multiplier` | `1` | 1 task na worker (fair scheduling) |

### §18.4.3 Zakazy

- **Z-PRD-04:** Użycie `pickle` jako serializera Celery. ZAKAZANY (security risk).
- **Z-PRD-05:** `task_acks_late=False` w produkcji. ZAKAZANY (utrata zadań przy crash).

> **INV-PRD-03:** Celery MUSI używać wyłącznie `json` serializer. Pickle jest ZAKAZANY.

---

## §18.5 Logging i monitoring

### §18.5.1 Structured logging

AS-IS: `backend/src/api/main.py`

```python
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
```

Format: `TIMESTAMP LEVEL LOGGER MESSAGE`
Przykład: `2026-02-10T15:30:45 INFO mv_design_pro MV-DESIGN PRO API started, DB initialized`

### §18.5.2 Request-ID middleware

AS-IS: `backend/src/api/middleware.py`

```python
class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        request.state.request_id = request_id

        start = time.monotonic()
        response = await call_next(request)
        elapsed_ms = round((time.monotonic() - start) * 1000, 1)

        response.headers["X-Request-Id"] = request_id

        if status >= 500:
            logger.error("HTTP %s %s -> %d (%.1fms) rid=%s", ...)
        elif status >= 400:
            logger.warning(...)
        else:
            logger.info(...)
```

**Korelacja:** Każdy log entry zawiera `rid=<uuid>` do śledzenia requestu.

### §18.5.3 Exception handlers

AS-IS: `backend/src/api/exception_handlers.py`

| Exception | HTTP Status | Response |
|-----------|-------------|----------|
| `Exception` (unhandled) | 500 | `{"detail": "Wewnętrzny błąd serwera", "request_id": rid, "error_type": type}` |
| `ValueError` | 422 | Validation error details |
| `KeyError` | 404 | Resource not found |

**Logging:** Full traceback logged at ERROR level z `rid=` correlation.

### §18.5.4 Health checks — 3 tiers

| Endpoint | Tier | Sprawdza | Response |
|----------|------|----------|----------|
| `GET /health` | Basic | Proces żyje | `{"status": "healthy"}` |
| `GET /ready` | Readiness | Gotowość na ruch | `{"status": "ready"}` |
| `GET /api/health` | Extended | DB + Solver engine + uptime | `{"status": "ok"/"degraded", "db_ok", "engine_ok", "version", "solvers", "uptime_seconds"}` |

```python
# backend/src/api/routers/health.py

@router.get("/api/health")
async def health_check(request: Request):
    db_ok = False
    try:
        with request.app.state.engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    engine_ok = False
    try:
        from network_model.solvers import ShortCircuitIEC60909Solver
        engine_ok = True
    except Exception:
        pass

    return {
        "status": "ok" if db_ok and engine_ok else "degraded",
        "db_ok": db_ok,
        "engine_ok": engine_ok,
        "version": "4.0.0",
        "solvers": ["sc_iec60909", "pf_newton", "pf_gauss_seidel", "pf_fast_decoupled"],
        "uptime_seconds": round(uptime, 1),
    }
```

> **INV-PRD-04:** Endpoint `/api/health` MUSI weryfikować connectivity do DB i dostępność solver engine. Status `degraded` gdy którykolwiek komponent niedostępny.

---

## §18.6 API i middleware

### §18.6.1 FastAPI application

AS-IS: `backend/src/api/main.py`

```python
app = FastAPI(
    title="MV-DESIGN PRO API",
    description="Professional Medium Voltage Network Design System API",
    version="4.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)
```

### §18.6.2 Middleware stack (kolejność WAŻNA)

1. **RequestIdMiddleware** — first (potrzebny przez error handlers).
2. **CORSMiddleware** — second.

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", "http://127.0.0.1:3000",
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:18000", "http://127.0.0.1:18000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Produkcja:** zastąpić localhost → `ALLOWED_ORIGINS` ENV.

### §18.6.3 Router registration

AS-IS: 32 API router modules zarejestrowanych w `main.py`:

| Grupa | Routery | Zakres |
|-------|---------|--------|
| Analyses | analysis_runs, analysis_runs_index, analysis_runs_read | Execution + indexing |
| Cases | cases, study_cases, case_runs | Study Case lifecycle |
| Projects | projects, project_archive | Project CRUD + export |
| Solvers | power_flow_runs, power_flow_comparisons, protection_runs, protection_comparisons | Solver execution |
| Proof | proof_pack, equipment_proof_pack | Proof generation |
| Data | catalog, enm, snapshots | Data management |
| SLD | sld | Single-line diagram |
| Import | xlsx_import | External data import |
| Monitoring | health, diagnostics, issues | System status |
| Other | comparison, design_synth, reference_patterns | Specialized endpoints |

### §18.6.4 Lifespan — startup/shutdown

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    database_url = os.getenv("DATABASE_URL", "sqlite+pysqlite:///./mv_design_pro.db")
    engine = create_engine_from_url(database_url)
    session_factory = create_session_factory(engine)
    app.state.engine = engine
    app.state.uow_factory = build_uow_factory(session_factory)
    init_db(engine)
    logger.info("MV-DESIGN PRO API started, DB initialized")
    yield
    logger.info("MV-DESIGN PRO API shutting down")
```

> **INV-PRD-05:** Startup MUSI wywołać `init_db()` (idempotentne). Shutdown MUSI logować zamknięcie.

---

## §18.7 Security

### §18.7.1 Stan AS-IS

| Aspekt | Status | Implementacja |
|--------|--------|---------------|
| Authentication | TO-BE | Brak wbudowanego auth framework |
| Authorization (RBAC) | TO-BE | Brak |
| JWT | TO-BE | `python-jose` w dependencies (nieużywany) |
| Password hashing | TO-BE | `passlib[bcrypt]` w dependencies (nieużywany) |
| CORS | AS-IS | Localhost origins (dev) |
| Input validation | AS-IS | Pydantic v2 (automatic via FastAPI) |
| SQL injection | AS-IS | SQLAlchemy ORM (parameterized queries) |
| XSS | AS-IS | React auto-escaping + CSP (TO-BE) |

### §18.7.2 TO-BE: Authentication framework

```python
# Recommended implementation
from fastapi.security import HTTPBearer

security = HTTPBearer()

async def verify_token(credentials = Depends(security)):
    # Verify JWT signature, expiration, claims
    # Return user identity or raise 401
    pass

@app.get("/api/projects")
async def list_projects(user: User = Depends(verify_token)):
    # Filter by user ownership
    pass
```

### §18.7.3 Zakazy

- **Z-PRD-06:** Raw SQL w user-facing code. ZAKAZANE (SQL injection risk).
- **Z-PRD-07:** `allow_origins=["*"]` w produkcji. ZAKAZANE.

> **INV-PRD-06:** Input validation MUSI być realizowana przez Pydantic v2 schemas. Raw SQL w endpoint handlers jest ZAKAZANE.

---

## §18.8 Backup i odzyskiwanie

### §18.8.1 Strategia backup (TO-BE)

| Komponent | Metoda | Retencja | Częstotliwość |
|-----------|--------|----------|---------------|
| PostgreSQL | `pg_dump -F custom` | 30 dni | Codziennie |
| MongoDB | `mongodump` | 30 dni | Codziennie |
| Redis | RDB snapshot | 7 dni | Co 6h |
| Konfiguracja | Git (repozytorium) | ∞ | Każdy commit |

### §18.8.2 Odzyskiwanie

```bash
# PostgreSQL restore
pg_restore -h postgres -U mvdesign -d mvdesign_db < /backups/db_YYYYMMDD.backup

# MongoDB restore
mongorestore --uri mongodb://mongodb:27017 /backups/mongo_YYYYMMDD/
```

### §18.8.3 Smoke test post-deploy

AS-IS: `scripts/smoke_local.sh`

```bash
#!/usr/bin/env bash
check "GET /health"       "${BACKEND_URL}/health"       '"status":"healthy"'
check "GET /ready"        "${BACKEND_URL}/ready"        '"status":"ready"'
check "GET /api/health"   "${BACKEND_URL}/api/health"   '"status":"ok"'
check "GET /docs"         "${BACKEND_URL}/docs"         'swagger'
check "GET /api/projects" "${BACKEND_URL}/api/projects"  '['
check "GET /"             "${FRONTEND_URL}/"             '<'
```

Exit code: `0` = all pass, `1` = failure.

> **INV-PRD-07:** Po każdym deploy produkcyjnym MUSI być uruchomiony smoke test. Deploy bez smoke testu jest ZAKAZANY.

---

## §18.9 Performance i caching

### §18.9.1 In-memory caches AS-IS

| Cache | Klucz | Lokalizacja | TTL | Eviction |
|-------|-------|-------------|-----|----------|
| ENM cache | `(case_id, enm_hash)` | `enm.py:_run_cache` | Brak | Brak |
| PF interpretation | `run_id` | `power_flow_runs.py:_interpretation_cache` | Brak | Brak |

TO-BE: Migracja do Redis z TTL (1h) i eviction policy (LRU).

### §18.9.2 Deterministic JSON storage

AS-IS: `DeterministicJSON(TypeDecorator)` w `infrastructure/persistence/models.py`:

```python
class DeterministicJSON(TypeDecorator):
    """JSON stored canonical (sorted keys, deterministic order)."""
    def process_bind_param(self, value, dialect):
        canonical = _canonicalize(value)
        return json.dumps(canonical, sort_keys=True, separators=(",", ":"))
```

### §18.9.3 Performance targets

| Operacja | Target | Mechanizm |
|----------|--------|-----------|
| Power Flow (1000 nodes) | < 5s | NumPy sparse matrix |
| Short Circuit | < 2s | IEC 60909 analytical |
| JSON import (10k elements) | < 10s | Batch insert |
| PDF export | < 30s | reportlab streaming |
| API response (cached) | < 100ms | Redis / in-memory |

---

## §18.10 Dependency management

### §18.10.1 Backend — Poetry

AS-IS: `backend/pyproject.toml`

| Kategoria | Kluczowe pakiety | Wersja |
|-----------|-----------------|--------|
| Framework | FastAPI, Uvicorn | ^0.109, ^0.27 |
| Numerics | NumPy, SciPy | ^1.26, ^1.12 |
| Graph | NetworkX | ^3.2.1 |
| Validation | Pydantic | ^2.5 |
| Database | SQLAlchemy, asyncpg, psycopg | ^2.0, ^0.29, ^3.1 |
| Cache/Queue | Redis, Celery | ^5.0, ^5.3 |
| Document DB | Motor (MongoDB) | ^3.3 |
| Dev | pytest, black, ruff, mypy | ^7.4, ^24.1, ^0.1, ^1.8 |

Lock file: `poetry.lock` (3 262 linii).

### §18.10.2 Frontend — npm

AS-IS: `frontend/package.json`

| Kategoria | Kluczowe pakiety | Wersja |
|-----------|-----------------|--------|
| Framework | React, ReactDOM | ^18.2 |
| State | Zustand | ^4.5 |
| Data | @tanstack/react-query | ^5.17 |
| Forms | react-hook-form, zod | ^7.49, ^3.22 |
| Styling | Tailwind CSS | ^3.4 |
| Math | KaTeX | ^0.16 |
| Build | Vite, TypeScript | ^5.0, ^5.3 |
| Test | Vitest, Playwright | ^1.2, ^1.58 |

Lock file: `package-lock.json`.

### §18.10.3 Code quality tools

| Tool | Config | Reguły |
|------|--------|--------|
| `black` | `line-length = 100`, `target-version = ['py311']` | Formatter |
| `ruff` | `line-length = 100`, `select = ["E","F","W","I","N","UP","B","C4"]` | Linter |
| `mypy` | `python_version = "3.11"`, `disallow_untyped_defs = true` | Type checker |
| `eslint` | `--max-warnings 0` | Frontend linter |
| `tsc` | `--noEmit`, strict mode | Type checker |

---

## §18.11 GO-LIVE Checklist

### §18.11.1 Checklist produkcyjny (BINDING)

| Kategoria | Element | Status |
|-----------|---------|--------|
| **Core** | NetworkGraph, Node, Branch, serialization | AS-IS ✓ |
| **Solvers** | IEC 60909, PF (NR/GS/FDLF), determinism, traces | AS-IS ✓ |
| **Analysis** | Violations, AnalysisRun lifecycle | AS-IS ✓ |
| **Application** | Wizard, Export/Import, PF/SC/Protection runs | AS-IS ✓ |
| **Infrastructure** | Persistence, Repositories, UOW, migrations | AS-IS ✓ |
| **API** | 32 routers, error codes (404/422/500) | AS-IS ✓ |
| **Logging** | Timestamp, level, rid, no sensitive data | AS-IS ✓ |
| **Monitoring** | Health checks (3-tier), uptime | AS-IS ✓ |
| **Backup** | Auto DB backup, restore procedure | TO-BE ⚠ |
| **Rollback** | Procedure defined, < 15 min | TO-BE ⚠ |
| **Security** | Auth (JWT), RBAC, CORS (production) | TO-BE ⚠ |
| **Architecture** | Layer separation, determinism, WHITE BOX | AS-IS ✓ |
| **Tests** | 237 plików, 2 117 funkcji, 4 CI workflows | AS-IS ✓ |
| **Guards** | Codenames, alerts, arch, polish labels | AS-IS ✓ |

AS-IS: `docs/GO-LIVE-CHECKLIST.md`.

### §18.11.2 Deployment modes

| Mode | Infrastruktura | Cel |
|------|---------------|-----|
| **Development** | Docker Compose (localhost) | Programowanie + debugging |
| **Staging** | Docker Compose (remote) | QA + acceptance testing |
| **Production** | Kubernetes (cloud/on-prem) | Produkcja OSD |

> **INV-PRD-08:** Deploy produkcyjny wymaga przejścia WSZYSTKICH elementów GO-LIVE Checklist (sekcje AS-IS ✓ obowiązkowe, TO-BE ⚠ rekomendowane).

---

## §18.12 Inwarianty produkcyjne (BINDING)

| ID | Inwariant |
|----|-----------|
| INV-PRD-01 | Obraz produkcyjny MUSI być zbudowany z locked dependencies (poetry.lock / package-lock.json). |
| INV-PRD-02 | Migracje DB MUSZĄ być idempotentne. Ponowne uruchomienie NIE MOŻE uszkodzić danych. |
| INV-PRD-03 | Celery MUSI używać wyłącznie `json` serializer. Pickle jest ZAKAZANY. |
| INV-PRD-04 | Endpoint `/api/health` MUSI weryfikować DB connectivity i solver engine availability. |
| INV-PRD-05 | Startup MUSI wywołać `init_db()`. Shutdown MUSI logować zamknięcie. |
| INV-PRD-06 | Input validation przez Pydantic v2. Raw SQL w handlers jest ZAKAZANE. |
| INV-PRD-07 | Po każdym deploy MUSI być uruchomiony smoke test. |
| INV-PRD-08 | Deploy produkcyjny wymaga przejścia GO-LIVE Checklist. |
| INV-PRD-09 | Request-ID MUSI być propagowany przez cały request lifecycle (middleware → handlers → logs → response header). |
| INV-PRD-10 | Credentials (SECRET_KEY, DB passwords, API keys) NIGDY nie mogą być commitowane do repozytorium. |

---

## §18.13 Definition of Done — Rozdział 18

- [ ] Architektura wdrożeniowa: 6 usług Docker, volumes, network.
- [ ] Konfiguracja ENV: 6 zmiennych krytycznych, zakazy Z-PRD-01..03.
- [ ] Baza danych: 9 migracji, indeksy, connection pooling.
- [ ] Task Queue: Celery z json serializer, task_acks_late.
- [ ] Logging: structured, request-ID correlation, 3 exception handlers.
- [ ] Health checks: 3-tier (basic, readiness, extended).
- [ ] Security: Pydantic validation (AS-IS), JWT/RBAC (TO-BE).
- [ ] Backup: strategia PostgreSQL/MongoDB/Redis (TO-BE).
- [ ] Smoke test: `scripts/smoke_local.sh` (AS-IS).
- [ ] Dependencies: Poetry + npm, locked, code quality tools.
- [ ] GO-LIVE Checklist: 14 kategorii, AS-IS/TO-BE oznaczone.
- [ ] Inwarianty INV-PRD-01..10, zakazy Z-PRD-01..07.
- [ ] Decyzje #134–#140 zapisane w AUDIT_SPEC_VS_CODE.md.

---

**SPECYFIKACJA ZAMKNIĘTA — Rozdziały 1–18 kompletne.**

