"""Dane przyjęte GAŁĘZI w wynikach zwarciowych — jedno źródło dla wierszy biegu i werdyktów.

Kontrakt werdyktu §3: wynik liczony z wartością roboczą (zasada nr 4) nie jest pełnym dowodem —
każdy werdykt oparty na prądzie punktu zwarcia niesie daną przyjętą ``ESTIMATED`` gałęzi, której
impedancja wchodzi do tego prądu. Dwie rodziny założeń biegu, jeden mechanizm:

* ``line.geometria_wartosc_robocza`` (``enm.parametry_linii_wn``) — linia 110 kV z R′, X′, B′
  i Z′0 policzonymi z wartością roboczą geometrii; wpływa na KAŻDY rodzaj zwarcia w wyspie
  obliczeniowej węzła (składowa spójna grafu po gałęziach, transformatorach i łącznikach);
* ``branch.z0_wartosc_robocza`` (ten moduł) — linia albo kabel SN z R′0/X′0 z założenia
  katalogu (``wartosci_robocze`` pozycji) albo z wartości roboczej odcinka bez składowej
  zerowej w modelu (``enm.skladowa_zerowa_galezi``, zasada nr 4); wpływa WYŁĄCZNIE na zwarcia doziemne (1F, 2F+G)
  w składowej spójnej SIECI ZEROWEJ węzła (``enm.mapping.skladowe_sieci_zerowej``);
* ``zespol_uziemiajacy.wartosc_robocza`` (ten moduł) — zespół uziemiający sieci SN, którego
  bocznik składowej zerowej Z_0,TU + 3·Z_N stoi na wartości roboczej (pozycja typowa katalogu,
  zakres §16, AWSC; karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 4); wpływa WYŁĄCZNIE na zwarcia
  doziemne w składowej sieci zerowej szyny zespołu — ten sam predykat co gałąź z Z0 roboczym.
* ``shunt.parametry_robocze`` (``enm.bateria_kondensatorow``, karta UX-04/POLE-BKR-MODEL) —
  element poprzeczny, nie gałąź, ale ten sam mechanizm danych przyjętych: bateria kondensatorów
  z układem połączeń (albo liczbą stopni gwiazdy uziemionej) z wartości roboczej; w biegu
  zwarciowym wpływa WYŁĄCZNIE na zwarcia doziemne w składowej sieci zerowej szyny baterii
  (układ rozstrzyga, czy bateria wnosi admitancję zerową), w biegu rozpływu — na cały bieg
  (admitancja baterii z dławikiem albo liczbą stopni z wartości roboczej).

Wiersz biegu zwarciowego niesie ``KLUCZ_WIERSZA_DANE_GALEZI`` addytywnie, WYŁĄCZNIE gdy lista
jest niepusta; konsumenci tłumaczą go przez ``dane_przyjete_galezi_wiersza``.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from network_model.catalog.wartosci_robocze import ZALOZENIA_Z0_ODCINKA, dana_przyjeta_z0
from network_model.core.graph import NetworkGraph
from network_model.core.uziemienie import StanAwsc
from network_model.odmowa_danych import OdmowaDanychError
from werdykt import DanaPrzyjeta

from .bateria_kondensatorow import KOD_BATERIA_PARAMETRY_ROBOCZE
from .mapping import map_enm_to_network_graph, ref_to_graph_id, skladowe_sieci_zerowej
from .models import Cable, EnergyNetworkModel, OverheadLine
from .nazwy_elementow import nazwa_elementu
from .parametry_linii_wn import KOD_GEOMETRIA_ROBOCZA, zalozenia_linii_wn
from .skladowa_zerowa_galezi import napiecia_szyn_kv, skladowa_zerowa_galezi
from .uziemienie_sekcji import uziemienie_sieci

#: Klucz wiersza wyniku zwarciowego: dane przyjęte gałęzi, których impedancja wchodzi do prądu
#: TEGO punktu. Addytywnie, WYŁĄCZNIE gdy lista niepusta — wiersz bez takich gałęzi bit w bit
#: jak przed kartą LINIA-110.
KLUCZ_WIERSZA_DANE_GALEZI = "dane_przyjete_galezi"

#: Kod założenia biegu i rejestru gotowości: składowa zerowa gałęzi z wartości roboczej katalogu.
KOD_Z0_ROBOCZE = "branch.z0_wartosc_robocza"

#: Kod założenia biegu i rejestru gotowości: bocznik składowej zerowej zespołu uziemiającego
#: z wartości roboczej parametrów urządzeń punktu neutralnego (zasada nr 4).
KOD_ZU_ROBOCZE = "zespol_uziemiajacy.wartosc_robocza"

#: Klucz założenia Z0: składniki danej przyjętej (pole, etykieta, założenie, wartość, gałąź) —
#: wiersz składa z nich jedną daną na (pole, założenie, wartość), nie jedną na gałąź.
_KLUCZ_SKLADNIKOW_Z0 = "skladniki_z0"


def galezie_z0_robocze(
    enm: EnergyNetworkModel,
) -> list[tuple[Cable | OverheadLine, tuple[tuple[str, str, str, float], ...]]]:
    """Załączone linie i kable, których R′0/X′0 są wartością roboczą (kolejność ref_id).

    JEDNO źródło zbioru dla założeń biegów (zwarcie doziemne, rozpływ niesymetryczny) i dla
    wierszy wyniku. Predykat pola: ``enm.skladowa_zerowa_galezi`` — ten sam, z którego sieć
    zerowa zwarć i rozpływ niesymetryczny biorą R′0/X′0: wartość robocza katalogu (pozycja
    oznaczyła pole w ``wartosci_robocze``, projektant go nie zmienił) albo wartość robocza
    odcinka bez składowej zerowej w modelu (zasada nr 4). Gałąź otwarta nie wchodzi do sieci
    zerowej (``_assemble_zero_sequence_y0``), więc nie daje założenia.
    """
    wynik: list[tuple[Cable | OverheadLine, tuple[tuple[str, str, str, float], ...]]] = []
    napiecia = napiecia_szyn_kv(enm)
    for galaz in sorted(enm.branches, key=lambda g: g.ref_id):
        if not isinstance(galaz, Cable | OverheadLine) or galaz.status != "closed":
            continue
        pola = skladowa_zerowa_galezi(galaz, napiecia.get(galaz.from_bus_ref)).robocze
        if pola:
            wynik.append((galaz, pola))
    return wynik


def zalozenia_z0_galezi(
    enm: EnergyNetworkModel, scenario: str | None, *, galezie: Iterable[str] | None = None
) -> tuple[dict[str, Any], ...]:
    """Założenia biegu: jedno na KAŻDĄ załączoną gałąź z R′0/X′0 z wartości roboczej.

    ``galezie`` zawęża zbiór (rozpływ niesymetryczny: wyłącznie gałęzie z realnym prądem I0);
    ``None`` = wszystkie (zwarcie doziemne — sieć zerowa całego modelu).
    """
    dozwolone = None if galezie is None else set(galezie)
    zalozenia: list[dict[str, Any]] = []
    for galaz, pola in galezie_z0_robocze(enm):
        if dozwolone is not None and galaz.ref_id not in dozwolone:
            continue
        nazwa = nazwa_elementu(galaz, "branches")
        przyjete = [
            dana_przyjeta_z0(
                etykieta=etykieta, zalozenie=zalozenie, wartosc=wartosc, miejsce_pl=nazwa
            )
            for _, etykieta, zalozenie, wartosc in pola
        ]
        etykiety = " i ".join(etykieta for _, etykieta, _, _ in pola)
        z_odcinka = {zalozenie in ZALOZENIA_Z0_ODCINKA for _, _, zalozenie, _ in pola}
        zrodlo = (
            "katalogu"
            if z_odcinka == {False}
            else (
                "(odcinek bez składowej zerowej w modelu)"
                if z_odcinka == {True}
                else "(katalog i odcinek bez składowej zerowej w modelu)"
            )
        )
        zalozenia.append(
            {
                "code": KOD_Z0_ROBOCZE,
                "element_ref": galaz.ref_id,
                "message_pl": (
                    f"{nazwa}: {etykiety} z wartości roboczej {zrodlo} — "
                    + "; ".join(f"{zalozenie}" for _, _, zalozenie, _ in pola)
                    + f". Zmień wartość: {etykiety} w parametrach odcinka."
                ),
                **({"scenariusz": scenario} if scenario is not None else {}),
                "parametr": pola[0][0],
                "dane_przyjete": [d.model_dump(mode="json") for d in przyjete],
                _KLUCZ_SKLADNIKOW_Z0: [
                    {
                        "pole": pole,
                        "etykieta": etykieta,
                        "zalozenie": zalozenie,
                        "wartosc": wartosc,
                        "nazwa": nazwa,
                    }
                    for pole, etykieta, zalozenie, wartosc in pola
                ],
            }
        )
    return tuple(zalozenia)


def zalozenia_zespolow_uziemiajacych(
    enm: EnergyNetworkModel, scenario: str | None, stan_awsc: StanAwsc
) -> tuple[dict[str, Any], ...]:
    """Założenia biegu zwarcia doziemnego: jedno na KAŻDY zespół uziemiający w ruchu, którego
    bocznik składowej zerowej w stanie AWSC przypadku stoi na wartości roboczej.

    JEDNO źródło: ``uziemienie_sieci`` (ta sama prawda co mapowanie Y0) i
    ``PunktUziemienia.dane_przyjete_bocznika`` (wyłącznie parametry, które kształtują bocznik
    w tym stanie). ``bus_ref`` — szyna zespołu; składowa sieci zerowej szyny wyznacza punkty
    zwarcia, do których prądu wchodzi ten bocznik (``dane_przyjete_galezi_punktow``).
    """
    if not enm.zespoly_uziemiajace:
        return ()
    zalozenia: list[dict[str, Any]] = []
    for sekcja in uziemienie_sieci(enm):
        for punkt in sekcja.punkty_w_ruchu:
            if punkt.rodzaj != "zespol_uziemiajacy":
                continue
            dane = punkt.dane_przyjete_bocznika(stan_awsc)
            if not dane:
                continue
            zalozenia.append(
                {
                    "code": KOD_ZU_ROBOCZE,
                    "element_ref": punkt.element_ref,
                    "bus_ref": punkt.bus_ref,
                    "message_pl": (
                        f"{punkt.nazwa_pl}: bocznik składowej zerowej z wartości roboczej — "
                        + "; ".join(d.nazwa_pl.removesuffix(f" ({punkt.nazwa_pl})") for d in dane)
                        + ". Zmień wartości w parametrach zespołu uziemiającego (dane "
                        "producenta albo nastawa)."
                    ),
                    **({"scenariusz": scenario} if scenario is not None else {}),
                    "dane_przyjete": [d.model_dump(mode="json") for d in dane],
                }
            )
    return tuple(zalozenia)


def _dane_z_zapisu(zapisy: Iterable[Any]) -> tuple[DanaPrzyjeta, ...]:
    return tuple(DanaPrzyjeta.model_validate(d) for d in zapisy if isinstance(d, Mapping))


def _galaz_w_grafie(graph: NetworkGraph, element_ref: object) -> str | None:
    """Węzeł początkowy załączonej gałęzi grafu biegu albo ``None`` (gałęzi nie ma w grafie)."""
    galaz = graph.branches.get(ref_to_graph_id(str(element_ref)))
    if galaz is None or not galaz.in_service:
        return None
    return str(galaz.from_node_id)


def _dane_z0_skladowej(zalozenia_z0: list[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Dane przyjęte Z0 jednej składowej sieci zerowej: jedna na (pole, założenie, wartość)
    z listą gałęzi — rozmiar wiersza rośnie z liczbą TYPÓW katalogu, nie odcinków."""
    grupy: dict[tuple[str, str, str, float], list[str]] = {}
    for zalozenie in zalozenia_z0:
        for skladnik in zalozenie.get(_KLUCZ_SKLADNIKOW_Z0) or ():
            klucz = (
                str(skladnik["pole"]),
                str(skladnik["etykieta"]),
                str(skladnik["zalozenie"]),
                float(skladnik["wartosc"]),
            )
            grupy.setdefault(klucz, []).append(str(skladnik["nazwa"]))
    return [
        dana_przyjeta_z0(
            etykieta=etykieta,
            zalozenie=zalozenie,
            wartosc=wartosc,
            miejsce_pl=", ".join(sorted(nazwy)),
        ).model_dump(mode="json")
        for (_, etykieta, zalozenie, wartosc), nazwy in sorted(grupy.items())
    ]


def dane_przyjete_galezi_punktow(
    zalozenia: Iterable[Mapping[str, Any]],
    graph: NetworkGraph,
    wezly: Iterable[str],
    *,
    skladowe_zerowe: Mapping[str, int] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Wiersze biegu zwarciowego: dane przyjęte gałęzi, których impedancja wchodzi do prądu
    KAŻDEGO węzła zwarcia.

    JEDNO źródło zbioru gałęzi — założenia biegu (predykat wejścia i wyjścia z tych samych
    rekordów). Linia 110 kV z geometrii roboczej: gałąź załączona w grafie biegu w tej samej
    wyspie co węzeł. Gałąź z Z0 roboczym: ta sama składowa sieci zerowej
    (``skladowe_zerowe`` z Y0 biegu); założenia Z0 bez składowych to błąd programu wołającego.
    Węzeł bez takiej gałęzi nie ma wpisu.
    """
    zapisy = [z for z in zalozenia if isinstance(z, Mapping)]
    linie = [z for z in zapisy if z.get("code") == KOD_GEOMETRIA_ROBOCZA]
    z0 = [z for z in zapisy if z.get("code") == KOD_Z0_ROBOCZE]
    zespoly = [z for z in zapisy if z.get("code") == KOD_ZU_ROBOCZE]
    baterie = [z for z in zapisy if z.get("code") == KOD_BATERIA_PARAMETRY_ROBOCZE]
    if not linie and not z0 and not zespoly and not baterie:
        return {}
    if (z0 or zespoly or baterie) and skladowe_zerowe is None:
        raise AssertionError(
            "Założenia składowej zerowej bez składowych sieci zerowej biegu — wołający podaje "
            "`skladowe_sieci_zerowej` z tej samej macierzy Y0 co Z0-bus."
        )
    wyspa_wezla: dict[str, int] = {}
    if linie:
        wyspa_wezla = {
            wezel: numer for numer, wyspa in enumerate(graph.find_islands()) for wezel in wyspa
        }
    wyspy_linii: list[tuple[int, Mapping[str, Any]]] = []
    for zalozenie in linie:
        poczatek = _galaz_w_grafie(graph, zalozenie.get("element_ref"))
        if poczatek is not None:
            wyspy_linii.append((wyspa_wezla[poczatek], zalozenie))
    z0_skladowej: dict[int, list[Mapping[str, Any]]] = {}
    for zalozenie in z0:
        poczatek = _galaz_w_grafie(graph, zalozenie.get("element_ref"))
        skladowa = None if poczatek is None else (skladowe_zerowe or {}).get(poczatek)
        if skladowa is not None:
            z0_skladowej.setdefault(skladowa, []).append(zalozenie)
    dane_z0 = {numer: _dane_z0_skladowej(zapisy_z0) for numer, zapisy_z0 in z0_skladowej.items()}
    # Zespół uziemiający: bocznik na szynie zespołu — ta sama składowa sieci zerowej.
    for zalozenie in zespoly:
        skladowa = (skladowe_zerowe or {}).get(ref_to_graph_id(str(zalozenie.get("bus_ref"))))
        if skladowa is not None:
            dane_z0.setdefault(skladowa, []).extend(
                dict(d) for d in zalozenie.get("dane_przyjete") or ()
            )
    # Bateria z układem z wartości roboczej: składowa sieci zerowej SZYNY baterii (zapis
    # założenia niesie ``bus_ref``) — ta sama składowa, do której bateria wniosłaby Y0.
    for zalozenie in baterie:
        skladowa = (skladowe_zerowe or {}).get(ref_to_graph_id(str(zalozenie.get("bus_ref"))))
        if skladowa is not None:
            dane_z0.setdefault(skladowa, [])
            for dana in zalozenie.get("dane_przyjete") or ():
                if dict(dana) not in dane_z0[skladowa]:
                    dane_z0[skladowa].append(dict(dana))
    wynik: dict[str, list[dict[str, Any]]] = {}
    for wezel in wezly:
        dane = [
            dict(d)
            for numer, zalozenie in wyspy_linii
            if numer == wyspa_wezla.get(wezel)
            for d in zalozenie.get("dane_przyjete") or ()
        ]
        skladowa_wezla = (skladowe_zerowe or {}).get(wezel)
        if skladowa_wezla is not None:
            dane.extend(dane_z0.get(skladowa_wezla, ()))
        if dane:
            wynik[wezel] = dane
    return wynik


def dane_przyjete_linii_wezla(enm: EnergyNetworkModel, bus_ref: str) -> tuple[dict[str, Any], ...]:
    """Dane przyjęte (zapis JSON) linii 110 kV z wyspy szyny ``bus_ref`` — obliczenia liczone
    wprost z modelu (pętla zwarcia nN: impedancja sieci zasilającej Z1 w węźle HV transformatora).

    Ten sam zbiór i ten sam predykat wyspy co wiersze biegu zwarciowego. Składowa zerowa sieci
    SN nie wchodzi do pętli nN (transformator Dyn rozdziela sieci zerowe), więc założeń Z0 tu
    nie ma. Model bez linii z wartością roboczą nie buduje grafu (koszt zerowy).
    """
    return dane_przyjete_wezla(enm, bus_ref, ze_skladowa_zerowa=False)


def dane_przyjete_wezla(
    enm: EnergyNetworkModel, bus_ref: str, *, ze_skladowa_zerowa: bool
) -> tuple[dict[str, Any], ...]:
    """Dane przyjęte (zapis JSON) gałęzi, których impedancja z wartości roboczej wchodzi do
    wielkości liczonej WPROST z modelu w węźle ``bus_ref`` (bez biegu kanonicznego).

    ``ze_skladowa_zerowa`` — wielkość zawiera impedancję zerową węzła (np. Z0 równoważnika
    sieci SN): dochodzą R′0/X′0 z wartości roboczej katalogu ze składowej sieci zerowej węzła.
    Ten sam zbiór gałęzi i te same predykaty (wyspa, składowa zerowa) co wiersze biegu
    zwarciowego (``dane_przyjete_galezi_punktow``). Model bez takich gałęzi nie buduje grafu.
    """
    # Zespół uziemiający: Z0 sieci liczone wprost z modelu (``build_zero_sequence_zbus``) stoi
    # na stanie normalnym AWSC (spoczynek) — ten sam stan dla danych przyjętych bocznika.
    zalozenia = zalozenia_linii_wn(enm, None) + (
        zalozenia_z0_galezi(enm, None) + zalozenia_zespolow_uziemiajacych(enm, None, "spoczynek")
        if ze_skladowa_zerowa
        else ()
    )
    if not zalozenia:
        return ()
    try:
        graph = map_enm_to_network_graph(enm)
        skladowe = (
            skladowe_sieci_zerowej(enm, graph)
            if any(z.get("code") in (KOD_Z0_ROBOCZE, KOD_ZU_ROBOCZE) for z in zalozenia)
            else None
        )
    except OdmowaDanychError:
        # Model, którego nie da się odwzorować, nie ma impedancji sieci zasilającej — wołający
        # zgłasza ten brak sam (`compute_upstream_hv_thevenin`); gałęzie nie wchodzą do wyniku.
        return ()
    wezel = ref_to_graph_id(bus_ref)
    return tuple(
        dane_przyjete_galezi_punktow(zalozenia, graph, (wezel,), skladowe_zerowe=skladowe).get(
            wezel, ()
        )
    )


def dane_przyjete_z_zapisu(zapisy: Iterable[Any]) -> tuple[DanaPrzyjeta, ...]:
    """Zapis JSON danych przyjętych (wiersz biegu, wynik pętli) → rekordy kontraktu werdyktu."""
    return _dane_z_zapisu(zapisy)


def dane_przyjete_galezi_wiersza(wiersz: Mapping[str, Any] | None) -> tuple[DanaPrzyjeta, ...]:
    """Dane przyjęte gałęzi wiersza wyniku zwarciowego (``KLUCZ_WIERSZA_DANE_GALEZI``).

    JEDNO tłumaczenie znacznika wiersza dla każdego werdyktu opartego na prądach punktu
    (wytrzymałość aparatury i przewodów, zabezpieczenia, łuk elektryczny, dowód aparatury,
    arkusz obwodów, wniosek OSD, wiarygodność Ik″) — obok danej przyjętej tolerancji nN.
    """
    return _dane_z_zapisu((wiersz or {}).get(KLUCZ_WIERSZA_DANE_GALEZI) or ())


#: Kody założeń biegu, których rekordy niosą dane przyjęte gałęzi (jedno źródło dla widoków
#: liczonych z CAŁEGO biegu — rozpływ, wielkości sieci w węźle przyłączenia).
_KODY_DANYCH_GALEZI = (
    KOD_GEOMETRIA_ROBOCZA,
    KOD_Z0_ROBOCZE,
    KOD_ZU_ROBOCZE,
    KOD_BATERIA_PARAMETRY_ROBOCZE,
)


def dane_przyjete_biegu(raw_result: Mapping[str, Any] | None) -> tuple[DanaPrzyjeta, ...]:
    """Dane przyjęte gałęzi CAŁEGO biegu — z założeń biegu ``raw_result["zalozenia"]`` (te
    same rekordy, które pokazuje ekran wyniku).

    Dla widoków, których liczba zależy od rozwiązania całej sieci (rozpływ: napięcia,
    obciążenia, straty; wielkości węzła przyłączenia), a nie od jednego punktu zwarcia.
    Bieg rozpływu symetrycznego niesie wyłącznie linie 110 kV (Z0 nie wchodzi do równań);
    bieg zwarcia doziemnego — także R′0/X′0 z wartości roboczej katalogu. Pusta krotka = bieg
    bez takich gałęzi (widok bez zmian).
    """
    zalozenia = (raw_result or {}).get("zalozenia") or ()
    wynik: list[DanaPrzyjeta] = []
    for zalozenie in zalozenia:
        if not isinstance(zalozenie, Mapping) or zalozenie.get("code") not in _KODY_DANYCH_GALEZI:
            continue
        for dana in _dane_z_zapisu(zalozenie.get("dane_przyjete") or ()):
            if dana not in wynik:
                wynik.append(dana)
    return tuple(wynik)


def pola_danych_przyjetych_biegu(raw_result: Mapping[str, Any] | None) -> dict[str, Any]:
    """Pola widoku analizy biegu: ``status_danych`` + ``dane_przyjete`` (kształt widoków
    werdyktów, np. wytrzymałości cieplnej), WYŁĄCZNIE gdy bieg niesie dane przyjęte gałęzi —
    widok biegu bez nich bit w bit jak przed kartą LINIA-110."""
    dane = dane_przyjete_biegu(raw_result)
    if not dane:
        return {}
    return {
        "status_danych": "UNVALIDATED_INPUT",
        "dane_przyjete": [dana.model_dump(mode="json") for dana in dane],
    }


def pola_danych_przyjetych_wiersza(wiersz: Mapping[str, Any] | None) -> dict[str, Any]:
    """Pola pozycji widoku liczonej z JEDNEGO wiersza wyniku zwarciowego (siła sieci,
    migotanie w węźle): ``status_danych`` + ``dane_przyjete``, WYŁĄCZNIE gdy wiersz niesie
    dane przyjęte gałęzi — pozycja na danych projektu bez zmian."""
    dane = dane_przyjete_galezi_wiersza(wiersz)
    if not dane:
        return {}
    return {
        "status_danych": "UNVALIDATED_INPUT",
        "dane_przyjete": [dana.model_dump(mode="json") for dana in dane],
    }
