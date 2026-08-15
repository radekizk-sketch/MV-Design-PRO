#!/usr/bin/env python3
"""sld_v1_route_audit.py — Phase 9 pre-flight (operator-grade SLD plan v2).

Cel:
  Sprawdza czy aktywne routes / lazy-imports z `App.tsx` / router /
  screen registry NIE odwołują się do legacy SLD V1.

  Acceptance Invariant 9: V1 cleanup pre-flight.

Skanowane lokalizacje (V1 paths):
  - mv-design-pro/frontend/src/ui/sld/core/**
  - mv-design-pro/frontend/src/ui/sld/inspector/**
  - mv-design-pro/frontend/src/ui/sld/*.tsx (poza index.ts re-exports)
  - mv-design-pro/frontend/src/ui/sld/*.ts (poza index.ts re-exports)

Gdzie szukamy odwołań:
  - mv-design-pro/frontend/src/App.tsx
  - mv-design-pro/frontend/src/main.tsx
  - mv-design-pro/frontend/src/ui/workspace/**
  - mv-design-pro/frontend/src/ui/navigation/**
  - mv-design-pro/frontend/src/ui/main-menu/**
  - Wszelkie *Page.tsx, *Router.tsx (lazy imports / dynamic imports).

Wyjście:
  - exit 0: zero V1 references → Phase 9 cleanup ready.
  - exit 1: V1 references found → V1 nadal w użyciu, NIE usuwać.

Użycie:
  python scripts/sld_v1_route_audit.py
  python scripts/sld_v1_route_audit.py --json
  python scripts/sld_v1_route_audit.py --verbose
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT_DEFAULT = Path(__file__).resolve().parent.parent

# V1 paths (relative to frontend/src) — zawartość katalogów których dotyczy V1.
V1_PATH_PATTERNS = [
    re.compile(r"['\"]\.\./?(\.\./?)+sld/core/"),
    re.compile(r"['\"]\.\./?(\.\./?)+sld/inspector/"),
    # Konkretne nazwy V1 modułów (na podstawie tsconfig excludes)
    re.compile(r"from\s+['\"][^'\"]*sld/SldEngineV12['\"]"),
    re.compile(r"from\s+['\"][^'\"]*sld/SldCadEngineV12['\"]"),
    re.compile(r"from\s+['\"][^'\"]*sld/SldEditorPageV1['\"]"),
    # Lazy import patterns
    re.compile(r"import\(\s*['\"][^'\"]*sld/core/"),
    re.compile(r"import\(\s*['\"][^'\"]*sld/inspector/"),
]

# Frontend roots gdzie szukamy odwołań (NIE testach).
SCAN_ROOTS = [
    Path("frontend/src"),
]

# Wykluczenia: test files i V1 internal references.
EXCLUDE_PATTERNS = [
    re.compile(r"__tests__"),
    re.compile(r"\.test\."),
    re.compile(r"\.spec\."),
    re.compile(r"^frontend/src/ui/sld/core/"),
    re.compile(r"^frontend/src/ui/sld/inspector/"),
]


@dataclass(frozen=True)
class V1Reference:
    file_path: Path
    line_number: int
    line_content: str
    pattern_matched: str


def _is_excluded(rel_path: str) -> bool:
    for pat in EXCLUDE_PATTERNS:
        if pat.search(rel_path):
            return True
    return False


def _scan_file(path: Path, repo_root: Path) -> list[V1Reference]:
    refs: list[V1Reference] = []
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return refs
    rel = str(path.relative_to(repo_root))
    if _is_excluded(rel):
        return refs
    for line_no, line in enumerate(text.splitlines(), start=1):
        # Pomiń komentarze
        stripped = line.lstrip()
        if stripped.startswith("//") or stripped.startswith("*") or stripped.startswith("/*"):
            continue
        for pat in V1_PATH_PATTERNS:
            if pat.search(line):
                refs.append(
                    V1Reference(
                        file_path=path,
                        line_number=line_no,
                        line_content=line.strip()[:200],
                        pattern_matched=pat.pattern,
                    )
                )
                break
    return refs


def _iter_source_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    files: list[Path] = []
    for ext in (".ts", ".tsx"):
        files.extend(root.rglob(f"*{ext}"))
    return sorted(files)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="Output JSON.")
    parser.add_argument("--verbose", action="store_true", help="Pełne lista refs.")
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=REPO_ROOT_DEFAULT,
        help="Korzeń repo (default: mv-design-pro/).",
    )
    args = parser.parse_args()

    repo_root: Path = args.repo_root.resolve()
    references: list[V1Reference] = []
    files_scanned = 0

    for scan_root in SCAN_ROOTS:
        absolute = repo_root / scan_root
        for path in _iter_source_files(absolute):
            files_scanned += 1
            references.extend(_scan_file(path, repo_root))

    # Group by file
    refs_by_file: dict[str, list[V1Reference]] = {}
    for ref in references:
        rel = str(ref.file_path.relative_to(repo_root))
        refs_by_file.setdefault(rel, []).append(ref)

    if args.json:
        payload = {
            "repo_root": str(repo_root),
            "files_scanned": files_scanned,
            "references_found": len(references),
            "files_with_v1_refs": len(refs_by_file),
            "details": {
                rel: [
                    {
                        "line": r.line_number,
                        "content": r.line_content,
                        "pattern": r.pattern_matched,
                    }
                    for r in refs
                ]
                for rel, refs in sorted(refs_by_file.items())
            },
        }
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    else:
        print(
            f"sld_v1_route_audit: skanowano {files_scanned} plików w "
            f"{', '.join(str(s) for s in SCAN_ROOTS)}."
        )
        if not references:
            print("OK — zero V1 references. Phase 9 cleanup ready.")
            return 0
        print(f"\nNARUSZENIA: {len(references)} V1 references w " f"{len(refs_by_file)} plikach:")
        for rel, refs in sorted(refs_by_file.items()):
            print(f"  {rel}: {len(refs)} ref(s)")
            if args.verbose:
                for r in refs[:5]:
                    print(f"    L{r.line_number}: {r.line_content}")
                if len(refs) > 5:
                    print(f"    ... +{len(refs) - 5} więcej")

    return 1 if references else 0


if __name__ == "__main__":
    sys.exit(main())
