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
from functools import partial
from typing import Any
from uuid import NAMESPACE_DNS, uuid5

from application.solvers.lv_temperature_correction import build_min_scenario_graph
from domain.canonical_operations import READINESS_CODES
from enm.mapping import (
    build_grid_source_trace,
    build_zero_sequence_zbus,
    map_enm_to_network_graph,
)
from enm.models import (
    FAZY_ODBIORU_JEDNOFAZOWEGO,
    FAZY_ODBIORU_MIEDZYFAZOWEGO,
    Cable,
    EnergyNetworkModel,
    OverheadLine,
    Transformer,
    liczba_torow,
)
from enm.topology import Wyspa, derive
from enm.zero_sequence_transformer import ZeroSeqConnection, build_transformer_zero_seq_model
from network_model.core.autorytet_wyniku_zwarciowego import ProweniencjaWynikuZwarciowego
from network_model.core.branch import LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import NodeType
from network_model.core.topologia import przeglad_wszerz
from network_model.core.voltage_factor import Scenario
from network_model.core.ybus import S_BASE_MVA
from network_model.pochodne import (
    impedancja_odniesiona_do_napiecia_ohm,
    impedancja_wlasna_ohm,
    impedancja_wzajemna_ohm,
    impedancja_z_jednostek_wzglednych_ohm,
    moc_bazowa_fazy_mva,
    napiecie_fazowe_v,
)
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
from network_model.solvers.power_flow_unbalanced import (
    UnbalancedBranchSpec,
    UnbalancedLoadSpec,
    UnbalancedNetworkInput,
)
from network_model.solvers.power_flow_zip import zip_coeffs_from_materialized_params
from network_model.solvers.short_circuit_core import ShortCircuitType
from network_model.whitebox.tracer import WhiteBoxStep, WhiteBoxTracer


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


def czestotliwosc_studium_hz(snapshot: dict[str, Any] | None) -> float:
    """ADR-011 (Z-ZIP-04): system frequency for the study, from the ENM header
    defaults (ENMDefaults.frequency_hz). Falls back to 50.0 Hz.

    Karta W3-F (§0.6, 2026-09-09): odblokowana z prywatnej (`_study_frequency_hz`
    -> `czestotliwosc_studium_hz`) — jedyne miejsce prawdy o częstotliwości
    studium z surowej migawki ENM, reużywane przez `enm/domain_operations.py`
    i `enm/catalog_completion.py` przy materializacji susceptancji kabla
    (B=2πfC), zamiast duplikować ten sam odczyt nagłówka w każdym module.
    """
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
    #: CV-4.3 K7: założenia biegu nazwane kodem gotowości (np. ``source.sk_min_missing``:
    #: scenariusz MIN bez S''_kQmin — Z_Q z danych MAX). Pusta krotka = bieg bez założeń.
    zalozenia: tuple[dict[str, Any], ...]
    #: PERF-SC-50 (2026-09-09, W-4 krok 3): czy bieg liczy wkłady gałęziowe (iloczyn
    #: źródło×gałąź per punkt zwarcia, 92 % bajtów biegu sieci 50 stacji) W BIEGU
    #: (``branch_contributions_mode: "in_run"`` albo scenariusz z ``include_branch_contributions``),
    #: czy NA ŻĄDANIE punktu (domyślnie: wiersz niesie flagę dostępności, treść liczy
    #: ``canonical_analysis.pobierz_rozplyw_biegu`` z tego samego wejścia i utrwala).
    wklady_w_biegu: bool
    #: Karta S-2 AUTORYTET: znaczniki pochodzenia ``k_sc`` WSZYSTKICH źródeł
    #: falownikowych czynnych w ``graph`` (`ProweniencjaWynikuZwarciowego.z_grafu`)
    #: — WYPROWADZONE z grafu obliczeniowego BIEGU, nie z migawki dołączonej do
    #: żądania. Pusta krotka = sieć bez czynnych falowników (proweniencja
    #: miarodajna z definicji, wkład falownikowy nie wchodzi do równań). Zapisywane
    #: w ``raw_result.k_sc_znaczniki`` (`enm/canonical_analysis.py`) — stąd czyta je
    #: `application.autorytet_biegu_zwarciowego` przy odtwarzaniu proweniencji
    #: zapisanego biegu, bez ponownego przechodzenia po modelu.
    k_sc_znaczniki: tuple[str, ...]


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


def _nastawy_u_zrodel(snapshot: dict[str, Any]) -> dict[str, float]:
    """``ref_id`` źródła sieciowego → napięcie zadane szyny bilansującej [p.u.].

    Źródło bez ``u_set_pu`` (``None``) nie ma wpisu — assembler bierze wtedy 1,0 p.u.
    (napięcie znamionowe; jawne założenie modelowe ``Source.u_set_pu``). Wartość spoza
    pasma odrzuca walidator ENM (``sources.u_set_pu_out_of_range``) i operacja domenowa
    (``source.manual_equivalent_invalid``) — assembler nie poprawia danych po cichu.
    """
    wynik: dict[str, float] = {}
    for zrodlo in snapshot.get("sources") or []:
        if not isinstance(zrodlo, dict):
            continue
        wartosc = zrodlo.get("u_set_pu")
        if isinstance(wartosc, int | float) and not isinstance(wartosc, bool):
            wynik[str(zrodlo.get("ref_id"))] = float(wartosc)
    return wynik


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
    nastawa_u_zrodla = _nastawy_u_zrodel(snapshot)

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
    base_frequency_hz = czestotliwosc_studium_hz(snapshot)
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
                    slack=SlackSpec(
                        node_id=slack_wyspy,
                        u_pu=nastawa_u_zrodla.get(zrodlo_ref, 1.0),
                        angle_rad=0.0,
                    ),
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
    from solver_input.audit2_solver_adjuster import apply_audit2_to_network_model

    if audit2_extensions_sc is not None:
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

    # PERF-SC-50: tryb wkładów gałęziowych. Domyślnie NA ŻĄDANIE (klucz nieobecny —
    # istniejące payloady i ich `input_hash` bez zmian); `in_run` jawnie z opcji albo z
    # konfiguracji scenariusza zwarciowego (`config.include_branch_contributions`, do tej
    # karty flaga zapisywana, lecz nieczytana — fantom sterowania), nigdy z domysłu.
    tryb_wkladow_surowy = options.get("branch_contributions_mode")
    if tryb_wkladow_surowy is None:
        konfiguracja = options.get("config")
        z_konfiguracji = (
            isinstance(konfiguracja, dict)
            and konfiguracja.get("include_branch_contributions") is True
        )
        tryb_wkladow = "in_run" if z_konfiguracji else "on_demand"
    else:
        tryb_wkladow = str(tryb_wkladow_surowy).strip().lower()
    if tryb_wkladow not in ("on_demand", "in_run"):
        raise ValueError(
            f"Nieznany tryb wkładów gałęziowych: {tryb_wkladow_surowy!r} "
            "(oczekiwano 'on_demand'/'in_run')"
        )
    wklady_w_biegu = tryb_wkladow == "in_run"

    # Scenariusz MIN: dekoracja WEJŚCIA solvera (kopia grafu z R_θ skorygowanym
    # dla gałęzi liniowych/kablowych) — solver FROZEN dostaje gotowy graf, bez
    # zmiany ani jednej linii jego kodu. Oryginalny `graph` (użyty do topologii
    # węzłów raportowalnych i do z0_bus) zostaje nietknięty.
    solve_graph = graph
    temperature_correction_notes: tuple[dict[str, Any], ...] = ()
    if scenario_c == "MIN":
        # CV-4.3 K7: graf solvera dla MIN dostaje Z_Qmin źródeł sieciowych (c_min·U²/S''_kQmin,
        # IEC 60909-0:2016 eq. 6) — albo Z_Qmax z JAWNYM założeniem, gdy S''_kQmin nie ma
        # (``zalozenia`` niżej). ``graph`` (topologia raportowalna, MAX) bez zmian; te same
        # rozszerzenia audytu 2 co dla grafu MAX, bo solver widzi WYŁĄCZNIE ``solve_graph``.
        graf_min = map_enm_to_network_graph(enm, scenario="MIN")
        if audit2_extensions_sc is not None:
            apply_audit2_to_network_model(graph=graf_min, audit2_extensions=audit2_extensions_sc)
        min_scenario_graph_result = build_min_scenario_graph(graf_min)
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
        build_zero_sequence_zbus(enm, solve_graph, scenario=scenario_c)
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
    zrodla_sieciowe_trace = tuple(build_grid_source_trace(enm, scenario_c))
    # Karta S-2 AUTORYTET (dyrektywa właściciela 2026-09-16: „K_sc pozostaje
    # DEFAULT_FORBIDDEN"): ślad WHITE BOX założeń k_sc (`graph.
    # k_sc_assumptions_trace`, wypełniony PRZEZ `map_enm_to_network_graph` w
    # `_add_generator_sc_sources` — obliczony RAZ, tu wyłącznie ODCZYTANY, żeby
    # nie duplikować predykatu „które źródło ma niemiarodajną deklarację") dołącza
    # do `zalozenia` DOKŁADNIE tym samym wzorcem co `source.sk_min_missing`
    # powyżej — jeden mechanizm założeń biegu, nie dwa równoległe.
    k_sc_zalozenia = tuple(
        {
            "code": "inverter.k_sc_default_forbidden",
            "element_ref": wpis["inputs"]["generator_ref"],
            "message_pl": wpis["notes"],
            "scenariusz": scenario_c,
        }
        for wpis in graph.k_sc_assumptions_trace
    )
    zalozenia = (
        tuple(
            {
                "code": wpis["zalozenie"],
                "element_ref": wpis["ref_id"],
                "message_pl": wpis["zalozenie_opis"],
                "scenariusz": scenario_c,
            }
            for wpis in zrodla_sieciowe_trace
            if wpis.get("zalozenie")
        )
        + k_sc_zalozenia
    )
    # Proweniencja k_sc WYPROWADZONA z grafu obliczeniowego TEGO biegu (nie z
    # migawki dołączonej do żądania) — `network_model.core.
    # autorytet_wyniku_zwarciowego.ProweniencjaWynikuZwarciowego.z_grafu`.
    # Zapisywana na artefakcie biegu (`enm/canonical_analysis.py`), żeby warstwa
    # autorytetu mogła ją odtworzyć bez ponownego przechodzenia po modelu.
    k_sc_znaczniki = ProweniencjaWynikuZwarciowego.z_grafu(graph).znaczniki_k_sc
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
        zrodla_sieciowe_trace=zrodla_sieciowe_trace,
        zalozenia=zalozenia,
        wklady_w_biegu=wklady_w_biegu,
        k_sc_znaczniki=k_sc_znaczniki,
    )


# ---------------------------------------------------------------------------
# Rozpływ niesymetryczny (karta W5-D, §1 p. 7 karty W5; decyzja F-1) — diagnoza
# zdolności solvera FROZEN ``power_flow_unbalanced.py`` i złożenie jego wejścia.
#
# Solver BFS (Shirmohammadi/Kersting) zna: JEDNĄ szynę bilansującą na wyspę, sieć
# PROMIENIOWĄ, odbiory stałomocowe per faza w GWIEŹDZIE (faza–przewód neutralny)
# i gałęzie jako (impedancja własna, impedancja wzajemna) na WSPÓLNEJ bazie
# napięcia. Wszystko, czego nie zna, jest tu ODMOWĄ NAZWANĄ (kod kanonu +
# elementy) albo ZAŁOŻENIEM NAZWANYM (kod WARNING w ``zalozenia`` wyniku) —
# nigdy cichym przybliżeniem ani wartością domyślną fizyki.
#
# BAZA PER FAZA (pomiar 2026-09-16, ``scratchpad/w5d_baza_solvera.py``): solver
# liczy ``s_pu = p_mw_a / base_mva`` i ``z_pu = Z·base_mva/base_kv²`` na
# WIELKOŚCIACH JEDNEJ FAZY, więc bazą podaną solverowi musi być baza jednej
# fazy — S_base/3 i U_LL/√3 (Z_base = U_LL²/S_base pozostaje wspólna). Baza
# trójfazowa (S_base, U_LL) — konwencja starego dialektu i testu golden IEEE 34
# — daje spadki napięcia i straty DOKŁADNIE 3× za małe (0,000341 vs 0,001023 pu
# na sieci 2-szynowej 15 kV, 1 MW; rachunek fizyczny (P·R+Q·X)/U² = 0,001022).
# ---------------------------------------------------------------------------

KOD_NIESYMETRIA_NIERADIALNA = "power_flow.unbalanced_requires_radial"
KOD_NIESYMETRIA_FAZY_ODBIORU = "power_flow.unbalanced_load_phases_unsupported"
KOD_NIESYMETRIA_ELEMENT = "power_flow.unbalanced_element_unsupported"
KOD_NIESYMETRIA_BRAK_DROGI_ZEROWEJ = "power_flow.unbalanced_no_zero_sequence_path"
KOD_NIESYMETRIA_BRAK_Z0_GALEZI = "branch.zero_sequence_missing"
KOD_NIESYMETRIA_BRAK_GRUPY_TR = "transformer.vector_group_missing"
KOD_ZALOZENIE_ADMITANCJA_POPRZECZNA = "power_flow.unbalanced_shunt_admittance_omitted"
KOD_ZALOZENIE_GALAZ_MAGNESUJACA = "power_flow.unbalanced_magnetising_branch_omitted"
KOD_ZALOZENIE_TR_SZEREGOWY = "power_flow.unbalanced_transformer_series_model"
#: Solver FROZEN liczy straty gałęzi z impedancji WŁASNEJ (|I|²·Z_s), bez wyrazu
#: wzajemnego — przy Z_m ≠ 0 (Z0 ≠ Z1) straty są przybliżone (pomiar: R_s/R_1 = 5/3
#: dla katalogowego Z0 = 3·Z1 na gałęzi z realnym I0); napięcia i prądy bez zmian.
KOD_ZALOZENIE_STRATY_Z_IMPEDANCJI_WLASNEJ = "power_flow.unbalanced_losses_self_impedance"
#: Droga I0 odbioru faza–N zamyka się w uziemionym uzwojeniu transformatora (Dyn, YNd…);
#: solver szeregowy przepuszcza I0 dalej w górę (artefakt) — krawędzie powyżej punktu
#: zamknięcia dostają Z_m := 0 (bez sprzężenia faz), założenie NAZWANE per krawędź.
KOD_ZALOZENIE_DROGA_ZEROWA_ZAMKNIETA = "power_flow.unbalanced_zero_sequence_confined"
#: Droga I0 odbioru faza–N bez transformatora zamykającego — powrót przez punkt neutralny
#: źródła sieciowego (źródło idealne, uziemione w modelu BFS), założenie NAZWANE.
KOD_ZALOZENIE_DROGA_ZEROWA_ZRODLO = "power_flow.unbalanced_zero_sequence_via_source"

#: Kolejność odmów w diagnozie = kolejność zgłaszania (pierwsza odmowa niesie kod
#: wyjątku ``OdmowaWejsciaRozplywu``; komunikat wymienia WSZYSTKIE).
_KOLEJNOSC_ODMOW_NIESYMETRII: tuple[str, ...] = (
    KOD_NIESYMETRIA_NIERADIALNA,
    KOD_NIESYMETRIA_BRAK_Z0_GALEZI,
    KOD_NIESYMETRIA_BRAK_GRUPY_TR,
    KOD_NIESYMETRIA_FAZY_ODBIORU,
    KOD_NIESYMETRIA_BRAK_DROGI_ZEROWEJ,
    KOD_NIESYMETRIA_ELEMENT,
)

_FAZY: tuple[str, str, str] = ("A", "B", "C")

#: Nastawy solvera BFS rozpływu niesymetrycznego (NIE dane wejściowe sieci): baza mocy
#: systemowej, tolerancja |ΔV| między iteracjami i limit iteracji — wartości JAWNE,
#: echo w kontrakcie wyniku (`ResultSetPowerFlowUnbalancedV1.tolerance/max_iterations`).
OPCJE_ROZPLYWU_NIESYMETRYCZNEGO: dict[str, float | int] = {
    "base_mva": 100.0,
    "tolerance": 1e-6,
    "max_iterations": 50,
}


def _opcje_rozplywu_niesymetrycznego(options: dict[str, Any]) -> tuple[float, float, int]:
    """Nastawy biegu: opcje przebiegu nadpisują ``OPCJE_ROZPLYWU_NIESYMETRYCZNEGO``
    (alias ``max_iter`` jak w rozpływie NR). Zwraca (base_mva, tolerance, max_iterations)."""
    opcje: dict[str, Any] = dict(OPCJE_ROZPLYWU_NIESYMETRYCZNEGO)
    for klucz in ("base_mva", "tolerance", "max_iterations"):
        if klucz in options:
            opcje[klucz] = options[klucz]
    if "max_iterations" not in options and "max_iter" in options:
        opcje["max_iterations"] = options["max_iter"]
    return float(opcje["base_mva"]), float(opcje["tolerance"]), int(opcje["max_iterations"])


@dataclass(frozen=True)
class OdmowaNiesymetrii:
    """Jedna odmowa nazwana diagnozy (kod kanonu + elementy + opis PL)."""

    kod: str
    elementy: tuple[str, ...]
    opis: str

    def to_dict(self) -> dict[str, Any]:
        return {"kod": self.kod, "elementy": list(self.elementy), "opis": self.opis}


@dataclass(frozen=True)
class DrogaZerowa:
    """Droga składowej zerowej odbiorów jednofazowych (faza–N) w wyspach zasilonych.

    Prąd powrotny odbioru faza–N płynie od szyny odbioru w górę (ku szynie bilansującej)
    i zamyka się w PIERWSZYM transformatorze z uziemionym uzwojeniem po stronie odbioru
    (Dyn, YNd, YNyn z jedną stroną uziemioną — ``enm/zero_sequence_transformer``), a bez
    takiego transformatora — w punkcie neutralnym źródła sieciowego. Transformator bez
    tej drogi (Yy/Dd nieuziemione, uziemienie po stronie zasilającej) przerywa obwód =
    odmowa nazwana. Solver FROZEN (BFS, gałąź = macierz 3×3 szeregowa) NIE odwzorowuje
    izolacji I0 przez trójkąt: powyżej punktu zamknięcia I0 płynie dalej jako artefakt
    modelu — te krawędzie dostają Z_m := 0 (bez sprzężenia faz) z założeniem nazwanym.
    Krawędź, którą nie płynie żaden realny I0 (odbiory symetryczne), nie potrzebuje Z0:
    spadek = (Z_s − Z_m)·I + 3·Z_m·I0 = Z1·I przy I0 ≡ 0 — tożsamość, nie podstawienie.
    """

    #: Transformatory przerywające drogę I0 (odmowa), posortowane.
    bez_drogi: tuple[str, ...]
    #: Krawędzie (gałęzie, łączniki, transformatory), którymi płynie REALNY I0 —
    #: tylko one potrzebują Z0 (brak R0/X0 gdzie indziej nie blokuje biegu).
    z_realnym_i0: frozenset[str]
    #: Krawędzie powyżej punktu zamknięcia (artefakt I0 modelu szeregowego).
    artefakt: frozenset[str]
    #: (odbiór, transformator zamykający drogę I0), posortowane.
    zamkniecia_w_transformatorach: tuple[tuple[str, str], ...]
    #: (odbiór, źródło sieciowe) — droga zamknięta w punkcie neutralnym źródła.
    zamkniecia_w_zrodlach: tuple[tuple[str, str], ...]


def _sasiedzi_posortowani(
    sasiedzi: dict[str, list[tuple[str, str]]], szyna: str
) -> list[tuple[str, str]]:
    """Pary (krawędź, sąsiad) szyny w porządku (sąsiad, krawędź) — deterministyczny
    wybór rodzica w przeglądzie wszerz jądra topologii."""
    return [(ref, v) for v, ref in sorted(sasiedzi.get(szyna, []))]


def _droga_zerowa(enm: EnergyNetworkModel, wyspy: tuple[Wyspa, ...]) -> DrogaZerowa:
    """Wędrówka od każdego odbioru faza–N ku szynie bilansującej wyspy (drzewo BFS od
    slacka po krawędziach ``_krawedzie_wyspy`` — TEN SAM zbiór krawędzi, z którego
    ``enm/topology.derive`` buduje wyspę). Transformator bez grupy połączeń kończy
    wędrówkę bez rozstrzygnięcia (osobna odmowa ``transformer.vector_group_missing``)."""
    szyna_zrodla = {s.ref_id: s.bus_ref for s in enm.sources}
    galezie = {g.ref_id: g for g in enm.branches}
    trafa = {t.ref_id: t for t in enm.transformers}
    bez_drogi: set[str] = set()
    realne: set[str] = set()
    artefakt: set[str] = set()
    zamkniecia_tr: set[tuple[str, str]] = set()
    zamkniecia_zr: set[tuple[str, str]] = set()
    for wyspa in wyspy:
        szyny = frozenset(wyspa.szyny)
        zrodlo_ref = wyspa.zrodla_sieciowe[0]
        slack = szyna_zrodla.get(zrodlo_ref)
        if slack is None or slack not in szyny:
            continue
        sasiedzi: dict[str, list[tuple[str, str]]] = {}
        for ref in _krawedzie_wyspy(enm, szyny):
            if ref in galezie:
                a, b = galezie[ref].from_bus_ref, galezie[ref].to_bus_ref
            else:
                a, b = trafa[ref].hv_bus_ref, trafa[ref].lv_bus_ref
            sasiedzi.setdefault(a, []).append((b, ref))
            sasiedzi.setdefault(b, []).append((a, ref))
        # Drzewo od szyny bilansującej — jądro topologii (`network_model/core/topologia`),
        # kolejność sąsiadów po (sąsiad, krawędź): deterministyczny wybór rodzica.
        drzewo = przeglad_wszerz(slack, partial(_sasiedzi_posortowani, sasiedzi))
        rodzic = {szyna: (para[1], para[0]) for szyna, para in drzewo.items() if para is not None}
        for ld in sorted(enm.loads, key=lambda ld: ld.ref_id):
            if ld.bus_ref not in szyny or ld.phases not in FAZY_ODBIORU_JEDNOFAZOWEGO:
                continue
            szyna = ld.bus_ref
            droga: list[str] = []
            zamknieta_w: str | None = None
            przerwana = False
            while szyna != slack and szyna in rodzic:
                gora, ref = rodzic[szyna]
                trafo = trafa.get(ref)
                if trafo is not None:
                    if not trafo.vector_group:
                        przerwana = True
                        break
                    model = build_transformer_zero_seq_model(trafo)
                    strona_odbioru_lv = szyna == trafo.lv_bus_ref
                    zamyka = (
                        model.connection is ZeroSeqConnection.LV_SHUNT_GROUND and strona_odbioru_lv
                    ) or (
                        model.connection is ZeroSeqConnection.HV_SHUNT_GROUND
                        and not strona_odbioru_lv
                    )
                    if zamyka:
                        droga.append(ref)
                        zamknieta_w = ref
                        szyna = gora
                        break
                    if model.connection is not ZeroSeqConnection.SERIES_THROUGH:
                        bez_drogi.add(trafo.ref_id)
                        przerwana = True
                        break
                droga.append(ref)
                szyna = gora
            realne.update(droga)
            if przerwana:
                continue
            if zamknieta_w is not None:
                zamkniecia_tr.add((ld.ref_id, zamknieta_w))
                while szyna != slack and szyna in rodzic:
                    gora, ref = rodzic[szyna]
                    artefakt.add(ref)
                    szyna = gora
            elif szyna == slack:
                zamkniecia_zr.add((ld.ref_id, zrodlo_ref))
    artefakt -= realne
    return DrogaZerowa(
        bez_drogi=tuple(sorted(bez_drogi)),
        z_realnym_i0=frozenset(realne),
        artefakt=frozenset(artefakt),
        zamkniecia_w_transformatorach=tuple(sorted(zamkniecia_tr)),
        zamkniecia_w_zrodlach=tuple(sorted(zamkniecia_zr)),
    )


@dataclass(frozen=True)
class DiagnozaNiesymetrii:
    """Wynik diagnozy zdolności rozpływu niesymetrycznego dla wysp ZASILONYCH.

    ``odmowy`` w kolejności ``_KOLEJNOSC_ODMOW_NIESYMETRII``; pusta krotka =
    wejście da się złożyć. ``wyspy_zasilone`` = szyny wysp z jednym źródłem
    sieciowym (``enm/topology.derive`` — TEN SAM widok, z którego assembler
    przydziela szyny bilansujące: predykaty parami). ``droga_zerowa`` = wynik
    wędrówki I0 odbiorów faza–N, z którego assembler bierze zbiór krawędzi z Z0.
    """

    odmowy: tuple[OdmowaNiesymetrii, ...]
    wyspy_zasilone: tuple[tuple[str, ...], ...]
    droga_zerowa: DrogaZerowa

    @property
    def blokuje(self) -> bool:
        return bool(self.odmowy)


def _wyspy_zasilone_enm(enm: EnergyNetworkModel) -> tuple[Wyspa, ...]:
    return tuple(w for w in derive(enm).wyspy if w.zrodla_sieciowe)


def _krawedzie_wyspy(enm: EnergyNetworkModel, szyny: frozenset[str]) -> list[str]:
    """``ref_id`` krawędzi wyspy w ruchu: gałęzie zamknięte + transformatory o OBU
    końcach w wyspie — TEN SAM zbiór krawędzi, z którego ``enm/topology.derive``
    buduje wyspę i ``enm/mapping`` graf IR (łącznik otwarty nie jest krawędzią)."""
    krawedzie: list[str] = []
    for galaz in sorted(enm.branches, key=lambda g: g.ref_id):
        if galaz.status != "closed":
            continue
        if galaz.from_bus_ref in szyny and galaz.to_bus_ref in szyny:
            krawedzie.append(galaz.ref_id)
    for trafo in sorted(enm.transformers, key=lambda t: t.ref_id):
        if trafo.hv_bus_ref in szyny and trafo.lv_bus_ref in szyny:
            krawedzie.append(trafo.ref_id)
    return krawedzie


def _zaczep_poza_znamionowym(trafo: Transformer) -> bool:
    """Przekładnia inna niż znamionowa (solver BFS nie ma zaczepu w kontrakcie):
    ``tap_position`` ≠ 0 albo kanoniczny ``tap_changer`` poza pozycją neutralną lub
    w regulacji automatycznej (pętla OLTC zmieniałaby przekładnię w biegu)."""
    if trafo.tap_position not in (None, 0):
        return True
    tc = trafo.tap_changer
    if tc is None or tc.regulation_type == "NONE":
        return False
    if tc.current_position != tc.neutral_position:
        return True
    return tc.control_mode == "AUTOMATIC"


def diagnoza_niesymetrii(enm: EnergyNetworkModel) -> DiagnozaNiesymetrii:
    """JEDYNY predykat zdolności rozpływu niesymetrycznego (gotowość + assembler).

    Czyta go bramka gotowości „Asymetria" (``application/calculation_readiness/
    service.py::_check_asymmetry``) i ``zloz_wejscie_rozplywu_niesymetrycznego`` —
    jeden warunek, jeden kod, dwa miejsca odczytu (KLASA NIE INSTANCJA).
    Zakres: WYŁĄCZNIE wyspy zasilone (element w wyspie bez źródła nie wchodzi do
    solvera, więc nie może niczego blokować — jego szyny zostają nierozwiązane).
    """
    wyspy = _wyspy_zasilone_enm(enm)
    szyny_zasilone: set[str] = set()
    for wyspa in wyspy:
        szyny_zasilone.update(wyspa.szyny)

    nieradialne: list[str] = []
    for wyspa in wyspy:
        szyny = frozenset(wyspa.szyny)
        krawedzie = _krawedzie_wyspy(enm, szyny)
        if len(krawedzie) > len(szyny) - 1:
            nieradialne.extend(krawedzie)
    droga_zerowa = _droga_zerowa(enm, wyspy)
    # Z0 jest potrzebne WYŁĄCZNIE krawędziom z realnym I0 (droga odbioru faza–N do
    # punktu zamknięcia) — gałąź, którą I0 nie płynie, nie wnosi Z0 do równań.
    bez_z0: list[str] = []
    for galaz in sorted(enm.branches, key=lambda g: g.ref_id):
        if not isinstance(galaz, Cable | OverheadLine) or galaz.status != "closed":
            continue
        if galaz.ref_id not in droga_zerowa.z_realnym_i0:
            continue
        if galaz.r0_ohm_per_km is None or galaz.x0_ohm_per_km is None:
            bez_z0.append(galaz.ref_id)
    transformatory_wysp = [
        trafo
        for trafo in sorted(enm.transformers, key=lambda t: t.ref_id)
        if trafo.hv_bus_ref in szyny_zasilone and trafo.lv_bus_ref in szyny_zasilone
    ]
    bez_grupy = [t.ref_id for t in transformatory_wysp if not t.vector_group]
    miedzyfazowe = [
        ld.ref_id
        for ld in sorted(enm.loads, key=lambda ld: ld.ref_id)
        if ld.bus_ref in szyny_zasilone and ld.phases in FAZY_ODBIORU_MIEDZYFAZOWEGO
    ]
    # Droga składowej zerowej: transformator NA DRODZE odbioru faza–N ku szynie
    # bilansującej bez uziemionego uzwojenia po stronie odbioru i bez przejścia I0
    # (Yy/Dd nieuziemione, uziemienie po stronie zasilającej) — prąd powrotny nie ma
    # obwodu. Transformator poza tą drogą (np. GPZ Yd11 powyżej stacji Dyn11, w której
    # I0 odbioru nN już się zamknął) NIE blokuje — patrz ``DrogaZerowa``.
    bez_drogi_zerowej: list[str] = list(droga_zerowa.bez_drogi)
    bez_reprezentacji: list[tuple[str, str]] = []
    for gen in sorted(enm.generators, key=lambda g: g.ref_id):
        if gen.bus_ref not in szyny_zasilone:
            continue
        meta = gen.meta or {}
        if str(meta.get("control_mode") or "").strip() == "REGULACJA_NAPIECIA":
            bez_reprezentacji.append((gen.ref_id, "węzeł regulacji napięcia (PV)"))
    # Regulacja falownika: TEN SAM predykat aktywności co assembler rozpływu NR
    # (`_build_converter_control_by_node`); baza mocy nie wpływa na to, CZY regulacja
    # jest aktywna, więc pomiar idzie na bazie systemowej.
    regulowane = _build_converter_control_by_node(enm.model_dump(mode="json"), S_BASE_MVA)
    if regulowane:
        for gen in sorted(enm.generators, key=lambda g: g.ref_id):
            if gen.bus_ref in szyny_zasilone and _graph_id_from_ref(gen.bus_ref) in regulowane:
                bez_reprezentacji.append((gen.ref_id, "regulacja falownika (cosφ/Q(U)/P(f))"))
    for bateria in sorted(enm.shunt_capacitors, key=lambda s: s.ref_id):
        if bateria.bus_ref in szyny_zasilone:
            bez_reprezentacji.append((bateria.ref_id, "bateria kondensatorów (bocznik)"))
    for ld in sorted(enm.loads, key=lambda ld: ld.ref_id):
        if ld.bus_ref not in szyny_zasilone:
            continue
        if zip_coeffs_from_materialized_params(ld.materialized_params) is not None:
            bez_reprezentacji.append((ld.ref_id, "odbiór ZIP (zależny od napięcia/częstotliwości)"))
    for trafo in transformatory_wysp:
        if _zaczep_poza_znamionowym(trafo):
            bez_reprezentacji.append((trafo.ref_id, "zaczep poza pozycją znamionową / OLTC"))
    widziane: set[str] = set()
    bez_reprezentacji_unikalne: list[tuple[str, str]] = []
    for ref, opis in bez_reprezentacji:
        if ref not in widziane:
            widziane.add(ref)
            bez_reprezentacji_unikalne.append((ref, opis))

    odmowy: list[OdmowaNiesymetrii] = []
    if nieradialne:
        odmowy.append(
            OdmowaNiesymetrii(
                KOD_NIESYMETRIA_NIERADIALNA,
                tuple(sorted(set(nieradialne))),
                "wyspa zasilona ma oczko (liczba gałęzi w ruchu > liczba szyn − 1)",
            )
        )
    if bez_z0:
        odmowy.append(
            OdmowaNiesymetrii(
                KOD_NIESYMETRIA_BRAK_Z0_GALEZI,
                tuple(bez_z0),
                "gałęzie bez składowej zerowej R0/X0 (bez podstawiania Z0 = Z1)",
            )
        )
    if bez_grupy:
        odmowy.append(
            OdmowaNiesymetrii(
                KOD_NIESYMETRIA_BRAK_GRUPY_TR,
                tuple(bez_grupy),
                "transformatory bez grupy połączeń (składowa zerowa nieznana)",
            )
        )
    if miedzyfazowe:
        odmowy.append(
            OdmowaNiesymetrii(
                KOD_NIESYMETRIA_FAZY_ODBIORU,
                tuple(miedzyfazowe),
                "odbiory międzyfazowe AB/BC/CA (solver zna odbiory faza–N)",
            )
        )
    if bez_drogi_zerowej:
        odmowy.append(
            OdmowaNiesymetrii(
                KOD_NIESYMETRIA_BRAK_DROGI_ZEROWEJ,
                tuple(bez_drogi_zerowej),
                "odbiór jednofazowy za transformatorem bez drogi składowej zerowej",
            )
        )
    if bez_reprezentacji_unikalne:
        odmowy.append(
            OdmowaNiesymetrii(
                KOD_NIESYMETRIA_ELEMENT,
                tuple(ref for ref, _ in bez_reprezentacji_unikalne),
                "; ".join(f"{ref}: {opis}" for ref, opis in bez_reprezentacji_unikalne),
            )
        )
    kolejnosc = {kod: i for i, kod in enumerate(_KOLEJNOSC_ODMOW_NIESYMETRII)}
    odmowy.sort(key=lambda o: kolejnosc[o.kod])
    return DiagnozaNiesymetrii(
        odmowy=tuple(odmowy),
        wyspy_zasilone=tuple(tuple(w.szyny) for w in wyspy),
        droga_zerowa=droga_zerowa,
    )


@dataclass(frozen=True)
class WyspaRozplywuNiesymetrycznego:
    """Wyspa zasilona jednym źródłem sieciowym — własne wejście solvera BFS."""

    slack_node_id: str
    zrodlo_ref: str
    szyny: tuple[str, ...]
    wezly: tuple[str, ...]
    #: Napięcie znamionowe międzyprzewodowe szyny bilansującej [kV] — baza odniesienia
    #: impedancji wyspy (solver dostaje U_LL/√3 i S_base/3: baza jednej fazy).
    base_kv_ll: float
    wejscie: UnbalancedNetworkInput


@dataclass(frozen=True)
class WejscieRozplywuNiesymetrycznego:
    """Wejście rozpływu niesymetrycznego złożone z migawki ENM i opcji biegu."""

    graph: NetworkGraph
    enm: EnergyNetworkModel
    #: Baza mocy TRÓJFAZOWA z opcji biegu [MVA] (jak w rozpływie NR).
    base_mva: float
    tolerance: float
    max_iterations: int
    wyspy: tuple[WyspaRozplywuNiesymetrycznego, ...]
    graph_nodes: dict[str, dict[str, Any]]
    graph_branches: dict[str, dict[str, Any]]
    #: Napięcie znamionowe międzyprzewodowe każdego węzła IR [kV] (do kV/A w wyniku).
    napiecia_znamionowe_kv: dict[str, float]
    #: Ślad WHITE BOX złożenia: wzór, dane, podstawienie, wynik (Z_s/Z_m, odbiory per faza).
    slad: tuple[dict[str, Any], ...]
    #: Założenia biegu nazwane kodem kanonu (WARNING): ``{"kod", "elementy", "opis"}``.
    zalozenia: tuple[dict[str, Any], ...]


def _fmt_z(value: complex) -> str:
    znak = "+" if value.imag >= 0 else "-"
    return f"{value.real:.6g} {znak} j{abs(value.imag):.6g}"


def _spec_galezi_z_sekwencji(
    *,
    tracer: WhiteBoxTracer,
    branch_id: str,
    ref_id: str,
    from_id: str,
    to_id: str,
    z1_ohm: complex,
    z0_ohm: complex | None,
    napiecie_wlasne_kv: float,
    base_kv_ll: float,
    zrodlo_z0: str,
    dane: dict[str, Any],
    powod_bez_z0: str = "",
) -> UnbalancedBranchSpec:
    """Impedancja własna/wzajemna gałęzi ze składowych (pochodne) odniesiona do bazy
    wyspy; ``z0_ohm=None`` = krawędź bez realnego I0 (``powod_bez_z0`` nazywa dlaczego:
    I0 ≡ 0 z topologii albo artefakt modelu szeregowego powyżej punktu zamknięcia),
    wtedy Z_m := 0 i Z_s := Z1 — tożsamość, nie podstawienie (spadek = (Z_s − Z_m)·I)."""
    z1_odn = impedancja_odniesiona_do_napiecia_ohm(z1_ohm, napiecie_wlasne_kv, base_kv_ll)
    if z0_ohm is None:
        z_s, z_m = z1_odn, 0j
        podstawienie = (
            f"brak drogi I0 ({powod_bez_z0}) ⇒ "
            f"Z_m := 0, Z_s := Z1 = {_fmt_z(z1_odn)} Ω @ {base_kv_ll:g} kV"
        )
    else:
        z0_odn = impedancja_odniesiona_do_napiecia_ohm(z0_ohm, napiecie_wlasne_kv, base_kv_ll)
        z_s = impedancja_wlasna_ohm(z0_odn, z1_odn)
        z_m = impedancja_wzajemna_ohm(z0_odn, z1_odn)
        podstawienie = (
            f"Z1 = {_fmt_z(z1_odn)} Ω, Z0 = {_fmt_z(z0_odn)} Ω (@ {base_kv_ll:g} kV, "
            f"z {napiecie_wlasne_kv:g} kV) ⇒ Z_s = ({_fmt_z(z0_odn)} + 2·({_fmt_z(z1_odn)}))/3 = "
            f"{_fmt_z(z_s)} Ω; Z_m = ({_fmt_z(z0_odn)} − ({_fmt_z(z1_odn)}))/3 = {_fmt_z(z_m)} Ω"
        )
    tracer.add(
        key=f"pf_unbalanced_branch[{ref_id}]",
        title=f"Gałąź {ref_id}: impedancja własna i wzajemna ze składowych symetrycznych",
        formula_latex=(
            r"Z' = Z\cdot\left(\frac{U_{odn}}{U_{wl}}\right)^2,\quad "
            r"Z_s = \frac{Z_0 + 2 Z_1}{3},\quad Z_m = \frac{Z_0 - Z_1}{3}"
        ),
        inputs={
            **dane,
            "z1_ohm": z1_ohm,
            "z0_ohm": z0_ohm,
            "zrodlo_z0": zrodlo_z0,
            "napiecie_wlasne_kv": napiecie_wlasne_kv,
            "base_kv_ll": base_kv_ll,
        },
        substitution=podstawienie,
        result={"z_self_ohm": z_s, "z_mutual_ohm": z_m},
    )
    return UnbalancedBranchSpec(
        branch_id=branch_id,
        from_bus_id=from_id,
        to_bus_id=to_id,
        r_self_ohm=z_s.real,
        x_self_ohm=z_s.imag,
        r_mutual_ohm=z_m.real,
        x_mutual_ohm=z_m.imag,
    )


def _moc_per_faza(p_mw: float, q_mvar: float, fazy: str | None) -> dict[str, tuple[float, float]]:
    """Rozdział mocy odbioru na fazy wg ``Load.phases``: brak/``ABC`` = po 1/3 na fazę
    (odbiór trójfazowy symetryczny); ``A``/``B``/``C`` = cała moc na jednej fazie."""
    if fazy in FAZY_ODBIORU_JEDNOFAZOWEGO:
        return {str(fazy): (p_mw, q_mvar)}
    return {faza: (p_mw / 3.0, q_mvar / 3.0) for faza in _FAZY}


def _pusta_moc_faz() -> dict[str, list[float]]:
    return {faza: [0.0, 0.0] for faza in _FAZY}


def _zalozenie(kod: str, elementy: list[str]) -> dict[str, Any]:
    return {
        "kod": kod,
        "elementy": sorted(set(elementy)),
        "opis": READINESS_CODES[kod].message_pl,
    }


def zloz_wejscie_rozplywu_niesymetrycznego(
    snapshot: dict[str, Any] | None,
    options: dict[str, Any],
    graph: NetworkGraph | None = None,
) -> WejscieRozplywuNiesymetrycznego:
    """Złóż wejście rozpływu niesymetrycznego: migawka ENM → IR → ``UnbalancedNetworkInput``.

    Tor (CV-4 — jeden assembler): ``zbuduj_graf`` (ten sam IR co rozpływ NR i zwarcie),
    ``_wyspy_zasilone`` (ta sama szyna bilansująca per wyspa i ta sama odmowa dwóch
    źródeł w wyspie), ``diagnoza_niesymetrii`` (ta sama diagnoza co gotowość
    „Asymetria"). Impedancje: Z1 z IR (linia: R/X·L z ``n_parallel``; transformator:
    ``TransformerBranch.get_impedance_pu``), Z0 z pól ENM ``r0/x0_ohm_per_km`` (linie,
    kable; ``liczba_torow`` jak Z1) i z modelu składowej zerowej transformatora
    (``enm/zero_sequence_transformer`` — ten sam co zwarcie 1F), złożone w Z_s/Z_m w
    ``network_model/pochodne/skladowe_symetryczne.py`` i odniesione do napięcia szyny
    bilansującej wyspy. Odbiory per faza z ``Load.phases``; generacja PQ = wstrzyk
    stałomocowy rozłożony po równo na fazy (moc z IR: ``Node.active/reactive_power`` —
    jedno źródło prawdy Q wytwórcy, jak w rozpływie NR). Łącznik zamknięty = gałąź o
    impedancji 0 (V_to = V_from dokładnie).
    """
    snapshot = snapshot or {}
    enm = EnergyNetworkModel.model_validate(snapshot)
    graph = zbuduj_graf(snapshot) if graph is None else graph
    graph_element_context = _build_snapshot_graph_element_context(snapshot)
    graph_nodes = graph_element_context.get("nodes", {})
    graph_branches = graph_element_context.get("branches", {})

    diagnoza = diagnoza_niesymetrii(enm)
    if diagnoza.blokuje:
        pierwsza = diagnoza.odmowy[0]
        opis = "; ".join(
            f"{READINESS_CODES[o.kod].message_pl} [{o.kod}] — {o.opis}: "
            f"{', '.join(o.elementy[:8])}{', …' if len(o.elementy) > 8 else ''}"
            for o in diagnoza.odmowy
        )
        raise OdmowaWejsciaRozplywu(pierwsza.kod, opis, elementy=pierwsza.elementy)
    droga_zerowa = diagnoza.droga_zerowa
    zamkniecia_tr = dict(droga_zerowa.zamkniecia_w_transformatorach)
    zamkniecia_zr = dict(droga_zerowa.zamkniecia_w_zrodlach)

    def _powod_bez_z0(ref_id: str) -> str:
        if ref_id in droga_zerowa.artefakt:
            zamykajace = sorted({tr for ld, tr in droga_zerowa.zamkniecia_w_transformatorach})
            return (
                "I0 tej krawędzi jest artefaktem modelu szeregowego: droga I0 odbiorów "
                f"faza–N zamknięta poniżej, w transformatorze {', '.join(zamykajace)}"
            )
        return "I_a+I_b+I_c ≡ 0 z topologii: tą krawędzią nie płynie I0 żadnego odbioru faza–N"

    wyspy_zasilone = _wyspy_zasilone(snapshot, graph)
    if not wyspy_zasilone:
        raise ValueError("Brak wezla bilansujacego SLACK w kanonicznym snapshotcie ENM")
    nastawa_u_zrodla = _nastawy_u_zrodel(snapshot)
    base_mva, tolerance, max_iterations = _opcje_rozplywu_niesymetrycznego(options)

    galaz_enm = {_graph_id_from_ref(g.ref_id): g for g in enm.branches}
    trafo_enm = {_graph_id_from_ref(t.ref_id): t for t in enm.transformers}
    napiecia_kv = {node_id: float(node.voltage_level) for node_id, node in graph.nodes.items()}
    tracer = WhiteBoxTracer()
    admitancja_pominieta: list[str] = []
    magnesujaca_pominieta: list[str] = []
    transformatory_szeregowe: list[str] = []
    galezie_ze_sprzezeniem: list[str] = []
    for ld in sorted(enm.loads, key=lambda ld: ld.ref_id):
        if ld.ref_id in zamkniecia_tr or ld.ref_id in zamkniecia_zr:
            punkt = zamkniecia_tr.get(ld.ref_id)
            tracer.add(
                key=f"pf_unbalanced_zero_sequence_path[{ld.ref_id}]",
                title=f"Odbiór {ld.ref_id} (faza {ld.phases}): droga prądu powrotnego I0",
                formula_latex=r"I_0 = \tfrac{1}{3}(I_a + I_b + I_c)",
                inputs={"phases": ld.phases, "bus_ref": ld.bus_ref},
                substitution=(
                    f"droga I0 zamknięta w uziemionym uzwojeniu transformatora {punkt}"
                    if punkt is not None
                    else (
                        "droga I0 zamknięta w punkcie neutralnym źródła sieciowego "
                        f"{zamkniecia_zr[ld.ref_id]} (źródło idealne uziemione w modelu BFS)"
                    )
                ),
                result={
                    "zamkniecie": punkt if punkt is not None else zamkniecia_zr[ld.ref_id],
                    "rodzaj": "transformator" if punkt is not None else "zrodlo",
                },
            )

    wyspy: list[WyspaRozplywuNiesymetrycznego] = []
    for wyspa, zrodlo_ref, slack_node_id in wyspy_zasilone:
        wezly_zbior = {_graph_id_from_ref(szyna) for szyna in wyspa.szyny}
        wezly = tuple(sorted(wezly_zbior))
        base_kv_ll = napiecia_kv[slack_node_id]

        branch_specs: list[UnbalancedBranchSpec] = []
        for branch_id in sorted(graph.branches):
            branch = graph.branches[branch_id]
            if branch.from_node_id not in wezly_zbior or branch.to_node_id not in wezly_zbior:
                continue
            if not getattr(branch, "in_service", True):
                continue
            if isinstance(branch, LineBranch):
                galaz = galaz_enm.get(branch_id)
                if not isinstance(galaz, Cable | OverheadLine):
                    raise ValueError(
                        f"Gałąź IR '{branch_id}' nie ma odpowiednika linii/kabla w migawce ENM"
                    )
                tory = liczba_torow(galaz)
                z1_ohm = complex(branch.r_ohm_per_km, branch.x_ohm_per_km) * branch.length_km
                z0_ohm: complex | None
                if galaz.ref_id in droga_zerowa.z_realnym_i0:
                    if galaz.r0_ohm_per_km is None or galaz.x0_ohm_per_km is None:
                        raise OdmowaWejsciaRozplywu(
                            KOD_NIESYMETRIA_BRAK_Z0_GALEZI,
                            READINESS_CODES[KOD_NIESYMETRIA_BRAK_Z0_GALEZI].message_pl,
                            elementy=(galaz.ref_id,),
                        )
                    z0_ohm = (
                        complex(galaz.r0_ohm_per_km, galaz.x0_ohm_per_km) * galaz.length_km / tory
                    )
                    zrodlo_z0_galezi = "ENM r0_ohm_per_km/x0_ohm_per_km × length_km / n_parallel"
                else:
                    z0_ohm = None
                    zrodlo_z0_galezi = "Z0 nieużywane (krawędź bez realnego I0)"
                branch_specs.append(
                    _spec_galezi_z_sekwencji(
                        tracer=tracer,
                        branch_id=branch_id,
                        ref_id=galaz.ref_id,
                        from_id=branch.from_node_id,
                        to_id=branch.to_node_id,
                        z1_ohm=z1_ohm,
                        z0_ohm=z0_ohm,
                        napiecie_wlasne_kv=napiecia_kv[branch.from_node_id],
                        base_kv_ll=base_kv_ll,
                        zrodlo_z0=zrodlo_z0_galezi,
                        powod_bez_z0=_powod_bez_z0(galaz.ref_id),
                        dane={
                            "r_ohm_per_km": branch.r_ohm_per_km,
                            "x_ohm_per_km": branch.x_ohm_per_km,
                            "r0_ohm_per_km": galaz.r0_ohm_per_km,
                            "x0_ohm_per_km": galaz.x0_ohm_per_km,
                            "length_km": galaz.length_km,
                            "n_parallel": tory,
                        },
                    )
                )
                if branch.b_us_per_km > 0.0:
                    admitancja_pominieta.append(galaz.ref_id)
            elif isinstance(branch, TransformerBranch):
                trafo = trafo_enm.get(branch_id)
                if trafo is None:
                    raise ValueError(
                        f"Gałąź IR '{branch_id}' nie ma odpowiednika transformatora w migawce ENM"
                    )
                z1_pu = branch.get_impedance_pu(base_mva)
                z1_ohm = impedancja_z_jednostek_wzglednych_ohm(z1_pu, base_kv_ll, base_mva)
                model_z0 = build_transformer_zero_seq_model(trafo)
                for krok in model_z0.trace:
                    tracer.add_step(WhiteBoxStep(**krok))
                z0_ohm_tr: complex | None
                if trafo.ref_id not in droga_zerowa.z_realnym_i0:
                    z0_ohm_tr = None
                    zrodlo_z0 = (
                        f"Z0 nieużywane (połączenie {model_z0.connection.value}; "
                        "transformator poza drogą realnego I0)"
                    )
                elif model_z0.z0_pu is None:
                    # Wędrówka ``_droga_zerowa`` nie wpuszcza połączenia OPEN na drogę
                    # realnego I0 (odmowa w diagnozie) — strażnik spójności predykatów.
                    raise OdmowaWejsciaRozplywu(
                        KOD_NIESYMETRIA_BRAK_DROGI_ZEROWEJ,
                        READINESS_CODES[KOD_NIESYMETRIA_BRAK_DROGI_ZEROWEJ].message_pl,
                        elementy=(trafo.ref_id,),
                    )
                else:
                    z0_ohm_tr = impedancja_z_jednostek_wzglednych_ohm(
                        model_z0.z0_pu, base_kv_ll, S_BASE_MVA
                    )
                    zrodlo_z0 = (
                        f"enm/zero_sequence_transformer ({model_z0.connection.value}, "
                        f"Z0 = {_fmt_z(model_z0.z0_pu)} pu @ {S_BASE_MVA:g} MVA)"
                    )
                branch_specs.append(
                    _spec_galezi_z_sekwencji(
                        tracer=tracer,
                        branch_id=branch_id,
                        ref_id=trafo.ref_id,
                        from_id=branch.from_node_id,
                        to_id=branch.to_node_id,
                        z1_ohm=z1_ohm,
                        z0_ohm=z0_ohm_tr,
                        napiecie_wlasne_kv=base_kv_ll,
                        base_kv_ll=base_kv_ll,
                        zrodlo_z0=zrodlo_z0,
                        powod_bez_z0=_powod_bez_z0(trafo.ref_id),
                        dane={
                            "sn_mva": branch.rated_power_mva,
                            "uk_percent": branch.uk_percent,
                            "pk_kw": branch.pk_kw,
                            "vector_group": trafo.vector_group,
                            "z1_pu_base": z1_pu,
                            "base_mva": base_mva,
                        },
                    )
                )
                transformatory_szeregowe.append(trafo.ref_id)
                # Gałąź magnesująca jest w modelu tylko, gdy ENM NIESIE P0 albo I0 (> 0);
                # brak danej = brak gałęzi do pominięcia (nie podstawia się zera).
                ma_p0 = trafo.p0_kw is not None and trafo.p0_kw > 0.0
                ma_i0 = trafo.i0_percent is not None and trafo.i0_percent > 0.0
                if ma_p0 or ma_i0:
                    magnesujaca_pominieta.append(trafo.ref_id)
            else:
                raise ValueError(
                    f"Gałąź IR '{branch_id}' typu {type(branch).__name__} nie ma "
                    "reprezentacji w rozpływie niesymetrycznym"
                )
        galezie_ze_sprzezeniem.extend(
            wejscie_galezi.branch_id
            for wejscie_galezi in branch_specs
            if wejscie_galezi.r_mutual_ohm != 0.0 or wejscie_galezi.x_mutual_ohm != 0.0
        )
        for switch_id in sorted(graph.switches):
            switch = graph.switches[switch_id]
            if switch.from_node_id not in wezly_zbior or switch.to_node_id not in wezly_zbior:
                continue
            if not (getattr(switch, "in_service", True) and switch.is_closed):
                continue
            branch_specs.append(
                UnbalancedBranchSpec(
                    branch_id=switch_id,
                    from_bus_id=switch.from_node_id,
                    to_bus_id=switch.to_node_id,
                    r_self_ohm=0.0,
                    x_self_ohm=0.0,
                )
            )

        # Odbiory per faza z ENM (`Load.phases`) + generacja PQ z IR (wstrzyk ujemny).
        moc_wezla: dict[str, dict[str, list[float]]] = {}
        suma_odbiorow: dict[str, list[float]] = {}
        for ld in sorted(enm.loads, key=lambda ld: ld.ref_id):
            if ld.bus_ref not in wyspa.szyny:
                continue
            node_id = _graph_id_from_ref(ld.bus_ref)
            rozdzial = _moc_per_faza(float(ld.p_mw), float(ld.q_mvar), ld.phases)
            fazy_wezla = moc_wezla.setdefault(node_id, _pusta_moc_faz())
            for faza, (p, q) in rozdzial.items():
                fazy_wezla[faza][0] += p
                fazy_wezla[faza][1] += q
            suma = suma_odbiorow.setdefault(node_id, [0.0, 0.0])
            suma[0] += float(ld.p_mw)
            suma[1] += float(ld.q_mvar)
            tracer.add(
                key=f"pf_unbalanced_load[{ld.ref_id}]",
                title=f"Odbiór {ld.ref_id}: rozdział mocy na fazy ({ld.phases or 'ABC'})",
                formula_latex=(
                    r"S_{\varphi} = S/3\ (\text{ABC});\quad S_{\varphi} = S\ (\text{A|B|C})"
                ),
                inputs={"p_mw": ld.p_mw, "q_mvar": ld.q_mvar, "phases": ld.phases},
                substitution=", ".join(
                    f"{faza}: {p:.6g} MW / {q:.6g} Mvar" for faza, (p, q) in rozdzial.items()
                ),
                result={faza: {"p_mw": p, "q_mvar": q} for faza, (p, q) in rozdzial.items()},
            )
        load_specs: list[UnbalancedLoadSpec] = []
        for node_id in wezly:
            node = graph.nodes[node_id]
            fazy_wezla = moc_wezla.get(node_id, _pusta_moc_faz())
            if node_id != slack_node_id:
                # Generacja PQ = moc netto węzła IR + suma odbiorów (konwencja IR: >0 = wstrzyk).
                # `enm/mapping.py` koduje moc netto 0.0 węzła jako ``None`` (węzeł bez
                # wstrzyku) — brak pola = brak składnika do dodania, nie zastępnik.
                odb_p, odb_q = suma_odbiorow.get(node_id, [0.0, 0.0])
                gen_p = odb_p
                gen_q = odb_q
                if node.active_power is not None:
                    gen_p += float(node.active_power)
                if node.reactive_power is not None:
                    gen_q += float(node.reactive_power)
                if gen_p != 0.0 or gen_q != 0.0:
                    for faza in _FAZY:
                        fazy_wezla[faza][0] -= gen_p / 3.0
                        fazy_wezla[faza][1] -= gen_q / 3.0
                    tracer.add(
                        key=f"pf_unbalanced_generation[{node_id}]",
                        title=(
                            f"Węzeł {graph_nodes.get(node_id, {}).get('element_id', node_id)}: "
                            "generacja PQ jako wstrzyk symetryczny"
                        ),
                        formula_latex=r"S_{\varphi,gen} = -S_{gen}/3",
                        inputs={"p_gen_mw": gen_p, "q_gen_mvar": gen_q},
                        substitution=f"−{gen_p:.6g}/3 MW, −{gen_q:.6g}/3 Mvar na fazę",
                        result={"p_mw_per_phase": -gen_p / 3.0, "q_mvar_per_phase": -gen_q / 3.0},
                    )
            if all(p == 0.0 and q == 0.0 for p, q in fazy_wezla.values()):
                continue
            load_specs.append(
                UnbalancedLoadSpec(
                    bus_id=node_id,
                    p_mw_a=fazy_wezla["A"][0],
                    p_mw_b=fazy_wezla["B"][0],
                    p_mw_c=fazy_wezla["C"][0],
                    q_mvar_a=fazy_wezla["A"][1],
                    q_mvar_b=fazy_wezla["B"][1],
                    q_mvar_c=fazy_wezla["C"][1],
                )
            )

        base_mva_fazy = moc_bazowa_fazy_mva(base_mva)
        base_kv_fazy = napiecie_fazowe_v(base_kv_ll)
        tracer.add(
            key=f"pf_unbalanced_base[{zrodlo_ref}]",
            title=f"Wyspa źródła {zrodlo_ref}: baza jednej fazy solvera BFS",
            formula_latex=r"S_{b,\varphi} = S_b/3,\quad U_{b,\varphi} = U_{LL}/\sqrt{3}",
            inputs={"base_mva": base_mva, "base_kv_ll": base_kv_ll},
            substitution=(
                f"S_b = {base_mva:g}/3 = {base_mva_fazy:.6g} MVA; "
                f"U_b = {base_kv_ll:g}/√3 = {base_kv_fazy:.6g} kV (Z_b = U_LL²/S_b niezmienne)"
            ),
            result={"base_mva_fazy": base_mva_fazy, "base_kv_fazy": base_kv_fazy},
        )
        wyspy.append(
            WyspaRozplywuNiesymetrycznego(
                slack_node_id=slack_node_id,
                zrodlo_ref=zrodlo_ref,
                szyny=tuple(wyspa.szyny),
                wezly=wezly,
                base_kv_ll=base_kv_ll,
                wejscie=UnbalancedNetworkInput(
                    base_mva=base_mva_fazy,
                    base_kv=base_kv_fazy,
                    slack_bus_id=slack_node_id,
                    bus_ids=wezly,
                    branches=tuple(branch_specs),
                    loads=tuple(load_specs),
                    slack_voltage_pu=nastawa_u_zrodla.get(zrodlo_ref, 1.0),
                ),
            )
        )

    zalozenia: list[dict[str, Any]] = []
    if transformatory_szeregowe:
        zalozenia.append(_zalozenie(KOD_ZALOZENIE_TR_SZEREGOWY, transformatory_szeregowe))
    if droga_zerowa.artefakt:
        zalozenia.append(
            _zalozenie(KOD_ZALOZENIE_DROGA_ZEROWA_ZAMKNIETA, sorted(droga_zerowa.artefakt))
        )
    if droga_zerowa.zamkniecia_w_zrodlach:
        zalozenia.append(
            _zalozenie(
                KOD_ZALOZENIE_DROGA_ZEROWA_ZRODLO,
                sorted({zr for _, zr in droga_zerowa.zamkniecia_w_zrodlach}),
            )
        )
    if magnesujaca_pominieta:
        zalozenia.append(_zalozenie(KOD_ZALOZENIE_GALAZ_MAGNESUJACA, magnesujaca_pominieta))
    if admitancja_pominieta:
        zalozenia.append(_zalozenie(KOD_ZALOZENIE_ADMITANCJA_POPRZECZNA, admitancja_pominieta))
    if galezie_ze_sprzezeniem:
        zalozenia.append(
            _zalozenie(
                KOD_ZALOZENIE_STRATY_Z_IMPEDANCJI_WLASNEJ,
                [
                    str(graph_branches.get(branch_id, {}).get("element_id") or branch_id)
                    for branch_id in galezie_ze_sprzezeniem
                ],
            )
        )
    return WejscieRozplywuNiesymetrycznego(
        graph=graph,
        enm=enm,
        base_mva=base_mva,
        tolerance=tolerance,
        max_iterations=max_iterations,
        wyspy=tuple(wyspy),
        graph_nodes=graph_nodes,
        graph_branches=graph_branches,
        napiecia_znamionowe_kv=napiecia_kv,
        slad=tuple(tracer.to_list()),
        zalozenia=tuple(zalozenia),
    )
