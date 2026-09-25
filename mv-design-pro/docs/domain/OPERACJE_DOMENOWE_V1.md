# OPERACJE DOMENOWE V1 — KANON WIĄŻĄCY

> Dokument wiążący: definiuje zamknięty zestaw operacji domenowych V1.
> Kanon nazw, kontrakty JSON, mapowanie na kod i testy.
> Patrz też: `ENM_OP_CONTRACTS_CANONICAL_FULL.md` (szczegółowe schematy JSON).

## 1. ZAMKNIĘTY ZESTAW OPERACJI V1

| # | Operacja | Cel | Plik źródłowy |
|---|----------|-----|----------------|
| 1 | `add_grid_source_sn` | Dodaj GPZ (źródło SN) | `src/enm/domain_operations.py` |
| 2 | `continue_trunk_segment_sn` | Kontynuuj magistralę SN | `src/enm/domain_operations.py` |
| 3 | `insert_station_on_segment_sn` | Wstaw stację SN/nN w odcinek | `src/enm/domain_operations.py` |
| 4 | `start_branch_segment_sn` | Odgałęzienie od portu | `src/enm/domain_operations.py` |
| 5 | `insert_section_switch_sn` | Wstaw łącznik/sekcjonowanie | `src/enm/domain_operations.py` |
| 6 | `connect_secondary_ring_sn` | Połączenie wtórne (ring) | `src/enm/domain_operations.py` |
| 7 | `set_normal_open_point` | Ustaw NOP | `src/enm/domain_operations.py` |
| 8 | `add_transformer_sn_nn` | Dodaj trafo SN/nN | `src/enm/domain_operations.py` |
| 9 | `assign_catalog_to_element` | Przypisz katalog + materializacja | `src/enm/domain_operations.py` |
| 10 | `update_element_parameters` | Jawne parametry ręczne | `src/enm/domain_operations.py` |
| 11 | `refresh_snapshot` | Odśwież readiness/views bez mutacji | `src/enm/domain_operations.py` |

## 2. KONTRAKT ODPOWIEDZI (KAŻDA OPERACJA)

```json
{
  "snapshot": {},
  "logical_views": {
    "trunks": [],
    "branches": [],
    "secondary_connectors": [],
    "terminals": [],
    "line_fields": []
  },
  "readiness": {
    "ready": true,
    "blockers": [],
    "warnings": []
  },
  "fix_actions": [],
  "changes": {
    "created_element_ids": [],
    "updated_element_ids": [],
    "deleted_element_ids": []
  },
  "selection_hint": null,
  "audit_trail": [],
  "domain_events": [],
  "materialized_params": {},
  "layout": {
    "layout_hash": "sha256:...",
    "layout_version": "1.0"
  }
}
```

## 3. BRAMKA KATALOGOWA (DOUBLE GATE)

Operacje `continue_trunk_segment_sn`, `start_branch_segment_sn`, `connect_secondary_ring_sn`
wymagają `catalog_ref` w payload segmentu. Brak → `error_code: "catalog.ref_required"`.

Operacje `insert_station_on_segment_sn`, `add_transformer_sn_nn`
wymagają `transformer_catalog_ref` gdy `transformer.create=True`.

## 4. PIPELINE ANALIZY V1

```
ENM Snapshot (dict)
    ↓ EnergyNetworkModel.model_validate()
EnergyNetworkModel (Pydantic)
    ↓ map_enm_to_network_graph() [src/enm/mapping.py]
NetworkGraph (solver-level)
    ↓ PowerFlowNewtonSolver / ShortCircuitIEC60909Solver
Results (frozen dataclass)
    ↓ ProofPackBuilder
ProofDocument (LaTeX/PDF/JSON)
```

## 5. TESTY

| Test | Plik | Co weryfikuje |
|------|------|---------------|
| Operacje domenowe | `tests/enm/test_domain_operations.py` | 11 operacji, readiness, determinizm |
| Golden networks | `tests/enm/test_golden_network_v1_e2e.py` | Pełna sekwencja V1 (10 kroków) |
| Pipeline analizy | `tests/e2e/test_v1_analysis_pipeline.py` | ENM→solver→results E2E |
| Determinizm PF | `tests/e2e/test_pf_determinism_workflow.py` | 10× hash PF |
| Determinizm SC | `tests/e2e/test_v1_analysis_pipeline.py` | 10× hash SC |
| Bramka PV/BESS | `tests/enm/test_domain_operations.py::TestPVBESSTransformerGate` | PV/BESS wymaga trafo |

## 6. STRAŻNICY CI

- `scripts/guard_ux_flow_v1.py` — sprawdza istnienie testów, mapping, walidacji
- `scripts/canonical_ops_guard.py` — sprawdza kanon nazw operacji
- `scripts/pcc_zero_guard.py` — grep-zero PCC
- `scripts/catalog_gate_guard.py` — bramka katalogowa
