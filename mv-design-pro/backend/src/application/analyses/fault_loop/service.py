"""Widok pętli zwarcia nN z modelu (G-STK-4, karta P0.6 — G-05).

Domyka łańcuch uziemienia G-STK-1 „do ostatniego klika": konfiguracja układu
sieci nN (``substation.meta.nn_earthing_system``) + impedancja transformatora
(z uk%/Sn/Ulv/Pk, składowa zgodna z grupą połączeń — zob. niżej) + REALNA
trasa kablowa (P0.6) + upstream Thevenin sieci SN (P0.6) → impedancja pętli
zwarcia w DOWOLNYM punkcie nN i prąd zwarcia jednofazowego Ik. Ochrona
przeciwporażeniowa przez samoczynne wyłączenie, IEC 60364-4-41.

Warstwa aplikacji: NIC nie liczy sama fizyki — ekstrakcja trasy z ENM żyje w
``.route`` (BFS, tylko odczyt pól gałęzi), a każde sumowanie/przeliczenie
(Z/n_parallel, pu→Ω, przekładnia) w ``network_model.solvers.fault_loop_builder``
(warstwa solvera, PHYSICS HERE ONLY). Tu tylko wyławiamy dane z modelu,
mapujemy układ i uczciwie raportujemy braki (zero fabrykacji).

JEDNA ŚCIEŻKA FIZYKI (KLASA NIE INSTANCJA): impedancja transformatora dla
pętli L-PE/L-PEN i upstream Thevenin sieci SN liczą się IDENTYCZNIE w KAŻDYM
punkcie nN — u źródła (szyna nN transformatora, trasa zerodługościowa),
w dowolnym wskazanym punkcie i w najdalszym punkcie każdego odpływu. Nie ma
drugiej, uproszczonej wersji tej samej fizyki dla „widoku u źródła".
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from enm.mapping import map_enm_to_network_graph, ref_to_graph_id
from enm.models import EnergyNetworkModel, Substation, Transformer
from enm.zero_sequence_transformer import (
    ZeroSeqConnection,
    build_transformer_zero_seq_model,
)
from network_model.core.ybus import S_BASE_MVA
from network_model.solvers.fault_loop_builder import (
    FaultLoopBuildRequest,
    LoopImpedanceComponent,
    TransformerLoopImpedance,
    build_fault_loop_input,
    refer_upstream_impedance_to_lv_ohm,
    sum_phase_and_return_route,
    zero_sequence_transformer_loop_impedance_ohm,
)
from network_model.solvers.fault_loop_iec60364 import (
    FaultLoopResult,
    NetworkType,
    ProtectionArrangement,
    compute_fault_loop,
)
from network_model.solvers.short_circuit_core import build_zbus

from .route import (
    RouteExtractionError,
    bfs_paths_from,
    group_bus_refs_by_feeder,
    path_to_bus,
    route_segments,
)

# Układ sieci nN → (typ solvera, sposób ochrony). TT/IT: metoda pętli TN nie
# dotyczy (inna fizyka zwarcia doziemnego) — raportujemy uczciwie, nie liczymy.
_SYSTEM_MAP: dict[str, tuple[NetworkType, ProtectionArrangement]] = {
    "TN-S": (NetworkType.TN_S, ProtectionArrangement.PE),
    "TN-C-S": (NetworkType.TN_C_S, ProtectionArrangement.PEN),
    "TN-C": (NetworkType.TN_C, ProtectionArrangement.PEN),
}
_DEFAULT_SYSTEM = "TN-C-S"
_NON_TN_SYSTEMS = {"TT", "IT"}

# Połączenia sekwencji zerowej dające LOKALNĄ drogę uziemienia po stronie nN
# (punkt gwiazdowy uzwojenia nN jest bezpośrednio/dostępnie uziemiony) — jedyne
# dla których pętla L-PE/L-PEN liczona metodą tego modułu ma fizyczny sens.
# Dyn11 (delta HV / gwiazda uziemiona nN) → LV_SHUNT_GROUND: „pełny obwód
# zerowy po stronie nN" (§0.1 karty P0.6) — dominujący przypadek dla stacji
# SN/nN w Polsce. SERIES_THROUGH (obie strony uziemione, np. YNyn0) TEŻ ma
# lokalne uziemienie nN, ale prąd zerowy propaguje się też przez stronę SN —
# ten moduł tego toru NIE dodaje (poza zakresem karty P0.6, uzasadnienie
# fizyczne dotyczy wyłącznie Dyn), więc SERIES_THROUGH jest tu ŚWIADOMIE
# wykluczone (fail-closed), nie zgadywane.
_LV_LOCAL_GROUND_CONNECTIONS = {ZeroSeqConnection.LV_SHUNT_GROUND}


def _find_station(enm: EnergyNetworkModel, station_ref: str) -> Substation | None:
    # Dopasowanie po ref_id (kanoniczny odnośnik domenowy) LUB id (UUID elementu),
    # spójnie z finderem ENM — wywołujący z inspektora podaje element.id.
    return next(
        (s for s in enm.substations if station_ref in (s.ref_id, getattr(s, "id", None))),
        None,
    )


def _station_transformer(enm: EnergyNetworkModel, station: Substation) -> Transformer | None:
    refs = set(station.transformer_refs or [])
    return next((t for t in enm.transformers if t.ref_id in refs), None)


@dataclass(frozen=True)
class UpstreamHvThevenin:
    """Impedancja Thevenina sieci SN w WĘŹLE HV transformatora — Ω w napięciu
    HV, NIE referowana do strony nN (karta T5b, docs/nn/KONCEPCJA_LOD_NN_2026-08.md,
    werdykt właściciela: ``UpstreamEquivalentSnapshot``).

    JEDNA ŚCIEŻKA FIZYKI (klasa nie instancja): dzielona podstawa dla
    ``_upstream_thevenin_lv_component`` (referuje TĘ SAMĄ wartość do strony nN
    kwadratem przekładni dla pętli zwarcia P0.6) i dla
    ``application.analyses.lv_domain.upstream_equivalent`` (kotwica SN domeny
    nN, T5b) — bez tego rozdzielenia druga ścieżka musiałaby powielić budowę
    grafu + odczyt Z-bus, dokładnie ten defekt, którego zakazuje CLAUDE.md §3.
    """

    hv_bus_ref: str
    z_hv_ohm: complex
    source_label: str


def compute_upstream_hv_thevenin(
    enm: EnergyNetworkModel, trafo: Transformer
) -> tuple[UpstreamHvThevenin | None, list[str]]:
    """Impedancja Thevenina sieci SN w węźle HV transformatora (Ω, NIE referowana).

    Reuse — zero własnej redukcji sieci: buduje TEN SAM graf i Z-bus co solver
    zwarciowy (``short_circuit_core.build_zbus``) i czyta Z_kk w węźle HV
    transformatora (impedancja widziana z zacisków HV, BEZ samego
    transformatora — gałąź TR prowadzi do sieci nN „w dół", nie z powrotem do
    źródła, więc nie ma podwójnego liczenia).

    Zwraca ``(None, missing)`` gdy zacisk HV nie jest częścią rozwiązywalnej
    sieci (brak zadeklarowanej szyny HV, sieć niepołączona z żadnym źródłem
    SN, model topologicznie niepoprawny — np. dwa węzły SLACK) —
    fail-closed, nigdy nie podstawia „silnego źródła" (nieskończonego)
    domyślnie ANI nie wywala się wyjątkiem na niepoprawnym modelu (endpoint
    MUSI zwrócić uczciwy stan, nie 500).
    """
    try:
        graph = map_enm_to_network_graph(enm)
    except ValueError:
        return None, ["upstream_network_topology_invalid"]

    hv_node_id = ref_to_graph_id(trafo.hv_bus_ref)
    if hv_node_id not in graph.nodes:
        return None, ["upstream_hv_bus"]

    try:
        builder, z_bus = build_zbus(graph)
    except (ValueError, ZeroDivisionError):
        return None, ["upstream_network_singular"]

    node_index = builder.node_id_to_index.get(hv_node_id)
    if node_index is None:
        return None, ["upstream_hv_bus"]

    z_base_ohm = builder.get_zbase_ohm(hv_node_id)
    z_kk_hv_ohm = complex(z_bus[node_index, node_index]) * z_base_ohm
    if z_kk_hv_ohm == 0:
        return None, ["upstream_network_source"]

    return (
        UpstreamHvThevenin(
            hv_bus_ref=hv_node_id,
            z_hv_ohm=z_kk_hv_ohm,
            source_label="Sieć SN (upstream Thevenin)",
        ),
        [],
    )


def _transformer_loop_impedance(
    trafo: Transformer,
) -> tuple[TransformerLoopImpedance | None, list[str]]:
    """Impedancja transformatora dla pętli L-PE/L-PEN, składowa ZGODNA z grupą
    połączeń (§0.1 karty P0.6).

    Reuse — zero własnej redukcji sieci sekwencji zerowej:
    ``enm.zero_sequence_transformer.build_transformer_zero_seq_model`` (już
    używane przez sieć składowej zerowej solvera zwarciowego) decyduje o typie
    połączenia; tu tylko przeliczenie pu→Ω
    (``zero_sequence_transformer_loop_impedance_ohm``, warstwa solvera).

    Zwraca ``(None, missing)`` gdy: brak parametrów TR (Sn/uk%/Ulv), brak
    ``vector_group``, albo grupa nie daje lokalnej drogi uziemienia strony nN
    (fail-closed — zero zgadywania dla grup innych niż rodzina Dyn).
    """
    missing: list[str] = []
    if not trafo.sn_mva or trafo.sn_mva <= 0:
        missing.append("sn_mva")
    if not trafo.uk_percent or trafo.uk_percent <= 0:
        missing.append("uk_percent")
    if not trafo.ulv_kv or trafo.ulv_kv <= 0:
        missing.append("ulv_kv")
    if missing:
        return None, missing

    if not trafo.vector_group:
        return None, ["vector_group"]

    zero_seq = build_transformer_zero_seq_model(trafo)
    if zero_seq.connection not in _LV_LOCAL_GROUND_CONNECTIONS or zero_seq.z0_pu is None:
        return None, [
            "transformer_zero_sequence_lv_local_ground",
        ]

    z_tr = zero_sequence_transformer_loop_impedance_ohm(
        z0_pu=zero_seq.z0_pu,
        ulv_kv=trafo.ulv_kv,
        s_base_mva=S_BASE_MVA,
    )
    return z_tr, []


def _upstream_thevenin_lv_component(
    enm: EnergyNetworkModel, trafo: Transformer
) -> tuple[LoopImpedanceComponent | None, list[str]]:
    """Impedancja Thevenina sieci SN w punkcie HV transformatora, sprowadzona do nN.

    Reuse — zero własnej redukcji sieci: buduje TEN SAM graf i Z-bus co solver
    zwarciowy (``short_circuit_core.build_zbus``), czyta Z_kk w węźle HV
    transformatora (impedancja widziana z zacisków HV, BEZ samego
    transformatora — gałąź TR prowadzi do sieci nN „w dół", nie z powrotem do
    źródła, więc nie ma podwójnego liczenia), i sprowadza do strony nN kwadratem
    przekładni (``refer_upstream_impedance_to_lv_ohm``).

    Zwraca ``(None, missing)`` gdy zacisk HV nie jest częścią rozwiązywalnej
    sieci (brak zadeklarowanej szyny HV, sieć niepołączona z żadnym źródłem
    SN, model topologicznie niepoprawny — np. dwa węzły SLACK) —
    fail-closed, nigdy nie podstawia „silnego źródła" (nieskończonego)
    domyślnie ANI nie wywala się wyjątkiem na niepoprawnym modelu (endpoint
    MUSI zwrócić uczciwy stan, nie 500).

    DELEGUJE do ``compute_upstream_hv_thevenin`` (Z1 SN w Ω HV, NIE referowana)
    i referuje WYNIK do strony nN — jedna ścieżka fizyki dzielona z kotwicą SN
    domeny nN (karta T5b), zero drugiej redukcji sieci.
    """
    hv_equiv, missing = compute_upstream_hv_thevenin(enm, trafo)
    if hv_equiv is None:
        return None, missing

    component = refer_upstream_impedance_to_lv_ohm(
        z_hv_ohm=hv_equiv.z_hv_ohm,
        uhv_kv=trafo.uhv_kv,
        ulv_kv=trafo.ulv_kv,
    )
    return component, []


def _system_for_station(station: Substation) -> str:
    return str((station.meta or {}).get("nn_earthing_system") or _DEFAULT_SYSTEM)


def _build_fault_loop_at_route(
    *,
    fault_node_id: str,
    u_phase_v: float,
    net_type: NetworkType,
    protection: ProtectionArrangement,
    z_tr: TransformerLoopImpedance,
    upstream: LoopImpedanceComponent | None,
    phase_component: LoopImpedanceComponent,
    return_component: LoopImpedanceComponent,
    transformer_label: str,
) -> FaultLoopResult:
    request = FaultLoopBuildRequest(
        fault_node_id=fault_node_id,
        u_nom_v=u_phase_v,
        network_type=net_type,
        protection_arrangement=protection,
        phase_conductor_r_ohm=phase_component.r_ohm,
        phase_conductor_x_ohm=phase_component.x_ohm,
        return_conductor_r_ohm=return_component.r_ohm,
        return_conductor_x_ohm=return_component.x_ohm,
        transformer_r_ohm=z_tr.r_ohm,
        transformer_x_ohm=z_tr.x_ohm,
        transformer_label=transformer_label,
        upstream_r_ohm=upstream.r_ohm if upstream is not None else None,
        upstream_x_ohm=upstream.x_ohm if upstream is not None else None,
        upstream_label=upstream.label if upstream is not None else "Sieć SN (upstream Thevenin)",
        phase_label=phase_component.label,
        return_label=return_component.label,
    )
    return compute_fault_loop(build_fault_loop_input(request))


def build_station_fault_loop_view(enm: EnergyNetworkModel, station_ref: str) -> dict[str, Any]:
    """Zbuduj widok pętli zwarcia u źródła stacji (nN) z modelu.

    Trasa zerodługościowa (punkt zwarcia = szyna nN transformatora) — przypadek
    szczególny TEJ SAMEJ funkcji, której używa ``build_fault_loop_view_at_point``
    dla dowolnego punktu (jedna ścieżka fizyki, zero duplikacji).
    """
    station = _find_station(enm, station_ref)
    if station is None:
        return {"status": "brak danych", "missing_data": ["station"], "station_ref": station_ref}

    system = _system_for_station(station)
    context: dict[str, Any] = {
        "station_ref": station_ref,
        "station_name": station.name,
        "network_system": system,
    }

    if system in _NON_TN_SYSTEMS:
        return {
            **context,
            "status": "nie dotyczy",
            "reason_pl": (
                f"Układ {system}: ochrona przeciwporażeniowa nie opiera się na samoczynnym "
                "wyłączeniu z pętli zwarcia TN (IEC 60364-4-41). Pętla TN nie jest liczona."
            ),
            "missing_data": [],
        }

    trafo = _station_transformer(enm, station)
    if trafo is None:
        return {**context, "status": "brak danych", "missing_data": ["transformer"]}

    z_tr, missing = _transformer_loop_impedance(trafo)
    if z_tr is None:
        return {**context, "status": "brak danych", "missing_data": missing}

    upstream, upstream_missing = _upstream_thevenin_lv_component(enm, trafo)
    if upstream is None:
        return {**context, "status": "brak danych", "missing_data": upstream_missing}

    net_type, protection = _SYSTEM_MAP.get(system, _SYSTEM_MAP[_DEFAULT_SYSTEM])
    u_phase_v = trafo.ulv_kv * 1000.0 / math.sqrt(3.0)
    zero_component = LoopImpedanceComponent(label="—", r_ohm=0.0, x_ohm=0.0)

    result = _build_fault_loop_at_route(
        fault_node_id=trafo.lv_bus_ref,
        u_phase_v=u_phase_v,
        net_type=net_type,
        protection=protection,
        z_tr=z_tr,
        upstream=upstream,
        phase_component=zero_component,
        return_component=zero_component,
        transformer_label=f"Transformator SN/nN {trafo.name}",
    )

    return {
        **context,
        "status": "OK",
        "transformer_ref": trafo.ref_id,
        "nn_bus_ref": trafo.lv_bus_ref,
        "transformer_impedance_ohm": {"r": z_tr.r_ohm, "x": z_tr.x_ohm},
        "upstream_impedance_ohm": {"r": upstream.r_ohm, "x": upstream.x_ohm},
        "fault_loop": result.to_dict(),
        "missing_data": [],
        "note_pl": (
            "Impedancja pętli zwarcia u źródła (szyna nN) — startowa dla obwodów nN. "
            "Napięcia dotyku i czas wyłączenia oceniane dla najdalszego punktu obwodu osobno."
        ),
    }


def build_fault_loop_view_at_point(
    enm: EnergyNetworkModel, station_ref: str, bus_ref: str
) -> dict[str, Any]:
    """Pętla zwarcia w DOWOLNYM punkcie nN (karta P0.6, §0.2).

    Trasa REALNA z grafu (BFS ``.route``) od punktu do zacisków nN
    transformatora — kabel po kablu, z żyłą powrotną i n_parallel; ta sama
    impedancja transformatora + upstream co ``build_station_fault_loop_view``.
    """
    station = _find_station(enm, station_ref)
    if station is None:
        return {
            "status": "brak danych",
            "missing_data": ["station"],
            "station_ref": station_ref,
            "bus_ref": bus_ref,
        }

    system = _system_for_station(station)
    context: dict[str, Any] = {
        "station_ref": station_ref,
        "station_name": station.name,
        "network_system": system,
        "bus_ref": bus_ref,
    }

    if system in _NON_TN_SYSTEMS:
        return {
            **context,
            "status": "nie dotyczy",
            "reason_pl": (
                f"Układ {system}: ochrona przeciwporażeniowa nie opiera się na samoczynnym "
                "wyłączeniu z pętli zwarcia TN (IEC 60364-4-41). Pętla TN nie jest liczona."
            ),
            "missing_data": [],
        }

    trafo = _station_transformer(enm, station)
    if trafo is None:
        return {**context, "status": "brak danych", "missing_data": ["transformer"]}

    z_tr, missing = _transformer_loop_impedance(trafo)
    if z_tr is None:
        return {**context, "status": "brak danych", "missing_data": missing}

    upstream, upstream_missing = _upstream_thevenin_lv_component(enm, trafo)
    if upstream is None:
        return {**context, "status": "brak danych", "missing_data": upstream_missing}

    try:
        path = path_to_bus(enm, trafo.lv_bus_ref, bus_ref)
        segments = route_segments(path)
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

    result = _build_fault_loop_at_route(
        fault_node_id=bus_ref,
        u_phase_v=u_phase_v,
        net_type=net_type,
        protection=protection,
        z_tr=z_tr,
        upstream=upstream,
        phase_component=phase_component,
        return_component=return_component,
        transformer_label=f"Transformator SN/nN {trafo.name}",
    )

    return {
        **context,
        "status": "OK",
        "transformer_ref": trafo.ref_id,
        "nn_bus_ref": trafo.lv_bus_ref,
        "hop_count": path.hop_count,
        "route_branch_refs": [b.ref_id for b in path.branches],
        "transformer_impedance_ohm": {"r": z_tr.r_ohm, "x": z_tr.x_ohm},
        "upstream_impedance_ohm": {"r": upstream.r_ohm, "x": upstream.x_ohm},
        "fault_loop": result.to_dict(),
        "missing_data": [],
    }


@dataclass(frozen=True)
class LvPointResult:
    """Wynik pętli zwarcia (albo uczciwy brak) w JEDNYM punkcie nN."""

    bus_ref: str
    hop_count: int
    status: str  # "OK" | "brak danych"
    fault_loop: dict[str, Any] | None = None
    reason_pl: str | None = None


@dataclass(frozen=True)
class FeederPoints:
    """Wszystkie punkty JEDNEGO odpływu + wskazanie najdalszego (najgorszego)."""

    feeder_root_branch_ref: str
    points: tuple[LvPointResult, ...]
    worst_point_bus_ref: str | None


def build_feeder_fault_loop_view(enm: EnergyNetworkModel, station_ref: str) -> dict[str, Any]:
    """Pętla zwarcia we WSZYSTKICH punktach nN, pogrupowana per odpływ (§0.2).

    Kontrakt danych kompletny (wszystkie punkty obwodu w odpowiedzi, karta
    P0.6) — heatmapa/UI nN STUDIO przyjdzie w P0.9, tu tylko dane. Dla
    każdego odpływu (pierwsza gałąź od szyny nN transformatora) zwraca
    KAŻDY osiągalny punkt (``LvPointResult``, ``status`` OK albo uczciwy brak
    per punkt — brak danych na jednym kablu NIE ukrywa pozostałych punktów
    tego odpływu) oraz ``worst_point_bus_ref`` — punkt o NAJWIĘKSZEJ
    impedancji pętli spośród punktów policzalnych tego odpływu (koniec
    najdłuższej elektrycznie gałęzi topologicznej).
    """
    station = _find_station(enm, station_ref)
    if station is None:
        return {
            "status": "brak danych",
            "missing_data": ["station"],
            "station_ref": station_ref,
            "feeders": [],
        }

    system = _system_for_station(station)
    context: dict[str, Any] = {
        "station_ref": station_ref,
        "station_name": station.name,
        "network_system": system,
    }

    if system in _NON_TN_SYSTEMS:
        return {
            **context,
            "status": "nie dotyczy",
            "reason_pl": (
                f"Układ {system}: ochrona przeciwporażeniowa nie opiera się na samoczynnym "
                "wyłączeniu z pętli zwarcia TN (IEC 60364-4-41). Pętla TN nie jest liczona."
            ),
            "missing_data": [],
            "feeders": [],
        }

    trafo = _station_transformer(enm, station)
    if trafo is None:
        return {**context, "status": "brak danych", "missing_data": ["transformer"], "feeders": []}

    z_tr, missing = _transformer_loop_impedance(trafo)
    if z_tr is None:
        return {**context, "status": "brak danych", "missing_data": missing, "feeders": []}

    upstream, upstream_missing = _upstream_thevenin_lv_component(enm, trafo)
    if upstream is None:
        return {
            **context,
            "status": "brak danych",
            "missing_data": upstream_missing,
            "feeders": [],
        }

    net_type, protection = _SYSTEM_MAP.get(system, _SYSTEM_MAP[_DEFAULT_SYSTEM])
    u_phase_v = trafo.ulv_kv * 1000.0 / math.sqrt(3.0)

    paths = bfs_paths_from(enm, trafo.lv_bus_ref)
    # Grupowanie per odpływ = pierwsza gałąź trasy od szyny TR (§0.2 karty),
    # REUSE `route.group_bus_refs_by_feeder` (karta ARKUSZ-NN, 2026-08-14).
    feeder_bus_refs = group_bus_refs_by_feeder(paths)

    feeders: list[dict[str, Any]] = []
    for root_branch_ref in sorted(feeder_bus_refs):
        points: list[LvPointResult] = []
        worst_bus_ref: str | None = None
        worst_magnitude = -1.0
        for bus_ref in sorted(feeder_bus_refs[root_branch_ref]):
            path = paths[bus_ref]
            try:
                segments = route_segments(path)
            except RouteExtractionError as exc:
                points.append(
                    LvPointResult(
                        bus_ref=bus_ref,
                        hop_count=path.hop_count,
                        status="brak danych",
                        reason_pl=str(exc),
                    )
                )
                continue
            phase_component, return_component = sum_phase_and_return_route(segments)
            result = _build_fault_loop_at_route(
                fault_node_id=bus_ref,
                u_phase_v=u_phase_v,
                net_type=net_type,
                protection=protection,
                z_tr=z_tr,
                upstream=upstream,
                phase_component=phase_component,
                return_component=return_component,
                transformer_label=f"Transformator SN/nN {trafo.name}",
            )
            points.append(
                LvPointResult(
                    bus_ref=bus_ref,
                    hop_count=path.hop_count,
                    status="OK",
                    fault_loop=result.to_dict(),
                )
            )
            magnitude = abs(result.z_loop_ohm)
            if magnitude > worst_magnitude:
                worst_magnitude = magnitude
                worst_bus_ref = bus_ref

        feeders.append(
            {
                "feeder_root_branch_ref": root_branch_ref,
                "points": [
                    {
                        "bus_ref": p.bus_ref,
                        "hop_count": p.hop_count,
                        "status": p.status,
                        "fault_loop": p.fault_loop,
                        "reason_pl": p.reason_pl,
                    }
                    for p in points
                ],
                "worst_point_bus_ref": worst_bus_ref,
            }
        )

    return {
        **context,
        "status": "OK",
        "transformer_ref": trafo.ref_id,
        "nn_bus_ref": trafo.lv_bus_ref,
        "transformer_impedance_ohm": {"r": z_tr.r_ohm, "x": z_tr.x_ohm},
        "upstream_impedance_ohm": {"r": upstream.r_ohm, "x": upstream.x_ohm},
        "feeders": feeders,
        "missing_data": [],
    }
