"""Testy orkiestracji wejścia LV_CIRCUIT_VERIFICATION (karta P0.10, G-21).

Pokrywa: rezolucję urządzenia z gałęzi ENM jako ILOCZYN CECH (namespace ×
kompletność danych katalogowych), reużycie DOKŁADNIE tej samej fizyki pętli
zwarcia/SWZ co P0.6 (`swz.service`/`fault_loop.service`), uczciwe stany
„brak danych" (stacja/transformator/upstream/trasa/aparat), determinizm
dwóch wywołań na tym samym modelu."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from application.proof_engine.lv_circuit_verification_binding import (
    resolve_urzadzenie_ochronne,
    zbuduj_wejscie_dowodu_obwodu_nn,
)
from application.proof_engine.packs.lv_circuit_verification import (
    KIND_FUSE_SWITCH,
    KIND_MCB,
    KIND_MCCB,
    LVCircuitVerificationInput,
)
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
from network_model.solvers.cable_ampacity_derating import wspolczynniki_nn
from network_model.solvers.conductor_thermal_withstand import (
    ConductorThermalInput,
    check_conductor_thermal_withstand,
)


def _enm(
    *,
    branches_extra: list | None = None,
    earthing_system: str = "TN-C-S",
) -> EnergyNetworkModel:
    branches: list = [
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
        )
    ]
    branches.extend(branches_extra or [])
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
        branches=branches,
        substations=[
            Substation(
                ref_id="stn",
                name="S",
                station_type="mv_lv",
                bus_refs=["nn"],
                transformer_refs=["tr"],
                meta={"nn_earthing_system": earthing_system},
            )
        ],
    )


def _thermal() -> object:
    return check_conductor_thermal_withstand(
        ConductorThermalInput(
            ith_a=200.0,
            fault_duration_s=0.1,
            ith_1s_a=6000.0,
            cross_section_mm2=120.0,
            jth_1s_a_per_mm2=50.0,
        )
    )


def _wspolczynniki():
    return wspolczynniki_nn(
        srodowisko="powietrze", izolacja="PVC", temperatura_c=30.0, liczba_obwodow=1
    )


def _wywolaj(enm, **kwargs) -> dict:
    return zbuduj_wejscie_dowodu_obwodu_nn(
        enm=enm,
        station_ref="stn",
        bus_ref="b1",
        breaker_ref="ap1",
        segment_ref="c1",
        project_name="P",
        case_name="C",
        run_timestamp=datetime(2026, 8, 14, tzinfo=UTC),
        solver_version="v1",
        p_mw=0.005,
        q_mvar=0.002,
        u_ll_kv=0.4,
        iz_katalogowe_a=100.0,
        wspolczynniki=_wspolczynniki(),
        ik_max_ka=5.0,
        thermal=_thermal(),
        vdrop_u_source_kv=0.4,
        vdrop_delta_u_total_kv=0.005,
        vdrop_delta_u_total_percent=1.25,
        **kwargs,
    )


# =============================================================================
# Rezolucja urządzenia — ILOCZYN CECH (namespace × kompletność danych)
# =============================================================================


def test_mcb_kompletny_rozwiazuje_sie_poprawnie() -> None:
    branch = SwitchBranch(
        ref_id="ap1",
        name="AP1",
        type="breaker",
        from_bus_ref="b1",
        to_bus_ref="b2",
        catalog_namespace="APARAT_NN_MCB",
        materialized_params={"in_a": 16.0, "curve_class": "B", "icn_ka": 6.0},
    )
    urzadzenie, powod = resolve_urzadzenie_ochronne(branch)
    assert urzadzenie is not None and powod is None
    assert urzadzenie.kind == KIND_MCB
    assert urzadzenie.in_a == 16.0
    assert urzadzenie.klasa_mcb == "B"
    assert urzadzenie.wlasna_zdolnosc_ka == 6.0


def test_mcb_bez_icn_daje_wlasna_zdolnosc_none_nie_blad() -> None:
    branch = SwitchBranch(
        ref_id="ap1",
        name="AP1",
        type="breaker",
        from_bus_ref="b1",
        to_bus_ref="b2",
        catalog_namespace="APARAT_NN_MCB",
        materialized_params={"in_a": 16.0, "curve_class": "B"},
    )
    urzadzenie, powod = resolve_urzadzenie_ochronne(branch)
    assert urzadzenie is not None
    assert urzadzenie.wlasna_zdolnosc_ka is None


def test_mcb_bez_kompletu_danych_jest_uczciwie_odrzucany() -> None:
    branch = SwitchBranch(
        ref_id="ap1",
        name="AP1",
        type="breaker",
        from_bus_ref="b1",
        to_bus_ref="b2",
        catalog_namespace="APARAT_NN_MCB",
        materialized_params={"in_a": 16.0},
    )
    urzadzenie, powod = resolve_urzadzenie_ochronne(branch)
    assert urzadzenie is None
    assert powod is not None


def test_wkladka_bez_wskazanego_rozlacznika_daje_conditional_none() -> None:
    """Wkładka bez `apparatus_branch` — kombinacja NIEROZSTRZYGALNA (zero fabrykacji,
    nie przyjmujemy zgadniętej wartości kombinacji bez wskazania korpusu)."""
    branch = FuseBranch(
        ref_id="ap1",
        name="AP1",
        from_bus_ref="b1",
        to_bus_ref="b2",
        catalog_namespace="WKLADKA_NN",
        materialized_params={"in_a": 25.0, "fuse_class": "gG"},
    )
    urzadzenie, powod = resolve_urzadzenie_ochronne(branch)
    assert urzadzenie is not None and powod is None
    assert urzadzenie.kind == KIND_FUSE_SWITCH
    assert urzadzenie.in_a == 25.0
    assert urzadzenie.conditional_sc_current_ka is None


def test_wkladka_ze_wskazanym_rozlacznikiem_niesie_conditional_z_korpusu() -> None:
    wkladka = FuseBranch(
        ref_id="ap1",
        name="AP1",
        from_bus_ref="b1",
        to_bus_ref="b2",
        catalog_namespace="WKLADKA_NN",
        materialized_params={"in_a": 25.0, "fuse_class": "gG"},
    )
    korpus = SwitchBranch(
        ref_id="ap0",
        name="Korpus",
        type="breaker",
        from_bus_ref="b0",
        to_bus_ref="b1",
        catalog_namespace="APARAT_NN",
        materialized_params={
            "i_n_a": 63.0,
            "device_kind": "ROZLACZNIK_BEZPIECZNIKOWY",
            "conditional_sc_current_ka": 50.0,
        },
    )
    urzadzenie, powod = resolve_urzadzenie_ochronne(wkladka, apparatus_branch=korpus)
    assert urzadzenie is not None and powod is None
    assert urzadzenie.conditional_sc_current_ka == 50.0
    # in_a NADAL pochodzi z wkładki (ona ogranicza prąd obwodu, nie korpus)
    assert urzadzenie.in_a == 25.0


def test_rozlacznik_bezpiecznikowy_bezposrednio_jako_breaker_niesie_wlasny_conditional() -> None:
    """Rozłącznik bezpiecznikowy wskazany WPROST jako breaker_ref (bez osobnej
    wkładki) — conditional_sc_current_ka z TEJ SAMEJ gałęzi (własność typu)."""
    branch = SwitchBranch(
        ref_id="ap1",
        name="AP1",
        type="breaker",
        from_bus_ref="b1",
        to_bus_ref="b2",
        catalog_namespace="APARAT_NN",
        materialized_params={
            "i_n_a": 63.0,
            "device_kind": "ROZLACZNIK_BEZPIECZNIKOWY",
            "conditional_sc_current_ka": 50.0,
        },
    )
    urzadzenie, powod = resolve_urzadzenie_ochronne(branch)
    assert urzadzenie is not None and powod is None
    assert urzadzenie.kind == KIND_FUSE_SWITCH
    assert urzadzenie.conditional_sc_current_ka == 50.0
    assert urzadzenie.wlasna_zdolnosc_ka is None  # NIE_DOTYCZY wymuszone przez kind


def test_rozlacznik_bezpiecznikowy_bez_wkladki_daje_conditional_none() -> None:
    branch = SwitchBranch(
        ref_id="ap1",
        name="AP1",
        type="breaker",
        from_bus_ref="b1",
        to_bus_ref="b2",
        catalog_namespace="APARAT_NN",
        materialized_params={"i_n_a": 63.0, "device_kind": "ROZLACZNIK_BEZPIECZNIKOWY"},
    )
    urzadzenie, powod = resolve_urzadzenie_ochronne(branch)
    assert urzadzenie is not None
    assert urzadzenie.conditional_sc_current_ka is None


def test_mccb_rozwiazuje_sie_z_i_cu_ka() -> None:
    branch = SwitchBranch(
        ref_id="ap1",
        name="AP1",
        type="breaker",
        from_bus_ref="b1",
        to_bus_ref="b2",
        catalog_namespace="APARAT_NN",
        materialized_params={"i_n_a": 400.0, "device_kind": "WYLACZNIK_GLOWNY", "i_cu_ka": 50.0},
    )
    urzadzenie, powod = resolve_urzadzenie_ochronne(branch)
    assert urzadzenie is not None and powod is None
    assert urzadzenie.kind == KIND_MCCB
    assert urzadzenie.wlasna_zdolnosc_ka == 50.0
    assert urzadzenie.conditional_sc_current_ka is None
    assert (
        urzadzenie.ii_a is None
    ), "Bez ii_range w materialized_params — brak nastawy, nie fabrykacja"


def test_mccb_z_zakresem_nastaw_rozwiazuje_ii_a() -> None:
    """Karta D2 (nN, „runda 8", 2026-08-14): Ii resolwowany z ii_range
    materializacji (górny kraniec, worst-case — REUSE
    `lv_mccb_settings_iec60947_2.resolwuj_nastawy_mccb`). Bez tego krok 10
    SWZ pakietu dostawał `ii_a=None` dla KAŻDEGO zainstalowanego MCCB."""
    branch = SwitchBranch(
        ref_id="ap1",
        name="AP1",
        type="breaker",
        from_bus_ref="b1",
        to_bus_ref="b2",
        catalog_namespace="APARAT_NN",
        materialized_params={
            "i_n_a": 400.0,
            "device_kind": "WYLACZNIK_GLOWNY",
            "i_cu_ka": 50.0,
            "ir_range": [0.4, 1.0],
            "isd_range": [1.5, 10.0],
            "ii_range": [1.5, 15.0],
        },
    )
    urzadzenie, powod = resolve_urzadzenie_ochronne(branch)
    assert urzadzenie is not None and powod is None
    assert urzadzenie.kind == KIND_MCCB
    assert urzadzenie.ii_a == 6000.0, "Ii = ii_range[górny]×In = 15,0×400 = 6000 A"


def test_brak_materialized_params_jest_uczciwie_odrzucany() -> None:
    branch = SwitchBranch(
        ref_id="ap1",
        name="AP1",
        type="breaker",
        from_bus_ref="b1",
        to_bus_ref="b2",
        catalog_namespace="APARAT_NN_MCB",
        materialized_params=None,
    )
    urzadzenie, powod = resolve_urzadzenie_ochronne(branch)
    assert urzadzenie is None
    assert "materialized_params" in (powod or "") or "katalogow" in (powod or "").lower()


def test_nieznany_namespace_jest_uczciwie_odrzucany() -> None:
    branch = SwitchBranch(
        ref_id="ap1",
        name="AP1",
        type="breaker",
        from_bus_ref="b1",
        to_bus_ref="b2",
        catalog_namespace="COS_INNEGO",
        materialized_params={"x": 1},
    )
    urzadzenie, powod = resolve_urzadzenie_ochronne(branch)
    assert urzadzenie is None
    assert powod is not None


# =============================================================================
# Orkiestracja end-to-end — reuse fizyki P0.6
# =============================================================================


def _mcb_branch() -> SwitchBranch:
    return SwitchBranch(
        ref_id="ap1",
        name="AP1",
        type="breaker",
        from_bus_ref="b1",
        to_bus_ref="b2",
        catalog_namespace="APARAT_NN_MCB",
        materialized_params={"in_a": 16.0, "curve_class": "B", "icn_ka": 6.0},
    )


def test_orkiestracja_ok_daje_pelne_wejscie_pakietu() -> None:
    enm = _enm(branches_extra=[_mcb_branch()])
    wynik = _wywolaj(enm)
    assert wynik["status"] == "OK"
    assert isinstance(wynik["wejscie"], LVCircuitVerificationInput)
    assert wynik["wejscie"].urzadzenie.kind == KIND_MCB
    assert wynik["wejscie"].fault_loop.ik_min_a > 0
    assert wynik["wejscie"].swz_status in ("spełnia", "nie spełnia", "nierozstrzygalne")


def _mccb_branch() -> SwitchBranch:
    return SwitchBranch(
        ref_id="ap1",
        name="AP1",
        type="breaker",
        from_bus_ref="b1",
        to_bus_ref="b2",
        catalog_namespace="APARAT_NN",
        materialized_params={
            "i_n_a": 25.0,
            "device_kind": "WYLACZNIK_GLOWNY",
            "i_cu_ka": 25.0,
            "ir_range": [1.0, 1.0],
            "ii_range": [2.0, 3.0],
        },
    )


def test_orkiestracja_mccb_zainstalowany_daje_swz_decyzyjny_karta_d2() -> None:
    """Karta D2 (nN, „runda 8", 2026-08-14): MCCB zainstalowany (namespace
    APARAT_NN, device_kind WYLACZNIK_GLOWNY) z ii_range w materializacji →
    krok 10 SWZ pakietu jest DECYZYJNY (spełnia/nie spełnia), NIE
    bezwarunkowo nierozstrzygalny — dowód end-to-end łańcucha materializacji
    → resolve_urzadzenie_ochronne → ocen_swz."""
    enm = _enm(branches_extra=[_mccb_branch()])
    wynik = _wywolaj(enm)
    assert wynik["status"] == "OK"
    assert wynik["wejscie"].urzadzenie.kind == KIND_MCCB
    assert wynik["wejscie"].urzadzenie.ii_a == 75.0  # 3,0×25 A (górny kraniec ii_range)
    assert wynik["wejscie"].swz_status in ("spełnia", "nie spełnia"), (
        "Ii resolwowany z ii_range MUSI dać werdykt SWZ decyzyjny na krótkim "
        f"obwodzie (50 m) — otrzymano: {wynik['wejscie'].swz_status}"
    )
    assert wynik["wejscie"].swz_ia_wymagane_a == pytest.approx(75.0)


def test_orkiestracja_nieznany_breaker_jest_uczciwa() -> None:
    enm = _enm(branches_extra=[_mcb_branch()])
    wynik = zbuduj_wejscie_dowodu_obwodu_nn(
        enm=enm,
        station_ref="stn",
        bus_ref="b1",
        breaker_ref="brak-takiego",
        segment_ref="c1",
        project_name="P",
        case_name="C",
        run_timestamp=datetime(2026, 8, 14, tzinfo=UTC),
        solver_version="v1",
        p_mw=0.005,
        q_mvar=0.002,
        u_ll_kv=0.4,
        iz_katalogowe_a=100.0,
        wspolczynniki=_wspolczynniki(),
        ik_max_ka=5.0,
        thermal=_thermal(),
        vdrop_u_source_kv=0.4,
        vdrop_delta_u_total_kv=0.005,
    )
    assert wynik["status"] == "brak danych"
    assert "breaker" in wynik["missing_data"]


def test_orkiestracja_it_system_nie_dotyczy_jest_uczciwa() -> None:
    enm = _enm(branches_extra=[_mcb_branch()], earthing_system="IT")
    wynik = _wywolaj(enm)
    assert wynik["status"] == "brak danych"
    assert wynik["reason_pl"] is not None
    assert "IT" in wynik["reason_pl"]


def test_orkiestracja_determinizm_dwa_wywolania_identyczne() -> None:
    enm = _enm(branches_extra=[_mcb_branch()])
    w1 = _wywolaj(enm)
    w2 = _wywolaj(enm)
    assert w1["status"] == w2["status"] == "OK"
    d1 = w1["wejscie"]
    d2 = w2["wejscie"]
    assert d1.fault_loop.ik_min_a == d2.fault_loop.ik_min_a
    assert d1.swz_status == d2.swz_status
    assert d1.swz_ia_wymagane_a == d2.swz_ia_wymagane_a
