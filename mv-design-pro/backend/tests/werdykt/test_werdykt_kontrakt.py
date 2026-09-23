"""Kontrakt werdyktu wyjaśnialnego — walidacja przy konstrukcji i granice pakietu.

Intencja: inwarianty kontraktu (T1–T4, T10, T14, T15) i trzy twarde nierówności §0 („brak
danych ≠ spełnia", „brak certyfikatu ≠ spełnia", „UNVALIDATED_MODEL ≠ pełny dowód", „zakres nie
szerszy niż Z") są BŁĘDAMI TYPU: rekord, który je łamie, nie daje się zbudować — ani
konstruktorem, ani ręcznie, ani przez odczyt JSON. Każdy inwariant ma tu test falsyfikujący
(konstrukcja rekordu łamiącego inwariant → ``ValidationError``), a podmiana pola wyprowadzonego
regułą (status, margines, kompletność, etykieta, braki, zastrzeżenia) jest testowana na CAŁYM
katalogu rekordów (każda relacja × każda droga do każdego statusu), nie na przykładzie.
"""

from __future__ import annotations

import ast
import dataclasses
import enum
import inspect
import math
import os
import re
import subprocess
import sys
import typing
from collections.abc import Callable
from pathlib import Path
from typing import Any, get_args

import pytest
import werdykt
from pydantic import BaseModel, ValidationError
from werdykt import (
    DanaPrzyjeta,
    KompletnoscDowodu,
    Kryterium,
    LimitKryterium,
    Margines,
    MetodaDowodu,
    Niepewnosc,
    OcenaKryterium,
    PodstawaWymagania,
    PokrycieProgramu,
    PoziomRekordu,
    PunktObwiedni,
    Relacja,
    StatusDanych,
    StatusWerdyktu,
    Stosowalnosc,
    Wielkosc,
    WyjasnienieWerdyktu,
    WynikKryterium,
    WynikWymagania,
    etykieta,
)
from werdykt.kontrakt import METODY_WYKAZANIA, METODY_WYNIKU
from werdykt.proweniencja import ClaimKind, EvidenceTier, FieldQuality

from tests.werdykt import fabryki as f

KATALOG_PAKIETU = Path(werdykt.__file__).parent
REKORDY_K = f.rekordy_k()
REKORDY_W = f.rekordy_w()
STATUSY: tuple[StatusWerdyktu, ...] = get_args(StatusWerdyktu)
METODY: tuple[MetodaDowodu, ...] = get_args(werdykt.MetodaDowodu)


def _zrzut(rekord: BaseModel) -> dict[str, Any]:
    return rekord.model_dump(mode="json")


def _odtworz(typ: type[BaseModel], dane: dict[str, Any]) -> BaseModel:
    return typ.model_validate(dane)


def _typ(rekord: BaseModel) -> type[BaseModel]:
    return type(rekord)


# ---------------------------------------------------------------------------
# T1 — wyjaśnienie obowiązkowe, zdanie niepuste
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "nazwa, rekord", REKORDY_K + REKORDY_W, ids=[n for n, _ in REKORDY_K + REKORDY_W]
)
def test_t1_rekord_bez_wyjasnienia_jest_odrzucany(nazwa: str, rekord: BaseModel) -> None:
    """Rekord K/W bez pola ``wyjasnienie`` nie daje się zbudować — dla każdego statusu."""
    dane = _zrzut(rekord)
    del dane["wyjasnienie"]
    with pytest.raises(ValidationError, match="wyjasnienie"):
        _odtworz(_typ(rekord), dane)


@pytest.mark.parametrize("zdanie", ["", " ", "\n\t "])
@pytest.mark.parametrize(
    "nazwa, rekord", REKORDY_K + REKORDY_W, ids=[n for n, _ in REKORDY_K + REKORDY_W]
)
def test_t1_puste_zdanie_jest_odrzucane(nazwa: str, rekord: BaseModel, zdanie: str) -> None:
    """Zdanie wyjaśnienia puste albo z samych odstępów → błąd walidacji (K i W, każdy status)."""
    dane = _zrzut(rekord)
    dane["wyjasnienie"]["zdanie_pl"] = zdanie
    with pytest.raises(ValidationError, match="zdanie_pl"):
        _odtworz(_typ(rekord), dane)


def test_t1_wyjasnienie_odrzuca_powtorzone_braki_i_zastrzezenia() -> None:
    """Lista braków i zastrzeżeń jest bez powtórzeń — generator je usuwa, typ je odrzuca."""
    with pytest.raises(ValidationError, match="czego_brakuje"):
        WyjasnienieWerdyktu(zdanie_pl="Zdanie.", czego_brakuje=("a", "a"))
    with pytest.raises(ValidationError, match="zastrzezenia"):
        WyjasnienieWerdyktu(zdanie_pl="Zdanie.", zastrzezenia=("b", "b"))


# ---------------------------------------------------------------------------
# T2 — kryterium z warunkiem w LaTeX dla relacji liczbowych
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("warunek", ["", "   "])
@pytest.mark.parametrize("relacja", f.RELACJE_LICZBOWE)
def test_t2_relacja_liczbowa_wymaga_warunku_latex(relacja: str, warunek: str) -> None:
    with pytest.raises(ValidationError, match="LaTeX"):
        Kryterium(opis_pl="Kryterium", warunek_latex=warunek, relacja=relacja)


def test_t2_kryterium_logiczne_nie_wymaga_warunku_latex() -> None:
    kryterium = Kryterium(opis_pl="Pozostanie w pracy", warunek_latex="", relacja="LOGICZNE")
    assert kryterium.relacja == "LOGICZNE"


@pytest.mark.parametrize(
    "nazwa, rekord",
    [(n, r) for n, r in REKORDY_K if r.status_maszynowy in ("SPELNIA", "NIE_SPELNIA")]
    + [(n, r) for n, r in REKORDY_K if r.status_maszynowy == "NIEJEDNOZNACZNY"],
    ids=lambda x: x if isinstance(x, str) else "",
)
def test_t2_rekord_z_werdyktem_bez_kryterium_jest_odrzucany(
    nazwa: str, rekord: OcenaKryterium
) -> None:
    dane = _zrzut(rekord)
    del dane["kryterium"]
    with pytest.raises(ValidationError, match="kryterium"):
        OcenaKryterium.model_validate(dane)


# ---------------------------------------------------------------------------
# T3 — liczba bez jednostki; T15 — wartość względna bez bazy
# ---------------------------------------------------------------------------

_NOSNIKI_JEDNOSTKI: dict[str, Callable[[str], object]] = {
    "wielkosc": lambda j: Wielkosc(wartosc=1.0, jednostka=j),
    "wynik": lambda j: WynikKryterium(
        wielkosc_pl="x",
        symbol_latex="x",
        wartosc={"wartosc": 1.0, "jednostka": j},
        metoda="DEKLARACJA",
    ),
    "limit_wartosc": lambda j: LimitKryterium(
        wartosc={"wartosc": 1.0, "jednostka": j}, podstawa=f.podstawa()
    ),
    "limit_pasmo": lambda j: LimitKryterium(
        pasmo=({"wartosc": 1.0, "jednostka": j}, {"wartosc": 2.0, "jednostka": j}),
        podstawa=f.podstawa(),
    ),
    "limit_obwiednia": lambda j: LimitKryterium(
        obwiednia=(PunktObwiedni(t_s=0.0, wartosc=1.0), PunktObwiedni(t_s=1.0, wartosc=1.0)),
        jednostka_obwiedni=j,
        podstawa=f.podstawa(),
    ),
    "margines": lambda j: Margines(
        wartosc={"wartosc": 1.0, "jednostka": j}, definicja_latex=r"m = x_{\lim} - x"
    ),
    "niepewnosc": lambda j: Niepewnosc(
        wartosc={"wartosc": 1.0, "jednostka": j}, metoda_pl="połowienie kroku"
    ),
    "dana_przyjeta": lambda j: DanaPrzyjeta(
        nazwa_pl="S_k″", wartosc={"wartosc": 1.0, "jednostka": j}, powod_pl="założona", jakosc=None
    ),
}
_JEDNOSTKI_BEZ_JEDNOSTKI = ["", " ", "—", "-", "–", "−", " ms", "ms "]
_JEDNOSTKI_WZGLEDNE_BEZ_BAZY = [
    "p.u.",
    "pu",
    "PU",
    "p.u",
    "pu.",
    "p. u.",
    "P.U.",
    "pu (U_n)",
    "p.u.(U_n)",
    "p.u. ()",
    "p.u. (  )",
    "P.U. (U_n)",
]
_JEDNOSTKI_POPRAWNE = [
    "1",
    "%",
    "p.u. (U_n)",
    "p.u. (I_n modułu)",
    "p.u. (S_baz sieci)",
    "Hz",
    "pp",
    "ms",
    "MVA",
    "Pa",
]


@pytest.mark.parametrize("jednostka", _JEDNOSTKI_BEZ_JEDNOSTKI + _JEDNOSTKI_WZGLEDNE_BEZ_BAZY)
@pytest.mark.parametrize("nosnik", sorted(_NOSNIKI_JEDNOSTKI))
def test_t3_t15_liczba_bez_jawnej_jednostki_jest_odrzucana(nosnik: str, jednostka: str) -> None:
    """Każde miejsce niosące liczbę (wynik, limit w trzech postaciach, margines, niepewność,
    dana przyjęta) odrzuca brak jednostki, myślnik zamiast jednostki, zapis niekanoniczny
    i wartość względną bez nazwanej bazy."""
    with pytest.raises(ValidationError):
        _NOSNIKI_JEDNOSTKI[nosnik](jednostka)


@pytest.mark.parametrize("jednostka", _JEDNOSTKI_POPRAWNE)
@pytest.mark.parametrize("nosnik", sorted(_NOSNIKI_JEDNOSTKI))
def test_t3_t15_jednostka_jawna_jest_przyjmowana(nosnik: str, jednostka: str) -> None:
    assert _NOSNIKI_JEDNOSTKI[nosnik](jednostka) is not None


def test_t3_brak_klucza_jednostki_jest_odrzucany() -> None:
    with pytest.raises(ValidationError, match="jednostka"):
        Wielkosc.model_validate({"wartosc": 1.0})


@pytest.mark.parametrize("liczba", [math.nan, math.inf, -math.inf])
@pytest.mark.parametrize(
    "konstrukcja",
    [
        lambda x: Wielkosc(wartosc=x, jednostka="Hz"),
        lambda x: PunktObwiedni(t_s=x, wartosc=1.0),
        lambda x: PunktObwiedni(t_s=0.0, wartosc=x),
        lambda x: WynikKryterium(
            wielkosc_pl="x",
            symbol_latex="x",
            wartosc=f.wielkosc(1.0, "s"),
            chwila_s=x,
            metoda="DEKLARACJA",
        ),
        lambda x: Margines(
            wartosc=f.wielkosc(1.0, "s"),
            definicja_latex="m",
            skala=f.wielkosc(1.0, "s"),
            skala_rodzaj="LIMIT",
            wzgledny=x,
        ),
    ],
    ids=["wielkosc", "obwiednia_t", "obwiednia_wartosc", "chwila", "wzgledny"],
)
def test_t3_liczba_nieskonczona_albo_nieokreslona_jest_odrzucana(
    konstrukcja: Callable[[float], object], liczba: float
) -> None:
    with pytest.raises(ValidationError):
        konstrukcja(liczba)


# ---------------------------------------------------------------------------
# T15 — podstawa WSKAZANA / ZWERYFIKOWANA wymaga dokumentu, wydania i jednostki redakcyjnej
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "brakujace",
    [("wydanie",), ("jednostka_redakcyjna",), ("wydanie", "jednostka_redakcyjna")],
)
@pytest.mark.parametrize("stan", ["WSKAZANE", "ZWERYFIKOWANE"])
def test_t15_podstawa_ustalona_bez_wydania_albo_jednostki_jest_odrzucana(
    stan: str, brakujace: tuple[str, ...]
) -> None:
    dane: dict[str, Any] = {
        "rodzaj": "ROZPORZADZENIE_UE",
        "dokument": "Rozporządzenie Komisji (UE) 2016/631",
        "wydanie": "2016/631",
        "jednostka_redakcyjna": "art. 14 ust. 3",
        "status": stan,
    }
    for pole in brakujace:
        del dane[pole]
    with pytest.raises(ValidationError, match="NIEUSTALONE"):
        PodstawaWymagania.model_validate(dane)


@pytest.mark.parametrize("pole", ["dokument", "wydanie", "jednostka_redakcyjna"])
@pytest.mark.parametrize("stan", ["WSKAZANE", "ZWERYFIKOWANE", "NIEUSTALONE"])
def test_t15_podstawa_z_pustym_tekstem_jest_odrzucana(stan: str, pole: str) -> None:
    dane: dict[str, Any] = {
        "rodzaj": "WOS",
        "dokument": "Wymogi ogólnego stosowania",
        "wydanie": "2019",
        "jednostka_redakcyjna": "§ 12",
        "status": stan,
    }
    dane[pole] = "  "
    with pytest.raises(ValidationError):
        PodstawaWymagania.model_validate(dane)


def test_t15_podstawa_nieustalona_nie_wymaga_wydania_ani_jednostki() -> None:
    podstawa = PodstawaWymagania(rodzaj="OSD", dokument="Profil operatora", status="NIEUSTALONE")
    assert podstawa.wydanie is None and podstawa.jednostka_redakcyjna is None


@pytest.mark.parametrize("stan", ["WSKAZANE", "ZWERYFIKOWANE"])
def test_podstawa_rodzaju_nieustalona_nie_ma_stanu_mocniejszego(stan: str) -> None:
    """Przeetykietowanie warstwy bez pochodzenia na „wskazane" nie podnosi jej stanu."""
    with pytest.raises(ValidationError, match="NIEUSTALONA"):
        PodstawaWymagania(
            rodzaj="NIEUSTALONA",
            dokument="Profil zastany",
            wydanie="2024-Q4",
            jednostka_redakcyjna="sekcja 1",
            status=stan,
        )


# ---------------------------------------------------------------------------
# T4 — limit z podstawą i w jednej postaci
# ---------------------------------------------------------------------------


def test_t4_limit_bez_podstawy_jest_odrzucany() -> None:
    with pytest.raises(ValidationError, match="podstawa"):
        LimitKryterium(wartosc=f.wielkosc(40.0, "ms"))


@pytest.mark.parametrize(
    "postaci",
    [
        (),
        ("wartosc", "pasmo"),
        ("wartosc", "obwiednia"),
        ("pasmo", "obwiednia"),
        ("wartosc", "pasmo", "obwiednia"),
    ],
    ids=["zadna", "wartosc+pasmo", "wartosc+obwiednia", "pasmo+obwiednia", "wszystkie"],
)
def test_t4_limit_ma_dokladnie_jedna_postac(postaci: tuple[str, ...]) -> None:
    pola: dict[str, Any] = {
        "wartosc": {"wartosc": 1.0, "jednostka": "Hz"},
        "pasmo": ({"wartosc": 1.0, "jednostka": "Hz"}, {"wartosc": 2.0, "jednostka": "Hz"}),
        "obwiednia": ({"t_s": 0.0, "wartosc": 1.0}, {"t_s": 1.0, "wartosc": 1.0}),
    }
    dane: dict[str, Any] = {"podstawa": f.podstawa()}
    for postac in postaci:
        dane[postac] = pola[postac]
    if "obwiednia" in postaci:
        dane["jednostka_obwiedni"] = "Hz"
    with pytest.raises(ValidationError, match="jedną postać"):
        LimitKryterium.model_validate(dane)


@pytest.mark.parametrize(
    "pasmo, fragment",
    [
        (((2.0, "Hz"), (1.0, "Hz")), "mniejszej"),
        (((1.0, "Hz"), (1.0, "Hz")), "mniejszej"),
        (((1.0, "Hz"), (2.0, "%")), "jednostkach"),
    ],
)
def test_t4_pasmo_niespojne_jest_odrzucane(
    pasmo: tuple[tuple[float, str], tuple[float, str]], fragment: str
) -> None:
    with pytest.raises(ValidationError, match=fragment):
        LimitKryterium(pasmo=(f.wielkosc(*pasmo[0]), f.wielkosc(*pasmo[1])), podstawa=f.podstawa())


@pytest.mark.parametrize(
    "czasy, jednostka, fragment",
    [
        ((0.0,), "Hz", "dwóch"),
        ((0.0, 0.0), "Hz", "ściśle"),
        ((1.0, 0.5), "Hz", "ściśle"),
        ((0.0, 1.0), None, "jednostki"),
    ],
)
def test_t4_obwiednia_niespojna_jest_odrzucana(
    czasy: tuple[float, ...], jednostka: str | None, fragment: str
) -> None:
    with pytest.raises(ValidationError, match=fragment):
        LimitKryterium(
            obwiednia=tuple(PunktObwiedni(t_s=t, wartosc=1.0) for t in czasy),
            jednostka_obwiedni=jednostka,
            podstawa=f.podstawa(),
        )


def test_t4_jednostka_obwiedni_bez_obwiedni_jest_odrzucana() -> None:
    with pytest.raises(ValidationError, match="nie jest obwiednią"):
        LimitKryterium(
            wartosc=f.wielkosc(1.0, "Hz"), jednostka_obwiedni="Hz", podstawa=f.podstawa()
        )


@pytest.mark.parametrize(
    "t_s, oczekiwana",
    [(0.0, 0.25), (0.5, 0.5), (1.0, 0.75), (1.5, 0.75), (2.0, 0.75), (0.25, 0.375)],
)
def test_obwiednia_interpolowana_liniowo(t_s: float, oczekiwana: float) -> None:
    limit = f.limit("OBWIEDNIA_DOLNA")
    assert limit is not None
    assert limit.wartosc_obwiedni(t_s) == oczekiwana


@pytest.mark.parametrize("t_s", [-0.001, 2.001, 10.0])
def test_obwiednia_nie_jest_ekstrapolowana(t_s: float) -> None:
    limit = f.limit("OBWIEDNIA_DOLNA")
    assert limit is not None
    with pytest.raises(ValueError, match="ekstrapolacja"):
        limit.wartosc_obwiedni(t_s)


def test_wartosc_obwiedni_dla_limitu_bez_obwiedni_jest_bledem() -> None:
    limit = f.limit("NIE_WIECEJ")
    assert limit is not None
    with pytest.raises(ValueError, match="obwiedni"):
        limit.wartosc_obwiedni(0.0)


# ---------------------------------------------------------------------------
# T10 — powód stosowalności zawsze
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("powod", ["", "  "])
@pytest.mark.parametrize("dotyczy", [True, False])
def test_t10_stosowalnosc_bez_powodu_jest_odrzucana(dotyczy: bool, powod: str) -> None:
    with pytest.raises(ValidationError, match="powod_pl"):
        Stosowalnosc(dotyczy=dotyczy, powod_pl=powod)


def test_t10_warunek_wstepny_nieuruchomiony_oznacza_niestosowalnosc() -> None:
    with pytest.raises(ValidationError, match="dotyczy=False"):
        Stosowalnosc(dotyczy=True, powod_pl="powód", warunek_wstepny_nieuruchomiony=True)


def test_t10_niestosowalnosc_z_warunku_wstepnego_wymaga_warunku_kryterium() -> None:
    """Powód „obowiązek nie został uruchomiony" bez nazwanego warunku byłby tekstem bez pola."""
    with pytest.raises(ValidationError, match="warunek_wstepny_pl"):
        f.ocena(
            "LOGICZNE",
            stosowalnosc_oceny=f.stosowalnosc(False, warunek_wstepny_nieuruchomiony=True),
        )


def test_t10_warunek_wstepny_nie_jest_cecha_wymagania() -> None:
    with pytest.raises(ValidationError, match="warunek wstępny"):
        f.wymaganie(
            [],
            dotyczy=False,
            stosowalnosc_wymagania=f.stosowalnosc(False, warunek_wstepny_nieuruchomiony=True),
        )


# ---------------------------------------------------------------------------
# Niepewność, margines, dane — postaci typów
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "dane",
    [
        {},
        {"wartosc": {"wartosc": 1.0, "jednostka": "ms"}},
        {"metoda_pl": "połowienie kroku"},
        {"nie_dotyczy": True},
        {"nie_dotyczy": True, "powod_pl": "p", "wartosc": {"wartosc": 1.0, "jednostka": "ms"}},
        {"nie_dotyczy": True, "powod_pl": "p", "metoda_pl": "m"},
        {"wartosc": {"wartosc": 1.0, "jednostka": "ms"}, "metoda_pl": "m", "powod_pl": "p"},
        {"wartosc": {"wartosc": -0.5, "jednostka": "ms"}, "metoda_pl": "m"},
    ],
    ids=[
        "pusta",
        "wartosc_bez_metody",
        "metoda_bez_wartosci",
        "nie_dotyczy_bez_powodu",
        "nie_dotyczy_z_wartoscia",
        "nie_dotyczy_z_metoda",
        "wartosc_z_powodem",
        "ujemna",
    ],
)
def test_niepewnosc_ma_dokladnie_jedna_postac(dane: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        Niepewnosc.model_validate(dane)


@pytest.mark.parametrize(
    "dane, fragment",
    [
        ({"niedefiniowalny": True}, "powodu"),
        (
            {"niedefiniowalny": True, "powod_pl": "p", "wartosc": {"wartosc": 1, "jednostka": "s"}},
            "nie może nieść",
        ),
        ({"wartosc": {"wartosc": 1, "jednostka": "s"}}, "definicji"),
        ({"definicja_latex": "m"}, "definicji"),
        (
            {
                "wartosc": {"wartosc": 1, "jednostka": "s"},
                "definicja_latex": "m",
                "skala": {"wartosc": 2, "jednostka": "s"},
            },
            "razem",
        ),
        (
            {
                "wartosc": {"wartosc": 1, "jednostka": "s"},
                "definicja_latex": "m",
                "skala": {"wartosc": 2, "jednostka": "s"},
                "skala_rodzaj": "LIMIT",
            },
            "względny",
        ),
        (
            {
                "wartosc": {"wartosc": 1, "jednostka": "s"},
                "definicja_latex": "m",
                "skala": {"wartosc": 2, "jednostka": "ms"},
                "skala_rodzaj": "LIMIT",
                "wzgledny": 0.5,
            },
            "jednostce",
        ),
        (
            {
                "wartosc": {"wartosc": 1, "jednostka": "s"},
                "definicja_latex": "m",
                "skala": {"wartosc": 0, "jednostka": "s"},
                "skala_rodzaj": "LIMIT",
                "wzgledny": 0.0,
            },
            "dodatnia",
        ),
        (
            {
                "wartosc": {"wartosc": 1, "jednostka": "s"},
                "definicja_latex": "m",
                "skala": {"wartosc": 2, "jednostka": "s"},
                "skala_rodzaj": "TOLERANCJA",
                "wzgledny": 0.25,
            },
            "ilorazu",
        ),
    ],
    ids=[
        "niedefiniowalny_bez_powodu",
        "niedefiniowalny_z_wartoscia",
        "bez_definicji",
        "bez_wartosci",
        "skala_bez_rodzaju",
        "skala_bez_wzglednego",
        "skala_w_innej_jednostce",
        "skala_zerowa",
        "wzgledny_niezgodny",
    ],
)
def test_margines_ma_jedna_spojna_postac(dane: dict[str, Any], fragment: str) -> None:
    with pytest.raises(ValidationError, match=fragment):
        Margines.model_validate(dane)


def test_status_danych_unvalidated_input_wymaga_danych_przyjetych() -> None:
    with pytest.raises(ValidationError, match="listy danych przyjętych"):
        StatusDanych(stan="UNVALIDATED_INPUT")
    with pytest.raises(ValidationError, match="ZWALIDOWANE"):
        StatusDanych(stan="ZWALIDOWANE", dane_przyjete=(f.dana_przyjeta(),))


def test_zakres_parametry_sieci_niosa_status_danych() -> None:
    with pytest.raises(ValidationError, match="statusu danych"):
        f.zakres(parametry_sieci=[f.dana_przyjeta(jakosc=None)])
    with pytest.raises(ValidationError, match="wykluczenia"):
        f.zakres(wykluczenia=["harmoniczne", "harmoniczne"])


@pytest.mark.parametrize("metoda", METODY)
def test_metoda_wyniku_z_podzbioru_kontraktu(metoda: MetodaDowodu) -> None:
    """Wielkość wyniku pochodzi wyłącznie z metod §4.1 — nie z „braku metody", oceny
    operatora, dowodu łączonego ani raportu (wartość z raportu z badania to POMIAR)."""

    def budowa() -> WynikKryterium:
        return WynikKryterium(
            wielkosc_pl="x", symbol_latex="x", wartosc=f.wielkosc(1.0, "Hz"), metoda=metoda
        )

    if metoda in METODY_WYNIKU:
        assert budowa().metoda == metoda
    else:
        with pytest.raises(ValidationError, match="nie jest źródłem"):
            budowa()


@pytest.mark.parametrize("sposob", METODY)
def test_sposob_wykazania_z_podzbioru_kontraktu(sposob: MetodaDowodu) -> None:
    oceny = [] if sposob == "BRAK_METODY" else [f.ocena()]
    if sposob in METODY_WYKAZANIA:
        assert f.wymaganie(oceny, sposob=sposob).sposob_wykazania == sposob
    else:
        with pytest.raises(ValidationError, match="nie jest sposobem wykazania"):
            f.wymaganie(oceny, sposob=sposob)


def test_dowod_wymagania_zgodny_ze_sposobem_wykazania() -> None:
    with pytest.raises(ValidationError, match="różni się od sposobu"):
        f.wymaganie([f.ocena()], sposob="DEKLARACJA", dowod_wymagania=f.dowod(metoda="POMIAR"))


# ---------------------------------------------------------------------------
# T14 — symulacja bez oszacowanej niepewności
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("zrodlo", ["dowod", "wynik", "oba"])
@pytest.mark.parametrize("relacja", f.RELACJE)
def test_t14_symulacja_bez_niepewnosci_jest_odrzucana(relacja: str, zrodlo: str) -> None:
    """Wynik symulacji bez oszacowanej niepewności (u = |m(h) − m(h/2)|) nie daje rekordu —
    brak oszacowania nie może wydać werdyktu (także dla kryterium logicznego)."""
    dowod_oceny = f.dowod_symulacji() if zrodlo in ("dowod", "oba") else f.dowod()
    metoda_wyniku: MetodaDowodu = "SYMULACJA" if zrodlo in ("wynik", "oba") else "DEKLARACJA"
    with pytest.raises(ValidationError, match="niepewności"):
        f.ocena(relacja, dowod_oceny=dowod_oceny, metoda_wyniku=metoda_wyniku, u=None)


@pytest.mark.parametrize("relacja", f.RELACJE)
def test_t14_symulacja_bez_biegu_nie_wymaga_niepewnosci(relacja: str) -> None:
    """Bez wyniku nie ma czego oszacować: rekord powstaje, a status to NIE_OCENIONO."""
    rekord = f.ocena(relacja, dowod_oceny=f.dowod_symulacji(), jest_wynik=False, u=None)
    assert rekord.status_maszynowy == "NIE_OCENIONO"


# ---------------------------------------------------------------------------
# Domena walidacji biegu (karta A2 pkt 4)
# ---------------------------------------------------------------------------

METODY_BIEGU: tuple[MetodaDowodu, ...] = ("SYMULACJA", "OBLICZENIE")


@pytest.mark.parametrize("domena", [None, "D-11"])
@pytest.mark.parametrize("w_domenie", [None, True, False])
@pytest.mark.parametrize("metoda", get_args(MetodaDowodu))
def test_domena_walidacji_tylko_dla_biegu_i_zawsze_z_nazwa(
    metoda: MetodaDowodu, w_domenie: bool | None, domena: str | None
) -> None:
    """Metoda × predykat domeny × nazwa domeny: domena istnieje wyłącznie dla symulacji
    i obliczenia, a predykat i nazwa domeny występują razem albo wcale (także dla False)."""
    poprawna = (w_domenie is None) == (domena is None) and (
        metoda in METODY_BIEGU or w_domenie is None
    )
    if poprawna:
        dowod = f.dowod(metoda=metoda, w_domenie=w_domenie, domena=domena)
        assert (dowod.w_domenie_walidacji, dowod.domena_pl) == (w_domenie, domena)
    else:
        with pytest.raises(ValidationError, match="domen"):
            f.dowod(metoda=metoda, w_domenie=w_domenie, domena=domena)


@pytest.mark.parametrize("domena", ["", "   "])
@pytest.mark.parametrize("w_domenie", [True, False])
def test_nazwa_domeny_niepusta(w_domenie: bool, domena: str) -> None:
    with pytest.raises(ValidationError, match="domena_pl"):
        f.dowod(metoda="SYMULACJA", w_domenie=w_domenie, domena=domena)


@pytest.mark.parametrize("jest_wynik", [True, False])
@pytest.mark.parametrize("relacja", f.RELACJE)
def test_wynik_symulacji_wymaga_rozstrzygniecia_domeny(relacja: Relacja, jest_wynik: bool) -> None:
    """Relacja × obecność wyniku: wynik symulacji bez predykatu domeny jest odrzucany; bez
    wyniku (brak biegu) predykat nie jest wymagany."""
    dowod_oceny = f.dowod_symulacji(w_domenie=None)
    if jest_wynik:
        with pytest.raises(ValidationError, match="w_domenie_walidacji"):
            f.ocena(
                relacja,
                dowod_oceny=dowod_oceny,
                metoda_wyniku="SYMULACJA",
                u=f.NIEPEWNOSC_ROZSTRZYGALNA[relacja],
            )
    else:
        rekord = f.ocena(relacja, dowod_oceny=dowod_oceny, jest_wynik=False)
        assert rekord.status_maszynowy == "NIE_OCENIONO"


def test_wynik_obliczenia_nie_wymaga_rozstrzygniecia_domeny() -> None:
    rekord = f.ocena(
        dowod_oceny=f.dowod_obliczenia(),
        metoda_wyniku="OBLICZENIE",
        zakres_oceny=f.zakres(rodzaj="POWER_FLOW"),
    )
    assert rekord.dowod.w_domenie_walidacji is None
    assert rekord.kompletnosc_dowodu == "PELNY"


# ---------------------------------------------------------------------------
# Dowód łączony wyłącznie na poziomie W (karta A2 pkt 1)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("twierdzenie", list(ClaimKind))
@pytest.mark.parametrize("relacja", f.RELACJE)
def test_dowod_laczony_niedozwolony_w_rekordzie_k(relacja: Relacja, twierdzenie: ClaimKind) -> None:
    with pytest.raises(ValidationError, match="dowód łączony"):
        f.ocena(relacja, dowod_oceny=f.dowod(metoda="DOWOD_LACZONY", twierdzenie=twierdzenie))


# ---------------------------------------------------------------------------
# Warunek wstępny z podstawą (karta A2 pkt 3)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("ma_podstawe", [True, False])
@pytest.mark.parametrize("ma_warunek", [True, False])
def test_warunek_wstepny_i_jego_podstawa_razem_albo_wcale(
    ma_warunek: bool, ma_podstawe: bool
) -> None:
    dane: dict[str, Any] = {
        "opis_pl": "Pozostanie w pracy podczas zapadu",
        "warunek_latex": "",
        "relacja": "LOGICZNE",
        "warunek_wstepny_pl": "U_PCC(t) ≥ obwiednia" if ma_warunek else None,
        "warunek_wstepny_podstawa": (
            f.podstawa_warunku().model_dump(mode="json") if ma_podstawe else None
        ),
    }
    if ma_warunek == ma_podstawe:
        kryterium = Kryterium.model_validate(dane)
        assert (kryterium.warunek_wstepny_pl is None) == (not ma_warunek)
    else:
        with pytest.raises(ValidationError, match="warunek wstępny i jego podstawa"):
            Kryterium.model_validate(dane)


# ---------------------------------------------------------------------------
# Struktura rekordu K
# ---------------------------------------------------------------------------


def test_kryterium_logiczne_nie_ma_limitu() -> None:
    rekord = f.ocena("LOGICZNE")
    limit = f.limit("NIE_WIECEJ")
    assert limit is not None
    dane = _zrzut(rekord)
    dane["limit"] = _zrzut(limit)
    with pytest.raises(ValidationError, match="limitu skalarnego"):
        OcenaKryterium.model_validate(dane)


@pytest.mark.parametrize(
    "wartosc, jednostka",
    [(0.5, "1"), (2.0, "1"), (1.0, "%"), (0.0, "p.u. (U_n)")],
)
def test_kryterium_logiczne_ma_wynik_zero_jedynkowy(wartosc: float, jednostka: str) -> None:
    dane = _zrzut(f.ocena("LOGICZNE"))
    dane["wynik"]["wartosc"] = {"wartosc": wartosc, "jednostka": jednostka}
    with pytest.raises(ValidationError, match="1.0 albo 0.0"):
        OcenaKryterium.model_validate(dane)


def test_kryterium_logiczne_opisuje_stan() -> None:
    dane = _zrzut(f.ocena("LOGICZNE"))
    dane["wynik"]["punkt_krytyczny_pl"] = None
    with pytest.raises(ValidationError, match="opisuje stan"):
        OcenaKryterium.model_validate(dane)


@pytest.mark.parametrize("relacja", f.RELACJE_LICZBOWE)
def test_wynik_liczbowy_wymaga_symbolu(relacja: str) -> None:
    dane = _zrzut(f.ocena(relacja))
    dane["wynik"]["symbol_latex"] = " "
    with pytest.raises(ValidationError, match="symbolu"):
        OcenaKryterium.model_validate(dane)


@pytest.mark.parametrize("relacja", ["OBWIEDNIA_DOLNA", "OBWIEDNIA_GORNA"])
def test_wynik_wobec_obwiedni_wymaga_chwili(relacja: str) -> None:
    dane = _zrzut(f.ocena(relacja))
    dane["wynik"]["chwila_s"] = None
    with pytest.raises(ValidationError, match="chwili"):
        OcenaKryterium.model_validate(dane)


_POSTAC_LIMITU: dict[Relacja, str] = {
    "NIE_WIECEJ": "wartosc",
    "NIE_MNIEJ": "wartosc",
    "PASMO": "pasmo",
    "OBWIEDNIA_DOLNA": "obwiednia",
    "OBWIEDNIA_GORNA": "obwiednia",
}
_LIMITY_POSTACI: dict[str, Relacja] = {
    "wartosc": "NIE_WIECEJ",
    "pasmo": "PASMO",
    "obwiednia": "OBWIEDNIA_DOLNA",
}


@pytest.mark.parametrize(
    "relacja, postac_obca",
    [
        (relacja, postac)
        for relacja in f.RELACJE_LICZBOWE
        for postac in _LIMITY_POSTACI
        if postac != _POSTAC_LIMITU[relacja]
    ],
)
def test_postac_limitu_pasuje_do_relacji(relacja: Relacja, postac_obca: str) -> None:
    """Relacja × każda obca postać limitu: rekord z limitem innej postaci jest odrzucany."""
    obcy = f.limit(_LIMITY_POSTACI[postac_obca])
    assert obcy is not None
    dane = _zrzut(f.ocena(relacja))
    dane["limit"] = _zrzut(obcy)
    with pytest.raises(ValidationError, match="postać limitu"):
        OcenaKryterium.model_validate(dane)


@pytest.mark.parametrize("relacja", f.RELACJE_LICZBOWE)
def test_jednostka_wyniku_rozna_od_limitu_jest_bledem(relacja: str) -> None:
    dane = _zrzut(f.ocena(relacja))
    dane["wynik"]["wartosc"]["jednostka"] = "kV"
    with pytest.raises(ValidationError, match="konwersji"):
        OcenaKryterium.model_validate(dane)


@pytest.mark.parametrize("metoda", ["SYMULACJA", "OBLICZENIE"])
def test_zakres_nie_szerszy_niz_z_obliczenie_wymaga_dziedziny_fizyki(metoda: MetodaDowodu) -> None:
    """Wynik obliczenia bez dziedziny fizyki w zakresie ważności byłby opisany szerzej niż
    jest (§0 — trzecia nierówność): rekord jest odrzucany."""
    dowod_oceny = (
        f.dowod_symulacji()
        if metoda == "SYMULACJA"
        else f.dowod(metoda="OBLICZENIE", poziom=EvidenceTier.VALIDATED_SIMULATION)
    )
    with pytest.raises(ValidationError, match="dziedziny fizyki"):
        f.ocena(
            dowod_oceny=dowod_oceny,
            metoda_wyniku=metoda,
            u=0.5,
            zakres_oceny=f.zakres(rodzaj=None),
        )


@pytest.mark.parametrize("metoda", ["SYMULACJA", "OBLICZENIE"])
def test_wynik_obliczenia_wymaga_sladu(metoda: MetodaDowodu) -> None:
    dowod_oceny = f.dowod_symulacji() if metoda == "SYMULACJA" else f.dowod(metoda="OBLICZENIE")
    dane = _zrzut(f.ocena(dowod_oceny=dowod_oceny, metoda_wyniku=metoda, u=0.5))
    dane["slad"] = []
    with pytest.raises(ValidationError, match="śladu"):
        OcenaKryterium.model_validate(dane)


@pytest.mark.parametrize("jakosc", [FieldQuality.ESTIMATED, FieldQuality.SYSTEM_DEFAULT])
def test_parametr_sieci_bez_zrodla_musi_byc_dana_przyjeta(jakosc: FieldQuality) -> None:
    """Założona moc zwarciowa sieci w zakresie ważności, a status danych ZWALIDOWANE —
    kompletność dowodu przemilczałaby założenie; rekord jest odrzucany (K i W)."""
    parametr = f.dana_przyjeta(jakosc=jakosc)
    with pytest.raises(ValidationError, match="danych przyjętych"):
        f.ocena(zakres_oceny=f.zakres(parametry_sieci=[parametr]))
    zgodny = f.ocena(
        zakres_oceny=f.zakres(parametry_sieci=[parametr]),
        dowod_oceny=f.dowod(dane=StatusDanych(stan="UNVALIDATED_INPUT", dane_przyjete=(parametr,))),
    )
    assert zgodny.kompletnosc_dowodu == "NIEPELNY"
    with pytest.raises(ValidationError, match="danych przyjętych"):
        WynikWymagania.model_validate(
            {
                **_zrzut(f.wymaganie([f.ocena()])),
                "zakres_waznosci": _zrzut(f.zakres(rodzaj=None, parametry_sieci=[parametr])),
            }
        )


def test_parametr_sieci_z_karty_nie_jest_dana_przyjeta() -> None:
    parametr = f.dana_przyjeta(jakosc=FieldQuality.DATASHEET, powod="z warunków przyłączenia")
    rekord = f.ocena(zakres_oceny=f.zakres(parametry_sieci=[parametr]))
    assert rekord.kompletnosc_dowodu == "PELNY"


# ---------------------------------------------------------------------------
# Struktura rekordu W
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("puste", [True, False])
@pytest.mark.parametrize("sposob", ["BRAK_METODY", "DEKLARACJA"])
@pytest.mark.parametrize("dotyczy", [True, False])
def test_puste_skladowe_wtedy_i_tylko_wtedy_gdy_brak_metody_albo_nie_dotyczy(
    dotyczy: bool, sposob: MetodaDowodu, puste: bool
) -> None:
    oceny = [] if puste else [f.ocena(dotyczy=dotyczy)]
    dozwolone = (not dotyczy) or sposob == "BRAK_METODY"
    if dozwolone == puste:
        assert f.wymaganie(oceny, sposob=sposob, dotyczy=dotyczy).oceny_skladowe == tuple(oceny)
    else:
        with pytest.raises(ValidationError, match="puste wtedy i tylko wtedy"):
            f.wymaganie(oceny, sposob=sposob, dotyczy=dotyczy)


def test_powtorzony_identyfikator_skladowej_jest_odrzucany() -> None:
    with pytest.raises(ValidationError, match="powtórzony"):
        f.wymaganie([f.ocena(kryterium_id="a"), f.ocena("PASMO", kryterium_id="a")])


@pytest.mark.parametrize(
    "sposob, pokrycie, dotyczy, fragment",
    [
        ("DEKLARACJA", "PELNE", True, "nie ma programu badań"),
        ("DEKLARACJA", "CZESCIOWE", True, "nie ma programu badań"),
        ("CERTYFIKAT", "PELNE", True, "nie ma programu badań"),
        ("SYMULACJA", "NIE_DOTYCZY", True, "biegami symulacji"),
        ("BRAK_METODY", "PELNE", False, "nie dotyczy przedmiotu"),
    ],
)
def test_pokrycie_programu_spojne_ze_sposobem_wykazania(
    sposob: MetodaDowodu, pokrycie: PokrycieProgramu, dotyczy: bool, fragment: str
) -> None:
    oceny = [] if (sposob == "BRAK_METODY" or not dotyczy) else [f.ocena()]
    with pytest.raises(ValidationError, match=fragment):
        f.wymaganie(oceny, sposob=sposob, pokrycie=pokrycie, dotyczy=dotyczy)


def test_pokrycie_programu_przy_symulacji_w_skladowej_dowodu_laczonego() -> None:
    """Symulacja w składniku dowodu łączonego to też wykazywanie biegami — pokrycie wymagane."""
    skladowa = f.ocena(dowod_oceny=f.dowod_symulacji(), metoda_wyniku="SYMULACJA", u=0.5)
    with pytest.raises(ValidationError, match="biegami symulacji"):
        f.wymaganie([skladowa], sposob="DOWOD_LACZONY", pokrycie="NIE_DOTYCZY")


def test_zakres_nie_szerszy_niz_z_agregat_nie_gubi_wykluczen() -> None:
    """§0, trzecia nierówność na poziomie W: agregat pomijający wykluczenia składnika opisałby
    wynik szerzej niż zakres składnika."""
    rekord = f.wymaganie([f.ocena()])
    dane = _zrzut(rekord)
    dane["zakres_waznosci"]["wykluczenia"] = []
    with pytest.raises(ValidationError, match="pomija wykluczenia"):
        WynikWymagania.model_validate(dane)


def test_zakres_nie_szerszy_niz_z_agregat_nie_zmienia_dziedziny() -> None:
    rekord = f.wymaganie([f.ocena()])
    dane = _zrzut(rekord)
    dane["zakres_waznosci"]["rodzaj_analizy"] = "POWER_FLOW"
    with pytest.raises(ValidationError, match="różnych dziedzin"):
        WynikWymagania.model_validate(dane)


# ---------------------------------------------------------------------------
# Predykaty parami: pola wyprowadzone regułą nie dają się podmienić
# ---------------------------------------------------------------------------


def _etykieta_dla(
    status: StatusWerdyktu, kompletnosc: str, poziom: PoziomRekordu
) -> dict[str, Any]:
    """Etykieta słownika dopasowana do podmienionego statusu (para SPELNIA + NIEPELNY nie ma
    etykiety na poziomie W — wtedy etykieta dowodu pełnego)."""
    niepelna = kompletnosc == "NIEPELNY" and poziom == "K"
    kompletnosc_etykiety: KompletnoscDowodu = "NIEPELNY" if niepelna else "PELNY"
    return etykieta(status, kompletnosc_etykiety, poziom).model_dump(mode="json")


def _poziom(rekord: OcenaKryterium | WynikWymagania) -> PoziomRekordu:
    return "K" if isinstance(rekord, OcenaKryterium) else "W"


@pytest.mark.parametrize(
    "nazwa, rekord, status",
    [
        (nazwa, rekord, status)
        for nazwa, rekord in REKORDY_K + REKORDY_W
        for status in STATUSY
        if status != rekord.status_maszynowy
    ],
    ids=lambda x: x if isinstance(x, str) else "",
)
def test_podmieniony_status_jest_odrzucany(
    nazwa: str, rekord: OcenaKryterium | WynikWymagania, status: StatusWerdyktu
) -> None:
    """Każdy rekord katalogu × każdy inny status: rekord ze statusem różnym od statusu reguły
    (z etykietą dopasowaną do podmienionego statusu) jest odrzucany. To pokrywa „brak danych ≠
    spełnia", „brak certyfikatu ≠ spełnia" (W: BRAK_METODY), T4 (limit NIEUSTALONE ≠ SPELNIA /
    NIE_SPELNIA), T5 (brak biegu ≠ SPELNIA; W: SPELNIA tylko z dowodem PEŁNYM) i T11."""
    dane = _zrzut(rekord)
    dane["status_maszynowy"] = status
    dane["etykieta"] = _etykieta_dla(status, dane["kompletnosc_dowodu"], _poziom(rekord))
    with pytest.raises(ValidationError, match="status"):
        _odtworz(_typ(rekord), dane)


@pytest.mark.parametrize(
    "nazwa, rekord",
    [(n, r) for n, r in REKORDY_K if r.kompletnosc_dowodu == "NIEPELNY"]
    + [(n, r) for n, r in REKORDY_W if r.kompletnosc_dowodu == "NIEPELNY"],
    ids=lambda x: x if isinstance(x, str) else "",
)
def test_podmieniona_kompletnosc_pelna_jest_odrzucana(
    nazwa: str, rekord: OcenaKryterium | WynikWymagania
) -> None:
    """„UNVALIDATED_MODEL ≠ pełny dowód" i „dane przyjęte ≠ pełny dowód": rekord niepełny
    przepisany na PELNY (bez powodów) jest odrzucany — K i W."""
    dane = _zrzut(rekord)
    dane["kompletnosc_dowodu"] = "PELNY"
    dane["powody_niepelnosci"] = []
    with pytest.raises(ValidationError, match="kompletność"):
        _odtworz(_typ(rekord), dane)


def test_unvalidated_model_skladowej_nie_daje_pelnego_dowodu_wymagania() -> None:
    skladowa = f.ocena(
        dowod_oceny=f.dowod_symulacji(status_modelu="UNVALIDATED_MODEL"),
        metoda_wyniku="SYMULACJA",
        u=0.5,
    )
    rekord = f.wymaganie([skladowa], sposob="SYMULACJA")
    assert rekord.kompletnosc_dowodu == "NIEPELNY"
    assert rekord.status_maszynowy == "BRAK_DOWODU"
    dane = _zrzut(rekord)
    dane.update(
        kompletnosc_dowodu="PELNY",
        powody_niepelnosci=[],
        status_maszynowy="SPELNIA",
        etykieta=_etykieta_dla("SPELNIA", "PELNY", "W"),
    )
    with pytest.raises(ValidationError):
        WynikWymagania.model_validate(dane)


@pytest.mark.parametrize(
    "nazwa, rekord",
    [(n, r) for n, r in REKORDY_K if r.margines is not None and r.margines.wartosc is not None],
    ids=lambda x: x if isinstance(x, str) else "",
)
def test_podmieniony_margines_jest_odrzucany(nazwa: str, rekord: OcenaKryterium) -> None:
    """Margines niezgodny z wynikiem i limitem (np. dodatni przy przekroczeniu) nie przechodzi —
    status liczony z marginesu nie może rozjechać się z wynikiem."""
    dane = _zrzut(rekord)
    stary = dane["margines"]
    nowa_wartosc = -stary["wartosc"]["wartosc"] if stary["wartosc"]["wartosc"] else 1.0
    dane["margines"]["wartosc"]["wartosc"] = nowa_wartosc
    if stary["skala"] is not None:
        dane["margines"]["wzgledny"] = nowa_wartosc / stary["skala"]["wartosc"]
    with pytest.raises(ValidationError, match="margines"):
        OcenaKryterium.model_validate(dane)


@pytest.mark.parametrize(
    "nazwa, rekord", REKORDY_K + REKORDY_W, ids=[n for n, _ in REKORDY_K + REKORDY_W]
)
def test_podmieniona_etykieta_jest_odrzucana(
    nazwa: str, rekord: OcenaKryterium | WynikWymagania
) -> None:
    dane = _zrzut(rekord)
    dane["etykieta"] = {"etykieta_pl": "Spełnia", "semantyka": "pozytywna"}
    with pytest.raises(ValidationError, match="etykieta"):
        _odtworz(_typ(rekord), dane)


@pytest.mark.parametrize(
    "nazwa, rekord", REKORDY_K + REKORDY_W, ids=[n for n, _ in REKORDY_K + REKORDY_W]
)
def test_zastrzezenia_wylacznie_z_pol_rekordu(
    nazwa: str, rekord: OcenaKryterium | WynikWymagania
) -> None:
    """Zastrzeżenie dopisane ręcznie albo usunięte → rekord odrzucony (zero tekstu spoza pól)."""
    dane = _zrzut(rekord)
    dane["wyjasnienie"]["zastrzezenia"] = [*dane["wyjasnienie"]["zastrzezenia"], "Ręczny dopisek."]
    with pytest.raises(ValidationError, match="zastrzeżenia"):
        _odtworz(_typ(rekord), dane)
    if rekord.wyjasnienie.zastrzezenia:
        dane = _zrzut(rekord)
        dane["wyjasnienie"]["zastrzezenia"] = dane["wyjasnienie"]["zastrzezenia"][1:]
        with pytest.raises(ValidationError, match="zastrzeżenia"):
            _odtworz(_typ(rekord), dane)


@pytest.mark.parametrize(
    "nazwa, rekord",
    [(n, r) for n, r in REKORDY_K + REKORDY_W if r.wyjasnienie.czego_brakuje],
    ids=lambda x: x if isinstance(x, str) else "",
)
def test_brak_nazwany_regula_nie_daje_sie_usunac(
    nazwa: str, rekord: OcenaKryterium | WynikWymagania
) -> None:
    dane = _zrzut(rekord)
    dane["wyjasnienie"]["czego_brakuje"] = dane["wyjasnienie"]["czego_brakuje"][1:]
    with pytest.raises(ValidationError, match="czego_brakuje"):
        _odtworz(_typ(rekord), dane)


@pytest.mark.parametrize(
    "nazwa, rekord",
    [(n, r) for n, r in REKORDY_K + REKORDY_W if r.status_maszynowy != "SPELNIA"],
    ids=lambda x: x if isinstance(x, str) else "",
)
def test_przyczyna_obowiazkowa_poza_spelnia(
    nazwa: str, rekord: OcenaKryterium | WynikWymagania
) -> None:
    dane = _zrzut(rekord)
    dane["wyjasnienie"]["przyczyna_pl"] = None
    with pytest.raises(ValidationError, match="przyczyn"):
        _odtworz(_typ(rekord), dane)


def test_t8_podmienione_kryteria_naruszone_sa_odrzucane() -> None:
    rekord = dict(REKORDY_W)["nie_spelnia"]
    dane = _zrzut(rekord)
    dane["kryteria_naruszone"] = []
    with pytest.raises(ValidationError, match="naruszone"):
        WynikWymagania.model_validate(dane)


def test_t8_wyjasnienie_nienazywajace_naruszenia_jest_odrzucane() -> None:
    rekord = dict(REKORDY_W)["nie_spelnia"]
    dane = _zrzut(rekord)
    dane["wyjasnienie"]["zdanie_pl"] = "Wymaganie nie jest spełnione."
    with pytest.raises(ValidationError, match="T8"):
        WynikWymagania.model_validate(dane)


def test_t9_podmienione_kryterium_najblizej_granicy_jest_odrzucane() -> None:
    rekord = dict(REKORDY_W)["spelnia"]
    assert rekord.kryterium_najblizej_granicy == "b"
    dane = _zrzut(rekord)
    dane["kryterium_najblizej_granicy"] = "a"
    with pytest.raises(ValidationError, match="najbliżej granicy"):
        WynikWymagania.model_validate(dane)


def test_t9_przyczyna_nienazywajaca_kryterium_najblizej_granicy_jest_odrzucana() -> None:
    rekord = dict(REKORDY_W)["spelnia"]
    dane = _zrzut(rekord)
    dane["wyjasnienie"]["przyczyna_pl"] = "Wymaganie spełnione."
    with pytest.raises(ValidationError, match="najbliżej granicy"):
        WynikWymagania.model_validate(dane)


@pytest.mark.parametrize(
    "nazwa, rekord", REKORDY_K + REKORDY_W, ids=[n for n, _ in REKORDY_K + REKORDY_W]
)
def test_rekord_poprawny_przechodzi_odczyt_z_json(
    nazwa: str, rekord: OcenaKryterium | WynikWymagania
) -> None:
    """Rekord zbudowany konstruktorem przechodzi tę samą walidację przy odczycie z JSON."""
    assert _odtworz(_typ(rekord), _zrzut(rekord)) == rekord


# ---------------------------------------------------------------------------
# Zamrożenie
# ---------------------------------------------------------------------------


def test_rekord_jest_zamrozony_i_bez_pol_dodatkowych() -> None:
    rekord = f.ocena()
    with pytest.raises(ValidationError, match="frozen"):
        BaseModel.__setattr__(rekord, "status_maszynowy", "NIE_SPELNIA")
    assert isinstance(rekord.wyjasnienie.czego_brakuje, tuple)
    assert isinstance(rekord.slad, tuple)
    with pytest.raises(ValidationError, match="extra"):
        OcenaKryterium.model_validate({**_zrzut(rekord), "werdykt": "PASS"})


# ---------------------------------------------------------------------------
# Granice pakietu: liść, zero zakazanych tokenów, zero Any w sygnaturach publicznych
# ---------------------------------------------------------------------------

_ZAKAZANE_KORZENIE = {
    "analysis",
    "application",
    "network_model",
    "api",
    "catalog",
    "enm",
    "solver_input",
    "domain",
}


def _moduly_importowane(sciezka: Path) -> list[str]:
    drzewo = ast.parse(sciezka.read_text(encoding="utf-8"))
    moduly: list[str] = []
    for wezel in ast.walk(drzewo):
        if isinstance(wezel, ast.Import):
            moduly.extend(alias.name for alias in wezel.names)
        elif isinstance(wezel, ast.ImportFrom) and wezel.module is not None:
            moduly.append(wezel.module)
    return moduly


@pytest.mark.parametrize("plik", sorted(KATALOG_PAKIETU.glob("*.py")), ids=lambda p: p.name)
def test_pakiet_jest_lisciem(plik: Path) -> None:
    """Importy bezpośrednie (także wewnątrz funkcji): wyłącznie stdlib, pydantic i własne moduły
    pakietu (osie proweniencji z ``werdykt.proweniencja``) — nic z warstw aplikacji, domeny,
    wejścia solverów ani solverów (karta A2 pkt 2)."""
    for modul in _moduly_importowane(plik):
        korzen = modul.split(".")[0]
        dozwolony = korzen in sys.stdlib_module_names or korzen == "pydantic" or korzen == "werdykt"
        assert dozwolony, f"{plik.name}: import {modul} spoza granic pakietu-liścia"
        assert korzen not in _ZAKAZANE_KORZENIE


def test_pakiet_jest_lisciem_przechodnio() -> None:
    """Import pakietu w świeżym interpreterze nie ładuje ŻADNEGO modułu warstw produktu —
    także pośrednio (``solver_input/__init__.py`` ładuje budowniczego wejścia solverów razem
    z ``domain`` i ``network_model``, więc sam import ``solver_input.provenance`` złamałby
    liść)."""
    korzenie = tuple(sorted(_ZAKAZANE_KORZENIE))
    skrypt = (
        "import sys, werdykt; "
        f"print(sorted(m for m in sys.modules if m.split('.')[0] in {korzenie!r}))"
    )
    wynik = subprocess.run(
        [sys.executable, "-c", skrypt],
        capture_output=True,
        text=True,
        check=True,
        env={**os.environ, "PYTHONPATH": str(KATALOG_PAKIETU.parent)},
    )
    assert wynik.stdout.strip() == "[]", wynik.stdout


_ZAKAZANE_TOKENY = (
    r"\btodo\b",
    r"\bplaceholder",
    r"\bmock",
    r"\bfallback",
    r"\blegacy\b",
    r"\bdebug",
    r"coming soon",
    r"not implemented",
    r"type:\s*ignore",
)


@pytest.mark.parametrize("plik", sorted(KATALOG_PAKIETU.glob("*.py")), ids=lambda p: p.name)
def test_pakiet_bez_zakazanych_tokenow(plik: Path) -> None:
    tekst = plik.read_text(encoding="utf-8").lower()
    for wzorzec in _ZAKAZANE_TOKENY:
        assert re.search(wzorzec, tekst) is None, f"{plik.name}: token {wzorzec}"


def _zawiera_any(adnotacja: object) -> bool:
    if adnotacja is Any:
        return True
    return any(_zawiera_any(arg) for arg in typing.get_args(adnotacja))


@pytest.mark.parametrize("nazwa", sorted(werdykt.__all__))
def test_publiczne_sygnatury_bez_any(nazwa: str) -> None:
    obiekt = getattr(werdykt, nazwa)
    if isinstance(obiekt, type) and issubclass(obiekt, BaseModel):
        for pole, info in obiekt.model_fields.items():
            assert not _zawiera_any(info.annotation), f"{nazwa}.{pole}"
    elif isinstance(obiekt, type) and dataclasses.is_dataclass(obiekt):
        for pole, adnotacja in typing.get_type_hints(obiekt).items():
            assert not _zawiera_any(adnotacja), f"{nazwa}.{pole}"
    elif inspect.isfunction(obiekt):
        for parametr, adnotacja in typing.get_type_hints(obiekt).items():
            assert not _zawiera_any(adnotacja), f"{nazwa}({parametr})"
    elif isinstance(obiekt, tuple):
        assert all(isinstance(element, BaseModel) for element in obiekt), nazwa
    elif isinstance(obiekt, type) and issubclass(obiekt, enum.Enum):
        assert all(isinstance(czlon.value, str) for czlon in obiekt), nazwa
    elif isinstance(obiekt, str):
        assert obiekt.strip(), nazwa
    else:
        assert typing.get_origin(obiekt) is typing.Literal, nazwa


def test_poziomy_dowodu_i_twierdzenia_z_proweniencji() -> None:
    """Osie dowodowe mają JEDNĄ definicję (``werdykt.proweniencja``), a
    ``solver_input.provenance`` re-eksportuje TE SAME obiekty klas — tożsamość typów jest
    zachowana dla wszystkich konsumentów."""
    from solver_input import provenance

    pola = werdykt.StatusDowodu.model_fields
    assert pola["poziom"].annotation is EvidenceTier
    assert pola["rodzaj_twierdzenia"].annotation is ClaimKind
    assert provenance.ClaimKind is ClaimKind is werdykt.ClaimKind
    assert provenance.EvidenceTier is EvidenceTier is werdykt.EvidenceTier
    assert provenance.FieldQuality is FieldQuality is werdykt.FieldQuality
    assert provenance.BRAK_DOWODU_PL is werdykt.BRAK_DOWODU_PL
    assert ClaimKind.__module__ == EvidenceTier.__module__ == FieldQuality.__module__
    assert ClaimKind.__module__ == "werdykt.proweniencja"


def test_osie_proweniencji_zachowuja_wartosci_i_etykiety() -> None:
    """Przeniesienie definicji nie zmienia wartości ani etykiet PL; nowy członek
    ``STATIC_CALCULATION`` ma etykietę „obliczenie_statyczne"."""
    assert {c.value: c.label_pl for c in FieldQuality} == {
        "DATASHEET": "karta_techniczna",
        "ESTIMATED": "oszacowane",
        "SYSTEM_DEFAULT": "domyslne_techniczne",
    }
    assert {c.value: (c.label_pl, c.regulatory_evidence_eligible) for c in EvidenceTier} == {
        "VALIDATED_SIMULATION": ("symulacja_zwalidowana", True),
        "DECLARATION": ("deklaracja_wnioskodawcy", False),
        "UNVALIDATED_MODEL": ("model_niezwalidowany", False),
        "NOT_SIMULATED": ("brak_symulacji", False),
    }
    assert {c.value: c.label_pl for c in ClaimKind} == {
        "DYNAMIC_PERFORMANCE": "zachowanie_dynamiczne",
        "DECLARED_CONFIGURATION": "konfiguracja_zadeklarowana",
        "STATIC_CALCULATION": "obliczenie_statyczne",
    }
    assert werdykt.BRAK_DOWODU_PL == "BRAK WYSTARCZAJĄCEGO DOWODU SPEŁNIENIA WYMAGANIA"
