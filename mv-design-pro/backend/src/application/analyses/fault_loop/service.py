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

STACJA WIELOTRANSFORMATOROWA (karta B-02 slice B, §0.1). Do 2026-09-01 KAŻDY
widok pętli zwarcia brał ``_station_transformer`` — PIERWSZY transformator
stacji — i liczył od niego pętlę dla WSZYSTKICH odpływów. Przy stacji 2×TR ze
sprzęgłem ZAMKNIĘTYM odpływy sekcji 2 dostawały impedancję TR1 powiększoną o
trasę przez sprzęgło (zawyżone Z_loop, zaniżone Ik — werdykt SWZ liczony na
niewłaściwej trasie), a przy sprzęgle OTWARTYM znikały z widoku zupełnie
(BFS od szyny nN TR1 ich nie dosięgał). Naprawa jest KLASOWA, nie punktowa:
``assign_station_lv_buses`` przypisuje KAŻDĄ szynę nN stacji do transformatora
NAJBLIŻSZEGO po zamkniętych gałęziach (remis → mniejszy ``ref_id``), a
``build_feeder_fault_loop_view_for_transformer`` liczy odpływy WYŁĄCZNIE tego
transformatora, którego szyna nN jest ich korzeniem.
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
from network_model.core.graph import NetworkGraph
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
    LvBusPath,
    RouteExtractionError,
    bfs_paths_from,
    group_bus_refs_by_feeder,
    incomer_branch_refs,
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

#: Zasilanie odpływu — WYŁĄCZNIE stwierdzenie topologiczne (z ilu transformatorów
#: stacji szyny odpływu są osiągalne po ZAMKNIĘTYCH gałęziach), zero fizyki.
SUPPLY_ONE_SIDED = "jednostronne"
SUPPLY_MULTI_SIDED = "wielostronne"

#: Założenie zachowawcze dla odpływu osiągalnego z ≥2 transformatorów (§0.1 karty
#: B-02): impedancji równoległych NIE składamy w warstwie aplikacji (byłoby to
#: naruszenie NOT-A-SOLVER — nowa fizyka poza solverem), więc pętla liczy się od
#: transformatora WŁASNEJ sekcji. Wynik jest po bezpiecznej stronie: pojedynczy
#: transformator daje MNIEJSZY prąd zwarcia niż dwa pracujące równolegle.
SUPPLY_ASSUMPTION_MULTI_PL = (
    "pętla zwarcia liczona od transformatora własnej sekcji (założenie "
    "zachowawcze: sprzęgło otwarte / jeden transformator w pracy — mniejszy "
    "prąd zwarcia = warunek doboru SWZ)"
)


def _find_station(enm: EnergyNetworkModel, station_ref: str) -> Substation | None:
    # Dopasowanie po ref_id (kanoniczny odnośnik domenowy) LUB id (UUID elementu),
    # spójnie z finderem ENM — wywołujący z inspektora podaje element.id.
    return next(
        (s for s in enm.substations if station_ref in (s.ref_id, getattr(s, "id", None))),
        None,
    )


def station_transformers(enm: EnergyNetworkModel, station: Substation) -> list[Transformer]:
    """WSZYSTKIE transformatory stacji, posortowane po ``ref_id`` (determinizm).

    Kolejność po ``ref_id``, a nie po pozycji w ``enm.transformers``, bo to ta
    sama reguła, którą stosuje kotwica SN domeny nN
    (``lv_domain.upstream_equivalent``) — dwie różne kolejności w dwóch
    modułach dawały przy stacji 2×TR snapshot upstream jednego transformatora
    i pętlę zwarcia drugiego (dwie prawdy o „transformatorze stacji").
    """
    refs = set(station.transformer_refs or ())
    return sorted((t for t in enm.transformers if t.ref_id in refs), key=lambda t: t.ref_id)


def resolve_station_transformer(
    enm: EnergyNetworkModel, station: Substation, transformer_ref: str | None
) -> tuple[Transformer | None, list[str]]:
    """Wybór transformatora stacji — JEDNO źródło prawdy dla wszystkich widoków nN.

    ``transformer_ref`` wskazany jawnie: musi istnieć w modelu (inaczej
    ``["transformer"]``) i należeć do tej stacji (inaczej
    ``["transformer_not_in_station"]``). Bez wskazania: PIERWSZY transformator
    stacji posortowany po ``ref_id`` — determinizm, ten sam wybór co
    ``station_transformers``.
    """
    if transformer_ref is not None:
        trafo = next((t for t in enm.transformers if t.ref_id == transformer_ref), None)
        if trafo is None:
            return None, ["transformer"]
        if trafo.ref_id not in set(station.transformer_refs or ()):
            return None, ["transformer_not_in_station"]
        return trafo, []
    transformers = station_transformers(enm, station)
    if not transformers:
        return None, ["transformer"]
    return transformers[0], []


@dataclass(frozen=True)
class LvBusAssignment:
    """Przypisanie szyn nN stacji do transformatorów — CZYSTA TOPOLOGIA.

    ``paths_by_transformer`` — trasy BFS (po gałęziach ``status="closed"``) od
    szyny nN każdego transformatora stacji.
    ``owner_by_bus`` — transformator, od którego szyna jest osiągalna
    NAJMNIEJSZĄ liczbą hopów (remis → mniejszy ``ref_id``). Trasa od
    właściciela NIGDY nie przechodzi przez szynę nN innego transformatora: gdyby
    przechodziła, tamten transformator dosięgałby szyny hopami mniej i to on
    byłby właścicielem. Dzięki temu każdy odpływ ma DOKŁADNIE jednego
    właściciela — bez podwójnego liczenia tych samych punktów.
    ``supplying_by_bus`` — WSZYSTKIE transformatory stacji, z których szyna jest
    osiągalna (posortowane); ≥2 pozycje = zasilanie wielostronne.
    """

    paths_by_transformer: dict[str, dict[str, LvBusPath]]
    owner_by_bus: dict[str, str]
    supplying_by_bus: dict[str, tuple[str, ...]]


def assign_station_lv_buses(
    enm: EnergyNetworkModel, transformers: list[Transformer]
) -> LvBusAssignment:
    """Przypisz szyny nN do transformatorów stacji (BFS wieloźródłowy, deterministyczny)."""
    paths_by_transformer: dict[str, dict[str, LvBusPath]] = {}
    for trafo in transformers:
        try:
            paths_by_transformer[trafo.ref_id] = bfs_paths_from(enm, trafo.lv_bus_ref)
        except RouteExtractionError:
            # Szyna nN transformatora nie istnieje w modelu — uczciwy brak tras,
            # nie wyjątek na całym widoku stacji (pozostałe TR liczą się dalej).
            paths_by_transformer[trafo.ref_id] = {}

    owner_by_bus: dict[str, str] = {}
    supplying: dict[str, list[str]] = {}
    for transformer_ref in sorted(paths_by_transformer):
        for bus_ref, path in paths_by_transformer[transformer_ref].items():
            supplying.setdefault(bus_ref, []).append(transformer_ref)
            current_owner = owner_by_bus.get(bus_ref)
            if current_owner is None:
                owner_by_bus[bus_ref] = transformer_ref
                continue
            current_hops = paths_by_transformer[current_owner][bus_ref].hop_count
            if (path.hop_count, transformer_ref) < (current_hops, current_owner):
                owner_by_bus[bus_ref] = transformer_ref

    return LvBusAssignment(
        paths_by_transformer=paths_by_transformer,
        owner_by_bus=owner_by_bus,
        supplying_by_bus={bus: tuple(sorted(refs)) for bus, refs in supplying.items()},
    )


def resolve_transformer_for_bus(
    enm: EnergyNetworkModel, station: Substation, bus_ref: str
) -> tuple[Transformer | None, list[str]]:
    """Transformator stacji ZASILAJĄCY WSKAZANY PUNKT nN — JEDNO źródło prawdy
    dla KAŻDEGO widoku „per punkt" (pętla zwarcia w punkcie, SWZ, Ik1_min doboru
    aparatu, pakiet dowodowy obwodu, wiersz arkusza, sekcja raportu).

    Właściciel szyny wg ``assign_station_lv_buses`` (transformator najbliższy po
    ZAMKNIĘTYCH gałęziach; remis → mniejszy ``ref_id``). Punkt nieosiągalny z
    żadnego transformatora stacji (odcięty otwartym łącznikiem, spoza stacji)
    dostaje transformator DOMYŚLNY (pierwszy po ``ref_id``) — wtedy brak trasy
    jest meldowany przez wołającego jako ``missing_data: ["route"]``, nie jako
    brak transformatora (transformator stacji istnieje; nie ma DROGI do punktu).

    Klasa, nie instancja (karta B-02): do 2026-09-01 pięć miejsc w czterech
    modułach brało „pierwszy transformator stacji" dla punktu w DOWOLNEJ sekcji —
    punkt sekcji 2 stacji 2×TR liczył się od TR1 przez sprzęgło (zła impedancja)
    albo nie miał trasy (sprzęgło otwarte).
    """
    assignment = assign_station_lv_buses(enm, station_transformers(enm, station))
    return resolve_station_transformer(enm, station, assignment.owner_by_bus.get(bus_ref))


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


def restrict_graph_to_island_of(graph: NetworkGraph, node_id: str) -> bool:
    """Zawęź graf (W MIEJSCU) do wyspy zasilania zawierającej ``node_id``.

    Wyspa = spójna składowa po AKTYWNYCH krawędziach grafu (gałęzie w ruchu +
    łączniki ZAMKNIĘTE — otwarty łącznik nie jest krawędzią, patrz
    ``NetworkGraph.add_switch``). Węzły spoza tej wyspy są usuwane razem z ich
    gałęziami/łącznikami (``NetworkGraph.remove_node``).

    Dlaczego (klasa B-02, defekt zastany zmierzony 2026-09-01): Z-bus liczy się
    z odwrócenia Y-bus CAŁEJ sieci, a szyna bez żadnej aktywnej krawędzi
    (podszyna za OTWARTYM rozłącznikiem, sekcja rezerwowa, wyspa DER) daje
    wiersz zerowy → macierz osobliwa GLOBALNIE. Skutek: jeden odcięty zacisk w
    modelu unieważniał upstream Thevenina, a więc KAŻDĄ pętlę zwarcia, KAŻDY
    werdykt SWZ i kotwicę SN całej stacji („upstream_network_singular"), choć
    fizycznie odcięta szyna nie ma z tymi obwodami nic wspólnego. Impedancja
    Thevenina w węźle jest własnością WYSPY tego węzła — węzły z innych wysp
    nie wnoszą do niej nic, więc ich usunięcie nie zmienia wyniku dla sieci
    spójnej (Z_kk identyczne), a dla sieci z wyspami daje wynik zamiast błędu.

    Zwraca ``False``, gdy ``node_id`` nie istnieje w grafie (nic nie zmieniono).
    Zero fizyki: czysta topologia stanów łączników, ta sama definicja wyspy co
    ``NetworkGraph.find_islands`` (jedno źródło prawdy).
    """
    if node_id not in graph.nodes:
        return False
    island = next(
        (set(members) for members in graph.find_islands() if node_id in members), {node_id}
    )
    removed = {other for other in graph.nodes if other not in island}
    for other in sorted(removed):
        graph.remove_node(other)
    # `remove_node` usuwa gałęzie i łączniki; źródła przypięte do usuniętych
    # węzłów (falowniki, maszyny, źródła zwarciowe sieci) też nie mogą zostać —
    # graf odwołujący się do nieistniejącego węzła jest niespójny.
    for collection in (
        graph.inverter_sources,
        graph.synchronous_machine_sources,
        graph.asynchronous_machine_sources,
        graph.grid_sc_sources,
    ):
        for element_id in sorted(
            element_id
            for element_id, element in collection.items()
            if getattr(element, "node_id", None) in removed
        ):
            del collection[element_id]
    return True


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
    if not restrict_graph_to_island_of(graph, hv_node_id):
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


def build_station_fault_loop_view(
    enm: EnergyNetworkModel, station_ref: str, *, transformer_ref: str | None = None
) -> dict[str, Any]:
    """Zbuduj widok pętli zwarcia u źródła stacji (nN) z modelu.

    Trasa zerodługościowa (punkt zwarcia = szyna nN transformatora) — przypadek
    szczególny TEJ SAMEJ funkcji, której używa ``build_fault_loop_view_at_point``
    dla dowolnego punktu (jedna ścieżka fizyki, zero duplikacji).

    ``transformer_ref`` (karta B-02) wskazuje transformator stacji; bez
    wskazania — domyślny (pierwszy po ``ref_id``). Przy stacji 2×TR „źródło" nie
    jest jedno: szyna nN każdego transformatora ma własną pętlę u źródła, więc
    bez tego parametru drugiej sekcji NIE DAŁO SIĘ w ogóle zapytać.
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

    trafo, transformer_missing = resolve_station_transformer(enm, station, transformer_ref)
    if trafo is None:
        return {**context, "status": "brak danych", "missing_data": transformer_missing}

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
    enm: EnergyNetworkModel, station_ref: str, bus_ref: str, *, transformer_ref: str | None = None
) -> dict[str, Any]:
    """Pętla zwarcia w DOWOLNYM punkcie nN (karta P0.6, §0.2).

    Trasa REALNA z grafu (BFS ``.route``) od punktu do zacisków nN
    transformatora — kabel po kablu, z żyłą powrotną i n_parallel; ta sama
    impedancja transformatora + upstream co ``build_station_fault_loop_view``.

    TRANSFORMATOR (karta B-02): bez wskazania ``transformer_ref`` bierzemy ten,
    KTÓRY ZASILA WSKAZANY PUNKT — właściciela szyny wg
    ``assign_station_lv_buses`` (najbliższy po zamkniętych gałęziach). Wcześniej
    był to zawsze „pierwszy transformator stacji", więc punkt w sekcji 2 stacji
    2×TR liczył się od TR1 przez sprzęgło (zła impedancja) albo w ogóle nie miał
    trasy (sprzęgło otwarte). Punkt nieosiągalny z żadnego transformatora
    stacji zostaje przy domyślnym transformatorze — wtedy brak trasy jest
    uczciwie meldowany jako ``missing_data: ["route"]``, dokładnie jak dotąd.
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

    trafo, transformer_missing = (
        resolve_transformer_for_bus(enm, station, bus_ref)
        if transformer_ref is None
        else resolve_station_transformer(enm, station, transformer_ref)
    )
    if trafo is None:
        return {**context, "status": "brak danych", "missing_data": transformer_missing}

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


def build_feeder_fault_loop_view_for_transformer(
    enm: EnergyNetworkModel, station_ref: str, transformer_ref: str
) -> dict[str, Any]:
    """Pętla zwarcia odpływów JEDNEGO transformatora stacji (karta B-02, §0.1).

    Odpływ należy do tego transformatora, od którego szyny nN zaczyna się jego
    trasa (``assign_station_lv_buses`` — najbliższy transformator po zamkniętych
    gałęziach). Odpływ osiągalny z ≥2 transformatorów stacji (sprzęgło
    ZAMKNIĘTE) dostaje ``supply="wielostronne"`` i JAWNE
    ``supply_assumption_pl``: pętla liczy się od transformatora WŁASNEJ sekcji,
    bo składania impedancji równoległych nie wolno robić w warstwie aplikacji
    (NOT-A-SOLVER) — a wynik jednego transformatora jest po bezpiecznej stronie
    kryterium SWZ. Odpływ zasilany z jednego transformatora:
    ``supply="jednostronne"``, ``supply_assumption_pl=None``.

    Kształt odpowiedzi jest DOKŁADNIE taki jak
    ``build_feeder_fault_loop_view`` dla stacji jednotransformatorowej (te same
    klucze) — plus dwa pola ``supply*`` na każdym odpływie.
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

    trafo, transformer_missing = resolve_station_transformer(enm, station, transformer_ref)
    if trafo is None:
        return {
            **context,
            "status": "brak danych",
            "missing_data": transformer_missing,
            "feeders": [],
        }

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

    assignment = assign_station_lv_buses(enm, station_transformers(enm, station))
    paths = assignment.paths_by_transformer.get(trafo.ref_id, {})
    # Grupowanie per odpływ = pierwsza gałąź trasy od szyny TR (§0.2 karty P0.6),
    # REUSE `route.group_bus_refs_by_feeder` (karta ARKUSZ-NN, 2026-08-14),
    # ZAWĘŻONE do szyn, których właścicielem jest TEN transformator (karta B-02).
    owned_paths = {
        bus_ref: path
        for bus_ref, path in paths.items()
        if assignment.owner_by_bus.get(bus_ref) == trafo.ref_id
    }
    # Odpływ zaczyna się na szynie rozdzielnicy, nie na zacisku transformatora:
    # wyłącznik główny nN (incomer) nie jest odpływem (`route.incomer_branch_refs`).
    incomers = incomer_branch_refs(
        enm, station.bus_refs, [t.lv_bus_ref for t in station_transformers(enm, station)]
    )
    feeder_bus_refs = group_bus_refs_by_feeder(owned_paths, incomers)

    feeders: list[dict[str, Any]] = []
    for root_branch_ref in sorted(feeder_bus_refs):
        points: list[LvPointResult] = []
        worst_bus_ref: str | None = None
        worst_magnitude = -1.0
        bus_refs_of_feeder = sorted(feeder_bus_refs[root_branch_ref])
        for bus_ref in bus_refs_of_feeder:
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

        # Osiągalność jest własnością SPÓJNEJ SKŁADOWEJ zamkniętych gałęzi, więc
        # wszystkie szyny jednego odpływu mają tę samą listę zasilających
        # transformatorów — bierzemy ją z dowolnej (pierwszej) szyny odpływu.
        supplying = assignment.supplying_by_bus.get(bus_refs_of_feeder[0], (trafo.ref_id,))
        multi_sided = len(supplying) >= 2
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
                "supply": SUPPLY_MULTI_SIDED if multi_sided else SUPPLY_ONE_SIDED,
                "supply_assumption_pl": SUPPLY_ASSUMPTION_MULTI_PL if multi_sided else None,
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


def build_feeder_fault_loop_view(enm: EnergyNetworkModel, station_ref: str) -> dict[str, Any]:
    """Pętla zwarcia we WSZYSTKICH punktach nN stacji, pogrupowana per odpływ.

    Kontrakt danych kompletny (wszystkie punkty obwodu w odpowiedzi, karta
    P0.6) — dla każdego odpływu (pierwsza gałąź od szyny nN transformatora)
    zwraca KAŻDY osiągalny punkt (``LvPointResult``, ``status`` OK albo uczciwy
    brak per punkt — brak danych na jednym kablu NIE ukrywa pozostałych punktów
    tego odpływu) oraz ``worst_point_bus_ref`` — punkt o NAJWIĘKSZEJ impedancji
    pętli spośród punktów policzalnych tego odpływu.

    Widok jest PĘTLĄ PO WSZYSTKICH TRANSFORMATORACH stacji (karta B-02, §0.1):
    każdy odpływ liczy się od SWOJEGO transformatora, a odpowiedź scala odpływy
    wszystkich transformatorów posortowane po ``feeder_root_branch_ref``. Dla
    stacji jednotransformatorowej wynik jest identyczny co do wartości z
    poprzednim (jednotransformatorowym) widokiem — plus pola ``supply*``.
    Pola nagłówkowe (``transformer_ref``, ``nn_bus_ref``,
    ``transformer_impedance_ohm``, ``upstream_impedance_ohm``) opisują PIERWSZY
    policzalny transformator stacji; konsument potrzebujący rozbicia per
    transformator woła ``build_feeder_fault_loop_view_for_transformer``
    (tak robi ``lv_domain.projection_v1``).
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

    transformers = station_transformers(enm, station)
    if not transformers:
        return {**context, "status": "brak danych", "missing_data": ["transformer"], "feeders": []}

    per_transformer = [
        build_feeder_fault_loop_view_for_transformer(enm, station_ref, trafo.ref_id)
        for trafo in transformers
    ]
    computable = [view for view in per_transformer if view.get("status") == "OK"]
    missing_data = sorted(
        {
            f"{trafo.ref_id}:{item}"
            for trafo, view in zip(transformers, per_transformer, strict=True)
            if view.get("status") != "OK"
            for item in view.get("missing_data", [])
        }
    )

    if not computable:
        # Wszystkie transformatory nieobliczalne — status i braki pierwszego z
        # nich (stacja 1×TR: DOKŁADNIE poprzednie zachowanie, bo prefiks braku
        # dokłada się dopiero przy stacji wielotransformatorowej).
        first = per_transformer[0]
        if len(transformers) == 1:
            return {**context, **{k: first[k] for k in ("status", "missing_data")}, "feeders": []}
        return {
            **context,
            "status": "brak danych",
            "missing_data": missing_data,
            "feeders": [],
        }

    head = computable[0]
    feeders = sorted(
        (feeder for view in computable for feeder in view["feeders"]),
        key=lambda row: str(row["feeder_root_branch_ref"]),
    )
    return {
        **context,
        "status": "OK",
        "transformer_ref": head["transformer_ref"],
        "nn_bus_ref": head["nn_bus_ref"],
        "transformer_impedance_ohm": head["transformer_impedance_ohm"],
        "upstream_impedance_ohm": head["upstream_impedance_ohm"],
        "feeders": feeders,
        "missing_data": missing_data,
    }
