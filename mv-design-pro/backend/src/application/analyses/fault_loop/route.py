"""BFS trasy z grafu ENM dla pętli zwarcia nN (karta P0.6, luka G-05).

Warstwa APLIKACJI (interpretacja + wyławianie danych z modelu — NIE solver):
buduje trasę promieniową punkt-nN → zaciski nN transformatora po AKTYWNEJ
topologii ENM (kable/łączniki/wkładki ``status="closed"``) i przekłada
odcinki na ``RouteSegmentImpedance`` (surowe dane odczytane z gałęzi — R/X na
km × długość, żyła powrotna z pól kabla, n_parallel). Sumowanie
(dzielenie przez n_parallel, składanie odcinków) i cała reszta fizyki żyje
WYŁĄCZNIE w ``network_model.solvers.fault_loop_builder`` (reuse — zero
fizyki tutaj), zgodnie z regułą NOT-A-SOLVER.

BFS działa bezpośrednio na ``EnergyNetworkModel.branches``/``buses`` (NIE na
``NetworkGraph`` solvera zwarciowego/rozpływu) — ``NetworkGraph``/``LineBranch``
świadomie NIE niosą danych żyły powrotnej ani katalogowych (są abstrakcją dla
Y-bus/Z-bus), więc dociąganie tych pól tam byłoby dużo większą, ryzykowną
zmianą dotykającą maszynerii SC/PF. Ten sam wzorzec „własny BFS po adjacency"
ma już ``analysis/voltage_profile/segment_decomposition.py`` (BFS po
``NetworkGraph`` — tu analogicznie po ENM, bo potrzebne pola żyją tylko tam).

ZERO fabrykacji: brak danych żyły powrotnej (R lub X) na KTÓRYMKOLWIEK kablu
trasy → ``RouteExtractionError`` jawnie nazywający gałąź (fail-closed, nie
domyślne zero). Linia napowietrzna nN na trasie → jawny błąd (model nie niesie
danych żyły powrotnej dla ``OverheadLine`` — poza zakresem P0.6, P1 wg
``docs/nn/C_PLAN_ROZSZERZENIA_MODELU_NN.md`` §1: „LINIA_NN w P1").
"""

from __future__ import annotations

from collections import deque
from collections.abc import Iterable
from dataclasses import dataclass, replace
from typing import TypeAlias

from application.solvers.lv_temperature_correction import r_theta_ohm_per_km
from enm.models import (
    Cable,
    EnergyNetworkModel,
    FuseBranch,
    OverheadLine,
    SwitchBranch,
)
from network_model.solvers.fault_loop_builder import RouteSegmentImpedance

Odcinek: TypeAlias = Cable | FuseBranch | OverheadLine | SwitchBranch


class RouteExtractionError(ValueError):
    """Trasa do punktu zwarcia niedostępna albo dane pętli niekompletne."""


@dataclass(frozen=True)
class LvBusPath:
    """Trasa (uporządkowana krotka gałęzi) od korzenia (zaciski nN TR) do szyny."""

    bus_ref: str
    branches: tuple[Odcinek, ...]

    @property
    def hop_count(self) -> int:
        return len(self.branches)


def _closed_adjacency(enm: EnergyNetworkModel) -> dict[str, list[tuple[str, Odcinek]]]:
    """Sąsiedztwo AKTYWNEJ topologii nN: gałęzie ``status == "closed"``.

    Ta sama definicja aktywnej topologii co ``NetworkGraph.add_branch``
    (gałęzie in_service) i ``segment_decomposition`` (gałęzie in_service +
    łączniki CLOSED) — tu jeden status pola ``BranchBase.status`` obejmuje
    oba przypadki (kabel/łącznik/wkładka dzielą tę samą flagę).
    """
    adjacency: dict[str, list[tuple[str, Odcinek]]] = {}
    for branch in enm.branches:
        if branch.status != "closed":
            continue
        if not isinstance(branch, Cable | FuseBranch | OverheadLine | SwitchBranch):
            continue
        adjacency.setdefault(branch.from_bus_ref, []).append((branch.to_bus_ref, branch))
        adjacency.setdefault(branch.to_bus_ref, []).append((branch.from_bus_ref, branch))
    return adjacency


def bfs_paths_from(enm: EnergyNetworkModel, root_bus_ref: str) -> dict[str, LvBusPath]:
    """BFS (najmniej-hopowa) trasa od ``root_bus_ref`` do KAŻDEJ osiągalnej szyny.

    Sortowanie sąsiadów po ``(branch.ref_id, neighbor_bus_ref)`` zapewnia
    determinizm przy gałęziach równoległych (wzorzec
    ``segment_decomposition._bfs_hops``). Sieć nN jest promieniowa (LV-INV —
    każdy aktywny odbiór ma DOKŁADNIE JEDNĄ ciągłą ścieżkę do źródła), więc
    najmniej-hopowa trasa jest JEDYNĄ trasą — brak niejednoznaczności.
    """
    known_buses = {b.ref_id for b in enm.buses}
    if root_bus_ref not in known_buses:
        raise RouteExtractionError(
            f"Szyna źródłowa '{root_bus_ref}' nie istnieje w modelu — brak trasy do policzenia."
        )
    adjacency = _closed_adjacency(enm)
    visited = {root_bus_ref}
    paths: dict[str, LvBusPath] = {root_bus_ref: LvBusPath(bus_ref=root_bus_ref, branches=())}
    queue: deque[str] = deque([root_bus_ref])
    while queue:
        current = queue.popleft()
        current_path = paths[current].branches
        neighbors = sorted(
            adjacency.get(current, []),
            key=lambda item: (item[1].ref_id, item[0]),
        )
        for neighbor_bus_ref, branch in neighbors:
            if neighbor_bus_ref in visited:
                continue
            visited.add(neighbor_bus_ref)
            paths[neighbor_bus_ref] = LvBusPath(
                bus_ref=neighbor_bus_ref,
                branches=current_path + (branch,),
            )
            queue.append(neighbor_bus_ref)
    return paths


def path_to_bus(enm: EnergyNetworkModel, root_bus_ref: str, target_bus_ref: str) -> LvBusPath:
    """Trasa od ``root_bus_ref`` (zaciski nN TR) do ``target_bus_ref`` (punkt zwarcia)."""
    paths = bfs_paths_from(enm, root_bus_ref)
    path = paths.get(target_bus_ref)
    if path is None:
        raise RouteExtractionError(
            f"Szyna '{target_bus_ref}' nie jest osiągalna z '{root_bus_ref}' w aktywnej "
            "topologii nN (gałęzie zamknięte). Sprawdź stany łączników i ciągłość trasy."
        )
    return path


def route_segments(path: LvBusPath) -> list[RouteSegmentImpedance]:
    """Przekłada trasę (gałęzie) na odcinki pętli zwarcia (dane surowe, bez fizyki).

    Kabel (``Cable``): R/X żyły fazowej = ``r/x_ohm_per_km * length_km``; żyła
    powrotna z pól ``return_conductor_r_ohm_per_km_20c`` /
    ``return_conductor_x_ohm_per_km`` — BRAK KTÓREGOKOLWIEK z tych dwóch pól
    = jawny błąd (fail-closed, §0.1 karty P0.6).

    Łącznik (``SwitchBranch``): impedancja WYŁĄCZNIE fazowa, jeśli jawnie
    podana (``r_ohm``/``x_ohm``) — żyła powrotna PE/PEN nie jest przez
    łącznik przełączana (kanon terminologii: „Switch/Breaker — no impedance"
    to domyślne 0,0, nie brak danych).

    Wkładka (``FuseBranch``): zero impedancji (ten sam wzorzec „near-zero"
    co ``enm/mapping.py::map_enm_to_network_graph`` dla FuseBranch).

    Linia napowietrzna (``OverheadLine``): NIEOBSŁUGIWANA na tej trasie —
    model nie niesie danych żyły powrotnej (P1, poza zakresem P0.6).
    """
    segments: list[RouteSegmentImpedance] = []
    for branch in path.branches:
        if isinstance(branch, Cable):
            if (
                branch.return_conductor_r_ohm_per_km_20c is None
                or branch.return_conductor_x_ohm_per_km is None
            ):
                raise RouteExtractionError(
                    f"Kabel '{branch.ref_id}' ({branch.name or 'bez nazwy'}): brak danych "
                    "żyły powrotnej PE/PEN (return_conductor_r_ohm_per_km_20c / "
                    "return_conductor_x_ohm_per_km). Pętla zwarcia wymaga R I X żyły "
                    "powrotnej z KABEL_NN — fail-closed, zero fabrykacji (§0.1 karty P0.6)."
                )
            n_parallel = branch.n_parallel or 1
            segments.append(
                RouteSegmentImpedance(
                    label=f"Kabel {branch.name or branch.ref_id}",
                    branch_ref=branch.ref_id,
                    phase_total_r_ohm=branch.r_ohm_per_km * branch.length_km,
                    phase_total_x_ohm=branch.x_ohm_per_km * branch.length_km,
                    return_total_r_ohm=branch.return_conductor_r_ohm_per_km_20c * branch.length_km,
                    return_total_x_ohm=branch.return_conductor_x_ohm_per_km * branch.length_km,
                    n_parallel=n_parallel,
                )
            )
        elif isinstance(branch, SwitchBranch):
            r_ohm = branch.r_ohm or 0.0
            x_ohm = branch.x_ohm or 0.0
            if r_ohm == 0.0 and x_ohm == 0.0:
                continue
            segments.append(
                RouteSegmentImpedance(
                    label=f"Łącznik {branch.name or branch.ref_id}",
                    branch_ref=branch.ref_id,
                    phase_total_r_ohm=r_ohm,
                    phase_total_x_ohm=x_ohm,
                    return_total_r_ohm=0.0,
                    return_total_x_ohm=0.0,
                    n_parallel=1,
                )
            )
        elif isinstance(branch, FuseBranch):
            continue
        elif isinstance(branch, OverheadLine):
            raise RouteExtractionError(
                f"Linia napowietrzna nN '{branch.ref_id}' ({branch.name or 'bez nazwy'}): "
                "model nie niesie danych żyły powrotnej PE/PEN dla linii napowietrznych "
                "(poza zakresem karty P0.6 — P1 wg "
                "docs/nn/C_PLAN_ROZSZERZENIA_MODELU_NN.md §1 „LINIA_NN w P1»). "
                "Pętla zwarcia dla trasy z linią napowietrzną nie jest liczona."
            )
        else:  # pragma: no cover - Odcinek wyczerpuje wszystkie typy gałęzi
            raise RouteExtractionError(
                f"Nieobsługiwany typ gałęzi na trasie: {type(branch).__name__}"
            )
    return segments


def route_segments_min_scenario(path: LvBusPath) -> list[RouteSegmentImpedance]:
    """Odcinki trasy dla scenariusza MIN (Ik1_min SWZ) — R skorygowane
    temperaturowo (karta P0.6, wymóg testu §0.5: „Ik1_min pętli z korektą
    temperaturową — jeśli wejście, dekoruj jak w P0.3").

    R_theta = R20·[1 + 0,004·(θ_k − 20°C)] (IEC 60909, ta sama formuła i
    współczynnik co scenariusz MIN solvera zwarciowego —
    ``application.solvers.lv_temperature_correction.r_theta_ohm_per_km``,
    reuse, zero drugiej implementacji tej samej fizyki). Korekta obejmuje
    R żyły FAZOWEJ i R żyły POWROTNEJ (ten sam kabel, ta sama temperatura
    zwarciowa θ_k) — X pozostaje bez zmian (korekta temperaturowa dotyczy
    wyłącznie rezystancji). Kabel bez znanego θ_k
    (``short_circuit_temperature_c``) zostaje BEZ korekty (jawny brak, nie
    zgadywanie) — dokładnie ta sama zasada co w ``build_min_scenario_graph``.
    """
    segments = route_segments(path)
    theta_k_by_branch_ref: dict[str, float] = {
        b.ref_id: b.short_circuit_temperature_c
        for b in path.branches
        if isinstance(b, Cable) and b.short_circuit_temperature_c is not None
    }
    corrected: list[RouteSegmentImpedance] = []
    for seg in segments:
        theta_k = theta_k_by_branch_ref.get(seg.branch_ref)
        if theta_k is None:
            corrected.append(seg)
            continue
        # R_theta stosowany na R CAŁKOWITYM odcinka (r20*length_km) — korekta
        # jest współczynnikiem mnożącym, więc kolejność (na R/km czy na R
        # całkowite) daje identyczny wynik; total jest tym, co niesie segment.
        r20_phase_per_km = seg.phase_total_r_ohm  # już *length_km, ale mnożnik jest bezwymiarowy
        r20_return_per_km = seg.return_total_r_ohm
        corrected.append(
            replace(
                seg,
                phase_total_r_ohm=r_theta_ohm_per_km(r20_phase_per_km, theta_k),
                return_total_r_ohm=r_theta_ohm_per_km(r20_return_per_km, theta_k),
            )
        )
    return corrected


def incomer_branch_refs(
    enm: EnergyNetworkModel, station_bus_refs: Iterable[str], transformer_lv_bus_refs: Iterable[str]
) -> frozenset[str]:
    """Gałęzie WYŁĄCZNIKA GŁÓWNEGO nN (incomer): jedyna gałąź nie-sprzęgłowa
    ZACISKU nN transformatora, który NIE jest szyną rozdzielnicy stacji
    (``Substation.bus_refs``). Ta sama definicja co rola ``incomer`` w grafie
    domeny (`lv_domain/graph_view.py`) — JEDNO źródło, dwa konsumenty (pętla
    zwarcia / SWZ i arkusz obwodów). Zacisk będący zarazem szyną rozdzielnicy
    (transformator wprost na szynie) nie ma incomera: jego jedyna gałąź jest
    zwykłym odpływem."""
    boards = set(station_bus_refs)
    out: set[str] = set()
    for lv_bus_ref in transformer_lv_bus_refs:
        if lv_bus_ref in boards:
            continue
        touching = [
            b
            for b in enm.branches
            if lv_bus_ref in (b.from_bus_ref, b.to_bus_ref) and b.type != "bus_coupler"
        ]
        if len(touching) == 1:
            out.add(touching[0].ref_id)
    return frozenset(out)


def feeder_root_branch_ref(
    path: LvBusPath, incomer_refs: frozenset[str] = frozenset()
) -> str | None:
    """Referencja gałęzi-korzenia ODPŁYWU dla trasy od zacisku nN transformatora.

    Odpływ zaczyna się na SZYNIE ROZDZIELNICY: gdy trasa wchodzi na nią przez
    wyłącznik główny nN (``incomer_refs``), korzeniem odpływu jest DRUGA gałąź
    trasy, a sam incomer nie jest odpływem (przed tą korektą stacja z jawnym
    wyłącznikiem głównym miała JEDEN „odpływ" — incomer — obejmujący wszystkie
    punkty rozdzielnicy, więc SWZ i arkusz obwodów gubiły podział na odpływy).
    ``None`` dla korzenia samego (trasa pusta) i dla szyny rozdzielnicy tuż za
    incomerem (punkt zwarcia to sama szyna, nie odpływ).
    """
    if not path.branches:
        return None
    first = path.branches[0]
    if first.ref_id in incomer_refs:
        if len(path.branches) < 2:
            return None
        return path.branches[1].ref_id
    return first.ref_id


def group_bus_refs_by_feeder(
    paths: dict[str, LvBusPath], incomer_refs: frozenset[str] = frozenset()
) -> dict[str, list[str]]:
    """Grupuj referencje szyn wg odpływu (pierwsza gałąź trasy od korzenia).

    Czysto TOPOLOGICZNE (BFS) — niezależne od tego, czy fizyka pętli zwarcia
    TN ma zastosowanie dla stacji. REUSE point dla ``fault_loop.service.
    build_feeder_fault_loop_view`` (bez zmiany zachowania — ten sam wynik co
    wcześniejsza pętla inline) ORAZ ``application.analyses.nn_circuit_sheet``
    (karta ARKUSZ-NN, 2026-08-14): arkusz obliczeń musi enumerować odpływy dla
    KAŻDEGO układu sieci nN (TN/TT/IT) — tylko kolumny zależne od pętli TN
    (SWZ, Ik1_min) są bramkowane układem, nie istnienie samego wiersza.
    Wydzielenie tej pętli z ``build_feeder_fault_loop_view`` unika DRUGIEJ,
    nieznacznie innej pętli grupującej w agregatorze arkusza (KLASA NIE
    INSTANCJA — przegląd 2026-08-01).
    """
    feeder_bus_refs: dict[str, list[str]] = {}
    for bus_ref, path in sorted(paths.items()):
        root = feeder_root_branch_ref(path, incomer_refs)
        if root is None:  # sama szyna TR / szyna rozdzielnicy — nie jest punktem odpływu
            continue
        feeder_bus_refs.setdefault(root, []).append(bus_ref)
    return feeder_bus_refs
