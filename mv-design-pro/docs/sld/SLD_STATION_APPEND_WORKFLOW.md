# SLD — Append-on-Endpoint Workflow

**Faza:** 0B (operator-grade SLD plan v2)
**Status:** backend zaimplementowany (44 testy zielone), frontend controller gotowy, integracja UI ghost-preview w trakcie
**Acceptance Invariant:** #4 — Append-on-endpoint = domyślny workflow tworzenia stacji.

---

## Cel

Operator dodaje stację na końcu istniejącego ciągu SN naturalnym ruchem
„zakończ tu" — bez rozcinania odcinka. To kanoniczny workflow inżynierski:
ciąg kończy się W stacji (pole wejściowe stacji jest endpointem run-a),
a kolejny ciąg startuje Z innego pola tej samej stacji.

**Anti-pattern (do unikania):** wstawianie stacji w środku odcinka A-B
(rozcięcie na A-X i X-B) jako default. Split jest świadomą operacją
udokumentowaną w `SLD_CONSCIOUS_SPLIT_WORKFLOW.md`.

---

## Backend (zaimplementowany)

### Operacja domenowa

`backend/src/enm/domain_operations.py:4805` — `append_station_on_endpoint(enm, payload)`

Sygnatura payload:
```json
{
  "run_ref": "run_001",
  "endpoint_port_ref": "bay_004:port_out",
  "station_template": {
    "name": "ST-NEW-01",
    "station_type": "mv_lv_terminal",
    "rated_voltage_kv": 15,
    "bays": [...]
  },
  "dry_run": false
}
```

Walidacje (`backend/src/enm/validator.py`):
- `endpoint_port_ref` musi wskazywać port `sn_output` na BUS oznaczonym
  `topology_terminal=true` (free endpoint).
- Run nie może być zamknięty na tym endpoincie (`nop_station_ref` puste
  na tym końcu).
- Voltage compatibility: `rated_voltage_kv` stacji = `base_voltage_kv` run-a.

Emitowany event: `STATION_APPENDED_ON_ENDPOINT` z polami:
- `affected_object_refs[]` — lista refów wymagających rewalidacji
  (run, endpoint bay, nowa stacja, jej bays, jej trafa).
- `audit_chain.input_hash`, `audit_chain.semantic_hash` — deterministyczne.

Invalidacje wyników (`backend/src/application/analysis_dispatch/`):
- Każdy ResultSet zawierający `affected_object_refs` → status `OUTDATED`.
- Proof packs odwołujące się do tych elementów → `outdated`.
- Readiness gate: stacja domyślnie w stanie `partial` (catalog refs to do).

### Testy

`backend/tests/enm/test_append_station_on_endpoint.py` (część 44 testów Phase 0B/0C/4):
- Deterministyczny `enm_hash` przed i po append.
- Walidator odrzuca append na zamkniętym endpoincie.
- Walidator odrzuca voltage mismatch.
- `dry_run=true` zwraca preview bez mutacji ENM.
- Event `STATION_APPENDED_ON_ENDPOINT` zawiera prawidłowy `affected_object_refs[]`.
- Invalidacja: ResultSet referujący run → status outdated po append.

---

## Frontend (controller gotowy, integracja UI w trakcie)

### Controller FSM

`frontend/src/ui/sld/v2/workflow/AppendOnEndpointController.ts` (299 linii)

State machine:
```
idle
  ↓ user clicks 'append-station-on-endpoint' on bay (free endpoint)
endpoint-picked  (state.endpointPortRef set)
  ↓ user picks station type from picker
station-type-picked  (state.stationType set)
  ↓ controller computes ghost preview (segment + station footprint)
preview-ready  (state.ghost set)
  ↓ user clicks "Zatwierdź" → backend executeDomainOperation
committing  (state.pending true)
  ↓ backend ack
committed  → return to idle, snapshot refresh
```

Cancel z każdego stanu (`Esc`) → return to idle, ghost zniknięty, model bez zmian.

### Menu integration

`frontend/src/ui/sld/v2/command/SldCommandService.ts:55`:
```ts
{ id: 'append-station-on-endpoint', labelPl: 'Zakończ ciąg w stacji', group: 'budowa' }
```

`getMenuActions(kind, ctx)` filtr (linia 144): akcja disabled gdy
`ctx.bayIsRunEndpoint === false` z reasonem
„Pole nie jest końcem ciągu. Najpierw wyprowadź ciąg lub wybierz endpoint."

### Orchestrator

`frontend/src/ui/sld/v2/workflow/WorkflowOrchestrator.ts` zapewnia:
- mutex (jeden workflow naraz)
- routing dispatch click → append (gdy kind=bay) lub split (gdy kind=segment)
- ESC cancel z dowolnego stanu

### Status integracji UI

| Element | Status |
|---|---|
| Backend operation | ✅ R49 |
| Backend validator | ✅ R49 |
| Backend event + invalidacja | ✅ R49 |
| Frontend controller FSM | ✅ Phase 0B |
| Frontend orchestrator | ✅ Phase 3 |
| Menu item + disabled logic | ✅ Phase 0B |
| **Ghost preview render w CadOverlay** | ⬛ TODO Phase 3 polish |
| **Modal: picker typu stacji** | ⬛ TODO Phase 3 polish |
| **Dispatch handler w SldWorkspaceContainer** | ⬛ TODO Phase 3 polish |

R59+ wprowadziło informujący toast w `ACTION_ROADMAP_HINT_PL` żeby
operator wiedział, że backend jest gotowy ale UI integracja w trakcie.

---

## Komunikaty PL (COMMAND_FEEDBACK_PL planowane)

```ts
appendStarted: 'Wskaż punkt zakończenia odcinka.'
appendEndpointPicked: 'Wybrano koniec odcinka. Wybierz typ stacji.'
appendPreviewReady: 'Podgląd: odcinek zostanie zakończony w stacji.'
appendCommitted: 'Utworzono stację na końcu odcinka i przypięto port wejściowy SN.'
appendCancelled: 'Operacja anulowana. Model bez zmian.'
continueFromStation: 'Kontynuuj ciąg z portu wyjściowego stacji.'
```

---

## Sukces kryteria (mierzalne)

- [x] Backend `append_station_on_endpoint` operacja zwraca deterministyczny `enm_hash`.
- [x] Walidator odrzuca: zamknięty endpoint, voltage mismatch, brakujący `endpoint_port_ref`.
- [x] Event `STATION_APPENDED_ON_ENDPOINT` zawiera `affected_object_refs[]`.
- [x] Invalidacja: ResultSet outdated po append.
- [x] Frontend FSM controller pokrywa stany idle → endpoint-picked → station-type-picked → preview-ready → committing → committed.
- [x] Menu item `append-station-on-endpoint` widoczny na bay'u, disabled na non-endpoint.
- [x] WorkflowOrchestrator zapewnia mutex.
- [ ] CadOverlay renderuje ghost preview (segment + station footprint).
- [ ] Modal pickera typu stacji (7 typów RMU + GPZ).
- [ ] SldWorkspaceContainer.handleAction dispatchuje do controllera + wywołuje backend.
- [ ] E2E spec Playwright: bay → menu append → picker → preview → commit → notification.

Trzy ostatnie pozycje to scope Phase 3 polish (planowany w kolejnym sprincie).
