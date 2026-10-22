#!/usr/bin/env python3
"""
Audit Contract Guard — kontrakty schematów JSON i eksport okien topologii.

CHECKS:
1. Każdy schemat JSON w backend/schemas/ (poza zamrożonymi) jest ścisły
   (`additionalProperties: false`) i deklaruje pola wymagane.
2. `frontend/src/ui/topology/modals/index.ts` istnieje i eksportuje okna.

Korekta V12K-351 (2026-10-22): wcześniejszy opis deklarował trzy kontrole, których kod
nie wykonywał — „operacja z OPERATION_TO_MODAL ma handler" (parytet rejestr ↔ handlery
pilnuje `canonical_ops_guard.py`), „modal_type z READINESS_CODES ma okno" (0 wystąpień
`modal_type` w rejestrze; cele akcji naprawczych pilnuje
`fix_action_completeness_guard.py`) i „rejestr okien zgodny z mapą dialog_completeness"
(plik `modalRegistry.ts` nie istnieje; klasyfikację KAŻDEJ operacji kanonicznej pilnuje
`dialog_completeness_guard.py`). Martwe kontrole skasowane. Samotest:
`scripts/test_audit_contract_guard.py`.

EXIT CODES:
  0 = clean
  1 = violations found
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

SCHEMAS_DIR = REPO_ROOT / "backend" / "schemas"
MODAL_INDEX_FILE = REPO_ROOT / "frontend" / "src" / "ui" / "topology" / "modals" / "index.ts"


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

    # 2. Modal index exports
    violations.extend(check_modal_index_exports(MODAL_INDEX_FILE))

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
        f"({len(list(SCHEMAS_DIR.glob('*.json'))) if SCHEMAS_DIR.exists() else 0} schemas)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
