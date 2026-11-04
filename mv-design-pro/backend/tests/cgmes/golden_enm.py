"""
A valid, typed golden EnergyNetworkModel exercising every main CGMES class.

Covers: Bus, Source, Transformer, OverheadLine, Cable, SwitchBranch, FuseBranch,
Load, Generator (synchronous + IBR), Substation. The network is a clean radial
SN feeder fed from a 110 kV grid, so the ENMValidator reports no BLOCKER and the
round-trip target is well-defined and deterministic.

Karta KATALOG-PRZEJECIE-PR (decyzja architekta 2026-11-04): elementy deklarujące pochodzenie
katalogowe dostają tabliczkę z REALNEGO katalogu przez produkcyjną operację
`assign_catalog_to_element` (ta sama materializacja co w aplikacji). Dawniej siedem
`catalog_ref` nie istniało w katalogu (`src-gpz-110kv-2500mva`, `tr-110-15-25mva-ynd11`,
`tr-15-04-630kva-dyn11`, `cable-yakxs-3x120`, `line-afl-70`, `gen-sync-2mva`,
`conv-pv-nn-0p5mw`), a parametry były wpisane ręcznie przy `parameter_source="CATALOG"` —
deklaracja pochodzenia bez pokrycia. Przepięcie (najbliższe pozycje, tabela w meldunku karty):

* źródło 110 kV — katalog nie ma pozycji zasilania 110 kV (rodzina `source_system_types` to
  zasilania 15/20 kV); równoważnik sieci 110 kV jest w produkcji jawnie RĘCZNY
  (`MANUAL_EQUIVALENT`, `add_grid_source_sn` z `manual_equivalent`) — tak samo tutaj;
* TR 110/15 25 MVA → `tr-wn-sn-110-15-25mva-yd11` (jedyna pozycja 110/15 kV 25 MVA);
* TR 15/0,4 630 kVA Dyn11 → `wzl-tpmnr-630-15-04` (uk 4 %, Pk 6,3 kW — najbliżej dawnych
  4,5 % / 6,5 kW wśród pozycji producentów 630 kVA Dyn11);
* kabel Al 120 mm² 12/20 kV → `cable-tfk-yakxs-3x120` (karta producenta, ZWERYFIKOWANY);
* linia AFL 70 mm² → `line-base-al-st-70` (AFL 6 70/11);
* generator synchroniczny 2 MVA — katalog nie ma maszyny synchronicznej SN (rodzina
  `synchronous_generator_types` to wyłącznie generatory sieci wzorcowych IEEE/CIGRE,
  REFERENCYJNY): bez typu, parametry maszyny z wartości roboczych rejestru (ZASADA NR 4);
* farma PV 0,4 kV → `conv-pv-nn-0p5mw-0p4kv` (jedyna pozycja 0,4 kV rzędu 0,5 MW; pozycje
  z kartą przy 0,4 kV mają 8–10 kVA).
"""

from __future__ import annotations

from enm.domain_operations import execute_domain_operation
from enm.models import (
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

#: (element, przestrzeń katalogu, pozycja) — tabliczka z katalogu przez operację produkcyjną.
WIAZANIA_KATALOGOWE_SIECI_ZLOTEJ: tuple[tuple[str, str, str], ...] = (
    ("tr_hv_sn", "TRAFO_SN_NN", "tr-wn-sn-110-15-25mva-yd11"),
    ("tr_sn_nn", "TRAFO_SN_NN", "wzl-tpmnr-630-15-04"),
    ("cab_main_b", "KABEL_SN", "cable-tfk-yakxs-3x120"),
    ("line_b_c", "LINIA_SN", "line-base-al-st-70"),
    ("gen_pv", "ZRODLO_NN_PV", "conv-pv-nn-0p5mw-0p4kv"),
)


def build_golden_enm() -> EnergyNetworkModel:
    """Deterministic golden ENM (no BLOCKER-level validation issues)."""
    enm = _topologia_i_dane_elementow().model_dump(mode="json")
    for element_ref, przestrzen, pozycja in WIAZANIA_KATALOGOWE_SIECI_ZLOTEJ:
        wynik = execute_domain_operation(
            enm,
            "assign_catalog_to_element",
            {
                "element_ref": element_ref,
                "catalog_binding": {
                    "catalog_namespace": przestrzen,
                    "catalog_item_id": pozycja,
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                },
            },
        )
        if wynik.get("error"):
            raise AssertionError(f"sieć złota: {element_ref} → {pozycja}: {wynik['error']}")
        enm = wynik["snapshot"]
    return EnergyNetworkModel.model_validate(enm)


def _topologia_i_dane_elementow() -> EnergyNetworkModel:
    """Topologia i dane ELEMENTÓW (długości, zaczepy, uziemienia, obciążenia). Parametry
    z tabliczki (R′/X′/B′, Sn/uk/Pk, obciążalność, dane cieplne) wpisuje materializacja —
    pola wymagane modelu mają tu 0.0 wyłącznie jako miejsce, które nadpisuje katalog."""
    return EnergyNetworkModel(
        header=ENMHeader(name="CGMES Golden Net"),
        buses=[
            Bus(ref_id="bus_hv", name="GPZ 110 kV", voltage_kv=110.0),
            Bus(ref_id="bus_sn_main", name="Szyna SN", voltage_kv=15.0),
            Bus(ref_id="bus_sn_b", name="Stacja B SN", voltage_kv=15.0),
            Bus(ref_id="bus_sn_c", name="Stacja C SN", voltage_kv=15.0),
            # W5-A: punkt neutralny nN niesie `Transformer.lv_neutral` (tr_sn_nn niżej),
            # `Bus.grounding` skasowane.
            Bus(ref_id="bus_nn", name="Szyna nN", voltage_kv=0.4),
        ],
        sources=[
            Source(
                ref_id="src_gpz",
                name="System 110 kV",
                bus_ref="bus_hv",
                model="short_circuit_power",
                sk3_mva=2500.0,
                r_ohm=0.5,
                x_ohm=5.0,
                rx_ratio=0.1,
                r0_ohm=0.6,
                x0_ohm=6.0,
                parameter_source="MANUAL_EQUIVALENT",
                source_mode="EKSPERCKI_RECZNY",
            ),
        ],
        transformers=[
            Transformer(
                ref_id="tr_hv_sn",
                name="TR 110/15",
                hv_bus_ref="bus_hv",
                lv_bus_ref="bus_sn_main",
                sn_mva=0.0,
                uhv_kv=110.0,
                ulv_kv=15.0,
                uk_percent=0.0,
                pk_kw=0.0,
                tap_position=0,
                tap_min=-9,
                tap_max=9,
                tap_step_percent=1.78,
            ),
            Transformer(
                ref_id="tr_sn_nn",
                name="TR 15/0.4",
                hv_bus_ref="bus_sn_b",
                lv_bus_ref="bus_nn",
                sn_mva=0.0,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=0.0,
                pk_kw=0.0,
                # W5-A: punkt neutralny nN (dawniej `bus_nn.grounding`) i układ sieci nN
                # (dawniej `substation.meta.nn_earthing_system`) — na transformatorze.
                lv_neutral=GroundingConfig(type="directly_grounded"),
                lv_earthing_system="TN-S",
                # Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: sieć nN +6 % (c 1,05/0,95 tabeli 1 IEC 60909-0).
                lv_voltage_tolerance="PLUS_6",
            ),
        ],
        branches=[
            Cable(
                ref_id="cab_main_b",
                name="Kabel SN 1",
                from_bus_ref="bus_sn_main",
                to_bus_ref="bus_sn_b",
                length_km=2.4,
                r_ohm_per_km=0.0,
                x_ohm_per_km=0.0,
            ),
            OverheadLine(
                ref_id="line_b_c",
                name="Linia SN 1",
                from_bus_ref="bus_sn_b",
                to_bus_ref="bus_sn_c",
                length_km=3.1,
                r_ohm_per_km=0.0,
                x_ohm_per_km=0.0,
            ),
            SwitchBranch(
                ref_id="sw_coupler",
                name="Sprzęgło Q1",
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
            Load(ref_id="load_nn", name="Odbiór nN", bus_ref="bus_nn", p_mw=0.45, q_mvar=0.15),
            Load(ref_id="load_c", name="Odbiór C", bus_ref="bus_sn_c", p_mw=1.2, q_mvar=0.4),
        ],
        generators=[
            Generator(
                ref_id="gen_sync",
                name="Generator synchroniczny",
                bus_ref="bus_sn_c",
                p_mw=2.0,
                q_mvar=0.6,
                gen_type="synchronous",
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
            ),
        ],
        substations=[
            Substation(
                ref_id="sub_b",
                name="Stacja B",
                station_type="mv_lv",
                bus_refs=["bus_sn_b", "bus_nn"],
                transformer_refs=["tr_sn_nn"],
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
