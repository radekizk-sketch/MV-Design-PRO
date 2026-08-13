#!/usr/bin/env python3
"""
Catalog-first repo hygiene guard.

Checks active catalog-first paths for:
1. Legacy active route/API references that must stay removed after PR #428
2. TODO/FIXME markers in critical catalog-first code paths
3. Default catalog helpers / catalog guessing in active forms and SLD
4. Legacy catalog payload aliases in active frontend types and E2E flows

Exit codes:
  0 = clean
  1 = violations found
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

SKIP_FILE_MARKERS = (
    "__tests__",
    ".test.",
    ".spec.",
    "__pycache__",
)

E2E_SKIP_FILE_MARKERS = (
    "__tests__",
    ".test.",
    "__pycache__",
)

ACTIVE_LEGACY_TARGETS = [
    "backend/src/api/main.py",
    "frontend/src/App.tsx",
    "frontend/src/ui/navigation",
    "frontend/src/ui/layout",
    "frontend/src/ui/results-inspector",
    "frontend/src/ui/issue-panel",
    "frontend/src/ui/network-build/forms",
    "frontend/src/ui/sld",
]

BACKEND_ACTIVE_MOUNT_PATTERNS = [
    (
        re.compile(r"\bissues(?:_router)?\b"),
        "legacy issues router reference in active api.main",
    ),
    (
        re.compile(r"\bresults_workspace(?:_router)?\b"),
        "legacy results_workspace router reference in active api.main",
    ),
    (
        re.compile(r"\bdesign_synth(?:_router)?\b"),
        "legacy design_synth router reference in active api.main",
    ),
    (
        re.compile(r"\bprotection_runs(?:_router)?\b"),
        "legacy protection_runs router reference in active api.main",
    ),
    (
        re.compile(r"\bdomain_operations(?:_router)?\b"),
        "legacy domain_operations router reference in active api.main",
    ),
]

ACTIVE_LEGACY_PATTERNS = [
    (re.compile(r"#results-workspace\b"), "legacy route '#results-workspace'"),
    (re.compile(r"/api/issues\b"), "legacy API '/api/issues'"),
    (re.compile(r"/api/results-workspace\b"), "legacy API '/api/results-workspace'"),
]

CRITICAL_TODO_TARGETS = [
    "backend/src/api/analysis_runs.py",
    "backend/src/api/catalog.py",
    "backend/src/api/domain_ops_policy.py",
    "backend/src/api/enm.py",
    "backend/src/api/main.py",
    "backend/src/api/sld.py",
    "backend/src/domain",
    "backend/src/enm",
    "frontend/src/App.tsx",
    "frontend/src/ui/catalog",
    "frontend/src/ui/network-build/forms",
    "frontend/src/ui/proof",
    "frontend/src/ui/results-inspector",
    "frontend/src/ui/sld",
    "frontend/src/ui/topology",
]

TODO_PATTERNS = [
    (re.compile(r"\bTODO\b", re.IGNORECASE), "TODO marker"),
    (re.compile(r"\bFIXME\b", re.IGNORECASE), "FIXME marker"),
]

NO_GUESSING_TARGETS = [
    "frontend/src/ui/network-build/forms",
    "frontend/src/ui/sld",
    "frontend/src/ui/topology/modals",
]

NO_GUESSING_PATTERNS = [
    (re.compile(r"\bcatalogDefaults\b"), "catalog defaults helper in active forms/SLD"),
    (
        re.compile(r"\binferCatalogNamespaceFromElement\b"),
        "catalog namespace guessing helper in active forms/SLD",
    ),
    (
        re.compile(r"\bgetDefaultBindingForElement\b"),
        "default catalog binding helper in active forms/SLD",
    ),
    (
        re.compile(r"\bDEFAULT_CATALOG_VERSION\b"),
        "default catalog version helper in active forms/SLD",
    ),
    (
        re.compile(r"\bassign_default_catalog\b"),
        "legacy assign_default_catalog action alias in active forms/SLD",
    ),
    (
        re.compile(r"\bassign_next_catalog\b"),
        "legacy assign_next_catalog action alias in active forms/SLD",
    ),
]

LEGACY_PAYLOAD_TARGETS = [
    "frontend/src/types/domainOps.ts",
    "frontend/e2e",
]

LEGACY_PAYLOAD_PATTERNS = [
    (
        re.compile(r"\bcatalog_ref\s*:"),
        "legacy catalog_ref payload field in active frontend types/e2e",
    ),
    (
        re.compile(r"\btransformer_catalog_ref\s*:"),
        "legacy transformer_catalog_ref payload field in active frontend types/e2e",
    ),
]


@dataclass(frozen=True)
class Violation:
    path: str
    line_no: int
    rule: str
    context: str


def _iter_target_files(root: Path, targets: list[str]) -> list[Path]:
    files: list[Path] = []
    for rel_path in targets:
        absolute = root / rel_path
        if absolute.is_file():
            files.append(absolute)
            continue
        if absolute.is_dir():
            files.extend(path for path in absolute.rglob("*") if path.is_file())
    return sorted(set(files))


def _should_skip_file(path: Path, skip_file_markers: tuple[str, ...] = SKIP_FILE_MARKERS) -> bool:
    normalized = str(path).replace("\\", "/")
    return any(marker in normalized for marker in skip_file_markers)


def _is_comment_line(line: str) -> bool:
    stripped = line.lstrip()
    return (
        stripped.startswith("//")
        or stripped.startswith("/*")
        or stripped.startswith("*")
        or stripped.startswith("*/")
        or stripped.startswith("#")
    )


def scan_targets(
    root: Path,
    targets: list[str],
    patterns: list[tuple[re.Pattern[str], str]],
    *,
    skip_comment_lines: bool,
    skip_file_markers: tuple[str, ...] = SKIP_FILE_MARKERS,
) -> list[Violation]:
    violations: list[Violation] = []

    for path in _iter_target_files(root, targets):
        if _should_skip_file(path, skip_file_markers):
            continue

        try:
            content = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue

        for line_no, line in enumerate(content.splitlines(), start=1):
            if skip_comment_lines and _is_comment_line(line):
                continue

            for pattern, rule in patterns:
                if pattern.search(line):
                    violations.append(
                        Violation(
                            path=str(path.relative_to(root)).replace("\\", "/"),
                            line_no=line_no,
                            rule=rule,
                            context=line.strip(),
                        )
                    )
                    break

    return violations


def check_active_legacy_refs(root: Path = PROJECT_ROOT) -> list[Violation]:
    return scan_targets(
        root,
        ACTIVE_LEGACY_TARGETS[1:],
        ACTIVE_LEGACY_PATTERNS,
        skip_comment_lines=True,
    )


def check_backend_main_mounts(root: Path = PROJECT_ROOT) -> list[Violation]:
    return scan_targets(
        root,
        [ACTIVE_LEGACY_TARGETS[0]],
        BACKEND_ACTIVE_MOUNT_PATTERNS,
        skip_comment_lines=True,
    )


def check_todo_fixme(root: Path = PROJECT_ROOT) -> list[Violation]:
    return scan_targets(
        root,
        CRITICAL_TODO_TARGETS,
        TODO_PATTERNS,
        skip_comment_lines=False,
    )


def check_catalog_guessing(root: Path = PROJECT_ROOT) -> list[Violation]:
    return scan_targets(
        root,
        NO_GUESSING_TARGETS,
        NO_GUESSING_PATTERNS,
        skip_comment_lines=True,
    )


def check_legacy_catalog_payloads(root: Path = PROJECT_ROOT) -> list[Violation]:
    violations = scan_targets(
        root,
        LEGACY_PAYLOAD_TARGETS,
        LEGACY_PAYLOAD_PATTERNS,
        skip_comment_lines=True,
        skip_file_markers=E2E_SKIP_FILE_MARKERS,
    )

    for path in _iter_target_files(root, LEGACY_PAYLOAD_TARGETS):
        if _should_skip_file(path, E2E_SKIP_FILE_MARKERS):
            continue
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeDecodeError):
            continue

        normalized = str(path.relative_to(root)).replace("\\", "/")
        for line_no, line in enumerate(lines, start=1):
            if _is_comment_line(line):
                continue

            if normalized == "frontend/src/types/domainOps.ts":
                if re.search(r"\bfrom_bus_ref\?\s*:", line):
                    violations.append(
                        Violation(
                            path=normalized,
                            line_no=line_no,
                            rule="legacy from_bus_ref payload field in active frontend types/e2e",
                            context=line.strip(),
                        )
                    )
                continue

            if not normalized.startswith("frontend/e2e/"):
                continue

            if not re.search(r"\bfrom_bus_ref\s*:", line):
                continue

            context_window = "\n".join(lines[max(0, line_no - 8) : line_no])
            if "connect_secondary_ring_sn" in context_window:
                continue

            violations.append(
                Violation(
                    path=normalized,
                    line_no=line_no,
                    rule="legacy from_bus_ref payload field in active frontend types/e2e",
                    context=line.strip(),
                )
            )

    return violations


def _print_group(title: str, violations: list[Violation]) -> None:
    print("=" * 72, file=sys.stderr)
    print(title, file=sys.stderr)
    print("=" * 72, file=sys.stderr)
    for violation in violations:
        print(
            f"  {violation.path}:{violation.line_no}: {violation.context}",
            file=sys.stderr,
        )
        print(f"    -> {violation.rule}", file=sys.stderr)
    print(file=sys.stderr)


def main() -> int:
    groups = {
        "REPO HYGIENE: legacy refs in active paths": check_active_legacy_refs(),
        "REPO HYGIENE: legacy router mounts in backend api.main": check_backend_main_mounts(),
        "REPO HYGIENE: TODO/FIXME in critical catalog-first paths": check_todo_fixme(),
        "REPO HYGIENE: default catalog guessing in active forms/SLD": check_catalog_guessing(),
        "REPO HYGIENE: legacy catalog payload aliases in frontend types/e2e": check_legacy_catalog_payloads(),
    }

    total = sum(len(items) for items in groups.values())
    if total == 0:
        print("repo-hygiene-guard: OK (catalog-first active paths clean)")
        return 0

    for title, violations in groups.items():
        if violations:
            _print_group(title, violations)

    print(
        f"repo-hygiene-guard: FAIL ({total} violation(s) in active catalog-first paths)",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
