"""§11.3/4 — ocena FRT KONSUMUJE ślad realnego biegu, a nie tablice z palca.

KOD BADAWCZY — patrz `backend/research/README.md`.

CO BYŁO NIE TAK
---------------
`frt.py` jest po trzech rundach audytu szczelny WEWNĄTRZ: obwiednia i przebieg
mają różne typy, ekstrapolacja jest błędem, stan przyłączenia jest dziennikiem,
prąd wsparcia ma prawo znaku, brak danych daje ``NIEROZSTRZYGALNE``. Ale WEJŚCIE
do niego było budowane ręcznie: ``PrzebiegNapiecia(czas_s=…, wartosci_pu=…)``.
Nic nie łączyło ocenianego przebiegu z BIEGIEM, który go rzekomo policzył, więc
cała szczelność orzekała o tablicach nieznanego pochodzenia.

To jest ta sama klasa co §11.3/3 (pomiar wpisywany ręcznie), przeniesiona o
warstwę wyżej: tam fałszowało się LICZBĘ, tu — SZEREG.

CO ROBI TEN MODUŁ
-----------------
Jedna droga od ``WynikDynamiczny`` do wejść ``ocen_zdolnosc_frt``:

1. **Kanały są ZADEKLAROWANE, per kryterium.** ``KANALY_KRYTERIOW`` mówi, jakich
   sygnałów (klucz, przestrzeń, jednostka, element) wymaga każde kryterium.
   Kryterium bez kompletu kanałów jest NIEORZEKALNE — z podaniem, którego kanału
   zabrakło, a nie „brak danych".
2. **Powód nieorzekalności jest MASZYNOWO CZYTELNY.** ``PowodNieorzekalnosci``
   jest zamkniętym słownikiem; każdy brak niesie kryterium, kanał i zdanie po
   polsku. Konsument może rozgałęzić kod na powodzie, zamiast parsować tekst.
3. **Własności BIEGU też są warunkiem orzekania.** Bieg niezbieżny, przebieg
   przerwany błędem i bieg z krokami poniżej zadeklarowanej tolerancji nie są
   materiałem dowodowym — niezależnie od tego, jak ładnie wyglądają próbki.
   Przed tą zmianą nikt tych pól nie czytał, bo wejście FRT ich nie widziało.
4. **Semantyka przedziału jest jawna.** Okno oceny to ``[t_zakłócenia,
   t_zakłócenia + horyzont]``, domknięte z obu stron, z tolerancją
   ``frt.TOLERANCJA_CZASU_S``. Ślad musi je pokrywać CAŁE: zaczynać się nie
   później niż w chwili zakłócenia i kończyć nie wcześniej niż na końcu okna.
   Warunek jest sprawdzany TUTAJ, na osi czasu biegu, a nie dopiero w ocenie
   pojedynczego kryterium — inaczej „ślad kończy się w połowie okna" byłoby
   wykrywane osobno przez każde kryterium, każdym własnym kodem.

CZEGO TEN MODUŁ NIE UDAJE
-------------------------
**Stanu przyłączenia NIE DA SIĘ odtworzyć ze śladu biegu laboratorium.** Silnik
nie zapisuje stanu łącznika modułu jako sygnału, a wyprowadzanie go ze zdarzeń
(„było wyłączenie gałęzi, więc moduł się odłączył") byłoby zgadywaniem: gałąź
może być inna niż przyłącze, a odłączenie modułu może nastąpić bez zdarzenia
sieciowego. Dlatego dziennik przyłączenia pozostaje ODDZIELNYM wejściem, a jego
brak przy kryterium wymaganym daje ``BRAK_DZIENNIKA_PRZYLACZENIA`` — jawny brak,
nie domysł. To jest zmierzone ograniczenie laboratorium, a nie luka do obejścia.

**Fazora prądu też nie ma w śladzie** — zapisywany jest moduł ``|I|``. Prąd
wsparcia liczy się więc z tożsamości ``I_q = Q/|V|``, tej samej, która jest
wyprowadzona w ``frt.prad_wsparcia_z_fazora``; zgodność obu dróg jest przypięta
testem.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from dynamic_lab.frt import (
    KRYTERIUM_OBWIEDNIA,
    KRYTERIUM_ODBUDOWA_MOCY,
    KRYTERIUM_PRAD_WSPARCIA,
    KRYTERIUM_STAN_PRZYLACZENIA,
    TOLERANCJA_CZASU_S,
    DziennikPrzylaczenia,
    OcenaZdolnosciFrt,
    PrzebiegNapiecia,
    PrzebiegPraduWsparcia,
    PrzebiegSkalarny,
    StatusKryterium,
    WerdyktFrt,
    WierszWhiteBox,
    WymaganieZdolnosciFrt,
    ocen_zdolnosc_frt,
)
from dynamic_lab.wynik import (
    KompletnoscPrzebiegu,
    PrzestrzenSygnalu,
    Sygnal,
    WynikDynamiczny,
)

__all__ = [
    "KANALY_KRYTERIOW",
    "Kanal",
    "NieorzekalnoscZBiegu",
    "PowodNieorzekalnosci",
    "WejsciaFrtZBiegu",
    "ocen_frt_z_biegu",
    "wyciagnij_wejscia_frt",
]


class PowodNieorzekalnosci(StrEnum):
    """Dlaczego ze ŚLADU BIEGU nie da się orzec — słownik ZAMKNIĘTY.

    Zamknięty, bo konsument ma rozgałęziać kod na powodzie. Nowy powód dokładany
    tu jest zmianą kontraktu i musi być widoczny, a nie doklejony jako kolejne
    zdanie w polu tekstowym.
    """

    BIEG_NIEZBIEZNY = "bieg_niezbiezny"
    PRZEBIEG_PRZERWANY = "przebieg_przerwany_bledem"
    KROKI_PONIZEJ_TOLERANCJI = "kroki_ponizej_zadeklarowanej_tolerancji"
    SLAD_ZACZYNA_SIE_PO_ZAKLOCENIU = "slad_zaczyna_sie_po_chwili_zaklocenia"
    SLAD_KONCZY_SIE_PRZED_KONCEM_OKNA = "slad_konczy_sie_przed_koncem_okna"
    BRAK_KANALU = "brak_wymaganego_kanalu"
    KANAL_W_INNEJ_PRZESTRZENI = "kanal_istnieje_ale_w_innej_przestrzeni"
    KANAL_NIEJEDNOZNACZNY = "kanal_wystepuje_wielokrotnie_w_wymaganej_przestrzeni"
    NIEZGODNA_JEDNOSTKA = "kanal_ma_inna_jednostke_niz_wymagana"
    BRAK_DZIENNIKA_PRZYLACZENIA = "brak_dziennika_przylaczenia"
    ZA_MALO_PROBEK = "slad_ma_mniej_niz_dwie_probki"


@dataclass(frozen=True)
class Kanal:
    """Jeden sygnał, którego kryterium WYMAGA — z jednostką i przestrzenią.

    Jednostka jest częścią wymagania, nie opisem: kanał ``u_pu`` w kV zamiast
    p.u. przechodziłby każdą kontrolę długości i monotoniczności, a orzekałby
    o czym innym.
    """

    klucz: str
    przestrzen: PrzestrzenSygnalu
    jednostka: str
    element: str
    """``"szyna"`` albo ``"modul"`` — z którego elementu brać sygnał."""
    opis_pl: str


KANAL_NAPIECIE = Kanal(
    klucz="u_pu",
    przestrzen=PrzestrzenSygnalu.WYJSCIE,
    jednostka="p.u.",
    element="szyna",
    opis_pl="moduł napięcia na szynie przyłączenia",
)
KANAL_MOC_CZYNNA = Kanal(
    klucz="p_pu",
    przestrzen=PrzestrzenSygnalu.WYJSCIE,
    jednostka="p.u.",
    element="modul",
    opis_pl="moc czynna wstrzykiwana przez moduł",
)
KANAL_MOC_BIERNA = Kanal(
    klucz="q_pu",
    przestrzen=PrzestrzenSygnalu.WYJSCIE,
    jednostka="p.u.",
    element="modul",
    opis_pl="moc bierna wstrzykiwana przez moduł",
)

KANALY_KRYTERIOW: dict[str, tuple[Kanal, ...]] = {
    KRYTERIUM_OBWIEDNIA: (KANAL_NAPIECIE,),
    KRYTERIUM_ODBUDOWA_MOCY: (KANAL_MOC_CZYNNA,),
    # Prąd wsparcia liczy się z tożsamości Q/|V|, więc wymaga OBU kanałów.
    KRYTERIUM_PRAD_WSPARCIA: (KANAL_MOC_BIERNA, KANAL_NAPIECIE),
    # Stan przyłączenia NIE MA kanału w śladzie — patrz nagłówek modułu.
    KRYTERIUM_STAN_PRZYLACZENIA: (),
}


@dataclass(frozen=True)
class NieorzekalnoscZBiegu:
    """Jeden powód, dla którego kryterium nie da się orzec z tego biegu."""

    kryterium: str
    powod: PowodNieorzekalnosci
    szczegol_pl: str
    kanal: Kanal | None = None

    def jako_slownik(self) -> dict[str, str | None]:
        return {
            "kryterium": self.kryterium,
            "powod": self.powod.value,
            "kanal": None if self.kanal is None else self.kanal.klucz,
            "szczegol_pl": self.szczegol_pl,
        }


@dataclass(frozen=True)
class WejsciaFrtZBiegu:
    """Wejścia oceny FRT wydobyte ze śladu — albo jawna lista powodów, czemu ich nie ma."""

    przebieg_napiecia: PrzebiegNapiecia | None
    przebieg_mocy: PrzebiegSkalarny | None
    przebieg_pradu_wsparcia: PrzebiegPraduWsparcia | None
    napiecie_przed_zaklocaniem_pu: float | None
    moc_przed_zaklocaniem_pu: float | None
    prad_wsparcia_przed_zaklocaniem_pu: float | None
    braki: tuple[NieorzekalnoscZBiegu, ...]

    @property
    def kompletne(self) -> bool:
        return not self.braki


def _sygnal_albo_brak(
    wynik: WynikDynamiczny,
    kanal: Kanal,
    *,
    element_ref: str,
    kryterium: str,
) -> tuple[Sygnal | None, NieorzekalnoscZBiegu | None]:
    """Pobierz kanał ze śladu, meldując KTÓRY warunek nie został spełniony.

    Trzy rozłączne przyczyny, bo wymagają różnych reakcji: kanału nie ma w ogóle,
    kanał jest niejednoznaczny (ten sam klucz w dwóch przestrzeniach), kanał jest
    w innej jednostce. Zwinięcie ich do jednego „brak danych" kazałoby użytkownikowi
    zgadywać, czy dołożyć sygnał, czy poprawić model.
    """
    trafienia = [
        s for s in wynik.sygnaly if s.klucz == kanal.klucz and s.element_ref == element_ref
    ]
    if not trafienia:
        return None, NieorzekalnoscZBiegu(
            kryterium=kryterium,
            powod=PowodNieorzekalnosci.BRAK_KANALU,
            kanal=kanal,
            szczegol_pl=(
                f'Ślad biegu nie zawiera sygnału „{kanal.klucz}" ({kanal.opis_pl}) dla '
                f'elementu „{element_ref}". Bez niego kryterium „{kryterium}" nie ma '
                f"czego oceniać."
            ),
        )
    w_przestrzeni = [s for s in trafienia if s.przestrzen is kanal.przestrzen]
    if not w_przestrzeni:
        obecne = sorted({s.przestrzen.value for s in trafienia})
        return None, NieorzekalnoscZBiegu(
            kryterium=kryterium,
            powod=PowodNieorzekalnosci.KANAL_W_INNEJ_PRZESTRZENI,
            kanal=kanal,
            szczegol_pl=(
                f'Sygnał „{kanal.klucz}"@{element_ref} istnieje w przestrzeni '
                f'{obecne}, a kryterium wymaga „{kanal.przestrzen.value}". Zmienna '
                f"stanu o tej samej nazwie NIE JEST tą samą wielkością co wyjście modelu "
                f"— falownik ma stany nazwane jak wyjścia i podstawienie jednego za "
                f"drugie już raz dało w laboratorium serię przeplataną próbka po próbce. "
                f"Powód jest ODRĘBNY od braku kanału, bo reakcja jest inna: tu trzeba "
                f"poprawić zapytanie, tam — dołożyć sygnał."
            ),
        )
    if len(w_przestrzeni) > 1:
        return None, NieorzekalnoscZBiegu(
            kryterium=kryterium,
            powod=PowodNieorzekalnosci.KANAL_NIEJEDNOZNACZNY,
            kanal=kanal,
            szczegol_pl=(
                f'Sygnał „{kanal.klucz}"@{element_ref} występuje w śladzie '
                f"{len(w_przestrzeni)} razy w tej samej przestrzeni."
            ),
        )
    sygnal = w_przestrzeni[0]
    if sygnal.jednostka != kanal.jednostka:
        return None, NieorzekalnoscZBiegu(
            kryterium=kryterium,
            powod=PowodNieorzekalnosci.NIEZGODNA_JEDNOSTKA,
            kanal=kanal,
            szczegol_pl=(
                f'Sygnał „{kanal.klucz}"@{element_ref} jest w jednostce '
                f'„{sygnal.jednostka}", a kryterium wymaga „{kanal.jednostka}". '
                f"Liczba w innej jednostce przechodzi każdą kontrolę kształtu i "
                f"orzeka o czym innym."
            ),
        )
    return sygnal, None


def _braki_biegu(
    wynik: WynikDynamiczny, *, okno_od_s: float, okno_do_s: float
) -> list[NieorzekalnoscZBiegu]:
    """Własności BIEGU, które dyskwalifikują ślad niezależnie od kanałów."""
    braki: list[NieorzekalnoscZBiegu] = []
    diag = wynik.diagnostyka
    if not diag.zbiegl:
        braki.append(
            NieorzekalnoscZBiegu(
                kryterium="*",
                powod=PowodNieorzekalnosci.BIEG_NIEZBIEZNY,
                szczegol_pl=(
                    "Bieg nie osiągnął zbieżności — jego przebiegi nie są rozwiązaniem "
                    "zadanego układu, więc nie orzekają o zachowaniu modułu."
                ),
            )
        )
    if wynik.diagnostyka.kompletnosc is not KompletnoscPrzebiegu.PELNY:
        braki.append(
            NieorzekalnoscZBiegu(
                kryterium="*",
                powod=PowodNieorzekalnosci.PRZEBIEG_PRZERWANY,
                szczegol_pl=(
                    f'Przebieg jest oznaczony jako „{diag.kompletnosc.value}": solver '
                    f"przerwał bieg w {diag.czas_osiagniety_s} s z żądanych "
                    f"{diag.czas_zadany_s} s."
                ),
            )
        )
    if diag.kroki_na_podlodze_numerycznej > 0:
        braki.append(
            NieorzekalnoscZBiegu(
                kryterium="*",
                powod=PowodNieorzekalnosci.KROKI_PONIZEJ_TOLERANCJI,
                szczegol_pl=(
                    f"{diag.kroki_na_podlodze_numerycznej} kroków zatrzymało się na "
                    f"podłodze numerycznej (najgorsze rho = {diag.najgorsze_rho:.4g} > 1), "
                    f"czyli bieg NIE spełnia zadeklarowanej tolerancji. Werdykt zgodności "
                    f"z takiego biegu byłby werdyktem o liczbach, których dokładności "
                    f"nikt nie zna."
                ),
            )
        )
    if len(wynik.czas_s) < 2:
        braki.append(
            NieorzekalnoscZBiegu(
                kryterium="*",
                powod=PowodNieorzekalnosci.ZA_MALO_PROBEK,
                szczegol_pl=f"Ślad ma {len(wynik.czas_s)} próbek — to nie jest trajektoria.",
            )
        )
        return braki
    poczatek = wynik.czas_s[0]
    koniec = wynik.czas_s[-1]
    if poczatek > okno_od_s + TOLERANCJA_CZASU_S:
        braki.append(
            NieorzekalnoscZBiegu(
                kryterium="*",
                powod=PowodNieorzekalnosci.SLAD_ZACZYNA_SIE_PO_ZAKLOCENIU,
                szczegol_pl=(
                    f"Ślad zaczyna się w {poczatek} s, a zakłócenie następuje w "
                    f"{okno_od_s} s. Początku okna nie ma czym pokryć, a dopowiedzenie "
                    f"go wartością brzegową byłoby fabrykacją przebiegu."
                ),
            )
        )
    if koniec < okno_do_s - TOLERANCJA_CZASU_S:
        braki.append(
            NieorzekalnoscZBiegu(
                kryterium="*",
                powod=PowodNieorzekalnosci.SLAD_KONCZY_SIE_PRZED_KONCEM_OKNA,
                szczegol_pl=(
                    f"Ślad kończy się w {koniec} s, a okno oceny sięga {okno_do_s} s "
                    f"(zakłócenie {okno_od_s} s + horyzont). Brakujący ogon okna to brak "
                    f"danych, a nie spełnienie wymagania."
                ),
            )
        )
    return braki


def _wartosc_przed(
    czas_s: tuple[float, ...], wartosci: tuple[float, ...], *, chwila_s: float
) -> float | None:
    """Ostatnia próbka ŚCIŚLE przed chwilą zakłócenia — albo ``None``.

    Ściśle przed, bo próbka DOKŁADNIE w chwili zakłócenia może już nieść skutek
    zdarzenia (silnik zapisuje stan po przebudowie topologii). Wartość odniesienia
    wzięta stamtąd zaniżałaby moc przedzakłóceniową i czyniła kryterium odbudowy
    łatwiejszym — czyli otwierałaby się w stronę werdyktu pozytywnego.
    """
    kandydaci = [
        w for t, w in zip(czas_s, wartosci, strict=True) if t < chwila_s - TOLERANCJA_CZASU_S
    ]
    return kandydaci[-1] if kandydaci else None


def wyciagnij_wejscia_frt(
    wynik: WynikDynamiczny,
    *,
    szyna: str,
    modul_ref: str,
    wymaganie: WymaganieZdolnosciFrt,
    chwila_zaklocenia_s: float,
) -> WejsciaFrtZBiegu:
    """Zbuduj wejścia oceny FRT ze ŚLADU — z jawną listą braków, gdy się nie da."""
    okno_od = float(chwila_zaklocenia_s)
    okno_do = okno_od + float(wymaganie.horyzont_s)
    braki = _braki_biegu(wynik, okno_od_s=okno_od, okno_do_s=okno_do)

    czas = wynik.czas_s
    manifest = wymaganie.manifest

    def wymagane(kryterium: str) -> bool:
        return manifest.status(kryterium) is StatusKryterium.WYMAGANE

    napiecie: Sygnal | None = None
    for kryterium in (KRYTERIUM_OBWIEDNIA, KRYTERIUM_PRAD_WSPARCIA):
        if kryterium is KRYTERIUM_PRAD_WSPARCIA and not wymagane(kryterium):
            continue
        for kanal in KANALY_KRYTERIOW[kryterium]:
            if kanal is not KANAL_NAPIECIE:
                continue
            if napiecie is not None:
                continue
            sygnal, brak = _sygnal_albo_brak(wynik, kanal, element_ref=szyna, kryterium=kryterium)
            if brak is not None:
                braki.append(brak)
            napiecie = sygnal

    moc_czynna: Sygnal | None = None
    if wymagane(KRYTERIUM_ODBUDOWA_MOCY):
        moc_czynna, brak = _sygnal_albo_brak(
            wynik, KANAL_MOC_CZYNNA, element_ref=modul_ref, kryterium=KRYTERIUM_ODBUDOWA_MOCY
        )
        if brak is not None:
            braki.append(brak)

    moc_bierna: Sygnal | None = None
    if wymagane(KRYTERIUM_PRAD_WSPARCIA):
        moc_bierna, brak = _sygnal_albo_brak(
            wynik, KANAL_MOC_BIERNA, element_ref=modul_ref, kryterium=KRYTERIUM_PRAD_WSPARCIA
        )
        if brak is not None:
            braki.append(brak)

    if wymagane(KRYTERIUM_STAN_PRZYLACZENIA):
        braki.append(
            NieorzekalnoscZBiegu(
                kryterium=KRYTERIUM_STAN_PRZYLACZENIA,
                powod=PowodNieorzekalnosci.BRAK_DZIENNIKA_PRZYLACZENIA,
                szczegol_pl=(
                    "Ślad biegu laboratorium NIE zawiera stanu łącznika modułu, a "
                    "wyprowadzanie go ze zdarzeń sieciowych byłoby domysłem. Dziennik "
                    "przyłączenia trzeba podać osobno."
                ),
            )
        )

    przebieg_napiecia = (
        None
        if napiecie is None
        else PrzebiegNapiecia(
            czas_s=czas,
            napiecie_pu=napiecie.wartosci,
            zrodlo=f"bieg:{wynik.odcisk_scenariusza[:12]}",
            element_ref=szyna,
        )
    )
    przebieg_mocy = (
        None
        if moc_czynna is None
        else PrzebiegSkalarny(
            czas_s=czas,
            wartosci=moc_czynna.wartosci,
            wielkosc="moc czynna",
            jednostka="p.u.",
            zrodlo=f"bieg:{wynik.odcisk_scenariusza[:12]}",
            element_ref=modul_ref,
        )
    )
    przebieg_iq = (
        None
        if (moc_bierna is None or napiecie is None)
        else PrzebiegPraduWsparcia.z_mocy_biernej(
            czas_s=czas,
            moc_bierna_pu=moc_bierna.wartosci,
            napiecie_modul_pu=napiecie.wartosci,
            zrodlo=f"bieg:{wynik.odcisk_scenariusza[:12]}",
            element_ref=modul_ref,
        )
    )

    u_przed = (
        None if napiecie is None else _wartosc_przed(czas, napiecie.wartosci, chwila_s=okno_od)
    )
    p_przed = (
        None if moc_czynna is None else _wartosc_przed(czas, moc_czynna.wartosci, chwila_s=okno_od)
    )
    iq_przed = (
        None
        if przebieg_iq is None
        else _wartosc_przed(czas, przebieg_iq.wartosci_pu, chwila_s=okno_od)
    )

    return WejsciaFrtZBiegu(
        przebieg_napiecia=przebieg_napiecia,
        przebieg_mocy=przebieg_mocy,
        przebieg_pradu_wsparcia=przebieg_iq,
        napiecie_przed_zaklocaniem_pu=u_przed,
        moc_przed_zaklocaniem_pu=p_przed,
        prad_wsparcia_przed_zaklocaniem_pu=iq_przed,
        braki=tuple(braki),
    )


def ocen_frt_z_biegu(
    wynik: WynikDynamiczny,
    *,
    szyna: str,
    modul_ref: str,
    wymaganie: WymaganieZdolnosciFrt,
    chwila_zaklocenia_s: float,
    dziennik_przylaczenia: DziennikPrzylaczenia | None = None,
    chwila_wylaczenia_s: float | None = None,
) -> tuple[OcenaZdolnosciFrt, tuple[NieorzekalnoscZBiegu, ...]]:
    """Oceń FRT NA ŚLADZIE BIEGU. Zwraca ocenę ORAZ powody nieorzekalności.

    Powody wracają OSOBNO, a nie tylko w tekście oceny, bo konsument musi móc
    odróżnić „moduł nie spełnia" od „tego biegu nie da się ocenić" bez czytania
    zdań po polsku. Gdy ślad dyskwalifikuje się jako materiał (bieg niezbieżny,
    okno niepokryte, brak kanału), ocena NIE jest liczona wcale — liczenie jej na
    danych, o których wiadomo, że są niepełne, dawałoby werdykt wyglądający na
    wynik.
    """
    wejscia = wyciagnij_wejscia_frt(
        wynik,
        szyna=szyna,
        modul_ref=modul_ref,
        wymaganie=wymaganie,
        chwila_zaklocenia_s=chwila_zaklocenia_s,
    )
    braki = list(wejscia.braki)
    if dziennik_przylaczenia is not None:
        braki = [
            b for b in braki if b.powod is not PowodNieorzekalnosci.BRAK_DZIENNIKA_PRZYLACZENIA
        ]

    if braki or wejscia.przebieg_napiecia is None:
        okno_od = float(chwila_zaklocenia_s)
        okno_do = okno_od + float(wymaganie.horyzont_s)
        powody = "; ".join(b.szczegol_pl for b in braki) or (
            "Brak przebiegu napięcia w śladzie biegu."
        )
        niepokryte = tuple(sorted({b.kryterium for b in braki if b.kryterium != "*"})) or (
            KRYTERIUM_OBWIEDNIA,
        )
        ocena = OcenaZdolnosciFrt(
            werdykt=WerdyktFrt.NIEROZSTRZYGALNE,
            wiersze=(
                WierszWhiteBox(
                    kryterium="*",
                    werdykt=WerdyktFrt.NIEROZSTRZYGALNE,
                    zmierzone=None,
                    jednostka_zmierzonego="",
                    wymagane=None,
                    margines=None,
                    chwila_s=None,
                    okno_od_s=okno_od,
                    okno_do_s=okno_do,
                    dane_kompletne=False,
                    zrodlo_przebiegu=f"bieg:{wynik.odcisk_scenariusza[:12]}",
                    uzasadnienie_pl=f"Ślad biegu nie nadaje się do orzekania: {powody}",
                ),
            ),
            kryteria_niepokryte=niepokryte,
            element_ref=modul_ref,
            identyfikator_profilu=wymaganie.identyfikator_profilu,
            uzasadnienie_pl=(
                f"Ocena NIE zostala policzona: slad biegu nie nadaje sie do orzekania. {powody}"
            ),
        )
        return ocena, tuple(braki)

    ocena = ocen_zdolnosc_frt(
        przebieg_napiecia=wejscia.przebieg_napiecia,
        wymaganie=wymaganie,
        chwila_zaklocenia_s=chwila_zaklocenia_s,
        dziennik_przylaczenia=dziennik_przylaczenia,
        przebieg_mocy=wejscia.przebieg_mocy,
        moc_przed_zaklocaniem_pu=wejscia.moc_przed_zaklocaniem_pu,
        chwila_wylaczenia_s=chwila_wylaczenia_s,
        przebieg_pradu_wsparcia=wejscia.przebieg_pradu_wsparcia,
        napiecie_przed_zaklocaniem_pu=wejscia.napiecie_przed_zaklocaniem_pu,
        prad_wsparcia_przed_zaklocaniem_pu=wejscia.prad_wsparcia_przed_zaklocaniem_pu,
    )
    return ocena, ()
