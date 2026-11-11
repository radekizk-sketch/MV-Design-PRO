#!/usr/bin/env python3
"""
Automated Audit Contract Guard — Industrial Grade

Cross-layer consistency checks:
1. Every canonical operation in the frontend operation surface registry
   (OPERATION_SURFACE_REGISTRY) has a backend spec in CANONICAL_OPERATIONS
2. JSON schemas in backend/schemas/ are strict: explicit `additionalProperties`
   (never `true`) and a `required` list at the top level (frozen schemas exempt)

Historia (2026-10-22, karta PODSTAWA-Q, commit 3): strażnik czytał dawniej
`frontend/src/ui/topology/modals/modalRegistry.ts` (plik nie istniał — kontrola
cicho zwracała pusty zbiór) i wymagał istnienia `modals/index.ts` z eksportami
modali, których nic nie montowało. Modale skasowano jako martwy kod; kontrola
operacji czyta teraz żywy rejestr powierzchni operacji, a brak tego pliku jest
naruszeniem, nie cichym pustym zbiorem. Miękkie porównanie `modal_type`
gotowości z listą nazw modali (pętla bez skutku) usunięto razem z modalami; z opisu
zdjęto też niezaimplementowaną obietnicę „brak osieroconych schematów JSON".
Korekta V12K-352 (gałąź UI/UX, wniesiona scaleniem 2026-10-28): brak katalogu
schematów jest naruszeniem (fail-closed), nie cichym „czysto". Samotest:
`scripts/test_audit_contract_guard.py`.

SCAN FILES:
  backend/src/domain/canonical_operations.py
  backend/schemas/*.json
  frontend/src/ui/topology/modals/operationSurfaceRegistry.ts

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
OPERATION_SURFACE_REGISTRY_FILE = (
    REPO_ROOT / "frontend" / "src" / "ui" / "topology" / "modals" / "operationSurfaceRegistry.ts"
)


def extract_backend_operations(filepath: Path) -> set[str]:
    """Nazwy operacji kanonicznych backendu (klucze `CANONICAL_OPERATIONS`)."""
    if not filepath.exists():
        return set()
    text = filepath.read_text(encoding="utf-8")
    return set(re.findall(r'^    "(\w+)": OperationSpec\(', text, re.MULTILINE))


# Frozen schemas that are exempt from strict mode enforcement
# (changing them requires a major version bump per Frozen Result API Rule)
FROZEN_SCHEMAS = {"resultset_v1_schema.json", "catalog_binding_schema.json"}


def check_json_schemas_strict(schemas_dir: Path) -> list[str]:
    """Verify all JSON schemas have additionalProperties: false (strict mode)."""
    violations = []
    if not schemas_dir.is_dir():
        # Fail-closed: brak katalogu schematów to brak kontraktów, nie „czysto".
        return [f"schemas directory not found: {schemas_dir}"]
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


def check_operation_surface_registry(
    filepath: Path, backend_ops: set[str]
) -> tuple[set[str], list[str]]:
    """Operacje rejestru powierzchni frontu → każda ma spec w backendzie."""
    if not filepath.exists():
        return set(), [f"{filepath.relative_to(REPO_ROOT)} not found"]
    text = filepath.read_text(encoding="utf-8")
    ops = set(re.findall(r"entry\(\s*'(\w+)',", text))
    violations: list[str] = []
    if not ops:
        violations.append("Operation surface registry has no entries")
    if not backend_ops:
        violations.append("No CANONICAL_OPERATIONS found in canonical_operations.py")
    for op in sorted(ops - backend_ops) if backend_ops else []:
        violations.append(f"Operation surface '{op}' has no backend spec in CANONICAL_OPERATIONS")
    return ops, violations


def main() -> int:
    violations: list[str] = []

    # 1. JSON Schema strict mode check
    schema_violations = check_json_schemas_strict(SCHEMAS_DIR)
    violations.extend(schema_violations)

    # 2. Frontend operation surfaces -> backend operation specs
    backend_ops = extract_backend_operations(CANONICAL_OPS_FILE)
    registry_ops, reg_violations = check_operation_surface_registry(
        OPERATION_SURFACE_REGISTRY_FILE, backend_ops
    )
    violations.extend(reg_violations)

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
        f"{len(backend_ops)} backend ops)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
