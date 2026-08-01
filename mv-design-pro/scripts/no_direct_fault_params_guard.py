#!/usr/bin/env python3
"""
CI Guard: no_direct_fault_params_guard.py — PR-19

Blocks:
1. Usage of `fault_node_id` outside of FaultScenario domain / solver binding.
2. Direct calls to `execute_short_circuit` outside of ExecutionEngine.

Allowed locations (whitelist):
- domain/fault_scenario.py (domain model)
- application/solvers/short_circuit_binding.py (binding layer)
- application/execution_engine/service.py (engine orchestration)
- application/result_mapping/ (result mapping)
- tests/ (test files)
- scripts/ (this guard)

Exit 0 = PASS, Exit 1 = FAIL.
An EMPTY SCAN (missing scan root or 0 inspected files) is a FAIL, not a PASS:
a guard that looks at nothing must never report green.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# Root of the backend source.
# NOTE (V12K-306 / audyt 2026-08-01, defekt D3): this file lives in
# <repo>/mv-design-pro/scripts/, so parent.parent is ALREADY <repo>/mv-design-pro.
# The historical constant appended a second "mv-design-pro" segment, which pointed
# the scan at a directory that never existed — the guard scanned 0 files and exited 0
# from the day it was written.  Do not reintroduce the duplicated segment.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"
BACKEND_TESTS = PROJECT_ROOT / "backend" / "tests"

# Patterns to detect
FAULT_NODE_ID_PATTERN = re.compile(r"\bfault_node_id\b")
EXECUTE_SC_PATTERN = re.compile(r"\bexecute_short_circuit\b")

# Whitelisted paths (relative to backend src)
WHITELISTED_PATHS = {
    "domain/fault_scenario.py",
    "application/solvers/short_circuit_binding.py",
    "application/execution_engine/service.py",
    "application/result_mapping/short_circuit_to_resultset_v1.py",
    "application/fault_scenario_service.py",
}


def is_whitelisted(filepath: Path) -> bool:
    """Check if a file is in the whitelist or is a test/script."""
    # Tests and scripts are always allowed
    rel = str(filepath)
    if "/tests/" in rel or "/scripts/" in rel:
        return True

    # Check against whitelist.
    # A file that cannot be expressed relative to the scan root is NOT whitelisted:
    # swallowing the ValueError used to whitelist EVERY file whenever the root was
    # wrong (second layer of the D3 emptiness).  Fail closed instead.
    try:
        relative = filepath.relative_to(BACKEND_SRC)
    except ValueError:
        return False
    return str(relative) in WHITELISTED_PATHS


def check_file(filepath: Path) -> list[str]:
    """Check a single file for violations."""
    violations: list[str] = []

    if not filepath.suffix == ".py":
        return violations

    if is_whitelisted(filepath):
        return violations

    try:
        content = filepath.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return violations

    for i, line in enumerate(content.splitlines(), 1):
        # Skip comments
        stripped = line.strip()
        if stripped.startswith("#"):
            continue

        if FAULT_NODE_ID_PATTERN.search(line):
            violations.append(
                f"  {filepath}:{i}: usage of 'fault_node_id' outside whitelisted module"
            )

        if EXECUTE_SC_PATTERN.search(line):
            violations.append(
                f"  {filepath}:{i}: direct call to 'execute_short_circuit' outside whitelisted module"
            )

    return violations


def main() -> int:
    violations: list[str] = []

    if not BACKEND_SRC.exists():
        print(f"FAIL: Backend source directory not found: {BACKEND_SRC}")
        print("A guard that cannot reach its scan root is a false green — fix the path.")
        return 1

    # Scan all Python files
    scanned = 0
    for py_file in BACKEND_SRC.rglob("*.py"):
        scanned += 1
        violations.extend(check_file(py_file))

    print(f"Scanned {scanned} Python file(s) under {BACKEND_SRC}.")

    if scanned == 0:
        print("FAIL: Empty scan — 0 files inspected. An empty guard proves nothing.")
        return 1

    if violations:
        print("FAIL: Direct fault parameter usage detected outside whitelisted modules:")
        for v in sorted(violations):
            print(v)
        print(f"\n{len(violations)} violation(s) found.")
        print("Use FaultScenario domain objects instead of raw fault parameters.")
        return 1

    print("PASS: No direct fault parameter violations found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
