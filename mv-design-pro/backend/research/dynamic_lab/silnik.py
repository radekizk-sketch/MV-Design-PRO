"""Silnik RMS: inicjalizacja z rozpływu, sprzężenie z siecią, pętla DAE.

KOD BADAWCZY — patrz `backend/research/README.md`.

Realizuje łańcuch, którego w produkcji NIE MA:

    rozpływ ustalony -> (x0, y0) -> weryfikacja równowagi -> zdarzenia
      -> integracja ze sprzężeniem sieciowym -> przebiegi U(t), f(t), P(t), Q(t)

Sformułowanie (schemat rozdzielony, standard narzędzi RMS):

    dx/dt = f(x, y, u, p, t)          — urządzenia
    0     = g(x, y, u, p, t)          — sieć: Ybus @ V = I_wstrzyk(x, V)

Algebra sieci jest rozwiązywana WEWNĄTRZ ewaluacji ``f``, więc integrator widzi
zwykłe ODE, a sprzężenie pozostaje realne: zmiana impedancji sieci zmienia ``V``,
a przez nie prądy, moce i pochodne wszystkich urządzeń.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace

import numpy as np
from numpy.typing import NDArray

from dynamic_lab.calkowanie import (
    INTEGRATORY,
    DziennikRzutowan,
    Integrator,
    OgraniczenieStanu,
    WynikKrokuNieliniowego,
    z_niezmiennikami,
)
from dynamic_lab.konwencje import czestotliwosc_hz, jednostki_stanow, stany_zasobowe
from dynamic_lab.siec import SolverSieci, TopologiaSieci
from dynamic_lab.skonczonosc import WartoscNieskonczonaError, wymagaj_skonczonosci
from dynamic_lab.tozsamosc import (
    KonfiguracjaSolvera,
    PunktPracy,
    TozsamoscScenariusza,
    nastawy_punktu_pracy,
    odcisk_implementacji,
    odcisk_topologii,
)
from dynamic_lab.tozsamosc import odcisk as odcisk_kanoniczny
from dynamic_lab.wynik import (
    KONTRAKT,
    BladSolvera,
    DiagnostykaSolvera,
    KompletnoscPrzebiegu,
    PrzestrzenSygnalu,
    RzutowanieStanu,
    TozsamoscModelu,
    WynikDynamiczny,
    ZbieraczPrzebiegow,
)
from dynamic_lab.zdarzenia import HarmonogramZdarzen


class KrokPozaDziedzinaError(ValueError):
    """Krok biegu przekracza granicę ważności zadeklarowaną przez urządzenie.

    Odrzucenie WEJŚCIA, nie niepowodzenie biegu: para (model, krok) leży poza
    zakresem, dla którego laboratorium cokolwiek obiecuje.
    """


class PunktPracyNiespojnyZRozplywemError(RuntimeError):
    """Urządzenie nie oddaje mocy, którą przyjął rozpływ — punkt startowy fikcyjny."""


class RownowagaNieosiagnietaError(RuntimeError):
    """Punkt startowy nie jest równowagą — symulacja byłaby artefaktem rozruchu.

    To jest bezpiecznik przeciwko defektowi P0-04 audytu: produkcyjny silnik
    startował ze stanów zerowych, przez co ``dx/dt(0) != 0`` dla 4 z 5 modeli i
    każdy przebieg był zdominowany przez sztuczny rozruch, a nie przez zakłócenie.
    """


@dataclass
class ModelDynamiczny:
    """Kompletny model: topologia + urządzenia + baza mocy."""

    topologia: TopologiaSieci
    urzadzenia: list[object]
    s_bazowa_mva: float = 100.0

    def __post_init__(self) -> None:
        znane = set(self.topologia.szyny)
        for u in self.urzadzenia:
            if u.szyna not in znane:
                raise ValueError(f"Urządzenie {u.ref} na nieznanej szynie")
        refy = [u.ref for u in self.urzadzenia]
        if len(set(refy)) != len(refy):
            raise ValueError("Powtórzone identyfikatory urządzeń")


@dataclass
class UkladStanu:
    """Mapowanie wektora globalnego ``x`` na wycinki poszczególnych urządzeń."""

    wycinki: dict[str, slice] = field(default_factory=dict)
    dlugosc: int = 0

    @classmethod
    def zbuduj(cls, urzadzenia: list[object]) -> UkladStanu:
        uklad = cls()
        pozycja = 0
        for u in urzadzenia:
            n = len(u.nazwy_stanow())  # type: ignore[attr-defined]
            uklad.wycinki[u.ref] = slice(pozycja, pozycja + n)  # type: ignore[attr-defined]
            pozycja += n
        uklad.dlugosc = pozycja
        return uklad


class SilnikRMS:
    """Silnik symulacji RMS ze sprzężeniem sieciowym."""

    def __init__(
        self,
        model: ModelDynamiczny,
        *,
        integrator: Integrator | str = "trapez_niejawny",
        krok_s: float = 0.005,
        tolerancja_sieci: float = 1.0e-12,
        tolerancja_rownowagi: float = 1.0e-6,
        tolerancja_mocy: float = 1.0e-6,
        probkowanie_co: int = 1,
    ) -> None:
        self.model = model
        self.integrator = INTEGRATORY[integrator] if isinstance(integrator, str) else integrator
        self.krok_s = krok_s
        self.tolerancja_rownowagi = tolerancja_rownowagi
        self.tolerancja_mocy = tolerancja_mocy
        self.probkowanie_co = max(1, probkowanie_co)
        self.solver_sieci = SolverSieci(model.topologia, tolerancja=tolerancja_sieci)
        self.uklad = UkladStanu.zbuduj(model.urzadzenia)
        self.ograniczenia_stanu = self._zbierz_ograniczniki()
        """Niezmienniki dyskretne stanów ZADEKLAROWANE PRZEZ URZĄDZENIA modelu.

        Integrator nie zna urządzeń, a urządzenia nie znają wektora globalnego —
        spotykają się tutaj, bo `UkladStanu` jest jedynym miejscem, które zna
        przesunięcia. Model bez ograniczników daje krotkę pustą i wtedy bieg nie
        zakłada nakładki: nakładka bez treści sugerowałaby ochronę, której nie ma.
        """
        self._ewaluacje = 0
        self._maks_residuum = 0.0
        self._maks_iteracji_sieci = 0
        # Punkt startowy iteracji sieci: ZATWIERDZONY, aktualizowany wyłącznie po
        # przyjętym kroku całkowania. Gdyby startem było ostatnie rozwiązanie,
        # `pochodne()` przestałoby być funkcją CZYSTĄ względem `x` — zależałoby od
        # historii wywołań. Dla metod jawnych to prawie nie boli, ale Jakobian
        # numeryczny metody niejawnej liczy się z wielu wywołań `f` wokół tego
        # samego `x` i ukryty stan go psuje: zmierzone skutkiem był brak
        # zbieżności Newtona na układzie sztywnym. To był realny defekt tego
        # laboratorium, znaleziony pomiarem, nie przeglądem kodu.
        self._v_zatwierdzone: NDArray[np.complex128] | None = None
        self._moce_zadane: dict[str, complex] = {}
        """Dyspozycja z ostatniej inicjalizacji — część zagadnienia początkowego,
        więc część tożsamości biegu."""
        self._v_startowe: NDArray[np.complex128] | None = None
        """Ziarno Newtona z rozpływu tej inicjalizacji — przywracane na starcie
        KAŻDEGO biegu. Zależy wyłącznie od (model, moce_zadane), nigdy od
        poprzedniej symulacji."""

    # -- warstwa algebraiczna -------------------------------------------------

    def _wstrzykniecia(self, x: NDArray[np.float64]):
        idx = self.model.topologia.indeks

        def funkcja(v: NDArray[np.complex128]) -> NDArray[np.complex128]:
            i = np.zeros(len(v), dtype=np.complex128)
            for u in self.model.urzadzenia:
                wycinek = self.uklad.wycinki[u.ref]  # type: ignore[attr-defined]
                wklad = u.wstrzykniecie(  # type: ignore[attr-defined]
                    x[wycinek], complex(v[idx[u.szyna]])
                )
                # PRĄD URZĄDZENIA — pierwsza wielkość fizyczna kroku. Sprawdzany TU,
                # a nie po zsumowaniu: suma z ``NaN`` też jest ``NaN``, ale nie
                # mówi, KTÓRE urządzenie go wyprodukowało (plan naprawy §2).
                wymagaj_skonczonosci(
                    wklad,
                    co="prąd wstrzykiwany",
                    gdzie=f"urządzenie {u.ref} na szynie {u.szyna}",  # type: ignore[attr-defined]
                )
                i[idx[u.szyna]] += wklad
            return i

        return funkcja

    def rozwiaz_siec(self, x: NDArray[np.float64]) -> NDArray[np.complex128]:
        """Rozwiąż ``g(x, V) = 0`` dla bieżącego stanu urządzeń."""
        start = (
            self._v_zatwierdzone
            if self._v_zatwierdzone is not None
            else np.ones(len(self.model.topologia.szyny), dtype=np.complex128)
        )
        wynik = self.solver_sieci.rozwiaz(self._wstrzykniecia(x), start)
        # NAPIĘCIA SIECI — wejście KAŻDEGO modelu urządzenia w tym kroku. Napięcie
        # ``NaN`` rozlewa się na wszystkie pochodne i wszystkie zapisane przebiegi,
        # a ``max(self._maks_residuum, NaN)`` zwraca pierwszy argument, więc
        # diagnostyka biegu NIE odnotowałaby nawet pogorszenia residuum.
        wymagaj_skonczonosci(wynik.napiecia, co="napięcia sieci", gdzie="rozwiązanie algebry")
        wymagaj_skonczonosci(
            wynik.residuum, co="residuum algebry sieci", gdzie="rozwiązanie algebry"
        )
        self._maks_residuum = max(self._maks_residuum, wynik.residuum)
        self._maks_iteracji_sieci = max(self._maks_iteracji_sieci, wynik.iteracje)
        return wynik.napiecia

    def zatwierdz_punkt_pracy(self, v: NDArray[np.complex128]) -> None:
        """Zatwierdź napięcia jako punkt startowy kolejnych iteracji sieci."""
        self._v_zatwierdzone = v.copy()

    def pochodne(self, x: NDArray[np.float64], t: float) -> NDArray[np.float64]:
        """``f(x, t)`` z wewnętrznym rozwiązaniem algebry sieci."""
        self._ewaluacje += 1
        v = self.rozwiaz_siec(x)
        idx = self.model.topologia.indeks
        dx = np.zeros(self.uklad.dlugosc, dtype=np.float64)
        for u in self.model.urzadzenia:
            wycinek = self.uklad.wycinki[u.ref]  # type: ignore[attr-defined]
            if wycinek.stop > wycinek.start:
                pochodna_urzadzenia = u.pochodne(  # type: ignore[attr-defined]
                    x[wycinek], complex(v[idx[u.szyna]])
                )
                # POCHODNA URZĄDZENIA — sprawdzana per urządzenie, bo tylko tutaj
                # wiadomo, który model ją policzył ORAZ jak nazywają się jej
                # współrzędne. Integrator zobaczyłby wektor zbiorczy i mógłby co
                # najwyżej podać indeks; wynik meldowałby wtedy „coś jest NaN",
                # czyli dokładnie to zdanie, przeciwko któremu ta kontrola powstała.
                wymagaj_skonczonosci(
                    pochodna_urzadzenia,
                    co="pochodna stanu",
                    gdzie=f"urządzenie {u.ref}",  # type: ignore[attr-defined]
                    etykiety=[
                        f"{u.ref}.{nazwa}"  # type: ignore[attr-defined]
                        for nazwa in u.nazwy_stanow()  # type: ignore[attr-defined]
                    ],
                )
                dx[wycinek] = pochodna_urzadzenia
        return dx

    # -- inicjalizacja --------------------------------------------------------

    def rozplyw_ustalony(self, moce_zadane: dict[str, complex]) -> NDArray[np.complex128]:
        """Rozpływ ustalony: szyny sztywne + wstrzyknięcia o stałej mocy.

        To jest krok, z którego pochodzi ``y0`` (napięcia) i punkt pracy urządzeń.
        Świadomie prosty (PQ + szyna sztywna, bez regulacji napięcia PV) — w
        laboratorium chodzi o poprawny start dynamiki, nie o pełny solver
        rozpływu; produkcja ma własny, dojrzały Newton-Raphson i to jego wynik
        będzie karmił docelowy silnik.
        """
        idx = self.model.topologia.indeks
        n = len(self.model.topologia.szyny)

        def wstrzykniecia(v: NDArray[np.complex128]) -> NDArray[np.complex128]:
            i = np.zeros(n, dtype=np.complex128)
            for ref, s in moce_zadane.items():
                urzadzenie = self._urzadzenie(ref)
                szyna = idx[urzadzenie.szyna]  # type: ignore[attr-defined]
                v_szyny = complex(v[szyna])
                if abs(v_szyny) > 1.0e-9:
                    i[szyna] += np.conj(s / v_szyny)
            return i

        start = np.ones(n, dtype=np.complex128)
        for szyna, v_zadane in self.model.topologia.szyny_sztywne.items():
            start[idx[szyna]] = v_zadane
        wynik = self.solver_sieci.rozwiaz(wstrzykniecia, start)
        self._v_zatwierdzone = wynik.napiecia
        # ZIARNO BIEGU, nie pozostałość po biegu. Rozwiązanie rozpływu jest
        # wyprowadzone z (model, moce_zadane), więc jest legalnym punktem
        # startowym Newtona dla KAŻDEGO biegu z tej inicjalizacji — w
        # przeciwieństwie do napięć zostawionych przez POPRZEDNIĄ symulację.
        self._v_startowe = wynik.napiecia.copy()
        return wynik.napiecia

    def _urzadzenie(self, ref: str) -> object:
        for u in self.model.urzadzenia:
            if u.ref == ref:  # type: ignore[attr-defined]
                return u
        raise KeyError(f"Nieznane urządzenie {ref}")

    def inicjalizuj(self, moce_zadane: dict[str, complex]) -> NDArray[np.float64]:
        """Pełna inicjalizacja: rozpływ → punkt pracy urządzeń → stany regulatorów.

        SPRAWDZANE SĄ TRZY WARUNKI, nie jeden (pakiet D audytu). ``f(x0) = 0`` samo
        w sobie NIE dowodzi, że punkt startowy jest spójny z rozpływem:

          1. ``||f_szybkie(x0, y0)|| <= tolerancja_rownowagi`` — równowaga stanów
             ELEKTROMECHANICZNYCH. Stany ZASOBOWE (SOC magazynu) są z tego warunku
             wyłączone, bo ich pochodna jest niezerowa z definicji pracy urządzenia
             — patrz ``konwencje.stany_zasobowe``. Wyłączenie jest ROZRÓŻNIENIEM,
             nie rozluźnieniem tolerancji: pochodna zasobowa jest liczona i
             raportowana osobno, a nie ukrywana.
          2. algebra sieci ``g(x0, V0) = 0`` — z ``rozplyw_ustalony``.
          3. ``|S_rzeczywiste(x0, V0) - S_rozplywu| <= tolerancja_mocy`` — czy
             urządzenie FAKTYCZNIE oddaje moc, którą przyjął rozpływ. Bez tego
             warunku falownik z ogranicznikiem prądu, dla którego ``|S/V| > i_max``,
             przechodził inicjalizację: jego stany stały na zadanej wartości, więc
             ``ẋ = 0``, a wstrzyknięcie do sieci było PRZYCIĘTE. Punkt startowy
             opisywał wtedy inny punkt pracy niż rozpływ i nic tego nie zgłaszało.
        """
        # Dyspozycja jest WEJŚCIEM zagadnienia początkowego, więc wchodzi do
        # tożsamości biegu. Bez niej `P_G = 0,2` i `P_G = 0,9` na tej samej sieci
        # dawały ten sam odcisk scenariusza, choć to dwa różne zagadnienia.
        self._moce_zadane = {ref: complex(moc) for ref, moc in moce_zadane.items()}
        v0 = self.rozplyw_ustalony(moce_zadane)
        idx = self.model.topologia.indeks
        x0 = np.zeros(self.uklad.dlugosc, dtype=np.float64)
        for u in self.model.urzadzenia:
            wycinek = self.uklad.wycinki[u.ref]  # type: ignore[attr-defined]
            if wycinek.stop == wycinek.start:
                continue
            s = moce_zadane.get(u.ref, 0j)  # type: ignore[attr-defined]
            x0[wycinek] = u.inicjalizuj(complex(v0[idx[u.szyna]]), s)  # type: ignore[attr-defined]

        norma = self.norma_pochodnej(x0)
        if norma > self.tolerancja_rownowagi:
            raise RownowagaNieosiagnietaError(
                f"||f_szybkie(x0,y0)|| = {norma:.3e} > {self.tolerancja_rownowagi:.1e}. "
                "Punkt startowy nie jest równowagą — przebieg byłby artefaktem rozruchu."
            )

        niespojne = self.residua_mocy(x0, v0, moce_zadane)
        for ref, roznica in sorted(niespojne.items()):
            if roznica > self.tolerancja_mocy:
                raise PunktPracyNiespojnyZRozplywemError(
                    f"{ref}: |S_rzeczywiste - S_rozplywu| = {roznica:.3e} p.u. > "
                    f"{self.tolerancja_mocy:.1e}. Urządzenie NIE oddaje mocy przyjętej "
                    "przez rozpływ (najczęściej: ogranicznik prądu przycina wstrzyknięcie). "
                    "Ciche przyjęcie takiego punktu dawałoby przebieg opisujący inny "
                    "punkt pracy niż deklarowany."
                )
        return x0

    def residua_mocy(
        self,
        x: NDArray[np.float64],
        v: NDArray[np.complex128],
        moce_zadane: dict[str, complex],
    ) -> dict[str, float]:
        """``|S_rzeczywiste - S_zadane|`` per urządzenie [p.u.] — wspólny inwariant.

        Liczone dla urządzeń, dla których rozpływ PODAŁ moc; reszta nie ma z czym
        być porównana. Jeden mechanizm dla wszystkich modeli — bez wyjątków
        per typ urządzenia.
        """
        idx = self.model.topologia.indeks
        wynik: dict[str, float] = {}
        for u in self.model.urzadzenia:
            ref = u.ref  # type: ignore[attr-defined]
            if ref not in moce_zadane:
                continue
            wycinek = self.uklad.wycinki[ref]
            v_szyny = complex(v[idx[u.szyna]])  # type: ignore[attr-defined]
            i = u.wstrzykniecie(x[wycinek], v_szyny)  # type: ignore[attr-defined]
            s_rzeczywiste = v_szyny * np.conj(i)
            wynik[ref] = float(abs(s_rzeczywiste - moce_zadane[ref]))
        return wynik

    def _maska_stanow_szybkich(self) -> NDArray[np.bool_]:
        """Które pozycje wektora stanu podlegają warunkowi równowagi."""
        maska = np.ones(self.uklad.dlugosc, dtype=bool)
        for u in self.model.urzadzenia:
            wycinek = self.uklad.wycinki[u.ref]  # type: ignore[attr-defined]
            zasobowe = stany_zasobowe(u)
            if not zasobowe:
                continue
            for przesuniecie, nazwa in enumerate(u.nazwy_stanow()):  # type: ignore[attr-defined]
                if nazwa in zasobowe:
                    maska[wycinek.start + przesuniecie] = False
        return maska

    def norma_pochodnej(self, x: NDArray[np.float64]) -> float:
        """``||f_szybkie(x, y(x))||_inf`` — oddalenie od równowagi ELEKTROMECHANICZNEJ.

        Stany zasobowe są pominięte; ich pochodne zwraca ``norma_pochodnej_zasobowej``.
        """
        if self.uklad.dlugosc == 0:
            return 0.0
        pochodne = np.abs(self.pochodne(x, 0.0))[self._maska_stanow_szybkich()]
        if pochodne.size == 0:
            return 0.0
        return float(np.max(pochodne))

    def norma_pochodnej_zasobowej(self, x: NDArray[np.float64]) -> float:
        """``||f_zasobowe(x, y(x))||_inf`` — dryf zapasu energii, raportowany OSOBNO.

        Niezerowa wartość NIE jest błędem: magazyn oddający moc musi tracić SOC.
        Wartość jest w wyniku po to, żeby dryf dało się skonfrontować z bilansem
        energii, a nie po to, żeby go ukryć.
        """
        if self.uklad.dlugosc == 0:
            return 0.0
        pochodne = np.abs(self.pochodne(x, 0.0))[~self._maska_stanow_szybkich()]
        if pochodne.size == 0:
            return 0.0
        return float(np.max(pochodne))

    # -- symulacja ------------------------------------------------------------

    # -- siatka czasu ---------------------------------------------------------

    #: Tolerancja scalania bliskich chwil na siatce (ułamek kroku nominalnego).
    _TOLERANCJA_CZASU = 1.0e-9

    def siatka_czasu(self, czas_koncowy_s: float, harmonogram: HarmonogramZdarzen) -> list[float]:
        """Zbuduj siatkę czasu zawierającą DOKŁADNIE chwile zdarzeń i koniec.

        Pierwsza wersja tego silnika liczyła ``t = krok * dt`` i stosowała
        zdarzenie na NAJBLIŻSZYM PÓŹNIEJSZYM punkcie siatki, zapisując w śladzie
        czas NOMINALNY. Dla ``dt = 2 ms`` i zdarzenia w ``103 ms`` ślad mówił
        „103 ms", a model zmieniał się w ``104 ms``. Ta sama arytmetyka gubiła
        koniec symulacji: dla ``Tend = 1,003 s`` i ``dt = 5 ms`` przebieg kończył
        się w ``1,005 s``, choć wynik twierdził, że policzył zadany przedział.

        Oba są błędami ŚLADU, nie tylko dokładności: wynik twierdził coś, czego
        nie zrobił. Tutaj siatka jest sumą punktów nominalnych, chwil zdarzeń i
        dokładnego końca, więc krok bywa krótszy — i jest to jedyny sposób, żeby
        zapisany czas zdarzenia był czasem faktycznym.
        """
        if czas_koncowy_s <= 0.0:
            raise ValueError("czas_koncowy_s musi być dodatni")
        tol = self.krok_s * self._TOLERANCJA_CZASU

        obowiazkowe = {0.0, float(czas_koncowy_s)}
        for t_zdarzenia in harmonogram.czasy():
            if tol < t_zdarzenia < czas_koncowy_s - tol:
                obowiazkowe.add(float(t_zdarzenia))

        nominalne: list[float] = []
        krok = 1
        while krok * self.krok_s < czas_koncowy_s - tol:
            nominalne.append(krok * self.krok_s)
            krok += 1

        kandydaci = sorted(obowiazkowe | set(nominalne))
        obowiazkowe_posort = sorted(obowiazkowe)
        siatka: list[float] = []
        for t in kandydaci:
            if siatka and t - siatka[-1] <= tol:
                # Ta sama chwila co poprzednia — zostaw wersję OBOWIĄZKOWĄ.
                if any(abs(t - o) <= tol for o in obowiazkowe_posort):
                    siatka[-1] = t
                continue
            siatka.append(t)
        return siatka

    # -- symulacja ------------------------------------------------------------

    def _sprawdz_krok_wobec_dziedziny_urzadzen(self) -> None:
        """Krok biegu wobec DZIEDZINY WAŻNOŚCI zadeklarowanej przez urządzenia.

        PO CO (recenzja niezależna, P1-DELTA-27). Niezmiennik utrzymywany FIZYKĄ
        — przez zerowanie pochodnej na granicy — jest niezmiennikiem przepływu
        ŚCISŁEGO. Przepływ DYSKRETNY o kroku stałym dotrzymuje go tylko wtedy, gdy
        krok jest dostatecznie krótki wobec pasma, w którym pochodna maleje do
        zera. Przy kroku dłuższym całe pasmo zostaje przeskoczone w jednym skoku i
        okno przestaje obowiązywać — cicho, z przebiegiem wyglądającym poprawnie.

        Urządzenie, które ma taką granicę, deklaruje ją metodą
        ``krok_maksymalny_s``. Urządzenia bez tej metody nie są sprawdzane: brak
        deklaracji znaczy „ten model nie ma pasma, które da się przeskoczyć", a nie
        „nie sprawdzajmy". Kontrola jest więc OPT-IN po stronie modelu i nie
        wymaga, żeby silnik znał fizykę urządzeń.

        Zgłoszenie jest GŁOŚNE (wyjątek przed biegiem), a nie zapisem w wyniku:
        to jest odrzucenie WEJŚCIA — para (model, krok) leży poza dziedziną, dla
        której laboratorium cokolwiek obiecuje. Ta sama granica, co przy
        `_wejscie_zagadnienia_poczatkowego`.
        """
        naruszenia: list[str] = []
        for u in self.model.urzadzenia:
            metoda = getattr(u, "krok_maksymalny_s", None)
            if metoda is None:
                continue
            granica = float(metoda())
            if self.krok_s > granica:
                naruszenia.append(
                    f"{getattr(u, 'ref', '?')}: krok {self.krok_s:g} s przekracza "
                    f"granicę ważności {granica:.6g} s — przy tym kroku przepływ "
                    f"dyskretny przeskakuje pasmo, w którym pochodna maleje do zera, "
                    f"więc okno pracy przestaje być zbiorem niezmienniczym"
                )
        if naruszenia:
            raise KrokPozaDziedzinaError(
                "Krok biegu leży poza dziedziną ważności modelu:\n  - "
                + "\n  - ".join(naruszenia)
                + "\nSkróć krok albo zmień parametry urządzenia. Wynik policzony "
                "przy tym kroku wyglądałby wiarygodnie i nie dotrzymywał okna."
            )

    def _etykiety_stanow(self) -> tuple[str, ...]:
        """Nazwy WSZYSTKICH współrzędnych wektora stanu, w kolejności układu.

        JEDNO źródło nazw dla całego silnika: używa go zarówno lokalizacja
        defektu, jak i zapora skończoności po kroku. Dwie niezależne pętle
        budujące „tę samą" listę rozjeżdżają się przy pierwszym urządzeniu o
        nietypowym układzie stanów.
        """
        etykiety = [""] * self.uklad.dlugosc
        for u in self.model.urzadzenia:
            wycinek = self.uklad.wycinki[u.ref]  # type: ignore[attr-defined]
            for i, nazwa in enumerate(u.nazwy_stanow()):  # type: ignore[attr-defined]
                etykiety[wycinek.start + i] = f"{u.ref}.{nazwa}"  # type: ignore[attr-defined]
        return tuple(etykiety)

    def _stany_niesksonczone(self, x: NDArray[np.float64]) -> tuple[str, ...]:
        """Nazwy stanów, które przestały być skończone — adres defektu, nie flaga."""
        etykiety = self._etykiety_stanow()
        return tuple(etykiety[i] for i in range(self.uklad.dlugosc) if not np.isfinite(float(x[i])))

    @staticmethod
    def _wielkosc_niesksonczona(wyjatek: BaseException | None) -> str:
        """Nazwa wielkości, która utraciła skończoność — WPROST z wyjątku.

        Nie z komunikatu przez parsowanie i nie z osobnej mapy faz: `co` jest
        polem `WartoscNieskonczonaError`, więc jest to ta sama wartość, którą
        widać w komunikacie. Inne niepowodzenia (limit iteracji, osobliwa
        macierz) zwracają pusty napis, bo nie są utratą skończoności.
        """
        return str(getattr(wyjatek, "co", "") or "")

    def _etykiety_niesksonczone(
        self, wyjatek: BaseException | None, x: NDArray[np.float64]
    ) -> tuple[str, ...]:
        """Adres defektu: nazwy stanów, które NIE są skończone.

        JEDEN PREDYKAT NA DWÓCH ŹRÓDŁACH, nie dwa niezależne. Wartość niepoprawna
        może zostać wykryta w DWÓCH miejscach o różnym stanie wiedzy:

        * przy POCHODNEJ — wtedy ``x`` jest jeszcze skończony, a nazwy niesie
          wyjątek (``WartoscNieskonczonaError.etykiety``);
        * po KROKU — wtedy nazwy wynikają ze ``x``.

        Liczenie ich zawsze ze ``x`` (tak było do tej zmiany) zwracało pustą
        krotkę dla pierwszego przypadku, czyli gubiło lokalizację dokładnie tam,
        gdzie kontrola skończoności zadziałała najwcześniej.
        """
        etykiety = getattr(wyjatek, "etykiety", ())
        if etykiety:
            return tuple(etykiety)
        return self._stany_niesksonczone(x)

    def _szyny_niesksonczone(self, v: NDArray[np.complex128] | None) -> tuple[str, ...]:
        if v is None:
            return ()
        return tuple(
            szyna
            for szyna, i in self.model.topologia.indeks.items()
            if not np.isfinite(v[i].real) or not np.isfinite(v[i].imag)
        )

    def symuluj(
        self,
        x0: NDArray[np.float64],
        *,
        czas_koncowy_s: float,
        harmonogram: HarmonogramZdarzen | None = None,
    ) -> WynikDynamiczny:
        """Przeprowadź symulację i zwróć kandydat kontraktu wyniku.

        KAŻDY BIEG ZACZYNA OD STANU MODELU, NIE OD STANU POPRZEDNIEGO BIEGU.

        Defekt (P0, runda 3): silnik trzymał stan mutowalny MIĘDZY biegami.
        Zdarzenie wołało ``solver_sieci.ustaw_topologie(...)``, a ``symuluj``
        zerowało wyłącznie liczniki — więc topologia po ostatnim zdarzeniu i
        ostatnie zatwierdzone napięcia przechodziły do kolejnego biegu.

        ZMIERZONY SKUTEK (SMIB, rk4, dt=5 ms). Bieg B kończy się W TRAKCIE
        zwarcia, po nim bieg A BEZ ŻADNYCH ZDARZEŃ na zdrowej sieci:

            U_GEN(A po B)        = 0,3213 … 0,3374 p.u.
            U_GEN(A świeży)      = 1,0121 p.u.
            max|różnica|         = 6,908e-01 p.u.

        a wynik biegu A deklarował przy tym ``odcisk_topologii`` sieci ZDROWEJ,
        bo odcisk czytał ``self.model.topologia``, podczas gdy solver liczył na
        zmutowanej. Wynik nie był więc tylko błędny — twierdził, że policzył
        inną sieć niż policzył. Ten sam mechanizm wywrócił
        ``test_gfm_ogranicznik`` w CI (residuum 6,890e-01), choć lokalnie plik
        uruchamiany osobno przechodził: w pełnym biegu kolejność jest inna.

        Dla danego ``(model, wejście, scenariusz)`` wynik musi być funkcją
        WYŁĄCZNIE tych danych, a nie historii obiektu Pythona.

        ZAKRES RESETU JEST WĄSKI I TO JEST ISTOTNE. Przywracamy topologię modelu
        oraz ziarno Newtona Z ROZPŁYWU TEJ INICJALIZACJI (`_v_startowe`), a nie
        „nic". Pierwsza wersja tej naprawy zerowała ziarno do ``None``, czyli
        wyrzucała też wynik rozpływu — i tym samym zamieniała start z punktu
        pracy na start płaski. Skutek był zmierzony:
        ``test_ogranicznik_nieaktywny_nie_zmienia_ani_jednej_probki`` przestawał
        przechodzić, bo dłuższa droga Newtona nagłaśniała różnicę zaokrągleń
        między ścieżką z ogranicznikiem a bez niego, choć ogranicznik nigdy nie
        wchodził w nasycenie. Reset ma usuwać stan POPRZEDNIEGO BIEGU, a nie
        dane wyprowadzone z wejścia TEGO biegu.

        MECHANIZM PRZEJŚCIOWY, NIE DOCELOWY: bieg dostaje własną KOPIĘ topologii
        i własne ziarno. Docelowo model powinien być niemutowalny, a stan biegu —
        osobnym obiektem (`RunState`); to jest decyzja architektoniczna dla
        właściciela.
        """
        harmonogram = harmonogram or HarmonogramZdarzen([])
        self._sprawdz_krok_wobec_dziedziny_urzadzen()
        self._ewaluacje = 0
        self._maks_residuum = 0.0
        self._maks_iteracji_sieci = 0
        self._v_zatwierdzone = None if self._v_startowe is None else self._v_startowe.copy()
        self.solver_sieci.ustaw_topologie(self._kopia_topologii_modelu())
        # WEJSCIE ZAGADNIENIA POCZATKOWEGO LICZONE TUTAJ, NIE PRZY BUDOWIE WYNIKU.
        # `y(0) = V0` jest warunkiem POCZATKOWYM, wiec musi powstac na topologii
        # STARTOWEJ w chwili t = 0. Pierwsza wersja (commit e3756aa6) liczyla je
        # dopiero przy skladaniu wyniku — czyli PO petli zdarzen, gdy solver
        # trzyma topologie pozwarciowa. Bylo to bledne semantycznie (V0 innej
        # sieci niz start) i wywracalo bieg: rozwiazanie sieci przy x0 na
        # topologii zwarciowej rozjezdza sie, a `BrakZbieznosciSieciError`
        # WYCIEKAL z `symuluj()` zamiast trafic do `diagnostyka.blad`.
        # Zmierzone: `test_zwarcie_bliskie_metalicznemu_lamie_nasycenie_a_nie_
        # impedancje` padal z residuum 3,090e+00.
        # GRANICA MIĘDZY „WYJĄTEK" A „BŁĄD W WYNIKU" — jeden predykat, jedno miejsce.
        #
        # Pytanie rozstrzygające brzmi: CZY ZAGADNIENIE POCZĄTKOWE W OGÓLE ISTNIEJE?
        # Odpowiada na nie wyznaczenie `y(0) = V0` poniżej i nikt inny:
        #
        #   * `x0` albo `y0` NIE DAJĄ SIĘ WYZNACZYĆ (algebra sieci rozbieżna,
        #     wstrzyknięcie albo napięcie niepoprawne) -> nie ma zagadnienia, więc
        #     nie ma biegu ANI wyniku, który mógłby cokolwiek zaraportować. To jest
        #     odrzucenie WEJŚCIA i wychodzi WYJĄTKIEM, tak samo jak scenariusz
        #     nieobsługiwany (`NieobslugiwaneZdarzenieError`);
        #   * zagadnienie ISTNIEJE, ale rozwiązania nie da się kontynuować (pochodna
        #     niepoprawna, Newton rozbieżny, krok wywrócony) -> bieg RUSZA i melduje
        #     przyczynę w `diagnostyka.blad`, z fazą, chwilą, krokiem i adresem stanu.
        #
        # Bez tej granicy ta sama sytuacja — wartość nieskończona w trakcie biegu —
        # wracała do wołającego dwiema drogami zależnie od tego, KTÓRA wielkość ją
        # niosła: wyjątkiem dla prądu i napięcia, wynikiem dla pochodnej. Konsument
        # musiałby obsłużyć obie, a każdy, kto obsłuży jedną, ma cichy defekt.
        wejscie_zagadnienia = self._wejscie_zagadnienia_poczatkowego(x0)

        # NORMA POCHODNEJ W t0 JEST POMIAREM DIAGNOSTYCZNYM, NIE WARUNKIEM BIEGU.
        # Gdy pochodna w punkcie startowym nie jest liczbą skończoną, nie ma
        # czego zmierzyć — i to jest `None`, a nie `0.0` ani `NaN`. Zero byłoby
        # FABRYKACJĄ („start w idealnej równowadze"), NaN wywracałby kontrakt
        # diagnostyki, a wyjątek wyciekający z `symuluj()` odbierałby wynikowi
        # jedyne miejsce, w którym przyczyna daje się zapisać (ten sam defekt,
        # co udokumentowany wyżej wyciek `BrakZbieznosciSieciError`).
        # Bieg mimo to RUSZA: pierwszy krok pętli natrafi na tę samą wartość i
        # zbuduje `BladSolvera` z kompletem kontekstu — fazą, chwilą, krokiem i
        # nazwą stanu. Jeden błąd, jedno miejsce, pełny adres.
        try:
            norma_t0: float | None = self.norma_pochodnej(x0)
        except WartoscNieskonczonaError:
            norma_t0 = None
        siatka = self.siatka_czasu(czas_koncowy_s, harmonogram)
        n_krokow = len(siatka) - 1
        kroki_skrocone = sum(
            1
            for a, b in zip(siatka[:-1], siatka[1:], strict=True)
            if abs((b - a) - self.krok_s) > self.krok_s * self._TOLERANCJA_CZASU
        )

        integrator_biegu, dziennik_rzutowan = self._integrator_biegu()
        sprawozdania: list[WynikKrokuNieliniowego] = []
        zbieracz = ZbieraczPrzebiegow()
        zastosowane: list[dict[str, object]] = []
        topologia = self.model.topologia
        x = x0.astype(np.float64).copy()
        czasy: list[float] = []
        blad: BladSolvera | None = None
        v: NDArray[np.complex128] | None = None
        t = siatka[0]

        for krok, t in enumerate(siatka):
            # SEMANTYKA CHWILI ZERO (poprawka E2 audytu). Wektor `x0` opisuje stan
            # 0-, czyli PRZED zdarzeniem. Zdarzenia o czasie 0 stosowane są tutaj,
            # PRZED pierwszym rozwiązaniem algebraicznym, więc próbka zapisana dla
            # t = 0 opisuje stan 0+ — sieć już po zmianie topologii.
            #
            # Poprzednia wersja gubiła je BEZ ŚLADU: `siatka_czasu` odrzucała
            # chwilę 0 warunkiem `tol < t_zdarzenia`, a pętla pytała
            # `do_chwili(siatka[krok-1], t)` dopiero od kroku 1, na przedziale
            # otwartym od lewej. Zwarcie zadane na t = 0 nie zmieniało więc ani
            # topologii, ani wyniku, a harmonogram nadal je wymieniał — wynik
            # opisywał scenariusz, którego nie policzył.
            nowe = (
                harmonogram.do_chwili(siatka[krok - 1], t) if krok else harmonogram.w_chwili_zero()
            )
            for zdarzenie in nowe:
                topologia = zdarzenie.zastosuj(topologia)
                self.solver_sieci.ustaw_topologie(topologia)
                zastosowane.append(
                    {
                        "czas_s": zdarzenie.czas_s,
                        "czas_zastosowania_s": t,
                        "blad_czasu_s": abs(t - zdarzenie.czas_s),
                        "opis": zdarzenie.opis,
                        "typ": type(zdarzenie).__name__,
                    }
                )
            try:
                v = self.rozwiaz_siec(x)
            except Exception as wyjatek:  # noqa: BLE001 - zapisujemy PRZYCZYNĘ
                blad = BladSolvera(
                    klasa=type(wyjatek).__name__,
                    komunikat=str(wyjatek),
                    faza="algebra_sieci",
                    czas_s=t,
                    krok_s=(siatka[krok] - siatka[krok - 1]) if krok else 0.0,
                    numer_kroku=krok,
                    residuum_sieci=self._maks_residuum,
                    stan_skonczony=bool(np.all(np.isfinite(x))),
                    stany_niesksonczone=self._etykiety_niesksonczone(wyjatek, x),
                    szyny_niesksonczone=self._szyny_niesksonczone(v),
                    wielkosc_niesksonczona=self._wielkosc_niesksonczona(wyjatek),
                )
                break
            self.zatwierdz_punkt_pracy(v)
            if krok % self.probkowanie_co == 0 or krok == n_krokow:
                czasy.append(t)
                self._zapisz_probki(zbieracz, x, v)
            if krok == n_krokow:
                break
            dt = siatka[krok + 1] - t
            try:
                # KROK ZE SPRAWOZDANIEM, NIE SAM KROK. Bez sprawozdania wynik nie
                # miał jak odróżnić kroku, który osiągnął żądaną tolerancję, od
                # kroku zatrzymanego na podłodze numerycznej — jądro Newtona
                # zwracało obie drogi tą samą wartością.
                x, sprawozdanie = integrator_biegu.krok_ze_sprawozdaniem(self.pochodne, x, t, dt)
                sprawozdania.append(sprawozdanie)
                # ZAPORA POSTKROKOWA W TYM SAMYM `try`, NIE OBOK NIEGO.
                # Integratory z rejestru sprawdzają skończoność same, więc dla nich
                # ta linia nigdy nie zadziała. Zadziała dla integratora WŁASNEGO,
                # wstrzykniętego obiektem — i wtedy musi dać wynik NIEODRÓŻNIALNY
                # od wykrycia w źródle. Poprzednia wersja budowała tu drugi obiekt
                # `BladSolvera` z WYMYŚLONĄ nazwą klasy „NieskonczonyStanError",
                # która nie odpowiadała żadnemu wyjątkowi w kodzie: ten sam stan
                # świata miał więc dwie różne nazwy zależnie od tego, kto go
                # zauważył pierwszy (reguła KLASA, NIE INSTANCJA — jedno zjawisko,
                # jedna nazwa).
                wymagaj_skonczonosci(
                    x,
                    co="stan po kroku",
                    gdzie=f"zapora integratora {integrator_biegu.nazwa}",
                    etykiety=self._etykiety_stanow(),
                )
            except Exception as wyjatek:  # noqa: BLE001 - zapisujemy PRZYCZYNĘ
                blad = BladSolvera(
                    klasa=type(wyjatek).__name__,
                    komunikat=str(wyjatek),
                    faza="calkowanie",
                    czas_s=t,
                    krok_s=dt,
                    numer_kroku=krok,
                    residuum_sieci=self._maks_residuum,
                    stan_skonczony=bool(np.all(np.isfinite(x))),
                    stany_niesksonczone=self._etykiety_niesksonczone(wyjatek, x),
                    szyny_niesksonczone=self._szyny_niesksonczone(v),
                    wielkosc_niesksonczona=self._wielkosc_niesksonczona(wyjatek),
                )
                break

        diagnostyka = DiagnostykaSolvera(
            integrator=integrator_biegu.nazwa,
            krok_s=self.krok_s,
            liczba_krokow=n_krokow,
            ewaluacje_pochodnych=self._ewaluacje,
            maks_residuum_sieci=self._maks_residuum,
            maks_iteracji_sieci=self._maks_iteracji_sieci,
            zbiegl=blad is None,
            norma_pochodnej_w_t0=norma_t0,
            blad=blad,
            czas_zadany_s=float(czas_koncowy_s),
            czas_osiagniety_s=czasy[-1] if czasy else 0.0,
            kompletnosc=(
                KompletnoscPrzebiegu.PELNY
                if blad is None
                else KompletnoscPrzebiegu.PRZERWANY_BLEDEM
            ),
            kroki_skrocone=kroki_skrocone,
            kroki_scisle_zbiezne=sum(1 for s in sprawozdania if s.strict_convergence),
            kroki_na_podlodze_numerycznej=sum(1 for s in sprawozdania if not s.strict_convergence),
            najgorsze_rho=max((s.rho for s in sprawozdania), default=0.0),
            rzutowania_stanu=(
                ()
                if dziennik_rzutowan is None
                else tuple(
                    RzutowanieStanu(
                        chwila_s=z.chwila_s,
                        indeks=z.indeks,
                        nazwa=z.nazwa,
                        znaczenie=z.znaczenie,
                        wartosc_przed=z.wartosc_przed,
                        wartosc_po=z.wartosc_po,
                        granica=z.granica,
                    )
                    for z in dziennik_rzutowan.zapisy
                )
            ),
            niezmienniki_stanu_egzekwowane=len(self.ograniczenia_stanu),
        )
        return WynikDynamiczny(
            kontrakt=KONTRAKT,
            czas_s=tuple(czasy),
            sygnaly=zbieracz.sygnaly(),
            modele=self._tozsamosci(),
            zdarzenia=tuple(zastosowane),
            diagnostyka=diagnostyka,
            odcisk_scenariusza=self._odcisk_scenariusza(
                czas_koncowy_s, harmonogram, wejscie_zagadnienia, integrator_biegu
            ),
            odcisk_topologii=self._odcisk_topologii(),
            odcisk_implementacji=odcisk_implementacji(),
        )

    def _zapisz_probki(
        self,
        zbieracz: ZbieraczPrzebiegow,
        x: NDArray[np.float64],
        v: NDArray[np.complex128],
    ) -> None:
        zbieracz.rozpocznij_probke()
        idx = self.model.topologia.indeks
        for szyna in self.model.topologia.szyny:
            zbieracz.dodaj(
                "u_pu",
                abs(v[idx[szyna]]),
                element_ref=szyna,
                etykieta_pl="Napięcie",
                jednostka="p.u.",
                przestrzen=PrzestrzenSygnalu.WYJSCIE,
            )
            # KĄT NAPIĘCIA — bez niego wyniku NIE DA SIĘ PODWAŻYĆ. Kontrakt
            # deklaruje, że wynik ma dać się odtworzyć i obalić, a z samych
            # modułów napięć nie odtworzy się ani rozpływu mocy w gałęziach, ani
            # bilansu mocy, ani prawa prądowego Kirchhoffa: wszystkie trzy
            # wymagają FAZY. Kąt jest w ramie sieci, ta sama konwencja co
            # `konwencje` (rama wirująca synchronicznie).
            zbieracz.dodaj(
                "u_kat_rad",
                float(np.angle(v[idx[szyna]])),
                element_ref=szyna,
                etykieta_pl="Kąt napięcia",
                jednostka="rad",
                przestrzen=PrzestrzenSygnalu.WYJSCIE,
            )
        for u in self.model.urzadzenia:
            wycinek = self.uklad.wycinki[u.ref]  # type: ignore[attr-defined]
            v_szyny = complex(v[idx[u.szyna]])  # type: ignore[attr-defined]
            i = u.wstrzykniecie(x[wycinek], v_szyny)  # type: ignore[attr-defined]
            s = v_szyny * np.conj(i)
            ref = u.ref  # type: ignore[attr-defined]
            zbieracz.dodaj(
                "p_pu",
                s.real,
                element_ref=ref,
                etykieta_pl="Moc czynna",
                jednostka="p.u.",
                przestrzen=PrzestrzenSygnalu.WYJSCIE,
            )
            zbieracz.dodaj(
                "q_pu",
                s.imag,
                element_ref=ref,
                etykieta_pl="Moc bierna",
                jednostka="p.u.",
                przestrzen=PrzestrzenSygnalu.WYJSCIE,
            )
            zbieracz.dodaj(
                "i_pu",
                abs(i),
                element_ref=ref,
                etykieta_pl="Prąd",
                jednostka="p.u.",
                przestrzen=PrzestrzenSygnalu.WYJSCIE,
            )
            jednostki = jednostki_stanow(u)
            for nazwa, wartosc, jednostka in zip(
                u.nazwy_stanow(),  # type: ignore[attr-defined]
                x[wycinek],
                jednostki,
                strict=True,
            ):
                zbieracz.dodaj(
                    nazwa,
                    float(wartosc),
                    element_ref=ref,
                    etykieta_pl=nazwa,
                    jednostka=jednostka,
                    przestrzen=PrzestrzenSygnalu.STAN,
                )
                if nazwa == "omega_pu":
                    zbieracz.dodaj(
                        "f_hz",
                        czestotliwosc_hz(float(wartosc)),
                        element_ref=ref,
                        etykieta_pl="Częstotliwość",
                        jednostka="Hz",
                        przestrzen=PrzestrzenSygnalu.WYJSCIE,
                    )

    def _zbierz_ograniczniki(self) -> tuple[OgraniczenieStanu, ...]:
        """Ograniczniki stanu WSZYSTKICH urządzeń, przeliczone na indeksy globalne.

        KLASA, NIE INSTANCJA. Nie ma tu listy klas ani mapy „nazwa stanu ->
        granica": pytamy KAŻDE urządzenie, czy deklaruje ograniczniki, i podajemy
        mu jego przesunięcie w wektorze globalnym. Nowy model wnosi swoje granice
        samym zadeklarowaniem metody — nie trzeba dopisywać niczego tutaj, więc
        nie ma jak o nim zapomnieć.

        Urządzenie, które metody nie ma, nie deklaruje nic. To jest odpowiedź
        UCZCIWA, nie domyślnie łagodna: brak deklaracji znaczy „ten model nie ma
        ograniczników", a nie „ograniczniki są, tylko ich nie znamy". Modele bez
        granic stałych (`FalownikGFM` — moce filtrowane śledzą MIERZONE
        wstrzyknięcie, którego kres ``|V|·i_max`` nie jest stały;
        `MaszynaSynchroniczna4Rzedu` — brak ogranicznika urządzenia;
        `MaszynaDwustronnieZasilana3Rzedu` — przekształtnik nasyca NAPIĘCIE
        wirnika, czyli wejście, a nie stan) nie deklarują jej świadomie.
        """
        zebrane: list[OgraniczenieStanu] = []
        for u in self.model.urzadzenia:
            deklaracja = getattr(u, "ograniczniki_stanu", None)
            if deklaracja is None:
                continue
            wycinek = self.uklad.wycinki[u.ref]  # type: ignore[attr-defined]
            for ogr in deklaracja(wycinek.start):
                if not wycinek.start <= ogr.indeks < wycinek.stop:
                    raise ValueError(
                        f"{u.ref}: ogranicznik „{ogr.nazwa}” wskazuje indeks "  # type: ignore[attr-defined]
                        f"{ogr.indeks} poza własnym wycinkiem "
                        f"[{wycinek.start}, {wycinek.stop}) — urządzenie ograniczałoby "
                        "stan cudzego modelu."
                    )
                zebrane.append(ogr)
        return tuple(zebrane)

    def _integrator_biegu(self) -> tuple[Integrator, DziennikRzutowan | None]:
        """Integrator TEGO biegu + jego własny dziennik rzutowań.

        Dziennik powstaje NA BIEG, nie na silnik: wspólny dziennik przenosiłby
        rzutowania z poprzedniej symulacji do następnej, czyli dokładnie ta
        zależność od historii obiektu, którą usuwa `symuluj`.
        """
        if not self.ograniczenia_stanu:
            return self.integrator, None
        dziennik = DziennikRzutowan()
        return (
            z_niezmiennikami(self.integrator, self.ograniczenia_stanu, dziennik=dziennik),
            dziennik,
        )

    def _kopia_topologii_modelu(self) -> TopologiaSieci:
        """Świeża, niezależna kopia topologii modelu na potrzeby JEDNEGO biegu.

        ``dataclasses.replace`` nie wystarcza: ``TopologiaSieci`` niesie listy i
        słownik, które zostałyby WSPÓŁDZIELONE z modelem, więc zdarzenie
        w jednym biegu mutowałoby definicję modelu widzianą przez następny.
        """
        t = self.model.topologia
        return replace(
            t,
            galezie=list(t.galezie),
            boczniki=list(t.boczniki),
            szyny_sztywne=dict(t.szyny_sztywne),
        )

    def _odcisk_topologii(self) -> str:
        """Odcisk topologii — KOMPLET tego, co wchodzi do ``Ybus``, plus baza mocy.

        Poprzednia wersja składała ręcznie szyny i gałęzie, więc była ślepa na
        boczniki (bateria kondensatorów!), szyny sztywne i bazę mocy. Dwie sieci
        o RÓŻNYCH macierzach ``Ybus`` dostawały ten sam odcisk topologii, czyli
        wynik twierdził, że policzono tę samą sieć. Inwariant „różne Ybus =>
        różne odciski" jest przypięty w ``test_tozsamosc.py``.
        """
        return odcisk_topologii(self.model.topologia, s_bazowa_mva=self.model.s_bazowa_mva)

    def _wejscie_zagadnienia_poczatkowego(self, x0: NDArray[np.float64]) -> dict[str, object]:
        """Liczbowe WEJŚCIE zagadnienia początkowego: dyspozycja, ``x0``, ``V0``.

        Symulacja dynamiczna rozwiązuje

            ẋ = f(x, y, p, u, t),   0 = g(x, y, p, u, t),   x(0)=x₀, y(0)=y₀

        więc bieg jest wyznaczony dopiero przez KOMPLET tych danych. Poprzednia
        wersja odcisku scenariusza znała topologię, konfigurację solvera,
        horyzont i harmonogram — ale ani dyspozycji, ani ``x0``, ani ``V0``. Ta
        sama sieć przy ``P_G = 0,2`` i ``P_G = 0,9`` dawała więc TEN SAM odcisk,
        choć to dwa różne zagadnienia dynamiczne.

        NASTAWY PUNKTU PRACY CZYTANE Z URZĄDZEŃ, NIE Z PAMIĘCI INICJALIZACJI.
        ``dyspozycja`` to moce zadane w chwili ``inicjalizuj``; ``nastawy`` to
        wartości OBOWIĄZUJĄCE TERAZ (``V_ref`` wzbudnicy, ``P_zadane``
        elektrowni, ``E_ref`` falownika GFM). Rozróżnienie nie jest formalne:
        scenariusz „limit eksportu zaczyna wiązać" zmienia
        ``RegulatorElektrowniPPC.p_zadane_pu`` PO inicjalizacji, więc wartość
        zapamiętana przy starcie nie opisuje biegu, który się wykona.

        Nastawy wypadły z tożsamości MODELU (patrz `RolaPola.NASTAWA_PUNKTU_PRACY`),
        bo inaczej inicjalizacja zmieniałaby model. Ta sama deklaracja przy polu
        wprowadza je TUTAJ — jedno źródło prawdy dla obu skutków, więc nie da się
        wypaść z modelu i nie wejść do biegu.

        Wartości zaokrąglone do 12 cyfr znaczących, żeby odcisk nie zmieniał się
        od ostatniego bitu reprezentacji przy tym samym zagadnieniu.
        """

        def _l(wartosc: float) -> float:
            return float(f"{float(wartosc):.12e}")

        v0 = self.rozwiaz_siec(x0)
        return {
            "dyspozycja": {
                ref: [_l(moc.real), _l(moc.imag)] for ref, moc in sorted(self._moce_zadane.items())
            },
            "nastawy": {
                u.ref: nastawy_punktu_pracy(u)  # type: ignore[attr-defined]
                for u in sorted(
                    self.model.urzadzenia,
                    key=lambda u: u.ref,  # type: ignore[attr-defined,no-any-return]
                )
            },
            "x0": [_l(v) for v in np.asarray(x0, dtype=np.float64).tolist()],
            "v0": [[_l(v.real), _l(v.imag)] for v in np.asarray(v0).tolist()],
        }

    def _odcisk_scenariusza(
        self,
        czas_koncowy_s: float,
        harmonogram: HarmonogramZdarzen,
        wejscie_zagadnienia: dict[str, object],
        integrator_biegu: Integrator,
    ) -> str:
        """Odcisk scenariusza — razem z MIGAWKĄ wejścia i nastawami solvera.

        Poprzednia wersja brała ``{zdarzenia, krok_s, czas_koncowy_s, integrator}``,
        więc ten sam harmonogram policzony na INNEJ sieci miał ten sam odcisk
        scenariusza. To jest dokładnie luka, przed którą odcisk ma chronić:
        pozwalała podstawić pod jeden scenariusz bieg z innego wejścia.
        """
        return TozsamoscScenariusza(
            odcisk_migawki=self._odcisk_topologii(),
            # Punkt pracy biegu laboratoryjnego nie jest tu znany jako wielkość
            # normatywna (SCR/rodzaj zdarzenia są interpretacją, nie wejściem
            # solvera), więc pozostaje NIEZNANY — a `PunktPracy` traktuje `None`
            # jako „nie wiadomo", nie „dowolne". Wypełnia go warstwa, która wie:
            # rejestr dowodów przy budowie `PrzypadekWalidacji`.
            punkt_pracy=PunktPracy(),
            konfiguracja=KonfiguracjaSolvera(
                # NAZWA TEGO, CO SIĘ WYKONAŁO, nie tego, co wpisano w konstruktorze.
                # Bieg z egzekwowanymi niezmiennikami stanu nazywa się
                # „<metoda>+niezmienniki" i jest INNYM biegiem numerycznie — odcisk
                # scenariusza musi je rozróżniać, bo rzutowanie zmienia trajektorię.
                integrator=integrator_biegu.nazwa,
                krok_s=self.krok_s,
                tolerancja_sieci=self.solver_sieci.tolerancja,
                tolerancja_rownowagi=self.tolerancja_rownowagi,
                maks_iteracji_sieci=self.solver_sieci.maks_iteracji,
                probkowanie_co=self.probkowanie_co,
                dopuszczaj_zastoj=bool(getattr(self.integrator, "dopuszczaj_zastoj", False)),
            ),
            czas_koncowy_s=float(czas_koncowy_s),
            harmonogram=tuple(harmonogram.zdarzenia),
            parametry=wejscie_zagadnienia,
        ).odcisk

    def _tozsamosci(self) -> tuple[TozsamoscModelu, ...]:
        """Tożsamości modeli — z REKURENCYJNEJ postaci kanonicznej, nie z pól skalarnych.

        Poprzednia wersja budowała odcisk z ``vars(u)`` odsianych do typów
        skalarnych plus RĘCZNIE doklejonego ``getattr(u, "maszyna")``. Była więc
        ślepa na wszystko, co siedzi w obiekcie zagnieżdżonym poza tym jednym
        wyjątkiem: AVR, governor, PLL, ogranicznik GFM, moduły PPC, parametry
        BESS. Zmiana stałej regulatora napięcia z ``k_a = 200`` na ``400`` dawała
        TEN SAM odcisk — czyli dwa fizycznie różne biegi były dla wyniku
        nierozróżnialne.

        Teraz liczy to ``tozsamosc.odcisk_parametrow_urzadzenia``, który schodzi
        rekurencyjnie po ``dataclasses.fields()``. Nowy model nie wymaga
        dopisania gałęzi — a artefakty runtime są z odcisku wyłączane DEKLARACJĄ
        przy polu, nie zgadywaniem po nazwie.
        """
        wynik = []
        for u in self.model.urzadzenia:
            wynik.append(
                TozsamoscModelu(
                    element_ref=u.ref,  # type: ignore[attr-defined]
                    klasa_modelu=type(u).__name__,
                    liczba_stanow=len(u.nazwy_stanow()),  # type: ignore[attr-defined]
                    nazwy_stanow=tuple(u.nazwy_stanow()),  # type: ignore[attr-defined]
                    odcisk_parametrow=odcisk_kanoniczny(u),
                )
            )
        return tuple(wynik)
