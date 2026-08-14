"""Testy sekcji nN raportu (karta P0.10, G-21, §0.4 — zakres minimalny P0).

Pokrywa: obecność sekcji (dane źródłowe, TR, odcinki, ΔU, zwarcia, SWZ,
dobór), provenance na KAŻDEJ sekcji, determinizm, uczciwe stany „niedostępne"
(ΔU/dobór bez parametrów) i „brak danych" (model bez stacji)."""

from __future__ import annotations

from api.analysis_run_exports import build_nn_circuit_report_section
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Source,
    Substation,
    SwitchBranch,
    Transformer,
)


def _enm() -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="t", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[
            Bus(ref_id="sn", name="SN", voltage_kv=15.0),
            Bus(ref_id="nn", name="nN", voltage_kv=0.4),
            Bus(ref_id="b1", name="B1", voltage_kv=0.4),
            Bus(ref_id="b2", name="B2", voltage_kv=0.4),
        ],
        sources=[
            Source(ref_id="src", name="GPZ", bus_ref="sn", model="thevenin", r_ohm=0.1, x_ohm=0.5)
        ],
        transformers=[
            Transformer(
                ref_id="tr",
                name="TR",
                hv_bus_ref="sn",
                lv_bus_ref="nn",
                sn_mva=0.63,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.0,
                pk_kw=6.5,
                vector_group="Dyn11",
            )
        ],
        branches=[
            Cable(
                ref_id="c1",
                name="C1",
                from_bus_ref="nn",
                to_bus_ref="b1",
                length_km=0.05,
                r_ohm_per_km=0.32,
                x_ohm_per_km=0.08,
                return_conductor_r_ohm_per_km_20c=0.32,
                return_conductor_x_ohm_per_km=0.08,
                short_circuit_temperature_c=160.0,
                catalog_namespace="KABEL_NN",
                catalog_ref="YAKY4x120",
                materialized_params={"i_max_a": 250.0},
            ),
            SwitchBranch(
                ref_id="ap1",
                name="AP1",
                type="breaker",
                from_bus_ref="b1",
                to_bus_ref="b2",
                catalog_namespace="APARAT_NN_MCB",
                materialized_params={"in_a": 16.0, "curve_class": "B", "icn_ka": 6.0},
            ),
        ],
        substations=[
            Substation(
                ref_id="stn",
                name="S",
                station_type="mv_lv",
                bus_refs=["nn"],
                transformer_refs=["tr"],
                meta={"nn_earthing_system": "TN-C-S"},
            )
        ],
    )


def _wywolaj(enm, **kwargs) -> dict:
    return build_nn_circuit_report_section(
        enm=enm,
        station_ref="stn",
        bus_ref="b1",
        breaker_ref="ap1",
        run_id="r1",
        revision_id="rev1",
        przypadek_decydujacy="TR",
        **kwargs,
    )


def test_wszystkie_wymagane_sekcje_obecne() -> None:
    wynik = _wywolaj(_enm(), ib_a=10.0, iz_prime_a=100.0, ik_max_ka=5.0)
    assert wynik["status"] == "OK"
    for sekcja in (
        "dane_zrodlowe",
        "transformator",
        "odcinki",
        "delta_u",
        "zwarcia",
        "swz",
        "dobor",
    ):
        assert sekcja in wynik, f"brak sekcji {sekcja}"


def test_provenance_na_kazdej_sekcji() -> None:
    wynik = _wywolaj(_enm(), ib_a=10.0, iz_prime_a=100.0, ik_max_ka=5.0)
    oczekiwane = {"run_id": "r1", "revision_id": "rev1", "przypadek_decydujacy": "TR"}
    for sekcja in ("dane_zrodlowe", "transformator", "delta_u", "zwarcia", "swz", "dobor"):
        assert wynik[sekcja]["provenance"] == oczekiwane
    assert all(odc["provenance"] == oczekiwane for odc in wynik["odcinki"])
    assert wynik["provenance"] == oczekiwane


def test_odcinki_niosa_katalog_i_dlugosc() -> None:
    wynik = _wywolaj(_enm(), ib_a=10.0, iz_prime_a=100.0, ik_max_ka=5.0)
    odcinek = wynik["odcinki"][0]
    assert odcinek["katalog_namespace"] == "KABEL_NN"
    assert odcinek["katalog_ref"] == "YAKY4x120"
    assert odcinek["dlugosc_km"] == 0.05
    assert odcinek["iz_katalogowe_a"] == 250.0


def test_delta_u_niedostepne_bez_parametrow_nie_fikcyjna_liczba() -> None:
    wynik = _wywolaj(_enm(), ib_a=10.0, iz_prime_a=100.0, ik_max_ka=5.0)
    assert wynik["delta_u"]["status"] == "niedostępne"
    assert "reason_pl" in wynik["delta_u"]


def test_delta_u_dostepne_gdy_parametry_podane() -> None:
    wynik = _wywolaj(
        _enm(),
        ib_a=10.0,
        iz_prime_a=100.0,
        ik_max_ka=5.0,
        vdrop_u_source_kv=0.4,
        vdrop_delta_u_total_kv=0.01,
    )
    assert wynik["delta_u"]["u_source_kv"] == 0.4
    assert wynik["delta_u"]["u_target_kv"] == 0.39


def test_dobor_niedostepne_bez_ib_iz_prime() -> None:
    wynik = _wywolaj(_enm(), ik_max_ka=5.0)
    assert wynik["dobor"]["status"] == "niedostępne"


def test_dobor_ma_ranking_z_kryteriami_gdy_parametry_podane() -> None:
    wynik = _wywolaj(_enm(), ib_a=10.0, iz_prime_a=100.0, ik_max_ka=5.0)
    assert wynik["dobor"]["status"] == "OK"
    assert "kandydaci" in wynik["dobor"]["dobor"]


def test_swz_niesie_werdykt_z_dowodem() -> None:
    wynik = _wywolaj(_enm(), ib_a=10.0, iz_prime_a=100.0, ik_max_ka=5.0)
    assert wynik["swz"]["swz"]["status"] in ("spełnia", "nie spełnia", "nierozstrzygalne")
    assert "white_box_trace" in wynik["swz"]["swz"]


def test_zwarcia_niesie_ik_max_i_ik_min() -> None:
    wynik = _wywolaj(_enm(), ib_a=10.0, iz_prime_a=100.0, ik_max_ka=5.0)
    assert wynik["zwarcia"]["ik_max_ka"] == 5.0
    assert isinstance(wynik["zwarcia"]["ik_min_a"], float)


def test_brak_stacji_jest_uczciwy() -> None:
    wynik = build_nn_circuit_report_section(
        enm=_enm(),
        station_ref="brak-takiej",
        bus_ref="b1",
        breaker_ref="ap1",
        run_id="r1",
        revision_id="rev1",
        przypadek_decydujacy="TR",
    )
    assert wynik["status"] == "brak danych"
    assert wynik["missing_data"] == ["station"]


def test_determinizm_dwa_wywolania_identyczne() -> None:
    enm = _enm()
    w1 = _wywolaj(enm, ib_a=10.0, iz_prime_a=100.0, ik_max_ka=5.0)
    w2 = _wywolaj(enm, ib_a=10.0, iz_prime_a=100.0, ik_max_ka=5.0)
    assert w1 == w2
