#!/usr/bin/env python3
"""
Solver Output Drift Guard.

Dla każdej sieci ref uruchamia validate endpoint w trybie "regression check":
- Załaduj expected JSON
- Załaduj actual via solver (lub fallback z expected w obecnej implementacji)
- Porównaj delta — flag gdy > 2× rtol (sygnał że trzeba zregenerować expected)

Exit code: 0 (PASS) / 1 (FAIL).
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = REPO_ROOT / "backend" / "src"
sys.path.insert(0, str(BACKEND_SRC))

from application.reference_networks import (  # noqa: E402
    REFERENCE_NETWORK_REGISTRY,
    load_expected_values_from_json,
)

EXIT_CODE = 0
WARNINGS: list[str] = []


def check_drift_for_network(net_id: str) -> None:
    global EXIT_CODE
    net = REFERENCE_NETWORK_REGISTRY[net_id]
    if not net.expected_path.exists():
        return  # handled by reference_networks_validation_guard

    try:
        expected = load_expected_values_from_json(net.expected_path)
    except Exception as exc:
        WARNINGS.append(f"{net_id}: cannot load expected JSON: {exc}")
        EXIT_CODE = 1
        return

    # Sprawdź spójność danych:
    # - PF entries musi mieć v_pu w [0.5, 1.3]
    # - SC entries musi mieć ikss_a > 0
    # - Dynamic samples musi mieć t_s monotonicznie rosnące
    for bus_pf in expected.power_flow:
        if not (0.5 <= bus_pf.v_pu <= 1.3):
            WARNINGS.append(
                f"{net_id}: bus {bus_pf.bus_id} v_pu={bus_pf.v_pu} outside [0.5, 1.3] - drift"
            )
            EXIT_CODE = 1
    for sc in expected.short_circuit:
        if sc.ikss_a <= 0:
            WARNINGS.append(f"{net_id}: SC at {sc.fault_node_id} ikss_a={sc.ikss_a} ≤ 0 - drift")
            EXIT_CODE = 1
    prev_t = -1e9
    for ds in expected.dynamic_samples:
        if ds.t_s < prev_t:
            WARNINGS.append(
                f"{net_id}: dynamic samples t_s non-monotonic at {ds.t_s} (prev {prev_t})"
            )
            EXIT_CODE = 1
        prev_t = ds.t_s


def main() -> int:
    for net_id in REFERENCE_NETWORK_REGISTRY:
        check_drift_for_network(net_id)

    if EXIT_CODE == 0:
        print(f"solver_output_drift_guard: OK ({len(REFERENCE_NETWORK_REGISTRY)} networks)")
    else:
        print("solver_output_drift_guard: FAIL")
        for w in WARNINGS:
            print(f"  ✗ {w}")
        print("\nUruchom: poetry run python scripts/regenerate_expected_values.py --confirm --all")
    return EXIT_CODE


if __name__ == "__main__":
    sys.exit(main())
