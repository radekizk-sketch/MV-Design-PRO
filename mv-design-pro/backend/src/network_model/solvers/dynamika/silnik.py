"""Silnik DAE: inicjalizacja, petla czasu, zdarzenia, re-inicjalizacja (SS0 p.3-p.5).

PRZEBIEG BIEGU:

1. **Zlozenie sieci** z opisu elementow (`siec.zloz_model_sieci`) i rozwiniecie
   harmonogramu na wykonalne wpisy (`zdarzenia.zbuduj_harmonogram`).
2. **Inicjalizacja urzadzen** z punktu pracy rozpływu — kazde urzadzenie wyznacza
   swoj stan rownowagi z `(V, S)` swojego wezla. Brak napiecia albo mocy dla
   urzadzenia to ODMOWA `dynamika.<pole>_missing`, nigdy wartosc zastepcza.
3. **Bramka rownowagi (niezbywalna).** `||f(x0, y0)||` i `||g(x0, y0)||` musza
   miescic sie w `eps_init`. Naruszenie konczy bieg odmowa
   `dynamika.inicjalizacja_niezbiezna` Z WEKTOREM RESIDUOW PER URZADZENIE I PER
   WEZEL — tak, zeby dalo sie powiedziec, KTORE urzadzenie nie jest w rownowadze,
   zamiast puszczac bieg i tlumaczyc pierwsza sekunde przebiegu „artefaktem
   rozruchu". Bramka NIE rozwiazuje algebry: punkt pracy pochodzi z rozpływu
   liczonego na TYM SAMYM widoku sieci, wiec jesli nie spelnia bilansu, to wejscia
   sa niespojne — a to jest informacja, nie usterka do naprawienia w tle.
4. **Petla czasu z punktami obowiazkowymi.** Krok nigdy nie przeskakuje chwili
   zdarzenia ani chwili probkowania: silnik wyznacza najblizszy punkt obowiazkowy
   (zdarzenie / probka / horyzont) i skraca krok dokladnie do niego. Po dojsciu do
   punktu czas jest USTAWIANY na jego wartosc, a nie akumulowany — inaczej dryf
   zmiennoprzecinkowy przesuwalby siatke probek wzgledem osi czasu.
5. **Zdarzenia chwili.** Wszystkie wpisy o tym samym `t` sa nanoszone na stan
   scenariusza w kolejnosci kanonicznej, siec jest skladana OD NOWA, po czym
   nastepuje JEDNA re-inicjalizacja algebry. Diagnostyka (`delta_y`, residuum KCL)
   opisuje wiec skok CHWILI — rozbijanie jej na „wklad zdarzenia" wymagaloby
   posrednich topologii, ktore nigdy nie istnialy.
5a. **Obszary beznapieciowe (karta AB-1b.1 par. 0 pkt 2).** W stanie PO zdarzeniach
   chwili (i w t = 0) wyspy sa klasyfikowane JEDNYM predykatem
   (`wyspy.klasyfikuj_wyspy`): wyspa bez urzadzenia wnoszacego do algebry jest
   ODCIETA — jej wezly dostaja wiersz ograniczenia `V = 0`, jej odbiory nie
   pobieraja pradu (obwod bez drogi do zrodla), a bieg trwa. Wezel, ktory przestaje
   miec napiecie narzucone zerem, startuje Newtona od napiecia najblizszego wezla
   zywego (przeszukiwanie wszerz w kolejnosci indeksow — wybor punktu startowego,
   nie korekta rozwiazania).
6. **Probki obustronne (karta AB-1b.1 par. 0 pkt 6).** W KAZDEJ chwili, w ktorej
   wykonuje sie choc jedno zdarzenie, wynik niesie DWIE probki o tej samej chwili:
   `L` — stan PRZED naniesieniem jakiegokolwiek zdarzenia tej chwili (model, odbiory
   i urzadzenia z konca ostatniego kroku; w `t = 0` dokladnie punkt pracy z rozplywu),
   i `P` — stan PO naniesieniu wszystkich zdarzen i jednej re-inicjalizacji. Zwykla
   probka siatki ma strone `C`. Zdarzenie na siatce daje pare `L, P` zamiast jednej
   probki; zdarzenie poza siatka daje nowa pare. Strona kazdej probki jest w
   `strona_probki`, rownoleglym do osi czasu.

BEZ HISTORII OBIEKTU. `SilnikDynamiki` jest zamrozony i nie trzyma zadnego stanu
miedzy biegami — caly stan biegu zyje w zmiennych lokalnych `uruchom`. Dwa biegi
z tego samego wejscia daja ten sam wynik niezaleznie od tego, czy poszly przez ten
sam obiekt, czy przez dwa rozne (przypiete testem tozsamosci biegu).
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import numpy as np

from .calkowanie import (
    INTEGRATORY,
    Integrator,
    KontekstKroku,
    WynikKroku,
    blad_lokalny,
    pochodne_ukladu,
    spakuj_stany,
    zakresy_waznosci_elementow,
)
from .dozory import AkcjaOczekujaca, Lokalizacja, NadzorDozorow, StanUkladu, StronaOceny
from .kontrakty import (
    KOD_INICJALIZACJA_NIEZBIEZNA,
    KOD_KROK_NIEZBIEZNY,
    KOD_NASTAWY_SPRZECZNE,
    KOD_PUNKT_PRACY_POZA_OGRANICZENIEM,
    KOD_ZWARCIE_NIEODIZOLOWANE,
    HarmonogramDynamiki,
    NastawySolvera,
    OdbiorDynamiki,
    OdmowaDynamiki,
    Urzadzenie,
    WejscieDynamiki,
    ZwarcieGalezi,
    ZwarcieWezla,
    odmowa_braku_pola,
    rozdziel_stany,
)
from .obserwable import (
    JAKOSC_CHWILA_ZDARZENIA,
    CzestotliwoscWezla,
    czestotliwosc_niedostepna,
    czestotliwosci_wezlow,
    moc_urzadzenia_pu,
    wielkosci_galezi,
)
from .odbiory import (
    STAN_KATA_POMIARU,
    TRYB_ODCIETY,
    TRYB_ODLACZONY,
    OdbiorCharakterystyczny,
    jest_czuly_czestotliwosciowo,
    model_odbioru,
    opis_odbioru_sladu,
    sprawdz_punkt_pracy_odbioru,
    sprawdz_zakres_waznosci,
)
from .reinicjalizacja import reinicjalizuj
from .siec import (
    ModelSieci,
    galezie_laczace,
    miejsca_zwarcia_galezi,
    ograniczenia_napiecia,
    prad_wezla_ograniczonego,
    residuum_algebry,
    zloz_model_sieci,
    zwarcia_galezi_modelu,
)
from .skonczonosc import sprawdz_napiecia
from .tozsamosc import kwantyzuj, skrot_kanoniczny, zbuduj_tozsamosc
from .urzadzenia.fabryka import RODZINY_OBSLUGIWANE
from .urzadzenia.zrodlo_testowe import ZrodloTestowe
from .waznosc import sprawdz_zakresy_waznosci
from .wynik import (
    KanalWyniku,
    Metryka,
    Przekroczenie,
    PrzypisanieWykonane,
    WielkoscZalozenia,
    WlasnosciBiegu,
    WynikDynamiki,
    ZalozenieRdzenia,
    ZdarzenieWykonane,
    rekord_zalozenia,
)
from .wyspy import klasyfikuj_wyspy, przydzial_wysp, urzadzenie_wnosi_do_algebry
from .zdarzenia import (
    RODZAJE_PRZYPISAN,
    StanScenariusza,
    WpisHarmonogramu,
    jest_trybem_stanowiska,
    nastawa_regulacji,
    odbiory_po_zdarzeniach,
    sprawdz_przypisanie,
    stan_poczatkowy_scenariusza,
    szablony_akcji_dozorow,
    urzadzenia_w_stanie,
    zastosuj,
    zbuduj_harmonogram,
)

#: Epsilon POROWNANIA CZASU [s] — nie jest progiem fizycznym. Sluzy wylacznie
#: temu, zeby petla „dojdz do punktu obowiazkowego" konczyla sie, gdy pozostala
#: odleglosc jest ponizej rozdzielczosci zmiennoprzecinkowej osi czasu. Najmniejszy
#: dopuszczalny krok (`dt_min_s`) jest o rzedy wielkosci wiekszy, wiec ten epsilon
#: nie moze przykryc zadnego kroku calkowania.
TOLERANCJA_CZASU_S = 1.0e-12

#: Wspolczynnik bezpieczenstwa doboru kroku: nowy krok celuje w 90 % tolerancji,
#: zeby kolejny krok nie byl odrzucany przez drobne przekroczenie.
MARGINES_DOBORU_KROKU = 0.9

#: Granice JEDNORAZOWEJ zmiany kroku. Skok o wiecej niz dwukrotnosc w gore albo
#: dziesieciokrotnosc w dol oznacza, ze oszacowanie bledu wyszlo poza zakres, w
#: ktorym model asymptotyczny `blad ~ dt^(p+1)` obowiazuje.
MAX_WZROST_KROKU = 2.0
MAX_SPADEK_KROKU = 0.1


@dataclass(frozen=True)
class _Chwila:
    """Stan biegu po naniesieniu zdarzen jednej chwili."""

    indeks_wpisu: int
    stan_scenariusza: StanScenariusza
    model: ModelSieci
    #: KAZDY odbior wejscia jako model chwili (bez obwodu: prad zero, stan estymatora
    #: istnieje dalej) — krotka `stany` jest wyrownana z `(*odbiory, *urzadzenia)`.
    odbiory: tuple[OdbiorCharakterystyczny, ...]
    urzadzenia: tuple[Urzadzenie, ...]
    #: Stany rozniczkowe PO chwili — rowne stanom sprzed niej poza pozycjami przypisanymi
    #: (przypisanie stanu, komenda regulacji, kat estymatora odbioru po ponownym
    #: zasileniu); pomiar `delta_x_nieprzypisane_max`.
    stany: tuple[np.ndarray, ...]
    napiecia: np.ndarray
    kontekst: KontekstKroku
    bylo_zdarzenie: bool
    residuum_kcl_max: float
    #: Odbiory ODCIETE (w obszarze beznapieciowym) — w `odbiory` z trybem 3, bez pradu.
    odbiory_odciete: frozenset[str]
    #: Czy w tej chwili ktorys wezel startowal Newtona od napiecia sasiada (ponowne
    #: zasilenie) — wchodzi do `zalozenia` wyniku.
    start_od_sasiada: bool
    #: Czy w tej chwili estymator czestotliwosci ktoregos odbioru dostal `x := arg V+`
    #: (ponowne zasilenie) — wchodzi do `zalozenia` wyniku.
    reset_estymatorow: bool


@dataclass(frozen=True)
class SilnikDynamiki:
    """Rdzen biegu RMS — jeden obiekt na jeden bieg, bez stanu miedzy biegami."""

    wejscie: WejscieDynamiki

    def uruchom(self) -> WynikDynamiki:
        """Wykonaj bieg i zbuduj wynik czasowy."""
        zegar = time.perf_counter()
        wejscie = self.wejscie
        nastawy = wejscie.nastawy
        integrator: Integrator = INTEGRATORY[nastawy.integrator]

        wpisy = zbuduj_harmonogram(
            wejscie.harmonogram,
            wezly=wejscie.wezly,
            galezie=wejscie.galezie,
            odsprzegi=wejscie.odsprzegi,
            odbiory=wejscie.odbiory,
            urzadzenia=wejscie.urzadzenia,
            s_bazowa_mva=wejscie.s_bazowa_mva,
            horyzont_s=nastawy.horyzont_s,
        )

        urzadzenia = tuple(wejscie.urzadzenia)
        stany_urzadzen = self._stany_poczatkowe(urzadzenia)
        stan_scenariusza = stan_poczatkowy_scenariusza(
            wejscie.galezie, wejscie.odsprzegi, wejscie.odbiory
        )
        napiecia, beznapieciowe = self._napiecia_poczatkowe(
            stan_scenariusza, urzadzenia, stany_urzadzen
        )
        model = self._model_dla(stan_scenariusza, beznapieciowe)
        odbiory = self._modele_odbiorow(stan_scenariusza, beznapieciowe, 0.0, frozenset())
        # Stan estymatora czestotliwosci odbioru czulego: `x(0) = arg V_pf` (e(0) = 0, f = f_n).
        stany = (
            *(
                odbior.stan_poczatkowy_odbioru(complex(napiecia[model.indeks_wezla[odbior.wezel]]))
                for odbior in odbiory
            ),
            *stany_urzadzen,
        )
        self._sprawdz_wezly_zerowe(0.0, model, odbiory, urzadzenia, stany)
        # Punkt pracy ponizej napiecia przejscia nie jest rownowaga modelu odbioru — odmowa
        # NAZWANA przed bramka rownowagi (inaczej wyszlaby jako „inicjalizacja niezbiezna").
        for odbior in odbiory:
            if odbior.przylaczony:
                sprawdz_punkt_pracy_odbioru(
                    odbior.odbior, complex(napiecia[model.indeks_wezla[odbior.wezel]])
                )
        _sprawdz_odbiory(model, odbiory, stany, napiecia, 0.0, bledy_fazy_przed=None)
        kontekst = KontekstKroku(model, odbiory, urzadzenia, nastawy)
        slad_inicjalizacji = self._bramka_rownowagi(kontekst, stany, napiecia)
        slad_odbiorow = [
            opis_odbioru_sladu(
                odbior.odbior,
                (
                    complex(napiecia[model.indeks_wezla[odbior.wezel]])
                    if odbior.przylaczony
                    else None
                ),
                wejscie.f_bazowa_hz,
            )
            for odbior in odbiory
        ]
        odciete = tuple(
            odbior.odbior for odbior in odbiory if odbior.tryb_poza_obwodem == TRYB_ODCIETY
        )
        slad_inicjalizacji["wezly_beznapieciowe"] = [
            ident for ident in model.identy_wezlow if ident in beznapieciowe
        ]
        slad_inicjalizacji["odbiory_odciete"] = _opis_odbiorow(odciete)
        odciecia_w_biegu = bool(beznapieciowe)
        starty_od_sasiada = False

        miejsca_zwarc = _miejsca_zwarc(wpisy)
        kanaly = self._kanaly(model, urzadzenia, miejsca_zwarc, wejscie.odbiory)
        probki: dict[str, list[float | None]] = {kanal.klucz: [] for kanal in kanaly}
        os_czasu: list[float] = []
        strony: list[str] = []
        wykonane: list[ZdarzenieWykonane] = []
        kroki_szczegolne: list[dict[str, Any]] = []

        kroki = 0
        kroki_odrzucone = 0
        iteracje_max = 0
        max_residuum_f = 0.0
        max_residuum_g = float(slad_inicjalizacji["residuum_g"])

        t_s = 0.0
        indeks_probki = 0
        chwila = _Chwila(
            indeks_wpisu=0,
            stan_scenariusza=stan_scenariusza,
            model=model,
            odbiory=odbiory,
            urzadzenia=urzadzenia,
            stany=stany,
            napiecia=napiecia,
            kontekst=kontekst,
            bylo_zdarzenie=False,
            residuum_kcl_max=0.0,
            odbiory_odciete=frozenset(odbior.ident for odbior in odciete),
            start_od_sasiada=False,
            reset_estymatorow=False,
        )

        probkowanie = _Probkowanie(probki, os_czasu, strony, miejsca_zwarc)
        nadzor = self._nadzor()

        def chwila_zdarzen(
            t_chwili: float,
            poprzednia: _Chwila,
            stany_wejscia: tuple[np.ndarray, ...],
            napiecia_wejscia: np.ndarray,
            *,
            na_siatce: bool,
        ) -> _Chwila:
            """Chwila osi czasu: zdarzenia planowane i akcje dozorow tej chwili, potem RUNDY —
            dopoki ocena dozorow w probce `P` pobudza akcje bez zwloki w tej samej chwili
            (kazda runda ma wlasna pare `L`/`P`; dozor pobudzony drugi raz w tej samej
            chwili to odmowa `dynamika.petla_zdarzen_warunkowych`)."""
            akcje = [] if nadzor is None else nadzor.akcje_chwili(t_chwili, TOLERANCJA_CZASU_S)
            nowa = self._chwila_z_probkami(
                t_chwili,
                wpisy,
                akcje,
                poprzednia,
                stany_wejscia,
                napiecia_wejscia,
                wykonane,
                kroki_szczegolne,
                probkowanie,
                na_siatce=na_siatce,
            )
            if nadzor is None:
                return nowa
            nadzor.zdejmij(akcje)
            if nowa.bylo_zdarzenie:
                nadzor.po_chwili(t_chwili, _uklad_chwili(nowa, "P"))
                kroki_szczegolne.extend(_zapisy_nadzoru(nadzor, t_chwili))
            while True:
                akcje = nadzor.akcje_chwili(t_chwili, TOLERANCJA_CZASU_S)
                if not akcje:
                    return nowa
                nowa = self._chwila_z_probkami(
                    t_chwili,
                    wpisy,
                    akcje,
                    nowa,
                    nowa.stany,
                    nowa.napiecia,
                    wykonane,
                    kroki_szczegolne,
                    probkowanie,
                    na_siatce=False,
                )
                nadzor.zdejmij(akcje)
                nadzor.po_chwili(t_chwili, _uklad_chwili(nowa, "P"))
                kroki_szczegolne.extend(_zapisy_nadzoru(nadzor, t_chwili))

        # Chwila t = 0. Dozor, ktorego warunek jest spelniony w t = 0+, pobudza sie w 0:
        # bez zdarzen planowanych w 0 stanem 0+ jest punkt pracy (ocena PRZED probkowaniem,
        # zeby akcje w 0 daly pare L/P, a nie probke C i pare L/P tej samej chwili); ze
        # zdarzeniami — stan po nich (ocena w P).
        planowane_w_zerze = bool(self._wpisy_chwili(t_s, wpisy, 0))
        if nadzor is not None and not planowane_w_zerze:
            nadzor.start(t_s, _uklad_chwili(chwila, "C"))
            kroki_szczegolne.extend(_zapisy_nadzoru(nadzor, t_s))
        akcje_zera = [] if nadzor is None else nadzor.akcje_chwili(t_s, TOLERANCJA_CZASU_S)
        chwila = self._chwila_z_probkami(
            t_s,
            wpisy,
            akcje_zera,
            chwila,
            stany,
            napiecia,
            wykonane,
            kroki_szczegolne,
            probkowanie,
            na_siatce=True,
        )
        if nadzor is not None:
            nadzor.zdejmij(akcje_zera)
            if planowane_w_zerze:
                nadzor.start(t_s, _uklad_chwili(chwila, "P"))
            elif chwila.bylo_zdarzenie:
                nadzor.po_chwili(t_s, _uklad_chwili(chwila, "P"))
            kroki_szczegolne.extend(_zapisy_nadzoru(nadzor, t_s))
            if nadzor.akcje_chwili(t_s, TOLERANCJA_CZASU_S):
                chwila = chwila_zdarzen(t_s, chwila, chwila.stany, chwila.napiecia, na_siatce=False)
        model, odbiory, urzadzenia = chwila.model, chwila.odbiory, chwila.urzadzenia
        stany, napiecia, kontekst = chwila.stany, chwila.napiecia, chwila.kontekst
        indeks_wpisu = chwila.indeks_wpisu
        max_residuum_g = max(max_residuum_g, chwila.residuum_kcl_max)
        odciecia_w_biegu = odciecia_w_biegu or bool(model.wezly_beznapieciowe)
        starty_od_sasiada = starty_od_sasiada or chwila.start_od_sasiada
        resety_estymatorow = chwila.reset_estymatorow
        indeks_probki = 1

        dt_biezace = nastawy.dt_s
        while nastawy.horyzont_s - t_s > TOLERANCJA_CZASU_S:
            cel = self._punkt_obowiazkowy(t_s, wpisy, indeks_wpisu, indeks_probki, nastawy, nadzor)
            while cel - t_s > TOLERANCJA_CZASU_S:
                krok = min(dt_biezace, cel - t_s)
                wynik_kroku = integrator.krok(kontekst, stany, napiecia, t_s, krok)
                if not nastawy.krok_staly:
                    blad = blad_lokalny(
                        integrator, kontekst, stany, napiecia, t_s, krok, wynik_kroku
                    )
                    if blad > nastawy.tolerancja_kroku:
                        kroki_odrzucone += 1
                        kroki_szczegolne.append(
                            {
                                "t_s": kwantyzuj(t_s),
                                "dt_s": kwantyzuj(krok),
                                "powod": "krok_odrzucony",
                                "blad_lokalny": kwantyzuj(blad),
                                "tolerancja_kroku": kwantyzuj(nastawy.tolerancja_kroku),
                            }
                        )
                        if krok <= nastawy.dt_min_s + TOLERANCJA_CZASU_S:
                            raise OdmowaDynamiki(
                                KOD_KROK_NIEZBIEZNY,
                                f"Błąd lokalny kroku {blad} przekracza tolerancję "
                                f"{nastawy.tolerancja_kroku} przy najmniejszym dopuszczalnym "
                                f"kroku {nastawy.dt_min_s} s (t = {t_s} s).",
                                t_s=t_s,
                                dt_s=krok,
                                blad_lokalny=blad,
                            )
                        dt_biezace = max(krok * MAX_SPADEK_KROKU, nastawy.dt_min_s)
                        continue
                    dt_biezace = min(
                        max(
                            self._nowy_krok(krok, blad, nastawy.tolerancja_kroku, integrator.rzad),
                            nastawy.dt_min_s,
                        ),
                        nastawy.dt_max_s,
                    )
                t_konca = t_s + krok
                ladowanie: float | None = None
                if nadzor is not None:
                    ladowanie, wynik_kroku = self._dozory_po_kroku(
                        nadzor,
                        integrator,
                        kontekst,
                        stany,
                        napiecia,
                        t_s,
                        t_konca,
                        wynik_kroku,
                        zdarzenia_w_koncu=abs(t_konca - cel) <= TOLERANCJA_CZASU_S
                        and self._jest_chwila_zdarzen(cel, wpisy, indeks_wpisu, nadzor),
                    )
                    if ladowanie is not None:
                        t_konca = ladowanie
                    kroki_szczegolne.extend(_zapisy_nadzoru(nadzor, t_konca))
                # Blad fazy estymatorow odbiorow z POCZATKU kroku — kontrola poslizgu (przejscie
                # `e` przez +-pi miedzy krokami) po jego przyjeciu.
                bledy_fazy_przed = _bledy_fazy(model, odbiory, stany, napiecia)
                stany = wynik_kroku.stany
                napiecia = wynik_kroku.napiecia
                t_s = t_konca
                sprawdz_napiecia(napiecia, model.identy_wezlow, t_s)
                dolne_wazne, gorne_wazne = kontekst.zakresy_waznosci
                sprawdz_zakresy_waznosci(
                    spakuj_stany(stany),
                    dolne_wazne,
                    gorne_wazne,
                    kontekst.adresy_stanow,
                    nastawy,
                    t_s,
                )
                _sprawdz_odbiory(
                    model, odbiory, stany, napiecia, t_s, bledy_fazy_przed=bledy_fazy_przed
                )
                kroki += 1
                iteracje_max = max(iteracje_max, wynik_kroku.iteracje)
                max_residuum_f = max(max_residuum_f, wynik_kroku.residuum_stanow)
                max_residuum_g = max(max_residuum_g, wynik_kroku.residuum_algebry)
                if ladowanie is not None:
                    # Akcja dozoru wykonuje sie w chwili ladowania — to ona jest punktem
                    # obowiazkowym tego kroku (czas USTAWIANY na chwile akcji, co do bitu).
                    cel = ladowanie
                    break
            t_s = cel

            na_siatce = self._jest_chwila_probki(t_s, indeks_probki, nastawy)
            chwila = chwila_zdarzen(t_s, chwila, stany, napiecia, na_siatce=na_siatce)
            model, odbiory, urzadzenia = chwila.model, chwila.odbiory, chwila.urzadzenia
            stany, napiecia, kontekst = chwila.stany, chwila.napiecia, chwila.kontekst
            indeks_wpisu = chwila.indeks_wpisu
            max_residuum_g = max(max_residuum_g, chwila.residuum_kcl_max)
            odciecia_w_biegu = odciecia_w_biegu or bool(model.wezly_beznapieciowe)
            starty_od_sasiada = starty_od_sasiada or chwila.start_od_sasiada
            resety_estymatorow = resety_estymatorow or chwila.reset_estymatorow
            if na_siatce:
                indeks_probki += 1

        if nadzor is not None:
            for akcja in nadzor.oczekujace:
                kroki_szczegolne.append(
                    {
                        "t_s": kwantyzuj(akcja.t_s),
                        "powod": "akcja_dozoru_poza_horyzontem",
                        "dozor": nadzor.dozory[akcja.dozor].ident,
                        "rodzaj": akcja.wpis.rodzaj,
                        "ref": akcja.wpis.ref,
                        "t_zlokalizowany_s": kwantyzuj(akcja.lokalizacja.t_s),
                    }
                )
        if indeks_wpisu != len(wpisy):
            pominiete = [(wpis.rodzaj, wpis.ref, wpis.t_s) for wpis in wpisy[indeks_wpisu:]]
            raise AssertionError(
                "Bieg zakończył się z NIEWYKONANYMI zdarzeniami harmonogramu: "
                f"{pominiete}. Każde zdarzenie w horyzoncie musi zostać wykonane — "
                "ciche pominięcie jest defektem silnika, nie własnością scenariusza."
            )

        zalozenia_biegu = (
            zalozenia_trybu(wejscie.urzadzenia)
            + zalozenia_harmonogramu(wejscie.harmonogram)
            + _zalozenia_warunkowe(
                obszar_beznapieciowy=odciecia_w_biegu,
                start_ponownego_zasilenia=starty_od_sasiada,
                reinicjalizacja_estymatora=resety_estymatorow,
                przypisanie_stanu=any(
                    zdarzenie.rodzaj in RODZAJE_PRZYPISAN for zdarzenie in wykonane
                ),
                utrata_czesciowa=any(
                    zdarzenie.rodzaj == "utrata_czesciowa_zrodla" for zdarzenie in wykonane
                ),
            )
        )
        wlasnosci = WlasnosciBiegu(
            zbiegl=True,
            kroki=kroki,
            kroki_odrzucone=kroki_odrzucone,
            max_residuum_f=max_residuum_f,
            max_residuum_g=max_residuum_g,
            czas_obliczen_s=time.perf_counter() - zegar,
            integrator=integrator.nazwa,
            dt_s=nastawy.dt_s,
            tolerancja=nastawy.tolerancja,
        )
        return WynikDynamiki(
            kanaly=kanaly,
            os_czasu_s=tuple(os_czasu),
            strona_probki=tuple(strony),
            probki={klucz: tuple(szereg) for klucz, szereg in probki.items()},
            zdarzenia_wykonane=tuple(wykonane),
            tryb_scenariusza=tryb_scenariusza(wejscie.urzadzenia),
            przekroczenia=() if nadzor is None else _przekroczenia(nadzor),
            wlasnosci=wlasnosci,
            tozsamosc=zbuduj_tozsamosc(wejscie),
            metryki=self._metryki(kanaly, probki, os_czasu),
            zalozenia=zalozenia_modelu(wejscie.odbiory) + zalozenia_biegu,
            slad_white_box=self._slad(
                slad_inicjalizacji,
                model,
                nastawy,
                kroki_szczegolne,
                kroki,
                kroki_odrzucone,
                iteracje_max,
                zalozenia_biegu,
                slad_odbiorow,
            ),
        )

    # -- inicjalizacja ----------------------------------------------------

    def _stany_poczatkowe(self, urzadzenia: tuple[Urzadzenie, ...]) -> tuple[np.ndarray, ...]:
        punkt = self.wejscie.punkt_pracy
        stany: list[np.ndarray] = []
        for urzadzenie in urzadzenia:
            if urzadzenie.wezel not in punkt.napiecia_pu:
                raise odmowa_braku_pola(
                    "punkt_pracy_napiecie",
                    f"Punkt pracy nie ma napięcia węzła {urzadzenie.wezel} "
                    f"(urządzenie {urzadzenie.ident}).",
                )
            if urzadzenie.ident not in punkt.moce_zrodel_pu:
                raise odmowa_braku_pola(
                    "punkt_pracy_moc",
                    f"Punkt pracy nie ma mocy źródła {urzadzenie.ident}.",
                )
            stany.append(
                urzadzenie.stan_poczatkowy(
                    punkt.napiecia_pu[urzadzenie.wezel], punkt.moce_zrodel_pu[urzadzenie.ident]
                )
            )
        return tuple(stany)

    def _napiecia_poczatkowe(
        self,
        stan: StanScenariusza,
        urzadzenia: tuple[Urzadzenie, ...],
        stany: tuple[np.ndarray, ...],
    ) -> tuple[np.ndarray, frozenset[str]]:
        """Napiecia t = 0 i wezly OBSZARU BEZNAPIECIOWEGO topologii poczatkowej.

        Brak napiecia wezla w punkcie pracy (rozplyw go nie rozwiazal) jest dopuszczalny
        WYLACZNIE, gdy ten sam predykat, ktorym silnik klasyfikuje wyspy w chwilach
        zdarzen, uzna wezel za beznapieciowy (wezel martwy od poczatku, zasilany pozniej
        zamknieciem lacznika) — wtedy `V = 0`. Brak napiecia wezla wyspy zywej konczy sie
        odmowa `punkt_pracy_napiecie_missing`, jak dotad. Napiecie PODANE dla wezla
        martwego nie jest nadpisywane: bramka rownowagi sprawdzi je z wierszem
        ograniczenia `V = 0` (niezerowe = wejscie niespojne, odmowa z residuum wezla).
        """
        punkt = self.wejscie.punkt_pracy
        wezly = self.wejscie.wezly
        wartosci = np.array(
            [punkt.napiecia_pu.get(wezel.ident, 0j) for wezel in wezly], dtype=complex
        )
        # TEN SAM predykat i ta sama funkcja, co w chwilach zdarzen (predykaty parami):
        # napiecie 0 podstawione za brak wchodzi wylacznie do wezlow BEZ urzadzen, bo
        # urzadzenie bez napiecia punktu pracy odmowilo juz w `_stany_poczatkowe`.
        beznapieciowe, _ = self._obszary_beznapieciowe(stan, urzadzenia, stany, wartosci)
        for wezel in wezly:
            if wezel.ident not in punkt.napiecia_pu and wezel.ident not in beznapieciowe:
                raise odmowa_braku_pola(
                    "punkt_pracy_napiecie", f"Punkt pracy nie ma napięcia węzła {wezel.ident}."
                )
        return wartosci, beznapieciowe

    def _sprawdz_wezly_zerowe(
        self,
        t_s: float,
        model: ModelSieci,
        odbiory: tuple[OdbiorCharakterystyczny, ...],
        urzadzenia: tuple[Urzadzenie, ...],
        stany: tuple[np.ndarray, ...],
    ) -> None:
        """NAZWANE odmowy modeli, ktore nie maja rozwiazania przy napieciu narzuconym zerem.

        Urzadzenie, ktorego rownania nie maja okreslonej wartosci przy `U = 0` (regulacja
        czytajaca modul napiecia, petla synchronizacji fazowej) — odmowa urzadzenia
        przenoszona z KONTEKSTEM: wezel, urzadzenie, chwila. Odbiory nie maja tu odmowy:
        kazdy odbior ze skladowa pradowa albo mocowa deklaruje napiecie przejscia `U_min`
        (kontrakt), wiec w wezle zwartym metalicznie jest w galezi impedancyjnej i pobiera
        prad zero dokladnie; odbior czysto impedancyjny jest impedancja; estymator
        czestotliwosci przy `V = 0` trzyma stan (`e := 0`).

        Sprawdzenie jest w chwili NARZUCENIA zera, a nie w pierwszym kroku calkowania:
        odmowa w srodku kroku mowilaby o „kroku niezbieznym", a nie o przyczynie. Z tego
        samego powodu tutaj pada odmowa DWOCH warunkow napiecia w jednym wezle
        (`ograniczenia_napiecia`) — inaczej wyszlaby z Newtona re-inicjalizacji jako
        „re-inicjalizacja niezbiezna".
        """
        ograniczenia_napiecia(model, urzadzenia)
        if not model.pozycje_zerowe:
            return
        zerowe = {model.identy_wezlow[pozycja] for pozycja in model.pozycje_zerowe}
        _, stany_urzadzen = rozdziel_stany(odbiory, urzadzenia, stany)
        for urzadzenie, stan in zip(urzadzenia, stany_urzadzen, strict=True):
            if urzadzenie.wezel not in zerowe:
                continue
            try:
                urzadzenie.pochodne(stan, 0j)
                if urzadzenie.sprzezenie == "pradowe":
                    urzadzenie.prad_pu(stan, 0j)
                    urzadzenie.jakobian_prad_napiecie(stan, 0j)
            except OdmowaDynamiki as odmowa:
                szczegoly = dict(odmowa.szczegoly)
                szczegoly.update(
                    {"wezel": urzadzenie.wezel, "urzadzenie": urzadzenie.ident, "t_s": t_s}
                )
                raise OdmowaDynamiki(
                    odmowa.kod,
                    f"Urządzenie {urzadzenie.ident} w węźle {urzadzenie.wezel} o napięciu "
                    f"narzuconym zerem (t = {t_s} s) nie ma określonego modelu przy U = 0: "
                    f"{odmowa}",
                    **szczegoly,
                ) from odmowa

    def _napiecia_startowe(
        self,
        poprzedni: ModelSieci,
        model: ModelSieci,
        napiecia: np.ndarray,
        urzadzenia: tuple[Urzadzenie, ...],
        stany: tuple[np.ndarray, ...],
    ) -> tuple[np.ndarray | None, tuple[str, ...], tuple[str, ...]]:
        """Punkt startowy Newtona chwili zdarzen oraz wezly startujace od sasiada / od SEM.

        `None` jako punkt startowy znaczy: zbior wezlow zerowych sie nie zmienil, Newton
        startuje z napiec sprzed zdarzenia (dotychczasowa sciezka, parytet bitowy).

        Wezel NOWO zerowy startuje od zera (wartosci, ktora narzuca jego rownanie). Wezel,
        ktory PRZESTAJE byc zerowy (ponowne zasilenie, zdjecie zwarcia metalicznego),
        startuje od napiecia najblizszego wezla, ktory zerowy nie byl i nie jest:
        przeszukiwanie wszerz po galeziach LACZACYCH nowego stanu (`siec.galezie_laczace` —
        ta sama definicja polaczenia, co przydzial wysp), zrodla i sasiedzi w kolejnosci
        indeksow (deterministycznie).

        Wezel NIEOSIAGALNY od zadnego takiego wezla (wyspa zlozona wylacznie z wezlow
        zerowych przed zdarzeniem — np. wezel z maszyna po zdjeciu zwarcia metalicznego,
        bez galezi) startuje od napiecia JALOWEGO (SEM) pierwszego urzadzenia wnoszacego do
        algebry w tym wezle, a jego sasiedzi — dalej wszerz od niego. Wyspa zywa zawsze ma
        takie urzadzenie (inaczej bylaby beznapieciowa), wiec zaden ponownie zasilony wezel
        nie startuje od zera — punkt, w ktorym odbior o stalej mocy nie ma pradu. To jest
        wybor punktu startowego, nie korekta rozwiazania.
        """
        przed = set(poprzedni.pozycje_zerowe)
        po = set(model.pozycje_zerowe)
        if przed == po:
            return None, (), ()
        start = np.array(napiecia, dtype=complex, copy=True)
        for pozycja in po:
            start[pozycja] = 0j
        do_uzupelnienia = przed - po
        if not do_uzupelnienia:
            return start, (), ()
        laczace = galezie_laczace(model.galezie_aktywne, model.zwarcia_galezi)
        sasiedzi: list[list[int]] = [[] for _ in range(model.liczba_wezlow)]
        for galaz in model.galezie:
            if galaz.ident not in laczace:
                continue
            od = model.indeks_wezla[galaz.wezel_od]
            do = model.indeks_wezla[galaz.wezel_do]
            if od != do:
                sasiedzi[od].append(do)
                sasiedzi[do].append(od)
        kolejka = [
            pozycja
            for pozycja in range(model.liczba_wezlow)
            if pozycja not in przed and pozycja not in po
        ]
        odwiedzone = set(kolejka)
        od_sem: set[int] = set()

        def rozszerz(kolejka: list[int]) -> None:
            glowa = 0
            while glowa < len(kolejka):
                biezacy = kolejka[glowa]
                glowa += 1
                for sasiad in sorted(sasiedzi[biezacy]):
                    if sasiad in odwiedzone or sasiad not in do_uzupelnienia:
                        continue
                    odwiedzone.add(sasiad)
                    start[sasiad] = start[biezacy]
                    kolejka.append(sasiad)

        rozszerz(kolejka)
        for urzadzenie, stan in zip(urzadzenia, stany, strict=True):
            pozycja = model.indeks_wezla[urzadzenie.wezel]
            if pozycja not in do_uzupelnienia or pozycja in odwiedzone:
                continue
            if not urzadzenie_wnosi_do_algebry(urzadzenie, stan, complex(start[pozycja])):
                continue
            start[pozycja] = urzadzenie.napiecie_bez_obciazenia(stan)
            odwiedzone.add(pozycja)
            od_sem.add(pozycja)
            rozszerz([pozycja])
        od_sasiada = tuple(
            model.identy_wezlow[pozycja]
            for pozycja in sorted(do_uzupelnienia)
            if pozycja in odwiedzone and pozycja not in od_sem
        )
        return start, od_sasiada, tuple(model.identy_wezlow[pozycja] for pozycja in sorted(od_sem))

    def _bramka_rownowagi(
        self, kontekst: KontekstKroku, stany: tuple[np.ndarray, ...], napiecia: np.ndarray
    ) -> dict[str, Any]:
        nastawy = kontekst.nastawy
        pochodne = pochodne_ukladu(kontekst, stany, napiecia, 0.0)
        reszta_algebry = residuum_algebry(
            kontekst.model, kontekst.odbiory, kontekst.urzadzenia, stany, napiecia
        )
        # Stany zgloszone jako `stany_bez_rownowagi` (SS0 p.3 + kontrakt protokolu)
        # sa wylaczone z NORMY bramki, ale NIE ze sladu: ich residua wchodza do
        # diagnostyki z jawna etykieta, zeby czytelnik widzial, ktora wielkosc
        # dryfuje i jak szybko. Wyjatek jest deklarowany przez URZADZENIE, nie
        # zaszyty w silniku po nazwie stanu — inaczej kazde nowe urzadzenie z
        # calka zasobu wymagaloby edycji rdzenia.
        maska_rownowagi = np.ones(pochodne.shape[0], dtype=bool)
        przesuniecie = 0
        for element in kontekst.elementy:
            bez_rownowagi = set(element.stany_bez_rownowagi)
            for pozycja, nazwa in enumerate(element.nazwy_stanow):
                if nazwa in bez_rownowagi:
                    maska_rownowagi[przesuniecie + pozycja] = False
            przesuniecie += len(element.nazwy_stanow)
        pochodne_rownowagi = pochodne[maska_rownowagi]

        norma_f = float(np.max(np.abs(pochodne_rownowagi))) if pochodne_rownowagi.size else 0.0
        norma_g = float(np.max(np.abs(reszta_algebry))) if reszta_algebry.size else 0.0

        # Residua per ELEMENT: urzadzenia (kazde, jak dotad) i odbiory ZE STANEM (estymator
        # czestotliwosci) — odbior bez stanow nie ma czego raportowac, wiec slad biegu bez
        # odbiorow czulych jest taki jak przed wprowadzeniem stanow odbiorow.
        residua_urzadzen: list[tuple[str, tuple[tuple[str, float], ...]]] = []
        residua_odbiorow: list[tuple[str, tuple[tuple[str, float], ...]]] = []
        przesuniecie = 0
        liczba_odbiorow = len(kontekst.odbiory)
        for indeks, element in enumerate(kontekst.elementy):
            wymiar = len(element.nazwy_stanow)
            wycinek = pochodne[przesuniecie : przesuniecie + wymiar]
            wpis = (
                element.ident,
                tuple(
                    (nazwa, kwantyzuj(float(wartosc)))
                    for nazwa, wartosc in zip(element.nazwy_stanow, wycinek, strict=True)
                ),
            )
            if indeks >= liczba_odbiorow:
                residua_urzadzen.append(wpis)
            elif wymiar:
                residua_odbiorow.append(wpis)
            przesuniecie += wymiar
        # MODUL residuum ZESPOLONEGO wezla (Re i Im). Korekta 2026-09-23 (karta AB-1b.1):
        # dawny zapis `abs(reszta_algebry[pozycja])` czytal wylacznie czesc RZECZYWISTA
        # (wektor residuum jest w postaci [Re; Im]), wiec niezbilansowanie czysto urojone
        # wezla meldowalo sie jako zero. Pomiar: wezel martwy z podanym napieciem
        # 1,0461 pu meldowal residuum 1,0205 (sama czesc rzeczywista).
        liczba_wezlow = kontekst.model.liczba_wezlow
        residua_wezlow = tuple(
            (
                ident,
                kwantyzuj(
                    abs(
                        complex(
                            float(reszta_algebry[pozycja]),
                            float(reszta_algebry[pozycja + liczba_wezlow]),
                        )
                    )
                ),
            )
            for pozycja, ident in enumerate(kontekst.model.identy_wezlow)
        )

        if norma_f > nastawy.eps_init or norma_g > nastawy.eps_init:
            raise OdmowaDynamiki(
                KOD_INICJALIZACJA_NIEZBIEZNA,
                "Punkt pracy nie jest równowagą układu: "
                f"||f|| = {norma_f}, ||g|| = {norma_g}, eps_init = {nastawy.eps_init}",
                residuum_f=norma_f,
                residuum_g=norma_g,
                eps_init=nastawy.eps_init,
                residua_urzadzen=tuple(residua_urzadzen),
                residua_odbiorow=tuple(residua_odbiorow),
                residua_wezlow=residua_wezlow,
            )
        slad: dict[str, Any] = {
            "residuum_f": kwantyzuj(norma_f),
            "residuum_g": kwantyzuj(norma_g),
            "eps_init": kwantyzuj(nastawy.eps_init),
            "stany_bez_rownowagi": [
                f"{urzadzenie.ident}.{nazwa}"
                for urzadzenie in kontekst.urzadzenia
                for nazwa in urzadzenie.stany_bez_rownowagi
            ],
            "urzadzenia": [
                {"urzadzenie": ident, "residua_stanow": [list(pozycja) for pozycja in residua]}
                for ident, residua in residua_urzadzen
            ],
            "wezly": [list(pozycja) for pozycja in residua_wezlow],
        }
        if residua_odbiorow:
            slad["odbiory_ze_stanem"] = [
                {"odbior": ident, "residua_stanow": [list(pozycja) for pozycja in residua]}
                for ident, residua in residua_odbiorow
            ]
        return slad

    # -- zdarzenia --------------------------------------------------------

    @staticmethod
    def _wpisy_chwili(
        t_s: float, wpisy: tuple[WpisHarmonogramu, ...], indeks_wpisu: int
    ) -> list[WpisHarmonogramu]:
        """Wpisy DO WYKONANIA w chwili `t_s` — prefiks harmonogramu, nie rowność bitowa.

        DEFEKT, KTORY TO NAPRAWIA (pomiar 2026-09-17). Poprzednia wersja wybierala
        wpisy przez `wpis.t_s == t_s`. Czas zdarzenia i czas probki, ktore
        RACHUNKOWO sa ta sama chwila, potrafia roznic sie ostatnim bitem:
        `0,1 + 0,05 = 0,15000000000000002`, a `15 * 0,01 = 0,15`. Silnik szedl
        wtedy do chwili probki (wczesniejszej o 2,8e-17 s), nie znajdowal wpisu
        przez rownosc, a przy nastepnym wyborze punktu obowiazkowego odrzucal
        zdarzenie warunkiem `t > t_s + tolerancja` — zdarzenie NIE WYKONYWALO SIE
        NIGDY. Mierzalny skutek: zwarcie zdejmowane w `0,1 + 0,05` s zostawalo w
        sieci do konca biegu, a maszyna „tracila synchronizm" (kat 63,5 rad
        zamiast 0,64 rad). Cichy skip zdarzenia — dokladnie to, czego kontrakt
        harmonogramu zabrania.

        NAPRAWA JEST PREFIKSOWA, nie tolerancyjna „w obie strony": wykonujemy
        KAZDY wpis, ktorego czas nie jest pozniejszy niz biezaca chwila (z
        dokladnoscia osi czasu). Dzieki temu zdarzenie nie moze zostac minięte
        ani wykonane dwa razy, a rozbieznosc czasu zaplanowanego i wykonanego
        jest WIDOCZNA w wyniku (`t_zaplanowany_s` obok `t_wykonany_s`).
        """
        do_wykonania: list[WpisHarmonogramu] = []
        for wpis in wpisy[indeks_wpisu:]:
            if wpis.t_s > t_s + TOLERANCJA_CZASU_S:
                break
            do_wykonania.append(wpis)
        return do_wykonania

    def _chwila_z_probkami(
        self,
        t_s: float,
        wpisy: tuple[WpisHarmonogramu, ...],
        akcje: list[AkcjaOczekujaca],
        poprzednia: _Chwila,
        stany: tuple[np.ndarray, ...],
        napiecia: np.ndarray,
        wykonane: list[ZdarzenieWykonane],
        kroki_szczegolne: list[dict[str, Any]],
        probkowanie: _Probkowanie,
        *,
        na_siatce: bool,
    ) -> _Chwila:
        """Chwila osi czasu z probkami: `L` + `P` przy zdarzeniu, `C` na siatce bez zdarzen.

        Probka `L` powstaje PRZED `_nanies_chwile` — z modelu, odbiorow i urzadzen chwili
        poprzedniej i z napiec z konca ostatniego kroku (te same obiekty, na ktorych stal
        krok calkowania). Dopiero potem zdarzenia sa nanoszone, a probka `P` bierze stan
        po jednej re-inicjalizacji. Jedna regula dla calej osi, takze dla `t = 0` (tam
        `L` jest punktem pracy z rozplywu) i dla chwili horyzontu.
        """
        zdarzenia_chwili = bool(self._wpisy_chwili(t_s, wpisy, poprzednia.indeks_wpisu)) or bool(
            akcje
        )
        if zdarzenia_chwili:
            self._probkuj(
                probkowanie,
                "L",
                t_s,
                poprzednia.model,
                poprzednia.odbiory,
                poprzednia.urzadzenia,
                stany,
                napiecia,
            )
        chwila = self._nanies_chwile(
            t_s, wpisy, akcje, poprzednia, stany, napiecia, wykonane, kroki_szczegolne
        )
        if zdarzenia_chwili or na_siatce:
            self._probkuj(
                probkowanie,
                "P" if zdarzenia_chwili else "C",
                t_s,
                chwila.model,
                chwila.odbiory,
                chwila.urzadzenia,
                chwila.stany,
                chwila.napiecia,
            )
        return chwila

    def _nanies_chwile(
        self,
        t_s: float,
        wpisy: tuple[WpisHarmonogramu, ...],
        akcje: list[AkcjaOczekujaca],
        poprzednia: _Chwila,
        stany: tuple[np.ndarray, ...],
        napiecia: np.ndarray,
        wykonane: list[ZdarzenieWykonane],
        kroki_szczegolne: list[dict[str, Any]],
    ) -> _Chwila:
        """Nanies wszystkie wpisy chwili `t_s`, zloz siec od nowa, re-inicjalizuj RAZ.

        Chwila BEZ zdarzen zachowuje model, odbiory i urzadzenia chwili poprzedniej
        (topologia zmienia sie wylacznie w chwilach zdarzen; ponowne zlozenie z tego
        samego stanu daloby bitowo ta sama macierz). Chwila ZE zdarzeniami klasyfikuje
        wyspy stanu PO zdarzeniach, odcina obszary beznapieciowe i dopiero wtedy
        rozwiazuje algebre.

        KOLEJNOSC W CHWILI (karta AB-1b.1 par. 0 pkt 9): zdarzenia topologiczne i czesciowe
        utraty -> urzadzenia chwili skladane od nowa z urzadzen wejscia -> przypisania stanu
        i komendy regulacji na TYCH urzadzeniach (urzadzenie odlaczone nie ma stanow
        przypisywalnych; agregat po utracie dzieli nastawe mocy przez udzial) -> kontrola
        zakresu waznosci stanow po przypisaniu -> jedna re-inicjalizacja. Ciaglosc stanow
        nieprzypisanych jest MIERZONA wobec stanow sprzed calej chwili.
        """
        wejscie = self.wejscie
        planowane = self._wpisy_chwili(t_s, wpisy, poprzednia.indeks_wpisu)
        # Wpisy planowane (kolejnosc kanoniczna harmonogramu), potem akcje dozorow (kolejnosc
        # chwili wykonania, indeksu dozoru i akcji) — z lokalizacja przekroczenia albo bez.
        do_wykonania = planowane + [akcja.wpis for akcja in akcje]
        lokalizacje: list[Lokalizacja | None] = [None] * len(planowane) + [
            akcja.lokalizacja for akcja in akcje
        ]

        if not do_wykonania:
            return _Chwila(
                indeks_wpisu=poprzednia.indeks_wpisu,
                stan_scenariusza=poprzednia.stan_scenariusza,
                model=poprzednia.model,
                odbiory=poprzednia.odbiory,
                urzadzenia=poprzednia.urzadzenia,
                stany=stany,
                napiecia=napiecia,
                kontekst=poprzednia.kontekst,
                bylo_zdarzenie=False,
                residuum_kcl_max=0.0,
                odbiory_odciete=poprzednia.odbiory_odciete,
                start_od_sasiada=False,
                reset_estymatorow=False,
            )

        stany_przed_chwila = tuple(np.array(stan, dtype=float, copy=True) for stan in stany)
        stany_odbiorow, stany_urzadzen = rozdziel_stany(
            poprzednia.odbiory, poprzednia.urzadzenia, stany
        )
        nowy_stan = poprzednia.stan_scenariusza
        for wpis in do_wykonania:
            nowy_stan = zastosuj(wpis, nowy_stan)
        urzadzenia_po = urzadzenia_w_stanie(wejscie.urzadzenia, nowy_stan)
        stany_urzadzen_po, przypisania_wpisow, przypisane_urzadzen = self._przypisz(
            t_s, do_wykonania, urzadzenia_po, stany_urzadzen
        )
        if przypisane_urzadzen:
            dolne_wazne, gorne_wazne = zakresy_waznosci_elementow(urzadzenia_po)
            sprawdz_zakresy_waznosci(
                spakuj_stany(stany_urzadzen_po),
                dolne_wazne,
                gorne_wazne,
                KontekstKroku(poprzednia.model, (), urzadzenia_po, wejscie.nastawy).adresy_stanow,
                wejscie.nastawy,
                t_s,
            )
        beznapieciowe, przydzial = self._obszary_beznapieciowe(
            nowy_stan, urzadzenia_po, stany_urzadzen_po, napiecia
        )
        self._sprawdz_izolacje(
            t_s,
            do_wykonania,
            nowy_stan,
            beznapieciowe,
            przydzial,
            urzadzenia_po,
            stany_urzadzen_po,
            napiecia,
        )
        model = self._model_dla(nowy_stan, beznapieciowe)
        przed_martwe = poprzednia.model.wezly_beznapieciowe
        obszary_odciete = tuple(
            ident
            for ident in model.identy_wezlow
            if ident in beznapieciowe and ident not in przed_martwe
        )
        obszary_zasilone = tuple(
            ident
            for ident in model.identy_wezlow
            if ident in przed_martwe and ident not in beznapieciowe
        )
        # Algebra chwili liczy odbiory wezlow PONOWNIE ZASILONYCH z estymatorem wyzerowanym
        # (czestotliwosc widziana = f_n): odbior odciety nie mierzyl, a jego stan dostaje po
        # tej algebrze wartosc `arg V+` (regula ponownego zasilenia).
        odbiory_algebry = self._modele_odbiorow(
            nowy_stan, beznapieciowe, t_s, frozenset(obszary_zasilone)
        )
        stany_po = (*stany_odbiorow, *stany_urzadzen_po)
        self._sprawdz_wezly_zerowe(t_s, model, odbiory_algebry, urzadzenia_po, stany_po)
        napiecia_startowe, start_od_sasiada, start_od_sem = self._napiecia_startowe(
            poprzednia.model, model, napiecia, urzadzenia_po, stany_urzadzen_po
        )

        napiecia_po, raport = reinicjalizuj(
            model,
            odbiory_algebry,
            urzadzenia_po,
            stany_po,
            napiecia,
            nastawy=wejscie.nastawy,
            t_s=t_s,
            napiecia_startowe=napiecia_startowe,
        )
        odbiory = self._modele_odbiorow(nowy_stan, beznapieciowe, t_s, frozenset())
        stany_odbiorow_po, przypisania_estymatorow, przypisane_odbiorow = _reinicjalizuj_estymatory(
            model, odbiory_algebry, stany_odbiorow, napiecia_po
        )
        stany_po = (*stany_odbiorow_po, *stany_urzadzen_po)
        przypisane = frozenset(
            {(len(odbiory) + indeks, pozycja) for indeks, pozycja in przypisane_urzadzen}
            | przypisane_odbiorow
        )
        if przypisania_estymatorow:
            # Przypisanie wynika ze stanu PO wszystkich zdarzeniach chwili (ponowne zasilenie
            # jest skutkiem chwili, nie jednego wpisu) — zapis przy ostatnim wpisie chwili.
            przypisania_wpisow = (
                *przypisania_wpisow[:-1],
                (*przypisania_wpisow[-1], *przypisania_estymatorow),
            )
        _sprawdz_odbiory(model, odbiory, stany_po, napiecia_po, t_s, bledy_fazy_przed=None)
        delta_x_nieprzypisane = _skok_stanow_nieprzypisanych(
            stany_przed_chwila, stany_po, przypisane
        )
        # „Moc sprzed odciecia" = moc POBIERANA tuz przed chwila (probka L) wg modelu odbioru
        # sprzed chwili (`moc_poboru_pu` przy napieciu L i stanie estymatora L); odbior, ktory
        # przed chwila nie pobieral (byl odlaczony zdarzeniem), nie mial czego stracic — zero.
        odbiory_odciete = tuple(
            (
                odbior_przed.ident,
                odbior_przed.moc_poboru_pu(
                    stan_przed,
                    complex(napiecia[poprzednia.model.indeks_wezla[odbior_przed.wezel]]),
                ),
            )
            for odbior_przed, stan_przed, odbior in zip(
                poprzednia.odbiory, stany_odbiorow, odbiory, strict=True
            )
            if odbior.ident in _odbiory_odciete(odbiory, nowy_stan)
            and odbior.ident not in poprzednia.odbiory_odciete
        )
        for wpis, przypisania, lokalizacja in zip(
            do_wykonania, przypisania_wpisow, lokalizacje, strict=True
        ):
            wykonane.append(
                ZdarzenieWykonane(
                    t_zaplanowany_s=wpis.t_s,
                    t_wykonany_s=t_s,
                    rodzaj=wpis.rodzaj,
                    ref=wpis.ref,
                    przyczyna=wpis.przyczyna,
                    delta_x_nieprzypisane_max=delta_x_nieprzypisane,
                    delta_y_max=raport.delta_y_max,
                    residuum_kcl_max=raport.residuum_kcl_max,
                    obszary_odciete=obszary_odciete,
                    odbiory_odciete=odbiory_odciete,
                    obszary_zasilone_ponownie=obszary_zasilone,
                    przypisania=przypisania,
                    t_zlokalizowany_s=None if lokalizacja is None else lokalizacja.t_s,
                    szerokosc_przedzialu_s=None if lokalizacja is None else lokalizacja.szerokosc_s,
                    iteracje_lokalizacji=None if lokalizacja is None else lokalizacja.iteracje,
                    g_przed=None if lokalizacja is None else lokalizacja.g_przed,
                    g_po=None if lokalizacja is None else lokalizacja.g_po,
                )
            )
        kroki_szczegolne.append(
            {
                "t_s": kwantyzuj(t_s),
                "powod": "zdarzenie",
                "rodzaje": [wpis.rodzaj for wpis in do_wykonania],
                "przyczyny": [wpis.przyczyna for wpis in do_wykonania],
                "delta_x_nieprzypisane_max": kwantyzuj(delta_x_nieprzypisane),
                "delta_y_max": kwantyzuj(raport.delta_y_max),
                "residuum_kcl_max": kwantyzuj(raport.residuum_kcl_max),
                "iteracje": raport.iteracje,
                "nawroty": raport.nawroty,
                "obszary_odciete": list(obszary_odciete),
                "odbiory_odciete": _opis_odbiorow(
                    tuple(
                        odbior.odbior for odbior in odbiory if odbior.ident in dict(odbiory_odciete)
                    )
                ),
                "obszary_zasilone_ponownie": list(obszary_zasilone),
                "wezly_ograniczone": list(raport.wezly_ograniczone),
                "wezly_start_od_sasiada": list(start_od_sasiada),
                "wezly_start_od_sem_urzadzenia": list(start_od_sem),
                "przypisania": [
                    [przypisanie.adres, kwantyzuj(przypisanie.przed), kwantyzuj(przypisanie.po)]
                    for przypisania in przypisania_wpisow
                    for przypisanie in przypisania
                ],
            }
        )
        return _Chwila(
            indeks_wpisu=poprzednia.indeks_wpisu + len(planowane),
            stan_scenariusza=nowy_stan,
            model=model,
            odbiory=odbiory,
            urzadzenia=urzadzenia_po,
            stany=stany_po,
            napiecia=napiecia_po,
            kontekst=KontekstKroku(model, odbiory, urzadzenia_po, wejscie.nastawy),
            bylo_zdarzenie=True,
            residuum_kcl_max=raport.residuum_kcl_max,
            odbiory_odciete=_odbiory_odciete(odbiory, nowy_stan),
            start_od_sasiada=bool(start_od_sasiada or start_od_sem),
            reset_estymatorow=bool(przypisania_estymatorow),
        )

    def _modele_odbiorow(
        self,
        stan: StanScenariusza,
        beznapieciowe: frozenset[str],
        t_s: float,
        zasilone_ponownie: frozenset[str],
    ) -> tuple[OdbiorCharakterystyczny, ...]:
        """Model KAZDEGO odbioru wejscia w stanie scenariusza (kolejnosc wejscia).

        Odbior w obszarze beznapieciowym -> tryb 3 (odciety — TEN SAM predykat, co
        `stan_zasilania@ = 0`); odbior odlaczony zdarzeniem na zywej szynie -> tryb 2;
        pozostale maja obwod, z naniesionymi skokami mocy bazowej
        (`zdarzenia.odbiory_po_zdarzeniach`). Odbior bez obwodu zachowuje DANE (moc bazowa i
        charakterystyka), bo jego stan estymatora istnieje dalej, a przy ponownym
        zalaczeniu jego skoki mocy wracaja razem z nim. `zasilone_ponownie` — wezly, ktore
        w tej chwili przestaly byc beznapieciowe: odbiory z obwodem w tych wezlach licza
        algebre chwili z estymatorem wyzerowanym.
        """
        wejscie = self.wejscie
        przylaczone = {
            odbior.ident: odbior
            for odbior in odbiory_po_zdarzeniach(wejscie.odbiory, stan, t_s=t_s)
        }
        modele: list[OdbiorCharakterystyczny] = []
        for odbior in wejscie.odbiory:
            if odbior.wezel in beznapieciowe:
                tryb: float | None = TRYB_ODCIETY
            elif odbior.ident not in przylaczone:
                tryb = TRYB_ODLACZONY
            else:
                tryb = None
            modele.append(
                model_odbioru(
                    przylaczone.get(odbior.ident, odbior),
                    wejscie.f_bazowa_hz,
                    tryb_poza_obwodem=tryb,
                    estymator_wyzerowany=tryb is None and odbior.wezel in zasilone_ponownie,
                )
            )
        return tuple(modele)

    @staticmethod
    def _przypisz(
        t_s: float,
        do_wykonania: list[WpisHarmonogramu],
        urzadzenia: tuple[Urzadzenie, ...],
        stany: tuple[np.ndarray, ...],
    ) -> tuple[
        tuple[np.ndarray, ...],
        tuple[tuple[PrzypisanieWykonane, ...], ...],
        frozenset[tuple[int, int]],
    ]:
        """Przypisania stanu i komendy regulacji chwili — na urzadzeniach TEJ chwili.

        Zwraca (stany po przypisaniu, przypisania kazdego wpisu, pozycje przypisane).
        Stany nieprzypisane sa KOPIAMI bez zmiany; stan przypisany dostaje wartosc
        zadana DOKLADNIE (bez „dociagania" i bez reinicjalizacji urzadzenia z punktu
        pracy, ktora zniszczylaby ciaglosc pozostalych stanow). Komenda wybiera stan z
        deklaracji urzadzenia chwili (`nastawy_regulacji`): mnoznik agregatu po czesciowej
        utracie i zakres nastawy (ten sam predykat, co punkt poczatkowy) sa tam.
        """
        nowe = [np.array(stan, dtype=float, copy=True) for stan in stany]
        indeksy = {urzadzenie.ident: pozycja for pozycja, urzadzenie in enumerate(urzadzenia)}
        przypisane: set[tuple[int, int]] = set()
        wszystkie: list[tuple[PrzypisanieWykonane, ...]] = []
        for wpis in do_wykonania:
            if wpis.rodzaj not in RODZAJE_PRZYPISAN:
                wszystkie.append(())
                continue
            indeks = indeksy[wpis.ref]
            urzadzenie = urzadzenia[indeks]
            wpisu: list[PrzypisanieWykonane] = []
            for klucz, wartosc in wpis.przypisania:
                if wpis.rodzaj == "przypisanie_stanu":
                    nazwa, wartosc_stanu = klucz, wartosc
                else:
                    nazwa = nastawa_regulacji(urzadzenie, klucz, t_s)  # type: ignore[arg-type]
                    (nastawa,) = (
                        pozycja
                        for pozycja in urzadzenie.nastawy_regulacji
                        if pozycja.wielkosc == klucz
                    )
                    wartosc_stanu = nastawa.mnoznik * wartosc
                    if nastawa.zakres is not None and not (
                        nastawa.zakres[0] <= wartosc_stanu <= nastawa.zakres[1]
                    ):
                        raise OdmowaDynamiki(
                            KOD_PUNKT_PRACY_POZA_OGRANICZENIEM,
                            f"Komenda regulacji {klucz.upper()} urządzenia {urzadzenie.ident!r} "
                            f"w t={t_s} s: nastawa {wartosc_stanu} pu (stan {nazwa}) poza "
                            f"zakresem urządzenia [{nastawa.zakres[0]}, {nastawa.zakres[1]}] pu "
                            f"({nastawa.powod_pl}) — zadany punkt pracy nie istnieje; nastawa "
                            "nie jest przycinana po cichu",
                            urzadzenie=urzadzenie.ident,
                            wielkosc=klucz,
                            stan=nazwa,
                            nastawa_pu=wartosc_stanu,
                            zakres=nastawa.zakres,
                            t_s=t_s,
                        )
                sprawdz_przypisanie(urzadzenie, nazwa, wartosc_stanu, t_s)
                pozycja_stanu = urzadzenie.nazwy_stanow.index(nazwa)
                przed = float(nowe[indeks][pozycja_stanu])
                nowe[indeks][pozycja_stanu] = wartosc_stanu
                przypisane.add((indeks, pozycja_stanu))
                wpisu.append(
                    PrzypisanieWykonane(
                        adres=f"{urzadzenie.ident}.{nazwa}", przed=przed, po=wartosc_stanu
                    )
                )
            wszystkie.append(tuple(wpisu))
        if not przypisane:
            return stany, tuple(wszystkie), frozenset()
        return tuple(nowe), tuple(wszystkie), frozenset(przypisane)

    def _obszary_beznapieciowe(
        self,
        stan: StanScenariusza,
        urzadzenia: tuple[Urzadzenie, ...],
        stany: tuple[np.ndarray, ...],
        napiecia: np.ndarray,
    ) -> tuple[frozenset[str], tuple[int, ...]]:
        """Wezly wysp, w ktorych ZADNE urzadzenie nie wnosi do algebry (stan PO zdarzeniach),
        oraz przydzial wezlow do wysp tego stanu.

        Predykat jest oceniany w punkcie SPRZED re-inicjalizacji (stany trzymane, napiecia
        z konca ostatniego kroku) — pytanie jest strukturalne (czy skladnik w ogole
        wchodzi do rownania), wiec nie zalezy od rozwiazania, ktore dopiero powstanie.
        """
        wezly = self.wejscie.wezly
        indeks = {wezel.ident: pozycja for pozycja, wezel in enumerate(wezly)}
        przydzial = przydzial_wysp(
            tuple(indeks),
            indeks,
            self.wejscie.galezie,
            galezie_laczace(stan.galezie_aktywne, stan.zwarcia_galezi),
        )
        zywe, _ = klasyfikuj_wyspy(przydzial, indeks, urzadzenia, stany, napiecia)
        beznapieciowe = frozenset(
            wezel.ident for pozycja, wezel in enumerate(wezly) if przydzial[pozycja] not in zywe
        )
        return beznapieciowe, przydzial

    def _sprawdz_izolacje(
        self,
        t_s: float,
        do_wykonania: list[WpisHarmonogramu],
        stan: StanScenariusza,
        beznapieciowe: frozenset[str],
        przydzial: tuple[int, ...],
        urzadzenia: tuple[Urzadzenie, ...],
        stany: tuple[np.ndarray, ...],
        napiecia: np.ndarray,
    ) -> None:
        """PREDYKAT IZOLACJI usuniecia `izolacja` w stanie t+ (karta AB-1b.1 par. 0 pkt 4).

        Luk gasnie przy PRZERWANIU pradu, czyli w chwili otwarcia. Usuniecie zwarcia
        rodzaju `izolacja` jest wiec dopuszczalne wylacznie wtedy, gdy PO naniesieniu
        wszystkich zdarzen chwili miejsce zwarcia lezy w obszarze beznapieciowym (wezel)
        albo galaz zwarta jest nieaktywna lub ma oba zaciski w obszarze beznapieciowym.
        Ponowne podanie napiecia w tej samej chwili co usuniecie tez konczy sie odmowa —
        usuniecie trzeba datowac na przerwe beznapieciowa. Odmowa niesie pomiar: miejsce,
        sklad wyspy i urzadzenia, ktore ja zasilaja.
        """
        wezly = self.wejscie.wezly
        indeks = {wezel.ident: pozycja for pozycja, wezel in enumerate(wezly)}
        galezie = {galaz.ident: galaz for galaz in self.wejscie.galezie}
        for wpis in do_wykonania:
            if wpis.sposob_usuniecia != "izolacja":
                continue
            if wpis.rodzaj == "zdjecie_zwarcia":
                zaciski: tuple[str, ...] = (wpis.ref,)
                odizolowane = wpis.ref in beznapieciowe
                miejsce: dict[str, object] = {"wezel": wpis.ref}
            else:
                galaz = galezie[wpis.ref]
                zaciski = (galaz.wezel_od, galaz.wezel_do)
                odizolowane = wpis.ref not in stan.galezie_aktywne or all(
                    wezel in beznapieciowe for wezel in zaciski
                )
                miejsce = {"galaz": wpis.ref, "polozenie_wzgledne": wpis.polozenie_wzgledne}
            if odizolowane:
                continue
            zasilany = next(wezel for wezel in zaciski if wezel not in beznapieciowe)
            numer = przydzial[indeks[zasilany]]
            wyspa = tuple(
                wezel.ident for pozycja, wezel in enumerate(wezly) if przydzial[pozycja] == numer
            )
            wnoszace = tuple(
                urzadzenie.ident
                for urzadzenie, stan_urzadzenia in zip(urzadzenia, stany, strict=True)
                if przydzial[indeks[urzadzenie.wezel]] == numer
                and urzadzenie_wnosi_do_algebry(
                    urzadzenie, stan_urzadzenia, complex(napiecia[indeks[urzadzenie.wezel]])
                )
            )
            raise OdmowaDynamiki(
                KOD_ZWARCIE_NIEODIZOLOWANE,
                f"Usunięcie zwarcia {miejsce} w t = {t_s} s zadeklarowane jako `izolacja`, ale "
                f"w stanie po zdarzeniach tej chwili miejsce zwarcia nadal leży w wyspie "
                f"zasilanej {wyspa} przez {wnoszace}. Żaden aparat nie przerwał prądu zwarcia: "
                "dodaj otwarcie gałęzi odcinających miejsce zwarcia w tej chwili albo "
                "zadeklaruj usunięcie `samoczynne` (idealizacja zwarcia przemijającego).",
                t_s=t_s,
                wyspa=wyspa,
                urzadzenia_wnoszace=wnoszace,
                **miejsce,
            )

    def _model_dla(self, stan: StanScenariusza, beznapieciowe: frozenset[str]) -> ModelSieci:
        return zloz_model_sieci(
            self.wejscie.wezly,
            self.wejscie.galezie,
            self.wejscie.odsprzegi,
            galezie_aktywne=stan.galezie_aktywne,
            odsprzegi_aktywne=stan.odsprzegi_aktywne,
            admitancje_zwarc=stan.admitancje_zwarc,
            zwarcia_metaliczne=stan.zwarcia_metaliczne,
            wezly_beznapieciowe=beznapieciowe,
            zwarcia_galezi=stan.zwarcia_galezi,
        )

    # -- os czasu ---------------------------------------------------------

    def _punkt_obowiazkowy(
        self,
        t_s: float,
        wpisy: tuple[WpisHarmonogramu, ...],
        indeks_wpisu: int,
        indeks_probki: int,
        nastawy: NastawySolvera,
        nadzor: NadzorDozorow | None,
    ) -> float:
        kandydaci = [nastawy.horyzont_s]
        chwila_probki = indeks_probki * nastawy.krok_wyjscia_s
        if chwila_probki <= nastawy.horyzont_s:
            kandydaci.append(chwila_probki)
        for wpis in wpisy[indeks_wpisu:]:
            if wpis.t_s > t_s + TOLERANCJA_CZASU_S:
                kandydaci.append(wpis.t_s)
                break
        if nadzor is not None:
            # Akcja dozoru ze zwloka jest punktem obowiazkowym jak wpis planowany: krok
            # laduje DOKLADNIE w `t* + zwloka`, nie „gdzies w kroku".
            akcja = nadzor.nastepna_akcja_s(t_s, TOLERANCJA_CZASU_S)
            if akcja is not None:
                kandydaci.append(akcja)
        return min(kandydat for kandydat in kandydaci if kandydat > t_s + TOLERANCJA_CZASU_S)

    def _jest_chwila_zdarzen(
        self,
        t_s: float,
        wpisy: tuple[WpisHarmonogramu, ...],
        indeks_wpisu: int,
        nadzor: NadzorDozorow,
    ) -> bool:
        """Czy w chwili `t_s` wykonuje sie zdarzenie (planowane albo akcja dozoru)."""
        return bool(self._wpisy_chwili(t_s, wpisy, indeks_wpisu)) or bool(
            nadzor.akcje_chwili(t_s, TOLERANCJA_CZASU_S)
        )

    def _nadzor(self) -> NadzorDozorow | None:
        """Nadzor dozorow biegu — `None`, gdy harmonogram nie niesie dozorow (sciezka bez
        zmian, bitowo). Dozory bez tolerancji lokalizacji to odmowa `nastawy_sprzeczne`;
        akcje i wielkosci sa walidowane PRZED biegiem (`zdarzenia.szablony_akcji_dozorow`)."""
        wejscie = self.wejscie
        dozory = wejscie.harmonogram.dozory
        if not dozory:
            return None
        tolerancja = wejscie.nastawy.tolerancja_lokalizacji_zdarzen_s
        if tolerancja is None:
            raise OdmowaDynamiki(
                KOD_NASTAWY_SPRZECZNE,
                f"Harmonogram niesie {len(dozory)} dozorow (zdarzeń warunkowych), a nastawy "
                "nie podaja tolerancji lokalizacji zdarzeń — chwila przekroczenia nie miałaby "
                "zadeklarowanej dokładności",
                pole="tolerancja_lokalizacji_zdarzen_s",
                dozory=tuple(dozor.ident for dozor in dozory),
            )
        szablony = szablony_akcji_dozorow(
            dozory,
            wezly=wejscie.wezly,
            galezie=wejscie.galezie,
            odsprzegi=wejscie.odsprzegi,
            odbiory=wejscie.odbiory,
            urzadzenia=wejscie.urzadzenia,
            s_bazowa_mva=wejscie.s_bazowa_mva,
            horyzont_s=wejscie.nastawy.horyzont_s,
            indeks_bazowy=len(wejscie.harmonogram.zdarzenia),
        )
        return NadzorDozorow(
            dozory,
            szablony,
            tolerancja_s=tolerancja,
            tolerancja_czasu_s=TOLERANCJA_CZASU_S,
            f_bazowa_hz=wejscie.f_bazowa_hz,
        )

    @staticmethod
    def _dozory_po_kroku(
        nadzor: NadzorDozorow,
        integrator: Integrator,
        kontekst: KontekstKroku,
        stany: tuple[np.ndarray, ...],
        napiecia: np.ndarray,
        t0_s: float,
        t1_s: float,
        wynik_kroku: WynikKroku,
        *,
        zdarzenia_w_koncu: bool,
    ) -> tuple[float | None, WynikKroku]:
        """Ocena dozorow po przyjetym kroku; przy pobudzeniu — krok SKROCONY do chwili akcji.

        Kazda proba lokalizacji jest JEDNYM krokiem tego samego integratora z zapisanego
        stanu `t0` (krok nie ma pamieci), wiec lokalizowany jest pierwiastek trajektorii
        dyskretnej. Proby sa zapamietywane po dlugosci — krok wyladowany w chwili akcji
        jest DOKLADNIE ta proba, ktora wyznaczyla chwile (bez ponownego liczenia).
        Koniec kroku bedacy chwila zdarzenia jest oceniany jako probka `L`.
        """
        proby: dict[float, WynikKroku] = {}

        def proba(tau_s: float) -> StanUkladu:
            if tau_s not in proby:
                proby[tau_s] = integrator.krok(kontekst, stany, napiecia, t0_s, tau_s)
            wynik = proby[tau_s]
            return StanUkladu(
                kontekst.model,
                kontekst.odbiory,
                kontekst.urzadzenia,
                wynik.stany,
                wynik.napiecia,
                "C",
            )

        koniec = StanUkladu(
            kontekst.model,
            kontekst.odbiory,
            kontekst.urzadzenia,
            wynik_kroku.stany,
            wynik_kroku.napiecia,
            "L" if zdarzenia_w_koncu else "C",
        )
        ladowanie = nadzor.po_kroku(t0_s, t1_s, koniec, proba)
        if ladowanie is None or ladowanie == t1_s:
            return ladowanie, wynik_kroku
        return ladowanie, proby[ladowanie - t0_s]

    def _jest_chwila_probki(self, t_s: float, indeks_probki: int, nastawy: NastawySolvera) -> bool:
        chwila = indeks_probki * nastawy.krok_wyjscia_s
        return abs(chwila - t_s) <= TOLERANCJA_CZASU_S and chwila <= nastawy.horyzont_s

    def _nowy_krok(self, krok: float, blad: float, tolerancja: float, rzad: int) -> float:
        if blad <= 0.0:
            return krok * MAX_WZROST_KROKU
        wspolczynnik = MARGINES_DOBORU_KROKU * (tolerancja / blad) ** (1.0 / (rzad + 1))
        return krok * min(MAX_WZROST_KROKU, max(MAX_SPADEK_KROKU, wspolczynnik))

    # -- kanaly, probki, metryki -----------------------------------------

    def _kanaly(
        self,
        model: ModelSieci,
        urzadzenia: tuple[Urzadzenie, ...],
        miejsca_zwarc: tuple[_MiejsceZwarcia, ...],
        odbiory: tuple[OdbiorDynamiki, ...],
    ) -> tuple[KanalWyniku, ...]:
        kanaly: list[KanalWyniku] = []
        for ident in model.identy_wezlow:
            kanaly.append(
                KanalWyniku(
                    klucz=f"u_pu@{ident}",
                    przestrzen="siec",
                    jednostka="pu",
                    element_ref=ident,
                    opis_pl="Moduł napięcia szyny",
                )
            )
            kanaly.append(
                KanalWyniku(
                    klucz=f"kat_deg@{ident}",
                    przestrzen="siec",
                    jednostka="deg",
                    element_ref=ident,
                    opis_pl="Kąt napięcia szyny",
                )
            )
        for urzadzenie in urzadzenia:
            for nazwa in urzadzenie.nazwy_stanow:
                kanaly.append(
                    KanalWyniku(
                        klucz=f"{nazwa}@{urzadzenie.ident}",
                        przestrzen="urzadzenie",
                        jednostka=jednostka_stanu(nazwa),
                        element_ref=urzadzenie.ident,
                        opis_pl="Zmienna stanu urządzenia",
                    )
                )
            kanaly.append(
                KanalWyniku(
                    klucz=f"p_pu@{urzadzenie.ident}",
                    przestrzen="urzadzenie",
                    jednostka="pu",
                    element_ref=urzadzenie.ident,
                    opis_pl="Moc czynna oddawana do sieci przez urządzenie",
                )
            )
            kanaly.append(
                KanalWyniku(
                    klucz=f"q_pu@{urzadzenie.ident}",
                    przestrzen="urzadzenie",
                    jednostka="pu",
                    element_ref=urzadzenie.ident,
                    opis_pl="Moc bierna oddawana do sieci przez urządzenie",
                )
            )
        kanaly.extend(self._kanaly_obserwabli(model))
        for miejsce in miejsca_zwarc:
            kanaly.append(
                KanalWyniku(
                    klucz=f"i_zwarcia_pu@{miejsce.klucz}",
                    przestrzen="obserwabla",
                    jednostka="pu",
                    element_ref=miejsce.element,
                    opis_pl=f"Moduł prądu do ziemi w miejscu zwarcia {miejsce.opis_pl}",
                )
            )
            kanaly.append(
                KanalWyniku(
                    klucz=f"u_zwarcia_pu@{miejsce.klucz}",
                    przestrzen="obserwabla",
                    jednostka="pu",
                    element_ref=miejsce.element,
                    opis_pl=f"Moduł napięcia w miejscu zwarcia {miejsce.opis_pl}",
                )
            )
            kanaly.append(
                KanalWyniku(
                    klucz=f"i_zwarcia_kat_deg@{miejsce.klucz}",
                    przestrzen="obserwabla",
                    jednostka="deg",
                    element_ref=miejsce.element,
                    opis_pl=(
                        f"Kąt fazora prądu do ziemi w miejscu zwarcia {miejsce.opis_pl} "
                        "(brak wartości przy prądzie zerowym)"
                    ),
                )
            )
        kanaly.extend(self._kanaly_stanow_i_katow(model))
        kanaly.extend(_kanaly_odbiorow(odbiory))
        return tuple(kanaly)

    def _kanaly_stanow_i_katow(self, model: ModelSieci) -> tuple[KanalWyniku, ...]:
        """Kanaly karty AB-1b.1 (par. 0 pkt 8): stan zasilania wezla, stan galezi, katy fazorow.

        Dopisane ZA dawnymi kanalami, wiec dawna lista kanalow jest bitowo prefiksem nowej.
        Katy fazorow pradu leza w tym samym ukladzie wirujacym, co `kat_deg@` wezlow; przy
        pradzie DOKLADNIE zerowym (galaz otwarta, obszar beznapieciowy) kata nie ma —
        probka niesie `None`, a jednoznacznosc zera modulu niesie `stan_galezi@`.
        """
        kanaly: list[KanalWyniku] = []
        for ident in model.identy_wezlow:
            kanaly.append(
                KanalWyniku(
                    klucz=f"stan_zasilania@{ident}",
                    przestrzen="siec",
                    jednostka="kod",
                    element_ref=ident,
                    opis_pl=(
                        "Stan zasilania szyny: 1 zasilana, 0 beznapięciowa, "
                        "2 napięcie narzucone (zwarcie metaliczne albo źródło idealne)"
                    ),
                )
            )
        for galaz in model.galezie:
            kanaly.append(
                KanalWyniku(
                    klucz=f"stan_galezi@{galaz.ident}",
                    przestrzen="siec",
                    jednostka="kod",
                    element_ref=galaz.ident,
                    opis_pl="Stan gałęzi: 1 załączona, 0 wyłączona",
                )
            )
            for przyrostek, zacisk in (
                ("i_od_kat_deg", "początkowego"),
                ("i_do_kat_deg", "końcowego"),
            ):
                kanaly.append(
                    KanalWyniku(
                        klucz=f"{przyrostek}@{galaz.ident}",
                        przestrzen="obserwabla",
                        jednostka="deg",
                        element_ref=galaz.ident,
                        opis_pl=(
                            f"Kąt fazora prądu zacisku {zacisk} gałęzi; brak wartości przy "
                            "prądzie zerowym"
                        ),
                    )
                )
        return tuple(kanaly)

    def _kanaly_obserwabli(self, model: ModelSieci) -> tuple[KanalWyniku, ...]:
        """Kanaly przestrzeni `z` (W6-A): czestotliwosc wezlow i wielkosci zaciskow galezi.

        Przestrzen `obserwabla` jest ODDZIELNA od `siec` i `urzadzenie`, bo te wielkosci nie
        sa ani stanem, ani zmienna algebraiczna — sa wyprowadzone jawnym wzorem z obu.
        Czestotliwosc idzie ZAWSZE w trojce: wartosc, niepewnosc, stan jakosci; publikowanie
        samej wartosci pozwalaloby odczytac liczbe z glebokiego zapadu jako pomiar.
        """
        kanaly: list[KanalWyniku] = []
        for ident in model.identy_wezlow:
            kanaly.append(
                KanalWyniku(
                    klucz=f"f_hz@{ident}",
                    przestrzen="obserwabla",
                    jednostka="Hz",
                    element_ref=ident,
                    opis_pl="Częstotliwość elektryczna szyny",
                )
            )
            kanaly.append(
                KanalWyniku(
                    klucz=f"u_f_est_hz@{ident}",
                    przestrzen="obserwabla",
                    jednostka="Hz",
                    element_ref=ident,
                    opis_pl="Oszacowanie błędu numerycznego częstotliwości szyny",
                )
            )
            kanaly.append(
                KanalWyniku(
                    klucz=f"jakosc_f@{ident}",
                    przestrzen="obserwabla",
                    jednostka="kod",
                    element_ref=ident,
                    opis_pl="Rozróżnialność odchyłki częstotliwości szyny",
                )
            )
        for galaz in model.galezie:
            for przyrostek, opis in (
                ("i_od_pu", "Moduł prądu zacisku początkowego gałęzi"),
                ("i_do_pu", "Moduł prądu zacisku końcowego gałęzi"),
                ("p_od_pu", "Moc czynna wpływająca do gałęzi zaciskiem początkowym"),
                ("q_od_pu", "Moc bierna wpływająca do gałęzi zaciskiem początkowym"),
                ("p_do_pu", "Moc czynna wpływająca do gałęzi zaciskiem końcowym"),
                ("q_do_pu", "Moc bierna wpływająca do gałęzi zaciskiem końcowym"),
            ):
                kanaly.append(
                    KanalWyniku(
                        klucz=f"{przyrostek}@{galaz.ident}",
                        przestrzen="obserwabla",
                        jednostka="pu",
                        element_ref=galaz.ident,
                        opis_pl=opis,
                    )
                )
        return tuple(kanaly)

    def _probkuj(
        self,
        probkowanie: _Probkowanie,
        strona: str,
        t_s: float,
        model: ModelSieci,
        odbiory: tuple[OdbiorCharakterystyczny, ...],
        urzadzenia: tuple[Urzadzenie, ...],
        stany: tuple[np.ndarray, ...],
        napiecia: np.ndarray,
    ) -> None:
        """Jedna probka WSZYSTKICH kanalow ze strona `C`, `L` albo `P`."""
        probki = probkowanie.probki
        probkowanie.os_czasu.append(t_s)
        probkowanie.strony.append(strona)
        stany_odbiorow, stany_urzadzen = rozdziel_stany(odbiory, urzadzenia, stany)
        for pozycja, ident in enumerate(model.identy_wezlow):
            napiecie = complex(napiecia[pozycja])
            probki[f"u_pu@{ident}"].append(abs(napiecie))
            probki[f"kat_deg@{ident}"].append(_kat_deg(napiecie))
        for indeks, (urzadzenie, stan) in enumerate(zip(urzadzenia, stany_urzadzen, strict=True)):
            for nazwa, wartosc in zip(urzadzenie.nazwy_stanow, stan, strict=True):
                probki[f"{nazwa}@{urzadzenie.ident}"].append(float(wartosc))
            moc = moc_urzadzenia_pu(model, odbiory, urzadzenia, stany, napiecia, indeks)
            probki[f"p_pu@{urzadzenie.ident}"].append(float(moc.real))
            probki[f"q_pu@{urzadzenie.ident}"].append(float(moc.imag))
        self._probkuj_obserwable(probki, strona, model, odbiory, urzadzenia, stany, napiecia)
        self._probkuj_zwarcia(
            probki, model, odbiory, urzadzenia, stany, napiecia, probkowanie.miejsca_zwarc
        )
        self._probkuj_stany_i_katy(probki, model, urzadzenia, napiecia)
        _probkuj_odbiory(probki, model, odbiory, stany_odbiorow, napiecia)

    def _probkuj_stany_i_katy(
        self,
        probki: dict[str, list[float | None]],
        model: ModelSieci,
        urzadzenia: tuple[Urzadzenie, ...],
        napiecia: np.ndarray,
    ) -> None:
        """Stan zasilania wezlow, stan galezi i katy fazorow pradow zaciskow."""
        narzucone = {
            model.identy_wezlow[pozycja] for pozycja, _ in ograniczenia_napiecia(model, urzadzenia)
        }
        for ident in model.identy_wezlow:
            if ident in model.wezly_beznapieciowe:
                kod = STAN_ZASILANIA_BEZNAPIECIOWY
            elif ident in narzucone:
                kod = STAN_ZASILANIA_NARZUCONE
            else:
                kod = STAN_ZASILANIA_ZASILANY
            probki[f"stan_zasilania@{ident}"].append(kod)
        for galaz in model.galezie:
            wielkosci = wielkosci_galezi(model, galaz, napiecia)
            probki[f"stan_galezi@{galaz.ident}"].append(
                1.0 if galaz.ident in model.galezie_aktywne else 0.0
            )
            probki[f"i_od_kat_deg@{galaz.ident}"].append(_kat_deg(wielkosci.i_od_pu))
            probki[f"i_do_kat_deg@{galaz.ident}"].append(_kat_deg(wielkosci.i_do_pu))

    def _probkuj_zwarcia(
        self,
        probki: dict[str, list[float | None]],
        model: ModelSieci,
        odbiory: tuple[OdbiorCharakterystyczny, ...],
        urzadzenia: tuple[Urzadzenie, ...],
        stany: tuple[np.ndarray, ...],
        napiecia: np.ndarray,
        miejsca_zwarc: tuple[_MiejsceZwarcia, ...],
    ) -> None:
        """Prad DO ZIEMI i napiecie w KAZDYM miejscu zwarcia z harmonogramu (karta par. 0 pkt 5).

        Zwarcie w wezle z admitancja: `I = y_f V`; metaliczne: prad elementu narzucajacego
        `V = 0` z bilansu wezla, ze znakiem przeciwnym (`siec.prad_wezla_ograniczonego` —
        ta sama funkcja, ktora daje moc zrodla napieciowego). Zwarcie w galezi: wezel
        wewnetrzny rozwiazany jawnie (`siec.miejsca_zwarcia_galezi`). Miejsce BEZ trwajacego
        zwarcia ma prad zerowy (fakt fizyczny); napiecie wezla jest napieciem wezla, a
        napiecie punktu `x*L` galezi zdrowej — rozwiazaniem tych samych odcinkow pi z
        admitancja zwarcia zero; galaz wylaczona jest beznapieciowa.
        """
        admitancje = dict(model.admitancje_zwarc)
        for miejsce in miejsca_zwarc:
            if miejsce.polozenie is None:
                pozycja = model.indeks_wezla[miejsce.element]
                napiecie = complex(napiecia[pozycja])
                if miejsce.element in admitancje:
                    prad = admitancje[miejsce.element] * napiecie
                elif miejsce.element in model.zwarcia_metaliczne:
                    prad = -prad_wezla_ograniczonego(
                        model, odbiory, urzadzenia, stany, napiecia, miejsce.element
                    )
                else:
                    prad = 0j
            else:
                napiecie, prad = self._miejsce_w_galezi(model, napiecia, miejsce)
            probki[f"i_zwarcia_pu@{miejsce.klucz}"].append(abs(prad))
            probki[f"u_zwarcia_pu@{miejsce.klucz}"].append(abs(napiecie))
            probki[f"i_zwarcia_kat_deg@{miejsce.klucz}"].append(_kat_deg(prad))

    def _miejsce_w_galezi(
        self, model: ModelSieci, napiecia: np.ndarray, miejsce: _MiejsceZwarcia
    ) -> tuple[complex, complex]:
        """(napiecie, prad do ziemi) w punkcie `x*L` galezi w biezacym stanie modelu."""
        if miejsce.element not in model.galezie_aktywne:
            return 0j, 0j
        galaz = next(g for g in model.galezie if g.ident == miejsce.element)
        assert miejsce.polozenie is not None
        zwarcia = zwarcia_galezi_modelu(model, galaz.ident)
        if not any(polozenie == miejsce.polozenie for polozenie, _ in zwarcia):
            zwarcia = ((miejsce.polozenie, 0j),)
        wyniki = miejsca_zwarcia_galezi(
            galaz.y_szeregowa_pu,
            galaz.b_poprzeczna_pu,
            zwarcia,
            complex(napiecia[model.indeks_wezla[galaz.wezel_od]]),
            complex(napiecia[model.indeks_wezla[galaz.wezel_do]]),
        )
        for (polozenie, _), wynik in zip(zwarcia, wyniki, strict=True):
            if polozenie == miejsce.polozenie:
                return wynik
        raise AssertionError("miejsce zwarcia nie znalezione")  # pragma: no cover

    def _probkuj_obserwable(
        self,
        probki: dict[str, list[float | None]],
        strona: str,
        model: ModelSieci,
        odbiory: tuple[OdbiorCharakterystyczny, ...],
        urzadzenia: tuple[Urzadzenie, ...],
        stany: tuple[np.ndarray, ...],
        napiecia: np.ndarray,
    ) -> None:
        """Przestrzen `z` (W6-A) — czestotliwosc wezlow i wielkosci zaciskow galezi.

        Pochodna napiec i obie jej niepewnosci licza sie RAZ na probke, z rozniczkowania
        rownania algebraicznego; kazdy wezel czyta z nich swoja skladowa. Zaden kanal tej
        przestrzeni nie jest rozniczkowany numerycznie po osi wyjscia.

        ZBIEZNOSC NIE JEST WIARYGODNOSCIA. Jesli jakobian algebry jest osobliwy w punkcie
        probki albo w punkcie skorygowanym o blad pierwszorzedowy, to pochodna rozwiazania
        ALBO nie istnieje, ALBO nie da sie ograniczyc jej bledu — i wtedy kazdy wezel
        dostaje stan NIEDOSTEPNA. Bieg trwa dalej, bo algebra zbiegla; ale zbiezny Newton
        nie jest dowodem, ze wyprowadzona z niego czestotliwosc cokolwiek znaczy.

        CHWILA ZDARZENIA (probki `L` i `P`) — czestotliwosc NIE jest liczona: kat skacze,
        pochodna dwustronna nie istnieje (kod 3 dla kazdego wezla). WEZEL BEZ NAPIECIA
        (obszar beznapieciowy, zwarcie metaliczne) w probce `C` — kod 4; wezly zywe liczone
        normalnie (dostepnosc per wezel, `obserwable.pochodna_napiec_z_niepewnoscia`).
        """
        f_bazowa_hz = self.wejscie.f_bazowa_hz
        czestotliwosci: list[CzestotliwoscWezla]
        if strona != "C":
            czestotliwosci = [
                czestotliwosc_niedostepna(JAKOSC_CHWILA_ZDARZENIA) for _ in model.identy_wezlow
            ]
        else:
            czestotliwosci = czestotliwosci_wezlow(
                model, odbiory, urzadzenia, stany, napiecia, f_bazowa_hz=f_bazowa_hz
            )
        for ident, czestotliwosc in zip(model.identy_wezlow, czestotliwosci, strict=True):
            probki[f"f_hz@{ident}"].append(czestotliwosc.f_hz)
            probki[f"u_f_est_hz@{ident}"].append(czestotliwosc.niepewnosc_hz)
            probki[f"jakosc_f@{ident}"].append(czestotliwosc.jakosc)
        for galaz in model.galezie:
            wielkosci = wielkosci_galezi(model, galaz, napiecia)
            probki[f"i_od_pu@{galaz.ident}"].append(abs(wielkosci.i_od_pu))
            probki[f"i_do_pu@{galaz.ident}"].append(abs(wielkosci.i_do_pu))
            probki[f"p_od_pu@{galaz.ident}"].append(float(wielkosci.s_od_pu.real))
            probki[f"q_od_pu@{galaz.ident}"].append(float(wielkosci.s_od_pu.imag))
            probki[f"p_do_pu@{galaz.ident}"].append(float(wielkosci.s_do_pu.real))
            probki[f"q_do_pu@{galaz.ident}"].append(float(wielkosci.s_do_pu.imag))

    def _metryki(
        self,
        kanaly: tuple[KanalWyniku, ...],
        probki: dict[str, list[float | None]],
        os_czasu: list[float],
    ) -> tuple[Metryka, ...]:
        metryki: list[Metryka] = []
        napieciowe = [kanal for kanal in kanaly if kanal.klucz.startswith("u_pu@")]
        if napieciowe and os_czasu:
            wartosc, element, klucz = min(
                (_min_liczb(probki[kanal.klucz]), kanal.element_ref or "", kanal.klucz)
                for kanal in napieciowe
            )
            metryki.append(Metryka("u_min_pu", wartosc, "pu", "min_t min_k |V_k(t)|", element))
            metryki.append(
                Metryka(
                    "t_u_min_s",
                    os_czasu[probki[klucz].index(wartosc)],
                    "s",
                    "argmin_t min_k |V_k(t)|",
                    element,
                )
            )
        for klucz, szereg in sorted(probki.items()):
            if not szereg:
                continue
            if klucz.startswith("omega_pu@"):
                ident = klucz.split("@", 1)[1]
                metryki.append(
                    Metryka(
                        f"omega_max_pu@{ident}", _max_liczb(szereg), "pu", "max_t omega(t)", ident
                    )
                )
                metryki.append(
                    Metryka(
                        f"omega_min_pu@{ident}", _min_liczb(szereg), "pu", "min_t omega(t)", ident
                    )
                )
            elif klucz.startswith("delta_rad@"):
                ident = klucz.split("@", 1)[1]
                metryki.append(
                    Metryka(
                        f"delta_max_rad@{ident}", _max_liczb(szereg), "rad", "max_t delta(t)", ident
                    )
                )
        return tuple(metryki)

    def _slad(
        self,
        slad_inicjalizacji: dict[str, Any],
        model: ModelSieci,
        nastawy: NastawySolvera,
        kroki_szczegolne: list[dict[str, Any]],
        kroki: int,
        kroki_odrzucone: int,
        iteracje_max: int,
        idealizacje: tuple[ZalozenieRdzenia, ...],
        odbiory: list[dict[str, object]],
    ) -> dict[str, Any]:
        """Slad WHITE BOX biegu — BEZ szeregow czasowych.

        Sekcja `odbiory` (karta modeli odbiorow): dla kazdego odbioru wejscia charakterystyka
        (wielomian P i Q, v0, czulosc czestotliwosciowa, U_min), moc pobierana w punkcie
        pracy i kod trybu w t = 0 — dopisana ZA dotychczasowymi sekcjami.

        `kroki_szczegolne` niesie KAZDY krok odrzucony i KAZDA chwile ze
        zdarzeniem w pelnym opisie; kroki rutynowe wchodza jako podsumowanie
        licznikowe. Zapis wszystkich krokow rutynowych (dziesiatki tysiecy przy
        horyzoncie sekundowym) wroclby do wiersza biegu tym samym kanalem, z
        ktorego szeregi czasowe zostaly z niego celowo wyjete.
        """
        macierz = model.ybus.tocoo()
        return {
            "inicjalizacja": slad_inicjalizacji,
            "siec": {
                "liczba_wezlow": model.liczba_wezlow,
                "liczba_galezi_aktywnych": len(model.galezie_aktywne),
                "niezerowe_ybus": int(model.ybus.nnz),
                "odcisk_ybus": skrot_kanoniczny(
                    sorted(
                        [
                            int(wiersz),
                            int(kolumna),
                            kwantyzuj(wartosc.real),
                            kwantyzuj(wartosc.imag),
                        ]
                        for wiersz, kolumna, wartosc in zip(
                            macierz.row, macierz.col, macierz.data, strict=True
                        )
                    )
                ),
            },
            "nastawy": {
                "integrator": nastawy.integrator,
                "dt_s": kwantyzuj(nastawy.dt_s),
                "dt_min_s": kwantyzuj(nastawy.dt_min_s),
                "dt_max_s": kwantyzuj(nastawy.dt_max_s),
                "tolerancja": kwantyzuj(nastawy.tolerancja),
                "tolerancja_kroku": kwantyzuj(nastawy.tolerancja_kroku),
                "max_iteracji_newtona": nastawy.max_iteracji_newtona,
                "max_nawrotow": nastawy.max_nawrotow,
                "horyzont_s": kwantyzuj(nastawy.horyzont_s),
                "krok_wyjscia_s": kwantyzuj(nastawy.krok_wyjscia_s),
                "tolerancja_lokalizacji_zdarzen_s": (
                    None
                    if nastawy.tolerancja_lokalizacji_zdarzen_s is None
                    else kwantyzuj(nastawy.tolerancja_lokalizacji_zdarzen_s)
                ),
            },
            "kroki_szczegolne": kroki_szczegolne,
            # Zalozenia BIEGU (idealizacje harmonogramu, tryb stanowiska, mechanizmy uzyte w
            # biegu) — te same rekordy, co w `zalozenia` wyniku; slad nie moze ich przemilczec.
            "idealizacje_harmonogramu": [rekord_zalozenia(zalozenie) for zalozenie in idealizacje],
            "podsumowanie_krokow": {
                "kroki": kroki,
                "kroki_odrzucone": kroki_odrzucone,
                "max_iteracji_newtona_w_kroku": iteracje_max,
            },
            "odbiory": odbiory,
        }


#: Zalozenia modelu — wchodza do wyniku, zeby czytelnik przebiegu wiedzial, co model
#: OBEJMUJE, a czego nie, bez siegania do dokumentacji. Rdzen oddaje je jako REKORDY
#: (`wynik.ZalozenieRdzenia`: kod, elementy, wielkosci, pozycje), a zdania z nazwami
#: elementow modelu sklada warstwa aplikacji (`application.dynamika.zalozenia`).
#:
#: WIERSZ O URZADZENIACH JEST WYPROWADZONY Z REJESTRU, NIE PRZEPISANY. POMIAR, NIE
#: OSTROZNOSC (2026-09-18): zdanie brzmialo „maszyna klasyczna 2. rzedu i szyna sztywna"
#: jeszcze po karcie W6-3A, ktora dolozyla piec rodzin. Pozycje rekordu `rodziny_urzadzen`
#: to `RODZINY_OBSLUGIWANE` fabryki, a zgodnosc w OBIE STRONY pilnuje
#: `test_zalozenia_wymieniaja_dokladnie_rodziny_fabryki`.
def zalozenia_modelu(odbiory: tuple[OdbiorDynamiki, ...]) -> tuple[ZalozenieRdzenia, ...]:
    """Zalozenia STALE modelu (kazdy wynik) plus estymator czestotliwosci odbiorow czulych."""
    stale = (
        ZalozenieRdzenia("model_rms_skladowej_zgodnej", (), (), ()),
        ZalozenieRdzenia("model_odbiorow", (), (), ()),
        ZalozenieRdzenia("zwarcia_trojfazowe", (), (), ()),
        ZalozenieRdzenia("rodziny_urzadzen", (), (), tuple(RODZINY_OBSLUGIWANE)),
        ZalozenieRdzenia("probki_obustronne", (), (), ()),
    )
    czule = tuple(
        odbior.ident for odbior in odbiory if jest_czuly_czestotliwosciowo(odbior.charakterystyka)
    )
    if not czule:
        return stale
    return stale + (ZalozenieRdzenia("estymator_czestotliwosci_odbiorow", czule, (), ()),)


def _zalozenia_warunkowe(
    *,
    obszar_beznapieciowy: bool,
    start_ponownego_zasilenia: bool,
    reinicjalizacja_estymatora: bool,
    przypisanie_stanu: bool,
    utrata_czesciowa: bool,
) -> tuple[ZalozenieRdzenia, ...]:
    """Zalozenia mechanizmow UZYTYCH w biegu — rekord jest obecny wtedy i tylko wtedy, gdy
    mechanizm zadzialal (wynik bez mechanizmu rozni sie wylacznie brakiem rekordu)."""
    return tuple(
        ZalozenieRdzenia(kod, (), (), ())
        for kod, uzyty in (
            ("obszar_beznapieciowy", obszar_beznapieciowy),
            ("start_ponownego_zasilenia", start_ponownego_zasilenia),
            ("reinicjalizacja_estymatora_odbioru", reinicjalizacja_estymatora),
            ("przypisanie_stanu", przypisanie_stanu),
            ("utrata_czesciowa_zrodla", utrata_czesciowa),
        )
        if uzyty
    )


#: Kody `stan_zasilania@` (karta AB-1b.1 par. 0 pkt 8) — zbior ZAMKNIETY, przypiety testem.
STAN_ZASILANIA_BEZNAPIECIOWY = 0.0
STAN_ZASILANIA_ZASILANY = 1.0
STAN_ZASILANIA_NARZUCONE = 2.0


@dataclass(frozen=True)
class _Probkowanie:
    """Bufory probek biegu przekazywane do jednej funkcji probkujacej (bez stanu obiektu)."""

    probki: dict[str, list[float | None]]
    os_czasu: list[float]
    strony: list[str]
    miejsca_zwarc: tuple[_MiejsceZwarcia, ...]


def _kat_deg(fazor: complex) -> float | None:
    """Kat fazora w stopniach; `None` przy fazorze DOKLADNIE zerowym.

    `np.angle(0) = 0,0` byloby fabrykowanym katem (karta AB-1b.1 par. 0 pkt 7-8): fazor
    zerowy nie ma kierunku, a zero stopni jest poprawna, niezerowa informacja o fazie.
    """
    if fazor == 0:
        return None
    return float(np.degrees(np.angle(fazor)))


def _min_liczb(szereg: list[float | None]) -> float:
    return min(wartosc for wartosc in szereg if wartosc is not None)


def _max_liczb(szereg: list[float | None]) -> float:
    return max(wartosc for wartosc in szereg if wartosc is not None)


#: Tryby scenariusza (karta AB-1b.1 par. 0 pkt 11) — wyprowadzane z urzadzen biegu,
#: nie deklarowane: `stanowisko`, gdy siec zasila zrodlo testowe, inaczej `siec`.
TRYB_SIEC = "siec"
TRYB_STANOWISKO = "stanowisko"


def tryb_scenariusza(urzadzenia: tuple[Urzadzenie, ...]) -> str:
    """Tryb biegu wyprowadzony z urzadzen: `stanowisko`, gdy siec zasila zrodlo testowe
    (ten sam predykat, ktorym harmonogram odmawia zaklocen sieci w biegu stanowiska)."""
    return TRYB_STANOWISKO if jest_trybem_stanowiska(urzadzenia) else TRYB_SIEC


def zalozenia_trybu(urzadzenia: tuple[Urzadzenie, ...]) -> tuple[ZalozenieRdzenia, ...]:
    """Zalozenie trybu STANOWISKA dla kazdego zrodla testowego (kolejnosc urzadzen wejscia).

    Elementy: zrodlo testowe i wezel przylaczenia; pozycja: `idealne` (impedancja zerowa,
    napiecie punktu przylaczenia narzucone rowne SEM) albo `za_impedancja` (sprzezenie
    pradowe przez impedancje zastepcza sieci).
    """
    return tuple(
        ZalozenieRdzenia(
            "tryb_stanowiska",
            (urzadzenie.ident, urzadzenie.wezel),
            (),
            ("idealne" if urzadzenie.impedancja_pu is None else "za_impedancja",),
        )
        for urzadzenie in urzadzenia
        if isinstance(urzadzenie, ZrodloTestowe)
    )


def _skok_stanow_nieprzypisanych(
    przed: tuple[np.ndarray, ...],
    po: tuple[np.ndarray, ...],
    przypisane: frozenset[tuple[int, int]],
) -> float:
    """Najwiekszy modul zmiany stanu NIEPRZYPISANEGO w chwili zdarzen (karta par. 0 pkt 9).

    Porownanie ze stanami sprzed CALEJ chwili (przed zdarzeniami topologicznymi,
    utratami, przypisaniami i re-inicjalizacja), wiec pomiar obejmuje kazda droge, ktora
    mogla zmienic stan: przypisanie w zlym miejscu, ponowne wyznaczenie stanu urzadzenia z
    punktu pracy, mutacje w algebrze. Pozycje przypisane sa wylaczone — ich zmiane niesie
    `przypisania` (adres, przed, po).
    """
    skok = 0.0
    for indeks, (stan_przed, stan_po) in enumerate(zip(przed, po, strict=True)):
        for pozycja in range(stan_przed.shape[0]):
            if (indeks, pozycja) in przypisane:
                continue
            skok = max(skok, abs(float(stan_po[pozycja]) - float(stan_przed[pozycja])))
    return skok


def _uklad_chwili(chwila: _Chwila, strona: StronaOceny) -> StanUkladu:
    """Punkt oceny dozorow w stanie chwili (probka `C` albo `P`)."""
    return StanUkladu(
        chwila.model, chwila.odbiory, chwila.urzadzenia, chwila.stany, chwila.napiecia, strona
    )


def _zapisy_nadzoru(nadzor: NadzorDozorow, t_s: float) -> list[dict[str, Any]]:
    """Nowe zapisy nadzoru (pobudzenia, kasowania) jako wpisy sladu — liczby skwantyzowane
    jak kazdy inny wpis `kroki_szczegolne`; zapisy nadzoru sa po pobraniu czyszczone."""
    zapisy = []
    for zapis in nadzor.zapisy:
        wpis: dict[str, Any] = {"t_s": kwantyzuj(t_s)}
        for klucz, wartosc in zapis.items():
            if isinstance(wartosc, bool) or wartosc is None or isinstance(wartosc, str | int):
                wpis[klucz] = wartosc
            elif isinstance(wartosc, float):
                wpis[klucz] = kwantyzuj(wartosc)
            else:
                wpis[klucz] = [kwantyzuj(pozycja) for pozycja in wartosc]
        zapisy.append(wpis)
    nadzor.zapisy.clear()
    return zapisy


def _przekroczenia(nadzor: NadzorDozorow) -> tuple[Przekroczenie, ...]:
    """Przekroczenia DETEKTOROW w kolejnosci wystapienia — pelna precyzja rdzenia."""
    wynik = []
    for przekroczenie in nadzor.przekroczenia:
        dozor = nadzor.dozory[przekroczenie.dozor]
        wynik.append(
            Przekroczenie(
                dozor=dozor.ident,
                wielkosc=dozor.wielkosc.klucz_kanalu,
                prog=dozor.prog,
                kierunek=dozor.kierunek,
                t_s=przekroczenie.lokalizacja.t_s,
                szerokosc_przedzialu_s=przekroczenie.lokalizacja.szerokosc_s,
                iteracje=przekroczenie.lokalizacja.iteracje,
            )
        )
    return tuple(wynik)


@dataclass(frozen=True)
class _MiejsceZwarcia:
    """Miejsce zwarcia z harmonogramu: wezel (`polozenie is None`) albo punkt `x*L` galezi."""

    element: str
    polozenie: float | None

    @property
    def klucz(self) -> str:
        return self.element if self.polozenie is None else f"{self.element}:x={self.polozenie!r}"

    @property
    def opis_pl(self) -> str:
        if self.polozenie is None:
            return "na szynie"
        return f"w gałęzi (x = {self.polozenie!r} długości od zacisku początkowego)"


def _miejsca_zwarc(wpisy: tuple[WpisHarmonogramu, ...]) -> tuple[_MiejsceZwarcia, ...]:
    """Miejsca WSZYSTKICH zwarc harmonogramu w kolejnosci pierwszego wystapienia — kanaly
    wyniku sa znane w t = 0, wiec zestaw kanalow nie zalezy od przebiegu."""
    miejsca: list[_MiejsceZwarcia] = []
    for wpis in wpisy:
        if wpis.rodzaj == "zwarcie":
            miejsce = _MiejsceZwarcia(wpis.ref, None)
        elif wpis.rodzaj == "zwarcie_galezi":
            miejsce = _MiejsceZwarcia(wpis.ref, wpis.polozenie_wzgledne)
        else:
            continue
        if miejsce not in miejsca:
            miejsca.append(miejsce)
    return tuple(miejsca)


def _odbiory_odciete(
    odbiory: tuple[OdbiorCharakterystyczny, ...], stan: StanScenariusza
) -> frozenset[str]:
    """Odbiory ODCIETE: przylaczone w scenariuszu, a lezace w obszarze beznapieciowym.

    Odbior odlaczony zdarzeniem nie ma obwodu juz wczesniej, wiec nie „traci" go przy
    odcieciu obszaru (jego tryb w probkach jest 3 — wezel beznapieciowy — ale nie wchodzi
    do wykazu odbiorow odcietych zdarzenia).
    """
    return frozenset(
        odbior.ident
        for odbior in odbiory
        if odbior.tryb_poza_obwodem == TRYB_ODCIETY and odbior.ident in stan.odbiory_aktywne
    )


def _reinicjalizuj_estymatory(
    model: ModelSieci,
    odbiory_algebry: tuple[OdbiorCharakterystyczny, ...],
    stany_odbiorow: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
) -> tuple[tuple[np.ndarray, ...], tuple[PrzypisanieWykonane, ...], frozenset[tuple[int, int]]]:
    """Regula PONOWNEGO ZASILENIA estymatora czestotliwosci odbioru: `x := arg V+`.

    Odbior odciety nie mierzyl; faza napiecia po przerwie beznapieciowej jest dowolna,
    wiec bez tej reguly `e+ = wrap(theta+ - x_sprzed_odciecia)` dalby skok czestotliwosci
    widzianej do `pi/(w_n T_f)` z samego faktu przerwy. Algebra tej chwili liczyla odbior z
    estymatorem wyzerowanym (`f = f_n`); po przypisaniu `e = 0`, wiec prad odbioru jest
    ten sam. Zwraca (stany odbiorow po chwili, przypisania do zapisu w zdarzeniu, pozycje
    przypisane — wylaczone z pomiaru skoku stanow nieprzypisanych).
    """
    nowe: list[np.ndarray] = []
    przypisania: list[PrzypisanieWykonane] = []
    pozycje: set[tuple[int, int]] = set()
    for indeks, (odbior, stan) in enumerate(zip(odbiory_algebry, stany_odbiorow, strict=True)):
        if not (odbior.estymator_wyzerowany and odbior.nazwy_stanow):
            nowe.append(stan)
            continue
        napiecie = complex(napiecia[model.indeks_wezla[odbior.wezel]])
        nowy = odbior.stan_poczatkowy_odbioru(napiecie)
        przypisania.append(
            PrzypisanieWykonane(
                adres=f"{odbior.ident}.{STAN_KATA_POMIARU}",
                przed=float(stan[0]),
                po=float(nowy[0]),
            )
        )
        pozycje.add((indeks, 0))
        nowe.append(nowy)
    return tuple(nowe), tuple(przypisania), frozenset(pozycje)


def _bledy_fazy(
    model: ModelSieci,
    odbiory: tuple[OdbiorCharakterystyczny, ...],
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
) -> tuple[float | None, ...]:
    """Blad fazy estymatora (`e`) kazdego odbioru czulego; `None` dla odbioru bez stanu."""
    stany_odbiorow = stany[: len(odbiory)]
    return tuple(
        (
            odbior.blad_fazy_rad(stan, complex(napiecia[model.indeks_wezla[odbior.wezel]]))
            if odbior.nazwy_stanow
            else None
        )
        for odbior, stan in zip(odbiory, stany_odbiorow, strict=True)
    )


def _sprawdz_odbiory(
    model: ModelSieci,
    odbiory: tuple[OdbiorCharakterystyczny, ...],
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
    t_s: float,
    *,
    bledy_fazy_przed: tuple[float | None, ...] | None,
) -> None:
    """Zakres waznosci modeli odbiorow (`odbiory.sprawdz_zakres_waznosci`) w punkcie `(x, V)`."""
    sprawdz_zakres_waznosci(
        odbiory,
        stany[: len(odbiory)],
        tuple(complex(napiecia[model.indeks_wezla[odbior.wezel]]) for odbior in odbiory),
        t_s,
        bledy_fazy_przed=bledy_fazy_przed,
    )


def _opis_odbiorow(odbiory: tuple[OdbiorDynamiki, ...]) -> list[list[Any]]:
    """Opis odbiorow do sladu White Box: [ident, wezel, P0, Q0] (pu, skwantyzowane).

    P0, Q0 to MOC BAZOWA odbioru (skala charakterystyki); charakterystyke i moc pobierana
    w punkcie pracy niesie sekcja `odbiory` sladu.
    """
    return [
        [odbior.ident, odbior.wezel, kwantyzuj(odbior.p_pu), kwantyzuj(odbior.q_pu)]
        for odbior in odbiory
    ]


def _kanaly_odbiorow(odbiory: tuple[OdbiorDynamiki, ...]) -> tuple[KanalWyniku, ...]:
    """Kanaly odbiorow (karta modeli odbiorow): moc POBIERANA i tryb modelu, dla kazdego
    odbioru WEJSCIA (zestaw kanalow znany w t = 0, niezalezny od przebiegu), a dla odbioru
    czulego czestotliwosciowo takze czestotliwosc widziana przez odbior i stan estymatora.

    Dopisane ZA wszystkimi dotychczasowymi kanalami — dawna lista jest bitowo prefiksem nowej.
    Przedrostek `p_pobor_`/`q_pobor_` (nie `p_pu@`), bo identyfikatory odbiorow i urzadzen
    nie sa rozlaczne z konstrukcji, a znak jest konwencja POBORU (urzadzenia: moc oddawana).
    `f_odbioru_hz@` to czestotliwosc WIDZIANA PRZEZ ODBIOR (inercja `T_f`), nigdy zamiennik
    `f_hz@` szyny; `None` wtedy i tylko wtedy, gdy odbior nie ma obwodu (tryb 2 albo 3).
    """
    kanaly: list[KanalWyniku] = []
    for odbior in odbiory:
        kanaly.append(
            KanalWyniku(
                klucz=f"p_pobor_pu@{odbior.ident}",
                przestrzen="obserwabla",
                jednostka="pu",
                element_ref=odbior.ident,
                opis_pl="Moc czynna pobierana przez odbiór (zero dla odbioru bez obwodu)",
            )
        )
        kanaly.append(
            KanalWyniku(
                klucz=f"q_pobor_pu@{odbior.ident}",
                przestrzen="obserwabla",
                jednostka="pu",
                element_ref=odbior.ident,
                opis_pl="Moc bierna pobierana przez odbiór (zero dla odbioru bez obwodu)",
            )
        )
        kanaly.append(
            KanalWyniku(
                klucz=f"tryb_odbioru@{odbior.ident}",
                przestrzen="obserwabla",
                jednostka="kod",
                element_ref=odbior.ident,
                opis_pl=(
                    "Tryb modelu odbioru: 0 charakterystyka, 1 stała impedancja (napięcie "
                    "poniżej napięcia przejścia), 2 odłączony zdarzeniem, 3 odcięty (obszar "
                    "beznapięciowy)"
                ),
            )
        )
        if jest_czuly_czestotliwosciowo(odbior.charakterystyka):
            kanaly.append(
                KanalWyniku(
                    klucz=f"f_odbioru_hz@{odbior.ident}",
                    przestrzen="obserwabla",
                    jednostka="Hz",
                    element_ref=odbior.ident,
                    opis_pl=(
                        "Częstotliwość widziana przez odbiór (estymator o stałej czasowej "
                        "pomiaru); brak wartości dla odbioru bez obwodu"
                    ),
                )
            )
            kanaly.append(
                KanalWyniku(
                    klucz=f"{STAN_KATA_POMIARU}@{odbior.ident}",
                    przestrzen="odbior",
                    jednostka=jednostka_stanu(STAN_KATA_POMIARU),
                    element_ref=odbior.ident,
                    opis_pl="Stan estymatora częstotliwości odbioru (kąt śledzący fazę napięcia)",
                )
            )
    return tuple(kanaly)


def _probkuj_odbiory(
    probki: dict[str, list[float | None]],
    model: ModelSieci,
    odbiory: tuple[OdbiorCharakterystyczny, ...],
    stany_odbiorow: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
) -> None:
    """Probka kanalow odbiorow z modeli chwili (kazdy odbior wejscia, tryb z modelu).

    Kod 3 (odciety) <=> wezel odbioru jest beznapieciowy — TEN SAM predykat, co
    `stan_zasilania@ = 0` (`_modele_odbiorow`); kod 2 — odbior odlaczony zdarzeniem na zywej
    szynie. Moc odbioru bez obwodu jest zerem DOKLADNIE (fakt, nie wartosc niedostepna), a
    czestotliwosc widziana — brakiem (`None`), bo odbior bez obwodu niczego nie pobiera.
    Stan estymatora jest publikowany zawsze (istnieje takze bez obwodu).
    """
    for odbior, stan in zip(odbiory, stany_odbiorow, strict=True):
        napiecie = complex(napiecia[model.indeks_wezla[odbior.wezel]])
        moc = odbior.moc_poboru_pu(stan, napiecie)
        probki[f"p_pobor_pu@{odbior.ident}"].append(float(moc.real))
        probki[f"q_pobor_pu@{odbior.ident}"].append(float(moc.imag))
        probki[f"tryb_odbioru@{odbior.ident}"].append(odbior.tryb(napiecie))
        if odbior.nazwy_stanow:
            probki[f"f_odbioru_hz@{odbior.ident}"].append(
                odbior.czestotliwosc_widziana_hz(stan, napiecie)
            )
            probki[f"{STAN_KATA_POMIARU}@{odbior.ident}"].append(float(stan[0]))


def zalozenia_harmonogramu(harmonogram: HarmonogramDynamiki) -> tuple[ZalozenieRdzenia, ...]:
    """Idealizacje ZADEKLAROWANE w harmonogramie biegu — dopisywane do zalozen wyniku.

    Usuniecie zwarcia `samoczynne` (karta AB-1b.1 par. 0 pkt 4) nie jest wykonywane
    przez zaden aparat: zwarcie znika pod napieciem. To jest jawna IDEALIZACJA
    zwarcia przemijajacego i czytelnik przebiegu musi ja widziec obok wyniku, a nie
    wylacznie w danych wejsciowych. Kolejnosc = kolejnosc zapisu harmonogramu. Rekord:
    element (wezel albo galaz), pozycja `wezel`/`galaz`, wielkosci: chwila zalozenia i
    usuniecia [s] oraz — dla galezi — polozenie wzgledne miejsca zwarcia.
    """
    zalozenia: list[ZalozenieRdzenia] = []
    for zdarzenie in harmonogram.zdarzenia:
        if (
            isinstance(zdarzenie, ZwarcieWezla | ZwarcieGalezi)
            and zdarzenie.sposob_usuniecia == "samoczynne"
        ):
            assert zdarzenie.t_usuniecia_s is not None  # kontrakt: sposob <=> chwila
            wielkosci = [
                WielkoscZalozenia("t_s", zdarzenie.t_s, "s"),
                WielkoscZalozenia("t_usuniecia_s", zdarzenie.t_usuniecia_s, "s"),
            ]
            if isinstance(zdarzenie, ZwarcieGalezi):
                wielkosci.append(
                    WielkoscZalozenia("polozenie_wzgledne", zdarzenie.polozenie_wzgledne, "1")
                )
            zalozenia.append(
                ZalozenieRdzenia(
                    "zwarcie_usuniete_samoczynnie",
                    (zdarzenie.wezel if isinstance(zdarzenie, ZwarcieWezla) else zdarzenie.galaz,),
                    tuple(wielkosci),
                    ("wezel" if isinstance(zdarzenie, ZwarcieWezla) else "galaz",),
                )
            )
    return tuple(zalozenia)


def jednostka_stanu(nazwa: str) -> str:
    """Jednostka stanu wyprowadzona z jego NAZWY (sufiks jest czescia kontraktu nazw).

    Brak sufiksu jednostki to blad kontraktu urzadzenia, nie powod do zgadywania:
    kanal bez jednostki byloby liczba bez znaczenia fizycznego w wyniku.

    KOLEJNOSC REGUL JEST TRESCIA: `_pu_na_s` (tempo zmiany wielkosci w pu) konczy sie
    tez na `_s`, wiec regula sekund sprawdzana wczesniej nadawalaby stanowi tempa
    jednostke „s" (karta AB-1b.1 par. 0 pkt 15).
    """
    if nazwa.endswith("_rad"):
        return "rad"
    if nazwa.endswith("_pu"):
        return "pu"
    if nazwa.endswith("_pu_na_s"):
        return "pu/s"
    if nazwa.endswith("_s"):
        return "s"
    raise AssertionError(
        f"Stan {nazwa!r} nie niesie jednostki w nazwie — kontrakt nazw stanow wymaga "
        "sufiksu jednostki (_rad, _pu, _pu_na_s, _s)."
    )


__all__ = [
    "MARGINES_DOBORU_KROKU",
    "MAX_SPADEK_KROKU",
    "MAX_WZROST_KROKU",
    "STAN_ZASILANIA_BEZNAPIECIOWY",
    "STAN_ZASILANIA_NARZUCONE",
    "STAN_ZASILANIA_ZASILANY",
    "TOLERANCJA_CZASU_S",
    "TRYB_SIEC",
    "TRYB_STANOWISKO",
    "SilnikDynamiki",
    "jednostka_stanu",
    "tryb_scenariusza",
    "zalozenia_harmonogramu",
    "zalozenia_modelu",
    "zalozenia_trybu",
]
