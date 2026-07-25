"""
Analiza: wytrzymalosc cieplna przewodow (linie/kable SN) na model po biegu zwarciowym.

KARTA F-K1 FAZA 2 - sprawdzenie wytrzymalosci zwarciowej przewodow NA MODELU.

WARSTWA: APPLICATION/ANALYSES - interpretacja gotowego wyniku solvera IEC 60909
(``network_model.solvers.short_circuit_iec60909``) oraz gotowego kryterium
cieplnego (``network_model.solvers.conductor_thermal_withstand``). ZERO fizyki
wlasnej - modul TYLKO odczytuje wynik solvera i katalog, mapuje je na wejscie
kryterium solvera fazy 1 i agreguje wynik per galaz.

ZRODLA DANYCH (plik:linia w kodzie zrodlowym, stan na 2026-07-25):
- prad zwarciowy galezi: ``ShortCircuitResult.branch_contributions`` (suma
  ``i_contrib_a`` wszystkich zrodel dla danej galezi, netto wg kierunku
  from_to/to_from) -
  ``network_model/solvers/short_circuit_contributions.py:52-79``. Pole jest
  OPCJONALNE - ``None``, gdy solver uruchomiony bez
  ``include_branch_contributions=True`` (domyslnie ``False``) -
  ``network_model/solvers/short_circuit_iec60909.py:1049``. Gdy pole NIE jest
  ``None``, a galaz nie ma zadnego wpisu, oznacza to realny zerowy przeplyw
  pradu zwarciowego przez ta galaz (solver pomija wpisy z ``i_contrib_a <= 0``,
  patrz ``short_circuit_iec60909.py:934``) - NIE jest to brak danych.
- czas trwania zwarcia: ``ShortCircuitResult.tk_s`` - POJEDYNCZA wartosc dla
  calego wyniku zwarciowego (parametr wejsciowy przypadku obliczeniowego,
  wspolny dla calej sieci, uzyty tez do wyliczenia ``ith_a`` na poziomie wezla) -
  ``network_model/solvers/short_circuit_iec60909.py:102``. UWAGA (znalezisko
  karty): to jest zalozony/skonfigurowany czas obliczeniowy zwarcia, NIE
  rozwiazana nastawa zabezpieczenia danej galezi. Mapa
  galaz -> zabezpieczenie -> rzeczywisty czas zadzialania NIE ISTNIEJE w
  ``application/analyses/protection/**`` (potwierdzone recon - brak takiego
  ogniwa w kodzie na dzien karty). Modul przyjmuje ``sc_result.tk_s`` jako
  wspolny czas dla wszystkich galezi tego wyniku; parametr
  ``tk_s_by_branch`` pozwala nadpisac go per-galaz, gdy w przyszlosci powstanie
  wiarygodne zrodlo czasu zadzialania zabezpieczenia danej galezi (rozszerzenie
  addytywne, bez zmiany kontraktu).
- dane katalogowe przewodu (Ith(1s), Jth(1s), przekroj): resolwowane przez
  ``network_model.catalog.resolve_thermal_params(type_ref, is_cable, catalog)`` -
  ``network_model/catalog/resolver.py:282-333``.

ZERO FABRYKACJI: brak ktoregokolwiek zrodla danych dla galezi -> status
UNAVAILABLE z kodem gotowosci (patrz
``network_model.solvers.conductor_thermal_withstand``), nigdy przyblizenie
bez jawnego zalozenia.

DETERMINIZM: pozycje wyniku posortowane wg ``branch_id``; brak znacznikow czasu
w tresci wyniku.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from enm.canonical_analysis import CanonicalRun
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from network_model.catalog.repository import CatalogRepository
from network_model.catalog.resolver import resolve_thermal_params
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.solvers.conductor_thermal_withstand import (
    ConductorThermalInput,
    check_conductor_thermal_withstand,
)
from network_model.solvers.short_circuit_contributions import ShortCircuitBranchContribution
from network_model.solvers.short_circuit_core import ShortCircuitType
from network_model.solvers.short_circuit_iec60909 import ShortCircuitResult


@dataclass(frozen=True)
class ConductorThermalWithstandItem:
    """Pozycja wyniku (jedna galaz) kontroli wytrzymalosci cieplnej."""

    branch_id: str
    branch_name: str
    status: str
    i_fault_a: float | None
    i_permissible_a: float | None
    utilization: float | None
    s_min_mm2: float | None
    applied_cross_section_mm2: float | None
    missing_codes: tuple[str, ...]
    # Uzasadnienie statusu, gdy nie wynika on z rachunku kryterium (np. galaz poza
    # droga zwarcia). Bez tego PASS bylby nieodroznialny od PASS z obliczen.
    uzasadnienie_pl: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "branch_id": self.branch_id,
            "branch_name": self.branch_name,
            "status": self.status,
            "i_fault_a": self.i_fault_a,
            "i_permissible_a": self.i_permissible_a,
            "utilization": self.utilization,
            "s_min_mm2": self.s_min_mm2,
            "applied_cross_section_mm2": self.applied_cross_section_mm2,
            "uzasadnienie_pl": self.uzasadnienie_pl,
            "missing_codes": list(self.missing_codes),
        }


@dataclass(frozen=True)
class ConductorThermalWithstandSummary:
    """Podsumowanie liczbowe wyniku - PASS/FAIL/UNAVAILABLE per model."""

    pass_count: int
    fail_count: int
    unavailable_count: int

    def to_dict(self) -> dict[str, int]:
        return {
            "pass_count": self.pass_count,
            "fail_count": self.fail_count,
            "unavailable_count": self.unavailable_count,
        }


@dataclass(frozen=True)
class ConductorThermalWithstandView:
    """Pelny wynik analizy wytrzymalosci cieplnej przewodow dla modelu."""

    items: tuple[ConductorThermalWithstandItem, ...]
    summary: ConductorThermalWithstandSummary

    def to_dict(self) -> dict[str, Any]:
        return {
            "items": [item.to_dict() for item in self.items],
            "summary": self.summary.to_dict(),
        }


def _branch_fault_current_a(sc_result: ShortCircuitResult, branch_id: str) -> float | None:
    """Prad zwarciowy [A] przypisany galezi.

    Suma udzialow zrodel (``branch_contributions``) dla danej galezi, netto wg
    kierunku (from_to dodatnio, to_from ujemnie), modul sumy.

    Zwraca ``None``, gdy solver NIE policzyl rozbicia na galezie
    (``branch_contributions is None``) - brak danych, nie przyblizenie.
    Zwraca ``0.0``, gdy rozbicie ISTNIEJE, ale galaz nie ma zadnego wpisu -
    realny brak przeplywu pradu zwarciowego przez ta galaz dla danego zwarcia.
    """
    if sc_result.branch_contributions is None:
        return None

    net_a = 0.0
    for contrib in sc_result.branch_contributions:
        if contrib.branch_id != branch_id:
            continue
        if contrib.direction == "from_to":
            net_a += contrib.i_contrib_a
        else:
            net_a -= contrib.i_contrib_a
    return abs(net_a)


def _resolve_branch_thermal_catalog(
    branch: LineBranch, catalog: CatalogRepository | None
) -> tuple[float | None, float | None, float | None]:
    """(ith_1s_a, jth_1s_a_per_mm2, cross_section_mm2) danych cieplnych galezi.

    KOLEJNOSC ZRODEL (karta F-K1 faza 3):
    1. Dane NA GALEZI grafu — przeniesione z modelu przez `map_enm_to_network_graph`,
       gdzie trafiaja z materializacji katalogowej. To jedyna droga dostepna w
       sciezce PRODUKCYJNEJ, bo graf nie niesie odniesienia katalogowego (`type_ref`
       swiadomie pozostaje pusty, zeby nie zmieniac precedencji impedancji).
    2. Katalog przez `type_ref` — dostepne, gdy graf zbudowano z podaniem typu
       (tory doborowe, testy, import). Nie zastepuje punktu 1, tylko go dopelnia.

    Brak obu zrodel => (None, None, None), czyli kryterium NIESPRAWDZALNE z kodem
    gotowosci. Nigdy wartosc domyslna.
    """
    ith_z_galezi = branch.get_thermal_ith_1s_a()
    if ith_z_galezi is not None:
        return ith_z_galezi, branch.jth_1s_a_per_mm2, branch.cross_section_mm2

    thermal = resolve_thermal_params(
        type_ref=branch.type_ref,
        is_cable=(branch.branch_type == BranchType.CABLE),
        catalog=catalog,
    )
    if thermal is None:
        return None, None, None
    return thermal.get_ith_1s(), thermal.jth_1s_a_per_mm2, thermal.cross_section_mm2


def build_conductor_thermal_withstand_view(
    sc_result: ShortCircuitResult,
    graph: NetworkGraph,
    catalog: CatalogRepository | None,
    tk_s_by_branch: Mapping[str, float | None] | None = None,
) -> ConductorThermalWithstandView:
    """Zbuduj widok wytrzymalosci cieplnej przewodow (linie/kable) dla calego modelu.

    Dla kazdej galezi typu Line/Cable w grafie liczy kryterium IEC 60949 (gotowy
    solver fazy 1 ``check_conductor_thermal_withstand``) na podstawie:
    - pradu zwarciowego galezi (``sc_result.branch_contributions``),
    - czasu trwania zwarcia (``sc_result.tk_s``, ewentualnie nadpisany per-galaz
      przez ``tk_s_by_branch``, gdy dostepne jest wiarygodne zrodlo czasu
      zadzialania zabezpieczenia danej galezi),
    - danych katalogowych galezi (``resolve_thermal_params``).

    Args:
        sc_result: wynik biegu zwarciowego IEC 60909 (solver frozen API).
        graph: graf sieci (zrodlo galezi Line/Cable oraz ich ``type_ref``).
        catalog: repozytorium katalogu (rozwiazanie danych cieplnych galezi).
        tk_s_by_branch: opcjonalna mapa branch_id -> czas trwania zwarcia [s],
            nadpisujaca ``sc_result.tk_s`` dla wskazanych galezi. Galaz obecna
            w mapie z wartoscia ``None`` jest jawnie oznaczana jako brak czasu
            (kod ``conductor.fault_duration_missing``). Galaz nieobecna w mapie
            uzywa ``sc_result.tk_s``.

    Returns:
        ConductorThermalWithstandView - pozycje posortowane wg branch_id
        (determinizm), z podsumowaniem PASS/FAIL/UNAVAILABLE.
    """
    items: list[ConductorThermalWithstandItem] = []

    for branch_id in sorted(graph.branches.keys()):
        branch = graph.branches[branch_id]
        if not isinstance(branch, LineBranch):
            continue
        if branch.branch_type not in (BranchType.LINE, BranchType.CABLE):
            continue

        i_fault_a = _branch_fault_current_a(sc_result, branch_id)

        if tk_s_by_branch is not None and branch_id in tk_s_by_branch:
            tk_s = tk_s_by_branch[branch_id]
        else:
            tk_s = sc_result.tk_s

        ith_1s_a, jth_1s_a_per_mm2, cross_section_mm2 = _resolve_branch_thermal_catalog(
            branch, catalog
        )

        # Galaz o ZEROWYM przeplywie pradu zwarciowego nie lezy na drodze zwarcia.
        # Kryterium cieplne jest dla niej spelnione trywialnie (0 <= I_dop), ale NIE
        # wynika to z rachunku — solver fazy 1 slusznie traktuje prad 0 jako brak
        # danej (zero nie jest wielkoscia fizyczna w miejscu, gdzie zwarcie liczymy).
        # Rozstrzygniecie nalezy do warstwy INTERPRETACJI: tutaj wiemy, ze zero jest
        # realne, bo solver pomija wklady i_contrib_a <= 0, a lista wkladow istnieje.
        if i_fault_a == 0.0:
            items.append(
                ConductorThermalWithstandItem(
                    branch_id=branch_id,
                    branch_name=branch.name,
                    status="PASS",
                    i_fault_a=0.0,
                    i_permissible_a=None,
                    utilization=None,
                    s_min_mm2=None,
                    applied_cross_section_mm2=cross_section_mm2,
                    missing_codes=(),
                    uzasadnienie_pl=(
                        "Brak przeplywu pradu zwarciowego — galaz poza droga zwarcia; "
                        "kryterium cieplne spelnione trywialnie."
                    ),
                )
            )
            continue

        result = check_conductor_thermal_withstand(
            ConductorThermalInput(
                ith_a=i_fault_a,
                fault_duration_s=tk_s,
                ith_1s_a=ith_1s_a,
                jth_1s_a_per_mm2=jth_1s_a_per_mm2,
                cross_section_mm2=cross_section_mm2,
            )
        )

        items.append(
            ConductorThermalWithstandItem(
                branch_id=branch_id,
                branch_name=branch.name,
                status=result.status,
                i_fault_a=i_fault_a,
                i_permissible_a=result.admissible_current_a,
                utilization=result.utilization,
                s_min_mm2=result.required_cross_section_mm2,
                applied_cross_section_mm2=cross_section_mm2,
                missing_codes=result.readiness_codes,
            )
        )

    summary = ConductorThermalWithstandSummary(
        pass_count=sum(1 for item in items if item.status == "PASS"),
        fail_count=sum(1 for item in items if item.status == "FAIL"),
        unavailable_count=sum(1 for item in items if item.status == "UNAVAILABLE"),
    )
    return ConductorThermalWithstandView(items=tuple(items), summary=summary)


def _odtworz_wklady_galeziowe(
    payload: Mapping[str, Any],
) -> list[ShortCircuitBranchContribution] | None:
    """Odtworz wklady galeziowe z wiersza wyniku biegu (read-only).

    Brak klucza => None, czyli BRAK ROZBICIA na galezie (kryterium niesprawdzalne
    z kodem gotowosci). Pusta lista => rozbicie ISTNIEJE i jest puste, wiec zadna
    galaz nie lezy na drodze zwarcia — to inny stan niz brak danych i nie wolno go
    z nim mylic.
    """
    surowe = payload.get("branch_contributions")
    if surowe is None:
        return None
    wklady: list[ShortCircuitBranchContribution] = []
    for wpis in surowe:
        if not isinstance(wpis, Mapping):
            continue
        wklady.append(
            ShortCircuitBranchContribution(
                source_id=str(wpis.get("source_id", "")),
                branch_id=str(wpis.get("branch_id", "")),
                from_node_id=str(wpis.get("from_node_id", "")),
                to_node_id=str(wpis.get("to_node_id", "")),
                i_contrib_a=float(wpis.get("i_contrib_a", 0.0)),
                direction=str(wpis.get("direction", "from_to")),
            )
        )
    return wklady


def build_wytrzymalosc_cieplna_view(run: CanonicalRun) -> dict[str, Any]:
    """Widok wytrzymalosci cieplnej przewodow dla przebiegu zwarciowego (karta F-K1 faza 3).

    Konsument analizy — bez niego kryterium liczyloby sie, a projektant by go nie
    widzial (czyli byloby wyspa, przed ktora ostrzega audyt FLOW).

    Bierze PIERWSZY wiersz wyniku zwarciowego (najniekorzystniejszy przypadek jest
    wybierany przy zestawianiu biegu, nie tutaj) i buduje ocene per galaz.

    Raises:
        ValueError: gdy przebieg nie jest zwarciowy albo nie jest zakonczony —
            komunikat w jezyku polskim, jak w pozostalych widokach.
    """
    if run.analysis_type != "short_circuit_sn":
        raise ValueError(
            "Ocena wytrzymalosci cieplnej przewodow wymaga przebiegu zwarciowego; "
            f"otrzymano rodzaj analizy: {run.analysis_type}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg {run.id} nie jest zakonczony (status={run.status}); "
            "wynik zwarciowy nie jest dostepny."
        )

    # `raw_result["results"]` jest LISTA wierszy (canonical_analysis.py:1015), nie mapa.
    wiersze = (run.raw_result or {}).get("results") or []
    if not wiersze:
        raise ValueError(
            f"Przebieg {run.id} nie zawiera wiersza wyniku zwarciowego, "
            "wiec nie ma na czym oprzec oceny cieplnej."
        )
    payload = wiersze[0]

    sc_result = ShortCircuitResult(
        short_circuit_type=ShortCircuitType(str(payload.get("short_circuit_type"))),
        fault_node_id=str(payload.get("fault_node_id", "")),
        c_factor=float(payload.get("c_factor", 0.0)),
        un_v=float(payload.get("un_v", 0.0)),
        zkk_ohm=complex(0.0, 0.0),
        ikss_a=float(payload.get("ikss_a", 0.0)),
        ip_a=float(payload.get("ip_a", 0.0)),
        ith_a=float(payload.get("ith_a", 0.0)),
        sk_mva=float(payload.get("sk_mva", 0.0)),
        rx_ratio=float(payload.get("rx_ratio", 0.0)),
        kappa=float(payload.get("kappa", 0.0)),
        tk_s=float(payload.get("tk_s", 0.0)),
        ib_a=float(payload.get("ib_a", 0.0)),
        tb_s=float(payload.get("tb_s", 0.0)),
        branch_contributions=_odtworz_wklady_galeziowe(payload),
    )

    graph = map_enm_to_network_graph(EnergyNetworkModel.model_validate(run.snapshot))
    # Katalog nie jest przekazywany: w sciezce produkcyjnej dane cieplne przychodza
    # NA GALEZI (przeniesione z materializacji katalogowej przez mapowanie ENM),
    # a nie przez `type_ref`, ktorego graf swiadomie nie wypelnia.
    widok = build_conductor_thermal_withstand_view(sc_result, graph, None)
    return {
        "run_id": str(run.id),
        "case_id": run.case_id,
        "analysis_type": run.analysis_type,
        "fault_node_id": sc_result.fault_node_id,
        "tk_s": sc_result.tk_s,
        "ocena": widok.to_dict(),
    }
