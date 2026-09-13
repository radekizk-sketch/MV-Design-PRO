"""§11.3/9 — UPRZĄŻ PORÓWNANIA POSTACI MODELU. Mierzy, NIE wybiera.

KOD BADAWCZY — patrz `backend/research/README.md`.

PO CO. `ryzyko_postaci_modelu` mówi, GDZIE istnieje obronna alternatywa. Nie
mówi, ILE ona zmienia — a bez tej liczby „ryzyko postaci" jest obawą, nie
pomiarem, i nie da się na jej podstawie podjąć decyzji ani jej odłożyć.

CZEGO TA UPRZĄŻ NIE ROBI — i to jest wymóg zadania, nie ostrożność. NIE WYBIERA
postaci kanonicznej i nie zawiera kryterium wyboru. Zwraca zmierzone różnice
trajektorii i chwilę, w której są największe. Wybór jest decyzją
architektoniczną: obie postacie są obronne fizycznie, a różnica między nimi to
różnica STRATEGII STEROWANIA rzeczywistego przekształtnika, której producent nie
publikuje.

DLACZEGO POMIAR MUSI OBEJMOWAĆ RÓŻNE GŁĘBOKOŚCI ZAKŁÓCENIA. Bo ogranicznik
działa wyłącznie w nasyceniu. Zmierzone na porównaniu priorytetu składowej
(sieć SN z dwoma falownikami, zwarcie na SN2, trapez niejawny, krok 2 ms):

    x_f = 0,30 p.u. (zapad płytki)  ->  różnica DOKŁADNIE ZEROWA we wszystkich
                                        kanałach: ogranicznik nie jest aktywny,
                                        więc obie postacie są NIEROZRÓŻNIALNE
    x_f = 0,10 p.u. (zapad głęboki) ->  max |ΔU| = 0,0622 p.u. na zaciskach DER2

To jest cały mechanizm ryzyka postaci w dwóch liczbach: test napisany na płytkim
zakłóceniu przechodzi identycznie dla obu postaci i NICZEGO o nich nie orzeka.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass

import numpy as np

from dynamic_lab.wynik import PrzestrzenSygnalu, WynikDynamiczny

__all__ = [
    "KanalPorownania",
    "RoznicaKanalu",
    "WariantPostaci",
    "WynikPorownaniaPostaci",
    "porownaj_postacie",
]


@dataclass(frozen=True)
class KanalPorownania:
    """Jeden przebieg, na którym mierzymy różnicę między postaciami."""

    klucz: str
    element_ref: str
    przestrzen: PrzestrzenSygnalu = PrzestrzenSygnalu.WYJSCIE


@dataclass(frozen=True)
class WariantPostaci:
    """Jedna postać modelu — nazwa i sposób policzenia biegu.

    Bieg jest FUNKCJĄ, a nie gotowym wynikiem, bo uprząż musi mieć pewność, że
    oba warianty policzono TYM SAMYM zadaniem; podanie gotowych przebiegów
    pozwalałoby porównać dwa różne scenariusze i nazwać to różnicą postaci.
    """

    identyfikator: str
    opis_pl: str
    bieg: Callable[[], WynikDynamiczny]


@dataclass(frozen=True)
class RoznicaKanalu:
    """Zmierzona różnica na jednym kanale — z chwilą i obiema wartościami."""

    kanal: KanalPorownania
    maks_roznica: float
    chwila_s: float
    wartosc_a: float
    wartosc_b: float

    @property
    def rozroznialne(self) -> bool:
        """Czy różnica przekracza szum zmiennoprzecinkowy.

        Próg jest bezwzględny i ciasny (1e-12), bo „postacie nierozróżnialne"
        ma znaczyć BIT W BIT, a nie „blisko" — inaczej uprząż zacierałaby
        właśnie to, co ma pokazać.
        """
        return self.maks_roznica > 1.0e-12


@dataclass(frozen=True)
class WynikPorownaniaPostaci:
    """Wynik porównania DWÓCH postaci na JEDNYM zadaniu."""

    wariant_a: str
    wariant_b: str
    opis_zadania_pl: str
    roznice: tuple[RoznicaKanalu, ...]

    @property
    def najwieksza(self) -> RoznicaKanalu:
        return max(self.roznice, key=lambda r: r.maks_roznica)

    @property
    def postacie_nierozroznialne(self) -> bool:
        """Czy na TYM zadaniu obie postacie dają identyczne przebiegi.

        Nie znaczy „równoważne" — znaczy „to zadanie ich nie odróżnia". Różnica
        jest istotna: wniosek o równoważności z zadania, które nie aktywuje
        ogranicznika, byłby wnioskiem z nieobecności dowodu.
        """
        return not any(r.rozroznialne for r in self.roznice)

    def raport_pl(self) -> str:
        wiersze = [
            f"{self.wariant_a} vs {self.wariant_b} — {self.opis_zadania_pl}",
            "| Kanał | max|Δ| | chwila [s] | A | B |",
            "|---|---|---|---|---|",
        ]
        for r in sorted(self.roznice, key=lambda q: -q.maks_roznica):
            wiersze.append(
                f"| `{r.kanal.klucz}@{r.kanal.element_ref}` | {r.maks_roznica:.6f} | "
                f"{r.chwila_s:.3f} | {r.wartosc_a:.4f} | {r.wartosc_b:.4f} |"
            )
        if self.postacie_nierozroznialne:
            wiersze.append(
                "WNIOSEK: to zadanie NIE ODRÓŻNIA obu postaci. To nie jest dowód ich "
                "równoważności — to brak dowodu różnicy."
            )
        return "\n".join(wiersze)


def _seria(wynik: WynikDynamiczny, kanal: KanalPorownania) -> np.ndarray:
    sygnal = wynik.sygnal(kanal.klucz, kanal.element_ref, kanal.przestrzen)
    return np.asarray(sygnal.wartosci, dtype=np.float64)


def porownaj_postacie(
    wariant_a: WariantPostaci,
    wariant_b: WariantPostaci,
    *,
    kanaly: Sequence[KanalPorownania],
    opis_zadania_pl: str,
) -> WynikPorownaniaPostaci:
    """Policz OBA warianty tym samym zadaniem i zmierz różnicę kanał po kanale.

    Wspólna oś czasu jest WARUNKIEM, nie założeniem: dwa biegi o różnych osiach
    nie dają się porównać próbka po próbce, a interpolacja jednego na drugi
    mieszałaby różnicę postaci z błędem interpolacji.
    """
    if not kanaly:
        raise ValueError("Porównanie bez ani jednego kanału niczego nie mierzy.")
    wynik_a = wariant_a.bieg()
    wynik_b = wariant_b.bieg()

    for nazwa, wynik in ((wariant_a.identyfikator, wynik_a), (wariant_b.identyfikator, wynik_b)):
        if not wynik.diagnostyka.zbiegl:
            raise ValueError(
                f'Wariant „{nazwa}" nie zbiegł — porównanie postaci na biegu, który nie '
                f"jest rozwiązaniem zadanego układu, mierzyłoby błąd solvera, nie różnicę "
                f"postaci."
            )
    if len(wynik_a.czas_s) != len(wynik_b.czas_s):
        raise ValueError(
            f"Warianty mają różną liczbę próbek ({len(wynik_a.czas_s)} wobec "
            f"{len(wynik_b.czas_s)}) — to nie jest to samo zadanie."
        )
    for t_a, t_b in zip(wynik_a.czas_s, wynik_b.czas_s, strict=True):
        if not math.isclose(t_a, t_b, rel_tol=0.0, abs_tol=1.0e-12):
            raise ValueError(
                f"Osie czasu wariantów się rozjeżdżają ({t_a} wobec {t_b}) — porównanie "
                f"próbka po próbce byłoby porównaniem różnych chwil."
            )

    czas = np.asarray(wynik_a.czas_s, dtype=np.float64)
    roznice: list[RoznicaKanalu] = []
    for kanal in kanaly:
        seria_a = _seria(wynik_a, kanal)
        seria_b = _seria(wynik_b, kanal)
        roznica = np.abs(seria_a - seria_b)
        i = int(np.argmax(roznica))
        roznice.append(
            RoznicaKanalu(
                kanal=kanal,
                maks_roznica=float(roznica[i]),
                chwila_s=float(czas[i]),
                wartosc_a=float(seria_a[i]),
                wartosc_b=float(seria_b[i]),
            )
        )
    return WynikPorownaniaPostaci(
        wariant_a=wariant_a.identyfikator,
        wariant_b=wariant_b.identyfikator,
        opis_zadania_pl=opis_zadania_pl,
        roznice=tuple(roznice),
    )
