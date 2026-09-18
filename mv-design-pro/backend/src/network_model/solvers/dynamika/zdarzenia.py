"""Harmonogram zdarzen z DOKLADNYM czasem — krok skracany do chwili zdarzenia (SS0 p.5).

DWIE RZECZY, KTORE TEN MODUL GWARANTUJE.

1. **Dokladny czas.** Zdarzenie nie „wypada gdzies w kroku" — silnik skraca krok
   tak, zeby wyladowac DOKLADNIE w jego chwili, wykonuje zdarzenie i rusza dalej
   pelnym krokiem. Bez tego czas usuniecia zwarcia mialby rozdzielczosc kroku, a
   krytyczny czas usuniecia (CCT) liczony bisekcja mialby blad rzedu `dt`,
   nie rzedu metody.
2. **Kolejnosc kanoniczna.** Wpisy sa sortowane STABILNIE po `t_s`, wiec remis
   czasowy zachowuje kolejnosc ZAPISU. Ten sam kontrakt kolejnosci niesie warstwa
   danych (`ScenariuszDynamiczny.zdarzenia_uporzadkowane`) — jedno zrodlo prawdy
   porzadku, dwa miejsca zapisu.

ZWARCIE ROZWIJA SIE NA DWA WPISY: zalozenie w `t_s` i zdjecie w `t_usuniecia_s`.
Dzieki temu zdjecie jest zwyklym wpisem harmonogramu — ma swoj dokladny czas,
swoja re-inicjalizacje i swoj wiersz w `zdarzenia_wykonane`, zamiast byc ukrytym
skutkiem ubocznym zalozenia.

W6-2 wykonuje WYLACZNIE zwarcia trojfazowe. Zwarcie 2F/1F/2FZ wymaga skladowych
symetrycznych i jest odmawiane NAZWANYM kodem — nie jest liczone jak trojfazowe
i nie jest po cichu pomijane.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .kontrakty import (
    KOD_ZDARZENIE_BEZ_ELEMENTU,
    KOD_ZWARCIE_NIESYMETRYCZNE,
    GalazDynamiki,
    HarmonogramDynamiki,
    OdbiorDynamiki,
    OdlaczenieZrodla,
    OdmowaDynamiki,
    SkokObciazenia,
    Urzadzenie,
    WezelDynamiki,
    ZmianaGalezi,
    ZwarcieWezla,
)
from .konwencje import admitancja_zwarcia_pu

#: Jedyny typ zwarcia, ktory rdzen W6-2 umie policzyc (SS0 p.5).
TYP_ZWARCIA_TROJFAZOWEGO = "3F"

RodzajWpisu = Literal[
    "zwarcie",
    "zdjecie_zwarcia",
    "wylaczenie_galezi",
    "zalaczenie_galezi",
    "odlaczenie_zrodla",
    "skok_obciazenia",
]


@dataclass(frozen=True)
class WpisHarmonogramu:
    """Jedno wykonalne zdarzenie w konkretnej chwili.

    `admitancja_pu` jest wypelniona WYLACZNIE dla wpisu `zwarcie` (przeliczona z
    omow na jednostki wzgledne raz, przy budowie harmonogramu — nie w torze
    gorącym); `delta_mocy_pu` wylacznie dla `skok_obciazenia`.
    """

    t_s: float
    indeks_zapisu: int
    rodzaj: RodzajWpisu
    ref: str
    admitancja_pu: complex | None
    delta_mocy_pu: complex | None


@dataclass(frozen=True)
class StanScenariusza:
    """Skutki wykonanych zdarzen — wejscie do zlozenia biezacego `ModelSieci`."""

    galezie_aktywne: frozenset[str]
    admitancje_zwarc: tuple[tuple[str, complex], ...]
    zrodla_odlaczone: frozenset[str]
    delty_odbiorow: tuple[tuple[str, complex], ...]

    def delta_odbioru(self, ident: str) -> complex:
        for klucz, wartosc in self.delty_odbiorow:
            if klucz == ident:
                return wartosc
        return 0j


def stan_poczatkowy_scenariusza(galezie: tuple[GalazDynamiki, ...]) -> StanScenariusza:
    """Siec zdrowa: wszystkie galezie zalaczone, zero zwarc, zero odlaczen."""
    return StanScenariusza(
        galezie_aktywne=frozenset(galaz.ident for galaz in galezie),
        admitancje_zwarc=(),
        zrodla_odlaczone=frozenset(),
        delty_odbiorow=(),
    )


def zbuduj_harmonogram(
    harmonogram: HarmonogramDynamiki,
    *,
    wezly: tuple[WezelDynamiki, ...],
    galezie: tuple[GalazDynamiki, ...],
    odbiory: tuple[OdbiorDynamiki, ...],
    urzadzenia: tuple[Urzadzenie, ...],
    s_bazowa_mva: float,
    horyzont_s: float,
) -> tuple[WpisHarmonogramu, ...]:
    """Rozwin harmonogram wejsciowy na wykonalne wpisy i zwaliduj kazda referencje.

    Kazde odwolanie do nieistniejacego elementu konczy sie odmowa
    `dynamika.zdarzenie_bez_elementu` — cichy skip zamienialby „wylaczenie
    galezi X" w „stan normalny" bez jednego sladu.
    """
    napiecia_wezlow = {wezel.ident: wezel.u_n_kv for wezel in wezly}
    identy_galezi = {galaz.ident for galaz in galezie}
    identy_odbiorow = {odbior.ident for odbior in odbiory}
    identy_urzadzen = {urzadzenie.ident for urzadzenie in urzadzenia}

    def sprawdz(ref: str, zbior: frozenset[str] | set[str], rodzina: str) -> None:
        if ref not in zbior:
            raise OdmowaDynamiki(
                KOD_ZDARZENIE_BEZ_ELEMENTU,
                f"Zdarzenie wskazuje {rodzina} {ref!r}, ktorego model nie ma",
                ref=ref,
                rodzina=rodzina,
            )

    wpisy: list[WpisHarmonogramu] = []
    for indeks, zdarzenie in enumerate(harmonogram.zdarzenia):
        if zdarzenie.t_s > horyzont_s:
            raise OdmowaDynamiki(
                KOD_ZDARZENIE_BEZ_ELEMENTU,
                f"Zdarzenie w t={zdarzenie.t_s} s wykracza poza horyzont {horyzont_s} s",
                t_s=zdarzenie.t_s,
                horyzont_s=horyzont_s,
            )
        if isinstance(zdarzenie, ZwarcieWezla):
            sprawdz(zdarzenie.wezel, set(napiecia_wezlow), "wezel")
            if zdarzenie.typ != TYP_ZWARCIA_TROJFAZOWEGO:
                raise OdmowaDynamiki(
                    KOD_ZWARCIE_NIESYMETRYCZNE,
                    f"Zwarcie typu {zdarzenie.typ!r} w wezle {zdarzenie.wezel!r} wymaga "
                    "skladowych symetrycznych — rdzen liczy wylacznie zwarcia "
                    f"{TYP_ZWARCIA_TROJFAZOWEGO}",
                    typ=zdarzenie.typ,
                    wezel=zdarzenie.wezel,
                )
            admitancja = admitancja_zwarcia_pu(
                zdarzenie.r_f_ohm,
                zdarzenie.x_f_ohm,
                napiecia_wezlow[zdarzenie.wezel],
                s_bazowa_mva,
            )
            wpisy.append(
                WpisHarmonogramu(
                    t_s=zdarzenie.t_s,
                    indeks_zapisu=indeks,
                    rodzaj="zwarcie",
                    ref=zdarzenie.wezel,
                    admitancja_pu=admitancja,
                    delta_mocy_pu=None,
                )
            )
            if zdarzenie.t_usuniecia_s is not None:
                if zdarzenie.t_usuniecia_s > horyzont_s:
                    raise OdmowaDynamiki(
                        KOD_ZDARZENIE_BEZ_ELEMENTU,
                        f"Zdjecie zwarcia w t={zdarzenie.t_usuniecia_s} s wykracza poza "
                        f"horyzont {horyzont_s} s",
                        t_s=zdarzenie.t_usuniecia_s,
                        horyzont_s=horyzont_s,
                    )
                wpisy.append(
                    WpisHarmonogramu(
                        t_s=zdarzenie.t_usuniecia_s,
                        indeks_zapisu=indeks,
                        rodzaj="zdjecie_zwarcia",
                        ref=zdarzenie.wezel,
                        admitancja_pu=None,
                        delta_mocy_pu=None,
                    )
                )
        elif isinstance(zdarzenie, ZmianaGalezi):
            sprawdz(zdarzenie.galaz, identy_galezi, "galaz")
            wpisy.append(
                WpisHarmonogramu(
                    t_s=zdarzenie.t_s,
                    indeks_zapisu=indeks,
                    rodzaj="zalaczenie_galezi" if zdarzenie.zalaczona else "wylaczenie_galezi",
                    ref=zdarzenie.galaz,
                    admitancja_pu=None,
                    delta_mocy_pu=None,
                )
            )
        elif isinstance(zdarzenie, OdlaczenieZrodla):
            sprawdz(zdarzenie.zrodlo, identy_urzadzen, "zrodlo")
            wpisy.append(
                WpisHarmonogramu(
                    t_s=zdarzenie.t_s,
                    indeks_zapisu=indeks,
                    rodzaj="odlaczenie_zrodla",
                    ref=zdarzenie.zrodlo,
                    admitancja_pu=None,
                    delta_mocy_pu=None,
                )
            )
        elif isinstance(zdarzenie, SkokObciazenia):
            sprawdz(zdarzenie.odbior, identy_odbiorow, "odbior")
            wpisy.append(
                WpisHarmonogramu(
                    t_s=zdarzenie.t_s,
                    indeks_zapisu=indeks,
                    rodzaj="skok_obciazenia",
                    ref=zdarzenie.odbior,
                    admitancja_pu=None,
                    delta_mocy_pu=complex(zdarzenie.delta_p_pu, zdarzenie.delta_q_pu),
                )
            )
        else:  # pragma: no cover — unia zamknieta, gałąź istnieje dla czytelnika
            raise AssertionError(f"Nieznany rodzaj zdarzenia: {zdarzenie!r}")

    return tuple(sorted(wpisy, key=lambda wpis: wpis.t_s))


def zastosuj(wpis: WpisHarmonogramu, stan: StanScenariusza) -> StanScenariusza:
    """Nowy stan scenariusza po wykonaniu wpisu (obiekt niemutowalny).

    Zalozenie i zdjecie zwarcia w tym samym wezle sa operacjami PARY z jednego
    zrodla prawdy (lista `admitancje_zwarc`): zdjecie usuwa DOKLADNIE ten wpis,
    ktory zalozenie dodalo, wiec „zwarcie zalozone i zdjete" wraca do listy
    wyjsciowej, a nie do listy „prawie takiej samej".
    """
    if wpis.rodzaj == "zwarcie":
        if wpis.admitancja_pu is None:  # pragma: no cover — gwarantowane budowa wpisu
            raise AssertionError("Wpis zwarcia bez admitancji")
        pozostale = tuple(pozycja for pozycja in stan.admitancje_zwarc if pozycja[0] != wpis.ref)
        return StanScenariusza(
            galezie_aktywne=stan.galezie_aktywne,
            admitancje_zwarc=tuple(
                sorted((*pozostale, (wpis.ref, wpis.admitancja_pu)), key=lambda p: p[0])
            ),
            zrodla_odlaczone=stan.zrodla_odlaczone,
            delty_odbiorow=stan.delty_odbiorow,
        )
    if wpis.rodzaj == "zdjecie_zwarcia":
        return StanScenariusza(
            galezie_aktywne=stan.galezie_aktywne,
            admitancje_zwarc=tuple(
                pozycja for pozycja in stan.admitancje_zwarc if pozycja[0] != wpis.ref
            ),
            zrodla_odlaczone=stan.zrodla_odlaczone,
            delty_odbiorow=stan.delty_odbiorow,
        )
    if wpis.rodzaj in ("wylaczenie_galezi", "zalaczenie_galezi"):
        zalaczona = wpis.rodzaj == "zalaczenie_galezi"
        galezie = (
            stan.galezie_aktywne | {wpis.ref} if zalaczona else stan.galezie_aktywne - {wpis.ref}
        )
        return StanScenariusza(
            galezie_aktywne=frozenset(galezie),
            admitancje_zwarc=stan.admitancje_zwarc,
            zrodla_odlaczone=stan.zrodla_odlaczone,
            delty_odbiorow=stan.delty_odbiorow,
        )
    if wpis.rodzaj == "odlaczenie_zrodla":
        return StanScenariusza(
            galezie_aktywne=stan.galezie_aktywne,
            admitancje_zwarc=stan.admitancje_zwarc,
            zrodla_odlaczone=stan.zrodla_odlaczone | {wpis.ref},
            delty_odbiorow=stan.delty_odbiorow,
        )
    if wpis.rodzaj == "skok_obciazenia":
        if wpis.delta_mocy_pu is None:  # pragma: no cover — gwarantowane budowa wpisu
            raise AssertionError("Wpis skoku obciazenia bez delty mocy")
        biezaca = stan.delta_odbioru(wpis.ref)
        pozostale = tuple(pozycja for pozycja in stan.delty_odbiorow if pozycja[0] != wpis.ref)
        return StanScenariusza(
            galezie_aktywne=stan.galezie_aktywne,
            admitancje_zwarc=stan.admitancje_zwarc,
            zrodla_odlaczone=stan.zrodla_odlaczone,
            delty_odbiorow=tuple(
                sorted(
                    (*pozostale, (wpis.ref, biezaca + wpis.delta_mocy_pu)),
                    key=lambda p: p[0],
                )
            ),
        )
    raise AssertionError(f"Nieznany rodzaj wpisu: {wpis.rodzaj!r}")  # pragma: no cover


def odbiory_po_zdarzeniach(
    odbiory: tuple[OdbiorDynamiki, ...], stan: StanScenariusza
) -> tuple[OdbiorDynamiki, ...]:
    """Odbiory z naniesionymi skokami mocy (konwencja poboru)."""
    wynik: list[OdbiorDynamiki] = []
    for odbior in odbiory:
        delta = stan.delta_odbioru(odbior.ident)
        if delta == 0:
            wynik.append(odbior)
            continue
        wynik.append(
            OdbiorDynamiki(
                ident=odbior.ident,
                wezel=odbior.wezel,
                p_pu=odbior.p_pu + delta.real,
                q_pu=odbior.q_pu + delta.imag,
            )
        )
    return tuple(wynik)


def urzadzenia_po_zdarzeniach(
    urzadzenia: tuple[Urzadzenie, ...], stan: StanScenariusza
) -> tuple[int, ...]:
    """Indeksy urzadzen POZOSTAJACYCH w bilansie sieci (odlaczone znikaja)."""
    return tuple(
        indeks
        for indeks, urzadzenie in enumerate(urzadzenia)
        if urzadzenie.ident not in stan.zrodla_odlaczone
    )


__all__ = [
    "TYP_ZWARCIA_TROJFAZOWEGO",
    "RodzajWpisu",
    "StanScenariusza",
    "WpisHarmonogramu",
    "odbiory_po_zdarzeniach",
    "stan_poczatkowy_scenariusza",
    "urzadzenia_po_zdarzeniach",
    "zastosuj",
    "zbuduj_harmonogram",
]
