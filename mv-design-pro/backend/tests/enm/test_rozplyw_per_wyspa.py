"""CV-4.3 K3b (A3-05): rozpływ liczony PER WYSPA, odmowa NAZWANA dla dwóch źródeł w jednej
wyspie, zwarcie bez wysp pływających — testy jako ILOCZYN CECH:

    {1 wyspa, 2 wyspy, 3 wyspy} × {0, 1, 2 źródła sieciowe w wyspie}
    × {wyspa niezasilona obecna / nie} × {rozpływ, zwarcie} × {regulator zaczepowy w drugiej wyspie}

Sieci: ``scenariusz-stAB`` z rejestru (02: jedno źródło; 05: dwa GPZ w osobnych wyspach;
06: dwa GPZ w jednej wyspie; 10: sekcja niezasilona) i warianty budowniczego.
Wyrocznia fizyki (pandapower) w ``tests/golden/wyrocznie`` (marker ``pandapower``);
tu — tożsamość scalenia z rozwiązaniami solvera per wyspa, semantyka kontraktu i bramka.
"""

from __future__ import annotations

import math

import pytest
from application.calculation_readiness.service import _check_power_flow
from domain.canonical_operations import READINESS_CODES
from enm.assembler import (
    KOD_WIELE_ZRODEL_W_WYSPIE,
    OdmowaWejsciaRozplywu,
    zloz_wejscie_rozplywu,
    zloz_wejscie_zwarcia,
)
from enm.canonical_analysis import (
    KLUCZE_WIERSZA_ZWARCIA,
    KLUCZE_WIERSZA_ZWARCIA_OPCJONALNE,
    POWOD_WEZEL_BEZ_ODNIESIENIA,
    _execute_power_flow,
    _execute_short_circuit,
)
from enm.mapping import _ref_to_uuid
from enm.models import EnergyNetworkModel, TapChanger
from enm.rozplyw_wysp import scal_rozwiazania_wysp, scal_slady_oltc
from network_model.solvers.power_flow_newton import PowerFlowNewtonSolver

from tests.application.analyses.lv_domain.scenariusze_nn import (
    SCENARIUSZ_PO_SLUGU,
    _stacja_dwutransformatorowa,
)
from tests.golden.parytet_assemblera.harness import _bieg

_SC_3F = {"fault_type": "3F", "scenario": "max", "thermal_time_seconds": 1.0}


def _siec(slug: str) -> EnergyNetworkModel:
    return SCENARIUSZ_PO_SLUGU[slug].budowniczy()


def _rozplyw(enm: EnergyNetworkModel, **opcje):
    run = _bieg(enm, klucz="k3b", analysis_type="PF", options=dict(opcje))
    _execute_power_flow(run)
    return run


def _zwarcie(enm: EnergyNetworkModel):
    run = _bieg(enm, klucz="k3b-sc", analysis_type="short_circuit_sn", options=_SC_3F)
    _execute_short_circuit(run)
    return run


# ---------------------------------------------------------------------------
# 1 wyspa zasilona: tożsamość z torem sprzed karty
# ---------------------------------------------------------------------------


def test_jedna_wyspa_wejscie_na_pelnym_grafie_jest_tym_samym_obiektem() -> None:
    enm = _siec("02_two_tr_qbc_open")
    wejscie = zloz_wejscie_rozplywu(enm.model_dump(mode="json"), {})
    assert len(wejscie.wyspy) == 1
    wyspa = wejscie.wyspy[0]
    assert wejscie.pf_input is wyspa.pf_input
    assert wyspa.pf_input.graph is wejscie.graph
    assert wejscie.slack_node_id == wyspa.slack_node_id == _ref_to_uuid("sn")
    assert wyspa.zrodlo_ref == "src"
    # pełne listy (także szyny wysp niezasilonych — jak dotąd), nie filtrowane
    assert list(wyspa.pf_input.pq) == list(wejscie.pq_specs)
    assert list(wyspa.pf_input.pv) == list(wejscie.pv_specs)
    run = _rozplyw(enm)
    assert "wyspy" not in run.raw_result
    assert "wyspy" not in run.power_flow_trace
    assert all("slack_bus_id" not in it for it in run.power_flow_trace["iterations"])


def test_scalenie_jednego_rozwiazania_jest_tozsamoscia() -> None:
    enm = _siec("02_two_tr_qbc_open")
    wejscie = zloz_wejscie_rozplywu(enm.model_dump(mode="json"), {})
    rozwiazanie = PowerFlowNewtonSolver().solve(wejscie.pf_input)
    assert scal_rozwiazania_wysp([(wejscie.wyspy[0], rozwiazanie)], wejscie.graph) is rozwiazanie
    assert scal_slady_oltc([(wejscie.wyspy[0], rozwiazanie)], [None]) is None
    slad = {"regulators": [], "iterations": [], "converged": True}
    assert scal_slady_oltc([(wejscie.wyspy[0], rozwiazanie)], [slad]) is slad


# ---------------------------------------------------------------------------
# 2 wyspy zasilone (05): podgrafy, scalenie = unia rozwiązań solvera per wyspa
# ---------------------------------------------------------------------------


def test_dwie_wyspy_maja_osobne_wejscia_na_podgrafach() -> None:
    enm = _siec("05_independent_upstream")
    wejscie = zloz_wejscie_rozplywu(enm.model_dump(mode="json"), {})
    assert [w.zrodlo_ref for w in wejscie.wyspy] == ["src", "src2"]
    wszystkie = set(wejscie.graph.nodes)
    for wyspa in wejscie.wyspy:
        graf = wyspa.pf_input.graph
        assert graf is not wejscie.graph
        assert set(graf.nodes) == set(wyspa.wezly)
        assert wyspa.slack_node_id in graf.nodes
        assert {s.node_id for s in wyspa.pf_input.pq} <= set(wyspa.wezly)
        assert all(
            b.from_node_id in graf.nodes and b.to_node_id in graf.nodes
            for b in graf.branches.values()
        )
        # te same OBIEKTY elementów (bez kopii)
        assert all(graf.nodes[n] is wejscie.graph.nodes[n] for n in graf.nodes)
    assert set(wejscie.wyspy[0].wezly) | set(wejscie.wyspy[1].wezly) == wszystkie
    assert not set(wejscie.wyspy[0].wezly) & set(wejscie.wyspy[1].wezly)
    # największa wyspa pierwsza (kolejność TopologyView)
    assert len(wejscie.wyspy[0].wezly) >= len(wejscie.wyspy[1].wezly)


def test_dwie_wyspy_wynik_jest_unia_rozwiazan_solvera_per_wyspa() -> None:
    enm = _siec("05_independent_upstream")
    run = _rozplyw(enm)
    raw = run.raw_result
    wynik = raw["result_v1"]
    assert wynik["converged"] and raw["quality_status"] == "accepted"
    assert not wynik["unsolved_node_ids"]
    assert "non_finite_fields" not in raw
    wejscie = zloz_wejscie_rozplywu(enm.model_dump(mode="json"), {})
    szyny = {row["bus_id"]: row for row in wynik["bus_results"]}
    suma_slack = 0j
    for wyspa in wejscie.wyspy:
        osobno = PowerFlowNewtonSolver().solve(wyspa.pf_input)
        assert osobno.converged
        for wezel in wyspa.wezly:
            assert szyny[wezel]["v_pu"] == osobno.node_u_mag[wezel]
            assert szyny[wezel]["angle_deg"] == math.degrees(osobno.node_angle[wezel])
            assert raw["node_voltage_kv"][wezel] == osobno.node_voltage_kv[wezel]
        assert (
            szyny[wyspa.slack_node_id]["p_injected_mw"]
            == osobno.slack_power.real * wynik["base_mva"]
        )
        suma_slack += osobno.slack_power
    assert wynik["summary"]["slack_p_mw"] == suma_slack.real * wynik["base_mva"]
    assert wynik["slack_bus_id"] == wejscie.wyspy[0].slack_node_id
    # opis wysp (addytywny) i ślad per wyspa
    assert [w["slack_bus_id"] for w in raw["wyspy"]] == [w.slack_node_id for w in wejscie.wyspy]
    assert [w["zrodlo_ref"] for w in raw["wyspy"]] == ["src", "src2"]
    assert all(w["converged"] for w in raw["wyspy"])
    slad = run.power_flow_trace
    assert [w["slack_bus_id"] for w in slad["wyspy"]] == [w.slack_node_id for w in wejscie.wyspy]
    assert "wyspy" in slad["ybus_trace"]
    assert {it["slack_bus_id"] for it in slad["iterations"]} == {
        w.slack_node_id for w in wejscie.wyspy
    }
    assert slad["final_iterations_count"] == max(w["final_iterations_count"] for w in slad["wyspy"])
    assert set(slad["pq_bus_ids"]) == {s.node_id for s in wejscie.pq_specs}
    assert any("wyspa szyny bilansującej" in krok["title"] for krok in run.white_box_trace)


# ---------------------------------------------------------------------------
# 3 wyspy: 2 zasilone + 1 bez źródła (nierozwiązana jak dotąd)
# ---------------------------------------------------------------------------


def test_trzy_wyspy_dwie_zasilone_jedna_nierozwiazana() -> None:
    enm = _stacja_dwutransformatorowa(
        sprzeglo="open", niezalezny_system_tb=True, qf_tb_status="open"
    ).zbuduj()
    run = _rozplyw(enm)
    raw = run.raw_result
    wynik = raw["result_v1"]
    assert wynik["converged"]
    assert raw["quality_status"] == "partial"
    assert raw["reporting_limitations"] == ["unsolved_nodes_outside_slack_island"]
    nierozwiazane = set(wynik["unsolved_node_ids"])
    assert _ref_to_uuid("RGnN-B") in nierozwiazane
    assert _ref_to_uuid("sn2") not in nierozwiazane and _ref_to_uuid("RGnN-A") not in nierozwiazane
    assert [w["zrodlo_ref"] for w in raw["wyspy"]] == ["src", "src2"]
    assert all(raw["node_voltage_kv"][n] is None for n in nierozwiazane)
    assert "non_finite_fields" not in raw
    assert all(
        isinstance(v, float) and math.isfinite(v)
        for n, v in raw["node_voltage_kv"].items()
        if n not in nierozwiazane
    )


# ---------------------------------------------------------------------------
# 2 źródła w JEDNEJ wyspie (06): odmowa nazwana w assemblerze i bramce; zwarcie liczy
# ---------------------------------------------------------------------------


def test_dwa_zrodla_w_jednej_wyspie_odmowa_nazwana_w_assemblerze() -> None:
    enm = _siec("06_conflict_parallel_sources")
    with pytest.raises(OdmowaWejsciaRozplywu) as blad:
        zloz_wejscie_rozplywu(enm.model_dump(mode="json"), {})
    assert blad.value.kod == KOD_WIELE_ZRODEL_W_WYSPIE == "source.multiple_grid_sources_in_island"
    assert blad.value.elementy == ("src", "src2")
    assert KOD_WIELE_ZRODEL_W_WYSPIE in str(blad.value)
    assert READINESS_CODES[KOD_WIELE_ZRODEL_W_WYSPIE].message_pl in str(blad.value)
    assert isinstance(blad.value, ValueError)  # wykonawca biegu: status FAILED z powodem
    with pytest.raises(OdmowaWejsciaRozplywu):
        _rozplyw(enm)


def test_dwa_zrodla_w_jednej_wyspie_blokuja_bramke_gotowosci_tym_samym_kodem() -> None:
    raport = _check_power_flow(_siec("06_conflict_parallel_sources"))
    assert raport.status == "blocked"
    assert {"src", "src2"} <= set(raport.blocking_object_refs)
    assert any(KOD_WIELE_ZRODEL_W_WYSPIE in pole for pole in raport.missing_fields_pl)
    # predykaty parami: to samo ``derive`` — dwa źródła w OSOBNYCH wyspach NIE blokują
    # tym kodem (inne braki scenariusza, np. tryb sterowania falownika PV-A, zostają
    # takie same jak w sieci jednoźródłowej 02 — porównanie PRZED/PO na tej samej bramce).
    for slug in ("05_independent_upstream", "02_two_tr_qbc_open"):
        raport_ok = _check_power_flow(_siec(slug))
        assert not any(KOD_WIELE_ZRODEL_W_WYSPIE in pole for pole in raport_ok.missing_fields_pl)
        assert not {"src", "src2"} & set(raport_ok.blocking_object_refs), slug
    assert _check_power_flow(_siec("05_independent_upstream")).missing_fields_pl == (
        _check_power_flow(_siec("02_two_tr_qbc_open")).missing_fields_pl
    )


def test_dwa_zrodla_w_jednej_wyspie_zwarcie_liczy_superpozycje() -> None:
    jedna = _zwarcie(_siec("06_conflict_parallel_sources"))
    osobne = _zwarcie(_siec("05_independent_upstream"))
    ik_jedna = {str(r["fault_node_id"]): r for r in jedna.raw_result["results"]}
    ik_osobne = {str(r["fault_node_id"]): r for r in osobne.raw_result["results"]}
    sn = _ref_to_uuid("sn")
    assert ik_jedna[sn]["reporting_status"] == "reportable"
    # z drugim GPZ dołączonym przez zamknięte sprzęgło prąd zwarciowy na szynie SN rośnie
    assert ik_jedna[sn]["ik_thevenin_a"] > ik_osobne[sn]["ik_thevenin_a"]
    assert all(r["reporting_status"] == "reportable" for r in ik_jedna.values())
    assert all(r["reporting_status"] == "reportable" for r in ik_osobne.values())


# ---------------------------------------------------------------------------
# Regulator zaczepowy w KAŻDEJ wyspie: własny regulator widzi własną wyspę
# ---------------------------------------------------------------------------


def _z_regulatorami(enm: EnergyNetworkModel) -> EnergyNetworkModel:
    dane = enm.model_dump(mode="json")
    for trafo in dane["transformers"]:
        trafo["tap_changer"] = TapChanger(
            regulation_type="OLTC",
            regulated_winding="HV",
            neutral_position=0,
            current_position=0,
            min_position=-4,
            max_position=4,
            step_percent=2.5,
            control_mode="AUTOMATIC",
            voltage_setpoint_kv=0.42,
            deadband_kv=0.004,
        ).model_dump(mode="json")
    return EnergyNetworkModel.model_validate(dane)


def test_regulator_zaczepowy_w_obu_wyspach_dziala_na_wlasnej_wyspie() -> None:
    enm = _z_regulatorami(_siec("05_independent_upstream"))
    run = _rozplyw(enm)
    oltc = run.raw_result["oltc_control"]
    assert oltc["converged"]
    assert [w["slack_bus_id"] for w in oltc["wyspy"]] == [
        w["slack_bus_id"] for w in run.raw_result["wyspy"]
    ]
    for slad_wyspy in oltc["wyspy"]:
        assert slad_wyspy is not None
        assert len(slad_wyspy["regulators"]) == 1
        for iteracja in slad_wyspy["iterations"]:
            for decyzja in iteracja["decisions"]:
                assert decyzja.get("reason") != "no_measurement"
                assert decyzja["u_regulation_kv"] is not None
                assert math.isfinite(decyzja["u_regulation_kv"])
    assert {reg["branch_id"] for reg in oltc["regulators"]} == {
        _ref_to_uuid("TA"),
        _ref_to_uuid("TB"),
    }
    assert {it["slack_bus_id"] for it in oltc["iterations"]} == {
        w["slack_bus_id"] for w in run.raw_result["wyspy"]
    }
    assert run.power_flow_trace["oltc_control"] is oltc


def test_regulator_zaczepowy_w_jednej_wyspie_bez_zmian_ksztaltu() -> None:
    enm = _z_regulatorami(_siec("02_two_tr_qbc_open"))
    run = _rozplyw(enm)
    oltc = run.raw_result["oltc_control"]
    assert "wyspy" not in oltc
    assert len(oltc["regulators"]) == 2
    assert all("slack_bus_id" not in it for it in oltc["iterations"])


# ---------------------------------------------------------------------------
# Zwarcie: wyspa bez impedancji do odniesienia poza grafem solvera
# ---------------------------------------------------------------------------


def test_zwarcie_wyspa_plywajaca_poza_grafem_solvera_wiersz_bez_solvera() -> None:
    enm = _siec("10_deenergized_section")
    migawka = enm.model_dump(mode="json")
    wejscie = zloz_wejscie_zwarcia(migawka, _SC_3F)
    assert wejscie.wezly_bez_odniesienia
    assert not set(wejscie.solve_graph.nodes) & wejscie.wezly_bez_odniesienia
    assert (
        set(wejscie.graph.nodes) == set(wejscie.solve_graph.nodes) | wejscie.wezly_bez_odniesienia
    )
    assert wejscie.solve_graph is not wejscie.graph
    run = _zwarcie(enm)
    wiersze = {str(r["fault_node_id"]): r for r in run.raw_result["results"]}
    assert set(wiersze) == set(wejscie.reportable_fault_node_ids)
    for wezel in wejscie.wezly_bez_odniesienia:
        wiersz = wiersze[wezel]
        assert wiersz["non_physical_reason"] == POWOD_WEZEL_BEZ_ODNIESIENIA
        assert wiersz["contributions"] == [] and wiersz["branch_contributions"] == []
        assert wiersz["white_box_trace"] == []
        assert wiersz["ikss_a"] is None and wiersz["zkk_ohm"] == {"re": None, "im": None}
        assert {"$.ikss_a", "$.kappa", "$.zkk_ohm.re"} <= set(wiersz["non_physical_fields"])
        assert wiersz["tb_s"] == 0.1 and wiersz["tk_s"] == 1.0 and wiersz["un_v"] == 400.0
    assert not [
        k for k in run.white_box_trace if k.get("target_id") in wejscie.wezly_bez_odniesienia
    ]
    zasilane = [w for n, w in wiersze.items() if n not in wejscie.wezly_bez_odniesienia]
    assert zasilane and all(w["ikss_a"] > 0 for w in zasilane)


def test_klucze_pustego_wiersza_zwarcia_sa_kluczami_kontraktu_solvera() -> None:
    """Deklaracja bez testu = fałszywa pewność: szablon wiersza bez solvera musi mieć
    dokładnie klucze ``ShortCircuitResult.to_dict()`` (poza polami exclude-None)."""
    enm = _siec("02_two_tr_qbc_open")
    run = _zwarcie(enm)
    wiersz = run.raw_result["results"][0]
    klucze_solvera = set(wiersz) - KLUCZE_WIERSZA_ZWARCIA_OPCJONALNE - set(_KLUCZE_WYKONAWCY)
    assert klucze_solvera == set(KLUCZE_WIERSZA_ZWARCIA), klucze_solvera ^ set(
        KLUCZE_WIERSZA_ZWARCIA
    )


#: Klucze dopisywane do wiersza przez wykonawcę (reportability, scenariusz), nie solver.
_KLUCZE_WYKONAWCY = frozenset(
    {
        "analysis_type",
        "reporting_status",
        "reporting_status_pl",
        "proof_status",
        "proof_status_pl",
        "proof_ref",
        "proof_binding",
        "dopuszczalnosc_raportowa",
        "reporting_limitations",
        "requires_z0",
        "z0_source",
        "scenario",
        "c_factor_override",
    }
)
