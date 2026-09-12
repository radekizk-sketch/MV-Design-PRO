"""Katalog mutacji — REALNE podmiany wykonywanego kodu laboratorium.

KOD BADAWCZY — patrz `backend/research/README.md`. Nie jest dowodem regulacyjnym.

CO SIĘ ZMIENIŁO WZGLĘDEM POPRZEDNIEJ WERSJI (audyt niezależny, plan naprawy §4).
Poprzedni katalog miał 16 pozycji i meldował „16/16 zabitych", a jego mutacje NIE
ZMIENIAŁY KODU. Sprawdzały:

* typy wyjątków — ``issubclass(NiezgodnaDlugoscPrzebieguError, ValueError)``,
* wartości wyliczeń — ``StatusKroku.FAILED is not StatusKroku.STRICT_CONVERGENCE``,
* etykiety i deklaracje rejestrów.

Zarzut audytu dawał się sprawdzić wprost: po usunięciu walidacji wyniku albo po
zastąpieniu odcisku implementacji stałym SHA kampania NADAL meldowała 16/16, bo
żadna „mutacja" tych miejsc nie dotykała.

KAŻDA POZYCJA TEGO KATALOGU:

1. nazywa ZAKRES — dokładnie ten element kodu, który podmienia,
2. instaluje defekt jako podmianę realnie wykonywanej funkcji/metody,
3. wskazuje SONDY — testy laboratorium, które mają paść pod tym defektem,
4. jest uruchamiana z KONTROLĄ BAZOWĄ (te same sondy bez mutacji).

DZIEWIĘĆ DEFEKTÓW WYMIENIONYCH W PLANIE NAPRAWY jest pokrytych jeden do jednego:
brak walidacji czasu, brak walidacji długości kanałów, akceptacja NaN/Inf,
fałszywa zbieżność ścisła, zmiana znaku w równaniu wahań, usunięcie limitu
energii magazynu, stały odcisk implementacji, błędna obsługa gałęzi równoległych,
błędne adresowanie zdarzeń.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import AbstractContextManager, contextmanager
from typing import Any
from unittest.mock import patch

import numpy as np
from numpy.typing import NDArray

from dynamic_lab.mutacje import KlasaDefektu, Mutacja

# ---------------------------------------------------------------------------
# KONTRAKT WYNIKU — walidacje, bez których wynik jest nieinterpretowalny
# ---------------------------------------------------------------------------


def _bez_kontroli_czasu() -> AbstractContextManager[None]:
    """Usuwa kontrolę ŚCISŁEJ MONOTONICZNOŚCI osi czasu z kontraktu wyniku.

    Pozostałe kontrole zostają — mutacja ma być PUNKTOWA, inaczej nie wiadomo,
    która z nich zabiła.
    """
    from dynamic_lab.skonczonosc import wymagaj_skonczonosci
    from dynamic_lab.wynik import (
        KolizjaSygnaluError,
        NiezgodnaDlugoscPrzebieguError,
        WynikDynamiczny,
    )

    def zmutowany(self: Any) -> None:
        n = len(self.czas_s)
        wymagaj_skonczonosci(self.czas_s, co="oś czasu", gdzie=self.kontrakt)
        for sygnal in self.sygnaly:
            wymagaj_skonczonosci(
                sygnal.wartosci,
                co="przebieg",
                gdzie=f"{sygnal.klucz_pelny}@{sygnal.element_ref}",
            )
        for s in self.sygnaly:
            if len(s.wartosci) != n:
                raise NiezgodnaDlugoscPrzebieguError("mutacja: kontrola długości zachowana")
        # MUTACJA: pętla sprawdzająca `b > a` USUNIĘTA.
        tozsamosci = [(s.przestrzen.value, s.klucz, s.element_ref) for s in self.sygnaly]
        if len(set(tozsamosci)) != len(tozsamosci):
            raise KolizjaSygnaluError("mutacja: kontrola kolizji zachowana")

    return patch.object(WynikDynamiczny, "__post_init__", zmutowany)


def _bez_kontroli_dlugosci_kanalow() -> AbstractContextManager[None]:
    """Usuwa kontrolę RÓWNOLEGŁOŚCI SERII (długość przebiegu = długość osi czasu)."""
    from dynamic_lab.skonczonosc import wymagaj_skonczonosci
    from dynamic_lab.wynik import (
        KolizjaSygnaluError,
        NiemonotonicznaOsCzasuError,
        WynikDynamiczny,
    )

    def zmutowany(self: Any) -> None:
        wymagaj_skonczonosci(self.czas_s, co="oś czasu", gdzie=self.kontrakt)
        for sygnal in self.sygnaly:
            wymagaj_skonczonosci(
                sygnal.wartosci,
                co="przebieg",
                gdzie=f"{sygnal.klucz_pelny}@{sygnal.element_ref}",
            )
        # MUTACJA: pętla sprawdzająca `len(s.wartosci) != n` USUNIĘTA.
        for a, b in zip(self.czas_s[:-1], self.czas_s[1:], strict=True):
            if not b > a:
                raise NiemonotonicznaOsCzasuError("mutacja: kontrola monotoniczności zachowana")
        tozsamosci = [(s.przestrzen.value, s.klucz, s.element_ref) for s in self.sygnaly]
        if len(set(tozsamosci)) != len(tozsamosci):
            raise KolizjaSygnaluError("mutacja: kontrola kolizji zachowana")

    return patch.object(WynikDynamiczny, "__post_init__", zmutowany)


def _zdarzenie_ignoruje_tozsamosc() -> AbstractContextManager[None]:
    """Zdarzenie wyłącza PIERWSZĄ załączoną gałąź zamiast wskazanej tożsamością.

    To jest defekt adresowania w najczystszej postaci: scenariusz mówi „wyłącz
    KABEL-A", a model wyłącza to, co akurat leży pierwsze w liście.
    """
    from dynamic_lab.siec import TopologiaSieci
    from dynamic_lab.zdarzenia import WylaczenieGalezi

    def zmutowany(self: Any, topologia: TopologiaSieci) -> TopologiaSieci:
        for galaz in topologia.galezie:
            if galaz.zalaczona:
                return topologia.z_wylaczona_galezia_po_id(galaz.ident)
        raise ValueError("mutacja: brak załączonej gałęzi")

    return patch.object(WylaczenieGalezi, "zastosuj", zmutowany)


# ---------------------------------------------------------------------------
# NUMERYKA — skończoność i status zbieżności
# ---------------------------------------------------------------------------


def _akceptuje_nan_i_inf() -> AbstractContextManager[None]:
    """``wymagaj_skonczonosci`` przestaje cokolwiek wymagać.

    Podmieniane jest JEDNO miejsce, przez które przechodzą wszystkie kontrole
    skończoności laboratorium — dlatego ta mutacja bada, czy to miejsce jest
    naprawdę jedynym źródłem prawdy, czy tylko tak wygląda.
    """
    import dynamic_lab.calkowanie as calkowanie
    import dynamic_lab.silnik as silnik
    import dynamic_lab.skonczonosc as skonczonosc
    import dynamic_lab.wynik as wynik

    def zmutowany(*_args: Any, **_kwargs: Any) -> None:
        return None

    @contextmanager
    def instaluj() -> Iterator[None]:
        with (
            patch.object(skonczonosc, "wymagaj_skonczonosci", zmutowany),
            patch.object(calkowanie, "wymagaj_skonczonosci", zmutowany),
            patch.object(silnik, "wymagaj_skonczonosci", zmutowany),
            patch.object(wynik, "wymagaj_skonczonosci", zmutowany),
        ):
            yield

    return instaluj()


def _falszywa_zbieznosc_scisla() -> AbstractContextManager[None]:
    """Krok metody jawnej melduje ``STRICT_CONVERGENCE`` BEZWARUNKOWO.

    Dokładnie stan sprzed naprawy §2: „nie ma układu nieliniowego, więc nie ma
    czego nie zbiec" stosowane też wtedy, gdy krok nie wyprodukował liczb.
    """
    import dynamic_lab.calkowanie as calkowanie

    def zmutowany(
        ewaluacje: int, x1: NDArray[np.float64], *, metoda: str
    ) -> calkowanie.WynikKrokuNieliniowego:
        return calkowanie.WynikKrokuNieliniowego(
            status=calkowanie.StatusKroku.STRICT_CONVERGENCE,
            kryterium=calkowanie.KRYTERIUM_DOMYSLNE,
            rho=0.0,
            residuum_maks=0.0,
            iteracje=0,
            ewaluacje_jakobianu=0,
            ewaluacje_f=ewaluacje,
            przyczyna="mutacja: status bezwarunkowy",
        )

    return patch.object(calkowanie, "_sprawozdanie_metody_jawnej", zmutowany)


def _rk4_degradowane_do_rzedu_drugiego() -> AbstractContextManager[None]:
    """``Rk4`` liczy punktem środkowym (rząd 2), ale nadal deklaruje ``rzad = 4``.

    MUTANT C RECENZJI NIEZALEŻNEJ (P1-DELTA-19), który PRZEŻYŁ kampanię na
    1ff13df9 razem z kompletem testów autora; recenzent zmierzył wtedy rzędy
    2,055 / 2,027 / 2,014 pod etykietą rzędu 4.

    Sedno defektu: etykieta ``rzad`` jest DEKLARACJĄ. Sonda musi MIERZYĆ rząd na
    drabinie kroku, bo sprawdzenie etykiety sprawdza wyłącznie samą siebie.
    """
    import dynamic_lab.calkowanie as calkowanie

    def krok_ze_sprawozdaniem(
        self: Any, f: Any, x: NDArray[np.float64], t: float, dt: float
    ) -> tuple[NDArray[np.float64], Any]:
        k1 = f(x, t)
        k2 = f(x + 0.5 * dt * k1, t + 0.5 * dt)
        x1 = x + dt * k2
        return x1, calkowanie._sprawozdanie_metody_jawnej(2, x1, metoda=self.nazwa)

    return patch.object(calkowanie.Rk4, "krok_ze_sprawozdaniem", krok_ze_sprawozdaniem)


def _przebieg_przyjmuje_wadliwa_os_czasu() -> AbstractContextManager[None]:
    """``Przebieg`` przestaje sprawdzać oś czasu i wartości.

    P1-DELTA-20 recenzji niezależnej: katalog mutacji NIE ATAKOWAŁ klasy
    ``Przebieg`` w ogóle, a to ona decyduje, czy porównanie z wzorcem liczy się
    na danych poprawnych. Bez kontroli oś niemonotoniczna, duplikat chwili i NaN
    przechodzą, a ``numpy.interp`` zwraca dla nich liczby — porównanie wygląda
    wtedy na wykonane.
    """
    from dynamic_lab import wzorzec_trajektoria

    def bez_kontroli(self: Any) -> None:
        return None

    return patch.object(wzorzec_trajektoria.Przebieg, "__post_init__", bez_kontroli)


def _tolerancja_kroku_przestaje_zalezec_od_kroku() -> AbstractContextManager[None]:
    """Tolerancja równania kroku znów STAŁA, niezależna od ``dt``.

    Odtworzenie defektu ZNALEZIONEGO przy okazji §5 i naprawionego u źródła.
    Przy stałej tolerancji błąd rozwiązania równania kroku kumuluje się liniowo z
    liczbą kroków, a błąd obcięcia maleje jak ``dt^p`` — poniżej pewnego kroku
    wygrywa pierwszy i ZAGĘSZCZANIE KROKU POGARSZA WYNIK. Zmierzony dryf całki
    pierwszej (trapez, SMIB): 2,54e-08 -> 6,36e-09 -> 7,57e-06 -> 1,55e-05.

    Mutacja istnieje, bo kampania TEGO NIE ZŁAPAŁA: defekt przeżył komplet
    dziesięciu mutacji i wyszedł dopiero z pomiaru drabiny kroku. Luka pokrycia
    wykryta w ten sposób jest wpisywana do katalogu, a nie odnotowywana.
    """
    import dynamic_lab.calkowanie as calkowanie

    def zmutowany(dt: float, rzad: int) -> float:
        return 1.0

    return patch.object(calkowanie, "wspolczynnik_kroku", zmutowany)


def _rzutowanie_przyjmuje_wartosci_niepoprawne() -> AbstractContextManager[None]:
    """Nakładka niezmienników RZUTUJE ``NaN`` na granicę przedziału.

    Odtworzenie mechanizmu sprzed naprawy §2: ``NaN`` przechodził przez predykat
    przedziału jako „poza zakresem", a przez wybór granicy jako „za duży".
    """
    from dynamic_lab.calkowanie import IntegratorZNiezmiennikami, ZapisRzutowania

    def zmutowany(self: Any, x1: NDArray[np.float64], chwila_s: float) -> NDArray[np.float64]:
        wynik = x1
        for ogr in self.ograniczenia:
            wartosc = float(wynik[ogr.indeks])
            if ogr.dol <= wartosc <= ogr.gora:
                continue
            granica = "dol" if wartosc < ogr.dol else "gora"
            nowa = ogr.dol if wartosc < ogr.dol else ogr.gora
            if wynik is x1:
                wynik = x1.copy()
            wynik[ogr.indeks] = nowa
            self.dziennik.zapisz(
                ZapisRzutowania(
                    chwila_s=chwila_s,
                    indeks=ogr.indeks,
                    nazwa=ogr.nazwa,
                    znaczenie=ogr.znaczenie,
                    wartosc_przed=wartosc,
                    wartosc_po=nowa,
                    granica=granica,
                )
            )
        return wynik

    return patch.object(IntegratorZNiezmiennikami, "_rzutuj", zmutowany)


# ---------------------------------------------------------------------------
# FIZYKA — równanie ruchu, energia magazynu, topologia
# ---------------------------------------------------------------------------


def _odwrocony_znak_w_rownaniu_wahan() -> AbstractContextManager[None]:
    """``d(delta)/dt = -OMEGA_S·(omega - 1)`` — zgubiony znak w równaniu wahań.

    Klasyczny defekt symulacji: przebieg nadal wygląda jak oscylacja, więc oko
    go nie łapie. Łapie go dopiero sprawdzenie równania na ZAPISANEJ trajektorii.
    """
    from dynamic_lab.konwencje import OMEGA_S
    from dynamic_lab.urzadzenia import MaszynaSynchroniczna4Rzedu

    oryginalna = MaszynaSynchroniczna4Rzedu.pochodne_bez_regulatorow

    def zmutowany(
        self: Any,
        x: NDArray[np.float64],
        v_szyny: complex,
        *,
        pm_pu: float,
        efd_pu: float,
    ) -> NDArray[np.float64]:
        dx = oryginalna(self, x, v_szyny, pm_pu=pm_pu, efd_pu=efd_pu).copy()
        # MUTACJA: znak pierwszego równania ruchu odwrócony.
        dx[0] = -OMEGA_S * (float(x[1]) - 1.0)
        return dx

    return patch.object(MaszynaSynchroniczna4Rzedu, "pochodne_bez_regulatorow", zmutowany)


def _magazyn_bez_limitu_energii() -> AbstractContextManager[None]:
    """Bramka okna SOC przestaje ograniczać moc — magazyn oddaje bez końca.

    Defekt P0 z §1 w czystej postaci: zapas energii istnieje jako stan, ale nie
    wpływa na moc, więc wsparcie częstotliwości trwa w nieskończoność.
    """
    from dynamic_lab.urzadzenia_oze import MagazynEnergiiBESS

    def zmutowany(self: Any, soc: float, p_pu: float) -> float:
        return 1.0

    return patch.object(MagazynEnergiiBESS, "bramka_energii", zmutowany)


def _wylaczenie_rozpina_korytarz() -> AbstractContextManager[None]:
    """Wyłączenie gałęzi po tożsamości wyłącza WSZYSTKIE gałęzie tej pary szyn.

    Odtworzenie defektu sprzed naprawy: przy dwóch torach równoległych
    „wyłącz jeden tor" odcinało maszynę od systemu.
    """
    from dataclasses import replace

    from dynamic_lab.siec import TopologiaSieci

    def zmutowany(self: Any, ident: str) -> TopologiaSieci:
        cel = next((g for g in self.galezie if g.ident == ident), None)
        if cel is None:
            raise ValueError(f"Brak gałęzi o tożsamości „{ident}”.")
        para = {cel.od_szyny, cel.do_szyny}
        nowe = [
            replace(g, zalaczona=False) if {g.od_szyny, g.do_szyny} == para else g
            for g in self.galezie
        ]
        return replace(self, galezie=nowe)

    return patch.object(TopologiaSieci, "z_wylaczona_galezia_po_id", zmutowany)


# ---------------------------------------------------------------------------
# TOŻSAMOŚĆ — odcisk implementacji
# ---------------------------------------------------------------------------


def _staly_odcisk_implementacji() -> AbstractContextManager[None]:
    """``odcisk_implementacji`` zwraca STAŁĄ zamiast skrótu treści modułów.

    Zarzut audytu wprost: „po zastąpieniu odcisku stałym SHA kampania nadal
    zgłasza 16/16". Ta mutacja robi dokładnie to.
    """
    import dynamic_lab.tozsamosc as tozsamosc

    def zmutowany() -> str:
        return "0" * 64

    @contextmanager
    def instaluj() -> Iterator[None]:
        with (
            patch.object(tozsamosc, "odcisk_implementacji", zmutowany),
            patch.object(tozsamosc, "_policz_odcisk_implementacji", zmutowany),
        ):
            yield

    return instaluj()


# ---------------------------------------------------------------------------
# KATALOG
# ---------------------------------------------------------------------------

SONDY_KONTRAKTU = ("tests/research/test_skonczonosc_i_zbieznosc.py",)
SONDY_BILANSU = ("tests/research/test_bilans_energii_magazynu.py",)
SONDY_TOPOLOGII = ("tests/research/test_tory_rownolegle.py",)
SONDY_TOZSAMOSCI = ("tests/research/test_tozsamosc_implementacji.py",)
SONDY_FIZYKI = ("tests/research/test_niezmienniki_fizyczne.py",)
#: Sonda rzędu metody: JEDEN plik, bo mierzy OBIE potrzebne wielkości — TEMPO
#: spadku dryfu (iloraz > 16) oraz jego WIELKOŚĆ (< 1e-12 przy 1 ms).
#:
#: Wersja pośrednia dokładała tu `test_wzorzec_trajektoria.py` „dla wielkości".
#: Było to nadmiarowe po dopisaniu asercji wielkości do pliku pierwszego, a przy
#: tym KOSZTOWNE: tamten plik uruchamia ANDES TDS (zmierzone ~280 s na bieg), a
#: kampania wykonuje KAŻDĄ sondę dwukrotnie — raz kontrolnie bez mutacji, raz z
#: mutacją. Weryfikacja trzech mutacji przekroczyła przez to 1500 s i została
#: zabita. Sonda, której nikt nie doczeka, nie chroni niczego.
SONDY_RZEDU_METODY = ("tests/research/test_calkowanie_zbieznosc.py",)
SONDY_TRAJEKTORII = ("tests/research/test_wzorzec_trajektoria.py",)


def mutacje_laboratorium() -> tuple[Mutacja, ...]:
    """Komplet mutacji. Kolejność jest stabilna — raport ma być porównywalny."""
    return (
        Mutacja(
            ident="M-KON-01",
            opis="Kontrakt wyniku przestaje sprawdzać ścisłą monotoniczność osi czasu",
            klasa=KlasaDefektu.KONTRAKT,
            zakres="dynamic_lab.wynik.WynikDynamiczny.__post_init__",
            oczekiwany_detektor="WynikDynamiczny.__post_init__ → NiemonotonicznaOsCzasuError",
            sondy=SONDY_KONTRAKTU,
            zastosuj=_bez_kontroli_czasu,
        ),
        Mutacja(
            ident="M-KON-02",
            opis="Kontrakt wyniku przestaje sprawdzać długość przebiegów",
            klasa=KlasaDefektu.KONTRAKT,
            zakres="dynamic_lab.wynik.WynikDynamiczny.__post_init__",
            oczekiwany_detektor="WynikDynamiczny.__post_init__ → NiezgodnaDlugoscPrzebieguError",
            sondy=SONDY_KONTRAKTU,
            zastosuj=_bez_kontroli_dlugosci_kanalow,
        ),
        Mutacja(
            ident="M-KON-03",
            opis="Zdarzenie topologiczne ignoruje tożsamość i wyłącza pierwszą gałąź",
            klasa=KlasaDefektu.KONTRAKT,
            zakres="dynamic_lab.zdarzenia.WylaczenieGalezi.zastosuj",
            oczekiwany_detektor="test permutacji rekordów — to samo zdarzenie, ten sam komponent",
            sondy=SONDY_TOPOLOGII,
            zastosuj=_zdarzenie_ignoruje_tozsamosc,
        ),
        Mutacja(
            ident="M-NUM-01",
            opis="Laboratorium akceptuje NaN i Inf we wszystkich kontrolach skończoności",
            klasa=KlasaDefektu.NUMERYKA,
            zakres="dynamic_lab.skonczonosc.wymagaj_skonczonosci (4 miejsca importu)",
            oczekiwany_detektor="wymagaj_skonczonosci → WartoscNieskonczonaError",
            sondy=SONDY_KONTRAKTU,
            zastosuj=_akceptuje_nan_i_inf,
        ),
        Mutacja(
            ident="M-NUM-02",
            opis="Krok metody jawnej melduje zbieżność ścisłą bezwarunkowo",
            klasa=KlasaDefektu.NUMERYKA,
            zakres="dynamic_lab.calkowanie._sprawozdanie_metody_jawnej",
            oczekiwany_detektor="kontrola skończoności stanu po kroku",
            sondy=SONDY_KONTRAKTU,
            zastosuj=_falszywa_zbieznosc_scisla,
        ),
        Mutacja(
            ident="M-NUM-03",
            opis="Nakładka niezmienników rzutuje NaN na granicę przedziału",
            klasa=KlasaDefektu.NUMERYKA,
            zakres="dynamic_lab.calkowanie.IntegratorZNiezmiennikami._rzutuj",
            oczekiwany_detektor="kontrola skończoności przed rzutowaniem",
            sondy=SONDY_KONTRAKTU,
            zastosuj=_rzutowanie_przyjmuje_wartosci_niepoprawne,
        ),
        Mutacja(
            ident="M-NUM-04",
            opis="Tolerancja równania kroku przestaje być skalowana krokiem",
            klasa=KlasaDefektu.NUMERYKA,
            zakres="dynamic_lab.calkowanie.wspolczynnik_kroku",
            oczekiwany_detektor="drabina kroku po całce pierwszej (rząd metody)",
            sondy=SONDY_RZEDU_METODY,
            zastosuj=_tolerancja_kroku_przestaje_zalezec_od_kroku,
        ),
        Mutacja(
            ident="M-NUM-05",
            opis="RK4 liczy metodą rzędu 2, zachowując deklarację rzad=4",
            klasa=KlasaDefektu.NUMERYKA,
            zakres="dynamic_lab.calkowanie.Rk4.krok_ze_sprawozdaniem",
            oczekiwany_detektor="pomiar rzędu na drabinie kroku (całka pierwsza)",
            sondy=SONDY_RZEDU_METODY,
            zastosuj=_rk4_degradowane_do_rzedu_drugiego,
        ),
        Mutacja(
            ident="M-KON-04",
            opis="Przebieg przyjmuje oś czasu niemonotoniczną, z duplikatem i NaN",
            klasa=KlasaDefektu.KONTRAKT,
            zakres="dynamic_lab.wzorzec_trajektoria.Przebieg.__post_init__",
            oczekiwany_detektor="kontrola osi czasu przy budowie przebiegu",
            sondy=SONDY_TRAJEKTORII,
            zastosuj=_przebieg_przyjmuje_wadliwa_os_czasu,
        ),
        Mutacja(
            ident="M-FIZ-01",
            opis="Odwrócony znak w pierwszym równaniu ruchu wirnika",
            klasa=KlasaDefektu.FIZYKA,
            zakres="dynamic_lab.urzadzenia.MaszynaSynchroniczna4Rzedu.pochodne_bez_regulatorow",
            oczekiwany_detektor="sprawdzenie równania ruchu na zapisanej trajektorii",
            sondy=SONDY_FIZYKI,
            zastosuj=_odwrocony_znak_w_rownaniu_wahan,
        ),
        Mutacja(
            ident="M-FIZ-02",
            opis="Magazyn traci ograniczenie energią — bramka okna SOC zawsze przepuszcza",
            klasa=KlasaDefektu.FIZYKA,
            zakres="dynamic_lab.urzadzenia_oze.MagazynEnergiiBESS.bramka_energii",
            oczekiwany_detektor="bilans ΔE_zasobu = ∫P_AC dt oraz granice okna SOC",
            sondy=SONDY_BILANSU,
            zastosuj=_magazyn_bez_limitu_energii,
        ),
        Mutacja(
            ident="M-FIZ-03",
            opis="Wyłączenie jednego toru rozpina cały korytarz dwutorowy",
            klasa=KlasaDefektu.FIZYKA,
            zakres="dynamic_lab.siec.TopologiaSieci.z_wylaczona_galezia_po_id",
            oczekiwany_detektor="test korytarza dwutorowego — Ybus po wyłączeniu jednego toru",
            sondy=SONDY_TOPOLOGII,
            zastosuj=_wylaczenie_rozpina_korytarz,
        ),
        Mutacja(
            ident="M-TOZ-01",
            opis="Odcisk implementacji jest stałą zamiast skrótu treści modułów",
            klasa=KlasaDefektu.TOZSAMOSC,
            zakres="dynamic_lab.tozsamosc.odcisk_implementacji",
            oczekiwany_detektor="test: zmiana jednego znaku w module zmienia odcisk",
            sondy=SONDY_TOZSAMOSCI,
            zastosuj=_staly_odcisk_implementacji,
        ),
    )


def mutacja_po_identyfikatorze(ident: str) -> Mutacja:
    """Mutacja o danym identyfikatorze — wejście procesu potomnego sond."""
    for mutacja in mutacje_laboratorium():
        if mutacja.ident == ident:
            return mutacja
    dostepne = ", ".join(m.ident for m in mutacje_laboratorium())
    raise KeyError(f"Nieznana mutacja „{ident}”. Dostępne: {dostepne}")
