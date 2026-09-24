#!/usr/bin/env python3
"""
Canonical Operations Completeness Guard

Ensures that the canonical-operation registry and the domain-operation
handler dictionaries are in exact two-way sync:

SCAN FILES:
  backend/src/domain/canonical_operations.py  (registry)
  backend/src/enm/domain_operations.py        (_HANDLERS)
  backend/src/enm/domain_operations_v2.py     (ALL_V2_HANDLERS)

CHECKS (all HARD — any drift fails the build):
  1. Every canonical operation has a handler in _HANDLERS | ALL_V2_HANDLERS
     (directly or as an alias target).
  2. Every handler key is a registered canonical operation (or alias source).
  3. Alias map is consistent (aliases resolve to canonical names).
  4. No duplicate operation names across registry + aliases.
  5. All operations have Polish descriptions (checked in registry tests).

Handler keys are extracted via AST from the actual dict literals (no regex
heuristics), so an op added to a handler dict without registry registration
— or vice versa — is a guard failure, not silent drift.

EXIT CODES:
  0 = clean (no violations)
  1 = violations found
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

REGISTRY_FILE = REPO_ROOT / "backend" / "src" / "domain" / "canonical_operations.py"
OPS_V1_FILE = REPO_ROOT / "backend" / "src" / "enm" / "domain_operations.py"
OPS_V2_FILE = REPO_ROOT / "backend" / "src" / "enm" / "domain_operations_v2.py"

HANDLER_DICTS = {
    OPS_V1_FILE: {"_HANDLERS"},
    OPS_V2_FILE: {"ALL_V2_HANDLERS"},
}


def extract_canonical_names(filepath: Path) -> set[str]:
    """Extract canonical operation names from the registry module."""
    if not filepath.exists():
        return set()
    text = filepath.read_text(encoding="utf-8")
    pattern = re.compile(r'^\s+"([a-z_0-9]+)":\s+OperationSpec\(', re.MULTILINE)
    return set(pattern.findall(text))


def extract_handler_keys(filepath: Path, dict_names: set[str]) -> set[str]:
    """Extract string keys of the named handler dict literals via AST."""
    if not filepath.exists():
        return set()
    tree = ast.parse(filepath.read_text(encoding="utf-8"))
    keys: set[str] = set()
    for node in ast.walk(tree):
        value = None
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in dict_names:
                    value = node.value
        elif (
            isinstance(node, ast.AnnAssign)
            and isinstance(node.target, ast.Name)
            and node.target.id in dict_names
        ):
            value = node.value
        if value is not None and isinstance(value, ast.Dict):
            for key in value.keys:
                if isinstance(key, ast.Constant) and isinstance(key.value, str):
                    keys.add(key.value)
    return keys


def extract_alias_map(filepath: Path) -> dict[str, str]:
    """Extract ALIAS_MAP from registry."""
    if not filepath.exists():
        return {}
    text = filepath.read_text(encoding="utf-8")
    aliases = {}
    in_alias_section = False
    for line in text.splitlines():
        if "ALIAS_MAP" in line and "=" in line:
            in_alias_section = True
            continue
        if in_alias_section:
            if line.strip() == "}":
                break
            m = re.match(r'^\s+"([a-z_0-9]+)":\s+"([a-z_0-9]+)"', line)
            if m:
                aliases[m.group(1)] = m.group(2)
    return aliases


def main() -> int:
    violations: list[str] = []

    canonical = extract_canonical_names(REGISTRY_FILE)
    if not canonical:
        print(f"VIOLATION: no canonical operations found in registry {REGISTRY_FILE}")
        return 1

    implemented: set[str] = set()
    for filepath, dict_names in HANDLER_DICTS.items():
        keys = extract_handler_keys(filepath, dict_names)
        if not keys:
            violations.append(
                f"HANDLER DICT EMPTY/NOT FOUND: {sorted(dict_names)} in {filepath.name} "
                "(guard extraction broken or dict renamed — fix the guard, not the code)"
            )
        implemented |= keys

    aliases = extract_alias_map(REGISTRY_FILE)
    alias_sources = set(aliases.keys())
    alias_targets = set(aliases.values())

    # 1. HARD: every canonical op must have a handler (directly or via alias target).
    for op_name in sorted(canonical):
        if op_name not in implemented and op_name not in alias_targets:
            violations.append(
                f"REGISTERED WITHOUT HANDLER: '{op_name}' is in CANONICAL_OPERATIONS "
                "but has no entry in _HANDLERS/ALL_V2_HANDLERS"
            )

    # 2. HARD: every handler key must be registered (or be an alias source).
    for op_name in sorted(implemented):
        if op_name not in canonical and op_name not in alias_sources:
            violations.append(
                f"HANDLER WITHOUT REGISTRATION: '{op_name}' is in a handler dict "
                "but not in CANONICAL_OPERATIONS (add an OperationSpec entry)"
            )

    # 3. Alias targets must be canonical.
    for alias, target in aliases.items():
        if target not in canonical:
            violations.append(f"ALIAS '{alias}' -> '{target}': target is NOT a canonical operation")

    # 4. No duplicate names across registry + alias sources.
    all_names = list(canonical) + list(alias_sources)
    seen: set[str] = set()
    for name in all_names:
        if name in seen:
            violations.append(f"DUPLICATE operation name: '{name}'")
        seen.add(name)

    if violations:
        print(f"\n{'=' * 60}")
        print(f"CANONICAL OPERATIONS GUARD: {len(violations)} violation(s)")
        print(f"{'=' * 60}\n")
        for v in violations:
            print(f"  VIOLATION: {v}")
        print()
        return 1

    print(
        f"Canonical Operations Guard: OK ({len(canonical)} ops, "
        f"{len(aliases)} aliases, {len(implemented)} handler keys, two-way sync)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
