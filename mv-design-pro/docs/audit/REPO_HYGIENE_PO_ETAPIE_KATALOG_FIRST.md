# REPO_HYGIENE_PO_ETAPIE_KATALOG_FIRST

Status: wiazacy dokument higieny repo dla aktualnego stanu katalog-first.

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

Sciezki rownolegle lub legacy nadal obecne w repo:
- `backend/src/api/domain_operations.py` - niezamontowany router,
- `backend/src/network_model/core/snapshot.py` - rownolegly model poza aktywna sciezka ENM,
- `backend/src/application/network_wizard/service.py` - nadal obslugiwany przez czesc endpointow katalogowych,
- `backend/src/api/solver_input.py` - poza aktywnym canonical-only torem.

Reguly higieny:
- nowa dokumentacja nie moze przypisywac funkcji produkcyjnych niezamontowanym routerom,
- nowa dokumentacja nie moze opisywac domkniecia katalog-first tam, gdzie w kodzie pozostaje obejscie legacy,
- binding docs maja pierwszenstwo nad starszymi szkicami i opisami eksperymentalnymi,
- wiazaca dokumentacja QA musi wskazywac tylko realne sciezki testow i guardow,
- aktywne frontendowe typy i scenariusze E2E nie moga utrwalac legacy payload aliases bez jawnego odnotowania tego dlugu w audycie.

Otwarty dlug higieny po aktualnych zmianach:
- `frontend/src/types/domainOps.ts` nadal zawiera pola zgodnosciowe `catalog_ref` i `from_bus_ref`,
- `frontend/e2e/catalog-enforcement.spec.ts`, `frontend/e2e/critical-run-flow.spec.ts` oraz `frontend/e2e/sld-editor-real-backend-flex.spec.ts` nadal wysylaja legacy pola `catalog_ref`, `transformer_catalog_ref` i `from_bus_ref`,
- guard `repo_hygiene_guard.py` wykrywa te miejsca i obecnie nie przechodzi na czysto.

Priorytet czyszczenia:
- zamknac mutujace endpointy katalogowe poza `domain-ops`,
- usunac lub jednoznacznie oznaczyc rownolegle stacki snapshot i solver-input,
- ujednolicic opis wynikow, White Box i raportow do aktywnego toru canonical-only,
- doprowadzic FE types i E2E do grep-zero dla legacy payload aliases katalog-first.
