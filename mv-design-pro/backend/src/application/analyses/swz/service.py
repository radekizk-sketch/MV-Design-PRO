"""Orkiestracja SWZ per obwód: pętla zwarcia (scenariusz MIN, R skorygowane
temperaturowo) + aparat zabezpieczający odpływu → werdykt 3-stanowy (karta
P0.6, G-06).

Warstwa APLIKACJI: łączy ekstrakcję trasy + solver pętli zwarcia
(``application.analyses.fault_loop``) z werdyktem SWZ (``.werdykt`` —
interpretacja). Import prywatnych helperów ``fault_loop.service``
(``_find_station``, ``resolve_station_transformer``, ``_transformer_loop_impedance``,
``_upstream_thevenin_lv_component``, ``_system_for_station``) jest ŚWIADOMY —
SWZ i widok pętli zwarcia dzielą DOKŁADNIE TĘ SAMĄ fizykę transformatora i
upstream Thevenina (impedancja u źródła nN jest identyczna niezależnie od
tego, czy pytamy o „pętlę w punkcie" czy o „SWZ dla obwodu"); duplikowanie
tych helperów pod inną nazwą utworzyłoby dokładnie ten defekt klasy, przed
którym ostrzega reguła KLASA NIE INSTANCJA (dwie ścieżki tej samej fizyki).
"""

from __future__ import annotations

import math
from typing import Any

from application.analyses.fault_loop.route import (
    RouteExtractionError,
    path_to_bus,
    route_segments_min_scenario,
)
from application.analyses.fault_loop.service import (
    _DEFAULT_SYSTEM,
    _NON_TN_SYSTEMS,
    _SYSTEM_MAP,
    _find_station,
    _system_for_station,
    _transformer_loop_impedance,
    _upstream_thevenin_lv_component,
    resolve_station_transformer,
)
from enm.models import EnergyNetworkModel, FuseBranch, SwitchBranch
from network_model.catalog.lv_mccb_settings_iec60947_2 import resolwuj_nastawy_mccb
from network_model.solvers.fault_loop_builder import (
    FaultLoopBuildRequest,
    build_fault_loop_input,
    sum_phase_and_return_route,
)
from network_model.solvers.fault_loop_iec60364 import compute_fault_loop

from .werdykt import AparatZabezpieczajacy, ocen_swz


def _find_branch(enm: EnergyNetworkModel, branch_ref: str) -> SwitchBranch | FuseBranch | None:
    branch = next((b for b in enm.branches if b.ref_id == branch_ref), None)
    if isinstance(branch, SwitchBranch | FuseBranch):
        return branch
    return None


def _aparat_from_branch(
    branch: SwitchBranch | FuseBranch,
) -> tuple[AparatZabezpieczajacy | None, str | None]:
    """Wyławia dane aparatu z ``materialized_params`` (katalog KABEL_NN-style
    materializacja — solver_fields ``APARAT_NN_MCB``/``WKLADKA_NN``/
    ``APARAT_NN``, zob. ``network_model/catalog/types.py::
    MATERIALIZATION_CONTRACTS``).

    Karta D2 (nN, „runda 8", 2026-08-14): dopina namespace ``APARAT_NN``
    (aparat pola nN — rozłącznik/wyłącznik, zob. `LVApparatusType`), którego
    wcześniej brakowało — każdy zainstalowany aparat tego namespace'u trafiał
    do gałęzi fallback (``typ=namespace``), NIEOBSŁUGIWANEJ przez
    ``ocen_swz`` (``_TYPY_APARATU_DOZWOLONE`` nie zna surowej nazwy
    namespace'u), więc dawał NIEROZSTRZYGALNE mimo istniejącej gałęzi
    ``typ="MCCB"`` (karta D1). Rezolucja wg ``device_kind``:
      - ``ROZLACZNIK_BEZPIECZNIKOWY`` bez wskazanej osobnej gałęzi wkładki
        (ta metoda dostaje WYŁĄCZNIE ``breaker_ref`` — korpus rozłącznika
        sam w sobie NIE MA charakterystyki I-t) → ``(None, "brak wkładki")``,
        uczciwe zero fabrykacji (jak inne gałęzie braku danych powyżej).
      - ``WYLACZNIK_GLOWNY``/``WYLACZNIK_ODPLYWOWY`` → ``typ="MCCB"``, Ii
        resolwowany z ``ir_range``/``isd_range``/``ii_range`` materializacji
        (REUSE `network_model.catalog.lv_mccb_settings_iec60947_2.
        resolwuj_nastawy_mccb` — JEDNO miejsce z doborem kandydata w
        `nn_device_selection.py`, nie druga fizyka). Brak zakresu w
        materializacji → ``ii_a=None`` → `ocen_swz` daje NIEROZSTRZYGALNE
        (zero fabrykacji domyślnej nastawy), NIE crash.

    Zwraca ``(None, reason_pl)`` gdy aparat nie ma katalogowego wiązania —
    zero fabrykacji (nie zgaduje typu/klasy).
    """
    params = branch.materialized_params if isinstance(branch.materialized_params, dict) else None
    if not params:
        return None, (
            f"Aparat '{branch.ref_id}' nie ma zmaterializowanych danych katalogowych "
            "(materialized_params) — SWZ wymaga wiązania z katalogiem (Catalog Binding)."
        )
    namespace = branch.catalog_namespace
    if namespace == "APARAT_NN_MCB":
        return (
            AparatZabezpieczajacy(
                typ="MCB",
                in_a=params.get("in_a"),
                klasa_mcb=params.get("curve_class"),
            ),
            None,
        )
    if namespace == "WKLADKA_NN":
        return AparatZabezpieczajacy(typ="WKLADKA_GG", in_a=params.get("in_a")), None
    if namespace == "APARAT_NN":
        in_a = params.get("i_n_a")
        if in_a is None:
            return None, f"Aparat '{branch.ref_id}' bez i_n_a w materialized_params."
        device_kind = params.get("device_kind")
        if device_kind == "ROZLACZNIK_BEZPIECZNIKOWY":
            return None, (
                f"Rozłącznik bezpiecznikowy '{branch.ref_id}' (namespace APARAT_NN) bez "
                "zainstalowanej wkładki (osobna gałąź WKLADKA_NN nie wskazana jako "
                "breaker_ref dla SWZ) — korpus rozłącznika sam w sobie NIE MA "
                "charakterystyki czasowo-prądowej I-t. SWZ 'brak wkładki'."
            )
        _, _, ii_a, _, _ = resolwuj_nastawy_mccb(
            i_n_a=float(in_a),
            ir_range=params.get("ir_range"),
            isd_range=params.get("isd_range"),
            ii_range=params.get("ii_range"),
        )
        return AparatZabezpieczajacy(typ="MCCB", in_a=float(in_a), ii_a=ii_a), None
    return AparatZabezpieczajacy(typ=namespace or "NIEZNANY"), None


def build_swz_view(
    enm: EnergyNetworkModel,
    station_ref: str,
    bus_ref: str,
    breaker_ref: str,
    *,
    transformer_ref: str | None = None,
) -> dict[str, Any]:
    """Werdykt SWZ dla obwodu: punkt zwarcia ``bus_ref`` chroniony aparatem
    ``breaker_ref`` (SwitchBranch/FuseBranch na trasie odpływu).

    Zwraca ``status`` (OK / brak danych / nie dotyczy), ``swz`` (werdykt
    3-stanowy z dowodem liczbowym) i ``fault_loop_min_scenario`` (pełny ślad
    solvera pętli zwarcia, scenariusz MIN — R skorygowane temperaturowo).

    ``transformer_ref`` (karta B-02, §0.1/§0.2) wskazuje transformator stacji,
    OD KTÓREGO liczy się trasa i impedancja pętli — wymagane dla stacji
    wielotransformatorowej, gdzie odpływ sekcji 2 musi być liczony od TR2, a nie
    od „pierwszego transformatora stacji" (przez sprzęgło albo wcale). Bez
    wskazania: domyślny transformator stacji
    (``resolve_station_transformer`` — pierwszy po ``ref_id``), czyli
    dotychczasowe zachowanie dla stacji jednotransformatorowej.
    """
    station = _find_station(enm, station_ref)
    if station is None:
        return {
            "status": "brak danych",
            "missing_data": ["station"],
            "station_ref": station_ref,
            "bus_ref": bus_ref,
            "breaker_ref": breaker_ref,
        }

    system = _system_for_station(station)
    context: dict[str, Any] = {
        "station_ref": station_ref,
        "station_name": station.name,
        "network_system": system,
        "bus_ref": bus_ref,
        "breaker_ref": breaker_ref,
    }

    if system in _NON_TN_SYSTEMS:
        return {
            **context,
            "status": "nie dotyczy",
            "reason_pl": (
                f"Układ {system}: SWZ metodą pętli TN (IEC 60364-4-41) nie dotyczy — "
                "inny mechanizm ochrony przeciwporażeniowej."
            ),
            "missing_data": [],
        }

    trafo, transformer_missing = resolve_station_transformer(enm, station, transformer_ref)
    if trafo is None:
        return {**context, "status": "brak danych", "missing_data": transformer_missing}

    z_tr, missing = _transformer_loop_impedance(trafo)
    if z_tr is None:
        return {**context, "status": "brak danych", "missing_data": missing}

    upstream, upstream_missing = _upstream_thevenin_lv_component(enm, trafo)
    if upstream is None:
        return {**context, "status": "brak danych", "missing_data": upstream_missing}

    branch = _find_branch(enm, breaker_ref)
    if branch is None:
        return {**context, "status": "brak danych", "missing_data": ["breaker"]}

    aparat, reason = _aparat_from_branch(branch)
    if aparat is None:
        return {
            **context,
            "status": "brak danych",
            "missing_data": ["breaker_catalog_binding"],
            "reason_pl": reason,
        }

    try:
        path = path_to_bus(enm, trafo.lv_bus_ref, bus_ref)
        segments = route_segments_min_scenario(path)
    except RouteExtractionError as exc:
        return {
            **context,
            "status": "brak danych",
            "missing_data": ["route"],
            "reason_pl": str(exc),
        }

    phase_component, return_component = sum_phase_and_return_route(segments)
    net_type, protection = _SYSTEM_MAP.get(system, _SYSTEM_MAP[_DEFAULT_SYSTEM])
    u_phase_v = trafo.ulv_kv * 1000.0 / math.sqrt(3.0)

    request = FaultLoopBuildRequest(
        fault_node_id=bus_ref,
        u_nom_v=u_phase_v,
        network_type=net_type,
        protection_arrangement=protection,
        phase_conductor_r_ohm=phase_component.r_ohm,
        phase_conductor_x_ohm=phase_component.x_ohm,
        return_conductor_r_ohm=return_component.r_ohm,
        return_conductor_x_ohm=return_component.x_ohm,
        transformer_r_ohm=z_tr.r_ohm,
        transformer_x_ohm=z_tr.x_ohm,
        transformer_label=f"Transformator SN/nN {trafo.name}",
        upstream_r_ohm=upstream.r_ohm,
        upstream_x_ohm=upstream.x_ohm,
        upstream_label=upstream.label,
        phase_label=phase_component.label,
        return_label=return_component.label,
    )
    loop_result = compute_fault_loop(build_fault_loop_input(request))

    swz = ocen_swz(ik1_min_a=loop_result.ik_min_a, u0_v=u_phase_v, aparat=aparat)

    return {
        **context,
        "status": "OK",
        # Transformator FAKTYCZNIE użyty do trasy i impedancji pętli — jawnie w
        # odpowiedzi, żeby przy stacji wielotransformatorowej werdykt SWZ dało
        # się przypisać do konkretnego transformatora (audytowalność, karta B-02).
        "transformer_ref": trafo.ref_id,
        "swz": swz.to_dict(),
        "fault_loop_min_scenario": loop_result.to_dict(),
        "missing_data": [],
    }
