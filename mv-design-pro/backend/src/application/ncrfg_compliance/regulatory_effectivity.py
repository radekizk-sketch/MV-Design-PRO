"""Deterministyczna ocena WYŁĄCZNIE dat zastosowania WOS/WiPWC/PTPiREE.

Zasady: WOS 2025 wg URE z 15.05.2025; terminy typu A i B/C/D;
PTPiREE Procedura v3.0 wg daty złożenia właściwego oświadczenia;
WiPWC 1.2 akceptowane do 31.12.2026, 1.3 od 01.11.2024.
Źródła URL w odpowiedzi. To NIE jest solver wymagań ani certyfikacja.
Brak danych -> NIEUSTALONE, bez domniemania "stary WOS".
"""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from enm.wydarzenia_regulacyjne import WydarzeniaRegulacyjne

WOS_BCD = date(2025, 12, 1)
WOS_A = date(2027, 1, 1)
PTPIREE_V3 = date(2026, 1, 1)
WIPWC_13_FROM = date(2024, 11, 1)
WIPWC_12_TO = date(2026, 12, 31)

URL_URE = (
    "https://www.ure.gov.pl/pl/urzad/informacje-ogolne/aktualnosci/"
    "12682,Prezes-URE-zatwierdzil-nowe-Wymogi-ogolnego-stosowania-"
    "dla-przylaczania-jednoste.html"
)
URL_PSE = "https://www.pse.pl/kodeksy/rfg"
URL_PTPIREE_TEST = "https://ptpiree.pl/kodeksy-sieci/procedura-testowania/"
URL_PTPIREE_WIPWC = "https://ptpiree.pl/kodeksy-sieci/warunki-i-procedury/"

Typ = Literal["A", "B", "C", "D"]
Stan = Literal["USTALONO", "NIEUSTALONE", "WYMAGA_OCENY_ART4"]
Edycja = Literal["2018", "2025"]


class OcenaWydania(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    status: Stan
    wydanie: str | None
    powod_pl: str
    podstawa_url: str
    zakres: str = "MWE"
    dane_brakujace: tuple[str, ...] = ()


class OcenaPodstawRegulacyjnych(BaseModel):
    """Dane interpretacyjne; użycie w produkcyjnej zgodności wymaga pinning i akceptacji."""

    model_config = ConfigDict(frozen=True, extra="forbid")
    typ_mwe: Typ
    wos: OcenaWydania
    ptpiree: OcenaWydania
    nie_aktywowane_w_solverze: bool = True
    ostrzezenie_pl: str = (
        "To rozpoznanie wydań i braków danych, NIE potwierdzenie spełnienia "
        "NC RfG ani zmiana obecnego profilu solvera."
    )


class WejscieOcenyPodstaw(BaseModel):
    model_config = ConfigDict(extra="forbid")
    typ_mwe: Typ
    modul_istniejacy: bool | None = Field(default=None, strict=True)
    wydarzenia: WydarzeniaRegulacyjne | None = None


def _brak(powod: str, url: str, *braki: str, zakres: str = "MWE") -> OcenaWydania:
    return OcenaWydania(
        status="NIEUSTALONE",
        wydanie=None,
        powod_pl=powod,
        podstawa_url=url,
        zakres=zakres,
        dane_brakujace=tuple(braki),
    )


def _ustal(wydanie: str, powod: str, url: str, *, zakres: str = "MWE") -> OcenaWydania:
    return OcenaWydania(
        status="USTALONO", wydanie=wydanie, powod_pl=powod,
        podstawa_url=url, zakres=zakres,
    )


def wybierz_wos(
    typ: Typ, wydarzenia: WydarzeniaRegulacyjne | None,
    modul_istniejacy: bool | None = None,
) -> OcenaWydania:
    """Ocena źródła stosowalności, nie wstrzyknięcie liczb do profilu NC RfG."""
    e = wydarzenia or WydarzeniaRegulacyjne()
    if modul_istniejacy is None:
        return _brak(
            "Nie ustalono, czy MWE jest nowy czy istniejący w rozumieniu art. 4 NC RfG.",
            URL_URE, "modul_istniejacy"
        )
    if modul_istniejacy is True:
        if typ in ("C", "D"):
            if e.znaczna_zmiana_umowy is True:
                if e.data_zgloszenia_modernizacji is None:
                    return _brak(
                        "Modernizacja znacząca C/D — nie wskazano daty zgłoszenia.",
                        URL_URE, "data_zgloszenia_modernizacji",
                        zakres="ZAKRES_MODERNIZACJI",
                    )
                if e.data_zgloszenia_modernizacji >= WOS_BCD:
                    return _ustal(
                        "2025", "WOS 2025 w zakresie zgłoszonej znaczącej modernizacji C/D.",
                        URL_URE, zakres="ZAKRES_MODERNIZACJI",
                    )
                return _brak(
                    "Zgłoszenie modernizacji sprzed 01.12.2025 — "
                    "wymagana ocena art. 4 oraz wcześniejszej podstawy.",
                    URL_URE, zakres="ZAKRES_MODERNIZACJI",
                )
            return OcenaWydania(
                status="WYMAGA_OCENY_ART4", wydanie=None, podstawa_url=URL_URE,
                zakres="MWE_ISTNIEJACY",
                powod_pl="Istniejący moduł C/D: brak potwierdzenia znaczącej zmiany umowy "
                "lub jej zakresu; nie wolno narzucać WOS nowej instalacji.",
                dane_brakujace=("znaczna_zmiana_umowy",),
            )
        return OcenaWydania(
            status="WYMAGA_OCENY_ART4", wydanie=None, podstawa_url=URL_URE,
            zakres="MWE_ISTNIEJACY",
            powod_pl="Istniejący moduł — ocenić art. 4 i indywidualne warunki przyłączenia.",
        )

    if typ == "A":
        daty = (e.data_wydania_warunkow, e.data_zgloszenia_przylaczenia)
        if any(d is not None and d >= WOS_A for d in daty):
            return _ustal("2025", "Typ A: warunki lub zgłoszenie od 01.01.2027.", URL_URE)
        if None in daty:
            return _brak(
                "Dla typu A brak którejś daty uniemożliwia wykluczenie WOS 2025.",
                URL_URE,
                *(
                    n for n, d in (
                        ("data_wydania_warunkow", daty[0]),
                        ("data_zgloszenia_przylaczenia", daty[1])
                    ) if d is None
                ),
            )
        return _ustal("2018", "Typ A: obie daty sprzed 01.01.2027.", URL_URE)

    d = e.data_wydania_warunkow
    if d is None:
        return _brak(
            "Typ B/C/D: brak daty wydania warunków przyłączenia.",
            URL_URE, "data_wydania_warunkow",
        )
    if d >= WOS_BCD:
        return _ustal("2025", "Typ B/C/D: warunki wydane od 01.12.2025.", URL_URE)
    return _ustal("2018", "Typ B/C/D: warunki wydane przed 01.12.2025.", URL_URE)


def wybierz_procedure(
    typ: Typ, wydarzenia: WydarzeniaRegulacyjne | None
) -> OcenaWydania:
    e = wydarzenia or WydarzeniaRegulacyjne()
    if typ == "D":
        data = e.data_oswiadczenia_gotowosci_przyjecia_napiecia
        pole = "data_oswiadczenia_gotowosci_przyjecia_napiecia"
    else:
        data = e.data_oswiadczenia_gotowosci_przylaczenia
        pole = "data_oswiadczenia_gotowosci_przylaczenia"
    if data is None:
        return _brak(
            "Brak daty złożenia właściwego oświadczenia do wyboru procedury PTPiREE.",
            URL_PTPIREE_TEST, pole,
        )
    if data >= PTPIREE_V3:
        return _ustal("3.0", "Oświadczenie złożone od 01.01.2026.", URL_PTPIREE_TEST)
    return _brak(
        "Oświadczenie sprzed 01.01.2026: trzeba zweryfikować starszą "
        "procedurę i zasady przejściowe (brak zweryfikowanego starszego wydania).",
        URL_PTPIREE_TEST,
    )


def ocen_podstawy(wejscie: WejscieOcenyPodstaw) -> OcenaPodstawRegulacyjnych:
    return OcenaPodstawRegulacyjnych(
        typ_mwe=wejscie.typ_mwe,
        wos=wybierz_wos(
            wejscie.typ_mwe, wejscie.wydarzenia, wejscie.modul_istniejacy
        ),
        ptpiree=wybierz_procedure(wejscie.typ_mwe, wejscie.wydarzenia),
    )
