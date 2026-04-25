from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEST_MATRIX_PATH = ROOT / "docs" / "v12xx" / "MACIERZ_TESTOW_V12_XX.md"

REQUIRED_REFERENCE_CODES = {
    "V12-GN-001": (
        ROOT / "backend" / "tests" / "test_canonical_analysis_api.py",
        ROOT / "backend" / "tests" / "proof_engine" / "test_sc_asymmetrical_golden.py",
    ),
    "V12-GN-002": (
        ROOT / "backend" / "tests" / "enm" / "test_domain_ops_policy_gpz.py",
        ROOT / "backend" / "tests" / "enm" / "test_v2_projection.py",
    ),
    "V12-GN-003": (
        ROOT / "backend" / "tests" / "test_phase_state_sn_solver.py",
        ROOT / "backend" / "tests" / "proof_engine" / "test_phase_state_sn_pack.py",
    ),
    "V12-GN-004": (
        ROOT / "backend" / "tests" / "application" / "test_source_compliance.py",
        ROOT / "backend" / "tests" / "test_oze_generators.py",
    ),
    "V12-GN-005": (
        ROOT / "backend" / "tests" / "application" / "test_automation_trace.py",
        ROOT / "frontend" / "e2e" / "branch-points-workflow.spec.ts",
    ),
    "V12-GN-006": (
        ROOT / "backend" / "tests" / "application" / "test_dynamic_stability.py",
    ),
    "V12-GN-007": (
        ROOT / "backend" / "tests" / "application" / "test_dynamic_stability.py",
    ),
}


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def format_path(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def markdown_table_rows(text: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    current_headers: list[str] | None = None
    expecting_separator = False

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line.startswith("|") or not line.endswith("|"):
            current_headers = None
            expecting_separator = False
            continue

        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if expecting_separator:
            if all(cell.replace("-", "").replace(":", "") == "" for cell in cells):
                expecting_separator = False
                continue
            current_headers = None
            expecting_separator = False

        if current_headers is None:
            current_headers = cells
            expecting_separator = True
            continue

        if len(cells) != len(current_headers):
            continue
        rows.append(dict(zip(current_headers, cells, strict=True)))

    return rows


def check_reference_networks_matrix() -> list[str]:
    if not TEST_MATRIX_PATH.exists():
        return [
            f"[reference-matrix-missing] {TEST_MATRIX_PATH.relative_to(ROOT).as_posix()}"
        ]

    rows = markdown_table_rows(read_text(TEST_MATRIX_PATH))
    code_to_row = {row.get("Kod", "").strip(): row for row in rows if row.get("Kod")}
    violations: list[str] = []

    for code, evidence_paths in REQUIRED_REFERENCE_CODES.items():
        row = code_to_row.get(code)
        if row is None:
            violations.append(f"[reference-matrix-code] missing row: {code}")
        for evidence_path in evidence_paths:
            if not evidence_path.exists():
                violations.append(
                    f"[reference-matrix-evidence] missing evidence file for {code}: {format_path(evidence_path)}"
                )

    return violations


def main() -> int:
    violations = check_reference_networks_matrix()
    if violations:
        print("reference-networks-guard: FAILED")
        for violation in violations:
            print(f" - {violation}")
        return 1

    print("reference-networks-guard: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
