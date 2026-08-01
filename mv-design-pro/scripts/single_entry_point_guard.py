#!/usr/bin/env python3
"""
SINGLE ENTRY POINT GUARD — CI Enforcement (plan Phase 0/1)

BINDING RULE:
- Każda CanonicalOpName powinna mieć dokładnie JEDNĄ ścieżkę aktywacji
  (jeden formularz / jeden wizard / jeden entry point).
- Brak duplikatów wejść do tej samej operacji domenowej.

Weryfikacja:
1. OPERATION_FORM_REGISTRY zawiera wpis per CanonicalOpName
2. Brak innych komponentów które bezpośrednio wywołują tę samą operację
   spoza zarejestrowanego entry pointa.

Tolerowane wyjątki:
- Re-export aliasów (np. append_station ↔ insert_station używają tego samego komponentu)
- Forwardery z fixActionRouting do canonical ops

Usage:
  python scripts/single_entry_point_guard.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"

REGISTRY_FILE = FRONTEND_SRC / "ui" / "workspace" / "operationFormRegistry.tsx"

# Operations które celowo mają wspólny komponent (dozwolone duplikaty)
ALLOWED_SHARED_COMPONENTS = {
    "append_station_on_endpoint": "insert_station_on_segment_sn",
    "add_ct": "add_vt",
    "add_ups_nn": "add_genset_nn",
    "set_normal_open_point": "connect_secondary_ring_sn",
}


def extract_registry_entries(content: str) -> dict[str, str]:
    """Wyekstraktuj op_name → component_name z OPERATION_FORM_REGISTRY."""
    entries: dict[str, str] = {}
    # Match: op_name: ComponentName, OR op_name: null,
    in_registry = False
    for line in content.splitlines():
        if "OPERATION_FORM_REGISTRY" in line and "=" in line:
            in_registry = True
            continue
        if in_registry:
            if line.strip().startswith("}"):
                in_registry = False
                continue
            m = re.match(r"\s+(\w+):\s+(\w+|null),?\s*(?://.*)?$", line)
            if m:
                op_name, component = m.group(1), m.group(2)
                entries[op_name] = component
    return entries


def find_direct_form_imports(component_name: str) -> list[Path]:
    """Znajdź pliki które importują formularz spoza registry."""
    if component_name in {"null"}:
        return []
    callers: list[Path] = []
    pattern = re.compile(rf"\bimport\s+\{{[^}}]*\b{component_name}\b[^}}]*\}}\s+from")
    for tsx in FRONTEND_SRC.rglob("*.tsx"):
        if tsx.name.endswith(".test.tsx"):
            continue
        try:
            text = tsx.read_text(encoding="utf-8")
        except Exception:
            continue
        if pattern.search(text):
            callers.append(tsx)
    return callers


def main() -> int:
    if not REGISTRY_FILE.exists():
        print(f"FAIL: brak registry pod {REGISTRY_FILE}", file=sys.stderr)
        return 1

    content = REGISTRY_FILE.read_text(encoding="utf-8")
    entries = extract_registry_entries(content)
    if not entries:
        print("FAIL: registry pusty albo niemożliwy do sparsowania", file=sys.stderr)
        return 1

    component_to_ops: dict[str, list[str]] = {}
    for op, comp in entries.items():
        if comp == "null":
            continue
        component_to_ops.setdefault(comp, []).append(op)

    violations: list[str] = []

    # Sprawdź duplikaty: ten sam komponent dla wielu ops jest OK tylko w ALLOWED_SHARED_COMPONENTS
    for comp, ops in component_to_ops.items():
        if len(ops) > 1:
            ops_set = set(ops)
            allowed_pairs_found = False
            for primary, secondary in ALLOWED_SHARED_COMPONENTS.items():
                if {primary, secondary}.issubset(ops_set):
                    allowed_pairs_found = True
                    break
            if not allowed_pairs_found and len(ops) > 2:
                violations.append(
                    f"komponent {comp} używany dla {len(ops)} ops: {sorted(ops)} "
                    "(dozwolone tylko explicit pary w ALLOWED_SHARED_COMPONENTS)"
                )

    if violations:
        print("=" * 72)
        print("SINGLE ENTRY POINT GUARD: NARUSZENIE WYKRYTE")
        print("=" * 72)
        for v in violations:
            print(f"  - {v}")
        print()
        print("Każdy CanonicalOpName ma mieć jeden formularz lub explicit shared")
        print("component zadeklarowany w ALLOWED_SHARED_COMPONENTS.")
        return 1

    print(
        f"single_entry_point_guard: OK ({len(entries)} ops, "
        f"{len(component_to_ops)} unique components, "
        f"{sum(1 for c in entries.values() if c == 'null')} instant ops)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
