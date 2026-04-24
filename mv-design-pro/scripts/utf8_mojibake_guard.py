#!/usr/bin/env python3
"""
Guard: utf8_mojibake_guard.py

Scans active source and docs for common mojibake fragments that usually appear
when UTF-8 Polish text is decoded with the wrong code page.
"""

from __future__ import annotations

import sys
import re
from pathlib import Path

from active_public_layer import collect_active_backend_api_files, collect_active_frontend_files

SUSPICIOUS_FRAGMENTS: dict[str, str] = {
    "\u00c4\u2026": "\u0105 zapisane jako mojibake",
    "\u00c4\u2122": "\u0119 zapisane jako mojibake",
    "\u00c4\u2021": "\u0107 zapisane jako mojibake",
    "\u00c4\u017a": "\u017a zapisane jako mojibake",
    "\u00c4\u203a": "\u015b zapisane jako mojibake",
    "\u00c5\u201a": "\u0142 zapisane jako mojibake",
    "\u00c5\u201e": "\u0144 zapisane jako mojibake",
    "\u00c5\u203a": "\u015b zapisane jako mojibake",
    "\u00c5\u00bc": "\u017c zapisane jako mojibake",
    "\u00c5\u00ba": "\u017a zapisane jako mojibake",
    "\u00c3\u00b3": "\u00f3 zapisane jako mojibake",
    "\u00e2\u20ac\u2122": "apostrof zapisany jako mojibake",
    "\u00e2\u20ac\u201c": "pauza zapisana jako mojibake",
    "\u00e2\u20ac\u201d": "myslnik zapisany jako mojibake",
    "\u00e2\u20ac\u02d8": "punktor zapisany jako mojibake",
    "\ufffd": "znak zastepczy Unicode",
}

EXEMPT_PATTERNS = ["__tests__", ".test.", ".spec.", "node_modules", "dist", "build"]
QUOTED_FRAGMENT_PATTERN = re.compile(
    r"""
    (?P<quote>['"`])
    (?P<content>.*?)
    (?P=quote)
    """,
    re.VERBOSE,
)
JSX_TEXT_PATTERN = re.compile(r">(?P<content>[^<>{}][^<>{}]*)<")


def is_exempt(path: Path) -> bool:
    normalized = str(path).replace("\\", "/")
    return any(pattern in normalized for pattern in EXEMPT_PATTERNS)


def should_scan(path: Path) -> bool:
    return path.suffix.lower() in {".ts", ".tsx", ".js", ".jsx", ".py", ".md", ".json", ".css"}


def iter_active_files() -> list[Path]:
    files = {
        *collect_active_frontend_files(),
        *collect_active_backend_api_files(),
    }
    return sorted(path for path in files if should_scan(path) and not is_exempt(path))


def extract_fragments(line: str) -> list[str]:
    fragments = [match.group("content") for match in QUOTED_FRAGMENT_PATTERN.finditer(line)]
    fragments.extend(
        match.group("content")
        for match in JSX_TEXT_PATTERN.finditer(line)
        if match.group("content").strip()
    )
    return [fragment for fragment in fragments if fragment.strip()]


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    root = Path(__file__).resolve().parents[1]
    candidates = iter_active_files()

    violations: list[tuple[str, int, str, str]] = []

    for path in candidates:
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError as error:
            violations.append(
                (
                    str(path.relative_to(root)),
                    error.start + 1,
                    "<decode-error>",
                    "blad dekodowania UTF-8",
                )
            )
            continue
        except OSError:
            continue
        for line_no, line in enumerate(text.splitlines(), start=1):
            if "\ufffd" in line:
                violations.append(
                    (str(path.relative_to(root)), line_no, line.strip(), SUSPICIOUS_FRAGMENTS["\ufffd"])
                )
                continue
            for content in extract_fragments(line):
                for fragment, reason in SUSPICIOUS_FRAGMENTS.items():
                    if fragment == "\ufffd":
                        continue
                    if fragment not in content:
                        continue
                    violations.append((str(path.relative_to(root)), line_no, line.strip(), reason))
                    break

    print("=" * 60)
    print("GUARD: utf8_mojibake_guard")
    print("=" * 60)

    if violations:
        print(f"\nFOUND {len(violations)} suspicious fragment(s):\n")
        for rel_path, line_no, line, reason in violations:
            print(f"  {rel_path}:{line_no}")
            print(f"    {line}")
            print(f"    -> {reason}\n")
        print("=" * 60)
        print(f"FAILED: {len(violations)} violation(s)")
        return 1

    print("\nPASSED: No mojibake fragments found")
    return 0


if __name__ == "__main__":
    sys.exit(main())
