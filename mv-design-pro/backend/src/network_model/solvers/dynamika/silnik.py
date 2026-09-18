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
6. **Probka po zdarzeniu.** Probka w chwili `t` jest stanem PO wykonaniu
   wszystkich zdarzen tej chwili. Jedna regula dla calej osi czasu, takze dla
   `t = 0` (zwarcie zadane na `t = 0` jest w probce zerowej juz obecne).

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
    blad_lokalny,
    pochodne_ukladu,
)
from .kontrakty import (
    KOD_INICJALIZACJA_NIEZBIEZNA,
    KOD_KROK_NIEZBIEZNY,
    NastawySolvera,
    OdbiorDynamiki,
    OdmowaDynamiki,
    Urzadzenie,
    WejscieDynamiki,
    odmowa_braku_pola,
)
from .reinicjalizacja import reinicjalizuj
from .siec import ModelSieci, residuum_algebry, zloz_model_sieci
from .skonczonosc import sprawdz_napiecia
from .tozsamosc import kwantyzuj, skrot_kanoniczny, zbuduj_tozsamosc
from .urzadzenia.odlaczone import UrzadzenieOdlaczone
from .wynik import KanalWyniku, Metryka, WlasnosciBiegu, WynikDynamiki, ZdarzenieWykonane
from .zdarzenia import (
    StanScenariusza,
    WpisHarmonogramu,
    odbiory_po_zdarzeniach,
    stan_poczatkowy_scenariusza,
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
    odbiory: tuple[OdbiorDynamiki, ...]
    urzadzenia: tuple[Urzadzenie, ...]
    napiecia: np.ndarray
    kontekst: KontekstKroku
    bylo_zdarzenie: bool
    residuum_kcl_max: float


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
            odbiory=wejscie.odbiory,
            urzadzenia=wejscie.urzadzenia,
            s_bazowa_mva=wejscie.s_bazowa_mva,
            horyzont_s=nastawy.horyzont_s,
        )

        model = zloz_model_sieci(wejscie.wezly, wejscie.galezie, wejscie.odsprzegi)
        urzadzenia = tuple(wejscie.urzadzenia)
        stany = self._stany_poczatkowe(urzadzenia)
        napiecia = self._napiecia_poczatkowe(model)
        odbiory = wejscie.odbiory
        kontekst = KontekstKroku(model, odbiory, urzadzenia, nastawy)
        slad_inicjalizacji = self._bramka_rownowagi(kontekst, stany, napiecia)

        kanaly = self._kanaly(model, urzadzenia)
        probki: dict[str, list[float]] = {kanal.klucz: [] for kanal in kanaly}
        os_czasu: list[float] = []
        wykonane: list[ZdarzenieWykonane] = []
        kroki_szczegolne: list[dict[str, Any]] = []

        kroki = 0
        kroki_odrzucone = 0
        iteracje_max = 0
        max_residuum_f = 0.0
        max_residuum_g = float(slad_inicjalizacji["residuum_g"])

        t_s = 0.0
        indeks_probki = 0
        stan_scenariusza = stan_poczatkowy_scenariusza(wejscie.galezie)

        chwila = self._nanies_chwile(
            t_s, wpisy, 0, stan_scenariusza, urzadzenia, stany, napiecia, wykonane, kroki_szczegolne
        )
        stan_scenariusza = chwila.stan_scenariusza
        model, odbiory, urzadzenia = chwila.model, chwila.odbiory, chwila.urzadzenia
        napiecia, kontekst = chwila.napiecia, chwila.kontekst
        indeks_wpisu = chwila.indeks_wpisu
        max_residuum_g = max(max_residuum_g, chwila.residuum_kcl_max)

        self._probkuj(probki, os_czasu, t_s, model, urzadzenia, stany, napiecia)
        indeks_probki = 1

        dt_biezace = nastawy.dt_s
        while nastawy.horyzont_s - t_s > TOLERANCJA_CZASU_S:
            cel = self._punkt_obowiazkowy(t_s, wpisy, indeks_wpisu, indeks_probki, nastawy)
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
                                f"Blad lokalny {blad} przekracza tolerancje "
                                f"{nastawy.tolerancja_kroku} przy najmniejszym dopuszczalnym "
                                f"kroku {nastawy.dt_min_s} s (t={t_s} s)",
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
                stany = wynik_kroku.stany
                napiecia = wynik_kroku.napiecia
                t_s += krok
                sprawdz_napiecia(napiecia, model.identy_wezlow, t_s)
                kroki += 1
                iteracje_max = max(iteracje_max, wynik_kroku.iteracje)
                max_residuum_f = max(max_residuum_f, wynik_kroku.residuum_stanow)
                max_residuum_g = max(max_residuum_g, wynik_kroku.residuum_algebry)
            t_s = cel

            chwila = self._nanies_chwile(
                t_s,
                wpisy,
                indeks_wpisu,
                stan_scenariusza,
                urzadzenia,
                stany,
                napiecia,
                wykonane,
                kroki_szczegolne,
            )
            stan_scenariusza = chwila.stan_scenariusza
            model, odbiory, urzadzenia = chwila.model, chwila.odbiory, chwila.urzadzenia
            napiecia, kontekst = chwila.napiecia, chwila.kontekst
            indeks_wpisu = chwila.indeks_wpisu
            max_residuum_g = max(max_residuum_g, chwila.residuum_kcl_max)

            if self._jest_chwila_probki(t_s, indeks_probki, nastawy):
                self._probkuj(probki, os_czasu, t_s, model, urzadzenia, stany, napiecia)
                indeks_probki += 1

        if indeks_wpisu != len(wpisy):
            pominiete = [(wpis.rodzaj, wpis.ref, wpis.t_s) for wpis in wpisy[indeks_wpisu:]]
            raise AssertionError(
                "Bieg zakonczyl sie z NIEWYKONANYMI zdarzeniami harmonogramu: "
                f"{pominiete}. Kazde zdarzenie w horyzoncie musi zostac wykonane — "
                "cichy skip jest defektem silnika, nie wlasnoscia scenariusza."
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
            probki={klucz: tuple(szereg) for klucz, szereg in probki.items()},
            zdarzenia_wykonane=tuple(wykonane),
            wlasnosci=wlasnosci,
            tozsamosc=zbuduj_tozsamosc(wejscie, model, urzadzenia),
            metryki=self._metryki(kanaly, probki, os_czasu),
            zalozenia=ZALOZENIA_RDZENIA,
            slad_white_box=self._slad(
                slad_inicjalizacji,
                model,
                nastawy,
                kroki_szczegolne,
                kroki,
                kroki_odrzucone,
                iteracje_max,
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
                    f"Punkt pracy nie ma napiecia wezla {urzadzenie.wezel!r} "
                    f"(urzadzenie {urzadzenie.ident!r})",
                )
            if urzadzenie.ident not in punkt.moce_zrodel_pu:
                raise odmowa_braku_pola(
                    "punkt_pracy_moc",
                    f"Punkt pracy nie ma mocy zrodla {urzadzenie.ident!r}",
                )
            stany.append(
                urzadzenie.stan_poczatkowy(
                    punkt.napiecia_pu[urzadzenie.wezel], punkt.moce_zrodel_pu[urzadzenie.ident]
                )
            )
        return tuple(stany)

    def _napiecia_poczatkowe(self, model: ModelSieci) -> np.ndarray:
        punkt = self.wejscie.punkt_pracy
        wartosci: list[complex] = []
        for ident in model.identy_wezlow:
            if ident not in punkt.napiecia_pu:
                raise odmowa_braku_pola(
                    "punkt_pracy_napiecie", f"Punkt pracy nie ma napiecia wezla {ident!r}"
                )
            wartosci.append(punkt.napiecia_pu[ident])
        return np.array(wartosci, dtype=complex)

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
        for urzadzenie in kontekst.urzadzenia:
            bez_rownowagi = set(urzadzenie.stany_bez_rownowagi)
            for pozycja, nazwa in enumerate(urzadzenie.nazwy_stanow):
                if nazwa in bez_rownowagi:
                    maska_rownowagi[przesuniecie + pozycja] = False
            przesuniecie += len(urzadzenie.nazwy_stanow)
        pochodne_rownowagi = pochodne[maska_rownowagi]

        norma_f = float(np.max(np.abs(pochodne_rownowagi))) if pochodne_rownowagi.size else 0.0
        norma_g = float(np.max(np.abs(reszta_algebry))) if reszta_algebry.size else 0.0

        residua_urzadzen: list[tuple[str, tuple[tuple[str, float], ...]]] = []
        przesuniecie = 0
        for urzadzenie in kontekst.urzadzenia:
            wymiar = len(urzadzenie.nazwy_stanow)
            wycinek = pochodne[przesuniecie : przesuniecie + wymiar]
            residua_urzadzen.append(
                (
                    urzadzenie.ident,
                    tuple(
                        (nazwa, kwantyzuj(float(wartosc)))
                        for nazwa, wartosc in zip(urzadzenie.nazwy_stanow, wycinek, strict=True)
                    ),
                )
            )
            przesuniecie += wymiar
        residua_wezlow = tuple(
            (ident, kwantyzuj(float(abs(reszta_algebry[pozycja]))))
            for pozycja, ident in enumerate(kontekst.model.identy_wezlow)
        )

        if norma_f > nastawy.eps_init or norma_g > nastawy.eps_init:
            raise OdmowaDynamiki(
                KOD_INICJALIZACJA_NIEZBIEZNA,
                "Punkt pracy nie jest rownowaga ukladu: "
                f"||f|| = {norma_f}, ||g|| = {norma_g}, eps_init = {nastawy.eps_init}",
                residuum_f=norma_f,
                residuum_g=norma_g,
                eps_init=nastawy.eps_init,
                residua_urzadzen=tuple(residua_urzadzen),
                residua_wezlow=residua_wezlow,
            )
        return {
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

    def _nanies_chwile(
        self,
        t_s: float,
        wpisy: tuple[WpisHarmonogramu, ...],
        indeks_wpisu: int,
        stan_scenariusza: StanScenariusza,
        urzadzenia: tuple[Urzadzenie, ...],
        stany: tuple[np.ndarray, ...],
        napiecia: np.ndarray,
        wykonane: list[ZdarzenieWykonane],
        kroki_szczegolne: list[dict[str, Any]],
    ) -> _Chwila:
        """Nanies wszystkie wpisy chwili `t_s`, zloz siec od nowa, re-inicjalizuj RAZ."""
        wejscie = self.wejscie
        do_wykonania = self._wpisy_chwili(t_s, wpisy, indeks_wpisu)

        if not do_wykonania:
            model = self._model_dla(stan_scenariusza)
            odbiory = odbiory_po_zdarzeniach(wejscie.odbiory, stan_scenariusza)
            return _Chwila(
                indeks_wpisu=indeks_wpisu,
                stan_scenariusza=stan_scenariusza,
                model=model,
                odbiory=odbiory,
                urzadzenia=urzadzenia,
                napiecia=napiecia,
                kontekst=KontekstKroku(model, odbiory, urzadzenia, wejscie.nastawy),
                bylo_zdarzenie=False,
                residuum_kcl_max=0.0,
            )

        nowy_stan = stan_scenariusza
        for wpis in do_wykonania:
            nowy_stan = zastosuj(wpis, nowy_stan)
        model = self._model_dla(nowy_stan)
        odbiory = odbiory_po_zdarzeniach(wejscie.odbiory, nowy_stan)
        urzadzenia_po = tuple(
            (
                UrzadzenieOdlaczone(urzadzenie)
                if urzadzenie.ident in nowy_stan.zrodla_odlaczone
                and not isinstance(urzadzenie, UrzadzenieOdlaczone)
                else urzadzenie
            )
            for urzadzenie in urzadzenia
        )

        napiecia_po, raport = reinicjalizuj(
            model,
            odbiory,
            urzadzenia_po,
            stany,
            napiecia,
            nastawy=wejscie.nastawy,
            t_s=t_s,
        )
        for wpis in do_wykonania:
            wykonane.append(
                ZdarzenieWykonane(
                    t_zaplanowany_s=wpis.t_s,
                    t_wykonany_s=t_s,
                    rodzaj=wpis.rodzaj,
                    ref=wpis.ref,
                    delta_x_max=raport.delta_x_max,
                    delta_y_max=raport.delta_y_max,
                    residuum_kcl_max=raport.residuum_kcl_max,
                )
            )
        kroki_szczegolne.append(
            {
                "t_s": kwantyzuj(t_s),
                "powod": "zdarzenie",
                "rodzaje": [wpis.rodzaj for wpis in do_wykonania],
                "delta_x_max": kwantyzuj(raport.delta_x_max),
                "delta_y_max": kwantyzuj(raport.delta_y_max),
                "residuum_kcl_max": kwantyzuj(raport.residuum_kcl_max),
                "iteracje": raport.iteracje,
                "nawroty": raport.nawroty,
            }
        )
        return _Chwila(
            indeks_wpisu=indeks_wpisu + len(do_wykonania),
            stan_scenariusza=nowy_stan,
            model=model,
            odbiory=odbiory,
            urzadzenia=urzadzenia_po,
            napiecia=napiecia_po,
            kontekst=KontekstKroku(model, odbiory, urzadzenia_po, wejscie.nastawy),
            bylo_zdarzenie=True,
            residuum_kcl_max=raport.residuum_kcl_max,
        )

    def _model_dla(self, stan: StanScenariusza) -> ModelSieci:
        return zloz_model_sieci(
            self.wejscie.wezly,
            self.wejscie.galezie,
            self.wejscie.odsprzegi,
            galezie_aktywne=stan.galezie_aktywne,
            admitancje_zwarc=stan.admitancje_zwarc,
        )

    # -- os czasu ---------------------------------------------------------

    def _punkt_obowiazkowy(
        self,
        t_s: float,
        wpisy: tuple[WpisHarmonogramu, ...],
        indeks_wpisu: int,
        indeks_probki: int,
        nastawy: NastawySolvera,
    ) -> float:
        kandydaci = [nastawy.horyzont_s]
        chwila_probki = indeks_probki * nastawy.krok_wyjscia_s
        if chwila_probki <= nastawy.horyzont_s:
            kandydaci.append(chwila_probki)
        for wpis in wpisy[indeks_wpisu:]:
            if wpis.t_s > t_s + TOLERANCJA_CZASU_S:
                kandydaci.append(wpis.t_s)
                break
        return min(kandydat for kandydat in kandydaci if kandydat > t_s + TOLERANCJA_CZASU_S)

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
        self, model: ModelSieci, urzadzenia: tuple[Urzadzenie, ...]
    ) -> tuple[KanalWyniku, ...]:
        kanaly: list[KanalWyniku] = []
        for ident in model.identy_wezlow:
            kanaly.append(
                KanalWyniku(
                    klucz=f"u_pu@{ident}",
                    przestrzen="siec",
                    jednostka="pu",
                    element_ref=ident,
                    opis_pl=f"Modul napiecia na szynie {ident}",
                )
            )
            kanaly.append(
                KanalWyniku(
                    klucz=f"kat_deg@{ident}",
                    przestrzen="siec",
                    jednostka="deg",
                    element_ref=ident,
                    opis_pl=f"Kat napiecia na szynie {ident}",
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
                        opis_pl=f"Stan {nazwa} urzadzenia {urzadzenie.ident}",
                    )
                )
            kanaly.append(
                KanalWyniku(
                    klucz=f"p_pu@{urzadzenie.ident}",
                    przestrzen="urzadzenie",
                    jednostka="pu",
                    element_ref=urzadzenie.ident,
                    opis_pl=f"Moc czynna oddawana do sieci przez {urzadzenie.ident}",
                )
            )
            kanaly.append(
                KanalWyniku(
                    klucz=f"q_pu@{urzadzenie.ident}",
                    przestrzen="urzadzenie",
                    jednostka="pu",
                    element_ref=urzadzenie.ident,
                    opis_pl=f"Moc bierna oddawana do sieci przez {urzadzenie.ident}",
                )
            )
        return tuple(kanaly)

    def _probkuj(
        self,
        probki: dict[str, list[float]],
        os_czasu: list[float],
        t_s: float,
        model: ModelSieci,
        urzadzenia: tuple[Urzadzenie, ...],
        stany: tuple[np.ndarray, ...],
        napiecia: np.ndarray,
    ) -> None:
        os_czasu.append(t_s)
        for pozycja, ident in enumerate(model.identy_wezlow):
            napiecie = complex(napiecia[pozycja])
            probki[f"u_pu@{ident}"].append(abs(napiecie))
            probki[f"kat_deg@{ident}"].append(float(np.degrees(np.angle(napiecie))))
        for urzadzenie, stan in zip(urzadzenia, stany, strict=True):
            for nazwa, wartosc in zip(urzadzenie.nazwy_stanow, stan, strict=True):
                probki[f"{nazwa}@{urzadzenie.ident}"].append(float(wartosc))
            pozycja = model.indeks_wezla[urzadzenie.wezel]
            napiecie = complex(napiecia[pozycja])
            moc = napiecie * urzadzenie.prad_pu(stan, napiecie).conjugate()
            probki[f"p_pu@{urzadzenie.ident}"].append(float(moc.real))
            probki[f"q_pu@{urzadzenie.ident}"].append(float(moc.imag))

    def _metryki(
        self,
        kanaly: tuple[KanalWyniku, ...],
        probki: dict[str, list[float]],
        os_czasu: list[float],
    ) -> tuple[Metryka, ...]:
        metryki: list[Metryka] = []
        napieciowe = [kanal for kanal in kanaly if kanal.klucz.startswith("u_pu@")]
        if napieciowe and os_czasu:
            wartosc, element, klucz = min(
                (min(probki[kanal.klucz]), kanal.element_ref or "", kanal.klucz)
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
                    Metryka(f"omega_max_pu@{ident}", max(szereg), "pu", "max_t omega(t)", ident)
                )
                metryki.append(
                    Metryka(f"omega_min_pu@{ident}", min(szereg), "pu", "min_t omega(t)", ident)
                )
            elif klucz.startswith("delta_rad@"):
                ident = klucz.split("@", 1)[1]
                metryki.append(
                    Metryka(f"delta_max_rad@{ident}", max(szereg), "rad", "max_t delta(t)", ident)
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
    ) -> dict[str, Any]:
        """Slad WHITE BOX biegu — BEZ szeregow czasowych.

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
            },
            "kroki_szczegolne": kroki_szczegolne,
            "podsumowanie_krokow": {
                "kroki": kroki,
                "kroki_odrzucone": kroki_odrzucone,
                "max_iteracji_newtona_w_kroku": iteracje_max,
            },
        }


#: Zalozenia modelu — wchodza do wyniku, zeby czytelnik przebiegu wiedzial, co
#: model OBEJMUJE, a czego nie, bez siegania do dokumentacji.
ZALOZENIA_RDZENIA: tuple[str, ...] = (
    "Model RMS skladowej zgodnej: os czasu niesie obwiednie fazorow, nie przebiegi chwilowe.",
    "Odbiory o stalej mocy — przy glebokiej zapadzie napiecia uklad algebraiczny moze nie "
    "miec rozwiazania (odmowa nazwana, nie ekstrapolacja).",
    "Zwarcia wylacznie trojfazowe; niesymetria wymaga skladowych symetrycznych.",
    "Urzadzenia rdzenia: maszyna klasyczna 2. rzedu i szyna sztywna.",
    "Probka w chwili t jest stanem PO wykonaniu wszystkich zdarzen tej chwili.",
)


def jednostka_stanu(nazwa: str) -> str:
    """Jednostka stanu wyprowadzona z jego NAZWY (sufiks jest czescia kontraktu nazw).

    Brak sufiksu jednostki to blad kontraktu urzadzenia, nie powod do zgadywania:
    kanal bez jednostki byloby liczba bez znaczenia fizycznego w wyniku.
    """
    if nazwa.endswith("_rad"):
        return "rad"
    if nazwa.endswith("_pu"):
        return "pu"
    if nazwa.endswith("_s"):
        return "s"
    raise AssertionError(
        f"Stan {nazwa!r} nie niesie jednostki w nazwie — kontrakt nazw stanow wymaga "
        "sufiksu jednostki (_rad, _pu, _s)."
    )


__all__ = [
    "MARGINES_DOBORU_KROKU",
    "MAX_SPADEK_KROKU",
    "MAX_WZROST_KROKU",
    "TOLERANCJA_CZASU_S",
    "ZALOZENIA_RDZENIA",
    "SilnikDynamiki",
    "jednostka_stanu",
]
