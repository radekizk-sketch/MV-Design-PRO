"""Rozniczkowanie w przod (liczby dualne) — JEDNO zrodlo prawdy pochodnych urzadzen.

PO CO TO ISTNIEJE. Protokol `kontrakty.Urzadzenie` wymaga od kazdego urzadzenia
PIECIU wzajemnie zgodnych rzeczy: `pochodne`, `jakobian_stan_stan`,
`jakobian_stan_napiecie`, `jakobian_prad_stan`, `jakobian_prad_napiecie` (plus
napiecie jalowe i jego jakobian). Maszyna klasyczna (2. rzedu, cztery stany) ma
je wyprowadzone recznie i to sie broni. Maszyna synchroniczna 6. rzedu z AVR,
regulatorem obrotow i stabilizatorem ma do JEDENASTU stanow, a przeksztaltnik
GFL osiem — reczne wyprowadzenie kilkudziesieciu blokow to nie praca
inzynierska, tylko hodowla rozjazdow: kazda poprawka rownania musi trafic w
DWA miejsca (funkcje i jakobian), a rozjazd jest niewidoczny w przebiegu
(Newton zbiega wolniej i tyle).

Dlatego rownania urzadzenia sa pisane RAZ, na liczbach dualnych: kazda wielkosc
posrednia niesie swoja wartosc i gradient wzgledem zmiennych niezaleznych
(stanow i skladowych napiecia). Pochodna jest ANALITYCZNA — regula lancuchowa
stosowana dokladnie, bez ani jednej roznicy skonczonej i bez przyrostu `h`. Nie
jest to „automatyczne rozniczkowanie zamiast wyprowadzenia": to jest
wyprowadzenie, tyle ze wykonane przez regule lancuchowa zamiast przez czlowieka
przepisujacego je do drugiej funkcji.

PREDYKATY PARAMI (CLAUDE.md, KLASA NIE INSTANCJA p. 3). Funkcja i jej jakobian
sa tu z KONSTRUKCJI jednym zrodlem prawdy — nie moga sie rozejsc, bo powstaja z
tego samego przebiegu obliczen. Niezaleznym sprawdzianem pozostaje roznica
skonczona w testach (`tests/network_model/dynamika/test_urzadzenia*.py`), ktora
nie dzieli z tym modulem ani jednej linii.

GRADIENT MOZE BYC PUSTY. `gradient=None` znaczy „ta wielkosc jest stala wzgledem
zmiennych niezaleznych". Dzieki temu ten sam kod liczy SAME WARTOSCI (wszystkie
wejscia bez gradientu — arytmetyka czysto zmiennoprzecinkowa, zero kosztu numpy)
albo wartosci Z GRADIENTEM (wejscia zaszczepione wektorami jednostkowymi). Tor
gorący `pochodne()` nie placi wiec za jakobian, ktorego nie potrzebuje.

NIECIAGLOSCI. Ogranicznik, martwa strefa i `minimum/maksimum` sa funkcjami
kawalkami gladkimi. Gradient jest liczony dla GALEZI AKTYWNEJ — w punkcie
przelaczenia pochodna jednostronna jest wybrana deterministycznie (porownania
sa nieostre w strone galezi „wewnetrznej"). To jest ta sama umowa, ktora ma
kazdy solver z ogranicznikami nienawrotnymi; testy roznicy skonczonej omijaja
punkty przelaczenia, bo tam pochodna NIE ISTNIEJE, a nie „jest inna".
"""

from __future__ import annotations

import math

import numpy as np


class Dual:
    """Liczba rzeczywista z gradientem wzgledem zmiennych niezaleznych.

    `wartosc` to liczba, `gradient` to wektor pochodnych czastkowych albo `None`
    dla wielkosci stalej. Klasa jest NIEZMIENNA: kazda operacja tworzy nowy
    obiekt, wiec wspoldzielenie gradientow miedzy wyrazeniami jest bezpieczne.
    """

    __slots__ = ("gradient", "wartosc")

    def __init__(self, wartosc: float, gradient: np.ndarray | None = None) -> None:
        self.wartosc = float(wartosc)
        self.gradient = gradient

    # -- konstruktory ----------------------------------------------------

    @staticmethod
    def stala(wartosc: float) -> Dual:
        """Wielkosc niezalezna od zmiennych rozniczkowania (gradient pusty)."""
        return Dual(wartosc)

    @staticmethod
    def zmienna(wartosc: float, indeks: int, wymiar: int) -> Dual:
        """Zmienna niezalezna nr `indeks` z przestrzeni o wymiarze `wymiar`."""
        gradient = np.zeros(wymiar, dtype=float)
        gradient[indeks] = 1.0
        return Dual(wartosc, gradient)

    def do_wektora(self, wymiar: int) -> np.ndarray:
        """Gradient jako wektor dlugosci `wymiar` (zera dla wielkosci stalej)."""
        if self.gradient is None:
            return np.zeros(wymiar, dtype=float)
        return self.gradient

    # -- arytmetyka ------------------------------------------------------

    def __repr__(self) -> str:  # pragma: no cover - diagnostyka
        return f"Dual({self.wartosc!r}, {self.gradient!r})"

    def __add__(self, inny: Dual | float) -> Dual:
        drugi = _jako_dual(inny)
        return Dual(self.wartosc + drugi.wartosc, _suma(self.gradient, drugi.gradient))

    __radd__ = __add__

    def __neg__(self) -> Dual:
        return Dual(-self.wartosc, None if self.gradient is None else -self.gradient)

    def __sub__(self, inny: Dual | float) -> Dual:
        drugi = _jako_dual(inny)
        return Dual(
            self.wartosc - drugi.wartosc,
            _suma(self.gradient, None if drugi.gradient is None else -drugi.gradient),
        )

    def __rsub__(self, inny: Dual | float) -> Dual:
        return _jako_dual(inny).__sub__(self)

    def __mul__(self, inny: Dual | float) -> Dual:
        drugi = _jako_dual(inny)
        return Dual(
            self.wartosc * drugi.wartosc,
            _suma(
                _skala(drugi.wartosc, self.gradient),
                _skala(self.wartosc, drugi.gradient),
            ),
        )

    __rmul__ = __mul__

    def __truediv__(self, inny: Dual | float) -> Dual:
        drugi = _jako_dual(inny)
        wartosc = self.wartosc / drugi.wartosc
        return Dual(
            wartosc,
            _suma(
                _skala(1.0 / drugi.wartosc, self.gradient),
                _skala(-wartosc / drugi.wartosc, drugi.gradient),
            ),
        )

    def __rtruediv__(self, inny: Dual | float) -> Dual:
        return _jako_dual(inny).__truediv__(self)


def _jako_dual(wartosc: Dual | float) -> Dual:
    return wartosc if isinstance(wartosc, Dual) else Dual(float(wartosc))


def _suma(pierwszy: np.ndarray | None, drugi: np.ndarray | None) -> np.ndarray | None:
    if pierwszy is None:
        return drugi
    if drugi is None:
        return pierwszy
    return pierwszy + drugi


def _skala(wspolczynnik: float, gradient: np.ndarray | None) -> np.ndarray | None:
    if gradient is None or wspolczynnik == 0.0:
        return None
    return wspolczynnik * gradient


# ---------------------------------------------------------------------------
# Funkcje elementarne
# ---------------------------------------------------------------------------


def kwadrat(x: Dual) -> Dual:
    """`x^2` — jeden mnoznik zamiast dwoch przejsc przez `__mul__`."""
    return Dual(x.wartosc * x.wartosc, _skala(2.0 * x.wartosc, x.gradient))


def pierwiastek(x: Dual) -> Dual:
    """`sqrt(x)`; w zerze pochodna nie istnieje, wiec zero jest bledem wolajacego."""
    if x.wartosc <= 0.0:
        raise ValueError(
            f"pierwiastek z {x.wartosc} — pochodna sqrt nie istnieje dla argumentu <= 0; "
            "wolajacy musi odciac ten przypadek nazwana odmowa, nie liczyc dalej"
        )
    wartosc = math.sqrt(x.wartosc)
    return Dual(wartosc, _skala(0.5 / wartosc, x.gradient))


def sinus(x: Dual) -> Dual:
    return Dual(math.sin(x.wartosc), _skala(math.cos(x.wartosc), x.gradient))


def cosinus(x: Dual) -> Dual:
    return Dual(math.cos(x.wartosc), _skala(-math.sin(x.wartosc), x.gradient))


def minimum(pierwszy: Dual, drugi: Dual | float) -> Dual:
    """Mniejsza z dwoch wielkosci; gradient GALEZI AKTYWNEJ (remis -> pierwsza)."""
    inny = _jako_dual(drugi)
    return pierwszy if pierwszy.wartosc <= inny.wartosc else inny


def maksimum(pierwszy: Dual, drugi: Dual | float) -> Dual:
    """Wieksza z dwoch wielkosci; gradient GALEZI AKTYWNEJ (remis -> pierwsza)."""
    inny = _jako_dual(drugi)
    return pierwszy if pierwszy.wartosc >= inny.wartosc else inny


def ogranicz(x: Dual, dol: Dual | float, gora: Dual | float) -> Dual:
    """Ogranicznik dwustronny `clamp(x, dol, gora)` z gradientem galezi aktywnej."""
    return minimum(maksimum(x, dol), gora)


def strefa_martwa(x: Dual, szerokosc: float) -> Dual:
    """Martwa strefa symetryczna o POLOWKOWEJ szerokosci `szerokosc`.

    Wewnatrz `|x| <= szerokosc` wyjscie jest zerowe (gradient zerowy), poza nia
    sygnal jest PRZESUNIETY o szerokosc strefy, nie obcięty — inaczej na
    krawedzi powstawalby skok wyjscia, ktorego zaden uklad regulacji nie ma.
    `szerokosc == 0` jest przejsciem tozsamosciowym (brak strefy).
    """
    if szerokosc <= 0.0:
        return x
    if x.wartosc > szerokosc:
        return x - szerokosc
    if x.wartosc < -szerokosc:
        return x + szerokosc
    return Dual(0.0)


# ---------------------------------------------------------------------------
# Wielkosci zespolone jako para dualnych
# ---------------------------------------------------------------------------


class Zespolona:
    """Liczba zespolona o czesciach rzeczywistej i urojonej z gradientami."""

    __slots__ = ("im", "re")

    def __init__(self, re: Dual, im: Dual) -> None:
        self.re = re
        self.im = im

    @staticmethod
    def stala(wartosc: complex) -> Zespolona:
        return Zespolona(Dual(wartosc.real), Dual(wartosc.imag))

    @property
    def wartosc(self) -> complex:
        return complex(self.re.wartosc, self.im.wartosc)

    def __add__(self, inna: Zespolona) -> Zespolona:
        return Zespolona(self.re + inna.re, self.im + inna.im)

    def __sub__(self, inna: Zespolona) -> Zespolona:
        return Zespolona(self.re - inna.re, self.im - inna.im)

    def __mul__(self, inna: Zespolona | Dual | float) -> Zespolona:
        if isinstance(inna, Zespolona):
            return Zespolona(
                self.re * inna.re - self.im * inna.im,
                self.re * inna.im + self.im * inna.re,
            )
        return Zespolona(self.re * inna, self.im * inna)

    def __truediv__(self, inna: Zespolona | Dual | float) -> Zespolona:
        if isinstance(inna, Zespolona):
            mianownik = kwadrat(inna.re) + kwadrat(inna.im)
            return Zespolona(
                (self.re * inna.re + self.im * inna.im) / mianownik,
                (self.im * inna.re - self.re * inna.im) / mianownik,
            )
        return Zespolona(self.re / inna, self.im / inna)

    def sprzezenie(self) -> Zespolona:
        return Zespolona(self.re, -self.im)

    def modul(self) -> Dual:
        """`|z|`; zero jest bledem wolajacego (pochodna modulu w zerze nie istnieje)."""
        return pierwiastek(kwadrat(self.re) + kwadrat(self.im))


def obrot(kat: Dual) -> Zespolona:
    """`exp(j*kat)` jako para (cos, sin) z gradientami."""
    return Zespolona(cosinus(kat), sinus(kat))


def moc_zespolona(napiecie: Zespolona, prad: Zespolona) -> Zespolona:
    """`S = V * conj(I)` — jedna definicja mocy pozornej dla wszystkich urzadzen."""
    return napiecie * prad.sprzezenie()


__all__ = [
    "Dual",
    "Zespolona",
    "cosinus",
    "kwadrat",
    "maksimum",
    "minimum",
    "moc_zespolona",
    "obrot",
    "ogranicz",
    "pierwiastek",
    "sinus",
    "strefa_martwa",
]
