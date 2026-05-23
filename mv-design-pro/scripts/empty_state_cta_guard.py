#!/usr/bin/env python3
"""
EMPTY STATE CTA GUARD — CI Enforcement (plan Phase 2 G5)

BINDING RULE:
- Każdy empty state w UI musi mieć aktywne CTA (call-to-action button lub link)
  prowadzące do następnego naturalnego kroku w workflow.
- Empty state to komponent który renderuje:
  - data-testid="empty-state-*"
  - albo "EmptyState" w nazwie komponentu
  - albo komentarz "// empty state"

Wymóg CTA:
- <button onClick={...}>...</button> z labelem prowadzącym do action
- albo <a href="...">...</a>
- Negatywny: tylko tekst bez akcji = FAIL

Usage:
  python scripts/empty_state_cta_guard.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import List, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"

EMPTY_STATE_PATTERNS = [
    re.compile(r"data-testid=[\"']empty-state[-_][\w-]+[\"']"),
    re.compile(r"\bEmptyState\b"),
    re.compile(r"//\s*empty state", re.IGNORECASE),
]

CTA_PATTERNS = [
    re.compile(r"<button[^>]*onClick=", re.IGNORECASE),
    re.compile(r"<a\s+[^>]*href=", re.IGNORECASE),
    re.compile(r"<Link\s+[^>]*to=", re.IGNORECASE),
    re.compile(r"data-testid=[\"'][^\"']*-cta[\"']"),
    re.compile(r"role=[\"']button[\"']"),
]

# Pliki które są tylko definicją Empty State component (bez własnego CTA — to OK,
# konsumenci dostarczają CTA jako prop).
EMPTY_STATE_LIBS = {
    "EmptyInspectorPanel.tsx",
    "EmptyState.tsx",
}

# Skip — files które nie wymagają CTA bo to są test files albo czysto wizualne previews
SKIP_FILENAME_PATTERNS = [
    re.compile(r"\.test\.tsx?$"),
    re.compile(r"\.stories\.tsx?$"),
]


def is_empty_state_file(text: str) -> bool:
    return any(p.search(text) for p in EMPTY_STATE_PATTERNS)


def has_cta(text: str) -> bool:
    return any(p.search(text) for p in CTA_PATTERNS)


def main() -> int:
    violations: List[Tuple[Path, str]] = []

    for tsx in FRONTEND_SRC.rglob("*.tsx"):
        name = tsx.name
        if name in EMPTY_STATE_LIBS:
            continue
        if any(p.search(name) for p in SKIP_FILENAME_PATTERNS):
            continue
        try:
            text = tsx.read_text(encoding="utf-8")
        except Exception:
            continue
        if not is_empty_state_file(text):
            continue
        if not has_cta(text):
            violations.append((tsx.relative_to(REPO_ROOT), "brak CTA przy empty state"))

    if violations:
        print("=" * 72)
        print("EMPTY STATE CTA GUARD: NARUSZENIE WYKRYTE")
        print("=" * 72)
        for path, reason in violations:
            print(f"  {path}: {reason}")
        print()
        print("Każdy empty state musi prowadzić user'a do akcji (button/link).")
        return 1

    print(f"empty_state_cta_guard: OK (scan pod {FRONTEND_SRC})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
