"""Fikstury stacji SN/nN dla ILOCZYNU CECH projekcji domeny nN (karta B-02, §0.7).

JEDEN builder z jawnymi wymiarami, zamiast kilku podobnych modeli sklejanych w
każdym pliku testowym osobno — testy mają pokrywać ILOCZYN cech
({1 TR, 2 TR} × {sprzęgło otwarte/zamknięte} × {DER} × {wyspa beznapięciowa}),
a nie jeden przykład z karty, więc kombinacja musi być parametrem, nie kopią.

Topologia (stacja ``stn``, układ TN-C-S o ile nie podano inaczej):

    src(SN) ── sn ──TR1── nn_a ──ap_a── a1 ──c_a── a2 [load_a]
                     │            (sprzęgło, opcjonalnie)
                     └──TR2── nn_b ──ap_b── b1 ──c_b── b2 [load_b]
                                  nn_a ──roz_wyspa(OTWARTY)── wyspa [pv_wyspa]

Korzeniem każdego odpływu jest APARAT (``SwitchBranch`` z wiązaniem katalogowym
``APARAT_NN_MCB``), bo werdykt SWZ liczy się dla aparatu w korzeniu odpływu —
odpływ zaczynający się kablem dałby uczciwe „brak danych" (brak aparatu), co
testuje inną rzecz niż przypisanie odpływu do transformatora.
"""

from __future__ import annotations

from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Generator,
    Load,
    Source,
    Substation,
    SwitchBranch,
    Transformer,
)

REF_STACJA = "stn"


def _transformator(ref_id: str, name: str, lv_bus_ref: str, sn_mva: float = 0.63) -> Transformer:
    return Transformer(
        ref_id=ref_id,
        name=name,
        hv_bus_ref="sn",
        lv_bus_ref=lv_bus_ref,
        sn_mva=sn_mva,
        uhv_kv=15.0,
        ulv_kv=0.4,
        uk_percent=4.0,
        pk_kw=6.5,
        vector_group="Dyn11",
        catalog_ref="tr-15-04-630kva-dyn11",
    )


def _aparat(ref_id: str, from_bus: str, to_bus: str) -> SwitchBranch:
    return SwitchBranch(
        ref_id=ref_id,
        name=ref_id,
        type="breaker",
        from_bus_ref=from_bus,
        to_bus_ref=to_bus,
        catalog_ref="aparat-nn-mcb-c63",
        catalog_namespace="APARAT_NN_MCB",
        materialized_params={"in_a": 63.0, "curve_class": "C"},
    )


def _kabel(ref_id: str, from_bus: str, to_bus: str, *, length_km: float = 0.05) -> Cable:
    return Cable(
        ref_id=ref_id,
        name=ref_id,
        from_bus_ref=from_bus,
        to_bus_ref=to_bus,
        length_km=length_km,
        r_ohm_per_km=0.32,
        x_ohm_per_km=0.08,
        return_conductor_r_ohm_per_km_20c=0.32,
        return_conductor_x_ohm_per_km=0.08,
        short_circuit_temperature_c=160.0,
        catalog_ref="kabel-nn-yaky-4x120",
        catalog_namespace="KABEL_NN",
    )


def zbuduj_stacje_nn(
    *,
    transformatory: int = 1,
    sprzeglo: str | None = None,
    wspolna_szyna_nn: bool = False,
    pv_na_nn: bool = False,
    wyspa_odcieta: bool = False,
    pv_na_wyspie: bool = False,
    uklad_uziemienia: str = "TN-C-S",
    dlugosc_kabla_b_km: float = 0.05,
    moc_tr2_mva: float = 0.63,
) -> EnergyNetworkModel:
    """Zbuduj stację SN/nN o zadanych cechach.

    ``transformatory`` — 1 albo 2 transformatory stacji.
    ``sprzeglo`` — ``"closed"``/``"open"`` (tylko przy 2 TR i osobnych szynach).
    ``wspolna_szyna_nn`` — oba transformatory na TEJ SAMEJ szynie nN (brak
    „własnej sekcji" — świadomy przypadek brzegowy przypisania odpływu).
    ``pv_na_nn`` — generator PV na szynie ``a2`` (część zasilana).
    ``wyspa_odcieta`` — podszyna ``wyspa`` za OTWARTYM rozłącznikiem.
    ``pv_na_wyspie`` — generator PV na odciętej podszynie (wyspa DER).
    ``moc_tr2_mva`` — moc TR2; INNA niż TR1 daje INNĄ impedancję pętli, więc
    wynik liczony „od złego transformatora" różni się LICZBOWO (bez tego
    asymetria byłaby niewidoczna: sprzęgło ma zerową impedancję).
    """
    if transformatory not in (1, 2):
        raise ValueError("Fikstura obsługuje 1 albo 2 transformatory stacji.")
    if sprzeglo is not None and transformatory != 2:
        raise ValueError("Sprzęgło ma sens wyłącznie przy dwóch transformatorach.")
    if pv_na_wyspie and not wyspa_odcieta:
        raise ValueError("PV na wyspie wymaga odciętej podszyny.")

    druga_szyna = "nn_a" if wspolna_szyna_nn else "nn_b"

    buses = [
        Bus(ref_id="sn", name="SN", voltage_kv=15.0),
        Bus(ref_id="nn_a", name="RGnN sekcja A", voltage_kv=0.4),
        Bus(ref_id="a1", name="A1", voltage_kv=0.4),
        Bus(ref_id="a2", name="A2", voltage_kv=0.4),
    ]
    transformers = [_transformator("tr1", "TR1", "nn_a")]
    branches: list = [_aparat("ap_a", "nn_a", "a1"), _kabel("c_a", "a1", "a2")]
    loads = [Load(ref_id="load_a", name="Odbiór A", bus_ref="a2", p_mw=0.05, q_mvar=0.01)]
    generators: list[Generator] = []
    station_bus_refs = ["nn_a"]
    transformer_refs = ["tr1"]

    if transformatory == 2:
        transformers.append(_transformator("tr2", "TR2", druga_szyna, sn_mva=moc_tr2_mva))
        transformer_refs.append("tr2")
        buses.extend(
            [
                Bus(ref_id="b1", name="B1", voltage_kv=0.4),
                Bus(ref_id="b2", name="B2", voltage_kv=0.4),
            ]
        )
        branches.extend(
            [
                _aparat("ap_b", druga_szyna, "b1"),
                _kabel("c_b", "b1", "b2", length_km=dlugosc_kabla_b_km),
            ]
        )
        loads.append(Load(ref_id="load_b", name="Odbiór B", bus_ref="b2", p_mw=0.05, q_mvar=0.01))
        if not wspolna_szyna_nn:
            buses.append(Bus(ref_id="nn_b", name="RGnN sekcja B", voltage_kv=0.4))
            station_bus_refs.append("nn_b")
            branches.append(
                SwitchBranch(
                    ref_id="coupler",
                    name="Sprzęgło sekcji",
                    type="bus_coupler",
                    from_bus_ref="nn_a",
                    to_bus_ref="nn_b",
                    catalog_ref="aparat-nn-sprzeglo-630a",
                    catalog_namespace="APARAT_NN",
                    status=sprzeglo or "open",  # type: ignore[arg-type]
                )
            )

    if wyspa_odcieta:
        buses.append(Bus(ref_id="wyspa", name="Podszyna odcięta", voltage_kv=0.4))
        branches.append(
            SwitchBranch(
                ref_id="roz_wyspa",
                name="Rozłącznik podszyny",
                type="disconnector",
                from_bus_ref="nn_a",
                to_bus_ref="wyspa",
                catalog_ref="aparat-nn-rozlacznik-160a",
                catalog_namespace="APARAT_NN",
                status="open",
            )
        )

    if pv_na_nn:
        generators.append(
            Generator(
                ref_id="pv_nn",
                name="PV na sekcji A",
                bus_ref="a2",
                p_mw=0.05,
                gen_type="pv_inverter",
                connection_variant="nn_side",
                station_ref=REF_STACJA,
            )
        )
    if pv_na_wyspie:
        generators.append(
            Generator(
                ref_id="pv_wyspa",
                name="PV na odciętej podszynie",
                bus_ref="wyspa",
                p_mw=0.05,
                gen_type="pv_inverter",
                connection_variant="nn_side",
                station_ref=REF_STACJA,
            )
        )

    return EnergyNetworkModel(
        header=ENMHeader(name="b02-nn", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=buses,
        sources=[
            Source(
                ref_id="src",
                name="GPZ",
                bus_ref="sn",
                model="thevenin",
                r_ohm=0.1,
                x_ohm=0.5,
                catalog_ref="src-gpz-15kv",
            )
        ],
        transformers=transformers,
        generators=generators,
        loads=loads,
        branches=branches,
        substations=[
            Substation(
                ref_id=REF_STACJA,
                name="Stacja SN/nN",
                station_type="mv_lv",
                bus_refs=station_bus_refs,
                transformer_refs=transformer_refs,
                meta={"nn_earthing_system": uklad_uziemienia},
            )
        ],
    )
