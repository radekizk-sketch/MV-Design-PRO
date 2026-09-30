#!/usr/bin/env python3
"""
Solver Diff Guard — PR-32

Blocks merge if any solver file has been modified compared to stored
reference hashes. Ensures SC solver code is NEVER modified by Protection PRs.

PROTECTED PATHS:
  backend/src/network_model/solvers/short_circuit_iec60909.py
  backend/src/network_model/solvers/short_circuit_core.py
  backend/src/network_model/solvers/short_circuit_contributions.py
  backend/src/network_model/solvers/power_flow_newton.py
  backend/src/network_model/solvers/power_flow_gauss_seidel.py
  backend/src/network_model/solvers/power_flow_fast_decoupled.py
  backend/src/network_model/solvers/power_flow_newton_internal.py
  backend/src/network_model/solvers/protection_iec60255.py
    (odcisk od karty PROT-LTI 2026-09-30, sankcja O-59 OD-15(e): nazwa krzywej
    RI -> LONG_TIME_INVERSE/"LTI", liczby bit w bit bez zmian)

ALGORITHM:
  1. Compute SHA-256 of each protected file
  2. Compare against stored reference hashes
  3. If any hash differs → FAIL with explicit diff path

EXIT CODES:
  0 = clean (no violations)
  1 = violation found (solver file modified)
  2 = reference file missing (first run: generate with --init)
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend" / "src"
REFERENCE_FILE = REPO_ROOT / "scripts" / "guard_references" / "solver_hashes.json"

PROTECTED_FILES = [
    "network_model/solvers/short_circuit_iec60909.py",
    "network_model/solvers/short_circuit_core.py",
    "network_model/solvers/short_circuit_contributions.py",
    "network_model/solvers/power_flow_newton.py",
    "network_model/solvers/power_flow_gauss_seidel.py",
    "network_model/solvers/power_flow_fast_decoupled.py",
    "network_model/solvers/power_flow_newton_internal.py",
    "network_model/solvers/protection_iec60255.py",
]


def _compute_file_hash(path: Path) -> str | None:
    """Compute SHA-256 of a file. Returns None if file not found."""
    if not path.exists():
        return None
    content = path.read_bytes()
    return hashlib.sha256(content).hexdigest()


def _compute_current_hashes() -> dict[str, str | None]:
    """Compute hashes for all protected files."""
    hashes: dict[str, str | None] = {}
    for rel_path in PROTECTED_FILES:
        full_path = BACKEND_ROOT / rel_path
        hashes[rel_path] = _compute_file_hash(full_path)
    return hashes


def _load_reference_hashes() -> dict[str, str] | None:
    """Load stored reference hashes. Returns None if file missing."""
    if not REFERENCE_FILE.exists():
        return None
    return json.loads(REFERENCE_FILE.read_text(encoding="utf-8"))


def _save_reference_hashes(hashes: dict[str, str | None]) -> None:
    """Save reference hashes to file."""
    REFERENCE_FILE.parent.mkdir(parents=True, exist_ok=True)
    clean = {k: v for k, v in hashes.items() if v is not None}
    REFERENCE_FILE.write_text(
        json.dumps(clean, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    if "--init" in sys.argv:
        hashes = _compute_current_hashes()
        _save_reference_hashes(hashes)
        print(f"solver-diff-guard: initialized {len(hashes)} reference hashes")
        return 0

    reference = _load_reference_hashes()
    if reference is None:
        print(
            "solver-diff-guard: reference file missing. "
            f"Run: python {Path(__file__).name} --init",
            file=sys.stderr,
        )
        return 2

    current = _compute_current_hashes()
    violations: list[str] = []

    for rel_path, ref_hash in reference.items():
        cur_hash = current.get(rel_path)
        if cur_hash is None:
            violations.append(f"  {rel_path}: FILE DELETED (was {ref_hash[:16]}...)")
        elif cur_hash != ref_hash:
            violations.append(
                f"  {rel_path}: MODIFIED\n"
                f"    reference: {ref_hash[:16]}...\n"
                f"    current:   {cur_hash[:16]}..."
            )

    if violations:
        print("SOLVER-DIFF-GUARD VIOLATIONS:", file=sys.stderr)
        for v in violations:
            print(v, file=sys.stderr)
        print(
            f"\n{len(violations)} violation(s). "
            "Solver files must NOT be modified by Protection PRs.",
            file=sys.stderr,
        )
        return 1

    print(f"solver-diff-guard: PASS ({len(reference)} files verified)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
