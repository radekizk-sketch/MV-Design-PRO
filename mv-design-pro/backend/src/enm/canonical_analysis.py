from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID, uuid4

from application.automation.trace import (
    build_automation_trace,
    build_post_fault_topology_effect,
)
from application.compliance.source_compliance import evaluate_source_compliance
from application.proof_engine.packs.phase_state_sn import (
    PhaseStateSNProofPack,
    PhaseStateSNProofPackInput,
)
from application.stability.dynamic_stability import (
    FaultClearScenario,
    FaultClearSourceState,
    evaluate_fault_clear_dynamic_stability,
)
from application.stability.voltage_trajectory import (
    TrajectoryGenerationParams,
    generate_voltage_trajectory,
)
from enm.assembler import (
    _graph_id_from_ref,
    _short_circuit_requires_z0,
    _short_circuit_type_from_options,
    zloz_wejscie_rozplywu,
    zloz_wejscie_zwarcia,
)
from enm.element_kind import rodzaj_elementu, zbuduj_indeks_rodzajow
from enm.envelope import RevisionEnvelope, zbuduj_koperte
from enm.klucz_twin import czy_klucz_projektu, project_id_z_klucza
from enm.models import EnergyNetworkModel
from enm.scenariusze import (
    SCENARIUSZ_NORMALNY,
    EffectiveNetworkSnapshot,
    OperatingScenario,
    apply_scenario,
    opcje_biegu_ze_scenariusza,
    referencja_koperty,
)
from enm.store import get_enm
from enm.validator import ENMValidator
from infrastructure.persistence.repositories.canonical_run_repository import (
    KLUCZ_DOSTEPNOSCI_ROZPLYWU,
    KLUCZ_ROZPLYWU,
    KLUCZ_SLADU_ROZPLYWU,
    KLUCZE_ROZPLYWU,
    canonical_run_repository_scope,
)
from network_model.catalog.odcisk import odcisk_katalogu_domyslnego
from network_model.core.graph import NetworkGraph
from network_model.core.voltage_factor import c_for_node
from network_model.solvers.phase_state_sn import (
    OpenPhaseFlags,
    PhaseStateSNInput,
    PhaseStateSNSolver,
    PhaseValues,
)
from network_model.solvers.power_flow_fast_decoupled import (
    FastDecoupledOptions,
    PowerFlowFastDecoupledSolver,
)
from network_model.solvers.power_flow_gauss_seidel import (
    GaussSeidelOptions,
    PowerFlowGaussSeidelSolver,
)
from network_model.solvers.power_flow_newton import (
    PowerFlowNewtonSolution,
    PowerFlowNewtonSolver,
)
from network_model.solvers.power_flow_oltc import solve_with_oltc
from network_model.solvers.power_flow_result import build_power_flow_result_v1
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
)
from network_model.solvers.short_circuit_core import ShortCircuitType
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver


def _canonicalize(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _canonicalize(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [_canonicalize(item) for item in value]
    return value


def _compute_input_hash(
    *, case_id: str, analysis_type: str, enm_hash: str, options: dict[str, Any]
) -> str:
    payload = {
        "analysis_type": analysis_type,
        "case_id": case_id,
        "enm_hash": enm_hash,
        "options": _canonicalize(options),
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


#: IEC 60909-0 §4.3.1.1: κ = 1,02 + 0,98·e^(−3R/X) — dla R/X ≥ 0 zawsze w [1,02; 2,0].
#: Wartość spoza pasma oznacza impedancję zastępczą o ujemnym R albo X (węzeł bez
#: galwanicznego toru do źródła, macierz Y bliska osobliwości) — wynik solvera jest
#: wtedy artefaktem numerycznym, nie fizyką (pomiar 2026-09-05: κ ≈ 3·10¹²,
#: i_p ≈ 2·10¹⁴ A, I_th = inf dla węzła wyspy nN bez zasilania).
_KAPPA_MIN = 1.02
_KAPPA_MAX = 2.0
OGRANICZENIE_WYNIK_NIEFIZYCZNY = "solver_result_non_physical"


def _niefinitowe_na_none(obiekt: Any, _sciezka: str = "$") -> tuple[Any, list[str]]:
    """Kopia struktury JSON z NaN/±inf zamienionymi na ``None`` + ścieżki podmian.

    Polityka §35 (``kontrakt_liczb``): kontrakt wyjściowy biegu musi być poprawnym
    JSON-em o wartościach finitowych — NaN/inf nie ma reprezentacji w JSON, a
    „liczba" w polu wyniku bez znaczenia fizycznego jest fabrykacją. Podmiana
    NIE jest cicha: każda ścieżka wraca do wołającego, który oznacza wynik jako
    nieraportowalny i wypisuje podmienione pola.
    """
    if isinstance(obiekt, bool):
        return obiekt, []
    if isinstance(obiekt, float):
        if math.isfinite(obiekt):
            return obiekt, []
        return None, [_sciezka]
    if isinstance(obiekt, dict):
        kopia: dict[Any, Any] = {}
        sciezki: list[str] = []
        for klucz, wartosc in obiekt.items():
            nowa, sc = _niefinitowe_na_none(wartosc, f"{_sciezka}.{klucz}")
            kopia[klucz] = nowa
            sciezki.extend(sc)
        return kopia, sciezki
    if isinstance(obiekt, list | tuple):
        elementy: list[Any] = []
        sciezki = []
        for indeks, wartosc in enumerate(obiekt):
            nowa, sc = _niefinitowe_na_none(wartosc, f"{_sciezka}[{indeks}]")
            elementy.append(nowa)
            sciezki.extend(sc)
        return elementy, sciezki
    return obiekt, []


#: Powód nieraportowalności wiersza zwarcia ustalony z TOPOLOGII (nie z liczb):
#: węzeł zwarcia leży w wyspie bez żadnego elementu z impedancją do odniesienia.
POWOD_WEZEL_BEZ_ODNIESIENIA = "fault_node_without_reference_impedance"
#: Pola wiersza zwarcia będące DANYMI WEJŚCIOWYMI biegu (nie wynikiem solvera) —
#: jedyne liczby, które zostają w wierszu węzła bez impedancji do odniesienia.
_KLUCZE_WEJSCIOWE_WIERSZA_ZWARCIA: frozenset[str] = frozenset({"c_factor", "un_v", "tk_s", "tb_s"})
#: Poddrzewa śladu White Box wiersza — zerowane bez wykazu ścieżek (setki wpisów bez
#: wartości diagnostycznej; wykaz `non_physical_fields` nazywa pola KONTRAKTU).
_KLUCZE_SLADU_WIERSZA_ZWARCIA: frozenset[str] = frozenset(
    {"white_box_trace", "branch_contributions", "branch_flow_trace"}
)


def _wezly_bez_impedancji_do_odniesienia(graph: NetworkGraph) -> frozenset[str]:
    """Węzły, których wyspa nie ma ŻADNEGO elementu z impedancją do odniesienia.

    Wyspa = komponent spójności aktywnych gałęzi i zamkniętych łączników
    (``NetworkGraph.find_islands``); element z impedancją do odniesienia = źródło
    sieciowe (``grid_sc_sources``), maszyna synchroniczna albo asynchroniczna w
    ruchu. Metoda równoważnego źródła napięciowego (IEC 60909-0 §4.2) wymaga
    skończonej impedancji Z_kk widzianej z węzła zwarcia do odniesienia; falownik
    jest źródłem prądowym bez impedancji (§6.8), więc wyspa zasilana wyłącznie
    falownikami ma Y-bus osobliwą — ``np.linalg.inv`` w solverze (FROZEN, B-01)
    oddaje wtedy liczby zależne od biblioteki algebry liniowej, nie od sieci.
    Pomiar 2026-09-05 (CI run 4877 vs lokalnie, sieć G04/06 rejestru): lokalnie
    R/X = −32 dokładnie, κ ≈ 5·10⁴¹ (wiersz „niefizyczny" po paśmie κ), na CI inne
    śmieci mieszczące się w paśmie — kwalifikacja po LICZBACH była funkcją
    maszyny. Wyspa jest funkcją WEJŚCIA, więc kwalifikacja po niej jest
    deterministyczna i przenośna.
    """
    wezly_odniesienia: set[str] = set()
    for zrodla in (
        graph.grid_sc_sources,
        graph.synchronous_machine_sources,
        graph.asynchronous_machine_sources,
    ):
        wezly_odniesienia.update(
            s.node_id for s in zrodla.values() if getattr(s, "in_service", True)
        )
    bez_odniesienia: set[str] = set()
    for wyspa in graph.find_islands():
        if not any(wezel in wezly_odniesienia for wezel in wyspa):
            bez_odniesienia.update(wyspa)
    return frozenset(bez_odniesienia)


def _zeruj_liczby_wyniku(
    obiekt: Any,
    _sciezka: str = "$",
    *,
    zachowaj: frozenset[str] = frozenset(),
    _wykaz: bool = True,
) -> tuple[Any, list[str]]:
    """Kopia struktury z KAŻDĄ liczbą zmiennoprzecinkową zamienioną na ``None``.

    Klucze ``zachowaj`` na szczycie zostają (dane wejściowe). Ścieżki podmian są
    wykazywane poza poddrzewami ``_KLUCZE_SLADU_WIERSZA_ZWARCIA`` (ślad zerowany
    bez wykazu). ``int``/``bool``/napisy zostają — to struktura, nie wynik solvera.
    """
    if isinstance(obiekt, bool):
        return obiekt, []
    if isinstance(obiekt, float):
        return None, ([_sciezka] if _wykaz else [])
    if isinstance(obiekt, dict):
        kopia: dict[Any, Any] = {}
        sciezki: list[str] = []
        for klucz, wartosc in obiekt.items():
            if _sciezka == "$" and klucz in zachowaj:
                kopia[klucz] = wartosc
                continue
            nowa, sc = _zeruj_liczby_wyniku(
                wartosc,
                f"{_sciezka}.{klucz}",
                zachowaj=zachowaj,
                _wykaz=_wykaz and klucz not in _KLUCZE_SLADU_WIERSZA_ZWARCIA,
            )
            kopia[klucz] = nowa
            sciezki.extend(sc)
        return kopia, sciezki
    if isinstance(obiekt, list | tuple):
        elementy: list[Any] = []
        sciezki = []
        for indeks, wartosc in enumerate(obiekt):
            nowa, sc = _zeruj_liczby_wyniku(
                wartosc, f"{_sciezka}[{indeks}]", zachowaj=zachowaj, _wykaz=_wykaz
            )
            elementy.append(nowa)
            sciezki.extend(sc)
        return elementy, sciezki
    return obiekt, []


def _oznacz_wiersz_bez_odniesienia(payload: dict[str, Any]) -> dict[str, Any]:
    """Wiersz zwarcia węzła bez impedancji do odniesienia: NIERAPORTOWALNY z topologii.

    Zwraca NOWY wiersz: każda liczba wyniku solvera → ``None`` (zostają wyłącznie dane
    wejściowe ``_KLUCZE_WEJSCIOWE_WIERSZA_ZWARCIA``), ograniczenie
    ``solver_result_non_physical`` + wykaz pól kontraktu w ``non_physical_fields`` +
    ``non_physical_reason`` (addytywne pole: DLACZEGO). Zero liczb solvera w takim
    wierszu to nie strata informacji — IEC 60909 nie definiuje dla niego Z_kk, a
    wartości oddane przez odwrócenie osobliwej macierzy są szumem biblioteki, nie
    prądem zwarciowym (patrz ``_wezly_bez_impedancji_do_odniesienia``).
    """
    wiersz, pola = _zeruj_liczby_wyniku(payload, zachowaj=_KLUCZE_WEJSCIOWE_WIERSZA_ZWARCIA)
    ograniczenia = list(wiersz.get("reporting_limitations") or [])
    if OGRANICZENIE_WYNIK_NIEFIZYCZNY not in ograniczenia:
        ograniczenia.append(OGRANICZENIE_WYNIK_NIEFIZYCZNY)
    wiersz.update(
        {
            "reporting_status": "not_reportable",
            "reporting_status_pl": "nieraportowalny",
            "proof_status": "partial",
            "proof_status_pl": "czesciowy",
            "dopuszczalnosc_raportowa": False,
            "reporting_limitations": ograniczenia,
            "non_physical_fields": sorted(set(pola)),
            "non_physical_reason": POWOD_WEZEL_BEZ_ODNIESIENIA,
        }
    )
    return wiersz


def _oznacz_wiersz_zwarcia_niefizyczny(payload: dict[str, Any]) -> dict[str, Any]:
    """Wiersz wyniku zwarcia z podmianą wartości niefinitowych i bramką κ.

    Zwraca NOWY wiersz. Gdy solver (FROZEN, B-01) oddał wartość niefinitową
    albo κ spoza pasma IEC 60909-0, wiersz jest NIERAPORTOWALNY z ograniczeniem
    ``solver_result_non_physical`` i listą pól ``non_physical_fields`` — projektant
    widzi, że to nie jest prąd zwarciowy, a nie liczbę 2·10¹⁴ A. Wiersz bez
    takich wartości wraca bez zmian (parytet bit w bit dla sieci zdrowych).
    """
    wiersz, niefinitowe = _niefinitowe_na_none(payload)
    kappa = wiersz.get("kappa")
    kappa_poza = isinstance(kappa, int | float) and not (_KAPPA_MIN <= float(kappa) <= _KAPPA_MAX)
    if not niefinitowe and not kappa_poza:
        return payload
    pola = sorted(set(niefinitowe) | ({"$.kappa"} if kappa_poza else set()))
    ograniczenia = list(wiersz.get("reporting_limitations") or [])
    if OGRANICZENIE_WYNIK_NIEFIZYCZNY not in ograniczenia:
        ograniczenia.append(OGRANICZENIE_WYNIK_NIEFIZYCZNY)
    wiersz.update(
        {
            "reporting_status": "not_reportable",
            "reporting_status_pl": "nieraportowalny",
            "proof_status": "partial",
            "proof_status_pl": "czesciowy",
            "dopuszczalnosc_raportowa": False,
            "reporting_limitations": ograniczenia,
            "non_physical_fields": pola,
        }
    )
    return wiersz


def _result_analysis_type_for_fault(short_circuit_type: ShortCircuitType) -> str:
    return {
        ShortCircuitType.THREE_PHASE: "short_circuit_3f",
        ShortCircuitType.SINGLE_PHASE_GROUND: "short_circuit_1f",
        ShortCircuitType.TWO_PHASE: "short_circuit_2f",
        ShortCircuitType.TWO_PHASE_GROUND: "short_circuit_2fg",
    }[short_circuit_type]


def _execution_analysis_type_for_fault(short_circuit_type: ShortCircuitType) -> str:
    return {
        ShortCircuitType.THREE_PHASE: "SC_3F",
        ShortCircuitType.SINGLE_PHASE_GROUND: "SC_1F",
        ShortCircuitType.TWO_PHASE: "SC_2F",
        ShortCircuitType.TWO_PHASE_GROUND: "SC_2F_G",
    }[short_circuit_type]


def _short_circuit_proof_ref(
    *,
    run: CanonicalRun,
    target_id: str,
    short_circuit_type: ShortCircuitType,
) -> str:
    payload = {
        "input_hash": run.input_hash,
        "run_id": str(run.id),
        "short_circuit_type": short_circuit_type.value,
        "target_id": target_id,
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return f"proof:short-circuit:{hashlib.sha256(raw.encode('utf-8')).hexdigest()}"


def _short_circuit_reportability(
    *,
    run: CanonicalRun,
    target_id: str,
    short_circuit_type: ShortCircuitType,
    trace_step_refs: list[int],
) -> dict[str, Any]:
    proof_ref = _short_circuit_proof_ref(
        run=run,
        target_id=target_id,
        short_circuit_type=short_circuit_type,
    )
    requires_z0 = _short_circuit_requires_z0(short_circuit_type)
    return {
        "reporting_status": "reportable",
        "reporting_status_pl": "raportowalny",
        "proof_status": "complete",
        "proof_status_pl": "pelny",
        "proof_ref": proof_ref,
        "proof_kind": "white_box_trace",
        "proof_engine_version": "white_box_trace_v1",
        "trace_step_refs": trace_step_refs,
        "method_basis": "IEC_60909",
        "requires_z0": requires_z0,
        "z0_source": "ENM_COMMITTED" if requires_z0 else "NOT_APPLICABLE",
        "reporting_limitations": [],
    }


def _phase_state_proof_ref(*, run: CanonicalRun, target_id: str) -> str:
    payload = {
        "analysis_type": "phase_state_sn",
        "input_hash": run.input_hash,
        "run_id": str(run.id),
        "target_id": target_id,
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return f"proof:phase-state-sn:{hashlib.sha256(raw.encode('utf-8')).hexdigest()}"


def _dynamic_stability_proof_ref(*, run: CanonicalRun, scenario_id: str) -> str:
    payload = {
        "analysis_type": "dynamic_stability",
        "input_hash": run.input_hash,
        "run_id": str(run.id),
        "scenario_id": scenario_id,
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return f"proof:dynamic-stability:{hashlib.sha256(raw.encode('utf-8')).hexdigest()}"


def _source_compliance_proof_ref(*, run: CanonicalRun, source_ref: str) -> str:
    payload = {
        "analysis_type": "source_compliance",
        "input_hash": run.input_hash,
        "run_id": str(run.id),
        "source_ref": source_ref,
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return f"proof:source-compliance:{hashlib.sha256(raw.encode('utf-8')).hexdigest()}"


def _power_flow_proof_ref(*, run: CanonicalRun, solver_method: str) -> str:
    payload = {
        "analysis_type": "PF",
        "input_hash": run.input_hash,
        "run_id": str(run.id),
        "solver_method": solver_method,
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return f"proof:power-flow:{hashlib.sha256(raw.encode('utf-8')).hexdigest()}"


def _execution_analysis_type_for_run(run: CanonicalRun) -> str:
    if run.analysis_type == "PF":
        return "LOAD_FLOW"
    if run.analysis_type == "short_circuit_sn":
        return _execution_analysis_type_for_fault(_short_circuit_type_from_options(run.options))
    if run.analysis_type == "phase_state_sn":
        return "PHASE_STATE_SN"
    if run.analysis_type == "dynamic_stability":
        return "DYNAMIC_STABILITY"
    if run.analysis_type == "source_compliance":
        return "SOURCE_COMPLIANCE"
    if run.analysis_type == "protection_sn":
        return "PROTECTION"
    raise ValueError(f"Unsupported canonical analysis type: {run.analysis_type}")


@dataclass
class CanonicalRun:
    id: UUID
    case_id: str
    project_id: str | None
    analysis_type: str
    status: str
    created_at: datetime
    snapshot_hash: str
    input_hash: str
    snapshot: dict[str, Any]
    validation: dict[str, Any]
    readiness: dict[str, Any]
    options: dict[str, Any] = field(default_factory=dict)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error_message: str | None = None
    result_status: str = "VALID"
    raw_result: dict[str, Any] | None = None
    white_box_trace: list[dict[str, Any]] = field(default_factory=list)
    power_flow_trace: dict[str, Any] | None = None
    #: CV-2: koperta rewizji (`enm/envelope.RevisionEnvelope.to_dict()`) — CO
    #: DOKLADNIE policzono: rewizja modelu, odcisk katalogu, odcisk opcji.
    #: `None` wylacznie dla biegow zapisanych przed rejestrem rewizji (dane).
    envelope: dict[str, Any] | None = None

    @property
    def koperta(self) -> RevisionEnvelope | None:
        return RevisionEnvelope.from_dict(self.envelope)

    @property
    def solver_kind(self) -> str:
        if self.analysis_type == "PF":
            return "PF"
        if self.analysis_type == "short_circuit_sn":
            return "short_circuit_sn"
        if self.analysis_type == "phase_state_sn":
            return "phase_state_sn"
        if self.analysis_type == "dynamic_stability":
            return "dynamic_stability"
        if self.analysis_type == "source_compliance":
            return "source_compliance"
        return self.analysis_type

    def to_execution_dict(self) -> dict[str, Any]:
        analysis_type = _execution_analysis_type_for_run(self)
        status = {
            "CREATED": "PENDING",
            "RUNNING": "RUNNING",
            "FINISHED": "DONE",
            "FAILED": "FAILED",
        }[self.status]
        return {
            "id": str(self.id),
            "study_case_id": self.case_id,
            "analysis_type": analysis_type,
            "solver_input_hash": self.input_hash,
            "status": status,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "error_message": self.error_message,
        }


#: Kolumny CIĘŻKIE biegu: artefakt wyniku, ślad White Box, ślad rozpływu mocy
#: i snapshot modelu. Listy biegów ich nie pobierają (K14).
KOLUMNY_CIEZKIE_BIEGU = ("snapshot", "raw_result", "white_box_trace", "power_flow_trace")

#: Wartość jeszcze nie pobrana z bazy (odróżniona od pustej: `None`, `{}`, `[]`).
_NIEZALADOWANA = object()


class CanonicalRunZListy(CanonicalRun):
    """Bieg z listy: kolumny ciężkie dociągane dopiero przy pierwszym dostępie.

    DEFEKT, KTÓRY TO USUWA (K14, dług nazwany w V12K-281). `list_by_case` /
    `list_by_project` pobierały PEŁNE wiersze biegów — z artefaktem wyniku,
    śladem White Box i snapshotem modelu — choć większość konsumentów list
    czyta wyłącznie pola lekkie (status, rodzaj analizy, znaczniki czasu).
    Zmierzone na sieci 50 stacji: `list_by_project` przy 5 biegach = 18–27 s,
    z czego niemal całość to deserializacja artefaktów, których nikt w tym
    widoku nie otwierał.

    KONTRAKT PUBLICZNY BEZ ZMIAN: to nadal `CanonicalRun` z tymi samymi polami
    i tymi samymi wartościami. Zmienia się wyłącznie MOMENT odczytu kolumn
    ciężkich — konsument, który po nie sięgnie (np. widok podsumowania biegu),
    dostaje je dokładnie takie jak dotąd, kosztem jednego zapytania po id biegu.
    Zapytanie pobiera WSZYSTKIE kolumny ciężkie naraz, więc kolejne dostępy są
    darmowe.

    Bieg skasowany między listowaniem a dostępem → wartości puste (`None`/`{}`/
    `[]`): dla nieistniejącego biegu nie ma artefaktu i tak brzmi uczciwa
    odpowiedź; nie zmyślamy treści z pamięci.
    """

    def __init__(
        self,
        *,
        id: UUID,
        case_id: str,
        project_id: str | None,
        analysis_type: str,
        status: str,
        created_at: datetime,
        snapshot_hash: str,
        input_hash: str,
        validation: dict[str, Any],
        readiness: dict[str, Any],
        options: dict[str, Any],
        started_at: datetime | None,
        finished_at: datetime | None,
        error_message: str | None,
        result_status: str,
        envelope: dict[str, Any] | None = None,
    ) -> None:
        self._leniwe: dict[str, object] = {}
        super().__init__(
            id=id,
            case_id=case_id,
            project_id=project_id,
            analysis_type=analysis_type,
            status=status,
            created_at=created_at,
            snapshot_hash=snapshot_hash,
            input_hash=input_hash,
            snapshot={},
            validation=validation,
            readiness=readiness,
            options=options,
            started_at=started_at,
            finished_at=finished_at,
            error_message=error_message,
            result_status=result_status,
            envelope=envelope,
        )
        # Konstruktor rodzica ustawił kolumny ciężkie na wartości domyślne przez
        # settery; oznaczamy je jako NIEZAŁADOWANE (nie „puste").
        for nazwa in KOLUMNY_CIEZKIE_BIEGU:
            self._leniwe[nazwa] = _NIEZALADOWANA

    def _wartosc_ciezka(self, nazwa: str) -> object:
        wartosc = self._leniwe[nazwa]
        if wartosc is _NIEZALADOWANA:
            self._doladuj_kolumny_ciezkie()
            wartosc = self._leniwe[nazwa]
        return wartosc

    def _doladuj_kolumny_ciezkie(self) -> None:
        with canonical_run_repository_scope() as repository:
            kolumny = repository.get_heavy_columns(self.id)
        puste: dict[str, object] = {
            "snapshot": {},
            "raw_result": None,
            "white_box_trace": [],
            "power_flow_trace": None,
        }
        wartosci: dict[str, object] = dict(kolumny) if kolumny is not None else puste
        for nazwa in KOLUMNY_CIEZKIE_BIEGU:
            # Wartość ustawiona jawnie przez konsumenta ma pierwszeństwo przed bazą.
            if self._leniwe[nazwa] is _NIEZALADOWANA:
                self._leniwe[nazwa] = wartosci[nazwa]

    @property
    def snapshot(self) -> dict[str, Any]:
        return cast(dict[str, Any], self._wartosc_ciezka("snapshot"))

    @snapshot.setter
    def snapshot(self, wartosc: dict[str, Any]) -> None:
        self._leniwe["snapshot"] = wartosc

    @property
    def raw_result(self) -> dict[str, Any] | None:
        return cast(dict[str, Any] | None, self._wartosc_ciezka("raw_result"))

    @raw_result.setter
    def raw_result(self, wartosc: dict[str, Any] | None) -> None:
        self._leniwe["raw_result"] = wartosc

    @property
    def white_box_trace(self) -> list[dict[str, Any]]:
        return cast(list[dict[str, Any]], self._wartosc_ciezka("white_box_trace"))

    @white_box_trace.setter
    def white_box_trace(self, wartosc: list[dict[str, Any]]) -> None:
        self._leniwe["white_box_trace"] = wartosc

    @property
    def power_flow_trace(self) -> dict[str, Any] | None:
        return cast(dict[str, Any] | None, self._wartosc_ciezka("power_flow_trace"))

    @power_flow_trace.setter
    def power_flow_trace(self, wartosc: dict[str, Any] | None) -> None:
        self._leniwe["power_flow_trace"] = wartosc


def _save_run(run: CanonicalRun) -> None:
    with canonical_run_repository_scope() as repository:
        repository.save(run)


def reset_canonical_runs() -> None:
    with canonical_run_repository_scope() as repository:
        repository.clear_all()


def has_run(run_id: UUID) -> bool:
    with canonical_run_repository_scope() as repository:
        return repository.exists(run_id)


def get_run(run_id: UUID) -> CanonicalRun | None:
    with canonical_run_repository_scope() as repository:
        return repository.get(run_id)


def pobierz_rozplyw_biegu(run: CanonicalRun, fault_node_id: str) -> list[dict[str, Any]] | None:
    """Surowe wkłady gałęziowe solvera dla punktu zwarcia — JEDNA prawda dostępu.

    Kolejność źródeł (pierwsze, które ma treść, wygrywa):
    1. rozpływ INLINE w artefakcie biegu — świeżo policzony bieg trzymany w pamięci
       ORAZ zapis sprzed rozdzielenia artefaktu (ZGODNOŚĆ WSTECZNA: stare bazy
       czytane bez migracji danych),
    2. osobna tabela rozpływu (zapis rozdzielony — artefakt niesie tylko znacznik
       dostępności, treść leży obok).

    Brak w obu źródłach → ``None``: uczciwy brak (solver policzony bez wkładów albo
    nieznany punkt zwarcia), nigdy pusta lista udająca „policzono zero".
    """
    for item in (run.raw_result or {}).get("results", []):
        if not isinstance(item, dict) or item.get("fault_node_id") != fault_node_id:
            continue
        inline = item.get(KLUCZ_ROZPLYWU)
        if inline is not None:
            return list(inline)
        if not item.get(KLUCZ_DOSTEPNOSCI_ROZPLYWU):
            return None
        with canonical_run_repository_scope() as repository:
            return repository.get_branch_flows(run.id, fault_node_id)
    return None


def pobierz_slad_rozplywu_biegu(
    run: CanonicalRun, fault_node_id: str
) -> list[dict[str, Any]] | None:
    """Ślad WHITE BOX podziału prądu zwarciowego punktu (`branch_flow_trace`, TH-1).

    Ta sama klasa ładunku i ta sama kolejność źródeł co `pobierz_rozplyw_biegu`:
    (1) inline w artefakcie w pamięci, (2) osobna tabela (zapis rozdzielony).
    Brak → ``None``: bieg policzony bez wkładów, punkt nieznany albo zapis sprzed
    dodania kolumny śladu — nigdy pusta lista udająca „ślad pusty".
    """
    for item in (run.raw_result or {}).get("results", []):
        if not isinstance(item, dict) or item.get("fault_node_id") != fault_node_id:
            continue
        inline = item.get(KLUCZ_SLADU_ROZPLYWU)
        if inline is not None:
            return list(inline)
        if not item.get(KLUCZ_DOSTEPNOSCI_ROZPLYWU):
            return None
        with canonical_run_repository_scope() as repository:
            return repository.get_branch_flow_trace(run.id, fault_node_id)
    return None


def list_runs_for_case(case_id: str) -> list[CanonicalRun]:
    with canonical_run_repository_scope() as repository:
        return repository.list_by_case(case_id)


def list_runs_for_project(
    project_id: str, *, analysis_type: str | None = None
) -> list[CanonicalRun]:
    with canonical_run_repository_scope() as repository:
        return repository.list_by_project(project_id, analysis_type=analysis_type)


def _validate_protection_sc_reference(
    *, normalized_options: dict[str, Any], project_id_koperty: str | None
) -> None:
    """Bieg zabezpieczen istnieje TYLKO wobec zakonczonego biegu zwarciowego z
    TEGO SAMEGO projektu — walidacja PRZED utworzeniem biegu (B2, karta
    CV-3.3-B), zeby `execute_run` nie odkrywal braku dopiero przy wykonaniu.

    Naprawiony przy okazji wobec (usunietego) `ProtectionAnalysisService`:
    tamten serwis NIGDY nie porownywal projektu biegu zrodlowego z projektem
    zadania — sprawdzal wylacznie `case.project_id == project_id` z URL, wiec
    biegow zwarciowych INNEGO projektu dalo sie uzyc jako zrodla oceny
    zabezpieczen. Ostatni warunek ponizej zamyka te luke.
    """
    sc_run_id_raw = normalized_options.get("sc_run_id")
    if not sc_run_id_raw:
        raise ValueError(
            "Analiza zabezpieczen wymaga options.sc_run_id (identyfikator "
            "zakonczonego biegu zwarciowego, ktorego prad Ik'' interpretuje ocena)"
        )
    try:
        sc_run_uuid = UUID(str(sc_run_id_raw))
    except ValueError as exc:
        raise ValueError(f"sc_run_id nie jest poprawnym UUID: {sc_run_id_raw!r}") from exc
    sc_run = get_run(sc_run_uuid)
    if sc_run is None:
        raise ValueError(f"Bieg zwarciowy '{sc_run_id_raw}' nie istnieje")
    if sc_run.analysis_type != "short_circuit_sn":
        raise ValueError(
            f"Bieg '{sc_run_id_raw}' nie jest biegiem zwarciowym (rodzaj: {sc_run.analysis_type})"
        )
    if sc_run.status != "FINISHED":
        raise ValueError(
            f"Bieg zwarciowy '{sc_run_id_raw}' nie jest zakonczony (status: {sc_run.status})"
        )
    if (
        project_id_koperty is not None
        and sc_run.project_id is not None
        and sc_run.project_id != project_id_koperty
    ):
        raise ValueError(
            f"Bieg zwarciowy '{sc_run_id_raw}' nalezy do innego projektu — analiza "
            "zabezpieczen nie moze interpretowac wyniku spoza wlasnego projektu"
        )


def create_run(
    *,
    case_id: str,
    klucz_twin: str,
    analysis_type: str,
    project_id: str | None = None,
    options: dict[str, Any] | None = None,
    scenariusz: OperatingScenario | None = None,
) -> CanonicalRun:
    """Utworz CanonicalRun z BIEZACEGO modelu projektu.

    `case_id` jest tozsamoscia przypadku (bookkeeping: `CanonicalRun.case_id`,
    `input_hash`, filtrowanie `list_runs_for_case`) i NIE jest kluczem magazynu
    ENM (CV-1-W). Model czyta `klucz_twin` — klucz Canonical Project Twin
    (`enm.klucz_twin.klucz_twin_projektu`), przetlumaczony przez wolajacego
    (`application.twin_key.klucz_twin_dla_przypadku` na granicy API — JEDYNE
    miejsce tlumaczenia, patrz `api/klucz_twin_dep.py`).

    CV-3.1: migawka biegu = `apply_scenario(HEAD, scenariusz)` (`enm/scenariusze.py`).
    Brak scenariusza = stan normalny: migawka, hash, walidacja i koperta sa
    DOKLADNIE takie jak przed CV-3.1. Scenariusz z nadpisaniami modelu jest
    walidowany jako MODEL, KTORY JEST LICZONY (migawka efektywna), a jego
    projekcja na opcje biegu (`opcje_biegu_ze_scenariusza`) jest podkladem, na
    ktory jawne `options` wolajacego nakladaja sie z pierwszenstwem.
    """
    enm = get_enm(klucz_twin)
    scenariusz_biegu = scenariusz if scenariusz is not None else SCENARIUSZ_NORMALNY
    efektywna = apply_scenario(enm, scenariusz_biegu)
    enm_liczony = (
        enm if efektywna.tozsama_z_baza else EnergyNetworkModel.model_validate(efektywna.snapshot)
    )
    validator = ENMValidator()
    validation = validator.validate(enm_liczony)
    readiness = validator.readiness(validation)

    if validation.status == "FAIL":
        messages = [issue.message_pl for issue in validation.issues if issue.severity == "BLOCKER"]
        raise ValueError("; ".join(messages) or "Model sieci nie przeszedl walidacji")

    availability = validation.analysis_available
    if analysis_type == "PF" and not availability.load_flow:
        raise ValueError("Analiza rozpływu mocy nie jest dostepna dla biezacego snapshotu ENM")
    snapshot = efektywna.snapshot
    enm_hash = efektywna.snapshot_hash
    normalized_options = {**opcje_biegu_ze_scenariusza(scenariusz_biegu), **dict(options or {})}
    # CV-2: tozsamosc projektu w kopercie — z parametru albo z klucza twin
    # (klucz surowy w testach magazynu nie niesie projektu → None, uczciwie).
    project_id_koperty = project_id or (
        str(project_id_z_klucza(klucz_twin)) if czy_klucz_projektu(klucz_twin) else None
    )
    if analysis_type == "short_circuit_sn":
        fault_type = _short_circuit_type_from_options(normalized_options)
        if not availability.short_circuit_3f:
            raise ValueError("Analiza zwarciowa nie jest dostepna dla biezacego snapshotu ENM")
        if (
            fault_type
            in {
                ShortCircuitType.SINGLE_PHASE_GROUND,
                ShortCircuitType.TWO_PHASE_GROUND,
            }
            and not availability.short_circuit_1f
        ):
            raise ValueError("Zwarcie 1F/2F+Z wymaga kompletnej skladowej zerowej Z0 w ENM")
    if analysis_type == "phase_state_sn" and not enm_liczony.buses:
        raise ValueError("Stan fazowy SN wymaga co najmniej jednej szyny w ENM")
    if analysis_type == "dynamic_stability" and not (enm_liczony.sources or enm_liczony.generators):
        raise ValueError("Stabilnosc dynamiczna wymaga co najmniej jednego zrodla w ENM")
    if analysis_type == "source_compliance" and not (enm_liczony.sources or enm_liczony.generators):
        raise ValueError("Ocena zgodnosci zrodla wymaga co najmniej jednego zrodla w ENM")
    if analysis_type == "protection_sn":
        _validate_protection_sc_reference(
            normalized_options=normalized_options,
            project_id_koperty=project_id_koperty,
        )
    input_hash = _compute_input_hash(
        case_id=case_id,
        analysis_type=analysis_type,
        enm_hash=enm_hash,
        options=normalized_options,
    )
    scenario_ref, scenario_hash = referencja_koperty(efektywna)
    koperta = zbuduj_koperte(
        project_id=project_id_koperty,
        model_revision=efektywna.base_revision,
        # Koperta identyfikuje BAZE (model HEAD w rewizji) + scenariusz; hash
        # migawki efektywnej niesie `CanonicalRun.snapshot_hash` (`enm/envelope.py`).
        snapshot_hash=efektywna.base_hash,
        catalog_fingerprint=odcisk_katalogu_domyslnego(),
        options_hash=input_hash,
        scenario_ref=scenario_ref,
        scenario_hash=scenario_hash,
    )
    run = CanonicalRun(
        id=uuid4(),
        case_id=case_id,
        project_id=project_id,
        analysis_type=analysis_type,
        status="CREATED",
        created_at=datetime.now(UTC),
        snapshot_hash=enm_hash,
        input_hash=input_hash,
        snapshot=snapshot,
        validation=validation.model_dump(mode="json"),
        readiness=readiness.model_dump(mode="json"),
        options=normalized_options,
        envelope=koperta.to_dict(),
    )
    with canonical_run_repository_scope() as repository:
        repository.create(run)
    return run


def _wykonaj_analize_biegu(
    run: CanonicalRun,
    graf: NetworkGraph | None = None,
    uow_factory: Callable[[], Any] | None = None,
) -> None:
    """JEDYNY dyspozytor typu analizy do wykonania solvera dla CanonicalRun.

    Wspolny dla `execute_run` (biegi persystowane) i `wykonaj_bieg_w_pamieci`
    (warianty migawki bez persystencji). Wywolanie `_execute_short_circuit`
    ma tu swoje JEDYNE miejsce w pliku — budzet zapadki
    `no_direct_fault_params_guard` (`B:_execute_short_circuit: 1`) pozostaje
    dokladnie 1:1; rozgalezianie dyspozycji w drugim miejscu byloby druga
    sciezka tej samej fizyki.

    `graf` — GOTOWY graf zbudowany z `run.snapshot` (patrz `_execute_power_flow`):
    oszczedza POWTORNA budowe tego samego obiektu, nie podmienia wejscia. Ma
    dostawce wylacznie w rozplywie; dla innego typu analizy podanie grafu jest
    bledem kontraktu (zwarcie buduje wlasny graf i jego kopie MIN), nie cicho
    ignorowanym argumentem — graf jest DANYMI wejsciowymi biegu.

    `uow_factory` — fabryka `UnitOfWork` WOLAJACEGO (np. `Depends(get_uow_factory)`
    warstwy API, `app.state.uow_factory`). To ZDOLNOSC kontekstu wykonania, nie
    dane biegu: dyspozytor podaje ja kazdemu wykonawcy, ktory siega po stan
    zapisany w bazie — rozplyw i zwarcie (konfiguracja audytu 2 stacji wskazana
    opcjami `audit2_project_id`/`audit2_station_id`, CV-4.2b) oraz
    zabezpieczenia (`StudyCase.protection_config`, CV-3.3-B). Wykonawca bez
    odczytu bazy (stan fazowy, stabilnosc, zgodnosc zrodla) jej nie potrzebuje
    i jej nie dostaje. ZADEN wykonawca nie buduje wlasnego silnika/sesji z
    `DATABASE_URL` (kasacja `_uow_factory_biezacy`): bieg, ktory potrzebuje bazy,
    a fabryki nie dostal, konczy sie jawnym `ValueError` (status FAILED z
    powodem), nie cichym wynikiem bez korekt ani odczytem z innej bazy niz
    reszta procesu.
    """
    if graf is not None and run.analysis_type != "PF":
        raise ValueError(
            "Gotowy graf sieci przyjmuje wylacznie rozplyw mocy (analysis_type='PF'); "
            f"dla {run.analysis_type!r} graf buduje wykonawca z migawki biegu."
        )
    if run.analysis_type == "PF":
        _execute_power_flow(run, graf, uow_factory=uow_factory)
    elif run.analysis_type == "short_circuit_sn":
        _execute_short_circuit(run, uow_factory=uow_factory)
    elif run.analysis_type == "phase_state_sn":
        _execute_phase_state_sn(run)
    elif run.analysis_type == "dynamic_stability":
        _execute_dynamic_stability(run)
    elif run.analysis_type == "source_compliance":
        _execute_source_compliance(run)
    elif run.analysis_type == "protection_sn":
        _execute_protection(run, uow_factory)
    else:
        raise ValueError(f"Unsupported analysis type: {run.analysis_type}")


def wykonaj_bieg_w_pamieci(
    run: CanonicalRun,
    graf: NetworkGraph | None = None,
    uow_factory: Callable[[], Any] | None = None,
) -> None:
    """Wykonaj bieg WARIANTU w pamieci — bez persystencji i bez zmiany statusu.

    Kanoniczne wejscie dla wzorca wariantow migawki (kontyngencje N-1, bieg
    zbiorczy nastaw, sondy zdolnosci przylaczeniowej): wolajacy buduje bieg
    fabryka `bieg_wariantu` na migawce efektywnej `apply_scenario`, a wykonanie
    idzie DOKLADNIE ta sama dyspozycja co `execute_run` — zadnej rownoleglej
    sciezki fizyki, zadnych surowych parametrow zwarcia poza tym modulem
    (inwariant `no_direct_fault_params_guard`; konsolidacja tego modulu z
    warstwa wiazania to osobny dlug architektoniczny w rejestrze, nie do
    zamykania tutaj). Wynik trafia w pola `raw_result`/`result_summary`
    przekazanego obiektu; magazyn biegow pozostaje nietkniety.

    `graf` (tylko rozplyw): graf ZBUDOWANY Z `run.snapshot`, ktory wolajacy juz
    ma — np. kontyngencja N-1 czyta z niego topologie zasilania PRZED rozplywem
    i oddaje TEN SAM obiekt do rozplywu zamiast budowac go drugi raz z tej samej
    migawki (wynik identyczny co do bitu: graf jest funkcja migawki). Wolajacy
    ODDAJE graf na wlasnosc (regulator zaczepow moze go zmodyfikowac).

    `uow_factory` (CV-4.2b): fabryka `UnitOfWork` wolajacego — wariant dziedziczy
    opcje biegu bazowego (`bieg_wariantu(options=None)`), wiec bieg bazowy
    liczony z konfiguracja audytu 2 stacji daje warianty, ktore te sama
    konfiguracje musza odczytac; bez fabryki taki wariant konczy sie jawnym
    `ValueError` (patrz `_wykonaj_analize_biegu`), nie cichym biegiem bez korekt.
    """
    _wykonaj_analize_biegu(run, graf, uow_factory)


def bieg_wariantu(
    bazowy: CanonicalRun,
    migawka: EffectiveNetworkSnapshot,
    *,
    analysis_type: str,
    options: dict[str, Any] | None = None,
) -> CanonicalRun:
    """JEDYNA fabryka biegu WARIANTU w pamieci (CV-3.1; rodziny D1–D6).

    Wariant to bieg bazowy policzony NA MIGAWCE EFEKTYWNEJ scenariusza
    (`enm.scenariusze.apply_scenario`) — bez persystencji i bez cyklu zycia
    statusu (`FINISHED` od razu, bo czytelnicy widokow wymagaja biegu
    zakonczonego; wykonanie idzie przez `wykonaj_bieg_w_pamieci`). Bieg mowi
    prawde o tym, co liczy: `snapshot_hash` = hash migawki efektywnej,
    `input_hash` policzony z niej i z opcji, koperta z referencja scenariusza
    (wersja 2) — o ile bieg bazowy MA koperte (odcisk katalogu w chwili biegu
    bazowego nie jest do odgadniecia; bez koperty bazy wariant tez jej nie ma).
    `options=None` = opcje biegu bazowego.
    """
    opcje = dict(bazowy.options if options is None else options)
    input_hash = _compute_input_hash(
        case_id=bazowy.case_id,
        analysis_type=analysis_type,
        enm_hash=migawka.snapshot_hash,
        options=opcje,
    )
    koperta_bazy = bazowy.koperta
    envelope: dict[str, Any] | None = None
    if koperta_bazy is not None:
        if koperta_bazy.snapshot_hash != bazowy.snapshot_hash:
            # Bieg bazowy sam policzono na migawce z nadpisaniami scenariusza —
            # wariant wariantu (skladanie scenariuszy) nie jest modelowany
            # (koperta niesie JEDNA referencje scenariusza). Odmowa z nazwa,
            # nie koperta udajaca, ze baza byla stanem normalnym.
            raise ValueError(
                "Bieg bazowy wariantu zostal policzony na scenariuszu z nadpisaniami "
                f"modelu ({koperta_bazy.scenario_ref}); skladanie scenariuszy nie jest "
                "modelowane — wariant buduje sie na biegu stanu normalnego."
            )
        scenario_ref, scenario_hash = referencja_koperty(migawka)
        envelope = zbuduj_koperte(
            project_id=koperta_bazy.project_id,
            model_revision=migawka.base_revision,
            snapshot_hash=koperta_bazy.snapshot_hash,
            catalog_fingerprint=koperta_bazy.catalog_fingerprint,
            options_hash=input_hash,
            scenario_ref=scenario_ref,
            scenario_hash=scenario_hash,
        ).to_dict()
    return CanonicalRun(
        id=bazowy.id,
        case_id=bazowy.case_id,
        project_id=bazowy.project_id,
        analysis_type=analysis_type,
        status="FINISHED",
        created_at=bazowy.created_at,
        snapshot_hash=migawka.snapshot_hash,
        input_hash=input_hash,
        snapshot=migawka.snapshot,
        validation={},
        readiness={},
        options=opcje,
        envelope=envelope,
    )


def odtworz_bieg_z_archiwum(
    dane: Mapping[str, Any],
    *,
    run_id: UUID,
    case_id: str,
    project_id: str,
    options: dict[str, Any],
) -> CanonicalRun:
    """Odtwórz ZAKOŃCZONY bieg z zapisu archiwum projektu (import ZIP, CV-3.3-B).

    Trzecia fabryka biegu obok `create_run` (nowy bieg na bieżącym modelu) i
    `bieg_wariantu` (wariant w pamięci): NICZEGO nie liczy — przepisuje
    historyczny wynik 1:1 (status, wynik surowy, ślad, walidacja, gotowość,
    koperta, migawka, odciski) pod NOWE identyfikatory biegu/przypadku/projektu
    nadane przy imporcie; `options` podaje wołający już po przemapowaniu
    odwołań między biegami (`sc_run_id`). `envelope`/`snapshot` NIE są
    przemapowywane — to zapis historyczny stanu modelu z chwili eksportu
    (przemapowanie `project_id` w kopercie złamałoby `RevisionEnvelope.spojna`
    i zameldowałoby OUTDATED z przyczyną „koperta niespójna" zamiast uczciwego
    porównania z bieżącym modelem po imporcie). Jedyny dom konstrukcji
    `CanonicalRun` poza `create_run`/`bieg_wariantu` — poza tym modułem
    konstrukcja jest naruszeniem R2 `scripts/scenario_copy_guard.py`.
    """

    def _czas(klucz: str) -> datetime | None:
        wartosc = dane.get(klucz)
        return datetime.fromisoformat(str(wartosc)) if wartosc else None

    return CanonicalRun(
        id=run_id,
        case_id=case_id,
        project_id=project_id,
        analysis_type=str(dane["analysis_type"]),
        status=str(dane["status"]),
        created_at=datetime.fromisoformat(str(dane["created_at"])),
        snapshot_hash=str(dane["snapshot_hash"]),
        input_hash=str(dane["input_hash"]),
        snapshot=dict(dane["snapshot"]),
        validation=dict(dane["validation"]),
        readiness=dict(dane["readiness"]),
        options=options,
        started_at=_czas("started_at"),
        finished_at=_czas("finished_at"),
        error_message=dane.get("error_message"),
        result_status=str(dane.get("result_status", "VALID")),
        raw_result=dane.get("raw_result"),
        white_box_trace=list(dane.get("white_box_trace") or []),
        power_flow_trace=dane.get("power_flow_trace"),
        envelope=dane.get("envelope"),
    )


def execute_run(run_id: UUID, uow_factory: Callable[[], Any] | None = None) -> CanonicalRun:
    """Wykonaj bieg persystowany (dyspozycja fizyki: `_wykonaj_analize_biegu`).

    `uow_factory`: fabryka `UnitOfWork` WOŁAJĄCEGO (routera API), przekazywana
    w dół dyspozytorowi (`_wykonaj_analize_biegu`) — potrzebna każdemu biegowi,
    który czyta stan zapisany w bazie: zabezpieczeniom (`StudyCase.protection_
    config`) oraz rozpływowi/zwarciu z konfiguracją audytu 2 stacji (opcje
    `audit2_project_id`/`audit2_station_id`). Bieg bez odczytu bazy działa i bez
    niej. Pominięcie dla biegu, który bazy potrzebuje, kończy się statusem
    FAILED z jawnym powodem — od CV-4.2b NIE ma zapasowej fabryki z
    `DATABASE_URL` (była drugim, niezależnym połączeniem z bazą w tym samym
    procesie).
    """
    run = get_run(run_id)
    if run is None:
        raise ValueError(f"Run {run_id} not found")
    if run.status in {"FINISHED", "FAILED"}:
        return run

    run.status = "RUNNING"
    run.started_at = datetime.now(UTC)
    run.error_message = None
    _save_run(run)

    try:
        _wykonaj_analize_biegu(run, uow_factory=uow_factory)
        run.status = "FINISHED"
        run.finished_at = datetime.now(UTC)
        _save_run(run)
        return run
    except Exception as exc:
        run.status = "FAILED"
        run.error_message = str(exc)
        run.finished_at = datetime.now(UTC)
        _save_run(run)
        return run


def run_short_circuit_now(
    *,
    case_id: str,
    klucz_twin: str,
    project_id: str | None = None,
    options: dict[str, Any] | None = None,
    uow_factory: Callable[[], Any] | None = None,
) -> CanonicalRun:
    run = create_run(
        case_id=case_id,
        klucz_twin=klucz_twin,
        analysis_type="short_circuit_sn",
        project_id=project_id,
        options=options,
    )
    return execute_run(run.id, uow_factory=uow_factory)


def run_power_flow_now(
    *,
    case_id: str,
    klucz_twin: str,
    project_id: str | None = None,
    options: dict[str, Any] | None = None,
    uow_factory: Callable[[], Any] | None = None,
) -> CanonicalRun:
    run = create_run(
        case_id=case_id,
        klucz_twin=klucz_twin,
        analysis_type="PF",
        project_id=project_id,
        options=options,
    )
    return execute_run(run.id, uow_factory=uow_factory)


def run_phase_state_now(
    *,
    case_id: str,
    klucz_twin: str,
    project_id: str | None = None,
    options: dict[str, Any] | None = None,
    uow_factory: Callable[[], Any] | None = None,
) -> CanonicalRun:
    run = create_run(
        case_id=case_id,
        klucz_twin=klucz_twin,
        analysis_type="phase_state_sn",
        project_id=project_id,
        options=options,
    )
    return execute_run(run.id, uow_factory=uow_factory)


def run_dynamic_stability_now(
    *,
    case_id: str,
    klucz_twin: str,
    project_id: str | None = None,
    options: dict[str, Any] | None = None,
    uow_factory: Callable[[], Any] | None = None,
) -> CanonicalRun:
    run = create_run(
        case_id=case_id,
        klucz_twin=klucz_twin,
        analysis_type="dynamic_stability",
        project_id=project_id,
        options=options,
    )
    return execute_run(run.id, uow_factory=uow_factory)


def run_source_compliance_now(
    *,
    case_id: str,
    klucz_twin: str,
    project_id: str | None = None,
    options: dict[str, Any] | None = None,
    uow_factory: Callable[[], Any] | None = None,
) -> CanonicalRun:
    run = create_run(
        case_id=case_id,
        klucz_twin=klucz_twin,
        analysis_type="source_compliance",
        project_id=project_id,
        options=options,
    )
    return execute_run(run.id, uow_factory=uow_factory)


def _phase_value_from_options(
    options: dict[str, Any],
    key: str,
    *,
    default: tuple[float, float, float],
) -> PhaseValues:
    raw = options.get(key)
    if isinstance(raw, dict):
        return PhaseValues(
            float(raw.get("A", default[0])),
            float(raw.get("B", default[1])),
            float(raw.get("C", default[2])),
        )
    if isinstance(raw, list | tuple) and len(raw) == 3:
        return PhaseValues(float(raw[0]), float(raw[1]), float(raw[2]))
    return PhaseValues(*default)


def _open_phase_flags_from_options(options: dict[str, Any]) -> OpenPhaseFlags:
    raw = options.get("open_phase")
    if isinstance(raw, dict):
        return OpenPhaseFlags(
            a=bool(raw.get("A", raw.get("a", False))),
            b=bool(raw.get("B", raw.get("b", False))),
            c=bool(raw.get("C", raw.get("c", False))),
        )
    if isinstance(raw, str):
        normalized = raw.strip().upper()
        return OpenPhaseFlags(
            a=normalized == "A",
            b=normalized == "B",
            c=normalized == "C",
        )
    return OpenPhaseFlags()


def _pick_phase_state_target(snapshot: dict[str, Any], options: dict[str, Any]) -> str:
    explicit = options.get("target_bus_ref") or options.get("target_id")
    if explicit:
        return str(explicit)
    buses = snapshot.get("buses") or []
    for raw_bus in buses:
        if isinstance(raw_bus, dict) and raw_bus.get("ref_id"):
            return str(raw_bus["ref_id"])
    return "bus-phase-state"


def _pick_dynamic_source_ref(snapshot: dict[str, Any], options: dict[str, Any]) -> str:
    explicit = options.get("source_ref") or options.get("source_id")
    if explicit:
        return str(explicit)
    for collection in ("sources", "generators"):
        for raw_element in snapshot.get(collection) or []:
            if isinstance(raw_element, dict) and raw_element.get("ref_id"):
                return str(raw_element["ref_id"])
    return "source-dynamic"


def _pick_compliance_source_ref(snapshot: dict[str, Any], options: dict[str, Any]) -> str:
    explicit = options.get("source_ref") or options.get("source_id")
    if explicit:
        return str(explicit)
    for collection in ("sources", "generators"):
        for raw_element in snapshot.get(collection) or []:
            if isinstance(raw_element, dict) and raw_element.get("ref_id"):
                return str(raw_element["ref_id"])
    return "source-compliance"


# USUNIETE (karta K-Q, 2026-08-14): `_phase_state_default_fault_current_from_grounding`.
#
# Funkcja brala MEDIANE zakresu `typical_ik1_a_range` z katalogu uziemienia SN i
# podawala ja solverowi `phase_state_sn` jako domyslny prad zwarcia doziemnego.
# Ten zakres byl zgadniety — nie mial zadnego zrodla (karta K-O usunela go z
# frontendu, K-Q z backendu), wiec do fizyki wchodzila liczba wymyslona, a wynik
# analizy stanu fazowego wygladal na policzony. Typ uziemienia SAM w sobie nie
# wyznacza I_k1: zalezy on od pojemnosci doziemnej calej galezi sieci (siec
# izolowana), od nastrojenia dlawika (siec skompensowana) albo od rezystora RAZEM
# z impedancja petli — czyli od modelu, nie od etykiety wariantu.
#
# Prad zwarcia doziemnego liczy solver SC1F z realnej impedancji Z0 modelu. Gdy
# uzytkownik nie poda `fault_current_a` w opcjach przypadku, stan fazowy liczy sie
# bez zwarcia (0 A na kazdej fazie) — stan uczciwy, bo „nie wiem" nie jest liczba.


def _execute_phase_state_sn(run: CanonicalRun) -> None:
    snapshot = run.snapshot or {}
    target_bus_ref = _pick_phase_state_target(snapshot, run.options)
    target_bus_id = _graph_id_from_ref(target_bus_ref)
    target_bus = next(
        (
            raw_bus
            for raw_bus in snapshot.get("buses") or []
            if isinstance(raw_bus, dict) and str(raw_bus.get("ref_id") or "") == target_bus_ref
        ),
        None,
    )
    # Karta RATCHET-DICT-READ (2026-08-13): USUNIETA fabrykacja "or 15.0". `Bus.
    # voltage_kv` jest WYMAGANE w kontrakcie ENM (enm/models.py), a `execute_run`
    # odrzuca "phase_state_sn" bez co najmniej jednej szyny PRZED uruchomieniem
    # tej funkcji (`if analysis_type == "phase_state_sn" and not enm.buses: raise
    # ValueError`), wiec auto-dobor celu (`_pick_phase_state_target`) zawsze
    # trafia w istniejaca szyne z realnym napieciem. Jedyna droga do `target_bus
    # is None` to JAWNIE podany `target_bus_ref`/`target_id` w opcjach przypadku,
    # ktory nie wskazuje zadnej realnej szyny (literowka, usunieta szyna) — to
    # blad danych wejsciowych uzytkownika, ktory nalezy zamelodowac wprost, a nie
    # cichaczem zgadywac napiecie 15 kV rozdzielni SN.
    if target_bus is None:
        raise ValueError(
            f"Stan fazowy SN: docelowa szyna '{target_bus_ref}' nie istnieje w modelu ENM"
        )
    source_voltage_default = float(target_bus["voltage_kv"]) / math.sqrt(3.0)
    solver_input = PhaseStateSNInput(
        source_voltage_kv=_phase_value_from_options(
            run.options,
            "source_voltage_kv",
            default=(source_voltage_default, source_voltage_default, source_voltage_default),
        ),
        load_current_a=_phase_value_from_options(
            run.options,
            "load_current_a",
            default=(100.0, 100.0, 100.0),
        ),
        branch_resistance_ohm=_phase_value_from_options(
            run.options,
            "branch_resistance_ohm",
            default=(0.1, 0.1, 0.1),
        ),
        fault_current_a=_phase_value_from_options(
            run.options,
            "fault_current_a",
            # Brak jawnego pradu zwarcia w opcjach = brak zwarcia w tym stanie.
            # Katalog uziemienia SN NIE podpowiada tu zadnej liczby — patrz nota
            # nad `_execute_phase_state_sn` (karta K-Q).
            default=(0.0, 0.0, 0.0),
        ),
        open_phase=_open_phase_flags_from_options(run.options),
        unbalance_alert_percent=float(run.options.get("unbalance_alert_percent", 10.0)),
        solver_version=str(run.options.get("solver_version") or "phase_state_sn_v1"),
    )
    solver_result = PhaseStateSNSolver.solve(solver_input)
    proof_ref = _phase_state_proof_ref(run=run, target_id=target_bus_ref)
    proof_payload = PhaseStateSNProofPack.materialize_payload(
        PhaseStateSNProofPackInput(
            project_id=run.project_id or run.case_id,
            case_id=run.case_id,
            run_id=str(run.id),
            snapshot_id=run.snapshot_hash,
            project_name=str((snapshot.get("header") or {}).get("name") or "Projekt"),
            case_name=str(run.options.get("case_name") or "Stan fazowy SN"),
            run_timestamp=run.started_at or run.created_at,
            solver_input=solver_input,
            scenario_name=str(run.options.get("scenario_name") or "radial_reference"),
        ),
        solver_result=solver_result,
    )
    run.raw_result = {
        "analysis_type": "phase_state_sn",
        "target_id": target_bus_id,
        "target_bus_ref": target_bus_ref,
        "proof_ref": proof_ref,
        "proof_status": "complete",
        "proof_status_pl": "pelny",
        "reporting_status": "reportable",
        "reporting_status_pl": "raportowalny",
        "proof_payload": proof_payload,
        "result": solver_result.to_dict(),
        "dopuszczalnosc_raportowa": True,
        "reporting_limitations": [],
    }
    run.white_box_trace = [
        {
            "step": 1,
            "key": "PHASE_STATE_INPUT",
            "title": f"Stan fazowy SN: wejscie {target_bus_ref}",
            "target_id": target_bus_id,
            "element_id": target_bus_ref,
            "phase_state_target_ref": target_bus_ref,
            "method_basis": "PHASE_STATE_SN_RADIAL_V1",
            "inputs": solver_input.to_dict(),
            "proof_ref": proof_ref,
            "proof_status": "complete",
            "reporting_status": "reportable",
        },
        {
            "step": 2,
            "key": "PHASE_STATE_OUTPUT",
            "title": f"Stan fazowy SN: wynik {target_bus_ref}",
            "target_id": target_bus_id,
            "element_id": target_bus_ref,
            "phase_state_target_ref": target_bus_ref,
            "method_basis": "PHASE_STATE_SN_RADIAL_V1",
            "result": solver_result.to_dict(),
            "proof_ref": proof_ref,
            "proof_status": "complete",
            "reporting_status": "reportable",
        },
    ]
    run.power_flow_trace = None


def _execute_dynamic_stability(run: CanonicalRun) -> None:
    snapshot = run.snapshot or {}
    source_ref = _pick_dynamic_source_ref(snapshot, run.options)
    scenario = FaultClearScenario(
        scenario_id=str(run.options.get("scenario_id") or f"dyn-{run.id}"),
        faulted_element_id=str(run.options.get("faulted_element_id") or "faulted-element"),
        clearing_time_ms=float(run.options.get("clearing_time_ms", 120.0)),
        cleared_by_element_ids=tuple(run.options.get("cleared_by_element_ids") or ("cb-main",)),
        source_state=FaultClearSourceState(
            source_id=source_ref,
            pre_fault_angle_deg=float(run.options.get("pre_fault_angle_deg", 10.0)),
            during_fault_angle_deg=float(run.options.get("during_fault_angle_deg", 75.0)),
            post_fault_angle_deg=float(run.options.get("post_fault_angle_deg", 28.0)),
            post_fault_voltage_pu=float(run.options.get("post_fault_voltage_pu", 0.97)),
            post_fault_frequency_pu=float(run.options.get("post_fault_frequency_pu", 0.99)),
        ),
    )
    stability_result = evaluate_fault_clear_dynamic_stability(scenario)
    topology_effect = build_post_fault_topology_effect(
        source_id=stability_result.source_id,
        faulted_element_id=stability_result.faulted_element_id,
        cleared_by_element_ids=stability_result.cleared_by_element_ids,
        isolated_element_ids=tuple(run.options.get("isolated_element_ids") or ()),
        additionally_opened_element_ids=tuple(
            run.options.get("additionally_opened_element_ids") or ()
        ),
        disconnected_source_ids=tuple(run.options.get("disconnected_source_ids") or ()),
    )
    automation_trace = build_automation_trace(stability_result, topology_effect)
    proof_ref = _dynamic_stability_proof_ref(run=run, scenario_id=stability_result.scenario_id)
    result_payload = stability_result.to_dict()
    topology_payload = topology_effect.to_dict()
    # Szereg czasowy U(t)/f(t) przebiegu — istniejący, deterministyczny generator
    # trajektorii FRT (application/stability/voltage_trajectory.py) sparametryzowany
    # scenariuszem wyłączenia zwarcia. ZERO nowej fizyki: równania modelu odbudowy
    # napięcia/częstotliwości nietknięte, tu jedynie wystawiamy istniejący przebieg.
    # Przechowywane addytywnie (klucz `time_series` obok `result`) — starsze biegi
    # bez tego klucza; osobny endpoint wystawia go na żądanie (nie pompuje wyniku).
    trajectory = generate_voltage_trajectory(
        TrajectoryGenerationParams(
            clearing_time_ms=scenario.clearing_time_ms,
            post_fault_voltage_pu=scenario.source_state.post_fault_voltage_pu,
            post_fault_frequency_pu=scenario.source_state.post_fault_frequency_pu,
        )
    )
    time_series_payload = {
        "time_unit": "s",
        "criteria_version": stability_result.criteria_version,
        "quantities": [
            {"key": "voltage_pu", "label_pl": "Napięcie", "unit": "p.u."},
            {"key": "frequency_pu", "label_pl": "Częstotliwość", "unit": "p.u."},
        ],
        "points": [point.to_dict() for point in trajectory],
    }
    run.raw_result = {
        "analysis_type": "dynamic_stability",
        "scenario": scenario.to_dict(),
        "result": result_payload,
        "time_series": time_series_payload,
        "automation_trace": automation_trace.to_dict(),
        "topology_effect": topology_payload,
        "proof_ref": proof_ref,
        "proof_status": "complete",
        "proof_status_pl": "pelny",
        "reporting_status": "reportable",
        "reporting_status_pl": "raportowalny",
        "dopuszczalnosc_raportowa": True,
        "reporting_limitations": [],
    }
    run.white_box_trace = [
        {
            "step": index,
            "key": event.event_type,
            "title": event.detail or event.event_type,
            "target_id": event.element_id,
            "element_id": event.element_id,
            "method_basis": "DYNAMIC_STABILITY_FAULT_CLEAR_V1",
            "result": event.payload,
            "proof_ref": proof_ref,
            "proof_status": "complete",
            "reporting_status": "reportable",
        }
        for index, event in enumerate(automation_trace.events, start=1)
    ]
    run.power_flow_trace = None


def _execute_source_compliance(run: CanonicalRun) -> None:
    snapshot = run.snapshot or {}
    source_ref = _pick_compliance_source_ref(snapshot, run.options)
    source_type = str(run.options.get("source_type") or "PV")
    operator_profile = run.options.get("operator_profile")
    source_profile = run.options.get("source_profile")
    compliance_result = evaluate_source_compliance(
        source_type=source_type,
        operator_profile=operator_profile if isinstance(operator_profile, dict) else None,
        source_profile=source_profile if isinstance(source_profile, dict) else None,
    )
    proof_ref = _source_compliance_proof_ref(run=run, source_ref=source_ref)
    result_payload = compliance_result.to_dict()
    run.raw_result = {
        "analysis_type": "source_compliance",
        "source_ref": source_ref,
        "source_type": result_payload["source_type"],
        "operator_profile": operator_profile,
        "source_profile": source_profile,
        "result": result_payload,
        "proof_ref": proof_ref,
        "proof_status": result_payload["proof_status"],
        "proof_status_pl": (
            "pelny" if result_payload["proof_status"] == "complete" else "niepelny"
        ),
        "reporting_status": result_payload["reporting_status"],
        "reporting_status_pl": (
            "raportowalny"
            if result_payload["reporting_status"] == "reportable"
            else "nieraportowalny"
        ),
        "dopuszczalnosc_raportowa": result_payload["reporting_status"] == "reportable",
        "reporting_limitations": list(result_payload["limitations"]),
    }
    run.white_box_trace = [
        {
            "step": 1,
            "key": "SOURCE_PROFILE_INPUT",
            "title": f"Profil operatora i zrodla: {source_ref}",
            "target_id": source_ref,
            "element_id": source_ref,
            "method_basis": "SOURCE_COMPLIANCE_V1",
            "inputs": {
                "source_type": result_payload["source_type"],
                "operator_profile": operator_profile,
                "source_profile": source_profile,
            },
            "proof_ref": proof_ref,
            "proof_status": result_payload["proof_status"],
            "reporting_status": result_payload["reporting_status"],
        },
        {
            "step": 2,
            "key": "SOURCE_COMPLIANCE_RESULT",
            "title": f"Ocena zgodnosci zrodla: {source_ref}",
            "target_id": source_ref,
            "element_id": source_ref,
            "method_basis": "SOURCE_COMPLIANCE_V1",
            "result": result_payload,
            "proof_ref": proof_ref,
            "proof_status": result_payload["proof_status"],
            "reporting_status": result_payload["reporting_status"],
        },
    ]
    run.power_flow_trace = None


def _execute_protection(run: CanonicalRun, uow_factory: Callable[[], Any] | None = None) -> None:
    """Bieg zabezpieczen (P15a/P15b) — INTERPRETACJA wylacznie, zero fizyki:
    ocena zadzialania jednego urzadzenia wobec pradu zwarciowego biegu
    zrodlowego (`options["sc_run_id"]`). Silnik oceny (`ProtectionEvaluationEngine`,
    IEC 60255) jest nietkniety — przeniesiona zostala WYLACZNIE orkiestracja
    (dawniej `application.protection_analysis.service.ProtectionAnalysisService`,
    usunieta karta CV-3.3-B razem z zapisem do R3 `study_results`).

    `create_run` juz zwalidowal istnienie/rodzaj/status/projekt biegu
    zrodlowego (`_validate_protection_sc_reference`) — miedzy utworzeniem a
    wykonaniem bieg zrodlowy nie moze zniknac (biegi R1 sa append-only), wiec
    tu odczyt jest bezwarunkowy. Konfiguracja zabezpieczen zyje na
    `StudyCase.protection_config` (SQL), nie w ENM — to JEDYNE miejsce w tym
    module, gdzie analiza inna niz katalog/audit2 siega po `UnitOfWork`.

    `uow_factory`: fabryka WOLAJACEGO (routera API) — patrz
    `_wykonaj_analize_biegu` docstring. `None` = jawny `ValueError` (CV-4.2b):
    dawny zapasowy `_uow_factory_biezacy()` budowal WLASNA fabryke z
    `DATABASE_URL` — inny silnik/sesje niz reszta procesu, wiec przypadek
    istniejacy naprawde potrafil wygladac jak nieistniejacy (bug znaleziony
    przy CV-3.3-B: `test_bieg_zakonczony_model_zmieniony_daje_outdated` i
    siostrzane w `tests/api/test_protection_overlay_swiezosc.py`); po CV-4.2b
    kazdy wolajacy podaje fabryke swojego kontekstu, a zapas nie istnieje.
    """
    from application.protection_analysis.catalog_lookup import (
        get_protection_curve,
        get_protection_device_type,
        get_protection_template,
    )
    from application.protection_analysis.engine import (
        ProtectionEvaluationEngine,
        ProtectionEvaluationInput,
        build_device_from_template,
        build_fault_from_sc_result,
    )

    sc_run_id = UUID(str(run.options["sc_run_id"]))
    sc_run = get_run(sc_run_id)
    if sc_run is None or sc_run.status != "FINISHED":
        raise ValueError(
            f"Bieg zwarciowy zrodlowy '{sc_run_id}' nie jest juz dostepny albo "
            "przestal byc zakonczony"
        )

    if uow_factory is None:
        raise ValueError(
            "Bieg zabezpieczen czyta konfiguracje zabezpieczen przypadku z bazy, a "
            "wykonawca nie dostal fabryki UnitOfWork wolajacego — bieg nie buduje "
            "wlasnego polaczenia z baza (CV-4.2b)"
        )

    case_uuid = UUID(run.case_id)
    with uow_factory() as uow:
        case = uow.cases.get_study_case(case_uuid)
        if case is None:
            raise ValueError(f"Przypadek '{run.case_id}' nie istnieje")
        protection_config = case.protection_config
        if protection_config.template_ref is None:
            raise ValueError("Konfiguracja zabezpieczen przypadku nie ma template_ref")
        template = get_protection_template(uow, protection_config.template_ref)
        if template is None:
            raise ValueError(
                f"Szablon nastaw '{protection_config.template_ref}' nie istnieje w katalogu"
            )
        curve = get_protection_curve(uow, template.curve_ref) if template.curve_ref else None
        device_type = (
            get_protection_device_type(uow, template.device_type_ref)
            if template.device_type_ref
            else None
        )
        snapshot_id = case.network_snapshot_id
        template_ref = protection_config.template_ref
        template_fingerprint = protection_config.template_fingerprint
        library_manifest_ref = protection_config.library_manifest_ref
        overrides = protection_config.overrides

    # Prad zwarciowy Ik'' interpretowany przez ocene: pierwszy (deterministycznie
    # posortowany po fault_node_id) wpis biegu zrodlowego z policzonym Ik'' —
    # ta sama regula wyboru co (usuniety) `ProtectionAnalysisService._get_sc_result`.
    sc_results = list((sc_run.raw_result or {}).get("results") or [])
    fault_row = next(
        (
            item
            for item in sorted(sc_results, key=lambda row: str(row.get("fault_node_id") or ""))
            if item.get("ikss_a") is not None
        ),
        None,
    )
    if fault_row is None:
        raise ValueError(
            f"Bieg zwarciowy '{sc_run_id}' nie ma zadnego wyniku z pradem zwarciowym "
            "Ik'' — nie ma na czym oprzec oceny zabezpieczenia"
        )
    fault_node_id = str(fault_row.get("fault_node_id"))
    ikss_a = float(fault_row.get("ikss_a"))
    short_circuit_type = str(
        fault_row.get("short_circuit_type")
        or (sc_run.raw_result or {}).get("short_circuit_type")
        or "3F"
    )

    device = build_device_from_template(
        device_id=f"device_{fault_node_id}",
        protected_element_ref=fault_node_id,
        template=template,
        curve=curve,
        device_type=device_type,
        overrides=overrides,
    )
    fault = build_fault_from_sc_result(
        fault_node_id=fault_node_id,
        ikss_a=ikss_a,
        short_circuit_type=short_circuit_type,
    )
    evaluation_input = ProtectionEvaluationInput(
        run_id=str(run.id),
        sc_run_id=str(sc_run.id),
        protection_case_id=run.case_id,
        template_ref=template_ref,
        template_fingerprint=template_fingerprint,
        library_manifest_ref=library_manifest_ref,
        devices=(device,),
        faults=(fault,),
        snapshot_id=snapshot_id,
        overrides=overrides,
    )
    result, trace = ProtectionEvaluationEngine().evaluate(evaluation_input)

    run.raw_result = {
        "analysis_type": "protection",
        "sc_run_id": str(sc_run.id),
        "protection_result": result.to_dict(),
        "protection_trace": trace.to_dict(),
    }
    run.white_box_trace = [step.to_dict() for step in trace.steps]
    run.power_flow_trace = None


def rozszerzenia_audit2_dla_opcji(
    options: Mapping[str, Any], uow_factory: Callable[[], Any] | None
) -> dict[str, Any] | None:
    """Rozszerzenia audytu 2 stacji wskazanej opcjami biegu — JEDYNY odczyt dla wykonawców.

    Karta CV-4.2b. Opcje `audit2_project_id` + `audit2_station_id` (para) wskazują
    zapisaną konfigurację audytu 2 (`station_audit2_configs`); wykonawca rozpływu i
    zwarcia podaje wynik assemblerowi jako dane (`rozszerzenia_audit2`), a assembler
    nie otwiera bazy. Odczyt idzie WYŁĄCZNIE fabryką `UnitOfWork` wołającego —
    tą samą, którą zapisano konfigurację przez API — więc „zapisane" i „widoczne
    dla biegu" to jedna baza (do tej karty assembler budował własny silnik z
    `DATABASE_URL`, niezależny od `app.state.uow_factory`, i konfiguracja bywała
    dla biegu niewidoczna).

    Rozstrzygnięcia (bez cichych zapasów, klasa A6-12):
    - brak OBU opcji → `None` (bieg bez korekt audytu 2; baza nietknięta);
    - połowa pary, niepoprawny UUID projektu, brak fabryki → jawny `ValueError`
      (bieg FAILED z powodem), nie wynik liczony bez korekt, o które proszono;
    - para wskazuje stację bez zapisanej konfiguracji → `None` (opt-in nieobecny —
      to legalny stan, nie błąd: konfiguracja audytu 2 jest nadpisaniem inżyniera).
    """
    project_id_str = options.get("audit2_project_id")
    station_id = options.get("audit2_station_id")
    if not project_id_str and not station_id:
        return None
    if not project_id_str or not station_id:
        raise ValueError(
            "Opcje biegu wskazuja konfiguracje audytu 2 polowa pary: potrzebne sa OBA "
            "`audit2_project_id` i `audit2_station_id`"
        )
    try:
        project_uuid = UUID(str(project_id_str))
    except ValueError as exc:
        raise ValueError(
            f"`audit2_project_id` nie jest poprawnym UUID: {project_id_str!r}"
        ) from exc
    if uow_factory is None:
        raise ValueError(
            "Opcje biegu wskazuja konfiguracje audytu 2 stacji "
            f"({project_id_str}/{station_id}), a wykonawca nie dostal fabryki UnitOfWork "
            "wolajacego — bieg nie buduje wlasnego polaczenia z baza (CV-4.2b)"
        )
    from solver_input.audit2_der_payload import rozszerzenia_audit2_z_konfiguracji

    with uow_factory() as uow:
        cfg = uow.audit2_station_configs.get(project_uuid, str(station_id))
        if cfg is None:
            return None
        return rozszerzenia_audit2_z_konfiguracji(cfg)


def _execute_short_circuit(run: CanonicalRun, uow_factory: Callable[[], Any] | None = None) -> None:
    wejscie = zloz_wejscie_zwarcia(
        run.snapshot or {},
        run.options,
        rozszerzenia_audit2=rozszerzenia_audit2_dla_opcji(run.options, uow_factory),
    )
    graph = wejscie.graph
    graph_nodes = wejscie.graph_nodes
    graph_branches = wejscie.graph_branches
    short_circuit_type = wejscie.short_circuit_type
    z0_bus = wejscie.z0_bus
    scenario_c = wejscie.scenario_c
    c_factor_explicit = wejscie.c_factor_explicit
    c_factor_override = wejscie.c_factor_override
    tk_s = wejscie.tk_s
    solve_graph = wejscie.solve_graph
    temperature_correction_notes = wejscie.temperature_correction_notes
    reportable_fault_node_ids = wejscie.reportable_fault_node_ids
    rows: list[dict[str, Any]] = []
    trace_steps: list[dict[str, Any]] = []

    # CI-PARYTET-5: węzły bez impedancji do odniesienia ustalone z TOPOLOGII przed
    # biegiem (funkcja wejścia, nie liczb solvera — patrz docstring pomocnika).
    wezly_bez_odniesienia = _wezly_bez_impedancji_do_odniesienia(solve_graph)
    for node_id in reportable_fault_node_ids:
        # AUTO: c z pasma napięciowego WŁASNEGO węzła zwarcia (IEC 60909 Tab. 1);
        # OVERRIDE: wartość jawna z options, płasko dla wszystkich węzłów.
        c_factor = (
            float(c_factor_explicit)
            if c_factor_override
            else c_for_node(graph.nodes[node_id].voltage_level, scenario_c)
        )
        # ZWARCIA-PRO F4 (karta W-C): wkłady gałęziowe FROZEN solvera są liczone
        # ZAWSZE w torze kanonicznym (opcja addytywna solvera — nie zmienia
        # żadnej istniejącej wielkości ani śladu White Box; osobna superpozycja).
        if short_circuit_type == ShortCircuitType.THREE_PHASE:
            result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
                graph=solve_graph,
                fault_node_id=node_id,
                c_factor=c_factor,
                tk_s=tk_s,
                include_branch_contributions=True,
            )
        elif short_circuit_type == ShortCircuitType.SINGLE_PHASE_GROUND:
            result = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
                graph=solve_graph,
                fault_node_id=node_id,
                c_factor=c_factor,
                tk_s=tk_s,
                z0_bus=z0_bus,
                include_branch_contributions=True,
            )
        elif short_circuit_type == ShortCircuitType.TWO_PHASE:
            result = ShortCircuitIEC60909Solver.compute_2ph_short_circuit(
                graph=solve_graph,
                fault_node_id=node_id,
                c_factor=c_factor,
                tk_s=tk_s,
                include_branch_contributions=True,
            )
        else:
            result = ShortCircuitIEC60909Solver.compute_2ph_ground_short_circuit(
                graph=solve_graph,
                fault_node_id=node_id,
                c_factor=c_factor,
                tk_s=tk_s,
                z0_bus=z0_bus,
                include_branch_contributions=True,
            )
        payload = result.to_dict()
        node_trace_step_refs: list[int] = []
        for step_index, step in enumerate(payload.get("white_box_trace", []), start=1):
            node_context = graph_nodes.get(node_id, {})
            global_step_index = len(trace_steps) + 1
            node_trace_step_refs.append(global_step_index)
            trace_steps.append(
                {
                    **step,
                    "step": global_step_index,
                    "target_id": node_id,
                    "element_id": node_context.get("element_id"),
                    "element_type": node_context.get("element_type"),
                    "graph_role": node_context.get("graph_role"),
                    "title": step.get("title")
                    or f"Zwarcie {short_circuit_type.value}: {node_id} / krok {step_index}",
                }
            )
        reportability = _short_circuit_reportability(
            run=run,
            target_id=node_id,
            short_circuit_type=short_circuit_type,
            trace_step_refs=node_trace_step_refs,
        )
        for trace_step in trace_steps[-len(node_trace_step_refs) :] if node_trace_step_refs else []:
            trace_step.update(
                {
                    "proof_ref": reportability["proof_ref"],
                    "proof_status": reportability["proof_status"],
                    "reporting_status": reportability["reporting_status"],
                    "method_basis": reportability["method_basis"],
                }
            )
        payload.update(
            {
                "analysis_type": _result_analysis_type_for_fault(short_circuit_type),
                "reporting_status": reportability["reporting_status"],
                "reporting_status_pl": reportability["reporting_status_pl"],
                "proof_status": reportability["proof_status"],
                "proof_status_pl": reportability["proof_status_pl"],
                "proof_ref": reportability["proof_ref"],
                "proof_binding": reportability,
                "dopuszczalnosc_raportowa": True,
                "reporting_limitations": reportability["reporting_limitations"],
                # GAP passthrough (V12K-128): domknięcie kontraktu read-only —
                # wymóg i źródło Z0 na poziomie pozycji wyniku (dotąd wyłącznie
                # w `proof_binding`, gubione w wierszu kanonicznym).
                "requires_z0": reportability["requires_z0"],
                "z0_source": reportability["z0_source"],
                # Karta P0.3b: c per pasmo + scenariusz MIN (addytywne, `c_factor`
                # sam solver już raportuje wyżej w `payload` — nie duplikujemy).
                "scenario": scenario_c,
                "c_factor_override": c_factor_override,
            }
        )
        if node_id in wezly_bez_odniesienia:
            payload = _oznacz_wiersz_bez_odniesienia(payload)
        rows.append(_oznacz_wiersz_zwarcia_niefizyczny(payload))

    if not rows:
        raise ValueError("Nie udalo sie obliczyc wynikow zwarciowych dla zadnego wezla")

    # Ślad White Box biegu dzieli słowniki kroków z wierszami (kopie płytkie) —
    # ta sama podmiana wartości niefinitowych, ten sam wykaz ścieżek.
    # Kroki śladu węzłów bez impedancji do odniesienia — te same śmieci algebry
    # liniowej co w wierszu: zerowane bez wykazu (wiersz niesie powód i wykaz pól).
    if wezly_bez_odniesienia:
        trace_steps = [
            (
                _zeruj_liczby_wyniku(krok, _wykaz=False)[0]
                if krok.get("target_id") in wezly_bez_odniesienia
                else krok
            )
            for krok in trace_steps
        ]
    trace_steps, _niefinitowe_w_sladzie = _niefinitowe_na_none(trace_steps)
    wiersze_niefizyczne = sorted(
        str(row.get("fault_node_id"))
        for row in rows
        if OGRANICZENIE_WYNIK_NIEFIZYCZNY in (row.get("reporting_limitations") or [])
    )

    run.raw_result = {
        "analysis_type": _result_analysis_type_for_fault(short_circuit_type),
        "short_circuit_type": short_circuit_type.value,
        "reporting_status": "reportable",
        "reporting_status_pl": "raportowalny",
        "proof_status": "complete",
        "proof_status_pl": "pelny",
        "proof_engine_version": "white_box_trace_v1",
        "method_basis": "IEC_60909",
        "requires_z0": _short_circuit_requires_z0(short_circuit_type),
        "z0_source": (
            "ENM_COMMITTED" if _short_circuit_requires_z0(short_circuit_type) else "NOT_APPLICABLE"
        ),
        "reporting_limitations": ([OGRANICZENIE_WYNIK_NIEFIZYCZNY] if wiersze_niefizyczne else []),
        **({"non_reportable_fault_node_ids": wiersze_niefizyczne} if wiersze_niefizyczne else {}),
        "case_id": run.case_id,
        "enm_hash": run.snapshot_hash,
        # Karta P0.3b: metadane bindingu c/scenariusz na poziomie biegu (addytywne,
        # ten sam kształt co `global_results` wzbogacony przez
        # application/result_mapping/sc_binding_meta.py dla ścieżki execution engine).
        "scenario": scenario_c,
        "c_factor_override": c_factor_override,
        **(
            {"temperature_correction_notes": list(temperature_correction_notes)}
            if temperature_correction_notes
            else {}
        ),
        "results": rows,
        "graph": {
            "nodes": {
                node_id: {
                    "name": node.name,
                    "voltage_level": node.voltage_level,
                    "node_type": node.node_type.value,
                    **graph_nodes.get(node_id, {}),
                }
                for node_id, node in sorted(graph.nodes.items())
            },
            "branches": {
                branch_id: {
                    "name": branch.name,
                    "from_node_id": branch.from_node_id,
                    "to_node_id": branch.to_node_id,
                    **graph_branches.get(branch_id, {}),
                }
                for branch_id, branch in sorted(graph.branches.items())
            },
        },
    }
    run.white_box_trace = trace_steps
    run.power_flow_trace = None


def _solve_power_flow_with_method(
    pf_input: PowerFlowInput,
    options: PowerFlowOptions,
    run_options: dict[str, Any],
    solver_method: str,
) -> PowerFlowNewtonSolution:
    if solver_method == "newton-raphson":
        return PowerFlowNewtonSolver().solve(pf_input)
    if solver_method == "gauss-seidel":
        gs_options = GaussSeidelOptions(
            tolerance=options.tolerance,
            max_iter=options.max_iter,
            damping=options.damping,
            flat_start=options.flat_start,
            validate=options.validate,
            trace_level=options.trace_level,
            acceleration_factor=float(
                run_options.get("acceleration_factor")
                or run_options.get("gs_acceleration_factor")
                or 1.0
            ),
            allow_fallback=False,
        )
        return PowerFlowGaussSeidelSolver().solve(pf_input, gs_options)
    if solver_method == "fast-decoupled":
        fd_method = str(
            run_options.get("fd_method") or run_options.get("fast_decoupled_method") or "XB"
        ).upper()
        if fd_method not in {"XB", "BX"}:
            raise ValueError(f"Nieznany wariant fast-decoupled: {fd_method}")
        fd_options = FastDecoupledOptions(
            tolerance=options.tolerance,
            max_iter=options.max_iter,
            damping=options.damping,
            flat_start=options.flat_start,
            validate=options.validate,
            trace_level=options.trace_level,
            method=fd_method,  # type: ignore[arg-type]
            rebuild_matrices_every=int(run_options.get("rebuild_matrices_every") or 0),
            angle_damping=float(run_options.get("angle_damping") or 1.0),
            voltage_damping=float(run_options.get("voltage_damping") or 1.0),
        )
        return PowerFlowFastDecoupledSolver().solve(pf_input, fd_options)
    raise ValueError(f"Nieznany tryb rozpływu mocy: {solver_method}")


def _first_oltc_branch_id(pf_input: PowerFlowInput) -> str | None:
    """First transformer with a tap changer (stable order by branch id)."""
    from network_model.core.branch import TransformerBranch

    graph = pf_input.typed_graph()
    ids = sorted(
        b.id
        for b in graph.branches.values()
        if isinstance(b, TransformerBranch) and b.tap_changer is not None
    )
    return ids[0] if ids else None


def _run_oltc_study(
    study: str,
    pf_input: PowerFlowInput,
    solve_once: Callable[[PowerFlowInput], PowerFlowNewtonSolution],
    run_options: dict[str, Any],
) -> tuple[str, dict[str, Any]] | None:
    """Dispatch an opt-in OLTC study (V12K-046) on the current pf_input.

    Returns ``(raw_result_key, payload_dict)`` or None when not applicable.
    """
    from network_model.solvers.power_flow_oltc_studies import (
        ProfilePoint,
        optimize_tap_positions,
        run_annual_oltc_profile,
        sweep_tap_positions,
    )

    branch_id = run_options.get("oltc_branch_id") or _first_oltc_branch_id(pf_input)

    if study == "annual_profile":
        raw_profile = run_options.get("oltc_load_profile") or []
        profile = [
            ProfilePoint(
                label=str(p.get("label", f"t{i}")),
                load_scale=float(p.get("load_scale", 1.0)),
            )
            for i, p in enumerate(raw_profile)
        ]
        if not profile:
            return None
        result = run_annual_oltc_profile(pf_input, solve_once, profile)
        return ("oltc_annual_profile", result.to_dict())

    if branch_id is None:
        return None

    if study == "sweep":
        positions = run_options.get("oltc_sweep_positions")
        result = sweep_tap_positions(
            pf_input,
            solve_once,
            branch_id=branch_id,
            positions=positions,
        )
        return ("oltc_sweep", result.to_dict())

    if study == "optimize":
        result = optimize_tap_positions(
            pf_input,
            solve_once,
            branch_id=branch_id,
            objective=str(run_options.get("oltc_objective", "minimize_losses")),
            target_kv=run_options.get("oltc_target_kv"),
            switch_penalty_mw_per_step=float(run_options.get("oltc_switch_penalty_mw", 0.0)),
        )
        return ("oltc_optimization", result.to_dict())

    return None


def _execute_power_flow(
    run: CanonicalRun,
    graph: NetworkGraph | None = None,
    uow_factory: Callable[[], Any] | None = None,
) -> None:
    """Wykonaj rozpływ mocy dla przebiegu.

    Args:
        run: przebieg z migawką ENM.
        graph: opcjonalny GOTOWY graf ZBUDOWANY Z TEJ SAMEJ MIGAWKI (``run.snapshot``).
            ``map_enm_to_network_graph`` jest funkcją migawki, więc podanie grafu
            zbudowanego wcześniej to wyłącznie oszczędzenie POWTÓRNEJ budowy tego
            samego obiektu, a nie podmiana wejścia — wynik jest ten sam co do bitu.
            Wywołujący ODDAJE graf na własność: rozpływ może go zmodyfikować
            (pętla regulatora zaczepowego przestawia pozycje zaczepów), więc grafu
            NIE wolno po tym wywołaniu czytać jako „stanu sprzed rozpływu".
            ``None`` = zbuduj graf z migawki (ścieżka kanoniczna).
        uow_factory: fabryka ``UnitOfWork`` wołającego — potrzebna WYŁĄCZNIE, gdy
            opcje biegu wskazują konfigurację audytu 2 stacji (patrz
            ``rozszerzenia_audit2_dla_opcji``).
    """
    wejscie = zloz_wejscie_rozplywu(
        run.snapshot or {},
        run.options,
        graph=graph,
        rozszerzenia_audit2=rozszerzenia_audit2_dla_opcji(run.options, uow_factory),
    )
    graph = wejscie.graph
    graph_nodes = wejscie.graph_nodes
    graph_branches = wejscie.graph_branches
    base_mva = wejscie.base_mva
    slack_node_id = wejscie.slack_node_id
    options = wejscie.options
    pf_input = wejscie.pf_input
    requested_solver_method = wejscie.requested_solver_method

    # V12K-045 (OLTC F2): wrap the single-shot solve with the automatic OLTC
    # control loop. Networks without automatic OLTC regulators solve exactly
    # once (oltc_trace is None) — determinism preserved.
    def _solve_once(pfi: PowerFlowInput) -> PowerFlowNewtonSolution:
        return _solve_power_flow_with_method(
            pfi,
            options,
            run.options,
            requested_solver_method,
        )

    solution, oltc_trace = solve_with_oltc(pf_input, _solve_once)
    solver_method = str(getattr(solution, "solver_method", requested_solver_method))
    proof_ref = _power_flow_proof_ref(run=run, solver_method=solver_method)
    reporting_status = "reportable" if solution.converged else "not_reportable"
    proof_status = "complete" if solution.converged else "partial"

    # WHITE BOX (K3, następstwo F9.8): PQSpec niesie konwencję OBCIĄŻENIOWĄ
    # (p_mw > 0 = pobór — jedyny punkt konwersji gen→load powyżej), a kontrakt
    # FROZEN ``BusResult.p_injected_mw`` to INJEKCJA (ujemna = pobór,
    # ``power_flow_result.py:35``) — jak moc slacka niżej. Stąd negacja przy
    # montażu wyniku; bez niej szyny PQ miałyby znak odwrotny do slacka i do
    # udokumentowanego kontraktu (defekt ujawniony rekalibracją K3).
    # Defect D1 (audit 2026-08-01): na szynie z modelem ZIP (albo z regulacją
    # falownika) moc ZADANA w PQSpec to dopiero ŻĄDANIE — solver wstrzykuje moc
    # PO wielomianie napięciowym. Tabela wyników musi pokazać moc FAKTYCZNIE
    # wstrzykniętą (inaczej bilans węzłowy się nie domyka: było -3,0000 MW przy
    # rzeczywistym -2,3408 MW = przepływ gałęzi). Wartość bierzemy WPROST ze
    # solvera (ZERO fizyki w tej warstwie); dla szyny stałomocowej jest ona
    # bitowo równa dotychczasowemu -p_mw/base_mva, więc wyniki bez ZIP/regulacji
    # są nietknięte. Szyny spoza wyspy slacka solver pomija — zostaje żądanie.
    node_p_injected_pu = {node.node_id: 0.0 for node in pf_input.pq}
    node_q_injected_pu = {node.node_id: 0.0 for node in pf_input.pq}
    solver_p_effective = solution.node_p_spec_effective_pu
    solver_q_effective = solution.node_q_spec_effective_pu
    for pq in pf_input.pq:
        node_p_injected_pu[pq.node_id] = solver_p_effective.get(pq.node_id, -pq.p_mw / base_mva)
        node_q_injected_pu[pq.node_id] = solver_q_effective.get(pq.node_id, -pq.q_mvar / base_mva)
    # DŁUG W2-D1 (V12K-318): szyna o regulowanym napięciu też wstrzykuje moc — jej
    # moc bierna jest WYNIKIEM zbieżności (to ona trzyma zadany moduł napięcia).
    # Solver publikuje ją od karty X1 w tych samych słownikach; bez tej pętli
    # raport podawał dla szyny PV 0,000000 Mvar. Zapas (`p_mw` z zadania) chroni
    # szyny spoza wyspy slacka — solver ich nie liczy. `PVSpec.p_mw` jest w tej
    # samej konwencji OBCIĄŻENIOWEJ co `PQSpec.p_mw` (`build_power_spec_v2`
    # neguje oba), więc zapas negujemy tak samo.
    for pv in pf_input.pv:
        node_p_injected_pu[pv.node_id] = solver_p_effective.get(pv.node_id, -pv.p_mw / base_mva)
        node_q_injected_pu[pv.node_id] = solver_q_effective.get(pv.node_id, 0.0)
    node_p_injected_pu[pf_input.slack.node_id] = float(solution.slack_power.real)
    node_q_injected_pu[pf_input.slack.node_id] = float(solution.slack_power.imag)

    result_v1 = build_power_flow_result_v1(
        converged=solution.converged,
        iterations_count=solution.iterations,
        tolerance_used=options.tolerance,
        base_mva=base_mva,
        slack_bus_id=pf_input.slack.node_id,
        node_u_mag=solution.node_u_mag,
        node_angle=solution.node_angle,
        node_p_injected_pu=node_p_injected_pu,
        node_q_injected_pu=node_q_injected_pu,
        branch_s_from_mva=solution.branch_s_from_mva,
        branch_s_to_mva=solution.branch_s_to_mva,
        losses_total=solution.losses_total,
        slack_power_pu=solution.slack_power,
        unsolved_node_ids=tuple(solution.not_solved_nodes),
    )

    nierozwiazane = set(solution.not_solved_nodes)
    node_voltage_kv_finite, niefinitowe_u = _niefinitowe_na_none(
        {
            node_id: (None if node_id in nierozwiazane else value)
            for node_id, value in solution.node_voltage_kv.items()
        },
        "$.node_voltage_kv",
    )
    branch_current_ka_finite, niefinitowe_i = _niefinitowe_na_none(
        dict(solution.branch_current_ka), "$.branch_current_ka"
    )
    pola_niefinitowe = sorted(niefinitowe_u + niefinitowe_i)

    run.raw_result = {
        "analysis_type": "load_flow",
        "solver_method": solver_method,
        "solver_version": f"load-flow-{solver_method}-v1",
        "proof_ref": proof_ref,
        "proof_status": proof_status,
        "proof_status_pl": "pelny" if proof_status == "complete" else "czesciowy",
        "reporting_status": reporting_status,
        "reporting_status_pl": (
            "raportowalny" if reporting_status == "reportable" else "nieraportowalny"
        ),
        # K30-14 NO-GO #10: quality_status reflects coverage too. Solver
        # converged ALE not_solved_nodes non-empty → 'partial' (nie kłamiemy
        # userowi że accepted gdy ~20% nodes nie ma policzonych wartości).
        "quality_status": (
            "accepted"
            if (solution.converged and not solution.not_solved_nodes)
            else ("partial" if solution.converged else "failed")
        ),
        "applicability_status": "applicable",
        "dopuszczalnosc_raportowa": solution.converged and not solution.not_solved_nodes,
        "reporting_limitations": (
            []
            if (solution.converged and not solution.not_solved_nodes)
            else (
                ["unsolved_nodes_outside_slack_island"]
                if solution.converged
                else ["solver_non_convergence"]
            )
        ),
        "result_v1": result_v1.to_dict(),
        # V12K-320: przelaczenia PV->PQ przy nasyceniu granic Q sa czescia
        # WYNIKU, nie ciekawostka sladu — szyna, ktora utracila regulacje
        # napiecia, pracuje na granicy mocy biernej i projektant ma to widziec
        # bez zagladania w iteracje. Addytywnie (dict), lista z solvera w
        # porzadku wykrycia (deterministyczna — iteracje sa deterministyczne).
        "pv_to_pq_switches": solution.pv_to_pq_switches,
        # Polityka §35: węzły spoza wyspy slacka (``unsolved_node_ids``) nie mają
        # napięcia — solver oddaje NaN, kontrakt wyjściowy niesie ``None`` (jawny
        # brak, nie liczba). Każda INNA wartość niefinitowa jest wypisana w
        # ``non_finite_fields`` (predykaty parami: NaN ⇔ węzeł nierozwiązany;
        # rozjazd ma być widoczny, nie cicho wygładzony).
        "node_voltage_kv": node_voltage_kv_finite,
        "branch_current_ka": branch_current_ka_finite,
        **({"non_finite_fields": pola_niefinitowe} if pola_niefinitowe else {}),
        "graph": {
            "nodes": {
                node_id: {
                    "name": node.name,
                    "voltage_level": node.voltage_level,
                    "node_type": node.node_type.value,
                    **graph_nodes.get(node_id, {}),
                }
                for node_id, node in sorted(graph.nodes.items())
            },
            "branches": {
                branch_id: {
                    "name": branch.name,
                    "from_node_id": branch.from_node_id,
                    "to_node_id": branch.to_node_id,
                    "rated_current_a": getattr(branch, "rated_current_a", None),
                    **graph_branches.get(branch_id, {}),
                }
                for branch_id, branch in sorted(graph.branches.items())
            },
        },
    }
    # Karta CV-4.2: ślad zastosowanych korekt audit2 (tap/droop/impedancja
    # transformatora blokowego) — additive, tylko gdy audit2 było żądane
    # (`options.audit2_project_id`/`audit2_station_id`); żadna sieć rejestru
    # golden PF ich nie używa, więc parytet `parytet_assemblera` jest bit w
    # bit nietknięty dla wszystkich istniejących wpisów.
    if wejscie.audit2_applied is not None:
        run.raw_result["audit2_applied"] = wejscie.audit2_applied

    # V12K-045 (OLTC F2): surface the regulator decision trace only when the
    # OLTC control loop actually ran (additive — non-OLTC runs unchanged).
    if oltc_trace is not None:
        run.raw_result["oltc_control"] = oltc_trace

    # V12K-046 (OLTC G1/G2/G3): opt-in OLTC studies computed on the same pf_input
    # (reuse — no duplicated input builder). Additive: only when requested via
    # run.options["oltc_study"]; the engines restore the tap state they mutate.
    oltc_study = run.options.get("oltc_study")
    if oltc_study:
        study_result = _run_oltc_study(oltc_study, pf_input, _solve_once, run.options)
        if study_result is not None:
            run.raw_result[study_result[0]] = study_result[1]

    run.white_box_trace = _build_power_flow_trace_steps(solution)
    run.power_flow_trace = {
        "solver_version": f"load-flow-{solver_method}-v1",
        "solver_method": solver_method,
        "proof_ref": proof_ref,
        "proof_status": proof_status,
        "reporting_status": reporting_status,
        "input_hash": run.input_hash,
        "snapshot_id": run.snapshot_hash,
        "case_id": run.case_id,
        "run_id": str(run.id),
        "init_state": solution.init_state or {},
        "init_method": "flat_start",
        "tolerance": options.tolerance,
        "max_iterations": options.max_iter,
        "base_mva": base_mva,
        "slack_bus_id": slack_node_id,
        "pq_bus_ids": [spec.node_id for spec in pf_input.pq],
        # Karta CV-4.1b (A3-04): dawniej ZAWSZE pusta lista (konstytucja A3-04:
        # "pv_bus_ids=[] zawsze" — generator z regulacją napięcia liczony jak PQ).
        # `pf_input.pv` jest teraz wypełniane przez assembler dla generatorów w
        # trybie regulacji napięcia (`enm/mapping.py` -> `NodeType.PV`).
        "pv_bus_ids": [spec.node_id for spec in pf_input.pv],
        "ybus_trace": solution.ybus_trace,
        "iterations": [
            {
                "k": int(step.get("iter", index + 1)),
                "norm_mismatch": float(step.get("mismatch_norm", step.get("max_mismatch_pu", 0.0))),
                "max_mismatch_pu": float(step.get("max_mismatch_pu", 0.0)),
                "cause_if_failed": step.get("cause_if_failed_optional"),
            }
            for index, step in enumerate(solution.nr_trace)
        ],
        "converged": solution.converged,
        "final_iterations_count": solution.iterations,
        "catalog_context": _build_snapshot_catalog_context(run.snapshot or {}),
    }
    if oltc_trace is not None:
        run.power_flow_trace["oltc_control"] = oltc_trace


def _build_power_flow_trace_steps(
    solution: PowerFlowNewtonSolution,
) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    solver_method = str(getattr(solution, "solver_method", "newton-raphson"))
    title_by_method = {
        "newton-raphson": "Newtona-Raphsona",
        "gauss-seidel": "Gaussa-Seidla",
        "fast-decoupled": "fast-decoupled",
    }
    phase_by_method = {
        "newton-raphson": "newton_raphson",
        "gauss-seidel": "gauss_seidel",
        "fast-decoupled": "fast_decoupled",
    }
    title_method = title_by_method.get(solver_method, solver_method)
    phase = phase_by_method.get(solver_method, solver_method.replace("-", "_"))
    if solution.init_state:
        steps.append(
            {
                "step": 1,
                "title": "Stan poczatkowy",
                "phase": "init",
                "result": solution.init_state,
            }
        )
    for index, iteration in enumerate(solution.nr_trace, start=len(steps) + 1):
        steps.append(
            {
                "step": index,
                "title": f"Iteracja {title_method} {iteration.get('iter', index)}",
                "phase": phase,
                "inputs": {
                    "max_mismatch_pu": {
                        "value": float(iteration.get("max_mismatch_pu", 0.0)),
                        "unit": "pu",
                    },
                },
                "result": {
                    "norm_mismatch": {
                        "value": float(
                            iteration.get("mismatch_norm", iteration.get("max_mismatch_pu", 0.0))
                        ),
                        "unit": "pu",
                    },
                },
                "notes": iteration.get("cause_if_failed_optional"),
            }
        )
    steps.append(
        {
            "step": len(steps) + 1,
            "title": "Wynik koncowy",
            "phase": "final",
            "result": {
                "converged": {"value": solution.converged},
                "iterations": {"value": solution.iterations},
                "max_mismatch_pu": {"value": float(solution.max_mismatch), "unit": "pu"},
            },
        }
    )
    return steps


def build_results_index(run: CanonicalRun) -> dict[str, Any]:
    raw_result = run.raw_result or {}
    tables: list[dict[str, Any]] = []
    if run.analysis_type == "PF":
        result_v1 = raw_result.get("result_v1", {})
        tables.extend(
            [
                {
                    "table_id": "buses",
                    "label_pl": "Szyny",
                    "row_count": len(result_v1.get("bus_results", [])),
                    "columns": [
                        {"key": "name", "label_pl": "Nazwa"},
                        {"key": "bus_id", "label_pl": "ID wezla"},
                        {"key": "un_kv", "label_pl": "Un", "unit": "kV"},
                        {"key": "u_kv", "label_pl": "U", "unit": "kV"},
                        {"key": "u_pu", "label_pl": "U", "unit": "pu"},
                        {"key": "angle_deg", "label_pl": "Kat", "unit": "deg"},
                    ],
                },
                {
                    "table_id": "branches",
                    "label_pl": "Galezie",
                    "row_count": len(result_v1.get("branch_results", [])),
                    "columns": [
                        {"key": "name", "label_pl": "Nazwa"},
                        {"key": "from_bus", "label_pl": "Od"},
                        {"key": "to_bus", "label_pl": "Do"},
                        {"key": "i_a", "label_pl": "I", "unit": "A"},
                        {"key": "p_mw", "label_pl": "P", "unit": "MW"},
                        {"key": "q_mvar", "label_pl": "Q", "unit": "MVAr"},
                        {"key": "s_mva", "label_pl": "S", "unit": "MVA"},
                        {"key": "loading_pct", "label_pl": "Obciazenie", "unit": "%"},
                    ],
                },
            ]
        )
    if run.analysis_type == "short_circuit_sn":
        tables.append(
            {
                "table_id": "short_circuit",
                "label_pl": "Zwarcia",
                "row_count": len(raw_result.get("results", [])),
                "columns": [
                    {"key": "target_id", "label_pl": "Cel"},
                    {"key": "fault_type", "label_pl": "Typ zwarcia"},
                    {"key": "ikss_ka", "label_pl": "Ik''", "unit": "kA"},
                    {"key": "ip_ka", "label_pl": "ip", "unit": "kA"},
                    {"key": "ith_ka", "label_pl": "Ith", "unit": "kA"},
                    {"key": "ib_ka", "label_pl": "Ib", "unit": "kA"},
                    {"key": "ik_ka", "label_pl": "Ik", "unit": "kA"},
                    {"key": "sk_mva", "label_pl": "Sk''", "unit": "MVA"},
                    {"key": "rk_ohm", "label_pl": "Rk", "unit": "ohm"},
                    {"key": "xk_ohm", "label_pl": "Xk", "unit": "ohm"},
                    {"key": "zk_ohm", "label_pl": "|Zk|", "unit": "ohm"},
                    {"key": "xr_ratio", "label_pl": "X/R"},
                    {"key": "kappa", "label_pl": "kappa"},
                    {"key": "c_factor", "label_pl": "c"},
                    {"key": "un_kv", "label_pl": "Un", "unit": "kV"},
                    {"key": "tk_s", "label_pl": "tk", "unit": "s"},
                    {"key": "i2t_ka2s", "label_pl": "I2t", "unit": "kA2s"},
                    {"key": "reporting_status", "label_pl": "Status raportowy"},
                    {"key": "proof_status", "label_pl": "Status uzasadnienia"},
                    {"key": "proof_ref", "label_pl": "Identyfikator uzasadnienia"},
                ],
            }
        )
    if run.analysis_type == "phase_state_sn":
        tables.append(
            {
                "table_id": "phase_state",
                "label_pl": "Stan fazowy SN",
                "row_count": 1 if raw_result.get("result") else 0,
                "columns": [
                    {"key": "target_name", "label_pl": "Cel"},
                    {"key": "ua_kv", "label_pl": "UA", "unit": "kV"},
                    {"key": "ub_kv", "label_pl": "UB", "unit": "kV"},
                    {"key": "uc_kv", "label_pl": "UC", "unit": "kV"},
                    {"key": "ia_a", "label_pl": "IA", "unit": "A"},
                    {"key": "ib_a", "label_pl": "IB", "unit": "A"},
                    {"key": "ic_a", "label_pl": "IC", "unit": "A"},
                    {"key": "voltage_unbalance_percent", "label_pl": "Asymetria U", "unit": "%"},
                    {"key": "current_unbalance_percent", "label_pl": "Asymetria I", "unit": "%"},
                    {"key": "proof_status", "label_pl": "Status uzasadnienia"},
                ],
            }
        )
    if run.analysis_type == "dynamic_stability":
        tables.extend(
            [
                {
                    "table_id": "dynamic_stability",
                    "label_pl": "Stabilnosc dynamiczna",
                    "row_count": 1 if raw_result.get("result") else 0,
                    "columns": [
                        {"key": "source_id", "label_pl": "Zrodlo"},
                        {"key": "faulted_element_id", "label_pl": "Element zaklocenia"},
                        {"key": "status", "label_pl": "Status"},
                        {"key": "clearing_time_ms", "label_pl": "Czas wylaczenia", "unit": "ms"},
                        {"key": "clearing_margin_ms", "label_pl": "Margines", "unit": "ms"},
                        {"key": "angle_swing_deg", "label_pl": "Wychylenie kata", "unit": "deg"},
                        {
                            "key": "post_fault_voltage_pu",
                            "label_pl": "Napiecie po zakloceniu",
                            "unit": "pu",
                        },
                        {"key": "stability_index", "label_pl": "Wskaznik stabilnosci"},
                    ],
                },
                {
                    "table_id": "automation_trace",
                    "label_pl": "Slad automatyki",
                    "row_count": len(
                        (raw_result.get("automation_trace") or {}).get("events") or []
                    ),
                    "columns": [
                        {"key": "event_seq", "label_pl": "Lp."},
                        {"key": "event_type", "label_pl": "Typ zdarzenia"},
                        {"key": "element_id", "label_pl": "Element"},
                        {"key": "detail", "label_pl": "Opis"},
                    ],
                },
            ]
        )
    if run.analysis_type == "source_compliance":
        tables.append(
            {
                "table_id": "source_compliance",
                "label_pl": "Zgodnosc zrodla",
                "row_count": 1 if raw_result.get("result") else 0,
                "columns": [
                    {"key": "source_ref", "label_pl": "Zrodlo"},
                    {"key": "source_type", "label_pl": "Typ"},
                    {"key": "verdict", "label_pl": "Werdykt"},
                    {"key": "reporting_status", "label_pl": "Status raportowy"},
                    {"key": "proof_status", "label_pl": "Status uzasadnienia"},
                    {"key": "limitations", "label_pl": "Ograniczenia"},
                ],
            }
        )
    tables.append(
        {
            "table_id": "trace",
            "label_pl": "Slad obliczen",
            "row_count": len(run.white_box_trace),
            "columns": [{"key": "title", "label_pl": "Opis"}],
        }
    )
    return {
        "run_header": {
            "run_id": str(run.id),
            "project_id": run.project_id or run.case_id,
            "case_id": run.case_id,
            "snapshot_id": run.snapshot_hash,
            "created_at": run.created_at.isoformat(),
            "status": run.status,
            "result_state": run.result_status,
            "solver_kind": run.solver_kind,
            "input_hash": run.input_hash,
        },
        "tables": tables,
    }


def build_bus_results(run: CanonicalRun) -> dict[str, Any]:
    if run.analysis_type != "PF":
        return {"run_id": str(run.id), "rows": []}
    raw_result = run.raw_result or {}
    result_v1 = raw_result.get("result_v1", {})
    graph_nodes = (raw_result.get("graph") or {}).get("nodes", {})
    node_voltage_kv = raw_result.get("node_voltage_kv", {})
    rows = []
    for item in result_v1.get("bus_results", []):
        bus_id = item["bus_id"]
        node = graph_nodes.get(bus_id, {})
        flags: list[str] = []
        if node.get("node_type") == "SLACK":
            flags.append("SLACK")
        rows.append(
            {
                "element_id": node.get("element_id") or bus_id,
                "bus_id": bus_id,
                "name": node.get("name", bus_id),
                "un_kv": node.get("voltage_level"),
                "u_kv": node_voltage_kv.get(bus_id),
                "u_pu": item.get("v_pu"),
                "angle_deg": item.get("angle_deg"),
                "synthetic": node.get("synthetic"),
                "graph_role": node.get("graph_role"),
                "flags": flags,
            }
        )
    rows.sort(key=lambda row: (row["name"], row["bus_id"]))
    return {"run_id": str(run.id), "rows": rows}


def build_branch_results(run: CanonicalRun) -> dict[str, Any]:
    if run.analysis_type != "PF":
        return {"run_id": str(run.id), "rows": []}
    raw_result = run.raw_result or {}
    result_v1 = raw_result.get("result_v1", {})
    graph_branches = (raw_result.get("graph") or {}).get("branches", {})
    branch_current_ka = raw_result.get("branch_current_ka", {})
    node_voltage_kv = raw_result.get("node_voltage_kv", {})
    # LF-KONTRAKT (V12K-161): mapa napięć węzłów w p.u. (z FROZEN
    # ``result_v1.bus_results``) — potrzebna do deterministycznej pochodnej ΔU%
    # (różnica potencjałów końców gałęzi), analogicznie jak ``loading_pct``
    # korzysta z prądu i obciążalności. Zero nowej fizyki: solver już policzył
    # napięcia węzłów, tu WYŁĄCZNIE ich różnica.
    node_u_pu = {
        b["bus_id"]: b.get("v_pu")
        for b in result_v1.get("bus_results", [])
        if b.get("bus_id") is not None
    }
    rows = []
    for item in result_v1.get("branch_results", []):
        branch_id = item["branch_id"]
        branch = graph_branches.get(branch_id, {})
        i_ka = branch_current_ka.get(branch_id)
        i_a = i_ka * 1000.0 if i_ka is not None else None
        p_from = item.get("p_from_mw", 0.0)
        q_from = item.get("q_from_mvar", 0.0)
        s_mva = math.sqrt(p_from**2 + q_from**2)
        rated_current_a = branch.get("rated_current_a")
        loading_pct = (
            (i_a / rated_current_a * 100.0) if i_a is not None and rated_current_a else None
        )
        # LF-KONTRAKT (V12K-161): współczynnik mocy gałęzi — pochodna |P|/|S|
        # (wzorzec loading_pct). Bez znaku (cosφ jako moduł); gałąź jałowa
        # (S=0) ⇒ None (uczciwy brak, nie 0/0).
        cos_phi = (abs(p_from) / s_mva) if s_mva > 0.0 else None
        # LF-KONTRAKT (V12K-161): spadek napięcia ΔU na gałęzi (linia/kabel) —
        # różnica potencjałów końców z wyniku solvera. Wartość [kV] =
        # |U_from|−|U_to|; procent = (u_from−u_to)·100 [% U_n] (różnica w p.u.
        # jest już znormalizowana do napięcia znamionowego). Brak któregoś
        # napięcia ⇒ None (uczciwy brak).
        from_node = branch.get("from_node_id", "")
        to_node = branch.get("to_node_id", "")
        u_from_kv = node_voltage_kv.get(from_node)
        u_to_kv = node_voltage_kv.get(to_node)
        delta_u_kv = (
            (u_from_kv - u_to_kv) if (u_from_kv is not None and u_to_kv is not None) else None
        )
        u_from_pu = node_u_pu.get(from_node)
        u_to_pu = node_u_pu.get(to_node)
        delta_u_pct = (
            ((u_from_pu - u_to_pu) * 100.0)
            if (u_from_pu is not None and u_to_pu is not None)
            else None
        )
        flags: list[str] = []
        if loading_pct is not None and loading_pct > 100.0:
            flags.append("OVERLOADED")
        rows.append(
            {
                "element_id": branch.get("element_id") or branch_id,
                "branch_id": branch_id,
                "name": branch.get("name", branch_id),
                "from_bus": branch.get("from_node_id", ""),
                "to_bus": branch.get("to_node_id", ""),
                "i_a": i_a,
                "s_mva": s_mva,
                "p_mw": item.get("p_from_mw"),
                "q_mvar": item.get("q_from_mvar"),
                "loading_pct": loading_pct,
                # LF-KONTRAKT (V12K-161): pass-through składowych strat/końca „to"
                # WPROST z FROZEN ``PowerFlowBranchResult`` (już policzone przez
                # solver, tu bez zmian) + pochodne cosφ/ΔU. Straty transformatora
                # (LOSSES_P_MW) domknięte — dotąd branch_row ich nie niósł.
                "p_to_mw": item.get("p_to_mw"),
                "q_to_mvar": item.get("q_to_mvar"),
                "losses_p_mw": item.get("losses_p_mw"),
                "losses_q_mvar": item.get("losses_q_mvar"),
                "cos_phi": cos_phi,
                "delta_u_kv": delta_u_kv,
                "delta_u_pct": delta_u_pct,
                "synthetic": branch.get("synthetic"),
                "graph_role": branch.get("graph_role"),
                "flags": flags,
            }
        )
    rows.sort(key=lambda row: (row["name"], row["branch_id"]))
    return {"run_id": str(run.id), "rows": rows}


def _sc_pelny_bilans(item: dict[str, Any]) -> dict[str, Any]:
    """Pelny bilans IEC 60909 punktu zwarcia (program ZWARCIA-PRO F1, addytywnie).

    Wszystkie wielkosci pochodza z FROZEN solvera (ShortCircuitResult.to_dict);
    tutaj WYLACZNIE deterministyczne projekcje jednostek i wielkosci pochodnych
    zdefiniowanych norma (klasa przeksztalcen jak A->kA, zero fizyki):
    - |Zk| = sqrt(Rk^2 + Xk^2) — modul impedancji Thevenina policzonej przez solver,
    - X/R = 1/(R/X) — odwrotnosc stosunku z solvera (kappa liczy solver),
    - I2t = Ith^2 * tk — definicja pradu zastepczego cieplnego (IEC 60909-0 par. 12).
    Starsze wyniki bez pol -> None (uczciwe braki, kontrakt addytywny).
    """
    zkk = item.get("zkk_ohm") or {}
    rk = zkk.get("re")
    xk = zkk.get("im")
    zk = math.hypot(rk, xk) if rk is not None and xk is not None else None
    rx = item.get("rx_ratio")
    xr = (1.0 / rx) if rx else None
    ith_a = item.get("ith_a")
    tk_s = item.get("tk_s")
    i2t_ka2s = ((ith_a / 1000.0) ** 2 * tk_s) if ith_a is not None and tk_s is not None else None
    un_v = item.get("un_v")
    return {
        "rk_ohm": rk,
        "xk_ohm": xk,
        "zk_ohm": zk,
        "rx_ratio": rx,
        "xr_ratio": xr,
        "kappa": item.get("kappa"),
        "c_factor": item.get("c_factor"),
        "un_kv": (un_v / 1000.0) if un_v is not None else None,
        "tk_s": tk_s,
        "tb_s": item.get("tb_s"),
        "ib_ka": _amps_to_ka(item.get("ib_a")),
        "ik_ka": _amps_to_ka(item.get("ik_total_a")),
        "ik_thevenin_ka": _amps_to_ka(item.get("ik_thevenin_a")),
        "ik_inverters_ka": _amps_to_ka(item.get("ik_inverters_a")),
        "i2t_ka2s": i2t_ka2s,
        # Delta FROZEN V12K-128 (addytywnie): składowe symetryczne impedancji
        # zastępczej WPROST z solvera (`ShortCircuitResult.to_dict` → z1/z2/z0_ohm
        # jako complex {re, im}). Z1/Z2 dla wszystkich typów, Z0 tylko dla zwarć
        # doziemnych (1F/2F+G). Zero fizyki — czysta projekcja pass-through.
        # Starsze wyniki bez pól → None (uczciwy brak, kontrakt addytywny).
        "z1_ohm": item.get("z1_ohm"),
        "z2_ohm": item.get("z2_ohm"),
        "z0_ohm": item.get("z0_ohm"),
    }


def _wpis_grafu(mapa: dict[str, Any], klucz: object) -> dict[str, Any]:
    """Wpis grafu przebiegu dla identyfikatora (brak albo brak identyfikatora → pusty).

    Zachowanie identyczne jak `mapa.get(klucz, {})` — klucz spoza mapy (w tym
    `None`) daje pusty wpis; jawny warunek zamiast ukrytej zgodności typów.
    """
    return mapa.get(klucz, {}) if isinstance(klucz, str) else {}


def _sc_rozplyw_galeziowy(
    raw: list[dict[str, Any]] | None,
    graph_nodes: dict[str, Any],
    graph_branches: dict[str, Any],
) -> list[dict[str, Any]] | None:
    """Rozpływ prądu zwarciowego w gałęziach (ZWARCIA-PRO F4, karta W-C, addytywnie).

    Przenosi `branch_contributions` FROZEN solvera do wiersza kanonicznego. Od
    V12K-132 (pkt 7 karty właściciela) lista niesie wkłady OBU rodzin źródeł:
    superpozycja falownikowa (`_build_branch_contributions_for_inverters`) ORAZ
    rozpływ prądu od źródła zastępczego (Thevenin / sieć nadrzędna,
    `_build_branch_contributions_for_thevenin`, source_id="THEVENIN_GRID").
    WYŁĄCZNIE projekcje prezentacyjne (A→kA, nazwy z grafu przebiegu) — zero
    fizyki. Kierunek ("from_to"/"to_from") wprost z solvera. Sort deterministyczny
    (branch_id, source_id). Starsze wyniki bez pola → None (uczciwy brak);
    pusta lista = policzono, brak wkładów w żadnej gałęzi (sieć bez źródła
    zastępczego i bez falowników niosących prąd).

    K14: wejściem są SUROWE wpisy solvera podane przez `pobierz_rozplyw_biegu`
    (jedna prawda dostępu: artefakt inline albo osobna tabela rozpływu) — ta
    funkcja odpowiada wyłącznie za projekcję prezentacyjną.
    """
    if raw is None:
        return None
    flows: list[dict[str, Any]] = []
    for entry in raw:
        branch_id = entry.get("branch_id")
        branch = _wpis_grafu(graph_branches, branch_id)
        from_id = entry.get("from_node_id")
        to_id = entry.get("to_node_id")
        flows.append(
            {
                "branch_id": branch_id,
                "branch_name": branch.get("name") or branch_id,
                "source_id": entry.get("source_id"),
                "from_node_id": from_id,
                "from_node_name": _wpis_grafu(graph_nodes, from_id).get("name") or from_id,
                "to_node_id": to_id,
                "to_node_name": _wpis_grafu(graph_nodes, to_id).get("name") or to_id,
                "i_ka": _amps_to_ka(entry.get("i_contrib_a")),
                "direction": entry.get("direction"),
            }
        )
    flows.sort(key=lambda flow: (flow["branch_id"] or "", flow["source_id"] or ""))
    return flows


def _rozplyw_dostepny(item: dict[str, Any]) -> bool:
    """Czy dla tego punktu zwarcia rozpływ ISTNIEJE (niezależnie od miejsca zapisu).

    Dwa równoważne świadectwa: rozpływ inline (świeży bieg / zapis sprzed
    rozdzielenia artefaktu) albo znacznik zapisu rozdzielonego (treść w osobnej
    tabeli). Brak obu = solver policzył bez wkładów — uczciwy brak.
    """
    return item.get(KLUCZ_ROZPLYWU) is not None or bool(item.get(KLUCZ_DOSTEPNOSCI_ROZPLYWU))


def build_short_circuit_results(
    run: CanonicalRun, *, include_rozplyw: bool = False
) -> dict[str, Any]:
    if run.analysis_type != "short_circuit_sn":
        return {"run_id": str(run.id), "rows": []}
    graph_nodes = ((run.raw_result or {}).get("graph") or {}).get("nodes", {})
    graph_branches = ((run.raw_result or {}).get("graph") or {}).get("branches", {})
    rows = []
    for item in (run.raw_result or {}).get("results", []):
        target_id = item.get("fault_node_id")
        node = graph_nodes.get(target_id, {})
        rows.append(
            {
                "target_id": target_id,
                "element_id": node.get("element_id") or target_id,
                "target_name": node.get("name") or node.get("element_id") or target_id,
                "ikss_ka": _amps_to_ka(item.get("ikss_a")),
                "ip_ka": _amps_to_ka(item.get("ip_a")),
                "ith_ka": _amps_to_ka(item.get("ith_a")),
                "sk_mva": item.get("sk_mva"),
                **_sc_pelny_bilans(item),
                # ZWARCIA-PRO F4 (karta W-C): rozpływ prądu zwarciowego w gałęziach
                # (pole addytywne — starsze wyniki bez pola → None).
                # V12K-281 (K13): lista wierszy zbiorczych domyślnie BEZ rozpływu —
                # pełny rozpływ to iloczyn źródło×gałąź per wiersz (zmierzone
                # 104 wiersze × 11 506 wpisów = raport 730 MB). Rozpływ JEDNEGO
                # punktu na żądanie: `build_short_circuit_rozplyw`; dostępność
                # sygnalizuje flaga niżej (odróżnia starszy wynik bez pola).
                "branch_contributions": (
                    _sc_rozplyw_galeziowy(
                        pobierz_rozplyw_biegu(run, target_id), graph_nodes, graph_branches
                    )
                    if include_rozplyw
                    else None
                ),
                "branch_contributions_available": _rozplyw_dostepny(item),
                "fault_type": item.get("short_circuit_type"),
                # GAP passthrough (V12K-128): wymóg/źródło sieci zerowej Z0 przenoszone
                # do wiersza kanonicznego (konsument read-only wie, czy Z0 dotyczy i
                # skąd pochodzi). Starszy wynik bez pól → None (uczciwy brak).
                "requires_z0": item.get("requires_z0"),
                "z0_source": item.get("z0_source"),
                "analysis_type": item.get("analysis_type")
                or (run.raw_result or {}).get("analysis_type"),
                "reporting_status": item.get("reporting_status")
                or (run.raw_result or {}).get("reporting_status"),
                "reporting_status_pl": item.get("reporting_status_pl")
                or (run.raw_result or {}).get("reporting_status_pl"),
                "proof_status": item.get("proof_status")
                or (run.raw_result or {}).get("proof_status"),
                "proof_status_pl": item.get("proof_status_pl")
                or (run.raw_result or {}).get("proof_status_pl"),
                "proof_ref": item.get("proof_ref"),
                "proof_binding": item.get("proof_binding"),
                "dopuszczalnosc_raportowa": item.get("dopuszczalnosc_raportowa", True),
                "reporting_limitations": item.get("reporting_limitations", []),
                "synthetic": node.get("synthetic"),
                "graph_role": node.get("graph_role"),
                "flags": [],
            }
        )
    rows.sort(key=lambda row: row["target_id"] or "")
    return {"run_id": str(run.id), "rows": rows}


def build_short_circuit_rozplyw(run: CanonicalRun, target_id: str) -> dict[str, Any]:
    """Rozpływ prądu zwarciowego JEDNEGO punktu zwarcia na żądanie (V12K-281, K13).

    Lista wierszy zbiorczych (`build_short_circuit_results`) nie niesie już
    rozpływu (iloczyn źródło×gałąź per wiersz dawał raport 730 MB); konsument
    (tabela rozpływu, nakładka na schemacie) pobiera rozpływ WYBRANEGO punktu
    tym budowniczym. Ta sama projekcja prezentacyjna co dotąd
    (`_sc_rozplyw_galeziowy` — A→kA, nazwy z grafu przebiegu, sort
    deterministyczny). `branch_contributions=None` = starszy wynik bez pola
    (uczciwy brak). Nieznany punkt → KeyError (API tłumaczy na 404).

    K14: treść rozpływu bierze `pobierz_rozplyw_biegu` (artefakt inline albo
    osobna tabela) — kontrakt odpowiedzi bez zmian.
    """
    if run.analysis_type != "short_circuit_sn":
        raise KeyError(f"Przebieg nie jest analiza zwarciowa: {run.id}")
    raw_result = run.raw_result or {}
    graph_nodes = (raw_result.get("graph") or {}).get("nodes", {})
    graph_branches = (raw_result.get("graph") or {}).get("branches", {})
    for item in raw_result.get("results", []):
        if item.get("fault_node_id") == target_id:
            return {
                "run_id": str(run.id),
                "target_id": target_id,
                "branch_contributions": _sc_rozplyw_galeziowy(
                    pobierz_rozplyw_biegu(run, target_id), graph_nodes, graph_branches
                ),
                # Ślad WHITE BOX podziału prądu tego punktu (TH-1) — ta sama klasa
                # ładunku co wkłady, więc oddawany w tym samym miejscu na żądanie;
                # kroki solvera bez projekcji. `None` = uczciwy brak (patrz
                # `pobierz_slad_rozplywu_biegu`).
                "branch_flow_trace": pobierz_slad_rozplywu_biegu(run, target_id),
            }
    raise KeyError(f"Brak punktu zwarcia {target_id} w wynikach przebiegu {run.id}")


def wiersze_swiezego_biegu_bez_rozplywu(run: CanonicalRun) -> list[dict[str, Any]]:
    """SUROWE wiersze świeżo policzonego biegu BEZ rozpływu inline + flaga dostępności.

    V12K-284 (dług nazwany): odpowiedź `POST …/runs/short-circuit` niosła PEŁNY
    rozpływ gałęziowy KAŻDEGO punktu zwarcia — iloczyn źródło×gałąź per wiersz
    (zmierzone na sieci 50 stacji: 104 punkty × 11 506 wpisów), choć konsument
    świeżego biegu czyta z wiersza prądy zwarciowe, a rozpływ potrzebuje dla
    JEDNEGO wskazanego punktu.

    TEN SAM wzorzec co V12K-281 dla wierszy kanonicznych: wiersz nie niesie
    rozpływu, niesie FLAGĘ dostępności (`branch_contributions_available`), a treść
    pobiera się na żądanie —
    `GET /api/analysis-runs/{run_id}/results/short-circuit/rozplyw?target_id=…`
    (`build_short_circuit_rozplyw`). Flaga odróżnia „rozpływ istnieje, pobierz go"
    od „solver policzył bez wkładów" (uczciwy brak).

    Rozpływ jest NIETKNIĘTY: solver liczy go jak dotąd, zapis biegu przenosi go
    bajtowo do osobnej tabeli (K14). Zmienia się WYŁĄCZNIE treść odpowiedzi POST.
    Wiersz nie będący słownikiem przechodzi bez zmian (zero zgadywania).

    KLASA, NIE INSTANCJA (2026-09-05): wycinana jest CAŁA klasa `KLUCZE_ROZPLYWU`
    — wkłady ORAZ ich ślad WHITE BOX `branch_flow_trace` (TH-1), który rośnie tak
    samo z liczbą gałęzi i punktów; z samym `branch_contributions` odpowiedź na
    sieci 50 stacji miała 105 MB przy bramce 60 MB (E2E full). Ślad punktu
    oddaje `build_short_circuit_rozplyw` razem z wkładami.
    """
    wiersze: list[dict[str, Any]] = []
    for item in (run.raw_result or {}).get("results", []):
        if not isinstance(item, dict):
            wiersze.append(item)
            continue
        wiersze.append(
            {
                **{
                    klucz: wartosc
                    for klucz, wartosc in item.items()
                    if klucz not in KLUCZE_ROZPLYWU
                },
                KLUCZ_DOSTEPNOSCI_ROZPLYWU: _rozplyw_dostepny(item),
            }
        )
    return wiersze


def build_phase_state_results(run: CanonicalRun) -> dict[str, Any]:
    if run.analysis_type != "phase_state_sn":
        return {"run_id": str(run.id), "rows": []}
    raw_result = run.raw_result or {}
    result = raw_result.get("result") or {}
    if not result:
        return {"run_id": str(run.id), "rows": []}
    target_ref = str(raw_result.get("target_bus_ref") or raw_result.get("target_id") or "")
    rows = [
        {
            "target_id": str(raw_result.get("target_id") or target_ref),
            "element_id": target_ref,
            "target_name": target_ref,
            "ua_kv": result.get("ua_kv"),
            "ub_kv": result.get("ub_kv"),
            "uc_kv": result.get("uc_kv"),
            "ia_a": result.get("ia_a"),
            "ib_a": result.get("ib_a"),
            "ic_a": result.get("ic_a"),
            "phase_losses_kw": (result.get("phase_losses_kw") or {}),
            "voltage_unbalance_percent": (
                (result.get("unbalance_indices") or {}).get("voltage_percent")
            ),
            "current_unbalance_percent": (
                (result.get("unbalance_indices") or {}).get("current_percent")
            ),
            "losses_unbalance_percent": (
                (result.get("unbalance_indices") or {}).get("losses_percent")
            ),
            "flags": (result.get("flags") or {}),
            "proof_ref": raw_result.get("proof_ref"),
            "proof_status": raw_result.get("proof_status"),
            "proof_status_pl": raw_result.get("proof_status_pl"),
            "reporting_status": raw_result.get("reporting_status"),
            "reporting_status_pl": raw_result.get("reporting_status_pl"),
            "dopuszczalnosc_raportowa": raw_result.get("dopuszczalnosc_raportowa", True),
            "reporting_limitations": raw_result.get("reporting_limitations", []),
        }
    ]
    return {"run_id": str(run.id), "rows": rows}


def build_dynamic_stability_results(run: CanonicalRun) -> dict[str, Any]:
    if run.analysis_type != "dynamic_stability":
        return {"run_id": str(run.id), "rows": []}
    result = (run.raw_result or {}).get("result") or {}
    if not result:
        return {"run_id": str(run.id), "rows": []}
    # Karta F-K4 faza 3: wynik niesie IDENTYFIKATORY elementow, ale nie ich RODZAJ,
    # a bez rodzaju warstwa prezentacji nie moze zaznaczyc elementu w modelu (petla
    # decyzji „od wyniku do przyczyny" byla przez to niemozliwa). Rozstrzygamy rodzaj
    # ze snapshotu biegu — addytywnie, bez dotykania kontraktu solvera. Brak wpisu w
    # snapshocie daje None, nigdy rodzaj domyslny (zero zgadywania).
    # `getattr`, bo widok jest wolany takze na atrapach biegu w testach kontraktu
    # (SimpleNamespace bez snapshotu) — brak snapshotu daje pusty indeks, czyli None.
    indeks_rodzajow = zbuduj_indeks_rodzajow(getattr(run, "snapshot", None))
    return {
        "run_id": str(run.id),
        "rows": [
            {
                **result,
                "source_kind": rodzaj_elementu(result.get("source_id"), indeks=indeks_rodzajow),
                "faulted_element_kind": rodzaj_elementu(
                    result.get("faulted_element_id"), indeks=indeks_rodzajow
                ),
                "proof_ref": (run.raw_result or {}).get("proof_ref"),
                "proof_status": (run.raw_result or {}).get("proof_status"),
                "proof_status_pl": (run.raw_result or {}).get("proof_status_pl"),
                "reporting_status": (run.raw_result or {}).get("reporting_status"),
                "reporting_status_pl": (run.raw_result or {}).get("reporting_status_pl"),
                "dopuszczalnosc_raportowa": (run.raw_result or {}).get(
                    "dopuszczalnosc_raportowa", True
                ),
                "reporting_limitations": (run.raw_result or {}).get("reporting_limitations", []),
            }
        ],
    }


def build_dynamic_stability_time_series(run: CanonicalRun) -> dict[str, Any]:
    """Szereg czasowy przebiegu stabilności (U(t)/f(t)) — na żądanie.

    Zwraca przebieg zapisany w `raw_result.time_series` dla biegów, które go
    posiadają. Starsze biegi (sprzed wystawienia szeregu) → `has_time_series=False`
    z pustym przebiegiem (uczciwy stan zerowy w UI). Nie wchodzi do domyślnej
    odpowiedzi wyników — endpoint dedykowany, by nie pompować rozmiaru payloadu.
    """
    empty: dict[str, Any] = {
        "run_id": str(run.id),
        "has_time_series": False,
        "time_unit": "s",
        "quantities": [],
        "points": [],
    }
    if run.analysis_type != "dynamic_stability":
        return empty
    time_series = (run.raw_result or {}).get("time_series")
    if not time_series or not time_series.get("points"):
        return empty
    return {
        "run_id": str(run.id),
        "has_time_series": True,
        "time_unit": time_series.get("time_unit", "s"),
        "criteria_version": time_series.get("criteria_version"),
        "quantities": list(time_series.get("quantities") or []),
        "points": list(time_series.get("points") or []),
    }


def build_automation_trace_results(run: CanonicalRun) -> dict[str, Any]:
    if run.analysis_type != "dynamic_stability":
        return {"run_id": str(run.id), "rows": []}
    trace = (run.raw_result or {}).get("automation_trace") or {}
    rows = list(trace.get("events") or [])
    rows.sort(key=lambda row: (row.get("event_seq", 0), str(row.get("event_type") or "")))
    return {
        "run_id": str(run.id),
        "topology_effect": trace.get("topology_effect"),
        "rows": rows,
    }


def build_source_compliance_results(run: CanonicalRun) -> dict[str, Any]:
    if run.analysis_type != "source_compliance":
        return {"run_id": str(run.id), "rows": []}
    raw_result = run.raw_result or {}
    result = raw_result.get("result") or {}
    if not result:
        return {"run_id": str(run.id), "rows": []}
    return {
        "run_id": str(run.id),
        "rows": [
            {
                "source_ref": raw_result.get("source_ref"),
                "source_type": result.get("source_type"),
                "verdict": result.get("verdict"),
                "reporting_status": result.get("reporting_status"),
                "proof_status": result.get("proof_status"),
                "limitations": list(result.get("limitations") or []),
                "checks": result.get("checks") or {},
                "proof_ref": raw_result.get("proof_ref"),
                "proof_status_pl": raw_result.get("proof_status_pl"),
                "reporting_status_pl": raw_result.get("reporting_status_pl"),
                "dopuszczalnosc_raportowa": raw_result.get("dopuszczalnosc_raportowa", False),
            }
        ],
    }


def _amps_to_ka(value: float | None) -> float | None:
    if value is None:
        return None
    return float(value) / 1000.0


def _build_snapshot_catalog_context(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    collection_labels = {
        "branches": "ODCINEK_SN",
        "transformers": "TRANSFORMATOR_SN_NN",
        "sources": "ZRODLO_SN",
        "loads": "ODBIOR",
        "generators": "ZRODLO",
        "measurements": "POMIAR",
        "protection_assignments": "ZABEZPIECZENIE",
        "branch_points": "PUNKT_ROZGALEZIENIA_SN",
    }
    entries: list[dict[str, Any]] = []

    for collection, element_type in collection_labels.items():
        for raw_element in snapshot.get(collection) or []:
            if not isinstance(raw_element, dict):
                continue

            catalog_ref = raw_element.get("catalog_ref")
            catalog_namespace = raw_element.get("catalog_namespace")
            materialized_params = raw_element.get("materialized_params")
            overrides = raw_element.get("overrides") or []
            parameter_origin = raw_element.get("parameter_source")

            if not any(
                (catalog_ref, catalog_namespace, materialized_params, overrides, parameter_origin)
            ):
                continue

            meta = raw_element.get("meta") or {}
            catalog_item_version = raw_element.get("catalog_version") or meta.get(
                "catalog_item_version"
            )
            catalog_binding = {
                "catalog_namespace": catalog_namespace,
                "catalog_item_id": catalog_ref,
                "catalog_item_version": catalog_item_version,
            }
            source_catalog_label = ":".join(
                str(part) for part in (catalog_namespace, catalog_ref) if part
            )
            if catalog_item_version:
                source_catalog_label = (
                    f"{source_catalog_label}@{catalog_item_version}"
                    if source_catalog_label
                    else str(catalog_item_version)
                )
            entry = {
                "element_id": str(raw_element.get("ref_id") or raw_element.get("id") or ""),
                "element_type": element_type,
                "name": raw_element.get("name"),
                "catalog_binding": catalog_binding,
                "source_catalog": dict(catalog_binding),
                "source_catalog_label": source_catalog_label or None,
                "materialized_params": materialized_params,
            }
            if parameter_origin is not None:
                entry["parameter_origin"] = parameter_origin
                entry["parameter_source"] = parameter_origin
            if raw_element.get("source_mode") is not None:
                entry["source_mode"] = raw_element.get("source_mode")
            if overrides:
                manual_overrides = list(overrides)
                entry["manual_overrides"] = manual_overrides
                entry["overrides"] = manual_overrides
                entry["manual_override_count"] = len(manual_overrides)
                entry["has_manual_overrides"] = True
            else:
                entry["manual_override_count"] = 0
                entry["has_manual_overrides"] = False
            entries.append(entry)

    entries.sort(key=lambda item: (item["element_type"], item["element_id"]))
    return entries


def _build_catalog_context_index(
    catalog_context: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    return {
        str(entry["element_id"]): dict(entry)
        for entry in catalog_context
        if entry.get("element_id")
    }


def _build_catalog_context_summary(catalog_context: list[dict[str, Any]]) -> dict[str, Any]:
    by_type: dict[str, int] = {}
    by_parameter_origin: dict[str, int] = {}
    manual_override_elements = 0
    total_manual_overrides = 0

    for entry in catalog_context:
        element_type = str(entry.get("element_type") or "NIEZNANY")
        by_type[element_type] = by_type.get(element_type, 0) + 1

        parameter_origin = entry.get("parameter_origin") or entry.get("parameter_source")
        if parameter_origin:
            origin_key = str(parameter_origin)
            by_parameter_origin[origin_key] = by_parameter_origin.get(origin_key, 0) + 1

        override_count = int(entry.get("manual_override_count") or 0)
        total_manual_overrides += override_count
        if override_count > 0:
            manual_override_elements += 1

    return {
        "element_count": len(catalog_context),
        "by_type": by_type,
        "by_parameter_origin": by_parameter_origin,
        "manual_override_element_count": manual_override_elements,
        "manual_override_count": total_manual_overrides,
    }


def _enrich_trace_steps_with_catalog_context(
    steps: list[dict[str, Any]],
    catalog_context: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    context_by_element = _build_catalog_context_index(catalog_context)
    enriched_steps: list[dict[str, Any]] = []

    for step in steps:
        enriched = dict(step)
        candidate_ids = [
            step.get("element_id"),
            step.get("target_id"),
            step.get("solver_ref"),
        ]
        catalog_entry = next(
            (
                context_by_element[str(candidate)]
                for candidate in candidate_ids
                if candidate is not None and str(candidate) in context_by_element
            ),
            None,
        )
        if catalog_entry is not None:
            enriched["catalog_context_entry"] = dict(catalog_entry)
            enriched.setdefault("element_id", catalog_entry.get("element_id"))
            enriched.setdefault("element_type", catalog_entry.get("element_type"))
            enriched.setdefault("catalog_binding", catalog_entry.get("catalog_binding"))
            enriched.setdefault("source_catalog", catalog_entry.get("source_catalog"))
            enriched.setdefault("source_catalog_label", catalog_entry.get("source_catalog_label"))
            enriched.setdefault("parameter_origin", catalog_entry.get("parameter_origin"))
            enriched.setdefault("parameter_source", catalog_entry.get("parameter_source"))
            enriched.setdefault("source_mode", catalog_entry.get("source_mode"))
            enriched.setdefault("materialized_params", catalog_entry.get("materialized_params"))
            enriched.setdefault("manual_overrides", catalog_entry.get("manual_overrides"))
            enriched.setdefault("overrides", catalog_entry.get("overrides"))
            enriched.setdefault("manual_override_count", catalog_entry.get("manual_override_count"))
            enriched.setdefault("has_manual_overrides", catalog_entry.get("has_manual_overrides"))

        primary_element_ref = enriched.get("element_id") or (
            catalog_entry.get("element_id") if catalog_entry is not None else None
        )
        primary_element_type = enriched.get("element_type") or (
            catalog_entry.get("element_type") if catalog_entry is not None else None
        )
        related_elements: list[dict[str, Any]] = []
        seen_related: set[tuple[str, str]] = set()

        def register_related(
            element_ref: object | None,
            element_type: object | None,
            role: str,
            *,
            related_elements: list[dict[str, Any]] = related_elements,
            seen_related: set[tuple[str, str]] = seen_related,
        ) -> None:
            if element_ref is None:
                return
            ref_value = str(element_ref)
            key = (ref_value, role)
            if key in seen_related:
                return
            seen_related.add(key)
            payload = {
                "element_ref": ref_value,
                "role": role,
            }
            if element_type is not None:
                payload["element_type"] = str(element_type)
            related_elements.append(payload)

        register_related(primary_element_ref, primary_element_type, "PRIMARY_MODEL")
        register_related(enriched.get("target_id"), primary_element_type, "SOLVER_TARGET")
        register_related(enriched.get("solver_ref"), None, "SOLVER_REF")

        selection_refs: list[str] = []
        for candidate in [primary_element_ref]:
            if candidate is None:
                continue
            candidate_ref = str(candidate)
            if candidate_ref not in selection_refs:
                selection_refs.append(candidate_ref)

        if primary_element_ref is not None:
            enriched["primary_element_ref"] = str(primary_element_ref)
        if primary_element_type is not None:
            enriched["primary_element_type"] = str(primary_element_type)
        enriched["related_elements"] = related_elements
        enriched["selection_refs"] = selection_refs
        enriched_steps.append(enriched)

    return enriched_steps


def _build_trace_selection_index(steps: list[dict[str, Any]]) -> dict[str, int]:
    selection_index: dict[str, int] = {}
    for index, step in enumerate(steps):
        for selection_ref in step.get("selection_refs") or []:
            if selection_ref is None:
                continue
            selection_key = str(selection_ref)
            selection_index.setdefault(selection_key, index)
    return selection_index


def build_extended_trace(run: CanonicalRun) -> dict[str, Any]:
    catalog_context = _build_snapshot_catalog_context(run.snapshot or {})
    enriched_steps = _enrich_trace_steps_with_catalog_context(
        list(run.white_box_trace), catalog_context
    )
    return {
        "run_id": str(run.id),
        "snapshot_id": run.snapshot_hash,
        "input_hash": run.input_hash,
        "white_box_trace": enriched_steps,
        "selection_index": _build_trace_selection_index(enriched_steps),
        "catalog_context": catalog_context,
        "catalog_context_by_element": _build_catalog_context_index(catalog_context),
        "catalog_context_summary": _build_catalog_context_summary(catalog_context),
    }


def build_execution_result_set(run: CanonicalRun) -> dict[str, Any]:
    if run.status != "FINISHED":
        raise ValueError("Wyniki sa dostepne tylko dla zakonczonego przebiegu")
    element_results: list[dict[str, Any]] = []
    global_results: dict[str, Any] = {}
    if run.analysis_type == "short_circuit_sn":
        short_circuit_rows = build_short_circuit_results(run).get("rows", [])
        for item in short_circuit_rows:
            element_results.append(
                {
                    "element_ref": item.get("element_id") or item.get("target_id"),
                    "element_type": "Bus",
                    "solver_ref": item.get("target_id"),
                    "values": {
                        "ikss_ka": item.get("ikss_ka"),
                        "ip_ka": item.get("ip_ka"),
                        "ith_ka": item.get("ith_ka"),
                        "sk_mva": item.get("sk_mva"),
                        "fault_type": item.get("fault_type"),
                        "analysis_type": item.get("analysis_type"),
                        "reporting_status": item.get("reporting_status"),
                        "proof_status": item.get("proof_status"),
                        "proof_ref": item.get("proof_ref"),
                        "dopuszczalnosc_raportowa": item.get("dopuszczalnosc_raportowa"),
                        # CV-3.3-B: pelny bilans (juz policzony przez
                        # `_sc_pelny_bilans` w `build_short_circuit_results`, ale
                        # dotad NIE kopiowany do element_results.values) —
                        # potrzebny porownaniu ogolnemu R1 (Zth/X-R/I2t) bez
                        # drugiego parsowania raw_result. Zero nowej fizyki —
                        # te same wartosci, ktore juz nosi wiersz White Box.
                        "rk_ohm": item.get("rk_ohm"),
                        "xk_ohm": item.get("xk_ohm"),
                        "zk_ohm": item.get("zk_ohm"),
                        "rx_ratio": item.get("rx_ratio"),
                        "xr_ratio": item.get("xr_ratio"),
                        "tk_s": item.get("tk_s"),
                        "i2t_ka2s": item.get("i2t_ka2s"),
                    },
                    "proof_ref": item.get("proof_ref"),
                    "proof_status": item.get("proof_status"),
                    "reporting_status": item.get("reporting_status"),
                }
            )
        global_results = {
            "count": len(element_results),
            "analysis_type": (run.raw_result or {}).get("analysis_type", "short_circuit_3f"),
            "short_circuit_type": (run.raw_result or {}).get("short_circuit_type"),
            "proof_status": (run.raw_result or {}).get("proof_status"),
            "reporting_status": (run.raw_result or {}).get("reporting_status"),
        }
    elif run.analysis_type == "PF":
        result_v1 = (run.raw_result or {}).get("result_v1") or {}
        raw_result = run.raw_result or {}
        for row in build_bus_results(run).get("rows", []):
            element_results.append(
                {
                    "element_ref": row.get("element_id") or row.get("bus_id"),
                    "element_type": "Bus",
                    "solver_ref": row.get("bus_id"),
                    "values": row,
                    "proof_ref": raw_result.get("proof_ref"),
                    "proof_status": raw_result.get("proof_status"),
                    "reporting_status": raw_result.get("reporting_status"),
                }
            )
        # F9.6 (c): resultset v1 nie niosla elementow galeziowych dla
        # LOAD_FLOW (luka wykryta w F9.5) - flow_overlay_probe (spec Sec14.2)
        # czyta P_MW/Q_Mvar/I_A z overlay.elements[ref].metrics, ktore
        # domain/result_builder_v1.py::_extract_element_metrics wyprowadza
        # z kluczy "p_from_mw"/"q_from_mvar"/"i_a" w `values`. build_branch_
        # results() (WHITE BOX, uzywana identycznie przez inny endpoint,
        # api/canonical_run_views.py::build_branch_results_response) zwraca
        # "p_mw"/"q_mvar" - aliasujemy do kluczy rozpoznawanych przez mape
        # metryk (juz istniejacych tam dla p_injected_mw/p_from_mw), bez
        # zmiany build_branch_results ani PowerFlowResult (Frozen Result API,
        # rule 6 - to jest wylacznie interpretacja istniejacego wyniku).
        # V12K-089 (OLTC overlay wynikowy): pozycja koncowa zaczepu i liczba
        # przelaczen z `oltc_control` na gałęzi transformatora — dane overlay
        # (glif OLTC odswiezony po obliczeniu). Additive/exclude_none: tylko dla
        # transformatorow z realna regulacja (final_positions), reszta bez zmian
        # (determinizm zachowany). Interpretacja istniejacego wyniku solvera —
        # PowerFlowResult FROZEN nietkniety.
        _oltc_ctrl = raw_result.get("oltc_control") or {}
        _oltc_final = _oltc_ctrl.get("final_positions") or {}
        _oltc_switches = _oltc_ctrl.get("switch_counts") or {}
        for branch_row in build_branch_results(run).get("rows", []):
            _branch_id = branch_row.get("branch_id")
            _values: dict[str, Any] = {
                **branch_row,
                "p_from_mw": branch_row.get("p_mw"),
                "q_from_mvar": branch_row.get("q_mvar"),
            }
            if _branch_id in _oltc_final:
                _values["tap_position"] = _oltc_final[_branch_id]
                if _branch_id in _oltc_switches:
                    _values["tap_switch_count"] = _oltc_switches[_branch_id]
            element_results.append(
                {
                    "element_ref": branch_row.get("element_id") or branch_row.get("branch_id"),
                    "element_type": "Branch",
                    "solver_ref": branch_row.get("branch_id"),
                    "values": _values,
                    "proof_ref": raw_result.get("proof_ref"),
                    "proof_status": raw_result.get("proof_status"),
                    "reporting_status": raw_result.get("reporting_status"),
                }
            )
        # LF-KONTRAKT (V12K-161): emisja metryk wtrysku źródeł/DER (P/Q/S/cosφ)
        # w element_results — dotąd ścieżka PF wystawiała TYLKO Bus+Branch, więc
        # frontendowy szablon `load_flow.source` (resultLabelTemplates.ts) nie
        # miał danych. Wartość = BILANS WĘZŁA źródłowego: injekcja netto w węźle,
        # w którym stoi źródło, WPROST z FROZEN wyniku solvera
        # (``result_v1.bus_results[node].p_injected_mw/q_injected_mvar`` —
        # konwencja injekcyjna: +generacja/wtłaczanie). Dla węzła bilansującego
        # jest to moc sieci zewnętrznej (slack_power), dla węzła PQ z DER —
        # injekcja netto węzła. S i cosφ to deterministyczne wielkości pochodne
        # (wzorzec loading_pct: |S|=hypot(P,Q), cosφ=|P|/|S|) — ZERO nowej
        # fizyki, ZERO heurystyk. Ref = ref_id źródła (przestrzeń refów overlay
        # identyczna z symbolem SLD źródła/DER). Sortowanie element_results
        # (po element_ref) w builderze niżej — determinizm zachowany.
        _bus_injection: dict[str, tuple[Any, Any]] = {
            b["bus_id"]: (b.get("p_injected_mw"), b.get("q_injected_mvar"))
            for b in result_v1.get("bus_results", [])
            if b.get("bus_id") is not None
        }
        snapshot = run.snapshot or {}
        _source_rows: list[dict[str, Any]] = []
        for _collection in ("sources", "generators"):
            for _src in snapshot.get(_collection) or []:
                if not isinstance(_src, dict):
                    continue
                _src_ref = str(_src.get("ref_id") or "")
                _bus_ref = str(_src.get("bus_ref") or "")
                if not _src_ref or not _bus_ref:
                    continue
                _p, _q = _bus_injection.get(_graph_id_from_ref(_bus_ref), (None, None))
                if _p is None and _q is None:
                    continue
                _p_val = float(_p) if _p is not None else 0.0
                _q_val = float(_q) if _q is not None else 0.0
                _s_val = math.hypot(_p_val, _q_val)
                _src_values: dict[str, Any] = {
                    "p_injected_mw": _p,
                    "q_injected_mvar": _q,
                    "s_mva": _s_val,
                    "bus_ref": _bus_ref,
                }
                if _s_val > 0.0:
                    _src_values["cos_phi"] = abs(_p_val) / _s_val
                _source_rows.append(
                    {
                        "element_ref": _src_ref,
                        "element_type": "Source",
                        "solver_ref": _graph_id_from_ref(_bus_ref),
                        "values": _src_values,
                        "proof_ref": raw_result.get("proof_ref"),
                        "proof_status": raw_result.get("proof_status"),
                        "reporting_status": raw_result.get("reporting_status"),
                    }
                )
        # Sort deterministyczny po ref źródła (niezależny od kolejności kolekcji
        # w snapshocie) — sygnatura wyników liczona nad kolejnością listy.
        _source_rows.sort(key=lambda r: r["element_ref"])
        element_results.extend(_source_rows)
        global_results = {
            **(result_v1.get("summary", {}) or {}),
            # CV-3.3-B: `PowerFlowResultV1.converged` jest polem TOP-LEVEL (poza
            # `summary`) — spread powyzej go nie niosl, wiec projekcja ResultSetV1
            # dla PF nigdy nie mowila, czy rozplyw zbiegl (dziura wykryta przy
            # przepinaniu porownan PF na R1: bez tego pola porownanie nie ma jak
            # ocenic reguly „zmiana zbieznosci" bez wlasnego, drugiego parsowania
            # raw_result). Zero nowej fizyki — pole juz policzone przez solver.
            "converged": result_v1.get("converged"),
            "analysis_type": "load_flow",
            "solver_method": raw_result.get("solver_method"),
            "proof_ref": raw_result.get("proof_ref"),
            "proof_status": raw_result.get("proof_status"),
            "reporting_status": raw_result.get("reporting_status"),
            "quality_status": raw_result.get("quality_status"),
            "applicability_status": raw_result.get("applicability_status"),
            "dopuszczalnosc_raportowa": raw_result.get("dopuszczalnosc_raportowa", False),
        }
        # V12K-045/046 (OLTC H2) + karta CV-4.2 (audit2_applied): surface the
        # regulator trace, study results and audit2 apply trail so the UI can
        # read them from the run result set. Additive — each key is present
        # only when the corresponding feature ran (determinism preserved).
        for oltc_key in (
            "oltc_control",
            "oltc_sweep",
            "oltc_annual_profile",
            "oltc_optimization",
            "audit2_applied",
        ):
            if raw_result.get(oltc_key) is not None:
                global_results[oltc_key] = raw_result[oltc_key]
    elif run.analysis_type == "phase_state_sn":
        phase_rows = build_phase_state_results(run).get("rows", [])
        for row in phase_rows:
            element_results.append(
                {
                    "element_ref": row.get("element_id") or row.get("target_id"),
                    "element_type": "Bus",
                    "solver_ref": row.get("target_id"),
                    "values": row,
                    "proof_ref": row.get("proof_ref"),
                    "proof_status": row.get("proof_status"),
                    "reporting_status": row.get("reporting_status"),
                }
            )
        global_results = {
            "count": len(element_results),
            "analysis_type": "phase_state_sn",
            "proof_status": (run.raw_result or {}).get("proof_status"),
            "reporting_status": (run.raw_result or {}).get("reporting_status"),
        }
    elif run.analysis_type == "dynamic_stability":
        stability_rows = build_dynamic_stability_results(run).get("rows", [])
        for row in stability_rows:
            element_results.append(
                {
                    "element_ref": row.get("source_id") or row.get("faulted_element_id"),
                    "element_type": "Source",
                    "solver_ref": row.get("scenario_id"),
                    "values": row,
                    "proof_ref": row.get("proof_ref"),
                    "proof_status": row.get("proof_status"),
                    "reporting_status": row.get("reporting_status"),
                }
            )
        global_results = {
            "count": len(element_results),
            "analysis_type": "dynamic_stability",
            "automation_event_count": len(build_automation_trace_results(run).get("rows", [])),
            "proof_status": (run.raw_result or {}).get("proof_status"),
            "reporting_status": (run.raw_result or {}).get("reporting_status"),
        }
    elif run.analysis_type == "source_compliance":
        compliance_rows = build_source_compliance_results(run).get("rows", [])
        for row in compliance_rows:
            element_results.append(
                {
                    "element_ref": row.get("source_ref"),
                    "element_type": "Source",
                    "solver_ref": row.get("source_ref"),
                    "values": row,
                    "proof_ref": row.get("proof_ref"),
                    "proof_status": row.get("proof_status"),
                    "reporting_status": row.get("reporting_status"),
                }
            )
        global_results = {
            "count": len(element_results),
            "analysis_type": "source_compliance",
            "proof_status": (run.raw_result or {}).get("proof_status"),
            "reporting_status": (run.raw_result or {}).get("reporting_status"),
        }
    elif run.analysis_type == "protection_sn":
        protection_raw = (run.raw_result or {}).get("protection_result") or {}
        for evaluation in protection_raw.get("evaluations", []):
            element_results.append(
                {
                    "element_ref": evaluation.get("protected_element_ref"),
                    "element_type": "ProtectionDevice",
                    "solver_ref": evaluation.get("fault_target_id"),
                    "values": evaluation,
                }
            )
        element_results.sort(key=lambda row: str(row.get("element_ref") or ""))
        summary = protection_raw.get("summary") or {}
        global_results = {
            "count": len(element_results),
            "analysis_type": "protection",
            "sc_run_id": (run.raw_result or {}).get("sc_run_id"),
            "template_ref": protection_raw.get("template_ref"),
            "template_fingerprint": protection_raw.get("template_fingerprint"),
            **summary,
        }

    signature_payload = json.dumps(
        _canonicalize(
            {
                "run_id": str(run.id),
                "analysis_type": run.analysis_type,
                "validation": run.validation,
                "readiness": run.readiness,
                "element_results": element_results,
                "global_results": global_results,
            }
        ),
        sort_keys=True,
        separators=(",", ":"),
    )
    deterministic_signature = hashlib.sha256(signature_payload.encode("utf-8")).hexdigest()

    analysis_type = _execution_analysis_type_for_run(run)
    return {
        "run_id": str(run.id),
        "analysis_type": analysis_type,
        "validation_snapshot": run.validation,
        "readiness_snapshot": run.readiness,
        "element_results": element_results,
        "global_results": global_results,
        "deterministic_signature": deterministic_signature,
    }
