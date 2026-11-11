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
DELETE_ACTION_OBJECT_LABEL_PL (delete with confirmation), or one of the
dedicated special branches. A registry entry without coverage is a dead
click and fails the build.

Karta W2-B (2026-09-09): the fifth coverage category this guard used to
accept — an entry in ACTION_ROADMAP_HINT_PL ("honest roadmap toast") — is
GONE. That table was removed from the executor entirely: every one of its 24
keys turned out to have a real provider already (19 were dead/unreachable
code sitting behind an earlier handler branch, 5 were redirects to a real
screen now wired as navigation) — see the inventory comment above
DELETE_ACTION_OBJECT_LABEL_PL in sldActionExecutor.ts. A roadmap toast was
never real coverage (the model/screen the user asked for never opens); this
guard now requires a REAL provider for every registry action, not just the
'budowa' group the old hint_only check singled out below.

V12K-352 (2026-10-22): the menu entries carry a canon section (Otwórz … Usuń)
instead of a group; the former 'budowa' group is the sections 'Dodaj' and
'Operacje'. The dead legacy registry ui/context-menu/contextMenuRegistry.ts was
deleted; SLD_MENU_REGISTRY is the only menu registry.
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


def _sld_menu_entries() -> list[tuple[str, str]]:
    """All (id, section) menu entries declared in SldCommandService.ts.

    V12K-352: the registry is composed of the per-kind arrays of
    ``export const SLD_MENU_REGISTRY`` AND of the shared helper lists
    (``POZYCJE_*``) spread into them, so slicing the text from the first mention
    of the registry name (a doc comment can mention it first) loses entries — the
    guard measured 3 ids instead of 53 after the canon rework. Every menu entry is
    an object literal carrying both ``id`` and the required ``section`` field
    (``SldMenuAction``), so the whole module is parsed for exactly that shape.
    """
    content = read(SLD_V2_DIR / "command" / "SldCommandService.ts")
    if "export const SLD_MENU_REGISTRY" not in content:
        raise RuntimeError("SLD_MENU_REGISTRY not found")
    pattern = re.compile(
        r"""\{\s*id:\s*['"]([a-z][a-z0-9_-]+)['"][^{}]*?section:\s*['"]([^'"]+)['"]""",
        re.DOTALL,
    )
    entries = pattern.findall(content)
    if not entries:
        raise RuntimeError("SLD_MENU_REGISTRY has no entries with a section")
    return entries


def extract_sld_registry_ids() -> set[str]:
    return {action_id for action_id, _section in _sld_menu_entries()}


def extract_sld_build_action_ids() -> set[str]:
    """Action ids in the model-changing build sections 'Dodaj' and 'Operacje'.

    Karta S9-5: a build action promises a change of the network model. Its only
    honest providers are a canonical domain operation (opByAction) or a real
    screen that performs the change (ACTION_TO_SCREEN / dedicated branch). A
    roadmap toast is NOT a provider - the click leaves the model untouched,
    which is exactly the dead position the SLD audit measured (P-7 / B-4).
    V12K-352: the former group 'budowa' became the canon sections 'Dodaj' and
    'Operacje' (the same split the executor uses to block preview mode).
    """
    return {
        action_id for action_id, section in _sld_menu_entries() if section in ("Dodaj", "Operacje")
    }


def extract_dedicated_branch_ids(content: str) -> set[str]:
    """Action ids handled by a dedicated `actionId === '<id>'` branch.

    Karta S9-5: replaces the hardcoded allowlist that used to enumerate the
    special branches by hand. A hardcoded list is a place where a dead position
    can hide - the guard now reads the executor itself.
    """
    return set(re.findall(r"""actionId\s*===\s*['"]([a-z][a-z0-9_-]+)['"]""", content))


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
        # V12K-352: jeden klasyfikator wykonawcy pozycji menu (testowany na
        # kazdej pozycji rejestru) i blokada podgladu z sekcji pozycji.
        "export function wykonawcaAkcjiMenu",
        "switch (wykonawcaAkcjiMenu(",
        "czyAkcjaZmieniaModel(actionId, kind)",
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
    delete_ids = extract_string_set(executor_content, "const DELETE_ACTION_OBJECT_LABEL_PL")
    # Dedykowane galezie wykonawcy poza tabelami routingu (np. 'add-source',
    # 'show-ncrfg', 'show-results', 'insert-gpz') — czytane Z KODU wykonawcy,
    # nie z recznej listy w guardzie (karta S9-5).
    special_ids = extract_dedicated_branch_ids(executor_content)
    # Karta W2-B: ACTION_ROADMAP_HINT_PL usunieta z wykonawcy w calosci — nie
    # ma juz kategorii "uczciwy toast roadmapy". Kazdy zarejestrowany klik
    # MUSI miec realnego dostawce (operacje domenowa, nawigacje, usuniecie
    # albo dedykowana galaz) — dokladnie to samo kryterium co dawny
    # `real_providers` ponizej, teraz jedyne i wspolne dla WSZYSTKICH grup
    # menu, nie tylko 'budowa'.
    covered = op_ids | screen_ids | delete_ids | special_ids

    # SLD actions that are rendered but have neither navigation, operation,
    # nor a dedicated branch in the executor are actual dead clicks.
    uncovered = sorted(registry_ids - covered)
    if uncovered:
        errors.append(
            "SLD_MENU_REGISTRY action(s) without route/operation/dedicated branch: "
            + ", ".join(uncovered[:60])
        )

    # Karta S9-5 (zawezone przez Karta W2-B do samego pomiaru: `covered` juz
    # wymaga realnego dostawcy dla kazdej pozycji, wiec `hint_only` dla grupy
    # 'budowa' jest teraz zawsze podzbiorem `uncovered` powyzej — zostaje jako
    # pomiar informacyjny/diagnostyczny per grupa, nie jako osobna bramka).
    build_ids = extract_sld_build_action_ids()
    hint_only = sorted(build_ids - covered)
    if hint_only:
        errors.append(
            "SLD_MENU_REGISTRY build action(s) without a real provider "
            "(no domain operation, no screen, no dedicated branch): " + ", ".join(hint_only[:60])
        )

    print(f"  SLD registry action ids: {len(registry_ids)}")
    print(f"  SLD route-covered ids: {len(covered & registry_ids)}")
    print(f"  SLD build action ids: {len(build_ids)} (all with a real provider: {not hint_only})")
    return errors


OPERATION_SURFACE_REGISTRY_FILE = (
    FRONTEND_SRC / "ui" / "topology" / "modals" / "operationSurfaceRegistry.ts"
)
#: Wpis rejestru powierzchni: `entry('operacja_kanoniczna', 'KomponentDostawcy', ...)`.
_WPIS_POWIERZCHNI = re.compile(r"entry\(\s*'(\w+)',\s*'([A-Z][A-Za-z0-9]*)'")
#: Próg sanity (nie dokładny pin) — chroni przed katastroficznym wyczyszczeniem
#: rejestru, nie przed pojedynczą, zweryfikowaną kasacją. Pomiar 2026-10-22: 30 wpisów.
MIN_WPISOW_POWIERZCHNI = 30
#: Deklaracja komponentu eksportowanego z pliku `.tsx` (plik może nieść kilka komponentów,
#: np. `KreatorOdbioruNn.tsx` eksportuje `KreatorOdbioruNn` i `KreatorOdbioruSn`).
_EKSPORT_KOMPONENTU = re.compile(
    r"^export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z][A-Za-z0-9]*)\b", re.MULTILINE
)


def zywe_komponenty(korzen: Path) -> set[str]:
    """Nazwy komponentów z plików `.tsx` poza testami: nazwa pliku i eksportowane deklaracje."""
    nazwy: set[str] = set()
    for plik in sorted(korzen.rglob("*.tsx")):
        if "__tests__" in plik.parts or ".test." in plik.name or ".spec." in plik.name:
            continue
        nazwy.add(plik.stem)
        nazwy.update(_EKSPORT_KOMPONENTU.findall(read(plik)))
    return nazwy


def check_modal_registry() -> list[str]:
    """Rejestr powierzchni operacji: każdy dostawca dialogu jest ŻYWYM komponentem.

    Dawniej liczono eksporty `*Modal` z `ui/topology/modals/index.ts` — modale bez
    żadnego montażu (`TopologyPanel` nie był nigdzie renderowany), więc próg strażnika
    był spełniany przez martwy kod. Modale skasowano (karta PODSTAWA-Q, commit 3);
    jedynym rejestrem operacja → dostawca jest `OPERATION_SURFACE_REGISTRY`, a każdy
    jego komponent musi istnieć w `frontend/src` poza testami — jako plik `.tsx` albo
    eksportowana deklaracja w pliku `.tsx` (inaczej klik akcji naprawczej otwierałby
    powierzchnię bez dostawcy). Scalenie z gałęzią UI/UX (2026-10-28): `KreatorOdbioruSn`
    jest drugim komponentem pliku `KreatorOdbioruNn.tsx` — sama nazwa pliku była za wąska.
    """
    content = read(OPERATION_SURFACE_REGISTRY_FILE)
    wpisy = _WPIS_POWIERZCHNI.findall(content)
    print(f"  Operation surface registry entries: {len(wpisy)}")
    errors: list[str] = []
    if len(wpisy) < MIN_WPISOW_POWIERZCHNI:
        errors.append(
            f"Operation surface registry has only {len(wpisy)} entries; "
            f"expected at least {MIN_WPISOW_POWIERZCHNI}"
        )
    komponenty = zywe_komponenty(FRONTEND_SRC)
    for operacja, komponent in wpisy:
        if komponent not in komponenty:
            errors.append(
                f"Operation surface '{operacja}' points at component '{komponent}' "
                "with no .tsx file or exported declaration in frontend/src (dead provider)"
            )
    return errors


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
