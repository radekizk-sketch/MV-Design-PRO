from __future__ import annotations

from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]

ENTRYPOINT_PATTERNS: dict[str, list[tuple[str, str]]] = {
    "frontend/src/App.tsx": [
        ("wizard public import", r"WizardPage|SwitchgearWizardPage|[/\\\\]ui[/\\\\]wizard"),
        ("legacy dedicated route page", r"ReferencePatternsPage|ProtectionSettingsPage|PowerDistributionPage"),
        ("legacy layout import", r"PowerFactoryLayout"),
        ("legacy helper page import", r"TypeLibraryBrowser|CaseConfigPage"),
    ],
    # F12 (2026-07-16): CanonicalLayout.tsx skasowany w a88c6960 (konsolidacja
    # shellu) — nastepca CanonicalLayoutV3.tsx przejal TE SAME zakazy.
    # V12K-184: CanonicalLayoutV3.tsx zostal z kolei skasowany w 3693c01e
    # (E1.7c „nowa powloka domyslna … kasacja starej ramy"), a wpis guarda nie
    # zostal wtedy przekierowany — guard byl CZERWONY na [missing-entrypoint].
    # Aktywna powloka to ui2/shell/AppShell.tsx i przejmuje TE SAME zakazy
    # (intencja guarda bez zmian: brak importu legacy layoutu w aktywnym shellu).
    "frontend/src/ui2/shell/AppShell.tsx": [
        ("legacy layout import", r"PowerFactoryLayout"),
    ],
    "frontend/src/ui/navigation/routes.ts": [
        ("legacy public route", r"#reference-patterns|#protection-settings|#power-distribution"),
    ],
}

INDEX_PATHS = (
    "docs/INDEX.md",
    "docs/INDEX_KANONICZNY.md",
)

REQUIRED_ACTIVE_DOCS = (
    "docs/INDEX.md",
    "docs/INDEX_KANONICZNY.md",
    "docs/archive/README.md",
    "docs/analysis/P26_AUTO_RECOMMENDATIONS_CANONICAL_PLUS.md",
    "docs/analysis/P27_SCENARIO_COMPARISON_CANONICAL_PLUS.md",
    "docs/analysis/P33_LF_SENSITIVITY_CANONICAL_KILLER.md",
    "docs/analysis/SENSITIVITY_ANALYSIS_CANONICAL_PLUS.md",
    "docs/architecture/STUDY_SCENARIO_WORKFLOW_CANONICAL_PLUS.md",
    "docs/audit/REPO_HYGIENE_PO_FAZIE_KATALOG_FIRST.md",
    "docs/ui/UI_CANONICAL_PARITY_MATRIX.md",
    "docs/ui/ui_canonical_parity.md",
)

BANNED_INDEX_TOKENS = (
    "P26_AUTO_RECOMMENDATIONS_ETAP_PLUS.md",
    "P27_SCENARIO_COMPARISON_ETAP_PLUS.md",
    "P33_LF_SENSITIVITY_ETAP_KILLER.md",
    "SENSITIVITY_ANALYSIS_ETAP_PLUS.md",
    "STUDY_SCENARIO_WORKFLOW_ETAP_PLUS.md",
    "REPO_HYGIENE_PO_ETAPIE_KATALOG_FIRST.md",
    "UI_ETAP_POWERFACTORY_PARITY.md",
    "powerfactory_ui_parity.md",
    "_codex_test.tmp",
)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def check_entrypoint(relative_path: str, rules: list[tuple[str, str]]) -> list[str]:
    path = ROOT / relative_path
    if not path.exists():
        return [f"[missing-entrypoint] {relative_path}"]

    text = read_text(path)
    violations: list[str] = []

    for label, pattern in rules:
        match = re.search(pattern, text)
        if match is None:
            continue
        line_no = text.count("\n", 0, match.start()) + 1
        snippet = text.splitlines()[line_no - 1].strip() if text.splitlines() else ""
        violations.append(f"[{label}] {relative_path}:{line_no}: {snippet}")

    return violations


def check_history_labels(index_relative_path: str) -> list[str]:
    path = ROOT / index_relative_path
    if not path.exists():
        return [f"[missing-index] {index_relative_path}"]

    violations: list[str] = []
    for line_no, line in enumerate(read_text(path).splitlines(), start=1):
        if "](./spec/" in line and "[historyczne]" not in line:
            violations.append(
                f"[history-label] {index_relative_path}:{line_no}: historyczne linki do docs/spec muszą być oznaczone"
            )
        if "](./archive/" in line and "[historyczne]" not in line:
            violations.append(
                f"[history-label] {index_relative_path}:{line_no}: historyczne linki do docs/archive muszą być oznaczone"
            )
    return violations


def check_required_active_docs_exist() -> list[str]:
    violations: list[str] = []
    for relative_path in REQUIRED_ACTIVE_DOCS:
        if not (ROOT / relative_path).exists():
            violations.append(f"[missing-doc] {relative_path}")
    return violations


def check_indexes_for_banned_tokens() -> list[str]:
    violations: list[str] = []
    for index_relative_path in INDEX_PATHS:
        path = ROOT / index_relative_path
        if not path.exists():
            continue
        text = read_text(path)
        for token in BANNED_INDEX_TOKENS:
            if token not in text:
                continue
            line_no = text.count("\n", 0, text.index(token)) + 1
            violations.append(
                f"[legacy-index-token] {index_relative_path}:{line_no}: found legacy token {token!r}"
            )
    return violations


def main() -> int:
    violations: list[str] = []
    for relative_path, rules in ENTRYPOINT_PATTERNS.items():
        violations.extend(check_entrypoint(relative_path, rules))
    for index_relative_path in INDEX_PATHS:
        violations.extend(check_history_labels(index_relative_path))
    violations.extend(check_required_active_docs_exist())
    violations.extend(check_indexes_for_banned_tokens())

    if violations:
        print("V12.5 import graph guard failed:")
        for violation in violations:
            print(f" - {violation}")
        return 1

    print("V12.5 import graph guard passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
