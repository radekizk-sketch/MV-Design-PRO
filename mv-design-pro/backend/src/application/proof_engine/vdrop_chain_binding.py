"""Łańcuch odcinków dowodu VDROP: REUŻYCIE dekompozycji ΔU per odcinek (P0.4)
jako JEDYNEGO źródła topologii ścieżki źródło→węzeł (karta P0.5b, N-D6).

DEFEKT, KTÓRY TO ZAMYKA (N-D6). Pakiet dowodowy VDROP obsługiwał wyłącznie
POJEDYNCZY odcinek (MVP=1) wybrany bezpośrednio przez użytkownika — łańcuch
SN kabel → TR → odcinki nN nie miał żadnej reprezentacji: albo dokumentowano
JEDEN dowolny odcinek trasy (myląco, bo pomijał resztę drogi od źródła), albo
trzeba by liczyć DRUGĄ dekompozycję ścieżki niezależną od tej, którą P0.4 już
zbudował dla profilu napięć (``analysis/voltage_profile/segment_decomposition.py``,
``application/analyses/voltage_profile_view.py``, ``GET /api/quality/
voltage-profile``). Ten moduł zamyka oba: łańcuch ma dowolną długość ≥1, a
TOPOLOGIA trasy (kolejność odcinków, ich węzły, rozróżnienie linia/kabel vs
transformator) pochodzi WYŁĄCZNIE z ``VoltageProfileSegmentBuilder.build_path``
— zero drugiego wyszukiwania trasy.

DWA ŹRÓDŁA, DWIE RÓŻNE RZECZY (nie duplikacja tej samej wiedzy):
- TOPOLOGIA ścieżki (które gałęzie, w jakiej kolejności, jaki rodzaj) —
  wyłącznie z ``segment_decomposition`` (P0.4).
- FIZYKA odcinka VDROP (R/X/L/P/Q/U_n dla linii/kabla) — wyłącznie z
  ISTNIEJĄCEJ warstwy wiązania ``application/solvers/voltage_drop_binding.py``
  (``odcinki_spadku_napiecia``), przez PROSTY LOOKUP po ``branch_id`` — bez
  powielania ekstrakcji R/X/P/Q z zapisu biegu.

GRANICA TRANSFORMATORA (uzgodnienie U4). Transformator na trasie NIE JEST
odcinkiem VDROP (``RODZAJE_ODCINKA`` w ``voltage_drop_binding.py`` wyklucza go
od początku istnienia tego modułu — zmienia napięcie przekładnią, nie spadkiem
wzdłużnym). Dla takiego kroku łańcuch niesie WYŁĄCZNIE napięcia obu stron
POLICZONE PRZEZ SOLVER PF (``u_from_kv``/``u_to_kv`` z ``VoltageProfileSegment``,
te same liczby co w profilu napięć P0.4) — dowód VDROP nazywa to jawnie jako
zmianę podstawy (EQ_VDROP_010), nie liczy drugiej fizyki transformatora.

WARSTWA (arch_guard). Ten plik leży w ``application/proof_engine/`` (NIE w
``application/solvers/`` ani w ``analysis/``) właśnie po to, żeby mógł
importować OBA źródła: ``analysis.voltage_profile.segment_decomposition``
(zakazane dla katalogu ``solvers`` — patrz ``scripts/arch_guard.py``,
``FORBIDDEN_IMPORTS["solvers"] = ("analysis", ...)``) i
``application.solvers.voltage_drop_binding``. Umieszczenie tej kompozycji w
``application/solvers/voltage_drop_binding.py`` naruszyłoby arch_guard.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from analysis.voltage_profile.segment_decomposition import (
    VoltageProfileSegmentBuilder,
    VoltageProfileSegmentPathError,
)
from application.solvers.voltage_drop_binding import (
    OdcinekSpadku,
    _ref_wezla,
    odcinki_spadku_napiecia,
)
from network_model.core.branch import BranchType
from network_model.core.graph import NetworkGraph
from network_model.solvers.power_flow_result import PowerFlowResultV1


class BrakLancuchaSpadkuError(ValueError):
    """Łańcuch odcinków od źródła do punktu nie da się złożyć uczciwie.

    Powody: gałąź docelowa nieznana w grafie, ścieżka nieosiągalna w aktywnej
    topologii (patrz ``VoltageProfileSegmentPathError``), albo odcinek
    linii/kabla NA TRASIE nie ma kompletu danych fizycznych (impedancja
    jednostkowa, długość, przepływ P/Q) — komunikat po polsku, zero
    fabrykowania brakującej liczby.
    """


@dataclass(frozen=True)
class OdcinekLancucha:
    """Jeden krok łańcucha VDROP: odcinek linii/kabla ALBO granica transformatora.

    ``jest_transformatorem`` i ``odcinek_fizyczny`` są PARĄ predykatów z
    JEDNEGO źródła prawdy (``branch.branch_type`` z grafu) — nigdy dwóch
    niezależnych warunków, które „dziś się zgadzają" (reguła KLASA, NIE
    INSTANCJA, CLAUDE.md): ``odcinek_fizyczny is None`` WTEDY I TYLKO WTEDY,
    GDY ``jest_transformatorem`` jest prawdą.
    """

    segment_id: str
    from_bus: str
    to_bus: str
    jest_transformatorem: bool
    #: Dane fizyczne VDROP (R/X/L/P/Q/U_n) — ``None`` <=> ``jest_transformatorem``.
    odcinek_fizyczny: OdcinekSpadku | None
    #: Napięcia obu końców kroku POLICZONE PRZEZ SOLVER PF (zawsze z
    #: ``segment_decomposition`` — dla linii/kabla RÓWNE napięciom węzłów na
    #: trasie, dla transformatora JEDYNE źródło zmiany podstawy napięcia).
    u_from_kv: float
    u_to_kv: float

    def __post_init__(self) -> None:
        if self.jest_transformatorem and self.odcinek_fizyczny is not None:
            raise ValueError(
                f"Krok '{self.segment_id}': jest_transformatorem=True, ale "
                "odcinek_fizyczny podany — niezmiennik pary predykatów naruszony."
            )
        if not self.jest_transformatorem and self.odcinek_fizyczny is None:
            raise ValueError(
                f"Krok '{self.segment_id}': jest_transformatorem=False, ale "
                "odcinek_fizyczny brak — niezmiennik pary predykatów naruszony."
            )


@dataclass(frozen=True)
class LancuchSpadkuNapiecia:
    """Pełny łańcuch VDROP od źródła (SLACK, domyślnie) do punktu docelowego.

    ``kroki`` jest uporządkowana od źródła do ``target_id`` (indeks 0 =
    pierwszy krok za źródłem) — DOKŁADNIE ta sama kolejność, którą zwraca
    ``VoltageProfileSegmentBuilder.build_path`` (P0.4), bo to jest jedyne
    źródło tej kolejności (zero drugiego sortowania).
    """

    source_id: str
    target_id: str
    u_source_kv: float
    u_node_kv: float
    kroki: tuple[OdcinekLancucha, ...]


def lancuch_spadku_napiecia(
    *,
    graph: NetworkGraph,
    pf_result: PowerFlowResultV1,
    raw_result: dict[str, Any] | None,
    snapshot: dict[str, Any] | None,
    docelowa_galaz_id: str,
    source_id: str | None = None,
) -> LancuchSpadkuNapiecia:
    """Złóż łańcuch VDROP od źródła do węzła KOŃCOWEGO gałęzi ``docelowa_galaz_id``.

    ``docelowa_galaz_id`` to ta sama gałąź, którą użytkownik wybiera z listy
    „punktów" pakietu dowodowego rozpływu (``pakiet_biegu.py::punkty_pakietu``)
    — łańcuch dokumentuje CAŁĄ trasę od źródła do KOŃCA tej gałęzi
    (``branch.to_node_id``), nie samą gałąź z osobna.

    Raises:
        BrakLancuchaSpadkuError: gałąź nieznana w grafie, ścieżka nieosiągalna,
            albo odcinek linii/kabla na trasie nie ma kompletu danych fizycznych.
    """
    docelowa_galaz = graph.branches.get(docelowa_galaz_id)
    if docelowa_galaz is None:
        raise BrakLancuchaSpadkuError(
            f"Gałąź '{docelowa_galaz_id}' nie istnieje w grafie sieci tego przebiegu."
        )

    try:
        path = VoltageProfileSegmentBuilder(graph).build_path(
            pf_result, docelowa_galaz.to_node_id, source_id=source_id
        )
    except VoltageProfileSegmentPathError as exc:
        raise BrakLancuchaSpadkuError(str(exc)) from exc

    # Fizyka VDROP WSZYSTKICH odcinków linii/kabla przebiegu — LOOKUP po
    # branch_id, bez ponownej ekstrakcji R/X/P/Q (jedno źródło prawdy fizyki,
    # patrz docstring modułu).
    fizyka_po_id = {
        odcinek.id_galezi: odcinek
        for odcinek in odcinki_spadku_napiecia(raw_result=raw_result, snapshot=snapshot)
    }

    # Rozstrzygnięcia węzłów na CZYTELNE referencje (``element_id`` ENM) —
    # DOKŁADNIE ta sama funkcja co ``voltage_drop_binding._zloz_odcinek`` używa
    # dla odcinków linii/kabla (``_ref_wezla``), zastosowana też do węzłów
    # źródła/celu łańcucha i granic transformatora — inaczej dowód pokazywałby
    # surowe id grafu zamiast referencji, którą projektant rozpoznaje.
    wezly_grafu = ((raw_result or {}).get("graph") or {}).get("nodes")
    if not isinstance(wezly_grafu, dict):
        wezly_grafu = {}

    def _pretty(node_id: str) -> str:
        wezel = wezly_grafu.get(node_id)
        return _ref_wezla(wezel if isinstance(wezel, dict) else {}, node_id)

    kroki: list[OdcinekLancucha] = []
    for segment in path.segments:
        branch = graph.branches.get(segment.branch_id)
        if branch is None:
            raise BrakLancuchaSpadkuError(
                f"Gałąź '{segment.branch_id}' na trasie nie istnieje w grafie sieci "
                "(niespójność grafu i dekompozycji ΔU)."
            )
        jest_tr = branch.branch_type == BranchType.TRANSFORMER
        if jest_tr:
            kroki.append(
                OdcinekLancucha(
                    segment_id=segment.branch_id,
                    from_bus=_pretty(segment.from_bus),
                    to_bus=_pretty(segment.to_bus),
                    jest_transformatorem=True,
                    odcinek_fizyczny=None,
                    u_from_kv=segment.u_from_kv,
                    u_to_kv=segment.u_to_kv,
                )
            )
            continue

        fizyka = fizyka_po_id.get(segment.branch_id)
        if fizyka is None:
            raise BrakLancuchaSpadkuError(
                f"Odcinek '{segment.branch_id}' na trasie do wybranego punktu nie ma "
                "kompletu danych (impedancja jednostkowa, długość, przepływ P/Q) "
                "potrzebnych do dowodu spadku napięcia — uruchom obliczenie ponownie "
                "albo uzupełnij dane katalogowe odcinka."
            )
        kroki.append(
            OdcinekLancucha(
                segment_id=segment.branch_id,
                # ``fizyka.od_szyny``/``do_szyny`` (z ``OdcinekSpadku``) już są
                # rozstrzygnięte tą samą funkcją — powtórzenie tutaj utrzymuje
                # ``OdcinekLancucha.from_bus``/``to_bus`` spójne z ``odcinek_fizyczny``
                # niezależnie od tego, które pole czyta dalszy kod.
                from_bus=fizyka.od_szyny,
                to_bus=fizyka.do_szyny,
                jest_transformatorem=False,
                odcinek_fizyczny=fizyka,
                u_from_kv=segment.u_from_kv,
                u_to_kv=segment.u_to_kv,
            )
        )

    return LancuchSpadkuNapiecia(
        source_id=_pretty(path.source_id),
        target_id=_pretty(path.node_id),
        u_source_kv=path.u_source_kv,
        u_node_kv=path.u_node_kv,
        kroki=tuple(kroki),
    )
