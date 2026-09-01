"""Energizacja szyn domeny nN — CZYSTA TOPOLOGIA STANÓW ŁĄCZNIKÓW (karta B-02, §0.3).

Warstwa APLIKACJI, ZERO FIZYKI: żadna wartość tu policzona nie jest napięciem,
prądem ani impedancją — to wyłącznie odpowiedź na pytanie „co jest z czym
połączone przy OBECNYCH stanach łączników". Graf domeny (``graph_view``) jest
świadomie NIEZALEŻNY od stanu łączeniowego (łącznik otwarty to wciąż ta sama
domena elektryczna); ten moduł dokłada do niego DRUGĄ, ortogonalną warstwę
informacji — która z tych szyn jest w tej chwili pod napięciem i skąd.

DEFINICJE (jedno źródło prawdy, identyczne z regułą walidatora
``enm/validator.py::_check_nn_topology`` E060 — LV-INV-01/05):

* ``energized`` — szyna jest w spójnej składowej zawierającej JAKIKOLWIEK
  ``Source`` (SN albo nN), gdzie krawędziami są gałęzie ``status="closed"``
  ORAZ transformatory (transformator jest krawędzią ZAWSZE — nie ma „stanu
  otwarcia transformatora"; wyłącza go łącznik pola, czyli gałąź).
  ``Generator`` NIE jest źródłem energizacji sieci — dokładnie ta sama zasada
  co E060/E003: generator może zniknąć ze stanu łączeniowego, siecią jest
  ``Source``.
* ``der_only`` — szyna NIE jest energizowana z sieci, ale w jej składowej
  (tej samej, którą liczy ``energized`` — predykaty parami z JEDNEGO źródła)
  jest co najmniej jeden ``Generator``: wyspa DER, stan wymagający decyzji
  (praca wyspowa / LOM), nie „szyna martwa".
* ``supply_refs`` — kto podaje napięcie NA TĘ SEKCJĘ: transformatory, których
  szyna nN leży w składowej liczonej BEZ krawędzi transformatorowych (czyli po
  samych zamkniętych gałęziach), oraz źródła stojące bezpośrednio w tej
  składowej. To ODRĘBNE pytanie od ``energized`` i liczy się je na odrębnej
  składowej ŚWIADOMIE: gdyby ``supply_refs`` czytać ze składowej z
  transformatorami, szyna sekcji A przy sprzęgle OTWARTYM meldowałaby jako
  zasilający również transformator sekcji B (jest w tej samej składowej przez
  szynę SN), czyli podawałaby projektantowi nieprawdę o torze zasilania.

WYSPA (``islands``) to spójna składowa ENERGETYCZNA (zamknięte gałęzie +
transformatory) zawężona do szyn domeny — a NIE sekcja rozdzielnicy nN.
Konsekwencja, którą trzeba znać czytając wynik: przy 2×TR i sprzęgle OTWARTYM
obie sekcje są W JEDNEJ wyspie, bo obie wiszą na tej samej sieci SN przez swoje
transformatory; rozdziela je dopiero brak drogi do wspólnego źródła. Podszyna
odcięta otwartą gałęzią (bez własnego transformatora/źródła) jest osobną wyspą
z ``energized=False``.

Determinizm: wszystkie listy sortowane po ``ref_id``, wyspy numerowane w
kolejności najmniejszego ``bus_ref`` w wyspie.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Any

from enm.models import EnergyNetworkModel


@dataclass(frozen=True)
class BusEnergization:
    """Stan zasilania JEDNEJ szyny domeny."""

    energized: bool
    supply_refs: tuple[str, ...]
    der_only: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "energized": self.energized,
            "supply_refs": list(self.supply_refs),
            "der_only": self.der_only,
        }


@dataclass(frozen=True)
class Island:
    """Wyspa = spójna składowa energetyczna zawężona do szyn domeny."""

    island_ref: str
    bus_refs: tuple[str, ...]
    energized: bool
    supply_refs: tuple[str, ...]
    der_only: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "island_ref": self.island_ref,
            "bus_refs": list(self.bus_refs),
            "energized": self.energized,
            "supply_refs": list(self.supply_refs),
            "der_only": self.der_only,
        }


@dataclass(frozen=True)
class EnergizationView:
    """Stan zasilania wszystkich szyn domeny + podział na wyspy."""

    bus_states: dict[str, BusEnergization]
    islands: tuple[Island, ...]


def _components(bus_refs: set[str], adjacency: dict[str, set[str]]) -> dict[str, frozenset[str]]:
    """Spójne składowe grafu nieskierowanego — składowa per szyna."""
    component_of: dict[str, frozenset[str]] = {}
    for start in sorted(bus_refs):
        if start in component_of:
            continue
        seen = {start}
        queue: deque[str] = deque([start])
        while queue:
            current = queue.popleft()
            for neighbor in sorted(adjacency.get(current, set())):
                if neighbor not in seen:
                    seen.add(neighbor)
                    queue.append(neighbor)
        frozen = frozenset(seen)
        for ref in seen:
            component_of[ref] = frozen
    return component_of


def build_energization_view(enm: EnergyNetworkModel, domain_bus_refs: set[str]) -> EnergizationView:
    """Zbuduj stan zasilania szyn ``domain_bus_refs`` (patrz docstring modułu)."""
    known_bus_refs = {b.ref_id for b in enm.buses}

    # Składowa ZASILANIA: zamknięte gałęzie + transformatory (krawędź zawsze).
    energized_adjacency: dict[str, set[str]] = {ref: set() for ref in known_bus_refs}
    # Składowa SEKCJI: WYŁĄCZNIE zamknięte gałęzie (bez transformatorów) — służy
    # do wskazania, KTÓRY transformator/źródło podaje napięcie na tę sekcję.
    section_adjacency: dict[str, set[str]] = {ref: set() for ref in known_bus_refs}

    for branch in enm.branches:
        if branch.status != "closed":
            continue
        if branch.from_bus_ref not in known_bus_refs or branch.to_bus_ref not in known_bus_refs:
            continue
        energized_adjacency[branch.from_bus_ref].add(branch.to_bus_ref)
        energized_adjacency[branch.to_bus_ref].add(branch.from_bus_ref)
        section_adjacency[branch.from_bus_ref].add(branch.to_bus_ref)
        section_adjacency[branch.to_bus_ref].add(branch.from_bus_ref)

    for trafo in enm.transformers:
        if trafo.hv_bus_ref not in known_bus_refs or trafo.lv_bus_ref not in known_bus_refs:
            continue
        energized_adjacency[trafo.hv_bus_ref].add(trafo.lv_bus_ref)
        energized_adjacency[trafo.lv_bus_ref].add(trafo.hv_bus_ref)

    energized_component = _components(known_bus_refs, energized_adjacency)
    section_component = _components(known_bus_refs, section_adjacency)

    source_refs_by_bus: dict[str, list[str]] = {}
    for source in enm.sources:
        if source.bus_ref in known_bus_refs:
            source_refs_by_bus.setdefault(source.bus_ref, []).append(source.ref_id)
    generator_bus_refs = {g.bus_ref for g in enm.generators if g.bus_ref in known_bus_refs}
    transformer_refs_by_lv_bus: dict[str, list[str]] = {}
    for trafo in enm.transformers:
        if trafo.lv_bus_ref in known_bus_refs:
            transformer_refs_by_lv_bus.setdefault(trafo.lv_bus_ref, []).append(trafo.ref_id)

    def _energized(bus_ref: str) -> bool:
        component = energized_component.get(bus_ref, frozenset({bus_ref}))
        return any(ref in source_refs_by_bus for ref in component)

    def _has_generator(bus_ref: str) -> bool:
        component = energized_component.get(bus_ref, frozenset({bus_ref}))
        return bool(component & generator_bus_refs)

    def _supply_refs(bus_ref: str) -> tuple[str, ...]:
        component = section_component.get(bus_ref, frozenset({bus_ref}))
        refs: set[str] = set()
        for ref in component:
            refs.update(transformer_refs_by_lv_bus.get(ref, ()))
            refs.update(source_refs_by_bus.get(ref, ()))
        return tuple(sorted(refs))

    bus_states: dict[str, BusEnergization] = {}
    for bus_ref in sorted(domain_bus_refs):
        energized = _energized(bus_ref)
        bus_states[bus_ref] = BusEnergization(
            energized=energized,
            supply_refs=_supply_refs(bus_ref),
            der_only=(not energized) and _has_generator(bus_ref),
        )

    grouped: dict[frozenset[str], list[str]] = {}
    for bus_ref in sorted(domain_bus_refs):
        component = energized_component.get(bus_ref, frozenset({bus_ref}))
        grouped.setdefault(component, []).append(bus_ref)

    islands: list[Island] = []
    for index, (_component, members) in enumerate(
        sorted(grouped.items(), key=lambda item: min(item[1])), start=1
    ):
        supply_refs: set[str] = set()
        for member in members:
            supply_refs.update(bus_states[member].supply_refs)
        islands.append(
            Island(
                island_ref=f"island-{index}",
                bus_refs=tuple(sorted(members)),
                energized=bus_states[members[0]].energized,
                supply_refs=tuple(sorted(supply_refs)),
                der_only=bus_states[members[0]].der_only,
            )
        )

    return EnergizationView(bus_states=bus_states, islands=tuple(islands))
