#!/usr/bin/env python3
"""
Reference Networks Validation Guard.

Sprawdza:
1. Każda sieć w REFERENCE_NETWORK_REGISTRY ma plik expected JSON
2. Każda sieć ma min 1 PF expected (chyba że jest SC-only jak IEC 60909)
3. Sieci z has_der=True mają min 1 generator w builder output
4. Sieci z is_unbalanced=True są oznaczone supported_solvers zawierającym BFS

Failuje gdy:
- expected JSON missing for any network
- expected JSON pusty (brak PF i SC)
- has_der network bez generators
- unbalanced network bez BFS solver

Exit code: 0 (PASS) / 1 (FAIL).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = REPO_ROOT / "backend" / "src"
sys.path.insert(0, str(BACKEND_SRC))

from application.reference_networks import REFERENCE_NETWORK_REGISTRY  # noqa: E402

EXIT_CODE = 0
FAILURES: list[str] = []


def check_expected_json_exists() -> None:
    global EXIT_CODE
    for net_id, net in REFERENCE_NETWORK_REGISTRY.items():
        if not net.expected_path.exists():
            FAILURES.append(f"{net_id}: expected JSON missing at {net.expected_path}")
            EXIT_CODE = 1


def check_expected_json_has_pf_or_sc() -> None:
    global EXIT_CODE
    for net_id, net in REFERENCE_NETWORK_REGISTRY.items():
        if not net.expected_path.exists():
            continue
        try:
            data = json.loads(net.expected_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            FAILURES.append(f"{net_id}: invalid JSON: {exc}")
            EXIT_CODE = 1
            continue
        pf = data.get("power_flow", [])
        sc = data.get("short_circuit", [])
        if not pf and not sc:
            FAILURES.append(f"{net_id}: expected JSON has neither power_flow nor short_circuit")
            EXIT_CODE = 1


def check_has_der_networks_have_generators() -> None:
    global EXIT_CODE
    for net_id, net in REFERENCE_NETWORK_REGISTRY.items():
        if not net.has_der:
            continue
        try:
            enm = net.builder_fn()
        except Exception as exc:
            FAILURES.append(f"{net_id}: builder raised exception: {exc}")
            EXIT_CODE = 1
            continue
        gens = enm.get("generators", [])
        if not gens:
            FAILURES.append(f"{net_id}: has_der=True but builder produces no generators")
            EXIT_CODE = 1


def check_unbalanced_networks_have_bfs_solver() -> None:
    global EXIT_CODE
    for net_id, net in REFERENCE_NETWORK_REGISTRY.items():
        if not net.is_unbalanced:
            continue
        if "power_flow_unbalanced_bfs" not in net.supported_solvers:
            FAILURES.append(
                f"{net_id}: is_unbalanced=True but supported_solvers missing 'power_flow_unbalanced_bfs'"
            )
            EXIT_CODE = 1


def main() -> int:
    check_expected_json_exists()
    check_expected_json_has_pf_or_sc()
    check_has_der_networks_have_generators()
    check_unbalanced_networks_have_bfs_solver()

    if EXIT_CODE == 0:
        total = len(REFERENCE_NETWORK_REGISTRY)
        with_expected = sum(
            1 for net in REFERENCE_NETWORK_REGISTRY.values() if net.expected_path.exists()
        )
        print(f"reference_networks_validation_guard: OK ({with_expected}/{total} networks with expected JSON)")
    else:
        print("reference_networks_validation_guard: FAIL")
        for f in FAILURES:
            print(f"  ✗ {f}")
    return EXIT_CODE


if __name__ == "__main__":
    sys.exit(main())
