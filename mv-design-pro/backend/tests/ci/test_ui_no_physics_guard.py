from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = PROJECT_ROOT / "scripts"


def _load_script(module_name: str):
    script_path = SCRIPTS_DIR / f"{module_name}.py"
    spec = importlib.util.spec_from_file_location(module_name, script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load script module: {script_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


ui_no_physics_guard = _load_script("ui_no_physics_guard")


def test_guard_is_green_on_repo_ui_and_ui2():
    """ui/** and ui2/** must contain no non-allowlisted network physics.

    H-1 (2026-07-22): scope extended from ui2/** only to ui/**+ui2/** after the
    R1-R3 "relocate UI physics -> backend" epic closed. Remaining raw hits in
    ui/** are covered by the reasoned ALLOWLIST (see module docstring).
    """
    assert ui_no_physics_guard.scan_tree(ui_no_physics_guard.SCAN_DIRS) == []


def test_scan_dirs_covers_ui_and_ui2():
    """H-1 scope extension: default SCAN_DIRS must include both layers."""
    scan_dirs = set(ui_no_physics_guard.SCAN_DIRS)
    repo_root = ui_no_physics_guard.REPO_ROOT
    assert repo_root / "frontend" / "src" / "ui" in scan_dirs
    assert repo_root / "frontend" / "src" / "ui2" in scan_dirs


def test_guard_main_returns_zero_on_repo():
    assert ui_no_physics_guard.main() == 0


def test_ui_allowlist_matches_measured_baseline():
    """Baseline (re-measured 2026-07-28, V12K-267): exactly 5 raw physics-pattern
    hits in frontend/src/ui/** (pre-allowlist, via scan_file which the allowlist
    never touches), all classified 0 class-a (real physics) / 5 class-b (false
    positive) / 0 class-c (catalog-constant exception). If this count changes, a
    new hit appeared and MUST be re-classified explicitly (allowlisted with a
    reason, or fixed as a real physics defect) -- never silently absorbed by a
    broader allowlist entry.

    WHY THE NUMBER DROPPED (22 -> 5, and 18 -> 5 allowlist entries). The previous
    baseline (H-1, 2026-07-22) counted 13 hits in
    station-der/protection-catalogs.ts -- a VT (voltage transformer) catalog held
    in the frontend. Commit dc525539 (V12K-257/258, "koniec rownoleglych
    katalogow VT") moved that catalog to the backend, which is exactly the
    direction this guard exists to push. The hits are gone because the code is
    gone; the baseline is lowered by MEASUREMENT, not by widening tolerance.
    Nobody re-measured after that card, so this test and
    test_ui_allowlist_entries_are_not_stale were both red on the branch -- they
    caught the drift correctly and were simply left unread.
    """
    scan_dir = ui_no_physics_guard.REPO_ROOT / "frontend" / "src" / "ui"
    raw = 0
    for path in sorted(scan_dir.rglob("*")):
        if not path.is_file() or path.suffix not in ui_no_physics_guard.SCAN_EXTENSIONS:
            continue
        if ui_no_physics_guard._should_exclude_file(path):
            continue
        raw += len(ui_no_physics_guard.scan_file(path))
    assert raw == 5


def test_ui_allowlist_entries_are_not_stale():
    """Every ALLOWLIST entry must correspond to an actual current raw hit at
    that exact (path, line) -- a stale entry would mean the underlying code
    moved/changed and the exception is no longer verified against real code.
    """
    for (rel_path, line_no), reason in ui_no_physics_guard.ALLOWLIST.items():
        assert reason, f"allowlist entry {rel_path}:{line_no} must have a reason"
        full_path = ui_no_physics_guard.REPO_ROOT / rel_path
        assert full_path.is_file(), f"allowlisted path does not exist: {rel_path}"
        hit_lines = {ln for ln, _content, _pattern in ui_no_physics_guard.scan_file(full_path)}
        assert (
            line_no in hit_lines
        ), f"allowlist entry {rel_path}:{line_no} is stale (no longer a raw hit)"


def test_allowlist_is_scoped_to_exact_line_not_whole_file(tmp_path: Path, monkeypatch):
    """A new violation on a DIFFERENT line of an allowlisted file must still be
    flagged -- the allowlist must not degrade into a whole-file exemption.
    """
    fake_root = tmp_path
    ui_dir = fake_root / "frontend" / "src" / "ui" / "network-build" / "station-der"
    ui_dir.mkdir(parents=True, exist_ok=True)
    target = ui_dir / "protection-catalogs.ts"
    target.write_text(
        "export const ALLOWED = 15 / Math.sqrt(3); // pretend allowlisted line 1\n"
        "export function newBug(reactanceOhm: number, lengthKm: number) {\n"
        "  return reactanceOhm * lengthKm; // NEW physics, not allowlisted\n"
        "}\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(ui_no_physics_guard, "REPO_ROOT", fake_root)
    monkeypatch.setattr(
        ui_no_physics_guard,
        "ALLOWLIST",
        {
            (
                "frontend/src/ui/network-build/station-der/protection-catalogs.ts",
                1,
            ): "c: test fixture, pretend catalog constant",
        },
    )

    violations = ui_no_physics_guard.scan_tree([ui_dir])
    flagged_lines = {line_no for _path, line_no, _line, _pattern in violations}

    assert 1 not in flagged_lines, "allowlisted line 1 must be filtered out"
    assert 3 in flagged_lines, "new physics on line 3 must still be caught"


def test_guard_detects_synthetic_physics_in_ui_legacy_layer(tmp_path: Path):
    """A sensitivityAnalyzer-class defect landing in the legacy ui/** layer
    (not just ui2/**) must be caught after the H-1 scope extension."""
    physics_file = tmp_path / "frontend" / "src" / "ui" / "oze" / "badAnalyzer.ts"
    physics_file.parent.mkdir(parents=True, exist_ok=True)
    physics_file.write_text(
        "export function estimate(dUdP: number, dUdQ: number, p: number, q: number) {\n"
        "  const deltaU = dUdP * p + dUdQ * q;\n"
        "  const ik3a = (1.1 * uV) / (Math.sqrt(3) * zTotalOhm);\n"
        "  const x = reactanceOhmPerKm * lengthKm;\n"
        "  return { deltaU, ik3a, x };\n"
        "}\n",
        encoding="utf-8",
    )

    violations = ui_no_physics_guard.scan_tree([physics_file.parent])

    assert violations, "guard must flag physics computation in a ui/** module"
    flagged_lines = {line_no for _path, line_no, _line, _pattern in violations}
    assert {2, 3, 4}.issubset(flagged_lines)


def test_guard_detects_synthetic_physics_in_ui2(tmp_path: Path):
    """A sensitivityAnalyzer-class defect (physics in the client) must be caught."""
    physics_file = tmp_path / "frontend" / "src" / "ui2" / "oze" / "badAnalyzer.ts"
    physics_file.parent.mkdir(parents=True, exist_ok=True)
    physics_file.write_text(
        "export function estimate(dUdP: number, dUdQ: number, p: number, q: number) {\n"
        "  const deltaU = dUdP * p + dUdQ * q;\n"
        "  const ik3a = (1.1 * uV) / (Math.sqrt(3) * zTotalOhm);\n"
        "  const x = reactanceOhmPerKm * lengthKm;\n"
        "  return { deltaU, ik3a, x };\n"
        "}\n",
        encoding="utf-8",
    )

    violations = ui_no_physics_guard.scan_tree([physics_file.parent])

    assert violations, "guard must flag physics computation in a ui2 module"
    flagged_lines = {line_no for _path, line_no, _line, _pattern in violations}
    # deltaU/dUdP arithmetic (line 2), √3 short-circuit (line 3), reactance (line 4).
    assert {2, 3, 4}.issubset(flagged_lines)


def test_guard_does_not_flag_current_false_positives(tmp_path: Path):
    """The bare token `current` (aria-current, Tailwind, React setters) is NOT physics."""
    fp_file = tmp_path / "frontend" / "src" / "ui2" / "shell" / "SafeComponent.tsx"
    fp_file.parent.mkdir(parents=True, exist_ok=True)
    fp_file.write_text(
        "export function SafeComponent() {\n"
        "  const [n, setN] = useState(0);\n"
        "  setN((current) => current + 1);\n"
        "  typeaheadBuffer.current += key;\n"
        "  return (\n"
        "    <button\n"
        '      aria-current="page"\n'
        '      className="border-current bg-current text-current"\n'
        '      data-testid="breadcrumb-current-item"\n'
        "    />\n"
        "  );\n"
        "}\n",
        encoding="utf-8",
    )

    assert ui_no_physics_guard.scan_tree([fp_file.parent]) == []


def test_guard_does_not_flag_backend_result_reads(tmp_path: Path):
    """Reading/formatting backend short-circuit results (Sk, Ik) is allowed."""
    read_file = tmp_path / "frontend" / "src" / "ui2" / "wyniki" / "readModel.ts"
    read_file.parent.mkdir(parents=True, exist_ok=True)
    read_file.write_text(
        "export function row(r: { sk_mva: number | null }) {\n"
        "  const skA = r.sk_mva;\n"
        "  const deltaU = r.delta_u_pct;\n"
        "  return { skA, kolDeltaU: deltaU };\n"
        "}\n",
        encoding="utf-8",
    )

    assert ui_no_physics_guard.scan_tree([read_file.parent]) == []
