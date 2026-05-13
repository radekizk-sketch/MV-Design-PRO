# EP-0 Recon Results — Stan systemu MV-DESIGN-PRO

Data: 2026-02-06

## 1. Backend (Python/FastAPI)

### 1.1 API Routers (backend/src/api/)
| Plik | Opis | Status |
|------|------|--------|
| main.py | Główny entry point FastAPI, lifespan, CORS | OK |
| projects.py | CRUD projektów (GET/POST/GET/{id}/DELETE) | OK |
| study_cases.py | Study Cases — pełny CRUD, clone, compare, activate | OK |
| cases.py | Operacje na przypadkach: SLD, snapshot, actions/batch | OK |
| analysis_runs.py | Lista i szczegóły uruchomień analiz | OK |
| power_flow_runs.py | Power Flow runs — create, execute, results, trace, export | OK |
| protection_runs.py | Protection runs — create, execute, results, trace | OK |
| catalog.py | Katalog typów (linie, kable, transformatory, zabezpieczenia) | OK |
| health.py | Health endpoint — rozszerzony (db_ok, engine_ok, solvers) | UPDATED |
| case_runs.py | Case-bound runs — SC, PF, Protection per case | NEW |
| xlsx_import.py | Import sieci z XLSX | NEW |
| proof_pack.py | Generowanie pakietów dowodowych | OK |
| sld.py | Dane SLD dla przypadku | OK |
| project_archive.py | Eksport/import archiwum projektu (ZIP) | OK |
| comparison.py | Porównania wyników | OK |

### 1.2 Solvers (backend/src/network_model/solvers/)
| Solver | Typy zwarć | Status |
|--------|-----------|--------|
| short_circuit_iec60909.py | 3F, 1F, 2F, 2F+G | STABLE |
| short_circuit_core.py | Impedancje Z1, Z2, Z0, Y-bus | STABLE |
| power_flow_newton.py | Newton-Raphson | STABLE |
| power_flow_gauss_seidel.py | Gauss-Seidel | STABLE |
| power_flow_fast_decoupled.py | Fast Decoupled | STABLE |

### 1.3 Application Layer (backend/src/application/)
| Moduł | Opis | Status |
|-------|------|--------|
| proof_engine/ | Proof Generator, Equation Registry, LaTeX, Inspector | STABLE |
| proof_engine/packs/ | SC Asym, P14 PF, P16 Losses, Protection Settings, Q(U) | UPDATED |
| protection_analysis/ | Protection Evaluation Engine (IEC 60255) | STABLE |
| protection_settings/ | Dobór nastaw I>/I>> (metoda Hoppla) | NEW |
| xlsx_import/ | Import sieci z Excel | NEW |
| study_case/ | StudyCaseService | STABLE |
| analysis_run/ | AnalysisRunService | STABLE |
| wizard_actions/ | WizardActionService | STABLE |
| network_wizard/ | Kreator sieci | STABLE |

### 1.4 Infrastructure (backend/src/infrastructure/)
| Komponent | Opis | Status |
|-----------|------|--------|
| persistence/models.py | Full SQLAlchemy ORM (Project, StudyCase, AnalysisRun, etc.) | OK |
| persistence/db.py | Engine, Session, init_db | OK |
| persistence/unit_of_work.py | UoW pattern z repositories | OK |
| persistence/repositories/ | CRUD repositories | OK |

### 1.5 Network Model Core (backend/src/network_model/core/)
| Plik | Opis |
|------|------|
| graph.py | NetworkGraph (multigraph z NetworkX) |
| node.py | Node (PQ/PV/SLACK) |
| branch.py | Branch (R, X, B, impedancje) |
| switch.py | Switch (OPEN/CLOSED) |
| station.py | Station (kontener logiczny) |
| inverter.py | InverterSource |
| ybus.py | AdmittanceMatrixBuilder |

## 2. Frontend (TypeScript/React)

### 2.1 UI Modules (frontend/src/ui/)
- sld/, sld-editor/ — Edytor SLD z auto-layout
- results/, results-browser/, results-inspector/ — Przeglądarka wyników
- proof/ — Proof Inspector
- protection/, protection-results/, protection-diagnostics/ — Zabezpieczenia
- power-flow-results/ — Wyniki rozpływu
- case-manager/, study-cases/ — Zarządzanie przypadkami
- catalog/ — Katalog typów
- wizard/ — Kreator sieci K1-K10 (NEW)
- property-grid/, inspector/ — Inspektor właściwości
- layout/ — PowerFactory-style layout

### 2.2 Routes
- "" → Schemat jednokreskowy (SLD)
- #sld-view → Podgląd SLD (read-only)
- #results → Przegląd wyników
- #proof → Ślad obliczeń
- #protection-results → Wyniki zabezpieczeń
- #power-flow-results → Wyniki rozpływu
- #wizard → Kreator sieci K1-K10 (NEW)
- #protection-settings → Nastawy zabezpieczeń (NEW)

## 3. Docker
| Kontener | Port | Status |
|----------|------|--------|
| backend | 8000 (→18000 host) | OK |
| frontend | 3000 | OK |
| postgres | 5432 | OK |
| mongodb | 27017 | OK |
| redis | 6379 | OK |
| celery-worker | — | OK |

## 4. Testy
- 1600+ testów pytest (PASS)
- Pokrycie: solvery, proof engine, API, persistence, domain
