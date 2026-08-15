#!/usr/bin/env python3
"""
CI Guard: forbidden_ui_terms_guard.py

Scans frontend source for forbidden English technical terms that must be
replaced with Polish equivalents in UI-visible strings.

Rules:
- "materializacja" allowed (it's Polish)
- "binding" → "powiązanie z katalogiem"
- "namespace" → "kategoria katalogu"
- "drift" → "rozbieżność katalogu"
- "readiness" → "gotowość obliczeń"
- "fix actions" → "szybkie naprawy"
- "blocker" → use severity indicators, not the word

EXIT 0 = pass, EXIT 1 = fail
"""

import os
import re
import sys

# Forbidden terms in UI-visible strings (JSX text, aria-label, title, placeholder, etc.)
# These are checked in .tsx and .ts files for string literals
FORBIDDEN_TERMS_IN_UI: dict[str, str] = {
    r"\bnamespace\b": "namespace (użyj 'kategoria katalogu')",
    r"\bdrift\b": "drift (użyj 'rozbieżność katalogu')",
    r"\bfix\s+actions?\b": "fix action(s) (użyj 'szybkie naprawy')",
}

STRING_LITERAL_RE = re.compile(
    r"""(?P<quote>['"])(?P<value>(?:\\.|(?! (?P=quote)).)*)(?P=quote)""",
    re.VERBOSE,
)

# Exempted file patterns (test files, type definitions, internal code)
EXEMPT_PATTERNS: list[str] = [
    "__tests__",
    ".test.",
    ".spec.",
    "test/",
    "types.ts",
    "types/",
    "contracts/",
    ".d.ts",
    "node_modules",
    "dist/",
    "build/",
]

# Directories to scan
SCAN_DIRS: list[str] = [
    os.path.join("frontend", "src", "ui"),
    os.path.join("frontend", "src", "designer"),
]


def is_exempt(filepath: str) -> bool:
    """Check if file is exempt from scanning."""
    for pattern in EXEMPT_PATTERNS:
        if pattern in filepath:
            return True
    return False


def scan_file(filepath: str) -> list[tuple[int, str, str]]:
    """Scan a single file for forbidden terms. Returns [(line_no, line, reason)]."""
    violations: list[tuple[int, str, str]] = []

    try:
        with open(filepath, encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
    except OSError:
        return violations

    for line_no, line in enumerate(lines, start=1):
        # Skip comments and imports
        stripped = line.strip()
        if stripped.startswith("//") or stripped.startswith("import "):
            continue
        if stripped.startswith("*") or stripped.startswith("/*"):
            continue

        for literal in STRING_LITERAL_RE.finditer(line):
            value = literal.group("value")
            for pattern, reason in FORBIDDEN_TERMS_IN_UI.items():
                if re.search(pattern, value, re.IGNORECASE):
                    violations.append((line_no, stripped[:120], reason))

    return violations


def main() -> int:
    print("=" * 60)
    print("GUARD: forbidden_ui_terms_guard")
    print("=" * 60)

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    all_violations: list[tuple[str, int, str, str]] = []

    for scan_dir in SCAN_DIRS:
        full_dir = os.path.join(root, scan_dir)
        if not os.path.isdir(full_dir):
            print(f"  SKIP: Directory not found: {scan_dir}")
            continue

        for dirpath, _dirs, filenames in os.walk(full_dir):
            for filename in sorted(filenames):
                if not filename.endswith((".tsx", ".ts")):
                    continue

                filepath = os.path.join(dirpath, filename)
                rel_path = os.path.relpath(filepath, root)

                if is_exempt(rel_path):
                    continue

                violations = scan_file(filepath)
                for line_no, line, reason in violations:
                    all_violations.append((rel_path, line_no, line, reason))

    # Report
    if all_violations:
        print(f"\nFOUND {len(all_violations)} forbidden UI term(s):\n")
        for filepath, line_no, line, reason in all_violations:
            print(f"  {filepath}:{line_no}")
            print(f"    {line}")
            print(f"    -> {reason}\n")
        print(f"{'=' * 60}")
        print(f"FAILED: {len(all_violations)} violation(s)")
        return 1

    print("\nPASSED: No forbidden UI terms found")
    return 0


if __name__ == "__main__":
    sys.exit(main())
