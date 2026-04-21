# Scenariusz uruchomieniowy — Test E2E

## Cel

Kanoniczny scenariusz E2E weryfikujący pełny cykl projektowania sieci SN/nN.
Test symuluje 15 kroków inżyniera OSD z asercjami Snapshot delta.

## Kroki scenariusza

| Krok | Operacja | Asercja |
|------|----------|---------|
| 1 | add_grid_source_sn | snapshot.sources.length > 0 |
| 2 | continue_trunk_segment_sn | snapshot.branches.length > 0 |
| 3 | continue_trunk_segment_sn | branches += 1 |
| 4 | continue_trunk_segment_sn | branches += 1 |
| 5 | insert_station_on_segment_sn | snapshot.substations.length > 0 |
| 6 | start_branch_segment_sn | branches += 1 |
| 7 | insert_station_on_segment_sn | substations += 1 |
| 8 | connect_secondary_ring_sn | corridors[0].corridor_type == "ring" |
| 9 | set_normal_open_point | corridors[0].no_point_ref != null |
| 10 | add_nn_load | snapshot.loads.length > 0 |
| 11 | add_converter_source | snapshot.generators.length > 0 |
| 12 | add_converter_source | generators += 1 |
| 13 | add_relay | snapshot.protection_assignments.length > 0 |
| 14 | run_power_flow | wynik: napięcia + prądy (brak 500) |
| 15 | run_short_circuit | wynik: Ik'' + ip + WhiteBox (brak 500) |

## Warunki

- Każdy krok: snapshot_before ≠ snapshot_after (delta > 0)
- Brak błędów 500 w żadnym kroku
- SLD renderuje się po każdym kroku (brak błędów konsoli)
- 100× powtórzenie → identyczny hash Snapshot końcowego

## Testy

### Frontend (Vitest)

- `uxStartupScenario.test.ts` — weryfikacja pokrycia operacji w ModalRegistry
- `operationSnapshotEnforcement.test.ts` — kontrakt DomainOpResponseV1

### Backend (pytest)

- `test_readiness_fix_actions.py` — FixAction completeness guard
- `test_enm_validator.py` — walidacja ENM (istniejący)

### CI Guards

- `fix_action_completeness_guard.py` — każdy BLOCKER ma FixAction
- `dead_click_guard.py` — brak martwych kliknięć w menu kontekstowym

## Deterministyczność

Test `determinism_100x_snapshot_hash` powtarza scenariusz 100×
i weryfikuje, że końcowy hash Snapshot jest identyczny.

## Powiązane dokumenty

- [URUCHOMIENIE_UX_SLD.md](../ui/URUCHOMIENIE_UX_SLD.md) — przewodnik operacyjny
- [BRAKI_DANYCH_FIXACTIONS.md](../ui/BRAKI_DANYCH_FIXACTIONS.md) — panel FixActions
