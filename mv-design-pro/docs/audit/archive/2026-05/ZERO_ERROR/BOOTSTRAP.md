# EP-2: Fresh Bootstrap

## Cel

Zero ręcznych kroków: `docker compose up` → UI wstaje, backend wstaje, DB gotowe.

## Zmiany

### 1. Backend Dockerfile — PYTHONPATH
- **Plik**: `backend/Dockerfile`
- Dodano `ENV PYTHONPATH=/app/src` aby importy (`from api.*`, `from infrastructure.*`) działały bez `poetry run`
- CMD nadal używa `uvicorn src.api.main:app`

### 2. Celery App Stub
- **Plik**: `backend/src/api/celery_app.py`
- Minimalna konfiguracja Celery: broker=Redis, backend=Redis
- `autodiscover_tasks(["api"])` — gotowe do rejestracji zadań
- Celery worker w `docker-compose.yml` nie crashuje na starcie

### 3. Frontend .env — Port Fix
- **Pliki**: `.env.development`, `.env.example`
- Port zmieniony z 8001 → 8000 (zgodnie z backendowym `--port 8000`)
- `.env.production` bez zmian (już miał 8000)

### 4. Vite Config — process.env Fallback
- **Plik**: `frontend/vite.config.ts`
- Dodano `process.env.VITE_API_URL_DEV` / `process.env.VITE_API_URL` jako fallback
- Docker environment variables w docker-compose poprawnie nadpisują pliki `.env`

### 5. CORS — Docker Origins
- **Plik**: `backend/src/api/main.py`
- Dodano `http://localhost:18000` i `http://127.0.0.1:18000` (port Docker'a)

### 6. .dockerignore
- **Pliki**: `backend/.dockerignore`, `frontend/.dockerignore`
- Wyklucza `__pycache__`, `node_modules`, testy, `.git`, pliki coverage

### 7. Smoke Test
- **Plik**: `scripts/smoke_local.sh`
- Sprawdza: `/health`, `/ready`, `/api/health`, `/docs`, `/api/projects`, `/api/catalog`, frontend `/`
- Konfigurowalny: `BACKEND_PORT=8000 ./scripts/smoke_local.sh`

## Uruchomienie

```bash
cd mv-design-pro

# Docker
docker compose up -d
# Poczekaj na healthcheck (~30s)
./scripts/smoke_local.sh

# Lokalne dev
cd backend && poetry run uvicorn src.api.main:app --reload --port 8000 &
cd frontend && npm run dev &
BACKEND_PORT=8000 FRONTEND_PORT=5173 ./scripts/smoke_local.sh
```

## Status: DONE
