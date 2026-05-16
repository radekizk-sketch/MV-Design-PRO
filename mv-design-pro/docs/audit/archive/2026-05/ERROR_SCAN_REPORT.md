# MV-DESIGN-PRO — Error Scan Report

Data: 2025-09-24
Zakres: backend/src/**, frontend/src/**, .github/workflows/**, docker-compose.yml, PLANS.md, docs/audit/**.

## Podsumowanie

Najwyższy priorytet (BLOCKER) dotyczy konfiguracji proxy API w docker-compose, która powoduje brak łączności frontend → backend w środowisku kontenerowym (błędy sieciowe i puste UI). Pozostałe ryzyka dotyczą niespójnej konfiguracji dev proxy, „cichych” wyjątków w backendzie oraz braków w CI (brak testów backend/frontend). 

## Tabela issue

| ID | Priorytet | Symptom | Root cause | Plik + linia | Proponowana poprawka | Test / weryfikacja |
| --- | --- | --- | --- | --- | --- | --- |
| CFG-01 | **BLOCKER** | Frontend w docker-compose nie łączy się z backendem (błędy sieciowe, puste odpowiedzi) | `VITE_API_URL` wskazuje na `localhost` wewnątrz kontenera, zamiast na usługę `backend` | `docker-compose.yml:38` | Ustawić `VITE_API_URL=http://backend:8000` | `docker compose up` + żądanie `/api/health` z frontendu |
| CFG-02 | IMPORTANT | Lokalny dev (bez env) próbuje proxy na `8001`, a backend wg README uruchamia się na `8000` | W `vite.config.ts` domyślny target proxy to `http://127.0.0.1:8001` | `frontend/vite.config.ts:12` | Zmienić domyślny target na `http://127.0.0.1:8000` lub wymusić `.env` | `npm run dev` + żądanie `/api/health` |
| CI-01 | IMPORTANT | Brak automatycznych testów backend/frontend w CI | W workflowach są tylko guardy architektury i codenames | `.github/workflows/arch-guard.yml`, `.github/workflows/no-codenames-guard.yml` | Dodać joby: backend (poetry run pytest), frontend (npm test/build/lint) | GitHub Actions runs |
| BE-01 | IMPORTANT | Możliwe „ciche” błędy w liście runów ochrony (puste wyniki bez logu) | Wyjątki SQL i parsowania są łapane i ignorowane | `backend/src/application/protection_analysis/service.py:273-293` | Logować wyjątki i zwracać czytelny błąd (lub fallback kontrolowany) | Test jednostkowy + log assert |
| FE-01 | NICE-TO-HAVE | Brak czytelnego feedbacku dla użytkownika przy błędach API w Results Browser | Błędy fetch rzucają wyjątek bez dedykowanego UI/Toast | `frontend/src/ui/results-browser/api.ts:32-115` | Dodać obsługę błędów w warstwie store/UI (toast PL) | Test UI/Hook |

## Backlog PR (poza bieżącym fixem)

1. **CFG-02 (IMPORTANT)** — Zmiana domyślnego proxy w `vite.config.ts` na port 8000.
2. **CI-01 (IMPORTANT)** — Dodać joby testowe backend/frontend do GitHub Actions.
3. **BE-01 (IMPORTANT)** — Logowanie i obsługa błędów w `ProtectionAnalysisService.list_runs()`.
4. **FE-01 (NICE-TO-HAVE)** — Ujednolicona obsługa błędów w Results Browser (toast PL).

