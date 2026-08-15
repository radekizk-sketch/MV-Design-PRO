#!/usr/bin/env python3
"""CI Guard: Connection endpoint port binding (report-only by default).

Skanuje fixture'y ENM (backend tests/golden, tests/reference_networks, frontend
visual fixtures, e2e fixtures) i raportuje połączenia Cable / OverheadLine bez
wskazanych portów endpointów (``endpoint_a_port`` / ``endpoint_b_port``).

W trybie domyślnym (raport) skrypt zawsze kończy się EXIT 0 i wypisuje
podsumowanie liczby brakujących portów. W trybie ``--strict`` skrypt
zwraca EXIT 1 gdy znaleziono jakiekolwiek brakujące porty (PR 1.b włącza
strict po pełnej migracji fixture'ów).

Brakujące porty NIE są błędem implementacji rdzenia — konserwatywna
automigracja ``enm.migrations.endpoint_ports`` celowo pozostawia je gdy
nie da się jednoznacznie wybrać kandydata. To raport stanu, nie test.

EXIT:
  0 — report-only (default) lub strict mode bez naruszeń
  1 — strict mode + naruszenia
  2 — błąd skanu
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_TESTS = REPO_ROOT / "backend" / "tests"
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"
FRONTEND_E2E = REPO_ROOT / "frontend" / "e2e"

# Whitelist: pliki celowo demonstrujące E030 / brak portu
INTENTIONAL_MARKER_RE = re.compile(
    r"#\s*intentional[:\s]+tests?\s+CONNECTION_PORT_MISSING|"
    r"//\s*intentional[:\s]+tests?\s+CONNECTION_PORT_MISSING",
    re.IGNORECASE,
)

# Wzorce wykrywające Cable / OverheadLine w fixture
PY_CABLE_LINE_RE = re.compile(
    r"\b(Cable|OverheadLine)\s*\(",
    re.MULTILINE,
)
PY_ENDPOINT_PORT_RE = re.compile(
    r"endpoint_(?:a|b)_port\s*=",
)
TS_CABLE_LINE_KIND_RE = re.compile(
    r'"type"\s*:\s*"(cable|line_overhead)"',
)
TS_ENDPOINT_PORT_RE = re.compile(
    r'"endpoint_(?:a|b)_port"\s*:',
)


@dataclass
class GuardReport:
    files_scanned: int = 0
    files_with_connections: int = 0
    files_with_missing_ports: int = 0
    connections_total: int = 0
    connections_missing_ports: int = 0
    whitelisted_files: int = 0
    violations: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "files_scanned": self.files_scanned,
            "files_with_connections": self.files_with_connections,
            "files_with_missing_ports": self.files_with_missing_ports,
            "connections_total": self.connections_total,
            "connections_missing_ports": self.connections_missing_ports,
            "whitelisted_files": self.whitelisted_files,
            "violations": self.violations,
        }


def _scan_python_fixture(path: Path, report: GuardReport) -> None:
    text = path.read_text(encoding="utf-8", errors="replace")
    report.files_scanned += 1

    if INTENTIONAL_MARKER_RE.search(text):
        report.whitelisted_files += 1
        return

    cable_line_matches = PY_CABLE_LINE_RE.findall(text)
    if not cable_line_matches:
        return
    report.files_with_connections += 1

    # Heurystyka: liczba wystąpień Cable(/OverheadLine( vs liczba endpoint_*_port=
    connections = len(cable_line_matches)
    endpoint_assignments = len(PY_ENDPOINT_PORT_RE.findall(text))
    expected = connections * 2  # 2 endpointy na połączenie
    missing = max(0, expected - endpoint_assignments)
    report.connections_total += connections
    if missing > 0:
        report.connections_missing_ports += missing
        report.files_with_missing_ports += 1
        report.violations.append(
            f"{path.relative_to(REPO_ROOT)}: {connections} połączeń, "
            f"{endpoint_assignments}/{expected} przypisań endpoint_*_port "
            f"(brakuje {missing})"
        )


def _scan_typescript_fixture(path: Path, report: GuardReport) -> None:
    text = path.read_text(encoding="utf-8", errors="replace")
    report.files_scanned += 1

    if INTENTIONAL_MARKER_RE.search(text):
        report.whitelisted_files += 1
        return

    cable_line_matches = TS_CABLE_LINE_KIND_RE.findall(text)
    if not cable_line_matches:
        return
    report.files_with_connections += 1

    connections = len(cable_line_matches)
    endpoint_assignments = len(TS_ENDPOINT_PORT_RE.findall(text))
    expected = connections * 2
    missing = max(0, expected - endpoint_assignments)
    report.connections_total += connections
    if missing > 0:
        report.connections_missing_ports += missing
        report.files_with_missing_ports += 1
        report.violations.append(
            f"{path.relative_to(REPO_ROOT)}: {connections} połączeń, "
            f"{endpoint_assignments}/{expected} przypisań endpoint_*_port "
            f"(brakuje {missing})"
        )


def _iter_python_fixtures() -> list[Path]:
    candidates: list[Path] = []
    if BACKEND_TESTS.exists():
        for pattern in ("golden/**/*.py", "reference_networks/**/*.py"):
            candidates.extend(BACKEND_TESTS.glob(pattern))
    return sorted(p for p in candidates if p.is_file())


def _iter_typescript_fixtures() -> list[Path]:
    candidates: list[Path] = []
    if FRONTEND_SRC.exists():
        for pattern in (
            "ui/sld/v2/__tests__/fixtures/**/*.ts",
            "ui/sld/v2/__tests__/fixtures/**/*.tsx",
        ):
            candidates.extend(FRONTEND_SRC.glob(pattern))
    if FRONTEND_E2E.exists():
        for pattern in ("fixtures/**/*.ts", "fixtures/**/*.json"):
            candidates.extend(FRONTEND_E2E.glob(pattern))
    return sorted(p for p in candidates if p.is_file())


@dataclass
class PortsManifestIssue:
    """Schema violation in canonical_symbols/ports.json (PLAN_SLD_REWORK F1)."""

    symbol_id: str
    field_path: str
    issue: str


def _validate_ports_manifest() -> tuple[int, int, list[PortsManifestIssue]]:
    """
    Validate ports.json schema consistency (PLAN_SLD_REWORK F1, V12K-013).

    Wymagane reguły (per SLD_IEC_60617_PARITY § 5):
    1. Każdy SVG w canonical_symbols/ ma entry w ports.json (i odwrotnie)
    2. Każda entry ma: description, viewBox, ports, allowedRotations, defaultRotation
    3. Każdy port w entry ma: x, y (legacy entries akceptowane bez kind/voltage_kv_compat,
       nowe entries 2026-05+ MUSZĄ mieć pełen schema z kind + voltage_kv_compat).

    Zwraca:
        (svg_count, json_count, list_of_violations)
    """
    ports_dir = FRONTEND_SRC / "ui" / "sld" / "canonical_symbols"
    issues: list[PortsManifestIssue] = []
    if not ports_dir.exists():
        return (0, 0, issues)

    svg_files = {p.stem for p in ports_dir.glob("*.svg")}
    manifest_path = ports_dir / "ports.json"
    if not manifest_path.exists():
        return (len(svg_files), 0, issues)

    raw = manifest_path.read_text(encoding="utf-8-sig")
    try:
        manifest = json.loads(raw)
    except json.JSONDecodeError as exc:
        issues.append(
            PortsManifestIssue(
                symbol_id="<ports.json>",
                field_path="$",
                issue=f"invalid JSON: {exc}",
            )
        )
        return (len(svg_files), 0, issues)

    symbols = manifest.get("symbols", {})
    if not isinstance(symbols, dict):
        issues.append(
            PortsManifestIssue(
                symbol_id="<ports.json>",
                field_path="$.symbols",
                issue="symbols must be a JSON object",
            )
        )
        return (len(svg_files), 0, issues)

    # 1. SVG ↔ ports.json sync
    for svg_name in sorted(svg_files):
        if svg_name not in symbols:
            issues.append(
                PortsManifestIssue(
                    symbol_id=svg_name,
                    field_path="$.symbols",
                    issue=f"SVG {svg_name}.svg has no ports.json entry",
                )
            )
    for sym_id in sorted(symbols.keys()):
        if sym_id not in svg_files:
            issues.append(
                PortsManifestIssue(
                    symbol_id=sym_id,
                    field_path=f"$.symbols.{sym_id}",
                    issue="ports.json entry has no corresponding .svg file",
                )
            )

    # 2. Required entry fields
    required_entry_fields = (
        "description",
        "viewBox",
        "ports",
        "allowedRotations",
        "defaultRotation",
    )
    for sym_id, entry in symbols.items():
        if not isinstance(entry, dict):
            issues.append(
                PortsManifestIssue(
                    symbol_id=sym_id,
                    field_path=f"$.symbols.{sym_id}",
                    issue="entry must be a JSON object",
                )
            )
            continue
        for field_name in required_entry_fields:
            if field_name not in entry:
                issues.append(
                    PortsManifestIssue(
                        symbol_id=sym_id,
                        field_path=f"$.symbols.{sym_id}.{field_name}",
                        issue=f"missing required field {field_name!r}",
                    )
                )

    # 3. Port coordinates and optional kind/voltage_kv_compat
    for sym_id, entry in symbols.items():
        if not isinstance(entry, dict):
            continue
        ports = entry.get("ports", {})
        if not isinstance(ports, dict):
            issues.append(
                PortsManifestIssue(
                    symbol_id=sym_id,
                    field_path=f"$.symbols.{sym_id}.ports",
                    issue="ports must be a JSON object",
                )
            )
            continue
        for port_id, port in ports.items():
            if not isinstance(port, dict):
                issues.append(
                    PortsManifestIssue(
                        symbol_id=sym_id,
                        field_path=f"$.symbols.{sym_id}.ports.{port_id}",
                        issue="port must be a JSON object",
                    )
                )
                continue
            for coord in ("x", "y"):
                if coord not in port or not isinstance(port[coord], int | float):
                    issues.append(
                        PortsManifestIssue(
                            symbol_id=sym_id,
                            field_path=f"$.symbols.{sym_id}.ports.{port_id}.{coord}",
                            issue=f"port {coord!r} must be a number",
                        )
                    )
            # If kind is present, it must be a known enum value.
            if "kind" in port:
                kind = port["kind"]
                allowed_kinds = {"BUS", "LINE_IN", "LINE_OUT", "EARTH", "TAP"}
                if kind not in allowed_kinds:
                    issues.append(
                        PortsManifestIssue(
                            symbol_id=sym_id,
                            field_path=f"$.symbols.{sym_id}.ports.{port_id}.kind",
                            issue=f"unknown port kind {kind!r}, expected one of {sorted(allowed_kinds)}",
                        )
                    )
            # If voltage_kv_compat is present, must be list of numbers.
            if "voltage_kv_compat" in port:
                vc = port["voltage_kv_compat"]
                if not isinstance(vc, list) or not all(
                    isinstance(v, int | float) and v > 0 for v in vc
                ):
                    issues.append(
                        PortsManifestIssue(
                            symbol_id=sym_id,
                            field_path=f"$.symbols.{sym_id}.ports.{port_id}.voltage_kv_compat",
                            issue="voltage_kv_compat must be a list of positive numbers",
                        )
                    )

    return (len(svg_files), len(symbols), issues)


def run(*, strict: bool, json_output: bool) -> int:
    report = GuardReport()

    for path in _iter_python_fixtures():
        _scan_python_fixture(path, report)
    for path in _iter_typescript_fixtures():
        _scan_typescript_fixture(path, report)

    # PLAN_SLD_REWORK F1 + V12K-013: validate ports.json schema consistency.
    svg_count, manifest_count, manifest_issues = _validate_ports_manifest()

    if json_output:
        payload = report.to_dict()
        payload["ports_manifest"] = {
            "svg_count": svg_count,
            "manifest_entry_count": manifest_count,
            "in_sync": (svg_count == manifest_count) and not manifest_issues,
            "issues": [
                {"symbol_id": i.symbol_id, "field_path": i.field_path, "issue": i.issue}
                for i in manifest_issues
            ],
        }
        json.dump(payload, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
    else:
        print(
            "port_binding_guard: "
            f"przeskanowano {report.files_scanned} plików, "
            f"{report.files_with_connections} zawiera Cable/OverheadLine, "
            f"{report.connections_total} połączeń, "
            f"{report.connections_missing_ports} brakujących endpoint_*_port "
            f"w {report.files_with_missing_ports} plikach, "
            f"whitelistowane: {report.whitelisted_files}."
        )
        if report.violations:
            print("\nFixture wymagające migracji (PR 1.b):")
            for v in report.violations[:20]:
                print(f"  - {v}")
            if len(report.violations) > 20:
                print(f"  ... oraz {len(report.violations) - 20} kolejnych")

        # PLAN_SLD_REWORK F1 ports.json schema validation report
        in_sync = svg_count == manifest_count and not manifest_issues
        status_marker = "OK" if in_sync else "WARN"
        print(
            f"\nports.json schema [{status_marker}]: "
            f"{svg_count} SVG plików, {manifest_count} entries w ports.json, "
            f"{len(manifest_issues)} naruszeń schemy."
        )
        if manifest_issues:
            print("\nNaruszenia ports.json (PLAN_SLD_REWORK F1 / V12K-013):")
            for issue in manifest_issues[:20]:
                print(f"  - [{issue.symbol_id}] {issue.field_path}: {issue.issue}")
            if len(manifest_issues) > 20:
                print(f"  ... oraz {len(manifest_issues) - 20} kolejnych")

    if strict and (report.connections_missing_ports > 0 or manifest_issues):
        return 1
    return 0


def _build_argparser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Guard portów endpointu połączeń SN.")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="EXIT 1 gdy znaleziono brakujące porty (domyślnie report-only EXIT 0)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Wynik jako JSON na stdout zamiast czytelnego raportu",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_argparser().parse_args(argv)
    try:
        return run(strict=args.strict, json_output=args.json)
    except Exception as exc:  # noqa: BLE001
        print(f"port_binding_guard: błąd skanu: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
