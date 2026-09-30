"""Wycena: lista materiałowa, koszt cyklu życia, porównanie wariantów (karta W10-2a, OD-16).

Każda funkcja kosztowa czyta ceny WYŁĄCZNIE z cennika wersjonowanego (``catalog.cenniki``)
powiązanego z typem katalogowym po ``type_id``. Bez ceny potrzebnej do wyniku funkcja kończy
się odmową nazwaną ``BRAK_CENNIKA`` (``OdmowaBrakuCennika``) z listą ``type_id`` — nigdy cichym
zerem ani sumą częściową.

PREDYKAT Z JEDNEGO ŹRÓDŁA. Gotowość kosztów (``gotowosc_kosztow``, rekord dla toru W10-2)
i wykonanie (``wycen_liste_materialowa``, ``wycen_lcc``, ``porownaj_warianty``) wołają tę samą
funkcję ``braki_cennika`` — to, co gotowość nazywa brakiem, wykonanie odrzuca, i odwrotnie.

ZAKRES → wymagane ceny:
  * ``BOM`` — cena inwestycyjna (CAPEX) każdej pozycji;
  * ``LCC`` — CAPEX i koszt eksploatacji roczny (OPEX) każdej pozycji oraz cena energii strat,
    gdy analiza podaje niezerowe straty roczne;
  * porównanie wariantów — wymagania kryterium (CAPEX albo LCC) w KAŻDYM wariancie.
Pozycja bez typu katalogowego nie ma czego szukać w cenniku — jest brakiem nazwanym, nie zerem.
Cena w innej jednostce niż pozycja listy (np. „km” wobec „szt.”) nie wycenia pozycji.

Stan źródła ceny nie blokuje wyniku, zakazuje przemilczenia: wynik niesie najsłabszy stan
użytych cen i nazwy pozycji wycenionych ceną ``NIEUSTALONE``.

Warstwa aplikacji: zero arytmetyki kosztu poza sumą (mnożenia i dyskontowanie —
``network_model/pochodne/koszty.py``), zero fizyki.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Literal

from catalog.cenniki import Cennik, PozycjaCennika, najslabszy_stan
from network_model.odmowa_danych import OdmowaDanychError, OdmowaNazwana
from network_model.pochodne.koszty import (
    koszt_cyklu_zycia_pln,
    koszt_energii_strat_pln,
    koszt_pozycji_pln,
    wspolczynnik_wartosci_biezacej,
)
from werdykt.kontrakt import StanZrodla

KOD_BRAK_CENNIKA = "BRAK_CENNIKA"
ZakresKosztu = Literal["BOM", "LCC"]
PoleCeny = Literal["capex", "opex"]
_NAZWY_POL: dict[PoleCeny, str] = {"capex": "ceny inwestycyjnej", "opex": "kosztu eksploatacji"}
_NAZWY_ZAKRESOW: dict[ZakresKosztu, str] = {
    "BOM": "listy materiałowej",
    "LCC": "kosztu cyklu życia",
}

__all__ = [
    "KOD_BRAK_CENNIKA",
    "BrakiCennika",
    "GotowoscKosztow",
    "OdmowaBrakuCennika",
    "ParametryLcc",
    "PorownanieWariantow",
    "PozycjaDoWyceny",
    "WariantDoWyceny",
    "WycenaListy",
    "WynikLcc",
    "braki_cennika",
    "gotowosc_kosztow",
    "porownaj_warianty",
    "wycen_lcc",
    "wycen_liste_materialowa",
]


# ---------------------------------------------------------------------------
# Wejście
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PozycjaDoWyceny:
    """Pozycja listy materiałowej: nazwa dla projektanta, typ katalogowy, ilość w jednostce."""

    nazwa_pl: str
    type_id: str | None
    ilosc: float
    jednostka: str
    #: Nazwa typu katalogowego dla projektanta (z jednego źródła reguły nazwy pozycji
    #: katalogu, ``enm.nazwy_elementow``) — do zdania odmowy; ``None`` = zdanie bez typu.
    typ_nazwa_pl: str | None = None

    def __post_init__(self) -> None:
        if not math.isfinite(self.ilosc) or self.ilosc < 0.0:
            raise OdmowaDanychError(
                f"Pozycja {self.nazwa_pl}: ilość {self.ilosc} musi być nieujemną liczbą skończoną."
            )


@dataclass(frozen=True)
class ParametryLcc:
    """Jawne parametry analizy kosztu cyklu życia (bez domyślek)."""

    stopa_dyskontowa: float
    horyzont_lat: int
    straty_roczne_mwh: float

    def __post_init__(self) -> None:
        if not math.isfinite(self.stopa_dyskontowa) or self.stopa_dyskontowa < 0.0:
            raise OdmowaDanychError(
                f"Stopa dyskontowa {self.stopa_dyskontowa} musi być nieujemną liczbą skończoną."
            )
        if isinstance(self.horyzont_lat, bool) or not isinstance(self.horyzont_lat, int):
            raise OdmowaDanychError(
                "Horyzont analizy kosztu cyklu życia podaje się w pełnych latach."
            )
        if self.horyzont_lat < 1:
            raise OdmowaDanychError(f"Horyzont analizy {self.horyzont_lat} lat — wymagany ≥ 1 rok.")
        if not math.isfinite(self.straty_roczne_mwh) or self.straty_roczne_mwh < 0.0:
            raise OdmowaDanychError(
                f"Straty roczne {self.straty_roczne_mwh} MWh muszą być nieujemną liczbą skończoną."
            )


@dataclass(frozen=True)
class WariantDoWyceny:
    nazwa_pl: str
    pozycje: tuple[PozycjaDoWyceny, ...]


# ---------------------------------------------------------------------------
# Braki cennika — JEDEN predykat gotowości i wykonania
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class BrakiCennika:
    """Czego brakuje w cenniku do wyniku danego zakresu (pusty = można liczyć)."""

    zakres: ZakresKosztu
    wersja_cennika: str | None
    #: Pary (type_id, pole ceny) bez wartości w cenniku — posortowane.
    brakujace_ceny: tuple[tuple[str, PoleCeny], ...]
    #: Pary (type_id, jednostka pozycji) z ceną w innej jednostce — posortowane.
    niezgodne_jednostki: tuple[tuple[str, str], ...]
    #: Nazwy pozycji bez typu katalogowego — posortowane.
    pozycje_bez_typu: tuple[str, ...]
    #: Nazwy pozycji z typem bez potrzebnej ceny (do zdania dla projektanta) — posortowane.
    nazwy_bez_ceny: tuple[str, ...]
    #: Nazwy pozycji z ceną w innej jednostce — posortowane.
    nazwy_niezgodnej_jednostki: tuple[str, ...]
    brak_ceny_energii: bool

    @property
    def type_ids(self) -> tuple[str, ...]:
        return tuple(
            sorted(
                {type_id for type_id, _ in self.brakujace_ceny}
                | {type_id for type_id, _ in self.niezgodne_jednostki}
            )
        )

    @property
    def pusty(self) -> bool:
        return not (
            self.brakujace_ceny
            or self.niezgodne_jednostki
            or self.pozycje_bez_typu
            or self.brak_ceny_energii
        )

    def komunikat_pl(self, *, przedmiot: str | None = None) -> str:
        """Zdanie dla projektanta: czego brakuje i co zrobić (bez kodów maszynowych)."""
        przedmiot = przedmiot or _NAZWY_ZAKRESOW[self.zakres]
        cennik = (
            f"cennik {self.wersja_cennika}"
            if self.wersja_cennika is not None
            else "w repozytorium nie ma żadnego cennika"
        )
        czesci: list[str] = []
        if self.nazwy_bez_ceny:
            pola = " i ".join(sorted({_NAZWY_POL[pole] for _, pole in self.brakujace_ceny}))
            czesci.append(f"brak {pola} dla pozycji: {', '.join(self.nazwy_bez_ceny)}")
        if self.nazwy_niezgodnej_jednostki:
            czesci.append(
                "cena w innej jednostce niż pozycja listy dla pozycji: "
                + ", ".join(self.nazwy_niezgodnej_jednostki)
            )
        if self.pozycje_bez_typu:
            czesci.append(
                "pozycje bez typu katalogowego, których nie da się wycenić: "
                + ", ".join(self.pozycje_bez_typu)
            )
        if self.brak_ceny_energii:
            czesci.append("brak ceny energii do wyceny strat")
        return (
            f"Nie można wyznaczyć {przedmiot} ({cennik}): {'; '.join(czesci)}. "
            "Uzupełnij ceny nową wersją pliku cennika z jawnym źródłem każdej ceny."
        )

    def dane(self) -> dict[str, object]:
        return {
            "zakres": self.zakres,
            "wersja_cennika": self.wersja_cennika,
            "type_ids": list(self.type_ids),
            "brakujace_ceny": [list(para) for para in self.brakujace_ceny],
            "niezgodne_jednostki": [list(para) for para in self.niezgodne_jednostki],
            "pozycje_bez_typu": list(self.pozycje_bez_typu),
            "brak_ceny_energii": self.brak_ceny_energii,
        }


class OdmowaBrakuCennika(OdmowaNazwana):
    """Funkcja kosztowa bez potrzebnej ceny — odmowa ``BRAK_CENNIKA`` z listą ``type_id``."""

    def __init__(self, braki: BrakiCennika, *, przedmiot: str | None = None) -> None:
        super().__init__(
            braki.komunikat_pl(przedmiot=przedmiot), kod=KOD_BRAK_CENNIKA, dane=braki.dane()
        )
        self.braki = braki


def _nazwa_pozycji(pozycja: PozycjaDoWyceny) -> str:
    if pozycja.typ_nazwa_pl is None:
        return pozycja.nazwa_pl
    return f"{pozycja.nazwa_pl} (typ „{pozycja.typ_nazwa_pl}”)"


def _pola_wymagane(zakres: ZakresKosztu) -> tuple[PoleCeny, ...]:
    return ("capex",) if zakres == "BOM" else ("capex", "opex")


def braki_cennika(
    pozycje: Sequence[PozycjaDoWyceny],
    cennik: Cennik | None,
    zakres: ZakresKosztu,
    *,
    straty_roczne_mwh: float | None = None,
) -> BrakiCennika:
    """Jedyny predykat „czy cennik pozwala policzyć zakres” (gotowość = wykonanie)."""
    brakujace: set[tuple[str, PoleCeny]] = set()
    niezgodne: set[tuple[str, str]] = set()
    bez_typu: set[str] = set()
    nazwy_bez_ceny: set[str] = set()
    nazwy_niezgodne: set[str] = set()
    for pozycja in pozycje:
        if pozycja.type_id is None:
            bez_typu.add(pozycja.nazwa_pl)
            continue
        cena = cennik.pozycja(pozycja.type_id) if cennik is not None else None
        if cena is not None and cena.jednostka != pozycja.jednostka:
            niezgodne.add((pozycja.type_id, pozycja.jednostka))
            nazwy_niezgodne.add(_nazwa_pozycji(pozycja))
            continue
        for pole in _pola_wymagane(zakres):
            wartosc = (
                None if cena is None else (cena.capex_pln if pole == "capex" else cena.opex_pln_rok)
            )
            if wartosc is None:
                brakujace.add((pozycja.type_id, pole))
                nazwy_bez_ceny.add(_nazwa_pozycji(pozycja))
    brak_energii = (
        zakres == "LCC"
        and straty_roczne_mwh is not None
        and straty_roczne_mwh > 0.0
        and (cennik is None or cennik.energia_strat.cena_pln_mwh is None)
    )
    return BrakiCennika(
        zakres=zakres,
        wersja_cennika=None if cennik is None else cennik.wersja,
        brakujace_ceny=tuple(sorted(brakujace)),
        niezgodne_jednostki=tuple(sorted(niezgodne)),
        pozycje_bez_typu=tuple(sorted(bez_typu)),
        nazwy_bez_ceny=tuple(sorted(nazwy_bez_ceny)),
        nazwy_niezgodnej_jednostki=tuple(sorted(nazwy_niezgodne)),
        brak_ceny_energii=brak_energii,
    )


@dataclass(frozen=True)
class GotowoscKosztow:
    """Rekord gotowości kosztów toru W10-2: ``GOTOWE`` albo ``BRAK_CENNIKA`` z wyjaśnieniem."""

    status: Literal["GOTOWE", "BRAK_CENNIKA"]
    kod: str | None
    komunikat_pl: str
    braki: BrakiCennika

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "kod": self.kod,
            "komunikat_pl": self.komunikat_pl,
            **self.braki.dane(),
        }


def gotowosc_kosztow(
    pozycje: Sequence[PozycjaDoWyceny],
    cennik: Cennik | None,
    zakres: ZakresKosztu,
    *,
    straty_roczne_mwh: float | None = None,
) -> GotowoscKosztow:
    braki = braki_cennika(pozycje, cennik, zakres, straty_roczne_mwh=straty_roczne_mwh)
    if braki.pusty:
        return GotowoscKosztow(
            status="GOTOWE",
            kod=None,
            komunikat_pl=(
                f"Cennik {braki.wersja_cennika} zawiera wszystkie ceny potrzebne do "
                f"wyznaczenia {_NAZWY_ZAKRESOW[zakres]}."
            ),
            braki=braki,
        )
    return GotowoscKosztow(
        status="BRAK_CENNIKA", kod=KOD_BRAK_CENNIKA, komunikat_pl=braki.komunikat_pl(), braki=braki
    )


# ---------------------------------------------------------------------------
# Wynik
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PozycjaWyceniona:
    nazwa_pl: str
    type_id: str
    ilosc: float
    jednostka: str
    cena_jednostkowa: float
    koszt: float
    stan_zrodla: StanZrodla
    dokument_zrodla: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "nazwa_pl": self.nazwa_pl,
            "type_id": self.type_id,
            "ilosc": self.ilosc,
            "jednostka": self.jednostka,
            "cena_jednostkowa": self.cena_jednostkowa,
            "koszt": round(self.koszt, 2),
            "stan_zrodla": self.stan_zrodla,
            "dokument_zrodla": self.dokument_zrodla,
        }


@dataclass(frozen=True)
class Proweniencja:
    """Skąd pochodzą ceny wyniku: wersja, hash i data cennika, najsłabszy stan użytych cen."""

    wersja_cennika: str
    hash_cennika: str
    data_cen: str
    waluta: str
    stan_zrodla: StanZrodla
    pozycje_nieustalone: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "wersja_cennika": self.wersja_cennika,
            "hash_cennika": self.hash_cennika,
            "data_cen": self.data_cen,
            "waluta": self.waluta,
            "stan_zrodla": self.stan_zrodla,
            "pozycje_nieustalone": list(self.pozycje_nieustalone),
        }


@dataclass(frozen=True)
class WycenaListy:
    pozycje: tuple[PozycjaWyceniona, ...]
    suma_capex: float
    proweniencja: Proweniencja

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": "WYCENIONE",
            "pozycje": [pozycja.to_dict() for pozycja in self.pozycje],
            "suma_capex": round(self.suma_capex, 2),
            **self.proweniencja.to_dict(),
        }


@dataclass(frozen=True)
class WynikLcc:
    capex: float
    opex_roczny: float
    koszt_strat_roczny: float
    wspolczynnik_wartosci_biezacej: float
    lcc: float
    parametry: ParametryLcc
    proweniencja: Proweniencja

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": "WYCENIONE",
            "capex": round(self.capex, 2),
            "opex_roczny": round(self.opex_roczny, 2),
            "koszt_strat_roczny": round(self.koszt_strat_roczny, 2),
            "wspolczynnik_wartosci_biezacej": round(self.wspolczynnik_wartosci_biezacej, 6),
            "lcc": round(self.lcc, 2),
            "stopa_dyskontowa": self.parametry.stopa_dyskontowa,
            "horyzont_lat": self.parametry.horyzont_lat,
            "straty_roczne_mwh": self.parametry.straty_roczne_mwh,
            **self.proweniencja.to_dict(),
        }


@dataclass(frozen=True)
class WierszPorownania:
    nazwa_pl: str
    koszt: float
    roznica_do_najtanszego: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "nazwa_pl": self.nazwa_pl,
            "koszt": round(self.koszt, 2),
            "roznica_do_najtanszego": round(self.roznica_do_najtanszego, 2),
        }


@dataclass(frozen=True)
class PorownanieWariantow:
    kryterium: ZakresKosztu
    wiersze: tuple[WierszPorownania, ...]
    proweniencja: Proweniencja

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": "WYCENIONE",
            "kryterium": "CAPEX" if self.kryterium == "BOM" else "LCC",
            "wiersze": [wiersz.to_dict() for wiersz in self.wiersze],
            **self.proweniencja.to_dict(),
        }


# ---------------------------------------------------------------------------
# Wykonanie
# ---------------------------------------------------------------------------


def _wymagaj(
    pozycje: Sequence[PozycjaDoWyceny],
    cennik: Cennik | None,
    zakres: ZakresKosztu,
    *,
    straty_roczne_mwh: float | None = None,
    przedmiot: str | None = None,
) -> Cennik:
    braki = braki_cennika(pozycje, cennik, zakres, straty_roczne_mwh=straty_roczne_mwh)
    if not braki.pusty or cennik is None:
        raise OdmowaBrakuCennika(braki, przedmiot=przedmiot)
    return cennik


def _cena(cennik: Cennik, pozycja: PozycjaDoWyceny) -> PozycjaCennika:
    assert pozycja.type_id is not None  # wykluczone przez braki_cennika
    cena = cennik.pozycja(pozycja.type_id)
    assert cena is not None  # wykluczone przez braki_cennika
    return cena


def _proweniencja(
    cennik: Cennik, pozycje: Sequence[PozycjaDoWyceny], *, z_energia: bool = False
) -> Proweniencja:
    stany: list[StanZrodla] = []
    nieustalone: set[str] = set()
    for pozycja in pozycje:
        stan = _cena(cennik, pozycja).zrodlo.status
        stany.append(stan)
        if stan == "NIEUSTALONE":
            nieustalone.add(pozycja.nazwa_pl)
    if z_energia:
        stany.append(cennik.energia_strat.zrodlo.status)
        if cennik.energia_strat.zrodlo.status == "NIEUSTALONE":
            nieustalone.add("cena energii strat")
    return Proweniencja(
        wersja_cennika=cennik.wersja,
        hash_cennika=cennik.hash_cennika,
        data_cen=cennik.data_cen.isoformat(),
        waluta=cennik.waluta,
        stan_zrodla=najslabszy_stan(stany),
        pozycje_nieustalone=tuple(sorted(nieustalone)),
    )


def wycen_liste_materialowa(
    pozycje: Sequence[PozycjaDoWyceny], cennik: Cennik | None
) -> WycenaListy:
    """CAPEX listy materiałowej: suma ilość × cena jednostkowa (odmowa przy braku ceny)."""
    gotowy = _wymagaj(pozycje, cennik, "BOM")
    wycenione = []
    for pozycja in pozycje:
        cena = _cena(gotowy, pozycja)
        assert cena.capex_pln is not None  # wykluczone przez braki_cennika
        wycenione.append(
            PozycjaWyceniona(
                nazwa_pl=pozycja.nazwa_pl,
                type_id=cena.type_id,
                ilosc=pozycja.ilosc,
                jednostka=pozycja.jednostka,
                cena_jednostkowa=cena.capex_pln,
                koszt=koszt_pozycji_pln(pozycja.ilosc, cena.capex_pln),
                stan_zrodla=cena.zrodlo.status,
                dokument_zrodla=cena.zrodlo.dokument,
            )
        )
    return WycenaListy(
        pozycje=tuple(wycenione),
        suma_capex=math.fsum(pozycja.koszt for pozycja in wycenione),
        proweniencja=_proweniencja(gotowy, pozycje),
    )


def _sumy_lcc(cennik: Cennik, pozycje: Sequence[PozycjaDoWyceny]) -> tuple[float, float]:
    capex: list[float] = []
    opex: list[float] = []
    for pozycja in pozycje:
        cena = _cena(cennik, pozycja)
        assert cena.capex_pln is not None and cena.opex_pln_rok is not None
        capex.append(koszt_pozycji_pln(pozycja.ilosc, cena.capex_pln))
        opex.append(koszt_pozycji_pln(pozycja.ilosc, cena.opex_pln_rok))
    return math.fsum(capex), math.fsum(opex)


def _lcc(cennik: Cennik, pozycje: Sequence[PozycjaDoWyceny], parametry: ParametryLcc) -> WynikLcc:
    capex, opex = _sumy_lcc(cennik, pozycje)
    cena_energii = cennik.energia_strat.cena_pln_mwh
    z_energia = parametry.straty_roczne_mwh > 0.0
    koszt_strat = (
        koszt_energii_strat_pln(parametry.straty_roczne_mwh, cena_energii)
        if z_energia and cena_energii is not None
        else 0.0  # straty zerowe podane jawnie (brak ceny przy stratach > 0 odrzuca predykat)
    )
    return WynikLcc(
        capex=capex,
        opex_roczny=opex,
        koszt_strat_roczny=koszt_strat,
        wspolczynnik_wartosci_biezacej=wspolczynnik_wartosci_biezacej(
            parametry.stopa_dyskontowa, parametry.horyzont_lat
        ),
        lcc=koszt_cyklu_zycia_pln(
            capex, opex, koszt_strat, parametry.stopa_dyskontowa, parametry.horyzont_lat
        ),
        parametry=parametry,
        proweniencja=_proweniencja(cennik, pozycje, z_energia=z_energia),
    )


def wycen_lcc(
    pozycje: Sequence[PozycjaDoWyceny], cennik: Cennik | None, parametry: ParametryLcc
) -> WynikLcc:
    """Koszt cyklu życia: CAPEX + (OPEX + koszt strat) × współczynnik wartości bieżącej."""
    gotowy = _wymagaj(pozycje, cennik, "LCC", straty_roczne_mwh=parametry.straty_roczne_mwh)
    return _lcc(gotowy, pozycje, parametry)


def porownaj_warianty(
    warianty: Sequence[WariantDoWyceny],
    cennik: Cennik | None,
    parametry: ParametryLcc | None = None,
) -> PorownanieWariantow:
    """Ranking wariantów po CAPEX (``parametry=None``) albo po LCC; remis — po nazwie.

    Brak ceny w KTÓRYMKOLWIEK wariancie odrzuca porównanie (wariant niewyceniony nie jest
    „najtańszy”); odmowa niesie sumę braków wszystkich wariantów.
    """
    if len(warianty) < 2:
        raise OdmowaDanychError("Porównanie wymaga co najmniej dwóch wariantów.")
    nazwy = [wariant.nazwa_pl for wariant in warianty]
    if len(set(nazwy)) != len(nazwy):
        raise OdmowaDanychError("Warianty porównania muszą mieć różne nazwy.")
    zakres: ZakresKosztu = "BOM" if parametry is None else "LCC"
    straty = None if parametry is None else parametry.straty_roczne_mwh
    wszystkie = tuple(pozycja for wariant in warianty for pozycja in wariant.pozycje)
    gotowy = _wymagaj(
        wszystkie,
        cennik,
        zakres,
        straty_roczne_mwh=straty,
        przedmiot="porównania wariantów",
    )
    koszty: list[tuple[float, str]] = []
    for wariant in warianty:
        if parametry is None:
            koszt = wycen_liste_materialowa(wariant.pozycje, gotowy).suma_capex
        else:
            koszt = _lcc(gotowy, wariant.pozycje, parametry).lcc
        koszty.append((koszt, wariant.nazwa_pl))
    koszty.sort()
    najtanszy = koszty[0][0]
    return PorownanieWariantow(
        kryterium=zakres,
        wiersze=tuple(
            WierszPorownania(nazwa_pl=nazwa, koszt=koszt, roznica_do_najtanszego=koszt - najtanszy)
            for koszt, nazwa in koszty
        ),
        proweniencja=_proweniencja(gotowy, wszystkie, z_energia=bool(straty)),
    )
