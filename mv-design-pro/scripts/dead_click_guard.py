#!/usr/bin/env python3
"""CI Guard: no dead clicks in SLD context-menu actions.

K5-A: the active UI has exactly ONE menu path — SLD_MENU_REGISTRY
(frontend/src/ui/sld/v2/command/SldCommandService.ts) rendered by
SldContextMenuController.tsx and executed by the shared action executor
(frontend/src/ui/sld/shared/sldActionExecutor.ts, useSldActionExecutor wired
into SldCanvasV3Workspace). The legacy engineering path (actionMenuBuilders.ts
+ EngineeringContextMenu.tsx + actionRouting.ts) was deleted as dead code.

The dead-click rule enforced here: every action id rendered from
SLD_MENU_REGISTRY MUST have a handler branch in the executor — an entry in
opByAction (domain-operation form), ACTION_TO_SCREEN (navigation),
ACTION_ROADMAP_HINT_PL (honest roadmap toast), DELETE_ACTION_OBJECT_LABEL_PL
(delete with confirmation), or one of the dedicated special branches. A
registry entry without coverage is a dead click and fails the build.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_SRC = (REPO_ROOT / "frontend" / "src").resolve()
CONTEXT_MENU_DIR = FRONTEND_SRC / "ui" / "context-menu"
SLD_V2_DIR = FRONTEND_SRC / "ui" / "sld" / "v2"


def read(path: Path) -> str:
    if not path.exists():
        raise FileNotFoundError(path)
    return path.read_text(encoding="utf-8")


def extract_string_set(content: str, export_name: str) -> set[str]:
    start = content.find(export_name)
    if start < 0:
        return set()
    end = content.find("};", start)
    if end < 0:
        end = content.find("]);", start)
    if end < 0:
        end = min(len(content), start + 6000)
    section = content[start:end]
    return set(re.findall(r"""['"]([a-z][a-z0-9_-]+)['"]""", section))


def require_tokens(path: Path, tokens: list[str]) -> list[str]:
    content = read(path)
    return [token for token in tokens if token not in content]


def extract_sld_registry_ids() -> set[str]:
    content = read(SLD_V2_DIR / "command" / "SldCommandService.ts")
    registry_start = content.find("SLD_MENU_REGISTRY")
    registry_end = content.find("};", registry_start)
    if registry_start < 0 or registry_end < 0:
        raise RuntimeError("SLD_MENU_REGISTRY not found")
    registry = content[registry_start:registry_end]
    return set(re.findall(r"""\bid:\s*['"]([a-z][a-z0-9_-]+)['"]""", registry))


def check_sld_menu_path() -> list[str]:
    errors: list[str] = []
    registry_ids = extract_sld_registry_ids()

    controller_path = CONTEXT_MENU_DIR / "SldContextMenuController.tsx"
    missing = require_tokens(
        controller_path,
        [
            "SLD_MENU_REGISTRY",
            "getMenuActions",
            "handler: bind(action)",
            "onAction(action.id, request.kind, request.elementId)",
            "blockedReason: action.disabledReasonPl",
        ],
    )
    if missing:
        errors.append(f"SldContextMenuController missing token(s): {', '.join(missing)}")

    # F12-A (ARCH-3, spec SLD_CAD_SPEC_V3 par. 10.1): wykonawca akcji i jego
    # tabele routingu (ACTION_TO_SCREEN / opByAction / ROADMAP / DELETE-labels)
    # zyja we WSPOLDZIELONYM ui/sld/shared/sldActionExecutor.ts (jedna prawda).
    executor_content = read(FRONTEND_SRC / "ui" / "sld" / "shared" / "sldActionExecutor.ts")
    for token in [
        "buildSldOperationContext",
        "ACTION_TO_SCREEN",
        "ACTION_ROADMAP_HINT_PL",
        "openOperationForm",
        "openRouteSurface",
    ]:
        if token not in executor_content:
            errors.append(f"sldActionExecutor missing token: {token}")

    # F12-C: kontener v2 USUNIETY (spec par. 10.1 ARCH-4) — jedyny workspace
    # to SldCanvasV3Workspace; wymog spiecia z wykonawca zostaje.
    for workspace_rel, workspace_path in [
        (
            "SldCanvasV3Workspace (v3)",
            FRONTEND_SRC / "ui" / "sld" / "v3" / "canvas" / "SldCanvasV3Workspace.tsx",
        ),
    ]:
        if "useSldActionExecutor" not in read(workspace_path):
            errors.append(
                f"{workspace_rel} nie jest spiety z wykonawca akcji (useSldActionExecutor)"
            )

    op_ids = extract_string_set(executor_content, "const opByAction")
    screen_ids = extract_string_set(executor_content, "const ACTION_TO_SCREEN")
    hint_ids = extract_string_set(executor_content, "const ACTION_ROADMAP_HINT_PL")
    delete_ids = extract_string_set(executor_content, "const DELETE_ACTION_OBJECT_LABEL_PL")
    # Dedykowane galezie wykonawcy poza tabelami routingu:
    #  - 'add-source': skrot do E-13 karty DER (Faza G),
    #  - 'show-ncrfg': deep-link do macierzy wymogow NC RfG ui2 (zakladka
    #    'ncrfg' warsztatu Wynikow, karta P-1 — luka F-E7 zamknieta).
    #  - 'show-results': deep-link do zakladki 'rozplyw' warsztatu Wynikow ui2
    #    (karta D-2, decyzja wlasciciela — koniec celowania w legacy E-24).
    special_ids = {"add-source", "show-ncrfg", "show-results"}
    covered = op_ids | screen_ids | hint_ids | delete_ids | special_ids

    # SLD actions that are rendered but have neither navigation, operation,
    # hint, nor special branch in the executor are actual dead clicks.
    uncovered = sorted(registry_ids - covered)
    if uncovered:
        errors.append(
            "SLD_MENU_REGISTRY action(s) without route/operation/hint: " + ", ".join(uncovered[:60])
        )

    print(f"  SLD registry action ids: {len(registry_ids)}")
    print(f"  SLD route-covered ids: {len(covered & registry_ids)}")
    return errors


def check_modal_registry() -> list[str]:
    ids: set[str] = set()
    candidates = [
        FRONTEND_SRC / "ui" / "topology" / "modals" / "index.ts",
        FRONTEND_SRC / "ui" / "topology" / "modals" / "modalRegistry.ts",
        FRONTEND_SRC / "ui" / "network-build" / "modals" / "modalRegistry.ts",
    ]
    legacy_pattern = re.compile(r"MODAL_[A-Z_]+")
    component_pattern = re.compile(r"export\s+\{\s*([A-Z][A-Za-z0-9]*Modal)\s*\}")
    for registry_file in candidates:
        if not registry_file.exists():
            continue
        content = read(registry_file)
        ids.update(match.group() for match in legacy_pattern.finditer(content))
        ids.update(match.group(1) for match in component_pattern.finditer(content))

    print(f"  Registered modal ids/components: {len(ids)}")
    if len(ids) < 10:
        return [f"Modal registry has only {len(ids)} entries/components; expected at least 10"]
    return []


def main() -> int:
    print("=" * 70)
    print("  Dead Click Guard")
    print("  Checking the single active SLD menu routing path...")
    print("=" * 70)

    errors: list[str] = []
    try:
        errors.extend(check_sld_menu_path())
        errors.extend(check_modal_registry())
    except Exception as exc:  # noqa: BLE001 - guard must fail loudly.
        errors.append(f"Guard execution failed: {exc}")

    if errors:
        print("\n  FAIL:")
        for error in errors:
            print(f"    - {error}")
        print("=" * 70)
        return 1

    print("\n  PASS: all rendered context-menu actions have an active handler path.")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
