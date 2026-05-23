#!/usr/bin/env python3
"""
Success Toast Guard (kryt. #2 pętli UX — feedback sukcesu).

Weryfikuje:
1. snapshotStore.ts importuje notify + getOperationSuccessMessage
2. snapshotStore.ts wywołuje notify(..., 'success') w ścieżce sukcesu
3. operationSuccessMessages.ts pokrywa WSZYSTKIE mutujące operacje kanoniczne
   (cross-check vs backend domain/canonical_operations.py)

Operacje run_*/compare_*/calculate_*/validate_* są analityczne (nie mutują modelu)
ale też dostają toast — wymagamy pokrycia wszystkich poza SILENT.

Exit: 0 (PASS) / 1 (FAIL).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
STORE = REPO_ROOT / "frontend/src/ui/topology/snapshotStore.ts"
MESSAGES = REPO_ROOT / "frontend/src/ui/topology/operationSuccessMessages.ts"
CANON = REPO_ROOT / "backend/src/domain/canonical_operations.py"

FAILURES: list[str] = []


def check_store_wiring() -> None:
    if not STORE.exists():
        FAILURES.append(f"snapshotStore.ts missing at {STORE}")
        return
    text = STORE.read_text(encoding="utf-8")
    if "getOperationSuccessMessage" not in text:
        FAILURES.append("snapshotStore.ts nie importuje/nie używa getOperationSuccessMessage")
    if "notify(" not in text:
        FAILURES.append("snapshotStore.ts nie wywołuje notify()")
    # Musi emitować 'success' (centralny toast)
    if "'success'" not in text and '"success"' not in text:
        FAILURES.append("snapshotStore.ts nie emituje notify(..., 'success')")


def _canonical_op_names() -> set[str]:
    if not CANON.exists():
        return set()
    text = CANON.read_text(encoding="utf-8")
    return set(re.findall(r'canonical_name="([a-z0-9_]+)"', text))


def _mapped_op_names() -> tuple[set[str], set[str]]:
    """Returns (mapped_messages, silent_ops)."""
    if not MESSAGES.exists():
        FAILURES.append(f"operationSuccessMessages.ts missing at {MESSAGES}")
        return set(), set()
    text = MESSAGES.read_text(encoding="utf-8")
    # Keys in OPERATION_SUCCESS_MESSAGES record: `op_name: '...'`
    mapped = set(re.findall(r"^\s{2}([a-z0-9_]+):\s*'", text, re.MULTILINE))
    # SILENT_OPERATIONS set entries: `'op_name'`
    silent_block = re.search(r"SILENT_OPERATIONS[^=]*=\s*new Set\(\[(.*?)\]\)", text, re.DOTALL)
    silent = set()
    if silent_block:
        silent = set(re.findall(r"'([a-z0-9_]+)'", silent_block.group(1)))
    return mapped, silent


def check_coverage() -> None:
    canonical = _canonical_op_names()
    if not canonical:
        FAILURES.append("Nie udało się odczytać canonical_operations.py (brak nazw)")
        return
    mapped, silent = _mapped_op_names()
    missing = canonical - mapped - silent
    if missing:
        FAILURES.append(
            f"operationSuccessMessages.ts nie pokrywa {len(missing)} operacji kanonicznych: "
            f"{', '.join(sorted(missing))}"
        )


def main() -> int:
    check_store_wiring()
    check_coverage()
    if not FAILURES:
        canonical = _canonical_op_names()
        mapped, _ = _mapped_op_names()
        print(
            f"success_toast_guard: OK (centralny notify w store, "
            f"{len(canonical)} operacji kanonicznych pokrytych przez {len(mapped)} komunikatów)"
        )
        return 0
    print("success_toast_guard: FAIL")
    for f in FAILURES:
        print(f"  ✗ {f}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
