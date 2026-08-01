from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS_DIR = ROOT / "docs"
SPEC_DIR = DOCS_DIR / "spec"
ARCHIVE_DIR = DOCS_DIR / "archive"
INDEX_PATHS = (
    DOCS_DIR / "INDEX.md",
    DOCS_DIR / "INDEX_KANONICZNY.md",
)
HISTORICAL_DOC_DIRS = (
    SPEC_DIR,
    ARCHIVE_DIR,
    DOCS_DIR / "audit" / "historical_execplans",
)
ARCHIVE_LINK_PATTERN = re.compile(r"\]\((?:\./|\.\./)?archive(?:/[^)]*)?\)")
MARKDOWN_LINK_PATTERN = re.compile(r"\]\(([^)#]+)\)")
HISTORICAL_SPEC_PATTERNS = (
    "docs/spec/",
    "](./spec/",
    "](../spec/",
)

HISTORICAL_PREFIX = [
    "> **Historical note (V12.5)**",
    "> This file is preserved as historical reference only.",
    "> docs/spec/ is not an active source of truth.",
]

MIGRATION_MAP = {
    "analysis/P26_AUTO_RECOMMENDATIONS_ETAP_PLUS.md": "analysis/P26_AUTO_RECOMMENDATIONS_CANONICAL_PLUS.md",
    "analysis/P27_SCENARIO_COMPARISON_ETAP_PLUS.md": "analysis/P27_SCENARIO_COMPARISON_CANONICAL_PLUS.md",
    "analysis/P33_LF_SENSITIVITY_ETAP_KILLER.md": "analysis/P33_LF_SENSITIVITY_CANONICAL_KILLER.md",
    "analysis/SENSITIVITY_ANALYSIS_ETAP_PLUS.md": "analysis/SENSITIVITY_ANALYSIS_CANONICAL_PLUS.md",
    "architecture/STUDY_SCENARIO_WORKFLOW_ETAP_PLUS.md": "architecture/STUDY_SCENARIO_WORKFLOW_CANONICAL_PLUS.md",
    "audit/REPO_HYGIENE_PO_ETAPIE_KATALOG_FIRST.md": "audit/REPO_HYGIENE_PO_FAZIE_KATALOG_FIRST.md",
    "ui/UI_ETAP_POWERFACTORY_PARITY.md": "ui/UI_CANONICAL_PARITY_MATRIX.md",
    "ui/powerfactory_ui_parity.md": "ui/ui_canonical_parity.md",
}

TEMP_ARTIFACTS = (DOCS_DIR / "spec" / "_codex_test.tmp",)


def is_historical_doc(path: Path) -> bool:
    return any(path == directory or directory in path.parents for directory in HISTORICAL_DOC_DIRS)


def iter_active_docs() -> list[Path]:
    return [path for path in sorted(DOCS_DIR.rglob("*.md")) if not is_historical_doc(path)]


def extract_markdown_targets(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    targets: list[str] = []
    for match in MARKDOWN_LINK_PATTERN.finditer(text):
        target = match.group(1).strip()
        if not target or "://" in target or target.startswith("#"):
            continue
        targets.append(target)
    return targets


def resolve_target(base_path: Path, raw_target: str) -> Path:
    return (base_path.parent / raw_target).resolve()


def check_spec_banners() -> list[str]:
    violations: list[str] = []
    for path in sorted(SPEC_DIR.glob("*.md")):
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
        normalized = [line.lstrip("\ufeff") for line in lines]
        while normalized and not normalized[0].strip():
            normalized.pop(0)
        for index, expected in enumerate(HISTORICAL_PREFIX, start=1):
            actual = normalized[index - 1] if len(normalized) >= index else ""
            if actual != expected:
                rel_path = path.relative_to(ROOT).as_posix()
                violations.append(f"[historical-banner] {rel_path}:{index}: expected {expected!r}")
                break
    return violations


def check_archive_readme() -> list[str]:
    readme = ARCHIVE_DIR / "README.md"
    if not readme.exists():
        return ["[archive-readme] docs/archive/README.md is missing"]

    content = readme.read_text(encoding="utf-8", errors="ignore")
    violations: list[str] = []
    if "Historical Archive" not in content:
        violations.append("[archive-readme] docs/archive/README.md missing archive header")
    if "../INDEX.md" not in content:
        violations.append("[archive-readme] docs/archive/README.md must point to ../INDEX.md")
    if "../INDEX_KANONICZNY.md" not in content:
        violations.append(
            "[archive-readme] docs/archive/README.md must point to ../INDEX_KANONICZNY.md"
        )
    if "V12.5 migration map" not in content:
        violations.append(
            "[archive-readme] docs/archive/README.md missing V12.5 migration map section"
        )
    for legacy_path, active_path in MIGRATION_MAP.items():
        row = f"| `{legacy_path}` | `{active_path}` |"
        if row not in content:
            violations.append(f"[archive-readme] docs/archive/README.md missing mapping row {row}")
    return violations


def check_active_successors_exist() -> list[str]:
    violations: list[str] = []
    for successor in MIGRATION_MAP.values():
        if not (DOCS_DIR / successor).exists():
            violations.append(f"[missing-successor] docs/{successor}")
    return violations


def check_temp_artifacts_absent() -> list[str]:
    violations: list[str] = []
    for path in TEMP_ARTIFACTS:
        if path.exists():
            violations.append(
                f"[temp-artifact] {path.relative_to(ROOT).as_posix()} should not exist"
            )
    return violations


def check_history_labels(index_path: Path) -> list[str]:
    if not index_path.exists():
        return [f"[missing-index] {index_path.relative_to(ROOT).as_posix()}"]

    violations: list[str] = []
    rel_index = index_path.relative_to(ROOT).as_posix()
    for line_no, line in enumerate(
        index_path.read_text(encoding="utf-8", errors="ignore").splitlines(), start=1
    ):
        if "](./spec/" in line and "[historyczne]" not in line:
            violations.append(
                f"[history-label] {rel_index}:{line_no}: docs/spec links must be marked [historyczne]"
            )
        if "](./archive/" in line and "[historyczne]" not in line:
            violations.append(
                f"[history-label] {rel_index}:{line_no}: docs/archive links must be marked [historyczne]"
            )
    return violations


def check_active_doc_archive_links() -> list[str]:
    violations: list[str] = []
    for path in iter_active_docs():
        rel_path = path.relative_to(ROOT).as_posix()
        for line_no, line in enumerate(
            path.read_text(encoding="utf-8", errors="ignore").splitlines(), start=1
        ):
            if ARCHIVE_LINK_PATTERN.search(line) is None:
                continue
            if "[historyczne]" in line:
                continue
            violations.append(
                f"[archive-link] {rel_path}:{line_no}: docs/archive links in active docs must be marked [historyczne]"
            )
    return violations


def check_index_targets_exist() -> list[str]:
    violations: list[str] = []
    for index_path in INDEX_PATHS:
        if not index_path.exists():
            continue
        rel_index = index_path.relative_to(ROOT).as_posix()
        for raw_target in extract_markdown_targets(index_path):
            resolved_target = resolve_target(index_path, raw_target)
            if resolved_target.exists():
                continue
            violations.append(f"[missing-index-target] {rel_index}: missing target {raw_target}")
    return violations


META_AUDIT_ALLOWLIST = {
    # Audit and cleanup documents that explicitly discuss the docs/spec/ archival
    # status as part of the V12.xx canon resolution (V12K-011). These documents
    # describe the conflict and its resolution — they do not route active canon
    # through docs/spec/.
    "docs/audit/DOC_INVENTORY_2026-05.md",
    "docs/audit/AUDYT_BRAKI_2026-05.md",
    "docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md",
    "docs/plan/PLAN_SLD_REWORK.md",
    # 2026-07 programs — discuss the docs/spec/ archival drift (and its fix) as
    # audit findings; they do not route active canon through docs/spec/.
    "docs/plan/PLAN_PRZEBUDOWY_10X_2026-07.md",
    "docs/uiux/PROGRAM_UIUX_2026-07.md",
    "docs/sld/SLD_INDUSTRIAL_SPEC_v1.md",
    # V12.xx canon registry already records conflict V12K-002 about docs/spec/
    # so its mention there is the canonical authoritative reference, not routing.
    "docs/v12xx/REJESTR_KONFLIKTOW.md",
    # 2026-05 cleanup audits (extended) — discuss docs/spec/ status as part of
    # the documentation cleanup, do not route active canon through docs/spec/.
    "docs/audit/DOCUMENTATION_CLEANUP_AUDIT.md",
    "docs/audit/SLD_VISUAL_QUALITY_AUDIT.md",
    "docs/audit/ENGINEER_WORKFLOW_AUDIT.md",
    "docs/audit/IMPLEMENTATION_GAP_ANALYSIS.md",
    "docs/sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md",
    "docs/sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md",
    "docs/sld/SLD_ENGINEER_WORKFLOW_END_TO_END.md",
    "docs/sld/SLD_IMPLEMENTATION_ROADMAP.md",
}


def check_indexed_active_docs_for_historical_spec_refs() -> list[str]:
    violations: list[str] = []
    seen_paths: set[Path] = set()
    for index_path in INDEX_PATHS:
        if not index_path.exists():
            continue
        for raw_target in extract_markdown_targets(index_path):
            resolved_target = resolve_target(index_path, raw_target)
            if not resolved_target.exists() or resolved_target.suffix.lower() != ".md":
                continue
            try:
                resolved_target.relative_to(DOCS_DIR)
            except ValueError:
                continue
            if resolved_target in INDEX_PATHS or is_historical_doc(resolved_target):
                continue
            if resolved_target in seen_paths:
                continue
            seen_paths.add(resolved_target)

            rel_path = resolved_target.relative_to(ROOT).as_posix()
            if rel_path in META_AUDIT_ALLOWLIST:
                continue
            for line_no, line in enumerate(
                resolved_target.read_text(encoding="utf-8", errors="ignore").splitlines(),
                start=1,
            ):
                if not any(pattern in line for pattern in HISTORICAL_SPEC_PATTERNS):
                    continue
                violations.append(
                    f"[historical-spec-ref] {rel_path}:{line_no}: indexed active docs must not route canon through docs/spec/"
                )
    return violations


def main() -> int:
    violations: list[str] = []
    violations.extend(check_spec_banners())
    violations.extend(check_archive_readme())
    violations.extend(check_active_successors_exist())
    violations.extend(check_temp_artifacts_absent())
    violations.extend(check_history_labels(DOCS_DIR / "INDEX.md"))
    violations.extend(check_history_labels(DOCS_DIR / "INDEX_KANONICZNY.md"))
    violations.extend(check_active_doc_archive_links())
    violations.extend(check_index_targets_exist())
    violations.extend(check_indexed_active_docs_for_historical_spec_refs())

    if violations:
        print("V12.5 docs archive guard failed:")
        for violation in violations:
            print(f" - {violation}")
        return 1

    print("V12.5 docs archive guard passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
