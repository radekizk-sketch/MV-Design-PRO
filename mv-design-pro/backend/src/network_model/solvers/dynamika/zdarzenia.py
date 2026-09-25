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

PRZYPISANIA STANU, KOMENDY REGULACJI I CZESCIOWA UTRATA (karta AB-1b.1 par. 0 pkt 9-10).
Przypisanie i komenda nie zmieniaja stanu SCENARIUSZA (topologii), tylko stan URZADZENIA:
wpisy niosa adres stanu i wartosc, a silnik nanosi je na stany po zdarzeniach
topologicznych tej samej chwili, przed jedna re-inicjalizacja. Rozwiniecie komendy na
stan-odniesienie pochodzi z DEKLARACJI klasy urzadzenia (`nastawy_regulacji`), a
przeliczenie MW i Mvar na jednostki wzgledne robi TEN modul (`konwencje.moc_pu`) — adapter
nie przelicza. Czesciowa utrata zmienia udzial pozostaly zrodla w stanie scenariusza;
urzadzenie chwili sklada silnik z urzadzenia wejscia i tego udzialu
(`urzadzenia_w_stanie`), zawsze od nowa — tak jak siec.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace
from typing import Literal

from .dozory import (
    CzestotliwoscElektrycznaWezla,
    Dozor,
    MocUrzadzenia,
    ModulNapieciaWezla,
    ModulPraduZacisku,
    StanUrzadzenia,
)
from .kontrakty import (
    KOD_NASTAWA_NIEOBSLUGIWANA,
    KOD_UDZIAL_ZRODLA_NIEDOZWOLONY,
    KOD_ZDARZENIE_BEZ_ELEMENTU,
    KOD_ZDARZENIE_PRZYPISANIA_NIEDOZWOLONE,
    KOD_ZDARZENIE_SPRZECZNE,
    KOD_ZWARCIE_GALEZI_NIEOBSLUGIWANE,
    KOD_ZWARCIE_NIESYMETRYCZNE,
    WIELKOSCI_NASTAW,
    GalazDynamiki,
    HarmonogramDynamiki,
    KomendaRegulacji,
    OdbiorDynamiki,
    OdlaczenieZrodla,
    OdmowaDynamiki,
    OdsprzegDynamiki,
    PrzypisanieStanu,
    SkokObciazenia,
    SposobUsuniecia,
    Urzadzenie,
    UtrataCzesciowaZrodla,
    WezelDynamiki,
    WielkoscNastawy,
    ZdarzenieDynamiki,
    ZmianaGalezi,
    ZmianaOdbioru,
    ZmianaOdsprzegu,
    ZwarcieGalezi,
    ZwarcieWezla,
)
from .konwencje import admitancja_zwarcia_pu, moc_pu
from .urzadzenia.czesciowe import UrzadzenieCzesciowe
from .urzadzenia.odlaczone import UrzadzenieOdlaczone
from .urzadzenia.zrodlo_testowe import ZrodloTestowe

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
    "utrata_czesciowa_zrodla",
    "skok_obciazenia",
    "przypisanie_stanu",
    "komenda_regulacji",
]

#: Rodzaje wpisow zmieniajace STAN URZADZENIA (nie topologie): silnik nanosi je na stany
#: po zdarzeniach topologicznych chwili, przed jedna re-inicjalizacja.
RODZAJE_PRZYPISAN: tuple[RodzajWpisu, ...] = ("przypisanie_stanu", "komenda_regulacji")

#: Przyczyna wpisu planowanego harmonogramu (wpisy z dozorow niosa `dozor:<ident>`).
PRZYCZYNA_HARMONOGRAM = "harmonogram"


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

    `przypisania` wylacznie dla wpisow przypisania stanu i komendy regulacji (`ref` =
    urzadzenie): pary (stan albo wielkosc P/Q/U, wartosc) — dla przypisania wartosc STANU,
    dla komendy wartosc wielkosci w jednostkach wzglednych bazy ukladu (MW i Mvar juz
    przeliczone), a stan wybiera w chwili wykonania deklaracja urzadzenia tej chwili
    (urzadzenie odlaczone albo agregat po czesciowej utracie maja wlasna). `udzial`
    wylacznie dla czesciowej utraty zrodla. `przyczyna` = `harmonogram` albo
    `dozor:<ident>` (akcja zdarzenia warunkowego — `dozory.py`).
    """

    t_s: float
    indeks_zapisu: int
    rodzaj: RodzajWpisu
    ref: str
    admitancja_pu: complex | None
    delta_mocy_pu: complex | None
    polozenie_wzgledne: float | None
    sposob_usuniecia: SposobUsuniecia | None
    przypisania: tuple[tuple[str, float], ...]
    udzial: float | None
    przyczyna: str


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
    #: Udzial pozostaly zrodel po czesciowej utracie (posortowane po identyfikatorze);
    #: zrodlo nieobecne na liscie pracuje w calosci.
    udzialy_zrodel: tuple[tuple[str, float], ...]

    def delta_odbioru(self, ident: str) -> complex:
        for klucz, wartosc in self.delty_odbiorow:
            if klucz == ident:
                return wartosc
        return 0j

    def udzial_zrodla(self, ident: str) -> float:
        """Udzial pozostaly zrodla — 1,0 dla zrodla bez czesciowej utraty (liczba, nie brak:
        zrodlo bez utraty pracuje w calosci)."""
        for klucz, wartosc in self.udzialy_zrodel:
            if klucz == ident:
                return wartosc
        return 1.0


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
        udzialy_zrodel=(),
    )


def _wpis(
    t_s: float,
    indeks: int,
    rodzaj: RodzajWpisu,
    ref: str,
    *,
    przyczyna: str,
    admitancja_pu: complex | None = None,
    delta_mocy_pu: complex | None = None,
    polozenie_wzgledne: float | None = None,
    sposob_usuniecia: SposobUsuniecia | None = None,
    przypisania: tuple[tuple[str, float], ...] = (),
    udzial: float | None = None,
) -> WpisHarmonogramu:
    """Jeden konstruktor wpisu — pola nieobecne w danym rodzaju sa JAWNIE puste (`None`/())."""
    return WpisHarmonogramu(
        t_s=t_s,
        indeks_zapisu=indeks,
        rodzaj=rodzaj,
        ref=ref,
        admitancja_pu=admitancja_pu,
        delta_mocy_pu=delta_mocy_pu,
        polozenie_wzgledne=polozenie_wzgledne,
        sposob_usuniecia=sposob_usuniecia,
        przypisania=przypisania,
        udzial=udzial,
        przyczyna=przyczyna,
    )


@dataclass(frozen=True)
class KontekstHarmonogramu:
    """Elementy modelu, wobec ktorych waliduje sie referencje zdarzen (jedno miejsce)."""

    napiecia_wezlow: dict[str, float]
    galezie: dict[str, GalazDynamiki]
    identy_odsprzegow: frozenset[str]
    identy_odbiorow: frozenset[str]
    urzadzenia: dict[str, Urzadzenie]
    s_bazowa_mva: float
    horyzont_s: float

    @staticmethod
    def z_wejscia(
        *,
        wezly: tuple[WezelDynamiki, ...],
        galezie: tuple[GalazDynamiki, ...],
        odsprzegi: tuple[OdsprzegDynamiki, ...],
        odbiory: tuple[OdbiorDynamiki, ...],
        urzadzenia: tuple[Urzadzenie, ...],
        s_bazowa_mva: float,
        horyzont_s: float,
    ) -> KontekstHarmonogramu:
        return KontekstHarmonogramu(
            napiecia_wezlow={wezel.ident: wezel.u_n_kv for wezel in wezly},
            galezie={galaz.ident: galaz for galaz in galezie},
            identy_odsprzegow=frozenset(odsprzeg.ident for odsprzeg in odsprzegi),
            identy_odbiorow=frozenset(odbior.ident for odbior in odbiory),
            urzadzenia={urzadzenie.ident: urzadzenie for urzadzenie in urzadzenia},
            s_bazowa_mva=s_bazowa_mva,
            horyzont_s=horyzont_s,
        )

    def sprawdz(self, ref: str, zbior: frozenset[str] | set[str], rodzina: str) -> None:
        if ref not in zbior:
            raise OdmowaDynamiki(
                KOD_ZDARZENIE_BEZ_ELEMENTU,
                f"Zdarzenie wskazuje {rodzina} {ref!r}, którego model nie ma",
                ref=ref,
                rodzina=rodzina,
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
    kontekst = KontekstHarmonogramu.z_wejscia(
        wezly=wezly,
        galezie=galezie,
        odsprzegi=odsprzegi,
        odbiory=odbiory,
        urzadzenia=urzadzenia,
        s_bazowa_mva=s_bazowa_mva,
        horyzont_s=horyzont_s,
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
        wpisy.extend(wpisy_zdarzenia(zdarzenie, indeks, kontekst, przyczyna=PRZYCZYNA_HARMONOGRAM))
    # Regula trybu PO walidacji kazdego zdarzenia: odmowa elementu (brak elementu, zrodlo
    # niebedace agregatem — takze zrodlo testowe) jest bardziej szczegolowa niz odmowa
    # mieszania trybow i ma pierwszenstwo; ta sama kolejnosc dla akcji dozorow.
    sprawdz_tryb_stanowiska(harmonogram.zdarzenia, urzadzenia)
    uporzadkowane = tuple(sorted(wpisy, key=lambda wpis: wpis.t_s))
    _sprawdz_udzialy_malejace(uporzadkowane)
    return uporzadkowane


#: Zdarzenia dozwolone w trybie STANOWISKA (karta AB-1b.1 par. 0 pkt 11): profil zrodla
#: testowego (przypisania stanow) i polecenia dla badanego urzadzenia (komendy regulacji).
ZDARZENIA_TRYBU_STANOWISKA: tuple[type, ...] = (PrzypisanieStanu, KomendaRegulacji)


def jest_trybem_stanowiska(urzadzenia: tuple[Urzadzenie, ...]) -> bool:
    """Bieg jest biegiem STANOWISKA, gdy siec zasila zrodlo testowe (tryb wyprowadzony,
    nie deklarowany — jeden predykat dla wyniku, walidacji harmonogramu i dozorow)."""
    return any(isinstance(urzadzenie, ZrodloTestowe) for urzadzenie in urzadzenia)


def sprawdz_tryb_stanowiska(
    zdarzenia: tuple[ZdarzenieDynamiki, ...], urzadzenia: tuple[Urzadzenie, ...]
) -> None:
    """Typowe rozdzielenie: w trybie stanowiska wylacznie profil i komendy regulacji.

    Zaklocenie fizyczne sieci (zwarcie, laczenie, utrata zrodla, skok obciazenia) w biegu,
    w ktorym siec zasila zrodlo testowe, mieszaloby dwa badania: odpowiedz na profil
    stanowiska i odpowiedz na zaklocenie sieci — wynik „w obwiedni" nie mowilby, ktorego
    badania dotyczy. Odmowa nazwana, nie rozstrzygniecie po cichu.
    """
    if not jest_trybem_stanowiska(urzadzenia):
        return
    obce = tuple(
        type(zdarzenie).__name__
        for zdarzenie in zdarzenia
        if not isinstance(zdarzenie, ZDARZENIA_TRYBU_STANOWISKA)
    )
    if obce:
        raise OdmowaDynamiki(
            KOD_ZDARZENIE_SPRZECZNE,
            "Bieg stanowiska badawczego (sieć zasila źródło testowe) przyjmuje wyłącznie "
            "profil źródła testowego i komendy regulacji badanego urządzenia; zakłócenia "
            f"sieci {sorted(set(obce))} należą do biegu trybu sieci — mieszanie trybów "
            "daloby wynik dwóch badań naraz",
            zdarzenia=tuple(sorted(set(obce))),
        )


def szablony_akcji_dozorow(
    dozory: tuple[Dozor, ...],
    *,
    wezly: tuple[WezelDynamiki, ...],
    galezie: tuple[GalazDynamiki, ...],
    odsprzegi: tuple[OdsprzegDynamiki, ...],
    odbiory: tuple[OdbiorDynamiki, ...],
    urzadzenia: tuple[Urzadzenie, ...],
    s_bazowa_mva: float,
    horyzont_s: float,
    indeks_bazowy: int,
) -> tuple[tuple[WpisHarmonogramu, ...], ...]:
    """Akcje KAZDEGO dozoru jako wpisy z chwila wzgledna 0 — walidowane PRZED biegiem.

    Ta sama funkcja (`wpisy_zdarzenia`), ta sama odmowa, co zdarzenia planowane: akcja
    wskazujaca galaz spoza modelu albo niedozwolone przypisanie stanu konczy bieg odmowa
    nazwana w chwili budowy, a nie w chwili pobudzenia (bieg policzony do polowy, a potem
    odrzucony, bylby kosztem bez wyniku). Wielkosc dozorowana musi istniec w modelu
    (wezel, galaz, urzadzenie, nazwa stanu); identyfikatory dozorow sa unikalne; w trybie
    stanowiska akcje podlegaja temu samemu rozdzieleniu trybow, co harmonogram.
    """
    kontekst = KontekstHarmonogramu.z_wejscia(
        wezly=wezly,
        galezie=galezie,
        odsprzegi=odsprzegi,
        odbiory=odbiory,
        urzadzenia=urzadzenia,
        s_bazowa_mva=s_bazowa_mva,
        horyzont_s=horyzont_s,
    )
    identy = [dozor.ident for dozor in dozory]
    powtorzone = sorted({ident for ident in identy if identy.count(ident) > 1})
    if powtorzone:
        raise OdmowaDynamiki(
            KOD_ZDARZENIE_SPRZECZNE,
            f"Dozory o powtorzonych identyfikatorach {powtorzone} — pobudzenie i przekroczenie "
            "nie mialyby jednoznacznego adresu",
            dozory=tuple(powtorzone),
        )
    szablony: list[tuple[WpisHarmonogramu, ...]] = []
    for indeks, dozor in enumerate(dozory):
        _sprawdz_wielkosc_dozoru(dozor, kontekst)
        wpisy: list[WpisHarmonogramu] = []
        for akcja in dozor.akcje:
            wpisy.extend(
                wpisy_zdarzenia(
                    akcja, indeks_bazowy + indeks, kontekst, przyczyna=f"dozor:{dozor.ident}"
                )
            )
        sprawdz_tryb_stanowiska(dozor.akcje, urzadzenia)
        szablony.append(tuple(wpisy))
    return tuple(szablony)


def _sprawdz_wielkosc_dozoru(dozor: Dozor, kontekst: KontekstHarmonogramu) -> None:
    wielkosc = dozor.wielkosc
    if isinstance(wielkosc, ModulNapieciaWezla | CzestotliwoscElektrycznaWezla):
        kontekst.sprawdz(wielkosc.wezel, set(kontekst.napiecia_wezlow), "wezel")
        return
    if isinstance(wielkosc, ModulPraduZacisku):
        kontekst.sprawdz(wielkosc.galaz, set(kontekst.galezie), "galaz")
        if wielkosc.zacisk not in ("od", "do"):
            raise OdmowaDynamiki(
                KOD_ZDARZENIE_SPRZECZNE,
                f"Dozor {dozor.ident!r}: zacisk {wielkosc.zacisk!r} spoza {{od, do}} — prąd "
                "gałęzi czyta się z JAWNIE nazwanego zacisku",
                dozor=dozor.ident,
            )
        return
    if isinstance(wielkosc, StanUrzadzenia | MocUrzadzenia):
        kontekst.sprawdz(wielkosc.urzadzenie, set(kontekst.urzadzenia), "urzadzenie")
        urzadzenie = kontekst.urzadzenia[wielkosc.urzadzenie]
        if isinstance(wielkosc, StanUrzadzenia) and wielkosc.stan not in urzadzenie.nazwy_stanow:
            raise OdmowaDynamiki(
                KOD_ZDARZENIE_BEZ_ELEMENTU,
                f"Dozor {dozor.ident!r} wskazuje stan {wielkosc.stan!r} urządzenia "
                f"{wielkosc.urzadzenie!r}, którego urządzenie nie ma "
                f"(stany: {urzadzenie.nazwy_stanow})",
                ref=f"{wielkosc.urzadzenie}.{wielkosc.stan}",
                rodzina="stan urządzenia",
            )
        if isinstance(wielkosc, MocUrzadzenia) and wielkosc.skladowa not in ("p", "q"):
            raise OdmowaDynamiki(
                KOD_ZDARZENIE_SPRZECZNE,
                f"Dozor {dozor.ident!r}: składowa mocy {wielkosc.skladowa!r} spoza {{p, q}}",
                dozor=dozor.ident,
            )
        return
    raise AssertionError(f"Nieznana wielkość dozoru: {wielkosc!r}")  # pragma: no cover


def wpisy_zdarzenia(
    zdarzenie: ZdarzenieDynamiki,
    indeks: int,
    kontekst: KontekstHarmonogramu,
    *,
    przyczyna: str,
) -> tuple[WpisHarmonogramu, ...]:
    """Wpisy JEDNEGO zdarzenia (planowanego albo akcji dozoru) z walidacja referencji.

    Jedna droga dla harmonogramu i dla akcji zdarzen warunkowych: akcja dozoru jest
    walidowana przy budowie biegu (ta sama funkcja, ta sama odmowa), a w chwili pobudzenia
    przesuwana w czasie — nie ma drugiego, rownoleglego rozwiniecia zdarzen.
    """
    horyzont_s = kontekst.horyzont_s
    if isinstance(zdarzenie, ZwarcieWezla):
        kontekst.sprawdz(zdarzenie.wezel, set(kontekst.napiecia_wezlow), "wezel")
        if zdarzenie.typ != TYP_ZWARCIA_TROJFAZOWEGO:
            raise OdmowaDynamiki(
                KOD_ZWARCIE_NIESYMETRYCZNE,
                f"Zwarcie typu {zdarzenie.typ!r} w węźle {zdarzenie.wezel!r} wymaga "
                "składowych symetrycznych — rdzeń liczy wyłącznie zwarcia "
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
                kontekst.napiecia_wezlow[zdarzenie.wezel],
                kontekst.s_bazowa_mva,
            )
        )
        wpisy = [
            _wpis(
                zdarzenie.t_s,
                indeks,
                "zwarcie",
                zdarzenie.wezel,
                przyczyna=przyczyna,
                admitancja_pu=admitancja,
            )
        ]
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
                _wpis(
                    zdarzenie.t_usuniecia_s,
                    indeks,
                    "zdjecie_zwarcia",
                    zdarzenie.wezel,
                    przyczyna=przyczyna,
                    sposob_usuniecia=zdarzenie.sposob_usuniecia,
                )
            )
        return tuple(wpisy)
    if isinstance(zdarzenie, ZwarcieGalezi):
        return _wpisy_zwarcia_galezi(zdarzenie, indeks, kontekst, przyczyna=przyczyna)
    if isinstance(zdarzenie, ZmianaGalezi):
        kontekst.sprawdz(zdarzenie.galaz, set(kontekst.galezie), "galaz")
        return (
            _wpis(
                zdarzenie.t_s,
                indeks,
                "zalaczenie_galezi" if zdarzenie.zalaczona else "wylaczenie_galezi",
                zdarzenie.galaz,
                przyczyna=przyczyna,
            ),
        )
    if isinstance(zdarzenie, ZmianaOdsprzegu):
        kontekst.sprawdz(zdarzenie.odsprzeg, kontekst.identy_odsprzegow, "odsprzeg")
        return (
            _wpis(
                zdarzenie.t_s,
                indeks,
                "zalaczenie_odsprzegu" if zdarzenie.zalaczony else "wylaczenie_odsprzegu",
                zdarzenie.odsprzeg,
                przyczyna=przyczyna,
            ),
        )
    if isinstance(zdarzenie, ZmianaOdbioru):
        kontekst.sprawdz(zdarzenie.odbior, kontekst.identy_odbiorow, "odbior")
        return (
            _wpis(
                zdarzenie.t_s,
                indeks,
                "zalaczenie_odbioru" if zdarzenie.zalaczony else "odlaczenie_odbioru",
                zdarzenie.odbior,
                przyczyna=przyczyna,
            ),
        )
    if isinstance(zdarzenie, OdlaczenieZrodla):
        kontekst.sprawdz(zdarzenie.zrodlo, set(kontekst.urzadzenia), "zrodlo")
        return (
            _wpis(
                zdarzenie.t_s, indeks, "odlaczenie_zrodla", zdarzenie.zrodlo, przyczyna=przyczyna
            ),
        )
    if isinstance(zdarzenie, UtrataCzesciowaZrodla):
        kontekst.sprawdz(zdarzenie.zrodlo, set(kontekst.urzadzenia), "zrodlo")
        urzadzenie = kontekst.urzadzenia[zdarzenie.zrodlo]
        if not urzadzenie.agregat_jednostek or urzadzenie.sprzezenie != "pradowe":
            raise OdmowaDynamiki(
                KOD_UDZIAL_ZRODLA_NIEDOZWOLONY,
                f"Częściowa utrata źródła {zdarzenie.zrodlo!r} ({type(urzadzenie).__name__}) "
                f"w t={zdarzenie.t_s} s: urządzenie nie jest agregatem identycznych jednostek "
                "o sprzezeniu pradowym (ekwiwalent sieci nadrzednej albo źródło testowe) — "
                "ubytek czesci jednostek nie opisuje żadnego zjawiska",
                zrodlo=zdarzenie.zrodlo,
                klasa=type(urzadzenie).__name__,
                t_s=zdarzenie.t_s,
            )
        return (
            _wpis(
                zdarzenie.t_s,
                indeks,
                "utrata_czesciowa_zrodla",
                zdarzenie.zrodlo,
                przyczyna=przyczyna,
                udzial=zdarzenie.udzial_pozostaly,
            ),
        )
    if isinstance(zdarzenie, SkokObciazenia):
        kontekst.sprawdz(zdarzenie.odbior, kontekst.identy_odbiorow, "odbior")
        return (
            _wpis(
                zdarzenie.t_s,
                indeks,
                "skok_obciazenia",
                zdarzenie.odbior,
                przyczyna=przyczyna,
                delta_mocy_pu=complex(zdarzenie.delta_p_pu, zdarzenie.delta_q_pu),
            ),
        )
    if isinstance(zdarzenie, PrzypisanieStanu):
        kontekst.sprawdz(zdarzenie.urzadzenie, set(kontekst.urzadzenia), "urzadzenie")
        sprawdz_przypisanie(
            kontekst.urzadzenia[zdarzenie.urzadzenie],
            zdarzenie.stan,
            zdarzenie.wartosc,
            zdarzenie.t_s,
        )
        return (
            _wpis(
                zdarzenie.t_s,
                indeks,
                "przypisanie_stanu",
                zdarzenie.urzadzenie,
                przyczyna=przyczyna,
                przypisania=((zdarzenie.stan, zdarzenie.wartosc),),
            ),
        )
    if isinstance(zdarzenie, KomendaRegulacji):
        kontekst.sprawdz(zdarzenie.urzadzenie, set(kontekst.urzadzenia), "urzadzenie")
        urzadzenie = kontekst.urzadzenia[zdarzenie.urzadzenie]
        nastawy: list[tuple[str, float]] = []
        for wielkosc, wartosc in (
            (
                "p",
                None if zdarzenie.p_mw is None else moc_pu(zdarzenie.p_mw, kontekst.s_bazowa_mva),
            ),
            (
                "q",
                (
                    None
                    if zdarzenie.q_mvar is None
                    else moc_pu(zdarzenie.q_mvar, kontekst.s_bazowa_mva)
                ),
            ),
            ("u", zdarzenie.u_pu),
        ):
            if wartosc is None:
                continue
            nastawa_regulacji(urzadzenie, wielkosc, zdarzenie.t_s)  # type: ignore[arg-type]
            _sprawdz_skonczona(wartosc, f"{zdarzenie.urzadzenie}.{wielkosc}", zdarzenie.t_s)
            nastawy.append((wielkosc, wartosc))
        return (
            _wpis(
                zdarzenie.t_s,
                indeks,
                "komenda_regulacji",
                zdarzenie.urzadzenie,
                przyczyna=przyczyna,
                przypisania=tuple(nastawy),
            ),
        )
    raise AssertionError(f"Nieznany rodzaj zdarzenia: {zdarzenie!r}")  # pragma: no cover


def _sprawdz_skonczona(wartosc: float, adres: str, t_s: float) -> None:
    """Wartosc przypisania musi byc liczba skonczona — NaN albo nieskonczonosc to blad danych."""
    if not math.isfinite(wartosc):
        raise OdmowaDynamiki(
            KOD_ZDARZENIE_SPRZECZNE,
            f"Przypisanie {adres} w t={t_s} s: wartość {wartosc!r} nie jest liczba skończona",
            adres=adres,
            t_s=t_s,
        )


def sprawdz_przypisanie(urzadzenie: Urzadzenie, stan: str, wartosc: float, t_s: float) -> None:
    """Predykat przypisania: stan z deklaracji `stany_przypisywalne`, wartosc skonczona i
    w granicach ogranicznika stanu (`granice_stanow`), jesli klasa go deklaruje.

    JEDEN predykat dla budowy harmonogramu (urzadzenie wejscia) i dla wykonania w chwili
    (urzadzenie tej chwili — odlaczone nie ma stanow przypisywalnych). Stan z ogranicznikiem
    nie moze dostac wartosci spoza niego: ogranicznik jest czescia modelu, a wartosc poza
    nim bylaby stanem, ktorego model nie dopuszcza (np. amplituda ujemna zrodla testowego).
    """
    if stan not in urzadzenie.stany_przypisywalne:
        raise OdmowaDynamiki(
            KOD_ZDARZENIE_PRZYPISANIA_NIEDOZWOLONE,
            f"Przypisanie stanu {stan!r} urządzenia {urzadzenie.ident!r} "
            f"({type(urzadzenie).__name__}) w t={t_s} s jest niedozwolone — klasa deklaruje "
            f"jako przypisywalne wyłącznie {urzadzenie.stany_przypisywalne}; skok strumienia, "
            "kąta, predkosci albo stanu naladowania wymagalby nieskonczonej wielkości fizycznej",
            urzadzenie=urzadzenie.ident,
            stan=stan,
            dozwolone=urzadzenie.stany_przypisywalne,
            t_s=t_s,
        )
    _sprawdz_skonczona(wartosc, f"{urzadzenie.ident}.{stan}", t_s)
    granica = urzadzenie.granice_stanow[urzadzenie.nazwy_stanow.index(stan)]
    if granica is not None and not (granica[0] <= wartosc <= granica[1]):
        raise OdmowaDynamiki(
            KOD_ZDARZENIE_SPRZECZNE,
            f"Przypisanie {urzadzenie.ident}.{stan} = {wartosc} w t={t_s} s lezy poza "
            f"ogranicznikiem stanu [{granica[0]}, {granica[1]}] — model nie dopuszcza takiego "
            "stanu, a przyciecie po cichu zmieniloby zadana wartość",
            adres=f"{urzadzenie.ident}.{stan}",
            wartosc=wartosc,
            granica=granica,
            t_s=t_s,
        )


def nastawa_regulacji(urzadzenie: Urzadzenie, wielkosc: WielkoscNastawy, t_s: float) -> str:
    """Stan-odniesienie wielkosci `wielkosc` z DEKLARACJI urzadzenia — albo nazwana odmowa."""
    for nastawa in urzadzenie.nastawy_regulacji:
        if nastawa.wielkosc != wielkosc:
            continue
        if nastawa.stan is None:
            raise OdmowaDynamiki(
                KOD_NASTAWA_NIEOBSLUGIWANA,
                f"Komenda regulacji {wielkosc.upper()} urządzenia {urzadzenie.ident!r} "
                f"({type(urzadzenie).__name__}) w t={t_s} s jest nieobslugiwana: "
                f"{nastawa.powod_pl}",
                urzadzenie=urzadzenie.ident,
                klasa=type(urzadzenie).__name__,
                wielkosc=wielkosc,
                powod=nastawa.powod_pl,
                t_s=t_s,
            )
        return nastawa.stan
    raise AssertionError(  # pragma: no cover — deklaracja kompletna przypieta testem
        f"Urządzenie {urzadzenie.ident!r} nie deklaruje nastawy {wielkosc!r} "
        f"(wymagane: {WIELKOSCI_NASTAW})"
    )


def _sprawdz_udzialy_malejace(wpisy: tuple[WpisHarmonogramu, ...]) -> None:
    """Czesciowa utrata planowana: zrodlo nieodlaczone i udzial scisle malejacy w czasie.

    Ten sam predykat (`_sprawdz_utrate`) sprawdza wpis w chwili wykonania (`zastosuj`) —
    tutaj harmonogram planowany odmawia PRZED biegiem, zamiast po policzeniu jego czesci.
    Kolejnosc = kolejnosc wykonania (stabilnie po czasie, remis wg indeksu zapisu).
    """
    udzialy: dict[str, float] = {}
    odlaczone: set[str] = set()
    for wpis in wpisy:
        if wpis.rodzaj == "odlaczenie_zrodla":
            odlaczone.add(wpis.ref)
            continue
        if wpis.rodzaj != "utrata_czesciowa_zrodla":
            continue
        assert wpis.udzial is not None  # gwarantuje budowa wpisu
        _sprawdz_utrate(
            wpis.ref, wpis.ref in odlaczone, udzialy.get(wpis.ref, 1.0), wpis.udzial, wpis.t_s
        )
        udzialy[wpis.ref] = wpis.udzial


def _sprawdz_utrate(
    zrodlo: str, odlaczone: bool, poprzedni: float, nowy: float, t_s: float
) -> None:
    """JEDEN predykat czesciowej utraty: zrodlo nieodlaczone, udzial scisle malejacy."""
    if odlaczone:
        raise OdmowaDynamiki(
            KOD_UDZIAL_ZRODLA_NIEDOZWOLONY,
            f"Częściowa utrata źródła {zrodlo!r} w t={t_s} s: źródło jest już odlaczone od "
            "sieci — nie ma jednostek, które moglyby wypasc",
            zrodlo=zrodlo,
            t_s=t_s,
        )
    if not nowy < poprzedni:
        raise OdmowaDynamiki(
            KOD_UDZIAL_ZRODLA_NIEDOZWOLONY,
            f"Częściowa utrata źródła {zrodlo!r} w t={t_s} s: udział {nowy} nie jest mniejszy "
            f"od dotychczasowego {poprzedni} — wzrost udziału to ponowne przyłączenie "
            "jednostek (kryteria synchronizacji poza tym rdzeniem), a równy udział nie jest "
            "zdarzeniem",
            zrodlo=zrodlo,
            udzial_poprzedni=poprzedni,
            udzial_nowy=nowy,
            t_s=t_s,
        )


def _wpisy_zwarcia_galezi(
    zdarzenie: ZwarcieGalezi,
    indeks: int,
    kontekst: KontekstHarmonogramu,
    *,
    przyczyna: str,
) -> tuple[WpisHarmonogramu, ...]:
    """Wpisy zalozenia i (opcjonalnie) zdjecia zwarcia w galezi `x*L`.

    Odmowy nazwane: galaz spoza modelu (`zdarzenie_bez_elementu`), typ inny niz 3F
    (`zwarcie_niesymetryczne_nieobslugiwane`), galaz inna niz linia/kabel albo z
    przekladnia (`zwarcie_galezi_nieobslugiwane`), zdjecie poza horyzontem.
    Impedancja zwarcia przeliczana w bazie napiecia zacisku `od` (linia i kabel lacza
    wezly tego samego napiecia znamionowego — przekladnia 1 jest warunkiem wyzej).
    """
    galaz = kontekst.galezie.get(zdarzenie.galaz)
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
            kontekst.napiecia_wezlow[galaz.wezel_od],
            kontekst.s_bazowa_mva,
        )
    )
    wpisy = [
        _wpis(
            zdarzenie.t_s,
            indeks,
            "zwarcie_galezi",
            zdarzenie.galaz,
            przyczyna=przyczyna,
            admitancja_pu=admitancja,
            polozenie_wzgledne=zdarzenie.polozenie_wzgledne,
        )
    ]
    if zdarzenie.t_usuniecia_s is not None:
        if zdarzenie.t_usuniecia_s > kontekst.horyzont_s:
            raise OdmowaDynamiki(
                KOD_ZDARZENIE_BEZ_ELEMENTU,
                f"Zdjecie zwarcia w t={zdarzenie.t_usuniecia_s} s wykracza poza horyzont "
                f"{kontekst.horyzont_s} s",
                t_s=zdarzenie.t_usuniecia_s,
                horyzont_s=kontekst.horyzont_s,
            )
        wpisy.append(
            _wpis(
                zdarzenie.t_usuniecia_s,
                indeks,
                "zdjecie_zwarcia_galezi",
                zdarzenie.galaz,
                przyczyna=przyczyna,
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
    if wpis.rodzaj == "utrata_czesciowa_zrodla":
        if wpis.udzial is None:  # pragma: no cover — gwarantowane budowa wpisu
            raise AssertionError("Wpis częściowej utraty bez udziału")
        _sprawdz_utrate(
            wpis.ref,
            wpis.ref in stan.zrodla_odlaczone,
            stan.udzial_zrodla(wpis.ref),
            wpis.udzial,
            wpis.t_s,
        )
        pozostale_udzialy = tuple(
            pozycja for pozycja in stan.udzialy_zrodel if pozycja[0] != wpis.ref
        )
        return replace(
            stan,
            udzialy_zrodel=tuple(
                sorted((*pozostale_udzialy, (wpis.ref, wpis.udzial)), key=lambda p: p[0])
            ),
        )
    if wpis.rodzaj in RODZAJE_PRZYPISAN:
        # Przypisanie i komenda zmieniaja STAN URZADZENIA, nie topologie — silnik nanosi je
        # na stany po zdarzeniach topologicznych chwili (`silnik._przypisz`).
        return stan
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


def urzadzenia_w_stanie(
    urzadzenia: tuple[Urzadzenie, ...], stan: StanScenariusza
) -> tuple[Urzadzenie, ...]:
    """Urzadzenia chwili zlozone OD NOWA z urzadzen wejscia i stanu scenariusza.

    Zrodlo odlaczone -> `UrzadzenieOdlaczone` (wlasna dynamika, prad zerowy); zrodlo po
    czesciowej utracie -> `UrzadzenieCzesciowe` z udzialem pozostalym; pozostale bez
    zmian. Skladanie od nowa (jak sieci) czyni wynik niezaleznym od historii opakowan:
    utrata czesciowa i pozniejsze odlaczenie daja urzadzenie odlaczone, bo prad odlaczonego
    agregatu jest zerowy niezaleznie od udzialu, a stany na jednostke sa te same.
    """
    wynik: list[Urzadzenie] = []
    for urzadzenie in urzadzenia:
        if urzadzenie.ident in stan.zrodla_odlaczone:
            wynik.append(UrzadzenieOdlaczone(urzadzenie))
            continue
        udzial = stan.udzial_zrodla(urzadzenie.ident)
        wynik.append(urzadzenie if udzial == 1.0 else UrzadzenieCzesciowe(urzadzenie, udzial))
    return tuple(wynik)


__all__ = [
    "PRZYCZYNA_HARMONOGRAM",
    "RODZAJE_PRZYPISAN",
    "TYP_ZWARCIA_TROJFAZOWEGO",
    "KontekstHarmonogramu",
    "RodzajWpisu",
    "StanScenariusza",
    "WpisHarmonogramu",
    "ZDARZENIA_TRYBU_STANOWISKA",
    "jest_trybem_stanowiska",
    "nastawa_regulacji",
    "odbiory_po_zdarzeniach",
    "sprawdz_przypisanie",
    "sprawdz_tryb_stanowiska",
    "szablony_akcji_dozorow",
    "stan_poczatkowy_scenariusza",
    "urzadzenia_w_stanie",
    "wpisy_zdarzenia",
    "zastosuj",
    "zbuduj_harmonogram",
]
