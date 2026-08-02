"""V12K-313 + V12K-316 (dlug 5): WEZEL ZLOZONY w kontrakcie wejsciowym rozplywu.

Dwa dlugi tej samej klasy — kontrakt wejsciowy nie umial opisac szyny, na ktorej
stoi odbior i zrodlo naraz:

1. (V12K-316, poz. 5) wpis niosl moc WYPADKOWA szyny i mogl niesc regulacje
   falownika, ale wariant „odbior stalomocowy + falownik na jednej szynie" nie
   mial ZADNEGO znacznika. Solver nie odroznial go od szyny samego zrodla, wiec
   ksztaltowanie falownika liczylo z mocy szyny (czyli z mocy ODBIORU) zamiast z
   wlasnej mocy wytworcy. Wariant z modelem odbioru (ZIP) byl odrzucany jawnie —
   ten nie byl, bo nie bylo po czym go poznac.
2. (V12K-313, dlug nazwany) budowniczowie emituja jeden wpis na SKLADNIK, a
   kontrakt solvera trzyma jeden `PQSpec` na SZYNE: `build_power_spec_v2`
   PRZYPISUJE, a `validate_input` odrzuca duplikat `node_id`. Dwa odbiory na
   jednej szynie — model calkowicie legalny — bywaly wiec albo nadpisywane, albo
   odrzucane jako sprzecznosc.

Naprawa jest w warstwie budowania wejscia (`merge_bus_components`), wspolna dla
wszystkich trzech budowniczych: moc szyny AKUMULUJE sie, a skladniki zostaja
odzyskiwalne — wlasna moc zrodla laduje w `inverter_p_mw`/`inverter_q_mvar`
(konwencja generatorowa), baza odbiorowa w `zip_base_p_mw`/`zip_base_q_mvar`.

Testy sa ILOCZYNEM CECH, nie przykladem z karty: {brak odbioru, odbior
stalomocowy, odbior ZIP} × {zrodlo z regulacja, zrodlo bez} × {trzej
budowniczowie}. Liczby rozplywu sedziuje NIEZALEZNY Newton napisany w tescie —
zaden wynik solvera nie jest porownywany wylacznie z innym wynikiem solvera.
"""

from __future__ import annotations

import hashlib
import math
import sys
from pathlib import Path
from uuid import uuid4

import pytest

backend_src = Path(__file__).parents[2] / "src"
sys.path.insert(0, str(backend_src))

from application.analysis_run import AnalysisRunService
from application.execution_engine.load_flow_run_input import (
    LoadFlowBranchInput,
    LoadFlowLoadInput,
    LoadFlowNodeInput,
    LoadFlowRunInput,
)
from application.network_wizard import NetworkWizardService
from application.network_wizard.dtos import (
    BranchPayload,
    LoadPayload,
    NodePayload,
    SourcePayload,
)
from application.power_flow_input_builder import build_power_flow_input, merge_bus_components
from domain.project_design_mode import ProjectDesignMode
from infrastructure.persistence.db import create_engine_from_url, create_session_factory, init_db
from infrastructure.persistence.unit_of_work import build_uow_factory
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.power_flow_newton import (
    PowerFlowNewtonSolution,
    solve_power_flow_physics,
)
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)
from network_model.solvers.power_flow_zip import ZipCoeffs

# --------------------------------------------------------------------------
# Wspolny scenariusz: slack A -- linia -- szyna B (ta sama siec u kazdego z
# trzech budowniczych, zeby parytet dotyczyl kontraktu, a nie topologii).
# --------------------------------------------------------------------------
BASE_MVA = 10.0
KV = 15.0
LEN_KM = 12.0
R_OHM_KM = 0.4
X_OHM_KM = 0.8

LOAD_P_MW = 3.0
LOAD_Q_MVAR = 1.5
# Wlasna moc zrodla, konwencja GENERATOROWA (>0 = wstrzyk do sieci).
SRC_P_MW = 2.0
SRC_Q_MVAR = 0.4

COSPHI = 0.95
TAN_COSPHI = math.tan(math.acos(COSPHI))
# Odbior stalopradowy/stalooporowy: wielomian, ktory realnie gryzie.
ZIP_PARAMS = {"a_p": 1.0, "b_p": 0.0, "c_p": 0.0, "a_q": 1.0, "b_q": 0.0, "c_q": 0.0}
ZIP_Z = ZipCoeffs(a_p=1.0, b_p=0.0, c_p=0.0, a_q=1.0, b_q=0.0, c_q=0.0)
CONTROL_PARAMS = {"control_mode": "STALY_COS_PHI", "cosphi": COSPHI}

LOAD_KINDS = ("brak_odbioru", "odbior_stalomocowy", "odbior_zip")
SOURCE_KINDS = ("zrodlo_regulowane", "zrodlo_bez_regulacji")


def _load_power(load_kind: str) -> tuple[float, float]:
    if load_kind == "brak_odbioru":
        return 0.0, 0.0
    return LOAD_P_MW, LOAD_Q_MVAR


def _graph() -> NetworkGraph:
    graph = NetworkGraph()
    graph.add_node(
        Node(
            id="A",
            name="A",
            node_type=NodeType.SLACK,
            voltage_level=KV,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    graph.add_node(
        Node(
            id="B",
            name="B",
            node_type=NodeType.PQ,
            voltage_level=KV,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graph.add_branch(
        LineBranch(
            id="L",
            name="L",
            branch_type=BranchType.LINE,
            from_node_id="A",
            to_node_id="B",
            r_ohm_per_km=R_OHM_KM,
            x_ohm_per_km=X_OHM_KM,
            b_us_per_km=0.0,
            length_km=LEN_KM,
            rated_current_a=400.0,
        )
    )
    return graph


def _options() -> PowerFlowOptions:
    return PowerFlowOptions(max_iter=600, tolerance=1e-11)


# --------------------------------------------------------------------------
# Trzej budowniczowie — kazdy dostaje TEN SAM opis szyny zlozonej, w swoim
# wlasnym ksztalcie danych (dict / wpis kanoniczny / migawka biegu).
# --------------------------------------------------------------------------


def _via_generic_builder(load_kind: str, source_kind: str) -> PowerFlowInput:
    """Budowniczy 1: `application.power_flow_input_builder.build_power_flow_input`."""
    entries: list[dict[str, object]] = []
    load_p, load_q = _load_power(load_kind)
    if load_kind != "brak_odbioru":
        entry: dict[str, object] = {"node_id": "B", "p_mw": load_p, "q_mvar": load_q}
        if load_kind == "odbior_zip":
            entry.update(ZIP_PARAMS)
        entries.append(entry)
    source: dict[str, object] = {
        # Wpis zrodla jest w konwencji ODBIOROWEJ (jak caly PQSpec), wiec wstrzyk
        # zapisujemy ze znakiem minus — dokladnie tak, jak robia to budowniczowie
        # produkcyjne dla nastawy falownika.
        "node_id": "B",
        "p_mw": -SRC_P_MW,
        "q_mvar": -SRC_Q_MVAR,
    }
    if source_kind == "zrodlo_regulowane":
        source["inverter_control"] = dict(CONTROL_PARAMS)
    entries.append(source)
    return build_power_flow_input(
        graph=_graph(),
        base_mva=BASE_MVA,
        slack={"node_id": "A", "u_pu": 1.0, "angle_rad": 0.0},
        pq=entries,
        options=_options(),
    )


def _via_execution_engine(load_kind: str, source_kind: str) -> PowerFlowInput:
    """Budowniczy 2: `application.execution_engine.load_flow_run_input.LoadFlowRunInput`."""
    loads: list[LoadFlowLoadInput] = []
    load_p, load_q = _load_power(load_kind)
    if load_kind != "brak_odbioru":
        loads.append(
            LoadFlowLoadInput(
                node_id="B",
                p_mw=load_p,
                q_mvar=load_q,
                zip_coeffs=ZIP_Z if load_kind == "odbior_zip" else None,
            )
        )
    loads.append(
        LoadFlowLoadInput(
            node_id="B",
            p_mw=-SRC_P_MW,
            q_mvar=-SRC_Q_MVAR,
            inverter_control_params=(
                dict(CONTROL_PARAMS) if source_kind == "zrodlo_regulowane" else None
            ),
        )
    )
    run_input = LoadFlowRunInput(
        base_mva=BASE_MVA,
        slack_node_id="A",
        slack_u_pu=1.0,
        slack_angle_rad=0.0,
        nodes=(
            LoadFlowNodeInput("A", "SLACK", KV),
            LoadFlowNodeInput("B", "PQ", KV),
        ),
        branches=(LoadFlowBranchInput("L", "A", "B", R_OHM_KM, X_OHM_KM, 0.0, LEN_KM),),
        loads=tuple(loads),
        options=_options(),
    )
    return run_input.to_power_flow_input()


def _analysis_run_services() -> tuple[NetworkWizardService, AnalysisRunService]:
    engine = create_engine_from_url("sqlite+pysqlite:///:memory:")
    init_db(engine)
    session_factory = create_session_factory(engine)
    uow_factory = build_uow_factory(session_factory)
    return NetworkWizardService(uow_factory), AnalysisRunService(uow_factory)


def _build_analysis_run(load_kind: str, source_kind: str):
    """Budowniczy 3: pelna sciezka `AnalysisRunService` (model -> migawka -> wejscie)."""
    wizard, service = _analysis_run_services()
    project = wizard.create_project(f"{load_kind}-{source_kind}")
    slack = wizard.add_node(
        project.id,
        NodePayload(
            name="A",
            node_type="SLACK",
            base_kv=KV,
            attrs={"voltage_magnitude_pu": 1.0, "voltage_angle_rad": 0.0},
        ),
    )
    bus = wizard.add_node(
        project.id,
        NodePayload(
            name="B",
            node_type="PQ",
            base_kv=KV,
            attrs={"active_power_mw": 0.0, "reactive_power_mvar": 0.0},
        ),
    )
    wizard.add_branch(
        project.id,
        BranchPayload(
            name="L",
            branch_type="LINE",
            from_node_id=slack["id"],
            to_node_id=bus["id"],
            params={
                "r_ohm_per_km": R_OHM_KM,
                "x_ohm_per_km": X_OHM_KM,
                "b_us_per_km": 0.0,
                "length_km": LEN_KM,
            },
        ),
    )
    wizard.set_connection_node(project.id, slack["id"])
    wizard.add_source(
        project.id,
        SourcePayload(
            name="Grid",
            node_id=slack["id"],
            source_type="GRID",
            payload={"name": "Grid", "grid_supply": True, "u_pu": 1.0},
        ),
    )
    if load_kind != "brak_odbioru":
        load_payload: dict[str, object] = {
            "name": "Odbior",
            "p_mw": LOAD_P_MW,
            "q_mvar": LOAD_Q_MVAR,
        }
        if load_kind == "odbior_zip":
            load_payload.update(ZIP_PARAMS)
        wizard.add_load(
            project.id,
            LoadPayload(name="Odbior", node_id=bus["id"], payload=load_payload),
        )
    source_payload: dict[str, object] = {"name": "INV"}
    if source_kind == "zrodlo_regulowane":
        source_payload.update(CONTROL_PARAMS)
    inverter = wizard.add_source(
        project.id,
        SourcePayload(
            name="INV",
            node_id=bus["id"],
            source_type="INVERTER",
            payload=source_payload,
            type_ref=uuid4(),
        ),
    )
    case = wizard.create_operating_case(
        project.id,
        "Normal",
        {
            "base_mva": BASE_MVA,
            "active_snapshot_id": str(uuid4()),
            "project_design_mode": ProjectDesignMode.SN_NETWORK.value,
        },
    )
    # Nastawa w konwencji ODBIOROWEJ wpisu (jak `_resolve_inverter_q_mvar`), wiec
    # wstrzyk ma znak minus.
    wizard.set_inverter_setpoints(case.id, inverter["id"], p_mw=-SRC_P_MW, q_mvar=-SRC_Q_MVAR)
    run = service.create_power_flow_run(project.id, case.id)
    return service, run, str(bus["id"])


def _via_analysis_run(load_kind: str, source_kind: str) -> tuple[PowerFlowInput, str]:
    service, run, bus_id = _build_analysis_run(load_kind, source_kind)
    return service._build_power_flow_input(run), bus_id


BUILDERS = ("budowniczy_generyczny", "budowniczy_silnika_biegow", "budowniczy_analysis_run")


def _bus_spec(builder: str, load_kind: str, source_kind: str) -> PQSpec:
    """Zwrocony `PQSpec` szyny zlozonej od wskazanego budowniczego."""
    if builder == "budowniczy_generyczny":
        pf_input = _via_generic_builder(load_kind, source_kind)
        bus_id = "B"
    elif builder == "budowniczy_silnika_biegow":
        pf_input = _via_execution_engine(load_kind, source_kind)
        bus_id = "B"
    else:
        pf_input, bus_id = _via_analysis_run(load_kind, source_kind)
    specs = [spec for spec in pf_input.pq if spec.node_id == bus_id]
    assert len(specs) == 1, f"{builder}: szyna zlozona musi dac DOKLADNIE jeden wpis"
    return specs[0]


# --------------------------------------------------------------------------
# (a) ILOCZYN CECH: {brak, stalomocowy, ZIP} × {z regulacja, bez} × 3 budowniczych
# --------------------------------------------------------------------------


@pytest.mark.parametrize("builder", BUILDERS)
@pytest.mark.parametrize("source_kind", SOURCE_KINDS)
@pytest.mark.parametrize("load_kind", LOAD_KINDS)
def test_wezel_zlozony_niesie_skladniki_a_nie_sume(
    load_kind: str, source_kind: str, builder: str
) -> None:
    """Skladniki szyny musza byc ODZYSKIWALNE z wejscia solvera.

    Moc szyny to suma, ale obok niej wejscie niesie wlasna moc regulowanego zrodla
    (konwencja generatorowa) i baze odbiorowa modelu napieciowego. Bez tego szyna
    „odbior + falownik" jest nie do odroznienia od szyny samego zrodla i ksztaltowanie
    liczy z mocy odbioru (V12K-316, dlug 5).
    """
    spec = _bus_spec(builder, load_kind, source_kind)
    load_p, load_q = _load_power(load_kind)

    # Moc szyny: AKUMULACJA skladnikow, nigdy przypisanie (V12K-313).
    assert spec.p_mw == pytest.approx(load_p - SRC_P_MW, abs=1e-12)
    assert spec.q_mvar == pytest.approx(load_q - SRC_Q_MVAR, abs=1e-12)

    if source_kind == "zrodlo_regulowane":
        assert spec.inverter_control is not None
        assert spec.inverter_p_mw == pytest.approx(SRC_P_MW, abs=1e-12)
        assert spec.inverter_q_mvar == pytest.approx(SRC_Q_MVAR, abs=1e-12)
    else:
        # Bez regulacji ksztaltowanie nie biegnie — pole zostaje puste, zeby
        # kontrolka nie udawala danych, ktorych nikt nie czyta (zero fabrykacji).
        assert spec.inverter_control is None
        assert spec.inverter_p_mw is None
        assert spec.inverter_q_mvar is None

    if load_kind == "odbior_zip":
        assert spec.zip_coeffs == ZIP_Z
        # Baza odbiorowa: wielomian skaluje ODBIOR, nie generacje (defekt D1).
        assert spec.zip_base_p_mw == pytest.approx(LOAD_P_MW, abs=1e-12)
        assert spec.zip_base_q_mvar == pytest.approx(LOAD_Q_MVAR, abs=1e-12)
    else:
        assert spec.zip_coeffs is None
        assert spec.zip_base_p_mw is None
        assert spec.zip_base_q_mvar is None


@pytest.mark.parametrize("source_kind", SOURCE_KINDS)
@pytest.mark.parametrize("load_kind", LOAD_KINDS)
def test_trzej_budowniczowie_mowia_jednym_glosem(load_kind: str, source_kind: str) -> None:
    """Parytet: ten sam scenariusz daje z kazdego budowniczego TEN SAM ksztalt."""

    def _shape(builder: str) -> tuple[object, ...]:
        spec = _bus_spec(builder, load_kind, source_kind)
        return (
            spec.p_mw,
            spec.q_mvar,
            spec.zip_coeffs,
            spec.zip_base_p_mw,
            spec.zip_base_q_mvar,
            spec.inverter_p_mw,
            spec.inverter_q_mvar,
        )

    reference = _shape(BUILDERS[0])
    for builder in BUILDERS[1:]:
        assert _shape(builder) == reference, builder


# --------------------------------------------------------------------------
# (b) AKUMULACJA: dwa odbiory na jednej szynie sumuja sie; sprzecznosc odrzucona
# --------------------------------------------------------------------------


def test_dwa_odbiory_na_jednej_szynie_sumuja_sie_zamiast_nadpisywac() -> None:
    """V12K-313: `build_power_spec_v2` PRZYPISUJE, a `validate_input` odrzuca
    duplikat — legalny model „dwa odbiory na jednej szynie" gubil jeden z nich
    albo wywracal bieg. Po zlozeniu szyna ma jeden wpis o mocy bedacej SUMA."""
    merged = merge_bus_components(
        [
            PQSpec(node_id="B", p_mw=1.25, q_mvar=0.5),
            PQSpec(node_id="B", p_mw=2.75, q_mvar=0.25),
            PQSpec(node_id="C", p_mw=1.0, q_mvar=0.0),
        ]
    )
    assert [spec.node_id for spec in merged] == ["B", "C"]
    assert merged[0].p_mw == pytest.approx(4.0, abs=1e-12)
    assert merged[0].q_mvar == pytest.approx(0.75, abs=1e-12)
    assert merged[1].p_mw == pytest.approx(1.0, abs=1e-12)


def test_suma_skladnikow_nie_zalezy_od_kolejnosci_ich_zgloszenia() -> None:
    """Determinizm: skladniki sumujemy `math.fsum`, wiec permutacja wejscia nie
    moze przesunac wyniku o ulp (kanoniczny odcisk wejscia sortuje po `node_id`
    i nie widzi kolejnosci skladnikow tej samej szyny)."""
    parts = [
        PQSpec(node_id="B", p_mw=0.1, q_mvar=0.0),
        PQSpec(node_id="B", p_mw=0.2, q_mvar=0.0),
        PQSpec(node_id="B", p_mw=0.3, q_mvar=0.0),
    ]
    forward = merge_bus_components(parts)[0].p_mw
    backward = merge_bus_components(list(reversed(parts)))[0].p_mw
    assert forward == backward


def test_dwa_modele_napieciowe_na_szynie_sumuja_sie_wagowo() -> None:
    """Dwa ROZNE modele odbioru to nie sprzecznosc, tylko sumowalnosc: skladamy je
    kanonicznym `aggregate_zip` solvera (ten sam, ktorego uzywa granica ENM), a nie
    druga formula. Baza odbiorowa to suma obu odbiorow."""
    stala_impedancja = ZipCoeffs(a_p=1.0, b_p=0.0, c_p=0.0, a_q=1.0, b_q=0.0, c_q=0.0)
    staly_prad = ZipCoeffs(a_p=0.0, b_p=1.0, c_p=0.0, a_q=0.0, b_q=1.0, c_q=0.0)
    merged = merge_bus_components(
        [
            PQSpec(node_id="B", p_mw=3.0, q_mvar=1.0, zip_coeffs=stala_impedancja),
            PQSpec(node_id="B", p_mw=1.0, q_mvar=1.0, zip_coeffs=staly_prad),
        ]
    )[0]
    assert merged.p_mw == pytest.approx(4.0, abs=1e-12)
    assert merged.zip_base_p_mw == pytest.approx(4.0, abs=1e-12)
    assert merged.zip_base_q_mvar == pytest.approx(2.0, abs=1e-12)
    assert merged.zip_coeffs is not None
    # Waga po mocy czynnej: 3/4 stalej impedancji + 1/4 stalego pradu.
    assert merged.zip_coeffs.a_p == pytest.approx(0.75, abs=1e-12)
    assert merged.zip_coeffs.b_p == pytest.approx(0.25, abs=1e-12)
    assert merged.zip_coeffs.a_q == pytest.approx(0.5, abs=1e-12)
    assert merged.zip_coeffs.b_q == pytest.approx(0.5, abs=1e-12)


def test_dwa_regulowane_zrodla_na_szynie_sa_odrzucane_jawnym_bledem() -> None:
    """Sprzecznosc, nie sumowalnosc: kontrakt ma DOKLADNIE jedna charakterystyke na
    wezel, wiec ciche wybranie jednego z dwoch skasowalo by drugie z modelu."""
    control = {"control_mode": "STALY_COS_PHI", "cosphi": 0.95}
    with pytest.raises(ValueError, match="ONE inverter characteristic per bus"):
        build_power_flow_input(
            graph=_graph(),
            base_mva=BASE_MVA,
            slack={"node_id": "A", "u_pu": 1.0, "angle_rad": 0.0},
            pq=[
                {"node_id": "B", "p_mw": -1.0, "q_mvar": 0.0, "inverter_control": dict(control)},
                {"node_id": "B", "p_mw": -2.0, "q_mvar": 0.0, "inverter_control": dict(control)},
            ],
            options=_options(),
        )


def test_skladanie_nie_zostawia_duplikatu_dla_walidatora_solvera() -> None:
    """Walidacja duplikatow ma odrzucac SPRZECZNOSC, nie sumowalnosc: po zlozeniu
    `validate_input` nie widzi juz duplikatu `node_id` i bieg dochodzi do skutku."""
    pf_input = _via_generic_builder("odbior_stalomocowy", "zrodlo_regulowane")
    pf_input.options.validate = True
    solution = solve_power_flow_physics(pf_input)
    assert solution.validation_errors == []
    assert solution.converged


# --------------------------------------------------------------------------
# (a2) Wpis JUZ ZAGREGOWANY: pole addytywne niesie wlasna moc zrodla
# --------------------------------------------------------------------------


def _aggregated_bus_spec(builder: str, load_kind: str) -> PQSpec:
    """Szyna zlozona opisana JEDNYM wpisem o mocy wypadkowej + wlasna moc zrodla."""
    load_p, load_q = _load_power(load_kind)
    net_p = load_p - SRC_P_MW
    net_q = load_q - SRC_Q_MVAR
    if builder == "budowniczy_generyczny":
        pf_input = build_power_flow_input(
            graph=_graph(),
            base_mva=BASE_MVA,
            slack={"node_id": "A", "u_pu": 1.0, "angle_rad": 0.0},
            pq=[
                {
                    "node_id": "B",
                    "p_mw": net_p,
                    "q_mvar": net_q,
                    "inverter_control": dict(CONTROL_PARAMS),
                    "inverter_p_mw": SRC_P_MW,
                    "inverter_q_mvar": SRC_Q_MVAR,
                }
            ],
            options=_options(),
        )
        return pf_input.pq[0]
    if builder == "budowniczy_silnika_biegow":
        run_input = LoadFlowRunInput(
            base_mva=BASE_MVA,
            slack_node_id="A",
            slack_u_pu=1.0,
            slack_angle_rad=0.0,
            nodes=(LoadFlowNodeInput("A", "SLACK", KV), LoadFlowNodeInput("B", "PQ", KV)),
            branches=(LoadFlowBranchInput("L", "A", "B", R_OHM_KM, X_OHM_KM, 0.0, LEN_KM),),
            loads=(
                LoadFlowLoadInput(
                    node_id="B",
                    p_mw=net_p,
                    q_mvar=net_q,
                    inverter_control_params=dict(CONTROL_PARAMS),
                    inverter_p_mw=SRC_P_MW,
                    inverter_q_mvar=SRC_Q_MVAR,
                ),
            ),
            options=_options(),
        )
        return run_input.to_power_flow_input().pq[0]
    service, run, bus_id = _build_analysis_run(load_kind, "zrodlo_regulowane")
    pozostale = [item for item in run.input_snapshot["pq"] if item["node_id"] != bus_id]
    kontrola = next(
        item["inverter_control"]
        for item in run.input_snapshot["pq"]
        if item["node_id"] == bus_id and "inverter_control" in item
    )
    run.input_snapshot["pq"] = pozostale + [
        {
            "node_id": bus_id,
            "p_mw": net_p,
            "q_mvar": net_q,
            "inverter_control": kontrola,
            "inverter_p_mw": SRC_P_MW,
            "inverter_q_mvar": SRC_Q_MVAR,
        }
    ]
    return next(spec for spec in service._build_power_flow_input(run).pq if spec.node_id == bus_id)


@pytest.mark.parametrize("builder", BUILDERS)
@pytest.mark.parametrize("load_kind", ("brak_odbioru", "odbior_stalomocowy"))
def test_wpis_zagregowany_deklaruje_wlasna_moc_zrodla(builder: str, load_kind: str) -> None:
    """Drugi ksztalt tego samego kontraktu: szyne zlozona wolno opisac JEDNYM
    wpisem o mocy wypadkowej, jesli wpis niesie wlasna moc zrodla.

    To jest wprost pole addytywne z rozstrzygniecia §2.1 — bez niego wpis o mocy
    wypadkowej jest nie do odroznienia od szyny samego zrodla. Wynik musi byc TEN
    SAM, co dla opisu skladnikowego (dwa wpisy) — inaczej kontrakt mowilby dwoma
    glosami o tej samej szynie."""
    zagregowany = _aggregated_bus_spec(builder, load_kind)
    skladnikowy = _bus_spec(builder, load_kind, "zrodlo_regulowane")
    assert zagregowany.p_mw == pytest.approx(skladnikowy.p_mw, abs=1e-12)
    assert zagregowany.q_mvar == pytest.approx(skladnikowy.q_mvar, abs=1e-12)
    assert zagregowany.inverter_p_mw == pytest.approx(SRC_P_MW, abs=1e-12)
    assert zagregowany.inverter_q_mvar == pytest.approx(SRC_Q_MVAR, abs=1e-12)
    assert zagregowany.zip_coeffs == skladnikowy.zip_coeffs


def test_zadeklarowana_moc_zrodla_wchodzi_do_odcisku_kanonicznego() -> None:
    """Addytywne NIE znaczy ignorowane: gdy wpis deklaruje wlasna moc zrodla,
    odcisk kanoniczny MUSI sie zmienic (inaczej dwa rozne modele mialyby jedna
    tozsamosc biegu)."""
    common: dict[str, object] = {
        "base_mva": BASE_MVA,
        "slack_node_id": "A",
        "slack_u_pu": 1.0,
        "slack_angle_rad": 0.0,
        "nodes": (LoadFlowNodeInput("A", "SLACK", KV), LoadFlowNodeInput("B", "PQ", KV)),
        "branches": (LoadFlowBranchInput("L", "A", "B", R_OHM_KM, X_OHM_KM, 0.0, LEN_KM),),
    }
    bez_pola = LoadFlowRunInput(
        **common, loads=(LoadFlowLoadInput(node_id="B", p_mw=1.0, q_mvar=0.5),)
    )
    z_polem = LoadFlowRunInput(
        **common,
        loads=(LoadFlowLoadInput(node_id="B", p_mw=1.0, q_mvar=0.5, inverter_p_mw=2.0),),
    )
    assert bez_pola.canonical_hash() != z_polem.canonical_hash()
    assert "inverter_p_mw" in z_polem.canonical_dict()["loads"][0]


# --------------------------------------------------------------------------
# (c) FROZEN: brak nowego pola => sciezka historyczna bajtowo bez zmian
# --------------------------------------------------------------------------


def _result_fingerprint(solution: PowerFlowNewtonSolution) -> str:
    """Odcisk SHA-256 liczb wyniku — sluzy do dowodu bajtowej niezmiennosci."""
    payload = repr(
        (
            solution.converged,
            solution.iterations,
            sorted(solution.node_u_mag.items()),
            sorted(solution.node_angle.items()),
            sorted(solution.node_p_spec_effective_pu.items()),
            sorted(solution.node_q_spec_effective_pu.items()),
            repr(solution.slack_power),
        )
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def test_szyna_samego_zrodla_z_regulacja_liczy_sie_bajtowo_jak_dotad() -> None:
    """Uzupelnienie `inverter_p_mw` na szynie BEZ odbioru nie moze ruszyc liczb.

    Historycznie `source_injection_pu` czytalo moc szyny (poprawnie, bo szyna JEST
    zrodlem). Jawne pole liczy dokladnie te sama wartosc — dowod SHA-256 na wyniku
    solvera, nie na deklaracji."""
    historyczny = PowerFlowInput(
        graph=_graph(),
        base_mva=BASE_MVA,
        slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
        pq=[
            PQSpec(
                node_id="B",
                p_mw=-SRC_P_MW,
                q_mvar=-SRC_Q_MVAR,
                inverter_control=_via_generic_builder("brak_odbioru", "zrodlo_regulowane")
                .pq[0]
                .inverter_control,
            )
        ],
        options=_options(),
    )
    assert historyczny.pq[0].inverter_p_mw is None
    po_naprawie = _via_generic_builder("brak_odbioru", "zrodlo_regulowane")
    assert po_naprawie.pq[0].inverter_p_mw == pytest.approx(SRC_P_MW, abs=1e-12)

    assert _result_fingerprint(solve_power_flow_physics(historyczny)) == _result_fingerprint(
        solve_power_flow_physics(po_naprawie)
    )


def test_pojedynczy_skladnik_bez_regulacji_wraca_tym_samym_obiektem() -> None:
    """Brak czego skladac i czego uzupelniac => oddajemy DOKLADNIE ten obiekt,
    ktory zbudowal wolajacy (zadna istniejaca migawka nie zmienia sie o bajt)."""
    spec = PQSpec(node_id="B", p_mw=1.0, q_mvar=0.25, zip_coeffs=ZIP_Z)
    merged = merge_bus_components([spec])
    assert merged[0] is spec


def test_wpis_bez_nowych_pol_nie_zmienia_odcisku_kanonicznego() -> None:
    """Pole ADDYTYWNE: klucze `inverter_p_mw`/`inverter_q_mvar` pojawiaja sie w
    kanonicznym slowniku dopiero, gdy wpis je deklaruje, wiec kazdy payload
    zapisany przed ich istnieniem hashuje sie identycznie. Odcisk przypiety
    literalem — inaczej zmiana kolejnosci kluczy przeszla by niezauwazona."""
    historyczny = LoadFlowRunInput(
        base_mva=100.0,
        slack_node_id="A",
        slack_u_pu=1.0,
        slack_angle_rad=0.0,
        nodes=(LoadFlowNodeInput("A", "SLACK", KV), LoadFlowNodeInput("B", "PQ", KV)),
        branches=(LoadFlowBranchInput("L", "A", "B", 0.1, 0.2, 0.0, 1.0),),
        loads=(LoadFlowLoadInput(node_id="B", p_mw=2.0, q_mvar=0.8),),
    )
    canonical_load = historyczny.canonical_dict()["loads"][0]
    assert set(canonical_load) == {"node_id", "p_mw", "q_mvar"}
    # Literal zmierzony na wersji SPRZED naprawy (baza V12K-316) i po niej —
    # identyczny.
    assert (
        historyczny.canonical_hash()
        == "050e954d16102af2da5ffe0134e2f2baa9cf3cbbb21302310294be212d4681cc"
    )


def test_migawka_odbioru_stalomocowego_nie_zyskuje_nowych_kluczy() -> None:
    """Migawka biegu `AnalysisRunService` niesie model napieciowy odbioru tylko
    wtedy, gdy odbior go ma; odbior stalomocowy zachowuje swoja migawke — a wiec i
    swoj `input_hash` — co do bajtu."""
    _service, run, bus_id = _build_analysis_run("odbior_stalomocowy", "zrodlo_bez_regulacji")
    wpisy = [item for item in run.input_snapshot["pq"] if item["node_id"] == bus_id]
    odbior = [item for item in wpisy if item["p_mw"] == LOAD_P_MW]
    assert len(odbior) == 1
    assert set(odbior[0]) == {"node_id", "p_mw", "q_mvar"}

    _service_zip, run_zip, bus_zip = _build_analysis_run("odbior_zip", "zrodlo_bez_regulacji")
    wpisy_zip = [item for item in run_zip.input_snapshot["pq"] if item["node_id"] == bus_zip]
    odbior_zip = [item for item in wpisy_zip if item["p_mw"] == LOAD_P_MW]
    assert len(odbior_zip) == 1
    assert ZIP_PARAMS.items() <= odbior_zip[0].items()


# --------------------------------------------------------------------------
# (d) Przypadek dotad ODRZUCANY liczy sie poprawnie — sedzia: niezalezny Newton
# --------------------------------------------------------------------------


def _judge(p_of_v, q_of_v) -> tuple[float, float, float]:
    """Niezalezny Newton dla ukladu slack--linia--B, napisany z samej fizyki.

    Dwa rownania, jakobian numeryczny, zero wspoldzielonego kodu z solverami — wiec
    odniesienie nie moze odziedziczyc ich defektu."""
    z_base = KV * KV / BASE_MVA
    y = 1.0 / complex(R_OHM_KM * LEN_KM / z_base, X_OHM_KM * LEN_KM / z_base)
    theta, mag = 0.0, 1.0

    def residual(th: float, m: float) -> tuple[float, float]:
        v = m * complex(math.cos(th), math.sin(th))
        s = v * (y * v - y).conjugate()
        return s.real - p_of_v(m), s.imag - q_of_v(m)

    for _ in range(300):
        f_p, f_q = residual(theta, mag)
        if max(abs(f_p), abs(f_q)) < 1e-14:
            break
        h = 1e-7
        jac = []
        for dth, dm in ((h, 0.0), (0.0, h)):
            g_p, g_q = residual(theta + dth, mag + dm)
            jac.append(((g_p - f_p) / h, (g_q - f_q) / h))
        det = jac[0][0] * jac[1][1] - jac[1][0] * jac[0][1]
        theta -= (f_p * jac[1][1] - f_q * jac[1][0]) / det
        mag -= (jac[0][0] * f_q - jac[0][1] * f_p) / det
    return mag, p_of_v(mag), q_of_v(mag)


@pytest.mark.parametrize("builder", BUILDERS)
@pytest.mark.parametrize("load_kind", LOAD_KINDS)
def test_szyna_prosumencka_liczy_sie_zgodnie_z_niezaleznym_newtonem(
    builder: str, load_kind: str
) -> None:
    """Kazdy z trzech budowniczych daje wejscie, na ktorym rozplyw ZGADZA SIE z
    niezaleznym Newtonem — takze dla wariantu, ktory przed naprawa albo wywracal
    bieg (duplikat / brak rozdzielenia ZIP), albo liczyl moc bierna zrodla z mocy
    ODBIORU (brak znacznika szyny prosumenckiej)."""
    spec = _bus_spec(builder, load_kind, "zrodlo_regulowane")
    pf_input = PowerFlowInput(
        graph=_graph(),
        base_mva=BASE_MVA,
        slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
        pq=[
            PQSpec(
                node_id="B",
                p_mw=spec.p_mw,
                q_mvar=spec.q_mvar,
                zip_coeffs=spec.zip_coeffs,
                zip_base_p_mw=spec.zip_base_p_mw,
                zip_base_q_mvar=spec.zip_base_q_mvar,
                inverter_control=spec.inverter_control,
                inverter_p_mw=spec.inverter_p_mw,
                inverter_q_mvar=spec.inverter_q_mvar,
            )
        ],
        options=_options(),
    )
    load_p, load_q = _load_power(load_kind)
    p_src_pu = SRC_P_MW / BASE_MVA
    if load_kind == "odbior_zip":

        def p_load(v: float) -> float:
            return -(load_p / BASE_MVA) * v * v

        def q_load(v: float) -> float:
            return -(load_q / BASE_MVA) * v * v

    else:

        def p_load(v: float) -> float:
            return -(load_p / BASE_MVA)

        def q_load(v: float) -> float:
            return -(load_q / BASE_MVA)

    v_ref, p_ref, q_ref = _judge(
        lambda v: p_load(v) + p_src_pu,
        # cosφ: moc bierna zrodla liczy sie z WLASNEJ mocy czynnej zrodla,
        # nigdy z mocy szyny (a wiec nigdy z mocy odbioru).
        lambda v: q_load(v) + TAN_COSPHI * p_src_pu,
    )
    solution = solve_power_flow_physics(pf_input)
    assert solution.converged
    assert solution.node_u_mag["B"] == pytest.approx(v_ref, abs=1e-9)
    assert solution.node_p_spec_effective_pu["B"] == pytest.approx(p_ref, abs=1e-9)
    assert solution.node_q_spec_effective_pu["B"] == pytest.approx(q_ref, abs=1e-9)
