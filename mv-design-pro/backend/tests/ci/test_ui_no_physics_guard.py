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


def test_guard_is_green_on_repo_ui2():
    """ui2/** is a clean-room layer and must contain no network physics."""
    assert ui_no_physics_guard.scan_tree(ui_no_physics_guard.SCAN_DIRS) == []


def test_guard_main_returns_zero_on_repo():
    assert ui_no_physics_guard.main() == 0


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
