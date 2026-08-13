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
- czas trwania zwarcia: DWA zrodla, w jawnej kolejnosci pierwszenstwa.
  (1) Czas WYZNACZONY Z NASTAW zabezpieczenia danej galezi -
  ``application/analyses/protection/czas_wylaczenia_galezi.czasy_dla_modelu``,
  podany tu przez ``tk_s_by_branch`` (patrz wywolanie ``mapa_tk_s_z_nastaw``
  nizej w tym module). Galaz bez rozwiazanej nastawy jest w tej mapie
  NIEOBECNA - i to jest celowe.
  (2) Fallback: ``ShortCircuitResult.tk_s`` - POJEDYNCZA wartosc dla calego
  wyniku zwarciowego (parametr wejsciowy przypadku, wspolny dla calej sieci,
  uzyty tez do wyliczenia ``ith_a`` na poziomie wezla) -
  ``network_model/solvers/short_circuit_iec60909.py:102``. To jest czas
  ZALOZONY, nie rozwiazany; ``slad_czasu`` nazywa ten stan wprost, zeby
  projektant wiedzial, ze ocenil galaz na wlasnym zalozeniu normowym.

  UWAGA REDAKCYJNA (V12K-269): ten akapit mowil wczesniej, ze mapa
  galaz -> zabezpieczenie -> czas zadzialania „NIE ISTNIEJE" i ze
  ``tk_s_by_branch`` czeka na przyszle zrodlo. Ogniwo powstalo i JEST wpiete
  (import ``czas_wylaczenia_galezi`` ponizej), a opis zostal nieaktualny -
  czytajac go mozna bylo zbudowac drugi raz to, co juz dziala.
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

from application.analyses.prad_zwarciowy_galezi import (
    prad_zwarciowy_galezi as _branch_fault_current_a,
)
from application.analyses.protection.czas_wylaczenia_galezi import (
    czasy_dla_modelu,
    mapa_tk_s_z_nastaw,
    podsumowanie_czasow,
    slad_czasu,
)
from enm.canonical_analysis import CanonicalRun, pobierz_rozplyw_biegu
from enm.hash import compute_enm_hash
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from enm.store import get_enm
from network_model.catalog.repository import CatalogRepository
from network_model.catalog.resolver import resolve_thermal_params
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.solvers.conductor_thermal_withstand import (
    CONDUCTOR_KIND_BARE,
    CONDUCTOR_KIND_CABLE,
    STANDARD_REFS,
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
    # Karta F-K1 faza 5: POCHODZENIE czasu trwania zwarcia dla TEJ galezi. Czas z
    # rozwiazanej nastawy i czas zalozony w przypadku obliczeniowym daja tak samo
    # wygladajaca liczbe, wiec bez tego sladu projektant nie odroznia rozwiazanej
    # ochrony od wlasnego zalozenia. ``None`` = galaz nie weszla do rachunku.
    czas_wylaczenia: dict[str, Any] | None = None
    # Kroki dowodowe rachunku (WHITE BOX solvera) — puste, gdy nie bylo rachunku.
    kroki_dowodu: tuple[dict[str, Any], ...] = ()
    # --- Calculation Evidence (karta F-K1 faza 6) ---
    # Bilans energii: I²t wobec k²S² — fizyczna tresc kryterium.
    i2t_a2s: float | None = None
    i2t_dopuszczalne_a2s: float | None = None
    margines_procent: float | None = None
    # Kryteria czastkowe z osobnym werdyktem (ktore ograniczenie zdecydowalo).
    kryteria: tuple[dict[str, Any], ...] = ()
    # Jednozdaniowy powod werdyktu do kolumny tabeli.
    powod_decyzji_pl: str | None = None
    # Dzialania naprawcze z progiem liczbowym i skutkiem.
    zalecenia: tuple[dict[str, Any], ...] = ()
    # Wrazliwosc wyniku na czas, prad i przekroj.
    wrazliwosc: tuple[dict[str, Any], ...] = ()
    # Uzasadnienie wspolczynnika k (material, izolacja, temperatury, zrodlo).
    uzasadnienie_k: dict[str, Any] | None = None

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
            "czas_wylaczenia": self.czas_wylaczenia,
            "i2t_a2s": self.i2t_a2s,
            "i2t_dopuszczalne_a2s": self.i2t_dopuszczalne_a2s,
            "margines_procent": self.margines_procent,
            "kryteria": [dict(k) for k in self.kryteria],
            "powod_decyzji_pl": self.powod_decyzji_pl,
            "zalecenia": [dict(z) for z in self.zalecenia],
            "wrazliwosc": [dict(w) for w in self.wrazliwosc],
            "uzasadnienie_k": self.uzasadnienie_k,
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


def _dane_materialowe_galezi(branch: LineBranch) -> dict[str, Any]:
    """Material zyly, izolacja i para temperatur — do UZASADNIENIA k.

    Dane ida z galezi grafu (przeniesione z modelu przez mapowanie ENM). Brak
    ktorejkolwiek pozycji jest NAZWANY w dowodzie, a nie uzupelniany wartoscia
    typowa z tablic normy — zgadniete k falszowaloby werdykt bezpieczenstwa.
    """
    return {
        "conductor_material": branch.conductor_material,
        "insulation": branch.insulation,
        "temp_operating_c": branch.operating_temperature_c,
        "temp_short_circuit_c": branch.short_circuit_temperature_c,
        "material_source_ref": branch.thermal_source_ref,
        # Karta F-K1 faza 7: RODZAJ przewodu bierzemy z typu galezi grafu — to jedyne
        # miejsce, ktore wie, czy odcinek jest kablem, czy przewodem golym linii
        # napowietrznej. Bez tego rozroznienia dowod dla kazdej linii zglaszalby
        # nieprawdziwy „brak izolacji" (przewod goly izolacji nie ma).
        "conductor_kind": (
            CONDUCTOR_KIND_CABLE if branch.branch_type == BranchType.CABLE else CONDUCTOR_KIND_BARE
        ),
    }


def build_conductor_thermal_withstand_view(
    sc_result: ShortCircuitResult,
    graph: NetworkGraph,
    catalog: CatalogRepository | None,
    tk_s_by_branch: Mapping[str, float | None] | None = None,
    slad_czasu_by_branch: Mapping[str, Mapping[str, Any]] | None = None,
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
        slad_czasu_by_branch: opcjonalna mapa branch_id -> POCHODZENIE czasu
            (``protection.czas_wylaczenia_galezi.slad_czasu``). Trafia wprost do
            pozycji wyniku, zeby czas z nastawy byl odrozniany od czasu
            zalozonego w przypadku obliczeniowym.

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

        slad_czasu = None
        if slad_czasu_by_branch is not None:
            wpis_czasu = slad_czasu_by_branch.get(branch_id)
            slad_czasu = dict(wpis_czasu) if wpis_czasu is not None else None

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
                        "Brak przepływu prądu zwarciowego — gałąź poza drogą zwarcia; "
                        "kryterium cieplne spełnione trywialnie."
                    ),
                    czas_wylaczenia=slad_czasu,
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
                **_dane_materialowe_galezi(branch),
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
                czas_wylaczenia=slad_czasu,
                kroki_dowodu=result.white_box_trace,
                i2t_a2s=result.i2t_a2s,
                i2t_dopuszczalne_a2s=result.i2t_admissible_a2s,
                margines_procent=result.margin_percent,
                kryteria=result.criteria,
                powod_decyzji_pl=result.decision_reason_pl,
                zalecenia=result.recommendations,
                wrazliwosc=result.sensitivity,
                uzasadnienie_k=result.k_justification,
            )
        )

    summary = ConductorThermalWithstandSummary(
        pass_count=sum(1 for item in items if item.status == "PASS"),
        fail_count=sum(1 for item in items if item.status == "FAIL"),
        unavailable_count=sum(1 for item in items if item.status == "UNAVAILABLE"),
    )
    return ConductorThermalWithstandView(items=tuple(items), summary=summary)


def _odtworz_wklady_galeziowe(
    surowe: list[dict[str, Any]] | None,
) -> list[ShortCircuitBranchContribution] | None:
    """Odtworz wklady galeziowe biegu (read-only).

    Brak wpisow => None, czyli BRAK ROZBICIA na galezie (kryterium niesprawdzalne
    z kodem gotowosci). Pusta lista => rozbicie ISTNIEJE i jest puste, wiec zadna
    galaz nie lezy na drodze zwarcia — to inny stan niz brak danych i nie wolno go
    z nim mylic.

    K14: wejscie pochodzi z `pobierz_rozplyw_biegu` (jedna prawda dostepu do
    rozplywu: artefakt inline albo osobna tabela rozplywu).
    """
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


def _aktualnosc_wobec_modelu(run: CanonicalRun) -> dict[str, Any]:
    """Czy bieg zostal policzony dla BIEZACEJ wersji modelu (regula 4 kanonu).

    Ta sama zasada, ktorej uzywa agregat werdyktu projektowego: porownanie hasha
    snapshotu biegu z hashem modelu przypadku. Brak modelu w rejestrze nie jest
    „nieaktualnoscia" — to brak podstawy do porownania i mowimy o tym wprost.
    """
    model = get_enm(run.case_id)
    if model is None:
        return {
            "aktualny": None,
            "powod_pl": (
                "Nie ma z czym porownac: model przypadku nie jest zaladowany w tej sesji."
            ),
            "model_hash": None,
            "snapshot_hash": run.snapshot_hash,
        }
    model_hash = compute_enm_hash(model)
    aktualny = run.snapshot_hash == model_hash
    return {
        "aktualny": aktualny,
        "powod_pl": (
            "Wynik policzony dla biezacej wersji modelu."
            if aktualny
            else (
                "Model zmienil sie po tym biegu — liczby dotycza WCZESNIEJSZEJ wersji "
                "projektu. Uruchom bieg zwarciowy ponownie przed odbiorem."
            )
        ),
        "model_hash": model_hash,
        "snapshot_hash": run.snapshot_hash,
    }


def _odtworz_wynik_zwarciowy(run: CanonicalRun) -> ShortCircuitResult:
    """Wynik zwarciowy odtworzony z wiersza przebiegu (read-only, bez fizyki).

    Bierze PIERWSZY wiersz wyniku (najniekorzystniejszy przypadek wybiera sie przy
    zestawianiu biegu, nie tutaj). Wspolne wejscie dla widoku oceny i dla dowodu —
    dzieki temu dowod pokazuje TE SAME liczby, co tabela.

    Raises:
        ValueError: gdy przebieg nie jest zwarciowy, nie jest zakonczony albo nie
            zawiera wiersza wyniku — komunikat po polsku, jak w innych widokach.
    """
    if run.analysis_type != "short_circuit_sn":
        raise ValueError(
            "Ocena wytrzymałości cieplnej przewodów wymaga przebiegu zwarciowego; "
            f"otrzymano rodzaj analizy: {run.analysis_type}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg {run.id} nie jest zakończony (status={run.status}); "
            "wynik zwarciowy nie jest dostępny."
        )

    # `raw_result["results"]` jest LISTA wierszy (canonical_analysis.py:1015), nie mapa.
    wiersze = (run.raw_result or {}).get("results") or []
    if not wiersze:
        raise ValueError(
            f"Przebieg {run.id} nie zawiera wiersza wyniku zwarciowego, "
            "więc nie ma na czym oprzeć oceny cieplnej."
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
        branch_contributions=_odtworz_wklady_galeziowe(
            pobierz_rozplyw_biegu(run, str(payload.get("fault_node_id", "")))
        ),
    )
    return sc_result


def _ocena_dla_przebiegu(
    run: CanonicalRun,
) -> tuple[ShortCircuitResult, ConductorThermalWithstandView, dict[str, dict[str, Any]]]:
    """(wynik zwarciowy, ocena cieplna, slad czasu) dla przebiegu — jedno przejscie.

    Karta F-K1 faza 5: czas trwania zwarcia PER GALAZ z realnej mapy zabezpieczen.
    Galaz z rozwiazana nastawa dostaje czas policzony przez solver IEC 60255 przy
    PRADZIE TEJ GALEZI; pozostale uzywaja zalozonego czasu przypadku, ale slad mowi
    to wprost (``zrodlo``), wiec zalozenie nigdy nie udaje nastawy.
    """
    sc_result = _odtworz_wynik_zwarciowy(run)
    model = EnergyNetworkModel.model_validate(run.snapshot)
    graph = map_enm_to_network_graph(model)

    czasy = czasy_dla_modelu(model=model, graph=graph, sc_result=sc_result)
    slad = slad_czasu(czasy, tk_s_zalozony=sc_result.tk_s)

    # Katalog nie jest przekazywany: w sciezce produkcyjnej dane cieplne przychodza
    # NA GALEZI (przeniesione z materializacji katalogowej przez mapowanie ENM),
    # a nie przez `type_ref`, ktorego graf swiadomie nie wypelnia.
    widok = build_conductor_thermal_withstand_view(
        sc_result,
        graph,
        None,
        tk_s_by_branch=mapa_tk_s_z_nastaw(czasy),
        slad_czasu_by_branch=slad,
    )
    return sc_result, widok, slad


def build_wytrzymalosc_cieplna_view(run: CanonicalRun) -> dict[str, Any]:
    """Widok wytrzymalosci cieplnej przewodow dla przebiegu zwarciowego (karta F-K1 faza 3).

    Konsument analizy — bez niego kryterium liczyloby sie, a projektant by go nie
    widzial (czyli byloby wyspa, przed ktora ostrzega audyt FLOW).

    Raises:
        ValueError: gdy przebieg nie jest zwarciowy albo nie jest zakonczony —
            komunikat w jezyku polskim, jak w pozostalych widokach.
    """
    sc_result, widok, slad = _ocena_dla_przebiegu(run)
    return {
        "run_id": str(run.id),
        # Karta F-K1 faza 6 (uwaga 12): raport MUSI powiedziec, czy liczby dotycza
        # BIEZACEGO modelu. Zmiana przekroju, nastawy albo topologii unieważnia bieg,
        # a wynik sprzed zmiany wyglada identycznie — bez tej informacji projektant
        # moglby odebrac projekt na nieaktualnym dowodzie.
        "aktualnosc": _aktualnosc_wobec_modelu(run),
        "case_id": run.case_id,
        "analysis_type": run.analysis_type,
        "fault_node_id": sc_result.fault_node_id,
        "tk_s": sc_result.tk_s,
        "czasy_wylaczenia": podsumowanie_czasow(slad),
        # Podstawa normowa Z PUNKTEM — raport ma byc dowodem obliczeniowym, wiec
        # kazde kryterium musi dac sie odniesc do zapisu normy (uwaga 14).
        "normy": [dict(pozycja) for pozycja in STANDARD_REFS],
        "ocena": widok.to_dict(),
    }


def zbuduj_dowod_cieplny(run: CanonicalRun, branch_id: str) -> dict[str, Any]:
    """Kroki dowodowe kryterium cieplnego dla JEDNEJ galezi (karta F-K1 faza 5).

    Dowod zaczyna sie od kroku „Czas trwania zwarcia" — bo to on rozstrzyga, czy
    werdykt opiera sie na rozwiazanej nastawie, czy na zalozeniu przypadku. Dalsze
    kroki to slad WHITE BOX solvera kryterium (Wzor -> Dane -> Podstawienie ->
    Wynik -> Uwagi), przepisany bez zadnego przeliczania.

    Raises:
        ValueError: gdy przebieg nie nadaje sie do oceny (jak w widoku) albo gdy
            wskazana galaz nie wystepuje w ocenie.
    """
    # Kroki solvera bierzemy z OBIEKTU oceny (``to_dict`` ich nie niesie — lista
    # pozycji nie ma puchnac o slad dowodowy kazdej galezi).
    _sc_result, widok, slad = _ocena_dla_przebiegu(run)
    pozycja = next((item for item in widok.items if item.branch_id == branch_id), None)
    if pozycja is None:
        raise ValueError(f"Gałąź {branch_id} nie występuje w ocenie cieplnej przebiegu {run.id}.")

    kroki: list[dict[str, Any]] = []
    wpis_czasu = slad.get(branch_id)
    if wpis_czasu is not None:
        kroki.append(_krok_czasu(wpis_czasu))
    for numer, krok in enumerate(pozycja.kroki_dowodu, start=len(kroki) + 1):
        kopia = dict(krok)
        kopia["step"] = numer
        kopia["element_id"] = branch_id
        kroki.append(kopia)

    if not pozycja.kroki_dowodu:
        # Rachunku nie bylo (galaz poza droga zwarcia albo brak danej wejsciowej).
        # Okno dowodu i tak musi powiedziec DLACZEGO — puste okno wygladaloby jak
        # awaria, a nie jak uczciwy brak podstawy do rachunku.
        kroki.append(
            {
                "step": len(kroki) + 1,
                "key": "conductor_thermal_no_calculation",
                "title": "Rachunku cieplnego nie przeprowadzono",
                "inputs": {},
                "substitution": "",
                "result": {},
                "notes": pozycja.uzasadnienie_pl
                or (
                    "Brak danych do rachunku: " + ", ".join(pozycja.missing_codes) + "."
                    if pozycja.missing_codes
                    else "Brak podstawy do rachunku cieplnego dla tej gałęzi."
                ),
                "element_id": branch_id,
            }
        )

    return {
        "run_id": str(run.id),
        "branch_id": branch_id,
        "branch_name": pozycja.branch_name,
        "status": pozycja.status,
        "kroki": kroki,
    }


def _liczba_tex(value: float) -> str:
    """Liczba w zapisie polskim dla KaTeX (przecinek jako grupa ``{,}``)."""
    return f"{round(value, 6):g}".replace(".", "{,}")


def _krok_czasu(wpis: Mapping[str, Any]) -> dict[str, Any]:
    """Krok 1 dowodu: SKAD wziety jest czas trwania zwarcia dla tej galezi."""
    z_nastawy = wpis.get("zrodlo") == "nastawa_zabezpieczenia"
    dane: dict[str, Any] = {}
    if wpis.get("prad_galezi_a") is not None:
        dane["i_galezi_a"] = {
            "value": round(float(wpis["prad_galezi_a"]), 6),
            "unit": "A",
            "label": "Prąd zwarciowy gałęzi",
        }
    if wpis.get("prad_rozruchowy_a") is not None:
        dane["i_rozruchowy_a"] = {
            "value": round(float(wpis["prad_rozruchowy_a"]), 6),
            "unit": "A",
            "label": "Próg rozruchowy zabezpieczenia",
        }
    if wpis.get("tms") is not None:
        dane["tms"] = {
            "value": round(float(wpis["tms"]), 6),
            "unit": "-",
            "label": "Mnożnik czasowy nastawy",
        }

    # Pole „Podstawienie" okna dowodu renderuje sie przez KaTeX, wiec musi byc
    # LaTeX-em (zdanie zostaloby zlepione w jeden ciag matematyczny).
    czas_tex = _liczba_tex(float(wpis["tk_s"])) if wpis.get("tk_s") is not None else "?"
    if z_nastawy and wpis.get("stala_a") is not None and wpis.get("stala_b") is not None:
        wzor = r"$$t_k = \mathrm{TMS} \cdot \frac{A}{(I/I_s)^{B} - 1}$$"
        podstawienie = (
            r"$$t_k = "
            + _liczba_tex(float(wpis["tms"]))
            + r" \cdot \frac{"
            + _liczba_tex(float(wpis["stala_a"]))
            + r"}{\left(\frac{"
            + _liczba_tex(float(wpis["prad_galezi_a"]))
            + r"}{"
            + _liczba_tex(float(wpis["prad_rozruchowy_a"]))
            + r"}\right)^{"
            + _liczba_tex(float(wpis["stala_b"]))
            + r"} - 1} = "
            + czas_tex
            + r"\ \mathrm{s}$$"
        )
    elif z_nastawy:
        # Charakterystyka niezalezna (DT): czas to wprost nastawiona zwloka —
        # nie ma wzoru do podstawienia, jest sama wartosc.
        wzor = None
        podstawienie = r"$$t_k = " + czas_tex + r"\ \mathrm{s}$$"
    else:
        wzor = None
        podstawienie = r"$$t_k = " + czas_tex + r"\ \mathrm{s}$$"

    krok: dict[str, Any] = {
        "step": 1,
        "key": "conductor_thermal_time_source",
        "title": (
            "Czas trwania zwarcia z nastawy zabezpieczenia"
            if z_nastawy
            else "Czas trwania zwarcia z założenia przypadku"
        ),
        "inputs": dane,
        "substitution": podstawienie,
        "result": {
            "tk_s": {
                "value": wpis.get("tk_s"),
                "unit": "s",
                "label": "Czas trwania zwarcia",
            }
        },
        "notes": str(wpis.get("powod_pl") or ""),
    }
    if wzor is not None:
        krok["formula_latex"] = wzor
    return krok
