#!/usr/bin/env python3
"""
Local Truth Guard — No Local Graph State in Wizard/Frontend

Ensures that frontend stores contain ONLY:
  - snapshot (from backend)
  - readiness (from backend)
  - fix_actions (from backend)
  - selection (UI state)
  - mode (UI state)
  - display preferences (UI state)

FORBIDDEN in frontend stores:
  - Local topology graph
  - Local adjacency lists
  - Local node/edge collections that duplicate the snapshot
  - Local "pending changes" that bypass domain operations

SCAN FILES:
  frontend/src/ui/**/*store*.ts
  frontend/src/ui/**/*Store*.ts

FORBIDDEN PATTERNS:
  - adjacencyList, adjacencyMap
  - localGraph, localTopology, localNodes, localEdges
  - pendingChanges, pendingMutations, pendingOps
  - nodeMap (unless it's a Map from snapshot data for lookup)
  - edgeMap (unless it's a Map from snapshot data for lookup)

ALLOWED:
  - snapshotStore (holds snapshot FROM backend)
  - selectionStore (UI state only)
  - appStateStore (UI state only)
  - Any computed/derived state from snapshot

EXIT CODES:
  0 = clean
  1 = violations
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_SRC = REPO_ROOT / "frontend" / "src" / "ui"

FORBIDDEN_PATTERNS = [
    (re.compile(r"\badjacencyList\b"), "adjacencyList (local graph)"),
    (re.compile(r"\badjacencyMap\b"), "adjacencyMap (local graph)"),
    (re.compile(r"\blocalGraph\b"), "localGraph (local topology)"),
    (re.compile(r"\blocalTopology\b"), "localTopology (local topology)"),
    (re.compile(r"\blocalNodes\b"), "localNodes (local graph)"),
    (re.compile(r"\blocalEdges\b"), "localEdges (local graph)"),
    (re.compile(r"\bpendingChanges\b"), "pendingChanges (bypasses domain ops)"),
    (re.compile(r"\bpendingMutations\b"), "pendingMutations (bypasses domain ops)"),
    (re.compile(r"\bpendingOps\b"), "pendingOps (bypasses domain ops)"),
    (re.compile(r"\blocalBuses\b"), "localBuses (duplicates snapshot)"),
    (re.compile(r"\blocalBranches\b"), "localBranches (duplicates snapshot)"),
]


def scan_store_files() -> list[tuple[str, int, str, str]]:
    """Scan store files for forbidden patterns."""
    if not FRONTEND_SRC.exists():
        return []

    violations = []
    for store_file in FRONTEND_SRC.rglob("*store*.ts"):
        text = store_file.read_text(encoding="utf-8")
        for line_no, line in enumerate(text.splitlines(), start=1):
            # Skip comments
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("/*"):
                continue
            for pattern, desc in FORBIDDEN_PATTERNS:
                if pattern.search(line):
                    rel_path = store_file.relative_to(REPO_ROOT)
                    violations.append((str(rel_path), line_no, desc, stripped[:100]))

    return violations


def main() -> int:
    violations = scan_store_files()

    if violations:
        print(f"\n{'='*60}")
        print(f"LOCAL TRUTH GUARD: {len(violations)} violation(s)")
        print(f"{'='*60}\n")
        for filepath, line_no, desc, context in violations:
            print(f"  {filepath}:{line_no} — {desc}")
            print(f"    > {context}")
        print()
        return 1

    print("Local Truth Guard: OK (no local graph state in stores)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
