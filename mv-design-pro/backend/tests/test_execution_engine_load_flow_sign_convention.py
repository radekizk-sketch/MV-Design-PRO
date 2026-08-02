"""Karta W2 — konwencja znaku mocy wezlowej w silniku wykonawczym rozplywu.

ROZSTRZYGNIECIE (karta W2 §2.1). Podejrzenie zglaszane przy odbiorze toru U4
zostalo POTWIERDZONE pomiarem: ``ExecutionEngineService.execute_run_load_flow``
skladalo moc wezlowa jako ``+p_mw/base_mva``, czyli w konwencji OBCIAZENIOWEJ,
podczas gdy w tym samym slowniku moc slacka wchodzi jako INJEKCJA, a kontrakt
FROZEN ``PowerFlowBusResult.p_injected_mw`` mowi wprost „ujemna = pobor"
(``power_flow_result.py:35``). Odbior 2,0 MW byl raportowany jako +2,0 MW
oddawane DO sieci, a suma wstrzykniec wychodzila 7,03 MW w sieci o stratach
0,031 MW.

SEDZIA. Testy nie ufaja ani slownikowi montowanemu w warstwie aplikacji, ani
mocom zwracanym przez solver. Bilans wezlowy jest liczony W TYM PLIKU w czystym
numpy z parametrow sieci (model PI galezi) oraz z napiec, ktore RAPORT sam
podaje: S_i = V_i * conj(sum_k Y_ik V_k). Jedynym wspolnym punktem z badanym
lancuchem sa wiec napiecia — niezalezny wynik zbieznosci.

ZAKRES (regula KLASA, NIE INSTANCJA). Przypadki to ILOCZYN CECH, w ktorych znak
moglby sie schowac: odbior stalomocowy x odbior ZIP (moc zadana != wstrzyknieta)
x generator PV na wlasnej szynie x ZIP razem z generacja x kilka odbiorow na
JEDNEJ szynie (zwijanie ``merge_bus_components``).
"""

from __future__ import annotations

import math
from typing import Any
from uuid import uuid4

import numpy as np
import pytest
from application.execution_engine import service as execution_engine_service
from application.execution_engine.load_flow_run_input import (
    LoadFlowBranchInput,
    LoadFlowGeneratorInput,
    LoadFlowLoadInput,
    LoadFlowNodeInput,
    LoadFlowRunInput,
)
from application.execution_engine.service import ExecutionEngineService
from domain.execution import ExecutionAnalysisType
from domain.study_case import StudyCaseConfig, new_study_case
from network_model.solvers.power_flow_result import (
    PowerFlowResultV1,
    build_power_flow_result_v1,
)
from network_model.solvers.power_flow_zip import ZipCoeffs

BASE_MVA = 100.0
U_KV = 15.0

# Tolerancja porownania z sedzia. Solver zbiega do 1e-8 pu na niezbilansowaniu,
# co przy S_b = 100 MVA daje 1e-6 MW; bierzemy 1e-6 MW z zapasem rzedu wielkosci.
TOL_MW = 1e-5


# ---------------------------------------------------------------------------
# Sieci testowe — iloczyn cech
# ---------------------------------------------------------------------------

NODES = (
    LoadFlowNodeInput("slack", "SLACK", U_KV),
    LoadFlowNodeInput("n1", "PQ", U_KV),
    LoadFlowNodeInput("n2", "PQ", U_KV),
)
BRANCHES = (
    LoadFlowBranchInput("l1", "slack", "n1", 0.08, 0.32, 3.0, 5.0),
    LoadFlowBranchInput("l2", "n1", "n2", 0.08, 0.32, 3.0, 5.0),
)

# Odbior o stalej impedancji: moc ZADANA (1,5 MW) rozni sie od WSTRZYKNIETEJ,
# bo wielomian napieciowy skaluje ja przy |V| < 1. Wykrywa nie tylko znak, ale
# i raportowanie zadania zamiast faktu (klasa defektu D1).
ZIP_STALA_IMPEDANCJA = ZipCoeffs(a_p=1.0, b_p=0.0, c_p=0.0, a_q=1.0, b_q=0.0, c_q=0.0)
ZIP_MIESZANY = ZipCoeffs(a_p=0.5, b_p=0.5, c_p=0.0, a_q=0.5, b_q=0.5, c_q=0.0)


def _siec(
    loads: tuple[LoadFlowLoadInput, ...],
    generators: tuple[LoadFlowGeneratorInput, ...] = (),
    *,
    branches: tuple[LoadFlowBranchInput, ...] = BRANCHES,
) -> LoadFlowRunInput:
    return LoadFlowRunInput(
        base_mva=BASE_MVA,
        slack_node_id="slack",
        slack_u_pu=1.0,
        slack_angle_rad=0.0,
        nodes=NODES,
        branches=branches,
        loads=loads,
        generators=generators,
    )


# Galezie z NIEZEROWA pojemnoscia doziemna — model PI z galezia poprzeczna, zeby
# sedzia nie byl przypadkiem zgodny tylko dla galezi czysto szeregowej.
BRANCHES_Z_POJEMNOSCIA = (
    LoadFlowBranchInput("l1", "slack", "n1", 0.08, 0.32, 120.0, 5.0),
    LoadFlowBranchInput("l2", "n1", "n2", 0.08, 0.32, 120.0, 5.0),
)


def _sieci_iloczyn_cech() -> dict[str, LoadFlowRunInput]:
    return {
        "odbiory stalomocowe": _siec(
            (LoadFlowLoadInput("n1", 2.0, 0.8), LoadFlowLoadInput("n2", 1.5, 0.6)),
        ),
        "odbior ZIP stalej impedancji": _siec(
            (
                LoadFlowLoadInput("n1", 2.0, 0.8),
                LoadFlowLoadInput("n2", 1.5, 0.6, zip_coeffs=ZIP_STALA_IMPEDANCJA),
            ),
        ),
        "generator PV na wlasnej szynie": _siec(
            (LoadFlowLoadInput("n1", 2.0, 0.8),),
            (LoadFlowGeneratorInput("n2", -1.0, 1.0, -5.0, 5.0),),
        ),
        "odbior ZIP razem z generacja PV": _siec(
            (LoadFlowLoadInput("n1", 2.0, 0.8, zip_coeffs=ZIP_MIESZANY),),
            (LoadFlowGeneratorInput("n2", -1.0, 1.0, -5.0, 5.0),),
        ),
        "dwa odbiory na jednej szynie": _siec(
            (
                LoadFlowLoadInput("n1", 1.2, 0.5),
                LoadFlowLoadInput("n1", 0.8, 0.3),
                LoadFlowLoadInput("n2", 1.5, 0.6),
            ),
        ),
        "galezie z pojemnoscia doziemna": _siec(
            (LoadFlowLoadInput("n1", 2.0, 0.8), LoadFlowLoadInput("n2", 1.5, 0.6)),
            branches=BRANCHES_Z_POJEMNOSCIA,
        ),
    }


# ---------------------------------------------------------------------------
# Uruchomienie PRODUKCYJNEJ sciezki + podsluch na styku z kontraktem FROZEN
# ---------------------------------------------------------------------------


def _uruchom(
    monkeypatch: pytest.MonkeyPatch, lf: LoadFlowRunInput
) -> tuple[PowerFlowResultV1, dict[str, Any]]:
    """Wykonuje bieg przez ``execute_run_load_flow`` i zwraca wynik FROZEN.

    Podsluch owija PRAWDZIWE ``build_power_flow_result_v1`` (zachowanie
    produktu bez zmian) i przechwytuje dokladnie ten obiekt, ktory silnik
    wykonawczy odda dalej. Dzieki temu test ocenia realna sciezke uzytkownika,
    a nie skopiowana do testu formule.
    """
    przechwycone: dict[str, Any] = {}
    oryginal = execution_engine_service.build_power_flow_result_v1

    def _szpieg(**kwargs: Any) -> PowerFlowResultV1:
        wynik = oryginal(**kwargs)
        przechwycone["node_p_injected_pu"] = dict(kwargs["node_p_injected_pu"])
        przechwycone["node_q_injected_pu"] = dict(kwargs["node_q_injected_pu"])
        przechwycone["wynik"] = wynik
        return wynik

    monkeypatch.setattr(execution_engine_service, "build_power_flow_result_v1", _szpieg)

    engine = ExecutionEngineService()
    case = new_study_case(project_id=uuid4(), name="W2", config=StudyCaseConfig())
    engine.register_study_case(case)
    run = engine.create_run(
        study_case_id=case.id,
        analysis_type=ExecutionAnalysisType.LOAD_FLOW,
        solver_input=lf.canonical_dict(),
    )
    _, result_set = engine.execute_run_load_flow(
        run.id,
        load_flow_input=lf,
        readiness_snapshot={"ready": True},
        validation_snapshot={"valid": True},
    )
    przechwycone["result_set"] = result_set
    return przechwycone["wynik"], przechwycone


# ---------------------------------------------------------------------------
# SEDZIA — niezalezny bilans wezlowy liczony w tym pliku
# ---------------------------------------------------------------------------


def _sedzia_bilans_wezlowy(lf: LoadFlowRunInput, wynik: PowerFlowResultV1) -> dict[str, complex]:
    """S_i = V_i * conj(sum_k Y_ik V_k) [MVA], konwencja INJEKCJI.

    Y-bus skladany tu od zera z danych sieci (model PI: admitancja szeregowa
    1/((r+jx)*L) oraz polowa susceptancji b*L na kazdym koncu), napiecia brane
    z RAPORTU. Zaden element badanego montazu ani solvera nie jest uzyty.
    """
    z_base = (U_KV * U_KV) / lf.base_mva
    ids = sorted(n.node_id for n in lf.nodes)
    idx = {node_id: i for i, node_id in enumerate(ids)}
    y = np.zeros((len(ids), len(ids)), dtype=complex)
    for b in lf.branches:
        if not b.in_service:
            continue
        z_ohm = complex(b.r_ohm_per_km * b.length_km, b.x_ohm_per_km * b.length_km)
        y_ser = (1.0 / z_ohm) * z_base
        y_sh_konca = complex(0.0, b.b_us_per_km * 1e-6 * b.length_km / 2.0) * z_base
        i_from, i_to = idx[b.from_node_id], idx[b.to_node_id]
        y[i_from, i_from] += y_ser + y_sh_konca
        y[i_to, i_to] += y_ser + y_sh_konca
        y[i_from, i_to] -= y_ser
        y[i_to, i_from] -= y_ser

    v = np.zeros(len(ids), dtype=complex)
    for bus in wynik.bus_results:
        v[idx[bus.bus_id]] = bus.v_pu * np.exp(1j * math.radians(bus.angle_deg))

    s_pu = v * np.conj(y @ v)
    return {node_id: complex(s_pu[idx[node_id]] * lf.base_mva) for node_id in ids}


# ---------------------------------------------------------------------------
# §3(a) test rozstrzygajacy — zielony niezaleznie od werdyktu
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("nazwa", sorted(_sieci_iloczyn_cech()))
def test_moc_wezlowa_zgadza_sie_z_niezaleznym_bilansem(
    monkeypatch: pytest.MonkeyPatch, nazwa: str
) -> None:
    """Kazda raportowana moc czynna wezla = moc wynikajaca z fizyki przy tym napieciu.

    To jest test ROZSTRZYGAJACY z §2.1 karty: gdyby znak byl odwrocony (stan
    sprzed naprawy), odbior 2,0 MW raportowany bylby jako +2,0 MW przy sedzim
    -2,0 MW i asercja padnie z roznica 4,0 MW.
    """
    lf = _sieci_iloczyn_cech()[nazwa]
    wynik, _ = _uruchom(monkeypatch, lf)
    assert wynik.converged, f"{nazwa}: brak zbieznosci — pomiar nieważny"

    sedzia = _sedzia_bilans_wezlowy(lf, wynik)
    szyny_pv = {g.node_id for g in lf.generators}

    for bus in wynik.bus_results:
        assert bus.p_injected_mw == pytest.approx(sedzia[bus.bus_id].real, abs=TOL_MW), (
            f"{nazwa}: szyna {bus.bus_id} raportuje P={bus.p_injected_mw:.6f} MW, "
            f"a fizyka przy |V|={bus.v_pu:.6f} pu daje {sedzia[bus.bus_id].real:.6f} MW"
        )
        if bus.bus_id in szyny_pv:
            # Moc bierna szyny PV — patrz dlug W2-D1 nizej (solver nie publikuje).
            continue
        assert bus.q_injected_mvar == pytest.approx(sedzia[bus.bus_id].imag, abs=TOL_MW), (
            f"{nazwa}: szyna {bus.bus_id} raportuje Q={bus.q_injected_mvar:.6f} Mvar, "
            f"a fizyka daje {sedzia[bus.bus_id].imag:.6f} Mvar"
        )


@pytest.mark.parametrize("nazwa", sorted(_sieci_iloczyn_cech()))
def test_suma_wstrzyknien_rowna_stratom_sieci(monkeypatch: pytest.MonkeyPatch, nazwa: str) -> None:
    """Bilans calej sieci: suma mocy wstrzyknietych = straty.

    Najostrzejszy detektor odwroconego znaku: przed naprawa suma wynosila
    7,031140 MW przy stratach 0,031140 MW (odbiory wchodzily dodatnio zamiast
    ujemnie), czyli sieciowy bilans byl zawyzony o podwojona moc odbiorow.
    """
    lf = _sieci_iloczyn_cech()[nazwa]
    wynik, _ = _uruchom(monkeypatch, lf)
    suma = sum(bus.p_injected_mw for bus in wynik.bus_results)
    assert suma == pytest.approx(wynik.summary.total_losses_p_mw, abs=TOL_MW), (
        f"{nazwa}: suma wstrzyknien {suma:.6f} MW != straty "
        f"{wynik.summary.total_losses_p_mw:.6f} MW"
    )


def test_odbior_ujemny_generacja_dodatnia_slack_dodatni(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Kontrakt FROZEN „ujemna = pobor" (power_flow_result.py:35) — wprost.

    Deklaracja bez testu jest fałszywa pewnoscia (regula KLASA pkt 4), wiec
    zdanie z kontraktu ma tu wlasna asercje, osobno od sedziego numerycznego.
    """
    lf = _siec(
        (LoadFlowLoadInput("n1", 2.0, 0.8),),
        (LoadFlowGeneratorInput("n2", -1.0, 1.0, -5.0, 5.0),),
    )
    wynik, _ = _uruchom(monkeypatch, lf)
    szyny = {b.bus_id: b for b in wynik.bus_results}

    assert szyny["n1"].p_injected_mw < 0.0, "odbior musi miec moc wstrzyknieta UJEMNA"
    assert szyny["n1"].p_injected_mw == pytest.approx(-2.0, abs=TOL_MW)
    assert szyny["n2"].p_injected_mw > 0.0, "generacja musi miec moc wstrzyknieta DODATNIA"
    assert szyny["n2"].p_injected_mw == pytest.approx(1.0, abs=TOL_MW)
    assert szyny["slack"].p_injected_mw > 0.0, "slack zasilajacy siec wstrzykuje dodatnio"
    assert szyny["n1"].q_injected_mvar == pytest.approx(-0.8, abs=TOL_MW)


def test_moc_szyny_zip_to_moc_wstrzyknieta_a_nie_zadana(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Na szynie ZIP raport pokazuje moc PO wielomianie napieciowym.

    Klasa defektu D1 zamknieta na sciezce kanonicznej wystepowala rowniez tutaj:
    slownik byl skladany z mocy ZADANEJ, wiec szyna o stalej impedancji
    raportowala 1,5 MW przy faktycznym wstrzyknieciu -1,430975 MW. Sam znak by
    tego nie wykryl — dlatego osobna asercja na WARTOSC.
    """
    lf = _siec(
        (
            LoadFlowLoadInput("n1", 2.0, 0.8),
            LoadFlowLoadInput("n2", 1.5, 0.6, zip_coeffs=ZIP_STALA_IMPEDANCJA),
        ),
    )
    wynik, _ = _uruchom(monkeypatch, lf)
    szyna = {b.bus_id: b for b in wynik.bus_results}["n2"]

    assert szyna.v_pu < 1.0, "bez spadku napiecia wielomian ZIP nie zmienia mocy"
    assert szyna.p_injected_mw != pytest.approx(
        -1.5, abs=1e-3
    ), "raport pokazuje moc ZADANA zamiast wstrzyknietej — wielomian ZIP pominiety"
    assert szyna.p_injected_mw == pytest.approx(
        -1.5 * szyna.v_pu**2, rel=1e-6
    ), "przy a_p = 1 moc wstrzyknieta musi skalowac sie kwadratem napiecia"


# ---------------------------------------------------------------------------
# §3(b) parytet obu sciezek dla tej samej sieci
# ---------------------------------------------------------------------------


def _payload_enm_dwie_szyny(*, p_mw: float, q_mvar: float) -> dict[str, Any]:
    """Ta sama fizyka co ``_siec_parytetu`` wyrazona w kanonicznym ENM."""
    from tests.catalog_test_helpers import gpz_source_record

    return {
        "header": {
            "name": "W2 parytet",
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "revision": 1,
            "hash_sha256": "",
        },
        "buses": [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "ref_id": "b1",
                "name": "GPZ",
                "tags": [],
                "meta": {},
                "voltage_kv": U_KV,
                "phase_system": "3ph",
            },
            {
                "id": "00000000-0000-0000-0000-000000000002",
                "ref_id": "b2",
                "name": "Odbiorca",
                "tags": [],
                "meta": {},
                "voltage_kv": U_KV,
                "phase_system": "3ph",
            },
        ],
        "branches": [
            {
                "id": "00000000-0000-0000-0000-000000000031",
                "ref_id": "ln-1",
                "name": "Linia GPZ-Odbiorca",
                "tags": [],
                "meta": {},
                "from_bus_ref": "b1",
                "to_bus_ref": "b2",
                "status": "closed",
                "type": "line_overhead",
                "length_km": 5.0,
                "r_ohm_per_km": 0.08,
                "x_ohm_per_km": 0.32,
                "catalog_ref": "LINIA_SN:reczne",
                "catalog_namespace": "LINIA_SN",
            }
        ],
        "transformers": [],
        "sources": [
            {
                "id": "00000000-0000-0000-0000-000000000051",
                "tags": [],
                "meta": {},
                **gpz_source_record(
                    ref_id="s1",
                    name="S1",
                    bus_ref="b1",
                    voltage_kv=U_KV,
                    sk3_mva=500.0,
                    rx_ratio=0.10,
                ),
            }
        ],
        "loads": [
            {
                "id": "00000000-0000-0000-0000-000000000041",
                "ref_id": "load-1",
                "name": "Odbior",
                "tags": [],
                "meta": {},
                "bus_ref": "b2",
                "p_mw": p_mw,
                "q_mvar": q_mvar,
            }
        ],
        "generators": [],
        "shunt_capacitors": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
        "branch_points": [],
    }


def _siec_parytetu(*, p_mw: float, q_mvar: float) -> LoadFlowRunInput:
    return LoadFlowRunInput(
        base_mva=BASE_MVA,
        slack_node_id="slack",
        slack_u_pu=1.0,
        slack_angle_rad=0.0,
        nodes=(
            LoadFlowNodeInput("slack", "SLACK", U_KV),
            LoadFlowNodeInput("odbiorca", "PQ", U_KV),
        ),
        branches=(LoadFlowBranchInput("ln-1", "slack", "odbiorca", 0.08, 0.32, 0.0, 5.0),),
        loads=(LoadFlowLoadInput("odbiorca", p_mw, q_mvar),),
    )


def test_parytet_znaku_ze_sciezka_kanoniczna(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ta sama sieć przez silnik wykonawczy i przez sciezke kanoniczna ENM.

    Obie sciezki koncza sie na tym samym kontrakcie FROZEN, wiec musza podac te
    sama moc wezlowa co do znaku i co do wartosci. Rozjazd konwencji miedzy
    dwoma producentami tego samego pola byl wlasnie tresc dlugu z karty W2.
    """
    from enm.canonical_analysis import (
        _graph_id_from_ref,
        create_run,
        execute_run,
        reset_canonical_runs,
    )
    from enm.models import EnergyNetworkModel
    from enm.store import reset_enm_store, set_enm

    p_mw, q_mvar = 2.0, 0.8

    reset_canonical_runs()
    reset_enm_store()
    try:
        case_id = "w2-parytet"
        set_enm(
            case_id,
            EnergyNetworkModel.model_validate(_payload_enm_dwie_szyny(p_mw=p_mw, q_mvar=q_mvar)),
        )
        run = execute_run(
            create_run(case_id=case_id, analysis_type="PF", options={"base_mva": BASE_MVA}).id
        )
        assert run.status == "FINISHED", run.error_message
        kanoniczne = {
            b["bus_id"]: b for b in run.raw_result["result_v1"]["bus_results"]  # type: ignore[index]
        }
        kan_odbior = kanoniczne[_graph_id_from_ref("b2")]
        kan_slack = kanoniczne[_graph_id_from_ref("b1")]
    finally:
        reset_canonical_runs()
        reset_enm_store()

    wynik, _ = _uruchom(monkeypatch, _siec_parytetu(p_mw=p_mw, q_mvar=q_mvar))
    silnik = {b.bus_id: b for b in wynik.bus_results}

    assert silnik["odbiorca"].p_injected_mw == pytest.approx(
        kan_odbior["p_injected_mw"], abs=TOL_MW
    )
    assert silnik["odbiorca"].q_injected_mvar == pytest.approx(
        kan_odbior["q_injected_mvar"], abs=TOL_MW
    )
    assert silnik["slack"].p_injected_mw == pytest.approx(kan_slack["p_injected_mw"], abs=TOL_MW)
    assert silnik["slack"].q_injected_mvar == pytest.approx(
        kan_slack["q_injected_mvar"], abs=TOL_MW
    )
    # Parytet nie moze byc spelniony „na zero" — obie sciezki maja podac
    # rzeczywisty pobor, a nie zgodnie milczec.
    assert silnik["odbiorca"].p_injected_mw == pytest.approx(-p_mw, abs=TOL_MW)


# ---------------------------------------------------------------------------
# Predykaty parami + przypiete deklaracje (regula KLASA pkt 3 i 4)
# ---------------------------------------------------------------------------


def test_zbiory_pq_i_pv_sa_rozlaczne_z_jednego_zrodla_prawdy() -> None:
    """Komentarz przy montazu opiera sie na rozlacznosci zbiorow PQ i PV.

    Zrodlem tej prawdy jest walidacja solvera, nie zalozenie warstwy aplikacji —
    i to jest tu przypiete. Gdyby solver kiedys zaczal dopuszczac szyne
    jednoczesnie PQ i PV, montaz musi zostac przemyslany (nadpisanie zamiast
    sumowania), wiec test ma wtedy zapalic sie na czerwono.
    """
    lf = _siec(
        (LoadFlowLoadInput("n1", 2.0, 0.8),),
        (LoadFlowGeneratorInput("n1", -1.0, 1.0, -5.0, 5.0),),
    )
    engine = ExecutionEngineService()
    case = new_study_case(project_id=uuid4(), name="W2 rozlacznosc", config=StudyCaseConfig())
    engine.register_study_case(case)
    run = engine.create_run(
        study_case_id=case.id,
        analysis_type=ExecutionAnalysisType.LOAD_FLOW,
        solver_input=lf.canonical_dict(),
    )
    with pytest.raises(ValueError, match="both PQ and PV"):
        engine.execute_run_load_flow(
            run.id,
            load_flow_input=lf,
            readiness_snapshot={"ready": True},
            validation_snapshot={"valid": True},
        )


def test_dlug_w2_d1_moc_bierna_szyny_pv_nie_jest_publikowana(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """DLUG W2-D1, przypiety swiadomie — moc bierna szyny PV nie jest raportowana.

    Moc bierna szyny PV jest zmienna swobodna rozwiazania i solver nie publikuje
    jej per wezel (``effective_pq_injections`` przechodzi wylacznie po
    ``pf_input.pq``). Warstwa aplikacji nie moze jej policzyc — to byloby liczenie
    fizyki poza solverem. Do czasu, az solver zacznie publikowac zbiezne Q szyn
    PV, raport pokazuje tam 0,0 Mvar, choc fizyka daje wartosc niezerowa.

    Test przypina POMIAR tej luki: gdy solver zacznie ja wypelniac, test padnie i
    wymusi aktualizacje montazu oraz skreslenie dlugu — dlug nie zniknie po cichu.
    """
    lf = _siec(
        (LoadFlowLoadInput("n1", 2.0, 0.8),),
        (LoadFlowGeneratorInput("n2", -1.0, 1.0, -5.0, 5.0),),
    )
    wynik, _ = _uruchom(monkeypatch, lf)
    szyna_pv = {b.bus_id: b for b in wynik.bus_results}["n2"]
    sedzia = _sedzia_bilans_wezlowy(lf, wynik)

    assert szyna_pv.q_injected_mvar == 0.0, "stan znany: brak publikacji Q szyny PV"
    assert (
        abs(sedzia["n2"].imag) > 0.1
    ), "sedzia musi wskazywac niezerowa moc bierna, inaczej test nie mierzy luki"
    # Moc CZYNNA szyny PV jest natomiast w pelni poprawna — luka dotyczy wylacznie Q.
    assert szyna_pv.p_injected_mw == pytest.approx(sedzia["n2"].real, abs=TOL_MW)


def test_szyna_tranzytowa_ma_zerowe_wstrzykniecie(monkeypatch: pytest.MonkeyPatch) -> None:
    """Szyna tranzytowa: 0,0 jest tam PRAWDA, nie cichym zerem.

    Rozroznienie istotne po naprawie — montaz inicjuje slownik zerami i tylko
    szyny znane solverowi sa nadpisywane. Szyna tranzytowa jest tu zadeklarowana
    JAWNIE (wpis o zerowej mocy), bo dopiero wtedy solver bierze ja do wektora
    stanu; wariant bez wpisu opisuje dlug W2-D2 w tescie ponizej.
    """
    lf = _siec((LoadFlowLoadInput("n1", 0.0, 0.0), LoadFlowLoadInput("n2", 1.5, 0.6)))
    wynik, _ = _uruchom(monkeypatch, lf)
    tranzyt = {b.bus_id: b for b in wynik.bus_results}["n1"]
    sedzia = _sedzia_bilans_wezlowy(lf, wynik)

    assert tranzyt.p_injected_mw == pytest.approx(0.0, abs=TOL_MW)
    assert tranzyt.q_injected_mvar == pytest.approx(0.0, abs=TOL_MW)
    assert sedzia["n1"].real == pytest.approx(0.0, abs=TOL_MW)
    assert sedzia["n1"].imag == pytest.approx(0.0, abs=TOL_MW)


def test_dlug_w2_d2_szyna_bez_wpisu_zachowuje_sie_jak_drugi_slack(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """DLUG W2-D2, przypiety swiadomie — szyna wyspy BEZ wpisu nie wchodzi do stanu.

    Znalezisko POZA torem karty W2 (naprawa lezy w
    ``application/execution_engine/load_flow_run_input.py::to_power_flow_input``,
    a nie w naprawianym tu montazu wyniku). Solver bierze do wektora stanu
    wylacznie szyny, dla ktorych istnieje specyfikacja PQ/PV
    (``power_flow_newton.py``: ``pq_node_ids`` z ``pf_input.pq``). Wezel wyspy bez
    zadnego odbioru NIE dostaje tu specyfikacji, wiec zostaje na napieciu startu
    plaskiego i zachowuje sie jak DRUGI wezel bilansujacy: zasila odbior za soba,
    a slack oddaje niemal zero.

    Sciezka kanoniczna tego nie ma — ``enm/canonical_analysis`` buduje PQSpec dla
    KAZDEGO wezla PQ grafu, takze o zerowej mocy.

    Test przypina POMIAR luki, zeby nie zginela: gdy budowniczy wejscia zacznie
    deklarowac wszystkie wezly wyspy, asercje pekna i wymusza skreslenie dlugu.
    """
    lf = _siec((LoadFlowLoadInput("n2", 1.5, 0.6),))
    wynik, _ = _uruchom(monkeypatch, lf)
    szyny = {b.bus_id: b for b in wynik.bus_results}
    sedzia = _sedzia_bilans_wezlowy(lf, wynik)

    # Stan znany: szyna n1 nie ma wpisu, wiec raport podaje dla niej zero...
    assert szyny["n1"].p_injected_mw == 0.0
    # ...podczas gdy fizyka przy raportowanych napieciach daje ~1,5 MW wstrzykniecia,
    # bo napiecie n1 zostalo przypiete do startu plaskiego (|V| = 1,0, kat 0).
    assert szyny["n1"].v_pu == pytest.approx(1.0, abs=1e-12)
    assert sedzia["n1"].real == pytest.approx(1.5047022162980206, rel=1e-6)
    # I dlatego slack nie oddaje mocy czynnej, choc odbior 1,5 MW pracuje.
    assert abs(szyny["slack"].p_injected_mw) < 1e-3


def test_montaz_uzywa_szyn_solvera_a_nie_surowych_skladnikow(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Predykat wejscia i wyjscia z JEDNEGO zrodla (regula KLASA pkt 3).

    Kilka odbiorow na jednej szynie jest zwijane przez ``merge_bus_components``
    do JEDNEJ specyfikacji szynowej, wiec montaz musi kluczowac po szynach, ktore
    zobaczyl solver — inaczej zwiniecie i rozwiniecie chodzilyby po roznych
    zbiorach. Test pilnuje, ze suma skladnikow trafia na szyne raz i z wlasciwym
    znakiem.
    """
    lf = _siec(
        (
            LoadFlowLoadInput("n1", 1.2, 0.5),
            LoadFlowLoadInput("n1", 0.8, 0.3),
        ),
    )
    _, przechwycone = _uruchom(monkeypatch, lf)
    p_pu = przechwycone["node_p_injected_pu"]
    q_pu = przechwycone["node_q_injected_pu"]

    assert p_pu["n1"] == pytest.approx(-(1.2 + 0.8) / BASE_MVA, rel=1e-12)
    assert q_pu["n1"] == pytest.approx(-(0.5 + 0.3) / BASE_MVA, rel=1e-12)
    # Szyny wymienione w wejsciu, ale bez zadnej mocy, pozostaja jawnym zerem.
    assert p_pu["n2"] == 0.0
    assert q_pu["n2"] == 0.0


def test_wynik_jest_deterministyczny_po_naprawie(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ta sama sieć dwa razy — identyczne moce wezlowe co do bitu."""
    lf = _sieci_iloczyn_cech()["odbior ZIP razem z generacja PV"]
    pierwszy, _ = _uruchom(monkeypatch, lf)
    drugi, _ = _uruchom(monkeypatch, lf)
    assert [b.to_dict() for b in pierwszy.bus_results] == [b.to_dict() for b in drugi.bus_results]


def test_build_power_flow_result_v1_pozostaje_nietkniete() -> None:
    """Kontrakt FROZEN jest czytany, nie zmieniany — naprawa dotyczy WARTOSCI.

    Zla wartosc byla defektem, ksztalt jest zamrozony: pole nadal nazywa sie
    ``p_injected_mw`` i nadal znaczy injekcje.
    """
    wynik = build_power_flow_result_v1(
        converged=True,
        iterations_count=1,
        tolerance_used=1e-8,
        base_mva=BASE_MVA,
        slack_bus_id="s",
        node_u_mag={"s": 1.0, "a": 0.99},
        node_angle={"s": 0.0, "a": -0.01},
        node_p_injected_pu={"s": 0.02, "a": -0.02},
        node_q_injected_pu={"s": 0.01, "a": -0.01},
        branch_s_from_mva={},
        branch_s_to_mva={},
        losses_total=0j,
        slack_power_pu=complex(0.02, 0.01),
    )
    szyny = {b.bus_id: b for b in wynik.bus_results}
    assert szyny["a"].p_injected_mw == pytest.approx(-2.0)
    assert szyny["s"].p_injected_mw == pytest.approx(2.0)
