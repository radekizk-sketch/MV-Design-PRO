# REPO_HYGIENE_PO_FAZIE_KATALOG_FIRST

Status: wiążący dokument higieny repo dla aktualnego stanu V12.5.

Aktywne workflow i guardy CI:
- `.github/workflows/docs-guard.yml` uruchamia `mv-design-pro/scripts/docs_guard.py`,
- `.github/workflows/arch-guard.yml` uruchamia `mv-design-pro/scripts/arch_guard.py` oraz `mv-design-pro/scripts/repo_hygiene_guard.py`,
- `.github/workflows/python-tests.yml` uruchamia backendowe testy oraz guardy katalog-first, w tym `repo_hygiene_guard.py`, `pcc_zero_guard.py`, `domain_no_guessing_guard.py`, `catalog_binding_guard.py`, `catalog_enforcement_guard.py` i `catalog_gate_guard.py`.

Aktywny surface produkcyjny:
- `backend/src/api/main.py`
- `backend/src/api/enm.py`
- `backend/src/api/catalog.py`
- `backend/src/api/analysis_runs.py`
- `backend/src/api/power_flow_runs.py`
- `backend/src/api/sld.py`
- `backend/src/enm/*`

Ścieżki równoległe lub legacy nadal obecne w repo:
- `backend/src/api/domain_operations.py` - niezamontowany router,
- `backend/src/network_model/core/snapshot.py` - równoległy model poza aktywną ścieżką ENM,
- `backend/src/application/network_wizard/service.py` - nadal obsługiwany przez część endpointów katalogowych,
- `backend/src/api/solver_input.py` - poza aktywnym canonical-only torem.

Reguły higieny:
- nowa dokumentacja nie może przypisywać funkcji produkcyjnych niezamontowanym routerom,
- nowa dokumentacja nie może opisywać domknięcia katalog-first tam, gdzie w kodzie pozostaje obejście legacy,
- binding docs mają pierwszeństwo nad starszymi szkicami i opisami eksperymentalnymi,
- wiążąca dokumentacja QA musi wskazywać tylko realne ścieżki testów i guardów,
- aktywne frontendowe typy i scenariusze E2E nie mogą utrwalać legacy payload aliases bez jawnego odnotowania tego długu w audycie.

Otwarty dług higieny po aktualnych zmianach:
- `frontend/src/types/domainOps.ts` nadal zawiera pola zgodnościowe `catalog_ref` i `from_bus_ref`,
- `frontend/e2e/catalog-enforcement.spec.ts`, `frontend/e2e/critical-run-flow.spec.ts` oraz `frontend/e2e/sld-editor-real-backend-flex.spec.ts` nadal wysyłają legacy pola `catalog_ref`, `transformer_catalog_ref` i `from_bus_ref`,
- guard `repo_hygiene_guard.py` wykrywa te miejsca i obecnie nie przechodzi na czysto.

Priorytet czyszczenia:
- zamknąć mutujące endpointy katalogowe poza `domain-ops`,
- usunąć lub jednoznacznie oznaczyć równoległe stacki snapshot i solver-input,
- ujednolicić opis wyników, White Box i raportów do aktywnego toru canonical-only,
- doprowadzić FE types i E2E do grep-zero dla legacy payload aliases katalog-first.
