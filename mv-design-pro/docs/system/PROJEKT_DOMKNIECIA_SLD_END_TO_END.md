# PROJEKT DOMKNIĘCIA SLD END-TO-END

## 1. Mapa stanu aktualnego

### Realne ścieżki i realny przepływ
- `#editor` jest kanonicznym wejściem do modelu i korzysta z jednego store symboli SLD: `frontend/src/ui/network-editor/NetworkEditorPage.tsx`, `frontend/src/ui/sld-editor/SldEditorStore.ts`.
- `#results` jest kanoniczną przestrzenią wyników, ale prawa kolumna nie renderuje jeszcze rzeczywistego SLD. Zamiast tego pokazuje shell sterowania overlay i placeholder viewer: `frontend/src/ui/results-workspace/ResultsWorkspacePage.tsx`, `frontend/src/ui/results-workspace/SldOverlayPanel.tsx`.
- `#proof` nadal prowadzi do pomocniczego, legacy widoku trace opartego o `ResultsInspectorPage` w trybie `TRACE`: `frontend/src/ui/results-inspector/LegacyTraceWorkspacePage.tsx`.
- Wynik tabelaryczny może dziś wskazać element modelu przez store selection i wrócić do edytora, ale nie otwiera jeszcze tego samego elementu w osadzonym SLD runu: `frontend/src/ui/results-workspace/RunViewPanel.tsx`.

### Miejsca heurystyk
- Mapowanie `selection -> trace step` w White Box jest heurystyczne. Frontend skanuje payload kroku i szuka stringów „podobnych do refów” zamiast korzystać z jawnego indeksu z backendu: `frontend/src/ui/results-inspector/ResultsInspectorPage.tsx`.
- Builder kontraktu wynikowego mapuje typy elementów do overlay kind przez słownik stringów i fallback do `DEVICE`, co nie jest jeszcze pełnym kontraktem semantycznym: `backend/src/domain/result_builder_v1.py`.
- Workspace wyników sam wybiera `latest_done_run_id` jako wygodny domyślny wybór, ale nie niesie jeszcze twardego kontekstu `run + snapshot + tryb`: `backend/src/application/read_models/results_workspace_projection.py`.

### Miejsca rozjazdu model vs wynik
- `ResultsWorkspacePage` ustawia `activeRunId`, ale nie promuje `run_header.snapshot_id` do globalnego `activeSnapshotId`: `frontend/src/ui/results-workspace/ResultsWorkspacePage.tsx`, `frontend/src/ui/app-state/store.ts`.
- `results-inspector` ma `snapshot_id` w `resultsIndex` i `extendedTrace`, ale UI nie ma jeszcze jawnego trybu „oglądasz Snapshot runu” kontra „oglądasz bieżący model”.
- Aktualny przycisk „Powrót do modelu” wraca do bieżącej przestrzeni modelu, a nie oferuje rozróżnienia na model żywy i model przypięty do runu: `frontend/src/ui/results-workspace/RunViewPanel.tsx`, `frontend/src/ui/results-workspace/SldOverlayPanel.tsx`.

### Miejsca rozjazdu wynik vs White Box
- `analysis-runs/{run_id}/results/trace` zwraca `snapshot_id` i listę kroków, ale kroki nie mają jeszcze jawnego `primary_element_ref`, `related_element_refs` i `roles`.
- `proof_pack` i `equipment_proof_pack` używają różnych kluczy identyfikacji elementu (`fault_node_id`, `connection_node_id`, `device_id`), więc nie ma jeszcze jednej osi `run_id + element_ref`.

### Miejsca rozjazdu wynik vs SLD
- Osadzony panel wynikowy nie korzysta z `SLDView`; jest tylko placeholderem: `frontend/src/ui/results-workspace/SldOverlayPanel.tsx`.
- Overlay wynikowy jest dziś rozszczepiony:
  - overlay runtime PR-16: `frontend/src/ui/sld-overlay/*`,
  - delta overlay: `frontend/src/ui/comparisons/*`, `frontend/src/ui/sld-overlay/sldDeltaOverlayStore.ts`,
  - lokalny adapter LF: `frontend/src/ui/sld-overlay/LoadFlowOverlayAdapter.ts`,
  - historyczny `SldResultOverlay`: `frontend/src/ui/results-inspector/types.ts`.
- Backend ma dwa równoległe tory overlay:
  - kanoniczny `ResultSetV1.overlay_payload`: `backend/src/api/result_contract_v1.py`, `backend/src/domain/result_contract_v1.py`,
  - osobny endpoint run overlay z `nodes/branches`: `backend/src/api/analysis_runs.py`, `backend/src/api/canonical_run_views.py`.

### Miejsca rozjazdu selection / URL / inspektor
- URL selection zna tylko `sel`, `type`, `name`. Nie przenosi w jednym serializerze pełnego kontekstu `run`, `snapshot`, `trace_step`, `view_mode`: `frontend/src/ui/navigation/urlState.ts`.
- `navigateTo(...)` zachowuje bieżący query z hasha, ale nie rozumie domenowo różnicy między selection modelu a selection runu: `frontend/src/ui/navigation/routes.ts`.
- `ResultsInspectorPage` synchronizuje selection z tabel i zewnętrznego store, ale robi to osobnym torem niż workspace wyników i osadzony SLD.

## 2. Model docelowy warstwa po warstwie

### Geometria
- Jeden pipeline geometrii dla SLD:
  `Snapshot -> symbol set -> geometry/layout -> render`.
- Ten sam symbol set i ta sama geometria mają być użyte:
  - w `#editor`,
  - w osadzonym SLD w `#results`,
  - w pomocniczym podglądzie run snapshot.
- Overlay wynikowy nie może zmieniać geometrii. Ma być osobną warstwą wizualną nad tym samym canvasem.
- Wynikowy SLD ma wykorzystywać `SLDView` albo ten sam renderer/canvas, nie osobny viewer wynikowy.

### Symbole
- Każdy symbol ma mieć jawne:
  - `element_ref`,
  - `element_type`,
  - `symbol_id`,
  - tryb prezentacji: `MODEL_CURRENT` albo `RUN_SNAPSHOT`.
- Powiązanie `symbol -> element -> overlay -> inspektor -> White Box` ma przechodzić przez `element_ref`, bez `bus_id/branch_id/target_id` jako konkurencyjnych kluczy UI.

### Interakcje
- Ten sam model selection dla:
  - SLD,
  - tabel wyników,
  - inspektora,
  - White Box,
  - raportu.
- URL ma nieść pełny kontekst:
  - `mode=run|batch|compare`,
  - `run=<id>`,
  - `snapshot=<id>`,
  - `view=current|run`,
  - `sel=<element_ref>`,
  - `type=<element_type>`,
  - `trace_step=<index>` opcjonalnie.
- Klik w wynik ma:
  1. ustawić selection,
  2. ustawić focus w osadzonym SLD,
  3. ustawić inspektor na ten element,
  4. umożliwić wejście do White Box bez utraty tego samego kontekstu.

### Wyniki
- `#results` staje się jednym stanowiskiem pracy:
  - lewa kolumna: lista runów i kontekst workspace,
  - środek: tabele wyników / metryki / status runu,
  - prawa kolumna: rzeczywisty read-only SLD z overlay.
- Overlay dla SLD wynikowego ma pochodzić z jednego kanonicznego źródła. Docelowo jest to `ResultSetV1.overlay_payload`, a nie osobny kontrakt `nodes/branches`.
- Workspace ma jawnie pokazywać:
  - `run_id`,
  - `snapshot_id`,
  - status runu,
  - czy aktywny model różni się od snapshotu runu.

### Inspektor
- Jeden inspektor SLD ma obsługiwać dwa tryby:
  - `MODEL_CURRENT`,
  - `RUN_SNAPSHOT`.
- W trybie run snapshot inspektor musi pokazywać:
  - tożsamość elementu,
  - typ techniczny,
  - katalog / źródło parametrów, jeśli dostępne,
  - parametry materializowane,
  - wyniki powiązane z elementem,
  - link do White Box i raportu,
  - status zgodności z bieżącym modelem.

### White Box
- Backend ma zwracać kontrakt trace z jawnie opisanym związkiem elementów z krokiem:
  - `primary_element_ref`,
  - `related_element_refs`,
  - `element_roles`.
- Frontend nie zgaduje już mapowania; tylko czyta indeks i prowadzi do właściwego kroku.
- White Box ma utrzymywać ten sam `run_id`, `snapshot_id`, `selection element_ref` co workspace wyników.

### Raport
- Raport ma być wywoływany w kontekście:
  `run_id + snapshot_id + selection(optional)`.
- Z poziomu UI raport ma być dostępny z:
  - workspace wyników,
  - White Box,
  - inspektora elementu w trybie wynikowym.
- Raport ma jawnie opisać, że dotyczy snapshotu runu, a nie bieżącej wersji modelu po zmianach.

### Selection / URL
- Jedna prawda URL dla wszystkich widoków wyniku i audytu.
- Jeden serializer/deserializer dla selection i run context.
- Brak lokalnych map selection tylko dla jednego ekranu.

## 3. Tryby pracy użytkownika

### Tryb edycji modelu
- Użytkownik pracuje na bieżącym snapshotcie modelu.
- SLD jest interaktywne i może uruchamiać operacje domenowe.
- Wyniki są tylko referencją do ostatniego runu, nie stanowią aktywnego źródła.

### Tryb wynikowy
- Użytkownik ogląda konkretny `run_id`.
- Prawa kolumna pokazuje ten sam SLD, ale w trybie read-only i z overlay.
- Zaznaczenie elementu działa identycznie jak w modelu, ale mutacje są zablokowane.

### Tryb audytu runu
- Użytkownik ogląda `run snapshot`.
- UI jawnie pokazuje `snapshot_id` i ostrzega, jeśli bieżący model jest już inny.
- Dostępny jest szybki przełącznik:
  - `Pokaż Snapshot runu`,
  - `Pokaż model bieżący`.

### Tryb White Box
- Użytkownik ogląda ślad tego samego `run_id`.
- Selection elementu ustawia odpowiedni krok trace bez heurystyki.
- White Box zachowuje linki do SLD, inspektora i raportu.

### Tryb raportu
- Raport działa jako końcowy widok tego samego kontekstu runu.
- Użytkownik może wrócić albo do audytu runu, albo do bieżącego modelu.

## 4. Model przejść

### Model -> analiza
- `#editor`
- walidacja gotowości
- `createAndExecuteRun`
- nawigacja do `#results?mode=run&run=<run_id>&view=run`

### Analiza -> wynik
- workspace ładuje `results workspace projection`
- wybiera wskazany `run_id`
- ładuje `results/index`, tabele, trace summary i overlay
- promuje `run_id` i `snapshot_id` do wspólnego kontekstu aplikacji

### Wynik -> osadzony SLD
- prawa kolumna renderuje realny `SLDView` na kanonicznych symbolach
- overlay pochodzi z kontraktu runu
- selection z tabeli centruje i podświetla ten sam element

### Wynik -> element
- klik wiersza tabeli ustawia:
  - `sel`,
  - `type`,
  - `view=run`,
  - fokus w osadzonym SLD,
  - stan inspektora

### Element -> inspektor
- inspektor czyta selection i tryb (`current` / `run`)
- pokazuje dane techniczne oraz wynikowe dla tego samego `element_ref`

### Element -> White Box
- White Box dostaje:
  - `run_id`,
  - `snapshot_id`,
  - `element_ref`
- przechodzi do kroku wskazanego przez backendowy indeks trace

### White Box -> raport
- raport otwiera się z tym samym `run_id + snapshot_id + element_ref`

### Raport -> model
- użytkownik może wrócić do:
  - `#editor?sel=<element_ref>` dla bieżącego modelu,
  - `#results?...&view=run` dla dalszego audytu snapshotu runu

### Wynik -> Snapshot runu
- przełącznik `Snapshot runu`
- UI blokuje mutacje
- banner pokazuje zgodność lub rozjazd z modelem bieżącym

### Wynik -> bieżący model
- przełącznik `Model bieżący`
- selection zostaje zachowany
- UI pokazuje, że wynik dotyczył starszego snapshotu, jeśli rozjazd istnieje

## 5. Miejsca zmian w repo

### Frontend — do zmiany
- `frontend/src/ui/results-workspace/ResultsWorkspacePage.tsx`
- `frontend/src/ui/results-workspace/SldOverlayPanel.tsx`
- `frontend/src/ui/results-workspace/RunViewPanel.tsx`
- `frontend/src/ui/results-workspace/store.ts`
- `frontend/src/ui/results-workspace/types.ts`
- `frontend/src/ui/results-inspector/ResultsInspectorPage.tsx`
- `frontend/src/ui/results-inspector/store.ts`
- `frontend/src/ui/results-inspector/api.ts`
- `frontend/src/ui/results-inspector/types.ts`
- `frontend/src/ui/results-inspector/LegacyTraceWorkspacePage.tsx`
- `frontend/src/ui/proof/TraceViewer.tsx`
- `frontend/src/ui/proof/traceUrlState.ts`
- `frontend/src/ui/navigation/urlState.ts`
- `frontend/src/ui/navigation/routes.ts`
- `frontend/src/ui/app-state/store.ts`
- `frontend/src/ui/sld/SLDView.tsx`
- `frontend/src/ui/sld/SLDViewPage.tsx`
- `frontend/src/ui/sld/inspector/useSldInspectorSelection.ts`
- `frontend/src/ui/sld-overlay/overlayStore.ts`

### Backend — do zmiany
- `backend/src/api/analysis_runs.py`
- `backend/src/api/canonical_run_views.py`
- `backend/src/api/result_contract_v1.py`
- `backend/src/api/results_workspace.py`
- `backend/src/api/proof_pack.py`
- `backend/src/api/equipment_proof_pack.py`
- `backend/src/application/analysis_dispatch/service.py`
- `backend/src/application/read_models/results_workspace_projection.py`
- `backend/src/domain/result_builder_v1.py`
- `backend/src/domain/result_contract_v1.py`
- `backend/src/enm/canonical_analysis.py`

### Frontend — do wygaszenia lub degradacji do roli pomocniczej
- `frontend/src/ui/results-inspector/LegacyTraceWorkspacePage.tsx`
- wszystkie miejsca, w których akcje SLD kończą się `notify(...)` zamiast realnej nawigacji do workspace / White Box / raportu
- historyczny tor `SldResultOverlay` jako osobny kontrakt UI, jeśli overlay zostanie przełączony na `ResultSetV1.overlay_payload`

### Testy — do zmiany lub dodania
- `frontend/src/ui/results-workspace/__tests__/ResultsWorkspacePage.test.tsx`
- `frontend/src/ui/results-workspace/__tests__/RunViewPanel.test.tsx`
- `frontend/src/ui/results-workspace/__tests__/SldOverlayPanel.test.tsx`
- `frontend/src/ui/results-workspace/__tests__/store.test.ts`
- `frontend/src/ui/navigation/__tests__/urlState.test.ts`
- `frontend/src/ui/proof/__tests__/TraceViewer.test.tsx`
- `frontend/e2e/critical-run-flow.spec.ts`
- nowe E2E dla `run snapshot` vs `model bieżący`
- backendowe testy kontraktu `analysis-runs`, `result contract v1`, `results workspace projection`, `trace -> element`

### Dokumentacja — do aktualizacji
- `docs/system/SPEC_WYNIKI_SNAPSHOT_WHITE_BOX_RAPORT.md`
- `docs/system/SPEC_SELECTION_URL_INSPEKTOR.md`
- `docs/system/SPEC_SLD_WARSTWA_PO_WARSTWIE.md`
- `docs/ui/UX_WYNIKI_I_OSADZONY_SLD.md`
- `docs/ui/UX_AUDYT_WYNIKU_VS_BIEZACY_MODEL.md`
- `docs/ui/UX_STANOWISKO_PRACY_PROJEKTANTA_I_ANALITYKA_SN.md`
- `docs/sld/SLD_WYNIKOWY_READ_ONLY_SPEC.md`
- `docs/sld/SLD_GEOMETRIA_SYMBOLE_INTERAKCJE.md`
- `docs/qa/MACIERZ_TESTOW_WYNIKI_WHITE_BOX_SLD.md`
- `docs/audit/AUDYT_ETAPU_OSADZONE_SLD_I_AUDYT_RUNU.md`

## 6. Definition of Done

### Funkcjonalna
- `#results` ma realny, osadzony, read-only SLD korzystający z tej samej geometrii co `#editor`.
- Klik wyniku prowadzi do tego samego elementu w tabeli, osadzonym SLD, inspektorze i White Box.
- White Box działa bez heurystyk `selection -> trace`.
- Raport jest dostępny z tego samego kontekstu runu.

### Architektoniczna
- Jeden kontrakt identyfikacji elementu: `element_ref`.
- Jeden kontrakt kontekstu wyniku: `run_id + snapshot_id + mode`.
- Brak osobnego viewer-a wynikowego z własną geometrią.
- Overlay nie mutuje geometrii i pochodzi z jednego kanonicznego źródła.

### Audytowa
- UI jawnie rozróżnia `Snapshot runu` od `modelu bieżącego`.
- Każdy widok wynikowy pokazuje `run_id` i `snapshot_id`.
- White Box i raport wskazują ten sam snapshot co wynik.

### Ergonomiczna
- Brak pustej lub pozornej prawej kolumny.
- Brak ślepych zaułków `wynik -> element -> White Box -> raport -> model`.
- Baner rozjazdu modelu i runu jest widoczny i zrozumiały.

### Przemysłowa
- Ten sam Snapshot daje tę samą geometrię w edytorze i w wynikach.
- Brak heurystycznego mapowania selection do trace.
- Testy backendowe, frontendowe i E2E potwierdzają spójność `run / snapshot / selection / trace / SLD`.
