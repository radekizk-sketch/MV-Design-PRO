"""Testy orkiestracji SWZ per obwód: pętla zwarcia (MIN) + aparat → werdykt
(karta P0.6, G-06). Trzy stany z realnym dowodem liczbowym z solvera."""

from __future__ import annotations

import pytest
from application.analyses.swz.service import build_swz_view
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    FuseBranch,
    Source,
    Substation,
    SwitchBranch,
    Transformer,
)


def _enm(
    *,
    cable_length_km: float,
    catalog_namespace: str,
    materialized_params: dict | None,
    branch_kind: str = "switch",
) -> EnergyNetworkModel:
    branches: list = [
        Cable(
            ref_id="c1",
            name="C1",
            from_bus_ref="nn",
            to_bus_ref="b1",
            length_km=cable_length_km,
            r_ohm_per_km=0.32,
            x_ohm_per_km=0.08,
            return_conductor_r_ohm_per_km_20c=0.32,
            return_conductor_x_ohm_per_km=0.08,
            short_circuit_temperature_c=160.0,
        )
    ]
    if branch_kind == "fuse":
        branches.append(
            FuseBranch(
                ref_id="ap1",
                name="AP1",
                from_bus_ref="b1",
                to_bus_ref="b2",
                catalog_namespace=catalog_namespace,
                materialized_params=materialized_params,
            )
        )
    else:
        branches.append(
            SwitchBranch(
                ref_id="ap1",
                name="AP1",
                type="breaker",
                from_bus_ref="b1",
                to_bus_ref="b2",
                catalog_namespace=catalog_namespace,
                materialized_params=materialized_params,
            )
        )
    return EnergyNetworkModel(
        header=ENMHeader(name="t", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[
            Bus(ref_id="sn", name="SN", voltage_kv=15.0),
            Bus(ref_id="nn", name="nN", voltage_kv=0.4),
            Bus(ref_id="b1", name="B1", voltage_kv=0.4),
            Bus(ref_id="b2", name="B2", voltage_kv=0.4),
        ],
        sources=[
            Source(
                ref_id="src",
                name="GPZ",
                bus_ref="sn",
                model="thevenin",
                r_ohm=0.1,
                x_ohm=0.5,
            )
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
        branches=branches,
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


def test_swz_spelnia_short_circuit_mcb_b16() -> None:
    """Krótki obwód (50 m), MCB B16 → Ik1_min wysoki, spełnia."""
    enm = _enm(
        cable_length_km=0.05,
        catalog_namespace="APARAT_NN_MCB",
        materialized_params={"in_a": 16.0, "curve_class": "B"},
    )
    view = build_swz_view(enm, "stn", "b1", "ap1")
    assert view["status"] == "OK"
    assert view["swz"]["status"] == "spełnia"
    assert view["swz"]["ik1_min_a"] > view["swz"]["ia_wymagane_a"]


def test_swz_nie_spelnia_long_circuit_high_in() -> None:
    """Długi obwód (2 km), MCB C63 wysokoprądowy → Ik1_min za niski, nie spełnia."""
    enm = _enm(
        cable_length_km=2.0,
        catalog_namespace="APARAT_NN_MCB",
        materialized_params={"in_a": 63.0, "curve_class": "C"},
    )
    view = build_swz_view(enm, "stn", "b1", "ap1")
    assert view["status"] == "OK"
    assert view["swz"]["status"] == "nie spełnia"
    assert view["swz"]["ik1_min_a"] < view["swz"]["ia_wymagane_a"]


def test_swz_nierozstrzygalne_gg_fuse() -> None:
    """Wkładka gG (WKLADKA_NN) → NIEROZSTRZYGALNE (G-D2 puste)."""
    enm = _enm(
        cable_length_km=0.05,
        catalog_namespace="WKLADKA_NN",
        materialized_params={"in_a": 25.0, "fuse_class": "gG"},
        branch_kind="fuse",
    )
    view = build_swz_view(enm, "stn", "b1", "ap1")
    assert view["status"] == "OK"
    assert view["swz"]["status"] == "nierozstrzygalne"
    assert view["swz"]["ia_wymagane_a"] is None


def test_swz_missing_breaker_catalog_binding_is_honest() -> None:
    enm = _enm(cable_length_km=0.05, catalog_namespace="APARAT_NN_MCB", materialized_params=None)
    view = build_swz_view(enm, "stn", "b1", "ap1")
    assert view["status"] == "brak danych"
    assert "breaker_catalog_binding" in view["missing_data"]


def test_swz_unknown_breaker_ref_is_honest() -> None:
    enm = _enm(
        cable_length_km=0.05,
        catalog_namespace="APARAT_NN_MCB",
        materialized_params={"in_a": 16.0, "curve_class": "B"},
    )
    view = build_swz_view(enm, "stn", "b1", "nieistniejacy")
    assert view["status"] == "brak danych"
    assert "breaker" in view["missing_data"]


def test_swz_it_system_not_applicable() -> None:
    enm = _enm(
        cable_length_km=0.05,
        catalog_namespace="APARAT_NN_MCB",
        materialized_params={"in_a": 16.0, "curve_class": "B"},
    )
    enm.substations[0].meta["nn_earthing_system"] = "IT"
    view = build_swz_view(enm, "stn", "b1", "ap1")
    assert view["status"] == "nie dotyczy"


def test_swz_determinism_two_runs_identical() -> None:
    enm = _enm(
        cable_length_km=0.05,
        catalog_namespace="APARAT_NN_MCB",
        materialized_params={"in_a": 16.0, "curve_class": "B"},
    )
    a = build_swz_view(enm, "stn", "b1", "ap1")
    b = build_swz_view(enm, "stn", "b1", "ap1")
    assert a == b


class TestSwzInstalledMccbKartaD2:
    """Karta D2 (nN, „runda 8", 2026-08-14): `_aparat_from_branch` mapuje
    zainstalowany aparat namespace APARAT_NN (device_kind WYLACZNIK_GLOWNY/
    WYLACZNIK_ODPLYWOWY) na typ='MCCB' z Ii resolwowanym z ir_range/isd_range/
    ii_range materializacji — PRZED tą kartą KAŻDY zainstalowany MCCB dawał
    NIEROZSTRZYGALNE mimo istniejącej gałęzi karty D1 (fantom mapowania)."""

    def test_installed_mccb_spelnia_decisive_not_nierozstrzygalne(self) -> None:
        """Krótki obwód (50 m, ta sama trasa co MCB B16 'spełnia' powyżej) +
        MCCB In=25A, ii_range=(2,3)×In ⇒ Ii resolwowany=75A (górny kraniec,
        worst-case) — łańcuch materializacji: i_n_a/ii_range → ii_a=75A →
        SWZ decyzyjny (nie fantom)."""
        enm = _enm(
            cable_length_km=0.05,
            catalog_namespace="APARAT_NN",
            materialized_params={
                "i_n_a": 25.0,
                "device_kind": "WYLACZNIK_GLOWNY",
                "ir_range": [1.0, 1.0],
                "isd_range": None,
                "ii_range": [2.0, 3.0],
            },
        )
        view = build_swz_view(enm, "stn", "b1", "ap1")
        assert view["status"] == "OK", view
        assert view["swz"]["status"] == "spełnia"
        assert view["swz"]["ia_wymagane_a"] == pytest.approx(
            75.0
        ), "Pin łańcucha materializacji: Ii = ii_range[górny]×In = 3,0×25 = 75 A"
        assert view["swz"]["ik1_min_a"] > view["swz"]["ia_wymagane_a"]

    def test_installed_mccb_nie_spelnia_decisive_not_nierozstrzygalne(self) -> None:
        """Długi obwód (2 km, ta sama trasa co MCB C63 'nie spełnia' powyżej)
        + MCCB In=63A, ii_range=(5,10)×In ⇒ Ii=630A (tożsame z Ia MCB C63,
        ten sam wniosek fizyczny) — decyzyjny 'nie spełnia', nie fantom."""
        enm = _enm(
            cable_length_km=2.0,
            catalog_namespace="APARAT_NN",
            materialized_params={
                "i_n_a": 63.0,
                "device_kind": "WYLACZNIK_ODPLYWOWY",
                "ir_range": [1.0, 1.0],
                "isd_range": None,
                "ii_range": [5.0, 10.0],
            },
        )
        view = build_swz_view(enm, "stn", "b1", "ap1")
        assert view["status"] == "OK", view
        assert view["swz"]["status"] == "nie spełnia"
        assert view["swz"]["ia_wymagane_a"] == pytest.approx(630.0)
        assert view["swz"]["ik1_min_a"] < view["swz"]["ia_wymagane_a"]

    def test_installed_mccb_missing_ii_range_honest_nierozstrzygalne(self) -> None:
        """MCCB zainstalowany, ale katalog nie niesie ii_range (starszy rekord
        bez nastaw) — NIEROZSTRZYGALNE uczciwe (zero fabrykacji domyślnej
        nastawy), NIE crash, i NIE 'spełnia' na ślepo."""
        enm = _enm(
            cable_length_km=0.05,
            catalog_namespace="APARAT_NN",
            materialized_params={"i_n_a": 25.0, "device_kind": "WYLACZNIK_GLOWNY"},
        )
        view = build_swz_view(enm, "stn", "b1", "ap1")
        assert view["status"] == "OK", view
        assert view["swz"]["status"] == "nierozstrzygalne"
        assert view["swz"]["ia_wymagane_a"] is None

    def test_rozlacznik_bezpiecznikowy_bez_wkladki_honest_brak_danych(self) -> None:
        """Rozłącznik bezpiecznikowy (namespace APARAT_NN, device_kind
        ROZLACZNIK_BEZPIECZNIKOWY) wskazany WPROST jako breaker_ref, bez
        osobnej gałęzi wkładki — korpus sam w sobie nie ma charakterystyki
        I-t, więc SWZ 'brak wkładki' — uczciwe brak danych, nie fabrykacja."""
        enm = _enm(
            cable_length_km=0.05,
            catalog_namespace="APARAT_NN",
            materialized_params={"i_n_a": 100.0, "device_kind": "ROZLACZNIK_BEZPIECZNIKOWY"},
        )
        view = build_swz_view(enm, "stn", "b1", "ap1")
        assert view["status"] == "brak danych"
        assert "breaker_catalog_binding" in view["missing_data"]
        assert "wkładki" in (view.get("reason_pl") or "")

    def test_installed_mccb_determinism(self) -> None:
        enm = _enm(
            cable_length_km=0.05,
            catalog_namespace="APARAT_NN",
            materialized_params={
                "i_n_a": 25.0,
                "device_kind": "WYLACZNIK_GLOWNY",
                "ii_range": [2.0, 3.0],
            },
        )
        a = build_swz_view(enm, "stn", "b1", "ap1")
        b = build_swz_view(enm, "stn", "b1", "ap1")
        assert a == b
