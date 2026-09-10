"""Harmonogram zdarzeń — solver-neutralny, z deterministyczną kolejnością.

KOD BADAWCZY — patrz `backend/research/README.md`.

Defekt P0-06 audytu: produkcyjny silnik miał w kontrakcie SZEŚĆ typów zdarzeń,
z których DWA cokolwiek robiły, a zwarcie trójfazowe było stałą ``return 0.05``
— identyczną dla każdego elementu, niezależnie od miejsca zwarcia i impedancji.
Pole ``target_ref`` nie było w ogóle odczytywane.

Tutaj zdarzenie zmienia MODEL SIECI (topologię/boczniki) albo nastawę urządzenia,
a napięcia są tego skutkiem — nigdy odwrotnie. Zdarzenie, którego silnik nie
obsługuje, podnosi wyjątek zamiast zostać cicho zignorowane.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from dynamic_lab.siec import Bocznik, TopologiaSieci


class NieobslugiwaneZdarzenieError(RuntimeError):
    """Zdarzenie nie ma implementacji — świadomie głośne, nigdy ciche pominięcie."""


class Zdarzenie(Protocol):
    """Zdarzenie stosowane do modelu w chwili ``czas_s``."""

    czas_s: float
    priorytet: int
    opis: str

    def zastosuj(self, topologia: TopologiaSieci) -> TopologiaSieci:
        """Zwróć NOWĄ topologię po zastosowaniu zdarzenia."""
        ...


@dataclass(frozen=True)
class ZwarcieTrojfazowe:
    """Zwarcie TRÓJFAZOWE SYMETRYCZNE przez impedancję ``Zf`` (bocznik admitancyjny).

    ``r_f_pu``/``x_f_pu`` = 0 oznacza zwarcie metaliczne. Napięcie w miejscu
    zwarcia NIE jest zadawane — wynika z rozwiązania sieci, więc zależy od
    impedancji zwarcia, mocy zwarciowej i odległości elektrycznej odbiorcy.

    GRANICA MODELU — dlaczego to NIE jest zwarcie doziemne
    -----------------------------------------------------
    Całe laboratorium liczy w JEDNEJ macierzy ``Ybus``, czyli wyłącznie w sieci
    **składowej zgodnej** (Z1). Zwarcie niesymetryczne — jednofazowe doziemne,
    dwufazowe, dwufazowe z ziemią — wymaga rozwiązania układu ze składowymi
    **przeciwną (Z2) i zerową (Z0)** oraz połączenia sieci składowych zgodnie
    z rodzajem zwarcia; ani Z2, ani Z0 w tym modelu nie istnieją.

    Bocznik dodany do sieci zgodnej **reprezentuje wyłącznie zwarcie symetryczne**.
    Poprzednia nazwa tej klasy (``ZwarcieTrojfazowe``) sugerowała zwarcie
    jednofazowe i była **semantycznie błędna** — model nie ma czym go policzyć.
    Zmiana nazwy jest naprawą tej pomyłki, nie kosmetyką: nazwa typu jest tu
    jedyną informacją, która trafia do śladu wyniku (``zdarzenia[].typ``).

    Zwarcia niesymetryczne w tym prototypie są **nieobsługiwane** — nie ma dla
    nich zaślepki zwracającej „coś", bo zaślepka byłaby fabrykacją.
    """

    czas_s: float
    szyna: str
    r_f_pu: float = 0.0
    x_f_pu: float = 0.0
    priorytet: int = 10
    opis: str = "zwarcie trójfazowe symetryczne"

    def zastosuj(self, topologia: TopologiaSieci) -> TopologiaSieci:
        z_f = complex(self.r_f_pu, self.x_f_pu)
        if abs(z_f) < 1.0e-9:
            # Zwarcie metaliczne — bardzo duża admitancja bocznikowa.
            y_f = complex(1.0e6, 0.0)
        else:
            y_f = 1.0 / z_f
        return topologia.z_bocznikiem(Bocznik(szyna=self.szyna, g_pu=y_f.real, b_pu=y_f.imag))


@dataclass(frozen=True)
class ZdjecieZwarcia:
    """Wyłączenie zwarcia — usuwa boczniki zwarciowe ze wskazanej szyny."""

    czas_s: float
    szyna: str
    priorytet: int = 20
    opis: str = "zdjęcie zwarcia"

    def zastosuj(self, topologia: TopologiaSieci) -> TopologiaSieci:
        return topologia.bez_bocznikow_na(self.szyna)


@dataclass(frozen=True)
class WylaczenieGalezi:
    """Otwarcie wyłącznika / wyłączenie linii — REALNA zmiana topologii."""

    czas_s: float
    od_szyny: str
    do_szyny: str
    priorytet: int = 30
    opis: str = "wyłączenie gałęzi"

    def zastosuj(self, topologia: TopologiaSieci) -> TopologiaSieci:
        return topologia.z_wylaczona_galezia(self.od_szyny, self.do_szyny)


@dataclass
class HarmonogramZdarzen:
    """Uporządkowany harmonogram z deterministycznym rozstrzyganiem równoczesności.

    Kolejność: ``(czas_s, priorytet, indeks_wstawienia)``. Trzeci klucz gwarantuje
    stabilność przy identycznym czasie I priorytecie — bez niego kolejność
    zależałaby od implementacji sortowania i wynik przestałby być powtarzalny.
    """

    zdarzenia: list[Zdarzenie]

    def __post_init__(self) -> None:
        self._uporzadkowane = sorted(
            enumerate(self.zdarzenia),
            key=lambda para: (para[1].czas_s, para[1].priorytet, para[0]),
        )

    def do_chwili(self, od_s: float, do_s: float) -> list[Zdarzenie]:
        """Zdarzenia w przedziale ``(od_s, do_s]`` w kolejności deterministycznej."""
        return [z for _, z in self._uporzadkowane if od_s < z.czas_s <= do_s]

    def czasy(self) -> tuple[float, ...]:
        return tuple(z.czas_s for _, z in self._uporzadkowane)


@dataclass(frozen=True)
class ZwarcieNiesymetryczne:
    """Zwarcie niesymetryczne — JAWNIE NIEOBSŁUGIWANE, nigdy ciche przybliżenie.

    Istnieje po to, żeby próba policzenia zwarcia 1F/2F/2FE kończyła się
    **głośnym błędem**, a nie podstawieniem zwarcia trójfazowego „bo i tak
    podobne". Defekt P0-06 audytu polegał między innymi na tym, że kontrakt
    obiecywał sześć typów zdarzeń, a dwa cokolwiek robiły — reszta była cicha.

    Aby to policzyć, model musiałby nieść ``Ybus`` składowej przeciwnej i zerowej
    oraz regułę łączenia sieci składowych. To jest zakres, którego prototyp NIE
    ma i którego nie udaje.
    """

    czas_s: float
    szyna: str
    rodzaj: str = "1F"
    priorytet: int = 10
    opis: str = "zwarcie niesymetryczne (nieobsługiwane)"

    def zastosuj(self, topologia: TopologiaSieci) -> TopologiaSieci:
        raise NieobslugiwaneZdarzenieError(
            f"Zwarcie niesymetryczne „{self.rodzaj}" + "” na szynie "
            f"{self.szyna} wymaga sieci składowych Z1/Z2/Z0; laboratorium liczy "
            "wyłącznie w składowej zgodnej. Model NIE podstawia zwarcia "
            "trójfazowego w jego miejsce — to byłaby fabrykacja."
        )
