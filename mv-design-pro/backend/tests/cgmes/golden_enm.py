"""
A valid, typed golden EnergyNetworkModel exercising every main CGMES class.

Covers: Bus, Source, Transformer, OverheadLine, Cable, SwitchBranch, FuseBranch,
Load, Generator (synchronous + IBR), Substation. The network is a clean radial
SN feeder fed from a 110 kV grid, so the ENMValidator reports no BLOCKER and the
round-trip target is well-defined and deterministic.
"""

from __future__ import annotations

from enm.models import (
    BranchRating,
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    FuseBranch,
    Generator,
    GroundingConfig,
    Load,
    OverheadLine,
    Source,
    Substation,
    SwitchBranch,
    Transformer,
)


def build_golden_enm() -> EnergyNetworkModel:
    """Deterministic golden ENM (no BLOCKER-level validation issues)."""
    return EnergyNetworkModel(
        header=ENMHeader(name="CGMES Golden Net"),
        buses=[
            Bus(ref_id="bus_hv", name="GPZ 110kV", voltage_kv=110.0),
            Bus(ref_id="bus_sn_main", name="Szyna SN", voltage_kv=15.0),
            Bus(ref_id="bus_sn_b", name="Stacja B SN", voltage_kv=15.0),
            Bus(ref_id="bus_sn_c", name="Stacja C SN", voltage_kv=15.0),
            Bus(
                ref_id="bus_nn",
                name="Szyna nN",
                voltage_kv=0.4,
                grounding=GroundingConfig(type="directly_grounded"),
            ),
        ],
        sources=[
            Source(
                ref_id="src_gpz",
                name="System 110kV",
                bus_ref="bus_hv",
                model="short_circuit_power",
                sk3_mva=2500.0,
                r_ohm=0.5,
                x_ohm=5.0,
                rx_ratio=0.1,
                r0_ohm=0.6,
                x0_ohm=6.0,
                catalog_ref="src-gpz-110kv-2500mva",
                catalog_namespace="ZRODLO_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            ),
        ],
        transformers=[
            Transformer(
                ref_id="tr_hv_sn",
                name="TR 110/15",
                hv_bus_ref="bus_hv",
                lv_bus_ref="bus_sn_main",
                sn_mva=25.0,
                uhv_kv=110.0,
                ulv_kv=15.0,
                uk_percent=12.0,
                pk_kw=120.0,
                p0_kw=18.0,
                i0_percent=0.4,
                vector_group="YNd11",
                tap_position=0,
                tap_min=-9,
                tap_max=9,
                tap_step_percent=1.78,
                catalog_ref="tr-110-15-25mva-ynd11",
                catalog_namespace="TRAFO_SN_NN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            ),
            Transformer(
                ref_id="tr_sn_nn",
                name="TR 15/0.4",
                hv_bus_ref="bus_sn_b",
                lv_bus_ref="bus_nn",
                sn_mva=0.63,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.5,
                pk_kw=6.5,
                vector_group="Dyn11",
                catalog_ref="tr-15-04-630kva-dyn11",
                catalog_namespace="TRAFO_SN_NN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            ),
        ],
        branches=[
            Cable(
                ref_id="cab_main_b",
                name="Kabel SN 1",
                from_bus_ref="bus_sn_main",
                to_bus_ref="bus_sn_b",
                length_km=2.4,
                r_ohm_per_km=0.161,
                x_ohm_per_km=0.105,
                b_siemens_per_km=5.4e-5,
                r0_ohm_per_km=0.42,
                x0_ohm_per_km=0.31,
                b0_siemens_per_km=4.1e-5,
                conductor_material="Al",
                cross_section_mm2=120.0,
                insulation="XLPE",
                rating=BranchRating(in_a=280.0, ith_ka=11.0, idyn_ka=28.0),
                catalog_ref="cable-yakxs-3x120",
                catalog_namespace="KABEL_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            ),
            OverheadLine(
                ref_id="line_b_c",
                name="Linia SN 1",
                from_bus_ref="bus_sn_b",
                to_bus_ref="bus_sn_c",
                length_km=3.1,
                r_ohm_per_km=0.306,
                x_ohm_per_km=0.34,
                b_siemens_per_km=3.0e-6,
                r0_ohm_per_km=0.46,
                x0_ohm_per_km=1.2,
                rating=BranchRating(in_a=210.0),
                catalog_ref="line-afl-70",
                catalog_namespace="LINIA_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            ),
            SwitchBranch(
                ref_id="sw_coupler",
                name="Sprzeglo Q1",
                from_bus_ref="bus_sn_main",
                to_bus_ref="bus_sn_b",
                type="breaker",
                status="closed",
            ),
            FuseBranch(
                ref_id="fuse_c",
                name="Bezpiecznik C",
                from_bus_ref="bus_sn_c",
                to_bus_ref="bus_sn_main",
                status="open",
                rated_current_a=63.0,
                rated_voltage_kv=15.0,
            ),
        ],
        loads=[
            Load(ref_id="load_nn", name="Odbior nN", bus_ref="bus_nn", p_mw=0.45, q_mvar=0.15),
            Load(ref_id="load_c", name="Odbior C", bus_ref="bus_sn_c", p_mw=1.2, q_mvar=0.4),
        ],
        generators=[
            Generator(
                ref_id="gen_sync",
                name="Generator synchroniczny",
                bus_ref="bus_sn_c",
                p_mw=2.0,
                q_mvar=0.6,
                gen_type="synchronous",
                catalog_ref="gen-sync-2mva",
            ),
            Generator(
                ref_id="gen_pv",
                name="Farma PV",
                bus_ref="bus_nn",
                p_mw=0.4,
                q_mvar=0.0,
                gen_type="pv_inverter",
                connection_variant="nn_side",
                station_ref="sub_b",
                catalog_ref="conv-pv-nn-0p5mw",
            ),
        ],
        substations=[
            Substation(
                ref_id="sub_b",
                name="Stacja B",
                station_type="mv_lv",
                bus_refs=["bus_sn_b", "bus_nn"],
                transformer_refs=["tr_sn_nn"],
                # P0.1 nN (karta P0.1, E063): stacja z odbiorem/generacja na szynie
                # nN (load_nn/gen_pv) musi deklarowac uklad uziemienia sieci nN —
                # TN-S jest zgodny z `bus_nn.grounding.type = "directly_grounded"`
                # zadeklarowanym wyzej.
                meta={"nn_earthing_system": "TN-S"},
            ),
            Substation(
                ref_id="sub_gpz",
                name="GPZ",
                station_type="gpz",
                bus_refs=["bus_hv", "bus_sn_main"],
                transformer_refs=["tr_hv_sn"],
            ),
        ],
    )
