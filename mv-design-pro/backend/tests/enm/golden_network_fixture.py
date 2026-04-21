"""
Golden Network Fixture — sieć testowa 20 stacji, 31+ segmentów.

Deterministyczny fixture ENM reprezentujący typową sieć SN z:
- 1 GPZ (Główny Punkt Zasilania)
- 19 stacji SN/nn (mv_lv)
- 2 magistrale (radial + ring)
- 3 węzły T (T_node)
- 31 segmentów kablowych
- 2 transformatory 110/15 kV
- 20 transformatorów 15/0.4 kV (po 1 na stację SN/nn)
- 19 odbiorników, 2 generatory OZE (PV + WIND)

Topologia:
  GPZ ─── M1 (magistrala 1, radialna)
   │       ├── S01 ── S02 ── S03 ── T1 ── S04 ── S05
   │       │                          └── S06 ── S07
   │       └── S08 ── S09 ── S10
   │
   └── M2 (magistrala 2, pierścieniowa)
           ├── S11 ── S12 ── T2 ── S13 ── S14
           │                  └── S15
           └── S16 ── S17 ── T3 ── S18 ── S19
                              └── (NO_point → S14)
"""

from __future__ import annotations

from enm.models import (
    Bay,
    Bus,
    Cable,
    Corridor,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    Junction,
    Load,
    Source,
    Substation,
    Transformer,
)


def build_golden_network() -> EnergyNetworkModel:
    """Zbuduj złotą sieć testową z 20 stacjami i 31+ segmentami."""

    buses: list[Bus] = []
    cables: list[Cable] = []
    transformers: list[Transformer] = []
    sources: list[Source] = []
    loads: list[Load] = []
    generators: list[Generator] = []
    substations: list[Substation] = []
    bays: list[Bay] = []
    junctions: list[Junction] = []
    corridors: list[Corridor] = []

    # =========================================================================
    # GPZ — Główny Punkt Zasilania
    # =========================================================================

    # Szyny WN (110 kV) i SN (15 kV) w GPZ
    buses.append(
        Bus(ref_id="bus_gpz_110", name="Szyna 110 kV GPZ", voltage_kv=110.0, tags=["source"])
    )
    buses.append(Bus(ref_id="bus_gpz_15_s1", name="Szyna 15 kV GPZ S1", voltage_kv=15.0))
    buses.append(Bus(ref_id="bus_gpz_15_s2", name="Szyna 15 kV GPZ S2", voltage_kv=15.0))

    # Źródło zasilania (sieć 110 kV)
    sources.append(
        Source(
            ref_id="src_grid",
            name="Sieć 110 kV",
            bus_ref="bus_gpz_110",
            model="short_circuit_power",
            sk3_mva=3000.0,
            rx_ratio=0.1,
            r0_ohm=0.1,
            x0_ohm=1.0,
            catalog_ref="SRC_GOLDEN_110KV",
            catalog_namespace="ZRODLO_SN",
            parameter_source="CATALOG",
            source_mode="KATALOG",
        )
    )

    # Transformatory WN/SN w GPZ
    # catalog_ref: golden case jest przypadkiem READY (produkcyjnym),
    # więc każdy transformator MUSI mieć referencję katalogową (E009).
    transformers.append(
        Transformer(
            ref_id="tr_gpz_t1",
            name="TR1 GPZ 110/15",
            hv_bus_ref="bus_gpz_110",
            lv_bus_ref="bus_gpz_15_s1",
            sn_mva=25.0,
            uhv_kv=110.0,
            ulv_kv=15.0,
            uk_percent=10.5,
            pk_kw=120.0,
            p0_kw=20.0,
            vector_group="Dyn11",
            catalog_ref="TR_110_15_25MVA_Dyn11",
        )
    )
    transformers.append(
        Transformer(
            ref_id="tr_gpz_t2",
            name="TR2 GPZ 110/15",
            hv_bus_ref="bus_gpz_110",
            lv_bus_ref="bus_gpz_15_s2",
            sn_mva=25.0,
            uhv_kv=110.0,
            ulv_kv=15.0,
            uk_percent=10.5,
            pk_kw=120.0,
            p0_kw=20.0,
            vector_group="Dyn11",
            catalog_ref="TR_110_15_25MVA_Dyn11",
        )
    )

    substations.append(
        Substation(
            ref_id="sub_gpz",
            name="GPZ Miasto",
            station_type="gpz",
            bus_refs=["bus_gpz_110", "bus_gpz_15_s1", "bus_gpz_15_s2"],
            transformer_refs=["tr_gpz_t1", "tr_gpz_t2"],
            entry_point_ref="bus_gpz_110",
        )
    )

    # Pola w GPZ
    bays.append(
        Bay(
            ref_id="bay_gpz_in1",
            name="Pole WN IN1",
            bay_role="IN",
            substation_ref="sub_gpz",
            bus_ref="bus_gpz_110",
            equipment_refs=["src_grid"],
        )
    )
    bays.append(
        Bay(
            ref_id="bay_gpz_tr1",
            name="Pole TR1",
            bay_role="TR",
            substation_ref="sub_gpz",
            bus_ref="bus_gpz_15_s1",
            equipment_refs=["tr_gpz_t1"],
        )
    )
    bays.append(
        Bay(
            ref_id="bay_gpz_tr2",
            name="Pole TR2",
            bay_role="TR",
            substation_ref="sub_gpz",
            bus_ref="bus_gpz_15_s2",
            equipment_refs=["tr_gpz_t2"],
        )
    )

    # =========================================================================
    # Stacje SN/nn — 19 stacji (S01-S19)
    # =========================================================================

    station_configs = [
        # (ref, name, p_mw, q_mvar)
        ("S01", "Stacja S01 Centrum", 0.4, 0.12),
        ("S02", "Stacja S02 Szkoła", 0.3, 0.09),
        ("S03", "Stacja S03 Hospital", 0.8, 0.24),
        ("S04", "Stacja S04 Rynek", 0.5, 0.15),
        ("S05", "Stacja S05 Park", 0.2, 0.06),
        ("S06", "Stacja S06 Osiedle A", 0.6, 0.18),
        ("S07", "Stacja S07 Osiedle B", 0.4, 0.12),
        ("S08", "Stacja S08 Przemysłowa", 1.0, 0.30),
        ("S09", "Stacja S09 Handlowa", 0.7, 0.21),
        ("S10", "Stacja S10 Magazyn", 0.3, 0.09),
        ("S11", "Stacja S11 Dworzec", 0.5, 0.15),
        ("S12", "Stacja S12 Szpital", 1.2, 0.36),
        ("S13", "Stacja S13 Stadion", 0.8, 0.24),
        ("S14", "Stacja S14 Uniwersytet", 0.9, 0.27),
        ("S15", "Stacja S15 Biblioteka", 0.3, 0.09),
        ("S16", "Stacja S16 Galeria", 0.7, 0.21),
        ("S17", "Stacja S17 Fabryka", 1.5, 0.45),
        ("S18", "Stacja S18 Oczyszczalnia", 0.6, 0.18),
        ("S19", "Stacja S19 Pompownia", 0.4, 0.12),
    ]

    for ref, name, p_mw, q_mvar in station_configs:
        bus_sn = f"bus_{ref.lower()}_15"
        bus_nn = f"bus_{ref.lower()}_04"

        buses.append(Bus(ref_id=bus_sn, name=f"Szyna 15 kV {ref}", voltage_kv=15.0))
        buses.append(Bus(ref_id=bus_nn, name=f"Szyna 0,4 kV {ref}", voltage_kv=0.4))

        transformers.append(
            Transformer(
                ref_id=f"tr_{ref.lower()}",
                name=f"TR {ref} 15/0,4",
                hv_bus_ref=bus_sn,
                lv_bus_ref=bus_nn,
                sn_mva=0.63,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.5,
                pk_kw=6.5,
                p0_kw=1.0,
                vector_group="Dyn11",
                catalog_ref="TR_15_04_630kVA_Dyn11",
            )
        )

        loads.append(
            Load(
                ref_id=f"load_{ref.lower()}",
                name=f"Odbiór {ref}",
                bus_ref=bus_nn,
                p_mw=p_mw,
                q_mvar=q_mvar,
            )
        )

        substations.append(
            Substation(
                ref_id=f"sub_{ref.lower()}",
                name=name,
                station_type="mv_lv",
                bus_refs=[bus_sn, bus_nn],
                transformer_refs=[f"tr_{ref.lower()}"],
                entry_point_ref=bus_sn,
            )
        )

        bays.append(
            Bay(
                ref_id=f"bay_{ref.lower()}_in",
                name=f"Pole IN {ref}",
                bay_role="IN",
                substation_ref=f"sub_{ref.lower()}",
                bus_ref=bus_sn,
            )
        )
        bays.append(
            Bay(
                ref_id=f"bay_{ref.lower()}_tr",
                name=f"Pole TR {ref}",
                bay_role="TR",
                substation_ref=f"sub_{ref.lower()}",
                bus_ref=bus_sn,
                equipment_refs=[f"tr_{ref.lower()}"],
            )
        )

    # =========================================================================
    # Generatory OZE
    # =========================================================================

    generators.append(
        Generator(
            ref_id="gen_pv_s05",
            name="Farma PV S05",
            bus_ref="bus_s05_04",
            p_mw=0.5,
            q_mvar=0.0,
            gen_type="pv_inverter",
        )
    )
    bays.append(
        Bay(
            ref_id="bay_s05_oze",
            name="Pole OZE S05",
            bay_role="OZE",
            substation_ref="sub_s05",
            bus_ref="bus_s05_04",
            equipment_refs=["gen_pv_s05"],
        )
    )

    generators.append(
        Generator(
            ref_id="gen_wind_s10",
            name="Turbina wiatrowa S10",
            bus_ref="bus_s10_04",
            p_mw=2.0,
            q_mvar=0.0,
            gen_type="wind_inverter",
        )
    )
    bays.append(
        Bay(
            ref_id="bay_s10_oze",
            name="Pole OZE S10",
            bay_role="OZE",
            substation_ref="sub_s10",
            bus_ref="bus_s10_04",
            equipment_refs=["gen_wind_s10"],
        )
    )

    # =========================================================================
    # Kable SN — 31 segmentów
    # =========================================================================

    # catalog_ref: golden case jest przypadkiem READY (produkcyjnym),
    # więc każdy kabel MUSI mieć referencję katalogową (E009).
    cable_template = {
        "r_ohm_per_km": 0.206,
        "x_ohm_per_km": 0.074,
        "b_siemens_per_km": 0.000054,
        "r0_ohm_per_km": 0.824,
        "x0_ohm_per_km": 0.296,
        "catalog_ref": "CAT-CAB-YAKY-240",
    }

    cable_defs = [
        # Magistrala 1 (z sekcji S1 GPZ)
        ("cab_gpz_s01", "bus_gpz_15_s1", "bus_s01_15", 2.1),
        ("cab_s01_s02", "bus_s01_15", "bus_s02_15", 1.3),
        ("cab_s02_s03", "bus_s02_15", "bus_s03_15", 0.8),
        ("cab_s03_t1", "bus_s03_15", "bus_t1_15", 0.5),
        ("cab_t1_s04", "bus_t1_15", "bus_s04_15", 1.1),
        ("cab_s04_s05", "bus_s04_15", "bus_s05_15", 0.9),
        ("cab_t1_s06", "bus_t1_15", "bus_s06_15", 0.7),
        ("cab_s06_s07", "bus_s06_15", "bus_s07_15", 1.2),
        # Odgałęzienie od S1 GPZ
        ("cab_gpz_s08", "bus_gpz_15_s1", "bus_s08_15", 3.0),
        ("cab_s08_s09", "bus_s08_15", "bus_s09_15", 1.5),
        ("cab_s09_s10", "bus_s09_15", "bus_s10_15", 2.0),
        # Magistrala 2 (z sekcji S2 GPZ)
        ("cab_gpz_s11", "bus_gpz_15_s2", "bus_s11_15", 1.8),
        ("cab_s11_s12", "bus_s11_15", "bus_s12_15", 1.0),
        ("cab_s12_t2", "bus_s12_15", "bus_t2_15", 0.6),
        ("cab_t2_s13", "bus_t2_15", "bus_s13_15", 0.9),
        ("cab_s13_s14", "bus_s13_15", "bus_s14_15", 1.4),
        ("cab_t2_s15", "bus_t2_15", "bus_s15_15", 0.5),
        # Odgałęzienie M2
        ("cab_gpz_s16", "bus_gpz_15_s2", "bus_s16_15", 2.2),
        ("cab_s16_s17", "bus_s16_15", "bus_s17_15", 1.1),
        ("cab_s17_t3", "bus_s17_15", "bus_t3_15", 0.8),
        ("cab_t3_s18", "bus_t3_15", "bus_s18_15", 1.3),
        ("cab_s18_s19", "bus_s18_15", "bus_s19_15", 0.9),
        # NO point — pierścień M2
        ("cab_t3_s14", "bus_t3_15", "bus_s14_15", 2.5),
    ]

    # Szyny T-node (junction buses)
    buses.append(Bus(ref_id="bus_t1_15", name="Szyna T1 15 kV", voltage_kv=15.0))
    buses.append(Bus(ref_id="bus_t2_15", name="Szyna T2 15 kV", voltage_kv=15.0))
    buses.append(Bus(ref_id="bus_t3_15", name="Szyna T3 15 kV", voltage_kv=15.0))

    for ref, from_bus, to_bus, length in cable_defs:
        cables.append(
            Cable(
                ref_id=ref,
                name=f"Kabel {ref.replace('cab_', '').upper()}",
                from_bus_ref=from_bus,
                to_bus_ref=to_bus,
                type="cable",
                length_km=length,
                **cable_template,
            )
        )

    # =========================================================================
    # Dodatkowe kable (8 segmentów — łącznie 31)
    # =========================================================================

    extra_cables = [
        ("cab_s01_s08", "bus_s01_15", "bus_s08_15", 2.8),
        ("cab_s03_s12", "bus_s03_15", "bus_s12_15", 3.5),
        ("cab_s07_s15", "bus_s07_15", "bus_s15_15", 4.0),
        ("cab_s10_s19", "bus_s10_15", "bus_s19_15", 3.2),
        ("cab_s05_pv", "bus_s05_15", "bus_s05_04", 0.05),
        ("cab_s10_wind", "bus_s10_15", "bus_s10_04", 0.03),
        ("cab_s14_uni", "bus_s14_15", "bus_s14_04", 0.04),
        ("cab_s17_fab", "bus_s17_15", "bus_s17_04", 0.06),
    ]

    for ref, from_bus, to_bus, length in extra_cables:
        cables.append(
            Cable(
                ref_id=ref,
                name=f"Kabel {ref.replace('cab_', '').upper()}",
                from_bus_ref=from_bus,
                to_bus_ref=to_bus,
                type="cable",
                length_km=length,
                **cable_template,
            )
        )

    # =========================================================================
    # Węzły T (junctions)
    # =========================================================================

    junctions.append(
        Junction(
            ref_id="junc_t1",
            name="Węzeł T1",
            connected_branch_refs=["cab_s03_t1", "cab_t1_s04", "cab_t1_s06"],
            junction_type="T_node",
        )
    )
    junctions.append(
        Junction(
            ref_id="junc_t2",
            name="Węzeł T2",
            connected_branch_refs=["cab_s12_t2", "cab_t2_s13", "cab_t2_s15"],
            junction_type="T_node",
        )
    )
    junctions.append(
        Junction(
            ref_id="junc_t3",
            name="Węzeł T3",
            connected_branch_refs=["cab_s17_t3", "cab_t3_s18", "cab_t3_s14"],
            junction_type="T_node",
        )
    )

    # =========================================================================
    # Magistrale (corridors)
    # =========================================================================

    corridors.append(
        Corridor(
            ref_id="corr_m1",
            name="Magistrala M1",
            corridor_type="radial",
            ordered_segment_refs=[
                "cab_gpz_s01",
                "cab_s01_s02",
                "cab_s02_s03",
                "cab_s03_t1",
                "cab_t1_s04",
                "cab_s04_s05",
                "cab_t1_s06",
                "cab_s06_s07",
                "cab_gpz_s08",
                "cab_s08_s09",
                "cab_s09_s10",
            ],
        )
    )

    corridors.append(
        Corridor(
            ref_id="corr_m2",
            name="Magistrala M2",
            corridor_type="ring",
            ordered_segment_refs=[
                "cab_gpz_s11",
                "cab_s11_s12",
                "cab_s12_t2",
                "cab_t2_s13",
                "cab_s13_s14",
                "cab_t2_s15",
                "cab_gpz_s16",
                "cab_s16_s17",
                "cab_s17_t3",
                "cab_t3_s18",
                "cab_s18_s19",
                "cab_t3_s14",
            ],
            no_point_ref="cab_t3_s14",
        )
    )

    # =========================================================================
    # Składanie modelu
    # =========================================================================

    return EnergyNetworkModel(
        header=ENMHeader(
            name="Złota Sieć Testowa 20 Stacji",
            description="Deterministyczny fixture ENM: 20 stacji, 31+ segmentów, 2 magistrale, 3 węzły T",
            revision=1,
        ),
        buses=buses,
        branches=cables,
        transformers=transformers,
        sources=sources,
        loads=loads,
        generators=generators,
        substations=substations,
        bays=bays,
        junctions=junctions,
        corridors=corridors,
    )
