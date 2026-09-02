"""Atomowa projekcja domeny nN dla portalu SN -> nN.

``LvDomainProjectionV1`` spina w jednym, wersjonowanym odczycie:

* bieżący graf domeny wyprowadzony z ENM,
* kotwice Thevenina strony SN dla wszystkich transformatorów domeny,
* nakładkę zamrożonego ``ResultSetV1`` ograniczoną do elementów domeny,
* pętle zwarcia i werdykty SWZ odpływów.

Warstwa jest orkiestracją aplikacyjną. Nie zawiera fizyki i nie interpretuje
surowych wyników solvera. Dzięki temu portal nie może złożyć ekranu z kilku
odczytów pochodzących z różnych rewizji modelu.

ATOMOWOŚĆ — CO DOKŁADNIE OBIECUJEMY (karta B-02, §0.5). Projekcja jest atomowa
względem JEDNEGO obiektu ``EnergyNetworkModel``, pobranego RAZ na początku
obsługi żądania (``_get_enm(case_id)`` w końcówce ``api/enm.py``) i przekazanego
tutaj jako argument. Wszystkie składowe odpowiedzi — graf domeny, energizacja,
kotwice SN, nakładka wyniku, SWZ per transformator — liczą się z TEGO SAMEGO
obiektu w pamięci, a ``model_snapshot.model_hash`` jest odciskiem dokładnie tego
obiektu. Zapis modelu współbieżny z budową projekcji (``set_enm`` podmienia wpis
w magazynie na NOWY obiekt) NIE zmienia tej odpowiedzi: nowy odcisk pojawi się
dopiero przy następnym odczycie. Obietnica jest PRZYPIĘTA TESTEM
(``tests/application/analyses/lv_domain/test_projection_v1.py::
TestAtomowoscProjekcji``), bo deklaracja bez testu jest fałszywą pewnością.
Czego ta obietnica NIE obejmuje: mutacji tego samego obiektu W MIEJSCU przez
inny wątek — magazyn ENM nie oddaje kopii, więc atomowość stoi na tym, że każdy
zapis modelu tworzy nowy obiekt (``enm/store.py::set_enm``).
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from application.analyses.fault_loop.service import (
    _find_station,
    _system_for_station,
    build_feeder_fault_loop_view_for_transformer,
    station_transformers,
)
from application.analyses.kontrakt_liczb import kwantyzuj_kontrakt
from application.analyses.swz.service import build_swz_view
from application.analyses.voltage_profile_view import build_voltage_profile_view
from application.result_freshness import evaluate_result_freshness
from application.result_mapping.canonical_run_to_resultset_v1 import (
    build_resultset_v1_from_canonical_run,
)
from enm.canonical_analysis import CanonicalRun, build_bus_results
from enm.hash import compute_enm_hash, compute_switching_snapshot_hash
from enm.models import EnergyNetworkModel

from .audit import collect_validation_messages
from .energization import upstream_source_refs_by_system
from .graph_view import build_lv_domain_view
from .upstream_equivalent import Scenario, build_upstream_equivalent_snapshot

LV_DOMAIN_PROJECTION_CONTRACT = "LvDomainProjectionV1"
#: 3.0.0 (mandat „profesjonalizacja SLD nN", §5/§6/§10/§14/§32/§34): ZMIANA
#: NIEZGODNA WSTECZ kształtu ładunku — szyny niosą `energization_state`/
#: `is_energized`/`island_ref`/`is_board` zamiast `energized`/`der_only`; graf
#: niesie `devices[]` (rola/klasa urządzenia z topologii), `segments[]` (mapa
#: energizacji odcinków per zacisk), `sections[]`, `supply_paths[]`,
#: `measurements[]`, `protection_assignments[]`; wyspy niosą komplet §14–§16;
#: kotwice SN — `upstream_node_id`/`upstream_system_id`/`upstream_source_ids`/
#: `equivalent_id`; projekcja — `validation_messages[]`. 2.0.0 (karta B-02)
#: wprowadziła `swz_snapshot.transformers[]` i energizację szyn. Wersja rośnie
#: MAJOR, bo ten sam identyfikator na dwóch niezgodnych kształtach byłby cichą
#: pułapką dla każdego klienta, który go sprawdza (frontend
#: `projectionApi.ts::isLvDomainProjectionV1` przypina wersję wprost). Nazwa
#: kontraktu i ścieżka końcówki (`/projection/v1`) bez zmian — to identyfikator
#: ZASOBU, wersja opisuje ładunek.
LV_DOMAIN_PROJECTION_VERSION = "3.0.0"


class LvDomainProjectionRunMismatch(ValueError):
    """Przebieg jawnie wskazany do projekcji należy do innego przypadku."""


class LvDomainProjectionRunUnavailable(ValueError):
    """Przebieg jawnie wskazany do projekcji nie ma gotowego wyniku."""


def _canonical_hash(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _domain_element_refs(graph: dict[str, Any]) -> set[str]:
    refs = {str(graph.get("station_ref", ""))}
    for collection in (
        "buses",
        "branches",
        "transformers",
        "generators",
        "loads",
        "sub_switchboards",
    ):
        refs.update(
            str(item["ref_id"])
            for item in graph.get(collection, [])
            if isinstance(item, dict) and item.get("ref_id")
        )
    refs.update(
        str(item["branch_ref"])
        for item in graph.get("boundary_links", [])
        if isinstance(item, dict) and item.get("branch_ref")
    )
    refs.discard("")
    return refs


def _result_snapshot(
    *,
    run: CanonicalRun | None,
    case_id: str,
    model_hash: str,
    domain_refs: set[str],
) -> dict[str, Any]:
    if run is None:
        freshness = evaluate_result_freshness(
            has_result=False,
            run_model_hashes=(),
            current_hash=model_hash,
        )
        return {
            "status": freshness.status.value,
            "reason": freshness.reason.value,
            "reason_pl": freshness.reason_pl,
            "run_id": None,
            "analysis_type": None,
            "run_model_hash": None,
            "run_finished_at": None,
            "result_contract_version": None,
            "result_signature": None,
            "overlay_payload": None,
            "voltage_profile": None,
        }

    if run.case_id != case_id:
        raise LvDomainProjectionRunMismatch(
            f"Przebieg {run.id} należy do przypadku {run.case_id}, nie {case_id}."
        )
    if run.status != "FINISHED":
        raise LvDomainProjectionRunUnavailable(
            f"Wyniki przebiegu {run.id} są niedostępne — status: {run.status}."
        )

    result_set = build_resultset_v1_from_canonical_run(run)
    overlay_payload = result_set.overlay_payload.model_dump(mode="json")
    overlay_payload["elements"] = {
        ref: element
        for ref, element in sorted(overlay_payload.get("elements", {}).items())
        if ref in domain_refs
    }
    overlay_payload["warnings"] = [
        warning
        for warning in overlay_payload.get("warnings", [])
        if not warning.get("element_ref") or warning["element_ref"] in domain_refs
    ]

    freshness = evaluate_result_freshness(
        has_result=True,
        run_model_hashes=(run.snapshot_hash,),
        current_hash=model_hash,
    )
    voltage_profile = None
    if run.analysis_type == "PF":
        complete_profile = build_voltage_profile_view(run)
        # Profil napięć jest kluczowany identyfikatorem węzła solvera (UUID
        # grafu), a domena nN — referencjami ENM. Bez przekluczowania filtr
        # ``in domain_refs`` odrzucał KAŻDY wiersz i nakładka „Spadki napięcia"
        # była zawsze pusta (defekt klasy: dwie przestrzenie identyfikatorów
        # spinane bez mapy). Mapa pochodzi z ``build_bus_results`` — tej samej,
        # którą ``overlay_payload.elements`` kluczuje po ``element_ref``.
        ref_by_solver_bus = {
            str(row["bus_id"]): str(row["element_id"])
            for row in build_bus_results(run).get("rows", [])
            if row.get("bus_id") and row.get("element_id")
        }
        rows = []
        for row in complete_profile.get("rows", []):
            solver_bus_id = str(row.get("bus_id") or "")
            ref = ref_by_solver_bus.get(solver_bus_id, solver_bus_id)
            if ref not in domain_refs:
                continue
            rows.append({**row, "bus_id": ref, "solver_bus_id": solver_bus_id})
        summary = dict(complete_profile.get("summary") or {})
        worst = summary.get("worst_bus_id")
        if worst is not None:
            summary["worst_bus_id"] = ref_by_solver_bus.get(str(worst), str(worst))
        voltage_profile = {**complete_profile, "rows": rows, "summary": summary}
    return {
        "status": freshness.status.value,
        "reason": freshness.reason.value,
        "reason_pl": freshness.reason_pl,
        "run_id": str(run.id),
        "analysis_type": result_set.analysis_type,
        "run_model_hash": run.snapshot_hash,
        "run_finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "result_contract_version": result_set.contract_version,
        "result_signature": result_set.deterministic_signature,
        "overlay_payload": overlay_payload,
        "voltage_profile": voltage_profile,
    }


def _swz_feeder_rows(
    enm: EnergyNetworkModel,
    station_ref: str,
    transformer_ref: str,
    feeders: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Odpływy JEDNEGO transformatora + werdykt SWZ najgorszego punktu każdego.

    SWZ liczy się OD TEGO SAMEGO transformatora, od którego policzono pętlę
    zwarcia odpływu (``transformer_ref`` przekazany jawnie do
    ``build_swz_view``) — inaczej stacja 2×TR dostawałaby werdykt SWZ sekcji 2
    liczony impedancją TR1 (defekt klasy naprawiany kartą B-02).
    """
    rows: list[dict[str, Any]] = []
    for feeder in feeders:
        breaker_ref = str(feeder.get("feeder_root_branch_ref", ""))
        worst_bus_ref = feeder.get("worst_point_bus_ref")
        if worst_bus_ref:
            swz = build_swz_view(
                enm,
                station_ref,
                str(worst_bus_ref),
                breaker_ref,
                transformer_ref=transformer_ref,
            )
        else:
            swz = {
                "status": "brak danych",
                "station_ref": station_ref,
                "bus_ref": None,
                "breaker_ref": breaker_ref,
                "missing_data": ["worst_point_bus_ref"],
                "reason_pl": "Brak policzalnego najgorszego punktu odpływu.",
            }
        rows.append(
            {
                "feeder_root_branch_ref": breaker_ref,
                "worst_point_bus_ref": worst_bus_ref,
                "points": feeder.get("points", []),
                "supply": feeder.get("supply"),
                "supply_assumption_pl": feeder.get("supply_assumption_pl"),
                "swz": swz,
            }
        )
    return sorted(rows, key=lambda row: row["feeder_root_branch_ref"])


def _swz_snapshot(enm: EnergyNetworkModel, station_ref: str) -> dict[str, Any]:
    """Pętle zwarcia i werdykty SWZ stacji — ROZBITE PER TRANSFORMATOR (§0.2).

    Kontrakt v1 niesie listę ``transformers`` zamiast pojedynczej pary
    ``transformer_ref``/``nn_bus_ref``: stacja z dwoma transformatorami ma dwa
    komplety odpływów liczone każdy od SWOJEGO transformatora, więc jedna para
    pól nagłówkowych była nie tylko niepełna, ale wprost myląca (odpływy sekcji
    2 podpisane transformatorem sekcji 1). Transformator, którego nie da się
    policzyć, ZOSTAJE w liście z własnym ``status``/``missing_data`` — cicha
    nieobecność byłaby kłamstwem przez pominięcie.
    """
    station = _find_station(enm, station_ref)
    if station is None:
        return {
            "status": "brak danych",
            "reason_pl": None,
            "missing_data": ["station"],
            "network_system": None,
            "transformers": [],
        }

    transformers = station_transformers(enm, station)
    if not transformers:
        return {
            "status": "brak danych",
            "reason_pl": None,
            "missing_data": ["transformer"],
            "network_system": _system_for_station(station),
            "transformers": [],
        }

    rows: list[dict[str, Any]] = []
    missing_data: list[str] = []
    statuses: list[str] = []
    reason_pl: str | None = None
    network_system: str | None = None
    for trafo in transformers:
        view = build_feeder_fault_loop_view_for_transformer(enm, station_ref, trafo.ref_id)
        status = str(view.get("status", "brak danych"))
        statuses.append(status)
        network_system = view.get("network_system")
        if reason_pl is None and view.get("reason_pl"):
            reason_pl = str(view["reason_pl"])
        missing_data.extend(f"{trafo.ref_id}:{item}" for item in view.get("missing_data", []))
        rows.append(
            {
                "transformer_ref": trafo.ref_id,
                "nn_bus_ref": trafo.lv_bus_ref,
                "status": status,
                "missing_data": [str(item) for item in view.get("missing_data", [])],
                "feeders": _swz_feeder_rows(
                    enm, station_ref, trafo.ref_id, list(view.get("feeders", []))
                ),
            }
        )

    if "OK" in statuses:
        status = "OK"
    elif all(item == "nie dotyczy" for item in statuses):
        status = "nie dotyczy"
    else:
        status = "brak danych"

    return {
        "status": status,
        "reason_pl": reason_pl,
        "missing_data": sorted(set(missing_data)),
        "network_system": network_system,
        "transformers": rows,
    }


def build_lv_domain_projection_v1(
    enm: EnergyNetworkModel,
    case_id: str,
    station_ref: str,
    *,
    scenario: Scenario = "MAX",
    run: CanonicalRun | None = None,
) -> dict[str, Any]:
    """Zbuduj jeden niepodzielny snapshot domeny nN i jej prezentacji."""
    graph = build_lv_domain_view(enm, station_ref)
    model_hash = compute_enm_hash(enm)
    # TOŻSAMOŚĆ ODPOWIEDZI (karta B-02, §0.4): klient porównuje te pola z tym, o
    # co PROSIŁ — bez nich nie da się odróżnić odpowiedzi na własne żądanie od
    # odpowiedzi z pamięci podręcznej dla innej stacji/scenariusza/przebiegu.
    # `run_snapshot_hash` jest odciskiem modelu ZAPISANYM PRZY BIEGU (nie
    # bieżącym) — porównanie z `model_hash` daje klientowi tę samą informację,
    # co status świeżości, bez ufania interpretacji serwera.
    model_snapshot = {
        "revision": enm.header.revision,
        "model_hash": model_hash,
        "operating_state_id": compute_switching_snapshot_hash(enm),
        "case_id": case_id,
        "station_ref": station_ref,
        "scenario_id": scenario,
        "run_snapshot_hash": run.snapshot_hash if run is not None else None,
    }

    upstream_equivalents: list[dict[str, Any]] = []
    if graph.get("status") == "OK":
        domain_bus_refs = {str(b["ref_id"]) for b in graph.get("buses", [])}
        sources_by_system = upstream_source_refs_by_system(enm, domain_bus_refs)
        source_name_by_ref = {s.ref_id: s.name for s in enm.sources}
        for transformer in graph.get("transformers", []):
            transformer_ref = transformer.get("ref_id")
            if not transformer_ref:
                continue
            snapshot = build_upstream_equivalent_snapshot(
                enm,
                case_id,
                station_ref,
                scenario=scenario,
                transformer_ref=str(transformer_ref),
            )
            # §10/§11: system SN transformatora (składowa sieci bez szyn domeny)
            # i źródła tego systemu — ten sam `upstream_system_id` u dwóch TR
            # oznacza WSPÓLNE zasilanie SN (jedna kotwica w projekcji), różne —
            # niezależne systemy (osobne kotwice; spięcie po nN = CONFLICT).
            system_id = transformer.get("upstream_system_id")
            source_ids = list(sources_by_system.get(str(system_id), []))
            snapshot["upstream_system_id"] = system_id
            snapshot["upstream_source_ids"] = source_ids
            snapshot["upstream_source_names"] = [
                source_name_by_ref.get(ref, ref) for ref in source_ids
            ]
            upstream_equivalents.append(snapshot)

    domain_refs = _domain_element_refs(graph)
    result_snapshot = _result_snapshot(
        run=run,
        case_id=case_id,
        model_hash=model_hash,
        domain_refs=domain_refs,
    )
    swz_snapshot = _swz_snapshot(enm, station_ref)

    missing_data = [str(item) for item in graph.get("missing_data", [])]
    for upstream in upstream_equivalents:
        missing_data.extend(
            f"upstream:{upstream.get('transformer_ref', 'unknown')}:{item}"
            for item in upstream.get("missing_data", [])
        )
    missing_data.extend(f"swz:{item}" for item in swz_snapshot.get("missing_data", []))
    missing_data = sorted(set(missing_data))

    if graph.get("status") != "OK":
        completeness = "UNAVAILABLE"
    elif missing_data:
        completeness = "PARTIAL"
    else:
        completeness = "COMPLETE"

    # §34/§40: JEDNA lista komunikatów walidacji — wyspy (z grafu), audyt
    # kształtu topologii i świeżość wyniku. Renderer ją CZYTA (znaczniki przy
    # elementach + panel), nigdy nie wyprowadza własnych ostrzeżeń z geometrii.
    validation_messages = collect_validation_messages(
        graph, result_status=str(result_snapshot.get("status") or "")
    )

    payload: dict[str, Any] = {
        "contract": LV_DOMAIN_PROJECTION_CONTRACT,
        "contract_version": LV_DOMAIN_PROJECTION_VERSION,
        "case_id": case_id,
        "station_ref": station_ref,
        "scenario_id": scenario,
        "status": graph.get("status", "brak danych"),
        "completeness": completeness,
        "missing_data": missing_data,
        "model_snapshot": model_snapshot,
        "graph": graph,
        "upstream_equivalents": upstream_equivalents,
        "result_snapshot": result_snapshot,
        "swz_snapshot": swz_snapshot,
        "validation_messages": validation_messages,
    }
    # ADR-018 / M0-2: kanonizacja liczb PRZED odciskiem — odcisk i fixtury
    # zależą od modelu, nie od jądra BLAS maszyny (patrz `kontrakt_liczb`).
    payload = kwantyzuj_kontrakt(payload)
    payload["projection_hash"] = _canonical_hash(payload)
    return payload
