"""Karta W5-D: bieg `rozplyw_niesymetryczny` przez JEDYNY dyspozytor (`_wykonaj_analize_biegu`).

Iloczyn cech odmów (KLASA NIE INSTANCJA) — każda granica solvera FROZEN BFS ma kod
kanonu zgłaszany PARAMI: przez assembler (`OdmowaWejsciaRozplywu.kod`) i przez
gotowość „Asymetria" (`_check_asymmetry`, ta sama `diagnoza_niesymetrii`):
{oczko (łącznik równoległy), brak R0/X0, brak grupy połączeń, odbiór AB, odbiór 1-f za
transformatorem Yy (brak drogi I0), węzeł PV, bateria kondensatorów, odbiór ZIP,
zaczep poza znamionowym, regulacja falownika}.

Determinizm: dwa biegi tej samej migawki dają `raw_result` i ślad bit w bit.
Fizyka odbioru 1-f: prąd w fazie A, zero w B/C, VUF > 0 na szynie nN, |U_A| < |U_B|,|U_C|.
"""

from __future__ import annotations

import copy
import json
import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from application.calculation_readiness.service import _check_asymmetry
from enm.assembler import (
    KOD_NIESYMETRIA_BRAK_DROGI_ZEROWEJ,
    KOD_NIESYMETRIA_BRAK_GRUPY_TR,
    KOD_NIESYMETRIA_BRAK_Z0_GALEZI,
    KOD_NIESYMETRIA_ELEMENT,
    KOD_NIESYMETRIA_FAZY_ODBIORU,
    KOD_NIESYMETRIA_NIERADIALNA,
    KOD_ZALOZENIE_ADMITANCJA_POPRZECZNA,
    KOD_ZALOZENIE_DROGA_ZEROWA_ZAMKNIETA,
    KOD_ZALOZENIE_DROGA_ZEROWA_ZRODLO,
    KOD_ZALOZENIE_GALAZ_MAGNESUJACA,
    KOD_ZALOZENIE_STRATY_Z_IMPEDANCJI_WLASNEJ,
    KOD_ZALOZENIE_TR_SZEREGOWY,
    OdmowaWejsciaRozplywu,
    diagnoza_niesymetrii,
    zloz_wejscie_rozplywu_niesymetrycznego,
)
from enm.canonical_analysis import (
    ANALYSIS_TYPE_ROZPLYW_NIESYMETRYCZNY,
    CanonicalRun,
    _wykonaj_analize_biegu,
    build_execution_result_set,
    build_power_flow_unbalanced_results,
    build_results_index,
)
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    Load,
    ShuntCapacitor,
    Source,
    SwitchBranch,
    TapChanger,
    Transformer,
)


def siec(
    *,
    fazy: str | None = "A",
    oczko: bool = False,
    z0: bool = True,
    vector_group: str | None = "Dyn11",
    zaczep: int | None = None,
    tap_changer: TapChanger | None = None,
    b_siemens: float | None = None,
    p0_kw: float | None = None,
    generatory: list[Generator] | None = None,
    baterie: list[ShuntCapacitor] | None = None,
    zip_params: dict[str, Any] | None = None,
    druga_wyspa: bool = False,
    szyna_odbioru: str = "b_nn",
    trafo_gpz: str | None = None,
) -> EnergyNetworkModel:
    """GPZ 15 kV → kabel 2 km → stacja SN → TR Dyn11 630 kVA → szyna nN z odbiorem.

    ``szyna_odbioru``: szyna odbioru ``ld1`` (``b_nn`` za transformatorem albo ``b_sn``
    wprost na SN — droga I0 przez kabel do źródła). ``trafo_gpz``: grupa połączeń
    transformatora 110/15 kV nad GPZ (źródło przenosi się na szynę 110 kV) — klasa
    „transformator powyżej punktu zamknięcia I0".
    """
    buses = [
        Bus(ref_id="b_gpz", name="GPZ 15 kV", voltage_kv=15.0),
        Bus(ref_id="b_sn", name="Stacja SN", voltage_kv=15.0),
        Bus(ref_id="b_nn", name="Szyna nN", voltage_kv=0.4),
    ]
    szyna_zrodla = "b_gpz"
    if trafo_gpz is not None:
        buses.insert(0, Bus(ref_id="b_hv", name="Szyna 110 kV", voltage_kv=110.0))
        szyna_zrodla = "b_hv"
    sources = [
        Source(
            ref_id="src",
            name="System",
            bus_ref=szyna_zrodla,
            model="short_circuit_power",
            sk3_mva=2500.0 if trafo_gpz is not None else 250.0,
            rx_ratio=0.1,
        )
    ]
    branches: list[Any] = [
        Cable(
            ref_id="cab1",
            name="Kabel 1",
            from_bus_ref="b_gpz",
            to_bus_ref="b_sn",
            length_km=2.0,
            r_ohm_per_km=0.253,
            x_ohm_per_km=0.1,
            b_siemens_per_km=b_siemens,
            r0_ohm_per_km=0.759 if z0 else None,
            x0_ohm_per_km=0.3 if z0 else None,
        )
    ]
    if oczko:
        branches.append(
            SwitchBranch(
                ref_id="sw_rown",
                name="Sprzeglo",
                from_bus_ref="b_gpz",
                to_bus_ref="b_sn",
                type="breaker",
                status="closed",
            )
        )
    loads = [
        Load(
            ref_id="ld1", name="Odbior", bus_ref=szyna_odbioru, p_mw=0.05, q_mvar=0.015, phases=fazy
        )
    ]
    if zip_params is not None:
        loads[0] = Load(
            ref_id="ld1",
            name="Odbior",
            bus_ref=szyna_odbioru,
            p_mw=0.05,
            q_mvar=0.015,
            phases=fazy,
            model="zip",
            materialized_params=zip_params,
        )
    if druga_wyspa:
        buses.append(Bus(ref_id="b_wyspa", name="Wyspa bez zrodla", voltage_kv=15.0))
        loads.append(
            Load(ref_id="ld_wyspa", name="Odbior wyspy", bus_ref="b_wyspa", p_mw=0.1, q_mvar=0.02)
        )
    transformatory_gpz = (
        []
        if trafo_gpz is None
        else [
            Transformer(
                ref_id="tr_gpz",
                name="TR 110/15",
                hv_bus_ref="b_hv",
                lv_bus_ref="b_gpz",
                sn_mva=25.0,
                uhv_kv=110.0,
                ulv_kv=15.0,
                uk_percent=12.0,
                pk_kw=120.0,
                vector_group=trafo_gpz,
            )
        ]
    )
    return EnergyNetworkModel(
        header=ENMHeader(name="w5d-bieg"),
        buses=buses,
        sources=sources,
        branches=branches,
        transformers=transformatory_gpz
        + [
            Transformer(
                ref_id="tr1",
                name="TR 15/0,4",
                hv_bus_ref="b_sn",
                lv_bus_ref="b_nn",
                sn_mva=0.63,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.5,
                pk_kw=6.5,
                p0_kw=p0_kw,
                vector_group=vector_group,
                tap_position=zaczep,
                tap_changer=tap_changer,
            )
        ],
        loads=loads,
        generators=generatory or [],
        shunt_capacitors=baterie or [],
    )


def bieg(enm: EnergyNetworkModel, **options: Any) -> CanonicalRun:
    return CanonicalRun(
        id=uuid.UUID("00000000-0000-0000-0000-00000000w5d0".replace("w5d", "a5d")),
        case_id="w5d",
        project_id="w5d",
        analysis_type=ANALYSIS_TYPE_ROZPLYW_NIESYMETRYCZNY,
        status="RUNNING",
        created_at=datetime(2026, 9, 16, tzinfo=UTC),
        snapshot_hash="snap",
        input_hash="in",
        snapshot=enm.model_dump(mode="json"),
        validation={},
        readiness={},
        options=dict(options),
    )


def _kanon(dane: Any) -> str:
    return json.dumps(dane, sort_keys=True, default=str, separators=(",", ":"))


# ---------------------------------------------------------------------------
# Bieg poprawny: fizyka odbioru 1-f, kontrakt wyniku, ślad, determinizm
# ---------------------------------------------------------------------------


def test_bieg_odbioru_jednofazowego_daje_prad_w_jednej_fazie_i_vuf() -> None:
    run = bieg(siec(fazy="A"))
    _wykonaj_analize_biegu(run)
    rv = run.raw_result["result_v1"]
    assert rv["schema_version"] == "power-flow-unbalanced-v1"
    assert rv["converged"] is True
    szyny = {b["element_id"]: b for b in rv["bus_results"]}
    nn = szyny["b_nn"]
    assert (
        nn["faza_a"]["u_pu"] < nn["faza_b"]["u_pu"] and nn["faza_a"]["u_pu"] < nn["faza_c"]["u_pu"]
    )
    assert nn["voltage_unbalance_factor_pct"] > 0.0
    assert szyny["b_gpz"]["voltage_unbalance_factor_pct"] == 0.0
    galezie = {g["element_id"]: g for g in rv["branch_results"]}
    assert galezie["cab1"]["faza_a"]["i_a"] > 5.0
    assert galezie["cab1"]["faza_b"]["i_a"] == 0.0 and galezie["cab1"]["faza_c"]["i_a"] == 0.0
    # kV fazy = u_pu · Un/√3 (0,4 kV → 0,2309 kV przy 1 pu); kontrakt zaokrągla do 6 miejsc.
    assert nn["faza_b"]["u_kv"] == pytest.approx(nn["faza_b"]["u_pu"] * 0.4 / 3**0.5, abs=1e-6)
    assert rv["summary"]["max_voltage_unbalance_bus_id"] == nn["bus_id"]
    # Droga I0 odbioru nN zamyka się w Dyn11 (tr1); kabel powyżej niesie I0 tylko jako
    # artefakt modelu szeregowego → Z_m := 0 z założeniem NAZWANYM (nie straty: Z_m = 0
    # dla obu krawędzi, więc formuła strat z impedancji własnej jest dokładna).
    assert [z["kod"] for z in rv["zalozenia"]] == [
        KOD_ZALOZENIE_TR_SZEREGOWY,
        KOD_ZALOZENIE_DROGA_ZEROWA_ZAMKNIETA,
    ]
    assert rv["zalozenia"][1]["elementy"] == ["cab1"]
    droga = next(
        k for k in run.white_box_trace if k["key"] == "pf_unbalanced_zero_sequence_path[ld1]"
    )
    assert droga["result"] == {"zamkniecie": "tr1", "rodzaj": "transformator"}
    kabel = next(k for k in run.white_box_trace if k["key"] == "pf_unbalanced_branch[cab1]")
    assert (
        kabel["inputs"]["z0_ohm"] is None
        and "artefaktem modelu szeregowego" in kabel["substitution"]
    )
    assert run.raw_result["quality_status"] == "accepted"
    assert run.raw_result["dopuszczalnosc_raportowa"] is True
    assert run.power_flow_trace is None


def test_slad_white_box_niesie_wzor_dane_podstawienie_wynik_dla_kazdej_galezi() -> None:
    # Odbiór faza–N WPROST na szynie SN: droga I0 = kabel → źródło, więc Z0 kabla wchodzi
    # do równań (Z_s, Z_m ze składowych) i ślad niesie pełne podstawienie.
    run = bieg(siec(fazy="A", szyna_odbioru="b_sn"))
    _wykonaj_analize_biegu(run)
    klucze = [krok["key"] for krok in run.white_box_trace]
    assert "pf_unbalanced_branch[cab1]" in klucze and "pf_unbalanced_branch[tr1]" in klucze
    assert "pf_unbalanced_load[ld1]" in klucze and "pf_unbalanced_base[src]" in klucze
    assert "pf_unbalanced_zero_sequence_path[ld1]" in klucze
    assert klucze[-1].startswith("pf_unbalanced_iterations[")
    droga = next(
        k for k in run.white_box_trace if k["key"] == "pf_unbalanced_zero_sequence_path[ld1]"
    )
    assert droga["result"] == {"zamkniecie": "src", "rodzaj": "zrodlo"}
    assert [z["kod"] for z in run.raw_result["zalozenia"]] == [
        KOD_ZALOZENIE_TR_SZEREGOWY,
        KOD_ZALOZENIE_DROGA_ZEROWA_ZRODLO,
        KOD_ZALOZENIE_STRATY_Z_IMPEDANCJI_WLASNEJ,
    ]
    assert run.raw_result["zalozenia"][1]["elementy"] == ["src"]
    assert run.raw_result["zalozenia"][2]["elementy"] == ["cab1"]
    kabel = next(k for k in run.white_box_trace if k["key"] == "pf_unbalanced_branch[cab1]")
    assert "Z_s = \\frac{Z_0 + 2 Z_1}{3}" in kabel["formula_latex"]
    assert kabel["inputs"]["r0_ohm_per_km"] == 0.759 and kabel["inputs"]["length_km"] == 2.0
    assert "Z_s = (" in kabel["substitution"] and "Z_m = (" in kabel["substitution"]
    z_s, z_m = kabel["result"]["z_self_ohm"], kabel["result"]["z_mutual_ohm"]
    z1, z0 = complex(0.253, 0.1) * 2.0, complex(0.759, 0.3) * 2.0
    # Liczby zespolone w kolumnie JSON biegu jako {re, im} (jak z1/z2/z0_ohm zwarcia).
    oczekiwane_zs, oczekiwane_zm = (z0 + 2.0 * z1) / 3.0, (z0 - z1) / 3.0
    assert z_s == {"re": oczekiwane_zs.real, "im": oczekiwane_zs.imag}
    assert z_m == {"re": oczekiwane_zm.real, "im": oczekiwane_zm.imag}
    assert all(k["method_basis"] == "PF_UNBALANCED_BFS_V1" for k in run.white_box_trace)
    assert json.dumps(run.white_box_trace)  # serializowalny bez `default=`


def test_dwa_biegi_tej_samej_migawki_sa_bit_w_bit() -> None:
    enm = siec(fazy="B")
    pierwszy, drugi = bieg(enm), bieg(enm)
    _wykonaj_analize_biegu(pierwszy)
    _wykonaj_analize_biegu(drugi)
    assert _kanon(pierwszy.raw_result) == _kanon(drugi.raw_result)
    assert _kanon(pierwszy.white_box_trace) == _kanon(drugi.white_box_trace)
    assert (
        build_execution_result_set(_zakonczony(pierwszy))["deterministic_signature"]
        == build_execution_result_set(_zakonczony(drugi))["deterministic_signature"]
    )


def _zakonczony(run: CanonicalRun) -> CanonicalRun:
    run.status = "FINISHED"
    return run


def test_projekcje_wyniku_indeks_wiersze_resultset() -> None:
    run = bieg(siec(fazy="C"))
    _wykonaj_analize_biegu(run)
    indeks = build_results_index(run)
    assert [t["table_id"] for t in indeks["tables"]] == [
        "buses_unbalanced",
        "branches_unbalanced",
        "trace",
    ]
    assert indeks["run_header"]["solver_kind"] == "PF_UNBALANCED"
    wiersze = build_power_flow_unbalanced_results(run)
    assert len(wiersze["buses"]) == 3 and len(wiersze["branches"]) == 2
    assert wiersze["summary"]["solved_bus_count"] == 3
    zestaw = build_execution_result_set(_zakonczony(run))
    assert zestaw["analysis_type"] == "PF_UNBALANCED"
    typy = {e["element_type"] for e in zestaw["element_results"]}
    assert typy == {"Bus", "Branch"}
    assert zestaw["global_results"]["analysis_type"] == "load_flow_unbalanced"
    assert zestaw["global_results"]["converged"] is True


def test_bieg_innego_rodzaju_daje_puste_wiersze_niesymetrii() -> None:
    run = bieg(siec())
    run.analysis_type = "PF"
    assert build_power_flow_unbalanced_results(run) == {
        "run_id": str(run.id),
        "buses": [],
        "branches": [],
        "summary": None,
    }


# ---------------------------------------------------------------------------
# Założenia nazwane
# ---------------------------------------------------------------------------


def test_zalozenia_nazwane_admitancja_i_galaz_magnesujaca() -> None:
    run = bieg(siec(fazy=None, b_siemens=5.4e-5, p0_kw=1.2))
    _wykonaj_analize_biegu(run)
    kody = {z["kod"]: z["elementy"] for z in run.raw_result["zalozenia"]}
    # Odbiory symetryczne: żadną krawędzią nie płynie realny I0 → Z0 nieużywane, Z_m = 0
    # (tożsamość) — założenie strat z impedancji własnej NIE jest emitowane.
    assert kody == {
        KOD_ZALOZENIE_TR_SZEREGOWY: ["tr1"],
        KOD_ZALOZENIE_GALAZ_MAGNESUJACA: ["tr1"],
        KOD_ZALOZENIE_ADMITANCJA_POPRZECZNA: ["cab1"],
    }


def test_wyspa_bez_zrodla_zostaje_nierozwiazana_z_jawnym_brakiem() -> None:
    run = bieg(siec(fazy=None, druga_wyspa=True))
    _wykonaj_analize_biegu(run)
    rv = run.raw_result["result_v1"]
    wyspa = next(b for b in rv["bus_results"] if b["element_id"] == "b_wyspa")
    assert wyspa["solved"] is False and wyspa["faza_a"] is None
    assert wyspa["voltage_unbalance_factor_pct"] is None
    assert rv["summary"]["unsolved_bus_ids"] == [wyspa["bus_id"]]
    assert run.raw_result["quality_status"] == "partial"
    assert run.raw_result["reporting_limitations"] == ["unsolved_nodes_outside_slack_island"]


# ---------------------------------------------------------------------------
# Odmowy nazwane — iloczyn cech, predykaty parami (assembler ↔ gotowość)
# ---------------------------------------------------------------------------


def _gen_pv() -> Generator:
    return Generator(
        ref_id="gen_pv",
        name="PV",
        bus_ref="b_nn",
        p_mw=0.1,
        q_mvar=0.0,
        gen_type="pv_inverter",
        meta={
            "control_mode": "REGULACJA_NAPIECIA",
            "u_set_pu": 1.0,
            "q_min_mvar": -0.1,
            "q_max_mvar": 0.1,
        },
    )


def _gen_cosphi() -> Generator:
    return Generator(
        ref_id="gen_cos",
        name="PV cosφ",
        bus_ref="b_nn",
        p_mw=0.1,
        q_mvar=0.0,
        gen_type="pv_inverter",
        meta={"control_mode": "STALY_COS_PHI", "cos_phi": 0.95},
    )


PRZYPADKI_ODMOW: list[tuple[str, dict[str, Any], str, tuple[str, ...]]] = [
    ("oczko", {"oczko": True}, KOD_NIESYMETRIA_NIERADIALNA, ("cab1", "sw_rown", "tr1")),
    # Brak Z0 kabla blokuje TYLKO gdy kabel niesie realny I0 (odbiór faza–N na SN).
    ("brak_z0", {"z0": False, "szyna_odbioru": "b_sn"}, KOD_NIESYMETRIA_BRAK_Z0_GALEZI, ("cab1",)),
    ("brak_grupy", {"vector_group": None}, KOD_NIESYMETRIA_BRAK_GRUPY_TR, ("tr1",)),
    ("odbior_ab", {"fazy": "AB"}, KOD_NIESYMETRIA_FAZY_ODBIORU, ("ld1",)),
    ("yy_1f", {"vector_group": "Yy0"}, KOD_NIESYMETRIA_BRAK_DROGI_ZEROWEJ, ("tr1",)),
    # Droga I0 × położenie transformatora bez drogi (KLASA NIE INSTANCJA):
    # odbiór faza–N na SN za GPZ Yd11 (trójkąt od strony odbioru, gwiazda nieuziemiona).
    (
        "gpz_yd_1f_sn",
        {"trafo_gpz": "Yd11", "szyna_odbioru": "b_sn"},
        KOD_NIESYMETRIA_BRAK_DROGI_ZEROWEJ,
        ("tr_gpz",),
    ),
    # Uziemienie po stronie ZASILAJĄCEJ (YNd11: gwiazda uziemiona od 110 kV) nie zamyka
    # drogi I0 odbioru po stronie trójkąta.
    (
        "gpz_ynd_1f_sn",
        {"trafo_gpz": "YNd11", "szyna_odbioru": "b_sn"},
        KOD_NIESYMETRIA_BRAK_DROGI_ZEROWEJ,
        ("tr_gpz",),
    ),
    ("wezel_pv", {"generatory": [_gen_pv()]}, KOD_NIESYMETRIA_ELEMENT, ("gen_pv",)),
    ("regulacja_falownika", {"generatory": [_gen_cosphi()]}, KOD_NIESYMETRIA_ELEMENT, ("gen_cos",)),
    (
        "bateria",
        {
            "baterie": [
                ShuntCapacitor(
                    ref_id="bat1",
                    name="Bateria",
                    bus_ref="b_sn",
                    rated_mvar=0.3,
                    rated_kv=15.0,
                    catalog_ref="kompensator-sn-300kvar",
                )
            ]
        },
        KOD_NIESYMETRIA_ELEMENT,
        ("bat1",),
    ),
    (
        "zip",
        {"zip_params": {"a_p": 0.5, "b_p": 0.0, "c_p": 0.5}},
        KOD_NIESYMETRIA_ELEMENT,
        ("ld1",),
    ),
    ("zaczep", {"zaczep": 2}, KOD_NIESYMETRIA_ELEMENT, ("tr1",)),
    (
        "oltc_auto",
        {
            "tap_changer": TapChanger(
                regulation_type="OLTC", control_mode="AUTOMATIC", min_position=-9, max_position=9
            )
        },
        KOD_NIESYMETRIA_ELEMENT,
        ("tr1",),
    ),
]


@pytest.mark.parametrize(
    ("nazwa", "cechy", "kod", "elementy"), PRZYPADKI_ODMOW, ids=[p[0] for p in PRZYPADKI_ODMOW]
)
def test_odmowa_nazwana_parami_assembler_i_gotowosc(
    nazwa: str, cechy: dict[str, Any], kod: str, elementy: tuple[str, ...]
) -> None:
    enm = siec(**cechy)
    diagnoza = diagnoza_niesymetrii(enm)
    kody = {o.kod: o.elementy for o in diagnoza.odmowy}
    assert kod in kody, f"{nazwa}: diagnoza nie zgłasza {kod}: {kody}"
    assert set(elementy) <= set(kody[kod])
    with pytest.raises(OdmowaWejsciaRozplywu) as odmowa:
        zloz_wejscie_rozplywu_niesymetrycznego(enm.model_dump(mode="json"), {})
    assert odmowa.value.kod == diagnoza.odmowy[0].kod
    assert kod in str(odmowa.value)
    gotowosc = _check_asymmetry(enm)
    assert gotowosc.status in ("partial", "blocked")
    assert any(kod in wpis for wpis in gotowosc.missing_fields_pl)
    run = bieg(enm)
    with pytest.raises(ValueError):
        _wykonaj_analize_biegu(run)


@pytest.mark.parametrize(
    ("cechy", "zamkniecie", "artefakt", "z_realnym_i0"),
    [
        # nN za Dyn11: zamknięcie w tr1, kabel powyżej = artefakt.
        ({}, ("ld1", "tr1"), ("cab1",), ("tr1",)),
        # nN za Dyn11 pod GPZ Yd11 (OPEN): GPZ NIE blokuje — jest powyżej zamknięcia.
        ({"trafo_gpz": "Yd11"}, ("ld1", "tr1"), ("cab1", "tr_gpz"), ("tr1",)),
        # nN za Dyn11 pod GPZ YNyn0 (przejście I0): również powyżej zamknięcia → artefakt.
        ({"trafo_gpz": "YNyn0"}, ("ld1", "tr1"), ("cab1", "tr_gpz"), ("tr1",)),
        # SN pod GPZ YNyn0: I0 przechodzi przez transformator do źródła — realna droga.
        ({"trafo_gpz": "YNyn0", "szyna_odbioru": "b_sn"}, ("ld1", "src"), (), ("cab1", "tr_gpz")),
        # SN pod GPZ Dyn11 (gwiazda uziemiona od strony odbioru): zamknięcie w tr_gpz.
        (
            {"trafo_gpz": "Dyn11", "szyna_odbioru": "b_sn"},
            ("ld1", "tr_gpz"),
            (),
            ("cab1", "tr_gpz"),
        ),
    ],
    ids=["nn_dyn", "nn_dyn_pod_yd", "nn_dyn_pod_ynyn", "sn_pod_ynyn", "sn_pod_dyn"],
)
def test_droga_zerowa_zamyka_sie_w_pierwszym_uziemionym_uzwojeniu(
    cechy: dict[str, Any],
    zamkniecie: tuple[str, str],
    artefakt: tuple[str, ...],
    z_realnym_i0: tuple[str, ...],
) -> None:
    """Iloczyn cech {szyna odbioru faza–N} × {grupa transformatora nad GPZ}: droga I0
    zamyka się w PIERWSZYM transformatorze z uziemionym uzwojeniem od strony odbioru
    (albo w źródle); transformator powyżej — nawet OPEN — nie blokuje i dostaje
    Z_m := 0 jako założenie nazwane; Z0 potrzebują tylko krawędzie z realnym I0."""
    enm = siec(fazy="A", **cechy)
    diagnoza = diagnoza_niesymetrii(enm)
    assert not diagnoza.odmowy, diagnoza.odmowy
    droga = diagnoza.droga_zerowa
    if zamkniecie[1] == "src":
        assert droga.zamkniecia_w_zrodlach == (zamkniecie,)
        assert droga.zamkniecia_w_transformatorach == ()
    else:
        assert droga.zamkniecia_w_transformatorach == (zamkniecie,)
        assert droga.zamkniecia_w_zrodlach == ()
    assert droga.artefakt == frozenset(artefakt)
    assert droga.z_realnym_i0 == frozenset(z_realnym_i0)
    run = bieg(enm)
    _wykonaj_analize_biegu(run)
    kody = {z["kod"]: z["elementy"] for z in run.raw_result["zalozenia"]}
    if artefakt:
        assert kody[KOD_ZALOZENIE_DROGA_ZEROWA_ZAMKNIETA] == sorted(artefakt)
    else:
        assert KOD_ZALOZENIE_DROGA_ZEROWA_ZAMKNIETA not in kody
    if zamkniecie[1] == "src":
        assert kody[KOD_ZALOZENIE_DROGA_ZEROWA_ZRODLO] == ["src"]
    else:
        assert KOD_ZALOZENIE_DROGA_ZEROWA_ZRODLO not in kody
    for ref in artefakt:
        krok = next(k for k in run.white_box_trace if k["key"] == f"pf_unbalanced_branch[{ref}]")
        assert krok["inputs"]["z0_ohm"] is None
        assert krok["result"]["z_mutual_ohm"] == {"re": 0.0, "im": 0.0}
        assert "artefaktem modelu szeregowego" in krok["substitution"]
    for ref in z_realnym_i0:
        krok = next(k for k in run.white_box_trace if k["key"] == f"pf_unbalanced_branch[{ref}]")
        assert krok["inputs"]["z0_ohm"] is not None
    assert run.raw_result["result_v1"]["converged"] is True


def test_brak_z0_kabla_poza_droga_i0_nie_blokuje_i_jest_nazwany_w_sladzie() -> None:
    """Kabel bez R0/X0 powyżej zamknięcia I0 (odbiór nN za Dyn11): Z0 kabla nie wchodzi
    do równań — bieg idzie, ślad mówi „Z0 nieużywane" (bez podstawiania Z0 = Z1)."""
    enm = siec(fazy="A", z0=False)
    assert not diagnoza_niesymetrii(enm).odmowy
    run = bieg(enm)
    _wykonaj_analize_biegu(run)
    kabel = next(k for k in run.white_box_trace if k["key"] == "pf_unbalanced_branch[cab1]")
    assert kabel["inputs"]["z0_ohm"] is None
    assert kabel["inputs"]["zrodlo_z0"].startswith("Z0 nieużywane")
    assert run.raw_result["result_v1"]["converged"] is True


def test_zip_stalomocowy_nie_jest_odmowa() -> None:
    enm = siec(fazy="A", zip_params={"a_p": 0.0, "b_p": 0.0, "c_p": 1.0})
    assert not diagnoza_niesymetrii(enm).odmowy
    assert _check_asymmetry(enm).status == "ready"


def test_transformator_yy_z_odbiorem_symetrycznym_jest_dozwolony_bez_podstawiania_z0() -> None:
    run = bieg(siec(fazy=None, vector_group="Yy0"))
    _wykonaj_analize_biegu(run)
    krok = next(k for k in run.white_box_trace if k["key"] == "pf_unbalanced_branch[tr1]")
    assert krok["inputs"]["z0_ohm"] is None
    assert krok["result"]["z_mutual_ohm"] == {"re": 0.0, "im": 0.0}
    assert "brak drogi I0" in krok["substitution"]


def test_zamkniety_lacznik_szeregowy_jest_galezia_zerowej_impedancji() -> None:
    """Łącznik w szeregu (nowa szyna między kablem a stacją) — nie oczko; V_to = V_from."""
    enm = siec(fazy="A")
    dane = enm.model_dump(mode="json")
    dane["buses"].append({"ref_id": "b_pole", "name": "Pole SN", "voltage_kv": 15.0})
    for galaz in dane["branches"]:
        if galaz["ref_id"] == "cab1":
            galaz["to_bus_ref"] = "b_pole"
    dane["branches"].append(
        {
            "ref_id": "sw_pole",
            "name": "Wylacznik pola",
            "type": "breaker",
            "from_bus_ref": "b_pole",
            "to_bus_ref": "b_sn",
            "status": "closed",
        }
    )
    run = bieg(EnergyNetworkModel.model_validate(dane))
    _wykonaj_analize_biegu(run)
    szyny = {b["element_id"]: b for b in run.raw_result["result_v1"]["bus_results"]}
    assert szyny["b_pole"]["faza_a"] == szyny["b_sn"]["faza_a"]
    assert diagnoza_niesymetrii(EnergyNetworkModel.model_validate(dane)).odmowy == ()


def test_n_parallel_skaluje_z0_jak_z1() -> None:
    enm = siec(fazy="A", szyna_odbioru="b_sn")
    dane = enm.model_dump(mode="json")
    for galaz in dane["branches"]:
        if galaz["ref_id"] == "cab1":
            galaz["n_parallel"] = 2
    wejscie = zloz_wejscie_rozplywu_niesymetrycznego(dane, {})
    krok = next(k for k in wejscie.slad if k["key"] == "pf_unbalanced_branch[cab1]")
    assert krok["inputs"]["n_parallel"] == 2
    assert krok["inputs"]["z0_ohm"] == complex(0.759, 0.3) * 2.0 / 2
    assert krok["inputs"]["z1_ohm"] == complex(0.253 / 2, 0.1 / 2) * 2.0


def test_opcje_biegu_steruja_tolerancja_i_baza() -> None:
    wejscie = zloz_wejscie_rozplywu_niesymetrycznego(
        siec().model_dump(mode="json"), {"base_mva": 10.0, "tolerance": 1e-9, "max_iterations": 7}
    )
    assert wejscie.base_mva == 10.0 and wejscie.tolerance == 1e-9 and wejscie.max_iterations == 7
    assert wejscie.wyspy[0].wejscie.base_mva == 10.0 / 3.0
    assert wejscie.wyspy[0].wejscie.base_kv == 15.0 / 3**0.5


def test_snapshot_z_oczkiem_nie_jest_mutowany_przez_diagnoze() -> None:
    enm = siec(oczko=True)
    przed = copy.deepcopy(enm.model_dump(mode="json"))
    diagnoza_niesymetrii(enm)
    assert enm.model_dump(mode="json") == przed
