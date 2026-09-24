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
skutkiem ubocznym zalozenia. Wpis zdjecia niesie JAWNY sposob usuniecia (karta
AB-1b.1 par. 0 pkt 4): dla `izolacja` silnik sprawdza w stanie PO zdarzeniach chwili,
ze miejsce zwarcia jest odciete. To samo dotyczy zwarcia w galezi (`zwarcie_galezi`,
`zdjecie_zwarcia_galezi`) — miejscem jest wtedy para (galaz, x).

W6-2 wykonuje WYLACZNIE zwarcia trojfazowe. Zwarcie 2F/1F/2FZ wymaga skladowych
symetrycznych i jest odmawiane NAZWANYM kodem — nie jest liczone jak trojfazowe
i nie jest po cichu pomijane.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Literal

from .kontrakty import (
    KOD_ZDARZENIE_BEZ_ELEMENTU,
    KOD_ZWARCIE_GALEZI_NIEOBSLUGIWANE,
    KOD_ZWARCIE_NIESYMETRYCZNE,
    GalazDynamiki,
    HarmonogramDynamiki,
    OdbiorDynamiki,
    OdlaczenieZrodla,
    OdmowaDynamiki,
    OdsprzegDynamiki,
    SkokObciazenia,
    SposobUsuniecia,
    Urzadzenie,
    WezelDynamiki,
    ZmianaGalezi,
    ZmianaOdbioru,
    ZmianaOdsprzegu,
    ZwarcieGalezi,
    ZwarcieWezla,
)
from .konwencje import admitancja_zwarcia_pu

#: Jedyny typ zwarcia, ktory rdzen W6-2 umie policzyc (SS0 p.5).
TYP_ZWARCIA_TROJFAZOWEGO = "3F"

RodzajWpisu = Literal[
    "zwarcie",
    "zdjecie_zwarcia",
    "zwarcie_galezi",
    "zdjecie_zwarcia_galezi",
    "wylaczenie_galezi",
    "zalaczenie_galezi",
    "wylaczenie_odsprzegu",
    "zalaczenie_odsprzegu",
    "odlaczenie_odbioru",
    "zalaczenie_odbioru",
    "odlaczenie_zrodla",
    "skok_obciazenia",
]


@dataclass(frozen=True)
class WpisHarmonogramu:
    """Jedno wykonalne zdarzenie w konkretnej chwili.

    `admitancja_pu` niesie sie WYLACZNIE we wpisie `zwarcie` (przeliczona z omow na
    jednostki wzgledne raz, przy budowie harmonogramu — nie w torze gorącym); wpis
    `zwarcie` z `admitancja_pu = None` to zwarcie METALICZNE (`R_f = X_f = 0`), ktore
    nie ma skonczonej admitancji i idzie wierszem ograniczenia `V = 0` (karta AB-1b.1
    par. 0 pkt 3). `delta_mocy_pu` wylacznie dla `skok_obciazenia`.
    `polozenie_wzgledne` wylacznie dla wpisow zwarcia w galezi (`ref` = galaz);
    `sposob_usuniecia` wylacznie dla wpisow zdjecia zwarcia.
    """

    t_s: float
    indeks_zapisu: int
    rodzaj: RodzajWpisu
    ref: str
    admitancja_pu: complex | None
    delta_mocy_pu: complex | None
    polozenie_wzgledne: float | None
    sposob_usuniecia: SposobUsuniecia | None


@dataclass(frozen=True)
class StanScenariusza:
    """Skutki wykonanych zdarzen — wejscie do zlozenia biezacego `ModelSieci`.

    Trzy zbiory AKTYWNOSCI (galezie, odsprzegi, odbiory) startuja z flag wejscia, a nie
    z „wszystko zalaczone" (karta AB-1b.1 par. 0 pkt 1): element otwarty w t = 0 jest
    w rdzeniu i zdarzenie moze go zamknac. Zwarcie w wezle zyje w DOKLADNIE jednym z
    dwoch miejsc: `admitancje_zwarc` (impedancja zwarcia niezerowa) albo
    `zwarcia_metaliczne` (wiersz ograniczenia `V = 0`). Zwarcie w galezi: `zwarcia_galezi`
    — (galaz, x, admitancja albo `None` dla metalicznego), posortowane po (galaz, x).
    """

    galezie_aktywne: frozenset[str]
    odsprzegi_aktywne: frozenset[str]
    odbiory_aktywne: frozenset[str]
    admitancje_zwarc: tuple[tuple[str, complex], ...]
    zwarcia_metaliczne: frozenset[str]
    zwarcia_galezi: tuple[tuple[str, float, complex | None], ...]
    zrodla_odlaczone: frozenset[str]
    delty_odbiorow: tuple[tuple[str, complex], ...]

    def delta_odbioru(self, ident: str) -> complex:
        for klucz, wartosc in self.delty_odbiorow:
            if klucz == ident:
                return wartosc
        return 0j


def stan_poczatkowy_scenariusza(
    galezie: tuple[GalazDynamiki, ...],
    odsprzegi: tuple[OdsprzegDynamiki, ...],
    odbiory: tuple[OdbiorDynamiki, ...],
) -> StanScenariusza:
    """Stan t = 0: aktywnosc z FLAG wejscia, zero zwarc, zero odlaczen, zero skokow.

    Odbior nie ma flagi w kontrakcie (model ENM nie niesie stanu laczeniowego odbioru),
    wiec kazdy odbior startuje przylaczony; odlacza go dopiero zdarzenie `ZmianaOdbioru`.
    """
    return StanScenariusza(
        galezie_aktywne=frozenset(galaz.ident for galaz in galezie if galaz.aktywna_na_starcie),
        odsprzegi_aktywne=frozenset(
            odsprzeg.ident for odsprzeg in odsprzegi if odsprzeg.aktywna_na_starcie
        ),
        odbiory_aktywne=frozenset(odbior.ident for odbior in odbiory),
        admitancje_zwarc=(),
        zwarcia_metaliczne=frozenset(),
        zwarcia_galezi=(),
        zrodla_odlaczone=frozenset(),
        delty_odbiorow=(),
    )


def zbuduj_harmonogram(
    harmonogram: HarmonogramDynamiki,
    *,
    wezly: tuple[WezelDynamiki, ...],
    galezie: tuple[GalazDynamiki, ...],
    odsprzegi: tuple[OdsprzegDynamiki, ...],
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
    galezie_po_identach = {galaz.ident: galaz for galaz in galezie}
    identy_odsprzegow = {odsprzeg.ident for odsprzeg in odsprzegi}
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
            # Zwarcie METALICZNE (`R_f = X_f = 0`) nie ma skonczonej admitancji; nie
            # jest ani odmawiane (dawny kod `zwarcie_metaliczne_bez_admitancji`), ani
            # zastepowane „bardzo duza admitancja" (fabrykacja wartosci), tylko idzie
            # wierszem ograniczenia `V = 0` (karta AB-1b.1 par. 0 pkt 3). Odmowy
            # zostaja na poziomie URZADZEN w wezle zwartym (odbior o stalej mocy,
            # regulacja czytajaca modul napiecia) — nazwane w silniku.
            admitancja = (
                None
                if zdarzenie.r_f_ohm == 0.0 and zdarzenie.x_f_ohm == 0.0
                else admitancja_zwarcia_pu(
                    zdarzenie.r_f_ohm,
                    zdarzenie.x_f_ohm,
                    napiecia_wezlow[zdarzenie.wezel],
                    s_bazowa_mva,
                )
            )
            wpisy.append(
                WpisHarmonogramu(
                    t_s=zdarzenie.t_s,
                    indeks_zapisu=indeks,
                    rodzaj="zwarcie",
                    ref=zdarzenie.wezel,
                    admitancja_pu=admitancja,
                    delta_mocy_pu=None,
                    polozenie_wzgledne=None,
                    sposob_usuniecia=None,
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
                        polozenie_wzgledne=None,
                        sposob_usuniecia=zdarzenie.sposob_usuniecia,
                    )
                )
        elif isinstance(zdarzenie, ZwarcieGalezi):
            wpisy.extend(
                _wpisy_zwarcia_galezi(
                    zdarzenie,
                    indeks,
                    galezie_po_identach=galezie_po_identach,
                    napiecia_wezlow=napiecia_wezlow,
                    s_bazowa_mva=s_bazowa_mva,
                    horyzont_s=horyzont_s,
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
                    polozenie_wzgledne=None,
                    sposob_usuniecia=None,
                )
            )
        elif isinstance(zdarzenie, ZmianaOdsprzegu):
            sprawdz(zdarzenie.odsprzeg, identy_odsprzegow, "odsprzeg")
            wpisy.append(
                WpisHarmonogramu(
                    t_s=zdarzenie.t_s,
                    indeks_zapisu=indeks,
                    rodzaj=(
                        "zalaczenie_odsprzegu" if zdarzenie.zalaczony else "wylaczenie_odsprzegu"
                    ),
                    ref=zdarzenie.odsprzeg,
                    admitancja_pu=None,
                    delta_mocy_pu=None,
                    polozenie_wzgledne=None,
                    sposob_usuniecia=None,
                )
            )
        elif isinstance(zdarzenie, ZmianaOdbioru):
            sprawdz(zdarzenie.odbior, identy_odbiorow, "odbior")
            wpisy.append(
                WpisHarmonogramu(
                    t_s=zdarzenie.t_s,
                    indeks_zapisu=indeks,
                    rodzaj="zalaczenie_odbioru" if zdarzenie.zalaczony else "odlaczenie_odbioru",
                    ref=zdarzenie.odbior,
                    admitancja_pu=None,
                    delta_mocy_pu=None,
                    polozenie_wzgledne=None,
                    sposob_usuniecia=None,
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
                    polozenie_wzgledne=None,
                    sposob_usuniecia=None,
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
                    polozenie_wzgledne=None,
                    sposob_usuniecia=None,
                )
            )
        else:  # pragma: no cover — unia zamknieta, gałąź istnieje dla czytelnika
            raise AssertionError(f"Nieznany rodzaj zdarzenia: {zdarzenie!r}")

    return tuple(sorted(wpisy, key=lambda wpis: wpis.t_s))


def _wpisy_zwarcia_galezi(
    zdarzenie: ZwarcieGalezi,
    indeks: int,
    *,
    galezie_po_identach: dict[str, GalazDynamiki],
    napiecia_wezlow: dict[str, float],
    s_bazowa_mva: float,
    horyzont_s: float,
) -> tuple[WpisHarmonogramu, ...]:
    """Wpisy zalozenia i (opcjonalnie) zdjecia zwarcia w galezi `x*L`.

    Odmowy nazwane: galaz spoza modelu (`zdarzenie_bez_elementu`), typ inny niz 3F
    (`zwarcie_niesymetryczne_nieobslugiwane`), galaz inna niz linia/kabel albo z
    przekladnia (`zwarcie_galezi_nieobslugiwane`), zdjecie poza horyzontem.
    Impedancja zwarcia przeliczana w bazie napiecia zacisku `od` (linia i kabel lacza
    wezly tego samego napiecia znamionowego — przekladnia 1 jest warunkiem wyzej).
    """
    galaz = galezie_po_identach.get(zdarzenie.galaz)
    if galaz is None:
        raise OdmowaDynamiki(
            KOD_ZDARZENIE_BEZ_ELEMENTU,
            f"Zdarzenie wskazuje galaz {zdarzenie.galaz!r}, ktorej model nie ma",
            ref=zdarzenie.galaz,
            rodzina="galaz",
        )
    if zdarzenie.typ != TYP_ZWARCIA_TROJFAZOWEGO:
        raise OdmowaDynamiki(
            KOD_ZWARCIE_NIESYMETRYCZNE,
            f"Zwarcie typu {zdarzenie.typ!r} w galezi {zdarzenie.galaz!r} wymaga skladowych "
            f"symetrycznych — rdzen liczy wylacznie zwarcia {TYP_ZWARCIA_TROJFAZOWEGO}",
            typ=zdarzenie.typ,
            galaz=zdarzenie.galaz,
        )
    if galaz.rodzaj not in ("linia", "kabel") or galaz.przekladnia != 1:
        raise OdmowaDynamiki(
            KOD_ZWARCIE_GALEZI_NIEOBSLUGIWANE,
            f"Zwarcie w miejscu x*L galezi {zdarzenie.galaz!r} (rodzaj {galaz.rodzaj!r}, "
            f"przekladnia {galaz.przekladnia}) — dlugosc elektryczna istnieje wylacznie dla "
            "linii i kabla; zwarcie na zacisku transformatora albo lacznika zadaje sie w wezle",
            galaz=zdarzenie.galaz,
            rodzaj=galaz.rodzaj,
        )
    admitancja = (
        None
        if zdarzenie.r_f_ohm == 0.0 and zdarzenie.x_f_ohm == 0.0
        else admitancja_zwarcia_pu(
            zdarzenie.r_f_ohm,
            zdarzenie.x_f_ohm,
            napiecia_wezlow[galaz.wezel_od],
            s_bazowa_mva,
        )
    )
    wpisy = [
        WpisHarmonogramu(
            t_s=zdarzenie.t_s,
            indeks_zapisu=indeks,
            rodzaj="zwarcie_galezi",
            ref=zdarzenie.galaz,
            admitancja_pu=admitancja,
            delta_mocy_pu=None,
            polozenie_wzgledne=zdarzenie.polozenie_wzgledne,
            sposob_usuniecia=None,
        )
    ]
    if zdarzenie.t_usuniecia_s is not None:
        if zdarzenie.t_usuniecia_s > horyzont_s:
            raise OdmowaDynamiki(
                KOD_ZDARZENIE_BEZ_ELEMENTU,
                f"Zdjecie zwarcia w t={zdarzenie.t_usuniecia_s} s wykracza poza horyzont "
                f"{horyzont_s} s",
                t_s=zdarzenie.t_usuniecia_s,
                horyzont_s=horyzont_s,
            )
        wpisy.append(
            WpisHarmonogramu(
                t_s=zdarzenie.t_usuniecia_s,
                indeks_zapisu=indeks,
                rodzaj="zdjecie_zwarcia_galezi",
                ref=zdarzenie.galaz,
                admitancja_pu=None,
                delta_mocy_pu=None,
                polozenie_wzgledne=zdarzenie.polozenie_wzgledne,
                sposob_usuniecia=zdarzenie.sposob_usuniecia,
            )
        )
    return tuple(wpisy)


def zastosuj(wpis: WpisHarmonogramu, stan: StanScenariusza) -> StanScenariusza:
    """Nowy stan scenariusza po wykonaniu wpisu (obiekt niemutowalny).

    Zalozenie i zdjecie zwarcia w tym samym wezle sa operacjami PARY z jednego
    zrodla prawdy (lista `admitancje_zwarc`): zdjecie usuwa DOKLADNIE ten wpis,
    ktory zalozenie dodalo, wiec „zwarcie zalozone i zdjete" wraca do listy
    wyjsciowej, a nie do listy „prawie takiej samej". Ta sama zasada obowiazuje
    zbiory aktywnosci: zalaczenie i wylaczenie to dodanie i usuniecie TEGO SAMEGO
    identyfikatora, wiec „zalaczone i wylaczone" wraca do zbioru wyjsciowego.
    """
    if wpis.rodzaj == "zwarcie":
        pozostale = tuple(pozycja for pozycja in stan.admitancje_zwarc if pozycja[0] != wpis.ref)
        if wpis.admitancja_pu is None:
            return replace(
                stan,
                admitancje_zwarc=pozostale,
                zwarcia_metaliczne=stan.zwarcia_metaliczne | {wpis.ref},
            )
        return replace(
            stan,
            admitancje_zwarc=tuple(
                sorted((*pozostale, (wpis.ref, wpis.admitancja_pu)), key=lambda p: p[0])
            ),
            zwarcia_metaliczne=stan.zwarcia_metaliczne - {wpis.ref},
        )
    if wpis.rodzaj == "zdjecie_zwarcia":
        return replace(
            stan,
            admitancje_zwarc=tuple(
                pozycja for pozycja in stan.admitancje_zwarc if pozycja[0] != wpis.ref
            ),
            zwarcia_metaliczne=stan.zwarcia_metaliczne - {wpis.ref},
        )
    if wpis.rodzaj in ("zwarcie_galezi", "zdjecie_zwarcia_galezi"):
        if wpis.polozenie_wzgledne is None:  # pragma: no cover — gwarantowane budowa wpisu
            raise AssertionError("Wpis zwarcia w galezi bez polozenia")
        miejsce = (wpis.ref, wpis.polozenie_wzgledne)
        pozostale_galezi = tuple(
            pozycja for pozycja in stan.zwarcia_galezi if (pozycja[0], pozycja[1]) != miejsce
        )
        if wpis.rodzaj == "zdjecie_zwarcia_galezi":
            return replace(stan, zwarcia_galezi=pozostale_galezi)
        return replace(
            stan,
            zwarcia_galezi=tuple(
                sorted(
                    (*pozostale_galezi, (wpis.ref, wpis.polozenie_wzgledne, wpis.admitancja_pu)),
                    key=lambda p: (p[0], p[1]),
                )
            ),
        )
    if wpis.rodzaj in ("wylaczenie_galezi", "zalaczenie_galezi"):
        return replace(
            stan,
            galezie_aktywne=_przelacz(
                stan.galezie_aktywne, wpis.ref, wpis.rodzaj == "zalaczenie_galezi"
            ),
        )
    if wpis.rodzaj in ("wylaczenie_odsprzegu", "zalaczenie_odsprzegu"):
        return replace(
            stan,
            odsprzegi_aktywne=_przelacz(
                stan.odsprzegi_aktywne, wpis.ref, wpis.rodzaj == "zalaczenie_odsprzegu"
            ),
        )
    if wpis.rodzaj in ("odlaczenie_odbioru", "zalaczenie_odbioru"):
        return replace(
            stan,
            odbiory_aktywne=_przelacz(
                stan.odbiory_aktywne, wpis.ref, wpis.rodzaj == "zalaczenie_odbioru"
            ),
        )
    if wpis.rodzaj == "odlaczenie_zrodla":
        return replace(stan, zrodla_odlaczone=stan.zrodla_odlaczone | {wpis.ref})
    if wpis.rodzaj == "skok_obciazenia":
        if wpis.delta_mocy_pu is None:  # pragma: no cover — gwarantowane budowa wpisu
            raise AssertionError("Wpis skoku obciazenia bez delty mocy")
        biezaca = stan.delta_odbioru(wpis.ref)
        pozostale = tuple(pozycja for pozycja in stan.delty_odbiorow if pozycja[0] != wpis.ref)
        return replace(
            stan,
            delty_odbiorow=tuple(
                sorted(
                    (*pozostale, (wpis.ref, biezaca + wpis.delta_mocy_pu)),
                    key=lambda p: p[0],
                )
            ),
        )
    raise AssertionError(f"Nieznany rodzaj wpisu: {wpis.rodzaj!r}")  # pragma: no cover


def _przelacz(zbior: frozenset[str], ident: str, zalacz: bool) -> frozenset[str]:
    return frozenset(zbior | {ident}) if zalacz else frozenset(zbior - {ident})


def odbiory_po_zdarzeniach(
    odbiory: tuple[OdbiorDynamiki, ...], stan: StanScenariusza
) -> tuple[OdbiorDynamiki, ...]:
    """Odbiory PRZYLACZONE z naniesionymi skokami mocy (konwencja poboru).

    Odbior odlaczony zdarzeniem nie ma obwodu — nie wchodzi do bilansu wezla wcale
    (nie „z moca zero"); jego skoki mocy zostaja w stanie scenariusza i wracaja z nim
    przy ponownym zalaczeniu.
    """
    wynik: list[OdbiorDynamiki] = []
    for odbior in odbiory:
        if odbior.ident not in stan.odbiory_aktywne:
            continue
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
