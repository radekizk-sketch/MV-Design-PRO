"""
Pandapower bridge — opcjonalny offline cross-check + topology import.

LAZY IMPORT: `import pandapower` jest wewnątrz funkcji aby uniknąć dependency
podczas runtime API. Pandapower wymagane TYLKO dla:
- scripts/regenerate_expected_values.py (offline expected JSON generation)
- testów cross-validation oznaczonych markerem `pandapower` (pyproject.toml),
  uruchamianych WYŁĄCZNIE w izolowanym środowisku (job CI
  `pandapower-cross-validation` w .github/workflows/python-tests.yml), bo
  pandapower<3.6 wymaga scipy<1.17 — niezgodne z pinem scipy 1.17.0 głównego
  venv solverów. Główny bieg CI deselekcjonuje ten marker (`-m "not
  pandapower"`); brak pandapower w głównym venv jest tam stanem stałym, nie
  warunkowym — stąd brak `is_pandapower_available`/`importorskip` w testach.

Pliki ENM-like dict ↔ pandapower dict konwersja.
"""

from __future__ import annotations

from typing import Any

from application.reference_networks.wymagane import pole_wymagane


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
            vn_kv=float(pole_wymagane(bus, "u_n_kv", opis=f"szyna {bus.get('ref_id')!r}")),
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
        opis_zrodla = f"zrodlo bilansujace na szynie {bus_ref!r}"
        ext_grid_kwargs: dict[str, Any] = {
            "bus": bus_idx_map[bus_ref],
            "vm_pu": float(pole_wymagane(source, "v_pu", opis=opis_zrodla)),
        }
        # sk_max_mva/rx_ratio (moc zwarciowa i R/X zrodla bilansujacego) sa w
        # pandapower.create_ext_grid OPCJONALNE (domyslnie NaN) — dotycza
        # WYLACZNIE pp.shortcircuit(), ktorego ten most nie wywoluje;
        # run_pandapower_powerflow() liczy tylko pp.runpp() (przeplyw mocy).
        # Siec referencyjna walidujaca WYLACZNIE rozplyw (np. IEEE 4-bus
        # Stevenson, pp_simple_four_bus) prawidlowo ich nie definiuje — to NIE
        # jest brak danych fikstury, tylko dana spoza zakresu tego obliczenia.
        # Wymuszanie ich przez pole_wymagane() bylo bledem MOSTU (fikstura
        # zwarciowa, np. iec60909_example.py, nadal je przekazuje, gdy sa
        # obecne — ponizej to zachowanie zachowane bez zmian).
        if source.get("sk_max_mva") is not None:
            ext_grid_kwargs["s_sc_max_mva"] = float(source["sk_max_mva"])
        if source.get("rx_ratio") is not None:
            ext_grid_kwargs["rx_max"] = float(source["rx_ratio"])
        pp.create_ext_grid(net, **ext_grid_kwargs)

    # Lines
    for branch in enm.get("branches", []):
        if branch.get("branch_type") != "LineBranch":
            continue
        from_bus = branch.get("from_bus")
        to_bus = branch.get("to_bus")
        if from_bus not in bus_idx_map or to_bus not in bus_idx_map:
            continue
        opis_galezi = f"galaz {branch.get('ref_id')!r}"
        length_km = float(pole_wymagane(branch, "length_km", opis=opis_galezi))
        # Use std_type if available, else create from impedance
        pp.create_line_from_parameters(
            net,
            from_bus=bus_idx_map[from_bus],
            to_bus=bus_idx_map[to_bus],
            length_km=max(length_km, 0.001),
            # rough conversion (dokumentowane uproszczenie tego mostka, patrz
            # docstring modulu) — ALE brakujace pole nadal NIE jest liczba 0.
            r_ohm_per_km=float(pole_wymagane(branch, "r_pu", opis=opis_galezi)) * 100.0,
            x_ohm_per_km=float(pole_wymagane(branch, "x_pu", opis=opis_galezi)) * 100.0,
            c_nf_per_km=float(pole_wymagane(branch, "b_pu", opis=opis_galezi)) * 10.0,
            max_i_ka=1.0,
            name=str(branch.get("name", branch["ref_id"])),
        )

    # Transformers
    for tr in enm.get("transformers", []):
        from_bus = tr.get("from_bus")
        to_bus = tr.get("to_bus")
        if from_bus not in bus_idx_map or to_bus not in bus_idx_map:
            continue
        opis_transformatora = f"transformator {tr.get('ref_id')!r}"
        pp.create_transformer_from_parameters(
            net,
            hv_bus=bus_idx_map[from_bus],
            lv_bus=bus_idx_map[to_bus],
            sn_mva=float(pole_wymagane(tr, "sn_mva", opis=opis_transformatora)),
            vn_hv_kv=float(pole_wymagane(tr, "primary_kv", opis=opis_transformatora)),
            vn_lv_kv=float(pole_wymagane(tr, "secondary_kv", opis=opis_transformatora)),
            vk_percent=float(pole_wymagane(tr, "ukr_pct", opis=opis_transformatora)),
            # vkr_percent/pfe_kw/i0_percent: STALE uproszczenie tego mostka
            # (nie czytaja ZADNEGO pola fikstury — poza zakresem FAB-E/E1,
            # ktory dotyczy fabrykowania WYNIKU przy brakujacym POLU wejscia).
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
        opis_odbioru = f"odbior na szynie {bus_ref!r}"
        pp.create_load(
            net,
            bus=bus_idx_map[bus_ref],
            p_mw=float(pole_wymagane(load, "p_mw", opis=opis_odbioru)),
            q_mvar=float(pole_wymagane(load, "q_mvar", opis=opis_odbioru)),
            name=str(load.get("ref_id", "")),
        )

    # Generators (PV/BESS as static generators)
    for gen in enm.get("generators", []):
        bus_ref = gen.get("bus")
        if bus_ref not in bus_idx_map:
            continue
        opis_generatora = f"generator na szynie {bus_ref!r}"
        gen_kind = str(gen.get("gen_kind", "")).lower()
        if "pv" in gen_kind:
            # Static generator (default Q=0)
            pp.create_sgen(
                net,
                bus=bus_idx_map[bus_ref],
                p_mw=float(pole_wymagane(gen, "p_mw", opis=opis_generatora)),
                q_mvar=0.0,
                name=str(gen.get("ref_id", "")),
                type="PV",
            )
        elif "bess" in gen_kind or "storage" in gen_kind:
            pp.create_sgen(
                net,
                bus=bus_idx_map[bus_ref],
                p_mw=float(pole_wymagane(gen, "p_mw", opis=opis_generatora)),
                q_mvar=0.0,
                name=str(gen.get("ref_id", "")),
                type="BESS",
            )
        else:
            # Synchronous generator (PV bus)
            pp.create_gen(
                net,
                bus=bus_idx_map[bus_ref],
                p_mw=float(pole_wymagane(gen, "p_mw", opis=opis_generatora)),
                vm_pu=float(pole_wymagane(gen, "v_pu", opis=opis_generatora)),
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
