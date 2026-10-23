"""Aparaty katalogowe pól stacji — JEDEN czytelnik modelu (karta KD-6).

Pytanie „jaki aparat stoi w tym polu" jest pytaniem o MODEL, nie o konkretną
analizę. Odpowiadają na nie dwie analizy naraz — werdykt wytrzymałości
(``wytrzymalosc_aparatury_pol``) i czas wyłączenia pola
(``protection/czas_wylaczenia_pola``) — więc czytelnik jest jeden. Druga
implementacja rozjechałaby się przy pierwszej zmianie kreatora stacji.

JEDNA PRAWDA SKŁADU POLA (karta GPZ-H5-APARATURA). Aparaty pola czyta się wyłącznie przez
``enm.sklad_pola.aparaty_pola`` — rekord ``Bay.primary_devices`` (gniazda standardu) złączony
z elementami modelu pola (gałąź łącznikowa z ``equipment_refs``, przekładnik ``Measurement``
z ``bay_ref``), a katalog aparatu przez ``katalog_aparatu`` (katalog elementu wygrywa). Ten sam
odczyt zasila read-model pola (skład z gniazdami), więc pole standardu GPZ, pole funkcyjne SN
i pole SN z kreatora mają jeden zbiór aparatów w każdej analizie. Dawniej czytelnik szukał
gałęzi po ``meta.bay_ref``/``meta.field_ref`` — drugi zbiór, który dla aparatu z gniazda bez
gałęzi i dla przekładnika był pusty. Łącznik pola strony 110 kV (granica zasilania sieci SN)
nie ma katalogu, więc nie jest aparatem katalogowym żadnej przestrzeni.

Przestrzenie katalogu: ``APARAT_SN`` (łącznik — wyłącznik, rozłącznik, odłącznik, uziemnik,
odłącznik trójpołożeniowy, bezpiecznik) i ``CT`` (przekładnik prądowy w torze prądu zwarcia).
Analiza czasu wyłączenia czyta tylko łączniki (zabezpieczenie otwiera łącznik), wytrzymałość
— łączniki i przekładniki prądowe; zbiór przestrzeni podaje wołający, odczyt jest jeden.

WARTOŚCI ROBOCZE (zasada nr 4, kontrakt werdyktu §3c, V12K-351). Parametr aparatu, którego
karta nie niesie (czas własny wyłącznika, znamiona wytrzymałości), nie blokuje analizy: JEDNO
rozstrzygnięcie ``parametry_aparatu`` zwraca dla każdego parametru wartość i pochodzenie
(projektant na elemencie modelu > karta katalogowa > propozycja rejestru
``network_model/catalog/wartosci_robocze.py``). Obie analizy — wytrzymałość i czas wyłączenia —
czytają WYŁĄCZNIE to rozstrzygnięcie; ``dana_przyjeta`` jest jedynym tłumaczeniem wartości
roboczej na daną przyjętą werdyktu (jakość ``ESTIMATED``, nigdy ``DATASHEET``).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from enm.models import BayPrimaryDevice, EnergyNetworkModel, ParameterOverride, Substation
from enm.pola import pola_stacji
from enm.sklad_pola import (
    IndeksModeluPola,
    aparaty_pola,
    indeks_modelu_pola,
    katalog_aparatu,
    nazwa_aparatu_pola,
)
from network_model.catalog import get_default_mv_catalog
from network_model.catalog.gniazda_pol_enea import szablon_pola_standardu
from network_model.catalog.types import CTType, MVApparatusType
from network_model.catalog.wartosci_robocze import (
    PARAMETRY_APARATU_SN,
    WartoscProjektanta,
    WartoscRozstrzygnieta,
    rozstrzygnij_parametry_aparatu_sn,
)
from werdykt import DanaPrzyjeta, FieldQuality, Wielkosc

#: Kategoria katalogu wiązana z aparatem łączeniowym pola (B-12).
NAMESPACE_APARAT_SN = "APARAT_SN"
#: Kategoria katalogu przekładnika prądowego pola.
NAMESPACE_CT = "CT"
#: Przestrzenie łączników — zbiór analizy czasu wyłączenia (zabezpieczenie otwiera łącznik).
PRZESTRZENIE_LACZNIKOW: tuple[str, ...] = (NAMESPACE_APARAT_SN,)
#: Przestrzenie aparatów w torze prądu zwarcia pola — zbiór analizy wytrzymałości.
PRZESTRZENIE_WYTRZYMALOSCI: tuple[str, ...] = (NAMESPACE_APARAT_SN, NAMESPACE_CT)
#: Odmiana przekładnika, który nie przewodzi prądu zwarcia jako uzwojenie pierwotne:
#: przekładnik Ferrantiego (ziemnozwarciowy) obejmuje kabel trzech faz — w zwarciu
#: trójfazowym suma prądów w jego oknie jest zerowa, a uzwojeniem pierwotnym jest kabel.
ODMIANY_CT_POZA_TOREM_ZWARCIA: frozenset[str] = frozenset({"FERRANTI"})


@dataclass(frozen=True)
class AparatPola:
    """Aparat jednego pola: gałąź modelu + pozycja katalogu, z której powstał."""

    #: Element modelu aparatu (gałąź łącznikowa, przekładnik) albo — dla aparatu gniazda
    #: bez elementu — ``device_ref`` aparatu rekordu pola.
    aparat_ref: str
    aparat_nazwa: str
    catalog_ref: str
    #: Wartości nadane przez projektanta na tej gałęzi (``overrides`` z kluczami parametrów
    #: rejestru wartości roboczych), w kolejności ``PARAMETRY_APARATU_SN``.
    wartosci_projektanta: tuple[WartoscProjektanta, ...] = ()
    #: Przestrzeń katalogu pozycji (``APARAT_SN`` albo ``CT``).
    przestrzen: str = NAMESPACE_APARAT_SN
    #: Gniazdo standardu, w którym aparat stoi (``None`` — aparat spoza gniazd).
    gniazdo_ref: str | None = None
    #: Aparat punktu neutralnego transformatora (rola uziemienia ``neutral_point`` albo
    #: gniazdo izolacji ``PUNKT_NEUTRALNY``) — przewodzi prąd ziemnozwarciowy, nie prąd
    #: zwarcia trójfazowego szyny pola.
    punkt_neutralny: bool = False
    #: Aparat jest gałęzią łącznikową modelu — wartości projektanta nadaje się na niej operacją
    #: ``update_element_parameters`` (przekładnik i aparat gniazda bez gałęzi ich nie niosą).
    galaz_modelu: bool = False


def wartosci_projektanta(overrides: list[ParameterOverride]) -> tuple[WartoscProjektanta, ...]:
    """Wartości projektanta aparatu SN z ``overrides`` gałęzi (tylko parametry rejestru).

    Klucze spoza rejestru nie są parametrami aparatu — operacja domenowa ich nie przyjmuje.
    Wartość nieliczbowa (dokument sprzed bramy) nie jest wartością projektanta.
    """
    po_kluczu: dict[str, WartoscProjektanta] = {}
    for wpis in overrides:
        if wpis.key not in PARAMETRY_APARATU_SN or isinstance(wpis.value, str):
            continue
        po_kluczu[wpis.key] = WartoscProjektanta(
            parametr=wpis.key, wartosc=float(wpis.value), powod_pl=wpis.reason or None
        )
    return tuple(po_kluczu[k] for k in PARAMETRY_APARATU_SN if k in po_kluczu)


@dataclass(frozen=True)
class _KartaPrzekladnikaPradowego:
    """Przekładnik prądowy w postaci karty rejestru wartości roboczych (``KartaAparatuSN``).

    Znamiona wytrzymałości przekładnika (IEC 61869-2): prąd cieplny krótkotrwały ``ith_ka_1s``
    odniesiony do 1 s i prąd dynamiczny ``idyn_ka_peak``. Przekładnik nie wyłącza zwarcia —
    zdolność wyłączania i czas własny nie przysługują mu z definicji (rodzaj spoza
    wyłączników, więc rejestr nie proponuje ani czasu własnego, ani prądu z I_cu).
    """

    device_kind: str
    manufacturer: str | None
    i_th_ka: float | None
    i_th_duration_s: float | None
    i_dyn_ka: float | None
    breaking_capacity_ka: float | None = None
    break_time_s: float | None = None


#: Rodzaj karty przekładnika prądowego w rejestrze wartości roboczych.
RODZAJ_KARTY_PRZEKLADNIKA = "PRZEKLADNIK_PRADOWY"
#: Czas odniesienia prądu cieplnego krótkotrwałego przekładnika (pole ``ith_ka_1s``).
CZAS_ODNIESIENIA_ITH_PRZEKLADNIKA_S = 1.0


def karta_przekladnika(pozycja: CTType) -> _KartaPrzekladnikaPradowego:
    """Karta przekładnika prądowego dla rozstrzygnięcia znamion (``ith_ka_1s`` przez 1 s)."""
    return _KartaPrzekladnikaPradowego(
        device_kind=RODZAJ_KARTY_PRZEKLADNIKA,
        manufacturer=pozycja.manufacturer,
        i_th_ka=pozycja.ith_ka_1s,
        i_th_duration_s=(
            CZAS_ODNIESIENIA_ITH_PRZEKLADNIKA_S if pozycja.ith_ka_1s is not None else None
        ),
        i_dyn_ka=pozycja.idyn_ka_peak,
    )


def parametry_aparatu(
    aparat: AparatPola,
) -> tuple[MVApparatusType | CTType | None, dict[str, WartoscRozstrzygnieta]]:
    """JEDNO rozstrzygnięcie parametrów aparatu: pozycja katalogu + wartość i pochodzenie.

    Łącznik — pozycja ``APARAT_SN``; przekładnik prądowy — pozycja ``CT`` w postaci karty
    (``karta_przekladnika``). ``(None, {})`` — pozycji nie ma w katalogu (aparat spoza
    katalogu: brak MODELU, nie brak parametru urządzenia).
    """
    katalog = get_default_mv_catalog()
    projektant = {w.parametr: w for w in aparat.wartosci_projektanta}
    if aparat.przestrzen == NAMESPACE_CT:
        przekladnik = katalog.get_ct_type(aparat.catalog_ref)
        if przekladnik is None:
            return None, {}
        return przekladnik, rozstrzygnij_parametry_aparatu_sn(
            karta_przekladnika(przekladnik), projektant
        )
    pozycja = katalog.get_mv_apparatus_type(aparat.catalog_ref)
    if pozycja is None:
        return None, {}
    return pozycja, rozstrzygnij_parametry_aparatu_sn(pozycja, projektant)


def dana_przyjeta(zapis: Mapping[str, Any], *, aparat_pl: str) -> DanaPrzyjeta:
    """Wartość robocza jako dana przyjęta werdyktu (§3c pkt 4): ``ESTIMATED`` + źródło i wpływ.

    Wejście to zapis ``WartoscRozstrzygnieta.to_dict()`` — ta sama postać, którą niesie
    odpowiedź (rozbicie czasu wyłączenia, znamiona), więc tłumaczenie jest jedno dla obu analiz.
    Dana karty katalogowej nie jest daną przyjętą — wywołanie dla niej jest błędem PROGRAMU
    (wołającego), nie odmową dziedziny, stąd ``AssertionError``.
    """
    wartosc = zapis.get("wartosc")
    if not zapis.get("wartosc_robocza") or not isinstance(wartosc, int | float):
        raise AssertionError(
            f"Parametr {zapis.get('parametr')} nie jest wartością roboczą — dana karty "
            "katalogowej nie jest daną przyjętą."
        )
    return DanaPrzyjeta(
        nazwa_pl=f"{zapis['nazwa_pl']} ({aparat_pl})",
        wartosc=Wielkosc(wartosc=float(wartosc), jednostka=str(zapis["jednostka"])),
        powod_pl=str(zapis["opis_zrodla_pl"]),
        jakosc=FieldQuality.ESTIMATED,
    )


def znajdz_stacje(enm: EnergyNetworkModel, station_ref: str) -> Substation | None:
    """Stacja po ``ref_id`` albo ``id`` elementu (wołający podaje raz jedno, raz drugie)."""
    return next(
        (s for s in enm.substations if station_ref in (s.ref_id, str(getattr(s, "id", "")))),
        None,
    )


def _aparat_z_rekordu(
    indeks: IndeksModeluPola,
    aparat: BayPrimaryDevice,
    przestrzenie: tuple[str, ...],
    szablon_ref: str | None,
) -> AparatPola | None:
    """Aparat pola rekordu jako ``AparatPola`` — gdy ma pozycję katalogu w jednej z przestrzeni.

    Katalog z ``katalog_aparatu`` (katalog elementu wygrywa); nazwa i wartości projektanta
    z elementu modelu (gałąź łącznikowa, przekładnik), a dla aparatu gniazda bez elementu —
    z rekordu pola. Przekładnik Ferrantiego nie leży w torze prądu zwarcia (``None``).
    """
    catalog_ref, przestrzen = katalog_aparatu(indeks, aparat)
    if not catalog_ref or przestrzen not in przestrzenie:
        return None
    nazwa = nazwa_aparatu_pola(aparat)
    wartosci: tuple[WartoscProjektanta, ...] = ()
    galaz = indeks.galezie.get(aparat.linked_ref) if aparat.linked_ref else None
    pomiar = indeks.przekladniki.get(aparat.linked_ref) if aparat.linked_ref else None
    if galaz is not None:
        nazwa = galaz.name
        wartosci = wartosci_projektanta(list(galaz.overrides))
    elif pomiar is not None:
        nazwa = pomiar.name
    if przestrzen == NAMESPACE_CT:
        przekladnik = get_default_mv_catalog().get_ct_type(catalog_ref)
        if przekladnik is not None and przekladnik.odmiana in ODMIANY_CT_POZA_TOREM_ZWARCIA:
            return None
    szablon = szablon_pola_standardu(szablon_ref)
    gniazdo = szablon.gniazdo(aparat.gniazdo_ref) if szablon and aparat.gniazdo_ref else None
    return AparatPola(
        aparat_ref=str(aparat.linked_ref or aparat.device_ref),
        aparat_nazwa=nazwa,
        catalog_ref=str(catalog_ref),
        wartosci_projektanta=wartosci,
        przestrzen=str(przestrzen),
        gniazdo_ref=aparat.gniazdo_ref,
        punkt_neutralny=(
            aparat.earthing_role == "neutral_point"
            or (gniazdo is not None and gniazdo.izolacja == "PUNKT_NEUTRALNY")
        ),
        galaz_modelu=galaz is not None,
    )


def aparaty_pol_stacji(
    enm: EnergyNetworkModel,
    station: Substation,
    *,
    przestrzenie: tuple[str, ...] = PRZESTRZENIE_LACZNIKOW,
) -> dict[str, list[AparatPola]]:
    """Referencja pola → aparaty katalogowe tego pola z podanych przestrzeni katalogu.

    Odczyt przez ``aparaty_pola`` (jedna prawda składu pola: rekord + elementy modelu);
    kolejność aparatów w polu = kolejność składu (gniazda od szyny, potem aparaty spoza
    gniazd), pola bez aparatu z tych przestrzeni pominięte.
    """
    indeks = indeks_modelu_pola(enm)
    wynik: dict[str, list[AparatPola]] = {}
    for bay in pola_stacji(enm, station.ref_id):
        aparaty = [
            a
            for a in (
                _aparat_z_rekordu(indeks, d, przestrzenie, bay.szablon_standardu_ref)
                for d in aparaty_pola(indeks, bay)
            )
            if a is not None
        ]
        if aparaty:
            wynik[bay.ref_id] = aparaty
    return wynik
