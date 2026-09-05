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
budowniczych, ktorzy czytaja PLASKA LISTE skladnikow (payload/migawke): moc
szyny AKUMULUJE sie, a skladniki zostaja odzyskiwalne — wlasna moc zrodla
laduje w `inverter_p_mw`/`inverter_q_mvar` (konwencja generatorowa), baza
odbiorowa w `zip_base_p_mw`/`zip_base_q_mvar`.

Budowniczy kreatora — `NetworkWizardService.build_power_flow_input` — zostal
domkniety osobno (tor W1). Do tego czasu KREATOR, czyli jedyna droga, ktora ma
uzytkownik, odrzucal legalny model prosumencki bledem `duplicate PQSpec.node_id
entries`: odbior i regulowany falownik na jednej szynie dawaly dwa wpisy o tym
samym `node_id`. Parytet budowniczych (`test_trzej_budowniczowie_
mowia_jednym_glosem` — nazwa historyczna, patrz niezej) jest dowodem, ze klasa
defektu jest ZAMKNIETA — nie ze naprawiono kolejna instancje.

(Karta CV-3.3-A, 2026-09-05: trzeci ONCZESNY budowniczy —
`application.execution_engine.load_flow_run_input.LoadFlowRunInput`,
"budowniczy_silnika_biegow" — zostal skasowany razem z calym
`ExecutionEngineService`, E3, drugi tor wykonania biegow bez konsumenta
produkcyjnego. Karta CV-3.3-B, 2026-09-05: drugi ONCZESNY budowniczy,
`AnalysisRunService._build_power_flow_input` — skasowany razem z calym
`AnalysisRunService` (R2 `analysis_runs`, zero konsumenta produkcyjnego po
przepieciu porownan PF na R1). Parytet zwezony do DWOCH budowniczych zywych
produkcyjnie (generyczny kontrakt `build_power_flow_input` + kreator); fizyka
skladania szyny zlozonej pozostaje pokryta przez oba. Kanoniczny tor PF
(`enm.canonical_analysis`) NIE jest trzecim budowniczym tej klasy: agreguje
skladniki bus we WCZESNIEJSZEJ warstwie (`enm.mapping`, jeden graf-node = jeden
PQSpec z definicji), wiec strukturalnie nie moze miec defektu „dwa wpisy o tym
samym node_id" — zweryfikowane przy tej karcie czytaniem `enm/canonical_
analysis.py::_execute_power_flow` (pq_specs budowany z `graph.nodes.items()`,
nie z listy skladnikow), nie zalozeniem.)

Testy sa ILOCZYNEM CECH, nie przykladem z karty: {brak odbioru, odbior
stalomocowy, odbior ZIP} × {zrodlo z regulacja, zrodlo bez} × {dwaj
budowniczowie}. Liczby rozplywu sedziuje NIEZALEZNY Newton napisany w tescie —
zaden wynik solvera nie jest porownywany wylacznie z innym wynikiem solvera.
"""

from __future__ import annotations

import hashlib
import math
import sys
from dataclasses import replace
from pathlib import Path
from uuid import UUID, uuid4

import pytest

backend_src = Path(__file__).parents[2] / "src"
sys.path.insert(0, str(backend_src))

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
from network_model.catalog.types import ConverterKind
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
RATED_CURRENT_A = 400.0

LOAD_P_MW = 3.0
LOAD_Q_MVAR = 1.5
# Drugi odbior na tej samej szynie (wariant „sumowalnosc, nie sprzecznosc").
EXTRA_LOAD_P_MW = 0.75
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

# Odciski SHA-256 HISTORYCZNEGO ladunku `PQSpec` dla modelu kreatora BEZ wezla
# zlozonego (odbior na szynie B, regulowane zrodlo na wlasnej szynie C), zmierzone
# na kodzie SPRZED naprawy toru W1 — czyli na wyniku petli, ktora nie skladala
# szyn. Obejmuja WYLACZNIE pola, ktore istnialy przed zlozeniem, wiec literal musi
# sie zgadzac po obu stronach naprawy: model bez wezla zlozonego nie ma sie prawo
# ruszyc o bajt.
#
# Odcisk idzie po NAZWACH wezlow, bo identyfikatory kreatora sa losowymi UUID.
# Odcisk po LICZBACH WYNIKU jest tu nieprzypinalny i to nie jest wybor wygody:
# kat wezla C rozni sie miedzy uruchomieniami w ostatnim ulp, bo losowe
# identyfikatory zmieniaja kolejnosc montazu macierzy. Zachowanie jest
# PRE-EXISTING (zmierzone po obu stronach naprawy) i lezy w warstwie solvera, poza
# torem W1 — zglaszone jako dlug nazwany. Niezmiennosc WYNIKU jest tu dowodzona
# rownoscia dwoch odciskow policzonych w JEDNYM procesie (te same identyfikatory),
# co ten ulp eliminuje.
FROZEN_LADUNEK_MODELU_PROSTEGO = {
    "brak_odbioru": "9714cff564322d1e40a5092ab32edb278c581c66778ee2a8344776d5f7d99216",
    "odbior_stalomocowy": "f483045858a0ce6f6a7400b824b5c6c4f826337bee649e7de9ddbcc013718562",
    "odbior_zip": "63ddd3bb5ac06193d1bac275fb7e1e74e70163bc0935a97fccf1f5744f234081",
}


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
# wlasnym ksztalcie danych (dict / model kreatora / migawka biegu).
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


def _build_wizard() -> NetworkWizardService:
    engine = create_engine_from_url("sqlite+pysqlite:///:memory:")
    init_db(engine)
    session_factory = create_session_factory(engine)
    uow_factory = build_uow_factory(session_factory)
    return NetworkWizardService(uow_factory)


def _build_wizard_model(
    load_kind: str,
    source_kind: str,
    *,
    source_on_own_bus: bool = False,
    source_type: str = "INVERTER",
    extra_loads: int = 0,
) -> tuple[NetworkWizardService, UUID, UUID, str, str]:
    """Model kreatora: slack A -- linia -- szyna B (+ opcjonalnie C dla wariantu
    „szyna prosta", ktory sluzy dowodowi FROZEN).

    Zwraca `(kreator, project_id, case_id, id_szyny_B, id_szyny_zrodla)`.

    `source_type` wybiera, KTORA z dwoch galezi emisji zrodla w
    `build_power_flow_input` cwiczymy (falownik / przeksztaltnik) — obie skladaja
    ten sam wpis do tej samej listy, wiec obie naleza do tej samej klasy defektu.
    `extra_loads` doklada odbiory na szynie B (wariant „dwa odbiory na jednej
    szynie", druga polowa klasy: sumowalnosc zamiast duplikatu).
    """
    wizard = _build_wizard()
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
                "rated_current_a": RATED_CURRENT_A,
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
    for nr in range(extra_loads):
        wizard.add_load(
            project.id,
            LoadPayload(
                name=f"Odbior{nr + 2}",
                node_id=bus["id"],
                payload={"name": f"Odbior{nr + 2}", "p_mw": EXTRA_LOAD_P_MW, "q_mvar": 0.0},
            ),
        )
    # Wariant „szyna prosta" (dowod FROZEN): zrodlo stoi na WLASNEJ szynie C, wiec
    # zaden wezel nie jest zlozony i skladac nie ma czego.
    source_bus = bus
    if source_on_own_bus:
        source_bus = wizard.add_node(
            project.id,
            NodePayload(
                name="C",
                node_type="PQ",
                base_kv=KV,
                attrs={"active_power_mw": 0.0, "reactive_power_mvar": 0.0},
            ),
        )
        wizard.add_branch(
            project.id,
            BranchPayload(
                name="L2",
                branch_type="LINE",
                from_node_id=bus["id"],
                to_node_id=source_bus["id"],
                params={
                    "r_ohm_per_km": R_OHM_KM,
                    "x_ohm_per_km": X_OHM_KM,
                    "b_us_per_km": 0.0,
                    "length_km": LEN_KM,
                    "rated_current_a": RATED_CURRENT_A,
                },
            ),
        )
    source_payload: dict[str, object] = {"name": "INV"}
    if source_type == "CONVERTER":
        source_payload["converter_kind"] = ConverterKind.PV.value
    if source_kind == "zrodlo_regulowane":
        source_payload.update(CONTROL_PARAMS)
    zrodlo = wizard.add_source(
        project.id,
        SourcePayload(
            name="INV",
            node_id=source_bus["id"],
            source_type=source_type,
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
    # Nastawa w konwencji ODBIOROWEJ wpisu (jak `_resolve_inverter_q_mvar` /
    # `_resolve_converter_q_mvar`), wiec wstrzyk ma znak minus.
    if source_type == "CONVERTER":
        wizard.set_converter_setpoints(case.id, zrodlo["id"], p_mw=-SRC_P_MW, q_mvar=-SRC_Q_MVAR)
    else:
        wizard.set_inverter_setpoints(case.id, zrodlo["id"], p_mw=-SRC_P_MW, q_mvar=-SRC_Q_MVAR)
    return wizard, project.id, case.id, str(bus["id"]), str(source_bus["id"])


def _via_wizard(load_kind: str, source_kind: str) -> tuple[PowerFlowInput, str]:
    """Budowniczy kreatora: `NetworkWizardService.build_power_flow_input`.

    Jedyna droga uzytkownika kreatora — i jedyna, ktorej naprawa V12K-313/316 nie
    objela do toru W1. Opcje ida slownikiem, bo taki jest kontrakt tej metody."""
    wizard, project_id, case_id, bus_id, _src_bus = _build_wizard_model(load_kind, source_kind)
    options = _options()
    return (
        wizard.build_power_flow_input(
            project_id,
            case_id,
            {"max_iter": options.max_iter, "tolerance": options.tolerance},
        ),
        bus_id,
    )


BUILDERS = (
    "budowniczy_generyczny",
    "budowniczy_kreatora",
)


def _bus_spec(builder: str, load_kind: str, source_kind: str) -> PQSpec:
    """Zwrocony `PQSpec` szyny zlozonej od wskazanego budowniczego."""
    if builder == "budowniczy_generyczny":
        pf_input = _via_generic_builder(load_kind, source_kind)
        bus_id = "B"
    elif builder == "budowniczy_kreatora":
        pf_input, bus_id = _via_wizard(load_kind, source_kind)
    else:
        raise ValueError(f"Nieznany budowniczy: {builder}")
    specs = [spec for spec in pf_input.pq if spec.node_id == bus_id]
    assert len(specs) == 1, f"{builder}: szyna zlozona musi dac DOKLADNIE jeden wpis"
    return specs[0]


# --------------------------------------------------------------------------
# (a) ILOCZYN CECH: {brak, stalomocowy, ZIP} × {z regulacja, bez} × 2 budowniczych
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
    """Parytet: ten sam scenariusz daje z KAZDEGO z budowniczych (`BUILDERS`) TEN
    SAM ksztalt szyny. Nazwa historyczna („trzej") — patrz naglowek modulu:
    zwezone do dwoch zywych produkcyjnie (`AnalysisRunService` skasowany, CV-3.3-B).

    To jest dowod, ze klasa defektu jest ZAMKNIETA, a nie ze naprawiono kolejna
    instancje: gdyby ktorykolwiek budowniczy skladal szyne po swojemu (albo nie
    skladal jej wcale, jak kreator przed torem W1), kontrakt mowilby dwoma glosami
    o tej samej szynie i ten test by to pokazal."""

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


@pytest.mark.parametrize("load_kind", ("odbior_stalomocowy", "odbior_zip"))
def test_kreator_liczy_szyne_prosumencka_zamiast_ja_odrzucac(load_kind: str) -> None:
    """Tor W1, bramka (a): legalny model prosumencki PRZECHODZI przez kreator.

    Przed naprawa kreator — jedyna droga uzytkownika — emitowal dwa `PQSpec` o tym
    samym `node_id` (odbior + regulowany falownik na jednej szynie) i solver
    wywracal bieg bledem `duplicate PQSpec.node_id entries`. Uzytkownik NIE MOGL
    policzyc sieci OZE z odbiorem na tej samej szynie. Test idzie cala droga:
    model kreatora -> `build_power_flow_input` -> solver z wlaczona walidacja."""
    pf_input, bus_id = _via_wizard(load_kind, "zrodlo_regulowane")
    assert [spec.node_id for spec in pf_input.pq].count(bus_id) == 1
    pf_input.options.validate = True
    solution = solve_power_flow_physics(pf_input)
    assert solution.validation_errors == []
    assert solution.converged


# --------------------------------------------------------------------------
# (a2) Wpis JUZ ZAGREGOWANY: pole addytywne niesie wlasna moc zrodla
# --------------------------------------------------------------------------


def _aggregated_bus_spec(builder: str, load_kind: str) -> PQSpec:
    """Szyna zlozona opisana JEDNYM wpisem o mocy wypadkowej + wlasna moc zrodla."""
    if builder != "budowniczy_generyczny":
        raise ValueError(f"Nieznany budowniczy z wpisem zagregowanym: {builder}")
    load_p, load_q = _load_power(load_kind)
    net_p = load_p - SRC_P_MW
    net_q = load_q - SRC_Q_MVAR
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


# Kreator jest tu SWIADOMIE poza zbiorem, i nie „bo poza zakresem": jego wejsciem
# jest MODEL (tabele odbiorow i zrodel), a nie payload, wiec ksztalt „jeden wpis o
# mocy wypadkowej deklarujacy wlasna moc zrodla" jest w nim NIEWYRAZALNY — kreator
# zawsze zna skladniki z osobna. CV-3.3-B: drugi budowniczy czytajacy payload/
# migawke juz zagregowana (`AnalysisRunService`) skasowany — zostaje generyczny
# kontrakt (`build_power_flow_input`), jedyny zywy budowniczy tej klasy wejscia.
BUILDERS_Z_WPISEM_ZAGREGOWANYM = ("budowniczy_generyczny",)


@pytest.mark.parametrize("builder", BUILDERS_Z_WPISEM_ZAGREGOWANYM)
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


def _wizard_node_names(pf_input: PowerFlowInput) -> dict[str, str]:
    """Identyfikator wezla kreatora -> nazwa ze scenariusza („A"/„B"/„C").

    Identyfikatory sa losowymi UUID (nowa baza w pamieci na kazdy bieg), wiec kazdy
    odcisk porownywany MIEDZY procesami musi isc po nazwach."""
    return {node_id: node.name for node_id, node in pf_input.typed_graph().nodes.items()}


def _wizard_payload_fingerprint(pf_input: PowerFlowInput) -> str:
    """Odcisk SHA-256 HISTORYCZNEGO ladunku `PQSpec` (bez pol dodanych zlozeniem).

    To jest dokladnie ten ladunek, ktory petla kreatora emitowala przed naprawa —
    dlatego literal zmierzony na kodzie sprzed naprawy musi sie zgadzac po niej."""
    names = _wizard_node_names(pf_input)
    payload = repr(
        sorted(
            (
                names[spec.node_id],
                repr(spec.p_mw),
                repr(spec.q_mvar),
                repr(spec.zip_coeffs),
                repr(spec.zip_base_p_mw),
                repr(spec.zip_base_q_mvar),
                repr(spec.inverter_control),
            )
            for spec in pf_input.pq
        )
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _wizard_result_fingerprint(pf_input: PowerFlowInput, solution: PowerFlowNewtonSolution) -> str:
    """Odcisk SHA-256 liczb wyniku kreatora, kluczowany nazwami wezlow.

    Porownywalny WYLACZNIE w obrebie jednego procesu (te same identyfikatory) —
    patrz komentarz przy `FROZEN_LADUNEK_MODELU_PROSTEGO`."""
    names = _wizard_node_names(pf_input)
    payload = repr(
        (
            solution.converged,
            solution.iterations,
            sorted((names[k], v) for k, v in solution.node_u_mag.items()),
            sorted((names[k], v) for k, v in solution.node_angle.items()),
            sorted((names[k], v) for k, v in solution.node_p_spec_effective_pu.items()),
            sorted((names[k], v) for k, v in solution.node_q_spec_effective_pu.items()),
            repr(solution.slack_power),
        )
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


@pytest.mark.parametrize("load_kind", LOAD_KINDS)
def test_model_kreatora_bez_szyny_zlozonej_liczy_sie_bajtowo_jak_dotad(load_kind: str) -> None:
    """Tor W1, bramka (c): model BEZ wezla zlozonego nie moze drgnac o bit.

    Odbior stoi na szynie B, zrodlo na wlasnej szynie C — skladac nie ma czego, wiec
    zlozenie ma byc przezroczyste. Dowod jest trzystopniowy:

    1. ladunek `PQSpec` w polach, ktore istnialy przed naprawa, ma odcisk SHA-256
       PRZYPIETY LITERALEM zmierzonym na kodzie sprzed naprawy;
    2. szyny bez regulacji nie zyskuja ZADNEGO z nowych pol — sciezka historyczna
       nie jest nawet przepisywana;
    3. wynik solvera na wejsciu po naprawie ma TEN SAM odcisk SHA-256 co wynik na
       wejsciu w ksztalcie SPRZED naprawy (szyna zrodla bez jawnej wlasnej mocy) —
       uzupelnienie `inverter_p_mw` na szynie samego zrodla liczy dokladnie te sama
       wartosc, ktora `source_injection_pu` czytalo dotad z mocy szyny.
    """
    wizard, project_id, case_id, bus_id, source_bus_id = _build_wizard_model(
        load_kind, "zrodlo_regulowane", source_on_own_bus=True
    )
    assert bus_id != source_bus_id
    options = _options()
    po_naprawie = wizard.build_power_flow_input(
        project_id,
        case_id,
        {"max_iter": options.max_iter, "tolerance": options.tolerance, "validate": True},
    )
    assert [spec.node_id for spec in po_naprawie.pq].count(source_bus_id) == 1

    # (1) Ladunek historyczny co do bajtu — literal z kodu SPRZED naprawy W1.
    assert _wizard_payload_fingerprint(po_naprawie) == FROZEN_LADUNEK_MODELU_PROSTEGO[load_kind]

    # (2) Szyny bez regulacji nie zyskuja zadnego z nowych pol.
    for spec in po_naprawie.pq:
        if spec.node_id == source_bus_id:
            continue
        assert spec.inverter_control is None
        assert spec.inverter_p_mw is None and spec.inverter_q_mvar is None
        assert spec.zip_base_p_mw is None and spec.zip_base_q_mvar is None

    # (3) Ksztalt SPRZED naprawy: petla emitowala wpisy bez jawnej wlasnej mocy
    # zrodla, a przy braku wezla zlozonego byl to caly jej wynik.
    historyczny = PowerFlowInput(
        graph=po_naprawie.graph,
        base_mva=po_naprawie.base_mva,
        slack=po_naprawie.slack,
        pq=[replace(spec, inverter_p_mw=None, inverter_q_mvar=None) for spec in po_naprawie.pq],
        pv=po_naprawie.pv,
        options=_options(),
    )
    zrodlo = next(spec for spec in po_naprawie.pq if spec.node_id == source_bus_id)
    assert zrodlo.inverter_p_mw == pytest.approx(SRC_P_MW, abs=1e-12)
    assert zrodlo.inverter_q_mvar == pytest.approx(SRC_Q_MVAR, abs=1e-12)

    wynik = solve_power_flow_physics(po_naprawie)
    assert wynik.validation_errors == []
    assert wynik.converged
    assert _wizard_result_fingerprint(po_naprawie, wynik) == _wizard_result_fingerprint(
        historyczny, solve_power_flow_physics(historyczny)
    )


# CV-3.3-B: `test_migawka_odbioru_stalomocowego_nie_zyskuje_nowych_kluczy`
# usuniety razem z `AnalysisRunService` — sprawdzal WYLACZNIE serializacje
# `run.input_snapshot` tej (skasowanej) klasy; ksztalt migawki biegu R1
# (`CanonicalRun.snapshot`) jest INNYM kontraktem bez odpowiednika tego pola
# (patrz `enm.canonical_analysis.CanonicalRun`), wiec intencja testu („brak
# nadmiarowych kluczy w zapisie wejscia") nie ma tu czego pilnowac dalej —
# zamrozony ksztalt `PQSpec`/`build_power_flow_input` (payload generyczny)
# pozostaje pokryty przez `test_wezel_zlozony_niesie_skladniki_a_nie_sume` i
# `test_wpis_zagregowany_deklaruje_wlasna_moc_zrodla` powyzej.


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
    """Kazdy z TRZECH budowniczych daje wejscie, na ktorym rozplyw ZGADZA SIE z
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


# --------------------------------------------------------------------------
# (e) Kreator: POZOSTALE galezie emisji tej samej funkcji
#
# `build_power_flow_input` dopisuje `PQSpec` do jednej listy w TRZECH miejscach
# (odbiory, zrodla INVERTER, zrodla CONVERTER). Naprawa jednej galezi przy
# zostawieniu wzorca w galezi sasiedniej byla by naruszeniem tej samej karty
# (regula KLASA, NIE INSTANCJA, pkt 5), wiec kazda z nich ma tu swoj test.
# --------------------------------------------------------------------------


def test_kreator_sklada_szyne_takze_dla_przeksztaltnika() -> None:
    """Galaz CONVERTER emituje wpis do TEJ SAMEJ listy co galaz INVERTER, wiec
    odbior + regulowany przeksztaltnik na jednej szynie to ten sam defekt.

    Wynik musi byc IDENTYCZNY jak dla falownika przy tej samej nastawie i tej samej
    charakterystyce — obie galezie roznia sie zrodlem nastawy, nie fizyka."""
    wizard, project_id, case_id, bus_id, _src = _build_wizard_model(
        "odbior_stalomocowy", "zrodlo_regulowane", source_type="CONVERTER"
    )
    options = _options()
    pf_input = wizard.build_power_flow_input(
        project_id,
        case_id,
        {"max_iter": options.max_iter, "tolerance": options.tolerance, "validate": True},
    )
    specs = [spec for spec in pf_input.pq if spec.node_id == bus_id]
    assert len(specs) == 1
    spec = specs[0]
    assert spec.p_mw == pytest.approx(LOAD_P_MW - SRC_P_MW, abs=1e-12)
    assert spec.q_mvar == pytest.approx(LOAD_Q_MVAR - SRC_Q_MVAR, abs=1e-12)
    assert spec.inverter_control is not None
    assert spec.inverter_p_mw == pytest.approx(SRC_P_MW, abs=1e-12)
    assert spec.inverter_q_mvar == pytest.approx(SRC_Q_MVAR, abs=1e-12)

    solution = solve_power_flow_physics(pf_input)
    assert solution.validation_errors == []
    assert solution.converged

    # Parytet galezi: falownik o tej samej nastawie daje ten sam wpis.
    falownikowy = _bus_spec("budowniczy_kreatora", "odbior_stalomocowy", "zrodlo_regulowane")
    assert (spec.p_mw, spec.q_mvar, spec.inverter_p_mw, spec.inverter_q_mvar) == (
        falownikowy.p_mw,
        falownikowy.q_mvar,
        falownikowy.inverter_p_mw,
        falownikowy.inverter_q_mvar,
    )


def test_kreator_sumuje_dwa_odbiory_na_jednej_szynie() -> None:
    """Druga polowa klasy (V12K-313): dwa odbiory na jednej szynie to model
    calkowicie legalny, a kreator odrzucal go tym samym bledem duplikatu.

    Po naprawie szyna ma jeden wpis o mocy bedacej SUMA obu odbiorow (i wciaz
    odejmuje wlasna moc zrodla)."""
    wizard, project_id, case_id, bus_id, _src = _build_wizard_model(
        "odbior_stalomocowy", "zrodlo_bez_regulacji", extra_loads=1
    )
    options = _options()
    pf_input = wizard.build_power_flow_input(
        project_id,
        case_id,
        {"max_iter": options.max_iter, "tolerance": options.tolerance, "validate": True},
    )
    specs = [spec for spec in pf_input.pq if spec.node_id == bus_id]
    assert len(specs) == 1
    assert specs[0].p_mw == pytest.approx(LOAD_P_MW + EXTRA_LOAD_P_MW - SRC_P_MW, abs=1e-12)
    assert specs[0].q_mvar == pytest.approx(LOAD_Q_MVAR - SRC_Q_MVAR, abs=1e-12)
    solution = solve_power_flow_physics(pf_input)
    assert solution.validation_errors == []
    assert solution.converged


def test_kreator_odrzuca_dwa_regulowane_zrodla_na_jednej_szynie() -> None:
    """SPRZECZNOSC, nie sumowalnosc — takze w kreatorze.

    Kontrakt trzyma DOKLADNIE jedna charakterystyke na wezel, wiec ciche wybranie
    jednej z dwoch skasowalo by druga z modelu. Odmowa ma byc JAWNA i pochodzic z
    tego samego, jednego skladania (a nie z przypadkowego duplikatu)."""
    wizard, project_id, case_id, bus_id, _src = _build_wizard_model(
        "odbior_stalomocowy", "zrodlo_regulowane"
    )
    drugie = wizard.add_source(
        project_id,
        SourcePayload(
            name="INV2",
            node_id=UUID(bus_id),
            source_type="INVERTER",
            payload={"name": "INV2", **CONTROL_PARAMS},
            type_ref=uuid4(),
        ),
    )
    wizard.set_inverter_setpoints(case_id, drugie["id"], p_mw=-1.0, q_mvar=-0.2)
    with pytest.raises(ValueError, match="ONE inverter characteristic per bus"):
        wizard.build_power_flow_input(project_id, case_id)
