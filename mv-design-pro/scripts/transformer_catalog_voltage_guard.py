#!/usr/bin/env python3
"""
CI Guard: transformer_catalog_voltage_guard.py

Ensures that TRAFO_SN_NN MaterializationContract includes voltage_hv_kv
and voltage_lv_kv in solver_fields, and that all transformer types in the
catalog have non-zero voltage_lv_kv.

EXIT 0 = pass, EXIT 1 = fail
"""

import os
import sys

# Add backend/src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend", "src"))


def check_materialization_contract() -> list[str]:
    """Check that TRAFO_SN_NN contract includes voltage fields."""
    errors: list[str] = []

    from network_model.catalog.types import MATERIALIZATION_CONTRACTS

    trafo_contract = MATERIALIZATION_CONTRACTS.get("TRAFO_SN_NN")
    if trafo_contract is None:
        errors.append("FAIL: No MaterializationContract for TRAFO_SN_NN")
        return errors

    if "voltage_hv_kv" not in trafo_contract.solver_fields:
        errors.append(
            "FAIL: TRAFO_SN_NN MaterializationContract missing 'voltage_hv_kv' in solver_fields"
        )

    if "voltage_lv_kv" not in trafo_contract.solver_fields:
        errors.append(
            "FAIL: TRAFO_SN_NN MaterializationContract missing 'voltage_lv_kv' in solver_fields"
        )

    # Check UI fields include both voltages
    ui_field_names = [f[0] for f in trafo_contract.ui_fields]
    if "voltage_hv_kv" not in ui_field_names and "rated_power_mva" in ui_field_names:
        errors.append("WARNING: TRAFO_SN_NN ui_fields should display U_górne (voltage_hv_kv)")

    return errors


def check_catalog_transformers() -> list[str]:
    """Check that all transformer types have voltage_lv_kv > 0."""
    errors: list[str] = []

    from network_model.catalog.repository import get_default_mv_catalog

    catalog = get_default_mv_catalog()
    for trafo in catalog.list_transformer_types():
        if trafo.voltage_lv_kv <= 0:
            errors.append(
                f"FAIL: TransformerType '{trafo.id}' ({trafo.name}) "
                f"has voltage_lv_kv={trafo.voltage_lv_kv} (must be > 0)"
            )
        if trafo.voltage_hv_kv <= 0:
            errors.append(
                f"FAIL: TransformerType '{trafo.id}' ({trafo.name}) "
                f"has voltage_hv_kv={trafo.voltage_hv_kv} (must be > 0)"
            )

    return errors


def main() -> int:
    print("=" * 60)
    print("GUARD: transformer_catalog_voltage_guard")
    print("=" * 60)

    all_errors: list[str] = []

    # Check 1: MaterializationContract
    print("\n[1/2] Checking TRAFO_SN_NN MaterializationContract...")
    contract_errors = check_materialization_contract()
    all_errors.extend(contract_errors)
    if not contract_errors:
        print("  OK: voltage_hv_kv and voltage_lv_kv in solver_fields")
    else:
        for e in contract_errors:
            print(f"  {e}")

    # Check 2: Catalog transformer types
    print("\n[2/2] Checking catalog transformer types...")
    catalog_errors = check_catalog_transformers()
    all_errors.extend(catalog_errors)
    if not catalog_errors:
        print("  OK: All transformers have valid voltage_lv_kv and voltage_hv_kv")
    else:
        for e in catalog_errors:
            print(f"  {e}")

    # Summary
    fail_count = sum(1 for e in all_errors if e.startswith("FAIL"))
    print(f"\n{'=' * 60}")
    if fail_count > 0:
        print(f"FAILED: {fail_count} error(s)")
        return 1

    print("PASSED: All transformer catalog voltage checks OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
