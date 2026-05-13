# EP-0: Inwentaryzacja Systemu (System Inventory)

## Backend

### Punkt wejścia (Entrypoint)
- `backend/src/api/main.py` — FastAPI app z lifespan, CORS, routery
- SQLite domyślnie: `sqlite+pysqlite:///./mv_design_pro.db`
- PostgreSQL w docker: `postgresql+psycopg://mvdesign:mvdesign_secret@postgres:5432/mvdesign_db`

### Routery API (22 routery)

| Router | Prefix | Tagi |
|--------|--------|------|
| `projects.py` | `/api/projects` | projects |
| `study_cases.py` | `/api/study-cases` | study-cases |
| `health.py` | `/api/health` | health |
| `proof_pack.py` | `/api/proof` | proof-pack |
| `issues.py` | `/api/issues` | issues |
| `comparison.py` | `/api/comparison` | comparison |
| `equipment_proof_pack.py` | `/api/equipment-proof` | equipment-proof |
| `reference_patterns.py` | `/api/reference-patterns` | reference-patterns |
| `catalog.py` | `/catalog` | Type Catalog |
| `analysis_runs.py` | (brak prefiksu) | (brak) |
| `analysis_runs_index.py` | `/analysis-runs` | analysis-runs |
| `analysis_runs_read.py` | `/analysis-runs` | analysis-runs |
| `cases.py` | (brak prefiksu) | (brak) |
| `snapshots.py` | (brak prefiksu) | (brak) |
| `sld.py` | (brak prefiksu) | (brak) |
| `design_synth.py` | `/analyses/design-synth` | design-synth |
| `power_flow_runs.py` | (brak prefiksu) | power-flow |
| `power_flow_comparisons.py` | `/power-flow-comparisons` | power-flow-comparison |
| `protection_runs.py` | (brak prefiksu) | protection-analysis |
| `protection_comparisons.py` | `/protection-comparisons` | protection-comparison |
| `protection_coordination.py` | `/protection-coordination` | protection-coordination |
| `project_archive.py` | `/projects` | project-archive |

### Middleware i CORS
- CORS: localhost:3000, 127.0.0.1:3000, localhost:5173, 127.0.0.1:5173
- Brak dedykowanego request-id middleware
- Brak centralnego exception handler

### Baza danych
- SQLAlchemy 2.0 z `DeclarativeBase`
- `init_db()` -> `Base.metadata.create_all(engine)` (auto-create)
- Brak Alembic migracji (create_all only)
- Brak seed script
- 25+ tabel ORM w `infrastructure/persistence/models.py`

### Warstwy
- `api/` — FastAPI routery (22 pliki)
- `application/` — Wizard, SLD, Case, Protection, Analysis
- `analysis/` — Boundary, Coverage, Normative, Power Flow, Protection, Sensitivity, Voltage
- `domain/` — Modele domenowe
- `infrastructure/` — Persistence (SQLAlchemy ORM, UoW)
- `network_model/` — Core (Bus, Branch, Switch, Source, Load), Catalog, Solvers, Validation
- `solvers/` — Top-level solver wrappers
- `whitebox/` — Trace utilities
- `compliance/` — Normative compliance

### Testy Backend
- 157 testów, 157 PASSED, 0 FAILED
- pytest z asyncio_mode = auto
- Pliki testowe: 80+ plików w `tests/`

---

## Frontend

### Routing (hash-based)
- `App.tsx` — główny router hash-based
- `""` / `#sld` → SLD Editor (SldEditorPage)
- `#sld-view` → SLD Viewer (read-only)
- `#results` → Results Inspector
- `#proof` → Proof Inspector
- `#protection-results` → Protection Results
- `#power-flow-results` → Power Flow Results
- `#reference-patterns` → Reference Patterns

### API Client
- Vite proxy: `/api` → `VITE_API_URL_DEV` (dev) / `VITE_API_URL` (prod)
- axios + @tanstack/react-query

### State Management
- Zustand stores (app-state, selection)
- React Query dla danych serwera

### UI
- CanonicalLayout — zawsze widoczny layout
- 389 plików TypeScript/TSX
- Tailwind CSS

### Testy Frontend
- Vitest: 54 passed, 20 failed (74 total files)
- 1393 passed, 50 failed (1443 total tests)
- Brak skonfigurowanego Playwright

---

## DevOps

### Docker Compose (6 serwisów)
1. `backend` — FastAPI na porcie 18000:8000
2. `frontend` — Vite na porcie 3000:3000
3. `postgres` — PostgreSQL 16-alpine na porcie 5432
4. `mongodb` — MongoDB 7.0 na porcie 27017
5. `redis` — Redis 7-alpine na porcie 6379
6. `celery-worker` — Celery worker

### Healthchecks
- Backend: `curl http://localhost:8000/api/health`
- PostgreSQL: `pg_isready`
- Redis: `redis-cli ping`

### Proxy/Env
- Vite proxy: `/api` -> backend
- `VITE_API_URL=http://backend:8000` (docker)
- `VITE_API_URL_DEV` dla dev

---

## Wykryte problemy (do naprawy)

### Krytyczne
1. **50 testów frontend FAIL** — wymaga naprawy
2. **Brak Alembic migracji** — tylko create_all
3. **Brak seed script** — pusta baza po starcie
4. **Brak centralnego exception handler** — 500 niekontrolowane
5. **Brak request-id middleware** — brak korelacji błędów
6. **Niespójne prefiksy routerów** — mix `/api/` i brak prefiksu

### Średnie
7. **Brak E2E testów Playwright** — do napisania
8. **Brak error interceptor w frontendzie** — błędy API niezłapane
9. **Brak centralnego toast/banner systemu** — brak PL komunikatów

### Niskie
10. **Brak guard tests** — zakazy kanoniczne nie testowane
