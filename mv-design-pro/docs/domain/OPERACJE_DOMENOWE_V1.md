# OPERACJE DOMENOWE — BRAMKA KATALOGOWA, PIPELINE ANALIZY, TESTY

> Dokument wiążący dla bramki katalogowej operacji budowy sieci SN, pipeline'u analizy
> i testów sekwencji V1. Rejestr operacji, pola ładunków, kopertę wywołania, odpowiedź
> i przykłady wykonane przez API opisuje WYŁĄCZNIE
> `ENM_OP_CONTRACTS_CANONICAL_FULL.md` (generowany z rejestru
> `backend/src/domain/canonical_operations.py`, pilnowany testem
> `backend/tests/ci/test_dokument_kontraktow_operacji.py`).

## 1. ZESTAW OPERACJI

Dawny „zamknięty zestaw V1” (11 operacji) jest podzbiorem rejestru
`CANONICAL_OPERATIONS` — rejestr ma 50 operacji w sześciu kategoriach (sieć SN, stacja
SN/nN, źródła i wytwórcy, zabezpieczenia, operacje uniwersalne, sieć nN). Tabela operacji
z polami ładunku i handlerem: `ENM_OP_CONTRACTS_CANONICAL_FULL.md` §4; operacje usunięte
z powodami: §5.

## 2. KONTRAKT ODPOWIEDZI

Pola odpowiedzi każdej operacji (`snapshot`, `changes`, `domain_events`, `selection_hint`,
`audit_trail`, `readiness`, `fix_actions`, `logical_views`, `materialized_params`, `layout`,
`semantic_issues`, przy odmowie `error` i `error_code`): `ENM_OP_CONTRACTS_CANONICAL_FULL.md` §2.

## 3. BRAMKA KATALOGOWA (DOUBLE GATE)

Operacje `continue_trunk_segment_sn`, `start_branch_segment_sn`, `connect_secondary_ring_sn`
wymagają pozycji katalogowej segmentu (`segment.catalog_ref` albo `catalog_binding`).
Brak → `error_code: "catalog.ref_required"`.

`insert_station_on_segment_sn` przy `transformer.create=True` wymaga
`transformer.transformer_catalog_ref`; `add_transformer_sn_nn` wymaga
`transformer_catalog_ref` albo `catalog_binding`. Brak → `catalog.ref_required`.

Druga bramka (API, `api/domain_ops_policy.py`): referencja spoza katalogu modelu →
HTTP 422 `catalog.item_not_found` bez zmiany modelu.

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
| Kontrakt dokumentu operacji | `tests/ci/test_dokument_kontraktow_operacji.py` | Rejestr = dokument; każda operacja wykonana przez API z deklarowanym wynikiem |
| Specyfikacja = handler | `tests/ci/test_spec_operacji_rowna_odczytom_handlera.py` | Pola ładunku rejestru = klucze czytane przez handler |
| Operacje domenowe | `tests/enm/test_domain_operations.py` | Operacje budowy sieci SN, readiness, determinizm |
| Golden networks | `tests/enm/test_golden_network_v1_e2e.py` | Pełna sekwencja V1 krok po kroku |
| Pipeline analizy | `tests/e2e/test_v1_analysis_pipeline.py` | ENM→solver→results E2E |
| Determinizm PF | `tests/e2e/test_pf_determinism_workflow.py` | 10× hash PF |
| Determinizm SC | `tests/e2e/test_v1_analysis_pipeline.py` | 10× hash SC |
| Bramka PV/BESS | `tests/enm/test_domain_operations.py::TestPVBESSTransformerGate` | PV/BESS wymaga trafo |

## 6. STRAŻNICY CI

- `scripts/guard_ux_flow_v1.py` — sprawdza istnienie testów, mapping, walidacji
- `scripts/canonical_ops_guard.py` — rejestr operacji = handlery (oba kierunki), kanon nazw
- `scripts/pcc_zero_guard.py` — grep-zero PCC
- `scripts/catalog_gate_guard.py` — bramka katalogowa
