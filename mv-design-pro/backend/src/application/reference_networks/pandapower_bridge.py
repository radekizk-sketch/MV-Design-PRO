"""
Pandapower bridge — opcjonalny offline cross-check + topology import.

LAZY IMPORT: `import pandapower` jest wewnątrz funkcji aby uniknąć dependency
podczas runtime API. Pandapower wymagane TYLKO dla:
- scripts/regenerate_expected_values.py (offline expected JSON generation)
- testów cross-validation w CI (z pytest.importorskip)

Pliki ENM-like dict ↔ pandapower dict konwersja.
"""

from __future__ import annotations

from typing import Any


def _require_pandapower() -> Any:
    """Lazy import pandapower; raise informative error if not installed."""
    try:
        import pandapower as pp  # type: ignore[import-not-found]

        return pp
    except ImportError as exc:
        raise ImportError(
            "pandapower is required for this operation. "
            "Install with: pip install pandapower (optional dependency)."
        ) from exc


def enm_to_pandapower_dict(enm: dict[str, Any]) -> dict[str, Any]:
    """Convert ENM-like dict (from reference network builder) to pandapower net.

    Returns pandapower.Network as dict (via pp.to_json then json.loads),
    or raises ImportError if pandapower not available.

    Note: This is a simplified conversion for validation purposes —
    handles buses, lines, transformers, loads, generators, slack.
    Per-phase data and complex catalog refs require extended mapping.
    """
    pp = _require_pandapower()

    net = pp.create_empty_network(
        name=str(enm.get("header", {}).get("name", "ref-network")),
    )
    bus_idx_map: dict[str, int] = {}

    # Buses
    for bus in enm.get("buses", []):
        idx = pp.create_bus(
            net,
            vn_kv=float(bus.get("u_n_kv", 110.0)),
            name=str(bus.get("name", bus["ref_id"])),
        )
        bus_idx_map[bus["ref_id"]] = idx

    # External grid (slack)
    for source in enm.get("sources", []):
        if source.get("source_kind") != "slack":
            continue
        bus_ref = source.get("bus")
        if bus_ref not in bus_idx_map:
            continue
        pp.create_ext_grid(
            net,
            bus=bus_idx_map[bus_ref],
            vm_pu=float(source.get("v_pu", 1.0)),
            s_sc_max_mva=float(source.get("sk_max_mva", 1000.0)),
            rx_max=float(source.get("rx_ratio", 0.1)),
        )

    # Lines
    for branch in enm.get("branches", []):
        if branch.get("branch_type") != "LineBranch":
            continue
        from_bus = branch.get("from_bus")
        to_bus = branch.get("to_bus")
        if from_bus not in bus_idx_map or to_bus not in bus_idx_map:
            continue
        length_km = float(branch.get("length_km", 1.0))
        # Use std_type if available, else create from impedance
        pp.create_line_from_parameters(
            net,
            from_bus=bus_idx_map[from_bus],
            to_bus=bus_idx_map[to_bus],
            length_km=max(length_km, 0.001),
            r_ohm_per_km=float(branch.get("r_pu", 0.01)) * 100.0,  # rough conversion
            x_ohm_per_km=float(branch.get("x_pu", 0.03)) * 100.0,
            c_nf_per_km=float(branch.get("b_pu", 0.0)) * 10.0,
            max_i_ka=1.0,
            name=str(branch.get("name", branch["ref_id"])),
        )

    # Transformers
    for tr in enm.get("transformers", []):
        from_bus = tr.get("from_bus")
        to_bus = tr.get("to_bus")
        if from_bus not in bus_idx_map or to_bus not in bus_idx_map:
            continue
        pp.create_transformer_from_parameters(
            net,
            hv_bus=bus_idx_map[from_bus],
            lv_bus=bus_idx_map[to_bus],
            sn_mva=float(tr.get("sn_mva", 25.0)),
            vn_hv_kv=float(tr.get("primary_kv", 110.0)),
            vn_lv_kv=float(tr.get("secondary_kv", 20.0)),
            vk_percent=float(tr.get("ukr_pct", 10.0)),
            vkr_percent=0.5,
            pfe_kw=0.5,
            i0_percent=0.1,
            name=str(tr.get("name", tr["ref_id"])),
        )

    # Loads
    for load in enm.get("loads", []):
        bus_ref = load.get("bus")
        if bus_ref not in bus_idx_map:
            continue
        pp.create_load(
            net,
            bus=bus_idx_map[bus_ref],
            p_mw=float(load.get("p_mw", 0.0)),
            q_mvar=float(load.get("q_mvar", 0.0)),
            name=str(load.get("ref_id", "")),
        )

    # Generators (PV/BESS as static generators)
    for gen in enm.get("generators", []):
        bus_ref = gen.get("bus")
        if bus_ref not in bus_idx_map:
            continue
        gen_kind = str(gen.get("gen_kind", "")).lower()
        if "pv" in gen_kind:
            # Static generator (default Q=0)
            pp.create_sgen(
                net,
                bus=bus_idx_map[bus_ref],
                p_mw=float(gen.get("p_mw", 0.0)),
                q_mvar=0.0,
                name=str(gen.get("ref_id", "")),
                type="PV",
            )
        elif "bess" in gen_kind or "storage" in gen_kind:
            pp.create_sgen(
                net,
                bus=bus_idx_map[bus_ref],
                p_mw=float(gen.get("p_mw", 0.0)),
                q_mvar=0.0,
                name=str(gen.get("ref_id", "")),
                type="BESS",
            )
        else:
            # Synchronous generator (PV bus)
            pp.create_gen(
                net,
                bus=bus_idx_map[bus_ref],
                p_mw=float(gen.get("p_mw", 0.0)),
                vm_pu=float(gen.get("v_pu", 1.0)),
                name=str(gen.get("ref_id", "")),
            )

    return {"net": net, "bus_idx_map": bus_idx_map}


def run_pandapower_powerflow(enm: dict[str, Any]) -> dict[str, dict[str, float]]:
    """Run pandapower NR PF on ENM-converted network; return per-bus {v_pu, angle_deg}.

    Returns {bus_ref_id: {v_pu, angle_deg}} for cross-validation against our solver.
    Raises ImportError if pandapower not installed.
    """
    pp = _require_pandapower()
    bridge = enm_to_pandapower_dict(enm)
    net = bridge["net"]
    bus_idx_map: dict[str, int] = bridge["bus_idx_map"]

    pp.runpp(net, algorithm="nr")

    results: dict[str, dict[str, float]] = {}
    for bus_ref, idx in bus_idx_map.items():
        row = net.res_bus.loc[idx]
        results[bus_ref] = {
            "v_pu": float(row["vm_pu"]),
            "angle_deg": float(row["va_degree"]),
        }
    return results


def is_pandapower_available() -> bool:
    """Sprawdza czy pandapower jest dostępne (do conditional features)."""
    try:
        import pandapower  # type: ignore[import-not-found]  # noqa: F401

        return True
    except ImportError:
        return False
