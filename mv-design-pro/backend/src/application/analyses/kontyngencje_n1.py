"""Serwis aplikacyjny: enumeracja kontyngencji N-1 (decyzja D8).

Warstwa APPLICATION (ORKIESTRACJA, NIE fizyka). Odpowiada na pytanie „czy sieć
zniesie wyłączenie dowolnego pojedynczego elementu": dla KAŻDEGO kwalifikowanego
elementu (linia napowietrzna, kabel, transformator) buduje WARIANT WEJŚCIA
solvera bez tego elementu, uruchamia ISTNIEJĄCY solver rozpływu przez ISTNIEJĄCĄ
ścieżkę wykonania (``enm.canonical_analysis._execute_power_flow`` — ta sama
funkcja, której używa kanoniczny przebieg PF) i składa macierz skutków.

ZERO nowej fizyki, ZERO mutacji modelu, ZERO równoległości, ZERO heurystyk.

MECHANIZM WARIANTOWANIA (reguła Case Immutability).
Wyłączenie elementu = USUNIĘCIE go z listy elementów w KOPII migawki, na której
pracuje bieg wariantu (``copy.deepcopy`` + filtr po ``ref_id``). Model w magazynie
(``enm.store``) ani migawka biegu bazowego NIE są dotykane — dokładnie ten sam
wzorzec, którego używają zdolność przyłączeniowa (``hosting_capacity.py``),
obszar P–Q (``pq_area.py``) i odpowiedź OSD (``odpowiedz_osd.py``): wariant to
delta migawki + ``CanonicalRun`` w pamięci (bez persystencji).

JEDEN mechanizm dla WSZYSTKICH rodzajów elementów (linia, kabel, transformator) —
warunkiem wyjściowym jest zawsze to samo: w grafie wariantu NIE MA krawędzi tego
elementu, więc solver nie widzi jego admitancji (``power_flow_newton_internal``
buduje Y-bus wyłącznie z gałęzi obecnych w grafie). Celowo NIE używamy tu pola
``BranchBase.status`` („open"), bo transformator ENM takiego pola nie ma — dwa
mechanizmy dla dwóch rodzajów elementu byłyby dwiema ścieżkami tej samej operacji,
rozjeżdżającymi się przy pierwszej zmianie.

KRYTERIA OCENY — WSZYSTKIE ze źródeł, które już istnieją (zero progów zaszytych
w tym module):

1. przeciążenia gałęzi i transformatorów oraz odchylenia napięć —
   ``application.analyses.energy_validation.service.build_energy_validation_view``
   (builder D2 ``analysis/energy_validation``): obciążalność długotrwała gałęzi z
   ``BranchRating.in_a`` modelu ENM (→ ``LineBranch.rated_current_a``), moc
   znamionowa transformatora z ``Transformer.sn_mva`` (→
   ``TransformerBranch.rated_power_mva``), pasmo napięciowe i progi obciążenia z
   ``EnergyValidationConfig`` (80 % / 100 % obciążenia, ±5 % / ±10 % napięcia).
   BRAK DANEJ NIE JEST WYNIKIEM: gałąź bez obciążalności albo szyna bez
   policzonego napięcia trafia do ``kryteria_pominiete`` z powodem po polsku
   (pozycja ``NOT_COMPUTED`` buildera), a nie do naruszeń i nie do „w normie".
2. odbiory pozbawione zasilania — ``build_slack_island`` z
   ``network_model.solvers.power_flow_newton_internal``, czyli DOKŁADNIE ta sama
   funkcja, którą solver rozpływu wyznacza wyspę węzła bilansującego
   (``power_flow_newton.py``). Nie własny przegląd grafu: dwa niezależne
   przeglądy „dziś zgodne" to defekt czekający na dane brzegowe.

DOTKLIWOŚĆ I RANKING (definicja JAWNA, bez wag — patrz ``_klucz_rankingu``).
Dotkliwość kontyngencji to KROTKA LICZNIKÓW per kategoria, a nie liczba złożona:
(liczba odbiorów bez zasilania, liczba przeciążeń, liczba naruszeń napięciowych).
Ranking sortuje leksykograficznie tą krotką malejąco, a przy remisie rosnąco po
``element_ref``. Kolejność kategorii jest DEKLARACJĄ kontraktu (skutek dla
odbiorcy przed przeciążeniem, przeciążenie przed odchyleniem napięcia), nie wagą
liczbową — żadna kategoria nie jest przeliczana na inną.

UCZCIWA DEGRADACJA (zero cichego pomijania):
- bieg wariantu niezbieżny (albo solver podniósł wyjątek) → ``status`` =
  ``"niezbiegl"`` z powodem; liczniki przeciążeń i napięć = ``None`` (NIE zero —
  ich nie policzono), a odbiory bez zasilania są policzone mimo to, bo wynikają z
  topologii wariantu, a nie z rozwiązania;
- element już wyłączony w modelu bazowym (gałąź ze ``status="open"``) →
  ``status`` = ``"wykluczony"`` z powodem (jego wyłączenie nie jest kontyngencją);
- kontyngencje ``niezbiegl``/``wykluczony`` NIE trafiają do rankingu (nie da się
  ich porównać licznikami, których nie ma) — idą do sekcji ``nierozstrzygniete``.

DETERMINIZM: enumeracja po posortowanym ``element_ref``, każdy bieg wariantu na
kopii migawki bazowej (kolejność elementów w migawce bez znaczenia — mapowanie
ENM→graf sortuje po ``ref_id``), zero znaczników czasu w wyniku, zaokrąglenia
jawne (wartości obserwowane do 4 miejsc, moce do 6).

WYDAJNOŚĆ (pomiar wykonany kartą N-1-BACKEND na substracie referencyjnym
53 stacji — ``tests/reference_networks/sld_substrate_52s.py``: 315 szyn,
260 gałęzi, 54 transformatory, 20 odbiorów; bieg sekwencyjny, jeden rdzeń):
    kontyngencji kwalifikowanych: 142
    czas łączny: 374,7 s
    czas na kontyngencję: 2,64 s
Bieg jest sekwencyjny Z ZAŁOŻENIA (determinizm) — zrównoleglenie NIE wchodzi w
zakres tej karty. Dla sieci tej wielkości komplet N-1 zajmuje ~6 minut, czyli
poza progiem interaktywnym.

ODPOWIEDŹ NA TEN KOSZT (karta ekranu N-1, fala 12 wg D8) — dwie drogi, obie
sterowane przez inżyniera, ŻADNA nie skracająca listy heurystyką:
1. ZAWĘŻENIE zakresu: parametr ``element_refs`` liczy wyłącznie wskazane
   elementy. Listę do wyboru podaje ``build_kontyngencje_n1_zakres_view`` — z
   modelu, tą samą regułą kwalifikacji co enumeracja, więc wybór jest wyborem z
   modelu, a nie zgadywaniem klienta;
2. BIEG PEŁNY ze ZNANYM kosztem: ta sama zapowiedź podaje przed startem, ile
   pozycji stanie w macierzy i ile razy uruchomi się solver. Kosztu NIE
   wyrażamy czasem — pomiar 2,64 s pochodzi z INNEGO substratu, a przeliczenie
   go na bieżącą sieć byłoby liczbą zmyśloną (kontrakt nie niesie pomiaru czasu
   z tego modelu).
Skracanie listy kontyngencji heurystyką (np. „licz tylko elementy podejrzane")
pozostaje ZAKAZANE: kontyngencja pominięta bez decyzji inżyniera to naruszenie
nieznalezione, o którym nikt nie wie.

ROZGRANICZENIE WZGLĘDEM ``reliability_contingency`` (solver V12.6 akademicki,
``network_model/solvers/v126_academic.py::_reliability``): tamta zdolność liczy
WSKAŹNIKI NIEZAWODNOŚCI (SAIDI/SAIFI/CAIDI wg IEEE 1366) z intensywności
uszkodzeń i czasów odtworzenia i szacuje obciążenie gałęzi BEZ biegu rozpływu.
Ta karta nie dubluje jej ani nie zmienia: tu każda kontyngencja ma WŁASNY bieg
rozpływu istniejącym solverem, a wynikiem jest stan posteryjny sieci, nie wskaźnik
przerw.
"""

from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import dataclass
from typing import Any

from analysis.energy_validation.models import EnergyValidationConfig
from application.analyses.energy_validation.service import build_energy_validation_view
from application.analyses.kontekst_widoku import zbuduj_kontekst_widoku
from enm.canonical_analysis import CanonicalRun, _execute_power_flow
from enm.mapping import map_enm_to_network_graph, ref_to_graph_id
from enm.models import EnergyNetworkModel
from network_model.core.node import NodeType
from network_model.solvers.power_flow_newton_internal import build_slack_island

#: Rodzaje gałęzi ENM kwalifikowane jako kontyngencja N-1 tej karty. Aparaty
#: łączeniowe (``switch``/``breaker``/``bus_coupler``/``disconnector``/``fuse``)
#: NIE są kontyngencjami: ich otwarcie to operacja łączeniowa (wariant pracy
#: sieci), a nie ubytek elementu przesyłowego. Źródła również nie — decyzja §0
#: karty N-1-BACKEND (osobna zdolność, osobna karta).
KWALIFIKOWANE_TYPY_GALEZI: frozenset[str] = frozenset({"line_overhead", "cable"})

#: Powód wykluczenia elementu już wyłączonego w modelu bazowym — JEDNO zdanie dla
#: obu konsumentów kontraktu: enumeracji (``_kontyngencja``) i zapowiedzi zakresu
#: (``build_kontyngencje_n1_zakres_view``). Dwie kopie tego samego uzasadnienia
#: rozjechałyby się przy pierwszej zmianie brzmienia, a inżynier zobaczyłby dwa
#: różne powody tego samego rozstrzygnięcia (równość przypięta testem).
POWOD_WYKLUCZENIA_PL = (
    "Element jest już wyłączony w modelu bazowym (status open), "
    "więc jego wyłączenie nie jest kontyngencją."
)

#: Rodzaje kontroli walidacji energetycznej (D2) czytane jako PRZECIĄŻENIE.
_TYPY_PRZECIAZENIA: frozenset[str] = frozenset({"BRANCH_LOADING", "TRANSFORMER_LOADING"})
#: Rodzaj kontroli czytany jako NARUSZENIE NAPIĘCIOWE.
_TYP_NAPIECIA = "VOLTAGE_DEVIATION"
#: Kontrole, których pominięcie (``NOT_COMPUTED``) raportujemy per kontyngencja.
#: Budżet strat i bilans mocy biernej są kontrolami SIECIOWYMI (jedna pozycja na
#: całą sieć), nie kryteriami N-1 per element — świadomie poza tą listą.
_TYPY_KRYTERIOW = _TYPY_PRZECIAZENIA | {_TYP_NAPIECIA}


@dataclass(frozen=True)
class _Element:
    """Kwalifikowany element modelu — kandydat na kontyngencję."""

    ref: str
    kind: str
    name: str | None
    kolekcja: str
    wylaczony_w_bazie: bool


def _round4(value: float | None) -> float | None:
    return round(float(value), 4) if value is not None else None


def _round6(value: float | None) -> float | None:
    return round(float(value), 6) if value is not None else None


def _inwentarz_elementow(snapshot: dict[str, Any]) -> list[_Element]:
    """Wszystkie kwalifikowane elementy migawki, posortowane po ``ref_id``.

    Inwentarz KLASY, nie przykładu: obejmuje oba rodzaje gałęzi przesyłowych
    (linia napowietrzna, kabel) ORAZ transformatory — czyli komplet elementów,
    których ubytek zmienia topologię przesyłu w modelu ENM.
    """
    elementy: list[_Element] = []
    for galaz in snapshot.get("branches") or []:
        if str(galaz.get("type")) not in KWALIFIKOWANE_TYPY_GALEZI:
            continue
        elementy.append(
            _Element(
                ref=str(galaz["ref_id"]),
                kind=str(galaz["type"]),
                name=galaz.get("name"),
                kolekcja="branches",
                # PREDYKAT PARZYSTY z regułą ruchu mostu ENM→graf: gałąź pracuje
                # wtedy i tylko wtedy, gdy jej stan to „closed" (most ustawia
                # ``in_service=(status == "closed")``). Zapis „== open" byłby
                # DRUGIM, niezależnym warunkiem — dziś zgodnym, bo dziedzina pola
                # jest dwuwartościowa, i rozjeżdżającym się przy pierwszej jej
                # zmianie. Warunek wejścia (co pracuje) i wyjścia (co wykluczamy
                # z enumeracji) pochodzi więc z jednego zdania.
                wylaczony_w_bazie=str(galaz.get("status") or "closed") != "closed",
            )
        )
    for trafo in snapshot.get("transformers") or []:
        elementy.append(
            _Element(
                ref=str(trafo["ref_id"]),
                kind="transformer",
                name=trafo.get("name"),
                kolekcja="transformers",
                # Model ENM nie zna stanu wyłączenia transformatora (klasa
                # ``Transformer`` nie ma pola ``status``), więc transformator
                # nigdy nie jest „już wyłączony" — i nie zmyślamy, że bywa.
                wylaczony_w_bazie=False,
            )
        )
    return sorted(elementy, key=lambda element: element.ref)


def _wariant_bez_elementu(snapshot: dict[str, Any], element: _Element) -> dict[str, Any]:
    """Kopia migawki BEZ wskazanego elementu (wariant wejścia solvera).

    Model bazowy pozostaje nietknięty — pracujemy na głębokiej kopii (reguła
    Case Immutability: przypadek obliczeniowy nie mutuje modelu sieci).
    """
    wariant = copy.deepcopy(snapshot)
    wariant[element.kolekcja] = [
        pozycja
        for pozycja in (wariant.get(element.kolekcja) or [])
        if str(pozycja.get("ref_id")) != element.ref
    ]
    return wariant


def _bieg_wariantu(bazowy: CanonicalRun, snapshot: dict[str, Any]) -> CanonicalRun:
    """Przebieg rozpływu w pamięci (bez persystencji) na podanej migawce."""
    return CanonicalRun(
        id=bazowy.id,
        case_id=bazowy.case_id,
        project_id=bazowy.project_id,
        analysis_type="PF",
        status="FINISHED",
        created_at=bazowy.created_at,
        snapshot_hash=bazowy.snapshot_hash,
        input_hash=bazowy.input_hash,
        snapshot=snapshot,
        validation={},
        readiness={},
        options=dict(bazowy.options),
    )


def _zasilanie(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Odbiory i szyny pozbawione zasilania w podanej migawce.

    Wyspę zasilaną wyznacza ``build_slack_island`` — TA SAMA funkcja, której
    używa solver rozpływu do ustalenia, które węzły w ogóle rozwiązuje. Kryterium
    jest topologiczne, więc jest rozstrzygalne także wtedy, gdy bieg wariantu nie
    osiągnął zbieżności.
    """
    enm = EnergyNetworkModel.model_validate(snapshot)
    graf = map_enm_to_network_graph(enm)
    wezly_slack = sorted(
        node_id for node_id, node in graf.nodes.items() if node.node_type == NodeType.SLACK
    )
    if not wezly_slack:
        # Brak węzła bilansującego = brak zasilania w ogóle. To WYNIK (cała sieć
        # bez zasilania), nie błąd — ta sama sytuacja, którą bieg rozpływu melduje
        # wyjątkiem „Brak wezla bilansujacego SLACK".
        zasilane: set[str] = set()
        wezel_bilansujacy = None
    else:
        wezel_bilansujacy = wezly_slack[0]
        wyspa, _poza = build_slack_island(graf, wezel_bilansujacy)
        zasilane = set(wyspa)

    szyny_bez_zasilania = sorted(
        str(bus["ref_id"])
        for bus in (snapshot.get("buses") or [])
        if ref_to_graph_id(str(bus["ref_id"])) not in zasilane
    )
    bez_zasilania = set(szyny_bez_zasilania)
    nazwy_szyn = {
        str(bus["ref_id"]): bus.get("name")
        for bus in (snapshot.get("buses") or [])
        if bus.get("ref_id")
    }
    # Szyna bilansująca po ref_id modelu (identyfikator grafu jest UUID-em
    # wyprowadzonym z ref_id — czytelnik widoku pracuje na ref_id).
    wezel_bilansujacy_ref = next(
        (
            ref
            for ref in sorted(nazwy_szyn)
            if wezel_bilansujacy is not None and ref_to_graph_id(ref) == wezel_bilansujacy
        ),
        None,
    )
    odbiory = sorted(
        (
            {
                "load_ref": str(odbior["ref_id"]),
                "load_name": odbior.get("name"),
                "bus_ref": str(odbior.get("bus_ref")),
                "bus_name": nazwy_szyn.get(str(odbior.get("bus_ref"))),
                "p_mw": _round6(odbior.get("p_mw")),
                "q_mvar": _round6(odbior.get("q_mvar")),
            }
            for odbior in (snapshot.get("loads") or [])
            if str(odbior.get("bus_ref")) in bez_zasilania
        ),
        key=lambda pozycja: pozycja["load_ref"],
    )
    return {
        "wezel_bilansujacy_id": wezel_bilansujacy,
        "wezel_bilansujacy_ref": wezel_bilansujacy_ref,
        "szyny_bez_zasilania": szyny_bez_zasilania,
        "odbiory_bez_zasilania": odbiory,
        "moc_odciazona_mw": _round6(sum(float(pozycja["p_mw"] or 0.0) for pozycja in odbiory)),
        "szyny_zasilane": len(zasilane),
    }


def _indeks_ref(snapshot: dict[str, Any]) -> dict[str, str]:
    """Odwzorowanie identyfikatora grafu na ``ref_id`` modelu.

    Pozycje walidacji energetycznej wskazują elementy identyfikatorem GRAFU
    (UUID wyprowadzony z ``ref_id``). Konsument macierzy N-1 pracuje na ``ref_id``
    — bez tego ogniwa naruszenie nie dałoby się związać z elementem modelu (a to
    jest cel widoku: pokazać, KTÓRY element projektu jest przeciążony).
    """
    indeks: dict[str, str] = {}
    for klucz in ("buses", "branches", "transformers"):
        for pozycja in snapshot.get(klucz) or []:
            ref = pozycja.get("ref_id")
            if ref:
                indeks[ref_to_graph_id(str(ref))] = str(ref)
    return indeks


def _pozycja_naruszenia(item: dict[str, Any], indeks: dict[str, str]) -> dict[str, Any]:
    """Pozycja naruszenia z pozycji walidacji energetycznej (D2) — 1:1 z buildera.

    ``slad_kryterium`` to ślad WHITE BOX policzony przez builder D2 (wzór →
    podstawienie → wynik → próg). Przepisujemy go bez zmian: wartości pośrednie
    kryterium mają pochodzić z jednego miejsca, w którym powstały.
    """
    return {
        "check_type": item["check_type"],
        "element_ref": indeks.get(str(item["target_id"])),
        "element_id": item["target_id"],
        "element_name": item["target_name"],
        "wartosc": _round4(item["observed_value"]),
        "granica_pct": _round4(item["limit_fail"]),
        "jednostka": item["unit"],
        "powod_pl": item["why_pl"],
        "slad_kryterium": item["white_box"],
    }


def _pozycja_pominieta(item: dict[str, Any], indeks: dict[str, str]) -> dict[str, Any]:
    return {
        "check_type": item["check_type"],
        "element_ref": indeks.get(str(item["target_id"])),
        "element_id": item["target_id"],
        "element_name": item["target_name"],
        "powod_pl": item["why_pl"],
    }


def _klucz_pozycji(pozycja: dict[str, Any]) -> tuple[str, str]:
    return (str(pozycja["check_type"]), str(pozycja["element_id"]))


def _skutki_z_walidacji(widok: dict[str, Any], indeks: dict[str, str]) -> dict[str, Any]:
    """Rozdziel pozycje walidacji energetycznej na skutki kontyngencji.

    Predykaty są PARAMI z jednego źródła: pozycja o statusie ``FAIL`` jest
    naruszeniem, pozycja ``NOT_COMPUTED`` jest kryterium pominiętym, a każda z
    nich należy do dokładnie jednej z trzech list (przeciążenia, napięcia,
    pominięte) wyłącznie na podstawie ``check_type`` z ``_TYPY_KRYTERIOW``.
    """
    przeciazenia: list[dict[str, Any]] = []
    naruszenia_napiecia: list[dict[str, Any]] = []
    kryteria_pominiete: list[dict[str, Any]] = []
    for item in widok["items"]:
        check_type = item["check_type"]
        if check_type not in _TYPY_KRYTERIOW:
            continue
        if item["status"] == "FAIL":
            if check_type in _TYPY_PRZECIAZENIA:
                przeciazenia.append(_pozycja_naruszenia(item, indeks))
            else:
                naruszenia_napiecia.append(_pozycja_naruszenia(item, indeks))
        elif item["status"] == "NOT_COMPUTED":
            kryteria_pominiete.append(_pozycja_pominieta(item, indeks))
    return {
        "przeciazenia": sorted(przeciazenia, key=_klucz_pozycji),
        "naruszenia_napiecia": sorted(naruszenia_napiecia, key=_klucz_pozycji),
        "kryteria_pominiete": sorted(kryteria_pominiete, key=_klucz_pozycji),
    }


def _dane_biegu(bieg: CanonicalRun) -> dict[str, Any]:
    """Metryki biegu wariantu odczytane z wyniku (READ-ONLY, kontrakt FROZEN)."""
    raw = bieg.raw_result or {}
    result_v1 = raw.get("result_v1") or {}
    return {
        "zbieznosc": bool(result_v1.get("converged", False)),
        "iteracje": result_v1.get("iterations_count"),
        "tolerancja": result_v1.get("tolerance_used"),
        "metoda": raw.get("solver_method"),
        "wezly_bez_rozwiazania": len(result_v1.get("unsolved_node_ids") or []),
    }


def _pusty_bieg() -> dict[str, Any]:
    return {
        "zbieznosc": False,
        "iteracje": None,
        "tolerancja": None,
        "metoda": None,
        "wezly_bez_rozwiazania": None,
    }


def _dotkliwosc(
    *,
    zasilanie: dict[str, Any] | None,
    skutki: dict[str, Any] | None,
) -> dict[str, Any]:
    """Dotkliwość = LICZNIKI per kategoria. Brak rozstrzygnięcia = ``None``.

    ``None`` NIE jest zerem: kontyngencja bez zbieżnego biegu nie ma policzonych
    przeciążeń ani odchyleń napięć, więc udawanie, że ich „nie ma", byłoby
    fałszywym uspokojeniem.
    """
    return {
        "odbiory_bez_zasilania": (
            len(zasilanie["odbiory_bez_zasilania"]) if zasilanie is not None else None
        ),
        "moc_odciazona_mw": (zasilanie["moc_odciazona_mw"] if zasilanie is not None else None),
        "przeciazenia": (len(skutki["przeciazenia"]) if skutki is not None else None),
        "naruszenia_napiecia": (len(skutki["naruszenia_napiecia"]) if skutki is not None else None),
        "kryteria_pominiete": (len(skutki["kryteria_pominiete"]) if skutki is not None else None),
    }


def _klucz_rankingu(pozycja: dict[str, Any]) -> tuple[int, int, int, str]:
    """Klucz porządku rankingu — JAWNY, bez wag i bez liczby złożonej.

    Sortowanie leksykograficzne krotki liczników (malejąco) w kolejności
    kategorii zadeklarowanej w kontrakcie: odbiory bez zasilania → przeciążenia →
    naruszenia napięciowe, a przy pełnym remisie rosnąco po ``element_ref``.
    Żadna kategoria nie jest przeliczana na inną, więc ranking nie zależy od
    dobranego współczynnika — tylko od tego, co faktycznie policzył solver.
    """
    dotkliwosc = pozycja["dotkliwosc"]
    return (
        -int(dotkliwosc["odbiory_bez_zasilania"]),
        -int(dotkliwosc["przeciazenia"]),
        -int(dotkliwosc["naruszenia_napiecia"]),
        pozycja["element_ref"],
    )


def _kontyngencja(bazowy: CanonicalRun, element: _Element) -> dict[str, Any]:
    """Jedna kontyngencja: wariant bez elementu → bieg → skutki."""
    wspolne: dict[str, Any] = {
        "element_ref": element.ref,
        "element_name": element.name,
        "element_kind": element.kind,
    }
    if element.wylaczony_w_bazie:
        return {
            **wspolne,
            "status": "wykluczony",
            "powod_pl": POWOD_WYKLUCZENIA_PL,
            "przeciazenia": [],
            "naruszenia_napiecia": [],
            "kryteria_pominiete": [],
            "odbiory_bez_zasilania": [],
            "szyny_bez_zasilania": [],
            "dotkliwosc": _dotkliwosc(zasilanie=None, skutki=None),
            "slad": {
                "element_wylaczony": {
                    "element_ref": element.ref,
                    "element_kind": element.kind,
                    "kolekcja": element.kolekcja,
                },
                "wariant_wejscia": None,
                "bieg": _pusty_bieg(),
                "wyspa_zasilana": None,
            },
        }

    snapshot_bazowy = bazowy.snapshot or {}
    wariant = _wariant_bez_elementu(snapshot_bazowy, element)
    zasilanie = _zasilanie(wariant)
    bieg = _bieg_wariantu(bazowy, wariant)
    blad: str | None = None
    try:
        _execute_power_flow(bieg)
    except Exception as exc:  # noqa: BLE001 — niezbieżność/osobliwość = STATUS, nie wyjątek
        blad = f"{type(exc).__name__}: {exc}"

    dane_biegu = _pusty_bieg() if blad is not None else _dane_biegu(bieg)
    zbiegl = bool(dane_biegu["zbieznosc"])
    skutki = (
        _skutki_z_walidacji(build_energy_validation_view(bieg), _indeks_ref(wariant))
        if zbiegl
        else None
    )

    if zbiegl:
        powod = "Bieg rozpływu zbieżny — skutki policzone."
    elif blad is not None:
        powod = f"Bieg rozpływu przerwany błędem solvera: {blad}"
    else:
        powod = (
            "Bieg rozpływu nie osiągnął zbieżności — przeciążeń i odchyleń "
            "napięć nie policzono (odbiory bez zasilania wynikają z topologii "
            "wariantu i są rozstrzygnięte)."
        )

    return {
        **wspolne,
        "status": "zbiegl" if zbiegl else "niezbiegl",
        "powod_pl": powod,
        "przeciazenia": skutki["przeciazenia"] if skutki is not None else [],
        "naruszenia_napiecia": skutki["naruszenia_napiecia"] if skutki is not None else [],
        "kryteria_pominiete": skutki["kryteria_pominiete"] if skutki is not None else [],
        "odbiory_bez_zasilania": zasilanie["odbiory_bez_zasilania"],
        "szyny_bez_zasilania": zasilanie["szyny_bez_zasilania"],
        "dotkliwosc": _dotkliwosc(zasilanie=zasilanie, skutki=skutki),
        "slad": {
            "element_wylaczony": {
                "element_ref": element.ref,
                "element_kind": element.kind,
                "kolekcja": element.kolekcja,
            },
            "wariant_wejscia": {
                "mechanizm_pl": (
                    f"Element usunięty z listy {element.kolekcja} kopii migawki "
                    "(wariant wejścia solvera); model bazowy nietknięty."
                ),
                "galezie_baza": len(snapshot_bazowy.get("branches") or []),
                "galezie_wariant": len(wariant.get("branches") or []),
                "transformatory_baza": len(snapshot_bazowy.get("transformers") or []),
                "transformatory_wariant": len(wariant.get("transformers") or []),
            },
            "bieg": dane_biegu,
            "wyspa_zasilana": {
                "wezel_bilansujacy_id": zasilanie["wezel_bilansujacy_id"],
                "wezel_bilansujacy_ref": zasilanie["wezel_bilansujacy_ref"],
                "szyny_zasilane": zasilanie["szyny_zasilane"],
                "szyny_bez_zasilania": len(zasilanie["szyny_bez_zasilania"]),
            },
        },
    }


def _przypadek_bazowy(bazowy: CanonicalRun) -> dict[str, Any]:
    """Stan N-0 (bez wyłączeń) — punkt odniesienia dla czytelnika macierzy.

    Liczony TĄ SAMĄ ścieżką co kontyngencje (bieg wariantu na pełnej migawce),
    żeby porównanie „przed / po" nie zestawiało dwóch różnych sposobów liczenia.
    """
    bieg = _bieg_wariantu(bazowy, copy.deepcopy(bazowy.snapshot or {}))
    blad: str | None = None
    try:
        _execute_power_flow(bieg)
    except Exception as exc:  # noqa: BLE001 — jak wyżej: stan bazowy to WYNIK, nie wyjątek
        blad = f"{type(exc).__name__}: {exc}"
    dane_biegu = _pusty_bieg() if blad is not None else _dane_biegu(bieg)
    zbiegl = bool(dane_biegu["zbieznosc"])
    skutki = (
        _skutki_z_walidacji(build_energy_validation_view(bieg), _indeks_ref(bazowy.snapshot or {}))
        if zbiegl
        else None
    )
    zasilanie = _zasilanie(bazowy.snapshot or {})
    return {
        "status": "zbiegl" if zbiegl else "niezbiegl",
        "powod_pl": (
            "Bieg rozpływu zbieżny — stan bazowy policzony."
            if zbiegl
            else (
                f"Bieg rozpływu stanu bazowego przerwany błędem solvera: {blad}"
                if blad is not None
                else "Bieg rozpływu stanu bazowego nie osiągnął zbieżności."
            )
        ),
        "przeciazenia": skutki["przeciazenia"] if skutki is not None else [],
        "naruszenia_napiecia": skutki["naruszenia_napiecia"] if skutki is not None else [],
        "kryteria_pominiete": skutki["kryteria_pominiete"] if skutki is not None else [],
        "odbiory_bez_zasilania": zasilanie["odbiory_bez_zasilania"],
        "szyny_bez_zasilania": zasilanie["szyny_bez_zasilania"],
        "dotkliwosc": _dotkliwosc(zasilanie=zasilanie, skutki=skutki),
        "bieg": dane_biegu,
    }


def _kryteria(config: EnergyValidationConfig) -> dict[str, Any]:
    """Źródła kryteriów oceny — jawnie, językiem inżynierskim.

    Treść tych pól trafia do inżyniera (widok, raport), więc pochodzenie opisujemy
    SEMANTYCZNIE — miejsca w kodzie są udokumentowane w nagłówku modułu, a nie w
    tekście widocznym na ekranie.
    """
    return {
        "obciazenie": {
            "granica_warn_pct": config.loading_warn_pct,
            "granica_fail_pct": config.loading_fail_pct,
            "zrodlo_progu_pl": (
                f"Progi walidacji energetycznej sieci: ostrzeżenie przy "
                f"{config.loading_warn_pct:.0f} % obciążenia, przekroczenie przy "
                f"{config.loading_fail_pct:.0f} %."
            ),
            "zrodlo_obciazalnosci_pl": (
                "Gałąź: obciążalność długotrwała (prąd znamionowy odcinka) z danych "
                "elementu w modelu sieci. Transformator: moc znamionowa jednostki. "
                "Brak wartości = kryterium pominięte jawnie (pozycja na liście "
                "kryteria_pominiete), nigdy wartość zastępcza."
            ),
        },
        "napiecie": {
            "granica_warn_pct": config.voltage_warn_pct,
            "granica_fail_pct": config.voltage_fail_pct,
            "zrodlo_progu_pl": (
                f"Pasmo odchylenia napięcia walidacji energetycznej: ostrzeżenie "
                f"±{config.voltage_warn_pct:.0f} %, przekroczenie "
                f"±{config.voltage_fail_pct:.0f} % napięcia znamionowego szyny."
            ),
            "zrodlo_napiecia_pl": (
                "Napięcie szyny z wyniku rozpływu wariantu; napięcie znamionowe z "
                "danych szyny w modelu sieci."
            ),
        },
        "zasilanie": {
            "zrodlo_pl": (
                "Wyspa węzła bilansującego wyznaczona tą samą regułą, którą stosuje "
                "solver rozpływu przy wyborze węzłów do rozwiązania: odbiór na szynie "
                "poza wyspą jest pozbawiony zasilania."
            ),
        },
        # Zakres kryteriów jest ZAMKNIĘTY i jawny — czytelnik ma wiedzieć nie tylko,
        # co oceniono, ale też czego świadomie nie oceniano (pozycja pinowana testem
        # kontraktu; deklaracja bez testu byłaby fałszywą pewnością).
        "ocenione_kategorie": sorted(_TYPY_KRYTERIOW),
        "poza_zakresem_pl": (
            "Budżet strat sieciowych i bilans mocy biernej węzła bilansującego są "
            "kontrolami CAŁEJ SIECI (jedna pozycja na model), a nie kryteriami "
            "elementu — nie wchodzą do skutków kontyngencji ani do dotkliwości. "
            "Aparaty łączeniowe i źródła nie są kontyngencjami tej analizy."
        ),
        "ranking": {
            "definicja_pl": (
                "Dotkliwość = krotka liczników (odbiory bez zasilania, przeciążenia, "
                "naruszenia napięciowe). Ranking sortuje tę krotkę malejąco w podanej "
                "kolejności kategorii, przy remisie rosnąco po element_ref. Bez wag, "
                "bez liczby złożonej."
            ),
            "kolejnosc_kategorii": [
                "odbiory_bez_zasilania",
                "przeciazenia",
                "naruszenia_napiecia",
            ],
        },
    }


def _wymagaj_inwentarza(run: CanonicalRun) -> list[_Element]:
    """Warunek wejścia WSPÓLNY dla enumeracji i dla zapowiedzi zakresu.

    Zapowiedź zakresu (``build_kontyngencje_n1_zakres_view``) i sama enumeracja
    (``build_kontyngencje_n1_view``) muszą przyjmować DOKŁADNIE te same przebiegi:
    ekran, który zapowiada listę kontyngencji, a po naciśnięciu „policz" dostaje
    odmowę (albo odwrotnie), kłamałby o wykonalności biegu. Dlatego oba wejścia
    czytają JEDEN warunek, a nie dwa „dziś zgodne" (przypięte testem parzystości).
    """
    if run.analysis_type != "PF":
        raise ValueError(
            "Enumeracja N-1 wymaga przebiegu rozpływu mocy; "
            f"otrzymano rodzaj analizy: {run.analysis_type}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg {run.id} nie jest zakończony (status={run.status}); "
            "wynik rozpływu mocy nie jest dostępny."
        )
    wszystkie = _inwentarz_elementow(run.snapshot or {})
    if not wszystkie:
        raise ValueError(
            "Model nie zawiera żadnego kwalifikowanego elementu N-1 "
            "(linia napowietrzna, kabel, transformator)."
        )
    return wszystkie


def build_kontyngencje_n1_zakres_view(run: CanonicalRun) -> dict[str, Any]:
    """Zakres enumeracji N-1: CO da się policzyć i ILE to kosztuje — BEZ liczenia.

    Zapowiedź przed biegiem (decyzja D8, domknięcie długu wydajności nazwanego
    kartą N-1-BACKEND: 2,64 s na kontyngencję). Konsument (ekran „Kontyngencje
    N-1") dostaje stąd DWIE rzeczy, których inaczej nie mógłby mieć uczciwie:

    1. LISTĘ kwalifikowanych elementów do wyboru zakresu — wprost z modelu, tą
       SAMĄ funkcją (``_inwentarz_elementow``), którą enumeracja wybiera elementy
       do policzenia. Gdyby listę składał klient, filtrując migawkę po rodzaju
       elementu, reguła kwalifikacji (``KWALIFIKOWANE_TYPY_GALEZI``) istniałaby w
       dwóch miejscach — a zawężenie zakresu jest wtedy zgadywaniem, nie wyborem
       z modelu;
    2. KOSZT biegu wyrażony LICZBĄ, nie czasem: ``kontyngencji`` (ile pozycji
       stanie w macierzy) i ``biegow_rozplywu`` (ile razy uruchomi się solver —
       element już wyłączony w bazie jest rozstrzygany bez biegu). Czasu tu NIE MA
       i nie może być: kontrakt nie niesie pomiaru z TEGO modelu, a przeliczanie
       cudzego pomiaru (2,64 s zmierzone na innym substracie) na tę sieć byłoby
       liczbą zmyśloną. Lepiej podać uczciwą liczbę biegów niż zmyślony czas.

    Ta końcówka NIE uruchamia solvera ani walidacji energetycznej — czyta wyłącznie
    migawkę zakończonego przebiegu, więc jest tania niezależnie od wielkości sieci.

    Args:
        run: zakończony przebieg rozpływu (``PF``) — jego migawka jest modelem
            bazowym enumeracji (ten sam warunek wejścia co enumeracja).

    Returns:
        Zakres: lista kwalifikowanych elementów (posortowana po ``element_ref``,
        z jawnym oznaczeniem tych wykluczonych) i podsumowanie kosztu.

    Raises:
        ValueError: gdy przebieg nie jest zakończonym rozpływem albo model nie ma
            ani jednego kwalifikowanego elementu — komunikaty po polsku.
    """
    wszystkie = _wymagaj_inwentarza(run)
    elementy = [
        {
            "element_ref": element.ref,
            "element_name": element.name,
            "element_kind": element.kind,
            "wykluczony": element.wylaczony_w_bazie,
            # Powód pokazujemy WYŁĄCZNIE tam, gdzie jest czego dowodzić — element
            # kwalifikowany nie potrzebuje uzasadnienia, że nie jest wykluczony.
            "powod_pl": POWOD_WYKLUCZENIA_PL if element.wylaczony_w_bazie else None,
        }
        for element in wszystkie
    ]
    biegow = sum(1 for element in wszystkie if not element.wylaczony_w_bazie)
    return {
        "analysis": "kontyngencje_n1_zakres",
        "context": zbuduj_kontekst_widoku(run, ze_znacznikiem_czasu=False),
        "elementy": elementy,
        "podsumowanie": {
            "kontyngencji": len(elementy),
            "biegow_rozplywu": biegow,
            "wykluczonych": len(elementy) - biegow,
        },
    }


def _input_hash(bazowy: CanonicalRun, element_refs: list[str], kryteria: dict[str, Any]) -> str:
    payload = {
        "snapshot_hash": bazowy.snapshot_hash,
        "element_refs": element_refs,
        "kryteria": kryteria,
    }
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def build_kontyngencje_n1_view(
    run: CanonicalRun,
    *,
    element_refs: list[str] | None = None,
) -> dict[str, Any]:
    """Zbuduj macierz skutków kontyngencji N-1 dla przebiegu rozpływu.

    Args:
        run: zakończony przebieg rozpływu (``PF``) — jego migawka jest modelem
            bazowym enumeracji. Gotowość modelu (walidacja, obecność źródła)
            została sprawdzona przy tworzeniu przebiegu
            (``enm.canonical_analysis.create_run``: ``ENMValidator`` + dostępność
            analizy rozpływu), więc nie powtarzamy jej tutaj drugim zestawem reguł.
        element_refs: opcjonalne zawężenie enumeracji do wskazanych elementów.
            ``None`` (parametr POMINIĘTY) = wszystkie kwalifikowane elementy
            modelu — to jedyny sposób zamówienia biegu pełnego. Lista PUSTA jest
            BŁĘDEM, a nie synonimem biegu pełnego: „nie policz nic" i „policz
            wszystko" to przeciwne zamówienia, a milcząca zamiana pierwszego na
            drugie kosztowałaby najdroższy bieg dokładnie tam, gdzie zamawiający
            zakres wyczyścił (rozstrzygnięcie przypięte testem po obu stronach —
            serwis i końcówka).

    Returns:
        Widok macierzy N-1: stan bazowy, lista kontyngencji (po sortowanym
        ``element_ref``), ranking rozstrzygniętych i sekcja nierozstrzygniętych.

    Raises:
        ValueError: gdy przebieg nie jest rozpływem (``PF``) albo nie został
            zakończony, gdy model nie ma ani jednego kwalifikowanego elementu albo
            gdy wskazany ``element_refs`` nie istnieje w modelu — komunikaty po polsku.
    """
    wszystkie = _wymagaj_inwentarza(run)

    if element_refs is None:
        elementy = wszystkie
    else:
        wskazane = sorted(set(element_refs))
        if not wskazane:
            raise ValueError("Lista elementów do enumeracji jest pusta.")
        znane = {element.ref: element for element in wszystkie}
        nieznane = [ref for ref in wskazane if ref not in znane]
        if nieznane:
            raise ValueError(
                "Wskazane elementy nie są kwalifikowanymi elementami N-1 modelu: "
                + ", ".join(nieznane)
                + "."
            )
        elementy = [znane[ref] for ref in wskazane]

    config = EnergyValidationConfig()
    kryteria = _kryteria(config)
    refs = [element.ref for element in elementy]

    kontyngencje = [_kontyngencja(run, element) for element in elementy]
    rozstrzygniete = [pozycja for pozycja in kontyngencje if pozycja["status"] == "zbiegl"]
    ranking = [
        {
            "pozycja": index + 1,
            "element_ref": pozycja["element_ref"],
            "element_name": pozycja["element_name"],
            "element_kind": pozycja["element_kind"],
            "dotkliwosc": pozycja["dotkliwosc"],
        }
        for index, pozycja in enumerate(sorted(rozstrzygniete, key=_klucz_rankingu))
    ]
    nierozstrzygniete = [
        {
            "element_ref": pozycja["element_ref"],
            "element_name": pozycja["element_name"],
            "element_kind": pozycja["element_kind"],
            "status": pozycja["status"],
            "powod_pl": pozycja["powod_pl"],
        }
        for pozycja in kontyngencje
        if pozycja["status"] != "zbiegl"
    ]

    return {
        "analysis": "kontyngencje_n1",
        "context": zbuduj_kontekst_widoku(run, ze_znacznikiem_czasu=False),
        "parameters": {
            "element_refs": refs,
            "kryteria": kryteria,
        },
        "input_hash": _input_hash(run, refs, kryteria),
        "przypadek_bazowy": _przypadek_bazowy(run),
        "kontyngencje": kontyngencje,
        "ranking": ranking,
        "nierozstrzygniete": nierozstrzygniete,
        "podsumowanie": {
            "kontyngencji": len(kontyngencje),
            "rozstrzygnietych": len(rozstrzygniete),
            "nierozstrzygnietych": len(nierozstrzygniete),
            "z_przeciazeniem": sum(1 for pozycja in rozstrzygniete if pozycja["przeciazenia"]),
            "z_naruszeniem_napiecia": sum(
                1 for pozycja in rozstrzygniete if pozycja["naruszenia_napiecia"]
            ),
            "z_odbiorami_bez_zasilania": sum(
                1 for pozycja in kontyngencje if pozycja["odbiory_bez_zasilania"]
            ),
        },
    }
