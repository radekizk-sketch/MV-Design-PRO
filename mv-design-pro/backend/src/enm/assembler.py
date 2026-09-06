"""Assembler wejścia solvera — JEDNA droga migawka ENM + opcje → kontrakt solvera (CV-4.1).

Konstytucja C.2 (``docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md``): przepływ
``EffectiveNetworkSnapshot → IR (NetworkGraph z enm/mapping) → kontrakt wejścia solvera``
ma dokładnie jednego producenta. Do karty CV-4.1 składanie ``PowerFlowInput`` i wejścia
zwarciowego (graf, Z0, c, t_k, węzły) było wpisane w wykonawców biegu
(``enm/canonical_analysis.py``), a równolegle istniało 12 innych budowniczych (pomiar
CV-4.0: 41 konstrukcji w 13 assemblerach). Ten moduł jest domem złożenia; wykonawcy
biegu (``_execute_power_flow``/``_execute_short_circuit``) WOŁAJĄ je i dalej tylko
rozwiązują i montują wynik. Kod przeniesiony 1:1 — parytet bit w bit pilnuje
``tests/golden/parytet_assemblera``.

NOT-A-SOLVER: tu jest wyłącznie przygotowanie wejścia z katalogu/normy (IEC 60909-0
§6: c per pasmo, korekta temperaturowa MIN, Z0 z grupy połączeń) — fizyka sieci liczy
się w ``network_model/solvers/**``.

BEZ BAZY (CV-4.2b): assembler jest funkcją (migawka, opcje, dane) — nie otwiera sesji
ani silnika. Stan zapisany w bazie (konfiguracja audytu 2 stacji) dostarcza wykonawca
biegu fabryką ``UnitOfWork`` swojego wołającego i podaje tu jako ``rozszerzenia_audit2``.
Własny silnik z ``DATABASE_URL`` (``_uow_factory_biezacy``/``_maybe_load_audit2_extensions``)
został skasowany procedurą; bramka wskrzeszenia: ``scripts/legacy_public_path_guard.py``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import NAMESPACE_DNS, uuid5

from application.solvers.lv_temperature_correction import build_min_scenario_graph
from domain.canonical_operations import READINESS_CODES
from enm.mapping import (
    build_grid_source_trace,
    build_zero_sequence_zbus,
    map_enm_to_network_graph,
)
from enm.models import EnergyNetworkModel
from enm.topology import Wyspa, derive
from network_model.core.graph import NetworkGraph
from network_model.core.node import NodeType
from network_model.core.voltage_factor import Scenario
from network_model.solvers.power_flow_inverter import (
    InverterControl,
    inverter_control_from_params,
)
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    PVSpec,
    ShuntSpec,
    SlackSpec,
)
from network_model.solvers.short_circuit_core import ShortCircuitType


def _graph_id_from_ref(ref_id: str) -> str:
    return str(uuid5(NAMESPACE_DNS, ref_id))


def _short_circuit_type_from_options(options: dict[str, Any]) -> ShortCircuitType:
    raw = options.get("fault_type") or options.get("short_circuit_type") or "3F"
    mapping = {
        "3F": ShortCircuitType.THREE_PHASE,
        "SC_3F": ShortCircuitType.THREE_PHASE,
        "1F": ShortCircuitType.SINGLE_PHASE_GROUND,
        "SC_1F": ShortCircuitType.SINGLE_PHASE_GROUND,
        "2F": ShortCircuitType.TWO_PHASE,
        "SC_2F": ShortCircuitType.TWO_PHASE,
        "2F+G": ShortCircuitType.TWO_PHASE_GROUND,
        "2F+Z": ShortCircuitType.TWO_PHASE_GROUND,
        "2FG": ShortCircuitType.TWO_PHASE_GROUND,
        "SC2FG": ShortCircuitType.TWO_PHASE_GROUND,
        "SC_2F_G": ShortCircuitType.TWO_PHASE_GROUND,
        "SC_2F+G": ShortCircuitType.TWO_PHASE_GROUND,
        "SC_2F+Z": ShortCircuitType.TWO_PHASE_GROUND,
    }
    if raw in mapping:
        return mapping[raw]
    raise ValueError(f"Nieobslugiwany typ zwarcia: {raw}")


def _short_circuit_requires_z0(short_circuit_type: ShortCircuitType) -> bool:
    return short_circuit_type in {
        ShortCircuitType.SINGLE_PHASE_GROUND,
        ShortCircuitType.TWO_PHASE_GROUND,
    }


def _build_snapshot_graph_element_context(
    snapshot: dict[str, Any],
) -> dict[str, dict[str, dict[str, Any]]]:
    node_context: dict[str, dict[str, Any]] = {}
    branch_context: dict[str, dict[str, Any]] = {}

    for raw_bus in snapshot.get("buses") or []:
        if not isinstance(raw_bus, dict):
            continue
        ref_id = str(raw_bus.get("ref_id") or "")
        if not ref_id:
            continue
        tags = raw_bus.get("tags") or []
        # Celem zwarcia jest KAZDA szyna modelu poza jawnie pomocniczymi
        # (tag `helper_bus` — wezly podzialu magistrali i punkty techniczne,
        # ktore nie sa fizyczna szyna rozdzielni).
        #
        # V12K-184 — usuniete dwa bledne kryteria:
        #  1. `"/section/" in ref_id and ref_id.endswith("/bus_sn")` wykluczalo
        #     GLOWNA szyne sekcji SN GPZ (`add_grid_source_sn`) — czyli punkt, w
        #     ktorym moc zwarciowa jest podstawa doboru rozdzielni (Icw/Idyn pol)
        #     i nastaw zabezpieczen. Dowod: companion sieci demonstracyjnej mial
        #     14 szyn wynikowych i ANI JEDNEJ szyny GPZ. Reguly na wzorzec
        #     ref_id nie ma w zadnym kontrakcie — byla ad-hoc.
        #  2. `render_on_sld` / `show_in_project_tree` to atrybuty PREZENTACJI;
        #     sterowanie nimi zakresem obliczen odwraca separacje warstw (o tym,
        #     czy liczymy zwarcie, decyduje rola elektryczna wezla, nie jego
        #     widocznosc na schemacie). Szyny, ktore te flagi mialy wylaczyc, i
        #     tak nosza `helper_bus`.
        skip_short_circuit_target = "helper_bus" in tags
        node_context[_graph_id_from_ref(ref_id)] = {
            "element_id": ref_id,
            "element_type": "BUS",
            "synthetic": False,
            "skip_short_circuit_target": skip_short_circuit_target,
        }

    for raw_branch in snapshot.get("branches") or []:
        if not isinstance(raw_branch, dict):
            continue
        ref_id = str(raw_branch.get("ref_id") or "")
        if not ref_id:
            continue
        branch_context[_graph_id_from_ref(ref_id)] = {
            "element_id": ref_id,
            "element_type": "BRANCH",
            "synthetic": False,
        }

    for raw_transformer in snapshot.get("transformers") or []:
        if not isinstance(raw_transformer, dict):
            continue
        ref_id = str(raw_transformer.get("ref_id") or "")
        if not ref_id:
            continue
        branch_context[_graph_id_from_ref(ref_id)] = {
            "element_id": ref_id,
            "element_type": "TRANSFORMER",
            "synthetic": False,
        }

    # Zasilanie systemowe nie tworzy juz wezla/galezi w grafie — od V12K-184 jest
    # bocznikiem Y_Q = 1/Z_Q w wezle przylaczenia (IEC 60909-0 §3.2), wiec nie ma
    # syntetycznych elementow do opisania w kontekscie snapshotu.

    return {
        "nodes": node_context,
        "branches": branch_context,
    }


def _study_frequency_hz(snapshot: dict[str, Any] | None) -> float:
    """ADR-011 (Z-ZIP-04): system frequency for the study, from the ENM header
    defaults (ENMDefaults.frequency_hz). Falls back to 50.0 Hz."""
    defaults = ((snapshot or {}).get("header") or {}).get("defaults") or {}
    try:
        return float(defaults.get("frequency_hz", 50.0))
    except (TypeError, ValueError):
        return 50.0


def _normalize_power_flow_solver_method(raw_method: object) -> str:
    normalized = str(raw_method or "NR").strip().upper().replace("-", "_")
    if normalized in {"NR", "NEWTON", "NEWTON_RAPHSON"}:
        return "newton-raphson"
    if normalized in {"GS", "GAUSS", "GAUSS_SEIDEL"}:
        return "gauss-seidel"
    if normalized in {"FD", "FDLF", "FAST_DECOUPLED"}:
        return "fast-decoupled"
    raise ValueError(f"Nieznany tryb rozpływu mocy: {raw_method}")


def _build_shunt_specs_from_snapshot(snapshot: dict[str, Any], base_mva: float) -> list[ShuntSpec]:
    """Map ENM ShuntCapacitor elements onto the EXISTING solver shunt mechanism.

    NOT-A-SOLVER: this is pure input preparation (mechanical white-box mapping),
    no physics is computed in the solver layer.

    First-principles susceptance of a fixed capacitor bank rated Q_rated [Mvar]
    at U_rated [kV]:
        B = Q_rated / U_rated²            (because Q = B · U²)
    In per-unit on the system base S_base [MVA] (the same base the solver uses to
    build Y_bus from Z_base = U²/S_base):
        b_pu = B · Z_base = (Q_rated / U_rated²) · (U_rated² / S_base)
             = Q_rated / S_base
    A capacitor adds a POSITIVE shunt susceptance (+jB), so b_pu > 0; the solver
    then delivers Q = B · |V|² automatically, i.e. the actual injected reactive
    power scales with the square of the operating voltage (correct physics).

    Missing/invalid rated_mvar or rated_kv is NOT guessed — such elements raise a
    ValueError (the validator surfaces the same condition as a BLOCKER earlier).
    """
    specs: list[ShuntSpec] = []
    for raw in snapshot.get("shunt_capacitors") or []:
        if not isinstance(raw, dict):
            continue
        if str(raw.get("status") or "closed") == "open":
            continue
        ref_id = str(raw.get("ref_id") or "")
        bus_ref = str(raw.get("bus_ref") or "")
        if not bus_ref:
            raise ValueError(
                f"Bateria kondensatorow '{ref_id}' nie ma przypisanej szyny (bus_ref)."
            )
        rated_mvar = raw.get("rated_mvar")
        rated_kv = raw.get("rated_kv")
        if rated_mvar is None or float(rated_mvar) <= 0.0:
            raise ValueError(
                f"Bateria kondensatorow '{ref_id}' nie ma dodatniej mocy "
                f"znamionowej (rated_mvar)."
            )
        if rated_kv is None or float(rated_kv) <= 0.0:
            raise ValueError(
                f"Bateria kondensatorow '{ref_id}' nie ma dodatniego napiecia "
                f"znamionowego (rated_kv)."
            )
        # b_pu = Q_rated / S_base (positive susceptance for a capacitor).
        b_pu = float(rated_mvar) / base_mva
        specs.append(ShuntSpec(node_id=_graph_id_from_ref(bus_ref), g_pu=0.0, b_pu=b_pu))
    return specs


def _oze_opt_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    return None


@dataclass(frozen=True)
class _ConverterBinding:
    """Regulowane źródło przypięte do węzła: charakterystyka + WŁASNA moc źródła.

    Defekt B (przegląd 2026-08-01): kształtowanie falownika MUSI dostać moc czynną
    wytwórcy jako jawną wielkość wejściową. Odczyt mocy zadanej szyny był podwójnie
    błędny — na szynie prosumenckiej to moc ODBIORU, a po rozdzieleniu ZIP (defekt
    D1) to baza odbiorowa. Konwencja GENERATOROWA (>0 = wstrzyk do sieci), zgodna
    z `Generator.p_mw`/`q_mvar` w ENM i z `PQSpec.inverter_p_mw` w solverze.
    """

    control: InverterControl
    p_mw: float
    #: Q wytworcy z JEDNEGO zrodla prawdy (`moc_bierna_wytworcy`); `None` = Q nieznane
    #: (nie wyprowadzalne z jawnego Q ani Q-set-pointu karty) — rozplyw jest wtedy
    #: zablokowany BLOCKER-em `generator.q_missing` PRZED tym punktem; tu NIE wolno
    #: podstawiac 0,0 (guard `solver_input_substitute_guard`, karta FAB-H, domkniecie).
    q_mvar: float | None


def _build_converter_control_by_node(
    snapshot: dict[str, Any], base_mva: float
) -> dict[str, _ConverterBinding]:
    """G-OZE-PF (V12K-051): mapuje węzły OZE → regulacja + moc źródła dla kanonicznego PF.

    Domyka forward-phantom: dotąd kanoniczny run budował PQSpec bez inverter_control,
    więc wybór trybu regulacji (Q(U)/cosφ) nie wpływał na rozpływ mocy. Reużycie
    `inverter_control_from_params` (most języka Polish→InverterMode już w mapperze).

    Determinizm: dołączamy WYŁĄCZNIE realnie aktywne regulacje (cosφ≠1 albo nachylenie
    Q(U)≠0). Źródła pasywne / unity / bez nowych pól → brak wpisu → PQSpec bez
    inverter_control → wynik bajt-w-bajt jak dotąd (istniejące snapshoty nietknięte).

    JEDNA REGULACJA NA SZYNĘ (defekt B, §2.2). Kontrakt solvera ma dokładnie jedno
    `PQSpec.inverter_control` na węzeł, więc dwa REGULOWANE źródła na jednej szynie
    są nieprzedstawialne — dotąd ostatnie po cichu wygrywało, a moc bierna
    pierwszego znikała z modelu. Taki przypadek jest ODRZUCANY z jawnym błędem;
    ciche wybranie jednego źródła jest zakazane. Źródła BEZ aktywnej regulacji nie
    kolidują — ich moc zostaje w agregacie szyny, tak jak dotąd.
    """
    out: dict[str, _ConverterBinding] = {}
    for gen in snapshot.get("generators") or []:
        if not isinstance(gen, dict):
            continue
        bus_ref = gen.get("bus_ref")
        if not isinstance(bus_ref, str) or not bus_ref.strip():
            continue
        meta_raw = gen.get("meta")
        meta: dict[str, Any] = meta_raw if isinstance(meta_raw, dict) else {}
        mode = str(meta.get("control_mode") or gen.get("control_mode") or "").upper()
        cosphi = _oze_opt_float(meta.get("cos_phi"))
        qu_slope = _oze_opt_float(meta.get("qu_slope_pu_per_pu"))
        # V12K-062 (G-OZE-B): statyzm P(f)/LFSM z generatora → lfsm_droop_pct. Realnie
        # aktywny przy odchyłce częstotliwości studium (przy 50 Hz brak wpływu → determinizm).
        lfsm_droop = _oze_opt_float(meta.get("frequency_droop_percent"))
        active = False
        if mode in ("STALY_COS_PHI", "COSPHI_CONST", "COSPHI_P", "COSPHI(P)"):
            active = cosphi is not None and abs(cosphi - 1.0) > 1e-9
        elif mode in ("Q_OD_U", "Q_U", "Q(U)"):
            active = qu_slope is not None and abs(qu_slope) > 1e-12
        # P(f)/LFSM droop aktywuje węzeł niezależnie od trybu Q (statyzm częstotliwościowy).
        if lfsm_droop is not None and abs(lfsm_droop) > 1e-12:
            active = True
        if not active:
            continue
        params: dict[str, Any] = {"control_mode": mode}
        if cosphi is not None:
            params["cosphi"] = cosphi
        if qu_slope is not None:
            params["qu_slope_pu_per_pu"] = qu_slope
            # V12K-064 (G-OZE-B4): napięciowe pasmo nieczułości Q(U) [pu U] — zakres, w którym
            # Q=0 (NC RfG). Brak → domyślny punkt 1.0/1.0 (reakcja natychmiastowa).
            qu_db_low = _oze_opt_float(meta.get("qu_deadband_low_pu"))
            qu_db_high = _oze_opt_float(meta.get("qu_deadband_high_pu"))
            if qu_db_low is not None:
                params["qu_deadband_low_pu"] = qu_db_low
            if qu_db_high is not None:
                params["qu_deadband_high_pu"] = qu_db_high
        if lfsm_droop is not None:
            params["lfsm_droop_pct"] = lfsm_droop
            lfsm_deadband = _oze_opt_float(meta.get("lfsm_deadband_hz"))
            if lfsm_deadband is not None:
                params["lfsm_deadband_hz"] = lfsm_deadband
            if bool(meta.get("lfsm_allow_increase")):
                params["lfsm_allow_increase"] = True
        qmin = _oze_opt_float(meta.get("q_min_mvar"))
        qmax = _oze_opt_float(meta.get("q_max_mvar"))
        if qmin is not None:
            params["qmin_mvar"] = qmin
        if qmax is not None:
            params["qmax_mvar"] = qmax
        pmax = _oze_opt_float(gen.get("p_mw"))
        if pmax is not None:
            params["pmax_mw"] = abs(pmax)
        sn = _oze_opt_float(gen.get("sn_mva")) or _oze_opt_float(meta.get("sn_mva"))
        control = inverter_control_from_params(params, base_mva, sn)
        if control is None:
            continue
        node_id = _graph_id_from_ref(bus_ref.strip())
        if node_id in out:
            raise ValueError(
                f"Szyna {bus_ref.strip()} ma wiecej niz jedno zrodlo z aktywna regulacja "
                "falownika; kontrakt rozplywu dopuszcza jedna charakterystyke na wezel"
            )
        # Karta FAB-H (H2, KLASA NIE INSTANCJA): Q rozstrzygane przez JEDNO wspólne
        # źródło prawdy (moc_bierna_wytworcy), tak samo jak w enm/mapping.py i
        # solver_input/v126_contracts.py oraz w bramce gotowości
        # (calculation_readiness/service.py::_generator_q_mvar_jawne) — czyta
        # dodatkowo jawny Q-set-point karty (qmin_mvar == qmax_mvar w
        # materialized_params), którego to miejsce dotąd NIE odczytywało (mimo że
        # bramka gotowości już go czytała — dwa niezależne warunki, które "dziś się
        # zgadzają"). BRAK => 0,0 jako strukturalne wypełnienie (rozpływ jest
        # zablokowany PRZED tym punktem przez BLOCKER `generator.q_missing`, gdy Q
        # jest naprawdę nieznane).
        from solver_input.moc_bierna_wytworcy import moc_bierna_wytworcy

        materialized_params = gen.get("materialized_params")
        karta = materialized_params if isinstance(materialized_params, dict) else None
        wynik_q = moc_bierna_wytworcy(gen, karta)
        out[node_id] = _ConverterBinding(
            control=control,
            # Konwencja generatorowa (>0 = wstrzyk), jak Generator.p_mw w ENM.
            p_mw=_oze_opt_float(gen.get("p_mw")) or 0.0,
            q_mvar=wynik_q.q_mvar,
        )
    return out


# ---------------------------------------------------------------------------
# Złożenie wejścia solvera — JEDEN assembler (CV-4.1, konstytucja C.2.3)
# ---------------------------------------------------------------------------


#: Kod gotowości odmowy rozpływu: dwa lub więcej źródeł sieciowych w JEDNEJ wyspie
#: (rdzeń NR zna jeden ``SlackSpec``; polityka modelowa właściciela — OD-7).
KOD_WIELE_ZRODEL_W_WYSPIE = "source.multiple_grid_sources_in_island"


class OdmowaWejsciaRozplywu(ValueError):
    """Odmowa złożenia wejścia rozpływu z kodem gotowości kanonu (``READINESS_CODES``).

    ``kod`` = kod kanonu (ten sam, który emituje bramka gotowości
    ``calculation_readiness/service.py::_check_power_flow`` z tej samej
    ``TopologyView``), ``elementy`` = ref_id elementów blokujących.
    """

    def __init__(self, kod: str, komunikat: str, *, elementy: tuple[str, ...] = ()) -> None:
        super().__init__(f"{komunikat} (kod gotowości: {kod})")
        self.kod = kod
        self.elementy = elementy


@dataclass(frozen=True)
class WyspaRozplywu:
    """Wyspa zasilona JEDNYM źródłem sieciowym — własne wejście solvera (CV-4.3 K3b).

    Solver FROZEN liczy wyłącznie wyspę szyny bilansującej (``build_slack_island``),
    więc sieć z kilkoma GPZ w osobnych wyspach jest rozwiązywana po jednej wyspie
    naraz; wykonawca scala rozwiązania (``enm/rozplyw_wysp.py``). Przy jednej
    wyspie zasilonej ``pf_input`` to wejście na PEŁNYM grafie — tożsame z tym
    sprzed karty (parytet bit w bit); przy kilku — podgraf wyspy (regulator
    zaczepowy i boczniki czytają tylko własną wyspę).
    """

    #: Węzeł IR szyny bilansującej (szyna jedynego źródła sieciowego wyspy).
    slack_node_id: str
    #: ``ref_id`` źródła sieciowego ENM tej wyspy.
    zrodlo_ref: str
    #: ``ref_id`` szyn ENM wyspy (kolejność ``TopologyView``: posortowane).
    szyny: tuple[str, ...]
    #: Węzły IR wyspy (posortowane).
    wezly: tuple[str, ...]
    pf_input: PowerFlowInput


@dataclass(frozen=True)
class WejscieRozplywu:
    """Wejście rozpływu złożone z migawki ENM i opcji biegu (kontrakt FROZEN ``PowerFlowInput``).

    ``graph`` jest oddawany na własność solverowi (pętla regulatora zaczepowego może
    przestawić pozycje zaczepów); ``graph_nodes``/``graph_branches`` to kontekst
    elementów migawki (tożsamość ref_id, rola) do montażu wyniku, nie fizyka.

    ``wyspy`` (CV-4.3 K3b): jedno wejście solvera na wyspę zasiloną, w kolejności
    ``TopologyView`` (największa wyspa pierwsza, potem pierwsza szyna);
    ``pf_input``/``slack_node_id`` to wejście i szyna bilansująca PIERWSZEJ wyspy.
    ``pq_specs``/``pv_specs`` = specyfikacje WSZYSTKICH szyn PQ/PV sieci (także w
    wyspach niezasilonych — jak dotąd w ``pf_input.pq`` przy jednej wyspie).
    """

    graph: NetworkGraph
    pf_input: PowerFlowInput
    options: PowerFlowOptions
    base_mva: float
    slack_node_id: str
    requested_solver_method: str
    audit2_extensions: dict[str, object] | None
    #: Ślad zastosowanych korekt audit2 na grafie (karta CV-4.2, pole addytywne):
    #: `None`, gdy audit2 nie było żądane (`audit2_extensions is None`); w
    #: przeciwnym razie zwrot `apply_audit2_to_network_model` (zawsze te same
    #: trzy klucze — `tap_position_changes`/`block_transformer_z_changes`/
    #: `pf_droop_changes` — możliwie puste). Wykonawca dokłada je do
    #: `raw_result` WYŁĄCZNIE, gdy nie jest `None` — parytet golden PF (żadna
    #: sieć rejestru nie używa audit2) zostaje bit w bit.
    audit2_applied: dict[str, Any] | None
    graph_nodes: dict[str, dict[str, Any]]
    graph_branches: dict[str, dict[str, Any]]
    wyspy: tuple[WyspaRozplywu, ...]
    pq_specs: tuple[PQSpec, ...]
    pv_specs: tuple[PVSpec, ...]


@dataclass(frozen=True)
class WejscieZwarcia:
    """Wejście zwarciowe złożone z migawki ENM i opcji biegu (IEC 60909: graf, Z0, c, tk).

    ``graph`` = graf migawki (topologia węzłów raportowalnych);
    ``solve_graph`` = graf podany solverowi (kopia z korektą temperaturową R_θ dla
    scenariusza MIN albo ten sam obiekt dla MAX) BEZ wysp pływających
    (``wezly_bez_odniesienia`` — CV-4.3 K3b: wyspa bez impedancji do odniesienia
    czyniła Y-bus osobliwą i wywracała CAŁY bieg albo oddawała szum algebry
    liniowej; jej węzły nie wchodzą do solvera, wiersz niesie powód);
    ``z0_bus`` = macierz składowej zerowej w porządku węzłów ``solve_graph``;
    ``reportable_fault_node_ids`` = węzły zwarcia po zawężeniu lokalizacją
    scenariusza (węzły bez odniesienia zostają raportowalne — jako wiersze
    nieraportowalne z powodem).
    """

    enm: EnergyNetworkModel
    graph: NetworkGraph
    solve_graph: NetworkGraph
    z0_bus: Any
    short_circuit_type: ShortCircuitType
    scenario_c: Scenario
    c_factor_explicit: Any
    c_factor_override: bool
    tk_s: float
    reportable_fault_node_ids: list[str]
    temperature_correction_notes: tuple[dict[str, Any], ...]
    graph_nodes: dict[str, dict[str, Any]]
    graph_branches: dict[str, dict[str, Any]]
    wezly_bez_odniesienia: frozenset[str]
    #: CV-4.3 K6: ślad WHITE BOX wyprowadzenia Z_Q każdego źródła sieciowego
    #: (c wg IEC 60909-0:2016 §6.2.1 eq. 6) — ``enm.mapping.build_grid_source_trace``.
    zrodla_sieciowe_trace: tuple[dict[str, Any], ...]


def wezly_bez_impedancji_do_odniesienia(graph: NetworkGraph) -> frozenset[str]:
    """Węzły, których wyspa nie ma ŻADNEGO elementu z impedancją do odniesienia.

    Wyspa = komponent spójności aktywnych gałęzi i zamkniętych łączników
    (``NetworkGraph.find_islands``); element z impedancją do odniesienia = źródło
    sieciowe (``grid_sc_sources``), maszyna synchroniczna albo asynchroniczna w
    ruchu. Metoda równoważnego źródła napięciowego (IEC 60909-0 §4.2) wymaga
    skończonej impedancji Z_kk widzianej z węzła zwarcia do odniesienia; falownik
    jest źródłem prądowym bez impedancji (§6.8), więc wyspa zasilana wyłącznie
    falownikami ma Y-bus osobliwą — ``np.linalg.inv`` w solverze (FROZEN, B-01)
    oddaje wtedy liczby zależne od biblioteki algebry liniowej, nie od sieci,
    albo (macierz dokładnie osobliwa) wywraca cały bieg. Pomiar 2026-09-05 (CI run
    4877 vs lokalnie, sieć G04/06 rejestru): lokalnie R/X = −32 dokładnie,
    κ ≈ 5·10⁴¹, na CI inne śmieci mieszczące się w paśmie — kwalifikacja po
    LICZBACH była funkcją maszyny. Wyspa jest funkcją WEJŚCIA, więc kwalifikacja
    po niej jest deterministyczna i przenośna (CI-PARYTET-5); od CV-4.3 K3b te
    węzły są ponadto USUWANE z grafu solvera (``WejscieZwarcia.solve_graph``).
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


def _wyspy_zasilone(snapshot: dict[str, Any], graph: NetworkGraph) -> list[tuple[Wyspa, str, str]]:
    """Wyspy zasilone migawki jako ``(wyspa, ref_id źródła, węzeł IR szyny bilansującej)``.

    Predykat odmowy (≥ 2 źródła sieciowe w jednej wyspie) i przydział szyny
    bilansującej pochodzą z JEDNEGO obiektu ``TopologyView`` (predykaty parami).
    Wyspy bez źródła sieciowego nie wchodzą do listy — ich węzły zostają
    nierozwiązane (``not_solved_nodes`` → ``None`` + ``non_finite_fields``).
    """
    widok = derive(snapshot)
    szyna_zrodla = {
        str(zrodlo.get("ref_id")): str(zrodlo.get("bus_ref"))
        for zrodlo in snapshot.get("sources") or []
        if isinstance(zrodlo, dict)
    }
    konflikty = [wyspa for wyspa in widok.wyspy if len(wyspa.zrodla_sieciowe) > 1]
    if konflikty:
        opis = "; ".join(
            f"wyspa szyn [{', '.join(wyspa.szyny[:6])}{', …' if len(wyspa.szyny) > 6 else ''}]: "
            f"źródła {', '.join(wyspa.zrodla_sieciowe)}"
            for wyspa in konflikty
        )
        raise OdmowaWejsciaRozplywu(
            KOD_WIELE_ZRODEL_W_WYSPIE,
            f"{READINESS_CODES[KOD_WIELE_ZRODEL_W_WYSPIE].message_pl} — {opis}",
            elementy=tuple(zrodlo for wyspa in konflikty for zrodlo in wyspa.zrodla_sieciowe),
        )
    wynik: list[tuple[Wyspa, str, str]] = []
    for wyspa in widok.wyspy:
        if not wyspa.zrodla_sieciowe:
            continue
        zrodlo_ref = wyspa.zrodla_sieciowe[0]
        slack_node_id = _graph_id_from_ref(szyna_zrodla[zrodlo_ref])
        wezel = graph.nodes.get(slack_node_id)
        if wezel is None or wezel.node_type != NodeType.SLACK:
            raise ValueError(
                f"Szyna źródła sieciowego '{zrodlo_ref}' nie jest węzłem SLACK grafu — graf "
                "podany assemblerowi nie odpowiada migawce ENM (niespójne wejście)."
            )
        wynik.append((wyspa, zrodlo_ref, slack_node_id))
    return wynik


def zbuduj_graf(snapshot: dict[str, Any] | None) -> NetworkGraph:
    """IR obliczeniowy z migawki ENM — jedyna droga ENM → ``NetworkGraph`` w torze kanonicznym."""
    enm = EnergyNetworkModel.model_validate(snapshot or {})
    return map_enm_to_network_graph(enm)


def zloz_wejscie_rozplywu(
    snapshot: dict[str, Any] | None,
    options: dict[str, Any],
    graph: NetworkGraph | None = None,
    *,
    rozszerzenia_audit2: dict[str, Any] | None = None,
) -> WejscieRozplywu:
    """Złóż wejście rozpływu (przeniesione 1:1 z ``canonical_analysis._execute_power_flow``).

    ``graph``: opcjonalny GOTOWY graf zbudowany z TEJ SAMEJ migawki (oszczędzenie
    powtórnej budowy, wynik ten sam co do bitu) — patrz docstring wykonawcy.

    ``rozszerzenia_audit2`` (CV-4.2b): rozszerzenia solvera z zapisanej konfiguracji
    audytu 2 stacji (``solver_input.audit2_der_payload.rozszerzenia_audit2_z_konfiguracji``),
    dostarczone przez WOŁAJĄCEGO — wykonawca biegu czyta je fabryką ``UnitOfWork``
    swojego żądania (``canonical_analysis.rozszerzenia_audit2_dla_opcji``). Assembler
    jest funkcją (migawka, opcje, dane) i NIE otwiera bazy: do tej karty budował tu
    własny silnik z ``DATABASE_URL``, niezależny od reszty procesu, więc konfiguracja
    zapisana przez API bywała dla biegu niewidoczna. ``None`` = bez korekt audytu 2.
    """
    snapshot = snapshot or {}
    graph = zbuduj_graf(snapshot) if graph is None else graph
    graph_element_context = _build_snapshot_graph_element_context(snapshot)
    graph_nodes = graph_element_context.get("nodes", {})
    graph_branches = graph_element_context.get("branches", {})

    # CV-4.3 K3b (A3-05): szyna bilansująca PER WYSPA z jedynego serwisu topologii
    # (``enm/topology.py::derive``) — do tej karty pierwszy posortowany węzeł SLACK
    # był szyną bilansującą CAŁEJ sieci, a sieć z dwoma GPZ (w osobnych wyspach czy
    # w jednej) była odmawiana już przy konstrukcji IR. Dziś: wyspa z jednym
    # źródłem = własne wejście solvera; dwa źródła w jednej wyspie = odmowa NAZWANA
    # (``OdmowaWejsciaRozplywu``, kod ``source.multiple_grid_sources_in_island``).
    wyspy_zasilone = _wyspy_zasilone(snapshot, graph)
    if not wyspy_zasilone:
        raise ValueError("Brak wezla bilansujacego SLACK w kanonicznym snapshotcie ENM")
    slack_node_id = wyspy_zasilone[0][2]

    # G-OZE-PF (V12K-051): regulacja falownika OZE dla kanonicznego PF (Q(U)/cosφ).
    # base_mva potrzebne przed budową PQSpec, aby przeliczyć limity/nachylenie na pu.
    base_mva = float(options.get("base_mva", 100.0))
    converter_control_by_node = _build_converter_control_by_node(snapshot, base_mva)

    def _converter(node_id: str) -> InverterControl | None:
        binding = converter_control_by_node.get(node_id)
        return None if binding is None else binding.control

    def _converter_p_mw(node_id: str) -> float | None:
        binding = converter_control_by_node.get(node_id)
        return None if binding is None else binding.p_mw

    def _converter_q_mvar(node_id: str) -> float | None:
        binding = converter_control_by_node.get(node_id)
        return None if binding is None else binding.q_mvar

    # Karta CV-4.1b (A3-04): granice mocy biernej (q_min_mvar/q_max_mvar) węzła PV —
    # `Node` (IR) nie niesie tych pól (tylko `voltage_magnitude`, ustawiony przez
    # `enm/mapping.py` z tej samej `meta.u_set_pu`), więc czytane są WPROST ze
    # snapshotu (te same klucze meta co `_build_converter_control_by_node` wyżej).
    # Brak/niekompletność jest tu BŁĘDEM KONSTRUKCJI (walidator ENM blokuje ten stan
    # wcześniej kodem `generators.voltage_control_incomplete` — jeśli assembler mimo
    # to dostał taki snapshot, np. bieg z pominięciem walidatora, odmowa jest jawna,
    # nie ciche podstawienie 0,0).
    pv_bounds_by_node: dict[str, tuple[float, float]] = {}
    for gen in snapshot.get("generators") or []:
        if not isinstance(gen, dict):
            continue
        meta_raw = gen.get("meta")
        meta: dict[str, Any] = meta_raw if isinstance(meta_raw, dict) else {}
        if str(meta.get("control_mode") or "").strip() != "REGULACJA_NAPIECIA":
            continue
        bus_ref = gen.get("bus_ref")
        if not isinstance(bus_ref, str) or not bus_ref.strip():
            continue
        qmin = _oze_opt_float(meta.get("q_min_mvar"))
        qmax = _oze_opt_float(meta.get("q_max_mvar"))
        if qmin is None or qmax is None or qmin >= qmax:
            raise ValueError(
                f"Generator '{gen.get('ref_id')}' w trybie regulacji napięcia nie ma "
                "kompletnych/spójnych granic mocy biernej (q_min_mvar < q_max_mvar) — "
                "walidator ENM powinien odrzucić ten stan kodem "
                "'generators.voltage_control_incomplete' przed uruchomieniem rozpływu."
            )
        pv_bounds_by_node[_graph_id_from_ref(bus_ref.strip())] = (qmin, qmax)

    pq_specs = [
        PQSpec(
            node_id=node_id,
            inverter_control=_converter(node_id),
            # Defekt B (przegląd 2026-08-01): WŁASNA moc regulowanego źródła jest
            # jawną wielkością wejściową kształtowania. Bez niej solver czytał moc
            # zadaną szyny — czyli moc ODBIORU na szynie prosumenckiej (a po
            # rozdzieleniu ZIP wręcz bazę odbiorową) — i z niej liczył moc bierną
            # falownika. Konwencja generatorowa (>0 = wstrzyk), przeciwna do
            # p_mw/q_mvar poniżej; None (brak regulacji) => pole nieużywane.
            inverter_p_mw=_converter_p_mw(node_id),
            inverter_q_mvar=_converter_q_mvar(node_id),
            # F9.8 WHITE BOX: `node.active_power`/`node.reactive_power` (built by
            # `enm.mapping`) use the GENERATION convention (positive = injection
            # into the bus; a pure load is negative — see mapping.py, pinned by
            # test_enm_mapping.py and consumed by analysis/boundary/identifier.py).
            # `PQSpec.p_mw`/`q_mvar` are consumed by
            # `power_flow_newton_internal.build_power_spec_v2`, which negates them
            # again expecting the LOAD convention (positive = consumption). This is
            # the single conversion point gen->load at the PQSpec construction
            # boundary; do NOT change the sign convention in mapping.py or in the
            # solver (both are correct/frozen on their own terms).
            p_mw=-float(node.active_power or 0.0),
            q_mvar=-float(node.reactive_power or 0.0),
            # ADR-011 (Z-ZIP-04): aggregated ZIP coefficients for the bus (None
            # => constant power). Solver reduces to classic PQ when None.
            zip_coeffs=node.zip_coeffs,
            # Defect D1 (audit 2026-08-01): the ZIP polynomial is built from the
            # bus LOADS, so it may only scale the load part. The remainder of the
            # bus power (generation) is constant. Same gen->load conversion point
            # as p_mw/q_mvar above; None (no ZIP bus) => whole bus power is the base.
            zip_base_p_mw=(
                None if node.zip_load_active_power is None else -float(node.zip_load_active_power)
            ),
            zip_base_q_mvar=(
                None
                if node.zip_load_reactive_power is None
                else -float(node.zip_load_reactive_power)
            ),
        )
        for node_id, node in sorted(graph.nodes.items())
        if node.node_type == NodeType.PQ and node_id != slack_node_id
    ]

    # Karta CV-4.1b (A3-04): węzły PV (`enm/mapping.py` — generator w trybie
    # regulacji napięcia) — DOTĄD `pv=[]` zawsze, więc solver liczył je jak PQ
    # (napięcie NIE trzymane na nastawie). `u_pu`/`p_mw` z GRAFU (IR), nie ze
    # snapshotu: `node.voltage_magnitude` jest TĄ SAMĄ nastawą `meta.u_set_pu`,
    # którą `enm/mapping.py` już zwalidował przez konstrukcję `Node` (PV bez
    # `voltage_magnitude` nie istnieje — `Node.__post_init__` odmawia wcześniej).
    # Konwencja `p_mw` OBCIĄŻENIOWA jak `PQSpec.p_mw` (komentarz F9.8 wyżej;
    # `build_power_spec_v2` neguje oba tak samo).
    pv_specs: list[PVSpec] = []
    for node_id, node in sorted(graph.nodes.items()):
        if node.node_type != NodeType.PV:
            continue
        bounds = pv_bounds_by_node.get(node_id)
        if bounds is None:
            raise ValueError(
                f"Węzeł PV '{node_id}' nie ma granic mocy biernej w migawce — graf "
                "podany assemblerowi nie odpowiada migawce ENM (niespójne wejście)."
            )
        pv_specs.append(
            PVSpec(
                node_id=node_id,
                p_mw=-float(node.active_power or 0.0),
                u_pu=float(node.voltage_magnitude),
                q_min_mvar=bounds[0],
                q_max_mvar=bounds[1],
            )
        )

    # Znalezisko przy wdrożeniu A3-04 (KLASA NIE INSTANCJA — ten sam błąd, który
    # `_build_converter_control_by_node` już zakazuje "jedna charakterystyka na
    # węzeł" dla dwóch źródeł regulowanych, powstaje TU jako NOWA kombinacja: węzeł
    # PV (regulacja napięcia) niesie WŁASNĄ nastawę |U|, więc pętla PQSpec wyżej go
    # pomija — binding kształtowania falownika (cosφ/Q(U)/LFSM) INNEGO generatora
    # na TEJ SAMEJ szynie zostałby po cichu ZGUBIONY (obliczony, nigdy nieużyty),
    # zamiast jawnej odmowy. Przed CV-4.1b ta kolizja nie mogła zajść (PV nigdy nie
    # istniało), więc to kombinacja NOWA, wprowadzona przez ten węzeł PV — bramkowana
    # tu, w JEDYNYM miejscu, gdzie oba zbiory (węzły PV, węzły z bindingiem
    # kształtowania) są już policzone.
    for pv_spec in pv_specs:
        if pv_spec.node_id in converter_control_by_node:
            raise ValueError(
                f"Szyna węzła PV '{pv_spec.node_id}' ma dodatkowo generator z aktywną "
                "regulacją falownika (cosφ/Q(U)/statyzm P(f)) — węzeł PV niesie "
                "WYŁĄCZNIE własną nastawę napięcia, kontrakt rozpływu nie ma miejsca "
                "na drugą, niezależną charakterystykę regulacji na tym samym węźle."
            )

    options_solvera = PowerFlowOptions(
        tolerance=float(options.get("tolerance", 1e-8)),
        max_iter=int(options.get("max_iterations", options.get("max_iter", 30))),
        trace_level=str(options.get("trace_level", "full")),
    )
    # base_mva obliczone wyżej (przed PQSpec — potrzebne dla regulacji falownika OZE).
    # Phase 41 / CV-4.2b: opt-in rozszerzenia audytu 2 (zaczepy, statyzm, impedancja
    # transformatora blokowego) przychodzą od WOŁAJĄCEGO jako dane — assembler nie
    # czyta bazy; korekty idą na graf PRZED solverem.
    audit2_extensions = rozszerzenia_audit2
    audit2_applied: dict[str, Any] | None = None
    if audit2_extensions is not None:
        from solver_input.audit2_solver_adjuster import apply_audit2_to_network_model

        audit2_applied = apply_audit2_to_network_model(
            graph=graph, audit2_extensions=audit2_extensions
        )

    # D-06c: fixed shunt capacitor banks → existing solver shunt mechanism.
    # ENM ShuntCapacitor -> ShuntSpec(b_pu = Q_rated / S_base). Solver untouched.
    shunt_specs = _build_shunt_specs_from_snapshot(snapshot, base_mva)

    # ADR-011 (Z-ZIP-04): study frequency from the ENM header defaults
    # (drives the P(f)/Q(f) factor; at f0 the factor is 1.0).
    base_frequency_hz = _study_frequency_hz(snapshot)
    # Jedna wyspa zasilona = wejście na PEŁNYM grafie z pełnymi listami (tożsame
    # z wejściem sprzed karty K3b — parytet złotych hashy bit w bit; węzły wysp
    # niezasilonych solver sam pomija jako ``not_solved_nodes``). Kilka wysp
    # zasilonych = podgraf i listy WŁASNEJ wyspy (solver FROZEN i pętla regulatora
    # zaczepowego widzą wyłącznie tę wyspę — cudze węzły nie oddają NaN do
    # regulatora, cudze boczniki nie są zgłaszane jako nałożone).
    wyspy: list[WyspaRozplywu] = []
    for wyspa, zrodlo_ref, slack_wyspy in wyspy_zasilone:
        wezly = tuple(sorted(_graph_id_from_ref(szyna) for szyna in wyspa.szyny))
        if len(wyspy_zasilone) == 1:
            graf_wyspy = graph
            pq_wyspy, pv_wyspy, shunty_wyspy = pq_specs, pv_specs, shunt_specs
        else:
            zbior = set(wezly)
            graf_wyspy = graph.podgraf(wezly)
            pq_wyspy = [spec for spec in pq_specs if spec.node_id in zbior]
            pv_wyspy = [spec for spec in pv_specs if spec.node_id in zbior]
            shunty_wyspy = [spec for spec in shunt_specs if spec.node_id in zbior]
        wyspy.append(
            WyspaRozplywu(
                slack_node_id=slack_wyspy,
                zrodlo_ref=zrodlo_ref,
                szyny=tuple(wyspa.szyny),
                wezly=wezly,
                pf_input=PowerFlowInput(
                    graph=graf_wyspy,
                    base_mva=base_mva,
                    slack=SlackSpec(node_id=slack_wyspy, u_pu=1.0, angle_rad=0.0),
                    pq=pq_wyspy,
                    pv=pv_wyspy,
                    shunts=shunty_wyspy,
                    options=options_solvera,
                    base_frequency_hz=base_frequency_hz,
                    audit2_extensions=audit2_extensions,
                ),
            )
        )
    requested_solver_method = _normalize_power_flow_solver_method(
        options.get("solver_method") or options.get("method")
    )
    return WejscieRozplywu(
        graph=graph,
        pf_input=wyspy[0].pf_input,
        options=options_solvera,
        base_mva=base_mva,
        slack_node_id=slack_node_id,
        requested_solver_method=requested_solver_method,
        audit2_extensions=audit2_extensions,
        audit2_applied=audit2_applied,
        graph_nodes=graph_nodes,
        graph_branches=graph_branches,
        wyspy=tuple(wyspy),
        pq_specs=tuple(pq_specs),
        pv_specs=tuple(pv_specs),
    )


def zloz_wejscie_zwarcia(
    snapshot: dict[str, Any] | None,
    options: dict[str, Any],
    *,
    rozszerzenia_audit2: dict[str, Any] | None = None,
) -> WejscieZwarcia:
    """Złóż wejście zwarciowe (przeniesione 1:1 z ``canonical_analysis._execute_short_circuit``).

    ``rozszerzenia_audit2`` (CV-4.2b): jak w ``zloz_wejscie_rozplywu`` — dane od
    wołającego (uziemienie punktu neutralnego SN → Z0/Z1, impedancja transformatora
    blokowego), assembler nie otwiera bazy. ``None`` = bez korekt audytu 2.
    """
    snapshot = snapshot or {}
    enm = EnergyNetworkModel.model_validate(snapshot)
    graph = map_enm_to_network_graph(enm)
    graph_element_context = _build_snapshot_graph_element_context(snapshot)
    graph_nodes = graph_element_context.get("nodes", {})
    graph_branches = graph_element_context.get("branches", {})
    short_circuit_type = _short_circuit_type_from_options(options)

    # Phase 43 / CV-4.2b: opt-in rozszerzenia audytu 2 dla SC (uziemienie Z0/Z1,
    # impedancja transformatora blokowego) od WOŁAJĄCEGO jako dane — assembler nie
    # czyta bazy. Aplikowane przed build_zero_sequence_zbus.
    audit2_extensions_sc = rozszerzenia_audit2
    if audit2_extensions_sc is not None:
        from solver_input.audit2_solver_adjuster import apply_audit2_to_network_model

        apply_audit2_to_network_model(graph=graph, audit2_extensions=audit2_extensions_sc)

    # Karta P0.3b (docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.3, kontynuacja P0.3):
    # c per pasmo napięciowe węzła zwarcia (IEC 60909 Tab. 1) + scenariusz MIN
    # z korektą temperaturową R_θ na KOPII grafu. Reuse P0.3 1:1 — te same
    # moduły co ścieżka execution engine (application/solvers/short_circuit_binding.py):
    # ``network_model.core.voltage_factor.c_for_node`` i
    # ``application.solvers.lv_temperature_correction.build_min_scenario_graph``.
    # Zero duplikacji wzorów, solver FROZEN nietknięty.
    scenario_raw = str(options.get("scenario", "max")).strip().lower()
    if scenario_raw not in ("max", "min"):
        raise ValueError(f"Nieznany scenariusz zwarcia: {scenario_raw!r} (oczekiwano 'max'/'min')")
    scenario_c: Scenario = "MAX" if scenario_raw == "max" else "MIN"

    # Jawny c_factor w options = OVERRIDE płaski dla wszystkich węzłów (zachowanie
    # wsteczne dla istniejących payloadów). Brak c_factor = AUTO per węzeł z jego
    # własnego pasma napięciowego (patrz c_for_node w pętli poniżej).
    c_factor_explicit: Any = options.get("c_factor")
    c_factor_override = c_factor_explicit is not None

    tk_s = float(options.get("thermal_time_seconds", 1.0))

    # Scenariusz MIN: dekoracja WEJŚCIA solvera (kopia grafu z R_θ skorygowanym
    # dla gałęzi liniowych/kablowych) — solver FROZEN dostaje gotowy graf, bez
    # zmiany ani jednej linii jego kodu. Oryginalny `graph` (użyty do topologii
    # węzłów raportowalnych i do z0_bus) zostaje nietknięty.
    solve_graph = graph
    temperature_correction_notes: tuple[dict[str, Any], ...] = ()
    if scenario_c == "MIN":
        min_scenario_graph_result = build_min_scenario_graph(graph)
        solve_graph = min_scenario_graph_result.graph
        temperature_correction_notes = tuple(
            note.to_dict() for note in min_scenario_graph_result.notes
        )

    # CV-4.3 K3b: wyspy bez impedancji do odniesienia (kwalifikacja z TOPOLOGII,
    # CI-PARYTET-5) NIE wchodzą do grafu solvera — ich blok Y-bus jest osobliwy
    # (żadnego bocznika do odniesienia), więc odwrócenie pełnej macierzy wywracało
    # cały bieg (pomiar: 8 wpisów złotych „Y-bus is singular" — G04/09, G05/09)
    # albo oddawało szum. Wiersz takiego węzła buduje wykonawca bez solvera
    # (``_oznacz_wiersz_bez_odniesienia``). Podgraf dzieli obiekty elementów z
    # ``solve_graph`` (bez kopii); ``graph`` (topologia raportowalna) nietknięty.
    wezly_bez_odniesienia = wezly_bez_impedancji_do_odniesienia(solve_graph)
    if wezly_bez_odniesienia:
        solve_graph = solve_graph.podgraf(
            wezel for wezel in solve_graph.nodes if wezel not in wezly_bez_odniesienia
        )

    # Z0 w porządku węzłów grafu SOLVERA (ten sam ``AdmittanceMatrixBuilder``):
    # impedancje składowej zerowej pochodzą z pól ENM, więc dla grafu bez wysp
    # pływających macierz jest tożsama z liczoną dotąd z ``graph``.
    z0_bus = (
        build_zero_sequence_zbus(enm, solve_graph)
        if _short_circuit_requires_z0(short_circuit_type)
        else None
    )

    reportable_fault_node_ids = [
        node_id
        for node_id in sorted(graph.nodes.keys())
        if not graph_nodes.get(node_id, {}).get("skip_short_circuit_target", False)
    ]

    # Karta C6-PERSIST: lokalizacja zwarcia ze scenariusza HONOROWANA. Brak
    # `location` w opcjach = zachowanie bez zmian (wszystkie węzły raportowalne,
    # parytet z biegiem bez scenariusza). `location_type` BUS/NODE zawęża zbiór
    # do JEDNEGO wskazanego węzła (parytet fizyki z biegiem bez lokalizacji —
    # ten sam solver, ten sam c_factor/tk_s, tylko inny podzbiór węzłów).
    # BRANCH/BRANCH_POINT to JAWNA ODMOWA: adapter obliczeniowy liczy zwarcie
    # wyłącznie w węźle grafu, a punkt pośredni na gałęzi wymagałby rozdzielenia
    # jej na dwie impedancje w miejscu zwarcia (assembler), którego solver
    # FROZEN nie ma — druga linia obrony, gdyby ktoś ominął eligibility
    # (`FaultScenarioService.check_scenario_eligibility` blokuje to samo przed
    # utworzeniem biegu, tym samym kodem gotowości — jedno źródło komunikatu).
    location_raw = options.get("location")
    if location_raw is not None:
        if not isinstance(location_raw, dict):
            raise ValueError("Lokalizacja zwarcia w opcjach biegu musi być słownikiem")
        location_type = location_raw.get("location_type")
        element_ref = str(location_raw.get("element_ref") or "")
        if location_type in ("BUS", "NODE"):
            if not element_ref:
                raise ValueError(
                    "Lokalizacja zwarcia scenariusza nie wskazuje elementu (element_ref)"
                )
            target_node_id = _graph_id_from_ref(element_ref)
            if target_node_id not in graph.nodes:
                raise ValueError(
                    f"Węzeł zwarcia {element_ref!r} ze scenariusza nie istnieje w modelu sieci"
                )
            if target_node_id not in reportable_fault_node_ids:
                raise ValueError(
                    f"Węzeł zwarcia {element_ref!r} jest węzłem pomocniczym "
                    "(skip_short_circuit_target) — nie jest raportowalnym punktem zwarcia"
                )
            reportable_fault_node_ids = [target_node_id]
        elif location_type in ("BRANCH", "BRANCH_POINT"):
            spec = READINESS_CODES["fault.location_on_branch_requires_assembler"]
            raise ValueError(
                f"{spec.message_pl} (element_ref={element_ref!r}, "
                f"location_type={location_type!r})"
            )
        else:
            raise ValueError(f"Nieznany typ lokalizacji zwarcia: {location_type!r}")
    return WejscieZwarcia(
        enm=enm,
        graph=graph,
        solve_graph=solve_graph,
        z0_bus=z0_bus,
        short_circuit_type=short_circuit_type,
        scenario_c=scenario_c,
        c_factor_explicit=c_factor_explicit,
        c_factor_override=c_factor_override,
        tk_s=tk_s,
        reportable_fault_node_ids=reportable_fault_node_ids,
        temperature_correction_notes=temperature_correction_notes,
        graph_nodes=graph_nodes,
        graph_branches=graph_branches,
        wezly_bez_odniesienia=wezly_bez_odniesienia,
        zrodla_sieciowe_trace=tuple(build_grid_source_trace(enm)),
    )
