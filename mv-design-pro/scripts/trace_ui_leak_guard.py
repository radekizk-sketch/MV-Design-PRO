#!/usr/bin/env python3
"""
Trace v2 UI Leak Guard — PR-39 (RUN #2B).

Ensures TraceArtifactV2 / TraceEquationStep / TraceDiffResult types
are only imported in allowed frontend modules:
  - ui/proof/trace-v2/
  - ui/proof/compare/
  - ui/proof/TraceViewer.tsx

Exit codes:
  0 = clean
  1 = violation found
"""

import os
import re
import sys

# Trace v2 type patterns that must be isolated
TRACE_V2_PATTERNS = [
    re.compile(r"\bTraceArtifactV2\b"),
    re.compile(r"\bTraceEquationStepV2\b"),
    re.compile(r"\bTraceDiffResultV2\b"),
    re.compile(r"\bTraceValueV2\b"),
    re.compile(r"\bTraceStepDiffV2\b"),
    re.compile(r"\bAnalysisTypeV2\b"),
]

# Allowed paths (relative to frontend/src/)
ALLOWED_PATHS = [
    "ui/proof/trace-v2/",
    "ui/proof/compare/",
    "ui/proof/TraceViewer.tsx",
]

# File extensions to check
EXTENSIONS = (".ts", ".tsx")

# Skip patterns
SKIP_PATTERNS = [
    "__tests__",
    ".test.",
    ".spec.",
]


def main() -> int:
    frontend_src = os.path.join("mv-design-pro", "frontend", "src")
    if not os.path.isdir(frontend_src):
        frontend_src = os.path.join("frontend", "src")
    if not os.path.isdir(frontend_src):
        print("WARNING: frontend/src directory not found, skipping guard")
        return 0

    violations: list[str] = []

    for root, _dirs, files in os.walk(frontend_src):
        for fname in files:
            if not fname.endswith(EXTENSIONS):
                continue

            filepath = os.path.join(root, fname)
            rel_path = os.path.relpath(filepath, frontend_src)

            # Check if in allowed path
            in_allowed = any(
                rel_path.startswith(p) or rel_path.replace("\\", "/").startswith(p)
                for p in ALLOWED_PATHS
            )
            if in_allowed:
                continue

            # Check if in skip patterns
            if any(skip in filepath for skip in SKIP_PATTERNS):
                continue

            try:
                with open(filepath, encoding="utf-8") as f:
                    content = f.read()
            except (OSError, UnicodeDecodeError):
                continue

            for line_num, line in enumerate(content.splitlines(), 1):
                # Skip comments
                stripped = line.strip()
                if (
                    stripped.startswith("//")
                    or stripped.startswith("/*")
                    or stripped.startswith("*")
                ):
                    continue

                for pattern in TRACE_V2_PATTERNS:
                    match = pattern.search(line)
                    if match:
                        violations.append(
                            f"  {rel_path}:{line_num}\n"
                            f"    Import: {match.group()}\n"
                            f"    Linia: {stripped[:120]}"
                        )

    if violations:
        print("TRACE UI LEAK GUARD: NARUSZENIE WYKRYTE")
        print(f"Znaleziono {len(violations)} naruszeń:")
        print()
        for v in violations:
            print(v)
        print()
        print("Typy Trace v2 mogą być importowane TYLKO w:")
        for p in ALLOWED_PATHS:
            print(f"  - {p}")
        return 1

    print("Trace UI Leak Guard: OK (brak naruszeń)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
