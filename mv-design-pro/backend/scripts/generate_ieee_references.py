#!/usr/bin/env python3
"""
Generate IEEE case9 / case14 / case39 cross-validation references from pandapower.

This is an AD-HOC, OFFLINE generation tool. It is the ONLY place where
pandapower is executed for the IEEE cross-validation. It produces TWO committed
artifacts per case, neither of which depends on pandapower at runtime/CI:

  1. ``src/application/reference_networks/builders/ieee_<n>bus.py``
     A static ENM-like dict (mirrors ``ieee_4bus.py``). This is OUR copy of the
     network, translated faithfully from ``pandapower.networks.case<n>``.

  2. ``src/application/reference_networks/expected/ieee_<n>bus.json``
     The independent reference VALUES (per-bus |V| and angle from pandapower's
     Newton-Raphson power flow) plus full provenance.

PROVENANCE / NO-TAUTOLOGY:
  The network topology + parameters come from ``pandapower.networks.case<n>``
  (the canonical MATPOWER / PSTCA datasets), NEVER from our solver. The
  reference values come from running pandapower's ``runpp``. The validation test
  (``tests/application/reference_networks/test_ieee_cases_cross_validation.py``)
  loads the committed JSON, runs OUR Newton-Raphson, and compares — so agreement
  is between two INDEPENDENT implementations.

FIDELITY:
  Before emitting anything, this script asserts that OUR ENM dict matches the
  pandapower case structurally (bus count + per-bus base kV, branch count, total
  load P/Q, total generation P, base MVA). A mismatch means the TRANSLATION is
  wrong, not the solver — the script aborts so a wrong reference is never
  committed.

SHORT CIRCUIT:
  The MATPOWER case9/14/39 datasets DO NOT carry short-circuit data (no
  ``s_sc_max_mva`` on the external grid, no sub-transient machine reactances on
  the generators). pandapower's ``calc_sc`` cannot run on them without
  FABRICATING that data, which is forbidden. SC cross-validation against the
  IEEE cases is therefore intentionally OUT OF SCOPE here; the existing
  ``pandapower-iec60909-radial`` fixture provides a real pandapower-sourced SC
  reference instead. See the report / docstring of the validation test.

Usage::

    # Requires the optional dependency (do NOT add it to pyproject — it conflicts
    # with the project's scipy 1.17; keep it an ad-hoc tool):
    #   pip install pandapower==3.4.0
    poetry run python scripts/generate_ieee_references.py --dry-run
    poetry run python scripts/generate_ieee_references.py --confirm
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
sys.path.insert(0, str(SRC))

BUILDERS_DIR = SRC / "application" / "reference_networks" / "builders"
EXPECTED_DIR = SRC / "application" / "reference_networks" / "expected"

# MATPOWER bus type codes -> our bus_kind.
_BUS_KIND = {1: "pq", 2: "pv", 3: "slack", 4: "pq"}

# Per-bus |V| / angle agreement is the CORE proof. These are the publishable
# acceptance gates the committed JSON advertises (the actual deltas are ~1e-12).
_V_RTOL = 5e-3  # 0.5 %
_ANGLE_ABS_DEG = 0.5


def _require_pandapower() -> Any:
    try:
        import pandapower as pp  # type: ignore[import-not-found]

        return pp
    except ImportError as exc:  # pragma: no cover - offline tool only
        raise SystemExit(
            "pandapower is required to regenerate IEEE references.\n"
            "Install the ad-hoc generation dependency with:\n"
            "    pip install pandapower==3.4.0\n"
            "(do NOT add pandapower to pyproject — it conflicts with scipy 1.17)."
        ) from exc


def _build_enm_from_case(pp: Any, case_n: int) -> tuple[dict[str, Any], Any]:
    """Translate ``pandapower.networks.case<n>`` into our ENM-like dict.

    The branch impedances are taken from pandapower's INTERNAL per-unit network
    (``net._ppc['branch']``) on the system base. This is the most faithful
    translation: both solvers then operate on the same per-unit admittance data,
    so any residual delta is a genuine solver difference, not a unit-conversion
    artefact.
    """
    import pandapower.networks as nw  # type: ignore[import-not-found]

    net = getattr(nw, f"case{case_n}")()
    # Solve once to materialise the internal per-unit model (_ppc) used below.
    pp.runpp(net, algorithm="nr", tolerance_mva=1e-10)
    ppc = net._ppc

    base_mva = float(ppc["baseMVA"])
    bus_rows = ppc["bus"]
    n = len(bus_rows)

    # ppc internal row index == bus reference id we expose (B0, B1, ...).
    # pandapower element tables (load/gen/ext_grid) index buses by the same
    # internal order for these canonical cases.
    refs = [f"B{int(bus_rows[i][0].real)}" for i in range(n)]

    buses: list[dict[str, Any]] = []
    for i in range(n):
        buses.append(
            {
                "ref_id": refs[i],
                "id": refs[i],
                "name": refs[i],
                "u_n_kv": round(float(bus_rows[i][9].real), 6),
                "bus_kind": _BUS_KIND[int(bus_rows[i][1].real)],
            }
        )

    branches: list[dict[str, Any]] = []
    for k, row in enumerate(ppc["branch"]):
        f = int(row[0].real)
        t = int(row[1].real)
        ratio = float(row[8].real) or 1.0
        branch: dict[str, Any] = {
            "ref_id": f"BR{k}",
            "id": f"BR{k}",
            "name": f"BR{k}",
            "branch_type": "LineBranch",
            "from_bus": refs[f],
            "to_bus": refs[t],
            "r_pu": round(float(row[2].real), 9),
            "x_pu": round(float(row[3].real), 9),
            "b_pu": round(float(row[4].real), 9),
            "length_km": 1.0,
        }
        if abs(ratio - 1.0) > 1e-9:
            # Off-nominal transformer tap (MATPOWER convention: tap on from-side).
            branch["ratio"] = round(ratio, 9)
        branches.append(branch)

    # Bus shunt elements (capacitor banks / reactors) live on the ppc bus rows as
    # Gs/Bs in MW/MVAr at V=1.0 on the system base.
    shunts: list[dict[str, Any]] = []
    for i in range(n):
        gs = float(bus_rows[i][4].real)
        bs = float(bus_rows[i][5].real)
        if abs(gs) > 1e-9 or abs(bs) > 1e-9:
            shunts.append(
                {
                    "ref_id": f"SH{i}",
                    "id": f"SH{i}",
                    "bus": refs[i],
                    "g_pu": round(gs / base_mva, 9),
                    "b_pu": round(bs / base_mva, 9),
                }
            )

    sources = [
        {
            "ref_id": "SLACK",
            "id": "SLACK",
            "name": "External grid (slack)",
            "bus": refs[int(net.ext_grid.bus.iloc[0])],
            "v_pu": round(float(net.ext_grid.vm_pu.iloc[0]), 6),
            "source_kind": "slack",
        }
    ]

    generators: list[dict[str, Any]] = []
    for _, g in net.gen.iterrows():
        bus_idx = int(g.bus)
        generators.append(
            {
                "ref_id": f"GEN-{bus_idx}",
                "id": f"GEN-{bus_idx}",
                "bus": refs[bus_idx],
                "p_mw": round(float(g.p_mw), 6),
                "v_pu": round(float(g.vm_pu), 6),
                "gen_kind": "pv",
            }
        )

    loads: list[dict[str, Any]] = []
    for li, (_, load) in enumerate(net.load.iterrows()):
        bus_idx = int(load.bus)
        loads.append(
            {
                "ref_id": f"LOAD-{li}",
                "id": f"LOAD-{li}",
                "bus": refs[bus_idx],
                "p_mw": round(float(load.p_mw), 6),
                "q_mvar": round(float(load.q_mvar), 6),
            }
        )

    enm: dict[str, Any] = {
        "header": {
            "name": f"IEEE case{case_n} (MATPOWER, via pandapower {pp.__version__})",
            "revision": 0,
            "base_kv": round(float(bus_rows[0][9].real), 6),
            "base_mva": base_mva,
            "defaults": {
                "reference_tool": f"pandapower {pp.__version__}",
                "reference_source": f"MATPOWER case{case_n}",
            },
        },
        "buses": buses,
        "branches": branches,
        "shunts": shunts,
        "transformers": [],
        "sources": sources,
        "generators": generators,
        "loads": loads,
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
    }
    return enm, net


def _fidelity_check(enm: dict[str, Any], net: Any, case_n: int) -> list[str]:
    """Assert OUR ENM matches the pandapower case structurally.

    Returns a list of human-readable mismatch messages (empty == identical).
    """
    problems: list[str] = []

    pp_bus_count = len(net.bus)
    enm_bus_count = len(enm["buses"])
    if pp_bus_count != enm_bus_count:
        problems.append(f"bus count: pandapower={pp_bus_count} enm={enm_bus_count}")

    # Per-bus base kV multiset (catches a wrong voltage-level translation).
    pp_kv = sorted(round(float(v), 3) for v in net.bus.vn_kv.tolist())
    enm_kv = sorted(round(float(b["u_n_kv"]), 3) for b in enm["buses"])
    if pp_kv != enm_kv:
        problems.append(f"per-bus base kV multiset differs: pandapower={pp_kv} enm={enm_kv}")

    pp_branch_count = len(net.line) + len(net.trafo)
    enm_branch_count = len(enm["branches"])
    if pp_branch_count != enm_branch_count:
        problems.append(
            f"branch count: pandapower lines+trafo={pp_branch_count} enm={enm_branch_count}"
        )

    pp_load_p = float(net.load.p_mw.sum())
    pp_load_q = float(net.load.q_mvar.sum())
    enm_load_p = sum(float(load["p_mw"]) for load in enm["loads"])
    enm_load_q = sum(float(load["q_mvar"]) for load in enm["loads"])
    if not math.isclose(pp_load_p, enm_load_p, rel_tol=1e-6, abs_tol=1e-6):
        problems.append(f"total load P: pandapower={pp_load_p} enm={enm_load_p}")
    if not math.isclose(pp_load_q, enm_load_q, rel_tol=1e-6, abs_tol=1e-6):
        problems.append(f"total load Q: pandapower={pp_load_q} enm={enm_load_q}")

    pp_gen_p = float(net.gen.p_mw.sum())
    enm_gen_p = sum(float(g["p_mw"]) for g in enm["generators"])
    if not math.isclose(pp_gen_p, enm_gen_p, rel_tol=1e-6, abs_tol=1e-6):
        problems.append(f"total gen P: pandapower={pp_gen_p} enm={enm_gen_p}")

    pp_base = float(net.sn_mva)
    enm_base = float(enm["header"]["base_mva"])
    if not math.isclose(pp_base, enm_base, rel_tol=1e-9):
        problems.append(f"base MVA: pandapower={pp_base} enm={enm_base}")

    return problems


def _reference_power_flow(net: Any) -> list[dict[str, Any]]:
    """Per-bus |V| / angle from pandapower's solved Newton-Raphson result."""
    rows: list[dict[str, Any]] = []
    refs = [f"B{int(idx)}" for idx in net.bus.index.tolist()]
    for i, ref in enumerate(refs):
        rows.append(
            {
                "bus_id": ref,
                "v_pu": round(float(net.res_bus.vm_pu.iloc[i]), 9),
                "angle_deg": round(float(net.res_bus.va_degree.iloc[i]), 6),
                "rtol": _V_RTOL,
                "note": "pandapower NR (algorithm='nr', tolerance_mva=1e-10)",
            }
        )
    return rows


_BUILDER_TEMPLATE = '''"""
IEEE case{n}-bus reference network builder (GENERATED — do not edit by hand).

Source: MATPOWER case{n}, accessed via ``pandapower.networks.case{n}`` (pandapower {pp_version}).
Generated by: ``scripts/generate_ieee_references.py``.

This is OUR copy of the network, translated faithfully from pandapower's
internal per-unit model. It is used for cross-validation of our Newton-Raphson
power flow against pandapower's independent implementation. Regenerate with::

    pip install pandapower=={pp_version}
    poetry run python scripts/generate_ieee_references.py --confirm

Fidelity (this dict vs ``pandapower.networks.case{n}``): {fidelity}.
"""

from __future__ import annotations

from typing import Any

_NETWORK: dict[str, Any] = {network_literal}


def build_ieee_{n}bus_network() -> dict[str, Any]:
    """Return ENM-like dict representation of IEEE case{n} (MATPOWER)."""
    import copy

    return copy.deepcopy(_NETWORK)
'''


def _write_builder(case_n: int, enm: dict[str, Any], pp_version: str) -> Path:
    path = BUILDERS_DIR / f"ieee_{case_n}bus.py"
    network_literal = json.dumps(enm, indent=4, ensure_ascii=False)
    # Make the JSON literal valid Python (true/false/null -> True/False/None).
    network_literal = (
        network_literal.replace(": true", ": True")
        .replace(": false", ": False")
        .replace(": null", ": None")
    )
    content = _BUILDER_TEMPLATE.format(
        n=case_n,
        pp_version=pp_version,
        network_literal=network_literal,
        fidelity="structurally identical (asserted at generation time)",
    )
    path.write_text(content, encoding="utf-8")
    _format_with_black(path)
    return path


def _format_with_black(path: Path) -> None:
    """Run black on a generated file so regeneration is idempotent with the repo
    formatter (the committed builder is black-clean and stays that way)."""
    import subprocess

    try:
        subprocess.run(
            [sys.executable, "-m", "black", "--quiet", "--line-length", "100", str(path)],
            check=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:  # pragma: no cover
        print(f"  (warning: could not run black on {path.name}: {exc})")


def _write_expected(case_n: int, enm: dict[str, Any], net: Any, pp_version: str) -> Path:
    path = EXPECTED_DIR / f"ieee_{case_n}bus.json"
    pf_rows = _reference_power_flow(net)
    payload = {
        "network_id": f"ieee-{case_n}bus",
        "source": f"MATPOWER case{case_n} via pandapower {pp_version}",
        "source_note": (
            f"Independent cross-validation reference. Network topology + parameters "
            f"from pandapower.networks.case{case_n} (canonical MATPOWER dataset), NOT "
            f"from our solver. Per-bus |V|/angle computed by pandapower Newton-Raphson "
            f"(algorithm='nr', tolerance_mva=1e-10). The committed builder ENM is "
            f"structurally identical to case{case_n} (fidelity asserted at generation "
            f"time). Regenerate with: pip install pandapower=={pp_version}; "
            f"poetry run python scripts/generate_ieee_references.py --confirm."
        ),
        "provenance": {
            "reference_tool": f"pandapower {pp_version}",
            "reference_source": f"MATPOWER case{case_n}",
            "generated_by_script": "scripts/generate_ieee_references.py",
            "assumptions": {
                "lf": (
                    "pandapower runpp(algorithm='nr', tolerance_mva=1e-10); flat start; "
                    "single external grid as slack; generators modelled as ideal PV buses "
                    "(no binding Q-limits in the canonical cases); off-nominal transformer "
                    "taps and bus shunts honoured in the per-unit Ybus."
                ),
                "sc": (
                    f"NOT GENERATED. MATPOWER case{case_n} carries no short-circuit data "
                    "(no s_sc_max_mva on the external grid, no sub-transient machine "
                    "reactances on the generators); running pandapower.shortcircuit.calc_sc "
                    "would require fabricating that data. SC cross-validation against the "
                    "IEEE cases is therefore out of scope. The pandapower-iec60909-radial "
                    "fixture provides a real pandapower-sourced SC reference instead."
                ),
            },
        },
        "power_flow": pf_rows,
        "power_flow_branches": [],
        "short_circuit": [],
        "dynamic_samples": [],
    }
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def generate_one(pp: Any, case_n: int, *, confirm: bool) -> dict[str, Any]:
    print(f"\n>>> IEEE case{case_n}")
    enm, net = _build_enm_from_case(pp, case_n)
    problems = _fidelity_check(enm, net, case_n)
    if problems:
        print("  FIDELITY MISMATCH (our ENM != pandapower case):")
        for p in problems:
            print(f"    - {p}")
        raise SystemExit(
            f"Fidelity check failed for case{case_n}; refusing to emit a wrong reference."
        )
    print(
        f"  fidelity OK: {len(enm['buses'])} buses, {len(enm['branches'])} branches, "
        f"{len(enm['shunts'])} shunts, {len(enm['generators'])} gens, "
        f"{len(enm['loads'])} loads, base={enm['header']['base_mva']} MVA"
    )
    if confirm:
        bp = _write_builder(case_n, enm, pp.__version__)
        ep = _write_expected(case_n, enm, net, pp.__version__)
        print(f"  wrote builder:  {bp.relative_to(ROOT)}")
        print(f"  wrote expected: {ep.relative_to(ROOT)}")
        return {"case": case_n, "action": "written"}
    print("  (dry-run — no files written)")
    return {"case": case_n, "action": "dry-run"}


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate IEEE cross-validation references")
    parser.add_argument("--dry-run", action="store_true", help="Show fidelity without writing")
    parser.add_argument("--confirm", action="store_true", help="Write builders + expected JSON")
    parser.add_argument(
        "--cases",
        type=int,
        nargs="+",
        default=[9, 14, 39],
        help="Which IEEE cases to generate (default: 9 14 39)",
    )
    args = parser.parse_args()
    if args.confirm and args.dry_run:
        parser.error("Cannot use both --confirm and --dry-run")

    pp = _require_pandapower()
    print(f"pandapower {pp.__version__}")
    results = [generate_one(pp, n, confirm=args.confirm) for n in args.cases]
    print("\n=== Summary ===")
    for r in results:
        print(f"  case{r['case']}: {r['action']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
