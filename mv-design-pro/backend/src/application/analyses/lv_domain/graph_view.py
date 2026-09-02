"""Graf domeny nN jednej stacji (karta T5b, §0 rozstrzygnięcie 2 — werdykt
właściciela `docs/nn/KONCEPCJA_LOD_NN_2026-08.md`; kontrakt 3.0.0 — mandat
„profesjonalizacja SLD nN", `docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md` §3).

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
  częścią TEJ SAMEJ domeny elektrycznej — zostaje WCHŁONIĘTY.
- Dwa transformatory NALEŻĄCE DO TEJ SAMEJ stacji (`Substation.
  transformer_refs` — pole jest LISTĄ, nie jednym refem) i połączone
  sprzęgłem sekcji szyn nN → WIELOŹRÓDŁOWOŚĆ jawna tej samej domeny.

ROLE URZĄDZEŃ (kontrakt 3.0.0, §4/§8) są rozstrzygane TU, z topologii — nie w
rendererze (zakaz odtwarzania topologii po stronie klienta, guard R4):
- `incomer` — gałąź między zaciskiem nN transformatora a szyną rozdzielnicy
  (zacisk ma DOKŁADNIE jedną gałąź nie-sprzęgłową);
- `coupler` — `bus_coupler` albo gałąź wskazana jako `NnSection.coupler_ref`;
- `boundary` — gałąź z `boundary_links`;
- `feeder` — gałąź odchodząca z szyny rozdzielnicy (korzeniowej albo
  podrozdzielnicy) w głąb; `feeder_kind` z ZAWARTOŚCI poddrzewa: `load` /
  `der` / `sub_board` / `mixed` / `none` (odpływ do niczego = audyt);
- `internal` — pozostałe ogniwa toru (kabel między zaciskami itd.).

ENERGIZACJA (kontrakt 3.0.0) jest DRUGĄ, ortogonalną warstwą tego samego grafu
— liczy ją `energization.build_energization_view` (czysta topologia stanów
łączników, zero fizyki): stany ZACISKÓW (`energization_state` szyn), mapa
ODCINKÓW (`segments`), WYSPY z §14–§16, zdolność DER, tory zasilania.

Zero fabrykacji: UPS/ATS jako osobny typ elementu NIE ISTNIEJE dziś w ENM
(zmierzone: `grep -rn "class.*UPS" enm/models.py` i `grep -rn "class.*ATS"
enm/models.py` — zero trafień w obu) — pominięte, nie fabrykowane. Pomiary
(`Measurement` CT/VT) i zabezpieczenia (`ProtectionAssignment`) ISTNIEJĄ w ENM
i wchodzą do grafu WYŁĄCZNIE, gdy model je niesie (§12).
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

from .energization import EnergizationView, TerminalState, build_energization_view

# Precyzja dyskretyzacji identyczna z frontendem (`sld/v3/electrical/
# terminalGraph.ts::voltageLevelIdForKv`, `VOLTAGE_LEVEL_PRECISION`) — JEDNO
# źródło wzorca formatu, dwie implementacje (Python/TS nie da się dzielić
# literalnie), zablokowane testem wprost na parach wartości.
_VOLTAGE_LEVEL_PRECISION = 1_000_000.0

#: Oznaczenie klasy urządzenia (IEC 81346 / zwyczaj polski) per typ gałęzi ENM —
#: JEDNO źródło dla rejestru symboli frontendu (`lv-domain/symbolRegistry.ts`).
DEVICE_DESIGNATION_BY_TYPE: dict[str, str] = {
    "breaker": "QF",
    "switch": "QS",
    "disconnector": "QS",
    "fuse": "FU",
    "bus_coupler": "QBC",
    "cable": "W",
    "line_overhead": "W",
}


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


def _bus_dict(bus: Bus, depth: int, terminal: TerminalState, *, is_board: bool) -> dict[str, Any]:
    return {
        "ref_id": bus.ref_id,
        "name": bus.name,
        "voltage_kv": bus.voltage_kv,
        "voltage_level_id": voltage_level_id(bus.voltage_kv),
        "hops_from_root": depth,
        # Szyna ROZDZIELNICY (sekcja korzeniowa / podrozdzielnica) vs zacisk toru —
        # rozstrzygnięte tu, żeby renderer nie wyprowadzał tego z `hops`.
        "is_board": is_board,
        # Stan ZACISKU (kontrakt 3.0.0, §5): ortogonalny do topologii domeny.
        **terminal.to_dict(),
    }


def _device_kind(branch: Branch) -> str | None:
    """Rodzaj aparatu z pozycji katalogu (`materialized_params.device_kind`,
    np. WYLACZNIK / ROZLACZNIK / ROZLACZNIK_BEZPIECZNIKOWY / ODLACZNIK) —
    klasa FUNKCJONALNA wyrobu, odrębna od typu gałęzi (rola w topologii).
    Renderer wybiera z niej symbol CAD (rejestr R2); ``None`` = katalog nie
    klasyfikuje aparatu — symbol ogólny + audyt NN-AUD-18, zero domysłu."""
    params = getattr(branch, "materialized_params", None) or {}
    kind = params.get("device_kind")
    if isinstance(kind, str) and kind.strip():
        return kind.strip().upper()
    return None


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
        "device_kind": _device_kind(branch),
    }


def _transformer_dict(trafo: Transformer, upstream_system_id: str | None) -> dict[str, Any]:
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
        # §16: punkt neutralny strony nN (dana modelu; `None` = niezadeklarowany).
        "lv_neutral": trafo.lv_neutral.model_dump(mode="json") if trafo.lv_neutral else None,
        # §10/§11: system SN transformatora (składowa sieci bez szyn domeny) —
        # dwa transformatory o TYM SAMYM identyfikatorze mają wspólne zasilanie.
        "upstream_system_id": upstream_system_id,
    }


def _generator_dict(gen: Any, der_state: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "ref_id": gen.ref_id,
        "name": gen.name,
        "bus_ref": gen.bus_ref,
        "p_mw": gen.p_mw,
        "q_mvar": gen.q_mvar,
        "gen_type": gen.gen_type,
        "connection_variant": gen.connection_variant,
        # §14: zdolność pracy wyspowej Z DANYCH (nie zgadywana) + jej źródło.
        "island_capability": der_state["island_capability"] if der_state else "UNKNOWN",
        "capability_source_pl": der_state["capability_source_pl"] if der_state else "",
        "island_operation_capable": (der_state["island_operation_capable"] if der_state else False),
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


def _measurement_dict(m: Any) -> dict[str, Any]:
    return {
        "ref_id": m.ref_id,
        "name": m.name,
        "measurement_type": m.measurement_type,
        "bus_ref": m.bus_ref,
        "bay_ref": m.bay_ref,
        "purpose": m.purpose,
        "ratio_primary": m.rating.ratio_primary,
        "ratio_secondary": m.rating.ratio_secondary,
        # Tabliczka przekładnika TEKSTEM obok symbolu (R2 §9): klasa, moc
        # pomiarowa, liczba rdzeni i układ CT — pola addytywne, brak = None.
        "accuracy_class": m.rating.accuracy_class,
        "burden_va": m.rating.burden_va,
        "ct_cores": getattr(m, "ct_cores", None),
        "ct_arrangement": getattr(m, "ct_arrangement", None),
    }


def _protection_dict(p: Any) -> dict[str, Any]:
    return {
        "ref_id": p.ref_id,
        "name": p.name,
        "breaker_ref": p.breaker_ref,
        "device_type": p.device_type,
        "ct_ref": p.ct_ref,
        "vt_ref": p.vt_ref,
        "is_enabled": p.is_enabled,
        "function_codes": sorted({str(s.function_type) for s in p.settings}),
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
    sub_board_bus_refs = {b for s in sub_switchboards for b in s["bus_refs"]}

    # Boundary links deduplikowane po (branch_ref) — jedna gałąź = jeden wpis,
    # deterministyczne sortowanie po branch_ref dla stabilnego payloadu.
    boundary_links_sorted = sorted(boundary_links, key=lambda link: link.branch_ref)
    boundary_branch_refs = {link.branch_ref for link in boundary_links_sorted}

    voltage_level_by_bus = {
        ref: voltage_level_id(bus_by_ref[ref].voltage_kv)
        for ref in domain_bus_refs
        if ref in bus_by_ref
    }
    energization: EnergizationView = build_energization_view(
        enm,
        domain_bus_refs,
        domain_branches,
        station=root,
        voltage_level_by_bus=voltage_level_by_bus,
    )
    der_state_by_ref = {d.ref_id: d.to_dict() for d in energization.ders}

    # --- Zaciski nN transformatorów i incomery (rola z topologii). ----------
    incomer_by_branch: dict[str, str] = {}  # branch_ref -> transformer_ref
    terminal_bus_refs: set[str] = set()
    for trafo in domain_transformers:
        touching = [
            b
            for b in domain_branches.values()
            if trafo.lv_bus_ref in (b.from_bus_ref, b.to_bus_ref) and b.type != "bus_coupler"
        ]
        if len(touching) == 1 and trafo.lv_bus_ref not in root.bus_refs:
            incomer_by_branch[touching[0].ref_id] = trafo.ref_id
            terminal_bus_refs.add(trafo.lv_bus_ref)

    nn_section_by_bus = {s.bus_ref: s for s in (root.nn_sections or [])}
    section_coupler_refs = {s.coupler_ref for s in (root.nn_sections or []) if s.coupler_ref}

    def _is_board(bus_ref: str) -> bool:
        if bus_ref in terminal_bus_refs:
            return False
        return bus_depth.get(bus_ref, 0) == 0 or bus_ref in sub_board_bus_refs

    # --- Rola urządzenia z topologii (§4/§8). ------------------------------
    generator_bus_refs = {g.bus_ref for g in domain_generators}
    load_bus_refs = {ld.bus_ref for ld in domain_loads}

    def _subtree(child: str, parent: str, excluded_branch: str) -> set[str]:
        """Szyny osiągalne z `child` bez gałęzi `excluded_branch`, bez cofania
        się do szyn płytszych niż `child` (odpływ nie „wciąga" sekcji rodzica
        przez sprzęgło ani inny odpływ)."""
        child_depth = bus_depth.get(child, 0)
        seen = {child}
        stack = [child]
        while stack:
            current = stack.pop()
            for neighbor, branch in adjacency.get(current, []):
                if branch.ref_id == excluded_branch or branch.ref_id not in domain_branches:
                    continue
                if neighbor == parent or neighbor in seen:
                    continue
                if bus_depth.get(neighbor, 0) < child_depth:
                    continue
                seen.add(neighbor)
                stack.append(neighbor)
        return seen

    def _feeder_kind(subtree: set[str]) -> str:
        """Rodzaj odpływu z zawartości poddrzewa. Podrozdzielnica ma
        PIERWSZEŃSTWO: odbiory/źródła za nią należą do niej, więc odpływ
        zasilający podrozdzielnicę jest odpływem „do podrozdzielnicy", a nie
        „mieszanym" z powodu jej własnych odbiorów. Potem granica domeny,
        potem zawartość bezpośrednia (odbiór / źródło / oba = mieszany)."""
        if subtree & sub_board_bus_refs:
            return "sub_board"
        if any(link.from_bus_ref in subtree for link in boundary_links_sorted):
            return "boundary"
        has_load = bool(subtree & load_bus_refs)
        has_der = bool(subtree & generator_bus_refs)
        if has_load and has_der:
            return "mixed"
        if has_load:
            return "load"
        if has_der:
            return "der"
        return "none"

    devices: list[dict[str, Any]] = []
    for ref_id in sorted(domain_branches):
        branch = domain_branches[ref_id]
        from_depth = bus_depth.get(branch.from_bus_ref, 0)
        to_depth = bus_depth.get(branch.to_bus_ref, 0)
        parent_bus = branch.from_bus_ref if from_depth <= to_depth else branch.to_bus_ref
        child_bus = branch.to_bus_ref if parent_bus == branch.from_bus_ref else branch.from_bus_ref
        role: str
        feeder_kind: str | None = None
        transformer_ref: str | None = None
        board_bus_ref: str | None = None
        if ref_id in incomer_by_branch:
            role = "incomer"
            transformer_ref = incomer_by_branch[ref_id]
            board_bus_ref = (
                branch.to_bus_ref
                if branch.from_bus_ref in terminal_bus_refs
                else branch.from_bus_ref
            )
        elif branch.type == "bus_coupler" or ref_id in section_coupler_refs:
            role = "coupler"
        elif ref_id in boundary_branch_refs:
            role = "boundary"
        elif _is_board(parent_bus) and not _is_board(child_bus):
            role = "feeder"
            board_bus_ref = parent_bus
            feeder_kind = _feeder_kind(_subtree(child_bus, parent_bus, ref_id))
        elif _is_board(parent_bus) and _is_board(child_bus):
            # Szyna rozdzielnicy → szyna rozdzielnicy bez sprzęgła (np. kabel do
            # podrozdzielnicy wprost z sekcji): odpływ do podrozdzielnicy.
            role = "feeder"
            board_bus_ref = parent_bus
            feeder_kind = "sub_board"
        else:
            role = "internal"
        devices.append(
            {
                "ref_id": ref_id,
                "device_type": branch.type,
                "device_kind": _device_kind(branch),
                "designation_class": DEVICE_DESIGNATION_BY_TYPE.get(str(branch.type), "Q"),
                "device_role": role,
                "feeder_kind": feeder_kind,
                "transformer_ref": transformer_ref,
                "board_bus_ref": board_bus_ref,
                "parent_bus_ref": parent_bus,
                "child_bus_ref": child_bus,
                "terminal_a": branch.from_bus_ref,
                "terminal_b": branch.to_bus_ref,
                "device_state": (
                    "CLOSED"
                    if branch.status == "closed"
                    else "OPEN" if branch.status == "open" else "UNKNOWN"
                ),
            }
        )

    # --- Sekcje rozdzielnic (§8/§22): korzeniowe i podrozdzielnice. ----------
    sections: list[dict[str, Any]] = []
    coupler_refs_by_bus: dict[str, list[str]] = {}
    incomer_refs_by_bus: dict[str, list[str]] = {}
    transformer_refs_by_board: dict[str, list[str]] = {}
    for device in devices:
        if device["device_role"] == "coupler":
            for bus in (device["terminal_a"], device["terminal_b"]):
                coupler_refs_by_bus.setdefault(bus, []).append(device["ref_id"])
        if device["device_role"] == "incomer" and device["board_bus_ref"]:
            incomer_refs_by_bus.setdefault(device["board_bus_ref"], []).append(device["ref_id"])
            transformer_refs_by_board.setdefault(device["board_bus_ref"], []).append(
                str(device["transformer_ref"])
            )
    for trafo in domain_transformers:
        if trafo.lv_bus_ref not in terminal_bus_refs:
            transformer_refs_by_board.setdefault(trafo.lv_bus_ref, []).append(trafo.ref_id)
    board_bus_refs = sorted(b for b in domain_bus_refs if _is_board(b))
    for order, bus_ref in enumerate(board_bus_refs, start=1):
        nn_section = nn_section_by_bus.get(bus_ref)
        owner = owner_by_bus.get(bus_ref)
        sections.append(
            {
                "section_id": nn_section.section_id if nn_section else bus_ref,
                "bus_ref": bus_ref,
                "order": nn_section.order if nn_section else order,
                "tier": "main" if bus_depth.get(bus_ref, 0) == 0 else "sub",
                "station_ref": owner.ref_id if owner else root.ref_id,
                "coupler_refs": sorted(coupler_refs_by_bus.get(bus_ref, [])),
                "incomer_refs": sorted(incomer_refs_by_bus.get(bus_ref, [])),
                "transformer_refs": sorted(transformer_refs_by_board.get(bus_ref, [])),
            }
        )

    domain_measurements = sorted(
        (m for m in enm.measurements if m.bus_ref in domain_bus_refs),
        key=lambda m: m.ref_id,
    )
    domain_protection = sorted(
        (p for p in enm.protection_assignments if p.breaker_ref in domain_branches),
        key=lambda p: p.ref_id,
    )

    return {
        "status": "OK",
        "station_ref": station_ref,
        "station_name": root.name,
        "earthing_system": (root.meta or {}).get("nn_earthing_system") or None,
        "root_bus_refs": sorted(seed_bus_refs),
        "buses": [
            _bus_dict(
                bus_by_ref[ref],
                bus_depth.get(ref, 0),
                energization.terminals[ref],
                is_board=_is_board(ref),
            )
            for ref in sorted(domain_bus_refs)
            if ref in bus_by_ref
        ],
        "islands": [island.to_dict() for island in energization.islands],
        "branches": [
            _branch_dict(b) for b in sorted(domain_branches.values(), key=lambda x: x.ref_id)
        ],
        "devices": devices,
        "segments": [segment.to_dict() for segment in energization.segments],
        "supply_paths": [path.to_dict() for path in energization.supply_paths],
        "sections": sections,
        "transformers": [
            _transformer_dict(t, energization.upstream_system_by_transformer.get(t.ref_id))
            for t in domain_transformers
        ],
        "generators": [
            _generator_dict(g, der_state_by_ref.get(g.ref_id)) for g in domain_generators
        ],
        "loads": [_load_dict(ld) for ld in domain_loads],
        "measurements": [_measurement_dict(m) for m in domain_measurements],
        "protection_assignments": [_protection_dict(p) for p in domain_protection],
        "sub_switchboards": sub_switchboards,
        "boundary_links": [link.to_dict() for link in boundary_links_sorted],
        # §17: ENM nie niesie pomiarów obecności napięcia — każdy stan zasilania w
        # tej odpowiedzi jest TOPOLOGICZNY (wg aktualnych stanów łączników).
        "measured_voltage_states": {},
        "energization_basis_pl": (
            "Stany zasilania są topologiczne (wg aktualnych stanów łączników); "
            "model nie niesie pomiarów obecności napięcia."
        ),
        "missing_data": [],
    }
