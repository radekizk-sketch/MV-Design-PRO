"""Energizacja domeny nN — ZACISKI, ODCINKI, WYSPY (kontrakt 3.0.0).

Warstwa APLIKACJI, ZERO FIZYKI: żadna wartość tu policzona nie jest napięciem,
prądem ani impedancją — to wyłącznie odpowiedź na pytanie „co jest z czym
połączone przy OBECNYCH stanach łączników i jakie źródła stoją za tym
połączeniem". Graf domeny (``graph_view``) jest świadomie NIEZALEŻNY od stanu
łączeniowego (łącznik otwarty to wciąż ta sama domena elektryczna); ten moduł
dokłada do niego DRUGĄ, ortogonalną warstwę informacji, ROZDZIELONĄ na trzy
pytania, których NIE WOLNO zlewać (mandat „profesjonalizacja SLD nN" §5):

* ŁĄCZNOŚĆ (``connectivity_state`` odcinka) — czy odcinek przewodzi:
  ``CLOSED``/``OPEN`` z ``Branch.status``;
* STAN ŁĄCZNIKA — to samo pole ``status`` gałęzi, niesione przez aparat;
* ENERGIZACJA (``energization_state``) — osobno dla KAŻDEGO ZACISKU (szyny)
  i dla KAŻDEGO ODCINKA. Oba zaciski aparatu OTWARTEGO mogą być pod
  napięciem z DWÓCH RÓŻNYCH wysp — dlatego stan jest per zacisk, a nie per
  aparat.

STANY ENERGIZACJI (jedna zamknięta lista dla zacisków, odcinków i wysp):

* ``ENERGIZED`` — dokładnie jedno źródło zasilające sekcję (transformator ze
  źródłem po stronie SN, ``Source`` nN albo źródło rozproszone tworzące
  napięcie w wyspie);
* ``MULTISOURCE`` — ≥2 źródła zasilają TĘ SAMĄ sekcję równolegle (sprzęgło
  zamknięte przy 2×TR tego samego systemu SN, dwa TR na wspólnej szynie, dwa
  źródła tworzące napięcie w jednej wyspie);
* ``CONFLICT`` — praca równoległa, której model NIE dopuszcza bez
  rozstrzygnięcia: sekcje zasilane z NIEZALEŻNYCH systemów SN (różne
  ``upstream_system_id``) spięte po stronie nN, albo źródło w trybie
  tworzenia napięcia (``GRID_FORMING`` bez trybu podwójnego) równolegle z
  siecią;
* ``UNKNOWN`` — wyspa bez sieci, w której stoi źródło rozproszone o
  NIEZADEKLAROWANEJ zdolności pracy wyspowej — nie wiemy, czy wyspa jest pod
  napięciem, i NIE zgadujemy;
* ``DEENERGIZED`` — brak jakiegokolwiek źródła zdolnego utrzymać napięcie
  (także: wyłącznie źródła podążające za siecią — PV grid-following w wyspie
  NIE utrzymuje napięcia, §14).

ŹRÓDŁO ENERGIZACJI SIECIOWEJ jest to samo co w regule walidatora E060
(``enm/validator.py::_check_nn_topology``): KAŻDY ``Source`` (SN albo nN)
osiągalny po zamkniętych gałęziach i transformatorach (transformator jest
krawędzią ZAWSZE — wyłącza go łącznik pola). ``Generator`` NIE jest źródłem
energizacji SIECIOWEJ; w WYSPIE (bez ``Source``) generator utrzymuje napięcie
WYŁĄCZNIE, gdy ma zadeklarowaną zdolność tworzenia napięcia
(``resolve_der_island_capability``).

ZDOLNOŚĆ PRACY WYSPOWEJ ŹRÓDŁA (``DerIslandCapability``) czytana jest z
DANYCH modelu, nigdy zgadywana: ``Generator.meta.island_capability`` (jawna
deklaracja), inaczej ``meta.control_mode`` / ``materialized_params.control_mode``
(ten sam kanał, którym ``enm/canonical_analysis.py`` czyta tryb regulacji
falownika; wartości katalogu przekształtników ``GRID_FORMING``/
``GRID_FOLLOWING``), inaczej KLASA MASZYNY: maszyna synchroniczna ma własne
wzbudzenie (tworzy napięcie), maszyna indukcyjna (``fw_scig``/``fw_dfig``)
bez sieci napięcia nie wytworzy (podąża). Falownik bez deklaracji →
``UNKNOWN``. Pole NIE jest nowym polem modelu Pydantic: dopisanie pola z
domyślnym ``None`` zmieniłoby ``compute_input_hash`` KAŻDEGO modelu z
generatorem (zmierzone: ``model_dump(mode="json")`` NIE pomija ``None``), a
odciski modeli są zamrożone (Determinism Rule).

WYSPA (``Island``) = spójna składowa ENERGETYCZNA (zamknięte gałęzie +
transformatory) zawężona do szyn domeny — NIE sekcja rozdzielnicy. Przy 2×TR
i sprzęgle OTWARTYM obie sekcje są W JEDNEJ wyspie (obie wiszą na tej samej
sieci SN); rozdziela je dopiero brak drogi do wspólnego źródła. Wyspa niesie
komplet §14–§16: ``is_islanded``, ``energizing_source_ids``,
``has_grid_forming_source``, źródła odniesienia f/U, odniesienie N/PE,
bilans mocy ZNAMIONOWEJ (suma ``p_mw`` z modelu — dane źródłowe, nie wynik
solvera), dopuszczalność pracy wyspowej i komunikaty walidacji.

NIEZALEŻNE SYSTEMY SN (``upstream_system_id``): składowa energetyczna sieci
PO USUNIĘCIU szyn domeny nN — dwa transformatory stacji mają ten sam system,
gdy ich szyny SN łączą się bez przechodzenia przez nN. Identyfikator = najmniejszy
``ref_id`` szyny składowej (deterministyczny, bez UUID).

ŚCIEŻKI ZASILANIA (``SupplyPath``) — dla każdej zasilonej szyny domeny lista
gałęzi od szyny źródła (zacisk nN transformatora / szyna ``Source`` / szyna
źródła tworzącego napięcie) do tej szyny po zamkniętych gałęziach (BFS,
sąsiedzi po ``ref_id`` gałęzi). Renderer podświetla tor Z TYCH DANYCH — zero
BFS po stronie klienta (§37/§38).

Determinizm: wszystkie listy sortowane po ``ref_id``, wyspy numerowane w
kolejności najmniejszego ``bus_ref`` w wyspie.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from enm.models import Branch, EnergyNetworkModel, Generator, Substation
from enm.severity import SEVERITY_BLOCKER, SEVERITY_IMPORTANT, SEVERITY_INFO
from network_model.core.topologia import przeglad_wszerz, skladowe_spojne

EnergizationState = Literal["ENERGIZED", "DEENERGIZED", "UNKNOWN", "CONFLICT", "MULTISOURCE"]
ConnectivityState = Literal["CLOSED", "OPEN"]
DerIslandCapability = Literal["GRID_FOLLOWING", "GRID_FORMING", "DUAL_MODE", "UNKNOWN"]
PowerBalanceState = Literal["z_sieci", "nadwyzka", "deficyt", "zrownowazony", "brak_danych"]
NeutralReferenceStatus = Literal["OK", "brak_ukladu", "brak_zrodla"]

#: Stany, w których szyna JEST pod napięciem (``is_energized`` = True).
ENERGIZED_STATES: frozenset[str] = frozenset({"ENERGIZED", "MULTISOURCE", "CONFLICT"})

#: Wartości deklaracji trybu akceptowane z ``meta``/``materialized_params``
#: (wielkość liter i myślnik/podkreślenie nieistotne).
_CAPABILITY_ALIASES: dict[str, DerIslandCapability] = {
    "GRID_FORMING": "GRID_FORMING",
    "GRIDFORMING": "GRID_FORMING",
    "GFM": "GRID_FORMING",
    "GRID_FOLLOWING": "GRID_FOLLOWING",
    "GRIDFOLLOWING": "GRID_FOLLOWING",
    "GFL": "GRID_FOLLOWING",
    "DUAL_MODE": "DUAL_MODE",
    "DUALMODE": "DUAL_MODE",
    "DUAL": "DUAL_MODE",
}

#: Klasa maszyny rozstrzyga zdolność BEZ deklaracji tylko tam, gdzie wynika
#: ona z fizyki maszyny, nie z nastaw sterowania.
_CAPABILITY_BY_MACHINE_CLASS: dict[str, tuple[DerIslandCapability, str]] = {
    # Maszyna synchroniczna ma własne wzbudzenie (tworzy napięcie w wyspie) i
    # ZARAZEM pracuje równolegle z siecią po synchronizacji — to zdolność
    # PODWÓJNA, nie „tylko tworząca" (ta byłaby konfliktem przy pracy z siecią).
    "synchronous": (
        "DUAL_MODE",
        "maszyna synchroniczna — własne wzbudzenie (wyspa) i praca równoległa po synchronizacji",
    ),
    "fw_scig": (
        "GRID_FOLLOWING",
        "maszyna indukcyjna klatkowa — bez sieci nie wytwarza napięcia",
    ),
    "fw_dfig": (
        "GRID_FOLLOWING",
        "maszyna indukcyjna dwustronnie zasilana — bez sieci nie wytwarza napięcia",
    ),
}


def _normalize_capability(value: Any) -> DerIslandCapability | None:
    if not isinstance(value, str) or not value.strip():
        return None
    return _CAPABILITY_ALIASES.get(value.strip().upper().replace("-", "_"))


def resolve_der_island_capability(gen: Generator) -> tuple[DerIslandCapability, str]:
    """Zdolność źródła rozproszonego do utrzymania napięcia w wyspie + ŹRÓDŁO
    tej informacji po polsku (WHITE BOX: skąd wiemy). Kolejność: jawna
    deklaracja ``meta.island_capability`` → ``meta.control_mode`` →
    ``materialized_params.control_mode`` → klasa maszyny → ``UNKNOWN``."""
    meta = gen.meta if isinstance(gen.meta, dict) else {}
    declared = _normalize_capability(meta.get("island_capability"))
    if declared is not None:
        return declared, "deklaracja meta.island_capability"
    from_meta_mode = _normalize_capability(meta.get("control_mode"))
    if from_meta_mode is not None:
        return from_meta_mode, "tryb regulacji meta.control_mode"
    params = gen.materialized_params if isinstance(gen.materialized_params, dict) else {}
    from_params_mode = _normalize_capability(params.get("control_mode"))
    if from_params_mode is not None:
        return (
            from_params_mode,
            "tryb regulacji z katalogu przekształtnika (materialized_params.control_mode)",
        )
    by_class = _CAPABILITY_BY_MACHINE_CLASS.get(str(gen.gen_type or ""))
    if by_class is not None:
        return by_class
    return (
        "UNKNOWN",
        "brak deklaracji zdolności pracy wyspowej (meta.island_capability / control_mode)",
    )


def _is_forming(capability: DerIslandCapability) -> bool:
    return capability in ("GRID_FORMING", "DUAL_MODE")


@dataclass(frozen=True)
class ValidationMessage:
    """Komunikat walidacji/audytu — jeden kształt dla wysp i audytu topologii."""

    code: str
    severity: str
    message_pl: str
    element_refs: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "severity": self.severity,
            "message_pl": self.message_pl,
            "element_refs": list(self.element_refs),
        }


@dataclass(frozen=True)
class DerState:
    """Źródło rozproszone w domenie ze zdolnością pracy wyspowej."""

    ref_id: str
    bus_ref: str
    island_capability: DerIslandCapability
    capability_source_pl: str
    island_operation_capable: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "ref_id": self.ref_id,
            "bus_ref": self.bus_ref,
            "island_capability": self.island_capability,
            "capability_source_pl": self.capability_source_pl,
            "island_operation_capable": self.island_operation_capable,
        }


@dataclass(frozen=True)
class TerminalState:
    """Stan energizacji JEDNEGO zacisku (szyny) domeny."""

    bus_ref: str
    energization_state: EnergizationState
    #: Kto podaje napięcie NA TĘ SEKCJĘ po samych zamkniętych gałęziach:
    #: transformatory (zacisk nN w sekcji), ``Source`` w sekcji, źródła tworzące
    #: napięcie w sekcji. ODRĘBNE pytanie od wyspy: przy sprzęgle OTWARTYM sekcja A
    #: nie może meldować transformatora sekcji B (jest w tej samej wyspie przez SN).
    supply_refs: tuple[str, ...]
    island_ref: str
    #: Prawda WYŁĄCZNIE dla źródła sieciowego (``Source`` osiągalny) — pomocnicze
    #: rozróżnienie „z sieci" / „z wyspy DER".
    grid_energized: bool

    @property
    def is_energized(self) -> bool | None:
        if self.energization_state == "UNKNOWN":
            return None
        return self.energization_state in ENERGIZED_STATES

    def to_dict(self) -> dict[str, Any]:
        return {
            "energization_state": self.energization_state,
            "is_energized": self.is_energized,
            "supply_refs": list(self.supply_refs),
            "island_ref": self.island_ref,
            "grid_energized": self.grid_energized,
        }


@dataclass(frozen=True)
class NeutralReference:
    """Odniesienie N/PE wyspy (§16): układ sieci + element, który je wnosi."""

    system: str | None
    source_ref: str | None
    status: NeutralReferenceStatus
    status_pl: str
    swz_evaluable: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "system": self.system,
            "source_ref": self.source_ref,
            "status": self.status,
            "status_pl": self.status_pl,
            "swz_evaluable": self.swz_evaluable,
        }


@dataclass(frozen=True)
class PowerBalance:
    """Bilans mocy ZNAMIONOWEJ wyspy (suma ``p_mw`` modelu — dane źródłowe)."""

    p_generation_mw: float
    p_load_mw: float
    state: PowerBalanceState

    def to_dict(self) -> dict[str, Any]:
        return {
            "p_generation_mw": self.p_generation_mw,
            "p_load_mw": self.p_load_mw,
            "state": self.state,
            "basis_pl": "suma mocy znamionowych z modelu (dane źródłowe, nie wynik rozpływu)",
        }


@dataclass(frozen=True)
class Island:
    """Wyspa = spójna składowa energetyczna zawężona do szyn domeny (§14)."""

    island_ref: str
    bus_refs: tuple[str, ...]
    energization_state: EnergizationState
    is_islanded: bool
    grid_source_refs: tuple[str, ...]
    transformer_refs: tuple[str, ...]
    energizing_source_ids: tuple[str, ...]
    der_refs: tuple[str, ...]
    has_grid_forming_source: bool
    frequency_reference_source_id: str | None
    voltage_reference_source_id: str | None
    upstream_system_ids: tuple[str, ...]
    neutral_reference: NeutralReference
    power_balance: PowerBalance
    island_operation_allowed: bool | None
    validation_messages: tuple[ValidationMessage, ...] = field(default_factory=tuple)

    @property
    def is_energized(self) -> bool | None:
        if self.energization_state == "UNKNOWN":
            return None
        return self.energization_state in ENERGIZED_STATES

    def to_dict(self) -> dict[str, Any]:
        return {
            "island_ref": self.island_ref,
            "bus_refs": list(self.bus_refs),
            "energization_state": self.energization_state,
            "is_energized": self.is_energized,
            "is_islanded": self.is_islanded,
            "grid_source_refs": list(self.grid_source_refs),
            "transformer_refs": list(self.transformer_refs),
            "energizing_source_ids": list(self.energizing_source_ids),
            "der_refs": list(self.der_refs),
            "has_grid_forming_source": self.has_grid_forming_source,
            "frequency_reference_source_id": self.frequency_reference_source_id,
            "voltage_reference_source_id": self.voltage_reference_source_id,
            "upstream_system_ids": list(self.upstream_system_ids),
            "neutral_reference": self.neutral_reference.to_dict(),
            "power_balance": self.power_balance.to_dict(),
            "island_operation_allowed": self.island_operation_allowed,
            "validation_messages": [m.to_dict() for m in self.validation_messages],
        }


@dataclass(frozen=True)
class SegmentState:
    """Stan JEDNEGO odcinka (gałęzi domeny) — mapa energizacji odcinków (§6)."""

    segment_id: str
    from_bus_ref: str
    to_bus_ref: str
    connectivity_state: ConnectivityState
    from_terminal: TerminalState
    to_terminal: TerminalState
    #: Stan PRZEWODNIKA: przy ``CLOSED`` = wspólny stan obu zacisków (są w jednej
    #: sekcji); przy ``OPEN`` odcinek nie prowadzi prądu — ``DEENERGIZED``, a stan
    #: każdej strony niosą ``from_terminal``/``to_terminal`` (renderer rysuje
    #: kikuty po stanach zacisków, nigdy „po jednym końcu").
    energization_state: EnergizationState
    source_ids: tuple[str, ...]
    island_ref: str | None
    voltage_level_id: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "segment_id": self.segment_id,
            "from_bus_ref": self.from_bus_ref,
            "to_bus_ref": self.to_bus_ref,
            "connectivity_state": self.connectivity_state,
            "from_terminal": self.from_terminal.to_dict(),
            "to_terminal": self.to_terminal.to_dict(),
            "energization_state": self.energization_state,
            "source_ids": list(self.source_ids),
            "island_ref": self.island_ref,
            "voltage_level_id": self.voltage_level_id,
        }


@dataclass(frozen=True)
class SupplyPath:
    """Tor zasilania JEDNEJ szyny od JEDNEGO źródła (lista gałęzi po kolei)."""

    bus_ref: str
    source_ref: str
    source_bus_ref: str
    branch_refs: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "bus_ref": self.bus_ref,
            "source_ref": self.source_ref,
            "source_bus_ref": self.source_bus_ref,
            "branch_refs": list(self.branch_refs),
        }


@dataclass(frozen=True)
class EnergizationView:
    """Stan zasilania domeny: zaciski, odcinki, wyspy, źródła DER, tory."""

    terminals: dict[str, TerminalState]
    segments: tuple[SegmentState, ...]
    islands: tuple[Island, ...]
    ders: tuple[DerState, ...]
    supply_paths: tuple[SupplyPath, ...]
    #: Systemy SN (składowe sieci bez szyn domeny) per transformator domeny.
    upstream_system_by_transformer: dict[str, str | None]


def _components(bus_refs: set[str], adjacency: dict[str, set[str]]) -> dict[str, frozenset[str]]:
    """Spójne składowe grafu nieskierowanego — składowa per szyna.

    Liczone JEDYNYM jądrem topologii (``network_model.core.topologia.skladowe_spojne``,
    CV-4.3); sąsiedztwo spoza ``bus_refs`` jest pomijane jak dotąd.
    """
    krawedzie = [(a, b) for a in sorted(adjacency) for b in sorted(adjacency[a])]
    component_of: dict[str, frozenset[str]] = {}
    for skladowa in skladowe_spojne(sorted(bus_refs), krawedzie):
        frozen = frozenset(skladowa)
        for ref in skladowa:
            component_of[ref] = frozen
    return component_of


def _earthing_system(station: Substation | None) -> str | None:
    if station is None:
        return None
    meta = station.meta if isinstance(station.meta, dict) else {}
    value = meta.get("nn_earthing_system")
    return str(value) if value else None


def build_energization_view(
    enm: EnergyNetworkModel,
    domain_bus_refs: set[str],
    domain_branches: dict[str, Branch] | None = None,
    station: Substation | None = None,
    voltage_level_by_bus: dict[str, str] | None = None,
) -> EnergizationView:
    """Zbuduj stan zasilania domeny (patrz docstring modułu).

    ``domain_branches`` — gałęzie domeny (klucz ``ref_id``) dla mapy odcinków;
    ``station`` — stacja-korzeń (układ uziemienia sieci nN); ``voltage_level_by_bus``
    — tożsamość poziomu napięcia per szyna (mirror frontendu), do odcinków.
    """
    known_bus_refs = {b.ref_id for b in enm.buses}
    domain_branches = domain_branches or {}
    voltage_level_by_bus = voltage_level_by_bus or {}

    # Składowa ZASILANIA: zamknięte gałęzie + transformatory (krawędź zawsze).
    energized_adjacency: dict[str, set[str]] = {ref: set() for ref in known_bus_refs}
    # Składowa SEKCJI: WYŁĄCZNIE zamknięte gałęzie (bez transformatorów).
    section_adjacency: dict[str, set[str]] = {ref: set() for ref in known_bus_refs}
    # Sąsiedztwo sekcji z NAZWĄ gałęzi (do torów zasilania).
    section_edges: dict[str, list[tuple[str, str]]] = {ref: [] for ref in known_bus_refs}

    for branch in enm.branches:
        if branch.status != "closed":
            continue
        if branch.from_bus_ref not in known_bus_refs or branch.to_bus_ref not in known_bus_refs:
            continue
        energized_adjacency[branch.from_bus_ref].add(branch.to_bus_ref)
        energized_adjacency[branch.to_bus_ref].add(branch.from_bus_ref)
        section_adjacency[branch.from_bus_ref].add(branch.to_bus_ref)
        section_adjacency[branch.to_bus_ref].add(branch.from_bus_ref)
        section_edges[branch.from_bus_ref].append((branch.ref_id, branch.to_bus_ref))
        section_edges[branch.to_bus_ref].append((branch.ref_id, branch.from_bus_ref))

    for trafo in enm.transformers:
        if trafo.hv_bus_ref not in known_bus_refs or trafo.lv_bus_ref not in known_bus_refs:
            continue
        energized_adjacency[trafo.hv_bus_ref].add(trafo.lv_bus_ref)
        energized_adjacency[trafo.lv_bus_ref].add(trafo.hv_bus_ref)

    energized_component = _components(known_bus_refs, energized_adjacency)
    section_component = _components(known_bus_refs, section_adjacency)

    # SYSTEMY SN: składowe energetyczne PO USUNIĘCIU szyn domeny — dwa
    # transformatory mają wspólny system, gdy ich szyny SN łączą się bez nN.
    sn_bus_refs = known_bus_refs - domain_bus_refs
    sn_adjacency = {
        ref: {n for n in neighbors if n in sn_bus_refs}
        for ref, neighbors in energized_adjacency.items()
        if ref in sn_bus_refs
    }
    sn_component = _components(sn_bus_refs, sn_adjacency)

    source_refs_by_bus: dict[str, list[str]] = {}
    for source in enm.sources:
        if source.bus_ref in known_bus_refs:
            source_refs_by_bus.setdefault(source.bus_ref, []).append(source.ref_id)
    transformers_by_lv_bus: dict[str, list[Any]] = {}
    for trafo in enm.transformers:
        if trafo.lv_bus_ref in known_bus_refs:
            transformers_by_lv_bus.setdefault(trafo.lv_bus_ref, []).append(trafo)
    transformer_by_ref = {t.ref_id: t for t in enm.transformers}

    ders: list[DerState] = []
    for gen in sorted(enm.generators, key=lambda g: g.ref_id):
        if gen.bus_ref not in domain_bus_refs:
            continue
        capability, source_pl = resolve_der_island_capability(gen)
        ders.append(
            DerState(
                ref_id=gen.ref_id,
                bus_ref=gen.bus_ref,
                island_capability=capability,
                capability_source_pl=source_pl,
                island_operation_capable=_is_forming(capability),
            )
        )
    der_by_ref = {d.ref_id: d for d in ders}
    ders_by_bus: dict[str, list[DerState]] = {}
    for der in ders:
        ders_by_bus.setdefault(der.bus_ref, []).append(der)
    generator_p_by_ref = {g.ref_id: float(g.p_mw) for g in enm.generators}
    loads_by_bus: dict[str, list[Any]] = {}
    for load in enm.loads:
        if load.bus_ref in known_bus_refs:
            loads_by_bus.setdefault(load.bus_ref, []).append(load)

    def _sn_system_of_transformer(trafo: Any) -> str | None:
        component = sn_component.get(trafo.hv_bus_ref)
        if component is None:
            return None
        return min(component)

    def _sn_system_has_source(system_id: str | None) -> bool:
        if system_id is None:
            return False
        component = sn_component.get(system_id, frozenset())
        return any(ref in source_refs_by_bus for ref in component)

    upstream_system_by_transformer: dict[str, str | None] = {}
    for trafo in enm.transformers:
        if trafo.lv_bus_ref in domain_bus_refs:
            upstream_system_by_transformer[trafo.ref_id] = _sn_system_of_transformer(trafo)

    # --- Wyspy: grupowanie szyn domeny po składowej energetycznej. ---------
    grouped: dict[frozenset[str], list[str]] = {}
    for bus_ref in sorted(domain_bus_refs):
        component = energized_component.get(bus_ref, frozenset({bus_ref}))
        grouped.setdefault(component, []).append(bus_ref)

    earthing_system = _earthing_system(station)
    islands: list[Island] = []
    island_of_bus: dict[str, Island] = {}
    terminals: dict[str, TerminalState] = {}

    for index, (component, members) in enumerate(
        sorted(grouped.items(), key=lambda item: min(item[1])), start=1
    ):
        island_ref = f"island-{index}"
        member_set = set(members)
        grid_source_refs = sorted(
            ref for bus in component for ref in source_refs_by_bus.get(bus, ())
        )
        island_transformers = sorted(
            (t for bus in member_set for t in transformers_by_lv_bus.get(bus, ())),
            key=lambda t: t.ref_id,
        )
        island_ders = sorted(
            (d for bus in member_set for d in ders_by_bus.get(bus, ())), key=lambda d: d.ref_id
        )
        messages: list[ValidationMessage] = []

        # Transformatory ZASILAJĄCE (system SN ze źródłem) vs zasilane zwrotnie.
        feeding_transformers: list[str] = []
        backfeed_transformers: list[str] = []
        upstream_system_ids: set[str] = set()
        for trafo in island_transformers:
            system_id = upstream_system_by_transformer.get(trafo.ref_id)
            if _sn_system_has_source(system_id):
                feeding_transformers.append(trafo.ref_id)
                upstream_system_ids.add(str(system_id))
            elif grid_source_refs:
                backfeed_transformers.append(trafo.ref_id)
        nn_source_refs = sorted(
            ref for bus in member_set for ref in source_refs_by_bus.get(bus, ())
        )
        forming_ders = [d.ref_id for d in island_ders if _is_forming(d.island_capability)]
        pure_forming_ders = [d.ref_id for d in island_ders if d.island_capability == "GRID_FORMING"]
        unknown_ders = [d.ref_id for d in island_ders if d.island_capability == "UNKNOWN"]
        following_ders = [d.ref_id for d in island_ders if d.island_capability == "GRID_FOLLOWING"]

        is_islanded = not grid_source_refs
        multisource_bus = False

        if not is_islanded:
            energizing = sorted(set(feeding_transformers) | set(nn_source_refs))
            if len(upstream_system_ids) > 1:
                state: EnergizationState = "CONFLICT"
                messages.append(
                    ValidationMessage(
                        code="NN-AUD-06",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            "Sekcje zasilane z niezależnych systemów SN ("
                            + ", ".join(sorted(upstream_system_ids))
                            + ") są spięte po stronie nN — praca równoległa "
                            "niezsynchronizowanych źródeł. Wymaga rozstrzygnięcia "
                            "(otwarcie sprzęgła albo automatyka SZR)."
                        ),
                        element_refs=tuple(feeding_transformers),
                    )
                )
            elif pure_forming_ders:
                state = "CONFLICT"
                messages.append(
                    ValidationMessage(
                        code="NN-AUD-06",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            "Źródło w trybie tworzenia napięcia ("
                            + ", ".join(pure_forming_ders)
                            + ") pracuje równolegle z siecią bez trybu podwójnego — "
                            "konflikt regulacji napięcia i częstotliwości."
                        ),
                        element_refs=tuple(pure_forming_ders),
                    )
                )
            else:
                state = "ENERGIZED"
            for ref in backfeed_transformers:
                messages.append(
                    ValidationMessage(
                        code="NN-AUD-15",
                        severity=SEVERITY_IMPORTANT,
                        message_pl=(
                            f"Transformator {ref} ma system SN bez źródła — zasilanie "
                            "zwrotne od strony nN (szyna SN pod napięciem z nN)."
                        ),
                        element_refs=(ref,),
                    )
                )
            frequency_ref: str | None = grid_source_refs[0]
            voltage_ref: str | None = grid_source_refs[0]
            has_forming = bool(forming_ders)
        else:
            energizing = sorted(set(forming_ders) | set(nn_source_refs))
            if forming_ders:
                state = "MULTISOURCE" if len(forming_ders) > 1 else "ENERGIZED"
                if len(forming_ders) > 1:
                    messages.append(
                        ValidationMessage(
                            code="NN-AUD-16",
                            severity=SEVERITY_IMPORTANT,
                            message_pl=(
                                "Wyspa z kilkoma źródłami tworzącymi napięcie ("
                                + ", ".join(forming_ders)
                                + ") — praca równoległa wymaga podziału obciążenia "
                                "(statyzm) potwierdzonego nastawami."
                            ),
                            element_refs=tuple(forming_ders),
                        )
                    )
            elif unknown_ders:
                state = "UNKNOWN"
                messages.append(
                    ValidationMessage(
                        code="NN-AUD-14",
                        severity=SEVERITY_IMPORTANT,
                        message_pl=(
                            "Zdolność pracy wyspowej źródła ("
                            + ", ".join(unknown_ders)
                            + ") nie jest zadeklarowana (meta.island_capability / "
                            "control_mode) — stan zasilania wyspy NIEZNANY."
                        ),
                        element_refs=tuple(unknown_ders),
                    )
                )
            else:
                state = "DEENERGIZED"
                if following_ders:
                    messages.append(
                        ValidationMessage(
                            code="NN-AUD-09",
                            severity=SEVERITY_IMPORTANT,
                            message_pl=(
                                "Wyspa bez źródła tworzącego napięcie: źródła ("
                                + ", ".join(following_ders)
                                + ") pracują wyłącznie w trybie podążania za siecią — "
                                "wyspa NIEZASILONA (wg aktualnej topologii)."
                            ),
                            element_refs=tuple(following_ders),
                        )
                    )
            frequency_ref = energizing[0] if energizing else None
            voltage_ref = frequency_ref
            has_forming = bool(forming_ders)

        # --- Stany ZACISKÓW wyspy: sekcja z ≥2 źródłami = MULTISOURCE. --------
        # Źródło rozproszone tworzące napięcie liczy się jako ZASILAJĄCE sekcję
        # WYŁĄCZNIE w wyspie bez sieci — przy pracy z siecią napięcie sekcji
        # trzyma sieć (źródło podąża albo jest konfliktem), więc nie wchodzi do
        # `supply_refs`.
        for bus_ref in members:
            section = section_component.get(bus_ref, frozenset({bus_ref}))
            supply: set[str] = set()
            for ref in section:
                if ref in member_set or ref in domain_bus_refs:
                    supply.update(t.ref_id for t in transformers_by_lv_bus.get(ref, ()))
                    supply.update(source_refs_by_bus.get(ref, ()))
                    if is_islanded:
                        supply.update(
                            d.ref_id
                            for d in ders_by_bus.get(ref, ())
                            if _is_forming(d.island_capability)
                        )
            # Transformator zasilany zwrotnie NIE podaje napięcia na sekcję.
            supply.difference_update(backfeed_transformers)
            supply_refs = tuple(sorted(supply))
            bus_state: EnergizationState = state
            if state == "ENERGIZED" and len(supply_refs) > 1:
                bus_state = "MULTISOURCE"
                multisource_bus = True
            terminals[bus_ref] = TerminalState(
                bus_ref=bus_ref,
                energization_state=bus_state,
                supply_refs=supply_refs,
                island_ref=island_ref,
                grid_energized=not is_islanded,
            )
        island_state: EnergizationState = "MULTISOURCE" if multisource_bus else state

        # --- Odniesienie N/PE (§16). ---------------------------------------
        neutral_source: str | None = None
        if not is_islanded and feeding_transformers:
            declared = [
                ref
                for ref in feeding_transformers
                if transformer_by_ref[ref].lv_neutral is not None
            ]
            neutral_source = declared[0] if declared else feeding_transformers[0]
        elif not is_islanded and nn_source_refs:
            neutral_source = nn_source_refs[0]
        if earthing_system is None:
            neutral = NeutralReference(
                system=None,
                source_ref=neutral_source,
                status="brak_ukladu",
                status_pl=(
                    "Stacja nie deklaruje układu uziemienia sieci nN "
                    "(meta.nn_earthing_system) — odniesienie N/PE nieokreślone."
                ),
                swz_evaluable=False,
            )
        elif neutral_source is None:
            neutral = NeutralReference(
                system=earthing_system,
                source_ref=None,
                status="brak_zrodla",
                status_pl=(
                    "Brak elementu wnoszącego odniesienie N/PE do wyspy (punkt neutralny "
                    "transformatora poza wyspą; źródło rozproszone nie deklaruje punktu "
                    "neutralnego) — SWZ nieoceniane."
                ),
                swz_evaluable=False,
            )
        else:
            neutral = NeutralReference(
                system=earthing_system,
                source_ref=neutral_source,
                status="OK",
                status_pl=f"Układ {earthing_system}; punkt neutralny: {neutral_source}.",
                swz_evaluable=earthing_system != "IT",
            )
        # Komunikat N/PE wyłącznie dla wyspy POD NAPIĘCIEM: wyspa niezasilona nie
        # ma czego odnosić, a wyspa o stanie NIEZNANYM ma już komunikat o
        # nieznanej zdolności źródła — drugi komunikat o skutku byłby szumem.
        if neutral.status != "OK" and island_state in ENERGIZED_STATES:
            messages.append(
                ValidationMessage(
                    code="NN-AUD-08",
                    severity=SEVERITY_IMPORTANT,
                    message_pl=f"Wyspa {island_ref} bez odniesienia N/PE: {neutral.status_pl}",
                    element_refs=tuple(members),
                )
            )

        # --- Bilans mocy znamionowej (§15). --------------------------------
        p_gen = sum(generator_p_by_ref.get(d.ref_id, 0.0) for d in island_ders)
        p_load = sum(float(ld.p_mw) for bus in member_set for ld in loads_by_bus.get(bus, ()))
        if not is_islanded:
            balance_state: PowerBalanceState = "z_sieci"
        elif not island_ders and p_load == 0.0:
            balance_state = "brak_danych"
        elif p_gen > p_load:
            balance_state = "nadwyzka"
        elif p_gen < p_load:
            balance_state = "deficyt"
        else:
            balance_state = "zrownowazony"
        power_balance = PowerBalance(
            p_generation_mw=round(p_gen, 9), p_load_mw=round(p_load, 9), state=balance_state
        )
        if is_islanded and island_state in ENERGIZED_STATES and balance_state == "deficyt":
            messages.append(
                ValidationMessage(
                    code="NN-AUD-17",
                    severity=SEVERITY_IMPORTANT,
                    message_pl=(
                        f"Bilans mocy znamionowej wyspy {island_ref}: generacja "
                        f"{power_balance.p_generation_mw} MW < odbiory "
                        f"{power_balance.p_load_mw} MW — deficyt."
                    ),
                    element_refs=tuple(members),
                )
            )

        # --- Dopuszczalność pracy wyspowej. ---------------------------------
        if not is_islanded:
            island_operation_allowed: bool | None = None
        else:
            island_operation_allowed = (
                island_state in ENERGIZED_STATES
                and neutral.status == "OK"
                and balance_state != "deficyt"
            )

        island = Island(
            island_ref=island_ref,
            bus_refs=tuple(sorted(members)),
            energization_state=island_state,
            is_islanded=is_islanded,
            grid_source_refs=tuple(grid_source_refs),
            transformer_refs=tuple(t.ref_id for t in island_transformers),
            energizing_source_ids=tuple(energizing),
            der_refs=tuple(d.ref_id for d in island_ders),
            has_grid_forming_source=has_forming,
            frequency_reference_source_id=frequency_ref,
            voltage_reference_source_id=voltage_ref,
            upstream_system_ids=tuple(sorted(upstream_system_ids)),
            neutral_reference=neutral,
            power_balance=power_balance,
            island_operation_allowed=island_operation_allowed,
            validation_messages=tuple(messages),
        )
        islands.append(island)
        for bus_ref in members:
            island_of_bus[bus_ref] = island

    # --- Odcinki (§6). ------------------------------------------------------
    segments: list[SegmentState] = []
    for ref_id in sorted(domain_branches):
        branch = domain_branches[ref_id]
        from_terminal = terminals.get(branch.from_bus_ref)
        to_terminal = terminals.get(branch.to_bus_ref)
        if from_terminal is None or to_terminal is None:
            continue
        connectivity: ConnectivityState = "CLOSED" if branch.status == "closed" else "OPEN"
        segment_island_ref: str | None
        if connectivity == "CLOSED":
            closed_island = island_of_bus[branch.from_bus_ref]
            segment_state: EnergizationState = from_terminal.energization_state
            source_ids = closed_island.energizing_source_ids
            segment_island_ref = closed_island.island_ref
        else:
            segment_state = "DEENERGIZED"
            source_ids = ()
            segment_island_ref = None
        segments.append(
            SegmentState(
                segment_id=ref_id,
                from_bus_ref=branch.from_bus_ref,
                to_bus_ref=branch.to_bus_ref,
                connectivity_state=connectivity,
                from_terminal=from_terminal,
                to_terminal=to_terminal,
                energization_state=segment_state,
                source_ids=source_ids,
                island_ref=segment_island_ref,
                voltage_level_id=voltage_level_by_bus.get(branch.from_bus_ref, ""),
            )
        )

    # --- Tory zasilania (§37/§38): BFS po zamkniętych gałęziach od szyny źródła. --
    supply_roots: list[tuple[str, str]] = []
    for lv_bus, trafos in transformers_by_lv_bus.items():
        if lv_bus in domain_bus_refs:
            supply_roots.extend((t.ref_id, lv_bus) for t in trafos)
    for bus_ref, source_refs in source_refs_by_bus.items():
        if bus_ref in domain_bus_refs:
            supply_roots.extend((ref, bus_ref) for ref in source_refs)
    for der in ders:
        if der.island_operation_capable:
            supply_roots.append((der.ref_id, der.bus_ref))

    supply_paths: list[SupplyPath] = []
    for source_ref, root_bus in sorted(supply_roots):
        parent = przeglad_wszerz(root_bus, lambda szyna: sorted(section_edges.get(szyna, [])))
        for bus_ref in sorted(domain_bus_refs):
            if bus_ref not in parent:
                continue
            terminal = terminals.get(bus_ref)
            if terminal is None or source_ref not in terminal.supply_refs:
                continue
            chain: list[str] = []
            cursor = bus_ref
            while parent[cursor] is not None:
                branch_ref, previous = parent[cursor]  # type: ignore[misc]
                chain.append(branch_ref)
                cursor = previous
            supply_paths.append(
                SupplyPath(
                    bus_ref=bus_ref,
                    source_ref=source_ref,
                    source_bus_ref=root_bus,
                    branch_refs=tuple(reversed(chain)),
                )
            )
    supply_paths.sort(key=lambda p: (p.bus_ref, p.source_ref))

    return EnergizationView(
        terminals=terminals,
        segments=tuple(segments),
        islands=tuple(islands),
        ders=tuple(d for d in ders if d.ref_id in der_by_ref),
        supply_paths=tuple(supply_paths),
        upstream_system_by_transformer=upstream_system_by_transformer,
    )


def island_messages(view: EnergizationView) -> list[ValidationMessage]:
    """Wszystkie komunikaty wysp w jednej, deterministycznej liście."""
    out: list[ValidationMessage] = []
    for island in view.islands:
        out.extend(island.validation_messages)
    return out


def upstream_source_refs_by_system(
    enm: EnergyNetworkModel, domain_bus_refs: set[str]
) -> dict[str, list[str]]:
    """Źródła (``Source``) KAŻDEGO systemu SN — składowej sieci po usunięciu szyn
    domeny (ta sama definicja co ``upstream_system_id`` transformatora). Klucz =
    identyfikator systemu (najmniejszy ``ref_id`` szyny składowej)."""
    known_bus_refs = {b.ref_id for b in enm.buses}
    sn_bus_refs = known_bus_refs - domain_bus_refs
    adjacency: dict[str, set[str]] = {ref: set() for ref in sn_bus_refs}
    for branch in enm.branches:
        if branch.status != "closed":
            continue
        if branch.from_bus_ref in sn_bus_refs and branch.to_bus_ref in sn_bus_refs:
            adjacency[branch.from_bus_ref].add(branch.to_bus_ref)
            adjacency[branch.to_bus_ref].add(branch.from_bus_ref)
    for trafo in enm.transformers:
        if trafo.hv_bus_ref in sn_bus_refs and trafo.lv_bus_ref in sn_bus_refs:
            adjacency[trafo.hv_bus_ref].add(trafo.lv_bus_ref)
            adjacency[trafo.lv_bus_ref].add(trafo.hv_bus_ref)
    component_of = _components(sn_bus_refs, adjacency)
    out: dict[str, list[str]] = {}
    for source in sorted(enm.sources, key=lambda s: s.ref_id):
        component = component_of.get(source.bus_ref)
        if component is None:
            continue
        out.setdefault(min(component), []).append(source.ref_id)
    return out


__all__ = [
    "ENERGIZED_STATES",
    "SEVERITY_INFO",
    "ConnectivityState",
    "DerIslandCapability",
    "DerState",
    "EnergizationState",
    "EnergizationView",
    "Island",
    "NeutralReference",
    "PowerBalance",
    "SegmentState",
    "SupplyPath",
    "TerminalState",
    "ValidationMessage",
    "build_energization_view",
    "island_messages",
    "resolve_der_island_capability",
]
