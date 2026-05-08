# SLD — Conscious Split Workflow

**Faza:** 0C (operator-grade SLD plan v2)
**Status:** backend zaimplementowany (44 testy zielone), frontend controller gotowy, integracja UI preview elektrycznego w trakcie
**Acceptance Invariant:** #5 — Świadomy split = osobna komenda, z preview, z potwierdzeniem, audytowana.

---

## Cel

Świadomy split = jawna decyzja operatora rozcięcia odcinka A-B w punkcie X
(stacja, ZK, słup, mufa). Operacja pokazuje **electrical_impact** PRZED
mutacją: liczbę unieważnionych wyników, kolejne hashe, stację typu który
zmieni się jeśli długość zostanie podzielona disproportionally.

**Kontrast z append-on-endpoint** (`SLD_STATION_APPEND_WORKFLOW.md`):
append nie rozcina nic — kończy ciąg w stacji. Split rozcina odcinek
w środku — wymaga świadomej decyzji bo unieważnia obliczenia.

---

## Backend (zaimplementowany)

### Operacja domenowa

`backend/src/enm/domain_operations.py:2392` — `insert_station_on_segment_sn(enm, payload)`

Sygnatura payload (rozszerzona o Phase 0C `dry_run`):
```json
{
  "segment_ref": "branch_007",
  "split_point": { "x": 320, "y": 180 },
  "inserted_object": {
    "kind": "station_mv_lv_inline",
    "name": "ST-X-001",
    "rated_voltage_kv": 15
  },
  "dry_run": true
}
```

### `dry_run=true` zwraca `electrical_impact`

```json
{
  "ok": true,
  "dry_run": true,
  "preview_enm_hash": "0xabcd...",
  "halves": [
    { "ref_id": "branch_007a", "endpoints": ["A", "X"], "length_km": 1.2 },
    { "ref_id": "branch_007b", "endpoints": ["X", "B"], "length_km": 0.8 }
  ],
  "inserted_station": {
    "ref_id": "ST-X-001",
    "station_type": "mv_lv_inline",
    "rated_voltage_kv": 15
  },
  "electrical_impact": {
    "invalidated_results": ["sc_run_42", "lf_run_18"],
    "affected_proof_packs": ["proof_42_sc", "proof_18_lf"],
    "topology_type_changes": [
      { "ref": "branch_007", "before": "linear", "after": "split_with_inline" }
    ],
    "catalog_inheritance": {
      "from_segment": "branch_007",
      "to_halves": ["branch_007a", "branch_007b"]
    },
    "length_assignment": {
      "branch_007a": 1.2,
      "branch_007b": 0.8,
      "method": "geometric_proportional_split"
    },
    "missing_data_after": []
  }
}
```

### `dry_run=false` (commit)

Mutacja ENM:
- Stary segment usunięty (`branch_007` → tombstone).
- Dwa nowe segmenty: `branch_007a`, `branch_007b` z dziedziczonym
  `catalog_ref`, `topology_kind`.
- Nowa stacja inline z portem wejściowym i wyjściowym SN.
- Event `SEGMENT_SPLIT` z `affected_object_refs[]` — invalidacja
  wyników identyczna jak w append.

### Testy

`backend/tests/enm/test_insert_station_dry_run.py` + `test_insert_station_electrical_impact.py`:
- `dry_run=true` zwraca pełny `electrical_impact` bez mutacji.
- Deterministyczny `preview_enm_hash` przy tych samych payload.
- `invalidated_results` zawiera wszystkie ResultSety referujące segment.
- `length_assignment` proporcjonalny do geometrii.
- `catalog_inheritance` zachowany dla obu połówek.
- Commit (`dry_run=false`) → ENM hash = `preview_enm_hash` z dry-run.

---

## Frontend (controller gotowy, integracja UI w trakcie)

### Controller FSM

`frontend/src/ui/sld/v2/workflow/ConsciousSplitController.ts` (399 linii)

State machine:
```
idle
  ↓ user clicks 'conscious-split-on-segment' on segment
segment-picked  (state.segmentRef set)
  ↓ user clicks split point on segment (snap to grid)
split-point-picked  (state.splitPoint set, state.objectKind null)
  ↓ user picks inserted object kind (station/ZK/słup/mufa)
object-kind-picked  (state.objectKind set)
  ↓ controller calls backend dry_run=true
preview-ready  (state.electricalImpact set, ghost halves rendered)
  ↓ user reviews electrical_impact + clicks "Zatwierdź"
committing  (state.pending true)
  ↓ backend dry_run=false ack
committed  → return to idle, snapshot refresh
```

Cancel z każdego stanu (`Esc`) → return to idle, model bez zmian.

### Menu integration

`frontend/src/ui/sld/v2/command/SldCommandService.ts:64,78`:
```ts
{ id: 'conscious-split-on-segment', labelPl: 'Podziel odcinek (świadomy)', group: 'budowa' }
```

Dostępne dla `cable_segment_sn` i `overhead_line_sn`.

### Status integracji UI

| Element | Status |
|---|---|
| Backend operation | ✅ R49/R50 |
| Backend `dry_run=true` z electrical_impact | ✅ Phase 0C |
| Backend event + invalidacja | ✅ R49 |
| Frontend controller FSM | ✅ Phase 0C |
| Frontend orchestrator | ✅ Phase 3 |
| Menu item | ✅ Phase 0C |
| **Snap to grid dla split point** | ✅ Phase 2 (Snap.ts + ViewportController) |
| **Preview overlay halves + ghost station** | ⬛ TODO Phase 3 polish |
| **Electrical impact panel** (modal lub side panel) | ⬛ TODO Phase 3 polish |
| **Dispatch handler w SldWorkspaceContainer** | ⬛ TODO Phase 3 polish |

R59+ wprowadziło informujący toast w `ACTION_ROADMAP_HINT_PL` żeby
operator wiedział, że backend jest gotowy ale UI preview elektrycznego
w trakcie.

---

## Komunikaty PL (COMMAND_FEEDBACK_PL planowane)

```ts
splitStarted: 'Kliknij punkt podziału odcinka.'
splitPreviewReady: 'Podgląd świadomego podziału odcinka.'
splitImpactSummary: (count) => `Operacja unieważni ${count} wyników obliczeń.`
splitCommitted: 'Odcinek został podzielony na dwa odcinki end-to-end.'
splitCancelled: 'Podział odcinka anulowany. Model bez zmian.'
```

---

## Decision Tree (append vs. split)

| Klik na | Workflow domyślny | Konsekwencje topologii |
|---|---|---|
| Bay (free endpoint) | **append-on-endpoint** | Ciąg kończy się w stacji. Brak rozcięcia. |
| Segment (środek odcinka) | **conscious-split** | Odcinek A-B → A-X + X-B. Wymaga preview. |
| Background | brak | toast „Klik na tło — brak akcji." |

`WorkflowOrchestrator.dispatchClick()` egzekwuje to drzewo decyzji
+ mutex (tylko jeden workflow aktywny).

---

## Sukces kryteria (mierzalne)

- [x] Backend `insert_station_on_segment_sn` z `dry_run=true` zwraca `electrical_impact`.
- [x] Pola `electrical_impact`: invalidated_results, affected_proof_packs, topology_type_changes, catalog_inheritance, length_assignment, missing_data_after.
- [x] Deterministyczny `preview_enm_hash` przy tych samych payload.
- [x] Commit (dry_run=false) ENM hash = preview_enm_hash z dry-run.
- [x] Frontend FSM pokrywa stany idle → segment-picked → split-point-picked → object-kind-picked → preview-ready → committing → committed.
- [x] Menu item `conscious-split-on-segment` widoczny na cable/overhead segments.
- [x] WorkflowOrchestrator dispatch click decision tree (bay→append, segment→split).
- [ ] Preview overlay renderuje halves + ghost inserted object (Phase 3).
- [ ] Electrical impact panel (modal lub aside) wyświetla invalidated_results count + lista (Phase 3).
- [ ] SldWorkspaceContainer.handleAction dispatchuje do controllera + wywołuje backend dry_run, potem commit (Phase 3).
- [ ] E2E spec Playwright: segment → menu split → split-point pick → object pick → preview → impact panel → commit → notification (Phase 3).

Cztery ostatnie pozycje to scope Phase 3 polish (planowany w kolejnym sprincie).
