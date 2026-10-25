# GIS R15 — źródło prawdy, gotowość obliczeń i dowód wyników

**25.10.2026. Stan: kod na gałęzi R15, produkcja NO-GO.**

## Naprawione problemy R14

**P1 — fałszywe identyfikatory.** Dotychczasowy skan dowolnego zagnieżdżonego `meta.ref_id` mógł uznać napis z metadanych za rzeczywisty element elektryczny. R15 indeksuje wyłącznie kolekcje `EnergyNetworkModel` i jawnie strukturalne `substations[].meta.field_specs[].field_ref`. Weryfikacja odrzuca fikcyjny wpis poza tymi strukturami.

**P1 — kolejność autoryzacji.** `KluczTwin` jako zależność FastAPI był obliczany przed wejściem do funkcji i przed odmową za brak laboratoryjnego tokenu. R15 weryfikuje warunki środowiska i token przed wywołaniem jedynej kanonicznej funkcji rozwiązującej case_id -> klucz projektu. Dodano test, który odmawia dostępu i potwierdza brak wywołania lookup.

**P0 — fałszywy sukces częściowego E2E.** R13/R14 mógł zlecać LF i SC bez jawnego sprawdzenia `GET /api/cases/{case_id}/enm/readiness`. R15 najpierw sprawdza rewizję oraz `analysis_readiness.load_flow` i `short_circuit_3f`. Jeśli ENM jest zapisany, ale obliczenia nie mogą być wykonane, raport otrzymuje `ENM_COMMITTED_ANALYSES_INCOMPLETE`, odróżniony od `FAILED_ATOMIC_COMMIT_STATE_UNCERTAIN`; polecenie CLI zwraca kod błędu. Nigdy nie zgadujemy wyników solvera.

**P0 — fałszywy raport użytkownika.** Dotychczas mapa ufała zgodności deklarowanej w lokalnym JSON. R15 `gisBackendEvidenceR15.ts` wykonuje rzeczywiste GET do kanonicznych endpointów odczytu ENM, statusów obu biegów, migawek i wyników. Weryfikuje identyfikator przypadku, rewizję, hash sieci, `FINISHED`, rozłączne identyfikatory biegów oraz `deterministic_signature` z odpowiedzi backendu. Dopiero po pozytywnej kontroli otwiera możliwość mapowania geometrii DIGPRO do obiektów ENM w istniejącej mapie. Dane operatora nadal nie są uwierzytelnione samym raportem.

## Kontrakty i testy

- `backend/src/application/gis/digpro_atomic_r14.py`, `backend/src/api/gis_atomic_r14.py`, testy regresji API i indeksowania.
- `tools/gis/digpro_enm_e2e_r13.mjs`: dodatkowa kontrola gotowości LF/SC i rozstrzygający status po zatwierdzeniu.
- `frontend/src/ui/gis/gisBackendEvidenceR15.ts` + `frontend/src/ui2/spaces/model/MapaGisR11.tsx`: poświadczenie przez backend.
- `frontend/src/ui/gis/__tests__/gisBackendEvidenceR15.test.ts`: 8 nowych prób pozytywnych i negatywnych.
- `backend/tests/application/test_gis_atomic_r14.py`: 4 nowe negatywne próby identyfikatorów; `backend/tests/api/test_gis_atomic_r14_guards.py`: odmowa przed rozwiązaniem projektu.
- `tools/gis/test_digpro_enm_e2e_r13.mjs`: 4 nowe próby gotowości i raportowania.

## Wynik weryfikacji

**17/17 PASS lokalnie** na odtworzonym rdzeniu R14 z zaostrzonym indeksem elementów ENM (13 prób historycznych + 4 próby R15). **Pełne CI TypeScript/Python/Node na gałęzi GitHub niepotwierdzone** — status nie jest automatycznie PASS.

## Nadal blokuje produkcję

Brak weryfikowanego rzeczywistego profilu eksportu ENEA DIGPRO i mapowania PortRef, firmowej kontroli uprawnień, transakcji wieloprocesowej ENM, pełnego e2e z prawdziwym serwerem solverów i wynikami liczbowymi; brak wzrokowego odbioru SldCanvasV3 (B-02 nadal odrzucone). Przypadki walidacyjne IEC 60909 i źródła danych należy wskazać przed ogłoszeniem GO.

**Werdykt:** wzmacniamy spójność i dowodowość wykonania, ale nie przedstawiamy przygotowanych testów ani oczekujących workflowów jako potwierdzonego wdrożenia produkcyjnego.
## Próba rzeczywistej integracji HTTP do ENM

W gałęzi dodano backend/tests/api/test_gis_atomic_r15_real_http.py. Test tworzy rzeczywisty projekt i przypadek w testowym UoW, montuje produkcyjny router odczytu ENM i laboratoryjny adapter R14, a operacje wykonuje rzeczywistym dyspozytorem. Cztery przebiegi: prawidłowe add_grid_source_sn i dokładnie jedna rewizja; błąd drugiego kroku bez zapisu pierwszego; stary hash i brak zapisu; odmowa powtórzonego planu o tej samej bazie. Nie jest to test solwera na pełnej sieci ani danych ENEA.

Nowa kontrola selekcji mapy przy zmianie przypadku wymaga równocześnie zgodności case_id oraz hash/revision, aby podobne migawki dwóch przypadków nie użyły starego lokalnego powiązania. Kod testowy HTTP oraz testy TypeScript zostały zapisane, lecz nie oznaczono ich jako zaliczonych przed wynikami CI.

## Rozdział kryteriów odbioru

- SYNTHETIC_UNIT_PASS: 17/17 lokalnie, rdzeń R14 + cztery próby R15, bez produkcyjnego backendu.
- FULL_BACKEND_E2E: NIEPOTWIERDZONE (test HTTP zapisany, wykonanie GitHub Actions oczekuje).
- NUMERIC_LF_SC_VALIDATION: NIEPOTWIERDZONE.
- SLD_VISUAL_ACCEPTANCE: ODRZUCONE B-02.
- PRODUCTION_GO: NIEUDZIELONE.