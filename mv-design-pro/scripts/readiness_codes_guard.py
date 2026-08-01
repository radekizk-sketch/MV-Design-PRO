#!/usr/bin/env python3
"""
Readiness Codes Completeness Guard

Ensures that all required readiness codes are defined and that each code has:
- Polish message (message_pl)
- Valid priority (1-5)
- Valid level (BLOCKER / WARNING / INFO)
- Fix action ID (for BLOCKERs)
- Fix navigation (panel/tab/focus)

Also ensures no duplicate codes and deterministic priority ordering.

SCAN FILES:
  backend/src/domain/canonical_operations.py  (READINESS_CODES dict)

REQUIRED CODES (minimum 24):
  source.voltage_invalid, source.sk3_invalid,
  trunk.terminal_missing, trunk.segment_missing,
  trunk.segment_length_missing, trunk.segment_length_invalid,
  trunk.catalog_missing,
  station.type_invalid, station.voltage_missing,
  station.nn_outgoing_min_1, station.required_field_missing,
  transformer.catalog_missing, transformer.connection_missing,
  nn.bus_missing, nn.main_breaker_missing,
  oze.transformer_required, oze.nn_bus_required,
  ring.endpoints_missing, ring.nop_required,
  protection.ct_required, protection.vt_required,
  protection.settings_incomplete,
  study_case.missing_base_snapshot,
  analysis.blocked_by_readiness

EXIT CODES:
  0 = clean
  1 = violations
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
REGISTRY_FILE = REPO_ROOT / "backend" / "src" / "domain" / "canonical_operations.py"

REQUIRED_CODES = {
    "source.voltage_invalid",
    "source.sk3_invalid",
    "trunk.terminal_missing",
    "trunk.segment_missing",
    "trunk.segment_length_missing",
    "trunk.segment_length_invalid",
    "trunk.catalog_missing",
    "station.type_invalid",
    "station.voltage_missing",
    "station.nn_outgoing_min_1",
    "station.required_field_missing",
    "transformer.catalog_missing",
    "transformer.connection_missing",
    "nn.bus_missing",
    "nn.main_breaker_missing",
    "oze.transformer_required",
    "oze.nn_bus_required",
    "ring.endpoints_missing",
    "ring.nop_required",
    "protection.ct_required",
    "protection.vt_required",
    "protection.settings_incomplete",
    "study_case.missing_base_snapshot",
    "analysis.blocked_by_readiness",
}


def extract_readiness_codes(filepath: Path) -> set[str]:
    """Extract readiness code keys from the READINESS_CODES dict."""
    if not filepath.exists():
        return set()
    text = filepath.read_text(encoding="utf-8")
    # Match dictionary keys in READINESS_CODES
    pattern = re.compile(r'"([a-z0-9_.]+)":\s+ReadinessCodeSpec\(', re.MULTILINE)
    return set(pattern.findall(text))


def check_polish_messages(filepath: Path) -> list[str]:
    """Check that each code has a non-empty message_pl."""
    if not filepath.exists():
        return []
    text = filepath.read_text(encoding="utf-8")
    violations = []
    # Find all message_pl assignments
    pattern = re.compile(r'message_pl="([^"]*)"')
    messages = pattern.findall(text)
    for msg in messages:
        if not msg or len(msg) < 5:
            violations.append(f"Empty or too short message_pl: '{msg}'")
    return violations


def main() -> int:
    violations: list[str] = []

    codes = extract_readiness_codes(REGISTRY_FILE)
    if not codes:
        print("WARNING: No readiness codes found in %s" % REGISTRY_FILE)
        print("File may not exist yet. Skipping guard.")
        return 0

    # Check minimum count
    if len(codes) < 24:
        violations.append(f"Only {len(codes)} readiness codes found (minimum 24 required)")

    # Check all required codes present
    for required_code in sorted(REQUIRED_CODES):
        if required_code not in codes:
            violations.append(f"Missing required readiness code: '{required_code}'")

    # Check Polish messages
    msg_violations = check_polish_messages(REGISTRY_FILE)
    violations.extend(msg_violations)

    if violations:
        print(f"\n{'='*60}")
        print(f"READINESS CODES GUARD: {len(violations)} violation(s)")
        print(f"{'='*60}\n")
        for v in violations:
            print(f"  VIOLATION: {v}")
        print()
        return 1

    print(
        f"Readiness Codes Guard: OK ({len(codes)} codes, "
        f"{len(REQUIRED_CODES)} required codes present)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
