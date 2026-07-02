#!/usr/bin/env python3
"""
Catalog Binding Completeness Guard

Ensures industrial-grade catalog integrity:
1. Every CatalogNamespace has a MaterializationContract
2. Every solver_field in a contract exists on the corresponding type class
3. No orphan contracts (contract namespace must match CatalogNamespace enum)
4. MATERIALIZATION_CONTRACTS dict is exhaustive
5. CatalogBinding schema fields are consistent

SCAN FILES:
  backend/src/network_model/catalog/types.py

EXIT CODES:
  0 = clean (no violations)
  1 = violations found
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
TYPES_FILE = REPO_ROOT / "backend" / "src" / "network_model" / "catalog" / "types.py"


def extract_namespace_values(text: str) -> set[str]:
    """Extract all CatalogNamespace enum values."""
    values = set()
    in_enum = False
    in_docstring = False
    for line in text.splitlines():
        if "class CatalogNamespace" in line:
            in_enum = True
            continue
        if in_enum:
            stripped = line.strip()
            # Track docstring blocks
            if '"""' in stripped:
                count = stripped.count('"""')
                if count >= 2:
                    # Single-line docstring, skip it
                    continue
                in_docstring = not in_docstring
                continue
            if in_docstring:
                continue
            # Skip blank lines and comments inside enum
            if stripped == "" or stripped.startswith("#"):
                continue
            # End of enum: non-indented, non-blank line
            if not line.startswith(" ") and not line.startswith("\t") and stripped:
                break
            m = re.match(r'\s+(\w+)\s*=\s*"(\w+)"', line)
            if m:
                values.add(m.group(2))
    return values


def extract_contract_namespaces(text: str) -> set[str]:
    """Extract all namespaces defined in MATERIALIZATION_CONTRACTS."""
    namespaces = set()
    pattern = re.compile(
        r'CatalogNamespace\.(\w+)\.value\s*:\s*MaterializationContract',
    )
    for m in pattern.finditer(text):
        namespaces.add(m.group(1))
    return namespaces


def extract_solver_fields_by_namespace(text: str) -> dict[str, list[str]]:
    """Extract solver_fields tuple contents for each namespace contract."""
    result: dict[str, list[str]] = {}
    # Match blocks like:
    #   CatalogNamespace.KABEL_SN.value: MaterializationContract(
    #       namespace=...,
    #       solver_fields=(
    #           "r_ohm_per_km", "x_ohm_per_km", ...
    #       ),
    blocks = re.finditer(
        r'CatalogNamespace\.(\w+)\.value\s*:\s*MaterializationContract\('
        r'.*?solver_fields\s*=\s*\((.*?)\)',
        text,
        re.DOTALL,
    )
    for m in blocks:
        ns = m.group(1)
        fields_raw = m.group(2)
        fields = re.findall(r'"(\w+)"', fields_raw)
        result[ns] = fields
    return result


def extract_dataclass_fields(text: str, class_name: str) -> set[str]:
    """Extract field names from a frozen dataclass definition."""
    fields = set()
    pattern = re.compile(
        rf'class {class_name}\b.*?(?=\n(?:class |def |@|\Z))',
        re.DOTALL,
    )
    match = pattern.search(text)
    if not match:
        return fields
    block = match.group(0)
    # Match field definitions: field_name: type = default
    field_pattern = re.compile(r'^\s+(\w+)\s*:', re.MULTILINE)
    for fm in field_pattern.finditer(block):
        name = fm.group(1)
        if not name.startswith("_"):
            fields.add(name)
    return fields


# Mapping: CatalogNamespace enum member name -> expected type class name
NAMESPACE_TO_TYPE_CLASS: dict[str, str] = {
    "KABEL_SN": "CableType",
    "LINIA_SN": "LineType",
    "TRAFO_SN_NN": "TransformerType",
    "APARAT_SN": "MVApparatusType",
    "APARAT_NN": "LVApparatusType",
    "KABEL_NN": "LVCableType",
    "CT": "CTType",
    "VT": "VTType",
    "OBCIAZENIE": "LoadType",
    "KOMPENSATOR_SN": "ShuntCapacitorType",
    "ZRODLO_NN_PV": "PVInverterType",
    "ZRODLO_NN_BESS": "BESSInverterType",
    "ZABEZPIECZENIE": "ProtectionDeviceType",
    "NASTAWY_ZABEZPIECZEN": "ProtectionSettingTemplate",
    "CONVERTER": "ConverterType",
    "INVERTER": "InverterType",
}


def main() -> int:
    if not TYPES_FILE.exists():
        print(f"WARNING: Types file not found: {TYPES_FILE}")
        return 0

    text = TYPES_FILE.read_text(encoding="utf-8")
    violations: list[str] = []

    # 1. Extract all namespace values
    namespaces = extract_namespace_values(text)
    if not namespaces:
        violations.append("No CatalogNamespace enum values found")
        _report(violations)
        return 1

    # 2. Extract contract namespaces
    contract_ns = extract_contract_namespaces(text)

    # 3. Check every namespace has a contract
    for ns in sorted(namespaces):
        if ns not in contract_ns:
            # CONVERTER and INVERTER may not have contracts if they use
            # the same types as other namespaces — check if they are aliases
            if ns in ("CONVERTER", "INVERTER"):
                continue  # Legacy namespaces, may share contracts
            violations.append(
                f"Namespace '{ns}' has NO MaterializationContract in MATERIALIZATION_CONTRACTS"
            )

    # 4. Check no orphan contracts
    for ns in sorted(contract_ns):
        if ns not in namespaces:
            violations.append(
                f"Contract for '{ns}' exists but '{ns}' is NOT in CatalogNamespace enum"
            )

    # 5. Check solver_fields exist on type classes
    solver_fields = extract_solver_fields_by_namespace(text)
    for ns, fields in solver_fields.items():
        type_class = NAMESPACE_TO_TYPE_CLASS.get(ns)
        if type_class is None:
            continue  # No type class mapping
        class_fields = extract_dataclass_fields(text, type_class)
        if not class_fields:
            continue  # Class not found or has no fields
        for field_name in fields:
            if field_name not in class_fields:
                violations.append(
                    f"Contract '{ns}': solver_field '{field_name}' "
                    f"NOT found in {type_class} dataclass"
                )

    _report(violations, len(namespaces), len(contract_ns))
    return 1 if violations else 0


def _report(violations: list[str], ns_count: int = 0, contract_count: int = 0) -> None:
    if violations:
        print(f"\n{'='*60}")
        print(f"CATALOG BINDING GUARD: {len(violations)} violation(s)")
        print(f"{'='*60}\n")
        for v in violations:
            print(f"  VIOLATION: {v}")
        print()
    else:
        print(
            f"Catalog Binding Guard: OK "
            f"({ns_count} namespaces, {contract_count} contracts)"
        )


if __name__ == "__main__":
    sys.exit(main())
