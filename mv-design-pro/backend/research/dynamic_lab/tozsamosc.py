"""Deterministyczna TOŻSAMOŚĆ obiektów laboratorium: parametry, scenariusz, topologia.

KOD BADAWCZY — patrz `backend/research/README.md`. **PROTOTYP, NIE KANON.**

PROBLEM, KTÓRY ROZWIĄZUJE
-------------------------
Odcisk liczony z RĘCZNIE WYPISANEJ listy pól jest fałszywą pewnością: pole
dołożone później nie wchodzi do odcisku, a nikt się o tym nie dowiaduje. Ten
sam defekt wystąpił w laboratorium trzy razy niezależnie:

- ``DowodWalidacji.odcisk`` składał sześć pozycji i gubił ``zakres`` — dwa dowody
  o zakresach ``(0.9, 1.1)`` i ``(0.1, 1.3)`` miały IDENTYCZNY odcisk;
- ``SilnikRMS._tozsamosci`` bierze wyłącznie pola SKALARNE plus ręczną gałąź
  ``getattr(u, "maszyna")`` — parametry zagnieżdżone (AVR, governor, PLL,
  ogranicznik GFM) do odcisku nie wchodzą;
- ``SilnikRMS`` liczy ``odcisk_topologii`` z szyn i gałęzi, pomijając boczniki,
  szyny sztywne i bazę mocy — czyli wielkości, które ZMIENIAJĄ Ybus.

Wspólny mianownik: odcisk wypisany ręcznie opisuje stan kodu z dnia, w którym go
napisano. Dlatego tutaj postać kanoniczna jest **WYPROWADZANA z definicji
dataklasy** (``dataclasses.fields``), rekurencyjnie i bez listy klas.

REGUŁA ROZSTRZYGAJĄCA (mechanizm, nie zgadywanie po nazwie)
-----------------------------------------------------------
**Domyślnie pole WCHODZI do tożsamości.** Pominięcie wymaga JAWNEJ DEKLARACJI
przy polu (``pole_artefakt`` / ``pole_opisowe``) wraz z powodem. Konsekwencje:

- nowe pole modelu wchodzi do odcisku samo, bez dopisywania czegokolwiek —
  pominięcie nie może poszerzyć tożsamości przez zapomnienie;
- wartość, której ten moduł nie umie zserializować deterministycznie (np. tablica
  ``numpy`` ze stanem chwilowym), podnosi ``NieserializowalnyParametrError``
  zamiast zniknąć po cichu — autor pola MUSI rozstrzygnąć, czym ono jest;
- rozstrzygnięcie „parametr fizyczny czy artefakt” stoi przy polu i niesie powód,
  więc da się je przeczytać i podważyć (``spis_pominietych``).

Świadomie NIE użyto heurystyki nazw (prefiks ``_``, sufiks ``_cache``): nazwa
jest konwencją, a konwencja milczy, gdy ktoś jej nie dotrzyma.

CO JEST PARAMETREM FIZYCZNYM
----------------------------
Wszystko, co zmienia RÓWNANIA albo OGRANICZENIA modelu: stałe równań, nastawy
regulatorów, progi ograniczników, przynależność do szyny, obiekty strategii
(klasa strategii jest częścią odcisku, więc podmiana strategii jest widoczna).

CO JEST ARTEFAKTEM (pomijane po deklaracji)
-------------------------------------------
Stan chwilowy całkowania, wartości wyliczone przez ``inicjalizuj`` z punktu
pracy, pola wyprowadzone z innych pól oraz etykiety czysto opisowe. Wartości
wyliczone z punktu pracy pomija się, BO punkt pracy jest osobną osią tożsamości
(``TozsamoscScenariusza.punkt_pracy``) — inaczej ten sam model miałby dwa różne
odciski przed i po inicjalizacji, czyli tożsamość zależałaby od kolejności
wywołań, a nie od modelu.

GRANICA, KTÓREJ TEN MODUŁ NIE PRZEKRACZA
----------------------------------------
Urządzenia laboratorium są mutowalne i ``inicjalizuj`` NADPISUJE część nastaw
(np. ``FalownikGFM.p_ref_pu``, ``q_ref_pu``, ``e_ref_pu`` są dobierane do punktu
pracy). Odcisk opisuje więc stan obiektu W CHWILI LICZENIA odcisku. Rozdzielenie
„nastawa zadeklarowana” od „nastawa dobrana do punktu pracy” jest zmianą modelu
urządzenia, a nie warstwy tożsamości — i jest pozycją decyzyjną właściciela.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import pathlib
from collections.abc import Mapping, Sequence
from enum import Enum, StrEnum
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:  # pragma: no cover - tylko dla typów
    from dynamic_lab.siec import TopologiaSieci

KLUCZ_ROLI = "rola_w_tozsamosci"
"""Klucz w ``dataclasses.field(metadata=...)`` niosący rolę pola."""

KLUCZ_POWODU = "powod_pominiecia"
"""Klucz w metadanych z UZASADNIENIEM pominięcia — pominięcie bez powodu jest zakazane."""


class RolaPola(StrEnum):
    """Rola pola w tożsamości. Wartość domyślna (brak deklaracji) to PARAMETR_FIZYCZNY."""

    PARAMETR_FIZYCZNY = "parametr_fizyczny"
    ARTEFAKT = "artefakt"
    """Stan chwilowy albo pole robocze — poza tożsamością MODELU i poza tożsamością BIEGU.

    Stan chwilowy jest już opisany wektorem ``x0``, więc wpisanie go drugi raz do
    tożsamości biegu byłoby liczeniem tej samej wielkości dwa razy."""
    NASTAWA_PUNKTU_PRACY = "nastawa_punktu_pracy"
    """Nastawa WYPROWADZONA Z PUNKTU PRACY — poza tożsamością MODELU, ale W tożsamości BIEGU.

    DLACZEGO TO JEST OSOBNA ROLA, A NIE ARTEFAKT. Nastawa (``V_ref`` wzbudnicy,
    ``P_ref`` falownika, ``P_zadane`` elektrowni) nie jest definicją urządzenia:
    ten sam generator pracuje raz przy ``V_ref = 1,00``, raz przy ``1,02``, a
    ``inicjalizuj`` wylicza ją z rozpływu. Wpisana do tożsamości MODELU sprawia,
    że inicjalizacja ZMIENIA model (zmierzone: 5 z 6 klas urządzeń zmieniało swój
    odcisk po ``inicjalizuj``).

    Ale nastawa ZMIENIA WYNIK, więc musi być w tożsamości BIEGU — i to nie
    wartością zapamiętaną przy inicjalizacji, tylko OBOWIĄZUJĄCĄ w chwili startu
    symulacji. Scenariusz „limit eksportu zaczyna wiązać" zmienia
    ``RegulatorElektrowniPPC.p_zadane_pu`` PO inicjalizacji; gdyby nastawa
    wypadła z obu tożsamości, dwa fizycznie różne biegi miałyby ten sam odcisk.

    PREDYKATY PARAMI: jedna deklaracja przy polu decyduje o OBU skutkach naraz —
    wypadnięciu z modelu i wejściu do biegu. Nie da się mieć jednego bez drugiego."""
    OPIS = "opis"
    """Etykieta czytana przez człowieka — nie wpływa na żadne równanie."""


class NieserializowalnyParametrError(TypeError):
    """Wartość, której nie da się zserializować deterministycznie i bez straty.

    Podnoszona ZAMIAST cichego pominięcia: pominięcie wartości nieznanego typu
    jest dokładnie tym mechanizmem, który czyni odciski fałszywie zgodnymi.
    """


class CyklicznaStrukturaError(ValueError):
    """Struktura parametrów zawiera cykl — odcisk nie istnieje."""


def _pole(
    rola: RolaPola,
    powod: str,
    default: Any,
    default_factory: Any,
    init: bool,
    repr_: bool,
) -> Any:
    if not powod.strip():
        raise ValueError(
            "Pominięcie pola w tożsamości bez podanego powodu jest nieodróżnialne "
            "od przeoczenia — powód jest częścią deklaracji."
        )
    if default is not dataclasses.MISSING and default_factory is not dataclasses.MISSING:
        raise ValueError("Podaj `default` albo `default_factory`, nie oba naraz.")
    parametry: dict[str, Any] = {
        "metadata": {KLUCZ_ROLI: rola, KLUCZ_POWODU: powod},
        "init": init,
        "repr": repr_,
    }
    if default is not dataclasses.MISSING:
        parametry["default"] = default
    if default_factory is not dataclasses.MISSING:
        parametry["default_factory"] = default_factory
    return dataclasses.field(**parametry)


def pole_artefakt(
    *,
    powod: str,
    default: Any = dataclasses.MISSING,
    default_factory: Any = dataclasses.MISSING,
    init: bool = True,
    repr: bool = True,  # noqa: A002 - zgodność nazwy z `dataclasses.field`
) -> Any:
    """Zadeklaruj pole jako ARTEFAKT: poza tożsamością, z powodem przy polu."""
    return _pole(RolaPola.ARTEFAKT, powod, default, default_factory, init, repr)


def pole_nastawa(
    *,
    powod: str,
    default: Any = dataclasses.MISSING,
    default_factory: Any = dataclasses.MISSING,
    init: bool = True,
    repr: bool = True,  # noqa: A002 - zgodność nazwy z `dataclasses.field`
) -> Any:
    """Zadeklaruj pole jako NASTAWĘ PUNKTU PRACY: poza modelem, w tożsamości biegu."""
    return _pole(RolaPola.NASTAWA_PUNKTU_PRACY, powod, default, default_factory, init, repr)


def pole_opisowe(
    *,
    powod: str,
    default: Any = dataclasses.MISSING,
    default_factory: Any = dataclasses.MISSING,
    init: bool = True,
    repr: bool = True,  # noqa: A002 - zgodność nazwy z `dataclasses.field`
) -> Any:
    """Zadeklaruj pole jako OPIS: etykieta dla człowieka, poza tożsamością."""
    return _pole(RolaPola.OPIS, powod, default, default_factory, init, repr)


def rola_pola(pole: dataclasses.Field[Any]) -> RolaPola:
    """Rola pola — bez deklaracji zwraca PARAMETR_FIZYCZNY (domyślnie WCHODZI)."""
    rola = pole.metadata.get(KLUCZ_ROLI)
    return rola if isinstance(rola, RolaPola) else RolaPola.PARAMETR_FIZYCZNY


def spis_pominietych(typ: type) -> tuple[tuple[str, RolaPola, str], ...]:
    """Inwentarz pól WYŁĄCZONYCH z tożsamości danej dataklasy: (pole, rola, powód).

    Istnieje po to, żeby wyłączenia dało się przejrzeć i podważyć testem —
    deklaracja bez możliwości sprawdzenia jest obietnicą, nie mechanizmem.
    """
    if not dataclasses.is_dataclass(typ):
        raise TypeError(f"{typ!r} nie jest dataklasą")
    return tuple(
        (p.name, rola_pola(p), str(p.metadata.get(KLUCZ_POWODU, "")))
        for p in dataclasses.fields(typ)
        if rola_pola(p) is not RolaPola.PARAMETR_FIZYCZNY
    )


def nastawy_punktu_pracy(obiekt: Any) -> dict[str, Any]:
    """Nastawy punktu pracy OBOWIĄZUJĄCE TERAZ, ze ścieżką pola jako kluczem.

    Schodzi rekurencyjnie po dataklasach i sekwencjach, więc sięga po nastawy
    zagnieżdżone (``avr.v_ref_pu`` zespołu wytwórczego, ``jednostki[0].p_ref_pu``
    elektrowni) bez wymieniania ich nigdzie z nazwy. Nowy model z nastawą wnosi ją
    samą deklaracją pola — nie ma listy, o którą można zapomnieć.

    Wartości są w postaci kanonicznej, więc nadają się wprost do odcisku.
    """
    zebrane: dict[str, Any] = {}
    _zbierz_nastawy(obiekt, "", zebrane, [])
    return dict(sorted(zebrane.items()))


def _zbierz_nastawy(wartosc: Any, prefiks: str, cel: dict[str, Any], stos: list[int]) -> None:
    if wartosc is None or isinstance(wartosc, bool | int | float | str | complex | Enum):
        return
    identyfikator = id(wartosc)
    if identyfikator in stos:
        raise CyklicznaStrukturaError(
            f"Cykl w strukturze nastaw na {prefiks or '<korzeń>'} — odcisk nie istnieje."
        )
    stos.append(identyfikator)
    try:
        if dataclasses.is_dataclass(wartosc) and not isinstance(wartosc, type):
            for pole in dataclasses.fields(wartosc):
                sciezka = f"{prefiks}{pole.name}"
                podwartosc = getattr(wartosc, pole.name)
                rola = rola_pola(pole)
                if rola is RolaPola.NASTAWA_PUNKTU_PRACY:
                    cel[sciezka] = postac_kanoniczna(podwartosc)
                    continue
                if rola is not RolaPola.PARAMETR_FIZYCZNY:
                    # ARTEFAKT i OPIS nie wchodzą do tożsamości biegu ani nie mogą
                    # ukryć nastawy w środku: stan chwilowy nie jest strukturą modelu.
                    continue
                _zbierz_nastawy(podwartosc, f"{sciezka}.", cel, stos)
            return
        if isinstance(wartosc, Mapping):
            for klucz, podwartosc in wartosc.items():
                _zbierz_nastawy(podwartosc, f"{prefiks}[{_tekst(_kanon(klucz, []))}].", cel, stos)
            return
        if isinstance(wartosc, Sequence) and not isinstance(wartosc, str | bytes | bytearray):
            for nr, podwartosc in enumerate(wartosc):
                _zbierz_nastawy(podwartosc, f"{prefiks}[{nr}].", cel, stos)
            return
    finally:
        stos.pop()


def postac_kanoniczna(obiekt: Any) -> Any:
    """Postać kanoniczna wartości: struktura wyłącznie z typów JSON, deterministyczna."""
    return _kanon(obiekt, [])


def _nazwa_typu(typ: type) -> str:
    return f"{typ.__module__}.{typ.__qualname__}"


def _kanon(wartosc: Any, stos: list[int]) -> Any:
    # Enum PRZED skalarami: `StrEnum` jest podklasą `str`, a typ wyliczenia jest
    # częścią tożsamości (dwa różne wyliczenia o tej samej wartości to co innego).
    if isinstance(wartosc, Enum):
        return {"@wyliczenie": [_nazwa_typu(type(wartosc)), _kanon(wartosc.value, stos)]}
    if wartosc is None or isinstance(wartosc, bool | int | float | str):
        return wartosc
    if isinstance(wartosc, complex):
        return {"@zespolona": [wartosc.real, wartosc.imag]}

    identyfikator = id(wartosc)
    if identyfikator in stos:
        raise CyklicznaStrukturaError(
            f"Cykl w strukturze parametrów na obiekcie typu {_nazwa_typu(type(wartosc))} "
            "— odcisk takiej struktury nie istnieje."
        )
    stos.append(identyfikator)
    try:
        if dataclasses.is_dataclass(wartosc) and not isinstance(wartosc, type):
            pola = {
                p.name: _kanon(getattr(wartosc, p.name), stos)
                for p in dataclasses.fields(wartosc)
                if rola_pola(p) is RolaPola.PARAMETR_FIZYCZNY
            }
            return {"@dataklasa": _nazwa_typu(type(wartosc)), "@pola": pola}
        if isinstance(wartosc, Mapping):
            pozycje = [(_kanon(k, stos), _kanon(v, stos)) for k, v in wartosc.items()]
            return {"@mapa": sorted(pozycje, key=lambda para: _tekst(para[0]))}
        if isinstance(wartosc, set | frozenset):
            elementy = [_kanon(e, stos) for e in wartosc]
            return {"@zbior": sorted(elementy, key=_tekst)}
        if isinstance(wartosc, Sequence) and not isinstance(wartosc, str | bytes | bytearray):
            return {"@ciag": [_kanon(e, stos) for e in wartosc]}
    finally:
        stos.pop()

    raise NieserializowalnyParametrError(
        f"Wartość typu {_nazwa_typu(type(wartosc))} nie ma postaci kanonicznej. "
        "Jeżeli to parametr fizyczny — rozszerz `postac_kanoniczna`. Jeżeli to stan "
        "chwilowy, wartość wyliczana albo etykieta — zadeklaruj pole przez "
        "`pole_artefakt(...)` / `pole_nastawa(...)` / `pole_opisowe(...)` z powodem. "
        "Ciche pominięcie "
        "jest zakazane, bo czyni odciski fałszywie zgodnymi."
    )


def _tekst(wartosc: Any) -> str:
    """Kanoniczny tekst wartości JUŻ sprowadzonej do postaci kanonicznej (klucz sortowania)."""
    return json.dumps(wartosc, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def odcisk(obiekt: Any) -> str:
    """Deterministyczny SHA-256 postaci kanonicznej.

    Konwencja kanonicznego JSON (``sort_keys``, bez spacji, ``ensure_ascii=False``)
    jest ta sama, co w produkcyjnym ``src/enm/hash.py::_canonical_sha256`` —
    świadomie, żeby odciski laboratorium dały się porównywać z produkcyjnymi bez
    tłumaczenia konwencji.

    W przeciwieństwie do wcześniejszych odcisków laboratorium NIE MA tu
    ``default=str``: awaryjne ``str(obiekt)`` dla obiektu bez ``__str__`` daje
    ``<... object at 0x7f...>``, czyli ADRES W PAMIĘCI — odcisk przestaje wtedy
    być deterministyczny, a wygląda na policzony.
    """
    return hashlib.sha256(_tekst(postac_kanoniczna(obiekt)).encode("utf-8")).hexdigest()


@dataclasses.dataclass(frozen=True)
class PunktPracy:
    """Warunki, w których PYTAMY o przydatność dowodową (i w których liczono bieg).

    ``None`` znaczy „wartość NIEZNANA”, a nie „dowolna” — patrz
    ``ZakresWalidacji.braki_pokrycia``: nieznana współrzędna w wymiarze, który
    dowód ogranicza, daje BRAK POKRYCIA.
    """

    napiecie_pu: float | None = None
    moc_pu: float | None = None
    scr: float | None = None
    rodzaj_zdarzenia: str | None = None


@dataclasses.dataclass(frozen=True)
class KonfiguracjaSolvera:
    """Nastawy NUMERYCZNE biegu — różnica wyniku bywa różnicą nastaw, nie fizyki."""

    integrator: str
    krok_s: float
    tolerancja_sieci: float
    tolerancja_rownowagi: float
    maks_iteracji_sieci: int
    probkowanie_co: int = 1
    dopuszczaj_zastoj: bool = False
    """Czy bieg wolno było kontynuować po zatrzymaniu Newtona na podłodze numerycznej.

    To jest NASTAWA SOLVERA zmieniająca wynik, więc należy do tożsamości biegu:
    ten sam model, ten sam krok i ten sam harmonogram policzone raz z ``False``
    i raz z ``True`` mogą dać różne trajektorie (w pierwszym wypadku bieg kończy
    się wyjątkiem, w drugim — kontynuuje z residuum powyżej progu). Odcisk, który
    tego nie rozróżnia, pozwala podstawić bieg tolerancyjny pod dowód o
    tolerancji ścisłej."""

    def __post_init__(self) -> None:
        if self.krok_s <= 0.0:
            raise ValueError("krok_s musi być > 0")
        if self.tolerancja_sieci <= 0.0 or self.tolerancja_rownowagi <= 0.0:
            raise ValueError("tolerancje muszą być > 0")
        if self.maks_iteracji_sieci <= 0 or self.probkowanie_co <= 0:
            raise ValueError("limity iteracji i próbkowania muszą być > 0")
        if not self.integrator.strip():
            raise ValueError("integrator musi być nazwany")


@dataclasses.dataclass(frozen=True)
class TozsamoscScenariusza:
    """CO liczono: migawka wejścia + punkt pracy + nastawy solvera + harmonogram.

    DLACZEGO TO NIE JEST „integrator + dt + zdarzenia” (stan zastany w
    ``SilnikRMS``): ten sam integrator, ten sam krok i ten sam harmonogram na
    INNEJ migawce sieci albo w INNYM punkcie pracy to inny scenariusz. Odcisk,
    który tego nie rozróżnia, pozwala podstawić pod dowód bieg policzony na innym
    wejściu — czyli dokładnie to, przed czym dowód ma chronić.

    REUŻYCIE ZAMIAST DRUGIEJ PRAWDY — co sprawdzono i dlaczego wyszło, jak wyszło.
    Produkcja ma gotowy odcisk wejścia: ``src/enm/hash.py::compute_input_hash``
    (kanoniczny JSON modelu BEZ stanów łączników) oraz
    ``src/enm/canonical_analysis.py::_compute_input_hash`` (``enm_hash`` +
    ``case_id`` + ``analysis_type`` + ``options``). Laboratorium **nie może ich
    wywołać**: obie funkcje przyjmują produkcyjny, pydantic'owy
    ``EnergyNetworkModel``, a ``research/`` jest odcięte strukturalnie (nie jest
    pakietem w ``pyproject.toml``; ``siec.ybus_z_produkcji`` z tego samego powodu
    przyjmuje GOTOWE dane zamiast importować builder).

    Dlatego reużycie jest tu **przez wartość, nie przez import**: pole
    ``odcisk_migawki`` to MIEJSCE NA produkcyjny ``input_hash`` — gdy bieg
    laboratorium liczy się na migawce z produkcji, wstawia się tam wynik
    ``compute_input_hash`` i nie powstaje druga prawda. Dla topologii istniejącej
    wyłącznie w laboratorium odcisk liczy ``odcisk_topologii`` (ta sama konwencja
    kanonicznego JSON + SHA-256). Układ pól odpowiada produkcyjnemu
    ``_compute_input_hash``: migawka + kontekst przypadku + opcje solvera.
    """

    odcisk_migawki: str
    """Odcisk WEJŚCIA: produkcyjny ``compute_input_hash`` albo ``odcisk_topologii``."""
    punkt_pracy: PunktPracy
    konfiguracja: KonfiguracjaSolvera
    czas_koncowy_s: float
    harmonogram: tuple[Any, ...] = ()
    """Zdarzenia scenariusza (dataklasy z ``zdarzenia.py``) — kolejność jest częścią tożsamości."""
    parametry: Mapping[str, Any] = dataclasses.field(default_factory=dict)
    """Wartości parametrów scenariusza (np. czas trwania zwarcia, krotność skoku)."""

    def __post_init__(self) -> None:
        if not self.odcisk_migawki.strip():
            raise ValueError(
                "Scenariusz bez odcisku migawki wejściowej nie identyfikuje tego, co "
                "policzono — „ten sam scenariusz” na innej sieci byłby nieodróżnialny."
            )
        if self.czas_koncowy_s <= 0.0:
            raise ValueError("czas_koncowy_s musi być > 0")

    @property
    def odcisk(self) -> str:
        return odcisk(self)


def odcisk_topologii(topologia: TopologiaSieci, *, s_bazowa_mva: float) -> str:
    """Odcisk topologii laboratorium — WSZYSTKIEGO, co wchodzi do ``Ybus``, plus baza.

    INWARIANT (przypięty ``test_rozne_ybus_nie_moga_miec_tego_samego_odcisku``):
    dwie topologie dające różne ``zbuduj_ybus()`` nie mogą mieć tego samego
    odcisku. Trzyma się on konstrukcyjnie, bo postać kanoniczna bierze KOMPLET
    pól dataklasy ``TopologiaSieci`` — szyny (z kolejnością, bo ona wyznacza
    indeksy), gałęzie (R, X, B, status załączenia), boczniki i szyny sztywne —
    a nie wybraną ręcznie podlistę. Odwrotny kierunek nie obowiązuje i tak ma
    być: zmiana wartości szyny sztywnej nie rusza ``Ybus``, ale zmienia wynik,
    więc MUSI zmieniać odcisk.

    Baza mocy jest osobnym argumentem, bo ``TopologiaSieci`` jej nie zna
    (trzyma ją ``silnik.ModelDynamiczny``), a p.u. bez bazy nie ma znaczenia
    fizycznego.

    KOLEJNOŚĆ REKORDÓW NIE JEST TOŻSAMOŚCIĄ (audyt niezależny, plan naprawy §6;
    zmierzone). Gałęzie i boczniki trafiały do odcisku w kolejności podania, więc
    TA SAMA sieć zapisana w innej kolejności dawała INNY odcisk — czyli dwa różne
    „biegi" dla jednego modelu, a porównanie ich wyników byłoby porównaniem rzeczy
    uznanych za nieporównywalne. Pomiar: dwa tory ``KABEL-A``/``KABEL-B`` między
    GEN i SYS dawały odciski ``0e5baedc…`` i ``0ddbe1b0…`` zależnie od kolejności
    listy.

    Dlatego przed policzeniem odcisku obie listy są PORZĄDKOWANE po tożsamości:
    gałęzie po ``ident``, boczniki po parze ``(szyna, zrodlo)``. Obie kolejności
    są fizycznie nieznaczące — ``Ybus`` sumuje wkłady. Kolejność SZYN zostaje bez
    zmian, bo ona WYZNACZA indeksy macierzy i jest znacząca.
    """
    if s_bazowa_mva <= 0.0:
        raise ValueError("s_bazowa_mva musi być > 0")
    kanoniczna = dataclasses.replace(
        topologia,
        galezie=sorted(topologia.galezie, key=lambda g: g.ident),
        boczniki=sorted(topologia.boczniki, key=lambda b: (b.szyna, b.zrodlo)),
    )
    return odcisk({"topologia": kanoniczna, "s_bazowa_mva": s_bazowa_mva})


# ---------------------------------------------------------------------------
# TOŻSAMOŚĆ IMPLEMENTACJI — odcisk KODU, który policzył wynik
# ---------------------------------------------------------------------------


def _policz_odcisk_implementacji() -> str:
    """SHA-256 treści WSZYSTKICH modułów pakietu — liczony, nie deklarowany."""
    katalog = pathlib.Path(__file__).resolve().parent
    czesci: list[str] = []
    for sciezka in sorted(katalog.glob("*.py"), key=lambda s: s.name):
        tresc = sciezka.read_bytes()
        czesci.append(f"{sciezka.name}:{hashlib.sha256(tresc).hexdigest()}")
    return hashlib.sha256("\n".join(czesci).encode("utf-8")).hexdigest()


_ODCISK_IMPLEMENTACJI: str | None = None


def odcisk_implementacji() -> str:
    """Odcisk KODU laboratorium: nazwy i treści wszystkich modułów ``dynamic_lab``.

    PO CO. Tożsamość modelu i tożsamość scenariusza opisują, CO liczono. Nie
    mówią nic o tym, CZYM liczono. Ta sama sieć, ten sam punkt pracy i ten sam
    harmonogram dadzą inny wynik po zmianie równania w solverze, po poprawce w
    ograniczniku prądu albo po zmianie kryterium zbieżności — a wszystkie trzy
    odciski pozostaną identyczne. Wynik bez odcisku implementacji daje się więc
    przypisać do kodu, który go NIE policzył, i nikt tego nie wykryje.

    DLACZEGO Z TREŚCI PLIKÓW, A NIE Z NUMERU WERSJI. Numer wersji jest
    DEKLARACJĄ: ktoś musi go podnieść i nikt nie sprawdza, czy to zrobił.
    Odcisk treści jest POMIAREM — zmiana jednego znaku w jednym module zmienia
    go automatycznie, także wtedy (a zwłaszcza wtedy), gdy autor zmiany uznał ją
    za nieistotną. To jest ta sama zasada, co „deklaracja bez testu to fałszywa
    pewność", zastosowana do wersjonowania.

    ZAKRES JEST WĄSKI I TO JEST ŚWIADOME: liczone są wyłącznie moduły pakietu
    ``dynamic_lab``. Odcisk NIE obejmuje wersji Pythona, NumPy ani sprzętu —
    te wchodzą do zakresu ważności wyniku (`dowod_walidacji`), nie do tożsamości
    implementacji. Obiecywanie tu bit-zgodności między maszynami byłoby
    obietnicą, której ten mechanizm nie dotrzymuje.

    Wartość jest liczona RAZ na proces: pliki źródłowe nie zmieniają się w
    trakcie biegu, a policzenie ich przy każdym wyniku zamieniłoby odcisk w
    koszt wejścia/wyjścia proporcjonalny do liczby symulacji.
    """
    global _ODCISK_IMPLEMENTACJI
    if _ODCISK_IMPLEMENTACJI is None:
        _ODCISK_IMPLEMENTACJI = _policz_odcisk_implementacji()
    return _ODCISK_IMPLEMENTACJI
