"""Graf domeny nN jednej stacji (karta T5b, §0 rozstrzygnięcie 2 — werdykt
właściciela `docs/nn/KONCEPCJA_LOD_NN_2026-08.md`).

Warstwa APLIKACJI (interpretacja topologii, NIE solver, NIE fizyka): wyprowadza
spójną składową 0,4 kV od stacji-korzenia CZYTAJĄC GRAF ENM (bus/branch/
transformer refs) — NIGDY containment. ZASADA FUNDAMENTALNA werdyktu:
"granica wizualna = granica domeny napięciowej i projekcji" — transformator
jest JEDYNĄ legalną granicą 15 kV / 0,4 kV; poza nim domena jest wyprowadzona
z GRAFU (dowolna gałąź, niezależnie od stanu łącznika — łącznik OTWARTY jest
wciąż topologicznie tą samą domeną, dokładnie ta sama zasada co
`sld/v3/electrical/terminalGraph.ts`: "Łącznik jest KRAWĘDZIĄ niezależnie od
stanu").

Rozstrzygnięcie graniczne (przejście do INNEJ stacji):
- Bus osiągnięty spacerem BFS należący (wg `Substation.bus_refs`) do stacji
  Z WŁASNYM transformatorem (`transformer_refs` niepuste) inną niż korzeń →
  ta stacja ma WŁASNE źródło SN, więc jest ODRĘBNĄ domeną elektryczną mimo
  fizycznego połączenia nN (np. wiązanie awaryjne/N-1 na stronie nN) —
  spacer ZATRZYMUJE się na tej gałęzi i zapisuje `boundary_link`
  (ref stacji docelowej), NIE wciąga jej elementów.
- Bus należący do stacji BEZ własnego transformatora (`station_type=
  "rozdzielnica_nn"`, podrozdzielnica) → NIE MA własnego źródła SN, jest
  częścią TEJ SAMEJ domeny elektrycznej — zostaje WCHŁONIĘTY (jej szyny/
  gałęzie/odbiory/źródła wchodzą do domeny, spacer kontynuuje przez nią).
- Dwa transformatory NALEŻĄCE DO TEJ SAMEJ stacji (`Substation.
  transformer_refs` — pole jest LISTĄ, nie jednym refem) i połączone
  sprzęgłem sekcji szyn nN → WIELOŹRÓDŁOWOŚĆ jawna tej samej domeny (żadnego
  boundary_link — oba buses należą do korzenia od startu).

ENERGIZACJA (karta B-02, §0.3) jest DRUGĄ, ortogonalną warstwą tego samego
grafu: skoro domena obejmuje również szyny odcięte otwartym łącznikiem, to
każda szyna niesie dodatkowo ``energized`` / ``supply_refs`` / ``der_only``, a
odpowiedź — listę ``islands`` (spójne składowe po zamkniętych gałęziach +
transformatorach). Liczy to ``energization.build_energization_view`` (czysta
topologia stanów łączników, zero fizyki), a definicja „źródła energizacji" jest
TA SAMA co w regule walidatora E060 (``enm/validator.py::_check_nn_topology``).

Zero fabrykacji: UPS/ATS jako osobny typ elementu NIE ISTNIEJE dziś w ENM
(zmierzone: `grep -rn "class.*UPS" enm/models.py` i `grep -rn "class.*ATS"
enm/models.py` — zero trafień w obu)
— pominięte, nie fabrykowane (werdykt: "UPS/ATS JEŚLI W MODELU").
"""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass
from typing import Any

from application.analyses.fault_loop.service import (
    _find_station as find_station,  # reeksport publiczny (dzielony z upstream_equivalent.py)
)
from enm.models import Branch, Bus, EnergyNetworkModel, Substation, Transformer
from network_model.core.voltage_factor import LV_BAND_LIMIT_KV

from .energization import BusEnergization, build_energization_view

# Precyzja dyskretyzacji identyczna z frontendem (`sld/v3/electrical/
# terminalGraph.ts::voltageLevelIdForKv`, `VOLTAGE_LEVEL_PRECISION`) — JEDNO
# źródło wzorca formatu, dwie implementacje (Python/TS nie da się dzielić
# literalnie), zablokowane testem wprost na parach wartości.
_VOLTAGE_LEVEL_PRECISION = 1_000_000.0


def voltage_level_id(voltage_kv: float) -> str:
    """Tożsamość domeny napięciowej — MIRROR frontendu
    `voltageLevelIdForKv` (identyczna precyzja i format `kv:{liczba}`, żeby
    `UpstreamEquivalentSnapshot.voltage_level_id` (backend) i
    `TerminalNode.voltageLevelId` (frontend, `sld/v3/electrical/
    terminalGraph.ts`) dla TEJ SAMEJ szyny dały IDENTYCZNY string —
    zablokowane `tests/application/analyses/lv_domain/test_graph_view.py`.
    """
    if not math.isfinite(voltage_kv):
        return "kv:invalid"
    normalized = round(voltage_kv * _VOLTAGE_LEVEL_PRECISION) / _VOLTAGE_LEVEL_PRECISION
    if normalized == int(normalized):
        text = str(int(normalized))
    else:
        text = repr(normalized)
    return f"kv:{text}"


@dataclass(frozen=True)
class BoundaryLink:
    """Połączenie opuszczające domenę do INNEJ stacji (werdykt §0 pkt 3)."""

    branch_ref: str
    from_bus_ref: str
    to_bus_ref: str
    target_station_ref: str
    target_station_name: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "branch_ref": self.branch_ref,
            "from_bus_ref": self.from_bus_ref,
            "to_bus_ref": self.to_bus_ref,
            "target_station_ref": self.target_station_ref,
            "target_station_name": self.target_station_name,
        }


def _is_lv(bus_by_ref: dict[str, Bus], bus_ref: str) -> bool:
    bus = bus_by_ref.get(bus_ref)
    return bus is not None and bus.voltage_kv <= LV_BAND_LIMIT_KV


def _bus_dict(bus: Bus, depth: int, state: BusEnergization) -> dict[str, Any]:
    return {
        "ref_id": bus.ref_id,
        "name": bus.name,
        "voltage_kv": bus.voltage_kv,
        "voltage_level_id": voltage_level_id(bus.voltage_kv),
        "hops_from_root": depth,
        # Stan łączeniowy CHWILI (karta B-02, §0.3) — ortogonalny do topologii
        # domeny powyżej: domena obejmuje też szyny odcięte otwartym łącznikiem,
        # a te trzy pola mówią, które z nich są w tej chwili pod napięciem i skąd.
        **state.to_dict(),
    }


def _branch_dict(branch: Branch) -> dict[str, Any]:
    return {
        "ref_id": branch.ref_id,
        "name": branch.name,
        "type": branch.type,
        "from_bus_ref": branch.from_bus_ref,
        "to_bus_ref": branch.to_bus_ref,
        "status": branch.status,
        "catalog_ref": branch.catalog_ref,
        "catalog_namespace": branch.catalog_namespace,
    }


def _transformer_dict(trafo: Transformer) -> dict[str, Any]:
    return {
        "ref_id": trafo.ref_id,
        "name": trafo.name,
        "hv_bus_ref": trafo.hv_bus_ref,
        "lv_bus_ref": trafo.lv_bus_ref,
        "sn_mva": trafo.sn_mva,
        "uhv_kv": trafo.uhv_kv,
        "ulv_kv": trafo.ulv_kv,
        "uk_percent": trafo.uk_percent,
        "vector_group": trafo.vector_group,
    }


def _generator_dict(gen: Any) -> dict[str, Any]:
    return {
        "ref_id": gen.ref_id,
        "name": gen.name,
        "bus_ref": gen.bus_ref,
        "p_mw": gen.p_mw,
        "q_mvar": gen.q_mvar,
        "gen_type": gen.gen_type,
        "connection_variant": gen.connection_variant,
    }


def _load_dict(load: Any) -> dict[str, Any]:
    return {
        "ref_id": load.ref_id,
        "name": load.name,
        "bus_ref": load.bus_ref,
        "p_mw": load.p_mw,
        "q_mvar": load.q_mvar,
    }


def _sub_switchboard_dict(
    station: Substation, bus_refs_in_domain: set[str], depth: int
) -> dict[str, Any]:
    return {
        "ref_id": station.ref_id,
        "name": station.name,
        "bus_refs": sorted(b for b in station.bus_refs if b in bus_refs_in_domain),
        "hops_from_root": depth,
    }


def build_lv_domain_view(enm: EnergyNetworkModel, station_ref: str) -> dict[str, Any]:
    """Zbuduj graf domeny nN stacji `station_ref` — spójna składowa 0,4 kV
    wyprowadzona Z GRAFU (nie containment; patrz nagłówek modułu).
    """
    root = find_station(enm, station_ref)
    if root is None:
        return {
            "status": "brak danych",
            "missing_data": ["station"],
            "station_ref": station_ref,
        }

    bus_by_ref = {b.ref_id: b for b in enm.buses}
    owner_by_bus: dict[str, Substation] = {}
    for st in enm.substations:
        for bus_ref in st.bus_refs:
            owner_by_bus[bus_ref] = st

    # Sąsiedztwo z WSZYSTKICH gałęzi, niezależnie od `status` — topologia
    # domeny to fakt strukturalny, nie stan łączeniowy chwili (patrz nagłówek).
    adjacency: dict[str, list[tuple[str, Branch]]] = {}
    for branch in enm.branches:
        adjacency.setdefault(branch.from_bus_ref, []).append((branch.to_bus_ref, branch))
        adjacency.setdefault(branch.to_bus_ref, []).append((branch.from_bus_ref, branch))

    seed_bus_refs: set[str] = {b for b in root.bus_refs if _is_lv(bus_by_ref, b)}
    root_transformer_refs = set(root.transformer_refs or ())
    for trafo in enm.transformers:
        if trafo.ref_id in root_transformer_refs and _is_lv(bus_by_ref, trafo.lv_bus_ref):
            seed_bus_refs.add(trafo.lv_bus_ref)

    if not seed_bus_refs:
        return {
            "status": "brak danych",
            "missing_data": ["lv_bus"],
            "station_ref": station_ref,
            "station_name": root.name,
            "reason_pl": (
                "Stacja nie ma żadnej szyny w paśmie nN (≤1 kV) ani w "
                "bus_refs, ani na stronie nN zadeklarowanego transformatora "
                "— brak domeny nN do wyprowadzenia."
            ),
        }

    absorbed_station_refs: set[str] = {root.ref_id}
    domain_bus_refs: set[str] = set()
    domain_branches: dict[str, Branch] = {}
    boundary_links: list[BoundaryLink] = []
    bus_depth: dict[str, int] = {b: 0 for b in seed_bus_refs}
    visited: set[str] = set(seed_bus_refs)
    queue: deque[str] = deque(sorted(seed_bus_refs))

    while queue:
        current = queue.popleft()
        domain_bus_refs.add(current)
        neighbors = sorted(adjacency.get(current, []), key=lambda item: (item[1].ref_id, item[0]))
        for neighbor_ref, branch in neighbors:
            owner = owner_by_bus.get(neighbor_ref)
            if owner is not None and owner.ref_id not in absorbed_station_refs:
                if owner.transformer_refs:
                    # Stacja Z WŁASNYM transformatorem = własne źródło SN =
                    # ODRĘBNA domena elektryczna — granica, nie wciąganie.
                    boundary_links.append(
                        BoundaryLink(
                            branch_ref=branch.ref_id,
                            from_bus_ref=current,
                            to_bus_ref=neighbor_ref,
                            target_station_ref=owner.ref_id,
                            target_station_name=owner.name,
                        )
                    )
                    continue
                # Podrozdzielnica bez własnego transformatora — WCHŁONIĘTA.
                absorbed_station_refs.add(owner.ref_id)

            domain_branches[branch.ref_id] = branch
            if neighbor_ref not in visited:
                visited.add(neighbor_ref)
                bus_depth[neighbor_ref] = bus_depth[current] + 1
                queue.append(neighbor_ref)

    domain_transformers = sorted(
        (t for t in enm.transformers if t.lv_bus_ref in domain_bus_refs),
        key=lambda t: t.ref_id,
    )
    domain_generators = sorted(
        (g for g in enm.generators if g.bus_ref in domain_bus_refs),
        key=lambda g: g.ref_id,
    )
    domain_loads = sorted(
        (ld for ld in enm.loads if ld.bus_ref in domain_bus_refs),
        key=lambda ld: ld.ref_id,
    )
    sub_switchboard_refs = sorted(absorbed_station_refs - {root.ref_id})
    sub_switchboards = [
        _sub_switchboard_dict(
            next(s for s in enm.substations if s.ref_id == ref),
            domain_bus_refs,
            min(
                (
                    bus_depth[b]
                    for b in domain_bus_refs
                    if owner_by_bus.get(b) is not None and owner_by_bus[b].ref_id == ref
                ),
                default=0,
            ),
        )
        for ref in sub_switchboard_refs
    ]

    # Boundary links deduplikowane po (branch_ref) — jedna gałąź = jeden wpis,
    # deterministyczne sortowanie po branch_ref dla stabilnego payloadu.
    boundary_links_sorted = sorted(boundary_links, key=lambda link: link.branch_ref)

    energization = build_energization_view(enm, domain_bus_refs)

    return {
        "status": "OK",
        "station_ref": station_ref,
        "station_name": root.name,
        "root_bus_refs": sorted(seed_bus_refs),
        "buses": [
            _bus_dict(bus_by_ref[ref], bus_depth.get(ref, 0), energization.bus_states[ref])
            for ref in sorted(domain_bus_refs)
            if ref in bus_by_ref
        ],
        "islands": [island.to_dict() for island in energization.islands],
        "branches": [
            _branch_dict(b) for b in sorted(domain_branches.values(), key=lambda x: x.ref_id)
        ],
        "transformers": [_transformer_dict(t) for t in domain_transformers],
        "generators": [_generator_dict(g) for g in domain_generators],
        "loads": [_load_dict(ld) for ld in domain_loads],
        "sub_switchboards": sub_switchboards,
        "boundary_links": [link.to_dict() for link in boundary_links_sorted],
        "missing_data": [],
    }
