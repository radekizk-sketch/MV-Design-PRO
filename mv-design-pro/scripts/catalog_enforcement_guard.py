#!/usr/bin/env python3
"""
CI Guard: catalog_enforcement_guard.py

Validates that:
1. Catalog-required operations stay listed in API catalog policy
2. API policy can extract catalog bindings from canonical payload shapes
3. CatalogBinding model has all required fields
4. MaterializationContract exists for every CatalogNamespace
5. Every BLOCKER readiness code related to catalog has a fix_action
6. Technical elements cannot be "cleared" from catalog binding without backend ban

EXIT 0 = pass, EXIT 1 = fail
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"

# Add backend/src to path
sys.path.insert(0, str(BACKEND_SRC))

REQUIRED_CATALOG_REQUIRED_OPERATIONS = frozenset(
    {
        "add_grid_source_sn",
        "continue_trunk_segment_sn",
        "insert_branch_pole_on_segment_sn",
        "start_branch_segment_sn",
        "insert_zksn_on_segment_sn",
        "insert_station_on_segment_sn",
        "add_transformer_sn_nn",
        "add_nn_outgoing_field",
        "add_nn_load",
        "add_converter_source",
        "insert_section_switch_sn",
        "connect_secondary_ring_sn",
    }
)

BANNED_LEGACY_OPERATION_NAMES = frozenset(
    {
        "add_pv" "_inverter_nn",
        "add_bess" "_inverter_nn",
        "add_nn_source" "_field",
    }
)

CANONICAL_SURFACE_DIRS = (
    PROJECT_ROOT / "docs",
    PROJECT_ROOT / "scripts",
    PROJECT_ROOT / "backend" / "tests",
    PROJECT_ROOT / "frontend" / "src",
)


def check_catalog_required_operations() -> list[str]:
    """Check that catalog-required create operations stay protected in API policy."""
    errors: list[str] = []

    from api.domain_ops_policy import CATALOG_REQUIRED_OPERATIONS

    missing = sorted(REQUIRED_CATALOG_REQUIRED_OPERATIONS - set(CATALOG_REQUIRED_OPERATIONS))
    if missing:
        errors.append("FAIL: Brak operacji w CATALOG_REQUIRED_OPERATIONS: " + ", ".join(missing))

    return errors


def check_catalog_binding_extraction_paths() -> list[str]:
    """Check that API gate extracts binding from canonical payload shapes."""
    errors: list[str] = []

    from api.domain_ops_policy import DEFAULT_CATALOG_VERSION, extract_catalog_binding

    cases = [
        (
            "add_grid_source_sn",
            {"catalog_ref": "GPZ_SN_001"},
            "ZRODLO_SN",
            "GPZ_SN_001",
        ),
        (
            "continue_trunk_segment_sn",
            {"segment": {"segment_kind": "KABEL_SN", "catalog_ref": "KABEL_SN_240"}},
            "KABEL_SN",
            "KABEL_SN_240",
        ),
        (
            "insert_station_on_segment_sn",
            {"transformer": {"transformer_catalog_ref": "TRAFO_SN_NN_630"}},
            "TRAFO_SN_NN",
            "TRAFO_SN_NN_630",
        ),
        (
            "add_converter_source",
            {
                "source_technology": "PV",
                "catalog_binding": {
                    "catalog_namespace": "CONVERTER",
                    "catalog_item_id": "PV_FALOWNIK_500",
                    "catalog_item_version": DEFAULT_CATALOG_VERSION,
                    "materialize": True,
                },
            },
            "CONVERTER",
            "PV_FALOWNIK_500",
        ),
        (
            "add_converter_source",
            {
                "source_technology": "BESS",
                "catalog_binding": {
                    "catalog_namespace": "CONVERTER",
                    "catalog_item_id": "BESS_FALOWNIK_250",
                    "catalog_item_version": DEFAULT_CATALOG_VERSION,
                    "materialize": True,
                },
            },
            "CONVERTER",
            "BESS_FALOWNIK_250",
        ),
        (
            "insert_section_switch_sn",
            {"catalog_ref": "ROZLACZNIK_SN_001"},
            "APARAT_SN",
            "ROZLACZNIK_SN_001",
        ),
    ]

    for operation, payload, expected_namespace, expected_item_id in cases:
        binding = extract_catalog_binding(operation, payload)
        if binding is None:
            errors.append(f"FAIL: extract_catalog_binding() nie zwraca bindingu dla {operation}")
            continue

        if binding.get("catalog_namespace") != expected_namespace:
            errors.append(
                f"FAIL: {operation} ma namespace={binding.get('catalog_namespace')!r}, "
                f"oczekiwano {expected_namespace!r}"
            )
        if binding.get("catalog_item_id") != expected_item_id:
            errors.append(
                f"FAIL: {operation} ma catalog_item_id={binding.get('catalog_item_id')!r}, "
                f"oczekiwano {expected_item_id!r}"
            )
        if binding.get("catalog_item_version") != DEFAULT_CATALOG_VERSION:
            errors.append(
                f"FAIL: {operation} ma catalog_item_version={binding.get('catalog_item_version')!r}, "
                f"oczekiwano {DEFAULT_CATALOG_VERSION!r}"
            )
        if binding.get("materialize") is not True:
            errors.append(f"FAIL: {operation} nie wymusza materialize=True w extracted binding")

    return errors


def check_catalog_binding_fields() -> list[str]:
    """Check CatalogBinding has required fields."""
    errors: list[str] = []

    from network_model.catalog.types import CatalogBinding

    binding = CatalogBinding(
        catalog_namespace="TEST",
        catalog_item_id="TEST_ID",
        catalog_item_version="1.0",
        materialize=True,
    )
    d = binding.to_dict()

    required = [
        "catalog_namespace",
        "catalog_item_id",
        "catalog_item_version",
        "materialize",
    ]
    for field in required:
        if field not in d:
            errors.append(f"FAIL: CatalogBinding missing field '{field}' in to_dict()")

    return errors


def check_materialization_contracts() -> list[str]:
    """Check MaterializationContract exists for every CatalogNamespace."""
    errors: list[str] = []

    from network_model.catalog.types import MATERIALIZATION_CONTRACTS, CatalogNamespace

    for ns in CatalogNamespace:
        if ns.value not in MATERIALIZATION_CONTRACTS:
            # CONVERTER and INVERTER may not have contracts (they use ConverterType)
            if ns.value in ("CONVERTER", "INVERTER"):
                continue
            errors.append(f"FAIL: No MaterializationContract for CatalogNamespace.{ns.value}")
        else:
            contract = MATERIALIZATION_CONTRACTS[ns.value]
            if not contract.solver_fields:
                errors.append(
                    f"FAIL: MaterializationContract for {ns.value} has empty solver_fields"
                )

    return errors


def check_readiness_codes_coverage() -> list[str]:
    """Check that catalog-related BLOCKER codes have fix_actions."""
    errors: list[str] = []

    from domain.canonical_operations import READINESS_CODES, ReadinessLevel

    catalog_blockers = [
        (code, spec)
        for code, spec in READINESS_CODES.items()
        if spec.level == ReadinessLevel.BLOCKER and "catalog" in code.lower()
    ]

    for code, spec in catalog_blockers:
        if not spec.fix_action_id:
            errors.append(f"FAIL: Catalog BLOCKER '{code}' has no fix_action_id")

    return errors


def check_namespace_accessor_coverage() -> list[str]:
    """Check that materialization engine can look up items for all namespaces."""
    errors: list[str] = []

    from network_model.catalog.materialization import _NAMESPACE_ACCESSOR
    from network_model.catalog.types import CatalogNamespace

    for ns in CatalogNamespace:
        if ns.value in ("CONVERTER", "INVERTER"):
            continue
        if ns.value not in _NAMESPACE_ACCESSOR:
            errors.append(f"FAIL: No accessor in materialization engine for namespace {ns.value}")

    return errors


def check_clear_catalog_protection() -> list[str]:
    """Check that technical catalog clear ban stays enforced in backend handler."""
    errors: list[str] = []

    ops_file = BACKEND_SRC / "enm" / "domain_operations.py"
    if not ops_file.exists():
        return [f"FAIL: Brak pliku operacji domenowych: {ops_file}"]

    content = ops_file.read_text(encoding="utf-8")
    match = re.search(
        r"def\s+assign_catalog_to_element\s*\(.*?\)\s*->.*?(?=^def\s|\Z)",
        content,
        re.DOTALL | re.MULTILINE,
    )
    if not match:
        return ["FAIL: Nie znaleziono funkcji assign_catalog_to_element()"]

    func_body = match.group(0)
    if "_element_requires_catalog" not in func_body:
        errors.append("FAIL: assign_catalog_to_element() nie sprawdza _element_requires_catalog()")
    if "catalog.clear_forbidden" not in func_body:
        errors.append("FAIL: assign_catalog_to_element() nie zwraca catalog.clear_forbidden")

    guard_index = func_body.find("catalog.clear_forbidden")
    clear_index = func_body.find('target_element["catalog_ref"] = None')
    if clear_index != -1 and guard_index != -1 and guard_index > clear_index:
        errors.append(
            "FAIL: assign_catalog_to_element() czyści catalog_ref przed blokadą clear_forbidden"
        )

    return errors


def check_no_legacy_operation_names_in_canonical_surface() -> list[str]:
    """Check docs/scripts/tests no longer treat legacy NN alias operations as canonical."""
    errors: list[str] = []
    allowed_suffixes = {".md", ".py", ".ts", ".tsx", ".json", ".txt"}

    for root in CANONICAL_SURFACE_DIRS:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix not in allowed_suffixes:
                continue
            if "__pycache__" in path.parts:
                continue
            if root.name == "src" and "__tests__" not in path.parts:
                continue
            content = path.read_text(encoding="utf-8")
            for legacy_name in BANNED_LEGACY_OPERATION_NAMES:
                if legacy_name in content:
                    rel_path = path.relative_to(PROJECT_ROOT)
                    errors.append(
                        f"FAIL: Legacy operation name '{legacy_name}' found in {rel_path}"
                    )

    return errors


def main() -> int:
    print("=" * 60)
    print("GUARD: catalog_enforcement_guard")
    print("=" * 60)

    all_errors: list[str] = []

    checks = [
        (
            "Checking catalog-required operation coverage...",
            check_catalog_required_operations,
        ),
        (
            "Checking canonical payload extraction paths...",
            check_catalog_binding_extraction_paths,
        ),
        ("Checking CatalogBinding fields...", check_catalog_binding_fields),
        (
            "Checking MaterializationContract coverage...",
            check_materialization_contracts,
        ),
        (
            "Checking catalog readiness codes coverage...",
            check_readiness_codes_coverage,
        ),
        (
            "Checking materialization accessor coverage...",
            check_namespace_accessor_coverage,
        ),
        ("Checking clear_catalog protection...", check_clear_catalog_protection),
        (
            "Checking legacy operation names are absent in docs/scripts/tests...",
            check_no_legacy_operation_names_in_canonical_surface,
        ),
    ]

    for index, (label, check) in enumerate(checks, start=1):
        print(f"\n[{index}/{len(checks)}] {label}")
        errors = check()
        all_errors.extend(errors)
        print(f"  {'OK' if not errors else f'{len(errors)} error(s)'}")
        for error in errors:
            print(f"  {error}")

    # Summary
    fail_count = sum(1 for e in all_errors if e.startswith("FAIL"))
    print(f"\n{'=' * 60}")
    if fail_count > 0:
        print(f"FAILED: {fail_count} error(s)")
        return 1

    print("PASSED: All catalog enforcement checks OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
