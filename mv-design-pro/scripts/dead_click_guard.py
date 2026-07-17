#!/usr/bin/env python3
"""CI Guard: no dead clicks in SLD/context-menu actions.

The active UI has two menu paths:
1. Engineering context menus built by actionMenuBuilders.ts and rendered through
   EngineeringContextMenu.tsx. These actions are bound through a typed proxy and
   sanitized before render.
2. SLD V2 context menus from SLD_MENU_REGISTRY, rendered by
   SldContextMenuController.tsx and routed in SldWorkspaceContainer.tsx.

This guard checks the architecture that is actually active instead of treating
every string literal in the builders as an unmapped action.
"""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_SRC = (REPO_ROOT / "frontend" / "src").resolve()
CONTEXT_MENU_DIR = FRONTEND_SRC / "ui" / "context-menu"
SLD_V2_DIR = FRONTEND_SRC / "ui" / "sld" / "v2"


@dataclass(frozen=True)
class ActionCall:
    action_id: str
    has_handler: bool
    has_submenu: bool
    source: str


def read(path: Path) -> str:
    if not path.exists():
        raise FileNotFoundError(path)
    return path.read_text(encoding="utf-8")


def matching_call_blocks(content: str, callee: str) -> list[str]:
    """Return full blocks for calls named callee(...), with string/comment safety."""
    blocks: list[str] = []
    token = f"{callee}("
    pos = 0
    while True:
        start = content.find(token, pos)
        if start < 0:
            break
        if start > 0 and (content[start - 1].isalnum() or content[start - 1] in "_$"):
            pos = start + len(token)
            continue

        depth = 0
        quote: str | None = None
        escaped = False
        line_comment = False
        block_comment = False
        end = None

        for index in range(start, len(content)):
            char = content[index]
            nxt = content[index + 1] if index + 1 < len(content) else ""

            if line_comment:
                if char == "\n":
                    line_comment = False
                continue
            if block_comment:
                if char == "*" and nxt == "/":
                    block_comment = False
                continue
            if quote:
                if escaped:
                    escaped = False
                    continue
                if char == "\\":
                    escaped = True
                    continue
                if char == quote:
                    quote = None
                continue
            if char == "/" and nxt == "/":
                line_comment = True
                continue
            if char == "/" and nxt == "*":
                block_comment = True
                continue
            if char in ("'", '"', "`"):
                quote = char
                continue
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0:
                    end = index + 1
                    break

        if end is None:
            raise RuntimeError(f"Unclosed {callee}(...) call near offset {start}")
        blocks.append(content[start:end])
        pos = end
    return blocks


def extract_builder_action_calls() -> list[ActionCall]:
    builders_file = CONTEXT_MENU_DIR / "actionMenuBuilders.ts"
    content = read(builders_file)
    calls: list[ActionCall] = []
    first_arg = re.compile(r"""^action\(\s*(['"])(?P<id>[a-z][a-z0-9_]*)(?:\1)""", re.S)
    for block in matching_call_blocks(content, "action"):
        match = first_arg.search(block)
        if not match:
            continue
        calls.append(
            ActionCall(
                action_id=match.group("id"),
                has_handler=bool(re.search(r"\bhandler\s*:", block)),
                has_submenu=bool(re.search(r"\bsubmenu\s*:", block)),
                source="actionMenuBuilders.ts",
            )
        )
    return calls


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


def check_engineering_menu_path() -> list[str]:
    errors: list[str] = []
    calls = extract_builder_action_calls()
    no_handler = [
        call.action_id
        for call in calls
        if not call.has_handler and not call.has_submenu
    ]
    if no_handler:
        errors.append(
            "Engineering action(s) without handler or submenu: "
            + ", ".join(sorted(set(no_handler))[:40])
        )

    menu_path = CONTEXT_MENU_DIR / "EngineeringContextMenu.tsx"
    missing = require_tokens(
        menu_path,
        [
            "handlerNameToActionId",
            "new Proxy<Record<string, () => void>>",
            "makeHandler",
            "sanitizeEngineeringActions",
            "if (!hasHandler && !hasSubmenu)",
            "checkCatalogGate",
        ],
    )
    if missing:
        errors.append(
            f"EngineeringContextMenu missing active routing token(s): {', '.join(missing)}"
        )

    routing_content = read(CONTEXT_MENU_DIR / "actionRouting.ts")
    missing = [
        token
        for token in [
            "CONTEXT_ACTION_TO_OPERATION",
            "NAVIGATION_ACTIONS",
            "TOGGLE_ACTIONS",
            "add_sn_bay",
            "add_converter_source",
            "insert_station_on_segment_sn",
            "continue_trunk_segment_sn",
            "start_branch_segment_sn",
            "set_normal_open_point",
        ]
        if token not in routing_content
    ]
    if missing:
        errors.append(f"actionRouting missing required route token(s): {', '.join(missing)}")

    print(f"  Engineering menu action calls: {len(calls)}")
    print(f"  Engineering menu ids: {len({call.action_id for call in calls})}")
    return errors


def extract_sld_registry_ids() -> set[str]:
    content = read(SLD_V2_DIR / "command" / "SldCommandService.ts")
    registry_start = content.find("SLD_MENU_REGISTRY")
    registry_end = content.find("};", registry_start)
    if registry_start < 0 or registry_end < 0:
        raise RuntimeError("SLD_MENU_REGISTRY not found")
    registry = content[registry_start:registry_end]
    return set(re.findall(r"""\bid:\s*['"]([a-z][a-z0-9_-]+)['"]""", registry))


def check_sld_v2_menu_path() -> list[str]:
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
    # zostaly wyciagniete z SldWorkspaceContainer.tsx do WSPOLDZIELONEGO
    # ui/sld/shared/sldActionExecutor.ts (jedna prawda dla v2 i v3). Guard
    # czyta tabele Z NOWEGO zrodla i dodatkowo wymaga, by OBA workspace'y
    # (v2 kontener + v3 SldCanvasV3Workspace) byly SPIETE z wykonawca
    # (useSldActionExecutor) — wzmocnienie: przed F12-A guard pilnowal
    # wylacznie v2.
    executor_content = read(
        FRONTEND_SRC / "ui" / "sld" / "shared" / "sldActionExecutor.ts"
    )
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
    special_ids = {"add-source"}
    covered = op_ids | screen_ids | hint_ids | delete_ids | special_ids

    # SLD actions that are rendered but have neither navigation, operation, hint,
    # nor special branch in handleAction are actual dead clicks.
    uncovered = sorted(registry_ids - covered)
    if uncovered:
        errors.append(
            "SLD_MENU_REGISTRY action(s) without route/operation/hint: "
            + ", ".join(uncovered[:60])
        )

    print(f"  SLD V2 registry action ids: {len(registry_ids)}")
    print(f"  SLD V2 route-covered ids: {len(covered & registry_ids)}")
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
    print("  Checking active SLD and engineering menu routing...")
    print("=" * 70)

    errors: list[str] = []
    try:
        errors.extend(check_engineering_menu_path())
        errors.extend(check_sld_v2_menu_path())
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
