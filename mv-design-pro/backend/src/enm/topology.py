"""
Warstwa topologiczna ENM — JEDYNY serwis topologii (konstytucja C.2.2, CV-4.3).

Dwie czyste, deterministyczne funkcje ENM → widok:

* ``derive(snapshot) -> TopologyView`` — topologia WYPROWADZANA z migawki (nigdy
  zapisywana jako prawda, konstytucja C.2.1): węzły topologiczne (szyny scalone
  przez ZAMKNIĘTE łączniki), wyspy (składowe po gałęziach w ruchu i transformatorach),
  sekcje (składowe BEZ transformatorów — domeny napięciowe), źródła odniesienia per
  wyspa (źródło sieciowe / maszyna synchroniczna / asynchroniczna — IEC 60909-0 §4.2),
  punkty otwarte. Konsumenci: assembler IR, wykonawcy biegów, walidator, projekcja nN,
  gotowość, N-1. Algorytmy grafowe pochodzą WYŁĄCZNIE z
  ``network_model.core.topologia`` (to samo jądro woła IR: ``NetworkGraph``,
  ``AdmittanceMatrixBuilder``) — jedna implementacja, dwa poziomy identyfikatorów.
* ``build_topology_graph(enm) -> TopologyGraph`` — identyfikacja TRUNK, korytarzy,
  punktów wejścia, węzłów T (SLD / geometria stacji).

Semantyka „w ruchu" jest TA SAMA co w ``enm/mapping.py`` (ENM → IR): gałąź
(linia, kabel, łącznik, bezpiecznik) łączy szyny wtedy i tylko wtedy, gdy
``status == "closed"``; transformator łączy zawsze; element z końcem poza szynami
migawki nie łączy niczego (jest wykazany w ``krawedzie_pominiete``, nie gubiony
cicho). Element NIEOBECNY w migawce efektywnej (``out_of_service`` scenariusza,
konstytucja B.3) po prostu nie istnieje — nie ma osobnej flagi ``in_service``.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from network_model.core.topologia import przeglad_wszerz, scal_wezly, skladowe_spojne

from .models import (
    Cable,
    EnergyNetworkModel,
    Junction,
    OverheadLine,
)

#: Typy gałęzi ENM będące łącznikami: zamknięty łącznik SCALA szyny w jeden węzeł
#: topologiczny (CN → TN), linia/kabel — nie (to impedancja między dwoma węzłami).
#: Zbiór zgodny z ``enm/mapping.py`` (``SwitchBranch.type`` + ``FuseBranch.type``).
TYPY_LACZNIKOW_ENM: frozenset[str] = frozenset(
    {"switch", "breaker", "bus_coupler", "disconnector", "fuse"}
)
#: Generatory będące maszynami z impedancją do odniesienia w zwarciu (IEC 60909-0 §4.2,
#: równoważne źródło napięciowe): synchroniczne oraz asynchroniczne (Type 3 DFIG,
#: SCIG). Falownik (pv_inverter, bess, wind_inverter, fw_pmsg) jest źródłem
#: PRĄDOWYM bez impedancji (§6.8) — wyspa zasilana wyłącznie falownikami nie ma
#: odniesienia. Jedno źródło prawdy dla ``enm/mapping.py`` i wykonawców.
TYPY_MASZYN_SYNCHRONICZNYCH: frozenset[str] = frozenset({"synchronous"})
TYPY_MASZYN_ASYNCHRONICZNYCH: frozenset[str] = frozenset({"fw_dfig", "fw_scig"})


def _kolekcja(snapshot: object, nazwa: str) -> list[object]:
    if isinstance(snapshot, Mapping):
        wartosc = snapshot.get(nazwa) or []
    else:
        wartosc = getattr(snapshot, nazwa, None) or []
    return list(wartosc)


def _pole(element: object, nazwa: str, domyslne: object = None) -> object:
    if isinstance(element, Mapping):
        return element.get(nazwa, domyslne)
    return getattr(element, nazwa, domyslne)


@dataclass(frozen=True)
class Wyspa:
    """Wyspa = składowa spójna szyn po gałęziach w ruchu i transformatorach."""

    szyny: tuple[str, ...]
    #: ``ref_id`` źródeł sieciowych (``Source``) na szynach wyspy.
    zrodla_sieciowe: tuple[str, ...]
    #: ``ref_id`` generatorów będących maszynami synchronicznymi/asynchronicznymi.
    maszyny: tuple[str, ...]
    #: ``ref_id`` WSZYSTKICH generatorów na szynach wyspy (maszyny + falowniki).
    generatory: tuple[str, ...]

    @property
    def zasilona(self) -> bool:
        """Zasilenie = obecność źródła sieciowego (semantyka E003 walidatora i
        energizacji nN: generator NIE zasila wyspy — może zniknąć ze scenariusza)."""
        return bool(self.zrodla_sieciowe)

    @property
    def ma_odniesienie(self) -> bool:
        """Impedancja do odniesienia w zwarciu: źródło sieciowe albo maszyna
        (``canonical_analysis._wezly_bez_impedancji_do_odniesienia``, CI-PARYTET-5)."""
        return bool(self.zrodla_sieciowe or self.maszyny)


@dataclass(frozen=True)
class TopologyView:
    """Topologia wyprowadzona z migawki efektywnej. Wszystkie krotki posortowane;
    kolejność wysp i sekcji: malejąco po liczbie szyn, potem po pierwszej szynie."""

    szyny: tuple[str, ...]
    #: szyna → reprezentant węzła topologicznego (najmniejszy ``ref_id`` klasy
    #: scalonej ZAMKNIĘTYMI łącznikami); szyna bez łącznika reprezentuje samą siebie.
    wezel_topologiczny: Mapping[str, str]
    wyspy: tuple[Wyspa, ...]
    #: składowe po gałęziach w ruchu BEZ transformatorów (domeny napięciowe).
    sekcje: tuple[tuple[str, ...], ...]
    laczniki_otwarte: tuple[str, ...]
    galezie_otwarte: tuple[str, ...]
    #: ``ref_id`` gałęzi/transformatorów z końcem poza szynami migawki (nie łączą).
    krawedzie_pominiete: tuple[str, ...]

    def wyspa_szyny(self, ref_id: str) -> Wyspa | None:
        for wyspa in self.wyspy:
            if ref_id in wyspa.szyny:
                return wyspa
        return None

    def szyny_bez_odniesienia(self) -> frozenset[str]:
        return frozenset(s for w in self.wyspy if not w.ma_odniesienie for s in w.szyny)

    def szyny_niezasilone(self) -> frozenset[str]:
        return frozenset(s for w in self.wyspy if not w.zasilona for s in w.szyny)

    @property
    def wezly_topologiczne(self) -> tuple[str, ...]:
        return tuple(sorted(set(self.wezel_topologiczny.values())))


def _uporzadkuj(skladowe: Iterable[tuple[str, ...]]) -> tuple[tuple[str, ...], ...]:
    return tuple(sorted(skladowe, key=lambda s: (-len(s), s[0])))


def derive(snapshot: EnergyNetworkModel | Mapping[str, object]) -> TopologyView:
    """Wyprowadź ``TopologyView`` z migawki (``EnergyNetworkModel`` albo słownik ENM).

    Czysta funkcja: ten sam model → identyczny widok, niezależnie od kolejności
    elementów w kolekcjach (szyny sortowane po ``ref_id``).
    """
    szyny = tuple(sorted(str(_pole(b, "ref_id")) for b in _kolekcja(snapshot, "buses")))
    znane = set(szyny)

    krawedzie_wysp: list[tuple[str, str]] = []
    krawedzie_sekcji: list[tuple[str, str]] = []
    pary_laczen: list[tuple[str, str]] = []
    laczniki_otwarte: list[str] = []
    galezie_otwarte: list[str] = []
    pominiete: list[str] = []

    for galaz in sorted(_kolekcja(snapshot, "branches"), key=lambda g: str(_pole(g, "ref_id"))):
        ref = str(_pole(galaz, "ref_id"))
        a = str(_pole(galaz, "from_bus_ref"))
        b = str(_pole(galaz, "to_bus_ref"))
        if a not in znane or b not in znane:
            pominiete.append(ref)
            continue
        lacznik = str(_pole(galaz, "type")) in TYPY_LACZNIKOW_ENM
        if _pole(galaz, "status", "closed") != "closed":
            (laczniki_otwarte if lacznik else galezie_otwarte).append(ref)
            continue
        krawedzie_wysp.append((a, b))
        krawedzie_sekcji.append((a, b))
        if lacznik:
            pary_laczen.append((a, b))

    for trafo in sorted(_kolekcja(snapshot, "transformers"), key=lambda t: str(_pole(t, "ref_id"))):
        hv = str(_pole(trafo, "hv_bus_ref"))
        lv = str(_pole(trafo, "lv_bus_ref"))
        if hv not in znane or lv not in znane:
            pominiete.append(str(_pole(trafo, "ref_id")))
            continue
        krawedzie_wysp.append((hv, lv))

    zrodla_szyny: dict[str, list[str]] = {}
    for zrodlo in _kolekcja(snapshot, "sources"):
        szyna = str(_pole(zrodlo, "bus_ref"))
        if szyna in znane:
            zrodla_szyny.setdefault(szyna, []).append(str(_pole(zrodlo, "ref_id")))
    maszyny_szyny: dict[str, list[str]] = {}
    generatory_szyny: dict[str, list[str]] = {}
    for gen in _kolekcja(snapshot, "generators"):
        szyna = str(_pole(gen, "bus_ref"))
        if szyna not in znane:
            continue
        ref = str(_pole(gen, "ref_id"))
        generatory_szyny.setdefault(szyna, []).append(ref)
        typ = _pole(gen, "gen_type")
        if typ in TYPY_MASZYN_SYNCHRONICZNYCH or typ in TYPY_MASZYN_ASYNCHRONICZNYCH:
            maszyny_szyny.setdefault(szyna, []).append(ref)

    wyspy = tuple(
        Wyspa(
            szyny=skladowa,
            zrodla_sieciowe=tuple(sorted(r for s in skladowa for r in zrodla_szyny.get(s, ()))),
            maszyny=tuple(sorted(r for s in skladowa for r in maszyny_szyny.get(s, ()))),
            generatory=tuple(sorted(r for s in skladowa for r in generatory_szyny.get(s, ()))),
        )
        for skladowa in _uporzadkuj(skladowe_spojne(szyny, krawedzie_wysp))
    )
    return TopologyView(
        szyny=szyny,
        wezel_topologiczny=scal_wezly(szyny, pary_laczen),
        wyspy=wyspy,
        sekcje=_uporzadkuj(skladowe_spojne(szyny, krawedzie_sekcji)),
        laczniki_otwarte=tuple(laczniki_otwarte),
        galezie_otwarte=tuple(galezie_otwarte),
        krawedzie_pominiete=tuple(pominiete),
    )


@dataclass(frozen=True)
class TrunkSegment:
    """Segment toru głównego SN (od GPZ w dół)."""

    branch_ref: str
    from_bus_ref: str
    to_bus_ref: str
    length_km: float
    order: int


@dataclass(frozen=True)
class EntryPoint:
    """Punkt wejścia kabli zewnętrznych do stacji."""

    substation_ref: str
    bus_ref: str
    entry_point_ref: str | None


@dataclass(frozen=True)
class TopologyNode:
    """Węzeł topologiczny (szyna z metadanymi topologicznymi)."""

    bus_ref: str
    voltage_kv: float
    is_source_bus: bool
    substation_ref: str | None
    junction_ref: str | None
    degree: int  # liczba gałęzi podłączonych


@dataclass(frozen=True)
class TopologyGraph:
    """Graf topologiczny — projekcja ENM na przestrzeń topologiczną.

    INVARIANT: Ten sam ENM → identyczny TopologyGraph (determinizm).
    """

    nodes: tuple[TopologyNode, ...]
    trunk_segments: tuple[TrunkSegment, ...]
    entry_points: tuple[EntryPoint, ...]
    corridors: tuple[CorridorInfo, ...]
    junctions: tuple[JunctionInfo, ...]
    source_bus_refs: tuple[str, ...]
    stats: TopologyStats


@dataclass(frozen=True)
class CorridorInfo:
    """Informacja o magistrali."""

    ref_id: str
    name: str
    corridor_type: str
    segment_count: int
    total_length_km: float
    has_no_point: bool


@dataclass(frozen=True)
class JunctionInfo:
    """Informacja o węźle T."""

    ref_id: str
    name: str
    junction_type: str
    branch_count: int
    bus_ref: str | None


@dataclass(frozen=True)
class TopologyStats:
    """Statystyki topologiczne."""

    bus_count: int
    branch_count: int
    transformer_count: int
    substation_count: int
    bay_count: int
    junction_count: int
    corridor_count: int
    total_line_length_km: float
    source_count: int


def build_topology_graph(enm: EnergyNetworkModel) -> TopologyGraph:
    """
    Zbuduj graf topologiczny z ENM.

    Czysta, deterministyczna funkcja. Ten sam ENM → identyczny wynik.

    Args:
        enm: EnergyNetworkModel — kanoniczny model sieci.

    Returns:
        TopologyGraph z pełną informacją topologiczną.
    """
    # Zbierz referencje
    source_bus_refs = sorted({s.bus_ref for s in enm.sources})
    {b.ref_id: b for b in enm.buses}
    branch_map = {b.ref_id: b for b in enm.branches}
    {s.ref_id: s for s in enm.substations}
    {j.ref_id: j for j in enm.junctions}

    # Bus → substation mapping
    bus_to_sub: dict[str, str] = {}
    for sub in enm.substations:
        for br in sub.bus_refs:
            bus_to_sub[br] = sub.ref_id

    # Bus → junction mapping
    bus_to_junc: dict[str, str] = {}
    for _junc in enm.junctions:
        # Heurystyka: szukamy szyny, która ma ≥3 gałęzie (T-node)
        # Na razie mapujemy po branch_refs
        pass

    # Policz stopień węzłów (degree)
    bus_degree: dict[str, int] = {b.ref_id: 0 for b in enm.buses}
    for branch in enm.branches:
        if branch.status == "closed":
            if branch.from_bus_ref in bus_degree:
                bus_degree[branch.from_bus_ref] += 1
            if branch.to_bus_ref in bus_degree:
                bus_degree[branch.to_bus_ref] += 1
    for trafo in enm.transformers:
        if trafo.hv_bus_ref in bus_degree:
            bus_degree[trafo.hv_bus_ref] += 1
        if trafo.lv_bus_ref in bus_degree:
            bus_degree[trafo.lv_bus_ref] += 1

    # Buduj TopologyNodes (posortowane po ref_id dla determinizmu)
    topo_nodes = []
    for bus in sorted(enm.buses, key=lambda b: b.ref_id):
        topo_nodes.append(
            TopologyNode(
                bus_ref=bus.ref_id,
                voltage_kv=bus.voltage_kv,
                is_source_bus=bus.ref_id in source_bus_refs,
                substation_ref=bus_to_sub.get(bus.ref_id),
                junction_ref=bus_to_junc.get(bus.ref_id),
                degree=bus_degree.get(bus.ref_id, 0),
            )
        )

    # Buduj trunk segments (segmenty toru głównego)
    trunk_segments = _identify_trunk(enm, source_bus_refs)

    # Buduj entry points
    entry_points = []
    for sub in sorted(enm.substations, key=lambda s: s.ref_id):
        for br in sorted(sub.bus_refs):
            entry_points.append(
                EntryPoint(
                    substation_ref=sub.ref_id,
                    bus_ref=br,
                    entry_point_ref=sub.entry_point_ref,
                )
            )

    # Corridor info
    corridor_infos = []
    for corr in sorted(enm.corridors, key=lambda c: c.ref_id):
        total_len = 0.0
        for seg_ref in corr.ordered_segment_refs:
            # Osobna nazwa: `branch` z petli po `enm.branches` (wyzej) NIGDY nie jest
            # `None`, a `branch_map.get()` moze nie znalezc segmentu. Wspoldzielenie
            # nazwy chowalo mozliwy brak przed analiza.
            segment = branch_map.get(seg_ref)
            if segment and isinstance(segment, OverheadLine | Cable):
                total_len += segment.length_km
        corridor_infos.append(
            CorridorInfo(
                ref_id=corr.ref_id,
                name=corr.name,
                corridor_type=corr.corridor_type,
                segment_count=len(corr.ordered_segment_refs),
                total_length_km=round(total_len, 3),
                has_no_point=corr.no_point_ref is not None,
            )
        )

    # Junction info
    junction_infos = []
    for junc in sorted(enm.junctions, key=lambda j: j.ref_id):
        # Spróbuj znaleźć szynę powiązaną z węzłem T
        # Heurystyka: szyna, której degree ≥ 3 i jest podłączona do gałęzi z junction
        junc_bus = _find_junction_bus(junc, enm)
        junction_infos.append(
            JunctionInfo(
                ref_id=junc.ref_id,
                name=junc.name,
                junction_type=junc.junction_type,
                branch_count=len(junc.connected_branch_refs),
                bus_ref=junc_bus,
            )
        )

    # Statystyki
    total_line_length = 0.0
    for branch in enm.branches:
        if isinstance(branch, OverheadLine | Cable):
            total_line_length += branch.length_km

    stats = TopologyStats(
        bus_count=len(enm.buses),
        branch_count=len(enm.branches),
        transformer_count=len(enm.transformers),
        substation_count=len(enm.substations),
        bay_count=len(enm.bays),
        junction_count=len(enm.junctions),
        corridor_count=len(enm.corridors),
        total_line_length_km=round(total_line_length, 3),
        source_count=len(enm.sources),
    )

    return TopologyGraph(
        nodes=tuple(topo_nodes),
        trunk_segments=tuple(trunk_segments),
        entry_points=tuple(entry_points),
        corridors=tuple(corridor_infos),
        junctions=tuple(junction_infos),
        source_bus_refs=tuple(source_bus_refs),
        stats=stats,
    )


def _identify_trunk(
    enm: EnergyNetworkModel,
    source_bus_refs: list[str],
) -> list[TrunkSegment]:
    """Identyfikuj segmenty toru głównego SN (BFS od szyny zasilającej)."""
    if not source_bus_refs:
        return []

    # Zbierz gałęzie indeksowane po szynie
    bus_branches: dict[str, list[tuple[str, str, float]]] = {}
    for branch in enm.branches:
        if branch.status != "closed":
            continue
        if isinstance(branch, OverheadLine | Cable):
            length = branch.length_km
        else:
            length = 0.0
        bus_branches.setdefault(branch.from_bus_ref, []).append(
            (branch.ref_id, branch.to_bus_ref, length)
        )
        bus_branches.setdefault(branch.to_bus_ref, []).append(
            (branch.ref_id, branch.from_bus_ref, length)
        )

    # Uwzględnij transformatory (łączą szyny WN/SN — kluczowe dla trunk BFS)
    for trafo in enm.transformers:
        bus_branches.setdefault(trafo.hv_bus_ref, []).append((trafo.ref_id, trafo.lv_bus_ref, 0.0))
        bus_branches.setdefault(trafo.lv_bus_ref, []).append((trafo.ref_id, trafo.hv_bus_ref, 0.0))

    # Przegląd wszerz od kolejnych szyn źródłowych ze wspólnym zbiorem odwiedzonych —
    # jedyne jądro (``network_model.core.topologia.przeglad_wszerz``); kolejność
    # segmentów = kolejność odkrycia szyn, jak dotąd.
    visited: set[str] = set()
    trunk: list[TrunkSegment] = []

    def _sasiedzi(current: str) -> list[tuple[tuple[str, float], str]]:
        return [
            ((br_ref, length), next_bus)
            for br_ref, next_bus, length in sorted(
                bus_branches.get(current, []), key=lambda x: x[0]
            )
        ]

    for src_bus in source_bus_refs:
        drzewo = przeglad_wszerz(src_bus, _sasiedzi, odwiedzone=visited)
        for next_bus, rodzic in drzewo.items():
            if rodzic is None:
                continue
            (br_ref, length), current = rodzic
            trunk.append(
                TrunkSegment(
                    branch_ref=br_ref,
                    from_bus_ref=current,
                    to_bus_ref=next_bus,
                    length_km=length,
                    order=len(trunk),
                )
            )

    return trunk


def _find_junction_bus(junc: Junction, enm: EnergyNetworkModel) -> str | None:
    """Znajdź szynę powiązaną z węzłem T (heurystyka: wspólna szyna gałęzi)."""
    bus_counts: dict[str, int] = {}
    branch_map = {b.ref_id: b for b in enm.branches}
    for br_ref in junc.connected_branch_refs:
        branch = branch_map.get(br_ref)
        if branch:
            bus_counts[branch.from_bus_ref] = bus_counts.get(branch.from_bus_ref, 0) + 1
            bus_counts[branch.to_bus_ref] = bus_counts.get(branch.to_bus_ref, 0) + 1

    if not bus_counts:
        return None

    # Szyna z największą liczbą powiązań
    return max(bus_counts, key=lambda k: bus_counts[k])
