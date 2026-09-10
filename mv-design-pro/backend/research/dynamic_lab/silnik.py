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

from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray

from dynamic_lab.calkowanie import INTEGRATORY, Integrator
from dynamic_lab.konwencje import czestotliwosc_hz
from dynamic_lab.siec import SolverSieci, TopologiaSieci
from dynamic_lab.wynik import (
    KONTRAKT,
    DiagnostykaSolvera,
    TozsamoscModelu,
    WynikDynamiczny,
    ZbieraczPrzebiegow,
    odcisk,
)
from dynamic_lab.zdarzenia import HarmonogramZdarzen


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
        probkowanie_co: int = 1,
    ) -> None:
        self.model = model
        self.integrator = (
            INTEGRATORY[integrator] if isinstance(integrator, str) else integrator
        )
        self.krok_s = krok_s
        self.tolerancja_rownowagi = tolerancja_rownowagi
        self.probkowanie_co = max(1, probkowanie_co)
        self.solver_sieci = SolverSieci(model.topologia, tolerancja=tolerancja_sieci)
        self.uklad = UkladStanu.zbuduj(model.urzadzenia)
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

    # -- warstwa algebraiczna -------------------------------------------------

    def _wstrzykniecia(self, x: NDArray[np.float64]):
        idx = self.model.topologia.indeks

        def funkcja(v: NDArray[np.complex128]) -> NDArray[np.complex128]:
            i = np.zeros(len(v), dtype=np.complex128)
            for u in self.model.urzadzenia:
                wycinek = self.uklad.wycinki[u.ref]  # type: ignore[attr-defined]
                i[idx[u.szyna]] += u.wstrzykniecie(  # type: ignore[attr-defined]
                    x[wycinek], complex(v[idx[u.szyna]])
                )
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
                dx[wycinek] = u.pochodne(  # type: ignore[attr-defined]
                    x[wycinek], complex(v[idx[u.szyna]])
                )
        return dx

    # -- inicjalizacja --------------------------------------------------------

    def rozplyw_ustalony(
        self, moce_zadane: dict[str, complex]
    ) -> NDArray[np.complex128]:
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
        return wynik.napiecia

    def _urzadzenie(self, ref: str) -> object:
        for u in self.model.urzadzenia:
            if u.ref == ref:  # type: ignore[attr-defined]
                return u
        raise KeyError(f"Nieznane urządzenie {ref}")

    def inicjalizuj(self, moce_zadane: dict[str, complex]) -> NDArray[np.float64]:
        """Pełna inicjalizacja: rozpływ → punkt pracy urządzeń → stany regulatorów.

        Po inicjalizacji weryfikuje ``||f(x0, y0)|| <= tolerancja_rownowagi`` i
        podnosi ``RownowagaNieosiagnietaError``, jeśli warunek nie zachodzi.
        """
        v0 = self.rozplyw_ustalony(moce_zadane)
        idx = self.model.topologia.indeks
        x0 = np.zeros(self.uklad.dlugosc, dtype=np.float64)
        for u in self.model.urzadzenia:
            wycinek = self.uklad.wycinki[u.ref]  # type: ignore[attr-defined]
            if wycinek.stop == wycinek.start:
                continue
            s = moce_zadane.get(u.ref, 0j)  # type: ignore[attr-defined]
            x0[wycinek] = u.inicjalizuj(  # type: ignore[attr-defined]
                complex(v0[idx[u.szyna]]), s
            )
        norma = self.norma_pochodnej(x0)
        if norma > self.tolerancja_rownowagi:
            raise RownowagaNieosiagnietaError(
                f"||f(x0,y0)|| = {norma:.3e} > {self.tolerancja_rownowagi:.1e}. "
                "Punkt startowy nie jest równowagą — przebieg byłby artefaktem rozruchu."
            )
        return x0

    def norma_pochodnej(self, x: NDArray[np.float64]) -> float:
        """``||f(x, y(x))||_inf`` — miara oddalenia od równowagi."""
        if self.uklad.dlugosc == 0:
            return 0.0
        return float(np.max(np.abs(self.pochodne(x, 0.0))))

    # -- symulacja ------------------------------------------------------------

    def symuluj(
        self,
        x0: NDArray[np.float64],
        *,
        czas_koncowy_s: float,
        harmonogram: HarmonogramZdarzen | None = None,
    ) -> WynikDynamiczny:
        """Przeprowadź symulację i zwróć kandydat kontraktu wyniku."""
        harmonogram = harmonogram or HarmonogramZdarzen([])
        self._ewaluacje = 0
        self._maks_residuum = 0.0
        self._maks_iteracji_sieci = 0

        norma_t0 = self.norma_pochodnej(x0)
        n_krokow = max(1, int(round(czas_koncowy_s / self.krok_s)))
        zbieracz = ZbieraczPrzebiegow()
        zastosowane: list[dict[str, object]] = []
        topologia = self.model.topologia
        x = x0.astype(np.float64).copy()
        czasy: list[float] = []
        zbiegl = True

        for krok in range(n_krokow + 1):
            t = krok * self.krok_s
            nowe = harmonogram.do_chwili(t - self.krok_s, t) if krok else []
            for zdarzenie in nowe:
                topologia = zdarzenie.zastosuj(topologia)
                self.solver_sieci.ustaw_topologie(topologia)
                zastosowane.append(
                    {
                        "czas_s": zdarzenie.czas_s,
                        "opis": zdarzenie.opis,
                        "typ": type(zdarzenie).__name__,
                    }
                )
            v = self.rozwiaz_siec(x)
            self.zatwierdz_punkt_pracy(v)
            if krok % self.probkowanie_co == 0 or krok == n_krokow:
                czasy.append(t)
                self._zapisz_probki(zbieracz, x, v)
            if krok == n_krokow:
                break
            try:
                x, _ = self.integrator.krok(self.pochodne, x, t, self.krok_s)
            except Exception:  # noqa: BLE001 - zachowujemy dowód niepowodzenia
                zbiegl = False
                break

        diagnostyka = DiagnostykaSolvera(
            integrator=self.integrator.nazwa,
            krok_s=self.krok_s,
            liczba_krokow=n_krokow,
            ewaluacje_pochodnych=self._ewaluacje,
            maks_residuum_sieci=self._maks_residuum,
            maks_iteracji_sieci=self._maks_iteracji_sieci,
            zbiegl=zbiegl,
            norma_pochodnej_w_t0=norma_t0,
        )
        return WynikDynamiczny(
            kontrakt=KONTRAKT,
            czas_s=tuple(czasy),
            sygnaly=zbieracz.sygnaly(),
            modele=self._tozsamosci(),
            zdarzenia=tuple(zastosowane),
            diagnostyka=diagnostyka,
            odcisk_scenariusza=odcisk(
                {
                    "zdarzenia": zastosowane,
                    "krok_s": self.krok_s,
                    "czas_koncowy_s": czas_koncowy_s,
                    "integrator": self.integrator.nazwa,
                }
            ),
            odcisk_topologii=odcisk(
                {
                    "szyny": list(self.model.topologia.szyny),
                    "galezie": [
                        [
                            g.od_szyny,
                            g.do_szyny,
                            g.r_pu,
                            g.x_pu,
                            g.b_poprzeczna_pu,
                            g.zalaczona,
                        ]
                        for g in self.model.topologia.galezie
                    ],
                }
            ),
        )

    def _zapisz_probki(
        self,
        zbieracz: ZbieraczPrzebiegow,
        x: NDArray[np.float64],
        v: NDArray[np.complex128],
    ) -> None:
        idx = self.model.topologia.indeks
        for szyna in self.model.topologia.szyny:
            zbieracz.dodaj(
                "u_pu",
                abs(v[idx[szyna]]),
                element_ref=szyna,
                etykieta_pl="Napięcie",
                jednostka="p.u.",
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
            )
            zbieracz.dodaj(
                "q_pu",
                s.imag,
                element_ref=ref,
                etykieta_pl="Moc bierna",
                jednostka="p.u.",
            )
            zbieracz.dodaj(
                "i_pu", abs(i), element_ref=ref, etykieta_pl="Prąd", jednostka="p.u."
            )
            for nazwa, wartosc in zip(
                u.nazwy_stanow(), x[wycinek], strict=True  # type: ignore[attr-defined]
            ):
                zbieracz.dodaj(
                    nazwa,
                    float(wartosc),
                    element_ref=ref,
                    etykieta_pl=nazwa,
                    jednostka="p.u./rad",
                )
                if nazwa == "omega_pu":
                    zbieracz.dodaj(
                        "f_hz",
                        czestotliwosc_hz(float(wartosc)),
                        element_ref=ref,
                        etykieta_pl="Częstotliwość",
                        jednostka="Hz",
                    )

    def _tozsamosci(self) -> tuple[TozsamoscModelu, ...]:
        wynik = []
        for u in self.model.urzadzenia:
            parametry = {
                k: v
                for k, v in vars(u).items()
                if isinstance(v, int | float | str | bool) and not k.startswith("_")
            }
            wewnetrzny = getattr(u, "maszyna", None)
            if wewnetrzny is not None:
                parametry |= {
                    f"maszyna.{k}": v
                    for k, v in vars(wewnetrzny).items()
                    if isinstance(v, int | float | str | bool)
                }
            wynik.append(
                TozsamoscModelu(
                    element_ref=u.ref,  # type: ignore[attr-defined]
                    klasa_modelu=type(u).__name__,
                    liczba_stanow=len(u.nazwy_stanow()),  # type: ignore[attr-defined]
                    nazwy_stanow=tuple(u.nazwy_stanow()),  # type: ignore[attr-defined]
                    odcisk_parametrow=odcisk(parametry),
                )
            )
        return tuple(wynik)
