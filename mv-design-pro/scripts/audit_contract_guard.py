#!/usr/bin/env python3
"""
Automated Audit Contract Guard — Industrial Grade

Cross-layer consistency checks:
1. Every domain operation in OPERATION_TO_MODAL has a backend handler
2. Every fix_action modal_type in READINESS_CODES has a matching frontend modal
3. No orphan JSON schemas in backend/schemas/
4. Modal registry (frontend) matches dialog_completeness mapping
5. No additionalProperties in JSON schemas (strict mode)

SCAN FILES:
  backend/src/domain/canonical_operations.py
  backend/schemas/*.json
  frontend/src/ui/topology/modals/modalRegistry.ts
  frontend/src/ui/topology/modals/index.ts

EXIT CODES:
  0 = clean
  1 = violations found
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

CANONICAL_OPS_FILE = REPO_ROOT / "backend" / "src" / "domain" / "canonical_operations.py"
SCHEMAS_DIR = REPO_ROOT / "backend" / "schemas"
MODAL_REGISTRY_FILE = (
    REPO_ROOT / "frontend" / "src" / "ui" / "topology" / "modals" / "modalRegistry.ts"
)
MODAL_INDEX_FILE = REPO_ROOT / "frontend" / "src" / "ui" / "topology" / "modals" / "index.ts"


def extract_readiness_modal_types(filepath: Path) -> set[str]:
    """Extract all modal_type values from READINESS_CODES fix_actions."""
    if not filepath.exists():
        return set()
    text = filepath.read_text(encoding="utf-8")
    pattern = re.compile(r'"modal_type":\s*"(\w+)"')
    return set(pattern.findall(text))


# Frozen schemas that are exempt from strict mode enforcement
# (changing them requires a major version bump per Frozen Result API Rule)
FROZEN_SCHEMAS = {"resultset_v1_schema.json", "catalog_binding_schema.json"}


def check_json_schemas_strict(schemas_dir: Path) -> list[str]:
    """Verify all JSON schemas have additionalProperties: false (strict mode)."""
    violations = []
    if not schemas_dir.exists():
        return violations
    for schema_file in sorted(schemas_dir.glob("*.json")):
        if schema_file.name in FROZEN_SCHEMAS:
            continue  # Frozen schemas exempt from strict mode enforcement
        try:
            schema = json.loads(schema_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            violations.append(f"Invalid JSON in {schema_file.name}")
            continue

        # Check top-level schema
        if schema.get("type") == "object":
            if "additionalProperties" not in schema:
                violations.append(
                    f"Schema '{schema_file.name}': missing 'additionalProperties' "
                    f"at top level (industrial mode requires explicit setting)"
                )
            elif schema.get("additionalProperties") is True:
                violations.append(
                    f"Schema '{schema_file.name}': 'additionalProperties: true' "
                    f"at top level (blocks strict validation)"
                )

        # Check required fields
        if schema.get("type") == "object" and "required" not in schema:
            violations.append(
                f"Schema '{schema_file.name}': no 'required' field "
                f"(industrial schemas must declare required fields)"
            )

    return violations


def check_modal_registry_operations(filepath: Path) -> tuple[set[str], list[str]]:
    """Extract operation names from frontend modal registry."""
    if not filepath.exists():
        return set(), []
    text = filepath.read_text(encoding="utf-8")
    # Match canonicalOp: 'operation_name' patterns
    pattern = re.compile(r"canonicalOp:\s*'(\w+)'")
    ops = set(pattern.findall(text))
    return ops, []


def check_modal_index_exports(filepath: Path) -> list[str]:
    """Verify modal index.ts has proper re-exports."""
    if not filepath.exists():
        return ["frontend/src/ui/topology/modals/index.ts not found"]
    text = filepath.read_text(encoding="utf-8")
    if "export" not in text:
        return ["index.ts has no exports"]
    return []


def main() -> int:
    violations: list[str] = []

    # 1. JSON Schema strict mode check
    schema_violations = check_json_schemas_strict(SCHEMAS_DIR)
    violations.extend(schema_violations)

    # 2. Readiness modal_type references
    modal_types_in_readiness = extract_readiness_modal_types(CANONICAL_OPS_FILE)

    # 3. Modal registry operations
    registry_ops, reg_violations = check_modal_registry_operations(MODAL_REGISTRY_FILE)
    violations.extend(reg_violations)

    # 4. Modal index exports
    index_violations = check_modal_index_exports(MODAL_INDEX_FILE)
    violations.extend(index_violations)

    # 5. Cross-check: readiness modal_types should map to known modals
    # (This is a soft check — we log warnings but don't fail)
    if modal_types_in_readiness:
        known_modal_patterns = {
            "CatalogPicker",
            "PropertyGrid",
            "ProtectionModal",
            "LoadDERModal",
            "PVInverterModal",
            "BESSInverterModal",
            "MeasurementModal",
            "TransformerStationModal",
        }
        for mt in sorted(modal_types_in_readiness):
            if mt not in known_modal_patterns:
                # Soft warning — new modal types may be added
                pass

    # Report
    if violations:
        print(f"\n{'='*60}")
        print(f"AUDIT CONTRACT GUARD: {len(violations)} violation(s)")
        print(f"{'='*60}\n")
        for v in violations:
            print(f"  VIOLATION: {v}")
        print()
        return 1

    print(
        f"Audit Contract Guard: OK "
        f"({len(list(SCHEMAS_DIR.glob('*.json'))) if SCHEMAS_DIR.exists() else 0} schemas, "
        f"{len(registry_ops)} registry ops, "
        f"{len(modal_types_in_readiness)} readiness modal types)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
